import { expect, test, type Page } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

// #331 punti 2-3 — IL GESTO PRINCIPALE DELLA SCHERMATA D'ASTA NON STA SOTTO LA
// PIEGA, E QUESTA SPEC È LA MISURA CHE LO TIENE LÌ.
//
// LA LEZIONE CHE HA PRODOTTO QUESTO FILE. Ogni corsia misurava il proprio
// pannello; nessuna misurava la schermata risultante. Con Chromium vero, pool
// sintetico da 532 righe e log d'asta vuoto:
//
//   albero                     altezza pagina   «ASSEGNA A» a   1440×900   1920×1080
//   produzione                 1865px           1154px          254 sotto  74 sotto
//   ramo di lavoro             1711px           1020px          120 sotto  sopra
//   + pannello fasce (PR #18)  1954px           1262px          362 sotto  182 sotto
//
// Il pannello delle fasce era corretto in sé e riportava la schermata PEGGIO
// della produzione a entrambe le risoluzioni. Senza una misura asserita la
// crescita della schermata è invisibile: si vede solo la prossima volta che
// qualcuno apre il sito durante un'asta dal vivo, con due secondi per decidere.
//
// COSA ASSERISCE, E PERCHÉ IN QUEST'ORDINE. Le tre famiglie sono complementari
// e ciascuna diventa rossa da sola:
//
//  a. GEOMETRIA — l'intero gesto (menu squadra, campo prezzo, «Registra
//     acquisto») sta dentro la finestra a scroll 0, a 1440×900 e a 1920×1080,
//     e l'hit-test sul centro del bottone restituisce IL BOTTONE: dentro la
//     finestra ma coperto da un'altra scheda non è «raggiungibile».
//
//  b. ORDINE — questa è l'asserzione che regge l'AGGIUNTA SUCCESSIVA, e vale
//     più del numero. Sopra il gesto sta soltanto la riga d'identità del
//     giocatore: ogni altro pannello della schermata gli sta sotto. Finché è
//     vero, un pannello nuovo — e ne sta arrivando un altro — non può spingere
//     il gesto fuori dallo schermo, quale che sia la sua altezza. Un budget di
//     pixel da solo si accomoderebbe a ogni crescita, un pixel per volta.
//
//  c. RIDURRE NON TOGLIE INFORMAZIONE (vincolo esplicito di Pico, #333). Le
//     tre celle di ruolo che la scheda non mostra più, il censimento MERCATO e
//     la nota metodologica sono nel DOM da chiusi, tornano visibili con UN
//     gesto, e quel gesto è un <button> con aria-expanded/aria-controls
//     raggiungibile da tastiera. E con il dettaglio APERTO il gesto principale
//     resta sopra la piega: aprire un dettaglio non ricrea il difetto.
//
// LA FIXTURE NON PUÒ MENTIRE SULLA SCALA: 532 righe, la stessa scala del
// listone privato (vedi e2e/call-screen-order.spec.ts), tutte sintetiche. La
// guardia di rete aborta e registra qualunque altra richiesta.

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const ROLES = ["P", "D", "C", "A"] as const;

/** Pool sintetico della SCALA del listone privato (532 righe), zero dati reali. */
function syntheticPoolOfSize(rows: number): readonly ListonePlayer[] {
  return Array.from({ length: rows }, (_, i) => ({
    name: `Sintetico ${String(i + 1).padStart(3, "0")}`,
    role: ROLES[i % ROLES.length]!,
    club: `Club${(i % 20) + 1}`,
    quotation: 1 + (i % 40),
  }));
}

const LARGE_POOL = syntheticPoolOfSize(532);

/** Un attaccante, così il ruolo chiamato non è il primo dell'elenco. */
const CALLED = "Sintetico 004";

// IL BUDGET, E DA DOVE VIENE IL NUMERO. Misurato 430px (titolo «ASSEGNA A»,
// bordo alto nel documento) su questo stesso albero, con questa stessa fixture.
// La soglia sta a 560px: circa 130px di margine, cioè lo spazio di un pannello
// piccolo aggiunto DENTRO la scheda — non abbastanza per farci stare una
// sezione intera senza accorgersene. Sotto la piega più bassa che ci interessa
// (900px) resta comunque un abisso: il budget morde molto prima che il difetto
// torni, che è il punto di un budget.
const ASSIGN_HEADING_BUDGET_PX = 560;

/** I pannelli che devono stare SOTTO il gesto. Ognuno è un id già esistente. */
const PANELS_BELOW = [
  "#tier-band-panel",
  "#war-board-mini",
  "#player-insight-panel",
  "#opponent-precedents-panel",
] as const;

interface GestureGeometry {
  readonly headingTop: number;
  readonly teamInViewport: boolean;
  readonly priceInViewport: boolean;
  readonly buttonInViewport: boolean;
  readonly buttonHitsSelf: boolean;
  readonly viewportHeight: number;
  readonly pageHeight: number;
  readonly noHorizontalScroll: boolean;
}

/**
 * Il rettangolo del gesto a scroll 0. `headingTop` è la posizione ASSOLUTA nel
 * documento del titolo «ASSEGNA A» — la stessa grandezza delle misure di
 * riferimento in testa a questo file, così i numeri sono confrontabili con
 * quelli e non con una convenzione inventata qui.
 */
async function gestureGeometry(page: Page): Promise<GestureGeometry> {
  await page.evaluate(() => window.scrollTo(0, 0));
  return page.evaluate(() => {
    const heading = [...document.querySelectorAll(".panel-title")].find(
      (el) => (el.textContent ?? "").trim() === "ASSEGNA A",
    );
    if (heading === undefined) throw new Error("gesto: nessun titolo «ASSEGNA A»");
    const button = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Registra acquisto",
    );
    if (button === undefined) throw new Error("gesto: nessun bottone «Registra acquisto»");
    const team = document.getElementById("assign-team");
    const price = document.getElementById("assign-price");
    if (team === null || price === null) throw new Error("gesto: manca un campo del form");

    // Tolleranza di un pixel sul bordo basso, come già fanno le altre misure
    // geometriche di questa suite: il layout produce valori sub-pixel e un
    // confronto esatto deciderebbe il verde su un decimo di pixel.
    const inside = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight + 1;
    };
    const br = button.getBoundingClientRect();
    const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);

    return {
      headingTop: Math.round(heading.getBoundingClientRect().top + window.scrollY),
      teamInViewport: inside(team),
      priceInViewport: inside(price),
      buttonInViewport: inside(button),
      buttonHitsSelf: hit !== null && (hit === button || button.contains(hit)),
      viewportHeight: window.innerHeight,
      pageHeight: Math.round(document.documentElement.scrollHeight),
      noHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  });
}

/** Posizione assoluta nel documento del bordo superiore di un elemento. */
async function documentTop(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) throw new Error(`ordine: nessun elemento per ${sel}`);
    return el.getBoundingClientRect().top + window.scrollY;
  }, selector);
}

async function boot(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto("/");
  // Ogni giro riparte da un'asta vuota: il log persiste attraverso un goto(),
  // e uno stato residuo cambierebbe le altezze che questa spec misura.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
}

/** Apre il momento live sul giocatore chiamato, dalla schermata di chiamata. */
async function callPlayer(page: Page): Promise<void> {
  await page.getByText(CALLED, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#assign-price")).toBeVisible();
}

test("«ASSEGNA A» è raggiungibile senza scorrere a 1440×900 e a 1920×1080", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, externalRequests);

  for (const viewport of VIEWPORTS) {
    const where = `${viewport.width}×${viewport.height}`;
    await boot(page, viewport);
    await callPlayer(page);

    const g = await gestureGeometry(page);

    // a. GEOMETRIA — tutte e tre le parti del gesto, dentro la finestra, senza
    //    scorrere. Non «il blocco esiste»: un blocco che esiste 800px più in
    //    basso esisteva anche prima.
    expect(g.teamInViewport, `${where}: il menu squadra è in vista senza scorrere`).toBe(true);
    expect(g.priceInViewport, `${where}: il campo prezzo è in vista senza scorrere`).toBe(true);
    expect(g.buttonInViewport, `${where}: «Registra acquisto» è in vista senza scorrere`).toBe(
      true,
    );
    // …e nel punto in cui si vede il bottone c'è LUI, non una scheda sopra.
    expect(g.buttonHitsSelf, `${where}: il centro del bottone risponde al bottone`).toBe(true);

    // Il budget di altezza, con il numero misurato nel messaggio: un fallimento
    // deve dire DI QUANTO si è sforato, non solo che si è sforato.
    expect(
      g.headingTop,
      `${where}: «ASSEGNA A» comincia a ${Math.round(g.headingTop)}px (pagina ${g.pageHeight}px, finestra ${g.viewportHeight}px)`,
    ).toBeLessThanOrEqual(ASSIGN_HEADING_BUDGET_PX);

    // Nessuno scorrimento laterale introdotto dalla scheda.
    expect(g.noHorizontalScroll, `${where}: nessuno scorrimento orizzontale`).toBe(true);
  }

  expect(externalRequests).toEqual([]);
});

test("sopra il gesto c'è solo il giocatore chiamato: la schermata può crescere sotto", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, externalRequests);

  await boot(page, VIEWPORTS[0]);
  await callPlayer(page);

  // b. ORDINE. È questa l'asserzione che regge l'aggiunta successiva: finché
  //    ogni pannello sta SOTTO il gesto, la sua altezza non lo riguarda.
  const heading = (await gestureGeometry(page)).headingTop;
  for (const panel of PANELS_BELOW) {
    const top = await documentTop(page, panel);
    expect(
      top,
      `${panel} sta a ${Math.round(top)}px e «ASSEGNA A» a ${heading}px: un pannello sopra il gesto lo spinge giù quando cresce`,
    ).toBeGreaterThan(heading);
  }

  // E il gesto sta dentro la scheda del giocatore, non in un blocco a sé: è la
  // struttura da cui discende tutto il resto (#331 punti 2-3).
  expect(
    await page.evaluate(() => document.querySelector("#call-card #assign-block") !== null),
    "il blocco ASSEGNA A vive dentro la scheda del giocatore",
  ).toBe(true);
  expect(
    await page.evaluate(() => document.querySelector("#call-card #moment-facts-panel") !== null),
    "MOMENTO DELL'ASTA vive dentro la scheda del giocatore",
  ).toBe(true);

  expect(externalRequests).toEqual([]);
});

test("ridurre non toglie: gli altri ruoli e il mercato sono dietro UN gesto, nel DOM", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, externalRequests);

  await boot(page, VIEWPORTS[0]);
  await callPlayer(page);

  const toggle = page.locator("#moment-facts-toggle");
  const detail = page.locator("#moment-facts-detail");

  // 1. CHIUSO DI DEFAULT, MA NEL DOM. Le quattro celle di ruolo sono ancora
  //    quattro: una nella scheda, tre dietro il gesto. Nessuna è stata rimossa.
  await expect(detail).toBeHidden();
  await expect(page.locator(".moment-scarcity__cell")).toHaveCount(4);
  await expect(page.locator(".moment-scarcity__cell--called")).toHaveCount(1);
  // Il ruolo chiamato è un attaccante: la cella visibile è la sua.
  await expect(page.locator("#moment-scarcity-A")).toBeVisible();
  for (const role of ["P", "D", "C"]) {
    await expect(page.locator(`#moment-scarcity-${role}`)).toHaveCount(1);
    await expect(page.locator(`#moment-scarcity-${role}`)).toBeHidden();
  }
  // Il censimento MERCATO e la nota metodologica: presenti, con i loro numeri.
  await expect(page.locator("#moment-market-credits")).toHaveText("4000");
  await expect(page.locator("#moment-market-slots")).toHaveText("224");
  await expect(page.locator("#moment-facts-note")).toContainText("nessun dato di modello");

  // 2. IL GESTO DICE COSA CONTIENE PRIMA DI APRIRLO, ed è cablato per
  //    l'accessibilità: aria-expanded/aria-controls, non solo un cursore.
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAttribute("aria-controls", "moment-facts-detail");
  await expect(toggle).toContainText("altri tre ruoli");
  await expect(toggle).toContainText("mercato");

  // 3. UN GESTO SOLO, E DA TASTIERA. Invio sul controllo a fuoco, non un click.
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(detail).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  for (const role of ["P", "D", "C"]) {
    await expect(page.locator(`#moment-scarcity-${role}`)).toBeVisible();
  }
  await expect(page.locator("#moment-market-basis")).toBeVisible();
  // Il fuoco resta sul controllo che ora porta il nuovo aria-expanded: render()
  // ricostruisce l'albero, e senza il ripristino la tastiera finirebbe sul body.
  await expect(toggle).toBeFocused();

  // 4. APRIRE NON RICREA IL DIFETTO. Con il dettaglio aperto il gesto
  //    principale resta interamente in vista a entrambe le risoluzioni: chi
  //    consulta gli altri ruoli non perde il bottone con cui registra.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const g = await gestureGeometry(page);
    expect(
      g.buttonInViewport,
      `${viewport.width}×${viewport.height}: col dettaglio aperto «Registra acquisto» resta in vista (comincia a ${g.headingTop}px)`,
    ).toBe(true);
    expect(g.buttonHitsSelf).toBe(true);
  }

  // 5. RICHIUDIBILE, e il richiuso torna a essere quello di partenza.
  await page.setViewportSize(VIEWPORTS[0]);
  await page.locator("#moment-facts-toggle").click();
  await expect(page.locator("#moment-facts-detail")).toBeHidden();
  await expect(page.locator(".moment-scarcity__cell")).toHaveCount(4);

  expect(externalRequests).toEqual([]);
});

test("il gesto funziona da dove sta: un acquisto si registra senza scorrere", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, externalRequests);

  await boot(page, VIEWPORTS[0]);
  await callPlayer(page);

  // La prova che la geometria non è cosmetica: senza mai scorrere la pagina, il
  // giro completo — squadra, prezzo, registrazione — arriva in fondo e lo stato
  // cambia davvero.
  await page.locator("#assign-team").selectOption("Io");
  await page.locator("#assign-price").fill("30");
  expect(await page.evaluate(() => window.scrollY), "nessuno scorrimento fin qui").toBe(0);
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#search-player")).toBeVisible();
  // Tornati alla chiamata, la fascia critica porta la spesa registrata.
  await expect(page.locator("#critical-spent")).toHaveText("30 cr");

  expect(externalRequests).toEqual([]);
});

import { expect, test, type Page } from "@playwright/test";
import { E2E_PURCHASE_PRICE, E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

// LA FASCIA CRITICA È UNA BANDA DELL'INTESTAZIONE, E SOLO NELLA CHIAMATA.
//
// #331 punto 5 — feedback di Pico sul prodotto reale, dopo la promozione in
// produzione. Tre richieste, tre guardie qui dentro:
//
//  1. TUTTI I COMPONENTI SU UNA RIGA SOLA. Prima erano due: quattro metriche
//     più una riga separata a piena larghezza con l'avanzamento rosa per
//     ruolo (`.critical-roster`, `flex: 1 1 100%`). Misurata: 129px a 1280,
//     173,5px a 390. Qui si asserisce la geometria vera — una sola banda
//     verticale — non l'assenza di una classe.
//  2. LARGA QUANTO L'INTESTAZIONE E ATTACCATA ALL'INTESTAZIONE. Prima era una
//     scheda fluttuante dentro la colonna da 1200px: a 1280 larga 1152 e
//     staccata di 20px dal bordo dell'header. Qui si confronta il rettangolo
//     della fascia con quello della `.topbar`, sul DOM vivo.
//  3. VISIBILE SOLO NELLA SCHERMATA DI CHIAMATA. Prima era montata in
//     renderAsta() prima dello switch fra i due momenti, quindi si vedeva in
//     entrambi.
//
// E UN VINCOLO CHE NON VIENE DA UNA RICHIESTA MA DA UN LIMITE: ridurre non
// deve togliere informazione. "Una riga sola" non autorizza a eliminare
// l'avanzamento rosa per ruolo né alcuna delle quattro metriche. Il terzo
// test è la guardia che lo impedisce: le quattro pastiglie di ruolo restano
// VISIBILI sulla riga, e il dettaglio (barre con role="progressbar" e
// inviluppo di budget per ruolo) resta raggiungibile con un gesto.
//
// Tutte le righe sono sintetiche e il network guard aborta qualunque altra
// cosa.

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
] as const;

/** Ogni ruolo, nell'ordine di ROLES, con la sua rosa obbligatoria a rosa
 *  vuota e l'etichetta con cui la barra si annuncia (ROLE_LABELS). */
const ROLE_PROGRESS: readonly (readonly [string, string, string])[] = [
  ["P", "0/3", "Portieri"],
  ["D", "0/9", "Difensori"],
  ["C", "0/9", "Centrocampisti"],
  ["A", "0/7", "Attaccanti"],
];

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#role-scarcity-panel")).toBeVisible();
}

/** Apre il momento d'asta sul giocatore bersaglio, dalla chiamata. */
async function callTarget(page: Page): Promise<void> {
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#assign-price")).toBeVisible();
}

type Band = {
  readonly strip: DOMRect;
  readonly header: DOMRect;
  /** Estensione verticale complessiva dei figli della riga. */
  readonly rowSpan: number;
  /** Altezza del figlio più alto: se la riga è una sola, rowSpan ≈ questa. */
  readonly tallestChild: number;
  readonly children: number;
};

async function measureBand(page: Page): Promise<Band> {
  return page.evaluate(() => {
    const strip = document.getElementById("critical-auction-strip")!;
    const header = document.querySelector(".topbar")!;
    const kids = Array.from(strip.querySelectorAll(".critical-strip__row > *")).map((el) =>
      el.getBoundingClientRect(),
    );
    return {
      strip: strip.getBoundingClientRect().toJSON() as DOMRect,
      header: header.getBoundingClientRect().toJSON() as DOMRect,
      rowSpan: Math.max(...kids.map((r) => r.bottom)) - Math.min(...kids.map((r) => r.top)),
      tallestChild: Math.max(...kids.map((r) => r.height)),
      children: kids.length,
    };
  });
}

test("la fascia critica è larga quanto l'intestazione, attaccata a essa e su una riga sola", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await boot(page);

    const band = await measureBand(page);
    const where = `@${viewport.width}px`;

    // LARGA QUANTO L'INTESTAZIONE: stessi bordi sinistro e destro, non "quasi".
    // Prima: 1152px contro 1280 a schermo largo, perché viveva dentro
    // .screen-container (max-width 1200 + 24px di padding).
    expect(band.strip.x, `bordo sinistro ${where}`).toBe(band.header.x);
    expect(band.strip.width, `larghezza ${where}`).toBe(band.header.width);

    // ATTACCATA ALL'INTESTAZIONE: il bordo superiore della fascia È il bordo
    // inferiore dell'header. Prima c'erano 20px di pagina in mezzo.
    expect(band.strip.y - (band.header.y + band.header.height), `distacco dall'header ${where}`).toBeLessThanOrEqual(1);

    // Cinque gruppi sulla riga: Budget, Spesi, Slot, avanzamento rosa, max
    // bid. Se qualcuno ne toglie uno, questo conteggio se ne accorge prima
    // che se ne accorga l'occhio.
    expect(band.children, `gruppi sulla riga ${where}`).toBe(5);

    if (viewport.width >= 768) {
      // UNA RIGA SOLA: tutti i gruppi stanno nella stessa banda verticale.
      // Se l'avanzamento rosa tornasse a prendersi una riga tutta sua,
      // rowSpan raddoppierebbe e questo confronto fallirebbe.
      expect(band.rowSpan, `estensione verticale dei gruppi ${where}`).toBeLessThanOrEqual(
        band.tallestChild + 1,
      );
      // E la banda resta bassa in assoluto: 39px misurati, 129px prima.
      expect(band.strip.height, `altezza della fascia ${where}`).toBeLessThanOrEqual(56);
    } else {
      // A 390px cinque etichette e quattro pastiglie non stanno su una riga a
      // corpo leggibile: la fascia va a capo invece di comprimersi sotto la
      // soglia di lettura o di farsi scorrere di lato. Resta comunque meno
      // della metà di quanto occupava prima (85px misurati contro 173,5px).
      expect(band.strip.height, `altezza della fascia ${where}`).toBeLessThanOrEqual(100);
    }

    // La pagina non scorre di lato per colpa di una banda a piena larghezza.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `nessuno scorrimento orizzontale ${where}`,
    ).toBe(true);
  }

  expect(externalRequests).toEqual([]);
});

test("la fascia critica c'è nella schermata di chiamata e NON in quella d'asta", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await boot(page);

    const strip = page.locator("#critical-auction-strip");
    await expect(strip, `chiamata @${viewport.width}px`).toBeVisible();

    // MOMENTO D'ASTA: la fascia non deve esserci. Non "nascosta": non montata.
    await callTarget(page);
    await expect(page.locator("#moment-facts-panel")).toBeVisible();
    await expect(strip, `momento asta @${viewport.width}px`).toHaveCount(0);
    // …e nessuno dei suoi pezzi resta indietro a occupare spazio.
    await expect(page.locator("#critical-roster")).toHaveCount(0);
    await expect(page.locator("#critical-max-bid")).toHaveCount(0);
    await expect(page.locator("#critical-roster-detail")).toHaveCount(0);

    // Tornando indietro la fascia torna: è la chiamata la sua schermata.
    await page.getByText("← Indietro alla ricerca").click();
    await expect(strip, `ritorno alla chiamata @${viewport.width}px`).toBeVisible();

    // E ci torna anche per la strada lunga: un acquisto registrato riporta
    // alla chiamata, e lì la fascia deve essere di nuovo montata e aggiornata.
    await callTarget(page);
    await expect(strip).toHaveCount(0);
    await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
    await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
    await expect(strip, `dopo l'acquisto @${viewport.width}px`).toBeVisible();
    await expect(page.locator("#critical-spent")).toHaveText(`${E2E_PURCHASE_PRICE} cr`);
  }

  expect(externalRequests).toEqual([]);
});

test("ridurre non toglie: l'avanzamento rosa per ruolo resta sulla riga, il dettaglio a un gesto", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.setViewportSize({ width: 1280, height: 720 });
  await boot(page);

  // 1. LE QUATTRO METRICHE, VISIBILI. Nessuna è stata sacrificata alla riga.
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  await expect(page.locator("#critical-spent")).toHaveText("0 cr");
  await expect(page.locator("#critical-slots")).toHaveText("28");
  await expect(page.locator("#critical-max-bid")).toContainText("473 cr");

  // 2. L'AVANZAMENTO ROSA PER RUOLO, VISIBILE SULLA RIGA. Quattro pastiglie,
  //    una per ruolo, ciascuna col suo filled/total. `toBeVisible` e non
  //    `toContainText`: un elemento nascosto conserva il textContent, e una
  //    guardia che passa su un DOM invisibile non è una guardia.
  const roster = page.locator("#critical-roster");
  await expect(roster).toBeVisible();
  const pills = roster.locator(".critical-role-pill");
  await expect(pills).toHaveCount(4);
  // Per indice, non per testo: D e C valgono entrambi 0/9, e un filtro sul
  // testo passerebbe anche se un ruolo sparisse e un altro comparisse due
  // volte. L'ordine è quello di ROLES (P, D, C, A) in packages/engine.
  for (const [index, [role, progress]] of ROLE_PROGRESS.entries()) {
    const pill = pills.nth(index);
    await expect(pill, `pastiglia ${role}`).toBeVisible();
    await expect(pill.locator(".role-chip"), `ruolo in posizione ${index}`).toHaveText(role);
    await expect(pill.locator("em"), `avanzamento ${role}`).toHaveText(progress);
  }

  // 3. IL DETTAGLIO PER RUOLO, A UN GESTO. Chiuso di default, ma nel DOM e
  //    annunciato (aria-expanded/aria-controls). Quando si apre porta le
  //    quattro barre di avanzamento — con il loro role="progressbar" e i
  //    valori — e l'inviluppo di budget per ruolo (issue #265 item #1).
  const detail = page.locator("#critical-roster-detail");
  await expect(detail).toBeHidden();
  await expect(roster).toHaveAttribute("aria-expanded", "false");
  await expect(roster).toHaveAttribute("aria-controls", "critical-roster-detail");
  await roster.click();
  await expect(roster).toHaveAttribute("aria-expanded", "true");
  await expect(detail).toBeVisible();

  const bars = detail.getByRole("progressbar");
  await expect(bars).toHaveCount(4);
  for (const [role, progress, label] of ROLE_PROGRESS) {
    // Per nome accessibile, non per posizione: la barra è ciò che uno screen
    // reader legge, e il suo nome è il ruolo.
    const bar = detail.getByRole("progressbar", { name: label, exact: true });
    await expect(bar, `barra ${role}`).toBeVisible();
    await expect(bar).toHaveAttribute("aria-valuenow", "0");
    await expect(bar).toHaveAttribute("aria-valuemax", progress.split("/")[1]!);
    await expect(page.locator(`#critical-role-plan-${role}`)).toBeVisible();
  }

  // Il gesto è reversibile e lo stato sopravvive a un re-render (la fascia
  // viene ricostruita da zero a ogni battuta di tasto).
  await page.locator("#search-player").fill(E2E_TARGET_PLAYER.name.slice(0, 4));
  await expect(detail).toBeVisible();
  await expect(roster).toHaveAttribute("aria-expanded", "true");
  await page.locator("#search-player").fill("");
  await roster.click();
  await expect(detail).toBeHidden();

  // 4. L'AVANZAMENTO SEGUE IL LOG, non è una decorazione: dopo un acquisto di
  //    ruolo A la pastiglia A passa a 1/7 e le altre restano ferme.
  await callTarget(page);
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(roster).toBeVisible();
  await expect(pills.nth(3).locator("em"), "attaccanti dopo l'acquisto").toHaveText("1/7");
  await expect(pills.nth(0).locator("em"), "portieri, invariati").toHaveText("0/3");
  await expect(pills.nth(1).locator("em"), "difensori, invariati").toHaveText("0/9");
  await expect(pills.nth(2).locator("em"), "centrocampisti, invariati").toHaveText("0/9");

  expect(externalRequests).toEqual([]);
});

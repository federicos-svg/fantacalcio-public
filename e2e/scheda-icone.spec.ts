import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  ICONE_SCHEDA_CON_PAGELLA,
  ICONE_SCHEDA_PIENA,
  ICONE_SCHEDA_SCONSIGLIATO,
  ICONE_SCHEDA_SENZA_RANGO,
  ICONE_SCHEDA_SORPRESA,
  ICONE_SCHEDA_SPENTA,
  ICONE_SCHEDA_TRE_NOMI,
  SCHEDA_CLUB,
  SCHEDA_PLAYER,
  schedeDeposit,
} from "./fixtures/synthetic-schede.js";
import { AA_NORMAL_TEXT, installSyntheticNetworkGuard, measureAllText } from "./helpers.js";
import type { ExpertScheda } from "../src/expertScheda.js";

// LE CINQUE ICONE ACCANTO AL RADAR, SUL DOM VIVO.
//
// Costruttori e ragioni: src/ui/schedaIcone.ts. Qui si prova ciò che solo il
// browser può dire, e ogni famiglia esiste per un vincolo dichiarato:
//
//  a. ACCESO E SPENTO. Quattro icone sempre presenti, accese quando la scheda
//     dichiara il segnale e spente — con la cornice tratteggiata e il glifo in
//     solo contorno — quando non lo dichiara. Lo stato si legge SENZA IL
//     COLORE, e qui lo si verifica sui pixel: `border-style` e `fill` resi.
//  a-bis. IL POSTO NELLA FILA. Rigori, punizioni e angoli sono file ORDINATE:
//     ciascuna casella porta il proprio numero, e sono tre numeri diversi
//     perché uno solo non direbbe di quale fila parla. La pastiglia c'è SOLO
//     dove la scheda dichiara l'ordine, e sta DENTRO la casella: la striscia
//     non cresce di un pixel e non apre scorrimento a 390px.
//  b. L'ICONA DELLE LISTE. Tre stati, tre disegni diversi, tre colori diversi; e
//     assente quando il giocatore non è in nessuna delle tre liste — che è il
//     comportamento fail-closed richiesto, visto che due delle tre liste il
//     lato privato non le produce ancora.
//  c. IL BALLOTTAGGIO. I nomi degli altri, con la loro quota, raggiungibili
//     col MOUSE, con la TASTIERA e col DITO. Questa schermata si usa durante
//     un'asta, spesso da telefono: l'hover da solo non basterebbe.
//  d. IL CONTRASTO. Con la stessa spazzata dell'app (measureAllText) e la
//     stessa soglia (AA_NORMAL_TEXT): i colori nuovi non esistono — verde, blu
//     e rosso sono i token che base.css già dichiara — ma la misura si fa lo
//     stesso, sui pixel resi, in tutti e tre gli stati della quarta icona.
//  e. LA GEOMETRIA. Le icone stanno nella colonna del radar e ci stanno in UNA
//     RIGA: alle tre larghezze di riferimento il pannello non guadagna
//     scorrimento orizzontale e il blocco resta dentro i tetti che
//     e2e/pagella-radar.spec.ts gli impone.
//
// Tutto sintetico: pool, schede, nomi e quote sono inventati, e la guardia di
// rete aborta qualunque richiesta che non sia same-origin.

const SCHEDE_PATH = "/api/schede";
const TARGET = SYNTHETIC_LISTONE_POOL.find((p) => p.name === SCHEDA_PLAYER)!;

const STRISCIA = "#player-insight-icone";
const RIGORISTA = "#player-insight-icona-rigorista";
const PUNIZIONI = "#player-insight-icona-punizioni";
const ANGOLI = "#player-insight-icona-angoli";
const BALLOTTAGGIO = "#player-insight-icona-ballottaggio";
const LISTA = "#player-insight-icona-lista";

async function boot(
  page: Page,
  context: BrowserContext,
  schede: readonly ExpertScheda[],
): Promise<string[]> {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await context.route(`**${SCHEDE_PATH}`, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: schedeDeposit(schede) }),
  );
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
  return externalRequests;
}

async function call(page: Page, name: string): Promise<void> {
  await page.getByText(name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#player-insight-panel")).toBeVisible();
}

/** Il colore reso del glifo di un'icona, cioè quello che l'occhio vede. */
function glifoColore(icona: Locator): Promise<string> {
  return icona.locator(".scheda-icona__glifo").evaluate((el) => getComputedStyle(el).color);
}

/** Il tracciato SVG di un'icona: due icone diverse devono disegnare diverso. */
function disegno(icona: Locator): Promise<string> {
  return icona.locator(".scheda-icona__glifo").innerHTML();
}

// ── a. ACCESO E SPENTO ───────────────────────────────────────────────────────

test("le quattro icone si accendono quando il segnale c'è e si spengono quando non c'è", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [ICONE_SCHEDA_PIENA]);
  await call(page, TARGET.name);

  await expect(page.locator(STRISCIA)).toBeVisible();
  for (const sel of [RIGORISTA, PUNIZIONI, ANGOLI, BALLOTTAGGIO]) {
    await expect(page.locator(sel), `${sel} acceso`).toHaveAttribute("data-acceso", "si");
  }

  // Stessa schermata, scheda che non dichiara nulla: le tre icone RESTANO —
  // una casella che sparisce non si distingue da una che non è mai esistita —
  // e sono tutte spente.
  await context.unroute(`**${SCHEDE_PATH}`);
  await context.route(`**${SCHEDE_PATH}`, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: schedeDeposit([ICONE_SCHEDA_SPENTA]),
    }),
  );
  await page.goto("/");
  await expect(page.locator("#search-player")).toBeVisible();
  await call(page, TARGET.name);

  await expect(page.locator(`${STRISCIA} > li`)).toHaveCount(4);
  for (const sel of [RIGORISTA, PUNIZIONI, ANGOLI, BALLOTTAGGIO]) {
    await expect(page.locator(sel), `${sel} spento`).toHaveAttribute("data-acceso", "no");
  }
  // Nessuna casella spenta porta un numero: non c'è nessuna fila di cui essere
  // il quantesimo, e una pastiglia qui si leggerebbe come un rango inventato.
  await expect(page.locator(`${STRISCIA} .scheda-icona__rango`)).toHaveCount(0);

  expect(external).toEqual([]);
});

test("acceso e spento si leggono SENZA il colore: cornice e riempimento resi", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [ICONE_SCHEDA_PIENA]);
  await call(page, TARGET.name);

  // Il ballottaggio è acceso, i tre segnali della scheda ci sono; l'icona
  // spenta di questa scheda non esiste, quindi si misura contro la scheda muta
  // più sotto. Qui: cornice CONTINUA e glifo PIENO.
  const acceso = page.locator(BALLOTTAGGIO);
  expect(
    await acceso.locator(".scheda-icona__hit").evaluate((el) => getComputedStyle(el).borderStyle),
  ).toBe("solid");
  expect(
    await acceso
      .locator(".scheda-icona__tratto")
      .first()
      .evaluate((el) => getComputedStyle(el).fill),
  ).not.toBe("none");

  await context.unroute(`**${SCHEDE_PATH}`);
  await context.route(`**${SCHEDE_PATH}`, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: schedeDeposit([ICONE_SCHEDA_SPENTA]),
    }),
  );
  await page.goto("/");
  await expect(page.locator("#search-player")).toBeVisible();
  await call(page, TARGET.name);

  const spento = page.locator(BALLOTTAGGIO);
  // Cornice TRATTEGGIATA e glifo in SOLO CONTORNO: due canali che non sono il
  // colore, più la parola nella didascalia qui sotto.
  expect(
    await spento.locator(".scheda-icona__hit").evaluate((el) => getComputedStyle(el).borderStyle),
  ).toBe("dashed");
  expect(
    await spento
      .locator(".scheda-icona__tratto")
      .first()
      .evaluate((el) => getComputedStyle(el).fill),
  ).toBe("none");
  expect(
    await spento
      .locator(".scheda-icona__tratto")
      .first()
      .evaluate((el) => getComputedStyle(el).strokeWidth),
  ).not.toBe("0px");

  expect(external).toEqual([]);
});

// ── b. L'ICONA DELLE LISTE ───────────────────────────────────────────────────

test("l'icona delle liste compare SOLO se il giocatore è in una delle tre", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [ICONE_SCHEDA_SPENTA]);
  await call(page, TARGET.name);

  // FAIL-CLOSED: nessuna lista dichiarata, nessuna quinta icona — e nessun
  // segnaposto al suo posto.
  await expect(page.locator(LISTA)).toHaveCount(0);
  await expect(page.locator(`${STRISCIA} > li`)).toHaveCount(4);

  expect(external).toEqual([]);
});

test("i tre stati dell'icona delle liste: tre disegni diversi e tre colori diversi", async ({
  page,
  context,
}) => {
  const casi = [
    { scheda: ICONE_SCHEDA_PIENA, parola: "consigliato" },
    { scheda: ICONE_SCHEDA_SORPRESA, parola: "possibile sorpresa" },
    { scheda: ICONE_SCHEDA_SCONSIGLIATO, parola: "sconsigliato" },
  ] as const;

  const external = await boot(page, context, [casi[0].scheda]);
  const colori: string[] = [];
  const disegni: string[] = [];

  for (const caso of casi) {
    await context.unroute(`**${SCHEDE_PATH}`);
    await context.route(`**${SCHEDE_PATH}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: schedeDeposit([caso.scheda]),
      }),
    );
    await page.goto("/");
    await expect(page.locator("#search-player")).toBeVisible();
    await call(page, TARGET.name);

    const icona = page.locator(LISTA);
    await expect(icona, caso.parola).toBeVisible();
    // La parola c'è, ed è la parola dello stato: il colore non porta il fatto
    // da solo né qui né nella forma parlata.
    await expect(icona.locator(".scheda-icona__sr")).toContainText(caso.parola, {
      ignoreCase: true,
    });
    colori.push(await glifoColore(icona));
    disegni.push(await disegno(icona));
  }

  expect(new Set(colori).size, `tre colori distinti, misurati: ${colori.join(" · ")}`).toBe(3);
  expect(new Set(disegni).size, "tre disegni distinti, non lo stesso glifo ridipinto").toBe(3);

  expect(external).toEqual([]);
});

test("i disegni delle cinque icone non si somigliano fra loro", async ({ page, context }) => {
  const external = await boot(page, context, [ICONE_SCHEDA_PIENA]);
  await call(page, TARGET.name);

  const disegni = await Promise.all(
    [RIGORISTA, PUNIZIONI, ANGOLI, BALLOTTAGGIO, LISTA].map((sel) => disegno(page.locator(sel))),
  );
  expect(new Set(disegni).size, "cinque disegni distinti").toBe(5);

  expect(external).toEqual([]);
});

// ── a-bis. IL POSTO NELLA FILA ───────────────────────────────────────────────

test("ogni fila ordinata porta il PROPRIO numero, e sono tre numeri diversi", async ({
  page,
  context,
}) => {
  // La fixture dichiara 1° sui rigori, 2° sulle punizioni, 3° sugli angoli:
  // tre numeri diversi apposta, perché una pastiglia finita sulla casella
  // sbagliata non possa passare inosservata.
  const external = await boot(page, context, [ICONE_SCHEDA_PIENA]);
  await call(page, TARGET.name);

  for (const [sel, atteso] of [
    [RIGORISTA, "1\u00b0"],
    [PUNIZIONI, "2\u00b0"],
    [ANGOLI, "3\u00b0"],
  ] as const) {
    await expect(page.locator(`${sel} .scheda-icona__rango`), sel).toHaveText(atteso);
  }
  // Le due caselle senza fila ordinata non ne hanno nessuno.
  await expect(page.locator(`${BALLOTTAGGIO} .scheda-icona__rango`)).toHaveCount(0);
  await expect(page.locator(`${LISTA} .scheda-icona__rango`)).toHaveCount(0);

  // E IL NUMERO È ANCHE NELLA FRASE PARLATA: chi naviga a voce non vede
  // l'angolo della casella, e la pastiglia è `aria-hidden` proprio perché il
  // numero è già lì dentro.
  await expect(page.locator(`${ANGOLI} .scheda-icona__sr`)).toContainText("3\u00b0");

  expect(external).toEqual([]);
});

test("fila dichiarata SENZA ordine: casella accesa, nessun numero, e lo dice", async ({
  page,
  context,
}) => {
  // FAIL-CLOSED sul numero: «designato» non vuol dire «primo», e una pastiglia
  // «1» qui sarebbe un rango inventato — il difetto che `n/d` esiste per non
  // avere.
  const external = await boot(page, context, [ICONE_SCHEDA_SENZA_RANGO]);
  await call(page, TARGET.name);

  for (const sel of [RIGORISTA, PUNIZIONI, ANGOLI]) {
    await expect(page.locator(sel), `${sel} acceso`).toHaveAttribute("data-acceso", "si");
  }
  await expect(page.locator(`${STRISCIA} .scheda-icona__rango`)).toHaveCount(0);
  await expect(page.locator(`${PUNIZIONI} .scheda-icona__sr`)).toContainText("rango n/d");

  expect(external).toEqual([]);
});

test.describe("il numero si legge, e non gonfia la striscia", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("a 390px la pastiglia sta dentro la casella e non apre scorrimento", async ({
    page,
    context,
  }) => {
    const external = await boot(page, context, [ICONE_SCHEDA_PIENA]);
    await call(page, TARGET.name);
    await expect(page.locator(STRISCIA)).toBeVisible();

    const g = await page.evaluate(() => {
      const striscia = document.getElementById("player-insight-icone");
      if (striscia === null) throw new Error("icone: la striscia non è a schermo");
      const rango = document.querySelector<HTMLElement>(
        "#player-insight-icona-angoli .scheda-icona__rango",
      );
      if (rango === null) throw new Error("icone: la pastiglia del rango non è a schermo");
      const casella = rango.closest("li")!.getBoundingClientRect();
      const box = rango.getBoundingClientRect();
      return {
        altezzaStriscia: Math.round(striscia.getBoundingClientRect().height),
        dentro:
          box.right <= casella.right + 1 &&
          box.bottom <= casella.bottom + 1 &&
          box.left >= casella.left - 1,
        corpo: parseFloat(getComputedStyle(rango).fontSize),
        senzaScorrimento: document.documentElement.scrollWidth <= window.innerWidth + 1,
      };
    });

    // LA STRISCIA NON CRESCE: stesso tetto di prima delle pastiglie, perché il
    // numero è fuori dal flusso.
    expect(g.altezzaStriscia, `striscia alta ${g.altezzaStriscia}px`).toBeLessThanOrEqual(30);
    expect(g.dentro, "la pastiglia sborda dalla propria casella").toBe(true);
    expect(g.senzaScorrimento, "390px: nessuno scorrimento orizzontale").toBe(true);
    // Corpo dichiarato, non «quello che ci sta»: è quello del titolo del blocco.
    expect(g.corpo, `corpo della pastiglia ${g.corpo}px`).toBeGreaterThanOrEqual(9);

    // Il bersaglio tattile resta quello di prima: la pastiglia sta DENTRO il
    // bottone e non gliene toglie un pixel.
    const box = await page.locator(`${ANGOLI} .scheda-icona__hit`).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.height).toBeGreaterThanOrEqual(24);

    expect(external).toEqual([]);
  });
});

// ── c. IL BALLOTTAGGIO: MOUSE, TASTIERA, DITO ────────────────────────────────

test("il ballottaggio a due: il nome dell'altro e la sua quota compaiono col mouse", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [ICONE_SCHEDA_PIENA]);
  await call(page, TARGET.name);

  const pop = page.locator(`${BALLOTTAGGIO} .scheda-icona__pop`);
  // Prima del gesto la didascalia non è a schermo — e non occupa spazio.
  await expect(pop).toBeHidden();

  await page.locator(`${BALLOTTAGGIO} .scheda-icona__hit`).hover();
  await expect(pop).toBeVisible();
  await expect(pop).toContainText(`Bruna Placeholder (${SCHEDA_CLUB}) al 40%`);
  await expect(pop).toContainText("lui al 60%");

  expect(external).toEqual([]);
});

test("il ballottaggio a TRE: tutti gli altri restano scritti, non solo «l'altro»", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [ICONE_SCHEDA_TRE_NOMI]);
  await call(page, TARGET.name);

  await page.locator(`${BALLOTTAGGIO} .scheda-icona__hit`).hover();
  const pop = page.locator(`${BALLOTTAGGIO} .scheda-icona__pop`);
  await expect(pop).toBeVisible();
  await expect(pop).toContainText(`Bruna Placeholder (${SCHEDA_CLUB}) al 30%`);
  await expect(pop).toContainText(`Carlo Segnaposto (${SCHEDA_CLUB}) al 20%`);
  await expect(pop).toContainText("lui al 50%");

  expect(external).toEqual([]);
});

test("il nome dell'altro si raggiunge DA TASTIERA, col solo tasto Tab", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [ICONE_SCHEDA_TRE_NOMI]);
  await call(page, TARGET.name);

  const hit = page.locator(`${BALLOTTAGGIO} .scheda-icona__hit`);
  await expect(hit).toBeVisible();

  // Si parte dall'inizio del documento e si tabula: l'icona deve trovarsi
  // sulla strada della tastiera, non solo essere focusabile a comando.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let raggiunta = false;
  for (let i = 0; i < 200 && !raggiunta; i += 1) {
    await page.keyboard.press("Tab");
    raggiunta = await hit.evaluate((el) => el === document.activeElement);
  }
  expect(raggiunta, "l'icona del ballottaggio non è raggiungibile col tasto Tab").toBe(true);

  const pop = page.locator(`${BALLOTTAGGIO} .scheda-icona__pop`);
  await expect(pop).toBeVisible();
  await expect(pop).toContainText(`Bruna Placeholder (${SCHEDA_CLUB}) al 30%`);
  await expect(pop).toContainText(`Carlo Segnaposto (${SCHEDA_CLUB}) al 20%`);

  // E chi naviga a voce non dipende dalla nuvoletta: la frase intera è il
  // CONTENUTO del bottone, cioè il suo nome accessibile.
  const nome = await hit.evaluate((el) => (el.textContent ?? "").trim());
  expect(nome).toContain(`Bruna Placeholder (${SCHEDA_CLUB}) al 30%`);
  expect(nome).toContain(`Carlo Segnaposto (${SCHEDA_CLUB}) al 20%`);
  // Nessun `title`: non lo raggiungerebbero né la tastiera né il dito.
  await expect(hit).not.toHaveAttribute("title", /./);

  expect(external).toEqual([]);
});

test.describe("col dito, dove l'hover non esiste", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("un tocco sull'icona apre il nome dell'altro in ballottaggio", async ({ page, context }) => {
    const external = await boot(page, context, [ICONE_SCHEDA_TRE_NOMI]);
    await call(page, TARGET.name);

    const hit = page.locator(`${BALLOTTAGGIO} .scheda-icona__hit`);
    await hit.scrollIntoViewIfNeeded();
    // Il bersaglio è grande abbastanza per un dito (WCAG 2.5.8: 24px).
    const box = await hit.boundingBox();
    expect(box, "l'icona non ha un rettangolo").not.toBeNull();
    expect(box!.width, `larghezza del bersaglio ${box!.width}px`).toBeGreaterThanOrEqual(24);
    expect(box!.height, `altezza del bersaglio ${box!.height}px`).toBeGreaterThanOrEqual(24);

    await hit.tap();
    const pop = page.locator(`${BALLOTTAGGIO} .scheda-icona__pop`);
    await expect(pop).toBeVisible();
    await expect(pop).toContainText(`Bruna Placeholder (${SCHEDA_CLUB}) al 30%`);
    await expect(pop).toContainText(`Carlo Segnaposto (${SCHEDA_CLUB}) al 20%`);
    // La nuvoletta non esce dallo schermo: a 390px è il caso stretto.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      "390px: nessuno scorrimento orizzontale con la didascalia aperta",
    ).toBe(true);

    expect(external).toEqual([]);
  });
});

// ── d. IL CONTRASTO ──────────────────────────────────────────────────────────

test("ogni testo delle icone si legge: sopra AA, nei tre stati dell'icona delle liste", async ({
  page,
  context,
}) => {
  const schede = [ICONE_SCHEDA_PIENA, ICONE_SCHEDA_SORPRESA, ICONE_SCHEDA_SCONSIGLIATO];
  const external = await boot(page, context, [schede[0] as ExpertScheda]);

  for (const scheda of schede) {
    await context.unroute(`**${SCHEDE_PATH}`);
    await context.route(`**${SCHEDE_PATH}`, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: schedeDeposit([scheda]) }),
    );
    await page.goto("/");
    await expect(page.locator("#search-player")).toBeVisible();
    await call(page, TARGET.name);
    await expect(page.locator(STRISCIA)).toBeVisible();

    // Le didascalie sono nascoste finché nessuno le chiede, e la spazzata
    // salta ciò che non è visibile: si aprono UNA PER UNA e si misurano,
    // altrimenti questa prova resterebbe verde senza aver guardato i colori
    // che esiste per guardare.
    const quante = await page.locator(`${STRISCIA} > li`).count();
    for (let i = 0; i < quante; i += 1) {
      const icona = page.locator(`${STRISCIA} > li`).nth(i);
      await icona.locator(".scheda-icona__hit").hover();
      await expect(icona.locator(".scheda-icona__pop")).toBeVisible();

      const misure = await measureAllText(page, `${STRISCIA}, ${STRISCIA} *`);
      const visibili = misure.filter((m) => m.kind === "measured" || m.kind === "unclassified");
      expect(visibili.length, "la spazzata delle icone non vede testo").toBeGreaterThan(0);
      for (const m of misure) {
        if (m.kind === "unclassified") {
          throw new Error(`icone: testo non classificabile — ${m.label}: ${m.reason}`);
        }
        expect(
          m.ratio,
          `${m.label} a ${m.ratio.toFixed(2)}:1 (${m.fg} su ${m.bg}, ${m.fontSize}px)`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    }
  }

  expect(external).toEqual([]);
});

// ── e. LA GEOMETRIA ──────────────────────────────────────────────────────────

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
] as const;

test("alle tre larghezze: una riga sola, dentro la colonna, senza scorrimento laterale", async ({
  page,
  context,
}) => {
  // DUE STATI, non uno: col radar disegnato (dove la striscia gli sta sotto,
  // nello spazio che la colonna ha già) e senza (dove ne prende il posto).
  const stati = [
    { nome: "col radar", scheda: ICONE_SCHEDA_CON_PAGELLA, radar: 1 },
    { nome: "senza radar", scheda: ICONE_SCHEDA_PIENA, radar: 0 },
  ] as const;
  const external = await boot(page, context, [stati[0].scheda]);

  for (const stato of stati) {
    await context.unroute(`**${SCHEDE_PATH}`);
    await context.route(`**${SCHEDE_PATH}`, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: schedeDeposit([stato.scheda]) }),
    );
    for (const viewport of VIEWPORTS) {
      const dove = `${stato.nome} a ${viewport.width}×${viewport.height}`;
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.locator("#search-player")).toBeVisible();
      await call(page, TARGET.name);
      await expect(page.locator(STRISCIA)).toBeVisible();
      await expect(page.locator("#player-insight-radar")).toHaveCount(stato.radar);

      const g = await page.evaluate(() => {
        const striscia = document.getElementById("player-insight-icone");
        if (striscia === null) throw new Error("icone: la striscia non è a schermo");
        const pagella = document.getElementById("player-insight-pagella");
        if (pagella === null) throw new Error("icone: il blocco pagella non è a schermo");
        const box = striscia.getBoundingClientRect();
        const tessere = [...striscia.children].map((el) => el.getBoundingClientRect());
        return {
          altezzaStriscia: Math.round(box.height),
          cime: tessere.map((r) => Math.round(r.top)),
          // Le tessere stanno DENTRO la striscia: nessuna sborda dalla colonna
          // del radar, che a 116px è la più stretta che avranno mai.
          tessereDentro: tessere.every((r) => r.left >= box.left - 1 && r.right <= box.right + 1),
          altezzaPagella: Math.round(pagella.getBoundingClientRect().height),
          senzaScorrimento: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });

      // UNA RIGA SOLA: tutte le tessere cominciano alla stessa altezza. Se
      // andassero a capo, il blocco crescerebbe di una riga proprio dove il suo
      // tetto è misurato.
      expect(new Set(g.cime).size, `${dove}: le icone sono su ${new Set(g.cime).size} righe`).toBe(1);
      expect(
        g.altezzaStriscia,
        `${dove}: la striscia è alta ${g.altezzaStriscia}px`,
      ).toBeLessThanOrEqual(30);
      expect(g.tessereDentro, `${dove}: un'icona sborda dalla propria colonna`).toBe(true);
      expect(g.senzaScorrimento, `${dove}: nessuno scorrimento orizzontale`).toBe(true);

      // GLI STESSI DUE TETTI di e2e/pagella-radar.spec.ts, rimisurati con le
      // icone accese: le icone non si comprano il proprio posto con l'altezza
      // del blocco, e a 1280 non ne aggiungono affatto quando c'è il radar.
      if (viewport.width === 1280) {
        const tetto = stato.radar === 1 ? 240 : 80;
        expect(
          g.altezzaPagella,
          `${dove}: il blocco pagella è alto ${g.altezzaPagella}px (tetto ${tetto}px)`,
        ).toBeLessThanOrEqual(tetto);
      }
    }
  }

  expect(external).toEqual([]);
});

test("nello stato senza voti — cioè oggi — le icone ci sono e il blocco resta piccolo", async ({
  page,
  context,
}) => {
  // Nessuna pagella: è lo stato in cui l'app resta finché l'estrazione privata
  // non esiste. Se le icone vivessero dentro il disegno, oggi non si
  // vedrebbero su nessun giocatore.
  const external = await boot(page, context, [ICONE_SCHEDA_PIENA]);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.locator("#search-player")).toBeVisible();
  await call(page, TARGET.name);

  await expect(page.locator("#player-insight-radar")).toHaveCount(0);
  await expect(page.locator(STRISCIA)).toBeVisible();
  await expect(page.locator(`${STRISCIA} > li`)).toHaveCount(5);

  // LO STESSO TETTO della spec del radar per lo stato assente: le icone non
  // possono comprarsi il proprio posto con l'altezza di quel blocco.
  const altezza = await page
    .locator("#player-insight-pagella")
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));
  expect(altezza, `lo stato assente con le icone è alto ${altezza}px`).toBeLessThanOrEqual(80);

  expect(external).toEqual([]);
});

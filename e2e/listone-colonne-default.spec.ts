import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  FULL_SCHEDA,
  OTHER_PLAYER,
  SCHEDA_PLAYER,
  schedeDeposit,
} from "./fixtures/synthetic-schede.js";
import { installSyntheticNetworkGuard } from "./helpers.js";
import { LISTONE_COLUMN_PREFS_STORAGE_KEY } from "../src/listoneColumnPrefs.js";
import { LISTONE_IDENTITY_COLUMN_KEYS, VALUE_NOT_AVAILABLE } from "../src/ui/listone.js";

// LE UNDICI COLONNE DI DEFAULT DEL LISTONE — sul DOM vivo.
//
// Richiesta del committente, 2026-08-24: «nel listone di default voglio che le
// colonne siano: nome, ruolo, squadra, indice di appetibilità, Titolarità,
// Media Voto, Salute, No Malus/Bonus, Consiglio Esperti, rigorista, piazzati»,
// e sulle colonne che restano fuori — la quotazione di listino compresa —
// «Nascondile, ma lasciale attivabili».
//
// LE CINQUE COSE CHE QUESTA SPEC DIFENDE:
//  1. le undici ci sono, in QUELL'ordine, e la quotazione non c'è;
//  2. una colonna nascosta si riaccende, SOPRAVVIVE AL RELOAD e si rispegne —
//     la memoria della scelta è l'unica parte che il primo giro non aveva;
//  3. un voto che nessuno ha ancora estratto dice `n/d`: mai 0, mai un
//     trattino, mai una media;
//  4. rigorista e piazzati portano quello che la scheda dice, e `n/d` quando
//     la scheda non lo dice — non «no»;
//  5. undici colonne stanno su un telefono senza perdere niente e senza far
//     scorrere la pagina in orizzontale;
//  6. LE TRE COLONNE D'IDENTITÀ NON SI SPENGONO (aggiunto il 2026-08-24 dopo
//     la review di PR #41, che eseguendo l'app ha spento «Nome» dal pannello e
//     ha visto la riga ridursi a «P CLU ClubUno n/d …»). L'invariante viveva
//     in un commento di src/ui/listone.ts e nessun test la difendeva: è
//     esattamente il motivo per cui il varco è arrivato fin qui.
//
// Tutte le righe e tutte le schede sono sintetiche, e il guard di rete aborta
// qualunque altra cosa.

const SCHEDE_PATH = "/api/schede";

/** L'elenco di Pico, alla lettera e nel suo ordine. L'indice di appetibilità
 *  non compare qui: la sua colonna esiste solo per un pool che ne porti uno,
 *  regola precedente e invariata (vedi listone-remote-deposit.spec.ts). */
const DEFAULT_HEADERS = [
  "Nome",
  "Ruolo",
  "Squadra",
  "Titolarità",
  "Media voto",
  "Salute",
  "No malus / Bonus",
  "Consiglio esperti",
  "Rigorista",
  "Piazzati",
] as const;

/** Il giocatore su cui la scheda sintetica dichiara rigori e piazzati. */
const WITH_SCHEDA = SYNTHETIC_LISTONE_POOL.find((p) => p.name === SCHEDA_PLAYER)!;
/** Un giocatore senza scheda: le stesse due colonne devono dire `n/d`. */
const WITHOUT_SCHEDA = SYNTHETIC_LISTONE_POOL.find((p) => p.name === OTHER_PLAYER)!;

/** Serve il deposito delle schede come farebbe l'endpoint privato. Registrata
 *  DOPO il guard: Playwright valuta i route handler dal più recente. */
async function routeSchede(context: BrowserContext, schede: readonly unknown[]): Promise<void> {
  await context.route(`**${SCHEDE_PATH}`, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: schedeDeposit(schede as never),
    }),
  );
}

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#search-player")).toBeVisible();
  await expect(page.locator(".listone-row").first()).toBeVisible();
}

const headerTexts = (page: Page): Promise<string[]> =>
  page.locator(".listone-table-head > div").allTextContents();

/** Il testo della casella `key` sulla riga del giocatore `name`. */
function cell(page: Page, name: string, key: string) {
  return page.locator(".listone-row", { hasText: name }).locator(`[data-col="${key}"]`);
}

async function openColumnPanel(page: Page): Promise<void> {
  const toggle = page.locator("#listone-column-panel-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(page.locator("#listone-column-panel")).toBeVisible();
}

test("il listone parte con le undici colonne di Pico, nel suo ordine, e senza la quotazione", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  // `toEqual` su tutta la fila: una colonna in più, una in meno o due
  // scambiate fanno fallire questo test. Non è un `toContain`.
  expect(await headerTexts(page)).toEqual([...DEFAULT_HEADERS]);

  // La quotazione NON è sparita dal listone: è spenta, e il suo interruttore
  // è lì con lo stato dichiarato.
  await openColumnPanel(page);
  const quotation = page.locator("#listone-column-toggle-quotation");
  await expect(quotation).toBeVisible();
  await expect(quotation).toHaveAttribute("aria-pressed", "false");
  // E ogni colonna di default dichiara di essere accesa.
  await expect(page.locator("#listone-column-toggle-name")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#listone-column-toggle-scheda_piazzati")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(externalRequests).toEqual([]);
});

test("una colonna nascosta si riaccende, resta accesa dopo un reload e si può rispegnere", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  expect(await headerTexts(page)).not.toContain("Quotazione");

  // ── ACCESA ────────────────────────────────────────────────────────────────
  await openColumnPanel(page);
  await page.locator("#listone-column-toggle-quotation").click();
  await expect(page.locator("#listone-column-toggle-quotation")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Torna AL SUO POSTO — dopo le undici, non in fondo nell'ordine in cui è
  // stata premuta: la visibilità decide chi si vede, mai dove.
  expect(await headerTexts(page)).toEqual([...DEFAULT_HEADERS, "Quotazione"]);
  await expect(cell(page, WITHOUT_SCHEDA.name, "quotation")).toHaveText(
    String(WITHOUT_SCHEDA.quotation),
  );

  // ── RICORDATA ─────────────────────────────────────────────────────────────
  const saved = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    LISTONE_COLUMN_PREFS_STORAGE_KEY,
  );
  expect(saved, "la scelta deve essere scritta nel browser, non solo in memoria").not.toBeNull();
  expect(JSON.parse(saved!)).toMatchObject({ hidden: [], shown: ["quotation"] });

  await page.reload();
  await expect(page.locator(".listone-row").first()).toBeVisible();
  expect(await headerTexts(page)).toEqual([...DEFAULT_HEADERS, "Quotazione"]);

  // ── RISPENTA ──────────────────────────────────────────────────────────────
  await openColumnPanel(page);
  await page.locator("#listone-column-toggle-quotation").click();
  await expect(page.locator("#listone-column-toggle-quotation")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(await headerTexts(page)).toEqual([...DEFAULT_HEADERS]);

  await page.reload();
  await expect(page.locator(".listone-row").first()).toBeVisible();
  expect(await headerTexts(page)).toEqual([...DEFAULT_HEADERS]);
  expect(externalRequests).toEqual([]);
});

test("spegnere una colonna di default la nasconde, e anche quello si ricorda", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  await openColumnPanel(page);
  await page.locator("#listone-column-toggle-scheda_piazzati").click();
  expect(await headerTexts(page)).toEqual(DEFAULT_HEADERS.filter((h) => h !== "Piazzati"));

  await page.reload();
  await expect(page.locator(".listone-row").first()).toBeVisible();
  expect(await headerTexts(page)).toEqual(DEFAULT_HEADERS.filter((h) => h !== "Piazzati"));
  expect(externalRequests).toEqual([]);
});

test("i cinque voti del Gruppo Esperti dicono n/d finché non sono estratti — mai uno zero", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  const row = page.locator(".listone-row", { hasText: WITHOUT_SCHEDA.name });
  for (const key of [
    "pagella_titolarita",
    "pagella_media_voto",
    "pagella_salute",
    "pagella_no_malus_bonus",
    "pagella_consiglio",
  ]) {
    await expect(row.locator(`[data-col="${key}"]`)).toHaveText(VALUE_NOT_AVAILABLE);
  }
  // Nessuna delle cinque caselle mostra uno zero o un trattino.
  for (const text of ["0", "—", "-"]) {
    await expect(row.locator(`[data-col^="pagella_"]`).filter({ hasText: text })).toHaveCount(0);
  }

  // E la riga sotto la tabella DICE che i voti non ci sono ancora: cinque
  // colonne di `n/d` senza spiegazione si leggono come una tabella rotta.
  const note = page.locator("#listone-expert-signals-note");
  await expect(note).toContainText("NON sono ancora estratti");
  await expect(note).toContainText("mai uno zero");
  await expect(note).toContainText("0–10");
  expect(externalRequests).toEqual([]);
});

test("rigorista e piazzati portano quello che la scheda dice, e n/d quando non lo dice", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await routeSchede(context, [FULL_SCHEDA]);
  await boot(page);

  // La scheda sintetica dichiara `rigori: "designato"` e `piazzati: ["punizioni"]`.
  await expect(cell(page, WITH_SCHEDA.name, "scheda_rigorista")).toHaveText("designato");
  await expect(cell(page, WITH_SCHEDA.name, "scheda_piazzati")).toHaveText("punizioni");

  // Un giocatore su cui il deposito non dice niente: `n/d`, non «no». La
  // scheda che tace non è una scheda che nega.
  await expect(cell(page, WITHOUT_SCHEDA.name, "scheda_rigorista")).toHaveText(VALUE_NOT_AVAILABLE);
  await expect(cell(page, WITHOUT_SCHEDA.name, "scheda_piazzati")).toHaveText(VALUE_NOT_AVAILABLE);
  expect(externalRequests).toEqual([]);
});

test("undici colonne alle tre larghezze, senza perdere niente e senza scorrimento orizzontale", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await routeSchede(context, [FULL_SCHEDA]);
  await boot(page);

  const overflow = () =>
    page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      table: (() => {
        const t = document.querySelector(".listone-table");
        return t === null ? 0 : t.scrollWidth - t.clientWidth;
      })(),
    }));

  for (const [width, height] of [
    [390, 844], // telefono, il caso vero: si legge in asta, con una mano
    [768, 1024],
    [1280, 720],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".listone-row").first()).toBeVisible();

    const measured = await overflow();
    expect(measured.page, `la pagina scorre in orizzontale a ${width}px`).toBeLessThanOrEqual(0);
    expect(measured.body, `il body scorre in orizzontale a ${width}px`).toBeLessThanOrEqual(0);
    // Nemmeno la tabella scorre: la resa stretta è una scheda per riga, non
    // una tabella da trascinare col pollice mentre si rilancia.
    expect(measured.table, `la tabella scorre in orizzontale a ${width}px`).toBeLessThanOrEqual(0);

    // NIENTE VA PERSO: tutte e dieci le caselle della riga sono nel DOM e
    // hanno un rettangolo, a ogni larghezza.
    const row = page.locator(".listone-row", { hasText: WITH_SCHEDA.name });
    await expect(row.locator("[data-col]")).toHaveCount(DEFAULT_HEADERS.length);
    for (const key of ["scheda_rigorista", "pagella_no_malus_bonus", "club"]) {
      await expect(row.locator(`[data-col="${key}"]`)).toBeVisible();
    }
    // E l'ordinamento resta raggiungibile: l'intestazione non sparisce mai,
    // nemmeno quando smette di essere una fila di colonne.
    await expect(page.locator(".listone-table-head > div")).toHaveCount(DEFAULT_HEADERS.length);
  }

  // Sotto i 900px ogni casella si porta la propria etichetta, ed è quella del
  // RUOLO della riga: sulla scheda di un attaccante «Bonus», su quella di un
  // portiere «No malus». Nessuno dei due legge mai la parola dell'altro.
  await page.setViewportSize({ width: 390, height: 844 });
  const labelOf = (name: string) =>
    page
      .locator(".listone-row", { hasText: name })
      .locator('[data-col="pagella_no_malus_bonus"]')
      .evaluate((el) => getComputedStyle(el, "::before").content);
  expect(await labelOf(WITH_SCHEDA.name)).toContain("Bonus");
  expect(await labelOf(WITH_SCHEDA.name)).not.toContain("No malus");
  // `Aldo Prova` è il portiere del listone sintetico.
  expect(WITHOUT_SCHEDA.role).toBe("P");
  expect(await labelOf(WITHOUT_SCHEDA.name)).toContain("No malus");
  expect(externalRequests).toEqual([]);
});

test("il pannello delle colonne si raggiunge e si aziona da tastiera", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  // RAGGIUNGIBILE: si arriva sul comando con TAB, non con un click. Il tetto
  // è generoso ma finito — un comando che non entra nell'ordine di
  // tabulazione non lo raggiungerebbe mai.
  const toggle = page.locator("#listone-column-panel-toggle");
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  let reached = false;
  for (let i = 0; i < 80 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = (await toggle.evaluate((el) => el === document.activeElement)) === true;
  }
  expect(reached, "il comando «Colonne visibili» deve essere raggiungibile con TAB").toBe(true);

  // AZIONABILE: INVIO apre il pannello, e il fuoco resta dov'era invece di
  // finire sul body dopo la ricostruzione del DOM.
  await page.keyboard.press("Enter");
  await expect(page.locator("#listone-column-panel")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toBeFocused();

  // Da lì si entra negli interruttori con TAB e si accende una colonna con la
  // BARRA SPAZIATRICE. Lo stato è dichiarato, non solo colorato.
  const quotation = page.locator("#listone-column-toggle-quotation");
  let onSwitch = false;
  for (let i = 0; i < 30 && !onSwitch; i += 1) {
    await page.keyboard.press("Tab");
    onSwitch = (await quotation.evaluate((el) => el === document.activeElement)) === true;
  }
  expect(onSwitch, "gli interruttori delle colonne devono essere raggiungibili con TAB").toBe(true);
  await expect(quotation).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Space");
  await expect(quotation).toHaveAttribute("aria-pressed", "true");
  await expect(quotation).toBeFocused();
  expect(await headerTexts(page)).toContain("Quotazione");
  expect(externalRequests).toEqual([]);
});


// ── LE TRE COLONNE D'IDENTITÀ ────────────────────────────────────────────────
//
// L'elenco NON è riscritto qui: arriva da src/ui/listone.ts, dove la
// blindatura è definita. Un secondo elenco a mano nel test difenderebbe se
// stesso, non l'app.
const IDENTITY_LABELS: Readonly<Record<string, string>> = {
  name: "Nome",
  role: "Ruolo",
  club: "Squadra",
};

test("le tre colonne d'identità non si spengono, e il pannello dice perché", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  const firstRow = page.locator(".listone-row").first();
  const nameBefore = await firstRow.locator('[data-col="name"]').innerText();
  expect(nameBefore.trim().length).toBeGreaterThan(0);

  await openColumnPanel(page);

  // LA RIGA CHE SPIEGA: c'è, si legge, e non è un colore.
  const why = page.locator("#listone-columns-identity-note");
  await expect(why).toBeVisible();
  await expect(why).toContainText("Nome, ruolo e squadra restano sempre visibili");
  await expect(why).toContainText("non dice più di chi parla");

  for (const key of LISTONE_IDENTITY_COLUMN_KEYS) {
    const chip = page.locator(`#listone-column-toggle-${key}`);
    // RESTA NELL'ELENCO — non è sparita: si vede che c'è e che è bloccata.
    await expect(chip).toBeVisible();
    // DICHIARATO A CHI NON VEDE, non solo dipinto: `aria-disabled` più il
    // rimando alla frase che spiega.
    await expect(chip).toHaveAttribute("aria-disabled", "true");
    await expect(chip).toHaveAttribute("aria-describedby", "listone-columns-identity-note");
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    // E la parola è TESTO dentro la pastiglia, non una sfumatura di grigio.
    await expect(chip.locator(".listone-columns__lock")).toHaveText("sempre");

    // IL TENTATIVO. `force: true` perché è esattamente ciò che fa un dito su
    // uno schermo: il clic arriva comunque all'elemento. Non deve succedere
    // niente — nessun gestore, nessuna scrittura.
    await chip.click({ force: true });
    await expect(chip).toHaveAttribute("aria-pressed", "true");
  }

  // L'INTESTAZIONE È INTATTA, e la riga dice ancora di chi parla.
  expect(await headerTexts(page)).toEqual([...DEFAULT_HEADERS]);
  for (const key of LISTONE_IDENTITY_COLUMN_KEYS) {
    expect(await headerTexts(page)).toContain(IDENTITY_LABELS[key]);
  }
  await expect(page.locator(".listone-row").first().locator('[data-col="name"]')).toHaveText(
    nameBefore,
  );
  expect(externalRequests).toEqual([]);
});

test("il tentativo di spegnere un'identità non scrive niente, nemmeno dopo un reload", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  const saved = (): Promise<string | null> =>
    page.evaluate((key) => window.localStorage.getItem(key), LISTONE_COLUMN_PREFS_STORAGE_KEY);

  await openColumnPanel(page);
  expect(await saved(), "l'archivio parte vuoto: nessuna deviazione").toBeNull();

  for (const key of LISTONE_IDENTITY_COLUMN_KEYS) {
    await page.locator(`#listone-column-toggle-${key}`).click({ force: true });
  }
  // NESSUNA SCRITTURA. Prima di questa correzione qui c'era
  // `{"schemaVersion":1,"hidden":["name"],"shown":[]}`.
  expect(await saved(), "spegnere un'identità non deve toccare l'archivio").toBeNull();

  // NESSUN EFFETTO DOPO IL RELOAD: è l'altra metà: una preferenza scritta e
  // non onorata mentirebbe al prossimo avvio.
  await page.reload();
  await expect(page.locator(".listone-row").first()).toBeVisible();
  expect(await headerTexts(page)).toEqual([...DEFAULT_HEADERS]);
  expect(await saved()).toBeNull();

  // E LE ALTRE RESTANO SPEGNIBILI COME PRIMA: la blindatura è di tre colonne,
  // non un irrigidimento del pannello.
  await openColumnPanel(page);
  await page.locator("#listone-column-toggle-scheda_piazzati").click();
  await expect(page.locator("#listone-column-toggle-scheda_piazzati")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(await headerTexts(page)).toEqual(DEFAULT_HEADERS.filter((h) => h !== "Piazzati"));
  await page.locator("#listone-column-toggle-quotation").click();
  expect(await headerTexts(page)).toEqual([
    ...DEFAULT_HEADERS.filter((h) => h !== "Piazzati"),
    "Quotazione",
  ]);
  expect(JSON.parse((await saved())!)).toMatchObject({
    hidden: ["scheda_piazzati"],
    shown: ["quotation"],
  });
  expect(externalRequests).toEqual([]);
});

test("la pastiglia blindata si raggiunge con TAB e dichiara il blocco a chi non vede", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);
  await openColumnPanel(page);

  // RAGGIUNGIBILE: `aria-disabled` invece di `disabled` è tutta la ragione per
  // cui questo ciclo trova la pastiglia. Un bottone `disabled` esce
  // dall'ordine di tabulazione e chi naviga da tastiera non incontrerebbe mai
  // il divieto — sarebbe un blocco muto proprio per chi non vede il grigio.
  const name = page.locator("#listone-column-toggle-name");
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  let reached = false;
  for (let i = 0; i < 120 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = (await name.evaluate((el) => el === document.activeElement)) === true;
  }
  expect(reached, "la pastiglia «Nome» deve restare nell'ordine di tabulazione").toBe(true);

  // LEGGIBILE: il blocco e la sua ragione sono sul controllo, non nel colore.
  await expect(name).toHaveAttribute("aria-disabled", "true");
  const describedBy = await name.getAttribute("aria-describedby");
  await expect(page.locator(`#${describedBy!}`)).toContainText("non dice più di chi parla");
  expect(await name.getAttribute("title")).toContain("sempre visibili");

  // AZIONATA DA TASTIERA: non succede niente, e l'intestazione lo conferma.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await expect(name).toHaveAttribute("aria-pressed", "true");
  expect(await headerTexts(page)).toEqual([...DEFAULT_HEADERS]);
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), LISTONE_COLUMN_PREFS_STORAGE_KEY),
  ).toBeNull();
  expect(externalRequests).toEqual([]);
});

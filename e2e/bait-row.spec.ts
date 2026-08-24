import { expect, test, type Page } from "@playwright/test";
import { installSyntheticNetworkGuard } from "./helpers.js";
import { PRECEDENT_POOL, seedPrecedents } from "./fixtures/synthetic-precedents.js";
import { BAIT_TITLE, BAIT_TITLE_SHORT } from "../src/ui/baitRow.js";

// LA RIGA DELL'ESCA SI CLICCA COME UNA RIGA DI LISTONE — il gesto, dal primo
// tocco all'ultimo.
//
// IL DIFETTO CHE QUESTA SPEC ESISTE PER PREVENIRE, ed è la ragione per cui
// Pico l'ha chiesta: tre test separati che provano i tre pezzi — «il clic
// popola i campi», «la CTA si arma», «Avvia porta in asta» — passano tutti e
// tre anche quando la catena è rotta nel mezzo. Qui c'è UN test che parte dal
// gesto e finisce nella schermata d'asta con QUEL giocatore; i pezzi separati
// non lo sostituiscono.
//
// PERCHÉ LA CATENA PUÒ ESSERE RIUSATA E NON RIFATTA. `selectListonePlayer()` è
// l'UNICA via che arma la CTA «Avvia» (src/main.ts, e `isCallCorrelated` lo
// verifica); il candidato dell'esca È una `ListonePlayer` presa dal pool,
// quindi la stessa funzione si applica senza adattatori. Due strade per
// selezionare un giocatore sarebbero due superfici da sorvegliare, e la
// seconda divergerebbe il giorno in cui la prima cambia.
//
// TRE GESTI, NON UNO: mouse, tastiera e dito. La riga è un `<button>` vero,
// quindi Tab la raggiunge e Invio/Spazio la attivano senza un solo listener di
// tastiera scritto a mano — ed è questa spec a impedire che torni a essere un
// `<div>` con un listener di click, che è ciò che la riga di listone è oggi.
//
// LA SCENA. Il listone sintetico e lo storico d'asta sintetico di
// e2e/fixtures/synthetic-precedents.ts, seminati da `localStorage` come li
// legge davvero il boot. Zero dati reali, e il network guard aborta qualunque
// altra cosa.
//
// I TRE CANDIDATI ATTESI, calcolati sulla fixture e non indovinati: con otto
// squadre a rose vuote ogni reparto è aperto e ogni budget capiente, quindi
// l'ordine è per numero di avversari esposti e poi per chiave di listone.
//   Primo Portiere (ClubUno)   3 avversari — Squadra2, Squadra3, Squadra4
//   Secondo Portiere (ClubUno) 3 avversari — gli stessi tre
//   Primo Difensore (ClubTre)  2 avversari — Squadra2, Squadra3
// Le righe su ClubDue restano fuori dal tetto di 3, ed è giusto così: hanno
// due avversari e una chiave di listone che viene dopo.

const FIRST_ROW = "Primo Portiere";
const SECOND_ROW = "Secondo Portiere";
const THIRD_ROW = "Primo Difensore";

/** La guardia di deriva, sul DOM VIVO. Gemella di src/ui/baitRow.test.ts §E14. */
const DRIFT = /vuole|abbocc|aggressiv|tilt|preved|probabil|stima/i;

/**
 * La guardia di deriva su UNA STRINGA VUOTA sarebbe verde senza provare
 * niente: `""` non corrisponde a nessuna regex. Prima di negare, si asserisce
 * che c'è qualcosa da negare — il titolo del sottoblocco e una lunghezza
 * minima. È la stessa classe di difetto che #41 ha corretto sul proprio
 * `toHaveCount(0)` (e2e/listone-colonne-default.spec.ts §"le cinque celle di
 * voto devono esistere per poterle negare").
 */
async function expectNoDrift(page: Page, where: string): Promise<void> {
  const text = await page.locator("#bait-block").innerText();
  expect(text, `${where}: il nome non c'è, la guardia non sta guardando il blocco giusto`)
    .toContain(BAIT_TITLE_SHORT);
  // Oltre al nome deve esserci del contenuto vero: il titolo da solo non è
  // qualcosa da negare.
  const beyondTitle = text.replace(BAIT_TITLE_SHORT, "").trim();
  expect(beyondTitle.length, `${where}: oltre al nome il sottoblocco è vuoto`).toBeGreaterThan(40);
  expect(text, where).not.toMatch(DRIFT);
}

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await seedPrecedents(page);
  await expect(page.locator("#bait-rows")).toBeVisible();
}

/** Posizione assoluta nel documento del bordo superiore di un elemento. */
async function documentTop(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) throw new Error(`ordine: nessun elemento per ${sel}`);
    return el.getBoundingClientRect().top + window.scrollY;
  }, selector);
}

test("il sottoblocco mostra i candidati attesi, in ordine, dentro GIOCATORE SUGGERITO", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);
  await boot(page);

  const rows = page.locator("#bait-rows .bait-row");
  // Il tetto dichiarato è 3 (provvisorio): non due, non tutti.
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText(FIRST_ROW);
  await expect(rows.nth(1)).toContainText(SECOND_ROW);
  await expect(rows.nth(2)).toContainText(THIRD_ROW);

  // Il censimento e le sue tre condizioni, insieme.
  await expect(rows.nth(0)).toContainText("3 avversari con un precedente, lo slot e i crediti");
  await expect(rows.nth(2)).toContainText("2 avversari con un precedente, lo slot e i crediti");

  // Il costo del piano B, mostrato INSIEME alla mossa.
  await expect(rows.nth(0)).toContainText("se resta a te a 1 cr: slot P 3→2");
  await expect(rows.nth(0)).toContainText("restano 499 cr");

  // La prova viaggia col fatto, con la soglia e la numerosità in vista.
  await expect(rows.nth(0)).toContainText("ha speso su ClubUno");
  await expect(rows.nth(0)).toContainText("dal 15% in su");

  // Con le righe, l'occhiello è quello per esteso: dice CHE COSA sono.
  await expect(page.locator("#bait-title")).toHaveText(BAIT_TITLE);

  // I tre parametri, ispezionabili accanto ai numeri che governano.
  const note = page.locator("#bait-note");
  await expect(note).toContainText("provenienza: storico d'asta misurato");
  await expect(note).toContainText("apertura a 1 cr");
  await expect(note).toContainText("almeno 1 stagione misurata per fatto");
  await expect(note).toContainText("al massimo 3 righe (provvisorio");

  // Il blocco ospita DUE sottoblocchi: il segnaposto della prima metà non è
  // stato toccato, e il listone resta sotto (e2e/call-screen-order.spec.ts).
  const suggested = page.locator("#suggested-player");
  await expect(suggested).toContainText("GIOCATORE SUGGERITO — CHI CHIAMARE ORA");
  await expect(suggested).toContainText("Nessun suggerimento automatico attivo");
  expect(await page.evaluate(() =>
    document.getElementById("suggested-player")!.contains(document.getElementById("bait-block")),
  )).toBe(true);
  expect(await documentTop(page, "#bait-block")).toBeGreaterThan(
    await documentTop(page, "#suggested-player-mine"),
  );
  expect(await documentTop(page, "#listone-block")).toBeGreaterThan(
    await documentTop(page, "#bait-block"),
  );

  // GUARDIA DI DERIVA sul testo davvero renderizzato.
  await expectNoDrift(page, "con le righe");

  expect(externalRequests).toEqual([]);
});

test("E15 — clic sulla riga → «Avvia» → schermata d'asta con QUEL giocatore", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);
  await boot(page);

  // Prima del gesto la CTA è disarmata: senza questo, «si arma» sarebbe vero
  // per caso.
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeDisabled();

  await page.locator("#bait-rows .bait-row").first().click();

  // 1. IL GIOCATORE RISULTA SELEZIONATO ESATTAMENTE COME DAL LISTONE: i tre
  //    campi della ricerca si popolano con quella riga.
  await expect(page.locator("#search-player")).toHaveValue(FIRST_ROW);
  await expect(page.locator("#search-role")).toHaveValue("P");
  await expect(page.locator("#search-club")).toHaveValue("ClubUno");
  await expect(page.locator(".hint-text").first()).toContainText(
    `✓ Selezionato dal listone: ${FIRST_ROW}`,
  );

  // 2. LA SELEZIONE SI VEDE, e su un secondo canale oltre al colore.
  const selected = page.locator("#bait-rows .bait-row[aria-pressed='true']");
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText("✓ selezionato");
  await expect(selected).toContainText(FIRST_ROW);

  // 3. LA CTA SI ARMA — e da lì «Avvia» porta in asta senza passaggi in più.
  const avvia = page.getByRole("button", { name: /^Avvia/ });
  await expect(avvia).toBeEnabled();
  await avvia.click();

  // 4. SI È NELLA SCHERMATA D'ASTA, CON QUEL GIOCATORE.
  await expect(page.locator("#assign-price")).toBeVisible();
  await expect(page.locator("#call-card")).toContainText(FIRST_ROW);
  await expect(page.locator("#call-card")).toContainText("ClubUno");

  expect(externalRequests).toEqual([]);
});

test("E16 — la stessa catena da TASTIERA: Tab per raggiungerla, Invio per attivarla", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);
  await boot(page);

  // La riga è un <button> vero: è questo che le dà Tab e Invio/Spazio senza un
  // solo listener di tastiera scritto a mano.
  const control = await page.evaluate(() => {
    const el = document.querySelector("#bait-rows .bait-row") as HTMLButtonElement;
    return { tag: el.tagName, type: el.type, tabIndex: el.tabIndex, disabled: el.disabled };
  });
  expect(control.tag).toBe("BUTTON");
  expect(control.type).toBe("button");
  expect(control.tabIndex).toBeGreaterThanOrEqual(0);
  expect(control.disabled).toBe(false);

  // RAGGIUNGIBILE CON TAB, partendo da un controllo che sta prima nella
  // schermata. Non si asserisce il NUMERO di tabulazioni — cambierebbe con
  // ogni controllo aggiunto in mezzo — ma che la riga si raggiunga.
  await page.locator("#search-club").focus();
  let reached = false;
  for (let i = 0; i < 12 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(
      () => document.activeElement?.classList.contains("bait-row") === true,
    );
  }
  expect(reached, "la riga dell'esca non è raggiungibile con Tab").toBe(true);

  // ATTIVABILE CON INVIO, e la catena arriva in fondo come col mouse.
  const focusedName = await page.evaluate(
    () => (document.activeElement as HTMLElement).dataset.playerKey ?? "",
  );
  expect(focusedName).not.toBe("");
  await page.keyboard.press("Enter");
  await expect(page.locator("#search-player")).not.toHaveValue("");
  const chosen = await page.locator("#search-player").inputValue();
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeEnabled();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#call-card")).toContainText(chosen);

  expect(externalRequests).toEqual([]);
});

test("E16 — e con la BARRA SPAZIATRICE, che è l'altro tasto di un bottone", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);
  await boot(page);

  await page.locator("#bait-rows .bait-row").nth(2).focus();
  await expect(page.locator("#bait-rows .bait-row").nth(2)).toBeFocused();
  await page.keyboard.press("Space");

  await expect(page.locator("#search-player")).toHaveValue(THIRD_ROW);
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeEnabled();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#call-card")).toContainText(THIRD_ROW);

  expect(externalRequests).toEqual([]);
});

test.describe("E16 — col dito, a 390x844", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("il tocco fa esattamente quello che fa il clic, fino alla schermata d'asta", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);
    await boot(page);

    const row = page.locator("#bait-rows .bait-row").first();
    await row.scrollIntoViewIfNeeded();
    await row.tap();

    await expect(page.locator("#search-player")).toHaveValue(FIRST_ROW);
    await expect(page.locator("#bait-rows .bait-row[aria-pressed='true']")).toContainText(
      "✓ selezionato",
    );

    const avvia = page.getByRole("button", { name: /^Avvia/ });
    await expect(avvia).toBeEnabled();
    await avvia.tap();
    await expect(page.locator("#call-card")).toContainText(FIRST_ROW);

    // La pagina non scorre mai di lato, nemmeno col blocco in più.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

    expect(externalRequests).toEqual([]);
  });
});

test("senza storico il sottoblocco dice «non lo so», e non «nessuno»", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const empty = page.locator("#bait-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toHaveAttribute("data-reason", "no-history");
  await expect(empty).toContainText("non lo so");
  await expect(empty).toContainText("«non lo so» non è «nessuno»");
  await expect(page.locator("#bait-rows")).toHaveCount(0);

  // SENZA POPOLAZIONE, IL BLOCCO NON RECITA PARAMETRI CHE NON HANNO GOVERNATO
  // NIENTE: niente nota, e l'occhiello è il solo nome. Un blocco che non ha
  // nulla da dire non si prende un quarto di schermata — vedi
  // e2e/call-screen-order.spec.ts, che tiene la paginazione entro due schermate.
  await expect(page.locator("#bait-note")).toHaveCount(0);
  await expect(page.locator("#bait-title")).toHaveText(BAIT_TITLE_SHORT);
  const emptyHeight = await page
    .locator("#bait-block")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(emptyHeight, "il sottoblocco vuoto è tornato a costare mezza schermata").toBeLessThan(120);

  await expectNoDrift(page, "senza storico");

  expect(externalRequests).toEqual([]);
});

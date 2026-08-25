import { expect, test, type Page } from "@playwright/test";
import { installSyntheticNetworkGuard } from "./helpers.js";
import {
  A_FORTE,
  A_MEDIO,
  A_SCARSO,
  D_FORTE,
  PER_ME_POOL,
  seedRolePlan,
} from "./fixtures/synthetic-per-me.js";
import { PER_ME_TITLE, PER_ME_TITLE_SHORT } from "../src/ui/perMeRow.js";

// LA RIGA «PER ME» SI CLICCA COME UNA RIGA DI LISTONE — il gesto, dal primo
// tocco all'ultimo.
//
// IL DIFETTO CHE QUESTA SPEC ESISTE PER PREVENIRE, ed è la ragione per cui Pico
// l'ha chiesta: tre test separati che provano i tre pezzi — «il clic popola i
// campi», «la CTA si arma», «Avvia porta in asta» — passano tutti e tre anche
// quando la catena è rotta nel mezzo. Qui ogni gesto (mouse, tastiera, dito)
// parte dal tocco e finisce nella schermata d'asta con QUEL giocatore; i pezzi
// separati non lo sostituiscono.
//
// PERCHÉ LA CATENA PUÒ ESSERE RIUSATA E NON RIFATTA. `selectListonePlayer()` è
// l'UNICA via che arma la CTA «Avvia» (src/main.ts, e `isCallCorrelated` lo
// verifica); il candidato «per me» È una `ListonePlayer` presa dal pool, quindi
// la stessa funzione si applica senza adattatori. Due strade per selezionare un
// giocatore sarebbero due superfici da sorvegliare, e la seconda divergerebbe il
// giorno in cui la prima cambia.
//
// LA SCENA, e perché è fatta così. Quattro liberi con Qt.A e indice di
// appetibilità, un piano rosa dichiarato per intero, log vuoto: ogni reparto è
// aperto e `maxSafe` vale 473, quindi nessuno esce per budget e a decidere resta
// solo l'ordine.
//
// NESSUN VALORE DICHIARATO, ED È IL CASO VERO. L'app non ha ancora una sorgente
// per il listino dei valori di Pico (src/main.ts passa `values: null` e scrive
// perché), quindi il criterio 2 — il surplus, tornato al suo posto con la
// decisione di Pico del 2026-08-25 — non ha verdetto per nessuna riga: la
// schermata lo DICE riga per riga («valore non dichiarato») e le conta nella
// nota, e l'ordine cade sui criteri che restano. È esattamente ciò che questa
// spec deve sorvegliare: un giorno il listino arriverà, e allora questi numeri
// cambieranno per una ragione dichiarata invece che per sbaglio.
//
// «Attaccante Scarso» a 2 cr è il caso che ammazzerebbe una sottrazione fatta
// su un valore DERIVATO (piatto per ruolo): sarebbe l'unico candidato positivo,
// cioè il primo, cioè il peggiore promosso a occasione. Qui è ultimo, e a tetto
// di tre righe non compare affatto.

const FIRST_ROW = A_FORTE.name; // 1ª di 3 per appetibilità nel ruolo A, ancora 60
const SECOND_ROW = D_FORTE.name; // 1ª di 1 nel ruolo D, ancora 30
const THIRD_ROW = A_MEDIO.name; // 2ª di 3 nel ruolo A

/** La guardia di deriva, sul DOM VIVO. Gemella di src/ui/perMeRow.test.ts. */
const DRIFT = /valore|vale |conviene|affare|occasion|sconto|preved|probabil|stima|consigl|dovresti/i;

/**
 * La sola forma ammessa della parola «valore»: quella che porta con sé la
 * propria provenienza — l'input DICHIARATO di Pico (§D9 ingrediente 2), cioè
 * il minuendo del surplus, e la sua assenza. Stessa maschera, stessa ragione e
 * stessa contro-prova di src/ui/perMeRow.test.ts §"guardia di deriva".
 */
const DECLARED = /valore (?:non )?dichiarato/gi;

/**
 * La guardia di deriva su UNA STRINGA VUOTA sarebbe verde senza provare niente:
 * `""` non corrisponde a nessuna regex. Prima di negare, si asserisce che c'è
 * qualcosa da negare — il nome del sottoblocco e una lunghezza minima oltre il
 * nome.
 */
async function expectNoDrift(page: Page, where: string): Promise<void> {
  const text = await page.locator("#per-me-block").innerText();
  expect(text, `${where}: il nome non c'è, la guardia non sta guardando il blocco giusto`)
    .toContain(PER_ME_TITLE_SHORT);
  const beyondTitle = text.replace(PER_ME_TITLE, "").replace(PER_ME_TITLE_SHORT, "").trim();
  expect(beyondTitle.length, `${where}: oltre al nome il sottoblocco è vuoto`).toBeGreaterThan(40);
  // La maschera non è un buco: se il DOM non contenesse la forma con
  // provenienza, questa sostituzione non toglierebbe niente e la regex
  // guarderebbe lo stesso testo di prima.
  expect(text.replace(DECLARED, "«dichiarazione di Pico»"), where).not.toMatch(DRIFT);
}

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await seedRolePlan(page);
  await expect(page.locator("#per-me-rows")).toBeVisible();
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
  await installSyntheticNetworkGuard(context, PER_ME_POOL, externalRequests);
  await boot(page);

  const rows = page.locator("#per-me-rows .per-me-row");
  // Il tetto dichiarato è 3 (provvisorio): non due, non tutti e quattro.
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText(FIRST_ROW);
  await expect(rows.nth(1)).toContainText(SECOND_ROW);
  await expect(rows.nth(2)).toContainText(THIRD_ROW);

  // LA GUARDIA ANTI-SELEZIONE-AVVERSA, sul DOM vivo: il più economico e ultimo
  // dell'ordine di appetibilità non è in cima e non è nemmeno a schermo.
  await expect(page.locator("#per-me-rows")).not.toContainText(A_SCARSO.name);

  // IL CRITERIO 2 A SCHERMO, nel suo caso vero: senza listino dei valori il
  // surplus non esiste per nessuno, quindi nessuna riga porta un numero al suo
  // posto — né uno zero, che sembrerebbe una dichiarazione che Pico non ha
  // fatto. L'assenza la dice la nota, contata (più sotto).
  for (const i of [0, 1, 2]) {
    await expect(rows.nth(i)).not.toContainText("cr sotto il tuo valore dichiarato");
    await expect(rows.nth(i)).not.toContainText("cr sopra il tuo valore dichiarato");
    await expect(rows.nth(i)).not.toContainText("esattamente il tuo valore dichiarato");
  }

  // IL CRITERIO 3, DETTO A SCHERMO. La posizione è una posizione nell'ordine del
  // RUOLO — il difensore è primo del suo pur essendo quarto per punteggio.
  await expect(rows.nth(0)).toContainText("1ª di 3 per appetibilità");
  await expect(rows.nth(1)).toContainText("1ª di 1 per appetibilità");
  await expect(rows.nth(2)).toContainText("2ª di 3 per appetibilità");

  // L'ANCORA SI MOSTRA E NON SI SOTTRAE: a log vuoto è la Qt.A nuda, e il cold
  // start è dichiarato invece di essere riempito con uno zero.
  await expect(rows.nth(0)).toContainText("ancora 60 cr (Qt.A 60");
  await expect(rows.nth(0)).toContainText("nessuna inflazione misurata");

  // IL PIANO E IL TETTO HARD-SAFE, col nome dichiarato una volta sola.
  await expect(rows.nth(0)).toContainText("nel piano A (210 cr / 7 slot)");
  await expect(rows.nth(0)).toContainText("max bid 473 cr");
  await expect(rows.nth(1)).toContainText("nel piano D (80 cr / 9 slot)");

  // Con le righe, l'occhiello è quello per esteso: dice CHE COSA sono.
  await expect(page.locator("#per-me-title")).toHaveText(PER_ME_TITLE);

  // LA NOTA: l'ordine per esteso, i parametri, la scelta non ratificata.
  const note = page.locator("#per-me-note");
  await expect(note).toContainText("Qt.A del listone corretta dall'inflazione misurata");
  await expect(note).toContainText("piano «e2e pre-asta»");
  await expect(note).toContainText(
    "ordine: piano → surplus dichiarato → appetibilità del ruolo → ancora → chiave di listone",
  );
  // Le righe senza valore dichiarato si CONTANO nella nota, oltre a dirlo
  // ognuna per sé: l'assenza non diventa mai un numero. Il contatore conta i
  // CANDIDATI (quattro), non le righe mostrate (tre) — stessa convenzione del
  // suo gemello `withoutAppealPosition`, e la nota parla dell'ordine intero.
  await expect(note).toContainText(
    "4 righe senza valore dichiarato, in fondo senza surplus fabbricato",
  );
  await expect(note).toContainText("campione minimo 5");
  await expect(note).toContainText("3 righe al massimo (provvisorio");
  await expect(note).toContainText("NON RATIFICATA");

  // Il blocco ospita DUE sottoblocchi, e questo è il PRIMO: sopra l'esca, che a
  // sua volta sta sopra il listone (e2e/call-screen-order.spec.ts).
  const suggested = page.locator("#suggested-player");
  await expect(suggested).toContainText("GIOCATORE SUGGERITO — CHI CHIAMARE ORA");
  expect(await page.evaluate(() =>
    document.getElementById("suggested-player-mine")!.contains(
      document.getElementById("per-me-block"),
    ),
  )).toBe(true);
  expect(await documentTop(page, "#bait-block")).toBeGreaterThan(
    await documentTop(page, "#per-me-block"),
  );

  await expectNoDrift(page, "con le righe");

  expect(externalRequests).toEqual([]);
});

test("clic sulla riga → «Avvia» → schermata d'asta con QUEL giocatore", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_POOL, externalRequests);
  await boot(page);

  // Prima del gesto la CTA è disarmata: senza questo, «si arma» sarebbe vero
  // per caso.
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeDisabled();

  await page.locator("#per-me-rows .per-me-row").first().click();

  // 1. IL GIOCATORE RISULTA SELEZIONATO ESATTAMENTE COME DAL LISTONE: i tre
  //    campi della ricerca si popolano con quella riga.
  await expect(page.locator("#search-player")).toHaveValue(FIRST_ROW);
  await expect(page.locator("#search-role")).toHaveValue("A");
  await expect(page.locator("#search-club")).toHaveValue(A_FORTE.club);
  await expect(page.locator(".hint-text").first()).toContainText(
    `✓ Selezionato dal listone: ${FIRST_ROW}`,
  );

  // 2. LA SELEZIONE SI VEDE, e su un secondo canale oltre al colore.
  const selected = page.locator("#per-me-rows .per-me-row[aria-pressed='true']");
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
  await expect(page.locator("#call-card")).toContainText(A_FORTE.club);

  expect(externalRequests).toEqual([]);
});

test("la stessa catena da TASTIERA: Tab per raggiungerla, Invio per attivarla", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_POOL, externalRequests);
  await boot(page);

  // La riga è un <button> vero: è questo che le dà Tab e Invio/Spazio senza un
  // solo listener di tastiera scritto a mano.
  const control = await page.evaluate(() => {
    const el = document.querySelector("#per-me-rows .per-me-row") as HTMLButtonElement;
    return { tag: el.tagName, type: el.type, tabIndex: el.tabIndex, disabled: el.disabled };
  });
  expect(control.tag).toBe("BUTTON");
  expect(control.type).toBe("button");
  expect(control.tabIndex).toBeGreaterThanOrEqual(0);
  expect(control.disabled).toBe(false);

  // RAGGIUNGIBILE CON TAB, partendo da un controllo che sta prima nella
  // schermata. Non si asserisce il NUMERO di tabulazioni — cambierebbe con ogni
  // controllo aggiunto in mezzo — ma che la riga si raggiunga.
  await page.locator("#search-club").focus();
  let reached = false;
  for (let i = 0; i < 12 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(
      () => document.activeElement?.classList.contains("per-me-row") === true,
    );
  }
  expect(reached, "la riga «per me» non è raggiungibile con Tab").toBe(true);

  // ATTIVABILE CON INVIO, e la catena arriva in fondo come col mouse.
  const focusedKey = await page.evaluate(
    () => (document.activeElement as HTMLElement).dataset.playerKey ?? "",
  );
  expect(focusedKey).not.toBe("");
  await page.keyboard.press("Enter");
  await expect(page.locator("#search-player")).not.toHaveValue("");
  const chosen = await page.locator("#search-player").inputValue();
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeEnabled();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#call-card")).toContainText(chosen);

  expect(externalRequests).toEqual([]);
});

test("e con la BARRA SPAZIATRICE, che è l'altro tasto di un bottone", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_POOL, externalRequests);
  await boot(page);

  await page.locator("#per-me-rows .per-me-row").nth(2).focus();
  await expect(page.locator("#per-me-rows .per-me-row").nth(2)).toBeFocused();
  await page.keyboard.press("Space");

  await expect(page.locator("#search-player")).toHaveValue(THIRD_ROW);
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeEnabled();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#call-card")).toContainText(THIRD_ROW);

  expect(externalRequests).toEqual([]);
});

test.describe("col dito, a 390x844", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("il tocco fa esattamente quello che fa il clic, fino alla schermata d'asta", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, PER_ME_POOL, externalRequests);
    await boot(page);

    // L'ALTEZZA CHE QUESTO SOTTOBLOCCO COSTA, MISURATA E NON STIMATA.
    //
    // Il numero, su questa scena e a 390x844: **604px** il sottoblocco pieno,
    // 120px quello muto (161px con l'occhiello «GIOCATORE SUGGERITO»). Il
    // segnaposto che stava qui prima — stesso stile, stesso testo, rimesso a
    // schermo e misurato invece che ricordato — ne costava 98 (139 con
    // l'occhiello).
    //
    // COSA HA MOSSO IL NUMERO. Alla prima stesura il pieno costava 574px. Il
    // ritorno del surplus (decisione di Pico, 2026-08-25) ne ha aggiunti 30, e
    // sono tutti nella NOTA: il criterio in più nell'ordine scritto per esteso,
    // e la riga che conta le righe senza valore dichiarato. Le righe NON sono
    // cresciute, ed è una scelta misurata: su questa scena nessun candidato ha
    // un valore dichiarato, e ripetere «valore non dichiarato» su ognuna
    // portava il blocco a 683px — sopra questo tetto — senza aggiungere un
    // fatto che la nota non dica già, contato (vedi `perMeSurplusText`,
    // src/ui/perMeRow.ts).
    //
    // La schermata di chiamata è già oltre budget verticale in stati che
    // nessuno aveva misurato: questo tetto NON afferma che il blocco sia
    // gratis. È una guardia di regressione — se qualcuno rende una riga più
    // alta, il numero cambia sotto gli occhi di chi rilegge il diff — e la
    // decisione su quanto il blocco possa costare resta di Pico.
    const height = await page
      .locator("#per-me-block")
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(height, `il sottoblocco «per me» pieno costa ${Math.round(height)}px a 390x844`)
      .toBeLessThan(620);

    const row = page.locator("#per-me-rows .per-me-row").first();
    await row.scrollIntoViewIfNeeded();
    await row.tap();

    await expect(page.locator("#search-player")).toHaveValue(FIRST_ROW);
    await expect(page.locator("#per-me-rows .per-me-row[aria-pressed='true']")).toContainText(
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

test("senza piano dichiarato il sottoblocco dice QUALE dichiarazione manca", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_POOL, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const empty = page.locator("#per-me-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toHaveAttribute("data-reason", "plan-absent");
  await expect(empty).toContainText("Nessun piano rosa dichiarato");
  await expect(empty).toContainText("ROSE → IL MIO PIANO");
  await expect(page.locator("#per-me-rows")).toHaveCount(0);

  // SENZA POPOLAZIONE ORDINATA, IL BLOCCO NON RECITA PARAMETRI CHE NON HANNO
  // GOVERNATO NIENTE: niente nota, e l'occhiello è il solo nome.
  await expect(page.locator("#per-me-note")).toHaveCount(0);
  await expect(page.locator("#per-me-title")).toHaveText(PER_ME_TITLE_SHORT);
  const emptyHeight = await page
    .locator("#per-me-block")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(
    emptyHeight,
    `il sottoblocco muto costa ${Math.round(emptyHeight)}px: era 120 quando è stato misurato`,
  ).toBeLessThan(150);

  await expectNoDrift(page, "senza piano");

  expect(externalRequests).toEqual([]);
});

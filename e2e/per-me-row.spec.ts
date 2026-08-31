import { expect, test, type Page } from "@playwright/test";
import { installSyntheticNetworkGuard } from "./helpers.js";
import {
  AUCTION_HISTORY_KEY,
  PER_ME_DEPOSIT_POOL,
  PER_ME_GEN_RECIPE,
  PER_ME_POOL,
  syntheticPerMeHistory,
} from "./fixtures/synthetic-per-me.js";
import { PER_ME_TITLE_SHORT } from "../src/ui/perMeRow.js";

/**
 * IL TETTO DI REGRESSIONE DEL SOTTOBLOCCO PIENO, in px, misurato a 390×844 sul
 * DOM vivo. Non è una soglia scelta: è la misura arrotondata per eccesso al
 * pixel, come fa il mastro del budget con le proprie allocazioni.
 *
 * ERA 1002 px, ED È 134 DAL 2026-08-31. Non è una compressione: è la riga
 * ridotta a nome, ruolo e squadra e il tetto delle righe portato a UNA — «un
 * giocatore soltanto», decisione di Pico. Dei 134 px che restano, 92 sono la
 * NOTA: la targa della provenienza e i parametri dichiarati costano oggi tre
 * volte e mezzo il consiglio che annotano, ed è un fatto misurato che vale la
 * pena guardare in faccia invece di lasciarlo implicito in un numero solo.
 */
const PER_ME_FULL_HEIGHT_CEILING_PX = 134;

// «PER ME» — I DUE ESITI VERI DEL SOTTOBLOCCO, SUL DOM VIVO.
//
// CHE COSA C'ERA QUI PRIMA, E PERCHÉ NON DESCRIVE PIÙ LA REALTÀ. Fino a stamane
// questa spec verificava che la riga portasse `V` con la sua targa, il prezzo
// atteso coi tre qualificatori, il surplus, il costo per vincerlo adesso, i due
// conteggi di scarsità, l'appetibilità, l'ancora, l'allocazione del piano e il
// marcatore «⚑ adesso». Pico ha deciso altro, e in prima persona: «Quello che
// voglio nelle due feature è un giocatore soltanto con Nome, ruolo e squadra.
// Non devo usarle per leggere ma come consiglio.»
//
// QUELLE ASSERZIONI NON SONO STATE ALLENTATE, SONO STATE ROVESCIATE: al posto
// di «la riga porta questi fatti» c'è «la riga NON porta nessuno di questi
// fatti», voce per voce, così che il giorno in cui uno tornasse a schermo
// questa spec lo dica col suo nome. È la stessa tecnica con cui il mastro del
// budget pinna un debito: documentare, non condonare.
//
// LA COPERTURA CHE RESTA, INTATTA. La catena end-to-end del gesto — clic e
// tastiera, fino alla schermata d'asta con QUEL giocatore — è la ragione per
// cui la semplificazione non perde niente: i numeri sono a un clic. Restano
// anche il ricalcolo del piano dinamico provato sul vivo, il silenzio
// dichiarato (`no-forecast`) e le due pretese sul titolo nascosto.
//
// Fixture sintetiche: nessun giocatore reale, nessun prezzo d'asta reale,
// nessuna persona reale. Il network guard aborta ogni richiesta esterna.

/** La scena SERVITA: previsioni sul listone e storico d'asta in memoria. */
async function bootServed(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(
    ([key, store]) => {
      localStorage.clear();
      localStorage.setItem(key as string, JSON.stringify(store));
    },
    [AUCTION_HISTORY_KEY, syntheticPerMeHistory()] as const,
  );
  await page.reload();
  await expect(page.locator("#per-me-rows")).toBeVisible();
}

test("con deposito e storico il pannello CONSIGLIA: un giocatore, con nome ruolo e squadra", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_DEPOSIT_POOL, externalRequests);
  await bootServed(page);

  // IL TETTO RATIFICATO TRONCA DAVVERO: UNA riga, non tre e non sessanta.
  const rows = page.locator("#per-me-rows .per-me-row");
  await expect(rows).toHaveCount(1);
  await expect(page.locator("#per-me-empty")).toHaveCount(0);

  // LA RIGA È TRE COSE, e l'asserzione è sulla FORMA INTERA e non su un
  // «contiene»: «Nome (R · Club)», niente prima e niente dopo.
  const riga = ((await rows.first().innerText()) ?? "").trim();
  expect(riga).toMatch(/^[^()]+ \([PDCA] · [^()]+\)$/);

  // E QUI SOTTO C'È IL ROVESCIO DI CIÒ CHE QUESTA SPEC ASSERIVA IERI: nessuno
  // dei fatti che la riga portava è tornato a schermo. Sono a un clic — sulla
  // schermata di chiamata che la riga arma — e il motore che li calcola è
  // intatto, coperto da src/perMeCandidates.test.ts e da packages/engine.
  expect(riga).not.toContain(PER_ME_GEN_RECIPE); // la targa di `V`
  expect(riga).not.toMatch(/\bV \d/);
  expect(riga).not.toMatch(/\bS [+−]\d/); // il surplus
  expect(riga).not.toContain("atteso"); // il prezzo atteso e i tre qualificatori
  expect(riga).not.toContain("aste simili");
  expect(riga).not.toContain("tende a sbagliare");
  expect(riga).not.toContain("vincerlo adesso"); // il costo per vincerlo ora
  expect(riga).not.toContain("alternativ"); // i due fatti di scarsità
  expect(riga).not.toContain("rival");
  expect(riga).not.toContain("appetibilità");
  expect(riga).not.toContain("ancora"); // la scomposizione dell'ancora
  expect(riga).not.toContain("Qt.A");
  expect(riga).not.toContain("piano"); // l'allocazione dinamica del ruolo
  expect(riga).not.toContain("max bid");
  expect(riga).not.toContain("⚑"); // il marcatore del momento
  await expect(page.locator("#per-me-rows .per-me-row__now")).toHaveCount(0);

  // LA NOTA RESTA, ASCIUGATA: la targa della provenienza e i parametri
  // dichiarati. È ciò che rende il consiglio ispezionabile invece che oracolare
  // — con UNA riga sola è l'unica cosa che permette di non fidarsi.
  const note = page.locator("#per-me-note");
  await expect(note).toContainText("V dal generatore e prezzo atteso dalla curva storica");
  await expect(note).toContainText("piano ricalcolato adesso «NOM-DYN@-1»");
  await expect(note).toContainText("campione minimo 5 (inflazione) e 5 (fascia di prezzo)");
  await expect(note).toContainText("riserva 1 cr per ogni slot non ancora pianificato");
  await expect(note).toContainText("1 riga al massimo (ratificato da Pico il 2026-08-31)");
  await expect(note).not.toContainText("provvisorio");
  // …e la LETTURA ne è uscita: niente ordine per esteso, niente contatori,
  // niente elenco delle scelte non ratificate. Restano nel dato.
  await expect(note).not.toContainText("ordine:");
  await expect(note).not.toContainText("NON RATIFICATE");

  // NESSUN VERBO DI PREVISIONE O DI DESIDERIO nel testo reso: la guardia di
  // deriva vive in src/ui/perMeRow.test.ts, qui si verifica che ciò che arriva
  // DAVVERO a schermo non la contraddica.
  const testo = (await page.locator("#per-me-block").textContent()) ?? "";
  expect(testo).not.toMatch(/valore|vale |conviene|affare|occasion|sconto|preved|probabil|stima/i);

  expect(externalRequests).toEqual([]);
});

test("clic sulla riga → «Avvia» → schermata d'asta con QUEL giocatore", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_DEPOSIT_POOL, externalRequests);
  await bootServed(page);

  // Prima del gesto la CTA è disarmata: senza questo, «si arma» sarebbe vero
  // per caso.
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeDisabled();

  const first = page.locator("#per-me-rows .per-me-row").first();
  const nome = (await first.locator(".per-me-row__name").textContent()) ?? "";
  const soloNome = nome.slice(0, nome.indexOf(" (")).trim();
  expect(soloNome.length).toBeGreaterThan(0);

  await first.click();

  // 1. IL GIOCATORE RISULTA SELEZIONATO ESATTAMENTE COME DAL LISTONE.
  await expect(page.locator("#search-player")).toHaveValue(soloNome);
  await expect(page.locator("#search-role")).toHaveValue("A");

  // 2. LA SELEZIONE SI VEDE, e su un secondo canale oltre al colore.
  const selected = page.locator("#per-me-rows .per-me-row[aria-pressed='true']");
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText("✓ selezionato");

  // 3. LA CTA SI ARMA — e da lì «Avvia» porta in asta senza passaggi in più.
  const avvia = page.getByRole("button", { name: /^Avvia/ });
  await expect(avvia).toBeEnabled();
  await avvia.click();

  // 4. SI È NELLA SCHERMATA D'ASTA, CON QUEL GIOCATORE.
  await expect(page.locator("#assign-price")).toBeVisible();
  await expect(page.locator("#call-card")).toContainText(soloNome);

  expect(externalRequests).toEqual([]);
});

test("la stessa catena da TASTIERA: la riga è un <button> vero", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_DEPOSIT_POOL, externalRequests);
  await bootServed(page);

  // La riga è UNA sola dal 2026-08-31, quindi la tastiera si prova su quella:
  // era `.nth(1)` quando le righe erano tre. Ciò che il test dimostra non
  // cambia — che la riga è un `<button>` vero e che Invio la attiva.
  const row = page.locator("#per-me-rows .per-me-row").first();
  await row.focus();
  await expect(row).toBeFocused();
  const nome = (await row.locator(".per-me-row__name").textContent()) ?? "";
  const soloNome = nome.slice(0, nome.indexOf(" (")).trim();

  await page.keyboard.press("Enter");
  await expect(page.locator("#search-player")).toHaveValue(soloNome);
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeEnabled();

  expect(externalRequests).toEqual([]);
});

test("il piano dinamico si RICALCOLA: comprato il primo, la lista cambia da sé", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_DEPOSIT_POOL, externalRequests);
  await bootServed(page);

  const primaNomi = await page.locator("#per-me-rows .per-me-row__name").allTextContents();
  await expect(page.locator("#per-me-note")).toContainText("«NOM-DYN@-1»");

  // Il gesto vero: si porta il primo in asta e lo si assegna. Nessuna
  // previsione di durata è stata fatta — è il RICALCOLO a spostare la lista.
  await page.locator("#per-me-rows .per-me-row").first().click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill("30");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#per-me-rows")).toBeVisible();

  const dopoNomi = await page.locator("#per-me-rows .per-me-row__name").allTextContents();
  expect(dopoNomi).not.toEqual(primaNomi);
  // La versione del piano è la posizione nel log, e si è mossa con l'evento.
  await expect(page.locator("#per-me-note")).not.toContainText("«NOM-DYN@-1»");
  await expect(page.locator("#per-me-note")).toContainText("«NOM-DYN@");

  expect(externalRequests).toEqual([]);
});

test("senza le previsioni servite il sottoblocco dice QUALE deposito manca", async ({
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
  await expect(empty).toHaveAttribute("data-reason", "no-forecast");
  await expect(empty).toContainText("Deposito assente o monco");
  await expect(page.locator("#per-me-rows")).toHaveCount(0);
  // IL MOTIVO DEL PIANO DICHIARATO NON ESISTE PIÙ: il piano dinamico esiste
  // sempre dove esistono `V` e prezzo atteso, quindi nessun pannello può più
  // tacere per una dichiarazione che manca.
  await expect(empty).not.toContainText("piano rosa");

  // SENZA POPOLAZIONE ORDINATA, IL BLOCCO NON RECITA PARAMETRI CHE NON HANNO
  // GOVERNATO NIENTE: niente nota, e l'occhiello è il solo nome.
  await expect(page.locator("#per-me-note")).toHaveCount(0);
  await expect(page.locator("#per-me-title")).toHaveText(PER_ME_TITLE_SHORT);

  // IL TITOLO C'È E NON SI DISEGNA — «Nascondi #per-me-title» (Pico,
  // 2026-08-31). Le due metà di questa pretesa non si possono separare, ed è
  // il motivo per cui stanno in un test solo:
  //
  //   a. NON OCCUPA LA VISTA. Il rettangolo è quello dell'idioma
  //      visually-hidden del repository (1×1 px, `clip-path: inset(50%)`), non
  //      una riga di testo alta 16 px. Un `display: none` passerebbe anche qui
  //      — ed è proprio quello che la lettera b vieta.
  //   b. DÀ ANCORA IL NOME AL BLOCCO. `aria-labelledby` punta a lui: se
  //      sparisse dal rendering, `#per-me-block` resterebbe SENZA nome
  //      accessibile, e nessuno se ne accorgerebbe guardando la pagina.
  const titleBox = await page
    .locator("#per-me-title")
    .evaluate((el) => el.getBoundingClientRect());
  expect(titleBox.height, "il titolo non occupa una riga a schermo").toBeLessThanOrEqual(1);
  expect(titleBox.width, "il titolo non occupa larghezza a schermo").toBeLessThanOrEqual(1);

  const accessibleName = await page.locator("#per-me-block").evaluate((el) => {
    const by = el.getAttribute("aria-labelledby") ?? "";
    return document.getElementById(by)?.textContent ?? null;
  });
  expect(accessibleName, "il sottoblocco ha ancora un nome accessibile").toBe(PER_ME_TITLE_SHORT);

  // E IL NOME CHE SI VEDE È QUELLO DI SOPRA, uno solo.
  await expect(page.locator("#suggested-player-mine-title")).toBeVisible();

  const emptyHeight = await page
    .locator("#per-me-block")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(
    emptyHeight,
    `il sottoblocco muto costa ${Math.round(emptyHeight)}px: era 120 quando è stato misurato, ` +
      `39 dal 2026-08-31 col titolo nascosto, 78 con la frase del deposito mancante`,
  ).toBeLessThan(150);

  expect(externalRequests).toEqual([]);
});

test("il sottoblocco PIENO ha un tetto di regressione, misurato a 390×844", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_DEPOSIT_POOL, externalRequests);
  await page.setViewportSize({ width: 390, height: 844 });
  await bootServed(page);

  const fullHeight = await page
    .locator("#per-me-block")
    .evaluate((el) => el.getBoundingClientRect().height);

  // ⚠️ QUESTO NUMERO È UNA MISURA, NON UNA SCELTA. Era 1002 px quando la riga
  // portava i nove fatti del DTI; è 133,5 da quando ne porta tre — nome, ruolo
  // e squadra — e il tetto delle righe è UNO (Pico, 2026-08-31).
  //
  // DOVE VANNO I 133,5 px, ed è il fatto che questa misura mette in luce: 92
  // sono la NOTA e ~28 la riga. La targa della provenienza e i parametri
  // dichiarati costano oggi più del triplo del consiglio che annotano. È voluto
  // — senza di loro il consiglio sarebbe un oracolo — ma è un numero che
  // qualcuno deve poter guardare, e per questo sta scritto qui e non solo in un
  // totale.
  //
  // IL MASTRO DEL BUDGET NON VEDE ANCORA QUESTA SCENA, e la lacuna resta
  // dichiarata invece che nascosta: la fixture di
  // e2e/call-screen-budget.spec.ts non porta il deposito, quindi là il
  // sottoblocco è MUTO (78px) e l'allocazione di `giocatore-suggerito` è
  // misurata su quello stato — vedi PER_ME_POPOLATO_FUORI_DALLA_MISURA in
  // src/ui/callScreenBudget.ts, dove il divario è sceso da 924 a 55,5 px.
  expect(
    Math.round(fullHeight),
    `il sottoblocco pieno costa ${Math.round(fullHeight)}px a 390×844 (78 da muto)`,
  ).toBeLessThanOrEqual(PER_ME_FULL_HEIGHT_CEILING_PX);

  expect(externalRequests).toEqual([]);
});

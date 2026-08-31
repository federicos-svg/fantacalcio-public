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
 */
const PER_ME_FULL_HEIGHT_CEILING_PX = 1002;

// «PER ME» — I DUE ESITI VERI DEL SOTTOBLOCCO, SUL DOM VIVO.
//
// CHE COSA C'ERA QUI PRIMA, E PERCHÉ NON DESCRIVE PIÙ LA REALTÀ. Fino al
// 2026-08-31 questa spec asseriva un esito solo — `plan-absent`, «nessun piano
// rosa dichiarato» — perché il pannello PIANO ROSA era stato rimosso e con lui
// la sola sorgente di una dichiarazione: senza piano il sottoblocco taceva
// SEMPRE. Il piano non è più una dichiarazione a monte ma `PLAN*`, il piano
// dinamico (NOM-PROTOCOL-A §A.4), che si ricalcola dallo stato a ogni evento:
// quell'esito non esiste più, e una spec che continuasse ad aspettarselo
// sarebbe verde su una pagina che nessuno vede.
//
// LA COPERTURA CHE TORNA. Quella spec dichiarava di aver PERSO la catena
// end-to-end del gesto — clic, tastiera, fino alla schermata d'asta con QUEL
// giocatore — «perché il gesto non è raggiungibile». Adesso lo è: le righe
// arrivano a schermo, quindi la catena torna qui, provata sul DOM vivo e non
// promessa. È la stessa catena di e2e/bait-row.spec.ts §E15/E16, e riusa la
// stessa unica via che arma la CTA «Avvia» (`selectListonePlayer`).
//
// LA COPERTURA CHE RESTA. Il silenzio dichiarato non è sparito: ha cambiato
// motivo. Senza le previsioni servite non si forma nessun `V`, quindi il
// sottoblocco dice `no-forecast` — e le due pretese sul titolo nascosto
// («non occupa la vista» / «dà ancora il nome al blocco») restano dove erano.
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

test("con deposito e storico il pannello PARLA: tre righe, e ogni numero porta la sua provenienza", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_DEPOSIT_POOL, externalRequests);
  await bootServed(page);

  // IL TETTO RATIFICATO TRONCA DAVVERO: tre righe, non sessanta.
  const rows = page.locator("#per-me-rows .per-me-row");
  await expect(rows).toHaveCount(3);
  await expect(page.locator("#per-me-empty")).toHaveCount(0);

  const first = rows.first();
  // `V` COL SUO MARCHIO — la targa arriva dal dato servito, non da una
  // costante della vista.
  await expect(first).toContainText(`V `);
  await expect(first).toContainText(`(generatore ${PER_ME_GEN_RECIPE})`);
  // IL SURPLUS È LA SOTTRAZIONE, coi due addendi accanto: si rifà a mano.
  await expect(first).toContainText(/S [+−]\d+ cr \(\d+ − \d+\)/);
  // IL PREZZO ATTESO COI TRE QUALIFICATORI OBBLIGATORI (§B.3): scalare, `n`,
  // scarti tipici e bias firmato. Mai una banda «da X a Y».
  await expect(first).toContainText(/atteso \d+ cr · su \d+ aste simili · tipicamente −\d+\/\+\d+/);
  await expect(first).toContainText(/tende a sbagliare (basso|alto)|non tende a sbagliare/);
  await expect(first).not.toContainText(/\bda \d+ a \d+\b/);
  // I DUE FATTI DI SCARSITÀ, due conteggi.
  await expect(first).toContainText(/\d+ alternativ[ae] a scendere nel ruolo/);
  await expect(first).toContainText(/\d+ rival[ei] eleggibil[ei] con slot/);
  // L'APPETIBILITÀ RESTA UN FATTO MOSTRATO anche da quando non ordina più.
  await expect(first).toContainText(/\d+ª di \d+ per appetibilità/);
  // LA SCOMPOSIZIONE DELL'INFLAZIONE MISURATA non è sparita con l'ancora.
  await expect(first).toContainText(/ancora \d+ cr \(Qt\.A \d+ ·/);
  // L'ALLOCAZIONE DINAMICA DEL RUOLO, con l'etichetta di chi l'ha decisa, e il
  // max bid come fatto a sé.
  await expect(first).toContainText(/(nel|fuori dal) piano A \(\d+ cr \/ \d+ slot · piano ricalcolato adesso\)/);
  await expect(first).toContainText(/max bid \d+ cr/);

  // LA NOTA: ordine per esteso, parametri, ratifica e letture aperte.
  const note = page.locator("#per-me-note");
  await expect(note).toContainText(
    "ordine: piano → surplus → alternative a scendere → V → chiave di listone",
  );
  await expect(note).toContainText("piano ricalcolato adesso «NOM-DYN@-1»");
  await expect(note).toContainText("3 righe al massimo (ratificato da Pico il 2026-08-31)");
  await expect(note).not.toContainText("provvisorio");
  await expect(note).toContainText("NON RATIFICATE");

  // NESSUN VERBO DI PREVISIONE O DI DESIDERIO nel testo reso: la guardia di
  // deriva vive in src/ui/perMeRow.test.ts, qui si verifica che ciò che arriva
  // DAVVERO a schermo non la contraddica.
  const testo = (await page.locator("#per-me-block").textContent()) ?? "";
  expect(testo).not.toMatch(/valore|vale |conviene|affare|occasion|sconto|preved|probabil|stima/i);

  expect(externalRequests).toEqual([]);
});

test("il marcatore «⚑ adesso» compare solo su una riga che il piano copre", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_DEPOSIT_POOL, externalRequests);
  await bootServed(page);

  // Il marcatore è la congiunzione di due fatti già definiti — `withinPlan` e
  // `isCliff` — e non una soglia nuova. Sul DOM la metà verificabile è che non
  // possa comparire su una riga FUORI dal piano.
  const marks = page.locator("#per-me-rows .per-me-row__now");
  const count = await marks.count();
  for (let i = 0; i < count; i++) {
    const row = page.locator("#per-me-rows .per-me-row").filter({ has: marks.nth(i) });
    await expect(row).toContainText("nel piano");
  }
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

  const second = page.locator("#per-me-rows .per-me-row").nth(1);
  await second.focus();
  await expect(second).toBeFocused();
  const nome = (await second.locator(".per-me-row__name").textContent()) ?? "";
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

  // ⚠️ QUESTO NUMERO È UNA MISURA, NON UNA SCELTA, ed è il costo vero dei fatti
  // che il DTI ha portato sulla riga: `V` con la sua targa, il prezzo atteso
  // coi tre qualificatori, il surplus, il costo per vincere adesso, i due
  // conteggi di scarsità, l'appetibilità, l'ancora e l'allocazione del piano.
  //
  // IL MASTRO DEL BUDGET NON LO VEDE, e la lacuna è dichiarata invece che
  // nascosta: la fixture di e2e/call-screen-budget.spec.ts non porta il
  // deposito, quindi là il sottoblocco è MUTO (78px) e l'allocazione di
  // `giocatore-suggerito` è misurata su quello stato — vedi
  // PER_ME_POPOLATO_FUORI_DALLA_MISURA in src/ui/callScreenBudget.ts. Il tetto
  // sta QUI perché è qui che la scena piena esiste.
  expect(
    Math.round(fullHeight),
    `il sottoblocco pieno costa ${Math.round(fullHeight)}px a 390×844 (78 da muto)`,
  ).toBeLessThanOrEqual(PER_ME_FULL_HEIGHT_CEILING_PX);

  expect(externalRequests).toEqual([]);
});

import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard, readLocalStorageJson } from "./helpers.js";

// PLAN-01 — IL PIANO ROSA (VIVO), a schermo.
//
// packages/engine/src/livePlan.ts calcolava il piano rosa vivo per intero —
// `livePlan()`, `validateRolePlan()`, riallocazione dichiarata riga per riga —
// e nessuna schermata lo importava: `grep` su `src/` non trovava un solo
// import. Questa spec verifica il cablaggio dal lato dell'operatore: quello che
// lui vede, con la tastiera e con lo schermo, non lo stato interno.
//
// LE DUE COSE CHE QUESTA SPEC ESISTE PER PROVARE, e che nessun'altra prova:
//  1. il piano ASSENTE non fa comparire nessun numero di piano — non «lo
//     nasconde»: non c'è proprio, e al suo posto c'è la frase che dice perché;
//  2. «non dichiarato» e «dichiarato zero» NON hanno la stessa resa a schermo.
//     Sono due decisioni diverse di Owner e in asta portano a due offerte
//     diverse; qui si guarda il testo della cella target, che è dove la
//     differenza deve sopravvivere.
//
// Tutte le righe di listone sono sintetiche e il network guard aborta
// qualunque richiesta esterna.

const TARGET = SYNTHETIC_LISTONE_POOL[3]!; // ruolo A
const PLAN_STORAGE_KEY = "fac_role_plan";

/** Il testo della sola cella target di un ruolo: è lì che i due silenzi si
 *  separano, non nella scheda intera (che porta anche slot e riserva). */
function targetCell(page: Page, role: string) {
  return page.locator(`#role-plan-${role} .role-plan__target`);
}

async function declare(page: Page, role: string, value: string): Promise<void> {
  await page.locator(`#role-plan-target-${role}`).fill(value);
}

async function declareFullPlan(page: Page): Promise<void> {
  await declare(page, "P", "20");
  await declare(page, "D", "80");
  await declare(page, "C", "140");
  await declare(page, "A", "210");
  await page.locator("#role-plan-version").fill("pre-asta 1");
}

test("senza piano dichiarato il pannello mostra i fatti misurati e nessun numero di piano", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  // Il pannello vive su Rose, come AVVERSARI TIER-1, e non sulla schermata Asta.
  await expect(page.locator("#role-plan-panel")).toHaveCount(0);
  await gotoScreen(page, "Rose");
  await expect(page.locator("#role-plan-panel")).toBeVisible();

  await expect(page.locator("#role-plan-state")).toContainText("Nessun piano dichiarato");
  await expect(page.locator("#role-plan-state")).toContainText("non ne propone");

  // Quattro schede, una per ruolo, tutte senza numeri di piano.
  await expect(page.locator("#role-plan-grid > .role-plan__card")).toHaveCount(4);
  for (const role of ["P", "D", "C", "A"]) {
    await expect(targetCell(page, role)).toContainText("non dichiarato");
    // La cella target non porta NESSUNA cifra: un piano assente non produce un
    // numero, nemmeno uno zero di comodo.
    expect(await targetCell(page, role).innerText()).not.toMatch(/\d/);
    await expect(page.locator(`#role-plan-${role}`)).not.toContainText("allocazione viva");
    await expect(page.locator(`#role-plan-${role}`)).not.toContainText("scostamento");
  }

  // I fatti misurati ci sono lo stesso: il pannello non tace su ciò che sa.
  await expect(page.locator("#role-plan-P")).toContainText("slot 0/3");
  await expect(page.locator("#role-plan-P")).toContainText("riserva");

  // I totali di piano non esistono senza piano.
  await expect(page.locator("#role-plan-totals")).toBeHidden();
  await expect(page.locator("#role-plan-declared-total")).toContainText("Nessun target dichiarato");

  // E il pannello dichiara da sé di non essere un consiglio.
  await expect(page.locator("#role-plan-note")).toContainText("Nessun valore");
  await expect(page.locator("#role-plan-note")).toContainText("nessun suggerimento di acquisto");
  expect(externalRequests).toEqual([]);
});

test("«non dichiarato» e «dichiarato zero» restano due rese diverse a schermo", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Rose");

  // Tre ruoli su quattro: il piano resta incompleto e lo dice nominando il buco.
  await declare(page, "D", "80");
  await declare(page, "C", "140");
  await declare(page, "A", "210");
  await page.locator("#role-plan-version").fill("pre-asta 1");
  await expect(page.locator("#role-plan-state")).toContainText("Piano incompleto");
  await expect(page.locator("#role-plan-state")).toContainText("Portieri: nessun target dichiarato");
  await expect(page.locator("#role-plan-state")).toContainText("NON è un ruolo a zero");
  await expect(targetCell(page, "P")).toContainText("non dichiarato");
  const undeclaredCell = await targetCell(page, "P").innerText();

  // Lo stesso ruolo dichiarato a ZERO è un'altra cosa: il piano diventa completo
  // e il motore lo esegue.
  await declare(page, "P", "0");
  await expect(page.locator("#role-plan-state")).toContainText("Piano dichiarato «pre-asta 1»");
  const zeroCell = await targetCell(page, "P").innerText();
  expect(zeroCell).toContain("0 cr");
  expect(zeroCell).not.toContain("non dichiarato");
  expect(zeroCell).not.toBe(undeclaredCell);

  // Target 0 => nessun credito riallocato al ruolo: resta la sola riserva dura.
  await expect(page.locator("#role-plan-P")).toContainText("residuo di piano 0 cr");
  await expect(page.locator("#role-plan-P")).toContainText("allocazione viva 3 cr");

  // Svuotare il campo TORNA a «non dichiarato», non a zero.
  await declare(page, "P", "");
  await expect(targetCell(page, "P")).toContainText("non dichiarato");
  await expect(page.locator("#role-plan-state")).toContainText("Piano incompleto");
  expect(externalRequests).toEqual([]);
});

test("con un piano completo il pannello mostra target, riserve e scostamento durante l'asta", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Rose");
  await declareFullPlan(page);

  await expect(page.locator("#role-plan-state")).toContainText("ripartizione in proporzione ai tuoi target residui");
  await expect(page.locator("#role-plan-declared-total")).toContainText("Totale dichiarato: 450 cr su 4 ruoli di 4");
  await expect(page.locator("#role-plan-totals")).toContainText("Rosa completabile");
  await expect(page.locator("#role-plan-totals")).toContainText("Budget libero vero: 50 cr");
  await expect(page.locator("#role-plan-A")).toContainText("target");
  await expect(page.locator("#role-plan-A")).toContainText("210 cr");
  await expect(page.locator("#role-plan-A")).toContainText("scostamento 0 cr");

  // Un acquisto REALE, dalla schermata d'asta, e il piano si ricalcola: è il
  // «navigatore dopo una svolta sbagliata» del contratto del motore.
  await gotoScreen(page, "Asta");
  await page.getByText(TARGET.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-team").selectOption("Io");
  await page.locator("#assign-price").fill("240");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  await gotoScreen(page, "Rose");
  await expect(page.locator("#role-plan-A")).toContainText("speso 240 cr");
  // Sopra il piano di 30: lo scostamento è una PAROLA più una cifra, mai il
  // solo colore.
  await expect(page.locator("#role-plan-A")).toContainText("SOPRA PIANO +30 cr");
  await expect(page.locator("#role-plan-A")).toContainText("residuo di piano 0 cr");
  expect(externalRequests).toEqual([]);
});

test("la dichiarazione sopravvive al reload, e il ruolo non dichiarato non diventa zero", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Rose");

  await declare(page, "D", "80");
  await page.locator("#role-plan-version").fill("pre-asta 1");
  await expect(page.locator("#role-plan-declared-total")).toContainText("su 1 ruolo di 4");

  const stored = await readLocalStorageJson<{ targets: Record<string, number> }>(page, PLAN_STORAGE_KEY);
  expect(stored).not.toBeNull();
  // La chiave del ruolo non dichiarato NON esiste nella copia conservata: se
  // esistesse a 0, il giro attraverso lo storage avrebbe preso una decisione al
  // posto di Owner.
  expect(Object.keys(stored!.targets)).toEqual(["D"]);

  await page.reload();
  await gotoScreen(page, "Rose");
  await expect(page.locator("#role-plan-D")).toContainText("80 cr");
  await expect(targetCell(page, "P")).toContainText("non dichiarato");
  await expect(page.locator("#role-plan-target-D")).toHaveValue("80");
  await expect(page.locator("#role-plan-target-P")).toHaveValue("");
  expect(externalRequests).toEqual([]);
});

test("il piano si dichiara da tastiera, il fuoco si vede, e un input rifiutato non corregge il numero", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Rose");

  // Tastiera: si arriva al campo, si scrive, e il pannello reagisce senza mouse.
  await page.locator("#role-plan-target-P").focus();
  await expect(page.locator("#role-plan-target-P")).toBeFocused();
  await page.keyboard.type("20");
  await expect(targetCell(page, "P")).toContainText("20 cr");

  // La riga di feedback è una regione `aria-live`, e resta VUOTA sul caso
  // normale: una conferma per ogni cifra digitata verrebbe letta ad alta voce a
  // ogni tasto («target 2 salvato», «target 20 salvato»). Il salvataggio
  // riuscito si vede già nella scheda qui sopra; qui finiscono solo le due cose
  // che lo schermo non dice da sé.
  await expect(page.locator("#role-plan-feedback")).toHaveAttribute("role", "status");
  await expect(page.locator("#role-plan-feedback")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#role-plan-feedback")).toHaveText("");

  // Il fuoco da tastiera è visibile: .field-input azzera l'outline nativo, e
  // senza la regola :focus-visible di questo modulo non si vedrebbe nulla.
  const outline = await page
    .locator("#role-plan-target-P")
    .evaluate((el) => getComputedStyle(el).outlineWidth);
  expect(outline).not.toBe("0px");

  // Un valore rifiutato lascia visibile ciò che è stato digitato e NON lo
  // corregge d'ufficio: il target resta quello di prima.
  await page.locator("#role-plan-target-D").fill("-5");
  await expect(page.locator("#role-plan-feedback")).toContainText("non può essere negativo");
  await expect(page.locator("#role-plan-target-D")).toHaveAttribute("aria-invalid", "true");
  await expect(targetCell(page, "D")).toContainText("non dichiarato");

  // Ogni campo ha un'etichetta che basta da sola, e il modulo spiega la
  // differenza fra campo vuoto e zero.
  await expect(page.getByText("Target Portieri (crediti)", { exact: true })).toBeVisible();
  await expect(page.locator("#role-plan-target-hint")).toContainText("Campo vuoto = ruolo non dichiarato");
  await expect(page.locator("#role-plan-target-hint")).toContainText("Scrivere 0 è un'altra cosa");

  // Il pulsante di azzeramento riporta tutto a «non dichiarato».
  await page.locator("#role-plan-clear").click();
  await expect(page.locator("#role-plan-state")).toContainText("Nessun piano dichiarato");
  await expect(page.locator("#role-plan-target-P")).toHaveValue("");
  expect(externalRequests).toEqual([]);
});

test("un piano che il motore rifiuta viene riportato, non corretto", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Rose");

  await declare(page, "P", "100");
  await declare(page, "D", "100");
  await declare(page, "C", "200");
  await declare(page, "A", "200");
  await page.locator("#role-plan-version").fill("troppo");

  await expect(page.locator("#role-plan-state")).toContainText("Piano rifiutato dal motore");
  await expect(page.locator("#role-plan-state")).toContainText("supera la dotazione iniziale di lega");
  // Nessun numero di piano viene mostrato su un piano che non passa la
  // validazione, e i target restano scritti come sono stati scritti.
  await expect(page.locator("#role-plan-totals")).toBeHidden();
  await expect(page.locator("#role-plan-P")).not.toContainText("allocazione viva");
  await expect(targetCell(page, "P")).toContainText("100 cr");
  expect(externalRequests).toEqual([]);
});

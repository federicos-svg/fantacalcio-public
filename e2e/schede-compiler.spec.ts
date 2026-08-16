// COMPILARE UNA SCHEDA SENZA MAI VEDERE DEL JSON — il giro vero, misurato.
//
// Il problema che questa schermata risolve è misurato in ore: ~200 schede,
// fra i 20 secondi di una magra e i 90 di una piena, contro uno schema
// `.strict()` e un lettore fail-closed che rifiuta il file INTERO al primo
// refuso. Questa spec percorre il giro per cui esiste: scelgo un giocatore dal
// listone, compilo, salvo, RICARICO LA PAGINA, la scheda è ancora lì, scarico
// il deposito — e il contenuto del file scaricato passa il contratto vero,
// `parseExpertSchedaDeposit`, importato da `src/` e non riscritto qui.
//
// L'ASSERZIONE PIÙ FORTE È L'ULTIMA, ed è quella che il resto serve a
// preparare: il deposito scaricato, ridato in pasto a `resolveExpertInsight`
// con la stessa riga di listone da cui la scheda è stata scritta, rende
// `available` coi valori compilati. Cioè: il file che Pico deposita si vede
// davvero durante l'asta. Un test che si fermasse a «il JSON è valido»
// lascerebbe passare intatto il difetto peggiore di questo riquadro — la
// scheda scritta, depositata e mai resa perché l'identità non combacia.
//
// Solo fixture sintetiche: le righe del listone e i nomi vengono da
// e2e/fixtures/, e il network guard aborta (registrandola) qualunque altra
// richiesta.

import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { SCHEDA_CLUB, SCHEDA_PLAYER } from "./fixtures/synthetic-schede.js";
import { gotoScreen, installSyntheticNetworkGuard, openSettingsSection } from "./helpers.js";
import {
  SCHEDA_NOTA_MAX,
  parseExpertSchedaDeposit,
  resolveExpertInsight,
} from "../src/expertScheda.js";

const SCHEDA_DRAFTS_KEY = "fac_scheda_drafts";
const TOTAL_ROWS = SYNTHETIC_LISTONE_POOL.length;
const TARGET_OPTION = `${SCHEDA_PLAYER} (${SCHEDA_CLUB})`;
const NOTA = "Ballottaggio aperto da tre amichevoli: da rileggere prima dell'asta.";

async function openSchede(page: Page): Promise<void> {
  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "schede");
  await expect(page.locator("#schede-settings")).toBeVisible();
}

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#search-player")).toBeVisible();
  await openSchede(page);
}

/** Compila il modulo già aperto con una scheda piena. */
async function fillFullScheda(page: Page): Promise<void> {
  await page.locator("#schede-titolarita").selectOption("ballottaggio");
  await page.locator("#schede-percentuale").fill("60");
  await page.locator("#schede-gerarchia").fill("2");
  await page.locator("#schede-rigori").selectOption("designato");
  await page.locator("#schede-fonte").selectOption("scheda");
  await page.locator("#schede-aggiornata").fill("2026-08-30");
  await page.locator("#schede-piazzati-punizioni").check();
  await page.locator("#schede-avvisi-mercato").check();
  await page.locator("#schede-nota").fill(NOTA);
}

test("il giro completo: scelgo, compilo, salvo, ricarico, scarico — e il file si vede in asta", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await boot(page);

  // L'avanzamento delle due ore, al primo frame: zero su tutte le righe.
  await expect(page.locator("#schede-progress-count")).toHaveText(
    `0 su ${TOTAL_ROWS} righe del listone — ne mancano ${TOTAL_ROWS}`,
  );
  await expect(page.locator("#schede-progress-percent")).toHaveText("0%");
  await expect(page.locator("#schede-list-empty")).toBeVisible();

  // Il deposito non viene offerto finché non c'è niente da depositare, e lo
  // dice invece di consegnare un file vuoto.
  await expect(page.locator("#schede-download")).toBeDisabled();
  await expect(page.locator("#schede-deposit-status")).toContainText("Nessuna scheda scritta");

  // ── SI SCEGLIE UNA RIGA, non si scrive un nome ──────────────────────────
  await page.locator("#schede-player").selectOption({ label: TARGET_OPTION });
  await expect(page.locator("#schede-form-title")).toContainText(TARGET_OPTION);
  // Non esiste un campo di testo per nome e squadra: solo la nota è libera.
  await expect(page.locator("#schede-form input[type=text]")).toHaveCount(0);

  await fillFullScheda(page);
  await expect(page.locator("#schede-nota-counter")).toHaveText(
    `${NOTA.length} / ${SCHEDA_NOTA_MAX} caratteri`,
  );

  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-notice")).toContainText(`Scheda salvata: ${SCHEDA_PLAYER}`);
  await expect(page.locator("#schede-progress-count")).toHaveText(
    `1 su ${TOTAL_ROWS} righe del listone — ne mancano ${TOTAL_ROWS - 1}`,
  );
  await expect(page.locator("#schede-progress-percent")).toHaveText("25%");
  await expect(page.locator("#schede-list")).toContainText(TARGET_OPTION);
  await expect(page.locator("#schede-list")).toContainText("ballottaggio 60%");
  await expect(page.locator("#schede-list")).toContainText("rigori: designato");
  await expect(page.locator("#schede-persist-error")).toHaveCount(0);

  // ── IL LAVORO NON SI PERDE ────────────────────────────────────────────────
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
  await openSchede(page);
  await expect(page.locator("#schede-progress-count")).toHaveText(
    `1 su ${TOTAL_ROWS} righe del listone — ne mancano ${TOTAL_ROWS - 1}`,
  );
  await expect(page.locator("#schede-list")).toContainText(TARGET_OPTION);

  // ── IL DEPOSITO SCARICATO ─────────────────────────────────────────────────
  await expect(page.locator("#schede-download")).toBeEnabled();
  await expect(page.locator("#schede-deposit-status")).toContainText("Deposito pronto: 1 scheda");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#schede-download").click(),
  ]);
  expect(download.suggestedFilename()).toBe("schede_gruppo_esperti.json");
  const path = await download.path();
  expect(path, "il file scaricato deve esistere su disco").not.toBeNull();
  const text = readFileSync(path as string, "utf8");

  // Il contratto vero, nel runner: non una riscrittura della sua regola.
  const store = parseExpertSchedaDeposit(text);
  expect(store.ok, "il deposito scaricato deve passare parseExpertSchedaDeposit").toBe(true);

  // E la scheda si AGGANCIA alla riga da cui è stata scritta: è questo il
  // difetto invisibile che la scelta da listone rende impossibile.
  const view = resolveExpertInsight(store, { name: SCHEDA_PLAYER, club: SCHEDA_CLUB });
  expect(view.availability).toBe("available");
  expect(view.titolarita).toBe("ballottaggio");
  expect(view.percentuale).toBe(60);
  expect(view.gerarchia).toBe(2);
  expect(view.rigori).toBe("designato");
  expect(view.piazzati).toEqual(["punizioni"]);
  expect(view.avvisi).toEqual(["mercato"]);
  expect(view.nota).toBe(NOTA);
  expect(view.aggiornata).toBe("2026-08-30");
  expect(view.fonte).toBe("scheda");
  // I tre fatti di onestà restano letterali anche su una scheda compilata qui.
  expect([view.validated, view.directive, view.contributesToIndex]).toEqual([false, false, false]);

  expect(pageErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test("una scheda sbagliata si corregge e si cancella, senza ricominciare", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  await page.locator("#schede-player").selectOption({ label: TARGET_OPTION });
  await page.locator("#schede-titolarita").selectOption("titolare");
  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-list")).toContainText("titolare");

  // MODIFICA: si riapre com'era, non da vuota.
  const rowKey = `${SCHEDA_PLAYER}__${SCHEDA_CLUB}`.toLowerCase().replace(/\s+/g, "-");
  await page.locator(`#schede-edit-${rowKey}`).click();
  await expect(page.locator("#schede-titolarita")).toHaveValue("titolare");
  await expect(page.locator("#schede-form-title")).toContainText("Correggi");
  await page.locator("#schede-titolarita").selectOption("riserva");
  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-list")).toContainText("riserva");
  await expect(page.locator("#schede-list")).not.toContainText("titolare");
  // Una correzione non crea una seconda scheda.
  await expect(page.locator("#schede-progress-count")).toContainText(`1 su ${TOTAL_ROWS}`);

  // CANCELLAZIONE IN DUE TEMPI: il primo clic chiede, il secondo esegue.
  await page.locator(`#schede-delete-${rowKey}`).click();
  await expect(page.locator(`#schede-delete-${rowKey}`)).toHaveText("Confermi?");
  await page.locator(`#schede-delete-cancel-${rowKey}`).click();
  await expect(page.locator(`#schede-delete-${rowKey}`)).toHaveText("Cancella");
  await expect(page.locator("#schede-list")).toContainText(TARGET_OPTION);

  await page.locator(`#schede-delete-${rowKey}`).click();
  await page.locator(`#schede-delete-${rowKey}`).click();
  await expect(page.locator("#schede-list-empty")).toBeVisible();
  await expect(page.locator("#schede-progress-count")).toContainText(`0 su ${TOTAL_ROWS}`);
  await expect(page.locator("#schede-download")).toBeDisabled();

  expect(externalRequests).toEqual([]);
});

test("i rifiuti si leggono, e la nota non viene mai tagliata da sola", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  await page.locator("#schede-player").selectOption({ label: TARGET_OPTION });

  // Una scheda vuota non è una scheda: il riquadro la leggerebbe come
  // «nessun segnale esperto», e il contatore delle due ore salirebbe su un
  // lavoro che a schermo non esiste.
  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-error-scheda")).toBeVisible();
  await expect(page.locator("#schede-progress-count")).toContainText(`0 su ${TOTAL_ROWS}`);

  // Una percentuale senza titolarità verrebbe salvata e MAI resa: si rifiuta
  // dicendolo, invece di perderla in silenzio.
  await page.locator("#schede-percentuale").fill("60");
  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-error-percentuale")).toContainText("titolarità");

  // La nota oltre il limite: il testo resta INTERO nel campo, il contatore
  // dichiara di quanto si è lunghi e il salvataggio si rifiuta.
  await page.locator("#schede-percentuale").fill("");
  const tooLong = "x".repeat(SCHEDA_NOTA_MAX + 5);
  await page.locator("#schede-nota").fill(tooLong);
  await expect(page.locator("#schede-nota")).toHaveValue(tooLong);
  await expect(page.locator("#schede-nota-counter")).toContainText("5 di troppo");
  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-error-nota")).toContainText(String(SCHEDA_NOTA_MAX));
  await expect(page.locator("#schede-nota")).toHaveValue(tooLong);
  await expect(page.locator("#schede-progress-count")).toContainText(`0 su ${TOTAL_ROWS}`);

  // Corretta la nota, la stessa scheda passa.
  await page.locator("#schede-nota").fill("Nota entro il limite.");
  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-progress-count")).toContainText(`1 su ${TOTAL_ROWS}`);

  expect(externalRequests).toEqual([]);
});

test("una scrittura che non attecchisce viene DETTA, e il lavoro resta a schermo", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  // Lo storage accetta la scrittura e non conserva niente: il caso in cui due
  // ore di lavoro sparirebbero senza un solo errore. Solo la chiave delle
  // schede, così storico e riconferme restano intatti.
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patched(this: Storage, k: string, v: string): void {
      if (k === key) return;
      return original.call(this, k, v);
    };
  }, SCHEDA_DRAFTS_KEY);
  await boot(page);

  await page.locator("#schede-player").selectOption({ label: TARGET_OPTION });
  await page.locator("#schede-titolarita").selectOption("titolare");
  await page.locator("#schede-save").click();

  // La schermata lo dice, e non butta via ciò che è stato scritto.
  await expect(page.locator("#schede-persist-error")).toBeVisible();
  await expect(page.locator("#schede-persist-error")).toContainText("NON SALVATA");
  await expect(page.locator("#schede-list")).toContainText(TARGET_OPTION);
  await expect(page.locator("#schede-progress-count")).toContainText(`1 su ${TOTAL_ROWS}`);
  // E il deposito resta scaricabile: è l'unica via d'uscita che rimane.
  await expect(page.locator("#schede-download")).toBeEnabled();

  expect(externalRequests).toEqual([]);
});

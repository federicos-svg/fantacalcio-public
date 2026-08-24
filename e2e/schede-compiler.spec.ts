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

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  OTHER_CLUB,
  OTHER_PLAYER,
  SCHEDA_CLUB,
  SCHEDA_PLAYER,
} from "./fixtures/synthetic-schede.js";
import {
  AA_NORMAL_TEXT,
  gotoScreen,
  installSyntheticNetworkGuard,
  openSettingsSection,
  textContrast,
} from "./helpers.js";
import {
  SCHEDA_BALLOTTAGGIO_MAX,
  SCHEDA_NOTA_MAX,
  parseExpertSchedaDeposit,
  resolveExpertInsight,
} from "../src/expertScheda.js";
import { PAGELLA_TOTALE_MAX } from "../src/pagellaEsperti.js";

const SCHEDA_DRAFTS_KEY = "fac_scheda_drafts";
const TOTAL_ROWS = SYNTHETIC_LISTONE_POOL.length;
const TARGET_OPTION = `${SCHEDA_PLAYER} (${SCHEDA_CLUB})`;
const OTHER_OPTION = `${OTHER_PLAYER} (${OTHER_CLUB})`;
/** La chiave di riga con cui il pannello nomina i pulsanti di una scheda. */
const TARGET_ROW_KEY = `${SCHEDA_PLAYER.toLowerCase().replace(/\s+/g, "-")}__${SCHEDA_CLUB.toLowerCase()}`;
const NOTA = "Ballottaggio aperto da tre amichevoli: da rileggere prima dell'asta.";

/**
 * DOVE VIVONO I FILE DI QUESTA SPEC, e perché non in `testInfo.outputPath()`.
 *
 * `outputPath()` costruisce la cartella dal TITOLO del test, e i titoli di
 * questa spec sono in italiano: «…è ancora lì», «…dice perché». Con un accento
 * nel percorso, `setInputFiles` in questo ambiente RIESCE senza fare niente —
 * nessun evento `change`, nessun errore, nessuna traccia — e il test fallisce
 * dieci righe più in basso su un'asserzione che non c'entra. Misurato: la
 * stessa identica sequenza passa da un test col titolo in ASCII e fallisce da
 * uno col titolo accentato.
 *
 * Quindi i file di prova stanno in una cartella temporanea di sistema con un
 * nome ASCII, fuori dal repository, creata e rimossa da questa spec.
 */
let fixtureDir = "";
test.beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), "fac-schede-"));
});
test.afterEach(() => {
  if (fixtureDir !== "") rmSync(fixtureDir, { recursive: true, force: true });
  fixtureDir = "";
});

/** Un percorso ASCII per un file di prova di questa spec. */
function fixturePath(name: string): string {
  return join(fixtureDir, name);
}

/** Scarica il deposito e lo salva dove la spec potrà riaprirlo come file. */
async function saveDeposit(page: Page, path: string): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#schede-download").click(),
  ]);
  await download.saveAs(path);
  return readFileSync(path, "utf8");
}

/** Sceglie un giocatore, compila una scheda minima e la salva. */
async function writeScheda(page: Page, option: string, titolarita: string, nota?: string): Promise<void> {
  await page.locator("#schede-player").selectOption({ label: option });
  await page.locator("#schede-titolarita").selectOption(titolarita);
  if (nota !== undefined) await page.locator("#schede-nota").fill(nota);
  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-form")).toHaveCount(0);
}

/** Svuota il browser come farebbe una cronologia cancellata o un'altra macchina. */
async function wipeBrowser(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
  await openSchede(page);
}

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

/**
 * Compila il modulo già aperto con una scheda piena — PIENA DAVVERO, cioè con
 * tutti e dodici i campi che il contratto ammette.
 *
 * Fino a ieri erano nove: `ballottaggio`, `lista` e `pagella` esistevano nel
 * contratto e non avevano nessun controllo da toccare qui. Questa funzione è
 * l'unico posto in cui la spec dichiara che cosa vuol dire «piena», ed è
 * apposta: quando il contratto crescerà ancora, la guardia strutturale di
 * src/schedaCompiler.test.ts diventerà rossa e questo sarà il posto in cui
 * rimediare.
 */
async function fillFullScheda(page: Page): Promise<void> {
  await page.locator("#schede-titolarita").selectOption("ballottaggio");
  await page.locator("#schede-percentuale").fill("60");
  // Con CHI se la gioca: si SCEGLIE da una riga del listone, come il giocatore.
  await page.locator("#schede-ballottaggio-nome-0").selectOption(OTHER_PLAYER);
  await page.locator("#schede-ballottaggio-quota-0").fill("40");
  await page.locator("#schede-gerarchia").fill("2");
  await page.locator("#schede-rigori").selectOption("designato");
  await page.locator("#schede-lista").selectOption("consigliato");
  await page.locator("#schede-fonte").selectOption("scheda");
  await page.locator("#schede-aggiornata").fill("2026-08-30");
  await page.locator("#schede-piazzati-punizioni").check();
  await page.locator("#schede-avvisi-mercato").check();
  // La pagella: il quarto asse è «Bonus» perché questa riga è di movimento.
  await page.locator("#schede-pagella-titolarita").fill("9");
  await page.locator("#schede-pagella-media-voto").fill("7");
  await page.locator("#schede-pagella-salute").fill("9");
  await page.locator("#schede-pagella-bonus").fill("6");
  await page.locator("#schede-pagella-consiglio").fill("8");
  await page.locator("#schede-pagella-totale").fill("39");
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
  // I TRE CAMPI CHE IL CONTRATTO AMMETTEVA E CHE NESSUNO POTEVA SCRIVERE.
  // Non basta che finiscano nel file: devono ARRIVARE ALLA VISTA, che è la
  // metà del giro in cui si perdevano prima ancora di esistere.
  expect(view.ballottaggio).toEqual([{ surface: OTHER_PLAYER, sharePercent: 40 }]);
  expect(view.lista).toBe("consigliato");
  expect(view.pagella.completa).toBe(true);
  expect(view.pagella.votiPresenti).toBe(5);
  expect(view.pagella.totaleRicalcolato).toBe(39);
  expect(view.pagella.totaleFonte).toBe(39);
  expect(view.pagella.verificaTotale).toBe("coerente");
  // Qui la riga viene passata SENZA ruolo, quindi il quarto asse è quello che
  // la scheda dichiara: `asseAtteso` resta `null`, e non viene indovinato.
  expect(view.pagella.asseAtteso).toBeNull();
  expect(view.pagella.asseDichiarato).toBe("pagella_bonus");
  expect(view.pagella.asseIncoerente).toBe(false);
  // Con il ruolo della riga accanto — come lo passa l'app — l'asse atteso e
  // quello scritto coincidono: la casella compilata è quella giusta.
  const conRuolo = resolveExpertInsight(store, {
    name: SCHEDA_PLAYER,
    club: SCHEDA_CLUB,
    role: "A",
  });
  expect(conRuolo.pagella.asseAtteso).toBe("pagella_bonus");
  expect(conRuolo.pagella.asseIncoerente).toBe(false);
  expect(conRuolo.pagella.assi[3]?.voto).toBe(6);
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

// ── IL GIRO SI CHIUDE ────────────────────────────────────────────────────────
//
// Le due ore di compilazione sono distribuite su più sere e il deposito finisce
// su Drive. Finché usciva a senso unico, il lavoro viveva SOLO in
// `localStorage`: un browser pulito, un'altra macchina o una cronologia
// svuotata e spariva senza un errore. Queste tre spec provano l'anello intero —
// scrivo, scarico, azzero il browser, ricarico il file, ritrovo tutto, correggo
// e riscarico — e le due cose che l'anello non deve mai fare: fondere da sola,
// e lasciarsi rompere da un file che non va.

test("il giro si chiude: scarico, azzero il browser, ricarico il file e il lavoro è ancora lì", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  // Due schede, come due sere di lavoro.
  await writeScheda(page, TARGET_OPTION, "ballottaggio", NOTA);
  await writeScheda(page, OTHER_OPTION, "riserva");
  await expect(page.locator("#schede-progress-count")).toContainText(`2 su ${TOTAL_ROWS}`);

  const depositPath = fixturePath("schede_gruppo_esperti.json");
  const firstText = await saveDeposit(page, depositPath);
  expect(parseExpertSchedaDeposit(firstText).ok).toBe(true);

  // Il browser pulito: è il caso in cui, senza rilettura, le due ore sparivano.
  await wipeBrowser(page);
  await expect(page.locator("#schede-progress-count")).toContainText(`0 su ${TOTAL_ROWS}`);
  await expect(page.locator("#schede-list-empty")).toBeVisible();

  // Si ricarica il file, e PRIMA di applicarlo il pannello dice che cosa farà.
  await page.locator("#schede-import-file").setInputFiles(depositPath);
  await expect(page.locator("#schede-import-headline")).toContainText("2 schede nel file");
  await expect(page.locator("#schede-import-headline")).toContainText("2 nuove");
  await expect(page.locator("#schede-import-headline")).toContainText("0 in conflitto");
  // Niente conflitti: non c'è niente da chiedere, il gesto è uno solo.
  await expect(page.locator("#schede-import-resolution")).toHaveCount(0);
  await expect(page.locator("#schede-import-confirm")).toBeEnabled();
  await page.locator("#schede-import-confirm").click();

  await expect(page.locator("#schede-notice")).toContainText("Deposito ripreso");
  await expect(page.locator("#schede-progress-count")).toContainText(`2 su ${TOTAL_ROWS}`);
  await expect(page.locator("#schede-list")).toContainText(TARGET_OPTION);
  await expect(page.locator("#schede-list")).toContainText(OTHER_OPTION);

  // IDENTICHE, non «più o meno»: il deposito riscaricato è byte per byte quello
  // di prima. È la definizione operativa di «il giro si chiude».
  const roundTripPath = fixturePath("round-trip.json");
  expect(await saveDeposit(page, roundTripPath)).toBe(firstText);

  // E da qui si continua: correggo una scheda tre sere dopo e riscarico.
  // Si sceglie per VALORE (la chiave di riga) e non per etichetta: dopo
  // l'importazione l'opzione porta il «✓» delle righe già scritte, ed è giusto
  // che lo porti — è il segno che quella riga è fatta.
  await page.locator("#schede-player").selectOption(TARGET_ROW_KEY);
  await expect(page.locator("#schede-titolarita")).toHaveValue("ballottaggio");
  await expect(page.locator("#schede-nota")).toHaveValue(NOTA);
  await page.locator("#schede-titolarita").selectOption("titolare");
  await page.locator("#schede-save").click();

  const correctedPath = fixturePath("corretto.json");
  const correctedText = await saveDeposit(page, correctedPath);
  const store = parseExpertSchedaDeposit(correctedText);
  expect(store.ok, "il deposito corretto deve passare il contratto").toBe(true);
  const view = resolveExpertInsight(store, { name: SCHEDA_PLAYER, club: SCHEDA_CLUB });
  expect(view.availability).toBe("available");
  expect(view.titolarita).toBe("titolare");
  expect(view.nota).toBe(NOTA);

  expect(externalRequests).toEqual([]);
});

test("sui conflitti non fonde da sola: chiede, e nessuna opzione è preselezionata", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  // La versione che finisce nel file.
  await writeScheda(page, TARGET_OPTION, "ballottaggio", "Versione del file.");
  const depositPath = fixturePath("deposito.json");
  await saveDeposit(page, depositPath);

  // Poi il lavoro va avanti in locale: una scheda corretta e una nuova.
  await page.locator(`#schede-edit-${TARGET_ROW_KEY}`).click();
  await page.locator("#schede-nota").fill("Versione di stasera.");
  await page.locator("#schede-save").click();
  await writeScheda(page, OTHER_OPTION, "titolare");

  await page.locator("#schede-import-file").setInputFiles(depositPath);
  await expect(page.locator("#schede-import-headline")).toContainText("1 in conflitto");
  await expect(page.locator("#schede-import-conflicts")).toContainText(SCHEDA_PLAYER);

  // L'anteprima si legge, come tutto il resto: esiste solo dietro un gesto, e
  // e2e/text-contrast-aa.spec.ts non la incontrerebbe mai. Misurata qui, col
  // codice di misura di helpers.ts — non una seconda copia.
  for (const sel of ["#schede-import-headline", "#schede-import-conflicts"]) {
    expect(await textContrast(page, sel), `import: ${sel}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  }

  // NESSUNA OPZIONE PRESELEZIONATA, e il pulsante non si può premere finché
  // Pico non ha scelto: è ciò che rende impossibile una fusione automatica.
  await expect(page.locator("#schede-import-resolution")).toHaveValue("");
  await expect(page.locator("#schede-import-confirm")).toBeDisabled();

  await page.locator("#schede-import-resolution").selectOption("keep-local");
  await expect(page.locator("#schede-import-confirm")).toBeEnabled();
  await page.locator("#schede-import-confirm").click();

  // «Tieni le mie»: la locale resta, e la scheda che il file non nomina è intatta.
  await expect(page.locator("#schede-notice")).toContainText("tenendo le tue");
  await expect(page.locator("#schede-list")).toContainText(OTHER_OPTION);
  await expect(page.locator("#schede-progress-count")).toContainText(`2 su ${TOTAL_ROWS}`);
  const keptPath = fixturePath("tenute-le-mie.json");
  const keptText = await saveDeposit(page, keptPath);
  expect(keptText).toContain("Versione di stasera.");
  expect(keptText).not.toContain("Versione del file.");

  // Lo stesso file, con l'altra risposta: adesso vince il file, e solo sulla
  // riga in conflitto.
  await page.locator("#schede-import-file").setInputFiles(depositPath);
  await page.locator("#schede-import-resolution").selectOption("take-file");
  await page.locator("#schede-import-confirm").click();
  await expect(page.locator("#schede-notice")).toContainText("sostituita con quella del file");
  const finalPath = fixturePath("finale.json");
  const finalText = await saveDeposit(page, finalPath);
  expect(finalText).toContain("Versione del file.");
  expect(finalText).not.toContain("Versione di stasera.");
  // La scheda mai nominata dal file è sopravvissuta a entrambe le importazioni.
  expect(finalText).toContain(OTHER_PLAYER);

  expect(externalRequests).toEqual([]);
});

test("un file che non va non tocca niente, e dice perché", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  await writeScheda(page, TARGET_OPTION, "titolare", "Le mie due ore.");
  const before = await page.evaluate((k) => localStorage.getItem(k), SCHEDA_DRAFTS_KEY);

  const brokenPath = fixturePath("rotto.json");
  writeFileSync(brokenPath, '{"schemaVersion":1,"schede":[{"player":"Dario Placeholder"}', "utf8");
  await page.locator("#schede-import-file").setInputFiles(brokenPath);
  await expect(page.locator("#schede-import-error")).toContainText("non è JSON leggibile");
  await expect(page.locator("#schede-import-preview")).toHaveCount(0);
  expect(
    await textContrast(page, "#schede-import-error"),
    "il motivo del rifiuto deve essere leggibile",
  ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);

  // Un JSON leggibile ma non conforme al contratto: stesso esito, altro motivo.
  const invalidPath = fixturePath("non-conforme.json");
  writeFileSync(
    invalidPath,
    JSON.stringify({ schemaVersion: 1, schede: [{ player: "Dario Placeholder", club: "ClubQuattro", value: 9 }] }),
    "utf8",
  );
  await page.locator("#schede-import-file").setInputFiles(invalidPath);
  await expect(page.locator("#schede-import-error")).toContainText("non è un deposito valido");

  // E dopo due rifiuti il lavoro è esattamente quello di prima, byte per byte.
  expect(await page.evaluate((k) => localStorage.getItem(k), SCHEDA_DRAFTS_KEY)).toBe(before);
  await expect(page.locator("#schede-progress-count")).toContainText(`1 su ${TOTAL_ROWS}`);
  await expect(page.locator("#schede-list")).toContainText(TARGET_OPTION);

  expect(externalRequests).toEqual([]);
});


// ── I TRE CAMPI CHE NESSUNO POTEVA SCRIVERE ──────────────────────────────────
//
// `ballottaggio`, `lista` e `pagella` erano nel contratto del deposito e non
// avevano nessun controllo in questa schermata: il campo che risponde a «quanti
// si contendono quel posto», la quarta icona accanto al radar e i cinque voti
// del radar stesso erano irraggiungibili per l'unica persona che può scriverli.
// Le due spec qui sotto misurano la via d'ingresso da capo a fondo — si
// compila, si salva, si scarica, si rilegge, il riquadro d'asta li mostra — e i
// due rifiuti che il modulo oppone invece di perdere il lavoro in silenzio.

test("i tre campi si compilano, si rileggono e tornano identici byte per byte", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await boot(page);

  await page.locator("#schede-player").selectOption({ label: TARGET_OPTION });

  // La riga di verifica del totale esiste PRIMA di ogni voto, e non dice zero.
  await expect(page.locator("#schede-pagella-verifica")).toContainText("Nessun voto scritto");
  await expect(page.locator("#schede-pagella-verifica")).toContainText("n/d");

  // Il quarto asse LO DECIDE IL RUOLO della riga: questa è di movimento, quindi
  // «Bonus», e la casella dei portieri non esiste affatto.
  await expect(page.locator("#schede-pagella-bonus")).toBeVisible();
  await expect(page.locator("#schede-pagella-porta-inviolata")).toHaveCount(0);

  await fillFullScheda(page);

  // La verifica del totale è viva mentre si compila, e con cinque voti su
  // cinque dice che i due numeri tornano.
  await expect(page.locator("#schede-pagella-verifica")).toContainText("5 voti su 5");
  await expect(page.locator("#schede-pagella-verifica")).toContainText("Tornano");

  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-form")).toHaveCount(0);

  // Il riassunto rilegge i tre campi senza riaprire la scheda.
  await expect(page.locator("#schede-list")).toContainText(`con: ${OTHER_PLAYER} 40%`);
  await expect(page.locator("#schede-list")).toContainText("lista: consigliato");
  await expect(page.locator("#schede-list")).toContainText("pagella: 5/5 voti, somma 39/50");

  // Riaperta, la scheda torna nel modulo com'era: nessun campo si perde per
  // strada, che è l'intero punto della correzione a tre sere di distanza.
  await page.locator(`#schede-edit-${TARGET_ROW_KEY}`).click();
  await expect(page.locator("#schede-ballottaggio-nome-0")).toHaveValue(OTHER_PLAYER);
  await expect(page.locator("#schede-ballottaggio-quota-0")).toHaveValue("40");
  await expect(page.locator("#schede-lista")).toHaveValue("consigliato");
  await expect(page.locator("#schede-pagella-bonus")).toHaveValue("6");
  await expect(page.locator("#schede-pagella-totale")).toHaveValue("39");
  await page.locator("#schede-close").click();

  // ── IL GIRO SI CHIUDE ANCHE CON LA PAGELLA DENTRO ─────────────────────────
  // L'ordine delle chiavi del compilatore deve essere quello dello schema, o
  // scarico → reimporto → riscarico renderebbe un file diverso a parità di
  // contenuto. Misurato: senza quella regola questo confronto è rosso.
  const depositPath = fixturePath("tre-campi.json");
  const firstText = await saveDeposit(page, depositPath);
  await wipeBrowser(page);
  await page.locator("#schede-import-file").setInputFiles(depositPath);
  await page.locator("#schede-import-confirm").click();
  await expect(page.locator("#schede-notice")).toContainText("Deposito ripreso");
  const roundTripPath = fixturePath("tre-campi-round-trip.json");
  expect(await saveDeposit(page, roundTripPath)).toBe(firstText);

  // ── LA GEOMETRIA A 390px ──────────────────────────────────────────────────
  // Il modulo ha guadagnato due blocchi di campi: a telefono deve restare una
  // colonna sola, senza scorrimento laterale.
  await page.locator("#schede-player").selectOption(TARGET_ROW_KEY);
  await expect(page.locator("#schede-pagella")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#schede-ballottaggio")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    "il modulo delle schede non deve far scorrere la pagina di lato a 390px",
  ).toBe(true);

  expect(pageErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test("i due rifiuti dei campi nuovi si leggono, e il lavoro resta a schermo", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await boot(page);

  await page.locator("#schede-player").selectOption({ label: TARGET_OPTION });

  // 1. GLI ALTRI DEL BALLOTTAGGIO SENZA LA TITOLARITÀ CHE LI MOSTRA.
  //    Il riquadro d'asta li scarterebbe (`resolveExpertInsight`): scritti e mai
  //    resi. Qui la perdita diventa una domanda.
  await page.locator("#schede-titolarita").selectOption("titolare");
  await page.locator("#schede-ballottaggio-nome-0").selectOption(OTHER_PLAYER);
  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-error-ballottaggio")).toContainText("ballottaggio");
  await expect(page.locator("#schede-progress-count")).toContainText(`0 su ${TOTAL_ROWS}`);
  // Il nome scelto è ancora lì: il rifiuto non butta via il lavoro.
  await expect(page.locator("#schede-ballottaggio-nome-0")).toHaveValue(OTHER_PLAYER);

  // Corretta la titolarità, la stessa scheda passa — e il tetto del contratto
  // è visibile nella legenda del blocco.
  await expect(page.locator("#schede-ballottaggio legend")).toContainText(
    String(SCHEDA_BALLOTTAGGIO_MAX),
  );
  await page.locator("#schede-titolarita").selectOption("ballottaggio");
  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-progress-count")).toContainText(`1 su ${TOTAL_ROWS}`);

  // 2. IL QUARTO ASSE DI UN ALTRO RUOLO, su una scheda ripresa da un deposito
  //    scritto altrove: la casella compare in più, segnata, e si può togliere.
  //    Nasconderla avrebbe lasciato un valore incorreggibile in un modulo che
  //    si rifiuta di salvare.
  const straneoPath = fixturePath("asse-di-un-altro-ruolo.json");
  writeFileSync(
    straneoPath,
    JSON.stringify({
      schemaVersion: 1,
      schede: [
        {
          player: OTHER_PLAYER,
          club: OTHER_CLUB,
          titolarita: "titolare",
          pagella: { voti: { pagella_titolarita: 9, pagella_bonus: 6 } },
        },
      ],
    }),
    "utf8",
  );
  await page.locator("#schede-import-file").setInputFiles(straneoPath);
  await page.locator("#schede-import-confirm").click();
  await expect(page.locator("#schede-notice")).toContainText("Deposito ripreso");

  const otherRowKey = `${OTHER_PLAYER.toLowerCase().replace(/\s+/g, "-")}__${OTHER_CLUB.toLowerCase()}`;
  await page.locator(`#schede-edit-${otherRowKey}`).click();
  // Questa riga è un PORTIERE: l'asse atteso è «porta inviolata», e il «bonus»
  // che la scheda porta compare marcato come asse di un altro ruolo.
  await expect(page.locator("#schede-pagella-porta-inviolata")).toBeVisible();
  await expect(page.locator("#schede-pagella-bonus")).toHaveValue("6");
  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-error-pagella")).toContainText("Porta inviolata");
  await expect(page.locator("#schede-pagella-bonus")).toHaveValue("6");

  // Tolto il voto straniero, la scheda passa e il totale non viene fabbricato.
  await page.locator("#schede-pagella-bonus").fill("");
  await expect(page.locator("#schede-pagella-verifica")).toContainText("1 voto su 5");
  await expect(page.locator("#schede-pagella-verifica")).not.toContainText(
    `/${PAGELLA_TOTALE_MAX},`,
  );
  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-errors")).toHaveCount(0);
  await expect(page.locator("#schede-progress-count")).toContainText(`2 su ${TOTAL_ROWS}`);

  expect(externalRequests).toEqual([]);
});

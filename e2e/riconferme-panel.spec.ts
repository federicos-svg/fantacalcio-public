// LE RICONFERME §4, ESERCITATE DALLA PORTA NUOVA — la casella di Rosa.
//
// ─────────────────────────────────────────────────────────────────────────────
// CHE COSA È CAMBIATO, ed è la ragione per cui questa spec è stata riscritta
// ─────────────────────────────────────────────────────────────────────────────
//
// Il pannello «Riconferme pre-asta» delle Impostazioni NON ESISTE PIÙ, e con
// lui tutto il suo contratto DOM (`#settings-tab-riconferme`,
// `#riconferme-grid`, `#riconferme-picker-*`, `#riconferme-price-*`,
// `#riconferme-confirm-*`, `#riconferme-slot-*`, `#riconferme-remove-*`,
// `#riconferme-error`). Il rinnovo si dichiara adesso dalla schermata ROSE: si
// clicca una casella VUOTA della griglia e si apre una modale a due schede —
// «Inserisci a mano» e «Rinnova dall'anno scorso».
//
// LA DIFFERENZA È SOSTANZIALE, non un cambio di selettori. Il vecchio pannello
// lasciava scegliere QUALUNQUE riga di listone del ruolo giusto e DIGITARE un
// prezzo a mano: due libertà che il regolamento non concede e che l'operatore
// pagava scoprendo il rifiuto solo al salvataggio. Il pannello RINNOVO non le
// concede: elenca solo i giocatori che quella squadra aveva DAVVERO l'anno
// scorso — letti dallo STORICO D'ASTA, deposito runtime-local
// `fac_auction_history` — e ciascuno al PREZZO PAGATO ALLORA, che non è
// modificabile. Da qui la scena di questa spec: senza storico seminato il
// pannello direbbe, con ragione, «nessuno storico d'asta caricato», e non ci
// sarebbe niente da riconfermare (fixtures/synthetic-listone-riconferme.ts).
//
// ─────────────────────────────────────────────────────────────────────────────
// CHE COSA QUESTA SPEC ESISTE PER IMPEDIRE
// ─────────────────────────────────────────────────────────────────────────────
//
// Le acceptance di #231 non sono cambiate — è cambiata la porta da cui si
// entra. Restano tutte, e questa spec le tiene inchiodate:
//
//   1. una riconferma inserita muove la fascia critica del prezzo confermato;
//   2. il riconfermato diventa non selezionabile altrove: nel listone porta la
//      pastiglia «Assegnato» e la sua riga smette di essere cliccabile;
//   3. la pastiglia «R» (`.roster-badge-confirmed`) compare sulla sua riga in Rose;
//   4. STORICO ACQUISTI non elenca MAI una riconferma: non è un evento del log,
//      quindi non ha nemmeno un «Annulla» a cui appoggiarsi;
//   5. la riconferma non è più dichiarabile appena lo storico dell'asta smette
//      di essere vuoto — dal 2026-08-30 NON piu: il rinnovo resta aperto e
//      a rifiutare e `renewalFeasibility`, caso per caso;
//   6. reload a metà asta: lo stato torna identico;
//   7. il tetto di ruolo di §4 (1 D, 1 C, 1 A, 0 P) e le sue frasi;
//   8. il rifiuto semantico del motore arriva a schermo UMANIZZATO, non come
//      codice di violazione;
//   9. nessuna chiave `fac_confirmations` al boot = batch vuoto, nessun banner,
//      nessuna schermata bloccata.
//
// ─────────────────────────────────────────────────────────────────────────────
// L'UNICA ACCEPTANCE CADUTA, e perché non è una perdita di copertura
// ─────────────────────────────────────────────────────────────────────────────
//
// «Un rifiuto si azzera cambiando scheda delle Impostazioni» (fix 7 del #285)
// non ha più un oggetto: quel rifiuto viveva in uno stato del pannello delle
// Impostazioni, ed è stato rimosso insieme al pannello. Il rifiuto della modale
// vive in `RosterSlotModal.error`, nasce e muore con la modale, e il suo
// azzeramento nel cambio scheda è già scritto dove accade (`renderRosterSlotModal`
// azzera `slot.error` sul click di ogni tab). Con lui cadono, per la stessa
// ragione e senza lasciare buchi, le prove che misuravano organi inesistenti:
// i nomi accessibili di picker/price/confirm, la nota «due stagioni di fila»,
// `#riconferme-readonly-note`, `#riconferme-lock-note` e la conservazione della
// bozza dopo un rifiuto (fix 6) — non c'è più nessuna bozza da conservare,
// perché non si digita più niente.
//
// Anche «il picker di un'altra squadra esclude il riconfermato» cambia forma:
// nel pannello nuovo l'elenco di una squadra è la SUA rosa dell'anno scorso,
// quindi il giocatore di un'altra squadra non ci compare per costruzione (ed è
// misurato qui sotto). La non-selezionabilità globale resta provata dove ora si
// vede davvero: il listone.
//
// Ogni riga della scena è sintetica e il network guard aborta qualunque altra
// cosa: `externalRequests` è vuoto alla fine di ogni test.

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  A_TARGET,
  C_TARGET,
  D_CEILING,
  D_OVER,
  D_TARGET,
  D_WHOLE,
  IO_EXCLUDED_D,
  IO_RENEWABLE_D,
  LAST_SEASON_PRICE,
  LIVE_PURCHASE_PLAYER,
  LIVE_PURCHASE_PRICE,
  PREVIOUS_SEASON,
  RICONFERME_LISTONE_POOL,
  RICONFERME_TARGET_PRICE,
  UNSEATED_TEAM_ID,
  seedRiconfermeScene,
} from "./fixtures/synthetic-listone-riconferme.js";
import {
  gotoScreen,
  installSyntheticNetworkGuard,
  readLocalStorageJson,
  selectStatusFilter,
} from "./helpers.js";
import { listonePlayerKey, type ListonePlayer } from "../src/ui/listone.js";
import { CONFIRMATIONS_STORAGE_KEY } from "../src/confirmationsStore.js";
import { INITIAL_BUDGET } from "../packages/engine/src/types.js";

/** Come il pannello scrive una riga: nome e club di OGGI, prezzo di allora. */
function renewalLabel(p: ListonePlayer): string {
  return `${p.name} (${p.club})`;
}

function renewButton(page: Page, p: ListonePlayer) {
  return page.locator(`#roster-slot-renew-${listonePlayerKey(p)}`);
}

/**
 * La scheda del posto «Io» in ROSE. NON si cerca per testo «Io»: da quando il
 * registro lega è seminato, l'intestazione porta il NOME DELLA PERSONA seduta
 * lì, non l'id del posto. Si ancora invece a una casella che quel posto ha
 * sempre e che questa suite non riempie mai — il primo slot da portiere.
 */
function ioCard(page: Page) {
  return page.locator(".panel--compact").filter({ has: page.locator("#roster-slot-Io-P-0") });
}

/** Apre la casella indicata e porta in primo piano la scheda RINNOVO. */
async function openRenewalPanel(page: Page, slotId: string): Promise<void> {
  await page.locator(`#${slotId}`).click();
  await expect(page.locator("#roster-slot-overlay")).toBeVisible();
  await page.locator("#roster-slot-tab-rinnovo").click();
  await expect(page.locator("#roster-slot-tab-rinnovo")).toHaveAttribute("aria-selected", "true");
}

/** Il boot condiviso: guardia di rete, listone caricato, scena seminata. */
async function bootScene(
  page: Page,
  context: BrowserContext,
  externalRequests: string[],
): Promise<void> {
  await installSyntheticNetworkGuard(context, RICONFERME_LISTONE_POOL, externalRequests);
  await page.goto("/");
  // Il listone deve essere DAVVERO caricato prima di toccare il rinnovo: senza
  // righe il pannello direbbe «no-pool», che è un altro silenzio e un'altra
  // prova.
  await expect(page.locator(".listone-row").first()).toBeVisible();
  await seedRiconfermeScene(page);
  await expect(page.locator(".listone-row").first()).toBeVisible();
}

test("la riconferma entra dalla casella vuota: muove la fascia critica, blocca il giocatore altrove, marchia la Rosa, non diventa mai un evento, si chiude a asta iniziata e sopravvive al reload", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await bootScene(page, context, externalRequests);

  await gotoScreen(page, "Rose");
  await expect(page.locator("#roster-slot-Io-D-0")).toHaveClass(/roster-slot--empty/);
  await openRenewalPanel(page, "roster-slot-Io-D-0");

  // La stagione da cui si rinnova è un FATTO DELLO STORICO, e il pannello la
  // dichiara invece di lasciarla intendere.
  await expect(page.locator("#roster-slot-renewal-season")).toContainText(PREVIOUS_SEASON);
  await expect(page.locator("#roster-slot-renewal-locked")).toHaveCount(0);
  await expect(page.locator("#roster-slot-renewal-empty")).toHaveCount(0);

  // L'ELENCO NON È IL LISTONE: è la rosa dell'anno scorso di QUESTA squadra, in
  // ordine di prezzo pagato decrescente, col prezzo di allora accanto.
  const list = page.locator("#roster-slot-renewal-list");
  await expect(list.locator(".roster-slot-dialog__row-name")).toHaveText(
    IO_RENEWABLE_D.map((r) => renewalLabel(r.player)),
  );
  await expect(list.locator(".roster-slot-dialog__row-price")).toHaveText(
    IO_RENEWABLE_D.map((r) => `${r.price} cr`),
  );
  // Le quattro assenze motivate: già rinnovato l'anno scorso (§4, mai due
  // stagioni di fila), di un'altra persona, di una stagione più vecchia, mai
  // stato nello storico.
  for (const excluded of IO_EXCLUDED_D) {
    await expect(renewButton(page, excluded)).toHaveCount(0);
  }
  // Il prezzo non è un campo: è scritto nel nome accessibile del bottone.
  await expect(renewButton(page, D_TARGET)).toHaveAccessibleName(
    `Rinnova ${D_TARGET.name} a ${RICONFERME_TARGET_PRICE} crediti`,
  );

  await renewButton(page, D_TARGET).click();
  await expect(page.locator("#roster-slot-overlay")).toHaveCount(0);

  const stored = await readLocalStorageJson<{ schemaVersion: number; confirmations: unknown[] }>(
    page,
    CONFIRMATIONS_STORAGE_KEY,
  );
  expect(stored?.confirmations).toHaveLength(1);

  // ACCEPTANCE 3 — la pastiglia «R» sulla riga del riconfermato.
  await expect(ioCard(page)).toContainText(D_TARGET.name);
  await expect(ioCard(page).locator(".roster-badge-confirmed")).toHaveCount(1);
  await expect(ioCard(page).locator(".roster-badge-confirmed")).toHaveAccessibleName("Riconfermato");

  // ACCEPTANCE 1 — la fascia critica si muove del prezzo confermato, che è
  // quello pagato l'anno scorso e non un numero digitato stasera.
  await gotoScreen(page, "Asta");
  await expect(page.locator("#critical-budget")).toHaveText(
    `${INITIAL_BUDGET - RICONFERME_TARGET_PRICE} cr`,
  );
  await expect(page.locator("#critical-spent")).toHaveText(`${RICONFERME_TARGET_PRICE} cr`);

  // ACCEPTANCE 2 — non selezionabile altrove: sparito dai «Liberi», e fra gli
  // «Assegnati» porta la pastiglia e perde la cliccabilità.
  await expect(page.locator(".listone-row", { hasText: D_TARGET.name })).toHaveCount(0);
  await selectStatusFilter(page, "assigned");
  const assignedRow = page.locator(".listone-row", { hasText: D_TARGET.name });
  await expect(assignedRow).toContainText("Assegnato");
  await expect(assignedRow).toHaveClass(/listone-row--assigned/);
  await expect(assignedRow).not.toHaveClass(/listone-row--clickable/);
  await selectStatusFilter(page, "available");

  // ACCEPTANCE 4 — STORICO ACQUISTI itera solo AuctionEvent, e una riconferma
  // non ne diventa mai uno: niente riga, e quindi niente «Annulla» a cui
  // appenderla.
  const storicoPanel = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(storicoPanel).toContainText("Nessun gesto registrato.");
  await expect(storicoPanel.getByText(D_TARGET.name)).toHaveCount(0);
  await expect(page.getByText("Annulla", { exact: true })).toHaveCount(0);

  // Un acquisto dal vivo rende NON VUOTO lo storico dell'asta.
  await page.locator(".listone-row", { hasText: LIVE_PURCHASE_PLAYER.name }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(LIVE_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  const budgetMidAuction = INITIAL_BUDGET - RICONFERME_TARGET_PRICE - LIVE_PURCHASE_PRICE;
  await expect(page.locator("#critical-budget")).toHaveText(`${budgetMidAuction} cr`);

  // ACCEPTANCE 5 — A META ASTA IL RINNOVO RESTA DICHIARABILE, e questa riga
  // misura il capovolgimento del 2026-08-30. Prima c'era un lucchetto sul solo
  // fatto che lo storico non fosse vuoto: costava piu di quanto proteggesse,
  // perche il primo inserimento manuale lo faceva scattare per sempre. La
  // riconferma continua a seminare t=0 — quello non e cambiato — ma a dire di
  // no e adesso lo stato ricomposto per davvero (`renewalFeasibility`), e qui
  // regge: il centrocampo ha il tetto §4 intatto e il budget capiente.
  await gotoScreen(page, "Rose");
  await openRenewalPanel(page, "roster-slot-Io-C-0");
  await expect(page.locator("#roster-slot-renewal-locked")).toHaveCount(0);
  await expect(page.locator("#roster-slot-renewal-list")).toBeVisible();
  await expect(renewButton(page, C_TARGET)).toBeVisible();
  await page.locator("#roster-slot-close").click();

  // ACCEPTANCE 6 — reload a metà asta: stato identico. La riconferma E
  // l'acquisto live sopravvivono entrambi, e la «R» resta solo sul primo.
  await page.reload();
  await gotoScreen(page, "Asta");
  await expect(page.locator("#critical-budget")).toHaveText(`${budgetMidAuction} cr`);
  await gotoScreen(page, "Rose");
  await expect(ioCard(page)).toContainText(D_TARGET.name);
  await expect(ioCard(page)).toContainText(LIVE_PURCHASE_PLAYER.name);
  await expect(ioCard(page).locator(".roster-badge-confirmed")).toHaveCount(1);

  expect(externalRequests).toEqual([]);
});

test("il rifiuto semantico del motore arriva a schermo umanizzato: il prezzo che rompe la riserva dura è rifiutato, quello al limite passa", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await bootScene(page, context, externalRequests);

  await gotoScreen(page, "Rose");
  await openRenewalPanel(page, "roster-slot-Io-D-0");

  // Il prezzo non si digita più: viene dallo storico. Il rifiuto quindi non
  // difende un campo, difende una MOSSA — ed è l'unica difesa rimasta contro
  // una rosa che a t=0 non sarebbe più completabile.
  await renewButton(page, D_OVER).click();
  await expect(page.locator("#roster-slot-error")).toBeVisible();
  await expect(page.locator("#roster-slot-error")).toContainText("completabile");
  await expect(page.locator("#roster-slot-error")).toBeInViewport();
  // Rifiutata: la modale resta aperta sull'elenco, e niente è stato scritto.
  await expect(page.locator("#roster-slot-renewal-list")).toBeVisible();
  expect(await readLocalStorageJson(page, CONFIRMATIONS_STORAGE_KEY)).toBeNull();

  // L'intero budget su una riconferma sola: stesso rifiuto, per la via del
  // residuo a zero invece che per un credito di troppo.
  await renewButton(page, D_WHOLE).click();
  await expect(page.locator("#roster-slot-error")).toContainText("completabile");
  expect(await readLocalStorageJson(page, CONFIRMATIONS_STORAGE_KEY)).toBeNull();

  // Il confine esatto, dal lato che passa: il rifiuto non è una diffidenza
  // generica verso i prezzi alti.
  await renewButton(page, D_CEILING).click();
  await expect(page.locator("#roster-slot-overlay")).toHaveCount(0);
  await expect(ioCard(page)).toContainText(D_CEILING.name);
  await gotoScreen(page, "Asta");
  await expect(page.locator("#critical-budget")).toHaveText(
    `${INITIAL_BUDGET - LAST_SEASON_PRICE.dCeiling} cr`,
  );

  expect(externalRequests).toEqual([]);
});

test("il tetto di ruolo §4 — un D, un C, un A, nessun P — e le sue frasi, ognuna diversa dall'altra", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await bootScene(page, context, externalRequests);
  await gotoScreen(page, "Rose");

  for (const [slotId, player] of [
    ["roster-slot-Io-D-0", D_TARGET],
    ["roster-slot-Io-C-0", C_TARGET],
    ["roster-slot-Io-A-0", A_TARGET],
  ] as const) {
    await openRenewalPanel(page, slotId);
    await renewButton(page, player).click();
    await expect(page.locator("#roster-slot-overlay")).toHaveCount(0);
  }

  const totalConfirmed =
    LAST_SEASON_PRICE.dTarget + LAST_SEASON_PRICE.cTarget + LAST_SEASON_PRICE.aTarget;
  await expect(ioCard(page).locator(".roster-badge-confirmed")).toHaveCount(3);
  await gotoScreen(page, "Asta");
  await expect(page.locator("#critical-budget")).toHaveText(
    `${INITIAL_BUDGET - totalConfirmed} cr`,
  );

  // Il tetto è UNA riconferma per ruolo: la seconda casella dello stesso ruolo
  // non offre più niente, e dice che è un tetto raggiunto — non «non hai
  // nessuno», che porterebbe a cercare il dato mancante invece della regola.
  await gotoScreen(page, "Rose");
  for (const slotId of ["roster-slot-Io-D-1", "roster-slot-Io-C-1", "roster-slot-Io-A-1"]) {
    await openRenewalPanel(page, slotId);
    const emptyNote = page.locator("#roster-slot-renewal-empty");
    await expect(emptyNote).toHaveAttribute("data-reason", "role-limit-reached");
    await expect(emptyNote).toContainText("una sola");
    await expect(page.locator("#roster-slot-renewal-list")).toHaveCount(0);
    await page.locator("#roster-slot-close").click();
  }

  // In porta il tetto è ZERO, e il silenzio è di un'altra specie: non è un
  // ruolo esaurito, è un ruolo che il regolamento non rinnova. Lo storico
  // seminato contiene un portiere comprato all'asta l'anno scorso proprio
  // perché questa distinzione non possa passare per mancanza di dati.
  await openRenewalPanel(page, "roster-slot-Io-P-0");
  await expect(page.locator("#roster-slot-renewal-empty")).toHaveAttribute(
    "data-reason",
    "role-not-renewable",
  );
  await expect(page.locator("#roster-slot-renewal-empty")).toContainText("portieri");

  expect(externalRequests).toEqual([]);
});

test("i silenzi del pannello dicono quale ostacolo togliere per primo: nessuno storico prima di tutto, poi il posto senza persona", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, RICONFERME_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator(".listone-row").first()).toBeVisible();

  // Senza seminare niente: nessuno storico E nessun posto assegnato. Il motivo
  // che esce è il PIÙ A MONTE dei due, perché è quello da togliere per primo.
  await gotoScreen(page, "Rose");
  await openRenewalPanel(page, "roster-slot-Io-D-0");
  await expect(page.locator("#roster-slot-renewal-empty")).toHaveAttribute(
    "data-reason",
    "no-history",
  );
  await expect(page.locator("#roster-slot-renewal-empty")).toContainText("storico");
  await page.locator("#roster-slot-close").click();

  // Con lo storico caricato, il posto senza persona resta muto per una ragione
  // sua: i precedenti seguono l'essere umano, non il posto a tavola.
  await seedRiconfermeScene(page);
  await expect(page.locator(".listone-row").first()).toBeVisible();
  await gotoScreen(page, "Rose");
  await openRenewalPanel(page, `roster-slot-${UNSEATED_TEAM_ID}-D-0`);
  await expect(page.locator("#roster-slot-renewal-empty")).toHaveAttribute(
    "data-reason",
    "seat-unassigned",
  );
  await expect(page.locator("#roster-slot-renewal-empty")).toContainText("persona");

  expect(externalRequests).toEqual([]);
});

test("nessuna chiave fac_confirmations al boot: batch vuoto, nessun banner, nessuna schermata bloccata", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await bootScene(page, context, externalRequests);

  expect(await readLocalStorageJson(page, CONFIRMATIONS_STORAGE_KEY)).toBeNull();
  await expect(page.locator("#confirmations-quarantine-banner")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /riconferme pre-asta non valide/i })).toHaveCount(0);
  await expect(page.locator("#critical-budget")).toHaveText(`${INITIAL_BUDGET} cr`);

  // E la griglia di Rose è intatta: caselle vuote, apribili, nessuna «R».
  await gotoScreen(page, "Rose");
  await expect(page.locator("#roster-slot-Io-D-0")).toHaveClass(/roster-slot--empty/);
  await expect(ioCard(page).locator(".roster-badge-confirmed")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

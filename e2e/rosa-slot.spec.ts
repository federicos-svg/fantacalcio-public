import { expect, test, type Locator, type Page } from "@playwright/test";
import { INITIAL_BUDGET } from "../packages/engine/src/types.js";
import { listonePlayerKey } from "../src/ui/listone.js";
import { gotoScreen, installSyntheticNetworkGuard, selectStatusFilter } from "./helpers.js";
import {
  A_ALFA,
  D_ALFA,
  D_BETA,
  D_DELTA,
  D_GAMMA,
  LAST_SEASON_PRICE,
  PREVIOUS_SEASON,
  ROSA_SLOT_POOL,
  seedRosaSlotScene,
} from "./fixtures/synthetic-rosa-slot.js";

// LA CASELLA DI ROSA È DIVENTATA UNA PORTA — e questa spec misura che cosa c'è
// dietro.
//
// IL CAMBIO CHE RENDE NECESSARIA QUESTA SPEC. Fino a ieri i quattro comandi
// della schermata ROSE (svincola, assegna, modifica budget, rinnova) aprivano
// una modale DEV STATICO che spiegava a parole che cosa avrebbero fatto in
// produzione: e2e/rose-screen.spec.ts prova esattamente quello — un controllo
// che si apre, dice di non essere attivo, e non tocca niente. Adesso ogni
// casella delle otto rose è un <button> che apre una modale a due schede, e
// ognuno dei quattro gesti scrive davvero: nel log dell'asta (inserimento,
// svincolo, scambio) o nel batch riconferme (rinnovo). Una promessa che prima
// era «non succede niente» è diventata «succede questo»: senza una prova che
// misura CHE COSA succede, la differenza fra le due non esisterebbe in CI.
//
// PERCHÉ OGNI SCENA VERIFICA TRE COSE E NON UNA. Un gesto che «funziona» qui
// non è un gesto che chiude la modale: è un gesto che (a) cambia la casella,
// (b) muove il credito residuo della squadra della cifra giusta, e (c) lascia
// nel posto giusto — o NON lascia — la sua traccia nello STORICO ACQUISTI. È
// la terza a distinguere i due modi di riempire una casella vuota: un
// inserimento manuale È un acquisto e nello storico ci va; una riconferma non
// lo è — fissa la rosa a t=0 (LEAGUE_RULES §4) — e lì non deve comparire mai.
// Una spec che si fermasse alla casella le confonderebbe.
//
// PERCHÉ I SILENZI SONO SOTTO PROVA QUANTO I GESTI. Il pannello rinnovo tace
// per sette motivi diversi (src/renewals.ts), e ognuno indirizza chi legge a
// togliere un ostacolo diverso: «i portieri non si riconfermano» e «questa
// squadra ha già usato il suo difensore» sono due schermate identiche se il
// motivo non viaggia con loro. Qui il motivo si legge dal DOM
// (`data-reason`), non dalla frase, così la prova regge anche se la frase
// viene riscritta.
//
// LA SCENA È SINTETICA E SEMINATA DALLA PORTA VERA. Cinque righe di listone
// inventate e uno storico d'asta a quattro casi (fixtures/synthetic-rosa-slot.
// ts), messi in `localStorage` — il canale da cui l'app li legge davvero al
// boot. Il network guard aborta qualunque altra richiesta, e ogni test chiude
// verificando che nessuna sia partita.

/** Prezzi dichiarati una volta sola: ogni attesa più sotto si deriva da qui. */
const PREZZO_ATTACCANTE = 25;
const PREZZO_DIFENSORE = 10;
const CONGUAGLIO = 5;
/** Quanto torna in cassa da uno svincolo concordato al tavolo: meno del
 *  pagato, perché la differenza «resta spesa» è metà del punto di §5. */
const CREDITI_RESTITUITI = 7;

const KEY_ALFA = listonePlayerKey(D_ALFA);
const KEY_BETA = listonePlayerKey(D_BETA);
const KEY_ATTACCANTE = listonePlayerKey(A_ALFA);

/** L'etichetta a schermo di un posto: la persona seduta lì (fixture), non l'id. */
const LABEL_IO = "Squadra Io";
const LABEL_DUE = "Squadra Due";

/** L'id di una casella, nella forma che renderRoseCard le dà. */
function slotId(teamId: string, role: "P" | "D" | "C" | "A", index: number): string {
  return `#roster-slot-${teamId}-${role}-${index}`;
}

/**
 * La scheda di una squadra, individuata dalla casella che c'è sempre — il
 * primo portiere — e mai dal suo nome: il nome è un dato della fixture che
 * cambia con lo storico, l'id della casella è il contratto.
 */
function teamCard(page: Page, teamId: string): Locator {
  return page
    .locator(".panel--compact")
    .filter({ has: page.locator(slotId(teamId, "P", 0)) });
}

/** Il credito residuo stampato sulla scheda, letto come numero. */
async function creditiResidui(page: Page, teamId: string): Promise<number> {
  const text = await teamCard(page, teamId)
    .locator("span")
    .filter({ hasText: /^\d+ cr$/ })
    .first()
    .innerText();
  return Number(text.replace(" cr", ""));
}

/**
 * Apre la scena: listone sintetico servito dal guard, storico e registro lega
 * seminati, schermata ROSE. Il controllo sulle righe di listone non è
 * decorativo — senza pool il pannello manuale mostrerebbe il suo silenzio
 * `#roster-slot-manual-empty` e ogni scena successiva misurerebbe quello.
 */
async function apriScenaRose(
  page: Page,
  context: import("@playwright/test").BrowserContext,
  externalRequests: string[],
): Promise<void> {
  await installSyntheticNetworkGuard(context, ROSA_SLOT_POOL, externalRequests);
  await page.goto("/");
  await seedRosaSlotScene(page);
  await expect(page.locator("#search-player")).toBeVisible();
  await expect(page.locator(".listone-row")).toHaveCount(ROSA_SLOT_POOL.length);
  await gotoScreen(page, "Rose");
  await expect(page.locator(".panel--compact")).toHaveCount(8);
}

/** Un inserimento manuale completo, dalla casella vuota alla modale chiusa. */
async function assegnaAMano(
  page: Page,
  teamId: string,
  role: "P" | "D" | "C" | "A",
  index: number,
  playerKey: string,
  price: number,
): Promise<void> {
  await page.locator(slotId(teamId, role, index)).click();
  await page.locator("#roster-slot-manual-player").selectOption(playerKey);
  await page.locator("#roster-slot-manual-price").fill(String(price));
  await page.locator("#roster-slot-manual-apply").click();
  await expect(page.locator("#roster-slot-overlay")).toHaveCount(0);
}

// ── 1. La casella vuota si presenta per quello che è ─────────────────────────
//
// Le due schede di una casella vuota sono i due modi in cui un giocatore entra
// in rosa FUORI dalla chiamata, e non sono intercambiabili: una pesca dal
// listone di quest'anno, l'altra dalla rosa dell'anno scorso col prezzo di
// allora. Che la modale non offra qui «svincola» e «scambia» — gesti di
// USCITA, privi di senso su una casella senza nessuno dentro — è parte del
// contratto tanto quanto le due schede che offre.
test("una casella vuota apre sull'inserimento manuale e offre solo i due gesti di ingresso", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriScenaRose(page, context, externalRequests);

  const casella = page.locator(slotId("Io", "D", 0));
  await expect(casella).toHaveClass(/roster-slot--empty/);
  await casella.click();

  await expect(page.locator("#roster-slot-overlay")).toBeVisible();
  // Il titolo nomina il RUOLO e la SQUADRA: aperte otto schede da otto
  // caselle uguali, è l'unica cosa che dice su quale si sta agendo.
  await expect(page.locator("#roster-slot-title")).toHaveText(
    `Slot Difensore libero — ${LABEL_IO}`,
  );

  await expect(page.locator("#roster-slot-tab-manuale")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#roster-slot-tab-rinnovo")).toHaveAttribute("aria-selected", "false");
  await expect(page.locator("#roster-slot-tab-svincolo")).toHaveCount(0);
  await expect(page.locator("#roster-slot-tab-scambio")).toHaveCount(0);

  // Il pannello aperto è quello manuale, con i suoi tre comandi vivi.
  await expect(page.locator("#roster-slot-manual-player")).toBeVisible();
  await expect(page.locator("#roster-slot-manual-price")).toBeVisible();
  await expect(page.locator("#roster-slot-manual-apply")).toBeEnabled();
  // Il silenzio «nessun listone» è l'altro ramo, e qui non deve esserci.
  await expect(page.locator("#roster-slot-manual-empty")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

// ── 2. L'inserimento manuale è un acquisto, con tutte le sue conseguenze ─────
//
// «Vale come un acquisto a tutti gli effetti» è la frase del pannello, e qui
// viene presa alla lettera in tre punti: la casella, il credito e lo STORICO
// ACQUISTI. Il terzo è quello che nessuna ispezione della schermata ROSE
// potrebbe vedere, ed è anche quello che rende il gesto ANNULLABILE come ogni
// altro acquisto: un inserimento che non entrasse nel log sarebbe una spesa
// senza ricevuta.
//
// La coda della scena misura il cancello che ne discende: da log non vuoto in
// poi il rinnovo si chiude, perché le riconferme fissano rosa e budget a t=0 e
// aggiungerne una a partita cominciata riscriverebbe il punto di partenza
// sotto acquisti già registrati.
test("l'inserimento manuale entra nel log dell'asta, paga il budget, e da lì in poi chiude il rinnovo", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriScenaRose(page, context, externalRequests);

  expect(await creditiResidui(page, "Io")).toBe(INITIAL_BUDGET);

  await assegnaAMano(page, "Io", "A", 0, KEY_ATTACCANTE, PREZZO_ATTACCANTE);

  const casella = page.locator(slotId("Io", "A", 0));
  await expect(casella).toHaveClass(/roster-slot--filled/);
  await expect(casella).toContainText(A_ALFA.name);
  await expect(casella).toContainText(String(PREZZO_ATTACCANTE));
  expect(await creditiResidui(page, "Io")).toBe(INITIAL_BUDGET - PREZZO_ATTACCANTE);

  // Non è una riconferma: niente pastiglia «R» su una casella comprata.
  await expect(casella.locator(".roster-badge-confirmed")).toHaveCount(0);

  // La ricevuta, dove le ricevute vivono.
  await gotoScreen(page, "Asta");
  const storico = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(storico).toContainText(A_ALFA.name);
  await expect(storico).toContainText(`${PREZZO_ATTACCANTE} cr`);

  // E adesso il rinnovo tace, con la sua ragione dichiarata.
  await gotoScreen(page, "Rose");
  await page.locator(slotId("Io", "D", 0)).click();
  await page.locator("#roster-slot-tab-rinnovo").click();
  await expect(page.locator("#roster-slot-renewal-locked")).toBeVisible();
  // Chiuso vuol dire chiuso: nessuna riga rinnovabile resta cliccabile.
  await expect(page.locator("#roster-slot-renewal-list")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

// ── 3. Il rinnovo pesca dallo storico, non dal listone ───────────────────────
//
// È la differenza che questa scena esiste per misurare. Il listone sintetico
// ha quattro difensori; i difensori RINNOVABILI da questo posto sono due, e
// non perché ne siano stati scelti due a caso: Gamma è fuori perché era già
// una riconferma l'anno scorso (§4 non ammette due stagioni di fila) e Delta
// perché era di un'altra squadra. Un pannello che stampasse il listone
// mostrerebbe tutti e quattro; uno che stampasse «la rosa dell'anno scorso»
// ne mostrerebbe tre. Entrambi gli errori sono visibili solo se la prova
// nomina le due assenze, quindi le nomina.
//
// L'ORDINE è parte del contratto e non un dettaglio estetico: prezzo
// decrescente, perché il rinnovo che pesa di più sul budget è la decisione da
// guardare per prima. Beta (31) prima di Alfa (14) lo dimostra su numeri che
// nel listone di quest'anno sono ordinati al contrario (Beta 20, Alfa 12): se
// la vista ordinasse per quotazione l'elenco uscirebbe uguale, quindi la
// fixture li tiene deliberatamente discordi.
test("il rinnovo elenca solo i rinnovabili, in ordine di prezzo pagato, e non passa dallo storico acquisti", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriScenaRose(page, context, externalRequests);

  await page.locator(slotId("Io", "D", 0)).click();
  await page.locator("#roster-slot-tab-rinnovo").click();
  await expect(page.locator("#roster-slot-tab-rinnovo")).toHaveAttribute("aria-selected", "true");

  // La stagione da cui si rinnova è detta, non lasciata intendere.
  await expect(page.locator("#roster-slot-renewal-season")).toContainText(PREVIOUS_SEASON);

  const lista = page.locator("#roster-slot-renewal-list");
  await expect(lista.locator(".roster-slot-dialog__row-name")).toHaveText([
    `${D_BETA.name} (${D_BETA.club})`,
    `${D_ALFA.name} (${D_ALFA.club})`,
  ]);
  await expect(lista.locator(".roster-slot-dialog__row-price")).toHaveText([
    `${LAST_SEASON_PRICE.beta} cr`,
    `${LAST_SEASON_PRICE.alfa} cr`,
  ]);
  // Le due assenze, nominate.
  await expect(lista).not.toContainText(D_GAMMA.name);
  await expect(lista).not.toContainText(D_DELTA.name);

  await page.locator(`#roster-slot-renew-${KEY_BETA}`).click();
  await expect(page.locator("#roster-slot-overlay")).toHaveCount(0);

  // La riconferma entra in rosa PRIMA di ogni acquisto (seq < 0), ed è quello
  // che la pastiglia «R» racconta a chi guarda la griglia.
  const casella = page.locator(slotId("Io", "D", 0));
  await expect(casella).toHaveClass(/roster-slot--filled/);
  await expect(casella).toContainText(D_BETA.name);
  await expect(casella).toContainText(String(LAST_SEASON_PRICE.beta));
  await expect(casella.locator(".roster-badge-confirmed")).toHaveText("R");

  // Il prezzo è quello PAGATO ALLORA, non la quotazione di oggi: il budget
  // scende di 31, non di 20.
  expect(await creditiResidui(page, "Io")).toBe(INITIAL_BUDGET - LAST_SEASON_PRICE.beta);

  // E non è un acquisto: nello storico non compare, né col nome né col
  // prezzo. Una riconferma non è un gesto d'asta — vive nel batch riconferme,
  // non nel log — e vederla lì sopra racconterebbe una serata che non c'è
  // stata, con un annullamento possibile su un evento che non esiste.
  await gotoScreen(page, "Asta");
  const storico = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(storico).not.toContainText(D_BETA.name);
  await expect(storico).not.toContainText(`${LAST_SEASON_PRICE.beta} cr`);

  expect(externalRequests).toEqual([]);
});

// ── 4. I silenzi del rinnovo dicono quale ostacolo togliere ──────────────────
//
// Due silenzi che si somigliano a schermo e non c'entrano niente l'uno con
// l'altro: «il regolamento non ammette riconferme di portieri» è definitivo e
// non dipende da niente di caricato; «questa squadra ha già usato la sua
// riconferma di ruolo» dipende da un gesto appena compiuto ed è reversibile.
// Il DOM li distingue con `data-reason`, e la prova legge quello e non la
// frase: la frase è testo di prodotto e può essere riscritta, il vocabolario
// dei motivi è chiuso (src/renewals.ts) e non deve fondersi.
test("il rinnovo che non ha righe dice perché: i portieri non si riconfermano, il difensore è già stato usato", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriScenaRose(page, context, externalRequests);

  await page.locator(slotId("Io", "P", 0)).click();
  await page.locator("#roster-slot-tab-rinnovo").click();
  const vuoto = page.locator("#roster-slot-renewal-empty");
  await expect(vuoto).toHaveAttribute("data-reason", "role-not-renewable");
  await expect(page.locator("#roster-slot-renewal-list")).toHaveCount(0);
  await page.locator("#roster-slot-close").click();
  await expect(page.locator("#roster-slot-overlay")).toHaveCount(0);

  // Un difensore rinnovato: la riconferma di ruolo è una sola (§4).
  await page.locator(slotId("Io", "D", 0)).click();
  await page.locator("#roster-slot-tab-rinnovo").click();
  await page.locator(`#roster-slot-renew-${KEY_ALFA}`).click();
  await expect(page.locator("#roster-slot-overlay")).toHaveCount(0);

  // La casella accanto — stesso ruolo, stessa squadra — adesso tace, e con
  // un motivo diverso da quello del portiere: Alfa era e resta rinnovabile,
  // solo non c'è più posto per lui.
  await page.locator(slotId("Io", "D", 1)).click();
  await page.locator("#roster-slot-tab-rinnovo").click();
  await expect(page.locator("#roster-slot-renewal-empty")).toHaveAttribute(
    "data-reason",
    "role-limit-reached",
  );

  expect(externalRequests).toEqual([]);
});

// ── 5. La casella occupata: svincolo ─────────────────────────────────────────
//
// §5 QUI È UN FATTO CITATO, NON UN CAMPO PRECOMPILATO, e la spec misura
// esattamente quella distinzione: il pannello dice quanto sarebbe il recupero
// per l'aggiudicazione oltre budget, e lascia scrivere il numero a chi sa
// quale dei due svincoli sta guardando. Da qui la scena svincola a una cifra
// DIVERSA dalla metà: se il credito salisse del prezzo pagato — o della metà
// regolamentare — invece che della cifra dichiarata, la differenza si
// vedrebbe solo così.
//
// IL CAMPO VUOTO È IL SECONDO MEZZO TEST, e non è pedanteria: leggere un
// campo bianco come zero significherebbe bruciare l'intero prezzo per una
// distrazione, in modo silenzioso e irreversibile senza rileggere il log.
test("lo svincolo cita §5, rifiuta il campo bianco, e restituisce i crediti dichiarati liberando il giocatore", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriScenaRose(page, context, externalRequests);

  await assegnaAMano(page, "Io", "A", 0, KEY_ATTACCANTE, PREZZO_ATTACCANTE);
  const dopoAcquisto = await creditiResidui(page, "Io");
  expect(dopoAcquisto).toBe(INITIAL_BUDGET - PREZZO_ATTACCANTE);

  await page.locator(slotId("Io", "A", 0)).click();
  // Su una casella piena i gesti sono i due di USCITA, e si apre sul primo.
  await expect(page.locator("#roster-slot-title")).toHaveText(`${A_ALFA.name} — ${LABEL_IO}`);
  await expect(page.locator("#roster-slot-tab-svincolo")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#roster-slot-tab-scambio")).toHaveAttribute("aria-selected", "false");
  await expect(page.locator("#roster-slot-tab-manuale")).toHaveCount(0);
  await expect(page.locator("#roster-slot-tab-rinnovo")).toHaveCount(0);

  // Il prezzo pagato e il numero del regolamento, entrambi detti.
  const regola = page.locator("#roster-slot-release-rule");
  await expect(regola).toContainText("§5");
  await expect(regola).toContainText(`${Math.ceil(PREZZO_ATTACCANTE / 2)} cr`);

  // Il campo bianco è un rifiuto: nessuno svincolo, modale ancora aperta.
  await page.locator("#roster-slot-release-apply").click();
  await expect(page.locator("#roster-slot-error")).toBeVisible();
  await expect(page.locator("#roster-slot-error")).toHaveAttribute("role", "alert");
  await expect(page.locator("#roster-slot-overlay")).toBeVisible();
  await page.locator("#roster-slot-close").click();
  await expect(page.locator(slotId("Io", "A", 0))).toHaveClass(/roster-slot--filled/);
  expect(await creditiResidui(page, "Io")).toBe(dopoAcquisto);

  // Lo svincolo vero, alla cifra concordata al tavolo.
  await page.locator(slotId("Io", "A", 0)).click();
  await page.locator("#roster-slot-release-credits").fill(String(CREDITI_RESTITUITI));
  await page.locator("#roster-slot-release-apply").click();
  await expect(page.locator("#roster-slot-overlay")).toHaveCount(0);

  const casella = page.locator(slotId("Io", "A", 0));
  await expect(casella).toHaveClass(/roster-slot--empty/);
  await expect(casella).not.toContainText(A_ALFA.name);
  // Torna in cassa la cifra DICHIARATA, non il prezzo pagato: la differenza
  // resta spesa.
  expect(await creditiResidui(page, "Io")).toBe(dopoAcquisto + CREDITI_RESTITUITI);

  // «Chi è ancora di qualcuno»: svincolato vuol dire di nuovo comprabile.
  await gotoScreen(page, "Asta");
  await selectStatusFilter(page, "available");
  await expect(page.locator(".listone-row", { hasText: A_ALFA.name })).toHaveCount(1);

  expect(externalRequests).toEqual([]);
});

// ── 6. La casella occupata: scambio ──────────────────────────────────────────
//
// LA REGOLA CONTABILE CHE QUESTA SCENA ESISTE PER MISURARE: i prezzi pagati
// VIAGGIANO CON I GIOCATORI, e i crediti si muovono SOLO del conguaglio. È
// controintuitiva — a occhio uno scambio 25 contro 10 «dovrebbe» spostare 15 —
// e sbagliarla produrrebbe due budget plausibili e falsi, la peggior forma di
// errore per una contabilità d'asta. Da qui le due letture del credito prese
// PRIMA e confrontate DOPO, invece di due numeri assoluti che avrebbero potuto
// tornare per caso.
//
// IL RIFIUTO VIENE PRIMA DEL GESTO RIUSCITO, di proposito: la modale non
// ricontrolla nessuna regola per conto suo — traduce il rifiuto del motore
// (`tradeFeasibility`) — e un conguaglio enorme è il modo più diretto di far
// parlare quel motore con la sua frase invece che con un silenzio.
test("lo scambio muove i giocatori col loro prezzo e i crediti col solo conguaglio, e riporta il rifiuto del motore", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriScenaRose(page, context, externalRequests);

  await assegnaAMano(page, "Io", "A", 0, KEY_ATTACCANTE, PREZZO_ATTACCANTE);
  await assegnaAMano(page, "Squadra2", "D", 0, KEY_ALFA, PREZZO_DIFENSORE);

  const creditiIoPrima = await creditiResidui(page, "Io");
  const creditiDuePrima = await creditiResidui(page, "Squadra2");
  expect(creditiIoPrima).toBe(INITIAL_BUDGET - PREZZO_ATTACCANTE);
  expect(creditiDuePrima).toBe(INITIAL_BUDGET - PREZZO_DIFENSORE);

  await page.locator(slotId("Io", "A", 0)).click();
  await page.locator("#roster-slot-tab-scambio").click();
  // Finché non c'è una controparte non c'è niente da registrare.
  await expect(page.locator("#roster-slot-trade-apply")).toBeDisabled();

  // Le controparti si scelgono per NOME della persona seduta lì, non per id
  // del posto: è l'unica cosa che chi guarda il tavolo riconosce.
  await expect(page.locator("#roster-slot-trade-team")).toContainText(LABEL_DUE);
  await page.locator("#roster-slot-trade-team").selectOption("Squadra2");
  const inArrivo = page.locator("#roster-slot-trade-incoming");
  await expect(inArrivo).toContainText(D_ALFA.name);
  await expect(inArrivo).toContainText(`${PREZZO_DIFENSORE} cr`);
  await expect(page.locator("#roster-slot-trade-empty")).toHaveCount(0);
  await page.locator(`#roster-slot-trade-in-${KEY_ALFA}`).check();

  // Il rifiuto vero, con la frase del motore.
  await page.locator("#roster-slot-trade-credits").fill(String(INITIAL_BUDGET * 10));
  await page.locator("#roster-slot-trade-apply").click();
  await expect(page.locator("#roster-slot-error")).toContainText(
    "Il conguaglio manderebbe uno dei due budget sotto zero.",
  );
  await expect(page.locator("#roster-slot-overlay")).toBeVisible();

  // Lo scambio ammesso.
  await page.locator("#roster-slot-trade-credits").fill(String(CONGUAGLIO));
  await page.locator("#roster-slot-trade-apply").click();
  await expect(page.locator("#roster-slot-overlay")).toHaveCount(0);

  // I due giocatori hanno cambiato rosa portandosi il prezzo che avevano.
  const difensoreDiIo = page.locator(slotId("Io", "D", 0));
  await expect(difensoreDiIo).toHaveClass(/roster-slot--filled/);
  await expect(difensoreDiIo).toContainText(D_ALFA.name);
  await expect(difensoreDiIo).toContainText(String(PREZZO_DIFENSORE));
  await expect(page.locator(slotId("Io", "A", 0))).toHaveClass(/roster-slot--empty/);

  const attaccanteDiDue = page.locator(slotId("Squadra2", "A", 0));
  await expect(attaccanteDiDue).toHaveClass(/roster-slot--filled/);
  await expect(attaccanteDiDue).toContainText(A_ALFA.name);
  await expect(attaccanteDiDue).toContainText(String(PREZZO_ATTACCANTE));
  await expect(page.locator(slotId("Squadra2", "D", 0))).toHaveClass(/roster-slot--empty/);

  // E i crediti si sono mossi del solo conguaglio, in direzioni opposte.
  expect(await creditiResidui(page, "Io")).toBe(creditiIoPrima - CONGUAGLIO);
  expect(await creditiResidui(page, "Squadra2")).toBe(creditiDuePrima + CONGUAGLIO);

  expect(externalRequests).toEqual([]);
});

// ── 7. La modale come finestra modale ────────────────────────────────────────
//
// Le otto rose sono ottantaquattro caselle una uguale all'altra: chi apre la
// modale con la tastiera e la chiude senza aver fatto niente, se il fuoco
// tornasse in cima al documento, dovrebbe ritrovare a mano la casella da cui è
// partito fra tutte le altre. Il ritorno del fuoco sulla casella d'origine è
// quindi la proprietà da provare, non un dettaglio: è ciò che rende la
// chiusura senza gesto davvero senza conseguenze.
test("la modale è una finestra modale: Escape la chiude e il fuoco torna sulla casella che l'ha aperta", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriScenaRose(page, context, externalRequests);

  const casella = page.locator(slotId("Io", "C", 2));
  await casella.click();

  const dialog = page.locator(".roster-slot-dialog");
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  // Il fuoco entra nella modale da sé, sulla scheda aperta.
  await expect(page.locator("#roster-slot-tab-manuale")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator("#roster-slot-overlay")).toHaveCount(0);
  await expect(casella).toBeFocused();

  // Nessun gesto compiuto, nessuna conseguenza: la casella è ancora vuota e
  // il budget non si è mosso.
  await expect(casella).toHaveClass(/roster-slot--empty/);
  expect(await creditiResidui(page, "Io")).toBe(INITIAL_BUDGET);

  expect(externalRequests).toEqual([]);
});

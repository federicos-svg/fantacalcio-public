// IL LEDGER IN OMBRA E IL CRITERIO DI CAMBIO — §2.4 del disegno del generatore
// della formazione (WP-9).
//
// ── NON CONFONDERLO CON L'ALTRO CHAMPION/CHALLENGER ──────────────────────────
//
// Esiste, altrove nel progetto, una fabbrica di modelli d'asta che usa le
// stesse due parole: quella confronta MODELLI DI PREZZO addestrati su stagioni
// passate, e non ha niente a che vedere con questo file. Qui si confrontano
// DUE MOTORI DI FORMAZIONE — quello in carica e quello in ombra — su giornate
// di lega già giocate, con il criterio PRE-REGISTRATO di §2.4. Due cose diverse
// con lo stesso nome sono un errore che si fa una volta sola: questo capoverso
// esiste per quella volta.
//
// ── CHE COSA FA QUESTO FILE ──────────────────────────────────────────────────
//
// Una funzione pura sola, `runChampionChallengerLedger`, che legge il registro
// giornata per giornata e restituisce: quali giornate hanno CONTATO, quali no e
// perché, i sei numeri del confronto quando la finestra è piena, e i cambi di
// ruolo che il criterio ha ESEGUITO. Il cambio non si propone: §2.4 dice
// «nessun passo umano», quindi la funzione lo applica e lo dichiara.
//
// ── CHE COSA QUESTO FILE NON FA, DICHIARATO INVECE CHE SCOPERTO DOPO ─────────
//
//  - NON manda nessuna mail. §2.4 punto 7 chiede una mail a ogni cambio con i
//    sei numeri: qui si producono i sei numeri, dentro `LedgerSwap`. La mail è
//    del layer privato, dove stanno il canale e i destinatari.
//  - NON scrive e NON legge nessun deposito. Il registro di §10 è su Drive, ed
//    è privato: questa funzione riceve le righe già lette, in memoria.
//  - NON calcola punti di lega né rimpianto. Quelli sono `policyMetrics.ts`
//    (§11.2). Qui arrivano già calcolati, e un file che giudica non deve anche
//    produrre i numeri con cui giudica.
//  - NON riaddestra niente. Il motore sfidante è `challengerForecast.ts`; il
//    riaddestramento a ogni giornata (addendum §5 punti 1-2) è un job del
//    privato, e il suo registro dei run (punto 5) è un deposito privato. Ciò
//    che di quel punto 5 vive qui è la parte pura: quali giornate sono entrate
//    nella valutazione, quali metriche, quale decisione — `LedgerRow` e
//    `LedgerSwap` sono esattamente quelle colonne.
//  - NON sceglie L'UNITÀ del rimpianto. Vedi il blocco qui sotto.
//
// ── DUE COSE CHE §2.4 NON DICE, E CHE QUESTO FILE NON DECIDE AL POSTO SUO ────
//
// 1) L'UNITÀ DEL RIMPIANTO. §2.4 punto 2 dice «rimpianto rispetto alla
//    formazione migliore a posteriori (§11)»; §11.2 di rimpianti ne definisce
//    DUE — in punti di lega e in fantapunti — e non dice quale dei due entra
//    nelle condizioni (b) e (c). Qui `regret` è UN numero, senza unità: chi
//    chiama dichiara quale, e deve usare la STESSA per tutte le righe e per
//    tutti e due i motori. Scegliere qui vorrebbe dire chiudere nel codice una
//    cosa che il criterio pre-registrato ha lasciato aperta, e il criterio si
//    cambia con un record datato, non con un import.
//
// 2) LA GIORNATA REGISTRATA MA NON CALCOLABILE. §2.4 punto 6 elenca TRE casi
//    che non contano — coppa, voto politico, proposta non registrata prima
//    della scadenza — e quell'elenco è chiuso. Non contempla il caso in cui
//    entrambi i motori hanno registrato in tempo ma l'esito NON È RISOLTO
//    (`realisedLeaguePoints` restituisce `null` quando il regolamento non copre
//    una combinazione incontrata). Quella giornata, per il testo, CONTA — ma
//    con quale numero non è scritto. Questo file non inventa un quarto caso:
//    il tipo `EngineProposal` rende impossibile registrare una proposta senza i
//    suoi due numeri, così chi chiama è costretto a dichiarare invece di
//    lasciare che un `null` diventi silenziosamente uno zero. Finché il punto
//    non è chiuso da chi decide, una giornata così va fermata a monte.

import { LEAGUE_RULE_VERSION, type LeagueRuleVersion } from "./leagueGameweek.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. I NUMERI DICHIARATI DEL CRITERIO.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LA FINESTRA: sei giornate di campionato VALIDE (§2.4 punto 3).
 *
 * §2.4 lo dichiara e lo motiva: «`6` è il minimo perché la condizione (c) abbia
 * senso; con `4` si promuoverebbe sul rumore, con `10` il motore ricco non
 * entrerebbe prima di dicembre». È una costante, non un parametro: renderlo
 * configurabile trasformerebbe un criterio PRE-registrato in un criterio che si
 * sceglie dopo aver visto i numeri, che è precisamente ciò contro cui §2.4 è
 * stato scritto. Si cambia con un record datato che dica perché.
 */
export const CHAMPION_CHALLENGER_WINDOW = 6 as const;

/**
 * LA MAGGIORANZA DELLA CONDIZIONE (c): il rimpianto dello sfidante deve essere
 * `≤` a quello del campione in almeno 4 giornate su 6 (§2.4 punto 3c).
 *
 * Quattro su sei, non «più della metà»: tre su sei sarebbe un pareggio, e un
 * pareggio non è una prova di superiorità.
 */
export const REGRET_MAJORITY_MATCHDAYS = 4 as const;

/** Perché una giornata NON entra nel conteggio (§2.4 punto 6). */
export type LedgerExclusionReason =
  /** Giornata di coppa: obiettivo diverso (§3.3). */
  | "CUP"
  /** Voto politico (§17 del regolamento): i voti fissi non distinguono i motori. */
  | "POLITICAL_VOTE"
  /** Uno dei due motori senza proposta registrata prima della scadenza. */
  | "MISSING_REGISTRATION";

/** Quale invio è stato valutato: §2.4 punto 2 dice `v2`, altrimenti `v1`. */
export type ProposalVersion = "v1" | "v2";

/** Campionato o coppa: §3.3 dà alla coppa un obiettivo diverso. */
export type LedgerCompetition = "LEAGUE" | "CUP";

// ─────────────────────────────────────────────────────────────────────────────
// 2. LA RIGA DEL REGISTRO, COME IL PRIVATO LA SCRIVE.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LA PROPOSTA DI UN MOTORE PER UNA GIORNATA.
 *
 * È un'unione discriminata e non un oggetto con campi opzionali, e la
 * differenza è la regola di §2.4 punto 1: una proposta registrata DOPO la
 * scadenza non conta per quella giornata, e una proposta che non c'è non è una
 * proposta a zero punti. Con i campi opzionali «registrata senza numeri» e
 * «non registrata» sarebbero lo stesso oggetto; qui sono due tipi, e il
 * compilatore non lascia scrivere il primo.
 */
export type EngineProposal =
  | {
      /** Nessuna formazione completa registrata PRIMA della scadenza. */
      readonly registered: false;
      /** Che cosa è successo, per il rapporto d'incidente di WP-8. */
      readonly note?: string;
    }
  | {
      readonly registered: true;
      /** `v2` se la proposta è cambiata alle ufficiali, altrimenti `v1` (§2.4 p. 2). */
      readonly version: ProposalVersion;
      /** Punti di lega della PROPOSTA contro la formazione vera dell'avversario. */
      readonly leaguePoints: number;
      /** Rimpianto della PROPOSTA rispetto al tetto ex-post. Mai negativo. */
      readonly regret: number;
    };

/** Comodità per le righe registrate, così il tipo si scrive una volta sola. */
export function registeredProposal(
  version: ProposalVersion,
  leaguePoints: number,
  regret: number,
): EngineProposal {
  return { registered: true, version, leaguePoints, regret };
}

/** Comodità per l'incidente di WP-8: nessuna proposta prima della scadenza. */
export function missingProposal(note?: string): EngineProposal {
  return note === undefined ? { registered: false } : { registered: false, note };
}

/**
 * IL TERZO INVIO DI PICO (R4), quando c'è stato.
 *
 * SI REGISTRA E NON SI CONTA. §2.4 punto 2 è esplicito: per entrambi i motori
 * si valuta la PROPOSTA registrata, «mai la formazione effettivamente schierata
 * da noi». Una formazione inserita a mano non è una prova del modello — non la
 * ha scelta il modello — e farla entrare nei numeri del campione premierebbe o
 * punirebbe il motore per una decisione di qualcun altro.
 *
 * Il posto per scriverla esiste comunque, e non è una gentilezza: §11.1 misura
 * la «politica di Pico» a parte, e per misurarla qualcuno deve averla scritta.
 * Questo campo è quel posto, ed è l'unico punto del file da cui i suoi numeri
 * NON possono raggiungere il confronto, perché nessuna funzione qui lo legge
 * per calcolare: `runChampionChallengerLedger` lo conta e basta.
 */
export interface PicoOverride {
  /** Punti di lega della formazione SCHIERATA. Fuori dal criterio §2.4. */
  readonly leaguePoints: number | null;
  /** Rimpianto della formazione SCHIERATA. Fuori dal criterio §2.4. */
  readonly regret: number | null;
  readonly note?: string;
}

/** Una giornata del registro, come il layer privato la deposita (§10). */
export interface LedgerMatchday {
  readonly matchday: number;
  /**
   * Campionato o coppa. Dichiarazione OBBLIGATORIA e senza valore di comodo:
   * una giornata di coppa che nessuno ha dichiarato conterebbe come campionato,
   * ed è esattamente l'errore che §2.4 punto 6 esiste per impedire.
   */
  readonly competition: LedgerCompetition;
  /** §17 del regolamento: più di due partite rinviate, voti fissi per tutti. */
  readonly politicalVote: boolean;
  /** La proposta del motore IN CARICA in questa giornata. */
  readonly champion: EngineProposal;
  /** La proposta del motore IN OMBRA in questa giornata. */
  readonly challenger: EngineProposal;
  /** Il terzo invio di Pico, se c'è stato. Si registra, non si conta. */
  readonly picoOverride?: PicoOverride | null;
  /**
   * CONTROLLO FACOLTATIVO, FAIL-CLOSED. Se il registro dichiara chi era il
   * campione in questa giornata, la funzione verifica che coincida con lo stato
   * che il criterio ha calcolato, e si ferma se diverge. Serve a chi rilegge un
   * registro append-only scritto in momenti diversi: se il deposito e il
   * criterio non sono d'accordo su chi era in carica, uno dei due è sbagliato e
   * proseguire in silenzio sarebbe il modo di non accorgersene mai.
   */
  readonly championEngine?: string;
  /** Come `championEngine`, per il motore in ombra. */
  readonly challengerEngine?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. IL CRITERIO — (a), (b), (c) su una finestra di sei giornate valide.
// ─────────────────────────────────────────────────────────────────────────────

/** Una giornata VALIDA, ridotta ai quattro numeri che il criterio confronta. */
export interface LedgerWindowEntry {
  readonly matchday: number;
  readonly championLeaguePoints: number;
  readonly championRegret: number;
  readonly challengerLeaguePoints: number;
  readonly challengerRegret: number;
}

/** I tre numeri di un motore nella finestra: (a), (b), (c) di §2.4 punto 3. */
export interface EngineWindowNumbers {
  /** (a) somma dei punti di lega sulle sei giornate valide. */
  readonly leaguePointsTotal: number;
  /** (b) rimpianto medio sulle sei giornate valide. */
  readonly meanRegret: number;
  /** (c) in quante giornate il suo rimpianto è `≤` a quello dell'altro. */
  readonly regretNotWorseMatchdays: number;
}

/**
 * I SEI NUMERI della mail di §2.4 punto 7: tre per il campione, tre per lo
 * sfidante. Sono sei, non «i numeri»: la mail li deve poter mostrare tutti,
 * perché un cambio motivato da un solo numero non si può contestare.
 */
export interface ChampionChallengerNumbers {
  readonly champion: EngineWindowNumbers;
  readonly challenger: EngineWindowNumbers;
}

export interface CriterionVerdict {
  /** Le sei giornate valide guardate, in ordine crescente. */
  readonly windowMatchdays: readonly number[];
  readonly numbers: ChampionChallengerNumbers;
  /** (a) somma dei punti dello sfidante `≥` quella del campione. */
  readonly pointsAtLeast: boolean;
  /** (b) rimpianto medio dello sfidante STRETTAMENTE minore. */
  readonly meanRegretLower: boolean;
  /** (c) rimpianto dello sfidante `≤` in almeno 4 giornate su 6. */
  readonly regretMajority: boolean;
  /** Tutte e tre: lo sfidante entra, il campione esce. */
  readonly swap: boolean;
  readonly reason: string;
}

function assertFiniteNumber(value: number, what: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `${what}: valore non finito (${String(value)}). «Non calcolabile» non è un numero e non si scrive ` +
        "NaN: una giornata senza numero va dichiarata a monte, non fatta passare come se ne avesse uno.",
    );
  }
}

/**
 * IL CRITERIO DI §2.4 PUNTO 3, su una finestra di ESATTAMENTE sei giornate
 * valide. Funzione pura, senza stato: riceve i numeri e dice se si cambia.
 *
 * LE TRE CONDIZIONI NON SONO INTERCAMBIABILI, e i loro segni sono quelli del
 * testo, non una semplificazione:
 *
 *  (a) `≥` sui punti: lo sfidante che PAREGGIA i punti non è respinto da questa
 *      condizione, perché i punti di lega sono grossolani (tre valori per
 *      giornata) e chiedere il sorpasso su sei giornate chiederebbe un salto,
 *      non un miglioramento;
 *  (b) `<` STRETTO sul rimpianto medio: qui il sorpasso si chiede davvero, ed è
 *      la condizione che impedisce a un pari di promuoversi;
 *  (c) `≤` in almeno 4 giornate su 6: una media si ribalta con una giornata
 *      sola andata benissimo. La condizione (c) chiede che il vantaggio sia
 *      RIPETUTO, non concentrato, e per questo §2.4 dichiara che con `N = 4` il
 *      criterio si promuoverebbe sul rumore.
 *
 * Le tre insieme, mai due su tre.
 */
export function championChallengerCriterion(window: readonly LedgerWindowEntry[]): CriterionVerdict {
  if (window.length !== CHAMPION_CHALLENGER_WINDOW) {
    throw new Error(
      `criterio §2.4: la finestra ha ${window.length} giornata/e invece di ${CHAMPION_CHALLENGER_WINDOW}. ` +
        "Il criterio è pre-registrato su sei giornate valide: applicarlo a meno significherebbe " +
        "promuovere sul rumore, applicarlo a più significherebbe cambiarlo dopo aver visto i numeri.",
    );
  }
  let championPoints = 0;
  let challengerPoints = 0;
  let championRegretSum = 0;
  let challengerRegretSum = 0;
  let challengerNotWorse = 0;
  let championNotWorse = 0;
  for (const entry of window) {
    assertFiniteNumber(entry.championLeaguePoints, `criterio §2.4 (giornata ${entry.matchday}, campione)`);
    assertFiniteNumber(entry.challengerLeaguePoints, `criterio §2.4 (giornata ${entry.matchday}, sfidante)`);
    assertFiniteNumber(entry.championRegret, `criterio §2.4 (rimpianto del campione, giornata ${entry.matchday})`);
    assertFiniteNumber(entry.challengerRegret, `criterio §2.4 (rimpianto dello sfidante, giornata ${entry.matchday})`);
    championPoints += entry.championLeaguePoints;
    challengerPoints += entry.challengerLeaguePoints;
    championRegretSum += entry.championRegret;
    challengerRegretSum += entry.challengerRegret;
    if (entry.challengerRegret <= entry.championRegret) challengerNotWorse += 1;
    if (entry.championRegret <= entry.challengerRegret) championNotWorse += 1;
  }
  const championMean = championRegretSum / CHAMPION_CHALLENGER_WINDOW;
  const challengerMean = challengerRegretSum / CHAMPION_CHALLENGER_WINDOW;
  const pointsAtLeast = challengerPoints >= championPoints;
  const meanRegretLower = challengerMean < championMean;
  const regretMajority = challengerNotWorse >= REGRET_MAJORITY_MATCHDAYS;
  const swap = pointsAtLeast && meanRegretLower && regretMajority;
  const failed = [
    pointsAtLeast ? null : `(a) punti ${challengerPoints} < ${championPoints}`,
    meanRegretLower ? null : `(b) rimpianto medio ${challengerMean} non minore di ${championMean}`,
    regretMajority
      ? null
      : `(c) rimpianto non peggiore in ${challengerNotWorse} giornata/e su ${CHAMPION_CHALLENGER_WINDOW}, ` +
        `ne servono ${REGRET_MAJORITY_MATCHDAYS}`,
  ].filter((item): item is string => item !== null);
  return {
    windowMatchdays: window.map((entry) => entry.matchday),
    numbers: {
      champion: {
        leaguePointsTotal: championPoints,
        meanRegret: championMean,
        regretNotWorseMatchdays: championNotWorse,
      },
      challenger: {
        leaguePointsTotal: challengerPoints,
        meanRegret: challengerMean,
        regretNotWorseMatchdays: challengerNotWorse,
      },
    },
    pointsAtLeast,
    meanRegretLower,
    regretMajority,
    swap,
    reason: swap
      ? `criterio §2.4 soddisfatto su ${window.map((e) => e.matchday).join(", ")}: punti ${challengerPoints} ` +
        `contro ${championPoints}, rimpianto medio ${challengerMean} contro ${championMean}, non peggiore in ` +
        `${challengerNotWorse} giornata/e su ${CHAMPION_CHALLENGER_WINDOW}`
      : `criterio §2.4 non soddisfatto: ${failed.join("; ")}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. IL LEDGER — la lettura del registro, giornata per giornata.
// ─────────────────────────────────────────────────────────────────────────────

export interface LedgerRow {
  readonly matchday: number;
  /** Chi era in carica QUANDO la giornata si è giocata. */
  readonly championEngine: string;
  /** Chi era in ombra QUANDO la giornata si è giocata. */
  readonly challengerEngine: string;
  /** `true` se la giornata è entrata nel conteggio della finestra. */
  readonly counted: boolean;
  /** Perché non è entrata. Vuoto quando `counted` è `true`. */
  readonly exclusions: readonly LedgerExclusionReason[];
  /** Quante giornate valide ci sono nella finestra DOPO questa riga. */
  readonly validMatchdaysInWindow: number;
  /** Il criterio è stato applicato su questa riga? `null` = finestra non piena. */
  readonly verdict: CriterionVerdict | null;
  /** `true` se su questa riga il criterio ha eseguito il cambio. */
  readonly swapped: boolean;
  /** `true` se Pico è intervenuto con il terzo invio. Registrato, non contato. */
  readonly picoOverrideRecorded: boolean;
  readonly reason: string;
}

/** Un cambio eseguito: la materia prima della mail di §2.4 punto 7. */
export interface LedgerSwap {
  /** La giornata al termine della quale il criterio ha cambiato i ruoli. */
  readonly afterMatchday: number;
  readonly previousChampion: string;
  readonly newChampion: string;
  /** Le sei giornate valide su cui il criterio ha deciso. */
  readonly windowMatchdays: readonly number[];
  /** I sei numeri, per la mail: tre del campione uscente, tre dell'entrante. */
  readonly numbers: ChampionChallengerNumbers;
  readonly reason: string;
}

/** Una giornata esclusa e il perché, per il rapporto. */
export interface LedgerExclusion {
  readonly matchday: number;
  readonly reasons: readonly LedgerExclusionReason[];
}

export interface ChampionChallengerLedger {
  readonly rows: readonly LedgerRow[];
  /** I cambi eseguiti, in ordine di giornata. Vuoto = nessun cambio. */
  readonly swaps: readonly LedgerSwap[];
  /** Chi è in carica DOPO l'ultima giornata letta. */
  readonly champion: string;
  /** Chi è in ombra DOPO l'ultima giornata letta. */
  readonly challenger: string;
  /** Le giornate valide nella finestra aperta, in ordine crescente. */
  readonly openWindow: readonly number[];
  /** Le giornate che non hanno contato, con il loro perché. */
  readonly exclusions: readonly LedgerExclusion[];
  /**
   * Quante giornate VALIDE mancano perché il criterio si possa applicare di
   * nuovo. Zero significa che la finestra è piena e il criterio è già stato
   * applicato sull'ultima giornata valida letta.
   */
  readonly validMatchdaysToNextEvaluation: number;
  /** Le giornate in cui Pico è intervenuto con il terzo invio. */
  readonly picoOverrideMatchdays: readonly number[];
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

function assertEngineName(value: string, what: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `${what}: nome del motore mancante o vuoto. Un cambio va scritto con i nomi dei due motori, ` +
        "altrimenti la mail di §2.4 punto 7 dice che qualcosa è cambiato senza dire che cosa.",
    );
  }
}

function proposalNumbers(
  proposal: EngineProposal,
  role: "campione" | "sfidante",
  matchday: number,
): { leaguePoints: number; regret: number } | null {
  if (!proposal.registered) return null;
  assertFiniteNumber(proposal.leaguePoints, `giornata ${matchday}, punti del ${role}`);
  assertFiniteNumber(proposal.regret, `giornata ${matchday}, rimpianto del ${role}`);
  if (proposal.regret < 0) {
    throw new Error(
      `giornata ${matchday}: rimpianto negativo (${proposal.regret}) per il ${role}. Il rimpianto è la ` +
        "distanza dal tetto ex-post: negativo vorrebbe dire aver battuto la formazione migliore a voti " +
        "noti, che non è possibile, e farebbe abbassare la media nel verso sbagliato.",
    );
  }
  return { leaguePoints: proposal.leaguePoints, regret: proposal.regret };
}

/**
 * IL LEDGER IN OMBRA E IL CAMBIO AUTOMATICO — §2.4 per intero, come funzione
 * pura sulle righe del registro.
 *
 * LE QUATTRO REGOLE, TUTTE QUI E TUTTE VISIBILI:
 *
 *  1) LA FINESTRA SCORRE SULLE ULTIME SEI GIORNATE VALIDE, e il criterio si
 *     applica SOLO quando ce ne sono sei. Al quinto non si valuta — non perché
 *     il risultato sarebbe negativo, ma perché il criterio su cinque giornate è
 *     un altro criterio.
 *
 *  2) TRE CASI NON CONTANO E ALLUNGANO LA FINESTRA (§2.4 punto 6): coppa, voto
 *     politico, e la giornata in cui a uno dei due motori manca la proposta
 *     registrata prima della scadenza. Le tre esclusioni non si annullano né si
 *     sommano fra loro: una giornata può portarne più d'una, e il rapporto le
 *     dice tutte perché «era di coppa» e «e per di più mancava la proposta»
 *     sono due incidenti diversi, e il secondo è di WP-8.
 *
 *  3) IL CAMBIO SI ESEGUE, NON SI PROPONE (§2.4, «nessun passo umano»): quando
 *     le tre condizioni cadono insieme i ruoli si scambiano sulla riga stessa,
 *     e la finestra RIPARTE DA ZERO (punto 5) — nessun nuovo cambio prima di
 *     altre sei giornate valide. Senza quel reset il criterio, subito dopo un
 *     cambio, guarderebbe cinque giornate in cui i ruoli erano invertiti, e
 *     leggerebbe i numeri del campione sotto la voce «sfidante».
 *
 *  4) IL TERZO INVIO DI PICO NON MUOVE I NUMERI (§2.4 punto 2): `picoOverride`
 *     si conta fra le righe del rapporto e non entra in nessuna somma. Il
 *     confronto è fra MOTORI, e una formazione inserita a mano non è una prova
 *     del modello.
 *
 * `initialChampion` è la BASE, per §2.5: è il campione alla prima giornata e
 * resta sempre in ombra quando non è campione — il metro contro cui ogni
 * versione ricca si misura per tutta la stagione.
 */
export function runChampionChallengerLedger(input: {
  readonly initialChampion: string;
  readonly initialChallenger: string;
  readonly matchdays: readonly LedgerMatchday[];
}): ChampionChallengerLedger {
  assertEngineName(input.initialChampion, "ledger champion/challenger");
  assertEngineName(input.initialChallenger, "ledger champion/challenger");
  if (input.initialChampion === input.initialChallenger) {
    throw new Error(
      `ledger champion/challenger: campione e sfidante hanno lo stesso nome (${input.initialChampion}). ` +
        "Un motore non si confronta con se stesso: il criterio §2.4 direbbe sempre «pari», e un pari " +
        "non fa entrare nessuno.",
    );
  }
  if (input.matchdays.length === 0) {
    throw new Error(
      "ledger champion/challenger: nessuna giornata registrata. Un ledger vuoto non è un confronto in " +
        "parità: è un confronto che non è mai cominciato, e restituirlo come «nessun cambio» lo farebbe " +
        "sembrare una decisione presa.",
    );
  }

  const seen = new Set<number>();
  for (const entry of input.matchdays) {
    if (!Number.isInteger(entry.matchday) || entry.matchday < 1) {
      throw new Error(
        `ledger champion/challenger: giornata non valida (${String(entry.matchday)}). Le giornate sono ` +
          "interi da 1 in su.",
      );
    }
    if (seen.has(entry.matchday)) {
      throw new Error(
        `ledger champion/challenger: la giornata ${entry.matchday} compare due volte. Due righe per la ` +
          "stessa giornata la farebbero contare due volte nella finestra, e sei giornate valide " +
          "diventerebbero cinque giornate e un'eco.",
      );
    }
    seen.add(entry.matchday);
  }
  // Il registro di §10 è append-only per giornata: l'ordine è quello, e qui si
  // riporta a crescente invece di pretenderlo, perché una lettura da deposito
  // può restituire le righe come capita. I duplicati sono già stati rifiutati
  // sopra, quindi l'ordinamento non nasconde niente.
  const ordered = [...input.matchdays].sort((a, b) => a.matchday - b.matchday);

  let champion = input.initialChampion;
  let challenger = input.initialChallenger;
  let window: LedgerWindowEntry[] = [];
  const rows: LedgerRow[] = [];
  const swaps: LedgerSwap[] = [];
  const exclusions: LedgerExclusion[] = [];
  const picoOverrideMatchdays: number[] = [];

  for (const entry of ordered) {
    if (entry.championEngine !== undefined && entry.championEngine !== champion) {
      throw new Error(
        `ledger champion/challenger, giornata ${entry.matchday}: il registro dichiara campione ` +
          `«${entry.championEngine}», il criterio §2.4 ha in carica «${champion}». Uno dei due è ` +
          "sbagliato, e proseguire attribuirebbe a un motore i numeri dell'altro.",
      );
    }
    if (entry.challengerEngine !== undefined && entry.challengerEngine !== challenger) {
      throw new Error(
        `ledger champion/challenger, giornata ${entry.matchday}: il registro dichiara sfidante ` +
          `«${entry.challengerEngine}», il criterio §2.4 ha in ombra «${challenger}». Uno dei due è ` +
          "sbagliato, e proseguire attribuirebbe a un motore i numeri dell'altro.",
      );
    }

    const reasons: LedgerExclusionReason[] = [];
    if (entry.competition === "CUP") reasons.push("CUP");
    if (entry.politicalVote) reasons.push("POLITICAL_VOTE");
    const championNumbers = proposalNumbers(entry.champion, "campione", entry.matchday);
    const challengerNumbers = proposalNumbers(entry.challenger, "sfidante", entry.matchday);
    if (championNumbers === null || challengerNumbers === null) reasons.push("MISSING_REGISTRATION");

    const picoOverrideRecorded = entry.picoOverride !== undefined && entry.picoOverride !== null;
    if (picoOverrideRecorded) picoOverrideMatchdays.push(entry.matchday);

    const counted = reasons.length === 0;
    if (!counted) exclusions.push({ matchday: entry.matchday, reasons });

    let verdict: CriterionVerdict | null = null;
    let swapped = false;
    const rowChampion = champion;
    const rowChallenger = challenger;

    if (counted && championNumbers !== null && challengerNumbers !== null) {
      window.push({
        matchday: entry.matchday,
        championLeaguePoints: championNumbers.leaguePoints,
        championRegret: championNumbers.regret,
        challengerLeaguePoints: challengerNumbers.leaguePoints,
        challengerRegret: challengerNumbers.regret,
      });
      if (window.length >= CHAMPION_CHALLENGER_WINDOW) {
        verdict = championChallengerCriterion(window.slice(-CHAMPION_CHALLENGER_WINDOW));
        if (verdict.swap) {
          swapped = true;
          swaps.push({
            afterMatchday: entry.matchday,
            previousChampion: champion,
            newChampion: challenger,
            windowMatchdays: verdict.windowMatchdays,
            numbers: verdict.numbers,
            reason:
              `cambio eseguito dopo la giornata ${entry.matchday}: «${challenger}» entra, «${champion}» ` +
              `torna in ombra. ${verdict.reason}. Il confronto riparte da zero (§2.4 punto 5).`,
          });
          const outgoing = champion;
          champion = challenger;
          challenger = outgoing;
          window = [];
        }
      }
    }

    rows.push({
      matchday: entry.matchday,
      championEngine: rowChampion,
      challengerEngine: rowChallenger,
      counted,
      exclusions: reasons,
      validMatchdaysInWindow: window.length,
      verdict,
      swapped,
      picoOverrideRecorded,
      reason: counted
        ? (verdict === null
            ? `giornata contata; ${window.length} giornata/e valida/e su ${CHAMPION_CHALLENGER_WINDOW} ` +
              "nella finestra: il criterio non si applica ancora"
            : swapped
              ? `giornata contata e criterio applicato: CAMBIO. ${verdict.reason}`
              : `giornata contata e criterio applicato: nessun cambio. ${verdict.reason}`) +
          (picoOverrideRecorded
            ? ". Terzo invio di Pico registrato e NON contato: §2.4 punto 2 valuta la proposta, mai la " +
              "formazione schierata."
            : "")
        : `giornata NON contata (${reasons.join(", ")}): la finestra si allunga, ${window.length} ` +
          `giornata/e valida/e su ${CHAMPION_CHALLENGER_WINDOW}` +
          (reasons.includes("MISSING_REGISTRATION")
            ? ". La registrazione mancante è un incidente di WP-8 da riportare, non un punto a favore " +
              "dell'altro motore."
            : "") +
          (picoOverrideRecorded
            ? ". Terzo invio di Pico registrato e NON contato."
            : ""),
    });
  }

  const missing = Math.max(0, CHAMPION_CHALLENGER_WINDOW - window.length);
  return {
    rows,
    swaps,
    champion,
    challenger,
    openWindow: window.map((entry) => entry.matchday),
    exclusions,
    validMatchdaysToNextEvaluation: missing,
    picoOverrideMatchdays,
    reason:
      `${rows.length} giornata/e lette, ${rows.length - exclusions.length} contata/e, ` +
      `${exclusions.length} esclusa/e; ${swaps.length} cambio/i eseguito/i; in carica «${champion}», ` +
      `in ombra «${challenger}»; ` +
      (missing === 0
        ? "finestra piena, il criterio è stato applicato sull'ultima giornata valida"
        : `mancano ${missing} giornata/e valida/e perché il criterio si possa applicare`) +
      (picoOverrideMatchdays.length > 0
        ? `; terzo invio di Pico in ${picoOverrideMatchdays.length} giornata/e, registrato e non contato`
        : ""),
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

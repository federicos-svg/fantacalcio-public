// LA PREVISIONE BASE DAI VOTI STORICI — §6.2 del disegno del generatore, WP-4.
//
// CHE COS'È, E PERCHÉ NON DEVE ESSERE BRAVA. Questa è la previsione «base»: il
// champion della prima giornata (§2.5) e, per tutta la stagione, il METRO
// contro cui ogni motore più ricco dovrà giustificarsi. Un metro fatto bene non
// è un metro bravo: è un metro ONESTO e SEMPLICE, che si può rifare a mano e
// che non contiene nessuna delle cose che il motore ricco dovrà DIMOSTRARE di
// saper usare. Se il pavimento è finto, qualunque motore lo scavalca e la
// promozione automatica di §2.4 diventa una formalità.
//
// PRODUCE UNA DISTRIBUZIONE, NON UN NUMERO. WP-1 e WP-2 hanno spostato il
// motore sulle distribuzioni e sugli scenari: l'obiettivo di §3 è
// `3·P(vittoria) + 1·P(pareggio)`, non la media del nostro punteggio, e la
// formazione che vince quattro volte su dieci contro un avversario anomalo si
// riconosce solo se il voto può essere 5 oppure 8. Tornare a una media qui
// vorrebbe dire consegnare al livello 2 una varianza che non c'è. Quindi
// l'uscita è un `PlayerForecast` COMPLETO: la riga modale che alimenta il
// livello 1 e la schermata, PIÙ la `PlayerDistribution` di §6.1 che alimenta il
// livello 2.
//
// ── LE TRE COSE CHE RENDONO INUTILE UNA PREVISIONE FATTA MALE ────────────────
//
// 1) POCHI DATI. A inizio stagione un giocatore ha due presenze, e una media su
//    due partite non è una previsione: è rumore con l'aria di un numero. Qui
//    ogni quantità è uno SHRINK verso la distribuzione del suo RUOLO, con peso
//    equivalente a `SHRINK_PSEUDO_OBSERVATIONS` osservazioni (§6.2 lo fissa a
//    10 per il voto e per i tassi di evento; estenderlo alla disponibilità,
//    alle fattispecie del senza voto e ai gol subiti è una scelta di chi
//    scrive, dichiarata qui sotto). Due presenze fortunate valgono quindi
//    2/(2+10) della previsione, e venti ne valgono 20/(20+10): la formula è la
//    stessa per tutti, e chi ha giocato poco NON viene trattato come chi ha
//    giocato tanto. Con ZERO presenze la previsione È quella del ruolo — che è
//    la risposta giusta a «non lo so», e non uno zero travestito.
//
// 2) GIOCARE E RENDERE SONO DUE DOMANDE DIVERSE, E RESTANO SEPARATE. Un
//    fuoriclasse che non scende in campo vale zero, ma non perché renda poco:
//    perché non gioca. Qui `pPlays` si stima sul denominatore delle giornate in
//    cui il giocatore ERA A DISPOSIZIONE, e tutto il resto — voto base, eventi,
//    fattispecie del senza voto — è CONDIZIONATO A GIOCARE, cioè stimato sulle
//    sole giornate in cui il voto è arrivato. Mescolarle in un numero solo (la
//    «media pesata per la presenza» che verrebbe naturale) distruggerebbe
//    entrambe: non si potrebbe più dire se un 4,2 è uno scarso che gioca sempre
//    o un fuoriclasse che gioca un terzo delle volte, e il simulatore non
//    saprebbe più quando mandare in campo la panchina. La separazione non è un
//    dettaglio di implementazione: è il contratto di §6.1, ed è la ragione per
//    cui `pPlays` e `baseVote` sono due campi e non uno.
//
//    DOVE ARRIVA QUESTA `pPlays`, E DOVE NO. §7 dice che la probabilità di
//    scendere in campo la decide lo STRATO LIVE (le probabili formazioni), che
//    è WP-5 e vive nel layer privato. Questa è la stima STORICA che il motore
//    base usa quando il live non c'è ancora, e non pretende di sostituirlo: è
//    una frequenza di lungo periodo, cieca all'infortunio di ieri.
//
// 3) UNA PREVISIONE NON È UN'OSSERVAZIONE, E IL CODICE LO DEVE RENDERE
//    DIFFICILE DA CONFONDERE. `referencePolicies.ts` ha costruito la difesa per
//    il verso che è costato — righe di previsione passate al TETTO ex-post, che
//    lo abbassa e fa sembrare migliore chiunque — con un tipo sigillato più una
//    targa a runtime, e ci ha scritto sopra fin dove arriva: ferma
//    l'assegnazione, NON un cast esplicito. Questo modulo eredita quel limite e
//    aggiunge le due cose che gli competono:
//
//    - IN INGRESSO, il verso che riguarda un PREVISORE: la storia da cui questa
//      previsione si costruisce deve essere OSSERVATA. Se un giorno qualcuno
//      rimettesse in pasto a questo modulo la sua stessa uscita — o quella del
//      motore ricco — la previsione si confermerebbe da sola, il rimpianto
//      calerebbe e nessun errore lo direbbe. Perciò il corpo storico entra solo
//      da `observedHistory()`, che pretende una provenienza dichiarata, e il
//      tipo `ObservedHistory` porta un sigillo che nessun letterale può
//      nominare. Stesso limite dichiarato di là: un cast lo attraversa, e la
//      guardia a runtime chiede una TARGA, non una PROVA.
//
//    - IN USCITA, la targa che viaggia col numero: ogni distribuzione prodotta
//      qui porta `BASE_FORECAST_MARK` dentro `sourceQuality`, cioè una riga in
//      chiaro che dice PREVISIONE e sopravvive a un dump, a un JSON, a un log.
//      E in fondo al file ci sono le guardie di tipo che pinnano il rifiuto:
//      ciò che questo modulo produce non è assegnabile dove si aspettano voti
//      veri, e se un giorno lo diventasse `tsc --noEmit` sarebbe rosso al primo
//      comando di `npm run verify`.
//
// ── QUESTA È LA BASE: CIÒ CHE NON C'È, NON C'È PER SCELTA ────────────────────
//
// §6.2 la vuole CIECA al contesto di partita, e §6.3 elenca le famiglie del
// motore ricco come candidate MAI ammesse a priori. Quindi qui NON c'è, e non
// per dimenticanza: niente casa/trasferta, niente avversario reale, niente
// arbitro, niente forma recente dentro la stagione, niente minuti giocati,
// niente xG, niente rigorista, nessuna correlazione fra giocatori o fra eventi.
// Ogni estrazione è indipendente. Costruire una di quelle famiglie qui non
// sarebbe «migliorare la base»: sarebbe inventare una decisione che nessuno ha
// preso, e togliere al confronto di §2.4 il suo termine fisso.
//
// ── SCELTE DI CHI SCRIVE, DICHIARATE E CONTESTABILI ──────────────────────────
//
// a) IL DECADIMENTO È A GRANA DI STAGIONE. §6.2 dà mezza vita 1,5 stagioni; il
//    peso di una giornata è quindi `0,5^(stagioni_fa / 1,5)`, uguale per tutte
//    le giornate della stessa stagione. Una decadenza infra-stagionale sarebbe
//    «forma recente», cioè una famiglia del motore ricco.
// b) LE STAGIONI LE DICHIARA IL CHIAMANTE, IN ORDINE. Questo modulo non ha un
//    calendario e non legge l'orologio: `seasons[0]` è la più recente e
//    l'indice È il numero di stagioni fa. Nessuna `Date`, nessun `Date.now()`,
//    nessun `Math.random`: la stessa storia dà lo stesso numero per sempre.
// c) L'ORDINE DEGLI INGRESSI NON CAMBIA I NUMERI. Prima di sommare qualunque
//    cosa il corpo storico si ORDINA per (stagione, giornata, giocatore): due
//    corpi con le stesse righe in ordine diverso producono lo stesso risultato
//    bit a bit, e non «quasi». Le righe doppie sono un errore, non un caso da
//    gestire: stesso giocatore, stessa stagione, stessa giornata due volte
//    significa che qualcuno ha unito male due letture.
// d) LA RIGA MODALE È MODALE FINO IN FONDO. Il contratto del produttore
//    dichiara `expected.baseVote` come voto MODALE sulla griglia, non come
//    media (§21 vieta di interpolare i modificatori). Allora anche gli EVENTI
//    della riga modale si prendono al loro valore modale — accaduti se e solo
//    se la loro probabilità supera 0,5 — e `fantasyScore` è il punteggio di
//    QUELLA configurazione. Conseguenza dichiarata e scomoda: per la base un
//    bonus entra nella riga modale quasi mai, perché quasi nessun gol è più
//    probabile che non. Non è una svista, è il prezzo della coerenza: i due
//    flag di §21 escono dalla stessa configurazione da cui esce il punteggio,
//    quindi non possono contraddirlo, e nessun giocatore viene escluso dal
//    modificatore attacco per un bonus che la riga modale non gli ha dato. I
//    bonus veri li porta la DISTRIBUZIONE, che è ciò su cui il livello 2 — il
//    livello che decide — valuta ogni formazione.
// e) IL VALORE DEL SENZA VOTO CON ALTRO BONUS/MALUS VIENE DAL RUOLO, SEMPRE.
//    §13 paga «6 più QUEL valore», e quel valore su una o due occorrenze
//    personali sarebbe rumore puro: è esattamente il caso per cui lo shrink
//    esiste, portato al limite. Se la media di ruolo cade esattamente su zero
//    il modulo si ferma invece di scegliere: un senza voto con bonus/malus zero
//    È il senza voto puro, e chiamarlo in un altro modo terrebbe in campo a 6
//    un giocatore che il regolamento manda in panchina.
// f) I GOL SUBITI SONO DELLA SQUADRA, NON DEL PORTIERE (§6.2, testuale), e si
//    stimano sulla distribuzione empirica dei gol subiti della squadra reale,
//    shrinkata verso la distribuzione di tutte le squadre. Il portiere che
//    cambia squadra eredita la squadra nuova, che è il punto.
// g) NIENTE DEFAULT, MAI. Dove il corpo storico non dice abbastanza — un ruolo
//    senza nessun voto osservato, un ruolo senza nessun senza voto osservato,
//    nessuna squadra con gol subiti per un portiere — questo modulo SI FERMA
//    con un errore che dice che cosa manca. Una previsione costruita su un
//    ripiego inventato non fallisce: produce un numero plausibile, che è la
//    classe di guasto peggiore.

import type { Role } from "./gameweekSimulator.js";
import type { PlayerForecast } from "./lineupProposer.js";
import {
  BASE_VOTE_GRID,
  BASE_VOTE_MIN,
  BASE_VOTE_STEP,
  BONUS_MALUS_TARIFF,
  GOAL_CONCEDED_MALUS,
  GOAL_CONCEDED_MALUS_ROLE,
  type BaseVoteMass,
  type NoVoteKindMasses,
  type PlayerDistribution,
  type PlayerEventRates,
  assertPlayerDistribution,
} from "./playerScenario.js";
import type { ExPostCeilingInput, ObservedPlayerLine } from "./referencePolicies.js";

// ─── LE COSTANTI DICHIARATE ──────────────────────────────────────────────────

/** Quante stagioni entrano nel conto (§6.2). Le più vecchie si ignorano. */
export const HISTORY_SEASONS = 3 as const;

/** Mezza vita del decadimento, in stagioni (§6.2, come il benchmark storico). */
export const DECAY_HALF_LIFE_SEASONS = 1.5 as const;

/**
 * IL PESO DELLO SHRINK, in osservazioni equivalenti. §6.2 lo fissa a 10
 * presenze per il voto base e per i tassi di evento; qui lo stesso numero vale
 * anche per la disponibilità (giornate a disposizione), per le fattispecie del
 * senza voto e per i gol subiti della squadra (giornate di squadra). Un solo
 * numero per una sola ragione — «dieci osservazioni per fidarsi di un
 * giocatore invece che del suo ruolo» — invece di quattro numeri scelti uno per
 * uno: è una scelta di chi scrive, ed è contestabile con un record datato.
 */
export const SHRINK_PSEUDO_OBSERVATIONS = 10 as const;

/**
 * LA TARGA CHE VIAGGIA COL NUMERO. Finisce dentro `sourceQuality` di ogni
 * distribuzione prodotta qui, cioè dentro un campo che sopravvive a un JSON, a
 * un log e a una tabella. Non impedisce niente da sola — chi vuole barare la
 * riscrive — ma rende una previsione spacciata per osservazione una BUGIA
 * SCRITTA A MANO, visibile nel diff, invece di una svista che compila.
 */
export const BASE_FORECAST_MARK =
  "PREVISIONE BASE (WP-4, dai voti storici) — NON è un'osservazione" as const;

// ─── IL CORPO STORICO ────────────────────────────────────────────────────────

/** L'etichetta di una stagione, come la dichiara chi ha letto lo storico. */
export type SeasonId = string;

/** Le cinque fattispecie di §13, con gli stessi nomi del contratto di §6.1. */
export type NoVoteKind = keyof NoVoteKindMasses;

/** L'ordine è quello di §13 e non cambia: è anche l'ordine di estrazione. */
export const NO_VOTE_KINDS: readonly NoVoteKind[] = [
  "clean",
  "booked",
  "sentOffDuringMatch",
  "withOtherBonusMalus",
  "sentOffAfterMatch",
];

/** Gli eventi pagati da §12, come sono stati OSSERVATI in una giornata. */
export interface AppearanceEvents {
  readonly goal: boolean;
  readonly assist: boolean;
  readonly yellow: boolean;
  readonly red: boolean;
  readonly ownGoal: boolean;
  readonly penaltyMissed: boolean;
  readonly penaltySaved: boolean;
}

/**
 * LA CORRISPONDENZA FRA EVENTO OSSERVATO E TASSO PREVISTO, in un posto solo.
 * Due elenchi paralleli scritti a mano divergerebbero al primo evento nuovo;
 * qui il compilatore tiene insieme le due chiavi, e l'ORDINE è quello in cui
 * `samplePlayerLine` estrae — così chi legge le due funzioni vede la stessa
 * sequenza.
 */
const EVENT_KEYS: readonly (readonly [keyof AppearanceEvents, keyof PlayerEventRates])[] = [
  ["goal", "pGoal"],
  ["assist", "pAssist"],
  ["yellow", "pYellow"],
  ["red", "pRed"],
  ["ownGoal", "pOwnGoal"],
  ["penaltyMissed", "pPenMissed"],
  ["penaltySaved", "pPenSaved"],
];

/** I tre eventi che ALZANO il punteggio: §21 esclude dal modificatore attacco. */
const BONUS_EVENT_KEYS: readonly (keyof AppearanceEvents)[] = ["goal", "assist", "penaltySaved"];

/**
 * UNA GIORNATA GIÀ GIOCATA, PER UN GIOCATORE CHE ERA A DISPOSIZIONE.
 *
 * Ogni riga è una giornata in cui il giocatore POTEVA essere schierato: è il
 * denominatore di `pPlays`, e per questo non si deduce. Chi era fuori rosa,
 * squalificato per l'intera giornata o non ancora tesserato non ha una riga —
 * mettergliela come «senza voto» direbbe che era disponibile e non ha giocato,
 * che è un'altra cosa e abbassa la sua disponibilità per sempre.
 */
export interface PlayerAppearance {
  readonly playerId: string;
  /**
   * Il ruolo IN QUELLA GIORNATA, non quello di oggi. Serve a due cose diverse:
   * a raggruppare il pool di ruolo su ciò che il giocatore faceva davvero, e a
   * non mettere in un pool di attaccanti le giornate da centrocampista di chi
   * è stato spostato. Il ruolo per cui si CHIEDE la previsione lo dichiara la
   * richiesta, ed è quello di oggi.
   */
  readonly role: Role;
  readonly season: SeasonId;
  /** Numero di giornata dentro la stagione: intero >= 1. */
  readonly gameweek: number;
  /** Ha preso voto? Da qui in giù i campi si dividono in due rami disgiunti. */
  readonly voted: boolean;
  /** Solo se `voted`: il voto base letto, sulla griglia 4..10 a passi di 0,5. */
  readonly baseVote?: number;
  /** Solo se `voted`: titolare (`true`) o subentrato (`false`). */
  readonly started?: boolean;
  /** Solo se `voted`: gli eventi pagati da §12. */
  readonly events?: AppearanceEvents;
  /** Solo se NON `voted`: quale delle cinque fattispecie di §13. */
  readonly noVoteKind?: NoVoteKind;
  /** Solo per `withOtherBonusMalus`: il valore di quel bonus/malus, non zero. */
  readonly otherBonusMalus?: number;
}

/**
 * UNA GIORNATA DI SQUADRA. §6.2 vuole i gol subiti della SQUADRA REALE, non
 * quelli del portiere: è la squadra che li prende, e il portiere che cambia
 * maglia eredita la squadra nuova.
 */
export interface TeamGameweek {
  readonly teamId: string;
  readonly season: SeasonId;
  readonly gameweek: number;
  /** Gol subiti dalla squadra in quella giornata: intero >= 0. */
  readonly goalsConceded: number;
}

/**
 * IL SIGILLO DEL CORPO STORICO — e il motivo per cui NON è esportato.
 *
 * Stessa costruzione, stesso limite e stessa ragione di `OBSERVED_VOTE_SEAL` in
 * `referencePolicies.ts`: il simbolo esiste solo nel tipo (`declare const` non
 * emette niente), vive solo in questo modulo, e fuori di qui nessun letterale
 * può nominarlo. Un cast sì — punto 3 in testa al file lo dichiara.
 */
declare const OBSERVED_HISTORY_SEAL: unique symbol;

/**
 * IL CORPO STORICO OSSERVATO. Le stagioni dichiarate in ordine, le giornate dei
 * giocatori, le giornate delle squadre, e la targa di chi le ha lette.
 */
export interface ObservedHistory {
  /** Dalla più RECENTE alla più vecchia. L'indice è «quante stagioni fa». */
  readonly seasons: readonly SeasonId[];
  readonly appearances: readonly PlayerAppearance[];
  readonly teamGameweeks: readonly TeamGameweek[];
  /** Voti e tabellini letti dopo le giornate. Non c'è un altro valore. */
  readonly origin: "OBSERVED";
  /** Chi ha pubblicato questo storico, come lo dichiara chi l'ha letto. */
  readonly provenance: string;
  readonly [OBSERVED_HISTORY_SEAL]: true;
}

/** L'errore di questo modulo. Un prefisso solo, messaggi che dicono perché. */
function fail(message: string): never {
  throw new Error(`previsione base (WP-4): ${message}`);
}

/**
 * LA PORTA PREVISTA per ottenere un corpo storico, e il posto in cui la
 * provenienza si dichiara invece di essere sottintesa.
 *
 * Le righe devono venire da una LETTURA DI VOTI VERI — i tabellini delle
 * giornate passate, che in questo repository non vivono (il core pubblico non
 * acquisisce dati) e arrivano dal layer privato — MAI dall'uscita di questo
 * stesso modulo o di un motore. Questo modulo non può VERIFICARLO: una riga
 * letta e una riga prevista hanno gli stessi campi. Quindi fa l'unica cosa
 * onesta, la stessa di `observedLines()`: pretende una targa e la porta fino in
 * fondo, dentro la `sourceQuality` di ogni distribuzione prodotta.
 */
export function observedHistory(input: {
  readonly seasons: readonly SeasonId[];
  readonly appearances: readonly PlayerAppearance[];
  readonly teamGameweeks: readonly TeamGameweek[];
  /** Da dove viene questo storico, in chiaro. */
  readonly provenance: string;
}): ObservedHistory {
  const { provenance } = input;
  if (typeof provenance !== "string" || provenance.trim().length === 0) {
    fail(
      "la provenienza dello storico non è dichiarata. Una previsione ha senso solo se è costruita su " +
        "voti REALMENTE OSSERVATI, e questo modulo non può distinguerli dall'uscita di un motore — " +
        "hanno gli stessi campi. Se un giorno la previsione rientrasse come storico, si confermerebbe " +
        "da sola e il rimpianto scenderebbe senza che nessun errore lo dica.",
    );
  }
  return {
    seasons: input.seasons,
    appearances: input.appearances,
    teamGameweeks: input.teamGameweeks,
    origin: "OBSERVED",
    provenance: provenance.trim(),
  } as ObservedHistory;
}

/**
 * LA TARGA PRETESA A RUNTIME, DOVE IL TIPO NON ARRIVA.
 *
 * Il sigillo ferma l'ASSEGNAZIONE di un oggetto qualunque a `ObservedHistory`;
 * non ferma un cast esplicito, esattamente come di là. Questa guardia
 * intercetta il cast DIMENTICO — chi attraversa il tipo senza passare da
 * `observedHistory()` e quindi non porta nemmeno la provenienza. Un cast che
 * inventa anche la provenienza passa: è un rischio ACCETTATO e DICHIARATO, e
 * la bugia resta scritta dentro `sourceQuality` di ogni numero che ne esce.
 */
function assertDeclaredProvenance(history: ObservedHistory): string {
  // `history?.` NON È UNA SVISTA: questa guardia esiste proprio perché ci si
  // arriva con un cast, cioè perché il tipo qui può mentire. Fidarsi del tipo
  // dentro il controllo che lo verifica lo renderebbe un controllo finto.
  const provenance = history?.provenance;
  if (typeof provenance !== "string" || provenance.trim().length === 0) {
    fail(
      "lo storico non porta una provenienza dichiarata, quindi non è passato da `observedHistory()` — " +
        "l'unica porta che quella targa la pretende e la scrive. Senza targa questo storico potrebbe " +
        "essere l'uscita di un motore invece di voti letti, e una previsione addestrata sulla propria " +
        "previsione si conferma da sola: il rimpianto di §2.4 scenderebbe senza che nessun errore lo dica.",
    );
  }
  return provenance.trim();
}

// ─── LA RICHIESTA E L'USCITA ─────────────────────────────────────────────────

/** Chi vogliamo prevedere, col ruolo e la squadra di OGGI. */
export interface BaseForecastRequest {
  readonly playerId: string;
  /** Il ruolo per la giornata da prevedere. È il bersaglio dello shrink. */
  readonly role: Role;
  /**
   * La squadra di oggi. Serve ai gol subiti del portiere (§6.2), che sono della
   * squadra e non del portiere. Si dichiara per tutti — è un'etichetta — e si
   * usa solo dove il regolamento la paga.
   */
  readonly teamId: string;
}

export interface BaseForecastInput {
  readonly history: ObservedHistory;
  /** Uno per giocatore, senza ripetizioni. L'uscita esce in questo ordine. */
  readonly players: readonly BaseForecastRequest[];
  /**
   * L'istante a cui questa previsione si dichiara aggiornata (regola as-of,
   * §5). Lo DICHIARA il chiamante: questo modulo non legge l'orologio, perché
   * una previsione che si data da sola non è rifacibile identica domani.
   */
  readonly asOf: string;
}

/**
 * QUANTO DI QUESTA PREVISIONE È IL GIOCATORE E QUANTO È IL SUO RUOLO. Non è
 * ornamento: è il numero che permette a chi legge di sapere se sta guardando
 * una stima o un travestimento del pool di ruolo, ed è la ragione per cui «due
 * presenze» e «venti presenze» non si confondono a valle.
 */
export interface BaseForecastEvidence {
  readonly playerId: string;
  /** Giornate a disposizione trovate nella finestra delle 3 stagioni. */
  readonly gameweeksInHistory: number;
  /** Di quelle, quelle in cui ha preso voto. */
  readonly votedInHistory: number;
  /** Righe scartate perché di stagioni fuori dalla finestra. */
  readonly discardedOutOfWindow: number;
  /** Il peso delle giornate a disposizione dopo il decadimento. */
  readonly availabilityWeight: number;
  /** Il peso delle giornate con voto dopo il decadimento. */
  readonly performanceWeight: number;
  /** Quota della disponibilità che viene dal ruolo: K / (K + peso). */
  readonly priorShareAvailability: number;
  /** Quota del rendimento che viene dal ruolo: K / (K + peso). */
  readonly priorSharePerformance: number;
  /** In italiano, per chi leggerà un numero senza avere il codice davanti. */
  readonly reason: string;
}

export interface BaseForecast {
  readonly playerId: string;
  /** Pronto per `proposeLineup`: riga modale più distribuzione di §6.1. */
  readonly forecast: PlayerForecast;
  readonly evidence: BaseForecastEvidence;
}

// ─── I POOL: CONTEGGI PESATI, NIENT'ALTRO ────────────────────────────────────

interface PerformancePool {
  /** Peso delle giornate a disposizione (con e senza voto). */
  availabilityWeight: number;
  /** Peso delle giornate con voto. */
  votedWeight: number;
  /** Peso delle giornate senza voto. */
  noVotedWeight: number;
  /** Peso per punto della griglia dei voti, condizionato a giocare. */
  voteWeight: number[];
  /** Peso per evento, condizionato a giocare. */
  eventWeight: number[];
  /** Peso delle giornate da titolare, condizionato a giocare. */
  startedWeight: number;
  /** Peso per fattispecie di §13, condizionato a NON giocare. */
  noVoteKindWeight: number[];
  /** Somma di peso × valore sul solo `withOtherBonusMalus`. */
  otherBonusMalusWeighted: number;
}

function emptyPool(): PerformancePool {
  return {
    availabilityWeight: 0,
    votedWeight: 0,
    noVotedWeight: 0,
    voteWeight: BASE_VOTE_GRID.map(() => 0),
    eventWeight: EVENT_KEYS.map(() => 0),
    startedWeight: 0,
    noVoteKindWeight: NO_VOTE_KINDS.map(() => 0),
    otherBonusMalusWeighted: 0,
  };
}

/** Il decadimento di §6.2: mezza vita 1,5 stagioni, a grana di stagione. */
function seasonWeight(seasonsAgo: number): number {
  return Math.pow(0.5, seasonsAgo / DECAY_HALF_LIFE_SEASONS);
}

/** L'indice di un voto sulla griglia, o −1 se il voto non ci sta sopra. */
function gridIndex(vote: number): number {
  const index = Math.round((vote - BASE_VOTE_MIN) / BASE_VOTE_STEP);
  return BASE_VOTE_GRID[index] === vote ? index : -1;
}

/**
 * LO SHRINK, in una riga sola e per tutto: peso osservato più K osservazioni
 * finte distribuite come il ruolo. Con peso osservato zero il risultato È il
 * ruolo; con peso molto maggiore di K il ruolo sparisce. In mezzo la miscela è
 * continua, e non c'è nessuna soglia che faccia saltare un giocatore da una
 * previsione all'altra a presenze +1.
 */
function shrink(observedWeight: number, totalWeight: number, prior: number): number {
  return (
    (observedWeight + SHRINK_PSEUDO_OBSERVATIONS * prior) / (totalWeight + SHRINK_PSEUDO_OBSERVATIONS)
  );
}

function shrinkMasses(
  observed: readonly number[],
  totalWeight: number,
  prior: readonly number[],
): number[] {
  return observed.map((weight, i) => shrink(weight, totalWeight, prior[i] as number));
}

/** L'indice della massa più grande; parità rotta dall'indice più piccolo. */
function modeIndex(masses: readonly number[]): number {
  let top = 0;
  for (let i = 1; i < masses.length; i += 1) {
    if ((masses[i] as number) > (masses[top] as number)) top = i;
  }
  return top;
}

/**
 * Le masse normalizzate a somma uno. Il residuo si scarica sulla massa più
 * grande — quella su cui pesa di meno in termini relativi — perché
 * `assertPlayerDistribution` pretende la somma esatta entro 1e-9 e una deriva
 * di virgola mobile su tredici termini non deve diventare un errore di
 * contratto. Parità di massa: l'indice più piccolo, così l'esito non dipende
 * dall'ordine di visita.
 */
function normalised(masses: readonly number[], what: string): number[] {
  let total = 0;
  for (const mass of masses) total += mass;
  if (!(total > 0)) fail(`${what}: massa totale ${total}, non si può normalizzare.`);
  const out = masses.map((mass) => mass / total);
  const top = modeIndex(out);
  let others = 0;
  for (let i = 0; i < out.length; i += 1) {
    if (i !== top) others += out[i] as number;
  }
  out[top] = 1 - others;
  return out;
}

// ─── LA CONVALIDA DEL CORPO STORICO ──────────────────────────────────────────

const ROLES: readonly Role[] = ["P", "D", "C", "A"];

function assertAppearance(a: PlayerAppearance, where: string): void {
  if (typeof a.playerId !== "string" || a.playerId.length === 0) fail(`${where}: playerId mancante.`);
  if (!ROLES.includes(a.role)) fail(`${where}: ruolo non valido (${String(a.role)}).`);
  if (!Number.isInteger(a.gameweek) || a.gameweek < 1) {
    fail(`${where}: giornata non valida (${String(a.gameweek)}). Serve un intero >= 1.`);
  }
  if (typeof a.voted !== "boolean") {
    fail(`${where}: \`voted\` non dichiarato. «Non lo so» non è «non ha giocato».`);
  }
  if (a.voted) {
    if (typeof a.baseVote !== "number" || gridIndex(a.baseVote) < 0) {
      fail(
        `${where}: voto base ${String(a.baseVote)} fuori dalla griglia ${BASE_VOTE_MIN}..10 a passi di ` +
          `${BASE_VOTE_STEP}. §21 tabula i modificatori su quella griglia e vieta di interpolare.`,
      );
    }
    if (typeof a.started !== "boolean") {
      fail(
        `${where}: \`started\` non dichiarato su una giornata con voto. Titolare e subentrante sono i due ` +
          "informativi di §6.1 per la panchina: dedurli sarebbe inventarli.",
      );
    }
    if (a.events === undefined) fail(`${where}: eventi non dichiarati su una giornata con voto.`);
    for (const [observed] of EVENT_KEYS) {
      if (typeof a.events[observed] !== "boolean") {
        fail(
          `${where}: evento \`${observed}\` non dichiarato. §12 lo paga: «non dichiarato» non è «non successo».`,
        );
      }
    }
    if (a.noVoteKind !== undefined || a.otherBonusMalus !== undefined) {
      fail(
        `${where}: una giornata CON voto porta anche una fattispecie del senza voto. I due rami sono ` +
          "disgiunti (§13 descrive chi il voto non l'ha preso), e una riga che li mescola significa che il " +
          "dato non ha la semantica attesa.",
      );
    }
    return;
  }
  if (a.noVoteKind === undefined || !NO_VOTE_KINDS.includes(a.noVoteKind)) {
    fail(
      `${where}: fattispecie del senza voto mancante o sconosciuta (${String(a.noVoteKind)}). §13 ne elenca ` +
        `cinque — ${NO_VOTE_KINDS.join(", ")} — e pagano punteggi diversi.`,
    );
  }
  if (a.baseVote !== undefined || a.started !== undefined || a.events !== undefined) {
    fail(`${where}: una giornata SENZA voto porta voto, titolarità o eventi. I due rami sono disgiunti.`);
  }
  if (a.noVoteKind === "withOtherBonusMalus") {
    if (typeof a.otherBonusMalus !== "number" || !Number.isFinite(a.otherBonusMalus)) {
      fail(`${where}: \`withOtherBonusMalus\` senza il suo valore. §13 dà «6 più QUEL valore».`);
    }
    if (a.otherBonusMalus === 0) {
      fail(
        `${where}: \`withOtherBonusMalus\` con valore zero. Un senza voto con bonus/malus pari a zero È il ` +
          "senza voto puro: la fattispecie giusta è `clean`.",
      );
    }
  } else if (a.otherBonusMalus !== undefined) {
    fail(`${where}: valore di bonus/malus dichiarato su una fattispecie che non lo prevede (${a.noVoteKind}).`);
  }
}

// ─── IL CALCOLO ──────────────────────────────────────────────────────────────

interface RawTally {
  gameweeks: number;
  voted: number;
  discarded: number;
}

interface CorpusIndex {
  readonly provenance: string;
  readonly byPlayer: ReadonlyMap<string, PerformancePool>;
  readonly byRole: ReadonlyMap<Role, PerformancePool>;
  readonly rawCounts: ReadonlyMap<string, RawTally>;
  readonly concededByTeam: ReadonlyMap<string, readonly number[]>;
  readonly concededPooled: readonly number[];
}

function indexCorpus(history: ObservedHistory): CorpusIndex {
  const provenance = assertDeclaredProvenance(history);
  const seasons = history.seasons;
  if (!Array.isArray(seasons) || seasons.length === 0) {
    fail("nessuna stagione dichiarata. L'ordine delle stagioni È il decadimento: senza, non c'è previsione.");
  }
  const seasonsAgo = new Map<SeasonId, number>();
  seasons.forEach((season, i) => {
    if (typeof season !== "string" || season.length === 0) fail(`stagione senza etichetta all'indice ${i}.`);
    if (seasonsAgo.has(season)) fail(`stagione dichiarata due volte: ${season}.`);
    seasonsAgo.set(season, i);
  });
  const ageOf = (season: SeasonId, what: string): number => {
    const ago = seasonsAgo.get(season);
    if (ago === undefined) fail(`${what} in una stagione non dichiarata: ${String(season)}.`);
    return ago;
  };

  // ── L'ORDINE CANONICO, PRIMA DI SOMMARE QUALUNQUE COSA. Due corpi con le
  //    stesse righe in ordine diverso devono dare lo stesso numero BIT A BIT, e
  //    la somma di virgola mobile non è commutativa: quindi si ordina qui, una
  //    volta, e non si spera che l'ordine d'ingresso fosse già quello giusto.
  const appearances = [...history.appearances];
  appearances.forEach((a, i) => {
    assertAppearance(a, `giornata #${i + 1}`);
    ageOf(a.season, `giornata di ${a.playerId}`);
  });
  appearances.sort((a, b) => {
    const sa = ageOf(a.season, `giornata di ${a.playerId}`);
    const sb = ageOf(b.season, `giornata di ${b.playerId}`);
    if (sa !== sb) return sa - sb;
    if (a.gameweek !== b.gameweek) return a.gameweek - b.gameweek;
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });
  for (let i = 1; i < appearances.length; i += 1) {
    const previous = appearances[i - 1] as PlayerAppearance;
    const current = appearances[i] as PlayerAppearance;
    if (
      previous.playerId === current.playerId &&
      previous.season === current.season &&
      previous.gameweek === current.gameweek
    ) {
      fail(
        `${current.playerId} ha due righe per la giornata ${current.gameweek} di ${current.season}. Una ` +
          "giornata si gioca una volta: due righe significano due letture unite male, e conterebbero doppio " +
          "in ogni media. Fermarsi qui costa meno che scoprirlo in dicembre.",
      );
    }
  }

  const byPlayer = new Map<string, PerformancePool>();
  const byRole = new Map<Role, PerformancePool>();
  const rawCounts = new Map<string, RawTally>();
  const tallyOf = (id: string): RawTally => {
    let entry = rawCounts.get(id);
    if (entry === undefined) {
      entry = { gameweeks: 0, voted: 0, discarded: 0 };
      rawCounts.set(id, entry);
    }
    return entry;
  };

  for (const a of appearances) {
    const ago = ageOf(a.season, `giornata di ${a.playerId}`);
    const tally = tallyOf(a.playerId);
    if (ago >= HISTORY_SEASONS) {
      tally.discarded += 1;
      continue;
    }
    const w = seasonWeight(ago);
    tally.gameweeks += 1;
    if (a.voted) tally.voted += 1;

    let player = byPlayer.get(a.playerId);
    if (player === undefined) {
      player = emptyPool();
      byPlayer.set(a.playerId, player);
    }
    let role = byRole.get(a.role);
    if (role === undefined) {
      role = emptyPool();
      byRole.set(a.role, role);
    }
    for (const pool of [player, role]) {
      pool.availabilityWeight += w;
      if (a.voted) {
        pool.votedWeight += w;
        const vote = gridIndex(a.baseVote as number);
        pool.voteWeight[vote] = (pool.voteWeight[vote] as number) + w;
        if (a.started === true) pool.startedWeight += w;
        EVENT_KEYS.forEach(([observed], i) => {
          if ((a.events as AppearanceEvents)[observed]) {
            pool.eventWeight[i] = (pool.eventWeight[i] as number) + w;
          }
        });
      } else {
        pool.noVotedWeight += w;
        const kind = NO_VOTE_KINDS.indexOf(a.noVoteKind as NoVoteKind);
        pool.noVoteKindWeight[kind] = (pool.noVoteKindWeight[kind] as number) + w;
        if (a.noVoteKind === "withOtherBonusMalus") {
          pool.otherBonusMalusWeighted += w * (a.otherBonusMalus as number);
        }
      }
    }
  }

  // ── I GOL SUBITI, DELLA SQUADRA. Stesso ordine canonico, stesso decadimento,
  //    stessa intolleranza per la riga doppia.
  const teamGameweeks = [...history.teamGameweeks];
  teamGameweeks.forEach((t, i) => {
    if (typeof t.teamId !== "string" || t.teamId.length === 0) {
      fail(`giornata di squadra #${i + 1}: teamId mancante.`);
    }
    if (!Number.isInteger(t.gameweek) || t.gameweek < 1) {
      fail(`giornata di squadra #${i + 1}: giornata non valida (${String(t.gameweek)}).`);
    }
    if (!Number.isInteger(t.goalsConceded) || t.goalsConceded < 0) {
      fail(
        `giornata di squadra #${i + 1}: gol subiti ${String(t.goalsConceded)}. §12-bis paga −1 PER GOL, e un ` +
          "conteggio non intero o negativo non è pagabile.",
      );
    }
    ageOf(t.season, `giornata della squadra ${t.teamId}`);
  });
  teamGameweeks.sort((a, b) => {
    const sa = ageOf(a.season, `giornata della squadra ${a.teamId}`);
    const sb = ageOf(b.season, `giornata della squadra ${b.teamId}`);
    if (sa !== sb) return sa - sb;
    if (a.gameweek !== b.gameweek) return a.gameweek - b.gameweek;
    return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
  });
  for (let i = 1; i < teamGameweeks.length; i += 1) {
    const previous = teamGameweeks[i - 1] as TeamGameweek;
    const current = teamGameweeks[i] as TeamGameweek;
    if (
      previous.teamId === current.teamId &&
      previous.season === current.season &&
      previous.gameweek === current.gameweek
    ) {
      fail(
        `la squadra ${current.teamId} ha due righe per la giornata ${current.gameweek} di ` +
          `${current.season}. Una giornata si gioca una volta.`,
      );
    }
  }

  let maxConceded = 0;
  for (const t of teamGameweeks) {
    if (ageOf(t.season, "giornata di squadra") < HISTORY_SEASONS && t.goalsConceded > maxConceded) {
      maxConceded = t.goalsConceded;
    }
  }
  const concededByTeam = new Map<string, number[]>();
  const concededPooled = new Array<number>(maxConceded + 1).fill(0);
  for (const t of teamGameweeks) {
    const ago = ageOf(t.season, "giornata di squadra");
    if (ago >= HISTORY_SEASONS) continue;
    const w = seasonWeight(ago);
    let team = concededByTeam.get(t.teamId);
    if (team === undefined) {
      team = new Array<number>(maxConceded + 1).fill(0);
      concededByTeam.set(t.teamId, team);
    }
    team[t.goalsConceded] = (team[t.goalsConceded] as number) + w;
    concededPooled[t.goalsConceded] = (concededPooled[t.goalsConceded] as number) + w;
  }

  return { provenance, byPlayer, byRole, rawCounts, concededByTeam, concededPooled };
}

/** Il pool del ruolo, che è il bersaglio dello shrink. Vuoto: ci si ferma. */
function rolePool(corpus: CorpusIndex, role: Role): PerformancePool {
  const pool = corpus.byRole.get(role);
  if (pool === undefined || pool.availabilityWeight <= 0) {
    fail(
      `nessuna giornata di ruolo ${role} nelle ultime ${HISTORY_SEASONS} stagioni. Lo shrink di §6.2 tira ` +
        "verso la distribuzione del RUOLO: senza quella distribuzione non c'è niente verso cui tirare, e " +
        "inventare un ripiego produrrebbe un numero plausibile costruito sul nulla.",
    );
  }
  if (pool.votedWeight <= 0) {
    fail(
      `nessun voto osservato per il ruolo ${role}. Il voto base di chi ha giocato poco viene da lì: senza, ` +
        "la previsione sarebbe un'invenzione.",
    );
  }
  if (pool.noVotedWeight <= 0) {
    fail(
      `nessun senza voto osservato per il ruolo ${role}. Le cinque fattispecie di §13 devono sommare a uno ` +
        "in ogni distribuzione, e senza osservazioni non c'è modo di ripartirle: §13 paga i cinque casi in " +
        "modo diverso, e sceglierne uno d'ufficio sposterebbe punteggi interi.",
    );
  }
  return pool;
}

/**
 * LA PREVISIONE BASE, per i giocatori richiesti e nell'ordine in cui sono
 * richiesti. Funzione pura: nessun orologio, nessuna rete, nessun file, nessun
 * `Math.random`. Stessa storia, stessa uscita, per sempre.
 */
export function buildBaseForecasts(input: BaseForecastInput): readonly BaseForecast[] {
  const corpus = indexCorpus(input.history);
  if (typeof input.asOf !== "string" || input.asOf.length === 0) {
    fail(
      "`asOf` non dichiarato. La regola as-of di §5 confronta istanti, e questo modulo non legge " +
        "l'orologio apposta: una previsione che si data da sola non è rifacibile identica domani.",
    );
  }
  const seen = new Set<string>();
  const out: BaseForecast[] = [];
  for (const request of input.players) {
    if (typeof request.playerId !== "string" || request.playerId.length === 0) {
      fail("richiesta senza playerId.");
    }
    if (seen.has(request.playerId)) fail(`richiesta doppia per ${request.playerId}.`);
    seen.add(request.playerId);
    if (!ROLES.includes(request.role)) {
      fail(`${request.playerId}: ruolo non valido (${String(request.role)}).`);
    }
    if (typeof request.teamId !== "string" || request.teamId.length === 0) {
      fail(
        `${request.playerId}: squadra non dichiarata. I gol subiti di §6.2 sono della squadra, non del ` +
          "portiere, e senza la squadra non si sa quale distribuzione usare.",
      );
    }
    out.push(forecastOne(corpus, request, input.asOf));
  }
  return out;
}

function forecastOne(corpus: CorpusIndex, request: BaseForecastRequest, asOf: string): BaseForecast {
  const role = rolePool(corpus, request.role);
  const own = corpus.byPlayer.get(request.playerId) ?? emptyPool();
  const tally = corpus.rawCounts.get(request.playerId) ?? { gameweeks: 0, voted: 0, discarded: 0 };

  // ── 1) GIOCA O NON GIOCA. Denominatore: le giornate a disposizione. Questa
  //    quantità NON tocca nessun voto, e nessun voto la tocca.
  const priorPlays = role.votedWeight / role.availabilityWeight;
  const pPlays = shrink(own.votedWeight, own.availabilityWeight, priorPlays);

  // ── 2) IL RENDIMENTO, CONDIZIONATO A GIOCARE. Denominatore: le sole giornate
  //    con voto. Un fuoriclasse che gioca un terzo delle volte ha qui i suoi
  //    voti da fuoriclasse, e la sua indisponibilità sta tutta nel punto 1.
  const priorVote = normalised(
    role.voteWeight.map((w) => w / role.votedWeight),
    `distribuzione del voto per il ruolo ${request.role}`,
  );
  const voteMasses = normalised(
    shrinkMasses(own.voteWeight, own.votedWeight, priorVote),
    `distribuzione del voto di ${request.playerId}`,
  );
  const baseVote: BaseVoteMass[] = [];
  BASE_VOTE_GRID.forEach((vote, i) => {
    const probability = voteMasses[i] as number;
    // Una massa esattamente nulla non è un esito: portarla nel contratto
    // allungherebbe la distribuzione senza aggiungere niente da estrarre.
    if (probability > 0) baseVote.push({ vote, probability });
  });
  const modalBaseVote = BASE_VOTE_GRID[modeIndex(voteMasses)] as number;

  const events: Record<string, number> = {};
  EVENT_KEYS.forEach(([, rate], i) => {
    events[rate] = shrink(
      own.eventWeight[i] as number,
      own.votedWeight,
      (role.eventWeight[i] as number) / role.votedWeight,
    );
  });

  const startedShare = shrink(own.startedWeight, own.votedWeight, role.startedWeight / role.votedWeight);
  const pStarter = pPlays * startedShare;
  // Sottrazione e non moltiplicazione: così `pStarter + pSub` non può superare
  // `pPlays` nemmeno di un ulp, e il controllo del contratto non dipende
  // dall'arrotondamento.
  const pSub = pPlays - pStarter;

  // ── 3) LE CINQUE FATTISPECIE DI §13, condizionate al NON prendere voto.
  const priorSv = normalised(
    role.noVoteKindWeight.map((w) => w / role.noVotedWeight),
    `fattispecie del senza voto per il ruolo ${request.role}`,
  );
  const svMasses = normalised(
    shrinkMasses(own.noVoteKindWeight, own.noVotedWeight, priorSv),
    `fattispecie del senza voto di ${request.playerId}`,
  );
  const svKind: NoVoteKindMasses = {
    clean: svMasses[0] as number,
    booked: svMasses[1] as number,
    sentOffDuringMatch: svMasses[2] as number,
    withOtherBonusMalus: svMasses[3] as number,
    sentOffAfterMatch: svMasses[4] as number,
  };
  // Il VALORE del bonus/malus viene dal ruolo, sempre — scelta (e) in testa al
  // file. La media personale su una o due occorrenze sarebbe rumore puro.
  let svOtherBonusMalus: number | undefined;
  if (svKind.withOtherBonusMalus > 0) {
    const roleMass = role.noVoteKindWeight[3] as number;
    if (roleMass <= 0) {
      fail(
        `${request.playerId}: la fattispecie \`withOtherBonusMalus\` ha massa positiva ma il ruolo ` +
          `${request.role} non ne ha nemmeno un'occorrenza osservata da cui prendere il valore. §13 dà ` +
          "«6 più QUEL valore»: senza il valore la fattispecie non è calcolabile.",
      );
    }
    const mean = role.otherBonusMalusWeighted / roleMass;
    if (mean === 0) {
      fail(
        `${request.playerId}: la media di ruolo del bonus/malus da senza voto è esattamente zero. Un senza ` +
          "voto con bonus/malus zero È il senza voto puro, che si sostituisce: chiamarlo " +
          "`withOtherBonusMalus` terrebbe in campo a 6 un giocatore che il regolamento manda in panchina. " +
          "Il corpo storico dice che i valori osservati si annullano, e questo modulo non sceglie al posto suo.",
      );
    }
    svOtherBonusMalus = mean;
  }

  // ── 4) I GOL SUBITI, DELLA SQUADRA (§6.2). Solo il portiere li paga (§12-bis).
  let goalsConceded: number[] | undefined;
  if (request.role === GOAL_CONCEDED_MALUS_ROLE) {
    let pooledWeight = 0;
    for (const w of corpus.concededPooled) pooledWeight += w;
    if (pooledWeight <= 0) {
      fail(
        `${request.playerId}: nessuna giornata di squadra con gol subiti nelle ultime ${HISTORY_SEASONS} ` +
          "stagioni. §12-bis paga −1 per gol al portiere, e dargliene zero senza averlo detto sarebbe " +
          "regalargli un'imbattibilità che nessuno ha osservato.",
      );
    }
    const priorConceded = normalised(
      corpus.concededPooled.map((w) => w / pooledWeight),
      "distribuzione dei gol subiti, tutte le squadre",
    );
    const teamWeights = corpus.concededByTeam.get(request.teamId) ?? corpus.concededPooled.map(() => 0);
    let teamWeight = 0;
    for (const w of teamWeights) teamWeight += w;
    goalsConceded = normalised(
      shrinkMasses(teamWeights, teamWeight, priorConceded),
      `gol subiti della squadra ${request.teamId}`,
    );
  }

  const distribution: PlayerDistribution = {
    pPlays,
    pStarter,
    pSub,
    baseVote,
    events: {
      pGoal: events["pGoal"] as number,
      pAssist: events["pAssist"] as number,
      pYellow: events["pYellow"] as number,
      pRed: events["pRed"] as number,
      pOwnGoal: events["pOwnGoal"] as number,
      pPenMissed: events["pPenMissed"] as number,
      pPenSaved: events["pPenSaved"] as number,
      ...(goalsConceded === undefined ? {} : { goalsConceded }),
    },
    svKind,
    ...(svOtherBonusMalus === undefined ? {} : { svOtherBonusMalus }),
    asOf,
    // LA TARGA. Chi legge un numero mesi dopo deve poter sapere, senza risalire
    // al chiamante, che è una PREVISIONE e su quale storico è stata costruita.
    sourceQuality: `${BASE_FORECAST_MARK}; storico: ${corpus.provenance}`,
  };

  // ── 5) LA RIGA MODALE, MODALE FINO IN FONDO — scelta (d) in testa al file.
  const modal = EVENT_KEYS.map(([, rate]) => (events[rate] as number) > 0.5);
  let delta = 0;
  EVENT_KEYS.forEach(([observed], i) => {
    if (modal[i] !== true) return;
    switch (observed) {
      case "goal":
        delta += BONUS_MALUS_TARIFF.goal;
        break;
      case "assist":
        delta += BONUS_MALUS_TARIFF.assist;
        break;
      case "yellow":
        delta += BONUS_MALUS_TARIFF.yellowCard;
        break;
      case "red":
        delta += BONUS_MALUS_TARIFF.redCard;
        break;
      case "ownGoal":
        delta += BONUS_MALUS_TARIFF.ownGoal;
        break;
      case "penaltyMissed":
        delta += BONUS_MALUS_TARIFF.penaltyMissed;
        break;
      default:
        delta += BONUS_MALUS_TARIFF.penaltySaved;
    }
  });
  if (goalsConceded !== undefined) delta += modeIndex(goalsConceded) * GOAL_CONCEDED_MALUS;
  const receivedAnyBonus = EVENT_KEYS.some(
    ([observed], i) => modal[i] === true && BONUS_EVENT_KEYS.includes(observed),
  );
  const missedPenalty =
    modal[EVENT_KEYS.findIndex(([observed]) => observed === "penaltyMissed")] === true;

  const forecast: PlayerForecast = {
    id: request.playerId,
    role: request.role,
    voteProbability: pPlays,
    expected: {
      baseVote: modalBaseVote,
      // `+ 0` normalizza un eventuale −0: due previsioni identiche non devono
      // differire per il segno di uno zero.
      fantasyScore: modalBaseVote + delta + 0,
      receivedAnyBonus,
      missedPenalty,
    },
    distribution,
  };

  // LA CONVALIDA È DEL CONSUMATORE, NON MIA. Chiamare qui il controllo che il
  // produttore userebbe comunque significa che una previsione malformata muore
  // dove è nata, con il nome del giocatore, invece di morire dentro
  // `proposeLineup` dodici passaggi più in là. E significa che la griglia, la
  // somma a uno e la coerenza fra riga modale e distribuzione hanno UNA sola
  // autorità: `assertPlayerDistribution`, non una seconda copia scritta qui.
  assertPlayerDistribution(
    { id: forecast.id, role: forecast.role, voteProbability: pPlays, modalBaseVote },
    distribution,
    `previsione base di ${request.playerId}`,
  );

  const priorShareAvailability =
    SHRINK_PSEUDO_OBSERVATIONS / (own.availabilityWeight + SHRINK_PSEUDO_OBSERVATIONS);
  const priorSharePerformance =
    SHRINK_PSEUDO_OBSERVATIONS / (own.votedWeight + SHRINK_PSEUDO_OBSERVATIONS);
  const evidence: BaseForecastEvidence = {
    playerId: request.playerId,
    gameweeksInHistory: tally.gameweeks,
    votedInHistory: tally.voted,
    discardedOutOfWindow: tally.discarded,
    availabilityWeight: own.availabilityWeight,
    performanceWeight: own.votedWeight,
    priorShareAvailability,
    priorSharePerformance,
    reason:
      `${BASE_FORECAST_MARK}. ${tally.voted} giornate con voto su ${tally.gameweeks} a disposizione nelle ` +
      `ultime ${HISTORY_SEASONS} stagioni. Dopo il decadimento (mezza vita ${DECAY_HALF_LIFE_SEASONS} ` +
      `stagioni) restano ${own.availabilityWeight} di peso sulla disponibilità e ${own.votedWeight} sul ` +
      `rendimento; con lo shrink a ${SHRINK_PSEUDO_OBSERVATIONS} osservazioni equivalenti, il ruolo ` +
      `${request.role} pesa ${priorShareAvailability} sulla disponibilità e ${priorSharePerformance} sul ` +
      "rendimento. Nessuna feature di partita (§6.2): niente casa/trasferta, niente avversario, niente " +
      `arbitro. Storico dichiarato: ${corpus.provenance}.`,
  };

  return { playerId: request.playerId, forecast, evidence };
}

// ─── LE GUARDIE DI TIPO DELL'USCITA ──────────────────────────────────────────
//
// Mordono a `tsc --noEmit`, cioè al PRIMO comando di `npm run verify`, senza
// eseguire una riga di vitest; e vivono ACCANTO al modulo che produce le
// previsioni, quindi finiscono nello stesso hunk di diff di chi riaprisse la
// porta. Stessa famiglia — e stesso limite dichiarato — delle quattro guardie
// in fondo al blocco del tetto in `referencePolicies.ts`: chi vuole riaprire il
// varco può cancellare anche queste righe, ma allora lo sta facendo APPOSTA,
// sotto gli occhi di chi rilegge il diff.

/**
 * CIÒ CHE ESCE DA QUI NON È UN VOTO OSSERVATO. La riga di giornata che si
 * costruisce da questa previsione ha esattamente la forma di quella che
 * `expectedLine()` consegna al simulatore, e non deve essere assegnabile a
 * `ObservedPlayerLine`: il tetto ex-post di §11.2 costruito su una previsione è
 * più BASSO del vero, quindi abbassa il rimpianto di §2.4 e promuove un motore
 * che non lo merita, senza sintomi.
 */
type BaseForecastLine = {
  readonly id: string;
  readonly role: Role;
  readonly baseVote: number;
  readonly fantasyScore: number;
  readonly receivedAnyBonus: boolean;
  readonly missedPenalty: boolean;
};
type AssertBaseForecastLineIsNotObserved = BaseForecastLine extends ObservedPlayerLine ? never : true;
const _baseForecastLineIsNotObserved: AssertBaseForecastLineIsNotObserved = true;
void _baseForecastLineIsNotObserved;

/** E nemmeno in blocco, dalla porta d'ingresso del tetto. */
type AssertCeilingRefusesBaseForecast = readonly BaseForecastLine[] extends ExPostCeilingInput["squadLines"]
  ? never
  : true;
const _ceilingRefusesBaseForecast: AssertCeilingRefusesBaseForecast = true;
void _ceilingRefusesBaseForecast;

/**
 * E NEL VERSO CHE RIGUARDA UN PREVISORE: il corpo storico non si costruisce con
 * un letterale. Se `ObservedHistory` tornasse strutturale questa guardia
 * diventerebbe rossa — ed è l'unica cosa che impedisce a un'uscita di motore di
 * rientrare come storico senza passare da `observedHistory()`.
 */
type PlainHistory = {
  readonly seasons: readonly SeasonId[];
  readonly appearances: readonly PlayerAppearance[];
  readonly teamGameweeks: readonly TeamGameweek[];
  readonly origin: "OBSERVED";
  readonly provenance: string;
};
type AssertPlainHistoryIsNotObserved = PlainHistory extends ObservedHistory ? never : true;
const _plainHistoryIsNotObserved: AssertPlainHistoryIsNotObserved = true;
void _plainHistoryIsNotObserved;

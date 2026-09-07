// PRODUTTORE DI FORMAZIONE EX-ANTE — passo 4 della Fase 2 (Lineup Coach).
//
// I tre moduli precedenti sanno dire come è finita (`simulateGameweek`) e quale
// era la formazione migliore A VOTI NOTI (`bestLineupExPost`). Nessuno dei due
// sa proporre una formazione PRIMA della giornata. Questo file è quel passo:
// dati la rosa, una previsione e la formazione avversaria assunta, restituisce
// modulo, undici e panchina ordinata — legali per il regolamento — più i numeri
// con cui la scelta si verifica a mano.
//
// LA PREVISIONE È UN INPUT ASTRATTO, E RESTA FUORI DA QUI. Questo modulo non
// prevede nulla, non legge nessuna fonte, non stima nessuna probabilità: riceve
// `PlayerForecast` da chi le probabilità le produce e applica il regolamento.
// Non c'è modello, non c'è prezzo, non c'è output direttivo: c'è l'aritmetica di
// §9, §10, §13, §14, §15, §19, §20, §21, §22 applicata a numeri di qualcun altro.
//
// ── LE CINQUE DICHIARAZIONI CHE NON SONO REGOLE DI LEGA ──────────────────────
//
// 1) SEMPLIFICAZIONE DELLO SCENARIO. Uno scenario assegna gioca/non-gioca a ogni
//    giocatore delle due rose (Bernoulli indipendenti con `voteProbability`).
//    Chi gioca ha la riga attesa; chi NON gioca è un SENZA VOTO PURO —
//    `baseVote:null, fantasyScore:null, cards:"none", otherBonusMalus:0` — che
//    `resolveNoVote` manda in sostituzione (§13 `sv_clean: must_be_replaced`) e
//    che, se scoperto, conta come assente (§13 `office_reserve: prohibited`).
//    Un titolare IMPOSTO con `voteProbability = 0` è, dentro questa
//    semplificazione, un senza voto puro in OGNI scenario: non è un caso
//    impossibile, è un caso costoso, e la dichiarazione 5) dice perché si
//    accetta invece di rifiutarlo.
//    QUESTA PREVISIONE NON SA RAPPRESENTARE ALTRO: un SV con bonus (che resta in
//    campo a 6 più il bonus), un ammonito senza voto (che resta in campo a 5) o
//    un espulso (4) non hanno posto nel contratto `PlayerForecast`. È una
//    semplificazione dichiarata, non una lettura del regolamento: le altre
//    quattro fattispecie di §13 esistono e questo produttore le ignora perché il
//    dato che le distinguerebbe non gli arriva.
//
// 2) ORDINE DELLA PANCHINA. §10 dice `bench: FREE` e non detta nessun criterio:
//    l'ordine è una scelta DICHIARATA di questo modulo, non una regola. In
//    panchina vanno TUTTI i non titolari. L'ordine INIZIALE è un'euristica —
//    prima chi una probabilità di giocare ce l'ha, poi `expected.fantasyScore`
//    decrescente, poi `voteProbability` decrescente, poi `id` crescente — e NON
//    è l'ordine finale: l'ordine della panchina fa parte dello STATO della
//    ricerca (mossa (d) del vicinato) e viene scelto sugli stessi scenari e con
//    lo stesso criterio di tutto il resto.
//    PERCHÉ NON BASTA «DAVANTI CHI RENDE DI PIÙ». In `applySubstitutions` entra
//    il primo di panchina con voto e dello stesso ruolo, e il tetto di 5 (§10
//    `max_substitutions`) è globale: quando morde, l'ordine decide QUALI RUOLI
//    restano scoperti, e §19 è una SOGLIA (portiere più quattro difensori con
//    voto), non un contributo additivo. Un difensore che rende meno di un
//    centrocampista può valere più di lui in panchina, perché tiene in piedi il
//    modificatore difesa. Per questo l'ordine si valuta col simulatore invece di
//    postularlo: «davanti chi rende di più perché è quel che conta quando il
//    tetto morde» è una motivazione FALSA, e basta un controesempio a sei senza
//    voto per smentirla.
//    I giocatori con `voteProbability = 0` stanno SEMPRE in coda e la ricerca non
//    li muove: senza voto in nessuno scenario, `applySubstitutions` li salta
//    sempre, quindi la loro posizione non può cambiare un solo punteggio e
//    spostarli sarebbe una mossa nulla pagata a prezzo pieno. Il limite che
//    questa dichiarazione ammetteva — «un p = 0 può finire davanti a chi un voto
//    ce l'ha» — non esiste più: è diventato un fatto verificato da un test.
//    I portieri di riserva stanno in panchina come tutti gli altri: §13 dice che
//    «il portiere non ha una regola propria».
//    CON `locked: true` NIENTE DI TUTTO QUESTO SI APPLICA: la panchina è quella
//    che arriva, nell'ordine in cui arriva, e non viene né riordinata né
//    valutata. Un ordine «migliorato» dentro una formazione che il
//    fantallenatore ha dichiarato immodificabile sarebbe una modifica non
//    richiesta, e per giunta invisibile.
//
// 3) ORDINE DEI TITOLARI. Anche questo è dichiarato e non regolamentare: ruolo
//    (D, poi C, poi A) e dentro il ruolo `expected.fantasyScore` decrescente, poi
//    `voteProbability` decrescente, poi `id` crescente. L'ordine dei titolari
//    decide SOLO quale SV dello stesso ruolo viene coperto per primo, e siccome
//    due SV valgono zero entrambi e il sostituto è lo stesso, non muove il
//    punteggio: serve a rendere l'output riproducibile, non a scegliere.
//    Anche qui `locked: true` sospende tutto: l'ordine dei titolari consegnato
//    resta quello. E i titolari IMPOSTI non hanno un ordine privilegiato: sono
//    ordinati come gli altri, perché il vincolo dice CHI gioca, non in che
//    posizione compare nell'elenco.
//
// 4) LA RIGA ATTESA È MODALE, E IL BONUS ATTESO SI DICHIARA. `expected` non è
//    una media: è la riga che il previsore ritiene più probabile — il vincolo G
//    qui sotto lo impone già al voto base — e i suoi due flag,
//    `receivedAnyBonus` e `missedPenalty`, sono OBBLIGATORI. La ragione è §21:
//    un attaccante che ha preso un bonus qualunque è ESCLUSO dal modificatore
//    attacco. Un `fantasyScore` maggiore del `baseVote` è un bonus atteso, e
//    lasciarlo senza flag darebbe a quell'attaccante il bonus dentro il totale
//    di squadra E il modificatore che §21 gli vieta: due volte lo stesso gol.
//    `assertForecasts` rifiuta quella combinazione invece di indovinarla.
//    Il contrario NON si deduce: un `fantasyScore` minore o uguale al voto base
//    può essere un malus, un bonus compensato da un malus, o niente — questo
//    modulo non inventa la differenza, la dichiara chi produce la previsione.
//    Non è una regola di lega: è il contratto di questo produttore.
//
// 5) I VINCOLI SONO VOLONTÀ DICHIARATA, NON INFORMAZIONE — E NON SI DISCUTONO.
//    `LineupConstraints` non porta un dato sul mondo: porta ciò che il
//    fantallenatore ha DECISO. Un giocatore spuntato è in campo perché lui
//    vuole che ci sia, non perché il produttore stimi che convenga; un modulo
//    imposto è il suo modulo, non il migliore; `locked: true` è la sua
//    formazione, non una proposta. Questo produttore quindi non li valuta, non
//    li pesa, non li confronta con alternative migliori: li rispetta
//    INTERAMENTE, oppure RIFIUTA dicendo quale vincolo è impossibile e perché
//    (`ConstraintRejectionCode`, uno per fattispecie). Non c'è una terza via, e
//    in particolare non c'è il rilassamento silenzioso: togliere un vincolo per
//    far tornare i conti produrrebbe una formazione plausibile in cui manca un
//    giocatore che il fantallenatore crede di aver messo in campo. È il modo
//    peggiore di sbagliare, perché non si vede.
//    IL RIFIUTO LI DICE TUTTI IN UNA VOLTA. `constraints.rejections` è una
//    lista, non un motivo solo: chi spunta i giocatori a mano e ne ha tre in
//    conflitto, con un motivo per volta corregge e riprova all'infinito. Ma
//    contiene SOLO motivi realmente verificati — un controllo che legge un dato
//    che un altro controllo ha già dichiarato illeggibile non emette il suo
//    motivo, perché un elenco che contiene un motivo falso è peggio di un
//    motivo solo. Le dipendenze fra controlli sono elencate una per una davanti
//    a `checkConstraints`.
//    UN VINCOLO COSTOSO NON È UN VINCOLO IMPOSSIBILE, e i due casi non si
//    confondono. Un imposto con `voteProbability = 0` vale un senza voto in
//    ogni scenario e la proposta ne esce peggiore: è una scelta legittima che
//    costa, si accetta, si schiera, e si avverte con `LOCKED_PLAYER_NEVER_PLAYS`
//    — un avvertimento, non un rifiuto. Più in generale la proposta vincolata
//    può valere MENO di quella libera, e quando vale meno lo dice invece di
//    correggersi: quel meno è il prezzo della volontà, non un difetto.
//
// ── PERCHÉ DUE LIVELLI E NON UNO ─────────────────────────────────────────────
//
// Tier 1 è la formazione a previsione puntuale: tutti giocano al valore atteso e
// si chiama `bestLineupExPost`, che a voti noti è esatta. Serve al controllo a
// mano — è il numero che una persona può rifare con carta e penna.
// Tier 2 raffina quella formazione sugli scenari di disponibilità, dove la
// panchina e il tetto di §10 iniziano a contare, con un hill climbing steepest
// ascent. Non pretende l'ottimo globale, e non lo dichiara: parte da un punto
// che a incertezza nulla È l'ottimo, e da lì migliora solo su mosse che
// migliorano strettamente.
// Con `locked: true` non c'è nessuno dei due livelli: non si cerca, si valuta
// la formazione data e la si consegna, con `constraints.optimized = false`.
//
// NESSUNA FORMULA PARALLELA: ogni scenario passa per `simulateGameweek`. Una
// seconda aritmetica del punteggio, anche solo per «andare più veloce», è
// esattamente il modo in cui due numeri divergono in silenzio.
//
// DETERMINISMO BIT A BIT. Nessun `Math.random`, nessuna `Date`, nessuna
// variabile d'ambiente, nessun file, nessuna rete. Dove serve campionare c'è un
// mulberry32 a seme fisso implementato qui sotto, e gli scenari si generano UNA
// VOLTA SOLA prima della ricerca: tutte le formazioni candidate vengono
// confrontate sullo stesso identico insieme di scenari, altrimenti il confronto
// misurerebbe il rumore del campionamento invece della formazione.

import {
  type GameweekContext,
  type GameweekOutcome,
  type Lineup,
  type PlayerLine,
  type Role,
  lineupViolations,
  simulateGameweek,
} from "./gameweekSimulator.js";
import {
  LEAGUE_RULE_VERSION,
  type LeagueRuleVersion,
  MODULES,
  type Module,
  moduleShape,
} from "./leagueGameweek.js";
import { LEAGUE_POINTS, bestLineupExPost, leaguePointsOf } from "./lineupOptimizer.js";
import {
  type CompetitionObjective,
  type CompetitionObjectiveKind,
  LEAGUE_OBJECTIVE,
  type ObjectiveUnit,
  describeCompetitionObjective,
  scenarioObjectiveValue,
} from "./competitionObjective.js";
import {
  type WeightedOpponentLineup,
  drawOpponentLineupIndices,
  lineupKey,
  modalOpponentIndex,
  normalisedOpponentWeights,
  playerDrawSubSeed,
} from "./opponentDistribution.js";

/** Previsione per un singolo giocatore. Chi la produce sta fuori da qui. */
export interface PlayerForecast {
  readonly id: string;
  readonly role: Role;
  /** P(riceve un voto nella giornata), in [0, 1]. 0 = certamente non gioca. */
  readonly voteProbability: number;
  /** Riga attesa SE gioca. */
  readonly expected: {
    /** Voto base atteso. DEVE stare sulla griglia dei voti (multiplo di 0,5). */
    readonly baseVote: number;
    /** Punteggio individuale atteso (voto base + bonus/malus attesi). */
    readonly fantasyScore: number;
    /**
     * Bonus atteso, in qualunque forma (gol, assist, imbattibilità…).
     * OBBLIGATORIO: §21 esclude dal modificatore attacco chi ha preso un bonus,
     * e un `fantasyScore` sopra il voto base senza questo flag prenderebbe il
     * bonus due volte. Dichiarazione 4) in testa al file.
     */
    readonly receivedAnyBonus: boolean;
    /** Rigore sbagliato atteso: §21 esclude anche lui. OBBLIGATORIO. */
    readonly missedPenalty: boolean;
  };
}

export interface OpponentForecast {
  /**
   * La formazione avversaria MODALE. Chi la fornisce decide — per §16 la
   * baseline naturale è quella della giornata precedente, che il regolamento
   * stesso rende l'esito in mancanza di comunicazione — e il produttore NON la
   * deduce.
   *
   * Con `lineupDistribution` assente questa formazione È la distribuzione: un
   * solo elemento a peso 1. Con la distribuzione presente, questa deve essere
   * la sua modale (peso maggiore, parità rotta dall'ordine dichiarato): il
   * produttore lo VERIFICA invece di ricavarla di nascosto, perché è la
   * formazione con cui si innesca il livello 1 e chi legge il risultato deve
   * poter sapere quale fosse senza rifare il conto dei pesi.
   */
  readonly lineup: Lineup;
  readonly players: readonly PlayerForecast[];
  /**
   * LA DISTRIBUZIONE DELLE FORMAZIONI AVVERSARIE (§8.4 del disegno). Assente =
   * la sola `lineup`, a peso 1: è il caso degenere, non un ramo separato, e i
   * chiamanti che non la passano ottengono esattamente il calcolo di prima.
   *
   * I pesi sono relativi e li normalizza il produttore; l'ordine è parte del
   * contratto perché rompe le parità di peso nella scelta della modale.
   */
  readonly lineupDistribution?: readonly WeightedOpponentLineup[];
}

/**
 * I VINCOLI DEL FANTALLENATORE. Volontà dichiarata, non informazione:
 * dichiarazione 5) in testa al file. Il produttore li rispetta interamente
 * oppure rifiuta con un codice; non ne rilassa mai uno per far tornare i conti.
 */
export interface LineupConstraints {
  /** Giocatori che devono essere titolari. Ordine irrilevante. */
  readonly lockedStarterIds: readonly string[];
  /** Modulo imposto. Assente = la ricerca sceglie. */
  readonly lockedModule?: Module;
  /** Formazione intera bloccata: nessuna ricerca, si tiene quella data. */
  readonly locked: boolean;
}

/**
 * I motivi per cui una richiesta vincolata si rifiuta. Uno per fattispecie, mai
 * un motivo generico: chi legge deve sapere QUALE vincolo è impossibile, perché
 * è l'unico modo che ha di scegliere quale togliere.
 */
export type ConstraintRejectionCode =
  /** Un id imposto che non è in rosa. */
  | "LOCKED_PLAYER_UNKNOWN"
  /** Lo stesso id imposto due volte. */
  | "LOCKED_PLAYER_DUPLICATED"
  /** Il modulo imposto non è uno dei sette ammessi (§9). */
  | "LOCKED_MODULE_NOT_ALLOWED"
  /** Più di undici imposti: gli undici sono undici. */
  | "LOCKED_TOO_MANY"
  /** Imposti di un ruolo oltre il massimo che QUALUNQUE modulo ammette. */
  | "LOCKED_ROLE_OVERFLOW"
  /** Nessun modulo ammissibile regge insieme i ruoli imposti. */
  | "LOCKED_MODULE_INCOMPATIBLE"
  /** Undici imposti che non compongono un modulo ammesso. */
  | "LOCKED_ELEVEN_NOT_A_MODULE"
  /** `locked: true` senza la formazione da tenere. */
  | "LOCKED_LINEUP_MISSING"
  /** `locked: true` con una formazione che il regolamento non ammette. */
  | "LOCKED_LINEUP_ILLEGAL"
  /** `locked: true` con una formazione che contraddice gli altri vincoli. */
  | "LOCKED_LINEUP_CONTRADICTS_CONSTRAINTS";

/**
 * Quel che il produttore accetta ma segnala. Un avvertimento NON è un rifiuto:
 * dichiarazione 5) — un vincolo costoso resta un vincolo legittimo.
 */
export type ConstraintWarningCode =
  /** Un imposto con `voteProbability = 0`: senza voto in ogni scenario. */
  | "LOCKED_PLAYER_NEVER_PLAYS";

export interface ConstraintIssue<Code extends string> {
  readonly code: Code;
  /** Il motivo in italiano, leggibile senza conoscere il codice. */
  readonly message: string;
  /** I giocatori coinvolti, se il motivo ne nomina qualcuno. */
  readonly playerIds: readonly string[];
}

/** Che cosa ha fatto il produttore dei vincoli ricevuti. */
export interface ConstraintReport {
  /** `true` se almeno un vincolo era attivo. */
  readonly applied: boolean;
  /**
   * `false` SOLO con `locked: true`: la formazione consegnata è quella data, e
   * NON è stata ottimizzata. La stessa cosa è scritta in `reason`.
   */
  readonly optimized: boolean;
  readonly lockedStarterIds: readonly string[];
  readonly lockedModule: Module | null;
  readonly locked: boolean;
  /**
   * TUTTI i motivi del rifiuto, vuota se i vincoli erano soddisfacibili.
   *
   * È una LISTA, e la ragione è la schermata: chi spunta cinque giocatori a
   * mano e ne ha tre in conflitto, con un motivo per volta corregge, riprova,
   * corregge, riprova. Un referto incompleto costringe a colpire le talpe.
   *
   * Contiene solo motivi REALMENTE VERIFICATI. Un controllo che non è
   * eseguibile perché un altro è fallito — i ruoli di una lista che contiene un
   * id sconosciuto, la capienza di un modulo che non esiste — NON produce il
   * suo motivo: un elenco che contiene un motivo falso è peggio di un motivo
   * solo. Quali controlli dipendono da quali è scritto in `checkConstraints`.
   *
   * L'ordine è stabile e dichiarato: identità degli id, poi modulo, poi
   * capienza, poi formazione bloccata.
   */
  readonly rejections: readonly ConstraintIssue<ConstraintRejectionCode>[];
  readonly warnings: readonly ConstraintIssue<ConstraintWarningCode>[];
}

export interface LineupProposalInput {
  readonly squad: readonly PlayerForecast[];
  readonly opponent: OpponentForecast;
  readonly context: GameweekContext;
  /** Budget di scenari (default 4096). */
  readonly scenarioBudget?: number;
  /** Seme del PRNG usato SOLO se si campiona (default `DEFAULT_SEED`). */
  readonly seed?: number;
  /**
   * I vincoli del fantallenatore. Assente = nessun vincolo, e il produttore si
   * comporta esattamente come prima che i vincoli esistessero.
   */
  readonly constraints?: LineupConstraints;
  /**
   * CHE COSA SI STA GIOCANDO (§3.3 del disegno). Assente = campionato, che è
   * anche il ripiego dichiarato di `cup_unknown`: la differenza fra i due non è
   * nel numero, è in ciò che l'etichetta dice a chi legge.
   *
   * Non si deduce dalla giornata: le giornate di coppa **si osservano**
   * (LEAGUE_RULES §23, emendamento del 2026-09-04), e questo produttore non ha
   * un calendario da leggere né il permesso di indovinarlo.
   */
  readonly competition?: CompetitionObjective;
  /**
   * La formazione di partenza — quella che il fantallenatore ha già in mano.
   * Serve SOLO a `constraints.locked: true`, che la restituisce così com'è;
   * altrove è ignorata, perché la ricerca parte dalla previsione puntuale e non
   * da una formazione precedente. Con `locked: true` e senza questa formazione
   * non c'è niente da tenere, e il produttore rifiuta con
   * `LOCKED_LINEUP_MISSING` invece di cercarne una di nascosto.
   */
  readonly currentLineup?: Lineup;
}

export interface LineupProposal {
  readonly lineup: Lineup | null;
  readonly feasible: boolean;
  readonly reason: string;
  /**
   * Tier 1: la formazione scelta a previsione puntuale (tutti giocano al valore
   * atteso) e il suo esito simulato. Titolari e portiere sono esattamente quelli
   * di `bestLineupExPost`; panchina e ordine dei titolari sono riscritti con le
   * regole dichiarate in testa a questo file, che a previsione puntuale non
   * cambiano un solo numero — nessun titolare è senza voto, quindi la panchina
   * non entra mai.
   */
  readonly pointForecast: { readonly lineup: Lineup | null; readonly outcome: GameweekOutcome | null };
  /** Tier 2: stima sugli scenari di disponibilità. */
  readonly estimate: {
    readonly method: "exact" | "sampled";
    readonly scenarios: number;
    readonly seed: number | null;
    /**
     * IL NUMERO CHE DECIDE, nell'unità dichiarata da `objectiveUnit`. In
     * campionato e nei gironi di coppa coincide con `expectedLeaguePoints`;
     * nelle eliminazioni dirette è una probabilità, e confondere le due cose
     * significa confrontare due competizioni diverse.
     */
    readonly objectiveValue: number;
    readonly objectiveKind: CompetitionObjectiveKind;
    readonly objectiveUnit: ObjectiveUnit;
    /**
     * La massa di scenari che il regolamento NON copre (oggi: solo la parità
     * anche nella somma dei punteggi di un doppio confronto, §23
     * `cup_tie_break_two_legged_second_level: UNSPECIFIED`). Non è attribuita a
     * nessuno: finché è > 0, `objectiveValue` è un MINORANTE dichiarato.
     */
    readonly undecidedWeight: number;
    readonly expectedLeaguePoints: number;
    readonly winProbability: number;
    readonly drawProbability: number;
    readonly lossProbability: number;
    readonly expectedOurTotal: number;
    /**
     * Varianza del NOSTRO punteggio sugli scenari. È il terzo criterio di §3.2
     * — a parità di obiettivo e di punteggio atteso si preferisce la formazione
     * meno ballerina — ed è esposta perché quella preferenza sia verificabile
     * invece che creduta.
     */
    readonly ourTotalVariance: number;
    /**
     * Quante formazioni avversarie compone la distribuzione, e con che quota di
     * scenari ciascuna è stata realmente estratta (nell'ordine dichiarato). Con
     * una formazione sola è `[1]`, che è il caso di sempre.
     */
    readonly opponentLineups: number;
    readonly opponentLineupShare: readonly number[];
    /** `false` se anche UNO scenario ha incontrato un valore fuori tabella. */
    readonly fullyTabulated: boolean;
    /** `false` se anche UNO scenario ha prodotto `resolved:false`. */
    readonly allResolved: boolean;
    /**
     * `true` se il raffinamento si è fermato sul tetto di iterazioni invece che
     * su un ottimo locale: la proposta è legale e valutata, ma NON è convergente.
     * La stessa cosa è scritta in `reason`, e la prosa non si interroga.
     */
    readonly refinementCapReached: boolean;
  };
  /** Formazioni valutate in totale (Tier 1 + Tier 2). */
  readonly evaluated: number;
  readonly objectiveLabel: string;
  /** Che cosa il produttore ha fatto dei vincoli: rifiuti, avvertimenti, esito. */
  readonly constraints: ConstraintReport;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

/** Budget di scenari oltre il quale si campiona invece di enumerare. */
export const DEFAULT_SCENARIO_BUDGET = 4096 as const;
/**
 * Seme di default del PRNG. È un numero fisso e dichiarato, non un'ora né un
 * caso: due chiamate identiche devono dare lo stesso risultato bit a bit.
 */
export const DEFAULT_SEED = 20260903 as const;
/** Tetto di iterazioni dell'hill climbing. Raggiunto, il risultato lo dice. */
export const MAX_REFINEMENT_ITERATIONS = 50 as const;
/** Il seme sta in [0, 2^32): oltre, `mulberry32` lo troncherebbe in silenzio. */
export const SEED_MODULUS = 4294967296 as const;

const ROLES: readonly Role[] = ["P", "D", "C", "A"];
const OUTFIELD_ROLES: readonly Role[] = ["D", "C", "A"];

/**
 * mulberry32 — PRNG deterministico a 32 bit, in-file e senza dipendenze.
 * `Math.random` è vietato qui: renderebbe irriproducibile una proposta che deve
 * poter essere rifatta identica a distanza di giorni.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Il voto sta sulla griglia del regolamento se è un multiplo esatto di 0,5. */
function onVoteGrid(vote: number): boolean {
  return Number.isFinite(vote) && Number.isInteger(vote * 2);
}

function assertForecasts(players: readonly PlayerForecast[], where: string): void {
  const seen = new Set<string>();
  for (const f of players) {
    if (typeof f.id !== "string" || f.id.length === 0) throw new Error(`${where}: id mancante o non valido`);
    if (seen.has(f.id)) throw new Error(`${where}: id duplicato ${f.id}`);
    seen.add(f.id);
    if (!ROLES.includes(f.role)) throw new Error(`${where}: ruolo non valido per ${f.id}: ${String(f.role)}`);
    if (!Number.isFinite(f.voteProbability) || f.voteProbability < 0 || f.voteProbability > 1) {
      throw new Error(`${where}: voteProbability fuori da [0,1] per ${f.id}: ${String(f.voteProbability)}`);
    }
    if (!Number.isFinite(f.expected.fantasyScore)) {
      throw new Error(`${where}: fantasyScore non finito per ${f.id}: ${String(f.expected.fantasyScore)}`);
    }
    // VINCOLO G — LA GRIGLIA DEI VOTI. Non è pignoleria: `midfieldModifier`
    // tabula differenze a passi di 0,5 e `strikerAttackModifier` tabula 6.0 /
    // 6.5 / 7.0 / 7.5 / >=8, e il regolamento vieta di interpolare (§21
    // `DO_NOT_INTERPOLATE`). Un voto atteso 6,37 uscirebbe `tabulated:false` con
    // il modificatore silenziosamente a zero: la proposta sembrerebbe calcolata
    // e sarebbe sbagliata. Il «voto atteso» di questo contratto è quindi un voto
    // MODALE sulla griglia, non una media: portarcelo è compito del previsore.
    if (!onVoteGrid(f.expected.baseVote)) {
      throw new Error(
        `${where}: baseVote fuori dalla griglia dei voti per ${f.id}: ${String(f.expected.baseVote)}. ` +
          "Il regolamento tabula i modificatori a passi di 0,5 e vieta di interpolare: " +
          "un voto atteso deve essere un multiplo di 0,5 (voto modale, non media).",
      );
    }
    // §21 — IL BONUS ATTESO NON SI INDOVINA. I due flag sono obbligatori anche a
    // runtime, perché il tipo protegge solo chi compila con questo contratto.
    if (typeof f.expected.receivedAnyBonus !== "boolean" || typeof f.expected.missedPenalty !== "boolean") {
      throw new Error(
        `${where}: receivedAnyBonus e missedPenalty sono obbligatori per ${f.id}. ` +
          "§21 esclude dal modificatore attacco chi ha preso un bonus: «non dichiarato» non è «falso».",
      );
    }
    if (f.expected.fantasyScore > f.expected.baseVote && !f.expected.receivedAnyBonus) {
      throw new Error(
        `${where}: ${f.id} ha un punteggio atteso ${f.expected.fantasyScore} sopra il voto base ` +
          `${f.expected.baseVote} senza bonus dichiarato. Un punteggio atteso superiore al voto base ` +
          "implica un bonus atteso: la riga attesa è modale, dichiaralo con receivedAnyBonus: true. " +
          "Senza il flag §21 gli darebbe anche il modificatore attacco, cioè lo stesso bonus due volte.",
      );
    }
  }
}

function assertInput(input: LineupProposalInput): void {
  assertForecasts(input.squad, "rosa");
  assertForecasts(input.opponent.players, "rosa avversaria");
  const ours = new Set(input.squad.map((f) => f.id));
  const shared = input.opponent.players.filter((f) => ours.has(f.id)).map((f) => f.id);
  if (shared.length > 0) {
    throw new Error(`id condivisi fra le due rose: ${shared.join(", ")}. Un giocatore non gioca contro se stesso.`);
  }
  const budget = input.scenarioBudget ?? DEFAULT_SCENARIO_BUDGET;
  if (!Number.isInteger(budget) || budget < 1) {
    throw new Error(`scenarioBudget non valido: ${String(input.scenarioBudget)} (serve un intero >= 1)`);
  }
  const seed = input.seed ?? DEFAULT_SEED;
  // `mulberry32` fa `seed >>> 0`: un 3,7 o un 2^33 diventerebbero un altro seme
  // senza dirlo, e due chiamate «identiche» con semi diversi darebbero lo stesso
  // risultato. Un determinismo solo apparente è peggio di un errore.
  if (!Number.isInteger(seed) || seed < 0 || seed >= SEED_MODULUS) {
    throw new Error(
      `seed non valido: ${String(input.seed)}. Serve un intero in [0, 2^32): il PRNG lo tronca con ` +
        "`>>> 0`, e un seme troncato in silenzio renderebbe irriproducibile una proposta che deve " +
        "poter essere rifatta identica.",
    );
  }

  const theirExpected = new Map(input.opponent.players.map((f) => [f.id, expectedLine(f)]));
  const violations = lineupViolations(input.opponent.lineup, theirExpected);
  if (violations.length > 0) {
    throw new Error(`la formazione avversaria assunta non è legale: ${violations.join("; ")}`);
  }

  // ── LA DISTRIBUZIONE DELLE FORMAZIONI AVVERSARIE. Ogni elemento è una
  // formazione a sé e va legale come la modale: una candidata illegale non è
  // «meno probabile», è impossibile, e simularla produrrebbe un punteggio che
  // nella lega non può esistere.
  const distribution = input.opponent.lineupDistribution;
  if (distribution !== undefined) {
    const weights = normalisedOpponentWeights(distribution, "distribuzione delle formazioni avversarie");
    distribution.forEach((candidate, index) => {
      const bad = lineupViolations(candidate.lineup, theirExpected);
      if (bad.length > 0) {
        throw new Error(
          `la formazione avversaria n. ${index + 1} della distribuzione non è legale: ${bad.join("; ")}`,
        );
      }
    });
    const modal = modalOpponentIndex(weights);
    if (lineupKey((distribution[modal] as WeightedOpponentLineup).lineup) !== lineupKey(input.opponent.lineup)) {
      throw new Error(
        `opponent.lineup non è la modale della distribuzione: la modale è la n. ${modal + 1} (peso ` +
          `${weights[modal] as number}). La modale è la formazione con cui si innesca il livello 1 (§10 del ` +
          "disegno): ricavarla di nascosto renderebbe invisibile da dove è partita la ricerca, e dichiararne " +
          "una diversa da quella dei pesi farebbe partire la ricerca da un'ipotesi che i pesi smentiscono.",
      );
    }
  }

  // I VINCOLI SI CONTROLLANO SU DUE PIANI DIVERSI, E LA DIFFERENZA CONTA.
  // Qui si controlla solo che l'oggetto ABBIA la forma del contratto: un
  // `lockedStarterIds` che non è un array o un `locked` che non è un booleano
  // sono un errore di chi chiama, e si lanciano come tutti gli altri errori di
  // contratto. Che i vincoli siano SODDISFACIBILI è un'altra domanda — la fa
  // `checkConstraints`, e la sua risposta negativa è un rifiuto dichiarato nel
  // risultato, non un'eccezione: un vincolo impossibile è una scelta legittima
  // del fantallenatore che non si può esaudire, non un bug del chiamante.
  const constraints = input.constraints;
  if (constraints !== undefined) {
    if (!Array.isArray(constraints.lockedStarterIds)) {
      throw new Error("constraints.lockedStarterIds deve essere un array di id (vuoto se non ci sono imposti)");
    }
    for (const id of constraints.lockedStarterIds) {
      if (typeof id !== "string" || id.length === 0) {
        throw new Error(`constraints.lockedStarterIds: id mancante o non valido (${String(id)})`);
      }
    }
    if (typeof constraints.locked !== "boolean") {
      throw new Error(
        "constraints.locked è obbligatorio ed è un booleano: «non dichiarato» non è «non bloccata». " +
          "Una formazione che il fantallenatore crede bloccata e che invece viene riottimizzata è " +
          "esattamente il danno che questo contratto esiste per evitare.",
      );
    }
  }
}

/** Il massimo che i sette moduli ammessi concedono a un ruolo di movimento. */
function maxStartersOfRole(role: "D" | "C" | "A"): number {
  let max = 0;
  for (const module of MODULES) {
    const shape = moduleShape(module);
    const n = role === "D" ? shape.defenders : role === "C" ? shape.midfielders : shape.strikers;
    if (n > max) max = n;
  }
  return max;
}

const ROLE_LABEL: Record<Role, string> = { P: "portieri", D: "difensori", C: "centrocampisti", A: "attaccanti" };

/** I vincoli neutri: quelli che non chiedono niente. */
const NO_CONSTRAINTS: LineupConstraints = { lockedStarterIds: [], locked: false };

function isActive(c: LineupConstraints): boolean {
  return c.locked || c.lockedModule !== undefined || c.lockedStarterIds.length > 0;
}

interface ConstraintCheck {
  readonly rejections: readonly ConstraintIssue<ConstraintRejectionCode>[];
  readonly warnings: readonly ConstraintIssue<ConstraintWarningCode>[];
}

/**
 * I VINCOLI SI DICHIARANO IMPOSSIBILI, NON SI RILASSANO — E SI DICHIARANO
 * TUTTI INSIEME.
 *
 * Il referto è una LISTA di motivi, non il primo che si incontra. Chi spunta i
 * giocatori a mano su una schermata e ne ha tre in conflitto, con un motivo per
 * volta corregge e riprova, corregge e riprova: è un gioco a colpire le talpe,
 * e il colpevole è il referto incompleto. Scelta dichiarata e contestabile: non
 * aggiunge una funzione, cambia la completezza di un referto già previsto.
 *
 * MA UN MOTIVO FALSO È PEGGIO DI UN MOTIVO SOLO, e per questo i controlli non
 * sono indipendenti: alcuni leggono un dato che un controllo precedente ha già
 * dichiarato illeggibile. Le dipendenze sono queste, e sono l'unica ragione per
 * cui un motivo può mancare da questo elenco:
 *
 *  - i CONTEGGI PER RUOLO (`LOCKED_TOO_MANY`, `LOCKED_ROLE_OVERFLOW`,
 *    `LOCKED_ELEVEN_NOT_A_MODULE`, `LOCKED_MODULE_INCOMPATIBLE`) leggono i
 *    ruoli degli imposti: con un id SCONOSCIUTO non c'è un ruolo da contare, e
 *    con un id RIPETUTO il conteggio è una lettura arbitraria di una richiesta
 *    che non si sa leggere. In entrambi i casi non si emettono.
 *  - i controlli sul MODULO AMMISSIBILE (`LOCKED_MODULE_INCOMPATIBLE`,
 *    `LOCKED_ELEVEN_NOT_A_MODULE`) leggono l'insieme dei moduli ammessi: se il
 *    modulo imposto non è uno dei sette, quell'insieme non esiste.
 *  - `LOCKED_MODULE_INCOMPATIBLE` non si emette accanto a un
 *    `LOCKED_ROLE_OVERFLOW`: sarebbe vero ma derivato, e soprattutto il suo
 *    messaggio direbbe che «un altro modulo li reggerebbe», che in quel caso è
 *    FALSO. Con undici imposti non si emette perché `LOCKED_ELEVEN_NOT_A_MODULE`
 *    dice la stessa cosa in modo più preciso.
 *  - i controlli sulla FORMAZIONE BLOCCATA (`LOCKED_LINEUP_ILLEGAL`,
 *    `LOCKED_LINEUP_CONTRADICTS_CONSTRAINTS`) leggono la formazione: senza
 *    (`LOCKED_LINEUP_MISSING`) non si emettono. Il confronto fra il modulo
 *    imposto e quello della formazione richiede un modulo imposto valido.
 *
 * L'ordine è stabile e dichiarato, dal più elementare al più fine: identità
 * degli id, poi modulo, poi capienza, poi formazione bloccata.
 */
function checkConstraints(
  constraints: LineupConstraints,
  byId: ReadonlyMap<string, PlayerForecast>,
  currentLineup: Lineup | undefined,
  expectedPlayers: ReadonlyMap<string, PlayerLine>,
): ConstraintCheck {
  const rejections: ConstraintIssue<ConstraintRejectionCode>[] = [];
  const reject = (code: ConstraintRejectionCode, message: string, playerIds: readonly string[] = []): void => {
    rejections.push({ code, message, playerIds });
  };

  // ── 1) IDENTITÀ DEGLI ID. Sconosciuti e ripetuti sono due letture diverse
  // dello stesso elenco e si verificano entrambe: chi ne ha uno di ciascuno
  // deve poter correggere tutt'e due in un giro solo.
  const unknown = constraints.lockedStarterIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) {
    reject(
      "LOCKED_PLAYER_UNKNOWN",
      `titolari imposti che non sono in rosa: ${unknown.join(", ")}. Non si schiera chi non c'è, ` +
        "e il produttore non prova a indovinare chi si intendesse.",
      unknown,
    );
  }
  const seen = new Set<string>();
  const duplicated: string[] = [];
  for (const id of constraints.lockedStarterIds) {
    if (seen.has(id) && !duplicated.includes(id)) duplicated.push(id);
    seen.add(id);
  }
  if (duplicated.length > 0) {
    reject(
      "LOCKED_PLAYER_DUPLICATED",
      `titolari imposti ripetuti: ${duplicated.join(", ")}. Un id ripetuto non è un doppio vincolo: ` +
        "è una richiesta che non si sa leggere, e leggerla a caso sarebbe peggio che rifiutarla.",
      duplicated,
    );
  }

  // ── 2) IL MODULO IMPOSTO deve essere uno dei sette di §9. Non dipende da
  // niente, e tutto ciò che parla di «moduli ammissibili» dipende da lui.
  const moduleIsKnown = constraints.lockedModule === undefined || MODULES.includes(constraints.lockedModule);
  if (!moduleIsKnown) {
    reject(
      "LOCKED_MODULE_NOT_ALLOWED",
      `modulo imposto non ammesso: ${String(constraints.lockedModule)}. §9 ammette ${MODULES.join(", ")}.`,
    );
  }

  // Gli avvertimenti si calcolano sull'insieme di chi finisce IN CAMPO per
  // volontà: gli imposti, oppure — con `locked: true` — tutti gli undici dati.
  const willBeFielded =
    constraints.locked && currentLineup !== undefined
      ? [currentLineup.goalkeeperId, ...currentLineup.starterIds]
      : constraints.lockedStarterIds;
  const neverPlaying = willBeFielded.filter((id) => {
    const f = byId.get(id);
    return f !== undefined && neverPlays(f);
  });
  const warnings: ConstraintIssue<ConstraintWarningCode>[] =
    neverPlaying.length > 0
      ? [
          {
            code: "LOCKED_PLAYER_NEVER_PLAYS",
            message:
              `imposti in campo con probabilità di voto zero: ${neverPlaying.join(", ")}. ` +
              "Non è un vincolo impossibile: è un senza voto in ogni scenario, che §13 manda in " +
              "sostituzione e che, se scoperto, conta come assente. La proposta ne esce peggiore, " +
              "e questo è il prezzo dichiarato della scelta, non un errore da correggere.",
            playerIds: neverPlaying,
          },
        ]
      : [];

  // ── 3) FORMAZIONE INTERA BLOCCATA: si controlla quella, non la capienza di
  // una ricerca che non ci sarà.
  if (constraints.locked) {
    if (currentLineup === undefined) {
      // Senza formazione non c'è niente da controllare: gli altri due motivi
      // del ramo bloccato leggerebbero un dato che non esiste.
      reject(
        "LOCKED_LINEUP_MISSING",
        "formazione bloccata senza formazione di partenza: `constraints.locked` dice «tieni questa», " +
          "e `currentLineup` è assente. Non c'è niente da tenere, e cercarne una sarebbe l'opposto " +
          "di ciò che il vincolo chiede.",
      );
      return { rejections, warnings };
    }
    const illegal = lineupViolations(currentLineup, expectedPlayers);
    const strangers = currentLineup.benchIds.filter((id) => !byId.has(id));
    if (illegal.length > 0 || strangers.length > 0) {
      const parts = [...illegal];
      if (strangers.length > 0) parts.push(`in panchina giocatori che non sono in rosa: ${strangers.join(", ")}`);
      reject(
        "LOCKED_LINEUP_ILLEGAL",
        `la formazione bloccata non è schierabile: ${parts.join("; ")}. Bloccata non vuol dire legale: ` +
          "consegnarla comunque farebbe credere valida una formazione che il regolamento rifiuta.",
        strangers,
      );
    }
    // Il confronto col modulo imposto vale solo se quel modulo esiste.
    if (moduleIsKnown && constraints.lockedModule !== undefined && constraints.lockedModule !== currentLineup.module) {
      reject(
        "LOCKED_LINEUP_CONTRADICTS_CONSTRAINTS",
        `modulo imposto ${constraints.lockedModule} ma la formazione bloccata è un ` +
          `${currentLineup.module}. I due vincoli dicono cose diverse e nessuno dei due è più vero ` +
          "dell'altro: decide il fantallenatore, non il produttore.",
      );
    }
    // Un id sconosciuto è fuori dagli undici per definizione: dirlo sarebbe un
    // motivo derivato da un dato che `LOCKED_PLAYER_UNKNOWN` ha già respinto.
    const eleven = new Set([currentLineup.goalkeeperId, ...currentLineup.starterIds]);
    const outside = constraints.lockedStarterIds.filter((id) => byId.has(id) && !eleven.has(id));
    if (outside.length > 0) {
      reject(
        "LOCKED_LINEUP_CONTRADICTS_CONSTRAINTS",
        `titolari imposti che non sono negli undici della formazione bloccata: ${outside.join(", ")}. ` +
          "I due vincoli si contraddicono e il produttore non sceglie quale dei due tradire.",
        outside,
      );
    }
    return { rejections, warnings };
  }

  // ── 4) CAPIENZA DELLA RICERCA VINCOLATA. Tutto ciò che segue conta i ruoli
  // degli imposti: con un id sconosciuto o ripetuto quel conteggio non è una
  // lettura possibile, e ogni motivo che ne uscisse sarebbe inventato.
  if (unknown.length > 0 || duplicated.length > 0) return { rejections, warnings };

  if (constraints.lockedStarterIds.length > 11) {
    reject(
      "LOCKED_TOO_MANY",
      `${constraints.lockedStarterIds.length} titolari imposti: gli undici sono undici (§9).`,
      constraints.lockedStarterIds,
    );
  }

  const lockedByRole: Record<Role, string[]> = { P: [], D: [], C: [], A: [] };
  for (const id of constraints.lockedStarterIds) lockedByRole[(byId.get(id) as PlayerForecast).role].push(id);

  // Un `LOCKED_ROLE_OVERFLOW` per RUOLO: chi ha sbagliato in due reparti li
  // vede tutt'e due, invece di scoprire il secondo dopo aver corretto il primo.
  let anyOverflow = false;
  if (lockedByRole.P.length > 1) {
    anyOverflow = true;
    reject(
      "LOCKED_ROLE_OVERFLOW",
      `${lockedByRole.P.length} portieri imposti: §9 ne ammette uno solo in campo.`,
      lockedByRole.P,
    );
  }
  for (const role of OUTFIELD_ROLES) {
    const key = role as "D" | "C" | "A";
    const max = maxStartersOfRole(key);
    if (lockedByRole[key].length > max) {
      anyOverflow = true;
      reject(
        "LOCKED_ROLE_OVERFLOW",
        `${lockedByRole[key].length} ${ROLE_LABEL[key]} imposti: nessuno dei sette moduli di §9 ne ` +
          `schiera più di ${max}. Il vincolo è impossibile con qualunque modulo, non solo con quello scelto.`,
        lockedByRole[key],
      );
    }
  }

  // I due motivi che seguono leggono l'insieme dei moduli ammissibili: senza un
  // modulo imposto valido quell'insieme non esiste.
  if (!moduleIsKnown) return { rejections, warnings };
  const admissible = constraints.lockedModule === undefined ? MODULES : [constraints.lockedModule];
  const roleCensus =
    `${lockedByRole.P.length}P/${lockedByRole.D.length}D/${lockedByRole.C.length}C/${lockedByRole.A.length}A`;

  // Undici imposti sono già una formazione: o è un modulo ammesso, o non lo è.
  // Sopra gli undici il conto non ha senso, e `LOCKED_TOO_MANY` l'ha già detto.
  if (constraints.lockedStarterIds.length === 11) {
    const exact = admissible.some((module) => {
      const shape = moduleShape(module);
      return (
        lockedByRole.P.length === 1 &&
        lockedByRole.D.length === shape.defenders &&
        lockedByRole.C.length === shape.midfielders &&
        lockedByRole.A.length === shape.strikers
      );
    });
    if (!exact) {
      reject(
        "LOCKED_ELEVEN_NOT_A_MODULE",
        `undici titolari imposti (${roleCensus}) che non compongono nessun modulo ammesso fra ` +
          `${admissible.join(", ")} (§9 chiede un portiere più dieci di movimento). Con undici imposti ` +
          "non resta un solo posto libero: o i ruoli sono già un modulo, o il vincolo non si può esaudire.",
        constraints.lockedStarterIds,
      );
    }
    return { rejections, warnings };
  }

  // Accanto a un traboccamento di ruolo questo motivo sarebbe vero ma derivato,
  // e il suo messaggio — «un altro modulo li reggerebbe» — sarebbe falso.
  if (anyOverflow || constraints.lockedStarterIds.length > 11) return { rejections, warnings };

  const fits = (module: Module): boolean => {
    const shape = moduleShape(module);
    return (
      lockedByRole.D.length <= shape.defenders &&
      lockedByRole.C.length <= shape.midfielders &&
      lockedByRole.A.length <= shape.strikers
    );
  };
  if (!admissible.some(fits)) {
    reject(
      "LOCKED_MODULE_INCOMPATIBLE",
      constraints.lockedModule === undefined
        ? `i ruoli dei titolari imposti (${roleCensus}) non stanno insieme in nessuno dei sette moduli di §9.`
        : `i ruoli dei titolari imposti (${roleCensus}) non stanno nel modulo imposto ` +
          `${constraints.lockedModule}. Un altro modulo li reggerebbe, ma il modulo è a sua volta un ` +
          "vincolo: il produttore non ne cambia uno per salvare l'altro.",
      constraints.lockedStarterIds,
    );
  }

  return { rejections, warnings };
}

/** La riga di giornata di chi gioca: esattamente la previsione, niente di più. */
function expectedLine(f: PlayerForecast): PlayerLine {
  return {
    id: f.id,
    role: f.role,
    baseVote: f.expected.baseVote,
    fantasyScore: f.expected.fantasyScore,
    receivedAnyBonus: f.expected.receivedAnyBonus,
    missedPenalty: f.expected.missedPenalty,
  };
}

/**
 * La riga di chi non gioca: SENZA VOTO PURO. `cards:"none"` e
 * `otherBonusMalus:0` non sono un default inventato — sono la dichiarazione
 * esplicita che questa previsione rappresenta il caso `sv_clean` di §13 e nessun
 * altro. Lasciarli indefiniti darebbe `undeclared`, cioè «non lo so», che è una
 * cosa diversa da «non gioca».
 */
function absentLine(f: PlayerForecast): PlayerLine {
  return { id: f.id, role: f.role, baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 };
}

/** Ordine dichiarato: punteggio atteso desc, poi probabilità desc, poi id asc. */
function compareByExpectedDesc(a: PlayerForecast, b: PlayerForecast): number {
  if (a.expected.fantasyScore !== b.expected.fantasyScore) {
    return b.expected.fantasyScore - a.expected.fantasyScore;
  }
  if (a.voteProbability !== b.voteProbability) return b.voteProbability - a.voteProbability;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Il rovescio, per scegliere chi togliere: fs asc, poi p asc, poi id asc. */
function compareByExpectedAsc(a: PlayerForecast, b: PlayerForecast): number {
  if (a.expected.fantasyScore !== b.expected.fantasyScore) {
    return a.expected.fantasyScore - b.expected.fantasyScore;
  }
  if (a.voteProbability !== b.voteProbability) return a.voteProbability - b.voteProbability;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Una formazione in corso di valutazione, prima di diventare un `Lineup`. */
interface LineupPlan {
  readonly module: Module;
  readonly keeperId: string;
  /** Insieme dei titolari di movimento, senza ordine significativo. */
  readonly starterIds: readonly string[];
  /**
   * La panchina NELL'ORDINE in cui verrà consegnata. Fa parte dello stato del
   * piano — non è una funzione dei titolari — perché quell'ordine decide quali
   * ruoli restano scoperti quando il tetto di §10 morde, e quindi è una scelta
   * da valutare come le altre. Dichiarazione 2) in testa al file.
   */
  readonly benchIds: readonly string[];
}

/** Chi non ha probabilità di giocare non entra mai: §13 lo lascia senza voto. */
function neverPlays(f: PlayerForecast): boolean {
  return f.voteProbability <= 0;
}

/**
 * L'ordine INIZIALE della panchina: chi un voto può prenderlo davanti a chi non
 * può prenderlo in nessuno scenario, poi il criterio dichiarato. È un punto di
 * partenza euristico, non la risposta: la ricerca lo rimette in discussione.
 */
function compareForBenchStart(a: PlayerForecast, b: PlayerForecast): number {
  const aNever = neverPlays(a) ? 1 : 0;
  const bNever = neverPlays(b) ? 1 : 0;
  if (aNever !== bNever) return aNever - bNever;
  return compareByExpectedDesc(a, b);
}

/** La panchina di partenza per un insieme di undici già scelto. */
function startingBench(squad: readonly PlayerForecast[], chosen: ReadonlySet<string>): string[] {
  return squad
    .filter((f) => !chosen.has(f.id))
    .slice()
    .sort(compareForBenchStart)
    .map((f) => f.id);
}

interface Scenario {
  readonly weight: number;
  readonly players: ReadonlyMap<string, PlayerLine>;
  /**
   * Quale formazione avversaria vale in QUESTO scenario. È un indice nel
   * vettore delle candidate avversarie, estratto una volta sola per giornata
   * prima della ricerca: nessuna formazione nostra può cambiarlo, ed è per
   * questo che il confronto fra due nostre candidate misura le formazioni e non
   * il campionamento.
   */
  readonly opponentIndex: number;
}

/**
 * La stima di una formazione sugli scenari. È esportata perché §3.2 — l'ordine
 * dei criteri fini — sia verificabile da un test invece che creduta sulla
 * parola.
 */
export interface LineupValuation {
  /** Il numero che decide, nell'unità della competizione dichiarata. */
  readonly objectiveValue: number;
  /** Massa di scenari che il regolamento non copre: non attribuita a nessuno. */
  readonly undecidedWeight: number;
  readonly expectedLeaguePoints: number;
  readonly expectedOurTotal: number;
  /** Varianza del nostro punteggio: terzo criterio di §3.2. */
  readonly ourTotalVariance: number;
  readonly winProbability: number;
  readonly drawProbability: number;
  readonly lossProbability: number;
  readonly fullyTabulated: boolean;
  readonly allResolved: boolean;
}

/**
 * I CRITERI FINI DI §3.2, in ordine: obiettivo, poi punteggio atteso maggiore,
 * poi VARIANZA MINORE. Positivo se `a` è meglio di `b`.
 *
 * La differenza reti attesa non è più un criterio, ed è un cambio dichiarato:
 * era il terzo criterio finché l'obiettivo era «i punti di lega attesi» letti
 * come una media, e ricalcava l'ordine di §22. Con l'obiettivo sugli scenari il
 * terzo criterio è la varianza — §3.2 del disegno — e la ragione è che a parità
 * di punti attesi e di punteggio atteso ciò che distingue due formazioni è
 * quanto ballano, non un decimale di differenza reti che la conversione a fasce
 * ha già contato dentro i punti.
 *
 * La varianza NON entra come «meno rischio è meglio» in generale: entra solo
 * dopo che obiettivo e punteggio atteso hanno pareggiato. Con 3 / 1 / 0 da
 * sfavoriti conviene alzare la varianza, e quel guadagno è già dentro il primo
 * criterio — che è il punto per cui l'obiettivo si calcola sugli scenari.
 */
export function compareLineupValuations(a: LineupValuation, b: LineupValuation): number {
  if (a.objectiveValue !== b.objectiveValue) return a.objectiveValue - b.objectiveValue;
  if (a.expectedOurTotal !== b.expectedOurTotal) return a.expectedOurTotal - b.expectedOurTotal;
  return b.ourTotalVariance - a.ourTotalVariance;
}

/**
 * La stima di UNA formazione sugli scenari già costruiti. Sta fuori da
 * `proposeLineup` perché serve anche alla formazione bloccata, che di ricerca
 * non ne fa: il numero deve venire dalla stessa aritmetica in tutti e due i
 * casi, altrimenti «bloccata» e «proposta» non sarebbero confrontabili.
 */
function valuationOf(
  lineup: Lineup,
  opponentLineups: readonly Lineup[],
  context: GameweekContext,
  scenarios: readonly Scenario[],
  competition: CompetitionObjective,
): LineupValuation {
  let objectiveValue = 0;
  let undecidedWeight = 0;
  let expectedLeaguePoints = 0;
  let expectedOurTotal = 0;
  let expectedOurTotalSquared = 0;
  let win = 0;
  let draw = 0;
  let loss = 0;
  let fullyTabulated = true;
  let allResolved = true;
  for (const scenario of scenarios) {
    const theirLineup = opponentLineups[scenario.opponentIndex] as Lineup;
    const outcome = simulateGameweek({ ourLineup: lineup, theirLineup, players: scenario.players, context });
    const contribution = scenarioObjectiveValue(outcome, competition, LEAGUE_POINTS);
    if (contribution.decided) objectiveValue += scenario.weight * contribution.value;
    else undecidedWeight += scenario.weight;
    expectedLeaguePoints += scenario.weight * leaguePointsOf(outcome, LEAGUE_POINTS).value;
    expectedOurTotal += scenario.weight * outcome.ours.total;
    expectedOurTotalSquared += scenario.weight * outcome.ours.total * outcome.ours.total;
    if (outcome.ourGoals > outcome.theirGoals) win += scenario.weight;
    else if (outcome.ourGoals === outcome.theirGoals) draw += scenario.weight;
    else loss += scenario.weight;
    if (!outcome.fullyTabulated) fullyTabulated = false;
    if (!outcome.resolved) allResolved = false;
  }
  // Varianza come E[X²] − E[X]². Il massimo con zero non nasconde niente: i
  // pesi sommano a uno, quindi l'unica differenza negativa possibile è
  // l'errore di virgola mobile, e una varianza di −1e−13 sarebbe un criterio di
  // ordinamento fatto di rumore.
  const ourTotalVariance = Math.max(0, expectedOurTotalSquared - expectedOurTotal * expectedOurTotal);
  return {
    objectiveValue,
    undecidedWeight,
    expectedLeaguePoints,
    expectedOurTotal,
    ourTotalVariance,
    winProbability: win,
    drawProbability: draw,
    lossProbability: loss,
    fullyTabulated,
    allResolved,
  };
}

/**
 * La quota di scenari realmente toccata da ciascuna formazione avversaria, nel
 * suo ordine dichiarato. Si legge dagli scenari e non dai pesi: con il
 * campionamento le due cose non coincidono, e chi verifica una proposta deve
 * vedere il campione, non l'intenzione.
 */
function opponentShareOf(scenarios: readonly Scenario[], candidates: number): number[] {
  const share = new Array<number>(candidates).fill(0);
  for (const scenario of scenarios) share[scenario.opponentIndex] = (share[scenario.opponentIndex] as number) + scenario.weight;
  return share;
}

/**
 * Nessuna formazione, nessuno scenario valutato: gli attesi sono zeri
 * DICHIARATI, non una stima. `method` e `seed` dicono comunque che cosa si
 * SAREBBE usato, perché dipendono solo dagli input.
 */
function emptyEstimate(
  method: "exact" | "sampled",
  seed: number | null,
  objective: { readonly kind: CompetitionObjectiveKind; readonly unit: ObjectiveUnit },
  opponentLineups: number,
): LineupProposal["estimate"] {
  return {
    method,
    scenarios: 0,
    seed,
    objectiveValue: 0,
    objectiveKind: objective.kind,
    objectiveUnit: objective.unit,
    undecidedWeight: 0,
    expectedLeaguePoints: 0,
    winProbability: 0,
    drawProbability: 0,
    lossProbability: 0,
    expectedOurTotal: 0,
    ourTotalVariance: 0,
    opponentLineups,
    opponentLineupShare: [],
    fullyTabulated: true,
    allResolved: true,
    refinementCapReached: false,
  };
}

export function proposeLineup(input: LineupProposalInput): LineupProposal {
  assertInput(input);

  const { squad, opponent, context } = input;
  const scenarioBudget = input.scenarioBudget ?? DEFAULT_SCENARIO_BUDGET;
  const requestedSeed = input.seed ?? DEFAULT_SEED;
  const competition = input.competition ?? LEAGUE_OBJECTIVE;
  const objective = describeCompetitionObjective(competition, LEAGUE_POINTS);
  const objectiveLabel = objective.label;

  // ── LE FORMAZIONI AVVERSARIE. Senza distribuzione c'è la sola modale a peso
  // 1: il caso di sempre, non un ramo separato.
  const opponentCandidates: readonly WeightedOpponentLineup[] =
    opponent.lineupDistribution ?? [{ lineup: opponent.lineup, weight: 1 }];
  const opponentLineups = opponentCandidates.map((candidate) => candidate.lineup);
  const opponentWeights = normalisedOpponentWeights(opponentCandidates, "distribuzione delle formazioni avversarie");

  const byId = new Map(squad.map((f) => [f.id, f]));
  const everyone: readonly PlayerForecast[] = [...squad, ...opponent.players];

  // ── Righe attese: la previsione puntuale, dove tutti giocano al valore atteso
  // tranne chi ha p = 0, che è un senza voto e quindi non può essere titolare —
  // a meno che il fantallenatore lo IMPONGA (dichiarazione 5).
  const expectedPlayers = new Map<string, PlayerLine>();
  for (const f of everyone) {
    expectedPlayers.set(f.id, f.voteProbability > 0 ? expectedLine(f) : absentLine(f));
  }
  const expectedSquadLines = squad.map((f) => expectedPlayers.get(f.id) as PlayerLine);

  // ── Scenari: si generano UNA volta sola e valgono per ogni candidata.
  //
  // L'esattezza ora comprende anche l'avversario: uno scenario esatto è una
  // coppia (disponibilità, formazione avversaria), e il loro prodotto
  // cartesiano deve stare nel budget. Con una formazione avversaria sola il
  // conto è identico a quello di prima, che è il modo in cui il caso degenere
  // resta il caso di sempre.
  const uncertain = everyone.filter((f) => f.voteProbability > 0 && f.voteProbability < 1);
  const exact =
    uncertain.length <= 30 && Math.pow(2, uncertain.length) * opponentCandidates.length <= scenarioBudget;
  const method: "exact" | "sampled" = exact ? "exact" : "sampled";
  const usedSeed = exact ? null : requestedSeed;

  // ── VINCOLI. Assenti, tutto quel che segue è identico a prima che
  // esistessero: `NO_CONSTRAINTS` non è un default con effetti, è il nulla.
  const constraints = input.constraints ?? NO_CONSTRAINTS;
  const constraintsActive = isActive(constraints);
  const check = constraintsActive
    ? checkConstraints(constraints, byId, input.currentLineup, expectedPlayers)
    : {
        rejections: [] as readonly ConstraintIssue<ConstraintRejectionCode>[],
        warnings: [] as readonly ConstraintIssue<ConstraintWarningCode>[],
      };
  const reportOf = (optimized: boolean): ConstraintReport => ({
    applied: constraintsActive,
    optimized,
    lockedStarterIds: [...constraints.lockedStarterIds],
    lockedModule: constraints.lockedModule ?? null,
    locked: constraints.locked,
    rejections: check.rejections,
    warnings: check.warnings,
  });
  const constraintsLabel = constraintsActive
    ? "vincoli del fantallenatore: " +
      [
        constraints.locked ? "formazione intera bloccata" : null,
        constraints.lockedModule !== undefined ? `modulo imposto ${constraints.lockedModule}` : null,
        constraints.lockedStarterIds.length > 0
          ? `titolari imposti ${[...constraints.lockedStarterIds].sort().join(", ")}`
          : null,
      ]
        .filter((part): part is string => part !== null)
        .join("; ")
    : "";

  // Un vincolo impossibile NON è una formazione impossibile: si rifiuta con il
  // suo motivo, e il motivo dice quale vincolo togliere. Nessun rilassamento.
  if (check.rejections.length > 0) {
    return {
      lineup: null,
      feasible: false,
      reason:
        `vincoli non soddisfacibili, ${check.rejections.length} motivo/i ` +
        `[${check.rejections.map((r) => r.code).join(", ")}]: ` +
        check.rejections.map((r) => r.message).join(" "),
      pointForecast: { lineup: null, outcome: null },
      estimate: emptyEstimate(method, usedSeed, objective, opponentCandidates.length),
      evaluated: 0,
      objectiveLabel,
      constraints: reportOf(false),
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }

  // ── FORMAZIONE INTERA BLOCCATA — non si cerca, si valuta e si consegna.
  if (constraints.locked) {
    const locked = input.currentLineup as Lineup;
    const scenarios = buildScenarios(
      everyone,
      uncertain,
      exact,
      scenarioBudget,
      requestedSeed,
      expectedPlayers,
      opponentWeights,
    );
    const value = valuationOf(locked, opponentLineups, context, scenarios, competition);
    const outcome = simulateGameweek({
      ourLineup: locked,
      theirLineup: opponent.lineup,
      players: expectedPlayers,
      context,
    });
    return {
      lineup: locked,
      feasible: true,
      reason:
        "FORMAZIONE BLOCCATA: NESSUNA RICERCA E NESSUNA OTTIMIZZAZIONE. La formazione consegnata è " +
        `quella ricevuta, valutata su ${scenarios.length} scenari (${method}) contro ` +
        `${opponentCandidates.length} formazione/i avversaria/e pesata/e, soltanto per dirne i ` +
        `numeri; criterio: ${objectiveLabel}; ${constraintsLabel}` +
        (value.undecidedWeight > 0
          ? `; MASSA NON ATTRIBUITA ${value.undecidedWeight}: scenari che il regolamento non copre, ` +
            "l'obiettivo qui sopra è un minorante"
          : "") +
        (check.warnings.length > 0 ? `; AVVERTIMENTI: ${check.warnings.map((w) => w.code).join(", ")}` : ""),
      pointForecast: { lineup: locked, outcome },
      estimate: {
        method,
        scenarios: scenarios.length,
        seed: usedSeed,
        objectiveValue: value.objectiveValue,
        objectiveKind: objective.kind,
        objectiveUnit: objective.unit,
        undecidedWeight: value.undecidedWeight,
        expectedLeaguePoints: value.expectedLeaguePoints,
        winProbability: value.winProbability,
        drawProbability: value.drawProbability,
        lossProbability: value.lossProbability,
        expectedOurTotal: value.expectedOurTotal,
        ourTotalVariance: value.ourTotalVariance,
        opponentLineups: opponentCandidates.length,
        opponentLineupShare: opponentShareOf(scenarios, opponentCandidates.length),
        fullyTabulated: value.fullyTabulated,
        allResolved: value.allResolved,
        refinementCapReached: false,
      },
      evaluated: 1,
      objectiveLabel,
      constraints: reportOf(false),
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }

  const lockedIds: ReadonlySet<string> = new Set(constraints.lockedStarterIds);

  // ── TIER 1 — previsione puntuale, con l'ottimizzatore esatto a voti noti.
  // Gli imposti entrano come `mustStart`, il modulo imposto come `onlyModule`:
  // senza vincoli i due argomenti sono `undefined` e la chiamata è quella di
  // sempre.
  //
  // IL LIVELLO 1 RESTA SOLO UN INNESCO, E CONTRO LA SOLA MODALE (§10 del
  // disegno). La sua decomposizione per ruolo — difensori e attaccanti scelti
  // massimizzando il nostro totale, centrocampo per ultimo — poggia su una
  // monotonia che vale a FORMAZIONE AVVERSARIA FISSATA. Con una distribuzione
  // quella proprietà non è dimostrata, e spostarci dentro la distribuzione
  // significherebbe usare un teorema fuori dalle sue ipotesi. Quindi qui entra
  // la modale, a previsione puntuale, e con l'obiettivo del campionato anche
  // quando la competizione è un'altra: è il punto da cui la ricerca parte, non
  // quello che decide. A decidere è il livello 2, che valuta ogni candidata
  // sugli scenari con la distribuzione intera e l'obiettivo dichiarato.
  const tierOne = bestLineupExPost({
    squad: expectedSquadLines,
    theirLineup: opponent.lineup,
    players: expectedPlayers,
    context,
    onlyModule: constraints.lockedModule,
    mustStart: lockedIds.size > 0 ? [...constraints.lockedStarterIds] : undefined,
  });

  if (!tierOne.feasible || tierOne.lineup === null) {
    return {
      lineup: null,
      feasible: false,
      reason:
        `nessuna formazione proponibile a previsione puntuale: ${tierOne.reason}` +
        (constraintsActive ? ` (${constraintsLabel})` : ""),
      pointForecast: { lineup: null, outcome: null },
      estimate: emptyEstimate(method, usedSeed, objective, opponentCandidates.length),
      evaluated: tierOne.evaluated,
      objectiveLabel,
      constraints: reportOf(true),
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }

  // Gli scenari si costruiscono SOLO quando c'è una formazione da valutare: con
  // `feasible:false` sarebbero migliaia di mappe generate per non essere lette.
  // Si generano UNA volta sola e valgono per ogni candidata.
  const scenarios = buildScenarios(
    everyone,
    uncertain,
    exact,
    scenarioBudget,
    requestedSeed,
    expectedPlayers,
    opponentWeights,
  );

  // L'ordine dei titolari è dichiarato (3) in testa al file); la panchina arriva
  // dal piano e NON viene riscritta qui: riscriverla annullerebbe le mosse (d).
  const buildLineup = (plan: LineupPlan): Lineup => {
    const starters: string[] = [];
    for (const role of OUTFIELD_ROLES) {
      const ofRole = plan.starterIds
        .map((id) => byId.get(id) as PlayerForecast)
        .filter((f) => f.role === role)
        .sort(compareByExpectedDesc);
      for (const f of ofRole) starters.push(f.id);
    }
    return {
      module: plan.module,
      goalkeeperId: plan.keeperId,
      starterIds: starters,
      benchIds: [...plan.benchIds],
    };
  };

  let evaluated = tierOne.evaluated;

  const valueOf = (lineup: Lineup): LineupValuation => {
    evaluated += 1;
    return valuationOf(lineup, opponentLineups, context, scenarios, competition);
  };

  const startPlan: LineupPlan = {
    module: tierOne.lineup.module,
    keeperId: tierOne.lineup.goalkeeperId,
    starterIds: [...tierOne.lineup.starterIds],
    benchIds: startingBench(squad, new Set([tierOne.lineup.goalkeeperId, ...tierOne.lineup.starterIds])),
  };
  const pointForecastLineup = buildLineup(startPlan);
  const pointForecastOutcome = simulateGameweek({
    ourLineup: pointForecastLineup,
    theirLineup: opponent.lineup,
    players: expectedPlayers,
    context,
  });

  // ── TIER 2 — hill climbing steepest ascent sugli scenari.
  //
  // Si accetta SOLO una mossa che migliora strettamente sui tre criteri di §22
  // portati agli attesi. Il criterio 4 (ordine di `MODULES`, poi la stringa dei
  // titolari) NON è un criterio di miglioramento: serve a scegliere in modo
  // deterministico fra mosse che valgono uguale, mai a muoversi di lato. Se
  // fosse un criterio di accettazione, la ricerca si sposterebbe fra formazioni
  // equivalenti solo perché una ha un id alfabeticamente più piccolo.
  let current = startPlan;
  let currentLineup = pointForecastLineup;
  let currentValue = valueOf(currentLineup);
  let iterations = 0;
  let capReached = false;

  for (;;) {
    if (iterations >= MAX_REFINEMENT_ITERATIONS) {
      capReached = true;
      break;
    }
    let bestMove: { plan: LineupPlan; lineup: Lineup; value: LineupValuation } | null = null;
    for (const plan of neighbours(current, squad, byId, lockedIds, constraints.lockedModule)) {
      const lineup = buildLineup(plan);
      const value = valueOf(lineup);
      if (bestMove === null) {
        bestMove = { plan, lineup, value };
        continue;
      }
      const cmp = compareLineupValuations(value, bestMove.value);
      if (cmp > 0 || (cmp === 0 && tieBreakKey(lineup) < tieBreakKey(bestMove.lineup))) {
        bestMove = { plan, lineup, value };
      }
    }
    if (bestMove === null || compareLineupValuations(bestMove.value, currentValue) <= 0) break;
    current = bestMove.plan;
    currentLineup = bestMove.lineup;
    currentValue = bestMove.value;
    iterations += 1;
  }

  // Il risultato DEVE essere legale. Se non lo è non è un input sbagliato — gli
  // input sono già stati controllati — è un bug di questo file, e si ferma qui.
  const finalViolations = lineupViolations(currentLineup, expectedPlayers);
  if (finalViolations.length > 0) {
    throw new Error(
      `bug del produttore: la formazione proposta non è legale (${finalViolations.join("; ")}). ` +
        "Gli input erano già stati validati: questo è un difetto dell'algoritmo, non del dato.",
    );
  }

  // I VINCOLI SI VERIFICANO SUL RISULTATO, NON SOLO SULL'INTENZIONE. Se un
  // imposto non è fra gli undici consegnati, un ramo della ricerca l'ha perso:
  // è un bug di questo file, e consegnare comunque significherebbe far credere
  // schierato un giocatore che non c'è — il danno esatto che 5) descrive.
  if (lockedIds.size > 0 || constraints.lockedModule !== undefined) {
    const fielded = new Set([currentLineup.goalkeeperId, ...currentLineup.starterIds]);
    const lost = [...lockedIds].filter((id) => !fielded.has(id));
    if (lost.length > 0 || (constraints.lockedModule !== undefined && currentLineup.module !== constraints.lockedModule)) {
      throw new Error(
        "bug del produttore: la ricerca ha violato un vincolo dichiarato " +
          `(imposti persi: ${lost.length > 0 ? lost.join(", ") : "nessuno"}; ` +
          `modulo atteso ${String(constraints.lockedModule)}, ottenuto ${currentLineup.module}). ` +
          "Un vincolo si rispetta o si rifiuta: non si perde per strada.",
      );
    }
  }

  const reason =
    `innesco a previsione puntuale con l'ottimizzatore esatto sulla formazione avversaria modale ` +
    `(${tierOne.reason}), poi raffinamento hill climbing su ${scenarios.length} scenari (${method}) ` +
    `contro ${opponentCandidates.length} formazione/i avversaria/e pesata/e, con ${iterations} ` +
    `mossa/e accettata/e; criterio: ${objectiveLabel}` +
    (currentValue.undecidedWeight > 0
      ? `; MASSA NON ATTRIBUITA ${currentValue.undecidedWeight}: scenari che il regolamento non copre, ` +
        "l'obiettivo qui sopra è un minorante"
      : "") +
    (constraintsActive
      ? `; ${constraintsLabel}, rispettati per intero e mai messi in discussione dalla ricerca: la ` +
        "proposta è la migliore CHE LI RISPETTA, e può valere meno della migliore senza vincoli"
      : "") +
    (check.warnings.length > 0 ? `; AVVERTIMENTI: ${check.warnings.map((w) => w.code).join(", ")}` : "") +
    (capReached ? `; TETTO DI ${MAX_REFINEMENT_ITERATIONS} ITERAZIONI RAGGIUNTO: il raffinamento non è convergente` : "");

  return {
    lineup: currentLineup,
    feasible: true,
    reason,
    pointForecast: { lineup: pointForecastLineup, outcome: pointForecastOutcome },
    estimate: {
      method,
      scenarios: scenarios.length,
      seed: usedSeed,
      objectiveValue: currentValue.objectiveValue,
      objectiveKind: objective.kind,
      objectiveUnit: objective.unit,
      undecidedWeight: currentValue.undecidedWeight,
      expectedLeaguePoints: currentValue.expectedLeaguePoints,
      winProbability: currentValue.winProbability,
      drawProbability: currentValue.drawProbability,
      lossProbability: currentValue.lossProbability,
      expectedOurTotal: currentValue.expectedOurTotal,
      ourTotalVariance: currentValue.ourTotalVariance,
      opponentLineups: opponentCandidates.length,
      opponentLineupShare: opponentShareOf(scenarios, opponentCandidates.length),
      fullyTabulated: currentValue.fullyTabulated,
      allResolved: currentValue.allResolved,
      refinementCapReached: capReached,
    },
    evaluated,
    objectiveLabel,
    constraints: reportOf(true),
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

/**
 * Chiave di rottura dei pareggi: ordine di `MODULES`, portiere, titolari e —
 * da quando l'ordine della panchina è una mossa — la panchina. Senza l'ultimo
 * pezzo due ordini di panchina che valgono uguale avrebbero la stessa chiave, e
 * a scegliere sarebbe l'ordine di generazione del vicinato: deterministico, sì,
 * ma illeggibile e fragile a ogni riordino del codice.
 */
function tieBreakKey(lineup: Lineup): string {
  const moduleIndex = MODULES.indexOf(lineup.module);
  return (
    `${String(moduleIndex).padStart(2, "0")}|${lineup.goalkeeperId}|${lineup.starterIds.join(",")}` +
    `|${lineup.benchIds.join(",")}`
  );
}

/**
 * Il vicinato: (a) scambio di un titolare di movimento con un non-titolare dello
 * stesso ruolo; (b) scambio del portiere con un altro portiere; (c) cambio
 * modulo, togliendo i peggiori dove il modulo chiede meno e aggiungendo i
 * migliori dove chiede di più; (d) RIORDINO DELLA PANCHINA — scambio di due
 * posizioni adiacenti, oppure un panchinaro portato in testa.
 *
 * Le mosse (a) e (b) fanno UNO SCAMBIO: chi entra lascia il suo posto in
 * panchina a chi esce, e il resto dell'ordine non si tocca. Una mossa non deve
 * cambiare due cose insieme, altrimenti non si sa quale delle due l'ha
 * migliorata. Solo (c) ricostruisce la panchina, perché cambia l'insieme dei
 * titolari in più ruoli e un ordine ereditato non avrebbe significato.
 *
 * Le mosse (d) saltano chiunque abbia `voteProbability = 0`: non ha voto in
 * nessuno scenario, `applySubstitutions` lo salta sempre, e spostarlo lascia
 * invariato l'ordine relativo di tutti quelli che possono entrare. Sarebbero
 * mosse identiche all'originale pagate al prezzo pieno di una valutazione su
 * tutti gli scenari — e terrebbero in vita il limite che 2) dichiara chiuso.
 *
 * I VINCOLI ENTRANO QUI, NON SOLO NEL PUNTO DI PARTENZA. Un imposto messo
 * titolare all'inizio e poi rimovibile da una mossa (a), (b) o (c) non è un
 * vincolo: è un suggerimento che la ricerca scarta appena trova mezzo punto in
 * più — ed è quel mezzo punto a renderlo probabile, non improbabile. Perciò
 * `lockedIds` toglie dal vicinato ogni mossa che sposti un imposto, e
 * `lockedModule` toglie in blocco le mosse (c). Il vicinato risultante non
 * contiene NESSUNA formazione che violi un vincolo: la garanzia è strutturale,
 * non un controllo a valle che si potrebbe dimenticare.
 */
function neighbours(
  current: LineupPlan,
  squad: readonly PlayerForecast[],
  byId: ReadonlyMap<string, PlayerForecast>,
  lockedIds: ReadonlySet<string>,
  lockedModule: Module | undefined,
): LineupPlan[] {
  const out: LineupPlan[] = [];
  const startersSet = new Set(current.starterIds);
  const inLineup = new Set([current.keeperId, ...current.starterIds]);
  /** Chi esce dagli undici prende in panchina il posto di chi entra. */
  const benchAfterSwap = (leavingId: string, enteringId: string): string[] =>
    current.benchIds.map((id) => (id === enteringId ? leavingId : id));

  // (a) scambi di movimento, stesso ruolo.
  for (const starterId of current.starterIds) {
    if (lockedIds.has(starterId)) continue; // un imposto non esce: 5).
    const starter = byId.get(starterId) as PlayerForecast;
    for (const candidate of squad) {
      if (inLineup.has(candidate.id) || candidate.role !== starter.role) continue;
      // Chi non prende voto in nessuno scenario non torna fra gli undici: a
      // previsione puntuale `bestLineupExPost` lo esclude già (non ha riga), e
      // reintrodurlo qui vorrebbe dire schierare un titolare da sostituire
      // sempre. Tenerlo fuori è anche ciò che rende VERO il «p = 0 in coda»
      // della dichiarazione 2): nessuna mossa può riportarlo davanti.
      if (neverPlays(candidate)) continue;
      out.push({
        module: current.module,
        keeperId: current.keeperId,
        starterIds: current.starterIds.map((id) => (id === starterId ? candidate.id : id)),
        benchIds: benchAfterSwap(starterId, candidate.id),
      });
    }
  }

  // (b) scambio del portiere — impossibile se il portiere è imposto.
  for (const candidate of lockedIds.has(current.keeperId) ? [] : squad) {
    if (candidate.role !== "P" || candidate.id === current.keeperId || startersSet.has(candidate.id)) continue;
    if (neverPlays(candidate)) continue; // stessa ragione di (a).
    out.push({
      module: current.module,
      keeperId: candidate.id,
      starterIds: [...current.starterIds],
      benchIds: benchAfterSwap(current.keeperId, candidate.id),
    });
  }

  // (c) cambio modulo — non esiste se il modulo è imposto.
  for (const module of lockedModule === undefined ? MODULES : []) {
    if (module === current.module) continue;
    const plan = replan(current, module, squad, byId, lockedIds);
    if (plan !== null) out.push(plan);
  }

  // (d) riordino della panchina, a titolari invariati.
  const canMove = (id: string): boolean => !neverPlays(byId.get(id) as PlayerForecast);
  for (let i = 0; i + 1 < current.benchIds.length; i += 1) {
    const first = current.benchIds[i] as string;
    const second = current.benchIds[i + 1] as string;
    if (!canMove(first) || !canMove(second)) continue;
    const swapped = [...current.benchIds];
    swapped[i] = second;
    swapped[i + 1] = first;
    out.push({ ...current, benchIds: swapped });
  }
  // Portare in testa: uno scambio adiacente alla volta non basta a risalire una
  // panchina lunga, perché i passi intermedi non migliorano e la salita si ferma
  // prima di arrivare. Da 2 in poi: da 1 sarebbe lo scambio adiacente di sopra.
  for (let i = 2; i < current.benchIds.length; i += 1) {
    const moved = current.benchIds[i] as string;
    if (!canMove(moved)) continue;
    out.push({
      ...current,
      benchIds: [moved, ...current.benchIds.filter((_, index) => index !== i)],
    });
  }
  return out;
}

/**
 * Riscrive i titolari per un modulo diverso. `null` se la rosa non lo consente
 * — o se i titolari IMPOSTI non ci stanno: un modulo che chiede meno difensori
 * di quanti ne sono imposti non è un modulo praticabile, e si scarta invece di
 * togliere l'imposto in eccesso.
 */
function replan(
  current: LineupPlan,
  module: Module,
  squad: readonly PlayerForecast[],
  byId: ReadonlyMap<string, PlayerForecast>,
  lockedIds: ReadonlySet<string>,
): LineupPlan | null {
  const shape = moduleShape(module);
  const wanted: Record<"D" | "C" | "A", number> = {
    D: shape.defenders,
    C: shape.midfielders,
    A: shape.strikers,
  };
  const inLineup = new Set([current.keeperId, ...current.starterIds]);
  const kept: string[] = [];
  for (const role of OUTFIELD_ROLES) {
    const key = role as "D" | "C" | "A";
    const startersOfRole = current.starterIds
      .map((id) => byId.get(id) as PlayerForecast)
      .filter((f) => f.role === role);
    const target = wanted[key];
    if (startersOfRole.length >= target) {
      // Ne servono meno: si tolgono i più bassi per punteggio atteso, MAI un
      // imposto. Se i soli imposti già superano il posto disponibile, questo
      // modulo non è praticabile e la mossa (c) non esiste.
      const removable = startersOfRole.filter((f) => !lockedIds.has(f.id));
      const toDrop = startersOfRole.length - target;
      if (removable.length < toDrop) return null;
      const ordered = [...removable].sort(compareByExpectedAsc);
      const dropped = new Set(ordered.slice(0, toDrop).map((f) => f.id));
      for (const f of startersOfRole) if (!dropped.has(f.id)) kept.push(f.id);
    } else {
      for (const f of startersOfRole) kept.push(f.id);
      // Chi non prende voto in nessuno scenario non torna fra i titolari: stessa
      // guardia di (a)/(b) in `neighbours`, qui applicata al cambio modulo.
      const spare = squad
        .filter((f) => f.role === role && !inLineup.has(f.id) && !neverPlays(f))
        .sort(compareByExpectedDesc);
      const needed = target - startersOfRole.length;
      if (spare.length < needed) return null;
      for (const f of spare.slice(0, needed)) kept.push(f.id);
    }
  }
  // Il modulo cambia l'insieme dei titolari in più ruoli insieme: la panchina si
  // ricostruisce dall'euristica iniziale, e le mosse (d) la rimettono in ordine
  // se conviene.
  return {
    module,
    keeperId: current.keeperId,
    starterIds: kept,
    benchIds: startingBench(squad, new Set([current.keeperId, ...kept])),
  };
}

/**
 * Gli scenari. Uno scenario è una coppia: chi gioca fra i giocatori delle due
 * rose, e QUALE formazione l'avversario ha schierato. Con pochi giocatori
 * incerti e poche formazioni avversarie si enumerano tutte le coppie con la
 * loro probabilità prodotto; oltre il budget si campiona con il PRNG a seme, e
 * ogni campione pesa `1/budget`.
 *
 * I DUE FLUSSI SONO SEPARATI, e non è un dettaglio di implementazione. Il
 * sorteggio della formazione avversaria pesca dal suo sotto-seme e produce il
 * vettore delle formazioni PRIMA che i giocatori vengano estratti: così il
 * vettore delle disponibilità non dipende da quante formazioni avversarie ci
 * sono, e due giornate con lo stesso seme hanno gli stessi scenari qualunque
 * sia il numero di candidate e l'ordine con cui la ricerca le visita.
 */
function buildScenarios(
  everyone: readonly PlayerForecast[],
  uncertain: readonly PlayerForecast[],
  exact: boolean,
  budget: number,
  seed: number,
  expectedPlayers: ReadonlyMap<string, PlayerLine>,
  opponentWeights: readonly number[],
): readonly Scenario[] {
  // Base: chi è certo di giocare e chi è certo di non giocare non cambia mai.
  const base = new Map<string, PlayerLine>();
  for (const f of everyone) {
    if (f.voteProbability >= 1) base.set(f.id, expectedPlayers.get(f.id) as PlayerLine);
    else if (f.voteProbability <= 0) base.set(f.id, absentLine(f));
  }
  const playing = uncertain.map(expectedLine);
  const absent = uncertain.map(absentLine);

  const out: Scenario[] = [];
  if (exact) {
    const total = Math.pow(2, uncertain.length);
    for (let mask = 0; mask < total; mask += 1) {
      const players = new Map(base);
      let weight = 1;
      for (let i = 0; i < uncertain.length; i += 1) {
        const plays = (mask & (1 << i)) !== 0;
        players.set(uncertain[i]!.id, plays ? playing[i]! : absent[i]!);
        weight *= plays ? uncertain[i]!.voteProbability : 1 - uncertain[i]!.voteProbability;
      }
      // Prodotto cartesiano: la stessa disponibilità contro ciascuna formazione
      // avversaria, col peso congiunto. Le due estrazioni sono indipendenti per
      // costruzione — l'avversario schiera senza vedere i nostri infortuni — e
      // la mappa dei giocatori si condivide fra le copie perché nessuno la muta
      // dopo che è stata costruita.
      for (let o = 0; o < opponentWeights.length; o += 1) {
        out.push({ weight: weight * (opponentWeights[o] as number), players, opponentIndex: o });
      }
    }
    return out;
  }

  // Il vettore delle formazioni avversarie: una volta sola, prima di tutto il
  // resto, sul suo sotto-seme.
  const opponentIndices = drawOpponentLineupIndices(opponentWeights, budget, seed, mulberry32);
  const random = mulberry32(playerDrawSubSeed(seed));
  const weight = 1 / budget;
  for (let s = 0; s < budget; s += 1) {
    const players = new Map(base);
    for (let i = 0; i < uncertain.length; i += 1) {
      players.set(uncertain[i]!.id, random() < uncertain[i]!.voteProbability ? playing[i]! : absent[i]!);
    }
    out.push({ weight, players, opponentIndex: opponentIndices[s] as number });
  }
  return out;
}

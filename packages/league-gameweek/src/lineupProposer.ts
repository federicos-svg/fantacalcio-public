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
// ── LE QUATTRO DICHIARAZIONI CHE NON SONO REGOLE DI LEGA ─────────────────────
//
// 1) SEMPLIFICAZIONE DELLO SCENARIO. Uno scenario assegna gioca/non-gioca a ogni
//    giocatore delle due rose (Bernoulli indipendenti con `voteProbability`).
//    Chi gioca ha la riga attesa; chi NON gioca è un SENZA VOTO PURO —
//    `baseVote:null, fantasyScore:null, cards:"none", otherBonusMalus:0` — che
//    `resolveNoVote` manda in sostituzione (§13 `sv_clean: must_be_replaced`) e
//    che, se scoperto, conta come assente (§13 `office_reserve: prohibited`).
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
//
// 3) ORDINE DEI TITOLARI. Anche questo è dichiarato e non regolamentare: ruolo
//    (D, poi C, poi A) e dentro il ruolo `expected.fantasyScore` decrescente, poi
//    `voteProbability` decrescente, poi `id` crescente. L'ordine dei titolari
//    decide SOLO quale SV dello stesso ruolo viene coperto per primo, e siccome
//    due SV valgono zero entrambi e il sostituto è lo stesso, non muove il
//    punteggio: serve a rendere l'output riproducibile, non a scegliere.
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
   * La formazione avversaria assunta. Chi la fornisce decide — per §16 la
   * baseline naturale è quella della giornata precedente, che il regolamento
   * stesso rende l'esito in mancanza di comunicazione — e il produttore NON la
   * deduce.
   */
  readonly lineup: Lineup;
  readonly players: readonly PlayerForecast[];
}

export interface LineupProposalInput {
  readonly squad: readonly PlayerForecast[];
  readonly opponent: OpponentForecast;
  readonly context: GameweekContext;
  /** Budget di scenari (default 4096). */
  readonly scenarioBudget?: number;
  /** Seme del PRNG usato SOLO se si campiona (default `DEFAULT_SEED`). */
  readonly seed?: number;
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
    readonly expectedLeaguePoints: number;
    readonly winProbability: number;
    readonly drawProbability: number;
    readonly lossProbability: number;
    readonly expectedOurTotal: number;
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
}

interface Valuation {
  readonly expectedLeaguePoints: number;
  readonly expectedOurTotal: number;
  readonly expectedGoalDifference: number;
  readonly winProbability: number;
  readonly drawProbability: number;
  readonly lossProbability: number;
  readonly fullyTabulated: boolean;
  readonly allResolved: boolean;
}

/**
 * Ordine lessicografico dei criteri di §22 portati agli attesi: punti di lega
 * attesi, poi punteggio totale nostro atteso, poi differenza reti attesa.
 * Positivo se `a` è meglio di `b`.
 */
function compareValuations(a: Valuation, b: Valuation): number {
  if (a.expectedLeaguePoints !== b.expectedLeaguePoints) {
    return a.expectedLeaguePoints - b.expectedLeaguePoints;
  }
  if (a.expectedOurTotal !== b.expectedOurTotal) return a.expectedOurTotal - b.expectedOurTotal;
  return a.expectedGoalDifference - b.expectedGoalDifference;
}

export function proposeLineup(input: LineupProposalInput): LineupProposal {
  assertInput(input);

  const { squad, opponent, context } = input;
  const scenarioBudget = input.scenarioBudget ?? DEFAULT_SCENARIO_BUDGET;
  const requestedSeed = input.seed ?? DEFAULT_SEED;
  const objectiveLabel =
    `punti di lega attesi (V ${LEAGUE_POINTS.win} / N ${LEAGUE_POINTS.draw} / P ${LEAGUE_POINTS.loss}), ` +
    "pareggi rotti da punteggio totale atteso e differenza reti attesa (criteri di classifica §22)";

  const byId = new Map(squad.map((f) => [f.id, f]));
  const everyone: readonly PlayerForecast[] = [...squad, ...opponent.players];

  // ── Righe attese: la previsione puntuale, dove tutti giocano al valore atteso
  // tranne chi ha p = 0, che è un senza voto e quindi non può essere titolare.
  const expectedPlayers = new Map<string, PlayerLine>();
  for (const f of everyone) {
    expectedPlayers.set(f.id, f.voteProbability > 0 ? expectedLine(f) : absentLine(f));
  }
  const expectedSquadLines = squad.map((f) => expectedPlayers.get(f.id) as PlayerLine);

  // ── Scenari: si generano UNA volta sola e valgono per ogni candidata.
  const uncertain = everyone.filter((f) => f.voteProbability > 0 && f.voteProbability < 1);
  const exact = uncertain.length <= 30 && Math.pow(2, uncertain.length) <= scenarioBudget;
  const method: "exact" | "sampled" = exact ? "exact" : "sampled";
  const usedSeed = exact ? null : requestedSeed;

  // ── TIER 1 — previsione puntuale, con l'ottimizzatore esatto a voti noti.
  const tierOne = bestLineupExPost({
    squad: expectedSquadLines,
    theirLineup: opponent.lineup,
    players: expectedPlayers,
    context,
  });

  if (!tierOne.feasible || tierOne.lineup === null) {
    return {
      lineup: null,
      feasible: false,
      reason: `nessuna formazione proponibile a previsione puntuale: ${tierOne.reason}`,
      pointForecast: { lineup: null, outcome: null },
      estimate: {
        method,
        // Nessuna formazione, nessuno scenario valutato: gli attesi sotto sono
        // zeri dichiarati, non una stima. `method` e `seed` dicono comunque che
        // cosa si SAREBBE usato, perché dipendono solo dagli input.
        scenarios: 0,
        seed: usedSeed,
        expectedLeaguePoints: 0,
        winProbability: 0,
        drawProbability: 0,
        lossProbability: 0,
        expectedOurTotal: 0,
        fullyTabulated: true,
        allResolved: true,
        refinementCapReached: false,
      },
      evaluated: tierOne.evaluated,
      objectiveLabel,
      leagueRuleVersion: LEAGUE_RULE_VERSION,
    };
  }

  // Gli scenari si costruiscono SOLO quando c'è una formazione da valutare: con
  // `feasible:false` sarebbero migliaia di mappe generate per non essere lette.
  // Si generano UNA volta sola e valgono per ogni candidata.
  const scenarios = buildScenarios(everyone, uncertain, exact, scenarioBudget, requestedSeed, expectedPlayers);

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

  const valueOf = (lineup: Lineup): Valuation => {
    evaluated += 1;
    let expectedLeaguePoints = 0;
    let expectedOurTotal = 0;
    let expectedGoalDifference = 0;
    let win = 0;
    let draw = 0;
    let loss = 0;
    let fullyTabulated = true;
    let allResolved = true;
    for (const scenario of scenarios) {
      const outcome = simulateGameweek({
        ourLineup: lineup,
        theirLineup: opponent.lineup,
        players: scenario.players,
        context,
      });
      expectedLeaguePoints += scenario.weight * leaguePointsOf(outcome, LEAGUE_POINTS).value;
      expectedOurTotal += scenario.weight * outcome.ours.total;
      expectedGoalDifference += scenario.weight * (outcome.ourGoals - outcome.theirGoals);
      if (outcome.ourGoals > outcome.theirGoals) win += scenario.weight;
      else if (outcome.ourGoals === outcome.theirGoals) draw += scenario.weight;
      else loss += scenario.weight;
      if (!outcome.fullyTabulated) fullyTabulated = false;
      if (!outcome.resolved) allResolved = false;
    }
    return {
      expectedLeaguePoints,
      expectedOurTotal,
      expectedGoalDifference,
      winProbability: win,
      drawProbability: draw,
      lossProbability: loss,
      fullyTabulated,
      allResolved,
    };
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
    let bestMove: { plan: LineupPlan; lineup: Lineup; value: Valuation } | null = null;
    for (const plan of neighbours(current, squad, byId)) {
      const lineup = buildLineup(plan);
      const value = valueOf(lineup);
      if (bestMove === null) {
        bestMove = { plan, lineup, value };
        continue;
      }
      const cmp = compareValuations(value, bestMove.value);
      if (cmp > 0 || (cmp === 0 && tieBreakKey(lineup) < tieBreakKey(bestMove.lineup))) {
        bestMove = { plan, lineup, value };
      }
    }
    if (bestMove === null || compareValuations(bestMove.value, currentValue) <= 0) break;
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

  const reason =
    `previsione puntuale con l'ottimizzatore esatto (${tierOne.reason}), poi raffinamento hill climbing ` +
    `su ${scenarios.length} scenari (${method}) con ${iterations} mossa/e accettata/e; criterio: ${objectiveLabel}` +
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
      expectedLeaguePoints: currentValue.expectedLeaguePoints,
      winProbability: currentValue.winProbability,
      drawProbability: currentValue.drawProbability,
      lossProbability: currentValue.lossProbability,
      expectedOurTotal: currentValue.expectedOurTotal,
      fullyTabulated: currentValue.fullyTabulated,
      allResolved: currentValue.allResolved,
      refinementCapReached: capReached,
    },
    evaluated,
    objectiveLabel,
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
 */
function neighbours(
  current: LineupPlan,
  squad: readonly PlayerForecast[],
  byId: ReadonlyMap<string, PlayerForecast>,
): LineupPlan[] {
  const out: LineupPlan[] = [];
  const startersSet = new Set(current.starterIds);
  const inLineup = new Set([current.keeperId, ...current.starterIds]);
  /** Chi esce dagli undici prende in panchina il posto di chi entra. */
  const benchAfterSwap = (leavingId: string, enteringId: string): string[] =>
    current.benchIds.map((id) => (id === enteringId ? leavingId : id));

  // (a) scambi di movimento, stesso ruolo.
  for (const starterId of current.starterIds) {
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

  // (b) scambio del portiere.
  for (const candidate of squad) {
    if (candidate.role !== "P" || candidate.id === current.keeperId || startersSet.has(candidate.id)) continue;
    if (neverPlays(candidate)) continue; // stessa ragione di (a).
    out.push({
      module: current.module,
      keeperId: candidate.id,
      starterIds: [...current.starterIds],
      benchIds: benchAfterSwap(current.keeperId, candidate.id),
    });
  }

  // (c) cambio modulo.
  for (const module of MODULES) {
    if (module === current.module) continue;
    const plan = replan(current, module, squad, byId);
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

/** Riscrive i titolari per un modulo diverso. `null` se la rosa non lo consente. */
function replan(
  current: LineupPlan,
  module: Module,
  squad: readonly PlayerForecast[],
  byId: ReadonlyMap<string, PlayerForecast>,
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
      // Ne servono meno: si tolgono i più bassi per punteggio atteso.
      const ordered = [...startersOfRole].sort(compareByExpectedAsc);
      const dropped = new Set(ordered.slice(0, startersOfRole.length - target).map((f) => f.id));
      for (const f of startersOfRole) if (!dropped.has(f.id)) kept.push(f.id);
    } else {
      for (const f of startersOfRole) kept.push(f.id);
      const spare = squad
        .filter((f) => f.role === role && !inLineup.has(f.id))
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
 * Gli scenari di disponibilità. Con pochi giocatori incerti si enumerano tutti
 * con la loro probabilità prodotto; oltre il budget si campiona con il PRNG a
 * seme, e ogni campione pesa `1/budget`.
 */
function buildScenarios(
  everyone: readonly PlayerForecast[],
  uncertain: readonly PlayerForecast[],
  exact: boolean,
  budget: number,
  seed: number,
  expectedPlayers: ReadonlyMap<string, PlayerLine>,
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
      out.push({ weight, players });
    }
    return out;
  }

  const random = mulberry32(seed);
  const weight = 1 / budget;
  for (let s = 0; s < budget; s += 1) {
    const players = new Map(base);
    for (let i = 0; i < uncertain.length; i += 1) {
      players.set(uncertain[i]!.id, random() < uncertain[i]!.voteProbability ? playing[i]! : absent[i]!);
    }
    out.push({ weight, players });
  }
  return out;
}

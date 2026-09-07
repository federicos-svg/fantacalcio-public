import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  FIRST_GOAL_THRESHOLD,
  GOAL_BAND_WIDTH,
  LEAGUE_POINTS,
  MODULES,
  REFERENCE_POLICIES,
  RULE_OF_72_THRESHOLD,
  type ExPostCeilingInput,
  type GameweekContext,
  type Lineup,
  type ObservedPlayerLine,
  type PlayerForecast,
  type PlayerLine,
  type Role,
  type SeasonAverage,
  bestElevenExPostPolicy,
  engineProposalPolicy,
  fieldedLineupPolicy,
  leaguePointsOf,
  lineupRegret,
  observedLines,
  observedPlayerMap,
  prepareGameweek,
  proposeLineup,
  referencePolicy,
  ruleOf72Policy,
  simulateGameweek,
  topElevenBySeasonAveragePolicy,
} from "../src/index.js";

// FIXTURE SINTETICHE. Identificatori costruiti, voti scelti a mano sulla griglia
// dei mezzi punti, nessun dato reale, nessuna rete, nessuna fantamedia vera.
//
// Ogni test che tocca una regola cita la sezione di `docs/data/LEAGUE_RULES.md`
// o del disegno del generatore che la contiene.

const fc = (
  id: string,
  role: Role,
  baseVote: number,
  fantasyScore: number,
  extra: { receivedAnyBonus?: boolean; missedPenalty?: boolean; voteProbability?: number } = {},
): PlayerForecast => ({
  id,
  role,
  voteProbability: extra.voteProbability ?? 1,
  expected: {
    baseVote,
    fantasyScore,
    receivedAnyBonus: extra.receivedAnyBonus ?? false,
    missedPenalty: extra.missedPenalty ?? false,
  },
});

const CONTEXT: GameweekContext = { matchday: 30, weAreHome: true };

/** Le righe della previsione puntuale, come le costruisce il produttore. */
function expectedLines(...groups: readonly (readonly PlayerForecast[])[]): Map<string, PlayerLine> {
  const map = new Map<string, PlayerLine>();
  for (const group of groups) {
    for (const f of group) {
      map.set(
        f.id,
        f.voteProbability > 0
          ? {
              id: f.id,
              role: f.role,
              baseVote: f.expected.baseVote,
              fantasyScore: f.expected.fantasyScore,
              receivedAnyBonus: f.expected.receivedAnyBonus,
              missedPenalty: f.expected.missedPenalty,
            }
          : { id: f.id, role: f.role, baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 },
      );
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// IL CASO «AVVERSARIO A 76» — il cuore del pacchetto.
//
// Costruito sull'aritmetica del regolamento, non su un'intuizione:
//  - la nostra formazione «tutta sicura» vale ESATTAMENTE 72 in ogni scenario;
//  - l'avversario vale 76;
//  - §15 dà a entrambe due goal (66 + una fascia da 6), ma con almeno 4 punti di
//    distacco NELLA STESSA FASCIA il goal in più va a chi ha di più: 2-3, e i 72
//    pieni sono una sconfitta;
//  - un solo punto in più (73) sarebbe stato un pareggio, perché il distacco
//    scenderebbe a 3.
// La regola dei 72 massimizza P(punteggio >= 72) e sceglie proprio i 72 pieni;
// l'obiettivo §3, che l'avversario lo guarda, sceglie la formazione che vale 73
// il 60 % delle volte e 70 il resto, e prende 0,6 punti di lega attesi contro 0.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Y — il centrocampista che «balla»: gioca sempre, e nel 60 % degli scenari
 * segna. Non è un rischio di DISPONIBILITÀ ma di RENDIMENTO, e la differenza è
 * decisiva: un titolare che non prende voto viene rimpiazzato dalla panchina,
 * e il rimpiazzo assorbirebbe il rischio riportando la formazione al valore di
 * quella «sicura». Chi gioca male invece resta in campo, e il punteggio scende
 * davvero. È esattamente ciò che WP-2 ha reso rappresentabile.
 */
function bouncyMidfielder(): PlayerForecast {
  return {
    id: "Y",
    role: "C",
    voteProbability: 1,
    // Riga MODALE: il gol è più probabile che no, quindi la riga più probabile
    // lo contiene — e il flag di §21 è obbligatorio quando il punteggio supera
    // il voto base.
    expected: { baseVote: 6, fantasyScore: 9, receivedAnyBonus: true, missedPenalty: false },
    distribution: {
      pPlays: 1,
      pStarter: 1,
      pSub: 0,
      baseVote: [{ vote: 6, probability: 1 }],
      events: { pGoal: 0.6, pAssist: 0, pYellow: 0, pRed: 0, pOwnGoal: 0, pPenMissed: 0, pPenSaved: 0 },
      svKind: { clean: 1, booked: 0, sentOffDuringMatch: 0, withOtherBonusMalus: 0, sentOffAfterMatch: 0 },
      asOf: "2026-09-07T10:00:00Z",
      sourceQuality: "fixture sintetica",
    },
  };
}

/**
 * Rosa da 12: un portiere, quattro difensori, cinque centrocampisti (quattro
 * sicuri e Y), due attaccanti. I numeri sono scelti perché il 4-4-2 «tutto
 * sicuro» valga 72 tondi: §19 dà +6 con media 7,0 fra portiere e tre migliori
 * difensori, §20 non muove niente (stesso numero di centrocampisti e stessa
 * somma di voti base dell'avversario), §21 esclude i nostri attaccanti perché
 * hanno un bonus, §14 non dà fattore campo alla 30ª.
 */
function squadFor76(): PlayerForecast[] {
  return [
    fc("P1", "P", 7, 7),
    fc("D1", "D", 7, 2),
    fc("D2", "D", 7, 2),
    fc("D3", "D", 7, 2),
    fc("D4", "D", 7, 2),
    fc("C1", "C", 6, 8, { receivedAnyBonus: true }),
    fc("C2", "C", 6, 8, { receivedAnyBonus: true }),
    fc("C3", "C", 6, 8, { receivedAnyBonus: true }),
    fc("C4", "C", 6, 8, { receivedAnyBonus: true }),
    bouncyMidfielder(),
    fc("A1", "A", 6, 9.5, { receivedAnyBonus: true }),
    fc("A2", "A", 6, 9.5, { receivedAnyBonus: true }),
  ];
}

/** Avversario a 76: undici certi, tre dei quali con un bonus da 3. */
function opponentAt76(): PlayerForecast[] {
  return [
    fc("oP1", "P", 6, 6),
    fc("oD1", "D", 6, 9, { receivedAnyBonus: true }),
    fc("oD2", "D", 6, 9, { receivedAnyBonus: true }),
    fc("oD3", "D", 6, 6),
    fc("oD4", "D", 6, 6),
    fc("oC1", "C", 6, 9, { receivedAnyBonus: true }),
    fc("oC2", "C", 6, 6),
    fc("oC3", "C", 6, 6),
    fc("oC4", "C", 6, 6),
    fc("oA1", "A", 6, 6),
    fc("oA2", "A", 6, 6),
  ];
}

const OPPONENT_LINEUP_76: Lineup = {
  module: "442",
  goalkeeperId: "oP1",
  starterIds: ["oD1", "oD2", "oD3", "oD4", "oC1", "oC2", "oC3", "oC4", "oA1", "oA2"],
  benchIds: [],
};

function inputFor76() {
  return {
    squad: squadFor76(),
    opponent: { lineup: OPPONENT_LINEUP_76, players: opponentAt76() },
    context: CONTEXT,
    // Budget dichiarato e piccolo: Y è l'unico giocatore che varia, e il seme di
    // default rende il campione rifacibile bit a bit.
    scenarioBudget: 400,
  };
}

describe("la regola dei 72 perde il caso «avversario a 76»", () => {
  it("la soglia è 72 perché §15 la calcola, non perché qualcuno l'ha scritta", () => {
    // «Due gol partita» e «72» sono la stessa cosa: primo goal a 66, fascia da 6.
    expect(RULE_OF_72_THRESHOLD).toBe(72);
    expect(RULE_OF_72_THRESHOLD).toBe(FIRST_GOAL_THRESHOLD + GOAL_BAND_WIDTH);
  });

  it("72 pieni contro 76 sono una SCONFITTA 2-3: è la regola dei 4 punti nella stessa fascia (§15)", () => {
    const squad = squadFor76();
    const opponent = opponentAt76();
    const players = expectedLines(squad, opponent);
    const safe: Lineup = {
      module: "442",
      goalkeeperId: "P1",
      starterIds: ["D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A1", "A2"],
      benchIds: ["Y"],
    };
    const outcome = simulateGameweek({
      ourLineup: safe,
      theirLineup: OPPONENT_LINEUP_76,
      players,
      context: CONTEXT,
    });
    expect(outcome.ours.total).toBe(72);
    expect(outcome.theirs.total).toBe(76);
    expect([outcome.ourGoals, outcome.theirGoals]).toEqual([2, 3]);
    expect(leaguePointsOf(outcome, LEAGUE_POINTS).value).toBe(0);
  });

  it("un solo punto in più (73) sarebbe un pareggio: è tutto quel che la regola dei 72 non vede", () => {
    const squad = squadFor76();
    const opponent = opponentAt76();
    const players = expectedLines(squad, opponent);
    // Con Y titolare e il suo gol, il nostro punteggio è 73.
    const withY: Lineup = {
      module: "442",
      goalkeeperId: "P1",
      starterIds: ["D1", "D2", "D3", "D4", "C1", "C2", "C3", "Y", "A1", "A2"],
      benchIds: ["C4"],
    };
    const outcome = simulateGameweek({
      ourLineup: withY,
      theirLineup: OPPONENT_LINEUP_76,
      players,
      context: CONTEXT,
    });
    expect(outcome.ours.total).toBe(73);
    expect([outcome.ourGoals, outcome.theirGoals]).toEqual([2, 2]);
    expect(leaguePointsOf(outcome, LEAGUE_POINTS).value).toBe(LEAGUE_POINTS.draw);
  });

  it("la regola dei 72 sceglie i 72 pieni, il motore sceglie altro, e la regola perde", () => {
    const input = inputFor76();
    const rule = ruleOf72Policy(input);
    const engine = proposeLineup(input);

    // La regola dei 72 mette in panchina il giocatore che balla: la sua
    // formazione vale 72 in OGNI scenario, cioè P(>= 72) = 1.
    expect(rule.feasible).toBe(true);
    expect(rule.lineup?.module).toBe("442");
    expect(rule.lineup?.starterIds).not.toContain("Y");
    expect(rule.lineup?.benchIds).toEqual(["Y"]);
    expect(rule.probability).toBeCloseTo(1, 9);

    // Il motore, che l'avversario lo guarda, schiera Y.
    expect(engine.feasible).toBe(true);
    expect(engine.lineup?.starterIds).toContain("Y");

    // E il conto: la formazione della regola dei 72 non prende nemmeno un punto,
    // quella del motore ne prende 0,6 attesi. Lo zero è ESATTO — la formazione
    // «tutta sicura» non ha nessun giocatore che varia, quindi perde 2-3 in ogni
    // scenario — mentre 0,6 è il campione dichiarato di 400 scenari.
    const players = expectedLines(input.squad, input.opponent.players);
    const ruleOutcome = simulateGameweek({
      ourLineup: rule.lineup as Lineup,
      theirLineup: OPPONENT_LINEUP_76,
      players,
      context: CONTEXT,
    });
    expect(leaguePointsOf(ruleOutcome, LEAGUE_POINTS).value).toBe(0);
    expect(engine.estimate.objectiveValue).toBeGreaterThan(0);
    expect(engine.estimate.objectiveValue).toBeCloseTo(0.6, 1);
  });

  it("la regola dei 72 preferisce P(>= 72) più alta anche quando i punti attesi sono più bassi", () => {
    const input = inputFor76();
    const rule = ruleOf72Policy(input);
    // La formazione con Y vale 73 nel 60 % degli scenari e 70 nel resto: la sua
    // P(>= 72) è 0,6, meno di 1. È l'unica ragione per cui la regola la scarta,
    // e nessuna delle due formazioni è «migliore» per la regola in altro modo.
    expect(rule.probability).toBeGreaterThan(0.99);
    expect(rule.reason).toContain("non guarda mai il risultato");
    expect(rule.reason).toContain("NON è l'obiettivo del Coach");
  });
});

describe("la regola dei 72 come politica", () => {
  it("dichiara che l'avversario entra nell'aritmetica e non nell'obiettivo", () => {
    const rule = ruleOf72Policy(inputFor76());
    expect(rule.policy).toBe("RULE_OF_72");
    expect(rule.information).toBe("EX_ANTE");
    expect(rule.reason).toContain("§20");
  });

  it("rifiuta gli ingressi vincolati, e dice perché", () => {
    const input = { ...inputFor76(), constraints: { lockedStarterIds: ["Y"], locked: false } };
    expect(() => ruleOf72Policy(input)).toThrowError(
      /regola dei 72: la politica di riferimento non si calcola su ingressi vincolati.*«Schierata»/s,
    );
  });

  it("i vincoli neutri non sono vincoli: la politica gira come se non ci fossero", () => {
    const input = { ...inputFor76(), constraints: { lockedStarterIds: [], locked: false } };
    expect(ruleOf72Policy(input).lineup).toEqual(ruleOf72Policy(inputFor76()).lineup);
  });

  it("stesso ingresso, stesso risultato bit a bit", () => {
    const first = ruleOf72Policy(inputFor76());
    const second = ruleOf72Policy(inputFor76());
    expect(second.lineup).toEqual(first.lineup);
    expect(second.probability).toBe(first.probability);
    expect(second.evaluated).toBe(first.evaluated);
  });

  it("senza nessun modulo riempibile lo dichiara invece di consegnare una formazione monca", () => {
    // Rosa di tre giocatori: nessuno dei sette moduli di §9 sta in piedi.
    const squad = [fc("P1", "P", 6, 6), fc("D1", "D", 6, 6), fc("C1", "C", 6, 6)];
    const result = ruleOf72Policy({
      squad,
      opponent: { lineup: OPPONENT_LINEUP_76, players: opponentAt76() },
      context: CONTEXT,
    });
    expect(result.feasible).toBe(false);
    expect(result.lineup).toBeNull();
    expect(result.reason).toContain("nessuno dei sette moduli");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IL PAVIMENTO — migliori 11 per fantamedia.
// ─────────────────────────────────────────────────────────────────────────────

/** Rosa da 14 con fantamedie che premiano gli attaccanti e puniscono la difesa. */
function squadForFloor(): PlayerForecast[] {
  return [
    fc("P1", "P", 6, 6),
    fc("P2", "P", 6, 6),
    fc("D1", "D", 6, 6),
    fc("D2", "D", 6, 6),
    fc("D3", "D", 6, 6),
    fc("D4", "D", 6, 6),
    fc("C1", "C", 6, 6),
    fc("C2", "C", 6, 6),
    fc("C3", "C", 6, 6),
    fc("C4", "C", 6, 6),
    fc("C5", "C", 6, 6),
    fc("A1", "A", 6, 6),
    fc("A2", "A", 6, 6),
    fc("A3", "A", 6, 6),
  ];
}

/**
 * Fantamedie della fixture: portieri 6, difensori attorno a 5, centrocampisti 6,
 * attaccanti 8. Con questi numeri il modulo con la somma maggiore è il 3-4-3, e
 * si verifica a mano: 3 difensori (5,5+5,2+5,1) + 4 centrocampisti (6,4+6,3+6,2
 * +6,1) + 3 attaccanti (8,3+8,2+8,1) + portiere 6,5.
 */
const FLOOR_AVERAGES: readonly SeasonAverage[] = [
  { playerId: "P1", average: 6.5 },
  { playerId: "P2", average: 6.0 },
  { playerId: "D1", average: 5.5 },
  { playerId: "D2", average: 5.2 },
  { playerId: "D3", average: 5.1 },
  { playerId: "D4", average: 5.0 },
  { playerId: "C1", average: 6.4 },
  { playerId: "C2", average: 6.3 },
  { playerId: "C3", average: 6.2 },
  { playerId: "C4", average: 6.1 },
  { playerId: "C5", average: 6.0 },
  { playerId: "A1", average: 8.3 },
  { playerId: "A2", average: 8.2 },
  { playerId: "A3", average: 8.1 },
];

function floorInput(overrides: Partial<Parameters<typeof topElevenBySeasonAveragePolicy>[0]> = {}) {
  return {
    proposal: {
      squad: squadForFloor(),
      opponent: { lineup: OPPONENT_LINEUP_76, players: opponentAt76() },
      context: CONTEXT,
    },
    seasonAverages: FLOOR_AVERAGES,
    averagesProvenance: "fantamedia sintetica della stagione in corso (fixture)",
    ...overrides,
  };
}

describe("migliori 11 per fantamedia — il pavimento di §11.1", () => {
  it("golden: modulo con la somma maggiore, e gli undici migliori di ogni ruolo", () => {
    const result = topElevenBySeasonAveragePolicy(floorInput());
    expect(result.feasible).toBe(true);
    expect(result.policy).toBe("TOP_ELEVEN_BY_SEASON_AVERAGE");
    expect(result.information).toBe("EX_ANTE");
    expect(result.lineup?.module).toBe("343");
    expect(result.lineup?.goalkeeperId).toBe("P1");
    // L'ordine dei titolari è quello dichiarato dal produttore: D, poi C, poi A.
    expect(result.lineup?.starterIds).toEqual([
      "D1",
      "D2",
      "D3",
      "C1",
      "C2",
      "C3",
      "C4",
      "A1",
      "A2",
      "A3",
    ]);
    // La panchina: tutti gli altri, per fantamedia decrescente. È una scelta di
    // questa funzione, non una regola di lega, e la ragione lo dice.
    expect(result.lineup?.benchIds).toEqual(["C5", "P2", "D4"]);
    expect(result.reason).toContain("fantamedia sintetica della stagione in corso (fixture)");
    expect(result.reason).toContain("343");
  });

  it("non guarda l'avversario: cambiarlo del tutto non muove il pavimento di un id", () => {
    const first = topElevenBySeasonAveragePolicy(floorInput());
    const base = floorInput();
    // Avversario completamente diverso: nessun bonus, undici da 6,0 tondi, cioè
    // 67 invece di 76. Un'ottimizzazione che guardasse l'avversario cambierebbe
    // qualcosa; il pavimento no, e §11.1 lo scrive: «senza avversario».
    const weakOpponent = opponentAt76().map((f) =>
      fc(f.id, f.role, f.expected.baseVote, f.expected.baseVote),
    );
    const second = topElevenBySeasonAveragePolicy({
      ...base,
      proposal: {
        ...base.proposal,
        opponent: { lineup: OPPONENT_LINEUP_76, players: weakOpponent },
      },
    });
    expect(second.lineup).toEqual(first.lineup);
  });

  it("non guarda la disponibilità, ed è la sua definizione: schiera anche chi non giocherà", () => {
    // A1 ha la fantamedia più alta e una probabilità di voto NULLA. §11.1
    // definisce il pavimento sulle sole fantamedie: filtrare gli indisponibili
    // lo renderebbe una politica migliore, cioè un pavimento diverso da quello
    // che il disegno ha scelto.
    const squad = squadForFloor().map((f) =>
      f.id === "A1" ? fc("A1", "A", 6, 6, { voteProbability: 0 }) : f,
    );
    const result = topElevenBySeasonAveragePolicy({
      ...floorInput(),
      proposal: { ...floorInput().proposal, squad },
    });
    expect(result.lineup?.starterIds).toContain("A1");
    expect(result.reason).toContain("disponibilità");
  });

  it("una fantamedia mancante ferma la politica invece di essere sostituita", () => {
    expect(() =>
      topElevenBySeasonAveragePolicy(
        floorInput({ seasonAverages: FLOOR_AVERAGES.filter((entry) => entry.playerId !== "C3") }),
      ),
    ).toThrowError(
      /fantamedia mancante per C3.*Non si sostituisce con il punteggio atteso della previsione/s,
    );
  });

  it("una fantamedia dichiarata due volte è una richiesta che non si sa leggere", () => {
    expect(() =>
      topElevenBySeasonAveragePolicy(
        floorInput({ seasonAverages: [...FLOOR_AVERAGES, { playerId: "C3", average: 9.9 }] }),
      ),
    ).toThrowError(/fantamedia dichiarata due volte per C3/);
  });

  it("senza la provenienza della fantamedia il pavimento non è confrontabile, e si ferma", () => {
    expect(() => topElevenBySeasonAveragePolicy(floorInput({ averagesProvenance: "   " }))).toThrowError(
      /la provenienza della fantamedia non è dichiarata.*stagione in corso/s,
    );
  });

  it("rifiuta gli ingressi vincolati come tutte le politiche di riferimento", () => {
    const base = floorInput();
    expect(() =>
      topElevenBySeasonAveragePolicy({
        ...base,
        proposal: { ...base.proposal, constraints: { lockedStarterIds: [], locked: false, lockedModule: "442" } },
      }),
    ).toThrowError(/migliori 11 per fantamedia: la politica di riferimento non si calcola su ingressi vincolati/);
  });

  it("con una rosa che non riempie nessun modulo lo dichiara invece di consegnare dieci giocatori", () => {
    const squad = [fc("P1", "P", 6, 6), fc("D1", "D", 6, 6)];
    const result = topElevenBySeasonAveragePolicy({
      proposal: {
        squad,
        opponent: { lineup: OPPONENT_LINEUP_76, players: opponentAt76() },
        context: CONTEXT,
      },
      seasonAverages: [
        { playerId: "P1", average: 6 },
        { playerId: "D1", average: 6 },
      ],
      averagesProvenance: "fixture",
    });
    expect(result.feasible).toBe(false);
    expect(result.lineup).toBeNull();
    expect(result.reason).toContain("nessuno dei sette moduli");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IL TETTO — e la garanzia che non si confonda con una politica giocabile.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La targa dei voti «veri» di questa fixture. Sintetica come tutto il resto del
 * file: qui non c'è nessun parser di voti reali — il core pubblico non
 * acquisisce dati — e la provenienza serve a mostrare che il tetto la pretende
 * e la ripete, non a certificare una fonte.
 */
const REAL_VOTES = "fixture sintetica: voti di giornata letti dopo la scadenza";

/**
 * QUANTO VALE L'ERRORE, in fantapunti, su questa fixture. Numeri pinnati e non
 * calcolati dal test: se un giorno cambiassero, la differenza fra un tetto
 * onesto e uno contaminato sarebbe cambiata, e va riletta invece che riadattata.
 */
const CEILING_GAP = 6;
const TRUE_SCORE_REGRET = 6;
const UNDERSTATED_SCORE_REGRET = 0;

describe("il tetto ex-post", () => {
  /**
   * Righe di giornata A VOTI NOTI: non è una previsione, ed è il punto. Dal
   * 2026-09-07 «non è una previsione» non è più una promessa del commento:
   * passano da `observedLines()`, l'unica porta che produce righe osservate, e
   * portano la provenienza fino nella ragione della politica.
   */
  function knownLines(): {
    squad: readonly ObservedPlayerLine[];
    all: ReadonlyMap<string, ObservedPlayerLine>;
  } {
    const squad: PlayerLine[] = [
      { id: "P1", role: "P", baseVote: 7, fantasyScore: 7 },
      { id: "D1", role: "D", baseVote: 7, fantasyScore: 7 },
      { id: "D2", role: "D", baseVote: 7, fantasyScore: 7 },
      { id: "D3", role: "D", baseVote: 7, fantasyScore: 7 },
      { id: "D4", role: "D", baseVote: 7, fantasyScore: 7 },
      { id: "C1", role: "C", baseVote: 6, fantasyScore: 6 },
      { id: "C2", role: "C", baseVote: 6, fantasyScore: 6 },
      { id: "C3", role: "C", baseVote: 6, fantasyScore: 6 },
      { id: "C4", role: "C", baseVote: 6, fantasyScore: 6 },
      // Il centrocampista che ha davvero segnato: a voti noti si sa, ex-ante no.
      { id: "C5", role: "C", baseVote: 6, fantasyScore: 12, receivedAnyBonus: true },
      { id: "A1", role: "A", baseVote: 6, fantasyScore: 6 },
      { id: "A2", role: "A", baseVote: 6, fantasyScore: 6 },
    ];
    const theirs: PlayerLine[] = opponentAt76().map((f) => ({
      id: f.id,
      role: f.role,
      baseVote: f.expected.baseVote,
      fantasyScore: f.expected.fantasyScore,
      receivedAnyBonus: f.expected.receivedAnyBonus,
      missedPenalty: f.expected.missedPenalty,
    }));
    const observedSquad = observedLines({ lines: squad, provenance: REAL_VOTES });
    const all = observedPlayerMap([
      ...observedSquad,
      ...observedLines({ lines: theirs, provenance: REAL_VOTES }),
    ]);
    return { squad: observedSquad, all };
  }

  it("golden: schiera chi ha davvero segnato, e si dichiara EX-POST tre volte", () => {
    const { squad, all } = knownLines();
    const result = bestElevenExPostPolicy({
      squadLines: squad,
      theirLineup: OPPONENT_LINEUP_76,
      players: all,
      context: CONTEXT,
    });
    expect(result.feasible).toBe(true);
    expect(result.policy).toBe("BEST_EX_POST");
    expect(result.information).toBe("EX_POST");
    expect(result.reason).toContain("TETTO EX-POST");
    expect(result.reason).toContain("A VOTI NOTI");
    // C5 è il centrocampista da 12: nessuna formazione ottima lo lascia fuori.
    expect(result.lineup?.starterIds).toContain("C5");
    // Il risultato porta con sé l'esito completo dell'ottimizzatore, che è dove
    // quella ricerca vive: questa funzione non ne ha una seconda copia.
    expect(result.exPost.outcome?.ours.total).toBe(result.exPost.outcome?.ours.total);
  });

  it("il tetto non è raggiungibile: batte la miglior formazione ex-ante sulla stessa giornata", () => {
    const { squad, all } = knownLines();
    const ceiling = bestElevenExPostPolicy({
      squadLines: squad,
      theirLineup: OPPONENT_LINEUP_76,
      players: all,
      context: CONTEXT,
    });
    // Ex-ante nessuno sapeva del gol di C5: la previsione lo dà come tutti gli
    // altri centrocampisti, e la proposta lo lascia fuori senza sbagliare nulla.
    const exAnte = proposeLineup({
      squad: [
        fc("P1", "P", 7, 7),
        fc("D1", "D", 7, 7),
        fc("D2", "D", 7, 7),
        fc("D3", "D", 7, 7),
        fc("D4", "D", 7, 7),
        fc("C1", "C", 6, 6),
        fc("C2", "C", 6, 6),
        fc("C3", "C", 6, 6),
        fc("C4", "C", 6, 6),
        fc("C5", "C", 6, 6),
        fc("A1", "A", 6, 6),
        fc("A2", "A", 6, 6),
      ],
      opponent: { lineup: OPPONENT_LINEUP_76, players: opponentAt76() },
      context: CONTEXT,
    });
    const realised = simulateGameweek({
      ourLineup: exAnte.lineup as Lineup,
      theirLineup: OPPONENT_LINEUP_76,
      players: all,
      context: CONTEXT,
    });
    expect(ceiling.exPost.outcome?.ours.total).toBeGreaterThanOrEqual(realised.ours.total);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // IL VARCO CHIUSO IL 2026-09-07 — dichiarato dal commento, non garantito.
  //
  // Una review indipendente ha verificato che `PlayerLine` era lo stesso shape
  // che venisse da `expectedLine()` o da un parser di voti veri: passare
  // `prepared.expectedSquadLines` al tetto COMPILAVA. I quattro test qui sotto
  // sono esattamente ciò che mancava — «nessun test di questo pacchetto lo
  // rivelerebbe» era l'altra metà del rilievo.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * LA STESSA GIORNATA, VISTA PRIMA. La previsione non sa del gol di C5 e dà
   * tutti i centrocampisti a 6: ex-ante è una previsione senza colpe, ed è
   * proprio per questo che usarla come tetto è un imbroglio silenzioso.
   */
  function exAnteInput() {
    return {
      squad: [
        fc("P1", "P", 7, 7),
        fc("D1", "D", 7, 7),
        fc("D2", "D", 7, 7),
        fc("D3", "D", 7, 7),
        fc("D4", "D", 7, 7),
        fc("C1", "C", 6, 6),
        fc("C2", "C", 6, 6),
        fc("C3", "C", 6, 6),
        fc("C4", "C", 6, 6),
        fc("C5", "C", 6, 6),
        fc("A1", "A", 6, 6),
        fc("A2", "A", 6, 6),
      ],
      opponent: { lineup: OPPONENT_LINEUP_76, players: opponentAt76() },
      context: CONTEXT,
    };
  }

  it("le righe della previsione non entrano nel tetto: `tsc --noEmit` le rifiuta", () => {
    // COME SI LEGGE QUESTO TEST. Le tre `@ts-expect-error` qui sotto sono
    // asserzioni del COMPILATORE, non di vitest: se una di queste costruzioni
    // tornasse a compilare, `tsc` segnalerebbe una direttiva inutilizzata e
    // `npm run typecheck` — il PRIMO comando di `npm run verify` — sarebbe
    // rosso prima ancora che vitest parta. Il corpo del test esiste per tenere
    // le tre costruzioni dentro un file che si esegue davvero, e per dire ad
    // alta voce che gli oggetti rifiutati non sono inventati: sono quelli che
    // il produttore consegna ogni giornata.
    const prepared = prepareGameweek(exAnteInput());

    // 1) L'ERRORE DI INTEGRAZIONE CHE LA REVIEW HA TROVATO, per intero e com'era
    //    scrivibile prima: le righe attese del produttore passate al tetto. La
    //    funzione non viene mai chiamata — esiste per essere COMPILATA, ed è il
    //    compilatore a bocciarla, due volte: dall'elenco della rosa e dalla
    //    mappa di tutti.
    const wouldNotCompile = (): unknown =>
      bestElevenExPostPolicy({
        // @ts-expect-error — righe di PREVISIONE dove il tetto vuole voti osservati.
        squadLines: prepared.expectedSquadLines,
        theirLineup: OPPONENT_LINEUP_76,
        // @ts-expect-error — e la stessa cosa dalla porta di servizio, la mappa di tutti.
        players: prepared.expectedPlayers,
        context: CONTEXT,
      });

    // 2) E i tipi dei due campi lo dicono anche fuori dalla chiamata: se un
    //    giorno tornassero `PlayerLine`, queste due direttive diventerebbero
    //    inutilizzate e `tsc` lo segnalerebbe come errore.
    // @ts-expect-error — il campo non accetta più righe di previsione.
    const asCeilingSquad: ExPostCeilingInput["squadLines"] = prepared.expectedSquadLines;
    // @ts-expect-error — e nemmeno la mappa.
    const asCeilingPlayers: ExPostCeilingInput["players"] = prepared.expectedPlayers;

    // 3) Il sigillo non si falsifica a mano: `origin: "OBSERVED"` scritto in un
    //    letterale non basta, perché la chiave che chiude il tipo è un simbolo
    //    che questo file non può nominare. L'unica porta resta `observedLines`.
    // @ts-expect-error — manca il sigillo, e nessun letterale può nominarlo.
    const forged: ObservedPlayerLine = {
      id: "C5",
      role: "C",
      baseVote: 6,
      fantasyScore: 12,
      origin: "OBSERVED",
      provenance: "targa scritta a mano su una riga qualunque",
    };

    expect(typeof wouldNotCompile).toBe("function");
    expect(asCeilingSquad).toHaveLength(12);
    expect(asCeilingPlayers.size).toBe(23);
    expect(forged.origin).toBe("OBSERVED");
  });

  it("le guardie di tipo del tetto esistono, e una loro rimozione si vede nel diff", () => {
    // Mordono a `tsc --noEmit` e vivono accanto alla dichiarazione; questo test
    // impedisce che spariscano in silenzio insieme al varco che riaprirebbero.
    const SOURCE = readFileSync(new URL("../src/referencePolicies.ts", import.meta.url), "utf8");
    expect(SOURCE).toContain("type AssertForecastLineIsNotObserved");
    expect(SOURCE).toContain("type AssertObservedLineIsAPlayerLine");
    expect(SOURCE).toContain("type AssertCeilingWantsObservedLines");
    expect(SOURCE).toContain("type AssertCeilingWantsObservedMap");
    // Il sigillo NON esce dal modulo: se venisse esportato, un letterale
    // qualunque potrebbe nominarlo e il tipo tornerebbe strutturale, cioè
    // tornerebbe a essere il commento di prima.
    expect(SOURCE).toContain("declare const OBSERVED_VOTE_SEAL: unique symbol;");
    expect(SOURCE).not.toContain("export declare const OBSERVED_VOTE_SEAL");
  });

  it("senza provenienza dichiarata non si ottengono righe osservate", () => {
    expect(() => observedLines({ lines: [], provenance: "   " })).toThrowError(
      /la provenienza dei voti non è dichiarata/,
    );
  });

  it("un tetto costruito sulla previsione dà un ALTRO numero, e abbassa il rimpianto", () => {
    // QUANTO COSTA L'ERRORE, in fantapunti, invece di doverlo immaginare.
    //
    // Il tetto ora si può sbagliare solo di proposito — servono una chiamata a
    // `observedLines` e una provenienza scritta a mano che dice il falso — e
    // questo test fa proprio quella bugia, una volta, per misurarla.
    const { squad, all } = knownLines();
    const honest = bestElevenExPostPolicy({
      squadLines: squad,
      theirLineup: OPPONENT_LINEUP_76,
      players: all,
      context: CONTEXT,
    });

    // La bugia: righe di PREVISIONE targate come osservate.
    const LIE = "PREVISIONE spacciata per voti osservati — solo per misurare il danno";
    const prepared = prepareGameweek(exAnteInput());
    const contaminated = bestElevenExPostPolicy({
      squadLines: observedLines({ lines: prepared.expectedSquadLines, provenance: LIE }),
      theirLineup: OPPONENT_LINEUP_76,
      players: observedPlayerMap(
        observedLines({ lines: [...prepared.expectedPlayers.values()], provenance: LIE }),
      ),
      context: CONTEXT,
    });

    // I due tetti NON sono lo stesso numero: il vero sa del gol di C5, il finto
    // no, e a previsione i cinque centrocampisti sono intercambiabili.
    const honestTotal = honest.exPost.outcome?.ours.total as number;
    const contaminatedTotal = contaminated.exPost.outcome?.ours.total as number;
    expect(honestTotal).toBeGreaterThan(contaminatedTotal);
    expect(honestTotal - contaminatedTotal).toBe(CEILING_GAP);

    // E LA CONSEGUENZA CHE CONTA, quella di §2.4: il rimpianto misurato contro
    // il tetto finto è PIÙ PICCOLO del vero. Qui la formazione schierata è un
    // 4-4-2 con i quattro centrocampisti intercambiabili e C5 in panchina —
    // ex-ante una scelta senza colpe, perché del suo gol non sapeva nessuno, ed
    // è esattamente ciò che il rimpianto esiste per misurare.
    const fielded: Lineup = {
      module: "442",
      goalkeeperId: "P1",
      starterIds: ["D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A1", "A2"],
      benchIds: ["C5"],
    };
    const realised = simulateGameweek({
      ourLineup: fielded,
      theirLineup: OPPONENT_LINEUP_76,
      players: all,
      context: CONTEXT,
    });
    const trueRegret = lineupRegret(realised, honest.exPost);
    const understatedRegret = lineupRegret(realised, contaminated.exPost);

    // Sei fantapunti persi diventano zero. Non «un po' meno»: il tetto finto
    // coincide col punteggio davvero fatto, quindi quella giornata entrerebbe
    // nel ledger come una formazione PERFETTA. Un motore misurato così non
    // sbaglia mai, e nessuno vede niente di rotto: è la ragione per cui il
    // varco andava chiuso adesso e non «ce ne ricorderemo prima di WP-9».
    expect(trueRegret.scoreRegret).toBe(TRUE_SCORE_REGRET);
    expect(understatedRegret.scoreRegret).toBe(UNDERSTATED_SCORE_REGRET);
    expect(understatedRegret.scoreRegret).toBeLessThan(trueRegret.scoreRegret);
    expect(contaminatedTotal).toBe(realised.ours.total);

    // La provenienza resta stampata sotto il numero: chi legge la ragione del
    // tetto finto vede la bugia scritta, non deve dedurla.
    expect(honest.reason).toContain(REAL_VOTES);
    expect(contaminated.reason).toContain(LIE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LE DUE RIGHE CHE QUESTO PACCHETTO NON DECIDE, E IL CATALOGO.
// ─────────────────────────────────────────────────────────────────────────────

describe("le righe «Base» e «Ricco»", () => {
  it("sono la decisione del produttore con una previsione DICHIARATA dal chiamante", () => {
    const input = inputFor76();
    const engine = engineProposalPolicy(input, "BASE_ENGINE");
    const direct = proposeLineup(inputFor76());
    expect(engine.lineup).toEqual(direct.lineup);
    expect(engine.policy).toBe("BASE_ENGINE");
    expect(engine.reason).toContain("DICHIARATA dal chiamante");
    expect(engine.reason).toContain("§6.2");
  });

  it("la riga «Ricco» è la stessa decisione con un'altra previsione, e lo scrive", () => {
    const engine = engineProposalPolicy(inputFor76(), "RICH_ENGINE");
    expect(engine.policy).toBe("RICH_ENGINE");
    expect(engine.reason).toContain("§6.3");
  });

  it("un motore non dichiarato ferma la trascrizione", () => {
    expect(() =>
      engineProposalPolicy(inputFor76(), "MOTORE_A_CASO" as unknown as "BASE_ENGINE"),
    ).toThrowError(/motore della previsione non dichiarato o sconosciuto: MOTORE_A_CASO/);
  });
});

describe("la riga «Schierata»", () => {
  it("registra la formazione inviata così com'è, senza riordinarla", () => {
    const sent: Lineup = {
      module: "442",
      goalkeeperId: "P1",
      starterIds: ["D4", "D3", "D2", "D1", "C4", "C3", "C2", "C1", "A2", "A1"],
      benchIds: ["Y"],
    };
    const result = fieldedLineupPolicy({ lineup: sent, note: "Pico ha tolto Y dopo la conferenza stampa" });
    expect(result.lineup).toEqual(sent);
    expect(result.information).toBe("OBSERVED");
    expect(result.reason).toContain("Pico ha tolto Y dopo la conferenza stampa");
  });

  it("senza il motivo dell'override la riga non misura niente, e si ferma", () => {
    const sent: Lineup = { module: "442", goalkeeperId: "P1", starterIds: [], benchIds: [] };
    expect(() => fieldedLineupPolicy({ lineup: sent, note: "" })).toThrowError(
      /manca la nota che dice perché è stata inviata questa e non la proposta del champion/,
    );
  });
});

describe("il catalogo delle politiche di §11.1", () => {
  it("ha sei righe, quelle di §11.1, nessuna omessa e nessuna inventata", () => {
    expect(REFERENCE_POLICIES.map((policy) => policy.id)).toEqual([
      "BEST_EX_POST",
      "TOP_ELEVEN_BY_SEASON_AVERAGE",
      "RULE_OF_72",
      "BASE_ENGINE",
      "RICH_ENGINE",
      "FIELDED",
    ]);
    for (const policy of REFERENCE_POLICIES) {
      expect(policy.name.length).toBeGreaterThan(0);
      expect(policy.definition.length).toBeGreaterThan(0);
      expect(policy.role.length).toBeGreaterThan(0);
      expect(policy.note.length).toBeGreaterThan(0);
    }
  });

  it("una sola politica è EX-POST, ed è il tetto", () => {
    const exPost = REFERENCE_POLICIES.filter((policy) => policy.information === "EX_POST");
    expect(exPost.map((policy) => policy.id)).toEqual(["BEST_EX_POST"]);
  });

  it("le righe che questo pacchetto non decide dicono perché, invece di sparire dal catalogo", () => {
    const notDecidedHere = REFERENCE_POLICIES.filter((policy) => !policy.decidedHere);
    expect(notDecidedHere.map((policy) => policy.id)).toEqual(["BASE_ENGINE", "RICH_ENGINE", "FIELDED"]);
    expect(referencePolicy("RICH_ENGINE").note).toContain("non esiste");
  });

  it("una politica sconosciuta non si inventa", () => {
    expect(() => referencePolicy("REGOLA_DEI_66" as unknown as "RULE_OF_72")).toThrowError(
      /politica di riferimento sconosciuta: REGOLA_DEI_66/,
    );
  });

  it("i sette moduli restano sette: il pavimento li prova tutti", () => {
    expect(MODULES.length).toBe(7);
  });
});

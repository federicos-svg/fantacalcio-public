import { describe, it, expect } from "vitest";
import {
  CALIBRATION_BINS,
  LEAGUE_POINTS,
  type GameweekContext,
  type Lineup,
  type PlayerLine,
  type Role,
  bestLineupExPost,
  lineupRegret,
  opponentCoverage,
  pStarterCalibration,
  policyRegret,
  policySeasonTable,
  realisedLeaguePoints,
  safetyReport,
  simulateGameweek,
  winProbabilityCalibration,
} from "../src/index.js";

// FIXTURE SINTETICHE: identificatori costruiti, voti a mezzo punto, nessun dato
// reale, nessuna fonte vera, nessuna rete.

const CONTEXT: GameweekContext = { matchday: 30, weAreHome: true };

const line = (
  id: string,
  role: Role,
  baseVote: number | null,
  fantasyScore: number | null,
  extra: Partial<PlayerLine> = {},
): PlayerLine => ({ id, role, baseVote, fantasyScore, ...extra });

/** Undici nostri a 72 tondi contro undici loro a 76: la giornata di §2.2. */
function gameweekAt76(): {
  ours: Lineup;
  theirs: Lineup;
  players: Map<string, PlayerLine>;
  squad: PlayerLine[];
} {
  const squad: PlayerLine[] = [
    line("P1", "P", 7, 7),
    line("D1", "D", 7, 2),
    line("D2", "D", 7, 2),
    line("D3", "D", 7, 2),
    line("D4", "D", 7, 2),
    line("C1", "C", 6, 8, { receivedAnyBonus: true }),
    line("C2", "C", 6, 8, { receivedAnyBonus: true }),
    line("C3", "C", 6, 8, { receivedAnyBonus: true }),
    line("C4", "C", 6, 8, { receivedAnyBonus: true }),
    line("C5", "C", 6, 9, { receivedAnyBonus: true }),
    line("A1", "A", 6, 9.5, { receivedAnyBonus: true }),
    line("A2", "A", 6, 9.5, { receivedAnyBonus: true }),
  ];
  const theirs: PlayerLine[] = [
    line("oP1", "P", 6, 6),
    line("oD1", "D", 6, 9, { receivedAnyBonus: true }),
    line("oD2", "D", 6, 9, { receivedAnyBonus: true }),
    line("oD3", "D", 6, 6),
    line("oD4", "D", 6, 6),
    line("oC1", "C", 6, 9, { receivedAnyBonus: true }),
    line("oC2", "C", 6, 6),
    line("oC3", "C", 6, 6),
    line("oC4", "C", 6, 6),
    line("oA1", "A", 6, 6),
    line("oA2", "A", 6, 6),
  ];
  const players = new Map<string, PlayerLine>([...squad, ...theirs].map((l) => [l.id, l]));
  return {
    ours: {
      module: "442",
      goalkeeperId: "P1",
      starterIds: ["D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A1", "A2"],
      benchIds: ["C5"],
    },
    theirs: {
      module: "442",
      goalkeeperId: "oP1",
      starterIds: ["oD1", "oD2", "oD3", "oD4", "oC1", "oC2", "oC3", "oC4", "oA1", "oA2"],
      benchIds: [],
    },
    players,
    squad,
  };
}

describe("punti di lega realizzati", () => {
  it("golden: 72 contro 76 sono zero punti, e la ragione dice il risultato", () => {
    const { ours, theirs, players } = gameweekAt76();
    const outcome = simulateGameweek({ ourLineup: ours, theirLineup: theirs, players, context: CONTEXT });
    const realised = realisedLeaguePoints(outcome);
    expect(realised.leaguePoints).toBe(0);
    expect(realised.ourTotal).toBe(72);
    expect(realised.ourGoals).toBe(2);
    expect(realised.theirGoals).toBe(3);
    expect(realised.reason).toContain("2-3");
  });

  it("un esito non risolto non vale zero: vale «non calcolabile»", () => {
    // Un titolare senza voto e senza stato dei cartellini: §13 non sa che
    // punteggio dargli, e il conto si ferma invece di inventarne uno.
    const { ours, theirs, players } = gameweekAt76();
    const broken = new Map(players);
    broken.set("C1", line("C1", "C", null, null));
    const outcome = simulateGameweek({ ourLineup: ours, theirLineup: theirs, players: broken, context: CONTEXT });
    expect(outcome.resolved).toBe(false);
    const realised = realisedLeaguePoints(outcome);
    expect(realised.leaguePoints).toBeNull();
    expect(realised.reason).toContain("non ci sono punti di lega da attribuire");
  });
});

describe("cumulato stagionale per politica", () => {
  it("golden: somma per politica, con la base delle giornate viste", () => {
    const table = policySeasonTable([
      { policy: "RULE_OF_72", matchday: 1, leaguePoints: 0 },
      { policy: "RULE_OF_72", matchday: 2, leaguePoints: 3 },
      { policy: "BASE_ENGINE", matchday: 1, leaguePoints: 1 },
      { policy: "BASE_ENGINE", matchday: 2, leaguePoints: 3 },
    ]);
    expect(table.matchdays).toEqual([1, 2]);
    expect(table.sameBasis).toBe(true);
    expect(table.rows).toEqual([
      { policy: "RULE_OF_72", total: 3, matchdaysCounted: 2, matchdaysNotCounted: [] },
      { policy: "BASE_ENGINE", total: 4, matchdaysCounted: 2, matchdaysNotCounted: [] },
    ]);
  });

  it("basi diverse: i totali si producono lo stesso, ma dichiarati non confrontabili", () => {
    const table = policySeasonTable([
      { policy: "RULE_OF_72", matchday: 1, leaguePoints: 3 },
      { policy: "RULE_OF_72", matchday: 2, leaguePoints: 3 },
      { policy: "BASE_ENGINE", matchday: 1, leaguePoints: 1 },
      { policy: "BASE_ENGINE", matchday: 2, leaguePoints: null },
    ]);
    expect(table.sameBasis).toBe(false);
    expect(table.reason).toContain("BASI DIVERSE");
    expect(table.reason).toContain("BASE_ENGINE non conta 2");
    expect(table.rows[1]?.matchdaysNotCounted).toEqual([2]);
  });

  it("due righe per la stessa giornata sono un errore, non un dato più ricco", () => {
    expect(() =>
      policySeasonTable([
        { policy: "RULE_OF_72", matchday: 1, leaguePoints: 3 },
        { policy: "RULE_OF_72", matchday: 1, leaguePoints: 0 },
      ]),
    ).toThrowError(/la politica RULE_OF_72 ha due righe per la giornata 1/);
  });

  it("una tabella vuota non è un confronto a zero pari", () => {
    expect(() => policySeasonTable([])).toThrowError(/nessuna giornata registrata.*nessun confronto/s);
  });

  it("una giornata non valida ferma il conto", () => {
    expect(() => policySeasonTable([{ policy: "FIELDED", matchday: 0, leaguePoints: 1 }])).toThrowError(
      /giornata non valida \(0\) per la politica FIELDED/,
    );
  });

  it("«non calcolabile» si scrive null, non NaN", () => {
    expect(() => policySeasonTable([{ policy: "FIELDED", matchday: 1, leaguePoints: Number.NaN }])).toThrowError(
      /punti non finiti alla giornata 1 per FIELDED.*si scrive null/s,
    );
  });
});

describe("rimpianto di una politica", () => {
  it("golden: riusa il rimpianto in fantapunti e aggiunge quello in punti di lega", () => {
    const { ours, theirs, players, squad } = gameweekAt76();
    // La formazione scelta lascia in panchina C5, che valeva 9 contro gli 8 di
    // C4: il tetto ex-post lo schiera e arriva a 73, cioè al pareggio.
    const chosen = simulateGameweek({ ourLineup: ours, theirLineup: theirs, players, context: CONTEXT });
    const ceiling = bestLineupExPost({ squad, theirLineup: theirs, players, context: CONTEXT });
    const regret = policyRegret({ chosen, ceiling });
    expect(regret.comparable).toBe(true);
    expect(regret.chosenLeaguePoints).toBe(0);
    expect(regret.bestLeaguePoints).toBe(LEAGUE_POINTS.draw);
    expect(regret.leaguePointsRegret).toBe(1);
    // La parte in fantapunti è ESATTAMENTE quella di `lineupRegret`: non c'è
    // una seconda implementazione che un giorno divergerà.
    const base = lineupRegret(chosen, ceiling);
    expect(regret.scoreRegret).toBe(base.scoreRegret);
    expect(regret.goalRegret).toBe(base.goalRegret);
    expect(regret.scoreRegret).toBe(1);
  });

  it("senza un tetto calcolabile il rimpianto non è zero: è incomparabile", () => {
    const { ours, theirs, players } = gameweekAt76();
    const chosen = simulateGameweek({ ourLineup: ours, theirLineup: theirs, players, context: CONTEXT });
    // Una rosa di due giocatori non regge nessun modulo: niente tetto.
    const ceiling = bestLineupExPost({
      squad: [line("P1", "P", 7, 7), line("D1", "D", 7, 7)],
      theirLineup: theirs,
      players,
      context: CONTEXT,
    });
    const regret = policyRegret({ chosen, ceiling });
    expect(regret.comparable).toBe(false);
    expect(regret.leaguePointsRegret).toBe(0);
    expect(regret.reason).toContain("nessuna formazione completa schierabile");
  });
});

describe("calibrazione di P(vittoria)", () => {
  it("golden: dieci decili, i conteggi e la quota osservata", () => {
    const report = winProbabilityCalibration([
      { predictedWin: 0.05, won: false },
      { predictedWin: 0.05, won: false },
      { predictedWin: 0.55, won: true },
      { predictedWin: 0.55, won: false },
      // p = 1 cade nell'ultimo decile, che è chiuso a destra: altrimenti
      // servirebbe un undicesimo intervallo che non esiste.
      { predictedWin: 1, won: true },
    ]);
    expect(report.bins).toHaveLength(CALIBRATION_BINS);
    expect(report.count).toBe(5);
    expect(report.populatedBins).toBe(3);
    expect(report.bins[0]).toEqual({ lower: 0, upper: 0.1, count: 2, meanPredicted: 0.05, observedRate: 0 });
    expect(report.bins[5]).toEqual({ lower: 0.5, upper: 0.6, count: 2, meanPredicted: 0.55, observedRate: 0.5 });
    expect(report.bins[9]).toEqual({ lower: 0.9, upper: 1, count: 1, meanPredicted: 1, observedRate: 1 });
    expect(report.bins[1]?.meanPredicted).toBeNull();
    expect(report.bins[1]?.observedRate).toBeNull();
  });

  it("si dichiara grossolana, come §11.2 pretende", () => {
    const report = winProbabilityCalibration([{ predictedWin: 0.5, won: true }]);
    expect(report.reason).toContain("MISURA GROSSOLANA E DICHIARATA TALE");
    expect(report.reason).toContain("38 giornate");
  });

  it("senza osservazioni non è una calibrazione piatta: è nessuna misura", () => {
    expect(() => winProbabilityCalibration([])).toThrowError(
      /calibrazione di P\(vittoria\): nessuna osservazione.*nessuna misura/s,
    );
  });

  it("una probabilità fuori da [0,1] ferma il conto", () => {
    expect(() => winProbabilityCalibration([{ predictedWin: 1.2, won: true }])).toThrowError(
      /calibrazione di P\(vittoria\): probabilità prevista fuori da \[0,1\] \(1.2\)/,
    );
  });

  it("«non osservato» non è «non accaduto»", () => {
    expect(() =>
      winProbabilityCalibration([{ predictedWin: 0.5, won: null as unknown as boolean }]),
    ).toThrowError(/l'esito osservato non è un booleano.*non si mette a false/s);
  });
});

describe("calibrazione di pStarter per fonte e per squadra", () => {
  const observations = [
    { source: "fonte-A", team: "squadra-1", playerId: "g1", pStarter: 0.95, started: true },
    { source: "fonte-A", team: "squadra-1", playerId: "g2", pStarter: 0.95, started: false },
    { source: "fonte-A", team: "squadra-2", playerId: "g3", pStarter: 0.15, started: false },
    { source: "fonte-B", team: "squadra-1", playerId: "g1", pStarter: 0.55, started: true },
  ];

  it("golden: un gruppo per coppia fonte × squadra, in ordine dichiarato", () => {
    const report = pStarterCalibration(observations);
    expect(report.groups.map((group) => `${group.source}|${group.team}`)).toEqual([
      "fonte-A|squadra-1",
      "fonte-A|squadra-2",
      "fonte-B|squadra-1",
    ]);
    expect(report.groups[0]?.report.count).toBe(2);
    expect(report.groups[0]?.report.bins[9]?.observedRate).toBe(0.5);
    expect(report.overall.count).toBe(4);
  });

  it("dichiara di NON essere l'affidabilità hit(s,t) che pesa le fonti", () => {
    const report = pStarterCalibration(observations);
    expect(report.groups[0]?.report.reason).toContain("NON l'affidabilità hit(s,t) di §7.4");
  });

  it("lo stesso giocatore due volte per la stessa fonte pesa il doppio: si rifiuta", () => {
    expect(() => pStarterCalibration([...observations, observations[0] as (typeof observations)[0]])).toThrowError(
      /g1 compare due volte per la fonte fonte-A e la squadra squadra-1.*ULTIMA lettura/s,
    );
  });

  it("senza la squadra non è la misura di §7.4, ed è un'altra: si ferma", () => {
    expect(() =>
      pStarterCalibration([{ source: "fonte-A", team: "", playerId: "g1", pStarter: 0.5, started: true }]),
    ).toThrowError(/team mancante o vuoto.*PER FONTE E PER SQUADRA/s);
  });
});

describe("copertura dell'avversario", () => {
  const { theirs } = gameweekAt76();
  const other: Lineup = { ...theirs, module: "352", starterIds: [...theirs.starterIds].reverse() };

  it("golden: la formazione vera era in O, e con che peso normalizzato", () => {
    const coverage = opponentCoverage({
      distribution: [
        { lineup: other, weight: 3 },
        { lineup: theirs, weight: 1 },
      ],
      trueLineup: theirs,
    });
    expect(coverage.covered).toBe(true);
    expect(coverage.index).toBe(1);
    expect(coverage.weight).toBe(0.25);
    expect(coverage.candidates).toBe(2);
  });

  it("una formazione vera fuori dalla distribuzione è peso zero, e lo dice senza attenuarlo", () => {
    const coverage = opponentCoverage({ distribution: [{ lineup: other, weight: 1 }], trueLineup: theirs });
    expect(coverage.covered).toBe(false);
    expect(coverage.weight).toBe(0);
    expect(coverage.index).toBeNull();
    expect(coverage.reason).toContain("la dichiarava impossibile");
  });

  it("l'ordine della panchina fa parte della formazione, perché decide le sostituzioni (§10)", () => {
    const sameElevenOtherBench: Lineup = { ...theirs, benchIds: ["oX1"] };
    const coverage = opponentCoverage({
      distribution: [{ lineup: sameElevenOtherBench, weight: 1 }],
      trueLineup: theirs,
    });
    expect(coverage.covered).toBe(false);
  });

  it("una distribuzione vuota non è «nessuna assunzione»", () => {
    expect(() => opponentCoverage({ distribution: [], trueLineup: theirs })).toThrowError(
      /copertura dell'avversario: la distribuzione delle formazioni avversarie è vuota/,
    );
  });
});

describe("sicurezza", () => {
  it("golden: senza voto scoperti per giornata, e nessuna giornata senza formazione", () => {
    const { ours, theirs, players } = gameweekAt76();
    // C1 senza voto puro e nessun centrocampista in panchina che possa entrare:
    // resta scoperto, e §13 lo conta come assente.
    const uncovered = new Map(players);
    uncovered.set("C1", line("C1", "C", null, null, { cards: "none", otherBonusMalus: 0 }));
    uncovered.set("C5", line("C5", "C", null, null, { cards: "none", otherBonusMalus: 0 }));
    const outcome = simulateGameweek({
      ourLineup: ours,
      theirLineup: theirs,
      players: uncovered,
      context: CONTEXT,
    });
    const clean = simulateGameweek({ ourLineup: ours, theirLineup: theirs, players, context: CONTEXT });
    const report = safetyReport([
      { matchday: 2, lineup: ours, outcome },
      { matchday: 1, lineup: ours, outcome: clean },
    ]);
    expect(report.matchdays.map((row) => row.matchday)).toEqual([1, 2]);
    expect(report.matchdaysWithoutLineup).toBe(0);
    expect(report.safe).toBe(true);
    expect(report.totalUncovered).toBe(1);
    expect(report.matchdays[1]?.uncoveredIds).toEqual(["C1"]);
  });

  it("una giornata senza formazione rende insicura la stagione, e non si media", () => {
    const { ours, theirs, players } = gameweekAt76();
    const outcome = simulateGameweek({ ourLineup: ours, theirLineup: theirs, players, context: CONTEXT });
    const report = safetyReport([
      { matchday: 1, lineup: ours, outcome },
      { matchday: 2, lineup: null, outcome: null },
    ]);
    expect(report.safe).toBe(false);
    expect(report.matchdaysWithoutLineup).toBe(1);
    expect(report.reason).toContain("GIORNATE SENZA FORMAZIONE: 2");
  });

  it("una giornata con formazione e senza esito si conta a parte, non come zero scoperti", () => {
    const { ours } = gameweekAt76();
    const report = safetyReport([{ matchday: 1, lineup: ours, outcome: null }]);
    expect(report.matchdaysNotEvaluated).toBe(1);
    expect(report.matchdays[0]?.uncovered).toBeNull();
    expect(report.totalUncovered).toBe(0);
    expect(report.reason).toContain("senza esito calcolato");
  });

  it("la stessa giornata due volte nasconde o raddoppia: si rifiuta", () => {
    const { ours } = gameweekAt76();
    expect(() =>
      safetyReport([
        { matchday: 1, lineup: ours, outcome: null },
        { matchday: 1, lineup: null, outcome: null },
      ]),
    ).toThrowError(/la giornata 1 compare due volte/);
  });

  it("zero giornate non sono un sistema sicuro", () => {
    expect(() => safetyReport([])).toThrowError(
      /nessuna giornata registrata.*non ha ancora giocato/s,
    );
  });
});

import { describe, it, expect } from "vitest";
import {
  LEAGUE_POINTS,
  type GameweekContext,
  type Lineup,
  type LineupValuation,
  type Module,
  type PlayerDistribution,
  type PlayerForecast,
  type Role,
  buildLineupFromPlan,
  compareLineupValuations,
  leaguePointsOf,
  lineupViolations,
  mulberry32,
  meanFantasyScoreIfPlays,
  naturalStartPlan,
  naturalStartValue,
  prepareGameweek,
  proposeLineup,
  samplePlayerLine,
  scenarioObjectiveValue,
  simulateGameweek,
  startingBench,
} from "../src/index.js";

// LA PARTENZA DELLA RICERCA DEL LIVELLO 2: la migliore fra la formazione del
// livello 1 e le formazioni «naturali», una per modulo ammesso.
//
// FIXTURE SINTETICHE: identificatori costruiti, voti e probabilità scelti a
// mano, nessun dato reale, nessuna rete.
//
// PERCHÉ ESISTE. Il livello 1 lavora sulle righe MODALI, e quando sono quasi
// tutte uguali (sui dati veri 25 giocatori su 28 valgono 6,0 esatto) sceglie
// fra pari con l'ordine degli id: la formazione che ne esce ha il portiere al
// 5 % di probabilità titolare, e la ricerca locale impiega 16 mosse a tornare
// indietro. La formazione «naturale» mette in campo i giocatori col valore più
// alto — probabilità di voto per fantavoto medio — ed è una partenza candidata.
// Sotto: che cosa è quel valore, come si costruisce la formazione, che i
// vincoli entrano per costruzione, e che la partenza scelta non vale mai meno di
// quella di prima.

const CONTEXT: GameweekContext = { matchday: 10, weAreHome: true };
const ASOF = "2026-10-01T10:00:00Z";

function fc(id: string, role: Role, p: number, baseVote = 6, fantasyScore = baseVote): PlayerForecast {
  return {
    id,
    role,
    voteProbability: p,
    expected: { baseVote, fantasyScore, receivedAnyBonus: fantasyScore > baseVote, missedPenalty: false },
  };
}

function opponentFlat(): PlayerForecast[] {
  const out = [fc("oP1", "P", 1)];
  for (let i = 1; i <= 4; i += 1) out.push(fc(`oD${i}`, "D", 1));
  for (let i = 1; i <= 4; i += 1) out.push(fc(`oC${i}`, "C", 1));
  for (let i = 1; i <= 2; i += 1) out.push(fc(`oA${i}`, "A", 1));
  return out;
}

const OPP_LINEUP: Lineup = {
  module: "442",
  goalkeeperId: "oP1",
  starterIds: ["oD1", "oD2", "oD3", "oD4", "oC1", "oC2", "oC3", "oC4", "oA1", "oA2"],
  benchIds: [],
};

/** La stima di una formazione sugli scenari di una preparazione: la stessa aritmetica del produttore. */
function valuate(prep: ReturnType<typeof prepareGameweek>, lineup: Lineup): LineupValuation {
  let objectiveValue = 0;
  let undecidedWeight = 0;
  let expectedLeaguePoints = 0;
  let expectedOurTotal = 0;
  let squared = 0;
  let win = 0;
  let draw = 0;
  let loss = 0;
  let fullyTabulated = true;
  let allResolved = true;
  for (const scenario of prep.scenarios()) {
    const outcome = simulateGameweek({
      ourLineup: lineup,
      theirLineup: prep.opponentLineups[scenario.opponentIndex] as Lineup,
      players: scenario.players,
      context: prep.context,
    });
    const contribution = scenarioObjectiveValue(outcome, prep.competition, LEAGUE_POINTS);
    if (contribution.decided) objectiveValue += scenario.weight * contribution.value;
    else undecidedWeight += scenario.weight;
    expectedLeaguePoints += scenario.weight * leaguePointsOf(outcome, LEAGUE_POINTS).value;
    expectedOurTotal += scenario.weight * outcome.ours.total;
    squared += scenario.weight * outcome.ours.total * outcome.ours.total;
    if (outcome.ourGoals > outcome.theirGoals) win += scenario.weight;
    else if (outcome.ourGoals === outcome.theirGoals) draw += scenario.weight;
    else loss += scenario.weight;
    if (!outcome.fullyTabulated) fullyTabulated = false;
    if (!outcome.resolved) allResolved = false;
  }
  return {
    objectiveValue,
    undecidedWeight,
    expectedLeaguePoints,
    expectedOurTotal,
    ourTotalVariance: Math.max(0, squared - expectedOurTotal * expectedOurTotal),
    winProbability: win,
    drawProbability: draw,
    lossProbability: loss,
    fullyTabulated,
    allResolved,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. IL FANTAVOTO MEDIO DI CHI PRENDE VOTO
// ─────────────────────────────────────────────────────────────────────────────

/** Una distribuzione con numeri tondi, di cui la media si rifà a mano. */
function distribution(role: Role, p: number, withEvents: boolean): PlayerDistribution {
  return {
    pPlays: p,
    pStarter: p,
    pSub: 0,
    // Media del voto base: 0,25 × 5,5 + 0,5 × 6 + 0,25 × 7 = 1,375 + 3 + 1,75 = 6,125.
    baseVote: [
      { vote: 5.5, probability: 0.25 },
      { vote: 6, probability: 0.5 },
      { vote: 7, probability: 0.25 },
    ],
    events: {
      pGoal: withEvents ? 0.1 : 0,
      pAssist: withEvents ? 0.2 : 0,
      pYellow: withEvents ? 0.2 : 0,
      pRed: withEvents ? 0.1 : 0,
      pOwnGoal: withEvents ? 0.1 : 0,
      pPenMissed: withEvents ? 0.1 : 0,
      pPenSaved: withEvents ? 0.1 : 0,
      ...(role === "P" ? { goalsConceded: [0.5, 0.3, 0.2] } : {}),
    },
    svKind: { clean: 1, booked: 0, sentOffDuringMatch: 0, withOtherBonusMalus: 0, sentOffAfterMatch: 0 },
    asOf: ASOF,
    sourceQuality: "SINTETICA (prova)",
  };
}

describe("meanFantasyScoreIfPlays", () => {
  it("la media del voto base più gli eventi alla tariffa di §12: il conto a mano", () => {
    // Eventi: gol 0,1 × 3 = 0,3 ; assist 0,2 × 1 = 0,2 ; giallo 0,2 × −0,5 = −0,1 ;
    // rosso 0,1 × −1 = −0,1 ; autogol 0,1 × −2 = −0,2 ; rigore sbagliato 0,1 × −3
    // = −0,3 ; rigore parato 0,1 × 3 = 0,3. Somma 0,1. Voto base 6,125.
    expect(meanFantasyScoreIfPlays({ role: "C" }, distribution("C", 0.8, true))).toBeCloseTo(6.225, 12);
    // Senza eventi resta la media del voto.
    expect(meanFantasyScoreIfPlays({ role: "D" }, distribution("D", 0.8, false))).toBeCloseTo(6.125, 12);
  });

  it("il portiere paga i gol subiti attesi, −1 l'uno (§12-bis): 0,3 + 2 × 0,2 = 0,7", () => {
    expect(meanFantasyScoreIfPlays({ role: "P" }, distribution("P", 0.7, false))).toBeCloseTo(6.125 - 0.7, 12);
  });

  it("è la media che l'estrazione produce davvero", () => {
    // Non una formula parallela che potrebbe divergere dall'estrazione: la
    // media dei fantavoti estratti con `plays: true` converge a lei.
    for (const role of ["P", "A"] as const) {
      const dist = distribution(role, 0.6, true);
      const random = mulberry32(2026);
      const draws = 200000;
      let sum = 0;
      for (let i = 0; i < draws; i += 1) {
        const line = samplePlayerLine({ id: "x", role }, dist, random, true);
        sum += line.fantasyScore as number;
      }
      expect(Math.abs(sum / draws - meanFantasyScoreIfPlays({ role }, dist))).toBeLessThan(0.02);
    }
  });
});

describe("naturalStartValue", () => {
  it("con la distribuzione è probabilità × media della distribuzione; senza, probabilità × riga attesa", () => {
    const withDist: PlayerForecast = { ...fc("a", "C", 0.8, 6, 6), distribution: distribution("C", 0.8, true) };
    expect(naturalStartValue(withDist)).toBeCloseTo(0.8 * 6.225, 12);
    expect(naturalStartValue(fc("b", "C", 0.5, 6.5, 7.5))).toBe(0.5 * 7.5);
    expect(naturalStartValue(fc("c", "C", 0, 7, 7))).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LA FORMAZIONE «NATURALE» DI UN MODULO
// ─────────────────────────────────────────────────────────────────────────────

/** Ids alfabetici: «a_» fragili, «z_» solidi — l'ordine degli id inganna il livello 1. */
function misleadingSquad(): PlayerForecast[] {
  const out: PlayerForecast[] = [fc("a_P", "P", 0.2), fc("z_P", "P", 0.9)];
  for (const [role, n] of [["D", 4], ["C", 4], ["A", 2]] as const) {
    for (let i = 1; i <= n; i += 1) out.push(fc(`a_${role}${i}`, role, 0.3));
    for (let i = 1; i <= n; i += 1) out.push(fc(`z_${role}${i}`, role, 0.9));
  }
  return out;
}

describe("naturalStartPlan", () => {
  const squad = misleadingSquad();
  const none: ReadonlySet<string> = new Set();

  it("prende il portiere e, per ruolo, i giocatori di valore più alto, in numero pari al modulo", () => {
    const plan = naturalStartPlan("433", squad, none);
    expect(plan).not.toBeNull();
    expect(plan!.module).toBe("433");
    expect(plan!.keeperId).toBe("z_P");
    // 4-3-3: quattro difensori, tre centrocampisti, tre attaccanti. I solidi
    // (p = 0,9) prima; l'ultimo attaccante lo prende un fragile, a parità di
    // valore fra i due (0,3 × 6) decide l'id.
    expect([...plan!.starterIds].sort()).toEqual(
      ["a_A1", "z_A1", "z_A2", "z_C1", "z_C2", "z_C3", "z_D1", "z_D2", "z_D3", "z_D4"].sort(),
    );
  });

  it("la panchina è quella che il livello 2 usa già: `startingBench` sui non scelti", () => {
    const plan = naturalStartPlan("442", squad, none)!;
    const chosen = new Set([plan.keeperId, ...plan.starterIds]);
    expect(plan.benchIds).toEqual(startingBench(squad, chosen));
    expect(plan.benchIds).toHaveLength(squad.length - 11);
  });

  it("il valore decide, non l'ordine degli id né la riga modale (tutte uguali)", () => {
    const plan = naturalStartPlan("442", squad, none)!;
    expect(plan.keeperId).toBe("z_P");
    for (const id of plan.starterIds) expect(id.startsWith("z_")).toBe(true);
  });

  it("a parità di valore decide l'ordine dichiarato (punteggio atteso, poi id)", () => {
    // Tutti identici: nemmeno il valore distingue, e la scelta è l'id crescente.
    const tutti = [
      fc("P2", "P", 1),
      fc("P1", "P", 1),
      ...[5, 3, 1, 4, 2].map((i) => fc(`D${i}`, "D", 1)),
      ...[4, 2, 3, 1, 5].map((i) => fc(`C${i}`, "C", 1)),
      ...[3, 1, 2].map((i) => fc(`A${i}`, "A", 1)),
    ];
    const plan = naturalStartPlan("343", tutti, none)!;
    expect(plan.keeperId).toBe("P1");
    expect([...plan.starterIds].sort()).toEqual(["A1", "A2", "A3", "C1", "C2", "C3", "C4", "D1", "D2", "D3"]);
    // E la riga attesa più alta passa avanti all'id: a pari valore (p × 6 = 0,5 × 12).
    const bonus = [...tutti.filter((f) => f.id !== "D3"), fc("D3", "D", 0.5, 6, 12)];
    expect(naturalStartPlan("343", bonus, none)!.starterIds).toContain("D3");
  });

  it("chi non prende voto in nessuno scenario non è titolare", () => {
    const withGhost = [fc("g_D", "D", 0, 8, 8), ...squad];
    for (const module of ["442", "541"] as const) {
      const plan = naturalStartPlan(module, withGhost, none)!;
      expect(plan.starterIds).not.toContain("g_D");
      expect(plan.benchIds).toContain("g_D");
    }
  });

  it("un modulo che la rosa non riempie non ha naturale", () => {
    // 5 difensori servono al 5-3-2 e al 5-4-1; la rosa ne ha 8 ma quattro sono p = 0.
    const short = squad.map((f) => (f.role === "D" && f.id.startsWith("a_") ? { ...f, voteProbability: 0 } : f));
    expect(naturalStartPlan("541", short, none)).toBeNull();
    expect(naturalStartPlan("442", short, none)).not.toBeNull();
  });

  it("gli imposti sono sempre titolari, anche se fragili o certamente assenti", () => {
    const withGhost = [fc("g_D", "D", 0, 8, 8), ...squad];
    const plan = naturalStartPlan("442", withGhost, new Set(["a_D1", "g_D", "a_P"]))!;
    expect(plan.keeperId).toBe("a_P");
    expect(plan.starterIds).toContain("a_D1");
    expect(plan.starterIds).toContain("g_D");
    // Il reparto si completa per valore: 4 difensori = 2 imposti + i 2 migliori degli altri.
    const defenders = plan.starterIds.filter((id) => id.includes("_D"));
    expect(defenders.sort()).toEqual(["a_D1", "g_D", "z_D1", "z_D2"].sort());
    expect(plan.starterIds).toHaveLength(10);
  });

  it("imposti di un reparto oltre il modulo: nessuna naturale per quel modulo", () => {
    const five = new Set(["a_D1", "a_D2", "a_D3", "a_D4", "z_D1"]);
    expect(naturalStartPlan("442", squad, five)).toBeNull();
    expect(naturalStartPlan("343", squad, five)).toBeNull();
    const ok = naturalStartPlan("541", squad, five);
    expect(ok).not.toBeNull();
    for (const id of five) expect(ok!.starterIds).toContain(id);
    // Due portieri imposti non stanno in nessun modulo.
    expect(naturalStartPlan("442", squad, new Set(["a_P", "z_P"]))).toBeNull();
  });

  it("la formazione che ne esce è legale", () => {
    const prep = prepareGameweek({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
    });
    for (const module of ["343", "352", "433", "442", "451", "532", "541"] as const) {
      const plan = naturalStartPlan(module, prep.squad, none);
      if (plan === null) continue;
      const lineup = buildLineupFromPlan(plan, prep.byId);
      expect(lineupViolations(lineup, prep.expectedPlayers)).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. LA PARTENZA SCELTA
// ─────────────────────────────────────────────────────────────────────────────

function input(squad: readonly PlayerForecast[], extra: object = {}) {
  return {
    squad,
    opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
    context: CONTEXT,
    scenarioBudget: 256,
    ...extra,
  };
}

describe("la partenza della ricerca", () => {
  it("con un livello 1 fuorviante parte dalla naturale, e il risultato vale più della partenza di prima", () => {
    const squad = misleadingSquad();
    const proposal = proposeLineup(input(squad));
    expect(proposal.feasible).toBe(true);

    // LA PREMESSA: il livello 1 è davvero fuorviante. Le righe modali sono tutte
    // uguali, quindi sceglie per id: ha il portiere al 20 % e quasi tutti fragili.
    const level1 = proposal.pointForecast.lineup!;
    expect(level1.goalkeeperId).toBe("a_P");
    expect(level1.starterIds.filter((id) => id.startsWith("a_")).length).toBeGreaterThanOrEqual(8);

    // LA PARTENZA SCELTA È UNA NATURALE: lo dice la prosa, e lo conferma la
    // formazione consegnata, che — con zero mosse — È la naturale di quel modulo.
    expect(proposal.reason).toContain("partenza: la formazione naturale");
    expect(proposal.reason).toContain("con 0 mossa/e accettata/e");
    const prep = prepareGameweek(input(squad));
    const natural = buildLineupFromPlan(naturalStartPlan(proposal.lineup!.module, prep.squad, new Set())!, prep.byId);
    expect(proposal.lineup).toEqual(natural);

    // «MAI MENO DI PRIMA»: sugli stessi scenari la finale vale strettamente più
    // della partenza del livello 1.
    const vFinal = valuate(prep, proposal.lineup!);
    const vLevel1 = valuate(prep, level1);
    expect(compareLineupValuations(vFinal, vLevel1)).toBeGreaterThan(0);
    expect(vFinal.objectiveValue).toBeGreaterThan(vLevel1.objectiveValue);
    // La stima dichiarata è quella della formazione consegnata.
    expect(proposal.estimate.objectiveValue).toBeCloseTo(vFinal.objectiveValue, 12);
  });

  it("le valutazioni in più sono al più sette, dichiarate nella ragione, e non entrano in `evaluated`", () => {
    const proposal = proposeLineup(input(misleadingSquad()));
    const m = /(\d+) naturali distinte valutate in più/.exec(proposal.reason);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(1);
    expect(Number(m![1])).toBeLessThanOrEqual(7);
  });

  it("quando il livello 1 è già la migliore partenza, la ricerca parte da lui e lo dice", () => {
    // Tutti certi, tutti uguali: una sola formazione conta e l'ottimo esatto del
    // livello 1 non può essere battuto da una naturale.
    const certi = misleadingSquad().map((f) => ({ ...f, voteProbability: 1 }));
    const proposal = proposeLineup(input(certi, { scenarioBudget: 16 }));
    expect(proposal.reason).toContain("partenza: la formazione del livello 1");
    expect(proposal.reason).not.toContain("partenza: la formazione naturale");
  });

  it("su rose casuali il risultato non vale MAI meno della formazione del livello 1, sugli stessi scenari", () => {
    const random = mulberry32(7);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)] as T;
    const probs = [0, 0.15, 0.4, 0.7, 0.95, 1] as const;
    let strictlyBetter = 0;
    for (let trial = 0; trial < 8; trial += 1) {
      const squad: PlayerForecast[] = [];
      for (const [role, n] of [["P", 3], ["D", 6 + (trial % 2)], ["C", 6], ["A", 4]] as const) {
        for (let i = 0; i < n; i += 1) {
          const baseVote = pick([5.5, 6, 6, 6.5]);
          squad.push(fc(`${role}${trial}_${i}`, role, pick(probs), baseVote, baseVote));
        }
      }
      const request = input(squad, { scenarioBudget: 96, seed: 100 + trial });
      const proposal = proposeLineup(request);
      if (!proposal.feasible) continue;
      const prep = prepareGameweek(request);
      const vFinal = valuate(prep, proposal.lineup!);
      const vLevel1 = valuate(prep, proposal.pointForecast.lineup!);
      expect(compareLineupValuations(vFinal, vLevel1)).toBeGreaterThanOrEqual(0);
      if (compareLineupValuations(vFinal, vLevel1) > 0) strictlyBetter += 1;
    }
    // Non è una prova vacua: in almeno una rosa la partenza ha fatto la differenza.
    expect(strictlyBetter).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. I VINCOLI
// ─────────────────────────────────────────────────────────────────────────────

describe("la partenza naturale rispetta i vincoli", () => {
  it("gli imposti sono titolari anche se la naturale li lascerebbe fuori", () => {
    const squad = misleadingSquad();
    // a_P (portiere al 20 %) e due fragili di movimento: la naturale libera li lascia in panchina.
    const locked = ["a_P", "a_D1", "a_C2"];
    const proposal = proposeLineup(input(squad, { constraints: { lockedStarterIds: locked, locked: false } }));
    expect(proposal.feasible).toBe(true);
    const fielded = new Set([proposal.lineup!.goalkeeperId, ...proposal.lineup!.starterIds]);
    for (const id of locked) expect(fielded.has(id)).toBe(true);
    // E la partenza era davvero una naturale vincolata (non il livello 1).
    expect(proposal.constraints.rejections).toEqual([]);
    expect(proposal.reason).toContain("partenza: la formazione naturale");
  });

  it("il modulo imposto resta quello: la naturale è costruita solo per lui", () => {
    const squad = misleadingSquad();
    for (const module of ["442", "541"] as const satisfies readonly Module[]) {
      const proposal = proposeLineup(input(squad, { constraints: { lockedStarterIds: [], lockedModule: module, locked: false } }));
      expect(proposal.feasible).toBe(true);
      expect(proposal.lineup!.module).toBe(module);
      // Al più una naturale distinta dal livello 1: un modulo solo.
      const m = /(\d+) naturali distinte valutate in più/.exec(proposal.reason);
      expect(Number(m![1])).toBeLessThanOrEqual(1);
    }
  });

  it("imposti e modulo insieme", () => {
    const squad = misleadingSquad();
    const locked = ["a_D1", "a_D2", "a_D3", "a_D4", "a_D5"].filter((id) => squad.some((f) => f.id === id));
    expect(locked).toHaveLength(4);
    const proposal = proposeLineup(
      input(squad, { constraints: { lockedStarterIds: [...locked, "a_A1"], lockedModule: "442", locked: false } }),
    );
    expect(proposal.feasible).toBe(true);
    expect(proposal.lineup!.module).toBe("442");
    for (const id of [...locked, "a_A1"]) {
      expect([proposal.lineup!.goalkeeperId, ...proposal.lineup!.starterIds]).toContain(id);
    }
  });

  it("`locked: true` non cerca e non valuta partenze: la formazione data, con una sola valutazione", () => {
    const squad = misleadingSquad();
    const given: Lineup = {
      module: "442",
      goalkeeperId: "a_P",
      starterIds: ["a_D1", "a_D2", "a_D3", "a_D4", "a_C1", "a_C2", "a_C3", "a_C4", "a_A1", "a_A2"],
      benchIds: squad
        .map((f) => f.id)
        .filter((id) => !["a_P", "a_D1", "a_D2", "a_D3", "a_D4", "a_C1", "a_C2", "a_C3", "a_C4", "a_A1", "a_A2"].includes(id)),
    };
    const proposal = proposeLineup(
      input(squad, { constraints: { lockedStarterIds: [], locked: true }, currentLineup: given }),
    );
    expect(proposal.feasible).toBe(true);
    expect(proposal.lineup).toEqual(given);
    expect(proposal.evaluated).toBe(1);
    expect(proposal.constraints.optimized).toBe(false);
    expect(proposal.reason).not.toContain("partenza");
    expect(proposal.reason).not.toContain("naturale");
  });
});

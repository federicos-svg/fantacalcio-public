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
// 3. DUE SALITE, UN CONFRONTO
// ─────────────────────────────────────────────────────────────────────────────
//
// La salita del livello 2 parte dalla formazione del livello 1 ESATTAMENTE come
// prima (A). Se la migliore naturale è un'altra formazione, parte una seconda
// salita da lei (B); si consegna B solo se vale STRETTAMENTE di più. Conseguenze
// che queste prove fissano: il risultato non vale mai meno di quello di prima, e
// ogni volta che B non vince la proposta è IDENTICA a quella di prima.
//
// COME SI FISSA «QUELLO DI PRIMA». Il codice di prima non è più nel repository,
// quindi la sua risposta è scritta qui sotto: per ogni rosa casuale (generata da
// `mulberry32` con un seme per prova, quindi riproducibile) il risultato di
// `origin/main` PRIMA delle naturali — formazione, stima, conto di `evaluated` —
// misurato lanciando esattamente queste stesse richieste su quel codice. Non è
// un'impronta di comodo: è il riferimento contro cui si dice «identica».

function input(squad: readonly PlayerForecast[], extra: object = {}) {
  return {
    squad,
    opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
    context: CONTEXT,
    scenarioBudget: 256,
    ...extra,
  };
}

/** Una rosa casuale e riproducibile, con o senza distribuzioni. */
function randomSquad(trial: number, withDistribution: boolean): PlayerForecast[] {
  const random = mulberry32(1000 + trial);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)] as T;
  const probs = [0, 0.15, 0.4, 0.7, 0.95, 1] as const;
  const squad: PlayerForecast[] = [];
  for (const [role, n] of [["P", 3], ["D", 6 + (trial % 2)], ["C", 6], ["A", 4]] as const) {
    for (let i = 0; i < n; i += 1) {
      const p = pick(probs);
      // Con la distribuzione il voto modale è quello della distribuzione (6,0).
      const baseVote = withDistribution ? 6 : pick([5.5, 6, 6, 6.5]);
      squad.push({
        ...fc(`${role}${trial}_${i}`, role, p, baseVote, baseVote),
        ...(withDistribution ? { distribution: distribution(role, p, true) } : {}),
      });
    }
  }
  return squad;
}

/** Le richieste del confronto: 8 rose senza distribuzioni, 4 con. */
const DIFFERENTIAL_CASES = [
  ...Array.from({ length: 8 }, (_, trial) => ({ trial, dist: false, budget: 96 })),
  ...Array.from({ length: 4 }, (_, i) => ({ trial: 20 + i, dist: true, budget: 48 })),
] as const;

function differentialRequest(c: (typeof DIFFERENTIAL_CASES)[number]) {
  return input(randomSquad(c.trial, c.dist), { scenarioBudget: c.budget, seed: 100 + c.trial });
}

/** Impronta FNV-1a a 32 bit della proposta (formazione, stima, conto): cambia con un ultimo bit. */
function proposalFingerprint(p: ReturnType<typeof proposeLineup>): string {
  const text = JSON.stringify({ lineup: p.lineup, estimate: p.estimate, evaluated: p.evaluated });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * IL RISULTATO DI `origin/main` PRIMA DELLE PARTENZE NATURALI, per ciascuno dei
 * casi qui sopra. NON va «aggiornato» per far tornare il rosso: se cambia, la
 * proposta di chi non ha una seconda salita vincente non è più quella di prima.
 */
const MAIN_BEFORE: ReadonlyArray<{
  readonly fingerprint: string;
  readonly objectiveValue: number;
  readonly expectedOurTotal: number;
  readonly ourTotalVariance: number;
  readonly evaluated: number;
}> = [
  { fingerprint: "fc7010c5", objectiveValue: 0.6041666666666665, expectedOurTotal: 55.171875000000014, ourTotalVariance: 42.686604817705756, evaluated: 541 },
  { fingerprint: "1ec43a5b", objectiveValue: 1.3854166666666667, expectedOurTotal: 61.984375000000014, ourTotalVariance: 64.98673502603697, evaluated: 275 },
  { fingerprint: "d35b3773", objectiveValue: 0.07291666666666666, expectedOurTotal: 45.93229166666667, ourTotalVariance: 66.32093641493111, evaluated: 556 },
  { fingerprint: "5f032b2e", objectiveValue: 0.6562499999999998, expectedOurTotal: 54.817708333333336, ourTotalVariance: 44.33395724826096, evaluated: 337 },
  { fingerprint: "33adf0b1", objectiveValue: 0.125, expectedOurTotal: 49.671874999999986, ourTotalVariance: 45.045979817709394, evaluated: 311 },
  { fingerprint: "b2b0d7ed", objectiveValue: 0.8854166666666661, expectedOurTotal: 58.04166666666665, ourTotalVariance: 35.65451388888778, evaluated: 700 },
  { fingerprint: "28dbd4e2", objectiveValue: 0.010416666666666666, expectedOurTotal: 47.125000000000014, ourTotalVariance: 46.63020833333303, evaluated: 70 },
  { fingerprint: "d2c56236", objectiveValue: 0.6354166666666666, expectedOurTotal: 63.58333333333337, ourTotalVariance: 32.15451388887914, evaluated: 37 },
  { fingerprint: "992cb2b5", objectiveValue: 1.4166666666666665, expectedOurTotal: 67.29166666666667, ourTotalVariance: 53.18576388888869, evaluated: 135 },
  { fingerprint: "8e0566e8", objectiveValue: 1.1458333333333333, expectedOurTotal: 65.83333333333333, ourTotalVariance: 70.7326388888896, evaluated: 796 },
  { fingerprint: "b6c26223", objectiveValue: 2.604166666666667, expectedOurTotal: 71.79166666666666, ourTotalVariance: 58.664930555556566, evaluated: 650 },
  { fingerprint: "3fed891d", objectiveValue: 1.6666666666666659, expectedOurTotal: 64.18750000000001, ourTotalVariance: 87.85026041666697, evaluated: 1330 },
];

describe("due salite, un confronto", () => {
  it("con un livello 1 fuorviante la seconda salita parte dalla naturale, e il risultato non vale meno", () => {
    const squad = misleadingSquad();
    const proposal = proposeLineup(input(squad));
    expect(proposal.feasible).toBe(true);

    // LA PREMESSA: il livello 1 è davvero fuorviante. Le righe modali sono tutte
    // uguali, quindi sceglie per id: ha il portiere al 20 % e quasi tutti fragili.
    const level1 = proposal.pointForecast.lineup!;
    expect(level1.goalkeeperId).toBe("a_P");
    expect(level1.starterIds.filter((id) => id.startsWith("a_")).length).toBeGreaterThanOrEqual(8);

    // La seconda salita c'è stata, dalla naturale, e la prosa lo dice.
    expect(proposal.reason).toContain("seconda salita dalla naturale");

    // «MAI MENO DI PRIMA»: sugli stessi scenari la finale non vale meno della
    // partenza del livello 1 — e nemmeno meno del risultato di prima, che qui è
    // la prima salita: lo conferma il confronto sulle rose casuali.
    const prep = prepareGameweek(input(squad));
    const vFinal = valuate(prep, proposal.lineup!);
    const vLevel1 = valuate(prep, level1);
    expect(compareLineupValuations(vFinal, vLevel1)).toBeGreaterThan(0);
    expect(proposal.estimate.objectiveValue).toBeCloseTo(vFinal.objectiveValue, 12);
  });

  it("sulle rose casuali: mai meno di prima, e quando la seconda non vince la proposta è IDENTICA a quella di prima", () => {
    let secondRan = 0;
    let secondWon = 0;
    let identical = 0;
    DIFFERENTIAL_CASES.forEach((c, i) => {
      const before = MAIN_BEFORE[i]!;
      const proposal = proposeLineup(differentialRequest(c));
      expect(proposal.feasible).toBe(true);
      const cmp = compareLineupValuations(
        proposal.estimate,
        before as unknown as LineupValuation,
      );
      // 1) MAI MENO DI PRIMA, sul criterio della ricerca (obiettivo, totale, varianza).
      expect(cmp, `caso ${i}: l'obiettivo finale non deve scendere`).toBeGreaterThanOrEqual(0);

      const ran = proposal.reason.includes("seconda salita dalla naturale");
      const won = proposal.reason.includes("consegnata perché ha battuto strettamente la prima");
      if (ran) secondRan += 1;
      if (won) secondWon += 1;
      if (!won) {
        // 2) SE LA SECONDA NON VINCE, LA PROPOSTA È QUELLA DI PRIMA: formazione,
        // panchina, stima, conto di `evaluated`, all'ultimo bit.
        expect(proposalFingerprint(proposal), `caso ${i}: la proposta deve essere quella di prima`).toBe(
          before.fingerprint,
        );
        identical += 1;
        expect(proposal.evaluated).toBe(before.evaluated);
      } else {
        // 3) SE VINCE, VINCE STRETTAMENTE, e il conto è quello di prima più il
        // lavoro della seconda salita, dichiarato nella ragione.
        expect(cmp, `caso ${i}: la seconda vince solo se è strettamente migliore`).toBeGreaterThan(0);
        const extra = Number(/(\d+) valutazioni in più, comprese nel conto/.exec(proposal.reason)?.[1]);
        expect(proposal.evaluated).toBe(before.evaluated + extra);
      }
    });
    // Non è una prova vacua: la seconda salita gira davvero, a volte vince, e a
    // volte no.
    expect(secondRan).toBeGreaterThan(0);
    expect(secondWon).toBeGreaterThan(0);
    expect(identical).toBeGreaterThan(0);
  });

  it("la prosa dice sempre che cosa è successo della seconda salita", () => {
    for (const c of DIFFERENTIAL_CASES) {
      const { reason } = proposeLineup(differentialRequest(c));
      const said =
        reason.includes("salita unica") ||
        reason.includes("consegnata la prima") ||
        reason.includes("consegnata perché ha battuto strettamente la prima");
      expect(said, reason).toBe(true);
      // Nessuna frase sulle «0 naturali»: o la salita è unica, o c'è un numero vero.
      expect(reason).not.toMatch(/\b0 naturali/);
    }
  });

  it("quando la migliore naturale È la partenza del livello 1, la salita è una sola e lo dice", () => {
    // Rosa e vincoli in cui la naturale del modulo imposto coincide con la
    // formazione del livello 1 (stessi undici, stessa panchina): non c'è niente
    // da provare di nuovo.
    const squad = [
      fc("P1", "P", 1, 6.5, 6.5),
      fc("P2", "P", 1, 6, 3),
      fc("D1", "D", 0.5, 6.5, 6),
      fc("D2", "D", 0.5, 6.5, 6),
      fc("D3", "D", 0.5, 6.5, 6),
      fc("D4", "D", 1, 6.5, 6),
      fc("Db1", "D", 1, 6.5, 4.5),
      fc("C1", "C", 0.5, 6, 6),
      fc("C2", "C", 0.5, 6, 6),
      fc("C3", "C", 0.5, 6, 6),
      fc("C4", "C", 1, 6, 6),
      fc("Cb1", "C", 1, 6, 5),
      fc("A1", "A", 1, 6, 13),
      fc("A2", "A", 1, 6, 13),
    ];
    const proposal = proposeLineup(
      input(squad, {
        constraints: { lockedStarterIds: ["D1", "D2", "D3", "C1", "C2", "C3"], lockedModule: "442", locked: false },
      }),
    );
    expect(proposal.feasible).toBe(true);
    expect(proposal.reason).toContain("salita unica");
    expect(proposal.reason).not.toContain("seconda salita");
  });

  it("il risultato non vale MAI meno della formazione del livello 1, sugli stessi scenari", () => {
    DIFFERENTIAL_CASES.forEach((c) => {
      const request = differentialRequest(c);
      const proposal = proposeLineup(request);
      const prep = prepareGameweek(request);
      const vFinal = valuate(prep, proposal.lineup!);
      const vLevel1 = valuate(prep, proposal.pointForecast.lineup!);
      expect(compareLineupValuations(vFinal, vLevel1)).toBeGreaterThanOrEqual(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. I VINCOLI
// ─────────────────────────────────────────────────────────────────────────────

describe("le due salite rispettano i vincoli", () => {
  it("gli imposti sono titolari anche se la naturale li lascerebbe fuori", () => {
    const squad = misleadingSquad();
    // a_P (portiere al 20 %) e due fragili di movimento: la naturale libera li lascia in panchina.
    const locked = ["a_P", "a_D1", "a_C2"];
    const proposal = proposeLineup(input(squad, { constraints: { lockedStarterIds: locked, locked: false } }));
    expect(proposal.feasible).toBe(true);
    const fielded = new Set([proposal.lineup!.goalkeeperId, ...proposal.lineup!.starterIds]);
    for (const id of locked) expect(fielded.has(id)).toBe(true);
    expect(proposal.constraints.rejections).toEqual([]);
    // E la seconda salita c'è stata davvero, dalla naturale vincolata.
    expect(proposal.reason).toContain("seconda salita dalla naturale");
  });

  it("il modulo imposto resta quello, in entrambe le salite", () => {
    const squad = misleadingSquad();
    for (const module of ["442", "541"] as const satisfies readonly Module[]) {
      const proposal = proposeLineup(input(squad, { constraints: { lockedStarterIds: [], lockedModule: module, locked: false } }));
      expect(proposal.feasible).toBe(true);
      expect(proposal.lineup!.module).toBe(module);
      expect(proposal.reason).toMatch(/seconda salita|salita unica/);
    }
  });

  it("imposti e modulo insieme", () => {
    const squad = misleadingSquad();
    const locked = ["a_D1", "a_D2", "a_D3", "a_D4"];
    const proposal = proposeLineup(
      input(squad, { constraints: { lockedStarterIds: [...locked, "a_A1"], lockedModule: "442", locked: false } }),
    );
    expect(proposal.feasible).toBe(true);
    expect(proposal.lineup!.module).toBe("442");
    for (const id of [...locked, "a_A1"]) {
      expect([proposal.lineup!.goalkeeperId, ...proposal.lineup!.starterIds]).toContain(id);
    }
  });

  it("`locked: true` non cerca e non fa nessuna salita: la formazione data, con una sola valutazione", () => {
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
    expect(proposal.reason).not.toContain("salita");
    expect(proposal.reason).not.toContain("naturale");
  });
});

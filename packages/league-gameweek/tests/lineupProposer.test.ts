import { describe, it, expect } from "vitest";
import {
  DEFAULT_SEED,
  LEAGUE_POINTS,
  type GameweekContext,
  type Lineup,
  type PlayerForecast,
  type PlayerLine,
  type Role,
  bestLineupExPost,
  applySubstitutions,
  leaguePointsOf,
  lineupViolations,
  moduleShape,
  proposeLineup,
  simulateGameweek,
} from "../src/index.js";

// FIXTURE SINTETICHE. Identificatori costruiti (`D1`, `Drisky`…), voti scelti a
// mano sulla griglia dei mezzi punti, nessun dato reale, nessuna rete.
//
// Ogni test che tocca una regola cita la sezione di `docs/data/LEAGUE_RULES.md`
// che la contiene.

const fc = (
  id: string,
  role: Role,
  baseVote: number,
  fantasyScore: number = baseVote,
  voteProbability = 1,
  extra: { receivedAnyBonus?: boolean; missedPenalty?: boolean } = {},
): PlayerForecast => ({
  id,
  role,
  voteProbability,
  expected: { baseVote, fantasyScore, ...extra },
});

/** Le righe attese, come le costruisce il produttore: serve a `lineupViolations`. */
function expectedMap(...groups: readonly (readonly PlayerForecast[])[]): Map<string, PlayerLine> {
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
              receivedAnyBonus: f.expected.receivedAnyBonus === true,
              missedPenalty: f.expected.missedPenalty === true,
            }
          : { id: f.id, role: f.role, baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 },
      );
    }
  }
  return map;
}

/** Avversario piatto: 4-4-2, undici voti base 6.0, tutti certi di giocare. */
function opponentFlat(): PlayerForecast[] {
  const out = [fc("oP1", "P", 6)];
  for (let i = 1; i <= 4; i += 1) out.push(fc(`oD${i}`, "D", 6));
  for (let i = 1; i <= 4; i += 1) out.push(fc(`oC${i}`, "C", 6));
  for (let i = 1; i <= 2; i += 1) out.push(fc(`oA${i}`, "A", 6));
  return out;
}

const OPP_LINEUP: Lineup = {
  module: "442",
  goalkeeperId: "oP1",
  starterIds: ["oD1", "oD2", "oD3", "oD4", "oC1", "oC2", "oC3", "oC4", "oA1", "oA2"],
  benchIds: [],
};

const CONTEXT: GameweekContext = { matchday: 10, weAreHome: true };

// ─────────────────────────────────────────────────────────────────────────────
// 11. IL CASO CONCRETO PER PICO — scritto prima del codice, sul regolamento.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rosa piccola: 2P, 4D, 4C, 3A. Un solo giocatore incerto (D4, p = 0,5).
 * Avversario: 4-4-2 con undici voti base 6.0, tutti certi.
 */
function picoSquad(): PlayerForecast[] {
  return [
    fc("P1", "P", 6.5),
    fc("P2", "P", 6.0),
    fc("D1", "D", 6.5),
    fc("D2", "D", 6.5),
    fc("D3", "D", 6.5),
    fc("D4", "D", 6.5, 6.5, 0.5),
    fc("C1", "C", 6.0),
    fc("C2", "C", 6.0),
    fc("C3", "C", 6.0),
    fc("C4", "C", 6.0),
    fc("A1", "A", 6.5),
    fc("A2", "A", 6.5),
    fc("A3", "A", 5.5),
  ];
}

describe("il caso concreto", () => {
  it("caso concreto per Pico: i numeri della proposta si rifanno a mano", () => {
    // IL CONTO A MANO, PRIMA DEL CODICE.
    // Contesto: giornata 10, in casa. §14 -> +2 a noi (il fattore campo sparisce
    // dalla 29ª, quindi qui c'è).
    //
    // ── SCENARIO A — D4 gioca (probabilità 0,5). Modulo 4-4-2, portiere P1.
    // NOI  punteggi individuali: P1 6,5 + D1..D4 4×6,5 = 26 + C1..C4 4×6,0 = 24
    //      + A1,A2 2×6,5 = 13  ->  playersTotal = 69,5
    //      §19 difesa: media (6,5 + 6,5 + 6,5 + 6,5)/4 = 6,5, fascia [6,5;7,0) -> +3
    //      §20 centrocampo: 24 contro 24, differenza 0 < 2,0 -> 0
    //      §21 attacco: A1 voto base 6,5 -> +0,5 ; A2 6,5 -> +0,5  =>  +1
    //      §9  modulo: il loro 4-4-2 regala 0 a noi
    //      §14 campo: +2
    //      TOTALE 69,5 + 3 + 0 + 1 + 0 + 2 = 75,5
    // LORO playersTotal 11×6 = 66 ; §19 media 6,0 -> +1 ; §20 0 ; §21 due 6,0 -> 0
    //      §9 il nostro 4-4-2 regala 0 ; §14 0  ->  TOTALE 67
    // §15  75,5 -> 1 + floor(9,5/6) = 2 ;  67 -> 1 + floor(1/6) = 1  =>  2-1
    // §22  vittoria -> 3 punti
    //
    // ── SCENARIO B — D4 non gioca (probabilità 0,5).
    // D4 è un senza voto puro: §13 `sv_clean: must_be_replaced`. In panchina ci
    // sono P2 e A3, nessun difensore: resta SCOPERTO, e §13
    // `office_reserve: prohibited` dice che non esiste punteggio d'ufficio ->
    // vale 0, si gioca in dieci.
    // NOI  playersTotal = 6,5 + (6,5+6,5+6,5) + 0 + 24 + 13 = 63,0
    //      §19 difesa: solo 3 difensori con voto valido, ne servono 4 -> NON si
    //          applica -> 0 (è la soglia che rende non lineare il 4º difensore)
    //      §20 0 ; §21 +1 ; §9 0 ; §14 +2
    //      TOTALE 63 + 0 + 0 + 1 + 0 + 2 = 66,0
    // LORO 67 (nulla di loro è cambiato)
    // §15  66 -> 1 + floor(0/6) = 1 ; 67 -> 1 ; stessa fascia ma distacco 1,0 < 4
    //      -> nessun goal aggiuntivo  =>  1-1
    // §22  pareggio -> 1 punto
    //
    // ── ATTESI (k = 1 incerto -> 2 scenari ESATTI, pesi 0,5 e 0,5)
    // punti di lega attesi = 0,5·3 + 0,5·1 = 2,0
    // punteggio nostro atteso = 0,5·75,5 + 0,5·66,0 = 70,75
    // vittoria 0,5 / pareggio 0,5 / sconfitta 0
    //
    // ── LE ALTERNATIVE, tutte calcolate a mano e tutte peggiori:
    // 4-3-3 (D1-D4, C2C3C4, A1A2A3): A 75 contro 68 -> 2-1 (3) ; B 65,5 contro 68
    //       -> 0-1 (0) ; atteso 1,5
    // 3-4-3 (D1D2D3, C1-C4, A1A2A3): A = B, 71,5 contro 68,5 -> 1-1 (1) ; atteso 1,0
    // portiere P2 al posto di P1: A 73 contro 67 (3) ; B 65,5 contro 67 (0) ; atteso 1,5
    // A3 al posto di A2:          A 74 contro 67 (3) ; B 64,5 contro 67 (0) ; atteso 1,5
    const squad = picoSquad();
    const opponent = opponentFlat();
    const proposal = proposeLineup({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponent },
      context: CONTEXT,
    });

    expect(proposal.feasible).toBe(true);
    expect(proposal.lineup).toEqual({
      module: "442",
      goalkeeperId: "P1",
      starterIds: ["D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A1", "A2"],
      benchIds: ["P2", "A3"],
    });

    // ── Scenario A, numero per numero.
    const point = proposal.pointForecast.outcome!;
    expect(point.ours.playersTotal).toBe(69.5);
    expect(point.ours.defence).toBe(3); // §19
    expect(point.ours.midfield).toBe(0); // §20
    expect(point.ours.attack).toBe(1); // §21
    expect(point.ours.moduleFromOpponent).toBe(0); // §9
    expect(point.ours.homeField).toBe(2); // §14
    expect(point.ours.total).toBe(75.5);
    expect(point.theirs.playersTotal).toBe(66);
    expect(point.theirs.defence).toBe(1);
    expect(point.theirs.midfield).toBe(0);
    expect(point.theirs.attack).toBe(0);
    expect(point.theirs.moduleFromOpponent).toBe(0);
    expect(point.theirs.homeField).toBe(0);
    expect(point.theirs.total).toBe(67);
    expect([point.ourGoals, point.theirGoals]).toEqual([2, 1]); // §15
    expect(leaguePointsOf(point, LEAGUE_POINTS).value).toBe(3); // §22
    expect(point.resolved).toBe(true);
    expect(point.fullyTabulated).toBe(true);

    // ── Scenario B, rifatto qui a mano con il simulatore.
    const players = expectedMap(squad, opponent);
    players.set("D4", { id: "D4", role: "D", baseVote: null, fantasyScore: null, cards: "none", otherBonusMalus: 0 });
    const scenarioB = simulateGameweek({
      ourLineup: proposal.lineup!,
      theirLineup: OPP_LINEUP,
      players,
      context: CONTEXT,
    });
    expect(scenarioB.ours.resolution.substitutions).toEqual([]); // nessun difensore in panchina
    expect(scenarioB.ours.resolution.uncoveredIds).toEqual(["D4"]); // §13 office_reserve: prohibited
    expect(scenarioB.ours.playersTotal).toBe(63);
    expect(scenarioB.ours.defence).toBe(0); // §19: 3 difensori con voto, ne servono 4
    expect(scenarioB.ours.midfield).toBe(0);
    expect(scenarioB.ours.attack).toBe(1);
    expect(scenarioB.ours.moduleFromOpponent).toBe(0);
    expect(scenarioB.ours.homeField).toBe(2);
    expect(scenarioB.ours.total).toBe(66);
    expect(scenarioB.theirs.total).toBe(67);
    expect([scenarioB.ourGoals, scenarioB.theirGoals]).toEqual([1, 1]); // §15
    expect(leaguePointsOf(scenarioB, LEAGUE_POINTS).value).toBe(1); // §22
    expect(scenarioB.resolved).toBe(true); // scoperto non vuol dire irrisolto

    // ── E gli attesi della proposta.
    expect(proposal.estimate.method).toBe("exact");
    expect(proposal.estimate.scenarios).toBe(2);
    expect(proposal.estimate.seed).toBeNull();
    expect(proposal.estimate.expectedLeaguePoints).toBeCloseTo(2.0, 12);
    expect(proposal.estimate.expectedOurTotal).toBeCloseTo(70.75, 12);
    expect(proposal.estimate.winProbability).toBeCloseTo(0.5, 12);
    expect(proposal.estimate.drawProbability).toBeCloseTo(0.5, 12);
    expect(proposal.estimate.lossProbability).toBeCloseTo(0, 12);
    expect(proposal.estimate.fullyTabulated).toBe(true);
    expect(proposal.estimate.allResolved).toBe(true);
    // 0,5·75,5 + 0,5·66 è esattamente la media dei due scenari simulati.
    expect(proposal.estimate.expectedOurTotal).toBeCloseTo(
      0.5 * point.ours.total + 0.5 * scenarioB.ours.total,
      12,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. LEGALITÀ
// ─────────────────────────────────────────────────────────────────────────────

/** Rosa 3/9/9/7 completa — l'invariante di §2. */
function fullRoster(uncertain: Readonly<Record<string, number>> = {}): PlayerForecast[] {
  const out: PlayerForecast[] = [];
  const add = (prefix: string, role: Role, n: number): void => {
    for (let i = 1; i <= n; i += 1) {
      const id = `${prefix}${i}`;
      const base = 5 + 0.5 * ((i - 1) % 5); // 5 / 5,5 / 6 / 6,5 / 7 — tutti sulla griglia
      const score = base + ((i % 3) - 1); // punteggio individuale scorrelato dal voto base
      out.push(fc(id, role, base, score, uncertain[id] ?? 1));
    }
  };
  add("P", "P", 3);
  add("D", "D", 9);
  add("C", "C", 9);
  add("A", "A", 7);
  return out;
}

function smallSquad(): PlayerForecast[] {
  return [
    fc("P1", "P", 6),
    fc("P2", "P", 6, 5),
    fc("D1", "D", 6),
    fc("D2", "D", 6.5),
    fc("D3", "D", 6),
    fc("D4", "D", 6.5, 6.5, 0.7),
    fc("C1", "C", 6),
    fc("C2", "C", 6.5),
    fc("C3", "C", 6),
    fc("C4", "C", 5.5),
    fc("A1", "A", 7),
    fc("A2", "A", 6.5),
    fc("A3", "A", 5.5, 5.5, 0.2),
  ];
}

describe("legalità della proposta", () => {
  const campionario: ReadonlyArray<readonly [string, PlayerForecast[]]> = [
    ["rosa piccola con due incerti", smallSquad()],
    ["rosa 3/9/9/7 completa (§2), tutti certi", fullRoster()],
    ["rosa 3/9/9/7 con tre incerti e due indisponibili", fullRoster({ D1: 0.4, C2: 0.6, A3: 0.5, D9: 0, C9: 0 })],
    ["rosa del caso concreto", picoSquad()],
    ["rosa con panchina lunga in un solo ruolo", benchOrderSquad()],
  ];

  for (const [nome, squad] of campionario) {
    it(`${nome}: la proposta è legale, completa e senza ripetizioni`, () => {
      const opponent = opponentFlat();
      const proposal = proposeLineup({
        squad,
        opponent: { lineup: OPP_LINEUP, players: opponent },
        context: CONTEXT,
      });
      expect(proposal.feasible).toBe(true);
      const lineup = proposal.lineup!;
      const players = expectedMap(squad, opponent);

      // Nessuna violazione: numeri per ruolo, un portiere solo, nessun doppione.
      expect(lineupViolations(lineup, players)).toEqual([]);

      // §9: un portiere più dieci di movimento coerenti con il modulo.
      const shape = moduleShape(lineup.module);
      expect(players.get(lineup.goalkeeperId)!.role).toBe("P");
      const counts = { D: 0, C: 0, A: 0, P: 0 } as Record<Role, number>;
      for (const id of lineup.starterIds) counts[players.get(id)!.role] += 1;
      expect(counts).toEqual({ P: 0, D: shape.defenders, C: shape.midfielders, A: shape.strikers });
      expect(lineup.starterIds).toHaveLength(10);

      // §10 `bench: FREE`: in panchina TUTTI gli altri, una volta sola.
      const inLineup = [lineup.goalkeeperId, ...lineup.starterIds, ...lineup.benchIds];
      expect(new Set(inLineup).size).toBe(inLineup.length); // nessun id ripetuto
      expect([...inLineup].sort()).toEqual(squad.map((f) => f.id).sort());
      expect(lineup.benchIds).toHaveLength(squad.length - 11);
    });
  }

  it("dichiara non proponibile una rosa che non consente nessun modulo completo", () => {
    // Nessun attaccante: nessuno dei sette moduli è schierabile.
    const monca = smallSquad().filter((f) => f.role !== "A");
    const proposal = proposeLineup({
      squad: monca,
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
    });
    expect(proposal.feasible).toBe(false);
    expect(proposal.lineup).toBeNull();
    expect(proposal.pointForecast.lineup).toBeNull();
    expect(proposal.reason).toMatch(/insufficienti/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. VINCOLO G — la griglia dei voti
// ─────────────────────────────────────────────────────────────────────────────

describe("vincolo G — il voto atteso sta sulla griglia dei mezzi punti", () => {
  it("un baseVote 6,3 si rifiuta, 6,5 no (§20 e §21 tabulano a passi di 0,5 e vietano di interpolare)", () => {
    const con = (baseVote: number): PlayerForecast[] =>
      smallSquad().map((f) => (f.id === "D1" ? fc("D1", "D", baseVote) : f));
    const call = (baseVote: number) =>
      proposeLineup({
        squad: con(baseVote),
        opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
        context: CONTEXT,
      });
    expect(() => call(6.3)).toThrow(/griglia dei voti/);
    expect(() => call(6.3)).toThrow(/D1/);
    expect(() => call(6.5)).not.toThrow();
    // Vale anche per la rosa avversaria: un 6,37 lì produce lo stesso danno.
    expect(() =>
      proposeLineup({
        squad: smallSquad(),
        opponent: {
          lineup: OPP_LINEUP,
          players: opponentFlat().map((f) => (f.id === "oC1" ? fc("oC1", "C", 6.37) : f)),
        },
        context: CONTEXT,
      }),
    ).toThrow(/griglia dei voti/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. VALIDAZIONI
// ─────────────────────────────────────────────────────────────────────────────

describe("validazioni fail-closed", () => {
  const base = () => ({ lineup: OPP_LINEUP, players: opponentFlat() });

  it("rifiuta una probabilità fuori da [0,1]", () => {
    const squad = smallSquad().map((f) => (f.id === "C1" ? fc("C1", "C", 6, 6, 1.4) : f));
    expect(() => proposeLineup({ squad, opponent: base(), context: CONTEXT })).toThrow(/voteProbability/);
    const negativa = smallSquad().map((f) => (f.id === "C1" ? fc("C1", "C", 6, 6, -0.1) : f));
    expect(() => proposeLineup({ squad: negativa, opponent: base(), context: CONTEXT })).toThrow(/voteProbability/);
  });

  it("rifiuta un id duplicato nella rosa", () => {
    const squad = [...smallSquad(), fc("D1", "D", 6)];
    expect(() => proposeLineup({ squad, opponent: base(), context: CONTEXT })).toThrow(/id duplicato D1/);
  });

  it("rifiuta un id condiviso fra le due rose: un giocatore non gioca contro se stesso", () => {
    const opponent = { lineup: OPP_LINEUP, players: [...opponentFlat(), fc("D1", "D", 6)] };
    expect(() => proposeLineup({ squad: smallSquad(), opponent, context: CONTEXT })).toThrow(
      /id condivisi fra le due rose: D1/,
    );
  });

  it("rifiuta una formazione avversaria illegale ed elenca le violazioni (§9)", () => {
    const storta: Lineup = {
      ...OPP_LINEUP,
      starterIds: ["oD1", "oD2", "oD3", "oC1", "oC2", "oC3", "oC4", "oA1", "oA2", "oA2"],
    };
    let message = "";
    try {
      proposeLineup({
        squad: smallSquad(),
        opponent: { lineup: storta, players: opponentFlat() },
        context: CONTEXT,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/formazione avversaria assunta non è legale/);
    expect(message).toMatch(/difensori: 3/);
    expect(message).toMatch(/due volte: oA2/);
  });

  it("rifiuta un fantasyScore non finito", () => {
    const squad = smallSquad().map((f) => (f.id === "A1" ? fc("A1", "A", 7, Number.NaN) : f));
    expect(() => proposeLineup({ squad, opponent: base(), context: CONTEXT })).toThrow(/fantasyScore non finito/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4-5. DETERMINISMO, ESATTO E CAMPIONATO
// ─────────────────────────────────────────────────────────────────────────────

/** Rosa con dieci incerti: 2^10 = 1024 scenari, sopra un budget piccolo. */
function uncertainSquad(): PlayerForecast[] {
  return [
    fc("P1", "P", 6),
    fc("P2", "P", 6, 5),
    fc("D1", "D", 6, 6, 0.5),
    fc("D2", "D", 6.5, 6.5, 0.5),
    fc("D3", "D", 6, 6, 0.5),
    fc("D4", "D", 6.5, 6.5, 0.5),
    fc("D5", "D", 5.5, 5.5),
    fc("C1", "C", 6, 6, 0.5),
    fc("C2", "C", 6.5, 6.5, 0.5),
    fc("C3", "C", 6, 6, 0.5),
    fc("C4", "C", 6, 6, 0.5),
    fc("C5", "C", 5.5, 5.5),
    fc("A1", "A", 7, 7, 0.5),
    fc("A2", "A", 6.5, 6.5, 0.5),
    fc("A3", "A", 5.5, 5.5),
  ];
}

describe("determinismo e modalità di stima", () => {
  it("due chiamate identiche danno risultati identici, in modalità esatta e campionata", () => {
    const esatta = () =>
      proposeLineup({
        squad: picoSquad(),
        opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
        context: CONTEXT,
      });
    expect(esatta()).toEqual(esatta());

    const campionata = () =>
      proposeLineup({
        squad: uncertainSquad(),
        opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
        context: CONTEXT,
        scenarioBudget: 64,
      });
    expect(campionata()).toEqual(campionata());
  });

  it("un seme diverso può cambiare la proposta, ma non la sua legalità", () => {
    const opponent = opponentFlat();
    const squad = uncertainSquad();
    const players = expectedMap(squad, opponent);
    const conSeme = (seed: number) =>
      proposeLineup({
        squad,
        opponent: { lineup: OPP_LINEUP, players: opponent },
        context: CONTEXT,
        scenarioBudget: 64,
        seed,
      });
    const a = conSeme(1);
    const b = conSeme(2);
    expect(a.estimate.seed).toBe(1);
    expect(b.estimate.seed).toBe(2);
    expect(lineupViolations(a.lineup!, players)).toEqual([]);
    expect(lineupViolations(b.lineup!, players)).toEqual([]);
  });

  it("enumera esattamente quando 2^k sta nel budget, e i pesi sommano a 1", () => {
    const squad = smallSquad(); // due incerti: D4 e A3 -> 4 scenari
    const proposal = proposeLineup({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
    });
    expect(proposal.estimate.method).toBe("exact");
    expect(proposal.estimate.scenarios).toBe(4);
    expect(proposal.estimate.seed).toBeNull();
    const somma =
      proposal.estimate.winProbability + proposal.estimate.drawProbability + proposal.estimate.lossProbability;
    expect(Math.abs(somma - 1)).toBeLessThan(1e-12);
  });

  it("campiona quando 2^k eccede il budget, con esattamente `scenarioBudget` scenari", () => {
    const proposal = proposeLineup({
      squad: uncertainSquad(), // dieci incerti -> 1024 scenari
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
      scenarioBudget: 32,
    });
    expect(proposal.estimate.method).toBe("sampled");
    expect(proposal.estimate.scenarios).toBe(32);
    expect(proposal.estimate.seed).toBe(DEFAULT_SEED);
    const somma =
      proposal.estimate.winProbability + proposal.estimate.drawProbability + proposal.estimate.lossProbability;
    expect(Math.abs(somma - 1)).toBeLessThan(1e-12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. NESSUNA INCERTEZZA
// ─────────────────────────────────────────────────────────────────────────────

describe("senza incertezza il produttore ricade sull'ottimizzatore esatto", () => {
  it("con tutti i p = 1 la stima coincide con la previsione puntuale e la formazione con bestLineupExPost", () => {
    const squad = picoSquad().map((f) => (f.id === "D4" ? fc("D4", "D", 6.5) : f));
    const opponent = opponentFlat();
    const players = expectedMap(squad, opponent);
    const proposal = proposeLineup({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponent },
      context: CONTEXT,
    });

    expect(proposal.estimate.method).toBe("exact");
    expect(proposal.estimate.scenarios).toBe(1); // un solo scenario: nessuna incertezza
    expect(proposal.estimate.seed).toBeNull();
    const point = proposal.pointForecast.outcome!;
    expect(proposal.estimate.expectedOurTotal).toBe(point.ours.total);
    expect(proposal.estimate.expectedLeaguePoints).toBe(leaguePointsOf(point, LEAGUE_POINTS).value); // §22

    const best = bestLineupExPost({
      squad: squad.map((f) => players.get(f.id)!),
      theirLineup: OPP_LINEUP,
      players,
      context: CONTEXT,
    });
    expect(proposal.lineup!.module).toBe(best.lineup!.module);
    expect(proposal.lineup!.goalkeeperId).toBe(best.lineup!.goalkeeperId);
    // Gli undici sono gli stessi; l'ORDINE dei titolari e la panchina seguono le
    // regole dichiarate in testa a `lineupProposer.ts`, che a voti noti non
    // muovono un solo punto perché nessun titolare è senza voto.
    expect([...proposal.lineup!.starterIds].sort()).toEqual([...best.lineup!.starterIds].sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. IL MODULO NON SI SCEGLIE MASSIMIZZANDO IL NOSTRO PUNTEGGIO
// ─────────────────────────────────────────────────────────────────────────────

describe("il modulo si sceglie sul risultato, non sul nostro totale (§9)", () => {
  it("il 3-4-3 dà mezzo punto in più a noi e 1,5 all'avversario: la proposta sceglie il 4-4-2", () => {
    // Stessa fixture del test omologo di `lineupOptimizer.test.ts`, portata al
    // produttore ex-ante con tutte le probabilità a 1.
    //   4-4-2 -> noi 70, loro 65,5  =>  1-0 vittoria
    //   3-4-3 -> noi 70,5, loro 67  =>  1-1 pareggio
    const squad: PlayerForecast[] = [
      fc("P1", "P", 5),
      fc("D1", "D", 5),
      fc("D2", "D", 5),
      fc("D3", "D", 5),
      fc("D4", "D", 5),
      fc("C1", "C", 6),
      fc("C2", "C", 6),
      fc("C3", "C", 6),
      fc("C4", "C", 6),
      fc("A1", "A", 8),
      fc("A2", "A", 7.5),
      fc("A3", "A", 5.5),
    ];
    // Un attaccante avversario da 4,5 porta il loro totale a 65,5, appena sotto
    // la soglia del primo goal (§15): è lì che 1,5 punti regalati diventano un
    // risultato diverso.
    const opponent = opponentFlat().map((f) => (f.id === "oA2" ? fc("oA2", "A", 4.5) : f));
    const players = expectedMap(squad, opponent);

    const out442 = simulateGameweek({
      ourLineup: {
        module: "442",
        goalkeeperId: "P1",
        starterIds: ["D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A1", "A2"],
        benchIds: ["A3"],
      },
      theirLineup: OPP_LINEUP,
      players,
      context: CONTEXT,
    });
    const out343 = simulateGameweek({
      ourLineup: {
        module: "343",
        goalkeeperId: "P1",
        starterIds: ["D1", "D2", "D3", "C1", "C2", "C3", "C4", "A1", "A2", "A3"],
        benchIds: ["D4"],
      },
      theirLineup: OPP_LINEUP,
      players,
      context: CONTEXT,
    });
    // Le premesse, verificate e non assunte.
    expect(out343.ours.total).toBeGreaterThan(out442.ours.total);
    expect([out442.ourGoals, out442.theirGoals]).toEqual([1, 0]);
    expect([out343.ourGoals, out343.theirGoals]).toEqual([1, 1]);
    expect(out343.theirs.moduleFromOpponent).toBe(1.5); // §9 module_modifier_target: OPPONENT

    const proposal = proposeLineup({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponent },
      context: CONTEXT,
    });
    expect(proposal.lineup!.module).toBe("442");
    expect(proposal.estimate.expectedLeaguePoints).toBe(LEAGUE_POINTS.win);
    expect(proposal.estimate.expectedOurTotal).toBeLessThan(out343.ours.total);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. DISPONIBILITÀ
// ─────────────────────────────────────────────────────────────────────────────

/** Rosa del caso «copertura di pari valore»: 2P, 6D, 4C, 2A. */
function coverSquad(): PlayerForecast[] {
  return [
    fc("P1", "P", 6, 6),
    fc("P2", "P", 6, 5),
    fc("D1", "D", 6, 6),
    fc("D2", "D", 6, 6),
    fc("D3", "D", 6, 6),
    fc("Dsure", "D", 6, 6),
    fc("Drisky", "D", 6, 6, 0.3),
    fc("Dweak", "D", 6, 4),
    fc("C1", "C", 6, 7),
    fc("C2", "C", 6, 7),
    fc("C3", "C", 6, 7),
    fc("C4", "C", 6, 7),
    fc("A1", "A", 6, 12, 1, { receivedAnyBonus: true }),
    fc("A2", "A", 6, 12, 1, { receivedAnyBonus: true }),
  ];
}

describe("disponibilità e sostituzioni", () => {
  it("con una copertura di pari valore la disponibilità NON decide: le due formazioni valgono ESATTAMENTE lo stesso", () => {
    // IL CONTO A MANO CHE SMENTISCE L'INTUIZIONE.
    // Due difensori con lo stesso punteggio atteso, uno certo (Dsure, p = 1) e
    // uno incerto (Drisky, p = 0,3), e in panchina l'altro dei due. Chiamiamo
    // X la formazione che schiera Dsure e Y quella che schiera Drisky.
    //   scenario «Drisky gioca» (0,3): X ha in campo Dsure 6 ; Y ha Drisky 6.
    //   scenario «Drisky assente» (0,7): in X non serve nessuna sostituzione
    //     (Drisky è in panchina); in Y Drisky è SV puro (§13) e §10
    //     `same_role_only` fa entrare Dsure, che vale esattamente 6.
    // In ENTRAMBI gli scenari le due formazioni schierano quattro difensori da
    // 6: atteso identico, differenza 0. La disponibilità è GRATIS finché §10
    // offre una copertura dello stesso valore — è il tetto di 5 sostituzioni,
    // non la probabilità, a renderla cara.
    const squad = coverSquad();
    const opponent = opponentFlat();
    const giocanti = expectedMap(squad, opponent);
    const assenti = expectedMap(squad, opponent);
    assenti.set("Drisky", {
      id: "Drisky",
      role: "D",
      baseVote: null,
      fantasyScore: null,
      cards: "none",
      otherBonusMalus: 0,
    });

    const X: Lineup = {
      module: "442",
      goalkeeperId: "P1",
      starterIds: ["D1", "D2", "D3", "Dsure", "C1", "C2", "C3", "C4", "A1", "A2"],
      benchIds: ["Drisky", "P2", "Dweak"],
    };
    const Y: Lineup = {
      module: "442",
      goalkeeperId: "P1",
      starterIds: ["D1", "D2", "D3", "Drisky", "C1", "C2", "C3", "C4", "A1", "A2"],
      benchIds: ["Dsure", "P2", "Dweak"],
    };
    for (const players of [giocanti, assenti]) {
      const ax = simulateGameweek({ ourLineup: X, theirLineup: OPP_LINEUP, players, context: CONTEXT });
      const ay = simulateGameweek({ ourLineup: Y, theirLineup: OPP_LINEUP, players, context: CONTEXT });
      expect(ay.ours.playersTotal).toBe(ax.ours.playersTotal);
      expect(ay.ours.defence).toBe(ax.ours.defence); // §19: quattro difensori con voto in tutti i casi
      expect(ay.ours.total).toBe(ax.ours.total);
      expect([ay.ourGoals, ay.theirGoals]).toEqual([ax.ourGoals, ax.theirGoals]);
    }
    // In Y, con Drisky assente, entra davvero Dsure: §10 max_substitutions 5,
    // same_role_only true.
    const sostituzioni = applySubstitutions(Y, assenti);
    expect(sostituzioni.substitutions).toEqual([{ outId: "Drisky", inId: "Dsure", role: "D" }]);

    // E adesso che cosa propone davvero il produttore su questa rosa.
    const proposal = proposeLineup({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponent },
      context: CONTEXT,
    });
    expect(proposal.lineup!.module).toBe("442");
    // E QUI STA IL PUNTO, contro l'intuizione: a parità completa NON vince il
    // giocatore certo. I due sono equivalenti fino all'ultimo decimale, quindi
    // nessun criterio di §22 li separa, e a decidere è la rottura deterministica
    // del pareggio sulla stringa dei titolari ("Drisky" < "Dsure"). Schierare
    // l'incerto NON è un errore: costa esattamente zero, perché §10 offre una
    // copertura dello stesso valore. Chi si aspettasse «preferisce il p = 1»
    // starebbe attribuendo alla disponibilità un peso che il regolamento, con la
    // panchina libera e la sostituzione di ruolo, non le dà.
    expect(proposal.lineup!.starterIds).toContain("Drisky");
    expect(proposal.lineup!.starterIds).not.toContain("Dsure");
    // Il gemello che resta fuori va in panchina DAVANTI all'alternativa
    // peggiore: §10 `bench: FREE`, ordine per punteggio atteso decrescente.
    expect(proposal.lineup!.benchIds).toEqual(["Dsure", "P2", "Dweak"]);
    expect(proposal.lineup!.benchIds.indexOf("Dsure")).toBeLessThan(
      proposal.lineup!.benchIds.indexOf("Dweak"),
    );
  });

  it("quando la copertura è PEGGIORE la disponibilità decide, e decide di rischiare", () => {
    // IL CONTO A MANO. Rosa con cinque difensori: D1, D2, Dsure a 6/7 certi,
    // Drisky 6/7 con p = 0,3, Dweak 6/5 certo. Il 4-4-2 ne schiera quattro.
    //   X = schiera Drisky, in panchina Dweak:
    //     Drisky gioca (0,3): difensori 7+7+7+7 = 28, §19 media 6,0 -> +1
    //     Drisky assente (0,7): §13 SV puro, §10 fa entrare Dweak: 7+7+7+5 = 26,
    //       quattro difensori con voto -> §19 ancora +1
    //     atteso difensori+difesa = 0,3·29 + 0,7·27 = 8,7 + 18,9 = 27,6
    //   Y = schiera Dweak, in panchina Drisky (che non entra mai, perché nessun
    //       titolare è senza voto): 26 + 1 = 27 in entrambi gli scenari.
    //   Differenza 0,6 = p·(voto atteso di Drisky − voto atteso di Dweak)
    //                  = 0,3·(7 − 5). X vince.
    // Il resto della squadra è identico, quindi la differenza sui totali è la
    // stessa: X 0,3·73 + 0,7·71 = 71,6 ; Y 71,0.
    const squad: PlayerForecast[] = [
      fc("P1", "P", 6, 6),
      fc("P2", "P", 6, 5),
      fc("D1", "D", 6, 7),
      fc("D2", "D", 6, 7),
      fc("Dsure", "D", 6, 7),
      fc("Drisky", "D", 6, 7, 0.3),
      fc("Dweak", "D", 6, 5),
      fc("C1", "C", 6, 6),
      fc("C2", "C", 6, 6),
      fc("C3", "C", 6, 6),
      fc("C4", "C", 6, 6),
      fc("A1", "A", 6, 6),
      fc("A2", "A", 6, 6),
    ];
    const opponent = opponentFlat();
    const proposal = proposeLineup({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponent },
      context: CONTEXT,
    });
    expect(proposal.lineup!.module).toBe("442");
    expect(proposal.lineup!.starterIds).toContain("Drisky");
    expect(proposal.lineup!.starterIds).not.toContain("Dweak");
    expect(proposal.lineup!.benchIds).toEqual(["Dweak", "P2"]);
    expect(proposal.pointForecast.outcome!.ours.total).toBe(73);
    expect(proposal.estimate.expectedOurTotal).toBeCloseTo(71.6, 12);
    expect(proposal.estimate.expectedLeaguePoints).toBeCloseTo(LEAGUE_POINTS.win, 12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. ORDINE DELLA PANCHINA
// ─────────────────────────────────────────────────────────────────────────────

/** 3P, 4D, 5C, 2A: la panchina porta pareggi da rompere con p e poi con l'id. */
function benchOrderSquad(): PlayerForecast[] {
  return [
    fc("P1", "P", 6, 7),
    fc("P2", "P", 6, 5),
    fc("P3", "P", 6, 5, 0.4),
    fc("D1", "D", 6, 6),
    fc("D2", "D", 6, 6),
    fc("D3", "D", 6, 6),
    fc("D4", "D", 6, 6),
    fc("C1", "C", 6, 7),
    fc("C2", "C", 6, 7),
    fc("C3", "C", 6, 7),
    fc("C4", "C", 6, 7),
    fc("C5", "C", 6, 5),
    fc("A1", "A", 6, 12, 1, { receivedAnyBonus: true }),
    fc("A2", "A", 6, 12, 1, { receivedAnyBonus: true }),
  ];
}

describe("ordine della panchina (§10 `bench: FREE`, criterio dichiarato dal produttore)", () => {
  it("punteggio atteso decrescente, poi probabilità decrescente, poi id crescente — riserve dei portieri comprese", () => {
    // Non titolari: P2 (5,0 / p 1), P3 (5,0 / p 0,4), C5 (5,0 / p 1).
    // Stesso punteggio atteso: rompe la probabilità (P3 va in fondo), poi l'id
    // fra i due certi ("C5" < "P2").
    const proposal = proposeLineup({
      squad: benchOrderSquad(),
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
    });
    expect(proposal.lineup!.module).toBe("442");
    expect(proposal.lineup!.goalkeeperId).toBe("P1");
    expect(proposal.lineup!.benchIds).toEqual(["C5", "P2", "P3"]);
    // §13: «il portiere non ha una regola propria» — le riserve stanno in
    // panchina come tutti gli altri e il simulatore le fa entrare allo stesso modo.
    expect(proposal.lineup!.benchIds).toContain("P2");
    expect(proposal.lineup!.benchIds).toContain("P3");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. IL TETTO DELLE SOSTITUZIONI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 2P, 8D, 8C, 2A: sei titolari incerti e panchina abbondante nei due ruoli.
 *
 * PERCHÉ p = 0,8 E NON p = 0,5. Con quattro incerti nello stesso ruolo,
 * schierarne tre e tenere il quarto in panchina NON è la stessa cosa:
 * l'incerto in panchina può ancora ENTRARE per uno degli altri tre (§10
 * `same_role_only`), e vale più del rimpiazzo certo. Il conto, con quattro
 * incerti di punteggio atteso `u` e rimpiazzi certi da `b`:
 *   E(schierarli tutti e quattro) − E(schierarne tre) = p·(3p − 2)·(u − b),
 * che è positivo solo per p > 2/3. A p = 0,5 il produttore — correttamente —
 * mette uno degli incerti in panchina, e i titolari incerti diventano cinque.
 * A p = 0,8 restano sei, che è la premessa di questo test.
 *
 * PERCHÉ GLI ATTACCANTI VALGONO 15. Con attaccanti da 12 la squadra, nello
 * scenario «tutti e sei assenti», chiude 66 contro 67 e PAREGGIA: quello
 * scenario da 0,2^6 costa 0,000128 punti di lega attesi, e il produttore —
 * correttamente, perché i punti di lega sono il primo criterio di §22 — sposta
 * un incerto in panchina proprio per evitarlo. Portando l'attacco a 15 lo
 * scenario peggiore resta una vittoria (72 contro 67), i punti attesi pareggiano
 * fra le due formazioni e decide il criterio 2 (punteggio totale atteso), che
 * tiene i sei incerti in campo. È il test del TETTO, non del rifiuto del rischio:
 * il rifiuto del rischio ha già un suo test più su.
 */
function capSquad(): PlayerForecast[] {
  const out: PlayerForecast[] = [fc("P1", "P", 6, 6), fc("P2", "P", 6, 5)];
  for (let i = 1; i <= 4; i += 1) out.push(fc(`D${i}`, "D", 6, 8, 0.8));
  for (let i = 5; i <= 8; i += 1) out.push(fc(`D${i}`, "D", 6, 4));
  for (let i = 1; i <= 2; i += 1) out.push(fc(`C${i}`, "C", 6, 8, 0.8));
  for (let i = 3; i <= 4; i += 1) out.push(fc(`C${i}`, "C", 6, 7));
  for (let i = 5; i <= 8; i += 1) out.push(fc(`C${i}`, "C", 6, 4));
  out.push(fc("A1", "A", 6, 15, 1, { receivedAnyBonus: true }));
  out.push(fc("A2", "A", 6, 15, 1, { receivedAnyBonus: true }));
  return out;
}

describe("tetto delle sostituzioni (§10 `max_substitutions: 5`)", () => {
  it("con sei titolari assenti se ne sostituiscono cinque e uno resta scoperto, senza che la giornata diventi irrisolta", () => {
    const squad = capSquad();
    const opponent = opponentFlat();
    const proposal = proposeLineup({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponent },
      context: CONTEXT,
    });
    expect(proposal.feasible).toBe(true);
    const lineup = proposal.lineup!;
    const byId = new Map(squad.map((f) => [f.id, f]));
    const incertiTitolari = lineup.starterIds.filter((id) => byId.get(id)!.voteProbability < 1);
    expect(incertiTitolari).toHaveLength(6); // la premessa del test, verificata

    // Lo scenario «tutti e sei assenti» è uno dei 2^6 = 64 scenari enumerati.
    expect(proposal.estimate.method).toBe("exact");
    expect(proposal.estimate.scenarios).toBe(64);
    const players = expectedMap(squad, opponent);
    for (const id of incertiTitolari) {
      players.set(id, {
        id,
        role: byId.get(id)!.role,
        baseVote: null,
        fantasyScore: null,
        cards: "none",
        otherBonusMalus: 0,
      });
    }
    const out = simulateGameweek({ ourLineup: lineup, theirLineup: OPP_LINEUP, players, context: CONTEXT });
    expect(out.ours.resolution.substitutionsUsed).toBe(5); // §10 max_substitutions: 5
    expect(out.ours.resolution.substitutionCapReached).toBe(true);
    expect(out.ours.resolution.uncoveredIds).toHaveLength(1);
    // §13 `office_reserve: prohibited`: lo scoperto non ha punteggio d'ufficio e
    // vale zero — non è un buco del regolamento, è la regola.
    const scoperto = out.ours.resolution.uncoveredIds[0]!;
    expect(out.ours.resolution.fielded.find((l) => l.id === scoperto)!.fantasyScore).toBeNull();
    expect(out.ours.playersTotal).toBe(
      out.ours.resolution.fielded.reduce((sum, l) => sum + (l.fantasyScore ?? 0), 0),
    );
    // Scoperto NON vuol dire irrisolto: il punteggio è calcolabile, ed è quello
    // di una squadra in dieci.
    expect(out.resolved).toBe(true);
    expect(proposal.estimate.allResolved).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coerenza del risultato
// ─────────────────────────────────────────────────────────────────────────────

describe("coerenza del risultato", () => {
  it("porta la versione di regolamento, l'etichetta dell'obiettivo e un conteggio di formazioni valutate", () => {
    const proposal = proposeLineup({
      squad: picoSquad(),
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
    });
    expect(proposal.leagueRuleVersion).toBe("2026_27_v1");
    expect(proposal.objectiveLabel).toContain("V 3");
    expect(proposal.objectiveLabel).toContain("§22");
    expect(proposal.evaluated).toBeGreaterThan(0);
    expect(proposal.reason).toContain("hill climbing");
  });
});

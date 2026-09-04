import { describe, it, expect } from "vitest";
import {
  DEFAULT_SEED,
  LEAGUE_POINTS,
  type GameweekContext,
  type Lineup,
  type LineupConstraints,
  type LineupProposal,
  type Module,
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
  // I due flag di §21 sono OBBLIGATORI nel contratto (dichiarazione 4 in testa a
  // `lineupProposer.ts`): l'helper li passa sempre, e ogni fixture che attende
  // un punteggio sopra il voto base deve dichiarare il bonus a mano.
  expected: {
    baseVote,
    fantasyScore,
    receivedAnyBonus: extra.receivedAnyBonus ?? false,
    missedPenalty: extra.missedPenalty ?? false,
  },
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
              receivedAnyBonus: f.expected.receivedAnyBonus,
              missedPenalty: f.expected.missedPenalty,
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
      // §21: un punteggio atteso sopra il voto base È un bonus atteso, e il
      // contratto pretende che lo si dichiari invece di dedurlo.
      out.push(fc(id, role, base, score, uncertain[id] ?? 1, { receivedAnyBonus: score > base }));
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
    // Nessuna formazione, nessun raffinamento: il tetto non è stato raggiunto.
    expect(proposal.estimate.refinementCapReached).toBe(false);
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

  it("rifiuta un punteggio atteso sopra il voto base senza bonus dichiarato (§21)", () => {
    // Un attaccante che in attesa fa 9,5 con voto base 6,5 HA un bonus atteso.
    // Senza il flag, `expectedLine` lo porterebbe a `receivedAnyBonus:false` e
    // §21 gli darebbe ANCHE il modificatore attacco: lo stesso gol due volte.
    const squad = smallSquad().map((f) => (f.id === "A1" ? fc("A1", "A", 6.5, 9.5) : f));
    expect(() => proposeLineup({ squad, opponent: base(), context: CONTEXT })).toThrow(
      /receivedAnyBonus: true/,
    );
    expect(() => proposeLineup({ squad, opponent: base(), context: CONTEXT })).toThrow(/A1/);
    // Dichiarato, passa: il contratto non vieta il bonus, vieta di tacerlo.
    const dichiarato = smallSquad().map((f) =>
      f.id === "A1" ? fc("A1", "A", 6.5, 9.5, 1, { receivedAnyBonus: true }) : f,
    );
    expect(() => proposeLineup({ squad: dichiarato, opponent: base(), context: CONTEXT })).not.toThrow();
    // Vale anche per la rosa avversaria: il loro §21 entra nello stesso conto.
    const avversari = opponentFlat().map((f) => (f.id === "oA1" ? fc("oA1", "A", 6.5, 9.5) : f));
    expect(() =>
      proposeLineup({
        squad: smallSquad(),
        opponent: { lineup: OPP_LINEUP, players: avversari },
        context: CONTEXT,
      }),
    ).toThrow(/receivedAnyBonus: true/);
  });

  it("rifiuta una previsione a cui i flag di §21 mancano del tutto", () => {
    // «Non dichiarato» non è «falso»: il tipo li pretende, e la guardia a
    // runtime protegge anche chi chiama da JavaScript senza compilatore.
    const senzaFlag = {
      id: "A1",
      role: "A",
      voteProbability: 1,
      expected: { baseVote: 7, fantasyScore: 7 },
    } as unknown as PlayerForecast;
    const squad = smallSquad().map((f) => (f.id === "A1" ? senzaFlag : f));
    expect(() => proposeLineup({ squad, opponent: base(), context: CONTEXT })).toThrow(
      /receivedAnyBonus e missedPenalty sono obbligatori/,
    );
  });

  it("rifiuta un seme che non sia un intero in [0, 2^32): `mulberry32` lo troncherebbe in silenzio", () => {
    const conSeme = (seed: number) =>
      proposeLineup({
        squad: uncertainSquad(),
        opponent: base(),
        context: CONTEXT,
        scenarioBudget: 32,
        seed,
      });
    expect(() => conSeme(3.7)).toThrow(/seed non valido/);
    expect(() => conSeme(-1)).toThrow(/seed non valido/);
    expect(() => conSeme(2 ** 32)).toThrow(/seed non valido/);
    expect(() => conSeme(Number.NaN)).toThrow(/seed non valido/);
    expect(() => conSeme(Number.POSITIVE_INFINITY)).toThrow(/seed non valido/);
    // Gli estremi ammessi restano ammessi.
    expect(() => conSeme(0)).not.toThrow();
    expect(() => conSeme(2 ** 32 - 1)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3-bis. §21 — IL SOLO FLAG DEL BONUS CAMBIA CHI SCENDE IN CAMPO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rosa 1P/4D/4C/3A: due soli slot d'attacco e tre candidati. A1 vale 7,5 di
 * voto base e 7,5 di punteggio — nessun bonus nel totale — mentre A2 (8,0) e A3
 * (8,5) portano un bonus dichiarato e §21 li esclude dal modificatore attacco.
 * L'UNICA cosa che cambia fra le due varianti è il flag di A1.
 */
function attackFlagSquad(bonusDiA1: boolean): PlayerForecast[] {
  return [
    fc("P1", "P", 6.5, 6.5),
    fc("D1", "D", 6.5, 9, 1, { receivedAnyBonus: true }),
    fc("D2", "D", 6.5, 9, 1, { receivedAnyBonus: true }),
    fc("D3", "D", 6.5, 9, 1, { receivedAnyBonus: true }),
    fc("D4", "D", 6.5, 9, 1, { receivedAnyBonus: true }),
    fc("C1", "C", 6, 9, 1, { receivedAnyBonus: true }),
    fc("C2", "C", 6, 9, 1, { receivedAnyBonus: true }),
    fc("C3", "C", 6, 9, 1, { receivedAnyBonus: true }),
    fc("C4", "C", 6, 9, 1, { receivedAnyBonus: true }),
    // Punteggio ATTESO uguale al voto base: il flag qui non è dedotto dai
    // numeri, è esattamente la variabile dell'esperimento.
    fc("A1", "A", 7.5, 7.5, 1, { receivedAnyBonus: bonusDiA1 }),
    fc("A2", "A", 6, 8, 1, { receivedAnyBonus: true }),
    fc("A3", "A", 6, 8.5, 1, { receivedAnyBonus: true }),
  ];
}

describe("§21 — il bonus atteso dichiarato cambia la formazione, non solo il totale", () => {
  it("con A1 senza bonus il produttore lo schiera; dichiarando il bonus lo lascia fuori", () => {
    // IL CONTO A MANO (4-4-2, giornata 10 in casa, avversario piatto da 67).
    // Fisso in entrambe le varianti: P1 6,5 + quattro difensori da 9 (36) +
    // quattro centrocampisti da 9 (36) = 78,5 prima degli attaccanti.
    // §19 media (6,5 + 6,5·3)/4 = 6,5 -> +3 ; §20 24 contro 24 -> 0 ; §14 +2.
    //   A1 SENZA bonus:  A1+A3 = 7,5 + 8,5 = 16   -> 94,5 + 3 + 1,5 (§21 su A1
    //                    a 7,5) + 2 = 101,0  >  A2+A3 = 16,5 -> 95 + 3 + 0 + 2 = 100,0
    //   A1 CON bonus:    A1+A3 -> 94,5 + 3 + 0 + 2 = 99,5  <  A2+A3 = 100,0
    // Il totale di squadra di A1 non cambia di un decimo: cambia solo il diritto
    // al modificatore attacco, e con esso la formazione.
    const senza = proposeLineup({
      squad: attackFlagSquad(false),
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
    });
    const con = proposeLineup({
      squad: attackFlagSquad(true),
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
    });

    expect(senza.lineup!.starterIds).toContain("A1");
    expect(senza.lineup!.starterIds).not.toContain("A2");
    expect(senza.lineup!.benchIds).toEqual(["A2"]);
    expect(senza.pointForecast.outcome!.ours.attack).toBe(1.5); // §21: 7,5 -> +1,5
    expect(senza.pointForecast.outcome!.ours.total).toBe(101);

    expect(con.lineup!.starterIds).not.toContain("A1");
    expect(con.lineup!.starterIds).toContain("A2");
    expect(con.lineup!.benchIds).toEqual(["A1"]);
    expect(con.pointForecast.outcome!.ours.attack).toBe(0); // §21: tutti con bonus
    expect(con.pointForecast.outcome!.ours.total).toBe(100);

    // La differenza NON è nel punteggio individuale atteso di A1, che è identico.
    expect(attackFlagSquad(false)[9]!.expected.fantasyScore).toBe(
      attackFlagSquad(true)[9]!.expected.fantasyScore,
    );
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
    fc("C1", "C", 6, 7, 1, { receivedAnyBonus: true }),
    fc("C2", "C", 6, 7, 1, { receivedAnyBonus: true }),
    fc("C3", "C", 6, 7, 1, { receivedAnyBonus: true }),
    fc("C4", "C", 6, 7, 1, { receivedAnyBonus: true }),
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
      fc("D1", "D", 6, 7, 1, { receivedAnyBonus: true }),
      fc("D2", "D", 6, 7, 1, { receivedAnyBonus: true }),
      fc("Dsure", "D", 6, 7, 1, { receivedAnyBonus: true }),
      fc("Drisky", "D", 6, 7, 0.3, { receivedAnyBonus: true }),
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
    fc("P1", "P", 6, 7, 1, { receivedAnyBonus: true }),
    fc("P2", "P", 6, 5),
    fc("P3", "P", 6, 5, 0.4),
    fc("D1", "D", 6, 6),
    fc("D2", "D", 6, 6),
    fc("D3", "D", 6, 6),
    fc("D4", "D", 6, 6),
    fc("C1", "C", 6, 7, 1, { receivedAnyBonus: true }),
    fc("C2", "C", 6, 7, 1, { receivedAnyBonus: true }),
    fc("C3", "C", 6, 7, 1, { receivedAnyBonus: true }),
    fc("C4", "C", 6, 7, 1, { receivedAnyBonus: true }),
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

  it("chi non può prendere voto sta SEMPRE in coda, per alto che sia il suo punteggio atteso", () => {
    // Dghost ha il punteggio atteso più alto della panchina e p = 0: non ha voto
    // in nessuno scenario, `applySubstitutions` lo salta sempre, e metterlo
    // davanti a chi un voto può prenderlo non costa punti ma consegna al
    // fantallenatore una panchina che lui non userebbe mai. Ordine iniziale
    // dichiarato 2): prima chi può giocare, poi il punteggio atteso.
    const squad = [...picoSquad(), fc("Dghost", "D", 6.5, 9, 0, { receivedAnyBonus: true })];
    const proposal = proposeLineup({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
      context: CONTEXT,
    });
    const bench = proposal.lineup!.benchIds;
    expect(bench[bench.length - 1]).toBe("Dghost");
    // E non è titolare: senza voto non può esserlo.
    expect(proposal.lineup!.starterIds).not.toContain("Dghost");
    expect(proposal.lineup!.goalkeeperId).not.toBe("Dghost");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9-bis. L'ORDINE DELLA PANCHINA È UNA SCELTA, E LA SCELTA LA FA IL SIMULATORE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IL CONTROESEMPIO CHE SMONTA «DAVANTI CHI RENDE DI PIÙ».
 *
 * 2P / 7D / 7C / 2A. Sei titolari incerti (D1, D2, D3, C1, C2, C3 a p = 0,5):
 * 2^6 = 64 scenari enumerati, e in UNO solo — quello in cui mancano tutti e sei
 * — il tetto di cinque sostituzioni (§10) morde e l'ordine della panchina decide
 * QUALE ruolo resta scoperto.
 *
 * I panchinari di centrocampo rendono più di quelli di difesa (5,0 e 4,0 contro
 * 4,5 e 3,5), quindi l'ordine euristico li mette davanti. Ma §19 è una SOGLIA:
 * con solo tre difensori a voto il modificatore difesa non c'è, e valeva +3.
 */
function benchCapSquad(): PlayerForecast[] {
  return [
    fc("P1", "P", 6.5, 6.5),
    fc("P2", "P", 6, 3),
    fc("D1", "D", 6.5, 6, 0.5),
    fc("D2", "D", 6.5, 6, 0.5),
    fc("D3", "D", 6.5, 6, 0.5),
    fc("D4", "D", 6.5, 6),
    fc("Db1", "D", 6.5, 4.5),
    fc("Db2", "D", 6.5, 4.5),
    fc("Db3", "D", 6.5, 3.5),
    fc("C1", "C", 6, 6, 0.5),
    fc("C2", "C", 6, 6, 0.5),
    fc("C3", "C", 6, 6, 0.5),
    fc("C4", "C", 6, 6),
    fc("Cb1", "C", 6, 5),
    fc("Cb2", "C", 6, 5),
    fc("Cb3", "C", 6, 4),
    fc("A1", "A", 6, 13, 1, { receivedAnyBonus: true }),
    fc("A2", "A", 6, 13, 1, { receivedAnyBonus: true }),
  ];
}

/** L'ordine euristico puro: punteggio atteso decrescente, senza la ricerca. */
const PANCHINA_EURISTICA = ["Cb1", "Cb2", "Db1", "Db2", "Cb3", "Db3", "P2"] as const;

describe("ordine della panchina: la ricerca lo sceglie sugli scenari (§10 tetto, §19 soglia)", () => {
  it("mette il terzo difensore davanti al terzo centrocampista, e il simulatore dice che è meglio", () => {
    // IL CONTO A MANO, sullo scenario in cui mancano tutti e sei gli incerti.
    // Panchina EURISTICA [Cb1, Cb2, Db1, Db2, Cb3, Db3, P2]: entrano Cb1->C1,
    //   Cb2->C2, Db1->D1, Db2->D2, Cb3->C3 e il tetto di 5 si chiude. D3 resta
    //   scoperto (§13 `office_reserve: prohibited` -> vale 0).
    //   individuali 6,5 + 6 + 4,5 + 4,5 + 0 + 6 + 5 + 5 + 4 + 13 + 13 = 67,5
    //   §19 tre difensori a voto su quattro richiesti -> 0
    //   §20 quattro voti base da 6 contro quattro da 6 -> 0 ; §21 attaccanti con
    //   bonus dichiarato -> 0 ; §14 +2  =>  69,5 contro 67  ->  1-1, un punto.
    // Panchina PROPOSTA [Cb1, Cb2, Db1, Db2, Db3, Cb3, P2]: entrano Cb1->C1,
    //   Cb2->C2, Db1->D1, Db2->D2, Db3->D3. Scoperto C3.
    //   individuali 6,5 + 6 + 4,5 + 4,5 + 3,5 + 6 + 5 + 5 + 0 + 13 + 13 = 67,0
    //   §19 quattro difensori a voto, media (6,5 + 6,5·3)/4 = 6,5 -> +3
    //   §20 tre voti base da 6 più un fittizio da 5 (§20) = 23 contro 24 ->
    //       differenza 1,0 < 2,0 -> 0 ; §21 0 ; §14 +2  =>  72,0 contro 67
    //       ->  2-1, tre punti.
    // Mezzo punto di punteggi individuali IN MENO, due punti e mezzo di totale
    // in più: la soglia di §19 non è un contributo che si somma, è un interruttore.
    const squad = benchCapSquad();
    const opponent = opponentFlat();
    const proposal = proposeLineup({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponent },
      context: CONTEXT,
    });

    expect(proposal.lineup!.module).toBe("442");
    expect(proposal.estimate.method).toBe("exact");
    expect(proposal.estimate.scenarios).toBe(64); // 2^6, i sei incerti
    const bench = proposal.lineup!.benchIds;
    // La premessa del controesempio: l'euristica di partenza è un altro ordine.
    expect([...PANCHINA_EURISTICA]).not.toEqual(bench);
    expect(bench.indexOf("Db3")).toBeLessThan(bench.indexOf("Cb3"));
    expect(bench).toEqual(["Cb1", "Cb2", "Db1", "Db2", "Db3", "Cb3", "P2"]);

    // ── E adesso i due ordini messi alla prova dal simulatore, non da una formula.
    const players = expectedMap(squad, opponent);
    for (const id of ["D1", "D2", "D3", "C1", "C2", "C3"]) {
      const f = squad.find((x) => x.id === id)!;
      players.set(id, {
        id,
        role: f.role,
        baseVote: null,
        fantasyScore: null,
        cards: "none",
        otherBonusMalus: 0,
      });
    }
    const simula = (benchIds: readonly string[]) =>
      simulateGameweek({
        ourLineup: { ...proposal.lineup!, benchIds: [...benchIds] },
        theirLineup: OPP_LINEUP,
        players,
        context: CONTEXT,
      });

    const euristica = simula(PANCHINA_EURISTICA);
    expect(euristica.ours.resolution.substitutionsUsed).toBe(5); // §10 max_substitutions
    expect(euristica.ours.resolution.uncoveredIds).toEqual(["D3"]);
    expect(euristica.ours.playersTotal).toBe(67.5);
    expect(euristica.ours.defence).toBe(0); // §19: tre difensori a voto
    expect(euristica.ours.total).toBe(69.5);
    expect([euristica.ourGoals, euristica.theirGoals]).toEqual([1, 1]);
    expect(leaguePointsOf(euristica, LEAGUE_POINTS).value).toBe(LEAGUE_POINTS.draw);

    const proposta = simula(bench);
    expect(proposta.ours.resolution.substitutionsUsed).toBe(5);
    expect(proposta.ours.resolution.uncoveredIds).toEqual(["C3"]);
    expect(proposta.ours.playersTotal).toBe(67); // MENO individuali dell'euristica
    expect(proposta.ours.defence).toBe(3); // §19: quattro difensori a voto
    expect(proposta.ours.midfield).toBe(0); // §20: fittizio da 5, differenza 1,0
    expect(proposta.ours.total).toBe(72);
    expect([proposta.ourGoals, proposta.theirGoals]).toEqual([2, 1]);
    expect(leaguePointsOf(proposta, LEAGUE_POINTS).value).toBe(LEAGUE_POINTS.win);

    // Il confronto che conta: l'ordine proposto batte quello euristico proprio
    // nello scenario in cui il tetto morde, e nessun altro scenario cambia
    // (sotto le cinque sostituzioni l'ordine dentro ogni ruolo è lo stesso).
    expect(proposta.ours.total).toBeGreaterThan(euristica.ours.total);
    expect(proposta.ours.playersTotal).toBeLessThan(euristica.ours.playersTotal);
    // 2 punti di lega in più su uno scenario da 1/64: (3 - 1)/64 = 0,03125.
    expect(proposal.estimate.expectedLeaguePoints).toBeCloseTo(3, 12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9-ter. IL CAMBIO MODULO NON PUÒ TITOLARIZZARE CHI NON HA VOTO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 2P / 4D / 4C / 4A. A previsione puntuale (Tier 1) il 4-4-2 è già la scelta
 * migliore fra i sette moduli e schiera i due attaccanti col punteggio atteso
 * più alto, Ariserva (4,5) e A1 (4,0); Afiller (4,0, pareggia A1 e perde il
 * pareggio) resta in panchina. Cincerto (C, p = 0,3) rende però il 4-3-3
 * migliore sugli scenari (Tier 2): un centrocampista in meno, un attaccante
 * in più — la mossa (c) del vicinato.
 *
 * Per quel posto in più in panchina restano solo due candidati: Afiller
 * (reale, p = 1, punteggio atteso 4,0) e Aghost (p = 0, punteggio atteso 9,0
 * — il più alto di TUTTA la rosa). Se `replan` sceglie i rincalzi ordinando
 * per punteggio atteso senza escludere chi non ha mai voto (dichiarazione 2
 * in testa a `lineupProposer.ts`), Aghost entra fra i titolari del 4-3-3
 * proposto: è esattamente il difetto che l'esclusione in `neighbours` (a) e
 * (b) chiude per gli scambi di movimento e il cambio modulo no.
 */
function moduleSwitchNeverPlaysSquad(): PlayerForecast[] {
  return [
    fc("P1", "P", 6.0),
    fc("P2", "P", 5.0),
    fc("D1", "D", 6.5),
    fc("D2", "D", 6.5),
    fc("D3", "D", 6.5),
    fc("D4", "D", 6.5),
    fc("C1", "C", 6.5),
    fc("C2", "C", 6.5),
    fc("C3", "C", 6.5),
    fc("Cincerto", "C", 4.0, 4.0, 0.3),
    fc("A1", "A", 4.0),
    fc("Afiller", "A", 4.0),
    fc("Ariserva", "A", 4.5),
    fc("Aghost", "A", 9.0, 9.0, 0),
  ];
}

describe("il cambio modulo non titolarizza chi non ha mai voto", () => {
  it("Aghost (p = 0, punteggio atteso più alto della rosa) non è mai titolare quando il 4-3-3 cerca un attaccante in più al posto del 4-4-2 di Tier 1", () => {
    const squad = moduleSwitchNeverPlaysSquad();
    const opponent = opponentFlat();
    const proposal = proposeLineup({
      squad,
      opponent: { lineup: OPP_LINEUP, players: opponent },
      context: CONTEXT,
    });

    // La premessa: Tier 1 sceglie il 4-4-2, la ricerca sugli scenari lo cambia
    // in 4-3-3 — è la mossa (c) che deve filtrare `neverPlays`, non la mossa
    // (a)/(b) già a posto.
    expect(proposal.pointForecast.lineup!.module).toBe("442");
    expect(proposal.lineup!.module).toBe("433");

    // L'INVARIANTE: Aghost non è mai in campo, in nessun ruolo.
    expect(proposal.lineup!.starterIds).not.toContain("Aghost");
    expect(proposal.lineup!.goalkeeperId).not.toBe("Aghost");
    // E la dichiarazione 2) vale alla lettera: è l'ultimo della panchina,
    // dietro anche ad Afiller che un voto, quando gioca, ce l'ha davvero.
    const bench = proposal.lineup!.benchIds;
    expect(bench[bench.length - 1]).toBe("Aghost");

    // La formazione resta legale.
    const players = expectedMap(squad, opponent);
    expect(lineupViolations(proposal.lineup!, players)).toEqual([]);
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
  for (let i = 1; i <= 4; i += 1) out.push(fc(`D${i}`, "D", 6, 8, 0.8, { receivedAnyBonus: true }));
  for (let i = 5; i <= 8; i += 1) out.push(fc(`D${i}`, "D", 6, 4));
  for (let i = 1; i <= 2; i += 1) out.push(fc(`C${i}`, "C", 6, 8, 0.8, { receivedAnyBonus: true }));
  for (let i = 3; i <= 4; i += 1) out.push(fc(`C${i}`, "C", 6, 7, 1, { receivedAnyBonus: true }));
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
    // Il tetto delle iterazioni si legge da un campo, non dalla prosa: chi
    // consuma la proposta non deve fare il parsing di una frase in italiano.
    expect(proposal.estimate.refinementCapReached).toBe(false);
    expect(proposal.reason).not.toContain("TETTO");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. I VINCOLI DEL FANTALLENATORE — dichiarazione 5) in testa a
//     `lineupProposer.ts`. Volontà dichiarata, non informazione: si rispetta
//     per intero, oppure si rifiuta con il suo motivo. Mai un rilassamento
//     silenzioso, perché un vincolo ignorato senza dirlo fa credere schierato
//     un giocatore che non c'è.
// ─────────────────────────────────────────────────────────────────────────────

const NO_CONSTRAINTS: LineupConstraints = { lockedStarterIds: [], locked: false };

/** Chiamata base, con i vincoli che si vogliono provare. */
function propose(
  squad: readonly PlayerForecast[],
  constraints?: LineupConstraints,
  currentLineup?: Lineup,
): LineupProposal {
  return proposeLineup({
    squad,
    opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
    context: CONTEXT,
    ...(constraints === undefined ? {} : { constraints }),
    ...(currentLineup === undefined ? {} : { currentLineup }),
  });
}

/** Un 4-4-2 legale con la rosa piccola: il migliore, a occhio e per costruzione. */
const SMALL_442: Lineup = {
  module: "442",
  goalkeeperId: "P1",
  starterIds: ["D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A1", "A2"],
  benchIds: ["P2", "A3"],
};

describe("vincoli assenti: il produttore è quello di prima, alla virgola", () => {
  it("nessun `constraints` e `constraints` neutri danno lo STESSO risultato, campo per campo", () => {
    // «Come prima» non è un'impressione: le 31 prove che precedono questa
    // sezione fissano i numeri del produttore SENZA vincoli, e passano
    // invariate. Qui si aggiunge l'altra metà: passare dei vincoli che non
    // chiedono niente non è diverso dal non passarne affatto, e in particolare
    // non fa comparire un ramo «vincolato» che si comporta quasi uguale.
    const senza = propose(smallSquad());
    const neutri = propose(smallSquad(), NO_CONSTRAINTS);
    expect(neutri).toEqual(senza);
    expect(senza.constraints.applied).toBe(false);
    expect(senza.constraints.optimized).toBe(true);
    expect(senza.constraints.rejections).toEqual([]);
    expect(senza.constraints.warnings).toEqual([]);
    expect(senza.reason).not.toContain("vincoli");
  });

  it("`lockedStarterIds` vuoto e `locked: false` non toccano nemmeno la rosa piena", () => {
    const senza = propose(fullRoster({ D1: 0.4, C2: 0.6, A3: 0.5 }));
    const neutri = propose(fullRoster({ D1: 0.4, C2: 0.6, A3: 0.5 }), NO_CONSTRAINTS);
    expect(neutri.lineup).toEqual(senza.lineup);
    expect(neutri.estimate).toEqual(senza.estimate);
    expect(neutri.evaluated).toBe(senza.evaluated);
  });
});

describe("`locked: true` — nessuna ricerca, e l'esito lo dichiara", () => {
  it("restituisce la formazione data così com'è, anche quando è peggiore di quella che avrebbe scelto", () => {
    // Formazione volutamente scadente: portiere di riserva e A3 (5,5 con
    // p = 0,2) al posto di A1 (7,0). Il produttore NON la migliora.
    const scadente: Lineup = {
      module: "442",
      goalkeeperId: "P2",
      starterIds: ["D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A2", "A3"],
      benchIds: ["P1", "A1"],
    };
    const bloccata = propose(smallSquad(), { lockedStarterIds: [], locked: true }, scadente);
    expect(bloccata.feasible).toBe(true);
    // Così com'è: stesso modulo, stesso portiere, STESSO ORDINE di titolari e
    // panchina. Nemmeno il riordino della panchina, che sarebbe invisibile.
    expect(bloccata.lineup).toEqual(scadente);
    expect(bloccata.constraints.optimized).toBe(false);
    expect(bloccata.constraints.applied).toBe(true);
    expect(bloccata.reason).toContain("NESSUNA RICERCA");
    // Una sola formazione valutata: quella. Se ne comparissero altre, da
    // qualche parte ci sarebbe stata una ricerca.
    expect(bloccata.evaluated).toBe(1);

    // E che fosse davvero peggiore lo dice il produttore libero.
    const libera = propose(smallSquad());
    expect(bloccata.estimate.expectedOurTotal).toBeLessThan(libera.estimate.expectedOurTotal);
  });

  it("i numeri della formazione bloccata sono quelli veri: stessa aritmetica, nessuna scorciatoia", () => {
    // Si blocca la formazione che il produttore stesso avrebbe scelto: allora
    // «bloccata» e «proposta» devono dare gli STESSI numeri, perché la stima
    // passa dalla stessa aritmetica e dagli stessi scenari. Se divergessero,
    // il ramo bloccato starebbe calcolando per conto suo.
    const libera = propose(smallSquad());
    const bloccata = propose(smallSquad(), { lockedStarterIds: [], locked: true }, libera.lineup!);
    expect(bloccata.lineup).toEqual(libera.lineup);
    expect(bloccata.estimate.expectedOurTotal).toBeCloseTo(libera.estimate.expectedOurTotal, 10);
    expect(bloccata.estimate.expectedLeaguePoints).toBeCloseTo(libera.estimate.expectedLeaguePoints, 10);
    expect(bloccata.estimate.winProbability).toBeCloseTo(libera.estimate.winProbability, 10);
    // Stessi numeri, lavoro diversissimo: una formazione valutata contro molte.
    expect(bloccata.evaluated).toBe(1);
    expect(bloccata.evaluated).toBeLessThan(libera.evaluated);
  });

  it("senza formazione di partenza rifiuta: `LOCKED_LINEUP_MISSING`, non una ricerca di nascosto", () => {
    const p = propose(smallSquad(), { lockedStarterIds: [], locked: true });
    expect(p.feasible).toBe(false);
    expect(p.lineup).toBeNull();
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_LINEUP_MISSING");
    expect(p.reason).toContain("LOCKED_LINEUP_MISSING");
  });

  it("una formazione bloccata illegale si rifiuta: bloccata non vuol dire legale (§9)", () => {
    const illegale: Lineup = {
      module: "442",
      goalkeeperId: "P1",
      // Tre difensori invece di quattro, cinque centrocampisti invece di quattro.
      starterIds: ["D1", "D2", "D3", "C1", "C2", "C3", "C4", "A1", "A2", "A3"],
      benchIds: ["P2", "D4"],
    };
    const p = propose(smallSquad(), { lockedStarterIds: [], locked: true }, illegale);
    expect(p.feasible).toBe(false);
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_LINEUP_ILLEGAL");
    expect(p.constraints.rejections[0]?.message).toMatch(/difensori/);
  });

  it("una panchina con giocatori che non sono in rosa si rifiuta con lo stesso codice, e li nomina", () => {
    const p = propose(
      smallSquad(),
      { lockedStarterIds: [], locked: true },
      { ...SMALL_442, benchIds: ["P2", "A3", "Xignoto"] },
    );
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_LINEUP_ILLEGAL");
    expect(p.constraints.rejections[0]?.playerIds).toEqual(["Xignoto"]);
  });

  it("formazione bloccata che contraddice gli altri vincoli: si rifiuta, non si sceglie quale tradire", () => {
    const moduloDiverso = propose(smallSquad(), { lockedStarterIds: [], lockedModule: "352", locked: true }, SMALL_442);
    expect(moduloDiverso.constraints.rejections[0]?.code).toBe("LOCKED_LINEUP_CONTRADICTS_CONSTRAINTS");
    expect(moduloDiverso.constraints.rejections[0]?.message).toMatch(/352/);

    const fuoriDagliUndici = propose(smallSquad(), { lockedStarterIds: ["A3"], locked: true }, SMALL_442);
    expect(fuoriDagliUndici.constraints.rejections[0]?.code).toBe("LOCKED_LINEUP_CONTRADICTS_CONSTRAINTS");
    expect(fuoriDagliUndici.constraints.rejections[0]?.playerIds).toEqual(["A3"]);
  });
});

describe("`lockedModule` — si valuta SOLO quel modulo", () => {
  it("il modulo imposto è quello consegnato, anche quando costa punti (§9: il 3-4-3 regala 1,5 all'avversario)", () => {
    const libera = propose(smallSquad());
    const imposta = propose(smallSquad(), { lockedStarterIds: [], lockedModule: "343", locked: false });
    expect(imposta.feasible).toBe(true);
    expect(imposta.lineup!.module).toBe("343");
    expect(libera.lineup!.module).not.toBe("343");
    // Il modulo imposto è un vincolo, non un suggerimento: la proposta che lo
    // rispetta vale meno di quella libera, e il produttore non se ne discosta.
    expect(imposta.estimate.expectedLeaguePoints).toBeLessThanOrEqual(libera.estimate.expectedLeaguePoints);
    expect(imposta.constraints.lockedModule).toBe("343");
    expect(imposta.reason).toContain("modulo imposto 343");
  });

  it("un modulo che §9 non ammette si rifiuta: `LOCKED_MODULE_NOT_ALLOWED`", () => {
    const p = propose(smallSquad(), { lockedStarterIds: [], lockedModule: "4231" as Module, locked: false });
    expect(p.feasible).toBe(false);
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_MODULE_NOT_ALLOWED");
    expect(p.constraints.rejections[0]?.message).toMatch(/4231/);
  });

  it("un modulo imposto che la rosa non regge resta un rifiuto dichiarato, non un ripiego su un altro modulo", () => {
    // Rosa senza il terzo attaccante: il 4-3-3 non è schierabile.
    const senzaTerzoAttaccante = smallSquad().filter((f) => f.id !== "A3");
    const p = propose(senzaTerzoAttaccante, { lockedStarterIds: [], lockedModule: "433", locked: false });
    expect(p.feasible).toBe(false);
    expect(p.lineup).toBeNull();
    expect(p.reason).toMatch(/insufficienti/);
    expect(p.reason).toContain("modulo imposto 433");
  });
});

describe("`lockedStarterIds` — nessuna mossa del vicinato può toglierli", () => {
  it("A3 imposto resta titolare anche se toglierlo darebbe di più, e la proposta lo DICE", () => {
    const libera = propose(smallSquad());
    const vincolata = propose(smallSquad(), { lockedStarterIds: ["A3"], locked: false });

    // A3 vale 5,5 e gioca con probabilità 0,2: al suo posto la ricerca libera
    // mette A2 (6,5, certo). Il vincolo costa, e il costo si vede.
    expect(libera.lineup!.starterIds).not.toContain("A3");
    expect(vincolata.feasible).toBe(true);
    expect(vincolata.lineup!.starterIds).toContain("A3");
    expect(vincolata.estimate.expectedOurTotal).toBeLessThan(libera.estimate.expectedOurTotal);

    // Non basta essere peggiori: bisogna dirlo. Il motivo nomina il vincolo e
    // avverte che la proposta vincolata può valere meno di quella libera.
    expect(vincolata.reason).toContain("titolari imposti A3");
    expect(vincolata.reason).toContain("può valere meno della migliore senza vincoli");
    expect(vincolata.constraints.applied).toBe(true);
    expect(vincolata.constraints.lockedStarterIds).toEqual(["A3"]);
    expect(vincolata.constraints.rejections).toEqual([]);
  });

  it("il vincolo tiene su TUTTE le mosse: portiere imposto, e nessun cambio modulo lo toglie", () => {
    // P2 è il portiere peggiore (6,0 con punteggio 5,0): la ricerca libera
    // sceglie P1. Imposto, resta lui, e resta lui anche dopo il raffinamento.
    const libera = propose(smallSquad());
    const conP2 = propose(smallSquad(), { lockedStarterIds: ["P2"], locked: false });
    expect(libera.lineup!.goalkeeperId).toBe("P1");
    expect(conP2.lineup!.goalkeeperId).toBe("P2");
    expect(conP2.lineup!.benchIds).toContain("P1");
    expect(conP2.estimate.expectedOurTotal).toBeLessThan(libera.estimate.expectedOurTotal);
  });

  it("un imposto sopravvive al cambio modulo: il 3-4-3 toglierebbe un difensore, ma non quello imposto", () => {
    // Con cinque difensori imposti nessun modulo a tre o quattro difensori è
    // praticabile: la mossa (c) verso di essi non esiste proprio.
    const rosa = fullRoster();
    const p = propose(rosa, { lockedStarterIds: ["D1", "D2", "D3", "D4", "D5"], locked: false });
    expect(p.feasible).toBe(true);
    expect(moduleShape(p.lineup!.module).defenders).toBe(5);
    for (const id of ["D1", "D2", "D3", "D4", "D5"]) expect(p.lineup!.starterIds).toContain(id);
  });
});

describe("infattibilità dichiarata: ogni caso ha il SUO motivo, e nessuno si rilassa", () => {
  it("un imposto che non è in rosa: `LOCKED_PLAYER_UNKNOWN`", () => {
    const p = propose(smallSquad(), { lockedStarterIds: ["D1", "Xfantasma"], locked: false });
    expect(p.feasible).toBe(false);
    expect(p.lineup).toBeNull();
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_PLAYER_UNKNOWN");
    expect(p.constraints.rejections[0]?.playerIds).toEqual(["Xfantasma"]);
  });

  it("un imposto ripetuto: `LOCKED_PLAYER_DUPLICATED`", () => {
    const p = propose(smallSquad(), { lockedStarterIds: ["D1", "C1", "D1"], locked: false });
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_PLAYER_DUPLICATED");
    expect(p.constraints.rejections[0]?.playerIds).toEqual(["D1"]);
  });

  it("più di undici imposti: `LOCKED_TOO_MANY`", () => {
    const dodici = ["P1", "D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A1", "A2", "A3"];
    const p = propose(fullRoster(), { lockedStarterIds: dodici, locked: false });
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_TOO_MANY");
  });

  it("due portieri imposti: `LOCKED_ROLE_OVERFLOW` — §9 ne ammette uno solo", () => {
    const p = propose(smallSquad(), { lockedStarterIds: ["P1", "P2"], locked: false });
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_ROLE_OVERFLOW");
    expect(p.constraints.rejections[0]?.playerIds).toEqual(["P1", "P2"]);
  });

  it("sei difensori imposti: `LOCKED_ROLE_OVERFLOW`, perché NESSUN modulo ne schiera più di cinque", () => {
    const p = propose(fullRoster(), { lockedStarterIds: ["D1", "D2", "D3", "D4", "D5", "D6"], locked: false });
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_ROLE_OVERFLOW");
    expect(p.constraints.rejections[0]?.message).toMatch(/nessuno dei sette moduli/);
  });

  it("cinque difensori con il 4-4-2 imposto: `LOCKED_MODULE_INCOMPATIBLE` — il modulo è a sua volta un vincolo", () => {
    const p = propose(fullRoster(), {
      lockedStarterIds: ["D1", "D2", "D3", "D4", "D5"],
      lockedModule: "442",
      locked: false,
    });
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_MODULE_INCOMPATIBLE");
    expect(p.constraints.rejections[0]?.message).toMatch(/442/);
    // Il rifiuto ammette che un altro modulo li reggerebbe, e spiega perché non
    // lo usa: cambiare modulo per salvare i giocatori sarebbe tradire un vincolo
    // per salvarne un altro.
    expect(p.constraints.rejections[0]?.message).toMatch(/non ne cambia uno per salvare l'altro/);
  });

  it("cinque difensori e tre attaccanti, senza modulo imposto: `LOCKED_MODULE_INCOMPATIBLE`", () => {
    // I moduli a cinque difensori sono 5-4-1 e 5-3-2: nessuno dei due ha tre
    // attaccanti. Ogni vincolo preso da solo è possibile; insieme non lo sono.
    const p = propose(fullRoster(), {
      lockedStarterIds: ["D1", "D2", "D3", "D4", "D5", "A1", "A2", "A3"],
      locked: false,
    });
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_MODULE_INCOMPATIBLE");
    expect(p.constraints.rejections[0]?.message).toMatch(/nessuno dei sette moduli/);
  });

  it("undici imposti che non compongono un modulo: `LOCKED_ELEVEN_NOT_A_MODULE`", () => {
    // Undici di movimento senza portiere: §9 chiede un portiere più dieci.
    const undici = ["D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A1", "A2", "A3"];
    const p = propose(fullRoster(), { lockedStarterIds: undici, locked: false });
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_ELEVEN_NOT_A_MODULE");
    expect(p.constraints.rejections[0]?.message).toMatch(/0P\/4D\/4C\/3A/);
  });

  it("undici imposti che SONO un modulo: si schierano esattamente quelli", () => {
    const undici = ["P1", "D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A1", "A2"];
    const p = propose(fullRoster(), { lockedStarterIds: undici, locked: false });
    expect(p.feasible).toBe(true);
    expect(p.lineup!.module).toBe("442");
    expect([p.lineup!.goalkeeperId, ...p.lineup!.starterIds].sort()).toEqual([...undici].sort());
  });
});

describe("modulo imposto e giocatori imposti, insieme", () => {
  it("combinazione coerente: i tre attaccanti nel 4-3-3, e si rispettano entrambi i vincoli", () => {
    const p = propose(smallSquad(), {
      lockedStarterIds: ["A1", "A2", "A3"],
      lockedModule: "433",
      locked: false,
    });
    expect(p.feasible).toBe(true);
    expect(p.lineup!.module).toBe("433");
    for (const id of ["A1", "A2", "A3"]) expect(p.lineup!.starterIds).toContain(id);
    expect(p.constraints.rejections).toEqual([]);
    expect(p.reason).toContain("modulo imposto 433");
    expect(p.reason).toContain("titolari imposti A1, A2, A3");
  });

  it("stessi giocatori, modulo a due punte: rifiuto con il motivo giusto e nessun ripiego sul 4-3-3", () => {
    const p = propose(smallSquad(), {
      lockedStarterIds: ["A1", "A2", "A3"],
      lockedModule: "442",
      locked: false,
    });
    expect(p.feasible).toBe(false);
    expect(p.lineup).toBeNull();
    expect(p.constraints.rejections[0]?.code).toBe("LOCKED_MODULE_INCOMPATIBLE");
    expect(p.constraints.rejections[0]?.message).toMatch(/0P\/0D\/0C\/3A/);
    // Il 4-3-3 li reggerebbe — l'ha appena fatto — e il produttore NON ci
    // ripiega: cambiare modulo per salvare i giocatori sarebbe tradire un
    // vincolo per salvarne un altro.
    expect(p.constraints.rejections[0]?.message).toMatch(/non ne cambia uno per salvare l'altro/);
  });
});

/**
 * Rosa costruita per rendere VISIBILE il prezzo di un imposto che non gioca:
 * tre difensori con voto più `Dfermo` (p = 0), cinque centrocampisti, tre
 * attaccanti. Imponendo `Dfermo` E il 4-4-2 i quattro difensori sono tutti
 * titolari, in panchina non ne resta nessuno, e §10 non ha con chi sostituirlo:
 * resta scoperto (§13 `office_reserve: prohibited` — conta come assente) e §19
 * perde la soglia di quattro difensori con voto. Senza il vincolo la ricerca
 * userebbe un modulo a tre difensori e non pagherebbe niente.
 */
function neverPlaysLockedSquad(): PlayerForecast[] {
  return [
    fc("P1", "P", 6.5),
    fc("P2", "P", 6.0),
    fc("D1", "D", 6.5),
    fc("D2", "D", 6.5),
    fc("D3", "D", 6.5),
    fc("Dfermo", "D", 6.5, 6.5, 0),
    fc("C1", "C", 6.0),
    fc("C2", "C", 6.0),
    fc("C3", "C", 6.0),
    fc("C4", "C", 6.0),
    fc("C5", "C", 5.5),
    fc("A1", "A", 6.5),
    fc("A2", "A", 6.5),
    fc("A3", "A", 5.5),
  ];
}

const NEVER_PLAYS_CONSTRAINTS: LineupConstraints = {
  lockedStarterIds: ["Dfermo"],
  lockedModule: "442",
  locked: false,
};

describe("un imposto che non gioca mai è una scelta che costa, non un'infattibilità", () => {
  it("`LOCKED_PLAYER_NEVER_PLAYS`: si accetta, si schiera, e si avverte (§13)", () => {
    // `Dfermo` ha p = 0: senza voto in OGNI scenario. Il produttore non lo
    // sceglierebbe mai da sé — la dichiarazione 2) dice che nessuna mossa lo
    // porta fra i titolari — ma il fantallenatore può imporlo, e allora ci va.
    const rosa = neverPlaysLockedSquad();
    const p = propose(rosa, NEVER_PLAYS_CONSTRAINTS);

    expect(p.feasible).toBe(true);
    expect(p.constraints.rejections).toEqual([]);
    expect(p.lineup!.starterIds).toContain("Dfermo");
    expect(p.constraints.warnings).toHaveLength(1);
    expect(p.constraints.warnings[0]!.code).toBe("LOCKED_PLAYER_NEVER_PLAYS");
    expect(p.constraints.warnings[0]!.playerIds).toEqual(["Dfermo"]);
    expect(p.reason).toContain("LOCKED_PLAYER_NEVER_PLAYS");

    // Il prezzo è reale e si misura: senza vincoli `Dfermo` non è mai titolare.
    const libera = propose(rosa);
    expect(libera.lineup!.starterIds).not.toContain("Dfermo");
    expect(p.estimate.expectedOurTotal).toBeLessThan(libera.estimate.expectedOurTotal);
  });

  it("la proposta vincolata resta legale e completa (§9, §10)", () => {
    const rosa = neverPlaysLockedSquad();
    const p = propose(rosa, NEVER_PLAYS_CONSTRAINTS);
    expect(lineupViolations(p.lineup!, expectedMap(rosa, opponentFlat()))).toEqual([]);
    const tutti = [p.lineup!.goalkeeperId, ...p.lineup!.starterIds, ...p.lineup!.benchIds];
    expect([...tutti].sort()).toEqual(rosa.map((f) => f.id).sort());
  });

  it("un avvertimento NON è un rifiuto: la proposta c'è, e il codice sta in un campo, non nella prosa", () => {
    const p = propose(neverPlaysLockedSquad(), NEVER_PLAYS_CONSTRAINTS);
    expect(p.lineup).not.toBeNull();
    expect(p.feasible).toBe(true);
    expect(p.constraints.rejections).toEqual([]);
    expect(p.constraints.warnings.map((w) => w.code)).toEqual(["LOCKED_PLAYER_NEVER_PLAYS"]);
  });
});

describe("il contratto dei vincoli si controlla a runtime, non solo a compilazione", () => {
  it("`locked` mancante è un errore di contratto: «non dichiarato» non è «non bloccata»", () => {
    expect(() =>
      propose(smallSquad(), { lockedStarterIds: [] } as unknown as LineupConstraints),
    ).toThrow(/locked è obbligatorio/);
  });

  it("`lockedStarterIds` che non è un array è un errore di contratto", () => {
    expect(() =>
      propose(smallSquad(), { lockedStarterIds: "D1", locked: false } as unknown as LineupConstraints),
    ).toThrow(/array di id/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. IL REFERTO DEI RIFIUTI È UNA LISTA — e contiene solo motivi veri.
//     Con un motivo per volta chi corregge a mano gioca a colpire le talpe;
//     con un motivo inventato crede di dover correggere ciò che va bene.
// ─────────────────────────────────────────────────────────────────────────────

/** I codici del referto, nell'ordine in cui il produttore li dichiara. */
const codici = (p: LineupProposal): readonly string[] => p.constraints.rejections.map((r) => r.code);

describe("tutti i motivi in una volta sola", () => {
  it("id ripetuto e modulo inammissibile sono due errori indipendenti: si vedono entrambi", () => {
    const p = propose(smallSquad(), {
      lockedStarterIds: ["D1", "C1", "D1"],
      lockedModule: "4231" as Module,
      locked: false,
    });
    expect(p.feasible).toBe(false);
    expect(codici(p)).toEqual(["LOCKED_PLAYER_DUPLICATED", "LOCKED_MODULE_NOT_ALLOWED"]);
    // Il motivo di ciascuno resta leggibile per conto suo, e il riepilogo li
    // nomina tutti: chi legge `reason` non deve indovinare quanti erano.
    expect(p.reason).toContain("2 motivo/i");
    for (const codice of codici(p)) expect(p.reason).toContain(codice);
  });

  it("due reparti in eccesso danno due `LOCKED_ROLE_OVERFLOW`, uno per reparto", () => {
    const p = propose(fullRoster(), {
      lockedStarterIds: ["P1", "P2", "D1", "D2", "D3", "D4", "D5", "D6"],
      locked: false,
    });
    expect(codici(p)).toEqual(["LOCKED_ROLE_OVERFLOW", "LOCKED_ROLE_OVERFLOW"]);
    expect(p.constraints.rejections[0]!.playerIds).toEqual(["P1", "P2"]);
    expect(p.constraints.rejections[1]!.playerIds).toEqual(["D1", "D2", "D3", "D4", "D5", "D6"]);
  });

  it("formazione bloccata illegale E in contraddizione col modulo imposto: due motivi", () => {
    const illegale: Lineup = {
      module: "442",
      goalkeeperId: "P1",
      starterIds: ["D1", "D2", "D3", "C1", "C2", "C3", "C4", "A1", "A2", "A3"],
      benchIds: ["P2", "D4"],
    };
    const p = propose(smallSquad(), { lockedStarterIds: [], lockedModule: "352", locked: true }, illegale);
    expect(codici(p)).toEqual(["LOCKED_LINEUP_ILLEGAL", "LOCKED_LINEUP_CONTRADICTS_CONSTRAINTS"]);
  });

  it("l'ordine è stabile: due chiamate identiche danno lo stesso referto", () => {
    const vincoli: LineupConstraints = {
      lockedStarterIds: ["P1", "P2", "D1", "D2", "D3", "D4", "D5", "D6"],
      locked: false,
    };
    expect(propose(fullRoster(), vincoli).constraints).toEqual(propose(fullRoster(), vincoli).constraints);
  });
});

describe("nessun motivo derivato da un dato che un altro motivo ha già invalidato", () => {
  it("con un id sconosciuto i conteggi per ruolo NON si fanno: sei difensori non diventano un traboccamento", () => {
    // Senza `Xfantasma` questi stessi id darebbero `LOCKED_ROLE_OVERFLOW`. Con
    // lui, i ruoli degli imposti non sono una lettura possibile — uno degli
    // imposti non ha ruolo — e un traboccamento contato su una lista rotta
    // sarebbe un motivo inventato.
    const conFantasma = propose(fullRoster(), {
      lockedStarterIds: ["D1", "D2", "D3", "D4", "D5", "D6", "Xfantasma"],
      locked: false,
    });
    expect(codici(conFantasma)).toEqual(["LOCKED_PLAYER_UNKNOWN"]);

    const senzaFantasma = propose(fullRoster(), {
      lockedStarterIds: ["D1", "D2", "D3", "D4", "D5", "D6"],
      locked: false,
    });
    expect(codici(senzaFantasma)).toEqual(["LOCKED_ROLE_OVERFLOW"]);
  });

  it("con un id ripetuto i conteggi per ruolo NON si fanno: la richiesta non si sa leggere", () => {
    const p = propose(fullRoster(), {
      lockedStarterIds: ["D1", "D2", "D3", "D4", "D5", "D6", "D6"],
      locked: false,
    });
    expect(codici(p)).toEqual(["LOCKED_PLAYER_DUPLICATED"]);
  });

  it("col modulo inammissibile NON si dichiara l'incompatibilità: l'insieme dei moduli ammissibili non esiste", () => {
    const p = propose(fullRoster(), {
      lockedStarterIds: ["D1", "D2", "D3", "D4", "D5"],
      lockedModule: "4231" as Module,
      locked: false,
    });
    expect(codici(p)).toEqual(["LOCKED_MODULE_NOT_ALLOWED"]);
    // Gli stessi cinque difensori col 4-4-2 — un modulo che esiste — danno
    // invece l'incompatibilità: è la validità del modulo a fare la differenza.
    const conModuloVero = propose(fullRoster(), {
      lockedStarterIds: ["D1", "D2", "D3", "D4", "D5"],
      lockedModule: "442",
      locked: false,
    });
    expect(codici(conModuloVero)).toEqual(["LOCKED_MODULE_INCOMPATIBLE"]);
  });

  it("accanto a un traboccamento NON si dichiara l'incompatibilità: il suo messaggio sarebbe falso", () => {
    // Sei difensori col 4-4-2: il traboccamento è vero, e l'incompatibilità
    // direbbe «un altro modulo li reggerebbe» — che qui è FALSO, perché
    // nessuno dei sette ne schiera sei.
    const p = propose(fullRoster(), {
      lockedStarterIds: ["D1", "D2", "D3", "D4", "D5", "D6"],
      lockedModule: "442",
      locked: false,
    });
    expect(codici(p)).toEqual(["LOCKED_ROLE_OVERFLOW"]);
    expect(p.reason).not.toContain("reggerebbe");
  });

  it("senza formazione di partenza NON si dichiara nient'altro del ramo bloccato", () => {
    // `LOCKED_LINEUP_ILLEGAL` e `LOCKED_LINEUP_CONTRADICTS_CONSTRAINTS`
    // leggerebbero una formazione che non c'è, modulo imposto compreso.
    const p = propose(smallSquad(), { lockedStarterIds: ["A3"], lockedModule: "352", locked: true });
    expect(codici(p)).toEqual(["LOCKED_LINEUP_MISSING"]);
  });

  it("un imposto sconosciuto non diventa «fuori dagli undici» della formazione bloccata", () => {
    const p = propose(smallSquad(), { lockedStarterIds: ["Xfantasma"], locked: true }, SMALL_442);
    expect(codici(p)).toEqual(["LOCKED_PLAYER_UNKNOWN"]);
  });
});

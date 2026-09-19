import { describe, it, expect } from "vitest";
import {
  type GameweekContext,
  type Lineup,
  type PlayerForecast,
  type Role,
  proposeLineup,
} from "../src/index.js";

// PROVA DEL DIFETTO: il produttore deve essere invariante all'ordine con cui
// la rosa arriva in ingresso. Fixture sintetiche, nessun dato reale.

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
  expected: {
    baseVote,
    fantasyScore,
    receivedAnyBonus: extra.receivedAnyBonus ?? false,
    missedPenalty: extra.missedPenalty ?? false,
  },
});

/**
 * Rosa con MOLTE parità volontarie — due portieri identici, difensori e
 * attaccanti con voti ripetuti — e probabilità NON diadiche (0.62, 0.35, ...)
 * cosi' che i prodotti di probabilita' nell'enumerazione esatta non siano
 * rappresentabili esattamente in binario: e' li' che la somma in virgola
 * mobile puo' differire con l'ordine di iterazione.
 */
function squadWithTies(): PlayerForecast[] {
  return [
    fc("P1", "P", 6.5, 6.5, 0.62),
    fc("P2", "P", 6.5, 6.5, 0.62),
    fc("D1", "D", 6.0, 6.0, 0.35),
    fc("D2", "D", 6.0, 6.0, 0.78),
    fc("D3", "D", 6.5, 6.5, 1),
    fc("D4", "D", 6.5, 6.5, 1),
    fc("D5", "D", 6.0, 6.0, 0.55),
    fc("C1", "C", 6.0, 6.0, 1),
    fc("C2", "C", 6.0, 6.0, 1),
    fc("C3", "C", 6.5, 6.5, 0.41),
    fc("C4", "C", 6.5, 6.5, 0.69),
    fc("C5", "C", 6.0, 6.0, 1),
    fc("A1", "A", 6.5, 6.5, 1),
    fc("A2", "A", 6.5, 6.5, 1),
    fc("A3", "A", 6.0, 6.0, 0.5),
  ];
}

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

/** mulberry32, SOLO per generare permutazioni deterministiche della fixture
 * di prova: non ha niente a che fare con il PRNG del produttore. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Una decina di permutazioni deterministiche, non casuali fra loro: stesso
 * seme -> stesso elenco di permutazioni a ogni run. */
function permutationsOf(squad: readonly PlayerForecast[]): PlayerForecast[][] {
  const perms: PlayerForecast[][] = [squad.slice(), squad.slice().reverse()];
  for (let seed = 1; seed <= 38; seed += 1) perms.push(shuffled(squad, seed * 1000 + 7));
  return perms;
}

describe("invarianza all'ordine della rosa in ingresso", () => {
  it("la stessa rosa, in ordini diversi, produce la stessa identica formazione", () => {
    const base = squadWithTies();
    const perms = permutationsOf(base);

    const results = perms.map((squad) =>
      proposeLineup({
        squad,
        opponent: { lineup: OPP_LINEUP, players: opponentFlat() },
        context: CONTEXT,
      }),
    );

    const reference = results[0]!;
    expect(reference.feasible).toBe(true);

    for (let i = 1; i < results.length; i += 1) {
      const r = results[i]!;
      // Portiere compreso: e' il criterio esplicito della diagnosi.
      expect(r.lineup?.goalkeeperId, `permutazione ${i}: portiere diverso`).toBe(reference.lineup?.goalkeeperId);
      expect(r.lineup, `permutazione ${i}: formazione diversa`).toEqual(reference.lineup);
      expect(r.estimate.objectiveValue, `permutazione ${i}: objectiveValue diverso bit a bit`).toBe(
        reference.estimate.objectiveValue,
      );
      expect(r.estimate.expectedOurTotal, `permutazione ${i}: expectedOurTotal diverso bit a bit`).toBe(
        reference.estimate.expectedOurTotal,
      );
    }
  });
});

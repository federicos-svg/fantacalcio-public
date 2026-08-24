import { describe, it, expect } from "vitest";
import {
  EXPONENTIAL_TILT_MAX_ITERATIONS,
  EXPONENTIAL_TILT_TOLERANCE,
  VOTE_BIN_COUNT,
  VOTE_BIN_LABELS,
  VOTE_BIN_VALUES,
  VOTE_DISTRIBUTION_HALF_LIFE,
  VOTE_DISTRIBUTION_K_GRID,
  buildJointVoteDistribution,
  buildVoteDistribution,
  distributionMean,
  exponentialTilt,
  hasBonusFlag,
  normalizeCounts,
  poolRoleDistributions,
  shrinkVoteDistribution,
  voteBinIndex,
} from "../src/genProtocol/voteDistribution.js";
import type { MatchdayVote } from "../src/genProtocol/genTypes.js";

function vote(votoBase: number | null, overrides: Partial<MatchdayVote> = {}): MatchdayVote {
  return {
    season: "2019_20",
    matchday: 1,
    votoBase,
    isAsterisk: false,
    Gf: 0,
    Gs: 0,
    Rp: 0,
    Rs: 0,
    Rf: 0,
    Au: 0,
    Amm: 0,
    Esp: 0,
    Ass: 0,
    ...overrides,
  };
}

describe("genProtocol/voteDistribution — i 9 bin di §A.3", () => {
  it("le etichette e i loro indici sono quelli del protocollo (prova per mutazione)", () => {
    expect(VOTE_BIN_COUNT).toBe(9);
    expect(VOTE_BIN_LABELS).toEqual(["<=4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", ">=8"]);
    expect(voteBinIndex(3)).toBe(0);
    expect(voteBinIndex(4)).toBe(0);
    expect(voteBinIndex(4.5)).toBe(1);
    expect(voteBinIndex(5)).toBe(2);
    expect(voteBinIndex(5.5)).toBe(3);
    expect(voteBinIndex(6)).toBe(4);
    expect(voteBinIndex(6.5)).toBe(5);
    expect(voteBinIndex(7)).toBe(6);
    expect(voteBinIndex(7.5)).toBe(7);
    expect(voteBinIndex(8)).toBe(8);
    expect(voteBinIndex(10)).toBe(8);
  });

  it("un voto interno FUORI griglia 0,5 non viene arrotondato: e' null", () => {
    expect(voteBinIndex(6.25)).toBeNull();
    expect(voteBinIndex(7.1)).toBeNull();
    // Le code invece sono bande e assorbono qualunque valore.
    expect(voteBinIndex(3.7)).toBe(0);
    expect(voteBinIndex(8.3)).toBe(8);
  });

  it("i valori rappresentativi dei bin sono la griglia con le code al confine", () => {
    expect(VOTE_BIN_VALUES).toEqual([4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8]);
  });

  it("conta solo le presenze valide e mette i fuori griglia in un contatore suo", () => {
    const distribution = buildVoteDistribution([
      vote(6),
      vote(6),
      vote(7.5),
      vote(null), // SV: non e' presenza, non e' uno zero
      vote(6.25), // fuori griglia: contato a parte, mai arrotondato
    ]);
    expect(distribution.presences).toBe(3);
    expect(distribution.offGridPresences).toBe(1);
    expect(distribution.counts).toEqual([0, 0, 0, 0, 2, 0, 0, 1, 0]);
  });

  it("la congiunta A ha 18 bin e il flag e' gol ∨ assist ∨ rigore sbagliato", () => {
    expect(hasBonusFlag(vote(7, { Gf: 1 }))).toBe(true);
    expect(hasBonusFlag(vote(7, { Ass: 1 }))).toBe(true);
    expect(hasBonusFlag(vote(7, { Rs: 1 }))).toBe(true);
    // `Rf` NON alza il flag, e dal 2026-08-24 questa riga sorveglia una
    // tensione aperta invece di una verita': la tariffa ora paga il rigore
    // segnato come un gol, ma §A.3 fissa il predicato alla lettera e §C lo
    // congela. Il test tiene ferma la lettera del protocollo; la conseguenza
    // (chi segna solo su rigore risulta «senza bonus» ed e' quindi eleggibile
    // al modificatore attacco) e' scritta accanto a `hasBonusFlag` ed e'
    // decisione di Pico, non di questo test.
    expect(hasBonusFlag(vote(7, { Rf: 1 }))).toBe(false);
    expect(hasBonusFlag(vote(7, { Amm: 1 }))).toBe(false);

    const joint = buildJointVoteDistribution([vote(7), vote(7, { Ass: 1 }), vote(6, { Gf: 2 })]);
    expect(joint.counts).toHaveLength(18);
    expect(joint.counts[6]).toBe(1); // 7 senza bonus
    expect(joint.counts[6 + 9]).toBe(1); // 7 con bonus
    expect(joint.counts[4 + 9]).toBe(1); // 6 con bonus
    expect(joint.presences).toBe(3);
  });

  it("normalizeCounts restituisce null su somma nulla, mai una uniforme inventata", () => {
    expect(normalizeCounts([0, 0, 0])).toBeNull();
    expect(normalizeCounts([1, 3])).toEqual([0.25, 0.75]);
  });
});

describe("genProtocol/voteDistribution — shrinkage verso il ruolo (§D.9)", () => {
  const roleDistribution = [0, 0, 0, 0, 1, 0, 0, 0, 0]; // il ruolo e' tutto sul bin «6»
  const playerSeason = { season: "2019_20", counts: [0, 0, 0, 0, 0, 0, 1, 0, 0] }; // il giocatore e' tutto su «7»

  it("k ∈ {10, 20, 40, 80} e half-life 3 (fissato, non tunato)", () => {
    expect(VOTE_DISTRIBUTION_K_GRID).toEqual([10, 20, 40, 80]);
    expect(VOTE_DISTRIBUTION_HALF_LIFE).toBe(3);
  });

  it("k grande schiaccia il giocatore sulla distribuzione di ruolo", () => {
    const observations = Array.from({ length: 10 }, () => playerSeason);
    const weak = shrinkVoteDistribution(observations, roleDistribution, 10, "2019_20");
    const strong = shrinkVoteDistribution(observations, roleDistribution, 80, "2019_20");
    expect(weak.probabilities[6]!).toBeGreaterThan(strong.probabilities[6]!);
    expect(strong.probabilities[4]!).toBeGreaterThan(weak.probabilities[4]!);
    // n_eff = 10 presenze, k = 10 -> esattamente meta' e meta'.
    expect(weak.effectiveSample).toBe(10);
    expect(weak.shrinkageWeight).toBe(0.5);
    expect(weak.probabilities[6]).toBeCloseTo(0.5, 12);
    expect(weak.probabilities[4]).toBeCloseTo(0.5, 12);
  });

  it("nessuna osservazione -> la distribuzione di ruolo, senza buchi trattati come certezze", () => {
    const result = shrinkVoteDistribution([], roleDistribution, 20, "2019_20");
    expect(result.probabilities).toEqual(roleDistribution);
    expect(result.shrinkageWeight).toBe(0);
  });

  it("la recency pesa le stagioni: con h=3, tre anni prima valgono meta'", () => {
    const result = shrinkVoteDistribution(
      [
        { season: "2016_17", counts: [0, 0, 0, 0, 0, 0, 4, 0, 0] },
        { season: "2019_20", counts: [0, 0, 0, 0, 4, 0, 0, 0, 0] },
      ],
      roleDistribution,
      0,
      "2019_20",
    );
    // 4·0,5 = 2 sul bin «7», 4·1 = 4 sul bin «6» -> n_eff = 6.
    expect(result.effectiveSample).toBeCloseTo(6, 12);
    expect(result.probabilities[6]).toBeCloseTo(1 / 3, 12);
    expect(result.probabilities[4]).toBeCloseTo(2 / 3, 12);
  });

  it("le probabilita' sommano a 1", () => {
    const result = shrinkVoteDistribution([playerSeason], roleDistribution, 20, "2019_20");
    expect(result.probabilities.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 12);
  });

  it("poolRoleDistributions somma per ruolo e normalizza", () => {
    const pooled = poolRoleDistributions([
      { role: "A", counts: [0, 0, 0, 0, 2, 0, 0, 0, 0] },
      { role: "A", counts: [0, 0, 0, 0, 0, 0, 2, 0, 0] },
      { role: "D", counts: [1, 0, 0, 0, 0, 0, 0, 0, 0] },
    ]);
    expect(pooled.A).toEqual([0, 0, 0, 0, 0.5, 0, 0.5, 0, 0]);
    expect(pooled.D![0]).toBe(1);
    expect(pooled.P).toBeUndefined();
  });
});

describe("genProtocol/voteDistribution — tilting esponenziale (§D.9)", () => {
  const flat = new Array<number>(9).fill(1 / 9);

  it("tolleranza 1e-9 e massimo 100 iterazioni", () => {
    expect(EXPONENTIAL_TILT_TOLERANCE).toBe(1e-9);
    expect(EXPONENTIAL_TILT_MAX_ITERATIONS).toBe(100);
  });

  it("centra la media richiesta, verificata numericamente", () => {
    for (const target of [5.5, 6, 6.4, 7]) {
      const result = exponentialTilt(flat, target);
      expect(result.converged).toBe(true);
      expect(distributionMean(result.probabilities)).toBeCloseTo(target, 8);
      expect(result.mean).toBeCloseTo(target, 8);
      expect(result.probabilities.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 12);
    }
  });

  it("una media richiesta piu' alta sposta massa sui bin alti (θ > 0)", () => {
    const up = exponentialTilt(flat, 7);
    const down = exponentialTilt(flat, 5);
    expect(up.theta).toBeGreaterThan(0);
    expect(down.theta).toBeLessThan(0);
    expect(up.probabilities[8]!).toBeGreaterThan(flat[8]!);
    expect(down.probabilities[8]!).toBeLessThan(flat[8]!);
  });

  it("una media gia' corretta lascia θ a 0 e la distribuzione intatta", () => {
    const mean = distributionMean(flat);
    const result = exponentialTilt(flat, mean);
    expect(result.converged).toBe(true);
    expect(result.theta).toBe(0);
    // Identita' a meno della rinormalizzazione (i 9 noni non sommano a 1 esatto
    // in virgola mobile): nessun bin si sposta.
    result.probabilities.forEach((p, b) => expect(p).toBeCloseTo(flat[b]!, 15));
  });

  it("media fuori dal supporto: converged=false e distribuzione NON ricentrata, senza eccezioni", () => {
    for (const impossible of [12, 1, NaN]) {
      const result = exponentialTilt(flat, impossible);
      expect(result.converged).toBe(false);
      expect(result.probabilities).toEqual(flat);
      expect(result.mean).toBeCloseTo(distributionMean(flat), 12);
    }
  });

  it("una distribuzione degenere (un solo bin) non puo' essere ricentrata altrove", () => {
    const degenerate = [0, 0, 0, 0, 1, 0, 0, 0, 0];
    const result = exponentialTilt(degenerate, 7);
    expect(result.converged).toBe(false);
    expect(result.probabilities).toEqual(degenerate);
  });

  it("rifiuta lunghezze disallineate", () => {
    expect(() => exponentialTilt([0.5, 0.5], 6)).toThrow();
    expect(() => exponentialTilt([], 6, [])).toThrow();
  });
});

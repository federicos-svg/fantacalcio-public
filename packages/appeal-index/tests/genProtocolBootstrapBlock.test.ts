import { describe, it, expect } from "vitest";
import {
  GEN_BOOTSTRAP_REPLICATES,
  GEN_BOOTSTRAP_SEED,
  MIN_SEASON_BLOCKS_FOR_INTERVAL,
  pairedBlockDifferences,
  seasonBlockBootstrap,
} from "../src/genProtocol/bootstrapBlock.js";

describe("genProtocol/bootstrapBlock — costanti preregistrate (§B.4.6, §C)", () => {
  it("2.000 repliche e seed 20260902 — valori attesi scritti a mano", () => {
    expect(GEN_BOOTSTRAP_REPLICATES).toBe(2000);
    expect(GEN_BOOTSTRAP_SEED).toBe(20260902);
  });

  it("la soglia minima di blocchi e' quella riusata da phase4Selection", () => {
    expect(MIN_SEASON_BLOCKS_FOR_INTERVAL).toBe(5);
  });
});

describe("genProtocol/bootstrapBlock — l'intervallo percentile", () => {
  const sevenFolds = [-0.5, -0.4, -0.6, -0.55, -0.45, -0.5, -0.52];

  it("esclude lo zero quando ogni blocco punta nella stessa direzione", () => {
    const interval = seasonBlockBootstrap(sevenFolds);
    expect(interval.insufficientBlocks).toBe(false);
    expect(interval.blocks).toBe(7);
    expect(interval.observedMean).toBeCloseTo(-0.503, 3);
    expect(interval.upper!).toBeLessThan(0);
    expect(interval.containsZero).toBe(false);
  });

  it("contiene lo zero quando i blocchi si contraddicono", () => {
    const interval = seasonBlockBootstrap([-1, 1, -1, 1, -1, 1, 0]);
    expect(interval.containsZero).toBe(true);
    expect(interval.lower!).toBeLessThan(0);
    expect(interval.upper!).toBeGreaterThan(0);
  });

  it("l'intervallo contiene sempre la media osservata", () => {
    for (const values of [sevenFolds, [1, 2, 3, 4, 5], [-3, 0, 3, 6, 9, 12]]) {
      const interval = seasonBlockBootstrap(values);
      expect(interval.lower!).toBeLessThanOrEqual(interval.observedMean);
      expect(interval.upper!).toBeGreaterThanOrEqual(interval.observedMean);
    }
  });

  it("RIFIUTA l'intervallo sotto 5 blocchi — i due fold di T3 danno NO_VERDICT", () => {
    const t3 = seasonBlockBootstrap([-0.9, -0.8]);
    expect(t3.insufficientBlocks).toBe(true);
    expect(t3.lower).toBeNull();
    expect(t3.upper).toBeNull();
    expect(t3.containsZero).toBe(false);
    // Con un blocco solo il percentile avrebbe ampiezza zero: sarebbe il
    // verdetto piu' forte possibile costruito sull'input meno informativo.
    expect(seasonBlockBootstrap([-1]).insufficientBlocks).toBe(true);
    expect(seasonBlockBootstrap([1, 2, 3, 4]).insufficientBlocks).toBe(true);
    expect(seasonBlockBootstrap([1, 2, 3, 4, 5]).insufficientBlocks).toBe(false);
  });

  it("un'evidenza piu' netta produce un intervallo che si allontana dallo zero", () => {
    const weak = seasonBlockBootstrap([-0.1, 0.05, -0.2, 0.1, -0.05, 0.02, -0.03]);
    const strong = seasonBlockBootstrap([-5, -4.8, -5.2, -4.9, -5.1, -5, -4.95]);
    expect(weak.containsZero).toBe(true);
    expect(strong.containsZero).toBe(false);
    expect(strong.upper!).toBeLessThan(weak.lower!);
  });

  it("un livello piu' alto produce un intervallo non piu' stretto", () => {
    const at95 = seasonBlockBootstrap(sevenFolds, { level: 0.95 });
    const at50 = seasonBlockBootstrap(sevenFolds, { level: 0.5 });
    expect(at95.upper! - at95.lower!).toBeGreaterThanOrEqual(at50.upper! - at50.lower!);
  });

  it("doppia esecuzione byte-identica, e semi diversi danno intervalli diversi", () => {
    const a = seasonBlockBootstrap(sevenFolds, { replicates: 500, seed: 20260902 });
    const b = seasonBlockBootstrap(sevenFolds, { replicates: 500, seed: 20260902 });
    const c = seasonBlockBootstrap(sevenFolds, { replicates: 500, seed: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.lower).not.toBe(c.lower);
  });

  it("rifiuta input vuoti, non finiti e repliche non positive", () => {
    expect(() => seasonBlockBootstrap([])).toThrow();
    expect(() => seasonBlockBootstrap([1, NaN, 3, 4, 5])).toThrow();
    expect(() => seasonBlockBootstrap(sevenFolds, { replicates: 0 })).toThrow();
    expect(() => seasonBlockBootstrap(sevenFolds, { level: 1 })).toThrow();
  });
});

describe("genProtocol/bootstrapBlock — differenze paired", () => {
  it("candidato meno baseline: negativo = il candidato sbaglia meno", () => {
    expect(pairedBlockDifferences([1, 2, 3], [2, 2, 5])).toEqual([-1, 0, -2]);
  });

  it("rifiuta un confronto su insiemi di blocchi diversi (non sarebbe paired)", () => {
    expect(() => pairedBlockDifferences([1, 2], [1])).toThrow(/same non-empty set of blocks/);
    expect(() => pairedBlockDifferences([], [])).toThrow();
  });
});

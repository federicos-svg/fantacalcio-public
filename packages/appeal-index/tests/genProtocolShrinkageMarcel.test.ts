import { describe, it, expect } from "vitest";
import {
  MARCEL_GRID,
  MARCEL_HALF_LIFE_GRID,
  MARCEL_K_GRID,
  fitMarcel,
  predictMarcel,
  type MarcelTrainingRow,
} from "../src/genProtocol/shrinkageMarcel.js";

const TRAIN: readonly MarcelTrainingRow[] = [
  { playerKey: "d1", role: "D", season: "2018_19", value: 5, presences: 30 },
  { playerKey: "d2", role: "D", season: "2018_19", value: 7, presences: 30 },
  { playerKey: "a1", role: "A", season: "2018_19", value: 8, presences: 30 },
  { playerKey: "a2", role: "A", season: "2018_19", value: 10, presences: 30 },
];

describe("genProtocol/shrinkageMarcel — griglie interne (§D.2, FAM-1)", () => {
  it("k ∈ {5, 10, 20, 40} e half-life ∈ {1,5; 3; ∞} — valori attesi scritti a mano", () => {
    expect(MARCEL_K_GRID).toEqual([5, 10, 20, 40]);
    expect(MARCEL_HALF_LIFE_GRID).toEqual([1.5, 3, Number.POSITIVE_INFINITY]);
    expect(MARCEL_GRID).toHaveLength(12);
    expect(MARCEL_GRID[0]).toEqual({ k: 5, halfLife: 1.5 });
    expect(MARCEL_GRID[11]).toEqual({ k: 40, halfLife: Number.POSITIVE_INFINITY });
  });
});

describe("genProtocol/shrinkageMarcel — fit e shrinkage", () => {
  it("le medie di ruolo sono le medie aritmetiche del train, per ruolo", () => {
    const fitted = fitMarcel(TRAIN, { k: 10, halfLife: 3 }, "2018_19");
    expect(fitted.roleMeans.D).toBe(6);
    expect(fitted.roleMeans.A).toBe(9);
    expect(fitted.roleMeans.P).toBeUndefined();
    expect(fitted.roleRowCounts.D).toBe(2);
    expect(fitted.trainingRowCount).toBe(4);
    expect(fitted.artifactVersion).toBe("gen-marcel-parameters-v1");
  });

  it("shrinkage a mano: n_eff = 20, k = 20 -> meta' giocatore, meta' ruolo", () => {
    const fitted = fitMarcel(TRAIN, { k: 20, halfLife: Number.POSITIVE_INFINITY }, "2018_19");
    // Una stagione, peso recency 1 (Δ=0), 20 presenze -> n_eff = 20.
    const result = predictMarcel(fitted, "D", [{ season: "2018_19", value: 10, presences: 20 }]);
    expect(result.effectiveSample).toBe(20);
    expect(result.shrinkageWeight).toBe(0.5);
    // 0,5·10 + 0,5·6 = 8
    expect(result.prediction).toBe(8);
  });

  it("k piu' grande = piu' shrinkage verso il ruolo, monotonicamente", () => {
    const previous: number[] = [];
    for (const k of MARCEL_K_GRID) {
      const fitted = fitMarcel(TRAIN, { k, halfLife: Number.POSITIVE_INFINITY }, "2018_19");
      previous.push(predictMarcel(fitted, "D", [{ season: "2018_19", value: 10, presences: 20 }]).prediction);
    }
    for (let i = 1; i < previous.length; i++) expect(previous[i]!).toBeLessThan(previous[i - 1]!);
    // Il limite e' la media di ruolo, mai oltre.
    for (const p of previous) expect(p).toBeGreaterThan(6);
  });

  it("la recency pesa: con h=3 una stagione di 3 anni fa vale meta' della piu' recente", () => {
    const fitted = fitMarcel(TRAIN, { k: 0, halfLife: 3 }, "2018_19");
    const result = predictMarcel(fitted, "D", [
      { season: "2015_16", value: 10, presences: 10 }, // Δ=3 -> peso 0,5 -> 5
      { season: "2018_19", value: 4, presences: 10 }, // Δ=0 -> peso 1 -> 10
    ]);
    expect(result.effectiveSample).toBeCloseTo(15, 12);
    // (5·10 + 10·4)/15 = 90/15 = 6
    expect(result.playerMean).toBeCloseTo(6, 12);
    expect(result.prediction).toBeCloseTo(6, 12);
  });

  it("h = ∞ significa pesi uniformi: le due stagioni contano solo per le presenze", () => {
    const fitted = fitMarcel(TRAIN, { k: 0, halfLife: Number.POSITIVE_INFINITY }, "2018_19");
    const result = predictMarcel(fitted, "D", [
      { season: "2015_16", value: 10, presences: 10 },
      { season: "2018_19", value: 4, presences: 10 },
    ]);
    expect(result.playerMean).toBe(7);
  });

  it("senza stagioni osservate restituisce la media di ruolo, e sa scorare comunque la riga", () => {
    const fitted = fitMarcel(TRAIN, { k: 10, halfLife: 3 }, "2018_19");
    const result = predictMarcel(fitted, "A", []);
    expect(result.prediction).toBe(9);
    expect(result.shrinkageWeight).toBe(0);
    expect(result.playerMean).toBeNaN();
  });

  it("una stagione con 0 presenze non pesa e non porta un valore inventato", () => {
    const fitted = fitMarcel(TRAIN, { k: 10, halfLife: 3 }, "2018_19");
    const result = predictMarcel(fitted, "D", [{ season: "2018_19", value: NaN, presences: 0 }]);
    expect(result.prediction).toBe(6);
    expect(result.effectiveSample).toBe(0);
  });

  it("un ruolo assente dal train fallisce invece di inventare un pavimento", () => {
    const fitted = fitMarcel(TRAIN, { k: 10, halfLife: 3 }, "2018_19");
    expect(() => predictMarcel(fitted, "P", [])).toThrow(/no role mean/);
  });

  it("l'artefatto e' serializzabile e ricostruisce la stessa predizione", () => {
    const fitted = fitMarcel(TRAIN, { k: 20, halfLife: 3 }, "2018_19");
    const roundTripped = JSON.parse(JSON.stringify(fitted)) as typeof fitted;
    const observations = [{ season: "2017_18", value: 9, presences: 25 }];
    expect(predictMarcel(roundTripped, "D", observations).prediction).toBe(
      predictMarcel(fitted, "D", observations).prediction,
    );
  });

  it("rifiuta k negativo, half-life non positivo e train vuoto", () => {
    expect(() => fitMarcel(TRAIN, { k: -1, halfLife: 3 }, "2018_19")).toThrow();
    expect(() => fitMarcel(TRAIN, { k: 10, halfLife: 0 }, "2018_19")).toThrow();
    expect(() => fitMarcel([], { k: 10, halfLife: 3 }, "2018_19")).toThrow();
  });
});

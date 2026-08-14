import { describe, it, expect } from "vitest";
import { regressionTreeTrainer } from "../src/models/regressionTree.js";
import { FEATURE_NAMES, type FeatureRow } from "../src/types.js";

let nextId = 0;
function featureRow(fantamediaLag1: number, nSeasonsObserved: number, target: number): FeatureRow {
  const base = Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])) as Record<(typeof FEATURE_NAMES)[number], number>;
  return {
    playerKey: `id:${nextId++}`,
    name: "Synthetic Player",
    role: "C",
    featureSeason: "2020_21",
    targetSeason: "2021_22",
    features: { ...base, fantamediaLag1, nSeasonsObserved, roleC: 1 },
    targets: { fantamediaNext: target, presenzeNext: 20 },
    sourceSeasons: ["2020_21"],
  };
}

describe("regressionTreeTrainer", () => {
  it("learns a simple threshold split", () => {
    const train = [
      featureRow(4, 1, 4),
      featureRow(4.2, 1, 4),
      featureRow(4.1, 1, 4),
      featureRow(4.3, 1, 4),
      featureRow(9, 1, 9),
      featureRow(9.2, 1, 9),
      featureRow(9.1, 1, 9),
      featureRow(9.3, 1, 9),
    ];
    const predictor = regressionTreeTrainer(2, 2).fit(train, "fantamediaNext");
    expect(predictor.predict(featureRow(4.05, 1, 0).features)).toBeCloseTo(4, 1);
    expect(predictor.predict(featureRow(9.05, 1, 0).features)).toBeCloseTo(9, 1);
  });

  it("falls back to a single leaf (the mean) when no split reduces variance", () => {
    const train = [featureRow(1, 1, 5), featureRow(1, 1, 5), featureRow(1, 1, 5), featureRow(1, 1, 5)];
    const predictor = regressionTreeTrainer(3, 1).fit(train, "fantamediaNext");
    expect(predictor.predict(featureRow(1, 1, 0).features)).toBe(5);
  });

  it("is deterministic — identical input yields identical output", () => {
    const train = [featureRow(4, 1, 4), featureRow(9, 1, 9), featureRow(5, 2, 5), featureRow(8, 2, 8)];
    const p1 = regressionTreeTrainer().fit(train, "fantamediaNext");
    const p2 = regressionTreeTrainer().fit(train, "fantamediaNext");
    const query = featureRow(6, 1, 0).features;
    expect(p1.predict(query)).toBe(p2.predict(query));
  });

  it("throws when fit with no training rows", () => {
    expect(() => regressionTreeTrainer().fit([], "fantamediaNext")).toThrow();
  });
});

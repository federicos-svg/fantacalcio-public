import { describe, it, expect } from "vitest";
import { knnRegressionTrainer } from "../src/models/knnRegression.js";
import { FEATURE_NAMES, type FeatureRow } from "../src/types.js";

let nextId = 0;
function featureRow(fantamediaLag1: number, target: number): FeatureRow {
  const base = Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])) as Record<(typeof FEATURE_NAMES)[number], number>;
  return {
    playerKey: `id:${nextId++}`,
    name: "Synthetic Player",
    role: "C",
    featureSeason: "2020_21",
    targetSeason: "2021_22",
    features: { ...base, fantamediaLag1, roleC: 1 },
    targets: { fantamediaNext: target, presenzeNext: 20 },
    sourceSeasons: ["2020_21"],
  };
}

describe("knnRegressionTrainer", () => {
  it("predicts the mean of the k nearest neighbors by target value", () => {
    const train = [featureRow(1, 10), featureRow(2, 20), featureRow(3, 30), featureRow(100, 1000)];
    const predictor = knnRegressionTrainer(3).fit(train, "fantamediaNext");
    // nearest 3 to query=2 are 1,2,3 -> mean(10,20,30) = 20
    expect(predictor.predict(featureRow(2, 0).features)).toBeCloseTo(20);
  });

  it("clamps k to the training set size when k exceeds it", () => {
    const train = [featureRow(1, 10), featureRow(2, 20)];
    const predictor = knnRegressionTrainer(5).fit(train, "fantamediaNext");
    expect(predictor.predict(featureRow(1.5, 0).features)).toBeCloseTo(15);
  });

  it("is deterministic — identical input yields identical output", () => {
    const train = [featureRow(1, 10), featureRow(2, 20), featureRow(3, 30)];
    const p1 = knnRegressionTrainer(2).fit(train, "fantamediaNext");
    const p2 = knnRegressionTrainer(2).fit(train, "fantamediaNext");
    const query = featureRow(2.5, 0).features;
    expect(p1.predict(query)).toBe(p2.predict(query));
  });

  it("throws when fit with no training rows", () => {
    expect(() => knnRegressionTrainer().fit([], "fantamediaNext")).toThrow();
  });
});

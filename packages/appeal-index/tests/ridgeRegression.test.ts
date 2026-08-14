import { describe, it, expect } from "vitest";
import { ridgeRegressionTrainer } from "../src/models/ridgeRegression.js";
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

describe("ridgeRegressionTrainer", () => {
  it("fits a near-linear relationship reasonably well", () => {
    const train = [featureRow(5, 5), featureRow(6, 6), featureRow(7, 7), featureRow(8, 8)];
    const predictor = ridgeRegressionTrainer(0.1).fit(train, "fantamediaNext");
    const prediction = predictor.predict(featureRow(6.5, 0).features);
    expect(prediction).toBeGreaterThan(5.5);
    expect(prediction).toBeLessThan(7.5);
  });

  it("is deterministic — identical input yields identical output", () => {
    const train = [featureRow(5, 5), featureRow(6, 6), featureRow(7, 7)];
    const p1 = ridgeRegressionTrainer().fit(train, "fantamediaNext");
    const p2 = ridgeRegressionTrainer().fit(train, "fantamediaNext");
    const query = featureRow(6.2, 0).features;
    expect(p1.predict(query)).toBe(p2.predict(query));
  });

  it("throws when fit with no training rows", () => {
    expect(() => ridgeRegressionTrainer().fit([], "fantamediaNext")).toThrow();
  });

  it("standardization is fit on the given rows only (never on a query row)", () => {
    const train = [featureRow(5, 5), featureRow(6, 6)];
    const predictor = ridgeRegressionTrainer().fit(train, "fantamediaNext");
    // an extreme query value must not change the fitted model's behavior on a repeat query
    predictor.predict(featureRow(10000, 0).features);
    const query = featureRow(5.5, 0).features;
    const before = predictor.predict(query);
    predictor.predict(featureRow(-10000, 0).features);
    const after = predictor.predict(query);
    expect(before).toBe(after);
  });
});

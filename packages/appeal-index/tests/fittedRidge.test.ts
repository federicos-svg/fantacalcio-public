import { describe, expect, it } from "vitest";
import { fitRidgeParameters, predictWithFittedRidge } from "../src/models/fittedRidge.js";
import { ridgeRegressionTrainer } from "../src/models/ridgeRegression.js";
import type { FeatureRow, FeatureVector } from "../src/types.js";

function features(x: number): FeatureVector {
  return {
    fantamediaLag1: x,
    fantamediaRollingMean3: x + 0.1,
    presenzeLag1: 20 + x,
    presenzeRollingMean3: 19 + x,
    volatilitaVotoLastObserved: 0.3 + x / 100,
    nSeasonsObserved: 3,
    golFattiRollingMean3: x / 2,
    assistRollingMean3: x / 3,
    teamChangedFlag: 0,
    ageAtSeasonStart: 26 + x / 10,
    roleP: 0,
    roleD: 1,
    roleC: 0,
    roleA: 0,
  };
}

function row(index: number): FeatureRow {
  return {
    playerKey: `id:${index}`,
    name: `Synthetic ${index}`,
    role: "D",
    featureSeason: "2022_23",
    targetSeason: "2023_24",
    features: features(index),
    targets: { fantamediaNext: index * 1.5 + 2, presenzeNext: index + 20 },
    targetAvailability: { fantamediaNext: "observed", presenzeNext: "observed" },
    sourceSeasons: ["2020_21", "2021_22", "2022_23"],
  };
}

describe("fitted ridge artifact", () => {
  it("predicts exactly like the closed trainer on the same data", () => {
    const rows = [1, 2, 3, 4, 5].map(row);
    const parameters = fitRidgeParameters(rows, "fantamediaNext", 1);
    const trained = ridgeRegressionTrainer(1).fit(rows, "fantamediaNext");
    const input = features(6);
    expect(predictWithFittedRidge(parameters, input)).toBeCloseTo(trained.predict(input), 12);
    expect(parameters.featureNames).toHaveLength(parameters.coefficients.length);
    expect(parameters.trainingRowCount).toBe(rows.length);
  });

  it("is deterministic for identical rows", () => {
    const rows = [1, 2, 3, 4, 5].map(row);
    expect(JSON.stringify(fitRidgeParameters(rows, "fantamediaNext", 1))).toBe(
      JSON.stringify(fitRidgeParameters(rows, "fantamediaNext", 1)),
    );
  });
});

import { describe, expect, it } from "vitest";
import { buildFeatureRows, buildPlayerSeasonPanel } from "../src/dataset.js";
import { buildGoalkeeperCohortSeasons } from "../fixtures/syntheticSeasons.js";
import { GOALKEEPER_FAMILY_FEATURES, GOALKEEPER_FAMILY_LADDER } from "../src/goalkeeperFeatures.js";
import { fitGoalkeeperRidge, goalkeeperCompleteCaseRows } from "../src/models/goalkeeperRidge.js";
import {
  fitGoalkeeperRidgeParameters,
  matchesGoalkeeperFeatureContract,
  predictWithFittedGoalkeeperRidge,
} from "../src/models/fittedGoalkeeperRidge.js";
import { familyParameterCount } from "../src/phase4Protocol.js";

const SEASONS = ["2019_20", "2020_21", "2021_22", "2022_23", "2023_24", "2024_25"];

function goalkeeperRows() {
  return buildFeatureRows(buildPlayerSeasonPanel(buildGoalkeeperCohortSeasons(SEASONS, 60)));
}

describe("fitGoalkeeperRidgeParameters", () => {
  it("produces a serializable artifact that survives a JSON round trip", () => {
    const fitted = fitGoalkeeperRidgeParameters(goalkeeperRows(), "goalkeeper_specific_core", "fantamediaNext", 1);
    const roundTripped = JSON.parse(JSON.stringify(fitted)) as typeof fitted;
    expect(roundTripped).toEqual(fitted);
    expect(roundTripped.featureNames).toEqual([...GOALKEEPER_FAMILY_FEATURES.goalkeeper_specific_core]);
  });

  it("estimates exactly the family's declared degrees of freedom", () => {
    for (const family of GOALKEEPER_FAMILY_LADDER) {
      const fitted = fitGoalkeeperRidgeParameters(goalkeeperRows(), family, "fantamediaNext", 1);
      expect(fitted.coefficients.length + 1).toBe(familyParameterCount(family, "P"));
      expect(fitted.standardizerMeans.length).toBe(fitted.coefficients.length);
      expect(fitted.standardizerStds.length).toBe(fitted.coefficients.length);
    }
  });

  it("reports the complete-case row count it was really fitted on, not the role count", () => {
    const rows = goalkeeperRows();
    const fitted = fitGoalkeeperRidgeParameters(rows, "goalkeeper_specific_full", "fantamediaNext", 1);
    expect(fitted.trainingRowCount).toBe(
      goalkeeperCompleteCaseRows(rows, "goalkeeper_specific_full", "fantamediaNext").length,
    );
    expect(fitted.trainingRowCount).toBeLessThanOrEqual(rows.filter((row) => row.role === "P").length);
  });

  it("predicts exactly what the closure estimator predicts on the same rows", () => {
    const rows = goalkeeperRows();
    const family = "goalkeeper_specific_core" as const;
    const complete = goalkeeperCompleteCaseRows(rows, family, "fantamediaNext");
    const closure = fitGoalkeeperRidge(complete, family, "fantamediaNext", 1);
    const parameters = fitGoalkeeperRidgeParameters(rows, family, "fantamediaNext", 1);
    for (const row of complete.slice(0, 25)) {
      expect(predictWithFittedGoalkeeperRidge(parameters, row.goalkeeperFeatures!)).toBeCloseTo(
        closure.predict(row),
        10,
      );
    }
  });

  it("is deterministic", () => {
    const rows = goalkeeperRows();
    expect(JSON.stringify(fitGoalkeeperRidgeParameters(rows, "goalkeeper_specific_minimal", "presenzeNext", 10)))
      .toBe(JSON.stringify(fitGoalkeeperRidgeParameters(rows, "goalkeeper_specific_minimal", "presenzeNext", 10)));
  });

  it("refuses a negative or non-finite lambda", () => {
    const rows = goalkeeperRows();
    expect(() => fitGoalkeeperRidgeParameters(rows, "goalkeeper_specific_core", "fantamediaNext", -1))
      .toThrow("lambda must be finite and non-negative");
    expect(() => fitGoalkeeperRidgeParameters(rows, "goalkeeper_specific_core", "fantamediaNext", Number.NaN))
      .toThrow("lambda must be finite and non-negative");
  });

  it("refuses to fit when no complete-case goalkeeper row exists", () => {
    const outfield = goalkeeperRows().filter((row) => row.role !== "P");
    expect(() => fitGoalkeeperRidgeParameters(outfield, "goalkeeper_specific_core", "fantamediaNext", 1))
      .toThrow("no complete-case training rows");
  });
});

describe("predictWithFittedGoalkeeperRidge", () => {
  const rows = goalkeeperRows();
  const parameters = fitGoalkeeperRidgeParameters(rows, "goalkeeper_specific_core", "fantamediaNext", 1);
  const sample = goalkeeperCompleteCaseRows(rows, "goalkeeper_specific_core", "fantamediaNext")[0]!;

  it("accepts an artifact that still matches its family's declared vector", () => {
    expect(matchesGoalkeeperFeatureContract(parameters)).toBe(true);
    expect(Number.isFinite(predictWithFittedGoalkeeperRidge(parameters, sample.goalkeeperFeatures!))).toBe(true);
  });

  it("reports — and then refuses — an artifact whose vector no longer matches the family", () => {
    const stale = { ...parameters, coefficients: parameters.coefficients.slice(0, -1) };
    expect(matchesGoalkeeperFeatureContract(stale)).toBe(false);
    expect(() => predictWithFittedGoalkeeperRidge(stale, sample.goalkeeperFeatures!))
      .toThrow("parameter shape mismatch");
  });

  it("refuses a row whose vector is incomplete for this family instead of imputing it", () => {
    const holed = { ...sample.goalkeeperFeatures!, porteInviolateRateRollingMean3: Number.NaN };
    expect(() => predictWithFittedGoalkeeperRidge(parameters, holed))
      .toThrow("feature vector contains non-finite values");
  });

  it("scores a vector that is incomplete only OUTSIDE this family's own features", () => {
    // `goalkeeper_specific_core` does not estimate on `volatilitaVotoLastObserved`,
    // so a hole there is none of its business — the lean rungs of the ladder
    // exist precisely so a partially observed goalkeeper is still servable.
    const holed = { ...sample.goalkeeperFeatures!, volatilitaVotoLastObserved: Number.NaN };
    expect(Number.isFinite(predictWithFittedGoalkeeperRidge(parameters, holed))).toBe(true);
  });
});

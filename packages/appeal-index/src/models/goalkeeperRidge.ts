/**
 * Ridge over the goalkeeper feature vector — PURE.
 *
 * Same estimator as the pooled family (`ridgeCore.solveRidge`) and the same
 * standardization rule (`fitColumnStandardizer`), applied to the feature subset
 * one preregistered goalkeeper family declares. It fits on goalkeeper rows
 * only: an outfield row carries no `goalkeeperFeatures` at all, so it cannot be
 * silently folded into the training set.
 */
import type { FeatureRow, TargetName } from "../types.js";
import { fitColumnStandardizer } from "../featureMatrix.js";
import {
  GOALKEEPER_FAMILY_FEATURES,
  hasCompleteGoalkeeperFeatures,
  toGoalkeeperVector,
  type GoalkeeperFamily,
} from "../goalkeeperFeatures.js";
import { solveRidge } from "./ridgeCore.js";

export interface GoalkeeperPredictor {
  readonly name: string;
  readonly family: GoalkeeperFamily;
  readonly trainingRowCount: number;
  predict(row: FeatureRow): number;
}

export function goalkeeperCandidateId(family: GoalkeeperFamily, lambda: number): string {
  return `${family}:lambda=${lambda}`;
}

/**
 * The rows a goalkeeper family may be fitted or scored on: role P, a finite
 * target, and every feature the family estimates on finite. Anything else is
 * excluded rather than imputed.
 */
export function goalkeeperCompleteCaseRows(
  rows: readonly FeatureRow[],
  family: GoalkeeperFamily,
  target: TargetName,
): FeatureRow[] {
  return rows.filter(
    (row) =>
      row.role === "P" &&
      row.goalkeeperFeatures !== undefined &&
      Number.isFinite(row.targets[target]) &&
      hasCompleteGoalkeeperFeatures(row.goalkeeperFeatures, family),
  );
}

export function fitGoalkeeperRidge(
  trainRows: readonly FeatureRow[],
  family: GoalkeeperFamily,
  target: TargetName,
  lambda: number,
): GoalkeeperPredictor {
  if (trainRows.length === 0) throw new Error("fitGoalkeeperRidge: no training rows");
  const design = trainRows.map((row) => {
    if (row.goalkeeperFeatures === undefined) {
      throw new Error("fitGoalkeeperRidge: training row has no goalkeeper features");
    }
    return toGoalkeeperVector(row.goalkeeperFeatures, family);
  });
  const standardizer = fitColumnStandardizer(design);
  const { intercept, coefficients } = solveRidge(
    design.map((vector) => standardizer.transform(vector)),
    trainRows.map((row) => row.targets[target]),
    lambda,
  );
  if (coefficients.length !== GOALKEEPER_FAMILY_FEATURES[family].length) {
    throw new Error("fitGoalkeeperRidge: fitted parameter shape mismatch");
  }
  if (![intercept, ...coefficients].every(Number.isFinite)) {
    throw new Error("fitGoalkeeperRidge: fitted parameters contain non-finite values");
  }

  return {
    name: goalkeeperCandidateId(family, lambda),
    family,
    trainingRowCount: trainRows.length,
    predict(row) {
      if (row.goalkeeperFeatures === undefined) {
        throw new Error("fitGoalkeeperRidge: scored row has no goalkeeper features");
      }
      const standardized = standardizer.transform(toGoalkeeperVector(row.goalkeeperFeatures, family));
      const prediction = standardized.reduce(
        (sum, value, index) => sum + value * coefficients[index]!,
        intercept,
      );
      if (!Number.isFinite(prediction)) throw new Error("fitGoalkeeperRidge: non-finite prediction");
      return prediction;
    },
  };
}

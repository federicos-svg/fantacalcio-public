/**
 * Serializable fitted parameters for a goalkeeper ladder family — PURE.
 *
 * `fitGoalkeeperRidge` (goalkeeperRidge.ts) already fits the estimator, but it
 * returns a CLOSURE: the intercept, the coefficients and the standardizer live
 * inside `predict` and never leave the process that fitted them. That is
 * everything a backtest needs and nothing a deposit needs, and it is the
 * reason role P could clear its own sample guard, be selected by the ladder,
 * and still reach serving with no model at all — there was no artifact to
 * deposit.
 *
 * This module is the goalkeeper twin of `fittedRidge.ts`: same estimator, same
 * standardization rule, same zero-variance convention, but over the feature
 * subset the family declares instead of the pooled `FEATURE_NAMES`. Two things
 * are deliberate:
 *
 *  - `featureNames` is carried IN the artifact and re-checked at predict time.
 *    The pooled twin can compare against a module-level constant because there
 *    is exactly one pooled vector; here there are three nested families, so the
 *    artifact has to say which one it is, and a caller that hands it the wrong
 *    vector must be refused rather than silently scored on a prefix;
 *  - nothing is imputed. A serving row whose goalkeeper vector is incomplete
 *    for THIS family is refused, exactly as the complete-case training subset
 *    refused it (`goalkeeperCompleteCaseRows`).
 */
import {
  GOALKEEPER_FAMILY_FEATURES,
  hasCompleteGoalkeeperFeatures,
  toGoalkeeperVector,
  type GoalkeeperFamily,
  type GoalkeeperFeatureName,
  type GoalkeeperFeatureVector,
} from "../goalkeeperFeatures.js";
import { ZERO_VARIANCE_THRESHOLD, fitColumnStandardizer } from "../featureMatrix.js";
import type { FeatureRow, TargetName } from "../types.js";
import { solveRidge } from "./ridgeCore.js";
import { goalkeeperCompleteCaseRows } from "./goalkeeperRidge.js";

export interface FittedGoalkeeperRidgeParameters {
  readonly artifactVersion: "fitted-goalkeeper-ridge-parameters-v1";
  readonly family: GoalkeeperFamily;
  readonly featureNames: readonly GoalkeeperFeatureName[];
  readonly coefficients: readonly number[];
  readonly intercept: number;
  readonly standardizerMeans: readonly number[];
  readonly standardizerStds: readonly number[];
  readonly zeroVarianceThreshold: typeof ZERO_VARIANCE_THRESHOLD;
  readonly lambda: number;
  readonly target: TargetName;
  readonly trainingRowCount: number;
}

/**
 * Fit the deposit-ready artifact for one goalkeeper family.
 *
 * `trainRows` is filtered to the family's own complete-case subset here rather
 * than by the caller, so the artifact's `trainingRowCount` is always the number
 * of rows the coefficients were actually estimated from — the quantity the
 * `n_train >= 10 * p_family` guard is stated in, and the one a reader of the
 * deposited artifact will assume it means.
 */
export function fitGoalkeeperRidgeParameters(
  trainRows: readonly FeatureRow[],
  family: GoalkeeperFamily,
  target: TargetName,
  lambda: number,
): FittedGoalkeeperRidgeParameters {
  if (!Number.isFinite(lambda) || lambda < 0) {
    throw new Error("fitGoalkeeperRidgeParameters: lambda must be finite and non-negative");
  }
  const rows = goalkeeperCompleteCaseRows(trainRows, family, target);
  if (rows.length === 0) throw new Error("fitGoalkeeperRidgeParameters: no complete-case training rows");

  const featureNames = GOALKEEPER_FAMILY_FEATURES[family];
  const design = rows.map((row) => toGoalkeeperVector(row.goalkeeperFeatures!, family));
  const standardizer = fitColumnStandardizer(design);
  const { intercept, coefficients } = solveRidge(
    design.map((vector) => standardizer.transform(vector)),
    rows.map((row) => row.targets[target]),
    lambda,
  );

  if (coefficients.length !== featureNames.length) {
    throw new Error("fitGoalkeeperRidgeParameters: fitted parameter shape mismatch");
  }
  if (
    ![intercept, ...coefficients, ...standardizer.means, ...standardizer.stds].every(Number.isFinite)
  ) {
    throw new Error("fitGoalkeeperRidgeParameters: fitted parameters contain non-finite values");
  }

  return {
    artifactVersion: "fitted-goalkeeper-ridge-parameters-v1",
    family,
    featureNames: [...featureNames],
    coefficients,
    intercept,
    standardizerMeans: [...standardizer.means],
    standardizerStds: [...standardizer.stds],
    zeroVarianceThreshold: ZERO_VARIANCE_THRESHOLD,
    lambda,
    target,
    trainingRowCount: rows.length,
  };
}

/**
 * Whether a persisted artifact still describes the family it claims — the
 * goalkeeper counterpart of the pooled feature-contract check. A bundle
 * outlives the vector it was fitted against, and a mismatch has to be
 * REPORTABLE rather than thrown from inside a per-player loop, so this returns
 * a boolean and `predictWithFittedGoalkeeperRidge` does the throwing.
 */
export function matchesGoalkeeperFeatureContract(
  parameters: FittedGoalkeeperRidgeParameters,
): boolean {
  const expected = GOALKEEPER_FAMILY_FEATURES[parameters.family];
  if (expected === undefined) return false;
  return (
    parameters.featureNames.length === expected.length &&
    parameters.coefficients.length === expected.length &&
    parameters.featureNames.every((name, index) => name === expected[index])
  );
}

export function predictWithFittedGoalkeeperRidge(
  parameters: FittedGoalkeeperRidgeParameters,
  features: GoalkeeperFeatureVector,
): number {
  if (!matchesGoalkeeperFeatureContract(parameters)) {
    throw new Error("predictWithFittedGoalkeeperRidge: parameter shape mismatch");
  }
  if (!hasCompleteGoalkeeperFeatures(features, parameters.family)) {
    throw new Error("predictWithFittedGoalkeeperRidge: feature vector contains non-finite values");
  }

  const vector = toGoalkeeperVector(features, parameters.family);
  let prediction = parameters.intercept;
  for (let index = 0; index < vector.length; index += 1) {
    const std = parameters.standardizerStds[index]!;
    const standardized =
      std > parameters.zeroVarianceThreshold
        ? (vector[index]! - parameters.standardizerMeans[index]!) / std
        : 0;
    prediction += standardized * parameters.coefficients[index]!;
  }
  if (!Number.isFinite(prediction)) {
    throw new Error("predictWithFittedGoalkeeperRidge: non-finite prediction");
  }
  return prediction;
}

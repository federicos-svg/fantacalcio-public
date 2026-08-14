import type { FeatureName, FeatureRow, FeatureVector, TargetName } from "../types.js";
import { FEATURE_NAMES } from "../types.js";
import { ZERO_VARIANCE_THRESHOLD, fitStandardizer, toVector } from "../featureMatrix.js";
import { solveRidge } from "./ridgeCore.js";

export interface FittedRidgeParameters {
  readonly artifactVersion: "fitted-ridge-parameters-v1";
  readonly featureNames: readonly FeatureName[];
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
 * Fits the exact same closed-form ridge estimator used by
 * `ridgeRegressionTrainer()`, but returns the complete deterministic
 * parameter artifact required for later shadow inference.
 */
export function fitRidgeParameters(
  trainRows: readonly FeatureRow[],
  target: TargetName,
  lambda: number,
): FittedRidgeParameters {
  if (trainRows.length === 0) throw new Error("fitRidgeParameters: no training rows");
  if (!Number.isFinite(lambda) || lambda < 0) throw new Error("fitRidgeParameters: lambda must be finite and non-negative");

  const standardizer = fitStandardizer(trainRows);
  const y = trainRows.map((row) => row.targets[target]);
  if (y.some((value) => !Number.isFinite(value))) {
    throw new Error(`fitRidgeParameters: target '${target}' contains non-finite values`);
  }

  const { intercept, coefficients } = solveRidge(
    trainRows.map((row) => standardizer.transform(toVector(row.features))),
    y,
    lambda,
  );

  if (coefficients.length !== FEATURE_NAMES.length) {
    throw new Error("fitRidgeParameters: fitted parameter shape mismatch");
  }
  if (![intercept, ...coefficients, ...standardizer.means, ...standardizer.stds].every(Number.isFinite)) {
    throw new Error("fitRidgeParameters: fitted parameters contain non-finite values");
  }

  return {
    artifactVersion: "fitted-ridge-parameters-v1",
    featureNames: [...FEATURE_NAMES],
    coefficients,
    intercept,
    standardizerMeans: [...standardizer.means],
    standardizerStds: [...standardizer.stds],
    zeroVarianceThreshold: ZERO_VARIANCE_THRESHOLD,
    lambda,
    target,
    trainingRowCount: trainRows.length,
  };
}

export function predictWithFittedRidge(parameters: FittedRidgeParameters, features: FeatureVector): number {
  if (parameters.featureNames.length !== FEATURE_NAMES.length || parameters.coefficients.length !== FEATURE_NAMES.length) {
    throw new Error("predictWithFittedRidge: parameter shape mismatch");
  }
  for (let index = 0; index < FEATURE_NAMES.length; index += 1) {
    if (parameters.featureNames[index] !== FEATURE_NAMES[index]) {
      throw new Error("predictWithFittedRidge: feature order mismatch");
    }
  }

  const vector = toVector(features);
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error("predictWithFittedRidge: feature vector contains non-finite values");
  }

  let prediction = parameters.intercept;
  for (let index = 0; index < vector.length; index += 1) {
    const std = parameters.standardizerStds[index]!;
    const standardized = std > parameters.zeroVarianceThreshold
      ? (vector[index]! - parameters.standardizerMeans[index]!) / std
      : 0;
    prediction += standardized * parameters.coefficients[index]!;
  }
  if (!Number.isFinite(prediction)) throw new Error("predictWithFittedRidge: non-finite prediction");
  return prediction;
}

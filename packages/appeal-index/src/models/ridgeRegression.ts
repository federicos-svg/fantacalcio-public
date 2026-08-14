// Ridge regression (L2-regularized linear regression), closed form.
// The trainer and the persisted fitted-model artifact intentionally share
// one implementation so background inference cannot drift from backtesting.

import type { Trainer } from "../types.js";
import { FEATURE_NAMES } from "../types.js";
import { fitRidgeParameters, predictWithFittedRidge } from "./fittedRidge.js";

const DEFAULT_LAMBDA = 1.0;

export function ridgeRegressionTrainer(lambda = DEFAULT_LAMBDA): Trainer {
  return {
    name: "ridge_regression",
    fit(trainRows, target) {
      const parameters = fitRidgeParameters(trainRows, target, lambda);
      return {
        name: "ridge_regression",
        predict(features) {
          return predictWithFittedRidge(parameters, features);
        },
      };
    },
  };
}

/** Exposed for report/debugging and fitted-artifact validation. */
export const RIDGE_FEATURE_ORDER = FEATURE_NAMES;

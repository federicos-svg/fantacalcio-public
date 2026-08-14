/**
 * The closed-form ridge estimator itself — PURE, feature-set agnostic.
 *
 * It is factored out of `fittedRidge.ts` so the pooled family and the
 * goalkeeper families provably share ONE estimator: a goalkeeper verdict that
 * came from a second, subtly different solver would not be comparable with the
 * D/C/A verdicts it sits next to in the same report. Callers own their own
 * feature order, standardization and artifact shape; this module owns only the
 * normal equations.
 */
import { invert, matMul, matVecMul, transpose, type Matrix } from "../stats.js";

export interface RidgeSolution {
  readonly intercept: number;
  readonly coefficients: readonly number[];
}

/**
 * Solves `min ||y - (a + Xb)||^2 + lambda * ||b||^2` over already-standardized
 * rows. The intercept column is never penalised — regularising it would shrink
 * the target's own mean toward zero.
 */
export function solveRidge(
  standardizedRows: readonly (readonly number[])[],
  y: readonly number[],
  lambda: number,
): RidgeSolution {
  if (standardizedRows.length === 0) throw new Error("solveRidge: no training rows");
  if (standardizedRows.length !== y.length) throw new Error("solveRidge: row/target length mismatch");
  if (!Number.isFinite(lambda) || lambda < 0) throw new Error("solveRidge: lambda must be finite and non-negative");
  const width = standardizedRows[0]!.length;
  if (width === 0) throw new Error("solveRidge: no feature columns");
  if (standardizedRows.some((row) => row.length !== width)) throw new Error("solveRidge: ragged design matrix");
  if (y.some((value) => !Number.isFinite(value))) throw new Error("solveRidge: target contains non-finite values");

  const X: Matrix = standardizedRows.map((row) => [1, ...row]);
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const regularized = XtX.map((row, i) => row.map((value, j) => (i === j && i > 0 ? value + lambda : value)));
  const beta = matVecMul(invert(regularized), matVecMul(Xt, y));

  const intercept = beta[0];
  const coefficients = beta.slice(1);
  if (intercept === undefined || coefficients.length !== width) {
    throw new Error("solveRidge: fitted parameter shape mismatch");
  }
  return { intercept, coefficients };
}

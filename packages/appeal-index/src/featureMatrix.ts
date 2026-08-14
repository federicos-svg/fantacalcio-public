// Feature-vector <-> numeric-array conversion + standardization — PURE.
//
// `fitStandardizer` is the leakage boundary for every model that needs
// scaled inputs (ridge, kNN): it must ALWAYS be fit on the fold's training
// rows only, never on the full dataset or on test rows. validation.test.ts
// includes a regression test asserting a model's fitted output is unchanged
// whether or not test-fold rows are present elsewhere in the input array.

import { FEATURE_NAMES, type FeatureRow, type FeatureVector } from "./types.js";
import { mean, stdDev } from "./stats.js";

export const ZERO_VARIANCE_THRESHOLD = 1e-9 as const;

export function toVector(features: FeatureVector): number[] {
  return FEATURE_NAMES.map((name) => features[name]);
}

export interface Standardizer {
  readonly means: readonly number[];
  readonly stds: readonly number[];
  transform(v: readonly number[]): number[];
}

/**
 * Fit per-column mean/std from already-extracted numeric rows ONLY. Feature-set
 * agnostic so the pooled vector and the goalkeeper vector (goalkeeperFeatures.ts)
 * are scaled by one implementation and one zero-variance rule.
 */
export function fitColumnStandardizer(vectors: readonly (readonly number[])[]): Standardizer {
  if (vectors.length === 0) throw new Error("fitColumnStandardizer: no training rows");
  const width = vectors[0]!.length;
  if (vectors.some((v) => v.length !== width)) throw new Error("fitColumnStandardizer: ragged rows");
  const means: number[] = [];
  const stds: number[] = [];
  for (let j = 0; j < width; j++) {
    const col = vectors.map((v) => v[j]!);
    means.push(mean(col));
    stds.push(stdDev(col));
  }
  return {
    means,
    stds,
    transform(v) {
      return v.map((x, j) => {
        const s = stds[j]!;
        // zero-variance column (e.g. a role one-hot when the fold has only
        // one role): standardizing would divide by ~0 — treat as uninformative (0).
        return s > ZERO_VARIANCE_THRESHOLD ? (x - means[j]!) / s : 0;
      });
    },
  };
}

/** Fit per-column mean/std over the pooled feature vector of `trainRows` ONLY. */
export function fitStandardizer(trainRows: readonly FeatureRow[]): Standardizer {
  if (trainRows.length === 0) throw new Error("fitStandardizer: no training rows");
  return fitColumnStandardizer(trainRows.map((r) => toVector(r.features)));
}

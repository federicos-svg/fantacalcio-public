// k-NN regression over standardized features — no training/closed form,
// just memorized (standardized) train points. Deterministic tie-break by
// original train-row index on equal distance.

import type { Trainer } from "../types.js";
import { toVector, fitStandardizer } from "../featureMatrix.js";

function euclideanDistance(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(sum);
}

export function knnRegressionTrainer(k = 5): Trainer {
  return {
    name: `knn_regression_k${k}`,
    fit(trainRows, target) {
      if (trainRows.length === 0) throw new Error("knnRegressionTrainer.fit: no training rows");
      const standardizer = fitStandardizer(trainRows);
      const points = trainRows.map((r, idx) => ({
        idx,
        x: standardizer.transform(toVector(r.features)),
        y: r.targets[target],
      }));
      const effectiveK = Math.min(k, points.length);
      return {
        name: `knn_regression_k${k}`,
        predict(features) {
          const q = standardizer.transform(toVector(features));
          const ranked = points
            .map((p) => ({ idx: p.idx, y: p.y, dist: euclideanDistance(p.x, q) }))
            .sort((a, b) => a.dist - b.dist || a.idx - b.idx)
            .slice(0, effectiveK);
          return ranked.reduce((s, n) => s + n.y, 0) / ranked.length;
        },
      };
    },
  };
}

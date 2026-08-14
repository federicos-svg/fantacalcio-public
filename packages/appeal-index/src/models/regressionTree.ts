// Shallow CART regression tree — greedy, variance-reduction splits.
// Deterministic: features/thresholds are scanned in a fixed order and the
// FIRST maximum-gain split wins ties, so identical input always yields an
// identical tree.

import type { Trainer } from "../types.js";
import { toVector } from "../featureMatrix.js";
import { mean } from "../stats.js";

interface Labeled {
  readonly x: readonly number[];
  readonly y: number;
}

interface TreeNode {
  readonly isLeaf: boolean;
  readonly prediction?: number;
  readonly featureIndex?: number;
  readonly threshold?: number;
  readonly left?: TreeNode;
  readonly right?: TreeNode;
}

function sumSquaredError(ys: readonly number[]): number {
  if (ys.length === 0) return 0;
  const m = mean(ys);
  return ys.reduce((s, y) => s + (y - m) ** 2, 0);
}

interface BestSplit {
  readonly featureIndex: number;
  readonly threshold: number;
  readonly gain: number;
  readonly leftRows: Labeled[];
  readonly rightRows: Labeled[];
}

function findBestSplit(rows: readonly Labeled[], minLeaf: number): BestSplit | null {
  const parentSse = sumSquaredError(rows.map((r) => r.y));
  const nFeatures = rows[0]!.x.length;
  let best: BestSplit | null = null;

  for (let f = 0; f < nFeatures; f++) {
    const sortedVals = [...new Set(rows.map((r) => r.x[f]!))].sort((a, b) => a - b);
    for (let t = 0; t < sortedVals.length - 1; t++) {
      const threshold = (sortedVals[t]! + sortedVals[t + 1]!) / 2;
      const leftRows = rows.filter((r) => r.x[f]! <= threshold);
      const rightRows = rows.filter((r) => r.x[f]! > threshold);
      if (leftRows.length < minLeaf || rightRows.length < minLeaf) continue;
      const childSse = sumSquaredError(leftRows.map((r) => r.y)) + sumSquaredError(rightRows.map((r) => r.y));
      const gain = parentSse - childSse;
      if (best === null || gain > best.gain) {
        best = { featureIndex: f, threshold, gain, leftRows, rightRows };
      }
    }
  }
  return best;
}

function buildNode(rows: readonly Labeled[], depth: number, maxDepth: number, minLeaf: number): TreeNode {
  const ys = rows.map((r) => r.y);
  if (depth >= maxDepth || rows.length < 2 * minLeaf) {
    return { isLeaf: true, prediction: mean(ys) };
  }
  const best = findBestSplit(rows, minLeaf);
  if (best === null || best.gain <= 1e-9) {
    return { isLeaf: true, prediction: mean(ys) };
  }
  return {
    isLeaf: false,
    featureIndex: best.featureIndex,
    threshold: best.threshold,
    left: buildNode(best.leftRows, depth + 1, maxDepth, minLeaf),
    right: buildNode(best.rightRows, depth + 1, maxDepth, minLeaf),
  };
}

function predictNode(node: TreeNode, x: readonly number[]): number {
  if (node.isLeaf) return node.prediction!;
  return x[node.featureIndex!]! <= node.threshold! ? predictNode(node.left!, x) : predictNode(node.right!, x);
}

export function regressionTreeTrainer(maxDepth = 3, minLeaf = 4): Trainer {
  return {
    name: "regression_tree",
    fit(trainRows, target) {
      if (trainRows.length === 0) throw new Error("regressionTreeTrainer.fit: no training rows");
      const rows: Labeled[] = trainRows.map((r) => ({ x: toVector(r.features), y: r.targets[target] }));
      const root = buildNode(rows, 0, maxDepth, minLeaf);
      return {
        name: "regression_tree",
        predict(features) {
          return predictNode(root, toVector(features));
        },
      };
    },
  };
}

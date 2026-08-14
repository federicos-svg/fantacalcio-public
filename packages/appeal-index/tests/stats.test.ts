import { describe, it, expect } from "vitest";
import {
  mean,
  stdDev,
  weightedMean,
  meanAbsoluteError,
  spearmanCorrelation,
  topFractionHitRate,
  transpose,
  matMul,
  matVecMul,
  invert,
  identityMatrix,
} from "../src/stats.js";

describe("mean/stdDev", () => {
  it("computes mean and population stdDev", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(stdDev([2, 2, 2])).toBe(0);
    expect(stdDev([1, 2, 3])).toBeCloseTo(Math.sqrt(2 / 3));
  });

  it("throws on empty input", () => {
    expect(() => mean([])).toThrow();
    expect(() => stdDev([])).toThrow();
  });
});

describe("weightedMean", () => {
  it("weights values correctly", () => {
    expect(weightedMean([1, 3], [1, 1])).toBe(2);
    expect(weightedMean([1, 3], [3, 1])).toBe(1.5);
  });

  it("throws on zero total weight or mismatched lengths", () => {
    expect(() => weightedMean([1], [0])).toThrow();
    expect(() => weightedMean([1, 2], [1])).toThrow();
  });
});

describe("meanAbsoluteError", () => {
  it("computes MAE", () => {
    expect(meanAbsoluteError([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(meanAbsoluteError([0, 0], [1, -1])).toBe(1);
  });
});

describe("spearmanCorrelation", () => {
  it("is 1 for a perfectly monotonic relationship", () => {
    expect(spearmanCorrelation([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
  });

  it("is -1 for a perfectly inverse relationship", () => {
    expect(spearmanCorrelation([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1);
  });

  it("returns 0 when one series has zero variance", () => {
    expect(spearmanCorrelation([1, 1, 1], [1, 2, 3])).toBe(0);
  });
});

describe("topFractionHitRate", () => {
  it("is 1 when predicted ranking matches actual ranking exactly", () => {
    const actual = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(topFractionHitRate(actual, actual, 0.25)).toBe(1);
  });

  it("is 0 when predicted ranking is the exact inverse", () => {
    const actual = [1, 2, 3, 4, 5, 6, 7, 8];
    const predicted = [...actual].reverse();
    expect(topFractionHitRate(actual, predicted, 0.25)).toBe(0);
  });
});

describe("matrix helpers", () => {
  it("transpose flips rows/cols", () => {
    expect(transpose([[1, 2, 3]])).toEqual([[1], [2], [3]]);
  });

  it("matMul multiplies correctly", () => {
    expect(
      matMul(
        [
          [1, 2],
          [3, 4],
        ],
        [
          [5, 6],
          [7, 8],
        ],
      ),
    ).toEqual([
      [19, 22],
      [43, 50],
    ]);
  });

  it("matVecMul multiplies a matrix by a vector", () => {
    expect(
      matVecMul(
        [
          [1, 0],
          [0, 1],
        ],
        [3, 4],
      ),
    ).toEqual([3, 4]);
  });

  it("invert(identity) is identity", () => {
    expect(invert(identityMatrix(3))).toEqual(identityMatrix(3));
  });

  it("invert produces a true inverse (A * A^-1 = I)", () => {
    const a = [
      [4, 7],
      [2, 6],
    ];
    const inv = invert(a);
    const product = matMul(a, inv);
    expect(product[0]![0]).toBeCloseTo(1);
    expect(product[0]![1]).toBeCloseTo(0);
    expect(product[1]![0]).toBeCloseTo(0);
    expect(product[1]![1]).toBeCloseTo(1);
  });

  it("throws on a singular matrix", () => {
    expect(() =>
      invert([
        [1, 2],
        [2, 4],
      ]),
    ).toThrow();
  });
});

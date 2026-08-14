// Small numeric helpers — pure, dependency-free, deterministic.
// No Math.random anywhere: every algorithm in this package is either
// closed-form or a deterministic greedy procedure, so identical input always
// produces identical output (see endToEnd.test.ts determinism check).

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error("mean: empty input");
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

export function stdDev(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error("stdDev: empty input");
  if (xs.length === 1) return 0;
  const m = mean(xs);
  const variance = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(variance);
}

export function weightedMean(values: readonly number[], weights: readonly number[]): number {
  if (values.length !== weights.length || values.length === 0) {
    throw new Error("weightedMean: values/weights length mismatch or empty");
  }
  let sumW = 0;
  let sumWV = 0;
  for (let i = 0; i < values.length; i++) {
    const w = weights[i]!;
    sumW += w;
    sumWV += w * values[i]!;
  }
  if (sumW === 0) throw new Error("weightedMean: zero total weight");
  return sumWV / sumW;
}

export function meanAbsoluteError(actual: readonly number[], predicted: readonly number[]): number {
  if (actual.length !== predicted.length || actual.length === 0) {
    throw new Error("meanAbsoluteError: length mismatch or empty");
  }
  let sum = 0;
  for (let i = 0; i < actual.length; i++) sum += Math.abs(actual[i]! - predicted[i]!);
  return sum / actual.length;
}

// Average-rank transform (standard Spearman tie convention).
function rank(xs: readonly number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    const avgRank = (i + j) / 2 + 1; // 1-indexed
    for (let k = i; k <= j; k++) ranks[idx[k]![1]] = avgRank;
    i = j + 1;
  }
  return ranks;
}

/** Spearman rank correlation. Returns 0 (not NaN) when either series has zero
 *  variance (undefined correlation) — a safe, testable value for aggregation. */
export function spearmanCorrelation(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length < 2) {
    throw new Error("spearmanCorrelation: need equal-length arrays with length >= 2");
  }
  const ra = rank(a);
  const rb = rank(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}

/** Fraction of the true top-`fraction` (by actual) also present in the
 *  predicted top-`fraction` (by predicted) — an auction-relevant "did we rank
 *  the right players highly" metric, distinct from point-error metrics. */
export function topFractionHitRate(
  actual: readonly number[],
  predicted: readonly number[],
  fraction: number,
): number {
  if (actual.length !== predicted.length || actual.length === 0) {
    throw new Error("topFractionHitRate: length mismatch or empty");
  }
  if (fraction <= 0 || fraction > 1) throw new Error("topFractionHitRate: fraction must be in (0,1]");
  const n = actual.length;
  const k = Math.max(1, Math.round(n * fraction));
  const trueTop = new Set(
    actual
      .map((v, i) => [v, i] as const)
      .sort((x, y) => y[0] - x[0])
      .slice(0, k)
      .map(([, i]) => i),
  );
  const predTop = predicted
    .map((v, i) => [v, i] as const)
    .sort((x, y) => y[0] - x[0])
    .slice(0, k)
    .map(([, i]) => i);
  const hits = predTop.filter((i) => trueTop.has(i)).length;
  return hits / k;
}

// --- small linear algebra for ridge regression (square matrices) ---

export type Matrix = number[][];

export function identityMatrix(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

export function transpose(m: Matrix): Matrix {
  const rows = m.length;
  const cols = rows > 0 ? m[0]!.length : 0;
  const out: Matrix = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) out[j]![i] = m[i]![j]!;
  }
  return out;
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  const n = a.length;
  const k = a[0]?.length ?? 0;
  const m = b[0]?.length ?? 0;
  if (b.length !== k) throw new Error("matMul: dimension mismatch");
  const out: Matrix = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) {
    for (let p = 0; p < k; p++) {
      const aip = a[i]![p]!;
      if (aip === 0) continue;
      for (let j = 0; j < m; j++) out[i]![j] = out[i]![j]! + aip * b[p]![j]!;
    }
  }
  return out;
}

export function matVecMul(a: Matrix, v: readonly number[]): number[] {
  return a.map((row) => row.reduce((s, x, j) => s + x * v[j]!, 0));
}

export function addScaledIdentity(m: Matrix, lambda: number): Matrix {
  return m.map((row, i) => row.map((v, j) => (i === j ? v + lambda : v)));
}

/** Gauss-Jordan inversion with partial pivoting. Throws on a singular matrix
 *  (should not happen for ridge-regularized X^T X + lambda*I with lambda > 0,
 *  which is always positive-definite hence invertible). */
export function invert(m: Matrix): Matrix {
  const n = m.length;
  const id = identityMatrix(n);
  const aug: Matrix = m.map((row, i) => [...row, ...id[i]!]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(aug[col]![col]!);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(aug[r]![col]!);
      if (v > maxAbs) {
        maxAbs = v;
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-12) throw new Error("invert: singular matrix");
    if (pivotRow !== col) {
      const tmp = aug[col]!;
      aug[col] = aug[pivotRow]!;
      aug[pivotRow] = tmp;
    }
    const pivot = aug[col]![col]!;
    for (let j = 0; j < 2 * n; j++) aug[col]![j] = aug[col]![j]! / pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r]![col]!;
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) aug[r]![j] = aug[r]![j]! - factor * aug[col]![j]!;
    }
  }
  return aug.map((row) => row.slice(n));
}

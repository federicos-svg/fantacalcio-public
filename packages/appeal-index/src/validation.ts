// Walk-forward validation harness — PURE.
//
// Rolling-origin evaluation: for a fold testing target season T, training
// data is every feature row whose OWN targetSeason is strictly earlier than
// T (expanding window — all history, never a future season). The burned
// 2025_26 season is excluded by identity from train and test folds. This
// legacy path has no audited descriptive-access mechanism and ignores it.

import { FEATURE_NAMES, type FeatureRow, type TargetName, type Trainer } from "./types.js";
import { seasonYear } from "./identityStability.js";
import { assertNoLeakage } from "./dataset.js";
import { mean, meanAbsoluteError, spearmanCorrelation, topFractionHitRate } from "./stats.js";

// Fase 2 override: holdout identity is explicitly 2025_26 below. The older
// introductory wording about "most recent" is historical and no longer the
// implemented policy.

export interface Fold {
  readonly testSeason: string;
  readonly trainRows: readonly FeatureRow[];
  readonly testRows: readonly FeatureRow[];
}

export interface WalkForwardSplit {
  readonly folds: readonly Fold[];
}

export interface WalkForwardOptions {
  /** Minimum number of distinct earlier target seasons required before the
   *  first walk-forward fold is evaluated (default 2). */
  readonly minTrainTargetSeasons?: number;
  /** Permanently burned season. It is excluded by identity, never inferred
   * from "latest season". Default is the canonical 2025_26. */
  readonly burnedHoldoutSeason?: "2025_26";
}

export function buildWalkForwardSplit(
  rows: readonly FeatureRow[],
  opts: WalkForwardOptions = {},
): WalkForwardSplit {
  assertNoLeakage(rows); // re-verify before any split is drawn from these rows
  const minTrainTargetSeasons = opts.minTrainTargetSeasons ?? 2;
  const burnedHoldoutSeason = opts.burnedHoldoutSeason ?? "2025_26";

  const targetSeasons = [...new Set(rows.map((r) => r.targetSeason))].sort(
    (a, b) => seasonYear(a) - seasonYear(b),
  );

  const evaluableSeasons = targetSeasons.filter((season) => season !== burnedHoldoutSeason);

  const folds: Fold[] = [];
  for (let i = minTrainTargetSeasons; i < evaluableSeasons.length; i++) {
    const testSeason = evaluableSeasons[i]!;
    const trainRows = rows.filter(
      (r) =>
        r.targetSeason !== burnedHoldoutSeason &&
        seasonYear(r.targetSeason) < seasonYear(testSeason),
    );
    const testRows = rows.filter((r) => r.targetSeason === testSeason);
    if (trainRows.length === 0 || testRows.length === 0) continue;
    folds.push({ testSeason, trainRows, testRows });
  }

  return { folds };
}

export interface FoldMetrics {
  readonly modelName: string;
  readonly testSeason: string;
  readonly mae: number;
  readonly spearman: number;
  /** NaN when the fold has fewer than 4 test rows (a quartile is meaningless below that). */
  readonly topQuartileHitRate: number;
  readonly nTest: number;
}

/**
 * Complete-case row filter: a finite target AND every feature finite.
 *
 * `buildFeatureRows` deliberately emits `NaN` for a feature it cannot observe
 * (a player-season with no valid vote has no `fantamedia`, and one with fewer
 * than two appearances has no vote volatility) and records it in
 * `missingFeatures` rather than imputing anything.
 *
 * Filtering on the target alone was enough only as long as no evaluated row
 * actually carried a missing feature. On the Redazione Italia dataset that
 * stopped being true — `Italia` writes `-` (no valid vote) where the other
 * worksheets write a playable office vote — so whole player-seasons legitimately
 * have no fantamedia at all. Feeding those rows to a trainer produced a `NaN`
 * standardizer and killed the run with
 * `fitRidgeParameters: fitted parameters contain non-finite values`.
 *
 * `complete_case` is already the declared missingness policy of the Phase 4
 * protocol (`PHASE4_CONFIG.pipelines`) and is exactly what the Phase 4 runner
 * applies to its own rows. Applying it here aligns this descriptive path with
 * that policy. On any dataset whose evaluated rows are all complete — every
 * dataset this harness handled before — the filter removes nothing and the
 * metrics are byte-identical.
 */
function completeCaseRows(rows: readonly FeatureRow[], target: TargetName): FeatureRow[] {
  return rows.filter(
    (r) =>
      Number.isFinite(r.targets[target]) &&
      FEATURE_NAMES.every((name) => Number.isFinite(r.features[name])),
  );
}

export function evaluateFold(fold: Fold, trainer: Trainer, target: TargetName): FoldMetrics {
  const trainRows = completeCaseRows(fold.trainRows, target);
  const testRows = completeCaseRows(fold.testRows, target);
  const predictor = trainer.fit(trainRows, target);
  const actual = testRows.map((r) => r.targets[target]);
  const predicted = testRows.map((r) => predictor.predict(r.features));
  return {
    modelName: predictor.name,
    testSeason: fold.testSeason,
    mae: meanAbsoluteError(actual, predicted),
    spearman: actual.length >= 2 ? spearmanCorrelation(actual, predicted) : 0,
    topQuartileHitRate: actual.length >= 4 ? topFractionHitRate(actual, predicted, 0.25) : NaN,
    nTest: actual.length,
  };
}

export interface CandidateResult {
  readonly modelName: string;
  readonly perFold: readonly FoldMetrics[];
  readonly meanMae: number;
  readonly meanSpearman: number;
  readonly meanTopQuartileHitRate: number;
}

export function evaluateCandidateAcrossFolds(
  folds: readonly Fold[],
  trainer: Trainer,
  target: TargetName,
): CandidateResult {
  if (folds.length === 0) throw new Error("evaluateCandidateAcrossFolds: no folds");
  const perFold = folds.map((f) => evaluateFold(f, trainer, target));
  const validHitRates = perFold.map((f) => f.topQuartileHitRate).filter((v) => !Number.isNaN(v));
  return {
    modelName: perFold[0]!.modelName,
    perFold,
    meanMae: mean(perFold.map((f) => f.mae)),
    meanSpearman: mean(perFold.map((f) => f.spearman)),
    meanTopQuartileHitRate: validHitRates.length > 0 ? mean(validHitRates) : NaN,
  };
}

/**
 * Fraction of folds where `candidate` beats `baseline` on BOTH metrics at
 * once (lower-or-equal MAE AND higher-or-equal Spearman) — a single better
 * metric is not enough to call a fold a win.
 */
export function foldWinRate(candidate: CandidateResult, baseline: CandidateResult): number {
  if (candidate.perFold.length !== baseline.perFold.length) {
    throw new Error("foldWinRate: candidate and baseline were evaluated over a different number of folds");
  }
  let wins = 0;
  for (let i = 0; i < candidate.perFold.length; i++) {
    const c = candidate.perFold[i]!;
    const b = baseline.perFold[i]!;
    if (c.mae <= b.mae && c.spearman >= b.spearman) wins++;
  }
  return wins / candidate.perFold.length;
}

/** Lowest mean MAE wins; ties broken by higher mean Spearman. */
export function bestByMae(results: readonly CandidateResult[]): CandidateResult {
  if (results.length === 0) throw new Error("bestByMae: empty results");
  return results.reduce((best, r) =>
    r.meanMae < best.meanMae || (r.meanMae === best.meanMae && r.meanSpearman > best.meanSpearman) ? r : best,
  );
}

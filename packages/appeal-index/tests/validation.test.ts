import { describe, it, expect } from "vitest";
import { buildPlayerSeasonPanel, buildFeatureRows } from "../src/dataset.js";
import { buildStableCohortSeasons, buildSyntheticAnagrafica } from "../fixtures/syntheticSeasons.js";
import {
  buildWalkForwardSplit,
  evaluateFold,
  evaluateCandidateAcrossFolds,
  foldWinRate,
  bestByMae,
} from "../src/validation.js";
import { naiveLastBaseline, roleMeanBaseline } from "../src/baselines.js";
import { ridgeRegressionTrainer } from "../src/models/ridgeRegression.js";

// Fully-covered synthetic anagrafica: `ageAtSeasonStart` (@2.2.0) is part of
// the pooled vector, so without it every row would be incomplete and the
// complete-case comparators under test would have nothing to compare.
const panel = buildPlayerSeasonPanel(buildStableCohortSeasons());
const rows = buildFeatureRows(panel, { anagrafica: buildSyntheticAnagrafica(panel) });
const rowsWithBurnedHoldout = rows.map((row) =>
  row.targetSeason === "2024_25" ? { ...row, targetSeason: "2025_26" } : row,
);
const latestRows = rows.filter((row) => row.targetSeason === "2024_25");
const rowsThrough2026 = [
  ...rows,
  ...latestRows.map((row) => ({ ...row, targetSeason: "2025_26" })),
  ...latestRows.map((row) => ({ ...row, targetSeason: "2026_27" })),
];

describe("buildWalkForwardSplit", () => {
  it("never infers a holdout from the latest season", () => {
    const split = buildWalkForwardSplit(rows);
    expect(split.folds.some((f) => f.testSeason === "2024_25")).toBe(true);
  });

  it("excludes the explicitly burned 2025_26 from folds", () => {
    const split = buildWalkForwardSplit(rowsWithBurnedHoldout);
    expect(split.folds.some((f) => f.testSeason === "2025_26")).toBe(false);
    expect(split).not.toHaveProperty("holdoutFold");
  });

  it("never reuses burned 2025_26 in the 2026_27 train fold", () => {
    const split = buildWalkForwardSplit(rowsThrough2026);
    const future = split.folds.find((fold) => fold.testSeason === "2026_27")!;
    expect(future).toBeDefined();
    expect(future.trainRows.some((row) => row.targetSeason === "2025_26")).toBe(false);
  });

  it("is invariant to poisoning burned 2025_26 before evaluating 2026_27", () => {
    const poisoned = rowsThrough2026.map((row) =>
      row.targetSeason === "2025_26"
        ? {
            ...row,
            features: Object.fromEntries(
              Object.keys(row.features).map((name) => [name, 999999]),
            ) as typeof row.features,
            targets: { fantamediaNext: -999999, presenzeNext: 999999 },
          }
        : row,
    );
    const normalFold = buildWalkForwardSplit(rowsThrough2026).folds.find(
      (fold) => fold.testSeason === "2026_27",
    )!;
    const poisonedFold = buildWalkForwardSplit(poisoned).folds.find(
      (fold) => fold.testSeason === "2026_27",
    )!;
    expect(evaluateFold(normalFold, roleMeanBaseline, "fantamediaNext")).toEqual(
      evaluateFold(poisonedFold, roleMeanBaseline, "fantamediaNext"),
    );
  });

  it("every fold's train rows target a season strictly earlier than the fold's test season", () => {
    const split = buildWalkForwardSplit(rows);
    for (const fold of split.folds) {
      for (const trainRow of fold.trainRows) {
        expect(trainRow.targetSeason < fold.testSeason).toBe(true);
      }
      for (const testRow of fold.testRows) {
        expect(testRow.targetSeason).toBe(fold.testSeason);
      }
    }
  });

  it("uses an EXPANDING window — later folds have at-least-as-much training data as earlier ones", () => {
    const split = buildWalkForwardSplit(rows);
    for (let i = 1; i < split.folds.length; i++) {
      expect(split.folds[i]!.trainRows.length).toBeGreaterThanOrEqual(split.folds[i - 1]!.trainRows.length);
    }
  });

  it("produces no folds (and no holdout) when there are too few distinct target seasons", () => {
    const tiny = rows.filter((r) => r.targetSeason === "2019_20" || r.targetSeason === "2020_21");
    const split = buildWalkForwardSplit(tiny, { minTrainTargetSeasons: 2 });
    expect(split.folds).toHaveLength(0);
  });
});

describe("evaluateFold / evaluateCandidateAcrossFolds", () => {
  const split = buildWalkForwardSplit(rows);

  it("evaluateFold reports metrics matching the fold's test set size", () => {
    const metrics = evaluateFold(split.folds[0]!, naiveLastBaseline, "fantamediaNext");
    expect(metrics.nTest).toBe(split.folds[0]!.testRows.length);
    expect(metrics.mae).toBeGreaterThanOrEqual(0);
  });

  it("evaluateCandidateAcrossFolds averages across all folds", () => {
    const result = evaluateCandidateAcrossFolds(split.folds, naiveLastBaseline, "fantamediaNext");
    expect(result.perFold).toHaveLength(split.folds.length);
    expect(result.meanMae).toBeGreaterThanOrEqual(0);
  });

  // Regression for the first real Redazione Italia rebuild: `Italia` writes
  // `-` (no valid vote) where the other worksheets write a playable office
  // vote, so whole player-seasons legitimately have no fantamedia and
  // `buildFeatureRows` emits NaN for their features. Filtering on the target
  // alone let those rows reach the trainer, which produced a NaN standardizer
  // and killed the run with
  // `fitRidgeParameters: fitted parameters contain non-finite values`.
  describe("complete-case rows (the declared Phase 4 missingness policy)", () => {
    const withMissingFeature = (fold: typeof split.folds[number]) => ({
      ...fold,
      trainRows: [
        ...fold.trainRows,
        { ...fold.trainRows[0]!, playerKey: "synthetic:no-vote-season",
          features: { ...fold.trainRows[0]!.features, fantamediaLag1: Number.NaN } },
      ],
      testRows: [
        ...fold.testRows,
        { ...fold.testRows[0]!, playerKey: "synthetic:no-vote-season-test",
          features: { ...fold.testRows[0]!.features, volatilitaVotoLastObserved: Number.NaN } },
      ],
    });

    it("does not let a missing feature reach a trainer that cannot represent it", () => {
      const fold = withMissingFeature(split.folds[0]!);
      expect(() => evaluateFold(fold, ridgeRegressionTrainer(1), "fantamediaNext")).not.toThrow();
      const metrics = evaluateFold(fold, ridgeRegressionTrainer(1), "fantamediaNext");
      expect(Number.isFinite(metrics.mae)).toBe(true);
      // The incomplete test row is excluded from the evaluated set.
      expect(metrics.nTest).toBe(split.folds[0]!.testRows.length);
    });

    it("is a no-op on a fold whose rows are all complete", () => {
      for (const trainer of [naiveLastBaseline, roleMeanBaseline, ridgeRegressionTrainer(1)]) {
        for (const fold of split.folds) {
          expect(evaluateFold(fold, trainer, "fantamediaNext")).toEqual(
            evaluateFold({ ...fold, trainRows: [...fold.trainRows], testRows: [...fold.testRows] }, trainer, "fantamediaNext"),
          );
        }
      }
      // And adding an incomplete row changes nothing about the metrics.
      const fold = split.folds[0]!;
      expect(evaluateFold(withMissingFeature(fold), naiveLastBaseline, "fantamediaNext")).toEqual(
        evaluateFold(fold, naiveLastBaseline, "fantamediaNext"),
      );
    });
  });
});

describe("foldWinRate", () => {
  it("is 1 when a candidate strictly dominates the baseline on every fold", () => {
    const split = buildWalkForwardSplit(rows);
    const candidate = evaluateCandidateAcrossFolds(split.folds, naiveLastBaseline, "fantamediaNext");
    // comparing a result against itself must always be a full win (equal counts as a win)
    expect(foldWinRate(candidate, candidate)).toBe(1);
  });

  it("throws when the two results were evaluated over different fold counts", () => {
    const split = buildWalkForwardSplit(rows);
    const full = evaluateCandidateAcrossFolds(split.folds, naiveLastBaseline, "fantamediaNext");
    const partial = evaluateCandidateAcrossFolds(split.folds.slice(0, 1), roleMeanBaseline, "fantamediaNext");
    expect(() => foldWinRate(partial, full)).toThrow();
  });
});

describe("bestByMae", () => {
  it("picks the candidate with the lowest mean MAE", () => {
    const split = buildWalkForwardSplit(rows);
    const naive = evaluateCandidateAcrossFolds(split.folds, naiveLastBaseline, "fantamediaNext");
    const roleMean = evaluateCandidateAcrossFolds(split.folds, roleMeanBaseline, "fantamediaNext");
    const best = bestByMae([naive, roleMean]);
    expect(best.meanMae).toBe(Math.min(naive.meanMae, roleMean.meanMae));
  });

  it("throws on an empty result list", () => {
    expect(() => bestByMae([])).toThrow();
  });
});

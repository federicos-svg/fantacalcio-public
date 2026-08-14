import { describe, expect, it } from "vitest";
import { buildFeatureRows, buildPlayerSeasonPanel } from "../src/dataset.js";
import { buildWalkForwardSplit, type Fold } from "../src/validation.js";
import { evaluateGoalkeeperFamily, evaluateGoalkeeperLadder } from "../src/goalkeeperLadder.js";
import { GOALKEEPER_FAMILY_LADDER } from "../src/goalkeeperFeatures.js";
import {
  fitGoalkeeperRidge,
  goalkeeperCandidateId,
  goalkeeperCompleteCaseRows,
} from "../src/models/goalkeeperRidge.js";
import { familyParameterCount } from "../src/phase4Protocol.js";
import { buildGoalkeeperCohortSeasons } from "../fixtures/syntheticSeasons.js";
import type { FeatureRow } from "../src/types.js";

const SEASONS = ["2019_20", "2020_21", "2021_22", "2022_23", "2023_24", "2024_25"];

function foldsFor(goalkeeperCount: number): { folds: readonly Fold[]; rows: FeatureRow[] } {
  const rows = buildFeatureRows(buildPlayerSeasonPanel(buildGoalkeeperCohortSeasons(SEASONS, goalkeeperCount)));
  return { folds: buildWalkForwardSplit(rows).folds, rows };
}

describe("goalkeeper ladder — support accounting", () => {
  it("counts only role-P rows the family can actually be fitted on", () => {
    const { folds } = foldsFor(40);
    const evaluated = evaluateGoalkeeperFamily(folds, "goalkeeper_specific_full", "fantamediaNext");
    expect(evaluated.folds.length).toBe(folds.length);
    for (const [index, fold] of evaluated.folds.entries()) {
      const trainRows = folds[index]!.trainRows;
      expect(fold.roleNTrain).toBe(trainRows.filter((row) => row.role === "P").length);
      expect(fold.completeCaseNTrain).toBe(
        goalkeeperCompleteCaseRows(trainRows, "goalkeeper_specific_full", "fantamediaNext").length,
      );
      expect(fold.completeCaseNTrain).toBeLessThanOrEqual(fold.roleNTrain);
    }
  });

  it("applies the shipped 10 x p_family threshold, unmodified, per family", () => {
    const { folds } = foldsFor(40);
    for (const family of GOALKEEPER_FAMILY_LADDER) {
      const evaluated = evaluateGoalkeeperFamily(folds, family, "fantamediaNext");
      expect(evaluated.threshold).toBe(10 * familyParameterCount(family, "P"));
      for (const fold of evaluated.folds) {
        expect(fold.eligible).toBe(fold.completeCaseNTrain >= evaluated.threshold);
      }
    }
  });

  it("never reports a goalkeeper family as eligible on outfield rows", () => {
    const { folds } = foldsFor(40);
    const evaluated = evaluateGoalkeeperFamily(folds, "goalkeeper_specific_core", "presenzeNext");
    const outfieldRows = folds.flatMap((fold) => fold.trainRows).filter((row) => row.role !== "P").length;
    expect(outfieldRows).toBeGreaterThan(0);
    expect(evaluated.folds.every((fold) => fold.completeCaseNTrain <= fold.roleNTrain)).toBe(true);
  });
});

describe("goalkeeper ladder — selection", () => {
  it("selects the richest family whose own sample guard holds", () => {
    const { folds } = foldsFor(60);
    const evaluation = evaluateGoalkeeperLadder(folds, "fantamediaNext");
    expect(evaluation.reasonCode).toBe("LADDER_FAMILY_ELIGIBLE");
    expect(evaluation.selectedFamily).not.toBeNull();
    const selectedIndex = GOALKEEPER_FAMILY_LADDER.indexOf(evaluation.selectedFamily!);
    // Every family richer than the selected one must have failed its guard.
    for (let i = 0; i < selectedIndex; i++) {
      expect(evaluation.families[i]!.roleEligible).toBe(false);
    }
    expect(evaluation.families[selectedIndex]!.roleEligible).toBe(true);
  });

  it("steps down one rung when only the richest family is out of reach", () => {
    // 28 keepers over these seasons put the folds' support above the core
    // family's threshold but below the full family's: the ladder must step
    // down exactly one rung, not give up and not skip to the leanest.
    const evaluation = evaluateGoalkeeperLadder(foldsFor(28).folds, "fantamediaNext");
    expect(evaluation.families[0]!.roleEligible).toBe(false);
    expect(evaluation.selectedFamily).toBe("goalkeeper_specific_core");
  });

  it("steps down to the leanest family rather than giving up", () => {
    const evaluation = evaluateGoalkeeperLadder(foldsFor(18).folds, "fantamediaNext");
    expect(evaluation.families.slice(0, 2).every((family) => !family.roleEligible)).toBe(true);
    expect(evaluation.selectedFamily).toBe("goalkeeper_specific_minimal");
  });

  it("returns no family, and the numbers that say why, when even the leanest fails", () => {
    const { folds } = foldsFor(3);
    const evaluation = evaluateGoalkeeperLadder(folds, "fantamediaNext");
    expect(evaluation.selectedFamily).toBeNull();
    expect(evaluation.reasonCode).toBe("LADDER_SAMPLE_GUARD_FAILED");
    expect(evaluation.families).toHaveLength(GOALKEEPER_FAMILY_LADDER.length);
    for (const family of evaluation.families) {
      expect(family.roleEligible).toBe(false);
      expect(family.reasonCode).toBe("SAMPLE_GUARD_FAILED");
      expect(family.folds.length).toBeGreaterThan(0);
      for (const fold of family.folds) {
        expect(Number.isInteger(fold.completeCaseNTrain)).toBe(true);
        expect(fold.threshold).toBe(family.threshold);
      }
    }
  });

  it("evaluates each target on its own support", () => {
    const { folds } = foldsFor(40);
    for (const target of ["fantamediaNext", "presenzeNext"] as const) {
      expect(evaluateGoalkeeperLadder(folds, target).target).toBe(target);
    }
  });

  it("is deterministic", () => {
    const { folds } = foldsFor(40);
    expect(JSON.stringify(evaluateGoalkeeperLadder(folds, "fantamediaNext")))
      .toBe(JSON.stringify(evaluateGoalkeeperLadder(folds, "fantamediaNext")));
  });
});

describe("goalkeeper ridge", () => {
  it("fits the selected family and scores every goalkeeper test row finitely", () => {
    const { folds } = foldsFor(60);
    const evaluation = evaluateGoalkeeperLadder(folds, "fantamediaNext");
    const family = evaluation.selectedFamily!;
    let scored = 0;
    for (const fold of folds) {
      const train = goalkeeperCompleteCaseRows(fold.trainRows, family, "fantamediaNext");
      const test = goalkeeperCompleteCaseRows(fold.testRows, family, "fantamediaNext");
      if (train.length === 0 || test.length === 0) continue;
      const fitted = fitGoalkeeperRidge(train, family, "fantamediaNext", 1);
      expect(fitted.name).toBe(goalkeeperCandidateId(family, 1));
      expect(fitted.trainingRowCount).toBe(train.length);
      for (const row of test) {
        expect(Number.isFinite(fitted.predict(row))).toBe(true);
        scored += 1;
      }
    }
    expect(scored).toBeGreaterThan(0);
  });

  it("is fitted on the training fold only — adding test rows elsewhere cannot change it", () => {
    const { folds, rows } = foldsFor(60);
    const fold = folds.at(-1)!;
    const train = goalkeeperCompleteCaseRows(fold.trainRows, "goalkeeper_specific_core", "fantamediaNext");
    const probe = goalkeeperCompleteCaseRows(fold.testRows, "goalkeeper_specific_core", "fantamediaNext")[0]!;
    const fitted = fitGoalkeeperRidge(train, "goalkeeper_specific_core", "fantamediaNext", 1);
    const refitted = fitGoalkeeperRidge(
      goalkeeperCompleteCaseRows([...train, ...rows.filter((row) => row.role !== "P")], "goalkeeper_specific_core", "fantamediaNext"),
      "goalkeeper_specific_core",
      "fantamediaNext",
      1,
    );
    expect(refitted.predict(probe)).toBe(fitted.predict(probe));
  });

  it("refuses to fit or score a row with no goalkeeper features", () => {
    const { folds, rows } = foldsFor(60);
    const train = goalkeeperCompleteCaseRows(folds.at(-1)!.trainRows, "goalkeeper_specific_core", "fantamediaNext");
    const fitted = fitGoalkeeperRidge(train, "goalkeeper_specific_core", "fantamediaNext", 1);
    const outfield = rows.find((row) => row.role !== "P")!;
    expect(() => fitted.predict(outfield)).toThrow("no goalkeeper features");
    expect(() => fitGoalkeeperRidge([outfield], "goalkeeper_specific_core", "fantamediaNext", 1))
      .toThrow("no goalkeeper features");
    expect(() => fitGoalkeeperRidge([], "goalkeeper_specific_core", "fantamediaNext", 1))
      .toThrow("no training rows");
  });

  it("shrinks toward the training mean as lambda grows", () => {
    const { folds } = foldsFor(60);
    const fold = folds.at(-1)!;
    const train = goalkeeperCompleteCaseRows(fold.trainRows, "goalkeeper_specific_core", "fantamediaNext");
    const probe = goalkeeperCompleteCaseRows(fold.testRows, "goalkeeper_specific_core", "fantamediaNext")[0]!;
    const trainMean =
      train.reduce((sum, row) => sum + row.targets.fantamediaNext, 0) / train.length;
    const weak = fitGoalkeeperRidge(train, "goalkeeper_specific_core", "fantamediaNext", 0.1).predict(probe);
    const strong = fitGoalkeeperRidge(train, "goalkeeper_specific_core", "fantamediaNext", 1e6).predict(probe);
    expect(Math.abs(strong - trainMean)).toBeLessThan(Math.abs(weak - trainMean));
  });
});

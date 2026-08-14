/**
 * Goalkeeper ladder eligibility and family selection — PURE, no I/O.
 *
 * It answers one preregistered question per target: which of the three frozen
 * goalkeeper families (`GOALKEEPER_FAMILY_LADDER`, richest first) is the
 * richest one whose own `n_train >= 10 * p_family` guard holds on role P?
 *
 * Two things it deliberately does NOT do:
 *
 *  - it never relaxes the guard. `sampleEligibility()` is called unchanged, so
 *    both the per-fold `10 * p_family` requirement and the "at most a third of
 *    folds may fail" rule are exactly the ones the pooled families answer to.
 *    Only the family's parameter count differs, because the family really does
 *    estimate fewer parameters;
 *  - it never reports a family as eligible on rows the trainer could not use.
 *    Support is counted on the goalkeeper complete-case subset — role P, finite
 *    target, every feature of THAT family finite — which is the exact set
 *    `fitGoalkeeperRidge` is handed. Counting all role-P rows would overstate
 *    the support, the failure mode `phase4SampleGuardAudit.ts` was built to
 *    measure on the pooled path.
 *
 * When no family clears its guard the result is not a gap: `families` still
 * carries every count, threshold and per-fold outcome, so the run can state in
 * numbers why role P has no computed index instead of inventing one.
 */
import type { FeatureRow, TargetName } from "./types.js";
import type { Fold } from "./validation.js";
import { GOALKEEPER_FAMILY_LADDER, type GoalkeeperFamily } from "./goalkeeperFeatures.js";
import { goalkeeperCompleteCaseRows } from "./models/goalkeeperRidge.js";
import { familyParameterCount, sampleEligibility } from "./phase4Protocol.js";

export interface GoalkeeperLadderFold {
  readonly foldId: string;
  /** Role-P rows in the training split, before the complete-case filter. */
  readonly roleNTrain: number;
  /** Role-P rows this family can actually be fitted on. */
  readonly completeCaseNTrain: number;
  readonly completeCaseNTest: number;
  readonly threshold: number;
  readonly eligible: boolean;
}

export interface GoalkeeperLadderFamily {
  readonly family: GoalkeeperFamily;
  readonly pFamily: number;
  readonly threshold: number;
  readonly folds: readonly GoalkeeperLadderFold[];
  readonly roleEligible: boolean;
  readonly reasonCode: "ELIGIBLE" | "SAMPLE_GUARD_FAILED";
}

export interface GoalkeeperLadderEvaluation {
  readonly target: TargetName;
  readonly families: readonly GoalkeeperLadderFamily[];
  readonly selectedFamily: GoalkeeperFamily | null;
  readonly reasonCode: "LADDER_FAMILY_ELIGIBLE" | "LADDER_SAMPLE_GUARD_FAILED";
}

export function evaluateGoalkeeperFamily(
  folds: readonly Fold[],
  family: GoalkeeperFamily,
  target: TargetName,
): GoalkeeperLadderFamily {
  const pFamily = familyParameterCount(family, "P");
  const counts = folds.map((fold) => ({
    foldId: fold.testSeason,
    nTrain: goalkeeperCompleteCaseRows(fold.trainRows, family, target).length,
  }));
  // Both the per-fold threshold and the "at most a third of folds may fail"
  // aggregation come from the shipped rule, keyed on this family's own name.
  const eligibility = sampleEligibility(family, "P", counts);
  const threshold = 10 * pFamily;

  return {
    family,
    pFamily,
    threshold,
    folds: folds.map((fold, index) => ({
      foldId: fold.testSeason,
      roleNTrain: fold.trainRows.filter((row) => row.role === "P").length,
      completeCaseNTrain: counts[index]!.nTrain,
      completeCaseNTest: goalkeeperCompleteCaseRows(fold.testRows, family, target).length,
      threshold,
      eligible: eligibility.folds[index]!.eligible,
    })),
    roleEligible: eligibility.roleEligible,
    reasonCode: eligibility.roleEligible ? "ELIGIBLE" : "SAMPLE_GUARD_FAILED",
  };
}

export function evaluateGoalkeeperLadder(
  folds: readonly Fold[],
  target: TargetName,
): GoalkeeperLadderEvaluation {
  const families = GOALKEEPER_FAMILY_LADDER.map((family) =>
    evaluateGoalkeeperFamily(folds, family, target),
  );
  const selected = families.find((entry) => entry.roleEligible) ?? null;
  return {
    target,
    families,
    selectedFamily: selected?.family ?? null,
    reasonCode: selected ? "LADDER_FAMILY_ELIGIBLE" : "LADDER_SAMPLE_GUARD_FAILED",
  };
}

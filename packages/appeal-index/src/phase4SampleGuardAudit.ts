/**
 * Read-only audit of the Phase 4 sample-size guard against the rows the
 * trainers are actually fitted on — PURE, no I/O, no methodology.
 *
 * Why it exists. The guard in `run-phase4-backtest.ts` counts, per fold and
 * role, the rows present in that fold's training split:
 *
 *     nTrain = fold.trainRows.filter((row) => row.role === role).length
 *
 * The trainers, however, are fitted on the `complete_case` subset — a finite
 * target AND every feature finite. Those two universes coincided while no
 * evaluated row carried a missing feature. Under Redazione Italia they no
 * longer do: `Italia` writes `-` (no valid vote) where the other worksheets
 * write a playable office vote, so whole player-seasons legitimately have no
 * fantamedia and drop out of `complete_case`. A guard counting rows that are
 * never trained on would be measuring the wrong support.
 *
 * This module only MEASURES the gap. It changes no threshold, no rule, no
 * verdict: `sampleEligibility()` and `PHASE4_CONFIG` stay the single source of
 * both the `nTrain >= 10 x pFamily` requirement and the per-role
 * "at most a third of folds may fail" rule, and are called here unchanged.
 *
 * Everything it emits is an aggregate count: no player, no identifier, no
 * fingerprint.
 */
import type { FeatureRow, TargetName } from "./types.js";
import { FEATURE_NAMES } from "./types.js";
import { buildWalkForwardSplit } from "./validation.js";
import {
  PHASE4_CONFIG,
  PHASE4_ROLES,
  familyParameterCount,
  sampleEligibility,
  type Phase4Role,
} from "./phase4Protocol.js";

/** The family whose eligibility actually gates the Phase 4 role verdicts. */
export const GATING_FAMILY = "pooled_regularized_role" as const;

/** Artifact-facing target names, paired with the in-memory target keys. */
export const AUDITED_TARGETS: readonly { readonly label: string; readonly key: TargetName }[] = [
  { label: "fantamedia_next", key: "fantamediaNext" },
  { label: "presenze_next", key: "presenzeNext" },
];

/**
 * The exact complete-case predicate `run-phase4-backtest.ts` applies before
 * fitting (`finiteRows`): a finite target and every feature finite.
 */
export function isCompleteCase(row: FeatureRow, target: TargetName): boolean {
  return (
    Number.isFinite(row.targets[target]) &&
    FEATURE_NAMES.every((name) => Number.isFinite(row.features[name]))
  );
}

export interface Phase4SampleGuardFold {
  readonly foldId: string;
  /** What the shipped guard counts: every row of this role in the split. */
  readonly guardNTrain: number;
  /** What the trainer actually sees for this role and target. */
  readonly completeCaseNTrain: number;
  readonly threshold: number;
  readonly guardEligible: boolean;
  readonly completeCaseEligible: boolean;
}

export interface Phase4SampleGuardRoleAudit {
  readonly target: string;
  readonly role: Phase4Role;
  readonly pFamily: number;
  readonly threshold: number;
  readonly folds: readonly Phase4SampleGuardFold[];
  /** Role verdict the shipped guard produces (drives selection today). */
  readonly guardRoleEligible: boolean;
  /** The same rule applied to the complete-case counts. */
  readonly completeCaseRoleEligible: boolean;
  /** True when the two disagree — the only case that needs a code change. */
  readonly divergent: boolean;
}

/**
 * Audits every gating role/target pair over the same walk-forward split the
 * backtest builds. Returns one entry per (target, role).
 */
export function auditPhase4SampleGuard(rows: readonly FeatureRow[]): Phase4SampleGuardRoleAudit[] {
  const folds = buildWalkForwardSplit(rows).folds;
  const pFamilyOf = (role: Phase4Role): number => familyParameterCount(GATING_FAMILY, role);
  const out: Phase4SampleGuardRoleAudit[] = [];

  for (const { label, key } of AUDITED_TARGETS) {
    for (const role of PHASE4_ROLES) {
      const pFamily = pFamilyOf(role);
      const threshold = 10 * pFamily;

      const guardCounts = folds.map((fold) => ({
        foldId: fold.testSeason,
        nTrain: fold.trainRows.filter((row) => row.role === role).length,
      }));
      const completeCounts = folds.map((fold) => ({
        foldId: fold.testSeason,
        nTrain: fold.trainRows.filter((row) => row.role === role && isCompleteCase(row, key)).length,
      }));

      // Both verdicts come from the shipped rule, applied to two different
      // row universes. Nothing about the rule itself is reimplemented here.
      const guard = sampleEligibility(GATING_FAMILY, role, guardCounts);
      const complete = sampleEligibility(GATING_FAMILY, role, completeCounts);

      out.push({
        target: label,
        role,
        pFamily,
        threshold,
        folds: folds.map((fold, index) => ({
          foldId: fold.testSeason,
          guardNTrain: guardCounts[index]!.nTrain,
          completeCaseNTrain: completeCounts[index]!.nTrain,
          threshold,
          guardEligible: guard.folds[index]!.eligible,
          completeCaseEligible: complete.folds[index]!.eligible,
        })),
        guardRoleEligible: guard.roleEligible,
        completeCaseRoleEligible: complete.roleEligible,
        divergent: guard.roleEligible !== complete.roleEligible,
      });
    }
  }
  return out;
}

/**
 * Compact, privacy-safe lines for a job log: counts and booleans only.
 * One line per (target, role), plus one per fold that fails either way.
 */
export function formatPhase4SampleGuardAudit(audit: readonly Phase4SampleGuardRoleAudit[]): string[] {
  const lines: string[] = [`sample_guard_family=${GATING_FAMILY} pFamily=${familyParameterCount(GATING_FAMILY, "D")}`];
  for (const entry of audit) {
    const min = Math.min(...entry.folds.map((fold) => fold.completeCaseNTrain));
    const failing = entry.folds.filter((fold) => !fold.completeCaseEligible);
    lines.push(
      `sample_guard ${entry.target}/${entry.role} threshold=${entry.threshold} ` +
        `min_complete_case_ntrain=${min} folds=${entry.folds.length} ` +
        `complete_case_failing_folds=${failing.length} ` +
        `guard_role_eligible=${entry.guardRoleEligible} ` +
        `complete_case_role_eligible=${entry.completeCaseRoleEligible} ` +
        `divergent=${entry.divergent}`,
    );
    for (const fold of failing) {
      lines.push(
        `sample_guard_fold ${entry.target}/${entry.role} fold=${fold.foldId} ` +
          `guard_ntrain=${fold.guardNTrain} complete_case_ntrain=${fold.completeCaseNTrain} ` +
          `threshold=${fold.threshold}`,
      );
    }
  }
  lines.push(`sample_guard_divergent_pairs=${audit.filter((entry) => entry.divergent).length}`);
  return lines;
}

/** Kept next to the audit so a reader can see the rule it is measured against. */
export const SAMPLE_GUARD_RULE = {
  requirement: "nTrain >= 10 * pFamily",
  pipelines: PHASE4_CONFIG.pipelines,
  appliedPipeline: "complete_case",
} as const;

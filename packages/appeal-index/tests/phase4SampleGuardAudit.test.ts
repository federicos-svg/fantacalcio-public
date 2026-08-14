import { describe, expect, it } from "vitest";
import type { FeatureRow } from "../src/types.js";
import { FEATURE_NAMES } from "../src/types.js";
import { buildWalkForwardSplit } from "../src/validation.js";
import { familyParameterCount, sampleEligibility } from "../src/phase4Protocol.js";
import {
  GATING_FAMILY,
  auditPhase4SampleGuard,
  formatPhase4SampleGuardAudit,
  isCompleteCase,
} from "../src/phase4SampleGuardAudit.js";

const SEASONS = ["2015_16", "2016_17", "2017_18", "2018_19", "2019_20", "2020_21"] as const;
const THRESHOLD = 10 * familyParameterCount(GATING_FAMILY, "D");

/**
 * A row that is complete by construction. `incomplete` reproduces exactly what
 * `buildFeatureRows` emits for a player-season with no valid vote at all: a
 * NaN `fantamediaLag1`, which is a missing FEATURE and therefore removes the
 * row from `complete_case` for BOTH targets.
 */
function row(
  index: number,
  role: "P" | "D" | "C" | "A",
  featureSeason: string,
  targetSeason: string,
  opts: { readonly incompleteFeature?: boolean; readonly missingTarget?: boolean } = {},
): FeatureRow {
  const features = Object.fromEntries(
    FEATURE_NAMES.map((name) => [name, name === "fantamediaLag1" && opts.incompleteFeature ? Number.NaN : 1]),
  ) as FeatureRow["features"];
  return {
    playerKey: `synthetic:${role}:${index}`,
    name: `Synthetic ${role} ${index}`,
    role,
    featureSeason,
    targetSeason,
    sourceSeasons: [featureSeason],
    features,
    targets: {
      fantamediaNext: opts.missingTarget ? Number.NaN : 6,
      presenzeNext: 20,
    },
  };
}

/** `perSeason` rows per role per target season, a share of them incomplete. */
function cohort(perSeason: number, incompletePerSeason: number, missingTargetPerSeason = 0): FeatureRow[] {
  const rows: FeatureRow[] = [];
  for (let s = 0; s < SEASONS.length - 1; s += 1) {
    for (const role of ["P", "D", "C", "A"] as const) {
      for (let i = 0; i < perSeason; i += 1) {
        rows.push(
          row(i, role, SEASONS[s]!, SEASONS[s + 1]!, {
            incompleteFeature: i < incompletePerSeason,
            missingTarget: i >= incompletePerSeason && i < incompletePerSeason + missingTargetPerSeason,
          }),
        );
      }
    }
  }
  return rows;
}

describe("isCompleteCase mirrors the predicate the backtest fits on", () => {
  it("requires a finite target AND every feature finite", () => {
    const complete = row(1, "D", "2015_16", "2016_17");
    expect(isCompleteCase(complete, "fantamediaNext")).toBe(true);
    expect(isCompleteCase(complete, "presenzeNext")).toBe(true);

    // A missing FEATURE removes the row for every target.
    const noFantamedia = row(1, "D", "2015_16", "2016_17", { incompleteFeature: true });
    expect(isCompleteCase(noFantamedia, "fantamediaNext")).toBe(false);
    expect(isCompleteCase(noFantamedia, "presenzeNext")).toBe(false);

    // A missing TARGET removes the row for that target only.
    const noTarget = row(1, "D", "2015_16", "2016_17", { missingTarget: true });
    expect(isCompleteCase(noTarget, "fantamediaNext")).toBe(false);
    expect(isCompleteCase(noTarget, "presenzeNext")).toBe(true);
  });

  it("is the same predicate the shipped backtest applies before fitting", () => {
    // Regression anchor: if `finiteRows` in run-phase4-backtest.ts ever stops
    // meaning "finite target and all features finite", this audit is measuring
    // the wrong universe and must be updated with it.
    const rows = cohort(4, 1, 1);
    for (const target of ["fantamediaNext", "presenzeNext"] as const) {
      const byPredicate = rows.filter((r) => isCompleteCase(r, target));
      const byBacktestRule = rows.filter(
        (r) => Number.isFinite(r.targets[target]) && Object.values(r.features).every(Number.isFinite),
      );
      expect(byPredicate).toEqual(byBacktestRule);
    }
  });
});

describe("auditPhase4SampleGuard", () => {
  it("agrees with the shipped guard when every row is a complete case", () => {
    const audit = auditPhase4SampleGuard(cohort(200, 0));
    expect(audit.length).toBeGreaterThan(0);
    for (const entry of audit) {
      expect(entry.divergent, `${entry.target}/${entry.role}`).toBe(false);
      for (const fold of entry.folds) {
        expect(fold.completeCaseNTrain).toBe(fold.guardNTrain);
      }
    }
  });

  it("reports the rows actually trained on, not the rows merely present", () => {
    // Half of every cohort is incomplete: the guard sees twice the support the
    // trainer gets.
    const audit = auditPhase4SampleGuard(cohort(200, 100));
    for (const entry of audit) {
      for (const fold of entry.folds) {
        expect(fold.completeCaseNTrain).toBe(fold.guardNTrain / 2);
      }
    }
  });

  it("flags the case that needs a fix: guard eligible, trained rows below threshold", () => {
    // 200 rows per role per season, 190 of them incomplete -> the guard counts
    // hundreds while the trainer sees tens.
    const audit = auditPhase4SampleGuard(cohort(200, 190));
    const divergent = audit.filter((entry) => entry.divergent);
    expect(divergent.length).toBeGreaterThan(0);
    for (const entry of divergent) {
      expect(entry.guardRoleEligible).toBe(true);
      expect(entry.completeCaseRoleEligible).toBe(false);
      expect(Math.min(...entry.folds.map((fold) => fold.completeCaseNTrain))).toBeLessThan(entry.threshold);
    }
  });

  it("separates the two targets: a missing target hits only its own", () => {
    // Every row is feature-complete; a large share has no observable
    // fantamedia target. `presenze_next` must be unaffected.
    const audit = auditPhase4SampleGuard(cohort(200, 0, 190));
    for (const entry of audit) {
      const min = Math.min(...entry.folds.map((fold) => fold.completeCaseNTrain));
      if (entry.target === "presenze_next") {
        expect(min, `${entry.target}/${entry.role}`).toBeGreaterThanOrEqual(entry.threshold);
        expect(entry.completeCaseRoleEligible).toBe(true);
      } else {
        expect(min, `${entry.target}/${entry.role}`).toBeLessThan(entry.threshold);
      }
    }
  });

  it("covers D, C and A on both targets", () => {
    const audit = auditPhase4SampleGuard(cohort(200, 0));
    for (const target of ["fantamedia_next", "presenze_next"]) {
      for (const role of ["D", "C", "A"]) {
        expect(audit.some((entry) => entry.target === target && entry.role === role), `${target}/${role}`).toBe(true);
      }
    }
  });

  it("uses the shipped requirement and the shipped role rule, not a copy", () => {
    const rows = cohort(200, 100);
    const folds = buildWalkForwardSplit(rows).folds;
    const audit = auditPhase4SampleGuard(rows);
    const entry = audit.find((item) => item.target === "fantamedia_next" && item.role === "D")!;
    expect(entry.threshold).toBe(10 * entry.pFamily);
    expect(entry.threshold).toBe(THRESHOLD);
    // Same numbers, fed straight through `sampleEligibility`.
    const expected = sampleEligibility(
      GATING_FAMILY,
      "D",
      folds.map((fold) => ({
        foldId: fold.testSeason,
        nTrain: fold.trainRows.filter((r) => r.role === "D" && isCompleteCase(r, "fantamediaNext")).length,
      })),
    );
    expect(entry.completeCaseRoleEligible).toBe(expected.roleEligible);
  });
});

describe("formatPhase4SampleGuardAudit", () => {
  it("emits counts and booleans only — no player, key or fingerprint", () => {
    const lines = formatPhase4SampleGuardAudit(auditPhase4SampleGuard(cohort(200, 190)));
    expect(lines.join("\n")).toContain("sample_guard_divergent_pairs=");
    for (const line of lines) {
      expect(line).not.toMatch(/synthetic:|playerKey|sha256|Synthetic /);
    }
  });
});

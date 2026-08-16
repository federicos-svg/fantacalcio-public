import type { CoverageStatus, FeatureSourceName, FieldSeasonSourceEvidence } from "./types.js";

// Deterministic, pure. `tested: false` always wins first: NOT_TESTED can never be
// silently upgraded to MISSING_BY_SOURCE or any other status (see task constraint:
// "NOT_TESTED non può diventare MISSING_BY_SOURCE").
export function classifySourceCoverage(evidence: FieldSeasonSourceEvidence): CoverageStatus {
  if (!evidence.tested) {
    return "NOT_TESTED";
  }
  if (evidence.planRestricted) {
    return "PLAN_RESTRICTED";
  }
  if (!evidence.acceptsSeasonParameter) {
    return "SNAPSHOT_ONLY";
  }
  if (evidence.retroactiveOverlayRisk) {
    return "NOT_HISTORICAL";
  }
  if (!evidence.accessible) {
    return "MISSING_BY_SOURCE";
  }
  if (evidence.recordCount === null) {
    return "MISSING_BY_SOURCE";
  }
  if (
    evidence.expectedMinimumRecordCount !== null &&
    evidence.recordCount < evidence.expectedMinimumRecordCount
  ) {
    return "PARTIAL";
  }
  return "COMPLETE";
}

const CONFLICT_ELIGIBLE: ReadonlySet<CoverageStatus> = new Set(["COMPLETE", "PARTIAL"]);

const COVERAGE_RANK: readonly CoverageStatus[] = [
  "COMPLETE",
  "PARTIAL",
  "SNAPSHOT_ONLY",
  "NOT_HISTORICAL",
  "PLAN_RESTRICTED",
  "MISSING_BY_SOURCE",
  "NOT_TESTED",
];

/**
 * Combines an arbitrary number of per-source coverage verdicts for one (field, season)
 * cell into the cross-source cell used by the hybrid matrix. `hasValueConflict` must
 * come from an actual value comparison (see conflictClassifier.ts) — this function
 * never inspects raw values itself, it only decides whether CONFLICT outranks the
 * individual source statuses.
 *
 * CONFLICT needs at least two conflict-eligible (COMPLETE/PARTIAL) sources: a single
 * usable source cannot disagree with anything, so a declared value conflict alone is
 * never enough. Generic over any number of sources keyed by `FeatureSourceName` —
 * registering a newly approved source is one more map entry, never a new named
 * parameter or a structural rewrite of this function. An empty map is NOT_TESTED: no
 * source data at all is never silently treated as coverage.
 */
export function classifyDerivedCellCoverage(
  coverageBySource: ReadonlyMap<FeatureSourceName, CoverageStatus>,
  hasValueConflict: boolean,
): CoverageStatus {
  const statuses = [...coverageBySource.values()];
  if (statuses.length === 0) {
    return "NOT_TESTED";
  }

  const conflictEligibleCount = statuses.filter((status) => CONFLICT_ELIGIBLE.has(status)).length;
  if (hasValueConflict && conflictEligibleCount >= 2) {
    return "CONFLICT";
  }

  return statuses.reduce((best, status) =>
    COVERAGE_RANK.indexOf(status) <= COVERAGE_RANK.indexOf(best) ? status : best,
  );
}

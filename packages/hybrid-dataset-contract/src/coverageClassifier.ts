import type { CoverageStatus, FieldSeasonSourceEvidence } from "./types.js";

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

// Combines the two per-source coverage verdicts for one (field, season) cell into the
// cross-source cell used by the hybrid matrix. `hasValueConflict` must come from an
// actual value comparison (see conflictClassifier.ts) — this function never inspects
// raw values itself, it only decides whether CONFLICT outranks the two source statuses.
export function classifyDerivedCellCoverage(
  transfermarkt: CoverageStatus,
  apiFootball: CoverageStatus,
  hasValueConflict: boolean,
): CoverageStatus {
  if (hasValueConflict && CONFLICT_ELIGIBLE.has(transfermarkt) && CONFLICT_ELIGIBLE.has(apiFootball)) {
    return "CONFLICT";
  }
  const rank: readonly CoverageStatus[] = [
    "COMPLETE",
    "PARTIAL",
    "SNAPSHOT_ONLY",
    "NOT_HISTORICAL",
    "PLAN_RESTRICTED",
    "MISSING_BY_SOURCE",
    "NOT_TESTED",
  ];
  const a = rank.indexOf(transfermarkt);
  const b = rank.indexOf(apiFootball);
  const winner = a <= b ? transfermarkt : apiFootball;
  return winner;
}

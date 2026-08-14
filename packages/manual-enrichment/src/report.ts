// Manual Enrichment v1 — aggregate, redacted report.
//
// Contains ONLY counts — never a name, team, listone_id, row content, path,
// or source text. Same posture as packages/appeal-index's safe/identity-only
// report mode (PR #90): the aggregate is the only thing this package ever
// prints/serializes for a human to look at across many rows at once.

import type { AggregateReport, HeaderIssue, RowResult, ValidationStatus } from "./types.js";
import { VALIDATION_STATUSES } from "./types.js";

export function buildAggregateReport(
  headerIssues: readonly HeaderIssue[],
  rows: readonly RowResult[],
  emptyRowsSkipped: number,
): AggregateReport {
  const countsByStatus = Object.fromEntries(VALIDATION_STATUSES.map((s) => [s, 0])) as Record<
    ValidationStatus,
    number
  >;
  let duplicateEnrichmentRowCount = 0;
  let joinZeroCandidateCount = 0;
  let joinOneCandidateCount = 0;
  let joinMultipleCandidateCount = 0;

  for (const row of rows) {
    countsByStatus[row.status]++;
    if (row.issues.some((i) => i.code === "duplicate_listone_id_in_enrichment")) duplicateEnrichmentRowCount++;
    if (row.join) {
      if (row.join.matchCount === 0) joinZeroCandidateCount++;
      else if (row.join.matchCount === 1) joinOneCandidateCount++;
      else joinMultipleCandidateCount++;
    }
  }

  return {
    headerValid: headerIssues.length === 0,
    headerIssueCount: headerIssues.length,
    totalRowsRead: rows.length + emptyRowsSkipped,
    emptyRowsSkipped,
    countsByStatus,
    invalidRowCount: countsByStatus.invalid,
    warningRowCount: countsByStatus.warning,
    duplicateEnrichmentRowCount,
    joinZeroCandidateCount,
    joinOneCandidateCount,
    joinMultipleCandidateCount,
    gatesPromoted: false,
  };
}

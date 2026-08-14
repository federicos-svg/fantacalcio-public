// Manual Enrichment v1 — top-level orchestrator.
//
// Ties together sheetReader -> fieldValidation -> duplicates -> identityJoin
// into one deterministic run over an already-decoded workbook + caller-
// supplied listone candidates. No new validation logic lives here — only
// composition and status combination.

import { isRowEmpty, projectRow, readHeaderRow, selectEnrichmentSheet } from "./sheetReader.js";
import { validateEnrichmentRow } from "./fieldValidation.js";
import { findDuplicateEnrichmentListoneIds, indexListoneCandidatesById } from "./duplicates.js";
import { joinAndEvaluate } from "./identityJoin.js";
import { buildAggregateReport } from "./report.js";
import type {
  AggregateReport,
  EnrichmentRecord,
  HeaderIssue,
  Issue,
  ListoneCandidate,
  ManualEnrichmentOptions,
  RowResult,
  ValidationStatus,
  Workbook,
} from "./types.js";

export interface PipelineResult {
  readonly headerIssues: readonly HeaderIssue[];
  readonly rows: readonly RowResult[];
  readonly report: AggregateReport;
}

/**
 * Severity order used to combine multiple partial statuses for one row
 * (field validation, duplicate detection, identity join) into a single
 * final status: the worse one always wins, and `invalid` (a structural
 * defect in the row itself) is checked ahead of the identity-derived
 * statuses — fix the row's own shape before worrying about who it matches.
 * This total order is a deliberate, documented tie-break, not a claim that
 * `invalid`/`rejected`/`requires_manual_review` have an inherent ranking
 * against each other in general (docs/data/VALIDATION_IDENTITY_CONTRACT.md
 * only says all three are "blocking", without an order among themselves).
 */
const STATUS_SEVERITY: Readonly<Record<ValidationStatus, number>> = {
  valid: 0,
  warning: 1,
  ambiguous: 2,
  requires_manual_review: 3,
  rejected: 4,
  invalid: 5,
};

function worstStatus(a: ValidationStatus, b: ValidationStatus): ValidationStatus {
  return STATUS_SEVERITY[a] >= STATUS_SEVERITY[b] ? a : b;
}

function fieldStatusFromIssues(issues: readonly Issue[]): ValidationStatus {
  if (issues.some((i) => i.blocking)) return "invalid";
  if (issues.length > 0) return "warning";
  return "valid";
}

/**
 * Runs the full v1 pipeline over one already-decoded workbook. Never reads
 * bytes, never reads a real file, never assigns a canonical identity.
 *
 * `options.allowedSources` must be supplied by the caller — this package
 * never hardcodes which sources are registered (see types.ts's
 * `ManualEnrichmentOptions`).
 */
export function runManualEnrichmentPipeline(
  workbook: Workbook,
  listoneCandidates: readonly ListoneCandidate[],
  options: ManualEnrichmentOptions,
): PipelineResult {
  const sheet = selectEnrichmentSheet(workbook);
  if (sheet === null || sheet.rows.length === 0) {
    const headerIssues: HeaderIssue[] = [{ code: "missing_mandatory_column", field: "(empty sheet)" }];
    return { headerIssues, rows: [], report: buildAggregateReport(headerIssues, [], 0) };
  }

  const headerMap = readHeaderRow(sheet.rows[0]!);
  if (headerMap.issues.length > 0) {
    return { headerIssues: headerMap.issues, rows: [], report: buildAggregateReport(headerMap.issues, [], 0) };
  }

  const dataRows = sheet.rows.slice(1);
  let emptyRowsSkipped = 0;

  interface PendingRow {
    readonly rowRef: number;
    readonly fieldIssues: readonly Issue[];
    readonly record: EnrichmentRecord | null;
  }
  const pending: PendingRow[] = [];

  dataRows.forEach((row, i) => {
    if (isRowEmpty(row)) {
      emptyRowsSkipped++;
      return;
    }
    const projected = projectRow(row, headerMap);
    const { record, issues } = validateEnrichmentRow(projected, options);
    // 1-based sheet row number: header is row 1, first data row is row 2.
    pending.push({ rowRef: i + 2, fieldIssues: issues, record });
  });

  const recordsForDuplicateCheck = pending.map((p) => p.record).filter((r): r is EnrichmentRecord => r !== null);
  const duplicateIds = findDuplicateEnrichmentListoneIds(recordsForDuplicateCheck);
  const candidatesById = indexListoneCandidatesById(listoneCandidates);

  const rows: RowResult[] = pending.map(({ rowRef, fieldIssues, record }) => {
    let status = fieldStatusFromIssues(fieldIssues);
    const issues = [...fieldIssues];

    if (record === null) {
      return { rowRef, status: "invalid", issues, record: null };
    }

    if (duplicateIds.has(record.listoneId)) {
      issues.push({ code: "duplicate_listone_id_in_enrichment", field: "listone_id", blocking: false });
      status = worstStatus(status, "requires_manual_review");
    }

    const join = joinAndEvaluate(record, candidatesById);
    status = worstStatus(status, join.status);

    return {
      rowRef,
      status,
      issues,
      record,
      join: {
        matchCount: join.matchCount,
        identityOutcome: join.identityOutcome,
        identityConfidenceBand: join.identityConfidenceBand,
        identityReasonCode: join.identityReasonCode,
      },
    };
  });

  return { headerIssues: [], rows, report: buildAggregateReport([], rows, emptyRowsSkipped) };
}

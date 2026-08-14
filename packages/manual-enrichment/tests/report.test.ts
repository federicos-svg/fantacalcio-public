import { describe, it, expect } from "vitest";
import { buildAggregateReport } from "../src/report.js";
import type { EnrichmentRecord, HeaderIssue, RowResult } from "../src/types.js";

// All identifying strings below are synthetic and deliberately distinctive
// (never appearing in production code) so the redaction test below can prove
// they never leak into the serialized report.
const REAL_LOOKING_NAME = "Synth Zzqx Testplayer";
const REAL_LOOKING_TEAM = "Synthopoli Zzqx United";
const REAL_LOOKING_ID = "8675309";

function record(): EnrichmentRecord {
  return {
    listoneId: REAL_LOOKING_ID,
    nome: REAL_LOOKING_NAME,
    ruolo: "A",
    squadraAttuale: REAL_LOOKING_TEAM,
    titolaritaPrevista: "titolare",
    injuryFlag: "nessuno",
    source: "synthetic_source_a",
    sourceMethod: "manual_file",
    confidence: "alta",
    updatedAt: "2026-07-10",
  };
}

function row(overrides: Partial<RowResult> = {}): RowResult {
  return { rowRef: 2, status: "valid", issues: [], record: record(), ...overrides };
}

describe("buildAggregateReport — conteggi", () => {
  it("counts rows by status", () => {
    const rows: RowResult[] = [
      row({ rowRef: 2, status: "valid" }),
      row({ rowRef: 3, status: "warning" }),
      row({ rowRef: 4, status: "invalid", record: null }),
      row({ rowRef: 5, status: "requires_manual_review" }),
    ];
    const report = buildAggregateReport([], rows, 1);
    expect(report.countsByStatus.valid).toBe(1);
    expect(report.countsByStatus.warning).toBe(1);
    expect(report.countsByStatus.invalid).toBe(1);
    expect(report.countsByStatus.requires_manual_review).toBe(1);
    expect(report.invalidRowCount).toBe(1);
    expect(report.warningRowCount).toBe(1);
    expect(report.totalRowsRead).toBe(rows.length + 1);
    expect(report.emptyRowsSkipped).toBe(1);
  });

  it("counts join cardinality across rows", () => {
    const rows: RowResult[] = [
      row({ rowRef: 2, join: { matchCount: 0 } }),
      row({ rowRef: 3, join: { matchCount: 1 } }),
      row({ rowRef: 4, join: { matchCount: 3 } }),
    ];
    const report = buildAggregateReport([], rows, 0);
    expect(report.joinZeroCandidateCount).toBe(1);
    expect(report.joinOneCandidateCount).toBe(1);
    expect(report.joinMultipleCandidateCount).toBe(1);
  });

  it("counts duplicate-flagged rows", () => {
    const rows: RowResult[] = [
      row({ rowRef: 2, issues: [{ code: "duplicate_listone_id_in_enrichment", field: "listone_id", blocking: false }] }),
      row({ rowRef: 3 }),
    ];
    const report = buildAggregateReport([], rows, 0);
    expect(report.duplicateEnrichmentRowCount).toBe(1);
  });

  it("reflects header issues distinctly from row counts — headerValid:false never inflates invalidRowCount", () => {
    const headerIssues: HeaderIssue[] = [{ code: "missing_mandatory_column", field: "ruolo" }];
    const report = buildAggregateReport(headerIssues, [], 0);
    expect(report.headerValid).toBe(false);
    expect(report.headerIssueCount).toBe(1);
    expect(report.totalRowsRead).toBe(0);
    expect(report.invalidRowCount).toBe(0);
  });

  it("always reports gatesPromoted:false", () => {
    const report = buildAggregateReport([], [], 0);
    expect(report.gatesPromoted).toBe(false);
  });

  it("invalidRowCount/warningRowCount are ROW counts, not issue counts — a row with several blocking issues still counts once", () => {
    const rows: RowResult[] = [
      row({
        rowRef: 2,
        status: "invalid",
        record: null,
        issues: [
          { code: "missing_field", field: "source", blocking: true },
          { code: "invalid_role", field: "ruolo", blocking: true },
          { code: "invalid_confidence", field: "confidence", blocking: true },
        ],
      }),
    ];
    const report = buildAggregateReport([], rows, 0);
    expect(report.invalidRowCount).toBe(1);
  });

  it("a warning-severity issue on a row that ends invalid/requires_manual_review is never counted in warningRowCount", () => {
    const rows: RowResult[] = [
      row({
        rowRef: 2,
        status: "invalid",
        record: null,
        issues: [
          { code: "free_text_too_long", field: "nome", blocking: false },
          { code: "missing_field", field: "source", blocking: true },
        ],
      }),
      row({
        rowRef: 3,
        status: "requires_manual_review",
        issues: [{ code: "duplicate_listone_id_in_enrichment", field: "listone_id", blocking: false }],
      }),
    ];
    const report = buildAggregateReport([], rows, 0);
    expect(report.warningRowCount).toBe(0);
    expect(report.invalidRowCount).toBe(1);
    expect(report.countsByStatus.requires_manual_review).toBe(1);
  });

  it("invalidRowCount/warningRowCount always agree with countsByStatus", () => {
    const rows: RowResult[] = [
      row({ rowRef: 2, status: "valid" }),
      row({ rowRef: 3, status: "warning" }),
      row({ rowRef: 4, status: "warning" }),
      row({ rowRef: 5, status: "invalid", record: null }),
      row({ rowRef: 6, status: "ambiguous" }),
    ];
    const report = buildAggregateReport([], rows, 0);
    expect(report.invalidRowCount).toBe(report.countsByStatus.invalid);
    expect(report.warningRowCount).toBe(report.countsByStatus.warning);
  });
});

describe("buildAggregateReport — redazione", () => {
  it("never contains a name, team, listone_id, or source string from the input rows", () => {
    const rows: RowResult[] = [
      row({ rowRef: 2 }),
      row({ rowRef: 3, status: "requires_manual_review", join: { matchCount: 0 } }),
    ];
    const report = buildAggregateReport([], rows, 0);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(REAL_LOOKING_NAME);
    expect(serialized).not.toContain(REAL_LOOKING_TEAM);
    expect(serialized).not.toContain(REAL_LOOKING_ID);
    expect(serialized).not.toContain("synthetic_source_a");
  });
});

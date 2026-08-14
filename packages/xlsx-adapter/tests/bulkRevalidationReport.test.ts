import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  buildBulkRevalidationReport,
  mapDecodeErrorNameToCode,
  assertRedacted,
  RedactionError,
  type BulkRevalidationFileOutcome,
  type BulkRevalidationRunMeta,
} from "../src/bulkRevalidationReport.js";
import type { VoteXlsxDryRunManifest } from "../src/normalizeVoteXlsx.js";

// PURE, in-memory, fixture-only. No real XLSX, no file/Drive I/O, no real
// player/team names anywhere — every string here is a synthetic marker
// chosen only to prove the aggregator/redaction logic. This locks the
// aggregate report shape (schemas/fantacalcio_bulk_revalidation_report.schema.json)
// and the "no free text / names / paths / secrets survive" guarantee. NOT an
// execution of the re-validation itself.

const META: BulkRevalidationRunMeta = {
  runId: "revalidation-test-0001",
  startedAt: "2026-07-08T10:00:00.000Z",
  finishedAt: "2026-07-08T10:05:00.000Z",
  repoCommitSha: "a".repeat(40),
};

interface FakeIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly recordIndex: number;
  readonly external_id: number | null;
  readonly message: string;
}

function fakeManifest(
  status: "valid" | "warning" | "invalid",
  overrides: { issues?: readonly FakeIssue[] } = {},
): VoteXlsxDryRunManifest {
  const issues = overrides.issues ?? [];
  return {
    sheetNames: ["Fantacalcio"],
    sheetUsed: "Fantacalcio",
    rawRowCount: 42,
    pipeline: {
      status,
      stages: [
        { stage: "normalize", outcome: "ok", error: null },
        { stage: "parse", outcome: "ok", error: null },
        { stage: "validate", outcome: "ok", error: null },
      ],
      counts: {
        normalizedRows: 40,
        parsedRecords: 38,
        playerRecords: 36,
        validationErrors: issues.filter((i) => i.severity === "error").length,
        validationWarnings: issues.filter((i) => i.severity === "warning").length,
      },
      issues,
      validation: {
        status,
        total: 38,
        errorCount: issues.filter((i) => i.severity === "error").length,
        warningCount: issues.filter((i) => i.severity === "warning").length,
        issues,
        data_promoted_eligible: false,
      },
      failedStage: null,
      data_promoted_eligible: false,
      canonical_promoted: false,
    },
    data_promoted_eligible: false,
  };
}

function pipelineOutcome(
  season: string,
  seasonCode: string,
  matchday: number,
  status: "valid" | "warning" | "invalid",
  opts: { rawHash?: string; expectedRawHash?: string | null; issues?: readonly FakeIssue[] } = {},
): BulkRevalidationFileOutcome {
  return {
    season,
    seasonCode,
    matchday,
    rawHash: opts.rawHash ?? "f".repeat(64),
    expectedRawHash: opts.expectedRawHash === undefined ? "f".repeat(64) : opts.expectedRawHash,
    outcome: { kind: "pipeline", manifest: fakeManifest(status, { issues: opts.issues }) },
  };
}

describe("mapDecodeErrorNameToCode", () => {
  it("maps known decode-stage error names to stable codes", () => {
    expect(mapDecodeErrorNameToCode("XlsxDecodeError")).toBe("xlsx_decode_error");
    expect(mapDecodeErrorNameToCode("XlsxCellTypeError")).toBe("xlsx_cell_type_error");
    expect(mapDecodeErrorNameToCode("WorkbookError")).toBe("workbook_error");
  });
  it("falls back to a generic code for an unrecognized error name", () => {
    expect(mapDecodeErrorNameToCode("SomeFutureError")).toBe("unknown_decode_error");
  });
});

describe("assertRedacted", () => {
  it("passes a well-formed, code/hash/count-only object", () => {
    expect(() => assertRedacted({ season: "2025_26", matchday: 38, raw_hash: "a".repeat(64), issue_codes: ["invalid_season"] })).not.toThrow();
  });
  it("throws on a forbidden key carrying free text", () => {
    expect(() => assertRedacted({ message: "Rossi scored a goal" })).toThrow(RedactionError);
  });
  it("throws on a forbidden key carrying a name", () => {
    expect(() => assertRedacted({ team: "Atalanta" })).toThrow(RedactionError);
  });
  it("throws on a path-like string value", () => {
    expect(() => assertRedacted({ note: "/home/user/Voti_2025_26_G1.xlsx" })).toThrow(RedactionError);
  });
  it("throws on a URL-like string value", () => {
    expect(() => assertRedacted({ note: "https://example.com/secret" })).toThrow(RedactionError);
  });
  it("throws on an oversized string (looks like free text, not a code)", () => {
    expect(() => assertRedacted({ note: "x".repeat(201) })).toThrow(RedactionError);
  });
  it("walks nested arrays/objects", () => {
    expect(() => assertRedacted({ seasons: [{ matchdays: [{ path: "/tmp/x" }] }] })).toThrow(RedactionError);
  });
});

describe("buildBulkRevalidationReport", () => {
  it("aggregates valid/warning/invalid counts for one season", () => {
    const report = buildBulkRevalidationReport({
      meta: META,
      seasons: [{ season: "2025_26", seasonCode: "20", expectedMatchdays: [1, 2, 3] }],
      files: [
        pipelineOutcome("2025_26", "20", 1, "valid"),
        pipelineOutcome("2025_26", "20", 2, "warning"),
        pipelineOutcome("2025_26", "20", 3, "invalid"),
      ],
    });
    const season = report.seasons[0]!;
    expect(season.valid_count).toBe(1);
    expect(season.warning_count).toBe(1);
    expect(season.invalid_count).toBe(1);
    expect(season.found_matchdays).toEqual([1, 2, 3]);
    expect(season.missing_matchdays).toEqual([]);
  });

  it("reports missing matchdays that were expected but not found", () => {
    const report = buildBulkRevalidationReport({
      meta: META,
      seasons: [{ season: "2025_26", seasonCode: "20", expectedMatchdays: [1, 2, 3] }],
      files: [pipelineOutcome("2025_26", "20", 1, "valid"), pipelineOutcome("2025_26", "20", 3, "valid")],
    });
    const season = report.seasons[0]!;
    expect(season.found_matchdays).toEqual([1, 3]);
    expect(season.missing_matchdays).toEqual([2]);
    expect(report.totals.missing).toBe(1);
  });

  it("sets raw_hash_matches_acquisition_manifest true/false/null depending on input", () => {
    const report = buildBulkRevalidationReport({
      meta: META,
      seasons: [{ season: "2025_26", seasonCode: "20", expectedMatchdays: [1, 2, 3] }],
      files: [
        pipelineOutcome("2025_26", "20", 1, "valid", { rawHash: "a".repeat(64), expectedRawHash: "a".repeat(64) }),
        pipelineOutcome("2025_26", "20", 2, "valid", { rawHash: "a".repeat(64), expectedRawHash: "b".repeat(64) }),
        pipelineOutcome("2025_26", "20", 3, "valid", { rawHash: "a".repeat(64), expectedRawHash: null }),
      ],
    });
    const [md1, md2, md3] = report.seasons[0]!.matchdays;
    expect(md1!.raw_hash_matches_acquisition_manifest).toBe(true);
    expect(md2!.raw_hash_matches_acquisition_manifest).toBe(false);
    expect(md3!.raw_hash_matches_acquisition_manifest).toBeNull();
  });

  it("treats a decode_error outcome as invalid with a single coarse issue code", () => {
    const files: BulkRevalidationFileOutcome[] = [
      {
        season: "2025_26",
        seasonCode: "20",
        matchday: 5,
        rawHash: "c".repeat(64),
        expectedRawHash: "c".repeat(64),
        outcome: { kind: "decode_error", errorCode: mapDecodeErrorNameToCode("XlsxDecodeError") },
      },
    ];
    const report = buildBulkRevalidationReport({
      meta: META,
      seasons: [{ season: "2025_26", seasonCode: "20", expectedMatchdays: [5] }],
      files,
    });
    const entry = report.seasons[0]!.matchdays[0]!;
    expect(entry.pipeline_status).toBe("invalid");
    expect(entry.issue_codes).toEqual(["xlsx_decode_error"]);
    expect(entry.normalizedRows).toBeNull();
  });

  it("issue_codes carries only codes, never the validator's free-text message", () => {
    const report = buildBulkRevalidationReport({
      meta: META,
      seasons: [{ season: "2025_26", seasonCode: "20", expectedMatchdays: [1] }],
      files: [
        pipelineOutcome("2025_26", "20", 1, "invalid", {
          issues: [
            {
              code: "empty_name",
              severity: "error",
              recordIndex: 0,
              external_id: 7,
              message: "name must be a non-empty string (SECRET_PLAYER_NAME_MARKER)",
            },
          ],
        }),
      ],
    });
    const serialized = JSON.stringify(report);
    expect(report.seasons[0]!.matchdays[0]!.issue_codes).toEqual(["empty_name"]);
    expect(serialized).not.toContain("SECRET_PLAYER_NAME_MARKER");
  });

  it("sums totals across multiple seasons", () => {
    const report = buildBulkRevalidationReport({
      meta: META,
      seasons: [
        { season: "2024_25", seasonCode: "19", expectedMatchdays: [1, 2] },
        { season: "2025_26", seasonCode: "20", expectedMatchdays: [1, 2] },
      ],
      files: [
        pipelineOutcome("2024_25", "19", 1, "valid"),
        pipelineOutcome("2024_25", "19", 2, "valid"),
        pipelineOutcome("2025_26", "20", 1, "valid"),
        pipelineOutcome("2025_26", "20", 2, "warning"),
      ],
    });
    expect(report.totals).toEqual({ expected: 4, found: 4, valid: 3, warning: 1, invalid: 0, missing: 0 });
  });

  it("always reports data_promoted_eligible and canonical_promoted as false, regardless of status", () => {
    const report = buildBulkRevalidationReport({
      meta: META,
      seasons: [{ season: "2025_26", seasonCode: "20", expectedMatchdays: [1] }],
      files: [pipelineOutcome("2025_26", "20", 1, "invalid")],
    });
    expect(report.data_promoted_eligible).toBe(false);
    expect(report.canonical_promoted).toBe(false);
  });

  it("sets redaction_check to 'ok' for a well-formed report (assertRedacted did not throw)", () => {
    const report = buildBulkRevalidationReport({
      meta: META,
      seasons: [{ season: "2025_26", seasonCode: "20", expectedMatchdays: [1] }],
      files: [pipelineOutcome("2025_26", "20", 1, "valid")],
    });
    expect(report.redaction_check).toBe("ok");
  });

  it("carries run metadata through unchanged", () => {
    const report = buildBulkRevalidationReport({
      meta: META,
      seasons: [{ season: "2025_26", seasonCode: "20", expectedMatchdays: [] }],
      files: [],
    });
    expect(report.run_id).toBe(META.runId);
    expect(report.run_started_at).toBe(META.startedAt);
    expect(report.run_finished_at).toBe(META.finishedAt);
    expect(report.repo_commit_sha).toBe(META.repoCommitSha);
  });

  it("is deterministic — same input always yields the same report", () => {
    const input = {
      meta: META,
      seasons: [{ season: "2025_26", seasonCode: "20", expectedMatchdays: [1, 2] }],
      files: [pipelineOutcome("2025_26", "20", 1, "valid"), pipelineOutcome("2025_26", "20", 2, "warning")],
    };
    expect(buildBulkRevalidationReport(input)).toEqual(buildBulkRevalidationReport(input));
  });
});

// Zod mirror of schemas/fantacalcio_bulk_revalidation_report.schema.json — same
// pattern as the other *_contract.test.ts files in this repo: locks the
// documented shape independently of the TS interfaces above.
const matchdayEntrySchema = z
  .object({
    matchday: z.number().int().min(1).max(38),
    raw_hash: z.string().regex(/^[a-f0-9]{64}$/),
    raw_hash_matches_acquisition_manifest: z.boolean().nullable(),
    pipeline_status: z.enum(["valid", "warning", "invalid"]),
    normalizedRows: z.number().int().min(0).nullable(),
    parsedRecords: z.number().int().min(0).nullable(),
    playerRecords: z.number().int().min(0).nullable(),
    validationErrors: z.number().int().min(0),
    validationWarnings: z.number().int().min(0),
    issue_codes: z.array(z.string().min(1).max(200)),
  })
  .strict();

const seasonSummarySchema = z
  .object({
    season: z.string().regex(/^[0-9]{4}_[0-9]{2}$/),
    season_code: z.string().regex(/^(1[0-9]|2[01])$/),
    expected_matchdays: z.array(z.number().int().min(1).max(38)),
    found_matchdays: z.array(z.number().int().min(1).max(38)),
    missing_matchdays: z.array(z.number().int().min(1).max(38)),
    valid_count: z.number().int().min(0),
    warning_count: z.number().int().min(0),
    invalid_count: z.number().int().min(0),
    matchdays: z.array(matchdayEntrySchema),
  })
  .strict();

const bulkRevalidationReportSchema = z
  .object({
    run_id: z.string().min(1),
    run_started_at: z.string().min(1),
    run_finished_at: z.string().min(1),
    repo_commit_sha: z.string().min(1),
    script_version: z.string().min(1),
    seasons: z.array(seasonSummarySchema),
    totals: z
      .object({
        expected: z.number().int().min(0),
        found: z.number().int().min(0),
        valid: z.number().int().min(0),
        warning: z.number().int().min(0),
        invalid: z.number().int().min(0),
        missing: z.number().int().min(0),
      })
      .strict(),
    data_promoted_eligible: z.literal(false),
    canonical_promoted: z.literal(false),
    redaction_check: z.literal("ok"),
  })
  .strict();

describe("FantacalcioBulkRevalidationReport schema mirror", () => {
  it("a real buildBulkRevalidationReport() output validates against the schema mirror", () => {
    const report = buildBulkRevalidationReport({
      meta: META,
      seasons: [{ season: "2025_26", seasonCode: "20", expectedMatchdays: [1, 2, 3] }],
      files: [
        pipelineOutcome("2025_26", "20", 1, "valid"),
        pipelineOutcome("2025_26", "20", 2, "warning"),
      ],
    });
    expect(bulkRevalidationReportSchema.parse(report)).toBeTruthy();
  });

  it("rejects a report with data_promoted_eligible: true (locks the gate-OFF invariant)", () => {
    const report = buildBulkRevalidationReport({
      meta: META,
      seasons: [{ season: "2025_26", seasonCode: "20", expectedMatchdays: [1] }],
      files: [pipelineOutcome("2025_26", "20", 1, "valid")],
    });
    expect(bulkRevalidationReportSchema.safeParse({ ...report, data_promoted_eligible: true }).success).toBe(false);
  });
});

// Bulk re-validation aggregate report — PURE, in-memory, fixture-only.
//
// Prepares the audit gap found after FASE 2 (bulk normalization, 11 seasons,
// 418 matchdays, executed and closed outside this repo): the per-file JSON
// reports that CLI run produced were deleted per
// docs/automation/XLSX_NORMALIZATION_RUNBOOK.md's cleanup step, so the
// "418/418 valid" claim in PROJECT_STATE.md has no surviving artifact to
// audit. This module defines the AGGREGATION + REDACTION logic for a future,
// separately authorized re-validation run over the raw XLSX already
// persisted outside the repo (see scripts/bulk-revalidate-votes.ts for the
// I/O shell that would call this).
//
// This module does NOT read files, does NOT touch Drive/network, does NOT
// add any new normalize/parse/validate rule — it only aggregates outcomes
// already produced by the existing, unchanged `normalizeVoteXlsxBytes()` and
// enforces that the aggregate never carries free text, names, paths, URLs,
// or secrets. NOT executed by this batch: preparing the tool is not running
// the re-validation.

import type { VoteXlsxDryRunManifest } from "./normalizeVoteXlsx.js";

/** Bumped only when the aggregate report's own shape changes. */
export const BULK_REVALIDATION_REPORT_VERSION = "v1";

export type BulkRevalidationPipelineStatus = "valid" | "warning" | "invalid";

/** One raw file's outcome, fed in by the (separate, unexecuted) CLI shell. */
export interface BulkRevalidationFileOutcome {
  readonly season: string;
  readonly seasonCode: string;
  readonly matchday: number;
  /** sha256 hex of the bytes actually read for this run. */
  readonly rawHash: string;
  /** raw_hash recorded in the FASE1 acquisition manifest, if supplied; null if unavailable. */
  readonly expectedRawHash: string | null;
  readonly outcome:
    | { readonly kind: "pipeline"; readonly manifest: VoteXlsxDryRunManifest }
    | { readonly kind: "decode_error"; readonly errorCode: string };
}

/** What matchdays a season is expected to have (mirrors the 0D season mapping). */
export interface BulkRevalidationSeasonInput {
  readonly season: string;
  readonly seasonCode: string;
  readonly expectedMatchdays: readonly number[];
}

export interface BulkRevalidationRunMeta {
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly repoCommitSha: string;
}

export interface BuildBulkRevalidationReportInput {
  readonly meta: BulkRevalidationRunMeta;
  readonly seasons: readonly BulkRevalidationSeasonInput[];
  readonly files: readonly BulkRevalidationFileOutcome[];
}

// ---- report shape (schemas/fantacalcio_bulk_revalidation_report.schema.json) ----

export interface BulkRevalidationMatchdayEntry {
  readonly matchday: number;
  readonly raw_hash: string;
  /** null when no expected hash was supplied for cross-check (not an error by itself). */
  readonly raw_hash_matches_acquisition_manifest: boolean | null;
  readonly pipeline_status: BulkRevalidationPipelineStatus;
  readonly normalizedRows: number | null;
  readonly parsedRecords: number | null;
  readonly playerRecords: number | null;
  readonly validationErrors: number;
  readonly validationWarnings: number;
  /** Codes only (e.g. "invalid_season", "xlsx_decode_error") — never free-text messages. */
  readonly issue_codes: readonly string[];
}

export interface BulkRevalidationSeasonSummary {
  readonly season: string;
  readonly season_code: string;
  readonly expected_matchdays: readonly number[];
  readonly found_matchdays: readonly number[];
  readonly missing_matchdays: readonly number[];
  readonly valid_count: number;
  readonly warning_count: number;
  readonly invalid_count: number;
  readonly matchdays: readonly BulkRevalidationMatchdayEntry[];
}

export interface BulkRevalidationTotals {
  readonly expected: number;
  readonly found: number;
  readonly valid: number;
  readonly warning: number;
  readonly invalid: number;
  readonly missing: number;
}

export interface BulkRevalidationReport {
  readonly run_id: string;
  readonly run_started_at: string;
  readonly run_finished_at: string;
  readonly repo_commit_sha: string;
  readonly script_version: string;
  readonly seasons: readonly BulkRevalidationSeasonSummary[];
  readonly totals: BulkRevalidationTotals;
  /** Gate stays OFF: an audit report never promotes anything. Always false. */
  readonly data_promoted_eligible: false;
  /** No identity resolution here. Always false. */
  readonly canonical_promoted: false;
  /** Set only after `assertRedacted` passes on the finished report — never a bare literal. */
  readonly redaction_check: "ok";
}

// ---- decode-error classification (pure, testable — no error .message ever surfaces) ----

/** Maps a thrown decode-stage error's `.name` to a coarse, redacted code. */
export function mapDecodeErrorNameToCode(errorName: string): string {
  switch (errorName) {
    case "XlsxDecodeError":
      return "xlsx_decode_error";
    case "XlsxCellTypeError":
      return "xlsx_cell_type_error";
    case "WorkbookError":
      return "workbook_error";
    default:
      return "unknown_decode_error";
  }
}

// ---- redaction guard ----

export class RedactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedactionError";
  }
}

// Keys that must never appear anywhere in a persisted report — a name/path/
// secret has no legitimate reason to be a field of this aggregate.
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "message",
  "name",
  "team",
  "player",
  "path",
  "filePath",
  "file_path",
  "url",
  "secret",
  "token",
  "cookie",
  "header",
  "auth",
  "credential",
]);

const PATH_OR_URL_RE = /https?:\/\/|[\\/]/;
const MAX_STRING_LENGTH = 200;

function walk(value: unknown, keyPath: string): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${keyPath}[${i}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new RedactionError(
          `Forbidden key '${key}' found at ${keyPath}.${key} — a persisted report must never carry names/paths/secrets`,
        );
      }
      walk(v, `${keyPath}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) {
      throw new RedactionError(
        `String value at ${keyPath} exceeds ${MAX_STRING_LENGTH} chars — looks like free text, not a code/id/hash`,
      );
    }
    if (PATH_OR_URL_RE.test(value)) {
      throw new RedactionError(`String value at ${keyPath} looks like a path or URL — not allowed in a persisted report`);
    }
  }
}

/** Throws `RedactionError` if any forbidden key or path/URL/oversized-string value is found. */
export function assertRedacted(report: unknown): void {
  walk(report, "$");
}

// ---- aggregation ----

function matchdayEntryFor(f: BulkRevalidationFileOutcome): BulkRevalidationMatchdayEntry {
  const rawHashMatch = f.expectedRawHash === null ? null : f.expectedRawHash === f.rawHash;

  if (f.outcome.kind === "decode_error") {
    return {
      matchday: f.matchday,
      raw_hash: f.rawHash,
      raw_hash_matches_acquisition_manifest: rawHashMatch,
      pipeline_status: "invalid",
      normalizedRows: null,
      parsedRecords: null,
      playerRecords: null,
      validationErrors: 0,
      validationWarnings: 0,
      issue_codes: [f.outcome.errorCode],
    };
  }

  const { pipeline } = f.outcome.manifest;
  return {
    matchday: f.matchday,
    raw_hash: f.rawHash,
    raw_hash_matches_acquisition_manifest: rawHashMatch,
    pipeline_status: pipeline.status,
    normalizedRows: pipeline.counts.normalizedRows,
    parsedRecords: pipeline.counts.parsedRecords,
    playerRecords: pipeline.counts.playerRecords,
    validationErrors: pipeline.counts.validationErrors,
    validationWarnings: pipeline.counts.validationWarnings,
    issue_codes: pipeline.issues.map((issue) => issue.code),
  };
}

/**
 * Aggregates per-file outcomes (already produced by the existing, unchanged
 * `normalizeVoteXlsxBytes`) into one deterministic, redacted report. Pure:
 * does no I/O, adds no validation rule, never touches `data_promoted`.
 * Throws `RedactionError` (defense-in-depth, should never trigger given this
 * function's own field set) instead of ever returning an unredacted report.
 */
export function buildBulkRevalidationReport(input: BuildBulkRevalidationReportInput): BulkRevalidationReport {
  const filesBySeason = new Map<string, BulkRevalidationFileOutcome[]>();
  for (const file of input.files) {
    const list = filesBySeason.get(file.season) ?? [];
    list.push(file);
    filesBySeason.set(file.season, list);
  }

  let totalExpected = 0;
  let totalFound = 0;
  let totalValid = 0;
  let totalWarning = 0;
  let totalInvalid = 0;
  let totalMissing = 0;

  const seasons: BulkRevalidationSeasonSummary[] = input.seasons.map((season) => {
    const files = (filesBySeason.get(season.season) ?? []).slice().sort((a, b) => a.matchday - b.matchday);
    const foundSet = new Set(files.map((f) => f.matchday));
    const foundMatchdays = [...foundSet].sort((a, b) => a - b);
    const missingMatchdays = season.expectedMatchdays.filter((md) => !foundSet.has(md));

    const matchdays = files.map(matchdayEntryFor);
    const validCount = matchdays.filter((m) => m.pipeline_status === "valid").length;
    const warningCount = matchdays.filter((m) => m.pipeline_status === "warning").length;
    const invalidCount = matchdays.filter((m) => m.pipeline_status === "invalid").length;

    totalExpected += season.expectedMatchdays.length;
    totalFound += matchdays.length;
    totalValid += validCount;
    totalWarning += warningCount;
    totalInvalid += invalidCount;
    totalMissing += missingMatchdays.length;

    return {
      season: season.season,
      season_code: season.seasonCode,
      expected_matchdays: season.expectedMatchdays,
      found_matchdays: foundMatchdays,
      missing_matchdays: missingMatchdays,
      valid_count: validCount,
      warning_count: warningCount,
      invalid_count: invalidCount,
      matchdays,
    };
  });

  const report: BulkRevalidationReport = {
    run_id: input.meta.runId,
    run_started_at: input.meta.startedAt,
    run_finished_at: input.meta.finishedAt,
    repo_commit_sha: input.meta.repoCommitSha,
    script_version: BULK_REVALIDATION_REPORT_VERSION,
    seasons,
    totals: {
      expected: totalExpected,
      found: totalFound,
      valid: totalValid,
      warning: totalWarning,
      invalid: totalInvalid,
      missing: totalMissing,
    },
    data_promoted_eligible: false,
    canonical_promoted: false,
    redaction_check: "ok",
  };

  assertRedacted(report);
  return report;
}

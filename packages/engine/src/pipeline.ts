// Synthetic end-to-end pipeline manifest — PURE, in-memory, fixture-only.
//
// Scope (approved minimal perimeter): run the EXISTING synthetic data pipeline
//   RawSheet → normalizeRawSheet → parseNormalizedVotes → validateVoteRecords
// over in-memory fixtures and summarize the outcome in a single deterministic
// manifest (overall status, stages executed, counts, validator issues). There is
// NO XLSX reading, NO sheet selection, NO file/Drive/network I/O, NO dependency,
// NO persistence, NO identity matching, NO ingestion.
//
// Gate invariant (enforced by construction):
//   - pipeline success ≠ data_promoted     (manifest.data_promoted_eligible is always false)
//   - pipeline success ≠ canonical_promoted (manifest.canonical_promoted is always false)
// This is an orchestration/observability layer only: it adds no new validation
// logic and promotes nothing. Each stage's behavior is defined by its own module
// and contract.

import { normalizeRawSheet, type RawSheet } from "./normalizer.js";
import { parseNormalizedVotes, playerCandidates } from "./parser.js";
import {
  validateVoteRecords,
  type VoteRecordValidationManifest,
  type VoteRecordIssue,
} from "./voteRecordValidation.js";

/** The three pipeline stages, in execution order. */
export type PipelineStageName = "normalize" | "parse" | "validate";

/**
 * Overall pipeline status (reuses the shared validation enum subset):
 *   - `invalid`  — a stage stopped (normalizer/parser threw), or the validator found errors;
 *   - `warning`  — every stage completed and the validator reported only warnings;
 *   - `valid`    — every stage completed and the validator found nothing.
 */
export type PipelineStatus = "valid" | "invalid" | "warning";

/** Per-stage execution record. `failed` carries the error class + message. */
export interface PipelineStageResult {
  readonly stage: PipelineStageName;
  readonly outcome: "ok" | "failed";
  /** Error name + message when the stage threw, else null. */
  readonly error: string | null;
}

/** Counts summarized across the run (null when a stage did not complete). */
export interface PipelineCounts {
  /** Rows in the normalized sheet (after safe-delete), or null if normalize failed. */
  readonly normalizedRows: number | null;
  /** Vote-record candidates emitted by the parser, or null if parse not reached. */
  readonly parsedRecords: number | null;
  /** Candidates excluding ALL (coach) rows, or null if parse not reached. */
  readonly playerRecords: number | null;
  /** Validator errors (0 if validate not reached). */
  readonly validationErrors: number;
  /** Validator warnings (0 if validate not reached). */
  readonly validationWarnings: number;
}

/** Deterministic end-to-end manifest of one synthetic pipeline run. */
export interface SyntheticPipelineManifest {
  readonly status: PipelineStatus;
  /** Stages actually executed, in order; stops at the first failed stage. */
  readonly stages: readonly PipelineStageResult[];
  readonly counts: PipelineCounts;
  /** Validator findings (empty if the validate stage was not reached). */
  readonly issues: readonly VoteRecordIssue[];
  /** Full validator sub-manifest when the validate stage ran, else null. */
  readonly validation: VoteRecordValidationManifest | null;
  /** The stage that stopped the pipeline, or null if all stages completed. */
  readonly failedStage: PipelineStageName | null;
  /** Gate stays OFF: the pipeline promotes no data. Always false. */
  readonly data_promoted_eligible: false;
  /** No identity resolution here: nothing is canonical-promoted. Always false. */
  readonly canonical_promoted: false;
}

function describeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return `Error: ${String(e)}`;
}

/**
 * Run the full synthetic pipeline over an in-memory RawSheet and return a
 * deterministic manifest. Pure: the same RawSheet always yields the same
 * manifest. Stages run in order and stop at the first failure (normalizer or
 * parser throwing); the validator stage runs only on successfully parsed
 * records. No stage is re-implemented here — this only orchestrates and reports.
 *
 * Note: by construction the parser emits contract-shaped candidates, so the
 * validate stage surfaces (at most) warnings on real parser output (e.g. a
 * duplicate per-file Cod.); validator *errors* are a defense-in-depth path for
 * hand-built/foreign records and are not expected from parser output.
 */
export function runSyntheticPipeline(raw: RawSheet): SyntheticPipelineManifest {
  const stages: PipelineStageResult[] = [];
  const counts: {
    normalizedRows: number | null;
    parsedRecords: number | null;
    playerRecords: number | null;
    validationErrors: number;
    validationWarnings: number;
  } = {
    normalizedRows: null,
    parsedRecords: null,
    playerRecords: null,
    validationErrors: 0,
    validationWarnings: 0,
  };

  const fail = (stage: PipelineStageName, e: unknown): SyntheticPipelineManifest => {
    stages.push({ stage, outcome: "failed", error: describeError(e) });
    return {
      status: "invalid",
      stages,
      counts,
      issues: [],
      validation: null,
      failedStage: stage,
      data_promoted_eligible: false,
      canonical_promoted: false,
    };
  };

  // Stage 1 — normalize.
  let normalized;
  try {
    normalized = normalizeRawSheet(raw);
    counts.normalizedRows = normalized.rows.length;
    stages.push({ stage: "normalize", outcome: "ok", error: null });
  } catch (e) {
    return fail("normalize", e);
  }

  // Stage 2 — parse.
  let records;
  try {
    records = parseNormalizedVotes(normalized);
    counts.parsedRecords = records.length;
    counts.playerRecords = playerCandidates(records).length;
    stages.push({ stage: "parse", outcome: "ok", error: null });
  } catch (e) {
    return fail("parse", e);
  }

  // Stage 3 — validate (never throws: returns a manifest).
  const validation = validateVoteRecords(records);
  counts.validationErrors = validation.errorCount;
  counts.validationWarnings = validation.warningCount;
  stages.push({ stage: "validate", outcome: "ok", error: null });

  return {
    status: validation.status, // valid | warning | invalid, mirrors the validator
    stages,
    counts,
    issues: validation.issues,
    validation,
    failedStage: null,
    data_promoted_eligible: false,
    canonical_promoted: false,
  };
}

// Composed vote-XLSX dry-run bridge — the one function this whole package
// exists to provide:
//
//   XLSX bytes -> Workbook -> RawSheet -> normalizeRawSheet -> parseNormalizedVotes
//   -> validateVoteRecords -> manifest
//
// This module adds NO new validation logic of its own. Every stage after
// decoding is the EXISTING, already-tested, dependency-free engine
// (`runSyntheticPipeline`, unchanged) — this only wires the real-bytes decode
// step in front of it and reports which sheets existed / which one was used.
// It is a dry-run: nothing here writes anywhere, promotes anything, or
// activates any gate.

import { decodeWorkbookFromBytes } from "./xlsxWorkbookAdapter.js";
import { rawSheetFromWorkbook, ITALIA_SHEET_NAME, type RawSheetSelection } from "../../engine/src/workbook.js";
import { runSyntheticPipeline, type SyntheticPipelineManifest } from "../../engine/src/pipeline.js";

/** Deterministic report of one XLSX vote-file dry-run. */
export interface VoteXlsxDryRunManifest {
  /** Every sheet name found in the decoded workbook, in file order. */
  readonly sheetNames: readonly string[];
  /** The sheet actually selected and fed into the pipeline. */
  readonly sheetUsed: string;
  /** Row count of the selected sheet's raw grid, before normalization. */
  readonly rawRowCount: number;
  /** The full normalize -> parse -> validate outcome (unchanged engine logic). */
  readonly pipeline: SyntheticPipelineManifest;
  /** Gate stays OFF: a dry-run never promotes anything. Always false. */
  readonly data_promoted_eligible: false;
}

/**
 * Run the full real-bytes dry-run bridge for one vote XLSX file already held
 * in memory. The default authoritative sheet is Redazione Italia (`Italia`).
 * Explicit alternate sheet selection remains possible only for bounded
 * diagnostics/cross-checks; callers building algorithm datasets must use the
 * default authoritative sheet.
 */
export async function normalizeVoteXlsxBytes(
  bytes: Uint8Array,
  selection: RawSheetSelection,
): Promise<VoteXlsxDryRunManifest> {
  const workbook = await decodeWorkbookFromBytes(bytes);
  const sheetNames = workbook.map((s) => s.name);
  const raw = rawSheetFromWorkbook(workbook, selection);
  const pipeline = runSyntheticPipeline(raw);
  return {
    sheetNames,
    sheetUsed: selection.sheetName ?? ITALIA_SHEET_NAME,
    rawRowCount: raw.rows.length,
    pipeline,
    data_promoted_eligible: false,
  };
}

// Composed listone-XLSX bridge — the one function this module exists to
// provide:
//
//   XLSX bytes -> Workbook -> resolveListonePool (structural sheet
//   selection + cross-sheet consistency, see listoneWorkbook.ts)
//   -> sortListoneRecordsCanonical -> toListoneCandidateRows
//
// Mirrors the shape of normalizeVoteXlsx.ts (same package, vote-file
// pipeline) but for the listone (auction price sheet), which has no
// packages/engine module of its own yet — see
// docs/data/LISTONE_XLSX_PARSER_CONTRACT.md. Adds no new
// validation/collision-check logic of its own: shape + collision checking
// stays with the already-existing `validateListonePool`
// (src/ui/listone.ts), applied by the caller (scripts/build-listone-candidate.ts)
// against this function's output. Never writes anywhere, never promotes any
// gate.

import { decodeWorkbookFromBytes } from "./xlsxWorkbookAdapter.js";
import { resolveListonePool, type CanonicalRole } from "./listoneWorkbook.js";
import {
  toListoneCandidateRows,
  sortListoneRecordsCanonical,
  LISTONE_TRANSFORM_VERSION,
  type ListoneCandidateRow,
} from "./listoneCandidate.js";

export interface ListoneXlsxParseResult {
  /** Every sheet name found in the decoded workbook, in file order. */
  readonly sheetNames: readonly string[];
  /** The sheet structurally identified as the complete pool (see
   * `resolveListonePool` for the exact rule — never chosen by name). */
  readonly sheetUsed: string;
  /** Which sheet was structurally identified as each canonical role's
   * mono-role sheet — provenance only, never selection input. */
  readonly roleSheetNames: Readonly<Record<CanonicalRole, string>>;
  /** 1-based row number of the header within the selected sheet. */
  readonly headerRowNumber: number;
  /** Number of data records extracted (before any collision check). */
  readonly dataRowCount: number;
  /** Canonically-ordered candidate rows, ready for serialization. */
  readonly candidateRows: readonly ListoneCandidateRow[];
  readonly transformVersion: string;
}

/**
 * Runs the full real-bytes parse for one listone XLSX file already held in
 * memory (never read from/written to disk by this function itself — that
 * I/O belongs to the caller). Throws `XlsxDecodeError`/`XlsxCellTypeError`
 * (decode stage), `ListoneSelectionError` (sheet selection: missing/
 * ambiguous role sheet, missing/ambiguous complete-pool sheet, non-disjoint
 * role sheets), `ListoneRowError` (a row that does not match the contract),
 * or `ListoneCrossSheetConsistencyError` (same `Id`, divergent fields
 * between the complete sheet and its role sheet) — always before any output
 * is produced, so a caller never receives a partial or guessed result.
 */
export async function parseListoneXlsxBytes(bytes: Uint8Array): Promise<ListoneXlsxParseResult> {
  const workbook = await decodeWorkbookFromBytes(bytes);
  const resolution = resolveListonePool(workbook);
  const candidateRows = toListoneCandidateRows(sortListoneRecordsCanonical(resolution.records));
  return {
    sheetNames: workbook.map((s) => s.name),
    sheetUsed: resolution.completeSheetName,
    roleSheetNames: resolution.roleSheetNames,
    headerRowNumber: resolution.headerRowIndex + 1,
    dataRowCount: resolution.records.length,
    candidateRows,
    transformVersion: LISTONE_TRANSFORM_VERSION,
  };
}

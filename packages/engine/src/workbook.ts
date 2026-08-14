// Pure workbook → RawSheet bridge — in-memory, no I/O, no dependency.
//
// This is the landing point between an already-decoded workbook (an array of
// named sheet grids) and the RawSheet the normalizer consumes. It owns the
// versioned, testable logic for selecting the authoritative editorial-vote
// sheet. Owner confirmed Redazione Italia as the league's vote authority, so
// the default/target sheet is `Italia`. `Fantacalcio` and `Statistico` are not
// training/validation targets and may only be used when explicitly requested
// for diagnostics or cross-checks.
//
// Decoding raw XLSX *bytes* into these grids is deliberately OUT OF SCOPE for
// the pure engine (which stays dependency-free and I/O-free): byte-level decode
// belongs to an adapter. This module starts from decoded grids so it remains
// deterministic and testable without real private XLSX files in the repo.

import type { SheetRow } from "./parser.js";
import type { RawSheet } from "./normalizer.js";

/** One decoded sheet: its name and its cell grid (rows of cells, in order). */
export interface SheetGrid {
  readonly name: string;
  readonly rows: readonly SheetRow[];
}

/** A decoded workbook: the ordered list of its sheet grids. */
export type Workbook = readonly SheetGrid[];

/** Authoritative editorial-vote sheet: Redazione Italia. */
export const ITALIA_SHEET_NAME = "Italia";

/** Raised on sheet-selection problems: stop, never guess which sheet was meant. */
export class WorkbookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbookError";
  }
}

/**
 * Select exactly one sheet by name. Throws if it is absent or duplicated —
 * never silently falls back to another sheet.
 */
export function selectSheet(workbook: Workbook, name: string): SheetGrid {
  const matches = workbook.filter((s) => s.name === name);
  if (matches.length === 0) {
    const available = workbook.map((s) => s.name).join(", ") || "(none)";
    throw new WorkbookError(`Sheet '${name}' not found (available: ${available})`);
  }
  if (matches.length > 1) {
    throw new WorkbookError(`Multiple sheets named '${name}' (${matches.length})`);
  }
  return matches[0]!;
}

export interface RawSheetSelection {
  readonly season: string;
  readonly matchday: number;
  /** Defaults to the authoritative Redazione Italia sheet. */
  readonly sheetName?: string;
}

/**
 * Assemble a `RawSheet` from a decoded workbook by selecting the target sheet
 * (default `Italia`) and attaching season/matchday. Pure: no decoding, no
 * normalization, no promotion.
 */
export function rawSheetFromWorkbook(workbook: Workbook, selection: RawSheetSelection): RawSheet {
  const sheetName = selection.sheetName ?? ITALIA_SHEET_NAME;
  const sheet = selectSheet(workbook, sheetName);
  return { season: selection.season, matchday: selection.matchday, rows: sheet.rows };
}

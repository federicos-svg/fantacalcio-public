// Manual Enrichment v1 — sheet/header/row reading.
//
// This package deliberately does NOT decode XLSX bytes: `packages/xlsx-adapter`
// is documented as "the ONLY place in this repo that decodes real XLSX
// binary" (see its `xlsxWorkbookAdapter.ts` header). This module starts from
// an already-decoded `Workbook`/`SheetGrid` (see types.ts for why those types
// are redefined locally instead of imported) and interprets headers/cells —
// never a second decoder, never `exceljs` in this file.

import type { Cell, HeaderIssue, SheetGrid, SheetRow, Workbook } from "./types.js";

/**
 * Every column name this contract knows, mandatory + optional (profilo
 * minimo v1 — see docs/data/MANUAL_ENRICHMENT_CONTRACT.md). Header cells are
 * matched by exact, case-sensitive name — this is Owner's own private file,
 * not a polished export, so v1 assumes the header row literally spells out
 * these snake_case field names (not human-friendly labels). A future
 * revision could add a label→field mapping if that turns out to matter;
 * not invented here without evidence it's needed.
 */
export const MANDATORY_COLUMNS: readonly string[] = [
  "listone_id",
  "nome",
  "ruolo",
  "squadra_attuale",
  "titolarita_prevista",
  "injury_flag",
  "source",
  "source_method",
  "confidence",
  "updated_at",
];

export const OPTIONAL_COLUMNS: readonly string[] = [
  "data_nascita",
  "eta",
  "trasferito_si_no",
  "ballottaggio",
  "gerarchia_portiere",
  "rigorista",
  "piazzati",
];

const KNOWN_COLUMNS: ReadonlySet<string> = new Set([...MANDATORY_COLUMNS, ...OPTIONAL_COLUMNS]);

/**
 * v1 sheet-selection rule: always the first sheet in the workbook, in file
 * order. This is Owner's own single-purpose private file, so no "find a
 * sheet named X" heuristic is invented without it being in the contract —
 * simple and deterministic beats guessing a naming convention nobody wrote
 * down. Returns `null` for an empty workbook (no sheets at all).
 */
export function selectEnrichmentSheet(workbook: Workbook): SheetGrid | null {
  return workbook[0] ?? null;
}

function isEmptyCell(cell: Cell): boolean {
  return cell === null || (typeof cell === "string" && cell.trim() === "");
}

/** A row is "completely empty" only if every cell in it is blank — a row with just one populated cell is real data, not padding. */
export function isRowEmpty(row: SheetRow): boolean {
  return row.every(isEmptyCell);
}

export interface HeaderMap {
  /** column name -> 0-based column index */
  readonly indexByColumn: ReadonlyMap<string, number>;
  readonly issues: readonly HeaderIssue[];
}

/**
 * Reads the header row (sheet row 0) and maps every *known* column name to
 * its position. Unknown header cells (e.g. Owner's own bookkeeping notes) are
 * silently ignored — never an error, since this contract only cares about
 * the columns it defines. Missing mandatory columns and a column name
 * repeated more than once are both reported as `HeaderIssue`s; when any
 * issue is present the caller must not attempt row parsing (see pipeline.ts).
 */
export function readHeaderRow(headerRow: SheetRow): HeaderMap {
  const seen = new Map<string, number>();
  const duplicated = new Set<string>();
  headerRow.forEach((cell, index) => {
    if (typeof cell !== "string") return;
    const name = cell.trim();
    if (!KNOWN_COLUMNS.has(name)) return;
    if (seen.has(name)) {
      duplicated.add(name);
      return;
    }
    seen.set(name, index);
  });

  const issues: HeaderIssue[] = [];
  for (const column of MANDATORY_COLUMNS) {
    if (!seen.has(column)) {
      issues.push({ code: "missing_mandatory_column", field: column });
    }
  }
  for (const column of duplicated) {
    issues.push({ code: "duplicate_column_header", field: column });
  }

  return { indexByColumn: seen, issues };
}

/** Extracts only the known-column cells of one data row, keyed by column name — unknown columns are dropped, matching readHeaderRow. */
export function projectRow(row: SheetRow, headerMap: HeaderMap): ReadonlyMap<string, Cell> {
  const projected = new Map<string, Cell>();
  for (const [column, index] of headerMap.indexByColumn) {
    projected.set(column, row[index] ?? null);
  }
  return projected;
}

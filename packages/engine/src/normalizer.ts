// Fantacalcio raw-grid → NormalizedSheet normalizer — PURE, in-memory.
//
// Scope: turn an in-memory *raw* grid (one already-selected vote sheet —
// canonically the authoritative Redazione Italia `Italia` sheet, chosen by
// workbook.ts and decoded from XLSX by an out-of-engine adapter) into a
// `NormalizedSheet` that the existing parser (parser.ts) consumes. There is
// NO XLSX byte decoding, NO dependency, NO file/Drive/network I/O, NO
// persistence, NO identity, NO ingestion here.
//
// This implements the row-level step of docs/data/FANTACALCIO_XLSX_CONTRACT.md
// with a **content-based** preamble rule (NOT a positional "delete rows 2-4"):
// the real file's rows 2-4 are copyright/notice text, not empty padding, so the
// preamble is identified by structure, not by index. Anything the layout does
// not define is NOT invented — it stops and signals (see NormalizeError).

import type { Cell, SheetRow, NormalizedSheet } from "./parser.js";
import { FANTACALCIO_HEADER } from "./parser.js";

/** An in-memory *raw* grid for one season/matchday (one already-selected vote sheet). */
export interface RawSheet {
  /** "YYYY_YY", e.g. "2024_25" (passed through to the NormalizedSheet). */
  readonly season: string;
  /** 1..38 (passed through to the NormalizedSheet). */
  readonly matchday: number;
  /** Raw rows, in original order, before preamble stripping. */
  readonly rows: readonly SheetRow[];
}

/** Raised when the raw format does not match the contract: stop, never invent. */
export class NormalizeError extends Error {
  constructor(message: string, readonly rowIndex?: number) {
    super(message);
    this.name = "NormalizeError";
  }
}

const ROLES: ReadonlySet<string> = new Set(["P", "D", "C", "A", "ALL"]);

function isEmpty(cell: Cell): boolean {
  return cell === null || (typeof cell === "string" && cell.trim() === "");
}

function filledCount(row: SheetRow): number {
  return row.reduce<number>((n, c) => (isEmpty(c) ? n : n + 1), 0);
}

function isBlankRow(row: SheetRow): boolean {
  return filledCount(row) === 0;
}

function isExactHeader(row: SheetRow): boolean {
  return FANTACALCIO_HEADER.every((h, i) => row[i] === h);
}

// Starts like the contract header but is not an exact match (e.g. truncated /
// extra columns / reordered) — always ambiguous, never silently accepted.
function isNearHeader(row: SheetRow): boolean {
  return row[0] === "Cod." && !isExactHeader(row);
}

function isPlayerOrAll(row: SheetRow): boolean {
  return typeof row[1] === "string" && ROLES.has(row[1]);
}

// A "single-cell text" row = exactly one non-empty cell, and it sits in column 0
// as a string. This is the SHAPE shared by the title, the copyright/notice
// lines, AND a real team-name row. Shape alone does NOT make it a team — a team
// is only recognized when it is immediately followed by the exact header.
function isSingleCellText(row: SheetRow): boolean {
  return filledCount(row) === 1 && typeof row[0] === "string" && row[0].trim() !== "";
}

/**
 * Normalize a raw grid into a `NormalizedSheet` for the parser.
 *
 * Content-based algorithm (replaces the old positional "delete rows 2-4"):
 *   1. Find the first **team block start**: the first single-cell text row that
 *      is immediately followed by the exact contract header. Everything before
 *      it is preamble (title + copyright/notice lines) and is dropped. The
 *      preamble may contain only blank, title or notice (single-cell text) rows;
 *      a header/player/ALL row in the preamble → NormalizeError (format changed).
 *   2. Keep the body (first team block onward) for the parser, but validate its
 *      shape: a single-cell text row in the body is a team row ONLY if the next
 *      row is the exact header; otherwise it is an ambiguous stray line →
 *      NormalizeError. Repeated headers, blank separators, player/ALL rows are
 *      all valid body rows and are preserved in order.
 *   3. A near-header row ("Cod." but not the exact header) anywhere → ambiguous
 *      NormalizeError.
 *
 * season/matchday pass through and are validated downstream by the parser.
 */
export function normalizeRawSheet(raw: RawSheet): NormalizedSheet {
  const rows = raw.rows;

  // 1. Locate the first team block: single-cell text immediately followed by the header.
  let start = -1;
  for (let i = 0; i < rows.length; i++) {
    if (isSingleCellText(rows[i]!) && i + 1 < rows.length && isExactHeader(rows[i + 1]!)) {
      start = i;
      break;
    }
  }
  if (start === -1) {
    throw new NormalizeError(
      "No team block found (expected a single-cell team row immediately followed by the exact contract header)",
    );
  }

  // Preamble [0, start): only blank / title / notice (single-cell text) allowed.
  for (let i = 0; i < start; i++) {
    const row = rows[i]!;
    if (isBlankRow(row)) continue;
    if (isNearHeader(row)) {
      throw new NormalizeError("Ambiguous header row in preamble (does not match the contract header)", i);
    }
    if (isExactHeader(row) || isPlayerOrAll(row)) {
      throw new NormalizeError("Unexpected structural row in preamble (format changed)", i);
    }
    if (isSingleCellText(row)) continue; // title or copyright/notice line — dropped
    throw new NormalizeError("Unrecognized preamble row (cannot classify)", i);
  }

  // 2. Body [start, end): validate block shape; team rows must be header-anchored.
  const body = rows.slice(start);
  for (let i = 0; i < body.length; i++) {
    const row = body[i]!;
    if (isBlankRow(row)) continue;
    if (isExactHeader(row)) continue; // repeated per-team header
    if (isNearHeader(row)) {
      throw new NormalizeError("Ambiguous header row (does not match the contract header)", start + i);
    }
    if (isPlayerOrAll(row)) continue; // player or ALL (coach) row
    if (isSingleCellText(row)) {
      const next = body[i + 1];
      if (next && isExactHeader(next)) continue; // valid team row (header-anchored)
      throw new NormalizeError(
        "Single-cell text row not followed by the exact header (ambiguous team/notice line)",
        start + i,
      );
    }
    throw new NormalizeError("Unrecognized structural row (cannot classify)", start + i);
  }

  return { season: raw.season, matchday: raw.matchday, rows: body };
}

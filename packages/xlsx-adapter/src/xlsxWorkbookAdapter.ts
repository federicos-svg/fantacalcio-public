// XLSX bytes -> Workbook adapter — the ONLY place in this repo that decodes
// real XLSX binary. Everything downstream (packages/engine) stays pure and
// dependency-free, per every data contract in this repo (see
// packages/engine/src/workbook.ts's own header comment, which explicitly
// defers byte-level decoding to "an adapter").
//
// Uses `exceljs` (MIT) rather than the more commonly seen `xlsx`/SheetJS
// package: at install time the npm-published `xlsx@0.18.5` carries two open,
// unpatched advisories (GHSA-4r6h-8v6p-xvw6 prototype pollution, high;
// GHSA-5pgg-2g8v-p4x9 ReDoS, high) with `fixAvailable: false` on npm — SheetJS
// only ships the patched releases through their own CDN, which this sandbox's
// network policy cannot reach to verify/pin. `exceljs` has no open high/critical
// advisory (only a moderate, unrelated `uuid` buffer-bounds report that does not
// apply to how this adapter calls it — no buffer reuse). No other dependency
// change: this is the one library needed to decode real XLSX bytes into a grid.

import ExcelJS from "exceljs";
import type { Cell } from "../../engine/src/parser.js";
import type { Workbook, SheetGrid } from "../../engine/src/workbook.js";

/** Raised when a decoded cell's value is a type this adapter refuses to guess at. */
export class XlsxCellTypeError extends Error {
  constructor(
    message: string,
    readonly sheetName: string,
    readonly rowNumber: number,
    readonly colNumber: number,
  ) {
    super(message);
    this.name = "XlsxCellTypeError";
  }
}

/** Raised when the input bytes cannot be parsed as an XLSX workbook at all. */
export class XlsxDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxDecodeError";
  }
}

// exceljs cell.value can be: null/undefined, string, number, boolean, Date, a
// rich-text object, a formula object ({formula, result}), a hyperlink object,
// or an error object. The real Fantacalcio sheet only ever contains plain
// strings and numbers (Cod./Voto/stat columns) — anything else means either a
// different/corrupted file or a cell shape this adapter has never seen, and
// per every contract in this repo the answer to "never seen before" is to
// stop, not guess.
function toGridCell(value: unknown, sheetName: string, rowNumber: number, colNumber: number): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return value;
  const kind =
    value instanceof Date
      ? "a Date"
      : typeof value === "boolean"
        ? "a boolean"
        : typeof value === "object" && value !== null && "richText" in value
          ? "rich text"
          : typeof value === "object" && value !== null && "formula" in value
            ? "a formula"
            : typeof value === "object" && value !== null && "hyperlink" in value
              ? "a hyperlink"
              : typeof value === "object" && value !== null && "error" in value
                ? "a spreadsheet error value"
                : `an unsupported type (${typeof value})`;
  throw new XlsxCellTypeError(
    `Cell [${sheetName} R${rowNumber}C${colNumber}] is ${kind} — expected a plain string, number, or blank cell`,
    sheetName,
    rowNumber,
    colNumber,
  );
}

/**
 * Decode one worksheet into a dense grid of rows, each row padded with `null`
 * up to the worksheet's own declared column count so downstream fixed-position
 * indexing (the normalizer/parser both read specific column indices) never
 * sees `undefined` for a genuinely blank trailing cell.
 *
 * Merged cells: the real Fantacalcio file merges its title/notice/team-name
 * rows across all 13 columns (one populated cell, twelve merged into it) —
 * but exceljs's `cell.value` mirrors the MASTER cell's value on every merged
 * position for rendering convenience, which would make every column of a
 * merged row look "populated" to the normalizer (it isn't; only the master
 * cell genuinely holds a value). Non-master merge members are read back as
 * `null` here so the grid reflects what a human looking at the sheet sees:
 * one value, not the value repeated across the whole merge span.
 */
function decodeWorksheet(ws: ExcelJS.Worksheet): SheetGrid {
  const rows: Cell[][] = [];
  const columnCount = ws.columnCount;
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: Cell[] = [];
    for (let col = 1; col <= columnCount; col++) {
      const cell = row.getCell(col);
      const value = cell.type === ExcelJS.ValueType.Merge ? null : cell.value;
      cells.push(toGridCell(value, ws.name, rowNumber, col));
    }
    rows.push(cells);
  });
  return { name: ws.name, rows };
}

/**
 * Decode raw XLSX bytes into a `Workbook` (all sheets, in file order) — pure
 * data-in/data-out aside from the exceljs call itself. Never selects a sheet,
 * never normalizes, never invents a value for a cell it cannot classify.
 * Throws `XlsxDecodeError` if the bytes are not a readable XLSX workbook at
 * all, or `XlsxCellTypeError` if any cell holds a value this adapter does not
 * understand (see `toGridCell`).
 */
export async function decodeWorkbookFromBytes(bytes: Uint8Array): Promise<Workbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // exceljs's own .d.ts declares a bare ambient `interface Buffer extends
    // ArrayBuffer {}`, which merges badly with @types/node's newer generic
    // `Buffer<ArrayBufferLike>` (a real Node Buffer's `.slice()` returns
    // Uint8Array, not ArrayBuffer, so TS sees the merged type as
    // unsatisfiable) — a real Node Buffer is exactly what exceljs expects and
    // documents at runtime; this cast works around the typings mismatch only.
    await workbook.xlsx.load(buf as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new XlsxDecodeError(`Could not decode XLSX bytes as a workbook: ${message}`);
  }
  return workbook.worksheets.map(decodeWorksheet);
}

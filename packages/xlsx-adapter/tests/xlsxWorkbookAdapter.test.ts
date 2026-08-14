import { describe, it, expect } from "vitest";
import { decodeWorkbookFromBytes, XlsxDecodeError, XlsxCellTypeError } from "../src/xlsxWorkbookAdapter.js";
import { buildXlsxBytes, teamBlock, playerRow, TITLE_ROW } from "../fixtures/testWorkbookBuilder.js";

describe("decodeWorkbookFromBytes", () => {
  it("decodes a real (in-memory-built) workbook's sheets in file order", async () => {
    const bytes = await buildXlsxBytes([
      { name: "Fantacalcio", rows: [TITLE_ROW, ...teamBlock("Atalanta", [playerRow(1, "P", "Carnesecchi", 7)])] },
      { name: "Statistico", rows: [["irrelevant"]] },
      { name: "Italia", rows: [["irrelevant"]] },
    ]);
    const workbook = await decodeWorkbookFromBytes(bytes);
    expect(workbook.map((s) => s.name)).toEqual(["Fantacalcio", "Statistico", "Italia"]);
  });

  it("preserves string and number cells exactly, and pads blank trailing cells with null", async () => {
    const bytes = await buildXlsxBytes([{ name: "Fantacalcio", rows: [["Cod.", "Ruolo", "Nome", "Voto"], [1, "P", "Test", 6.5]] }]);
    const workbook = await decodeWorkbookFromBytes(bytes);
    const sheet = workbook[0]!;
    expect(sheet.rows[1]).toEqual([1, "P", "Test", 6.5]);
    // A shorter row than the sheet's declared column count must be padded, not
    // left as `undefined` — the normalizer/parser index fixed positions.
    expect(sheet.rows.every((row) => row.every((cell) => cell === null || typeof cell === "string" || typeof cell === "number"))).toBe(true);
  });

  it("never invents a value for a cell type it does not understand — throws XlsxCellTypeError", async () => {
    const bytes = await buildXlsxBytes([{ name: "Fantacalcio", rows: [["Cod.", "Ruolo"], [true, "P"]] }]);
    await expect(decodeWorkbookFromBytes(bytes)).rejects.toThrow(XlsxCellTypeError);
  });

  it("throws XlsxCellTypeError (not a silent stringify) for a Date-valued cell", async () => {
    const bytes = await buildXlsxBytes([{ name: "Fantacalcio", rows: [["Cod."], [new Date("2024-01-01")]] }]);
    await expect(decodeWorkbookFromBytes(bytes)).rejects.toThrow(XlsxCellTypeError);
  });

  it("fails clearly (XlsxDecodeError) on bytes that are not a readable XLSX workbook at all", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(decodeWorkbookFromBytes(garbage)).rejects.toThrow(XlsxDecodeError);
  });

  // Regression: the real G38 pilot file merges its title/notice/team-name rows
  // across all 13 columns (found via the real dry-run — see
  // docs/data/XLSX_ADAPTER_CONTRACT.md). exceljs mirrors the merge's master
  // value onto every merged column when read via `cell.value`, which would
  // make a single-cell team row look like 13 populated cells to the
  // normalizer. Only the master cell's value must survive; the rest must
  // decode as `null`, exactly as a human reading the sheet would see it.
  it("reads only the master cell of a merged range — other merged columns decode as null", async () => {
    const bytes = await buildXlsxBytes([
      {
        name: "Fantacalcio",
        rows: [
          ["Atalanta", null, null, null, null, null, null, null, null, null, null, null, null],
          ["Cod.", "Ruolo", "Nome", "Voto", "Gf", "Gs", "Rp", "Rs", "Rf", "Au", "Amm", "Esp", "Ass"],
        ],
        merges: [[1, 1, 1, 13]],
      },
    ]);
    const workbook = await decodeWorkbookFromBytes(bytes);
    const teamRow = workbook[0]!.rows[0]!;
    expect(teamRow[0]).toBe("Atalanta");
    expect(teamRow.slice(1)).toEqual(new Array(12).fill(null));
  });
});

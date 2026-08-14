// Shared synthetic-workbook builder for this package's tests — builds real
// XLSX bytes in memory via exceljs (the same library the adapter decodes
// with), so every test is a genuine encode/decode round-trip and never needs
// a real file. No real data anywhere in this file.

import ExcelJS from "exceljs";

export type TestCell = string | number | boolean | Date | null;

export interface TestSheet {
  readonly name: string;
  readonly rows: readonly (readonly TestCell[])[];
  /**
   * 1-based inclusive merge ranges [startRow, startCol, endRow, endCol] —
   * mirrors how the real Fantacalcio file actually stores its title/notice/
   * team-name rows (one populated cell merged across all 13 columns, not a
   * populated cell followed by genuinely blank ones). Only set the value on
   * the merge's top-left cell in `rows`; the others must be `null`.
   */
  readonly merges?: readonly (readonly [number, number, number, number])[];
}

/** Build real XLSX bytes containing the given sheets, in order. */
export async function buildXlsxBytes(sheets: readonly TestSheet[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    sheet.rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell !== null) ws.getCell(r + 1, c + 1).value = cell;
      });
    });
    for (const [r1, c1, r2, c2] of sheet.merges ?? []) {
      ws.mergeCells(r1, c1, r2, c2);
    }
  }
  const buf = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

const FANTACALCIO_HEADER: readonly string[] = [
  "Cod.", "Ruolo", "Nome", "Voto", "Gf", "Gs", "Rp", "Rs", "Rf", "Au", "Amm", "Esp", "Ass",
];

/** One player/ALL row shaped like the real contract (Cod./Ruolo/Nome/Voto + stats). */
export function playerRow(
  cod: number,
  ruolo: "P" | "D" | "C" | "A" | "ALL",
  nome: string,
  voto: TestCell,
): readonly TestCell[] {
  return [cod, ruolo, nome, voto, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}

/** A full team block: team-name row + header row + the given player/ALL rows. */
export function teamBlock(team: string, players: readonly (readonly TestCell[])[]): (readonly TestCell[])[] {
  return [[team], FANTACALCIO_HEADER, ...players];
}

export const TITLE_ROW: readonly TestCell[] = ["Voti Fantacalcio 38ª giornata di campionato"];

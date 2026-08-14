import { describe, it, expect } from "vitest";
import { parseListoneXlsxBytes } from "../src/parseListoneXlsx.js";
import { ListoneSelectionError } from "../src/listoneWorkbook.js";
import { toListoneWireRow } from "../src/listoneCandidate.js";
import { buildXlsxBytes } from "../fixtures/testWorkbookBuilder.js";
import {
  buildValidListoneWorkbookSheets,
  departedPlayersSheet,
  listoneRow,
  MINIMAL_VALID_ROLE_ROWS,
  type RoleRows,
} from "../fixtures/listoneTestWorkbookBuilder.js";
// Reused, not duplicated — the shape+collision check that already exists for
// the app's listone loader (docs/data/LISTONE_UI_LOAD_CONTRACT.md). Same
// precedent as e2e/fixtures/synthetic-listone.ts importing this same module.
import { validateListonePool } from "../../../src/ui/listone.js";

describe("parseListoneXlsxBytes — end to end (synthetic fixtures only)", () => {
  it("parses a well-formed workbook into canonically-ordered candidate rows", async () => {
    const sheets = buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS);
    const bytes = await buildXlsxBytes(sheets);
    const result = await parseListoneXlsxBytes(bytes);
    expect(result.sheetNames).toEqual(["RoleSheetP", "RoleSheetD", "RoleSheetC", "RoleSheetA", "CompleteSheet"]);
    expect(result.sheetUsed).toBe("CompleteSheet");
    expect(result.roleSheetNames).toEqual({ P: "RoleSheetP", D: "RoleSheetD", C: "RoleSheetC", A: "RoleSheetA" });
    expect(result.headerRowNumber).toBe(2);
    expect(result.dataRowCount).toBe(4);
    expect(result.candidateRows.map((r) => r.role)).toEqual(["P", "D", "C", "A"]);
    expect(result.transformVersion).toBe("listone-xlsx-v2");
  });

  it("propagates ListoneSelectionError when a role sheet is missing", async () => {
    const rows: RoleRows = { ...MINIMAL_VALID_ROLE_ROWS, C: [] };
    const bytes = await buildXlsxBytes(buildValidListoneWorkbookSheets(rows));
    await expect(parseListoneXlsxBytes(bytes)).rejects.toThrow(ListoneSelectionError);
  });

  it("two independent parses of the same bytes are byte-identical after serialization", async () => {
    const bytes = await buildXlsxBytes(buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS));
    const first = await parseListoneXlsxBytes(bytes);
    const second = await parseListoneXlsxBytes(bytes);
    expect(JSON.stringify(first.candidateRows.map(toListoneWireRow))).toBe(JSON.stringify(second.candidateRows.map(toListoneWireRow)));
  });

  it("candidate rows pass the existing app-level shape/collision validator unchanged", async () => {
    const bytes = await buildXlsxBytes(buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS));
    const result = await parseListoneXlsxBytes(bytes);
    const wire = result.candidateRows.map(toListoneWireRow);
    const validation = validateListonePool(wire);
    expect(validation.ok).toBe(true);
    if (validation.ok) expect(validation.pool).toHaveLength(4);
  });

  it("a name+club collision in the source data is caught by the reused collision check (fail-closed)", async () => {
    const rows: RoleRows = {
      ...MINIMAL_VALID_ROLE_ROWS,
      // Same normalized name+club as the P row, different Id — a real
      // ambiguous-identity case the app-level validator must still catch.
      P: [...MINIMAL_VALID_ROLE_ROWS.P, listoneRow(5, "P", "Por", "Portiere Uno", "ClubUno", 3)],
    };
    const sheets = buildValidListoneWorkbookSheets(rows);
    const bytes = await buildXlsxBytes(sheets);
    const result = await parseListoneXlsxBytes(bytes);
    const wire = result.candidateRows.map(toListoneWireRow);
    const validation = validateListonePool(wire);
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.reason).toBe("ambiguous-identity");
  });

  it("ignores a disjoint, multi-role departed-players-shaped sheet end to end (Ceduti-analog)", async () => {
    const sheets = buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS);
    sheets.push(
      departedPlayersSheet("QualcheAltroFoglio", [
        listoneRow(777, "P", "Por", "Uscito Uno", "ClubEsterno", 1),
        listoneRow(778, "D", "Dc", "Uscito Due", "ClubEsterno", 2),
      ]),
    );
    const bytes = await buildXlsxBytes(sheets);
    const result = await parseListoneXlsxBytes(bytes);
    expect(result.sheetUsed).toBe("CompleteSheet");
    expect(result.dataRowCount).toBe(4);
  });
});

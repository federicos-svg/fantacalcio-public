import { describe, it, expect } from "vitest";
import { decodeWorkbookFromBytes } from "../src/xlsxWorkbookAdapter.js";
import {
  resolveListonePool,
  extractListoneRecords,
  ListoneSelectionError,
  ListoneRowError,
  ListoneCrossSheetConsistencyError,
  LISTONE_HEADER_COLUMNS,
} from "../src/listoneWorkbook.js";
import { buildXlsxBytes } from "../fixtures/testWorkbookBuilder.js";
import {
  listoneSheet,
  listoneRow,
  buildValidListoneWorkbookSheets,
  departedPlayersSheet,
  MINIMAL_VALID_ROLE_ROWS,
  LISTONE_HEADER_ROW,
  LISTONE_TITLE_ROW,
  type RoleRows,
} from "../fixtures/listoneTestWorkbookBuilder.js";

async function resolveFromSheets(sheets: Parameters<typeof buildXlsxBytes>[0]) {
  const bytes = await buildXlsxBytes(sheets);
  const workbook = await decodeWorkbookFromBytes(bytes);
  return resolveListonePool(workbook);
}

describe("resolveListonePool — exact union of the four role sheets", () => {
  it("selects the complete sheet whose Id set exactly equals the union of the four role sheets", async () => {
    const resolution = await resolveFromSheets(buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS));
    expect(resolution.completeSheetName).toBe("CompleteSheet");
    expect(resolution.records).toHaveLength(4);
    expect(resolution.records.map((r) => r.role).sort()).toEqual(["A", "C", "D", "P"]);
  });

  it("does not select on sheet name — arbitrary names for all five sheets still resolve correctly", async () => {
    const sheets = buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS, {
      P: "Foglio1",
      D: "Foglio2",
      C: "Foglio3",
      A: "Foglio4",
      complete: "FoglioZ",
    });
    const resolution = await resolveFromSheets(sheets);
    expect(resolution.completeSheetName).toBe("FoglioZ");
    expect(resolution.roleSheetNames).toEqual({ P: "Foglio1", D: "Foglio2", C: "Foglio3", A: "Foglio4" });
  });

  it("identifies each role sheet structurally and records it in roleSheetNames", async () => {
    const resolution = await resolveFromSheets(buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS));
    expect(resolution.roleSheetNames).toEqual({
      P: "RoleSheetP",
      D: "RoleSheetD",
      C: "RoleSheetC",
      A: "RoleSheetA",
    });
  });

  it("ignores a disjoint, multi-role 'departed players' sheet (Ceduti-shaped) with no name-based special-casing", async () => {
    const departed = departedPlayersSheet("QualunqueNome", [
      listoneRow(9001, "P", "Por", "Uscito Uno", "ClubEsterno", 1),
      listoneRow(9002, "D", "Dc", "Uscito Due", "ClubEsterno", 3),
    ]);
    const resolution = await resolveFromSheets([...buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS), departed]);
    expect(resolution.completeSheetName).toBe("CompleteSheet");
    expect(resolution.records.map((r) => r.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("throws when no header-compatible sheet exists at all", async () => {
    const bytes = await buildXlsxBytes([{ name: "Vuoto", rows: [["not", "a", "listone"]] }]);
    const workbook = await decodeWorkbookFromBytes(bytes);
    expect(() => resolveListonePool(workbook)).toThrow(ListoneSelectionError);
  });

  it("throws when a role is missing entirely (no role-pure sheet for it)", async () => {
    const rows: RoleRows = { ...MINIMAL_VALID_ROLE_ROWS, A: [] };
    // An empty role-A sheet has zero distinct roles — neither role-pure nor
    // multi-role — so no sheet claims role A at all.
    const sheets = buildValidListoneWorkbookSheets(rows);
    await expect(resolveFromSheets(sheets)).rejects.toThrow(/No role-pure sheet found for role 'A'/);
  });

  it("throws when two sheets both qualify as role-pure for the same role (ambiguous)", async () => {
    const sheets = buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS);
    // A second, independent role-pure P sheet with a different Id.
    sheets.push(listoneSheet("DuplicatoP", [listoneRow(5, "P", "Por", "Portiere Due", "ClubCinque", 8)]));
    const bytes = await buildXlsxBytes(sheets);
    const workbook = await decodeWorkbookFromBytes(bytes);
    expect(() => resolveListonePool(workbook)).toThrow(/Multiple role-pure sheets found for role 'P'/);
  });

  it("throws when a role sheet contains a foreign role mixed in (no longer role-pure for its intended role)", async () => {
    const rows: RoleRows = {
      ...MINIMAL_VALID_ROLE_ROWS,
      P: [...MINIMAL_VALID_ROLE_ROWS.P, listoneRow(99, "D", "Dc", "Intruso", "ClubSei", 7)],
    };
    const sheets = buildValidListoneWorkbookSheets(rows);
    // The "P" sheet is now multi-role (P + D) so it no longer claims role P,
    // and role D is already claimed by RoleSheetD — role P ends up with zero
    // claimants.
    await expect(resolveFromSheets(sheets)).rejects.toThrow(/No role-pure sheet found for role 'P'/);
  });

  it("throws when the same Id appears in two different role sheets (role sheets must be pairwise disjoint)", async () => {
    // Built by hand (not via buildValidListoneWorkbookSheets' auto-union) so
    // the complete sheet itself has no internal duplicate — isolating the
    // pairwise-disjoint-across-role-sheets check from the unrelated
    // duplicate-Id-within-one-sheet check (extractListoneRecords), which
    // would otherwise fire first if the complete sheet also carried both
    // colliding rows.
    const sheets = [
      listoneSheet("RoleSheetP", [listoneRow(1, "P", "Por", "Portiere Uno", "ClubUno", 10)]),
      listoneSheet("RoleSheetD", [listoneRow(1, "D", "Dc", "Difensore Collisione", "ClubDue", 12)]), // same Id=1
      listoneSheet("RoleSheetC", MINIMAL_VALID_ROLE_ROWS.C),
      listoneSheet("RoleSheetA", MINIMAL_VALID_ROLE_ROWS.A),
      listoneSheet("CompleteSheet", [
        listoneRow(1, "P", "Por", "Portiere Uno", "ClubUno", 10),
        ...MINIMAL_VALID_ROLE_ROWS.C,
        ...MINIMAL_VALID_ROLE_ROWS.A,
      ]),
    ];
    await expect(resolveFromSheets(sheets)).rejects.toThrow(/role sheets must be pairwise disjoint/);
  });

  it("throws when the complete sheet is missing an Id present in the role sheets (union mismatch)", async () => {
    const sheets = buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS);
    const completeIdx = sheets.findIndex((s) => s.name === "CompleteSheet");
    // Drop the last data row from the complete sheet only.
    sheets[completeIdx] = listoneSheet("CompleteSheet", [
      MINIMAL_VALID_ROLE_ROWS.P[0]!,
      MINIMAL_VALID_ROLE_ROWS.D[0]!,
      MINIMAL_VALID_ROLE_ROWS.C[0]!,
    ]);
    const bytes = await buildXlsxBytes(sheets);
    const workbook = await decodeWorkbookFromBytes(bytes);
    expect(() => resolveListonePool(workbook)).toThrow(/No sheet found whose Id set exactly equals the union/);
  });

  it("throws when the complete sheet has an extra Id not present in any role sheet (union mismatch)", async () => {
    const sheets = buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS);
    const completeIdx = sheets.findIndex((s) => s.name === "CompleteSheet");
    sheets[completeIdx] = listoneSheet("CompleteSheet", [
      ...MINIMAL_VALID_ROLE_ROWS.P,
      ...MINIMAL_VALID_ROLE_ROWS.D,
      ...MINIMAL_VALID_ROLE_ROWS.C,
      ...MINIMAL_VALID_ROLE_ROWS.A,
      listoneRow(555, "A", "Pc", "Fantasma", "ClubSette", 9),
    ]);
    const bytes = await buildXlsxBytes(sheets);
    const workbook = await decodeWorkbookFromBytes(bytes);
    expect(() => resolveListonePool(workbook)).toThrow(/No sheet found whose Id set exactly equals the union/);
  });

  it("throws ListoneCrossSheetConsistencyError when the same Id has divergent data between the complete sheet and its role sheet", async () => {
    const sheets = buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS);
    const completeIdx = sheets.findIndex((s) => s.name === "CompleteSheet");
    sheets[completeIdx] = listoneSheet("CompleteSheet", [
      listoneRow(1, "P", "Por", "Portiere Uno MODIFICATO", "ClubUno", 10), // name differs from the role sheet
      ...MINIMAL_VALID_ROLE_ROWS.D,
      ...MINIMAL_VALID_ROLE_ROWS.C,
      ...MINIMAL_VALID_ROLE_ROWS.A,
    ]);
    const bytes = await buildXlsxBytes(sheets);
    const workbook = await decodeWorkbookFromBytes(bytes);
    expect(() => resolveListonePool(workbook)).toThrow(ListoneCrossSheetConsistencyError);
  });
});

describe("resolveListonePool — header structural checks (shared by every header-compatible sheet)", () => {
  it("throws when the header is missing entirely (only title + data, no header row)", async () => {
    const bytes = await buildXlsxBytes([
      { name: "SenzaHeader", rows: [LISTONE_TITLE_ROW, listoneRow(1, "P", "Por", "X", "Y", 1)], merges: [[1, 1, 1, 13]] },
    ]);
    const workbook = await decodeWorkbookFromBytes(bytes);
    expect(() => resolveListonePool(workbook)).toThrow(ListoneSelectionError);
  });

  it("does not recognize a sheet whose header columns are reordered", async () => {
    const reordered = [...LISTONE_HEADER_ROW];
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!]; // swap Id/R
    const bytes = await buildXlsxBytes([
      { name: "Riordinato", rows: [LISTONE_TITLE_ROW, reordered, listoneRow(1, "P", "Por", "X", "Y", 1)], merges: [[1, 1, 1, 13]] },
    ]);
    const workbook = await decodeWorkbookFromBytes(bytes);
    expect(() => resolveListonePool(workbook)).toThrow(ListoneSelectionError);
  });

  it("does not recognize a sheet with an unexpected extra header column (14th column populated)", async () => {
    const extended = [...LISTONE_HEADER_ROW, "Nuova Colonna"];
    const bytes = await buildXlsxBytes([
      { name: "ColonnaExtra", rows: [LISTONE_TITLE_ROW, extended, listoneRow(1, "P", "Por", "X", "Y", 1)], merges: [[1, 1, 1, 14]] },
    ]);
    const workbook = await decodeWorkbookFromBytes(bytes);
    expect(() => resolveListonePool(workbook)).toThrow(ListoneSelectionError);
  });

  it("does not recognize a sheet with a populated 15th column even when the 14th is empty (Finding 9)", async () => {
    // rowMatchesHeader previously only inspected the single cell immediately
    // after the known 13 columns — a populated cell further out, behind an
    // empty one, would have been silently missed.
    const extended = [...LISTONE_HEADER_ROW, null, "Colonna Lontana"];
    const bytes = await buildXlsxBytes([
      { name: "ColonnaLontana", rows: [LISTONE_TITLE_ROW, extended, listoneRow(1, "P", "Por", "X", "Y", 1)], merges: [[1, 1, 1, 15]] },
    ]);
    const workbook = await decodeWorkbookFromBytes(bytes);
    expect(() => resolveListonePool(workbook)).toThrow(ListoneSelectionError);
  });

  it("finds the header even when moved a couple of rows down", async () => {
    const sheets = buildValidListoneWorkbookSheets(MINIMAL_VALID_ROLE_ROWS);
    const completeIdx = sheets.findIndex((s) => s.name === "CompleteSheet");
    sheets[completeIdx] = {
      name: "CompleteSheet",
      rows: [LISTONE_TITLE_ROW, [], [], LISTONE_HEADER_ROW, ...Object.values(MINIMAL_VALID_ROLE_ROWS).flat()],
      merges: [[1, 1, 1, 13]],
    };
    const resolution = await resolveFromSheets(sheets);
    expect(resolution.headerRowIndex).toBe(3);
  });

  it("is stable: the exact header column contract is unchanged from the diagnosed real raw snapshot", () => {
    expect(LISTONE_HEADER_COLUMNS).toEqual([
      "Id",
      "R",
      "RM",
      "Nome",
      "Squadra",
      "Qt.A",
      "Qt.I",
      "Diff.",
      "Qt.A M",
      "Qt.I M",
      "Diff.M",
      "FVM",
      "FVM M",
    ]);
  });
});

describe("extractListoneRecords — structural row validation", () => {
  async function selectAndExtract(dataRows: readonly (readonly (string | number | boolean | Date | null)[])[]) {
    const bytes = await buildXlsxBytes([listoneSheet("Tutti", dataRows)]);
    const workbook = await decodeWorkbookFromBytes(bytes);
    const headerRowIndex = 1;
    return extractListoneRecords({ sheet: workbook[0]!, headerRowIndex });
  }

  it("extracts every field of a well-formed row", async () => {
    const records = await selectAndExtract([listoneRow(1, "P", "Por", "Portiere Uno", "ClubUno", 10)]);
    expect(records[0]).toEqual({
      id: 1,
      role: "P",
      rm: "Por",
      name: "Portiere Uno",
      club: "ClubUno",
      qtA: 10,
      qtI: 10,
      diff: 0,
      qtAM: 10,
      qtIM: 10,
      diffM: 0,
      fvm: 30,
      fvmM: 30,
    });
  });

  it("throws ListoneRowError on an unknown role token", async () => {
    await expect(selectAndExtract([listoneRow(5, "X" as never, "?", "Ignoto", "ClubX", 1)])).rejects.toThrow(ListoneRowError);
  });

  it("throws ListoneRowError on a missing Id", async () => {
    await expect(selectAndExtract([[null, "P", "Por", "X", "Y", 10, 10, 0, 10, 10, 0, 30, 30]])).rejects.toThrow(ListoneRowError);
  });

  it("throws ListoneRowError on a duplicate Id within the sheet", async () => {
    await expect(
      selectAndExtract([listoneRow(1, "P", "Por", "A", "B", 1), listoneRow(1, "A", "Pc", "C", "D", 5)]),
    ).rejects.toThrow(ListoneRowError);
  });

  it("throws ListoneRowError on a data row with a populated trailing column beyond position 13 (Finding 9)", async () => {
    const row = [...listoneRow(1, "P", "Por", "A", "B", 1), "valore inatteso"];
    await expect(selectAndExtract([row])).rejects.toThrow(ListoneRowError);
  });

  it("throws ListoneRowError on a fully empty structural row", async () => {
    await expect(
      selectAndExtract([listoneRow(1, "P", "Por", "A", "B", 1), new Array(13).fill(null), listoneRow(2, "D", "Dc", "C", "D", 2)]),
    ).rejects.toThrow(ListoneRowError);
  });

  describe("Finding 4 — numeric constraints", () => {
    it("rejects a decimal Id", async () => {
      await expect(selectAndExtract([[1.5, "P", "Por", "X", "Y", 10, 10, 0, 10, 10, 0, 30, 30]])).rejects.toThrow(ListoneRowError);
    });
    it("rejects an Id of zero", async () => {
      await expect(selectAndExtract([[0, "P", "Por", "X", "Y", 10, 10, 0, 10, 10, 0, 30, 30]])).rejects.toThrow(ListoneRowError);
    });
    it("rejects a negative Id", async () => {
      await expect(selectAndExtract([[-3, "P", "Por", "X", "Y", 10, 10, 0, 10, 10, 0, 30, 30]])).rejects.toThrow(ListoneRowError);
    });
    it("rejects a negative Qt.A", async () => {
      await expect(selectAndExtract([[1, "P", "Por", "X", "Y", -5, 10, 0, 10, 10, 0, 30, 30]])).rejects.toThrow(ListoneRowError);
    });
    it("rejects a decimal Qt.A", async () => {
      await expect(selectAndExtract([[1, "P", "Por", "X", "Y", 10.5, 10, 0, 10, 10, 0, 30, 30]])).rejects.toThrow(ListoneRowError);
    });
    it("rejects a negative FVM", async () => {
      await expect(selectAndExtract([[1, "P", "Por", "X", "Y", 10, 10, 0, 10, 10, 0, -1, 30]])).rejects.toThrow(ListoneRowError);
    });
    it("rejects a decimal FVM", async () => {
      await expect(selectAndExtract([[1, "P", "Por", "X", "Y", 10, 10, 0, 10, 10, 0, 30.2, 30]])).rejects.toThrow(ListoneRowError);
    });
    it("accepts a negative Diff. (a genuine price decrease is valid)", async () => {
      const records = await selectAndExtract([[1, "P", "Por", "X", "Y", 8, 10, -2, 8, 10, -2, 30, 30]]);
      expect(records[0]!.diff).toBe(-2);
      expect(records[0]!.diffM).toBe(-2);
    });
    it("rejects a decimal Diff. (still must be an integer even though signed)", async () => {
      await expect(selectAndExtract([[1, "P", "Por", "X", "Y", 10, 10, -1.5, 10, 10, 0, 30, 30]])).rejects.toThrow(ListoneRowError);
    });
  });
});

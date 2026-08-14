import { describe, it, expect } from "vitest";
import {
  MANDATORY_COLUMNS,
  isRowEmpty,
  projectRow,
  readHeaderRow,
  selectEnrichmentSheet,
} from "../src/sheetReader.js";
import type { SheetGrid, SheetRow, Workbook } from "../src/types.js";

// All fixtures below are synthetic — no real player/team/source names anywhere.
const FULL_HEADER: SheetRow = [...MANDATORY_COLUMNS, "ballottaggio", "gerarchia_portiere"];

describe("selectEnrichmentSheet", () => {
  it("selects the first sheet, in file order", () => {
    const workbook: Workbook = [
      { name: "SheetA", rows: [] },
      { name: "SheetB", rows: [] },
    ];
    expect(selectEnrichmentSheet(workbook)?.name).toBe("SheetA");
  });

  it("returns null for an empty workbook", () => {
    expect(selectEnrichmentSheet([])).toBeNull();
  });
});

describe("isRowEmpty", () => {
  it("treats a row of all-null/blank cells as empty", () => {
    expect(isRowEmpty([null, "", "  ", null])).toBe(true);
  });

  it("treats a row with even one populated cell as non-empty", () => {
    expect(isRowEmpty([null, "x", null])).toBe(false);
  });
});

describe("readHeaderRow", () => {
  it("maps every mandatory column with no issues when all are present", () => {
    const map = readHeaderRow(FULL_HEADER);
    expect(map.issues).toEqual([]);
    for (const col of MANDATORY_COLUMNS) expect(map.indexByColumn.has(col)).toBe(true);
  });

  it("reports every missing mandatory column", () => {
    const header: SheetRow = ["listone_id", "nome"];
    const map = readHeaderRow(header);
    const missing = map.issues.filter((i) => i.code === "missing_mandatory_column").map((i) => i.field);
    expect(missing).toContain("ruolo");
    expect(missing).toContain("updated_at");
    expect(missing.length).toBe(MANDATORY_COLUMNS.length - 2);
  });

  it("reports a duplicated column name", () => {
    const header: SheetRow = [...MANDATORY_COLUMNS, "nome"];
    const map = readHeaderRow(header);
    expect(map.issues.some((i) => i.code === "duplicate_column_header" && i.field === "nome")).toBe(true);
  });

  it("silently ignores unknown header columns (Owner's own notes)", () => {
    const header: SheetRow = [...MANDATORY_COLUMNS, "note personali di owner"];
    const map = readHeaderRow(header);
    expect(map.issues).toEqual([]);
    expect(map.indexByColumn.has("note personali di owner")).toBe(false);
  });
});

describe("projectRow", () => {
  it("extracts only known columns, keyed by name", () => {
    const header: SheetRow = ["listone_id", "nome", "extra"];
    const map = readHeaderRow(header);
    const row: SheetRow = ["101", "Synth Testman", "ignored"];
    const projected = projectRow(row, map);
    expect(projected.get("listone_id")).toBe("101");
    expect(projected.get("nome")).toBe("Synth Testman");
    expect(projected.has("extra")).toBe(false);
  });
});

// Sanity: SheetGrid/Workbook are usable without any import from packages/engine.
describe("local structural types", () => {
  it("a plain object literal satisfies SheetGrid with zero imports", () => {
    const grid: SheetGrid = { name: "x", rows: [["a", 1, null]] };
    expect(grid.rows[0]?.[1]).toBe(1);
  });
});

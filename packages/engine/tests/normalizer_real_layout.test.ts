import { describe, it, expect } from "vitest";
import {
  normalizeRawSheet,
  NormalizeError,
  parseNormalizedVotes,
  playerCandidates,
  validateVoteRecords,
  isVoteRecordSetAcceptable,
  selectSheet,
  rawSheetFromWorkbook,
  WorkbookError,
  ITALIA_SHEET_NAME,
} from "../src/index.js";
import {
  syntheticRealLayoutRawSheet,
  rawStraySingleCellInBodySheet,
  syntheticWorkbook,
} from "../fixtures/synthetic_votes.js";

// Content-based normalization of the real-shaped Fantacalcio XLSX layout on
// synthetic data only. Editorial authority is Redazione Italia; workbook tests
// below pin `Italia` as the default sheet so training/serving cannot silently
// regress to another redazione.

describe("normalizeRawSheet — real layout (title + notice preamble, repeated headers)", () => {
  const normalized = normalizeRawSheet(syntheticRealLayoutRawSheet());

  it("drops the title + 3 copyright/notice single-cell lines as preamble (content, not position)", () => {
    expect(normalized.rows[0]?.[0]).toBe("Synthetic Team Uno");
    expect(normalized.rows[1]?.[0]).toBe("Cod.");
    const flat = normalized.rows.map((r) => String(r[0] ?? ""));
    expect(flat.some((c) => c.startsWith("Voti "))).toBe(false);
    expect(flat.some((c) => c.includes("FIXTURE") && !c.startsWith("Synthetic"))).toBe(false);
  });

  it("keeps BOTH repeated per-team headers in the body", () => {
    const headerRows = normalized.rows.filter((r) => r[0] === "Cod.");
    expect(headerRows).toHaveLength(2);
  });

  it("round-trips through the parser with correct team forward-fill across blocks", () => {
    const records = parseNormalizedVotes(normalized);
    expect(records).toHaveLength(7);
    expect(playerCandidates(records)).toHaveLength(5);
    expect(records.filter((r) => r.role === "ALL")).toHaveLength(2);
    expect(records.find((r) => r.external_id === 3001)!.team).toBe("Synthetic Team Uno");
    expect(records.find((r) => r.external_id === 3004)!.team).toBe("Synthetic Team Uno");
    expect(records.find((r) => r.external_id === 3101)!.team).toBe("Synthetic Team Due");
    expect(records.find((r) => r.external_id === 3103)!.team).toBe("Synthetic Team Due");
  });

  it("interprets '6*' as base 6 and NOT a real performance", () => {
    const records = parseNormalizedVotes(normalized);
    const asterisk = records.find((r) => r.external_id === 3002)!;
    expect(asterisk.voto_base).toBe(6);
    expect(asterisk.is_asterisk).toBe(true);
    expect(asterisk.is_real_performance).toBe(false);
  });

  it("still supports SV and blank vote cases", () => {
    const records = parseNormalizedVotes(normalized);
    const sv = records.find((r) => r.external_id === 3003)!;
    expect(sv.is_sv).toBe(true);
    expect(sv.voto_base).toBeNull();
    const blank = records.find((r) => r.external_id === 3102)!;
    expect(blank.is_blank).toBe(true);
    expect(blank.voto_base).toBeNull();
  });

  it("passes the full pipeline normalize → parse → validate as valid, gate OFF", () => {
    const records = parseNormalizedVotes(normalized);
    const manifest = validateVoteRecords(records as unknown[]);
    expect(manifest.status).toBe("valid");
    expect(isVoteRecordSetAcceptable(manifest)).toBe(true);
    expect(manifest.data_promoted_eligible).toBe(false);
    expect(records.every((r) => r.canonical_player_id === null)).toBe(true);
  });
});

describe("normalizeRawSheet — team recognition is header-anchored", () => {
  it("does NOT treat a single-cell text row as a team when it is not followed by the exact header", () => {
    expect(() => normalizeRawSheet(rawStraySingleCellInBodySheet())).toThrow(NormalizeError);
    expect(() => normalizeRawSheet(rawStraySingleCellInBodySheet())).toThrow(/not followed by the exact header/);
  });

  it("treats a single-cell text row as a team ONLY when the next row is the exact header", () => {
    const records = parseNormalizedVotes(normalizeRawSheet(syntheticRealLayoutRawSheet()));
    expect(new Set(records.map((r) => r.team))).toEqual(new Set(["Synthetic Team Uno", "Synthetic Team Due"]));
  });
});

describe("workbook bridge — Redazione Italia authority", () => {
  it("selects Italia by default and does not use Fantacalcio/Statistico as the algorithm target", () => {
    const wb = syntheticWorkbook();
    expect(ITALIA_SHEET_NAME).toBe("Italia");
    const sheet = selectSheet(wb, ITALIA_SHEET_NAME);
    expect(sheet.name).toBe("Italia");
    const raw = rawSheetFromWorkbook(wb, { season: "2024_25", matchday: 38 });
    const records = parseNormalizedVotes(normalizeRawSheet(raw));
    expect(records).toHaveLength(2);
    expect(playerCandidates(records)).toHaveLength(1);
  });

  it("throws WorkbookError when Italia is absent, never falling back to another redazione", () => {
    const wb = syntheticWorkbook().filter((s) => s.name !== "Italia");
    expect(() => selectSheet(wb, "Italia")).toThrow(WorkbookError);
    expect(() => rawSheetFromWorkbook(wb, { season: "2024_25", matchday: 38 })).toThrow(WorkbookError);
  });

  it("allows explicit alternate-sheet selection only when a caller asks for it", () => {
    const wb = syntheticWorkbook();
    const raw = rawSheetFromWorkbook(wb, { season: "2024_25", matchday: 38, sheetName: "Fantacalcio" });
    const records = parseNormalizedVotes(normalizeRawSheet(raw));
    expect(records).toHaveLength(2);
  });

  it("no synthetic fixture leaks real data", () => {
    const HEADER_TOKENS = new Set(["Cod.", "Ruolo", "Nome", "Voto", "Gf", "Gs", "Rp", "Rs", "Rf", "Au", "Amm", "Esp", "Ass"]);
    const allRows = [...syntheticWorkbook().flatMap((s) => s.rows), ...syntheticRealLayoutRawSheet().rows];
    for (const row of allRows) {
      row.forEach((cell, col) => {
        if (typeof cell !== "string") return;
        expect(cell).not.toContain("fantacalcio.it");
        if (col === 2 && !HEADER_TOKENS.has(cell)) expect(cell.startsWith("Synthetic")).toBe(true);
      });
    }
  });
});

import { describe, it, expect } from "vitest";
import { normalizeRawSheet, NormalizeError, parseNormalizedVotes, type RawSheet } from "../src/index.js";
import {
  syntheticRawSheet,
  rawStructuralPaddingSheet,
  rawMissingHeaderSheet,
  rawAmbiguousHeaderSheet,
} from "../fixtures/synthetic_votes.js";

// Pure normalizer over synthetic in-memory raw grids. NO real data, NO XLSX, NO
// dependency, NO persistence. It implements only the contract row-level step
// (safe-delete rows 2-4 + header check) and must emit a NormalizedSheet that the
// existing parser consumes unchanged.

describe("normalizeRawSheet — synthetic raw grids", () => {
  const normalized = normalizeRawSheet(syntheticRawSheet());

  it("drops the preamble (title + notice/padding lines) by content and keeps the body in order", () => {
    // raw had 9 rows; the title + 3 preamble rows precede the first team block
    // (team row immediately followed by the header) → 5 body rows: team, header,
    // 2 players, ALL. The title is preamble under the content-based rule.
    expect(normalized.rows).toHaveLength(5);
    expect(normalized.rows[0]?.[0]).toBe("Synthetic Team Theta"); // body starts at the team block
    expect(normalized.rows[1]?.[0]).toBe("Cod."); // header preserved
  });

  it("passes through season and matchday", () => {
    expect(normalized.season).toBe("2024_25");
    expect(normalized.matchday).toBe(12);
  });

  it("produces output the existing parser consumes (round-trip)", () => {
    const records = parseNormalizedVotes(normalized);
    expect(records).toHaveLength(3); // 2 players + 1 ALL
    const keeper = records.find((r) => r.external_id === 7001)!;
    expect(keeper.team).toBe("Synthetic Team Theta");
    expect(keeper.role).toBe("P");
    expect(keeper.voto_base).toBe(6.5);
    expect(keeper.Gs).toBe(1);
    expect(keeper.canonical_player_id).toBeNull(); // invariant preserved end-to-end
    const striker = records.find((r) => r.external_id === 7002)!;
    expect(striker.Gf).toBe(1);
    expect(striker.Amm).toBe(1);
    expect(records.find((r) => r.external_id === 7003)!.role).toBe("ALL");
  });

  it("does not strip blank rows outside the 2-4 window (indexed delete, not global cleanup)", () => {
    const raw: RawSheet = {
      season: "2024_25",
      matchday: 1,
      rows: [
        ["Voti X"], [], [], [], // title + 3 padding
        ["Synthetic Team"], ["Cod.", "Ruolo", "Nome", "Voto", "Gf", "Gs", "Rp", "Rs", "Rf", "Au", "Amm", "Esp", "Ass"],
        [], // a blank separator AFTER the window — must be preserved
        [1, "D", "Synthetic D", 6],
      ],
    };
    const out = normalizeRawSheet(raw);
    expect(out.rows.some((r) => r.length === 0)).toBe(true); // the later blank survived
    // and it still parses
    expect(parseNormalizedVotes(out)).toHaveLength(1);
  });
});

describe("normalizeRawSheet — refuses to invent (stop & signal)", () => {
  it("throws when a safe-delete row (2-4) carries structural content", () => {
    expect(() => normalizeRawSheet(rawStructuralPaddingSheet())).toThrow(NormalizeError);
  });

  it("throws when no contract header is present", () => {
    expect(() => normalizeRawSheet(rawMissingHeaderSheet())).toThrow(NormalizeError);
  });

  it("throws on an ambiguous near-header row", () => {
    expect(() => normalizeRawSheet(rawAmbiguousHeaderSheet())).toThrow(NormalizeError);
  });
});

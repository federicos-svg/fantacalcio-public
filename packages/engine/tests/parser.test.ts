import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  parseNormalizedVotes,
  playerCandidates,
  ParseError,
  type NormalizedSheet,
  type VoteRecordCandidate,
} from "../src/index.js";
import {
  syntheticVoteSheet,
  orphanPlayerSheet,
  unknownTokenSheet,
  italiaNoVoteTokenSheet,
  unknownDashLikeTokenSheets,
  statVoteSheet,
  nonIntegerStatSheet,
  unknownStatTokenSheet,
} from "../fixtures/synthetic_votes.js";

// Pure parser over synthetic in-memory fixtures. NO real data, NO XLSX, NO
// dependency, NO persistence. Output candidates must satisfy the documented
// vote-record shape, and the parser must keep canonical id null (not promoted).

// Mirror of schemas/fantacalcio_vote_record.schema.json (required fields),
// reused to prove parser output is contract-shaped.
const voteRecord = z
  .object({
    source_id: z.literal("fantacalcio_xlsx"),
    vote_source: z.literal("italia"),
    season: z.string().regex(/^[0-9]{4}_[0-9]{2}$/),
    matchday: z.number().int().min(1).max(38),
    external_id: z.number().int(),
    canonical_player_id: z.null(),
    team: z.string().min(1),
    role: z.enum(["P", "D", "C", "A", "ALL"]),
    name: z.string().min(1),
    voto_raw: z.union([z.number(), z.string()]),
    voto_base: z.number().nullable(),
    is_asterisk: z.boolean(),
    is_sv: z.boolean(),
    is_blank: z.boolean(),
    is_real_performance: z.boolean(),
    Gf: z.number().int().optional(),
    Gs: z.number().int().optional(),
    Rp: z.number().int().optional(),
    Rs: z.number().int().optional(),
    Rf: z.number().int().optional(),
    Au: z.number().int().optional(),
    Amm: z.number().int().optional(),
    Esp: z.number().int().optional(),
    Ass: z.number().int().optional(),
  })
  .strict();

function byCod(records: readonly VoteRecordCandidate[], cod: number): VoteRecordCandidate {
  const r = records.find((x) => x.external_id === cod);
  if (!r) throw new Error(`fixture missing Cod. ${cod}`);
  return r;
}

describe("parseNormalizedVotes — synthetic fixtures", () => {
  const records = parseNormalizedVotes(syntheticVoteSheet());

  it("emits one candidate per player/ALL row, skipping title/header/team/padding", () => {
    expect(records).toHaveLength(8);
  });

  it("every candidate matches the documented vote-record shape", () => {
    for (const r of records) expect(voteRecord.safeParse(r).success).toBe(true);
  });

  it("carries season and matchday from the sheet", () => {
    expect(records.every((r) => r.season === "2024_25" && r.matchday === 38)).toBe(true);
  });

  it("forward-fills team across the two blocks", () => {
    expect(byCod(records, 9001).team).toBe("Synthetic Team Alpha");
    expect(byCod(records, 9101).team).toBe("Synthetic Team Beta");
  });

  it("numeric vote → real performance", () => {
    const r = byCod(records, 9001);
    expect(r.voto_base).toBe(6.5);
    expect(r.is_real_performance).toBe(true);
    expect(r.is_asterisk || r.is_sv || r.is_blank).toBe(false);
  });

  it("'6*' → playable base 6, asterisk, NOT real performance (closed Owner decision)", () => {
    const r = byCod(records, 9002);
    expect(r.voto_raw).toBe("6*");
    expect(r.voto_base).toBe(6);
    expect(r.is_asterisk).toBe(true);
    expect(r.is_real_performance).toBe(false);
  });

  it("'7.5*' → asterisk base 7.5, not real performance", () => {
    const r = byCod(records, 9103);
    expect(r.voto_base).toBe(7.5);
    expect(r.is_asterisk).toBe(true);
    expect(r.is_real_performance).toBe(false);
  });

  it("'SV' → voto_base null, is_sv true, not real performance", () => {
    const r = byCod(records, 9003);
    expect(r.voto_base).toBeNull();
    expect(r.is_sv).toBe(true);
    expect(r.is_real_performance).toBe(false);
  });

  it("blank ('' and null) → voto_base null, is_blank true, not real performance", () => {
    for (const cod of [9004, 9102]) {
      const r = byCod(records, cod);
      expect(r.voto_base).toBeNull();
      expect(r.is_blank).toBe(true);
      expect(r.is_real_performance).toBe(false);
    }
  });

  it("keeps the role enum incl. ALL; playerCandidates drops ALL", () => {
    expect(byCod(records, 9005).role).toBe("ALL");
    const players = playerCandidates(records);
    expect(players).toHaveLength(7);
    expect(players.some((r) => r.role === "ALL")).toBe(false);
  });

  it("never promotes: canonical_player_id is null on every candidate", () => {
    expect(records.every((r) => r.canonical_player_id === null)).toBe(true);
  });
});

// Closed Owner decision (2026-08-12): in the authoritative `Italia` sheet the
// `Voto` token `-` means SENZA VOTO / no valid vote, with exactly the `SV`
// semantics. These tests pin the decision from both sides — what `-` must
// become, and what it must never become.
describe("parseNormalizedVotes — Redazione Italia '-' is SENZA VOTO", () => {
  const records = parseNormalizedVotes(italiaNoVoteTokenSheet());

  it("'-' → voto_base null, is_sv true, not real performance", () => {
    const r = byCod(records, 6001);
    expect(r.voto_base).toBeNull();
    expect(r.is_sv).toBe(true);
    expect(r.is_asterisk).toBe(false);
    expect(r.is_blank).toBe(false);
    expect(r.is_real_performance).toBe(false);
  });

  it("'-' is never coerced to 0 and never to 6", () => {
    for (const cod of [6001, 6002, 6005]) {
      const r = byCod(records, cod);
      expect(r.voto_base).not.toBe(0);
      expect(r.voto_base).not.toBe(6);
      expect(r.voto_base).toBeNull();
    }
  });

  it("keeps the raw token verbatim instead of rewriting it to 'SV'", () => {
    expect(byCod(records, 6001).voto_raw).toBe("-");
    expect(byCod(records, 6002).voto_raw).toBe(" - ");
  });

  it("treats a whitespace-padded '-' identically (same trim as SV/numbers)", () => {
    const r = byCod(records, 6002);
    expect(r.voto_base).toBeNull();
    expect(r.is_sv).toBe(true);
  });

  it("still parses the bonus/malus columns of a '-' row", () => {
    expect(byCod(records, 6002).Amm).toBe(1);
  });

  it("leaves SV, numeric and ALL rows in the same sheet untouched", () => {
    expect(byCod(records, 6004).is_sv).toBe(true);
    expect(byCod(records, 6004).voto_raw).toBe("SV");
    const numeric = byCod(records, 6003);
    expect(numeric.voto_base).toBe(6.5);
    expect(numeric.is_real_performance).toBe(true);
    expect(byCod(records, 6005).role).toBe("ALL");
  });

  it("emits contract-shaped records for every '-' row", () => {
    for (const r of records) expect(voteRecord.safeParse(r).success).toBe(true);
  });
});

describe("parseNormalizedVotes — refuses to invent (stop & signal)", () => {
  it("throws on an unrecognized vote token instead of coercing", () => {
    expect(() => parseNormalizedVotes(unknownTokenSheet())).toThrow(ParseError);
  });

  // The '-' decision covers exactly one literal ASCII token. Nothing that
  // merely looks dash-like inherits it.
  it("still throws on every dash-like or free-text token that is not '-'", () => {
    for (const { token, sheet } of unknownDashLikeTokenSheets()) {
      expect(() => parseNormalizedVotes(sheet), `token ${JSON.stringify(token)}`).toThrow(ParseError);
    }
  });

  it("throws on a player row before any team-label row", () => {
    expect(() => parseNormalizedVotes(orphanPlayerSheet())).toThrow(ParseError);
  });

  it("throws on an invalid season", () => {
    const bad: NormalizedSheet = { season: "2024-25", matchday: 38, rows: [] };
    expect(() => parseNormalizedVotes(bad)).toThrow(ParseError);
  });

  it("throws on an out-of-range matchday", () => {
    const bad: NormalizedSheet = { season: "2024_25", matchday: 39, rows: [] };
    expect(() => parseNormalizedVotes(bad)).toThrow(ParseError);
  });

  it("throws on an unclassifiable structural row", () => {
    const bad: NormalizedSheet = {
      season: "2024_25",
      matchday: 38,
      rows: [["Synthetic Team Z"], [1, 2, 3, 4]],
    };
    expect(() => parseNormalizedVotes(bad)).toThrow(ParseError);
  });

  it("throws on a player row with a non-integer Cod.", () => {
    const bad: NormalizedSheet = {
      season: "2024_25",
      matchday: 38,
      rows: [["Synthetic Team Z"], ["x", "D", "Synthetic D", 6]],
    };
    expect(() => parseNormalizedVotes(bad)).toThrow(ParseError);
  });
});

describe("parseNormalizedVotes — stat columns (synthetic)", () => {
  const records = parseNormalizedVotes(statVoteSheet());

  it("every candidate (with stats) matches the documented vote-record shape", () => {
    for (const r of records) expect(voteRecord.safeParse(r).success).toBe(true);
  });

  it("maps populated stat columns deterministically by position", () => {
    const striker = byCod(records, 8001);
    expect(striker.Gf).toBe(2);
    expect(striker.Amm).toBe(1);
    expect(striker.Ass).toBe(1);
    const keeper = byCod(records, 8002);
    expect(keeper.Gs).toBe(1);
    expect(keeper.Rp).toBe(1);
    expect(keeper.Gf).toBe(0);
  });

  it("keeps explicit zeros for every stat column", () => {
    const zero = byCod(records, 8003);
    for (const k of ["Gf", "Gs", "Rp", "Rs", "Rf", "Au", "Amm", "Esp", "Ass"] as const) {
      expect(zero[k]).toBe(0);
    }
  });

  it("omits blank/absent stat cells, accepts integer-as-string", () => {
    const partial = byCod(records, 8004);
    expect(partial.Gf).toBe(1);
    expect(partial.Amm).toBe(2);
    expect("Gs" in partial).toBe(false);
    expect(partial.Rp).toBeUndefined();
  });

  it("parses stats on ALL rows too; all-blank ALL has no stat fields", () => {
    const coach = byCod(records, 8005);
    expect(coach.role).toBe("ALL");
    for (const k of ["Gf", "Gs", "Rp", "Rs", "Rf", "Au", "Amm", "Esp", "Ass"] as const) {
      expect(k in coach).toBe(false);
    }
  });

  it("never sets null for a stat and keeps canonical_player_id null (no promotion)", () => {
    for (const r of records) {
      expect(r.canonical_player_id).toBeNull();
      for (const k of ["Gf", "Gs", "Rp", "Rs", "Rf", "Au", "Amm", "Esp", "Ass"] as const) {
        expect(r[k]).not.toBeNull();
      }
    }
  });

  it("throws on a non-integer (decimal) stat instead of coercing", () => {
    expect(() => parseNormalizedVotes(nonIntegerStatSheet())).toThrow(ParseError);
  });

  it("throws on a non-numeric stat token instead of coercing", () => {
    expect(() => parseNormalizedVotes(unknownStatTokenSheet())).toThrow(ParseError);
  });
});

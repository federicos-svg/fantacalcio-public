import { describe, it, expect } from "vitest";
import {
  parseNormalizedVotes,
  validateVoteRecords,
  isVoteRecordSetAcceptable,
  type VoteRecordCandidate,
} from "../src/index.js";
import { syntheticVoteSheet, statVoteSheet } from "../fixtures/synthetic_votes.js";

function base(overrides: Record<string, unknown> = {}): unknown {
  return {
    source_id: "fantacalcio_xlsx",
    vote_source: "italia",
    season: "2024_25",
    matchday: 38,
    external_id: 5001,
    canonical_player_id: null,
    team: "Synthetic Team",
    role: "C",
    name: "Synthetic Player",
    voto_raw: 6.5,
    voto_base: 6.5,
    is_asterisk: false,
    is_sv: false,
    is_blank: false,
    is_real_performance: true,
    ...overrides,
  };
}

function codes(records: readonly unknown[]): string[] {
  return validateVoteRecords(records).issues.map((x) => x.code);
}

describe("validateVoteRecords — Redazione Italia", () => {
  it("accepts parser output", () => {
    const records: VoteRecordCandidate[] = parseNormalizedVotes(syntheticVoteSheet());
    const m = validateVoteRecords(records);
    expect(m.status).toBe("valid");
    expect(m.errorCount).toBe(0);
    expect(m.warningCount).toBe(0);
    expect(isVoteRecordSetAcceptable(m)).toBe(true);
    expect(records.every((r) => r.vote_source === "italia")).toBe(true);
  });

  it("accepts stat-column parser output", () => {
    expect(validateVoteRecords(parseNormalizedVotes(statVoteSheet())).status).toBe("valid");
  });

  it("never promotes", () => {
    expect(validateVoteRecords(parseNormalizedVotes(syntheticVoteSheet())).data_promoted_eligible).toBe(false);
  });

  it("rejects former/unknown vote sources", () => {
    expect(codes([base({ vote_source: "fantacalcio" })])).toContain("invalid_vote_source");
    expect(codes([base({ vote_source: "other" })])).toContain("invalid_vote_source");
  });
});

describe("validateVoteRecords — structural invariants", () => {
  it("flags wrong source_id", () => expect(codes([base({ source_id: "other" })])).toContain("invalid_source_id"));
  it("flags invalid season and matchday", () => {
    expect(codes([base({ season: "2024-25" })])).toContain("invalid_season");
    expect(codes([base({ matchday: 39 })])).toContain("invalid_matchday");
  });
  it("flags non-integer external_id", () => expect(codes([base({ external_id: 1.5 })])).toContain("invalid_external_id"));
  it("flags canonical id promotion leak", () => expect(codes([base({ canonical_player_id: "p_1" })])).toContain("canonical_player_id_not_null"));
  it("flags empty team/name and invalid role", () => {
    expect(codes([base({ team: "" })])).toContain("empty_team");
    expect(codes([base({ name: "" })])).toContain("empty_name");
    expect(codes([base({ role: "X" })])).toContain("invalid_role");
  });
});

describe("validateVoteRecords — vote coherence", () => {
  it("accepts numeric/6*/SV/blank/ALL kinds", () => {
    const records = [
      base({ external_id: 1 }),
      base({ external_id: 2, voto_raw: "6*", voto_base: 6, is_asterisk: true, is_real_performance: false }),
      base({ external_id: 3, voto_raw: "SV", voto_base: null, is_sv: true, is_real_performance: false }),
      base({ external_id: 4, voto_raw: "", voto_base: null, is_blank: true, is_real_performance: false }),
      base({ external_id: 5, role: "ALL" }),
    ];
    expect(validateVoteRecords(records).status).toBe("valid");
  });
  it("flags incoherent flags/types", () => {
    expect(codes([base({ voto_base: "6.5" })])).toContain("voto_base_type_invalid");
    expect(codes([base({ is_real_performance: false })])).toContain("vote_flags_incoherent");
    expect(codes([base({ voto_base: null, is_sv: true, is_blank: true, is_real_performance: false })])).toContain("vote_flags_incoherent");
  });
});

describe("validateVoteRecords — optional stats/set rules", () => {
  it("requires integer stats when present", () => {
    expect(codes([base({ Gf: 1.5 })])).toContain("stat_not_integer");
    expect(codes([base({ Gs: null })])).toContain("stat_not_integer");
    expect(validateVoteRecords([base({ Gf: 0, Ass: 0 })]).status).toBe("valid");
  });
  it("warns on negative stat and duplicate external id", () => {
    expect(validateVoteRecords([base({ Amm: -1 })]).status).toBe("warning");
    const m = validateVoteRecords([base({ external_id: 7 }), base({ external_id: 7, name: "Other" })]);
    expect(m.issues.map((x) => x.code)).toContain("duplicate_external_id");
  });
  it("flags non-object and remains deterministic", () => {
    expect(codes([null])).toContain("not_an_object");
    const input = [base({ role: "X" }), base({ external_id: 9, Gf: -2 })];
    expect(validateVoteRecords(input)).toEqual(validateVoteRecords(input));
  });
  it("empty set is valid", () => expect(validateVoteRecords([]).status).toBe("valid"));
});

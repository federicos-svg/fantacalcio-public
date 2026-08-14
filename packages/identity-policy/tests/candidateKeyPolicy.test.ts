import { describe, it, expect } from "vitest";
import {
  classifyIdentityCandidate,
  IDENTITY_CANDIDATE_OUTCOMES,
  NAME_OVERLAP_HIGH_BAND,
  NAME_OVERLAP_LOW_BAND,
  type IdentityCandidateComparison,
} from "../src/candidateKeyPolicy.js";

// All fixtures below are synthetic comparison signals — no real player rows,
// names, ids, or clubs anywhere in this file (see docs/DECISIONS.md
// "Identity — FASE 3 candidate key" and the module header for why).
const base: IdentityCandidateComparison = {
  externalIdPresentA: true,
  externalIdPresentB: true,
  externalIdSame: true,
  nameTokenOverlap: 1,
  roleSame: true,
  teamSame: true,
};

describe("classifyIdentityCandidate — accept path", () => {
  it("same external_id + strong name overlap + role/team continuity -> accept_candidate, high confidence", () => {
    const result = classifyIdentityCandidate({ ...base, nameTokenOverlap: 0.95 });
    expect(result.outcome).toBe("accept_candidate");
    expect(result.confidenceBand).toBe("high");
  });

  it("nameTokenOverlap exactly at the high band boundary still accepts", () => {
    const result = classifyIdentityCandidate({ ...base, nameTokenOverlap: NAME_OVERLAP_HIGH_BAND });
    expect(result.outcome).toBe("accept_candidate");
  });
});

describe("classifyIdentityCandidate — external_id reuse", () => {
  it("same external_id + weak name similarity + same role/team -> review_external_id_reuse", () => {
    const result = classifyIdentityCandidate({ ...base, nameTokenOverlap: 0.05, roleSame: true, teamSame: true });
    expect(result.outcome).toBe("review_external_id_reuse");
    expect(result.confidenceBand).toBe("low");
  });

  it("weak name similarity dominates even when role/team also differ (still reuse, not a harder reject)", () => {
    const result = classifyIdentityCandidate({ ...base, nameTokenOverlap: 0, roleSame: false, teamSame: false });
    expect(result.outcome).toBe("review_external_id_reuse");
  });

  it("nameTokenOverlap just below the low band still routes to reuse review", () => {
    const result = classifyIdentityCandidate({ ...base, nameTokenOverlap: NAME_OVERLAP_LOW_BAND - 0.01 });
    expect(result.outcome).toBe("review_external_id_reuse");
  });
});

describe("classifyIdentityCandidate — moderate name mismatch", () => {
  it("same external_id + moderate name similarity -> review_name_mismatch", () => {
    const result = classifyIdentityCandidate({ ...base, nameTokenOverlap: 0.5 });
    expect(result.outcome).toBe("review_name_mismatch");
    expect(result.confidenceBand).toBe("medium");
  });

  it("nameTokenOverlap just below the high band is still moderate, not accepted", () => {
    const result = classifyIdentityCandidate({ ...base, nameTokenOverlap: NAME_OVERLAP_HIGH_BAND - 0.01 });
    expect(result.outcome).toBe("review_name_mismatch");
  });

  it("nameTokenOverlap exactly at the low band boundary is moderate, not reuse", () => {
    const result = classifyIdentityCandidate({ ...base, nameTokenOverlap: NAME_OVERLAP_LOW_BAND });
    expect(result.outcome).toBe("review_name_mismatch");
  });
});

describe("classifyIdentityCandidate — missing evidence", () => {
  it("missing external_id on side A -> insufficient_evidence", () => {
    const result = classifyIdentityCandidate({ ...base, externalIdPresentA: false });
    expect(result.outcome).toBe("insufficient_evidence");
    expect(result.confidenceBand).toBe("not_applicable");
  });

  it("missing external_id on side B -> insufficient_evidence", () => {
    const result = classifyIdentityCandidate({ ...base, externalIdPresentB: false });
    expect(result.outcome).toBe("insufficient_evidence");
  });

  it("missing external_id on both sides -> insufficient_evidence (never falls through to reject)", () => {
    const result = classifyIdentityCandidate({
      ...base,
      externalIdPresentA: false,
      externalIdPresentB: false,
      externalIdSame: false,
    });
    expect(result.outcome).toBe("insufficient_evidence");
  });
});

describe("classifyIdentityCandidate — different external_id", () => {
  it("different external_id -> reject_candidate regardless of name/role/team", () => {
    const result = classifyIdentityCandidate({
      ...base,
      externalIdSame: false,
      nameTokenOverlap: 1,
      roleSame: true,
      teamSame: true,
    });
    expect(result.outcome).toBe("reject_candidate");
    expect(result.confidenceBand).toBe("not_applicable");
  });
});

describe("classifyIdentityCandidate — role continuity", () => {
  it("role mismatch with otherwise strong evidence -> review_role_change, not a hard reject", () => {
    const result = classifyIdentityCandidate({ ...base, nameTokenOverlap: 0.95, roleSame: false });
    expect(result.outcome).toBe("review_role_change");
    expect(result.confidenceBand).toBe("medium");
  });
});

describe("classifyIdentityCandidate — team continuity (transfers)", () => {
  it("team mismatch alone does NOT reject — it downgrades confidence and still accepts", () => {
    const result = classifyIdentityCandidate({ ...base, nameTokenOverlap: 0.95, roleSame: true, teamSame: false });
    expect(result.outcome).toBe("accept_candidate");
    expect(result.confidenceBand).toBe("medium");
  });

  it("team continuity alongside every other strong signal reaches the highest confidence band", () => {
    const result = classifyIdentityCandidate({ ...base, nameTokenOverlap: 1, roleSame: true, teamSame: true });
    expect(result.confidenceBand).toBe("high");
  });
});

describe("classifyIdentityCandidate — invariants", () => {
  it("every possible fixture combination returns a known outcome", () => {
    const bools = [true, false];
    const overlaps = [0, NAME_OVERLAP_LOW_BAND, 0.5, NAME_OVERLAP_HIGH_BAND, 1];
    for (const externalIdPresentA of bools) {
      for (const externalIdPresentB of bools) {
        for (const externalIdSame of bools) {
          for (const roleSame of bools) {
            for (const teamSame of bools) {
              for (const nameTokenOverlap of overlaps) {
                const result = classifyIdentityCandidate({
                  externalIdPresentA,
                  externalIdPresentB,
                  externalIdSame,
                  nameTokenOverlap,
                  roleSame,
                  teamSame,
                });
                expect(IDENTITY_CANDIDATE_OUTCOMES).toContain(result.outcome);
              }
            }
          }
        }
      }
    }
  });

  it("is fully deterministic across repeated calls on the same input", () => {
    const input: IdentityCandidateComparison = { ...base, nameTokenOverlap: 0.42, teamSame: false };
    const a = classifyIdentityCandidate(input);
    const b = classifyIdentityCandidate(input);
    expect(a).toEqual(b);
  });

  it("no result ever carries a canonical_player_id/canonical_team_id field, on any fixture", () => {
    const samples: IdentityCandidateComparison[] = [
      { ...base },
      { ...base, nameTokenOverlap: 0.5 },
      { ...base, nameTokenOverlap: 0 },
      { ...base, externalIdSame: false },
      { ...base, externalIdPresentA: false },
      { ...base, roleSame: false },
      { ...base, teamSame: false },
    ];
    for (const s of samples) {
      const result = classifyIdentityCandidate(s);
      const keys = Object.keys(result);
      expect(keys).not.toContain("canonical_player_id");
      expect(keys).not.toContain("canonical_team_id");
      expect(keys).not.toContain("canonicalPlayerId");
      expect(keys).not.toContain("canonicalTeamId");
      expect(keys.sort()).toEqual(["confidenceBand", "outcome", "reasonCode"]);
    }
  });

  it("IDENTITY_CANDIDATE_OUTCOMES lists exactly the six documented outcomes", () => {
    expect([...IDENTITY_CANDIDATE_OUTCOMES].sort()).toEqual(
      [
        "accept_candidate",
        "insufficient_evidence",
        "reject_candidate",
        "review_external_id_reuse",
        "review_name_mismatch",
        "review_role_change",
      ].sort(),
    );
  });
});

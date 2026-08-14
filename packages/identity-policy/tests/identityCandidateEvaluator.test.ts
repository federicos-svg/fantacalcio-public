import { describe, it, expect } from "vitest";
import {
  evaluateIdentityCandidate,
  type MinimalIdentityRow,
} from "../src/identityCandidateEvaluator.js";

// All rows below are synthetic fixtures invented for this test only — never
// real players, ids, or clubs (see docs/NO_GO.md).
const rowA: MinimalIdentityRow = {
  externalId: "ext-001",
  name: "Synth Testman",
  role: "P",
  team: "Synth FC Alpha",
};

describe("evaluateIdentityCandidate — accept path", () => {
  it("exact same synthetic player -> accept_candidate, high confidence", () => {
    const result = evaluateIdentityCandidate(rowA, { ...rowA });
    expect(result.policy.outcome).toBe("accept_candidate");
    expect(result.policy.confidenceBand).toBe("high");
    expect(result.externalIdSame).toBe(true);
    expect(result.roleSame).toBe(true);
    expect(result.teamSame).toBe(true);
  });

  it("same externalId + punctuation/accent name variant -> accept_candidate", () => {
    const b: MinimalIdentityRow = { ...rowA, name: "Sýnth  Tèstmàn" };
    const result = evaluateIdentityCandidate(rowA, b);
    expect(result.nameComparison.exactNormalizedMatch).toBe(true);
    expect(result.policy.outcome).toBe("accept_candidate");
  });
});

describe("evaluateIdentityCandidate — moderate name variation", () => {
  it("same externalId + middle/double-token variation -> falls in the existing review_name_mismatch band", () => {
    const b: MinimalIdentityRow = { ...rowA, name: "Synth Omega Testman" };
    const result = evaluateIdentityCandidate(rowA, b);
    expect(result.nameComparison.tokenOverlap).toBeCloseTo(2 / 3, 10);
    // 2/3 falls between NAME_OVERLAP_LOW_BAND and NAME_OVERLAP_HIGH_BAND
    // (see candidateKeyPolicy.ts) -> review, not a hard accept or reject.
    expect(result.policy.outcome).toBe("review_name_mismatch");
  });
});

describe("evaluateIdentityCandidate — external_id reuse", () => {
  it("same externalId + weak/no token overlap -> review_external_id_reuse", () => {
    const b: MinimalIdentityRow = { ...rowA, name: "Zeta Otherman" };
    const result = evaluateIdentityCandidate(rowA, b);
    expect(result.nameComparison.tokenOverlap).toBe(0);
    expect(result.policy.outcome).toBe("review_external_id_reuse");
  });
});

describe("evaluateIdentityCandidate — different external_id", () => {
  it("different externalId -> reject_candidate regardless of name", () => {
    const b: MinimalIdentityRow = { ...rowA, externalId: "ext-002" };
    const result = evaluateIdentityCandidate(rowA, b);
    expect(result.externalIdSame).toBe(false);
    expect(result.policy.outcome).toBe("reject_candidate");
  });
});

describe("evaluateIdentityCandidate — missing evidence", () => {
  it("missing externalId on one side -> insufficient_evidence", () => {
    const b: MinimalIdentityRow = { ...rowA, externalId: null };
    const result = evaluateIdentityCandidate(rowA, b);
    expect(result.externalIdPresentA).toBe(true);
    expect(result.externalIdPresentB).toBe(false);
    expect(result.policy.outcome).toBe("insufficient_evidence");
  });

  it("missing externalId on the other side (undefined, not null) -> insufficient_evidence", () => {
    const a: MinimalIdentityRow = { name: "Synth Testman" };
    const result = evaluateIdentityCandidate(a, rowA);
    expect(result.externalIdPresentA).toBe(false);
    expect(result.policy.outcome).toBe("insufficient_evidence");
  });
});

describe("evaluateIdentityCandidate — role continuity", () => {
  it("same externalId + role mismatch -> review_role_change", () => {
    const b: MinimalIdentityRow = { ...rowA, role: "D" };
    const result = evaluateIdentityCandidate(rowA, b);
    expect(result.roleSame).toBe(false);
    expect(result.policy.outcome).toBe("review_role_change");
  });
});

describe("evaluateIdentityCandidate — team continuity (transfers)", () => {
  it("same externalId + team mismatch only -> accept_candidate, medium confidence", () => {
    const b: MinimalIdentityRow = { ...rowA, team: "Synth FC Beta" };
    const result = evaluateIdentityCandidate(rowA, b);
    expect(result.teamSame).toBe(false);
    expect(result.policy.outcome).toBe("accept_candidate");
    expect(result.policy.confidenceBand).toBe("medium");
  });
});

describe("evaluateIdentityCandidate — blank name input", () => {
  it("blank name on one side is handled safely, never throws", () => {
    const b: MinimalIdentityRow = { ...rowA, name: "   " };
    expect(() => evaluateIdentityCandidate(rowA, b)).not.toThrow();
    const result = evaluateIdentityCandidate(rowA, b);
    expect(result.nameComparison.emptyB).toBe(true);
    expect(result.nameComparison.insufficientTokens).toBe(true);
    expect(result.nameComparison.tokenOverlap).toBe(0);
  });

  it("blank name on both sides is handled safely, never throws", () => {
    const a: MinimalIdentityRow = { ...rowA, name: "" };
    const b: MinimalIdentityRow = { ...rowA, name: "" };
    expect(() => evaluateIdentityCandidate(a, b)).not.toThrow();
  });
});

describe("evaluateIdentityCandidate — non-canonical guarantee", () => {
  it("isCanonical is always the literal false", () => {
    const result = evaluateIdentityCandidate(rowA, { ...rowA });
    expect(result.isCanonical).toBe(false);
  });

  it("no output field is or resembles canonical_player_id/canonical_team_id, on every fixture above", () => {
    const samples: [MinimalIdentityRow, MinimalIdentityRow][] = [
      [rowA, { ...rowA }],
      [rowA, { ...rowA, name: "Synth Omega Testman" }],
      [rowA, { ...rowA, name: "Zeta Otherman" }],
      [rowA, { ...rowA, externalId: "ext-002" }],
      [rowA, { ...rowA, externalId: null }],
      [rowA, { ...rowA, role: "D" }],
      [rowA, { ...rowA, team: "Synth FC Beta" }],
      [rowA, { ...rowA, name: "   " }],
    ];
    const forbidden = ["canonical_player_id", "canonical_team_id", "canonicalPlayerId", "canonicalTeamId"];
    for (const [a, b] of samples) {
      const result = evaluateIdentityCandidate(a, b);
      const json = JSON.stringify(result);
      for (const term of forbidden) {
        expect(json).not.toContain(term);
      }
    }
  });
});

describe("evaluateIdentityCandidate — determinism", () => {
  it("same input always produces the same output", () => {
    const b: MinimalIdentityRow = { ...rowA, team: "Synth FC Beta" };
    const first = evaluateIdentityCandidate(rowA, b);
    const second = evaluateIdentityCandidate(rowA, b);
    expect(first).toEqual(second);
  });
});

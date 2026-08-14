import { describe, it, expect } from "vitest";
import {
  normalizePlayerName,
  tokenizeNormalizedName,
  computeTokenOverlap,
  compareNames,
} from "../src/nameSimilarity.js";
import { classifyIdentityCandidate } from "../src/candidateKeyPolicy.js";

// All names below are synthetic fixtures invented for this test only — not
// real players, not drawn from any real dataset (see docs/NO_GO.md).

describe("normalizePlayerName", () => {
  it("strips accents/diacritics", () => {
    expect(normalizePlayerName("Ünïcòdé Plàyér")).toBe("unicode player");
  });

  it("lowercases and collapses whitespace", () => {
    expect(normalizePlayerName("  Synth   Testman  ")).toBe("synth testman");
  });

  it("handles a punctuation variant (apostrophe/hyphen) as a separator", () => {
    expect(normalizePlayerName("D'Alpha-Beta")).toBe("d alpha beta");
  });

  it("normalizes an empty/whitespace-only string to the empty string", () => {
    expect(normalizePlayerName("   ")).toBe("");
    expect(normalizePlayerName("")).toBe("");
  });
});

describe("tokenizeNormalizedName", () => {
  it("splits on the single collapsed space", () => {
    expect(tokenizeNormalizedName("synth testman")).toEqual(["synth", "testman"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(tokenizeNormalizedName("")).toEqual([]);
  });
});

describe("computeTokenOverlap", () => {
  it("exact same token set returns 1", () => {
    expect(computeTokenOverlap(["synth", "testman"], ["synth", "testman"])).toBe(1);
  });

  it("no shared tokens returns 0", () => {
    expect(computeTokenOverlap(["alpha", "beta"], ["gamma", "delta"])).toBe(0);
  });

  it("partial overlap returns the expected Jaccard score", () => {
    // intersection={synth}, union={synth,testman,omega} -> 1/3
    expect(computeTokenOverlap(["synth", "testman"], ["synth", "omega"])).toBeCloseTo(1 / 3, 10);
  });

  it("either side empty returns 0, never divides by zero", () => {
    expect(computeTokenOverlap([], ["synth"])).toBe(0);
    expect(computeTokenOverlap(["synth"], [])).toBe(0);
    expect(computeTokenOverlap([], [])).toBe(0);
  });

  it("is order-independent", () => {
    const a = computeTokenOverlap(["synth", "testman", "omega"], ["testman", "zeta"]);
    const b = computeTokenOverlap(["zeta", "testman"], ["omega", "testman", "synth"]);
    expect(a).toBe(b);
  });
});

describe("compareNames", () => {
  it("exact normalized match: tokenOverlap=1, exactNormalizedMatch=true", () => {
    const result = compareNames("Synth Testman", "synth   testman");
    expect(result.tokenOverlap).toBe(1);
    expect(result.exactNormalizedMatch).toBe(true);
    expect(result.insufficientTokens).toBe(false);
  });

  it("accent + casing + punctuation variant still resolves to an exact match", () => {
    const result = compareNames("Ünïcòdé D'Testér", "unicode d tester");
    expect(result.exactNormalizedMatch).toBe(true);
  });

  it("double-surname / added middle token: partial overlap, not exact or zero", () => {
    // "Synth Testman" vs "Synth Omega Testman" (an inserted middle token)
    const result = compareNames("Synth Testman", "Synth Omega Testman");
    expect(result.exactNormalizedMatch).toBe(false);
    expect(result.tokenOverlap).toBeCloseTo(2 / 3, 10);
    expect(result.tokenOverlap).toBeGreaterThan(0);
    expect(result.tokenOverlap).toBeLessThan(1);
  });

  it("no token overlap at all", () => {
    const result = compareNames("Alpha Beta", "Gamma Delta");
    expect(result.tokenOverlap).toBe(0);
    expect(result.exactNormalizedMatch).toBe(false);
  });

  it("empty/blank input on one side is handled safely, never throws", () => {
    const result = compareNames("", "  ");
    expect(result.emptyA).toBe(true);
    expect(result.emptyB).toBe(true);
    expect(result.insufficientTokens).toBe(true);
    expect(result.tokenOverlap).toBe(0);
    expect(result.exactNormalizedMatch).toBe(false); // both empty is never treated as a match
  });

  it("empty input on only one side sets insufficientTokens without throwing", () => {
    const result = compareNames("Synth Testman", "");
    expect(result.emptyA).toBe(false);
    expect(result.emptyB).toBe(true);
    expect(result.insufficientTokens).toBe(true);
    expect(result.tokenOverlap).toBe(0);
  });

  it("is fully deterministic across repeated calls", () => {
    const a = compareNames("Synth Omega Testman", "Synth Testman");
    const b = compareNames("Synth Omega Testman", "Synth Testman");
    expect(a).toEqual(b);
  });

  it("no output field is or resembles canonical_player_id/canonical_team_id", () => {
    const result = compareNames("Synth Testman", "Synth Omega Testman");
    const keys = Object.keys(result);
    expect(keys).not.toContain("canonical_player_id");
    expect(keys).not.toContain("canonical_team_id");
    expect(keys).not.toContain("canonicalPlayerId");
    expect(keys).not.toContain("canonicalTeamId");
  });
});

describe("integration: compareNames feeding classifyIdentityCandidate", () => {
  it("strong name continuity + same external_id/role/team -> accept_candidate, high confidence", () => {
    const names = compareNames("Synth Testman", "synth   testman");
    const result = classifyIdentityCandidate({
      externalIdPresentA: true,
      externalIdPresentB: true,
      externalIdSame: true,
      nameTokenOverlap: names.tokenOverlap,
      roleSame: true,
      teamSame: true,
    });
    expect(result.outcome).toBe("accept_candidate");
    expect(result.confidenceBand).toBe("high");
  });

  it("weak name overlap + same external_id -> review_external_id_reuse, even with role/team continuity", () => {
    const names = compareNames("Alpha Beta", "Gamma Delta");
    const result = classifyIdentityCandidate({
      externalIdPresentA: true,
      externalIdPresentB: true,
      externalIdSame: true,
      nameTokenOverlap: names.tokenOverlap,
      roleSame: true,
      teamSame: true,
    });
    expect(result.outcome).toBe("review_external_id_reuse");
  });

  it("moderate overlap from a double-surname/middle-token case -> review_name_mismatch", () => {
    const names = compareNames("Synth Testman", "Synth Omega Testman");
    const result = classifyIdentityCandidate({
      externalIdPresentA: true,
      externalIdPresentB: true,
      externalIdSame: true,
      nameTokenOverlap: names.tokenOverlap,
      roleSame: true,
      teamSame: true,
    });
    // 2/3 overlap falls in the moderate band (>= LOW, < HIGH per candidateKeyPolicy.ts).
    expect(result.outcome).toBe("review_name_mismatch");
  });
});

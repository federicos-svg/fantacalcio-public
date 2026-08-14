import { describe, expect, it } from "vitest";
import { classifyIdentityMatch } from "../src/identityMatchPolicy.js";
import {
  syntheticDobConflictCandidate,
  syntheticExactMatchByDobCandidate,
  syntheticExactMatchByExternalIdCandidate,
  syntheticExternalIdConflictCandidate,
  syntheticMultipleCompatibleCandidates,
  syntheticNameMismatchNoSignalCandidate,
  syntheticNameMismatchWithDobCandidate,
  syntheticNameMismatchWithExternalIdCandidate,
  syntheticNameOnlyCandidate,
  syntheticNotFootballerCandidate,
  syntheticRejectedByDobMismatchCandidate,
  syntheticRejectedByExternalIdMismatchCandidate,
  syntheticTeamContradictionCandidate,
} from "../fixtures/syntheticEntities.js";

describe("classifyIdentityMatch — per-candidate evaluation, not a global conflict (round 3 finding 1)", () => {
  it("an exact-eligible candidate plus a DOB-discordant candidate resolves to EXACT_MATCH on the correct candidate", () => {
    const result = classifyIdentityMatch([
      syntheticExactMatchByDobCandidate,
      syntheticRejectedByDobMismatchCandidate,
    ]);
    expect(result).toEqual({
      status: "EXACT_MATCH",
      wikidataEntityId: syntheticExactMatchByDobCandidate.wikidataEntityId,
      evidence: syntheticExactMatchByDobCandidate,
    });
  });

  it("an exact-eligible candidate plus a non-footballer candidate resolves to EXACT_MATCH", () => {
    const result = classifyIdentityMatch([
      syntheticExactMatchByDobCandidate,
      syntheticNotFootballerCandidate,
    ]);
    expect(result.status).toBe("EXACT_MATCH");
  });

  it("DOB false with no other strong signal is discarded (REJECTED_MISMATCH), not a global CONFLICT", () => {
    const result = classifyIdentityMatch([syntheticRejectedByDobMismatchCandidate]);
    expect(result.status).toBe("NOT_FOUND");
  });

  it("external ID false with no other strong signal is discarded, not a global CONFLICT", () => {
    const result = classifyIdentityMatch([syntheticRejectedByExternalIdMismatchCandidate]);
    expect(result.status).toBe("NOT_FOUND");
  });

  it("DOB true + external ID false on the SAME candidate is CONFLICTING_EVIDENCE -> CONFLICT", () => {
    const result = classifyIdentityMatch([syntheticExternalIdConflictCandidate]);
    expect(result).toEqual({
      status: "CONFLICT",
      candidateEntityIds: [syntheticExternalIdConflictCandidate.wikidataEntityId],
      reasons: [syntheticExternalIdConflictCandidate],
    });
  });

  it("DOB false + external ID true on the SAME candidate is CONFLICTING_EVIDENCE -> CONFLICT", () => {
    const result = classifyIdentityMatch([syntheticDobConflictCandidate]);
    expect(result).toEqual({
      status: "CONFLICT",
      candidateEntityIds: [syntheticDobConflictCandidate.wikidataEntityId],
      reasons: [syntheticDobConflictCandidate],
    });
  });

  it("a single exact match returns its provider-scoped wikidataEntityId", () => {
    const result = classifyIdentityMatch([syntheticExactMatchByDobCandidate]);
    expect(result.status).toBe("EXACT_MATCH");
    expect(result).toMatchObject({ wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_001" });
  });

  it("unknown date of birth but a positive external ID match still yields EXACT_MATCH", () => {
    const result = classifyIdentityMatch([syntheticExactMatchByExternalIdCandidate]);
    expect(result.status).toBe("EXACT_MATCH");
  });

  it("more than one exact-eligible candidate is AMBIGUOUS, with all candidate IDs, never auto-resolved to one", () => {
    const result = classifyIdentityMatch(syntheticMultipleCompatibleCandidates);
    expect(result).toEqual({
      status: "AMBIGUOUS",
      candidateEntityIds: syntheticMultipleCompatibleCandidates.map((c) => c.wikidataEntityId),
    });
  });

  it("a single review-eligible candidate is PROBABLE_MATCH_REQUIRES_REVIEW with its ID", () => {
    const result = classifyIdentityMatch([syntheticNameOnlyCandidate]);
    expect(result).toEqual({
      status: "PROBABLE_MATCH_REQUIRES_REVIEW",
      candidateEntityIds: [syntheticNameOnlyCandidate.wikidataEntityId],
    });
  });

  it("more than one review-eligible candidate is AMBIGUOUS with all IDs", () => {
    const result = classifyIdentityMatch([
      syntheticNameOnlyCandidate,
      syntheticTeamContradictionCandidate,
    ]);
    expect(result).toEqual({
      status: "AMBIGUOUS",
      candidateEntityIds: [
        syntheticNameOnlyCandidate.wikidataEntityId,
        syntheticTeamContradictionCandidate.wikidataEntityId,
      ],
    });
  });

  it("only discarded candidates (mismatch/non-footballer) is NOT_FOUND", () => {
    const result = classifyIdentityMatch([
      syntheticRejectedByDobMismatchCandidate,
      syntheticNotFootballerCandidate,
    ]);
    expect(result).toEqual({ status: "NOT_FOUND", candidateEntityIds: [] });
  });

  it("zero candidates is NOT_FOUND", () => {
    expect(classifyIdentityMatch([])).toEqual({ status: "NOT_FOUND", candidateEntityIds: [] });
  });

  it("never produces a canonical_player_id/canonical_team_id — only the provider-scoped wikidataEntityId reappears in the result", () => {
    const result = classifyIdentityMatch([syntheticExactMatchByDobCandidate]);
    expect(result.status).toBe("EXACT_MATCH");
    expect(Object.keys(result)).not.toContain("canonicalPlayerId");
    expect(Object.keys(result)).not.toContain("canonicalTeamId");
    if (result.status === "EXACT_MATCH") {
      expect(result.wikidataEntityId).toBe(syntheticExactMatchByDobCandidate.wikidataEntityId);
    }
  });

  it("is a pure function — same candidates always produce the same result", () => {
    const results = Array.from({ length: 5 }, () =>
      JSON.stringify(classifyIdentityMatch([syntheticExactMatchByDobCandidate])),
    );
    expect(new Set(results).size).toBe(1);
  });
});

describe("classifyIdentityMatch — name mismatch without strong evidence is not plausible (round 4 finding 1)", () => {
  it("no name match, no strong signal at all -> NOT_FOUND after aggregation, never enters review", () => {
    const result = classifyIdentityMatch([syntheticNameMismatchNoSignalCandidate]);
    expect(result).toEqual({ status: "NOT_FOUND", candidateEntityIds: [] });
  });

  it("no name match but a positive DOB signal -> PROBABLE_MATCH_REQUIRES_REVIEW, never EXACT", () => {
    const result = classifyIdentityMatch([syntheticNameMismatchWithDobCandidate]);
    expect(result).toEqual({
      status: "PROBABLE_MATCH_REQUIRES_REVIEW",
      candidateEntityIds: [syntheticNameMismatchWithDobCandidate.wikidataEntityId],
    });
  });

  it("no name match but a positive external ID signal -> PROBABLE_MATCH_REQUIRES_REVIEW, never EXACT", () => {
    const result = classifyIdentityMatch([syntheticNameMismatchWithExternalIdCandidate]);
    expect(result).toEqual({
      status: "PROBABLE_MATCH_REQUIRES_REVIEW",
      candidateEntityIds: [syntheticNameMismatchWithExternalIdCandidate.wikidataEntityId],
    });
  });

  it("a no-name-match, no-strong-signal candidate never blocks or dilutes an independent exact match", () => {
    const result = classifyIdentityMatch([
      syntheticExactMatchByDobCandidate,
      syntheticNameMismatchNoSignalCandidate,
    ]);
    expect(result.status).toBe("EXACT_MATCH");
    expect(result).toMatchObject({ wikidataEntityId: syntheticExactMatchByDobCandidate.wikidataEntityId });
  });

  it("a rejected no-name-match candidate does not artificially inflate AMBIGUOUS alongside a review-eligible candidate", () => {
    const result = classifyIdentityMatch([
      syntheticNameOnlyCandidate,
      syntheticNameMismatchNoSignalCandidate,
    ]);
    expect(result).toEqual({
      status: "PROBABLE_MATCH_REQUIRES_REVIEW",
      candidateEntityIds: [syntheticNameOnlyCandidate.wikidataEntityId],
    });
  });

  it("a name match alone, with no strong signal, remains REVIEW (regression guard)", () => {
    expect(classifyIdentityMatch([syntheticNameOnlyCandidate]).status).toBe(
      "PROBABLE_MATCH_REQUIRES_REVIEW",
    );
  });
});

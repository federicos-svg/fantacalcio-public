import type {
  IdentityCandidateClassification,
  IdentityCandidateSignals,
  IdentityMatchResult,
  WikidataEntityId,
} from "./types.js";

function hasSoftContradiction(candidate: IdentityCandidateSignals): boolean {
  return (
    candidate.nationalityAgreement === false ||
    candidate.teamAgreement === false ||
    candidate.roleAgreement === false
  );
}

function hasStrongPositiveSignal(candidate: IdentityCandidateSignals): boolean {
  return candidate.dateOfBirthAgreement === true || candidate.externalIdAgreement === true;
}

function hasStrongNegativeSignal(candidate: IdentityCandidateSignals): boolean {
  return candidate.dateOfBirthAgreement === false || candidate.externalIdAgreement === false;
}

// Per-candidate classification (round 3 finding 1, round 4 finding 1):
// evaluates ONE candidate in isolation. A hard DOB/external-ID mismatch on
// candidate Z is evidence about Z, never a veto over an unrelated exact
// match on candidate Y in the same result set — the previous design
// classified the whole search result list as CONFLICT the moment ANY
// candidate had a negative signal.
function classifyCandidate(candidate: IdentityCandidateSignals): IdentityCandidateClassification {
  if (!candidate.isClassifiedAsFootballer) {
    return "NOT_FOOTBALLER";
  }

  const strongPositive = hasStrongPositiveSignal(candidate);
  const strongNegative = hasStrongNegativeSignal(candidate);

  // The SAME candidate has both a strong positive and a strong negative
  // signal (e.g. dateOfBirthAgreement: true, externalIdAgreement: false) —
  // internally contradictory evidence about one entity, never auto-resolved.
  if (strongPositive && strongNegative) {
    return "CONFLICTING_EVIDENCE";
  }

  // Exactly one strong signal is negative, with nothing positive backing
  // this candidate — most likely a different entity, safely discarded
  // without raising it as a conflict for the whole result set.
  if (strongNegative) {
    return "REJECTED_MISMATCH";
  }

  // The normalized name disagrees (round 4 finding 1): a search result with
  // neither a name match nor any strong positive signal is not a plausible
  // candidate at all — it must not enter manual review. It IS still
  // plausible when a strong positive signal (DOB or external ID agreement)
  // backs it despite the name mismatch — e.g. a nickname, transliteration,
  // or a stale/renamed Wikidata label — but never EXACT_ELIGIBLE: the name
  // still needs human verification.
  if (!candidate.normalizedNameMatch) {
    return strongPositive ? "REVIEW_ELIGIBLE" : "REJECTED_MISMATCH";
  }

  if (strongPositive && !hasSoftContradiction(candidate)) {
    return "EXACT_ELIGIBLE";
  }

  return "REVIEW_ELIGIBLE";
}

function entityIdsOf(candidates: readonly IdentityCandidateSignals[]): readonly WikidataEntityId[] {
  return candidates.map((candidate) => candidate.wikidataEntityId);
}

// Deterministic, fail-closed, per-candidate resolver (round 3 finding 1).
// Evaluates every candidate independently first, then aggregates:
//   - exactly one EXACT_ELIGIBLE candidate  -> EXACT_MATCH (that candidate)
//   - more than one EXACT_ELIGIBLE candidate -> AMBIGUOUS (never auto-picks one)
//   - otherwise, any CONFLICTING_EVIDENCE candidate -> CONFLICT (only those
//     candidates are cited as reasons — a rejected or not-footballer
//     candidate elsewhere never contributes to this)
//   - otherwise, exactly one REVIEW_ELIGIBLE candidate -> PROBABLE_MATCH_REQUIRES_REVIEW
//   - otherwise, more than one REVIEW_ELIGIBLE candidate -> AMBIGUOUS
//   - otherwise (only REJECTED_MISMATCH/NOT_FOOTBALLER, or no candidates) -> NOT_FOUND
//
// wikidataEntityId in the result is always provider-scoped — this function
// never creates or promotes a canonical_player_id/canonical_team_id.
export function classifyIdentityMatch(
  candidates: readonly IdentityCandidateSignals[],
): IdentityMatchResult {
  if (candidates.length === 0) {
    return { status: "NOT_FOUND", candidateEntityIds: [] };
  }

  const classified = candidates.map((candidate) => ({
    candidate,
    classification: classifyCandidate(candidate),
  }));

  const exact = classified.filter((entry) => entry.classification === "EXACT_ELIGIBLE");
  if (exact.length === 1) {
    const only = exact[0]!.candidate;
    return { status: "EXACT_MATCH", wikidataEntityId: only.wikidataEntityId, evidence: only };
  }
  if (exact.length > 1) {
    return { status: "AMBIGUOUS", candidateEntityIds: entityIdsOf(exact.map((e) => e.candidate)) };
  }

  const conflicting = classified.filter((entry) => entry.classification === "CONFLICTING_EVIDENCE");
  if (conflicting.length > 0) {
    const reasons = conflicting.map((entry) => entry.candidate);
    return { status: "CONFLICT", candidateEntityIds: entityIdsOf(reasons), reasons };
  }

  const review = classified.filter((entry) => entry.classification === "REVIEW_ELIGIBLE");
  if (review.length === 1) {
    return {
      status: "PROBABLE_MATCH_REQUIRES_REVIEW",
      candidateEntityIds: entityIdsOf(review.map((e) => e.candidate)),
    };
  }
  if (review.length > 1) {
    return { status: "AMBIGUOUS", candidateEntityIds: entityIdsOf(review.map((e) => e.candidate)) };
  }

  return { status: "NOT_FOUND", candidateEntityIds: [] };
}

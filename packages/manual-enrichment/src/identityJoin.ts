// Manual Enrichment v1 — ID-first join + identity cross-check.
//
// The caller supplies both the validated enrichment records and the listone
// candidates in neutral form (see types.ts's ListoneCandidate) — this module
// never imports `ListonePlayer` from `src/ui/listone.ts` and never reads
// `public/data/listone_2025_26.json` directly, keeping this package free of
// any dependency on `src/` (the live UI), same posture as every other
// package/ in this repo.

import type { ListoneCandidate } from "./types.js";
import type { EnrichmentRecord, ValidationStatus } from "./types.js";
import {
  evaluateIdentityCandidate,
  type MinimalIdentityRow,
} from "../../identity-policy/src/identityCandidateEvaluator.js";
import type { ConfidenceBand, IdentityCandidateOutcome } from "../../identity-policy/src/candidateKeyPolicy.js";

export interface JoinResult {
  readonly matchCount: number;
  readonly status: ValidationStatus;
  readonly identityOutcome?: IdentityCandidateOutcome;
  readonly identityConfidenceBand?: ConfidenceBand;
  readonly identityReasonCode?: string;
}

/**
 * Maps one `identity-policy` outcome to this contract's shared validation
 * status. Never carries `valid` when the identity signal is anything less
 * than the strongest possible match — `accept_candidate` at `medium`
 * confidence (e.g. a transfer: team differs, everything else matches) is a
 * `warning`, not a silent `valid`.
 */
export function mapIdentityOutcomeToStatus(
  outcome: IdentityCandidateOutcome,
  confidenceBand: ConfidenceBand,
): ValidationStatus {
  switch (outcome) {
    case "accept_candidate":
      return confidenceBand === "high" ? "valid" : "warning";
    case "review_name_mismatch":
    case "review_external_id_reuse":
    case "review_role_change":
    case "insufficient_evidence":
      return "requires_manual_review";
    case "reject_candidate":
      return "rejected";
  }
}

/**
 * Joins one enrichment record against the caller-supplied listone candidates
 * by `listoneId`, then (only when exactly one candidate is found) runs the
 * identity-policy cross-check on name/role/team continuity. Zero candidates
 * and more-than-one candidates are both routed to a human, never resolved
 * automatically — never a name-based fallback search when the ID misses (an
 * ID miss is itself the signal a human should look at, not a cue to guess by
 * name instead).
 */
export function joinAndEvaluate(
  record: EnrichmentRecord,
  candidatesById: ReadonlyMap<string, readonly ListoneCandidate[]>,
): JoinResult {
  const candidates = candidatesById.get(record.listoneId) ?? [];

  if (candidates.length === 0) {
    return { matchCount: 0, status: "requires_manual_review" };
  }
  if (candidates.length > 1) {
    return { matchCount: candidates.length, status: "ambiguous" };
  }

  const candidate = candidates[0]!;
  // Same listoneId is used as `externalId` on both sides by construction —
  // the ID-based lookup above already established the candidate pairing;
  // identity-policy's job here is the cross-check (name/role/team
  // continuity given that same ID), e.g. catching a stale/mistyped
  // listone_id whose name doesn't match, or provider id reuse.
  const enrichmentRow: MinimalIdentityRow = {
    externalId: record.listoneId,
    name: record.nome,
    role: record.ruolo,
    team: record.squadraAttuale,
  };
  const listoneRow: MinimalIdentityRow = {
    externalId: candidate.listoneId,
    name: candidate.name,
    role: candidate.role,
    team: candidate.team,
  };

  const evaluation = evaluateIdentityCandidate(enrichmentRow, listoneRow);
  return {
    matchCount: 1,
    status: mapIdentityOutcomeToStatus(evaluation.policy.outcome, evaluation.policy.confidenceBand),
    identityOutcome: evaluation.policy.outcome,
    identityConfidenceBand: evaluation.policy.confidenceBand,
    identityReasonCode: evaluation.policy.reasonCode,
  };
}

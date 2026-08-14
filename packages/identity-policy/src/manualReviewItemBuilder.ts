// FASE 3 Manual Review Item Builder v1 — PURE, deterministic, fixture-only.
//
// Turns a non-accept evaluateIdentityCandidate() outcome
// (identityCandidateEvaluator.ts, PR #95) into a review-item-shaped
// payload aligned with schemas/fantacalcio_manual_review_item.schema.json
// (Batch 0E, design-only). This is STILL NOT a real review queue:
//   - no storage, no persistence, no UI — this function only returns a
//     plain object;
//   - `canonical_player_id`/`canonical_team_id` are never assigned, read,
//     or referenced anywhere in this module, by construction;
//   - the review is never resolved here: `status` is always the literal
//     `"open"`, `resolution` is always the literal `null`;
//   - inputs are synthetic-only context (season labels, a source label,
//     optional synthetic row refs, a caller-supplied timestamp) — never a
//     real player row, name, or id. `Date.now()`/`crypto.randomUUID()` are
//     deliberately not used here so the function stays pure/deterministic.
//
// Reason-code mapping note (FASE 3 Schema Contract Alignment v1): the first
// version of this builder mapped `review_external_id_reuse`/
// `review_role_change` onto the closest *pre-existing* `reason_code` enum
// values (`low_confidence`/`other`) because the schema had no dedicated
// code for them. That gap is now closed: `fantacalcio_manual_review_item
// .schema.json`'s `reason_code` enum was extended with `external_id_reuse`
// and `role_change` (schema/contract change, done explicitly in this
// batch — still no real data, no queue, no promotion). Mapping is now a
// direct 1:1 with the identity-candidate outcome:
//   - review_name_mismatch     -> "name_change"
//   - review_external_id_reuse -> "external_id_reuse"
//   - review_role_change       -> "role_change"
//
// Schema compatibility note: the schema now also defines an optional
// `identity_signals` object (`additionalProperties: false`) carrying
// exactly the generic evidence this builder exposes for a future human
// reviewer (outcome restricted to the three review_* outcomes, confidence
// band, name-token overlap, role/team continuity, external-id same/present
// flags). The *entire* payload this builder returns — including
// `identity_signals` — is now shape/enum-compatible with the schema; see
// the test file for a full-payload compatibility check.

import type { IdentityCandidateEvaluation } from "./identityCandidateEvaluator.js";
import type { ConfidenceBand, IdentityCandidateOutcome } from "./candidateKeyPolicy.js";

/** The reason codes this builder ever emits — a fixed subset of the full schema enum, now a direct 1:1 with ReviewableOutcome (see mapping note above). */
export type ManualReviewReasonCode = "name_change" | "external_id_reuse" | "role_change";

/** The subset of IdentityCandidateOutcome that this builder turns into a review item — also the exact `identity_signals.outcome` enum in the schema. */
export type ReviewableOutcome = "review_name_mismatch" | "review_external_id_reuse" | "review_role_change";

const REVIEWABLE_OUTCOMES: readonly ReviewableOutcome[] = [
  "review_name_mismatch",
  "review_external_id_reuse",
  "review_role_change",
];

const REASON_CODE_BY_REVIEW_OUTCOME: Readonly<Record<ReviewableOutcome, ManualReviewReasonCode>> = {
  review_name_mismatch: "name_change",
  review_external_id_reuse: "external_id_reuse",
  review_role_change: "role_change",
};

function isReviewableOutcome(outcome: IdentityCandidateOutcome): outcome is ReviewableOutcome {
  return (REVIEWABLE_OUTCOMES as readonly IdentityCandidateOutcome[]).includes(outcome);
}

/**
 * Synthetic-only context for one review item. Every field here is expected
 * to be a fixture value invented by the caller (e.g. "2019_20",
 * "synthetic_fixture", "fixture:rowA:001") — never a real season/source/
 * player reference. `createdAt` is caller-supplied (not generated
 * internally) so this module never calls `Date.now()` and stays pure.
 */
export interface ManualReviewItemContext {
  readonly seasonA: string | null;
  readonly seasonB: string | null;
  /** Label identifying the synthetic source/fixture set, e.g. "synthetic_fixture". Never a real acquisition/source id. */
  readonly sourceLabel: string;
  /** ISO-8601 date-time string supplied by the caller. */
  readonly createdAt: string;
  /** Synthetic row reference only, e.g. "fixture:rowA:001". Never a real external_id/name. */
  readonly rowRefA?: string | null;
  readonly rowRefB?: string | null;
  readonly entityKind?: "player" | "team";
}

/**
 * Generic, redacted identity-comparison evidence for a future human
 * reviewer. Field names are snake_case and match
 * `fantacalcio_manual_review_item.schema.json`'s `identity_signals` object
 * exactly (schema `additionalProperties: false`) — this is no longer an
 * additive/out-of-schema field, see module header.
 */
export interface ManualReviewItemIdentitySignals {
  readonly outcome: ReviewableOutcome;
  readonly confidence_band: ConfidenceBand;
  readonly name_token_overlap: number;
  readonly role_same: boolean;
  readonly team_same: boolean;
  readonly external_id_same: boolean;
  readonly external_id_present_a: boolean;
  readonly external_id_present_b: boolean;
}

export interface ManualReviewItemCandidate {
  readonly ref: string;
  readonly score: number;
  readonly note: string;
}

/** Review-item payload. Every field mirrors fantacalcio_manual_review_item.schema.json — the whole object is schema-compatible, not just a subset (see module header). */
export interface ManualReviewItem {
  readonly review_item_id: string;
  readonly created_at: string;
  readonly origin: "identity";
  readonly origin_ref: string;
  readonly entity_kind: "player" | "team";
  readonly reason_code: ManualReviewReasonCode;
  readonly reason_detail: string;
  readonly candidates: readonly ManualReviewItemCandidate[];
  /** Always the literal `true`: every outcome that reaches here is, by construction, a blocking one — see buildManualReviewItem's null cases. */
  readonly blocking: true;
  /** Always the literal `"open"`: this builder only ever creates a review item, never resolves one. */
  readonly status: "open";
  /** Always the literal `null`: resolution is explicitly out of scope for this builder. */
  readonly resolution: null;
  readonly identity_signals: ManualReviewItemIdentitySignals;
}

function fallbackRef(ref: string | null | undefined, fallback: string): string {
  return ref != null && ref.length > 0 ? ref : fallback;
}

function seasonOrNa(season: string | null): string {
  return season ?? "na";
}

/**
 * Turn one evaluateIdentityCandidate() outcome into a manual-review-item
 * payload, or `null` when no human review is warranted.
 *
 * - `accept_candidate`: `null` — nothing to review, the pair is accepted.
 * - `reject_candidate`: `null` (safer/minimal choice) — a mismatched
 *   external_id is a confident negative signal, not an ambiguity; the 0E
 *   contract reserves manual review for genuine ambiguity
 *   (`ambiguous`/`requires_manual_review`), not for every confident
 *   non-match, which would just flood a future review queue with noise.
 * - `insufficient_evidence`: `null` (same safer/minimal reasoning) — this
 *   pairwise comparator has no positive or negative signal to hand a
 *   reviewer here; it only means one/both rows lack an `external_id`, not
 *   that this specific pair is flagged as suspicious. (The 0E contract's
 *   "new_foreign -> requires_manual_review" default is a different case —
 *   a lone identity candidate with no comparison partner at all — not this
 *   two-row comparator's output.)
 * - `review_name_mismatch` / `review_external_id_reuse` /
 *   `review_role_change`: a review item, always `blocking: true`,
 *   `status: "open"`, `resolution: null` — this builder never resolves a
 *   review and never assigns `canonical_player_id`/`canonical_team_id`.
 *
 * Pure: no I/O, no randomness, no wall-clock reads — same input always
 * yields the same output.
 */
export function buildManualReviewItem(
  evaluation: IdentityCandidateEvaluation,
  context: ManualReviewItemContext,
): ManualReviewItem | null {
  const outcome = evaluation.policy.outcome;
  if (!isReviewableOutcome(outcome)) {
    return null;
  }

  const entityKind = context.entityKind ?? "player";
  const refA = fallbackRef(context.rowRefA, "unspecified_row_a");
  const refB = fallbackRef(context.rowRefB, "unspecified_row_b");
  const seasonA = seasonOrNa(context.seasonA);
  const seasonB = seasonOrNa(context.seasonB);

  const reviewItemId = `review:${context.sourceLabel}:${seasonA}:${seasonB}:${outcome}:${refA}:${refB}`;
  const originRef = `${context.sourceLabel}:${seasonA}->${seasonB}`;

  return {
    review_item_id: reviewItemId,
    created_at: context.createdAt,
    origin: "identity",
    origin_ref: originRef,
    entity_kind: entityKind,
    reason_code: REASON_CODE_BY_REVIEW_OUTCOME[outcome],
    reason_detail: `identity_candidate_outcome=${outcome}; policy_reason=${evaluation.policy.reasonCode}`,
    candidates: [
      {
        ref: refB,
        score: evaluation.nameComparison.tokenOverlap,
        note: evaluation.policy.reasonCode,
      },
    ],
    blocking: true,
    status: "open",
    resolution: null,
    identity_signals: {
      outcome,
      confidence_band: evaluation.policy.confidenceBand,
      name_token_overlap: evaluation.nameComparison.tokenOverlap,
      role_same: evaluation.roleSame,
      team_same: evaluation.teamSame,
      external_id_same: evaluation.externalIdSame,
      external_id_present_a: evaluation.externalIdPresentA,
      external_id_present_b: evaluation.externalIdPresentB,
    },
  };
}

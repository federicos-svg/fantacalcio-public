// FASE 3 candidate-key policy v1 — PURE, deterministic, fixture-only.
//
// Turns the FASE 3 Batch A real-data evidence (see PROJECT_STATE.md §"FASE 3
// Batch A", docs/DECISIONS.md §"Identity — FASE 3 candidate key") into an
// explicit decision function: given two season-rows' generic comparison
// signals, classify the pair into an outcome a future matcher/review queue
// can act on.
//
// This is NOT a real matcher, NOT canonicalization, NOT a data promotion:
//   - no player rows, names, or ids are read or produced here — every input
//     is already a generic/derived signal (booleans + a 0..1 score);
//   - no result ever carries a `canonical_player_id`/`canonical_team_id`
//     field, by construction (see IdentityCandidatePolicyResult below);
//   - this module sets no gate and is not imported by src/ (live app) or
//     packages/engine.
//
// Decision rules (per docs/DECISIONS.md "Identity — FASE 3 candidate key"):
//   - external_id may be used only as a PROVISIONAL candidate key, always
//     cross-checked against name-token overlap + role/team continuity;
//   - provider external_id reuse must route to review, never a silent
//     promotion;
//   - a team change alone must not auto-reject (transfers are normal) — it
//     only lowers confidence.

/** The full, exhaustive outcome set this policy can return. */
export const IDENTITY_CANDIDATE_OUTCOMES = [
  "accept_candidate",
  "review_name_mismatch",
  "review_external_id_reuse",
  "review_role_change",
  "reject_candidate",
  "insufficient_evidence",
] as const;

export type IdentityCandidateOutcome = (typeof IDENTITY_CANDIDATE_OUTCOMES)[number];

export type ConfidenceBand = "high" | "medium" | "low" | "not_applicable";

/**
 * Named policy bands for `nameTokenOverlap` — NOT calibrated against a real
 * labeled set. `docs/data/VALIDATION_IDENTITY_CONTRACT.md` §"Open decisions
 * residue" explicitly defers final `τ_high`/`τ_low` calibration to a future
 * batch with a real labeled set; these two constants are a deterministic v1
 * skeleton, not a calibrated threshold. Kept as named exports so a future
 * calibration pass changes one place, not scattered magic numbers.
 */
export const NAME_OVERLAP_HIGH_BAND = 0.7;
export const NAME_OVERLAP_LOW_BAND = 0.3;

/**
 * Generic, redacted comparison signals between two season-rows that share
 * (or might share) an `external_id` — never the raw rows themselves. Callers
 * (a future matcher) are responsible for computing `nameTokenOverlap` from
 * whatever name-normalization utility they use (e.g.
 * `packages/appeal-index/src/nameNormalization.ts`'s output, compared with a
 * token-overlap or similar score) — this module has no opinion on how that
 * score is produced, only on what to do with it.
 */
export interface IdentityCandidateComparison {
  /** Whether row A carries any external_id at all (missing on legacy/foreign rows). */
  readonly externalIdPresentA: boolean;
  /** Whether row B carries any external_id at all. */
  readonly externalIdPresentB: boolean;
  /** Meaningful only when both externalIdPresent* are true; ignored otherwise. */
  readonly externalIdSame: boolean;
  /** 0..1 token-overlap (or comparable) score between the two normalized names. */
  readonly nameTokenOverlap: number;
  /** Whether the two rows report the same role (P/D/C/A). */
  readonly roleSame: boolean;
  /** Whether the two rows report the same club — a mismatch is a normal transfer, not itself suspicious. */
  readonly teamSame: boolean;
}

export interface IdentityCandidatePolicyResult {
  readonly outcome: IdentityCandidateOutcome;
  readonly confidenceBand: ConfidenceBand;
  /** Short, fixed machine-readable reason — never interpolates row data. */
  readonly reasonCode: string;
}

/**
 * Classify one identity-candidate comparison. Pure: same input always
 * produces the same output, no I/O, no randomness. See the module header
 * for the rules this encodes.
 */
export function classifyIdentityCandidate(
  input: IdentityCandidateComparison,
): IdentityCandidatePolicyResult {
  if (!input.externalIdPresentA || !input.externalIdPresentB) {
    return { outcome: "insufficient_evidence", confidenceBand: "not_applicable", reasonCode: "external_id_missing" };
  }

  if (!input.externalIdSame) {
    return { outcome: "reject_candidate", confidenceBand: "not_applicable", reasonCode: "external_id_different" };
  }

  // From here: both rows carry an external_id and it matches — the
  // provisional candidate-key signal is present. Everything below decides
  // how much to trust it.
  if (input.nameTokenOverlap < NAME_OVERLAP_LOW_BAND) {
    return {
      outcome: "review_external_id_reuse",
      confidenceBand: "low",
      reasonCode: "name_overlap_low_despite_same_external_id",
    };
  }

  if (input.nameTokenOverlap < NAME_OVERLAP_HIGH_BAND) {
    return { outcome: "review_name_mismatch", confidenceBand: "medium", reasonCode: "name_overlap_moderate" };
  }

  // nameTokenOverlap >= NAME_OVERLAP_HIGH_BAND: strong name-continuity signal.
  if (!input.roleSame) {
    return {
      outcome: "review_role_change",
      confidenceBand: "medium",
      reasonCode: "role_changed_despite_strong_name_match",
    };
  }

  if (!input.teamSame) {
    // Transfers are normal — never auto-reject on team alone, just lower confidence.
    return { outcome: "accept_candidate", confidenceBand: "medium", reasonCode: "team_changed_transfer_possible" };
  }

  return { outcome: "accept_candidate", confidenceBand: "high", reasonCode: "strong_continuity_all_signals" };
}

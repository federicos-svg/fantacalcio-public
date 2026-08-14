// FASE 3 identity-candidate evaluator v1 — PURE, deterministic, fixture-only.
//
// Ties packages/identity-policy's two existing pieces together:
//   compareNames() (nameSimilarity.ts, PR #94) + classifyIdentityCandidate()
//   (candidateKeyPolicy.ts, PR #93)
// into a single entry point a future caller can hand two minimal identity
// rows to, without wiring up the comparison signals by hand each time.
//
// This is STILL NOT a real matcher and STILL NOT canonicalization:
//   - inputs are two minimal, generic rows (external id/name/role/team) —
//     never a full real player record, never read from real data here;
//   - `isCanonical` is always the literal `false` — a compile-time and
//     runtime guarantee, not a claim that could silently flip;
//   - no result ever carries a `canonical_player_id`/`canonical_team_id`
//     field, by construction;
//   - this module sets no gate and is not imported by src/ (live app) or
//     packages/engine.

import { compareNames, type NameComparisonSignals } from "./nameSimilarity.js";
import {
  classifyIdentityCandidate,
  type IdentityCandidatePolicyResult,
} from "./candidateKeyPolicy.js";

/**
 * Minimal, generic identity row — deliberately not a real player record.
 * `externalId` is a plain string here (not the numeric `external_id` real
 * XLSX rows carry) precisely so this evaluator can never be handed a real
 * row by accident; a caller must always project down to this shape first.
 */
export interface MinimalIdentityRow {
  readonly externalId?: string | null;
  readonly name: string;
  readonly role?: string | null;
  readonly team?: string | null;
}

export interface IdentityCandidateEvaluation {
  /** Always `false` — this function only ever produces a candidate evaluation, never a canonical assignment. */
  readonly isCanonical: false;
  readonly externalIdPresentA: boolean;
  readonly externalIdPresentB: boolean;
  /** True only when both sides have a present externalId AND it matches. */
  readonly externalIdSame: boolean;
  /** True only when both sides have a present, equal role — absence is never treated as a match. */
  readonly roleSame: boolean;
  /** True only when both sides have a present, equal team — absence is never treated as a match. */
  readonly teamSame: boolean;
  readonly nameComparison: NameComparisonSignals;
  readonly policy: IdentityCandidatePolicyResult;
}

function isPresent(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== "";
}

/**
 * Evaluate whether two minimal identity rows are plausibly the same
 * candidate — a single call combining name-similarity + candidate-key
 * policy classification. Pure: no I/O, no randomness, same input always
 * yields the same output.
 */
export function evaluateIdentityCandidate(
  a: MinimalIdentityRow,
  b: MinimalIdentityRow,
): IdentityCandidateEvaluation {
  const externalIdPresentA = isPresent(a.externalId);
  const externalIdPresentB = isPresent(b.externalId);
  const externalIdSame = externalIdPresentA && externalIdPresentB && a.externalId === b.externalId;

  const roleSame = isPresent(a.role) && isPresent(b.role) && a.role === b.role;
  const teamSame = isPresent(a.team) && isPresent(b.team) && a.team === b.team;

  const nameComparison = compareNames(a.name, b.name);

  const policy = classifyIdentityCandidate({
    externalIdPresentA,
    externalIdPresentB,
    externalIdSame,
    nameTokenOverlap: nameComparison.tokenOverlap,
    roleSame,
    teamSame,
  });

  return {
    isCanonical: false,
    externalIdPresentA,
    externalIdPresentB,
    externalIdSame,
    roleSame,
    teamSame,
    nameComparison,
    policy,
  };
}

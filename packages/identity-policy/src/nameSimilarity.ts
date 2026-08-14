// FASE 3 name-similarity helper v1 — PURE, deterministic, fixture-only.
//
// Provides the `nameTokenOverlap` signal that candidateKeyPolicy.ts's
// `IdentityCandidateComparison` expects but explicitly does not compute
// itself (see that module's header: "callers are responsible for computing
// nameTokenOverlap"). This is a comparison AID, never a canonical identity:
// no player rows are read here, only two already-in-hand name strings a
// caller supplies, and the output is only generic scores/flags.
//
// Deliberately duplicated from (not imported from)
// packages/appeal-index/src/nameNormalization.ts: appeal-index is a
// self-contained offline-ML exploration, not a shared library other
// packages are meant to depend on, and identity-policy is the more
// foundational/upstream concern here — importing "downward" from an ML
// package into a policy package would invert that relationship. The
// normalization rule itself (lowercase, strip diacritics, collapse
// separators to spaces) is intentionally identical to appeal-index's
// version so the two packages' name-comparison behavior stays consistent
// without a cross-package dependency.
//
// This is NOT a real matcher, NOT canonicalization: no threshold/band
// decision happens here (that stays in candidateKeyPolicy.ts), and no
// result ever carries a `canonical_player_id`/`canonical_team_id` field.

// U+0300-U+036F: Unicode "Combining Diacritical Marks" block, produced by
// String.prototype.normalize("NFD") when it decomposes accented letters.
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/**
 * Lowercase, strip diacritics, collapse any non-alphanumeric run (spaces,
 * hyphens, apostrophes, periods, ...) into a single space, trim. Preserves
 * every letter/digit token — never drops a token outright — so downstream
 * token-overlap comparison never over-matches by silently discarding a
 * meaningful name part.
 */
export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits an already-normalized name into its space-separated tokens. Empty input yields []. */
export function tokenizeNormalizedName(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/**
 * Jaccard token-overlap: |intersection| / |union|, in [0, 1]. Two empty
 * token lists (or either being empty) return 0 — "no evidence" is treated
 * as no overlap, never as a free match. Order-independent, deterministic.
 */
export function computeTokenOverlap(tokensA: readonly string[], tokensB: readonly string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared++;
  const union = new Set([...setA, ...setB]);
  return shared / union.size;
}

/** Full set of generic, redacted comparison signals between two raw name strings. */
export interface NameComparisonSignals {
  readonly normalizedA: string;
  readonly normalizedB: string;
  readonly tokensA: readonly string[];
  readonly tokensB: readonly string[];
  /** Jaccard token overlap in [0, 1] — feed directly into candidateKeyPolicy's `nameTokenOverlap`. */
  readonly tokenOverlap: number;
  /** True only when both sides normalize to a non-empty, identical string. */
  readonly exactNormalizedMatch: boolean;
  /** True when a side normalizes to the empty string (e.g. blank/whitespace-only input). */
  readonly emptyA: boolean;
  readonly emptyB: boolean;
  /** True when either side has zero tokens after normalization — not enough evidence to compare. */
  readonly insufficientTokens: boolean;
}

/**
 * Compare two raw name strings end to end: normalize, tokenize, score.
 * Pure — no I/O, no randomness, same input always yields the same output.
 * Never assigns any identity: only descriptive signals a caller (e.g.
 * candidateKeyPolicy.ts) can feed into its own decision logic.
 */
export function compareNames(rawA: string, rawB: string): NameComparisonSignals {
  const normalizedA = normalizePlayerName(rawA);
  const normalizedB = normalizePlayerName(rawB);
  const tokensA = tokenizeNormalizedName(normalizedA);
  const tokensB = tokenizeNormalizedName(normalizedB);
  const emptyA = normalizedA.length === 0;
  const emptyB = normalizedB.length === 0;
  const insufficientTokens = tokensA.length === 0 || tokensB.length === 0;

  return {
    normalizedA,
    normalizedB,
    tokensA,
    tokensB,
    tokenOverlap: computeTokenOverlap(tokensA, tokensB),
    exactNormalizedMatch: !emptyA && !emptyB && normalizedA === normalizedB,
    emptyA,
    emptyB,
    insufficientTokens,
  };
}

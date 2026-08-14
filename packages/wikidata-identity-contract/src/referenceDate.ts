import { REFERENCE_DATE_CONTEXT_REQUIREMENT } from "./types.js";
import type {
  ReferenceDateContext,
  ReferenceDateResolution,
  ReferenceDateType,
} from "./types.js";

export interface ReferenceDateCandidate {
  readonly type: ReferenceDateType;
  readonly value: string;
}

// Fail-closed, context-driven resolution (round 2 finding 1). Each context
// requires exactly one reference date type — see
// REFERENCE_DATE_CONTEXT_REQUIREMENT. A PLAYER_MATCH observation never picks
// up AUCTION_DATE or SEASON_START_DATE just because they happen to be known;
// if MATCH_DATE itself is missing, the result is REFERENCE_DATE_MISSING, not
// a silent substitute from another context.
//
// `explicitFallbackOrder` is opt-in only: the caller must name, in order,
// which OTHER reference date types it is willing to accept instead, and
// accepts the semantic consequences of doing so. There is no default
// fallback and no implicit cross-context precedence.
export function resolveReferenceDate(
  context: ReferenceDateContext,
  candidates: readonly ReferenceDateCandidate[],
  explicitFallbackOrder: readonly ReferenceDateType[] = [],
): ReferenceDateResolution {
  const requiredType = REFERENCE_DATE_CONTEXT_REQUIREMENT[context];

  const primary = candidates.find((candidate) => candidate.type === requiredType);
  if (primary !== undefined) {
    return { status: "OK", type: primary.type, value: primary.value };
  }

  for (const fallbackType of explicitFallbackOrder) {
    const match = candidates.find((candidate) => candidate.type === fallbackType);
    if (match !== undefined) {
      return { status: "OK", type: match.type, value: match.value };
    }
  }

  return { status: "REFERENCE_DATE_MISSING", requiredType };
}

import type {
  ConflictRecord,
  PrecedenceResponsibility,
  ProvenanceRecord,
  SourceName,
} from "./types.js";

export interface ConflictInput<T> {
  readonly field: string;
  readonly season: string;
  readonly valueA: T;
  readonly sourceA: SourceName;
  readonly provenanceA: ProvenanceRecord;
  readonly valueB: T;
  readonly sourceB: SourceName;
  readonly provenanceB: ProvenanceRecord;
  // MUST be `effectiveResponsibility(rule)` from precedencePolicy.ts — never a raw
  // `primaryCandidates` list read directly off a PrecedenceRule. A candidate that
  // has not passed a real pilot is downgraded to MISSING by that function, and
  // MISSING never auto-resolves here (see below). Passing a candidate straight
  // through would let an unverified source silently win a conflict.
  readonly precedence: PrecedenceResponsibility;
  readonly valuesEqual: (a: T, b: T) => boolean;
}

/**
 * Never overwrites silently: both values + both provenance records are always kept.
 * Only `{ kind: "PRIMARY" }` precedence resolves a real conflict —
 * `DERIVED_FROM_MULTIPLE` and `MISSING` are never sufficient evidence to pick a
 * winner automatically, they stay `CONFLICT_UNRESOLVED`. Because
 * effectiveResponsibility() downgrades every unverified candidate to `MISSING` and
 * never promotes a structurally cross-check-only source to `PRIMARY`, a `PRIMARY`
 * precedence reaching this function is guaranteed (by that upstream contract) to name
 * a source backed by a real, passed pilot that is actually eligible for primary
 * authority on this field — this function does not and cannot re-verify that itself.
 *
 * Generic over any `FeatureSourceName`: registering a newly approved source never
 * requires a change here, only a new precedence rule.
 */
export function classifyConflict<T>(input: ConflictInput<T>): ConflictRecord<T> {
  const base = {
    field: input.field,
    season: input.season,
    valueA: input.valueA,
    sourceA: input.sourceA,
    provenanceA: input.provenanceA,
    valueB: input.valueB,
    sourceB: input.sourceB,
    provenanceB: input.provenanceB,
  };

  if (input.valuesEqual(input.valueA, input.valueB)) {
    return {
      ...base,
      status: "CONFLICT_RESOLVED",
      resolutionRule: "values_equal",
      resolvedValue: input.valueA,
      resolvedSource: input.sourceA,
    };
  }

  if (input.precedence.kind === "PRIMARY") {
    const primarySource = input.precedence.source;
    if (input.sourceA === primarySource) {
      return {
        ...base,
        status: "CONFLICT_RESOLVED",
        resolutionRule: `PRIMARY:${primarySource}`,
        resolvedValue: input.valueA,
        resolvedSource: input.sourceA,
      };
    }
    if (input.sourceB === primarySource) {
      return {
        ...base,
        status: "CONFLICT_RESOLVED",
        resolutionRule: `PRIMARY:${primarySource}`,
        resolvedValue: input.valueB,
        resolvedSource: input.sourceB,
      };
    }
  }

  return {
    ...base,
    status: "CONFLICT_UNRESOLVED",
    resolutionRule: null,
    resolvedValue: null,
    resolvedSource: null,
  };
}

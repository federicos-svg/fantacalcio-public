// Hybrid dataset contract: target = Fantacalcio votes/results (sole ground truth,
// never a feature source), feature = structured external sources. Never alias
// target and feature fields (see docs/data/HYBRID_ALGORITHM_DATASET_CONTRACT.md).
//
// Provider-agnostic precedence architecture. The removed source is gone entirely:
// no replacement value is derived for anything it used to cover — a missing feature
// stays MISSING, never backfilled from Fantacalcio quotations, from another provider
// or from any proxy. No remaining source is promoted to PRIMARY for a field merely
// because the removed one is gone: only fields/seasons backed by a real, documented,
// passed pilot are PRIMARY here, everything else stays exactly as unresolved as it
// was before the removal.
//
// `PrecedenceResponsibility` names a source explicitly via a `source`/`sources`
// field instead of baking each provider into its own enum value (the older
// PRIMARY_<PROVIDER> / CROSS_CHECK_ONLY_<PROVIDER> shape required a brand new enum
// value per source). Registering a newly approved source only requires adding it to
// `FeatureSourceName` and a precedence rule in precedencePolicy.ts — never touching
// the logic in conflictClassifier.ts or coverageClassifier.ts.

export type FeatureSourceName = "api_football";
export type SourceName = "fantacalcio" | FeatureSourceName;

export type CoverageStatus =
  | "COMPLETE"
  | "PARTIAL"
  | "MISSING_BY_SOURCE"
  | "PLAN_RESTRICTED"
  | "NOT_HISTORICAL"
  | "SNAPSHOT_ONLY"
  | "CONFLICT"
  | "NOT_TESTED";

/**
 * Generic precedence responsibility. `source`/`sources` always name a real,
 * pilot-verified `FeatureSourceName` — Fantacalcio is the sole target/ground-truth
 * source and is never a `PRIMARY`/`DERIVED_FROM_MULTIPLE` feature responsibility
 * here. `MISSING` is the only legal value when no source has a real, pilot-verified
 * claim to a field: a missing optional feature always fails open to `MISSING`, never
 * silently to an invented fallback or to a value derived from another source.
 */
export type PrecedenceResponsibility =
  | { readonly kind: "PRIMARY"; readonly source: FeatureSourceName }
  | { readonly kind: "DERIVED_FROM_MULTIPLE"; readonly sources: readonly FeatureSourceName[] }
  | { readonly kind: "MISSING" };

/**
 * An ordered list of sources, used both for the sources eligible to become
 * `PRIMARY`/`DERIVED_FROM_MULTIPLE` for a field once pilot-verified and for the ones
 * structurally capped at cross-check (see `PrecedenceRule` in precedencePolicy.ts).
 * An empty array means no source is proposed at all — never invented. Adding a newly
 * approved source as a candidate for more fields never requires changing this type.
 *
 * Never used directly by classifyConflict(): only `effectiveResponsibility()`
 * (precedencePolicy.ts), which downgrades an unverified or cross-check-only candidate
 * to `MISSING`, may be passed as conflict precedence.
 */
export type PreferredSourceCandidate = readonly FeatureSourceName[];

export type PointInTimeStatus =
  | "BUILDABLE_POINT_IN_TIME"
  | "PARTIAL_POINT_IN_TIME"
  | "NOT_BUILDABLE"
  | "LEAKAGE_RISK";

export type SnapshotClassification =
  | "TRUE_HISTORICAL_SNAPSHOT"
  | "CURRENT_VALUE_ONLY"
  | "RETROACTIVE_SUMMARY"
  | "HISTORICAL_EVENT_LOG"
  | "UNKNOWN";

export type MissingnessStatus =
  | "present"
  | "missing_not_tested"
  | "missing_by_source"
  | "missing_plan_restricted";

export type ConflictStatus = "no_conflict" | "conflict_unresolved" | "conflict_resolved";

// Per-(field, season, source) evidence collected from a real pilot/cross-check.
// `tested: false` must always yield NOT_TESTED — never inferred from other seasons/fields.
export interface FieldSeasonSourceEvidence {
  readonly field: string;
  readonly season: string;
  readonly source: FeatureSourceName;
  readonly tested: boolean;
  readonly accessible: boolean;
  readonly planRestricted: boolean;
  readonly acceptsSeasonParameter: boolean;
  readonly retroactiveOverlayRisk: boolean;
  readonly recordCount: number | null;
  readonly expectedMinimumRecordCount: number | null;
}

export interface ProvenanceRecord {
  readonly source: SourceName;
  readonly sourceEntityId: string;
  readonly season: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly cutoffAt: string | null;
  readonly snapshotClassification: SnapshotClassification;
  readonly transformVersion: string;
  readonly missingnessStatus: MissingnessStatus;
  readonly conflictStatus: ConflictStatus;
}

export interface ConflictRecord<T> {
  readonly field: string;
  readonly season: string;
  readonly valueA: T;
  readonly sourceA: SourceName;
  readonly provenanceA: ProvenanceRecord;
  readonly valueB: T;
  readonly sourceB: SourceName;
  readonly provenanceB: ProvenanceRecord;
  readonly status: "CONFLICT_UNRESOLVED" | "CONFLICT_RESOLVED";
  readonly resolutionRule: string | null;
  readonly resolvedValue: T | null;
  readonly resolvedSource: SourceName | null;
}

export interface PointInTimeFeatureDeclaration {
  readonly feature: string;
  readonly source: SourceName;
  readonly sourceEntityId: string;
  readonly season: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly cutoffAt: string;
  readonly snapshotClassification: SnapshotClassification;
  readonly transformVersion: string;
  readonly provenance: ProvenanceRecord;
  readonly missingnessStatus: MissingnessStatus;
  readonly conflictStatus: ConflictStatus;
}

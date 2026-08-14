// Hybrid dataset contract: target = Fantacalcio votes/results, feature = Transfermarkt / API-Football.
// Never alias target and feature fields (see docs/data/HYBRID_ALGORITHM_DATASET_CONTRACT.md).

export type FeatureSourceName = "transfermarkt" | "api_football";
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

export type PrecedenceResponsibility =
  | "PRIMARY_TRANSFERMARKT"
  | "PRIMARY_API_FOOTBALL"
  | "CROSS_CHECK_ONLY_TRANSFERMARKT"
  | "CROSS_CHECK_ONLY_API_FOOTBALL"
  | "DERIVED_FROM_BOTH"
  | "MISSING";

// The source the hybrid architecture *wants* to lean on for a field, independent of
// whether a real pilot has actually verified it yet. Never used directly by
// classifyConflict() — only `effectiveResponsibility()` (precedencePolicy.ts), which
// downgrades an unverified candidate to MISSING, may be passed as conflict precedence.
export type PreferredSourceCandidate = "transfermarkt" | "api_football" | "both" | "none";

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

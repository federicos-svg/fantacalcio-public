import type {
  ConflictStatus,
  CoverageStatus,
  MissingnessStatus,
  PointInTimeStatus,
  SnapshotClassification,
} from "../../hybrid-dataset-contract/src/types.js";

export type DataSourceId =
  | "fantacalcio_votes"
  | "fantacalcio_listone"
  | "league_manual"
  | "api_football"
  | "transfermarkt"
  | "wikidata"
  | "gruppo_esperti_topic_unico"
  | "auction_event_log";

export type DataOriginId = DataSourceId | "internal_derivation";

export type SourcePriority = "MUST" | "SHOULD" | "LATER" | "BLOCKED";

export type SourceState =
  | "AVAILABLE_PRIVATE"
  | "ACTIVE_REAL"
  | "PARTIAL_REAL"
  | "BLOCKED_TECHNICAL"
  | "NOT_TESTED"
  | "LOCAL_RUNTIME";

export type EvidenceKind =
  | "REAL_PAYLOAD"
  | "MANUAL_DECLARATION"
  | "CONTRACT_ONLY"
  | "SYNTHETIC_ONLY"
  | "LOCAL_RUNTIME";

export type AuthorityRole =
  | "GROUND_TRUTH"
  | "RULE_AUTHORITY"
  | "FEATURE_CANDIDATE"
  | "CROSS_CHECK"
  | "DISPLAY_ONLY"
  | "EXPERT_OPINION"
  | "LIVE_STATE";

export type RefreshCadence =
  | "STATIC"
  | "PER_SEASON"
  | "DAILY"
  | "PER_MATCHDAY"
  | "EVENT_DRIVEN"
  | "MANUAL";

export type StoragePlane =
  | "POSTGRES"
  | "OBJECT_STORAGE"
  | "PARQUET"
  | "REPOSITORY"
  | "LOCAL_STORAGE"
  | "LIVE_BUNDLE";

export type RuntimeAccess = "OFFLINE_BUILD_ONLY" | "LIVE_LOCAL_ONLY";

export type DataFamily =
  | "editorial_vote"
  | "editorial_component"
  | "listone"
  | "league_rule"
  | "player_identity"
  | "team_season"
  | "player_match_stat"
  | "player_season_stat"
  | "standing"
  | "transfer_event"
  | "absence"
  | "coach_tenure"
  | "market_value"
  | "expert_opinion"
  | "auction_event"
  | "derived_fantasy_score"
  | "dataset_snapshot"
  | "experiment_artifact";

export type FieldGranularity =
  | "PLAYER_MATCH"
  | "PLAYER_SEASON"
  | "PLAYER_SNAPSHOT"
  | "TEAM_MATCH"
  | "TEAM_SEASON"
  | "LEAGUE_SEASON"
  | "LINEUP_MATCH"
  | "AUCTION_EVENT"
  | "DATASET_RUN";

export type AlgorithmUse =
  | "TARGET"
  | "FEATURE"
  | "RULE"
  | "LIVE_STATE"
  | "DISPLAY_ONLY"
  | "NOT_FOR_MODEL";

export type ProviderFieldRole =
  | "GROUND_TRUTH"
  | "IDENTITY_SEED"
  | "PRIMARY_CANDIDATE"
  | "CROSS_CHECK"
  | "RULE_AUTHORITY"
  | "LOCAL_AUTHORITY"
  | "DERIVATION";

export type TemporalField =
  | "effective_at"
  | "observed_at"
  | "available_at"
  | "ingested_at";

export type DataFieldId =
  | "fantacalcio_base_vote"
  | "fantacalcio_component"
  | "fantacalcio_player_score"
  | "league_rule_version"
  | "lineup_modifier_result"
  | "lineup_fantasy_score"
  | "listone_role"
  | "listone_quotation"
  | "player_identity_core"
  | "player_date_of_birth"
  | "team_season_membership"
  | "player_appearances"
  | "player_minutes"
  | "player_starts"
  | "player_substitute_appearances"
  | "api_football_rating"
  | "transfermarkt_market_value"
  | "transfer_event"
  | "injury_absence"
  | "coach_tenure"
  | "league_standing"
  | "auction_event";

export interface SourceRegistryEntry {
  readonly id: DataSourceId;
  readonly label: string;
  readonly priority: SourcePriority;
  readonly state: SourceState;
  readonly evidenceKind: EvidenceKind;
  readonly authorityRoles: readonly AuthorityRole[];
  readonly dataFamilies: readonly DataFamily[];
  readonly refreshCadence: RefreshCadence;
  readonly requiredForLiveMvp: boolean;
  readonly requiredForCoreValue: boolean;
  readonly canBlockEnrichedBackfill: boolean;
  readonly evidenceRefs: readonly string[];
  readonly notes: string;
}

export interface FieldProviderDeclaration {
  readonly sourceId: DataOriginId;
  readonly providerScopedName: string;
  readonly role: ProviderFieldRole;
  readonly coverageStatus:
    | CoverageStatus
    | "LOCAL_ONLY"
    | "MANUAL_ONLY"
    | "DERIVED_ONLY";
}

export interface FieldRegistryEntry {
  readonly id: DataFieldId;
  readonly semanticName: string;
  readonly family: DataFamily;
  readonly granularity: FieldGranularity;
  readonly algorithmUse: AlgorithmUse;
  readonly providers: readonly FieldProviderDeclaration[];
  readonly requiredTimestamps: readonly TemporalField[];
  readonly primaryStorage: StoragePlane;
  readonly forbiddenAliases: readonly string[];
  readonly notes: string;
}

export interface TemporalEnvelope {
  readonly effectiveAt: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly ingestedAt: string;
}

export interface PlatformProvenance {
  readonly sourceId: DataSourceId;
  readonly sourceEntityId: string;
  readonly season: string | null;
  readonly temporal: TemporalEnvelope;
  readonly snapshotClassification: SnapshotClassification;
  readonly transformVersion: string;
  readonly missingnessStatus: MissingnessStatus;
  readonly conflictStatus: ConflictStatus;
  readonly pointInTimeStatus: PointInTimeStatus | null;
  readonly rawAssetId: string | null;
}

export type CanonicalEntityType = "PLAYER" | "TEAM" | "COACH";

export interface CanonicalEntity {
  readonly canonicalEntityId: string;
  readonly entityType: CanonicalEntityType;
  readonly lifecycleStatus: "ACTIVE" | "MERGED" | "RETIRED";
  readonly createdAt: string;
}

export interface SourceEntityReference {
  readonly sourceReferenceId: string;
  readonly sourceId: DataSourceId;
  readonly sourceEntityId: string;
  readonly entityType: CanonicalEntityType;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly status: "CANDIDATE" | "VERIFIED" | "REJECTED" | "CONFLICT";
}

export interface IdentityAssertion {
  readonly assertionId: string;
  readonly sourceReferenceId: string;
  readonly candidateCanonicalEntityId: string;
  readonly assertionType:
    | "NAME_ROLE"
    | "BIRTHDATE"
    | "TEAM_SEASON"
    | "PROVIDER_CROSSWALK"
    | "MANUAL_REVIEW";
  readonly evidenceRef: string;
  readonly status: "CANDIDATE" | "VERIFIED" | "REJECTED";
  readonly assertedAt: string;
}

export interface IdentityConflict {
  readonly conflictId: string;
  readonly sourceReferenceId: string;
  readonly candidateCanonicalEntityIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly status: "OPEN" | "RESOLVED" | "REJECTED_ALL";
  readonly resolutionId: string | null;
}

export interface IdentityResolution {
  readonly resolutionId: string;
  readonly sourceReferenceId: string;
  readonly canonicalEntityId: string;
  readonly resolutionMethod: "MANUAL" | "DETERMINISTIC_POLICY";
  readonly evidenceRefs: readonly string[];
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly supersedesResolutionId: string | null;
}

export interface AcquisitionRun {
  readonly acquisitionRunId: string;
  readonly sourceId: DataSourceId;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly outcome: "INGESTED" | "SKIPPED" | "FAILED" | "BLOCKED";
  readonly requestFingerprint: string;
  readonly errorCode: string | null;
}

/** Metadata only. Raw bytes live in private object storage. */
export interface RawAsset {
  readonly rawAssetId: string;
  readonly acquisitionRunId: string;
  readonly sourceId: DataSourceId;
  readonly contentHash: string;
  readonly contentType: string;
  readonly objectPath: string;
  readonly retrievedAt: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly schemaFingerprint: string | null;
  readonly authorizationRef: string;
}

export type PresentPlatformProvenance = PlatformProvenance & {
  readonly missingnessStatus: "present";
};

export interface NormalizedObservation<TValue> {
  readonly observationId: string;
  readonly fieldId: DataFieldId;
  readonly sourceReferenceId: string | null;
  readonly canonicalEntityId: string | null;
  readonly value: TValue;
  readonly provenance: PresentPlatformProvenance;
}

export interface LeagueRuleVersion {
  readonly leagueRuleVersionId: string;
  readonly effectiveSeason: string;
  readonly baseVoteSource: "FANTACALCIO_REDAZIONE";
  readonly bonusMalusSource: "FANTACALCIO";
  readonly assistSource: "FANTACALCIO";
  readonly fantasyScoreMode: "CLASSIC";
  readonly ruleHash: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
}

export interface DerivedFantasyComponent {
  readonly componentId: string;
  readonly observationIds: readonly string[];
  readonly leagueRuleVersionId: string;
  readonly componentType: string;
  readonly value: number;
  readonly derivationVersion: string;
}

export interface PlayerFantasyScore {
  readonly playerFantasyScoreId: string;
  readonly canonicalPlayerId: string;
  readonly matchId: string;
  readonly componentIds: readonly string[];
  readonly leagueRuleVersionId: string;
  readonly value: number;
}

export interface LineupModifierResult {
  readonly lineupModifierResultId: string;
  readonly lineupId: string;
  readonly modifierType: "DEFENCE" | "MIDFIELD" | "ATTACK";
  readonly leagueRuleVersionId: string;
  readonly inputObservationIds: readonly string[];
  readonly value: number;
}

export interface LineupFantasyScore {
  readonly lineupFantasyScoreId: string;
  readonly lineupId: string;
  readonly playerFantasyScoreIds: readonly string[];
  readonly lineupModifierResultIds: readonly string[];
  readonly leagueRuleVersionId: string;
  readonly value: number;
}

/** Searchable metadata. Dataset bytes live as a hash-pinned Parquet artifact. */
export interface DatasetSnapshot {
  readonly datasetSnapshotId: string;
  readonly datasetVersion: string;
  readonly cutoffAt: string;
  readonly inputArtifactHashes: readonly string[];
  readonly transformVersion: string;
  readonly rowCount: number;
  readonly manifestHash: string;
  readonly artifactId: string;
}

export interface ExperimentRun {
  readonly experimentRunId: string;
  readonly datasetSnapshotId: string;
  readonly codeCommit: string;
  readonly protocolVersion: string;
  readonly configHash: string;
  readonly status: "PLANNED" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED";
  readonly authorityCap: "NONE" | "SCOUTING" | "ADVISORY_CANDIDATE";
}

/** Searchable metadata. Artifact bytes live in the declared storage plane/path. */
export interface ArtifactManifest {
  readonly artifactId: string;
  readonly experimentRunId: string | null;
  readonly artifactType:
    | "RAW"
    | "NORMALIZED"
    | "DATASET"
    | "FEATURE_MATRIX"
    | "OOF_PREDICTIONS"
    | "REPORT"
    | "LIVE_BUNDLE";
  readonly storagePlane: StoragePlane;
  readonly contentHash: string;
  readonly objectPath: string;
  readonly createdAt: string;
}

export type ArtifactKind =
  | "raw_payload"
  | "raw_asset_metadata"
  | "normalized_observation"
  | "identity_record"
  | "rule_version"
  | "derived_score"
  | "dataset_snapshot_metadata"
  | "feature_matrix"
  | "experiment_artifact"
  | "contract"
  | "synthetic_fixture"
  | "auction_event_log"
  | "live_bundle";

export interface ArtifactStoragePolicy {
  readonly artifactKind: ArtifactKind;
  readonly primary: StoragePlane;
  readonly secondary: StoragePlane | null;
  readonly allowedInRepository: boolean;
  readonly allowedInLiveBundle: boolean;
  readonly notes: string;
}

export type LogicalLayer =
  | "RAW"
  | "OBSERVATION"
  | "IDENTITY"
  | "RULES"
  | "DERIVED"
  | "DATASET"
  | "EXPERIMENT"
  | "LIVE_LOCAL";

export type LogicalEntityId =
  | "acquisition_run"
  | "raw_asset"
  | "source_observation"
  | "field_season_source_evidence"
  | "canonical_entity"
  | "source_entity_reference"
  | "identity_assertion"
  | "identity_resolution"
  | "identity_conflict"
  | "league_rule_version"
  | "derived_fantasy_component"
  | "player_fantasy_score"
  | "lineup_modifier_result"
  | "lineup_fantasy_score"
  | "artifact_manifest"
  | "dataset_snapshot"
  | "experiment_run"
  | "auction_event_log"
  | "live_bundle_manifest";

export interface LogicalEntitySpec {
  readonly id: LogicalEntityId;
  readonly layer: LogicalLayer;
  readonly storage: StoragePlane;
  readonly appendOnly: boolean;
  readonly runtimeAccess: RuntimeAccess;
  readonly dependsOn: readonly LogicalEntityId[];
  readonly purpose: string;
}

export type CapabilityLevel =
  | "BLOCKED"
  | "MISSING"
  | "CONTRACT_ONLY"
  | "SYNTHETIC_ONLY"
  | "REAL_PARTIAL"
  | "REAL_AVAILABLE";

export type AuthorityLevel = "NONE" | "SCOUTING" | "ADVISORY" | "DIRECTIVE";

export type PipelineReadiness =
  | "BLOCKED"
  | "CONTRACT_READY"
  | "FIXTURE_READY"
  | "PARTIAL_REAL_READY"
  | "REAL_RUN_READY";

export interface CapabilityRequirement {
  readonly capabilityId: string;
  readonly minimumLevel: Exclude<CapabilityLevel, "BLOCKED">;
}

export interface AuthorityRequirement {
  readonly authorityId: string;
  readonly minimumLevel: Exclude<AuthorityLevel, "NONE">;
}

export interface PipelineRequirementSpec {
  readonly pipelineId: string;
  readonly capabilityRequirements: readonly CapabilityRequirement[];
  readonly authorityRequirements: readonly AuthorityRequirement[];
  readonly readyStateWhenSatisfied: Exclude<PipelineReadiness, "BLOCKED">;
}

export interface PipelineReadinessResult {
  readonly pipelineId: string;
  readonly readiness: PipelineReadiness;
  readonly unmetCapabilities: readonly CapabilityRequirement[];
  readonly unmetAuthorities: readonly AuthorityRequirement[];
  readonly blockers: readonly string[];
}

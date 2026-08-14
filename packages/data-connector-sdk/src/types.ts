import type { DataSourceId } from "../../data-platform-contract/src/types.js";

export type { DataSourceId };

/** Every connector in this SDK runs in this single mode. There is no write mode. */
export type ConnectorMode = "read_only";

/**
 * What the repository actually knows about a source's data, independent of
 * whether this batch's connector can reach it right now. Historical/prior
 * evidence never upgrades `ConnectorRuntimeStatus` on its own — see
 * `ConnectorRuntimeStatus` and `packages/data-connectors/src/
 * connectorRegistry.ts`'s validator, which enforces the two never collapse
 * into one field again.
 */
export type SourceEvidenceStatus =
  | "REAL_VERIFIED"
  | "REAL_PARTIAL"
  | "CONTRACT_ONLY"
  | "NOT_VERIFIED";

/**
 * Whether THIS connector, as implemented in this batch, can itself acquire
 * or read its authorized input. `CONNECTED_READ_ONLY` requires the
 * connector's `acquire()` to actually succeed for some authorized input —
 * never granted merely because the underlying source has real evidence
 * elsewhere in the repository (see `SourceEvidenceStatus`). An adapter that
 * only accepts a caller-supplied payload is `IMPLEMENTED_NOT_CONNECTED`,
 * never `CONNECTED_READ_ONLY`.
 */
export type ConnectorRuntimeStatus =
  | "CONNECTED_READ_ONLY"
  | "IMPLEMENTED_NOT_CONNECTED"
  | "BLOCKED_TECHNICAL"
  | "BLOCKED_AUTHORIZATION"
  | "NOT_APPLICABLE";

export type ProviderErrorKind =
  | "unauthorized_401"
  | "forbidden_403"
  | "rate_limited_429"
  | "server_error_5xx"
  | "unexpected_schema"
  | "network_error"
  | "not_authorized_in_session"
  | "not_callable";

/** 401/403/429 and unexpected-schema are never transitory: they stop, they never retry. */
export const NON_TRANSIENT_ERROR_KINDS: readonly ProviderErrorKind[] = [
  "unauthorized_401",
  "forbidden_403",
  "rate_limited_429",
  "unexpected_schema",
  "not_authorized_in_session",
  "not_callable",
];

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export interface RateLimitPolicy {
  readonly maxRequestsPerWindow: number;
  readonly windowMs: number;
  readonly minIntervalMs: number;
}

/**
 * Connector-run metadata only — when THIS run retrieved/observed/made
 * available the artifact, and under what authorization. Deliberately
 * excluded from `content_fingerprint` (see `ArtifactFingerprint`): none of
 * these fields describe the data's logical content, only the circumstances
 * of this particular run.
 */
export interface ConnectorProvenance {
  readonly sourceId: DataSourceId;
  readonly retrievedAt: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly authorizationRef: string;
}

export interface DiscoveryResult {
  readonly sourceId: DataSourceId;
  readonly sourceEvidenceStatus: SourceEvidenceStatus;
  readonly connectorRuntimeStatus: ConnectorRuntimeStatus;
  readonly mode: ConnectorMode;
  readonly checkedAt: string;
  readonly evidenceRefs: readonly string[];
  readonly notes: string;
}

/**
 * Every acquisition request must carry a closed batch authorization reference
 * or be explicitly null. A null ref can never reach a real network call in
 * this SDK's connectors — see each connector's `acquire()`.
 */
export interface AcquisitionRequest {
  readonly sourceId: DataSourceId;
  readonly scope: string;
  readonly authorizedBatchRef: string | null;
}

export type AcquisitionOutcome<TRaw> =
  | { readonly status: "acquired"; readonly artifact: TRaw }
  | { readonly status: "blocked"; readonly reason: ProviderErrorKind; readonly detail: string };

export interface RawArtifact {
  readonly sourceId: DataSourceId;
  readonly contentHash: string;
  readonly contentType: string;
  readonly payloadRef: string;
  readonly provenance: ConnectorProvenance;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

/**
 * `contentFingerprint` is set by `finalizeCanonicalArtifact()`
 * (`packages/data-connectors/src/connectorSupport.ts`) over every field of
 * the artifact EXCEPT `provenance` — so it is stable across two runs that
 * observe the exact same logical content at different times, under
 * different authorization references. `provenance` itself is still carried
 * on the artifact (for audit/manifest purposes) but never feeds
 * `contentFingerprint`.
 */
export interface CanonicalArtifact {
  readonly sourceId: DataSourceId;
  readonly schemaVersion: string;
  readonly transformVersion: string;
  readonly recordCount: number;
  readonly contentFingerprint: string;
  readonly provenance: ConnectorProvenance;
}

export interface ConnectorCapabilityReport {
  readonly sourceId: DataSourceId;
  readonly sourceEvidenceStatus: SourceEvidenceStatus;
  readonly connectorRuntimeStatus: ConnectorRuntimeStatus;
  readonly mode: ConnectorMode;
  readonly verifiedInThisSession: boolean;
  readonly verifiedAt: string;
  readonly evidenceRefs: readonly string[];
  readonly blockers: readonly string[];
  readonly rateLimitPolicy: RateLimitPolicy | null;
  readonly retryPolicy: RetryPolicy | null;
  readonly notes: string;
}

/**
 * `content`: hash of the artifact's logical content only (`provenance`
 * excluded) — identical across two runs of the same underlying data,
 * regardless of clock or authorization reference. `manifest`: hash of the
 * full artifact including `provenance` — changes run to run even when the
 * content did not. The orchestrator's change-detection
 * (`packages/data-connectors/src/orchestrator.ts`) always compares
 * `content`, never `manifest`.
 */
export interface ArtifactFingerprint {
  readonly content: string;
  readonly manifest: string;
}

/**
 * Common, provider-agnostic connector contract. `acquire()` never performs a
 * real network call unless `request.authorizedBatchRef` matches a closed
 * batch this connector recognizes; every connector in this package defaults
 * to `blocked` when it does not.
 */
export interface DataConnector<TRaw = unknown, TCanonical = unknown> {
  readonly sourceId: DataSourceId;
  readonly mode: ConnectorMode;

  discover(): DiscoveryResult;
  acquire(request: AcquisitionRequest): Promise<AcquisitionOutcome<TRaw>>;
  validate(raw: TRaw): ValidationResult;
  normalize(raw: TRaw, validation: ValidationResult): TCanonical;
  fingerprint(artifact: TCanonical): ArtifactFingerprint;
  report(): ConnectorCapabilityReport;
}

export type ConnectorRunTrigger =
  | "new_raw_hash"
  | "new_dataset_hash"
  | "new_rule_version"
  | "new_connector_version"
  | "manual_authorized_run";

export type ConnectorRunOutcome = "NO_CHANGE" | "RAN" | "BLOCKED" | "FAILED" | "NOT_RUN";

/**
 * Structured reason for a run outcome — never a free-form string alone. Each
 * outcome has a small, closed set of reason codes that can produce it; see
 * `decideConnectorRunOutcome()` in `packages/data-connectors/src/
 * orchestrator.ts` for the exact mapping.
 */
export type ConnectorRunReasonCode =
  | "NOT_INCLUDED_IN_PASS"
  | "RUNTIME_BLOCKED_TECHNICAL"
  | "RUNTIME_BLOCKED_AUTHORIZATION"
  | "ACQUISITION_FAILED"
  | "VALIDATION_FAILED"
  | "NORMALIZATION_FAILED"
  | "NO_VALID_CURRENT_INPUT"
  | "CONNECTOR_VERSION_UNCHANGED"
  | "CONNECTOR_VERSION_CHANGED"
  | "CONTENT_FINGERPRINT_UNCHANGED"
  | "CONTENT_FINGERPRINT_CHANGED"
  | "MANUAL_AUTHORIZED_OVERRIDE";

export interface ConnectorRunManifest {
  readonly manifestVersion: "connector-run-manifest-v1";
  readonly runId: string;
  readonly sourceId: DataSourceId;
  readonly trigger: ConnectorRunTrigger;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outcome: ConnectorRunOutcome;
  readonly reasonCode: ConnectorRunReasonCode;
  readonly previousContentFingerprint: string | null;
  readonly currentContentFingerprint: string | null;
  readonly connectorVersion: string;
  readonly gates: Readonly<Record<BundleGateName, false>>;
}

export type BundleGateName =
  | "data_promoted"
  | "canonical_promoted"
  | "decision_promoted"
  | "fair_to_me_promoted"
  | "live_ui_ready";

export const ALL_GATES: readonly BundleGateName[] = [
  "data_promoted",
  "canonical_promoted",
  "decision_promoted",
  "fair_to_me_promoted",
  "live_ui_ready",
];

export function allGatesFalse(): Readonly<Record<BundleGateName, false>> {
  return {
    data_promoted: false,
    canonical_promoted: false,
    decision_promoted: false,
    fair_to_me_promoted: false,
    live_ui_ready: false,
  };
}

export interface RawArtifactManifest {
  readonly manifestVersion: "raw-artifact-manifest-v1";
  readonly sourceId: DataSourceId;
  readonly contentHash: string;
  readonly contentType: string;
  readonly payloadRef: string;
  readonly provenance: ConnectorProvenance;
  readonly gates: Readonly<Record<BundleGateName, false>>;
}

export interface NormalizedArtifactManifest {
  readonly manifestVersion: "normalized-artifact-manifest-v1";
  readonly sourceId: DataSourceId;
  readonly schemaVersion: string;
  readonly transformVersion: string;
  readonly recordCount: number;
  readonly contentHash: string;
  readonly rawContentHash: string;
  readonly provenance: ConnectorProvenance;
  readonly gates: Readonly<Record<BundleGateName, false>>;
}

/**
 * One row per source in the current pass's complete snapshot —
 * `DatasetCandidateManifest.allCurrentInputs` always has exactly one entry
 * per source considered, regardless of outcome. `contentFingerprint` is
 * `null` exactly when `status` is `BLOCKED`, `FAILED` or `NOT_RUN` — a
 * blocked/missing source is never confused with an unchanged one (F4).
 */
export interface DatasetSourceSnapshotEntry {
  readonly sourceId: DataSourceId;
  readonly status: ConnectorRunOutcome;
  readonly contentFingerprint: string | null;
}

export interface DatasetCandidateManifest {
  readonly manifestVersion: "dataset-candidate-manifest-v1";
  readonly datasetCandidateId: string;
  readonly builtAt: string;
  /** Complete current snapshot — every source considered, not only the delta. */
  readonly allCurrentInputs: readonly DatasetSourceSnapshotEntry[];
  readonly changedSourceIds: readonly DataSourceId[];
  readonly unchangedSourceIds: readonly DataSourceId[];
  readonly blockedSourceIds: readonly DataSourceId[];
  readonly failedSourceIds: readonly DataSourceId[];
  readonly notRunSourceIds: readonly DataSourceId[];
  /**
   * Content-only fingerprint of the full usable snapshot (changed +
   * unchanged sources, sorted deterministically by `sourceId`) — never
   * includes `builtAt` or any other build-time timestamp, and is therefore
   * independent of input array order (F4, F3).
   */
  readonly datasetContentFingerprint: string;
  readonly connectorVersions: Readonly<Record<string, string>>;
  readonly promotion: {
    readonly status: "NOT_PROMOTED";
    readonly finalAuctionRun: false;
  };
  readonly gates: Readonly<Record<BundleGateName, false>>;
}

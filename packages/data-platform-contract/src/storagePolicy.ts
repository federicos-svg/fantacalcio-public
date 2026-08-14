import type { ArtifactKind, ArtifactStoragePolicy } from "./types.js";

export const DATA_ARTIFACT_STORAGE_POLICY: readonly ArtifactStoragePolicy[] = [
  {
    artifactKind: "raw_payload",
    primary: "OBJECT_STORAGE",
    secondary: null,
    allowedInRepository: false,
    allowedInLiveBundle: false,
    notes: "Immutable XLSX/JSON/HTML payload bytes; database stores only metadata and hashes.",
  },
  {
    artifactKind: "raw_asset_metadata",
    primary: "POSTGRES",
    secondary: null,
    allowedInRepository: false,
    allowedInLiveBundle: false,
    notes: "Source, hash, timestamps, authorization, schema fingerprint and storage path.",
  },
  {
    artifactKind: "normalized_observation",
    primary: "POSTGRES",
    secondary: null,
    allowedInRepository: false,
    allowedInLiveBundle: false,
    notes: "Typed provider-scoped observations with provenance and identity references.",
  },
  {
    artifactKind: "identity_record",
    primary: "POSTGRES",
    secondary: null,
    allowedInRepository: false,
    allowedInLiveBundle: false,
    notes: "Canonical entities, provider references, assertions, conflicts and resolutions.",
  },
  {
    artifactKind: "rule_version",
    primary: "POSTGRES",
    secondary: "REPOSITORY",
    allowedInRepository: true,
    allowedInLiveBundle: true,
    notes: "Approved rule record in DB; schema and fixtures in repo; selected immutable version may enter bundle.",
  },
  {
    artifactKind: "derived_score",
    primary: "POSTGRES",
    secondary: "PARQUET",
    allowedInRepository: false,
    allowedInLiveBundle: false,
    notes: "Historical derived results; never conflated with raw editorial observations.",
  },
  {
    artifactKind: "dataset_snapshot_metadata",
    primary: "POSTGRES",
    secondary: null,
    allowedInRepository: false,
    allowedInLiveBundle: false,
    notes: "Dataset version, cutoff, row count, input hashes and object path.",
  },
  {
    artifactKind: "feature_matrix",
    primary: "PARQUET",
    secondary: "OBJECT_STORAGE",
    allowedInRepository: false,
    allowedInLiveBundle: false,
    notes: "Columnar private training material; not row-by-row operational storage.",
  },
  {
    artifactKind: "experiment_artifact",
    primary: "OBJECT_STORAGE",
    secondary: "POSTGRES",
    allowedInRepository: false,
    allowedInLiveBundle: false,
    notes: "OOF predictions, metrics and reports in object storage; searchable manifest in DB.",
  },
  {
    artifactKind: "contract",
    primary: "REPOSITORY",
    secondary: null,
    allowedInRepository: true,
    allowedInLiveBundle: false,
    notes: "Code, schemas, contracts and redacted reports only.",
  },
  {
    artifactKind: "synthetic_fixture",
    primary: "REPOSITORY",
    secondary: null,
    allowedInRepository: true,
    allowedInLiveBundle: false,
    notes: "Invented data used for deterministic tests; never copied from a real provider payload.",
  },
  {
    artifactKind: "auction_event_log",
    primary: "LOCAL_STORAGE",
    secondary: null,
    allowedInRepository: false,
    allowedInLiveBundle: false,
    notes: "Append-only browser/local auction state; never persisted through the static bundle.",
  },
  {
    artifactKind: "live_bundle",
    primary: "LIVE_BUNDLE",
    secondary: "OBJECT_STORAGE",
    allowedInRepository: false,
    allowedInLiveBundle: true,
    notes: "Static, hash-pinned auction bundle prepared before the live session; no runtime DB query.",
  },
] as const;

export function placementForArtifact(kind: ArtifactKind): ArtifactStoragePolicy {
  const policy = DATA_ARTIFACT_STORAGE_POLICY.find((candidate) => candidate.artifactKind === kind);
  if (!policy) throw new Error(`Unknown artifact kind: ${kind}`);
  return policy;
}

export function validateStoragePolicy(
  entries: readonly ArtifactStoragePolicy[] = DATA_ARTIFACT_STORAGE_POLICY,
): readonly string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.artifactKind)) errors.push(`duplicate artifact kind: ${entry.artifactKind}`);
    seen.add(entry.artifactKind);

    if (entry.artifactKind === "raw_payload" && entry.primary !== "OBJECT_STORAGE") {
      errors.push("raw_payload must use OBJECT_STORAGE");
    }
    if (entry.artifactKind === "feature_matrix" && entry.primary !== "PARQUET") {
      errors.push("feature_matrix must use PARQUET");
    }
    if (entry.artifactKind === "live_bundle" && entry.primary !== "LIVE_BUNDLE") {
      errors.push("live_bundle must use LIVE_BUNDLE");
    }
    if (!entry.allowedInRepository && entry.primary === "REPOSITORY") {
      errors.push(`${entry.artifactKind}: REPOSITORY primary conflicts with allowedInRepository=false`);
    }
    if (!entry.allowedInLiveBundle && entry.primary === "LIVE_BUNDLE") {
      errors.push(`${entry.artifactKind}: LIVE_BUNDLE primary conflicts with allowedInLiveBundle=false`);
    }
  }

  const requiredKinds: readonly ArtifactKind[] = [
    "raw_payload",
    "raw_asset_metadata",
    "normalized_observation",
    "identity_record",
    "rule_version",
    "derived_score",
    "dataset_snapshot_metadata",
    "feature_matrix",
    "experiment_artifact",
    "contract",
    "synthetic_fixture",
    "auction_event_log",
    "live_bundle",
  ];
  for (const kind of requiredKinds) {
    if (!seen.has(kind)) errors.push(`missing artifact kind: ${kind}`);
  }

  return errors;
}

export function assertValidStoragePolicy(
  entries: readonly ArtifactStoragePolicy[] = DATA_ARTIFACT_STORAGE_POLICY,
): void {
  const errors = validateStoragePolicy(entries);
  if (errors.length > 0) throw new Error(`Invalid storage policy:\n${errors.join("\n")}`);
}

import type { LogicalEntityId, LogicalEntitySpec, LogicalLayer } from "./types.js";

const LAYER_ORDER: Readonly<Record<LogicalLayer, number>> = {
  RAW: 0,
  OBSERVATION: 1,
  IDENTITY: 2,
  RULES: 2,
  DERIVED: 3,
  DATASET: 4,
  EXPERIMENT: 5,
  LIVE_LOCAL: 6,
};

/**
 * Logical model only. It is not a migration and does not authorize a database.
 * Raw/dataset/artifact bytes are represented by metadata rows plus immutable paths;
 * placement of the bytes themselves is governed by storagePolicy.ts.
 */
export const DATA_PLATFORM_LOGICAL_MODEL: readonly LogicalEntitySpec[] = [
  {
    id: "acquisition_run",
    layer: "RAW",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: [],
    purpose: "Audit record of a source acquisition attempt, including blocked/failed runs.",
  },
  {
    id: "raw_asset",
    layer: "RAW",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: ["acquisition_run"],
    purpose: "Metadata and content-addressed object path for immutable source bytes.",
  },
  {
    id: "source_observation",
    layer: "OBSERVATION",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: ["raw_asset"],
    purpose: "Typed provider-scoped value with temporal and provenance metadata.",
  },
  {
    id: "field_season_source_evidence",
    layer: "OBSERVATION",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: [],
    purpose: "Persists tested/not-tested/partial/blocked field-season coverage separately from values.",
  },
  {
    id: "canonical_entity",
    layer: "IDENTITY",
    storage: "POSTGRES",
    appendOnly: false,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: [],
    purpose: "Internal UUID identity for player, team or coach; provider IDs remain references.",
  },
  {
    id: "source_entity_reference",
    layer: "IDENTITY",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: [],
    purpose: "Provider ID and validity interval; approved mapping exists only through identity_resolution.",
  },
  {
    id: "identity_assertion",
    layer: "IDENTITY",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: ["source_entity_reference", "source_observation"],
    purpose: "Candidate or verified evidence supporting an identity match.",
  },
  {
    id: "identity_resolution",
    layer: "IDENTITY",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: ["identity_assertion", "canonical_entity"],
    purpose: "Auditable approved mapping; supersession replaces last-write-wins.",
  },
  {
    id: "identity_conflict",
    layer: "IDENTITY",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: ["identity_assertion"],
    purpose: "Preserves competing candidates until explicit resolution.",
  },
  {
    id: "league_rule_version",
    layer: "RULES",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: [],
    purpose: "Immutable scoring and modifier configuration approved for a season.",
  },
  {
    id: "derived_fantasy_component",
    layer: "DERIVED",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: ["source_observation", "league_rule_version"],
    purpose: "Rule-derived component; distinct from the source observation.",
  },
  {
    id: "player_fantasy_score",
    layer: "DERIVED",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: ["derived_fantasy_component", "league_rule_version"],
    purpose: "Individual score computed under one exact rule version.",
  },
  {
    id: "lineup_modifier_result",
    layer: "DERIVED",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: ["source_observation", "league_rule_version"],
    purpose: "Lineup-level defence, midfield or attack modifier result.",
  },
  {
    id: "lineup_fantasy_score",
    layer: "DERIVED",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: ["player_fantasy_score", "lineup_modifier_result", "league_rule_version"],
    purpose: "Formation score after individual scores and lineup modifiers.",
  },
  {
    id: "artifact_manifest",
    layer: "DATASET",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: [],
    purpose: "Searchable content hash and private storage path; artifact bytes stay outside Postgres.",
  },
  {
    id: "dataset_snapshot",
    layer: "DATASET",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: [
      "source_observation",
      "field_season_source_evidence",
      "identity_resolution",
      "league_rule_version",
      "artifact_manifest",
    ],
    purpose: "Hash-pinned point-in-time dataset metadata referencing a Parquet artifact.",
  },
  {
    id: "experiment_run",
    layer: "EXPERIMENT",
    storage: "POSTGRES",
    appendOnly: true,
    runtimeAccess: "OFFLINE_BUILD_ONLY",
    dependsOn: ["dataset_snapshot", "artifact_manifest"],
    purpose: "Deterministic algorithm run metadata and authority cap.",
  },
  {
    id: "auction_event_log",
    layer: "LIVE_LOCAL",
    storage: "LOCAL_STORAGE",
    appendOnly: true,
    runtimeAccess: "LIVE_LOCAL_ONLY",
    dependsOn: [],
    purpose: "Append-only local auction events reduced into live state; no backend dependency.",
  },
  {
    id: "live_bundle_manifest",
    layer: "LIVE_LOCAL",
    storage: "LIVE_BUNDLE",
    appendOnly: true,
    runtimeAccess: "LIVE_LOCAL_ONLY",
    dependsOn: ["artifact_manifest"],
    purpose: "Static local bundle manifest; the live engine performs no database query.",
  },
] as const;

export function getLogicalEntity(id: LogicalEntityId): LogicalEntitySpec {
  const entity = DATA_PLATFORM_LOGICAL_MODEL.find((candidate) => candidate.id === id);
  if (!entity) throw new Error(`Unknown logical entity: ${id}`);
  return entity;
}

function findCycle(entries: readonly LogicalEntitySpec[]): readonly LogicalEntityId[] | null {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const visiting = new Set<LogicalEntityId>();
  const visited = new Set<LogicalEntityId>();
  const stack: LogicalEntityId[] = [];

  const visit = (id: LogicalEntityId): readonly LogicalEntityId[] | null => {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (visited.has(id)) return null;

    visiting.add(id);
    stack.push(id);
    const entity = byId.get(id);
    if (entity) {
      for (const dependency of entity.dependsOn) {
        const cycle = visit(dependency);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  };

  for (const entry of entries) {
    const cycle = visit(entry.id);
    if (cycle) return cycle;
  }
  return null;
}

export function validateLogicalModel(
  entries: readonly LogicalEntitySpec[] = DATA_PLATFORM_LOGICAL_MODEL,
): readonly string[] {
  const errors: string[] = [];
  const byId = new Map<LogicalEntityId, LogicalEntitySpec>();

  for (const entry of entries) {
    if (byId.has(entry.id)) errors.push(`duplicate logical entity: ${entry.id}`);
    byId.set(entry.id, entry);
  }

  for (const entry of entries) {
    for (const dependencyId of entry.dependsOn) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        errors.push(`${entry.id}: missing dependency ${dependencyId}`);
        continue;
      }
      if (LAYER_ORDER[dependency.layer] > LAYER_ORDER[entry.layer]) {
        errors.push(`${entry.id}: dependency ${dependencyId} points to a later layer`);
      }
    }

    if (
      entry.runtimeAccess === "LIVE_LOCAL_ONLY" &&
      entry.storage !== "LIVE_BUNDLE" &&
      entry.storage !== "LOCAL_STORAGE" &&
      entry.storage !== "REPOSITORY"
    ) {
      errors.push(`${entry.id}: live-local entity cannot require ${entry.storage}`);
    }
  }

  const requiredIds: readonly LogicalEntityId[] = [
    "acquisition_run",
    "raw_asset",
    "source_observation",
    "field_season_source_evidence",
    "canonical_entity",
    "source_entity_reference",
    "identity_assertion",
    "identity_resolution",
    "identity_conflict",
    "league_rule_version",
    "derived_fantasy_component",
    "player_fantasy_score",
    "lineup_modifier_result",
    "lineup_fantasy_score",
    "artifact_manifest",
    "dataset_snapshot",
    "experiment_run",
    "auction_event_log",
    "live_bundle_manifest",
  ];
  for (const id of requiredIds) {
    if (!byId.has(id)) errors.push(`missing logical entity: ${id}`);
  }

  const cycle = findCycle(entries);
  if (cycle) errors.push(`dependency cycle: ${cycle.join(" -> ")}`);

  return errors;
}

export function validateScoringSeparation(
  entries: readonly LogicalEntitySpec[] = DATA_PLATFORM_LOGICAL_MODEL,
): readonly string[] {
  const errors: string[] = [];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  const requireDependencies = (id: LogicalEntityId, expected: readonly LogicalEntityId[]) => {
    const entity = byId.get(id);
    if (!entity) {
      errors.push(`missing scoring entity: ${id}`);
      return;
    }
    for (const dependency of expected) {
      if (!entity.dependsOn.includes(dependency)) {
        errors.push(`${id}: missing dependency ${dependency}`);
      }
    }
  };

  requireDependencies("derived_fantasy_component", ["source_observation", "league_rule_version"]);
  requireDependencies("player_fantasy_score", ["derived_fantasy_component", "league_rule_version"]);
  requireDependencies("lineup_modifier_result", ["source_observation", "league_rule_version"]);
  requireDependencies("lineup_fantasy_score", [
    "player_fantasy_score",
    "lineup_modifier_result",
    "league_rule_version",
  ]);

  return errors;
}

export function assertValidLogicalModel(
  entries: readonly LogicalEntitySpec[] = DATA_PLATFORM_LOGICAL_MODEL,
): void {
  const errors = [...validateLogicalModel(entries), ...validateScoringSeparation(entries)];
  if (errors.length > 0) throw new Error(`Invalid logical model:\n${errors.join("\n")}`);
}

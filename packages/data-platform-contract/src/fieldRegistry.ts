import type {
  DataFieldId,
  DataOriginId,
  FieldProviderDeclaration,
  FieldRegistryEntry,
  TemporalField,
} from "./types.js";

const FORBIDDEN_ALIASES = ["rating", "value", "score", "vote", "voto"] as const;
const FULL_TIME: readonly TemporalField[] = [
  "effective_at",
  "observed_at",
  "available_at",
  "ingested_at",
];
const DERIVED_TIME: readonly TemporalField[] = ["effective_at", "available_at", "ingested_at"];

function provider(
  sourceId: DataOriginId,
  providerScopedName: string,
  role: FieldProviderDeclaration["role"],
  coverageStatus: FieldProviderDeclaration["coverageStatus"],
): FieldProviderDeclaration {
  return { sourceId, providerScopedName, role, coverageStatus };
}

function field(
  entry: Omit<FieldRegistryEntry, "forbiddenAliases" | "primaryStorage"> &
    Partial<Pick<FieldRegistryEntry, "forbiddenAliases" | "primaryStorage">>,
): FieldRegistryEntry {
  return {
    ...entry,
    primaryStorage: entry.primaryStorage ?? "POSTGRES",
    forbiddenAliases: entry.forbiddenAliases ?? FORBIDDEN_ALIASES,
  };
}

export const DATA_FIELD_REGISTRY: readonly FieldRegistryEntry[] = [
  field({
    id: "fantacalcio_base_vote", semanticName: "Fantacalcio editorial base vote",
    family: "editorial_vote", granularity: "PLAYER_MATCH", algorithmUse: "TARGET",
    providers: [provider("fantacalcio_votes", "fantacalcio_base_vote", "GROUND_TRUTH", "COMPLETE")],
    requiredTimestamps: FULL_TIME, notes: "Editorial observation, not fantasy score.",
  }),
  field({
    id: "fantacalcio_component", semanticName: "Fantacalcio editorial bonus/malus component",
    family: "editorial_component", granularity: "PLAYER_MATCH", algorithmUse: "TARGET",
    providers: [provider("fantacalcio_votes", "fantacalcio_component_observation", "GROUND_TRUTH", "COMPLETE")],
    requiredTimestamps: FULL_TIME, notes: "Observation remains separate from scoring rule.",
  }),
  field({
    id: "league_rule_version", semanticName: "Immutable league scoring-rule version",
    family: "league_rule", granularity: "LEAGUE_SEASON", algorithmUse: "RULE",
    providers: [provider("league_manual", "league_rule_version", "RULE_AUTHORITY", "MANUAL_ONLY")],
    requiredTimestamps: FULL_TIME, notes: "Manual authority, never inferred from results.",
  }),
  field({
    id: "fantacalcio_player_score", semanticName: "Rule-derived individual fantasy score",
    family: "derived_fantasy_score", granularity: "PLAYER_MATCH", algorithmUse: "TARGET",
    providers: [provider("internal_derivation", "fantacalcio_player_score", "DERIVATION", "DERIVED_ONLY")],
    requiredTimestamps: DERIVED_TIME, notes: "Derived from exact observations and rule version.",
  }),
  field({
    id: "lineup_modifier_result", semanticName: "Historical lineup modifier result",
    family: "derived_fantasy_score", granularity: "LINEUP_MATCH", algorithmUse: "TARGET",
    providers: [provider("internal_derivation", "lineup_modifier_result", "DERIVATION", "DERIVED_ONLY")],
    requiredTimestamps: DERIVED_TIME, notes: "Not the pre-auction Modifier Value model.",
  }),
  field({
    id: "lineup_fantasy_score", semanticName: "Rule-derived lineup fantasy score",
    family: "derived_fantasy_score", granularity: "LINEUP_MATCH", algorithmUse: "TARGET",
    providers: [provider("internal_derivation", "lineup_fantasy_score", "DERIVATION", "DERIVED_ONLY")],
    requiredTimestamps: DERIVED_TIME, notes: "Player scores plus lineup modifiers.",
  }),
  field({
    id: "listone_role", semanticName: "Current Fantacalcio Classic role",
    family: "listone", granularity: "PLAYER_SNAPSHOT", algorithmUse: "DISPLAY_ONLY",
    providers: [provider("fantacalcio_listone", "fantacalcio_listone_role", "LOCAL_AUTHORITY", "LOCAL_ONLY")],
    requiredTimestamps: FULL_TIME, notes: "Snapshot-scoped; never overwrite history.",
  }),
  field({
    id: "listone_quotation", semanticName: "Current Fantacalcio listone quotation",
    family: "listone", granularity: "PLAYER_SNAPSHOT", algorithmUse: "DISPLAY_ONLY",
    providers: [provider("fantacalcio_listone", "fantacalcio_listone_quotation", "LOCAL_AUTHORITY", "LOCAL_ONLY")],
    requiredTimestamps: FULL_TIME, notes: "Display-only, never exact market-price target.",
  }),
  field({
    id: "player_identity_core", semanticName: "Provider identity evidence",
    family: "player_identity", granularity: "PLAYER_SNAPSHOT", algorithmUse: "NOT_FOR_MODEL",
    providers: [
      provider("fantacalcio_votes", "fantacalcio_player_identity_core", "IDENTITY_SEED", "COMPLETE"),
      provider("api_football", "api_football_player_identity_core", "CROSS_CHECK", "PARTIAL"),
      provider("wikidata", "wikidata_player_identity_core", "CROSS_CHECK", "NOT_TESTED"),
    ],
    requiredTimestamps: FULL_TIME, notes: "Provider IDs remain references, never canonical UUIDs.",
  }),
  field({
    id: "player_date_of_birth", semanticName: "Player birth-date observation",
    family: "player_identity", granularity: "PLAYER_SNAPSHOT", algorithmUse: "FEATURE",
    providers: [
      provider("api_football", "api_football_birth_date", "CROSS_CHECK", "PARTIAL"),
      provider("wikidata", "wikidata_birth_date", "CROSS_CHECK", "NOT_TESTED"),
    ],
    requiredTimestamps: FULL_TIME, notes: "Requires precision and reference-date policy.",
  }),
  field({
    id: "team_season_membership", semanticName: "Player-team season membership",
    family: "team_season", granularity: "PLAYER_SEASON", algorithmUse: "FEATURE",
    providers: [
      provider("api_football", "api_football_team_season", "CROSS_CHECK", "SNAPSHOT_ONLY"),
    ],
    requiredTimestamps: FULL_TIME, notes: "Current squad state cannot be projected backward.",
  }),
  field({
    id: "player_appearances", semanticName: "Provider season appearances",
    family: "player_season_stat", granularity: "PLAYER_SEASON", algorithmUse: "FEATURE",
    providers: [
      provider("api_football", "api_football_appearances", "CROSS_CHECK", "PARTIAL"),
    ],
    requiredTimestamps: FULL_TIME, notes: "Missing never silently becomes zero.",
  }),
  field({
    id: "player_minutes", semanticName: "Provider season minutes",
    family: "player_season_stat", granularity: "PLAYER_SEASON", algorithmUse: "FEATURE",
    providers: [
      provider("api_football", "api_football_minutes", "CROSS_CHECK", "PARTIAL"),
    ],
    requiredTimestamps: FULL_TIME, notes: "Coverage and point-in-time eligibility are separate.",
  }),
  field({
    id: "player_starts", semanticName: "Provider season starts",
    family: "player_season_stat", granularity: "PLAYER_SEASON", algorithmUse: "FEATURE",
    providers: [
      provider("api_football", "api_football_starts", "CROSS_CHECK", "NOT_TESTED"),
    ],
    requiredTimestamps: FULL_TIME, notes: "No effective source without field-season pilot.",
  }),
  field({
    id: "player_substitute_appearances", semanticName: "Provider substitute appearances",
    family: "player_season_stat", granularity: "PLAYER_SEASON", algorithmUse: "FEATURE",
    providers: [
      provider("api_football", "api_football_substitute_appearances", "CROSS_CHECK", "NOT_TESTED"),
    ],
    requiredTimestamps: FULL_TIME, notes: "Kept separate from starts and total appearances.",
  }),
  field({
    id: "api_football_rating", semanticName: "API-Football provider rating",
    family: "player_match_stat", granularity: "PLAYER_MATCH", algorithmUse: "FEATURE",
    providers: [provider("api_football", "api_football_rating", "PRIMARY_CANDIDATE", "PARTIAL")],
    requiredTimestamps: FULL_TIME, notes: "Never aliases Fantacalcio vote or target.",
  }),
  field({
    id: "transfer_event", semanticName: "Provider player transfer event",
    family: "transfer_event", granularity: "PLAYER_SNAPSHOT", algorithmUse: "FEATURE",
    providers: [
      provider("api_football", "api_football_transfer_event", "CROSS_CHECK", "NOT_TESTED"),
    ],
    requiredTimestamps: FULL_TIME, notes: "Append-only historical event.",
  }),
  field({
    id: "injury_absence", semanticName: "Provider injury/absence/suspension observation",
    family: "absence", granularity: "PLAYER_MATCH", algorithmUse: "FEATURE",
    providers: [
      provider("api_football", "api_football_injury_absence", "PRIMARY_CANDIDATE", "PARTIAL"),
    ],
    requiredTimestamps: FULL_TIME, notes: "Subtype and provenance remain explicit.",
  }),
  field({
    id: "coach_tenure", semanticName: "Coach-team tenure interval",
    family: "coach_tenure", granularity: "TEAM_SEASON", algorithmUse: "FEATURE",
    providers: [
      provider("api_football", "api_football_coach_tenure", "CROSS_CHECK", "SNAPSHOT_ONLY"),
    ],
    requiredTimestamps: FULL_TIME, notes: "Current coach is not historical tenure.",
  }),
  field({
    id: "league_standing", semanticName: "League-season standing row",
    family: "standing", granularity: "TEAM_SEASON", algorithmUse: "FEATURE",
    providers: [
      provider("api_football", "api_football_standing", "PRIMARY_CANDIDATE", "PARTIAL"),
    ],
    requiredTimestamps: FULL_TIME, notes: "Existing standings foundation remains the first physical implementation.",
  }),
  field({
    id: "auction_event", semanticName: "Append-only local auction event",
    family: "auction_event", granularity: "AUCTION_EVENT", algorithmUse: "LIVE_STATE",
    providers: [provider("auction_event_log", "auction_event", "LOCAL_AUTHORITY", "LOCAL_ONLY")],
    requiredTimestamps: ["effective_at", "ingested_at"], primaryStorage: "LOCAL_STORAGE",
    notes: "State is reduced locally; backend persistence is not required.",
  }),
] as const;

export function getField(id: DataFieldId): FieldRegistryEntry {
  const entry = DATA_FIELD_REGISTRY.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown data field: ${id}`);
  return entry;
}

export function validateFieldRegistry(
  entries: readonly FieldRegistryEntry[] = DATA_FIELD_REGISTRY,
): readonly string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const ambiguous = new Set<string>(FORBIDDEN_ALIASES);
  const prefixes: Partial<Record<DataOriginId, string>> = {
    fantacalcio_votes: "fantacalcio_",
    fantacalcio_listone: "fantacalcio_",
    api_football: "api_football_",
    wikidata: "wikidata_",
  };

  for (const entry of entries) {
    if (seen.has(entry.id)) errors.push(`duplicate field id: ${entry.id}`);
    seen.add(entry.id);
    if (entry.providers.length === 0) errors.push(`${entry.id}: no providers declared`);
    if (new Set(entry.requiredTimestamps).size !== entry.requiredTimestamps.length) {
      errors.push(`${entry.id}: duplicate timestamp declaration`);
    }
    if (
      (entry.algorithmUse === "TARGET" || entry.algorithmUse === "FEATURE") &&
      !entry.requiredTimestamps.includes("available_at")
    ) {
      errors.push(`${entry.id}: ${entry.algorithmUse} requires available_at`);
    }

    for (const source of entry.providers) {
      const name = source.providerScopedName.toLowerCase();
      if (ambiguous.has(name)) errors.push(`${entry.id}: ambiguous provider field name ${name}`);
      if (source.role === "GROUND_TRUTH" && source.sourceId !== "fantacalcio_votes") {
        errors.push(`${entry.id}: only fantacalcio_votes may provide GROUND_TRUTH`);
      }
      if (source.role === "RULE_AUTHORITY" && source.sourceId !== "league_manual") {
        errors.push(`${entry.id}: only league_manual may provide RULE_AUTHORITY`);
      }
      if (source.role === "DERIVATION" && source.sourceId !== "internal_derivation") {
        errors.push(`${entry.id}: DERIVATION requires internal_derivation origin`);
      }
      if (source.sourceId === "internal_derivation" && source.role !== "DERIVATION") {
        errors.push(`${entry.id}: internal_derivation requires DERIVATION role`);
      }
      const prefix = prefixes[source.sourceId];
      if (prefix && !name.startsWith(prefix)) {
        errors.push(`${entry.id}: ${source.sourceId} field must start with ${prefix}`);
      }
      if (
        entry.algorithmUse === "TARGET" &&
        !((source.sourceId === "fantacalcio_votes" && source.role === "GROUND_TRUTH") ||
          (source.sourceId === "internal_derivation" && source.role === "DERIVATION"))
      ) {
        errors.push(`${entry.id}: ${source.sourceId} cannot provide a TARGET`);
      }
    }

    if (
      entry.providers.some((source) => source.sourceId === "internal_derivation") &&
      entry.family !== "derived_fantasy_score"
    ) {
      errors.push(`${entry.id}: internal derivation is only valid for derived_fantasy_score`);
    }
  }

  const requiredIds: readonly DataFieldId[] = [
    "fantacalcio_base_vote", "fantacalcio_component", "fantacalcio_player_score",
    "league_rule_version", "lineup_modifier_result", "lineup_fantasy_score",
    "listone_role", "listone_quotation", "player_identity_core", "player_date_of_birth",
    "team_season_membership", "player_appearances", "player_minutes", "player_starts",
    "player_substitute_appearances", "api_football_rating",
    "transfer_event", "injury_absence", "coach_tenure", "league_standing", "auction_event",
  ];
  for (const id of requiredIds) if (!seen.has(id)) errors.push(`missing required field: ${id}`);
  return errors;
}

export function assertValidFieldRegistry(
  entries: readonly FieldRegistryEntry[] = DATA_FIELD_REGISTRY,
): void {
  const errors = validateFieldRegistry(entries);
  if (errors.length > 0) throw new Error(`Invalid field registry:\n${errors.join("\n")}`);
}

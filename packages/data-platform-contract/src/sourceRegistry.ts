import type { DataSourceId, SourceRegistryEntry } from "./types.js";
import { SOURCE_EVIDENCE_REFS } from "./sourceEvidence.js";

/**
 * V1 is deliberately scoped to sources already present in the canonical project files.
 * Adding a source requires evidence, authorization state and field-level declarations;
 * technical reachability alone never grants authority.
 */
export const DATA_SOURCE_REGISTRY: readonly SourceRegistryEntry[] = [
  {
    id: "fantacalcio_votes",
    label: "Fantacalcio historical editorial votes",
    priority: "MUST",
    state: "AVAILABLE_PRIVATE",
    evidenceKind: "REAL_PAYLOAD",
    authorityRoles: ["GROUND_TRUTH"],
    dataFamilies: ["editorial_vote", "editorial_component"],
    refreshCadence: "PER_MATCHDAY",
    requiredForLiveMvp: false,
    requiredForCoreValue: true,
    canBlockEnrichedBackfill: true,
    evidenceRefs: SOURCE_EVIDENCE_REFS.fantacalcio_votes,
    notes:
      "Authoritative target/ground truth for vote-dependent modelling; never replaced by provider ratings.",
  },
  {
    id: "fantacalcio_listone",
    label: "Fantacalcio current-season listone",
    priority: "MUST",
    state: "ACTIVE_REAL",
    evidenceKind: "REAL_PAYLOAD",
    authorityRoles: ["DISPLAY_ONLY"],
    dataFamilies: ["listone"],
    refreshCadence: "DAILY",
    requiredForLiveMvp: true,
    requiredForCoreValue: false,
    canBlockEnrichedBackfill: false,
    evidenceRefs: SOURCE_EVIDENCE_REFS.fantacalcio_listone,
    notes:
      "Current roster/role/quotation snapshot. Quotation is display-only and not a market-price target.",
  },
  {
    id: "league_manual",
    label: "Versioned league rules supplied by Owner",
    priority: "MUST",
    state: "AVAILABLE_PRIVATE",
    evidenceKind: "MANUAL_DECLARATION",
    authorityRoles: ["RULE_AUTHORITY"],
    dataFamilies: ["league_rule"],
    refreshCadence: "PER_SEASON",
    requiredForLiveMvp: false,
    requiredForCoreValue: false,
    canBlockEnrichedBackfill: true,
    evidenceRefs: SOURCE_EVIDENCE_REFS.league_manual,
    notes:
      "Required for rule-derived targets and Modifier work, but not for B1 or a base-vote-only exploratory pipeline.",
  },
  {
    id: "api_football",
    label: "API-Football structured provider",
    priority: "SHOULD",
    state: "PARTIAL_REAL",
    evidenceKind: "REAL_PAYLOAD",
    authorityRoles: ["FEATURE_CANDIDATE", "CROSS_CHECK"],
    dataFamilies: [
      "player_identity",
      "team_season",
      "player_match_stat",
      "player_season_stat",
      "standing",
      "transfer_event",
      "absence",
      "coach_tenure",
    ],
    refreshCadence: "DAILY",
    requiredForLiveMvp: false,
    requiredForCoreValue: false,
    canBlockEnrichedBackfill: false,
    evidenceRefs: SOURCE_EVIDENCE_REFS.api_football,
    notes:
      "Verified only for scoped cells/seasons. Missing, snapshot-only and plan-restricted states stay explicit.",
  },
  {
    id: "transfermarkt",
    label: "Transfermarkt historical feature candidate",
    priority: "BLOCKED",
    state: "BLOCKED_TECHNICAL",
    evidenceKind: "CONTRACT_ONLY",
    authorityRoles: ["FEATURE_CANDIDATE", "CROSS_CHECK"],
    dataFamilies: [
      "player_identity",
      "team_season",
      "player_season_stat",
      "standing",
      "transfer_event",
      "absence",
      "coach_tenure",
      "market_value",
    ],
    refreshCadence: "PER_SEASON",
    requiredForLiveMvp: false,
    requiredForCoreValue: false,
    canBlockEnrichedBackfill: true,
    evidenceRefs: SOURCE_EVIDENCE_REFS.transfermarkt,
    notes:
      "Candidate architecture only until a compliant real pilot reaches the source. No scraping bypasses.",
  },
  {
    id: "wikidata",
    label: "Wikidata identity and birth-date candidate",
    priority: "LATER",
    state: "BLOCKED_TECHNICAL",
    evidenceKind: "CONTRACT_ONLY",
    authorityRoles: ["CROSS_CHECK"],
    dataFamilies: ["player_identity"],
    refreshCadence: "PER_SEASON",
    requiredForLiveMvp: false,
    requiredForCoreValue: false,
    canBlockEnrichedBackfill: false,
    evidenceRefs: SOURCE_EVIDENCE_REFS.wikidata,
    notes:
      "Optional identity enrichment. It cannot block the live MVP or the first vote-only scouting runs.",
  },
  {
    id: "gruppo_esperti_topic_unico",
    label: "Gruppo Esperti team Topic Unico qualitative source",
    priority: "SHOULD",
    state: "NOT_TESTED",
    evidenceKind: "CONTRACT_ONLY",
    authorityRoles: ["EXPERT_OPINION", "CROSS_CHECK"],
    dataFamilies: ["expert_opinion"],
    refreshCadence: "MANUAL",
    requiredForLiveMvp: false,
    requiredForCoreValue: false,
    canBlockEnrichedBackfill: false,
    evidenceRefs: SOURCE_EVIDENCE_REFS.gruppo_esperti_topic_unico,
    notes:
      "Only [TOPIC UNICO] team threads are in scope. Verified expert/staff posts may become qualitative cross-check observations after provenance and authorization review; community posts are not expert authority. No scraping is authorized.",
  },
  {
    id: "auction_event_log",
    label: "Local append-only auction event log",
    priority: "MUST",
    state: "LOCAL_RUNTIME",
    evidenceKind: "LOCAL_RUNTIME",
    authorityRoles: ["LIVE_STATE"],
    dataFamilies: ["auction_event"],
    refreshCadence: "EVENT_DRIVEN",
    requiredForLiveMvp: true,
    requiredForCoreValue: false,
    canBlockEnrichedBackfill: false,
    evidenceRefs: SOURCE_EVIDENCE_REFS.auction_event_log,
    notes:
      "Canonical live state is derived locally via reduce(event_log); no backend dependency in the auction path.",
  },
] as const;

export function getSource(id: DataSourceId): SourceRegistryEntry {
  const entry = DATA_SOURCE_REGISTRY.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown source: ${id}`);
  return entry;
}

export function validateSourceRegistry(
  entries: readonly SourceRegistryEntry[] = DATA_SOURCE_REGISTRY,
): readonly string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.id)) errors.push(`duplicate source id: ${entry.id}`);
    seen.add(entry.id);

    if (entry.evidenceRefs.length === 0) errors.push(`${entry.id}: missing evidenceRefs`);
    if (entry.authorityRoles.length === 0) errors.push(`${entry.id}: missing authority role`);
    if (entry.dataFamilies.length === 0) errors.push(`${entry.id}: missing data family`);

    const liveReadyStates = new Set(["AVAILABLE_PRIVATE", "ACTIVE_REAL", "LOCAL_RUNTIME"]);
    const coreValueReadyStates = new Set(["AVAILABLE_PRIVATE", "ACTIVE_REAL"]);
    if (entry.requiredForLiveMvp && !liveReadyStates.has(entry.state)) {
      errors.push(`${entry.id}: state ${entry.state} cannot satisfy live MVP`);
    }
    if (entry.requiredForCoreValue && !coreValueReadyStates.has(entry.state)) {
      errors.push(`${entry.id}: state ${entry.state} cannot satisfy core Value`);
    }
    if (entry.priority === "BLOCKED" && entry.state !== "BLOCKED_TECHNICAL") {
      errors.push(`${entry.id}: BLOCKED priority requires BLOCKED_TECHNICAL state`);
    }
    if (entry.authorityRoles.includes("GROUND_TRUTH") && entry.id !== "fantacalcio_votes") {
      errors.push(`${entry.id}: only fantacalcio_votes may be GROUND_TRUTH`);
    }
    if (entry.authorityRoles.includes("RULE_AUTHORITY") && entry.id !== "league_manual") {
      errors.push(`${entry.id}: only league_manual may be RULE_AUTHORITY`);
    }
    if (entry.authorityRoles.includes("EXPERT_OPINION") && entry.id !== "gruppo_esperti_topic_unico") {
      errors.push(`${entry.id}: only gruppo_esperti_topic_unico may be EXPERT_OPINION`);
    }
    if (entry.authorityRoles.includes("LIVE_STATE") && entry.id !== "auction_event_log") {
      errors.push(`${entry.id}: only auction_event_log may be LIVE_STATE`);
    }
  }

  const requiredIds: readonly DataSourceId[] = [
    "fantacalcio_votes",
    "fantacalcio_listone",
    "league_manual",
    "api_football",
    "transfermarkt",
    "wikidata",
    "gruppo_esperti_topic_unico",
    "auction_event_log",
  ];
  for (const id of requiredIds) {
    if (!seen.has(id)) errors.push(`missing required source: ${id}`);
  }

  return errors;
}

export function assertValidSourceRegistry(
  entries: readonly SourceRegistryEntry[] = DATA_SOURCE_REGISTRY,
): void {
  const errors = validateSourceRegistry(entries);
  if (errors.length > 0) throw new Error(`Invalid source registry:\n${errors.join("\n")}`);
}

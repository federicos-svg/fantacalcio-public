import type {
  FieldSeasonSourceEvidence,
  PointInTimeFeatureDeclaration,
  ProvenanceRecord,
} from "../src/types.js";

// All entity names/IDs below are fictitious. No real Transfermarkt or API-Football
// payload, player, club or coach appears in this file.

export const syntheticCompleteEvidence: FieldSeasonSourceEvidence = {
  field: "standings",
  season: "2023_24",
  source: "api_football",
  tested: true,
  accessible: true,
  planRestricted: false,
  acceptsSeasonParameter: true,
  retroactiveOverlayRisk: false,
  recordCount: 20,
  expectedMinimumRecordCount: 20,
};

export const syntheticPartialEvidence: FieldSeasonSourceEvidence = {
  field: "players_roster",
  season: "2023_24",
  source: "api_football",
  tested: true,
  accessible: true,
  planRestricted: false,
  acceptsSeasonParameter: true,
  retroactiveOverlayRisk: false,
  recordCount: 60,
  expectedMinimumRecordCount: 500,
};

export const syntheticPlanRestrictedEvidence: FieldSeasonSourceEvidence = {
  field: "standings",
  season: "2025_26",
  source: "api_football",
  tested: true,
  accessible: false,
  planRestricted: true,
  acceptsSeasonParameter: true,
  retroactiveOverlayRisk: false,
  recordCount: null,
  expectedMinimumRecordCount: 20,
};

export const syntheticSnapshotOnlyEvidence: FieldSeasonSourceEvidence = {
  field: "squad_roster",
  season: "2020_21",
  source: "api_football",
  tested: true,
  accessible: true,
  planRestricted: false,
  acceptsSeasonParameter: false,
  retroactiveOverlayRisk: false,
  recordCount: 25,
  expectedMinimumRecordCount: 20,
};

export const syntheticNotHistoricalEvidence: FieldSeasonSourceEvidence = {
  field: "squad_roster_by_season",
  season: "2018_19",
  source: "transfermarkt",
  tested: true,
  accessible: true,
  planRestricted: false,
  acceptsSeasonParameter: true,
  retroactiveOverlayRisk: true,
  recordCount: 25,
  expectedMinimumRecordCount: 20,
};

export const syntheticNotTestedEvidence: FieldSeasonSourceEvidence = {
  field: "injuries",
  season: "2015_16",
  source: "transfermarkt",
  tested: false,
  accessible: false,
  planRestricted: false,
  acceptsSeasonParameter: true,
  retroactiveOverlayRisk: false,
  recordCount: null,
  expectedMinimumRecordCount: null,
};

export const syntheticMissingBySourceEvidence: FieldSeasonSourceEvidence = {
  field: "transfers_league_wide",
  season: "2022_23",
  source: "api_football",
  tested: true,
  accessible: false,
  planRestricted: false,
  acceptsSeasonParameter: true,
  retroactiveOverlayRisk: false,
  recordCount: null,
  expectedMinimumRecordCount: 200,
};

// Single canonical representation: the nested ProvenanceRecord is always derived
// from the same fields as the declaration itself, so the two can never drift apart
// by construction. Do not build a PointInTimeFeatureDeclaration by hand elsewhere in
// this file — always go through this builder (finding 2: declaration/provenance
// coherence must be guaranteed, not just hoped for).
function pointInTimeDeclaration(input: {
  feature: string;
  source: ProvenanceRecord["source"];
  sourceEntityId: string;
  season: string;
  observedAt: string;
  availableAt: string;
  cutoffAt: string;
  snapshotClassification: ProvenanceRecord["snapshotClassification"];
  transformVersion: string;
  missingnessStatus: ProvenanceRecord["missingnessStatus"];
  conflictStatus: ProvenanceRecord["conflictStatus"];
}): PointInTimeFeatureDeclaration {
  const provenance: ProvenanceRecord = {
    source: input.source,
    sourceEntityId: input.sourceEntityId,
    season: input.season,
    observedAt: input.observedAt,
    availableAt: input.availableAt,
    cutoffAt: input.cutoffAt,
    snapshotClassification: input.snapshotClassification,
    transformVersion: input.transformVersion,
    missingnessStatus: input.missingnessStatus,
    conflictStatus: input.conflictStatus,
  };
  return { ...input, provenance };
}

export const syntheticBuildablePointInTime: PointInTimeFeatureDeclaration =
  pointInTimeDeclaration({
    feature: "transfermarkt_appearances_prev_season",
    source: "transfermarkt",
    sourceEntityId: "synthetic_player_001",
    season: "2023_24",
    observedAt: "2024-06-01T00:00:00Z",
    availableAt: "2024-06-01T00:00:00Z",
    cutoffAt: "2024-08-25T00:00:00Z",
    snapshotClassification: "HISTORICAL_EVENT_LOG",
    transformVersion: "hybrid-dataset-contract@1.0.0",
    missingnessStatus: "present",
    conflictStatus: "no_conflict",
  });

export const syntheticLeakageAfterCutoff: PointInTimeFeatureDeclaration =
  pointInTimeDeclaration({
    feature: "api_football_rating_target_season",
    source: "api_football",
    sourceEntityId: "synthetic_player_002",
    season: "2024_25",
    observedAt: "2025-05-01T00:00:00Z",
    availableAt: "2025-05-01T00:00:00Z",
    cutoffAt: "2024-08-25T00:00:00Z",
    snapshotClassification: "HISTORICAL_EVENT_LOG",
    transformVersion: "hybrid-dataset-contract@1.0.0",
    missingnessStatus: "present",
    conflictStatus: "no_conflict",
  });

// observedAt is deliberately far in the future relative to availableAt/cutoffAt: this
// represents a *current* squad snapshot (queried in 2026) being misused as if it were
// historical 2016/17 data. CURRENT_VALUE_ONLY forces LEAKAGE_RISK regardless of the
// availableAt-vs-cutoff comparison — see classifyPointInTime.
export const syntheticLeakageCurrentValueOverlay: PointInTimeFeatureDeclaration =
  pointInTimeDeclaration({
    feature: "team_context_current_squad_overlay",
    source: "transfermarkt",
    sourceEntityId: "synthetic_player_003",
    season: "2016_17",
    observedAt: "2026-07-01T00:00:00Z",
    availableAt: "2016-08-01T00:00:00Z",
    cutoffAt: "2016-08-25T00:00:00Z",
    snapshotClassification: "CURRENT_VALUE_ONLY",
    transformVersion: "hybrid-dataset-contract@1.0.0",
    missingnessStatus: "present",
    conflictStatus: "no_conflict",
  });

export const syntheticNotBuildableMissing: PointInTimeFeatureDeclaration =
  pointInTimeDeclaration({
    feature: "transfermarkt_injuries_history",
    source: "transfermarkt",
    sourceEntityId: "synthetic_player_004",
    season: "2015_16",
    observedAt: "2015-08-01T00:00:00Z",
    availableAt: "2015-08-01T00:00:00Z",
    cutoffAt: "2015-08-25T00:00:00Z",
    snapshotClassification: "UNKNOWN",
    transformVersion: "hybrid-dataset-contract@1.0.0",
    missingnessStatus: "missing_not_tested",
    conflictStatus: "no_conflict",
  });

export const syntheticAvailableEqualsCutoff: PointInTimeFeatureDeclaration =
  pointInTimeDeclaration({
    feature: "transfermarkt_transfer_event_at_cutoff",
    source: "transfermarkt",
    sourceEntityId: "synthetic_player_005",
    season: "2023_24",
    observedAt: "2024-08-25T00:00:00Z",
    availableAt: "2024-08-25T00:00:00Z",
    cutoffAt: "2024-08-25T00:00:00Z",
    snapshotClassification: "HISTORICAL_EVENT_LOG",
    transformVersion: "hybrid-dataset-contract@1.0.0",
    missingnessStatus: "present",
    conflictStatus: "no_conflict",
  });

// Deliberately invalid: observedAt is not a parseable ISO-8601 timestamp at all.
export const syntheticInvalidObservedAt: PointInTimeFeatureDeclaration =
  pointInTimeDeclaration({
    feature: "invalid_observed_at_case",
    source: "transfermarkt",
    sourceEntityId: "synthetic_player_006",
    season: "2023_24",
    observedAt: "not-a-timestamp",
    availableAt: "2024-06-01T00:00:00Z",
    cutoffAt: "2024-08-25T00:00:00Z",
    snapshotClassification: "HISTORICAL_EVENT_LOG",
    transformVersion: "hybrid-dataset-contract@1.0.0",
    missingnessStatus: "present",
    conflictStatus: "no_conflict",
  });

// Deliberately invalid: availableAt has no timezone designator (ambiguous/local time,
// rejected by the strict ISO-8601 validator even though `new Date()` would accept it).
export const syntheticTimezoneInvalid: PointInTimeFeatureDeclaration =
  pointInTimeDeclaration({
    feature: "timezone_invalid_case",
    source: "transfermarkt",
    sourceEntityId: "synthetic_player_007",
    season: "2023_24",
    observedAt: "2024-06-01T00:00:00Z",
    availableAt: "2024-06-01T00:00:00",
    cutoffAt: "2024-08-25T00:00:00Z",
    snapshotClassification: "HISTORICAL_EVENT_LOG",
    transformVersion: "hybrid-dataset-contract@1.0.0",
    missingnessStatus: "present",
    conflictStatus: "no_conflict",
  });

// Deliberately incoherent: the declaration disagrees with its own nested provenance
// on `season` (the exact class of bug this batch's review caught in the previous
// fixtures — never built by hand except here, on purpose, for the negative test).
export const syntheticProvenanceMismatch: PointInTimeFeatureDeclaration = {
  ...syntheticBuildablePointInTime,
  provenance: {
    ...syntheticBuildablePointInTime.provenance,
    season: "2019_20",
  },
};

// Deliberately untyped: simulates an external/untrusted caller that does not go
// through the TypeScript type system (e.g. JSON parsed from a manifest). Cast is
// intentional — classifyPointInTime must fail closed on this at runtime, since the
// type system cannot protect against it in that scenario.
export const syntheticMissingObservedAt = {
  ...syntheticBuildablePointInTime,
  observedAt: undefined,
} as unknown as PointInTimeFeatureDeclaration;

// Deliberately invalid: 30 February does not exist in any year — must be rejected,
// never silently rolled over to 1/2 March the way `new Date()` alone would do it
// (finding 2, round 3).
export const syntheticInvalidFeb30: PointInTimeFeatureDeclaration = pointInTimeDeclaration({
  feature: "invalid_feb_30_case",
  source: "transfermarkt",
  sourceEntityId: "synthetic_player_008",
  season: "2023_24",
  observedAt: "2024-02-30T12:00:00Z",
  availableAt: "2024-06-01T00:00:00Z",
  cutoffAt: "2024-08-25T00:00:00Z",
  snapshotClassification: "HISTORICAL_EVENT_LOG",
  transformVersion: "hybrid-dataset-contract@1.0.0",
  missingnessStatus: "present",
  conflictStatus: "no_conflict",
});

// Deliberately invalid: 2023 is not a leap year, so 29 February does not exist.
export const syntheticInvalidFeb29NonLeapYear: PointInTimeFeatureDeclaration =
  pointInTimeDeclaration({
    feature: "invalid_feb_29_non_leap_case",
    source: "transfermarkt",
    sourceEntityId: "synthetic_player_009",
    season: "2022_23",
    observedAt: "2023-02-29T00:00:00Z",
    availableAt: "2023-06-01T00:00:00Z",
    cutoffAt: "2023-08-25T00:00:00Z",
    snapshotClassification: "HISTORICAL_EVENT_LOG",
    transformVersion: "hybrid-dataset-contract@1.0.0",
    missingnessStatus: "present",
    conflictStatus: "no_conflict",
  });

// Valid: 2024 IS a leap year, so 29 February is real — must classify normally, not be
// rejected by the leap-year check.
export const syntheticValidFeb29LeapYear: PointInTimeFeatureDeclaration = pointInTimeDeclaration(
  {
    feature: "valid_feb_29_leap_case",
    source: "transfermarkt",
    sourceEntityId: "synthetic_player_010",
    season: "2023_24",
    observedAt: "2024-02-29T00:00:00Z",
    availableAt: "2024-02-29T00:00:00Z",
    cutoffAt: "2024-08-25T00:00:00Z",
    snapshotClassification: "HISTORICAL_EVENT_LOG",
    transformVersion: "hybrid-dataset-contract@1.0.0",
    missingnessStatus: "present",
    conflictStatus: "no_conflict",
  },
);

// Deliberately invalid: month 13 does not exist.
export const syntheticInvalidMonth13: PointInTimeFeatureDeclaration = pointInTimeDeclaration({
  feature: "invalid_month_13_case",
  source: "transfermarkt",
  sourceEntityId: "synthetic_player_011",
  season: "2023_24",
  observedAt: "2024-13-01T00:00:00Z",
  availableAt: "2024-06-01T00:00:00Z",
  cutoffAt: "2024-08-25T00:00:00Z",
  snapshotClassification: "HISTORICAL_EVENT_LOG",
  transformVersion: "hybrid-dataset-contract@1.0.0",
  missingnessStatus: "present",
  conflictStatus: "no_conflict",
});

// Deliberately invalid: hour 24 does not exist (00-23 only) — must be rejected, never
// silently rolled over to 00:00 the next day.
export const syntheticInvalidHour24: PointInTimeFeatureDeclaration = pointInTimeDeclaration({
  feature: "invalid_hour_24_case",
  source: "transfermarkt",
  sourceEntityId: "synthetic_player_012",
  season: "2023_24",
  observedAt: "2024-06-01T24:00:00Z",
  availableAt: "2024-06-01T00:00:00Z",
  cutoffAt: "2024-08-25T00:00:00Z",
  snapshotClassification: "HISTORICAL_EVENT_LOG",
  transformVersion: "hybrid-dataset-contract@1.0.0",
  missingnessStatus: "present",
  conflictStatus: "no_conflict",
});

// Deliberately invalid: a +25:00 timezone offset does not exist (offset hour must be
// 00-23).
export const syntheticInvalidTimezoneOffset: PointInTimeFeatureDeclaration =
  pointInTimeDeclaration({
    feature: "invalid_timezone_offset_case",
    source: "transfermarkt",
    sourceEntityId: "synthetic_player_013",
    season: "2023_24",
    observedAt: "2024-06-01T12:00:00+25:00",
    availableAt: "2024-06-01T00:00:00Z",
    cutoffAt: "2024-08-25T00:00:00Z",
    snapshotClassification: "HISTORICAL_EVENT_LOG",
    transformVersion: "hybrid-dataset-contract@1.0.0",
    missingnessStatus: "present",
    conflictStatus: "no_conflict",
  });

// Valid: milliseconds in the fractional-seconds part must not be rejected.
export const syntheticValidWithMilliseconds: PointInTimeFeatureDeclaration =
  pointInTimeDeclaration({
    feature: "valid_with_milliseconds_case",
    source: "transfermarkt",
    sourceEntityId: "synthetic_player_014",
    season: "2023_24",
    observedAt: "2024-06-01T12:00:00.123Z",
    availableAt: "2024-06-01T12:00:00.123Z",
    cutoffAt: "2024-08-25T00:00:00Z",
    snapshotClassification: "HISTORICAL_EVENT_LOG",
    transformVersion: "hybrid-dataset-contract@1.0.0",
    missingnessStatus: "present",
    conflictStatus: "no_conflict",
  });

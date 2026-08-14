export const VAL_DATA_READINESS_VERSION = "1.0.0";
export const EXPECTED_SEASONS = [
  "2015_16",
  "2016_17",
  "2017_18",
  "2018_19",
  "2019_20",
  "2020_21",
  "2021_22",
  "2022_23",
  "2023_24",
  "2024_25",
  "2025_26",
] as const;
export const BURNED_HOLDOUT = "2025_26";

export type EvidenceState = "observed" | "inferred" | "missing";
export type RdReadiness = "R&D_READY" | "R&D_READY_WITH_LIMITS" | "NOT_READY" | "BLOCKED_ACCESS";
export type PromotionalReadiness = "PROMOTIONAL_READY" | "PROMOTIONAL_NOT_READY";

export interface ReadinessFile {
  readonly season: string;
  readonly matchday: number;
  readonly kind: "xlsx";
  readonly size: number;
  readonly sha256: string;
  readonly manifestHashState: "match" | "mismatch" | "missing";
  readonly pipelineStatus: "valid" | "warning" | "invalid";
  readonly issueCodes: readonly string[];
}

export interface SourceRuleSeason {
  readonly season: string;
  readonly sourceId: string | null;
  readonly sheetsPresent: readonly string[];
  readonly editorialSheet: string | null;
  readonly voteSource: string | null;
  readonly leagueVoteSource: string | null;
  readonly sourceAlignment: "verified" | "misaligned" | "unverified";
  readonly transformVersion: string;
  readonly evidence: EvidenceState;
  readonly confidence: "high" | "medium" | "low" | "none";
  readonly leagueRuleVersion: string | null;
  readonly bonusMalusTariff: string | null;
  readonly gsSemantics: string | null;
  readonly rfSemantics: string | null;
  readonly defenseModifier: string | null;
  readonly midfieldModifier: string | null;
  readonly attackModifier: string | null;
}

export interface IdentityReadiness {
  readonly stableMatchRate: number;
  readonly driftRate: number;
  readonly collisionRate: number;
  readonly acceptedResearchJoins: number;
  readonly excludedAmbiguous: number;
  readonly excludedExternalIdReuse: number;
  readonly canonicalIdsAssigned: 0;
  readonly reuseCanMisjoin: boolean;
  readonly reasonCodes: readonly string[];
}

export interface CohortReadiness {
  readonly playerSeasons: number;
  readonly transitions: number;
  readonly possibleTemporalFolds: number;
  readonly coldStarts: number | null;
  readonly zeroAppearances: number;
  readonly exits: number | null;
  readonly unobservableTargets: number;
  readonly historicalListsAvailable: boolean;
  readonly currentListAvailable: boolean;
  readonly currentListUsedAsHistorical: false;
  readonly excludedByReason: Readonly<Record<string, number>>;
}

export interface DataReadinessInput {
  readonly accessAvailable: boolean;
  readonly files: readonly ReadinessFile[];
  readonly unexpectedFiles: readonly string[];
  readonly sourceRule: readonly SourceRuleSeason[];
  readonly identity: IdentityReadiness;
  readonly cohort: CohortReadiness;
  readonly burnedHoldoutAccesses: readonly {
    readonly purpose: "inventory" | "validation" | "descriptive_advisory";
    readonly usedForTrain: false;
    readonly usedForTuning: false;
    readonly usedForSelection: false;
    readonly usedForFold: false;
    readonly usedForOof: false;
  }[];
}

export interface DataReadinessReport {
  readonly schemaVersion: typeof VAL_DATA_READINESS_VERSION;
  readonly corpusIntegrity: {
    readonly expectedSeasons: readonly string[];
    readonly observedSeasons: readonly string[];
    readonly expectedFiles: 418;
    readonly observedFiles: number;
    readonly exact: boolean;
  };
  readonly provenance: { readonly observed: number; readonly inferred: number; readonly missing: number };
  readonly hashCoverage: { readonly match: number; readonly mismatch: number; readonly missing: number };
  readonly pipelineValidation: { readonly valid: number; readonly warning: number; readonly invalid: number };
  readonly sourceAlignment: "verified" | "limited" | "failed";
  readonly ruleReadiness: "verified" | "unverified";
  readonly identityReadiness: IdentityReadiness;
  readonly cohortReadiness: CohortReadiness & {
    readonly cohortType: "historical_list_panel" | "reconstructed_votes_only";
    readonly evidenceCap: "directive" | "scouting";
  };
  readonly burnedHoldoutAccess: DataReadinessInput["burnedHoldoutAccesses"];
  readonly rd_readiness: RdReadiness;
  readonly promotional_readiness: PromotionalReadiness;
  readonly blockers: readonly string[];
}

const SEASON_SET = new Set<string>(EXPECTED_SEASONS);
const SHA256 = /^[a-f0-9]{64}$/;

export function validateAndBuildDataReadiness(input: DataReadinessInput): DataReadinessReport {
  if (!input.accessAvailable) return blockedReport(input);

  const blockers = new Set<string>();
  const seasonCounts = new Map<string, number>();
  const matchdayKeys = new Set<string>();
  for (const file of input.files) {
    if (!SEASON_SET.has(file.season)) blockers.add("UNEXPECTED_SEASON");
    seasonCounts.set(file.season, (seasonCounts.get(file.season) ?? 0) + 1);
    const key = `${file.season}:${file.matchday}`;
    if (matchdayKeys.has(key)) blockers.add("DUPLICATE_MATCHDAY");
    matchdayKeys.add(key);
    if (file.matchday < 1 || file.matchday > 38) blockers.add("UNEXPECTED_MATCHDAY");
    if (!SHA256.test(file.sha256)) blockers.add("INVALID_SHA256");
    if (file.manifestHashState === "mismatch") blockers.add("HASH_MISMATCH");
    if (file.pipelineStatus === "invalid") blockers.add("PIPELINE_INVALID");
    if (file.issueCodes.includes("unknown_vote_token")) blockers.add("UNKNOWN_VOTE_TOKEN");
  }
  for (const season of EXPECTED_SEASONS) {
    const count = seasonCounts.get(season) ?? 0;
    if (count === 0) blockers.add("MISSING_SEASON");
    if (count !== 38) blockers.add("INCOMPLETE_SEASON");
  }
  if (input.unexpectedFiles.length > 0) blockers.add("UNEXPECTED_FILE");
  if (input.sourceRule.some((x) => !SEASON_SET.has(x.season))) blockers.add("UNEXPECTED_SOURCE_RULE_SEASON");
  if (new Set(input.sourceRule.map((x) => x.season)).size !== input.sourceRule.length)
    blockers.add("DUPLICATE_SOURCE_RULE_SEASON");
  if (input.identity.reuseCanMisjoin) blockers.add("IDENTITY_REUSE_MISJOIN_RISK");
  if (input.identity.canonicalIdsAssigned !== 0) blockers.add("CANONICAL_ID_ASSIGNED");
  if (input.cohort.currentListUsedAsHistorical) blockers.add("CURRENT_LIST_USED_AS_HISTORICAL");
  for (const access of input.burnedHoldoutAccesses) {
    if (access.usedForTrain || access.usedForTuning || access.usedForSelection || access.usedForFold || access.usedForOof)
      blockers.add("BURNED_HOLDOUT_LEAKAGE");
  }

  const observedSeasons = [...seasonCounts.keys()].sort();
  const hashCoverage = countBy(input.files, (f) => f.manifestHashState);
  const pipeline = countBy(input.files, (f) => f.pipelineStatus);
  const sourceVerified = input.sourceRule.length === 11 && input.sourceRule.every((x) => x.sourceAlignment === "verified");
  const rulesVerified = input.sourceRule.length === 11 && input.sourceRule.every((x) => x.leagueRuleVersion !== null);
  const structuralBlockers = [
    "UNEXPECTED_SEASON", "DUPLICATE_MATCHDAY", "UNEXPECTED_MATCHDAY", "INVALID_SHA256", "HASH_MISMATCH",
    "PIPELINE_INVALID", "UNKNOWN_VOTE_TOKEN", "MISSING_SEASON", "INCOMPLETE_SEASON", "UNEXPECTED_FILE",
    "UNEXPECTED_SOURCE_RULE_SEASON", "DUPLICATE_SOURCE_RULE_SEASON",
    "IDENTITY_REUSE_MISJOIN_RISK", "CANONICAL_ID_ASSIGNED", "CURRENT_LIST_USED_AS_HISTORICAL",
    "BURNED_HOLDOUT_LEAKAGE",
  ];
  const notReady = structuralBlockers.some((x) => blockers.has(x));
  if (!sourceVerified) blockers.add("SOURCE_ALIGNMENT_UNVERIFIED");
  if (!rulesVerified) blockers.add("RULE_EVIDENCE_UNVERIFIED");
  if (!input.cohort.historicalListsAvailable) blockers.add("HISTORICAL_LISTS_MISSING");
  if (hashCoverage.missing > 0) blockers.add("MANIFEST_HASH_MISSING");

  const promotional = sourceVerified && rulesVerified && input.cohort.historicalListsAvailable &&
    input.identity.collisionRate < 0.005 && !notReady;
  return {
    schemaVersion: VAL_DATA_READINESS_VERSION,
    corpusIntegrity: {
      expectedSeasons: [...EXPECTED_SEASONS],
      observedSeasons,
      expectedFiles: 418,
      observedFiles: input.files.length,
      exact: !notReady && input.files.length === 418 && observedSeasons.length === 11,
    },
    provenance: {
      observed: input.files.length,
      inferred: 0,
      missing: hashCoverage.missing ?? 0,
    },
    hashCoverage: { match: hashCoverage.match ?? 0, mismatch: hashCoverage.mismatch ?? 0, missing: hashCoverage.missing ?? 0 },
    pipelineValidation: { valid: pipeline.valid ?? 0, warning: pipeline.warning ?? 0, invalid: pipeline.invalid ?? 0 },
    sourceAlignment: sourceVerified ? "verified" : input.sourceRule.some((x) => x.sourceAlignment === "misaligned") ? "failed" : "limited",
    ruleReadiness: rulesVerified ? "verified" : "unverified",
    identityReadiness: input.identity,
    cohortReadiness: {
      ...input.cohort,
      cohortType: input.cohort.historicalListsAvailable ? "historical_list_panel" : "reconstructed_votes_only",
      evidenceCap: promotional ? "directive" : "scouting",
    },
    burnedHoldoutAccess: input.burnedHoldoutAccesses,
    rd_readiness: notReady ? "NOT_READY" : blockers.size === 0 ? "R&D_READY" : "R&D_READY_WITH_LIMITS",
    promotional_readiness: promotional ? "PROMOTIONAL_READY" : "PROMOTIONAL_NOT_READY",
    blockers: [...blockers].sort(),
  };
}

function countBy<T, K extends string>(values: readonly T[], key: (value: T) => K): Record<K, number> {
  const result = {} as Record<K, number>;
  for (const value of values) {
    const k = key(value);
    result[k] = (result[k] ?? 0) + 1;
  }
  return result;
}

function blockedReport(input: DataReadinessInput): DataReadinessReport {
  return {
    schemaVersion: VAL_DATA_READINESS_VERSION,
    corpusIntegrity: { expectedSeasons: [...EXPECTED_SEASONS], observedSeasons: [], expectedFiles: 418, observedFiles: 0, exact: false },
    provenance: { observed: 0, inferred: 0, missing: 418 },
    hashCoverage: { match: 0, mismatch: 0, missing: 418 },
    pipelineValidation: { valid: 0, warning: 0, invalid: 0 },
    sourceAlignment: "failed",
    ruleReadiness: "unverified",
    identityReadiness: input.identity,
    cohortReadiness: { ...input.cohort, cohortType: "reconstructed_votes_only", evidenceCap: "scouting" },
    burnedHoldoutAccess: input.burnedHoldoutAccesses,
    rd_readiness: "BLOCKED_ACCESS",
    promotional_readiness: "PROMOTIONAL_NOT_READY",
    blockers: ["CORPUS_ACCESS_UNAVAILABLE"],
  };
}

import { createHash } from "node:crypto";
import { GOALKEEPER_FAMILY_LADDER, isGoalkeeperFamily } from "./goalkeeperFeatures.js";

export const PHASE4_PROTOCOL = "VAL-PROTOCOL-A-PHASE4@2.2.0" as const;
export const MODELABLE_SEASONS = [
  "2015_16", "2016_17", "2017_18", "2018_19", "2019_20",
  "2020_21", "2021_22", "2022_23", "2023_24", "2024_25",
] as const;
export const FORBIDDEN_SEASON = "2025_26" as const;
export const PHASE4_ROLES = ["P", "D", "C", "A"] as const;

/**
 * The reference date `age_at_season_start` is computed against — a DECLARED
 * CONVENTION, not the real Serie A fixture calendar.
 *
 * A per-season table of actual opening dates would be a data acquisition of
 * its own, with its own provenance to establish, for a feature that is a
 * coarse aging signal rather than a matchday quantity. Inventing those dates
 * and presenting them as fact would be worse than declaring a rule. The rule
 * is uniform across seasons on purpose: year-over-year the same player's age
 * then advances by exactly one, so the feature carries aging and nothing else.
 *
 * Replacing this with a real opening-date table later is a protocol change
 * (the convention is part of `PHASE4_CONFIG`, so it is inside the config hash)
 * — never a silent swap.
 */
export const SEASON_REFERENCE_DATE_CONVENTION = "season_start_year-08-31" as const;

const SEASON_LABEL_PATTERN = /^(\d{4})_\d{2}$/;

/** `"2019_20"` -> `"2019-08-31"`. Fail-closed on any label that is not a real season. */
export function seasonStartReferenceDate(season: string): string {
  const match = SEASON_LABEL_PATTERN.exec(season);
  if (match === null) throw new Error(`INVALID_SEASON_LABEL:${season}`);
  return `${match[1]}-08-31`;
}

export type Phase4Role = (typeof PHASE4_ROLES)[number];
export type Phase4Verdict =
  | "SCOUTING_MODEL_SELECTED"
  | "SCOUTING_ROLE_SPECIFIC_MODEL_SELECTED"
  | "BASELINE_RETAINED"
  | "HEURISTIC_ONLY"
  | "NO_VERDICT";

export const PHASE4_CONFIG = {
  protocolVersion: PHASE4_PROTOCOL,
  evidenceCap: "scouting",
  promotionalReadiness: "PROMOTIONAL_NOT_READY",
  validated: false,
  gates: {
    data_promoted: false,
    canonical_promoted: false,
    decision_promoted: false,
    fair_to_me_promoted: false,
    live_ui_ready: false,
  },
  cohort: "reconstructed_votes_only",
  seasons: MODELABLE_SEASONS,
  forbiddenSeason: FORBIDDEN_SEASON,
  targets: [
    "fantamedia_next", "presenze_next", "season_total_direct",
    "season_total_two_part",
  ],
  features: [
    "fantamedia_lag1", "fantamedia_mean3", "presenze_lag1",
    "presenze_mean3", "volatility_lag1", "seasons_observed",
    "goals_mean3", "assists_mean3", "team_changed", "role",
    // @2.2.0 (T4). The first pooled feature not derived from the vote records
    // themselves: it comes from the governed Wikidata anagrafica pipeline,
    // always as an age at an explicit historical reference date.
    "age_at_season_start",
  ],
  // Declared separately from the pooled registry above so adding the
  // goalkeeper construct cannot change the pooled vector, its parameter count,
  // or the D/C/A verdicts that already ran against it.
  //
  // Deliberately UNCHANGED by @2.2.0. Age plausibly matters for a goalkeeper
  // too, but role P is gated by this ladder rather than by the pooled family,
  // and the ladder selects the richest family clearing its own complete-case
  // sample guard: adding an externally-sourced feature to the richest rung
  // would let anagrafica COVERAGE, not evidence, decide which goalkeeper
  // family wins. Extending the ladder is its own preregistration decision,
  // taken before metrics, not a side effect of the pooled change.
  goalkeeperFeatures: [
    "fantamedia_lag1", "fantamedia_mean3", "presenze_lag1",
    "presenze_mean3", "volatility_lag1", "seasons_observed", "team_changed",
    "goals_conceded_per_appearance_mean3", "clean_sheet_rate_mean3",
    "penalties_saved_per_appearance_mean3",
  ],
  // Preregistered before any metric, like the goalkeeper ladder above.
  //
  // `minimumResolvedCoverage` is a runnability precondition, not a quality
  // bar: the pooled families are fitted on the complete-case subset, so a
  // vector carrying an unresolved age drops the whole row. Below this floor a
  // Phase 4 run would not produce weaker verdicts, it would produce almost no
  // rows and therefore NO_VERDICT everywhere — an outcome indistinguishable
  // from a methodological finding unless the run refuses first and says so.
  //
  // 0.9 is this protocol's OWN operational choice, preregistered here, and it
  // is deliberately not justified by the `complete_p569_rate >= 0.90` candidate
  // threshold in docs/data/WIKIDATA_MCP_DIAGNOSIS.md §3: that one measures a
  // different quantity — the share of ALREADY MATCHED entities carrying a
  // usable birth date — while this measures the share of pooled-gated FEATURE
  // ROWS that end up with an age at all, after identity, precision and the
  // historical join have each had their chance to drop one. Two numbers that
  // happen to read 0.90 are not one threshold, and treating them as one would
  // borrow evidence the source review never produced. Flagged to Owner as an
  // operational choice awaiting a real labelled measurement; revising it is a
  // protocol change (it is inside the config hash), never a silent tweak.
  anagrafica: {
    featureName: "age_at_season_start",
    source: "wikidata",
    sourceRegistration: "docs/DECISIONS.md#active--wikidata-2026-08-12",
    referenceDateContext: "PLAYER_SEASON",
    referenceDateType: "SEASON_START_DATE",
    referenceDateConvention: SEASON_REFERENCE_DATE_CONVENTION,
    joinPolicy: "exact_match_only_ambiguous_to_manual_review",
    missingPolicy: "complete_case_drop_never_imputed",
    minimumResolvedCoverage: 0.9,
  },
  pipelines: [
    "missing_indicator_train_median", "complete_case", "cold_start_role_fallback",
  ],
  baselines: ["naive_last", "rolling_mean_3", "train_role_mean", "role_shrinkage"],
  // @2.2.0 raised every pooled `pBase` by exactly one: `age_at_season_start`
  // is one more estimated coefficient. The counts stay derivable from
  // `FEATURE_NAMES` and are asserted against it by test (phase4Protocol.test.ts),
  // so a future feature added on one side and not mirrored here fails closed
  // rather than quietly weakening the `n_train >= 10 * p_family` guard:
  //   pooled            = intercept + every pooled feature          = 15
  //   role_specific     = pooled minus the four role one-hots       = 11
  //   two_part_hurdle   = its usage model + its performance model   = 26
  // `pRole` is untouched: the age feature is not interacted with role, so the
  // interaction family gains no new interaction term, only the base one.
  families: {
    pooled_regularized_role: { pBase: 15, pRole: 0 },
    pooled_role_feature_interactions: { pBase: 15, pRole: 9 },
    role_specific_regularized: { pBase: 11, pRole: 0 },
    direct_season_total: { pBase: 15, pRole: 0 },
    two_part_hurdle: { pBase: 26, pRole: 0 },
    // Goalkeeper ladder, richest first, each family a strict subset of the one
    // above it. `pBase` is the intercept plus one coefficient per declared
    // feature and is asserted against `GOALKEEPER_FAMILY_FEATURES` by test, so
    // a change to either side that is not mirrored in the other fails closed.
    goalkeeper_specific_full: { pBase: 11, pRole: 0 },
    goalkeeper_specific_core: { pBase: 7, pRole: 0 },
    goalkeeper_specific_minimal: { pBase: 4, pRole: 0 },
  },
  // Role P is gated by the goalkeeper ladder, not by the pooled family: the
  // pooled vector spends 6 of its 14 parameters on quantities that are constant
  // or near-degenerate inside role P. The `n_train >= 10 * p_family` bar is
  // unchanged for every family; only the parameter count differs.
  goalkeeperLadder: GOALKEEPER_FAMILY_LADDER,
  goalkeeperSelectionRule: "richest_ladder_family_passing_its_own_sample_guard",
  goalkeeperSupportRule: "complete_case_role_p_rows_only",
  gatingFamilyByRole: {
    P: "goalkeeper_ladder",
    D: "pooled_regularized_role",
    C: "pooled_regularized_role",
    A: "pooled_regularized_role",
  },
  hyperparameters: { ridgeLambda: [0.1, 1, 10, 100], shrinkageK: [3, 8, 15] },
  seed: 41717,
  bootstrapReplicates: 2000,
  bootstrapMethod: "season_block_hierarchical",
  indistinguishable: "paired_season_block_95ci_includes_zero",
  regressionRule: "no_selection_when_any_role_ci_excludes_zero_against_candidate",
  tieBreak: ["baseline_or_shrinkage", "lower_complexity", "higher_coverage", "lower_cost"],
  roleVorReplacement: "train_fold_role_25th_percentile_predicted_total",
  archetypePolicy: "NO_VERDICT_WITHOUT_ARCH_01",
  outputPolicy: "outside_repository_append_only",
} as const;

/**
 * The exact artifact set one Phase 4 output package must contain, in the order
 * the run manifest records them.
 *
 * It lives in the protocol module, not in the runner script, because two
 * independent places need the same list and must not drift: the backtest
 * runner writes them, and the private publication path verifies a produced
 * package is complete before persisting it. `artifact_manifest.json` is NOT
 * part of this list — the runner writes it separately, over these artifacts.
 */
export const PHASE4_ARTIFACT_NAMES = [
  "phase4_input_manifest.json", "phase4_run_config.json", "cohort_accounting.json",
  "feature_registry.json", "candidate_registry.json", "sample_size_eligibility.json",
  "goalkeeper_family_report.json", "anagrafica_coverage_report.json",
  "oof_predictions.jsonl", "fold_metrics.json", "paired_comparisons.json",
  "uncertainty_report.json", "sensitivity_report.json", "component_verdicts.json",
  "algorithm_registry.json", "fitted_parameters.json", "role_vor_report.json",
  "archetype_vor_report.json", "phase4_report.json", "phase4_report.md",
  "val_run_manifest.json",
] as const;

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function phase4ConfigHash(): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(stableJson(PHASE4_CONFIG)).digest("hex")}`;
}

export function assertModelableSeason(season: string): asserts season is (typeof MODELABLE_SEASONS)[number] {
  if (season === FORBIDDEN_SEASON) throw new Error("FORBIDDEN_SEASON_2025_26");
  if (!(MODELABLE_SEASONS as readonly string[]).includes(season)) {
    throw new Error(`INELIGIBLE_SEASON:${season}`);
  }
}

export function familyParameterCount(
  family: keyof typeof PHASE4_CONFIG.families,
  role: Phase4Role,
): number {
  // A goalkeeper family estimates nothing on an outfield row — it has no
  // parameter count there, and answering one would let a caller build an
  // eligibility entry the runner can never honour.
  if (isGoalkeeperFamily(family) && role !== "P") {
    throw new Error(`GOALKEEPER_FAMILY_NOT_DEFINED_FOR_ROLE:${role}`);
  }
  const definition = PHASE4_CONFIG.families[family];
  return definition.pBase + definition.pRole;
}


export interface EligibilityFold {
  role: Phase4Role;
  foldId: string;
  nTrain: number;
  pFamily: number;
  eligible: boolean;
  reasonCode: "ELIGIBLE" | "SAMPLE_GUARD_FAILED";
}

export function sampleEligibility(
  family: keyof typeof PHASE4_CONFIG.families,
  role: Phase4Role,
  folds: readonly { foldId: string; nTrain: number }[],
): { folds: EligibilityFold[]; roleEligible: boolean; verdict: Phase4Verdict | null } {
  const pFamily = familyParameterCount(family, role);
  const evaluated = folds.map(({ foldId, nTrain }) => ({
    role,
    foldId,
    nTrain,
    pFamily,
    eligible: nTrain >= 10 * pFamily,
    reasonCode: nTrain >= 10 * pFamily
      ? "ELIGIBLE" as const
      : "SAMPLE_GUARD_FAILED" as const,
  }));
  const failures = evaluated.filter((fold) => !fold.eligible).length;
  const roleEligible = evaluated.length > 0 && failures / evaluated.length <= 1 / 3;
  return { folds: evaluated, roleEligible, verdict: roleEligible ? null : "NO_VERDICT" };
}

export const COMPONENT_DISPOSITIONS = {
  appetibilitaBase: { proxy: "fantamedia_next", defaultVerdict: "NO_VERDICT" },
  affidabilita: { proxy: "presenze_next", defaultVerdict: "NO_VERDICT" },
  rischio: { proxy: "season_block_error_distribution", defaultVerdict: "HEURISTIC_ONLY" },
  upside: { proxy: "upper_oof_residual_quantile", defaultVerdict: "HEURISTIC_ONLY" },
  continuitaVoto: { proxy: "within_season_vote_dispersion", defaultVerdict: "HEURISTIC_ONLY" },
  bonusPotential: { proxy: "observed_bonus_rate", defaultVerdict: "HEURISTIC_ONLY" },
  modificatoreRelevance: { proxy: null, defaultVerdict: "HEURISTIC_ONLY" },
  ruoloRarita: { proxy: "observed_cohort_role_count", defaultVerdict: "HEURISTIC_ONLY" },
} as const satisfies Record<string, { proxy: string | null; defaultVerdict: Phase4Verdict }>;

export function assertPhase4OutputShape(value: unknown): void {
  const text = JSON.stringify(value);
  for (const forbidden of [
    /"validated":true/, /"receipt"/i, /canonical_player_id/i,
    /target_band/i, /stretch_cap/i, /"scale"\s*:\s*100/i,
    /"data_promoted":true/, /"decision_promoted":true/,
  ]) {
    if (forbidden.test(text)) throw new Error(`PHASE4_FORBIDDEN_OUTPUT:${forbidden.source}`);
  }
}

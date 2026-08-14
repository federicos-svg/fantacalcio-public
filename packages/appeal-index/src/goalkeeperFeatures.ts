/**
 * Goalkeeper-specific feature vector and its preregistered family ladder —
 * PURE, no I/O.
 *
 * Why a separate vector exists. The pooled Phase 4 vector (`FEATURE_NAMES`)
 * carries four role one-hots and two attacking-output features. Inside role P
 * the one-hots are constant, so they estimate nothing, and goals/assists are
 * near-degenerate — yet all six still cost the `n_train >= 10 * p_family`
 * guard 60 rows. Goalkeepers are structurally the smallest role in the cohort,
 * so those wasted parameters are exactly what keeps P at `NO_VERDICT`.
 *
 * This vector spends the same budget on quantities that do describe a
 * goalkeeper's season and are already derivable from the vote records in
 * house: goals conceded per appearance (`Gs`), clean-sheet rate, and penalties
 * saved per appearance (`Rp`).
 *
 * The ladder is preregistered here, complexity-ordered, and frozen in
 * `PHASE4_CONFIG.families` before any metric is read. It does NOT lower the
 * `10 * p_family` bar: it lowers the model's parameter count until the bar is
 * genuinely met, and the runner selects the RICHEST family that clears its own
 * guard. If even the most parsimonious one fails, P stays `NO_VERDICT` and the
 * run emits the numbers that say why.
 *
 * Nothing here is imputed. A goalkeeper-season with no appearance yields no
 * rate, the rate stays `NaN`, and the row drops out of the complete-case
 * subset — never a silent zero.
 */
import type { PlayerSeasonPanelRow } from "./types.js";
import { mean } from "./stats.js";

export const GOALKEEPER_FEATURE_NAMES = [
  "fantamediaLag1",
  "fantamediaRollingMean3",
  "presenzeLag1",
  "presenzeRollingMean3",
  "volatilitaVotoLag1",
  "nSeasonsObserved",
  "teamChangedFlag",
  "golSubitiPerPresenzaRollingMean3",
  "porteInviolateRateRollingMean3",
  "rigoriParatiPerPresenzaRollingMean3",
] as const;

export type GoalkeeperFeatureName = (typeof GOALKEEPER_FEATURE_NAMES)[number];
export type GoalkeeperFeatureVector = Readonly<Record<GoalkeeperFeatureName, number>>;

/**
 * The three preregistered goalkeeper families, richest first. Each is a strict
 * subset of the one above it, so the ladder is nested by construction and a
 * step down can only ever remove degrees of freedom.
 */
export const GOALKEEPER_FAMILY_LADDER = [
  "goalkeeper_specific_full",
  "goalkeeper_specific_core",
  "goalkeeper_specific_minimal",
] as const;

export type GoalkeeperFamily = (typeof GOALKEEPER_FAMILY_LADDER)[number];

export const GOALKEEPER_FAMILY_FEATURES: Readonly<
  Record<GoalkeeperFamily, readonly GoalkeeperFeatureName[]>
> = {
  goalkeeper_specific_full: GOALKEEPER_FEATURE_NAMES,
  goalkeeper_specific_core: [
    "fantamediaRollingMean3",
    "presenzeRollingMean3",
    "nSeasonsObserved",
    "golSubitiPerPresenzaRollingMean3",
    "porteInviolateRateRollingMean3",
    "rigoriParatiPerPresenzaRollingMean3",
  ],
  goalkeeper_specific_minimal: [
    "fantamediaRollingMean3",
    "presenzeRollingMean3",
    "porteInviolateRateRollingMean3",
  ],
};

/** Intercept plus one coefficient per feature — the family's estimated dof. */
export function goalkeeperFamilyParameterCount(family: GoalkeeperFamily): number {
  return GOALKEEPER_FAMILY_FEATURES[family].length + 1;
}

export function isGoalkeeperFamily(family: string): family is GoalkeeperFamily {
  return (GOALKEEPER_FAMILY_LADDER as readonly string[]).includes(family);
}

function rollingMean(values: readonly number[], window: number): number {
  if (values.length === 0) return Number.NaN;
  return mean(values.slice(Math.max(0, values.length - window)));
}

/**
 * Per-season rate over the seasons of `history` where the goalkeeper actually
 * appeared. A season with no appearance has no rate at all and is skipped
 * rather than counted as zero; a history with no appearance anywhere yields
 * `NaN`, which drops the row from the complete-case subset.
 */
function ratePerPresenza(
  history: readonly PlayerSeasonPanelRow[],
  numerator: (row: PlayerSeasonPanelRow) => number,
  window: number,
): number {
  const rates = history.filter((row) => row.presenze > 0).map((row) => numerator(row) / row.presenze);
  return rollingMean(rates, window);
}

/**
 * Builds the goalkeeper vector from exactly the history slice the pooled
 * feature row was built from — same seasons, same ordering, same `<= s` bound —
 * so the anti-leakage guarantee `dataset.ts` already proves for that row covers
 * this vector too.
 */
export function buildGoalkeeperFeatureVector(
  history: readonly PlayerSeasonPanelRow[],
  teamChangedFlag: number,
  window: number,
): GoalkeeperFeatureVector {
  const current = history[history.length - 1];
  if (current === undefined) throw new Error("buildGoalkeeperFeatureVector: empty history");
  const fantamedie = history.map((row) => row.fantamedia).filter((value): value is number => value !== null);

  return {
    fantamediaLag1: current.fantamedia ?? Number.NaN,
    fantamediaRollingMean3: rollingMean(fantamedie, window),
    presenzeLag1: current.presenze,
    presenzeRollingMean3: rollingMean(history.map((row) => row.presenze), window),
    volatilitaVotoLag1: current.volatilitaVoto ?? Number.NaN,
    nSeasonsObserved: history.length,
    teamChangedFlag,
    golSubitiPerPresenzaRollingMean3: ratePerPresenza(history, (row) => row.golSubiti, window),
    porteInviolateRateRollingMean3: ratePerPresenza(history, (row) => row.porteInviolate, window),
    rigoriParatiPerPresenzaRollingMean3: ratePerPresenza(history, (row) => row.rigoriParati, window),
  };
}

/** Every feature the family actually estimates on must be finite. */
export function hasCompleteGoalkeeperFeatures(
  features: GoalkeeperFeatureVector,
  family: GoalkeeperFamily,
): boolean {
  return GOALKEEPER_FAMILY_FEATURES[family].every((name) => Number.isFinite(features[name]));
}

export function toGoalkeeperVector(
  features: GoalkeeperFeatureVector,
  family: GoalkeeperFamily,
): number[] {
  return GOALKEEPER_FAMILY_FEATURES[family].map((name) => features[name]);
}

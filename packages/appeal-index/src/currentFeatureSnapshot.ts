import type {
  AnagraficaAgeIndex,
  FeatureName,
  FeatureVector,
  PlayerSeasonPanelRow,
  Role,
} from "./types.js";
import { FEATURE_NAMES } from "./types.js";
import type { PlayerSeasonPanel } from "./dataset.js";
import { lastObservedVolatility } from "./seasonAggregate.js";
import {
  buildGoalkeeperFeatureVector,
  type GoalkeeperFeatureVector,
} from "./goalkeeperFeatures.js";
import { seasonYear } from "./identityStability.js";
import { mean } from "./stats.js";

export interface CurrentFeatureRow {
  readonly playerKey: string;
  readonly name: string;
  readonly role: Role;
  readonly team: string;
  readonly featureSeason: string;
  readonly targetSeason: string;
  readonly features: FeatureVector;
  /**
   * The goalkeeper-specific vector, present ONLY on `role === "P"` rows and
   * built from the same history slice as `features` — the serving twin of the
   * field `FeatureRow` carries in training (`dataset.ts`).
   *
   * Without it a goalkeeper model has nothing to be scored on at serve time:
   * a goalkeeper family estimates on `GOALKEEPER_FEATURE_NAMES`, not on the
   * pooled vector, so a feature base that only carries the pooled one turns
   * any goalkeeper verdict Phase 4 reaches into a model that can be fitted and
   * never served. It is optional on the type because an outfield row genuinely
   * has none, never because it may be skipped for a goalkeeper.
   */
  readonly goalkeeperFeatures?: GoalkeeperFeatureVector;
  readonly missingFeatures: readonly FeatureName[];
  readonly sourceSeasons: readonly string[];
}

/**
 * Why a player observed in the panel produced no serving feature row.
 *
 * `buildCurrentFeatureRows` is deliberately strict: it emits a row only for a
 * player whose LAST observed season is exactly the one before `targetSeason`,
 * because anything else would feed a model a "lag-1" vector built from a lag
 * of two or more years. That strictness is right, and it is also the reason a
 * returning player — one who was in Serie A, missed a full season to injury,
 * a loan abroad or a division below, and is back in the listone — reaches
 * serving as an undifferentiated `NO_FEATURE_BASE_MATCH`, exactly like a
 * player who never appeared in Serie A at all.
 *
 * Those are two different diagnoses with two different remedies, and until
 * they are told apart the size of each group is a guess. This function names
 * them, from the same panel, without relaxing anything.
 */
export type CurrentFeatureExclusionReason = "STALE_LAST_OBSERVED_SEASON";

export interface CurrentFeatureExclusion {
  readonly playerKey: string;
  readonly name: string;
  readonly role: Role;
  readonly team: string;
  readonly lastObservedSeason: string;
  readonly targetSeason: string;
  /** Whole seasons between the last observed one and the target season. */
  readonly seasonsSinceLastObserved: number;
  readonly reason: CurrentFeatureExclusionReason;
}

function rollingMean(values: readonly number[], window: number): number {
  const slice = values.slice(Math.max(0, values.length - window));
  return mean(slice);
}

function roleOneHot(role: Role): Pick<FeatureVector, "roleP" | "roleD" | "roleC" | "roleA"> {
  return {
    roleP: role === "P" ? 1 : 0,
    roleD: role === "D" ? 1 : 0,
    roleC: role === "C" ? 1 : 0,
    roleA: role === "A" ? 1 : 0,
  };
}

/**
 * Builds one target-free point-in-time feature row per player from the last
 * observed season in a private historical panel. It intentionally does not
 * fabricate next-season targets and does not require the target season to be
 * present in the source dataset. Players whose last observed season is not
 * immediately before the target season are excluded instead of treating
 * stale multi-year history as a one-season lag.
 */
export function buildCurrentFeatureRows(
  panel: PlayerSeasonPanel,
  targetSeason: string,
  rollingWindow = 3,
  /**
   * Same season -> playerKey -> age index the training builder consumes, read
   * at the row's own feature season so a serving row and the training rows it
   * is scored against are built from the identical quantity. Absent leaves the
   * feature `NaN` and listed in `missingFeatures`.
   */
  anagrafica?: AnagraficaAgeIndex,
): CurrentFeatureRow[] {
  if (!Number.isInteger(rollingWindow) || rollingWindow < 1) {
    throw new Error("buildCurrentFeatureRows: rollingWindow must be a positive integer");
  }

  const seasonIndex = new Map(panel.orderedSeasons.map((season, index) => [season, index]));
  const byPlayer = new Map<string, PlayerSeasonPanelRow[]>();
  for (const row of panel.rows) {
    const existing = byPlayer.get(row.playerKey) ?? [];
    existing.push(row);
    byPlayer.set(row.playerKey, existing);
  }

  const rows: CurrentFeatureRow[] = [];
  for (const [playerKey, playerRows] of byPlayer) {
    const history = [...playerRows].sort(
      (a, b) => seasonIndex.get(a.season)! - seasonIndex.get(b.season)!,
    );
    const current = history.at(-1);
    if (!current) continue;
    const currentYear = seasonYear(current.season);
    const targetYear = seasonYear(targetSeason);
    if (currentYear >= targetYear) {
      throw new Error(
        `buildCurrentFeatureRows: feature season '${current.season}' is not before target season '${targetSeason}'`,
      );
    }
    if (targetYear - currentYear !== 1) continue;

    const fantamediaHistory = history.map((row) => row.fantamedia).filter((value): value is number => value !== null);
    const presenzeHistory = history.map((row) => row.presenze);
    const golHistory = history.map((row) => row.golFatti);
    const assistHistory = history.map((row) => row.assist);
    const previous = history.length > 1 ? history[history.length - 2] : undefined;

    const features: FeatureVector = {
      fantamediaLag1: current.fantamedia ?? Number.NaN,
      fantamediaRollingMean3:
        fantamediaHistory.length > 0 ? rollingMean(fantamediaHistory, rollingWindow) : Number.NaN,
      presenzeLag1: current.presenze,
      presenzeRollingMean3: rollingMean(presenzeHistory, rollingWindow),
      // Same rule as the training builder (`dataset.ts`), read off the same
      // history slice: a serving row and the training rows it is scored
      // against must be the identical quantity, or the model is fed a feature
      // it never saw.
      volatilitaVotoLastObserved: lastObservedVolatility(history),
      nSeasonsObserved: history.length,
      golFattiRollingMean3: rollingMean(golHistory, rollingWindow),
      assistRollingMean3: rollingMean(assistHistory, rollingWindow),
      teamChangedFlag: previous !== undefined && previous.team !== current.team ? 1 : 0,
      ageAtSeasonStart: anagrafica?.get(current.season)?.get(playerKey) ?? Number.NaN,
      ...roleOneHot(current.role),
    };

    rows.push({
      playerKey,
      name: current.name,
      role: current.role,
      team: current.team,
      featureSeason: current.season,
      targetSeason,
      features,
      ...(current.role === "P"
        ? {
            goalkeeperFeatures: buildGoalkeeperFeatureVector(
              history,
              previous !== undefined && previous.team !== current.team ? 1 : 0,
              rollingWindow,
            ),
          }
        : {}),
      missingFeatures: FEATURE_NAMES.filter((name) => !Number.isFinite(features[name])),
      sourceSeasons: history.map((row) => row.season),
    });
  }

  return rows.sort((a, b) => {
    const left = `${a.role}|${a.name.normalize("NFC")}|${a.team.normalize("NFC")}|${a.playerKey}`;
    const right = `${b.role}|${b.name.normalize("NFC")}|${b.team.normalize("NFC")}|${b.playerKey}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/**
 * Every player the panel observes who produced NO serving feature row, with
 * the reason and the size of the gap.
 *
 * Deliberately a second, pure pass over the same panel rather than a second
 * return value of `buildCurrentFeatureRows`: the builder's contract is "rows
 * a model can be scored on", and widening it to also carry rows a model
 * cannot be scored on is exactly how a caller ends up scoring one by mistake.
 * Nothing here is a candidate for imputation — it is an accounting of who is
 * missing and why, so a run can state the number instead of estimating it.
 */
export function buildCurrentFeatureExclusions(
  panel: PlayerSeasonPanel,
  targetSeason: string,
): CurrentFeatureExclusion[] {
  const seasonIndex = new Map(panel.orderedSeasons.map((season, index) => [season, index]));
  const byPlayer = new Map<string, PlayerSeasonPanelRow[]>();
  for (const row of panel.rows) {
    const existing = byPlayer.get(row.playerKey) ?? [];
    existing.push(row);
    byPlayer.set(row.playerKey, existing);
  }

  const targetYear = seasonYear(targetSeason);
  const exclusions: CurrentFeatureExclusion[] = [];
  for (const [playerKey, playerRows] of byPlayer) {
    const history = [...playerRows].sort(
      (a, b) => seasonIndex.get(a.season)! - seasonIndex.get(b.season)!,
    );
    const current = history.at(-1);
    if (!current) continue;
    const gap = targetYear - seasonYear(current.season);
    // `gap <= 0` is the malformed-panel case `buildCurrentFeatureRows` throws
    // on; it is not an exclusion and must not be reported as one.
    if (gap <= 1) continue;
    exclusions.push({
      playerKey,
      name: current.name,
      role: current.role,
      team: current.team,
      lastObservedSeason: current.season,
      targetSeason,
      seasonsSinceLastObserved: gap,
      reason: "STALE_LAST_OBSERVED_SEASON",
    });
  }

  return exclusions.sort((a, b) => {
    const left = `${a.role}|${a.name.normalize("NFC")}|${a.playerKey}`;
    const right = `${b.role}|${b.name.normalize("NFC")}|${b.playerKey}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

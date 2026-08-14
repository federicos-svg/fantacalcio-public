import type {
  AnagraficaAgeIndex,
  FeatureName,
  FeatureVector,
  PlayerSeasonPanelRow,
  Role,
} from "./types.js";
import { FEATURE_NAMES } from "./types.js";
import type { PlayerSeasonPanel } from "./dataset.js";
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
  readonly missingFeatures: readonly FeatureName[];
  readonly sourceSeasons: readonly string[];
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
      volatilitaVotoLag1: current.volatilitaVoto ?? Number.NaN,
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

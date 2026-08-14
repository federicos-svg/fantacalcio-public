// Player-season panel + feature/target builder — PURE, no I/O.
//
// Joins per-season aggregates (seasonAggregate.ts) across seasons into a
// panel via the resolved, non-canonical playerKey (playerKey.ts), then
// builds supervised feature rows for "predict next season" targets. Anti-
// leakage is enforced BOTH structurally (features only ever read seasons
// strictly earlier than the target season) AND at runtime via
// `assertNoLeakage()`, which re-derives the guarantee from each row's
// `sourceSeasons` audit trail instead of trusting the construction code.

import type {
  AnagraficaAgeIndex,
  FeatureRow,
  FeatureVector,
  PlayerSeasonAggregate,
  PlayerSeasonPanelRow,
  Role,
  TargetVector,
  VoteRecordCandidate,
} from "./types.js";
import { FEATURE_NAMES } from "./types.js";
import { buildPlayerSeasonAggregates } from "./seasonAggregate.js";
import {
  analyzeIdentityKeyStability,
  seasonYear,
  sortSeasons,
  type IdentityStabilityReport,
  type SeasonRosterEntry,
} from "./identityStability.js";
import { resolvePlayerKey } from "./playerKey.js";
import { buildGoalkeeperFeatureVector } from "./goalkeeperFeatures.js";
import { mean } from "./stats.js";

export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetError";
  }
}

export class LeakageGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeakageGuardError";
  }
}

export interface SeasonRecords {
  readonly season: string;
  readonly records: readonly VoteRecordCandidate[];
}

export interface PlayerSeasonPanel {
  readonly rows: readonly PlayerSeasonPanelRow[];
  readonly identity: IdentityStabilityReport;
  readonly orderedSeasons: readonly string[];
}

/**
 * Build the cross-season player-season panel from per-season vote records.
 * Runs the Id/Cod. stability check (identityStability.ts) ONCE, over every
 * season given, and resolves every row's `playerKey` from that single
 * verdict — never per-pair ad hoc.
 */
export function buildPlayerSeasonPanel(seasons: readonly SeasonRecords[]): PlayerSeasonPanel {
  if (seasons.length === 0) throw new DatasetError("buildPlayerSeasonPanel: no seasons given");
  const seasonNames = seasons.map((s) => s.season);
  const seen = new Set<string>();
  for (const s of seasonNames) {
    if (seen.has(s)) throw new DatasetError(`buildPlayerSeasonPanel: duplicate season '${s}'`);
    seen.add(s);
  }

  const orderedSeasons = sortSeasons(seasonNames);

  const aggregatesBySeason = new Map<string, PlayerSeasonAggregate[]>();
  const rosterEntries: SeasonRosterEntry[] = [];
  for (const s of seasons) {
    const aggs = buildPlayerSeasonAggregates(s.season, s.records);
    aggregatesBySeason.set(s.season, aggs);
    for (const a of aggs) {
      rosterEntries.push({ season: a.season, externalId: a.externalId, name: a.name, role: a.role });
    }
  }

  const identity = analyzeIdentityKeyStability(rosterEntries);

  const rows: PlayerSeasonPanelRow[] = [];
  for (const season of orderedSeasons) {
    for (const a of aggregatesBySeason.get(season)!) {
      rows.push({ ...a, playerKey: resolvePlayerKey(a, identity) });
    }
  }

  return { rows, identity, orderedSeasons };
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

export interface FeatureBuildOptions {
  /** Rolling-window size for *RollingMean* features (default 3, per the
   *  task's own "ultime 3 stagioni" convention used elsewhere in this repo's
   *  benchmark contract). */
  readonly rollingWindow?: number;
  /**
   * Resolved ages from the governed Wikidata anagrafica pipeline, season ->
   * playerKey -> age at that season's start. Omitted entirely (or missing an
   * entry) leaves `ageAtSeasonStart` at `NaN` for the affected rows, which the
   * existing `missingFeatures` audit records and the complete-case pipeline
   * drops. Never a zero, never an imputed value at this layer.
   */
  readonly anagrafica?: AnagraficaAgeIndex;
}

/**
 * Age at the start of the row's OWN feature season, not the target season.
 *
 * Either would be defensible — a birth date is a static attribute, so age at
 * the target season's start is knowable before that season too, and carries no
 * leakage. The feature season is chosen because it keeps the literal invariant
 * this builder proves elsewhere: every number in `features` is read from the
 * player's observed seasons `<= s`, so `sourceSeasons` remains a complete
 * account of the row's provenance and `assertNoLeakage()` keeps verifying the
 * whole vector rather than the whole vector minus one exception. Nothing is
 * lost by it: age at `s+1` is age at `s` plus one, up to the birthday.
 */
function ageAtSeasonStart(
  anagrafica: AnagraficaAgeIndex | undefined,
  season: string,
  playerKey: string,
): number {
  return anagrafica?.get(season)?.get(playerKey) ?? Number.NaN;
}

/**
 * Build supervised feature rows: for each player and each season `s` where
 * that same player also has a row in the season immediately following `s`
 * in the GLOBAL season sequence (`panel.orderedSeasons`), emit one row whose
 * features are built ONLY from that player's own observed seasons `<= s`
 * and whose targets come ONLY from season `s+1`.
 *
 * Players who do not appear in `s+1` (left the panel — relegation, real
 * career end, transfer out of the tracked league, etc.) are excluded from
 * the supervised set by construction: this pipeline predicts performance
 * CONDITIONAL ON staying in the panel, not churn/survival — a documented
 * limitation (docs/data/APPEAL_INDEX_OFFLINE_ML_CONTRACT.md), not a bug.
 */
export function buildFeatureRows(panel: PlayerSeasonPanel, opts: FeatureBuildOptions = {}): FeatureRow[] {
  const window = opts.rollingWindow ?? 3;
  const seasonIndex = new Map<string, number>(panel.orderedSeasons.map((s, i) => [s, i]));

  const byPlayer = new Map<string, PlayerSeasonPanelRow[]>();
  for (const row of panel.rows) {
    if (!byPlayer.has(row.playerKey)) byPlayer.set(row.playerKey, []);
    byPlayer.get(row.playerKey)!.push(row);
  }

  const out: FeatureRow[] = [];

  for (const [playerKey, playerRows] of byPlayer) {
    const sorted = [...playerRows].sort(
      (a, b) => seasonIndex.get(a.season)! - seasonIndex.get(b.season)!,
    );
    const bySeason = new Map(sorted.map((r) => [r.season, r]));

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i]!;
      const s = current.season;
      const sIdx = seasonIndex.get(s)!;
      const nextGlobalSeason = panel.orderedSeasons[sIdx + 1];
      if (nextGlobalSeason === undefined) continue; // s is the last known season overall — no target available
      const targetRow = bySeason.get(nextGlobalSeason);
      if (targetRow === undefined) continue; // player not present in s+1 — excluded (see doc above)
      // Fase 2: null fantamedia is not observable; presenzeNext=0 remains valid.
      // The transition is preserved and availability is recorded below.

      // History used for THIS row's features: this player's own observed
      // seasons up to and including `s` (index 0..i). Never index > i.
      const history = sorted.slice(0, i + 1);
      const historySeasons = history.map((h) => h.season);

      const fantamediaHistory = history.map((h) => h.fantamedia).filter((v): v is number => v !== null);
      const presenzeHistory = history.map((h) => h.presenze);
      const golHistory = history.map((h) => h.golFatti);
      const assistHistory = history.map((h) => h.assist);
      const volatilita = current.volatilitaVoto;

      const previous = i > 0 ? sorted[i - 1] : undefined;
      const teamChangedFlag = previous !== undefined && previous.team !== current.team ? 1 : 0;

      const features: FeatureVector = {
        fantamediaLag1: current.fantamedia ?? Number.NaN,
        fantamediaRollingMean3:
          fantamediaHistory.length > 0 ? rollingMean(fantamediaHistory, window) : Number.NaN,
        presenzeLag1: current.presenze,
        presenzeRollingMean3: rollingMean(presenzeHistory, window),
        volatilitaVotoLag1: volatilita ?? Number.NaN,
        nSeasonsObserved: history.length,
        golFattiRollingMean3: rollingMean(golHistory, window),
        assistRollingMean3: rollingMean(assistHistory, window),
        teamChangedFlag,
        ageAtSeasonStart: ageAtSeasonStart(opts.anagrafica, s, playerKey),
        ...roleOneHot(current.role),
      };

      const targets: TargetVector = {
        fantamediaNext: targetRow.fantamedia ?? Number.NaN,
        presenzeNext: targetRow.presenze,
      };
      const missingFeatures = FEATURE_NAMES.filter((name) => !Number.isFinite(features[name]));

      out.push({
        playerKey,
        name: current.name,
        role: current.role,
        featureSeason: s,
        targetSeason: nextGlobalSeason,
        features,
        ...(current.role === "P"
          ? { goalkeeperFeatures: buildGoalkeeperFeatureVector(history, teamChangedFlag, window) }
          : {}),
        targets,
        missingFeatures,
        targetAvailability: {
          fantamediaNext: targetRow.fantamedia === null ? "not_observable" : "observed",
          presenzeNext: "observed",
        },
        sourceSeasons: historySeasons,
      });
    }
  }

  assertNoLeakage(out);
  return out;
}

/**
 * Re-derive, from each row's `sourceSeasons` audit trail, that no season
 * used to build its features is the target season or later. This is a real
 * check against the row's own recorded provenance, not a tautology repeated
 * from the construction code — a deliberately induced violation (see
 * dataset.test.ts) is caught by this function.
 */
export function assertNoLeakage(rows: readonly FeatureRow[]): void {
  for (const row of rows) {
    const targetYear = seasonYear(row.targetSeason);
    const featureYear = seasonYear(row.featureSeason);
    if (featureYear >= targetYear) {
      throw new LeakageGuardError(
        `LeakageGuardError: featureSeason '${row.featureSeason}' is not strictly before ` +
          `targetSeason '${row.targetSeason}' for player '${row.playerKey}'`,
      );
    }
    for (const src of row.sourceSeasons) {
      if (seasonYear(src) >= targetYear) {
        throw new LeakageGuardError(
          `LeakageGuardError: sourceSeasons for player '${row.playerKey}' (target ` +
            `'${row.targetSeason}') includes '${src}', which is not strictly before the target season`,
        );
      }
    }
    if (row.sourceSeasons.length === 0 || row.sourceSeasons[row.sourceSeasons.length - 1] !== row.featureSeason) {
      throw new LeakageGuardError(
        `LeakageGuardError: sourceSeasons for player '${row.playerKey}' does not end at its own ` +
          `featureSeason '${row.featureSeason}' — malformed audit trail`,
      );
    }
  }
}

export { FEATURE_NAMES };

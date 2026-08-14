// Synthetic multi-season fixtures — NO real player/team names, NO real data.
// Deliberately deterministic (no Math.random): every "signal" (vote level,
// goals, assists, cards) is a fixed formula of the matchday index, so the
// same fixture always produces the same numbers (see endToEnd.test.ts
// determinism check).

import type { AnagraficaAgeIndex, Role, VoteRecordCandidate } from "../src/types.js";
import { buildPlayerSeasonPanel, type PlayerSeasonPanel, type SeasonRecords } from "../src/dataset.js";
import { seasonYear, type SeasonRosterEntry } from "../src/identityStability.js";

const TOTAL_MATCHDAYS = 10; // a small synthetic season — enough for non-trivial aggregates, not the real 38

function roundHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

function wave(i: number, amplitude: number, phase: number): number {
  return amplitude * Math.sin((i + phase) * 0.8);
}

/** Deterministic season-to-season presence variation (injury-dip-like), so
 *  `presenze` is not a trivially constant series for every player — clamped
 *  to a sane [3, TOTAL_MATCHDAYS] range. */
function mdWave(seasonIndex: number, base: number, amplitude: number, phase: number): number {
  const v = Math.round(base + amplitude * Math.sin((seasonIndex + phase) * 1.1));
  return Math.min(TOTAL_MATCHDAYS, Math.max(3, v));
}

interface SeasonSpec {
  readonly season: string;
  readonly externalId: number;
  readonly name: string;
  readonly role: Role;
  readonly team: string;
  readonly baseVoto: number;
  readonly matchdaysPlayed: number; // plays matchdays 1..matchdaysPlayed, benched (blank) after
  readonly goalEveryN: number; // 0 = never
  readonly assistEveryN: number;
  readonly cardEveryN: number;
  /** Goalkeeper-only: a matchday conceding one goal every N. 0/absent = never
   *  concedes, which is also what an outfield player's empty `Gs` means. */
  readonly concededEveryN?: number;
  readonly penaltySavedEveryN?: number;
}

export interface SyntheticPlayerTimeline {
  readonly label: string; // documentation only
  readonly seasons: readonly SeasonSpec[];
}

function buildPlayerMatchdayRecords(spec: SeasonSpec): VoteRecordCandidate[] {
  const out: VoteRecordCandidate[] = [];
  for (let md = 1; md <= TOTAL_MATCHDAYS; md++) {
    if (md > spec.matchdaysPlayed) {
      out.push({
        source_id: "fantacalcio_xlsx",
        vote_source: "italia",
        season: spec.season,
        matchday: md,
        external_id: spec.externalId,
        canonical_player_id: null,
        team: spec.team,
        role: spec.role,
        name: spec.name,
        voto_raw: "",
        voto_base: null,
        is_asterisk: false,
        is_sv: false,
        is_blank: true,
        is_real_performance: false,
      });
      continue;
    }
    const votoBase = Math.min(9, Math.max(5, roundHalf(spec.baseVoto + wave(md, 0.5, spec.externalId % 7))));
    const record: VoteRecordCandidate = {
      source_id: "fantacalcio_xlsx",
      vote_source: "italia",
      season: spec.season,
      matchday: md,
      external_id: spec.externalId,
      canonical_player_id: null,
      team: spec.team,
      role: spec.role,
      name: spec.name,
      voto_raw: votoBase,
      voto_base: votoBase,
      is_asterisk: false,
      is_sv: false,
      is_blank: false,
      is_real_performance: true,
      ...(spec.goalEveryN > 0 && md % spec.goalEveryN === 0 ? { Gf: 1 } : {}),
      ...(spec.assistEveryN > 0 && md % spec.assistEveryN === 0 ? { Ass: 1 } : {}),
      ...(spec.cardEveryN > 0 && md % spec.cardEveryN === 0 ? { Amm: 1 } : {}),
      ...(spec.concededEveryN !== undefined && spec.concededEveryN > 0 && md % spec.concededEveryN === 0
        ? { Gs: 1 + (md % 3) }
        : {}),
      ...(spec.penaltySavedEveryN !== undefined && spec.penaltySavedEveryN > 0 && md % spec.penaltySavedEveryN === 0
        ? { Rp: 1 }
        : {}),
    };
    out.push(record);
  }
  return out;
}

/**
 * The main synthetic cohort: 7 seasons, 8 players spanning all 4 roles,
 * deliberately including a veteran (full history), a late arrival (short
 * history / cold start), a mid-career dropout (churn — leaves the panel,
 * exercising the "excluded by construction" limitation) and a high-volatility
 * player (exercises continuità/rischio heuristics).
 */
const SEASONS: readonly string[] = [
  "2018_19",
  "2019_20",
  "2020_21",
  "2021_22",
  "2022_23",
  "2023_24",
  "2024_25",
];

const TIMELINES: readonly SyntheticPlayerTimeline[] = [
  {
    label: "goalkeeper, full history, stable",
    seasons: SEASONS.map((season, i) => ({
      season,
      externalId: 101,
      name: "Verdi Synthetic P1",
      role: "P" as const,
      team: "Synthetic Team Alpha",
      baseVoto: 6.0,
      matchdaysPlayed: mdWave(i, 8, 1.5, 1),
      goalEveryN: 0,
      assistEveryN: 0,
      cardEveryN: 6,
    })),
  },
  {
    label: "defender, full history, stable",
    seasons: SEASONS.map((season, i) => ({
      season,
      externalId: 201,
      name: "Neri Synthetic D1",
      role: "D" as const,
      team: "Synthetic Team Alpha",
      baseVoto: 6.1,
      matchdaysPlayed: mdWave(i, 7, 2, 3),
      goalEveryN: 9,
      assistEveryN: 8,
      cardEveryN: 4,
    })),
  },
  {
    label: "defender, late arrival (cold start, last 3 seasons only)",
    seasons: SEASONS.slice(-3).map((season, i) => ({
      season,
      externalId: 202,
      name: "Gialli Synthetic D2",
      role: "D" as const,
      team: "Synthetic Team Beta",
      baseVoto: 5.8 + i * 0.15,
      matchdaysPlayed: 7,
      goalEveryN: 0,
      assistEveryN: 7,
      cardEveryN: 5,
    })),
  },
  {
    label: "midfielder, full history, good assist rate",
    seasons: SEASONS.map((season, i) => ({
      season,
      externalId: 301,
      name: "Bruni Synthetic C1",
      role: "C" as const,
      team: "Synthetic Team Alpha",
      baseVoto: 6.2,
      matchdaysPlayed: mdWave(i, 8, 1.5, 5),
      goalEveryN: 7,
      assistEveryN: 3,
      cardEveryN: 8,
    })),
  },
  {
    label: "midfielder, declining then leaves the panel (churn)",
    seasons: SEASONS.slice(0, 5).map((season, i) => ({
      season,
      externalId: 302,
      name: "Rossi Synthetic C2",
      role: "C" as const,
      team: "Synthetic Team Gamma",
      baseVoto: 6.5 - i * 0.15,
      matchdaysPlayed: 8 - i,
      goalEveryN: 8,
      assistEveryN: 5,
      cardEveryN: 6,
    })),
  },
  {
    label: "forward, full history, rising star (upward trend, frequent goals)",
    seasons: SEASONS.map((season, i) => ({
      season,
      externalId: 401,
      name: "Bianchi Synthetic A1",
      role: "A" as const,
      team: "Synthetic Team Alpha",
      baseVoto: 6.3 + i * 0.1,
      matchdaysPlayed: mdWave(i, 8, 1.5, 2),
      goalEveryN: 2,
      assistEveryN: 6,
      cardEveryN: 9,
    })),
  },
  {
    label: "forward, full history, high volatility",
    seasons: SEASONS.map((season, i) => ({
      season,
      externalId: 402,
      name: "Ferrari Synthetic A2",
      role: "A" as const,
      team: "Synthetic Team Beta",
      baseVoto: 6.4,
      matchdaysPlayed: mdWave(i, 6, 2.5, 0),
      goalEveryN: 3,
      assistEveryN: 9,
      cardEveryN: 5,
    })),
  },
  {
    label: "forward, very late arrival (last 2 seasons only)",
    seasons: SEASONS.slice(-2).map((season) => ({
      season,
      externalId: 403,
      name: "Colombo Synthetic A3",
      role: "A" as const,
      team: "Synthetic Team Gamma",
      baseVoto: 6.0,
      matchdaysPlayed: 7,
      goalEveryN: 4,
      assistEveryN: 7,
      cardEveryN: 7,
    })),
  },
];

/** The main stable-identity cohort — 7 seasons of VoteRecordCandidate[], keyed by external_id, no cross-season anomalies. */
export function buildStableCohortSeasons(): SeasonRecords[] {
  const bySeason = new Map<string, VoteRecordCandidate[]>();
  for (const season of SEASONS) bySeason.set(season, []);
  for (const timeline of TIMELINES) {
    for (const spec of timeline.seasons) {
      bySeason.get(spec.season)!.push(...buildPlayerMatchdayRecords(spec));
    }
  }
  return SEASONS.map((season) => ({ season, records: bySeason.get(season)! }));
}

/**
 * A goalkeeper-heavy synthetic cohort over an arbitrary season list, sized by
 * the caller so a test can put the goalkeeper sample guard on either side of
 * its threshold on purpose. Every goalkeeper concedes and saves on a fixed
 * function of its own id, so `Gs`, `Rp` and the clean-sheet count all vary
 * across the cohort while staying fully deterministic.
 *
 * `outfieldPerSeason` adds non-goalkeeper players so the panel is not
 * degenerate; they carry no `Gs`/`Rp`, exactly like the real sheets.
 */
export function buildGoalkeeperCohortSeasons(
  seasons: readonly string[],
  goalkeeperCount: number,
  outfieldPerSeason = 4,
): SeasonRecords[] {
  const specs: SeasonSpec[] = [];
  for (const [seasonIndex, season] of seasons.entries()) {
    for (let i = 0; i < goalkeeperCount; i++) {
      specs.push({
        season,
        externalId: 1000 + i,
        name: `Synthetic Keeper ${i}`,
        role: "P",
        team: `Synthetic Team ${i % 5}`,
        baseVoto: 5.5 + (i % 5) * 0.1,
        matchdaysPlayed: mdWave(seasonIndex, 8, 1.5, i % 7),
        goalEveryN: 0,
        assistEveryN: 0,
        cardEveryN: 7 + (i % 3),
        concededEveryN: 1 + (i % 4),
        penaltySavedEveryN: 5 + (i % 4),
      });
    }
    for (let i = 0; i < outfieldPerSeason; i++) {
      specs.push({
        season,
        externalId: 2000 + i,
        name: `Synthetic Outfield ${i}`,
        role: (["D", "C", "A"] as const)[i % 3]!,
        team: `Synthetic Team ${i % 5}`,
        baseVoto: 6.0 + (i % 4) * 0.1,
        matchdaysPlayed: mdWave(seasonIndex, 7, 2, i % 5),
        goalEveryN: 4 + (i % 3),
        assistEveryN: 5 + (i % 3),
        cardEveryN: 6,
      });
    }
  }

  const bySeason = new Map<string, VoteRecordCandidate[]>();
  for (const season of seasons) bySeason.set(season, []);
  for (const spec of specs) bySeason.get(spec.season)!.push(...buildPlayerMatchdayRecords(spec));
  return seasons.map((season) => ({ season, records: bySeason.get(season)! }));
}

/**
 * Two seasons crafted to make `external_id` clearly UNSTABLE: id 555 belongs
 * to a different player in each season (collision), and a same-named player
 * appears under two different ids across the two seasons (drift). Used to
 * exercise identityStability.ts's "unstable" verdict and dataset.ts's
 * fallback join key.
 */
export function buildUnstableIdentitySeasons(): SeasonRecords[] {
  const seasonA = "2020_21";
  const seasonB = "2021_22";

  const collisionA: SeasonSpec = {
    season: seasonA,
    externalId: 555,
    name: "Marroni Synthetic X",
    role: "C",
    team: "Synthetic Team Delta",
    baseVoto: 6.0,
    matchdaysPlayed: 8,
    goalEveryN: 5,
    assistEveryN: 4,
    cardEveryN: 6,
  };
  const collisionB: SeasonSpec = {
    ...collisionA,
    season: seasonB,
    name: "Azzurri Synthetic Y", // same id 555, DIFFERENT player -> collision
  };

  const driftA: SeasonSpec = {
    season: seasonA,
    externalId: 601,
    name: "Viola Synthetic Z",
    role: "A",
    team: "Synthetic Team Epsilon",
    baseVoto: 6.2,
    matchdaysPlayed: 7,
    goalEveryN: 3,
    assistEveryN: 6,
    cardEveryN: 7,
  };
  const driftB: SeasonSpec = {
    ...driftA,
    season: seasonB,
    externalId: 602, // same player (same name), DIFFERENT id -> drift
  };

  // Enough "boring" stable pairs so the aggregate rates are measurable and
  // exceed the minimum sample size in analyzeIdentityKeyStability().
  const stablePairs: SeasonSpec[] = Array.from({ length: 12 }, (_, i) => {
    const idBase = 700 + i;
    return {
      season: seasonA,
      externalId: idBase,
      name: `Stable Synthetic Player ${i}`,
      role: (["P", "D", "C", "A"] as const)[i % 4]!,
      team: "Synthetic Team Zeta",
      baseVoto: 6.0,
      matchdaysPlayed: 8,
      goalEveryN: 6,
      assistEveryN: 5,
      cardEveryN: 6,
    };
  });
  const stablePairsB: SeasonSpec[] = stablePairs.map((s) => ({ ...s, season: seasonB }));

  const seasonARecords = [collisionA, driftA, ...stablePairs].flatMap(buildPlayerMatchdayRecords);
  const seasonBRecords = [collisionB, driftB, ...stablePairsB].flatMap(buildPlayerMatchdayRecords);

  return [
    { season: seasonA, records: seasonARecords },
    { season: seasonB, records: seasonBRecords },
  ];
}

/** Minimal roster entries (no matchday records) for identityStability.test.ts, built directly without VoteRecordCandidate plumbing. */
export function rosterEntriesFromSeasonRecords(seasons: readonly SeasonRecords[]): SeasonRosterEntry[] {
  const out: SeasonRosterEntry[] = [];
  const seen = new Set<string>();
  for (const s of seasons) {
    for (const r of s.records) {
      if (r.role === "ALL") continue;
      const key = `${s.season}:${r.external_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ season: s.season, externalId: r.external_id, name: r.name, role: r.role });
    }
  }
  return out;
}

export { SEASONS as SYNTHETIC_SEASON_LIST };

/**
 * A synthetic anagrafica for whatever cohort a panel contains — the
 * `season -> playerKey -> age at that season's start` index `buildFeatureRows`
 * consumes for `ageAtSeasonStart` (@2.2.0).
 *
 * NOTHING real is involved: there is no QID, no birth date and no Wikidata
 * payload here. A deterministic pseudo-birth-year is derived from the
 * playerKey's own characters, so a fixture player's age is stable across runs
 * and varies across the cohort — enough for a feature that must not be
 * constant, without inventing a person.
 *
 * `resolvedFraction` reproduces partial coverage on purpose: the LAST players
 * in sorted key order are left out entirely (no entry at all, never a zero and
 * never a placeholder age), which is exactly what an unresolved or
 * under-review Wikidata join produces downstream.
 */
export function buildSyntheticAnagrafica(
  panel: PlayerSeasonPanel,
  opts: { readonly resolvedFraction?: number } = {},
): AnagraficaAgeIndex {
  const fraction = Math.min(1, Math.max(0, opts.resolvedFraction ?? 1));
  const playerKeys = [...new Set(panel.rows.map((row) => row.playerKey))].sort();
  const resolvedCount = Math.floor(playerKeys.length * fraction);
  const resolved = new Set(playerKeys.slice(0, resolvedCount));

  const pseudoBirthYear = (playerKey: string): number => {
    let accumulator = 0;
    for (const character of playerKey) accumulator = (accumulator * 31 + character.charCodeAt(0)) % 1_000;
    return 1985 + (accumulator % 15);
  };

  const index = new Map<string, Map<string, number>>();
  for (const row of panel.rows) {
    if (!resolved.has(row.playerKey)) continue;
    const bySeason = index.get(row.season) ?? new Map<string, number>();
    bySeason.set(row.playerKey, seasonYear(row.season) - pseudoBirthYear(row.playerKey));
    index.set(row.season, bySeason);
  }
  return index;
}

/** Same fixture, for callers that hold the raw seasons rather than a built panel. */
export function buildSyntheticAnagraficaForSeasons(
  seasons: readonly SeasonRecords[],
  opts: { readonly resolvedFraction?: number } = {},
): AnagraficaAgeIndex {
  return buildSyntheticAnagrafica(buildPlayerSeasonPanel(seasons), opts);
}

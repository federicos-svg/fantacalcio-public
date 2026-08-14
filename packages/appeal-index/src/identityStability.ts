// Id/Cod. cross-season stability checker — PURE, no I/O.
//
// docs/RISK_REGISTER.md R1 already records this project's own closed
// finding: "abbandonato il Cod. Fantacalcio stabile" (HIGH risk). This
// module does NOT assume the opposite — it measures it, automatically,
// against whatever season rosters it is given, and returns an explicit
// verdict + a recommended fallback join key. It never sets
// `canonical_player_id` / `data_promoted`: this is a local, offline,
// ML-only signal — see docs/data/APPEAL_INDEX_OFFLINE_ML_CONTRACT.md.

import type { Role } from "./types.js";
import { normalizePlayerName } from "./nameNormalization.js";

export interface SeasonRosterEntry {
  readonly season: string; // "YYYY_YY"
  readonly externalId: number; // per-file "Cod."
  readonly name: string;
  readonly role: Role;
}

export interface SeasonPairDiagnostics {
  readonly seasonA: string;
  readonly seasonB: string;
  /** Same externalId AND same normalized name in both seasons. */
  readonly stableMatches: number;
  /** Same normalized name, but a DIFFERENT externalId ("key drifted"). */
  readonly driftCases: number;
  /** Same externalId, but a DIFFERENT normalized name ("key reused/collided"). */
  readonly collisionCases: number;
  readonly onlyInA: number;
  readonly onlyInB: number;
}

export type IdentityKeyVerdict = "stable" | "unstable" | "insufficient_data";

export interface IdentityStabilityReport {
  readonly seasonsAnalyzed: readonly string[];
  readonly pairwise: readonly SeasonPairDiagnostics[];
  readonly withinSeasonCollisions: number;
  readonly stableMatchRate: number;
  readonly driftRate: number;
  readonly collisionRate: number;
  readonly verdict: IdentityKeyVerdict;
  readonly recommendedJoinKey: "external_id" | "normalized_name_role";
  readonly notes: readonly string[];
}

const STABLE_MATCH_RATE_THRESHOLD = 0.98;
// Mirrors docs/BACKLOG.md ID-03's "false-match < 0.5%" bar for the (much
// higher-stakes) canonical identity gate — reused here as a conservative bar
// for this lightweight, offline-only checker, not as a claim of equivalence.
const COLLISION_RATE_THRESHOLD = 0.005;
const MIN_COMPARABLE_CASES_FOR_VERDICT = 10;

/** "YYYY_YY" -> the starting year, e.g. "2024_25" -> 2024. The single source
 *  of truth for season ordering across this whole package. */
export function seasonYear(season: string): number {
  const m = /^([0-9]{4})_([0-9]{2})$/.exec(season);
  if (!m) throw new Error(`seasonYear: invalid season '${season}' (expected YYYY_YY)`);
  return Number(m[1]);
}

export function sortSeasons(seasons: readonly string[]): string[] {
  // Validate every entry up front — Array.prototype.sort's comparator is not
  // guaranteed to run for arrays of length < 2, so relying on it alone would
  // silently skip validation for single-season input.
  const withYear = seasons.map((s) => ({ s, y: seasonYear(s) }));
  return withYear.sort((a, b) => a.y - b.y).map((x) => x.s);
}

function countWithinSeasonCollisions(entries: readonly SeasonRosterEntry[]): number {
  const bySeason = new Map<string, Map<number, Set<string>>>();
  for (const e of entries) {
    let seasonMap = bySeason.get(e.season);
    if (!seasonMap) {
      seasonMap = new Map();
      bySeason.set(e.season, seasonMap);
    }
    let names = seasonMap.get(e.externalId);
    if (!names) {
      names = new Set();
      seasonMap.set(e.externalId, names);
    }
    names.add(normalizePlayerName(e.name));
  }
  let collisions = 0;
  for (const seasonMap of bySeason.values()) {
    for (const names of seasonMap.values()) {
      if (names.size > 1) collisions++;
    }
  }
  return collisions;
}

/**
 * Analyze whether `externalId` ("Cod.") is a usable cross-season join key,
 * purely from the rosters given (one or more seasons). Verdict thresholds
 * are conservative on purpose: given R1's documented history, the default
 * posture is skepticism, not trust.
 */
export function analyzeIdentityKeyStability(
  entries: readonly SeasonRosterEntry[],
): IdentityStabilityReport {
  const seasons = sortSeasons([...new Set(entries.map((e) => e.season))]);
  const notes: string[] = [];

  const withinSeasonCollisions = countWithinSeasonCollisions(entries);
  if (withinSeasonCollisions > 0) {
    notes.push(
      `${withinSeasonCollisions} within-season externalId collision(s) — violates the documented ` +
        "per-file uniqueness contract (FANTACALCIO_XLSX_CONTRACT.md); a data-quality issue, not " +
        "cross-season instability.",
    );
  }

  // season -> externalId -> normalizedName (first seen)
  const idsBySeason = new Map<string, Map<number, string>>();
  // season -> normalizedName -> externalId (first seen)
  const namesBySeason = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const norm = normalizePlayerName(e.name);
    if (!idsBySeason.has(e.season)) idsBySeason.set(e.season, new Map());
    const idMap = idsBySeason.get(e.season)!;
    if (!idMap.has(e.externalId)) idMap.set(e.externalId, norm);
    if (!namesBySeason.has(e.season)) namesBySeason.set(e.season, new Map());
    const nameMap = namesBySeason.get(e.season)!;
    if (!nameMap.has(norm)) nameMap.set(norm, e.externalId);
  }

  const pairwise: SeasonPairDiagnostics[] = [];
  let totalStable = 0;
  let totalDrift = 0;
  let totalCollision = 0;

  for (let i = 0; i < seasons.length - 1; i++) {
    const a = seasons[i]!;
    const b = seasons[i + 1]!;
    const idsA = idsBySeason.get(a)!;
    const idsB = idsBySeason.get(b)!;
    const namesA = namesBySeason.get(a)!;
    const namesB = namesBySeason.get(b)!;

    let stableMatches = 0;
    let driftCases = 0;
    let collisionCases = 0;
    let onlyInA = 0;
    let onlyInB = 0;

    const allIds = new Set([...idsA.keys(), ...idsB.keys()]);
    for (const id of allIds) {
      const nameA = idsA.get(id);
      const nameB = idsB.get(id);
      if (nameA !== undefined && nameB !== undefined) {
        if (nameA === nameB) stableMatches++;
        else collisionCases++;
      } else if (nameA !== undefined) {
        onlyInA++;
      } else {
        onlyInB++;
      }
    }

    const allNames = new Set([...namesA.keys(), ...namesB.keys()]);
    for (const name of allNames) {
      const idA = namesA.get(name);
      const idB = namesB.get(name);
      if (idA !== undefined && idB !== undefined && idA !== idB) driftCases++;
    }

    pairwise.push({ seasonA: a, seasonB: b, stableMatches, driftCases, collisionCases, onlyInA, onlyInB });
    totalStable += stableMatches;
    totalDrift += driftCases;
    totalCollision += collisionCases;
  }

  const totalComparable = totalStable + totalDrift + totalCollision;
  const stableMatchRate = totalComparable > 0 ? totalStable / totalComparable : 0;
  const driftRate = totalComparable > 0 ? totalDrift / totalComparable : 0;
  const collisionRate = totalComparable > 0 ? totalCollision / totalComparable : 0;

  let verdict: IdentityKeyVerdict;
  if (totalComparable < MIN_COMPARABLE_CASES_FOR_VERDICT) {
    verdict = "insufficient_data";
    notes.push(
      `Only ${totalComparable} comparable cross-season case(s) — below the minimum ` +
        `(${MIN_COMPARABLE_CASES_FOR_VERDICT}) needed for a verdict; defaulting to the conservative ` +
        "fallback key.",
    );
  } else if (stableMatchRate >= STABLE_MATCH_RATE_THRESHOLD && collisionRate < COLLISION_RATE_THRESHOLD) {
    verdict = "stable";
  } else {
    verdict = "unstable";
    notes.push(
      "Below the stability threshold — consistent with docs/RISK_REGISTER.md R1 " +
        "('abbandonato il Cod. Fantacalcio stabile'): do not trust external_id alone as a " +
        "cross-season key for this dataset.",
    );
  }

  return {
    seasonsAnalyzed: seasons,
    pairwise,
    withinSeasonCollisions,
    stableMatchRate,
    driftRate,
    collisionRate,
    verdict,
    recommendedJoinKey: verdict === "stable" ? "external_id" : "normalized_name_role",
    notes,
  };
}

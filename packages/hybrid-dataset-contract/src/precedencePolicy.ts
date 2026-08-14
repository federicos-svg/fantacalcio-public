import type { PreferredSourceCandidate, PrecedenceResponsibility } from "./types.js";

// Season-aware, evidence-backed precedence policy v1. Every row must cite the
// evidence it is backed by — never "API-Football because it's structured", never
// "Transfermarkt because it looks more historical" (explicit constraint of the batch).
// Source: docs/data/HYBRID_ALGORITHM_DATASET_CONTRACT.md §"Precedence policy".
//
// `preferredSourceCandidate` is architectural intent, not authority: it names which
// source the hybrid design *wants* to lean on for this field. `transfermarktPilotVerified`
// / `apiFootballPilotVerified` are the only things that can promote a candidate to real
// authority — each must be `true` only when a real pilot (real HTTP calls that actually
// reached that specific source and returned usable data) backs this specific
// field/season, never a browser reconnaissance report, an adapter's fixture-only
// implementation, or a blocked pilot attempt. The two flags are tracked independently
// per source so a `both` candidate can never be promoted to DERIVED_FROM_BOTH on the
// strength of only one verified source. Use `effectiveResponsibility()` to derive the
// value that is safe to hand to classifyConflict() — never read
// `preferredSourceCandidate` directly for that.
export interface PrecedenceRule {
  readonly field: string;
  readonly seasonFromYear: number;
  readonly seasonToYear: number | null;
  readonly preferredSourceCandidate: PreferredSourceCandidate;
  readonly transfermarktPilotVerified: boolean;
  readonly apiFootballPilotVerified: boolean;
  readonly crossCheck: PrecedenceResponsibility | null;
  readonly evidenceRef: string;
}

export const HYBRID_PRECEDENCE_POLICY_V1: readonly PrecedenceRule[] = [
  {
    field: "player_identity_core",
    seasonFromYear: 2015,
    seasonToYear: null,
    preferredSourceCandidate: "transfermarkt",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: true,
    crossCheck: "CROSS_CHECK_ONLY_API_FOOTBALL",
    evidenceRef: "TRANSFERMARKT_TECHNICAL_RECONNAISSANCE.md#player_profile is VERIFIED_BROWSER_REPORT, not a real pilot — 3 independent real pilot attempts blocked before reaching the source; API-06A players page<=3 is a real passed pilot, cross-check only (not the architectural candidate for this field)",
  },
  {
    field: "provider_ids",
    seasonFromYear: 2015,
    seasonToYear: null,
    preferredSourceCandidate: "both",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: true,
    crossCheck: null,
    evidenceRef: "API-Football exposes source-scoped external IDs via real, passed pilots (API-04/API-06A); Transfermarkt exposes them only by contract/reconnaissance, no real pilot has passed yet — DERIVED_FROM_BOTH requires both, so this is not yet reachable",
  },
  {
    field: "team_season",
    seasonFromYear: 2015,
    seasonToYear: null,
    preferredSourceCandidate: "transfermarkt",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: true,
    crossCheck: "CROSS_CHECK_ONLY_API_FOOTBALL",
    evidenceRef: "no real Transfermarkt pilot passed yet (blocked, see TRANSFERMARKT_STANDINGS_REAL_PILOT.md); API-06A squads real passed pilot, SNAPSHOT_ONLY (no season parameter) — cross-check only, not the architectural candidate",
  },
  {
    field: "transfer_events",
    seasonFromYear: 2015,
    seasonToYear: null,
    preferredSourceCandidate: "transfermarkt",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: true,
    crossCheck: "CROSS_CHECK_ONLY_API_FOOTBALL",
    evidenceRef: "no real Transfermarkt pilot passed yet; API-06A transfers real passed pilot (1 player tested, real HTTP 200) but league-wide cost not measured — cross-check only",
  },
  {
    field: "appearances_minutes_starts_subs",
    seasonFromYear: 2015,
    seasonToYear: null,
    preferredSourceCandidate: "transfermarkt",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: false,
    crossCheck: "CROSS_CHECK_ONLY_API_FOOTBALL",
    evidenceRef: "no real Transfermarkt pilot passed yet; API-Football pilot (API-06A players) reached the source but confirmed the contract has no starts/subs field at all — not verified as available on either side",
  },
  {
    field: "standings",
    seasonFromYear: 2015,
    seasonToYear: 2021,
    preferredSourceCandidate: "transfermarkt",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: false,
    crossCheck: "CROSS_CHECK_ONLY_API_FOOTBALL",
    evidenceRef: "API-04: API-Football plan_restricted 2016-2021 (empirically tested 2016-2026, real pilot ran but returned no usable data) rules out API-Football for these seasons; no real Transfermarkt pilot has passed for these seasons either — candidate only",
  },
  {
    field: "standings",
    seasonFromYear: 2022,
    seasonToYear: 2024,
    preferredSourceCandidate: "api_football",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: true,
    crossCheck: "CROSS_CHECK_ONLY_TRANSFERMARKT",
    evidenceRef: "API-04: standings COMPLETE 2022/2023/2024, real API calls with real HTTP 200 responses — real pilot passed, authority unchanged by this policy version",
  },
  {
    field: "standings",
    seasonFromYear: 2025,
    seasonToYear: null,
    preferredSourceCandidate: "none",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: false,
    crossCheck: null,
    evidenceRef: "API-Football PLAN_RESTRICTED from season 2025 onward (API-04); Transfermarkt pilot blocked, no substitute evidence yet",
  },
  {
    field: "coach_history",
    seasonFromYear: 2015,
    seasonToYear: null,
    preferredSourceCandidate: "transfermarkt",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: true,
    crossCheck: "CROSS_CHECK_ONLY_API_FOOTBALL",
    evidenceRef: "no real Transfermarkt pilot passed yet; API-06A coaches real passed pilot, SNAPSHOT_ONLY (current bench only) — cross-check only, not the architectural candidate",
  },
  {
    field: "injuries_absences",
    seasonFromYear: 2015,
    seasonToYear: null,
    preferredSourceCandidate: "none",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: false,
    crossCheck: null,
    evidenceRef: "Transfermarkt injuries NOT_TESTED (pilot blocked); API-Football injuries has one real passed pilot for 2024 only — historical depth across all seasons in this row is undeclared, not verified as a field-wide statement",
  },
  {
    field: "suspensions",
    seasonFromYear: 2015,
    seasonToYear: null,
    preferredSourceCandidate: "none",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: false,
    crossCheck: null,
    evidenceRef: "no field verified in either pilot",
  },
  {
    field: "api_football_rating",
    seasonFromYear: 2022,
    seasonToYear: 2024,
    preferredSourceCandidate: "api_football",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: true,
    crossCheck: null,
    evidenceRef: "API-06A players endpoint real pilot passed (accessible_with_data, real HTTP 200) for 2022-2024; provider-specific field, never aliased to target vote/fantavoto — real pilot passed, authority unchanged by this policy version",
  },
  {
    field: "transfermarkt_market_value",
    seasonFromYear: 2015,
    seasonToYear: null,
    preferredSourceCandidate: "transfermarkt",
    transfermarktPilotVerified: false,
    apiFootballPilotVerified: false,
    crossCheck: null,
    evidenceRef: "TRUE_HISTORICAL_SNAPSHOT dated tooltip point is VERIFIED_BROWSER_REPORT, not a real automated pilot; NOT_TESTED for the rest, pilot blocked; API-Football has no market value field at all",
  },
] as const;

// The only value classifyConflict() may ever receive as `precedence`. Downgrades an
// unverified candidate to MISSING — a PRIMARY_* responsibility is never emitted
// unless a real pilot backs that specific source, and DERIVED_FROM_BOTH is never
// emitted unless BOTH sources individually have a real passed pilot (see PrecedenceRule
// doc comment above — finding 1, round 3: a single verified source is not enough to
// claim derivation from both).
export function effectiveResponsibility(rule: PrecedenceRule): PrecedenceResponsibility {
  if (rule.preferredSourceCandidate === "both") {
    return rule.transfermarktPilotVerified && rule.apiFootballPilotVerified
      ? "DERIVED_FROM_BOTH"
      : "MISSING";
  }
  if (rule.preferredSourceCandidate === "none") {
    return "MISSING";
  }
  if (rule.preferredSourceCandidate === "transfermarkt") {
    return rule.transfermarktPilotVerified ? "PRIMARY_TRANSFERMARKT" : "MISSING";
  }
  return rule.apiFootballPilotVerified ? "PRIMARY_API_FOOTBALL" : "MISSING";
}

export function getPrecedence(
  field: string,
  seasonStartYear: number,
): PrecedenceRule | null {
  const matches = HYBRID_PRECEDENCE_POLICY_V1.filter(
    (rule) =>
      rule.field === field &&
      seasonStartYear >= rule.seasonFromYear &&
      (rule.seasonToYear === null || seasonStartYear <= rule.seasonToYear),
  );
  if (matches.length === 0) {
    return null;
  }
  // Most specific (narrowest season range) wins if multiple rows match.
  return matches.reduce((narrowest, candidate) => {
    const narrowestSpan = (narrowest.seasonToYear ?? Infinity) - narrowest.seasonFromYear;
    const candidateSpan = (candidate.seasonToYear ?? Infinity) - candidate.seasonFromYear;
    return candidateSpan < narrowestSpan ? candidate : narrowest;
  });
}

// Convenience wrapper for callers that only need the safe, conflict-resolution-ready
// value — never the raw candidate. Returns null when no rule is registered at all.
export function getEffectiveResponsibility(
  field: string,
  seasonStartYear: number,
): PrecedenceResponsibility | null {
  const rule = getPrecedence(field, seasonStartYear);
  return rule === null ? null : effectiveResponsibility(rule);
}

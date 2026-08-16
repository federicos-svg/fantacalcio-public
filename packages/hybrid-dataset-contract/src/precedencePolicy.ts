import type { FeatureSourceName, PrecedenceResponsibility, PreferredSourceCandidate } from "./types.js";

// Season-aware, evidence-backed precedence policy v2. Every row must cite the
// evidence it is backed by — never "because it's structured", never "because it looks
// more historical" (explicit constraint carried over from v1).
// Source: docs/data/HYBRID_ALGORITHM_DATASET_CONTRACT.md §"Precedence policy".
//
// Generic and provider-agnostic by construction (see types.ts's doc comment):
// `primaryCandidates` names the sources eligible to become PRIMARY /
// DERIVED_FROM_MULTIPLE for a field, in preference order, once pilot-verified via
// `pilotVerified`. `crossCheckOnlySources` names sources that may only ever be a
// cross-check for this field, regardless of verification — structurally capped, never
// promotable by this policy.
//
// This is how v1's `crossCheck: "CROSS_CHECK_ONLY_<PROVIDER>"` role is carried
// forward: on v1 several fields kept API-Football as cross-check only even though its
// pilot was verified, because the now-removed source was the architectural candidate
// for that specific field. Removing that source does NOT promote API-Football to
// PRIMARY for those fields. Promotion only happens where v1's
// `preferredSourceCandidate` was *already* `"api_football"` (standings 2022-2024,
// api_football_rating) — those two rows are carried over unchanged.
export interface PrecedenceRule {
  readonly field: string;
  readonly seasonFromYear: number;
  readonly seasonToYear: number | null;
  readonly primaryCandidates: PreferredSourceCandidate;
  readonly crossCheckOnlySources: PreferredSourceCandidate;
  /**
   * Per-source real-pilot-verified flags — keyed generically so adding a source never
   * requires a new named boolean field. Each `true` must be backed by a real pilot
   * (real HTTP calls that actually reached that specific source and returned usable
   * data) for this specific field/season, never a browser reconnaissance report, an
   * adapter's fixture-only implementation, or a blocked pilot attempt.
   */
  readonly pilotVerified: Readonly<Partial<Record<FeatureSourceName, boolean>>>;
  readonly evidenceRef: string;
}

export const HYBRID_PRECEDENCE_POLICY_V2: readonly PrecedenceRule[] = [
  {
    field: "player_identity_core",
    seasonFromYear: 2015,
    seasonToYear: null,
    primaryCandidates: [],
    crossCheckOnlySources: ["api_football"],
    pilotVerified: { api_football: true },
    evidenceRef:
      "The former architectural candidate for this field was removed entirely (three independent real acquisition attempts all blocked before reaching the source, see docs/DECISIONS.md) — no replacement PRIMARY is invented for it. API-06A players page<=3 is a real passed pilot, but on v1 API-Football was cross-check only for this field, never the architectural primary candidate; unchanged here, because removing a source does not promote another one.",
  },
  {
    field: "provider_ids",
    seasonFromYear: 2015,
    seasonToYear: null,
    primaryCandidates: [],
    crossCheckOnlySources: [],
    pilotVerified: { api_football: true },
    evidenceRef:
      "API-04/API-06A pilot real for API-Football's own source-scoped external IDs. On v1 this row required two sources verified together (DERIVED_FROM_BOTH) and API-Football alone was never sufficient authority even when verified — the other source's removal does not change that: MISSING, not promoted to PRIMARY.",
  },
  {
    field: "team_season",
    seasonFromYear: 2015,
    seasonToYear: null,
    primaryCandidates: [],
    crossCheckOnlySources: ["api_football"],
    pilotVerified: { api_football: true },
    evidenceRef:
      "Former architectural candidate removed entirely. API-06A squads real passed pilot (SNAPSHOT_ONLY, no season parameter) was cross-check only on v1, not the architectural primary candidate — unchanged by that removal.",
  },
  {
    field: "transfer_events",
    seasonFromYear: 2015,
    seasonToYear: null,
    primaryCandidates: [],
    crossCheckOnlySources: ["api_football"],
    pilotVerified: { api_football: true },
    evidenceRef:
      "Former architectural candidate removed entirely. API-06A transfers real passed pilot (1 player tested, real HTTP 200) was cross-check only on v1, league-wide cost never measured — unchanged by that removal.",
  },
  {
    field: "appearances_minutes_starts_subs",
    seasonFromYear: 2015,
    seasonToYear: null,
    primaryCandidates: [],
    crossCheckOnlySources: ["api_football"],
    pilotVerified: { api_football: false },
    evidenceRef:
      "Former architectural candidate removed entirely. The API-Football pilot (API-06A players) reached the source but confirmed the contract has no starts/subs field at all — not verified as available; a genuine capability gap, failing open as MISSING.",
  },
  {
    field: "standings",
    seasonFromYear: 2015,
    seasonToYear: 2021,
    primaryCandidates: [],
    crossCheckOnlySources: ["api_football"],
    pilotVerified: { api_football: false },
    evidenceRef:
      "API-04: API-Football plan_restricted 2016-2021 (empirically tested, real pilot ran but returned no usable data) rules out API-Football for these seasons; the former candidate was removed entirely — MISSING.",
  },
  {
    field: "standings",
    seasonFromYear: 2022,
    seasonToYear: 2024,
    primaryCandidates: ["api_football"],
    crossCheckOnlySources: [],
    pilotVerified: { api_football: true },
    evidenceRef:
      "API-04: standings COMPLETE 2022/2023/2024, real API calls with real HTTP 200 responses — API-Football was already the architectural primary candidate for this row on v1 (the removed source was never the candidate here), authority unchanged.",
  },
  {
    field: "standings",
    seasonFromYear: 2025,
    seasonToYear: null,
    primaryCandidates: [],
    crossCheckOnlySources: [],
    pilotVerified: { api_football: false },
    evidenceRef:
      "API-Football PLAN_RESTRICTED from season 2025 onward (API-04); no candidate was proposed on v1 either (the other pilot was blocked) — MISSING, unchanged.",
  },
  {
    field: "coach_history",
    seasonFromYear: 2015,
    seasonToYear: null,
    primaryCandidates: [],
    crossCheckOnlySources: ["api_football"],
    pilotVerified: { api_football: true },
    evidenceRef:
      "Former architectural candidate removed entirely. API-06A coaches real passed pilot (SNAPSHOT_ONLY, current bench only) was cross-check only on v1, not the architectural primary candidate — unchanged by that removal.",
  },
  {
    field: "injuries_absences",
    seasonFromYear: 2015,
    seasonToYear: null,
    primaryCandidates: [],
    crossCheckOnlySources: [],
    pilotVerified: { api_football: false },
    evidenceRef:
      "API-Football injuries has one real passed pilot for 2024 only — historical depth across the full 2015- range in this row is undeclared, not verified as a field-wide statement. No candidate was proposed on v1 either — MISSING, unchanged.",
  },
  {
    field: "suspensions",
    seasonFromYear: 2015,
    seasonToYear: null,
    primaryCandidates: [],
    crossCheckOnlySources: [],
    pilotVerified: {},
    evidenceRef:
      "No field verified in any real pilot on any remaining source — no candidate proposed, never invented.",
  },
  {
    field: "api_football_rating",
    seasonFromYear: 2022,
    seasonToYear: 2024,
    primaryCandidates: ["api_football"],
    crossCheckOnlySources: [],
    pilotVerified: { api_football: true },
    evidenceRef:
      "API-06A players endpoint real pilot passed (accessible_with_data, real HTTP 200) for 2022-2024; provider-specific field, never aliased to the Fantacalcio target — API-Football was already the architectural primary candidate for this row on v1, authority unchanged.",
  },
] as const;

/**
 * The only value classifyConflict() may ever receive as `precedence`.
 *
 * Downgrades an unverified candidate to MISSING — a `PRIMARY` responsibility is never
 * emitted unless a real pilot backs that specific source, and `DERIVED_FROM_MULTIPLE`
 * is never emitted unless every one of the named sources individually has a real
 * passed pilot.
 *
 * A source listed in `crossCheckOnlySources` is never promoted to PRIMARY /
 * DERIVED_FROM_MULTIPLE, regardless of any `pilotVerified` flag set for it and
 * regardless of whether a mistaken rule also lists it among `primaryCandidates`: the
 * cap is enforced here, in the function, not merely by how the rows happen to be
 * written. `validatePrecedencePolicy()` additionally rejects a rule that claims both
 * roles for one source, so the contradiction is reported instead of silently resolved.
 */
export function effectiveResponsibility(rule: PrecedenceRule): PrecedenceResponsibility {
  const verifiedPrimary = rule.primaryCandidates.filter(
    (source) => !rule.crossCheckOnlySources.includes(source) && rule.pilotVerified[source] === true,
  );
  if (verifiedPrimary.length === 1) {
    return { kind: "PRIMARY", source: verifiedPrimary[0]! };
  }
  if (verifiedPrimary.length > 1) {
    return { kind: "DERIVED_FROM_MULTIPLE", sources: verifiedPrimary };
  }
  return { kind: "MISSING" };
}

/**
 * Structural checks on the policy rows themselves — a rule that names one source as
 * both a primary candidate and a cross-check-only source is contradictory, and a rule
 * with an empty evidence reference cannot be audited. Pure and deterministic: returns
 * the list of problems, never throws.
 */
export function validatePrecedencePolicy(
  rules: readonly PrecedenceRule[] = HYBRID_PRECEDENCE_POLICY_V2,
): readonly string[] {
  const errors: string[] = [];
  for (const rule of rules) {
    const row = `${rule.field} ${rule.seasonFromYear}-${rule.seasonToYear ?? "open"}`;
    for (const source of rule.primaryCandidates) {
      if (rule.crossCheckOnlySources.includes(source)) {
        errors.push(`${row}: ${source} cannot be both a primary candidate and cross-check only`);
      }
    }
    if (rule.evidenceRef.trim().length === 0) {
      errors.push(`${row}: empty evidence reference`);
    }
  }
  return errors;
}

export function getPrecedence(field: string, seasonStartYear: number): PrecedenceRule | null {
  const matches = HYBRID_PRECEDENCE_POLICY_V2.filter(
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
// value — never the raw candidate list. Returns null when no rule is registered at all.
export function getEffectiveResponsibility(
  field: string,
  seasonStartYear: number,
): PrecedenceResponsibility | null {
  const rule = getPrecedence(field, seasonStartYear);
  return rule === null ? null : effectiveResponsibility(rule);
}

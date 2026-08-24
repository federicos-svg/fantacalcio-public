import { describe, expect, it } from "vitest";
import { classifyConflict } from "../src/conflictClassifier.js";
import {
  effectiveResponsibility,
  getEffectiveResponsibility,
  getPrecedence,
  HYBRID_PRECEDENCE_POLICY_V2,
  validatePrecedencePolicy,
  type PrecedenceRule,
} from "../src/precedencePolicy.js";
import type { FeatureSourceName, ProvenanceRecord, SourceName } from "../src/types.js";

// Synthetic-only source name, never a real FeatureSourceName registered anywhere in
// this repo — used purely to exercise the generic multi-candidate machinery
// (DERIVED_FROM_MULTIPLE, the crossCheckOnlySources cap) without inventing a second
// real source. Introducing a real one is a source-authorization decision, not a
// refactor.
const SYNTHETIC_SOURCE = "synthetic_future_source" as unknown as FeatureSourceName;
const SYNTHETIC_SOURCE_NAME = SYNTHETIC_SOURCE as unknown as SourceName;

// Building `pilotVerified` with a mix of the real "api_football" literal and the
// type-widened SYNTHETIC_SOURCE as object-literal keys makes TypeScript collapse both
// keys to the same literal type (FeatureSourceName has only one real member) and
// report a duplicate-property error. Route through a plain string-keyed builder, then
// cast once, to keep the synthetic-source intent without that collision.
function pilotVerifiedOf(
  entries: ReadonlyArray<readonly [string, boolean]>,
): PrecedenceRule["pilotVerified"] {
  return Object.fromEntries(entries) as PrecedenceRule["pilotVerified"];
}

describe("getPrecedence", () => {
  it("returns the raw rule for an early standings season — no primary candidate proposed", () => {
    const rule = getPrecedence("standings", 2018);
    expect(rule?.primaryCandidates).toEqual([]);
  });

  it("returns null for a field with no registered rule at all", () => {
    expect(getPrecedence("unregistered_field", 2023)).toBeNull();
  });

  // The standings rows partition the seasons into three disjoint ranges with different
  // authority. Each boundary year is pinned on both sides, so moving a range edge
  // (silently widening or narrowing API-Football's window) fails here instead of
  // quietly changing what the policy answers for a season.
  it("routes every standings season to the row whose range contains it, boundaries included", () => {
    for (const season of [2015, 2018, 2021]) {
      expect(getPrecedence("standings", season)?.seasonToYear).toBe(2021);
    }
    for (const season of [2022, 2023, 2024]) {
      expect(getPrecedence("standings", season)?.seasonToYear).toBe(2024);
    }
    for (const season of [2025, 2026]) {
      expect(getPrecedence("standings", season)?.seasonToYear).toBeNull();
    }
    // Before the policy's first declared season no rule applies at all.
    expect(getPrecedence("standings", 2014)).toBeNull();
  });

  it("every rule cites a non-empty evidence reference", () => {
    for (const rule of HYBRID_PRECEDENCE_POLICY_V2) {
      expect(rule.evidenceRef.trim().length).toBeGreaterThan(0);
    }
  });

  it("carries over exactly the 12 rows and 10 distinct fields inherited from v1, no more, no fewer", () => {
    expect(HYBRID_PRECEDENCE_POLICY_V2).toHaveLength(12);
    const fields = [...new Set(HYBRID_PRECEDENCE_POLICY_V2.map((rule) => rule.field))].sort();
    expect(fields).toEqual(
      [
        "api_football_rating",
        "appearances_minutes_starts_subs",
        "coach_history",
        "injuries_absences",
        "player_identity_core",
        "provider_ids",
        "standings",
        "suspensions",
        "team_season",
        "transfer_events",
      ].sort(),
    );
  });

  it("has no reference to the removed source anywhere in the policy", () => {
    for (const rule of HYBRID_PRECEDENCE_POLICY_V2) {
      expect(rule.primaryCandidates).not.toContain("transfermarkt");
      expect(rule.crossCheckOnlySources).not.toContain("transfermarkt");
      expect(Object.keys(rule.pilotVerified)).not.toContain("transfermarkt");
    }
  });

  it("has no rule for the removed market-value field — not renamed, not kept as a placeholder", () => {
    expect(getPrecedence("transfermarkt_market_value", 2023)).toBeNull();
    expect(getPrecedence("market_value", 2023)).toBeNull();
    expect(HYBRID_PRECEDENCE_POLICY_V2.some((rule) => rule.field.includes("market_value"))).toBe(
      false,
    );
  });
});

describe("validatePrecedencePolicy", () => {
  it("accepts the shipped policy", () => {
    expect(validatePrecedencePolicy()).toEqual([]);
  });

  it("rejects a rule that claims one source as both a primary candidate and cross-check only", () => {
    const contradictory: PrecedenceRule = {
      field: "synthetic_contradictory_field",
      seasonFromYear: 2023,
      seasonToYear: 2023,
      primaryCandidates: ["api_football"],
      crossCheckOnlySources: ["api_football"],
      pilotVerified: { api_football: true },
      evidenceRef: "synthetic: contradictory row",
    };
    expect(validatePrecedencePolicy([contradictory])).toContain(
      "synthetic_contradictory_field 2023-2023: api_football cannot be both a primary candidate and cross-check only",
    );
  });

  it("rejects a rule with an empty evidence reference", () => {
    const unsourced: PrecedenceRule = {
      field: "synthetic_unsourced_field",
      seasonFromYear: 2023,
      seasonToYear: null,
      primaryCandidates: [],
      crossCheckOnlySources: [],
      pilotVerified: {},
      evidenceRef: "   ",
    };
    expect(validatePrecedencePolicy([unsourced])).toContain(
      "synthetic_unsourced_field 2023-open: empty evidence reference",
    );
  });
});

describe("effectiveResponsibility — no source is auto-promoted because another was removed", () => {
  it("does not change API-Football standings authority for 2022-2024 — it was already the primary candidate on v1", () => {
    const rule = getPrecedence("standings", 2023);
    expect(rule?.primaryCandidates).toEqual(["api_football"]);
    expect(rule?.pilotVerified.api_football).toBe(true);
    expect(effectiveResponsibility(rule!)).toEqual({ kind: "PRIMARY", source: "api_football" });
  });

  it("does not change api_football_rating authority — already primary on v1, unaffected", () => {
    const rule = getPrecedence("api_football_rating", 2023);
    expect(rule?.pilotVerified.api_football).toBe(true);
    expect(effectiveResponsibility(rule!)).toEqual({ kind: "PRIMARY", source: "api_football" });
  });

  it("keeps MISSING for every field where API-Football was cross-check-only on v1, even though its pilot is verified", () => {
    // On v1 these fields had preferredSourceCandidate = the now-removed source and
    // crossCheck = "CROSS_CHECK_ONLY_API_FOOTBALL" with apiFootballPilotVerified = true:
    // API-Football was deliberately never the architectural primary candidate here.
    // Removing the other source must not silently promote it.
    const crossCheckOnlyFields = [
      "player_identity_core",
      "team_season",
      "transfer_events",
      "coach_history",
    ];
    for (const field of crossCheckOnlyFields) {
      const rule = getPrecedence(field, 2023)!;
      expect(rule.primaryCandidates).toEqual([]);
      expect(rule.crossCheckOnlySources).toContain("api_football");
      expect(rule.pilotVerified.api_football).toBe(true);
      expect(effectiveResponsibility(rule)).toEqual({ kind: "MISSING" });
    }
  });

  it("provider_ids stays MISSING — on v1 it required two sources together, and one verified source was never sufficient", () => {
    const rule = getPrecedence("provider_ids", 2023)!;
    expect(rule.primaryCandidates).toEqual([]);
    expect(rule.pilotVerified.api_football).toBe(true);
    expect(effectiveResponsibility(rule)).toEqual({ kind: "MISSING" });
  });

  it("keeps MISSING for every field/season where no pilot ever verified it, matching v1 exactly", () => {
    const unverified: ReadonlyArray<readonly [string, number]> = [
      ["appearances_minutes_starts_subs", 2020],
      ["standings", 2018],
      ["standings", 2026],
      ["injuries_absences", 2020],
    ];
    for (const [field, season] of unverified) {
      expect(getEffectiveResponsibility(field, season)).toEqual({ kind: "MISSING" });
    }
  });

  it("keeps MISSING for suspensions — no candidate is proposed at all, matching v1", () => {
    const rule = getPrecedence("suspensions", 2023)!;
    expect(rule.primaryCandidates).toEqual([]);
    expect(effectiveResponsibility(rule)).toEqual({ kind: "MISSING" });
  });

  it("does not silently extend API-Football standings authority to a plan-restricted season", () => {
    expect(getEffectiveResponsibility("standings", 2025)).toEqual({ kind: "MISSING" });
  });

  it("getEffectiveResponsibility returns null for an unregistered field", () => {
    expect(getEffectiveResponsibility("unregistered_field", 2023)).toBeNull();
  });

  it("never assigns PRIMARY purely because a source is structured — every PRIMARY row has that source's pilotVerified true", () => {
    for (const rule of HYBRID_PRECEDENCE_POLICY_V2) {
      const responsibility = effectiveResponsibility(rule);
      if (responsibility.kind === "PRIMARY") {
        expect(rule.pilotVerified[responsibility.source]).toBe(true);
      }
      if (responsibility.kind === "DERIVED_FROM_MULTIPLE") {
        for (const source of responsibility.sources) {
          expect(rule.pilotVerified[source]).toBe(true);
        }
      }
    }
  });

  it("never emits PRIMARY for a field whose only verified source is capped at cross-check", () => {
    for (const rule of HYBRID_PRECEDENCE_POLICY_V2) {
      const responsibility = effectiveResponsibility(rule);
      if (responsibility.kind === "PRIMARY") {
        expect(rule.crossCheckOnlySources).not.toContain(responsibility.source);
      }
    }
  });
});

describe("effectiveResponsibility — the cross-check cap is enforced by the function, not by row hygiene", () => {
  it("never promotes a crossCheckOnlySources entry to PRIMARY, even with pilotVerified true", () => {
    const rule: PrecedenceRule = {
      field: "synthetic_cross_check_cap",
      seasonFromYear: 2023,
      seasonToYear: 2023,
      primaryCandidates: [],
      crossCheckOnlySources: ["api_football"],
      pilotVerified: { api_football: true },
      evidenceRef: "synthetic: api_football is structurally cross-check-only for this field",
    };
    expect(effectiveResponsibility(rule)).toEqual({ kind: "MISSING" });
  });

  it("still refuses promotion when a contradictory rule lists the same source as BOTH a primary candidate and cross-check only", () => {
    const contradictory: PrecedenceRule = {
      field: "synthetic_contradictory_field",
      seasonFromYear: 2023,
      seasonToYear: 2023,
      primaryCandidates: ["api_football"],
      crossCheckOnlySources: ["api_football"],
      pilotVerified: { api_football: true },
      evidenceRef: "synthetic: contradictory row, cross-check must win",
    };
    expect(effectiveResponsibility(contradictory)).toEqual({ kind: "MISSING" });
    expect(validatePrecedencePolicy([contradictory]).length).toBeGreaterThan(0);
  });

  it("drops only the capped source from a multi-candidate rule, keeping the eligible one PRIMARY", () => {
    const mixed: PrecedenceRule = {
      field: "synthetic_mixed_field",
      seasonFromYear: 2023,
      seasonToYear: 2023,
      primaryCandidates: ["api_football", SYNTHETIC_SOURCE],
      crossCheckOnlySources: [SYNTHETIC_SOURCE],
      pilotVerified: pilotVerifiedOf([
        ["api_football", true],
        [SYNTHETIC_SOURCE, true],
      ]),
      evidenceRef: "synthetic: one eligible candidate, one capped at cross-check",
    };
    expect(effectiveResponsibility(mixed)).toEqual({ kind: "PRIMARY", source: "api_football" });
  });
});

describe("effectiveResponsibility — DERIVED_FROM_MULTIPLE requires every candidate verified", () => {
  const twoCandidates: PrecedenceRule = {
    field: "synthetic_multi_source_field",
    seasonFromYear: 2023,
    seasonToYear: 2023,
    primaryCandidates: ["api_football", SYNTHETIC_SOURCE],
    crossCheckOnlySources: [],
    pilotVerified: pilotVerifiedOf([
      ["api_football", true],
      [SYNTHETIC_SOURCE, false],
    ]),
    evidenceRef: "synthetic: only api_football verified",
  };

  it("falls back to the single verified candidate as PRIMARY — never claims derivation from an unverified source", () => {
    expect(effectiveResponsibility(twoCandidates)).toEqual({
      kind: "PRIMARY",
      source: "api_football",
    });

    const onlySecondVerified: PrecedenceRule = {
      ...twoCandidates,
      pilotVerified: pilotVerifiedOf([
        ["api_football", false],
        [SYNTHETIC_SOURCE, true],
      ]),
      evidenceRef: "synthetic: only the synthetic source verified",
    };
    expect(effectiveResponsibility(onlySecondVerified)).toEqual({
      kind: "PRIMARY",
      source: SYNTHETIC_SOURCE,
    });
  });

  it("returns MISSING when no candidate is verified, however many are listed", () => {
    const neitherVerified: PrecedenceRule = {
      ...twoCandidates,
      pilotVerified: {},
      evidenceRef: "synthetic: neither verified",
    };
    expect(effectiveResponsibility(neitherVerified)).toEqual({ kind: "MISSING" });
  });

  it("produces DERIVED_FROM_MULTIPLE only when every listed candidate is verified", () => {
    const bothVerified: PrecedenceRule = {
      ...twoCandidates,
      pilotVerified: pilotVerifiedOf([
        ["api_football", true],
        [SYNTHETIC_SOURCE, true],
      ]),
      evidenceRef: "synthetic: both verified",
    };
    expect(effectiveResponsibility(bothVerified)).toEqual({
      kind: "DERIVED_FROM_MULTIPLE",
      sources: ["api_football", SYNTHETIC_SOURCE],
    });
  });

  it("treats a missing pilotVerified entry as unverified — absence is never consent", () => {
    const noEntryAtAll: PrecedenceRule = {
      ...twoCandidates,
      primaryCandidates: ["api_football"],
      pilotVerified: {},
      evidenceRef: "synthetic: no pilotVerified entry for the candidate at all",
    };
    expect(effectiveResponsibility(noEntryAtAll)).toEqual({ kind: "MISSING" });
  });

  it("no theoretical contract or reconnaissance evidence is treated as a real pilot: every api_football pilotVerified:true row cites a real HTTP call in its evidenceRef", () => {
    for (const rule of HYBRID_PRECEDENCE_POLICY_V2) {
      if (rule.pilotVerified.api_football) {
        expect(rule.evidenceRef).toMatch(/API-0[46]|real (HTTP|API|pilot|passed pilot)/i);
      }
    }
  });
});

function provenance(source: SourceName): ProvenanceRecord {
  return {
    source,
    sourceEntityId: "synthetic_entity_001",
    season: "2023_24",
    observedAt: "2024-06-01T00:00:00Z",
    availableAt: "2024-06-01T00:00:00Z",
    cutoffAt: "2024-08-25T00:00:00Z",
    snapshotClassification: "HISTORICAL_EVENT_LOG",
    transformVersion: "hybrid-dataset-contract@2.0.0",
    missingnessStatus: "present",
    conflictStatus: "no_conflict",
  };
}

describe("effectiveResponsibility feeding classifyConflict (integration)", () => {
  it("a cross-check-only candidate can never auto-resolve a conflict in its own favor", () => {
    const rule = getPrecedence("team_season", 2018)!;
    expect(rule.primaryCandidates).toEqual([]);
    expect(rule.crossCheckOnlySources).toContain("api_football");

    const result = classifyConflict({
      field: "team_season",
      season: "2018_19",
      valueA: "Synthetic Team A",
      sourceA: "api_football",
      provenanceA: provenance("api_football"),
      valueB: "Synthetic Team B",
      sourceB: SYNTHETIC_SOURCE_NAME,
      provenanceB: provenance(SYNTHETIC_SOURCE_NAME),
      precedence: effectiveResponsibility(rule),
      valuesEqual: (a, b) => a === b,
    });

    expect(result.status).toBe("CONFLICT_UNRESOLVED");
    expect(result.resolvedValue).toBeNull();
    expect(result.resolvedSource).toBeNull();
  });

  it("a verified API-Football candidate (standings 2022-2024) can still auto-resolve a conflict", () => {
    const rule = getPrecedence("standings", 2023)!;

    const result = classifyConflict({
      field: "standings",
      season: "2023_24",
      valueA: 42,
      sourceA: SYNTHETIC_SOURCE_NAME,
      provenanceA: provenance(SYNTHETIC_SOURCE_NAME),
      valueB: 43,
      sourceB: "api_football",
      provenanceB: provenance("api_football"),
      precedence: effectiveResponsibility(rule),
      valuesEqual: (a, b) => a === b,
    });

    expect(result.status).toBe("CONFLICT_RESOLVED");
    expect(result.resolutionRule).toBe("PRIMARY:api_football");
    expect(result.resolvedSource).toBe("api_football");
    expect(result.resolvedValue).toBe(43);
  });

  it("provider_ids never auto-resolves a conflict either", () => {
    const rule = getPrecedence("provider_ids", 2023)!;

    const result = classifyConflict({
      field: "provider_ids",
      season: "2023_24",
      valueA: "synthetic-id-001",
      sourceA: SYNTHETIC_SOURCE_NAME,
      provenanceA: provenance(SYNTHETIC_SOURCE_NAME),
      valueB: "af-id-002",
      sourceB: "api_football",
      provenanceB: provenance("api_football"),
      precedence: effectiveResponsibility(rule),
      valuesEqual: (a, b) => a === b,
    });

    expect(result.status).toBe("CONFLICT_UNRESOLVED");
  });
});

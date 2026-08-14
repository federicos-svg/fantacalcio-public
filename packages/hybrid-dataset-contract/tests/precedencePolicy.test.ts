import { describe, expect, it } from "vitest";
import { classifyConflict } from "../src/conflictClassifier.js";
import {
  effectiveResponsibility,
  getEffectiveResponsibility,
  getPrecedence,
  HYBRID_PRECEDENCE_POLICY_V1,
} from "../src/precedencePolicy.js";
import type { ProvenanceRecord } from "../src/types.js";

describe("getPrecedence", () => {
  it("returns the raw rule with the Transfermarkt candidate for an early standings season", () => {
    const rule = getPrecedence("standings", 2018);
    expect(rule?.preferredSourceCandidate).toBe("transfermarkt");
  });

  it("returns null for a field with no registered rule at all", () => {
    expect(getPrecedence("unregistered_field", 2023)).toBeNull();
  });

  it("every rule cites a non-empty evidence reference", () => {
    for (const rule of HYBRID_PRECEDENCE_POLICY_V1) {
      expect(rule.evidenceRef.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("effectiveResponsibility — candidate vs effective (finding 1)", () => {
  it("downgrades an unverified Transfermarkt candidate to MISSING, even for an early standings season", () => {
    const rule = getPrecedence("standings", 2018);
    expect(rule?.preferredSourceCandidate).toBe("transfermarkt");
    expect(rule?.transfermarktPilotVerified).toBe(false);
    expect(effectiveResponsibility(rule!)).toBe("MISSING");
  });

  it("downgrades every unverified field with a Transfermarkt candidate to MISSING", () => {
    const unverifiedTransfermarktFields = [
      "player_identity_core",
      "team_season",
      "transfer_events",
      "appearances_minutes_starts_subs",
      "coach_history",
      "transfermarkt_market_value",
    ];
    for (const field of unverifiedTransfermarktFields) {
      const rule = HYBRID_PRECEDENCE_POLICY_V1.find((r) => r.field === field);
      expect(rule?.preferredSourceCandidate).toBe("transfermarkt");
      expect(rule?.transfermarktPilotVerified).toBe(false);
      expect(effectiveResponsibility(rule!)).toBe("MISSING");
    }
  });

  it("does NOT change API-Football standings authority for 2022-2024 — real pilot evidence stays PRIMARY_API_FOOTBALL", () => {
    const rule = getPrecedence("standings", 2023);
    expect(rule?.preferredSourceCandidate).toBe("api_football");
    expect(rule?.apiFootballPilotVerified).toBe(true);
    expect(effectiveResponsibility(rule!)).toBe("PRIMARY_API_FOOTBALL");
  });

  it("does NOT change api_football_rating authority — real pilot evidence stays PRIMARY_API_FOOTBALL", () => {
    const rule = getPrecedence("api_football_rating", 2023);
    expect(rule?.apiFootballPilotVerified).toBe(true);
    expect(effectiveResponsibility(rule!)).toBe("PRIMARY_API_FOOTBALL");
  });

  it("keeps MISSING for a 'none' candidate", () => {
    const rule = getPrecedence("injuries_absences", 2023);
    expect(rule?.preferredSourceCandidate).toBe("none");
    expect(effectiveResponsibility(rule!)).toBe("MISSING");
  });

  it("does not silently extend API-Football standings authority to a plan-restricted season", () => {
    expect(getEffectiveResponsibility("standings", 2025)).toBe("MISSING");
  });

  it("getEffectiveResponsibility returns null for an unregistered field", () => {
    expect(getEffectiveResponsibility("unregistered_field", 2023)).toBeNull();
  });

  it("never assigns PRIMARY_API_FOOTBALL purely because the source is structured — every such row has apiFootballPilotVerified:true", () => {
    for (const rule of HYBRID_PRECEDENCE_POLICY_V1) {
      if (effectiveResponsibility(rule) === "PRIMARY_API_FOOTBALL") {
        expect(rule.apiFootballPilotVerified).toBe(true);
      }
    }
  });

  it("never emits PRIMARY_TRANSFERMARKT for any rule in this policy version — no field has a real passed Transfermarkt pilot yet", () => {
    for (const rule of HYBRID_PRECEDENCE_POLICY_V1) {
      expect(effectiveResponsibility(rule)).not.toBe("PRIMARY_TRANSFERMARKT");
    }
  });
});

describe("effectiveResponsibility — DERIVED_FROM_BOTH requires both sources verified (finding 1, round 3)", () => {
  it("provider_ids does NOT return DERIVED_FROM_BOTH — only API-Football is verified, Transfermarkt never had a real passed pilot", () => {
    const rule = getPrecedence("provider_ids", 2023)!;
    expect(rule.preferredSourceCandidate).toBe("both");
    expect(rule.transfermarktPilotVerified).toBe(false);
    expect(rule.apiFootballPilotVerified).toBe(true);
    expect(effectiveResponsibility(rule)).toBe("MISSING");
  });

  it("a 'both' candidate with only one source verified never produces DERIVED_FROM_BOTH, regardless of which source", () => {
    const onlyApiFootballVerified = {
      field: "synthetic_both_field",
      seasonFromYear: 2023,
      seasonToYear: 2023,
      preferredSourceCandidate: "both" as const,
      transfermarktPilotVerified: false,
      apiFootballPilotVerified: true,
      crossCheck: null,
      evidenceRef: "synthetic: only API-Football verified",
    };
    const onlyTransfermarktVerified = {
      ...onlyApiFootballVerified,
      transfermarktPilotVerified: true,
      apiFootballPilotVerified: false,
      evidenceRef: "synthetic: only Transfermarkt verified",
    };
    const neitherVerified = {
      ...onlyApiFootballVerified,
      apiFootballPilotVerified: false,
      evidenceRef: "synthetic: neither verified",
    };

    expect(effectiveResponsibility(onlyApiFootballVerified)).toBe("MISSING");
    expect(effectiveResponsibility(onlyTransfermarktVerified)).toBe("MISSING");
    expect(effectiveResponsibility(neitherVerified)).toBe("MISSING");
  });

  it("a 'both' candidate produces DERIVED_FROM_BOTH only when both flags are true", () => {
    const bothVerified = {
      field: "synthetic_both_field",
      seasonFromYear: 2023,
      seasonToYear: 2023,
      preferredSourceCandidate: "both" as const,
      transfermarktPilotVerified: true,
      apiFootballPilotVerified: true,
      crossCheck: null,
      evidenceRef: "synthetic: both verified",
    };
    expect(effectiveResponsibility(bothVerified)).toBe("DERIVED_FROM_BOTH");
  });

  it("no theoretical contract or reconnaissance evidence is treated as a real pilot: every apiFootballPilotVerified:true row cites a real HTTP call in its evidenceRef", () => {
    for (const rule of HYBRID_PRECEDENCE_POLICY_V1) {
      if (rule.apiFootballPilotVerified) {
        expect(rule.evidenceRef).toMatch(/API-0[46]|real (HTTP|API|pilot|passed pilot)/i);
      }
    }
  });

  it("no rule in this policy version has transfermarktPilotVerified:true — no real Transfermarkt pilot has ever passed", () => {
    for (const rule of HYBRID_PRECEDENCE_POLICY_V1) {
      expect(rule.transfermarktPilotVerified).toBe(false);
    }
  });
});

function provenance(source: "transfermarkt" | "api_football"): ProvenanceRecord {
  return {
    source,
    sourceEntityId: "synthetic_entity_001",
    season: "2023_24",
    observedAt: "2024-06-01T00:00:00Z",
    availableAt: "2024-06-01T00:00:00Z",
    cutoffAt: "2024-08-25T00:00:00Z",
    snapshotClassification: "HISTORICAL_EVENT_LOG",
    transformVersion: "hybrid-dataset-contract@1.0.0",
    missingnessStatus: "present",
    conflictStatus: "no_conflict",
  };
}

describe("effectiveResponsibility feeding classifyConflict (finding 1 integration)", () => {
  it("an unverified Transfermarkt candidate can never auto-resolve a conflict in Transfermarkt's favor", () => {
    const rule = getPrecedence("team_season", 2018)!;
    expect(rule.preferredSourceCandidate).toBe("transfermarkt");

    const result = classifyConflict({
      field: "team_season",
      season: "2018_19",
      valueA: "Synthetic Team A",
      sourceA: "transfermarkt",
      provenanceA: provenance("transfermarkt"),
      valueB: "Synthetic Team B",
      sourceB: "api_football",
      provenanceB: provenance("api_football"),
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
      sourceA: "transfermarkt",
      provenanceA: provenance("transfermarkt"),
      valueB: 43,
      sourceB: "api_football",
      provenanceB: provenance("api_football"),
      precedence: effectiveResponsibility(rule),
      valuesEqual: (a, b) => a === b,
    });

    expect(result.status).toBe("CONFLICT_RESOLVED");
    expect(result.resolvedSource).toBe("api_football");
    expect(result.resolvedValue).toBe(43);
  });

  it("provider_ids (both candidate, only API-Football verified) never auto-resolves a conflict either", () => {
    const rule = getPrecedence("provider_ids", 2023)!;

    const result = classifyConflict({
      field: "provider_ids",
      season: "2023_24",
      valueA: "tm-id-001",
      sourceA: "transfermarkt",
      provenanceA: provenance("transfermarkt"),
      valueB: "af-id-002",
      sourceB: "api_football",
      provenanceB: provenance("api_football"),
      precedence: effectiveResponsibility(rule),
      valuesEqual: (a, b) => a === b,
    });

    expect(result.status).toBe("CONFLICT_UNRESOLVED");
  });
});

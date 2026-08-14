import { describe, expect, it } from "vitest";
import { classifyConflict, type ConflictInput } from "../src/conflictClassifier.js";
import type { ProvenanceRecord } from "../src/types.js";

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

function baseInput(overrides: Partial<ConflictInput<string>> = {}): ConflictInput<string> {
  return {
    field: "team_season",
    season: "2023_24",
    valueA: "Team Synthetic FC",
    sourceA: "transfermarkt",
    provenanceA: provenance("transfermarkt"),
    valueB: "Team Synthetic FC (alt)",
    sourceB: "api_football",
    provenanceB: provenance("api_football"),
    precedence: "PRIMARY_TRANSFERMARKT",
    valuesEqual: (a, b) => a === b,
    ...overrides,
  };
}

describe("classifyConflict", () => {
  it("resolves as values_equal when both values match, regardless of precedence", () => {
    const result = classifyConflict(
      baseInput({ valueB: "Team Synthetic FC", precedence: "MISSING" }),
    );
    expect(result.status).toBe("CONFLICT_RESOLVED");
    expect(result.resolutionRule).toBe("values_equal");
    expect(result.resolvedValue).toBe("Team Synthetic FC");
  });

  it("resolves in favor of Transfermarkt when precedence is PRIMARY_TRANSFERMARKT", () => {
    const result = classifyConflict(baseInput());
    expect(result.status).toBe("CONFLICT_RESOLVED");
    expect(result.resolutionRule).toBe("PRIMARY_TRANSFERMARKT");
    expect(result.resolvedSource).toBe("transfermarkt");
    expect(result.resolvedValue).toBe("Team Synthetic FC");
  });

  it("resolves in favor of Transfermarkt even when it is passed as sourceB", () => {
    const result = classifyConflict(
      baseInput({
        sourceA: "api_football",
        provenanceA: provenance("api_football"),
        sourceB: "transfermarkt",
        provenanceB: provenance("transfermarkt"),
      }),
    );
    expect(result.resolvedSource).toBe("transfermarkt");
  });

  it("resolves in favor of API-Football when precedence is PRIMARY_API_FOOTBALL", () => {
    const result = classifyConflict(baseInput({ precedence: "PRIMARY_API_FOOTBALL" }));
    expect(result.resolvedSource).toBe("api_football");
    expect(result.resolvedValue).toBe("Team Synthetic FC (alt)");
  });

  it("stays CONFLICT_UNRESOLVED for DERIVED_FROM_BOTH — never picks a winner automatically", () => {
    const result = classifyConflict(baseInput({ precedence: "DERIVED_FROM_BOTH" }));
    expect(result.status).toBe("CONFLICT_UNRESOLVED");
    expect(result.resolvedValue).toBeNull();
    expect(result.resolvedSource).toBeNull();
  });

  it("stays CONFLICT_UNRESOLVED for MISSING precedence", () => {
    const result = classifyConflict(baseInput({ precedence: "MISSING" }));
    expect(result.status).toBe("CONFLICT_UNRESOLVED");
  });

  it("stays CONFLICT_UNRESOLVED for CROSS_CHECK_ONLY_* precedence — cross-check is not authority", () => {
    const result = classifyConflict(baseInput({ precedence: "CROSS_CHECK_ONLY_TRANSFERMARKT" }));
    expect(result.status).toBe("CONFLICT_UNRESOLVED");
  });

  it("always preserves both raw values and both provenance records, resolved or not", () => {
    const result = classifyConflict(baseInput());
    expect(result.valueA).toBe("Team Synthetic FC");
    expect(result.valueB).toBe("Team Synthetic FC (alt)");
    expect(result.provenanceA.source).toBe("transfermarkt");
    expect(result.provenanceB.source).toBe("api_football");
  });
});

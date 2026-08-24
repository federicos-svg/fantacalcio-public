import { describe, expect, it } from "vitest";
import { classifyConflict, type ConflictInput } from "../src/conflictClassifier.js";
import type {
  FeatureSourceName,
  PrecedenceResponsibility,
  ProvenanceRecord,
  SourceName,
} from "../src/types.js";

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

const PRIMARY_API_FOOTBALL: PrecedenceResponsibility = { kind: "PRIMARY", source: "api_football" };
const MISSING: PrecedenceResponsibility = { kind: "MISSING" };
// Synthetic-only source name, never a real FeatureSourceName registered anywhere in
// this repo — used purely to prove classifyConflict() is generic over
// `precedence.source` rather than hardcoding one provider literal.
const SYNTHETIC_SOURCE = "synthetic_future_source" as unknown as FeatureSourceName;
const SYNTHETIC_SOURCE_NAME = SYNTHETIC_SOURCE as unknown as SourceName;
const PRIMARY_SYNTHETIC: PrecedenceResponsibility = { kind: "PRIMARY", source: SYNTHETIC_SOURCE };
const DERIVED_FROM_MULTIPLE: PrecedenceResponsibility = {
  kind: "DERIVED_FROM_MULTIPLE",
  sources: ["api_football", SYNTHETIC_SOURCE],
};

function baseInput(overrides: Partial<ConflictInput<string>> = {}): ConflictInput<string> {
  return {
    field: "team_season",
    season: "2023_24",
    valueA: "Team Synthetic FC",
    sourceA: "api_football",
    provenanceA: provenance("api_football"),
    valueB: "Team Synthetic FC (alt)",
    sourceB: SYNTHETIC_SOURCE_NAME,
    provenanceB: provenance(SYNTHETIC_SOURCE_NAME),
    precedence: PRIMARY_API_FOOTBALL,
    valuesEqual: (a, b) => a === b,
    ...overrides,
  };
}

describe("classifyConflict", () => {
  it("resolves as values_equal when both values match, regardless of precedence", () => {
    const result = classifyConflict(baseInput({ valueB: "Team Synthetic FC", precedence: MISSING }));
    expect(result.status).toBe("CONFLICT_RESOLVED");
    expect(result.resolutionRule).toBe("values_equal");
    expect(result.resolvedValue).toBe("Team Synthetic FC");
  });

  it("resolves in favor of the source named by PRIMARY when it is sourceA", () => {
    const result = classifyConflict(baseInput());
    expect(result.status).toBe("CONFLICT_RESOLVED");
    expect(result.resolutionRule).toBe("PRIMARY:api_football");
    expect(result.resolvedSource).toBe("api_football");
    expect(result.resolvedValue).toBe("Team Synthetic FC");
  });

  it("resolves in favor of the source named by PRIMARY even when it is passed as sourceB", () => {
    const result = classifyConflict(
      baseInput({
        sourceA: SYNTHETIC_SOURCE_NAME,
        provenanceA: provenance(SYNTHETIC_SOURCE_NAME),
        sourceB: "api_football",
        provenanceB: provenance("api_football"),
        precedence: PRIMARY_API_FOOTBALL,
      }),
    );
    expect(result.status).toBe("CONFLICT_RESOLVED");
    expect(result.resolutionRule).toBe("PRIMARY:api_football");
    expect(result.resolvedSource).toBe("api_football");
    expect(result.resolvedValue).toBe("Team Synthetic FC (alt)");
  });

  it("resolves in favor of whichever source PRIMARY names — generic, not hardcoded to one provider literal", () => {
    const result = classifyConflict(baseInput({ precedence: PRIMARY_SYNTHETIC }));
    expect(result.status).toBe("CONFLICT_RESOLVED");
    expect(result.resolutionRule).toBe("PRIMARY:synthetic_future_source");
    expect(result.resolvedSource).toBe(SYNTHETIC_SOURCE_NAME);
    expect(result.resolvedValue).toBe("Team Synthetic FC (alt)");
  });

  it("stays CONFLICT_UNRESOLVED for DERIVED_FROM_MULTIPLE — never picks a winner automatically", () => {
    const result = classifyConflict(baseInput({ precedence: DERIVED_FROM_MULTIPLE }));
    expect(result.status).toBe("CONFLICT_UNRESOLVED");
    expect(result.resolutionRule).toBeNull();
    expect(result.resolvedValue).toBeNull();
    expect(result.resolvedSource).toBeNull();
  });

  it("stays CONFLICT_UNRESOLVED for MISSING precedence", () => {
    const result = classifyConflict(baseInput({ precedence: MISSING }));
    expect(result.status).toBe("CONFLICT_UNRESOLVED");
    expect(result.resolvedValue).toBeNull();
  });

  // Replaces the old CROSS_CHECK_ONLY_* case: a source with no primary authority for a
  // field no longer has a dedicated enum value, it simply never appears as
  // `precedence.source`. The behaviour under test is the same one — a non-authoritative
  // source never wins a conflict — expressed on the generalized shape.
  it("stays CONFLICT_UNRESOLVED when PRIMARY names a source that is neither sourceA nor sourceB", () => {
    const result = classifyConflict(
      baseInput({
        sourceA: "fantacalcio",
        provenanceA: provenance("fantacalcio"),
        sourceB: SYNTHETIC_SOURCE_NAME,
        provenanceB: provenance(SYNTHETIC_SOURCE_NAME),
        precedence: PRIMARY_API_FOOTBALL,
      }),
    );
    expect(result.status).toBe("CONFLICT_UNRESOLVED");
    expect(result.resolvedSource).toBeNull();
  });

  it("always preserves both raw values and both provenance records, resolved or not", () => {
    const result = classifyConflict(baseInput());
    expect(result.valueA).toBe("Team Synthetic FC");
    expect(result.valueB).toBe("Team Synthetic FC (alt)");
    expect(result.provenanceA.source).toBe("api_football");
    expect(result.provenanceB.source).toBe(SYNTHETIC_SOURCE_NAME);
  });
});

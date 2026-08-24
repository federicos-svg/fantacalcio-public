import { describe, expect, it } from "vitest";
import {
  classifyDerivedCellCoverage,
  classifySourceCoverage,
} from "../src/coverageClassifier.js";
import {
  syntheticCompleteEvidence,
  syntheticMissingBySourceEvidence,
  syntheticNotHistoricalEvidence,
  syntheticNotTestedEvidence,
  syntheticPartialEvidence,
  syntheticPlanRestrictedEvidence,
  syntheticSnapshotOnlyEvidence,
} from "../fixtures/syntheticEvidence.js";
import type { CoverageStatus, FeatureSourceName } from "../src/types.js";

// Synthetic-only source names, never real FeatureSourceName values registered anywhere
// in this repo — used purely to prove classifyDerivedCellCoverage() is generic over an
// arbitrary number of map entries rather than hardcoding two named parameters.
function coverageMap(
  entries: ReadonlyArray<readonly [string, CoverageStatus]>,
): ReadonlyMap<FeatureSourceName, CoverageStatus> {
  return new Map(entries) as unknown as ReadonlyMap<FeatureSourceName, CoverageStatus>;
}

describe("classifySourceCoverage", () => {
  it("returns NOT_TESTED when tested is false, regardless of other fields", () => {
    expect(classifySourceCoverage(syntheticNotTestedEvidence)).toBe("NOT_TESTED");
  });

  it("never upgrades NOT_TESTED to MISSING_BY_SOURCE even with accessible:false", () => {
    const evidence = { ...syntheticNotTestedEvidence, accessible: false, recordCount: 0 };
    expect(classifySourceCoverage(evidence)).toBe("NOT_TESTED");
  });

  it("returns PLAN_RESTRICTED when the provider signals a plan restriction", () => {
    expect(classifySourceCoverage(syntheticPlanRestrictedEvidence)).toBe("PLAN_RESTRICTED");
  });

  it("returns SNAPSHOT_ONLY when the resource does not accept a season parameter", () => {
    expect(classifySourceCoverage(syntheticSnapshotOnlyEvidence)).toBe("SNAPSHOT_ONLY");
  });

  it("SNAPSHOT_ONLY is never treated as usable historical data even with a full record count", () => {
    const evidence = { ...syntheticSnapshotOnlyEvidence, recordCount: 999 };
    expect(classifySourceCoverage(evidence)).toBe("SNAPSHOT_ONLY");
  });

  it("returns NOT_HISTORICAL when the per-season view carries retroactive overlay risk", () => {
    expect(classifySourceCoverage(syntheticNotHistoricalEvidence)).toBe("NOT_HISTORICAL");
  });

  it("returns MISSING_BY_SOURCE when tested and accessible is false without plan restriction", () => {
    expect(classifySourceCoverage(syntheticMissingBySourceEvidence)).toBe("MISSING_BY_SOURCE");
  });

  it("returns MISSING_BY_SOURCE when recordCount is null despite accessible:true", () => {
    const evidence = { ...syntheticCompleteEvidence, recordCount: null };
    expect(classifySourceCoverage(evidence)).toBe("MISSING_BY_SOURCE");
  });

  it("returns PARTIAL when recordCount is below the expected minimum", () => {
    expect(classifySourceCoverage(syntheticPartialEvidence)).toBe("PARTIAL");
  });

  it("returns COMPLETE when recordCount meets the expected minimum", () => {
    expect(classifySourceCoverage(syntheticCompleteEvidence)).toBe("COMPLETE");
  });

  it("returns COMPLETE when no expected minimum is declared and data is accessible", () => {
    const evidence = { ...syntheticCompleteEvidence, expectedMinimumRecordCount: null };
    expect(classifySourceCoverage(evidence)).toBe("COMPLETE");
  });
});

describe("classifyDerivedCellCoverage", () => {
  it("returns CONFLICT only when at least two sources are COMPLETE/PARTIAL and a value conflict is declared", () => {
    const coverage = coverageMap([
      ["api_football", "COMPLETE"],
      ["synthetic_source_b", "PARTIAL"],
    ]);
    expect(classifyDerivedCellCoverage(coverage, true)).toBe("CONFLICT");
  });

  it("does not return CONFLICT when one side is NOT_TESTED, even if hasValueConflict is true", () => {
    const coverage = coverageMap([
      ["api_football", "COMPLETE"],
      ["synthetic_source_b", "NOT_TESTED"],
    ]);
    expect(classifyDerivedCellCoverage(coverage, true)).toBe("COMPLETE");
  });

  it("does not return CONFLICT when hasValueConflict is false", () => {
    const coverage = coverageMap([
      ["api_football", "COMPLETE"],
      ["synthetic_source_b", "PARTIAL"],
    ]);
    expect(classifyDerivedCellCoverage(coverage, false)).toBe("COMPLETE");
  });

  it("picks the strongest coverage status across any number of sources", () => {
    const coverage = coverageMap([
      ["api_football", "PLAN_RESTRICTED"],
      ["synthetic_source_b", "COMPLETE"],
      ["synthetic_source_c", "NOT_TESTED"],
    ]);
    expect(classifyDerivedCellCoverage(coverage, false)).toBe("COMPLETE");
  });

  it("falls back to NOT_TESTED only when every source is NOT_TESTED", () => {
    const coverage = coverageMap([
      ["api_football", "NOT_TESTED"],
      ["synthetic_source_b", "NOT_TESTED"],
    ]);
    expect(classifyDerivedCellCoverage(coverage, false)).toBe("NOT_TESTED");
  });

  it("returns NOT_TESTED for an empty source map — no source data at all is never silently treated as coverage", () => {
    expect(classifyDerivedCellCoverage(new Map(), false)).toBe("NOT_TESTED");
    expect(classifyDerivedCellCoverage(new Map(), true)).toBe("NOT_TESTED");
  });

  it("still returns CONFLICT with three or more conflict-eligible sources and a declared value conflict", () => {
    const coverage = coverageMap([
      ["api_football", "COMPLETE"],
      ["synthetic_source_b", "PARTIAL"],
      ["synthetic_source_c", "COMPLETE"],
    ]);
    expect(classifyDerivedCellCoverage(coverage, true)).toBe("CONFLICT");
  });

  it("never returns CONFLICT with a single source — one source cannot disagree with itself", () => {
    const coverage = coverageMap([["api_football", "COMPLETE"]]);
    expect(classifyDerivedCellCoverage(coverage, true)).toBe("COMPLETE");
  });
});

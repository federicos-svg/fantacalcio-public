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
  it("returns CONFLICT only when both sides are COMPLETE/PARTIAL and a value conflict is declared", () => {
    expect(classifyDerivedCellCoverage("COMPLETE", "PARTIAL", true)).toBe("CONFLICT");
  });

  it("does not return CONFLICT when one side is NOT_TESTED, even if hasValueConflict is true", () => {
    expect(classifyDerivedCellCoverage("COMPLETE", "NOT_TESTED", true)).toBe("COMPLETE");
  });

  it("does not return CONFLICT when hasValueConflict is false", () => {
    expect(classifyDerivedCellCoverage("COMPLETE", "PARTIAL", false)).toBe("COMPLETE");
  });

  it("picks the strongest coverage status between the two sources", () => {
    expect(classifyDerivedCellCoverage("PLAN_RESTRICTED", "COMPLETE", false)).toBe("COMPLETE");
  });

  it("falls back to NOT_TESTED only when both sources are NOT_TESTED", () => {
    expect(classifyDerivedCellCoverage("NOT_TESTED", "NOT_TESTED", false)).toBe("NOT_TESTED");
  });
});

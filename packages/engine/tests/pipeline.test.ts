import { describe, it, expect } from "vitest";
import { runSyntheticPipeline } from "../src/index.js";
import {
  syntheticRawSheet,
  rawStructuralPaddingSheet,
  rawParserErrorSheet,
  rawValidatorWarningSheet,
} from "../fixtures/synthetic_votes.js";

// End-to-end manifest over the existing synthetic pipeline
//   RawSheet → normalize → parse → validate vote records
// Pure, in-memory, fixture-only. NO real data, NO XLSX, NO dependency, NO gate.
// The manifest only orchestrates and reports; it adds no validation logic and
// promotes nothing.

describe("runSyntheticPipeline — happy path round-trip", () => {
  const m = runSyntheticPipeline(syntheticRawSheet());

  it("runs all three stages successfully", () => {
    expect(m.stages.map((s) => s.stage)).toEqual(["normalize", "parse", "validate"]);
    expect(m.stages.every((s) => s.outcome === "ok")).toBe(true);
    expect(m.failedStage).toBeNull();
  });

  it("reports an overall `valid` status with no issues", () => {
    expect(m.status).toBe("valid");
    expect(m.issues).toHaveLength(0);
    expect(m.counts.validationErrors).toBe(0);
    expect(m.counts.validationWarnings).toBe(0);
  });

  it("summarizes the principal counts", () => {
    // syntheticRawSheet: title + 3 preamble rows dropped by content → body =
    // team + header + 3 player/ALL rows
    expect(m.counts.normalizedRows).toBe(5);
    expect(m.counts.parsedRecords).toBe(3); // 2 players + 1 ALL
    expect(m.counts.playerRecords).toBe(2); // ALL excluded
  });

  it("never promotes: gate stays OFF and nothing is canonical-promoted", () => {
    expect(m.data_promoted_eligible).toBe(false);
    expect(m.canonical_promoted).toBe(false);
    expect(m.validation?.data_promoted_eligible).toBe(false);
  });
});

describe("runSyntheticPipeline — stage failures stop the pipeline", () => {
  it("reports a normalize-stage failure (structural padding) and stops", () => {
    const m = runSyntheticPipeline(rawStructuralPaddingSheet());
    expect(m.status).toBe("invalid");
    expect(m.failedStage).toBe("normalize");
    expect(m.stages.map((s) => s.stage)).toEqual(["normalize"]);
    expect(m.stages[0]!.outcome).toBe("failed");
    expect(m.stages[0]!.error).toContain("NormalizeError");
    expect(m.counts.normalizedRows).toBeNull();
    expect(m.validation).toBeNull();
    expect(m.data_promoted_eligible).toBe(false);
  });

  it("reports a parse-stage failure (unknown vote token) after a clean normalize", () => {
    const m = runSyntheticPipeline(rawParserErrorSheet());
    expect(m.status).toBe("invalid");
    expect(m.failedStage).toBe("parse");
    expect(m.stages.map((s) => s.stage)).toEqual(["normalize", "parse"]);
    expect(m.stages[0]!.outcome).toBe("ok");
    expect(m.stages[1]!.outcome).toBe("failed");
    expect(m.stages[1]!.error).toContain("ParseError");
    expect(m.counts.normalizedRows).not.toBeNull(); // normalize completed
    expect(m.counts.parsedRecords).toBeNull(); // parse did not
    expect(m.validation).toBeNull();
  });
});

describe("runSyntheticPipeline — validator stage outcomes", () => {
  it("surfaces a non-blocking validator warning (duplicate per-file Cod.)", () => {
    const m = runSyntheticPipeline(rawValidatorWarningSheet());
    expect(m.status).toBe("warning");
    expect(m.failedStage).toBeNull();
    expect(m.stages.every((s) => s.outcome === "ok")).toBe(true);
    expect(m.counts.validationErrors).toBe(0);
    expect(m.counts.validationWarnings).toBe(1);
    expect(m.issues.map((x) => x.code)).toEqual(["duplicate_external_id"]);
    expect(m.data_promoted_eligible).toBe(false);
  });
});

describe("runSyntheticPipeline — determinism", () => {
  it("same RawSheet → identical manifest (happy path)", () => {
    expect(runSyntheticPipeline(syntheticRawSheet())).toEqual(runSyntheticPipeline(syntheticRawSheet()));
  });

  it("same RawSheet → identical manifest (failure path)", () => {
    expect(runSyntheticPipeline(rawParserErrorSheet())).toEqual(runSyntheticPipeline(rawParserErrorSheet()));
  });
});

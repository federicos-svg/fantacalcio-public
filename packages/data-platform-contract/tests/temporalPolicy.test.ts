import { describe, expect, it } from "vitest";
import { PointInTimeValidationError } from "../../hybrid-dataset-contract/src/pointInTimeClassifier.js";
import {
  classifyPlatformPointInTime,
  isModelSource,
  toHybridSourceName,
} from "../src/temporalPolicy.js";
import type { PlatformPointInTimeInput } from "../src/temporalPolicy.js";

const buildable: PlatformPointInTimeInput = {
  feature: "api_football_minutes",
  sourceId: "api_football",
  sourceEntityId: "synthetic-player-1",
  season: "2024_25",
  observedAt: "2025-05-25T20:00:00Z",
  availableAt: "2025-05-25T21:00:00Z",
  cutoffAt: "2025-08-01T00:00:00Z",
  snapshotClassification: "TRUE_HISTORICAL_SNAPSHOT",
  transformVersion: "synthetic-v1",
  missingnessStatus: "present",
  conflictStatus: "no_conflict",
};

describe("platform point-in-time bridge", () => {
  it("maps platform source ids to the existing hybrid contract", () => {
    expect(toHybridSourceName("fantacalcio_votes")).toBe("fantacalcio");
    expect(toHybridSourceName("api_football")).toBe("api_football");
    expect(isModelSource("wikidata")).toBe(false);
  });

  it("reuses the existing classifier for buildable features", () => {
    expect(classifyPlatformPointInTime(buildable)).toBe("BUILDABLE_POINT_IN_TIME");
  });

  it("marks data first available after cutoff as leakage", () => {
    expect(
      classifyPlatformPointInTime({
        ...buildable,
        availableAt: "2025-09-01T00:00:00Z",
      }),
    ).toBe("LEAKAGE_RISK");
  });

  it("marks current-only values used historically as leakage", () => {
    expect(
      classifyPlatformPointInTime({
        ...buildable,
        snapshotClassification: "CURRENT_VALUE_ONLY",
      }),
    ).toBe("LEAKAGE_RISK");
  });

  it("keeps explicit missingness out of a buildable dataset", () => {
    expect(
      classifyPlatformPointInTime({
        ...buildable,
        missingnessStatus: "missing_not_tested",
      }),
    ).toBe("NOT_BUILDABLE");
  });

  it("keeps unresolved conflicts partial", () => {
    expect(
      classifyPlatformPointInTime({
        ...buildable,
        conflictStatus: "conflict_unresolved",
      }),
    ).toBe("PARTIAL_POINT_IN_TIME");
  });

  it("fails closed on an invalid timestamp", () => {
    expect(() =>
      classifyPlatformPointInTime({ ...buildable, availableAt: "2025-02-30T12:00:00Z" }),
    ).toThrow(PointInTimeValidationError);
  });
});

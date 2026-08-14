import { describe, expect, it } from "vitest";
import {
  classifyPointInTime,
  PointInTimeValidationError,
  validatePointInTimeDeclaration,
} from "../src/pointInTimeClassifier.js";
import {
  syntheticAvailableEqualsCutoff,
  syntheticBuildablePointInTime,
  syntheticInvalidFeb29NonLeapYear,
  syntheticInvalidFeb30,
  syntheticInvalidHour24,
  syntheticInvalidMonth13,
  syntheticInvalidObservedAt,
  syntheticInvalidTimezoneOffset,
  syntheticLeakageAfterCutoff,
  syntheticLeakageCurrentValueOverlay,
  syntheticMissingObservedAt,
  syntheticNotBuildableMissing,
  syntheticProvenanceMismatch,
  syntheticTimezoneInvalid,
  syntheticValidFeb29LeapYear,
  syntheticValidWithMilliseconds,
} from "../fixtures/syntheticEvidence.js";

describe("classifyPointInTime", () => {
  it("returns BUILDABLE_POINT_IN_TIME when available before cutoff and fully present", () => {
    expect(classifyPointInTime(syntheticBuildablePointInTime)).toBe("BUILDABLE_POINT_IN_TIME");
  });

  it("returns LEAKAGE_RISK when availableAt is after cutoffAt", () => {
    expect(classifyPointInTime(syntheticLeakageAfterCutoff)).toBe("LEAKAGE_RISK");
  });

  it("returns BUILDABLE_POINT_IN_TIME when availableAt equals cutoffAt exactly (boundary, not leakage)", () => {
    expect(classifyPointInTime(syntheticAvailableEqualsCutoff)).toBe("BUILDABLE_POINT_IN_TIME");
  });

  it("returns LEAKAGE_RISK for CURRENT_VALUE_ONLY overlaid on a past season, even if available before cutoff", () => {
    expect(classifyPointInTime(syntheticLeakageCurrentValueOverlay)).toBe("LEAKAGE_RISK");
  });

  it("returns NOT_BUILDABLE for missing_not_tested even when technically available before cutoff", () => {
    expect(classifyPointInTime(syntheticNotBuildableMissing)).toBe("NOT_BUILDABLE");
  });

  it("LEAKAGE_RISK outranks missingness — a feature can never be downgraded from LEAKAGE_RISK to NOT_BUILDABLE", () => {
    const declaration = {
      ...syntheticLeakageAfterCutoff,
      missingnessStatus: "missing_by_source" as const,
      provenance: {
        ...syntheticLeakageAfterCutoff.provenance,
        missingnessStatus: "missing_by_source" as const,
      },
    };
    expect(classifyPointInTime(declaration)).toBe("LEAKAGE_RISK");
  });

  it("returns PARTIAL_POINT_IN_TIME when the conflict is unresolved but no leakage/missingness applies", () => {
    const declaration = {
      ...syntheticBuildablePointInTime,
      conflictStatus: "conflict_unresolved" as const,
      provenance: {
        ...syntheticBuildablePointInTime.provenance,
        conflictStatus: "conflict_unresolved" as const,
      },
    };
    expect(classifyPointInTime(declaration)).toBe("PARTIAL_POINT_IN_TIME");
  });

  it("returns PARTIAL_POINT_IN_TIME when snapshot classification is UNKNOWN but data is present", () => {
    const declaration = {
      ...syntheticBuildablePointInTime,
      snapshotClassification: "UNKNOWN" as const,
      provenance: {
        ...syntheticBuildablePointInTime.provenance,
        snapshotClassification: "UNKNOWN" as const,
      },
    };
    expect(classifyPointInTime(declaration)).toBe("PARTIAL_POINT_IN_TIME");
  });

  describe("fail-closed on invalid input (finding 2)", () => {
    it("throws PointInTimeValidationError on an unparseable observedAt — never returns BUILDABLE_POINT_IN_TIME", () => {
      expect(() => classifyPointInTime(syntheticInvalidObservedAt)).toThrow(
        PointInTimeValidationError,
      );
      try {
        classifyPointInTime(syntheticInvalidObservedAt);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(PointInTimeValidationError);
        expect((error as PointInTimeValidationError).reasonCode).toBe("invalid_observed_at");
      }
    });

    it("throws on a timestamp missing an explicit timezone designator", () => {
      expect(() => classifyPointInTime(syntheticTimezoneInvalid)).toThrow(
        PointInTimeValidationError,
      );
      try {
        classifyPointInTime(syntheticTimezoneInvalid);
        expect.unreachable();
      } catch (error) {
        expect((error as PointInTimeValidationError).reasonCode).toBe("invalid_available_at");
      }
    });

    it("throws on a missing timestamp field from an untyped/external caller", () => {
      expect(() => classifyPointInTime(syntheticMissingObservedAt)).toThrow(
        PointInTimeValidationError,
      );
    });

    it("throws on provenance/declaration incoherence (season mismatch)", () => {
      expect(() => classifyPointInTime(syntheticProvenanceMismatch)).toThrow(
        PointInTimeValidationError,
      );
      try {
        classifyPointInTime(syntheticProvenanceMismatch);
        expect.unreachable();
      } catch (error) {
        expect((error as PointInTimeValidationError).reasonCode).toBe("provenance_mismatch");
      }
    });

    it("never lets an invalid declaration reach BUILDABLE_POINT_IN_TIME even if the caller ignores the thrown error type", () => {
      for (const invalid of [
        syntheticInvalidObservedAt,
        syntheticTimezoneInvalid,
        syntheticMissingObservedAt,
        syntheticProvenanceMismatch,
      ]) {
        let result: string | null = null;
        try {
          result = classifyPointInTime(invalid);
        } catch {
          // expected — result stays null
        }
        expect(result).not.toBe("BUILDABLE_POINT_IN_TIME");
      }
    });
  });

  describe("calendarically impossible dates are rejected, not normalized (finding 2, round 3)", () => {
    it("rejects 30 February — never silently rolled over to 1/2 March", () => {
      expect(() => classifyPointInTime(syntheticInvalidFeb30)).toThrow(
        PointInTimeValidationError,
      );
      try {
        classifyPointInTime(syntheticInvalidFeb30);
        expect.unreachable();
      } catch (error) {
        expect((error as PointInTimeValidationError).reasonCode).toBe("invalid_observed_at");
      }
    });

    it("rejects 29 February on a non-leap year (2023)", () => {
      expect(() => classifyPointInTime(syntheticInvalidFeb29NonLeapYear)).toThrow(
        PointInTimeValidationError,
      );
    });

    it("accepts 29 February on a leap year (2024) — does not throw", () => {
      expect(() => classifyPointInTime(syntheticValidFeb29LeapYear)).not.toThrow();
      expect(classifyPointInTime(syntheticValidFeb29LeapYear)).toBe("BUILDABLE_POINT_IN_TIME");
    });

    it("rejects month 13", () => {
      expect(() => classifyPointInTime(syntheticInvalidMonth13)).toThrow(
        PointInTimeValidationError,
      );
    });

    it("rejects hour 24 — never silently rolled over to 00:00 the next day", () => {
      expect(() => classifyPointInTime(syntheticInvalidHour24)).toThrow(
        PointInTimeValidationError,
      );
    });

    it("rejects a +25:00 timezone offset", () => {
      expect(() => classifyPointInTime(syntheticInvalidTimezoneOffset)).toThrow(
        PointInTimeValidationError,
      );
    });

    it("accepts a valid timestamp with milliseconds — does not throw", () => {
      expect(() => classifyPointInTime(syntheticValidWithMilliseconds)).not.toThrow();
      expect(classifyPointInTime(syntheticValidWithMilliseconds)).toBe(
        "BUILDABLE_POINT_IN_TIME",
      );
    });

    it("none of the calendarically invalid fixtures ever reach BUILDABLE_POINT_IN_TIME", () => {
      for (const invalid of [
        syntheticInvalidFeb30,
        syntheticInvalidFeb29NonLeapYear,
        syntheticInvalidMonth13,
        syntheticInvalidHour24,
        syntheticInvalidTimezoneOffset,
      ]) {
        let result: string | null = null;
        try {
          result = classifyPointInTime(invalid);
        } catch {
          // expected
        }
        expect(result).not.toBe("BUILDABLE_POINT_IN_TIME");
      }
    });
  });
});

describe("validatePointInTimeDeclaration", () => {
  it("does not throw for a coherent, valid declaration", () => {
    expect(() => validatePointInTimeDeclaration(syntheticBuildablePointInTime)).not.toThrow();
  });

  it("rejects cutoffAt when malformed, independently of the other two timestamps", () => {
    const declaration = {
      ...syntheticBuildablePointInTime,
      cutoffAt: "2024/08/25",
      provenance: { ...syntheticBuildablePointInTime.provenance, cutoffAt: "2024/08/25" },
    };
    expect(() => validatePointInTimeDeclaration(declaration)).toThrow(PointInTimeValidationError);
    try {
      validatePointInTimeDeclaration(declaration);
      expect.unreachable();
    } catch (error) {
      expect((error as PointInTimeValidationError).reasonCode).toBe("invalid_cutoff_at");
    }
  });
});

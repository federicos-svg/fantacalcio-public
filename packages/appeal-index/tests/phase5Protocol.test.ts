import { describe, expect, it } from "vitest";
import type { AppealIndexComponent } from "../src/appealIndex.js";
import {
  PHASE5_CONFIG,
  assertPhase5OutputShape,
  evidenceTierFor,
  normalizeComponentForDisplay,
  percentileRankWithinCohort,
  phase5ConfigHash,
  roundForRender,
} from "../src/phase5Protocol.js";

function component(overrides: Partial<AppealIndexComponent> = {}): AppealIndexComponent {
  return {
    value: 6.5,
    validated: false,
    availability: "passive_prediction",
    method: "synthetic test component",
    ...overrides,
  };
}

describe("Fase 5 preregistered executable contract", () => {
  it("has a deterministic config hash and gates all OFF", () => {
    expect(phase5ConfigHash()).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(phase5ConfigHash()).toBe(phase5ConfigHash());
    expect(Object.values(PHASE5_CONFIG.gates).every((v) => !v)).toBe(true);
  });

  it("never rounds inside the config: rounding is declared render-only", () => {
    expect(PHASE5_CONFIG.roundingPoint).toBe("render_only");
  });

  describe("evidenceTierFor", () => {
    it("maps NO_VERDICT to not_available", () => {
      expect(evidenceTierFor("NO_VERDICT")).toBe("not_available");
    });

    it("maps both scouting dispositions to scouting_backed", () => {
      expect(evidenceTierFor("SCOUTING_MODEL_SELECTED")).toBe("scouting_backed");
      expect(evidenceTierFor("SCOUTING_ROLE_SPECIFIC_MODEL_SELECTED")).toBe("scouting_backed");
    });

    it("maps HEURISTIC_ONLY and BASELINE_RETAINED to heuristic_only", () => {
      expect(evidenceTierFor("HEURISTIC_ONLY")).toBe("heuristic_only");
      expect(evidenceTierFor("BASELINE_RETAINED")).toBe("heuristic_only");
    });
  });

  describe("percentileRankWithinCohort", () => {
    it("computes the below-or-equal fraction", () => {
      expect(percentileRankWithinCohort(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBeCloseTo(0.5);
    });

    it("counts ties as below-or-equal", () => {
      expect(percentileRankWithinCohort(5, [5, 5, 5, 5])).toBe(1);
    });

    it("falls back to the 0.5 midpoint for an empty cohort", () => {
      expect(percentileRankWithinCohort(7, [])).toBe(0.5);
    });
  });

  describe("normalizeComponentForDisplay", () => {
    it("withholds a score unconditionally for NO_VERDICT, even with a valid value and cohort", () => {
      const result = normalizeComponentForDisplay({
        component: component({ value: 9, availability: "available" }),
        disposition: "NO_VERDICT",
        role: "P",
        cohort: [1, 2, 3, 9],
      });
      expect(result.scale0to100).toBeNull();
      expect(result.evidenceTier).toBe("not_available");
    });

    it("withholds a score for missing_input regardless of disposition", () => {
      const result = normalizeComponentForDisplay({
        component: component({ value: null, availability: "missing_input" }),
        disposition: "SCOUTING_MODEL_SELECTED",
        role: "D",
        cohort: [1, 2, 3],
      });
      expect(result.scale0to100).toBeNull();
    });

    it("never falls back to the empty-cohort midpoint when withheld by disposition", () => {
      // Regression guard: an empty cohort alone would normally give 50, but
      // NO_VERDICT must win over that fallback, never blend into a number.
      const result = normalizeComponentForDisplay({
        component: component({ value: 6, availability: "available" }),
        disposition: "NO_VERDICT",
        role: "P",
        cohort: [],
      });
      expect(result.scale0to100).toBeNull();
    });

    it("computes a percentile score and tags scouting_backed for SCOUTING_MODEL_SELECTED", () => {
      const result = normalizeComponentForDisplay({
        component: component({ value: 7 }),
        disposition: "SCOUTING_MODEL_SELECTED",
        role: "D",
        cohort: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      });
      expect(result.scale0to100).toBeCloseTo(70);
      expect(result.evidenceTier).toBe("scouting_backed");
      expect(result.role).toBe("D");
    });

    it("computes a percentile score and tags heuristic_only for HEURISTIC_ONLY", () => {
      const result = normalizeComponentForDisplay({
        component: component({ value: 3, availability: "available" }),
        disposition: "HEURISTIC_ONLY",
        role: "C",
        cohort: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      });
      expect(result.scale0to100).toBeCloseTo(30);
      expect(result.evidenceTier).toBe("heuristic_only");
    });

    it("uses the empty-cohort midpoint only when the component itself is not withheld", () => {
      const result = normalizeComponentForDisplay({
        component: component({ value: 6, availability: "available" }),
        disposition: "HEURISTIC_ONLY",
        role: "A",
        cohort: [],
      });
      expect(result.scale0to100).toBe(50);
    });

    it("withholds a score when the component value itself is null (not just missing_input)", () => {
      const result = normalizeComponentForDisplay({
        component: component({ value: null, availability: "available" }),
        disposition: "HEURISTIC_ONLY",
        role: "A",
        cohort: [1, 2, 3],
      });
      expect(result.scale0to100).toBeNull();
    });

    it("keeps decimals internally: the raw percentile is never pre-rounded", () => {
      const result = normalizeComponentForDisplay({
        component: component({ value: 1 }),
        disposition: "SCOUTING_MODEL_SELECTED",
        role: "D",
        cohort: [0, 1, 2],
      });
      // 2 of 3 values are <= 1 -> 2/3 * 100 = 66.666...
      expect(result.scale0to100).toBeCloseTo((2 / 3) * 100, 10);
      expect(Number.isInteger(result.scale0to100)).toBe(false);
    });
  });

  describe("roundForRender", () => {
    it("renders null as n/d", () => {
      expect(roundForRender(null)).toBe("n/d");
    });

    it("rounds only at render time", () => {
      expect(roundForRender(33.4)).toBe("33");
      expect(roundForRender(66.6)).toBe("67");
    });
  });

  describe("assertPhase5OutputShape", () => {
    it("passes on a compliant, disposition-tagged component", () => {
      const compliant = normalizeComponentForDisplay({
        component: component({ value: 5 }),
        disposition: "SCOUTING_MODEL_SELECTED",
        role: "D",
        cohort: [1, 2, 3, 4, 5],
      });
      expect(() => assertPhase5OutputShape(compliant)).not.toThrow();
    });

    it("throws on a composite/aggregate score", () => {
      expect(() => assertPhase5OutputShape({ compositeScore: 72 })).toThrow(/PHASE5_FORBIDDEN_OUTPUT/);
      expect(() => assertPhase5OutputShape({ overallAppeal: 72 })).toThrow(/PHASE5_FORBIDDEN_OUTPUT/);
      expect(() => assertPhase5OutputShape({ aggregateScore: 72 })).toThrow(/PHASE5_FORBIDDEN_OUTPUT/);
    });

    it("throws on a confidence/accuracy claim, receipt, or promoted gate", () => {
      expect(() => assertPhase5OutputShape({ confidence: 0.9 })).toThrow(/PHASE5_FORBIDDEN_OUTPUT/);
      expect(() => assertPhase5OutputShape({ accuracy: 0.9 })).toThrow(/PHASE5_FORBIDDEN_OUTPUT/);
      expect(() => assertPhase5OutputShape({ receipt: {} })).toThrow(/PHASE5_FORBIDDEN_OUTPUT/);
      expect(() => assertPhase5OutputShape({ decision_promoted: true })).toThrow(/PHASE5_FORBIDDEN_OUTPUT/);
    });

    it("throws on VOR fields, which this contract never normalizes", () => {
      expect(() => assertPhase5OutputShape({ role_VOR: 12 })).toThrow(/PHASE5_FORBIDDEN_OUTPUT/);
      expect(() => assertPhase5OutputShape({ archetype_VOR: 12 })).toThrow(/PHASE5_FORBIDDEN_OUTPUT/);
    });
  });
});

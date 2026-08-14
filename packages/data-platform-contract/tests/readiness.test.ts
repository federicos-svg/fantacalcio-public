import { describe, expect, it } from "vitest";
import {
  ALGORITHM_PIPELINE_REQUIREMENTS,
  evaluatePipelineReadiness,
  validatePipelineRequirementSpecs,
} from "../src/readiness.js";
import type { PipelineRequirementSpec } from "../src/types.js";

const spec: PipelineRequirementSpec = {
  pipelineId: "TEST_PIPELINE",
  capabilityRequirements: [
    { capabilityId: "data", minimumLevel: "SYNTHETIC_ONLY" },
    { capabilityId: "protocol", minimumLevel: "SYNTHETIC_ONLY" },
  ],
  authorityRequirements: [],
  readyStateWhenSatisfied: "FIXTURE_READY",
};

describe("pipeline execution readiness", () => {
  it("accepts the canonical requirement templates", () => {
    expect(validatePipelineRequirementSpecs(ALGORITHM_PIPELINE_REQUIREMENTS)).toEqual([]);
  });

  it("fails closed when a capability is absent", () => {
    expect(evaluatePipelineReadiness(spec, { data: "REAL_AVAILABLE" })).toMatchObject({
      readiness: "BLOCKED",
      blockers: ["protocol: actual=MISSING, required=SYNTHETIC_ONLY"],
    });
  });

  it("fails closed when a capability is explicitly blocked", () => {
    expect(
      evaluatePipelineReadiness(spec, { data: "REAL_AVAILABLE", protocol: "BLOCKED" }),
    ).toMatchObject({
      readiness: "BLOCKED",
      blockers: ["protocol: actual=BLOCKED, required=SYNTHETIC_ONLY"],
    });
  });

  it("returns the declared execution stage without inferring scientific authority", () => {
    expect(
      evaluatePipelineReadiness(spec, { data: "REAL_AVAILABLE", protocol: "SYNTHETIC_ONLY" }),
    ).toMatchObject({
      readiness: "FIXTURE_READY",
      unmetCapabilities: [],
      unmetAuthorities: [],
    });
  });

  it("blocks FTM when upstream authority is only scouting", () => {
    const ftm = ALGORITHM_PIPELINE_REQUIREMENTS.find((candidate) => candidate.pipelineId === "FAIR_TO_ME")!;
    expect(
      evaluatePipelineReadiness(
        ftm,
        { plan_01: "REAL_AVAILABLE" },
        { value_authority: "SCOUTING", material_modifier_authority: "ADVISORY" },
      ),
    ).toMatchObject({
      readiness: "BLOCKED",
      blockers: ["value_authority: authority=SCOUTING, required=ADVISORY"],
    });
  });

  it("allows an FTM real run only when both upstream authorities are advisory", () => {
    const ftm = ALGORITHM_PIPELINE_REQUIREMENTS.find((candidate) => candidate.pipelineId === "FAIR_TO_ME")!;
    expect(
      evaluatePipelineReadiness(
        ftm,
        { plan_01: "REAL_AVAILABLE" },
        { value_authority: "ADVISORY", material_modifier_authority: "ADVISORY" },
      ).readiness,
    ).toBe("REAL_RUN_READY");
  });

  it("rejects empty and duplicate requirement declarations", () => {
    expect(
      validatePipelineRequirementSpecs([
        {
          pipelineId: "EMPTY",
          capabilityRequirements: [],
          authorityRequirements: [],
          readyStateWhenSatisfied: "CONTRACT_READY",
        },
        {
          pipelineId: "DUP",
          capabilityRequirements: [
            { capabilityId: "x", minimumLevel: "CONTRACT_ONLY" },
            { capabilityId: "x", minimumLevel: "REAL_AVAILABLE" },
          ],
          authorityRequirements: [
            { authorityId: "a", minimumLevel: "SCOUTING" },
            { authorityId: "a", minimumLevel: "ADVISORY" },
          ],
          readyStateWhenSatisfied: "REAL_RUN_READY",
        },
      ]),
    ).toEqual([
      "EMPTY: no capability requirements",
      "DUP: duplicate capability x",
      "DUP: duplicate authority a",
    ]);
  });
});

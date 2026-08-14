import type {
  AuthorityLevel,
  AuthorityRequirement,
  CapabilityLevel,
  CapabilityRequirement,
  PipelineReadinessResult,
  PipelineRequirementSpec,
} from "./types.js";

const CAPABILITY_RANK: Readonly<Record<Exclude<CapabilityLevel, "BLOCKED">, number>> = {
  MISSING: 0,
  CONTRACT_ONLY: 1,
  SYNTHETIC_ONLY: 2,
  REAL_PARTIAL: 3,
  REAL_AVAILABLE: 4,
};

const AUTHORITY_RANK: Readonly<Record<AuthorityLevel, number>> = {
  NONE: 0,
  SCOUTING: 1,
  ADVISORY: 2,
  DIRECTIVE: 3,
};

function capabilitySatisfied(
  actual: CapabilityLevel,
  minimum: Exclude<CapabilityLevel, "BLOCKED">,
): boolean {
  if (actual === "BLOCKED") return false;
  return CAPABILITY_RANK[actual] >= CAPABILITY_RANK[minimum];
}

function authoritySatisfied(
  actual: AuthorityLevel,
  minimum: Exclude<AuthorityLevel, "NONE">,
): boolean {
  return AUTHORITY_RANK[actual] >= AUTHORITY_RANK[minimum];
}

export function validatePipelineRequirementSpecs(
  specs: readonly PipelineRequirementSpec[],
): readonly string[] {
  const errors: string[] = [];
  const pipelines = new Set<string>();

  for (const spec of specs) {
    if (pipelines.has(spec.pipelineId)) errors.push(`duplicate pipeline: ${spec.pipelineId}`);
    pipelines.add(spec.pipelineId);

    if (spec.capabilityRequirements.length === 0) {
      errors.push(`${spec.pipelineId}: no capability requirements`);
    }

    const capabilities = new Set<string>();
    for (const requirement of spec.capabilityRequirements) {
      if (capabilities.has(requirement.capabilityId)) {
        errors.push(`${spec.pipelineId}: duplicate capability ${requirement.capabilityId}`);
      }
      capabilities.add(requirement.capabilityId);
    }

    const authorities = new Set<string>();
    for (const requirement of spec.authorityRequirements) {
      if (authorities.has(requirement.authorityId)) {
        errors.push(`${spec.pipelineId}: duplicate authority ${requirement.authorityId}`);
      }
      authorities.add(requirement.authorityId);
    }
  }

  return errors;
}

/**
 * Evaluates whether a pipeline may run at the explicitly declared execution stage.
 * It never derives model authority from technical maturity and never creates a receipt.
 */
export function evaluatePipelineReadiness(
  spec: PipelineRequirementSpec,
  capabilities: Readonly<Record<string, CapabilityLevel>>,
  authorities: Readonly<Record<string, AuthorityLevel>> = {},
): PipelineReadinessResult {
  const specErrors = validatePipelineRequirementSpecs([spec]);
  if (specErrors.length > 0) {
    return {
      pipelineId: spec.pipelineId,
      readiness: "BLOCKED",
      unmetCapabilities: spec.capabilityRequirements,
      unmetAuthorities: spec.authorityRequirements,
      blockers: specErrors,
    };
  }

  const unmetCapabilities: CapabilityRequirement[] = [];
  const unmetAuthorities: AuthorityRequirement[] = [];
  const blockers: string[] = [];

  for (const requirement of spec.capabilityRequirements) {
    const actual = capabilities[requirement.capabilityId] ?? "MISSING";
    if (!capabilitySatisfied(actual, requirement.minimumLevel)) {
      unmetCapabilities.push(requirement);
      blockers.push(
        `${requirement.capabilityId}: actual=${actual}, required=${requirement.minimumLevel}`,
      );
    }
  }

  for (const requirement of spec.authorityRequirements) {
    const actual = authorities[requirement.authorityId] ?? "NONE";
    if (!authoritySatisfied(actual, requirement.minimumLevel)) {
      unmetAuthorities.push(requirement);
      blockers.push(
        `${requirement.authorityId}: authority=${actual}, required=${requirement.minimumLevel}`,
      );
    }
  }

  return {
    pipelineId: spec.pipelineId,
    readiness:
      unmetCapabilities.length > 0 || unmetAuthorities.length > 0
        ? "BLOCKED"
        : spec.readyStateWhenSatisfied,
    unmetCapabilities,
    unmetAuthorities,
    blockers,
  };
}

/** Requirements are execution templates, not current-state claims or promotion receipts. */
export const ALGORITHM_PIPELINE_REQUIREMENTS: readonly PipelineRequirementSpec[] = [
  {
    pipelineId: "VALUE_CORE",
    capabilityRequirements: [
      { capabilityId: "fantacalcio_targets", minimumLevel: "REAL_AVAILABLE" },
      { capabilityId: "identity_join", minimumLevel: "REAL_PARTIAL" },
      { capabilityId: "walk_forward_protocol", minimumLevel: "SYNTHETIC_ONLY" },
    ],
    authorityRequirements: [],
    readyStateWhenSatisfied: "PARTIAL_REAL_READY",
  },
  {
    pipelineId: "VALUE_ENRICHED",
    capabilityRequirements: [
      { capabilityId: "fantacalcio_targets", minimumLevel: "REAL_AVAILABLE" },
      { capabilityId: "identity_join", minimumLevel: "REAL_AVAILABLE" },
      { capabilityId: "historical_external_features", minimumLevel: "REAL_PARTIAL" },
      { capabilityId: "walk_forward_protocol", minimumLevel: "SYNTHETIC_ONLY" },
    ],
    authorityRequirements: [],
    readyStateWhenSatisfied: "PARTIAL_REAL_READY",
  },
  {
    pipelineId: "MOD_CALC",
    capabilityRequirements: [
      { capabilityId: "league_rule_version", minimumLevel: "CONTRACT_ONLY" },
      { capabilityId: "modifier_fixture_corpus", minimumLevel: "SYNTHETIC_ONLY" },
    ],
    authorityRequirements: [],
    readyStateWhenSatisfied: "FIXTURE_READY",
  },
  {
    pipelineId: "MOD_VALUE",
    capabilityRequirements: [
      { capabilityId: "league_rule_version", minimumLevel: "REAL_AVAILABLE" },
      { capabilityId: "modifier_ground_truth", minimumLevel: "REAL_AVAILABLE" },
      { capabilityId: "identity_join", minimumLevel: "REAL_AVAILABLE" },
    ],
    authorityRequirements: [],
    readyStateWhenSatisfied: "REAL_RUN_READY",
  },
  {
    pipelineId: "FAIR_TO_ME",
    capabilityRequirements: [
      { capabilityId: "plan_01", minimumLevel: "REAL_AVAILABLE" },
    ],
    authorityRequirements: [
      { authorityId: "value_authority", minimumLevel: "ADVISORY" },
      { authorityId: "material_modifier_authority", minimumLevel: "ADVISORY" },
    ],
    readyStateWhenSatisfied: "REAL_RUN_READY",
  },
] as const;

import { createHash } from "node:crypto";
import { DATA_FIELD_REGISTRY, validateFieldRegistry } from "./fieldRegistry.js";
import { DATA_PLATFORM_LOGICAL_MODEL, validateLogicalModel, validateScoringSeparation } from "./logicalModel.js";
import { ALGORITHM_PIPELINE_REQUIREMENTS, validatePipelineRequirementSpecs } from "./readiness.js";
import { DATA_SOURCE_REGISTRY, validateSourceRegistry } from "./sourceRegistry.js";
import { DATA_ARTIFACT_STORAGE_POLICY, validateStoragePolicy } from "./storagePolicy.js";

export const DATA_PLATFORM_CONTRACT_VERSION = "DATA-PLATFORM-CONTRACT@1.0.0" as const;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function validateDataPlatformContract(): readonly string[] {
  return [
    ...validateSourceRegistry(),
    ...validateFieldRegistry(),
    ...validateStoragePolicy(),
    ...validateLogicalModel(),
    ...validateScoringSeparation(),
    ...validatePipelineRequirementSpecs(ALGORITHM_PIPELINE_REQUIREMENTS),
  ];
}

export function assertValidDataPlatformContract(): void {
  const errors = validateDataPlatformContract();
  if (errors.length > 0) {
    throw new Error(`Invalid data platform contract:\n${errors.join("\n")}`);
  }
}

export function dataPlatformContractHash(): string {
  assertValidDataPlatformContract();
  const canonical = canonicalize({
    version: DATA_PLATFORM_CONTRACT_VERSION,
    sources: DATA_SOURCE_REGISTRY,
    fields: DATA_FIELD_REGISTRY,
    storage: DATA_ARTIFACT_STORAGE_POLICY,
    logicalModel: DATA_PLATFORM_LOGICAL_MODEL,
    pipelineRequirements: ALGORITHM_PIPELINE_REQUIREMENTS,
  });
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

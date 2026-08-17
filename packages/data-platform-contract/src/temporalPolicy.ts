import {
  classifyPointInTime,
  validatePointInTimeDeclaration,
} from "../../hybrid-dataset-contract/src/pointInTimeClassifier.js";
import type {
  ConflictStatus,
  MissingnessStatus,
  PointInTimeFeatureDeclaration,
  PointInTimeStatus,
  SnapshotClassification,
  SourceName,
} from "../../hybrid-dataset-contract/src/types.js";
import type { DataSourceId } from "./types.js";

export type ModelSourceId = "fantacalcio_votes" | "api_football";

export interface PlatformPointInTimeInput {
  readonly feature: string;
  readonly sourceId: ModelSourceId;
  readonly sourceEntityId: string;
  readonly season: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly cutoffAt: string;
  readonly snapshotClassification: SnapshotClassification;
  readonly transformVersion: string;
  readonly missingnessStatus: MissingnessStatus;
  readonly conflictStatus: ConflictStatus;
}

export function toHybridSourceName(sourceId: ModelSourceId): SourceName {
  if (sourceId === "fantacalcio_votes") return "fantacalcio";
  return sourceId;
}

export function isModelSource(sourceId: DataSourceId): sourceId is ModelSourceId {
  return sourceId === "fantacalcio_votes" || sourceId === "api_football";
}

export function buildPointInTimeDeclaration(
  input: PlatformPointInTimeInput,
): PointInTimeFeatureDeclaration {
  const source = toHybridSourceName(input.sourceId);
  return {
    feature: input.feature,
    source,
    sourceEntityId: input.sourceEntityId,
    season: input.season,
    observedAt: input.observedAt,
    availableAt: input.availableAt,
    cutoffAt: input.cutoffAt,
    snapshotClassification: input.snapshotClassification,
    transformVersion: input.transformVersion,
    provenance: {
      source,
      sourceEntityId: input.sourceEntityId,
      season: input.season,
      observedAt: input.observedAt,
      availableAt: input.availableAt,
      cutoffAt: input.cutoffAt,
      snapshotClassification: input.snapshotClassification,
      transformVersion: input.transformVersion,
      missingnessStatus: input.missingnessStatus,
      conflictStatus: input.conflictStatus,
    },
    missingnessStatus: input.missingnessStatus,
    conflictStatus: input.conflictStatus,
  };
}

/** Reuses the canonical hybrid classifier; this package does not reimplement leakage logic. */
export function classifyPlatformPointInTime(input: PlatformPointInTimeInput): PointInTimeStatus {
  const declaration = buildPointInTimeDeclaration(input);
  validatePointInTimeDeclaration(declaration);
  return classifyPointInTime(declaration);
}

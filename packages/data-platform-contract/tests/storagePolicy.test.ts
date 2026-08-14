import { describe, expect, it } from "vitest";
import {
  DATA_ARTIFACT_STORAGE_POLICY,
  placementForArtifact,
  validateStoragePolicy,
} from "../src/storagePolicy.js";
import type { ArtifactStoragePolicy } from "../src/types.js";

describe("artifact storage policy", () => {
  it("accepts the canonical policy", () => {
    expect(validateStoragePolicy()).toEqual([]);
  });

  it("keeps raw bytes and feature matrices out of the repository", () => {
    expect(placementForArtifact("raw_payload")).toMatchObject({
      primary: "OBJECT_STORAGE",
      allowedInRepository: false,
    });
    expect(placementForArtifact("feature_matrix")).toMatchObject({
      primary: "PARQUET",
      allowedInRepository: false,
    });
  });

  it("keeps the mutable auction log in local storage, not in the static bundle", () => {
    expect(placementForArtifact("auction_event_log")).toMatchObject({
      primary: "LOCAL_STORAGE",
      allowedInLiveBundle: false,
    });
  });

  it("keeps the live bundle static and database-free", () => {
    expect(placementForArtifact("live_bundle")).toMatchObject({
      primary: "LIVE_BUNDLE",
      allowedInLiveBundle: true,
    });
  });

  it("rejects raw bytes placed in Postgres", () => {
    const entries = DATA_ARTIFACT_STORAGE_POLICY.map((entry) =>
      entry.artifactKind === "raw_payload" ? { ...entry, primary: "POSTGRES" as const } : entry,
    ) as readonly ArtifactStoragePolicy[];
    expect(validateStoragePolicy(entries)).toContain("raw_payload must use OBJECT_STORAGE");
  });

  it("rejects a repository primary that is forbidden in the repository", () => {
    const entries = DATA_ARTIFACT_STORAGE_POLICY.map((entry) =>
      entry.artifactKind === "experiment_artifact"
        ? { ...entry, primary: "REPOSITORY" as const }
        : entry,
    ) as readonly ArtifactStoragePolicy[];
    expect(validateStoragePolicy(entries)).toContain(
      "experiment_artifact: REPOSITORY primary conflicts with allowedInRepository=false",
    );
  });
});

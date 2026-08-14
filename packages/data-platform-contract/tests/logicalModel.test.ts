import { describe, expect, it } from "vitest";
import {
  DATA_PLATFORM_LOGICAL_MODEL,
  getLogicalEntity,
  validateLogicalModel,
  validateScoringSeparation,
} from "../src/logicalModel.js";
import type { LogicalEntitySpec } from "../src/types.js";

describe("logical data model", () => {
  it("accepts the canonical model and scoring chain", () => {
    expect(validateLogicalModel()).toEqual([]);
    expect(validateScoringSeparation()).toEqual([]);
  });

  it("stores artifact and dataset metadata in Postgres, not their bytes", () => {
    expect(getLogicalEntity("artifact_manifest").storage).toBe("POSTGRES");
    expect(getLogicalEntity("dataset_snapshot").storage).toBe("POSTGRES");
    expect(getLogicalEntity("field_season_source_evidence").storage).toBe("POSTGRES");
    expect(getLogicalEntity("source_entity_reference").dependsOn).toEqual([]);
  });

  it("models the auction event log as append-only local runtime state", () => {
    expect(getLogicalEntity("auction_event_log")).toMatchObject({
      storage: "LOCAL_STORAGE",
      appendOnly: true,
      runtimeAccess: "LIVE_LOCAL_ONLY",
    });
  });

  it("keeps the live manifest local", () => {
    expect(getLogicalEntity("live_bundle_manifest")).toMatchObject({
      storage: "LIVE_BUNDLE",
      runtimeAccess: "LIVE_LOCAL_ONLY",
    });
  });

  it("rejects a dependency on a missing entity", () => {
    const entries = DATA_PLATFORM_LOGICAL_MODEL.filter((entry) => entry.id !== "raw_asset");
    expect(validateLogicalModel(entries)).toContain(
      "source_observation: missing dependency raw_asset",
    );
  });

  it("detects dependency cycles", () => {
    const entries = DATA_PLATFORM_LOGICAL_MODEL.map((entry) =>
      entry.id === "acquisition_run" ? { ...entry, dependsOn: ["raw_asset"] as const } : entry,
    ) as readonly LogicalEntitySpec[];
    expect(validateLogicalModel(entries).some((error) => error.startsWith("dependency cycle:"))).toBe(
      true,
    );
  });

  it("rejects a database dependency in a live-local entity", () => {
    const entries = DATA_PLATFORM_LOGICAL_MODEL.map((entry) =>
      entry.id === "live_bundle_manifest" ? { ...entry, storage: "POSTGRES" as const } : entry,
    ) as readonly LogicalEntitySpec[];
    expect(validateLogicalModel(entries)).toContain(
      "live_bundle_manifest: live-local entity cannot require POSTGRES",
    );
  });

  it("fails when the player score no longer depends on derived components", () => {
    const entries = DATA_PLATFORM_LOGICAL_MODEL.map((entry) =>
      entry.id === "player_fantasy_score"
        ? { ...entry, dependsOn: ["league_rule_version"] as const }
        : entry,
    ) as readonly LogicalEntitySpec[];
    expect(validateScoringSeparation(entries)).toContain(
      "player_fantasy_score: missing dependency derived_fantasy_component",
    );
  });
});

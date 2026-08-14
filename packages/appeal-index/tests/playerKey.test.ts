import { describe, it, expect } from "vitest";
import { resolvePlayerKey } from "../src/playerKey.js";
import type { IdentityStabilityReport } from "../src/identityStability.js";

function reportWith(recommendedJoinKey: "external_id" | "normalized_name_role"): IdentityStabilityReport {
  return {
    seasonsAnalyzed: ["2020_21", "2021_22"],
    pairwise: [],
    withinSeasonCollisions: 0,
    stableMatchRate: recommendedJoinKey === "external_id" ? 1 : 0,
    driftRate: 0,
    collisionRate: 0,
    verdict: recommendedJoinKey === "external_id" ? "stable" : "unstable",
    recommendedJoinKey,
    notes: [],
  };
}

describe("resolvePlayerKey", () => {
  it("uses external_id when the stability report confirms it", () => {
    const key = resolvePlayerKey({ externalId: 42, name: "Synthetic Player", role: "C" }, reportWith("external_id"));
    expect(key).toBe("id:42");
  });

  it("falls back to normalized name + role when the report does NOT confirm external_id", () => {
    const key = resolvePlayerKey(
      { externalId: 42, name: "Synthétic  Player", role: "C" },
      reportWith("normalized_name_role"),
    );
    expect(key).toBe("name:synthetic player|role:C");
  });

  it("the fallback key is stable across different externalId values for the same name+role", () => {
    const report = reportWith("normalized_name_role");
    const a = resolvePlayerKey({ externalId: 1, name: "Synthetic Player", role: "C" }, report);
    const b = resolvePlayerKey({ externalId: 2, name: "Synthetic Player", role: "C" }, report);
    expect(a).toBe(b);
  });
});

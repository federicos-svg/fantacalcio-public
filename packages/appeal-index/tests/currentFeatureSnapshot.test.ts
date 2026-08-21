import { describe, expect, it } from "vitest";
import { buildStableCohortSeasons } from "../fixtures/syntheticSeasons.js";
import {
  buildCurrentFeatureExclusions,
  buildCurrentFeatureRows,
} from "../src/currentFeatureSnapshot.js";
import { GOALKEEPER_FEATURE_NAMES } from "../src/goalkeeperFeatures.js";
import { buildPlayerSeasonPanel } from "../src/dataset.js";
import { seasonYear } from "../src/identityStability.js";

describe("current point-in-time feature snapshot", () => {
  it("builds target-free rows from the immediately preceding season only", () => {
    const rows = buildCurrentFeatureRows(buildPlayerSeasonPanel(buildStableCohortSeasons()), "2025_26");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => seasonYear(row.targetSeason) - seasonYear(row.featureSeason) === 1)).toBe(true);
    expect(rows.every((row) => row.sourceSeasons.at(-1) === row.featureSeason)).toBe(true);
    expect(rows.every((row) => !row.sourceSeasons.includes("2025_26"))).toBe(true);
    expect(rows.every((row) => row.targetSeason === "2025_26")).toBe(true);
  });

  it("excludes stale histories instead of treating multi-year gaps as lag-1", () => {
    const panel = buildPlayerSeasonPanel(buildStableCohortSeasons());
    expect(buildCurrentFeatureRows(panel, "2026_27")).toEqual([]);
  });

  it("is byte-identical for identical input", () => {
    const panel = buildPlayerSeasonPanel(buildStableCohortSeasons());
    expect(JSON.stringify(buildCurrentFeatureRows(panel, "2025_26"))).toBe(
      JSON.stringify(buildCurrentFeatureRows(panel, "2025_26")),
    );
  });

  it("fails closed when the target is not after the latest feature season", () => {
    const panel = buildPlayerSeasonPanel(buildStableCohortSeasons());
    expect(() => buildCurrentFeatureRows(panel, "2024_25")).toThrow("is not before target season");
  });

  it("carries a goalkeeper vector on role-P rows and on no other role", () => {
    const rows = buildCurrentFeatureRows(buildPlayerSeasonPanel(buildStableCohortSeasons()), "2025_26");
    const goalkeepers = rows.filter((row) => row.role === "P");
    expect(goalkeepers.length).toBeGreaterThan(0);
    for (const row of goalkeepers) {
      expect(row.goalkeeperFeatures).toBeDefined();
      expect(Object.keys(row.goalkeeperFeatures!).sort()).toEqual([...GOALKEEPER_FEATURE_NAMES].sort());
    }
    expect(rows.filter((row) => row.role !== "P").every((row) => row.goalkeeperFeatures === undefined)).toBe(true);
  });

  it("builds the goalkeeper vector from the same history slice as the pooled one", () => {
    const rows = buildCurrentFeatureRows(buildPlayerSeasonPanel(buildStableCohortSeasons()), "2025_26");
    const goalkeeper = rows.find((row) => row.role === "P")!;
    expect(goalkeeper.goalkeeperFeatures!.nSeasonsObserved).toBe(goalkeeper.features.nSeasonsObserved);
    expect(goalkeeper.goalkeeperFeatures!.presenzeLag1).toBe(goalkeeper.features.presenzeLag1);
    expect(goalkeeper.goalkeeperFeatures!.teamChangedFlag).toBe(goalkeeper.features.teamChangedFlag);
    expect(goalkeeper.goalkeeperFeatures!.volatilitaVotoLastObserved).toBe(
      goalkeeper.features.volatilitaVotoLastObserved,
    );
  });
});

describe("buildCurrentFeatureExclusions", () => {
  const panel = buildPlayerSeasonPanel(buildStableCohortSeasons());

  it("names the returning player the builder silently dropped, and only him", () => {
    const served = buildCurrentFeatureRows(panel, "2025_26");
    expect(served.length).toBeGreaterThan(0);
    // `id:302` leaves the synthetic panel after 2022_23. Under the shipped
    // builder he simply does not appear in the feature base, which at serving
    // time is indistinguishable from a player who never played Serie A — the
    // exact conflation this function exists to end.
    const exclusions = buildCurrentFeatureExclusions(panel, "2025_26");
    expect(exclusions.map((row) => row.playerKey)).toEqual(["id:302"]);
    expect(exclusions[0]!.lastObservedSeason).toBe("2022_23");
    expect(exclusions[0]!.seasonsSinceLastObserved).toBe(3);
    expect(served.some((row) => row.playerKey === "id:302")).toBe(false);
  });

  it("names every player the builder dropped for a stale last season, with the gap", () => {
    const exclusions = buildCurrentFeatureExclusions(panel, "2026_27");
    expect(buildCurrentFeatureRows(panel, "2026_27")).toEqual([]);
    expect(exclusions.length).toBeGreaterThan(0);
    for (const exclusion of exclusions) {
      expect(exclusion.reason).toBe("STALE_LAST_OBSERVED_SEASON");
      expect(exclusion.seasonsSinceLastObserved).toBeGreaterThanOrEqual(2);
      expect(exclusion.targetSeason).toBe("2026_27");
    }
  });

  it("partitions the panel: a player is served OR excluded, never both and never neither", () => {
    const observed = new Set(panel.rows.map((row) => row.playerKey));
    const served = new Set(buildCurrentFeatureRows(panel, "2025_26").map((row) => row.playerKey));
    const excluded = new Set(buildCurrentFeatureExclusions(panel, "2025_26").map((row) => row.playerKey));
    for (const key of served) expect(excluded.has(key)).toBe(false);
    for (const key of observed) expect(served.has(key) || excluded.has(key)).toBe(true);
  });

  it("is deterministic and does not depend on panel row order", () => {
    const shuffled = { ...panel, rows: [...panel.rows].reverse() };
    expect(JSON.stringify(buildCurrentFeatureExclusions(shuffled, "2026_27"))).toBe(
      JSON.stringify(buildCurrentFeatureExclusions(panel, "2026_27")),
    );
  });
});

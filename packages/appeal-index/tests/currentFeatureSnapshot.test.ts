import { describe, expect, it } from "vitest";
import { buildStableCohortSeasons } from "../fixtures/syntheticSeasons.js";
import { buildCurrentFeatureRows } from "../src/currentFeatureSnapshot.js";
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
});

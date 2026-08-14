import { describe, expect, it } from "vitest";
import {
  ANAGRAFICA_FEATURE,
  anagraficaBlockedRoles,
  assertAnagraficaCoverage,
  evaluateAnagraficaCoverage,
  formatAnagraficaCoverage,
} from "../src/anagraficaCoverage.js";
import { PHASE4_CONFIG, PHASE4_ROLES } from "../src/phase4Protocol.js";
import { buildFeatureRows, buildPlayerSeasonPanel } from "../src/dataset.js";
import { buildWalkForwardSplit } from "../src/validation.js";
import { evaluateGoalkeeperLadder } from "../src/goalkeeperLadder.js";
import { buildGoalkeeperCohortSeasons } from "../fixtures/syntheticSeasons.js";
import { FEATURE_NAMES, type FeatureRow, type Role } from "../src/types.js";

function row(role: Role, withAge: boolean, index: number): FeatureRow {
  const features = Object.fromEntries(
    FEATURE_NAMES.map((name) => [name, name === ANAGRAFICA_FEATURE && !withAge ? Number.NaN : 1]),
  ) as FeatureRow["features"];
  return {
    playerKey: `${role}-${index}`,
    name: `synthetic ${role} ${index}`,
    role,
    featureSeason: "2019_20",
    targetSeason: "2020_21",
    features,
    targets: { fantamediaNext: 6, presenzeNext: 30 },
    sourceSeasons: ["2019_20"],
  };
}

function rows(spec: readonly { role: Role; withAge: number; withoutAge: number }[]): FeatureRow[] {
  return spec.flatMap((entry, group) => [
    ...Array.from({ length: entry.withAge }, (_, i) => row(entry.role, true, group * 1000 + i)),
    ...Array.from({ length: entry.withoutAge }, (_, i) => row(entry.role, false, group * 1000 + 500 + i)),
  ]);
}

describe("evaluateAnagraficaCoverage", () => {
  it("counts a row as covered on exactly the finiteness test the complete-case subset uses", () => {
    const report = evaluateAnagraficaCoverage(rows([{ role: "D", withAge: 9, withoutAge: 1 }]));
    expect(report.featureName).toBe("ageAtSeasonStart");
    expect(report.protocolFeatureName).toBe("age_at_season_start");
    expect(report).toMatchObject({ rows: 10, withAge: 9 });
    expect(report.coverage).toBeCloseTo(0.9, 10);
  });

  it("evaluates the floor on the pooled-gated roles only — role P is gated by the ladder", () => {
    // Role P is deliberately starved of anagrafica here. Because @2.2.0 left
    // the goalkeeper vector untouched, that must not drag the floor down.
    const report = evaluateAnagraficaCoverage(
      rows([
        { role: "P", withAge: 0, withoutAge: 40 },
        { role: "D", withAge: 20, withoutAge: 0 },
        { role: "C", withAge: 20, withoutAge: 0 },
        { role: "A", withAge: 20, withoutAge: 0 },
      ]),
    );
    expect(report.pooledGatedRoles).toEqual(["D", "C", "A"]);
    expect(report.pooledGatedCoverage).toBe(1);
    expect(report.meetsFloor).toBe(true);
    expect(report.reasonCode).toBe("ANAGRAFICA_COVERAGE_OK");
    // Still measured and reported, just not part of the gate.
    expect(report.byRole.find((entry) => entry.role === "P")).toMatchObject({
      rows: 40,
      withAge: 0,
      pooledGated: false,
    });
    expect(report.coverage).toBeLessThan(1);
  });

  it("accepts exactly the preregistered floor and refuses just below it", () => {
    expect(PHASE4_CONFIG.anagrafica.minimumResolvedCoverage).toBe(0.9);
    const atFloor = evaluateAnagraficaCoverage(rows([{ role: "D", withAge: 90, withoutAge: 10 }]));
    expect(atFloor.meetsFloor).toBe(true);
    const belowFloor = evaluateAnagraficaCoverage(rows([{ role: "D", withAge: 89, withoutAge: 11 }]));
    expect(belowFloor.meetsFloor).toBe(false);
    expect(belowFloor.reasonCode).toBe("ANAGRAFICA_COVERAGE_BELOW_FLOOR");
  });

  it("names a complete absence separately from a merely poor coverage", () => {
    const report = evaluateAnagraficaCoverage(rows([{ role: "C", withAge: 0, withoutAge: 25 }]));
    expect(report.reasonCode).toBe("ANAGRAFICA_ABSENT");
    expect(report.meetsFloor).toBe(false);
  });

  it("an empty dataset is NO_ROWS, never a vacuously satisfied floor", () => {
    const report = evaluateAnagraficaCoverage([]);
    expect(report.reasonCode).toBe("NO_ROWS");
    expect(report.meetsFloor).toBe(false);
    expect(report.pooledGatedCoverage).toBe(0);
  });

  it("a dataset of goalkeepers only cannot satisfy the pooled floor by having no pooled rows", () => {
    const report = evaluateAnagraficaCoverage(rows([{ role: "P", withAge: 30, withoutAge: 0 }]));
    expect(report.pooledGatedRows).toBe(0);
    expect(report.reasonCode).toBe("NO_ROWS");
    expect(report.meetsFloor).toBe(false);
  });
});

describe("assertAnagraficaCoverage", () => {
  it("passes silently at or above the floor", () => {
    const report = evaluateAnagraficaCoverage(rows([{ role: "D", withAge: 95, withoutAge: 5 }]));
    expect(() => assertAnagraficaCoverage(report)).not.toThrow();
  });

  it("throws a reason code carrying the numbers, so the refusal explains itself", () => {
    const report = evaluateAnagraficaCoverage(rows([{ role: "D", withAge: 5, withoutAge: 95 }]));
    expect(() => assertAnagraficaCoverage(report)).toThrow(/PHASE4_ANAGRAFICA_COVERAGE_BELOW_FLOOR/);
    expect(() => assertAnagraficaCoverage(report)).toThrow(/coverage=0\.0500 floor=0\.9/);
  });
});

describe("assertAnagraficaCoverage — the refusal is scoped to the roles the floor governs", () => {
  // A dataset where the pooled roles are far below the floor and role P has no
  // anagrafica at all: the worst case for both, so nothing here can pass by
  // being accidentally well covered.
  const starved = evaluateAnagraficaCoverage(
    rows([
      { role: "P", withAge: 0, withoutAge: 40 },
      { role: "D", withAge: 5, withoutAge: 95 },
      { role: "C", withAge: 5, withoutAge: 95 },
      { role: "A", withAge: 5, withoutAge: 95 },
    ]),
  );

  it("blocks exactly the pooled-gated roles, and nothing when the floor is met", () => {
    expect(anagraficaBlockedRoles(starved)).toEqual(["D", "C", "A"]);
    const covered = evaluateAnagraficaCoverage(rows([{ role: "D", withAge: 95, withoutAge: 5 }]));
    expect(covered.meetsFloor).toBe(true);
    expect(anagraficaBlockedRoles(covered)).toEqual([]);
  });

  it("throws for D, for C, for A, and for any set containing one of them", () => {
    for (const role of ["D", "C", "A"] as const) {
      expect(() => assertAnagraficaCoverage(starved, [role])).toThrow(
        /PHASE4_ANAGRAFICA_COVERAGE_BELOW_FLOOR/,
      );
    }
    // A mixed set is still refused: one governed role in scope is enough.
    expect(() => assertAnagraficaCoverage(starved, ["P", "D"])).toThrow(
      /PHASE4_ANAGRAFICA_COVERAGE_BELOW_FLOOR/,
    );
  });

  it("keeps the message form and the pooled denominator unchanged", () => {
    // Same numbers, same shape as the unscoped refusal — the scoping decides
    // WHETHER to throw, never WHAT the refusal says.
    expect(() => assertAnagraficaCoverage(starved, ["D"])).toThrow(/coverage=0\.0500 floor=0\.9/);
    expect(() => assertAnagraficaCoverage(starved, ["D"])).toThrow(
      /pooled_gated_rows=300 pooled_gated_with_age=15/,
    );
    expect(() => assertAnagraficaCoverage(starved)).toThrow(/coverage=0\.0500 floor=0\.9/);
  });

  it("does not hold role P hostage to a floor that does not govern it", () => {
    expect(() => assertAnagraficaCoverage(starved, ["P"])).not.toThrow();
    // Not even when the dataset is goalkeepers only, i.e. NO_ROWS on the
    // pooled side — the case a P-only invocation actually produces.
    const goalkeepersOnly = evaluateAnagraficaCoverage(
      rows([{ role: "P", withAge: 0, withoutAge: 30 }]),
    );
    expect(goalkeepersOnly.reasonCode).toBe("NO_ROWS");
    expect(goalkeepersOnly.meetsFloor).toBe(false);
    expect(() => assertAnagraficaCoverage(goalkeepersOnly, ["P"])).not.toThrow();
  });

  it("defaults to every role, so an unscoped caller keeps the behaviour it had", () => {
    expect(() => assertAnagraficaCoverage(starved, PHASE4_ROLES)).toThrow(
      /PHASE4_ANAGRAFICA_COVERAGE_BELOW_FLOOR/,
    );
    expect(() => assertAnagraficaCoverage(starved)).toThrow(/PHASE4_ANAGRAFICA_COVERAGE_BELOW_FLOOR/);
    // An empty scope gates nothing, and therefore refuses nothing.
    expect(() => assertAnagraficaCoverage(starved, [])).not.toThrow();
  });
});

describe("the goalkeeper ladder runs on rows with no anagrafica at all", () => {
  // Real pipeline, not a hand-built report: panel -> feature rows -> folds ->
  // ladder, with `buildFeatureRows` called WITHOUT an anagrafica so every
  // `ageAtSeasonStart` is NaN. This is the claim the role-scoped guard rests
  // on — if the ladder ever started consuming the anagrafica, this test fails
  // and the scoping must be revisited before the guard is.
  const seasons = ["2019_20", "2020_21", "2021_22", "2022_23", "2023_24", "2024_25"];
  const featureRows = buildFeatureRows(buildPlayerSeasonPanel(buildGoalkeeperCohortSeasons(seasons, 60)));

  it("has genuinely zero anagrafica coverage on those rows", () => {
    const report = evaluateAnagraficaCoverage(featureRows);
    expect(featureRows.length).toBeGreaterThan(0);
    expect(report.withAge).toBe(0);
    expect(report.meetsFloor).toBe(false);
    expect(featureRows.every((row) => !Number.isFinite(row.features[ANAGRAFICA_FEATURE]))).toBe(true);
  });

  it("still selects a ladder family and produces role-P support", () => {
    const report = evaluateAnagraficaCoverage(featureRows);
    // The guard, asked about P only, lets this run start.
    expect(() => assertAnagraficaCoverage(report, ["P"])).not.toThrow();
    const folds = buildWalkForwardSplit(featureRows).folds;
    expect(folds.length).toBeGreaterThan(0);
    const evaluation = evaluateGoalkeeperLadder(folds, "fantamediaNext");
    expect(evaluation.selectedFamily).not.toBeNull();
    expect(evaluation.reasonCode).toBe("LADDER_FAMILY_ELIGIBLE");
    expect(evaluation.families.some((entry) => entry.roleEligible)).toBe(true);
  });
});

describe("formatAnagraficaCoverage", () => {
  it("emits aggregate counts only — no player key, name or identifier", () => {
    const lines = formatAnagraficaCoverage(
      evaluateAnagraficaCoverage(rows([{ role: "D", withAge: 3, withoutAge: 1 }])),
    );
    expect(lines.join("\n")).not.toMatch(/synthetic|D-\d/);
    expect(lines.some((line) => line.includes("anagrafica_role=D"))).toBe(true);
  });
});

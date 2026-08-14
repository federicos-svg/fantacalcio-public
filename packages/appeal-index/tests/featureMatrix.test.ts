import { describe, it, expect } from "vitest";
import { fitStandardizer, toVector } from "../src/featureMatrix.js";
import { FEATURE_NAMES, type FeatureRow } from "../src/types.js";

function featureRow(overrides: Partial<Record<(typeof FEATURE_NAMES)[number], number>> = {}): FeatureRow {
  const base = Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])) as Record<(typeof FEATURE_NAMES)[number], number>;
  return {
    playerKey: "id:1",
    name: "Synthetic Player",
    role: "C",
    featureSeason: "2020_21",
    targetSeason: "2021_22",
    features: { ...base, ...overrides },
    targets: { fantamediaNext: 6, presenzeNext: 20 },
    sourceSeasons: ["2020_21"],
  };
}

describe("toVector", () => {
  it("orders values per FEATURE_NAMES", () => {
    const row = featureRow({ fantamediaLag1: 7, nSeasonsObserved: 3 });
    const v = toVector(row.features);
    expect(v[FEATURE_NAMES.indexOf("fantamediaLag1")]).toBe(7);
    expect(v[FEATURE_NAMES.indexOf("nSeasonsObserved")]).toBe(3);
  });
});

describe("fitStandardizer", () => {
  it("z-scores a column with nonzero variance", () => {
    const rows = [
      featureRow({ fantamediaLag1: 5 }),
      featureRow({ fantamediaLag1: 6 }),
      featureRow({ fantamediaLag1: 7 }),
    ];
    const s = fitStandardizer(rows);
    const idx = FEATURE_NAMES.indexOf("fantamediaLag1");
    const transformed = s.transform(toVector(rows[1]!.features));
    expect(transformed[idx]).toBeCloseTo(0); // the mean maps to 0
  });

  it("maps a zero-variance column to 0 instead of dividing by ~0", () => {
    const rows = [featureRow({ roleC: 1 }), featureRow({ roleC: 1 })];
    const s = fitStandardizer(rows);
    const idx = FEATURE_NAMES.indexOf("roleC");
    expect(s.transform(toVector(rows[0]!.features))[idx]).toBe(0);
  });

  it("fits ONLY on the rows given — a caller must never pass test rows in", () => {
    const trainRows = [featureRow({ fantamediaLag1: 5 }), featureRow({ fantamediaLag1: 6 })];
    const s1 = fitStandardizer(trainRows);
    const withExtraTestRow = [...trainRows, featureRow({ fantamediaLag1: 1000 })];
    const s2 = fitStandardizer(trainRows); // still only trainRows
    expect(s1.means).toEqual(s2.means);
    expect(withExtraTestRow.length).toBe(3); // sanity: the extra row exists but was never fit on
  });

  it("throws on empty input", () => {
    expect(() => fitStandardizer([])).toThrow();
  });
});

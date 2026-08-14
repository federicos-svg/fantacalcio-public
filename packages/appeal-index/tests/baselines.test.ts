import { describe, it, expect } from "vitest";
import {
  naiveLastBaseline,
  rollingMean3Baseline,
  roleMeanBaseline,
  shrinkageBaselineTrainer,
  SHRINKAGE_BASELINE_TRAINERS,
  BASELINE_TRAINERS,
} from "../src/baselines.js";
import { PHASE4_CONFIG } from "../src/phase4Protocol.js";
import { FEATURE_NAMES, type FeatureRow, type Role } from "../src/types.js";

let nextTestPlayerId = 0;

function featureRow(role: Role, overrides: Partial<Record<(typeof FEATURE_NAMES)[number], number>>, targetFantamedia: number): FeatureRow {
  const base = Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])) as Record<(typeof FEATURE_NAMES)[number], number>;
  const roleFlags = { roleP: 0, roleD: 0, roleC: 0, roleA: 0, [`role${role}`]: 1 };
  return {
    playerKey: `id:${nextTestPlayerId++}`,
    name: "Synthetic Player",
    role,
    featureSeason: "2020_21",
    targetSeason: "2021_22",
    features: { ...base, ...roleFlags, ...overrides },
    targets: { fantamediaNext: targetFantamedia, presenzeNext: 20 },
    sourceSeasons: ["2020_21"],
  };
}

describe("naiveLastBaseline", () => {
  it("predicts the lag-1 feature value", () => {
    const predictor = naiveLastBaseline.fit([], "fantamediaNext");
    const row = featureRow("C", { fantamediaLag1: 6.4 }, 6.4);
    expect(predictor.predict(row.features)).toBe(6.4);
  });
});

describe("rollingMean3Baseline", () => {
  it("predicts the rolling-mean-3 feature value", () => {
    const predictor = rollingMean3Baseline.fit([], "presenzeNext");
    const row = featureRow("A", { presenzeRollingMean3: 18 }, 6);
    expect(predictor.predict(row.features)).toBe(18);
  });
});

describe("roleMeanBaseline", () => {
  it("predicts the train-set mean for the player's own role, ignoring player history", () => {
    const train = [
      featureRow("C", { fantamediaLag1: 999 }, 6),
      featureRow("C", { fantamediaLag1: 999 }, 8),
      featureRow("A", { fantamediaLag1: 999 }, 100),
    ];
    const predictor = roleMeanBaseline.fit(train, "fantamediaNext");
    const testRow = featureRow("C", { fantamediaLag1: 1 }, 0);
    expect(predictor.predict(testRow.features)).toBe(7); // mean(6, 8), never influenced by role A's 100
  });

  it("falls back to the overall mean for a role unseen in training", () => {
    const train = [featureRow("C", {}, 6), featureRow("C", {}, 8)];
    const predictor = roleMeanBaseline.fit(train, "fantamediaNext");
    const testRow = featureRow("P", {}, 0);
    expect(predictor.predict(testRow.features)).toBe(7);
  });

  it("throws when fit with no training rows", () => {
    expect(() => roleMeanBaseline.fit([], "fantamediaNext")).toThrow();
  });
});

describe("shrinkageBaselineTrainer", () => {
  it("leans toward the role prior for a rookie (nSeasonsObserved=1)", () => {
    const train = [featureRow("C", {}, 10), featureRow("C", {}, 10)]; // role mean = 10
    const predictor = shrinkageBaselineTrainer(2).fit(train, "fantamediaNext");
    const rookie = featureRow("C", { fantamediaRollingMean3: 0, nSeasonsObserved: 1 }, 0);
    const prediction = predictor.predict(rookie.features);
    // w = 1/(1+2) = 1/3 toward own (0), 2/3 toward role mean (10)
    expect(prediction).toBeCloseTo((1 / 3) * 0 + (2 / 3) * 10);
  });

  it("leans toward the player's own recent form for a long-tenured veteran", () => {
    const train = [featureRow("C", {}, 10), featureRow("C", {}, 10)];
    const predictor = shrinkageBaselineTrainer(2).fit(train, "fantamediaNext");
    const veteran = featureRow("C", { fantamediaRollingMean3: 5, nSeasonsObserved: 10 }, 0);
    const prediction = predictor.predict(veteran.features);
    expect(prediction).toBeLessThan(7); // much closer to 5 than to the role mean 10
  });

  it("a larger k shrinks the same player further toward the role prior", () => {
    const train = [featureRow("C", {}, 10), featureRow("C", {}, 10)];
    const player = featureRow("C", { fantamediaRollingMean3: 0, nSeasonsObserved: 3 }, 0);
    const weak = shrinkageBaselineTrainer(3).fit(train, "fantamediaNext").predict(player.features);
    const strong = shrinkageBaselineTrainer(15).fit(train, "fantamediaNext").predict(player.features);
    expect(strong).toBeGreaterThan(weak);
  });

  it("names each candidate by its own k, so the sweep is distinguishable downstream", () => {
    expect(shrinkageBaselineTrainer(8).name).toBe("baseline_shrinkage:k=8");
  });

  it("refuses a non-positive or non-finite k instead of silently degrading", () => {
    expect(() => shrinkageBaselineTrainer(0)).toThrow(/shrinkage k/);
    expect(() => shrinkageBaselineTrainer(-1)).toThrow(/shrinkage k/);
    expect(() => shrinkageBaselineTrainer(Number.NaN)).toThrow(/shrinkage k/);
  });

  it("throws when fit with no training rows", () => {
    expect(() => shrinkageBaselineTrainer(3).fit([], "fantamediaNext")).toThrow();
  });
});

describe("BASELINE_TRAINERS", () => {
  it("competes one shrinkage candidate per preregistered k, never a hardcoded one", () => {
    expect(SHRINKAGE_BASELINE_TRAINERS.map((t) => t.name)).toEqual(
      PHASE4_CONFIG.hyperparameters.shrinkageK.map((k) => `baseline_shrinkage:k=${k}`),
    );
    expect(BASELINE_TRAINERS.map((t) => t.name)).toEqual([
      "baseline_naive_last",
      "baseline_rolling_mean_3",
      "baseline_role_mean",
      ...PHASE4_CONFIG.hyperparameters.shrinkageK.map((k) => `baseline_shrinkage:k=${k}`),
    ]);
  });
});

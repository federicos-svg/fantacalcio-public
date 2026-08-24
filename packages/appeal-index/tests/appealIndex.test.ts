import { describe, it, expect } from "vitest";
import { composeAppealIndexComponents } from "../src/appealIndex.js";
import { FEATURE_NAMES, type FeatureRow } from "../src/types.js";

function featureRow(overrides: Partial<Record<(typeof FEATURE_NAMES)[number], number>>): FeatureRow {
  const base = Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])) as Record<(typeof FEATURE_NAMES)[number], number>;
  return {
    playerKey: "id:1",
    name: "Synthetic Player",
    role: "D",
    featureSeason: "2020_21",
    targetSeason: "2021_22",
    features: { ...base, roleD: 1, ...overrides },
    targets: { fantamediaNext: 6, presenzeNext: 20 },
    sourceSeasons: ["2020_21"],
  };
}

describe("composeAppealIndexComponents", () => {
  it("never marks passive fixture components as validated", () => {
    const c = composeAppealIndexComponents({
      features: featureRow({}).features,
      predictedFantamediaNext: 6.5,
      predictedPresenzeNext: 30,
      roleCohortFantamediaNext: [5, 6, 7],
    });
    expect(c.appetibilitaBase.validated).toBe(false);
    expect(c.affidabilita.validated).toBe(false);
    expect(c.rischio.validated).toBe(false);
    expect(c.upside.validated).toBe(false);
    expect(c.continuitaVoto.validated).toBe(false);
    expect(c.bonusPotential.validated).toBe(false);
    expect(c.modificatoreRelevance.validated).toBe(false);
    expect(c.ruoloRarita.validated).toBe(false);
  });

  it("appetibilitaBase/affidabilita echo the given predictions", () => {
    const c = composeAppealIndexComponents({
      features: featureRow({}).features,
      predictedFantamediaNext: 7.1,
      predictedPresenzeNext: 19,
      roleCohortFantamediaNext: [5, 6, 7],
    });
    expect(c.appetibilitaBase.value).toBe(7.1);
    expect(c.affidabilita.value).toBeCloseTo(19 / 38);
  });

  it("affidabilita is clamped to [0,1] even for out-of-range predictions", () => {
    const c = composeAppealIndexComponents({
      features: featureRow({}).features,
      predictedFantamediaNext: 6,
      predictedPresenzeNext: 100, // more than a season's matchdays
      roleCohortFantamediaNext: [6],
    });
    expect(c.affidabilita.value).toBe(1);
  });

  it("modificatoreRelevance flags P/D roles, not C/A", () => {
    const defender = composeAppealIndexComponents({
      features: featureRow({ roleD: 1 }).features,
      predictedFantamediaNext: 6,
      predictedPresenzeNext: 20,
      roleCohortFantamediaNext: [6],
    });
    const forward = composeAppealIndexComponents({
      features: { ...featureRow({}).features, roleD: 0, roleA: 1 },
      predictedFantamediaNext: 6,
      predictedPresenzeNext: 20,
      roleCohortFantamediaNext: [6],
    });
    expect(defender.modificatoreRelevance.value).toBe(1);
    expect(forward.modificatoreRelevance.value).toBe(0);
  });

  it("upside is never negative even when recent form is below the historical rolling mean", () => {
    const c = composeAppealIndexComponents({
      features: featureRow({ fantamediaLag1: 4, fantamediaRollingMean3: 7 }).features,
      predictedFantamediaNext: 5,
      predictedPresenzeNext: 20,
      roleCohortFantamediaNext: [6],
    });
    expect(c.upside.value).toBe(0);
  });

  it("rischio stays within [0,1]", () => {
    const c = composeAppealIndexComponents({
      features: featureRow({ presenzeRollingMean3: 0, volatilitaVotoLastObserved: 10, nSeasonsObserved: 1 }).features,
      predictedFantamediaNext: 5,
      predictedPresenzeNext: 0,
      roleCohortFantamediaNext: [6],
    });
    expect(c.rischio.value).toBeGreaterThanOrEqual(0);
    expect(c.rischio.value).toBeLessThanOrEqual(1);
  });

  it("ruoloRarita falls back to 0.5 for an empty cohort", () => {
    const c = composeAppealIndexComponents({
      features: featureRow({}).features,
      predictedFantamediaNext: 6,
      predictedPresenzeNext: 20,
      roleCohortFantamediaNext: [],
    });
    expect(c.ruoloRarita.value).toBe(0.5);
  });
});

import { describe, expect, it } from "vitest";
import {
  APPEAL_INDEX_COMPONENT_NAMES,
  APPEAL_INDEX_QUALITY_LABELS,
  APPEAL_INDEX_RECIPE,
  APPEAL_INDEX_SCORE_COMPONENT,
  appealIndexRecipeHash,
  buildServedAppealIndex,
  withheldAppealIndex,
  type AppealIndexServingPlayer,
} from "../src/appealIndexServing.js";
import { assertPhase5OutputShape } from "../src/phase5Protocol.js";
import { FEATURE_NAMES, type FeatureVector, type Role } from "../src/types.js";

function features(overrides: Partial<Record<(typeof FEATURE_NAMES)[number], number>> = {}): FeatureVector {
  const base = Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0])) as Record<
    (typeof FEATURE_NAMES)[number],
    number
  >;
  return { ...base, presenzeRollingMean3: 20, volatilitaVotoLag1: 1, nSeasonsObserved: 3, ...overrides };
}

function player(
  key: string,
  role: Role,
  predictedFantamediaNext: number,
  overrides: Partial<AppealIndexServingPlayer> = {},
): AppealIndexServingPlayer {
  return {
    key,
    role,
    features: features(),
    predictedFantamediaNext,
    predictedPresenzeNext: 20,
    modelDisposition: "SCOUTING_MODEL_SELECTED",
    ...overrides,
  };
}

describe("APPEAL_INDEX_RECIPE", () => {
  it("is frozen: any formula change has to bump the version deliberately", () => {
    // Pinned on purpose. A silent edit to the recipe (or to what it points at)
    // fails here instead of quietly changing what the site shows.
    expect(APPEAL_INDEX_RECIPE.recipeVersion).toBe("APPEAL-INDEX-RECIPE@1.2.0");
    expect(APPEAL_INDEX_RECIPE.formulaFreezeDate).toBe("2026-08-30");
    expect(appealIndexRecipeHash()).toBe(
      "sha256:5d72503e088bf502214f8c21c8108ae62c9bb199ebb79a818a4dd72b8ad3919a",
    );
  });

  it("never declares itself validated or composite", () => {
    expect(APPEAL_INDEX_RECIPE.validated).toBe(false);
    expect(APPEAL_INDEX_RECIPE.compositeScore).toBe(false);
    expect(APPEAL_INDEX_RECIPE.evidenceCap).toBe("scouting");
  });
});

describe("buildServedAppealIndex", () => {
  it("normalizes the score component within the role cohort, from best to worst", () => {
    const served = buildServedAppealIndex([
      player("low", "D", 4),
      player("mid", "D", 6),
      player("high", "D", 8),
    ]);
    const byKey = new Map(served.map((item) => [item.key, item]));
    expect(byKey.get("low")!.score0to100).toBeCloseTo(100 / 3);
    expect(byKey.get("mid")!.score0to100).toBeCloseTo(200 / 3);
    expect(byKey.get("high")!.score0to100).toBe(100);
  });

  it("ranks each role against its own cohort only", () => {
    const served = buildServedAppealIndex([
      player("best-defender", "D", 5),
      player("worst-forward", "A", 5),
      player("best-forward", "A", 9),
    ]);
    const byKey = new Map(served.map((item) => [item.key, item]));
    expect(byKey.get("best-defender")!.score0to100).toBe(100);
    expect(byKey.get("worst-forward")!.score0to100).toBeCloseTo(50);
  });

  it("is the normalized score component itself, never a blend of the eight", () => {
    // This player is last on every heuristic component and first on the score
    // component. A composite would drag the index down; the protocol forbids
    // composing at all, so the index has to be 100.
    const served = buildServedAppealIndex([
      player("weak-heuristics", "C", 9, {
        features: features({ volatilitaVotoLag1: 8, presenzeRollingMean3: 1, nSeasonsObserved: 1 }),
      }),
      player("other", "C", 4),
    ]);
    const target = served.find((item) => item.key === "weak-heuristics")!;
    expect(target.score0to100).toBe(100);
    expect(target.components[APPEAL_INDEX_SCORE_COMPONENT].scale0to100).toBe(target.score0to100);
  });

  it("carries every component, each with its own preregistered disposition", () => {
    const [served] = buildServedAppealIndex([player("solo", "C", 6)]);
    expect(Object.keys(served!.components).sort()).toEqual([...APPEAL_INDEX_COMPONENT_NAMES].sort());
    expect(served!.components.appetibilitaBase.disposition).toBe("SCOUTING_MODEL_SELECTED");
    expect(served!.components.affidabilita.disposition).toBe("SCOUTING_MODEL_SELECTED");
    expect(served!.components.rischio.disposition).toBe("HEURISTIC_ONLY");
    expect(served!.components.rischio.evidenceTier).toBe("heuristic_only");
    expect(
      Object.values(served!.components).every((component) => component.validated === false),
    ).toBe(true);
  });

  it("withholds the number when the role carries no model verdict", () => {
    const served = buildServedAppealIndex([
      player("no-verdict", "P", 6, { modelDisposition: "NO_VERDICT" }),
      player("other-keeper", "P", 4, { modelDisposition: "NO_VERDICT" }),
    ]);
    expect(served.every((item) => item.score0to100 === null)).toBe(true);
    expect(served[0]!.quality).toBe(APPEAL_INDEX_QUALITY_LABELS.not_available);
    // The heuristics keep their own honest values — only the model-backed
    // score is withheld.
    expect(served[0]!.components.bonusPotential.scale0to100).not.toBeNull();
  });

  it("withholds the number when the prediction itself is not finite", () => {
    const [served] = buildServedAppealIndex([player("broken", "A", Number.NaN)]);
    expect(served!.score0to100).toBeNull();
    expect(served!.components.appetibilitaBase.availability).toBe("missing_input");
  });

  it("labels a scouting-backed score as experimental and never as validated", () => {
    const [served] = buildServedAppealIndex([player("solo", "A", 7)]);
    expect(served!.evidenceTier).toBe("scouting_backed");
    expect(served!.quality).toBe(APPEAL_INDEX_QUALITY_LABELS.scouting_backed);
    expect(served!.quality).toContain("non validato");
    expect(served!.recipeVersion).toBe(APPEAL_INDEX_RECIPE.recipeVersion);
  });

  it("keeps full precision — rounding belongs to the render boundary", () => {
    const served = buildServedAppealIndex([
      player("a", "C", 1),
      player("b", "C", 2),
      player("c", "C", 3),
    ]);
    expect(served.find((item) => item.key === "a")!.score0to100).not.toBe(
      Math.round(served.find((item) => item.key === "a")!.score0to100!),
    );
  });

  it("emits nothing the Phase 5 output guard forbids", () => {
    const served = buildServedAppealIndex([player("a", "C", 5), player("b", "D", 6)]);
    expect(() => assertPhase5OutputShape(served)).not.toThrow();
  });
});

describe("withheldAppealIndex", () => {
  it("is an honest absence: no number, no midpoint, same recipe version", () => {
    const served = withheldAppealIndex("unmatched", "P");
    expect(served.score0to100).toBeNull();
    expect(served.disposition).toBe("NO_VERDICT");
    expect(served.quality).toBe(APPEAL_INDEX_QUALITY_LABELS.not_available);
    expect(served.recipeVersion).toBe(APPEAL_INDEX_RECIPE.recipeVersion);
    expect(
      Object.values(served.components).every((component) => component.scale0to100 === null),
    ).toBe(true);
    expect(() => assertPhase5OutputShape(served)).not.toThrow();
  });
});

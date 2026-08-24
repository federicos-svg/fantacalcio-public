import { describe, expect, it } from "vitest";
import {
  COMPONENT_DISPOSITIONS, FORBIDDEN_SEASON, MODELABLE_SEASONS, PHASE4_ARTIFACT_NAMES,
  PHASE4_CONFIG, PHASE4_PROTOCOL, assertModelableSeason, assertPhase4OutputShape,
  SEASON_REFERENCE_DATE_CONVENTION, familyParameterCount, phase4ConfigHash, sampleEligibility,
  seasonStartReferenceDate, stableJson,
} from "../src/phase4Protocol.js";
import { goalkeeperFamilyParameterCount } from "../src/goalkeeperFeatures.js";
import { FEATURE_NAMES } from "../src/types.js";

describe("Fase 4 preregistered executable contract", () => {
  it("pins the exact modelable seasons and explicitly refuses 2025_26", () => {
    expect(MODELABLE_SEASONS).toHaveLength(10);
    expect(MODELABLE_SEASONS[0]).toBe("2015_16");
    expect(MODELABLE_SEASONS.at(-1)).toBe("2024_25");
    expect(() => assertModelableSeason(FORBIDDEN_SEASON)).toThrow("FORBIDDEN_SEASON_2025_26");
  });

  it("keeps the forbidden season outside the exact input bridge set", () => {
    expect(MODELABLE_SEASONS).not.toContain(FORBIDDEN_SEASON as never);
    expect(new Set(MODELABLE_SEASONS).size).toBe(10);
  });

  it("freezes targets, three missingness pipelines, baselines and finite grids", () => {
    expect(PHASE4_CONFIG.targets).toContain("season_total_direct");
    expect(PHASE4_CONFIG.targets).toContain("season_total_two_part");
    expect(PHASE4_CONFIG.pipelines).toHaveLength(3);
    expect(PHASE4_CONFIG.baselines).toEqual([
      "naive_last", "rolling_mean_3", "train_role_mean", "role_shrinkage",
    ]);
    expect(PHASE4_CONFIG.hyperparameters.ridgeLambda).toEqual([0.1, 1, 10, 100]);
  });

  it("counts estimated degrees of freedom, not hyperparameters", () => {
    expect(familyParameterCount("pooled_regularized_role", "D")).toBe(15);
    expect(familyParameterCount("pooled_role_feature_interactions", "A")).toBe(24);
    expect(familyParameterCount("two_part_hurdle", "P")).toBe(26);
  });

  it("derives every pooled parameter count from FEATURE_NAMES, so the two can never drift apart", () => {
    // @2.2.0 added `ageAtSeasonStart`. If a future feature lands in the vector
    // without the families being updated, the `n_train >= 10 * p_family` guard
    // would silently under-count the model's degrees of freedom — this is the
    // assertion that stops that, the same way GOALKEEPER_FAMILY_FEATURES is
    // asserted against the goalkeeper pBase values.
    const pooled = FEATURE_NAMES.length + 1;
    const roleOneHots = 4;
    expect(PHASE4_CONFIG.families.pooled_regularized_role.pBase).toBe(pooled);
    expect(PHASE4_CONFIG.families.pooled_role_feature_interactions.pBase).toBe(pooled);
    expect(PHASE4_CONFIG.families.direct_season_total.pBase).toBe(pooled);
    expect(PHASE4_CONFIG.families.role_specific_regularized.pBase).toBe(pooled - roleOneHots);
    expect(PHASE4_CONFIG.families.two_part_hurdle.pBase).toBe(
      PHASE4_CONFIG.families.pooled_regularized_role.pBase +
        PHASE4_CONFIG.families.role_specific_regularized.pBase,
    );
  });

  it("enforces n_train >= 10*p by role-fold and >1/3 failures => NO_VERDICT", () => {
    const pass = sampleEligibility("pooled_regularized_role", "D", [
      { foldId: "f1", nTrain: 150 }, { foldId: "f2", nTrain: 149 },
      { foldId: "f3", nTrain: 200 },
    ]);
    expect(pass.roleEligible).toBe(true);
    expect(pass.folds[1]?.reasonCode).toBe("SAMPLE_GUARD_FAILED");
    const fail = sampleEligibility("pooled_regularized_role", "D", [
      { foldId: "f1", nTrain: 149 }, { foldId: "f2", nTrain: 149 },
      { foldId: "f3", nTrain: 200 },
    ]);
    expect(fail).toMatchObject({ roleEligible: false, verdict: "NO_VERDICT" });
  });

  it("does not permit aggregate selection to override role eligibility", () => {
    const result = sampleEligibility("pooled_regularized_role", "P", [
      { foldId: "f1", nTrain: 50 }, { foldId: "f2", nTrain: 80 },
      { foldId: "f3", nTrain: 200 },
    ]);
    expect(result.roleEligible).toBe(false);
    expect(result.verdict).toBe("NO_VERDICT");
  });

  it("has deterministic config hash and all eight explicit dispositions", () => {
    expect(phase4ConfigHash()).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(phase4ConfigHash()).toBe(phase4ConfigHash());
    expect(Object.keys(COMPONENT_DISPOSITIONS)).toHaveLength(8);
    expect(COMPONENT_DISPOSITIONS.modificatoreRelevance.defaultVerdict).toBe("HEURISTIC_ONLY");
  });

  it("preregisters the goalkeeper ladder before any metric, richest family first", () => {
    expect(PHASE4_PROTOCOL).toBe("VAL-PROTOCOL-A-PHASE4@2.3.0");
    expect(PHASE4_CONFIG.goalkeeperLadder).toEqual([
      "goalkeeper_specific_full", "goalkeeper_specific_core", "goalkeeper_specific_minimal",
    ]);
    expect(PHASE4_CONFIG.goalkeeperSelectionRule).toBe("richest_ladder_family_passing_its_own_sample_guard");
    expect(PHASE4_CONFIG.gatingFamilyByRole).toEqual({
      P: "goalkeeper_ladder",
      D: "pooled_regularized_role",
      C: "pooled_regularized_role",
      A: "pooled_regularized_role",
    });
    for (const family of PHASE4_CONFIG.goalkeeperLadder) {
      expect(PHASE4_CONFIG.families[family]).toBeDefined();
    }
  });

  it("registers the anagrafica feature in the pooled vector and leaves the goalkeeper one alone", () => {
    expect(PHASE4_CONFIG.features).toEqual([
      "fantamedia_lag1", "fantamedia_mean3", "presenze_lag1", "presenze_mean3",
      "volatility_last_observed", "seasons_observed", "goals_mean3", "assists_mean3",
      "team_changed", "role", "age_at_season_start",
    ]);
    expect(PHASE4_CONFIG.goalkeeperFeatures).toContain("clean_sheet_rate_mean3");
    expect(PHASE4_CONFIG.goalkeeperFeatures).not.toContain("role");
    // Role P is gated by the ladder, so leaving its vector alone is what keeps
    // the goalkeeper verdict independent of anagrafica coverage.
    expect(PHASE4_CONFIG.goalkeeperFeatures).not.toContain("age_at_season_start");
    for (const family of PHASE4_CONFIG.goalkeeperLadder) {
      expect(PHASE4_CONFIG.families[family].pBase).toBe(goalkeeperFamilyParameterCount(family));
    }
  });

  it("preregisters the anagrafica join policy and its coverage floor before any metric", () => {
    expect(PHASE4_CONFIG.anagrafica).toEqual({
      featureName: "age_at_season_start",
      source: "wikidata",
      sourceRegistration: "docs/DECISIONS.md#active--wikidata-2026-08-12",
      referenceDateContext: "PLAYER_SEASON",
      referenceDateType: "SEASON_START_DATE",
      referenceDateConvention: "season_start_year-08-31",
      joinPolicy: "exact_match_only_ambiguous_to_manual_review",
      missingPolicy: "complete_case_drop_never_imputed",
      minimumResolvedCoverage: 0.9,
    });
    // The feature name is declared in exactly one place per layer, and the two
    // layers must agree: protocol registry vs the actual vector entry.
    expect(FEATURE_NAMES).toContain("ageAtSeasonStart");
    expect(PHASE4_CONFIG.anagrafica.featureName).toBe(PHASE4_CONFIG.features.at(-1));
  });

  it("derives the season reference date from a declared convention, never from a fixture calendar", () => {
    // A uniform rule, so a player's age advances by exactly one per season and
    // the feature carries aging and nothing else. It lives inside PHASE4_CONFIG,
    // so replacing it with real opening dates would move the config hash.
    expect(seasonStartReferenceDate("2019_20")).toBe("2019-08-31");
    expect(seasonStartReferenceDate("2024_25")).toBe("2024-08-31");
    expect(() => seasonStartReferenceDate("2019")).toThrow("INVALID_SEASON_LABEL:2019");
    expect(() => seasonStartReferenceDate("")).toThrow(/INVALID_SEASON_LABEL/);
    expect(PHASE4_CONFIG.anagrafica.referenceDateConvention).toBe(SEASON_REFERENCE_DATE_CONVENTION);
  });

  it("adds the goalkeeper and anagrafica analyses to the mandatory artifact set", () => {
    expect(PHASE4_ARTIFACT_NAMES).toContain("goalkeeper_family_report.json");
    expect(PHASE4_ARTIFACT_NAMES).toContain("anagrafica_coverage_report.json");
    expect(new Set(PHASE4_ARTIFACT_NAMES).size).toBe(PHASE4_ARTIFACT_NAMES.length);
  });

  it("changes the config hash, so no package scored under @2.1.0 can be reused as no_change", () => {
    // The (dataset, configHash) package identity introduced by T3 is what makes
    // a protocol bump safe: the hash covers PHASE4_CONFIG in full, and
    // protocolVersion, features, families and the anagrafica block all moved.
    const hash = phase4ConfigHash();
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(stableJson(PHASE4_CONFIG)).toContain("VAL-PROTOCOL-A-PHASE4@2.3.0");
    expect(stableJson(PHASE4_CONFIG)).toContain("age_at_season_start");
  });

  it("keeps evidence scouting, gates OFF and forbidden outputs absent", () => {
    expect(PHASE4_CONFIG.evidenceCap).toBe("scouting");
    expect(Object.values(PHASE4_CONFIG.gates).every((value) => !value)).toBe(true);
    expect(() => assertPhase4OutputShape(PHASE4_CONFIG)).not.toThrow();
    expect(() => assertPhase4OutputShape({ receipt: {}, validated: true })).toThrow();
  });
});

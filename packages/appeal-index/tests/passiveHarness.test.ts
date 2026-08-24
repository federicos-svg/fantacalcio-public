import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { composeAppealIndexComponents } from "../src/appealIndex.js";
import {
  BURNED_HOLDOUT_SEASON,
  deterministicConfigHash,
  preparePassiveFold,
  runPassiveHarness,
  type PassiveHarnessConfig,
  type PassiveHarnessResult,
  type PassiveRow,
} from "../src/passiveHarness.js";
import {
  appendRegistryEntry,
  assertOutputOutsideRepository,
  sha256,
  writeOofOnce,
  type PassiveRegistryEntry,
} from "../src/passiveRegistry.js";
import { FEATURE_NAMES, type FeatureRow } from "../src/types.js";

const config: PassiveHarnessConfig = {
  protocolVersion: "VAL-PROTOCOL-A@1.0.0",
  targets: ["fantamediaNext", "presenzeNext"],
  pipelines: [
    { id: "missing_indicator_train_median", featureNames: ["form", "volatility"] },
    { id: "complete_case", featureNames: ["form", "volatility"] },
    {
      id: "cold_start_role_fallback",
      featureNames: ["form", "volatility"],
      fallback: "train_role_mean",
    },
  ],
  candidates: [{ id: "train_mean" }, { id: "train_role_mean" }],
  minTrainSeasons: 2,
  seed: 17,
  burnedHoldoutPolicy: {
    season: BURNED_HOLDOUT_SEASON,
    allowDescriptiveAccess: false,
  },
};

function row(
  rowId: string,
  targetSeason: string,
  role: PassiveRow["role"],
  overrides: Partial<PassiveRow> = {},
): PassiveRow {
  const start = Number(targetSeason.slice(0, 4));
  const sourceSeason = `${start - 1}_${String(start).slice(-2)}`;
  return {
    rowId,
    cohortId: `cohort:${targetSeason}`,
    targetSeason,
    role,
    populationStatus: "observed",
    sourceSeasons: [sourceSeason],
    features: { form: 6, volatility: 0.5 },
    targets: { fantamediaNext: 6, presenzeNext: 20 },
    ...overrides,
  };
}

function fixtureRows(): PassiveRow[] {
  const seasons = ["2021_22", "2022_23", "2023_24", "2024_25"];
  const rows = seasons.flatMap((season, index) => [
    row(`r${index}-d`, season, "D", {
      features: { form: 5 + index, volatility: index === 2 ? null : 0.4 },
      targets: { fantamediaNext: 5.5 + index, presenzeNext: 18 + index },
    }),
    row(`r${index}-a`, season, "A", {
      features: { form: 6 + index, volatility: 0.7 },
      targets: { fantamediaNext: 6.2 + index, presenzeNext: 22 + index },
    }),
  ]);
  rows.push(
    row("cold-start", "2024_25", "P", {
      populationStatus: "cold_start",
      sourceSeasons: [],
      features: { form: null, volatility: null },
      targets: { fantamediaNext: null, presenzeNext: 0 },
    }),
    row("burned", BURNED_HOLDOUT_SEASON, "C"),
  );
  return rows;
}

function componentRow(volatility: number): FeatureRow {
  const features = Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0])) as Record<
    (typeof FEATURE_NAMES)[number],
    number
  >;
  features.volatilitaVotoLastObserved = volatility;
  features.roleD = 1;
  return {
    playerKey: "redacted:1",
    name: "SYNTHETIC",
    role: "D",
    featureSeason: "2023_24",
    targetSeason: "2024_25",
    features,
    targets: { fantamediaNext: 0, presenzeNext: 0 },
    sourceSeasons: ["2023_24"],
  };
}

describe("Fase 2 missing-data hardening", () => {
  it("does not turn missing volatility into maximum continuity or favorable risk", () => {
    const components = composeAppealIndexComponents({
      features: componentRow(Number.NaN).features,
      predictedFantamediaNext: 6,
      predictedPresenzeNext: 20,
      roleCohortFantamediaNext: [6],
    });
    expect(components.continuitaVoto.value).toBeNull();
    expect(components.rischio.value).toBeNull();
    expect(components.continuitaVoto.availability).toBe("missing_input");
  });

  it("keeps a real zero distinct from missing", () => {
    const zero = composeAppealIndexComponents({
      features: componentRow(0).features,
      predictedFantamediaNext: 0,
      predictedPresenzeNext: 0,
      roleCohortFantamediaNext: [0],
    });
    const missing = composeAppealIndexComponents({
      features: componentRow(Number.NaN).features,
      predictedFantamediaNext: Number.NaN,
      predictedPresenzeNext: Number.NaN,
      roleCohortFantamediaNext: [],
    });
    expect(zero.continuitaVoto.value).toBe(1);
    expect(zero.appetibilitaBase.value).toBe(0);
    expect(missing.continuitaVoto.value).toBeNull();
    expect(missing.appetibilitaBase.value).toBeNull();
  });

  it("never emits validated true for passive predictions", () => {
    const components = composeAppealIndexComponents({
      features: componentRow(0.5).features,
      predictedFantamediaNext: 6,
      predictedPresenzeNext: 20,
      roleCohortFantamediaNext: [6],
    });
    expect(Object.values(components).every((component) => component.validated === false)).toBe(true);
  });
});

describe("Fase 2 passive harness", () => {
  it("retains zero appearances and cold start in denominator without fabricating fantamedia", () => {
    const result = runPassiveHarness(fixtureRows(), config);
    const presenze = result.coverage.find(
      (entry) =>
        entry.pipelineId === "cold_start_role_fallback" && entry.target === "presenzeNext",
    )!;
    const fantamedia = result.oof.filter((item) => item.rowId === "cold-start");
    const presenzeOof = result.oof.filter(
      (item) => item.rowId === "cold-start" && item.target === "presenzeNext",
    );
    expect(presenze.value.cohortDenominator).toBeGreaterThan(0);
    expect(presenze.value.byRole.P.cohortDenominator).toBe(1);
    expect(presenzeOof.every((item) => item.actual === 0)).toBe(true);
    expect(fantamedia.some((item) => item.target === "fantamediaNext")).toBe(false);
  });

  it("counts an unobservable cold-start target in the explicit cohort denominator", () => {
    const result = runPassiveHarness(fixtureRows(), config);
    const coverage = result.coverage.find(
      (entry) =>
        entry.pipelineId === "cold_start_role_fallback" &&
        entry.target === "fantamediaNext",
    )!.value;
    expect(coverage.byRole.P.cohortDenominator).toBe(1);
    expect(coverage.byRole.P.targetNotObservable).toBe(1);
    expect(coverage.byRole.P.evaluated).toBe(0);
    expect(coverage.byRole.P.excluded).toBe(0);
  });

  it("complete-case reports exclusions and lower coverage", () => {
    const result = runPassiveHarness(fixtureRows(), config);
    const complete = result.coverage.find(
      (entry) => entry.pipelineId === "complete_case" && entry.target === "presenzeNext",
    )!;
    const fallback = result.coverage.find(
      (entry) =>
        entry.pipelineId === "cold_start_role_fallback" && entry.target === "presenzeNext",
    )!;
    expect(complete.value.excluded).toBeGreaterThan(0);
    expect(complete.value.ratio).toBeLessThan(fallback.value.ratio);
  });

  it("fits imputation only on train even when validation is poisoned", () => {
    const train = [
      row("train-1", "2022_23", "D", { features: { form: 4, volatility: 1 } }),
      row("train-2", "2022_23", "A", { features: { form: 8, volatility: null } }),
    ];
    const normal = [row("test", "2023_24", "D", { features: { form: null, volatility: 2 } })];
    const poisoned = [
      row("test", "2023_24", "D", { features: { form: 999999, volatility: 999999 } }),
    ];
    const pipeline = config.pipelines[0]!;
    expect(preparePassiveFold(pipeline, train, normal).trainImputation).toEqual(
      preparePassiveFold(pipeline, train, poisoned).trainImputation,
    );
  });

  it("fails closed when a feature has no observed train value", () => {
    const pipeline = config.pipelines[0]!;
    const train = [
      row("missing-1", "2022_23", "D", { features: { form: 4, volatility: null } }),
      row("missing-2", "2023_24", "D", { features: { form: 5, volatility: null } }),
    ];
    const test = [
      row("missing-test", "2024_25", "D", {
        features: { form: 6, volatility: null },
      }),
    ];
    const prepared = preparePassiveFold(pipeline, train, test);
    expect(prepared.trainImputation.volatility).toBeNull();
    expect(prepared.test).toEqual([]);
    expect(prepared.excludedTest[0]?.reason).toBe("missing_feature_no_train_stat");

    const result = runPassiveHarness([...train, ...test], {
      ...config,
      targets: ["fantamediaNext"],
      pipelines: [pipeline],
    });
    expect(result.oof.some((prediction) => prediction.rowId === "missing-test")).toBe(false);
    expect(result.coverage[0]!.value.exclusionReasons.missing_feature_no_train_stat).toBe(1);
  });

  it("applies train-role fallback to cold starts and accounts for unavailable roles", () => {
    const rows = fixtureRows();
    rows.push(
      row("cold-d", "2024_25", "D", {
        populationStatus: "cold_start",
        sourceSeasons: [],
        features: { form: null, volatility: null },
        targets: { fantamediaNext: 9, presenzeNext: 12 },
      }),
      row("cold-c", "2024_25", "C", {
        populationStatus: "cold_start",
        sourceSeasons: [],
        features: { form: null, volatility: null },
        targets: { fantamediaNext: 7, presenzeNext: 10 },
      }),
    );
    const result = runPassiveHarness(rows, {
      ...config,
      targets: ["fantamediaNext"],
      pipelines: [config.pipelines[2]!],
    });
    const predictions = result.oof.filter((item) => item.rowId === "cold-d");
    const trainRoleValues = rows
      .filter(
        (item) =>
          item.role === "D" &&
          item.targetSeason < "2024_25" &&
          item.targets.fantamediaNext !== null,
      )
      .map((item) => item.targets.fantamediaNext!);
    const expected = trainRoleValues.reduce((sum, value) => sum + value, 0) / trainRoleValues.length;
    expect(predictions).toHaveLength(config.candidates.length);
    expect(predictions.every((item) => item.predicted === expected)).toBe(true);
    expect(
      predictions.every(
        (item) =>
          item.fallback.used &&
          item.fallback.method === "train_role_mean" &&
          item.fallback.validated === false,
      ),
    ).toBe(true);
    const coverage = result.coverage[0]!.value;
    expect(coverage.fallback.used).toBe(1);
    expect(coverage.fallback.unavailable).toBe(1);
    expect(
      result.oof.some((item) => item.rowId === "cold-c" && item.target === "fantamediaNext"),
    ).toBe(false);
  });

  it("rejects NaN and Infinity before serialization can coerce them to null", () => {
    expect(() =>
      runPassiveHarness(
        [row("nan", "2024_25", "D", { features: { form: Number.NaN, volatility: 1 } })],
        config,
      ),
    ).toThrow(/Non-finite value/);
    expect(() =>
      runPassiveHarness(
        [
          row("infinity", "2024_25", "D", {
            targets: { fantamediaNext: Number.POSITIVE_INFINITY, presenzeNext: 1 },
          }),
        ],
        config,
      ),
    ).toThrow(/Non-finite value/);
  });

  it("rejects future leakage and silent reuse of the burned holdout", () => {
    expect(() =>
      runPassiveHarness(
        [
          row("leak", "2024_25", "D", {
            sourceSeasons: ["2025_26"],
          }),
        ],
        config,
      ),
    ).toThrow(/Future season leaked/);
    const result = runPassiveHarness(fixtureRows(), config);
    expect(result.oof.some((item) => item.season === BURNED_HOLDOUT_SEASON)).toBe(false);
    expect(result.holdoutAccesses).toEqual([]);
  });

  it("logs every intentional descriptive access to 2025-26", () => {
    const result = runPassiveHarness(fixtureRows(), {
      ...config,
      burnedHoldoutPolicy: {
        season: BURNED_HOLDOUT_SEASON,
        allowDescriptiveAccess: true,
      },
    });
    expect(result.holdoutAccesses).toEqual([
      { season: BURNED_HOLDOUT_SEASON, purpose: "descriptive_advisory" },
    ]);
    expect(result.oof.some((item) => item.season === BURNED_HOLDOUT_SEASON)).toBe(false);
  });

  it("produces aligned OOF, role-season metrics and season-block uncertainty", () => {
    const result = runPassiveHarness(fixtureRows(), config);
    expect(result.oof.length).toBeGreaterThan(0);
    expect(result.paired.every((item) => item.alignedRows > 0)).toBe(true);
    expect(result.metrics.byRoleSeason.length).toBeGreaterThan(0);
    expect(result.metrics.foldDispersion.every((item) => item.seasonalMae.length > 0)).toBe(true);
    expect(result.status).toBe("no_verdict");
    expect("champion" in result).toBe(false);
  });

  it("is deterministic for config, output and seed", () => {
    const first = runPassiveHarness(fixtureRows(), config);
    const second = runPassiveHarness(fixtureRows(), config);
    expect(first).toEqual(second);
    expect(deterministicConfigHash(config)).toBe(first.configHash);
  });
});

describe("Fase 2 external append-only registry", () => {
  it("writes OOF once outside the repo and refuses duplicates/overwrite", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    const external = mkdtempSync(join(tmpdir(), "val-passive-"));
    const result = runPassiveHarness(fixtureRows(), config);
    const oof = writeOofOnce(repoRoot, join(external, "oof.json"), result.oof);
    expect(oof.hash).toBe(sha256(readFileSync(oof.path, "utf8")));
    expect(() => writeOofOnce(repoRoot, oof.path, result.oof)).toThrow();

    const entry: PassiveRegistryEntry = {
      runId: "synthetic-passive-run",
      protocolVersion: config.protocolVersion,
      inputManifestHash: sha256("synthetic-input"),
      commitSha: "0000000000000000000000000000000000000000",
      configHash: result.configHash,
      leagueRuleVersion: "synthetic-rule-v1",
      cohortType: "explicit_target_cohort",
      pipelineIds: config.pipelines.map((item) => item.id),
      candidateIds: config.candidates.map((item) => item.id),
      seed: config.seed,
      deterministic: true,
      metrics: result.metrics,
      coverage: result.coverage,
      oofRef: oof,
      artifactRefs: [],
      holdoutAccesses: result.holdoutAccesses,
      status: "no_verdict",
    };
    const registry = join(external, "registry.jsonl");
    appendRegistryEntry(repoRoot, registry, entry);
    expect(() => appendRegistryEntry(repoRoot, registry, entry)).toThrow(/duplicate\/overwrite/);
  });

  it("refuses output anywhere inside the repository", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    expect(() => assertOutputOutsideRepository(repoRoot, join(repoRoot, "oof.json"))).toThrow(
      /inside repository/,
    );
  });
});

describe("Fase 2 isolation invariants", () => {
  it("is not imported by the live UI or hard-safe src path", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    const liveRoot = join(repoRoot, "src");
    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) files.push(path);
      }
    };
    walk(liveRoot);
    const imports = files.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(imports).not.toContain("packages/appeal-index");
    expect(imports).not.toContain("@fantacalcio/appeal-index");
  });

  it("has no receipt, gate or authority fields in passive output", () => {
    const output = runPassiveHarness(fixtureRows(), config) as unknown as Record<string, unknown>;
    expect(output.status).toBe("no_verdict");
    expect(output).not.toHaveProperty("champion");
    expect(output).not.toHaveProperty("receipt");
    expect(output).not.toHaveProperty("gateStatus");
    expect(
      (output.oof as PassiveHarnessResult["oof"]).every(
        (prediction) => prediction.fallback.validated === false,
      ),
    ).toBe(true);
  });
});

#!/usr/bin/env -S tsx
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { SeasonRecords } from "../packages/appeal-index/src/dataset.js";
import { buildFeatureRows, buildPlayerSeasonPanel } from "../packages/appeal-index/src/dataset.js";
import {
  assertAnagraficaCoverage, evaluateAnagraficaCoverage, formatAnagraficaCoverage,
  isPooledGatedRole,
} from "../packages/appeal-index/src/anagraficaCoverage.js";
import { readAnagraficaFromDataset } from "../packages/appeal-index/src/anagraficaInput.js";
import { runAppealIndexPipeline } from "../packages/appeal-index/src/report.js";
import { buildWalkForwardSplit } from "../packages/appeal-index/src/validation.js";
import { BASELINE_TRAINERS } from "../packages/appeal-index/src/baselines.js";
import { ridgeRegressionTrainer } from "../packages/appeal-index/src/models/ridgeRegression.js";
import {
  fitGoalkeeperRidge, goalkeeperCandidateId, goalkeeperCompleteCaseRows,
} from "../packages/appeal-index/src/models/goalkeeperRidge.js";
import { isGoalkeeperFamily } from "../packages/appeal-index/src/goalkeeperFeatures.js";
import { evaluateGoalkeeperLadder } from "../packages/appeal-index/src/goalkeeperLadder.js";
import type { FeatureRow, TargetName, Trainer } from "../packages/appeal-index/src/types.js";
import {
  COMPONENT_DISPOSITIONS, MODELABLE_SEASONS, PHASE4_ARTIFACT_NAMES, PHASE4_CONFIG,
  PHASE4_ROLES, assertModelableSeason, assertPhase4OutputShape,
  familyParameterCount, phase4ConfigHash, sampleEligibility, stableJson,
} from "../packages/appeal-index/src/phase4Protocol.js";
import {
  seasonBlockInterval, selectPhase4RoleVerdicts,
} from "../packages/appeal-index/src/phase4Selection.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
// Single source of truth, shared with the private publication path so a
// produced package can be verified complete before it is persisted.
const ARTIFACT_NAMES = PHASE4_ARTIFACT_NAMES;

function sha(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function pretty(value: unknown): string {
  return `${JSON.stringify(JSON.parse(stableJson(value)), null, 2)}\n`;
}
function outside(label: string, path: string): string {
  const absolute = resolve(path);
  const rel = relative(ROOT, absolute);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error(`${label}_INSIDE_REPOSITORY`);
  }
  return absolute;
}
function argument(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) throw new Error(`MISSING_${name.toUpperCase()}`);
  return value;
}
function redactKey(value: string): string {
  return `row:${sha(value).slice(0, 20)}`;
}
const TARGETS = ["fantamediaNext", "presenzeNext"] as const;
const TARGET_LABELS = { fantamediaNext: "fantamedia_next", presenzeNext: "presenze_next" } as const;
const VERDICT_TARGETS = TARGETS.map((target) => TARGET_LABELS[target]);
function targetLabel(target: (typeof TARGETS)[number]): string {
  return TARGET_LABELS[target];
}
function finiteRows(rows: readonly FeatureRow[], target: TargetName): FeatureRow[] {
  return rows.filter((row) =>
    Number.isFinite(row.targets[target]) &&
    Object.values(row.features).every(Number.isFinite));
}
function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function main(): void {
  const inputPath = outside("INPUT", argument("input"));
  const output = outside("OUTPUT", argument("out"));
  if (existsSync(output)) throw new Error("OUTPUT_ALREADY_EXISTS");
  const inputBytes = readFileSync(inputPath);
  const parsed = JSON.parse(inputBytes.toString("utf8")) as {
    seasons: SeasonRecords[]; sourceWorkbooks?: unknown;
  };
  if (!Array.isArray(parsed.seasons)) throw new Error("INVALID_INPUT");
  // How many source workbooks the input was actually built from, recorded by
  // the input builder that read them. Required, never assumed: the manifest
  // used to carry a hardcoded count that no longer matched the dataset.
  const sourceWorkbooks = parsed.sourceWorkbooks;
  if (typeof sourceWorkbooks !== "number" || !Number.isInteger(sourceWorkbooks) || sourceWorkbooks <= 0) {
    throw new Error("INVALID_INPUT_SOURCE_WORKBOOKS");
  }
  const labels = parsed.seasons.map((season) => season.season);
  labels.forEach(assertModelableSeason);
  if (new Set(labels).size !== MODELABLE_SEASONS.length ||
      MODELABLE_SEASONS.some((season) => !labels.includes(season))) {
    throw new Error("MODELABLE_SEASON_SET_MISMATCH");
  }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
  if (status.trim()) throw new Error("DIRTY_WORKTREE");

  // @2.2.0: the anagrafica travels inside the dataset artifact, so it is
  // already covered by `inputHash` and by the (dataset, configHash) package
  // identity. A malformed block throws here; an absent one is caught by the
  // coverage floor a few lines below, with a reason code that says so.
  const anagrafica = readAnagraficaFromDataset(parsed);

  const report = runAppealIndexPipeline(parsed.seasons, {
    datasetProvenance: "external_real",
    sampleSize: 0,
    anagrafica,
  });
  const featureRows = buildFeatureRows(buildPlayerSeasonPanel(parsed.seasons), { anagrafica });

  // Fail-closed BEFORE any fold is built. Below the preregistered floor the
  // pooled families would be fitted on almost nothing and every D/C/A verdict
  // would come back NO_VERDICT — indistinguishable, from the package alone,
  // from a real methodological finding. Refusing costs a minute; producing
  // that package costs an hour and misleads whoever reads it.
  //
  // Scoped to the roles the floor actually governs. This run does gate the
  // pooled roles, so it still refuses exactly as before; passing the set
  // explicitly is what stops the guard from reading as a blanket precondition
  // over role P, whose ladder does not consume the anagrafica at all.
  const anagraficaCoverage = evaluateAnagraficaCoverage(featureRows);
  for (const line of formatAnagraficaCoverage(anagraficaCoverage)) process.stderr.write(`[phase4] ${line}\n`);
  assertAnagraficaCoverage(anagraficaCoverage, PHASE4_ROLES.filter(isPooledGatedRole));

  const folds = buildWalkForwardSplit(featureRows).folds;
  const trainers: readonly Trainer[] = [
    ...BASELINE_TRAINERS,
    ...PHASE4_CONFIG.hyperparameters.ridgeLambda.map((lambda) => ({
      ...ridgeRegressionTrainer(lambda), name: `pooled_regularized_role:lambda=${lambda}`,
    })),
  ];
  const oof = folds.flatMap((fold) =>
    TARGETS.flatMap((target) => {
      const train = finiteRows(fold.trainRows, target);
      const test = finiteRows(fold.testRows, target);
      return trainers.flatMap((trainer) => {
        if (train.length === 0) return [];
        const fitted = trainer.fit(train, target);
        return test.map((row) => ({
          rowId: redactKey(`${row.playerKey}|${row.targetSeason}`),
          cohortId: `cohort:${row.targetSeason}`,
          target: targetLabel(target),
          season: row.targetSeason, role: row.role,
          foldId: `rolling-origin:${fold.testSeason}`,
          pipelineId: "complete_case", candidateId: trainer.name,
          actual: row.targets[target], predicted: fitted.predict(row.features),
          sourceSeasons: row.sourceSeasons,
        }));
      });
    }),
  );
  // Preregistered goalkeeper ladder: evaluated per target BEFORE any metric is
  // read, and only the richest family clearing its own sample guard is fitted.
  const goalkeeperLadders = TARGETS.map((target) => ({
    label: targetLabel(target),
    evaluation: evaluateGoalkeeperLadder(folds, target),
  }));
  const goalkeeperOof = goalkeeperLadders.flatMap(({ label, evaluation }) => {
    const family = evaluation.selectedFamily;
    if (family === null) return [];
    return folds.flatMap((fold) => {
      const train = goalkeeperCompleteCaseRows(fold.trainRows, family, evaluation.target);
      const test = goalkeeperCompleteCaseRows(fold.testRows, family, evaluation.target);
      if (train.length === 0 || test.length === 0) return [];
      return PHASE4_CONFIG.hyperparameters.ridgeLambda.flatMap((lambda) => {
        const fitted = fitGoalkeeperRidge(train, family, evaluation.target, lambda);
        return test.map((row) => ({
          rowId: redactKey(`${row.playerKey}|${row.targetSeason}`),
          cohortId: `cohort:${row.targetSeason}`,
          target: label,
          season: row.targetSeason, role: row.role,
          foldId: `rolling-origin:${fold.testSeason}`,
          pipelineId: "complete_case", candidateId: goalkeeperCandidateId(family, lambda),
          actual: row.targets[evaluation.target], predicted: fitted.predict(row),
          sourceSeasons: row.sourceSeasons,
        }));
      });
    });
  });
  const totalOof = folds.flatMap((fold) => {
    const train = finiteRows(fold.trainRows, "fantamediaNext")
      .filter((row) => Number.isFinite(row.targets.presenzeNext));
    const test = finiteRows(fold.testRows, "fantamediaNext")
      .filter((row) => Number.isFinite(row.targets.presenzeNext));
    if (train.length === 0) return [];
    const directRows = train.map((row) => ({
      ...row, targets: {
        ...row.targets,
        fantamediaNext: row.targets.fantamediaNext * row.targets.presenzeNext,
      },
    }));
    const direct = ridgeRegressionTrainer(1).fit(directRows, "fantamediaNext");
    const usage = ridgeRegressionTrainer(1).fit(train, "presenzeNext");
    const performance = ridgeRegressionTrainer(1).fit(train, "fantamediaNext");
    return test.flatMap((row) => {
      const common = {
        rowId: redactKey(`${row.playerKey}|${row.targetSeason}`),
        cohortId: `cohort:${row.targetSeason}`, season: row.targetSeason, role: row.role,
        foldId: `rolling-origin:${fold.testSeason}`, pipelineId: "complete_case",
        actual: row.targets.fantamediaNext * row.targets.presenzeNext,
        sourceSeasons: row.sourceSeasons,
      };
      return [
        { ...common, target: "season_total_direct", candidateId: "direct_season_total",
          predicted: direct.predict(row.features) },
        { ...common, target: "season_total_two_part", candidateId: "two_part_hurdle",
          predicted: usage.predict(row.features) * performance.predict(row.features) },
      ];
    });
  });
  const allOof = [...oof, ...goalkeeperOof, ...totalOof].sort((a, b) =>
    `${a.target}|${a.candidateId}|${a.season}|${a.role}|${a.rowId}`.localeCompare(
      `${b.target}|${b.candidateId}|${b.season}|${b.role}|${b.rowId}`));
  const metricGroups = new Map<string, typeof allOof>();
  for (const item of allOof) {
    const key = `${item.target}|${item.candidateId}|${item.season}|${item.role}`;
    metricGroups.set(key, [...(metricGroups.get(key) ?? []), item]);
  }
  const foldMetrics = [...metricGroups.values()].map((items) => ({
    target: items[0]!.target, candidateId: items[0]!.candidateId,
    testSeason: items[0]!.season, role: items[0]!.role, nTest: items.length,
    mae: items.reduce((sum, item) => sum + Math.abs(item.actual - item.predicted), 0) / items.length,
    calibrationBias: items.reduce((sum, item) => sum + item.predicted - item.actual, 0) / items.length,
  }));
  const foldIds = folds.map((fold) => fold.testSeason);
  // `target: null` marks a family whose eligibility does not depend on the
  // target; the goalkeeper ladder's does, because its support is the
  // complete-case subset for that target.
  const eligibility = [
    ...Object.keys(PHASE4_CONFIG.families)
      .filter((family) => !isGoalkeeperFamily(family))
      .flatMap((family) =>
        PHASE4_ROLES.map((role) => ({
          family, role, target: null, pFamily: familyParameterCount(
            family as keyof typeof PHASE4_CONFIG.families, role,
          ),
          ...sampleEligibility(family as keyof typeof PHASE4_CONFIG.families, role,
            folds.map((fold) => ({
              foldId: fold.testSeason,
              nTrain: fold.trainRows.filter((row) => row.role === role).length,
            }))),
        })),
      ),
    ...goalkeeperLadders.flatMap(({ label, evaluation }) =>
      evaluation.families.map((entry) => ({
        family: entry.family, role: "P" as const, target: label, pFamily: entry.pFamily,
        folds: entry.folds.map((fold) => ({
          role: "P" as const, foldId: fold.foldId, nTrain: fold.completeCaseNTrain,
          pFamily: entry.pFamily, eligible: fold.eligible,
          reasonCode: fold.eligible ? "ELIGIBLE" as const : "SAMPLE_GUARD_FAILED" as const,
        })),
        roleEligible: entry.roleEligible,
        verdict: entry.roleEligible ? null : "NO_VERDICT",
      })),
    ),
  ];
  const pooledEligibility = new Map(
    eligibility.filter((item) => item.family === "pooled_regularized_role")
      .map((item) => [item.role, item.roleEligible]),
  );
  // Selection itself lives in packages/appeal-index/src/phase4Selection.ts,
  // beside the protocol it implements and unit-tested there. This runner only
  // supplies the evidence and writes down what came back.
  // Role P is gated by its own ladder, per target; D/C/A keep the pooled
  // family. The `10 * p_family` rule is the same on both paths — only the
  // family, and therefore the parameter count, differs.
  const ladderByTarget = new Map(goalkeeperLadders.map((item) => [item.label, item.evaluation]));
  const leanestGoalkeeperFamily = PHASE4_CONFIG.goalkeeperLadder[PHASE4_CONFIG.goalkeeperLadder.length - 1];
  const eligible = new Set<string>();
  const gatingFamilyByRole = new Map<string, keyof typeof PHASE4_CONFIG.families>();
  for (const target of VERDICT_TARGETS) {
    for (const role of PHASE4_ROLES) {
      const ladder = role === "P" ? ladderByTarget.get(target)! : null;
      gatingFamilyByRole.set(
        `${target}|${role}`,
        ladder ? ladder.selectedFamily ?? leanestGoalkeeperFamily : "pooled_regularized_role",
      );
      const roleEligible = ladder ? ladder.selectedFamily !== null : pooledEligibility.get(role) === true;
      if (roleEligible) eligible.add(`${target}|${role}`);
    }
  }
  const { comparisons: roleComparisons, verdicts: roleVerdicts } = selectPhase4RoleVerdicts({
    targets: VERDICT_TARGETS,
    roles: PHASE4_ROLES,
    oof: allOof,
    foldMetrics,
    eligible,
    gatingFamilyByRole,
  });
  const totalPairs = new Map<string, { direct?: number; twoPart?: number; actual: number; season: string; role: string }>();
  for (const item of totalOof) {
    const key = `${item.rowId}|${item.season}`;
    const pair = totalPairs.get(key) ?? { actual: item.actual, season: item.season, role: item.role };
    if (item.candidateId === "direct_season_total") pair.direct = item.predicted;
    else pair.twoPart = item.predicted;
    totalPairs.set(key, pair);
  }
  const alignedTotals = [...totalPairs.values()].filter(
    (item): item is typeof item & { direct: number; twoPart: number } =>
      item.direct !== undefined && item.twoPart !== undefined,
  );
  const totalSeasonDeltas = [...new Set(alignedTotals.map((item) => item.season))].map((season) =>
    mean(alignedTotals.filter((item) => item.season === season)
      .map((item) => Math.abs(item.actual - item.direct) - Math.abs(item.actual - item.twoPart))),
  );
  const totalInterval = seasonBlockInterval(
    totalSeasonDeltas, PHASE4_CONFIG.seed, PHASE4_CONFIG.bootstrapReplicates,
  );
  const totalComparison = {
    target: "season_total", candidateId: "direct_season_total",
    baselineId: "two_part_hurdle", alignedRows: alignedTotals.length,
    meanPairedAbsoluteErrorDelta: mean(totalSeasonDeltas),
    seasonBlock95Ci: totalInterval,
    verdict: totalInterval.lower !== null && totalInterval.upper !== null &&
      totalInterval.lower > 0 ? "TWO_PART_LOWER_MAE" :
      totalInterval.upper !== null && totalInterval.upper < 0 ? "DIRECT_LOWER_MAE" : "NO_VERDICT",
  };
  const components = Object.entries(COMPONENT_DISPOSITIONS).flatMap(([component, disposition]) =>
    PHASE4_ROLES.map((role) => ({
      component, role, construct: component, observableProxy: disposition.proxy,
      eligibility: disposition.proxy === null ? "not_observable" : "scouting_only",
      coverage: null, uncertainty: "season_block_limited",
      verdict: disposition.defaultVerdict,
      fallback: "transparent_train_only_heuristic_or_unavailable",
      limits: ["reconstructed_votes_only", "validated=false"],
      reasonCode: disposition.proxy === null ? "GROUND_TRUTH_MISSING" : "SCOUTING_EVIDENCE_ONLY",
    })),
  );
  const safeReport = {
    protocolVersion: PHASE4_CONFIG.protocolVersion,
    evidenceCap: "scouting", promotionalReadiness: "PROMOTIONAL_NOT_READY",
    validated: false, gates: PHASE4_CONFIG.gates, datasetSummary: report.datasetSummary,
    identity: {
      verdict: report.identity.verdict,
      stableMatchRate: report.identity.stableMatchRate,
      collisionRate: report.identity.collisionRate,
    },
    targets: roleVerdicts,
    conclusion: "SCOUTING_ONLY",
  };
  const artifacts: Record<string, string> = {
    "phase4_input_manifest.json": pretty({
      seasons: labels, inputHash: `sha256:${sha(inputBytes)}`, files: sourceWorkbooks,
      cohort: PHASE4_CONFIG.cohort, forbiddenSeasonAccesses: [],
    }),
    "phase4_run_config.json": pretty({ ...PHASE4_CONFIG, configHash: phase4ConfigHash() }),
    "cohort_accounting.json": pretty({
      cohort: PHASE4_CONFIG.cohort, denominator: report.datasetSummary.nFeatureRows,
      targetObservability: "conditioned_on_reconstructed_votes", unknownHistoricalListRows: "unknown",
    }),
    "feature_registry.json": pretty(PHASE4_CONFIG.features.map((name) => ({ name, trainOnly: true }))),
    "candidate_registry.json": pretty({
      baselines: PHASE4_CONFIG.baselines, families: PHASE4_CONFIG.families,
      goalkeeperLadder: PHASE4_CONFIG.goalkeeperLadder,
      evaluatedGoalkeeperCandidates: [...new Set(goalkeeperOof.map((row) => row.candidateId))].sort(),
      evaluatedLegacyCandidates: Object.values(report.perTarget)[0]?.results.map((r) => r.modelName) ?? [],
    }),
    "sample_size_eligibility.json": pretty(eligibility),
    // The role-P deliverable in BOTH branches: when a family is selected this
    // says which one and on how many rows; when none is, this is the analysis
    // that replaces the missing index — every family tried, its parameter
    // count, its threshold, and the per-fold support that fell short.
    "goalkeeper_family_report.json": pretty({
      ladder: PHASE4_CONFIG.goalkeeperLadder,
      selectionRule: PHASE4_CONFIG.goalkeeperSelectionRule,
      supportRule: PHASE4_CONFIG.goalkeeperSupportRule,
      features: PHASE4_CONFIG.goalkeeperFeatures,
      pooledFamilyThresholdForP: 10 * familyParameterCount("pooled_regularized_role", "P"),
      byTarget: goalkeeperLadders.map(({ label, evaluation }) => ({
        target: label,
        selectedFamily: evaluation.selectedFamily,
        reasonCode: evaluation.reasonCode,
        families: evaluation.families,
      })),
    }),
    // The counterpart of `goalkeeper_family_report.json` for the one pooled
    // feature that can be legitimately absent. Aggregate and per-role counts
    // only — no player key, no name, no QID, no birth date — so a reader can
    // tell "the model saw the anagrafica" from "the model saw a hole" without
    // the package carrying any of the source data.
    "anagrafica_coverage_report.json": pretty({
      policy: PHASE4_CONFIG.anagrafica,
      resolutionSource: "packages/wikidata-identity-contract (fail-closed identity + day-precision date only)",
      ...anagraficaCoverage,
    }),
    "oof_predictions.jsonl": allOof.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "fold_metrics.json": pretty(foldMetrics),
    "paired_comparisons.json": pretty([...roleComparisons, totalComparison]),
    "uncertainty_report.json": pretty({
      method: PHASE4_CONFIG.bootstrapMethod, replicates: PHASE4_CONFIG.bootstrapReplicates,
      seed: PHASE4_CONFIG.seed, indistinguishable: PHASE4_CONFIG.indistinguishable,
      regressionRule: PHASE4_CONFIG.regressionRule, tieBreak: PHASE4_CONFIG.tieBreak,
      roleComparisons, seasonTotalComparison: totalComparison,
    }),
    "sensitivity_report.json": pretty({
      missingness: PHASE4_CONFIG.pipelines, currentListUsedAsHistorical: false,
      futurePerturbation: "covered_by_test", result: "NO_VERDICT",
    }),
    "component_verdicts.json": pretty(components),
    "algorithm_registry.json": pretty(roleVerdicts),
    "fitted_parameters.json": pretty({
      values: [], reasonCode: "NO_ELIGIBLE_NEW_FAMILY_SELECTED", privateOnly: true,
    }),
    "role_vor_report.json": pretty({
      replacement: PHASE4_CONFIG.roleVorReplacement, verdict: "NO_VERDICT",
      reasonCode: "VALUE_NOT_STABLY_SELECTED", cohortLimit: PHASE4_CONFIG.cohort,
    }),
    "archetype_vor_report.json": pretty({
      verdict: "NO_VERDICT", reasonCode: "ARCH_01_MISSING",
    }),
    "phase4_report.json": pretty(safeReport),
    "phase4_report.md": [
      "# Fase 4 — scouting evidence", "",
      `Protocol: ${PHASE4_CONFIG.protocolVersion}`, "Evidence cap: scouting",
      "Promotional readiness: PROMOTIONAL_NOT_READY", "Validated: false",
      `Feature rows: ${report.datasetSummary.nFeatureRows}`,
      `Folds: ${report.datasetSummary.nFolds}`, "",
      ...roleVerdicts.map((item) =>
        `- ${item.target}/${item.role}: ${item.verdict} (${item.selected ?? "none"}; baseline ` +
        `${item.bestBaseline ?? "none"}; gating family ${item.gatingFamily})`),
      "",
      ...goalkeeperLadders.map(({ label, evaluation }) =>
        `- goalkeeper ladder ${label}: ${evaluation.selectedFamily ?? "none"} (${evaluation.reasonCode})`),
      "", "All gates remain OFF. No receipt, UI integration, FTM, or 0–100 score was produced.", "",
    ].join("\n"),
    "val_run_manifest.json": pretty({
      protocolVersion: PHASE4_CONFIG.protocolVersion, commit, clean: true,
      command: "npm run phase4-backtest -- --input <private> --out <private>",
      configHash: phase4ConfigHash(), inputManifestHash: `sha256:${sha(inputBytes)}`,
      seed: PHASE4_CONFIG.seed, deterministic: true, evidenceCap: "scouting",
      artifacts: ARTIFACT_NAMES, rowIdentity: "sha256_redacted",
    }),
  };
  Object.values(artifacts).forEach((content) => assertPhase4OutputShape(content));
  mkdirSync(output, { recursive: false });
  for (const [name, content] of Object.entries(artifacts)) {
    writeFileSync(resolve(output, name), content, { encoding: "utf8", flag: "wx" });
  }
  const manifest = {
    schemaVersion: "1.0.0", repoCommitSha: commit,
    artifacts: Object.entries(artifacts).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, content]) => ({ name, size: Buffer.byteLength(content), sha256: sha(content) })),
  };
  writeFileSync(resolve(output, "artifact_manifest.json"), pretty(manifest), { flag: "wx" });
  process.stderr.write(`[phase4] ${redactKey(inputPath)} -> ${ARTIFACT_NAMES.length + 1} artifacts\n`);
}

try { main(); } catch (error) {
  process.stderr.write(`[phase4] ${error instanceof Error ? error.message : "UNKNOWN_ERROR"}\n`);
  process.exit(1);
}

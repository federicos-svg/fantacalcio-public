import { createHash } from "node:crypto";
import { TARGET_NAMES, type Role, type TargetName } from "./types.js";

export const BURNED_HOLDOUT_SEASON = "2025_26";

export type PopulationStatus =
  | "observed"
  | "cold_start"
  | "zero_appearances"
  | "outside_observed_perimeter";

export interface PassiveRow {
  readonly rowId: string;
  readonly cohortId: string;
  readonly targetSeason: string;
  readonly role: Role;
  readonly populationStatus: PopulationStatus;
  readonly sourceSeasons: readonly string[];
  readonly features: Readonly<Record<string, number | null>>;
  readonly targets: Readonly<Record<TargetName, number | null>>;
}

export type MissingnessPipelineConfig =
  | { readonly id: "missing_indicator_train_median"; readonly featureNames: readonly string[] }
  | { readonly id: "complete_case"; readonly featureNames: readonly string[] }
  | {
      readonly id: "cold_start_role_fallback";
      readonly featureNames: readonly string[];
      readonly fallback: "train_role_mean";
    };

export interface CandidateConfig {
  readonly id: "train_mean" | "train_role_mean";
}

export interface PassiveHarnessConfig {
  readonly protocolVersion: "VAL-PROTOCOL-A@1.0.0";
  readonly targets: readonly TargetName[];
  readonly pipelines: readonly MissingnessPipelineConfig[];
  readonly candidates: readonly CandidateConfig[];
  readonly minTrainSeasons: number;
  readonly seed: number;
  readonly burnedHoldoutPolicy: {
    readonly season: typeof BURNED_HOLDOUT_SEASON;
    readonly allowDescriptiveAccess: boolean;
  };
  readonly tieBreakBand?: number;
}

export interface Coverage {
  readonly cohortDenominator: number;
  readonly targetObservable: number;
  readonly targetNotObservable: number;
  readonly evaluated: number;
  readonly excluded: number;
  readonly exclusionReasons: Readonly<Record<string, number>>;
  readonly fallback: { readonly used: number; readonly unavailable: number };
  readonly ratio: number;
  readonly byRole: Readonly<
    Record<
      Role,
      {
        cohortDenominator: number;
        targetObservable: number;
        targetNotObservable: number;
        evaluated: number;
        excluded: number;
        ratio: number;
      }
    >
  >;
}

export interface OofPrediction {
  readonly rowId: string;
  readonly cohortId: string;
  readonly target: TargetName;
  readonly season: string;
  readonly role: Role;
  readonly foldId: string;
  readonly pipelineId: MissingnessPipelineConfig["id"];
  readonly candidateId: CandidateConfig["id"];
  readonly actual: number;
  readonly predicted: number;
  readonly fallback: {
    readonly used: boolean;
    readonly method: "train_role_mean" | null;
    readonly validated: false;
  };
}

export interface PassiveHarnessResult {
  readonly configHash: `sha256:${string}`;
  readonly status: "no_verdict";
  readonly oof: readonly OofPrediction[];
  readonly coverage: readonly {
    pipelineId: MissingnessPipelineConfig["id"];
    target: TargetName;
    value: Coverage;
  }[];
  readonly metrics: {
    readonly byRoleSeason: readonly MetricGroup[];
    readonly aggregate: readonly MetricAggregate[];
    readonly foldDispersion: readonly FoldDispersion[];
  };
  readonly paired: readonly PairedComparison[];
  readonly holdoutAccesses: readonly {
    season: typeof BURNED_HOLDOUT_SEASON;
    purpose: "descriptive_advisory";
  }[];
  readonly determinism: { readonly seed: number; readonly deterministic: true };
}

interface MetricGroup {
  readonly pipelineId: string;
  readonly candidateId: string;
  readonly target: TargetName;
  readonly role: Role;
  readonly season: string;
  readonly n: number;
  readonly mae: number;
}

interface MetricAggregate {
  readonly pipelineId: string;
  readonly candidateId: string;
  readonly target: TargetName;
  readonly n: number;
  readonly mae: number;
}

interface FoldDispersion {
  readonly pipelineId: string;
  readonly candidateId: string;
  readonly target: TargetName;
  readonly seasonalMae: readonly number[];
  readonly min: number;
  readonly max: number;
}

interface PairedComparison {
  readonly pipelineId: string;
  readonly target: TargetName;
  readonly candidateId: string;
  readonly baselineId: string;
  readonly alignedRows: number;
  readonly meanPairedAbsoluteErrorDelta: number;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deterministicConfigHash(config: PassiveHarnessConfig): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(stable(config)).digest("hex")}`;
}

function seasonYear(season: string): number {
  const match = /^(\d{4})_(\d{2})$/.exec(season);
  if (!match) throw new Error(`Non-canonical season '${season}'`);
  return Number(match[1]);
}

export function assertPassiveRows(rows: readonly PassiveRow[]): void {
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.rowId)) throw new Error(`Duplicate redacted rowId '${row.rowId}'`);
    ids.add(row.rowId);
    const targetYear = seasonYear(row.targetSeason);
    if (row.sourceSeasons.some((season) => seasonYear(season) >= targetYear)) {
      throw new Error(`Future season leaked into row '${row.rowId}'`);
    }
    for (const [name, value] of [
      ...Object.entries(row.features),
      ...Object.entries(row.targets),
    ]) {
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
        throw new Error(`Non-finite value '${name}' in row '${row.rowId}'`);
      }
    }
    for (const target of TARGET_NAMES) {
      if (!(target in row.targets)) {
        throw new Error(`Missing target '${target}' in row '${row.rowId}'`);
      }
    }
  }
}

function median(values: readonly number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

interface PreparedRow {
  readonly row: PassiveRow;
  readonly features: Readonly<Record<string, number>>;
}

export type ExclusionReason =
  | "target_not_observable"
  | "complete_case_missing_feature"
  | "missing_feature_no_train_stat"
  | "cold_start_role_fallback_unavailable"
  | "no_observed_train_target";

export interface PreparedExclusion {
  readonly row: PassiveRow;
  readonly reason: Extract<
    ExclusionReason,
    "complete_case_missing_feature" | "missing_feature_no_train_stat"
  >;
}

export interface PreparedFold {
  readonly train: readonly PreparedRow[];
  readonly test: readonly PreparedRow[];
  readonly excludedTrain: readonly PreparedExclusion[];
  readonly excludedTest: readonly PreparedExclusion[];
  readonly trainImputation: Readonly<Record<string, number | null>>;
}

export function preparePassiveFold(
  pipeline: MissingnessPipelineConfig,
  trainRows: readonly PassiveRow[],
  testRows: readonly PassiveRow[],
): PreparedFold {
  const trainImputation = Object.fromEntries(
    pipeline.featureNames.map((name) => [
      name,
      median(
        trainRows
          .map((row) => row.features[name])
          .filter((value): value is number => value !== null && Number.isFinite(value)),
      ),
    ]),
  );
  const apply = (
    rows: readonly PassiveRow[],
  ): { prepared: PreparedRow[]; excluded: PreparedExclusion[] } => {
    const prepared: PreparedRow[] = [];
    const excluded: PreparedExclusion[] = [];
    for (const row of rows) {
      const hasMissing = pipeline.featureNames.some((name) => row.features[name] == null);
      if (pipeline.id === "complete_case" && hasMissing) {
        excluded.push({ row, reason: "complete_case_missing_feature" });
        continue;
      }
      const isColdStartFallback =
        pipeline.id === "cold_start_role_fallback" && row.populationStatus === "cold_start";
      const lacksTrainStatistic = pipeline.featureNames.some(
        (name) => row.features[name] == null && trainImputation[name] === null,
      );
      if (!isColdStartFallback && lacksTrainStatistic) {
        excluded.push({ row, reason: "missing_feature_no_train_stat" });
        continue;
      }
      const features: Record<string, number> = {};
      for (const name of pipeline.featureNames) {
        const raw = row.features[name];
        const imputed = trainImputation[name];
        if (raw != null) features[name] = raw;
        else if (imputed != null) features[name] = imputed;
        if (pipeline.id === "missing_indicator_train_median") {
          features[`${name}__missing`] = raw == null ? 1 : 0;
        }
      }
      prepared.push({ row, features });
    }
    return { prepared, excluded };
  };
  const train = apply(trainRows);
  const test = apply(testRows);
  return {
    train: train.prepared,
    test: test.prepared,
    excludedTrain: train.excluded,
    excludedTest: test.excluded,
    trainImputation,
  };
}

interface EvaluationOutcome {
  readonly status: "evaluated" | "excluded" | "target_not_observable";
  readonly reason?: ExclusionReason;
  readonly fallbackUsed?: boolean;
}

function coverage(
  rows: readonly PassiveRow[],
  target: TargetName,
  outcomes: ReadonlyMap<string, EvaluationOutcome>,
): Coverage {
  const roles: Role[] = ["P", "D", "C", "A"];
  const summarize = (subset: readonly PassiveRow[]) => {
    const targetObservable = subset.filter((row) => row.targets[target] !== null).length;
    const targetNotObservable = subset.length - targetObservable;
    const evaluated = subset.filter((row) => outcomes.get(row.rowId)?.status === "evaluated").length;
    return {
      cohortDenominator: subset.length,
      targetObservable,
      targetNotObservable,
      evaluated,
      excluded: targetObservable - evaluated,
      ratio: subset.length === 0 ? 0 : evaluated / subset.length,
    };
  };
  const byRole = Object.fromEntries(
    roles.map((role) => [role, summarize(rows.filter((row) => row.role === role))]),
  ) as Coverage["byRole"];
  const summary = summarize(rows);
  const exclusionReasons: Record<string, number> = {};
  for (const row of rows) {
    const outcome = outcomes.get(row.rowId);
    if (outcome?.status === "excluded" && outcome.reason) {
      exclusionReasons[outcome.reason] = (exclusionReasons[outcome.reason] ?? 0) + 1;
    }
  }
  return {
    ...summary,
    exclusionReasons,
    fallback: {
      used: rows.filter((row) => outcomes.get(row.rowId)?.fallbackUsed).length,
      unavailable: rows.filter(
        (row) => outcomes.get(row.rowId)?.reason === "cold_start_role_fallback_unavailable",
      ).length,
    },
    byRole,
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function trainMean(rows: readonly PassiveRow[], target: TargetName): number {
  const values = rows
    .map((row) => row.targets[target])
    .filter((value): value is number => value !== null);
  if (values.length === 0) throw new Error(`No train target for '${target}'`);
  return mean(values);
}

function predict(
  candidate: CandidateConfig,
  trainRows: readonly PassiveRow[],
  row: PassiveRow,
  target: TargetName,
): number {
  if (candidate.id === "train_role_mean") {
    const sameRole = trainRows.filter(
      (item) => item.role === row.role && item.targets[target] !== null,
    );
    if (sameRole.length > 0) return trainMean(sameRole, target);
  }
  return trainMean(trainRows, target);
}

function group<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
  return out;
}

export function runPassiveHarness(
  rows: readonly PassiveRow[],
  config: PassiveHarnessConfig,
): PassiveHarnessResult {
  assertPassiveRows(rows);
  if (config.burnedHoldoutPolicy.season !== BURNED_HOLDOUT_SEASON) {
    throw new Error("Burned holdout policy must explicitly name 2025_26");
  }
  const burned = rows.filter((row) => row.targetSeason === BURNED_HOLDOUT_SEASON);
  const holdoutAccesses =
    burned.length > 0 && config.burnedHoldoutPolicy.allowDescriptiveAccess
      ? ([{ season: BURNED_HOLDOUT_SEASON, purpose: "descriptive_advisory" }] as const)
      : [];
  const selectable = rows.filter((row) => row.targetSeason !== BURNED_HOLDOUT_SEASON);
  const seasons = [...new Set(selectable.map((row) => row.targetSeason))].sort(
    (a, b) => seasonYear(a) - seasonYear(b),
  );
  const oof: OofPrediction[] = [];
  const coverageEntries: PassiveHarnessResult["coverage"][number][] = [];

  for (const target of config.targets) {
    for (const pipeline of config.pipelines) {
      const evaluationSeasons = new Set(seasons.slice(config.minTrainSeasons));
      const cohortRows = selectable.filter((row) => evaluationSeasons.has(row.targetSeason));
      const outcomes = new Map<string, EvaluationOutcome>(
        cohortRows.map((row) => [
          row.rowId,
          row.targets[target] === null
            ? {
                status: "target_not_observable" as const,
                reason: "target_not_observable" as const,
              }
            : { status: "excluded" as const, reason: "no_observed_train_target" as const },
        ]),
      );
      for (let index = config.minTrainSeasons; index < seasons.length; index++) {
        const testSeason = seasons[index]!;
        const trainRows = selectable.filter(
          (row) => seasonYear(row.targetSeason) < seasonYear(testSeason),
        );
        const denominator = selectable.filter((row) => row.targetSeason === testSeason);
        const testRows = denominator.filter((row) => row.targets[target] !== null);
        if (trainRows.length === 0 || testRows.length === 0) continue;
        const prepared = preparePassiveFold(pipeline, trainRows, testRows);
        for (const excluded of prepared.excludedTest) {
          outcomes.set(excluded.row.rowId, {
            status: "excluded",
            reason: excluded.reason,
          });
        }
        const usableTrain = prepared.train
          .map((item) => item.row)
          .filter((row) => row.targets[target] !== null);
        if (usableTrain.length === 0) continue;
        for (const item of prepared.test) {
          const useFallback =
            pipeline.id === "cold_start_role_fallback" &&
            pipeline.fallback === "train_role_mean" &&
            item.row.populationStatus === "cold_start";
          const fallbackTrain = useFallback
            ? usableTrain.filter(
                (trainRow) =>
                  trainRow.role === item.row.role && trainRow.targets[target] !== null,
              )
            : [];
          if (useFallback && fallbackTrain.length === 0) {
            outcomes.set(item.row.rowId, {
              status: "excluded",
              reason: "cold_start_role_fallback_unavailable",
            });
            continue;
          }
          outcomes.set(item.row.rowId, {
            status: "evaluated",
            fallbackUsed: useFallback,
          });
          for (const candidate of config.candidates) {
            const predicted = useFallback
              ? trainMean(fallbackTrain, target)
              : predict(candidate, usableTrain, item.row, target);
            oof.push({
              rowId: item.row.rowId,
              cohortId: item.row.cohortId,
              target,
              season: testSeason,
              role: item.row.role,
              foldId: `rolling-origin:${testSeason}`,
              pipelineId: pipeline.id,
              candidateId: candidate.id,
              actual: item.row.targets[target]!,
              predicted,
              fallback: {
                used: useFallback,
                method: useFallback ? "train_role_mean" : null,
                validated: false,
              },
            });
          }
        }
      }
      coverageEntries.push({
        pipelineId: pipeline.id,
        target,
        value: coverage(cohortRows, target, outcomes),
      });
    }
  }

  const byRoleSeason = [...group(
    oof,
    (item) =>
      `${item.pipelineId}|${item.candidateId}|${item.target}|${item.role}|${item.season}`,
  )].map(([, items]) => ({
    pipelineId: items[0]!.pipelineId,
    candidateId: items[0]!.candidateId,
    target: items[0]!.target,
    role: items[0]!.role,
    season: items[0]!.season,
    n: items.length,
    mae: mean(items.map((item) => Math.abs(item.actual - item.predicted))),
  }));
  const aggregate = [...group(
    oof,
    (item) => `${item.pipelineId}|${item.candidateId}|${item.target}`,
  )].map(([, items]) => ({
    pipelineId: items[0]!.pipelineId,
    candidateId: items[0]!.candidateId,
    target: items[0]!.target,
    n: items.length,
    mae: mean(items.map((item) => Math.abs(item.actual - item.predicted))),
  }));
  const foldDispersion = aggregate.map((entry) => {
    const seasonalMae = [...group(
      oof.filter(
        (item) =>
          item.pipelineId === entry.pipelineId &&
          item.candidateId === entry.candidateId &&
          item.target === entry.target,
      ),
      (item) => item.season,
    )].map(([, items]) => mean(items.map((item) => Math.abs(item.actual - item.predicted))));
    return {
      pipelineId: entry.pipelineId,
      candidateId: entry.candidateId,
      target: entry.target,
      seasonalMae,
      min: Math.min(...seasonalMae),
      max: Math.max(...seasonalMae),
    };
  });

  const paired: PairedComparison[] = [];
  const baselineId = config.candidates[0]?.id;
  if (baselineId) {
    for (const pipeline of config.pipelines) {
      for (const target of config.targets) {
        const baselineByKey = new Map(
          oof
            .filter(
              (item) =>
                item.pipelineId === pipeline.id &&
                item.target === target &&
                item.candidateId === baselineId,
            )
            .map((item) => [`${item.rowId}|${item.season}`, item]),
        );
        for (const candidate of config.candidates.slice(1)) {
          const aligned = oof
            .filter(
              (item) =>
                item.pipelineId === pipeline.id &&
                item.target === target &&
                item.candidateId === candidate.id,
            )
            .flatMap((item) => {
              const baseline = baselineByKey.get(`${item.rowId}|${item.season}`);
              return baseline ? [{ item, baseline }] : [];
            });
          paired.push({
            pipelineId: pipeline.id,
            target,
            candidateId: candidate.id,
            baselineId,
            alignedRows: aligned.length,
            meanPairedAbsoluteErrorDelta:
              aligned.length === 0
                ? 0
                : mean(
                    aligned.map(
                      ({ item, baseline }) =>
                        Math.abs(item.actual - item.predicted) -
                        Math.abs(baseline.actual - baseline.predicted),
                    ),
                  ),
          });
        }
      }
    }
  }

  return {
    configHash: deterministicConfigHash(config),
    status: "no_verdict",
    oof,
    coverage: coverageEntries,
    metrics: { byRoleSeason, aggregate, foldDispersion },
    paired,
    holdoutAccesses,
    determinism: { seed: config.seed, deterministic: true },
  };
}

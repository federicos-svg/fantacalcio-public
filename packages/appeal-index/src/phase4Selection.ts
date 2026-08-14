// Phase 4 model selection — PURE, no I/O, no real data.
//
// Implements the selection order VAL-PROTOCOL-A §6 preregisters and
// `PHASE4_CONFIG` declares:
//
//   1. candidates whose role failed the sample guard are excluded upstream;
//   2. candidates are compared on paired differences over the SAME rows, with
//      uncertainty from a season-block bootstrap
//      (`PHASE4_CONFIG.bootstrapMethod`);
//   3. a candidate that regresses in any role of a target is not promotable in
//      any role of it (`PHASE4_CONFIG.regressionRule`);
//   4. statistically indistinguishable candidates
//      (`PHASE4_CONFIG.indistinguishable`) lose to baseline/shrinkage, then to
//      lower complexity, then to higher coverage
//      (`PHASE4_CONFIG.tieBreak`);
//   5. `NO_VERDICT` when there is no evidence to distinguish anything.
//
// It lives here, beside the protocol it implements, rather than inside the
// backtest runner: a selection rule that cannot be unit-tested without a Drive,
// a private dataset and a clean worktree is a rule nobody re-checks.

import { PHASE4_CONFIG, familyParameterCount, type Phase4Role, type Phase4Verdict } from "./phase4Protocol.js";
import { isGoalkeeperFamily } from "./goalkeeperFeatures.js";
import { mean } from "./stats.js";

export interface SeasonBlockInterval {
  readonly lower: number | null;
  readonly upper: number | null;
}

/**
 * Fewest season blocks a percentile bootstrap may be read as an interval from.
 *
 * A season-block bootstrap resamples the blocks themselves. With a single
 * block every replicate is that same block, so all 2000 draws are identical,
 * the 2.5th and 97.5th percentiles coincide, and the interval has width zero —
 * which "excludes zero" for any block whose value is not exactly zero. That is
 * not weak evidence, it is an automatic `CANDIDATE_LOWER_ERROR` manufactured
 * from one number: the strongest possible verdict produced by the one input
 * that carries no uncertainty information at all. Two, three or four blocks
 * degrade the same way — the resample can only ever revisit values already
 * seen, so a run of same-signed blocks yields an interval strictly on one side
 * of zero however little is actually known.
 *
 * Below this many blocks the interval is therefore refused rather than
 * narrowed. `null` is the value the comparator already treats as "no evidence
 * to distinguish anything" (`INDISTINGUISHABLE`, baseline retained), so the
 * guard can only ever move an outcome towards the baseline — it is incapable
 * of promoting anything, which is why it is not a promotional threshold under
 * VAL-PROTOCOL-A §6 ("non si inventano soglie dopo aver visto i risultati").
 * It is preregistered here, before the rerun, and it lives outside
 * `PHASE4_CONFIG` on purpose: adding a key there would change
 * `phase4ConfigHash()` and therefore the `(dataset, configHash)` identity of
 * every package ever produced.
 *
 * 5 is comfortably below the 7 season blocks a full run over
 * `MODELABLE_SEASONS` yields, so it binds only on the degenerate cases it was
 * written for.
 */
export const MIN_SEASON_BLOCKS_FOR_INTERVAL = 5;

/**
 * Percentile bootstrap over season-level values.
 *
 * Deterministic by construction: a linear congruential stream seeded from the
 * preregistered seed, so the same input always yields the same interval on any
 * machine. Rows are never resampled as independent units — the caller
 * aggregates to the season block first (VAL-PROTOCOL-A §6).
 *
 * Fails closed below `MIN_SEASON_BLOCKS_FOR_INTERVAL` blocks: see there.
 */
export function seasonBlockInterval(
  values: readonly number[],
  seed: number,
  replicates: number,
): SeasonBlockInterval {
  if (values.length < MIN_SEASON_BLOCKS_FOR_INTERVAL) return { lower: null, upper: null };
  let state = seed >>> 0;
  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const draws = Array.from({ length: replicates }, () =>
    mean(Array.from({ length: values.length }, () => values[Math.floor(next() * values.length)]!)),
  ).sort((a, b) => a - b);
  return {
    lower: draws[Math.floor(0.025 * (draws.length - 1))]!,
    upper: draws[Math.floor(0.975 * (draws.length - 1))]!,
  };
}

export interface Phase4OofPrediction {
  readonly target: string;
  readonly role: string;
  readonly candidateId: string;
  /** Identifies one player-season; the same row scored by another candidate carries the same id. */
  readonly rowId: string;
  readonly season: string;
  readonly actual: number;
  readonly predicted: number;
}

export interface Phase4FoldMetric {
  readonly target: string;
  readonly role: string;
  readonly candidateId: string;
  readonly mae: number;
}

export type PairedOutcome = "CANDIDATE_LOWER_ERROR" | "BASELINE_LOWER_ERROR" | "INDISTINGUISHABLE";

export interface Phase4PairedComparison {
  readonly target: string;
  readonly role: string;
  readonly candidateId: string;
  readonly baselineId: string;
  readonly alignedRows: number;
  readonly seasonBlocks: number;
  /** Candidate minus baseline: negative means the candidate's error is smaller. */
  readonly meanPairedAbsoluteErrorDelta: number | null;
  readonly seasonBlock95Ci: SeasonBlockInterval;
  readonly method: typeof PHASE4_CONFIG.bootstrapMethod;
  readonly outcome: PairedOutcome;
}

export type Phase4SelectionReason =
  | "PAIRED_SEASON_BLOCK_95CI_EXCLUDES_ZERO_SCOUTING_ONLY"
  | "ROLE_REGRESSION_VETO"
  | "BASELINE_LOWER_PAIRED_ERROR"
  | "INDISTINGUISHABLE_TIE_BREAK_BASELINE_OR_SHRINKAGE"
  | "SAMPLE_GUARD_OR_EVIDENCE_FAILED"
  | "GOALKEEPER_LADDER_SAMPLE_GUARD_FAILED";

export interface Phase4RoleSelection {
  readonly target: string;
  readonly role: Phase4Role;
  /**
   * The candidate family whose sample guard gated this role, and the only
   * family allowed to compete in it. Read downstream by the Value Core adapter
   * to look up the matching eligibility entry.
   */
  readonly gatingFamily: keyof typeof PHASE4_CONFIG.families;
  readonly verdict: Phase4Verdict;
  readonly selected: string | null;
  readonly bestBaseline: string | null;
  readonly reasonCode: Phase4SelectionReason;
  /** Roles where the winning candidate regressed, when that is why it was refused. */
  readonly regressionVetoRoles: readonly string[];
  readonly selectedComparison: Phase4PairedComparison | null;
}

export interface Phase4SelectionInput {
  readonly targets: readonly string[];
  readonly roles: readonly Phase4Role[];
  readonly oof: readonly Phase4OofPrediction[];
  readonly foldMetrics: readonly Phase4FoldMetric[];
  /**
   * The `${target}|${role}` pairs that passed the Phase 4 sample-size guard.
   * Anything else is `NO_VERDICT`.
   *
   * Keyed by target as well as role because eligibility is no longer
   * target-independent: the pooled guard counts every row of a role, but the
   * goalkeeper ladder counts the complete-case subset FOR THAT TARGET, and the
   * two targets do not have the same one — `presenze_next` is always observed
   * while `fantamedia_next` is missing for a player-season with no valid vote.
   * A role can therefore clear its guard for one target and not the other.
   */
  readonly eligible: ReadonlySet<string>;
  /**
   * The family that gated each role, keyed by `${target}|${role}`.
   *
   * Roles are no longer all gated by the same family: D/C/A answer to
   * `pooled_regularized_role`, while P answers to whichever goalkeeper ladder
   * family cleared its own guard for that target. Only candidates of a role's
   * gating family may compete in it — the pooled ridge is also scored on
   * role-P rows, but it is not the family whose guard was cleared there, so it
   * must never become P's selection. A role with no entry fails closed.
   */
  readonly gatingFamilyByRole: ReadonlyMap<string, keyof typeof PHASE4_CONFIG.families>;
}

export interface Phase4SelectionResult {
  readonly comparisons: readonly Phase4PairedComparison[];
  readonly verdicts: readonly Phase4RoleSelection[];
}

/** Baselines are named by convention; everything else competes as a model. */
export function isBaselineCandidate(candidateId: string): boolean {
  return candidateId.startsWith("baseline_");
}

/**
 * Family of a model candidate, for the `lower_complexity` tie-break. Fails
 * closed on an unmapped candidate rather than inventing a parameter count.
 */
export function candidateFamily(candidateId: string): keyof typeof PHASE4_CONFIG.families {
  if (candidateId.startsWith("pooled_regularized_role:")) return "pooled_regularized_role";
  for (const family of PHASE4_CONFIG.goalkeeperLadder) {
    if (candidateId.startsWith(`${family}:`)) return family;
  }
  throw new Error(`PHASE4_UNMAPPED_CANDIDATE_FAMILY:${candidateId}`);
}

/**
 * Paired absolute-error difference between two candidates, aggregated to the
 * season block.
 *
 * Player-season rows are correlated inside a season and are not independent
 * replicates, so the unit carried into the bootstrap is the per-season mean of
 * the row-level paired difference, never the row itself. A row only one of the
 * two candidates scored is dropped from the pair instead of being compared
 * against nothing.
 */
export function pairedSeasonDeltas(
  candidate: readonly Phase4OofPrediction[],
  baseline: readonly Phase4OofPrediction[],
): { readonly deltas: readonly number[]; readonly alignedRows: number } {
  const baselineByRow = new Map(baseline.map((item) => [item.rowId, item]));
  const bySeason = new Map<string, number[]>();
  let alignedRows = 0;
  for (const item of candidate) {
    const other = baselineByRow.get(item.rowId);
    if (!other) continue;
    alignedRows += 1;
    const delta = Math.abs(item.actual - item.predicted) - Math.abs(other.actual - other.predicted);
    bySeason.set(item.season, [...(bySeason.get(item.season) ?? []), delta]);
  }
  const deltas = [...bySeason.keys()].sort().map((season) => mean(bySeason.get(season)!));
  return { deltas, alignedRows };
}

function comparison(
  target: string,
  role: string,
  candidateId: string,
  baselineId: string,
  candidateRows: readonly Phase4OofPrediction[],
  baselineRows: readonly Phase4OofPrediction[],
): Phase4PairedComparison {
  const { deltas, alignedRows } = pairedSeasonDeltas(candidateRows, baselineRows);
  const seasonBlock95Ci = seasonBlockInterval(deltas, PHASE4_CONFIG.seed, PHASE4_CONFIG.bootstrapReplicates);
  // Anything that is not a confidence interval strictly on one side of zero is
  // declared indistinguishable — including the degenerate cases where there is
  // no interval at all: no aligned season, or too few season blocks for a
  // block bootstrap to mean anything. Absence of evidence never becomes
  // evidence of equivalence in favour of the model.
  const outcome: PairedOutcome =
    seasonBlock95Ci.lower === null || seasonBlock95Ci.upper === null
      ? "INDISTINGUISHABLE"
      : seasonBlock95Ci.upper < 0
        ? "CANDIDATE_LOWER_ERROR"
        : seasonBlock95Ci.lower > 0
          ? "BASELINE_LOWER_ERROR"
          : "INDISTINGUISHABLE";
  return {
    target,
    role,
    candidateId,
    baselineId,
    alignedRows,
    seasonBlocks: deltas.length,
    meanPairedAbsoluteErrorDelta: deltas.length > 0 ? mean(deltas) : null,
    seasonBlock95Ci,
    method: PHASE4_CONFIG.bootstrapMethod,
    outcome,
  };
}

export function selectPhase4RoleVerdicts(input: Phase4SelectionInput): Phase4SelectionResult {
  const oofByCandidate = new Map<string, Phase4OofPrediction[]>();
  for (const item of input.oof) {
    const key = `${item.target}|${item.role}|${item.candidateId}`;
    oofByCandidate.set(key, [...(oofByCandidate.get(key) ?? []), item]);
  }
  const rowsOf = (target: string, role: string, candidateId: string): Phase4OofPrediction[] =>
    oofByCandidate.get(`${target}|${role}|${candidateId}`) ?? [];

  const perRole = input.targets.flatMap((target) =>
    input.roles.map((role) => {
      const gatingFamily = input.gatingFamilyByRole.get(`${target}|${role}`);
      if (gatingFamily === undefined) throw new Error(`PHASE4_MISSING_GATING_FAMILY:${target}|${role}`);
      const byCandidate = new Map<string, number[]>();
      for (const metric of input.foldMetrics) {
        if (metric.target !== target || metric.role !== role) continue;
        byCandidate.set(metric.candidateId, [...(byCandidate.get(metric.candidateId) ?? []), metric.mae]);
      }
      const ranked = [...byCandidate]
        .map(([candidateId, values]) => ({ candidateId, mae: mean(values) }))
        .sort((a, b) => a.mae - b.mae || a.candidateId.localeCompare(b.candidateId));
      // The bar is the strongest baseline/shrinkage candidate; every model is
      // then compared against that same reference, paired on the same rows.
      const bestBaseline = ranked.find((item) => isBaselineCandidate(item.candidateId)) ?? null;
      const evaluated =
        bestBaseline === null
          ? []
          : ranked
              .filter(
                (item) =>
                  !isBaselineCandidate(item.candidateId) &&
                  candidateFamily(item.candidateId) === gatingFamily,
              )
              .map((model) => ({
                entry: comparison(
                  target,
                  role,
                  model.candidateId,
                  bestBaseline.candidateId,
                  rowsOf(target, role, model.candidateId),
                  rowsOf(target, role, bestBaseline.candidateId),
                ),
                // Resolved for every evaluated candidate, not only when a
                // tie-break needs it: an unmapped family must fail closed even
                // when it is the single winner and no comparator ever runs.
                parameters: familyParameterCount(candidateFamily(model.candidateId), role),
              }));
      return { target, role, gatingFamily, bestBaseline, evaluated };
    }),
  );

  // Preregistered regression rule: a candidate that loses the paired comparison
  // in ANY role of a target is not promotable in ANY role of it, however well
  // it does where it wins.
  const vetoRolesByCandidate = new Map<string, string[]>();
  for (const item of perRole) {
    for (const { entry } of item.evaluated) {
      if (entry.outcome !== "BASELINE_LOWER_ERROR") continue;
      const key = `${entry.target}|${entry.candidateId}`;
      vetoRolesByCandidate.set(key, [...(vetoRolesByCandidate.get(key) ?? []), entry.role]);
    }
  }

  const verdicts = perRole.map(({ target, role, gatingFamily, bestBaseline, evaluated }): Phase4RoleSelection => {
    const base = { target, role, gatingFamily, bestBaseline: bestBaseline?.candidateId ?? null };
    const goalkeeperGated = isGoalkeeperFamily(gatingFamily);
    if (!input.eligible.has(`${target}|${role}`) || bestBaseline === null || evaluated.length === 0) {
      return {
        ...base,
        verdict: "NO_VERDICT",
        selected: null,
        // A goalkeeper-gated role that produced nothing failed its ladder, not
        // the pooled guard — naming the pooled one would send a reader to the
        // wrong number.
        reasonCode: goalkeeperGated
          ? "GOALKEEPER_LADDER_SAMPLE_GUARD_FAILED"
          : "SAMPLE_GUARD_OR_EVIDENCE_FAILED",
        regressionVetoRoles: [],
        selectedComparison: null,
      };
    }

    const winners = evaluated
      .filter((item) => item.entry.outcome === "CANDIDATE_LOWER_ERROR")
      .map((item) => ({
        ...item,
        vetoRoles: vetoRolesByCandidate.get(`${target}|${item.entry.candidateId}`) ?? [],
      }));
    const promotable = winners
      .filter((item) => item.vetoRoles.length === 0)
      // Strongest paired evidence first, then the preregistered tie-break
      // order — lower complexity, higher coverage — and finally the candidate
      // id, so identical evidence always yields the same choice.
      .sort(
        (a, b) =>
          a.entry.meanPairedAbsoluteErrorDelta! - b.entry.meanPairedAbsoluteErrorDelta! ||
          a.parameters - b.parameters ||
          b.entry.alignedRows - a.entry.alignedRows ||
          a.entry.candidateId.localeCompare(b.entry.candidateId),
      );

    if (promotable.length > 0) {
      const chosen = promotable[0]!.entry;
      return {
        ...base,
        // A role-specific family selected in its own role is exactly the
        // verdict the protocol has always declared for this case and never had
        // a family able to produce.
        verdict: goalkeeperGated ? "SCOUTING_ROLE_SPECIFIC_MODEL_SELECTED" : "SCOUTING_MODEL_SELECTED",
        selected: chosen.candidateId,
        reasonCode: "PAIRED_SEASON_BLOCK_95CI_EXCLUDES_ZERO_SCOUTING_ONLY",
        regressionVetoRoles: [],
        selectedComparison: chosen,
      };
    }
    if (winners.length > 0) {
      return {
        ...base,
        verdict: "BASELINE_RETAINED",
        selected: bestBaseline.candidateId,
        reasonCode: "ROLE_REGRESSION_VETO",
        regressionVetoRoles: [...new Set(winners.flatMap((item) => item.vetoRoles))].sort(),
        selectedComparison: null,
      };
    }
    return {
      ...base,
      verdict: "BASELINE_RETAINED",
      selected: bestBaseline.candidateId,
      reasonCode: evaluated.some(({ entry }) => entry.outcome === "BASELINE_LOWER_ERROR")
        ? "BASELINE_LOWER_PAIRED_ERROR"
        : "INDISTINGUISHABLE_TIE_BREAK_BASELINE_OR_SHRINKAGE",
      regressionVetoRoles: [],
      selectedComparison: null,
    };
  });

  return { comparisons: perRole.flatMap((item) => item.evaluated.map(({ entry }) => entry)), verdicts };
}

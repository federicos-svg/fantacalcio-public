import { describe, expect, it } from "vitest";
import {
  MIN_SEASON_BLOCKS_FOR_INTERVAL,
  candidateFamily,
  isBaselineCandidate,
  pairedSeasonDeltas,
  seasonBlockInterval,
  selectPhase4RoleVerdicts,
  type Phase4FoldMetric,
  type Phase4OofPrediction,
} from "../src/phase4Selection.js";
import { MODELABLE_SEASONS, PHASE4_CONFIG, type Phase4Role } from "../src/phase4Protocol.js";

// Six blocks: one more than `MIN_SEASON_BLOCKS_FOR_INTERVAL`, so every case
// below is decided by the evidence it sets up and not by the minimum-blocks
// guard. The count is a property of the fixture, never of a rule under test.
const SEASONS = ["2019_20", "2020_21", "2021_22", "2022_23", "2023_24", "2024_25"] as const;
const BASELINE = "baseline_shrinkage:k=3";
const MODEL = "pooled_regularized_role:lambda=1";
const OTHER_MODEL = "pooled_regularized_role:lambda=10";

/**
 * OOF rows whose absolute error is exactly `errorPerSeason[i]` on every row of
 * season i. `actual` is 0 throughout, so |actual - predicted| is the error the
 * case under test wants — no arithmetic hidden in the fixture.
 *
 * `errorPerSeason` cycles when it is shorter than `SEASONS`, so a case states
 * its per-season error pattern once and the fixture spans however many season
 * blocks the interval guard needs. A flat pattern stays flat; an alternating
 * one keeps alternating.
 */
function rows(
  target: string,
  role: string,
  candidateId: string,
  errorPerSeason: readonly number[],
  rowsPerSeason = 2,
): Phase4OofPrediction[] {
  return SEASONS.flatMap((season, seasonIndex) =>
    Array.from({ length: rowsPerSeason }, (_unused, rowIndex) => ({
      target,
      role,
      candidateId,
      rowId: `${season}-${rowIndex}`,
      season,
      actual: 0,
      predicted: errorPerSeason[seasonIndex % errorPerSeason.length]!,
    })),
  );
}

function metric(target: string, role: string, candidateId: string, mae: number): Phase4FoldMetric {
  return { target, role, candidateId, mae };
}

function select(input: {
  oof: readonly Phase4OofPrediction[];
  foldMetrics: readonly Phase4FoldMetric[];
  roles?: readonly Phase4Role[];
  eligibleRoles?: readonly Phase4Role[];
}) {
  const roles = input.roles ?? (["D"] as const);
  const targets = ["fantamedia_next"];
  const eligibleRoles = input.eligibleRoles ?? roles;
  return selectPhase4RoleVerdicts({
    targets,
    roles,
    oof: input.oof,
    foldMetrics: input.foldMetrics,
    eligible: new Set(targets.flatMap((target) => eligibleRoles.map((role) => `${target}|${role}`))),
    gatingFamilyByRole: new Map(
      targets.flatMap((target) =>
        roles.map((role) => [`${target}|${role}`, "pooled_regularized_role" as const] as const),
      ),
    ),
  });
}

describe("seasonBlockInterval", () => {
  it("has no interval at all for an empty season set", () => {
    expect(seasonBlockInterval([], PHASE4_CONFIG.seed, 100)).toEqual({ lower: null, upper: null });
  });

  it("is deterministic for a given seed and input", () => {
    const values = [-0.4, 0.1, -0.9, 0.3, -0.2, 0.5];
    const first = seasonBlockInterval(values, PHASE4_CONFIG.seed, 500);
    const second = seasonBlockInterval(values, PHASE4_CONFIG.seed, 500);
    expect(second).toEqual(first);
    expect(first.lower).not.toBeNull();
  });
});

describe("seasonBlockInterval — fail-closed below the minimum season blocks", () => {
  it("preregisters five blocks, and a full run has more than that", () => {
    expect(MIN_SEASON_BLOCKS_FOR_INTERVAL).toBe(5);
    // A run over MODELABLE_SEASONS yields one target season per feature
    // season after the first, minus the two burned in as minimum training
    // history: 7 blocks. The guard must never bind on a real run.
    expect(MODELABLE_SEASONS.length - 1 - 2).toBeGreaterThan(MIN_SEASON_BLOCKS_FOR_INTERVAL);
  });

  it("refuses an interval for 1, 2, 3 and 4 blocks, and grants one at 5", () => {
    // Every value has the same sign and none is zero: without the guard the
    // resample can only ever revisit these numbers, so the percentile interval
    // lands strictly below zero and manufactures CANDIDATE_LOWER_ERROR.
    const block = -1.5;
    for (const count of [1, 2, 3, 4]) {
      const values = Array.from({ length: count }, () => block);
      expect(seasonBlockInterval(values, PHASE4_CONFIG.seed, PHASE4_CONFIG.bootstrapReplicates)).toEqual({
        lower: null,
        upper: null,
      });
    }
    const atMinimum = seasonBlockInterval(
      Array.from({ length: MIN_SEASON_BLOCKS_FOR_INTERVAL }, () => block),
      PHASE4_CONFIG.seed,
      PHASE4_CONFIG.bootstrapReplicates,
    );
    expect(atMinimum.lower).not.toBeNull();
    expect(atMinimum.upper).not.toBeNull();
    expect(atMinimum.upper!).toBeLessThan(0);
  });

  it("refuses varied values too — it is the block count that is missing, not the spread", () => {
    for (const values of [[-0.9], [-0.9, -0.4], [-0.9, -0.4, -1.2], [-0.9, -0.4, -1.2, -0.1]]) {
      expect(seasonBlockInterval(values, PHASE4_CONFIG.seed, PHASE4_CONFIG.bootstrapReplicates)).toEqual({
        lower: null,
        upper: null,
      });
    }
  });

  it("a single block can no longer promote a candidate through the selection rule", () => {
    // The whole point: one season of paired evidence used to reach
    // SCOUTING_MODEL_SELECTED. The selection rule itself is untouched — the
    // comparator already reads a null interval as INDISTINGUISHABLE, so the
    // outcome falls back to the baseline.
    const oneSeason = (candidateId: string, error: number): Phase4OofPrediction[] =>
      Array.from({ length: 2 }, (_unused, rowIndex) => ({
        target: "fantamedia_next",
        role: "D",
        candidateId,
        rowId: `2024_25-${rowIndex}`,
        season: "2024_25",
        actual: 0,
        predicted: error,
      }));
    const { verdicts, comparisons } = select({
      oof: [...oneSeason(BASELINE, 2), ...oneSeason(MODEL, 1)],
      foldMetrics: [
        metric("fantamedia_next", "D", BASELINE, 2),
        metric("fantamedia_next", "D", MODEL, 1),
      ],
    });
    expect(comparisons[0]!.seasonBlocks).toBe(1);
    // The candidate really is better on the point estimate — the refusal is
    // about the uncertainty, not about the direction of the difference.
    expect(comparisons[0]!.meanPairedAbsoluteErrorDelta).toBeCloseTo(-1);
    expect(comparisons[0]!.seasonBlock95Ci).toEqual({ lower: null, upper: null });
    expect(comparisons[0]!.outcome).toBe("INDISTINGUISHABLE");
    expect(verdicts[0]!.verdict).toBe("BASELINE_RETAINED");
    expect(verdicts[0]!.selected).toBe(BASELINE);
    expect(verdicts[0]!.reasonCode).toBe("INDISTINGUISHABLE_TIE_BREAK_BASELINE_OR_SHRINKAGE");
  });
});

describe("pairedSeasonDeltas", () => {
  it("aggregates row-level differences to one value per season block", () => {
    const candidate = rows("fantamedia_next", "D", MODEL, [1, 1, 1, 1]);
    const baseline = rows("fantamedia_next", "D", BASELINE, [2, 2, 2, 2]);
    const paired = pairedSeasonDeltas(candidate, baseline);
    expect(paired.alignedRows).toBe(SEASONS.length * 2);
    expect(paired.deltas).toEqual(SEASONS.map(() => -1));
  });

  it("drops a row only one candidate scored instead of comparing it against nothing", () => {
    const candidate = rows("fantamedia_next", "D", MODEL, [1, 1, 1, 1]);
    const baseline = rows("fantamedia_next", "D", BASELINE, [2, 2, 2, 2]).filter(
      (row) => row.rowId !== "2021_22-1",
    );
    const paired = pairedSeasonDeltas(candidate, baseline);
    expect(paired.alignedRows).toBe(SEASONS.length * 2 - 1);
    expect(paired.deltas).toHaveLength(SEASONS.length);
  });
});

describe("selectPhase4RoleVerdicts", () => {
  it("selects a model whose paired season-block CI is entirely below zero", () => {
    const oof = [
      ...rows("fantamedia_next", "D", BASELINE, [2, 2, 2, 2]),
      ...rows("fantamedia_next", "D", MODEL, [1, 1, 1, 1]),
    ];
    const foldMetrics = [
      metric("fantamedia_next", "D", BASELINE, 2),
      metric("fantamedia_next", "D", MODEL, 1),
    ];
    const { verdicts, comparisons } = select({ oof, foldMetrics });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]!.verdict).toBe("SCOUTING_MODEL_SELECTED");
    expect(verdicts[0]!.selected).toBe(MODEL);
    expect(verdicts[0]!.bestBaseline).toBe(BASELINE);
    expect(verdicts[0]!.reasonCode).toBe("PAIRED_SEASON_BLOCK_95CI_EXCLUDES_ZERO_SCOUTING_ONLY");
    expect(comparisons[0]!.outcome).toBe("CANDIDATE_LOWER_ERROR");
    expect(comparisons[0]!.meanPairedAbsoluteErrorDelta).toBeCloseTo(-1);
    expect(comparisons[0]!.seasonBlock95Ci.upper!).toBeLessThan(0);
    expect(comparisons[0]!.method).toBe(PHASE4_CONFIG.bootstrapMethod);
  });

  it("retains the baseline when a lower mean MAE is not distinguishable from zero", () => {
    // The model wins on the naked aggregate (mean MAE 1.0 vs 1.5) but its
    // per-season paired differences straddle zero — exactly the case the old
    // mean-MAE comparison promoted and the protocol refuses.
    const oof = [
      ...rows("fantamedia_next", "D", BASELINE, [1.5, 1.5, 1.5, 1.5]),
      ...rows("fantamedia_next", "D", MODEL, [0.5, 2.5, 0.5, 2.5]),
    ];
    const foldMetrics = [
      metric("fantamedia_next", "D", BASELINE, 1.5),
      metric("fantamedia_next", "D", MODEL, 1),
    ];
    const { verdicts, comparisons } = select({ oof, foldMetrics });
    expect(comparisons[0]!.outcome).toBe("INDISTINGUISHABLE");
    expect(verdicts[0]!.verdict).toBe("BASELINE_RETAINED");
    expect(verdicts[0]!.selected).toBe(BASELINE);
    expect(verdicts[0]!.reasonCode).toBe("INDISTINGUISHABLE_TIE_BREAK_BASELINE_OR_SHRINKAGE");
    expect(verdicts[0]!.selectedComparison).toBeNull();
  });

  it("refuses a candidate in the role it wins when it regresses in another role of the same target", () => {
    const oof = [
      ...rows("fantamedia_next", "D", BASELINE, [2, 2, 2, 2]),
      ...rows("fantamedia_next", "D", MODEL, [1, 1, 1, 1]),
      ...rows("fantamedia_next", "A", BASELINE, [1, 1, 1, 1]),
      ...rows("fantamedia_next", "A", MODEL, [3, 3, 3, 3]),
    ];
    const foldMetrics = [
      metric("fantamedia_next", "D", BASELINE, 2),
      metric("fantamedia_next", "D", MODEL, 1),
      metric("fantamedia_next", "A", BASELINE, 1),
      metric("fantamedia_next", "A", MODEL, 3),
    ];
    const { verdicts } = select({ oof, foldMetrics, roles: ["D", "A"] });
    const defender = verdicts.find((item) => item.role === "D")!;
    const forward = verdicts.find((item) => item.role === "A")!;
    expect(defender.verdict).toBe("BASELINE_RETAINED");
    expect(defender.reasonCode).toBe("ROLE_REGRESSION_VETO");
    expect(defender.regressionVetoRoles).toEqual(["A"]);
    expect(forward.verdict).toBe("BASELINE_RETAINED");
    expect(forward.reasonCode).toBe("BASELINE_LOWER_PAIRED_ERROR");
  });

  it("reports NO_VERDICT for a role the sample guard rejected, whatever the metrics say", () => {
    const oof = [
      ...rows("fantamedia_next", "D", BASELINE, [2, 2, 2, 2]),
      ...rows("fantamedia_next", "D", MODEL, [1, 1, 1, 1]),
    ];
    const foldMetrics = [
      metric("fantamedia_next", "D", BASELINE, 2),
      metric("fantamedia_next", "D", MODEL, 1),
    ];
    const { verdicts } = select({ oof, foldMetrics, roles: ["D"], eligibleRoles: [] });
    expect(verdicts[0]!.verdict).toBe("NO_VERDICT");
    expect(verdicts[0]!.selected).toBeNull();
    expect(verdicts[0]!.reasonCode).toBe("SAMPLE_GUARD_OR_EVIDENCE_FAILED");
  });

  it("reports NO_VERDICT when no model candidate was evaluated at all", () => {
    const { verdicts } = select({
      oof: rows("fantamedia_next", "D", BASELINE, [2, 2, 2, 2]),
      foldMetrics: [metric("fantamedia_next", "D", BASELINE, 2)],
    });
    expect(verdicts[0]!.verdict).toBe("NO_VERDICT");
    expect(verdicts[0]!.bestBaseline).toBe(BASELINE);
  });

  it("breaks a tie between two equally-strong winners deterministically", () => {
    const oof = [
      ...rows("fantamedia_next", "D", BASELINE, [2, 2, 2, 2]),
      ...rows("fantamedia_next", "D", OTHER_MODEL, [1, 1, 1, 1]),
      ...rows("fantamedia_next", "D", MODEL, [1, 1, 1, 1]),
    ];
    const foldMetrics = [
      metric("fantamedia_next", "D", BASELINE, 2),
      metric("fantamedia_next", "D", OTHER_MODEL, 1),
      metric("fantamedia_next", "D", MODEL, 1),
    ];
    const first = select({ oof, foldMetrics });
    const second = select({ oof: [...oof].reverse(), foldMetrics: [...foldMetrics].reverse() });
    expect(first.verdicts[0]!.selected).toBe(MODEL);
    expect(second.verdicts[0]!.selected).toBe(first.verdicts[0]!.selected);
  });

  it("prefers the candidate with the stronger paired evidence, not the alphabetical one", () => {
    const oof = [
      ...rows("fantamedia_next", "D", BASELINE, [3, 3, 3, 3]),
      ...rows("fantamedia_next", "D", MODEL, [2, 2, 2, 2]),
      ...rows("fantamedia_next", "D", OTHER_MODEL, [1, 1, 1, 1]),
    ];
    const foldMetrics = [
      metric("fantamedia_next", "D", BASELINE, 3),
      metric("fantamedia_next", "D", MODEL, 2),
      metric("fantamedia_next", "D", OTHER_MODEL, 1),
    ];
    expect(select({ oof, foldMetrics }).verdicts[0]!.selected).toBe(OTHER_MODEL);
  });

  it("treats a comparison with no aligned season as indistinguishable, never as a win", () => {
    const baseline = rows("fantamedia_next", "D", BASELINE, [2, 2, 2, 2]);
    const model = rows("fantamedia_next", "D", MODEL, [0, 0, 0, 0]).map((row) => ({
      ...row,
      rowId: `unpaired-${row.rowId}`,
    }));
    const { verdicts, comparisons } = select({
      oof: [...baseline, ...model],
      foldMetrics: [
        metric("fantamedia_next", "D", BASELINE, 2),
        metric("fantamedia_next", "D", MODEL, 0),
      ],
    });
    expect(comparisons[0]!.alignedRows).toBe(0);
    expect(comparisons[0]!.meanPairedAbsoluteErrorDelta).toBeNull();
    expect(comparisons[0]!.outcome).toBe("INDISTINGUISHABLE");
    expect(verdicts[0]!.verdict).toBe("BASELINE_RETAINED");
  });
});

describe("candidate classification", () => {
  it("recognises baseline candidates by their declared prefix", () => {
    expect(isBaselineCandidate(BASELINE)).toBe(true);
    expect(isBaselineCandidate(MODEL)).toBe(false);
  });

  it("fails closed on a model family it cannot map to a parameter count", () => {
    expect(() => candidateFamily("mystery_family:v1")).toThrow(/UNMAPPED_CANDIDATE_FAMILY/);
    expect(candidateFamily(MODEL)).toBe("pooled_regularized_role");
  });
});

describe("fail-closed on an unmapped candidate family", () => {
  // The complexity tie-break needs a parameter count. Resolving it only inside
  // the comparator would let a single unmapped winner through untouched, since
  // a one-element sort never calls one.
  it("throws even when the unmapped candidate is the only winner", () => {
    const unmapped = "mystery_family:v1";
    expect(() =>
      select({
        oof: [
          ...rows("fantamedia_next", "D", BASELINE, [2, 2, 2, 2]),
          ...rows("fantamedia_next", "D", unmapped, [1, 1, 1, 1]),
        ],
        foldMetrics: [
          metric("fantamedia_next", "D", BASELINE, 2),
          metric("fantamedia_next", "D", unmapped, 1),
        ],
      }),
    ).toThrow(/PHASE4_UNMAPPED_CANDIDATE_FAMILY/);
  });
});

describe("gating family — role P answers to the goalkeeper ladder, not the pooled family", () => {
  const GK = "goalkeeper_specific_core:lambda=1";
  const TARGET = "fantamedia_next";

  function selectP(input: {
    oof: readonly Phase4OofPrediction[];
    foldMetrics: readonly Phase4FoldMetric[];
    gatingFamily?: keyof typeof PHASE4_CONFIG.families;
    eligible?: boolean;
  }) {
    return selectPhase4RoleVerdicts({
      targets: [TARGET],
      roles: ["P"],
      oof: input.oof,
      foldMetrics: input.foldMetrics,
      eligible: new Set((input.eligible ?? true) ? [`${TARGET}|P`] : []),
      gatingFamilyByRole: new Map([[`${TARGET}|P`, input.gatingFamily ?? "goalkeeper_specific_core"]]),
    });
  }

  // The goalkeeper model beats the baseline; the pooled ridge looks even better
  // but is not the family whose guard was cleared for P.
  const oof = [
    ...rows(TARGET, "P", BASELINE, [1, 1, 1, 1]),
    ...rows(TARGET, "P", GK, [0.5, 0.5, 0.5, 0.5]),
    ...rows(TARGET, "P", MODEL, [0.1, 0.1, 0.1, 0.1]),
  ];
  const foldMetrics = [
    metric(TARGET, "P", BASELINE, 1),
    metric(TARGET, "P", GK, 0.5),
    metric(TARGET, "P", MODEL, 0.1),
  ];

  it("selects the ladder family and reports the role-specific verdict", () => {
    const { verdicts } = selectP({ oof, foldMetrics });
    expect(verdicts[0]).toMatchObject({
      verdict: "SCOUTING_ROLE_SPECIFIC_MODEL_SELECTED",
      selected: GK,
      gatingFamily: "goalkeeper_specific_core",
      reasonCode: "PAIRED_SEASON_BLOCK_95CI_EXCLUDES_ZERO_SCOUTING_ONLY",
    });
  });

  it("never lets a candidate of another family win the role, however good its error", () => {
    const { verdicts, comparisons } = selectP({ oof, foldMetrics });
    expect(verdicts[0]?.selected).not.toBe(MODEL);
    expect(comparisons.some((entry) => entry.candidateId === MODEL)).toBe(false);
  });

  it("keeps the pooled verdict wording for a pooled-gated role", () => {
    const { verdicts } = selectPhase4RoleVerdicts({
      targets: [TARGET],
      roles: ["D"],
      oof: [...rows(TARGET, "D", BASELINE, [1, 1, 1, 1]), ...rows(TARGET, "D", MODEL, [0.5, 0.5, 0.5, 0.5])],
      foldMetrics: [metric(TARGET, "D", BASELINE, 1), metric(TARGET, "D", MODEL, 0.5)],
      eligible: new Set([`${TARGET}|D`]),
      gatingFamilyByRole: new Map([[`${TARGET}|D`, "pooled_regularized_role"]]),
    });
    expect(verdicts[0]).toMatchObject({
      verdict: "SCOUTING_MODEL_SELECTED",
      gatingFamily: "pooled_regularized_role",
    });
  });

  it("names the ladder, not the pooled guard, when a goalkeeper-gated role has no verdict", () => {
    const { verdicts } = selectP({ oof, foldMetrics, eligible: false });
    expect(verdicts[0]).toMatchObject({
      verdict: "NO_VERDICT",
      selected: null,
      gatingFamily: "goalkeeper_specific_core",
      reasonCode: "GOALKEEPER_LADDER_SAMPLE_GUARD_FAILED",
    });
  });

  it("has no verdict when the gating family fielded no candidate at all", () => {
    const { verdicts } = selectP({
      oof: rows(TARGET, "P", BASELINE, [1, 1, 1, 1]),
      foldMetrics: [metric(TARGET, "P", BASELINE, 1)],
    });
    expect(verdicts[0]).toMatchObject({
      verdict: "NO_VERDICT",
      reasonCode: "GOALKEEPER_LADDER_SAMPLE_GUARD_FAILED",
    });
  });

  it("fails closed when a role has no gating family at all", () => {
    expect(() =>
      selectPhase4RoleVerdicts({
        targets: [TARGET],
        roles: ["P"],
        oof,
        foldMetrics,
        eligible: new Set([`${TARGET}|P`]),
        gatingFamilyByRole: new Map(),
      }),
    ).toThrow("PHASE4_MISSING_GATING_FAMILY:fantamedia_next|P");
  });

  it("maps every goalkeeper ladder candidate to its own family", () => {
    for (const family of PHASE4_CONFIG.goalkeeperLadder) {
      expect(candidateFamily(`${family}:lambda=10`)).toBe(family);
    }
    expect(() => candidateFamily("goalkeeper_specific_unknown:lambda=1")).toThrow(
      "PHASE4_UNMAPPED_CANDIDATE_FAMILY",
    );
  });
});

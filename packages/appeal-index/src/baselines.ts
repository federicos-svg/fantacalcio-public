// Simple baselines — the bar every model must clear. Deliberately includes
// a shrinkage ("Marcel"-style) baseline, the hardest to beat in a small-n,
// high-variance domain like this one: weights a player's own recent form
// against the role-average prior, trusting the player's own history more as
// more seasons are observed.

import type { FeatureRow, FeatureVector, Role, TargetName, Trainer } from "./types.js";
import { PHASE4_CONFIG } from "./phase4Protocol.js";
import { mean } from "./stats.js";

function targetLagFeature(target: TargetName): keyof FeatureVector {
  return target === "fantamediaNext" ? "fantamediaLag1" : "presenzeLag1";
}

function targetRollingFeature(target: TargetName): keyof FeatureVector {
  return target === "fantamediaNext" ? "fantamediaRollingMean3" : "presenzeRollingMean3";
}

function roleFromFeatures(f: FeatureVector): Role {
  if (f.roleP === 1) return "P";
  if (f.roleD === 1) return "D";
  if (f.roleC === 1) return "C";
  return "A";
}

/** B0 — predict this season's next value as identical to last season's. */
export const naiveLastBaseline: Trainer = {
  name: "baseline_naive_last",
  fit(_trainRows, target) {
    const lagKey = targetLagFeature(target);
    return { name: "baseline_naive_last", predict: (features) => features[lagKey] };
  },
};

/** B1 — predict the player's own rolling mean over the last (up to) 3 observed seasons. */
export const rollingMean3Baseline: Trainer = {
  name: "baseline_rolling_mean_3",
  fit(_trainRows, target) {
    const key = targetRollingFeature(target);
    return { name: "baseline_rolling_mean_3", predict: (features) => features[key] };
  },
};

function fitRoleMeans(trainRows: readonly FeatureRow[], target: TargetName): Record<Role, number> {
  const byRole: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
  for (const row of trainRows) byRole[row.role].push(row.targets[target]);
  const overall = mean(trainRows.map((r) => r.targets[target]));
  const out = {} as Record<Role, number>;
  for (const role of Object.keys(byRole) as Role[]) {
    out[role] = byRole[role].length > 0 ? mean(byRole[role]) : overall;
  }
  return out;
}

/** B2 — ignore all player-specific history; predict the role's mean over the train set. */
export const roleMeanBaseline: Trainer = {
  name: "baseline_role_mean",
  fit(trainRows, target) {
    if (trainRows.length === 0) throw new Error("roleMeanBaseline.fit: no training rows");
    const roleMeans = fitRoleMeans(trainRows, target);
    return { name: "baseline_role_mean", predict: (features) => roleMeans[roleFromFeatures(features)] };
  },
};

/**
 * B3 — shrinkage between own recent form and role prior, weighted by career
 * length so far: `w = n / (n + k)`, so a rookie (n=1) leans almost entirely on
 * the role prior and a 6-season veteran almost entirely on their own recent
 * form.
 *
 * `k` is a preregistered hyperparameter, not a constant. The Phase 4 protocol
 * declares a sweep (`PHASE4_CONFIG.hyperparameters.shrinkageK`) and every
 * declared value has to compete as its own candidate — a single hardcoded `k`
 * would make the declared sweep a fiction.
 */
export function shrinkageBaselineTrainer(k: number): Trainer {
  if (!Number.isFinite(k) || k <= 0) {
    throw new Error(`shrinkageBaselineTrainer: shrinkage k must be finite and positive, got '${k}'`);
  }
  const name = `baseline_shrinkage:k=${k}`;
  return {
    name,
    fit(trainRows, target) {
      if (trainRows.length === 0) throw new Error(`${name}.fit: no training rows`);
      const roleMeans = fitRoleMeans(trainRows, target);
      const rollingKey = targetRollingFeature(target);
      return {
        name,
        predict: (features) => {
          const n = features.nSeasonsObserved;
          const w = n / (n + k);
          const own = features[rollingKey];
          const prior = roleMeans[roleFromFeatures(features)];
          return w * own + (1 - w) * prior;
        },
      };
    },
  };
}

/** One shrinkage candidate per preregistered `k`, in declaration order. */
export const SHRINKAGE_BASELINE_TRAINERS: readonly Trainer[] =
  PHASE4_CONFIG.hyperparameters.shrinkageK.map(shrinkageBaselineTrainer);

export const BASELINE_TRAINERS: readonly Trainer[] = [
  naiveLastBaseline,
  rollingMean3Baseline,
  roleMeanBaseline,
  ...SHRINKAGE_BASELINE_TRAINERS,
];

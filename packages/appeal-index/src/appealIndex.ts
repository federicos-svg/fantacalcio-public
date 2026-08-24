// Appeal-index component composition — PURE.
//
// Deliberately NOT one opaque "appetibilità" score: only the two ML-
// validated targets (fantamedia_next, presenze_next) back
// `appetibilita_base`/`affidabilita`. The other six components are
// transparent, backward-looking heuristics over historical features —
// explicitly tagged `validated: false` so nobody downstream mistakes a
// heuristic for a walk-forward-validated prediction. See
// docs/data/APPEAL_INDEX_OFFLINE_ML_CONTRACT.md "Rischio indice bello ma
// inutile in asta".

import type { FeatureVector } from "./types.js";

export interface AppealIndexComponent {
  readonly value: number | null;
  readonly validated: boolean;
  readonly availability: "available" | "missing_input" | "passive_prediction";
  readonly method: string;
}

export interface AppealIndexComponents {
  readonly appetibilitaBase: AppealIndexComponent;
  readonly affidabilita: AppealIndexComponent;
  readonly rischio: AppealIndexComponent;
  readonly upside: AppealIndexComponent;
  readonly continuitaVoto: AppealIndexComponent;
  readonly bonusPotential: AppealIndexComponent;
  readonly modificatoreRelevance: AppealIndexComponent;
  readonly ruoloRarita: AppealIndexComponent;
}

export interface ComposeAppealIndexInput {
  /** The already-built feature vector of one player-season. Deliberately the
   *  vector and not a whole `FeatureRow`: at serve time there is no observed
   *  target for the season being predicted, and a row carrying invented
   *  targets just to satisfy a type would be exactly the kind of fabricated
   *  data this package refuses. */
  readonly features: FeatureVector;
  /** Passive prediction from the configured diagnostic comparator for this target. */
  readonly predictedFantamediaNext: number;
  readonly predictedPresenzeNext: number;
  /** Same-role fantamediaNext values from the TRAIN fold only (never test/future rows) — used only for a relative rarity percentile. */
  readonly roleCohortFantamediaNext: readonly number[];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function percentileRank(value: number, cohort: readonly number[]): number {
  if (cohort.length === 0) return 0.5;
  const below = cohort.filter((v) => v <= value).length;
  return below / cohort.length;
}

export function composeAppealIndexComponents(input: ComposeAppealIndexInput): AppealIndexComponents {
  const { features: f, predictedFantamediaNext, predictedPresenzeNext, roleCohortFantamediaNext } = input;
  const finite = (value: number): boolean => Number.isFinite(value);

  const appetibilitaBase: AppealIndexComponent = {
    value: finite(predictedFantamediaNext) ? predictedFantamediaNext : null,
    validated: false,
    availability: finite(predictedFantamediaNext) ? "passive_prediction" : "missing_input",
    method: "predizione passiva fantamedia_next; nessuna validazione reale o champion",
  };

  const affidabilita: AppealIndexComponent = {
    value: finite(predictedPresenzeNext) ? clamp01(predictedPresenzeNext / 38) : null,
    validated: false,
    availability: finite(predictedPresenzeNext) ? "passive_prediction" : "missing_input",
    method: "predizione passiva presenze_next/38; nessuna validazione reale o champion",
  };

  const continuitaVoto: AppealIndexComponent = {
    value: finite(f.volatilitaVotoLastObserved) ? 1 / (1 + f.volatilitaVotoLastObserved) : null,
    validated: false,
    availability: finite(f.volatilitaVotoLastObserved) ? "available" : "missing_input",
    method: "euristica storica: inverso della volatilità del voto nell'ultima stagione osservata",
  };

  const bonusPotential: AppealIndexComponent = {
    value: f.presenzeRollingMean3 > 0 ? (f.golFattiRollingMean3 + f.assistRollingMean3) / f.presenzeRollingMean3 : 0,
    validated: false,
    availability: "available",
    method: "euristica storica: (gol+assist medi) / presenze medie, ultime stagioni osservate",
  };

  const upside: AppealIndexComponent = {
    value:
      finite(f.fantamediaLag1) && finite(f.fantamediaRollingMean3)
        ? Math.max(0, f.fantamediaLag1 - f.fantamediaRollingMean3)
        : null,
    validated: false,
    availability:
      finite(f.fantamediaLag1) && finite(f.fantamediaRollingMean3)
        ? "available"
        : "missing_input",
    method: "euristica storica: momentum (ultima stagione vs media storica), mai clippato sotto 0",
  };

  const rischio: AppealIndexComponent = {
    value: finite(f.volatilitaVotoLastObserved)
      ? clamp01(
          0.5 * (1 - clamp01(f.presenzeRollingMean3 / 38)) +
            0.3 * clamp01(f.volatilitaVotoLastObserved / 3) +
            0.2 * clamp01(1 / (1 + f.nSeasonsObserved)),
        )
      : null,
    validated: false,
    availability: finite(f.volatilitaVotoLastObserved) ? "available" : "missing_input",
    method:
      "euristica storica: combinazione pesata di (1 - affidabilità storica) + volatilità voto + brevità dello storico",
  };

  const modificatoreRelevance: AppealIndexComponent = {
    value: f.roleD === 1 || f.roleP === 1 ? 1 : 0,
    validated: false,
    availability: "available",
    method:
      "flag di ruolo: esposizione al 'modificatore difesa' (docs/DECISIONS.md) — NON il Modifier Model reale (Batch 4/decision_promoted)",
  };

  const ruoloRarita: AppealIndexComponent = {
    value: finite(predictedFantamediaNext)
      ? 1 - percentileRank(predictedFantamediaNext, roleCohortFantamediaNext)
      : null,
    validated: false,
    availability: finite(predictedFantamediaNext) ? "available" : "missing_input",
    method: "euristica: percentile inverso della predizione entro la coorte di ruolo (solo dati di train)",
  };

  return {
    appetibilitaBase,
    affidabilita,
    rischio,
    upside,
    continuitaVoto,
    bonusPotential,
    modificatoreRelevance,
    ruoloRarita,
  };
}

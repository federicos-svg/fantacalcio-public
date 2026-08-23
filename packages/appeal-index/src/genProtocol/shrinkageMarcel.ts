// GEN-PROTOCOL-A §D.2 — FAM-1, shrinkage gerarchico stile Marcel. PURO.
//
// La famiglia, per intero: «media pesata per recency delle stagioni osservate
// del giocatore, shrunk verso la media di ruolo del train. Interni:
// k ∈ {5, 10, 20, 40}, half-life ∈ {1,5; 3; ∞}.»
//
// Perche' e' il primo challenger e non un dettaglio: e' l'ipotesi nulla
// interessante del dominio. Se FAM-2 e FAM-4 non la battono fuori dalla regola
// 1-SE, la conclusione preregistrata e' che il segnale sta tutto nella
// persistenza del giocatore piu' un pavimento di ruolo — e va scritta, non
// aggirata con una famiglia piu' ricca (§D.5, §B.4).
//
// L'artefatto e' serializzabile per la stessa ragione di
// `FittedRidgeParameters` (`../models/fittedRidge.ts`, di cui questo modulo
// imita la forma): §D.8 punto 4 conta «nessun artefatto serializzabile» fra le
// quattro rotture d'impianto del ruolo P, e un modello che al serving va
// rifittato e' un modello che al serving puo' rispondere diverso.

import { GEN_ROLES, type GenRole, type GenSeason } from "./genTypes.js";
import { recencyWeight } from "./foldScheme.js";

/** Griglia interna di `k` (§D.2, FAM-1). */
export const MARCEL_K_GRID: readonly number[] = [5, 10, 20, 40] as const;

/** Griglia interna dell'half-life (§D.2, FAM-1) — la stessa di §B.1. */
export const MARCEL_HALF_LIFE_GRID: readonly number[] = [1.5, 3, Number.POSITIVE_INFINITY] as const;

export interface MarcelHyperparameters {
  /** Forza dello shrinkage verso la media di ruolo: `n_eff/(n_eff + k)`. */
  readonly k: number;
  /** Half-life del peso di recency, in anni. `Infinity` = pesi uniformi. */
  readonly halfLife: number;
}

/** La griglia interna completa di FAM-1: 4 × 3 = 12 punti, in ordine di enumerazione. */
export const MARCEL_GRID: readonly MarcelHyperparameters[] = MARCEL_K_GRID.flatMap((k) =>
  MARCEL_HALF_LIFE_GRID.map((halfLife) => ({ k, halfLife })),
);

/** Una stagione osservata di un giocatore: il valore del bersaglio e il suo volume. */
export interface MarcelObservation {
  readonly season: GenSeason;
  /** Il valore osservato del bersaglio in quella stagione (fantamedia, presenze, …). */
  readonly value: number;
  /** Presenze valide della stagione: il peso di volume di §D.2 («× peso presenze»). */
  readonly presences: number;
}

/** Una riga di training: un giocatore, il suo ruolo, e la stagione osservata. */
export interface MarcelTrainingRow {
  readonly playerKey: string;
  readonly role: GenRole;
  readonly season: GenSeason;
  readonly value: number;
  readonly presences: number;
}

export interface FittedMarcelParameters {
  readonly artifactVersion: "gen-marcel-parameters-v1";
  readonly k: number;
  readonly halfLife: number;
  /**
   * L'ultima stagione del training del fold: l'ancora di `Δanni` nei pesi di
   * recency (§B.1). Sta nell'artefatto perche' senza di essa i pesi non sono
   * ricostruibili, e un artefatto non ricostruibile non e' un artefatto.
   */
  readonly referenceSeason: GenSeason;
  /**
   * Media del bersaglio per ruolo sul TRAIN, il bersaglio dello shrinkage.
   *
   * Media aritmetica non pesata delle righe-stagione del ruolo: e' la lettura
   * letterale di `M_r` in B0-T2 (§B.3, «fantamedia media del ruolo nel
   * training»). Un ruolo assente dal train non ha media e non compare qui —
   * `predictMarcel` allora fallisce invece di inventare un pavimento.
   */
  readonly roleMeans: Readonly<Partial<Record<GenRole, number>>>;
  readonly trainingRowCount: number;
  readonly roleRowCounts: Readonly<Partial<Record<GenRole, number>>>;
}

/**
 * Fitta FAM-1: le uniche quantita' apprese sono le medie di ruolo del train.
 *
 * `k` e `halfLife` NON si stimano qui: arrivano gia' scelti dal fold interno
 * (§D.2, `internalTuning.ts`). Se li scegliesse questa funzione guardando le
 * righe che le sono state date, il livello interno e quello esterno sarebbero
 * lo stesso livello.
 */
export function fitMarcel(
  trainRows: readonly MarcelTrainingRow[],
  hyperparameters: MarcelHyperparameters,
  referenceSeason: GenSeason,
): FittedMarcelParameters {
  if (trainRows.length === 0) throw new Error("fitMarcel: no training rows");
  if (!Number.isFinite(hyperparameters.k) || hyperparameters.k < 0) {
    throw new Error("fitMarcel: k must be finite and non-negative");
  }
  if (!(hyperparameters.halfLife > 0)) throw new Error("fitMarcel: halfLife must be positive");

  const roleMeans: Partial<Record<GenRole, number>> = {};
  const roleRowCounts: Partial<Record<GenRole, number>> = {};
  for (const role of GEN_ROLES) {
    const values = trainRows.filter((r) => r.role === role).map((r) => r.value);
    if (values.length === 0) continue;
    if (values.some((v) => !Number.isFinite(v))) {
      throw new Error(`fitMarcel: role '${role}' has a non-finite observed value in training`);
    }
    let sum = 0;
    for (const v of values) sum += v;
    roleMeans[role] = sum / values.length;
    roleRowCounts[role] = values.length;
  }

  return {
    artifactVersion: "gen-marcel-parameters-v1",
    k: hyperparameters.k,
    halfLife: hyperparameters.halfLife,
    referenceSeason,
    roleMeans,
    trainingRowCount: trainRows.length,
    roleRowCounts,
  };
}

/** Il dettaglio di una predizione FAM-1 — reso ispezionabile perche' la ricetta finale lo e' (§K). */
export interface MarcelPrediction {
  readonly prediction: number;
  /** `Σ 0,5^{Δ/h} · presenze`: il campione efficace del giocatore. */
  readonly effectiveSample: number;
  /** Media pesata delle stagioni osservate; `NaN` se non ce ne sono. */
  readonly playerMean: number;
  readonly roleMean: number;
  /** `n_eff/(n_eff + k)`: 0 = tutto ruolo, 1 = tutto giocatore. */
  readonly shrinkageWeight: number;
}

/**
 * Predice per un giocatore dalle sue stagioni osservate.
 *
 * Stima = media pesata (recency × presenze) delle stagioni osservate, shrunk
 * verso la media di ruolo del train con `n_eff/(n_eff + k)`.
 *
 * Nessuna stagione osservata -> la media di ruolo, con `shrinkageWeight = 0`.
 * E' il caso del giocatore nuovo, ed e' il motivo per cui la famiglia sa
 * scorare TUTTE le righe: la coverage e' criterio di ammissibilita' (§B.3.2),
 * non una nota a pie' di pagina.
 *
 * Una stagione con `presences = 0` porta peso 0: e' una stagione senza
 * presenze valide, quindi senza valore osservato del bersaglio, non una
 * stagione da zero.
 */
export function predictMarcel(
  parameters: FittedMarcelParameters,
  role: GenRole,
  observations: readonly MarcelObservation[],
): MarcelPrediction {
  const roleMean = parameters.roleMeans[role];
  if (roleMean === undefined) {
    throw new Error(`predictMarcel: role '${role}' has no role mean in the fitted artifact (absent from training)`);
  }

  let weightSum = 0;
  let weightedValueSum = 0;
  for (const obs of observations) {
    if (!Number.isFinite(obs.presences) || obs.presences < 0) {
      throw new Error("predictMarcel: presences must be finite and non-negative");
    }
    if (obs.presences === 0) continue;
    if (!Number.isFinite(obs.value)) {
      throw new Error("predictMarcel: an observation with presences > 0 has a non-finite value");
    }
    const w = recencyWeight(obs.season, parameters.referenceSeason, parameters.halfLife) * obs.presences;
    weightSum += w;
    weightedValueSum += w * obs.value;
  }

  const playerMean = weightSum > 0 ? weightedValueSum / weightSum : NaN;
  const shrinkageWeight = weightSum > 0 ? weightSum / (weightSum + parameters.k) : 0;
  const prediction = weightSum > 0 ? shrinkageWeight * playerMean + (1 - shrinkageWeight) * roleMean : roleMean;

  return { prediction, effectiveSample: weightSum, playerMean, roleMean, shrinkageWeight };
}

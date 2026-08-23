// GEN-PROTOCOL-A §D.2 — FAM-2, elastic net su feature standardizzate. PURO.
//
// La famiglia, per intero: «coordinate descent deterministico, init 0, tol
// 1e-6, max 10.000 iterazioni. Interni: α ∈ {0; 0,5; 1}, λ su griglia log a 21
// punti 10^{−4} → 10^{+1} (passo 10^{0,25}), half-life come FAM-1.»
//
// Perche' proprio questa famiglia, e non qualcosa di piu' ricco: §D.5 lo
// motiva col rapporto n/p — «~130 colonne per D/C/A con n per ruolo fra ~900 e
// ~1.800 righe-target: e' terreno da elastic net, non da modelli profondi». E
// §D.4 le affida un compito preciso: «e' la regolarizzazione (α, λ della
// FAM-2) a decidere che cosa pesa, non un taglio manuale». Togliere feature a
// mano prima del fit annullerebbe la ragione per cui i 93 campi sono stati
// raccolti.
//
// Le righe con `NaN` su una feature del set attivo NON si imputano e NON
// spariscono: escono dal fit e vengono CONTATE (§D.3 «Divieti assoluti»: mai
// `null → 0`, mai una media imputata; §D.7: «l'esclusione silenziosa dalle
// metriche e' vietata»). Il conteggio non e' cortesia: e' l'ingrediente della
// coverage, che §B.3.2 rende criterio di ammissibilita'.
//
// Riuso dichiarato: la standardizzazione e la soglia di varianza nulla
// (`1e-9`) vengono da `../featureMatrix.ts` — la stessa che scala ridge e kNN.
// Una seconda soglia «uguale» sarebbe una soglia che un giorno non lo e' piu'.

import { ZERO_VARIANCE_THRESHOLD, fitColumnStandardizer } from "../featureMatrix.js";

/** Griglia interna di α (§D.2, FAM-2): 0 = ridge puro, 1 = lasso puro. */
export const ELASTIC_NET_ALPHA_GRID: readonly number[] = [0, 0.5, 1] as const;

/** Tolleranza di arresto del coordinate descent (§D.2). */
export const ELASTIC_NET_TOLERANCE = 1e-6;

/** Tetto di iterazioni del coordinate descent (§D.2). */
export const ELASTIC_NET_MAX_ITERATIONS = 10_000;

/**
 * Griglia interna di λ: 21 punti logaritmici da `10^{-4}` a `10^{+1}`, passo
 * `10^{0,25}` (§D.2).
 *
 * 21 e non 20: gli estremi sono entrambi inclusi e `(1 − (−4))/0,25 = 20`
 * intervalli, quindi 21 punti. Il conteggio e' verificato nel test contro un
 * valore atteso scritto a mano, non letto da questa costante.
 */
export const ELASTIC_NET_LAMBDA_GRID: readonly number[] = Array.from({ length: 21 }, (_, i) =>
  Math.pow(10, -4 + 0.25 * i),
);

export interface ElasticNetHyperparameters {
  readonly alpha: number;
  readonly lambda: number;
}

/**
 * La griglia interna completa di FAM-2 sui soli α e λ: 3 × 21 = 63 punti, in
 * ordine di enumerazione (α esterno, λ interno). L'half-life e' un terzo asse
 * che vive nei pesi riga e non in questa funzione.
 */
export const ELASTIC_NET_GRID: readonly ElasticNetHyperparameters[] = ELASTIC_NET_ALPHA_GRID.flatMap((alpha) =>
  ELASTIC_NET_LAMBDA_GRID.map((lambda) => ({ alpha, lambda })),
);

export interface ElasticNetTrainingRow {
  /** Nome->valore; `NaN` su una feature attiva esclude la riga dal fit (e la conta). */
  readonly features: Readonly<Record<string, number>>;
  readonly target: number;
  /** Peso riga = recency (§B.1) × peso N (§B.2). Assente = 1. */
  readonly weight?: number;
}

export interface FittedElasticNetParameters {
  readonly artifactVersion: "gen-elastic-net-parameters-v1";
  /** Il SET ATTIVO, nell'ordine in cui i coefficienti vanno letti. */
  readonly featureNames: readonly string[];
  /** Coefficienti nello spazio STANDARDIZZATO — come `FittedRidgeParameters`. */
  readonly coefficients: readonly number[];
  /** Intercetta, mai penalizzata (§D.2 lo impone di fatto: penalizzarla shrinkerebbe la media del bersaglio verso 0). */
  readonly intercept: number;
  readonly standardizerMeans: readonly number[];
  readonly standardizerStds: readonly number[];
  readonly zeroVarianceThreshold: typeof ZERO_VARIANCE_THRESHOLD;
  readonly alpha: number;
  readonly lambda: number;
  readonly tolerance: number;
  readonly maxIterations: number;
  /** Passate di coordinate descent effettivamente svolte. */
  readonly iterations: number;
  /** `false` = il tetto di iterazioni e' stato toccato prima della tolleranza. */
  readonly converged: boolean;
  readonly trainingRowCount: number;
  /** Righe escluse dal fit, per qualunque motivo. Mai imputate. */
  readonly excludedRowCount: number;
  /** Di cui: `NaN`/non finito su almeno una feature del set attivo. */
  readonly excludedForMissingFeature: number;
  /** Di cui: bersaglio non finito. */
  readonly excludedForMissingTarget: number;
  /** Di cui: peso non finito o negativo. */
  readonly excludedForInvalidWeight: number;
}

function softThreshold(value: number, threshold: number): number {
  if (value > threshold) return value - threshold;
  if (value < -threshold) return value + threshold;
  return 0;
}

/**
 * Fitta l'elastic net sul set attivo `featureNames`.
 *
 * Obiettivo minimizzato:
 *   `(1/(2·W))·Σ w_i (y_i − β₀ − x_i·β)²  +  λ(α‖β‖₁ + (1−α)/2·‖β‖₂²)`
 * con `W = Σ w_i`. La normalizzazione per `W` (e non per `n`) e' cio' che
 * rende la scala di λ la stessa con o senza pesi riga: senza, la griglia
 * preregistrata di §D.2 significherebbe due cose diverse nei due casi.
 *
 * Una colonna a varianza nulla ha coefficiente 0 per costruzione: lo
 * standardizer di `../featureMatrix.ts` la manda a zero sotto `1e-9`, e con la
 * colonna a zero l'aggiornamento di coordinate descent non puo' che lasciare
 * il coefficiente a zero.
 */
export function fitElasticNet(
  trainRows: readonly ElasticNetTrainingRow[],
  featureNames: readonly string[],
  hyperparameters: ElasticNetHyperparameters,
): FittedElasticNetParameters {
  if (featureNames.length === 0) throw new Error("fitElasticNet: empty active feature set");
  if (new Set(featureNames).size !== featureNames.length) {
    throw new Error("fitElasticNet: duplicate names in the active feature set");
  }
  const { alpha, lambda } = hyperparameters;
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new Error("fitElasticNet: alpha must be in [0, 1]");
  if (!Number.isFinite(lambda) || lambda < 0) throw new Error("fitElasticNet: lambda must be finite and non-negative");

  let excludedForMissingFeature = 0;
  let excludedForMissingTarget = 0;
  let excludedForInvalidWeight = 0;
  const rawRows: number[][] = [];
  const y: number[] = [];
  const w: number[] = [];
  for (const row of trainRows) {
    const vector = featureNames.map((name) => row.features[name] ?? NaN);
    if (vector.some((v) => !Number.isFinite(v))) {
      excludedForMissingFeature++;
      continue;
    }
    if (!Number.isFinite(row.target)) {
      excludedForMissingTarget++;
      continue;
    }
    const weight = row.weight ?? 1;
    if (!Number.isFinite(weight) || weight < 0) {
      excludedForInvalidWeight++;
      continue;
    }
    rawRows.push(vector);
    y.push(row.target);
    w.push(weight);
  }
  const excludedRowCount = excludedForMissingFeature + excludedForMissingTarget + excludedForInvalidWeight;
  if (rawRows.length === 0) throw new Error("fitElasticNet: no usable training rows after exclusions");

  const standardizer = fitColumnStandardizer(rawRows);
  const X = rawRows.map((v) => standardizer.transform(v));
  const n = X.length;
  const p = featureNames.length;

  let totalWeight = 0;
  for (const weight of w) totalWeight += weight;
  if (totalWeight === 0) throw new Error("fitElasticNet: zero total row weight");

  // `z_j` = secondo momento pesato della colonna j; costante nel ciclo, quindi
  // si calcola una volta sola invece che a ogni passata.
  const z = new Array<number>(p).fill(0);
  for (let j = 0; j < p; j++) {
    let acc = 0;
    for (let i = 0; i < n; i++) acc += w[i]! * X[i]![j]! * X[i]![j]!;
    z[j] = acc / totalWeight;
  }

  const beta = new Array<number>(p).fill(0); // init 0 (§D.2)
  let intercept = 0;
  const residual = y.slice();

  let iterations = 0;
  let converged = false;
  while (iterations < ELASTIC_NET_MAX_ITERATIONS) {
    iterations++;
    let maxChange = 0;

    // Intercetta: mai penalizzata, quindi il suo ottimo condizionato e'
    // semplicemente la media pesata del residuo corrente.
    let residualMean = 0;
    for (let i = 0; i < n; i++) residualMean += w[i]! * residual[i]!;
    residualMean /= totalWeight;
    if (residualMean !== 0) {
      intercept += residualMean;
      for (let i = 0; i < n; i++) residual[i] = residual[i]! - residualMean;
      maxChange = Math.max(maxChange, Math.abs(residualMean));
    }

    for (let j = 0; j < p; j++) {
      const zj = z[j]!;
      if (zj <= 0) {
        // Colonna a varianza nulla: lo standardizer l'ha azzerata, non porta
        // informazione e il suo coefficiente resta 0 per costruzione.
        beta[j] = 0;
        continue;
      }
      let rho = 0;
      for (let i = 0; i < n; i++) rho += w[i]! * X[i]![j]! * residual[i]!;
      rho = rho / totalWeight + beta[j]! * zj;
      const updated = softThreshold(rho, lambda * alpha) / (zj + lambda * (1 - alpha));
      const delta = updated - beta[j]!;
      if (delta !== 0) {
        beta[j] = updated;
        for (let i = 0; i < n; i++) residual[i] = residual[i]! - delta * X[i]![j]!;
        maxChange = Math.max(maxChange, Math.abs(delta));
      }
    }

    if (maxChange < ELASTIC_NET_TOLERANCE) {
      converged = true;
      break;
    }
  }

  if (![intercept, ...beta, ...standardizer.means, ...standardizer.stds].every(Number.isFinite)) {
    throw new Error("fitElasticNet: fitted parameters contain non-finite values");
  }

  return {
    artifactVersion: "gen-elastic-net-parameters-v1",
    featureNames: [...featureNames],
    coefficients: beta,
    intercept,
    standardizerMeans: [...standardizer.means],
    standardizerStds: [...standardizer.stds],
    zeroVarianceThreshold: ZERO_VARIANCE_THRESHOLD,
    alpha,
    lambda,
    tolerance: ELASTIC_NET_TOLERANCE,
    maxIterations: ELASTIC_NET_MAX_ITERATIONS,
    iterations,
    converged,
    trainingRowCount: n,
    excludedRowCount,
    excludedForMissingFeature,
    excludedForMissingTarget,
    excludedForInvalidWeight,
  };
}

/**
 * Predice da un artefatto serializzato.
 *
 * Una feature attiva assente o `NaN` -> predizione `NaN`, mai un'imputazione
 * silenziosa. E' la risposta corretta e ha una conseguenza precisa a monte: la
 * riga non e' scorata, quindi non entra nella coverage del candidato, che
 * §B.3.2 confronta col denominatore pieno. Un modello che «scora tutto»
 * riempiendo i buchi vincerebbe per cherry-picking travestito da copertura.
 */
export function predictWithElasticNet(
  parameters: FittedElasticNetParameters,
  features: Readonly<Record<string, number>>,
): number {
  if (parameters.featureNames.length !== parameters.coefficients.length) {
    throw new Error("predictWithElasticNet: parameter shape mismatch");
  }
  let prediction = parameters.intercept;
  for (let j = 0; j < parameters.featureNames.length; j++) {
    const raw = features[parameters.featureNames[j]!];
    if (raw === undefined || !Number.isFinite(raw)) return NaN;
    const std = parameters.standardizerStds[j]!;
    const standardized = std > parameters.zeroVarianceThreshold ? (raw - parameters.standardizerMeans[j]!) / std : 0;
    prediction += standardized * parameters.coefficients[j]!;
  }
  return prediction;
}

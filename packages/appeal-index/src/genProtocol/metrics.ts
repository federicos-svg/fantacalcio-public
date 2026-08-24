// GEN-PROTOCOL-A §B.2 — le funzioni di perdita e le metriche, una per riga
// della tabella del protocollo. PURE.
//
// Perche' vivono in un modulo separato dalle famiglie: §B.4 impone confronti
// «sempre paired sugli stessi fold», e la condizione minima perche' due
// candidati siano confrontabili e' che la loro perdita sia calcolata dallo
// stesso codice. Una MAE reimplementata dentro una famiglia sarebbe
// indistinguibile da questa finche' non lo e' — e quando smettesse di esserlo
// nessun test lo direbbe.
//
// Riuso dichiarato: `meanAbsoluteError` e `spearmanCorrelation` vengono da
// `../stats.ts` e NON sono riscritte qui. `mae` e' un alias tipato, non una
// seconda implementazione.

import { meanAbsoluteError, spearmanCorrelation } from "../stats.js";
import { GEN_ROLES, type GenRole } from "./genTypes.js";

/**
 * MAE — perdita primaria di T1, T-N, T3 e T8 (§B.2).
 *
 * MAE e non RMSE, per scelta preregistrata: «la distribuzione degli errori su
 * totali e prezzi e' a coda pesante e la selezione non deve essere dominata da
 * tre outlier» (§B.2). Il RMSE resta diagnostico e non seleziona nulla.
 */
export function mae(actual: readonly number[], predicted: readonly number[]): number {
  return meanAbsoluteError(actual, predicted);
}

/**
 * MAE pesato `Σ N_i·|e_i| / Σ N_i` — perdita primaria di T2 (§B.2), dove i
 * pesi sono le presenze REALIZZATE nella stagione di test.
 *
 * Il peso non e' un dettaglio di comodo: senza, una fantamedia costruita su
 * due partite conterebbe come una costruita su trentacinque, e la selezione
 * finirebbe per premiare chi indovina il rumore dei marginali (§A.3, T2).
 */
export function weightedMae(
  actual: readonly number[],
  predicted: readonly number[],
  weights: readonly number[],
): number {
  if (actual.length !== predicted.length || actual.length !== weights.length || actual.length === 0) {
    throw new Error("weightedMae: length mismatch or empty input");
  }
  let sumW = 0;
  let sumWE = 0;
  for (let i = 0; i < actual.length; i++) {
    const w = weights[i]!;
    if (!Number.isFinite(w) || w < 0) throw new Error("weightedMae: weights must be finite and non-negative");
    sumW += w;
    sumWE += w * Math.abs(actual[i]! - predicted[i]!);
  }
  if (sumW === 0) throw new Error("weightedMae: zero total weight");
  return sumWE / sumW;
}

/** Una riga valutabile per ruolo: il minimo che serve a una metrica per ruolo. */
export interface GenScoredRow {
  readonly role: GenRole;
  readonly actual: number;
  readonly predicted: number;
}

/**
 * Spearman per ruolo (§B.2, metrica secondaria di ogni bersaglio; §B.6 la
 * legge sulla scala d'autorita' gia' preregistrata in DECISIONS §D9).
 *
 * `NaN` per un ruolo con meno di 2 righe: una correlazione su un punto non e'
 * zero, e restituire zero la farebbe entrare nelle medie come se fosse una
 * misura. Il chiamante filtra i `NaN`, e cosi' facendo sa quante ne ha perse.
 */
export function spearmanByRole(rows: readonly GenScoredRow[]): Readonly<Partial<Record<GenRole, number>>> {
  const out: Partial<Record<GenRole, number>> = {};
  for (const role of GEN_ROLES) {
    const subset = rows.filter((r) => r.role === role);
    if (subset.length < 2) {
      if (subset.length > 0) out[role] = NaN;
      continue;
    }
    out[role] = spearmanCorrelation(
      subset.map((r) => r.actual),
      subset.map((r) => r.predicted),
    );
  }
  return out;
}

/** Una stagione osservata di un giocatore contro la distribuzione che gli e' stata predetta. */
export interface GenDistributionObservation {
  /** Conteggi osservati sui bin, uno per bin (§A.3, T-D: 9 bin; 18 per la congiunta A). */
  readonly observedCounts: readonly number[];
  /** Probabilita' predette sugli stessi bin, nello stesso ordine. */
  readonly predictedProbabilities: readonly number[];
}

/**
 * Log-loss multinomiale MEDIA PER PRESENZA — perdita primaria di T-D (§B.2).
 *
 * `Σ_righe Σ_bin count·(−ln p) / Σ conteggi`: la media e' per presenza, non
 * per giocatore, perche' e' la presenza l'unita' su cui la distribuzione e'
 * definita (§A.3).
 *
 * Una probabilita' 0 su un bin osservato produce `Infinity`, ed e' la risposta
 * giusta: significa che il candidato ha dichiarato impossibile qualcosa che e'
 * successo. Nessun epsilon di comodo viene aggiunto per addolcirlo — sarebbe
 * una costante inventata che cambia la classifica (§B.4). Lo shrinkage verso
 * il ruolo di `voteDistribution.ts` e' il meccanismo preregistrato che rende
 * il caso impossibile quando i dati ci sono.
 */
export function multinomialLogLoss(observations: readonly GenDistributionObservation[]): number {
  if (observations.length === 0) throw new Error("multinomialLogLoss: empty input");
  let totalCount = 0;
  let totalLoss = 0;
  for (const obs of observations) {
    if (obs.observedCounts.length !== obs.predictedProbabilities.length) {
      throw new Error("multinomialLogLoss: counts/probabilities length mismatch");
    }
    for (let b = 0; b < obs.observedCounts.length; b++) {
      const count = obs.observedCounts[b]!;
      if (!Number.isFinite(count) || count < 0) throw new Error("multinomialLogLoss: counts must be finite and non-negative");
      if (count === 0) continue;
      const p = obs.predictedProbabilities[b]!;
      if (!Number.isFinite(p) || p < 0) throw new Error("multinomialLogLoss: probabilities must be finite and non-negative");
      totalCount += count;
      totalLoss += count * -Math.log(p);
    }
  }
  if (totalCount === 0) throw new Error("multinomialLogLoss: no observed presence to average over");
  return totalLoss / totalCount;
}

/**
 * Errore % di contributo stagionale — perdita primaria di T6 (§B.2, §D.9):
 * `Σ_i |ΔM̂_i − ΔM_i^real| / Σ_i |ΔM_i^real|`.
 *
 * E' un rapporto fra somme, non una media di rapporti: cosi' un giocatore il
 * cui contributo reale e' quasi zero non produce un errore percentuale
 * enorme che domina la metrica. Le soglie 15% / 25% di §B.6 si leggono su
 * QUESTO numero.
 *
 * Denominatore nullo (nessun contributo reale da nessuna parte) -> `NaN`: non
 * esiste un errore percentuale rispetto a zero, e scrivere 0 direbbe
 * «perfetto» dove non c'e' niente da misurare.
 */
export function seasonalContributionError(
  predictedDeltas: readonly number[],
  realDeltas: readonly number[],
): number {
  if (predictedDeltas.length !== realDeltas.length || predictedDeltas.length === 0) {
    throw new Error("seasonalContributionError: length mismatch or empty input");
  }
  let num = 0;
  let den = 0;
  for (let i = 0; i < realDeltas.length; i++) {
    num += Math.abs(predictedDeltas[i]! - realDeltas[i]!);
    den += Math.abs(realDeltas[i]!);
  }
  if (den === 0) return NaN;
  return num / den;
}

/**
 * Errore firmato medio (bias) — secondaria di T3 (§B.2): `media(predetto −
 * reale)`.
 *
 * Il segno e' il punto: OPPONENT_PROFILE_CONTRACT §4-quinquies chiede che il
 * prezzo previsto «sbagli verso il basso, e lo dica». Negativo = si prevede
 * meno di quanto si e' pagato.
 */
export function signedMeanError(actual: readonly number[], predicted: readonly number[]): number {
  if (actual.length !== predicted.length || actual.length === 0) {
    throw new Error("signedMeanError: length mismatch or empty input");
  }
  let sum = 0;
  for (let i = 0; i < actual.length; i++) sum += predicted[i]! - actual[i]!;
  return sum / actual.length;
}

/**
 * Copertura di un intervallo (§B.5): quota di realizzati dentro `[lower,
 * upper]`, estremi INCLUSI.
 *
 * Estremi inclusi perche' l'intervallo conformal e' `pred ± q̂`, cioe' costruito
 * su un quantile dei residui: il residuo esattamente pari al quantile e' uno
 * di quelli che il quantile copre.
 */
export function conformalCoverage(
  actual: readonly number[],
  lower: readonly number[],
  upper: readonly number[],
): number {
  if (actual.length !== lower.length || actual.length !== upper.length || actual.length === 0) {
    throw new Error("conformalCoverage: length mismatch or empty input");
  }
  let covered = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i]! >= lower[i]! && actual[i]! <= upper[i]!) covered++;
  }
  return covered / actual.length;
}

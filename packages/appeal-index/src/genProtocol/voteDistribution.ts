// GEN-PROTOCOL-A §A.3 / §D.9 — T-D, la distribuzione del voto base. PURO.
//
// Il bersaglio, per intero (§A.3): «`p(i,s)(·)` = distribuzione del voto base
// sulle presenze valide, sui 9 bin `{≤4; 4,5; 5; 5,5; 6; 6,5; 7; 7,5; ≥8}`;
// per ruolo A anche la distribuzione congiunta con `flag_bonus = (Gf>0 ∨ Ass>0
// ∨ Rs>0)` (18 bin)».
//
// Perche' T-D esiste come bersaglio a se': e' l'INGREDIENTE PREDITTIVO dei tre
// modificatori (§D.9). I modificatori non leggono una media, leggono una
// distribuzione — il bonus difesa dipende dal fatto che quattro voti stiano
// sopra una soglia insieme, e il bonus attacco e' una tabella a gradini su
// singoli voti. Una media prevista bene puo' produrre un contributo previsto
// male, ed e' esattamente cio' che questa struttura evita.
//
// Il ricentraggio per tilting esponenziale e' il «candidato 2» di §D.9 e ha la
// sua falsificazione gia' scritta: «se il candidato T-D con tilting non
// migliora il log-loss del non-ricentrato e nemmeno l'errore di contributo, il
// ricentraggio e' complessita' inutile e resta fuori (regola 1-SE)».

import { GEN_ROLES, isValidPresence, type GenRole, type GenSeason, type MatchdayVote } from "./genTypes.js";
import { recencyWeight } from "./foldScheme.js";

/** Le etichette dei 9 bin, nell'ordine canonico di §A.3. */
export const VOTE_BIN_LABELS: readonly string[] = ["<=4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", ">=8"] as const;

/** Numero di bin del voto base (§A.3). */
export const VOTE_BIN_COUNT = 9;

/**
 * Il valore numerico che rappresenta ogni bin, per il tilting e per le medie.
 *
 * CONVENZIONE DICHIARATA: i sette bin centrali sono punti esatti della griglia
 * 0,5 e valgono se stessi; le due code (`≤4`, `≥8`) valgono il loro CONFINE,
 * 4 e 8. Il protocollo non fissa un rappresentante per le code — sceglierne
 * uno «medio» avrebbe richiesto di inventare la forma della coda, che e'
 * proprio cio' che i bin nascondono. Il confine e' la scelta piu' conservativa
 * (comprime la media verso il centro) ed e' scritta qui, non dedotta a valle.
 */
export const VOTE_BIN_VALUES: readonly number[] = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8] as const;

/** Griglia interna di `k` per lo shrinkage di T-D (§D.9). */
export const VOTE_DISTRIBUTION_K_GRID: readonly number[] = [10, 20, 40, 80] as const;

/** Half-life di recency di T-D: fissato a 3 dal protocollo (§D.9), non tunato. */
export const VOTE_DISTRIBUTION_HALF_LIFE = 3;

/**
 * Indice di bin di un voto base, oppure `null` se il voto e' sufficientemente
 * dentro `(4, 8)` ma FUORI dalla griglia 0,5.
 *
 * `null` e non un arrotondamento: P0.3 misura la frequenza dei voti fuori
 * griglia e si aspetta zero; se ce ne fossero, arrotondarli sarebbe inferire
 * (LEAGUE_RULES §27, `DO_NOT_INFER`). Chi costruisce la distribuzione li conta
 * a parte — visibili, mai spariti (§D.7).
 */
export function voteBinIndex(votoBase: number): number | null {
  if (!Number.isFinite(votoBase)) return null;
  if (votoBase <= 4) return 0;
  if (votoBase >= 8) return VOTE_BIN_COUNT - 1;
  const steps = (votoBase - 4) * 2;
  if (!Number.isInteger(steps)) return null;
  return steps;
}

/** `flag_bonus` di §A.3 per la congiunta del ruolo A: gol, assist o rigore sbagliato. */
export function hasBonusFlag(row: MatchdayVote): boolean {
  return row.Gf > 0 || row.Ass > 0 || row.Rs > 0;
}

export interface VoteDistributionCounts {
  /** Conteggi sui 9 bin (o 18 per la congiunta), nell'ordine canonico. */
  readonly counts: readonly number[];
  /** Presenze valide che sono finite in un bin. */
  readonly presences: number;
  /** Presenze valide con voto sufficiente FUORI dalla griglia 0,5: contate, mai arrotondate. */
  readonly offGridPresences: number;
}

/** Conteggi sui 9 bin dalle righe giornaliere di una stagione (§A.3). */
export function buildVoteDistribution(rows: readonly MatchdayVote[]): VoteDistributionCounts {
  const counts = new Array<number>(VOTE_BIN_COUNT).fill(0);
  let presences = 0;
  let offGridPresences = 0;
  for (const row of rows) {
    if (!isValidPresence(row)) continue;
    const bin = voteBinIndex(row.votoBase as number);
    if (bin === null) {
      offGridPresences++;
      continue;
    }
    counts[bin] = counts[bin]! + 1;
    presences++;
  }
  return { counts, presences, offGridPresences };
}

/**
 * Conteggi sui 18 bin della congiunta (voto × `flag_bonus`) — ruolo A (§A.3).
 *
 * Layout: `bin + 9·(flag_bonus ? 1 : 0)`. I primi 9 sono i «senza bonus», che
 * sono anche gli unici eleggibili al modificatore attacco (§21 con la
 * correzione 2026-08-21): la congiunta serve proprio a leggere quella meta'
 * senza doverla stimare separatamente.
 */
export function buildJointVoteDistribution(rows: readonly MatchdayVote[]): VoteDistributionCounts {
  const counts = new Array<number>(VOTE_BIN_COUNT * 2).fill(0);
  let presences = 0;
  let offGridPresences = 0;
  for (const row of rows) {
    if (!isValidPresence(row)) continue;
    const bin = voteBinIndex(row.votoBase as number);
    if (bin === null) {
      offGridPresences++;
      continue;
    }
    const index = bin + (hasBonusFlag(row) ? VOTE_BIN_COUNT : 0);
    counts[index] = counts[index]! + 1;
    presences++;
  }
  return { counts, presences, offGridPresences };
}

/** Normalizza conteggi in probabilita'. Somma nulla -> `null`, mai una uniforme inventata. */
export function normalizeCounts(counts: readonly number[]): readonly number[] | null {
  let total = 0;
  for (const c of counts) total += c;
  if (total <= 0) return null;
  return counts.map((c) => c / total);
}

/** Una stagione osservata del giocatore, con i suoi conteggi per bin. */
export interface VoteDistributionObservation {
  readonly season: GenSeason;
  readonly counts: readonly number[];
}

/**
 * La distribuzione di ruolo del train: media dei conteggi POOLED del ruolo,
 * normalizzata. E' anche la baseline B0-TD (§B.3).
 */
export function poolRoleDistributions(
  trainRows: readonly { readonly role: GenRole; readonly counts: readonly number[] }[],
  binCount: number = VOTE_BIN_COUNT,
): Readonly<Partial<Record<GenRole, readonly number[]>>> {
  const out: Partial<Record<GenRole, readonly number[]>> = {};
  for (const role of GEN_ROLES) {
    const pooled = new Array<number>(binCount).fill(0);
    let any = false;
    for (const row of trainRows) {
      if (row.role !== role) continue;
      if (row.counts.length !== binCount) throw new Error("poolRoleDistributions: bin count mismatch");
      any = true;
      for (let b = 0; b < binCount; b++) pooled[b] = pooled[b]! + row.counts[b]!;
    }
    if (!any) continue;
    const normalized = normalizeCounts(pooled);
    if (normalized !== null) out[role] = normalized;
  }
  return out;
}

export interface ShrunkVoteDistribution {
  readonly probabilities: readonly number[];
  /** `Σ 0,5^{Δ/3} · presenze del bin`: il campione efficace del giocatore. */
  readonly effectiveSample: number;
  /** `n_eff/(n_eff + k)`: 0 = tutta distribuzione di ruolo. */
  readonly shrinkageWeight: number;
}

/**
 * Distribuzione del giocatore, pesata per recency e shrunk verso il ruolo
 * (§D.9): `p = (n_eff·p_giocatore + k·p_ruolo)/(n_eff + k)`.
 *
 * Nessuna osservazione -> la distribuzione di ruolo con `shrinkageWeight = 0`.
 * E' il caso «mai un buco trattato come certezza» che §A.3 chiede
 * esplicitamente per T-D.
 */
export function shrinkVoteDistribution(
  observations: readonly VoteDistributionObservation[],
  roleProbabilities: readonly number[],
  k: number,
  referenceSeason: GenSeason,
  halfLife: number = VOTE_DISTRIBUTION_HALF_LIFE,
): ShrunkVoteDistribution {
  if (!Number.isFinite(k) || k < 0) throw new Error("shrinkVoteDistribution: k must be finite and non-negative");
  const binCount = roleProbabilities.length;
  if (binCount === 0) throw new Error("shrinkVoteDistribution: empty role distribution");

  const weighted = new Array<number>(binCount).fill(0);
  let effectiveSample = 0;
  for (const obs of observations) {
    if (obs.counts.length !== binCount) throw new Error("shrinkVoteDistribution: bin count mismatch");
    const w = recencyWeight(obs.season, referenceSeason, halfLife);
    for (let b = 0; b < binCount; b++) {
      weighted[b] = weighted[b]! + w * obs.counts[b]!;
      effectiveSample += w * obs.counts[b]!;
    }
  }

  if (effectiveSample <= 0) {
    return { probabilities: [...roleProbabilities], effectiveSample: 0, shrinkageWeight: 0 };
  }
  const shrinkageWeight = effectiveSample / (effectiveSample + k);
  const probabilities = weighted.map(
    (value, b) => shrinkageWeight * (value / effectiveSample) + (1 - shrinkageWeight) * roleProbabilities[b]!,
  );
  return { probabilities, effectiveSample, shrinkageWeight };
}

export interface ExponentialTiltResult {
  /** La distribuzione ricentrata; se `converged === false`, la distribuzione ORIGINALE, intatta. */
  readonly probabilities: readonly number[];
  readonly theta: number;
  readonly converged: boolean;
  readonly iterations: number;
  /** Media della distribuzione restituita — cosi' il chiamante non deve ricalcolarla per verificare. */
  readonly mean: number;
}

/** Tolleranza di Newton per il tilting (§D.9). */
export const EXPONENTIAL_TILT_TOLERANCE = 1e-9;

/** Tetto di iterazioni di Newton per il tilting (§D.9). */
export const EXPONENTIAL_TILT_MAX_ITERATIONS = 100;

/**
 * Tilting esponenziale: `p'(v) ∝ p(v)·e^{θv}`, con `θ` risolto per Newton
 * perche' la media coincida con `targetMean` (§D.9).
 *
 * La derivata di `E_θ[v]` rispetto a `θ` e' la VARIANZA sotto la distribuzione
 * tiltata: e' non negativa, quindi la funzione da azzerare e' monotona
 * crescente e Newton converge quando una soluzione esiste. Una soluzione
 * esiste se e solo se `targetMean` sta strettamente dentro il supporto — una
 * media richiesta pari o oltre il valore massimo richiederebbe `θ = ±∞`.
 *
 * Mancata convergenza -> `converged: false` e la distribuzione NON ricentrata,
 * mai un'eccezione silenziosa e mai un risultato a meta'. Il chiamante vede il
 * flag e decide; §D.9 vuole che il ricentraggio sia un candidato che si puo'
 * scartare, non un passaggio obbligato che puo' rompersi.
 */
export function exponentialTilt(
  probabilities: readonly number[],
  targetMean: number,
  binValues: readonly number[] = VOTE_BIN_VALUES,
): ExponentialTiltResult {
  if (probabilities.length !== binValues.length || probabilities.length === 0) {
    throw new Error("exponentialTilt: probabilities/binValues length mismatch or empty");
  }
  const untilted = distributionMean(probabilities, binValues);
  const failed = (theta: number, iterations: number): ExponentialTiltResult => ({
    probabilities: [...probabilities],
    theta,
    converged: false,
    iterations,
    mean: untilted,
  });
  if (!Number.isFinite(targetMean)) return failed(0, 0);

  let theta = 0;
  for (let iteration = 1; iteration <= EXPONENTIAL_TILT_MAX_ITERATIONS; iteration++) {
    const tilted = tiltAt(probabilities, binValues, theta);
    if (tilted === null) return failed(theta, iteration);
    const meanValue = distributionMean(tilted, binValues);
    const gap = meanValue - targetMean;
    if (Math.abs(gap) < EXPONENTIAL_TILT_TOLERANCE) {
      return { probabilities: tilted, theta, converged: true, iterations: iteration, mean: meanValue };
    }
    let variance = 0;
    for (let b = 0; b < tilted.length; b++) variance += tilted[b]! * (binValues[b]! - meanValue) ** 2;
    if (!(variance > EXPONENTIAL_TILT_TOLERANCE)) return failed(theta, iteration);
    const next = theta - gap / variance;
    if (!Number.isFinite(next)) return failed(theta, iteration);
    theta = next;
  }
  return failed(theta, EXPONENTIAL_TILT_MAX_ITERATIONS);
}

/** Media di una distribuzione discreta sui valori rappresentativi dei bin. */
export function distributionMean(probabilities: readonly number[], binValues: readonly number[] = VOTE_BIN_VALUES): number {
  if (probabilities.length !== binValues.length) throw new Error("distributionMean: length mismatch");
  let m = 0;
  for (let b = 0; b < probabilities.length; b++) m += probabilities[b]! * binValues[b]!;
  return m;
}

function tiltAt(
  probabilities: readonly number[],
  binValues: readonly number[],
  theta: number,
): readonly number[] | null {
  // Si sottrae il massimo dell'esponente prima di esponenziare: aritmetica
  // identica, e nessun overflow quando Newton passa per un theta grande.
  let maxExponent = Number.NEGATIVE_INFINITY;
  for (let b = 0; b < binValues.length; b++) {
    if (probabilities[b]! > 0) maxExponent = Math.max(maxExponent, theta * binValues[b]!);
  }
  if (!Number.isFinite(maxExponent)) return null;
  const weights = probabilities.map((p, b) => (p > 0 ? p * Math.exp(theta * binValues[b]! - maxExponent) : 0));
  let total = 0;
  for (const w of weights) total += w;
  if (!(total > 0) || !Number.isFinite(total)) return null;
  return weights.map((w) => w / total);
}

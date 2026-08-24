// GEN-PROTOCOL-A §B.3 — le baseline B0, il pavimento del metro. PURE.
//
// «Definite adesso, congelate col metro. Costanti fissate a priori … nessuna
// di queste costanti viene tarata sui fold — sono il pavimento, non un
// candidato ottimizzato.» Il 10 di B0-T2 e' un k classico di shrinkage e resta
// 10 comunque vadano i fold: e' proprio questo a renderlo una baseline. Un
// pavimento che si abbassa quando qualcuno inciampa non e' un pavimento.
//
// PERCHE' NON `../baselines.ts`. Quel modulo esiste, e' vivo e resta com'e':
// implementa il pavimento di VAL-PROTOCOL-A-PHASE4 sopra il tipo `Trainer` e
// il `FeatureVector` a dieci nomi di quel protocollo. Le semantiche NON
// coincidono, e non per dettagli:
//   - il suo `shrinkageBaselineTrainer(k)` shrinka la ROLLING MEAN del
//     giocatore verso la media di ruolo con peso `n/(n+k)` dove `n` e' il
//     NUMERO DI STAGIONI osservate. B0-T2 shrinka la fantamedia di `s−1` con
//     peso `n/(n+10)` dove `n` sono le PRESENZE di quella stagione. Sono due
//     nozioni diverse di «quanto ne sappiamo»: una conta gli anni, l'altra le
//     partite. Su un giocatore con sei stagioni da due presenze danno risposte
//     opposte;
//   - `k` la' e' un iperparametro che compete come candidato
//     (`PHASE4_CONFIG.hyperparameters.shrinkageK`), qui e' una costante
//     congelata da §C;
//   - la' non esistono B0-N con mediana di ruolo, B0-T3, B0-TD, B0-T6, B0-T8.
// Riusarlo avrebbe voluto dire cambiarne il comportamento — e con esso il
// significato dei pacchetti Phase 4 gia' prodotti.
//
// Cio' che invece si riusa davvero: `poolRoleDistributions` ed
// `exponentialTilt` (`voteDistribution.ts`) per B0-TD e B0-T6, e
// `priceCurve.ts` per B0-T3, che di quella famiglia e' esattamente il membro
// {larghezza 1, nessuno smoothing, pool-ratio}.

import { GEN_ROLES, type GenRole } from "./genTypes.js";
import { quantileType7 } from "./conformal.js";
import {
  buildPriceCurve,
  predictPriceFromCurve,
  type GenAuctionRow,
  type GenPriceCurve,
  type PricePrediction,
} from "./priceCurve.js";
import {
  exponentialTilt,
  poolRoleDistributions,
  VOTE_BIN_VALUES,
  type ExponentialTiltResult,
} from "./voteDistribution.js";

/** Il `k` di B0-T2 (§B.3): 10, fisso, mai tarato sui fold. */
export const B0_T2_SHRINKAGE_K = 10;

/** Una riga di training di B0: i bersagli OSSERVATI di una stagione di training. */
export interface B0TrainingRow {
  readonly role: GenRole;
  /** T-N osservato: la mediana di ruolo di questi valori e' il fallback di B0-N. */
  readonly presenze: number;
  /** T2 osservato; `null` con N = 0 (T2 indefinito, §A.3) — non entra nella media di ruolo. */
  readonly fantamedia: number | null;
  /** Media del voto base osservata; alimenta il ricentraggio di B0-T6. */
  readonly mediaVotoBase?: number | null;
  /** Conteggi sui 9 bin del voto base: alimentano B0-TD. */
  readonly voteBinCounts?: readonly number[] | null;
}

export interface FittedB0Parameters {
  readonly artifactVersion: "gen-b0-parameters-v1";
  readonly shrinkageK: number;
  /** Mediana di ruolo delle presenze nel training: il fallback di B0-N. */
  readonly roleMedianPresenze: Readonly<Partial<Record<GenRole, number>>>;
  /** `M_r`: fantamedia media del ruolo nel training (§B.3, B0-T2). */
  readonly roleMeanFantamedia: Readonly<Partial<Record<GenRole, number>>>;
  /** Media del voto base per ruolo: il bersaglio del tilt di B0-T6. */
  readonly roleMeanMediaVotoBase: Readonly<Partial<Record<GenRole, number>>>;
  /** B0-TD: distribuzione di ruolo del training, pooled (§B.3). */
  readonly roleVoteDistribution: Readonly<Partial<Record<GenRole, readonly number[]>>>;
  readonly trainingRowCount: number;
  readonly roleRowCounts: Readonly<Partial<Record<GenRole, number>>>;
}

/** Ingresso di predizione: i fatti di `s−1`, `null` quando la stagione manca. */
export interface B0PredictionInput {
  readonly role: GenRole;
  /** `N(i, s−1)`; `null` se il giocatore non ha riga in `s−1`. */
  readonly presenzeLag1: number | null;
  /** `fm(i, s−1)`; `null` se assente o indefinita (N = 0). */
  readonly fantamediaLag1: number | null;
}

export function fitB0(trainRows: readonly B0TrainingRow[]): FittedB0Parameters {
  if (trainRows.length === 0) throw new Error("fitB0: nessuna riga di training");
  const roleMedianPresenze: Partial<Record<GenRole, number>> = {};
  const roleMeanFantamedia: Partial<Record<GenRole, number>> = {};
  const roleMeanMediaVotoBase: Partial<Record<GenRole, number>> = {};
  const roleRowCounts: Partial<Record<GenRole, number>> = {};

  for (const role of GEN_ROLES) {
    const rows = trainRows.filter((row) => row.role === role);
    if (rows.length === 0) continue;
    roleRowCounts[role] = rows.length;
    roleMedianPresenze[role] = quantileType7(rows.map((row) => row.presenze), 0.5);
    // Le righe con T2 indefinito (N = 0) NON entrano nella media di ruolo: §A.3
    // le toglie dal solo T2, e includerle come zeri sarebbe la coercizione che
    // §A.1 vieta.
    const fantamedie = rows.map((row) => row.fantamedia).filter((v): v is number => v !== null && Number.isFinite(v));
    if (fantamedie.length > 0) {
      roleMeanFantamedia[role] = fantamedie.reduce((sum, v) => sum + v, 0) / fantamedie.length;
    }
    const medie = rows
      .map((row) => row.mediaVotoBase)
      .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
    if (medie.length > 0) {
      roleMeanMediaVotoBase[role] = medie.reduce((sum, v) => sum + v, 0) / medie.length;
    }
  }

  const distributionRows = trainRows
    .filter((row): row is B0TrainingRow & { voteBinCounts: readonly number[] } =>
      row.voteBinCounts !== null && row.voteBinCounts !== undefined,
    )
    .map((row) => ({ role: row.role, counts: row.voteBinCounts }));

  return {
    artifactVersion: "gen-b0-parameters-v1",
    shrinkageK: B0_T2_SHRINKAGE_K,
    roleMedianPresenze,
    roleMeanFantamedia,
    roleMeanMediaVotoBase,
    roleVoteDistribution: distributionRows.length > 0 ? poolRoleDistributions(distributionRows) : {},
    trainingRowCount: trainRows.length,
    roleRowCounts,
  };
}

/**
 * B0-N: `N̂ = N(i, s−1)`; senza riga in `s−1`, la mediana di ruolo del training.
 *
 * Mediana e non media: la distribuzione delle presenze e' bimodale (chi gioca
 * quasi sempre e chi quasi mai), e la media di una bimodale cade dove non c'e'
 * nessuno.
 */
export function predictB0N(parameters: FittedB0Parameters, input: B0PredictionInput): number {
  if (input.presenzeLag1 !== null && Number.isFinite(input.presenzeLag1)) return input.presenzeLag1;
  const fallback = parameters.roleMedianPresenze[input.role];
  return fallback ?? NaN;
}

/**
 * B0-T2: `FM̂ = (n·fm + 10·M_r)/(n + 10)`; senza riga in `s−1`, `M_r`.
 *
 * `n` sono le PRESENZE di `s−1`, non le stagioni: e' il numero di osservazioni
 * su cui la fantamedia e' stata calcolata, cioe' esattamente quanto la si puo'
 * credere.
 */
export function predictB0T2(parameters: FittedB0Parameters, input: B0PredictionInput): number {
  const roleMean = parameters.roleMeanFantamedia[input.role];
  if (roleMean === undefined) return NaN;
  const n = input.presenzeLag1;
  const fm = input.fantamediaLag1;
  if (n === null || fm === null || !Number.isFinite(n) || !Number.isFinite(fm) || n <= 0) return roleMean;
  return (n * fm + parameters.shrinkageK * roleMean) / (n + parameters.shrinkageK);
}

/** B0-T1: `B0-T2 × B0-N` (§B.3). */
export function predictB0T1(parameters: FittedB0Parameters, input: B0PredictionInput): number {
  return predictB0T2(parameters, input) * predictB0N(parameters, input);
}

/** B0-TD: la distribuzione di ruolo del training, pooled (§B.3). */
export function b0RoleDistribution(parameters: FittedB0Parameters, role: GenRole): readonly number[] | null {
  return parameters.roleVoteDistribution[role] ?? null;
}

/**
 * B0-T6: B0-TD RICENTRATA sul giocatore con la sua media-voto shrunk di B0.
 *
 * Il ricentraggio e' il tilt esponenziale gia' preregistrato in §D.9 —
 * aritmetica chiusa, nessun peso libero. Questa funzione si ferma alla
 * distribuzione: il contributo ai modificatori lo calcola `modValueSim.ts` con
 * la stessa aritmetica che usa per i candidati, che e' il punto di §D.9
 * («stessi contesti, stesso seed»): fra baseline e candidato cambia SOLO la
 * distribuzione, e cosi' la differenza misura la parte predetta e nient'altro.
 *
 * La media-voto shrunk si ottiene con la stessa formula di B0-T2 applicata al
 * voto base: `(n·mv + 10·MV_r)/(n + 10)`.
 */
export function b0ShrunkMeanVote(
  parameters: FittedB0Parameters,
  role: GenRole,
  presenzeLag1: number | null,
  mediaVotoBaseLag1: number | null,
): number {
  const roleMean = parameters.roleMeanMediaVotoBase[role];
  if (roleMean === undefined) return NaN;
  if (
    presenzeLag1 === null ||
    mediaVotoBaseLag1 === null ||
    !Number.isFinite(presenzeLag1) ||
    !Number.isFinite(mediaVotoBaseLag1) ||
    presenzeLag1 <= 0
  ) {
    return roleMean;
  }
  return (presenzeLag1 * mediaVotoBaseLag1 + parameters.shrinkageK * roleMean) / (presenzeLag1 + parameters.shrinkageK);
}

export function b0T6Distribution(
  parameters: FittedB0Parameters,
  role: GenRole,
  shrunkMeanVote: number,
): ExponentialTiltResult | null {
  const roleDistribution = b0RoleDistribution(parameters, role);
  if (roleDistribution === null) return null;
  if (!Number.isFinite(shrunkMeanVote)) return null;
  return exponentialTilt(roleDistribution, shrunkMeanVote, VOTE_BIN_VALUES);
}

/**
 * B0-T3: la curva rango→prezzo di §B.3, che e' il membro
 * {larghezza 1, nessuno smoothing, pool-ratio} della famiglia di §D.11.
 *
 * Non e' una coincidenza da sfruttare, e' la ragione per cui la famiglia e'
 * costruita cosi': la baseline deve stare DENTRO lo spazio dei candidati,
 * altrimenti «battere B0» misurerebbe anche la differenza di impianto.
 */
export function fitB0PriceCurve(
  rows: readonly GenAuctionRow[],
  role: GenRole,
  trainAuctions: readonly string[],
): GenPriceCurve {
  return buildPriceCurve(rows, role, trainAuctions, {
    bandWidth: 1,
    smoothing: "none",
    renormalization: "poolRatio",
  });
}

/** La predizione B0-T3 al rango point-in-time, riscalata sul pool dell'asta, minimo 1. */
export function predictB0Price(curve: GenPriceCurve, rank: number, targetPool: number): PricePrediction {
  return predictPriceFromCurve(curve, rank, targetPool);
}

/**
 * Larghezza minima del range dell'indice estero (D5, FOREIGN_PROXY_INDEX
 * §forma): 12 punti. Non e' negoziabile qui — e' vincolo di contratto.
 */
export const FOREIGN_INDEX_MIN_RANGE_WIDTH = 12;

/** Estremi della scala percentile dell'indice di coorte. */
export const FOREIGN_INDEX_SCALE: readonly [number, number] = [0, 100] as const;

export interface B0T8Result {
  /** Percentile del giocatore dentro la coorte, 0–100. */
  readonly percentile: number;
  /** Il range servito, D5: MAI un numero secco. */
  readonly range: readonly [number, number];
  readonly width: number;
  readonly cohortSize: number;
}

/**
 * B0-T8: percentile di coorte su produzione per-90 estera, lega IGNORATA,
 * «range D5 a larghezza massima» (§B.3).
 *
 * PUNTO NON ESEGUIBILE ALLA LETTERA, e dichiarato: «larghezza massima» non ha
 * un numero nel protocollo. La lettura adottata — e scritta qui perche' sia
 * contestabile — e' che la baseline non stringe la banda: usa la dispersione
 * della coorte stessa (percentile minimo→massimo osservato), mai piu' stretta
 * del minimo di contratto (12 punti) e mai fuori dalla scala. Una banda piu'
 * stretta sarebbe una precisione che questa baseline non ha, ed e' esattamente
 * cio' che il candidato di §D.13 deve guadagnarsi.
 */
export function b0T8(cohortValues: readonly number[], value: number): B0T8Result {
  const usable = cohortValues.filter((v) => Number.isFinite(v));
  if (usable.length === 0) throw new Error("b0T8: coorte vuota");
  if (!Number.isFinite(value)) {
    return { percentile: NaN, range: [NaN, NaN], width: NaN, cohortSize: usable.length };
  }
  let below = 0;
  let equal = 0;
  for (const v of usable) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  const percentile = ((below + equal / 2) / usable.length) * 100;

  const percentiles = usable.map((v) => {
    let b = 0;
    let e = 0;
    for (const other of usable) {
      if (other < v) b++;
      else if (other === v) e++;
    }
    return ((b + e / 2) / usable.length) * 100;
  });
  const spread = Math.max(...percentiles) - Math.min(...percentiles);
  const width = Math.max(FOREIGN_INDEX_MIN_RANGE_WIDTH, spread);
  const half = width / 2;
  const [scaleLow, scaleHigh] = FOREIGN_INDEX_SCALE;
  let lower = percentile - half;
  let upper = percentile + half;
  if (lower < scaleLow) {
    upper += scaleLow - lower;
    lower = scaleLow;
  }
  if (upper > scaleHigh) {
    lower = Math.max(scaleLow, lower - (upper - scaleHigh));
    upper = scaleHigh;
  }
  return { percentile, range: [lower, upper], width: upper - lower, cohortSize: usable.length };
}

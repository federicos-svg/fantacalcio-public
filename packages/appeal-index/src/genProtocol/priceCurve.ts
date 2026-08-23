// GEN-PROTOCOL-A T3 — la curva rango→prezzo, «una tabella scritta». PURA.
//
// §D.11 e' esplicito su che cosa T3 puo' essere e che cosa non puo' essere:
// «i candidati di §D.2 per T3 sono tutti tabelle+aritmetica con costanti
// versionate … mai una scatola nera». Il vincolo non e' estetico. Viene da
// OPPONENT_PROFILE_CONTRACT §4-quinquies (aritmetica dichiarata, incertezza e
// `n` accanto, mai un tetto, «mai un modello fittato presentato come verita'»)
// e da un fatto statistico che §H.7 scrive senza giri di parole: quattro aste
// in training e due fold di validazione. Qualunque claim forte sarebbe rumore
// vestito. Si consegna una curva con quantili e un bias dichiarato.
//
// I 12 candidati esterni sono l'enumerazione completa di §D.11: larghezza di
// fascia {1, 2, 3} × smoothing {nessuno, isotonico decrescente} ×
// rinormalizzazione {pool-ratio, nessuna}. Dodici, non tredici: §D.14 li conta
// e il cap e' vincolante.

import { quantileType7 } from "./conformal.js";
import { signedMeanError } from "./metrics.js";
import type { GenRole } from "./genTypes.js";

/** Crediti totali di una rosa in asta (§D.11): 4.000. */
export const AUCTION_TOTAL_CREDITS = 4000;

/** Slot totali del tavolo (§D.11): 224 = 8 squadre × 28. */
export const AUCTION_TOTAL_SLOTS = 224;

/** Prezzo minimo di un acquisto (§B.3, B0-T3): 1 credito. */
export const PRICE_MIN_CREDITS = 1;

/** Una riga dello storico d'asta, gia' normalizzata dal chiamante. */
export interface GenAuctionRow {
  /** Identificatore dell'asta (`a1`…`a5`): e' il BLOCCO dei fold T3 (§B.1). */
  readonly auction: string;
  readonly playerKey: string;
  readonly role: GenRole;
  /** Crediti pagati, interi (§A.3). */
  readonly price: number;
  /**
   * Rinnovo: prezzo amministrato, non formato in gara. Esce dalla popolazione
   * di T3 (§A.3) ED entra nel calcolo del pool, perche' i crediti spesi in
   * rinnovi non sono piu' disponibili al tavolo.
   */
  readonly isRenewal: boolean;
}

/**
 * Pool di un'asta: `4.000 − spesa rinnovi` (§B.3, B0-T3; §D.11, T5).
 *
 * E' il denominatore della rinormalizzazione: un'asta in cui si sono rinnovati
 * molti giocatori ha meno crediti in gara, e i prezzi sono piu' bassi per
 * aritmetica, non perche' i giocatori valgano meno.
 */
export function auctionPool(rows: readonly GenAuctionRow[], auction: string): number {
  let renewalSpend = 0;
  for (const row of rows) {
    if (row.auction !== auction) continue;
    if (row.isRenewal) renewalSpend += row.price;
  }
  return AUCTION_TOTAL_CREDITS - renewalSpend;
}

/** Le larghezze di fascia enumerate da §D.11. */
export const PRICE_BAND_WIDTHS: readonly number[] = [1, 2, 3] as const;

/** Gli smoothing enumerati da §D.11. */
export const PRICE_SMOOTHINGS = ["none", "isotonicDecreasing"] as const;
export type PriceSmoothing = (typeof PRICE_SMOOTHINGS)[number];

/** Le rinormalizzazioni enumerate da §D.11. */
export const PRICE_RENORMALIZATIONS = ["poolRatio", "none"] as const;
export type PriceRenormalization = (typeof PRICE_RENORMALIZATIONS)[number];

export interface PriceCurveOptions {
  readonly bandWidth: number;
  readonly smoothing: PriceSmoothing;
  readonly renormalization: PriceRenormalization;
}

/**
 * I 12 candidati esterni di T3, nell'ordine di enumerazione.
 *
 * L'ordine e' l'ultimo tie-break di §B.4.5 («indice di enumerazione piu' basso
 * nella griglia di §D.2»): deve essere una proprieta' del codice, non
 * dell'ordine in cui qualcuno li ha scritti in un file di configurazione.
 */
export const PRICE_CURVE_CANDIDATES: readonly PriceCurveOptions[] = PRICE_BAND_WIDTHS.flatMap((bandWidth) =>
  PRICE_SMOOTHINGS.flatMap((smoothing) =>
    PRICE_RENORMALIZATIONS.map((renormalization) => ({ bandWidth, smoothing, renormalization })),
  ),
);

/** Un punto della tabella: il rango e i suoi quattro quantili, con la sua `n`. */
export interface PriceCurvePoint {
  readonly rank: number;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly p90: number;
  /** Prezzi osservati che hanno prodotto il punto: `n` viaggia sempre col numero (§B.5). */
  readonly n: number;
  /** `true` se il punto e' un riporto in avanti dell'ultimo osservato (§B.3, B0-T3). */
  readonly carriedForward: boolean;
}

export interface GenPriceCurve {
  readonly artifactVersion: "gen-price-curve-v1";
  readonly role: GenRole;
  readonly bandWidth: number;
  readonly smoothing: PriceSmoothing;
  readonly renormalization: PriceRenormalization;
  /** Le aste di training che hanno prodotto la tabella. */
  readonly trainAuctions: readonly string[];
  /** Pool medio delle aste di training: il denominatore della rinormalizzazione. */
  readonly meanTrainPool: number;
  /** La tabella, rango 1..maxRank. */
  readonly points: readonly PriceCurvePoint[];
}

/**
 * PAVA — pool adjacent violators, versione DECRESCENTE.
 *
 * La curva rango→prezzo deve essere non crescente: il quinto difensore piu'
 * pagato non puo' valere piu' del quarto. Con quattro aste, pero', un singolo
 * prezzo anomalo produce un gradino all'insu' che e' rumore campionario, non un
 * fatto. PAVA lo assorbe fondendo i blocchi adiacenti in violazione con la loro
 * media pesata — e' la proiezione isotonica esatta in norma L2 pesata, non
 * un'euristica di lisciamento.
 *
 * Dove nasce davvero il gradino, dato che dentro ogni asta i prezzi sono gia'
 * ordinati: dalla PROFONDITA' DISUGUALE delle aste. Finche' tutte contribuiscono
 * a un rango la mediana e' non crescente per costruzione; ai ranghi profondi
 * restano solo le aste piu' «lunghe», e se quelle sono anche le piu' care il
 * prezzo mediano risale. Con aste di pari profondita' lo smoothing non ha nulla
 * da fare e i sei candidati con smoothing coincidono coi sei senza: e' una
 * proprieta' dei dati, non un difetto dell'enumerazione, e va letta nel report
 * del run invece che scoperta a posteriori.
 */
export function isotonicDecreasingPava(values: readonly number[], weights?: readonly number[]): readonly number[] {
  const n = values.length;
  if (n === 0) return [];
  const w = weights ?? values.map(() => 1);
  if (w.length !== n) throw new Error("isotonicDecreasingPava: values/weights length mismatch");
  const blockValue: number[] = [];
  const blockWeight: number[] = [];
  const blockSize: number[] = [];
  for (let i = 0; i < n; i++) {
    let value = values[i]!;
    let weight = w[i]!;
    if (!Number.isFinite(value)) throw new Error("isotonicDecreasingPava: non-finite value");
    let size = 1;
    // Finche' l'ultimo blocco e' PIU' BASSO del nuovo, la monotonia decrescente
    // e' violata: si fondono.
    while (blockValue.length > 0 && blockValue[blockValue.length - 1]! < value) {
      const previousValue = blockValue.pop()!;
      const previousWeight = blockWeight.pop()!;
      const previousSize = blockSize.pop()!;
      const totalWeight = previousWeight + weight;
      value = totalWeight > 0 ? (previousValue * previousWeight + value * weight) / totalWeight : previousValue;
      weight = totalWeight;
      size += previousSize;
    }
    blockValue.push(value);
    blockWeight.push(weight);
    blockSize.push(size);
  }
  const out: number[] = [];
  for (let b = 0; b < blockValue.length; b++) {
    for (let k = 0; k < blockSize[b]!; k++) out.push(blockValue[b]!);
  }
  return out;
}

/**
 * Costruisce la tabella rango→prezzo di un ruolo dalle aste di training.
 *
 * Dentro ogni asta i giocatori del ruolo si ordinano per PREZZO decrescente
 * (§B.3, B0-T3): il rango della tabella e' il rango di prezzo osservato. Il
 * rango con cui si LEGGE la tabella al serving e' invece quello point-in-time
 * (`pointInTimeRanking`), e sono due cose diverse di proposito — la tabella
 * dice «quanto e' costato il quinto difensore piu' pagato», la lettura dice
 * «questo giocatore, prima dell'asta, e' il quinto difensore».
 */
export function buildPriceCurve(
  rows: readonly GenAuctionRow[],
  role: GenRole,
  trainAuctions: readonly string[],
  options: PriceCurveOptions,
): GenPriceCurve {
  if (!Number.isInteger(options.bandWidth) || options.bandWidth < 1) {
    throw new Error("buildPriceCurve: bandWidth deve essere un intero positivo");
  }
  if (trainAuctions.length === 0) throw new Error("buildPriceCurve: nessuna asta di training");

  const pricesByRank = new Map<number, number[]>();
  let maxRank = 0;
  for (const auction of trainAuctions) {
    const purchases = rows
      .filter((row) => row.auction === auction && row.role === role && !row.isRenewal)
      .sort((a, b) => b.price - a.price || (a.playerKey < b.playerKey ? -1 : a.playerKey > b.playerKey ? 1 : 0));
    for (let i = 0; i < purchases.length; i++) {
      const rank = i + 1;
      maxRank = Math.max(maxRank, rank);
      const bucket = pricesByRank.get(rank);
      if (bucket === undefined) pricesByRank.set(rank, [purchases[i]!.price]);
      else bucket.push(purchases[i]!.price);
    }
  }

  const points: PriceCurvePoint[] = [];
  let previous: PriceCurvePoint | null = null;
  for (let rank = 1; rank <= maxRank; rank++) {
    const bandStart = Math.floor((rank - 1) / options.bandWidth) * options.bandWidth + 1;
    const banded: number[] = [];
    for (let r = bandStart; r < bandStart + options.bandWidth; r++) {
      banded.push(...(pricesByRank.get(r) ?? []));
    }
    if (banded.length === 0) {
      // Rango mancante -> ultimo valore osservato portato avanti (§B.3, B0-T3).
      if (previous === null) throw new Error("buildPriceCurve: nessun prezzo osservato al primo rango");
      const carried: PriceCurvePoint = { ...previous, rank, n: 0, carriedForward: true };
      points.push(carried);
      continue;
    }
    const sorted = [...banded].sort((a, b) => a - b);
    const point: PriceCurvePoint = {
      rank,
      median: quantileType7(sorted, 0.5),
      p25: quantileType7(sorted, 0.25),
      p75: quantileType7(sorted, 0.75),
      p90: quantileType7(sorted, 0.9),
      n: sorted.length,
      carriedForward: false,
    };
    points.push(point);
    previous = point;
  }

  const smoothed = options.smoothing === "isotonicDecreasing" ? smoothCurve(points) : points;

  let poolSum = 0;
  for (const auction of trainAuctions) poolSum += auctionPool(rows, auction);

  return {
    artifactVersion: "gen-price-curve-v1",
    role,
    bandWidth: options.bandWidth,
    smoothing: options.smoothing,
    renormalization: options.renormalization,
    trainAuctions: [...trainAuctions],
    meanTrainPool: poolSum / trainAuctions.length,
    points: smoothed,
  };
}

/**
 * PAVA su tutte e quattro le serie della tabella.
 *
 * Anche i quantili si lisciano, non solo la mediana: una banda P25–P75 che si
 * allarga e si stringe a caso lungo il rango non e' incertezza misurata, e'
 * l'ordine in cui sono capitati quattro prezzi.
 */
function smoothCurve(points: readonly PriceCurvePoint[]): readonly PriceCurvePoint[] {
  // Peso = `n` osservate, cosi' un punto riportato in avanti (n = 0) non tira
  // la proiezione: non porta informazione nuova.
  const weights = points.map((p) => (p.n > 0 ? p.n : 1e-9));
  const median = isotonicDecreasingPava(points.map((p) => p.median), weights);
  const p25 = isotonicDecreasingPava(points.map((p) => p.p25), weights);
  const p75 = isotonicDecreasingPava(points.map((p) => p.p75), weights);
  const p90 = isotonicDecreasingPava(points.map((p) => p.p90), weights);
  return points.map((point, i) => ({
    ...point,
    median: median[i]!,
    p25: p25[i]!,
    p75: p75[i]!,
    p90: p90[i]!,
  }));
}

/**
 * Legge la tabella a un rango. Oltre l'ultimo rango: l'ultimo punto (che e' il
 * carry-forward gia' scritto nella tabella, non un'estrapolazione nuova).
 */
export function readPriceCurve(curve: GenPriceCurve, rank: number): PriceCurvePoint {
  if (!Number.isInteger(rank) || rank < 1) throw new Error("readPriceCurve: il rango deve essere un intero ≥ 1");
  const index = Math.min(rank, curve.points.length) - 1;
  const point = curve.points[index];
  if (point === undefined) throw new Error("readPriceCurve: tabella vuota");
  return point;
}

export interface PricePrediction {
  readonly rank: number;
  readonly median: number;
  readonly p25: number;
  readonly p75: number;
  readonly p90: number;
  readonly n: number;
  /** Fattore applicato dalla rinormalizzazione: 1 quando non si rinormalizza. */
  readonly poolRatio: number;
}

/**
 * La predizione di prezzo: tabella letta al rango, riscalata, minimo 1 credito.
 *
 * Tutti e quattro i quantili si riscalano insieme: rinormalizzare la sola
 * mediana produrrebbe una banda che non contiene piu' il suo centro.
 */
export function predictPriceFromCurve(curve: GenPriceCurve, rank: number, targetPool: number): PricePrediction {
  const point = readPriceCurve(curve, rank);
  const poolRatio =
    curve.renormalization === "poolRatio" && curve.meanTrainPool > 0 ? targetPool / curve.meanTrainPool : 1;
  const scale = (value: number): number => Math.max(PRICE_MIN_CREDITS, value * poolRatio);
  return {
    rank,
    median: scale(point.median),
    p25: scale(point.p25),
    p75: scale(point.p75),
    p90: scale(point.p90),
    n: point.n,
    poolRatio,
  };
}

/** Una riga del ranking point-in-time (§B.3, B0-T3; §D.9, contesti). */
export interface PointInTimeRankingRow {
  readonly playerKey: string;
  readonly role: GenRole;
  /** Fantamedia `s−1` SHRUNK (B0-T2): l'ordinamento e' quello, non la fantamedia grezza. */
  readonly shrunkFantamedia: number;
  /** Presenze `s−1`: primo tie-break. */
  readonly presenze: number;
  /** Nome normalizzato: ultimo tie-break, deterministico. */
  readonly normalizedName: string;
}

/**
 * Il ranking point-in-time per ruolo: fantamedia `s−1` shrunk decrescente,
 * pareggi per presenze, poi nome normalizzato (§B.3, B0-T3).
 *
 * «Point-in-time» e' la parte che conta: l'ordine e' quello che si conosceva
 * PRIMA dell'asta, non quello dei prezzi pagati. Ordinare per prezzo e poi
 * predire il prezzo sarebbe predire il passato.
 */
export function pointInTimeRanking(rows: readonly PointInTimeRankingRow[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  const byRole = new Map<GenRole, PointInTimeRankingRow[]>();
  for (const row of rows) {
    const bucket = byRole.get(row.role);
    if (bucket === undefined) byRole.set(row.role, [row]);
    else bucket.push(row);
  }
  for (const bucket of byRole.values()) {
    const sorted = [...bucket].sort((a, b) => {
      const byValue = fallbackToLowest(b.shrunkFantamedia) - fallbackToLowest(a.shrunkFantamedia);
      if (byValue !== 0) return byValue;
      const byPresenze = b.presenze - a.presenze;
      if (byPresenze !== 0) return byPresenze;
      return a.normalizedName < b.normalizedName ? -1 : a.normalizedName > b.normalizedName ? 1 : 0;
    });
    for (let i = 0; i < sorted.length; i++) out.set(sorted[i]!.playerKey, i + 1);
  }
  return out;
}

/** Una fantamedia non finita finisce in fondo, non in cima: `NaN` non e' «bravissimo». */
function fallbackToLowest(value: number): number {
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

/** Le fasce di rango dei residui di §B.5: 1–3, 4–8, 9–15, 16–30, 31+. */
export const PRICE_RESIDUAL_RANK_BANDS: readonly (readonly [number, number])[] = [
  [1, 3],
  [4, 8],
  [9, 15],
  [16, 30],
  [31, Number.POSITIVE_INFINITY],
] as const;

export interface PriceResidualEntry {
  readonly rank: number;
  readonly actual: number;
  readonly predicted: number;
}

export interface PriceResidualBand {
  readonly from: number;
  readonly to: number;
  readonly n: number;
  /** Quantili dei residui `reale − predetto` (§B.5): l'ingrediente di `target_band` (§D.11). */
  readonly p25: number;
  readonly p75: number;
  readonly p90: number;
  /** Bias FIRMATO `media(predetto − reale)`: negativo = si prevede meno di quanto si e' pagato (§B.2). */
  readonly signedBias: number;
}

/**
 * I quantili dei residui per fascia di rango (§B.5) col bias firmato accanto.
 *
 * Il bias e' firmato e si riporta: §4-quinquies chiede che il prezzo previsto
 * «sbagli verso il basso, e lo dica». Una banda senza il suo bias e' una banda
 * centrata su un numero che non e' al centro.
 */
export function residualQuantilesByRankBand(entries: readonly PriceResidualEntry[]): readonly PriceResidualBand[] {
  return PRICE_RESIDUAL_RANK_BANDS.map(([from, to]) => {
    const inBand = entries.filter((entry) => entry.rank >= from && entry.rank <= to);
    if (inBand.length === 0) {
      return { from, to, n: 0, p25: NaN, p75: NaN, p90: NaN, signedBias: NaN };
    }
    const residuals = inBand.map((entry) => entry.actual - entry.predicted).sort((a, b) => a - b);
    return {
      from,
      to,
      n: inBand.length,
      p25: quantileType7(residuals, 0.25),
      p75: quantileType7(residuals, 0.75),
      p90: quantileType7(residuals, 0.9),
      signedBias: signedMeanError(
        inBand.map((entry) => entry.actual),
        inBand.map((entry) => entry.predicted),
      ),
    };
  });
}

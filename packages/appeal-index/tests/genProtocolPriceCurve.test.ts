import { describe, it, expect } from "vitest";
import {
  AUCTION_TOTAL_CREDITS,
  AUCTION_TOTAL_SLOTS,
  PRICE_BAND_WIDTHS,
  PRICE_CURVE_CANDIDATES,
  PRICE_MIN_CREDITS,
  PRICE_RENORMALIZATIONS,
  PRICE_RESIDUAL_RANK_BANDS,
  PRICE_SMOOTHINGS,
  auctionPool,
  buildPriceCurve,
  isotonicDecreasingPava,
  pointInTimeRanking,
  predictPriceFromCurve,
  readPriceCurve,
  residualQuantilesByRankBand,
  type GenAuctionRow,
} from "../src/genProtocol/priceCurve.js";

const AUCTIONS: GenAuctionRow[] = [
  { auction: "a1", playerKey: "A1", role: "C", price: 90, isRenewal: false },
  { auction: "a1", playerKey: "A2", role: "C", price: 45, isRenewal: false },
  { auction: "a1", playerKey: "A3", role: "C", price: 30, isRenewal: false },
  { auction: "a1", playerKey: "A4", role: "C", price: 10, isRenewal: false },
  { auction: "a2", playerKey: "B1", role: "C", price: 70, isRenewal: false },
  { auction: "a2", playerKey: "B2", role: "C", price: 55, isRenewal: false },
  { auction: "a2", playerKey: "B3", role: "C", price: 20, isRenewal: false },
  { auction: "a2", playerKey: "B4", role: "C", price: 12, isRenewal: false },
];

describe("genProtocol/priceCurve — l'enumerazione dei 12 candidati (§D.11, §D.14)", () => {
  it("sono esattamente 12: 3 larghezze × 2 smoothing × 2 rinormalizzazioni", () => {
    expect(PRICE_BAND_WIDTHS).toEqual([1, 2, 3]);
    expect(PRICE_SMOOTHINGS).toEqual(["none", "isotonicDecreasing"]);
    expect(PRICE_RENORMALIZATIONS).toEqual(["poolRatio", "none"]);
    expect(PRICE_CURVE_CANDIDATES).toHaveLength(12);
    expect(new Set(PRICE_CURVE_CANDIDATES.map((c) => JSON.stringify(c))).size).toBe(12);
  });

  it("le costanti d'asta sono 4.000 crediti, 224 slot, minimo 1 credito", () => {
    expect(AUCTION_TOTAL_CREDITS).toBe(4000);
    expect(AUCTION_TOTAL_SLOTS).toBe(224);
    expect(PRICE_MIN_CREDITS).toBe(1);
  });

  it("il pool e' 4.000 meno la spesa in rinnovi", () => {
    const conRinnovi: GenAuctionRow[] = [
      ...AUCTIONS,
      { auction: "a1", playerKey: "R1", role: "D", price: 150, isRenewal: true },
      { auction: "a1", playerKey: "R2", role: "A", price: 50, isRenewal: true },
    ];
    expect(auctionPool(conRinnovi, "a1")).toBe(3800);
    expect(auctionPool(conRinnovi, "a2")).toBe(4000);
  });
});

describe("genProtocol/priceCurve — la tabella e le sue letture", () => {
  it("larghezza 1: mediana per rango fra le aste", () => {
    const curve = buildPriceCurve(AUCTIONS, "C", ["a1", "a2"], {
      bandWidth: 1,
      smoothing: "none",
      renormalization: "none",
    });
    // Rango 1: mediana di {90, 70} = 80; rango 2: {55, 45} = 50; rango 3: {30, 20} = 25.
    expect(curve.points[0]!.median).toBeCloseTo(80, 12);
    expect(curve.points[1]!.median).toBeCloseTo(50, 12);
    expect(curve.points[2]!.median).toBeCloseTo(25, 12);
    expect(curve.points[0]!.n).toBe(2);
  });

  it("larghezza 2: i ranghi si fondono a coppie e la `n` raddoppia", () => {
    const curve = buildPriceCurve(AUCTIONS, "C", ["a1", "a2"], {
      bandWidth: 2,
      smoothing: "none",
      renormalization: "none",
    });
    // Fascia 1–2: {90, 70, 55, 45} -> mediana 62,5, e i ranghi 1 e 2 la condividono.
    expect(curve.points[0]!.median).toBeCloseTo(62.5, 12);
    expect(curve.points[1]!.median).toBeCloseTo(62.5, 12);
    expect(curve.points[0]!.n).toBe(4);
  });

  it("i quantili viaggiano con la mediana e sono ordinati", () => {
    const curve = buildPriceCurve(AUCTIONS, "C", ["a1", "a2"], {
      bandWidth: 3,
      smoothing: "none",
      renormalization: "none",
    });
    for (const point of curve.points) {
      expect(point.p25).toBeLessThanOrEqual(point.median);
      expect(point.median).toBeLessThanOrEqual(point.p75);
      expect(point.p75).toBeLessThanOrEqual(point.p90);
    }
  });

  it("il carry-forward riempie i ranghi mancanti con l'ultimo osservato, e lo dichiara", () => {
    const sbilanciate: GenAuctionRow[] = [
      ...AUCTIONS,
      { auction: "a1", playerKey: "A5", role: "C", price: 5, isRenewal: false },
      { auction: "a1", playerKey: "A6", role: "C", price: 3, isRenewal: false },
    ];
    const curve = buildPriceCurve(sbilanciate, "C", ["a1", "a2"], {
      bandWidth: 1,
      smoothing: "none",
      renormalization: "none",
    });
    expect(curve.points).toHaveLength(6);
    expect(curve.points[4]!.carriedForward).toBe(false);
    // Oltre l'ultimo rango la lettura resta l'ultimo punto, non un'estrapolazione.
    expect(readPriceCurve(curve, 99).rank).toBe(6);
  });

  it("la rinormalizzazione pool-ratio scala tutti e quattro i quantili insieme", () => {
    const curve = buildPriceCurve(AUCTIONS, "C", ["a1", "a2"], {
      bandWidth: 1,
      smoothing: "none",
      renormalization: "poolRatio",
    });
    const full = predictPriceFromCurve(curve, 1, 4000);
    const half = predictPriceFromCurve(curve, 1, 2000);
    expect(half.median).toBeCloseTo(full.median / 2, 10);
    expect(half.p90).toBeCloseTo(full.p90 / 2, 10);
    expect(half.poolRatio).toBeCloseTo(0.5, 12);
  });

  it("senza rinormalizzazione il pool non entra nel numero", () => {
    const curve = buildPriceCurve(AUCTIONS, "C", ["a1", "a2"], {
      bandWidth: 1,
      smoothing: "none",
      renormalization: "none",
    });
    expect(predictPriceFromCurve(curve, 1, 2000).median).toBeCloseTo(
      predictPriceFromCurve(curve, 1, 4000).median,
      12,
    );
  });
});

describe("genProtocol/priceCurve — PAVA isotonico decrescente", () => {
  it("una sequenza gia' decrescente resta identica", () => {
    expect(isotonicDecreasingPava([10, 8, 5, 2])).toEqual([10, 8, 5, 2]);
  });

  it("un gradino all'insu' viene assorbito nella media pesata del blocco", () => {
    // [10, 4, 6, 2]: 4 e 6 violano -> blocco di media 5.
    expect(isotonicDecreasingPava([10, 4, 6, 2])).toEqual([10, 5, 5, 2]);
  });

  it("con pesi, il blocco fuso e' la media PESATA", () => {
    // [4, 6] con pesi [3, 1] -> (4·3 + 6·1)/4 = 4,5.
    expect(isotonicDecreasingPava([10, 4, 6, 2], [1, 3, 1, 1])).toEqual([10, 4.5, 4.5, 2]);
  });

  it("lo smoothing rende la curva non crescente in ogni suo quantile", () => {
    // Il gradino nasce dalla PROFONDITA' DISUGUALE delle aste: a1 ha 5 acquisti
    // di ruolo D, a2 solo 3. Ai ranghi 1–3 la mediana media due aste, dal rango
    // 4 in poi legge la sola a1 — e la a1 e' l'asta con i prezzi alti. Con aste
    // di pari profondita' la curva sarebbe monotona per costruzione e lo
    // smoothing non avrebbe niente da fare; e' questo il caso in cui serve.
    const rumorose: GenAuctionRow[] = [
      { auction: "a1", playerKey: "N1", role: "D", price: 100, isRenewal: false },
      { auction: "a1", playerKey: "N2", role: "D", price: 90, isRenewal: false },
      { auction: "a1", playerKey: "N3", role: "D", price: 80, isRenewal: false },
      { auction: "a1", playerKey: "N4", role: "D", price: 70, isRenewal: false },
      { auction: "a1", playerKey: "N5", role: "D", price: 60, isRenewal: false },
      { auction: "a2", playerKey: "M1", role: "D", price: 50, isRenewal: false },
      { auction: "a2", playerKey: "M2", role: "D", price: 40, isRenewal: false },
      { auction: "a2", playerKey: "M3", role: "D", price: 30, isRenewal: false },
    ];
    const grezza = buildPriceCurve(rumorose, "D", ["a1", "a2"], {
      bandWidth: 1,
      smoothing: "none",
      renormalization: "none",
    });
    const lisciata = buildPriceCurve(rumorose, "D", ["a1", "a2"], {
      bandWidth: 1,
      smoothing: "isotonicDecreasing",
      renormalization: "none",
    });
    // La grezza ha davvero il gradino: rango 4 (solo a1: 70) sopra rango 3
    // (mediana di {80, 30} = 55).
    expect(grezza.points[2]!.median).toBeCloseTo(55, 12);
    expect(grezza.points[3]!.median).toBeCloseTo(70, 12);
    expect(grezza.points[3]!.median).toBeGreaterThan(grezza.points[2]!.median);
    for (let i = 1; i < lisciata.points.length; i++) {
      expect(lisciata.points[i]!.median).toBeLessThanOrEqual(lisciata.points[i - 1]!.median + 1e-12);
      expect(lisciata.points[i]!.p90).toBeLessThanOrEqual(lisciata.points[i - 1]!.p90 + 1e-12);
    }
  });
});

describe("genProtocol/priceCurve — ranking point-in-time e residui (§B.3, §B.5)", () => {
  it("ordina per fantamedia shrunk, poi presenze, poi nome normalizzato", () => {
    const ranking = pointInTimeRanking([
      { playerKey: "K_C", role: "C", shrunkFantamedia: 7, presenze: 10, normalizedName: "carlo" },
      { playerKey: "K_A", role: "C", shrunkFantamedia: 7, presenze: 20, normalizedName: "anna" },
      { playerKey: "K_B", role: "C", shrunkFantamedia: 7, presenze: 10, normalizedName: "bruno" },
      { playerKey: "K_D", role: "C", shrunkFantamedia: 9, presenze: 1, normalizedName: "dario" },
      { playerKey: "K_E", role: "D", shrunkFantamedia: 5, presenze: 1, normalizedName: "elia" },
    ]);
    expect(ranking.get("K_D")).toBe(1);
    expect(ranking.get("K_A")).toBe(2);
    expect(ranking.get("K_B")).toBe(3);
    expect(ranking.get("K_C")).toBe(4);
    // Il ranking e' PER RUOLO: il difensore riparte da 1.
    expect(ranking.get("K_E")).toBe(1);
  });

  it("una fantamedia non finita finisce in fondo, non in cima", () => {
    const ranking = pointInTimeRanking([
      { playerKey: "K_NAN", role: "A", shrunkFantamedia: Number.NaN, presenze: 30, normalizedName: "a" },
      { playerKey: "K_OK", role: "A", shrunkFantamedia: 4, presenze: 1, normalizedName: "b" },
    ]);
    expect(ranking.get("K_OK")).toBe(1);
    expect(ranking.get("K_NAN")).toBe(2);
  });

  it("le fasce di rango dei residui sono quelle di §B.5, trascritte a mano", () => {
    expect(PRICE_RESIDUAL_RANK_BANDS.map(([from, to]) => [from, to])).toEqual([
      [1, 3],
      [4, 8],
      [9, 15],
      [16, 30],
      [31, Number.POSITIVE_INFINITY],
    ]);
  });

  it("il bias firmato dice il verso dell'errore: negativo = si prevede meno di quanto si paga", () => {
    const bands = residualQuantilesByRankBand([
      { rank: 1, actual: 100, predicted: 80 },
      { rank: 2, actual: 90, predicted: 70 },
      { rank: 3, actual: 80, predicted: 60 },
      { rank: 40, actual: 5, predicted: 5 },
    ]);
    const prima = bands[0]!;
    expect(prima.n).toBe(3);
    expect(prima.signedBias).toBeCloseTo(-20, 12);
    expect(prima.p25).toBeGreaterThan(0);
    // Una fascia vuota non inventa numeri.
    expect(bands[1]!.n).toBe(0);
    expect(bands[1]!.signedBias).toBeNaN();
  });
});

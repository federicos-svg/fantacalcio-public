import { describe, it, expect } from "vitest";
import {
  B0_T2_SHRINKAGE_K,
  FOREIGN_INDEX_MIN_RANGE_WIDTH,
  b0RoleDistribution,
  b0ShrunkMeanVote,
  b0T6Distribution,
  b0T8,
  fitB0,
  fitB0PriceCurve,
  predictB0N,
  predictB0Price,
  predictB0T1,
  predictB0T2,
  type B0TrainingRow,
} from "../src/genProtocol/baselinesB0.js";
import type { GenAuctionRow } from "../src/genProtocol/priceCurve.js";

const TRAIN: B0TrainingRow[] = [
  { role: "C", presenze: 10, fantamedia: 6, mediaVotoBase: 6 },
  { role: "C", presenze: 20, fantamedia: 7, mediaVotoBase: 6.2 },
  { role: "C", presenze: 30, fantamedia: 8, mediaVotoBase: 6.4 },
  { role: "D", presenze: 4, fantamedia: 5, mediaVotoBase: 5.8 },
  { role: "D", presenze: 8, fantamedia: 5.5, mediaVotoBase: 6 },
];

describe("genProtocol/baselinesB0 — le costanti congelate (§B.3)", () => {
  it("il k di B0-T2 e' 10, fisso", () => {
    expect(B0_T2_SHRINKAGE_K).toBe(10);
    expect(fitB0(TRAIN).shrinkageK).toBe(10);
  });
});

describe("genProtocol/baselinesB0 — B0-N, B0-T2, B0-T1", () => {
  const parameters = fitB0(TRAIN);

  it("B0-N e' la presenza di s−1; senza s−1 e' la MEDIANA di ruolo del training", () => {
    expect(predictB0N(parameters, { role: "C", presenzeLag1: 22, fantamediaLag1: 7 })).toBe(22);
    // Mediana di {10, 20, 30} = 20 — calcolata a mano.
    expect(predictB0N(parameters, { role: "C", presenzeLag1: null, fantamediaLag1: null })).toBe(20);
    // Mediana di {4, 8} = 6 (tipo 7: interpolazione fra i due).
    expect(predictB0N(parameters, { role: "D", presenzeLag1: null, fantamediaLag1: null })).toBe(6);
  });

  it("B0-T2 e' `(n·fm + 10·M_r)/(n + 10)` — verificato con l'aritmetica a mano", () => {
    // M_r per C = media di {6, 7, 8} = 7. Con n = 10 e fm = 5:
    // (10·5 + 10·7)/20 = 120/20 = 6.
    expect(predictB0T2(parameters, { role: "C", presenzeLag1: 10, fantamediaLag1: 5 })).toBeCloseTo(6, 12);
    // Senza riga in s−1: M_r.
    expect(predictB0T2(parameters, { role: "C", presenzeLag1: null, fantamediaLag1: null })).toBeCloseTo(7, 12);
  });

  it("una fantamedia molto lunga pesa piu' della prior; una cortissima meno", () => {
    const lungo = predictB0T2(parameters, { role: "C", presenzeLag1: 38, fantamediaLag1: 5 });
    const corto = predictB0T2(parameters, { role: "C", presenzeLag1: 2, fantamediaLag1: 5 });
    expect(lungo).toBeLessThan(corto);
    expect(corto).toBeGreaterThan(6.5); // due presenze non spostano quasi nulla dalla prior 7
  });

  it("B0-T1 e' il prodotto dei due, senza sorprese", () => {
    const input = { role: "C" as const, presenzeLag1: 10, fantamediaLag1: 5 };
    expect(predictB0T1(parameters, input)).toBeCloseTo(
      predictB0T2(parameters, input) * predictB0N(parameters, input),
      12,
    );
  });

  it("una stagione con T2 indefinito non entra nella media di ruolo (mai uno zero al suo posto)", () => {
    const conIndefinita = fitB0([...TRAIN, { role: "C", presenze: 0, fantamedia: null, mediaVotoBase: null }]);
    // La media di ruolo resta 7: la riga con N = 0 non porta un valore di T2.
    expect(predictB0T2(conIndefinita, { role: "C", presenzeLag1: null, fantamediaLag1: null })).toBeCloseTo(7, 12);
  });
});

describe("genProtocol/baselinesB0 — B0-TD e B0-T6", () => {
  const counts = [0, 0, 1, 2, 4, 2, 1, 0, 0];
  const parameters = fitB0([
    { role: "C", presenze: 10, fantamedia: 6, mediaVotoBase: 6, voteBinCounts: counts },
    { role: "C", presenze: 10, fantamedia: 6, mediaVotoBase: 6, voteBinCounts: counts },
  ]);

  it("B0-TD e' la distribuzione di ruolo pooled del training", () => {
    const distribution = b0RoleDistribution(parameters, "C")!;
    expect(distribution).toHaveLength(9);
    expect(distribution.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12);
    // Il bin centrale (voto 6) e' il piu' popolato: 4 su 10.
    expect(distribution[4]).toBeCloseTo(0.4, 12);
  });

  it("B0-T6 ricentra la distribuzione sulla media-voto shrunk, e la media torna", () => {
    const shrunk = b0ShrunkMeanVote(parameters, "C", 20, 6.6);
    const tilted = b0T6Distribution(parameters, "C", shrunk)!;
    expect(tilted.converged).toBe(true);
    expect(tilted.mean).toBeCloseTo(shrunk, 6);
    expect(tilted.probabilities.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 10);
  });

  it("senza distribuzione di ruolo, B0-T6 dice `null` invece di inventarne una", () => {
    const senzaTd = fitB0([{ role: "A", presenze: 5, fantamedia: 6, mediaVotoBase: 6 }]);
    expect(b0RoleDistribution(senzaTd, "A")).toBeNull();
    expect(b0T6Distribution(senzaTd, "A", 6)).toBeNull();
  });
});

describe("genProtocol/baselinesB0 — B0-T3, la curva rango→prezzo", () => {
  const rows: GenAuctionRow[] = [
    { auction: "a1", playerKey: "K1", role: "A", price: 100, isRenewal: false },
    { auction: "a1", playerKey: "K2", role: "A", price: 60, isRenewal: false },
    { auction: "a1", playerKey: "K3", role: "A", price: 20, isRenewal: false },
    { auction: "a1", playerKey: "R1", role: "A", price: 200, isRenewal: true },
    { auction: "a2", playerKey: "K4", role: "A", price: 120, isRenewal: false },
    { auction: "a2", playerKey: "K5", role: "A", price: 40, isRenewal: false },
  ];

  it("mediana fra le aste a ogni rango, carry-forward oltre l'ultimo osservato", () => {
    const curve = fitB0PriceCurve(rows, "A", ["a1", "a2"]);
    // Rango 1: mediana di {100, 120} = 110. Rango 2: mediana di {60, 40} = 50.
    expect(curve.points[0]!.median).toBeCloseTo(110, 12);
    expect(curve.points[1]!.median).toBeCloseTo(50, 12);
    // Rango 3 esiste solo in a1: mediana di {20} = 20, e non e' un carry-forward.
    expect(curve.points[2]!.median).toBeCloseTo(20, 12);
    expect(curve.points[2]!.carriedForward).toBe(false);
  });

  it("i rinnovi escono dalla popolazione ED entrano nel pool", () => {
    const curve = fitB0PriceCurve(rows, "A", ["a1", "a2"]);
    // pool(a1) = 4000 − 200 = 3800; pool(a2) = 4000. Medio = 3900.
    expect(curve.meanTrainPool).toBeCloseTo(3900, 12);
    // Il rinnovo da 200 non compare fra i prezzi della curva.
    expect(curve.points.some((point) => point.median === 200)).toBe(false);
  });

  it("la predizione riscala sul pool e non scende sotto 1 credito", () => {
    const curve = fitB0PriceCurve(rows, "A", ["a1", "a2"]);
    const prediction = predictB0Price(curve, 1, 1950);
    // 110 × 1950/3900 = 55.
    expect(prediction.median).toBeCloseTo(55, 12);
    const tiny = predictB0Price(curve, 3, 39);
    expect(tiny.median).toBeGreaterThanOrEqual(1);
  });
});

describe("genProtocol/baselinesB0 — B0-T8, il range di coorte", () => {
  it("il percentile e' quello della coorte e il range non e' mai piu' stretto di 12 punti", () => {
    const cohort = [1, 2, 3, 4, 5];
    const result = b0T8(cohort, 3);
    expect(result.percentile).toBeCloseTo(50, 12);
    expect(result.width).toBeGreaterThanOrEqual(FOREIGN_INDEX_MIN_RANGE_WIDTH);
    expect(result.range[0]).toBeGreaterThanOrEqual(0);
    expect(result.range[1]).toBeLessThanOrEqual(100);
  });

  it("il range non esce mai dalla scala, nemmeno agli estremi", () => {
    const cohort = [1, 2, 3, 4, 5];
    const basso = b0T8(cohort, 1);
    const alto = b0T8(cohort, 5);
    expect(basso.range[0]).toBe(0);
    expect(alto.range[1]).toBe(100);
    expect(basso.width).toBeGreaterThanOrEqual(FOREIGN_INDEX_MIN_RANGE_WIDTH);
  });

  it("un valore non osservabile non produce un percentile inventato", () => {
    expect(b0T8([1, 2, 3], Number.NaN).percentile).toBeNaN();
  });

  it("la larghezza minima di contratto e' 12 punti — valore scritto a mano", () => {
    expect(FOREIGN_INDEX_MIN_RANGE_WIDTH).toBe(12);
  });
});

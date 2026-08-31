import { describe, it, expect } from "vitest";
import {
  AUCTION_POOL_CREDITS,
  MIN_PRICE_BAND_SAMPLE,
  PRICE_RANK_BANDS,
  historicalPurchases,
  priceCurveBandAt,
  priceCurveBook,
  priceRankBandOf,
  type HistoricalPurchaseInput,
  type Role,
} from "../src/index.js";
import { SEASONS, curveOf, syntheticHistory } from "./priceFixtures.js";

const ONE = SEASONS[4]!;

describe("le fasce di rango — 1–3, 4–8, 9–15, 16–30, 31+", () => {
  it("sono cinque e coprono ogni rango senza buchi né sovrapposizioni", () => {
    expect(PRICE_RANK_BANDS).toHaveLength(5);
    for (let rank = 1; rank <= 60; rank++) {
      const bands = PRICE_RANK_BANDS.filter((b) => rank >= b.rankFirst && rank <= b.rankLast);
      expect(bands, `rango ${rank}`).toHaveLength(1);
    }
  });

  it("i confini stanno dove dichiarati, estremi inclusi", () => {
    const indexAt = (rank: number): number | null => priceRankBandOf(rank)?.index ?? null;
    expect([1, 3].map(indexAt)).toEqual([0, 0]);
    expect([4, 8].map(indexAt)).toEqual([1, 1]);
    expect([9, 15].map(indexAt)).toEqual([2, 2]);
    expect([16, 30].map(indexAt)).toEqual([3, 3]);
    expect([31, 500].map(indexAt)).toEqual([4, 4]);
  });

  it("l'ultima è aperta e lo DICE, invece di fingere un estremo misurato", () => {
    const last = PRICE_RANK_BANDS[4]!;
    expect(last.openEnded).toBe(true);
    expect(Number.isFinite(last.rankLast)).toBe(false);
    expect(PRICE_RANK_BANDS.slice(0, 4).every((b) => !b.openEnded)).toBe(true);
  });

  it("un rango che non è un rango non ha fascia: niente ripiego sulla prima", () => {
    expect(priceRankBandOf(0)).toBeNull();
    expect(priceRankBandOf(-1)).toBeNull();
    expect(priceRankBandOf(2.5)).toBeNull();
    expect(priceRankBandOf(Number.NaN)).toBeNull();
    expect(priceRankBandOf(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("historicalPurchases — il ruolo arriva dal chiamante, la copertura è dichiarata", () => {
  const rows: readonly HistoricalPurchaseInput[] = [
    { season: ONE, playerId: "noto", price: 40, acquisition: "asta" },
    { season: ONE, playerId: "ignoto", price: 30, acquisition: "asta" },
    { season: ONE, playerId: "rinnovato", price: 90, acquisition: "riconferma" },
    { season: ONE, playerId: "noto", price: Number.NaN, acquisition: "asta" },
    { season: ONE, playerId: "noto", price: -1, acquisition: "asta" },
    { season: "", playerId: "noto", price: 10, acquisition: "asta" },
  ];
  const roles = new Map<string, Role>([["noto", "A"]]);

  it("tiene le righe risolvibili e conta, una per una, quelle escluse", () => {
    const intake = historicalPurchases(rows, roles);
    expect(intake.seen).toBe(6);
    expect(intake.skipped).toEqual({
      "role-unresolved": 1,
      "price-invalid": 2,
      "season-empty": 1,
    });
    expect(intake.rows.map((r) => r.playerId)).toEqual(["noto", "rinnovato"]);
  });

  it("un RINNOVO senza ruolo resta: la sua spesa è pool, e il pool non ha ruoli", () => {
    const intake = historicalPurchases(rows, roles);
    const renewal = intake.rows.find((r) => r.playerId === "rinnovato");
    expect(renewal?.renewal).toBe(true);
    expect(renewal?.role).toBeNull();
    // …e infatti finisce nel pool: 4.000 − 90.
    const book = priceCurveBook(intake.rows);
    expect(book.poolBySeason.get(ONE)).toBe(AUCTION_POOL_CREDITS - 90);
  });

  it("NaN e prezzo negativo non attraversano: la mediana resterebbe un numero rotto", () => {
    const intake = historicalPurchases(rows, roles);
    expect(intake.rows.every((r) => Number.isFinite(r.price) && r.price >= 0)).toBe(true);
  });

  it("non lancia mai, nemmeno su un ingresso interamente rotto", () => {
    expect(() => historicalPurchases(rows, new Map())).not.toThrow();
    expect(historicalPurchases([], new Map()).rows).toEqual([]);
  });
});

describe("la curva — quantili per fascia, sul rango storico di prezzo", () => {
  // Tre prezzi in una stagione: ranghi 1, 2, 3, tutti in fascia 1–3.
  // Ordinati: [80, 90, 100]. Tipo 7: mediana 90, P25 85, P75 95, P90 98.
  const SIMPLE = [{ season: ONE, role: "A" as Role, prices: [90, 100, 80] }];

  it("i quattro quantili sono quelli del tipo 7, e `n` viaggia con loro", () => {
    const band = priceCurveBandAt(curveOf(SIMPLE, { minBandSample: 3 }), "A", 1)!;
    expect(band.n).toBe(3);
    expect(band.median).toBe(90);
    expect(band.p25).toBe(85);
    expect(band.p75).toBe(95);
    expect(band.p90).toBe(98);
    expect(band.sufficient).toBe(true);
    expect(band.reason).toBeNull();
  });

  it("il rango storico è quello del PREZZO decrescente, dentro la stagione", () => {
    // Due stagioni: in ciascuna il più caro è rango 1. La fascia 1–3 raccoglie
    // i tre prezzi di ogni stagione, non i tre più cari in assoluto.
    const book = curveOf(
      [
        { season: SEASONS[0]!, role: "A", prices: [100, 90, 80] },
        { season: SEASONS[1]!, role: "A", prices: [50, 40, 30] },
      ],
      { minBandSample: 6 },
    );
    const band = priceCurveBandAt(book, "A", 2)!;
    expect(band.n).toBe(6);
    // [30, 40, 50, 80, 90, 100] → mediana (50+80)/2 = 65.
    expect(band.median).toBe(65);
  });

  it("i pareggi di prezzo si sciolgono sulla chiave, e il libro è deterministico", () => {
    const specs = [{ season: ONE, role: "A" as Role, prices: [50, 50, 50, 50, 50] }];
    const first = curveOf(specs, { minBandSample: 3 });
    const second = curveOf(specs, { minBandSample: 3 });
    expect(priceCurveBandAt(first, "A", 1)).toEqual(priceCurveBandAt(second, "A", 1));
    expect(priceCurveBandAt(first, "A", 4)).toEqual(priceCurveBandAt(second, "A", 4));
  });

  it("il BIAS FIRMATO dice da che parte la mediana sbaglia, e di quanto", () => {
    // [10, 20, 100]: mediana 20. media(20 − pagato) = (10 + 0 − 80) / 3.
    const band = priceCurveBandAt(
      curveOf([{ season: ONE, role: "A", prices: [100, 20, 10] }], { minBandSample: 3 }),
      "A",
      1,
    )!;
    expect(band.median).toBe(20);
    expect(band.signedBias).toBeCloseTo(-23.3333, 4);
  });

  it("una distribuzione simmetrica ha bias zero: il segno non è decorativo", () => {
    const band = priceCurveBandAt(
      curveOf([{ season: ONE, role: "A", prices: [80, 90, 100] }], { minBandSample: 3 }),
      "A",
      1,
    )!;
    expect(band.signedBias).toBe(0);
  });

  it("ogni ruolo ha la sua curva, indipendente dalle altre", () => {
    const book = curveOf(
      [
        { season: ONE, role: "A", prices: [100, 90, 80] },
        { season: ONE, role: "P", prices: [3, 2, 1] },
      ],
      { minBandSample: 3 },
    );
    expect(priceCurveBandAt(book, "A", 1)?.median).toBe(90);
    expect(priceCurveBandAt(book, "P", 1)?.median).toBe(2);
    expect(priceCurveBandAt(book, "D", 1)?.reason).toBe("no-observations");
    expect(book.byRole.get("D")?.observations).toBe(0);
  });
});

describe("la curva NON inventa: ogni buco è dichiarato", () => {
  it("fascia senza osservazioni: quantili `null` tutti insieme, `n` a zero", () => {
    const band = priceCurveBandAt(
      curveOf([{ season: ONE, role: "A", prices: [100, 90, 80] }], { minBandSample: 3 }),
      "A",
      9,
    )!;
    expect(band.n).toBe(0);
    expect(band.reason).toBe("no-observations");
    expect(band.sufficient).toBe(false);
    expect([band.median, band.p25, band.p75, band.p90, band.signedBias]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("fascia sotto campione: il motivo la distingue da una fascia vuota", () => {
    const band = priceCurveBandAt(
      curveOf([{ season: ONE, role: "A", prices: [100, 90] }], { minBandSample: 3 }),
      "A",
      1,
    )!;
    expect(band.n).toBe(2);
    expect(band.reason).toBe("insufficient-sample");
    expect(band.median).toBeNull();
  });

  it("NESSUNA INTERPOLAZIONE: una fascia vuota fra due piene resta vuota", () => {
    // Ranghi 1–3 e 9–15 popolati, la fascia 4–8 no: la si costruisce saltando
    // le stagioni in cui i ranghi intermedi esisterebbero, cioè dando a ogni
    // stagione esattamente 3 prezzi e poi un'altra con 15.
    const book = curveOf(
      [
        { season: SEASONS[0]!, role: "A", prices: [100, 90, 80] },
        { season: SEASONS[1]!, role: "A", prices: [70, 60, 50] },
        { season: SEASONS[2]!, role: "A", prices: [40, 30, 20] },
      ],
      { minBandSample: 3 },
    );
    expect(priceCurveBandAt(book, "A", 1)?.sufficient).toBe(true);
    const empty = priceCurveBandAt(book, "A", 5)!;
    expect(empty.n).toBe(0);
    expect(empty.median).toBeNull();
    // La fascia piena accanto NON è stata copiata qui dentro.
    expect(empty.median).not.toBe(priceCurveBandAt(book, "A", 1)?.median);
  });

  it("oltre l'ultimo rango osservato non c'è estrapolazione: c'è `null`", () => {
    const book = curveOf([{ season: ONE, role: "A", prices: [100, 90, 80] }], { minBandSample: 3 });
    expect(priceCurveBandAt(book, "A", 400)?.median).toBeNull();
    expect(priceCurveBandAt(book, "A", 400)?.reason).toBe("no-observations");
  });

  it("il minimo di campione di default è quello del motore, ed è iniettabile", () => {
    expect(MIN_PRICE_BAND_SAMPLE).toBe(5);
    const specs = [{ season: ONE, role: "A" as Role, prices: [100, 90, 80] }];
    expect(curveOf(specs).minBandSample).toBe(MIN_PRICE_BAND_SAMPLE);
    expect(priceCurveBandAt(curveOf(specs), "A", 1)?.reason).toBe("insufficient-sample");
    expect(priceCurveBandAt(curveOf(specs, { minBandSample: 3 }), "A", 1)?.sufficient).toBe(true);
  });
});

describe("il pool — misurato dallo storico, mai dichiarato", () => {
  it("pool di stagione = crediti della lega − spesa in rinnovi di quella stagione", () => {
    const book = curveOf(
      [{ season: ONE, role: "A", prices: [100, 90, 80], renewals: [200, 300] }],
      { minBandSample: 3 },
    );
    expect(book.poolBySeason.get(ONE)).toBe(AUCTION_POOL_CREDITS - 500);
    expect(book.meanTrainPool).toBe(AUCTION_POOL_CREDITS - 500);
    expect(book.renewalRows).toBe(2);
  });

  it("`meanTrainPool` è la MEDIA dei pool delle stagioni del campione", () => {
    const book = curveOf(
      [
        { season: SEASONS[0]!, role: "A", prices: [100, 90, 80], renewals: [1000] },
        { season: SEASONS[1]!, role: "A", prices: [70, 60, 50], renewals: [2000] },
      ],
      { minBandSample: 3 },
    );
    // (3.000 + 2.000) / 2 = 2.500.
    expect(book.meanTrainPool).toBe(2500);
    expect(book.seasons).toEqual([SEASONS[0], SEASONS[1]]);
  });

  it("i rinnovi entrano nel pool e NON nella curva: due destini diversi", () => {
    const withRenewals = curveOf(
      [{ season: ONE, role: "A", prices: [100, 90, 80], renewals: [999] }],
      { minBandSample: 3 },
    );
    const without = curveOf([{ season: ONE, role: "A", prices: [100, 90, 80] }], {
      minBandSample: 3,
    });
    expect(priceCurveBandAt(withRenewals, "A", 1)).toEqual(priceCurveBandAt(without, "A", 1));
    expect(withRenewals.meanTrainPool).not.toBe(without.meanTrainPool);
  });

  it("senza stagioni non c'è pool medio: `null`, non uno zero né i 4.000 nudi", () => {
    const book = priceCurveBook([]);
    expect(book.meanTrainPool).toBeNull();
    expect(book.reason).toBe("no-history");
  });
});

describe("degradazioni della curva, una per una", () => {
  it("storico assente: `no-history`, e non «i prezzi sono bassi»", () => {
    const book = priceCurveBook([]);
    expect(book.reason).toBe("no-history");
    expect(book.rows).toBe(0);
    expect(book.seasons).toEqual([]);
  });

  it("solo rinnovi: `no-auction-rows` — c'è storico, ma nessun prezzo formato in gara", () => {
    const book = curveOf([{ season: ONE, role: "A", prices: [], renewals: [100, 200] }]);
    expect(book.reason).toBe("no-auction-rows");
    expect(book.rows).toBe(2);
    expect(book.meanTrainPool).toBe(AUCTION_POOL_CREDITS - 300);
  });

  it("storico presente e leggibile: nessun motivo, e il motivo è `null` non «ok»", () => {
    expect(curveOf([{ season: ONE, role: "A", prices: [100, 90, 80] }]).reason).toBeNull();
  });

  it("non lancia mai, su nessun ingresso", () => {
    const history = syntheticHistory([{ season: ONE, role: "A", prices: [1] }]);
    expect(() => priceCurveBook(historicalPurchases(history.rows, new Map()).rows)).not.toThrow();
  });
});

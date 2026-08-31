import { describe, it, expect } from "vitest";
import {
  AUCTION_POOL_CREDITS,
  MIN_INFLATION_SAMPLE,
  RENEWALS_SPEND_BEFORE_DECLARATIONS,
  anchorBook,
  expectedPriceContext,
  expectedPriceReading,
  measuredInflation,
  priceCurveBook,
  relativePriceReading,
  richestRivalCaps,
  roleRankBook,
  type AuctionEvent,
  type ExpectedPriceContextInput,
  type PlayerAnchor,
  type PriceCurveBook,
  type RankRow,
  type Role,
} from "../src/index.js";
import { TEAMS, anchor, buildLog, buy, fillRole, stateOf } from "./layer2Fixtures.js";
import { SEASONS, curveOf, rankRow, rowWithoutForecast } from "./priceFixtures.js";

const SELF = "psg";
const ONE = SEASONS[4]!;

// ─── Il laboratorio ──────────────────────────────────────────────────────────

/**
 * Curva sintetica leggibile: una stagione, tre prezzi in fascia 1–3 (mediana
 * 90, P25 85, P75 95) e 1.000 crediti di rinnovi, cioè pool storico 3.000.
 * Dichiarando 1.000 di rinnovi anche per stasera, `pool_ratio` vale 1 e
 * l'aritmetica resta controllabile a mano.
 */
const CURVE: PriceCurveBook = curveOf(
  [{ season: ONE, role: "A", prices: [100, 90, 80], renewals: [1000] }],
  { minBandSample: 3 },
);
const RENEWALS_TONIGHT = 1000;

/** Curva ASIMMETRICA: mediana 20, P25 15, P75 60 — bias firmato negativo. */
const SKEWED: PriceCurveBook = curveOf(
  [{ season: ONE, role: "A", prices: [100, 20, 10], renewals: [1000] }],
  { minBandSample: 3 },
);

/** Listino sintetico del ruolo A: 150 crediti di ancore in tutto. */
const LISTINO: PlayerAnchor[] = [
  anchor("a1", "A", 50),
  anchor("a2", "A", 40),
  anchor("a3", "A", 30),
  anchor("a4", "A", 20),
  anchor("a5", "A", 10),
];
const ANCHORS = anchorBook(LISTINO);

/** Ruolo A: pagati 180 su ancore 150 → inflazione +20%, su campione 5. */
const A_SPECS = [
  buy("a1", "A", "new_milf", 60),
  buy("a2", "A", "ataturk", 50),
  buy("a3", "A", SELF, 35),
  buy("a4", "A", "ac_vostra", 25),
  buy("a5", "A", "new_casatiello", 10),
];

/** Le righe di listone: `x1` è il primo del ruolo, quindi rango 1, fascia 1–3. */
const ROWS: readonly RankRow[] = [
  rankRow("x1", "A", 300, 38),
  rankRow("x2", "A", 250, 30),
  rankRow("x3", "A", 200, 25),
  rankRow("x4", "A", 150, 20),
];
const RANKS = roleRankBook(ROWS);

/** Spesa che lascia a ogni rivale un max bid vero di `500 − spend − 26`. */
function drain(spendByTeam: (team: string) => number): AuctionEvent[] {
  return buildLog(
    TEAMS.filter((t) => t !== SELF).map((t) => buy(`fill:${t}:D:0`, "D", t, spendByTeam(t))),
  );
}

function contextOf(
  log: readonly AuctionEvent[],
  overrides: Partial<ExpectedPriceContextInput> = {},
): ReturnType<typeof expectedPriceContext> {
  return expectedPriceContext({
    curves: CURVE,
    ranks: RANKS,
    inflation: measuredInflation(log, ANCHORS),
    state: stateOf(log),
    selfId: SELF,
    renewalsSpend: RENEWALS_TONIGHT,
    ...overrides,
  });
}

// ─── Il rango ────────────────────────────────────────────────────────────────

describe("roleRankBook — l'ordine del listone per T1̂, venduti inclusi", () => {
  it("ordina per `T1̂` decrescente dentro il ruolo", () => {
    expect(["x1", "x2", "x3", "x4"].map((id) => RANKS.byPlayerId.get(id)?.rank)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(RANKS.rankedByRole.get("A")).toBe(4);
  });

  it("pareggio su `T1̂`: decide `N̂` decrescente", () => {
    const book = roleRankBook([rankRow("basso", "A", 200, 10), rankRow("alto", "A", 200, 30)]);
    expect(book.byPlayerId.get("alto")?.rank).toBe(1);
    expect(book.byPlayerId.get("basso")?.rank).toBe(2);
  });

  it("pareggio su entrambi: decide la chiave di listone, crescente", () => {
    const book = roleRankBook([rankRow("zulu", "A", 200, 30), rankRow("alfa", "A", 200, 30)]);
    expect(book.byPlayerId.get("alfa")?.rank).toBe(1);
    expect(book.byPlayerId.get("zulu")?.rank).toBe(2);
  });

  it("I VENDUTI ENTRANO NEL RANGO, e il conto lo dichiara", () => {
    const book = roleRankBook([
      rankRow("venduto", "A", 400, 38, true),
      rankRow("libero", "A", 300, 30),
    ]);
    expect(book.byPlayerId.get("venduto")?.rank).toBe(1);
    expect(book.byPlayerId.get("libero")?.rank).toBe(2);
    expect(book.soldRanked).toBe(1);
  });

  it("…e la differenza è reale: senza il venduto il libero salirebbe di rango", () => {
    const senza = roleRankBook([rankRow("libero", "A", 300, 30)]);
    expect(senza.byPlayerId.get("libero")?.rank).toBe(1);
    expect(senza.soldRanked).toBe(0);
  });

  it("i ruoli sono indipendenti: il rango è dentro il ruolo, non nel listone intero", () => {
    const book = roleRankBook([rankRow("attaccante", "A", 100, 30), rankRow("difensore", "D", 900, 38)]);
    expect(book.byPlayerId.get("attaccante")?.rank).toBe(1);
    expect(book.byPlayerId.get("difensore")?.rank).toBe(1);
    expect(book.rankedByRole.get("C")).toBe(0);
  });

  it("riga senza deposito: nessun rango, e NON in fondo alla classifica", () => {
    const book = roleRankBook([rankRow("con", "A", 100, 20), rowWithoutForecast("senza", "A")]);
    expect(book.withoutForecast.has("senza")).toBe(true);
    expect(book.byPlayerId.has("senza")).toBe(false);
    expect(book.rankedByRole.get("A")).toBe(1);
  });

  it("una previsione non finita NON è una previsione: fuori dai ranghi, non ultima", () => {
    const rotta: RankRow = {
      playerId: "rotta",
      role: "A",
      forecast: { total: Number.NaN, appearances: 30 },
      sold: false,
    };
    const book = roleRankBook([rankRow("sana", "A", 100, 20), rotta]);
    expect(book.withoutForecast.has("rotta")).toBe(true);
    expect(book.byPlayerId.get("sana")?.rank).toBe(1);
  });
});

// ─── Il tetto del più ricco ──────────────────────────────────────────────────

describe("richestRivalCaps — un tetto per ruolo, non uno per candidato", () => {
  it("a tavolo fresco il tetto è il max bid vero di chiunque, e io ne sono fuori", () => {
    const caps = richestRivalCaps(stateOf([]), SELF);
    expect([...caps.keys()].sort()).toEqual(["A", "C", "D", "P"]);
    expect(caps.get("A")).toBe(473);
  });

  it("il tetto è il PIÙ RICCO fra gli eleggibili, misurato sul ruolo", () => {
    const log = drain((t) => (t === "ataturk" ? 430 : 460));
    // 500 − 430 − 26 = 44 il più ricco; 500 − 460 − 26 = 14 gli altri.
    expect(richestRivalCaps(stateOf(log), SELF).get("A")).toBe(44);
  });

  it("nessun rivale eleggibile: `null`, che non è zero", () => {
    const log = buildLog(TEAMS.filter((t) => t !== SELF).flatMap((t) => fillRole(t, "A", 7, 1)));
    expect(richestRivalCaps(stateOf(log), SELF).get("A")).toBeNull();
    expect(richestRivalCaps(stateOf(log), SELF).get("D")).not.toBeNull();
  });
});

// ─── La catena di `P̂` ────────────────────────────────────────────────────────

describe("P̂ — la catena, coi suoi fattori dichiarati uno per uno", () => {
  it("con inflazione di ruolo qualificata: base × pool_ratio × (1 + infl)", () => {
    const reading = expectedPriceReading("x1", contextOf(buildLog(A_SPECS)));
    expect(reading.kind).toBe("prezzo");
    if (reading.kind !== "prezzo") return;
    expect(reading.chain.base).toBe(90);
    expect(reading.chain.poolRatio).toBe(1);
    expect(reading.chain.roleInflation).toBeCloseTo(0.2, 10);
    expect(reading.chain.inflationBasis).toBe("role-inflation");
    expect(reading.chain.inflationSample).toBe(MIN_INFLATION_SAMPLE);
    expect(reading.chain.appliedFactor).toBeCloseTo(1.2, 10);
    expect(reading.chain.marketPrice).toBe(108);
    expect(reading.credits).toBe(108);
  });

  it("senza inflazione qualificata il fattore NON entra, e non diventa un 1 muto", () => {
    // Due soli acquisti ancorati: campione sotto MIN_INFLATION_SAMPLE.
    const reading = expectedPriceReading("x1", contextOf(buildLog(A_SPECS.slice(0, 2))));
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(reading.chain.roleInflation).toBeNull();
    expect(reading.chain.inflationBasis).toBe("none");
    expect(reading.chain.inflationSample).toBe(2);
    expect(reading.chain.appliedFactor).toBe(1);
    expect(reading.credits).toBe(90);
  });

  it("l'inflazione è quella del RUOLO: un altro ruolo caldo non la presta", () => {
    const otherRole: PlayerAnchor[] = [
      anchor("d1", "D", 10),
      anchor("d2", "D", 10),
      anchor("d3", "D", 10),
      anchor("d4", "D", 10),
      anchor("d5", "D", 10),
    ];
    const book = anchorBook([...LISTINO, ...otherRole]);
    const log = buildLog([
      buy("d1", "D", "new_milf", 30),
      buy("d2", "D", "ataturk", 30),
      buy("d3", "D", "ac_vostra", 30),
      buy("d4", "D", "new_casatiello", 30),
      buy("d5", "D", "ataturk", 30),
    ]);
    const reading = expectedPriceReading(
      "x1",
      contextOf(log, { inflation: measuredInflation(log, book), state: stateOf(log) }),
    );
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(reading.chain.inflationBasis).toBe("none");
    expect(reading.credits).toBe(90);
  });

  it("il rango sceglie la fascia, e la fascia sceglie la base", () => {
    const reading = expectedPriceReading("x1", contextOf([]));
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(reading.chain.rank).toBe(1);
    expect(reading.chain.band.index).toBe(0);
    expect(reading.chain.band.rankFirst).toBe(1);
  });

  it("`P̂` non scende mai sotto il floor: `max(COST_FLOOR, round(...))`", () => {
    const cheap = curveOf([{ season: ONE, role: "A", prices: [1, 1, 1], renewals: [3990] }], {
      minBandSample: 3,
    });
    // pool storico 10, pool di stasera 10 → rapporto 1; base 1 → 1.
    const reading = expectedPriceReading(
      "x1",
      contextOf([], { curves: cheap, renewalsSpend: AUCTION_POOL_CREDITS - 10 }),
    );
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(reading.credits).toBe(1);
  });
});

describe("il tetto del più ricco chiude la catena", () => {
  it("quando il più ricco non arriva al prezzo di mercato, è lui a fissare il numero", () => {
    const log = drain((t) => (t === "ataturk" ? 430 : 460));
    const reading = expectedPriceReading("x1", contextOf(log));
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(reading.chain.marketPrice).toBe(90);
    expect(reading.chain.richestRivalMaxBid).toBe(44);
    expect(reading.credits).toBe(44);
    expect(reading.chain.cappedByRichest).toBe(true);
  });

  it("quando il tetto è più alto del mercato non morde, e lo dice", () => {
    const reading = expectedPriceReading("x1", contextOf([]));
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(reading.chain.richestRivalMaxBid).toBe(473);
    expect(reading.chain.cappedByRichest).toBe(false);
    expect(reading.credits).toBe(reading.chain.marketPrice);
  });

  it("nessun rivale eleggibile: nessun tetto, e il numero resta quello di mercato", () => {
    const log = buildLog(TEAMS.filter((t) => t !== SELF).flatMap((t) => fillRole(t, "A", 7, 1)));
    const reading = expectedPriceReading("x1", contextOf(log));
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(reading.chain.richestRivalMaxBid).toBeNull();
    expect(reading.chain.cappedByRichest).toBe(false);
    expect(reading.credits).toBe(reading.chain.marketPrice);
  });

  it("`P̂` guarda il PRIMO, il costo per vincere guarda il SECONDO: due fatti diversi", () => {
    // Il più ricco resta 44 in entrambi gli stati; cambia solo il secondo.
    const before = drain((t) => (t === "ataturk" ? 430 : 460));
    const after = drain((t) => (t === "ataturk" ? 430 : t === "new_milf" ? 450 : 460));

    const pBefore = expectedPriceReading("x1", contextOf(before));
    const pAfter = expectedPriceReading("x1", contextOf(after));
    if (pBefore.kind !== "prezzo" || pAfter.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(pBefore.credits).toBe(pAfter.credits);

    const rBefore = relativePriceReading({ state: stateOf(before), role: "A", selfId: SELF });
    const rAfter = relativePriceReading({ state: stateOf(after), role: "A", selfId: SELF });
    if (rBefore.kind !== "prezzo" || rAfter.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(rBefore.credits).not.toBe(rAfter.credits);
    // …e nessuno dei due è la media dell'altro: restano due numeri accostati.
    expect(pAfter.credits).not.toBe(rAfter.credits);
  });
});

// ─── Il blocco d'incertezza ──────────────────────────────────────────────────

describe("l'incertezza viaggia col numero, sempre", () => {
  it("scarti dalla fascia, bias firmato e `n`: tutti e tre, accanto allo scalare", () => {
    const reading = expectedPriceReading("x1", contextOf([], { curves: SKEWED }));
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    // Fascia [10, 20, 100]: mediana 20, P25 15, P75 60.
    expect(reading.uncertainty.errMinus).toBe(5);
    expect(reading.uncertainty.errPlus).toBe(40);
    expect(reading.uncertainty.n).toBe(3);
    expect(reading.uncertainty.signedBias).toBeCloseTo(-23.3333, 4);
    expect(reading.uncertainty.biasDirection).toBe("basso");
  });

  it("il bias firmato dice la direzione a parole, non solo col segno", () => {
    const symmetric = expectedPriceReading("x1", contextOf([]));
    if (symmetric.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(symmetric.uncertainty.signedBias).toBe(0);
    expect(symmetric.uncertainty.biasDirection).toBe("nessuno");

    const high = curveOf([{ season: ONE, role: "A", prices: [100, 95, 10], renewals: [1000] }], {
      minBandSample: 3,
    });
    const reading = expectedPriceReading("x1", contextOf([], { curves: high }));
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(reading.uncertainty.biasDirection).toBe("alto");
  });

  it("gli scarti sono UNO SCALARE PIÙ DUE SCARTI, mai un intervallo di prezzo", () => {
    const reading = expectedPriceReading("x1", contextOf([]));
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    // Il tipo non espone nessuna coppia di estremi: il numero è uno solo, e
    // gli scarti sono etichettati come errore, non come prezzo.
    expect(Object.keys(reading.uncertainty).sort()).toEqual([
      "biasDirection",
      "errMinus",
      "errPlus",
      "n",
      "signedBias",
    ]);
    expect(typeof reading.credits).toBe("number");
  });

  it("nessuna lettura di prezzo esce senza il blocco: fail-closed sul tipo", () => {
    const readings = ["x1", "x2", "x3", "x4"].map((id) => expectedPriceReading(id, contextOf([])));
    for (const reading of readings) {
      if (reading.kind !== "prezzo") continue;
      expect(reading.uncertainty).toBeDefined();
      expect(reading.uncertainty.n).toBeGreaterThan(0);
    }
  });
});

// ─── Il pool ─────────────────────────────────────────────────────────────────

describe("pool_ratio — misurato, e dichiarato quando non c'è", () => {
  it("pool di stasera = crediti della lega − rinnovi dichiarati", () => {
    const context = contextOf([]);
    expect(context.currentPool).toBe(AUCTION_POOL_CREDITS - RENEWALS_TONIGHT);
    expect(context.poolRatio).toBe(1);
    expect(context.poolRatioReason).toBeNull();
    expect(context.renewalsSpendIsFallback).toBe(false);
  });

  it("senza riconferme dichiarate vale il ripiego 489, e il dato dice che è un ripiego", () => {
    const context = contextOf([], { renewalsSpend: undefined });
    expect(RENEWALS_SPEND_BEFORE_DECLARATIONS).toBe(489);
    expect(context.renewalsSpend).toBe(489);
    expect(context.renewalsSpendIsFallback).toBe(true);
    expect(context.currentPool).toBe(AUCTION_POOL_CREDITS - 489);
    expect(context.poolRatio).toBeCloseTo(3511 / 3000, 10);
  });

  it("il rapporto sposta il numero, e la catena mostra di quanto", () => {
    const reading = expectedPriceReading("x1", contextOf([], { renewalsSpend: undefined }));
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    // 90 × 3511/3000 = 105,33 → 105.
    expect(reading.chain.marketPrice).toBe(105);
    expect(reading.chain.currentPool).toBe(3511);
    expect(reading.chain.meanTrainPool).toBe(3000);
  });

  it("pool medio non calcolabile: il fattore NON entra e il motivo è dichiarato", () => {
    // Rinnovi pari all'intero pool: il pool storico è 0, quindi non c'è media.
    const flat = curveOf(
      [{ season: ONE, role: "A", prices: [100, 90, 80], renewals: [AUCTION_POOL_CREDITS] }],
      { minBandSample: 3 },
    );
    expect(flat.meanTrainPool).toBeNull();
    const context = contextOf([], { curves: flat });
    expect(context.poolRatio).toBeNull();
    expect(context.poolRatioReason).toBe("no-mean-train-pool");
    const reading = expectedPriceReading("x1", context);
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(reading.chain.appliedFactor).toBe(1);
    expect(reading.chain.poolRatio).toBeNull();
    expect(reading.chain.poolRatioReason).toBe("no-mean-train-pool");
    expect(reading.credits).toBe(90);
  });

  it("pool di stasera non positivo: stesso trattamento, motivo diverso", () => {
    const context = contextOf([], { renewalsSpend: AUCTION_POOL_CREDITS });
    expect(context.poolRatio).toBeNull();
    expect(context.poolRatioReason).toBe("current-pool-not-positive");
  });
});

// ─── Le degradazioni, una per una ────────────────────────────────────────────

describe("degradazioni di P̂ — un'assenza dichiarata, mai uno zero", () => {
  it("curva non formabile: `curva-assente`", () => {
    const reading = expectedPriceReading("x1", contextOf([], { curves: priceCurveBook([]) }));
    expect(reading).toEqual({ kind: "assente", reason: "curva-assente" });
  });

  it("riga senza deposito: `previsione-assente`", () => {
    const ranks = roleRankBook([...ROWS, rowWithoutForecast("muta", "A")]);
    const reading = expectedPriceReading("muta", contextOf([], { ranks }));
    expect(reading).toEqual({ kind: "assente", reason: "previsione-assente" });
  });

  it("giocatore che il listone non conosce: `rango-ignoto`, distinto dal precedente", () => {
    expect(expectedPriceReading("mai-visto", contextOf([]))).toEqual({
      kind: "assente",
      reason: "rango-ignoto",
    });
  });

  it("fascia senza osservazioni: `fascia-senza-osservazioni`", () => {
    // `x4` è rango 4, e la curva ha prezzi solo in fascia 1–3.
    expect(expectedPriceReading("x4", contextOf([]))).toEqual({
      kind: "assente",
      reason: "fascia-senza-osservazioni",
    });
  });

  it("fascia sotto campione: `fascia-sotto-campione`, che è un'altra cosa", () => {
    const thin = curveOf([{ season: ONE, role: "A", prices: [100, 90, 80], renewals: [1000] }]);
    expect(expectedPriceReading("x1", contextOf([], { curves: thin }))).toEqual({
      kind: "assente",
      reason: "fascia-sotto-campione",
    });
  });

  it("nessuna degradazione produce un numero: l'assenza non ha crediti", () => {
    const absences = [
      expectedPriceReading("mai-visto", contextOf([])),
      expectedPriceReading("x4", contextOf([])),
      expectedPriceReading("x1", contextOf([], { curves: priceCurveBook([]) })),
    ];
    for (const reading of absences) {
      expect(reading.kind).toBe("assente");
      expect(reading).not.toHaveProperty("credits");
    }
  });

  it("nessuna eccezione sul percorso critico, su nessun ingresso", () => {
    expect(() => expectedPriceReading("", contextOf([]))).not.toThrow();
    expect(() =>
      expectedPriceReading("x1", contextOf([], { ranks: roleRankBook([]) })),
    ).not.toThrow();
    expect(() => expectedPriceReading("x1", contextOf(buildLog(A_SPECS)))).not.toThrow();
  });

  it("deterministica: stesso contesto, stesso numero, sempre", () => {
    const log = buildLog(A_SPECS);
    expect(expectedPriceReading("x1", contextOf(log))).toEqual(
      expectedPriceReading("x1", contextOf(log)),
    );
  });
});

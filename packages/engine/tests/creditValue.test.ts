import { describe, it, expect } from "vitest";
import {
  AUCTION_POOL_CREDITS,
  AUCTION_ROSTER_SLOTS,
  COST_FLOOR,
  CREDIT_VALUE_GAMMAS,
  CREDIT_VALUE_UNRATIFIED_CHOICES,
  DECLARED_OVERRIDE_PROVENANCE,
  DEFAULT_CREDIT_VALUE_GAMMA,
  REPLACEMENT_RANK_BY_ROLE,
  RENEWALS_SPEND_BEFORE_DECLARATIONS,
  SEASON_MATCHDAYS,
  UNRATIFIED_CHOICES,
  anchorBook,
  compareCreditSurplus,
  creditValueBook,
  creditValueCredits,
  creditValueOf,
  declaredValueBook,
  expectedPriceContext,
  expectedPriceReading,
  measuredInflation,
  surplusCredits,
  surplusReading,
  type CreditValueBook,
  type CreditValueBookInput,
  type CreditValueReading,
  type ExpectedPriceContext,
  type PriceCurveBook,
  type RankRow,
} from "../src/index.js";
import { stateOf } from "./layer2Fixtures.js";
import { SEASONS, curveOf, priceLadder, rankLadder, rowWithoutForecast } from "./priceFixtures.js";

const SELF = "psg";
const ONE = SEASONS[4]!;

// ─── Il laboratorio ──────────────────────────────────────────────────────────
//
// UNA POPOLAZIONE PICCOLA MA VERA. Il rango di rimpiazzo dei portieri è 25:
// trenta righe sono il minimo per averne uno, e con quattro righe sopra il
// rimpiazzo l'aritmetica della ripartizione si controlla a mano.
//
//   `T1̂` = 60 per i primi quattro, 50 per tutti gli altri
//   ⇒ `T1̂(r* = 25)` = 50 ⇒ VORP = 10 per quattro righe, 0 per le altre 26
//   ⇒ Σ VORP = 40
//
// I rinnovi sono scelti perché `B_res` valga 42, cioè DUE crediti più della
// somma dei VORP: due unità di resto da assegnare, che è il caso in cui il
// metodo dei resti maggiori si vede lavorare.
const SMALL: readonly RankRow[] = rankLadder({
  role: "P",
  count: 30,
  totalAt: (rank) => (rank <= 4 ? 60 : 50),
});
/** `4.000 − 3.734 = 266` di pool, meno 224 slot: `B_res = 42`. */
const RENEWALS_SPEND = AUCTION_POOL_CREDITS - 266;

function bookOf(overrides: Partial<CreditValueBookInput> = {}): CreditValueBook {
  return creditValueBook({
    rows: SMALL,
    renewalsCount: 0,
    renewalsSpend: RENEWALS_SPEND,
    values: null,
    ...overrides,
  });
}

/** I crediti di una riga, o il motivo dell'assenza: un solo posto dove leggerli. */
function creditsOf(book: CreditValueBook, playerId: string): number | string {
  const reading = creditValueOf(playerId, book);
  return reading.kind === "valore" ? reading.credits : reading.reason;
}

function chainOf(reading: CreditValueReading) {
  if (reading.kind !== "valore" || reading.source !== "generatore") {
    throw new Error("atteso un valore dal generatore");
  }
  return reading.chain;
}

// ─── I numeri del regolamento, derivati e non copiati ────────────────────────

describe("i ranghi di rimpiazzo e gli slot del tavolo — derivati, non copiati", () => {
  it("`r*` vale 25/73/73/57, e ci arriva dal regolamento", () => {
    // Il DTI li porta come numeri chiusi; qui sono `slot del ruolo × squadre +
    // 1`. Che le due strade diano gli stessi quattro numeri è ciò che questo
    // test verifica: il giorno in cui divergessero, divergerebbero qui.
    expect(REPLACEMENT_RANK_BY_ROLE).toEqual({ P: 25, D: 73, C: 73, A: 57 });
  });

  it("gli slot del tavolo sono 224 e il pool 4.000, entrambi dal regolamento", () => {
    expect(AUCTION_ROSTER_SLOTS).toBe(224);
    expect(AUCTION_POOL_CREDITS).toBe(4000);
  });

  it("il ripiego dei rinnovi è QUELLO del passo 1, non una seconda copia", () => {
    expect(RENEWALS_SPEND_BEFORE_DECLARATIONS).toBe(489);
    const book = bookOf({ renewalsSpend: undefined });
    expect(book.renewalsSpend).toBe(RENEWALS_SPEND_BEFORE_DECLARATIONS);
    expect(book.renewalsSpendIsFallback).toBe(true);
  });

  it("le giornate sono 38, e servono solo allo sconto di disponibilità", () => {
    expect(SEASON_MATCHDAYS).toBe(38);
  });
});

// ─── VORP ────────────────────────────────────────────────────────────────────

describe("VORP — la sottrazione sul rango di rimpiazzo del ruolo", () => {
  it("`VORP = max(0, T1̂ − T1̂(r*))`, col rimpiazzo letto al rango giusto", () => {
    const chain = chainOf(creditValueOf("P:001", bookOf()));
    expect(chain.rank).toBe(1);
    expect(chain.replacementRank).toBe(25);
    expect(chain.forecastTotal).toBe(60);
    expect(chain.replacementTotal).toBe(50);
    expect(chain.vorp).toBe(10);
  });

  it("al rango di rimpiazzo e sotto, il VORP è 0 e il valore è il pavimento", () => {
    const book = bookOf();
    expect(chainOf(creditValueOf("P:025", book)).vorp).toBe(0);
    expect(creditsOf(book, "P:025")).toBe(COST_FLOOR);
    expect(creditsOf(book, "P:030")).toBe(COST_FLOOR);
    // E non è un'assenza travestita: il pavimento è ciò che la ripartizione
    // dice di lui, e la catena lo mostra.
    expect(chainOf(creditValueOf("P:030", book)).share).toBeNull();
  });

  it("il rimpiazzo è di RUOLO: un altro ruolo non presta il suo", () => {
    // Portieri e difensori con la stessa scala di `T1̂`: il rimpiazzo dei
    // portieri è al rango 25, quello dei difensori al 73. Con 30 difensori il
    // loro rimpiazzo non esiste, e i portieri non glielo prestano.
    const mixed = [...SMALL, ...rankLadder({ role: "D", count: 30, totalAt: (r) => (r <= 4 ? 60 : 50) })];
    const book = bookOf({ rows: mixed });
    expect(book.replacementTotalByRole.get("P")).toBe(50);
    expect(book.replacementTotalByRole.get("D")).toBeNull();
    expect(creditsOf(book, "P:001")).toBe(12);
    expect(creditsOf(book, "D:001")).toBe("rimpiazzo-assente");
  });

  it("`T1̂` si LEGGE: nessuna riga senza deposito riceve un totale inventato", () => {
    const book = bookOf({ rows: [...SMALL, rowWithoutForecast("muta", "P")] });
    expect(creditsOf(book, "muta")).toBe("previsione-assente");
    expect(book.withoutValue).toBe(1);
  });
});

// ─── Il metodo dei resti maggiori ────────────────────────────────────────────

describe("il largest-remainder — la somma torna, e un `round` per riga non la farebbe tornare", () => {
  it("ripartisce `B_res` per intero: `Σ (V − 1)` sui positivi è `B_res`", () => {
    const book = bookOf();
    expect(book.pool).toBe(266);
    expect(book.slots).toBe(AUCTION_ROSTER_SLOTS);
    expect(book.residualBudget).toBe(42);
    expect(book.vorpSum).toBe(40);
    expect(book.positiveVorpPlayers).toBe(4);

    const distributed = SMALL.reduce((sum, row) => {
      const reading = creditValueOf(row.playerId, book);
      if (reading.kind !== "valore" || reading.chain === null) return sum;
      return reading.chain.adjustedVorp > 0 ? sum + reading.credits - COST_FLOOR : sum;
    }, 0);
    expect(distributed).toBe(book.residualBudget);
    expect(book.distributedCredits).toBe(book.residualBudget);
  });

  it("le due unità di resto vanno a due righe, non a tutte e quattro", () => {
    const book = bookOf();
    // `42 × 10/40 = 10,5` per ciascuna: parte intera 10, resto 0,5 per tutte.
    for (const id of ["P:001", "P:002", "P:003", "P:004"]) {
      expect(chainOf(creditValueOf(id, book)).exactCredits).toBe(11.5);
    }
    expect([1, 2, 3, 4].map((i) => creditsOf(book, `P:00${i}`))).toEqual([12, 12, 11, 11]);
    expect([1, 2, 3, 4].map((i) => chainOf(creditValueOf(`P:00${i}`, book)).remainderUnit)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("un `Math.round` indipendente per riga sballerebbe la somma di due crediti", () => {
    // La dimostrazione del perché il metodo esiste: quattro righe a 11,5
    // arrotondate per conto loro fanno 44 crediti distribuiti al posto di 42,
    // cioè due crediti che il tavolo non ha.
    const book = bookOf();
    const naive = ["P:001", "P:002", "P:003", "P:004"]
      .map((id) => Math.round(chainOf(creditValueOf(id, book)).exactCredits))
      .reduce((sum, credits) => sum + credits - COST_FLOOR, 0);
    expect(naive).toBe(44);
    expect(book.distributedCredits).toBe(42);
  });

  it("deterministico: stesse righe, stessa ripartizione, sempre", () => {
    const first = bookOf();
    const shuffled = bookOf({ rows: [...SMALL].reverse() });
    for (const row of SMALL) {
      expect(creditsOf(shuffled, row.playerId)).toBe(creditsOf(first, row.playerId));
    }
  });
});

// ─── Lo sconto di disponibilità ──────────────────────────────────────────────

describe("γ — il default non aggiunge nulla, e acceso sposta nel verso giusto", () => {
  /** Stessa scala di `T1̂`, ma due righe su quattro giocano 10 giornate su 38. */
  const UNEVEN: readonly RankRow[] = rankLadder({
    role: "P",
    count: 30,
    totalAt: (rank) => (rank <= 4 ? 60 : 50),
    appearancesAt: (rank) => (rank <= 2 ? 38 : 10),
  });

  it("i tre valori ammessi sono {0, 0.25, 0.5} e il default è 0", () => {
    expect(CREDIT_VALUE_GAMMAS).toEqual([0, 0.25, 0.5]);
    expect(DEFAULT_CREDIT_VALUE_GAMMA).toBe(0);
    expect(bookOf().gamma).toBe(0);
  });

  it("a γ = 0 la correzione NON ESISTE: nessun fattore, nemmeno un 1 muto", () => {
    const book = bookOf({ rows: UNEVEN });
    const chain = chainOf(creditValueOf("P:003", book));
    expect(chain.availabilityFactor).toBeNull();
    expect(chain.adjustedVorp).toBe(chain.vorp);
    // Le presenze non cambiano un credito: 12/12/11/11 come senza di loro.
    expect([1, 2, 3, 4].map((i) => creditsOf(book, `P:00${i}`))).toEqual([12, 12, 11, 11]);
  });

  it("a γ = 0,25 chi gioca meno vale meno, e chi gioca tutto vale di più", () => {
    const book = bookOf({ rows: UNEVEN, gamma: 0.25 });
    const chain = chainOf(creditValueOf("P:003", book));
    expect(chain.availabilityFactor).toBeCloseTo(Math.pow(10 / SEASON_MATCHDAYS, 0.25), 10);
    expect(chain.adjustedVorp).toBeCloseTo(10 * Math.pow(10 / 38, 0.25), 10);
    // 12/12/11/11 diventa 13/13/10/10: i crediti si spostano DA chi gioca 10
    // giornate A chi ne gioca 38, che è il verso che la correzione dichiara.
    expect([1, 2, 3, 4].map((i) => creditsOf(book, `P:00${i}`))).toEqual([13, 13, 10, 10]);
    // E la somma continua a tornare: la correzione ripartisce, non crea.
    expect(book.distributedCredits).toBe(book.residualBudget);
  });

  it("a parità di presenze, γ non sposta niente: è uno sconto di DISPONIBILITÀ", () => {
    // Tutte le righe a stagione piena: il fattore è 1 per tutti e la
    // ripartizione è identica a quella di γ = 0.
    const flat = bookOf({ gamma: 0.5 });
    expect([1, 2, 3, 4].map((i) => creditsOf(flat, `P:00${i}`))).toEqual([12, 12, 11, 11]);
    expect(chainOf(creditValueOf("P:001", flat)).availabilityFactor).toBe(1);
  });
});

// ─── Il tetto della fascia ───────────────────────────────────────────────────

describe("il tetto P90 della fascia — spento di default, e quando morde lo dice", () => {
  /** Curva sintetica del ruolo P: tre prezzi a 5 in fascia 1–3, e nient'altro. */
  const CHEAP: PriceCurveBook = curveOf([{ season: ONE, role: "P", prices: [5, 5, 5] }], {
    minBandSample: 3,
  });

  it("di default è spento: nessun tetto, nessuna riga abbassata", () => {
    const book = bookOf();
    expect(book.priceCapEnabled).toBe(false);
    expect(book.cappedPlayers).toBe(0);
    expect(chainOf(creditValueOf("P:001", book)).bandCap).toBeNull();
    expect(chainOf(creditValueOf("P:001", book)).cappedByBand).toBe(false);
  });

  it("acceso, taglia a `floor(P90)` chi sta sopra e lo dichiara riga per riga", () => {
    const book = bookOf({ priceCap: { curves: CHEAP } });
    expect(book.priceCapEnabled).toBe(true);
    // I ranghi 1–3 stanno nella fascia misurata (P90 = 5): 12/12/11 → 5.
    for (const id of ["P:001", "P:002", "P:003"]) {
      const chain = chainOf(creditValueOf(id, book));
      expect(chain.bandCap).toBe(5);
      expect(chain.cappedByBand).toBe(true);
      expect(creditsOf(book, id)).toBe(5);
      // Il numero prima del tetto resta leggibile: il tetto non riscrive la
      // ripartizione, la limita.
      expect(chain.roundedCredits).toBeGreaterThan(5);
    }
    expect(book.cappedPlayers).toBe(3);
  });

  it("una fascia senza osservazioni non presta il tetto della vicina", () => {
    // Il rango 4 sta in fascia 4–8, che nella curva non ha nessun prezzo.
    const book = bookOf({ priceCap: { curves: CHEAP } });
    const chain = chainOf(creditValueOf("P:004", book));
    expect(chain.bandCap).toBeNull();
    expect(chain.cappedByBand).toBe(false);
    expect(creditsOf(book, "P:004")).toBe(11);
  });

  it("i crediti che il tetto libera NON tornano agli altri, e la somma lo dice", () => {
    const book = bookOf({ priceCap: { curves: CHEAP } });
    // (5−1)×3 + (11−1) = 22, sotto i 42 di `B_res`. Si dichiara invece di
    // rimettere in circolo venti crediti con un secondo giro che nessuno ha
    // descritto (`CREDIT_VALUE_CAP_DOES_NOT_REDISTRIBUTE`).
    expect(book.distributedCredits).toBe(22);
    expect(book.residualBudget).toBe(42);
  });
});

// ─── L'override ──────────────────────────────────────────────────────────────

describe("l'override di Pico — comanda, e non si media mai", () => {
  const VALUES = declaredValueBook([{ playerId: "P:001", declaredValue: 77 }]);

  it("dove il valore è dichiarato, quello È `V`, con la sua provenienza", () => {
    const book = bookOf({ values: VALUES });
    const reading = creditValueOf("P:001", book);
    expect(reading).toEqual({
      kind: "valore",
      source: "dichiarato",
      credits: 77,
      chain: null,
      provenance: DECLARED_OVERRIDE_PROVENANCE,
      ratification: book.ratification,
    });
    expect(book.declaredOverrides).toBe(1);
  });

  it("il numero è IL SUO: né una media col generatore, né un peso fra i due", () => {
    const book = bookOf({ values: VALUES });
    const generated = 12; // ciò che la ripartizione avrebbe dato a `P:001`
    expect(creditsOf(bookOf(), "P:001")).toBe(generated);
    const declared = 77;
    expect(creditsOf(book, "P:001")).toBe(declared);
    // Tutte le medie possibili fra i due sono numeri diversi da quello mostrato.
    for (const weight of [0.25, 0.5, 0.75]) {
      expect(creditsOf(book, "P:001")).not.toBe(
        Math.round(weight * declared + (1 - weight) * generated),
      );
    }
  });

  it("l'override non toglie crediti agli altri: sostituisce ciò che si mostra", () => {
    const book = bookOf({ values: VALUES });
    expect([2, 3, 4].map((i) => creditsOf(book, `P:00${i}`))).toEqual([12, 11, 11]);
    expect(book.distributedCredits).toBe(book.residualBudget);
  });

  it("un dichiarato con i decimali si riporta com'è: non si arrotonda una dichiarazione", () => {
    const book = bookOf({ values: declaredValueBook([{ playerId: "P:007", declaredValue: 7.5 }]) });
    expect(creditsOf(book, "P:007")).toBe(7.5);
  });

  it("il dichiarato comanda anche dove il generatore NON arriva", () => {
    // Un giocatore che il listone non porta: nessun rango, nessuna previsione.
    const book = bookOf({ values: declaredValueBook([{ playerId: "fuori", declaredValue: 30 }]) });
    expect(creditsOf(book, "fuori")).toBe(30);
    expect(creditsOf(bookOf(), "fuori")).toBe("rango-ignoto");
  });
});

// ─── Le assenze ──────────────────────────────────────────────────────────────

describe("l'assenza dichiarata — mai uno zero, mai una media di ruolo", () => {
  it("riga senza deposito e senza dichiarazione: `previsione-assente`", () => {
    const book = bookOf({ rows: [...SMALL, rowWithoutForecast("muta", "P")] });
    expect(creditValueOf("muta", book)).toEqual({
      kind: "assente",
      reason: "previsione-assente",
      ratification: book.ratification,
    });
  });

  it("giocatore che il libro non conosce: `rango-ignoto`, che è un'altra cosa", () => {
    expect(creditValueOf("mai-visto", bookOf()).kind).toBe("assente");
    expect(creditsOf(bookOf(), "mai-visto")).toBe("rango-ignoto");
  });

  it("ruolo che non arriva al rango di rimpiazzo: `rimpiazzo-assente`", () => {
    const short = rankLadder({ role: "P", count: 10, totalAt: (rank) => 100 - rank });
    const book = bookOf({ rows: short });
    expect(book.replacementTotalByRole.get("P")).toBeNull();
    expect(creditsOf(book, "P:001")).toBe("rimpiazzo-assente");
    expect(book.withoutValue).toBe(10);
  });

  it("residuo non positivo: la scala non si forma, e nessuno riceve uno zero", () => {
    const book = bookOf({ renewalsSpend: 3800 });
    expect(book.residualBudget).toBeLessThanOrEqual(0);
    expect(book.reason).toBe("budget-residuo-non-positivo");
    expect(creditsOf(book, "P:001")).toBe("scala-non-formabile");
    expect(book.withoutValue).toBe(SMALL.length);
  });

  it("nessuno sopra il rimpiazzo: `nessun-vorp-positivo`, non una fila di zeri", () => {
    const flat = rankLadder({ role: "P", count: 30, totalAt: () => 50 });
    const book = bookOf({ rows: flat });
    expect(book.vorpSum).toBe(0);
    expect(book.reason).toBe("nessun-vorp-positivo");
    expect(creditsOf(book, "P:001")).toBe("scala-non-formabile");
  });

  it("un numero di rinnovi non contabile ferma la scala invece di indovinarla", () => {
    for (const renewalsCount of [-1, 2.5, AUCTION_ROSTER_SLOTS + 1, Number.NaN]) {
      const book = bookOf({ renewalsCount });
      expect(book.reason, String(renewalsCount)).toBe("rinnovi-non-validi");
    }
  });

  it("nessuna assenza porta crediti, e nessun ingresso lancia", () => {
    const absences = [
      creditValueOf("mai-visto", bookOf()),
      creditValueOf("P:001", bookOf({ renewalsSpend: 3800 })),
      creditValueOf("P:001", bookOf({ rows: rankLadder({ role: "P", count: 3, totalAt: () => 9 }) })),
    ];
    for (const reading of absences) {
      expect(reading.kind).toBe("assente");
      expect(reading).not.toHaveProperty("credits");
      expect(creditValueCredits(reading)).toBeNull();
    }
    expect(() => bookOf({ rows: [] })).not.toThrow();
    expect(() => creditValueOf("", bookOf({ rows: [] }))).not.toThrow();
  });
});

// ─── `S` ─────────────────────────────────────────────────────────────────────

describe("`S` — la sottrazione, e i suoi due modi di non esistere", () => {
  const CURVE: PriceCurveBook = curveOf(
    [{ season: ONE, role: "P", prices: [30, 20, 10], renewals: [1000] }],
    { minBandSample: 3 },
  );

  function pricesOf(book: CreditValueBook): ExpectedPriceContext {
    return expectedPriceContext({
      curves: CURVE,
      // IL LIBRO DEI RANGHI È QUELLO DEL VALORE: costruito una volta, riusato.
      ranks: book.ranks,
      inflation: measuredInflation([], anchorBook([])),
      state: stateOf([]),
      selfId: SELF,
      renewalsSpend: 1000,
    });
  }

  it("`S = V − P̂`, e dice di quale valore è la sottrazione", () => {
    const book = bookOf();
    const prices = pricesOf(book);
    const price = expectedPriceReading("P:001", prices);
    if (price.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(price.credits).toBe(20);
    const reading = surplusReading("P:001", book, prices);
    expect(reading).toEqual({
      kind: "surplus",
      credits: 12 - 20,
      value: 12,
      valueSource: "generatore",
      expectedPrice: 20,
    });
    // Può essere negativo: `S` ordina, non esclude.
    expect(surplusCredits(reading)).toBe(-8);
  });

  it("senza `V` non c'è `S`, e il motivo dice qual era l'ingrediente mancante", () => {
    const book = bookOf({ rows: [...SMALL, rowWithoutForecast("muta", "P")] });
    const reading = surplusReading("muta", book, pricesOf(book));
    expect(reading).toEqual({
      kind: "assente",
      reason: "valore-assente",
      valueReason: "previsione-assente",
      priceReason: null,
    });
    expect(surplusCredits(reading)).toBeNull();
  });

  it("senza `P̂` non c'è `S` NEMMENO con `V`: il dichiarato che il generatore non copre", () => {
    // È il caso che si dimentica: Pico ha dichiarato un valore per un giocatore
    // fuori dal listone servito, quindi `V` c'è ma rango e prezzo atteso no.
    const book = bookOf({ values: declaredValueBook([{ playerId: "fuori", declaredValue: 30 }]) });
    expect(creditsOf(book, "fuori")).toBe(30);
    const reading = surplusReading("fuori", book, pricesOf(book));
    expect(reading).toEqual({
      kind: "assente",
      reason: "prezzo-assente",
      valueReason: null,
      priceReason: "rango-ignoto",
    });
  });

  it("`P̂` che non si forma sulla fascia: stesso trattamento, `V` resta intatto", () => {
    // Il rango 4 sta in fascia 4–8, che questa curva non ha misurato.
    const book = bookOf();
    const reading = surplusReading("P:004", book, pricesOf(book));
    expect(reading.kind).toBe("assente");
    if (reading.kind !== "assente") return;
    expect(reading.reason).toBe("prezzo-assente");
    expect(reading.priceReason).toBe("fascia-senza-osservazioni");
    expect(creditsOf(book, "P:004")).toBe(11);
  });

  it("`null` va in coda, dopo anche i surplus negativi: la semantica di `compareSurplus`", () => {
    const ordered = [null, -5, 3, null, 0].sort(compareCreditSurplus);
    expect(ordered).toEqual([3, 0, -5, null, null]);
    // `null` non è 0 e non è −Infinity: se lo fosse, si mescolerebbe ai numeri.
    expect(compareCreditSurplus(null, 0)).toBeGreaterThan(0);
    expect(compareCreditSurplus(null, -1000)).toBeGreaterThan(0);
    expect(compareCreditSurplus(null, null)).toBe(0);
  });
});

// ─── La guardia contro la selezione avversa ──────────────────────────────────

describe("selezione avversa — la guardia: `S` premia il sottoprezzato, non l'economico", () => {
  // IL VIZIO DA EVITARE, documentato in packages/engine/src/absoluteValue.ts: una
  // base PIATTA PER RUOLO rende `S = costante − P̂` monotona decrescente nel
  // prezzo, cioè fa vincere sempre il più economico del ruolo — il peggiore.
  // Qui `V` cresce con `T1̂` del singolo giocatore, quindi la monotonia non
  // sussiste. Questo blocco costruisce la popolazione e MOSTRA la differenza
  // fra le due classifiche, invece di affermarla in un commento.

  const COUNT = 60;
  const ROWS: readonly RankRow[] = rankLadder({
    role: "A",
    count: COUNT,
    totalAt: (rank) => (61 - rank) * 10,
  });
  /** Prezzi storici decrescenti col rango, su due aste sintetiche identiche. */
  const CURVE: PriceCurveBook = curveOf(
    SEASONS.slice(0, 2).map((season) => ({
      season,
      role: "A" as const,
      prices: priceLadder(COUNT, (rank) => Math.max(COST_FLOOR, 62 - 2 * rank)),
      renewals: [1000],
    })),
  );

  const BOOK = creditValueBook({ rows: ROWS, renewalsCount: 8, renewalsSpend: 1000, values: null });
  const PRICES = expectedPriceContext({
    curves: CURVE,
    ranks: BOOK.ranks,
    inflation: measuredInflation([], anchorBook([])),
    state: stateOf([]),
    selfId: SELF,
    renewalsSpend: 1000,
  });

  /** Le tre grandezze per riga: il tavolo su cui si leggono le due classifiche. */
  const TABLE = ROWS.map((row) => {
    const surplus = surplusReading(row.playerId, BOOK, PRICES);
    const price = expectedPriceReading(row.playerId, PRICES);
    return {
      playerId: row.playerId,
      value: creditValueCredits(creditValueOf(row.playerId, BOOK)),
      price: price.kind === "prezzo" ? price.credits : null,
      surplus: surplusCredits(surplus),
    };
  });
  const CHEAPEST_PRICE = Math.min(...TABLE.map((r) => r.price ?? Number.POSITIVE_INFINITY));

  it("la popolazione è quella dichiarata: 56 sopra il rimpiazzo, `B_res` ripartito", () => {
    expect(BOOK.residualBudget).toBe(2784);
    expect(BOOK.positiveVorpPlayers).toBe(56);
    expect(BOOK.distributedCredits).toBe(BOOK.residualBudget);
    expect(TABLE.every((r) => r.surplus !== null)).toBe(true);
  });

  it("il miglior surplus NON è il più economico del ruolo", () => {
    const best = [...TABLE].sort((a, b) => compareCreditSurplus(a.surplus, b.surplus))[0]!;
    expect(best.price).toBeGreaterThan(CHEAPEST_PRICE);
  });

  it("con una base PIATTA per ruolo, invece, vincerebbe esattamente il più economico", () => {
    // La stessa popolazione, con al posto di `V` una costante — cioè ciò che
    // `absoluteValue.ts` deriva: `target del ruolo / slot del ruolo`.
    const FLAT = 50;
    const flatBest = [...TABLE]
      .map((r) => ({ ...r, surplus: r.price === null ? null : FLAT - r.price }))
      .sort((a, b) => compareCreditSurplus(a.surplus, b.surplus))[0]!;
    expect(flatBest.price).toBe(CHEAPEST_PRICE);
  });

  it("`S` non è monotono decrescente nel prezzo: il più caro batte il più economico", () => {
    const first = TABLE[0]!;
    const last = TABLE[COUNT - 1]!;
    expect(first.price).toBeGreaterThan(last.price!);
    expect(first.surplus).toBeGreaterThan(last.surplus!);
    // E la coppia che rompe la monotonia non è un caso isolato: esistono righe
    // che costano di più e rendono di più in tutta la popolazione.
    const inversions = TABLE.flatMap((a) =>
      TABLE.filter((b) => a.price! > b.price! && a.surplus! > b.surplus!),
    );
    expect(inversions.length).toBeGreaterThan(0);
  });

  it("`V` cresce con la produzione prevista: è questo a rompere la monotonia", () => {
    const values = TABLE.map((r) => r.value!);
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!);
    expect(values[0]!).toBeGreaterThan(values[COUNT - 1]!);
  });
});

// ─── Le letture aperte ───────────────────────────────────────────────────────

describe("le letture aperte viaggiano col numero, e nessuna è muta", () => {
  it("ogni lettura porta la propria ratifica, valore o assenza che sia", () => {
    const book = bookOf();
    expect(book.ratification.ratified).toBe(false);
    expect(book.ratification.unratifiedChoices).toEqual(CREDIT_VALUE_UNRATIFIED_CHOICES);
    expect(creditValueOf("P:001", book).ratification).toEqual(book.ratification);
    expect(creditValueOf("mai-visto", book).ratification).toEqual(book.ratification);
  });

  it("le quattro scelte aperte sono dichiarate e ognuna ha il proprio perché", () => {
    expect([...CREDIT_VALUE_UNRATIFIED_CHOICES]).toEqual([
      "CREDIT_VALUE_REMAINDER_TIES_BY_VORP",
      "CREDIT_VALUE_BAND_CAP_IS_FLOORED_P90",
      "CREDIT_VALUE_CAP_DOES_NOT_REDISTRIBUTE",
      "CREDIT_VALUE_DECLARED_NOT_ROUNDED",
    ]);
    for (const id of CREDIT_VALUE_UNRATIFIED_CHOICES) {
      expect(UNRATIFIED_CHOICES[id].length, id).toBeGreaterThan(0);
    }
  });
});

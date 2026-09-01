import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  COST_FLOOR,
  DEFAULT_UPLIFT_SWITCH,
  MINIMUM_RAISE,
  PRICE_RANK_BANDS,
  SPEND_UPLIFT_PROVENANCE,
  UPLIFT_DEFAULT_ENABLED,
  anchorBook,
  baseSurplusCredits,
  baseSurplusReading,
  creditValueBook,
  creditValueOf,
  declaredValueBook,
  drainCredits,
  drainGapCredits,
  drainGapReading,
  drainReading,
  expectedPriceContext,
  expectedPriceReading,
  expectedSpendCredits,
  expectedSpendReading,
  maxSafe,
  measuredInflation,
  roleRankBook,
  type CreditValueBook,
  type ExpectedPriceReading,
  type ExpectedSpendCredits,
  type ExpectedSpendReading,
  type Role,
  type SpendUpliftInjection,
  type TeamState,
  type UpliftSwitch,
} from "../src/index.js";
import { TEAMS, anchor, buildLog, buy, stateOf } from "./layer2Fixtures.js";
import { SEASONS, curveOf, rankLadder } from "./priceFixtures.js";

// `E_o`, `drain`, `D` E `S_base` — LA SPESA ATTESA DEGLI ALTRI E IL DIVARIO.
//
// Fixture sintetiche: squadre di prova, un listone generato da una regola
// dichiarata, prezzi scelti perché l'aritmetica si controlli a mano. Nessun
// dato reale.
//
// Il file prova cinque cose:
//  1. che `E_o` interroghi `maxSafe` e usi `P̂_mercato`, non `P̂` già cappato;
//  2. che l'interruttore degli uplift sia SPENTO di default, e che spento
//     significhi `E_o = min(maxSafe, P̂)` — dichiarato, non travestito;
//  3. che il `drain` sia la scala degli esposti nei suoi tre casi, col tetto;
//  4. che `D` e `S_base` siano `null` dove un ingrediente manca, mai zero;
//  5. che il tifo non abbia un canale per entrare nel motore.

// ─── Il laboratorio ──────────────────────────────────────────────────────────

const ROLE: Role = "A";

/**
 * Un avversario col solo slot che serve: `totalSlotsRemaining = 1` significa
 * riserva dura zero, quindi `maxSafe = budgetResidual` — un numero che si legge
 * senza rifare il conto della riserva, ed è comunque `maxSafe()` a dirlo.
 */
function rival(fantaTeamId: string, budgetResidual: number, roleSlots = 1): TeamState {
  return {
    fantaTeamId,
    spent: 0,
    budgetResidual,
    filled: { P: 0, D: 0, C: 0, A: 0 },
    slotsRemaining: { P: 0, D: 0, C: 0, A: roleSlots },
    totalSlotsRemaining: roleSlots,
    roster: [],
  };
}

/**
 * UNA LETTURA DI `P̂` COSTRUITA A MANO, coi due numeri separati che il test
 * deve poter muovere indipendentemente: `marketPrice` (prima del tetto del più
 * ricco) e `credits` (dopo). La forma è quella vera — il tipo la impone, blocco
 * d'incertezza compreso — e un test più in basso incrocia la stessa funzione
 * con una lettura prodotta davvero da `expectedPriceReading()`.
 */
function price(credits: number, marketPrice: number): ExpectedPriceReading {
  return {
    kind: "prezzo",
    credits,
    uncertainty: { errMinus: 5, errPlus: 5, signedBias: 0, biasDirection: "nessuno", n: 10 },
    chain: {
      role: ROLE,
      rank: 1,
      band: PRICE_RANK_BANDS[0]!,
      base: marketPrice,
      poolRatio: 1,
      poolRatioReason: null,
      currentPool: 3000,
      meanTrainPool: 3000,
      roleInflation: null,
      inflationBasis: "none",
      inflationSample: 0,
      appliedFactor: 1,
      marketPrice,
      richestRivalMaxBid: credits < marketPrice ? credits : null,
      cappedByRichest: credits < marketPrice,
    },
  };
}

const NO_PRICE: ExpectedPriceReading = { kind: "assente", reason: "fascia-sotto-campione" };

/** Un sovrapprezzo iniettato: il rapporto non esiste mai senza la sua `n`. */
function uplift(ratio: number | null, n: number): SpendUpliftInjection {
  return { ratio, n, provenance: SPEND_UPLIFT_PROVENANCE };
}

/** L'interruttore ACCESO. Nel prodotto lo accende solo un T-E chiuso; qui, un test. */
const SWITCH_ON: UpliftSwitch = { enabled: true, provenance: "acceso-da-test-chiuso" };

function spendOf(
  overrides: Partial<Parameters<typeof expectedSpendReading>[0]> = {},
): ExpectedSpendReading {
  return expectedSpendReading({
    fantaTeamId: "ataturk",
    team: rival("ataturk", 250),
    role: ROLE,
    price: price(40, 100),
    uplift: uplift(2, 5),
    ...overrides,
  });
}

function formed(reading: ExpectedSpendReading): ExpectedSpendCredits {
  if (reading.kind !== "spesa") throw new Error(`attesa una spesa, ricevuto ${reading.reason}`);
  return reading;
}

/** Una spesa attesa già formata, per costruire una scala di esposti a mano. */
function spend(fantaTeamId: string, budgetResidual: number, marketPrice: number) {
  return expectedSpendReading({
    fantaTeamId,
    team: rival(fantaTeamId, budgetResidual),
    role: ROLE,
    price: price(marketPrice, marketPrice),
    uplift: uplift(1, 4),
    upliftSwitch: SWITCH_ON,
  });
}

// ─── L'interruttore ──────────────────────────────────────────────────────────

describe("l'interruttore degli uplift è SPENTO, ed è il default", () => {
  it("il default dichiarato è `off`, e la sua provenienza dice perché", () => {
    // «T-E non eseguito» equivale a «non chiuso», quindi spento: non è una
    // cautela di questa sessione, è la regola dell'inventario dei parametri.
    expect(UPLIFT_DEFAULT_ENABLED).toBe(false);
    expect(DEFAULT_UPLIFT_SWITCH.enabled).toBe(false);
    expect(DEFAULT_UPLIFT_SWITCH.provenance).toBe("default-spento-test-non-chiuso");
  });

  it("spento ⇒ `E_o = min(maxSafe, P̂)`, e il rapporto NON viene applicato", () => {
    // `P̂` = 40, `maxSafe` = 250, uplift misurato 2: se l'interruttore fosse
    // acceso il numero sarebbe 200. È 40.
    const reading = formed(spendOf());
    expect(reading.credits).toBe(40);
    expect(reading.chain.upliftApplied).toBe(false);
    expect(reading.chain.upliftedPrice).toBeNull();
    expect(reading.chain.basis).toBe("tetto-di-mercato");
    expect(reading.chain.marketCeilingReason).toBe("interruttore-spento");
  });

  it("…e il rapporto resta CALCOLABILE e leggibile, solo non applicato", () => {
    // Accendere l'interruttore non deve obbligare a ricostruire niente: un
    // interruttore che chiede un ricalcolo è un interruttore che nessuno prova.
    const reading = formed(spendOf());
    expect(reading.chain.upliftRatio).toBe(2);
    expect(reading.chain.upliftSample).toBe(5);
    expect(reading.chain.switchEnabled).toBe(false);
  });

  it("acceso ⇒ `E_o = min(maxSafe, max(1, round(P̂_mercato × uplift)))`", () => {
    const reading = formed(spendOf({ upliftSwitch: SWITCH_ON }));
    // 100 × 2 = 200, sotto il tetto contabile di 250.
    expect(reading.credits).toBe(200);
    expect(reading.chain.upliftApplied).toBe(true);
    expect(reading.chain.upliftedPrice).toBe(200);
    expect(reading.chain.basis).toBe("sovrapprezzo-misurato");
    expect(reading.chain.marketCeilingReason).toBeNull();
  });

  it("acceso ma sovrapprezzo NON misurato: torna il tetto di mercato, col motivo", () => {
    // Un rapporto assente non è un rapporto uguale a 1: la degradazione si
    // dichiara nel dato, così chi la mostra può dirlo a schermo.
    const reading = formed(spendOf({ upliftSwitch: SWITCH_ON, uplift: uplift(null, 0) }));
    expect(reading.credits).toBe(40);
    expect(reading.chain.basis).toBe("tetto-di-mercato");
    expect(reading.chain.marketCeilingReason).toBe("sovrapprezzo-non-misurato");
    expect(reading.chain.upliftRatio).toBeNull();
  });

  it("nessun sovrapprezzo iniettato affatto: stesso esito, stesso motivo", () => {
    const reading = formed(spendOf({ upliftSwitch: SWITCH_ON, uplift: null }));
    expect(reading.credits).toBe(40);
    expect(reading.chain.upliftSample).toBe(0);
    expect(reading.chain.marketCeilingReason).toBe("sovrapprezzo-non-misurato");
  });
});

// ─── `E_o` ───────────────────────────────────────────────────────────────────

describe("`E_o` — il prezzo di MERCATO, non `P̂` già cappato", () => {
  it("moltiplica `P̂_mercato`, e i due numeri sono diversi quando il tetto ha morso", () => {
    // `P̂` = 40 perché il più ricco rivale non arriva oltre; `P̂_mercato` = 100.
    // Con uplift 1 l'esito è 100 e non 40: è la prova che il campo letto è
    // quello prima del tetto. Il tetto del più ricco riguarda ciò che il
    // MERCATO può pagare; il tetto di QUESTA persona è il suo `maxSafe`.
    const reading = formed(
      spendOf({ upliftSwitch: SWITCH_ON, uplift: uplift(1, 3), price: price(40, 100) }),
    );
    expect(reading.chain.expectedPrice).toBe(40);
    expect(reading.chain.marketPrice).toBe(100);
    expect(reading.credits).toBe(100);
  });

  it("`maxSafe` si INTERROGA e fa da tetto: mai riderivata, mai superata", () => {
    const team = rival("ataturk", 150);
    const reading = formed(spendOf({ team, upliftSwitch: SWITCH_ON }));
    expect(reading.chain.maxSafe).toBe(maxSafe(team, ROLE).maxSafe);
    expect(reading.credits).toBe(150);
    expect(reading.chain.cappedByMaxSafe).toBe(true);
  });

  it("il pavimento di un credito morde dove il prodotto scenderebbe sotto, e lo dice", () => {
    // `round(1 × 0,4) = 0`: «si aspetta di spendere zero» su una persona che il
    // cancello dell'esposizione ha già dichiarato capace di pagare il prezzo
    // base. Il pavimento è lo stesso che `P̂_mercato` porta già, applicato dove
    // il prodotto potrebbe scenderci sotto — non è un tetto e non è un peso.
    const reading = formed(
      spendOf({ upliftSwitch: SWITCH_ON, uplift: uplift(0.4, 6), price: price(1, 1) }),
    );
    expect(reading.credits).toBe(COST_FLOOR);
    expect(reading.chain.flooredAtCostFloor).toBe(true);
  });

  it("un uplift sotto 1 che resta sopra il pavimento NON viene toccato", () => {
    const reading = formed(
      spendOf({ upliftSwitch: SWITCH_ON, uplift: uplift(0.5, 6), price: price(100, 100) }),
    );
    expect(reading.credits).toBe(50);
    expect(reading.chain.flooredAtCostFloor).toBe(false);
  });

  it("senza `P̂` non c'è spesa attesa, e il motivo dell'ingrediente viaggia con l'assenza", () => {
    const reading = spendOf({ price: NO_PRICE });
    expect(reading.kind).toBe("assente");
    if (reading.kind !== "assente") throw new Error("attesa un'assenza");
    expect(reading.reason).toBe("prezzo-assente");
    expect(reading.priceReason).toBe("fascia-sotto-campione");
    expect(expectedSpendCredits(reading)).toBeNull();
  });

  it("ruolo pieno e budget bloccato sono due assenze diverse, nell'ordine in cui si annidano", () => {
    const pieno = spendOf({ team: rival("ataturk", 250, 0) });
    expect(pieno.kind === "assente" && pieno.reason).toBe("ruolo-pieno");
    // Tre slot da riempire, un credito: la riserva dura si mangia tutto.
    const bloccato = spendOf({
      team: { ...rival("ataturk", 1, 1), slotsRemaining: { P: 1, D: 1, C: 0, A: 1 }, totalSlotsRemaining: 3 },
    });
    expect(bloccato.kind === "assente" && bloccato.reason).toBe("budget-bloccato");
  });

  it("si incastra con una lettura di `P̂` prodotta davvero dal motore", () => {
    // Il seam vero, non una lettura scritta a mano: curva sintetica, listone
    // sintetico, log sintetico, `expectedPriceReading()` e poi `E_o`.
    const ONE = SEASONS[4]!;
    const curves = curveOf(
      [{ season: ONE, role: ROLE, prices: [100, 90, 80], renewals: [1000] }],
      { minBandSample: 3 },
    );
    const rows = rankLadder({ role: ROLE, count: 3, totalAt: (rank) => 300 - rank * 10 });
    const log = buildLog(TEAMS.filter((t) => t !== "psg").map((t) => buy(`fill:${t}:D:0`, "D", t, 100)));
    const context = expectedPriceContext({
      curves,
      ranks: roleRankBook(rows),
      inflation: measuredInflation(log, anchorBook([anchor("a1", ROLE, 50)])),
      state: stateOf(log),
      selfId: "psg",
      renewalsSpend: 1000,
    });
    const reading = expectedPriceReading(rows[0]!.playerId, context);
    expect(reading.kind).toBe("prezzo");
    const spesa = formed(
      expectedSpendReading({
        fantaTeamId: "ataturk",
        team: rival("ataturk", 250),
        role: ROLE,
        price: reading,
        uplift: uplift(1, 3),
        upliftSwitch: SWITCH_ON,
      }),
    );
    if (reading.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(spesa.chain.marketPrice).toBe(reading.chain.marketPrice);
    expect(spesa.credits).toBe(Math.min(250, reading.chain.marketPrice));
  });
});

// ─── Il `drain` ──────────────────────────────────────────────────────────────

describe("`drain` — la scala degli esposti, nei suoi tre casi", () => {
  it("ZERO esposti: il numero non si forma, e il censimento resta leggibile", () => {
    const reading = drainReading({ spends: [] });
    expect(reading.kind).toBe("assente");
    if (reading.kind !== "assente") throw new Error("attesa un'assenza");
    expect(reading.reason).toBe("nessun-esposto");
    expect(reading.census.exposedCount).toBe(0);
    expect(drainCredits(reading)).toBeNull();
  });

  it("UN solo esposto: prezzo base, perché non c'è nessuna gara attesa", () => {
    const reading = drainReading({ spends: [spend("ataturk", 250, 90)] });
    expect(drainCredits(reading)).toBe(COST_FLOOR);
    if (reading.kind !== "drain") throw new Error("atteso un drain");
    expect(reading.chain.basis).toBe("un-solo-esposto");
    expect(reading.chain.exposedCount).toBe(1);
    // Il tavolo non si è prosciugato: nessuna scala, nessun secondo.
    expect(reading.chain.secondSpend).toBeNull();
  });

  it("DUE o più esposti: secondo massimo più uno, come la scala dei rivali", () => {
    // Spese attese 90 · 60 · 30 → il secondo mette 60, quindi si arriva a 61.
    const reading = drainReading({
      spends: [spend("ataturk", 250, 30), spend("new_milf", 250, 90), spend("ac_vostra", 250, 60)],
    });
    expect(drainCredits(reading)).toBe(61);
    if (reading.kind !== "drain") throw new Error("atteso un drain");
    expect(reading.chain.highestSpend).toBe(90);
    expect(reading.chain.secondSpend).toBe(60);
    expect(reading.chain.rivalScale).toBe(60 + MINIMUM_RAISE);
    expect(reading.chain.basis).toBe("scala-degli-esposti");
    expect(reading.spends.map((s) => s.credits)).toEqual([90, 60, 30]);
  });

  it("il tetto è il MASSIMO fra le spese attese: `secondo + 1` non lo supera", () => {
    // Due esposti pari a 80: `80 + 1 = 81` non è pagabile da nessuno dei due.
    const reading = drainReading({
      spends: [spend("ataturk", 250, 80), spend("new_milf", 250, 80)],
    });
    expect(drainCredits(reading)).toBe(80);
    if (reading.kind !== "drain") throw new Error("atteso un drain");
    expect(reading.chain.rivalScale).toBe(81);
    expect(reading.chain.basis).toBe("tetto-del-massimo");
  });

  it("la parità va alla scala, come nel prezzo relativo", () => {
    // 90 e 60: `61 ≤ 90`, quindi decide la scala e non il tetto. Il numero non
    // cambierebbe con un `<`, l'etichetta sì — e con lei la frase mostrata.
    const reading = drainReading({
      spends: [spend("ataturk", 250, 90), spend("new_milf", 250, 60)],
    });
    if (reading.kind !== "drain") throw new Error("atteso un drain");
    expect(reading.chain.basis).toBe("scala-degli-esposti");
  });

  it("il MIO tetto non entra: il `drain` misura quanto brucia il tavolo, non quanto pago io", () => {
    // Nessun `maxSafe(io, ruolo)` fra gli argomenti: il divario di un'esca non
    // può rimpicciolirsi perché sono povero.
    const source = readFileSync(new URL("../src/baitDrain.ts", import.meta.url), "utf8");
    const drainBody = source.slice(
      source.indexOf("export function drainReading"),
      source.indexOf("export function drainCredits"),
    );
    expect(drainBody).not.toContain("maxSafe(");
  });

  it("il censimento è BINARIO: due esposti senza spesa attesa non diventano zero esposti", () => {
    // Con `P̂` assente nessuno degli esposti forma `E_o`: il `drain` non si
    // forma, ma la riga sa ancora che due persone erano esposte. Se si
    // contassero le sole spese formate, la riga direbbe «non lo vuole nessuno»
    // invece di «non lo so».
    const senzaPrezzo = [
      spendOf({ fantaTeamId: "ataturk", price: NO_PRICE }),
      spendOf({ fantaTeamId: "new_milf", price: NO_PRICE }),
    ];
    const reading = drainReading({ spends: senzaPrezzo });
    expect(reading.kind).toBe("assente");
    if (reading.kind !== "assente") throw new Error("attesa un'assenza");
    expect(reading.reason).toBe("spesa-attesa-assente");
    expect(reading.census.exposedCount).toBe(2);
    expect(reading.census.spendCount).toBe(0);
  });

  it("due esposti ma una sola spesa formata: il SECONDO non esiste e non si sostituisce", () => {
    const reading = drainReading({
      spends: [spend("ataturk", 250, 90), spendOf({ fantaTeamId: "new_milf", price: NO_PRICE })],
    });
    expect(reading.kind === "assente" && reading.reason).toBe("spesa-attesa-assente");
  });

  it("il prezzo base è dichiarato e iniettabile, mai dedotto", () => {
    const reading = drainReading({ spends: [spend("ataturk", 250, 90)], openingPrice: 5 });
    expect(drainCredits(reading)).toBe(5);
    if (reading.kind !== "drain") throw new Error("atteso un drain");
    expect(reading.chain.openingPrice).toBe(5);
  });
});

// ─── `D` e `S_base` ──────────────────────────────────────────────────────────

describe("`D` e `S_base` — due sottrazioni, e le loro assenze", () => {
  // Un listone minimo col valore in crediti DICHIARATO: `V` vale esattamente il
  // numero di Pico, quindi le due sottrazioni si controllano a mano.
  const ROWS = rankLadder({ role: "P", count: 30, totalAt: (rank) => (rank <= 4 ? 60 : 50) });
  const BOOK: CreditValueBook = creditValueBook({
    rows: ROWS,
    renewalsCount: 0,
    renewalsSpend: 3734,
    values: declaredValueBook([{ playerId: "P:001", declaredValue: 40 }]),
  });
  const VALUE = creditValueOf("P:001", BOOK);
  const ASSENTE = creditValueOf("mai-visto", BOOK);
  const DRAIN = drainReading({
    spends: [spend("ataturk", 250, 90), spend("new_milf", 250, 60)],
  });

  it("`V` è il dichiarato, e comanda: 40 crediti", () => {
    expect(VALUE.kind === "valore" && VALUE.credits).toBe(40);
    expect(VALUE.kind === "valore" && VALUE.source).toBe("dichiarato");
    expect(ASSENTE.kind === "assente" && ASSENTE.reason).toBe("rango-ignoto");
  });

  it("`D = drain − V`: 61 − 40 = 21, col valore e la sua provenienza accanto", () => {
    const gap = drainGapReading(DRAIN, VALUE);
    expect(drainGapCredits(gap)).toBe(21);
    if (gap.kind !== "divario") throw new Error("atteso un divario");
    expect(gap.drain).toBe(61);
    expect(gap.worth).toBe(40);
    expect(gap.worthSource).toBe("dichiarato");
    expect(gap.drainBasis).toBe("scala-degli-esposti");
  });

  it("`D` può essere ≤ 0: ordina, non esclude", () => {
    const povero = drainReading({
      spends: [spend("ataturk", 250, 20), spend("new_milf", 250, 10)],
    });
    expect(drainGapCredits(drainGapReading(povero, VALUE))).toBe(11 - 40);
  });

  it("`D = null` quando `V` non esiste — e non è zero", () => {
    const gap = drainGapReading(DRAIN, ASSENTE);
    expect(drainGapCredits(gap)).toBeNull();
    if (gap.kind !== "assente") throw new Error("attesa un'assenza");
    expect(gap.reason).toBe("valore-assente");
    expect(gap.worthReason).toBe("rango-ignoto");
  });

  it("`D = null` anche quando il `drain` non si forma: è il caso che si dimentica", () => {
    // Senza `P̂` nessun esposto forma `E_o`, quindi niente `drain` e niente `D`.
    // La riga resta candidabile — l'esposizione è binaria — e si ordina in coda.
    const senzaPrezzo = drainReading({
      spends: [
        spendOf({ fantaTeamId: "ataturk", price: NO_PRICE }),
        spendOf({ fantaTeamId: "new_milf", price: NO_PRICE }),
      ],
    });
    const gap = drainGapReading(senzaPrezzo, VALUE);
    expect(drainGapCredits(gap)).toBeNull();
    if (gap.kind !== "assente") throw new Error("attesa un'assenza");
    expect(gap.reason).toBe("drain-assente");
    expect(gap.drainReason).toBe("spesa-attesa-assente");
  });

  it("con entrambi assenti il motivo nomina `V`, e l'altro resta leggibile accanto", () => {
    const gap = drainGapReading(drainReading({ spends: [] }), ASSENTE);
    if (gap.kind !== "assente") throw new Error("attesa un'assenza");
    expect(gap.reason).toBe("valore-assente");
    expect(gap.drainReason).toBe("nessun-esposto");
  });

  it("`S_base = V − prezzo base`: 40 − 1 = 39, e non dipende dal `drain`", () => {
    const surplus = baseSurplusReading(VALUE);
    expect(baseSurplusCredits(surplus)).toBe(39);
    if (surplus.kind !== "surplus-base") throw new Error("atteso un surplus");
    expect(surplus.openingPrice).toBe(COST_FLOOR);
    expect(surplus.worthSource).toBe("dichiarato");
  });

  it("`S_base` si mostra anche quando il tavolo non brucia niente", () => {
    // È il caso in cui serve di più: nessuno se la contende, e la riga dice
    // comunque che se resta a te è un acquisto sotto il valore.
    expect(baseSurplusCredits(baseSurplusReading(VALUE, 1))).toBe(39);
    expect(drainCredits(drainReading({ spends: [] }))).toBeNull();
  });

  it("`S_base = null` quando `V` non esiste: mai uno zero al posto dell'assenza", () => {
    const surplus = baseSurplusReading(ASSENTE);
    expect(baseSurplusCredits(surplus)).toBeNull();
    expect(surplus.kind === "assente" && surplus.reason).toBe("rango-ignoto");
  });

  it("con un prezzo base più alto il piano B può diventare negativo, e lo dice", () => {
    expect(baseSurplusCredits(baseSurplusReading(VALUE, 60))).toBe(-20);
  });
});

// ─── Il tifo non ha un canale ────────────────────────────────────────────────

describe("il tifo non entra nel motore, e la garanzia è strutturale", () => {
  const SOURCE = readFileSync(new URL("../src/baitDrain.ts", import.meta.url), "utf8");

  it("il modulo non importa i profili avversario: non c'è la strada", () => {
    // Ogni `from` di questo file punta a un modulo del motore. Il pacchetto dei
    // profili non è importabile da qui — sarebbe una dipendenza
    // all'incontrario — ed è per questo che il sovrapprezzo arriva iniettato.
    const froms = [...SOURCE.matchAll(/from "([^"]+)"/g)].map((m) => m[1] as string);
    expect(froms.length).toBeGreaterThan(0);
    expect(froms.every((f) => f.startsWith("./"))).toBe(true);
  });

  it("le quattro guardie di tipo esistono, e una loro rimozione si vede", () => {
    expect(SOURCE).toContain("type AssertNoProfilesChannel");
    expect(SOURCE).toContain("type AssertNoSupportedClubChannel");
    expect(SOURCE).toContain("type AssertUpliftCarriesNoProfiles");
    expect(SOURCE).toContain("type AssertUpliftCarriesSample");
  });

  it("l'ingresso di `E_o` non ha un campo per i profili né per il tifo", () => {
    const declaration = SOURCE.slice(
      SOURCE.indexOf("export interface ExpectedSpendInput"),
      SOURCE.indexOf("export function expectedSpendReading"),
    );
    expect(declaration).toContain("readonly team: TeamState");
    expect(declaration).not.toMatch(/readonly\s+profiles\s*[?]?\s*:/);
    expect(declaration).not.toMatch(/readonly\s+supportedClub\s*[?]?\s*:/);
  });

  it("il contratto di iniezione porta tre campi, e il rapporto non viaggia mai nudo", () => {
    const injection = uplift(1.5, 9);
    expect(Object.keys(injection).sort()).toEqual(["n", "provenance", "ratio"]);
    expect(injection.provenance).toBe(SPEND_UPLIFT_PROVENANCE);
  });

  it("il motore non compone uplift: non esiste qui una funzione che li produca", () => {
    // La composizione vive in packages/opponent-profiles/src/expectedSpend.ts.
    // Qui il numero arriva iniettato, e questo test impedisce che una seconda
    // ricetta nasca in silenzio dentro il motore.
    expect(SOURCE).not.toContain("PrecedentFact");
    expect(SOURCE).not.toMatch(/function\s+\w*[Uu]plift\w*\s*\(/);
  });
});

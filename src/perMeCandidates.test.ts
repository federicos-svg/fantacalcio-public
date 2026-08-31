// Test del sottoblocco «PER ME» — logica pura, nessun DOM e nessuno storage,
// come postPurchaseProjection.test.ts e baitCandidates.test.ts (postura
// no-jsdom di questo repo). Gli stati di squadra non sono scritti a mano: si
// derivano da `reduce()` su acquisti passati da `recordPurchase`, quindi ogni
// numero atteso qui sotto è lo stesso numero che l'app vede a schermo.
//
// FIXTURE SINTETICHE, TUTTE: giocatori «Attaccante NN», club «Alfa/Beta»,
// previsioni e prezzi storici inventati. Nessuna riga del listone vero, nessuna
// quotazione copiata da una fonte, nessun prezzo d'asta reale.
//
// ─────────────────────────────────────────────────────────────────────────────
// PERCHÉ LA SCENA È GRANDE, e non è pigrizia
// ─────────────────────────────────────────────────────────────────────────────
//
// `V` esiste solo dove il ruolo ARRIVA al proprio rango di rimpiazzo — `r*` è
// 57 per gli attaccanti (7 slot × 8 squadre + 1, packages/engine/src/
// creditValue.ts) — e `P̂` esiste solo dove la fascia di rango ha almeno
// `MIN_PRICE_BAND_SAMPLE` osservazioni storiche. Una scena da quattro righe non
// produrrebbe né l'uno né l'altro: proverebbe soltanto che il pannello tace, e
// questo file esiste per provare che parla. La scena si GENERA (60 attaccanti,
// cinque stagioni di storico) invece di essere scritta a mano riga per riga,
// così i numeri restano ricalcolabili e nessuno è copiato da nessuna parte.
//
// I CRITERI DELL'ORDINE si provano invece su `orderPerMeCandidates`, che è una
// funzione pura su candidati costruiti a mano: è lì che si può isolare un
// pareggio alla volta senza dover fabbricare uno stato che lo produca.

import { beforeEach, describe, expect, it } from "vitest";
import { FANTA_TEAM_IDS } from "../packages/engine/fixtures/synthetic.js";
import { maxSafe } from "../packages/engine/src/auction.js";
import {
  declaredValueBook,
  UNRATIFIED_CHOICES,
  type DeclaredValueBook,
} from "../packages/engine/src/declaredValues.js";
import { recordPurchase } from "../packages/engine/src/feasibility.js";
import { reduce } from "../packages/engine/src/reduce.js";
import { MIN_PRICE_BAND_SAMPLE } from "../packages/engine/src/priceHistory.js";
import type { HistoricalPurchaseInput } from "../packages/engine/src/priceHistory.js";
import { COST_FLOOR, type AuctionEvent, type Role } from "../packages/engine/src/types.js";
import { BAIT_PARAMETERS } from "./baitCandidates.js";
import {
  PER_ME_PARAMETERS,
  PER_ME_ROWS_MAX,
  PER_ME_UNRATIFIED_CHOICES,
  ROWS_MAX_STATUS,
  orderPerMeCandidates,
  perMeAnchorCacheStats,
  perMeCandidates,
  perMeShownCandidates,
  resetPerMeAnchorCache,
  type PerMeCandidate,
  type PerMeReading,
} from "./perMeCandidates.js";
import type { RolePlanDraft } from "./rolePlan.js";
import { listonePlayerKey, type ListonePlayer } from "./ui/listone.js";

const TEAMS = FANTA_TEAM_IDS;
const ME = "psg";
const RIVAL = "ataturk";
const TS = "2026-08-01T12:00:00Z";
const RECIPE = "TEST-GEN-RECIPE@1.0.0";
const APPEAL_RECIPE = "TEST-APPEAL-RECIPE@1.0.0";

const key = (p: ListonePlayer): string => listonePlayerKey(p);

/**
 * Un attaccante generato: quotazione e previsioni decrescono col numero, così
 * il rango di listone (per `T1̂`) coincide con l'ordine dei nomi e ogni
 * asserzione sull'ordine è leggibile.
 */
function attacker(i: number): ListonePlayer {
  const n = String(i + 1).padStart(2, "0");
  return {
    name: `Attaccante ${n}`,
    role: "A",
    club: i % 2 === 0 ? "Alfa" : "Beta",
    quotation: 100 - i,
    appealIndex: {
      score: 100 - i,
      quality: "sintetico — fixture di test",
      recipe: APPEAL_RECIPE,
      components: { base: 100 - i },
    },
    genForecast: {
      recipeVersion: RECIPE,
      protocolVersion: "0.0.0-test",
      runId: "test-run",
      authority: "advisory",
      targets: {
        T2: { value: 6 - i / 100, interval: null, status: "winner" },
        TN: { value: 30, interval: null, status: "winner", capApplied: false },
        T1: { value: 300 - 4 * i, interval: null, status: "winner" },
      },
    },
  };
}

/** Sessanta attaccanti: `r* = 57`, quindi i primi 56 stanno sopra il rimpiazzo. */
const ATTACKERS: readonly ListonePlayer[] = Array.from({ length: 60 }, (_, i) => attacker(i));
const TOP = ATTACKERS[0]!;

/**
 * Cinque stagioni di storico d'asta sintetico: `perSeason` acquisti di ruolo A
 * per stagione, a prezzi decrescenti col rango di prezzo.
 *
 * QUANTI PER STAGIONE DECIDE QUALI FASCE SONO LEGGIBILI: le fasce sono 1-3,
 * 4-8, 9-15, 16-30, 31+ e ognuna ha bisogno di `MIN_PRICE_BAND_SAMPLE`
 * osservazioni. Con 35 acquisti a stagione sono leggibili tutte e cinque; con
 * 12 le ultime due restano senza osservazioni — ed è esattamente la
 * degradazione §D.7, provata più sotto.
 *
 * I giocatori dello storico SONO quelli del listone: il ruolo di una riga
 * storica non è nello storico e si risolve dal listone (`historicalPurchases`),
 * quindi righe su giocatori sconosciuti non entrerebbero nella curva.
 */
const SEASONS = ["2021/22", "2022/23", "2023/24", "2024/25", "2025/26"] as const;

function historyOf(
  seasons: readonly string[],
  perSeason: number,
): readonly HistoricalPurchaseInput[] {
  const out: HistoricalPurchaseInput[] = [];
  for (const season of seasons) {
    for (let r = 1; r <= perSeason; r++) {
      out.push({
        season,
        playerId: key(ATTACKERS[r - 1]!),
        price: 140 - 3 * r,
        acquisition: "asta",
      });
    }
  }
  return out;
}

const history = (perSeason: number): readonly HistoricalPurchaseInput[] =>
  historyOf(SEASONS, perSeason);

/** Tutte e cinque le fasce leggibili. */
const HISTORY_FULL = history(35);
/** Solo le prime tre fasce: le due in fondo restano senza osservazioni (§D.7). */
const HISTORY_TOP_ONLY = history(12);

function logAfter(
  purchases: readonly { playerId: string; role: Role; fantaTeamId: string; price: number }[],
): readonly AuctionEvent[] {
  let log: readonly AuctionEvent[] = [];
  for (const p of purchases) log = recordPurchase(log, reduce(log, TEAMS), p, TS);
  return log;
}

interface ReadOptions {
  readonly pool?: readonly ListonePlayer[];
  readonly log?: readonly AuctionEvent[];
  readonly history?: readonly HistoricalPurchaseInput[];
  readonly planDraft?: RolePlanDraft | null;
  readonly values?: DeclaredValueBook | null;
  readonly renewalsCount?: number;
}

function read(options: ReadOptions = {}): PerMeReading {
  const log = options.log ?? [];
  return perMeCandidates({
    pool: options.pool ?? ATTACKERS,
    source: "remote",
    state: reduce(log, TEAMS),
    log,
    history: options.history ?? HISTORY_FULL,
    renewalsCount: options.renewalsCount ?? 0,
    selfId: ME,
    planDraft: options.planDraft ?? null,
    values: options.values ?? null,
  });
}

function candidatesOf(reading: PerMeReading): readonly PerMeCandidate[] {
  if (reading.kind !== "candidates") throw new Error(`attesi candidati, ricevuto «${reading.reason}»`);
  return reading.candidates;
}

/** Un listino di valori dichiarati sintetico, costruito col motore vero. */
function valuesOf(pairs: readonly (readonly [ListonePlayer, number])[]): DeclaredValueBook {
  return declaredValueBook(
    pairs.map(([player, declaredValue]) => ({ playerId: listonePlayerKey(player), declaredValue })),
  );
}

beforeEach(() => resetPerMeAnchorCache());

// ─────────────────────────────────────────────────────────────────────────────

describe("il pannello parla: V, prezzo atteso e surplus arrivano a schermo", () => {
  it("con deposito e storico ci sono candidati, e ognuno porta le tre grandezze", () => {
    const reading = read();
    const candidates = candidatesOf(reading);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.value).toBeGreaterThanOrEqual(COST_FLOOR);
      expect(c.valueSource).toBe("generatore");
      expect(c.valueRecipe).toBe(RECIPE);
      if (c.expectedPrice.kind === "prezzo") {
        expect(c.surplus).toBe(c.value - c.expectedPrice.credits);
      } else {
        expect(c.surplus).toBeNull();
      }
    }
  });

  it("il prezzo atteso è lo scalare della curva, con la catena rifacibile a mano", () => {
    const top = candidatesOf(read()).find((c) => c.playerId === key(TOP))!;
    if (top.expectedPrice.kind !== "prezzo") throw new Error("atteso un prezzo");
    const chain = top.expectedPrice.chain;
    // Fascia 1-3, prezzi storici 137/134/131 su cinque stagioni: la mediana è
    // 134. Il pool di stasera è 4.000 − 489 (ripiego dichiarato dei rinnovi) e
    // quello medio storico è 4.000, quindi il rapporto è 0,877 25.
    expect(chain.band.index).toBe(0);
    expect(chain.base).toBe(134);
    expect(chain.currentPool).toBe(3511);
    expect(chain.meanTrainPool).toBe(4000);
    expect(top.expectedPrice.credits).toBe(
      Math.max(COST_FLOOR, Math.round(chain.base * chain.appliedFactor)),
    );
    expect(top.expectedPrice.credits).toBe(118);
  });

  it("il blocco d'incertezza viaggia col numero, sempre e tutto intero", () => {
    for (const c of candidatesOf(read())) {
      if (c.expectedPrice.kind !== "prezzo") continue;
      const u = c.expectedPrice.uncertainty;
      expect(u.n).toBeGreaterThanOrEqual(MIN_PRICE_BAND_SAMPLE);
      expect(Number.isFinite(u.errMinus)).toBe(true);
      expect(Number.isFinite(u.errPlus)).toBe(true);
      expect(["basso", "alto", "nessuno"]).toContain(u.biasDirection);
    }
  });

  it("V cresce con la produzione prevista: il surplus premia il sottoprezzato, non l'economico", () => {
    // LA PROVA CHE QUESTO FILE ESISTE PER TENERE IN PIEDI. Con una base PIATTA
    // per ruolo `S = costante − P̂` sarebbe monotona decrescente nel prezzo e
    // vincerebbe sempre il più economico, cioè il peggiore (selezione avversa,
    // packages/engine/src/absoluteValue.ts). Qui `V` cresce con `T1̂`, quindi
    // il più scarso NON è in cima.
    const candidates = candidatesOf(read());
    const byId = new Map(candidates.map((c) => [c.playerId, c]));
    const primo = byId.get(key(ATTACKERS[0]!))!;
    const ultimo = byId.get(key(ATTACKERS[55]!))!;
    expect(primo.value).toBeGreaterThan(ultimo.value);
    expect(candidates[0]!.playerId).not.toBe(key(ATTACKERS[55]!));
  });
});

describe("il piano dinamico filtra, e non ha bisogno di nessuna dichiarazione", () => {
  it("senza piano dichiarato il piano è quello RICALCOLATO, con la sua versione", () => {
    const reading = read();
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.plan.kind).toBe("dynamic");
    expect(reading.plan.label).toBe("piano ricalcolato adesso");
    // Log vuoto: `lastSeq` vale −1 e la versione lo riporta com'è.
    expect(reading.plan.planVersion).toBe("NOM-DYN@-1");
  });

  it("la versione del piano si muove col log, perché il piano è il ricalcolo", () => {
    const log = logAfter([
      { playerId: key(ATTACKERS[0]!), role: "A", fantaTeamId: RIVAL, price: 50 },
    ]);
    const reading = read({ log });
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.plan.planVersion).toBe("NOM-DYN@0");
    // …e il comprato è sparito dai candidati senza che nessuno l'abbia previsto.
    expect(reading.candidates.some((c) => c.playerId === key(ATTACKERS[0]!))).toBe(false);
  });

  it("i candidati nel piano stanno davanti a quelli fuori", () => {
    const candidates = candidatesOf(read());
    const primoFuori = candidates.findIndex((c) => !c.withinPlan);
    if (primoFuori === -1) throw new Error("la scena deve contenere righe fuori dal piano");
    expect(candidates.slice(0, primoFuori).every((c) => c.withinPlan)).toBe(true);
    expect(candidates.slice(primoFuori).some((c) => c.withinPlan)).toBe(false);
  });

  it("l'allocazione del ruolo è quella del piano dinamico, slot compresi", () => {
    const reading = read();
    if (reading.kind !== "candidates" || reading.plan.kind !== "dynamic") {
      throw new Error("atteso il piano dinamico");
    }
    const linea = reading.plan.plan.perRole.A;
    for (const c of reading.candidates) {
      expect(c.planAllocation).toBe(linea.allocation);
      expect(c.planSlotsRemaining).toBe(linea.slotsRemaining);
      expect(c.planSlotsPlanned).toBe(linea.slotsPlanned);
    }
    // La riserva dura resta intatta: il piano non impegna mai più del budget
    // meno un credito per ogni slot che non ha pianificato.
    expect(linea.allocation).toBe(linea.plannedSpend + COST_FLOOR * linea.slotsAtFloor);
  });

  it("«⚑ adesso» è la congiunzione di due fatti già definiti, non una soglia nuova", () => {
    for (const c of candidatesOf(read())) {
      expect(c.flagNow).toBe(c.withinPlan && c.cliff.isCliff);
    }
  });
});

describe("l'override di Pico comanda, e un piano rotto non svuota il pannello", () => {
  const FULL_PLAN: RolePlanDraft = {
    planVersion: "dichiarato-1",
    targets: { P: 20, D: 80, C: 140, A: 210 },
  };

  it("un piano dichiarato valido prende il posto del dinamico, con la sua etichetta", () => {
    const reading = read({ planDraft: FULL_PLAN });
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.plan.kind).toBe("declared");
    expect(reading.plan.label).toBe("piano dichiarato da te");
    expect(reading.plan.planVersion).toBe("dichiarato-1");
    // L'allocazione mostrata è quella VIVA del piano dichiarato, non `alloc*`.
    expect(reading.candidates[0]!.planAllocation).toBe(210);
    expect(reading.candidates[0]!.planSlotsPlanned).toBeNull();
  });

  it("il dichiarato e il dinamico non dicono la stessa cosa: l'override si vede", () => {
    const dinamico = candidatesOf(read());
    const dichiarato = candidatesOf(read({ planDraft: FULL_PLAN }));
    const dentroDinamico = dinamico.filter((c) => c.withinPlan).length;
    const dentroDichiarato = dichiarato.filter((c) => c.withinPlan).length;
    expect(dentroDichiarato).not.toBe(dentroDinamico);
  });

  it("un piano dichiarato A METÀ si dice, e comanda il dinamico — mai un pannello vuoto", () => {
    const reading = read({ planDraft: { planVersion: "monco", targets: { A: 210 } } });
    if (reading.kind !== "candidates" || reading.plan.kind !== "dynamic") {
      throw new Error("atteso il piano dinamico");
    }
    expect(reading.plan.declaredIssue).toBe("plan-incomplete");
    expect(reading.plan.declaredIssueDetail).toContain("role-undeclared");
    expect(reading.candidates.length).toBeGreaterThan(0);
  });

  it("un piano dichiarato RIFIUTATO dal motore si dice, e comanda il dinamico", () => {
    // La somma dei target sfonda il budget iniziale: `validateRolePlan` rifiuta.
    const reading = read({
      planDraft: { planVersion: "sfora", targets: { P: 400, D: 400, C: 400, A: 400 } },
    });
    if (reading.kind !== "candidates" || reading.plan.kind !== "dynamic") {
      throw new Error("atteso il piano dinamico");
    }
    expect(reading.plan.declaredIssue).toBe("plan-invalid");
    expect(reading.plan.declaredIssueDetail.length).toBeGreaterThan(0);
    expect(reading.candidates.length).toBeGreaterThan(0);
  });

  it("il valore DICHIARATO da Pico prende il posto di quello del generatore", () => {
    const reading = read({ values: valuesOf([[TOP, 999]]) });
    const top = candidatesOf(reading).find((c) => c.playerId === key(TOP))!;
    expect(top.value).toBe(999);
    expect(top.valueSource).toBe("dichiarato");
  });
});

describe("l'ordine dichiarato, un criterio alla volta", () => {
  // I criteri si provano sulla funzione pura: è l'unico modo di isolare un
  // pareggio per volta senza fabbricare uno stato che lo produca.
  function candidate(over: Partial<PerMeCandidate> & { playerId: string }): PerMeCandidate {
    return {
      player: TOP,
      role: "A",
      anchor: {
        playerId: over.playerId,
        role: "A",
        baseAnchor: 20,
        basis: "none",
        inflationApplied: null,
        n: 0,
        correctedAnchor: 20,
        coldStart: true,
      },
      value: 50,
      valueSource: "generatore",
      valueRecipe: RECIPE,
      expectedPrice: { kind: "assente", reason: "fascia-sotto-campione" },
      surplus: null,
      relativePrice: { kind: "assente", reason: "nessun-rivale-eleggibile" },
      cliff: {
        playerId: over.playerId,
        role: "A",
        anchor: 20,
        playerAvailable: true,
        othersAvailableInRole: 5,
        betterAvailable: 2,
        alternativesAtOrBelow: 3,
        nextAlternativeAnchor: 15,
        gap: 5,
        gapRatio: 0.25,
        shape: "gap-below",
        isCliff: false,
      },
      rivalsWithSlot: 4,
      maxBid: 473,
      withinPlan: false,
      planAllocation: 100,
      planSlotsRemaining: 7,
      planSlotsPlanned: 2,
      flagNow: false,
      appealPosition: 1,
      appealOrderSize: 10,
      ...over,
    };
  }

  const ids = (cs: readonly PerMeCandidate[]): readonly string[] => cs.map((c) => c.playerId);

  it("1. il piano FILTRA: dentro prima di fuori, anche con un surplus peggiore", () => {
    const dentro = candidate({ playerId: "b", withinPlan: true, surplus: 1 });
    const fuori = candidate({ playerId: "a", withinPlan: false, surplus: 99 });
    expect(ids(orderPerMeCandidates([fuori, dentro]))).toEqual(["b", "a"]);
  });

  it("2. il surplus ORDINA, e non esclude: il negativo resta, dopo il positivo", () => {
    const su = candidate({ playerId: "su", surplus: 5 });
    const giu = candidate({ playerId: "giu", surplus: -5 });
    expect(ids(orderPerMeCandidates([giu, su]))).toEqual(["su", "giu"]);
  });

  it("2-bis. l'assenza di surplus va in CODA, anche dopo un surplus negativo", () => {
    // `null` non è 0 e non è −Infinity: è l'assenza, e va dopo ogni misura.
    const senza = candidate({ playerId: "senza", surplus: null });
    const negativo = candidate({ playerId: "neg", surplus: -100 });
    expect(ids(orderPerMeCandidates([senza, negativo]))).toEqual(["neg", "senza"]);
  });

  it("3. a parità di surplus decide la SCARSITÀ misurata, crescente", () => {
    const scarso = candidate({ playerId: "scarso", surplus: 10 });
    const abbondante = candidate({ playerId: "abbondante", surplus: 10 });
    const con = (c: PerMeCandidate, n: number): PerMeCandidate => ({
      ...c,
      cliff: { ...c.cliff, alternativesAtOrBelow: n },
    });
    expect(
      ids(orderPerMeCandidates([con(abbondante, 9), con(scarso, 1)])),
    ).toEqual(["scarso", "abbondante"]);
  });

  it("4. poi V, decrescente", () => {
    const alto = candidate({ playerId: "z-alto", surplus: 10, value: 80 });
    const basso = candidate({ playerId: "a-basso", surplus: 10, value: 20 });
    expect(ids(orderPerMeCandidates([basso, alto]))).toEqual(["z-alto", "a-basso"]);
  });

  it("5. e infine la chiave di listone: l'ordine è TOTALE", () => {
    const a = candidate({ playerId: "aaa", surplus: 10 });
    const b = candidate({ playerId: "bbb", surplus: 10 });
    expect(ids(orderPerMeCandidates([b, a]))).toEqual(["aaa", "bbb"]);
    // Nessun pareggio resta aperto: mescolare non cambia l'esito.
    expect(ids(orderPerMeCandidates([a, b]))).toEqual(["aaa", "bbb"]);
  });

  it("la posizione di appetibilità NON ordina più: resta un fatto mostrato", () => {
    // Prima decideva a parità di surplus; adesso non entra proprio nell'ordine,
    // perché `V` è la sua trasformazione in crediti (§B.1, §H.2).
    const peggiore = candidate({ playerId: "a", surplus: 10, value: 50, appealPosition: 99 });
    const migliore = candidate({ playerId: "b", surplus: 10, value: 50, appealPosition: 1 });
    // Stessi surplus, stesse alternative, stesso V: decide la CHIAVE, non la
    // posizione — che qui è invertita apposta.
    expect(ids(orderPerMeCandidates([migliore, peggiore]))).toEqual(["a", "b"]);
    expect(peggiore.appealPosition).toBe(99);
  });

  it("l'esito vero è ordinato secondo quei cinque criteri, in quest'ordine", () => {
    const candidates = candidatesOf(read());
    for (let i = 1; i < candidates.length; i++) {
      const a = candidates[i - 1]!;
      const b = candidates[i]!;
      const rank = (c: PerMeCandidate): readonly [number, number, number, number, string] => [
        c.withinPlan ? 0 : 1,
        c.surplus === null ? Number.POSITIVE_INFINITY : -c.surplus,
        c.cliff.alternativesAtOrBelow,
        -c.value,
        c.playerId,
      ];
      const [ra, rb] = [rank(a), rank(b)];
      const first = ra.findIndex((v, k) => v !== rb[k]);
      if (first === -1) throw new Error("due candidati indistinguibili: l'ordine non è totale");
      expect(ra[first]! <= rb[first]!).toBe(true);
    }
  });
});

describe("i sette silenzi, uno per motivo", () => {
  it("no-pool: nessuna riga caricata", () => {
    const reading = read({ pool: [] });
    expect(reading.kind === "empty" && reading.reason).toBe("no-pool");
  });

  it("no-quotation: righe caricate, nessuna Qt.A", () => {
    const senzaQt = ATTACKERS.map(({ quotation: _q, ...rest }) => rest);
    const reading = read({ pool: senzaQt });
    expect(reading.kind === "empty" && reading.reason).toBe("no-quotation");
  });

  it("anchors-refused: il listino non passa la validazione, e il motivo esce", () => {
    // Due righe con la stessa identità: `validateAnchors` rifiuta il listino.
    const doppione = { ...ATTACKERS[0]! };
    const reading = read({ pool: [...ATTACKERS, doppione] });
    expect(reading.kind === "empty" && reading.reason).toBe("anchors-refused");
    expect(reading.kind === "empty" && reading.detail.length).toBeGreaterThan(0);
  });

  it("no-open-role: nessun reparto mio è biddable", () => {
    // Rosa piena: 3 P, 9 D, 9 C, 7 A al pavimento, su giocatori fuori listone.
    const acquisti: { playerId: string; role: Role; fantaTeamId: string; price: number }[] = [];
    const quanti: Readonly<Record<Role, number>> = { P: 3, D: 9, C: 9, A: 7 };
    for (const role of ["P", "D", "C", "A"] as const) {
      for (let i = 0; i < quanti[role]; i++) {
        acquisti.push({ playerId: `fuori-${role}-${i}`, role, fantaTeamId: ME, price: COST_FLOOR });
      }
    }
    const reading = read({ log: logAfter(acquisti) });
    expect(reading.kind === "empty" && reading.reason).toBe("no-open-role");
  });

  it("no-forecast: senza previsioni servite non si forma nessun V", () => {
    const senzaDeposito = ATTACKERS.map(({ genForecast: _g, ...rest }) => rest);
    const reading = read({ pool: senzaDeposito });
    expect(reading.kind === "empty" && reading.reason).toBe("no-forecast");
  });

  it("no-forecast: senza storico d'asta non si forma nessuna curva", () => {
    const reading = read({ history: [] });
    expect(reading.kind === "empty" && reading.reason).toBe("no-forecast");
    expect(reading.kind === "empty" && reading.detail).toBe("no-history");
  });

  it("no-free-in-open-roles: il solo reparto con righe è pieno", () => {
    const acquisti = ATTACKERS.slice(0, 7).map((p) => ({
      playerId: key(p),
      role: "A" as Role,
      fantaTeamId: ME,
      price: COST_FLOOR,
    }));
    const reading = read({ log: logAfter(acquisti) });
    expect(reading.kind === "empty" && reading.reason).toBe("no-free-in-open-roles");
  });

  it("no-affordable: ci sono liberi con V, ma il max bid non copre nessun prezzo atteso", () => {
    // Un acquisto da 473 lascia `maxSafe` a 1 credito: nessun prezzo atteso
    // della scena ci sta sotto.
    const log = logAfter([
      { playerId: "fuori-A-0", role: "A", fantaTeamId: ME, price: 473 },
    ]);
    const me = reduce(log, TEAMS).teams[ME]!;
    expect(maxSafe(me, "A").maxSafe).toBe(1);
    const reading = read({ log });
    expect(reading.kind === "empty" && reading.reason).toBe("no-affordable");
  });

  it("i sette motivi sono sette, e ognuno ha il proprio: nessuno ne copre un altro", () => {
    const visti = new Set<string>();
    for (const reading of [
      read({ pool: [] }),
      read({ pool: ATTACKERS.map(({ quotation: _q, ...r }) => r) }),
      read({ history: [] }),
    ]) {
      if (reading.kind === "empty") visti.add(reading.reason);
    }
    expect(visti.size).toBe(3);
  });
});

describe("le degradazioni §D, un gradino per test", () => {
  it("D.1 — senza il deposito genForecast non c'è né V né rango: il motivo lo dice", () => {
    const reading = read({ pool: ATTACKERS.map(({ genForecast: _g, ...r }) => r) });
    expect(reading.kind === "empty" && reading.reason).toBe("no-forecast");
  });

  it("D.2 — l'accoppiamento posti→persone non tocca questo pannello", () => {
    // Questo layer non legge né profili né posti: la lettura non ha nemmeno un
    // campo per riceverli, e i candidati escono comunque.
    expect(candidatesOf(read()).length).toBeGreaterThan(0);
  });

  it("D.3 — senza storico d'asta la curva non si forma, e il pannello lo dichiara", () => {
    const reading = read({ history: [] });
    expect(reading.kind === "empty" && reading.reason).toBe("no-forecast");
    // …e con lo storico presente ma senza acquisti d'asta (solo rinnovi) il
    // motivo è l'altro, non lo stesso appiattito.
    const soloRinnovi = HISTORY_FULL.map((r) => ({ ...r, acquisition: "riconferma" }));
    const altro = read({ history: soloRinnovi });
    expect(altro.kind === "empty" && altro.detail).toBe("no-auction-rows");
  });

  it("D.4 — inflazione di serata sotto campione: il fattore NON entra, e si dichiara", () => {
    // Due acquisti soli: `MIN_INFLATION_SAMPLE` è 5, quindi la misura c'è ma
    // non qualifica. Il prezzo atteso esce senza il fattore di serata e la
    // catena lo DICE — non è un 1 travestito da misura.
    const log = logAfter([
      { playerId: key(ATTACKERS[40]!), role: "A", fantaTeamId: RIVAL, price: 90 },
      { playerId: key(ATTACKERS[41]!), role: "A", fantaTeamId: RIVAL, price: 90 },
    ]);
    const top = candidatesOf(read({ log })).find((c) => c.playerId === key(TOP))!;
    if (top.expectedPrice.kind !== "prezzo") throw new Error("atteso un prezzo");
    expect(top.expectedPrice.chain.inflationBasis).toBe("none");
    expect(top.expectedPrice.chain.roleInflation).toBeNull();
    expect(top.expectedPrice.chain.inflationSample).toBe(2);
    expect(PER_ME_PARAMETERS.minInflationSample).toBe(5);
  });

  it("D.5 — niente rete sul percorso critico: la lettura non chiama fetch", () => {
    const originale = globalThis.fetch;
    let chiamate = 0;
    globalThis.fetch = (() => {
      chiamate += 1;
      throw new Error("la lettura non deve chiamare la rete");
    }) as typeof fetch;
    try {
      expect(candidatesOf(read()).length).toBeGreaterThan(0);
      expect(chiamate).toBe(0);
    } finally {
      globalThis.fetch = originale;
    }
  });

  it("D.6 — i profili confermati non entrano qui: nessun effetto", () => {
    // Stesso esito con e senza qualunque cosa riguardi i profili: questo layer
    // non ne conosce l'esistenza, e due letture identiche lo mostrano.
    expect(candidatesOf(read()).map((c) => c.playerId)).toEqual(
      candidatesOf(read()).map((c) => c.playerId),
    );
  });

  it("D.7 — fascia di rango senza osservazioni: niente prezzo atteso, riga in coda, contata", () => {
    // Con dodici acquisti a stagione le fasce 16-30 e 31+ restano vuote: i
    // giocatori che ci cadono NON ricevono un prezzo inventato.
    const reading = read({ history: HISTORY_TOP_ONLY });
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    const senzaPrezzo = reading.candidates.filter((c) => c.expectedPrice.kind === "assente");
    expect(senzaPrezzo.length).toBeGreaterThan(0);
    for (const c of senzaPrezzo) {
      expect(c.surplus).toBeNull();
      if (c.expectedPrice.kind !== "assente") throw new Error("attesa un'assenza");
      expect(c.expectedPrice.reason).toBe("fascia-senza-osservazioni");
      expect(c.withinPlan).toBe(false); // senza P̂ non si entra in TARGET*
    }
    // Vanno in CODA e sono CONTATE: nessuno zero al posto dell'assenza.
    const primoSenza = reading.candidates.findIndex((c) => c.expectedPrice.kind === "assente");
    expect(reading.candidates.slice(primoSenza).every((c) => c.expectedPrice.kind === "assente")).toBe(
      true,
    );
    expect(reading.withoutSurplus).toBe(senzaPrezzo.length);
  });

  it("D.7-bis — fascia SOTTO campione è un'assenza diversa da fascia senza osservazioni", () => {
    // UNA sola stagione da 33 acquisti: la fascia 31+ raccoglie tre
    // osservazioni, cioè meno del campione minimo. Il motivo è «sotto
    // campione», e non si confonde con «nessuna osservazione» — sono due
    // assenze diverse e il vocabolario del motore le distingue.
    const reading = read({ history: historyOf(["2025/26"], 33) });
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    const motivi = new Set(
      reading.candidates.flatMap((c) =>
        c.expectedPrice.kind === "assente" ? [c.expectedPrice.reason] : [],
      ),
    );
    expect(motivi.has("fascia-sotto-campione")).toBe(true);
    expect(PER_ME_PARAMETERS.minPriceBandSample).toBe(MIN_PRICE_BAND_SAMPLE);
  });
});

describe("i fatti che la riga porta, e le assenze contate", () => {
  it("i due conteggi di scarsità sono conteggi, misurati sullo stato", () => {
    const top = candidatesOf(read()).find((c) => c.playerId === key(TOP))!;
    // 60 attaccanti liberi, quotazioni 100..41: sotto il primo ce ne sono 59.
    expect(top.cliff.alternativesAtOrBelow).toBe(59);
    expect(top.rivalsWithSlot).toBe(TEAMS.length - 1);
  });

  it("il costo per vincerlo adesso è quello del motore, per RUOLO e non per riga", () => {
    const candidates = candidatesOf(read());
    const stessoRuolo = candidates.filter((c) => c.role === "A");
    const primo = stessoRuolo[0]!.relativePrice;
    for (const c of stessoRuolo) expect(c.relativePrice).toEqual(primo);
  });

  it("il max bid è interrogato e mai riderivato, e nessun prezzo atteso lo supera", () => {
    const me = reduce([], TEAMS).teams[ME]!;
    for (const c of candidatesOf(read())) {
      expect(c.maxBid).toBe(maxSafe(me, c.role).maxSafe);
      if (c.expectedPrice.kind === "prezzo") {
        expect(c.expectedPrice.credits).toBeLessThanOrEqual(c.maxBid);
      }
    }
  });

  it("sotto il rango di rimpiazzo V è il PAVIMENTO, non un'assenza", () => {
    // `r*` è 57: dal rango 57 in giù nessuno produce più di un rimpiazzo
    // liberamente disponibile, e il motore lo dice assegnando `COST_FLOOR` —
    // che è un numero misurato dal regolamento, non un ripiego. Quelle righe
    // restano quindi nella popolazione, in fondo.
    const reading = read();
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.freeInOpenRoles).toBe(60);
    expect(reading.withoutValue).toBe(0);
    const ultimo = reading.candidates.find((c) => c.playerId === key(ATTACKERS[59]!))!;
    expect(ultimo.value).toBe(COST_FLOOR);
  });

  it("un ruolo che non arriva al rimpiazzo non ha V, e i suoi liberi sono CONTATI", () => {
    // Tre difensori soli: il ruolo D non arriva mai al rango 73, quindi non
    // esiste un rimpiazzo su cui misurare il VORP. Non ricevono un `V`
    // inventato: restano fuori dalla popolazione, e il conteggio lo dice.
    const difensori = [0, 1, 2].map((i) => ({
      ...attacker(i),
      name: `Difensore 0${i + 1}`,
      role: "D" as Role,
    }));
    const reading = read({ pool: [...ATTACKERS, ...difensori] });
    if (reading.kind !== "candidates") throw new Error("attesi candidati");
    expect(reading.freeInOpenRoles).toBe(63);
    expect(reading.withoutValue).toBe(3);
    expect(reading.candidates.some((c) => c.role === "D")).toBe(false);
  });

  it("l'ancora resta a schermo con la sua scomposizione, anche se non sottrae più", () => {
    const top = candidatesOf(read()).find((c) => c.playerId === key(TOP))!;
    expect(top.anchor.baseAnchor).toBe(100);
    expect(top.anchor.correctedAnchor).toBe(100);
    expect(top.anchor.coldStart).toBe(true);
  });
});

describe("i parametri e la ratifica viaggiano nel dato", () => {
  it("il tetto delle righe è RATIFICATO, e tronca davvero", () => {
    const reading = read();
    expect(reading.parameters.rowsMax).toBe(PER_ME_ROWS_MAX);
    expect(reading.parameters.rowsMaxStatus).toBe("ratificato da Pico il 2026-08-31");
    expect(reading.parameters.rowsMaxStatus).not.toContain("provvisorio");
    expect(perMeShownCandidates(reading)).toHaveLength(3);
    expect(candidatesOf(reading).length).toBeGreaterThan(3);
  });

  it("i due sottoblocchi del riquadro dicono lo stato del tetto NELLO STESSO MODO", () => {
    // Il letterale è condiviso col pannello esca: due copie della stessa
    // affermazione sono due occasioni di divergere, e questo test è ciò che
    // impedisce che una delle due resti indietro.
    expect(PER_ME_PARAMETERS.rowsMaxStatus).toBe(ROWS_MAX_STATUS);
    expect(BAIT_PARAMETERS.rowsMaxStatus).toBe(ROWS_MAX_STATUS);
    expect(BAIT_PARAMETERS.rowsMax).toBe(PER_ME_PARAMETERS.rowsMax);
  });

  it("ogni lettura porta le DUE scelte non ratificate, e nessuna è firmata", () => {
    for (const reading of [read(), read({ pool: [] })]) {
      expect(reading.ratification.ratified).toBe(false);
      expect(reading.ratification.unratifiedChoices).toEqual(PER_ME_UNRATIFIED_CHOICES);
    }
    // Il vocabolario del motore le conosce entrambe e per ognuna c'è un MOTIVO
    // scritto: un identificatore senza motivo sarebbe una scelta nascosta con
    // un nome sopra. Questo test la DOCUMENTA, non la approva.
    expect(PER_ME_UNRATIFIED_CHOICES).toEqual([
      "PER_ME_DECLARED_PLAN_FITS_ON_EXPECTED_PRICE",
      "PER_ME_REQUIRES_ANCHOR_SCALE",
    ]);
    for (const id of PER_ME_UNRATIFIED_CHOICES) {
      expect(UNRATIFIED_CHOICES[id].length).toBeGreaterThan(0);
    }
  });

  it("la riserva dura è quella del motore, copiata per essere ispezionabile", () => {
    expect(PER_ME_PARAMETERS.costFloor).toBe(COST_FLOOR);
  });

  it("la base dichiarata dice su che cosa poggia la lettura", () => {
    expect(read().basis).toBe("credit-value-expected-price-and-dynamic-plan");
  });
});

describe("la cache del listino delle ancore", () => {
  it("due letture sullo stesso pool costruiscono il listino UNA volta sola", () => {
    read();
    expect(perMeAnchorCacheStats()).toEqual({ builds: 1, hits: 0 });
    read();
    expect(perMeAnchorCacheStats()).toEqual({ builds: 1, hits: 1 });
  });

  it("un pool DIVERSO ricostruisce: la chiave è l'identità dell'array", () => {
    read();
    read({ pool: [...ATTACKERS] });
    expect(perMeAnchorCacheStats().builds).toBe(2);
  });

  it("la cache non tiene nulla che dipenda dallo stato: cambia il log, cambia l'esito", () => {
    const prima = candidatesOf(read()).map((c) => c.playerId);
    const log = logAfter([
      { playerId: key(ATTACKERS[0]!), role: "A", fantaTeamId: RIVAL, price: 50 },
    ]);
    const dopo = candidatesOf(read({ log })).map((c) => c.playerId);
    expect(dopo).not.toEqual(prima);
    // …e il listino delle ancore è stato comunque riusato: dipende dal pool,
    // non dallo stato.
    expect(perMeAnchorCacheStats().hits).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  BASE_VOTE_GRID,
  BASE_VOTE_STEP,
  MAX_TILT_DELTA_MEAN,
  SCALABLE_EVENTS,
  SCALE_LAWS,
  AdjustmentError,
  type Adjustment,
  type AdjustmentErrorCode,
  type AppearanceEvents,
  type BaseVoteMass,
  type PlayerAppearance,
  type PlayerDistribution,
  type PlayerEventRates,
  type PlayerForecast,
  type Role,
  type ScalableEvent,
  type TeamGameweek,
  applyAdjustments,
  assertForecasts,
  assertPlayerDistribution,
  buildBaseForecasts,
  buildChallengerForecasts,
  meanFantasyScoreIfPlays,
  modalRowOfDistribution,
  mulberry32,
  observedHistory,
} from "../src/index.js";

// LA PORTA UNICA DEI RITOCCHI (`src/adjustments.ts`) — le prove.
//
// FIXTURE SINTETICHE: identificatori costruiti (`CENTRO`, `PORTA`…), probabilità
// scelte a mano sulla griglia dei mezzi punti, nessun dato reale, nessuna rete,
// nessun orologio. Ogni numero atteso che non è una proprietà è derivato a mano,
// col conto scritto accanto: una formula sbagliata ma stabile non deve passare.
//
// COSA DIMOSTRANO. Tre cose, e ciascuna ha le sue prove nominate:
//  1. OGNI RITOCCO CONSERVA LE INVARIANTI — somma delle probabilità, griglia del
//     voto, riga modale ricalcolata — su ciascun tipo di ritocco e su sequenze
//     casuali (seme dichiarato) di tutti e cinque.
//  2. SENZA RITOCCHI L'USCITA È IDENTICA, bit a bit: stessa array, stessi
//     oggetti. Lo stesso vale per un ritocco che non cambia nessun numero.
//  3. UN RITOCCO FUORI DAI LIMITI SI RIFIUTA con un `AdjustmentError` nominato,
//     e con lui un ritocco che non si sa leggere o non si può applicare.
//
// LE MUTAZIONI. Ogni prova porta in coda al titolo la mutazione che esiste per
// fermare — `[M1]`…: una mutazione, una prova. Vale la lettura onesta di
// «una prova»: dove una mutazione rompe l'uscita al punto che la convalida del
// contratto la rifiuta, cadono anche le altre prove che esercitano quel
// ritocco, ed è il comportamento voluto di una porta che convalida.
//  [M1] identità rotta: una copia che perde `svKind` anche con la lista vuota.
//  [M2] l'inclinazione sposta i voti invece delle masse (il supporto cambia).
//  [M3] `scaleEvent` senza tetto a 1.
//  [M4] ordine invertito: la lista non si applica nell'ordine scritto.
//  [M5] l'inclinazione sposta la media di 2δ.
//  [M6] la riga modale non si ricalcola.
//  [M7] il tetto di `tiltBaseVote` sparisce.
//  [M8] `setPPlays` non aggiorna `voteProbability`.
//  [M9] `shiftGoalsConceded` senza ri-normalizzazione.
//  [M10] nessuna convalida dell'uscita.
//  [M11] `scaleEvent` scala l'evento sbagliato.
//  [M12] l'ingresso viene mutato sul posto.
//  [M13] nessuna convalida dell'ingresso.
//  [M14] una previsione senza distribuzione viene ignorata in silenzio.
//  [M15] `shiftGoalsConceded` accetta factor 0.
//  [M16] `setPPlays` non porta con sé `pStarter` e `pSub`.
//  [M17] la soglia di un evento nella riga modale diventa «≥ 0,5» invece di «> 0,5».
//  [M18] a parità di massa la riga modale sceglie il voto (o i gol subiti) più alto.
//  [M19] `scaleEvent` con `law: "hazard"` fa il conto lineare (la legge è ignorata).
//  [M20] la `note` non si accoda a `sourceQuality`.
//  [M21] `setEvent` accetta un valore fuori da [0, 1].
//  [M22] la `note` si accoda con un separatore o una forma diversi da `"; "`.
//  [M23] la `note` tocca `asOf`.
//  [M24] una `note` vuota viene accettata.
//  [M25] una `note` su una previsione senza distribuzione viene ignorata in silenzio.
//  [M26] una `law` sconosciuta viene accettata.
//  [M27] un ritocco che non cambia numeri ma porta una `note` non la accoda.
//  [M28] `setEvent` al valore che c'è non lascia la stessa array.

const ASOF = "2026-10-01T10:00:00Z";
const QUALITY = "fixture sintetica";
const SV_PURE = { clean: 1, booked: 0, sentOffDuringMatch: 0, withOtherBonusMalus: 0, sentOffAfterMatch: 0 } as const;
const NO_EVENTS = { pGoal: 0, pAssist: 0, pYellow: 0, pRed: 0, pOwnGoal: 0, pPenMissed: 0, pPenSaved: 0 } as const;

interface Spec {
  readonly id: string;
  readonly role: Role;
  readonly baseVote: readonly BaseVoteMass[];
  readonly events?: Partial<Omit<PlayerEventRates, "goalsConceded">>;
  readonly goalsConceded?: readonly number[];
  readonly pPlays?: number;
  readonly pStarter?: number;
  readonly pSub?: number;
  readonly svKind?: PlayerDistribution["svKind"];
  readonly svOtherBonusMalus?: number;
  readonly expected?: Partial<PlayerForecast["expected"]>;
  readonly exclusiveGroup?: string;
}

/** Una previsione completa; la riga modale è scritta A MANO nella specifica, mai calcolata dal modulo sotto prova. */
function make(spec: Spec): PlayerForecast {
  const pPlays = spec.pPlays ?? 0.9;
  const goalsConceded = spec.goalsConceded ?? (spec.role === "P" ? [0.5, 0.3, 0.2] : undefined);
  const distribution: PlayerDistribution = {
    pPlays,
    pStarter: spec.pStarter ?? pPlays,
    pSub: spec.pSub ?? 0,
    baseVote: spec.baseVote,
    events: { ...NO_EVENTS, ...spec.events, ...(goalsConceded === undefined ? {} : { goalsConceded }) },
    svKind: spec.svKind ?? SV_PURE,
    ...(spec.svOtherBonusMalus === undefined ? {} : { svOtherBonusMalus: spec.svOtherBonusMalus }),
    asOf: ASOF,
    sourceQuality: QUALITY,
  };
  return {
    id: spec.id,
    role: spec.role,
    voteProbability: pPlays,
    expected: { baseVote: 6, fantasyScore: 6, receivedAnyBonus: false, missedPenalty: false, ...spec.expected },
    distribution,
    ...(spec.exclusiveGroup === undefined ? {} : { exclusiveGroup: spec.exclusiveGroup }),
  };
}

/**
 * CENTRO — un centrocampista con una distribuzione larga, tutti gli eventi
 * possibili e nessuno di loro sopra 0,5 (quindi la riga modale è un 6 nudo).
 * Voto: 5,5→0,10 · 6→0,45 · 6,5→0,30 · 7→0,15. Media: 0,55 + 2,70 + 1,95 + 1,05 = 6,25.
 * Il massimo è 6 (0,45).
 */
const centro = (): PlayerForecast =>
  make({
    id: "CENTRO",
    role: "C",
    baseVote: [
      { vote: 5.5, probability: 0.1 },
      { vote: 6, probability: 0.45 },
      { vote: 6.5, probability: 0.3 },
      { vote: 7, probability: 0.15 },
    ],
    events: { pGoal: 0.45, pAssist: 0.2, pYellow: 0.15, pRed: 0.02, pOwnGoal: 0.01, pPenMissed: 0.01, pPenSaved: 0.01 },
    pPlays: 0.9,
    pStarter: 0.7,
    pSub: 0.2,
    svKind: { clean: 0.6, booked: 0.1, sentOffDuringMatch: 0.05, withOtherBonusMalus: 0.2, sentOffAfterMatch: 0.05 },
    svOtherBonusMalus: 1,
  });

/**
 * PORTA — un portiere. Voto: 5,5→0,2 · 6→0,5 · 6,5→0,3, media 1,10 + 3,00 + 1,95 = 6,05.
 * Gol subiti 0→0,30 · 1→0,35 · 2→0,25 · 3→0,10: il massimo è a 1 gol, quindi la
 * riga modale è 6 − 1 = 5.
 */
const porta = (): PlayerForecast =>
  make({
    id: "PORTA",
    role: "P",
    baseVote: [
      { vote: 5.5, probability: 0.2 },
      { vote: 6, probability: 0.5 },
      { vote: 6.5, probability: 0.3 },
    ],
    events: { pYellow: 0.05, pRed: 0.01, pOwnGoal: 0.01, pPenSaved: 0.1 },
    goalsConceded: [0.3, 0.35, 0.25, 0.1],
    pPlays: 0.95,
    pStarter: 0.9,
    pSub: 0.05,
    svKind: { clean: 0.8, booked: 0.1, sentOffDuringMatch: 0.05, withOtherBonusMalus: 0, sentOffAfterMatch: 0.05 },
    expected: { fantasyScore: 5 },
  });

/**
 * FASCIA — tre voti soltanto: 5,5→0,25 · 6→0,40 · 6,5→0,35, media 1,375 + 2,40 + 2,275 = 6,05.
 * Il massimo è 6. Con un'inclinazione di +0,4 la media richiesta è 6,45 e,
 * poiché 6,5 − 0,5·q(6) − 1·q(5,5) = 6,45, vale 0,5·q(6) + q(5,5) = 0,05: q(6) ≤ 0,1,
 * q(5,5) ≤ 0,05, e q(6) + q(5,5) = 0,05 + 0,5·q(6) ≤ 0,10, cioè q(6,5) ≥ 0,90 — il massimo
 * diventa 6,5 qualunque sia il metodo.
 */
const fascia = (): PlayerForecast =>
  make({
    id: "FASCIA",
    role: "C",
    baseVote: [
      { vote: 5.5, probability: 0.25 },
      { vote: 6, probability: 0.4 },
      { vote: 6.5, probability: 0.35 },
    ],
    events: { pAssist: 0.1 },
  });

/** CONCENTRATO — 6,5→0,9 · 7→0,1: media 6,55. Una media richiesta sopra 7 o sotto 6,5 non è raggiungibile. */
const concentrato = (): PlayerForecast =>
  make({
    id: "CONCENTRATO",
    role: "A",
    baseVote: [
      { vote: 6.5, probability: 0.9 },
      { vote: 7, probability: 0.1 },
    ],
    events: { pGoal: 0.3 },
    pPlays: 0.8,
    pStarter: 0.6,
    pSub: 0.2,
    expected: { baseVote: 6.5, fantasyScore: 6.5 },
  });

/** UFFICIO — un voto certo, senza eventi (il caso del voto d'ufficio): non c'è una media da muovere. */
const ufficio = (): PlayerForecast =>
  make({ id: "UFFICIO", role: "C", baseVote: [{ vote: 6, probability: 1 }], pPlays: 1, pStarter: 1, pSub: 0 });

/** SOLO_RIGA — nessuna distribuzione: la sola riga modale, come un produttore minimo. */
const soloRiga = (): PlayerForecast => ({
  id: "SOLO_RIGA",
  role: "D",
  voteProbability: 0.7,
  expected: { baseVote: 6, fantasyScore: 6, receivedAnyBonus: false, missedPenalty: false },
});

/**
 * ECCEDENTE — `pStarter + pSub` = 0,95 ≤ 1 (valido) ma OLTRE `pPlays` = 0,5. Il
 * contratto non pretende che stiano dentro `pPlays`; la porta sì, quando li scala.
 */
const eccedente = (): PlayerForecast =>
  make({ id: "ECCEDENTE", role: "C", baseVote: [{ vote: 6, probability: 1 }], pPlays: 0.5, pStarter: 0.9, pSub: 0.05 });

const roster = (): PlayerForecast[] => [centro(), porta(), fascia(), concentrato(), ufficio(), soloRiga()];

// ─── STRUMENTI ───────────────────────────────────────────────────────────────

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function rejection(run: () => unknown): AdjustmentError {
  try {
    run();
  } catch (error) {
    if (error instanceof AdjustmentError) return error;
    throw error;
  }
  throw new Error("atteso un AdjustmentError: nessun errore lanciato");
}

function expectRejection(run: () => unknown, code: AdjustmentErrorCode, index: number | null = null): AdjustmentError {
  const error = rejection(run);
  expect(error.name).toBe("AdjustmentError");
  expect(error.code).toBe(code);
  if (index !== null) expect(error.index).toBe(index);
  return error;
}

const meanVote = (f: PlayerForecast): number => {
  let mean = 0;
  for (const mass of (f.distribution as PlayerDistribution).baseVote) mean += mass.vote * mass.probability;
  return mean;
};

const one = (forecast: PlayerForecast, ...adjustments: Adjustment[]): PlayerForecast =>
  applyAdjustments([forecast], adjustments)[0] as PlayerForecast;

const dist = (f: PlayerForecast): PlayerDistribution => f.distribution as PlayerDistribution;

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

/** Le invarianti del contratto, rilette qui con un conto indipendente da quello del modulo. */
function expectInvariants(f: PlayerForecast): void {
  const d = f.distribution;
  if (d === undefined) return;
  assertPlayerDistribution(
    { id: f.id, role: f.role, voteProbability: f.voteProbability, modalBaseVote: f.expected.baseVote },
    d,
    "prova",
  );
  expect(Math.abs(sum(d.baseVote.map((m) => m.probability)) - 1)).toBeLessThan(1e-12);
  for (const mass of d.baseVote) {
    expect(BASE_VOTE_GRID).toContain(mass.vote);
    expect(mass.probability).toBeGreaterThanOrEqual(0);
    expect(mass.probability).toBeLessThanOrEqual(1);
  }
  if (d.events.goalsConceded !== undefined) {
    expect(Math.abs(sum(d.events.goalsConceded) - 1)).toBeLessThan(1e-12);
  }
  expect(d.pPlays).toBe(f.voteProbability);
  expect(f.expected).toEqual(modalRowOfDistribution(d));
}

// ═══ LE FIXTURE SONO QUELLO CHE DICONO ═══════════════════════════════════════

describe("la porta dei ritocchi — le fixture sono valide e la loro riga modale è quella scritta a mano", () => {
  it("la rosa di prova passa `assertForecasts`", () => {
    expect(() => assertForecasts(roster(), "fixture")).not.toThrow();
    expect(() => assertForecasts([eccedente()], "fixture")).not.toThrow();
  });

  it("le medie scritte nei commenti sono quelle vere", () => {
    expect(meanVote(centro())).toBeCloseTo(6.25, 12);
    expect(meanVote(porta())).toBeCloseTo(6.05, 12);
    expect(meanVote(fascia())).toBeCloseTo(6.05, 12);
    expect(meanVote(concentrato())).toBeCloseTo(6.55, 12);
  });

  it("la riga modale scritta a mano coincide con `modalRowOfDistribution`", () => {
    for (const f of roster()) {
      if (f.distribution !== undefined) expect(modalRowOfDistribution(f.distribution)).toEqual(f.expected);
    }
  });
});

// ═══ 2. SENZA RITOCCHI L'USCITA È IDENTICA ═══════════════════════════════════

describe("la porta dei ritocchi — l'identità", () => {
  it("[M1] lista vuota = identità: la stessa array, gli stessi oggetti, gli stessi bit", () => {
    const input = roster();
    const before = JSON.stringify(input);
    const out = applyAdjustments(input, []);
    expect(out).toBe(input);
    out.forEach((f, i) => expect(f).toBe(input[i]));
    expect(JSON.stringify(out)).toBe(before);
  });

  it("un ritocco che non cambia nessun numero lascia la stessa array", () => {
    const input = roster();
    const out = applyAdjustments(input, [
      { kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 1 },
      { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean: 0 },
      { kind: "setPPlays", playerId: "CENTRO", pPlays: 0.9 },
      { kind: "setPPlays", playerId: "SOLO_RIGA", pPlays: 0.7 },
    ]);
    expect(out).toBe(input);
  });

  it("un giocatore che nessun ritocco nomina esce come lo stesso oggetto", () => {
    const input = roster();
    const out = applyAdjustments(input, [{ kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 1.2 }]);
    expect(out).not.toBe(input);
    expect(out[0]).not.toBe(input[0]);
    for (let i = 1; i < input.length; i += 1) expect(out[i]).toBe(input[i]);
    expect(out.map((f) => f.id)).toEqual(input.map((f) => f.id));
  });

  it("[M12] l'ingresso non si muta: congelato in profondità, ogni ritocco passa e l'ingresso resta com'era", () => {
    const input = deepFreeze(roster());
    const before = JSON.stringify(input);
    const out = applyAdjustments(input, [
      { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean: 0.2 },
      { kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 1.2 },
      { kind: "setPPlays", playerId: "CENTRO", pPlays: 0.5 },
      { kind: "shiftGoalsConceded", playerId: "PORTA", factor: 2 },
      { kind: "setPPlays", playerId: "SOLO_RIGA", pPlays: 0.4 },
    ]);
    expect(JSON.stringify(input)).toBe(before);
    expect(out).not.toBe(input);
  });

  it("è deterministica: la stessa lista dà gli stessi bit", () => {
    const list: Adjustment[] = [
      { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean: -0.17 },
      { kind: "shiftGoalsConceded", playerId: "PORTA", factor: 1.3 },
      { kind: "scaleEvent", playerId: "FASCIA", event: "pAssist", factor: 2 },
    ];
    expect(JSON.stringify(applyAdjustments(roster(), list))).toBe(JSON.stringify(applyAdjustments(roster(), list)));
  });
});

// ═══ tiltBaseVote ════════════════════════════════════════════════════════════

describe("tiltBaseVote — sposta la media restando sul supporto", () => {
  const DELTAS = [-0.5, -0.3, -0.1, 0.05, 0.25, 0.5];

  it("[M5] la media del voto base si sposta di δ, e il fantavoto atteso con lei, entro 1e-9", () => {
    for (const deltaMean of DELTAS) {
      const before = centro();
      const after = one(before, { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean });
      expect(meanVote(after) - meanVote(before)).toBeCloseTo(deltaMean, 9);
      const role = { role: before.role };
      expect(
        meanFantasyScoreIfPlays(role, dist(after)) - meanFantasyScoreIfPlays(role, dist(before)),
      ).toBeCloseTo(deltaMean, 9);
    }
  });

  it("[M2] il supporto non cambia: gli stessi voti nello stesso ordine, sulla griglia, nessuna massa nata dal nulla", () => {
    for (const deltaMean of DELTAS) {
      const before = dist(centro());
      const after = dist(one(centro(), { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean }));
      expect(after.baseVote.map((m) => m.vote)).toEqual(before.baseVote.map((m) => m.vote));
      after.baseVote.forEach((m, i) => {
        expect(BASE_VOTE_GRID).toContain(m.vote);
        expect(m.probability > 0).toBe((before.baseVote[i] as BaseVoteMass).probability > 0);
      });
    }
  });

  it("una massa nulla resta nulla", () => {
    const withZero = make({
      id: "ZERO",
      role: "C",
      baseVote: [
        { vote: 5.5, probability: 0 },
        { vote: 6, probability: 0.6 },
        { vote: 6.5, probability: 0.4 },
      ],
    });
    const after = one(withZero, { kind: "tiltBaseVote", playerId: "ZERO", deltaMean: 0.1 });
    expect(dist(after).baseVote.map((m) => m.vote)).toEqual([5.5, 6, 6.5]);
    expect((dist(after).baseVote[0] as BaseVoteMass).probability).toBe(0);
    expectInvariants(after);
  });

  it("la somma resta uno e ogni massa sta in [0, 1]", () => {
    for (const deltaMean of DELTAS) {
      expectInvariants(one(centro(), { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean }));
    }
  });

  it("l'inclinazione è monotona: media in su = meno massa sotto ogni voto, e viceversa", () => {
    const cdf = (f: PlayerForecast): number[] => {
      let acc = 0;
      return dist(f).baseVote.map((m) => (acc += m.probability));
    };
    const base = cdf(centro());
    for (const deltaMean of DELTAS) {
      const moved = cdf(one(centro(), { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean }));
      moved.forEach((value, i) => {
        if (deltaMean > 0) expect(value).toBeLessThanOrEqual((base[i] as number) + 1e-12);
        else expect(value).toBeGreaterThanOrEqual((base[i] as number) - 1e-12);
      });
      // Strettamente: una media che si è mossa ha spostato massa da qualche parte.
      expect(Math.abs(sum(moved) - sum(base))).toBeGreaterThan(1e-6);
    }
  });

  it("due inclinazioni di fila si sommano: tilt(a) poi tilt(b) è tilt(b) poi tilt(a) è tilt(a + b), entro 1e-9", () => {
    const stepwise = one(
      centro(),
      { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean: 0.1 },
      { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean: 0.15 },
    );
    const swapped = one(
      centro(),
      { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean: 0.15 },
      { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean: 0.1 },
    );
    const direct = one(centro(), { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean: 0.25 });
    dist(direct).baseVote.forEach((m, i) => {
      expect((dist(stepwise).baseVote[i] as BaseVoteMass).probability).toBeCloseTo(m.probability, 9);
      expect((dist(swapped).baseVote[i] as BaseVoteMass).probability).toBeCloseTo(m.probability, 9);
    });
  });

  it("[M6] la riga modale si ricalcola: +0,4 su FASCIA porta il massimo da 6 a 6,5 e la riga lo segue", () => {
    const before = fascia();
    expect(before.expected.baseVote).toBe(6);
    const after = one(before, { kind: "tiltBaseVote", playerId: "FASCIA", deltaMean: 0.4 });
    // Conto a mano (testa di `fascia`): con media 6,45 il voto 6,5 ha almeno 0,90 di massa.
    expect((dist(after).baseVote[2] as BaseVoteMass).probability).toBeGreaterThanOrEqual(0.9 - 1e-9);
    expect(after.expected).toEqual({ baseVote: 6.5, fantasyScore: 6.5, receivedAnyBonus: false, missedPenalty: false });
    expectInvariants(after);
  });

  it("[M7] fuori dai limiti: oltre il tetto di un passo di reticolo, o non finito, si rifiuta", () => {
    expect(MAX_TILT_DELTA_MEAN).toBe(BASE_VOTE_STEP);
    expect(MAX_TILT_DELTA_MEAN).toBe(0.5);
    for (const deltaMean of [0.5000001, -0.6, 1.6, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expectRejection(
        () => applyAdjustments([centro()], [{ kind: "tiltBaseVote", playerId: "CENTRO", deltaMean }]),
        "out_of_bounds",
        0,
      );
    }
    // Il tetto è incluso: ±0,5 esatti passano (CENTRO ha supporto 5,5–7 e media 6,25).
    expect(() => one(centro(), { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean: 0.5 })).not.toThrow();
    expect(() => one(centro(), { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean: -0.5 })).not.toThrow();
  });

  it("una media fuori dal supporto del voto è impossibile e si rifiuta con il suo nome", () => {
    expectRejection(
      () => applyAdjustments([concentrato()], [{ kind: "tiltBaseVote", playerId: "CONCENTRATO", deltaMean: 0.5 }]),
      "unreachable_mean",
      0,
    );
    expectRejection(
      () => applyAdjustments([concentrato()], [{ kind: "tiltBaseVote", playerId: "CONCENTRATO", deltaMean: -0.1 }]),
      "unreachable_mean",
    );
    // Un voto certo non ha una media da muovere.
    expectRejection(
      () => applyAdjustments([ufficio()], [{ kind: "tiltBaseVote", playerId: "UFFICIO", deltaMean: 0.05 }]),
      "unreachable_mean",
    );
  });

  it("[M14] una previsione senza distribuzione non si ignora in silenzio", () => {
    expectRejection(
      () => applyAdjustments([soloRiga()], [{ kind: "tiltBaseVote", playerId: "SOLO_RIGA", deltaMean: 0.1 }]),
      "no_distribution",
      0,
    );
  });
});

// ═══ scaleEvent ══════════════════════════════════════════════════════════════

describe("scaleEvent — moltiplica una probabilità di evento e la tronca a 1", () => {
  it("[M11] scala l'evento nominato e nessun altro; il resto della previsione non si muove", () => {
    for (const event of SCALABLE_EVENTS) {
      const before = centro();
      const after = one(before, { kind: "scaleEvent", playerId: "CENTRO", event, factor: 0.5 });
      const b = dist(before).events as unknown as Record<string, number>;
      const a = dist(after).events as unknown as Record<string, number>;
      expect(a[event]).toBe((b[event] as number) * 0.5);
      for (const other of SCALABLE_EVENTS.filter((e) => e !== event)) expect(a[other]).toBe(b[other]);
      expect(dist(after).baseVote).toEqual(dist(before).baseVote);
      expect(dist(after).svKind).toEqual(dist(before).svKind);
      expect(after.voteProbability).toBe(before.voteProbability);
    }
  });

  it("[M3] il tetto: factor 10 porta ogni probabilità a 1 e non oltre", () => {
    for (const event of SCALABLE_EVENTS) {
      const after = one(centro(), { kind: "scaleEvent", playerId: "CENTRO", event, factor: 10 });
      const value = (dist(after).events as unknown as Record<string, number>)[event] as number;
      expect(value).toBeLessThanOrEqual(1);
      expectInvariants(after);
    }
    // pGoal 0,45 × 10 = 4,5, troncato a 1.
    const goal = one(centro(), { kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 10 });
    expect(dist(goal).events.pGoal).toBe(1);
  });

  it("factor 0 azzera, e una probabilità zero resta zero qualunque sia il fattore", () => {
    const zeroed = one(centro(), { kind: "scaleEvent", playerId: "CENTRO", event: "pAssist", factor: 0 });
    expect(dist(zeroed).events.pAssist).toBe(0);
    // PORTA ha pGoal = 0: 0 × 1000 = 0, nessun numero cambia, quindi esce lo stesso oggetto.
    const keeper = porta();
    const stays = one(keeper, { kind: "scaleEvent", playerId: "PORTA", event: "pGoal", factor: 1000 });
    expect(stays).toBe(keeper);
    expect(dist(stays).events.pGoal).toBe(0);
  });

  it("[M6] un evento che attraversa 0,5 cambia la riga modale come il regolamento (tariffa di §12)", () => {
    // CENTRO ha il 6 nudo. Ogni riga: evento, fattore che porta la probabilità sopra 0,5, riga attesa a mano.
    const cases: readonly [ScalableEvent, number, PlayerForecast["expected"]][] = [
      ["pGoal", 1.2, { baseVote: 6, fantasyScore: 9, receivedAnyBonus: true, missedPenalty: false }], //   0,45 → 0,54, +3
      ["pAssist", 3, { baseVote: 6, fantasyScore: 7, receivedAnyBonus: true, missedPenalty: false }], //   0,20 → 0,60, +1
      ["pYellow", 4, { baseVote: 6, fantasyScore: 5.5, receivedAnyBonus: false, missedPenalty: false }], // 0,15 → 0,60, −0,5
      ["pRed", 40, { baseVote: 6, fantasyScore: 5, receivedAnyBonus: false, missedPenalty: false }], //    0,02 → 0,80, −1
      ["pOwnGoal", 60, { baseVote: 6, fantasyScore: 4, receivedAnyBonus: false, missedPenalty: false }], // 0,01 → 0,60, −2
      ["pPenMissed", 60, { baseVote: 6, fantasyScore: 3, receivedAnyBonus: false, missedPenalty: true }], // 0,01 → 0,60, −3
      ["pPenSaved", 60, { baseVote: 6, fantasyScore: 9, receivedAnyBonus: true, missedPenalty: false }], // 0,01 → 0,60, +3
    ];
    for (const [event, factor, expected] of cases) {
      const after = one(centro(), { kind: "scaleEvent", playerId: "CENTRO", event, factor });
      expect(after.expected).toEqual(expected);
      expectInvariants(after);
    }
    // E sotto la soglia la riga non si inventa niente: 0,45 × 1,1 = 0,495.
    const below = one(centro(), { kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 1.1 });
    expect(below.expected).toEqual(centro().expected);
    expect(dist(below).events.pGoal).toBeCloseTo(0.495, 12);
  });

  it("[M4] la lista si applica nell'ordine scritto, e il tetto fa sì che l'ordine conti", () => {
    // pAssist = 0,2. ×10 → 2, troncato a 1; poi ×0,5 → 0,5.
    // Invertita: ×0,5 → 0,1; poi ×10 → 1. Due risultati diversi per le stesse due voci.
    const tenThenHalf = one(
      centro(),
      { kind: "scaleEvent", playerId: "CENTRO", event: "pAssist", factor: 10 },
      { kind: "scaleEvent", playerId: "CENTRO", event: "pAssist", factor: 0.5 },
    );
    const halfThenTen = one(
      centro(),
      { kind: "scaleEvent", playerId: "CENTRO", event: "pAssist", factor: 0.5 },
      { kind: "scaleEvent", playerId: "CENTRO", event: "pAssist", factor: 10 },
    );
    expect(dist(tenThenHalf).events.pAssist).toBe(0.5);
    expect(dist(halfThenTen).events.pAssist).toBe(1);
    // La riga lo segue: 0,5 non supera 0,5, 1 sì.
    expect(tenThenHalf.expected.fantasyScore).toBe(6);
    expect(halfThenTen.expected.fantasyScore).toBe(7);
  });

  it("fuori dai limiti: factor negativo o non finito, evento sconosciuto, gol subiti come evento", () => {
    for (const factor of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expectRejection(
        () => applyAdjustments([centro()], [{ kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor }]),
        "out_of_bounds",
        0,
      );
    }
    for (const event of ["pFoo", "goalsConceded", "baseVote", ""]) {
      expectRejection(
        () =>
          applyAdjustments(
            [centro()],
            [{ kind: "scaleEvent", playerId: "CENTRO", event, factor: 1 } as unknown as Adjustment],
          ),
        "malformed_adjustment",
        0,
      );
    }
  });

  it("[M14] una previsione senza distribuzione non si ignora in silenzio", () => {
    expectRejection(
      () => applyAdjustments([soloRiga()], [{ kind: "scaleEvent", playerId: "SOLO_RIGA", event: "pGoal", factor: 2 }]),
      "no_distribution",
      0,
    );
  });
});

// ═══ setPPlays ═══════════════════════════════════════════════════════════════

describe("setPPlays — fissa P(prende voto) tenendo coerenti i due numeri che la dicono", () => {
  it("[M8] voteProbability e pPlays coincidono, e il resto della distribuzione non si muove", () => {
    const before = centro();
    const after = one(before, { kind: "setPPlays", playerId: "CENTRO", pPlays: 0.6 });
    expect(after.voteProbability).toBe(0.6);
    expect(dist(after).pPlays).toBe(0.6);
    expect(dist(after).baseVote).toEqual(dist(before).baseVote);
    expect(dist(after).events).toEqual(dist(before).events);
    expect(dist(after).svKind).toEqual(dist(before).svKind);
    expect(after.expected).toEqual(before.expected);
    expectInvariants(after);
  });

  it("[M16] pStarter e pSub si scalano dello stesso rapporto: la quota di titolari su chi gioca resta", () => {
    // 0,9 → 0,6: rapporto 2/3. pStarter 0,7 → 0,4666…, pSub 0,2 → 0,1333…, somma 0,6.
    const after = dist(one(centro(), { kind: "setPPlays", playerId: "CENTRO", pPlays: 0.6 }));
    expect(after.pStarter).toBeCloseTo((0.7 * 2) / 3, 12);
    expect(after.pSub).toBeCloseTo((0.2 * 2) / 3, 12);
    expect(after.pStarter + after.pSub).toBeCloseTo(0.6, 12);
    expect(after.pStarter / after.pPlays).toBeCloseTo(0.7 / 0.9, 12);
  });

  it("zero e uno sono previsioni valide", () => {
    const zero = one(centro(), { kind: "setPPlays", playerId: "CENTRO", pPlays: 0 });
    expect(zero.voteProbability).toBe(0);
    expect(dist(zero).pStarter).toBe(0);
    expect(dist(zero).pSub).toBe(0);
    expectInvariants(zero);
    const full = one(centro(), { kind: "setPPlays", playerId: "CENTRO", pPlays: 1 });
    expect(full.voteProbability).toBe(1);
    expect(dist(full).pStarter + dist(full).pSub).toBeCloseTo(1, 12);
    expectInvariants(full);
  });

  it("da una probabilità zero non c'è una quota da conservare: pStarter e pSub restano come sono", () => {
    const sleeping = make({ id: "FERMO", role: "C", baseVote: [{ vote: 6, probability: 1 }], pPlays: 0, pStarter: 0, pSub: 0 });
    const after = one(sleeping, { kind: "setPPlays", playerId: "FERMO", pPlays: 0.8 });
    expect(after.voteProbability).toBe(0.8);
    expect(dist(after).pStarter).toBe(0);
    expect(dist(after).pSub).toBe(0);
    expectInvariants(after);
  });

  it("senza distribuzione cambia la sola voteProbability, e la riga modale non si tocca", () => {
    const before = soloRiga();
    const after = one(before, { kind: "setPPlays", playerId: "SOLO_RIGA", pPlays: 0.25 });
    expect(after).toEqual({ ...before, voteProbability: 0.25 });
    expect(after.distribution).toBeUndefined();
  });

  it("fuori dai limiti: sotto 0, sopra 1, non finito", () => {
    for (const pPlays of [-0.01, 1.01, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectRejection(
        () => applyAdjustments([centro()], [{ kind: "setPPlays", playerId: "CENTRO", pPlays }]),
        "out_of_bounds",
        0,
      );
    }
  });

  it("[M10] se la scalatura rompe il contratto, l'uscita si rifiuta con `invariant_broken`", () => {
    // ECCEDENTE: pStarter 0,9 + pSub 0,05 stanno sotto 1 ma sopra pPlays 0,5. Portare pPlays a 1
    // raddoppia entrambi: pStarter 1,8, che nessuna distribuzione può avere.
    expectRejection(
      () => applyAdjustments([eccedente()], [{ kind: "setPPlays", playerId: "ECCEDENTE", pPlays: 1 }]),
      "invariant_broken",
      0,
    );
  });

  it("il gruppo esclusivo non lo vede la porta, lo vede `assertForecasts`: dichiarato, e provato", () => {
    // Due portieri dello stesso club: 0,5 + 0,4 = 0,9 ≤ 1. Portare il primo a 0,9 fa 1,3.
    const first = make({ id: "P1", role: "P", baseVote: [{ vote: 6, probability: 1 }], pPlays: 0.5, pStarter: 0.5, exclusiveGroup: "CLUB_X" });
    const second = make({ id: "P2", role: "P", baseVote: [{ vote: 6, probability: 1 }], pPlays: 0.4, pStarter: 0.4, exclusiveGroup: "CLUB_X" });
    expect(() => assertForecasts([first, second], "rosa")).not.toThrow();
    const out = applyAdjustments([first, second], [{ kind: "setPPlays", playerId: "P1", pPlays: 0.9 }]);
    expect(out[0]?.voteProbability).toBe(0.9);
    expect(out[0]?.exclusiveGroup).toBe("CLUB_X");
    expect(() => assertForecasts(out, "rosa")).toThrow(/gruppo esclusivo/);
  });
});

// ═══ shiftGoalsConceded ══════════════════════════════════════════════════════

describe("shiftGoalsConceded — sposta i gol subiti del portiere", () => {
  it("factor 2: la massa su k gol diventa m_k · 2^k, ri-normalizzata (conto a mano)", () => {
    // [0,30 · 1, 0,35 · 2, 0,25 · 4, 0,10 · 8] = [0,30, 0,70, 1,00, 0,80], totale 2,80.
    const after = one(porta(), { kind: "shiftGoalsConceded", playerId: "PORTA", factor: 2 });
    const goals = dist(after).events.goalsConceded as readonly number[];
    expect(goals).toHaveLength(4);
    expect(goals[0]).toBeCloseTo(0.3 / 2.8, 12);
    expect(goals[1]).toBeCloseTo(0.7 / 2.8, 12);
    expect(goals[2]).toBeCloseTo(1 / 2.8, 12);
    expect(goals[3]).toBeCloseTo(0.8 / 2.8, 12);
  });

  it("[M9] la somma resta uno, e il resto della previsione non si muove", () => {
    for (const factor of [0.2, 0.5, 1, 2, 5]) {
      const before = porta();
      const after = one(before, { kind: "shiftGoalsConceded", playerId: "PORTA", factor });
      expectInvariants(after);
      expect(dist(after).baseVote).toEqual(dist(before).baseVote);
      expect({ ...dist(after).events, goalsConceded: undefined }).toEqual({ ...dist(before).events, goalsConceded: undefined });
      expect(after.voteProbability).toBe(before.voteProbability);
    }
  });

  it("[M6] la riga modale segue il massimo dei gol subiti: da 1 gol (5) a 2 gol (4)", () => {
    expect(porta().expected.fantasyScore).toBe(5);
    const worse = one(porta(), { kind: "shiftGoalsConceded", playerId: "PORTA", factor: 2 });
    // Dopo: il massimo è 2 gol (1,00/2,80), quindi 6 − 2.
    expect(worse.expected).toEqual({ baseVote: 6, fantasyScore: 4, receivedAnyBonus: false, missedPenalty: false });
    // Verso meno gol: factor 0,2 → [0,30, 0,07, 0,01, 0,0008]: il massimo è 0 gol, riga 6.
    const better = one(porta(), { kind: "shiftGoalsConceded", playerId: "PORTA", factor: 0.2 });
    expect(better.expected.fantasyScore).toBe(6);
  });

  it("è monotono: factor > 1 aumenta i gol subiti attesi, factor < 1 li diminuisce, factor 1 li lascia (entro l'arrotondamento)", () => {
    const expectedGoals = (f: PlayerForecast): number =>
      (dist(f).events.goalsConceded as readonly number[]).reduce((acc, m, k) => acc + k * m, 0);
    const base = expectedGoals(porta());
    expect(expectedGoals(one(porta(), { kind: "shiftGoalsConceded", playerId: "PORTA", factor: 1.5 }))).toBeGreaterThan(base);
    expect(expectedGoals(one(porta(), { kind: "shiftGoalsConceded", playerId: "PORTA", factor: 0.7 }))).toBeLessThan(base);
    expect(expectedGoals(one(porta(), { kind: "shiftGoalsConceded", playerId: "PORTA", factor: 1 }))).toBeCloseTo(base, 12);
  });

  it("[M15] fuori dai limiti: factor zero, negativo o non finito si rifiutano", () => {
    for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectRejection(
        () => applyAdjustments([porta()], [{ kind: "shiftGoalsConceded", playerId: "PORTA", factor }]),
        "out_of_bounds",
        0,
      );
    }
  });

  it("solo il portiere ha gol subiti da spostare", () => {
    expectRejection(
      () => applyAdjustments([centro()], [{ kind: "shiftGoalsConceded", playerId: "CENTRO", factor: 2 }]),
      "not_a_goalkeeper",
      0,
    );
  });

  it("un fattore che non dà una distribuzione (overflow) si rifiuta con il suo nome", () => {
    // 1e200 elevato a 2 e a 3 gol non è un numero finito.
    expectRejection(
      () => applyAdjustments([porta()], [{ kind: "shiftGoalsConceded", playerId: "PORTA", factor: 1e200 }]),
      "degenerate_result",
      0,
    );
  });

  it("[M14] una previsione senza distribuzione non si ignora in silenzio", () => {
    expectRejection(
      () => applyAdjustments([soloRiga()], [{ kind: "shiftGoalsConceded", playerId: "SOLO_RIGA", factor: 2 }]),
      "no_distribution",
      0,
    );
  });
});

// ═══ ERRORI NOMINATI, ATOMICITÀ, CONVALIDA ═══════════════════════════════════

describe("la porta dei ritocchi — gli errori hanno un nome e la chiamata è atomica", () => {
  it("un id che non c'è, due previsioni con lo stesso id, un tipo che non esiste, un campo che non si legge", () => {
    expectRejection(
      () => applyAdjustments(roster(), [{ kind: "setPPlays", playerId: "NESSUNO", pPlays: 0.5 }]),
      "unknown_player",
      0,
    );
    expectRejection(
      () => applyAdjustments([centro(), centro()], [{ kind: "setPPlays", playerId: "CENTRO", pPlays: 0.5 }]),
      "duplicate_player",
    );
    const broken: unknown[] = [
      { kind: "tiltEverything", playerId: "CENTRO", deltaMean: 0.1 },
      { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean: "0.1" },
      { kind: "tiltBaseVote", playerId: "CENTRO" },
      { kind: "setPPlays", playerId: "", pPlays: 0.5 },
      { kind: "setPPlays", pPlays: 0.5 },
      null,
      "setPPlays",
      42,
    ];
    for (const adjustment of broken) {
      expectRejection(() => applyAdjustments(roster(), [adjustment as Adjustment]), "malformed_adjustment", 0);
    }
  });

  it("l'errore porta la posizione del ritocco colpevole, non della lista", () => {
    const error = expectRejection(
      () =>
        applyAdjustments(roster(), [
          { kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 1.2 },
          { kind: "setPPlays", playerId: "CENTRO", pPlays: 0.5 },
          { kind: "setPPlays", playerId: "CENTRO", pPlays: 1.5 },
        ]),
      "out_of_bounds",
      2,
    );
    expect(error.message).toContain("ritocco n.2");
    expect(error.message).toContain("CENTRO");
  });

  it("atomica: se un ritocco qualunque è rifiutato lancia la chiamata intera, e l'ingresso resta com'era", () => {
    const input = deepFreeze(roster());
    const before = JSON.stringify(input);
    expect(() =>
      applyAdjustments(input, [
        { kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 1.2 },
        { kind: "shiftGoalsConceded", playerId: "PORTA", factor: 2 },
        { kind: "tiltBaseVote", playerId: "UFFICIO", deltaMean: 0.1 },
      ]),
    ).toThrow(AdjustmentError);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("[M13] se il giocatore nominato era già fuori contratto in ingresso, è `invalid_input`; se nessuno lo nomina, passa", () => {
    const broken = centro();
    const wrong: PlayerForecast = {
      ...broken,
      distribution: { ...dist(broken), baseVote: [{ vote: 6, probability: 0.5 }] },
    };
    expectRejection(
      () => applyAdjustments([wrong], [{ kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 1.2 }]),
      "invalid_input",
      0,
    );
    // Un giocatore rotto che nessun ritocco nomina esce com'è: la sua convalida resta di chi consuma.
    const other = applyAdjustments([wrong, porta()], [{ kind: "setPPlays", playerId: "PORTA", pPlays: 0.5 }]);
    expect(other[0]).toBe(wrong);
    // E con la lista vuota non si convalida nessuno: l'identità non è condizionata alla validità.
    const input = [wrong];
    expect(applyAdjustments(input, [])).toBe(input);
  });

});

// ═══ 1. OGNI RITOCCO CONSERVA LE INVARIANTI: SEQUENZE CASUALI ═══════════════

describe("la porta dei ritocchi — le invarianti reggono su sequenze casuali di tutti e quattro i ritocchi", () => {
  /**
   * Sequenze valide per costruzione. I tilt sono piccoli (|δ| ≤ 0,05) e al più
   * sei per sequenza, quindi lo spostamento cumulato (≤ 0,3) resta dentro il
   * supporto di CENTRO, PORTA e FASCIA: nessun `unreachable_mean` può uscire
   * da qui, e un errore qualunque è un difetto vero.
   */
  function randomAdjustments(random: () => number): Adjustment[] {
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    const list: Adjustment[] = [];
    const length = 1 + Math.floor(random() * 6);
    for (let n = 0; n < length; n += 1) {
      const kind = pick(["tiltBaseVote", "scaleEvent", "setPPlays", "shiftGoalsConceded"] as const);
      if (kind === "tiltBaseVote") {
        list.push({ kind, playerId: pick(["CENTRO", "PORTA", "FASCIA"]), deltaMean: (random() - 0.5) * 0.1 });
      } else if (kind === "scaleEvent") {
        list.push({
          kind,
          playerId: pick(["CENTRO", "PORTA", "FASCIA", "CONCENTRATO", "UFFICIO"]),
          event: pick(SCALABLE_EVENTS),
          factor: pick([0, 0.3, 0.8, 1, 1.5, 4, 12]),
        });
      } else if (kind === "setPPlays") {
        list.push({
          kind,
          playerId: pick(["CENTRO", "PORTA", "FASCIA", "CONCENTRATO", "UFFICIO", "SOLO_RIGA"]),
          pPlays: pick([0, 0.25, 0.5, 0.9, 1]),
        });
      } else {
        list.push({ kind, playerId: "PORTA", factor: pick([0.2, 0.5, 1, 2, 5]) });
      }
    }
    return list;
  }

  it("300 sequenze con seme dichiarato: somma, griglia, supporto e riga modale reggono dopo ogni sequenza", () => {
    const random = mulberry32(20261010);
    const original = new Map(roster().map((f) => [f.id, f]));
    let touched = 0;
    for (let run = 0; run < 300; run += 1) {
      const input = deepFreeze(roster());
      const list = randomAdjustments(random);
      const out = applyAdjustments(input, list);
      const named = new Set(list.map((a) => a.playerId));
      out.forEach((f, i) => {
        if (!named.has(f.id)) {
          expect(f).toBe(input[i]);
          return;
        }
        touched += 1;
        expectInvariants(f);
        const was = original.get(f.id) as PlayerForecast;
        if (was.distribution !== undefined) {
          expect(dist(f).baseVote.map((m) => m.vote)).toEqual(dist(was).baseVote.map((m) => m.vote));
          // pStarter + pSub non esce dalla probabilità di giocare (nelle fixture valeva già).
          expect(dist(f).pStarter + dist(f).pSub).toBeLessThanOrEqual(dist(f).pPlays + 1e-12);
        }
      });
    }
    expect(touched).toBeGreaterThan(300);
  });
});

// ═══ scaleEvent: LA LEGGE `hazard` ══════════════════════════════════════════

/**
 * COPIA LETTERALE del conto che chi ritocca fa oggi per scalare una probabilità
 * con una forza relativa (il tasso dell'evento, non la probabilità). Sta qui,
 * scritta a mano e ricopiata operazione per operazione, perché la prova è
 * proprio che la porta faccia LO STESSO conto, all'ultimo bit.
 */
const legacyScale = (p: number, factor: number): number => Math.min(1, Math.max(0, 1 - Math.pow(1 - p, factor)));

describe("scaleEvent — la legge `hazard` scala il tasso, e il default `linear` non cambia niente", () => {
  const P_GRID = [0, 1e-12, 0.001, 0.01, 0.1, 0.2, 0.3, 0.45, 0.5, 0.6, 0.77, 0.9, 0.999, 1];
  const F_GRID = [0, 0.6, 0.8, 0.95, 1, 1.05, 1.15, 1.3, 1.6, 2.5, 10, 1000];

  const withGoal = (p: number): PlayerForecast =>
    make({
      id: "H",
      role: "C",
      baseVote: [{ vote: 6, probability: 1 }],
      events: { pGoal: p },
      expected: p > 0.5 ? { fantasyScore: 9, receivedAnyBonus: true } : {},
    });

  it("[M19] `hazard` è uguale bit a bit alla copia letterale della formula, su una griglia di p e di factor", () => {
    let compared = 0;
    for (const p of P_GRID) {
      for (const factor of F_GRID) {
        const out = one(withGoal(p), { kind: "scaleEvent", playerId: "H", event: "pGoal", factor, law: "hazard" });
        expect(dist(out).events.pGoal, `p=${p} factor=${factor}`).toBe(legacyScale(p, factor));
        expectInvariants(out);
        compared += 1;
      }
    }
    expect(compared).toBe(P_GRID.length * F_GRID.length);
  });

  it("vale per ognuno dei sette eventi, non solo per pGoal", () => {
    for (const event of SCALABLE_EVENTS) {
      const before = centro();
      const out = one(before, { kind: "scaleEvent", playerId: "CENTRO", event, factor: 1.37, law: "hazard" });
      const was = (dist(before).events as unknown as Record<string, number>)[event] as number;
      expect((dist(out).events as unknown as Record<string, number>)[event]).toBe(legacyScale(was, 1.37));
    }
  });

  it("[M19] `hazard` e `linear` sono due leggi: 0,3 con factor 2 dà 0,51 contro 0,6", () => {
    const hazard = one(withGoal(0.3), { kind: "scaleEvent", playerId: "H", event: "pGoal", factor: 2, law: "hazard" });
    const linear = one(withGoal(0.3), { kind: "scaleEvent", playerId: "H", event: "pGoal", factor: 2, law: "linear" });
    // 1 − 0,7² = 0,51 (conto a mano); lineare 0,3 × 2 = 0,6.
    expect(dist(hazard).events.pGoal).toBeCloseTo(0.51, 12);
    expect(dist(linear).events.pGoal).toBeCloseTo(0.6, 12);
  });

  it("[M19] la riga modale segue la legge: 0,3 con factor 1,8 supera 0,5 in lineare (0,54) e non in hazard (≈ 0,474)", () => {
    const linear = one(withGoal(0.3), { kind: "scaleEvent", playerId: "H", event: "pGoal", factor: 1.8 });
    const hazard = one(withGoal(0.3), { kind: "scaleEvent", playerId: "H", event: "pGoal", factor: 1.8, law: "hazard" });
    expect(dist(linear).events.pGoal).toBeCloseTo(0.54, 12);
    expect(linear.expected.fantasyScore).toBe(9);
    // 1 − 0,7^1,8 = 0,4738…: sotto la soglia, la riga non si muove.
    expect(dist(hazard).events.pGoal).toBeGreaterThan(0.47);
    expect(dist(hazard).events.pGoal).toBeLessThan(0.5);
    expect(hazard.expected.fantasyScore).toBe(6);
  });

  it("`hazard` resta una probabilità senza un tetto da raggiungere: factor 0 azzera, factor enorme non supera 1, è monotona", () => {
    const at = (factor: number): number =>
      dist(one(withGoal(0.2), { kind: "scaleEvent", playerId: "H", event: "pGoal", factor, law: "hazard" })).events.pGoal;
    expect(at(0)).toBe(0);
    expect(at(1e9)).toBeLessThanOrEqual(1);
    expect(at(0.5)).toBeLessThan(at(1));
    expect(at(1)).toBeLessThan(at(2));
    expect(at(2)).toBeLessThan(at(10));
    expect(at(1)).toBeCloseTo(0.2, 15);
  });

  it("senza `law` e con `law: \"linear\"` il conto è lo stesso di sempre", () => {
    expect(SCALE_LAWS).toEqual(["linear", "hazard"]);
    for (const factor of [0, 0.5, 1, 1.2, 10]) {
      const omitted = one(centro(), { kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor });
      const linear = one(centro(), { kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor, law: "linear" });
      expect(JSON.stringify(linear)).toBe(JSON.stringify(omitted));
      expect(dist(omitted).events.pGoal).toBe(Math.min(1, 0.45 * factor));
    }
  });

  it("[M26] una legge sconosciuta si rifiuta", () => {
    for (const law of ["exponential", "", 1, null]) {
      expectRejection(
        () =>
          applyAdjustments(
            [centro()],
            [{ kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 2, law } as unknown as Adjustment],
          ),
        "malformed_adjustment",
        0,
      );
    }
  });

  it("i limiti di factor sono quelli di sempre, anche con `hazard`", () => {
    for (const factor of [-0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectRejection(
        () => applyAdjustments([centro()], [{ kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor, law: "hazard" }]),
        "out_of_bounds",
        0,
      );
    }
  });
});

// ═══ setEvent ════════════════════════════════════════════════════════════════

describe("setEvent — fissa la probabilità di un evento a un valore", () => {
  it("imposta il valore dell'evento nominato e nessun altro; il resto della previsione non si muove", () => {
    for (const event of SCALABLE_EVENTS) {
      const before = centro();
      const out = one(before, { kind: "setEvent", playerId: "CENTRO", event, value: 0.37 });
      const b = dist(before).events as unknown as Record<string, number>;
      const a = dist(out).events as unknown as Record<string, number>;
      expect(a[event]).toBe(0.37);
      for (const other of SCALABLE_EVENTS.filter((e) => e !== event)) expect(a[other]).toBe(b[other]);
      expect(dist(out).baseVote).toEqual(dist(before).baseVote);
      expect(dist(out).svKind).toEqual(dist(before).svKind);
      expectInvariants(out);
    }
  });

  it("la riga modale segue il valore, in su e in giù, come per le altre tariffe di §12", () => {
    const up = one(centro(), { kind: "setEvent", playerId: "CENTRO", event: "pGoal", value: 0.7 });
    expect(up.expected).toEqual({ baseVote: 6, fantasyScore: 9, receivedAnyBonus: true, missedPenalty: false });
    const down = one(up, { kind: "setEvent", playerId: "CENTRO", event: "pGoal", value: 0.2 });
    expect(down.expected).toEqual(centro().expected);
    const missed = one(centro(), { kind: "setEvent", playerId: "CENTRO", event: "pPenMissed", value: 1 });
    expect(missed.expected).toEqual({ baseVote: 6, fantasyScore: 3, receivedAnyBonus: false, missedPenalty: true });
  });

  it("zero e uno sono valori validi, e sono ESATTAMENTE quelli scritti", () => {
    expect(dist(one(centro(), { kind: "setEvent", playerId: "CENTRO", event: "pAssist", value: 0 })).events.pAssist).toBe(0);
    expect(dist(one(centro(), { kind: "setEvent", playerId: "CENTRO", event: "pAssist", value: 1 })).events.pAssist).toBe(1);
  });

  it("[M28] fissare un evento al valore che ha già lascia la stessa array", () => {
    const input = [centro()];
    expect(applyAdjustments(input, [{ kind: "setEvent", playerId: "CENTRO", event: "pGoal", value: 0.45 }])).toBe(input);
  });

  it("[M21] fuori dai limiti: sotto 0, sopra 1, non finito", () => {
    for (const value of [-0.0001, 1.0001, 2, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expectRejection(
        () => applyAdjustments([centro()], [{ kind: "setEvent", playerId: "CENTRO", event: "pGoal", value }]),
        "out_of_bounds",
        0,
      );
    }
  });

  it("un evento che non c'è, un valore che non è un numero, i gol subiti come evento: ritocco illeggibile", () => {
    const broken: unknown[] = [
      { kind: "setEvent", playerId: "CENTRO", event: "pFoo", value: 0.5 },
      { kind: "setEvent", playerId: "CENTRO", event: "goalsConceded", value: 0.5 },
      { kind: "setEvent", playerId: "CENTRO", value: 0.5 },
      { kind: "setEvent", playerId: "CENTRO", event: "pGoal", value: "0.5" },
      { kind: "setEvent", playerId: "CENTRO", event: "pGoal" },
    ];
    for (const adjustment of broken) {
      expectRejection(() => applyAdjustments([centro()], [adjustment as Adjustment]), "malformed_adjustment", 0);
    }
  });

  it("[M14] una previsione senza distribuzione non si ignora in silenzio", () => {
    expectRejection(
      () => applyAdjustments([soloRiga()], [{ kind: "setEvent", playerId: "SOLO_RIGA", event: "pGoal", value: 0.4 }]),
      "no_distribution",
      0,
    );
  });
});

// ═══ LA NOTA ═════════════════════════════════════════════════════════════════

describe("la nota — si accoda a sourceQuality, nell'ordine dei ritocchi, e basta", () => {
  it("[M20] [M22] `${sourceQuality}; ${note}`: la nota porta la propria etichetta, la porta mette solo il separatore", () => {
    const out = one(centro(), {
      kind: "scaleEvent",
      playerId: "CENTRO",
      event: "pGoal",
      factor: 1.2,
      note: "avversario: SQUADRA_X (difesa 1.10)",
    });
    expect(dist(out).sourceQuality).toBe(`${QUALITY}; avversario: SQUADRA_X (difesa 1.10)`);
  });

  it("[M23] `asOf` e tutto il resto restano: cambia la sola targa", () => {
    for (const adjustment of [
      { kind: "tiltBaseVote", playerId: "CENTRO", deltaMean: 0.1, note: "n" },
      { kind: "scaleEvent", playerId: "CENTRO", event: "pAssist", factor: 0.5, note: "n" },
      { kind: "setEvent", playerId: "CENTRO", event: "pAssist", value: 0.3, note: "n" },
      { kind: "setPPlays", playerId: "CENTRO", pPlays: 0.5, note: "n" },
    ] as const) {
      const withNote = one(centro(), adjustment);
      const { note: _note, ...bare } = adjustment;
      void _note;
      const without = one(centro(), bare);
      expect(dist(withNote).asOf).toBe(ASOF);
      expect(dist(withNote).sourceQuality).toBe(`${QUALITY}; n`);
      expect(dist(without).sourceQuality).toBe(QUALITY);
      // Tolta la targa, le due uscite sono la stessa.
      expect({ ...withNote, distribution: { ...dist(withNote), sourceQuality: QUALITY } }).toEqual(without);
    }
    const keeper = one(porta(), { kind: "shiftGoalsConceded", playerId: "PORTA", factor: 2, note: "n" });
    expect(dist(keeper).asOf).toBe(ASOF);
    expect(dist(keeper).sourceQuality).toBe(`${QUALITY}; n`);
  });

  it("[M4] le note si accodano nell'ordine dei ritocchi: l'ordine invertito dà la targa invertita", () => {
    const a: Adjustment = { kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 0.5, note: "prima" };
    const b: Adjustment = { kind: "setPPlays", playerId: "CENTRO", pPlays: 0.5, note: "seconda" };
    const c: Adjustment = { kind: "setEvent", playerId: "CENTRO", event: "pAssist", value: 0.3 };
    expect(dist(one(centro(), a, b, c)).sourceQuality).toBe(`${QUALITY}; prima; seconda`);
    expect(dist(one(centro(), b, a, c)).sourceQuality).toBe(`${QUALITY}; seconda; prima`);
    expect(dist(one(centro(), a, c, b)).sourceQuality).toBe(`${QUALITY}; prima; seconda`);
  });

  it("le note di giocatori diversi non si mescolano, e chi non ha note non cambia", () => {
    const out = applyAdjustments(roster(), [
      { kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 0.5, note: "per il centro" },
      { kind: "shiftGoalsConceded", playerId: "PORTA", factor: 2, note: "per la porta" },
      { kind: "setEvent", playerId: "FASCIA", event: "pAssist", value: 0.3 },
    ]);
    expect(dist(out[0] as PlayerForecast).sourceQuality).toBe(`${QUALITY}; per il centro`);
    expect(dist(out[1] as PlayerForecast).sourceQuality).toBe(`${QUALITY}; per la porta`);
    expect(dist(out[2] as PlayerForecast).sourceQuality).toBe(QUALITY);
  });

  it("[M27] una nota è un cambiamento: un ritocco che non cambia nessun numero, con una nota, la accoda lo stesso", () => {
    const input = [centro()];
    const out = applyAdjustments(input, [
      { kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 1, note: "sempre in targa" },
    ]);
    expect(out).not.toBe(input);
    expect(dist(out[0] as PlayerForecast).sourceQuality).toBe(`${QUALITY}; sempre in targa`);
    expect(dist(out[0] as PlayerForecast).events).toEqual(dist(centro()).events);
    // E senza nota, lo stesso ritocco è un'identità.
    expect(applyAdjustments(input, [{ kind: "scaleEvent", playerId: "CENTRO", event: "pGoal", factor: 1 }])).toBe(input);
  });

  it("[M24] una nota deve essere una stringa non vuota", () => {
    for (const note of ["", 1, null, false, {}]) {
      expectRejection(
        () =>
          applyAdjustments(
            [centro()],
            [{ kind: "setPPlays", playerId: "CENTRO", pPlays: 0.5, note } as unknown as Adjustment],
          ),
        "malformed_adjustment",
        0,
      );
    }
  });

  it("[M25] una nota su una previsione senza distribuzione non ha dove scriversi, e si rifiuta", () => {
    expectRejection(
      () => applyAdjustments([soloRiga()], [{ kind: "setPPlays", playerId: "SOLO_RIGA", pPlays: 0.5, note: "n" }]),
      "no_distribution",
      0,
    );
  });
});

// ═══ IL PERCORSO VECCHIO, RIFATTO CON LA PORTA ══════════════════════════════

describe("la porta riproduce bit a bit i due ritocchi già in uso (copie letterali dei loro conti), targa compresa", () => {
  const MODAL_FANTASY_GOAL = 3;
  const MODAL_FANTASY_ASSIST = 1;
  const MODAL_FANTASY_CONCEDED = -1;

  const modaDi = (masse: readonly number[]): number => {
    let migliore = 0;
    masse.forEach((m, i) => {
      if (m > (masse[migliore] ?? 0)) migliore = i;
    });
    return migliore;
  };

  /** Copia letterale: forza relativa dell'avversario su gol e assist, o sui gol subiti del portiere. */
  function legacyForza(f: PlayerForecast, difesa: number, attacco: number, avversario: string): PlayerForecast {
    const d = f.distribution as PlayerDistribution;
    const e = d.events;
    let pGoal = e.pGoal;
    let pAssist = e.pAssist;
    let goalsConceded = e.goalsConceded;
    if (goalsConceded !== undefined) {
      const inclinate = goalsConceded.map((m, k) => m * Math.pow(attacco, k));
      const somma = inclinate.reduce((a, b) => a + b, 0);
      if (somma > 0) goalsConceded = inclinate.map((m) => m / somma);
    } else {
      pGoal = legacyScale(pGoal, difesa);
      pAssist = legacyScale(pAssist, difesa);
    }
    let delta = 0;
    if ((pGoal > 0.5) !== (e.pGoal > 0.5)) delta += pGoal > 0.5 ? MODAL_FANTASY_GOAL : -MODAL_FANTASY_GOAL;
    if ((pAssist > 0.5) !== (e.pAssist > 0.5)) delta += pAssist > 0.5 ? MODAL_FANTASY_ASSIST : -MODAL_FANTASY_ASSIST;
    if (goalsConceded !== undefined && e.goalsConceded !== undefined) {
      delta += (modaDi(goalsConceded) - modaDi(e.goalsConceded)) * MODAL_FANTASY_CONCEDED;
    }
    const receivedAnyBonus = pGoal > 0.5 || pAssist > 0.5 || e.pPenSaved > 0.5;
    const expected =
      delta === 0 && receivedAnyBonus === f.expected.receivedAnyBonus
        ? f.expected
        : { ...f.expected, fantasyScore: f.expected.fantasyScore + delta + 0, receivedAnyBonus };
    return {
      ...f,
      expected,
      distribution: {
        ...d,
        events: { ...e, pGoal, pAssist, ...(goalsConceded === undefined ? {} : { goalsConceded }) },
        sourceQuality:
          `${d.sourceQuality}; avversario: ${avversario} ` +
          `(difesa ${difesa.toFixed(2)}, attacco ${attacco.toFixed(2)} rispetto alla media)`,
      },
    };
  }

  /** La stessa cosa, detta alla porta: la nota solo sul primo ritocco, perché la targa si scrive una volta. */
  function throughTheDoorForza(f: PlayerForecast, difesa: number, attacco: number, avversario: string): PlayerForecast {
    const note = `avversario: ${avversario} (difesa ${difesa.toFixed(2)}, attacco ${attacco.toFixed(2)} rispetto alla media)`;
    const list: Adjustment[] =
      f.role === "P"
        ? [{ kind: "shiftGoalsConceded", playerId: f.id, factor: attacco, note }]
        : [
            { kind: "scaleEvent", playerId: f.id, event: "pGoal", factor: difesa, law: "hazard", note },
            { kind: "scaleEvent", playerId: f.id, event: "pAssist", factor: difesa, law: "hazard" },
          ];
    return applyAdjustments([f], list)[0] as PlayerForecast;
  }

  it("la forza dell'avversario: gol e assist per chi corre, gol subiti per il portiere — JSON identico", () => {
    const cases: readonly [() => PlayerForecast, number, number][] = [
      [centro, 1.37, 0.9], // pGoal 0,45 → ≈ 0,559: attraversa 0,5 in su, la riga cambia
      [centro, 0.6, 1.2], //  scende, nessun attraversamento
      [centro, 1, 1], //      forza 1: il conto rifà 1 − (1 − p), la targa c'è comunque
      [fascia, 1.2, 1], //    pGoal 0 resta 0, pAssist cambia
      [concentrato, 1.6, 1], // pGoal 0,3 sale, non attraversa
      [porta, 1, 1.3], //     gol subiti inclinati, il massimo resta a 1 gol
      [porta, 1, 2], //       il massimo passa a 2 gol: la riga cambia
      [porta, 1, 0.7], //     verso meno gol
    ];
    for (const [fixture, difesa, attacco] of cases) {
      const f = fixture();
      const old = legacyForza(f, difesa, attacco, "SQUADRA_X");
      const via = throughTheDoorForza(f, difesa, attacco, "SQUADRA_X");
      expect(JSON.stringify(via), `${f.id} difesa ${difesa} attacco ${attacco}`).toBe(JSON.stringify(old));
    }
  });

  /** Copia letterale: i rigori. Qui `tira` e `realizzazione` sono dati, non derivati. */
  function legacyRigori(
    f: PlayerForecast,
    s: { rfStorico: number; rsStorico: number },
    rigorista: { tira: number; realizzazione: number } | null,
    nota: string,
  ): PlayerForecast {
    const d = f.distribution as PlayerDistribution;
    let pGoal = Math.max(0, d.events.pGoal - s.rfStorico);
    let pPenMissed = Math.max(0, d.events.pPenMissed - s.rsStorico);
    if (rigorista !== null) {
      pGoal = 1 - (1 - pGoal) * (1 - rigorista.tira * rigorista.realizzazione);
      pPenMissed = Math.min(1, pPenMissed + rigorista.tira * (1 - rigorista.realizzazione));
    }
    pGoal = Math.min(1, Math.max(0, pGoal));
    if (pGoal === d.events.pGoal && pPenMissed === d.events.pPenMissed) return f;
    const golPrima = d.events.pGoal > 0.5;
    const golDopo = pGoal > 0.5;
    const sbagliatoPrima = d.events.pPenMissed > 0.5;
    const sbagliatoDopo = pPenMissed > 0.5;
    const delta =
      (golDopo ? 3 : 0) - (golPrima ? 3 : 0) + (sbagliatoDopo ? -3 : 0) - (sbagliatoPrima ? -3 : 0);
    const expected =
      delta === 0 && golPrima === golDopo
        ? f.expected
        : {
            ...f.expected,
            fantasyScore: f.expected.fantasyScore + delta + 0,
            receivedAnyBonus:
              golDopo || (golPrima ? d.events.pAssist > 0.5 || d.events.pPenSaved > 0.5 : f.expected.receivedAnyBonus),
            missedPenalty: sbagliatoDopo,
          };
    return {
      ...f,
      expected,
      distribution: { ...d, events: { ...d.events, pGoal, pPenMissed }, sourceQuality: `${d.sourceQuality}; rigori: ${nota}` },
    };
  }

  function throughTheDoorRigori(
    f: PlayerForecast,
    s: { rfStorico: number; rsStorico: number },
    rigorista: { tira: number; realizzazione: number } | null,
    nota: string,
  ): PlayerForecast {
    const d = f.distribution as PlayerDistribution;
    let pGoal = Math.max(0, d.events.pGoal - s.rfStorico);
    let pPenMissed = Math.max(0, d.events.pPenMissed - s.rsStorico);
    if (rigorista !== null) {
      pGoal = 1 - (1 - pGoal) * (1 - rigorista.tira * rigorista.realizzazione);
      pPenMissed = Math.min(1, pPenMissed + rigorista.tira * (1 - rigorista.realizzazione));
    }
    pGoal = Math.min(1, Math.max(0, pGoal));
    if (pGoal === d.events.pGoal && pPenMissed === d.events.pPenMissed) return f;
    return applyAdjustments([f], [
      { kind: "setEvent", playerId: f.id, event: "pGoal", value: pGoal, note: `rigori: ${nota}` },
      { kind: "setEvent", playerId: f.id, event: "pPenMissed", value: pPenMissed },
    ])[0] as PlayerForecast;
  }

  it("i rigoristi: il valore finale lo compone chi chiama, la porta lo fissa — JSON identico", () => {
    const sicuro = make({
      id: "RIGORISTA",
      role: "A",
      baseVote: [{ vote: 6, probability: 1 }],
      events: { pGoal: 0.6, pAssist: 0.1, pPenMissed: 0.02 },
      expected: { fantasyScore: 9, receivedAnyBonus: true },
    });
    const cases: readonly [PlayerForecast, { rfStorico: number; rsStorico: number }, { tira: number; realizzazione: number } | null][] = [
      [centro(), { rfStorico: 0.02, rsStorico: 0.005 }, { tira: 0.3, realizzazione: 0.8 }], // sale oltre 0,5
      [centro(), { rfStorico: 0.1, rsStorico: 0 }, null], //                                  non è lui: tolto lo storico
      [sicuro, { rfStorico: 0.2, rsStorico: 0 }, null], //                                    pGoal 0,6 → 0,4: la riga scende
      [sicuro, { rfStorico: 0, rsStorico: 0 }, { tira: 0.9, realizzazione: 0.1 }], //         molti rigori sbagliati
      [fascia(), { rfStorico: 0, rsStorico: 0 }, { tira: 0.2, realizzazione: 0.75 }], //      da zero
      [centro(), { rfStorico: 0, rsStorico: 0 }, null], //                                    niente da cambiare: la previsione resta la stessa
    ];
    for (const [f, storico, rigorista] of cases) {
      const nota = rigorista === null ? "non è il rigorista attuale del club" : "rigorista del club";
      const old = legacyRigori(f, storico, rigorista, nota);
      const via = throughTheDoorRigori(f, storico, rigorista, nota);
      expect(JSON.stringify(via), `${f.id} ${JSON.stringify(storico)} ${JSON.stringify(rigorista)}`).toBe(JSON.stringify(old));
    }
  });
});

// ═══ LE INVARIANTI CON TUTTI E CINQUE I RITOCCHI, LE LEGGI E LE NOTE ═════════

describe("la porta dei ritocchi — le invarianti reggono su sequenze casuali con setEvent, hazard e note", () => {
  function randomAdjustments(random: () => number): Adjustment[] {
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    const list: Adjustment[] = [];
    const length = 1 + Math.floor(random() * 7);
    for (let n = 0; n < length; n += 1) {
      const kind = pick(["tiltBaseVote", "scaleEvent", "setEvent", "setPPlays", "shiftGoalsConceded"] as const);
      const playerId = pick(["CENTRO", "PORTA", "FASCIA", "CONCENTRATO", "UFFICIO"]);
      const note = random() < 0.4 ? { note: `nota ${n}` } : {};
      if (kind === "tiltBaseVote") {
        list.push({ kind, playerId: pick(["CENTRO", "PORTA", "FASCIA"]), deltaMean: (random() - 0.5) * 0.1, ...note });
      } else if (kind === "scaleEvent") {
        list.push({
          kind,
          playerId,
          event: pick(SCALABLE_EVENTS),
          factor: pick([0, 0.3, 0.8, 1, 1.5, 4, 12]),
          law: pick(["linear", "hazard"] as const),
          ...note,
        });
      } else if (kind === "setEvent") {
        list.push({ kind, playerId, event: pick(SCALABLE_EVENTS), value: pick([0, 0.2, 0.5, 0.7, 1]), ...note });
      } else if (kind === "setPPlays") {
        list.push({ kind, playerId, pPlays: pick([0, 0.25, 0.5, 0.9, 1]), ...note });
      } else {
        list.push({ kind, playerId: "PORTA", factor: pick([0.2, 0.5, 1, 2, 5]), ...note });
      }
    }
    return list;
  }

  it("300 sequenze con seme dichiarato: le invarianti reggono, e la targa è esattamente la somma delle note, nell'ordine", () => {
    const random = mulberry32(20261011);
    let withNotes = 0;
    for (let run = 0; run < 300; run += 1) {
      const input = deepFreeze(roster());
      const list = randomAdjustments(random);
      const out = applyAdjustments(input, list);
      const named = new Set(list.map((a) => a.playerId));
      out.forEach((f, i) => {
        if (!named.has(f.id)) {
          expect(f).toBe(input[i]);
          return;
        }
        expectInvariants(f);
        const notes = list.filter((a) => a.playerId === f.id && a.note !== undefined).map((a) => `; ${a.note}`);
        withNotes += notes.length;
        expect(dist(f).sourceQuality).toBe(QUALITY + notes.join(""));
        expect(dist(f).asOf).toBe(ASOF);
        expect(dist(f).baseVote.map((m) => m.vote)).toEqual(dist(input[i] as PlayerForecast).baseVote.map((m) => m.vote));
      });
    }
    expect(withNotes).toBeGreaterThan(200);
  });
});

// ═══ LA RIGA MODALE È QUELLA DEI PRODUTTORI ═════════════════════════════════

describe("la riga modale della porta è la stessa dei due produttori (la duplicazione dichiarata ha la sua prova)", () => {
  const S0 = "STAGIONE_0";
  const noEvents: AppearanceEvents = {
    goal: false,
    assist: false,
    yellow: false,
    red: false,
    ownGoal: false,
    penaltyMissed: false,
    penaltySaved: false,
  };
  const voted = (playerId: string, role: Role, gameweek: number, baseVote: number, events: Partial<AppearanceEvents> = {}): PlayerAppearance => ({
    playerId,
    role,
    season: S0,
    gameweek,
    voted: true,
    baseVote,
    started: true,
    events: { ...noEvents, ...events },
  });
  const missed = (playerId: string, role: Role, gameweek: number): PlayerAppearance => ({
    playerId,
    role,
    season: S0,
    gameweek,
    voted: false,
    noVoteKind: "clean",
  });
  const gameweeks = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

  // Un bomber che segna ogni volta che gioca (la riga modale ha il gol), un
  // portiere la cui squadra ne subisce 1 o 2 a giornate alterne (parità fra due
  // gol subiti), un centrocampista con tre voti diversi, un difensore con due
  // voti a parità esatta (6 e 6,5). Le parità servono: è lì che la regola «a
  // parità, il più basso» dei produttori e quella della porta possono divergere
  // senza che nessuna altra riga se ne accorga. Ogni
  // ruolo ha almeno un senza voto: il produttore base si ferma, invece di
  // inventarlo, davanti a un ruolo che non ne ha mai visto uno.
  const appearances: PlayerAppearance[] = [
    ...gameweeks(20).map((gw) => voted("BOMBER", "A", gw, 7, { goal: true })),
    ...gameweeks(10).map((gw) => voted("ATT_ALTRO", "A", gw, 6)),
    ...[11, 12].map((gw) => missed("ATT_ALTRO", "A", gw)),
    ...gameweeks(20).map((gw) => voted("PORTIERE", "P", gw, 6)),
    ...[21, 22].map((gw) => missed("PORTIERE", "P", gw)),
    ...gameweeks(12).map((gw) => voted("MEDIO", "C", gw, [6, 6.5, 7][gw % 3] as number)),
    ...[13, 14].map((gw) => missed("MEDIO", "C", gw)),
    // PARI: dieci voti a 6 e dieci a 6,5, ruolo tutto suo: la distribuzione del base è esattamente 0,5 / 0,5.
    ...gameweeks(20).map((gw) => voted("PARI", "D", gw, gw % 2 === 0 ? 6.5 : 6)),
    ...[21, 22].map((gw) => missed("PARI", "D", gw)),
  ];
  // La squadra subisce 1 gol a giornate alterne e 2 nelle altre: nel base i gol subiti pesano 0,5 / 0,5
  // fra 1 e 2, una parità esatta.
  const teamGameweeks: TeamGameweek[] = gameweeks(20).map((gw) => ({
    teamId: "SQUADRA_1",
    season: S0,
    gameweek: gw,
    goalsConceded: gw % 2 === 0 ? 2 : 1,
  }));
  const history = observedHistory({
    seasons: [S0],
    appearances,
    teamGameweeks,
    provenance: "fixture sintetica — tabellini inventati per la prova",
  });
  const players = [
    { playerId: "BOMBER", role: "A" as Role, teamId: "SQUADRA_1" },
    { playerId: "PORTIERE", role: "P" as Role, teamId: "SQUADRA_1" },
    { playerId: "MEDIO", role: "C" as Role, teamId: "SQUADRA_1" },
    { playerId: "PARI", role: "D" as Role, teamId: "SQUADRA_1" },
  ];

  for (const [name, produce, tied] of [
    ["il produttore base", () => buildBaseForecasts({ history, players, asOf: ASOF }).map((r) => r.forecast), true],
    ["il produttore sfidante", () => buildChallengerForecasts({ history, players, asOf: ASOF }).map((r) => r.forecast), false],
  ] as const) {
    it(`${name}: `+"`modalRowOfDistribution` rifà esattamente la sua riga modale", () => {
      const forecasts = produce();
      expect(forecasts).toHaveLength(4);
      for (const f of forecasts) {
        expect(modalRowOfDistribution(dist(f))).toEqual(f.expected);
      }
      // Non vacua: la riga del bomber ha il gol e quella del portiere gol subiti.
      const bomber = forecasts.find((f) => f.id === "BOMBER") as PlayerForecast;
      const keeper = forecasts.find((f) => f.id === "PORTIERE") as PlayerForecast;
      expect(bomber.expected.receivedAnyBonus).toBe(true);
      expect(bomber.expected.fantasyScore).toBeGreaterThan(bomber.expected.baseVote);
      expect(keeper.expected.fantasyScore).toBeLessThan(keeper.expected.baseVote);
      if (tied) {
        // [M18] Le due parità esistono davvero (masse uguali al bit), e i produttori le sciolgono come la porta:
        // il voto più basso, i gol subiti più bassi.
        const pari = forecasts.find((f) => f.id === "PARI") as PlayerForecast;
        const mass = (vote: number): number => (dist(pari).baseVote.find((m) => m.vote === vote) as BaseVoteMass).probability;
        expect(mass(6)).toBe(mass(6.5));
        expect(pari.expected.baseVote).toBe(6);
        const conceded = dist(keeper).events.goalsConceded as readonly number[];
        expect(conceded[1]).toBe(conceded[2]);
        expect(keeper.expected.fantasyScore).toBe(keeper.expected.baseVote - 1);
      }
    });

    it(`${name}: un ritocco sulla sua uscita passa dalla porta e rispetta il contratto`, () => {
      const forecasts = produce();
      const out = applyAdjustments(forecasts, [
        { kind: "tiltBaseVote", playerId: "MEDIO", deltaMean: 0.1 },
        { kind: "scaleEvent", playerId: "BOMBER", event: "pGoal", factor: 0.3 },
        { kind: "shiftGoalsConceded", playerId: "PORTIERE", factor: 0.5 },
        { kind: "setPPlays", playerId: "PARI", pPlays: 0.8 },
      ]);
      expect(() => assertForecasts(out, "rosa")).not.toThrow();
      out.forEach(expectInvariants);
    });
  }
});

describe("modalRowOfDistribution — la regola della parità, la soglia degli eventi, i casi limite", () => {
  it("[M18] a parità di massa vince il voto più basso e il numero di gol subiti più basso", () => {
    const tie = make({
      id: "PARITA",
      role: "P",
      baseVote: [
        { vote: 6, probability: 0.5 },
        { vote: 6.5, probability: 0.5 },
      ],
      goalsConceded: [0.25, 0.25, 0.25, 0.25],
    });
    expect(modalRowOfDistribution(dist(tie))).toEqual({
      baseVote: 6,
      fantasyScore: 6,
      receivedAnyBonus: false,
      missedPenalty: false,
    });
  });

  it("[M17] un evento accade nella riga modale solo se la probabilità SUPERA 0,5: 0,5 esatto no, per ognuno dei sette", () => {
    // Per ogni evento: cosa vale la riga con la probabilità a 0,5 (nulla accade) e un ulp sopra (accade).
    const effect: Record<ScalableEvent, number> = {
      pGoal: 3,
      pAssist: 1,
      pYellow: -0.5,
      pRed: -1,
      pOwnGoal: -2,
      pPenMissed: -3,
      pPenSaved: 3,
    };
    for (const event of SCALABLE_EVENTS) {
      const row = (p: number): PlayerForecast["expected"] =>
        modalRowOfDistribution(dist(make({ id: "S", role: "A", baseVote: [{ vote: 6, probability: 1 }], events: { [event]: p } })));
      expect(row(0.5).fantasyScore, `${event} a 0,5`).toBe(6);
      expect(row(0.5000000000000001).fantasyScore, `${event} appena sopra`).toBe(6 + effect[event]);
    }
  });

  it("una distribuzione senza voti non ha una riga modale", () => {
    const empty = { ...dist(centro()), baseVote: [] as BaseVoteMass[] };
    expectRejection(() => modalRowOfDistribution(empty), "invalid_input");
  });
});

// ═══ ISOLAMENTO E PUREZZA DEL MODULO ════════════════════════════════════════

describe("il modulo della porta importa solo da playerScenario a runtime, ed è puro", () => {
  const FILE = new URL("../src/adjustments.ts", import.meta.url);
  const source = readFileSync(FILE, "utf8");
  const parsed = ts.createSourceFile("adjustments.ts", source, ts.ScriptTarget.ES2022, true);

  const runtime: string[] = [];
  const typeOnly: string[] = [];
  parsed.forEachChild((node) => {
    if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
      (node.isTypeOnly ? typeOnly : runtime).push(node.moduleSpecifier.text);
      return;
    }
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
    const clause = node.importClause;
    const named = clause?.namedBindings;
    // Un import sparisce a runtime se è `import type …`, oppure se ogni nome importato è `type`.
    const erased =
      clause !== undefined &&
      (clause.isTypeOnly ||
        (clause.name === undefined &&
          named !== undefined &&
          ts.isNamedImports(named) &&
          named.elements.length > 0 &&
          named.elements.every((element) => element.isTypeOnly)));
    (erased ? typeOnly : runtime).push(node.moduleSpecifier.text);
  });

  it("a runtime importa un solo modulo, `playerScenario`", () => {
    expect(runtime).toEqual(["./playerScenario.js"]);
  });

  it("gli altri import sono tipi, e vengono solo dal contratto della previsione", () => {
    expect(typeOnly).toEqual(["./lineupProposer.js"]);
  });

  it("non legge l'orologio, non tira dadi, non parla con nessuno", () => {
    for (const forbidden of [
      "new Date",
      "Date.now(",
      "Math.random",
      "performance.now",
      "process.",
      "fetch(",
      "XMLHttpRequest",
      "node:",
      "require(",
    ]) {
      expect(source.includes(forbidden), forbidden).toBe(false);
    }
  });

  it("l'unione dei ritocchi è chiusa a cinque tipi", () => {
    const kinds = [...source.matchAll(/readonly kind: "([A-Za-z]+)";/g)].map((m) => m[1]);
    expect(kinds).toEqual(["tiltBaseVote", "scaleEvent", "setEvent", "setPPlays", "shiftGoalsConceded"]);
  });
});

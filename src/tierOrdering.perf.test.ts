// PERF — gli aggregati del libro delle fasce, il giro che `render()` in
// src/main.ts rifà a OGNI TASTO della ricerca giocatore (`app.innerHTML = ""`
// e ricostruzione dell'intero DOM).
//
// Stesso stampo di packages/engine/tests/opportunityRadar.perf.test.ts, e per
// le stesse due ragioni:
//
//  1. UN TETTO LARGO, NON UN CRONOMETRO. Serve a far diventare rosso un
//     ritorno al comportamento precedente, non a misurare la macchina. Un test
//     di performance che lampeggia in CI viene disattivato da qualcuno, ed è
//     peggio di non averlo.
//  2. IL RILEVATORE VERO GUARDA LA FORMA. Il tetto assoluto qui sotto passa
//     anche senza cache (misurato: 0,84-1,67 ms contro un tetto di 2 ms) e va
//     DETTO. Il test che invece è rosso il secondo in cui la cache sparisce è
//     il secondo, che confronta due misure prese sulla stessa macchina nello
//     stesso run — un rapporto, non un valore assoluto.
//
// La correttezza della cache — che è la parte che conta più della velocità —
// sta tutta in src/tierOrdering.cache.test.ts, contatori compresi.

import { describe, it, expect, beforeEach } from "vitest";
import { resetTierBookCache, tierBandReading, tierBookCacheStats } from "./tierOrdering.js";
import { listonePlayerKey } from "./ui/listone.js";
import { PERF_POOL_ROWS, PERF_SELF, PERF_TEAMS, tierPerfScenario } from "./tierOrdering.perfScenario.js";

/**
 * Il caso peggiore realistico: 532 righe di listone, otto squadre, 224
 * acquisti — cioè il tavolo PIENO (8 x 28 slot), che è il momento in cui il
 * giro di render costa di più e in cui il repository ha misurato ~140 ms per
 * tasto sull'intera schermata.
 */
const ROWS = PERF_POOL_ROWS;
const PURCHASES = 224;

/**
 * TETTO LARGO, DI PROPOSITO, E ONESTO SU COSA PRENDE.
 *
 * Misurato su questo caso (mediana di 9 campioni dopo warm-up, su cinque run
 * di una macchina CARICA): **0,043-0,060 ms** con la cache, **0,84-1,67 ms**
 * senza. Il tetto è a 2 ms — da 33 a 46 volte la misura — perché un runner di
 * CI condiviso è lento, rumoroso e senza garanzie di CPU.
 *
 * Questo tetto NON è il rilevatore della cache persa, ed è giusto dirlo: a 2 ms
 * passa anche la versione senza cache. È un massimale grossolano, prende le
 * regressioni grosse e prende la crescita del listone. Il rilevatore preciso è
 * il test successivo.
 */
const KEYSTROKE_BUDGET_MS = 2;

/**
 * Il rapporto minimo fra il costo di un tasto (voce riusata) e il costo di una
 * ricostruzione (voce scaduta). Misurato: **19-28x** sul giro completo per
 * tasto (sul solo libro, dove i fatti non diluiscono, oltre 1000x). La soglia è
 * a 5x: quattro volte sotto la misura peggiore, e irraggiungibile senza cache,
 * dove i due rami sono lo STESSO codice e il rapporto crolla a 1 — verificato
 * mutando il modulo (misurato allora: 3,98 contro 0,77, cioè rosso).
 */
const MIN_REUSE_SPEEDUP = 5;

function median(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function scenarioInput() {
  const { pool, log, state, called } = tierPerfScenario(ROWS, PURCHASES);
  return {
    pool,
    source: "remote" as const,
    state,
    log,
    called: { playerId: listonePlayerKey(called), role: called.role },
    selfId: PERF_SELF,
  };
}

beforeEach(() => {
  resetTierBookCache();
});

describe("aggregati delle fasce — non regressione di performance", () => {
  it("lo scenario di misura è quello dichiarato, non una fixture da dieci righe", () => {
    const { pool, log, state, called } = tierPerfScenario(ROWS, PURCHASES);
    expect(pool).toHaveLength(ROWS);
    expect(log.filter((e) => e.type === "PURCHASE")).toHaveLength(PURCHASES);
    expect(Object.keys(state.teams)).toHaveLength(PERF_TEAMS.length);

    // E il caso deve avere SOSTANZA: se un domani la lettura tornasse
    // "unavailable", i due test qui sotto misurerebbero il ramo che esce
    // subito invece del libro.
    const reading = tierBandReading({
      pool,
      source: "remote",
      state,
      log,
      called: { playerId: listonePlayerKey(called), role: called.role },
      selfId: PERF_SELF,
    });
    expect(reading.kind).toBe("facts");
    if (reading.kind !== "facts") return;
    expect(reading.coverage).toEqual({ poolRows: ROWS, withVerdict: ROWS });
    expect(reading.facts.placement.kind).toBe("tier");
    expect(reading.facts.placement.tier).toBe(1);
    expect(reading.facts.occupancy).not.toBeNull();
    expect(reading.facts.opponents).toHaveLength(PERF_TEAMS.length - 1);
  });

  it(`un tasto resta sotto ${KEYSTROKE_BUDGET_MS} ms sul caso realistico più pesante`, () => {
    const input = scenarioInput();

    for (let i = 0; i < 5; i++) tierBandReading(input); // warmup JIT + prima costruzione
    const samples: number[] = [];
    for (let i = 0; i < 9; i++) {
      const t0 = performance.now();
      tierBandReading(input);
      samples.push(performance.now() - t0);
    }

    // Un tasto non cambia niente nello stato: dopo il warm-up il libro non si
    // è più ricostruito nemmeno una volta.
    expect(tierBookCacheStats().builds).toBe(1);
    expect(median(samples)).toBeLessThan(KEYSTROKE_BUDGET_MS);
  });

  it(`riusare il libro costa almeno ${MIN_REUSE_SPEEDUP} volte meno che ricostruirlo`, () => {
    // QUESTO è il rilevatore, e guarda un RAPPORTO, non l'orologio: le due
    // misure escono dalla stessa macchina nello stesso run, quindi un runner
    // lento le rallenta entrambe e il rapporto regge. Senza cache i due rami
    // sono lo stesso codice e il rapporto crolla a 1.
    const input = scenarioInput();

    // Ricostruzione: la cache viene svuotata PRIMA di far partire il
    // cronometro, mai dentro la finestra misurata.
    const missOf = (): number => {
      resetTierBookCache();
      const t0 = performance.now();
      tierBandReading(input);
      return performance.now() - t0;
    };
    for (let i = 0; i < 5; i++) missOf(); // warmup
    const miss: number[] = [];
    for (let i = 0; i < 9; i++) miss.push(missOf());

    // Riuso: cache calda, nessun cambio di stato — cioè un tasto.
    resetTierBookCache();
    for (let i = 0; i < 5; i++) tierBandReading(input);
    const hit: number[] = [];
    for (let i = 0; i < 9; i++) {
      const t0 = performance.now();
      tierBandReading(input);
      hit.push(performance.now() - t0);
    }
    expect(tierBookCacheStats().builds).toBe(1);

    expect(median(hit) * MIN_REUSE_SPEEDUP).toBeLessThan(median(miss));
  });
});

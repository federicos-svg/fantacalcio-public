// LA CACHE DELL'ESCA — e il solo modo in cui può fare danno.
//
// Il rischio di una memoizzazione non è la lentezza: è mostrare un elenco
// VECCHIO come se fosse fresco. Questo file esiste per escluderlo, ed è
// modellato riga per riga su src/tierOrdering.cache.test.ts.
//
// CONTATORI, NON CRONOMETRI. «Un tasto nella ricerca non ricalcola» si prova
// CONTANDO le costruzioni e i riusi, non guardando un orologio: un cronometro
// misura la macchina, un contatore misura la promessa.
//
// IL TEST DI TRASPARENZA. Confrontare la cache con sé stessa (svuotandola)
// proverebbe che è coerente con sé stessa, non che è trasparente. Il termine di
// paragone è `baitCandidatesUncached`, che non condivide con l'originale la
// cosa in esame — stessa idea di `buildTierBookUncached` e di
// `opportunityRadarReference.ts` nel motore.
//
// Solo fixture sintetiche: lo scenario viene da src/tierOrdering.perfScenario.ts
// (PRNG seminato, nessun dato reale), esteso con lo storico d'asta dell'esca.

import { describe, it, expect, beforeEach } from "vitest";
import {
  baitCandidates,
  baitCandidatesCacheStats,
  baitCandidatesUncached,
  exposureBook,
  exposureBookUncached,
  resetBaitCandidatesCache,
  type BaitInput,
  type BaitReading,
} from "./baitCandidates.js";
import { resetTierBookCache } from "./tierOrdering.js";
import { baitPerfScenario, PERF_SELF, PERF_TEAMS } from "./tierOrdering.perfScenario.js";
import { listonePlayerKey } from "./ui/listone.js";
import { reduce } from "../packages/engine/src/reduce.js";
import type { AuctionEvent } from "../packages/engine/src/types.js";

const TS = "2026-08-01T12:00:00Z";
const SCENARIO = baitPerfScenario();

/** Un ingresso costruito COME LO COSTRUISCE `render()`: stato derivato fresco,
 *  listone e storico per identità, tutto il resto invariato. */
function inputAt(log: readonly AuctionEvent[]): BaitInput {
  return {
    pool: SCENARIO.pool,
    source: "remote",
    book: exposureBook(SCENARIO.history),
    seats: SCENARIO.seats,
    state: reduce(log, PERF_TEAMS),
    selfId: PERF_SELF,
    logLength: log.length,
  };
}

/** Il gemello NON memoizzato: stesso ingresso, `exposureBookUncached` compreso. */
function readingWithoutCache(log: readonly AuctionEvent[]): BaitReading {
  return baitCandidatesUncached({
    ...inputAt(log),
    book: exposureBookUncached(SCENARIO.history),
  });
}

beforeEach(() => {
  resetBaitCandidatesCache();
  resetTierBookCache();
});

// ─── E11 — il giro che render() rifà a ogni tasto ────────────────────────────

describe("E11 — venti tasti consecutivi", () => {
  it("532 righe, ~1.100 righe di storico: builds === 1, hits === 19", () => {
    const log = SCENARIO.log;
    for (let i = 0; i < 20; i += 1) {
      // `state.call.playerName` NON è nella firma: fra un tasto e l'altro
      // cambia solo lui, quindi la voce conservata resta valida. Lo stato
      // derivato è un OGGETTO NUOVO a ogni giro, come in `render()`.
      baitCandidates(inputAt(log));
    }
    const stats = baitCandidatesCacheStats();
    expect(stats.builds).toBe(1);
    expect(stats.hits).toBe(19);
    // E il libro dello storico si costruisce una volta sola con lui.
    expect(stats.bookBuilds).toBe(1);
    expect(stats.bookHits).toBe(19);
  });

  it("lo scenario ha davvero la scala dichiarata, altrimenti non prova niente", () => {
    expect(SCENARIO.pool.length).toBe(532);
    expect(SCENARIO.history.length).toBeGreaterThanOrEqual(1000);
    expect(SCENARIO.history.length).toBeLessThanOrEqual(1200);
    const r = baitCandidates(inputAt(SCENARIO.log));
    // E produce candidati veri: una cache misurata sul ramo vuoto non misura
    // il lavoro che si vuole togliere.
    expect(r.kind).toBe("candidates");
    if (r.kind === "candidates") expect(r.evaluated).toBeGreaterThan(0);
  });
});

describe("ciò che INVALIDA, e deve invalidare", () => {
  it("un acquisto rifà il calcolo: il numero a schermo cambia dopo un acquisto", () => {
    const log = SCENARIO.log;
    baitCandidates(inputAt(log));
    expect(baitCandidatesCacheStats().builds).toBe(1);

    const free = SCENARIO.pool.find(
      (p) => !log.some((e) => e.type === "PURCHASE" && e.playerId === listonePlayerKey(p)),
    )!;
    const next: readonly AuctionEvent[] = [
      ...log,
      {
        type: "PURCHASE",
        seq: log.length,
        ts: TS,
        playerId: listonePlayerKey(free),
        role: free.role,
        fantaTeamId: PERF_TEAMS[1]!,
        price: 3,
      },
    ];
    baitCandidates(inputAt(next));
    expect(baitCandidatesCacheStats().builds).toBe(2);
  });

  it("uno storico sostituito rifà il libro, e con lui l'elenco", () => {
    baitCandidates(inputAt(SCENARIO.log));
    const other = SCENARIO.history.slice(0, 100);
    baitCandidates({ ...inputAt(SCENARIO.log), book: exposureBook(other) });
    expect(baitCandidatesCacheStats().builds).toBe(2);
    expect(baitCandidatesCacheStats().bookBuilds).toBe(2);
  });

  it("un listone sostituito rifà il calcolo (la chiave è l'identità del pool)", () => {
    baitCandidates(inputAt(SCENARIO.log));
    const copy = [...SCENARIO.pool];
    baitCandidates({ ...inputAt(SCENARIO.log), pool: copy });
    expect(baitCandidatesCacheStats().builds).toBe(2);
  });
});

// ─── E12 — trasparenza, passo per passo ──────────────────────────────────────

describe("E12 — la stessa sequenza contro la variante non memoizzata", () => {
  it("uscita IDENTICA passo per passo: candidati, ordine e campi compresi", () => {
    let log: readonly AuctionEvent[] = SCENARIO.log;
    const sold = new Set(
      log.flatMap((e) => (e.type === "PURCHASE" ? [e.playerId] : [])),
    );
    const free = SCENARIO.pool.filter((p) => !sold.has(listonePlayerKey(p)));

    // Una sequenza MISTA: tasti (stesso log), acquisti, un annullamento.
    // A ogni passo le due vie devono dire esattamente la stessa cosa.
    let step = 0;
    const check = (where: string): void => {
      const cached = baitCandidates(inputAt(log));
      const plain = readingWithoutCache(log);
      expect(cached, `${where} (passo ${step})`).toEqual(plain);
      step += 1;
    };

    for (let i = 0; i < 5; i += 1) check("tasto");

    for (let i = 0; i < 4; i += 1) {
      const row = free[i]!;
      log = [
        ...log,
        {
          type: "PURCHASE",
          seq: log.length,
          ts: TS,
          playerId: listonePlayerKey(row),
          role: row.role,
          fantaTeamId: PERF_TEAMS[(i % 7) + 1]!,
          price: 5 + i,
        },
      ];
      check("dopo un acquisto");
      check("tasto dopo l'acquisto");
    }

    log = [...log, { type: "VOID", seq: log.length, ts: TS, targetSeq: log.length - 1 }];
    check("dopo un annullamento");
    check("tasto dopo l'annullamento");

    // La sequenza è stata davvero percorsa: senza questo, zero passi
    // passerebbero per vuoto.
    expect(step).toBe(15);
  });

  it("anche il libro dell'esposizione è trasparente", () => {
    const cached = exposureBook(SCENARIO.history);
    const plain = exposureBookUncached(SCENARIO.history);
    expect(cached.rows).toBe(plain.rows);
    expect(cached.seasons).toEqual(plain.seasons);
    expect([...cached.hotClubs].sort()).toEqual([...plain.hotClubs].sort());
    expect([...cached.historyPlayers].sort()).toEqual([...plain.historyPlayers].sort());
    expect([...cached.medianByPlayer.entries()].sort()).toEqual(
      [...plain.medianByPlayer.entries()].sort(),
    );
  });
});

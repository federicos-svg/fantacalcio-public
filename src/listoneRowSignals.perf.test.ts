// PERF — i segnali di riga del listone, il giro che `render()` in src/main.ts
// rifà a OGNI TASTO della ricerca giocatore (`app.innerHTML = ""` e
// ricostruzione dell'intero DOM).
//
// Stesso stampo di src/tierOrdering.perf.test.ts, e per le stesse due ragioni:
//
//  1. UN TETTO LARGO, NON UN CRONOMETRO. Serve a far diventare rosso un
//     ritorno al comportamento precedente, non a misurare la macchina. Un test
//     di performance che lampeggia in CI viene disattivato da qualcuno, ed è
//     peggio di non averlo.
//  2. IL RILEVATORE VERO GUARDA LA FORMA. Il tetto assoluto qui sotto va
//     DETTO per quello che è; il test che invece è rosso il secondo in cui la
//     memoizzazione sparisce è quello che confronta due misure prese sulla
//     stessa macchina nello stesso run — un rapporto, non un valore assoluto.
//
// La correttezza della cache — che è la parte che conta più della velocità —
// sta tutta in src/listoneRowSignals.cache.test.ts, contatori compresi.
//
// LA SCALA È QUELLA VERA. La fixture è il banco a 532 righe di
// src/tierOrdering.perfScenario.ts con un deposito di ~200 schede: prima di
// questo lavoro nessuna fixture di questo repository portava un pool a scala
// reale CON le pagelle — quella e2e ne ha sei righe — e qualunque numero
// misurato su sei righe sarebbe stato finto.

import { describe, it, expect, beforeEach } from "vitest";
import {
  listoneExpertPagellaViews,
  listoneExpertPagellaViewsUncached,
  listoneRowSignalsLookup,
  listoneRowSignalsLookupUncached,
  listoneSignalsCacheStats,
  resetListoneSignalsCache,
  type ListoneSignalsInput,
} from "./listoneRowSignals.js";
import { NO_SCHEDA_LINKS } from "./schedaLinks.js";
import {
  LISTONE_PAGE_SIZE,
  NO_MALUS_BONUS_COLUMN_KEY,
  paginateListonePool,
  sortListonePool,
} from "./ui/listone.js";
import { PERF_POOL_ROWS, perfPool, perfSchedeStore } from "./tierOrdering.perfScenario.js";

/**
 * TETTO LARGO, DI PROPOSITO, E ONESTO SU COSA PRENDE.
 *
 * Misurato su questo caso (mediana di 9 campioni dopo warm-up, su una macchina
 * CARICA — cinque agenti in parallelo): **0,001-0,002 ms** con la cache,
 * **4,4-6,4 ms** senza. Il tetto è a 2 ms, cioè oltre mille volte la misura
 * col riuso, perché un runner di CI condiviso è lento, rumoroso e senza
 * garanzie di CPU.
 *
 * A differenza del tetto gemello in src/tierOrdering.perf.test.ts, QUESTO il
 * ramo senza cache lo sfonda già oggi sulla macchina di misura (4,4 ms contro
 * 2 ms). Non è comunque il rilevatore: su un runner molto veloce potrebbe
 * tornare a passare. Il rilevatore è il test successivo.
 */
const KEYSTROKE_BUDGET_MS = 2;

/**
 * Il rapporto minimo fra il costo di un tasto (voce riusata) e il costo di una
 * risoluzione da zero (voce scaduta). Misurato: oltre **1000x** sul giro della
 * nota, **~30x** sulla tabella ordinata per una colonna di segnale. La soglia
 * è a 5x — sotto la misura peggiore di un ordine di grandezza, e
 * irraggiungibile senza cache, dove i due rami sono lo STESSO codice e il
 * rapporto crolla a 1.
 */
const MIN_REUSE_SPEEDUP = 5;

function median(samples: number[]): number {
  const s = [...samples].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

const POOL = perfPool(PERF_POOL_ROWS);
const SCHEDE = perfSchedeStore(POOL, true);
const INPUT: ListoneSignalsInput = { pool: POOL, schede: SCHEDE, links: NO_SCHEDA_LINKS };
/** Le righe davvero a schermo in un render: una pagina, non il pool. */
const PAGE = paginateListonePool(POOL, 1).items;

/** Il giro di UN TASTO: la nota sotto la tabella più le righe della pagina. */
function keystroke(): void {
  listoneExpertPagellaViews(INPUT);
  const lookup = listoneRowSignalsLookup(INPUT);
  for (const p of PAGE) lookup(p);
}

/** Lo stesso giro senza mai guardare la cache — il termine di paragone. */
function keystrokeUncached(): void {
  listoneExpertPagellaViewsUncached(INPUT);
  const lookup = listoneRowSignalsLookupUncached(INPUT);
  for (const p of PAGE) lookup(p);
}

beforeEach(() => {
  resetListoneSignalsCache();
});

describe("segnali di riga del listone — non regressione di performance", () => {
  it("lo scenario di misura è quello dichiarato, non una fixture da sei righe", () => {
    expect(POOL).toHaveLength(PERF_POOL_ROWS);
    expect(PAGE).toHaveLength(LISTONE_PAGE_SIZE);
    expect(SCHEDE.ok).toBe(true);
    if (!SCHEDE.ok) return;
    // ~200 schede su ~530 righe: la quota con cui Pico scrive davvero.
    expect(SCHEDE.byPlayerKey.size).toBeGreaterThan(150);
    expect(SCHEDE.byPlayerKey.size).toBeLessThan(260);

    // E il caso deve avere SOSTANZA: se la passata tornasse vuota, i due test
    // qui sotto misurerebbero il ramo che esce subito invece del lavoro.
    const views = listoneExpertPagellaViews(INPUT);
    expect(views).toHaveLength(PERF_POOL_ROWS);
    expect(views.filter((v) => v.votiPresenti > 0).length).toBeGreaterThan(150);
  });

  it(`un tasto resta sotto ${KEYSTROKE_BUDGET_MS} ms sul caso realistico più pesante`, () => {
    for (let i = 0; i < 5; i++) keystroke(); // warmup JIT + prima risoluzione
    const samples: number[] = [];
    for (let i = 0; i < 9; i++) {
      const t0 = performance.now();
      keystroke();
      samples.push(performance.now() - t0);
    }

    // Un tasto non cambia niente nello stato: dopo il warm-up nessuna riga si
    // è più risolta e la passata della nota non è più girata.
    expect(listoneSignalsCacheStats().rowBuilds).toBe(PERF_POOL_ROWS);
    expect(listoneSignalsCacheStats().viewBuilds).toBe(1);
    expect(median(samples)).toBeLessThan(KEYSTROKE_BUDGET_MS);
  });

  it(`riusare i segnali costa almeno ${MIN_REUSE_SPEEDUP} volte meno che ririsolverli`, () => {
    // QUESTO è il rilevatore, e guarda un RAPPORTO, non l'orologio: le due
    // misure escono dalla stessa macchina nello stesso run, quindi un runner
    // lento le rallenta entrambe e il rapporto regge. Senza memoizzazione i
    // due rami sono lo stesso codice e il rapporto crolla a 1.
    const missOf = (): number => {
      const t0 = performance.now();
      keystrokeUncached();
      return performance.now() - t0;
    };
    for (let i = 0; i < 5; i++) missOf(); // warmup
    const miss: number[] = [];
    for (let i = 0; i < 9; i++) miss.push(missOf());

    resetListoneSignalsCache();
    for (let i = 0; i < 5; i++) keystroke(); // cache calda
    const hit: number[] = [];
    for (let i = 0; i < 9; i++) {
      const t0 = performance.now();
      keystroke();
      hit.push(performance.now() - t0);
    }
    expect(listoneSignalsCacheStats().viewBuilds).toBe(1);

    expect(median(hit) * MIN_REUSE_SPEEDUP).toBeLessThan(median(miss));
  });

  it("la tabella ORDINATA per una colonna di segnale — il caso che gira già oggi", () => {
    // `sortListonePool` chiede i segnali per ogni CONFRONTO (~9.800 su 532
    // righe) e NON è dietro `expertSchedeHavePagella`: questo costo esiste
    // adesso, con il deposito di oggi, e non era mai stato misurato.
    const senzaPagelle = perfSchedeStore(POOL, false);
    const input: ListoneSignalsInput = {
      pool: POOL,
      schede: senzaPagelle,
      links: NO_SCHEDA_LINKS,
    };

    const sortWith = (lookup: ReturnType<typeof listoneRowSignalsLookup>): void => {
      sortListonePool(POOL, NO_MALUS_BONUS_COLUMN_KEY, "desc", lookup);
    };

    const missOf = (): number => {
      const lookup = listoneRowSignalsLookupUncached(input);
      const t0 = performance.now();
      sortWith(lookup);
      return performance.now() - t0;
    };
    for (let i = 0; i < 3; i++) missOf();
    const miss: number[] = [];
    for (let i = 0; i < 7; i++) miss.push(missOf());

    resetListoneSignalsCache();
    for (let i = 0; i < 3; i++) sortWith(listoneRowSignalsLookup(input));
    const hit: number[] = [];
    for (let i = 0; i < 7; i++) {
      const lookup = listoneRowSignalsLookup(input);
      const t0 = performance.now();
      sortWith(lookup);
      hit.push(performance.now() - t0);
    }

    // Ogni riga risolta una volta in tutto, non una per confronto.
    expect(listoneSignalsCacheStats().rowBuilds).toBe(PERF_POOL_ROWS);
    expect(median(hit) * MIN_REUSE_SPEEDUP).toBeLessThan(median(miss));
  });
});

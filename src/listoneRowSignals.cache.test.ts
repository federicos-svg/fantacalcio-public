// LA CACHE DEI SEGNALI DI RIGA — e il solo modo in cui può fare danno.
//
// Il rischio di una memoizzazione non è la lentezza: è mostrare un numero
// VECCHIO come se fosse fresco. Questo file esiste per escluderlo, e quasi
// tutte le sue asserzioni parlano di CORRETTEZZA, non di tempo (la velocità
// sta in src/listoneRowSignals.perf.test.ts).
//
// Stesso stampo di src/tierOrdering.cache.test.ts, deliberatamente: contatori
// invece di cronometri, e un GEMELLO NON MEMOIZZATO come termine di paragone —
// confrontare la versione memoizzata con sé stessa dopo un `reset` proverebbe
// che è coerente con sé stessa, non che è trasparente.
//
// Solo fixture sintetiche: nessun giocatore, nessuna squadra, nessun voto
// reale. I nomi sono segnaposto e i voti sono numeri scelti a mano (o estratti
// dal PRNG seminato del banco) per rendere leggibile il caso.

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
import { expertSchedaStore, type ExpertScheda } from "./expertScheda.js";
import { NO_SCHEDA_LINKS, withSchedaLink } from "./schedaLinks.js";
import {
  NO_MALUS_BONUS_COLUMN_KEY,
  listonePlayerKey,
  sortListonePool,
  type ListonePlayer,
} from "./ui/listone.js";
import type { PagellaScheda } from "./pagellaEsperti.js";
import { PERF_POOL_ROWS, perfPool, perfSchedeStore } from "./tierOrdering.perfScenario.js";

const PAGELLA_MOVIMENTO: PagellaScheda = {
  voti: {
    pagella_titolarita: 9,
    pagella_media_voto: 7,
    pagella_salute: 9,
    pagella_bonus: 6,
    pagella_consiglio: 8,
  },
  totaleFonte: 39,
};

const PAGELLA_PORTIERE: PagellaScheda = {
  voti: {
    pagella_titolarita: 1,
    pagella_media_voto: 1,
    pagella_salute: 8,
    pagella_porta_inviolata: 1,
    pagella_consiglio: 1,
  },
  totaleFonte: 12,
};

const DIFENSORE: ListonePlayer = { name: "Sintetico Uno", role: "D", club: "ClubUno" };
const PORTIERE: ListonePlayer = { name: "Sintetico Due", role: "P", club: "ClubDue" };
const SENZA: ListonePlayer = { name: "Sintetico Tre", role: "A", club: "ClubTre" };
const SMALL_POOL: readonly ListonePlayer[] = [DIFENSORE, PORTIERE, SENZA];

function scheda(p: ListonePlayer, pagella?: PagellaScheda): ExpertScheda {
  return {
    player: p.name,
    club: p.club,
    titolarita: "titolare",
    rigori: "designato",
    piazzati: ["punizioni"],
    ...(pagella === undefined ? {} : { pagella }),
  };
}

const CON_PAGELLE = expertSchedaStore([
  scheda(DIFENSORE, PAGELLA_MOVIMENTO),
  scheda(PORTIERE, PAGELLA_PORTIERE),
]);
/** Lo stesso deposito SENZA i cinque voti: il ramo di oggi. */
const SENZA_PAGELLE = expertSchedaStore([scheda(DIFENSORE), scheda(PORTIERE)]);

function inputOf(
  pool: readonly ListonePlayer[] = SMALL_POOL,
  schede = CON_PAGELLE,
  links = NO_SCHEDA_LINKS,
): ListoneSignalsInput {
  return { pool, schede, links };
}

beforeEach(() => {
  resetListoneSignalsCache();
});

// ─── Ciò che NON invalida: il giro che si ripete a ogni tasto ────────────────

describe("la cache regge il giro che render() rifà a ogni tasto", () => {
  it("duecento tasti risolvono ogni riga UNA volta sola", () => {
    const input = inputOf();

    for (let i = 0; i < 200; i += 1) {
      const lookup = listoneRowSignalsLookup(input);
      for (const p of input.pool) lookup(p);
    }

    // Il conteggio, non l'occhio: `rowBuilds` è incrementato esattamente
    // quando `resolveRowSignals` gira davvero.
    expect(listoneSignalsCacheStats()).toEqual({
      builds: 1,
      hits: 199,
      rowBuilds: SMALL_POOL.length,
      viewBuilds: 0,
    });
  });

  it("N+1 tasti sulla nota: una costruzione, N riusi, una passata sul pool", () => {
    const input = inputOf();
    const N = 40;

    for (let i = 0; i <= N; i += 1) listoneExpertPagellaViews(input);

    const stats = listoneSignalsCacheStats();
    expect(stats.builds).toBe(1);
    expect(stats.hits).toBe(N);
    expect(stats.viewBuilds).toBe(1);
    expect(stats.rowBuilds).toBe(SMALL_POOL.length);
  });

  it("ORDINARE per una colonna di segnale non rifà nessuna risoluzione", () => {
    // È il caso che il debito dichiarato di #41 NON nominava e che invece
    // gira già oggi: `sortListonePool` chiede i segnali per ogni CONFRONTO, e
    // non è dietro `expertSchedeHavePagella`.
    const pool = perfPool(PERF_POOL_ROWS);
    const input = inputOf(pool, perfSchedeStore(pool, false));

    for (let tasto = 0; tasto < 20; tasto += 1) {
      sortListonePool(pool, NO_MALUS_BONUS_COLUMN_KEY, "desc", listoneRowSignalsLookup(input));
    }

    // Ogni riga risolta una volta in tutto, non una per confronto e non una
    // per tasto: 532, non 532 x 20 e nemmeno ~9.800 x 20.
    expect(listoneSignalsCacheStats().rowBuilds).toBe(pool.length);
    expect(listoneSignalsCacheStats().builds).toBe(1);
  });

  it("la guardia sul deposito senza pagelle gira una volta, non a ogni tasto", () => {
    // `expertSchedeHavePagella` scandisce il deposito intero per rispondere
    // sempre «no». Adesso è dentro la memo, cioè una funzione del solo
    // deposito, che sta nella chiave.
    const input = inputOf(SMALL_POOL, SENZA_PAGELLE);

    for (let i = 0; i < 50; i += 1) expect(listoneExpertPagellaViews(input)).toEqual([]);

    expect(listoneSignalsCacheStats().viewBuilds).toBe(1);
    // …e nessuna riga è stata risolta: la passata è saltata, non memoizzata a vuoto.
    expect(listoneSignalsCacheStats().rowBuilds).toBe(0);
  });
});

// ─── Ciò che invalida, e che DEVE invalidare ────────────────────────────────

describe("un deposito nuovo ricostruisce, e il numero a schermo cambia", () => {
  it("cambiare il deposito delle schede fa ricostruire la voce", () => {
    const senza = inputOf(SMALL_POOL, SENZA_PAGELLE);
    const con = inputOf(SMALL_POOL, CON_PAGELLE);

    expect(listoneExpertPagellaViews(senza)).toEqual([]);
    expect(listoneSignalsCacheStats().builds).toBe(1);

    const dopo = listoneExpertPagellaViews(con);
    expect(listoneSignalsCacheStats().builds).toBe(2);

    // Non è un ricalcolo a vuoto: l'uscita è DIVERSA e non è la vecchia.
    expect(dopo).toHaveLength(SMALL_POOL.length);
    expect(dopo).toEqual(listoneExpertPagellaViewsUncached(con));
    expect(dopo.some((v) => v.votiPresenti > 0)).toBe(true);
  });

  it("i SEGNALI di una riga cambiano col deposito, non restano quelli di prima", () => {
    const senza = inputOf(SMALL_POOL, SENZA_PAGELLE);
    const prima = listoneRowSignalsLookup(senza)(DIFENSORE);
    expect(prima.pagella.votiPresenti).toBe(0);

    const con = inputOf(SMALL_POOL, CON_PAGELLE);
    const dopo = listoneRowSignalsLookup(con)(DIFENSORE);
    expect(dopo.pagella.votiPresenti).toBe(5);
    expect(dopo).toEqual(listoneRowSignalsLookupUncached(con)(DIFENSORE));
  });

  it("una risposta di Pico sull'aggancio ricostruisce la voce", () => {
    // `schedaLinks` entra nel calcolo (`resolveExpertInsight` la legge): senza
    // di lei nella chiave, la riga resterebbe alla risoluzione di prima della
    // risposta — cioè la domanda continuerebbe a comparire dopo la risposta.
    const base = inputOf();
    listoneRowSignalsLookup(base)(DIFENSORE);
    expect(listoneSignalsCacheStats().builds).toBe(1);

    const links = withSchedaLink(NO_SCHEDA_LINKS, listonePlayerKey(DIFENSORE), "una-scheda");
    listoneRowSignalsLookup(inputOf(SMALL_POOL, CON_PAGELLE, links))(DIFENSORE);
    expect(listoneSignalsCacheStats().builds).toBe(2);
  });

  it("un ricarico del listone è un'altra chiave: nuova voce", () => {
    const primo = perfPool(60, 20260824);
    const ricaricato = perfPool(40, 19990101); // altro oggetto E altro contenuto
    const schede = perfSchedeStore(primo, true);

    listoneExpertPagellaViews(inputOf(primo, schede));
    expect(listoneSignalsCacheStats().builds).toBe(1);
    const dopo = listoneExpertPagellaViews(inputOf(ricaricato, schede));
    expect(listoneSignalsCacheStats().builds).toBe(2);
    expect(dopo).toHaveLength(ricaricato.length);
    expect(dopo).toEqual(listoneExpertPagellaViewsUncached(inputOf(ricaricato, schede)));
  });

  it("una riga aggiunta al pool in loco fa scadere la voce", () => {
    // `state.pool` è tipato `ListonePlayer[]`: una `push` sarebbe legale per
    // il compilatore anche se oggi nessuno la scrive. La lunghezza confrontata
    // è la cintura che rende quel caso un ricalcolo invece di una nota vecchia.
    const pool: ListonePlayer[] = [DIFENSORE, PORTIERE];
    const schede = CON_PAGELLE;
    const prima = listoneExpertPagellaViews({ pool, schede, links: NO_SCHEDA_LINKS });
    expect(prima).toHaveLength(2);
    expect(listoneSignalsCacheStats().builds).toBe(1);

    pool.push(SENZA);
    const dopo = listoneExpertPagellaViews({ pool, schede, links: NO_SCHEDA_LINKS });
    expect(listoneSignalsCacheStats().builds).toBe(2);
    expect(dopo).toHaveLength(3);
  });
});

// ─── Il test che vale per tutti gli altri ───────────────────────────────────

describe("trasparenza: memoizzato e non memoizzato coincidono a ogni passo", () => {
  it("sequenza lunga di eventi misti su un listone da 532 righe", () => {
    const poolA = perfPool(PERF_POOL_ROWS, 20260824);
    const poolB = perfPool(400, 19990101); // il ricarico: altro oggetto, altro contenuto
    const depositi = [
      perfSchedeStore(poolA, false), // il deposito di oggi: nessuna pagella
      perfSchedeStore(poolA, true), // il giorno in cui l'estrazione atterra
      perfSchedeStore(poolA, true, 0.05, 777), // un deposito più magro
    ] as const;

    interface Step {
      readonly pool: readonly ListonePlayer[];
      readonly schede: ListoneSignalsInput["schede"];
      readonly links: ListoneSignalsInput["links"];
      /** Le righe di cui il passo chiede i segnali: la pagina a schermo. */
      readonly righe: readonly ListonePlayer[];
    }

    const steps: Step[] = [];
    let links = NO_SCHEDA_LINKS;
    for (let step = 0; step < 60; step += 1) {
      const pool = step >= 45 ? poolB : poolA;
      // Il deposito cambia di rado, come nella realtà: cambiarlo a ogni passo
      // renderebbe la sequenza tutta MISS, cioè un confronto che non esercita
      // mai la cache.
      const schede = step < 20 ? depositi[0] : step < 45 ? depositi[1] : depositi[2];
      if (step === 26) links = withSchedaLink(links, listonePlayerKey(poolA[3]!), "scelta-uno");
      if (step === 38) links = withSchedaLink(links, listonePlayerKey(poolA[9]!), "scelta-due");
      const start = (step * 37) % pool.length;
      steps.push({ pool, schede, links, righe: pool.slice(start, start + 10) });
    }

    // Passata A: cache viva per tutta la sequenza, come nell'app.
    resetListoneSignalsCache();
    const conCache = steps.map((s) => {
      const input: ListoneSignalsInput = { pool: s.pool, schede: s.schede, links: s.links };
      return {
        views: listoneExpertPagellaViews(input),
        righe: s.righe.map(listoneRowSignalsLookup(input)),
      };
    });

    // Passata B: nessuna cache, mai — il gemello di riferimento.
    const senzaCache = steps.map((s) => {
      const input: ListoneSignalsInput = { pool: s.pool, schede: s.schede, links: s.links };
      return {
        views: listoneExpertPagellaViewsUncached(input),
        righe: s.righe.map(listoneRowSignalsLookupUncached(input)),
      };
    });

    // Il confronto è passo per passo: un'uguaglianza sull'ultimo elemento
    // lascerebbe passare una divergenza che si richiude da sola.
    for (let i = 0; i < steps.length; i += 1) {
      expect(conCache[i], `passo ${i}`).toEqual(senzaCache[i]);
    }

    // La sequenza deve avere SOSTANZA: se un domani producesse solo elenchi
    // vuoti, il confronto sopra sarebbe vero misurando il nulla.
    const conVoti = conCache.filter((r) => r.views.some((v) => v.votiPresenti > 0)).length;
    expect(conVoti).toBeGreaterThan(30);
    // ...e deve aver davvero esercitato la cache in entrambe le direzioni.
    const stats = listoneSignalsCacheStats();
    expect(stats.builds).toBeGreaterThanOrEqual(5);
    expect(stats.hits).toBeGreaterThan(40);
  });
});

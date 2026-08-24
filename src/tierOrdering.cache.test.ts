// LA CACHE DEL LIBRO DELLE FASCE — e il solo modo in cui può fare danno.
//
// Il rischio di una memoizzazione non è la lentezza: è mostrare un numero
// VECCHIO come se fosse fresco. Questo file esiste per escluderlo, e quasi
// tutte le sue asserzioni parlano di CORRETTEZZA, non di tempo (la velocità sta
// in src/tierOrdering.perf.test.ts).
//
// Solo fixture sintetiche: nessun nome, club o punteggio reale — stesso vincolo
// di src/tierOrdering.test.ts. I punteggi sono numeri scelti a mano per rendere
// l'ordine leggibile a occhio, non una misura di appetibilità di nessuno.

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildTierBook,
  buildTierBookUncached,
  resetTierBookCache,
  tierBandReading,
  tierBookCacheStats,
  type TierBandInput,
  type TierBandReading,
} from "./tierOrdering.js";
import type { ListonePlayer, ListonePoolSource } from "./ui/listone.js";
import { listonePlayerKey } from "./ui/listone.js";
import { reduce } from "../packages/engine/src/reduce.js";
import { tierFacts } from "../packages/engine/src/tiers.js";
import type { ConfirmationInput } from "../packages/engine/src/confirmations.js";
import type { AuctionEvent, Role } from "../packages/engine/src/types.js";
import { perfPool, PERF_TEAMS, PERF_SELF } from "./tierOrdering.perfScenario.js";

const RECIPE = "APPEAL-INDEX-RECIPE@1.0.0";
const QUALITY = "sperimentale — fixture, non validato";
const TEAMS = ["Io", "Sq2", "Sq3", "Sq4", "Sq5", "Sq6", "Sq7", "Sq8"];
const TEN_TEAMS = [...TEAMS, "Sq9", "Sq10"];
const TS = "2026-08-01T12:00:00Z";

function row(name: string, role: Role, score: number | null): ListonePlayer {
  return {
    name,
    role,
    club: "ClubUno",
    quotation: 10,
    appealIndex: { score, quality: QUALITY, recipe: RECIPE, components: { appetibilitaBase: score } },
  };
}

/** `n` centrocampisti con punteggio decrescente: C-01 è il migliore. */
function midfielders(n: number, offset = 0): ListonePlayer[] {
  const out: ListonePlayer[] = [];
  for (let i = 1; i <= n; i += 1) {
    out.push(row(`Centro ${String(i).padStart(2, "0")}`, "C", 100 - i - offset));
  }
  return out;
}

const key = (p: ListonePlayer): string => listonePlayerKey(p);

function purchase(seq: number, p: ListonePlayer, team: string, price: number): AuctionEvent {
  return { type: "PURCHASE", seq, ts: TS, playerId: key(p), role: p.role, fantaTeamId: team, price };
}

function voidOf(seq: number, targetSeq: number): AuctionEvent {
  return { type: "VOID", seq, ts: TS, targetSeq };
}

interface Case {
  readonly pool: readonly ListonePlayer[];
  readonly source?: ListonePoolSource;
  readonly called: ListonePlayer;
  readonly log?: readonly AuctionEvent[];
  readonly teams?: readonly string[];
  readonly confirmations?: readonly ConfirmationInput[];
}

function inputOf(c: Case): TierBandInput {
  const teams = c.teams ?? TEAMS;
  const log = c.log ?? [];
  return {
    pool: c.pool,
    source: c.source ?? "remote",
    state: reduce(log, teams, c.confirmations ?? []),
    log,
    called: { playerId: key(c.called), role: c.called.role },
    selfId: "Io",
  };
}

/**
 * IL GEMELLO NON MEMOIZZATO — la copia di `tierBandReading` che passa da
 * `buildTierBookUncached` invece che dalla cache. È duplicazione DELIBERATA,
 * stessa idea di `packages/engine/tests/opportunityRadarReference.ts`: un
 * termine di paragone che non condivide con l'originale la cosa in esame.
 * Confrontarlo con `resetTierBookCache()` non basterebbe — proverebbe che la
 * cache è coerente con sé stessa, non che è trasparente.
 */
function readingWithoutCache(input: TierBandInput): TierBandReading {
  const { pool, source, state, log, called, selfId } = input;
  if (called === null) return { kind: "no-call" };
  const outcome = buildTierBookUncached(pool, source, state);
  if (outcome.kind === "unavailable") return outcome;
  return {
    kind: "facts",
    facts: tierFacts({
      state,
      log,
      playerId: called.playerId,
      role: called.role,
      book: outcome.book,
      selfId,
    }),
    coverage: outcome.coverage,
  };
}

beforeEach(() => {
  resetTierBookCache();
});

// ─── Ciò che NON invalida: il giro che si ripete a ogni tasto ────────────────

describe("la cache regge il giro che render() rifà a ogni tasto", () => {
  it("duecento letture di seguito costruiscono il libro UNA volta sola", () => {
    const pool = midfielders(40);
    const input = inputOf({ pool, called: pool[0]! });

    for (let i = 0; i < 200; i += 1) tierBandReading(input);

    // Il conteggio, non l'occhio: `builds` è incrementato dentro
    // `buildTierBook` esattamente quando `computeTierBook` gira davvero.
    expect(tierBookCacheStats()).toEqual({ builds: 1, hits: 199 });
  });

  it("un tasto nella ricerca, uno nel prezzo, una pagina del listone: nessuno ricostruisce", () => {
    const pool = midfielders(40);
    const input = inputOf({ pool, called: pool[0]! });
    const state = input.state;

    tierBandReading(input); // primo render: il libro si costruisce
    expect(tierBookCacheStats().builds).toBe(1);

    // Un tasto nella ricerca, un tasto nel prezzo e un cambio di pagina del
    // listone NON toccano né `pool`, né `source`, né il tavolo: per il libro
    // sono lo stesso render ripetuto, ed è esattamente il caso in esame.
    for (let i = 0; i < 50; i += 1) buildTierBook(pool, "remote", state);
    expect(tierBookCacheStats().builds).toBe(1);
  });

  it("selezionare un altro giocatore non ricostruisce il libro", () => {
    const pool = midfielders(40);
    const first = tierBandReading(inputOf({ pool, called: pool[0]! }));
    const other = tierBandReading(inputOf({ pool, called: pool[19]! }));

    expect(tierBookCacheStats().builds).toBe(1);
    // ...e la lettura è comunque quella del giocatore NUOVO, non la vecchia.
    expect(first).not.toEqual(other);
    expect(other).toEqual(readingWithoutCache(inputOf({ pool, called: pool[19]! })));
  });
});

// ─── Ciò che invalida, e ciò che invece non ha motivo di cambiare ────────────

describe("dopo un acquisto il numero a schermo cambia", () => {
  const pool = midfielders(40);
  const called = pool[0]!; // prima fascia
  const log = [purchase(0, pool[1]!, "Sq2", 42)];

  it("la lettura dopo l'acquisto è diversa da quella prima", () => {
    const before = tierBandReading(inputOf({ pool, called }));
    const after = tierBandReading(inputOf({ pool, called, log }));
    expect(after).not.toEqual(before);
  });

  it("la lettura dopo l'acquisto è quella VERA, non una riscaldata", () => {
    tierBandReading(inputOf({ pool, called })); // scalda la cache sullo stato vuoto
    const after = tierBandReading(inputOf({ pool, called, log }));
    expect(after).toEqual(readingWithoutCache(inputOf({ pool, called, log })));
  });

  it("il LIBRO invece non cambia, e non è un difetto: è cosa sono le fasce", () => {
    // Le fasce sono l'ordine del LISTONE per indice di appetibilità. Un
    // acquisto non riordina il listone: cambia i FATTI (occupazione, prezzi
    // pagati, avversari), che `tierFacts` ricalcola a ogni chiamata perché non
    // è memoizzato. Qui si prova che il libro riusato è IDENTICO a quello che
    // si otterrebbe ricostruendolo da zero sullo stato nuovo — cioè che
    // riusarlo non nasconde niente.
    const stateAfter = reduce(log, TEAMS);
    const reused = buildTierBook(pool, "remote", stateAfter);
    expect(reused).toEqual(buildTierBookUncached(pool, "remote", stateAfter));
  });
});

describe("dopo un annullamento la lettura torna coerente con lo stato vero", () => {
  const pool = midfielders(40);
  const called = pool[0]!;
  const bought = [purchase(0, pool[1]!, "Sq2", 42), purchase(1, pool[2]!, "Sq3", 30)];
  const undone = [...bought, voidOf(2, 1)];

  it("annullare cambia di nuovo la lettura, e la riporta sullo stato reale", () => {
    const empty = tierBandReading(inputOf({ pool, called }));
    const afterBuy = tierBandReading(inputOf({ pool, called, log: bought }));
    const afterVoid = tierBandReading(inputOf({ pool, called, log: undone }));

    expect(afterVoid).not.toEqual(afterBuy);
    expect(afterVoid).not.toEqual(empty);
    expect(afterVoid).toEqual(readingWithoutCache(inputOf({ pool, called, log: undone })));
    // Annullare il secondo acquisto riporta esattamente allo stato del primo:
    // se la cache stesse restituendo un residuo, questa uguaglianza salterebbe.
    const onlyFirst = [purchase(0, pool[1]!, "Sq2", 42)];
    expect(afterVoid.kind).toBe("facts");
    expect(afterVoid).toEqual(readingWithoutCache(inputOf({ pool, called, log: onlyFirst })));
  });
});

describe("dopo il caricamento delle riconferme la lettura cambia", () => {
  const pool = midfielders(40);
  const called = pool[0]!;
  const confirmations: ConfirmationInput[] = [
    { fantaTeamId: "Sq2", playerId: key(pool[3]!), role: "C", price: 12 },
    { fantaTeamId: "Sq3", playerId: key(pool[4]!), role: "C", price: 9 },
  ];

  it("la lettura senza riconferme e quella con riconferme non coincidono", () => {
    const without = tierBandReading(inputOf({ pool, called }));
    const with_ = tierBandReading(inputOf({ pool, called, confirmations }));
    expect(with_).not.toEqual(without);
    expect(with_).toEqual(readingWithoutCache(inputOf({ pool, called, confirmations })));
  });
});

describe("dopo un ricarico del listone il libro si ricostruisce e cambia", () => {
  it("un nuovo pool è una nuova chiave: nuova costruzione, nuovo libro", () => {
    const first = midfielders(40);
    const reloaded = midfielders(40, 5).slice(0, 30); // altro oggetto E altro contenuto
    const called = first[0]!;

    const a = tierBandReading(inputOf({ pool: first, called }));
    expect(tierBookCacheStats().builds).toBe(1);
    const b = tierBandReading(inputOf({ pool: reloaded, called }));
    expect(tierBookCacheStats().builds).toBe(2);

    expect(b).not.toEqual(a);
    expect(b).toEqual(readingWithoutCache(inputOf({ pool: reloaded, called })));
  });

  it("un listone svuotato non lascia in vita il libro di quello di prima", () => {
    const pool = midfielders(40);
    tierBandReading(inputOf({ pool, called: pool[0]! }));
    const emptied = buildTierBook([], "none", reduce([], TEAMS));
    expect(emptied.kind).toBe("unavailable");
    if (emptied.kind !== "unavailable") return;
    expect(emptied.reason).toBe("no-pool");
  });
});

// ─── I due pezzi di chiave che l'occhio salta ────────────────────────────────

describe("la chiave copre TUTTO ciò che il calcolo legge", () => {
  it("stessa identità di pool, sorgente diversa: la provenienza non resta quella vecchia", () => {
    // `source` finisce dentro `provenance.source`, che va A SCHERMO accanto
    // alla fascia. Una chiave che lo omette restituirebbe un libro che dichiara
    // la sorgente sbagliata su righe identiche — una bugia silenziosa.
    const pool = midfielders(40);
    const state = reduce([], TEAMS);

    const remote = buildTierBook(pool, "remote", state);
    const manual = buildTierBook(pool, "manual", state);

    expect(tierBookCacheStats().builds).toBe(2);
    expect(remote.kind).toBe("book");
    expect(manual.kind).toBe("book");
    if (remote.kind !== "book" || manual.kind !== "book") return;
    expect(manual.book.provenance.source).not.toBe(remote.book.provenance.source);
    expect(manual).toEqual(buildTierBookUncached(pool, "manual", state));
  });

  it("stessa identità di pool, tavolo di dimensione diversa: la fascia non resta larga otto", () => {
    // `tierFacts()` LANCIA se il libro è largo otto e il tavolo è da dieci:
    // senza `teamsCount` nella chiave la cache produrrebbe esattamente quel
    // lancio in mezzo all'asta.
    const pool = midfielders(40);
    const eight = buildTierBook(pool, "remote", reduce([], TEAMS));
    const ten = buildTierBook(pool, "remote", reduce([], TEN_TEAMS));

    expect(tierBookCacheStats().builds).toBe(2);
    if (eight.kind !== "book" || ten.kind !== "book") throw new Error("libro atteso");
    expect(eight.book.tierSize).toBe(8);
    expect(ten.book.tierSize).toBe(10);

    // E la lettura completa sul tavolo da dieci non lancia.
    const reading = tierBandReading(
      inputOf({ pool, called: pool[0]!, teams: TEN_TEAMS }),
    );
    expect(reading.kind).toBe("facts");
  });

  it("una riga aggiunta al pool in loco fa scadere la voce", () => {
    // `state.pool` è tipato `ListonePlayer[]`: una `push` sarebbe legale per il
    // compilatore anche se oggi nessuno la scrive. La lunghezza confrontata è
    // la cintura che rende quel caso un ricalcolo invece di un numero vecchio.
    const pool = midfielders(40);
    const state = reduce([], TEAMS);
    const before = buildTierBook(pool, "remote", state);
    expect(tierBookCacheStats().builds).toBe(1);

    pool.push(row("Centro 41", "C", 10));
    const after = buildTierBook(pool, "remote", state);
    expect(tierBookCacheStats().builds).toBe(2);
    expect(after).not.toEqual(before);
    expect(after).toEqual(buildTierBookUncached(pool, "remote", state));
  });

  it("il libro NON dipende dal log né dalle riconferme, ed è per questo che non sono nella chiave", () => {
    // Questa è la prova che tiene onesta la chiave ristretta. Se un domani
    // `computeTierBook` cominciasse a leggere il log (per esempio togliendo
    // dalle fasce i giocatori già venduti), questo test diventerebbe rosso e
    // obbligherebbe a rivedere la cache PRIMA di spedire un numero vecchio.
    const pool = midfielders(40);
    const heavy: AuctionEvent[] = [];
    for (let i = 1; i <= 20; i += 1) {
      heavy.push(purchase(i - 1, pool[i]!, TEAMS[i % TEAMS.length]!, 5 + i));
    }
    const confirmations: ConfirmationInput[] = [
      { fantaTeamId: "Sq7", playerId: key(pool[35]!), role: "C", price: 15 },
    ];

    const bare = buildTierBookUncached(pool, "remote", reduce([], TEAMS));
    const busy = buildTierBookUncached(pool, "remote", reduce(heavy, TEAMS, confirmations));
    expect(busy).toEqual(bare);
  });
});

// ─── Il test che vale per tutti gli altri ───────────────────────────────────

describe("trasparenza: memoizzato e non memoizzato coincidono a ogni passo", () => {
  it("sequenza lunga di eventi misti su un listone da 532 righe", () => {
    const poolA = perfPool(532, 20260824);
    const poolB = perfPool(400, 19990101); // il ricarico: altro oggetto, altro contenuto
    const sources: readonly ListonePoolSource[] = ["remote", "static", "local-storage", "manual"];
    const PERF_TEAMS_TEN: readonly string[] = [...PERF_TEAMS, "Squadra 9", "Squadra 10"];

    // Acquisti pescati dal listone in modo deterministico, otto squadre a
    // rotazione, con qualche annullamento e due ricarichi in mezzo.
    const byRole = { P: [] as ListonePlayer[], D: [], C: [], A: [] } as Record<Role, ListonePlayer[]>;
    for (const p of poolA) byRole[p.role].push(p);

    interface Step {
      readonly pool: readonly ListonePlayer[];
      readonly source: ListonePoolSource;
      readonly log: readonly AuctionEvent[];
      readonly confirmations: readonly ConfirmationInput[];
      readonly called: ListonePlayer;
      readonly teams: readonly string[];
    }

    const steps: Step[] = [];
    const log: AuctionEvent[] = [];
    let confirmations: readonly ConfirmationInput[] = [];
    let seq = 0;
    const roleCursor: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
    const roles: readonly Role[] = ["D", "C", "A", "C", "D", "A"];

    for (let step = 0; step < 60; step += 1) {
      const pool = step >= 45 ? poolB : poolA;
      // La sorgente cambia di rado, come nella realtà (cambia quando cambia il
      // listone): cicli a ogni passo renderebbero la sequenza tutta MISS, cioè
      // un confronto che non esercita mai la cache.
      const source = step < 20 ? sources[0]! : step < 45 ? sources[1]! : sources[3]!;
      // Il tavolo si allarga a metà sequenza: stessa FAMIGLIA di identificatori
      // (le riconferme sopra ne nominano due), due squadre in più.
      const teams = step >= 30 && step < 45 ? PERF_TEAMS_TEN : PERF_TEAMS;

      if (step === 12) {
        // Le riconferme entrano a metà: giocatori NON toccati dal log vivo
        // (altrimenti `reduce` rifiuta il conflitto, ed è giusto così).
        confirmations = [
          { fantaTeamId: PERF_TEAMS[6]!, playerId: listonePlayerKey(byRole.D[120]!), role: "D", price: 11 },
          { fantaTeamId: PERF_TEAMS[7]!, playerId: listonePlayerKey(byRole.A[100]!), role: "A", price: 7 },
        ];
      }
      if (step % 7 === 6 && log.length > 0) {
        // annullamento dell'ultimo acquisto ancora valido
        const last = [...log].reverse().find((e) => e.type === "PURCHASE");
        if (last) log.push(voidOf(seq++, last.seq));
      } else if (step % 3 !== 2) {
        const role = roles[step % roles.length]!;
        const rows = byRole[role];
        const pick = rows[roleCursor[role]++ % rows.length]!;
        log.push(purchase(seq++, pick, PERF_TEAMS[step % PERF_TEAMS.length]!, 3 + (step % 17)));
      }
      // I passi restanti sono TASTI: niente cambia nello stato, si rilegge.
      const called = pool[(step * 37) % pool.length]!;
      steps.push({ pool, source, log: [...log], confirmations, called, teams });
    }

    // Passata A: cache viva per tutta la sequenza, come nell'app.
    resetTierBookCache();
    const withCache = steps.map((s) =>
      tierBandReading({
        pool: s.pool,
        source: s.source,
        state: reduce(s.log, s.teams, s.confirmations),
        log: s.log,
        called: { playerId: listonePlayerKey(s.called), role: s.called.role },
        selfId: PERF_SELF,
      }),
    );

    // Passata B: nessuna cache, mai — il gemello di riferimento.
    const withoutCache = steps.map((s) =>
      readingWithoutCache({
        pool: s.pool,
        source: s.source,
        state: reduce(s.log, s.teams, s.confirmations),
        log: s.log,
        called: { playerId: listonePlayerKey(s.called), role: s.called.role },
        selfId: PERF_SELF,
      }),
    );

    // Il confronto è passo per passo: un'uguaglianza sull'ultimo elemento
    // lascerebbe passare una divergenza che si richiude da sola.
    for (let i = 0; i < steps.length; i += 1) {
      expect(withCache[i], `passo ${i}`).toEqual(withoutCache[i]);
    }

    // La sequenza deve avere SOSTANZA: se un domani producesse solo esiti
    // "unavailable", il confronto sopra sarebbe vero misurando il nulla.
    const facts = withCache.filter((r) => r.kind === "facts").length;
    expect(facts).toBeGreaterThan(40);
    // ...e deve aver davvero esercitato la cache in entrambe le direzioni.
    // Quattro costruzioni sole in sessanta passi — una per ogni cambio vero
    // della terna (sorgente a 20, tavolo a 30, listone a 45, più la prima) —
    // e tutto il resto riusato.
    expect(tierBookCacheStats().builds).toBeGreaterThanOrEqual(4);
    expect(tierBookCacheStats().hits).toBeGreaterThan(40);
  });
});

// LA CACHE DELLA SCALA DEI LIBERI — e il solo modo in cui può fare danno.
//
// Il rischio di una memoizzazione non è la lentezza: è mostrare un numero
// VECCHIO come se fosse fresco, e qui il numero vecchio sarebbe il peggiore di
// tutti — «terzo fra i liberi» quando i due davanti sono appena stati venduti è
// esattamente l'errore che l'indice relativo esiste per non fare. Questo file
// esiste per escluderlo, e quasi tutte le sue asserzioni parlano di
// CORRETTEZZA, non di tempo.
//
// LA DIFFERENZA CON src/tierOrdering.cache.test.ts, e perché servono due file:
// il libro delle fasce NON dipende dal log, e quel file prova appunto che un
// acquisto non lo tocca. La scala dei liberi dipende dal log per definizione,
// quindi qui la domanda è opposta — «la voce scade davvero quando qualcuno
// compra?» — e va posta a parte.
//
// Solo fixture sintetiche: nessun nome, club o punteggio reale.

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildFreeLadder,
  buildFreeLadderUncached,
  freeLadderCacheStats,
  resetFreeLadderCache,
} from "./relativeIndex.js";
import {
  buildTierBook,
  buildTierBookUncached,
  resetTierBookCache,
} from "./tierOrdering.js";
import type { ListonePlayer, ListonePoolSource } from "./ui/listone.js";
import { listonePlayerKey } from "./ui/listone.js";
import { reduce } from "../packages/engine/src/reduce.js";
import {
  relativeIndexReading,
  type RelativeIndexReading,
} from "../packages/engine/src/relativeIndex.js";
import type { ConfirmationInput } from "../packages/engine/src/confirmations.js";
import type { AuctionEvent, Role } from "../packages/engine/src/types.js";
import { perfPool, PERF_TEAMS, PERF_SELF } from "./tierOrdering.perfScenario.js";

const RECIPE = "APPEAL-INDEX-RECIPE@1.0.0";
const QUALITY = "sperimentale — fixture, non validato";
const TEAMS = ["Io", "Sq2", "Sq3", "Sq4", "Sq5", "Sq6", "Sq7", "Sq8"];
const SELF = "Io";
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

/** `n` attaccanti con punteggio decrescente: A-01 è il migliore. */
function strikers(n: number, offset = 0): ListonePlayer[] {
  const out: ListonePlayer[] = [];
  for (let i = 1; i <= n; i += 1) {
    out.push(row(`Punta ${String(i).padStart(2, "0")}`, "A", 100 - i - offset));
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
  readonly selfId?: string;
}

/**
 * IL GIRO VERO, quello che `valueBoxProps()` fa a ogni render: libro
 * memoizzato, scala memoizzata, lettura ricalcolata. Se questa funzione
 * divergesse da src/main.ts il test misurerebbe un'altra app.
 */
function readingWithCache(c: Case): RelativeIndexReading {
  const teams = c.teams ?? TEAMS;
  const log = c.log ?? [];
  const state = reduce(log, teams, c.confirmations ?? []);
  const book = buildTierBook(c.pool, c.source ?? "remote", state);
  return relativeIndexReading({
    called: { playerId: key(c.called), role: c.called.role },
    ladder: buildFreeLadder(c.pool, book.kind === "book" ? book.book : null, state.purchasedPlayerIds),
    state,
    selfId: c.selfId ?? SELF,
  });
}

/**
 * IL GEMELLO NON MEMOIZZATO — lo stesso giro che non tocca nessuna delle due
 * cache. È duplicazione DELIBERATA, stessa idea di
 * `packages/engine/tests/opportunityRadarReference.ts`: un termine di paragone
 * che non condivide con l'originale la cosa in esame. Confrontare l'originale
 * con sé stesso dopo un `reset` proverebbe che la cache è coerente con sé
 * stessa, non che è trasparente.
 */
function readingWithoutCache(c: Case): RelativeIndexReading {
  const teams = c.teams ?? TEAMS;
  const log = c.log ?? [];
  const state = reduce(log, teams, c.confirmations ?? []);
  const book = buildTierBookUncached(c.pool, c.source ?? "remote", state);
  return relativeIndexReading({
    called: { playerId: key(c.called), role: c.called.role },
    ladder: buildFreeLadderUncached(
      c.pool,
      book.kind === "book" ? book.book : null,
      state.purchasedPlayerIds,
    ),
    state,
    selfId: c.selfId ?? SELF,
  });
}

beforeEach(() => {
  resetFreeLadderCache();
  resetTierBookCache();
});

// ─── Ciò che NON invalida: il giro che si ripete a ogni tasto ────────────────

describe("la scala regge il giro che render() rifà a ogni tasto", () => {
  it("duecento letture di seguito costruiscono la scala UNA volta sola", () => {
    const pool = strikers(40);
    for (let i = 0; i < 200; i += 1) readingWithCache({ pool, called: pool[0]! });
    // Il conteggio, non l'occhio: `builds` è incrementato dentro
    // `buildFreeLadder` esattamente quando `computeLadder` gira davvero.
    expect(freeLadderCacheStats()).toEqual({ builds: 1, hits: 199 });
  });

  it("selezionare un altro giocatore non ricostruisce la scala", () => {
    const pool = strikers(40);
    const first = readingWithCache({ pool, called: pool[0]! });
    const other = readingWithCache({ pool, called: pool[19]! });

    expect(freeLadderCacheStats().builds).toBe(1);
    // ...e la lettura è comunque quella del giocatore NUOVO, non la vecchia.
    expect(first).not.toEqual(other);
    expect(other).toEqual(readingWithoutCache({ pool, called: pool[19]! }));
  });
});

// ─── Ciò che invalida: qui il log è nella chiave, ed è la ragione del modulo ──

describe("dopo un acquisto la posizione cambia, e cambia davvero", () => {
  const pool = strikers(40);
  const called = pool[9]!; // decimo dell'ordine
  const above = [purchase(0, pool[1]!, "Sq2", 42)];

  it("la scala si ricostruisce e la posizione sale", () => {
    const before = readingWithCache({ pool, called });
    expect(freeLadderCacheStats()).toEqual({ builds: 1, hits: 0 });

    const after = readingWithCache({ pool, called, log: above });
    // La voce è SCADUTA: se il log non fosse nella chiave qui ci sarebbe un hit
    // e il numero a schermo resterebbe quello di prima.
    expect(freeLadderCacheStats().builds).toBe(2);
    expect(before).toMatchObject({ kind: "posizione", position: 10 });
    expect(after).toMatchObject({ kind: "posizione", position: 9 });
  });

  it("la lettura dopo l'acquisto è quella VERA, non una riscaldata", () => {
    readingWithCache({ pool, called }); // scalda la cache sullo stato vuoto
    const after = readingWithCache({ pool, called, log: above });
    expect(after).toEqual(readingWithoutCache({ pool, called, log: above }));
  });

  it("un acquisto SOTTO di lui non muove il numero, ma la voce scade lo stesso", () => {
    // La cache non è più fine dell'invalidazione: la chiave è «chi è stato
    // preso», non «chi è stato preso sopra il chiamato» — che dipenderebbe dal
    // chiamato, cioè dal tasto, ed è esattamente ciò che non deve entrare.
    const below = [purchase(0, pool[30]!, "Sq2", 3)];
    const before = readingWithCache({ pool, called });
    const after = readingWithCache({ pool, called, log: below });
    expect(freeLadderCacheStats().builds).toBe(2);
    expect(after).toMatchObject({ kind: "posizione", position: 10 });
    expect(after).toEqual(readingWithoutCache({ pool, called, log: below }));
    expect((after as { position: number }).position).toBe(
      (before as { position: number }).position,
    );
  });
});

describe("dopo un annullamento la posizione torna coerente con lo stato vero", () => {
  const pool = strikers(40);
  const called = pool[9]!;
  const bought = [purchase(0, pool[1]!, "Sq2", 42), purchase(1, pool[2]!, "Sq3", 30)];
  const undone = [...bought, voidOf(2, 1)];

  it("annullare riporta la posizione sullo stato reale", () => {
    const afterBuy = readingWithCache({ pool, called, log: bought });
    const afterVoid = readingWithCache({ pool, called, log: undone });

    expect(afterBuy).toMatchObject({ kind: "posizione", position: 8 });
    expect(afterVoid).toMatchObject({ kind: "posizione", position: 9 });
    expect(afterVoid).toEqual(readingWithoutCache({ pool, called, log: undone }));
    // Annullare il secondo acquisto riporta esattamente allo stato del primo:
    // se la cache stesse restituendo un residuo, questa uguaglianza salterebbe.
    expect(afterVoid).toEqual(
      readingWithoutCache({ pool, called, log: [purchase(0, pool[1]!, "Sq2", 42)] }),
    );
  });
});

describe("dopo il caricamento delle riconferme la posizione cambia", () => {
  it("un riconfermato sopra di lui esce dai prendibili", () => {
    const pool = strikers(40);
    const called = pool[9]!;
    const confirmations: ConfirmationInput[] = [
      { fantaTeamId: "Sq2", playerId: key(pool[3]!), role: "A", price: 12 },
    ];
    const without = readingWithCache({ pool, called });
    const with_ = readingWithCache({ pool, called, confirmations });

    expect(without).toMatchObject({ position: 10 });
    expect(with_).toMatchObject({ position: 9 });
    expect(with_).toEqual(readingWithoutCache({ pool, called, confirmations }));
  });
});

// ─── I pezzi di chiave che l'occhio salta ────────────────────────────────────

describe("la chiave copre TUTTO ciò che il calcolo legge", () => {
  it("stesso listone e stessi presi, LIBRO diverso: la scala non resta quella vecchia", () => {
    // Il libro è nella chiave PER IDENTITÀ, e non è pignoleria: un libro
    // costruito su un tavolo da dieci ha fasce diverse e — soprattutto — può
    // avere un ordine diverso. Senza il libro nella chiave, cambiare tavolo
    // lascerebbe in vita una scala costruita su un altro ordine.
    const pool = strikers(40);
    const state = reduce([], TEAMS);
    const bookA = buildTierBook(pool, "remote", state);
    const bookB = buildTierBookUncached(pool, "manual", state); // altro oggetto
    if (bookA.kind !== "book" || bookB.kind !== "book") throw new Error("libro atteso");

    buildFreeLadder(pool, bookA.book, state.purchasedPlayerIds);
    expect(freeLadderCacheStats().builds).toBe(1);
    buildFreeLadder(pool, bookB.book, state.purchasedPlayerIds);
    expect(freeLadderCacheStats().builds).toBe(2);
  });

  it("una riga aggiunta al pool in loco fa scadere la voce", () => {
    // `state.pool` è tipato `ListonePlayer[]`: una `push` sarebbe legale per il
    // compilatore anche se oggi nessuno la scrive. La lunghezza confrontata è la
    // cintura che rende quel caso un ricalcolo invece di un numero vecchio.
    const pool = strikers(40);
    const state = reduce([], TEAMS);
    const book = buildTierBook(pool, "remote", state);
    const bookRef = book.kind === "book" ? book.book : null;

    const before = buildFreeLadder(pool, bookRef, state.purchasedPlayerIds);
    expect(freeLadderCacheStats().builds).toBe(1);
    pool.push(row("Punta 41", "A", 10));
    const after = buildFreeLadder(pool, bookRef, state.purchasedPlayerIds);
    expect(freeLadderCacheStats().builds).toBe(2);
    expect(after.byRole.get("A")!.poolCount).toBe(41);
    expect(before.byRole.get("A")!.poolCount).toBe(40);
  });

  it("la lista dei presi entra per CONTENUTO, non per identità", () => {
    // `reduce()` restituisce un array NUOVO a ogni render. Se la chiave
    // guardasse l'identità, ogni tasto sarebbe un miss e la cache non
    // servirebbe a niente: qui si prova che due liste uguali per contenuto
    // colpiscono, e due diverse no.
    const pool = strikers(40);
    const log = [purchase(0, pool[1]!, "Sq2", 42)];
    const first = reduce(log, TEAMS);
    const second = reduce(log, TEAMS); // stesso contenuto, altro array
    expect(first.purchasedPlayerIds).not.toBe(second.purchasedPlayerIds);
    const book = buildTierBook(pool, "remote", first);
    const bookRef = book.kind === "book" ? book.book : null;

    buildFreeLadder(pool, bookRef, first.purchasedPlayerIds);
    buildFreeLadder(pool, bookRef, second.purchasedPlayerIds);
    expect(freeLadderCacheStats()).toEqual({ builds: 1, hits: 1 });

    const third = reduce([...log, purchase(1, pool[2]!, "Sq3", 9)], TEAMS);
    buildFreeLadder(pool, bookRef, third.purchasedPlayerIds);
    expect(freeLadderCacheStats().builds).toBe(2);
  });

  it("la voce conserva una COPIA dei presi: mutare l'array del chiamante non la falsifica", () => {
    const pool = strikers(40);
    const state = reduce([], TEAMS);
    const book = buildTierBook(pool, "remote", state);
    const bookRef = book.kind === "book" ? book.book : null;
    const purchased: string[] = [];

    buildFreeLadder(pool, bookRef, purchased);
    expect(freeLadderCacheStats().builds).toBe(1);
    purchased.push(key(pool[1]!)); // lo stesso array, mutato
    const after = buildFreeLadder(pool, bookRef, purchased);
    // Se la voce avesse conservato il RIFERIMENTO, il confronto sarebbe stato
    // «l'array con sé stesso», cioè sempre vero, e la scala vecchia sarebbe
    // sopravvissuta a un acquisto.
    expect(freeLadderCacheStats().builds).toBe(2);
    expect(after.taken.has(key(pool[1]!))).toBe(true);
  });
});

// ─── LO STATO DI OGGI, MISURATO INVECE CHE SUPPOSTO ─────────────────────────
//
// Due scene che il core pubblico produce davvero, e che vanno tenute DISTINTE
// perché sono due attese diverse per chi guarda. Il listone spedito con l'app
// (`public/data/listone_2025_26.json`) non porta il campo `appealIndex` affatto;
// il deposito privato lo porta ma può servire `score: null` su una riga senza
// verdetto — e, al limite, su tutte.

describe("dove il numero non c'è, dice quale delle due cose manca", () => {
  it("nessuna riga porta l'indice: non esiste un ordine, e lo dice", () => {
    const pool: ListonePlayer[] = [
      { name: "Punta Uno", role: "A", club: "ClubUno", quotation: 10 },
      { name: "Punta Due", role: "A", club: "ClubDue", quotation: 8 },
    ];
    const reading = readingWithCache({ pool, called: pool[0]! });
    expect(reading).toMatchObject({ kind: "assente", reason: "listone-senza-ordine" });
    // ...e la METÀ MISURABILE resta: due attaccanti nel listone, due liberi.
    // Contare righe non ha bisogno di nessun punteggio.
    expect(reading.population).toMatchObject({ poolInRole: 2, freeInRole: 2 });
  });

  it("l'indice c'è ma NESSUNA riga ha un verdetto: motivo diverso, stessa onestà", () => {
    // Il caso limite della premessa: il generatore serve l'indice e lo serve
    // `null` su tutte le righe. Il libro delle fasce si costruisce (la ricetta
    // c'è), il ruolo risulta ORDINATO, e l'ordine è vuoto: nessuno ha una
    // posizione, ognuno per la propria mancanza di verdetto. Non è lo stesso
    // `n/d` di sopra — là mancava il dato, qui manca il verdetto — e i due
    // motivi non si fondono.
    const pool = [row("Punta Uno", "A", null), row("Punta Due", "A", null)];
    const reading = readingWithCache({ pool, called: pool[0]! });
    expect(reading).toMatchObject({ kind: "assente", reason: "non-ordinato" });
    expect(reading.population).toMatchObject({
      poolInRole: 2,
      freeInRole: 2,
      // Zero ORDINATI liberi: il denominatore della posizione è vuoto, ed è la
      // ragione per cui la posizione non esiste.
      freeRankedInRole: 0,
    });
  });
});

// ─── Il test che vale per tutti gli altri ───────────────────────────────────

describe("trasparenza: memoizzato e non memoizzato coincidono a ogni passo", () => {
  it("sequenza lunga di eventi misti su un listone da 532 righe", () => {
    const poolA = perfPool(532, 20260824);
    const poolB = perfPool(400, 19990101); // il ricarico: altro oggetto, altro contenuto

    const byRole = { P: [] as ListonePlayer[], D: [], C: [], A: [] } as Record<Role, ListonePlayer[]>;
    for (const p of poolA) byRole[p.role].push(p);

    interface Step {
      readonly pool: readonly ListonePlayer[];
      readonly source: ListonePoolSource;
      readonly log: readonly AuctionEvent[];
      readonly confirmations: readonly ConfirmationInput[];
      readonly called: ListonePlayer;
    }

    const steps: Step[] = [];
    const log: AuctionEvent[] = [];
    let confirmations: readonly ConfirmationInput[] = [];
    let seq = 0;
    const roleCursor: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
    const roles: readonly Role[] = ["D", "C", "A", "C", "D", "A"];

    for (let step = 0; step < 60; step += 1) {
      const pool = step >= 45 ? poolB : poolA;
      const source: ListonePoolSource = step < 20 ? "remote" : step < 45 ? "static" : "manual";

      if (step === 12) {
        confirmations = [
          { fantaTeamId: PERF_TEAMS[6]!, playerId: listonePlayerKey(byRole.D[120]!), role: "D", price: 11 },
          { fantaTeamId: PERF_TEAMS[7]!, playerId: listonePlayerKey(byRole.A[100]!), role: "A", price: 7 },
        ];
      }
      if (step % 7 === 6 && log.length > 0) {
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
      steps.push({ pool, source, log: [...log], confirmations, called });
    }

    const run = (
      s: Step,
      reader: (c: Case) => RelativeIndexReading,
    ): RelativeIndexReading =>
      reader({
        pool: s.pool,
        source: s.source,
        log: s.log,
        confirmations: s.confirmations,
        called: s.called,
        teams: PERF_TEAMS,
        selfId: PERF_SELF,
      });

    // Passata A: cache viva per tutta la sequenza, come nell'app.
    resetFreeLadderCache();
    resetTierBookCache();
    const withCache = steps.map((s) => run(s, readingWithCache));

    // Passata B: nessuna cache, mai — il gemello di riferimento.
    const withoutCache = steps.map((s) => run(s, readingWithoutCache));

    // Il confronto è PASSO PER PASSO: un'uguaglianza sull'ultimo elemento
    // lascerebbe passare una divergenza che si richiude da sola.
    for (let i = 0; i < steps.length; i += 1) {
      expect(withCache[i], `passo ${i}`).toEqual(withoutCache[i]);
    }

    // La sequenza deve avere SOSTANZA: se producesse solo assenze, il confronto
    // sopra sarebbe vero misurando il nulla.
    const positions = withCache.filter((r) => r.kind === "posizione").length;
    expect(positions).toBeGreaterThan(40);
    // ...e deve aver davvero esercitato la cache in entrambe le direzioni: i
    // TASTI (i passi che non cambiano lo stato) sono hit, gli acquisti sono miss.
    expect(freeLadderCacheStats().hits).toBeGreaterThan(10);
    expect(freeLadderCacheStats().builds).toBeGreaterThan(10);
  });
});

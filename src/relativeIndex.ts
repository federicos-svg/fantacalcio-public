// DAL LISTONE ALLA SCALA DEI LIBERI — il ponte fra le righe del listone come
// stanno a schermo e il motore dell'indice relativo
// (packages/engine/src/relativeIndex.ts), più la sua memoizzazione.
//
// PERCHÉ QUESTO FILE ESISTE, ed è esattamente la ragione per cui esiste
// src/tierOrdering.ts accanto a packages/engine/src/tiers.ts: il motore è puro
// e non conosce il listone dell'app — vuole `(playerId, role)` con l'IDENTITÀ
// dell'event log, che di là dal confine non è ricavabile. Qui si fa quella
// traduzione (`listonePlayerKey`, la STESSA chiave con cui un acquisto viene
// registrato) e nient'altro: nessun DOM, nessuna stringa da mostrare, nessun
// numero calcolato che non venga da `freeLadder()`.
//
// ─── LA MEMOIZZAZIONE, E PERCHÉ QUI SERVE DAVVERO ───────────────────────────
//
// `render()` in src/main.ts azzera e ricostruisce l'intero DOM A OGNI TASTO
// della ricerca giocatore. La scala dei liberi è una passata sul listone (532
// righe) più una passata sull'ordine di ogni ruolo: rifarla a ogni tasto
// significa rifare centinaia di volte a sera un lavoro il cui risultato cambia
// soltanto quando qualcuno compra.
//
// LO STAMPO È QUELLO DI `buildTierBook` (src/tierOrdering.ts), riusato e non
// reinventato, con la stessa garanzia MECCANICA al posto della promessa: il
// calcolo vero vive in `computeLadder`, che riceve `(pool, book,
// purchasedPlayerIds)` — cioè ESATTAMENTE la chiave della cache — e
// nient'altro. Non riceve `AuctionState`, quindi non può leggere i budget; non
// riceve il chiamato, quindi non può dipendere dal tasto premuto. La domanda
// «è ancora valida?» ha una risposta meccanica, e una dipendenza nuova non può
// entrare di soppiatto: chi la volesse dovrebbe allargare QUELLA firma, che è
// la riga sopra la cache.
//
// ─── DOVE LA CHIAVE È DIVERSA DA QUELLA DEL LIBRO, E PERCHÉ ─────────────────
//
// Il libro delle fasce NON dipende dal log — un acquisto non riordina il
// listone — e infatti la sua chiave è `(pool, source, teamsCount)`. La scala
// dei liberi invece dipende dal log per definizione: è la definizione stessa di
// «relativo». Quindi la chiave porta anche CHI È STATO PRESO, e lo porta PER
// CONTENUTO e non per identità:
//
//   - `AuctionState` è ricostruito da `reduce()` a ogni render (vedi
//     `deriveAuctionState()` in src/main.ts), quindi `purchasedPlayerIds` è un
//     array NUOVO a ogni tasto: confrontarne l'identità darebbe zero riuso,
//     cioè una cache che non è una cache;
//   - `reduce()` lo restituisce ORDINATO (`purchased.slice().sort()`), quindi
//     il confronto elemento per elemento è ESATTO e non euristico: due liste
//     uguali elemento per elemento sono lo stesso insieme di presi. Costa al
//     più 224 confronti di stringa (8 squadre × 28 slot, il tavolo pieno),
//     contro una ricostruzione che passa su 532 righe più gli ordini: il
//     confronto è di un ordine di grandezza più corto del lavoro che evita.
//
// Il `book` sta nella chiave per IDENTITÀ, e basta: viene da `buildTierBook`,
// che è a sua volta memoizzato: se cambia il listone, la sorgente o il numero
// di squadre al tavolo, quello restituisce un oggetto DIVERSO e la voce scade
// da sola. Non c'è bisogno di ricopiare `source` e `teamsCount` qui — sarebbe
// una seconda copia della stessa chiave, destinata a divergere.
//
// `poolRows` è la stessa CINTURA di `buildTierBook`, per la stessa ragione
// scritta là: `state.pool` è tipato `ListonePlayer[]`, quindi una `push`
// resterebbe legale per il compilatore anche se oggi nessuno la scrive.

import {
  freeLadder,
  type FreeLadder,
  type RelativeIndexPoolRow,
} from "../packages/engine/src/relativeIndex.js";
import type { TierBook } from "../packages/engine/src/tiers.js";
import { listonePlayerKey, type ListonePlayer } from "./ui/listone.js";

/**
 * IL CALCOLO VERO, e la ragione per cui la cache è dimostrabile invece che
 * promessa: questa funzione vede `(pool, book, purchasedPlayerIds)` e
 * NIENT'ALTRO, cioè esattamente la chiave con cui il risultato viene
 * conservato. La traduzione delle righe in identità dell'event log sta qui
 * dentro di proposito — è il pezzo di lavoro lineare sul listone, e farla
 * fuori significherebbe pagarla a ogni tasto anche quando la cache colpisce.
 */
function computeLadder(
  pool: readonly ListonePlayer[],
  book: TierBook | null,
  purchasedPlayerIds: readonly string[],
): FreeLadder {
  const rows: RelativeIndexPoolRow[] = pool.map((row) => ({
    playerId: listonePlayerKey(row),
    role: row.role,
  }));
  return freeLadder({ pool: rows, book, purchasedPlayerIds });
}

/** Cosa la scala conservata è stata costruita CON. Se uno solo di questi non
 *  combacia, la voce non vale e si ricalcola. Il pezzo restante della chiave —
 *  il `pool` — è la chiave stessa della WeakMap, per IDENTITÀ di riferimento. */
interface FreeLadderCacheEntry {
  readonly book: TierBook | null;
  readonly purchasedPlayerIds: readonly string[];
  readonly poolRows: number;
  readonly ladder: FreeLadder;
}

/**
 * LA CACHE. Una `WeakMap` sul `pool`, come quella del libro e per le stesse
 * tre ragioni: per identità (il listone viene SOSTITUITO, mai mutato in loco),
 * weak (un listone sostituito diventa raccoglibile insieme alla sua voce), una
 * voce sola (non c'è un secondo listone vivo nella stessa schermata).
 *
 * `FreeLadder` è profondamente in sola lettura per tipo (`ReadonlyMap`,
 * `ReadonlySet`), quindi restituire lo STESSO oggetto a più chiamanti non è un
 * rischio di mutazione condivisa.
 */
let ladderCache = new WeakMap<readonly ListonePlayer[], FreeLadderCacheEntry>();

/** Quante volte la scala è stata davvero costruita e quante volte riusata.
 *  Esiste per essere ASSERITO: «un tasto nella ricerca non ricalcola» si prova
 *  contando, non guardando un cronometro (src/relativeIndex.cache.test.ts). */
let ladderBuilds = 0;
let ladderHits = 0;

/** I due contatori della cache della scala. Vedi `ladderBuilds`/`ladderHits`. */
export function freeLadderCacheStats(): { readonly builds: number; readonly hits: number } {
  return { builds: ladderBuilds, hits: ladderHits };
}

/** Svuota cache e contatori. Serve ai test per partire da uno stato noto: la
 *  cache è un modulo singleton, e un test che eredita la voce del test
 *  precedente misura la storia invece del proprio caso. */
export function resetFreeLadderCache(): void {
  ladderCache = new WeakMap<readonly ListonePlayer[], FreeLadderCacheEntry>();
  ladderBuilds = 0;
  ladderHits = 0;
}

/** Due liste di presi sono la stessa lista? Confronto ESATTO elemento per
 *  elemento — `reduce()` le restituisce ordinate, quindi l'ordine non è un
 *  dettaglio da normalizzare ma una garanzia su cui poggiare. */
function samePurchased(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * La scala dei liberi per questo listone, questo ordine e questo stato di
 * mercato.
 *
 * MEMOIZZATA su `(pool per identità, book per identità, presi per contenuto)`.
 * Quella terna è la lista COMPLETA degli ingressi di `computeLadder`, che è la
 * sola funzione che calcola: non è una scommessa sul fatto che il resto non
 * conti, è tutto ciò che esiste da contare.
 */
export function buildFreeLadder(
  pool: readonly ListonePlayer[],
  book: TierBook | null,
  purchasedPlayerIds: readonly string[],
): FreeLadder {
  const cached = ladderCache.get(pool);
  if (
    cached !== undefined &&
    cached.book === book &&
    cached.poolRows === pool.length &&
    samePurchased(cached.purchasedPlayerIds, purchasedPlayerIds)
  ) {
    ladderHits += 1;
    return cached.ladder;
  }
  ladderBuilds += 1;
  const ladder = computeLadder(pool, book, purchasedPlayerIds);
  ladderCache.set(pool, {
    book,
    // La lista si CONSERVA COPIATA: è un `readonly string[]` per il tipo, ma
    // conservare il riferimento significherebbe confrontare una voce con un
    // array che qualcuno potrebbe aver mutato nel frattempo — cioè un confronto
    // che torna sempre vero. Copiarla costa 224 puntatori una volta per
    // acquisto, ed è il prezzo di una cintura che non si slaccia da sola.
    purchasedPlayerIds: purchasedPlayerIds.slice(),
    poolRows: pool.length,
    ladder,
  });
  return ladder;
}

/**
 * La STESSA scala, calcolata senza guardare né toccare la cache.
 *
 * È il termine di paragone del test di trasparenza — la copia non memoizzata
 * contro cui si confronta quella memoizzata passo per passo su una sequenza
 * lunga di eventi misti (stessa idea di `buildTierBookUncached` e di
 * `opportunityRadarReference.ts` nel motore). Non ha altri chiamanti e non deve
 * averne: l'app usa `buildFreeLadder`.
 */
export function buildFreeLadderUncached(
  pool: readonly ListonePlayer[],
  book: TierBook | null,
  purchasedPlayerIds: readonly string[],
): FreeLadder {
  return computeLadder(pool, book, purchasedPlayerIds);
}

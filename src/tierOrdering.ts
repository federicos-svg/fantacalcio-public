// DAL LISTONE ALLE FASCE — il layer puro che porta il motore delle fasce
// (packages/engine/src/tiers.ts) fino a un dato pronto da mostrare, e che si
// ferma dicendo «non lo so» ogni volta che non c'è un ordine su cui costruirle.
//
// PERCHÉ QUESTO FILE ESISTE. `tiers.ts` è puro, testato e completo, ma non
// conosce il listone dell'app: vuole un `AppealOrdering` GIÀ costruito, con la
// sua provenienza, e i suoi id devono essere la stessa identità dell'event log.
// Questo modulo è esattamente quel ponte, e nient'altro: prende le righe del
// listone come stanno in `src/ui/listone.ts`, ne ricava l'ordine di
// appetibilità, costruisce il libro e chiede al motore i fatti del giocatore
// chiamato. Nessun DOM, nessuna stringa da mostrare, nessuna decisione di
// forma: quelle vivono in src/ui/tierBand.ts, che è l'altra metà del paio ed è
// testabile da solo. Stesso taglio di src/nominationContext.ts e
// src/postPurchaseProjection.ts.
//
// IL MOTORE NON SI TOCCA. `tiers.ts` resta in sola lettura: qui non si
// ricalcola una fascia, non si riordina un avversario, non si somma un prezzo.
// Tutto ciò che questo file produce viene da `buildRoleAppealOrder`,
// `tierBook` e `tierFacts`, che sono importati e non copiati.
//
// L'ORDINE VIENE DAL DATO, MAI DA QUI (decisione di Pico registrata in
// docs/DECISIONS.md del repository privato, 2026-08-16: le fasce si
// costruiscono sull'INDICE DI APPETIBILITÀ). Il punteggio è
// `ListonePlayer.appealIndex.score`, servito dal deposito e già display-only
// nella tabella del listone; la ricetta che l'ha prodotto è
// `appealIndex.recipe`, COPIATA dalle righe e mai scritta a mano; il criterio
// di rottura dei pareggi è `APPEAL_ORDER_TIE_BREAK`, che è del motore. Nessun
// valore di appetibilità vive in questo repository e nessuno deve viverci.
//
// FAIL-CLOSED, MA MAI CON UN'ECCEZIONE IN FACCIA ALL'OPERATORE. `tierBook()`
// LANCIA su un ordinamento incoerente — è la sua postura, ed è quella giusta
// per una libreria. In mezzo a un'asta, però, una eccezione non gestita fa
// sparire la schermata: qui il lancio viene raccolto e diventa un esito
// dichiarato (`ordering-refused`) che il pannello sa dire a parole. Fail-closed
// resta fail-closed — nessuna fascia viene mostrata — ma il guasto lo si legge
// invece di subirlo.
//
// NESSUN OUTPUT DIRETTIVO (docs/NO_GO.md §Prodotto). Questo file non produce
// prezzi attesi, bande, punteggi compositi, ranking di intensità né
// raccomandazioni: rende `TierFacts` così com'è, e `TierFacts` ha un insieme di
// chiavi CHIUSO, verificato da packages/engine/tests/tiers.test.ts
// §"anti-scope-creep". L'unica cosa che si aggiunge è la NUMEROSITÀ
// dell'ordine (quante righe hanno un verdetto su quante), che è un conteggio
// delle righe caricate e non un giudizio su nessuno.
//
// COSTO, E PERCHÉ ORA C'È UNA CACHE (era: «il libro si ricostruisce a ogni
// chiamata»). Il libro è una passata su tutto il listone (`listonePlayerKey`
// per riga) più quattro filtri e quattro ordinamenti, uno per ruolo. Su 532
// righe sono 0,6-0,9 ms MISURATI, e l'intero giro per tasto (libro + fatti)
// 0,8-1,7 ms — banco in src/tierOrdering.perfScenario.ts. `render()` in
// src/main.ts azzera e ricostruisce l'intero DOM a OGNI TASTO della ricerca
// giocatore: quel lavoro veniva rifatto identico centinaia di volte a sera,
// e cresce con N log N.
//
// L'obiezione originale a una cache era giusta e resta in piedi: «uno stato
// nascosto e una domanda in più — è ancora valida?». La risposta non è una
// promessa, è una FIRMA. Il calcolo vero vive in `computeTierBook`, che riceve
// SOLO `(pool, source, teamsCount)` — cioè esattamente e soltanto la chiave
// della cache. Non può leggere il log, non può leggere le riconferme, non può
// leggere le rose: non li ha. La domanda «è ancora valida?» ha quindi una
// risposta meccanica invece che disciplinare, e una dipendenza nuova non può
// entrare di soppiatto — chi la volesse dovrebbe allargare quella firma, che è
// la riga sopra la cache.
//
// `buildTierBook` resta la porta pubblica con la firma di prima
// (`pool, source, state`): deriva `teamsCount` da `state.teams` come ha sempre
// fatto — vedi il suo commento — e delega. `tierFacts` NON è memoizzato ed è
// giusto così: dipende dal log, dalle riconferme e dalla riga chiamata, è
// lineare sul log (224 acquisti) e sulle rose, e metterlo in cache
// significherebbe una chiave che quelle tre cose deve inseguire.

import type { AuctionEvent, AuctionState, Role } from "../packages/engine/src/types.js";
import {
  APPEAL_ORDER_TIE_BREAK,
  buildRoleAppealOrder,
  tierBook,
  tierFacts,
  type AppealOrderProvenance,
  type AppealScoreEntry,
  type RoleAppealOrder,
  type TierBook,
  type TierFacts,
} from "../packages/engine/src/tiers.js";
import { ROLES } from "../packages/engine/src/types.js";
import {
  listonePlayerKey,
  type ListonePlayer,
  type ListonePoolSource,
} from "./ui/listone.js";

/**
 * Da dove arrivano le righe che portano l'indice, in parole e non in sigla —
 * `provenance.source` finisce a schermo accanto alla fascia (condizione
 * vincolante 1 del record 2026-08-16), e «remote» non dice niente a nessuno.
 *
 * È una traduzione di un valore che l'app conosce già (`ListonePoolSource`,
 * deciso da `resolveListonePool`), non una dichiarazione nuova: se un giorno
 * le sorgenti diventano cinque, il compilatore chiede questa riga in più
 * invece di lasciare passare una provenienza vuota.
 */
export const APPEAL_ORDER_SOURCE_LABELS: Readonly<Record<ListonePoolSource, string>> = {
  remote: "indice di appetibilità del listone servito dal deposito privato",
  static: "indice di appetibilità del listone statico incluso nell'app",
  "local-storage": "indice di appetibilità del listone salvato in questo browser",
  manual: "indice di appetibilità del listone caricato a mano",
  none: "indice di appetibilità di un listone di sorgente non dichiarata",
};

/** Perché non esiste una fascia da mostrare. Cinque motivi DISTINTI: sono
 *  cinque frasi diverse a schermo, e appiattirli sarebbe già mezza bugia. */
export type TierBandUnavailable =
  /** Nessuna riga caricata: non c'è niente da ordinare. */
  | "no-pool"
  /** Righe caricate, ma nessuna porta l'indice di appetibilità. */
  | "no-index"
  /** Righe con indice ma più di una ricetta: la provenienza non è dichiarabile. */
  | "mixed-recipe"
  /** Il motore ha rifiutato l'ordinamento (duplicati, ruoli, provenienza). */
  | "ordering-refused"
  /** Nessuna squadra al tavolo: la larghezza di una fascia non ha censimento. */
  | "no-table";

/** Quante righe del listone hanno davvero un verdetto dell'indice. La
 *  numerosità viaggia col dato, come nei precedenti d'asta: un ordine su 4
 *  righe su 532 e uno su 532 su 532 non sono la stessa affermazione. */
export interface TierOrderingCoverage {
  readonly poolRows: number;
  readonly withVerdict: number;
}

/**
 * Il dato completo per il riquadro. Tre esiti, e nessuno dei tre è un pannello
 * vuoto: «nessun chiamato», «non ho un ordine» (col motivo) e «ecco i fatti».
 */
export type TierBandReading =
  | { readonly kind: "no-call" }
  | {
      readonly kind: "unavailable";
      readonly reason: TierBandUnavailable;
      /** Dettaglio misurato del rifiuto (le violazioni del motore); `""` se non ce n'è. */
      readonly detail: string;
      readonly coverage: TierOrderingCoverage;
    }
  | {
      readonly kind: "facts";
      readonly facts: TierFacts;
      readonly coverage: TierOrderingCoverage;
    };

/** Il libro costruito, oppure il motivo per cui non esiste. */
export type TierBookOutcome =
  | { readonly kind: "book"; readonly book: TierBook; readonly coverage: TierOrderingCoverage }
  | {
      readonly kind: "unavailable";
      readonly reason: TierBandUnavailable;
      readonly detail: string;
      readonly coverage: TierOrderingCoverage;
    };

export interface TierBandInput {
  /** Le righe del listone come sono a schermo (src/ui/listone.ts). */
  readonly pool: readonly ListonePlayer[];
  /** Quale sorgente le ha prodotte: diventa `provenance.source`. */
  readonly source: ListonePoolSource;
  /** Stato derivato dal log (rose, budget, slot, già venduti). */
  readonly state: AuctionState;
  /** Il log grezzo: i PREZZI stanno lì, non nello stato derivato. */
  readonly log: readonly AuctionEvent[];
  /** Il giocatore chiamato, con la stessa identità dell'event log; `null` se non ce n'è. */
  readonly called: { readonly playerId: string; readonly role: Role } | null;
  /** La propria squadra, esclusa dagli avversari del motore. */
  readonly selfId: string;
}

/** Quante righe portano un punteggio utilizzabile. `null`/non finito = nessun
 *  verdetto, esattamente come lo intende `buildRoleAppealOrder`. */
function coverageOf(pool: readonly ListonePlayer[]): TierOrderingCoverage {
  let withVerdict = 0;
  for (const row of pool) {
    const score = row.appealIndex?.score;
    if (score !== undefined && score !== null && Number.isFinite(score)) withVerdict += 1;
  }
  return { poolRows: pool.length, withVerdict };
}

/**
 * IL CALCOLO VERO, e la ragione per cui la cache qui sopra è dimostrabile
 * invece che promessa: questa funzione vede `(pool, source, teamsCount)` e
 * NIENT'ALTRO, cioè esattamente la chiave con cui il risultato viene
 * conservato. Non riceve `AuctionState`, quindi non può leggere le rose; non
 * riceve il log né le riconferme, quindi non può dipendere da un acquisto.
 * Aggiungere una dipendenza significa allargare QUESTA firma — e chi la
 * allarga trova la cache tre righe sopra il proprio cursore.
 *
 * `teamsCount` arriva già derivato da `buildTierBook` (vedi il suo commento):
 * non è mai un parametro del chiamante esterno.
 */
function computeTierBook(
  pool: readonly ListonePlayer[],
  source: ListonePoolSource,
  teamsCount: number,
): TierBookOutcome {
  const coverage = coverageOf(pool);
  const refuse = (reason: TierBandUnavailable, detail = ""): TierBookOutcome => ({
    kind: "unavailable",
    reason,
    detail,
    coverage,
  });

  if (pool.length === 0) return refuse("no-pool");

  const recipes = [...new Set(pool.flatMap((p) => (p.appealIndex ? [p.appealIndex.recipe] : [])))];
  if (recipes.length === 0) return refuse("no-index");
  // `validateListonePool` rifiuta già un listone con due ricette
  // (`inconsistent-appeal-index`), quindi questo ramo non si raggiunge dalle
  // sorgenti ordinarie. Resta perché la funzione è pubblica e perché la
  // provenienza va DICHIARATA: con due ricette non si può dire quale ha
  // prodotto l'ordine, e una provenienza indecidibile non è una provenienza.
  if (recipes.length > 1) {
    return refuse("mixed-recipe", [...recipes].sort().join(" / "));
  }

  if (teamsCount < 1) return refuse("no-table");

  const provenance: AppealOrderProvenance = {
    source: APPEAL_ORDER_SOURCE_LABELS[source],
    recipe: recipes[0]!,
    tieBreak: APPEAL_ORDER_TIE_BREAK,
  };

  // Un ruolo per volta, e solo i ruoli che hanno almeno una riga: un ruolo
  // dichiarato con la lista vuota direbbe «ordinato, nessuno dentro», cioè
  // `unranked` per tutti, mentre la verità è «per questo ruolo non ho ordine»
  // — che nel motore è `role-not-ordered`, un esito diverso.
  const roles: RoleAppealOrder[] = [];
  for (const role of ROLES) {
    const entries: AppealScoreEntry[] = pool
      .filter((row) => row.role === role)
      .map((row) => ({ playerId: listonePlayerKey(row), score: row.appealIndex?.score ?? null }));
    if (entries.length === 0) continue;
    roles.push(buildRoleAppealOrder(role, entries));
  }

  try {
    // `pool` non viene passato a `tierBook` come listone di controllo: le sue
    // verifiche `unknown-player`/`role-mismatch` confronterebbero l'ordine con
    // sé stesso (è costruito da queste stesse righe) e non potrebbero mai
    // fallire. Restano attivi i controlli che qui possono davvero mordere —
    // provenienza incompleta, ruolo doppio, id vuoto, id duplicato — ed è
    // l'ultimo che conta: due righe di listone con lo stesso nome e lo stesso
    // club producono la stessa chiave, e su un ordine ambiguo non si mostrano
    // fasce.
    const book = tierBook({ provenance, roles }, { teamsCount });
    return { kind: "book", book, coverage };
  } catch (err) {
    return refuse("ordering-refused", err instanceof Error ? err.message : String(err));
  }
}

/** Cosa il libro conservato è stato costruito CON: se uno solo di questi non
 *  combacia, la voce non vale e si ricalcola. Il pezzo restante della chiave —
 *  il `pool` — è la chiave stessa della WeakMap, per IDENTITÀ di riferimento.
 *
 *  `poolRows` è una CINTURA, non parte della chiave logica: l'identità del
 *  `pool` basta finché quell'array viene SOSTITUITO e mai modificato in loco,
 *  che è come `src/main.ts` lo tratta oggi (verificato su tutti i suoi punti di
 *  assegnazione) e come i tipi lo incoraggiano (`ListonePlayer` ha ogni campo
 *  `readonly`). Il tipo dell'array però è `ListonePlayer[]`, non
 *  `readonly ListonePlayer[]`: una `push` resterebbe legale per il compilatore.
 *  Confrontare anche la lunghezza costa un intero e fa scadere la voce nell'unica
 *  forma di mutazione in loco che qualcuno scriverebbe davvero. */
interface TierBookCacheEntry {
  readonly source: ListonePoolSource;
  readonly teamsCount: number;
  readonly poolRows: number;
  readonly outcome: TierBookOutcome;
}

/**
 * LA CACHE. Una `WeakMap` sul `pool`, non una `Map` su un hash.
 *
 *  - **Per identità, non per contenuto.** `state.pool` viene SOSTITUITO (mai
 *    mutato in loco: verificato su tutti i suoi punti di assegnazione in
 *    src/main.ts) quando il listone si ricarica, quindi `===` è già la domanda
 *    giusta. Un hash del contenuto costerebbe una passata su 532 righe a ogni
 *    tasto, cioè esattamente il lavoro che si vuole togliere.
 *  - **Weak, così non trattiene niente.** Un listone sostituito diventa
 *    spazzatura raccoglibile insieme alla sua voce; una `Map` normale terrebbe
 *    in vita ogni listone mai caricato nella sessione.
 *  - **Una voce per pool.** Non c'è un secondo listone vivo nella stessa
 *    schermata: `source` e `teamsCount` si confrontano, non si indicizzano.
 *
 * `TierBookOutcome` è profondamente in sola lettura per tipo (`TierBook` ha
 * `ReadonlyMap` e array `readonly`), quindi restituire lo STESSO oggetto a più
 * chiamanti non è un rischio di mutazione condivisa.
 */
let bookCache = new WeakMap<readonly ListonePlayer[], TierBookCacheEntry>();

/** Quante volte il libro è stato davvero costruito e quante volte riusato.
 *  Esiste per essere ASSERITO: «un tasto nella ricerca non ricalcola» si prova
 *  contando, non guardando un cronometro (src/tierOrdering.cache.test.ts). */
let bookBuilds = 0;
let bookHits = 0;

/** I due contatori della cache del libro. Vedi `bookBuilds`/`bookHits`. */
export function tierBookCacheStats(): { readonly builds: number; readonly hits: number } {
  return { builds: bookBuilds, hits: bookHits };
}

/** Svuota cache e contatori. Serve ai test per partire da uno stato noto: la
 *  cache è un modulo singleton, e un test che eredita la voce del test
 *  precedente misura la storia invece del proprio caso. */
export function resetTierBookCache(): void {
  bookCache = new WeakMap<readonly ListonePlayer[], TierBookCacheEntry>();
  bookBuilds = 0;
  bookHits = 0;
}

/**
 * Il libro delle fasce a partire dalle righe caricate, o il motivo per cui non
 * c'è.
 *
 * `teamsCount` NON è un parametro: è `Object.keys(state.teams).length`, cioè
 * esattamente il censimento che `tierFacts()` riconfronta col libro. Passandolo
 * dal chiamante si potrebbe costruire un libro largo otto e interrogarlo su un
 * tavolo da dieci — il caso che `tierFacts()` respinge con un lancio. Derivarlo
 * qui rende quel lancio impossibile per costruzione invece che improbabile per
 * disciplina.
 *
 * MEMOIZZATO su `(pool per identità, source, teamsCount)`. Quella terna è la
 * lista COMPLETA degli ingressi di `computeTierBook`, che è la sola funzione
 * che calcola: non è una scommessa sul fatto che il resto non conti, è tutto
 * ciò che esiste da contare. In particolare il LOG non entra nella chiave
 * perché non entra nel calcolo — le fasce sono l'ordine del listone per indice
 * di appetibilità, e un acquisto non riordina il listone. Ciò che un acquisto
 * cambia sono i FATTI (`tierFacts`: occupazione, prezzi pagati, avversari), che
 * non sono memoizzati e si rifanno a ogni chiamata. Il numero a schermo cambia
 * dopo un acquisto: è il libro sotto che non ha motivo di cambiare, e
 * `src/tierOrdering.cache.test.ts` prova entrambe le metà.
 */
export function buildTierBook(
  pool: readonly ListonePlayer[],
  source: ListonePoolSource,
  state: AuctionState,
): TierBookOutcome {
  const teamsCount = Object.keys(state.teams).length;
  const cached = bookCache.get(pool);
  if (
    cached !== undefined &&
    cached.source === source &&
    cached.teamsCount === teamsCount &&
    cached.poolRows === pool.length
  ) {
    bookHits += 1;
    return cached.outcome;
  }
  bookBuilds += 1;
  const outcome = computeTierBook(pool, source, teamsCount);
  bookCache.set(pool, { source, teamsCount, poolRows: pool.length, outcome });
  return outcome;
}

/**
 * Lo STESSO libro, calcolato senza guardare né toccare la cache.
 *
 * È il termine di paragone del test di trasparenza — la copia non memoizzata
 * contro cui si confronta quella memoizzata passo per passo su una sequenza
 * lunga di eventi misti (stessa idea di `opportunityRadarReference.ts` nel
 * motore). Non ha altri chiamanti e non deve averne: l'app usa `buildTierBook`.
 */
export function buildTierBookUncached(
  pool: readonly ListonePlayer[],
  source: ListonePoolSource,
  state: AuctionState,
): TierBookOutcome {
  return computeTierBook(pool, source, Object.keys(state.teams).length);
}

/**
 * I fatti di fascia del giocatore chiamato, pronti da mostrare.
 *
 * Puro e deterministico: stessi ingressi → stessa uscita. Non legge orologi,
 * non tocca lo storage, non conosce il DOM.
 */
export function tierBandReading(input: TierBandInput): TierBandReading {
  const { pool, source, state, log, called, selfId } = input;
  if (called === null) return { kind: "no-call" };

  const outcome = buildTierBook(pool, source, state);
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

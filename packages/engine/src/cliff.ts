// CLIFF / drop-off sulla scala delle ancore — riga 2 di
// docs/AUCTION_COPILOT_STRATEGY_DESIGN.md §8 («tensione, cliff, finestra,
// insieme eleggibile»), driver di §4.1/§4.2. Puro, deterministico, engine-only.
//
// LA DOMANDA: «quanto separa questo giocatore dal prossimo disponibile
// accettabile del suo ruolo?» (design §3/§8). La scala su cui si misura è
// quella delle ANCORE REALI (Qt.A del listone) — un fatto misurato — non un
// valore di modello e non il valore dichiarato di Owner: nessuno dei due entra
// in questo file. Il dislivello è in crediti di listino, e si dice da dove
// viene.
//
// COSA NON C'È, di proposito:
//  - nessuna «fascia» (A1/A2/…): una fascia è un raggruppamento arbitrario che
//    il sistema sceglierebbe da sé — esattamente il peso nascosto vietato da
//    docs/DECISIONS.md §D9. Qui si contano i giocatori sopra e sotto un'ancora
//    misurata, senza inventare confini di categoria;
//  - nessuna stima di quanto durerà il giocatore sul mercato: sarebbe una
//    predizione (vedi nominationWindow.ts per la forma deterministica);
//  - nessun intervallo di prezzo.

import { type AuctionState, type Role, ROLES } from "./types.js";
import { type AnchorBook } from "./anchors.js";

/**
 * Quota del dislivello, rispetto all'ancora del giocatore, oltre la quale il
 * salto verso la migliore alternativa disponibile si chiama cliff.
 * Soglia PRE-DICHIARATA (§5: «la regola si fissa ora, mai la sera dell'asta»),
 * esportata perché chi la legge in UI e chi la verifica nei test usino la
 * stessa costante e non due copie che divergono.
 */
export const CLIFF_GAP_RATIO = 0.3;

export type CliffShape =
  | "gap-below" // esiste un'alternativa a quota <= la sua: il dislivello è misurabile
  | "bottom-of-ladder" // nessuna alternativa a quota <= la sua, ma ce ne sono di più care
  | "last-of-role"; // non resta nessun altro giocatore del ruolo con un'ancora

export interface CliffFacts {
  readonly playerId: string;
  readonly role: Role;
  /** Qt.A del giocatore — fatto misurato. */
  readonly anchor: number;
  /** Il giocatore è ancora sul mercato? (venduto o riconfermato ⇒ false) */
  readonly playerAvailable: boolean;
  /** Giocatori ancorati del ruolo ancora disponibili, ESCLUSO questo. */
  readonly othersAvailableInRole: number;
  /** Fra quelli, quanti hanno un'ancora strettamente più alta. */
  readonly betterAvailable: number;
  /** Fra quelli, quanti hanno un'ancora <= la sua: le alternative "a scendere". */
  readonly alternativesAtOrBelow: number;
  /** L'ancora della migliore alternativa a quota <= la sua, o `null` se non esiste. */
  readonly nextAlternativeAnchor: number | null;
  /** anchor − nextAlternativeAnchor, in crediti di listino. `null` senza alternativa. */
  readonly gap: number | null;
  /** gap / anchor. `null` senza alternativa o con ancora 0 (rapporto non definito). */
  readonly gapRatio: number | null;
  readonly shape: CliffShape;
  readonly isCliff: boolean;
}

/**
 * LA SCALA, preparata una volta sola: per ogni ruolo le Qt.A dei giocatori
 * ancora disponibili in ordine crescente, più l'insieme dei fuori mercato.
 *
 * Perché esiste (PERF-T008). La domanda del cliff è sempre la stessa — «quanti
 * stanno sopra, quanti sotto, e qual è il più alto fra quelli sotto» — e la
 * risposta si legge su una scala che, a stato fermo, **non cambia fra un
 * giocatore e l'altro**. Ricostruirla a ogni interrogazione (un `Set` dei
 * venduti + tre filtri sull'intero listino) rende quadratico chi interroga il
 * cliff su molti giocatori: misurato su `opportunityRadar`, 269 candidati su un
 * listone da 600 righe costavano 4,7 ms e 3,6 MB di heap per chiamata, quasi
 * tutti spesi a ricalcolare la stessa scala 269 volte.
 *
 * Preparata una volta, ogni interrogazione diventa due ricerche binarie. La
 * REGOLA non cambia di una virgola: `cliffFacts` resta il punto d'ingresso
 * singolo e continua a rispondere esattamente gli stessi numeri (vedi
 * `opportunityRadar.perf.test.ts`, che confronta l'output con la copia
 * congelata della versione precedente su tutta la griglia di dimensioni).
 */
export interface CliffLadder {
  readonly book: AnchorBook;
  /** Fuori mercato: venduti e riconfermati insieme, come vuole la regola. */
  readonly purchased: ReadonlySet<string>;
  /** Qt.A dei DISPONIBILI di ogni ruolo, crescenti. Include il giocatore stesso. */
  readonly availableByRole: Readonly<Record<Role, readonly number[]>>;
}

export function cliffLadder(book: AnchorBook, state: AuctionState): CliffLadder {
  const purchased = new Set(state.purchasedPlayerIds);
  const availableByRole: Record<Role, number[]> = { P: [], D: [], C: [], A: [] };
  for (const a of book.all) {
    if (!purchased.has(a.playerId)) availableByRole[a.role].push(a.quotation);
  }
  for (const role of ROLES) {
    // `-0` prima di `+0` a parità: così l'ultimo elemento di un blocco di zeri
    // è `+0`, esattamente il valore che restituirebbe `Math.max`. Serve solo a
    // tenere l'identità dell'output anche su questo caso di bordo.
    availableByRole[role].sort(
      (x, y) => x - y || (Object.is(x, -0) ? -1 : 0) - (Object.is(y, -0) ? -1 : 0),
    );
  }
  return { book, purchased, availableByRole };
}

/** Quanti elementi di `sorted` sono strettamente minori di `q`. */
function countBelow(sorted: readonly number[], q: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! < q) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Quanti elementi di `sorted` sono minori o uguali a `q`. */
function countAtOrBelow(sorted: readonly number[], q: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! <= q) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Il massimo fra i pari-ancora del blocco, ESCLUSA la propria occorrenza —
 * cioè esattamente ciò che restituiva `Math.max(...)` sulle alternative a quota
 * `<=` la propria.
 *
 * Fuori dallo zero è banale: gli elementi del blocco sono tutti `=== quotation`
 * e il massimo è `quotation`. **Sullo zero no**, e non è pedanteria: `Math.max`
 * distingue `+0` da `-0` (restituisce `+0` se almeno uno degli argomenti è
 * `+0`), mentre `===`, `<=` e l'ordinamento li trattano come uguali. Ritornare
 * `quotation` e basta faceva divergere DUE campi rispetto alla versione
 * precedente — `nextAlternativeAnchor` **e** `gap` — su un listino contenente
 * una Qt.A `-0`, che `validateAnchors` accetta (`-0 < 0` è falso).
 *
 * Il caso è assurdo ma raggiungibile, e «output identico» o è vero o non lo è:
 * il confronto esaustivo in `cliff.test.ts` lo copre.
 */
function maxOfEqualBlock(
  available: readonly number[],
  below: number,
  atOrBelow: number,
  quotation: number,
  self: number,
): number {
  if (quotation !== 0) return quotation; // nessun segno da distinguere
  let positiveZeros = 0;
  for (let i = below; i < atOrBelow; i++) {
    if (!Object.is(available[i], -0)) positiveZeros++;
  }
  // La propria occorrenza esce dal conto solo se era essa stessa uno `+0`.
  if (self === 1 && !Object.is(quotation, -0)) positiveZeros--;
  return positiveZeros > 0 ? 0 : -0;
}

/**
 * I fatti di dislivello leggendoli su una scala GIÀ PREPARATA. È qui che vive
 * la regola; `cliffFacts` è questa funzione con la scala costruita al volo.
 *
 * Il giocatore, se disponibile, sta dentro `availableByRole` come tutti gli
 * altri: si sottrae la propria occorrenza (`self`) invece di filtrarla via, che
 * è la stessa esclusione di `a.playerId !== playerId`, fatta contando.
 */
export function cliffFactsOn(ladder: CliffLadder, playerId: string): CliffFacts | null {
  const anchor = ladder.book.byPlayerId.get(playerId);
  if (anchor === undefined) return null;

  const quotation = anchor.quotation;
  const available = ladder.availableByRole[anchor.role];
  const playerAvailable = !ladder.purchased.has(playerId);
  const self = playerAvailable ? 1 : 0;

  const below = countBelow(available, quotation);
  const atOrBelowCount = countAtOrBelow(available, quotation);

  const othersAvailableInRole = available.length - self;
  const betterAvailable = available.length - atOrBelowCount;
  const alternativesAtOrBelow = atOrBelowCount - self;

  // Il massimo fra le alternative a quota <= la sua, escluso lui: se resta
  // almeno un pari ancora vale quella quota, altrimenti è l'ultima quota
  // strettamente più bassa, altrimenti non esiste.
  const equalOthers = atOrBelowCount - below - self;
  const nextAlternativeAnchor =
    equalOthers > 0
      ? maxOfEqualBlock(available, below, atOrBelowCount, quotation, self)
      : below > 0
        ? available[below - 1]!
        : null;

  const gap = nextAlternativeAnchor === null ? null : quotation - nextAlternativeAnchor;
  const gapRatio = gap === null || quotation === 0 ? null : gap / quotation;

  const shape: CliffShape =
    othersAvailableInRole === 0
      ? "last-of-role"
      : nextAlternativeAnchor === null
        ? "bottom-of-ladder"
        : "gap-below";

  const isCliff =
    shape === "last-of-role"
      ? true
      : shape === "bottom-of-ladder"
        ? false
        : gapRatio !== null && gapRatio >= CLIFF_GAP_RATIO;

  return {
    playerId,
    role: anchor.role,
    anchor: quotation,
    playerAvailable,
    othersAvailableInRole,
    betterAvailable,
    alternativesAtOrBelow,
    nextAlternativeAnchor,
    gap,
    gapRatio,
    shape,
    isCliff,
  };
}

/**
 * I fatti di dislivello per un giocatore, misurati sui soli giocatori ANCORA
 * DISPONIBILI (`state.purchasedPlayerIds` esclude sia i venduti sia i
 * riconfermati, che sono fuori mercato allo stesso modo).
 *
 * REGOLA DICHIARATA di `isCliff`:
 *  - `last-of-role` → cliff: dopo di lui non resta nessuno di quel ruolo;
 *  - `bottom-of-ladder` → NON cliff: tutto ciò che resta costa di più di lui,
 *    quindi non c'è nessun "salto in giù" da subire prendendolo o perdendolo;
 *  - `gap-below` → cliff se `gapRatio >= CLIFF_GAP_RATIO`.
 * Un pari ancora fra due disponibili produce `gap = 0` e quindi NON cliff: un
 * sostituto perfetto sulla scala delle ancore esiste davvero.
 *
 * Restituisce `null` quando il giocatore non ha ancora: `n/d` esplicito.
 *
 * Interrogazione SINGOLA: costruisce la scala e la butta. Chi interroga il
 * cliff su molti giocatori dello stesso stato usa `cliffLadder` una volta e poi
 * `cliffFactsOn` (è ciò che fa `opportunityRadar`): stessa regola, stessi
 * numeri, senza ricostruire la scala a ogni giro.
 */
export function cliffFacts(
  playerId: string,
  book: AnchorBook,
  state: AuctionState,
): CliffFacts | null {
  return cliffFactsOn(cliffLadder(book, state), playerId);
}

/**
 * Offerta residua ancorata di un ruolo: quanti giocatori di quel ruolo, con
 * ancora nota, restano sul mercato. È il numeratore del driver di scarsità
 * della tensione — un conteggio, non una stima.
 */
export function availableAnchoredInRole(
  role: Role,
  book: AnchorBook,
  state: AuctionState,
): number {
  const purchased = new Set(state.purchasedPlayerIds);
  return book.all.filter((a) => a.role === role && !purchased.has(a.playerId)).length;
}

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

import { type AuctionState, type Role } from "./types.js";
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
 */
export function cliffFacts(
  playerId: string,
  book: AnchorBook,
  state: AuctionState,
): CliffFacts | null {
  const anchor = book.byPlayerId.get(playerId);
  if (anchor === undefined) return null;

  const purchased = new Set(state.purchasedPlayerIds);
  const others = book.all.filter(
    (a) => a.role === anchor.role && a.playerId !== playerId && !purchased.has(a.playerId),
  );

  const betterAvailable = others.filter((a) => a.quotation > anchor.quotation).length;
  const atOrBelow = others.filter((a) => a.quotation <= anchor.quotation);
  const nextAlternativeAnchor =
    atOrBelow.length === 0 ? null : Math.max(...atOrBelow.map((a) => a.quotation));

  const gap = nextAlternativeAnchor === null ? null : anchor.quotation - nextAlternativeAnchor;
  const gapRatio = gap === null || anchor.quotation === 0 ? null : gap / anchor.quotation;

  const shape: CliffShape =
    others.length === 0
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
    anchor: anchor.quotation,
    playerAvailable: !purchased.has(playerId),
    othersAvailableInRole: others.length,
    betterAvailable,
    alternativesAtOrBelow: atOrBelow.length,
    nextAlternativeAnchor,
    gap,
    gapRatio,
    shape,
    isCliff,
  };
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

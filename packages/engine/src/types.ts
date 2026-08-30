// Domain constants & types — Fantacalcio Classic auction (Sprint 1).
// Pure data; no value/modifier/fair-to-me logic lives here (gated, out of Sprint 1).

export type Role = "P" | "D" | "C" | "A";
export const ROLES: readonly Role[] = ["P", "D", "C", "A"] as const;

/** League rule constants (Classic, this lega). Sourced from regolamento. */
export const ROSTER_REQUIREMENTS: Readonly<Record<Role, number>> = {
  P: 3,
  D: 9,
  C: 9,
  A: 7,
};
export const TOTAL_SLOTS = 28; // 3+9+9+7
export const INITIAL_BUDGET = 500; // auction budget; +100 post-asta is NOT live liquidity
export const COST_FLOOR = 1; // minimum viable cost per slot
export const NUM_FANTA_TEAMS = 8;

/** A purchase: a fanta team wins a player at a price. */
export interface PurchaseEvent {
  readonly type: "PURCHASE";
  readonly seq: number; // strictly increasing, assigned on append
  readonly ts: string; // ISO timestamp
  readonly playerId: string;
  readonly role: Role;
  readonly fantaTeamId: string;
  readonly price: number;
  /**
   * Present, and always `true`, ONLY on the single narrow exception to
   * `price >= COST_FLOOR`: LEAGUE_RULES.md §6 lets a team's third (i.e.
   * last) portiere slot complete at 0 credits, but only when the operator
   * explicitly declared — at the table, in the same gesture that recorded
   * this purchase — that the rule's conditions hold (same real club as a
   * portiere already on the roster; no other participant interested). The
   * engine cannot observe either condition itself (see competitors.ts's
   * deliberate refusal to model "interest"), so this field is the operator's
   * declaration, not the engine's inference — see feasibility.ts's
   * `purchaseFeasibility`/`recordPurchase`. Reading the log back later, this
   * field is what explains a 0 next to every other price obeying
   * COST_FLOOR. Absent (never `false`) on every other purchase.
   */
  readonly thirdGoalkeeperZeroDeclared?: true;
}

/** A compensating event that voids a prior event (undo / correction).
 *  We never mutate or delete events — we append a VOID. The target is a
 *  PURCHASE, a RELEASE or a TRADE: every gesture that moves a roster or a
 *  budget is undone the same way, by appending rather than by rewriting. */
export interface VoidEvent {
  readonly type: "VOID";
  readonly seq: number;
  readonly ts: string;
  readonly targetSeq: number; // seq of the event being voided
}

/**
 * Uno SVINCOLO: un giocatore lascia la rosa e una quota di crediti torna al
 * budget di quella squadra.
 *
 * PERCHE I CREDITI SONO UN CAMPO E NON UNA FORMULA. Il regolamento fissa il
 * recupero in un caso solo — l'aggiudicazione oltre budget di
 * LEAGUE_RULES.md §5, dove vale `ceil(prezzo / 2)` — e tace su ogni altro
 * svincolo, che al tavolo si concorda. Calcolare qui il 50% e applicarlo
 * sempre significherebbe far dire al motore una regola che il regolamento non
 * ha: il numero lo DICHIARA chi registra, come il prezzo di un acquisto, e la
 * schermata gli mostra accanto quanto varrebbe il caso §5 senza sceglierlo per
 * lui.
 *
 * Il prezzo pagato all'acquisto NON viene riscritto: resta nel log, dove e un
 * fatto. Quello che cambia e la rosa (una casella si libera) e il budget (di
 * `creditsReturned`, non del prezzo), e la differenza fra i due — i crediti
 * bruciati — e esattamente cio che uno svincolo costa.
 */
export interface ReleaseEvent {
  readonly type: "RELEASE";
  readonly seq: number;
  readonly ts: string;
  readonly playerId: string;
  readonly fantaTeamId: string;
  /** Crediti restituiti al budget: `0 <= creditsReturned <= prezzo pagato`. */
  readonly creditsReturned: number;
}

/**
 * Uno SCAMBIO fra due squadre: giocatori che cambiano rosa, piu un conguaglio.
 *
 * FORMA LIBERA, GUARDIA SUL TOTALE (decisione di Pico, 2026-08-30). Non si
 * impone ne il pareggio numerico ne il pari ruolo: si impone che nessuna delle
 * due rose esca da 3P/9D/9C/7A (LEAGUE_RULES.md §8: «mantenendo sempre la
 * rosa») e che nessun budget vada sotto zero. Il vincolo e sul RISULTATO, non
 * sulla forma della proposta, e vive in `tradeFeasibility`.
 *
 * I giocatori arrivano nella nuova rosa CON IL PREZZO CHE PORTAVANO: il prezzo
 * e la memoria di quanto e costato all'asta, non un valore corrente, e
 * riscriverlo cancellerebbe l'unico fatto che il log conosce. Il budget delle
 * due squadre si muove percio del SOLO conguaglio — vedi il registro dei
 * crediti in reduce().
 */
export interface TradeEvent {
  readonly type: "TRADE";
  readonly seq: number;
  readonly ts: string;
  readonly teamAId: string;
  readonly teamBId: string;
  /** playerId che passano da A a B. */
  readonly fromA: readonly string[];
  /** playerId che passano da B ad A. */
  readonly fromB: readonly string[];
  /** Conguaglio pagato da A a B. Negativo: e B a pagare A. Zero: nessuno. */
  readonly creditsAToB: number;
}

export type AuctionEvent = PurchaseEvent | VoidEvent | ReleaseEvent | TradeEvent;

export interface RosterEntry {
  readonly playerId: string;
  readonly role: Role;
  readonly price: number;
  readonly seq: number;
}

export interface TeamState {
  readonly fantaTeamId: string;
  readonly spent: number;
  readonly budgetResidual: number;
  readonly filled: Record<Role, number>;
  readonly slotsRemaining: Record<Role, number>;
  readonly totalSlotsRemaining: number;
  readonly roster: readonly RosterEntry[];
}

export interface AuctionState {
  readonly teams: Record<string, TeamState>;
  readonly purchasedPlayerIds: readonly string[];
  readonly lastSeq: number;
}

/** A player in the (synthetic, Sprint 1) candidate pool. No value fields used. */
export interface PoolPlayer {
  readonly playerId: string;
  readonly role: Role;
  readonly name: string;
}

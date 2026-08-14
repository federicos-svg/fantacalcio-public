// Deterministic facts backing the read-only "Contesto chiamata" panel
// (D7 — Binario A, docs/DECISIONS.md §Prodotto, and the UI matrix in
// docs/AUCTION_2026_EXECUTION_PLAN.md §3).
//
// Everything here is pure arithmetic over the auction event log:
//  - no model field, no projection, no quotation, no receipt-gated value;
//  - no behavioural index per opponent;
//  - no ranking of candidates to call, and no "chiama X" output — the only
//    ordering produced is over purchases that ALREADY happened;
//  - nothing here feeds `max_safe`, which stays exactly what
//    packages/engine/src/auction.ts maxSafe() computes.
//
// Layer without DOM, so it is unit-testable outside a browser environment —
// same shape as src/logRecovery.ts and src/voidCommand.ts.

import type { AuctionEvent, PurchaseEvent, Role } from "../packages/engine/src/types.js";

/**
 * The PURCHASE events still standing: those not compensated by a VOID.
 * Log order preserved. Mirrors what reduce() considers effective, without
 * rebuilding the whole derived state.
 */
export function effectivePurchases(log: readonly AuctionEvent[]): readonly PurchaseEvent[] {
  const voided = new Set<number>();
  for (const event of log) {
    if (event.type === "VOID") voided.add(event.targetSeq);
  }
  return log.filter(
    (event): event is PurchaseEvent => event.type === "PURCHASE" && !voided.has(event.seq),
  );
}

/** Prices actually paid in a role so far — counts and extremes, nothing derived. */
export interface RolePriceFacts {
  readonly purchases: number;
  /** `null` when nothing has been bought in this role yet — never 0, which
   *  would read as "someone paid zero". */
  readonly minPrice: number | null;
  readonly maxPrice: number | null;
  readonly totalSpent: number;
}

export function rolePriceFacts(log: readonly AuctionEvent[], role: Role): RolePriceFacts {
  const prices = effectivePurchases(log)
    .filter((event) => event.role === role)
    .map((event) => event.price);
  if (prices.length === 0) {
    return { purchases: 0, minPrice: null, maxPrice: null, totalSpent: 0 };
  }
  return {
    purchases: prices.length,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    totalSpent: prices.reduce((sum, price) => sum + price, 0),
  };
}

/** One already-assigned purchase of the role, as shown in the context panel. */
export interface RoleTopPurchase {
  readonly seq: number;
  readonly playerId: string;
  readonly fantaTeamId: string;
  readonly price: number;
}

/**
 * The highest prices ALREADY PAID in this role, from the event log — i.e. the
 * "top di ruolo già assegnati" of D7 Binario A. Descending by price, ties
 * broken by `seq` ascending so the order is total and stable across renders.
 *
 * This orders facts about the past. It is not, and must not become, a ranking
 * of who to call next: the players listed here are exactly the ones no longer
 * callable.
 */
export function roleTopPurchases(
  log: readonly AuctionEvent[],
  role: Role,
  limit: number,
): readonly RoleTopPurchase[] {
  if (limit <= 0) return [];
  return effectivePurchases(log)
    .filter((event) => event.role === role)
    .map((event) => ({
      seq: event.seq,
      playerId: event.playerId,
      fantaTeamId: event.fantaTeamId,
      price: event.price,
    }))
    .sort((a, b) => (b.price - a.price) || (a.seq - b.seq))
    .slice(0, limit);
}

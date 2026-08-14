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
}

/** A compensating event that voids a prior purchase (undo / correction).
 *  We never mutate or delete events — we append a VOID. */
export interface VoidEvent {
  readonly type: "VOID";
  readonly seq: number;
  readonly ts: string;
  readonly targetSeq: number; // seq of the PURCHASE being voided
}

export type AuctionEvent = PurchaseEvent | VoidEvent;

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

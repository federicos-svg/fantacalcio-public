// Hard-safe admission layer — Batch 2.
// maxSafe ADVISES the strongest safe bid; this module ENFORCES that a manually
// entered purchase cannot drive the auction into an impossible state.
// Pure functions; deterministic; no value/price model, no UI, no data.

import {
  type AuctionEvent,
  type AuctionState,
  type PurchaseEvent,
  type VoidEvent,
  type Role,
  COST_FLOOR,
} from "./types.js";
import { appendEvent } from "./events.js";

/** A manual purchase the operator wants to record — before it becomes an event. */
export interface ProposedPurchase {
  readonly playerId: string;
  readonly role: Role;
  readonly fantaTeamId: string;
  readonly price: number;
  /**
   * Operator's explicit declaration, made in the same gesture as this
   * purchase, that LEAGUE_RULES.md §6's zero-cost exception applies: same
   * real club as a portiere already on this team's roster, and no other
   * participant interested. Both are facts about the table this engine
   * cannot observe (competitors.ts deliberately does not model "interest",
   * and PoolPlayer carries no real-club field) — so eligibility here is
   * never inferred, only declared. Declaring it does NOT by itself admit
   * anything: purchaseFeasibility below still requires this purchase to
   * structurally BE the team's third portiere slot. Irrelevant (ignored) on
   * any purchase priced at COST_FLOOR or above.
   */
  readonly declareThirdGoalkeeperZero?: boolean;
}

export type FeasibilityViolation =
  | "unknown-team" // fantaTeamId not in the auction
  | "role-full" // no remaining slot for this role on this team
  | "duplicate-player" // player already won (and not voided) by someone
  | "price-invalid" // price is not an integer (NaN, Infinity, 10.5, ...)
  | "price-below-floor" // price < COST_FLOOR
  | "insufficient-budget" // price exceeds the team's residual budget
  | "breaks-hard-reserve"; // residual after this buy can't fill the OTHER mandatory slots at floor

export interface FeasibilityResult {
  readonly ok: boolean;
  readonly violations: readonly FeasibilityViolation[];
}

/**
 * Checks a proposed purchase against the current derived state.
 * Returns every violation found (not just the first) so the UI can explain why.
 * A purchase is feasible iff it leaves the roster completable: residual minus
 * price must still cover every OTHER still-empty mandatory slot at COST_FLOOR.
 *
 * ONE exception to `price >= COST_FLOOR`: LEAGUE_RULES.md §6, third portiere
 * at 0. It only ever applies when BOTH hold together:
 *  (a) STRUCTURAL, checked here from state — role is "P" and
 *      `team.slotsRemaining.P === 1`, i.e. this purchase completes the
 *      team's third (last) portiere slot. A contested first or second
 *      portiere, or any other role, never qualifies — this is the only
 *      branch price 0 can ever pass through.
 *  (b) DECLARED, never inferred — `proposed.declareThirdGoalkeeperZero ===
 *      true`. The rule's actual conditions (same real club as a portiere
 *      already rostered; no other participant interested) are facts about
 *      the table this engine cannot observe on its own, so it never assumes
 *      them — the operator states them, in the same gesture, at the moment.
 * (a) without (b) still rejects price 0 (a genuinely contested third
 * portiere costs at least COST_FLOOR). (b) without (a) is inert — a
 * declaration attached to any other slot changes nothing. Every price below
 * COST_FLOOR that is not this exact, declared case is rejected exactly as
 * before.
 */
export function purchaseFeasibility(
  state: AuctionState,
  proposed: ProposedPurchase,
): FeasibilityResult {
  const team = state.teams[proposed.fantaTeamId];
  if (!team) {
    return { ok: false, violations: ["unknown-team"] };
  }

  const violations: FeasibilityViolation[] = [];

  const isDeclaredThirdGoalkeeperZero =
    proposed.price === 0 &&
    proposed.role === "P" &&
    team.slotsRemaining.P === 1 &&
    proposed.declareThirdGoalkeeperZero === true;

  // Checked FIRST and separately from the floor: every comparison with NaN is
  // false, so NaN slips past `price < COST_FLOOR`, past the budget check and
  // past the hard reserve, and the whole admission layer reports `ok: true`.
  // A fractional price (10.5) clears them all legitimately. Only the zod
  // schema in appendEvent() rejects both today, one layer further downstream
  // than what callers treat as admission. This does not replace
  // "price-below-floor": a negative fractional price reports both.
  if (!Number.isInteger(proposed.price)) violations.push("price-invalid");
  if (proposed.price < COST_FLOOR && !isDeclaredThirdGoalkeeperZero) {
    violations.push("price-below-floor");
  }
  if (team.slotsRemaining[proposed.role] <= 0) violations.push("role-full");
  if (state.purchasedPlayerIds.includes(proposed.playerId)) {
    violations.push("duplicate-player");
  }
  if (proposed.price > team.budgetResidual) violations.push("insufficient-budget");

  // Hard reserve: buying this player fills one slot now; every OTHER still-empty
  // mandatory slot must remain fillable at the floor.
  const otherSlots = team.totalSlotsRemaining - 1;
  if (otherSlots > 0 && team.budgetResidual - proposed.price < otherSlots * COST_FLOOR) {
    violations.push("breaks-hard-reserve");
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Manual-input contract: turn an operator's proposed purchase into the next
 * append-only event, but ONLY if it is hard-safe feasible. Throws otherwise.
 * `ts` is supplied by the caller (deterministic, testable — no clock here).
 * Returns a NEW log; never mutates the input.
 */
export function recordPurchase(
  log: readonly AuctionEvent[],
  state: AuctionState,
  proposed: ProposedPurchase,
  ts: string,
): readonly AuctionEvent[] {
  const feasibility = purchaseFeasibility(state, proposed);
  if (!feasibility.ok) {
    throw new Error(
      `infeasible purchase (${proposed.playerId} -> ${proposed.fantaTeamId} @ ${proposed.price}): ${feasibility.violations.join(", ")}`,
    );
  }
  const nextSeq = log.length > 0 ? log[log.length - 1]!.seq + 1 : 0;
  // By this point `feasibility.ok` is true, so a price of 0 can only have
  // been admitted through the declared-third-portiere exception above — but
  // this re-checks `declareThirdGoalkeeperZero` explicitly rather than
  // inferring "price === 0 implies declared", so the field written to the
  // log always reflects what the operator actually declared, not what
  // purchaseFeasibility happened to accept it through.
  const event: PurchaseEvent = {
    type: "PURCHASE",
    seq: nextSeq,
    ts,
    playerId: proposed.playerId,
    role: proposed.role,
    fantaTeamId: proposed.fantaTeamId,
    price: proposed.price,
    ...(proposed.price === 0 && proposed.declareThirdGoalkeeperZero === true
      ? { thirdGoalkeeperZeroDeclared: true as const }
      : {}),
  };
  return appendEvent(log, event);
}

export type VoidViolation =
  | "target-not-found" // no event in the log carries this seq
  | "target-not-purchase" // the targeted event is not a PURCHASE (e.g. a VOID)
  | "already-voided"; // a VOID already compensates this seq

export interface VoidFeasibilityResult {
  readonly ok: boolean;
  readonly violations: readonly VoidViolation[];
}

/**
 * Checks whether a PURCHASE at `targetSeq` can be voided/corrected.
 * A void only RELAXES constraints (frees budget + a slot), so it can never make
 * the roster less completable — there is no budget/slot check here, only the
 * structural ones: the target must exist, be a PURCHASE, and not be voided yet.
 * Pure; reads the log only.
 */
export function voidFeasibility(
  log: readonly AuctionEvent[],
  targetSeq: number,
): VoidFeasibilityResult {
  const target = log.find((e) => e.seq === targetSeq);
  if (!target) {
    return { ok: false, violations: ["target-not-found"] };
  }
  const violations: VoidViolation[] = [];
  if (target.type !== "PURCHASE") violations.push("target-not-purchase");
  if (log.some((e) => e.type === "VOID" && e.targetSeq === targetSeq)) {
    violations.push("already-voided");
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Manual correction contract: append a VOID compensating the PURCHASE at
 * `targetSeq`, but ONLY if structurally valid. Throws otherwise.
 * `ts` is supplied by the caller (deterministic — no clock here).
 * Returns a NEW log; never mutates the input. The reducer treats the voided
 * purchase as absent, restoring budget/slots on replay.
 */
export function recordVoid(
  log: readonly AuctionEvent[],
  targetSeq: number,
  ts: string,
): readonly AuctionEvent[] {
  const feasibility = voidFeasibility(log, targetSeq);
  if (!feasibility.ok) {
    throw new Error(
      `infeasible void (target seq ${targetSeq}): ${feasibility.violations.join(", ")}`,
    );
  }
  const nextSeq = log.length > 0 ? log[log.length - 1]!.seq + 1 : 0;
  const event: VoidEvent = { type: "VOID", seq: nextSeq, ts, targetSeq };
  return appendEvent(log, event);
}

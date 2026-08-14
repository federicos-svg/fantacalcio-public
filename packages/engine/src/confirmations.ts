// Pre-auction riconferme (LEAGUE_RULES.md §4) — PURE, engine-only, Sprint 1
// style: no value/price model, no UI, no gate.
//
// A riconferma is NOT a live event. It is known BEFORE the auction starts and
// sets a team's INITIAL state (budget reduced, one slot reduced for the
// confirmed role) that the live event log is then replayed on top of by
// reduce() in reduce.ts. It never enters the append-only AuctionEvent log, so
// the live VOID/undo mechanism (feasibility.ts) stays scoped to actual bids
// placed at the table — a riconferma is corrected by fixing the input batch,
// not by an in-auction undo.
//
// This module only VALIDATES a confirmations batch (fail-closed, structured
// *Violation-style issues — same family as feasibility.ts's
// FeasibilityViolation/VoidViolation). reduce.ts is the single place that
// turns a validated batch into initial roster entries; it refuses (throws) to
// build state from an invalid batch, so it is structurally impossible to
// derive an AuctionState from a confirmations batch that breaks LEAGUE_RULES
// §4 — mirrors how appendEvent's schema check makes a malformed AuctionEvent
// impossible to admit.

import { type Role, INITIAL_BUDGET, COST_FLOOR, TOTAL_SLOTS } from "./types.js";
import { hardReserve } from "./auction.js";

/** Max confirmable slots per role — LEAGUE_RULES.md §4 (canonical, closed). */
export const CONFIRMATION_LIMITS: Readonly<Record<Role, number>> = {
  P: 0,
  D: 1,
  C: 1,
  A: 1,
};

/** One pre-auction riconferma: a player a team keeps at last season's price. */
export interface ConfirmationInput {
  readonly fantaTeamId: string;
  readonly playerId: string;
  readonly role: Role;
  /** Previous season purchase price — deducted from this team's INITIAL_BUDGET. */
  readonly price: number;
}

export type ConfirmationViolation =
  | "unknown-team" // fantaTeamId not among the auction's teams
  | "role-not-confirmable" // role P: max 0 confirmable (LEAGUE_RULES §4)
  | "role-limit-exceeded" // > 1 riconferma for this role on this team (D/C/A)
  | "price-invalid" // price is not an integer >= COST_FLOOR
  | "duplicate-player" // same playerId confirmed more than once (any team)
  | "team-budget-exceeded" // this team's confirmation prices sum > INITIAL_BUDGET
  | "team-hard-reserve-broken"; // this team's residual budget after confirming can't fill every OTHER still-empty mandatory slot at COST_FLOOR — roster not completable at t=0

/** One violation, tied back to the offending input by its batch index. */
export interface ConfirmationIssue {
  readonly index: number;
  readonly fantaTeamId: string;
  readonly playerId: string;
  readonly violation: ConfirmationViolation;
}

export interface ConfirmationValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ConfirmationIssue[];
}

/**
 * Fail-closed validation of a pre-auction riconferme batch against
 * LEAGUE_RULES.md §4. Pure, deterministic, never throws — reports EVERY
 * violation found for a given entry (not just the first), same contract as
 * purchaseFeasibility(). An unknown team short-circuits to that single
 * violation for the entry (nothing else about it can be checked against a
 * team that does not exist), mirroring purchaseFeasibility's early return.
 *
 * `team-budget-exceeded` alone is NOT the engine's hard-safe bound: a batch
 * can spend <= INITIAL_BUDGET and still leave a team's t=0 roster
 * uncompletable (residual budget too small to fill every other still-empty
 * mandatory slot at COST_FLOOR) — the exact invariant `purchaseFeasibility`
 * already enforces for every live purchase via `breaks-hard-reserve`. This
 * reuses the SAME `hardReserve()` (auction.ts) rather than re-deriving the
 * bound, so the two invariants cannot drift apart. When a team's cumulative
 * spend has already tripped `team-budget-exceeded`, the hard-reserve check is
 * skipped for that entry — the residual is already negative, so it would
 * only restate the same problem under a second code.
 */
export function validateConfirmations(
  confirmations: readonly ConfirmationInput[],
  fantaTeamIds: readonly string[],
): ConfirmationValidationResult {
  const issues: ConfirmationIssue[] = [];
  const knownTeams = new Set(fantaTeamIds);
  const seenPlayers = new Set<string>();
  const roleCountByTeam = new Map<string, Record<Role, number>>();
  const spendByTeam = new Map<string, number>();
  const confirmedSlotCountByTeam = new Map<string, number>();

  confirmations.forEach((c, index) => {
    const add = (violation: ConfirmationViolation): void => {
      issues.push({ index, fantaTeamId: c.fantaTeamId, playerId: c.playerId, violation });
    };

    if (!knownTeams.has(c.fantaTeamId)) {
      add("unknown-team");
      return;
    }

    if (c.role === "P") {
      add("role-not-confirmable");
    } else {
      const counts = roleCountByTeam.get(c.fantaTeamId) ?? { P: 0, D: 0, C: 0, A: 0 };
      counts[c.role] += 1;
      roleCountByTeam.set(c.fantaTeamId, counts);
      if (counts[c.role] > CONFIRMATION_LIMITS[c.role]) add("role-limit-exceeded");

      // Every non-P confirmation occupies one roster slot once seeded by
      // reduce() — tracked here (independently of the role-limit outcome) so
      // the hard-reserve bound below matches reality exactly.
      confirmedSlotCountByTeam.set(c.fantaTeamId, (confirmedSlotCountByTeam.get(c.fantaTeamId) ?? 0) + 1);
    }

    const priceValid = Number.isInteger(c.price) && c.price >= COST_FLOOR;
    if (!priceValid) {
      add("price-invalid");
    } else {
      const spend = (spendByTeam.get(c.fantaTeamId) ?? 0) + c.price;
      spendByTeam.set(c.fantaTeamId, spend);
      if (spend > INITIAL_BUDGET) {
        add("team-budget-exceeded");
      } else if (c.role !== "P") {
        const slotsConfirmed = confirmedSlotCountByTeam.get(c.fantaTeamId) ?? 0;
        const slotsRemaining = TOTAL_SLOTS - slotsConfirmed;
        const residual = INITIAL_BUDGET - spend;
        if (residual < hardReserve(slotsRemaining)) add("team-hard-reserve-broken");
      }
    }

    if (seenPlayers.has(c.playerId)) {
      add("duplicate-player");
    } else {
      seenPlayers.add(c.playerId);
    }
  });

  return { ok: issues.length === 0, issues };
}

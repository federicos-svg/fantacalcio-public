import {
  type AuctionEvent,
  type AuctionState,
  type Role,
  type TeamState,
  type RosterEntry,
  ROLES,
  ROSTER_REQUIREMENTS,
  INITIAL_BUDGET,
} from "./types.js";
import { type ConfirmationInput, validateConfirmations } from "./confirmations.js";

function emptyFilled(): Record<Role, number> {
  return { P: 0, D: 0, C: 0, A: 0 };
}

function buildTeam(fantaTeamId: string, roster: RosterEntry[]): TeamState {
  const filled = emptyFilled();
  let spent = 0;
  for (const r of roster) {
    filled[r.role] += 1;
    spent += r.price;
  }
  const slotsRemaining: Record<Role, number> = {
    P: ROSTER_REQUIREMENTS.P - filled.P,
    D: ROSTER_REQUIREMENTS.D - filled.D,
    C: ROSTER_REQUIREMENTS.C - filled.C,
    A: ROSTER_REQUIREMENTS.A - filled.A,
  };
  const totalSlotsRemaining =
    slotsRemaining.P + slotsRemaining.D + slotsRemaining.C + slotsRemaining.A;
  return {
    fantaTeamId,
    spent,
    budgetResidual: INITIAL_BUDGET - spent,
    filled,
    slotsRemaining,
    totalSlotsRemaining,
    roster: roster
      .slice()
      .sort((a, b) => a.seq - b.seq), // deterministic order = purchase order
  };
}

/**
 * Pure, deterministic projection of the event log to current state.
 * VOID events compensate prior PURCHASEs (no mutation, no deletion).
 * Same log -> same state, always.
 *
 * `confirmations` (LEAGUE_RULES.md §4, optional, default none) seed each
 * team's INITIAL roster — budget and one role slot reduced per riconferma —
 * BEFORE the live event log is replayed on top, via the same roster/buildTeam
 * arithmetic an ordinary PURCHASE goes through. They are NOT AuctionEvents:
 * they never enter the append-only log, so the live VOID/undo mechanism
 * (feasibility.ts) stays scoped to actual bids placed at the table, and
 * maxSafe()/hardReserve()/purchaseFeasibility()/budgetPlan() need no change —
 * they only ever see the resulting TeamState. Fail-closed: an invalid
 * confirmations batch throws instead of silently producing a wrong state
 * (see validateConfirmations for the non-throwing check). Omitting
 * `confirmations` (or passing []) reproduces prior behaviour exactly — no
 * regression for existing callers.
 */
export function reduce(
  events: readonly AuctionEvent[],
  fantaTeamIds: readonly string[],
  confirmations: readonly ConfirmationInput[] = [],
): AuctionState {
  if (confirmations.length > 0) {
    const validation = validateConfirmations(confirmations, fantaTeamIds);
    if (!validation.ok) {
      throw new Error(
        `invalid confirmations: ${validation.issues
          .map((i) => `${i.fantaTeamId}/${i.playerId}:${i.violation}`)
          .join(", ")}`,
      );
    }
  }

  const voided = new Set<number>();
  for (const e of events) {
    if (e.type === "VOID") voided.add(e.targetSeq);
  }

  const rosters = new Map<string, RosterEntry[]>();
  for (const id of fantaTeamIds) rosters.set(id, []);

  const purchased: string[] = [];

  // Riconferme seed the roster first, with seq strictly below every live
  // event's seq (>= 0 by schema — see events.ts), so they always sort before
  // any live purchase: deterministic order = confirmations, then bids.
  // `confirmedBy` indexes them by playerId for the O(1) conflict check below.
  const confirmedBy = new Map<string, string>();
  confirmations.forEach((c, index) => {
    rosters.get(c.fantaTeamId)!.push({
      playerId: c.playerId,
      role: c.role,
      price: c.price,
      seq: index - confirmations.length,
    });
    purchased.push(c.playerId);
    confirmedBy.set(c.playerId, c.fantaTeamId);
  });

  let lastSeq = -1;

  // process in seq order for determinism regardless of input ordering
  const ordered = events.slice().sort((a, b) => a.seq - b.seq);
  for (const e of ordered) {
    lastSeq = Math.max(lastSeq, e.seq);
    if (e.type !== "PURCHASE") continue;
    if (voided.has(e.seq)) continue;
    // Confirmations and the live log are validated independently: a riconferma
    // for a player and a live PURCHASE of that same player are each valid on
    // their own, and nothing else sees both. Replaying them together would
    // put the same player on two rosters at once — a silent double count of
    // budget and slots. Fail-closed, same style as the invalid-confirmations
    // throw above, rather than silently producing a wrong state.
    const confirmedTeam = confirmedBy.get(e.playerId);
    if (confirmedTeam !== undefined) {
      throw new Error(
        `confirmations/live-log conflict: playerId "${e.playerId}" already confirmed (team ${confirmedTeam}), cannot also be purchased live by ${e.fantaTeamId}`,
      );
    }
    const roster = rosters.get(e.fantaTeamId);
    if (!roster) {
      throw new Error(`unknown fantaTeamId in log: ${e.fantaTeamId}`);
    }
    roster.push({ playerId: e.playerId, role: e.role, price: e.price, seq: e.seq });
    purchased.push(e.playerId);
  }

  const teams: Record<string, TeamState> = {};
  for (const id of fantaTeamIds) {
    teams[id] = buildTeam(id, rosters.get(id)!);
  }

  return {
    teams,
    purchasedPlayerIds: purchased.slice().sort(),
    lastSeq,
  };
}

export { ROLES };

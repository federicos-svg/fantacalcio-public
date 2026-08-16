import {
  type AuctionState,
  type PoolPlayer,
  type Role,
  type RosterEntry,
  type TeamState,
  ROLES,
  COST_FLOOR,
} from "./types.js";

/**
 * Hard reserve = credits that MUST stay available to fill the given number of
 * still-empty mandatory slots at the cost floor. Pure arithmetic.
 */
export function hardReserve(slotsToReserve: number): number {
  if (slotsToReserve < 0) throw new Error("slotsToReserve must be >= 0");
  return slotsToReserve * COST_FLOOR;
}

export interface MaxSafeResult {
  readonly biddable: boolean;
  readonly maxSafe: number;
  readonly hardReserve: number;
  readonly reason?: string;
}

/**
 * max_safe = budget_residual - hard_reserve, where hard_reserve covers every
 * OTHER still-empty mandatory slot (buying this player fills one slot now).
 * This is the strongest bid that still guarantees a completable roster.
 * DIRECTIVE, aritmetica pura — no value/price model involved.
 *
 * IL TETTO DI UNA OFFERTA — da non confondere col tetto di un REPARTO.
 * Questa funzione riserva gli altri slot obbligatori TUTTI, compresi quelli
 * ancora liberi nel ruolo richiesto: risponde a «quanto posso mettere su
 * QUESTO giocatore». La sua gemella `budgetPlan(team).perRole[r].
 * maxAllocatable` (./budget.ts) riserva solo gli slot obbligatori DEGLI ALTRI
 * ruoli e risponde a «quanto può ancora assorbire l'intero reparto r». Le due
 * coincidono solo quando al reparto resta un solo slot; con s slot liberi la
 * seconda è maggiore di esattamente hardReserve(s − 1). A schermo hanno due
 * nomi distinti apposta — `max bid` e `max reparto`, src/ui/budgetLabels.ts —
 * perché per mesi si sono chiamate tutte e due «max» e a metà asta divergono
 * in silenzio.
 */
export function maxSafe(team: TeamState, role: Role): MaxSafeResult {
  if (team.slotsRemaining[role] <= 0) {
    return { biddable: false, maxSafe: 0, hardReserve: 0, reason: "role-full" };
  }
  const slotsToReserve = team.totalSlotsRemaining - 1; // current pick fills one
  const hr = hardReserve(slotsToReserve);
  const ms = team.budgetResidual - hr;
  if (ms < COST_FLOOR) {
    return { biddable: false, maxSafe: Math.max(0, ms), hardReserve: hr, reason: "budget-locked" };
  }
  return { biddable: true, maxSafe: ms, hardReserve: hr };
}

export interface RoleScarcity {
  readonly role: Role;
  readonly poolRemaining: number; // unsold players of this role in the pool
  readonly leagueSlotsRemaining: number; // sum of unfilled slots across all teams
}

/** Deterministic remaining-supply per role given the synthetic pool + state. */
export function roleScarcity(
  state: AuctionState,
  pool: readonly PoolPlayer[],
): Record<Role, RoleScarcity> {
  const purchased = new Set(state.purchasedPlayerIds);
  const out = {} as Record<Role, RoleScarcity>;
  for (const role of ROLES) {
    const poolRemaining = pool.filter(
      (p) => p.role === role && !purchased.has(p.playerId),
    ).length;
    let leagueSlotsRemaining = 0;
    for (const t of Object.values(state.teams)) {
      leagueSlotsRemaining += t.slotsRemaining[role];
    }
    out[role] = { role, poolRemaining, leagueSlotsRemaining };
  }
  return out;
}

export interface OpponentTier1 {
  readonly fantaTeamId: string;
  readonly budgetResidual: number;
  readonly slotsRemaining: Record<Role, number>;
  readonly totalSlotsRemaining: number;
}

/** Tier-1 opponent view: pure accounting from the event log. No psychology. */
export function opponentTier1(
  state: AuctionState,
  selfId?: string,
): OpponentTier1[] {
  return Object.values(state.teams)
    .filter((t) => t.fantaTeamId !== selfId)
    .map((t) => ({
      fantaTeamId: t.fantaTeamId,
      budgetResidual: t.budgetResidual,
      slotsRemaining: { ...t.slotsRemaining },
      totalSlotsRemaining: t.totalSlotsRemaining,
    }))
    .sort((a, b) => a.fantaTeamId.localeCompare(b.fantaTeamId));
}

export interface WarBoardRow {
  readonly fantaTeamId: string;
  /** True for the team matching the `selfId` argument. Tag only — unlike
   *  opponentTier1(), warBoardRows() never filters self out (#231 tranche 3). */
  readonly isSelf: boolean;
  /** Nominal budget residual, straight from TeamState — no adjustment. */
  readonly budgetResidual: number;
  /** True max bid for this team, unmodified maxSafe() output — see below. */
  readonly maxBid: MaxSafeResult;
  readonly slotsRemaining: Record<Role, number>;
  readonly totalSlotsRemaining: number;
  /**
   * FULL acquisition history (live purchases + riconferme, reduce.ts), most
   * recent first — every entry, never truncated. The war board directive is
   * "sola contabilità dall'event log": this function does not decide how
   * many rows a view shows, that choice belongs to the UI corsia.
   */
  readonly acquisitions: readonly RosterEntry[];
}

/**
 * War board (TAVOLO): pure accounting from the event log for EVERY team,
 * including self — unlike opponentTier1() above, which excludes self.
 * Design source: docs/AUCTION_COPILOT_STRATEGY_DESIGN.md §4.2 — "TAVOLO ...
 * budget nominale e max bid vero, slot aperti e contatori osservati
 * dall'event log ... fatti misurati, non letture psicologiche". No
 * value/price-model field, nothing derived from the candidate pool, nothing
 * fitted or scored.
 *
 * `maxBid` reuses maxSafe() completely unchanged — it stays hard-safe and
 * non-overridable (PR #263 Escalation §2; tranche 2 kept maxSafe() as-is).
 * maxSafe()'s hard-reserve arithmetic depends only on `totalSlotsRemaining`,
 * never on which role is queried — so for a given team its result is
 * IDENTICAL across every role that still has an open slot; only the
 * "role-full" branch differs per role. warBoardRows() therefore evaluates
 * maxSafe() against any one currently-open role (P, D, C, A — ROLES order)
 * to stand for the team's single true max bid. Once every role is full it
 * falls back to "P": maxSafe() itself then reports
 * `{ biddable: false, reason: "role-full" }`, which is accurate — a team
 * with a complete roster has no open role to bid into.
 *
 * Riconferme (LEAGUE_RULES.md §4, reduce.ts) seed each team's roster with
 * seq < 0, strictly before every live event (seq >= 0 by schema). They
 * already count against `budgetResidual`/`slotsRemaining` via reduce()'s
 * ordinary TeamState arithmetic — no special-casing needed here. Reversing
 * TeamState.roster's ascending-seq order (buildTeam, reduce.ts) for
 * `acquisitions` surfaces the most recent LIVE purchase first and any
 * riconferme last, i.e. the real chronological order events happened in.
 *
 * Deterministic: same AuctionState -> same rows, always (pure function of
 * its input, same guarantee as opponentTier1()/reduce()).
 */
export function warBoardRows(
  state: AuctionState,
  selfId?: string,
): WarBoardRow[] {
  return Object.values(state.teams)
    .map((t) => {
      const openRole = ROLES.find((r) => t.slotsRemaining[r] > 0) ?? "P";
      return {
        fantaTeamId: t.fantaTeamId,
        isSelf: t.fantaTeamId === selfId,
        budgetResidual: t.budgetResidual,
        maxBid: maxSafe(t, openRole),
        slotsRemaining: { ...t.slotsRemaining },
        totalSlotsRemaining: t.totalSlotsRemaining,
        acquisitions: t.roster.slice().reverse(),
      };
    })
    .sort((a, b) => a.fantaTeamId.localeCompare(b.fantaTeamId));
}

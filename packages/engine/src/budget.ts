// Budget Plan — Batch 3B (data-free, gate-safe).
// This is a FEASIBILITY ENVELOPE, not a recommendation. It answers
// "how much budget can still go to each role without making the roster
// uncompletable?" — NOT "how much SHOULD go to each role?" (that needs the
// value/fair-to-me model, gated). Pure accounting from a derived TeamState:
// no data, no archetypes, no α, no directive output.

import { type Role, type TeamState, ROLES } from "./types.js";
import { hardReserve } from "./auction.js";

/** Per-role structural spending envelope. No value/target/price fields. */
export interface RoleBudgetEnvelope {
  readonly role: Role;
  readonly slotsRemaining: number;
  /** Credits that MUST stay for this role's own still-empty slots (at floor). */
  readonly minReserve: number;
  /**
   * Most that COULD go to this role while keeping every OTHER mandatory slot
   * fillable at floor.
   *
   * IL TETTO DI UN REPARTO — non è un tetto di offerta. Copre TUTTI gli slot
   * ancora liberi di questo ruolo messi insieme: offrire `maxAllocatable` su
   * un solo giocatore lascia gli altri slot dello stesso reparto senza
   * copertura. Il tetto di UNA offerta è `maxSafe(team, role)` (./auction.ts),
   * che riserva anche gli slot liberi di questo ruolo; le due coincidono solo
   * quando `slotsRemaining === 1`, altrimenti questa è maggiore di esattamente
   * `hardReserve(slotsRemaining - 1)`. A schermo sono `max reparto` e
   * `max bid`, due nomi distinti apposta (src/ui/budgetLabels.ts).
   */
  readonly maxAllocatable: number;
}

/** Whole-team structural budget envelope. */
export interface BudgetPlan {
  readonly totalSlotsRemaining: number;
  /** Credits that must stay to fill all remaining mandatory slots at floor. */
  readonly totalReserve: number;
  /** Discretionary credits above the reserve (0 if budget exactly covers the floor). */
  readonly freeBudget: number;
  /** Whether the residual budget can still fill every remaining mandatory slot. */
  readonly isCompletable: boolean;
  /** How many credits are missing to complete the roster at floor (0 if completable). */
  readonly budgetShortfall: number;
  readonly perRole: Record<Role, RoleBudgetEnvelope>;
}

/**
 * Pure, deterministic budget envelope for one team's current derived state.
 * Constraint-only: never recommends where to spend, never consumes α/value.
 */
export function budgetPlan(team: TeamState): BudgetPlan {
  const totalSlotsRemaining = team.totalSlotsRemaining;
  const totalReserve = hardReserve(totalSlotsRemaining);
  const isCompletable = team.budgetResidual >= totalReserve;
  const freeBudget = Math.max(0, team.budgetResidual - totalReserve);
  const budgetShortfall = Math.max(0, totalReserve - team.budgetResidual);

  const perRole = {} as Record<Role, RoleBudgetEnvelope>;
  for (const role of ROLES) {
    const slotsRemaining = team.slotsRemaining[role];
    const minReserve = hardReserve(slotsRemaining);
    const otherSlots = totalSlotsRemaining - slotsRemaining; // mandatory slots of the OTHER roles
    const maxAllocatable =
      slotsRemaining === 0
        ? 0
        : Math.max(0, team.budgetResidual - hardReserve(otherSlots));
    perRole[role] = { role, slotsRemaining, minReserve, maxAllocatable };
  }

  return {
    totalSlotsRemaining,
    totalReserve,
    freeBudget,
    isCompletable,
    budgetShortfall,
    perRole,
  };
}

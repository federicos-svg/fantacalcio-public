import { describe, it, expect } from "vitest";
import {
  reduce,
  recordPurchase,
  budgetPlan,
  ROLES,
  type AuctionEvent,
  type Role,
} from "../src/index.js";
import { FANTA_TEAM_IDS } from "../fixtures/synthetic.js";

const TEAMS = FANTA_TEAM_IDS;
const TS = "2026-08-01T12:00:00Z";
const emptyTeam = () => reduce([], TEAMS).teams["psg"]!;

describe("budgetPlan — feasibility envelope (empty roster)", () => {
  const plan = budgetPlan(emptyTeam());

  it("aggregate values for a fresh roster", () => {
    expect(plan.totalSlotsRemaining).toBe(28);
    expect(plan.totalReserve).toBe(28);
    expect(plan.freeBudget).toBe(472);
    expect(plan.isCompletable).toBe(true);
    expect(plan.budgetShortfall).toBe(0);
  });

  it("per-role maxAllocatable = 500 - other mandatory slots", () => {
    expect(plan.perRole.P.maxAllocatable).toBe(475); // 500 - 25
    expect(plan.perRole.D.maxAllocatable).toBe(481); // 500 - 19
    expect(plan.perRole.C.maxAllocatable).toBe(481); // 500 - 19
    expect(plan.perRole.A.maxAllocatable).toBe(479); // 500 - 21
  });
});

describe("budgetPlan — invariants", () => {
  it("sum of per-role minReserve equals totalReserve", () => {
    const plan = budgetPlan(emptyTeam());
    const sum = ROLES.reduce((acc, r) => acc + plan.perRole[r].minReserve, 0);
    expect(sum).toBe(plan.totalReserve);
  });

  it("freeBudget + totalReserve equals budgetResidual when completable", () => {
    const team = emptyTeam();
    const plan = budgetPlan(team);
    expect(plan.isCompletable).toBe(true);
    expect(plan.freeBudget + plan.totalReserve).toBe(team.budgetResidual);
    expect(plan.budgetShortfall).toBe(0);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(budgetPlan(emptyTeam()))).toBe(
      JSON.stringify(budgetPlan(emptyTeam())),
    );
  });
});

describe("budgetPlan — full role", () => {
  it("a full role has minReserve 0 and maxAllocatable 0", () => {
    // fill psg's 7 A slots at floor
    const log: AuctionEvent[] = [];
    let seq = 0;
    for (let i = 1; i <= 7; i++) {
      log.push({ type: "PURCHASE", seq: seq++, ts: TS, playerId: `A${i}`, role: "A", fantaTeamId: "psg", price: 1 });
    }
    const plan = budgetPlan(reduce(log, TEAMS).teams["psg"]!);
    expect(plan.perRole.A.slotsRemaining).toBe(0);
    expect(plan.perRole.A.minReserve).toBe(0);
    expect(plan.perRole.A.maxAllocatable).toBe(0);
  });
});

describe("budgetPlan — budget-locked (residual == reserve)", () => {
  it("freeBudget 0, completable, every non-full role maxAllocatable == minReserve", () => {
    // one feasible purchase at 473 drives residual to 27 == remaining slots (27)
    const state0 = reduce([], TEAMS);
    const log = recordPurchase([], state0, { playerId: "A1", role: "A", fantaTeamId: "psg", price: 473 }, TS);
    const team = reduce(log, TEAMS).teams["psg"]!;
    const plan = budgetPlan(team);

    expect(team.budgetResidual).toBe(27);
    expect(plan.totalReserve).toBe(27);
    expect(plan.freeBudget).toBe(0);
    expect(plan.isCompletable).toBe(true);
    expect(plan.budgetShortfall).toBe(0);
    for (const r of ROLES) {
      if (plan.perRole[r].slotsRemaining > 0) {
        expect(plan.perRole[r].maxAllocatable).toBe(plan.perRole[r].minReserve);
      }
    }
  });
});

describe("budgetPlan — not completable (via low-level overspend)", () => {
  it("isCompletable false, freeBudget 0, shortfall > 0, no negatives", () => {
    // appendEvent is the low-level primitive (no feasibility guard) — reach an
    // impossible state on purpose to exercise the not-completable branch.
    const log: AuctionEvent[] = [
      { type: "PURCHASE", seq: 0, ts: TS, playerId: "A1", role: "A", fantaTeamId: "psg", price: 500 },
    ];
    const team = reduce(log, TEAMS).teams["psg"]!;
    const plan = budgetPlan(team);

    expect(team.budgetResidual).toBe(0);
    expect(plan.isCompletable).toBe(false);
    expect(plan.freeBudget).toBe(0);
    expect(plan.budgetShortfall).toBe(27); // 27 remaining slots, 0 budget
    for (const r of ROLES) {
      expect(plan.perRole[r].maxAllocatable).toBeGreaterThanOrEqual(0);
      expect(plan.perRole[r].minReserve).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("budgetPlan — coherence after recordPurchase", () => {
  it("reflects updated slots/budget/reserve", () => {
    const state0 = reduce([], TEAMS);
    const log = recordPurchase([], state0, { playerId: "C5", role: "C", fantaTeamId: "psg", price: 40 }, TS);
    const team = reduce(log, TEAMS).teams["psg"]!;
    const plan = budgetPlan(team);

    expect(plan.totalSlotsRemaining).toBe(27); // 28 - 1
    expect(plan.totalReserve).toBe(27);
    expect(team.budgetResidual).toBe(460); // 500 - 40
    expect(plan.freeBudget).toBe(460 - 27);
    expect(plan.perRole.C.slotsRemaining).toBe(8); // 9 - 1
  });
});

describe("budgetPlan — anti-scope-creep guard", () => {
  it("output exposes only structural fields (no alpha/value/target/price)", () => {
    const plan = budgetPlan(emptyTeam());
    const banned = /alpha|value|target|stretch|price|fairtome/i;
    const topKeys = Object.keys(plan);
    expect(topKeys.some((k) => banned.test(k))).toBe(false);
    expect(topKeys.sort()).toEqual(
      ["budgetShortfall", "freeBudget", "isCompletable", "perRole", "totalReserve", "totalSlotsRemaining"].sort(),
    );
    for (const r of ROLES) {
      const keys = Object.keys(plan.perRole[r as Role]);
      expect(keys.some((k) => banned.test(k))).toBe(false);
      expect(keys.sort()).toEqual(["maxAllocatable", "minReserve", "role", "slotsRemaining"].sort());
    }
  });
});

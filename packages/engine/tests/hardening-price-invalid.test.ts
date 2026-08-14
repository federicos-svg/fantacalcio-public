// Pin for a CONFIRMED audit defect (adversarial audit, 2026-08-14, Fable
// session, exception authorized by Owner) — NOT yet fixed as of this commit
// (WIP handoff, branch worker/engine-hardening-audit). purchaseFeasibility()
// currently lets a non-integer price (NaN, 10.5) through as `ok: true`
// because `price < COST_FLOOR` is false for both (NaN comparisons are
// always false; 10.5 >= COST_FLOOR). appendEvent()'s zod schema already
// rejects both at the log-append layer (`price: z.number().int()...`), so
// recordPurchase() throws either way today — but purchaseFeasibility is
// documented as the admission layer, and ANY caller that only checks its
// `.ok` before deciding what to do next sees a false "feasible" for a
// broken price.
//
// Fix 4 (planned, packages/engine/src/feasibility.ts purchaseFeasibility,
// ~lines 54-66): add violation "price-invalid" (new FeasibilityViolation
// member) when `!Number.isInteger(proposed.price)` — coherent with the
// existing "price-invalid" code in validateConfirmations
// (packages/engine/src/confirmations.ts).
//
// EXPECTED STATE OF THIS FILE UNTIL FIX 4 LANDS: first two tests RED, third
// GREEN (documents no change for already-valid integer prices).
import { describe, it, expect } from "vitest";
import { purchaseFeasibility } from "../src/feasibility.js";
import { reduce } from "../src/reduce.js";

const TEAMS = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];

describe("hardening — purchaseFeasibility rejects non-integer price (audit fix 4)", () => {
  it("NaN price is rejected with price-invalid", () => {
    const st = reduce([], TEAMS);
    const feas = purchaseFeasibility(st, { playerId: "p", role: "A", fantaTeamId: "t1", price: NaN });
    expect(feas.ok).toBe(false);
    expect(feas.violations).toContain("price-invalid");
  });

  it("non-integer price (10.5) is rejected with price-invalid", () => {
    const st = reduce([], TEAMS);
    const feas = purchaseFeasibility(st, { playerId: "p", role: "A", fantaTeamId: "t1", price: 10.5 });
    expect(feas.ok).toBe(false);
    expect(feas.violations).toContain("price-invalid");
  });

  it("valid integer prices are unaffected (no regression)", () => {
    const st = reduce([], TEAMS);
    const feas = purchaseFeasibility(st, { playerId: "p", role: "A", fantaTeamId: "t1", price: 10 });
    expect(feas.ok).toBe(true);
  });
});

// Pin for a CONFIRMED audit defect (adversarial audit, 2026-08-14) and FIXED
// on this branch — Fix 2: validateAuctionLog() (src/logRecovery.ts) replays
// the log through reduce() and now checks the resulting invariants: a log
// giving one team 12 D purchases (role limit 9) is REJECTED (`ok: false`,
// reason "invariant-violated: ... slotsRemaining[D] ... < 0") instead of
// being ACCEPTED and later CRASHING downstream at render time —
// maxSafe()/budgetPlan() used to throw on a negative totalSlotsRemaining.
// Same fix closes the fail-open gap on budget: a log spending 600/500
// credits is now rejected instead of silently driving budgetResidual
// negative (a silently-wrong "budget" is exactly what LIVE-02 fail-closed
// persistence is supposed to prevent). Reproduced from the audit's
// "imported log bypassing feasibility" probe.
//
// Fix 2 (implemented, src/logRecovery.ts validateAuctionLog, ~lines 139-164):
// after the replay, reject with a clear reason ("invariant-violated: ...")
// if ANY team ends up with budgetResidual < 0 OR any slotsRemaining[role] < 0.
// Before wiring the check, the whole repo test suite was searched for a
// fixture relying on an invariant-violating log being accepted by
// validateAuctionLog/saveAuctionLog/loadAuctionLog/importAuctionLog — none
// depended on that behaviour, so the check was safe to add unconditionally.
//
// CURRENT STATE OF THIS FILE: all three tests GREEN — the two
// invariant-violating logs are rejected, and the third documents that a
// normal, invariant-respecting log keeps validating ok (no regression).
import { describe, it, expect } from "vitest";
import { validateAuctionLog } from "./logRecovery.js";
import type { AuctionEvent, Role } from "../packages/engine/src/types.js";

const TEAMS = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];

function purchase(seq: number, playerId: string, role: Role, team: string, price: number): AuctionEvent {
  return { type: "PURCHASE", seq, ts: "2026-09-03T20:00:00Z", playerId, role, fantaTeamId: team, price };
}

describe("hardening — validateAuctionLog rejects invariant-violating logs (audit fix 2)", () => {
  it("role overflow (12 D bought, role limit is 9) is rejected", () => {
    const log: AuctionEvent[] = [];
    let seq = 0;
    for (let i = 0; i < 12; i++) log.push(purchase(seq++, `d${i}`, "D", "t1", 1));
    for (let i = 0; i < 9; i++) log.push(purchase(seq++, `c${i}`, "C", "t1", 1));
    for (let i = 0; i < 7; i++) log.push(purchase(seq++, `a${i}`, "A", "t1", 1));
    for (let i = 0; i < 2; i++) log.push(purchase(seq++, `p${i}`, "P", "t1", 1));
    const v = validateAuctionLog(log, TEAMS);
    expect(v.ok).toBe(false);
  });

  it("budget overrun (600 spent > 500 initial) is rejected", () => {
    const log: AuctionEvent[] = [
      purchase(0, "x1", "A", "t1", 300),
      purchase(1, "x2", "A", "t1", 300),
    ];
    const v = validateAuctionLog(log, TEAMS);
    expect(v.ok).toBe(false);
  });

  it("a valid log (invariants respected) keeps validating ok (no regression)", () => {
    const log: AuctionEvent[] = [purchase(0, "x1", "A", "t1", 30)];
    const v = validateAuctionLog(log, TEAMS);
    expect(v.ok).toBe(true);
  });
});

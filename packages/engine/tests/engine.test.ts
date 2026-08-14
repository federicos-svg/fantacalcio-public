import { describe, it, expect } from "vitest";
import {
  reduce,
  appendEvent,
  maxSafe,
  hardReserve,
  roleScarcity,
  opponentTier1,
  validateEvent,
  INITIAL_BUDGET,
  ROSTER_REQUIREMENTS,
  TOTAL_SLOTS,
  type AuctionEvent,
} from "../src/index.js";
import { FANTA_TEAM_IDS, syntheticPool, syntheticLog } from "../fixtures/synthetic.js";

const TEAMS = FANTA_TEAM_IDS;

describe("event log — append-only", () => {
  it("2. does not mutate existing events on append", () => {
    const log = syntheticLog();
    const snapshot = JSON.stringify(log);
    const next = appendEvent(log, {
      type: "PURCHASE", seq: 7, ts: "2026-08-01T10:06:00Z",
      playerId: "C2", role: "C", fantaTeamId: "ac_vostra", price: 12,
    });
    expect(JSON.stringify(log)).toBe(snapshot); // original untouched
    expect(next.length).toBe(log.length + 1);
    expect(next).not.toBe(log); // new array
  });

  it("rejects non-increasing seq (append-only invariant)", () => {
    const log = syntheticLog();
    expect(() =>
      appendEvent(log, { type: "VOID", seq: 2, ts: "x", targetSeq: 0 }),
    ).toThrow(/append-only/);
  });

  it("validates event schema", () => {
    expect(() => validateEvent({ type: "PURCHASE", seq: 0, ts: "t", playerId: "A1", role: "Z", fantaTeamId: "x", price: 1 })).toThrow();
  });
});

describe("reduce — deterministic projection", () => {
  it("1. same log -> same state", () => {
    const a = reduce(syntheticLog(), TEAMS);
    const b = reduce(syntheticLog(), TEAMS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("1b. order-independent (sorts by seq)", () => {
    const log = syntheticLog();
    const shuffled = [...log].reverse();
    expect(JSON.stringify(reduce(shuffled, TEAMS))).toBe(
      JSON.stringify(reduce(log, TEAMS)),
    );
  });

  it("3. initial budget is 500 for an empty log", () => {
    const s = reduce([], TEAMS);
    for (const id of TEAMS) expect(s.teams[id]!.budgetResidual).toBe(500);
    expect(INITIAL_BUDGET).toBe(500);
  });

  it("4. roster target is 3P/9D/9C/7A (=28)", () => {
    expect(ROSTER_REQUIREMENTS).toEqual({ P: 3, D: 9, C: 9, A: 7 });
    expect(TOTAL_SLOTS).toBe(28);
    const s = reduce([], TEAMS);
    const t = s.teams["new_milf"]!;
    expect(t.totalSlotsRemaining).toBe(28);
  });

  it("8. a purchase updates budget, slots and roster", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const milf = s.teams["new_milf"]!;
    expect(milf.spent).toBe(102 + 22); // A1 + D1
    expect(milf.budgetResidual).toBe(500 - 124);
    expect(milf.filled.A).toBe(1);
    expect(milf.filled.D).toBe(1);
    expect(milf.totalSlotsRemaining).toBe(28 - 2);
    expect(milf.roster.map((r) => r.playerId)).toEqual(["A1", "D1"]);
  });

  it("9. VOID (undo) yields a coherent compensated state", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const ataturk = s.teams["ataturk"]!;
    // D2 was bought at 999 (seq3), voided (seq4), re-bought at 7 (seq5)
    expect(ataturk.spent).toBe(7);
    expect(ataturk.filled.D).toBe(1);
    expect(ataturk.budgetResidual).toBe(500 - 7);
    expect(s.purchasedPlayerIds.filter((p) => p === "D2").length).toBe(1);
  });

  it("9b. replay: log without the void != log with the void", () => {
    const full = syntheticLog();
    const noVoid = full.filter((e) => !(e.type === "VOID")) as AuctionEvent[];
    const withMistake = reduce(noVoid, TEAMS).teams["ataturk"]!;
    const corrected = reduce(full, TEAMS).teams["ataturk"]!;
    expect(withMistake.spent).not.toBe(corrected.spent);
  });
});

describe("hard reserve & max_safe", () => {
  it("5. hard_reserve = slots_to_reserve * 1", () => {
    expect(hardReserve(0)).toBe(0);
    expect(hardReserve(27)).toBe(27);
    expect(hardReserve(5)).toBe(5);
  });

  it("6. max_safe = budget_residual - hard_reserve (empty roster)", () => {
    const s = reduce([], TEAMS);
    const t = s.teams["new_milf"]!;
    const r = maxSafe(t, "A");
    // 28 slots, buying one leaves 27 to reserve
    expect(r.hardReserve).toBe(27);
    expect(r.maxSafe).toBe(500 - 27);
    expect(r.biddable).toBe(true);
  });

  it("7. spending max_safe still leaves the roster completable", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const t = s.teams["new_milf"]!;
    const r = maxSafe(t, "C");
    // after spending maxSafe, residual must cover the OTHER remaining slots at 1
    const residualAfter = t.budgetResidual - r.maxSafe;
    const otherSlots = t.totalSlotsRemaining - 1;
    expect(residualAfter).toBeGreaterThanOrEqual(otherSlots * 1);
    expect(residualAfter).toBe(r.hardReserve);
  });

  it("7b. max_safe never recommends breaking the roster (full role not biddable)", () => {
    // simulate a team with role A full
    const log: AuctionEvent[] = [];
    let seq = 0;
    for (let i = 1; i <= 7; i++) {
      log.push({ type: "PURCHASE", seq: seq++, ts: "t", playerId: `A${i}`, role: "A", fantaTeamId: "psg", price: 1 });
    }
    const t = reduce(log, TEAMS).teams["psg"]!;
    const r = maxSafe(t, "A");
    expect(r.biddable).toBe(false);
    expect(r.reason).toBe("role-full");
  });
});

describe("role scarcity & opponent Tier-1", () => {
  it("11. role scarcity returns coherent remaining supply", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const sc = roleScarcity(s, syntheticPool());
    // pool has 20 A; A1 bought -> 19 remain
    expect(sc.A.poolRemaining).toBe(19);
    // league A slots: 8 teams * 7 = 56, minus 1 filled (new_milf A1)
    expect(sc.A.leagueSlotsRemaining).toBe(8 * 7 - 1);
    expect(sc.D.poolRemaining).toBe(30 - 2); // D1, D2 bought
  });

  it("10. opponent Tier-1 shows residual budget and slots, excludes self", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const opp = opponentTier1(s, "new_milf");
    expect(opp.find((o) => o.fantaTeamId === "new_milf")).toBeUndefined();
    const ataturk = opp.find((o) => o.fantaTeamId === "ataturk")!;
    expect(ataturk.budgetResidual).toBe(500 - 7);
    expect(ataturk.slotsRemaining.D).toBe(9 - 1);
    expect(ataturk.totalSlotsRemaining).toBe(28 - 1);
  });
});

describe("12. Sprint-1 scope guard — no value/fair-to-me symbols exist", () => {
  it("engine exports contain no value/modifier/fairToMe API", async () => {
    const mod = await import("../src/index.js");
    const banned = ["value", "fairToMe", "targetBand", "stretchCap", "modifier", "spearman"];
    const keys = Object.keys(mod).map((k) => k.toLowerCase());
    for (const b of banned) {
      expect(keys.some((k) => k.includes(b.toLowerCase()))).toBe(false);
    }
  });
});

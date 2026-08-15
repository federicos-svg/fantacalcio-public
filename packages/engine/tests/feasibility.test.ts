import { describe, it, expect } from "vitest";
import {
  reduce,
  appendEvent,
  purchaseFeasibility,
  recordPurchase,
  voidFeasibility,
  recordVoid,
  INITIAL_BUDGET,
  type AuctionEvent,
  type ProposedPurchase,
} from "../src/index.js";
import { FANTA_TEAM_IDS, syntheticLog } from "../fixtures/synthetic.js";

const TEAMS = FANTA_TEAM_IDS;
const TS = "2026-08-01T11:00:00Z";

describe("purchaseFeasibility — hard-safe admission", () => {
  it("accepts a normal purchase on an empty roster", () => {
    const s = reduce([], TEAMS);
    const r = purchaseFeasibility(s, { playerId: "A9", role: "A", fantaTeamId: "psg", price: 50 });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("rejects an unknown team (only violation reported)", () => {
    const s = reduce([], TEAMS);
    const r = purchaseFeasibility(s, { playerId: "A9", role: "A", fantaTeamId: "ghost", price: 10 });
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(["unknown-team"]);
  });

  it("rejects a price below the floor", () => {
    const s = reduce([], TEAMS);
    const r = purchaseFeasibility(s, { playerId: "A9", role: "A", fantaTeamId: "psg", price: 0 });
    expect(r.violations).toContain("price-below-floor");
  });

  it("rejects buying into a full role", () => {
    // fill psg's 7 A slots
    const log: AuctionEvent[] = [];
    let seq = 0;
    for (let i = 1; i <= 7; i++) {
      log.push({ type: "PURCHASE", seq: seq++, ts: TS, playerId: `A${i}`, role: "A", fantaTeamId: "psg", price: 1 });
    }
    const s = reduce(log, TEAMS);
    const r = purchaseFeasibility(s, { playerId: "A8", role: "A", fantaTeamId: "psg", price: 1 });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("role-full");
  });

  it("rejects a duplicate player already won by anyone", () => {
    const s = reduce(syntheticLog(), TEAMS); // A1 already bought by new_milf
    const r = purchaseFeasibility(s, { playerId: "A1", role: "A", fantaTeamId: "psg", price: 5 });
    expect(r.violations).toContain("duplicate-player");
  });

  it("rejects a price above the team's residual budget", () => {
    const s = reduce([], TEAMS);
    const r = purchaseFeasibility(s, { playerId: "A9", role: "A", fantaTeamId: "psg", price: INITIAL_BUDGET + 1 });
    expect(r.violations).toContain("insufficient-budget");
  });

  it("rejects a purchase that would break the hard reserve", () => {
    // empty roster: 28 slots, buying one leaves 27 to reserve at floor.
    // max feasible price = 500 - 27 = 473. 474 must break the reserve.
    const s = reduce([], TEAMS);
    const ok = purchaseFeasibility(s, { playerId: "A9", role: "A", fantaTeamId: "psg", price: 473 });
    const bad = purchaseFeasibility(s, { playerId: "A9", role: "A", fantaTeamId: "psg", price: 474 });
    expect(ok.ok).toBe(true);
    expect(bad.ok).toBe(false);
    expect(bad.violations).toContain("breaks-hard-reserve");
  });

  it("reports multiple violations at once", () => {
    const s = reduce(syntheticLog(), TEAMS); // A1 already owned
    const r = purchaseFeasibility(s, { playerId: "A1", role: "A", fantaTeamId: "new_milf", price: 0 });
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(expect.arrayContaining(["price-below-floor", "duplicate-player"]));
  });
});

describe("purchaseFeasibility — third portiere at 0 (LEAGUE_RULES.md §6, declared-only)", () => {
  // "psg" with its first two P slots already filled -> the next P purchase
  // for psg IS the team's third (last) portiere slot.
  const twoGoalkeepersLog: AuctionEvent[] = [
    { type: "PURCHASE", seq: 0, ts: TS, playerId: "P1", role: "P", fantaTeamId: "psg", price: 10 },
    { type: "PURCHASE", seq: 1, ts: TS, playerId: "P2", role: "P", fantaTeamId: "psg", price: 5 },
  ];
  // "psg" with only ONE P slot filled -> the next P purchase is the SECOND,
  // not the third — the structural condition must not fire here.
  const oneGoalkeeperLog: AuctionEvent[] = [
    { type: "PURCHASE", seq: 0, ts: TS, playerId: "P1", role: "P", fantaTeamId: "psg", price: 10 },
  ];

  it("THE critical negative: price 0 on the actual third-portiere slot is still rejected without the declaration", () => {
    const s = reduce(twoGoalkeepersLog, TEAMS);
    expect(s.teams.psg!.slotsRemaining.P).toBe(1); // confirms this IS the 3rd slot
    const r = purchaseFeasibility(s, { playerId: "P3", role: "P", fantaTeamId: "psg", price: 0 });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("price-below-floor");
  });

  it("accepts price 0 on the third portiere slot ONLY when explicitly declared", () => {
    const s = reduce(twoGoalkeepersLog, TEAMS);
    const r = purchaseFeasibility(s, {
      playerId: "P3",
      role: "P",
      fantaTeamId: "psg",
      price: 0,
      declareThirdGoalkeeperZero: true,
    });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("declaring is inert (not yet the third slot): price 0 on the SECOND portiere is still rejected even when declared", () => {
    const s = reduce(oneGoalkeeperLog, TEAMS);
    expect(s.teams.psg!.slotsRemaining.P).toBe(2); // this purchase would be the 2nd, not the 3rd
    const r = purchaseFeasibility(s, {
      playerId: "P2",
      role: "P",
      fantaTeamId: "psg",
      price: 0,
      declareThirdGoalkeeperZero: true,
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("price-below-floor");
  });

  it("declaring is inert (wrong role): price 0 on a non-portiere role is still rejected even when declared", () => {
    const s = reduce(twoGoalkeepersLog, TEAMS); // psg's P slots are irrelevant here — role is D
    const r = purchaseFeasibility(s, {
      playerId: "D9",
      role: "D",
      fantaTeamId: "psg",
      price: 0,
      declareThirdGoalkeeperZero: true,
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("price-below-floor");
  });

  it("the exception is exactly price 0 — a declared third portiere at a negative price is still rejected", () => {
    const s = reduce(twoGoalkeepersLog, TEAMS);
    const r = purchaseFeasibility(s, {
      playerId: "P3",
      role: "P",
      fantaTeamId: "psg",
      price: -1,
      declareThirdGoalkeeperZero: true,
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("price-below-floor");
  });

  it("every OTHER team's every OTHER floor case is unaffected: floor stays 1 everywhere else", () => {
    const s = reduce([], TEAMS);
    for (const role of ["P", "D", "C", "A"] as const) {
      const r = purchaseFeasibility(s, { playerId: `x-${role}`, role, fantaTeamId: "psg", price: 0 });
      expect(r.violations).toContain("price-below-floor");
    }
  });
});

describe("recordPurchase — third portiere at 0 is logged as an explicit declaration", () => {
  const twoGoalkeepersLog: AuctionEvent[] = [
    { type: "PURCHASE", seq: 0, ts: TS, playerId: "P1", role: "P", fantaTeamId: "psg", price: 10 },
    { type: "PURCHASE", seq: 1, ts: TS, playerId: "P2", role: "P", fantaTeamId: "psg", price: 5 },
  ];

  it("writes thirdGoalkeeperZeroDeclared: true on the appended event, so the log explains the 0 on replay", () => {
    const s = reduce(twoGoalkeepersLog, TEAMS);
    const next = recordPurchase(
      twoGoalkeepersLog,
      s,
      { playerId: "P3", role: "P", fantaTeamId: "psg", price: 0, declareThirdGoalkeeperZero: true },
      TS,
    );
    const ev = next[next.length - 1]!;
    expect(ev).toMatchObject({ type: "PURCHASE", price: 0, thirdGoalkeeperZeroDeclared: true });

    // The declaration is not just decorative: replay must reflect price 0.
    const after = reduce(next, TEAMS).teams.psg!;
    expect(after.spent).toBe(15); // 10 + 5 + 0
    expect(after.filled.P).toBe(3);
    expect(after.slotsRemaining.P).toBe(0);
  });

  it("never writes the field on an ordinary purchase, even one made by the same team/role", () => {
    const log = syntheticLog();
    const s = reduce(log, TEAMS);
    const next = recordPurchase(log, s, { playerId: "P9", role: "P", fantaTeamId: "psg", price: 3 }, TS);
    const ev = next[next.length - 1]!;
    expect("thirdGoalkeeperZeroDeclared" in ev).toBe(false);
  });

  it("throws — and appends nothing — for price 0 on the third portiere without the declaration", () => {
    const s = reduce(twoGoalkeepersLog, TEAMS);
    expect(() =>
      recordPurchase(twoGoalkeepersLog, s, { playerId: "P3", role: "P", fantaTeamId: "psg", price: 0 }, TS),
    ).toThrow(/infeasible purchase/);
  });
});

describe("recordPurchase — manual-input contract", () => {
  it("appends a correctly-sequenced event for a feasible purchase", () => {
    const log = syntheticLog();
    const s = reduce(log, TEAMS);
    const proposed: ProposedPurchase = { playerId: "C9", role: "C", fantaTeamId: "ac_vostra", price: 30 };
    const next = recordPurchase(log, s, proposed, TS);

    expect(next.length).toBe(log.length + 1);
    const ev = next[next.length - 1]!;
    expect(ev.type).toBe("PURCHASE");
    expect(ev.seq).toBe(log[log.length - 1]!.seq + 1); // strictly increasing
    expect(next).not.toBe(log); // new array, input untouched
  });

  it("starts seq at 0 on an empty log", () => {
    const s = reduce([], TEAMS);
    const next = recordPurchase([], s, { playerId: "P9", role: "P", fantaTeamId: "psg", price: 3 }, TS);
    expect(next[0]!.seq).toBe(0);
  });

  it("throws on an infeasible purchase and does not append", () => {
    const log = syntheticLog();
    const s = reduce(log, TEAMS);
    expect(() =>
      recordPurchase(log, s, { playerId: "A1", role: "A", fantaTeamId: "psg", price: 5 }, TS),
    ).toThrow(/infeasible purchase/);
    expect(log.length).toBe(7); // original untouched
  });

  it("recorded purchase reduces to a coherent, still-completable state", () => {
    const log = syntheticLog();
    const s0 = reduce(log, TEAMS);
    const next = recordPurchase(log, s0, { playerId: "C9", role: "C", fantaTeamId: "ac_vostra", price: 30 }, TS);
    const t = reduce(next, TEAMS).teams["ac_vostra"]!;
    expect(t.spent).toBe(30);
    expect(t.budgetResidual).toBeGreaterThanOrEqual(t.totalSlotsRemaining * 1);
  });
});

describe("hard-safe boundary — appendEvent is NOT the guard, recordPurchase is", () => {
  // Locks the contract: the low-level append primitive admits a schema-valid but
  // infeasible purchase (by design); only recordPurchase enforces feasibility.
  const infeasible: ProposedPurchase = { playerId: "A1", role: "A", fantaTeamId: "psg", price: INITIAL_BUDGET + 1 };

  it("appendEvent appends an infeasible (over-budget + duplicate) purchase without throwing", () => {
    const log = syntheticLog(); // A1 already owned by new_milf
    const next = appendEvent(log, {
      type: "PURCHASE", seq: log[log.length - 1]!.seq + 1, ts: TS,
      playerId: infeasible.playerId, role: infeasible.role,
      fantaTeamId: infeasible.fantaTeamId, price: infeasible.price,
    });
    expect(next.length).toBe(log.length + 1); // appended — primitive does not guard
  });

  it("recordPurchase rejects exactly that purchase", () => {
    const log = syntheticLog();
    const s = reduce(log, TEAMS);
    expect(purchaseFeasibility(s, infeasible).ok).toBe(false);
    expect(() => recordPurchase(log, s, infeasible, TS)).toThrow(/infeasible purchase/);
  });
});

describe("voidFeasibility & recordVoid — manual correction contract", () => {
  // syntheticLog seqs: 0 A1 new_milf(102), 1 C1 fc_sottitudo(81), 2 D1 new_milf(22),
  // 3 D2 ataturk(999), 4 VOID->3, 5 D2 ataturk(7), 6 P1 psg(1)

  it("accepts voiding an existing, not-yet-voided PURCHASE", () => {
    const r = voidFeasibility(syntheticLog(), 6); // P1 psg
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("rejects voiding a non-existent seq", () => {
    const r = voidFeasibility(syntheticLog(), 99);
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(["target-not-found"]);
  });

  it("rejects double-void of an already-voided purchase", () => {
    const r = voidFeasibility(syntheticLog(), 3); // already voided by seq 4
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("already-voided");
  });

  it("rejects voiding a VOID event (not a purchase)", () => {
    const r = voidFeasibility(syntheticLog(), 4); // seq 4 is itself a VOID
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("target-not-purchase");
  });

  it("recordVoid appends a correctly-sequenced VOID without mutating input", () => {
    const log = syntheticLog();
    const next = recordVoid(log, 6, TS);
    expect(next.length).toBe(log.length + 1);
    expect(log.length).toBe(7); // original untouched
    expect(next).not.toBe(log);
    const ev = next[next.length - 1]!;
    expect(ev.type).toBe("VOID");
    expect(ev.seq).toBe(log[log.length - 1]!.seq + 1); // strictly increasing
  });

  it("recordVoid throws on an infeasible target and does not append", () => {
    const log = syntheticLog();
    expect(() => recordVoid(log, 99, TS)).toThrow(/infeasible void/);
    expect(log.length).toBe(7);
  });

  it("replay after recordVoid restores budget and frees the slot", () => {
    const log = syntheticLog();
    const before = reduce(log, TEAMS).teams["new_milf"]!;
    // new_milf has A1(102, seq0) + D1(22, seq2): spent 124, A filled 1
    expect(before.spent).toBe(124);
    expect(before.filled.A).toBe(1);

    const next = recordVoid(log, 0, TS); // void A1
    const after = reduce(next, TEAMS).teams["new_milf"]!;
    expect(after.spent).toBe(22); // only D1 remains
    expect(after.budgetResidual).toBe(INITIAL_BUDGET - 22);
    expect(after.filled.A).toBe(0); // slot freed
    expect(after.slotsRemaining.A).toBe(7);
  });
});

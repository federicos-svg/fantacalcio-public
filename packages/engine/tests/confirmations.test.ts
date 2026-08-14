import { describe, it, expect } from "vitest";
import {
  reduce,
  recordPurchase,
  recordVoid,
  voidFeasibility,
  maxSafe,
  hardReserve,
  budgetPlan,
  purchaseFeasibility,
  validateConfirmations,
  CONFIRMATION_LIMITS,
  INITIAL_BUDGET,
  ROSTER_REQUIREMENTS,
  TOTAL_SLOTS,
  type AuctionEvent,
  type ConfirmationInput,
} from "../src/index.js";
import { FANTA_TEAM_IDS, syntheticLog } from "../fixtures/synthetic.js";

const TEAMS = FANTA_TEAM_IDS;
const TS = "2026-08-01T09:00:00Z";

describe("CONFIRMATION_LIMITS — LEAGUE_RULES.md §4 (canonical, closed)", () => {
  it("P: 0, D/C/A: 1", () => {
    expect(CONFIRMATION_LIMITS).toEqual({ P: 0, D: 1, C: 1, A: 1 });
  });
});

describe("validateConfirmations — fail-closed, never throws", () => {
  it("accepts an empty batch", () => {
    const r = validateConfirmations([], TEAMS);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("accepts one valid confirmation per confirmable role for one team", () => {
    const batch: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price: 20 },
      { fantaTeamId: "psg", playerId: "C_OLD_1", role: "C", price: 15 },
      { fantaTeamId: "psg", playerId: "A_OLD_1", role: "A", price: 40 },
    ];
    const r = validateConfirmations(batch, TEAMS);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("accepts the same role confirmed independently by different teams", () => {
    const batch: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price: 20 },
      { fantaTeamId: "ataturk", playerId: "D_OLD_2", role: "D", price: 25 },
    ];
    expect(validateConfirmations(batch, TEAMS).ok).toBe(true);
  });

  it("rejects an unknown team, reporting only that violation", () => {
    const r = validateConfirmations(
      [{ fantaTeamId: "ghost_team", playerId: "X1", role: "D", price: 10 }],
      TEAMS,
    );
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([
      { index: 0, fantaTeamId: "ghost_team", playerId: "X1", violation: "unknown-team" },
    ]);
  });

  it("rejects a P confirmation (LEAGUE_RULES §4: 0 confirmable)", () => {
    const r = validateConfirmations(
      [{ fantaTeamId: "psg", playerId: "P_OLD_1", role: "P", price: 5 }],
      TEAMS,
    );
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.violation)).toEqual(["role-not-confirmable"]);
  });

  it("rejects a second D confirmation for the same team (max 1)", () => {
    const batch: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price: 20 },
      { fantaTeamId: "psg", playerId: "D_OLD_2", role: "D", price: 18 },
    ];
    const r = validateConfirmations(batch, TEAMS);
    expect(r.ok).toBe(false);
    // first D is fine on its own; only the second (over the limit) is flagged
    expect(r.issues).toEqual([
      { index: 1, fantaTeamId: "psg", playerId: "D_OLD_2", violation: "role-limit-exceeded" },
    ]);
  });

  it.each([0, -5, 1.5, NaN])("rejects an invalid price (%s)", (price) => {
    const r = validateConfirmations(
      [{ fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price }],
      TEAMS,
    );
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.violation)).toContain("price-invalid");
  });

  it("accepts price at COST_FLOOR (1)", () => {
    const r = validateConfirmations(
      [{ fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price: 1 }],
      TEAMS,
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a duplicate player confirmed twice by the same team", () => {
    const batch: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "SAME", role: "D", price: 10 },
      { fantaTeamId: "psg", playerId: "SAME", role: "C", price: 12 },
    ];
    const r = validateConfirmations(batch, TEAMS);
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([
      { index: 1, fantaTeamId: "psg", playerId: "SAME", violation: "duplicate-player" },
    ]);
  });

  it("rejects a duplicate player confirmed by two different teams", () => {
    const batch: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "SAME", role: "D", price: 10 },
      { fantaTeamId: "ataturk", playerId: "SAME", role: "C", price: 12 },
    ];
    const r = validateConfirmations(batch, TEAMS);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.violation)).toEqual(["duplicate-player"]);
  });

  it("rejects a team's confirmation batch whose prices sum above INITIAL_BUDGET (would go negative)", () => {
    const batch: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price: 300 },
      { fantaTeamId: "psg", playerId: "C_OLD_1", role: "C", price: 201 },
    ];
    const r = validateConfirmations(batch, TEAMS);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.violation)).toEqual(["team-budget-exceeded"]);
  });

  it("rejects a team's confirmation batch that sums to exactly INITIAL_BUDGET but breaks hard reserve (t=0 roster uncompletable)", () => {
    // 500 spent over just 2 confirmed slots leaves 26 OTHER mandatory slots
    // with 0 residual budget — the roster could never be completed even
    // before a single live bid. team-budget-exceeded alone (spend > 500)
    // would miss this; it is a strictly weaker bound than hard reserve.
    const batch: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price: 300 },
      { fantaTeamId: "psg", playerId: "C_OLD_1", role: "C", price: 200 },
    ];
    const r = validateConfirmations(batch, TEAMS);
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([
      { index: 1, fantaTeamId: "psg", playerId: "C_OLD_1", violation: "team-hard-reserve-broken" },
    ]);
  });

  describe("team-hard-reserve-broken — reuses hardReserve() so the bound matches purchaseFeasibility's own invariant exactly", () => {
    it("accepts a single confirmation right at the same bound a first live purchase would have (473, mirrors feasibility.test.ts)", () => {
      // empty roster: 28 slots; confirming 1 leaves 27 others to reserve at
      // floor -> max price = 500 - 27 = 473, IDENTICAL to purchaseFeasibility's
      // own "breaks-hard-reserve" bound for a first live purchase.
      const r = validateConfirmations(
        [{ fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price: 473 }],
        TEAMS,
      );
      expect(r.ok).toBe(true);
    });

    it("rejects a single confirmation one credit past that bound (474)", () => {
      const r = validateConfirmations(
        [{ fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price: 474 }],
        TEAMS,
      );
      expect(r.ok).toBe(false);
      expect(r.issues).toEqual([
        { index: 0, fantaTeamId: "psg", playerId: "D_OLD_1", violation: "team-hard-reserve-broken" },
      ]);
    });

    it("accepts the maximal 3-confirmation batch (0P/1D/1C/1A) right at its bound (475 total)", () => {
      // 3 confirmed slots -> 25 OTHER mandatory slots -> max total spend =
      // 500 - 25 = 475, computed here independently via hardReserve() itself
      // so the test can never silently drift from the bound it is checking.
      const bound = INITIAL_BUDGET - hardReserve(TOTAL_SLOTS - 3);
      expect(bound).toBe(475);
      const batch: ConfirmationInput[] = [
        { fantaTeamId: "psg", playerId: "D_OLD", role: "D", price: 200 },
        { fantaTeamId: "psg", playerId: "C_OLD", role: "C", price: 200 },
        { fantaTeamId: "psg", playerId: "A_OLD", role: "A", price: bound - 400 },
      ];
      expect(validateConfirmations(batch, TEAMS).ok).toBe(true);
    });

    it("rejects the maximal 3-confirmation batch one credit past its bound (476 total)", () => {
      const batch: ConfirmationInput[] = [
        { fantaTeamId: "psg", playerId: "D_OLD", role: "D", price: 200 },
        { fantaTeamId: "psg", playerId: "C_OLD", role: "C", price: 200 },
        { fantaTeamId: "psg", playerId: "A_OLD", role: "A", price: 76 },
      ];
      const r = validateConfirmations(batch, TEAMS);
      expect(r.ok).toBe(false);
      expect(r.issues).toEqual([
        { index: 2, fantaTeamId: "psg", playerId: "A_OLD", violation: "team-hard-reserve-broken" },
      ]);
    });

    it("does not double-report when team-budget-exceeded already fired (spend > 500)", () => {
      const batch: ConfirmationInput[] = [
        { fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price: 300 },
        { fantaTeamId: "psg", playerId: "C_OLD_1", role: "C", price: 201 },
      ];
      const r = validateConfirmations(batch, TEAMS);
      expect(r.issues.map((i) => i.violation)).toEqual(["team-budget-exceeded"]);
    });

    it("reduce() throws with the new violation code for a hard-reserve-breaking batch", () => {
      const invalid: ConfirmationInput[] = [
        { fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price: 474 },
      ];
      expect(() => reduce([], TEAMS, invalid)).toThrow(/team-hard-reserve-broken/);
    });
  });

  it("reports multiple violations at once for a single bad entry (P + invalid price)", () => {
    const r = validateConfirmations(
      [{ fantaTeamId: "psg", playerId: "P_OLD_1", role: "P", price: 0 }],
      TEAMS,
    );
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.violation).sort()).toEqual(
      ["price-invalid", "role-not-confirmable"].sort(),
    );
  });

  it("reports every offending entry across an otherwise-valid batch", () => {
    const batch: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price: 20 }, // ok
      { fantaTeamId: "ghost", playerId: "X1", role: "D", price: 10 }, // unknown-team
      { fantaTeamId: "psg", playerId: "P_OLD_1", role: "P", price: 5 }, // role-not-confirmable
    ];
    const r = validateConfirmations(batch, TEAMS);
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([
      { index: 1, fantaTeamId: "ghost", playerId: "X1", violation: "unknown-team" },
      { index: 2, fantaTeamId: "psg", playerId: "P_OLD_1", violation: "role-not-confirmable" },
    ]);
  });
});

describe("reduce — confirmations seed the initial state (LEAGUE_RULES §4)", () => {
  it("without confirmations, behaviour is byte-identical to before this tranche", () => {
    const withoutArg = reduce(syntheticLog(), TEAMS);
    const withEmptyArray = reduce(syntheticLog(), TEAMS, []);
    expect(JSON.stringify(withEmptyArray)).toBe(JSON.stringify(withoutArg));
    // and the well-known Sprint-1 invariants still hold verbatim
    expect(withoutArg.teams["new_milf"]!.budgetResidual).toBe(500 - 124);
    expect(withoutArg.teams["ataturk"]!.spent).toBe(7);
  });

  it("a single confirmation reduces budget and fills exactly one role slot", () => {
    const confirmations: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD_1", role: "D", price: 35 },
    ];
    const s = reduce([], TEAMS, confirmations);
    const t = s.teams["psg"]!;
    expect(t.budgetResidual).toBe(INITIAL_BUDGET - 35);
    expect(t.spent).toBe(35);
    expect(t.filled).toEqual({ P: 0, D: 1, C: 0, A: 0 });
    expect(t.slotsRemaining.D).toBe(ROSTER_REQUIREMENTS.D - 1);
    expect(t.totalSlotsRemaining).toBe(28 - 1);
    expect(t.roster.map((r) => r.playerId)).toEqual(["D_OLD_1"]);
    expect(s.purchasedPlayerIds).toContain("D_OLD_1");
  });

  it("the maximum riconferme batch (0P/1D/1C/1A) reduces budget and slots for all three roles", () => {
    const confirmations: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD", role: "D", price: 20 },
      { fantaTeamId: "psg", playerId: "C_OLD", role: "C", price: 15 },
      { fantaTeamId: "psg", playerId: "A_OLD", role: "A", price: 40 },
    ];
    const t = reduce([], TEAMS, confirmations).teams["psg"]!;
    expect(t.spent).toBe(75);
    expect(t.budgetResidual).toBe(INITIAL_BUDGET - 75);
    expect(t.filled).toEqual({ P: 0, D: 1, C: 1, A: 1 });
    expect(t.slotsRemaining).toEqual({ P: 3, D: 8, C: 8, A: 6 });
    expect(t.totalSlotsRemaining).toBe(25);
  });

  it("confirmations for one team never affect another team's state", () => {
    const confirmations: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD", role: "D", price: 20 },
    ];
    const s = reduce([], TEAMS, confirmations);
    for (const id of TEAMS) {
      if (id === "psg") continue;
      const t = s.teams[id]!;
      expect(t.budgetResidual).toBe(INITIAL_BUDGET);
      expect(t.totalSlotsRemaining).toBe(28);
      expect(t.roster).toEqual([]);
    }
  });

  it("throws (fail-closed) on an invalid confirmations batch instead of building a wrong state", () => {
    const invalid: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "P_OLD", role: "P", price: 5 },
    ];
    expect(() => reduce([], TEAMS, invalid)).toThrow(/invalid confirmations/);
    expect(() => reduce([], TEAMS, invalid)).toThrow(/role-not-confirmable/);
  });

  it("throws on a confirmations batch that exceeds a team's budget", () => {
    const invalid: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD", role: "D", price: 300 },
      { fantaTeamId: "psg", playerId: "C_OLD", role: "C", price: 250 },
    ];
    expect(() => reduce([], TEAMS, invalid)).toThrow(/team-budget-exceeded/);
  });

  it("is deterministic: same confirmations + same log -> same state", () => {
    const confirmations: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD", role: "D", price: 20 },
    ];
    const a = reduce(syntheticLog(), TEAMS, confirmations);
    const b = reduce(syntheticLog(), TEAMS, confirmations);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("roster order is confirmations first, then live purchases in seq order", () => {
    const confirmations: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD", role: "D", price: 20 },
    ];
    const log: AuctionEvent[] = [
      { type: "PURCHASE", seq: 0, ts: TS, playerId: "A_NEW", role: "A", fantaTeamId: "psg", price: 30 },
    ];
    const t = reduce(log, TEAMS, confirmations).teams["psg"]!;
    expect(t.roster.map((r) => r.playerId)).toEqual(["D_OLD", "A_NEW"]);
  });
});

describe("reduce + confirmations — existing arithmetic (maxSafe/hardReserve/budgetPlan/purchaseFeasibility) needs zero changes", () => {
  const confirmations: ConfirmationInput[] = [
    { fantaTeamId: "psg", playerId: "D_OLD", role: "D", price: 35 },
  ];

  it("maxSafe on the confirmed initial state matches hand arithmetic (27 slots, not 28)", () => {
    const t = reduce([], TEAMS, confirmations).teams["psg"]!;
    const r = maxSafe(t, "A");
    // 27 slots remain after the riconferma; buying one A leaves 26 to reserve
    expect(t.totalSlotsRemaining).toBe(27);
    expect(r.hardReserve).toBe(26);
    expect(r.maxSafe).toBe(INITIAL_BUDGET - 35 - 26);
    expect(r.biddable).toBe(true);
  });

  it("the confirmed role still has live-purchase headroom (1 riconferma consumes only 1 of 9 D slots)", () => {
    // LEAGUE_RULES §4 caps riconferme at 1 D, not the whole D roster (9 slots)
    const t = reduce([], TEAMS, confirmations).teams["psg"]!;
    const r = maxSafe(t, "D");
    expect(t.slotsRemaining.D).toBe(ROSTER_REQUIREMENTS.D - 1);
    expect(r.biddable).toBe(true);
  });

  it("maxSafe correctly reports role-full once a role's live slots also run out on top of a riconferma", () => {
    // fill psg's remaining 6 A slots live (A itself has no riconferma here)
    const log: AuctionEvent[] = [];
    let seq = 0;
    for (let i = 1; i <= 7; i++) {
      log.push({ type: "PURCHASE", seq: seq++, ts: TS, playerId: `A${i}`, role: "A", fantaTeamId: "psg", price: 1 });
    }
    const t = reduce(log, TEAMS, confirmations).teams["psg"]!;
    const r = maxSafe(t, "A");
    expect(t.slotsRemaining.A).toBe(0);
    expect(r.biddable).toBe(false);
    expect(r.reason).toBe("role-full");
  });

  it("budgetPlan reflects the reduced budget and slot count with no code change needed", () => {
    const t = reduce([], TEAMS, confirmations).teams["psg"]!;
    const plan = budgetPlan(t);
    expect(plan.totalSlotsRemaining).toBe(27);
    expect(plan.totalReserve).toBe(27);
    expect(plan.freeBudget).toBe(INITIAL_BUDGET - 35 - 27);
    expect(plan.isCompletable).toBe(true);
  });

  it("purchaseFeasibility rejects a live bid on an already-confirmed player as duplicate-player", () => {
    const s = reduce([], TEAMS, confirmations);
    const r = purchaseFeasibility(s, { playerId: "D_OLD", role: "D", fantaTeamId: "ataturk", price: 5 });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("duplicate-player");
  });

  it("recordPurchase on top of a confirmed state produces a coherent, still-completable roster", () => {
    const s0 = reduce([], TEAMS, confirmations);
    const log = recordPurchase([], s0, { playerId: "C_NEW", role: "C", fantaTeamId: "psg", price: 40 }, TS);
    const t = reduce(log, TEAMS, confirmations).teams["psg"]!;
    expect(t.spent).toBe(35 + 40);
    expect(t.filled).toEqual({ P: 0, D: 1, C: 1, A: 0 });
    expect(t.budgetResidual).toBeGreaterThanOrEqual(t.totalSlotsRemaining * 1);
  });

  it("recordPurchase still rejects a bid that would break hard reserve on the confirmed (smaller) state", () => {
    const s0 = reduce([], TEAMS, confirmations);
    // budget residual is 465 over 27 slots; buying one leaves 26 to reserve at floor
    // max feasible = 465 - 26 = 439
    expect(() =>
      recordPurchase([], s0, { playerId: "A_TOO_EXPENSIVE", role: "A", fantaTeamId: "psg", price: 440 }, TS),
    ).toThrow(/infeasible purchase/);
    const okLog = recordPurchase([], s0, { playerId: "A_OK", role: "A", fantaTeamId: "psg", price: 439 }, TS);
    expect(okLog.length).toBe(1);
  });
});

describe("undo/replay stays intact on top of a confirmed initial state", () => {
  const confirmations: ConfirmationInput[] = [
    { fantaTeamId: "psg", playerId: "D_OLD", role: "D", price: 35 },
  ];

  it("a VOID on a live purchase restores budget/slots to the confirmed baseline, not to raw INITIAL_BUDGET", () => {
    const s0 = reduce([], TEAMS, confirmations);
    const afterBuy = recordPurchase([], s0, { playerId: "C_NEW", role: "C", fantaTeamId: "psg", price: 40 }, TS);
    const bought = reduce(afterBuy, TEAMS, confirmations).teams["psg"]!;
    expect(bought.spent).toBe(75);
    expect(bought.filled.C).toBe(1);

    const afterVoid = recordVoid(afterBuy, afterBuy[afterBuy.length - 1]!.seq, TS);
    const undone = reduce(afterVoid, TEAMS, confirmations).teams["psg"]!;
    expect(undone.spent).toBe(35); // only the riconferma remains
    expect(undone.budgetResidual).toBe(INITIAL_BUDGET - 35);
    expect(undone.filled).toEqual({ P: 0, D: 1, C: 0, A: 0 });
    expect(undone.roster.map((r) => r.playerId)).toEqual(["D_OLD"]);
  });

  it("replay is order-independent regardless of confirmations (same log, shuffled -> same state)", () => {
    const s0 = reduce([], TEAMS, confirmations);
    const log = recordPurchase([], s0, { playerId: "C_NEW", role: "C", fantaTeamId: "psg", price: 40 }, TS);
    const shuffled = [...log].reverse();
    expect(JSON.stringify(reduce(shuffled, TEAMS, confirmations))).toBe(
      JSON.stringify(reduce(log, TEAMS, confirmations)),
    );
  });

  it("the live VOID mechanism cannot target a confirmation (it never enters the event log)", () => {
    // voidFeasibility/recordVoid operate on `log` seq values only (>= 0 by
    // schema); confirmations are seeded with negative seq and never enter the
    // event log, so there is no seq to target. Proven here by INVOKING the
    // real rejection path (not by re-asserting the seeding implementation).
    const s = reduce([], TEAMS, confirmations);
    const confirmedSeq = s.teams["psg"]!.roster[0]!.seq;
    expect(confirmedSeq).toBe(-1); // the single confirmation's own actual seq

    // on an empty log, the confirmation's seq is simply not found
    expect(voidFeasibility([], confirmedSeq)).toEqual({ ok: false, violations: ["target-not-found"] });
    expect(() => recordVoid([], confirmedSeq, TS)).toThrow(/target-not-found/);

    // still not found even with a live log present (seq -1 never appears in it)
    const log: AuctionEvent[] = [
      { type: "PURCHASE", seq: 0, ts: TS, playerId: "C_NEW", role: "C", fantaTeamId: "psg", price: 40 },
    ];
    expect(voidFeasibility(log, confirmedSeq).violations).toEqual(["target-not-found"]);
    expect(() => recordVoid(log, confirmedSeq, TS)).toThrow(/target-not-found/);

    // structural guarantee retained: every confirmed roster entry has seq < 0,
    // i.e. strictly below any live event's seq (>= 0 by schema)
    expect(s.teams["psg"]!.roster.every((r) => r.seq < 0)).toBe(true);
  });
});

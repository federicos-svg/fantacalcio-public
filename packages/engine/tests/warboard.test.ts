import { describe, it, expect } from "vitest";
import {
  reduce,
  maxSafe,
  warBoardRows,
  INITIAL_BUDGET,
  ROSTER_REQUIREMENTS,
  TOTAL_SLOTS,
  type AuctionEvent,
  type ConfirmationInput,
} from "../src/index.js";
import { FANTA_TEAM_IDS, syntheticLog } from "../fixtures/synthetic.js";

const TEAMS = FANTA_TEAM_IDS;
const TS = "2026-08-01T09:00:00Z";

describe("warBoardRows — TAVOLO war board (#231 tranche 3, pure accounting only)", () => {
  it("returns exactly one row per team, sorted deterministically by fantaTeamId", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const rows = warBoardRows(s);
    expect(rows.length).toBe(TEAMS.length);
    expect(rows.map((r) => r.fantaTeamId)).toEqual(
      [...TEAMS].sort((a, b) => a.localeCompare(b)),
    );
  });

  it("includes self — unlike opponentTier1(), which excludes it", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const rows = warBoardRows(s, "new_milf");
    expect(rows.find((r) => r.fantaTeamId === "new_milf")).toBeDefined();
  });

  it("tags exactly the matching row isSelf:true, all others false", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const rows = warBoardRows(s, "ataturk");
    for (const r of rows) {
      expect(r.isSelf).toBe(r.fantaTeamId === "ataturk");
    }
    expect(rows.filter((r) => r.isSelf).length).toBe(1);
  });

  it("with no selfId, every row is isSelf:false", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const rows = warBoardRows(s);
    expect(rows.every((r) => r.isSelf === false)).toBe(true);
  });

  it("with a selfId not among the teams, every row is isSelf:false", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const rows = warBoardRows(s, "ghost_team");
    expect(rows.every((r) => r.isSelf === false)).toBe(true);
  });

  it("budgetResidual, slotsRemaining and totalSlotsRemaining mirror TeamState exactly", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const rows = warBoardRows(s);
    for (const r of rows) {
      const t = s.teams[r.fantaTeamId]!;
      expect(r.budgetResidual).toBe(t.budgetResidual);
      expect(r.slotsRemaining).toEqual(t.slotsRemaining);
      expect(r.totalSlotsRemaining).toBe(t.totalSlotsRemaining);
    }
    // spot check against the well-known synthetic-log figure (engine.test.ts #8)
    const milf = rows.find((r) => r.fantaTeamId === "new_milf")!;
    expect(milf.budgetResidual).toBe(500 - 124);
  });

  it("maxBid is the unmodified maxSafe() result for an open role (empty roster: 27 reserve, biddable)", () => {
    const s = reduce([], TEAMS);
    const rows = warBoardRows(s);
    const row = rows.find((r) => r.fantaTeamId === "new_milf")!;
    expect(row.maxBid).toEqual(maxSafe(s.teams["new_milf"]!, "P"));
    expect(row.maxBid.biddable).toBe(true);
    expect(row.maxBid.hardReserve).toBe(27);
    expect(row.maxBid.maxSafe).toBe(500 - 27);
  });

  it("maxBid is role-invariant: identical across every currently-open role for the same team", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const t = s.teams["new_milf"]!;
    const row = warBoardRows(s).find((r) => r.fantaTeamId === "new_milf")!;
    for (const role of ["P", "D", "C", "A"] as const) {
      if (t.slotsRemaining[role] > 0) {
        expect(maxSafe(t, role)).toEqual(row.maxBid);
      }
    }
  });

  it("maxBid reflects a confirmed (riconferma) initial state with no special-casing needed", () => {
    const confirmations: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD", role: "D", price: 35 },
    ];
    const s = reduce([], TEAMS, confirmations);
    const row = warBoardRows(s).find((r) => r.fantaTeamId === "psg")!;
    // 27 slots remain after the riconferma (28 - 1); buying one leaves 26 to reserve
    expect(row.totalSlotsRemaining).toBe(27);
    expect(row.maxBid.hardReserve).toBe(26);
    expect(row.maxBid.maxSafe).toBe(INITIAL_BUDGET - 35 - 26);
    expect(row.maxBid.biddable).toBe(true);
  });

  it("a team with a completely full roster (every role full) is not biddable, maxBid.maxSafe is 0", () => {
    const log: AuctionEvent[] = [];
    let seq = 0;
    const fill: Array<["P" | "D" | "C" | "A", number]> = [
      ["P", ROSTER_REQUIREMENTS.P],
      ["D", ROSTER_REQUIREMENTS.D],
      ["C", ROSTER_REQUIREMENTS.C],
      ["A", ROSTER_REQUIREMENTS.A],
    ];
    for (const [role, count] of fill) {
      for (let i = 1; i <= count; i++) {
        log.push({
          type: "PURCHASE",
          seq: seq++,
          ts: TS,
          playerId: `${role}${i}`,
          role,
          fantaTeamId: "psg",
          price: 1,
        });
      }
    }
    const s = reduce(log, TEAMS);
    const row = warBoardRows(s).find((r) => r.fantaTeamId === "psg")!;
    expect(row.totalSlotsRemaining).toBe(0);
    expect(row.maxBid.biddable).toBe(false);
    expect(row.maxBid.reason).toBe("role-full");
    expect(row.maxBid.maxSafe).toBe(0);
    expect(TOTAL_SLOTS).toBe(28); // sanity: fill list above covers every slot
  });

  it("acquisitions is the FULL roster in reverse-chronological order (most recent purchase first), never truncated", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const row = warBoardRows(s).find((r) => r.fantaTeamId === "new_milf")!;
    // buy order was A1 (seq0) then D1 (seq2) -> reversed: D1, A1
    expect(row.acquisitions.map((a) => a.playerId)).toEqual(["D1", "A1"]);
    expect(row.acquisitions.length).toBe(s.teams["new_milf"]!.roster.length);
  });

  it("acquisitions excludes a voided purchase and shows only the surviving re-entry", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const row = warBoardRows(s).find((r) => r.fantaTeamId === "ataturk")!;
    // D2 was bought wrong at 999 (seq3), voided (seq4), re-bought at 7 (seq5)
    expect(row.acquisitions).toEqual([
      { playerId: "D2", role: "D", price: 7, seq: 5 },
    ]);
  });

  it("a team with zero acquisitions has an empty acquisitions array, not omitted from the board", () => {
    const s = reduce(syntheticLog(), TEAMS);
    // syntheticLog() never touches new_casatiello
    const untouched = warBoardRows(s).find((r) => r.fantaTeamId === "new_casatiello")!;
    expect(untouched.acquisitions).toEqual([]);
    expect(untouched.budgetResidual).toBe(INITIAL_BUDGET);
    expect(untouched.totalSlotsRemaining).toBe(TOTAL_SLOTS);
  });

  it("riconferme sort before live purchases ascending, so reversed acquisitions surface live purchases first and riconferme last", () => {
    const confirmations: ConfirmationInput[] = [
      { fantaTeamId: "psg", playerId: "D_OLD", role: "D", price: 20 },
    ];
    const log: AuctionEvent[] = [
      { type: "PURCHASE", seq: 0, ts: TS, playerId: "A_NEW", role: "A", fantaTeamId: "psg", price: 30 },
    ];
    const s = reduce(log, TEAMS, confirmations);
    const row = warBoardRows(s).find((r) => r.fantaTeamId === "psg")!;
    expect(row.acquisitions.map((a) => a.playerId)).toEqual(["A_NEW", "D_OLD"]);
  });

  it("is deterministic: same AuctionState -> byte-identical rows every call", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const a = warBoardRows(s, "psg");
    const b = warBoardRows(s, "psg");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("no field carries a model/value/psychology reading — accounting only", () => {
    const s = reduce(syntheticLog(), TEAMS);
    const rows = warBoardRows(s);
    const banned = ["value", "fairtome", "targetband", "score", "tilt", "modifier"];
    for (const row of rows) {
      const keys = Object.keys(row).map((k) => k.toLowerCase());
      for (const b of banned) {
        expect(keys.some((k) => k.includes(b))).toBe(false);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import type { AuctionEvent } from "../packages/engine/src/types.js";
import { reduce } from "../packages/engine/src/reduce.js";
import {
  executeAssignCommand,
  parseAssignCommand,
  resolveAssignCommand,
  type AssignCommandContext,
  type AssignCommandPlayer,
  type AssignCommandSeat,
} from "./assignCommand.js";
import type { StorageLike } from "./logRecovery.js";

// Synthetic fixtures only — invented names, no real player, club or price
// from any listone or provider.
const SEATS: readonly AssignCommandSeat[] = [
  { fantaTeamId: "Io", label: "Io" },
  { fantaTeamId: "Squadra2", label: "Look" },
  { fantaTeamId: "Squadra3", label: "Lookalike" },
  { fantaTeamId: "Squadra4", label: "Città Nord" },
];

const POOL: readonly AssignCommandPlayer[] = [
  { playerId: "p-ataturk-alfa", name: "Ataturk", club: "Alfa", role: "A" },
  { playerId: "p-ataturk-beta", name: "Ataturk", club: "Beta", role: "C" },
  { playerId: "p-atarashi", name: "Atarashi", club: "Gamma", role: "D" },
  { playerId: "p-bruyn", name: "De Bruyn", club: "Delta", role: "C" },
  { playerId: "p-eta", name: "Età", club: "Epsilon", role: "P" },
];

const context = (assigned: readonly string[] = []): AssignCommandContext => ({
  seats: SEATS,
  pool: POOL,
  assignedPlayerIds: new Set(assigned),
});

describe("parseAssignCommand", () => {
  it("parses the documented shape `<squadra> <prezzo> <giocatore>`", () => {
    expect(parseAssignCommand("look 34 ataturk")).toEqual({
      ok: true,
      parsed: { teamQuery: "look", price: 34, playerQuery: "ataturk" },
    });
  });

  it("keeps multi-word team and player queries intact", () => {
    expect(parseAssignCommand("  citta nord   12   de bruyn  ")).toEqual({
      ok: true,
      parsed: { teamQuery: "citta nord", price: 12, playerQuery: "de bruyn" },
    });
  });

  it("refuses an empty or whitespace-only line", () => {
    expect(parseAssignCommand("")).toEqual({ ok: false, reason: "empty" });
    expect(parseAssignCommand("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses a line with no price token", () => {
    expect(parseAssignCommand("look ataturk")).toEqual({ ok: false, reason: "price-missing" });
  });

  it("refuses a line with two integer tokens instead of guessing which is the price", () => {
    expect(parseAssignCommand("look 34 12 ataturk")).toEqual({
      ok: false,
      reason: "price-ambiguous",
    });
  });

  it("refuses a line missing the team or the player side", () => {
    expect(parseAssignCommand("34 ataturk")).toEqual({ ok: false, reason: "team-missing" });
    expect(parseAssignCommand("look 34")).toEqual({ ok: false, reason: "player-missing" });
  });

  it("does not treat 0, negatives or decimals as a price", () => {
    // parsePositiveIntegerPrice rejects them, so they stay part of a name
    // query and the line reports the missing price rather than recording 0.
    expect(parseAssignCommand("look 0 ataturk")).toEqual({ ok: false, reason: "price-missing" });
    expect(parseAssignCommand("look -3 ataturk")).toEqual({ ok: false, reason: "price-missing" });
    expect(parseAssignCommand("look 3.5 ataturk")).toEqual({ ok: false, reason: "price-missing" });
  });

  it("is deterministic: the same line parses the same way every time", () => {
    expect(parseAssignCommand("look 34 ataturk")).toEqual(parseAssignCommand("look 34 ataturk"));
  });
});

describe("resolveAssignCommand", () => {
  it("resolves team, price and player from one line", () => {
    const result = resolveAssignCommand("look 34 ataturk alfa", context());
    expect(result).toEqual({
      ok: true,
      resolved: {
        fantaTeamId: "Squadra2",
        teamLabel: "Look",
        playerId: "p-ataturk-alfa",
        playerName: "Ataturk",
        club: "Alfa",
        role: "A",
        price: 34,
      },
    });
  });

  it("prefers an exact team label over a longer one that merely contains it", () => {
    // "Look" is a strict prefix of "Lookalike": without tier ordering this
    // would be ambiguous and the fast path would be unusable.
    const result = resolveAssignCommand("look 5 atarashi", context());
    expect(result.ok && result.resolved.fantaTeamId).toBe("Squadra2");
  });

  it("reports an ambiguous team with its candidates instead of picking one", () => {
    // "loo" prefixes both "Look" and "Lookalike" and is exact for neither.
    const result = resolveAssignCommand("loo 5 atarashi", context());
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      reason: "team-ambiguous",
      candidates: ["Look", "Lookalike"],
    });
  });

  it("resolves a prefix that is unique even though it is nobody's full label", () => {
    const result = resolveAssignCommand("looka 5 atarashi", context());
    expect(result.ok && result.resolved.fantaTeamId).toBe("Squadra3");
  });

  it("matches team and player case- and accent-insensitively", () => {
    const result = resolveAssignCommand("CITTÀ NORD 7 età", context());
    expect(result.ok && result.resolved.fantaTeamId).toBe("Squadra4");
    expect(result.ok && result.resolved.playerId).toBe("p-eta");
  });

  it("reports an unknown team", () => {
    expect(resolveAssignCommand("zzz 5 atarashi", context())).toEqual({
      ok: false,
      reason: "team-not-found",
      query: "zzz",
    });
  });

  it("reports two namesakes as ambiguous, and resolves them once the club is typed", () => {
    const ambiguous = resolveAssignCommand("look 34 ataturk", context());
    expect(ambiguous).toMatchObject({
      reason: "player-ambiguous",
      candidates: ["Ataturk (Alfa)", "Ataturk (Beta)"],
    });

    const resolved = resolveAssignCommand("look 34 ataturk beta", context());
    expect(resolved.ok && resolved.resolved.playerId).toBe("p-ataturk-beta");
  });

  it("reports an unknown player", () => {
    expect(resolveAssignCommand("look 5 zzz", context())).toEqual({
      ok: false,
      reason: "player-not-found",
      query: "zzz",
    });
  });

  it("distinguishes an already-assigned player from a typo", () => {
    expect(resolveAssignCommand("look 5 atarashi", context(["p-atarashi"]))).toEqual({
      ok: false,
      reason: "player-already-assigned",
      query: "atarashi",
      playerName: "Atarashi (Gamma)",
    });
  });

  it("lets an assigned namesake disappear so the remaining one resolves", () => {
    const result = resolveAssignCommand("look 34 ataturk", context(["p-ataturk-alfa"]));
    expect(result.ok && result.resolved.playerId).toBe("p-ataturk-beta");
  });

  it("propagates a parse failure unchanged", () => {
    expect(resolveAssignCommand("look ataturk", context())).toEqual({
      ok: false,
      reason: "price-missing",
    });
  });

  it("is deterministic: the same line and context resolve identically", () => {
    expect(resolveAssignCommand("look 34 ataturk alfa", context())).toEqual(
      resolveAssignCommand("look 34 ataturk alfa", context()),
    );
  });
});

// ── Execution ────────────────────────────────────────────────────────────────

const FANTA_TEAM_IDS = ["Io", "Squadra2", "Squadra3", "Squadra4"] as const;

class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

class RejectingStorage implements StorageLike {
  getItem(): string | null {
    return null;
  }
  setItem(): void {
    throw new Error("quota exceeded");
  }
  removeItem(): void {}
}

const resolvedOf = (line: string, assigned: readonly string[] = []) => {
  const result = resolveAssignCommand(line, context(assigned));
  if (!result.ok) throw new Error(`fixture line did not resolve: ${result.reason}`);
  return result.resolved;
};

const TS = "2026-09-03T18:00:00.000Z";

describe("executeAssignCommand", () => {
  it("appends exactly one PURCHASE and persists it", () => {
    const storage = new MemoryStorage();
    const log: readonly AuctionEvent[] = [];
    const result = executeAssignCommand(
      storage,
      log,
      reduce(log, FANTA_TEAM_IDS),
      resolvedOf("look 34 ataturk alfa"),
      TS,
      FANTA_TEAM_IDS,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({
      type: "PURCHASE",
      seq: 0,
      ts: TS,
      playerId: "p-ataturk-alfa",
      role: "A",
      fantaTeamId: "Squadra2",
      price: 34,
    });

    const state = reduce(result.events, FANTA_TEAM_IDS);
    expect(state.teams.Squadra2!.budgetResidual).toBe(500 - 34);
    expect(state.teams.Squadra2!.slotsRemaining.A).toBe(6);
    // Never mutates the input log.
    expect(log).toHaveLength(0);
  });

  it("refuses a purchase that would break the hard reserve, without writing", () => {
    const storage = new MemoryStorage();
    const log: readonly AuctionEvent[] = [];
    // 28 mandatory slots, budget 500: spending 500 on the first player leaves
    // 27 slots unfillable at the floor. max_safe stays non-overridable.
    const result = executeAssignCommand(
      storage,
      log,
      reduce(log, FANTA_TEAM_IDS),
      { ...resolvedOf("look 34 ataturk alfa"), price: 500 },
      TS,
      FANTA_TEAM_IDS,
    );

    expect(result).toEqual({ ok: false, reason: "not-feasible", violations: ["breaks-hard-reserve"] });
    expect(storage.getItem("fac_log")).toBeNull();
  });

  it("refuses a duplicate player", () => {
    const storage = new MemoryStorage();
    const first = executeAssignCommand(
      storage,
      [],
      reduce([], FANTA_TEAM_IDS),
      resolvedOf("look 34 ataturk alfa"),
      TS,
      FANTA_TEAM_IDS,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const again = executeAssignCommand(
      storage,
      first.events,
      reduce(first.events, FANTA_TEAM_IDS),
      { ...resolvedOf("look 34 ataturk alfa"), fantaTeamId: "Squadra3", teamLabel: "Lookalike" },
      TS,
      FANTA_TEAM_IDS,
    );
    expect(again).toEqual({ ok: false, reason: "not-feasible", violations: ["duplicate-player"] });
  });

  it("surfaces a storage failure instead of reporting a save that did not happen", () => {
    const result = executeAssignCommand(
      new RejectingStorage(),
      [],
      reduce([], FANTA_TEAM_IDS),
      resolvedOf("look 34 ataturk alfa"),
      TS,
      FANTA_TEAM_IDS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).not.toBe("not-feasible");
  });

  it("is deterministic: the same inputs produce the same event", () => {
    const a = executeAssignCommand(
      new MemoryStorage(),
      [],
      reduce([], FANTA_TEAM_IDS),
      resolvedOf("look 34 ataturk alfa"),
      TS,
      FANTA_TEAM_IDS,
    );
    const b = executeAssignCommand(
      new MemoryStorage(),
      [],
      reduce([], FANTA_TEAM_IDS),
      resolvedOf("look 34 ataturk alfa"),
      TS,
      FANTA_TEAM_IDS,
    );
    expect(a).toEqual(b);
  });
});

// Tranche 2b (#231): confirmations threading. `state` here is what the
// caller (main.ts) derives via reduce(log, teamIds, confirmations) — a
// confirmed player already shows up in state.purchasedPlayerIds, so
// purchaseFeasibility refuses it as duplicate-player exactly like any other
// already-bought player: no new violation code, no new UI state.
describe("executeAssignCommand — confirmations threading (tranche 2b)", () => {
  const CONFIRM = { fantaTeamId: "Squadra3", playerId: "p-ataturk-alfa", role: "A" as const, price: 80 };

  it("end-to-end: a confirmed player cannot be purchased live (duplicate-player)", () => {
    const storage = new MemoryStorage();
    const log: readonly AuctionEvent[] = [];
    const state = reduce(log, FANTA_TEAM_IDS, [CONFIRM]);
    expect(state.purchasedPlayerIds).toContain("p-ataturk-alfa");

    const result = executeAssignCommand(
      storage,
      log,
      state,
      resolvedOf("look 34 ataturk alfa"),
      TS,
      FANTA_TEAM_IDS,
      [CONFIRM],
    );
    expect(result).toEqual({ ok: false, reason: "not-feasible", violations: ["duplicate-player"] });
    expect(storage.getItem("fac_log")).toBeNull();
  });

  it("passes confirmations through to the save so it validates/rebaselines against them", () => {
    const storage = new MemoryStorage();
    const log: readonly AuctionEvent[] = [];
    const result = executeAssignCommand(
      storage,
      log,
      reduce(log, FANTA_TEAM_IDS, [CONFIRM]),
      resolvedOf("citta nord 12 de bruyn"),
      TS,
      FANTA_TEAM_IDS,
      [CONFIRM],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The saved TeamState (via saveAuctionLog's own validateAuctionLog) is
    // consistent with the same confirmations — Squadra3's confirmed slot is
    // reflected even though this purchase was for a different team.
    const state = reduce(result.events, FANTA_TEAM_IDS, [CONFIRM]);
    expect(state.teams.Squadra3!.budgetResidual).toBe(500 - 80);
  });

  it("omitted confirmations reproduces prior behaviour exactly (default [])", () => {
    const storage = new MemoryStorage();
    const withDefault = executeAssignCommand(storage, [], reduce([], FANTA_TEAM_IDS), resolvedOf("look 34 ataturk alfa"), TS, FANTA_TEAM_IDS);
    const storage2 = new MemoryStorage();
    const withEmpty = executeAssignCommand(storage2, [], reduce([], FANTA_TEAM_IDS), resolvedOf("look 34 ataturk alfa"), TS, FANTA_TEAM_IDS, []);
    expect(withDefault).toEqual(withEmpty);
  });
});

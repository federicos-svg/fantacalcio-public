import { describe, expect, it } from "vitest";
import type { AuctionEvent } from "../packages/engine/src/types.js";
import { effectivePurchases, rolePriceFacts, roleTopPurchases } from "./nominationContext.js";

// Synthetic log only — no real player, club or price from any source.
const purchase = (
  seq: number,
  playerId: string,
  role: "P" | "D" | "C" | "A",
  fantaTeamId: string,
  price: number,
): AuctionEvent => ({ type: "PURCHASE", seq, ts: "2026-09-03T18:00:00.000Z", playerId, role, fantaTeamId, price });

const voidOf = (seq: number, targetSeq: number): AuctionEvent => ({
  type: "VOID",
  seq,
  ts: "2026-09-03T18:00:00.000Z",
  targetSeq,
});

const LOG: readonly AuctionEvent[] = [
  purchase(0, "alfa__uno", "A", "Io", 40),
  purchase(1, "beta__due", "A", "Squadra2", 55),
  purchase(2, "gamma__tre", "C", "Squadra3", 30),
  purchase(3, "delta__quattro", "A", "Squadra4", 55),
  purchase(4, "epsilon__cinque", "A", "Squadra5", 12),
  voidOf(5, 4),
];

describe("effectivePurchases", () => {
  it("drops a voided purchase and keeps log order", () => {
    expect(effectivePurchases(LOG).map((e) => e.seq)).toEqual([0, 1, 2, 3]);
  });

  it("is empty for an empty log", () => {
    expect(effectivePurchases([])).toEqual([]);
  });

  it("ignores a VOID whose target is not in the log", () => {
    expect(effectivePurchases([purchase(0, "alfa__uno", "A", "Io", 40), voidOf(1, 99)])).toHaveLength(1);
  });
});

describe("rolePriceFacts", () => {
  it("counts only standing purchases of the asked role", () => {
    expect(rolePriceFacts(LOG, "A")).toEqual({
      purchases: 3,
      minPrice: 40,
      maxPrice: 55,
      totalSpent: 150,
    });
  });

  it("reports null extremes — never 0 — when the role has no purchase yet", () => {
    expect(rolePriceFacts(LOG, "P")).toEqual({
      purchases: 0,
      minPrice: null,
      maxPrice: null,
      totalSpent: 0,
    });
  });

  it("excludes the voided purchase from the extremes", () => {
    // seq 4 was the cheapest A at 12 cr and is voided: min must be 40, not 12.
    expect(rolePriceFacts(LOG, "A").minPrice).toBe(40);
  });
});

describe("roleTopPurchases", () => {
  it("orders by price descending, breaking ties by seq ascending", () => {
    expect(roleTopPurchases(LOG, "A", 5).map((p) => [p.seq, p.price])).toEqual([
      [1, 55],
      [3, 55],
      [0, 40],
    ]);
  });

  it("respects the limit", () => {
    expect(roleTopPurchases(LOG, "A", 2).map((p) => p.seq)).toEqual([1, 3]);
  });

  it("returns nothing for a non-positive limit or an untouched role", () => {
    expect(roleTopPurchases(LOG, "A", 0)).toEqual([]);
    expect(roleTopPurchases(LOG, "P", 5)).toEqual([]);
  });

  it("never lists a voided purchase", () => {
    expect(roleTopPurchases(LOG, "A", 10).map((p) => p.playerId)).not.toContain("epsilon__cinque");
  });

  it("is deterministic: repeated calls on the same log give the same order", () => {
    expect(roleTopPurchases(LOG, "A", 5)).toEqual(roleTopPurchases(LOG, "A", 5));
  });
});

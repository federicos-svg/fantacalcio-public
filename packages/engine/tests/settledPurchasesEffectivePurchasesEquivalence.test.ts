import { describe, it, expect } from "vitest";
import { settledPurchases, type AuctionEvent, type PurchaseEvent } from "../src/index.js";
// Cross-boundary import by necessity, same precedent as
// packages/xlsx-adapter/tests/parseListoneXlsx.test.ts importing
// ../../../src/ui/listone.js: this test exists specifically to compare two
// implementations that live on opposite sides of the engine/UI boundary.
import { effectivePurchases } from "../../../src/nominationContext.js";

// FINDING-5 (audit coerenza 14/08, BASSA).
//
// `settledPurchases` (packages/engine/src/anchors.ts) and `effectivePurchases`
// (src/nominationContext.ts) are two independent implementations of the same
// notion — the PURCHASE events still standing, i.e. not compensated by a
// later VOID. They are kept as separate copies ON PURPOSE: see the
// disclosure comment directly above `settledPurchases` in
// packages/engine/src/anchors.ts ("`src/nominationContext.ts` tiene una
// funzione locale equivalente... perché le due copie vivono su lati opposti
// del confine engine/UI e questa tranche non tocca `src/`"). A drift guard
// for that duplication is what this file is.
//
// The two are NOT guaranteed to return array-identical order, and this test
// deliberately proves that rather than assuming it away:
//  - `settledPurchases` explicitly re-sorts its result ascending by `seq`
//    (packages/engine/src/anchors.ts), the same "deterministic order =
//    purchase order" posture `reduce()`'s `buildTeam()` applies to a team's
//    roster (packages/engine/src/reduce.ts).
//  - `effectivePurchases` explicitly preserves the log's own array order
//    instead ("Log order preserved" — src/nominationContext.ts) and never
//    sorts.
// `PurchaseEvent.seq` is documented as "strictly increasing, assigned on
// append" (packages/engine/src/types.ts), so in the ordinary case — a log
// exactly as appended — array order already equals seq order and the two
// functions agree byte-for-byte. But nothing in either function's signature
// requires its input to already be in that order (e.g. a load path could
// hand either one a stored/merged log whose array order does not match
// `seq`), so this test also feeds both a log that is deliberately NOT
// seq-ordered — the one case that can actually tell the two apart. In that
// case "equivalent" is checked as SETS (same standing purchases, compared
// sorted by seq), and the resulting order divergence between the two is
// asserted explicitly rather than left as an unexamined assumption.

function purchase(seq: number, playerId: string, price: number): PurchaseEvent {
  return {
    type: "PURCHASE",
    seq,
    ts: "2026-09-03T20:00:00Z",
    playerId,
    role: "A",
    fantaTeamId: "team_a",
    price,
  };
}

function voidEvent(seq: number, targetSeq: number): AuctionEvent {
  return { type: "VOID", seq, ts: "2026-09-03T20:00:00Z", targetSeq };
}

function seqsSorted(events: readonly { readonly seq: number }[]): readonly number[] {
  return events.map((e) => e.seq).sort((a, b) => a - b);
}

describe("settledPurchases / effectivePurchases — equivalence drift guard (audit 14/08 FINDING-5)", () => {
  it("agree byte-for-byte on an ordinary seq-ascending log with a VOID", () => {
    const log: AuctionEvent[] = [
      purchase(0, "synthetic_p1", 10),
      purchase(1, "synthetic_p2", 20),
      voidEvent(2, 1),
      purchase(3, "synthetic_p3", 30),
    ];

    const settled = settledPurchases(log);
    const effective = effectivePurchases(log);

    expect(seqsSorted(settled)).toEqual([0, 3]);
    expect(effective).toEqual(settled); // array order already matches here
  });

  it("still select the same standing purchases when the log is not stored in seq order", () => {
    // Assembled out of ascending order on purpose. A log built the ordinary
    // way (seq === array index, as every buildLog-style fixture in this repo
    // produces) can never exercise the branch this guard exists for.
    const log: AuctionEvent[] = [
      purchase(2, "synthetic_p3", 30), // array position 0, seq 2
      voidEvent(3, 1), // array position 1, seq 3 — voids seq 1
      purchase(0, "synthetic_p1", 10), // array position 2, seq 0
      purchase(1, "synthetic_p2", 20), // array position 3, seq 1 (voided)
    ];

    const settled = settledPurchases(log);
    const effective = effectivePurchases(log);

    // Same set of standing purchases either way: the two never disagree on
    // WHICH purchases survive a VOID, regardless of the log's own order.
    expect(seqsSorted(settled)).toEqual([0, 2]);
    expect(seqsSorted(effective)).toEqual([0, 2]);
    expect(seqsSorted(settled)).toEqual(seqsSorted(effective));

    // But the two are not required to (and here, do not) agree on ORDER:
    // settledPurchases guarantees ascending-seq order regardless of input
    // order...
    expect(settled.map((e) => e.seq)).toEqual([0, 2]);
    // ...while effectivePurchases preserves the log's own (here: seq 2 before
    // seq 0) array order instead. This asymmetry is deliberate (see the
    // disclosure comment cited above) — pinning it here keeps it a documented
    // choice instead of a silent one a future refactor could remove by
    // accident in only one of the two copies.
    expect(effective.map((e) => e.seq)).toEqual([2, 0]);
    expect(settled.map((e) => e.seq)).not.toEqual(effective.map((e) => e.seq));
  });

  it("agree that a fully-voided log leaves no standing purchases", () => {
    const log: AuctionEvent[] = [
      purchase(0, "synthetic_p1", 10),
      purchase(1, "synthetic_p2", 20),
      voidEvent(2, 0),
      voidEvent(3, 1),
    ];

    expect(settledPurchases(log)).toEqual([]);
    expect(effectivePurchases(log)).toEqual([]);
  });

  it("agree on an empty log", () => {
    expect(settledPurchases([])).toEqual([]);
    expect(effectivePurchases([])).toEqual([]);
  });
});

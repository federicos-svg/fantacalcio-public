import { describe, it, expect } from "vitest";
import { computeOpponentCounters, isObserved, roundTo2 } from "../src/counters.js";
import {
  COUNTER_IDS,
  DEFAULT_COUNTER_THRESHOLDS,
  type CounterId,
  type CounterResult,
  type CounterThresholds,
} from "../src/types.js";
import type { AuctionEvent } from "../../engine/src/types.js";
import {
  SYNTHETIC_SEATS,
  syntheticAnchors,
  syntheticEngagements,
  syntheticLog,
  syntheticMaxBidSnapshots,
} from "../fixtures/synthetic.js";

// Every fixture here is synthetic. See fixtures/synthetic.ts for the log:
// three standing purchases (A1 -> ataturk 60, C1 -> dinamo 30, D1 -> ataturk
// 12) plus a fourth (P1 -> psg 20) that a VOID cancels.

/** Thresholds of 1 — used to read the VALUES; the defaults gate them below. */
const PERMISSIVE: CounterThresholds = {
  winRate: 1,
  averageOverpayVsQtA: 1,
  averageDistanceFromMaxBid: 1,
  spendPaceVsTable: 1,
};

function allInputs(thresholds?: CounterThresholds) {
  return {
    events: syntheticLog(),
    fantaTeamIds: SYNTHETIC_SEATS,
    engagements: syntheticEngagements(),
    priceAnchors: syntheticAnchors(),
    maxBidSnapshots: syntheticMaxBidSnapshots(),
    ...(thresholds === undefined ? {} : { thresholds }),
  };
}

function value(result: CounterResult<number>): number | undefined {
  return isObserved(result) ? result.value : undefined;
}

describe("computeOpponentCounters — declared formulas on the synthetic log", () => {
  const counters = computeOpponentCounters(allInputs(PERMISSIVE));

  it("counts only the purchases that still stand after a VOID", () => {
    expect(value(counters.ataturk!.counters.auctionsWon)).toBe(2);
    expect(value(counters.dinamo_flavietto!.counters.auctionsWon)).toBe(1);
    // psg bought P1 and the sale was voided: the purchase never happened.
    expect(value(counters.psg!.counters.auctionsWon)).toBe(0);
  });

  it("counts distinct engaged auctions, treating a win as an implicit bid", () => {
    expect(value(counters.ataturk!.counters.auctionsEngaged)).toBe(2);
    // dinamo bid on A1 (lost), C1 (won) and P1 (voided) = 3 distinct.
    expect(value(counters.dinamo_flavietto!.counters.auctionsEngaged)).toBe(3);
    expect(value(counters.psg!.counters.auctionsEngaged)).toBe(1);
  });

  it("counts a contested loss only where an auction actually settled", () => {
    expect(value(counters.ataturk!.counters.contestedLosses)).toBe(0);
    // dinamo lost A1; P1 was voided, so it is not a loss.
    expect(value(counters.dinamo_flavietto!.counters.contestedLosses)).toBe(1);
    expect(value(counters.psg!.counters.contestedLosses)).toBe(1);
  });

  it("reports the seq of the most recent contested loss as a fact, not a tilt score", () => {
    expect(counters.ataturk!.lastContestedLossSeq).toBeNull();
    expect(counters.dinamo_flavietto!.lastContestedLossSeq).toBe(0); // A1 settled at seq 0
    expect(counters.psg!.lastContestedLossSeq).toBe(1); // C1 settled at seq 1
  });

  it("computes winRate over SETTLED engagements only", () => {
    expect(value(counters.ataturk!.counters.winRate)).toBe(1); // 2 won / 2 settled
    // dinamo engaged 3 auctions but only 2 settled (P1 was voided): 1 won of
    // 2, not 1 of 3 — an undecided auction is not a defeat.
    expect(value(counters.dinamo_flavietto!.counters.winRate)).toBe(0.5);
    expect(counters.dinamo_flavietto!.counters.winRate.n).toBe(2);
    expect(value(counters.dinamo_flavietto!.counters.auctionsEngaged)).toBe(3);
    expect(value(counters.psg!.counters.winRate)).toBe(0); // 0 won / 1 settled
  });

  it("keeps won + lost === the winRate sample, for every seat", () => {
    for (const seat of Object.values(counters)) {
      const won = value(seat.counters.auctionsWon)!;
      const lost = value(seat.counters.contestedLosses)!;
      if (won + lost === 0) continue;
      expect(seat.counters.winRate.n).toBe(won + lost);
    }
  });

  it("computes the mean overpay vs Qt.A in credits", () => {
    // ataturk: (60-45) and (12-10) -> mean 8.5
    expect(value(counters.ataturk!.counters.averageOverpayVsQtA)).toBe(8.5);
    // dinamo: (30-28) -> 2
    expect(value(counters.dinamo_flavietto!.counters.averageOverpayVsQtA)).toBe(2);
  });

  it("computes the mean distance left below the theoretical max bid", () => {
    // ataturk: (100-60) and (40-12) -> mean 34
    expect(value(counters.ataturk!.counters.averageDistanceFromMaxBid)).toBe(34);
    expect(value(counters.dinamo_flavietto!.counters.averageDistanceFromMaxBid)).toBe(60);
  });

  it("computes spend pace against the table average", () => {
    // table spend 102 over 4 seats -> average 25.5; ataturk spent 72.
    expect(value(counters.ataturk!.counters.spendPaceVsTable)).toBe(2.82);
    expect(value(counters.dinamo_flavietto!.counters.spendPaceVsTable)).toBe(1.18);
  });

  it("gives a seat that has done nothing zeros for counts, never for statistics", () => {
    const idle = counters.ac_vostra!;
    expect(value(idle.counters.auctionsWon)).toBe(0);
    expect(value(idle.counters.auctionsEngaged)).toBe(0);
    expect(idle.counters.winRate.status).toBe("insufficient-sample");
    expect(idle.counters.averageOverpayVsQtA.status).toBe("insufficient-sample");
  });
});

describe("computeOpponentCounters — declared cold start", () => {
  it("every counter exposes its own n, whatever its status", () => {
    const counters = computeOpponentCounters(allInputs());
    for (const seat of Object.values(counters)) {
      for (const id of COUNTER_IDS) {
        const result = seat.counters[id];
        expect(typeof result.n).toBe("number");
        expect(typeof result.minimumSample).toBe("number");
      }
    }
  });

  it("withholds the VALUE entirely below the minimum sample", () => {
    // With the pre-declared defaults the synthetic auction is still cold: the
    // statistics must be «campione insufficiente», not a small-sample number.
    const counters = computeOpponentCounters(allInputs());
    const ataturk = counters.ataturk!;
    expect(ataturk.counters.averageOverpayVsQtA.status).toBe("insufficient-sample");
    expect(ataturk.counters.averageOverpayVsQtA).not.toHaveProperty("value");
    expect(ataturk.counters.averageOverpayVsQtA.n).toBe(2);
    expect(ataturk.counters.averageOverpayVsQtA.minimumSample).toBe(
      DEFAULT_COUNTER_THRESHOLDS.averageOverpayVsQtA,
    );
  });

  it("never gates an exact count — a count of 2 is a complete fact", () => {
    const counters = computeOpponentCounters(allInputs());
    for (const seat of Object.values(counters)) {
      for (const id of ["auctionsWon", "auctionsEngaged", "contestedLosses"] as CounterId[]) {
        expect(seat.counters[id].status).toBe("observed");
        expect(seat.counters[id].minimumSample).toBe(0);
      }
    }
  });

  it("an exact count's value always equals its own n", () => {
    const counters = computeOpponentCounters(allInputs());
    for (const seat of Object.values(counters)) {
      const won = seat.counters.auctionsWon;
      expect(isObserved(won) && won.value === won.n).toBe(true);
    }
  });

  it("crosses from insufficient to observed exactly at the threshold", () => {
    const below = computeOpponentCounters(
      allInputs({ ...PERMISSIVE, averageOverpayVsQtA: 3 }),
    ).ataturk!;
    const at = computeOpponentCounters(
      allInputs({ ...PERMISSIVE, averageOverpayVsQtA: 2 }),
    ).ataturk!;
    expect(below.counters.averageOverpayVsQtA.status).toBe("insufficient-sample");
    expect(at.counters.averageOverpayVsQtA.status).toBe("observed");
  });

  it("reports a table that has spent nothing as insufficient, not as pace 0 or 1", () => {
    const counters = computeOpponentCounters({
      events: [],
      fantaTeamIds: SYNTHETIC_SEATS,
      thresholds: PERMISSIVE,
    });
    expect(counters.ataturk!.counters.spendPaceVsTable.status).toBe("insufficient-sample");
    expect(counters.ataturk!.counters.spendPaceVsTable).not.toHaveProperty("value");
  });
});

describe("computeOpponentCounters — a missing input stream is never a zero", () => {
  it("reports source-missing for the engagement counters when no observations exist", () => {
    // The live event log records who WON, never who BID: without a separate
    // observation stream the honest answer is "no source", not a 100% win rate.
    const counters = computeOpponentCounters({
      events: syntheticLog(),
      fantaTeamIds: SYNTHETIC_SEATS,
      priceAnchors: syntheticAnchors(),
      maxBidSnapshots: syntheticMaxBidSnapshots(),
      thresholds: PERMISSIVE,
    });
    const ataturk = counters.ataturk!;
    for (const id of ["auctionsEngaged", "contestedLosses", "winRate"] as CounterId[]) {
      expect(ataturk.counters[id].status).toBe("source-missing");
      expect(ataturk.counters[id]).not.toHaveProperty("value");
      if (ataturk.counters[id].status === "source-missing") {
        expect(ataturk.counters[id].missingSource).toBe("engagements");
      }
    }
    expect(ataturk.lastContestedLossSeq).toBeNull();
    // The counters that DO have a source are unaffected.
    expect(ataturk.counters.auctionsWon.status).toBe("observed");
  });

  it("reports source-missing for the overpay counter without anchors", () => {
    const counters = computeOpponentCounters({
      events: syntheticLog(),
      fantaTeamIds: SYNTHETIC_SEATS,
      thresholds: PERMISSIVE,
    });
    const result = counters.ataturk!.counters.averageOverpayVsQtA;
    expect(result.status).toBe("source-missing");
    if (result.status === "source-missing") expect(result.missingSource).toBe("priceAnchors");
  });

  it("reports source-missing for the max-bid distance without snapshots", () => {
    const counters = computeOpponentCounters({
      events: syntheticLog(),
      fantaTeamIds: SYNTHETIC_SEATS,
      thresholds: PERMISSIVE,
    });
    const result = counters.ataturk!.counters.averageDistanceFromMaxBid;
    expect(result.status).toBe("source-missing");
    if (result.status === "source-missing") expect(result.missingSource).toBe("maxBidSnapshots");
  });

  it("distinguishes a supplied-but-empty stream from an absent one", () => {
    // `[]` means "observed nothing"; `undefined` means "not observing".
    const counters = computeOpponentCounters({
      events: syntheticLog(),
      fantaTeamIds: SYNTHETIC_SEATS,
      engagements: [],
      thresholds: PERMISSIVE,
    });
    // ataturk still engaged 2 auctions: it won them.
    expect(value(counters.ataturk!.counters.auctionsEngaged)).toBe(2);
    expect(counters.ataturk!.counters.auctionsEngaged.status).toBe("observed");
  });

  it("ignores an anchor for a player nobody bought, and a purchase with no anchor", () => {
    const counters = computeOpponentCounters({
      events: syntheticLog(),
      fantaTeamIds: SYNTHETIC_SEATS,
      priceAnchors: [
        { playerId: "A1", qtA: 45 },
        { playerId: "MAI_COMPRATO", qtA: 99 },
      ],
      thresholds: PERMISSIVE,
    });
    // Only A1 has an anchor among ataturk's two purchases -> n = 1, mean 15.
    const result = counters.ataturk!.counters.averageOverpayVsQtA;
    expect(result.n).toBe(1);
    expect(value(result)).toBe(15);
  });
});

describe("computeOpponentCounters — determinism", () => {
  it("returns a deep-equal result on repeated runs", () => {
    expect(computeOpponentCounters(allInputs(PERMISSIVE))).toEqual(
      computeOpponentCounters(allInputs(PERMISSIVE)),
    );
  });

  it("is independent of the input order of every stream", () => {
    const straight = computeOpponentCounters(allInputs(PERMISSIVE));
    const shuffled = computeOpponentCounters({
      events: [...syntheticLog()].reverse(),
      fantaTeamIds: [...SYNTHETIC_SEATS].reverse(),
      engagements: [...syntheticEngagements()].reverse(),
      priceAnchors: [...syntheticAnchors()].reverse(),
      maxBidSnapshots: [...syntheticMaxBidSnapshots()].reverse(),
      thresholds: PERMISSIVE,
    });
    expect(shuffled).toEqual(straight);
  });

  it("emits seats and counters in a declared order, not in insertion order", () => {
    const counters = computeOpponentCounters(allInputs(PERMISSIVE));
    expect(Object.keys(counters)).toEqual([...SYNTHETIC_SEATS].sort((a, b) => a.localeCompare(b)));
    expect(Object.keys(counters.ataturk!.counters)).toEqual([...COUNTER_IDS]);
  });

  it("never mutates the caller's arrays", () => {
    const events = syntheticLog();
    const before = JSON.stringify(events);
    computeOpponentCounters({ events, fantaTeamIds: SYNTHETIC_SEATS });
    expect(JSON.stringify(events)).toBe(before);
  });

  it("roundTo2 normalises negative zero", () => {
    expect(Object.is(roundTo2(-0.001), 0)).toBe(true);
    expect(roundTo2(1 / 3)).toBe(0.33);
  });
});

describe("computeOpponentCounters — fail-closed inputs", () => {
  it("refuses an empty or duplicated seat list", () => {
    expect(() => computeOpponentCounters({ events: [], fantaTeamIds: [] })).toThrow(
      /must not be empty/,
    );
    expect(() =>
      computeOpponentCounters({ events: [], fantaTeamIds: ["ataturk", "ataturk"] }),
    ).toThrow(/duplicates/);
  });

  it("refuses a purchase by a seat that is not at the table", () => {
    expect(() =>
      computeOpponentCounters({ events: syntheticLog(), fantaTeamIds: ["ataturk"] }),
    ).toThrow(/unknown fantaTeamId in log/);
  });

  it("refuses an engagement or a snapshot attributed to an unknown seat", () => {
    expect(() =>
      computeOpponentCounters({
        events: [],
        fantaTeamIds: SYNTHETIC_SEATS,
        engagements: [{ seq: 0, playerId: "A1", fantaTeamId: "squadra_fantasma" }],
      }),
    ).toThrow(/unknown fantaTeamId in engagements/);
    expect(() =>
      computeOpponentCounters({
        events: [],
        fantaTeamIds: SYNTHETIC_SEATS,
        maxBidSnapshots: [{ seq: 0, fantaTeamId: "squadra_fantasma", maxBid: 10 }],
      }),
    ).toThrow(/unknown fantaTeamId in maxBidSnapshots/);
  });

  it("refuses a malformed event through the engine's own contract", () => {
    const broken = [{ type: "PURCHASE", seq: 0, ts: "", playerId: "", role: "Z" }] as unknown as AuctionEvent[];
    expect(() =>
      computeOpponentCounters({ events: broken, fantaTeamIds: SYNTHETIC_SEATS }),
    ).toThrow();
  });

  it("refuses a threshold of 0 — an average over an empty sample is never publishable", () => {
    expect(() =>
      computeOpponentCounters({
        events: [],
        fantaTeamIds: SYNTHETIC_SEATS,
        thresholds: { ...PERMISSIVE, winRate: 0 },
      }),
    ).toThrow();
  });

  it("refuses duplicate keys instead of letting input order decide", () => {
    // A "last one wins" rule would make the output depend on array order.
    expect(() =>
      computeOpponentCounters({
        events: [],
        fantaTeamIds: SYNTHETIC_SEATS,
        priceAnchors: [
          { playerId: "A1", qtA: 45 },
          { playerId: "A1", qtA: 46 },
        ],
      }),
    ).toThrow(/duplicate priceAnchor/);
    expect(() =>
      computeOpponentCounters({
        events: [],
        fantaTeamIds: SYNTHETIC_SEATS,
        maxBidSnapshots: [
          { seq: 0, fantaTeamId: "ataturk", maxBid: 100 },
          { seq: 0, fantaTeamId: "ataturk", maxBid: 90 },
        ],
      }),
    ).toThrow(/duplicate maxBidSnapshot/);
  });

  it("refuses a non-integer Qt.A anchor", () => {
    expect(() =>
      computeOpponentCounters({
        events: [],
        fantaTeamIds: SYNTHETIC_SEATS,
        priceAnchors: [{ playerId: "A1", qtA: 12.5 }],
      }),
    ).toThrow();
  });
});

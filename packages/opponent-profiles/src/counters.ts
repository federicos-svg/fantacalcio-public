// Opponent profiles — OBSERVED counters, read off the live auction event log.
//
// docs/DECISIONS.md §D9 perimetro 3: "live = contatori osservati dall'event
// log […] Cold start dichiarato: ogni contatore espone il proprio n; sotto la
// soglia minima pre-dichiarata il contatore si mostra come «campione
// insufficiente» […] Nessuno score psicologico fittato."
//
// Everything in this module is D9 ingrediente 1 (a measured fact) or
// ingrediente 3 (declared arithmetic on measured facts). Every formula is
// spelled out in the doc comment of the function that computes it. There is
// no weight, no fitted parameter, no Bayesian update, no psychology.
//
// DETERMINISM. Same inputs -> same output, always: every traversal is over a
// seq-sorted copy of the log (never the caller's array), every output record
// is built by iterating `COUNTER_IDS`/sorted seat ids rather than insertion
// order, and the only floating-point results are means and one ratio, each
// rounded through the single declared `roundTo2` helper.
//
// COUPLING TO THE ENGINE. This module imports the engine's event TYPE and its
// event CONTRACT (`eventSchema`) — both read-only, neither modified. It does
// NOT import the reducer or `maxSafe()`: auction state and the hard-safe
// arithmetic have exactly one implementation in the repo, and a second copy
// here could drift from it. Where a counter needs that arithmetic it takes a
// caller-supplied snapshot instead (see `MaxBidSnapshot` in types.ts).

import { z } from "zod";
import type { AuctionEvent } from "../../engine/src/types.js";
import { eventSchema } from "../../engine/src/events.js";
import {
  COUNTER_IDS,
  DEFAULT_COUNTER_THRESHOLDS,
  type CounterId,
  type CounterResult,
  type CounterSource,
  type CounterThresholds,
  type MaxBidSnapshot,
  type ObservedEngagement,
  type OpponentCounters,
  type PriceAnchor,
} from "./types.js";

// ---------------------------------------------------------------------------
// Input validation — fail-closed
// ---------------------------------------------------------------------------

const engagementSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    playerId: z.string().min(1),
    fantaTeamId: z.string().min(1),
  })
  .strict();

const priceAnchorSchema = z
  .object({
    playerId: z.string().min(1),
    // Qt.A is a listone quotation: a non-negative integer, never a guess.
    qtA: z.number().int().nonnegative(),
  })
  .strict();

const maxBidSnapshotSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    fantaTeamId: z.string().min(1),
    maxBid: z.number().int(),
  })
  .strict();

/**
 * Thresholds must be integers >= 1. Zero would mean "an average over an empty
 * sample is publishable", which is the exact failure the cold-start rule
 * exists to prevent, so it is refused at the boundary rather than tolerated.
 */
const thresholdsSchema = z
  .object({
    winRate: z.number().int().min(1),
    averageOverpayVsQtA: z.number().int().min(1),
    averageDistanceFromMaxBid: z.number().int().min(1),
    spendPaceVsTable: z.number().int().min(1),
  })
  .strict();

export interface CounterInputs {
  /** The append-only live log. PURCHASE/VOID only — see types.ts. */
  readonly events: readonly AuctionEvent[];
  /** Every seat at the table, including Owner's own. Order irrelevant. */
  readonly fantaTeamIds: readonly string[];
  /** Optional: observed participations. Absent -> engagement counters report `source-missing`. */
  readonly engagements?: readonly ObservedEngagement[];
  /** Optional: listone Qt.A per player. Absent -> overpay counter reports `source-missing`. */
  readonly priceAnchors?: readonly PriceAnchor[];
  /** Optional: theoretical max bid before each purchase. Absent -> distance counter reports `source-missing`. */
  readonly maxBidSnapshots?: readonly MaxBidSnapshot[];
  /** Optional override of the pre-declared thresholds (a declared input of Owner). */
  readonly thresholds?: CounterThresholds;
}

/**
 * Validates every input stream and rejects the batch on the first structural
 * problem, the same posture as `reduce()`'s "unknown fantaTeamId in log".
 *
 * An unknown seat is a hard failure rather than a silently ignored row: an
 * engagement attributed to a seat that does not exist means the observation
 * stream and the table disagree about who is playing, and quietly dropping it
 * would turn a data error into a wrong win rate.
 */
function validateInputs(inputs: CounterInputs): void {
  if (inputs.fantaTeamIds.length === 0) {
    throw new Error("fantaTeamIds must not be empty");
  }
  const seats = new Set(inputs.fantaTeamIds);
  if (seats.size !== inputs.fantaTeamIds.length) {
    throw new Error("fantaTeamIds must not contain duplicates");
  }
  for (const event of inputs.events) {
    eventSchema.parse(event);
    if (event.type === "PURCHASE" && !seats.has(event.fantaTeamId)) {
      throw new Error(`unknown fantaTeamId in log: ${event.fantaTeamId}`);
    }
  }
  for (const engagement of inputs.engagements ?? []) {
    engagementSchema.parse(engagement);
    if (!seats.has(engagement.fantaTeamId)) {
      throw new Error(`unknown fantaTeamId in engagements: ${engagement.fantaTeamId}`);
    }
  }
  for (const anchor of inputs.priceAnchors ?? []) priceAnchorSchema.parse(anchor);
  for (const snapshot of inputs.maxBidSnapshots ?? []) {
    maxBidSnapshotSchema.parse(snapshot);
    if (!seats.has(snapshot.fantaTeamId)) {
      throw new Error(`unknown fantaTeamId in maxBidSnapshots: ${snapshot.fantaTeamId}`);
    }
  }
  if (inputs.thresholds !== undefined) thresholdsSchema.parse(inputs.thresholds);
}

// ---------------------------------------------------------------------------
// Small declared helpers
// ---------------------------------------------------------------------------

/**
 * Rounds to 2 decimals. Credits are integers, so 2 decimals is more precision
 * than any of these means can honestly carry; the point is to keep binary
 * floating-point noise (0.30000000000000004) out of a displayed number
 * without pretending to a precision that is not there. `-0` is normalised to
 * `0` so that two runs of the same log can never print differently.
 */
export function roundTo2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function observed(value: number, n: number, minimumSample: number): CounterResult<number> {
  return { status: "observed", value, n, minimumSample };
}

/**
 * The cold-start gate itself: below `minimumSample` there is no `value`
 * property at all in the result, so «campione insufficiente» cannot decay
 * into a fabricated default downstream.
 */
function gated(value: number, n: number, minimumSample: number): CounterResult<number> {
  if (n < minimumSample) return { status: "insufficient-sample", n, minimumSample };
  return observed(value, n, minimumSample);
}

function sourceMissing(
  minimumSample: number,
  missingSource: CounterSource,
): CounterResult<number> {
  return { status: "source-missing", n: 0, minimumSample, missingSource };
}

/** Convenience predicate for consumers; keeps `?? 0` out of call sites. */
export function isObserved(
  result: CounterResult<number>,
): result is { status: "observed"; value: number; n: number; minimumSample: number } {
  return result.status === "observed";
}

// ---------------------------------------------------------------------------
// Effective log projection
// ---------------------------------------------------------------------------

interface EffectivePurchase {
  readonly seq: number;
  readonly playerId: string;
  readonly fantaTeamId: string;
  readonly price: number;
}

/**
 * The purchases that actually stand, in seq order.
 *
 * VOID handling matches `reduce()` exactly — a voided PURCHASE never
 * happened, so it contributes to no counter and its player has no winner.
 * That last consequence matters for `contestedLosses`: a seat that bid on a
 * player whose sale was later voided did not lose that auction, because there
 * was no auction to lose.
 */
function effectivePurchases(events: readonly AuctionEvent[]): readonly EffectivePurchase[] {
  const voided = new Set<number>();
  for (const event of events) {
    if (event.type === "VOID") voided.add(event.targetSeq);
  }
  return events
    .filter(
      (event): event is Extract<AuctionEvent, { type: "PURCHASE" }> =>
        event.type === "PURCHASE" && !voided.has(event.seq),
    )
    .map((event) => ({
      seq: event.seq,
      playerId: event.playerId,
      fantaTeamId: event.fantaTeamId,
      price: event.price,
    }))
    .sort((a, b) => a.seq - b.seq);
}

// ---------------------------------------------------------------------------
// The counters
// ---------------------------------------------------------------------------

/**
 * All counters for every seat, keyed by seat id.
 *
 * FORMULAS (all declared, all inspectable — D9 ingrediente 3):
 *
 *  - `auctionsWon`  = number of standing PURCHASEs by the seat.
 *                     Exact count: minimumSample 0, value === n.
 *  - `auctionsEngaged` = number of DISTINCT players the seat was observed
 *                     bidding on, union the players it won. Requires the
 *                     `engagements` stream; without it the counter is
 *                     `source-missing`, never silently equal to `auctionsWon`
 *                     (which would fabricate a 100% win rate).
 *                     Exact count.
 *  - `contestedLosses` = number of DISTINCT players the seat was observed
 *                     bidding on that were won by a different seat. A player
 *                     with no standing winner (unsold, or voided) is neither
 *                     a win nor a loss. Exact count, requires `engagements`.
 *  - `winRate`      = auctionsWon / (auctionsWon + contestedLosses), n = settledEngaged (settled engagements only — see the DENOMINATOR note at the point of calculation).
 *  - `averageOverpayVsQtA` = mean of (price - Qt.A) over the seat's standing
 *                     purchases WITH a known anchor, in credits (not a
 *                     percentage: dividing by a Qt.A of 1 would manufacture
 *                     enormous ratios out of ordinary bids). n = number of
 *                     such purchases.
 *  - `averageDistanceFromMaxBid` = mean of (maxBid_before - price) over the
 *                     seat's standing purchases with a matching snapshot.
 *                     n = number of such purchases.
 *  - `spendPaceVsTable` = seat spend / table average spend, at the current
 *                     point in the log. A ratio of two facts, meaningful live
 *                     because it needs no knowledge of how the auction ends:
 *                     > 1 means spending faster than the table average.
 *                     n = the seat's standing purchase count. Undefined while
 *                     the table has spent nothing, and reported as
 *                     «campione insufficiente» rather than as 0 or 1.
 *
 * Counts are never gated by a threshold and statistics always are — see
 * `CounterThresholds` in types.ts for why that asymmetry is deliberate.
 */
export function computeOpponentCounters(
  inputs: CounterInputs,
): Readonly<Record<string, OpponentCounters>> {
  validateInputs(inputs);
  const thresholds = inputs.thresholds ?? DEFAULT_COUNTER_THRESHOLDS;
  const purchases = effectivePurchases(inputs.events);

  // Duplicate keys are refused rather than resolved by "last one wins": a
  // last-wins rule would make the result depend on the caller's array order,
  // which is exactly the dependence this module promises not to have.
  const anchorByPlayer = new Map<string, number>();
  for (const anchor of inputs.priceAnchors ?? []) {
    if (anchorByPlayer.has(anchor.playerId)) {
      throw new Error(`duplicate priceAnchor for playerId: ${anchor.playerId}`);
    }
    anchorByPlayer.set(anchor.playerId, anchor.qtA);
  }

  const snapshotByKey = new Map<string, number>();
  for (const snapshot of inputs.maxBidSnapshots ?? []) {
    const key = `${snapshot.seq}\u0000${snapshot.fantaTeamId}`;
    if (snapshotByKey.has(key)) {
      throw new Error(
        `duplicate maxBidSnapshot for seq ${snapshot.seq} and ${snapshot.fantaTeamId}`,
      );
    }
    snapshotByKey.set(key, snapshot.maxBid);
  }

  // playerId -> the standing purchase that settled it. Carries the winner AND
  // the seq at which the auction closed, which is the moment a contested loss
  // happened.
  const settledByPlayer = new Map<string, EffectivePurchase>();
  for (const purchase of purchases) settledByPlayer.set(purchase.playerId, purchase);

  const tableSpend = purchases.reduce((sum, purchase) => sum + purchase.price, 0);
  const tableAverageSpend = tableSpend / inputs.fantaTeamIds.length;

  const hasEngagements = inputs.engagements !== undefined;
  const engagedPlayersBySeat = new Map<string, Set<string>>();
  for (const engagement of inputs.engagements ?? []) {
    let set = engagedPlayersBySeat.get(engagement.fantaTeamId);
    if (set === undefined) {
      set = new Set<string>();
      engagedPlayersBySeat.set(engagement.fantaTeamId, set);
    }
    set.add(engagement.playerId);
  }

  const out: Record<string, OpponentCounters> = {};
  for (const fantaTeamId of [...inputs.fantaTeamIds].sort((a, b) => a.localeCompare(b))) {
    const seatPurchases = purchases.filter((p) => p.fantaTeamId === fantaTeamId);
    const auctionsWon = seatPurchases.length;

    // -- engagement-derived counters -------------------------------------
    let auctionsEngaged: CounterResult<number>;
    let contestedLosses: CounterResult<number>;
    let winRate: CounterResult<number>;
    let lastContestedLossSeq: number | null = null;

    if (!hasEngagements) {
      auctionsEngaged = sourceMissing(0, "engagements");
      contestedLosses = sourceMissing(0, "engagements");
      winRate = sourceMissing(thresholds.winRate, "engagements");
    } else {
      const engagedPlayers = new Set(engagedPlayersBySeat.get(fantaTeamId) ?? []);
      // Winning a player implies having bid on them, even if the bid itself
      // was never entered as an observation.
      for (const purchase of seatPurchases) engagedPlayers.add(purchase.playerId);

      // A player with no standing purchase (still unsold, or sold and then
      // voided) is neither a win nor a loss: there is no settled auction to
      // have lost.
      const lostPurchases = [...engagedPlayers]
        .map((playerId) => settledByPlayer.get(playerId))
        .filter(
          (purchase): purchase is EffectivePurchase =>
            purchase !== undefined && purchase.fantaTeamId !== fantaTeamId,
        );

      for (const purchase of lostPurchases) {
        if (lastContestedLossSeq === null || purchase.seq > lastContestedLossSeq) {
          lastContestedLossSeq = purchase.seq;
        }
      }

      const engagedCount = engagedPlayers.size;
      auctionsEngaged = observed(engagedCount, engagedCount, 0);
      contestedLosses = observed(lostPurchases.length, lostPurchases.length, 0);

      // DENOMINATOR: settled auctions only (won + lost), NOT `engagedCount`.
      //
      // An auction this seat is contesting right now — or one whose sale was
      // voided — has no outcome yet. Putting it in the denominator would
      // score "not yet decided" as "not won", and would do so systematically:
      // live, every auction in progress would drag every opponent's win rate
      // down for as long as it lasts. `auctionsWon + contestedLosses` is
      // exactly the set of engagements that have an outcome, which also keeps
      // the three numbers arithmetically coherent with each other.
      const settledEngaged = auctionsWon + lostPurchases.length;
      winRate =
        settledEngaged === 0
          ? { status: "insufficient-sample", n: 0, minimumSample: thresholds.winRate }
          : gated(roundTo2(auctionsWon / settledEngaged), settledEngaged, thresholds.winRate);
    }

    // -- anchor-derived counter ------------------------------------------
    let averageOverpayVsQtA: CounterResult<number>;
    if (inputs.priceAnchors === undefined) {
      averageOverpayVsQtA = sourceMissing(thresholds.averageOverpayVsQtA, "priceAnchors");
    } else {
      const deltas = seatPurchases
        .map((purchase) => {
          const qtA = anchorByPlayer.get(purchase.playerId);
          return qtA === undefined ? undefined : purchase.price - qtA;
        })
        .filter((delta): delta is number => delta !== undefined);
      const n = deltas.length;
      const mean = n === 0 ? 0 : deltas.reduce((sum, d) => sum + d, 0) / n;
      averageOverpayVsQtA = gated(roundTo2(mean), n, thresholds.averageOverpayVsQtA);
    }

    // -- snapshot-derived counter ----------------------------------------
    let averageDistanceFromMaxBid: CounterResult<number>;
    if (inputs.maxBidSnapshots === undefined) {
      averageDistanceFromMaxBid = sourceMissing(
        thresholds.averageDistanceFromMaxBid,
        "maxBidSnapshots",
      );
    } else {
      const distances = seatPurchases
        .map((purchase) => {
          const maxBid = snapshotByKey.get(`${purchase.seq}\u0000${fantaTeamId}`);
          return maxBid === undefined ? undefined : maxBid - purchase.price;
        })
        .filter((distance): distance is number => distance !== undefined);
      const n = distances.length;
      const mean = n === 0 ? 0 : distances.reduce((sum, d) => sum + d, 0) / n;
      averageDistanceFromMaxBid = gated(
        roundTo2(mean),
        n,
        thresholds.averageDistanceFromMaxBid,
      );
    }

    // -- pace --------------------------------------------------------------
    const seatSpend = seatPurchases.reduce((sum, purchase) => sum + purchase.price, 0);
    const spendPaceVsTable: CounterResult<number> =
      tableAverageSpend <= 0
        ? {
            status: "insufficient-sample",
            n: auctionsWon,
            minimumSample: thresholds.spendPaceVsTable,
          }
        : gated(
            roundTo2(seatSpend / tableAverageSpend),
            auctionsWon,
            thresholds.spendPaceVsTable,
          );

    const counters: Record<CounterId, CounterResult<number>> = {
      auctionsWon: observed(auctionsWon, auctionsWon, 0),
      auctionsEngaged,
      contestedLosses,
      winRate,
      averageOverpayVsQtA,
      averageDistanceFromMaxBid,
      spendPaceVsTable,
    };

    // Rebuild in the declared COUNTER_IDS order so the record's key order is
    // a property of the contract, not of the code above.
    const ordered = {} as Record<CounterId, CounterResult<number>>;
    for (const id of COUNTER_IDS) ordered[id] = counters[id];

    out[fantaTeamId] = { fantaTeamId, counters: ordered, lastContestedLossSeq };
  }
  return out;
}

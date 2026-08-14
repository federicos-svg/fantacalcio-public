// Opponent profiles — SYNTHETIC fixtures. Invented, entirely.
//
// The seat ids reuse `packages/engine/fixtures/synthetic.ts`'s fanta-team
// names, which are league TEAM names (labels of a seat), never a person's
// name. The person ids below are made-up UUIDs bound to nobody, and every
// judgement expressed here was invented for a test: no opinion Owner has ever
// voiced about a real person is reproduced in this repo, and none ever may be
// (issue #234, privacy note).
//
// A profile in this file is a shape, not a portrait.

import type {
  MaxBidSnapshot,
  ObservedEngagement,
  OpponentProfile,
  PriceAnchor,
} from "../src/types.js";
import type { AuctionEvent } from "../../engine/src/types.js";

/** Four synthetic seats — enough for a table with a winner and two losers. */
export const SYNTHETIC_SEATS: readonly string[] = [
  "ac_vostra",
  "ataturk",
  "dinamo_flavietto",
  "psg",
];

/** Invented person ids. Bound to no human, here or anywhere. */
export const SYNTHETIC_PERSON_IDS = {
  ataturk: "person:00000000-0000-4000-8000-000000000001",
  dinamo: "person:00000000-0000-4000-8000-000000000002",
  psg: "person:00000000-0000-4000-8000-000000000003",
} as const;

/** seat -> person, the shape the league roster hands to `resolveOpponentViews`. */
export const SYNTHETIC_SEATS_TO_PEOPLE: Readonly<Record<string, string | null>> = {
  ac_vostra: null, // an empty seat, on purpose: the honest case is `prior: null`
  ataturk: SYNTHETIC_PERSON_IDS.ataturk,
  dinamo_flavietto: SYNTHETIC_PERSON_IDS.dinamo,
  psg: SYNTHETIC_PERSON_IDS.psg,
};

/** A fully confirmed profile: every field carries Owner's row-by-row yes. */
export const CONFIRMED_PROFILE: OpponentProfile = {
  schemaVersion: 1,
  personId: SYNTHETIC_PERSON_IDS.ataturk,
  interviewId: "intervista-sintetica-1",
  spendingTiming: { value: "presto", status: "confermato", declaredAt: "2026-08-20" },
  tiltSusceptibility: { value: "alta", status: "confermato", declaredAt: "2026-08-20" },
  weaknesses: {
    value: ["si_innamora_dei_big", "tilt_dopo_asta_persa"],
    status: "confermato",
    declaredAt: "2026-08-20",
  },
  affinityClubs: { value: ["Club Sintetico A"], status: "confermato", declaredAt: "2026-08-20" },
  recurringTargets: {
    value: ["Giocatore Sintetico 1"],
    status: "confermato",
    declaredAt: "2026-08-20",
  },
  notes: { value: "Nota sintetica di test.", status: "confermato", declaredAt: "2026-08-20" },
};

/** A half-finished interview: two proposals still waiting for Owner's word. */
export const PARTIALLY_CONFIRMED_PROFILE: OpponentProfile = {
  schemaVersion: 1,
  personId: SYNTHETIC_PERSON_IDS.dinamo,
  interviewId: "intervista-sintetica-2",
  spendingTiming: { value: "tardi", status: "confermato", declaredAt: "2026-08-20" },
  tiltSusceptibility: { value: "bassa", status: "proposto", declaredAt: "2026-08-20" },
  weaknesses: { value: ["tirchio"], status: "proposto", declaredAt: "2026-08-20" },
};

/**
 * A short synthetic log: three settled purchases plus one purchase that is
 * later voided, so every test exercises the VOID branch rather than assuming
 * a clean log.
 */
export function syntheticLog(): readonly AuctionEvent[] {
  return [
    {
      type: "PURCHASE",
      seq: 0,
      ts: "2026-09-01T20:00:00.000Z",
      playerId: "A1",
      role: "A",
      fantaTeamId: "ataturk",
      price: 60,
    },
    {
      type: "PURCHASE",
      seq: 1,
      ts: "2026-09-01T20:02:00.000Z",
      playerId: "C1",
      role: "C",
      fantaTeamId: "dinamo_flavietto",
      price: 30,
    },
    {
      type: "PURCHASE",
      seq: 2,
      ts: "2026-09-01T20:04:00.000Z",
      playerId: "D1",
      role: "D",
      fantaTeamId: "ataturk",
      price: 12,
    },
    {
      type: "PURCHASE",
      seq: 3,
      ts: "2026-09-01T20:06:00.000Z",
      playerId: "P1",
      role: "P",
      fantaTeamId: "psg",
      price: 20,
    },
    { type: "VOID", seq: 4, ts: "2026-09-01T20:07:00.000Z", targetSeq: 3 },
  ];
}

/** Observed participations matching `syntheticLog()`. */
export function syntheticEngagements(): readonly ObservedEngagement[] {
  return [
    { seq: 0, playerId: "A1", fantaTeamId: "ataturk" },
    { seq: 0, playerId: "A1", fantaTeamId: "dinamo_flavietto" },
    { seq: 1, playerId: "C1", fantaTeamId: "dinamo_flavietto" },
    { seq: 1, playerId: "C1", fantaTeamId: "psg" },
    { seq: 2, playerId: "D1", fantaTeamId: "ataturk" },
    // A bid on the player whose sale was voided: not a loss, because no
    // auction settled.
    { seq: 3, playerId: "P1", fantaTeamId: "dinamo_flavietto" },
  ];
}

export function syntheticAnchors(): readonly PriceAnchor[] {
  return [
    { playerId: "A1", qtA: 45 },
    { playerId: "C1", qtA: 28 },
    { playerId: "D1", qtA: 10 },
    { playerId: "P1", qtA: 18 },
  ];
}

export function syntheticMaxBidSnapshots(): readonly MaxBidSnapshot[] {
  return [
    { seq: 0, fantaTeamId: "ataturk", maxBid: 100 },
    { seq: 1, fantaTeamId: "dinamo_flavietto", maxBid: 90 },
    { seq: 2, fantaTeamId: "ataturk", maxBid: 40 },
    { seq: 3, fantaTeamId: "psg", maxBid: 80 },
  ];
}

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

// ---------------------------------------------------------------------------
// PRECEDENTI D'ASTA — storico sintetico, cinque stagioni, quattro persone
// ---------------------------------------------------------------------------
//
// Inventato per intero, come tutto il resto di questo file. I club sono
// «Club Sintetico A/B/C/D», i giocatori sono `sint-*`, le persone sono UUID
// legati a nessuno e i posti a tavola portano nomi di FANTASQUADRA inventati.
// Nessuna spesa, nessuna abitudine e nessun tifo di una persona reale della
// lega è riprodotto qui, e nessuno può esserlo (issue #234, nota privacy).
//
// I quattro casi sono scelti per coprire le quattro cose che il pannello deve
// saper distinguere, non per fare volume:
//
//   PERSONA 1 (ataturk)  ha RICOMPRATO il giocatore chiamato due volte
//                        all'asta e lo ha RINNOVATO una terza: il conteggio
//                        deve dire 2, mai 3;
//   PERSONA 2 (dinamo)   quote alte sul club del giocatore chiamato per
//                        quattro stagioni e CROLLO a zero nell'ultima: il
//                        pannello non deve poter appiattire le due cose;
//   PERSONA 3 (psg)      TIFA il club del giocatore chiamato e ci ha speso il
//                        3,6% e poi lo 0%: non deve comparire affatto, perché
//                        il tifo da solo non è un fatto sul giocatore;
//   PERSONA 4 (torres)   un tratto che si regge QUASI SOLO sull'ultima
//                        stagione (1 su 5 sopra la soglia): non può leggersi
//                        come uno che si regge su cinque.
//
// I totali di spesa per stagione sono numeri tondi (100 o 250 crediti) perché
// le quote attese si leggano a occhio nel test invece di doverle ricalcolare.

import {
  AUCTION_HISTORY_SCHEMA_VERSION,
  type AcquisitionKind,
  type AuctionHistoryStore,
  type CalledPlayer,
  type PastAuctionPurchase,
} from "../src/types.js";

/** Le cinque stagioni dello storico sintetico, crescenti. */
export const SYNTHETIC_SEASONS: readonly string[] = [
  "2021/22",
  "2022/23",
  "2023/24",
  "2024/25",
  "2025/26",
];

/** La quarta persona sintetica, che nei fixture precedenti non serviva. */
export const SYNTHETIC_PERSON_ID_TORRES = "person:00000000-0000-4000-8000-000000000004";

/** Il posto della quarta persona. Nome di FANTASQUADRA inventato, non di persona. */
export const SYNTHETIC_SEAT_TORRES = "torres_sintetica";

/** I club sintetici. «A» è quello del giocatore chiamato nelle fixture. */
export const SYNTHETIC_CLUBS = {
  a: "Club Sintetico A",
  b: "Club Sintetico B",
  c: "Club Sintetico C",
  d: "Club Sintetico D",
} as const;

/** Il giocatore chiamato al tavolo nelle fixture dei precedenti. */
export const SYNTHETIC_CALLED_PLAYER: CalledPlayer = {
  playerId: "sint-attaccante-1",
  club: SYNTHETIC_CLUBS.a,
};

/** posto -> persona per i precedenti: cinque posti, uno libero di proposito. */
export const PRECEDENT_SEATS_TO_PEOPLE: Readonly<Record<string, string | null>> = {
  ac_vostra: null, // un posto senza persona: su di lui non esiste storico, e si dice
  ataturk: SYNTHETIC_PERSON_IDS.ataturk,
  dinamo_flavietto: SYNTHETIC_PERSON_IDS.dinamo,
  psg: SYNTHETIC_PERSON_IDS.psg,
  [SYNTHETIC_SEAT_TORRES]: SYNTHETIC_PERSON_ID_TORRES,
};

interface Row {
  readonly p: string;
  readonly c: string;
  readonly v: number;
  readonly k?: AcquisitionKind;
}

function rows(personId: string, season: string, list: readonly Row[]): PastAuctionPurchase[] {
  return list.map((r) => ({
    season,
    personId,
    playerId: r.p,
    club: r.c,
    price: r.v,
    acquisition: r.k ?? "asta",
  }));
}

/** Il riempimento a buon mercato di una stagione: otto righe, totale 100. */
function filler(prefix: string, prices: readonly number[], club: string): readonly Row[] {
  return prices.map((v, i) => ({ p: `${prefix}-${i + 1}`, c: club, v }));
}

const A = SYNTHETIC_CLUBS.a;
const B = SYNTHETIC_CLUBS.b;
const C = SYNTHETIC_CLUBS.c;
const D = SYNTHETIC_CLUBS.d;

/** Persona 1 — ha ricomprato il chiamato due volte e lo ha rinnovato una. */
function person1(): PastAuctionPurchase[] {
  const p = SYNTHETIC_PERSON_IDS.ataturk;
  return [
    // 100 in tutto, nulla sul club A. Primi tre: 75.
    ...rows(p, "2021/22", [
      { p: "sint-p1-a", c: B, v: 30 },
      { p: "sint-p1-b", c: C, v: 25 },
      { p: "sint-p1-c", c: B, v: 20 },
      { p: "sint-p1-d", c: D, v: 10 },
      ...filler("sint-p1-e", [5, 4, 3, 3], D),
    ]),
    // Il chiamato, comprato all'asta a 80: club A all'80%.
    ...rows(p, "2022/23", [
      { p: SYNTHETIC_CALLED_PLAYER.playerId, c: A, v: 80 },
      ...filler("sint-p1-f", [5, 4, 3, 3, 2, 2, 1], D),
    ]),
    // Il chiamato RINNOVATO, non ricomprato: non conta come precedente e non
    // entra in nessuna quota di spesa. Club A allo 0% all'asta.
    ...rows(p, "2023/24", [
      { p: SYNTHETIC_CALLED_PLAYER.playerId, c: A, v: 90, k: "riconferma" },
      { p: "sint-p1-g", c: B, v: 30 },
      { p: "sint-p1-h", c: C, v: 25 },
      { p: "sint-p1-i", c: B, v: 20 },
      { p: "sint-p1-j", c: D, v: 10 },
      ...filler("sint-p1-k", [5, 4, 3, 3], D),
    ]),
    // Il chiamato, ricomprato all'asta a 95: club A al 95%.
    ...rows(p, "2024/25", [
      { p: SYNTHETIC_CALLED_PLAYER.playerId, c: A, v: 95 },
      ...filler("sint-p1-l", [1, 1, 1, 1, 1], D),
    ]),
    // Un altro giocatore del club A a 30: club A al 30%.
    ...rows(p, "2025/26", [
      { p: "sint-attaccante-9", c: A, v: 30 },
      { p: "sint-p1-m", c: B, v: 25 },
      { p: "sint-p1-n", c: C, v: 20 },
      { p: "sint-p1-o", c: B, v: 10 },
      ...filler("sint-p1-q", [5, 4, 3, 3], D),
    ]),
  ];
}

/**
 * Persona 2 — quote alte sul club A per quattro stagioni, zero nell'ultima.
 * Otto righe da 100 in tutto, primi tre sempre 48: sotto la soglia dei «più
 * cari», così questa persona porta un fatto solo e il caso resta leggibile.
 */
function person2(): PastAuctionPurchase[] {
  const p = SYNTHETIC_PERSON_IDS.dinamo;
  const shape = (season: string, clubA: readonly number[]): PastAuctionPurchase[] => {
    const prices = [18, 16, 14, 13, 12, 11, 9, 7];
    return rows(
      p,
      season,
      prices.map((v, i) => ({
        p: `sint-p2-${season.slice(0, 4)}-${i + 1}`,
        c: clubA.includes(v) ? A : B,
        v,
      })),
    );
  };
  return [
    ...shape("2021/22", [18, 13, 9]), // 40%
    ...shape("2022/23", [16, 12, 7]), // 35%
    ...shape("2023/24", [18, 12]), // 30%
    ...shape("2024/25", [16, 12]), // 28%
    ...shape("2025/26", []), // 0%
  ];
}

/**
 * Persona 3 — TIFA il club A (profilo qui sotto) e ci ha speso il 3,6% e poi
 * lo 0%. Nove righe da 250 in tutto, primi tre 105 (42%): sotto ogni soglia.
 * Non deve comparire nel pannello, ed è il caso che lo dimostra.
 */
function person3(): PastAuctionPurchase[] {
  const p = SYNTHETIC_PERSON_IDS.psg;
  const shape = (season: string, onClubA: boolean): PastAuctionPurchase[] => {
    const prices = [38, 34, 33, 31, 30, 28, 26, 21];
    return rows(p, season, [
      ...prices.map((v, i) => ({ p: `sint-p3-${season.slice(0, 4)}-${i + 1}`, c: B, v })),
      { p: `sint-p3-${season.slice(0, 4)}-9`, c: onClubA ? A : C, v: 9 },
    ]);
  };
  return [
    ...shape("2021/22", false),
    ...shape("2022/23", false),
    ...shape("2023/24", true), // 9/250 = 3,6%
    ...shape("2024/25", true), // 3,6%
    ...shape("2025/26", false), // 0%
  ];
}

/**
 * Persona 4 — il tratto che si regge quasi solo sull'ultima stagione: primi
 * tre al 48% per quattro stagioni e all'80% nella quinta. Club A sempre sotto
 * il 15%, nessun acquisto del chiamato: porta un fatto solo, e con numerosità
 * 1 su 5.
 */
function person4(): PastAuctionPurchase[] {
  const p = SYNTHETIC_PERSON_ID_TORRES;
  const flat = (season: string): PastAuctionPurchase[] =>
    rows(p, season, [
      { p: `sint-p4-${season.slice(0, 4)}-1`, c: B, v: 18 },
      { p: `sint-p4-${season.slice(0, 4)}-2`, c: C, v: 16 },
      { p: `sint-p4-${season.slice(0, 4)}-3`, c: B, v: 14 },
      { p: `sint-p4-${season.slice(0, 4)}-4`, c: D, v: 13 },
      { p: `sint-p4-${season.slice(0, 4)}-5`, c: A, v: 11 }, // 11% < 15%
      { p: `sint-p4-${season.slice(0, 4)}-6`, c: B, v: 11 },
      { p: `sint-p4-${season.slice(0, 4)}-7`, c: C, v: 10 },
      { p: `sint-p4-${season.slice(0, 4)}-8`, c: D, v: 7 },
    ]);
  return [
    ...flat("2021/22"),
    ...flat("2022/23"),
    ...flat("2023/24"),
    ...flat("2024/25"),
    // 40 + 25 + 15 = 80 sui primi tre; club A a 5, cioè il 5%.
    ...rows(p, "2025/26", [
      { p: "sint-p4-2025-1", c: B, v: 40 },
      { p: "sint-p4-2025-2", c: C, v: 25 },
      { p: "sint-p4-2025-3", c: B, v: 15 },
      { p: "sint-p4-2025-4", c: A, v: 5 },
      { p: "sint-p4-2025-5", c: D, v: 5 },
      { p: "sint-p4-2025-6", c: B, v: 4 },
      { p: "sint-p4-2025-7", c: C, v: 3 },
      { p: "sint-p4-2025-8", c: D, v: 3 },
    ]),
  ];
}

/** Lo storico sintetico completo: quattro persone, cinque stagioni. */
export function syntheticAuctionHistory(): readonly PastAuctionPurchase[] {
  return [...person1(), ...person2(), ...person3(), ...person4()];
}

/** Lo stesso storico nella forma persistita, per i test dello storage. */
export function syntheticAuctionHistoryStore(): AuctionHistoryStore {
  return {
    schemaVersion: AUCTION_HISTORY_SCHEMA_VERSION,
    purchases: syntheticAuctionHistory(),
  };
}

/**
 * IL CASO CHE DIMOSTRA PERCHÉ IL TIFO NON BASTA. Persona 3 tifa il club del
 * giocatore chiamato — dichiarato e confermato — e sul quel club ha speso il
 * 3,6% e poi lo 0%. Un pannello che dicesse «lo vuole perché è della sua
 * squadra» direbbe una cosa falsa; questo profilo esiste per rendere quella
 * frase impossibile invece che sconsigliata.
 */
export const SUPPORTER_WITHOUT_SPEND_PROFILE: OpponentProfile = {
  schemaVersion: 1,
  personId: SYNTHETIC_PERSON_IDS.psg,
  interviewId: "intervista-sintetica-3",
  affinityClubs: {
    value: [SYNTHETIC_CLUBS.a],
    status: "confermato",
    declaredAt: "2026-08-20",
  },
};

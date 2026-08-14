// Wholly synthetic listone fixture for the riconferme pre-asta E2E specs
// (tranche 2b, #231) — no real player, club, or quotation value. Kept
// separate from ./synthetic-listone.ts (the shared fixture many other
// specs index into by position) so this file can carry MULTIPLE players
// per confirmable role (D/C/A) without touching those specs' assumptions.
import type { ListonePlayer } from "../../src/ui/listone.js";

export const RICONFERME_LISTONE_POOL: readonly ListonePlayer[] = [
  { name: "Difensore Confermato", role: "D", club: "ClubUno", quotation: 30 },
  { name: "Difensore Libero", role: "D", club: "ClubDue", quotation: 12 },
  { name: "Centrocampista Confermato", role: "C", club: "ClubTre", quotation: 25 },
  { name: "Attaccante Confermato", role: "A", club: "ClubQuattro", quotation: 40 },
  { name: "Attaccante Libero", role: "A", club: "ClubCinque", quotation: 18 },
  { name: "Portiere Fittizio", role: "P", club: "ClubSei", quotation: 5 },
];

// The riconferma this suite's main spec confirms for "Io" (D slot) — price
// 35 so the critical strip's budget moves the exact way the archived
// design's own example states it ("500 -> 465").
export const RICONFERME_TARGET_PLAYER: ListonePlayer = RICONFERME_LISTONE_POOL[0]!;
export const RICONFERME_TARGET_PRICE = 35;

// A second D-role player, still unconfirmed after the one above is — used
// to assert the picker excludes the confirmed player specifically, not
// every player of that role.
export const RICONFERME_OTHER_D_PLAYER: ListonePlayer = RICONFERME_LISTONE_POOL[1]!;

// Fixture sintetiche condivise dai test dello strato 2 del motore live
// (ancore, inflazione, cliff, competitor set, tensione, finestra).
//
// NON è un file di test (non matcha la glob `*.test.ts` di Vitest): è il
// laboratorio deterministico su cui girano. Zero dati reali — nomi giocatore
// sintetici come in packages/engine/fixtures/synthetic.ts, nessuna quotazione
// copiata da un listone vero.

import {
  reduce,
  type AuctionEvent,
  type AuctionState,
  type ConfirmationInput,
  type PlayerAnchor,
  type Role,
} from "../src/index.js";
import { FANTA_TEAM_IDS } from "../fixtures/synthetic.js";

export const TEAMS = FANTA_TEAM_IDS;
export const TS = "2026-09-03T20:00:00Z";

export function anchor(
  playerId: string,
  role: Role,
  quotation: number,
  fvm?: number,
): PlayerAnchor {
  return fvm === undefined ? { playerId, role, quotation } : { playerId, role, quotation, fvm };
}

export interface PurchaseSpec {
  readonly playerId: string;
  readonly role: Role;
  readonly team: string;
  readonly price: number;
}

export function buy(playerId: string, role: Role, team: string, price: number): PurchaseSpec {
  return { playerId, role, team, price };
}

/** Log append-only con `seq` progressivi e timestamp deterministici. */
export function buildLog(specs: readonly PurchaseSpec[]): AuctionEvent[] {
  return specs.map((s, i) => ({
    type: "PURCHASE" as const,
    seq: i,
    ts: TS,
    playerId: s.playerId,
    role: s.role,
    fantaTeamId: s.team,
    price: s.price,
  }));
}

export function stateOf(
  log: readonly AuctionEvent[],
  confirmations: readonly ConfirmationInput[] = [],
): AuctionState {
  return reduce(log, TEAMS, confirmations);
}

/**
 * `count` acquisti di riempimento per una squadra in un ruolo, con playerId
 * marcati (`fill:`) così da restare fuori da qualunque listino di ancore usato
 * nei test: servono a consumare slot e budget, non a spostare le misure.
 */
export function fillRole(
  team: string,
  role: Role,
  count: number,
  price: number,
): PurchaseSpec[] {
  const out: PurchaseSpec[] = [];
  for (let i = 0; i < count; i++) {
    out.push(buy(`fill:${team}:${role}:${i}`, role, team, price));
  }
  return out;
}

import type { AuctionEvent, PoolPlayer, Role } from "../src/index.js";

/** 8 synthetic fanta teams (this lega's names, used only as fixtures). */
export const FANTA_TEAM_IDS: readonly string[] = [
  "new_milf",
  "fc_sottitudo",
  "ac_vostra",
  "ataturk",
  "dinamo_flavietto",
  "psg",
  "new_serpentara_fellas",
  "new_casatiello",
];

/** Small synthetic candidate pool. NO value fields — Sprint 1 is value-free. */
export function syntheticPool(): PoolPlayer[] {
  const pool: PoolPlayer[] = [];
  const counts: Record<Role, number> = { P: 10, D: 30, C: 30, A: 20 };
  (Object.keys(counts) as Role[]).forEach((role) => {
    for (let i = 1; i <= counts[role]; i++) {
      pool.push({ playerId: `${role}${i}`, role, name: `${role}-player-${i}` });
    }
  });
  return pool;
}

/**
 * A small, valid partial auction log. Strictly increasing seq.
 * Includes a PURCHASE that is later VOIDed (undo) for replay tests.
 */
export function syntheticLog(): AuctionEvent[] {
  return [
    { type: "PURCHASE", seq: 0, ts: "2026-08-01T10:00:00Z", playerId: "A1", role: "A", fantaTeamId: "new_milf", price: 102 },
    { type: "PURCHASE", seq: 1, ts: "2026-08-01T10:01:00Z", playerId: "C1", role: "C", fantaTeamId: "fc_sottitudo", price: 81 },
    { type: "PURCHASE", seq: 2, ts: "2026-08-01T10:02:00Z", playerId: "D1", role: "D", fantaTeamId: "new_milf", price: 22 },
    // mistake: wrong price recorded for D2, will be voided then re-entered
    { type: "PURCHASE", seq: 3, ts: "2026-08-01T10:03:00Z", playerId: "D2", role: "D", fantaTeamId: "ataturk", price: 999 },
    { type: "VOID", seq: 4, ts: "2026-08-01T10:03:30Z", targetSeq: 3 },
    { type: "PURCHASE", seq: 5, ts: "2026-08-01T10:04:00Z", playerId: "D2", role: "D", fantaTeamId: "ataturk", price: 7 },
    { type: "PURCHASE", seq: 6, ts: "2026-08-01T10:05:00Z", playerId: "P1", role: "P", fantaTeamId: "psg", price: 1 },
  ];
}

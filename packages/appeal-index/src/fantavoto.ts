// Best-effort Classic Fantacalcio bonus/malus tariff — PURE, no I/O.
//
// This is NOT the project's real benchmark tariff
// (docs/data/HISTORICAL_VOTE_BENCHMARK_CONTRACT.md's `league_rule_version`,
// gated behind Batch 4 / `decision_promoted`): no real per-season rule table
// exists anywhere in this repo yet, so inventing one with false precision
// would be worse than being explicit about a simplification. Two documented
// stat columns are deliberately EXCLUDED from this tariff:
//   - `Gs` (goals conceded) belongs to the team-level "modificatore difesa"
//     (docs/DECISIONS.md) — a Batch 4 Modifier Model concept, out of scope
//     for an individual per-player fantavoto here.
//   - `Rf` has no confirmed semantics anywhere in this repo's docs/schemas
//     (unlike Gf/Rp/Rs/Au/Amm/Esp/Ass, which are documented) — refusing to
//     guess mirrors packages/engine/src/parser.ts's "never invent" stance on
//     unrecognized tokens.
//
// `FANTAVOTO_RULE_VERSION` names this specific, simplified tariff so a
// future confirmed real tariff can replace it without silently changing
// historical output.

import type { VoteRecordCandidate } from "./types.js";

export const FANTAVOTO_RULE_VERSION = "appeal_index_offline_v1_simplified";

/** Points per unit of each counted event. Deliberately does not include Gs/Rf — see module doc. */
export const FANTAVOTO_TARIFF = {
  Gf: 3, // gol fatto
  Ass: 1, // assist
  Rp: 3, // rigore parato (portiere)
  Rs: -3, // rigore sbagliato
  Au: -2, // autogol
  Amm: -0.5, // ammonizione
  Esp: -1, // espulsione
} as const;

/**
 * Fantavoto for one matchday record that actually has a vote
 * (`voto_base !== null` — caller must filter to presence rows first;
 * blank/SV rows have no fantavoto by definition).
 */
export function computeFantavoto(record: VoteRecordCandidate): number {
  if (record.voto_base === null) {
    throw new Error(
      "computeFantavoto: record has no voto_base (blank/SV) — filter to presence rows before calling",
    );
  }
  let delta = 0;
  delta += (record.Gf ?? 0) * FANTAVOTO_TARIFF.Gf;
  delta += (record.Ass ?? 0) * FANTAVOTO_TARIFF.Ass;
  delta += (record.Rp ?? 0) * FANTAVOTO_TARIFF.Rp;
  delta += (record.Rs ?? 0) * FANTAVOTO_TARIFF.Rs;
  delta += (record.Au ?? 0) * FANTAVOTO_TARIFF.Au;
  delta += (record.Amm ?? 0) * FANTAVOTO_TARIFF.Amm;
  delta += (record.Esp ?? 0) * FANTAVOTO_TARIFF.Esp;
  return record.voto_base + delta;
}

// Best-effort Classic Fantacalcio bonus/malus tariff — PURE, no I/O.
//
// This is NOT the project's real benchmark tariff
// (docs/data/HISTORICAL_VOTE_BENCHMARK_CONTRACT.md's `league_rule_version`,
// gated behind Batch 4 / `decision_promoted`): no real per-season rule table
// exists anywhere in this repo yet, so inventing one with false precision
// would be worse than being explicit about a simplification.
//
// `Gs` — CORRECTED 2026-08-23, and the correction is not cosmetic.
//
// This module used to EXCLUDE goals conceded, on the stated ground that
// "`Gs` belongs to the team-level modificatore difesa". That ground was
// wrong against the canonical rules, which said so in two places at once:
//   - LEAGUE_RULES.md §12 lists "Goal subito | -1" inside the INDIVIDUAL
//     bonus/malus table, next to Gf/Ass/Au/Amm/Esp;
//   - LEAGUE_RULES.md §19 (modificatore difesa) says "Niente bonus/malus"
//     explicitly, and computes on voti BASE only — so `Gs` could not have
//     been living there either.
// The one thing genuinely open was the PLATEA (who takes the -1), registered
// as an open question in docs/DECISIONS.md §D9 point 6, "da chiudere prima
// del rerun". Pico closed it on 2026-08-23: the GOALKEEPER ONLY.
//
// What the old exclusion cost, stated plainly instead of buried: every
// goalkeeper's historical fantavoto was too HIGH by exactly 1 point per goal
// conceded — tens of points across a season, on the one role whose model is
// being rebuilt. Any artefact carrying
// `appeal_index_offline_v1_simplified` holds that error and must be
// REGENERATED, not patched: that is what bumping the version is for.
//
// `Rf` stays excluded, and its reason has NOT changed — a scored penalty is
// already inside `Gf`, so counting `Rf` too would double it. Refusing to
// guess mirrors packages/engine/src/parser.ts's "never invent" stance on
// unrecognized tokens.

import type { VoteRecordCandidate } from "./types.js";

/**
 * BUMPED 2026-08-23 (`_v1_simplified` -> `_v2_gs_keeper`). The name changes so
 * that no artefact produced under the old tariff can be mistaken for one
 * produced under this: a silent change here would make goalkeeper history
 * quietly disagree with itself.
 */
export const FANTAVOTO_RULE_VERSION = "appeal_index_offline_v2_gs_keeper";

/** Points per unit of each counted event. `Gs` lives apart — see `GS_MALUS_PER_GOAL_CONCEDED`. */
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
 * Gol subito: -1, e SOLO al portiere (LEAGUE_RULES.md §12; platea chiusa da
 * Pico il 2026-08-23, docs/DECISIONS.md §D9 punto 6).
 *
 * Sta fuori da `FANTAVOTO_TARIFF` di proposito: quella tabella e' applicata a
 * ogni riga senza guardare il ruolo, e questo malus il ruolo lo guarda. Se
 * vivesse dentro la tabella, la prima persona che la scorre concluderebbe che
 * vale per tutti.
 */
export const GS_MALUS_PER_GOAL_CONCEDED = -1;

/** Il ruolo a cui il malus `Gs` si applica. Uno solo, e non si deduce dai dati. */
export const GS_MALUS_ROLE = "P";

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
  // GUARDIA, non una comodita': se un gol subito comparisse su una riga che
  // non e' di un portiere, questo dato non e' quello che crediamo che sia, e
  // tirare avanti significherebbe scrivere un numero costruito su una
  // premessa falsa. Ci si ferma e lo si dice — stessa scelta del parser
  // dell'engine davanti a un token che non riconosce.
  if (record.role !== GS_MALUS_ROLE && (record.Gs ?? 0) !== 0) {
    throw new Error(
      `computeFantavoto: Gs=${String(record.Gs)} su una riga di ruolo ${record.role} ` +
        `(${record.name}, ${record.season} g${String(record.matchday)}). Il malus gol subito e' del solo ` +
        `portiere (LEAGUE_RULES.md §12, platea chiusa da Pico il 2026-08-23): una riga cosi' significa che ` +
        `la colonna non ha la semantica attesa. Nessun fantavoto viene calcolato.`,
    );
  }
  if (record.role === GS_MALUS_ROLE) {
    delta += (record.Gs ?? 0) * GS_MALUS_PER_GOAL_CONCEDED;
  }
  delta += (record.Gf ?? 0) * FANTAVOTO_TARIFF.Gf;
  delta += (record.Ass ?? 0) * FANTAVOTO_TARIFF.Ass;
  delta += (record.Rp ?? 0) * FANTAVOTO_TARIFF.Rp;
  delta += (record.Rs ?? 0) * FANTAVOTO_TARIFF.Rs;
  delta += (record.Au ?? 0) * FANTAVOTO_TARIFF.Au;
  delta += (record.Amm ?? 0) * FANTAVOTO_TARIFF.Amm;
  delta += (record.Esp ?? 0) * FANTAVOTO_TARIFF.Esp;
  return record.voto_base + delta;
}

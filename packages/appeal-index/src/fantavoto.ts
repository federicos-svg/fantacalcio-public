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
// `Rf` — CORRECTED 2026-08-24, and this correction OVERTURNS A PREMISE.
//
// This module used to EXCLUDE scored penalties, on the stated ground that
// "a scored penalty is already inside `Gf`, so counting `Rf` too would double
// it". That ground is FALSE. A private field measurement (2026-08-24, run on
// the real vote files, which do not and must not live in this repository)
// settled the semantics of the three columns, and they are DISJOINT, not
// nested:
//   - `Gf` counts goals from OPEN PLAY only;
//   - `Rf` counts penalties SCORED;
//   - `Rs` counts penalties MISSED.
// The evidence is arithmetic, not interpretive: the known season totals
// reproduce only with `Gf + Rf`, never with `Gf` alone. The measurement is
// registered in the private repository; this repository states its conclusion
// and repeats no name and no figure from it.
//
// So a scored penalty IS a goal and is worth +3, exactly like any other goal:
// LEAGUE_RULES.md §12 prices the GOAL and never prices the way it was scored.
// Pico ratified the correction on 2026-08-24. There is no role condition —
// `Rf` counts on any role, because a penalty taker can be a defender.
//
// What the old exclusion cost, stated plainly instead of buried: every
// penalty taker's historical fantavoto was too LOW by exactly 3 points per
// penalty scored, and the error fell hardest on exactly the players an
// auction argues about most. Any artefact carrying
// `appeal_index_offline_v2_gs_keeper` holds that error.
//
// Why the old premise was believable — the part worth keeping, because
// deleting it would delete the lesson: no real vote file exists in this
// repository, so `Gf ⊇ Rf` could be neither confirmed nor refuted from here,
// and the cautious reading was the one that refused to double-count. The
// mistake was not the caution. It was recording an UNVERIFIED premise about
// DATA as a settled reason in CODE. A claim about what a column contains is
// answered by measuring the column, never by reading the program that
// consumes it — and until someone measures, the honest state is "not
// verified", not "already inside `Gf`".

import type { VoteRecordCandidate } from "./types.js";

/**
 * BUMPED il 2026-08-24 (`_v2_gs_keeper` -> `_v3_rf_penalty`). Il nome cambia
 * perche' nessun artefatto prodotto con la tariffa precedente possa essere
 * scambiato per uno prodotto con questa: un cambio silenzioso qui farebbe
 * discordare la storia dei rigoristi con se' stessa.
 *
 * REGOLA DI PROGETTO PER I BUMP DI TARIFFA — vale per questo bump e per ogni
 * altro: **gli artefatti prodotti con la versione precedente si RIGENERANO,
 * non si correggono**. Non si applica a posteriori la differenza di tariffa a
 * un numero gia' scritto, e non si "aggiusta" un report: si rilancia il
 * calcolo dalle righe giornaliere con la versione corrente. La ragione e'
 * che una patch differenziale presuppone di sapere quali eventi c'erano
 * dentro il vecchio totale — ed e' esattamente il tipo di premessa non
 * verificata che ha prodotto l'errore `Rf`. Un artefatto che non dichiara la
 * propria `FANTAVOTO_RULE_VERSION` non e' rigenerabile e non e' confrontabile:
 * si scarta.
 */
export const FANTAVOTO_RULE_VERSION = "appeal_index_offline_v3_rf_penalty";

/** Points per unit of each counted event. `Gs` lives apart — see `GS_MALUS_PER_GOAL_CONCEDED`. */
export const FANTAVOTO_TARIFF = {
  Gf: 3, // gol su azione
  Rf: 3, // rigore segnato — un gol, e vale come un gol (LEAGUE_RULES.md §12)
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
  // Nessuna guardia di ruolo su `Rf`, ed e' deliberato: il rigorista puo'
  // essere un difensore. La guardia sopra esiste perche' `Gs` su una riga non
  // di portiere direbbe che la colonna non ha la semantica attesa; `Rf` su un
  // difensore invece e' un fatto ordinario del gioco.
  delta += (record.Rf ?? 0) * FANTAVOTO_TARIFF.Rf;
  delta += (record.Ass ?? 0) * FANTAVOTO_TARIFF.Ass;
  delta += (record.Rp ?? 0) * FANTAVOTO_TARIFF.Rp;
  delta += (record.Rs ?? 0) * FANTAVOTO_TARIFF.Rs;
  delta += (record.Au ?? 0) * FANTAVOTO_TARIFF.Au;
  delta += (record.Amm ?? 0) * FANTAVOTO_TARIFF.Amm;
  delta += (record.Esp ?? 0) * FANTAVOTO_TARIFF.Esp;
  return record.voto_base + delta;
}

// Per-season player aggregation — PURE, no I/O.
//
// Turns one season's matchday-level VoteRecordCandidate[] (already produced
// by the existing engine parser / xlsx-adapter pipeline — this module never
// reads XLSX) into one row per player for that season. Grouping is by
// `externalId` WITHIN a single season, which is safe per the closed
// FANTACALCIO_XLSX_CONTRACT.md contract ("Cod. intero, univoco dentro il
// file"); cross-season linking is a separate, later step (playerKey.ts).

import type { PlayerSeasonAggregate, Role, VoteRecordCandidate } from "./types.js";
import { computeFantavoto } from "./fantavoto.js";
import { mean, stdDev } from "./stats.js";

export class SeasonAggregateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeasonAggregateError";
  }
}

function mode<T>(xs: readonly T[]): T {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: T = xs[0]!;
  let bestCount = -1;
  for (const [x, c] of counts) {
    if (c > bestCount) {
      best = x;
      bestCount = c;
    }
  }
  return best;
}

interface Bucket {
  externalId: number;
  names: string[];
  roles: Role[];
  teams: string[];
  matchdaysObserved: number;
  presenceVoti: number[];
  presenceFantavoti: number[];
  golFatti: number;
  assist: number;
  ammonizioni: number;
  espulsioni: number;
  golSubiti: number;
  porteInviolate: number;
  rigoriParati: number;
}

/**
 * Build one PlayerSeasonAggregate per player for a single season.
 * Excludes `role === "ALL"` (coach) rows — mirrors
 * packages/engine/src/parser.ts's `playerCandidates()`.
 * Throws `SeasonAggregateError` if `records` mixes seasons or if the same
 * `externalId` maps to more than one distinct player name within this season
 * (a within-season data-quality violation of the documented Cod. contract —
 * never silently merged).
 */
export function buildPlayerSeasonAggregates(
  season: string,
  records: readonly VoteRecordCandidate[],
): PlayerSeasonAggregate[] {
  const buckets = new Map<number, Bucket>();

  for (const r of records) {
    if (r.role === "ALL") continue;
    if (r.season !== season) {
      throw new SeasonAggregateError(
        `buildPlayerSeasonAggregates: record season '${r.season}' does not match requested season '${season}'`,
      );
    }
    let b = buckets.get(r.external_id);
    if (!b) {
      b = {
        externalId: r.external_id,
        names: [],
        roles: [],
        teams: [],
        matchdaysObserved: 0,
        presenceVoti: [],
        presenceFantavoti: [],
        golFatti: 0,
        assist: 0,
        ammonizioni: 0,
        espulsioni: 0,
        golSubiti: 0,
        porteInviolate: 0,
        rigoriParati: 0,
      };
      buckets.set(r.external_id, b);
    }
    b.names.push(r.name);
    b.roles.push(r.role);
    b.teams.push(r.team);
    b.matchdaysObserved += 1;
    // `golFatti` conta la colonna `Gf`, che dopo la misura di campo privata
    // del 2026-08-24 sappiamo essere i gol SU AZIONE: i rigori segnati stanno
    // in `Rf`, colonna disgiunta. Il campo resta `Gf` puro — cambiarlo in
    // `Gf + Rf` cambierebbe la feature `golFattiRollingMean3` e con essa il
    // significato di un ingresso del modello, che non e' una correzione di
    // tariffa ma una decisione di modellazione (di Pico). Il fantavoto, che e'
    // la grandezza corretta il 2026-08-24, i rigori li conta: li conta
    // `computeFantavoto`, qui sotto.
    b.golFatti += r.Gf ?? 0;
    b.assist += r.Ass ?? 0;
    b.ammonizioni += r.Amm ?? 0;
    b.espulsioni += r.Esp ?? 0;
    b.golSubiti += r.Gs ?? 0;
    b.rigoriParati += r.Rp ?? 0;
    if (r.voto_base !== null) {
      b.presenceVoti.push(r.voto_base);
      b.presenceFantavoti.push(computeFantavoto(r));
      // A clean sheet is counted on exactly the rows `presenze` counts, so the
      // rate `porteInviolate / presenze` is always a well-formed fraction. An
      // absent `Gs` cell means zero conceded, per the parser's own contract.
      if ((r.Gs ?? 0) === 0) b.porteInviolate += 1;
    }
  }

  const out: PlayerSeasonAggregate[] = [];
  for (const b of buckets.values()) {
    const distinctNames = new Set(b.names);
    if (distinctNames.size > 1) {
      throw new SeasonAggregateError(
        `buildPlayerSeasonAggregates: externalId ${b.externalId} in season '${season}' maps to ` +
          `${distinctNames.size} distinct names within the same season — violates the documented ` +
          "per-file Cod. uniqueness contract; refusing to silently merge.",
      );
    }
    const presenze = b.presenceVoti.length;
    out.push({
      season,
      externalId: b.externalId,
      name: b.names[0]!,
      role: mode(b.roles),
      team: mode(b.teams),
      matchdaysObserved: b.matchdaysObserved,
      presenze,
      mediaVoto: presenze > 0 ? mean(b.presenceVoti) : null,
      fantamedia: presenze > 0 ? mean(b.presenceFantavoti) : null,
      volatilitaVoto: presenze >= 2 ? stdDev(b.presenceVoti) : null,
      golFatti: b.golFatti,
      assist: b.assist,
      ammonizioni: b.ammonizioni,
      espulsioni: b.espulsioni,
      golSubiti: b.golSubiti,
      porteInviolate: b.porteInviolate,
      rigoriParati: b.rigoriParati,
    });
  }
  return out;
}

/**
 * The dispersion of the most recent season of `history` that has one.
 *
 * `history` is already the player's own seasons `<= s`, in chronological
 * order, so walking it backwards can only ever read an observed season that is
 * strictly earlier than the target — `assertNoLeakage()` keeps proving that
 * from `sourceSeasons` independently of this function.
 *
 * `NaN` only when no season in that history reached two presences.
 */
export function lastObservedVolatility(
  history: readonly { readonly volatilitaVoto: number | null }[],
): number {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const value = history[index]!.volatilitaVoto;
    if (value !== null && Number.isFinite(value)) return value;
  }
  return Number.NaN;
}

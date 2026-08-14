// Opponent profiles — the join point between the two halves.
//
// This module exists to make one no-go structurally hard to break: the
// DECLARED prior (interview) and the OBSERVED counters (event log) are shown
// side by side with their provenance, and are NEVER combined into a single
// number. There is deliberately no function here that returns "the opponent's
// aggressiveness" — an aggregate of a declared judgement and a measured
// average would be a psychological score, which docs/DECISIONS.md §D9
// perimetro 3 forbids ("Nessuno score psicologico fittato").
//
// Two joins happen here, and they are different things:
//
//   personId -> profile   the judgement follows the human;
//   seat     -> counters  the event log records seats.
//
// The league roster (runtime-local, `src/leagueTeams.ts`) is what maps one to
// the other. It is passed in as a plain seat -> personId map, never imported:
// a package does not depend on the app root, and the roster itself never
// leaves runtime-local storage.

import {
  PROFILE_FIELD_IDS,
  type OpponentCounters,
  type OpponentProfile,
  type ProfileFieldId,
  type SpendingTiming,
  type TiltSusceptibility,
  type WeaknessCode,
} from "./types.js";

/**
 * The interview prior reduced to what Owner actually CONFIRMED, row by row
 * (design doc §7). A `proposto` field is an LLM proposal, not a declared
 * input under D9 ingrediente 2, so it is stripped out here and only its NAME
 * survives, in `pendingConfirmation` — enough for the interview tooling to
 * ask again, never enough for a consumer to use the value by accident.
 */
export interface ConfirmedPrior {
  readonly personId: string;
  /** Always this literal: everything in this object came from the interview. */
  readonly provenance: "intervista_dichiarata";
  readonly spendingTiming?: SpendingTiming;
  readonly tiltSusceptibility?: TiltSusceptibility;
  readonly weaknesses?: readonly WeaknessCode[];
  readonly affinityClubs?: readonly string[];
  readonly recurringTargets?: readonly string[];
  readonly notes?: string;
  /** Fields the interview proposed and Owner has not confirmed yet, in declared order. */
  readonly pendingConfirmation: readonly ProfileFieldId[];
}

/** Strips every unconfirmed field. The only supported way to read a prior. */
export function confirmedPrior(profile: OpponentProfile): ConfirmedPrior {
  const pending: ProfileFieldId[] = [];
  const out: Record<string, unknown> = {
    personId: profile.personId,
    provenance: "intervista_dichiarata",
  };
  for (const field of PROFILE_FIELD_IDS) {
    const declared = profile[field];
    if (declared === undefined) continue;
    if (declared.status === "confermato") out[field] = declared.value;
    else pending.push(field);
  }
  out.pendingConfirmation = pending;
  return out as unknown as ConfirmedPrior;
}

/**
 * One opponent as the war board would read them: two labelled halves, no
 * third blended number.
 *
 * `prior` is `null` when the seat holds nobody, or when the person sitting
 * there has no profile yet — never an empty stand-in profile, because "no
 * interview happened" and "the interview found nothing" are different facts
 * and only the second one is knowledge. Before the interview exists at all,
 * D9 perimetro 3 says the start of the auction rests on the interview plus
 * the hard constraints; with `prior === null` the honest display is the
 * counters and their `n`, and nothing else.
 */
export interface OpponentView {
  readonly fantaTeamId: string;
  readonly personId: string | null;
  readonly prior: ConfirmedPrior | null;
  readonly observed: OpponentCounters;
}

export interface ResolveViewInput {
  readonly counters: Readonly<Record<string, OpponentCounters>>;
  /** seat id -> person id, or null when the seat is free (league roster shape). */
  readonly seats: Readonly<Record<string, string | null>>;
  readonly profiles: readonly OpponentProfile[];
  /** Optional: the seat Owner himself occupies, excluded from the result. */
  readonly selfSeatId?: string;
}

/**
 * Pairs counters with priors, one entry per seat, sorted by seat id for a
 * deterministic order regardless of input order.
 *
 * A seat present in `counters` but absent from `seats` is still returned,
 * with `personId: null` — the counters are facts about that seat whether or
 * not the roster knows who is sitting there, and dropping them would hide a
 * measured fact behind a missing label.
 */
export function resolveOpponentViews(input: ResolveViewInput): readonly OpponentView[] {
  const profileByPerson = new Map<string, OpponentProfile>();
  for (const profile of input.profiles) profileByPerson.set(profile.personId, profile);

  return Object.keys(input.counters)
    .filter((seatId) => seatId !== input.selfSeatId)
    .sort((a, b) => a.localeCompare(b))
    .map((seatId) => {
      const personId = input.seats[seatId] ?? null;
      const profile = personId === null ? undefined : profileByPerson.get(personId);
      return {
        fantaTeamId: seatId,
        personId,
        prior: profile === undefined ? null : confirmedPrior(profile),
        observed: input.counters[seatId]!,
      };
    });
}

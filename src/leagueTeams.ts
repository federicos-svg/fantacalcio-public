// Who sits in each seat of the league.
//
// Three identities, deliberately distinct:
//
//  1. `fantaTeamId` — the SEAT. This is what the auction log records, and it
//     is never editable. reduce() throws "unknown fantaTeamId in log" for any
//     event naming a team it doesn't know (packages/engine/src/reduce.ts) and
//     validateAuctionLog replays every log through the reducer, so a mutable
//     seat id would invalidate an already recorded auction.
//  2. `personId` — the PERSON. Stable, generated once, never reused. People
//     are archived, never deleted: someone who leaves the league keeps their
//     record, so if they come back they are the same person again rather than
//     a new one. That is what makes per-person data worth accumulating.
//  3. `name` — a person's LABEL. Fixing a typo in it is not a change of
//     person, so it stays editable at all times.
//
// The operation that really means "someone else is playing" is reassigning a
// seat to a different person, and that is what gets blocked once the seat has
// bought — see seatIsClaimed callers in main.ts.
import { z } from "zod";
import type { StorageLike } from "./logRecovery.js";

export const LEAGUE_ROSTER_STORAGE_KEY = "fac_league_teams";
export const LEAGUE_ROSTER_SCHEMA_VERSION = 2;

/** Longer than any sensible name, short enough for the assign dropdown. */
export const PERSON_NAME_MAX = 40;

const personSchema = z.object({
  id: z.string().regex(/^person:[0-9a-f-]{36}$/i),
  name: z.string().trim().min(1).max(PERSON_NAME_MAX),
}).strict();

const rosterSchema = z.object({
  schemaVersion: z.literal(LEAGUE_ROSTER_SCHEMA_VERSION),
  people: z.array(personSchema),
  /** seat id -> person id, or null when the seat is free. */
  seats: z.record(z.string().min(1), z.string().nullable()),
}).strict();

// Shape shipped by the first iteration of this panel (labels straight on the
// seat). Read only to migrate: a name typed there becomes a person.
const v1Schema = z.object({
  schemaVersion: z.literal(1),
  teams: z.record(z.string().min(1), z.object({ label: z.string() }).strict()),
}).strict();

export interface Person {
  readonly id: string;
  readonly name: string;
}

export interface LeagueRoster {
  /** Everyone ever entered, past participants included. Never pruned. */
  readonly people: readonly Person[];
  /** seat id -> person id, or null when nobody is assigned. */
  readonly seats: Readonly<Record<string, string | null>>;
}

export type RosterError = "name-required" | "duplicate-name" | "unknown-person";

export type RosterResult =
  | { readonly ok: true; readonly roster: LeagueRoster }
  | { readonly ok: false; readonly reason: RosterError };

/** Case- and accent-folded, whitespace-trimmed — same rule used for manual
 *  scouting duplicates, so "Bruno" and " bruno " are one person. */
function identityPart(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("it");
}

function normalizeName(raw: string): string {
  return raw.trim().slice(0, PERSON_NAME_MAX).trim();
}

export function emptyRoster(seatIds: readonly string[]): LeagueRoster {
  return { people: [], seats: Object.fromEntries(seatIds.map((id) => [id, null])) };
}

/** The person sitting in `seatId`, or undefined when the seat is free. */
export function seatPerson(roster: LeagueRoster, seatId: string): Person | undefined {
  const personId = roster.seats[seatId] ?? null;
  if (personId === null) return undefined;
  return roster.people.find((p) => p.id === personId);
}

/** What to show for a seat: the occupant's name, or the seat id when free. */
export function seatLabel(roster: LeagueRoster, seatId: string): string {
  return seatPerson(roster, seatId)?.name ?? seatId;
}

/** People not currently sitting anywhere — past participants, still pickable. */
export function unseatedPeople(roster: LeagueRoster): readonly Person[] {
  const seated = new Set(Object.values(roster.seats).filter((v): v is string => v !== null));
  return roster.people.filter((p) => !seated.has(p.id));
}

/**
 * Adds a person to the archive. A name already in use is refused rather than
 * silently duplicated: two identical entries would be two identities for one
 * human, which is exactly what the archive exists to prevent.
 */
export function addPerson(
  roster: LeagueRoster,
  rawName: string,
  uuid: () => string = () => crypto.randomUUID(),
): RosterResult {
  const name = normalizeName(rawName);
  if (!name) return { ok: false, reason: "name-required" };
  if (roster.people.some((p) => identityPart(p.name) === identityPart(name))) {
    return { ok: false, reason: "duplicate-name" };
  }
  const person: Person = { id: `person:${uuid()}`, name };
  return { ok: true, roster: { ...roster, people: [...roster.people, person] } };
}

/**
 * Renames a person. Not an identity change — the personId is untouched, so
 * every seat assignment and everything keyed to that person survives it.
 */
export function renamePerson(roster: LeagueRoster, personId: string, rawName: string): RosterResult {
  const name = normalizeName(rawName);
  if (!name) return { ok: false, reason: "name-required" };
  if (!roster.people.some((p) => p.id === personId)) return { ok: false, reason: "unknown-person" };
  if (roster.people.some((p) => p.id !== personId && identityPart(p.name) === identityPart(name))) {
    return { ok: false, reason: "duplicate-name" };
  }
  return {
    ok: true,
    roster: { ...roster, people: roster.people.map((p) => (p.id === personId ? { ...p, name } : p)) },
  };
}

/**
 * Seats a person (or clears the seat with null). A person can hold only one
 * seat: assigning someone already seated elsewhere frees their old seat, so
 * the same human never occupies two teams at once.
 */
export function assignSeat(roster: LeagueRoster, seatId: string, personId: string | null): RosterResult {
  if (personId !== null && !roster.people.some((p) => p.id === personId)) {
    return { ok: false, reason: "unknown-person" };
  }
  const seats: Record<string, string | null> = { ...roster.seats };
  if (personId !== null) {
    for (const [otherSeat, occupant] of Object.entries(seats)) {
      if (otherSeat !== seatId && occupant === personId) seats[otherSeat] = null;
    }
  }
  seats[seatId] = personId;
  return { ok: true, roster: { ...roster, seats } };
}

function migrateV1(parsed: z.infer<typeof v1Schema>, seatIds: readonly string[]): LeagueRoster {
  let roster = emptyRoster(seatIds);
  for (const seatId of seatIds) {
    const label = normalizeName(parsed.teams[seatId]?.label ?? "");
    // A label equal to the seat id was the "unnamed" default back then, so it
    // describes no real person and must not become one.
    if (!label || label === seatId) continue;
    const added = addPerson(roster, label);
    if (!added.ok) continue;
    const person = added.roster.people[added.roster.people.length - 1]!;
    const seated = assignSeat(added.roster, seatId, person.id);
    roster = seated.ok ? seated.roster : added.roster;
  }
  return roster;
}

/**
 * Reads the roster. Fail-closed and non-destructive: anything unparseable
 * yields an empty roster rather than an error, seats no longer in the league
 * are dropped, and assignments pointing at a missing person are cleared
 * instead of leaving a dangling reference.
 */
export function loadLeagueRoster(storage: StorageLike, seatIds: readonly string[]): LeagueRoster {
  try {
    const raw = storage.getItem(LEAGUE_ROSTER_STORAGE_KEY);
    if (raw === null) return emptyRoster(seatIds);
    const json: unknown = JSON.parse(raw);

    const v1 = v1Schema.safeParse(json);
    if (v1.success) return migrateV1(v1.data, seatIds);

    const parsed = rosterSchema.safeParse(json);
    if (!parsed.success) return emptyRoster(seatIds);

    const ids = new Set<string>();
    for (const person of parsed.data.people) {
      if (ids.has(person.id)) return emptyRoster(seatIds);
      ids.add(person.id);
    }
    const seats: Record<string, string | null> = {};
    const seated = new Set<string>();
    for (const seatId of seatIds) {
      const personId = parsed.data.seats[seatId] ?? null;
      // Drop a dangling or double-booked assignment rather than trust it.
      seats[seatId] = personId !== null && ids.has(personId) && !seated.has(personId) ? personId : null;
      if (seats[seatId] !== null) seated.add(personId!);
    }
    return { people: parsed.data.people, seats };
  } catch {
    return emptyRoster(seatIds);
  }
}

/** Persists the roster. Returns false when the write did not stick, so the
 *  caller can surface it instead of silently losing the change. */
export function saveLeagueRoster(
  storage: StorageLike,
  seatIds: readonly string[],
  roster: LeagueRoster,
): boolean {
  const seats: Record<string, string | null> = {};
  for (const seatId of seatIds) seats[seatId] = roster.seats[seatId] ?? null;
  const parsed = rosterSchema.safeParse({
    schemaVersion: LEAGUE_ROSTER_SCHEMA_VERSION,
    people: roster.people,
    seats,
  });
  if (!parsed.success) return false;
  const raw = JSON.stringify(parsed.data);
  try {
    storage.setItem(LEAGUE_ROSTER_STORAGE_KEY, raw);
    return storage.getItem(LEAGUE_ROSTER_STORAGE_KEY) === raw;
  } catch {
    return false;
  }
}

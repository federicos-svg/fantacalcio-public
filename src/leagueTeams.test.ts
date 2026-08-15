import { describe, expect, it } from "vitest";
import {
  LEAGUE_ROSTER_STORAGE_KEY,
  PERSON_NAME_MAX,
  addPerson,
  assignSeat,
  emptyRoster,
  loadLeagueRoster,
  renamePerson,
  saveLeagueRoster,
  seatLabel,
  seatPerson,
  unseatedPeople,
  type LeagueRoster,
} from "./leagueTeams.js";
import type { StorageLike } from "./logRecovery.js";

const SEATS = ["Io", "Squadra2", "Squadra3"] as const;

let counter = 0;
const uuid = (): string => {
  counter += 1;
  return `123e4567-e89b-42d3-a456-42661417400${counter % 10}`;
};

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  constructor(private readonly mode: "ok" | "throw-write" | "silent-drop" = "ok") {}
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.mode === "throw-write") throw new Error("quota");
    if (this.mode === "silent-drop") return;
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/** Roster with `names` added as people, in order. */
function withPeople(...names: string[]): LeagueRoster {
  let roster = emptyRoster(SEATS);
  for (const name of names) {
    const result = addPerson(roster, name, uuid);
    if (result.ok) roster = result.roster;
  }
  return roster;
}

describe("addPerson", () => {
  it("refuses an empty name and a name already in the archive", () => {
    const roster = withPeople("Bruno");
    expect(addPerson(roster, "  ", uuid)).toMatchObject({ ok: false, reason: "name-required" });
    expect(addPerson(roster, " bruno ", uuid)).toMatchObject({ ok: false, reason: "duplicate-name" });
  });

  it("trims and caps the name", () => {
    const result = addPerson(emptyRoster(SEATS), `  ${"x".repeat(PERSON_NAME_MAX + 10)}  `, uuid);
    expect(result.ok && result.roster.people[0]!.name).toHaveLength(PERSON_NAME_MAX);
  });
});

describe("renamePerson", () => {
  it("keeps the id, so the seat assignment survives the rename", () => {
    const roster = withPeople("Brunoo");
    const person = roster.people[0]!;
    const seated = assignSeat(roster, "Squadra2", person.id);
    expect(seated.ok).toBe(true);
    const renamed = renamePerson(seated.ok ? seated.roster : roster, person.id, "Bruno");
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.roster.people[0]!.id).toBe(person.id);
    expect(seatLabel(renamed.roster, "Squadra2")).toBe("Bruno");
  });

  it("refuses an unknown person, an empty name, and another person's name", () => {
    const roster = withPeople("Bruno", "Giulia");
    expect(renamePerson(roster, "person:nope", "X")).toMatchObject({ ok: false, reason: "unknown-person" });
    expect(renamePerson(roster, roster.people[0]!.id, " ")).toMatchObject({ ok: false, reason: "name-required" });
    expect(renamePerson(roster, roster.people[0]!.id, "giulia")).toMatchObject({ ok: false, reason: "duplicate-name" });
  });

  it("accepts renaming a person to their own name unchanged", () => {
    const roster = withPeople("Bruno");
    expect(renamePerson(roster, roster.people[0]!.id, "Bruno").ok).toBe(true);
  });
});

describe("assignSeat", () => {
  it("moves a person between seats instead of duplicating them", () => {
    const roster = withPeople("Bruno");
    const bruno = roster.people[0]!;
    const first = assignSeat(roster, "Squadra2", bruno.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const moved = assignSeat(first.roster, "Squadra3", bruno.id);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    // Same person, different seat, and the old seat is free again.
    expect(moved.roster.seats).toEqual({ Io: null, Squadra2: null, Squadra3: bruno.id });
    expect(seatLabel(moved.roster, "Squadra3")).toBe("Bruno");
    expect(seatLabel(moved.roster, "Squadra2")).toBe("Squadra2");
  });

  it("frees a seat with null and refuses an unknown person", () => {
    const roster = withPeople("Bruno");
    const seated = assignSeat(roster, "Squadra2", roster.people[0]!.id);
    expect(seated.ok).toBe(true);
    if (!seated.ok) return;
    const freed = assignSeat(seated.roster, "Squadra2", null);
    expect(freed.ok && freed.roster.seats.Squadra2).toBeNull();
    expect(assignSeat(roster, "Squadra2", "person:nope")).toMatchObject({ ok: false, reason: "unknown-person" });
  });
});

describe("seatPerson / seatLabel / unseatedPeople", () => {
  it("shows the seat id while the seat is free", () => {
    const roster = withPeople("Bruno");
    expect(seatPerson(roster, "Squadra2")).toBeUndefined();
    expect(seatLabel(roster, "Squadra2")).toBe("Squadra2");
  });

  it("lists people who left a seat as still available", () => {
    const roster = withPeople("Bruno", "Giulia");
    const seated = assignSeat(roster, "Squadra2", roster.people[0]!.id);
    expect(seated.ok).toBe(true);
    if (!seated.ok) return;
    expect(unseatedPeople(seated.roster).map((p) => p.name)).toEqual(["Giulia"]);
    // Bruno leaves the league: still archived, pickable again later.
    const freed = assignSeat(seated.roster, "Squadra2", null);
    expect(freed.ok && unseatedPeople(freed.roster).map((p) => p.name)).toEqual(["Bruno", "Giulia"]);
  });
});

describe("persistence", () => {
  it("round-trips people and seats", () => {
    const roster = withPeople("Bruno", "Giulia");
    const seated = assignSeat(roster, "Squadra3", roster.people[1]!.id);
    expect(seated.ok).toBe(true);
    if (!seated.ok) return;
    const storage = new MemoryStorage();
    expect(saveLeagueRoster(storage, SEATS, seated.roster)).toBe(true);
    expect(loadLeagueRoster(storage, SEATS)).toEqual(seated.roster);
  });

  it("reports a write that throws or does not stick", () => {
    expect(saveLeagueRoster(new MemoryStorage("throw-write"), SEATS, emptyRoster(SEATS))).toBe(false);
    expect(saveLeagueRoster(new MemoryStorage("silent-drop"), SEATS, emptyRoster(SEATS))).toBe(false);
  });

  it("falls back to an empty roster on malformed or duplicated payloads", () => {
    for (const raw of [
      "{not-json",
      JSON.stringify({ schemaVersion: 99, people: [], seats: {} }),
      JSON.stringify({ schemaVersion: 2, people: [{ id: "nope", name: "Bruno" }], seats: {} }),
      JSON.stringify({
        schemaVersion: 2,
        people: [
          { id: "person:123e4567-e89b-42d3-a456-426614174000", name: "A" },
          { id: "person:123e4567-e89b-42d3-a456-426614174000", name: "B" },
        ],
        seats: {},
      }),
    ]) {
      const storage = new MemoryStorage();
      storage.setItem(LEAGUE_ROSTER_STORAGE_KEY, raw);
      expect(loadLeagueRoster(storage, SEATS)).toEqual(emptyRoster(SEATS));
    }
  });

  it("clears assignments pointing at a missing person, keeping the rest", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LEAGUE_ROSTER_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        people: [{ id: "person:123e4567-e89b-42d3-a456-426614174000", name: "Bruno" }],
        seats: { Io: "person:123e4567-e89b-42d3-a456-426614174000", Squadra2: "person:sparito", Fuorilega: null },
      }),
    );
    const roster = loadLeagueRoster(storage, SEATS);
    expect(roster.seats).toEqual({ Io: "person:123e4567-e89b-42d3-a456-426614174000", Squadra2: null, Squadra3: null });
    expect(roster.seats).not.toHaveProperty("Fuorilega");
  });

  it("never throws when storage itself is hostile", () => {
    const hostile: StorageLike = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {},
      removeItem() {},
    };
    expect(loadLeagueRoster(hostile, SEATS)).toEqual(emptyRoster(SEATS));
  });

  it("migrates the v1 seat-label shape into people, skipping unnamed seats", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LEAGUE_ROSTER_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        teams: { Io: { label: "Anna" }, Squadra2: { label: "Bruno" }, Squadra3: { label: "Squadra3" } },
      }),
    );
    const roster = loadLeagueRoster(storage, SEATS);
    expect(roster.people.map((p) => p.name)).toEqual(["Anna", "Bruno"]);
    expect(seatLabel(roster, "Io")).toBe("Anna");
    expect(seatLabel(roster, "Squadra2")).toBe("Bruno");
    // "Squadra3" was the v1 placeholder for "unnamed" — not a real person.
    expect(seatLabel(roster, "Squadra3")).toBe("Squadra3");
    expect(roster.seats.Squadra3).toBeNull();
  });
});

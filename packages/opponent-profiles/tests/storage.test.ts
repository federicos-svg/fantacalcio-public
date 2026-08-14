import { describe, it, expect } from "vitest";
import {
  OPPONENT_PROFILES_STORAGE_KEY,
  clearOpponentProfiles,
  loadOpponentProfiles,
  saveOpponentProfiles,
  type StorageLike,
} from "../src/storage.js";
import { CONFIRMED_PROFILE, PARTIALLY_CONFIRMED_PROFILE } from "../fixtures/synthetic.js";

/** In-memory fake — no browser, no filesystem, no network. */
function memoryStorage(seed: Record<string, string> = {}): StorageLike & {
  readonly data: Record<string, string>;
} {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

describe("opponent profile storage — round trip", () => {
  it("saves and reads back a store of profiles", () => {
    const storage = memoryStorage();
    expect(saveOpponentProfiles(storage, [CONFIRMED_PROFILE, PARTIALLY_CONFIRMED_PROFILE])).toEqual(
      { ok: true },
    );
    const loaded = loadOpponentProfiles(storage);
    expect(loaded.ok).toBe(true);
    expect(loaded.profiles).toEqual([CONFIRMED_PROFILE, PARTIALLY_CONFIRMED_PROFILE]);
  });

  it("writes under the runtime-local key and nowhere else", () => {
    const storage = memoryStorage();
    saveOpponentProfiles(storage, [CONFIRMED_PROFILE]);
    expect(Object.keys(storage.data)).toEqual([OPPONENT_PROFILES_STORAGE_KEY]);
  });

  it("stores the schema version alongside the profiles", () => {
    const storage = memoryStorage();
    saveOpponentProfiles(storage, []);
    expect(JSON.parse(storage.data[OPPONENT_PROFILES_STORAGE_KEY]!)).toEqual({
      schemaVersion: 1,
      profiles: [],
    });
  });

  it("clears everything and reports whether the clear stuck", () => {
    const storage = memoryStorage();
    saveOpponentProfiles(storage, [CONFIRMED_PROFILE]);
    expect(clearOpponentProfiles(storage)).toBe(true);
    expect(loadOpponentProfiles(storage).ok).toBe(false);
  });
});

describe("opponent profile storage — fail-closed reads", () => {
  it("reports `absent` when nothing was ever written", () => {
    const result = loadOpponentProfiles(memoryStorage());
    expect(result).toEqual({ ok: false, reason: "absent", issues: [], profiles: [] });
  });

  it("reports `unreadable` for a corrupt payload", () => {
    const storage = memoryStorage({ [OPPONENT_PROFILES_STORAGE_KEY]: "{not json" });
    const result = loadOpponentProfiles(storage);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unreadable");
  });

  it("reports `invalid` WITH issues for a well-formed but wrong payload", () => {
    // "missing" and "corrupt" call for different reactions on auction night.
    const storage = memoryStorage({
      [OPPONENT_PROFILES_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        profiles: [{ ...CONFIRMED_PROFILE, personId: "non-un-person-id" }],
      }),
    });
    const result = loadOpponentProfiles(storage);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid");
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.profiles).toEqual([]);
    }
  });

  it("never returns a partial set: one bad profile invalidates the read", () => {
    const storage = memoryStorage({
      [OPPONENT_PROFILES_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        profiles: [CONFIRMED_PROFILE, { schemaVersion: 1 }],
      }),
    });
    expect(loadOpponentProfiles(storage).profiles).toEqual([]);
  });

  it("refuses a store written by a future schema version", () => {
    const storage = memoryStorage({
      [OPPONENT_PROFILES_STORAGE_KEY]: JSON.stringify({ schemaVersion: 2, profiles: [] }),
    });
    const result = loadOpponentProfiles(storage);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });

  it("survives a storage that throws on read", () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const result = loadOpponentProfiles(throwing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unreadable");
  });
});

describe("opponent profile storage — fail-closed writes", () => {
  it("refuses to persist an invalid profile", () => {
    const storage = memoryStorage();
    const result = saveOpponentProfiles(storage, [
      { ...CONFIRMED_PROFILE, personId: "ataturk" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
    expect(storage.data).toEqual({});
  });

  it("refuses to persist a name smuggled onto a profile", () => {
    const storage = memoryStorage();
    const withName = { ...CONFIRMED_PROFILE, name: "Nome Reale" } as unknown as typeof CONFIRMED_PROFILE;
    const result = saveOpponentProfiles(storage, [withName]);
    expect(result.ok).toBe(false);
    expect(storage.data).toEqual({});
  });

  it("refuses two profiles for the same person", () => {
    const storage = memoryStorage();
    const result = saveOpponentProfiles(storage, [CONFIRMED_PROFILE, CONFIRMED_PROFILE]);
    expect(result.ok).toBe(false);
    expect(storage.data).toEqual({});
  });

  it("reports `write-failed` when the write throws", () => {
    const throwing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    const result = saveOpponentProfiles(throwing, [CONFIRMED_PROFILE]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("write-failed");
  });

  it("reports `write-failed` when the write silently does not stick", () => {
    const amnesiac: StorageLike = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const result = saveOpponentProfiles(amnesiac, [CONFIRMED_PROFILE]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("write-failed");
  });

  it("does not echo a stored value into a save issue", () => {
    const storage = memoryStorage();
    const result = saveOpponentProfiles(storage, [
      { ...CONFIRMED_PROFILE, personId: "PERSON-ID-SBAGLIATO" },
    ]);
    expect(JSON.stringify(result)).not.toContain("PERSON-ID-SBAGLIATO");
  });
});

import { describe, it, expect } from "vitest";
import {
  AUCTION_HISTORY_STORAGE_KEY,
  OPPONENT_PROFILES_STORAGE_KEY,
  clearAuctionHistory,
  clearOpponentProfiles,
  loadAuctionHistory,
  loadOpponentProfiles,
  saveAuctionHistory,
  saveOpponentProfiles,
  type StorageLike,
} from "../src/storage.js";
import {
  CONFIRMED_PROFILE,
  PARTIALLY_CONFIRMED_PROFILE,
  syntheticAuctionHistory,
} from "../fixtures/synthetic.js";

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

// ── Storico d'asta — stessa disciplina, stessa casa ─────────────────────────

describe("auction history storage — round trip", () => {
  it("salva e rilegge lo storico, riga per riga", () => {
    const storage = memoryStorage();
    const history = syntheticAuctionHistory();
    expect(saveAuctionHistory(storage, history)).toEqual({ ok: true });
    const loaded = loadAuctionHistory(storage);
    expect(loaded.ok).toBe(true);
    expect(loaded.purchases).toEqual(history);
  });

  it("scrive sotto la chiave runtime-local e da nessun'altra parte", () => {
    const storage = memoryStorage();
    saveAuctionHistory(storage, syntheticAuctionHistory());
    expect(Object.keys(storage.data)).toEqual([AUCTION_HISTORY_STORAGE_KEY]);
    expect(AUCTION_HISTORY_STORAGE_KEY).not.toBe(OPPONENT_PROFILES_STORAGE_KEY);
  });

  it("uno storico assente è dichiarato come assente, non come vuoto", () => {
    const loaded = loadAuctionHistory(memoryStorage());
    expect(loaded.ok).toBe(false);
    expect(loaded.ok === false && loaded.reason).toBe("absent");
    expect(loaded.purchases).toEqual([]);
  });

  it("uno storico corrotto è `invalid` con le sue issue, mai path+valore", () => {
    const storage = memoryStorage({
      [AUCTION_HISTORY_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        purchases: [
          {
            season: "21-22",
            personId: "person:00000000-0000-4000-8000-000000000001",
            playerId: "sint-1",
            club: "Club Sintetico A",
            price: 10,
            acquisition: "asta",
          },
        ],
      }),
    });
    const loaded = loadAuctionHistory(storage);
    expect(loaded.ok).toBe(false);
    expect(loaded.ok === false && loaded.reason).toBe("invalid");
    expect(loaded.ok === false && loaded.issues.length).toBeGreaterThan(0);
    // Nessun valore che ha fallito finisce nel rapporto: solo path e codice.
    expect(JSON.stringify(loaded)).not.toContain("21-22");
  });

  it("un JSON illeggibile è `unreadable`, e non lancia", () => {
    const storage = memoryStorage({ [AUCTION_HISTORY_STORAGE_KEY]: "{non json" });
    const loaded = loadAuctionHistory(storage);
    expect(loaded.ok === false && loaded.reason).toBe("unreadable");
  });

  it("una versione di schema diversa è rifiutata, mai migrata a indovinare", () => {
    const storage = memoryStorage({
      [AUCTION_HISTORY_STORAGE_KEY]: JSON.stringify({ schemaVersion: 2, purchases: [] }),
    });
    expect(loadAuctionHistory(storage).ok).toBe(false);
  });

  it("una scrittura che non regge diventa `write-failed`, non uno storico evaporato", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(saveAuctionHistory(storage, syntheticAuctionHistory())).toEqual({
      ok: false,
      reason: "write-failed",
      issues: [],
    });
  });

  it("due righe uguali sono un conteggio gonfiato: rifiutate in scrittura", () => {
    const storage = memoryStorage();
    const one = syntheticAuctionHistory()[0]!;
    const result = saveAuctionHistory(storage, [one, { ...one }]);
    expect(result.ok).toBe(false);
    expect(Object.keys(storage.data)).toEqual([]);
  });

  it("cancella e dichiara se la cancellazione ha attecchito", () => {
    const storage = memoryStorage();
    saveAuctionHistory(storage, syntheticAuctionHistory());
    expect(clearAuctionHistory(storage)).toBe(true);
    expect(loadAuctionHistory(storage).ok).toBe(false);
  });
});

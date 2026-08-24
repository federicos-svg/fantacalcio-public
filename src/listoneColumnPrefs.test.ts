import { describe, it, expect } from "vitest";
import type { StorageLike } from "./logRecovery.js";
import {
  EMPTY_LISTONE_COLUMN_PREFS,
  LISTONE_COLUMN_PREFS_SCHEMA_VERSION,
  LISTONE_COLUMN_PREFS_STORAGE_KEY,
  isColumnVisible,
  loadListoneColumnPrefs,
  saveListoneColumnPrefs,
  toggleColumnPref,
  visibleColumnKeys,
  type ListoneColumnPrefs,
} from "./listoneColumnPrefs.js";

/** Le undici di Pico, in miniatura: quel che serve qui è che ci sia un
 *  default e qualcosa fuori dal default, non l'elenco vero. */
const DEFAULTS = ["name", "role", "club", "pagella_salute"] as const;
const ALL_COLUMNS = [
  { key: "name" },
  { key: "role" },
  { key: "club" },
  { key: "pagella_salute" },
  { key: "quotation" },
  { key: "fvm" },
] as const;

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { readonly map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** Uno storage che accetta la scrittura e non conserva niente — modalità
 *  privata, quota piena. Il salvataggio deve DIRE che non ha tenuto. */
const amnesicStorage: StorageLike = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error("storage disabled");
  },
  setItem: () => {
    throw new Error("storage disabled");
  },
  removeItem: () => {},
};

describe("loadListoneColumnPrefs — fail-closed a vuoto", () => {
  it("returns no deviations when nothing was ever saved", () => {
    expect(loadListoneColumnPrefs(memoryStorage())).toEqual(EMPTY_LISTONE_COLUMN_PREFS);
  });

  it("returns no deviations for unparsable text, a wrong shape or a wrong version", () => {
    for (const raw of [
      "{not json",
      JSON.stringify({ schemaVersion: 1 }),
      JSON.stringify({ schemaVersion: 99, hidden: ["quotation"], shown: [] }),
      JSON.stringify({ schemaVersion: 1, hidden: "quotation", shown: [] }),
      // `.strict()`: una chiave in più è un errore, non un campo che passa.
      JSON.stringify({ schemaVersion: 1, hidden: [], shown: [], extra: 1 }),
      JSON.stringify([{ schemaVersion: 1 }]),
    ]) {
      const storage = memoryStorage({ [LISTONE_COLUMN_PREFS_STORAGE_KEY]: raw });
      expect(loadListoneColumnPrefs(storage), raw).toEqual(EMPTY_LISTONE_COLUMN_PREFS);
    }
  });

  it("returns no deviations — never a throw — when the storage itself refuses", () => {
    expect(loadListoneColumnPrefs(throwingStorage)).toEqual(EMPTY_LISTONE_COLUMN_PREFS);
  });

  it("refuses an archive that says both «spenta» and «accesa» about one column", () => {
    // Non c'è nessuna regola onesta per scegliere quale delle due valga: si
    // riparte dal default, che è la sola cosa che nessuno ha interpretato.
    const storage = memoryStorage({
      [LISTONE_COLUMN_PREFS_STORAGE_KEY]: JSON.stringify({
        schemaVersion: LISTONE_COLUMN_PREFS_SCHEMA_VERSION,
        hidden: ["club"],
        shown: ["club"],
      }),
    });
    expect(loadListoneColumnPrefs(storage)).toEqual(EMPTY_LISTONE_COLUMN_PREFS);
  });

  it("reads back exactly what was written", () => {
    const storage = memoryStorage();
    const prefs: ListoneColumnPrefs = { hidden: ["club"], shown: ["quotation"] };
    expect(saveListoneColumnPrefs(storage, prefs)).toBe(true);
    expect(loadListoneColumnPrefs(storage)).toEqual(prefs);
  });

  it("de-duplicates a key repeated in the same list", () => {
    const storage = memoryStorage({
      [LISTONE_COLUMN_PREFS_STORAGE_KEY]: JSON.stringify({
        schemaVersion: LISTONE_COLUMN_PREFS_SCHEMA_VERSION,
        hidden: ["club", "club"],
        shown: [],
      }),
    });
    expect(loadListoneColumnPrefs(storage)).toEqual({ hidden: ["club"], shown: [] });
  });
});

describe("saveListoneColumnPrefs — dice quando non ha tenuto", () => {
  it("returns false when the write does not stick", () => {
    expect(saveListoneColumnPrefs(amnesicStorage, { hidden: ["club"], shown: [] })).toBe(false);
  });

  it("returns false — never a throw — when the storage refuses outright", () => {
    expect(saveListoneColumnPrefs(throwingStorage, { hidden: [], shown: [] })).toBe(false);
  });

  it("refuses to write a contradictory archive in the first place", () => {
    const storage = memoryStorage();
    expect(saveListoneColumnPrefs(storage, { hidden: ["club"], shown: ["club"] })).toBe(false);
    expect(storage.map.size).toBe(0);
  });
});

describe("toggleColumnPref — si registra la deviazione, non lo stato assoluto", () => {
  it("turns a default column off, and back on again", () => {
    const off = toggleColumnPref(EMPTY_LISTONE_COLUMN_PREFS, "club", DEFAULTS);
    expect(off).toEqual({ hidden: ["club"], shown: [] });
    expect(isColumnVisible("club", DEFAULTS, off)).toBe(false);
    const on = toggleColumnPref(off, "club", DEFAULTS);
    expect(on).toEqual(EMPTY_LISTONE_COLUMN_PREFS);
    expect(isColumnVisible("club", DEFAULTS, on)).toBe(true);
  });

  it("turns a non-default column on, and back off again", () => {
    const on = toggleColumnPref(EMPTY_LISTONE_COLUMN_PREFS, "quotation", DEFAULTS);
    expect(on).toEqual({ hidden: [], shown: ["quotation"] });
    expect(isColumnVisible("quotation", DEFAULTS, on)).toBe(true);
    const off = toggleColumnPref(on, "quotation", DEFAULTS);
    expect(off).toEqual(EMPTY_LISTONE_COLUMN_PREFS);
    expect(isColumnVisible("quotation", DEFAULTS, off)).toBe(false);
  });

  it("never leaves one key in both lists, whatever the sequence of presses", () => {
    let prefs = EMPTY_LISTONE_COLUMN_PREFS;
    for (const key of ["club", "quotation", "club", "quotation", "club", "fvm"]) {
      prefs = toggleColumnPref(prefs, key, DEFAULTS);
      expect(prefs.shown.filter((k) => prefs.hidden.includes(k))).toEqual([]);
    }
  });

  it("does not mutate the archive it was given", () => {
    const before: ListoneColumnPrefs = { hidden: [], shown: [] };
    toggleColumnPref(before, "club", DEFAULTS);
    expect(before).toEqual({ hidden: [], shown: [] });
  });

  it("keeps an explicit choice alive when the DEFAULT set later changes", () => {
    // È tutta la ragione per cui si salvano le deviazioni. Chi ha acceso la
    // quotazione se la ritrova accesa anche il giorno in cui il default
    // cambia; chi non ha mai toccato nulla vede il nuovo default.
    const chose = toggleColumnPref(EMPTY_LISTONE_COLUMN_PREFS, "quotation", DEFAULTS);
    const widerDefaults = [...DEFAULTS, "pagella_consiglio"];
    expect(isColumnVisible("quotation", widerDefaults, chose)).toBe(true);
    expect(isColumnVisible("pagella_consiglio", widerDefaults, chose)).toBe(true);
    expect(isColumnVisible("pagella_consiglio", widerDefaults, EMPTY_LISTONE_COLUMN_PREFS)).toBe(true);
  });
});

describe("visibleColumnKeys — le deviazioni dicono CHI, mai DOVE", () => {
  it("is exactly the default set when nothing was ever pressed", () => {
    expect(visibleColumnKeys(ALL_COLUMNS, DEFAULTS, EMPTY_LISTONE_COLUMN_PREFS)).toEqual([...DEFAULTS]);
  });

  it("puts a re-enabled column back in its own place, not at the end", () => {
    const prefs = toggleColumnPref(EMPTY_LISTONE_COLUMN_PREFS, "quotation", DEFAULTS);
    expect(visibleColumnKeys(ALL_COLUMNS, DEFAULTS, prefs)).toEqual([
      "name",
      "role",
      "club",
      "pagella_salute",
      "quotation",
    ]);
  });

  it("drops a remembered column that this pool no longer has", () => {
    const prefs: ListoneColumnPrefs = { hidden: [], shown: ["fvm"] };
    const withoutFvm = ALL_COLUMNS.filter((c) => c.key !== "fvm");
    expect(visibleColumnKeys(withoutFvm, DEFAULTS, prefs)).toEqual([...DEFAULTS]);
  });

  it("can end up with nothing visible — and says so instead of guessing a fallback", () => {
    const prefs: ListoneColumnPrefs = { hidden: [...DEFAULTS], shown: [] };
    expect(visibleColumnKeys(ALL_COLUMNS, DEFAULTS, prefs)).toEqual([]);
  });
});

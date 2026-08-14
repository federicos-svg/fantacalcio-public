// Unit tests for LIVE-02 fail-closed log persistence/recovery. Uses an
// in-memory StorageLike fake — never the real localStorage — per
// docs/AUCTION_2026_EXECUTION_PLAN.md LIVE-02 and this repo's no-jsdom
// testing posture (same pattern as src/price.test.ts).
import { describe, it, expect } from "vitest";
import { FANTA_TEAM_IDS, syntheticLog } from "../packages/engine/fixtures/synthetic.js";
import type { AuctionEvent } from "../packages/engine/src/types.js";
import type { ConfirmationInput } from "../packages/engine/src/confirmations.js";
import { reduce } from "../packages/engine/src/reduce.js";
import { recordPurchase } from "../packages/engine/src/feasibility.js";
import { CONFIRMATIONS_STORAGE_KEY, saveConfirmations } from "./confirmationsStore.js";
import {
  LOG_STORAGE_KEY,
  LAST_KNOWN_GOOD_STORAGE_KEY,
  QUARANTINE_STORAGE_KEY,
  PORTABLE_LOG_VERSION,
  validateAuctionLog,
  loadAuctionLog,
  saveAuctionLog,
  exportAuctionLog,
  parseAuctionLogImport,
  importAuctionLog,
  readQuarantinedLog,
  peekPortableLogEnvelope,
  type StorageLike,
} from "./logRecovery.js";

const TEAMS = FANTA_TEAM_IDS;

// ── Fakes ──────────────────────────────────────────────────────────────

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

class ReadThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error("synthetic read failure");
  }
  setItem(): void {
    throw new Error("synthetic write failure");
  }
  removeItem(): void {
    throw new Error("synthetic write failure");
  }
}

/** Wraps a real MemoryStorage but makes every setItem throw — used to test
 *  write failures on an otherwise-readable storage. */
class WriteThrowingStorage implements StorageLike {
  constructor(private readonly inner: MemoryStorage) {}
  getItem(key: string): string | null {
    return this.inner.getItem(key);
  }
  setItem(): void {
    throw new Error("synthetic write failure");
  }
  removeItem(key: string): void {
    this.inner.removeItem(key);
  }
}

class FaultStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  private operation = 0;
  constructor(
    initial: Record<string, string> = {},
    private readonly shouldThrow: (operation: number, method: "get" | "set" | "remove", key: string) => boolean,
  ) {
    for (const [key, value] of Object.entries(initial)) this.map.set(key, value);
  }
  private fault(method: "get" | "set" | "remove", key: string): void {
    this.operation += 1;
    if (this.shouldThrow(this.operation, method, key)) {
      throw new Error(`synthetic ${method} failure for ${key} at operation ${this.operation}`);
    }
  }
  getItem(key: string): string | null {
    this.fault("get", key);
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.fault("set", key);
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.fault("remove", key);
    this.map.delete(key);
  }
  peek(key: string): string | null {
    return this.map.get(key) ?? null;
  }
}

function lkgEnvelope(events: readonly AuctionEvent[]): string {
  return JSON.stringify({ schemaVersion: 1, log: events });
}

// ── loadAuctionLog ─────────────────────────────────────────────────────

describe("loadAuctionLog — boot-time fail-closed states", () => {
  it("no canonical key yet -> no-log, empty log, not treated as corruption", () => {
    const storage = new MemoryStorage();
    const result = loadAuctionLog(storage, TEAMS);
    expect(result).toEqual({ status: "no-log", log: [] });
  });

  it("canonical present as an empty valid array -> valid, empty log", () => {
    const storage = new MemoryStorage();
    storage.setItem(LOG_STORAGE_KEY, "[]");
    const result = loadAuctionLog(storage, TEAMS);
    expect(result).toEqual({ status: "valid", log: [] });
  });

  it("canonical present and valid with synthetic events -> valid, same events", () => {
    const storage = new MemoryStorage();
    const log = syntheticLog();
    storage.setItem(LOG_STORAGE_KEY, JSON.stringify(log));
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("valid");
    expect(result.status === "valid" && result.log).toEqual(log);
  });

  it("malformed JSON, no LKG -> unrecoverable, exact raw quarantined", () => {
    const storage = new MemoryStorage();
    const garbage = "{ this is not json at all !! 你好";
    storage.setItem(LOG_STORAGE_KEY, garbage);
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("unrecoverable");
    expect(result.status === "unrecoverable" && result.quarantinedRaw).toBe(garbage);
    expect(readQuarantinedLog(storage)).toBe(garbage);
  });

  it("valid JSON but not an array -> unrecoverable", () => {
    const storage = new MemoryStorage();
    storage.setItem(LOG_STORAGE_KEY, JSON.stringify({ not: "an array" }));
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("unrecoverable");
  });

  it("event with invalid shape (missing required fields) -> unrecoverable", () => {
    const storage = new MemoryStorage();
    storage.setItem(LOG_STORAGE_KEY, JSON.stringify([{ type: "PURCHASE", seq: 0 }]));
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("unrecoverable");
  });

  it("unknown event type -> unrecoverable", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LOG_STORAGE_KEY,
      JSON.stringify([{ type: "REFUND", seq: 0, ts: "2026-08-01T10:00:00Z" }]),
    );
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("unrecoverable");
  });

  it("invalid role/price/playerId fields -> unrecoverable", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LOG_STORAGE_KEY,
      JSON.stringify([
        {
          type: "PURCHASE",
          seq: 0,
          ts: "2026-08-01T10:00:00Z",
          playerId: "",
          role: "GK",
          fantaTeamId: TEAMS[0],
          price: "50",
        },
      ]),
    );
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("unrecoverable");
  });

  it("semantically invalid replay (unknown fantaTeamId) -> unrecoverable", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LOG_STORAGE_KEY,
      JSON.stringify([
        {
          type: "PURCHASE",
          seq: 0,
          ts: "2026-08-01T10:00:00Z",
          playerId: "A1",
          role: "A",
          fantaTeamId: "ghost-team-not-in-league",
          price: 10,
        },
      ]),
    );
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("unrecoverable");
  });

  it("incoherent VOID (targets a non-existent seq) -> unrecoverable", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LOG_STORAGE_KEY,
      JSON.stringify([{ type: "VOID", seq: 0, ts: "2026-08-01T10:00:00Z", targetSeq: 99 }]),
    );
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("unrecoverable");
  });

  it("incoherent VOID (double-voids the same target) -> unrecoverable", () => {
    const storage = new MemoryStorage();
    const events = [
      { type: "PURCHASE", seq: 0, ts: "2026-08-01T10:00:00Z", playerId: "A1", role: "A", fantaTeamId: TEAMS[0], price: 10 },
      { type: "VOID", seq: 1, ts: "2026-08-01T10:01:00Z", targetSeq: 0 },
      { type: "VOID", seq: 2, ts: "2026-08-01T10:02:00Z", targetSeq: 0 },
    ];
    storage.setItem(LOG_STORAGE_KEY, JSON.stringify(events));
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("unrecoverable");
  });

  it("duplicate active purchase of the same player without a void -> unrecoverable", () => {
    const storage = new MemoryStorage();
    const events = [
      { type: "PURCHASE", seq: 0, ts: "2026-08-01T10:00:00Z", playerId: "A1", role: "A", fantaTeamId: TEAMS[0], price: 10 },
      { type: "PURCHASE", seq: 1, ts: "2026-08-01T10:01:00Z", playerId: "A1", role: "A", fantaTeamId: TEAMS[1], price: 20 },
    ];
    storage.setItem(LOG_STORAGE_KEY, JSON.stringify(events));
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("unrecoverable");
  });

  it("corrupted canonical + valid last-known-good -> recovered from LKG, corrupted raw still quarantined", () => {
    const storage = new MemoryStorage();
    const goodLog = syntheticLog();
    storage.setItem(LAST_KNOWN_GOOD_STORAGE_KEY, lkgEnvelope(goodLog));
    const corrupted = "not json";
    storage.setItem(LOG_STORAGE_KEY, corrupted);

    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("recovered");
    expect(result.status === "recovered" && result.log).toEqual(goodLog);
    expect(result.status === "recovered" && result.quarantinedRaw).toBe(corrupted);
    expect(readQuarantinedLog(storage)).toBe(corrupted);
  });

  it("corrupted canonical + invalid last-known-good -> unrecoverable (a present-but-invalid LKG is not a recovery)", () => {
    const storage = new MemoryStorage();
    storage.setItem(LAST_KNOWN_GOOD_STORAGE_KEY, "also not json");
    storage.setItem(LOG_STORAGE_KEY, "not json either");

    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("unrecoverable");
  });

  it("corrupted canonical + last-known-good with wrong schemaVersion -> unrecoverable", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LAST_KNOWN_GOOD_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 999, log: syntheticLog() }),
    );
    storage.setItem(LOG_STORAGE_KEY, "not json");

    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("unrecoverable");
  });

  it("storage read failure -> storage-error, never a crash or a silently-empty log", () => {
    const storage = new ReadThrowingStorage();
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("storage-error");
    expect(result.status === "storage-error" && result.message.length).toBeGreaterThan(0);
  });

  it("quarantine write failing during load does not crash the read path", () => {
    const inner = new MemoryStorage();
    inner.setItem(LOG_STORAGE_KEY, "not json");
    const storage = new WriteThrowingStorage(inner);
    expect(() => loadAuctionLog(storage, TEAMS)).not.toThrow();
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("unrecoverable");
    expect(result.status === "unrecoverable" && result.quarantineStored).toBe(false);
    expect(result.status === "unrecoverable" && result.quarantinedRaw).toBe("not json");
  });

  it("uses the pre-existing fac_log key (backward compatible)", () => {
    expect(LOG_STORAGE_KEY).toBe("fac_log");
  });

  it("is deterministic: loading the same untouched storage twice yields the same result", () => {
    const storage = new MemoryStorage();
    storage.setItem(LOG_STORAGE_KEY, JSON.stringify(syntheticLog()));
    const first = loadAuctionLog(storage, TEAMS);
    const second = loadAuctionLog(storage, TEAMS);
    expect(second).toEqual(first);
  });
});

// ── saveAuctionLog ─────────────────────────────────────────────────────

describe("saveAuctionLog — the only write path", () => {
  it("persists a valid log to canonical and an up-to-date last-known-good", () => {
    const storage = new MemoryStorage();
    const log = syntheticLog();
    const result = saveAuctionLog(storage, log, TEAMS);
    expect(result).toEqual({ ok: true });
    expect(JSON.parse(storage.getItem(LOG_STORAGE_KEY)!)).toEqual(log);
    const lkg = JSON.parse(storage.getItem(LAST_KNOWN_GOOD_STORAGE_KEY)!);
    expect(lkg).toEqual({ schemaVersion: 1, log });
  });

  it("refuses to persist an invalid log and leaves existing canonical storage untouched", () => {
    const storage = new MemoryStorage();
    const goodLog = syntheticLog();
    storage.setItem(LOG_STORAGE_KEY, JSON.stringify(goodLog));

    const invalidLog = [
      { type: "PURCHASE", seq: 0, ts: "t", playerId: "X1", role: "A", fantaTeamId: "not-a-real-team", price: 5 },
    ] as unknown as AuctionEvent[];
    const result = saveAuctionLog(storage, invalidLog, TEAMS);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("invalid-log");
    expect(storage.getItem(LOG_STORAGE_KEY)).toBe(JSON.stringify(goodLog));
  });

  it("reports a storage write failure without throwing", () => {
    const storage = new WriteThrowingStorage(new MemoryStorage());
    const result = saveAuctionLog(storage, [], TEAMS);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("storage-write-error");
  });

  it("does not touch canonical when the LKG write fails first", () => {
    const old = JSON.stringify(syntheticLog().slice(0, 1));
    const storage = new FaultStorage(
      { [LOG_STORAGE_KEY]: old },
      (_operation, method, key) => method === "set" && key === LAST_KNOWN_GOOD_STORAGE_KEY,
    );
    const result = saveAuctionLog(storage, syntheticLog(), TEAMS);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("storage-write-error");
    expect(storage.peek(LOG_STORAGE_KEY)).toBe(old);
  });

  it("reports partial-write when an LKG write error cannot restore the prior LKG", () => {
    const storage = new FaultStorage(
      { [LOG_STORAGE_KEY]: "[]", [LAST_KNOWN_GOOD_STORAGE_KEY]: lkgEnvelope([]) },
      (_operation, method, key) => method === "set" && key === LAST_KNOWN_GOOD_STORAGE_KEY,
    );
    const result = saveAuctionLog(storage, syntheticLog(), TEAMS);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("partial-write");
    expect(storage.peek(LOG_STORAGE_KEY)).toBe("[]");
  });

  it("rolls LKG back exactly when canonical write fails", () => {
    const oldCanonical = JSON.stringify([]);
    const oldLkg = lkgEnvelope([]);
    const storage = new FaultStorage(
      { [LOG_STORAGE_KEY]: oldCanonical, [LAST_KNOWN_GOOD_STORAGE_KEY]: oldLkg },
      (_operation, method, key) => method === "set" && key === LOG_STORAGE_KEY,
    );
    const result = saveAuctionLog(storage, syntheticLog(), TEAMS);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("storage-write-error");
    expect(storage.peek(LOG_STORAGE_KEY)).toBe(oldCanonical);
    expect(storage.peek(LAST_KNOWN_GOOD_STORAGE_KEY)).toBe(oldLkg);
  });

  it("reports partial-write when canonical fails and LKG rollback also fails", () => {
    let lkgSets = 0;
    const storage = new FaultStorage(
      { [LOG_STORAGE_KEY]: "[]", [LAST_KNOWN_GOOD_STORAGE_KEY]: lkgEnvelope([]) },
      (_operation, method, key) => {
        if (method === "set" && key === LAST_KNOWN_GOOD_STORAGE_KEY) {
          lkgSets += 1;
          return lkgSets === 2;
        }
        return method === "set" && key === LOG_STORAGE_KEY;
      },
    );
    const result = saveAuctionLog(storage, syntheticLog(), TEAMS);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("partial-write");
  });

  it("fails before writes when the initial storage snapshot cannot be read", () => {
    const storage = new FaultStorage({}, (_operation, method) => method === "get");
    const result = saveAuctionLog(storage, [], TEAMS);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("storage-write-error");
    expect(storage.peek(LOG_STORAGE_KEY)).toBeNull();
    expect(storage.peek(LAST_KNOWN_GOOD_STORAGE_KEY)).toBeNull();
  });

  it("never mutates the log array passed in", () => {
    const storage = new MemoryStorage();
    const log = Object.freeze(syntheticLog().slice());
    expect(() => saveAuctionLog(storage, log, TEAMS)).not.toThrow();
    expect(log).toEqual(syntheticLog());
  });

  it("is idempotent: saving the same valid log twice yields the same stored state", () => {
    const storage = new MemoryStorage();
    const log = syntheticLog();
    saveAuctionLog(storage, log, TEAMS);
    const afterFirst = storage.getItem(LOG_STORAGE_KEY);
    saveAuctionLog(storage, log, TEAMS);
    const afterSecond = storage.getItem(LOG_STORAGE_KEY);
    expect(afterSecond).toBe(afterFirst);
  });
});

// ── validateAuctionLog — direct unit coverage ──────────────────────────

describe("validateAuctionLog", () => {
  it("accepts an empty array", () => {
    expect(validateAuctionLog([], TEAMS)).toEqual({ ok: true, events: [] });
  });

  it("never mutates its input", () => {
    const input = syntheticLog();
    const snapshot = JSON.parse(JSON.stringify(input));
    validateAuctionLog(input, TEAMS);
    expect(input).toEqual(snapshot);
  });

  it("is deterministic for the same input", () => {
    const input = syntheticLog();
    expect(validateAuctionLog(input, TEAMS)).toEqual(validateAuctionLog(input, TEAMS));
  });

  it("rejects a non-array payload", () => {
    const result = validateAuctionLog("nope", TEAMS);
    expect(result.ok).toBe(false);
  });
});

describe("LIVE-01 portable auction log", () => {
  it("exports deterministically and round-trips through the runtime/replay validator", () => {
    const log = syntheticLog();
    const first = exportAuctionLog(log, TEAMS);
    const second = exportAuctionLog(log, TEAMS);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const parsed = parseAuctionLogImport(first.raw, TEAMS);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.events).toEqual(log);
    expect(parsed.ok && reduce(parsed.events, TEAMS)).toEqual(reduce(log, TEAMS));
  });

  it("never writes the removed manualPlayers key", () => {
    const exported = exportAuctionLog(syntheticLog(), TEAMS);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(Object.keys(JSON.parse(exported.raw)).sort()).toEqual(["confirmations", "format", "log", "version"]);
  });

  it("still imports a file exported while manual scouting existed, ignoring that key", () => {
    // The feature is gone, but files written when it existed must keep
    // importing rather than fail the envelope check and strand a real log.
    const log = syntheticLog();
    const legacy = JSON.stringify({
      format: "fantacalcio-auction-log",
      version: 1,
      log,
      manualPlayers: [
        {
          id: "manual:123e4567-e89b-42d3-a456-426614174000",
          name: "Talento Estero",
          role: "A",
          note: "Club estero",
          scoutingRange: null,
          highVariance: false,
          upside: false,
        },
      ],
    });
    const parsed = parseAuctionLogImport(legacy, TEAMS);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.events).toEqual(log);
    // Whatever that key held is no longer surfaced anywhere.
    expect(parsed.ok && "manualPlayers" in parsed).toBe(false);
  });

  it.each([
    ["malformed JSON", "{", "malformed-file"],
    ["unknown envelope", JSON.stringify({ format: "other", version: 1, log: [] }), "malformed-file"],
    ["future version", JSON.stringify({ format: "fantacalcio-auction-log", version: 3, log: [] }), "incompatible-version"],
    ["semantic invalidity", JSON.stringify({
      format: "fantacalcio-auction-log",
      version: 1,
      log: [{ type: "VOID", seq: 0, ts: "2026-07-25T00:00:00.000Z", targetSeq: 99 }],
    }), "invalid-log"],
    // v2 envelope with a malformed confirmations field (not an array of
    // valid entries) is malformed-file, distinct from a semantically
    // invalid one (covered in the v2-specific describe block below).
    ["v2 with malformed confirmations shape", JSON.stringify({
      format: "fantacalcio-auction-log",
      version: 2,
      log: [],
      confirmations: [{ fantaTeamId: "t1" }],
    }), "malformed-file"],
    // version says 1 but the envelope carries a v2-only key — internally
    // inconsistent, not a version mismatch.
    ["v2-shaped envelope claiming version 1", JSON.stringify({
      format: "fantacalcio-auction-log",
      version: 1,
      log: [],
      confirmations: [],
    }), "malformed-file"],
    // version says 2 but the envelope is missing the v2-only key.
    ["v1-shaped envelope claiming version 2", JSON.stringify({
      format: "fantacalcio-auction-log",
      version: 2,
      log: [],
    }), "malformed-file"],
  ])("rejects %s without changing canonical state", (_label, raw, expectedReason) => {
    const storage = new MemoryStorage();
    const current = syntheticLog();
    saveAuctionLog(storage, current, TEAMS);
    const before = storage.getItem(LOG_STORAGE_KEY);
    const result = importAuctionLog(storage, current, raw, TEAMS, true);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe(expectedReason);
    expect(storage.getItem(LOG_STORAGE_KEY)).toBe(before);
  });

  it("requires explicit confirmation before replacing a non-empty log", () => {
    const storage = new MemoryStorage();
    const current = syntheticLog();
    saveAuctionLog(storage, current, TEAMS);
    const replacement = exportAuctionLog([], TEAMS);
    expect(replacement.ok).toBe(true);
    if (!replacement.ok) return;
    const result = importAuctionLog(storage, current, replacement.raw, TEAMS, false);
    expect(result).toEqual({ ok: false, reason: "confirmation-required" });
    expect(JSON.parse(storage.getItem(LOG_STORAGE_KEY)!)).toEqual(current);
  });

  it("persists a confirmed import only through the safe save path", () => {
    const storage = new MemoryStorage();
    saveAuctionLog(storage, [], TEAMS);
    const exported = exportAuctionLog(syntheticLog(), TEAMS);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const result = importAuctionLog(storage, [], exported.raw, TEAMS, true);
    expect(result.ok).toBe(true);
    expect(JSON.parse(storage.getItem(LOG_STORAGE_KEY)!)).toEqual(syntheticLog());
    expect(JSON.parse(storage.getItem(LAST_KNOWN_GOOD_STORAGE_KEY)!).log).toEqual(syntheticLog());
  });

  it("surfaces storage-write-error and partial-write without advancing the imported state", () => {
    const exported = exportAuctionLog(syntheticLog(), TEAMS);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const writeError = importAuctionLog(new WriteThrowingStorage(new MemoryStorage()), [], exported.raw, TEAMS, true);
    expect(!writeError.ok && writeError.reason).toBe("storage-write-error");

    const partialStorage = new FaultStorage(
      { [LOG_STORAGE_KEY]: "[]", [LAST_KNOWN_GOOD_STORAGE_KEY]: lkgEnvelope([]) },
      (_operation, method, key) => method === "set" && key === LAST_KNOWN_GOOD_STORAGE_KEY,
    );
    const partial = importAuctionLog(partialStorage, [], exported.raw, TEAMS, true);
    expect(!partial.ok && partial.reason).toBe("partial-write");
  });
});

// ── Tranche 2b (#231): confirmations threading + portable log v2 ─────────

const CONFIRM: ConfirmationInput = { fantaTeamId: TEAMS[0]!, playerId: "kd", role: "D", price: 100 };

describe("validateAuctionLog — confirmations threading (tranche 2b)", () => {
  it("omitted confirmations reproduces prior behaviour exactly (default [])", () => {
    const withDefault = validateAuctionLog(syntheticLog(), TEAMS);
    const withEmpty = validateAuctionLog(syntheticLog(), TEAMS, []);
    expect(withDefault).toEqual(withEmpty);
  });

  it("rejects a log that live-purchases an already-confirmed playerId (audit fix 3)", () => {
    const st0 = reduce([], TEAMS);
    const log = recordPurchase([], st0, { playerId: "kd", role: "D", fantaTeamId: TEAMS[1]!, price: 10 }, "ts");
    const result = validateAuctionLog(log, TEAMS, [CONFIRM]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reasons.some((r) => r.includes("confirmations/live-log conflict"))).toBe(true);
  });

  it("accepts the same log when the confirmation is absent (no conflict to detect)", () => {
    const st0 = reduce([], TEAMS);
    const log = recordPurchase([], st0, { playerId: "kd", role: "D", fantaTeamId: TEAMS[1]!, price: 10 }, "ts");
    expect(validateAuctionLog(log, TEAMS).ok).toBe(true);
  });

  it("an invalid confirmations batch on its own fails validation too (invalid-team)", () => {
    const result = validateAuctionLog([], TEAMS, [{ ...CONFIRM, fantaTeamId: "ghost-team" }]);
    expect(result.ok).toBe(false);
  });
});

describe("loadAuctionLog/saveAuctionLog — confirmations threading (tranche 2b)", () => {
  it("loadAuctionLog treats a confirmations-conflicting canonical log as invalid, not a crash", () => {
    const storage = new MemoryStorage();
    const st0 = reduce([], TEAMS);
    const log = recordPurchase([], st0, { playerId: "kd", role: "D", fantaTeamId: TEAMS[1]!, price: 10 }, "ts");
    storage.setItem(LOG_STORAGE_KEY, JSON.stringify(log));
    expect(() => loadAuctionLog(storage, TEAMS, [CONFIRM])).not.toThrow();
    const result = loadAuctionLog(storage, TEAMS, [CONFIRM]);
    expect(result.status).toBe("unrecoverable");
  });

  it("loadAuctionLog accepts the same log without the conflicting confirmation", () => {
    const storage = new MemoryStorage();
    const st0 = reduce([], TEAMS);
    const log = recordPurchase([], st0, { playerId: "kd", role: "D", fantaTeamId: TEAMS[1]!, price: 10 }, "ts");
    storage.setItem(LOG_STORAGE_KEY, JSON.stringify(log));
    const result = loadAuctionLog(storage, TEAMS);
    expect(result.status).toBe("valid");
  });

  it("saveAuctionLog refuses to persist a log that conflicts with the given confirmations", () => {
    const storage = new MemoryStorage();
    const st0 = reduce([], TEAMS);
    const log = recordPurchase([], st0, { playerId: "kd", role: "D", fantaTeamId: TEAMS[1]!, price: 10 }, "ts");
    const result = saveAuctionLog(storage, log, TEAMS, undefined, [CONFIRM]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("invalid-log");
    expect(storage.getItem(LOG_STORAGE_KEY)).toBeNull();
  });

  it("saveAuctionLog's divergence baseline (expectedPreviousLog) is computed against the same confirmations", () => {
    const storage = new MemoryStorage();
    // Persist an empty log seeded with CONFIRM already in view.
    saveAuctionLog(storage, [], TEAMS, undefined, [CONFIRM]);
    // A save whose baseline is [] validated against [CONFIRM] must match the
    // stored canonical (also [] under [CONFIRM]) and be accepted.
    const st0 = reduce([], TEAMS, [CONFIRM]);
    const nextLog = recordPurchase([], st0, { playerId: "other", role: "C", fantaTeamId: TEAMS[2]!, price: 5 }, "ts");
    const result = saveAuctionLog(storage, nextLog, TEAMS, [], [CONFIRM]);
    expect(result.ok).toBe(true);
  });
});

describe("LIVE-01 portable log v2 — export/import round-trip (tranche 2b)", () => {
  it("PORTABLE_LOG_VERSION is 2", () => {
    expect(PORTABLE_LOG_VERSION).toBe(2);
  });

  it("exports a v2 envelope carrying the confirmations batch and round-trips through import", () => {
    const log = syntheticLog();
    const confirmations = [CONFIRM];
    const exported = exportAuctionLog(log, TEAMS, confirmations);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(JSON.parse(exported.raw)).toMatchObject({ version: 2, confirmations });

    const parsed = parseAuctionLogImport(exported.raw, TEAMS);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.events).toEqual(log);
    expect(parsed.ok && parsed.confirmations).toEqual(confirmations);
  });

  it("v1 legacy file (no confirmations key) validated against the device's CURRENT confirmations: coherent -> import", () => {
    // A pre-2b export of an empty log — nobody bought "kd" in it, so it is
    // coherent with a device that has since confirmed "kd".
    const legacy = JSON.stringify({ format: "fantacalcio-auction-log", version: 1, log: [] });
    const result = parseAuctionLogImport(legacy, TEAMS, [CONFIRM]);
    expect(result.ok).toBe(true);
    expect(result.ok && result.confirmations).toEqual([CONFIRM]);
  });

  it("v1 legacy file validated against the device's CURRENT confirmations: incoherent -> explicit rejection", () => {
    const st0 = reduce([], TEAMS);
    const log = recordPurchase([], st0, { playerId: "kd", role: "D", fantaTeamId: TEAMS[1]!, price: 10 }, "ts");
    const legacy = JSON.stringify({ format: "fantacalcio-auction-log", version: 1, log });
    const result = parseAuctionLogImport(legacy, TEAMS, [CONFIRM]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("invalid-log");
  });

  it("v2 file with a semantically invalid confirmations batch is rejected", () => {
    const bad = JSON.stringify({
      format: "fantacalcio-auction-log",
      version: 2,
      log: [],
      confirmations: [{ ...CONFIRM, role: "P" }],
    });
    const result = parseAuctionLogImport(bad, TEAMS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("invalid-log");
  });

  it("v2 file whose log conflicts with its OWN confirmations is rejected", () => {
    const st0 = reduce([], TEAMS);
    const log = recordPurchase([], st0, { playerId: "kd", role: "D", fantaTeamId: TEAMS[1]!, price: 10 }, "ts");
    const bad = JSON.stringify({
      format: "fantacalcio-auction-log",
      version: 2,
      log,
      confirmations: [CONFIRM],
    });
    const result = parseAuctionLogImport(bad, TEAMS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("invalid-log");
  });
});

// Post-review fix (round 2, #285): main.ts's import-confirm dialog copy
// (renderImportConfirm) uses this to say EXACTLY what an import replaces
// before the operator commits — never a validation decision of its own.
describe("peekPortableLogEnvelope — dialog-copy classification only, never validation (tranche 2b, #285)", () => {
  it("a well-formed v2 envelope classifies as v2, even with semantically invalid confirmations", () => {
    const bad = JSON.stringify({
      format: "fantacalcio-auction-log",
      version: 2,
      log: [],
      confirmations: [{ ...CONFIRM, role: "P" }],
    });
    // parseAuctionLogImport rejects this (see the sibling test above) — the
    // peek still classifies it v2: it is a dialog-copy hint, not a gate.
    expect(peekPortableLogEnvelope(bad)).toBe("v2");
  });

  it("v1 basic and v1 legacy (manualPlayers) shapes both classify as v1", () => {
    expect(peekPortableLogEnvelope(JSON.stringify({ format: "fantacalcio-auction-log", version: 1, log: [] }))).toBe(
      "v1",
    );
    expect(
      peekPortableLogEnvelope(
        JSON.stringify({ format: "fantacalcio-auction-log", version: 1, log: [], manualPlayers: [] }),
      ),
    ).toBe("v1");
  });

  it("malformed JSON, wrong format, and a version/shape mismatch all classify as unknown", () => {
    expect(peekPortableLogEnvelope("not json at all")).toBe("unknown");
    expect(peekPortableLogEnvelope(JSON.stringify({ format: "something-else", version: 1, log: [] }))).toBe(
      "unknown",
    );
    // v2-shaped keys claiming version 1 (or vice versa) — internally
    // inconsistent, same as parseAuctionLogImport's own "malformed-file".
    expect(
      peekPortableLogEnvelope(
        JSON.stringify({ format: "fantacalcio-auction-log", version: 1, log: [], confirmations: [] }),
      ),
    ).toBe("unknown");
    expect(peekPortableLogEnvelope(JSON.stringify([1, 2, 3]))).toBe("unknown");
  });
});

describe("importAuctionLog — v2 replaces confirmations, verified rollback on failure (tranche 2b)", () => {
  it("a v2 import persists both the log AND the confirmations batch", () => {
    const storage = new MemoryStorage();
    const exported = exportAuctionLog(syntheticLog(), TEAMS, [CONFIRM]);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const result = importAuctionLog(storage, [], exported.raw, TEAMS, true);
    expect(result.ok).toBe(true);
    expect(result.ok && result.confirmations).toEqual([CONFIRM]);
    expect(JSON.parse(storage.getItem(LOG_STORAGE_KEY)!)).toEqual(syntheticLog());
    expect(JSON.parse(storage.getItem(CONFIRMATIONS_STORAGE_KEY)!)).toEqual({
      schemaVersion: 1,
      confirmations: [CONFIRM],
    });
  });

  it("a v1 legacy import leaves the device's existing confirmations byte-identical", () => {
    const storage = new MemoryStorage();
    saveAuctionLog(storage, [], TEAMS, undefined, [CONFIRM]);
    const beforeConfirmations = storage.getItem(CONFIRMATIONS_STORAGE_KEY);
    expect(beforeConfirmations).toBeNull(); // saveAuctionLog never writes the confirmations key itself
    const legacy = JSON.stringify({ format: "fantacalcio-auction-log", version: 1, log: [] });
    const result = importAuctionLog(storage, [], legacy, TEAMS, true, [CONFIRM]);
    expect(result.ok).toBe(true);
    expect(result.ok && result.confirmations).toEqual([CONFIRM]);
  });

  it("rolls the log back to its pre-import state (verified) when persisting the imported confirmations fails", () => {
    const inner = new MemoryStorage();
    const storage = new (class implements StorageLike {
      getItem(key: string): string | null {
        return inner.getItem(key);
      }
      setItem(key: string, value: string): void {
        if (key === CONFIRMATIONS_STORAGE_KEY) throw new Error("synthetic confirmations write failure");
        inner.setItem(key, value);
      }
      removeItem(key: string): void {
        inner.removeItem(key);
      }
    })();

    const preExisting = [
      { type: "PURCHASE" as const, seq: 0, ts: "2026-08-01T10:00:00Z", playerId: "A1", role: "A" as const, fantaTeamId: TEAMS[0]!, price: 10 },
    ];
    saveAuctionLog(storage, preExisting, TEAMS);
    const beforeCanonical = storage.getItem(LOG_STORAGE_KEY);

    const exported = exportAuctionLog(syntheticLog(), TEAMS, [CONFIRM]);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const result = importAuctionLog(storage, preExisting, exported.raw, TEAMS, true);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("storage-write-error");
    // The log is back to exactly what it was before this import attempt —
    // never left "moved" while its paired confirmations failed to persist.
    expect(storage.getItem(LOG_STORAGE_KEY)).toBe(beforeCanonical);
  });

  it("rolls the RICONFERME store back too (verified) when persisting them lands in a partial-write, not just the log", () => {
    // Fails exactly the verification read saveConfirmations() does right
    // after its own write — the write itself does NOT throw, so this is
    // "partial-write" (an indeterminate value now on disk), never the
    // simpler "storage-write-error" the sibling test above already covers.
    // Only the confirmations key's SECOND read is made to fail: the FIRST
    // is importAuctionLog's own pre-write snapshot (this fix's addition),
    // which must succeed for there to be anything to roll back to.
    class ConfirmationsVerifyFailsOnceStorage implements StorageLike {
      private readonly map = new Map<string, string>();
      private confirmationsGetCount = 0;
      constructor(initial: Record<string, string>) {
        for (const [k, v] of Object.entries(initial)) this.map.set(k, v);
      }
      getItem(key: string): string | null {
        if (key === CONFIRMATIONS_STORAGE_KEY) {
          this.confirmationsGetCount += 1;
          if (this.confirmationsGetCount === 2) throw new Error("synthetic verify-read failure");
        }
        return this.map.get(key) ?? null;
      }
      setItem(key: string, value: string): void {
        this.map.set(key, value);
      }
      removeItem(key: string): void {
        this.map.delete(key);
      }
    }

    const preExistingLog = [
      { type: "PURCHASE" as const, seq: 0, ts: "2026-08-01T10:00:00Z", playerId: "A1", role: "A" as const, fantaTeamId: TEAMS[0]!, price: 10 },
    ];
    const preExistingConfirmations: ConfirmationInput[] = [
      { fantaTeamId: TEAMS[3]!, playerId: "pre-existing", role: "C", price: 20 },
    ];

    const seed = new MemoryStorage();
    saveAuctionLog(seed, preExistingLog, TEAMS);
    saveConfirmations(seed, preExistingConfirmations, TEAMS);
    const beforeLogRaw = seed.getItem(LOG_STORAGE_KEY)!;
    const beforeLkgRaw = seed.getItem(LAST_KNOWN_GOOD_STORAGE_KEY)!;
    const beforeConfirmationsRaw = seed.getItem(CONFIRMATIONS_STORAGE_KEY)!;
    expect(beforeConfirmationsRaw).not.toBeNull();

    const storage = new ConfirmationsVerifyFailsOnceStorage({
      [LOG_STORAGE_KEY]: beforeLogRaw,
      [LAST_KNOWN_GOOD_STORAGE_KEY]: beforeLkgRaw,
      [CONFIRMATIONS_STORAGE_KEY]: beforeConfirmationsRaw,
    });

    const exported = exportAuctionLog(syntheticLog(), TEAMS, [CONFIRM]);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const result = importAuctionLog(storage, preExistingLog, exported.raw, TEAMS, true);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("storage-write-error");
    expect(!result.ok && "message" in result && result.message).toContain("riconferme");

    // BOTH stores are back exactly at their pre-import bytes — never a log
    // "moved" back while a partially-written riconferme batch stayed put.
    expect(storage.getItem(LOG_STORAGE_KEY)).toBe(beforeLogRaw);
    expect(storage.getItem(CONFIRMATIONS_STORAGE_KEY)).toBe(beforeConfirmationsRaw);
  });

  it("reports partial-write, never storage-write-error, when the riconferme write AND its own rollback both fail (post-review round 2, #285)", () => {
    // Double storage failure: the confirmations write fails, and the
    // rollback attempt that follows (which writes to the SAME key) fails
    // too. Storage is then left in a state this call cannot verify — the
    // log may have "moved" to the imported one while the riconferme store
    // never followed it back. That is exactly the `partial-write` contract
    // documented on SaveLogResult/ImportLogResult ("an unverifiable final
    // state is reported as partial-write so the UI can remain blocked"),
    // never the plain `storage-write-error` used when a write cleanly fails
    // with nothing left half-done — main.ts's persistenceErrorMessage()
    // renders `storage-write-error` as "La modifica NON è stata applicata",
    // which would be FALSE here: the imported log may well be the one still
    // on disk.
    class ConfirmationsWriteAlwaysFailsStorage implements StorageLike {
      private readonly map = new Map<string, string>();
      constructor(initial: Record<string, string>) {
        for (const [k, v] of Object.entries(initial)) this.map.set(k, v);
      }
      getItem(key: string): string | null {
        return this.map.get(key) ?? null;
      }
      setItem(key: string, value: string): void {
        if (key === CONFIRMATIONS_STORAGE_KEY) throw new Error("synthetic confirmations write failure (permanent)");
        this.map.set(key, value);
      }
      removeItem(key: string): void {
        if (key === CONFIRMATIONS_STORAGE_KEY) throw new Error("synthetic confirmations write failure (permanent)");
        this.map.delete(key);
      }
    }

    const preExistingLog = [
      { type: "PURCHASE" as const, seq: 0, ts: "2026-08-01T10:00:00Z", playerId: "A1", role: "A" as const, fantaTeamId: TEAMS[0]!, price: 10 },
    ];
    const preExistingConfirmations: ConfirmationInput[] = [
      { fantaTeamId: TEAMS[3]!, playerId: "pre-existing", role: "C", price: 20 },
    ];

    // Seed on an ordinary MemoryStorage first (so the pre-existing
    // confirmations raw value is non-null: the permanent-failure storage
    // below needs something already on disk for its rollback ATTEMPT — a
    // setItem, not a removeItem — to be the one that fails).
    const seed = new MemoryStorage();
    saveAuctionLog(seed, preExistingLog, TEAMS);
    saveConfirmations(seed, preExistingConfirmations, TEAMS);
    const beforeLogRaw = seed.getItem(LOG_STORAGE_KEY)!;
    const beforeLkgRaw = seed.getItem(LAST_KNOWN_GOOD_STORAGE_KEY)!;
    const beforeConfirmationsRaw = seed.getItem(CONFIRMATIONS_STORAGE_KEY)!;
    expect(beforeConfirmationsRaw).not.toBeNull();

    const storage = new ConfirmationsWriteAlwaysFailsStorage({
      [LOG_STORAGE_KEY]: beforeLogRaw,
      [LAST_KNOWN_GOOD_STORAGE_KEY]: beforeLkgRaw,
      [CONFIRMATIONS_STORAGE_KEY]: beforeConfirmationsRaw,
    });

    const exported = exportAuctionLog(syntheticLog(), TEAMS, [CONFIRM]);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const result = importAuctionLog(storage, preExistingLog, exported.raw, TEAMS, true);
    expect(result.ok).toBe(false);
    // The load-bearing assertion: this must route as partial-write, not
    // storage-write-error, so the UI blocks instead of showing a dismissible
    // banner claiming nothing was applied.
    expect(!result.ok && result.reason).toBe("partial-write");
    expect(!result.ok && "message" in result && result.message).toContain("indeterminato");
    // The message this function itself produces must never claim the
    // import was not applied — it may well have been (the log write
    // succeeded before the confirmations write failed).
    expect(!result.ok && "message" in result && result.message).not.toMatch(/non\s+è\s+stata\s+applicata/i);
    expect(!result.ok && "message" in result && result.message).not.toMatch(/modifica non applicata/i);

    // The log HALF of the rollback still succeeds here (only the
    // riconferme key is made to fail) and lands back at its pre-import
    // bytes — this test's fake is deliberately narrower than a total
    // storage outage so it isolates the one thing that makes the outcome
    // unverifiable: the riconferme store, which could be left holding
    // either its old batch, a half-written new one, or nothing, depending
    // on exactly where the underlying write failed. That is the case
    // `partial-write` exists to name, so this test only asserts the
    // reason/message contract above, never a specific byte value for
    // CONFIRMATIONS_STORAGE_KEY.
    expect(storage.getItem(LOG_STORAGE_KEY)).toBe(beforeLogRaw);
  });
});

// Unit tests for tranche 2b's riconferme persistence (LEAGUE_RULES.md §4).
// In-memory StorageLike fake — never real localStorage, same posture as
// src/logRecovery.test.ts and src/leagueTeams.test.ts.
import { describe, expect, it } from "vitest";
import type { ConfirmationInput } from "../packages/engine/src/confirmations.js";
import type { StorageLike } from "./logRecovery.js";
import {
  CONFIRMATIONS_QUARANTINE_STORAGE_KEY,
  CONFIRMATIONS_STORAGE_KEY,
  confirmationErrorText,
  loadConfirmations,
  readQuarantinedConfirmations,
  saveConfirmations,
} from "./confirmationsStore.js";

const TEAMS = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];

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

/** Storage whose setItem "sticks" for the WRITE but silently drops on the
 *  verification re-read — used to exercise saveConfirmations' partial-write
 *  branch without a throw. */
class MismatchOnReadBackStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  setCount = 0;
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.setCount += 1;
    this.map.set(key, value === "" ? value : `${value}\0tampered`);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function validEntry(overrides: Partial<ConfirmationInput> = {}): ConfirmationInput {
  return { fantaTeamId: "t1", playerId: "p1", role: "D", price: 10, ...overrides };
}

describe("loadConfirmations — boot-time fail-closed states", () => {
  it("no canonical key yet -> none, empty batch (byte-identical to pre-2b)", () => {
    const storage = new MemoryStorage();
    expect(loadConfirmations(storage, TEAMS)).toEqual({ status: "none", confirmations: [] });
  });

  it("valid empty envelope -> valid, empty batch", () => {
    const storage = new MemoryStorage();
    storage.setItem(CONFIRMATIONS_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, confirmations: [] }));
    expect(loadConfirmations(storage, TEAMS)).toEqual({ status: "valid", confirmations: [] });
  });

  it("valid non-empty envelope -> valid, same entries", () => {
    const storage = new MemoryStorage();
    const confirmations = [validEntry(), validEntry({ fantaTeamId: "t2", playerId: "p2", role: "C" })];
    storage.setItem(CONFIRMATIONS_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, confirmations }));
    const result = loadConfirmations(storage, TEAMS);
    expect(result).toEqual({ status: "valid", confirmations });
  });

  it("malformed JSON -> invalid, exact raw quarantined", () => {
    const storage = new MemoryStorage();
    const garbage = "{ not json !!";
    storage.setItem(CONFIRMATIONS_STORAGE_KEY, garbage);
    const result = loadConfirmations(storage, TEAMS);
    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.quarantinedRaw).toBe(garbage);
    expect(readQuarantinedConfirmations(storage)).toBe(garbage);
  });

  it("wrong schemaVersion -> invalid (structural)", () => {
    const storage = new MemoryStorage();
    storage.setItem(CONFIRMATIONS_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, confirmations: [] }));
    expect(loadConfirmations(storage, TEAMS).status).toBe("invalid");
  });

  it("entry with unknown extra field -> invalid (strict schema)", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CONFIRMATIONS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, confirmations: [{ ...validEntry(), extra: "nope" }] }),
    );
    expect(loadConfirmations(storage, TEAMS).status).toBe("invalid");
  });

  it("entry with role P -> invalid (structural shape allows P, semantic layer rejects it)", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CONFIRMATIONS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, confirmations: [validEntry({ role: "P" })] }),
    );
    expect(loadConfirmations(storage, TEAMS).status).toBe("invalid");
  });

  it("entry with negative price -> invalid (structural: nonneg int)", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CONFIRMATIONS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, confirmations: [validEntry({ price: -1 })] }),
    );
    expect(loadConfirmations(storage, TEAMS).status).toBe("invalid");
  });

  it("entry with fractional price -> invalid (structural: int)", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CONFIRMATIONS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, confirmations: [validEntry({ price: 10.5 })] }),
    );
    expect(loadConfirmations(storage, TEAMS).status).toBe("invalid");
  });

  it("structurally valid but semantically invalid (two D riconferme on the same team) -> invalid", () => {
    const storage = new MemoryStorage();
    const confirmations = [
      validEntry({ playerId: "p1", role: "D" }),
      validEntry({ playerId: "p2", role: "D" }),
    ];
    storage.setItem(CONFIRMATIONS_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, confirmations }));
    expect(loadConfirmations(storage, TEAMS).status).toBe("invalid");
  });

  it("semantically invalid entry (unknown-team) -> invalid", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CONFIRMATIONS_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, confirmations: [validEntry({ fantaTeamId: "ghost-team" })] }),
    );
    expect(loadConfirmations(storage, TEAMS).status).toBe("invalid");
  });

  it("storage read failure -> storage-error, never a crash or a silently-empty batch", () => {
    const storage = new ReadThrowingStorage();
    const result = loadConfirmations(storage, TEAMS);
    expect(result.status).toBe("storage-error");
    expect(result.status === "storage-error" && result.message.length).toBeGreaterThan(0);
  });

  it("quarantine write failing during load does not crash the read path", () => {
    const inner = new MemoryStorage();
    inner.setItem(CONFIRMATIONS_STORAGE_KEY, "not json");
    const storage = new WriteThrowingStorage(inner);
    expect(() => loadConfirmations(storage, TEAMS)).not.toThrow();
    const result = loadConfirmations(storage, TEAMS);
    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.quarantineStored).toBe(false);
    expect(result.status === "invalid" && result.quarantinedRaw).toBe("not json");
  });

  it("is deterministic: loading the same untouched storage twice yields the same result", () => {
    const storage = new MemoryStorage();
    storage.setItem(CONFIRMATIONS_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, confirmations: [validEntry()] }));
    const first = loadConfirmations(storage, TEAMS);
    const second = loadConfirmations(storage, TEAMS);
    expect(second).toEqual(first);
  });
});

describe("saveConfirmations — the only write path", () => {
  it("persists a valid batch under the versioned envelope", () => {
    const storage = new MemoryStorage();
    const confirmations = [validEntry()];
    const result = saveConfirmations(storage, confirmations, TEAMS);
    expect(result).toEqual({ ok: true });
    expect(JSON.parse(storage.getItem(CONFIRMATIONS_STORAGE_KEY)!)).toEqual({
      schemaVersion: 1,
      confirmations,
    });
  });

  it("refuses a structurally invalid batch (invalid-schema) without writing", () => {
    const storage = new MemoryStorage();
    const bad = [{ fantaTeamId: "t1", playerId: "p1", role: "GK", price: 10 }] as unknown as ConfirmationInput[];
    const result = saveConfirmations(storage, bad, TEAMS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("invalid-schema");
    expect(storage.getItem(CONFIRMATIONS_STORAGE_KEY)).toBeNull();
  });

  it("refuses a semantically invalid batch (invalid-semantic) without writing, and existing canonical is untouched", () => {
    const storage = new MemoryStorage();
    const original = [validEntry()];
    saveConfirmations(storage, original, TEAMS);
    const before = storage.getItem(CONFIRMATIONS_STORAGE_KEY);

    const invalid = [validEntry({ playerId: "p1", role: "P" })];
    const result = saveConfirmations(storage, invalid, TEAMS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("invalid-semantic");
    expect(!result.ok && result.reason === "invalid-semantic" && result.issues).toEqual([
      { index: 0, fantaTeamId: "t1", playerId: "p1", violation: "role-not-confirmable" },
    ]);
    expect(storage.getItem(CONFIRMATIONS_STORAGE_KEY)).toBe(before);
  });

  it("reports a storage write failure without throwing", () => {
    const storage = new WriteThrowingStorage(new MemoryStorage());
    const result = saveConfirmations(storage, [validEntry()], TEAMS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("storage-write-error");
  });

  it("reports partial-write when the write-back verification does not match", () => {
    const storage = new MismatchOnReadBackStorage();
    const result = saveConfirmations(storage, [validEntry()], TEAMS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("partial-write");
  });

  it("never mutates the confirmations array passed in", () => {
    const storage = new MemoryStorage();
    const confirmations = Object.freeze([validEntry()]);
    expect(() => saveConfirmations(storage, confirmations, TEAMS)).not.toThrow();
    expect(confirmations).toEqual([validEntry()]);
  });

  it("is idempotent: saving the same valid batch twice yields the same stored state", () => {
    const storage = new MemoryStorage();
    const confirmations = [validEntry()];
    saveConfirmations(storage, confirmations, TEAMS);
    const afterFirst = storage.getItem(CONFIRMATIONS_STORAGE_KEY);
    saveConfirmations(storage, confirmations, TEAMS);
    expect(storage.getItem(CONFIRMATIONS_STORAGE_KEY)).toBe(afterFirst);
  });

  it("round-trips through loadConfirmations", () => {
    const storage = new MemoryStorage();
    const confirmations = [validEntry(), validEntry({ fantaTeamId: "t2", playerId: "p2", role: "A" })];
    saveConfirmations(storage, confirmations, TEAMS);
    expect(loadConfirmations(storage, TEAMS)).toEqual({ status: "valid", confirmations });
  });
});

// The 7 ConfirmationViolation codes (packages/engine/src/confirmations.ts) + fallback.
describe("confirmationErrorText — humanized riconferma violation messages", () => {
  it("maps every one of the 7 known codes to non-empty Italian text", () => {
    const codes = [
      "unknown-team",
      "role-not-confirmable",
      "role-limit-exceeded",
      "price-invalid",
      "duplicate-player",
      "team-budget-exceeded",
      "team-hard-reserve-broken",
    ] as const;
    expect(codes).toHaveLength(7);
    for (const code of codes) {
      const text = confirmationErrorText([code]);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toBe(code);
    }
  });

  it("joins multiple violations into one readable sentence", () => {
    const text = confirmationErrorText(["role-limit-exceeded", "team-budget-exceeded"]);
    expect(text).toContain("Troppe riconferme");
    expect(text).toContain("supera il budget");
  });

  it("falls back to the raw code for an unrecognised violation rather than throwing", () => {
    expect(confirmationErrorText(["some-future-code" as never])).toBe("some-future-code");
  });
});

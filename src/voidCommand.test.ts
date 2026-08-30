import { describe, expect, it } from "vitest";
import { FANTA_TEAM_IDS, syntheticLog } from "../packages/engine/fixtures/synthetic.js";
import { reduce } from "../packages/engine/src/reduce.js";
import { LAST_KNOWN_GOOD_STORAGE_KEY, LOG_STORAGE_KEY, type StorageLike } from "./logRecovery.js";
import { executeVoidCommand, voidErrorText } from "./voidCommand.js";

class FaultStorage implements StorageLike {
  readonly values = new Map<string, string>();
  lkgWrites = 0;
  constructor(private readonly mode: "ok" | "write-error" | "partial") {}
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.mode === "write-error" && key === LAST_KNOWN_GOOD_STORAGE_KEY) {
      throw new Error("synthetic storage error");
    }
    if (this.mode === "partial" && key === LAST_KNOWN_GOOD_STORAGE_KEY) {
      this.lkgWrites += 1;
      if (this.lkgWrites > 1) throw new Error("synthetic rollback error");
    }
    if (this.mode === "partial" && key === LOG_STORAGE_KEY) {
      throw new Error("synthetic canonical error");
    }
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

/**
 * A FaultStorage whose canonical key already holds `syntheticLog()` — the
 * realistic storage state for a void computed FROM that same log. Since audit
 * fix 1, executeVoidCommand passes its baseline to saveAuctionLog, so a storage
 * that does NOT hold that baseline is (correctly) refused as `divergent-log`;
 * these tests exercise the write/rollback paths, not divergence, so they must
 * start from a coherent canonical. LKG is left to each test: whether a previous
 * LKG exists is exactly what distinguishes a verified rollback
 * (storage-write-error) from an unverifiable one (partial-write).
 */
function storageHolding(mode: "ok" | "write-error" | "partial"): FaultStorage {
  const storage = new FaultStorage(mode);
  storage.values.set(LOG_STORAGE_KEY, JSON.stringify(syntheticLog()));
  return storage;
}

describe("LIVE-07 visible void command boundary", () => {
  it("returns persisted events only after a successful save", () => {
    const result = executeVoidCommand(storageHolding("ok"), syntheticLog(), 0, "2026-07-25T00:00:00.000Z", FANTA_TEAM_IDS);
    expect(result.ok).toBe(true);
    expect(result.ok && result.events.at(-1)?.type).toBe("VOID");
  });

  it("refuses a target seq absent from the log as not-feasible (target-not-found)", () => {
    const result = executeVoidCommand(new FaultStorage("ok"), syntheticLog(), 999, "2026-07-25T00:00:00.000Z", FANTA_TEAM_IDS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("not-feasible");
    expect(!result.ok && result.reason === "not-feasible" && result.violations).toEqual(["target-not-found"]);
  });

  it("refuses voiding a VOID event as not-feasible (target-not-purchase)", () => {
    // seq 4 in syntheticLog() is itself a VOID (compensating seq 3), not a
    // PURCHASE — never reachable via the UI (only PURCHASE rows carry an
    // "Annulla" affordance), but voidFeasibility() still guards it.
    const result = executeVoidCommand(new FaultStorage("ok"), syntheticLog(), 4, "2026-07-25T00:00:00.000Z", FANTA_TEAM_IDS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("not-feasible");
    expect(!result.ok && result.reason === "not-feasible" && result.violations).toEqual(["target-not-purchase"]);
  });

  it("refuses re-voiding an already-voided purchase as not-feasible (already-voided)", () => {
    // seq 3 in syntheticLog() is already compensated by the VOID at seq 4.
    const result = executeVoidCommand(new FaultStorage("ok"), syntheticLog(), 3, "2026-07-25T00:00:00.000Z", FANTA_TEAM_IDS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("not-feasible");
    expect(!result.ok && result.reason === "not-feasible" && result.violations).toEqual(["already-voided"]);
  });

  it("surfaces storage-write-error without returning advanced events", () => {
    const result = executeVoidCommand(storageHolding("write-error"), syntheticLog(), 0, "2026-07-25T00:00:00.000Z", FANTA_TEAM_IDS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("storage-write-error");
    expect("events" in result).toBe(false);
  });

  it("surfaces partial-write without returning advanced events", () => {
    const storage = storageHolding("partial");
    storage.values.set(LAST_KNOWN_GOOD_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, log: syntheticLog() }));
    const result = executeVoidCommand(storage, syntheticLog(), 0, "2026-07-25T00:00:00.000Z", FANTA_TEAM_IDS);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("partial-write");
    expect("events" in result).toBe(false);
  });
});

// Issue #265 item #4: the three VoidViolation codes must reach the operator
// as actionable Italian, not the raw thrown-error text that used to leak
// through (`infeasible void (target seq N): code, code`).
describe("voidErrorText — humanized void violation messages", () => {
  it("maps target-not-found to an Italian sentence that says what to do", () => {
    const text = voidErrorText(["target-not-found"]);
    expect(text).toContain("non trovato");
    expect(text.toLowerCase()).not.toContain("infeasible");
    expect(text.toLowerCase()).not.toContain("target seq");
  });

  // Il codice si chiama ancora `target-not-purchase`, ma da quando il log
  // porta anche svincoli e scambi il suo caso si e ristretto a UNO: il
  // bersaglio e un annullamento. La frase dice quello, non piu «non e un
  // acquisto» — che adesso sarebbe falsa per uno svincolo, che si annulla.
  it("maps target-not-purchase to an Italian sentence that says what to do", () => {
    const text = voidErrorText(["target-not-purchase"]);
    expect(text).toContain("già un annullamento");
  });

  it("maps target-superseded naming the more recent gesture to undo first", () => {
    const text = voidErrorText(["target-superseded"]);
    expect(text).toContain("svincolato o scambiato");
    expect(text).toContain("Annulla prima il gesto più recente");
  });

  it("maps already-voided to an Italian sentence that says what to do", () => {
    const text = voidErrorText(["already-voided"]);
    expect(text).toContain("già annullato");
  });

  it("joins multiple violations into one readable sentence", () => {
    const text = voidErrorText(["target-not-purchase", "already-voided"]);
    expect(text).toContain("già un annullamento");
    expect(text).toContain("già annullato");
  });

  // #274 copy fix (inherited by tranche 2b): the dialog auto-closes on a
  // successful action, so "Chiudi questa finestra e…" was stale advice —
  // never reintroduce it.
  it("never tells the operator to close the dialog — it auto-closes", () => {
    for (const violation of [
      "target-not-found",
      "target-not-purchase",
      "already-voided",
      "target-superseded",
    ] as const) {
      expect(voidErrorText([violation])).not.toMatch(/questa finestra/i);
    }
  });

  it("falls back to the raw code for an unrecognised violation rather than throwing", () => {
    // Defensive: the VoidViolation union is exhaustive today, but the map
    // must not crash if it ever drifts out of sync with the engine's type.
    expect(voidErrorText(["some-future-code" as never])).toBe("some-future-code");
  });

  it("executeVoidCommand's not-feasible violations are exactly what voidErrorText expects", () => {
    const result = executeVoidCommand(new FaultStorage("ok"), syntheticLog(), 3, "2026-07-25T00:00:00.000Z", FANTA_TEAM_IDS);
    const text = !result.ok && result.reason === "not-feasible" ? voidErrorText(result.violations) : null;
    expect(text).toBe(voidErrorText(["already-voided"]));
  });
});

// Tranche 2b (#231): confirmations threading. A riconferma is never a VOID
// target (it is not an AuctionEvent at all), so it never changes whether a
// void is FEASIBLE — only whether the resulting SAVE validates/rebaselines
// consistently against the same batch.
describe("executeVoidCommand — confirmations threading (tranche 2b)", () => {
  // A team with ZERO purchases in syntheticLog() (see fixtures/synthetic.ts),
  // so its budgetResidual after voiding purely reflects this one riconferma.
  const CONFIRM = { fantaTeamId: "dinamo_flavietto", playerId: "kd", role: "D" as const, price: 100 };

  it("passes confirmations through to the save so it validates/rebaselines against them", () => {
    const storage = storageHolding("ok");
    const result = executeVoidCommand(storage, syntheticLog(), 0, "2026-07-25T00:00:00.000Z", FANTA_TEAM_IDS, [CONFIRM]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = reduce(result.events, FANTA_TEAM_IDS, [CONFIRM]);
    expect(state.teams[CONFIRM.fantaTeamId]!.budgetResidual).toBe(500 - CONFIRM.price);
  });

  it("omitted confirmations reproduces prior behaviour exactly (default [])", () => {
    const withDefault = executeVoidCommand(storageHolding("ok"), syntheticLog(), 0, "2026-07-25T00:00:00.000Z", FANTA_TEAM_IDS);
    const withEmpty = executeVoidCommand(storageHolding("ok"), syntheticLog(), 0, "2026-07-25T00:00:00.000Z", FANTA_TEAM_IDS, []);
    expect(withDefault).toEqual(withEmpty);
  });
});

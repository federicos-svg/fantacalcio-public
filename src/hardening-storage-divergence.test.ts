// Pins for the multi-tab lost-update defect found by the adversarial audit
// (2026-08-14) and FIXED on this branch — Fix 1: saveAuctionLog()
// (src/logRecovery.ts) takes an optional 4th argument
// `expectedPreviousLog?: readonly AuctionEvent[]`; when supplied, a write
// whose baseline no longer matches the stored canonical is refused with
// `"divergent-log"` instead of silently overwriting the other tab's purchase.
// Baseline-passing callers: src/voidCommand.ts (executeVoidCommand) and
// main.ts's commitPurchase() — the shared commit path behind doAssign() and
// the third-portiere-at-0 declaration. Deliberate
// unconditional overwrites keep omitting it: importAuctionLog() and main.ts's
// confirmStartNewLog() reset-after-quarantine.
//
// The second describe below pins the REGRESSION that Fix 1 introduced on the
// LIVE-02 "recovered" path and that the Engineering review caught (see the
// PR body, "Fix post-review (regressione recovery)"): the recovery left the
// corrupted raw in place as the canonical while the app ran on the
// last-known-good events, so from Fix 1 on, every subsequent save compared
// its baseline against that corrupted raw and was refused with
// `divergent-log` forever — permanently, since a reload just re-entered the
// same recovery branch. loadAuctionLog() now re-persists the recovered
// events as the canonical, with the SAME serialization saveAuctionLog()
// uses, so the baseline match holds by construction.
import { describe, it, expect } from "vitest";
import {
  saveAuctionLog,
  loadAuctionLog,
  LOG_STORAGE_KEY,
  LAST_KNOWN_GOOD_STORAGE_KEY,
  QUARANTINE_STORAGE_KEY,
  type StorageLike,
} from "./logRecovery.js";
import { executeVoidCommand } from "./voidCommand.js";
import { reduce } from "../packages/engine/src/reduce.js";
import { recordPurchase } from "../packages/engine/src/feasibility.js";
import type { AuctionEvent, Role } from "../packages/engine/src/types.js";

const TEAMS = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];

function fakeStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe("hardening — saveAuctionLog rejects a diverged canonical (audit fix 1)", () => {
  it("tab B's save on a stale baseline is refused; tab A's purchase survives", () => {
    const storage = fakeStorage();
    const stA = reduce([], TEAMS);
    const logA = recordPurchase([], stA, { playerId: "rossi", role: "A", fantaTeamId: "t1", price: 30 }, "ts");
    // Tab A saves from baseline [] (its own honest starting point).
    expect(saveAuctionLog(storage, logA, TEAMS, []).ok).toBe(true);

    // Tab B booted earlier, ALSO believes its baseline is [] (stale — it
    // never saw tab A's write) and records a different purchase.
    const stB = reduce([], TEAMS);
    const logB = recordPurchase([], stB, { playerId: "bianchi", role: "D", fantaTeamId: "t2", price: 20 }, "ts");
    const saveB = saveAuctionLog(storage, logB, TEAMS, []); // expected [] no longer matches storage (has rossi)
    expect(saveB.ok).toBe(false);
    if (!saveB.ok) expect((saveB as { reason: string }).reason).toBe("divergent-log");

    const reloaded = loadAuctionLog(storage, TEAMS);
    expect(reloaded.status).toBe("valid");
    const events = (reloaded as { log: readonly AuctionEvent[] }).log;
    expect(events.some((e) => e.type === "PURCHASE" && e.playerId === "rossi")).toBe(true);
  });

  it("a normal, non-concurrent save sequence (baseline always matches) is unaffected", () => {
    const storage = fakeStorage();
    const st0 = reduce([], TEAMS);
    const log1 = recordPurchase([], st0, { playerId: "rossi", role: "A", fantaTeamId: "t1", price: 30 }, "ts");
    expect(saveAuctionLog(storage, log1, TEAMS, []).ok).toBe(true);

    const st1 = reduce(log1, TEAMS);
    const log2 = recordPurchase(log1, st1, { playerId: "bianchi", role: "D", fantaTeamId: "t2", price: 20 }, "ts");
    expect(saveAuctionLog(storage, log2, TEAMS, log1).ok).toBe(true);
  });

  it("callers that omit the 4th argument keep today's behaviour (no regression)", () => {
    const storage = fakeStorage();
    const st0 = reduce([], TEAMS);
    const log1 = recordPurchase([], st0, { playerId: "rossi", role: "A", fantaTeamId: "t1", price: 30 }, "ts");
    expect(saveAuctionLog(storage, log1, TEAMS).ok).toBe(true);
  });
});

// ── Post-review fix: recovery must re-persist the last-known-good ──────────

// Deliberately not valid JSON — the LIVE-02 scenario 1 payload.
const CORRUPTED_CANONICAL = "{ this is not a valid auction log at all !!";

function purchaseEvent(seq: number, playerId: string, role: Role, team: string, price: number): AuctionEvent {
  return { type: "PURCHASE", seq, ts: "2026-09-03T20:00:00Z", playerId, role, fantaTeamId: team, price };
}

/** Storage seeded exactly like the LIVE-02 "recovered" scenario: an unusable
 *  canonical plus a valid last-known-good envelope. */
function storageWithBadCanonicalAndGoodLkg(
  canonicalRaw: string,
  lkgLog: readonly AuctionEvent[],
  failingWriteKeys: readonly string[] = [],
): StorageLike {
  const m = new Map<string, string>();
  m.set(LOG_STORAGE_KEY, canonicalRaw);
  m.set(LAST_KNOWN_GOOD_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, log: lkgLog }));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => {
      if (failingWriteKeys.includes(k)) throw new Error(`synthetic quota on ${k}`);
      m.set(k, v);
    },
    removeItem: (k) => void m.delete(k),
  };
}

/** The exact bytes saveAuctionLog() writes for a given log — what the
 *  recovery re-persist must produce too, or the baseline check diverges. */
function canonicalTextFor(log: readonly AuctionEvent[]): string {
  return JSON.stringify(log);
}

describe("hardening — recovery re-persists the last-known-good as canonical (post-review fix)", () => {
  const lkgLog: readonly AuctionEvent[] = [purchaseEvent(0, "rossi", "A", "t1", 30)];

  it("after a recovery, a purchase and a void both persist (they were refused forever before)", () => {
    const storage = storageWithBadCanonicalAndGoodLkg(CORRUPTED_CANONICAL, lkgLog);

    const loaded = loadAuctionLog(storage, TEAMS);
    expect(loaded.status).toBe("recovered");
    const recovered = loaded.status === "recovered" ? loaded.log : [];
    expect(recovered).toEqual(lkgLog);

    // The app now runs on `recovered` and passes it as the baseline of the
    // next write — exactly what main.ts's commitPurchase() and
    // executeVoidCommand() do.
    const assigned = recordPurchase(
      recovered,
      reduce(recovered, TEAMS),
      { playerId: "bianchi", role: "D" as Role, fantaTeamId: "t2", price: 20 },
      "2026-09-03T20:05:00Z",
    );
    expect(saveAuctionLog(storage, assigned, TEAMS, recovered).ok).toBe(true);
    expect(storage.getItem(LOG_STORAGE_KEY)).toBe(canonicalTextFor(assigned));

    const targetSeq = assigned[assigned.length - 1]!.seq;
    const voided = executeVoidCommand(storage, assigned, targetSeq, "2026-09-03T20:06:00Z", TEAMS);
    expect(voided.ok).toBe(true);
    if (!voided.ok) return;
    expect(storage.getItem(LOG_STORAGE_KEY)).toBe(canonicalTextFor(voided.events));
  });

  it("a second load after the recovery finds a valid canonical, not another recovery (idempotence)", () => {
    const storage = storageWithBadCanonicalAndGoodLkg(CORRUPTED_CANONICAL, lkgLog);

    expect(loadAuctionLog(storage, TEAMS).status).toBe("recovered");

    const reloaded = loadAuctionLog(storage, TEAMS);
    expect(reloaded.status).toBe("valid");
    expect(reloaded.status === "valid" && reloaded.log).toEqual(lkgLog);
    expect(storage.getItem(LOG_STORAGE_KEY)).toBe(canonicalTextFor(lkgLog));
  });

  it("the corrupted payload stays in quarantine byte-for-byte, before and after later writes", () => {
    const storage = storageWithBadCanonicalAndGoodLkg(CORRUPTED_CANONICAL, lkgLog);

    const loaded = loadAuctionLog(storage, TEAMS);
    expect(loaded.status === "recovered" && loaded.quarantinedRaw).toBe(CORRUPTED_CANONICAL);
    expect(loaded.status === "recovered" && loaded.quarantineStored).toBe(true);
    expect(storage.getItem(QUARANTINE_STORAGE_KEY)).toBe(CORRUPTED_CANONICAL);

    const recovered = loaded.status === "recovered" ? loaded.log : [];
    const next = recordPurchase(
      recovered,
      reduce(recovered, TEAMS),
      { playerId: "bianchi", role: "D", fantaTeamId: "t2", price: 20 },
      "2026-09-03T20:05:00Z",
    );
    expect(saveAuctionLog(storage, next, TEAMS, recovered).ok).toBe(true);
    expect(storage.getItem(QUARANTINE_STORAGE_KEY)).toBe(CORRUPTED_CANONICAL);
  });

  it("multi-tab protection is still armed after a recovery (a stale baseline is still refused)", () => {
    const storage = storageWithBadCanonicalAndGoodLkg(CORRUPTED_CANONICAL, lkgLog);
    const loaded = loadAuctionLog(storage, TEAMS);
    const recovered = loaded.status === "recovered" ? loaded.log : [];

    // Tab A writes on top of the recovered log.
    const logA = recordPurchase(
      recovered,
      reduce(recovered, TEAMS),
      { playerId: "bianchi", role: "D", fantaTeamId: "t2", price: 20 },
      "2026-09-03T20:05:00Z",
    );
    expect(saveAuctionLog(storage, logA, TEAMS, recovered).ok).toBe(true);

    // Tab B still holds the recovered log as its baseline — now stale.
    const logB = recordPurchase(
      recovered,
      reduce(recovered, TEAMS),
      { playerId: "verdi", role: "C", fantaTeamId: "t3", price: 15 },
      "2026-09-03T20:05:30Z",
    );
    const saveB = saveAuctionLog(storage, logB, TEAMS, recovered);
    expect(saveB.ok).toBe(false);
    if (!saveB.ok) expect((saveB as { reason: string }).reason).toBe("divergent-log");
    expect(storage.getItem(LOG_STORAGE_KEY)).toBe(canonicalTextFor(logA));
  });

  it("an invariant-violating canonical (audit fix 2) recovers and stays writable too", () => {
    // Schema-valid, parses fine, but 600 credits spent out of 500 — accepted
    // before Fix 2, now rejected by validateAuctionLog, so this canonical
    // reaches the very same recovery branch.
    const invariantViolating = JSON.stringify([
      purchaseEvent(0, "x1", "A", "t1", 300),
      purchaseEvent(1, "x2", "A", "t1", 300),
    ]);
    const storage = storageWithBadCanonicalAndGoodLkg(invariantViolating, lkgLog);

    const loaded = loadAuctionLog(storage, TEAMS);
    expect(loaded.status).toBe("recovered");
    expect(loaded.status === "recovered" && loaded.quarantinedRaw).toBe(invariantViolating);
    const recovered = loaded.status === "recovered" ? loaded.log : [];

    const next = recordPurchase(
      recovered,
      reduce(recovered, TEAMS),
      { playerId: "bianchi", role: "D", fantaTeamId: "t2", price: 20 },
      "2026-09-03T20:05:00Z",
    );
    expect(saveAuctionLog(storage, next, TEAMS, recovered).ok).toBe(true);
    expect(loadAuctionLog(storage, TEAMS).status).toBe("valid");
  });

  it("an unwritable canonical degrades to a blocking storage-error that still carries the quarantined raw", () => {
    const storage = storageWithBadCanonicalAndGoodLkg(CORRUPTED_CANONICAL, lkgLog, [LOG_STORAGE_KEY]);

    const loaded = loadAuctionLog(storage, TEAMS);
    // Fail-closed: no working-looking screen whose every save would be
    // refused. The operator gets the retryable blocking state instead.
    expect(loaded.status).toBe("storage-error");
    expect(loaded.status === "storage-error" && loaded.quarantinedRaw).toBe(CORRUPTED_CANONICAL);
    expect(loaded.status === "storage-error" && loaded.quarantineStored).toBe(true);
    expect(loaded.status === "storage-error" && loaded.message.length).toBeGreaterThan(0);
    // The corrupted canonical is untouched — nothing was half-written.
    expect(storage.getItem(LOG_STORAGE_KEY)).toBe(CORRUPTED_CANONICAL);
  });
});

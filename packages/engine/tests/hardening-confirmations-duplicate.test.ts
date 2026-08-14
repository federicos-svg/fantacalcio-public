// Pin for a CONFIRMED audit defect (adversarial audit, 2026-08-14) — NOT yet
// fixed as of this commit (WIP handoff, branch worker/engine-hardening-audit).
// reduce() (packages/engine/src/reduce.ts) seeds confirmations into each
// team's roster, then replays the live log WITHOUT checking whether a live,
// non-voided PURCHASE targets a playerId already present in the
// confirmations batch. Result: the same player ends up "purchased" for two
// different teams simultaneously — silent double counting of budget/slots.
// Reproduced from the tranche2a (#231/#279) audit probe ("ATTACK: log
// containing a live PURCHASE of an already-confirmed player").
//
// Fix 3 (planned, packages/engine/src/reduce.ts): throw fail-closed (same
// style as the existing `invalid confirmations: ...` throw already in this
// function) when a non-voided PURCHASE event's playerId is already
// confirmed in the batch.
//
// EXPECTED STATE OF THIS FILE UNTIL FIX 3 LANDS: first test RED, second
// GREEN (documents zero regression for the pre-existing 2-argument
// reduce(events, fantaTeamIds) call sites — src/main.ts, src/logRecovery.ts,
// src/assignCommand.ts and their tests never pass a confirmations batch).
import { describe, it, expect } from "vitest";
import { reduce } from "../src/reduce.js";
import { recordPurchase } from "../src/feasibility.js";
import type { ConfirmationInput } from "../src/confirmations.js";

const TEAMS = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"];

describe("hardening — reduce() rejects confirmations x live-log double counting (audit fix 3)", () => {
  it("throws when a live PURCHASE targets an already-confirmed playerId", () => {
    const confs: ConfirmationInput[] = [{ fantaTeamId: "t1", playerId: "kd", role: "D", price: 100 }];
    // Craft a log that is perfectly valid WITHOUT confirmations in view: t2
    // buys "kd" — nothing here can see the (separately supplied) riconferma.
    const st0 = reduce([], TEAMS);
    const log = recordPurchase([], st0, { playerId: "kd", role: "D", fantaTeamId: "t2", price: 10 }, "ts");
    expect(() => reduce(log, TEAMS, confs)).toThrow();
  });

  it("empty/omitted confirmations batch: 2-argument call sites are unaffected", () => {
    const st0 = reduce([], TEAMS);
    const log = recordPurchase([], st0, { playerId: "kd", role: "D", fantaTeamId: "t2", price: 10 }, "ts");
    expect(() => reduce(log, TEAMS)).not.toThrow();
    expect(reduce(log, TEAMS).purchasedPlayerIds).toEqual(["kd"]);
    expect(() => reduce(log, TEAMS, [])).not.toThrow();
  });
});

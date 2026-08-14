import { describe, it, expect } from "vitest";
import { COST_FLOOR, competitorSet, maxSafe, type AuctionEvent } from "../src/index.js";
import { TEAMS, TS, buildLog, buy, fillRole, stateOf } from "./layer2Fixtures.js";

const EMPTY = stateOf([]);

describe("competitorSet — insieme eleggibile deterministico", () => {
  it("a tavolo fresco tutti possono competere al floor, col max bid vero", () => {
    const set = competitorSet(EMPTY, "A", 1);
    expect(set.eligibleCount).toBe(8);
    expect(set.excluded).toEqual([]);
    expect(set.threshold).toBe(1);
    expect(set.basis).toBe("hard-constraints");
    // 500 − 27 slot obbligatori residui (quello che si compra ne riempie uno).
    expect(set.eligible.every((c) => c.maxBid === 473)).toBe(true);
  });

  it("il max bid vero è ESATTAMENTE maxSafe(), non una seconda formula", () => {
    const state = stateOf(buildLog([buy("a1", "A", "psg", 100)]));
    const psg = competitorSet(state, "A", 1).eligible.find((c) => c.fantaTeamId === "psg");
    expect(psg?.maxBid).toBe(maxSafe(state.teams.psg!, "A").maxSafe);
    expect(psg?.maxBid).toBe(374); // 400 − 26
  });

  it("esclude la propria squadra quando `selfId` è passato", () => {
    const set = competitorSet(EMPTY, "A", 1, "psg");
    expect(set.eligibleCount).toBe(7);
    expect([...set.eligible, ...set.excluded].map((c) => c.fantaTeamId)).not.toContain("psg");
  });

  it("soglia inclusiva: al max bid vero si compete ancora, un credito sopra no", () => {
    expect(competitorSet(EMPTY, "A", 473).eligibleCount).toBe(8);
    const over = competitorSet(EMPTY, "A", 474);
    expect(over.eligibleCount).toBe(0);
    expect(over.excluded).toHaveLength(8);
    expect(over.excluded.every((c) => c.blockers.includes("below-threshold"))).toBe(true);
    // Chi è escluso per sola soglia resta comunque un offerente reale: il suo
    // max bid vero è mostrato, non azzerato.
    expect(over.excluded.every((c) => c.maxBid === 473)).toBe(true);
  });

  it("ruolo pieno: bloccato a monte, max bid 0 su quel ruolo", () => {
    const state = stateOf(buildLog(fillRole("psg", "A", 7, 1)));
    const set = competitorSet(state, "A", 1);
    const psg = set.excluded.find((c) => c.fantaTeamId === "psg");
    expect(psg?.blockers).toEqual(["role-full"]);
    expect(psg?.slotsRemainingInRole).toBe(0);
    expect(psg?.maxBid).toBe(0);
    expect(set.eligibleCount).toBe(7);
  });

  it("budget bloccato dalla riserva dura: nessuna offerta valida possibile", () => {
    // Stato raggiungibile solo da un log grezzo/importato: il percorso
    // hard-safe (`purchaseFeasibility`) non lo consentirebbe mai. Serve
    // proprio a provare che l'insieme eleggibile regge anche lì.
    const log: AuctionEvent[] = [
      { type: "PURCHASE", seq: 0, ts: TS, playerId: "a1", role: "A", fantaTeamId: "psg", price: 500 },
    ];
    const state = stateOf(log);
    expect(state.teams.psg?.budgetResidual).toBe(0);
    const psg = competitorSet(state, "D", 1).excluded.find((c) => c.fantaTeamId === "psg");
    expect(psg?.blockers).toEqual(["budget-locked"]);
    expect(psg?.maxBid).toBe(0);
    expect(psg?.slotsRemainingInRole).toBe(9);
  });

  it("un solo blocco per squadra, il più a monte: ruolo pieno prima di tutto", () => {
    const state = stateOf(buildLog([...fillRole("psg", "A", 7, 60)]));
    const psg = competitorSet(state, "A", 999).excluded.find((c) => c.fantaTeamId === "psg");
    expect(psg?.blockers).toEqual(["role-full"]);
  });

  it("soglia frazionaria arrotondata per eccesso, e mai sotto il floor", () => {
    expect(competitorSet(EMPTY, "A", 32.4).threshold).toBe(33);
    expect(competitorSet(EMPTY, "A", 0).threshold).toBe(COST_FLOOR);
    expect(competitorSet(EMPTY, "A", -10).threshold).toBe(COST_FLOOR);
  });

  it("soglia non finita: fail-closed, nessun insieme derivato da un numero rotto", () => {
    expect(() => competitorSet(EMPTY, "A", Number.NaN)).toThrow(/threshold must be finite/);
    expect(() => competitorSet(EMPTY, "A", Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });

  it("ordinamento totale e stabile: max bid decrescente, poi id", () => {
    const state = stateOf(
      buildLog([buy("a1", "A", "psg", 100), buy("a2", "A", "ataturk", 50)]),
    );
    const set = competitorSet(state, "A", 1);
    expect(set.eligible.map((c) => c.fantaTeamId).slice(-2)).toEqual(["ataturk", "psg"]);
    expect(set.eligible.map((c) => c.maxBid).slice(-2)).toEqual([424, 374]);
    const head = set.eligible.slice(0, 6).map((c) => c.fantaTeamId);
    expect(head).toEqual([...head].sort());
    expect(JSON.stringify(set)).toBe(JSON.stringify(competitorSet(state, "A", 1)));
  });

  it("eleggibili + esclusi = tutto il tavolo, sempre", () => {
    const state = stateOf(buildLog(fillRole("psg", "A", 7, 1)));
    for (const threshold of [1, 100, 473, 474]) {
      const set = competitorSet(state, "A", threshold);
      expect(set.eligible.length + set.excluded.length).toBe(TEAMS.length);
    }
  });

  it("nessun campo comportamentale o di interesse: solo vincoli duri", () => {
    const assessment = competitorSet(EMPTY, "A", 1).eligible[0]!;
    expect(Object.keys(assessment).sort()).toEqual([
      "blockers",
      "budgetResidual",
      "eligible",
      "fantaTeamId",
      "maxBid",
      "slotsRemainingInRole",
    ]);
  });
});

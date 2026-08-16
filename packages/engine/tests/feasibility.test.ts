import { describe, it, expect } from "vitest";
import {
  reduce,
  appendEvent,
  maxSafe,
  purchaseFeasibility,
  recordPurchase,
  voidFeasibility,
  recordVoid,
  INITIAL_BUDGET,
  type AuctionEvent,
  type ProposedPurchase,
} from "../src/index.js";
import { FANTA_TEAM_IDS, syntheticLog } from "../fixtures/synthetic.js";

const TEAMS = FANTA_TEAM_IDS;
const TS = "2026-08-01T11:00:00Z";

describe("purchaseFeasibility — hard-safe admission", () => {
  it("accepts a normal purchase on an empty roster", () => {
    const s = reduce([], TEAMS);
    const r = purchaseFeasibility(s, { playerId: "A9", role: "A", fantaTeamId: "psg", price: 50 });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("rejects an unknown team (only violation reported)", () => {
    const s = reduce([], TEAMS);
    const r = purchaseFeasibility(s, { playerId: "A9", role: "A", fantaTeamId: "ghost", price: 10 });
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(["unknown-team"]);
  });

  it("rejects a price below the floor", () => {
    const s = reduce([], TEAMS);
    const r = purchaseFeasibility(s, { playerId: "A9", role: "A", fantaTeamId: "psg", price: 0 });
    expect(r.violations).toContain("price-below-floor");
  });

  it("rejects buying into a full role", () => {
    // fill psg's 7 A slots
    const log: AuctionEvent[] = [];
    let seq = 0;
    for (let i = 1; i <= 7; i++) {
      log.push({ type: "PURCHASE", seq: seq++, ts: TS, playerId: `A${i}`, role: "A", fantaTeamId: "psg", price: 1 });
    }
    const s = reduce(log, TEAMS);
    const r = purchaseFeasibility(s, { playerId: "A8", role: "A", fantaTeamId: "psg", price: 1 });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("role-full");
  });

  it("rejects a duplicate player already won by anyone", () => {
    const s = reduce(syntheticLog(), TEAMS); // A1 already bought by new_milf
    const r = purchaseFeasibility(s, { playerId: "A1", role: "A", fantaTeamId: "psg", price: 5 });
    expect(r.violations).toContain("duplicate-player");
  });

  it("rejects a price above the team's residual budget", () => {
    const s = reduce([], TEAMS);
    const r = purchaseFeasibility(s, { playerId: "A9", role: "A", fantaTeamId: "psg", price: INITIAL_BUDGET + 1 });
    expect(r.violations).toContain("insufficient-budget");
  });

  it("rejects a purchase that would break the hard reserve", () => {
    // empty roster: 28 slots, buying one leaves 27 to reserve at floor.
    // max feasible price = 500 - 27 = 473. 474 must break the reserve.
    const s = reduce([], TEAMS);
    const ok = purchaseFeasibility(s, { playerId: "A9", role: "A", fantaTeamId: "psg", price: 473 });
    const bad = purchaseFeasibility(s, { playerId: "A9", role: "A", fantaTeamId: "psg", price: 474 });
    expect(ok.ok).toBe(true);
    expect(bad.ok).toBe(false);
    expect(bad.violations).toContain("breaks-hard-reserve");
  });

  it("reports multiple violations at once", () => {
    const s = reduce(syntheticLog(), TEAMS); // A1 already owned
    const r = purchaseFeasibility(s, { playerId: "A1", role: "A", fantaTeamId: "new_milf", price: 0 });
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(expect.arrayContaining(["price-below-floor", "duplicate-player"]));
  });
});

describe("purchaseFeasibility — third portiere at 0 (LEAGUE_RULES.md §6, declared-only)", () => {
  // "psg" with its first two P slots already filled -> the next P purchase
  // for psg IS the team's third (last) portiere slot.
  const twoGoalkeepersLog: AuctionEvent[] = [
    { type: "PURCHASE", seq: 0, ts: TS, playerId: "P1", role: "P", fantaTeamId: "psg", price: 10 },
    { type: "PURCHASE", seq: 1, ts: TS, playerId: "P2", role: "P", fantaTeamId: "psg", price: 5 },
  ];
  // "psg" with only ONE P slot filled -> the next P purchase is the SECOND,
  // not the third — the structural condition must not fire here.
  const oneGoalkeeperLog: AuctionEvent[] = [
    { type: "PURCHASE", seq: 0, ts: TS, playerId: "P1", role: "P", fantaTeamId: "psg", price: 10 },
  ];

  it("THE critical negative: price 0 on the actual third-portiere slot is still rejected without the declaration", () => {
    const s = reduce(twoGoalkeepersLog, TEAMS);
    expect(s.teams.psg!.slotsRemaining.P).toBe(1); // confirms this IS the 3rd slot
    const r = purchaseFeasibility(s, { playerId: "P3", role: "P", fantaTeamId: "psg", price: 0 });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("price-below-floor");
  });

  it("accepts price 0 on the third portiere slot ONLY when explicitly declared", () => {
    const s = reduce(twoGoalkeepersLog, TEAMS);
    const r = purchaseFeasibility(s, {
      playerId: "P3",
      role: "P",
      fantaTeamId: "psg",
      price: 0,
      declareThirdGoalkeeperZero: true,
    });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("declaring is inert (not yet the third slot): price 0 on the SECOND portiere is still rejected even when declared", () => {
    const s = reduce(oneGoalkeeperLog, TEAMS);
    expect(s.teams.psg!.slotsRemaining.P).toBe(2); // this purchase would be the 2nd, not the 3rd
    const r = purchaseFeasibility(s, {
      playerId: "P2",
      role: "P",
      fantaTeamId: "psg",
      price: 0,
      declareThirdGoalkeeperZero: true,
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("price-below-floor");
  });

  it("declaring is inert (wrong role): price 0 on a non-portiere role is still rejected even when declared", () => {
    const s = reduce(twoGoalkeepersLog, TEAMS); // psg's P slots are irrelevant here — role is D
    const r = purchaseFeasibility(s, {
      playerId: "D9",
      role: "D",
      fantaTeamId: "psg",
      price: 0,
      declareThirdGoalkeeperZero: true,
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("price-below-floor");
  });

  it("the exception is exactly price 0 — a declared third portiere at a negative price is still rejected", () => {
    const s = reduce(twoGoalkeepersLog, TEAMS);
    const r = purchaseFeasibility(s, {
      playerId: "P3",
      role: "P",
      fantaTeamId: "psg",
      price: -1,
      declareThirdGoalkeeperZero: true,
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("price-below-floor");
  });

  it("every OTHER team's every OTHER floor case is unaffected: floor stays 1 everywhere else", () => {
    const s = reduce([], TEAMS);
    for (const role of ["P", "D", "C", "A"] as const) {
      const r = purchaseFeasibility(s, { playerId: `x-${role}`, role, fantaTeamId: "psg", price: 0 });
      expect(r.violations).toContain("price-below-floor");
    }
  });
});

describe("recordPurchase — third portiere at 0 is logged as an explicit declaration", () => {
  const twoGoalkeepersLog: AuctionEvent[] = [
    { type: "PURCHASE", seq: 0, ts: TS, playerId: "P1", role: "P", fantaTeamId: "psg", price: 10 },
    { type: "PURCHASE", seq: 1, ts: TS, playerId: "P2", role: "P", fantaTeamId: "psg", price: 5 },
  ];

  it("writes thirdGoalkeeperZeroDeclared: true on the appended event, so the log explains the 0 on replay", () => {
    const s = reduce(twoGoalkeepersLog, TEAMS);
    const next = recordPurchase(
      twoGoalkeepersLog,
      s,
      { playerId: "P3", role: "P", fantaTeamId: "psg", price: 0, declareThirdGoalkeeperZero: true },
      TS,
    );
    const ev = next[next.length - 1]!;
    expect(ev).toMatchObject({ type: "PURCHASE", price: 0, thirdGoalkeeperZeroDeclared: true });

    // The declaration is not just decorative: replay must reflect price 0.
    const after = reduce(next, TEAMS).teams.psg!;
    expect(after.spent).toBe(15); // 10 + 5 + 0
    expect(after.filled.P).toBe(3);
    expect(after.slotsRemaining.P).toBe(0);
  });

  it("never writes the field on an ordinary purchase, even one made by the same team/role", () => {
    const log = syntheticLog();
    const s = reduce(log, TEAMS);
    const next = recordPurchase(log, s, { playerId: "P9", role: "P", fantaTeamId: "psg", price: 3 }, TS);
    const ev = next[next.length - 1]!;
    expect("thirdGoalkeeperZeroDeclared" in ev).toBe(false);
  });

  it("throws — and appends nothing — for price 0 on the third portiere without the declaration", () => {
    const s = reduce(twoGoalkeepersLog, TEAMS);
    expect(() =>
      recordPurchase(twoGoalkeepersLog, s, { playerId: "P3", role: "P", fantaTeamId: "psg", price: 0 }, TS),
    ).toThrow(/infeasible purchase/);
  });
});

describe("IL CONFINE budgetResidual === otherSlots — max_safe non offribile, terzo portiere a 0 ancora sì", () => {
  /**
   * LO STATO LIMITE, RAGGIUNTO SOLO CON GESTI AMMESSI.
   *
   * `budgetResidual === otherSlots` (cioè budget residuo = totalSlotsRemaining
   * − 1) è lo stato in cui `maxSafe()` vale 0 e non è offribile — la schermata
   * live scrive «n/d» — mentre `purchaseFeasibility()` ammette ancora il terzo
   * portiere a 0, perché quell'acquisto non consuma nulla e lascia la rosa
   * completabile. Prima della correzione la schermata dichiarava
   * indisponibilità e il bottone registrava lo stesso: testo e comportamento
   * in contraddizione su un caso reale.
   *
   * PERCHÉ È REALE, e non uno stato costruito a mano. Ogni acquisto ammesso
   * conserva `budgetResidual >= totalSlotsRemaining` (è esattamente ciò che
   * `breaks-hard-reserve` impone), e le riconferme partono dallo stesso vincolo
   * (`team-hard-reserve-broken`, confirmations.ts): nessuna sequenza di soli
   * acquisti può quindi scendere a `budgetResidual < totalSlotsRemaining`.
   * L'unico ingresso è l'annullamento di un acquisto A COSTO ZERO, che
   * restituisce uno slot senza restituire crediti. Questo log lo percorre
   * passo per passo, e lo percorre SOLO tramite recordPurchase()/recordVoid(),
   * che lanciano su ogni passo non ammesso: se un giorno uno di questi gesti
   * smettesse di essere ammesso, questo test morirebbe con un throw invece di
   * verificare un confine immaginario.
   */
  function boundaryLog(): readonly AuctionEvent[] {
    let log: readonly AuctionEvent[] = [];
    const step = (proposed: ProposedPurchase): void => {
      log = recordPurchase(log, reduce(log, TEAMS), proposed, TS);
    };
    step({ playerId: "P1", role: "P", fantaTeamId: "psg", price: 10 }); // seq 0
    step({ playerId: "P2", role: "P", fantaTeamId: "psg", price: 5 }); // seq 1
    // seq 2 — il terzo portiere dichiarato a 0: nessun credito speso, uno slot
    // occupato. È l'acquisto che, annullato in fondo, produrrà il confine.
    step({ playerId: "P3", role: "P", fantaTeamId: "psg", price: 0, declareThirdGoalkeeperZero: true });
    // seq 3 — esattamente max_safe (485 − 24): porta la squadra al limite
    // "budget bloccato", budgetResidual === totalSlotsRemaining.
    step({ playerId: "C1", role: "C", fantaTeamId: "psg", price: 461 });
    return recordVoid(log, 2, TS); // seq 4 — annulla lo 0: slot restituito, crediti no
  }

  it("è uno stato raggiungibile: solo l'annullamento di un acquisto a 0 porta budgetResidual sotto gli slot", () => {
    const team = reduce(boundaryLog(), TEAMS).teams.psg!;
    expect(team.budgetResidual).toBe(24);
    expect(team.totalSlotsRemaining).toBe(25);
    // IL confine: il budget residuo copre esattamente gli ALTRI slot, non
    // questo. `otherSlots` è la stessa quantità che purchaseFeasibility usa.
    expect(team.budgetResidual).toBe(team.totalSlotsRemaining - 1);
    // Lo slot del terzo portiere è tornato libero con l'annullamento.
    expect(team.slotsRemaining.P).toBe(1);
  });

  it("la schermata dice il vero su «n/d»: max_safe non è offribile e nemmeno il minimo di 1 cr passa", () => {
    const s = reduce(boundaryLog(), TEAMS);
    const ms = maxSafe(s.teams.psg!, "P");
    // Questo è ciò che la nota live rende come «n/d».
    expect(ms.biddable).toBe(false);
    expect(ms.maxSafe).toBe(0);
    expect(ms.reason).toBe("budget-locked");
    // E «n/d» è onesto per QUALUNQUE prezzo digitabile: il minimo di 1 cr
    // romperebbe la hard reserve. Nessun acquisto ordinario è più possibile.
    const atFloor = purchaseFeasibility(s, { playerId: "P4", role: "P", fantaTeamId: "psg", price: 1 });
    expect(atFloor.ok).toBe(false);
    expect(atFloor.violations).toContain("breaks-hard-reserve");
  });

  it("il comportamento concorda: il terzo portiere dichiarato a 0 è ancora ammesso, e registrato come dichiarazione", () => {
    const log = boundaryLog();
    const s = reduce(log, TEAMS);
    const declared: ProposedPurchase = {
      playerId: "P4",
      role: "P",
      fantaTeamId: "psg",
      price: 0,
      declareThirdGoalkeeperZero: true,
    };
    const r = purchaseFeasibility(s, declared);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);

    // Ammesso davvero, non solo "senza violazioni": l'evento viene appeso con
    // la dichiarazione, ed è ciò che la schermata promette quando scrive
    // «resta solo il terzo portiere a 0 cr».
    const next = recordPurchase(log, s, declared, TS);
    expect(next[next.length - 1]!).toMatchObject({
      type: "PURCHASE",
      price: 0,
      thirdGoalkeeperZeroDeclared: true,
    });
    const after = reduce(next, TEAMS).teams.psg!;
    expect(after.budgetResidual).toBe(24); // lo 0 non toglie crediti
    expect(after.slotsRemaining.P).toBe(0);
    expect(after.totalSlotsRemaining).toBe(24); // e la rosa resta completabile: 24 cr per 24 slot
  });

  it("nemmeno al confine la dichiarazione è deducibile: lo stesso 0 senza dichiarare resta rifiutato", () => {
    const s = reduce(boundaryLog(), TEAMS);
    const r = purchaseFeasibility(s, { playerId: "P4", role: "P", fantaTeamId: "psg", price: 0 });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("price-below-floor");
  });
});

describe("recordPurchase — manual-input contract", () => {
  it("appends a correctly-sequenced event for a feasible purchase", () => {
    const log = syntheticLog();
    const s = reduce(log, TEAMS);
    const proposed: ProposedPurchase = { playerId: "C9", role: "C", fantaTeamId: "ac_vostra", price: 30 };
    const next = recordPurchase(log, s, proposed, TS);

    expect(next.length).toBe(log.length + 1);
    const ev = next[next.length - 1]!;
    expect(ev.type).toBe("PURCHASE");
    expect(ev.seq).toBe(log[log.length - 1]!.seq + 1); // strictly increasing
    expect(next).not.toBe(log); // new array, input untouched
  });

  it("starts seq at 0 on an empty log", () => {
    const s = reduce([], TEAMS);
    const next = recordPurchase([], s, { playerId: "P9", role: "P", fantaTeamId: "psg", price: 3 }, TS);
    expect(next[0]!.seq).toBe(0);
  });

  it("throws on an infeasible purchase and does not append", () => {
    const log = syntheticLog();
    const s = reduce(log, TEAMS);
    expect(() =>
      recordPurchase(log, s, { playerId: "A1", role: "A", fantaTeamId: "psg", price: 5 }, TS),
    ).toThrow(/infeasible purchase/);
    expect(log.length).toBe(7); // original untouched
  });

  it("recorded purchase reduces to a coherent, still-completable state", () => {
    const log = syntheticLog();
    const s0 = reduce(log, TEAMS);
    const next = recordPurchase(log, s0, { playerId: "C9", role: "C", fantaTeamId: "ac_vostra", price: 30 }, TS);
    const t = reduce(next, TEAMS).teams["ac_vostra"]!;
    expect(t.spent).toBe(30);
    expect(t.budgetResidual).toBeGreaterThanOrEqual(t.totalSlotsRemaining * 1);
  });
});

describe("hard-safe boundary — appendEvent is NOT the guard, recordPurchase is", () => {
  // Locks the contract: the low-level append primitive admits a schema-valid but
  // infeasible purchase (by design); only recordPurchase enforces feasibility.
  const infeasible: ProposedPurchase = { playerId: "A1", role: "A", fantaTeamId: "psg", price: INITIAL_BUDGET + 1 };

  it("appendEvent appends an infeasible (over-budget + duplicate) purchase without throwing", () => {
    const log = syntheticLog(); // A1 already owned by new_milf
    const next = appendEvent(log, {
      type: "PURCHASE", seq: log[log.length - 1]!.seq + 1, ts: TS,
      playerId: infeasible.playerId, role: infeasible.role,
      fantaTeamId: infeasible.fantaTeamId, price: infeasible.price,
    });
    expect(next.length).toBe(log.length + 1); // appended — primitive does not guard
  });

  it("recordPurchase rejects exactly that purchase", () => {
    const log = syntheticLog();
    const s = reduce(log, TEAMS);
    expect(purchaseFeasibility(s, infeasible).ok).toBe(false);
    expect(() => recordPurchase(log, s, infeasible, TS)).toThrow(/infeasible purchase/);
  });
});

describe("voidFeasibility & recordVoid — manual correction contract", () => {
  // syntheticLog seqs: 0 A1 new_milf(102), 1 C1 fc_sottitudo(81), 2 D1 new_milf(22),
  // 3 D2 ataturk(999), 4 VOID->3, 5 D2 ataturk(7), 6 P1 psg(1)

  it("accepts voiding an existing, not-yet-voided PURCHASE", () => {
    const r = voidFeasibility(syntheticLog(), 6); // P1 psg
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("rejects voiding a non-existent seq", () => {
    const r = voidFeasibility(syntheticLog(), 99);
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(["target-not-found"]);
  });

  it("rejects double-void of an already-voided purchase", () => {
    const r = voidFeasibility(syntheticLog(), 3); // already voided by seq 4
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("already-voided");
  });

  it("rejects voiding a VOID event (not a purchase)", () => {
    const r = voidFeasibility(syntheticLog(), 4); // seq 4 is itself a VOID
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("target-not-purchase");
  });

  it("recordVoid appends a correctly-sequenced VOID without mutating input", () => {
    const log = syntheticLog();
    const next = recordVoid(log, 6, TS);
    expect(next.length).toBe(log.length + 1);
    expect(log.length).toBe(7); // original untouched
    expect(next).not.toBe(log);
    const ev = next[next.length - 1]!;
    expect(ev.type).toBe("VOID");
    expect(ev.seq).toBe(log[log.length - 1]!.seq + 1); // strictly increasing
  });

  it("recordVoid throws on an infeasible target and does not append", () => {
    const log = syntheticLog();
    expect(() => recordVoid(log, 99, TS)).toThrow(/infeasible void/);
    expect(log.length).toBe(7);
  });

  it("replay after recordVoid restores budget and frees the slot", () => {
    const log = syntheticLog();
    const before = reduce(log, TEAMS).teams["new_milf"]!;
    // new_milf has A1(102, seq0) + D1(22, seq2): spent 124, A filled 1
    expect(before.spent).toBe(124);
    expect(before.filled.A).toBe(1);

    const next = recordVoid(log, 0, TS); // void A1
    const after = reduce(next, TEAMS).teams["new_milf"]!;
    expect(after.spent).toBe(22); // only D1 remains
    expect(after.budgetResidual).toBe(INITIAL_BUDGET - 22);
    expect(after.filled.A).toBe(0); // slot freed
    expect(after.slotsRemaining.A).toBe(7);
  });
});

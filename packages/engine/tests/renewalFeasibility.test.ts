// IL RINNOVO SOTTO UN LOG GIA AVVIATO — packages/engine/src/feasibility.ts.
//
// PERCHE QUESTO FILE ESISTE. Fino al 2026-08-30 la schermata si proteggeva con
// «il log non e vuoto, quindi niente rinnovi». Il difetto lo ha trovato Pico
// usando l'app: l'inserimento manuale scrive un PURCHASE, quindi il primo uso
// della scheda accanto chiudeva i rinnovi per sempre — e il messaggio di
// blocco indirizzava proprio verso quel gesto. Il blocco e stato tolto, e al
// suo posto c'e un rifiuto caso per caso che deve essere ALMENO altrettanto
// sicuro: qui si misura che lo sia, una violazione alla volta.

import { describe, it, expect } from "vitest";
import {
  renewalFeasibility,
  recordPurchase,
  recordRelease,
  recordVoid,
} from "../src/feasibility.js";
import { reduce } from "../src/reduce.js";
import { INITIAL_BUDGET, type AuctionEvent } from "../src/types.js";
import type { ConfirmationInput } from "../src/confirmations.js";

const TEAMS = ["Io", "Due", "Tre", "Quattro", "Cinque", "Sei", "Sette", "Otto"] as const;
const IDS = [...TEAMS];

/** Un rinnovo qualunque, valido da solo: serve come base da rompere. */
const RENEWAL: ConfirmationInput = {
  fantaTeamId: "Io",
  playerId: "Difensore Alfa|ClubUno",
  role: "D",
  price: 14,
};

function purchase(
  log: readonly AuctionEvent[],
  fantaTeamId: string,
  playerId: string,
  role: "P" | "D" | "C" | "A",
  price: number,
): readonly AuctionEvent[] {
  return recordPurchase(
    log,
    reduce(log, IDS),
    { fantaTeamId, playerId, role, price },
    "2026-09-03T20:00:00.000Z",
  );
}

describe("renewalFeasibility — il log vuoto non e piu una condizione", () => {
  it("accetta il rinnovo quando il log e vuoto (nessuna regressione)", () => {
    expect(renewalFeasibility([], IDS, [RENEWAL], "Io")).toEqual({ ok: true, violations: [] });
  });

  it("ACCETTA il rinnovo con un acquisto gia registrato — il caso che il blocco vietava", () => {
    // Esattamente lo scenario di Pico: un inserimento manuale, poi il rinnovo.
    const log = purchase([], "Io", "Centrocampista Zeta|ClubDue", "C", 20);
    expect(renewalFeasibility(log, IDS, [RENEWAL], "Io")).toEqual({ ok: true, violations: [] });
  });

  it("accetta anche quando a comprare e stata UN'ALTRA squadra", () => {
    const log = purchase([], "Due", "Attaccante Omega|ClubTre", "A", 50);
    expect(renewalFeasibility(log, IDS, [RENEWAL], "Io").ok).toBe(true);
  });
});

describe("renewalFeasibility — le tre domande che validateConfirmations non poteva porsi", () => {
  it("rifiuta se il giocatore e gia in una rosa secondo il log", () => {
    const log = purchase([], "Due", RENEWAL.playerId, "D", 9);
    const result = renewalFeasibility(log, IDS, [RENEWAL], "Io");
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(["player-in-auction-log"]);
  });

  it("rifiuta anche se a possederlo e la squadra che lo vorrebbe riconfermare", () => {
    const log = purchase([], "Io", RENEWAL.playerId, "D", 9);
    expect(renewalFeasibility(log, IDS, [RENEWAL], "Io").violations).toEqual([
      "player-in-auction-log",
    ]);
  });

  it("RIFIUTA anche dopo uno svincolo: t=0 non puo contraddire un acquisto poi annullato a mano", () => {
    const bought = purchase([], "Due", RENEWAL.playerId, "D", 9);
    const released = recordRelease(
      bought,
      reduce(bought, IDS),
      { playerId: RENEWAL.playerId, fantaTeamId: "Due", creditsReturned: 5 },
      "2026-09-03T20:05:00.000Z",
    );
    // Scoperto scrivendo questo test, e non e un dettaglio: seminare a t=0 un
    // giocatore che il log ha comprato renderebbe irrappresentabile quello
    // stesso acquisto, e `reduce()` lancerebbe. Il rifiuto arriva prima.
    const result = renewalFeasibility(released, IDS, [RENEWAL], "Io");
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(["player-in-auction-log"]);
  });

  it("un acquisto ANNULLATO non blocca il rinnovo: il VOID lo toglie dal log che conta", () => {
    const bought = purchase([], "Due", RENEWAL.playerId, "D", 9);
    const voided = recordVoid(bought, bought[bought.length - 1]!.seq, "2026-09-03T20:05:00.000Z");
    expect(renewalFeasibility(voided, IDS, [RENEWAL], "Io")).toEqual({ ok: true, violations: [] });
  });

  it("rifiuta quando il budget speso nel log non regge piu la riconferma", () => {
    // Si spende quasi tutto, lasciando meno del prezzo della riconferma.
    let log: readonly AuctionEvent[] = [];
    // 473 = INITIAL_BUDGET - 27, il massimo che la riserva dura consente con
    // 27 caselle ancora da riempire: di piu lo rifiuterebbe gia l'acquisto.
    log = purchase(log, "Io", "Attaccante Uno|ClubX", "A", INITIAL_BUDGET - 27);
    const result = renewalFeasibility(log, IDS, [{ ...RENEWAL, price: 40 }], "Io");
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("budget-exhausted-by-log");
  });

  it("rifiuta quando gli acquisti hanno occupato tutte le caselle del ruolo", () => {
    // Nove difensori (ROSTER_REQUIREMENTS.D) comprati a 1: la decima riga —
    // la riconferma, che semina a t=0 — non ha piu dove stare.
    let log: readonly AuctionEvent[] = [];
    for (let i = 0; i < 9; i += 1) {
      log = purchase(log, "Io", `Difensore Riempitivo ${i}|ClubY`, "D", 1);
    }
    const result = renewalFeasibility(log, IDS, [RENEWAL], "Io");
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("role-slots-exhausted-by-log");
  });

  it("rifiuta quando la rosa non si chiuderebbe piu a COST_FLOOR", () => {
    // Budget quasi esaurito ma non sotto zero, e slot ancora da riempire: la
    // riserva dura e la sola cosa che se ne accorge.
    let log: readonly AuctionEvent[] = [];
    log = purchase(log, "Io", "Attaccante Uno|ClubX", "A", INITIAL_BUDGET - 27);
    const result = renewalFeasibility(log, IDS, [{ ...RENEWAL, price: 20 }], "Io");
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("roster-not-completable");
  });
});

describe("renewalFeasibility — le regole di t=0 restano quelle di prima", () => {
  it("propaga le violazioni di validateConfirmations", () => {
    const result = renewalFeasibility([], IDS, [{ ...RENEWAL, role: "P" }], "Io");
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("role-not-confirmable");
  });

  it("non ripete due volte la stessa violazione", () => {
    const result = renewalFeasibility(
      [],
      IDS,
      [
        { ...RENEWAL, role: "P" },
        { fantaTeamId: "Due", playerId: "Portiere Beta|ClubZ", role: "P", price: 3 },
      ],
      "Io",
    );
    expect(result.violations).toEqual(["role-not-confirmable"]);
  });

  it("rifiuta una squadra che non e al tavolo", () => {
    const result = renewalFeasibility([], IDS, [{ ...RENEWAL, fantaTeamId: "Fantasma" }], "Io");
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("unknown-team");
  });
});

describe("renewalFeasibility — la promessa che conta: cio che accetta, reduce() lo regge", () => {
  it("ogni esito ok produce uno stato che reduce() sa costruire, e coerente", () => {
    let log: readonly AuctionEvent[] = [];
    log = purchase(log, "Io", "Centrocampista Zeta|ClubDue", "C", 20);
    log = purchase(log, "Due", "Attaccante Omega|ClubTre", "A", 50);

    const next = [RENEWAL];
    expect(renewalFeasibility(log, IDS, next, "Io").ok).toBe(true);

    // La prova vera: lo stato si costruisce senza lanciare, e i numeri tornano.
    const state = reduce(log, IDS, next);
    const io = state.teams["Io"]!;
    expect(io.spent).toBe(20 + RENEWAL.price);
    expect(io.budgetResidual).toBe(INITIAL_BUDGET - 20 - RENEWAL.price);
    expect(io.roster.map((r) => r.playerId)).toContain(RENEWAL.playerId);
    // La riconferma sta PRIMA dell'acquisto: semina t=0 anche se dichiarata dopo.
    expect(io.roster[0]!.playerId).toBe(RENEWAL.playerId);
    expect(io.budgetResidual).toBeGreaterThanOrEqual(0);
  });
});

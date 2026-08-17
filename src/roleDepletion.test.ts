import { describe, it, expect } from "vitest";
import { roleDepletionReading } from "./roleDepletion.js";
import { reduce } from "../packages/engine/src/reduce.js";
import type {
  AuctionEvent,
  AuctionState,
  Role,
  TeamState,
} from "../packages/engine/src/types.js";
import { INITIAL_BUDGET, ROSTER_REQUIREMENTS } from "../packages/engine/src/types.js";

// Solo fixture sintetiche: nessun giocatore reale, nessuna squadra reale,
// nessuna quotazione da nessuna parte — nemmeno nei nomi.

const TEAM_IDS = [
  "Io",
  "Squadra2",
  "Squadra3",
  "Squadra4",
  "Squadra5",
  "Squadra6",
  "Squadra7",
  "Squadra8",
] as const;

function team(overrides: Partial<TeamState> = {}): TeamState {
  const slotsRemaining = overrides.slotsRemaining ?? { ...ROSTER_REQUIREMENTS };
  return {
    fantaTeamId: "Io",
    spent: 0,
    budgetResidual: INITIAL_BUDGET,
    filled: { P: 0, D: 0, C: 0, A: 0 },
    roster: [],
    ...overrides,
    slotsRemaining,
    totalSlotsRemaining:
      slotsRemaining.P + slotsRemaining.D + slotsRemaining.C + slotsRemaining.A,
  };
}

function stateOf(teams: readonly TeamState[]): AuctionState {
  return {
    teams: Object.fromEntries(teams.map((t) => [t.fantaTeamId, t])),
    purchasedPlayerIds: [],
    lastSeq: 0,
  };
}

/** Otto squadre intatte: lo stato alla primissima chiamata. */
function freshState(): AuctionState {
  return stateOf(TEAM_IDS.map((fantaTeamId) => team({ fantaTeamId })));
}

let seq = 0;
function buy(playerId: string, role: Role, fantaTeamId: string, price: number): AuctionEvent {
  seq += 1;
  return { type: "PURCHASE", seq, ts: "2026-08-16T20:00:00.000Z", playerId, role, fantaTeamId, price };
}
function voidOf(targetSeq: number): AuctionEvent {
  seq += 1;
  return { type: "VOID", seq, ts: "2026-08-16T20:00:00.000Z", targetSeq };
}

function factsOf(log: readonly AuctionEvent[], state: AuctionState, role: Role | "") {
  const reading = roleDepletionReading({ log, state, role });
  if (reading.kind !== "facts") throw new Error(`atteso kind "facts", ricevuto "${reading.kind}"`);
  return reading.facts;
}

describe("roleDepletionReading — nessuna chiamata", () => {
  it("non produce fatti e non produce uno zero: produce «non c'è un soggetto»", () => {
    // `""` non è un ruolo di ripiego e non degrada al primo ruolo disponibile:
    // il caso viaggia fino alla frase che lo dice.
    expect(roleDepletionReading({ log: [], state: freshState(), role: "" })).toEqual({
      kind: "no-call",
    });
  });
});

describe("roleDepletionReading — il registro di stasera", () => {
  it("a log vuoto conta zero acquisti e nessun compratore, non un elenco muto", () => {
    const facts = factsOf([], freshState(), "A");
    expect(facts.takenTonight).toBe(0);
    expect(facts.creditsTonight).toBe(0);
    expect(facts.buyers).toEqual([]);
  });

  it("conta solo il ruolo chiesto, non gli acquisti degli altri ruoli", () => {
    const log = [
      buy("a1", "A", "Io", 40),
      buy("d1", "D", "Squadra2", 12),
      buy("a2", "A", "Squadra2", 25),
      buy("p1", "P", "Squadra3", 5),
    ];
    const facts = factsOf(log, freshState(), "A");
    expect(facts.takenTonight).toBe(2);
    expect(facts.creditsTonight).toBe(65);
    expect(factsOf(log, freshState(), "D").takenTonight).toBe(1);
    expect(factsOf(log, freshState(), "P").creditsTonight).toBe(5);
    expect(factsOf(log, freshState(), "C").takenTonight).toBe(0);
  });

  it("un acquisto annullato da un VOID non è mai stato: esce dal conteggio e dai crediti", () => {
    // Il registro non si riscrive, si compensa: la stessa nozione di
    // «acquisto ancora in piedi» del resto dell'app.
    const purchase = buy("a1", "A", "Io", 40);
    const log = [purchase, buy("a2", "A", "Io", 10), voidOf(purchase.seq)];
    const facts = factsOf(log, freshState(), "A");
    expect(facts.takenTonight).toBe(1);
    expect(facts.creditsTonight).toBe(10);
    expect(facts.buyers).toEqual([{ fantaTeamId: "Io", taken: 1, credits: 10, prices: [10] }]);
  });

  it("raggruppa per squadra e porta i prezzi in chiaro, uno per uno", () => {
    // I prezzi singoli e non la loro media: la media di 45 e 3 e la media di
    // 24 e 24 sono lo stesso numero e non sono lo stesso tavolo.
    const log = [
      buy("a1", "A", "Squadra2", 3),
      buy("a2", "A", "Squadra2", 45),
      buy("a3", "A", "Io", 20),
    ];
    const facts = factsOf(log, freshState(), "A");
    expect(facts.buyers).toEqual([
      { fantaTeamId: "Squadra2", taken: 2, credits: 48, prices: [45, 3] },
      { fantaTeamId: "Io", taken: 1, credits: 20, prices: [20] },
    ]);
  });

  it("ordina i compratori in modo totale e stabile: quanti, poi quanto, poi id", () => {
    const log = [
      buy("a1", "A", "Squadra5", 30),
      buy("a2", "A", "Squadra3", 10),
      buy("a3", "A", "Squadra3", 10),
      buy("a4", "A", "Squadra2", 30),
    ];
    const order = factsOf(log, freshState(), "A").buyers.map((b) => b.fantaTeamId);
    // Squadra3 ne ha presi 2 e sta prima di chi ne ha preso 1; fra le due che
    // ne hanno preso 1 con gli stessi crediti decide l'id, non l'ordine di log.
    expect(order).toEqual(["Squadra3", "Squadra2", "Squadra5"]);
  });

  it("è deterministica: stesso log e stesso stato → risultato identico", () => {
    const log = [buy("a1", "A", "Io", 40), buy("a2", "A", "Squadra2", 25)];
    const state = freshState();
    expect(roleDepletionReading({ log, state, role: "A" })).toEqual(
      roleDepletionReading({ log, state, role: "A" }),
    );
  });
});

describe("roleDepletionReading — il censimento dei posti", () => {
  it("conta i posti del ruolo come regola di lega per squadre al tavolo", () => {
    const facts = factsOf([], freshState(), "A");
    expect(facts.teamsCounted).toBe(8);
    expect(facts.roleSlotsTotal).toBe(ROSTER_REQUIREMENTS.A * 8); // 7 x 8 = 56
    expect(facts.openSlots).toBe(56);
    expect(facts.teamsWithOpenSlot).toBe(8);
    expect(facts.widestOpening).toBe(7);
  });

  it("misura la concentrazione della domanda, non solo la sua somma", () => {
    // Ventiquattro posti liberi distribuiti su otto squadre e ventiquattro
    // concentrati su quattro non sono lo stesso tavolo, e la sola somma —
    // l'unico numero che la schermata mostrava finora — li rende identici.
    const concentrated = stateOf([
      team({ fantaTeamId: "Io", slotsRemaining: { P: 3, D: 9, C: 9, A: 6 } }),
      team({ fantaTeamId: "Squadra2", slotsRemaining: { P: 3, D: 9, C: 9, A: 6 } }),
      team({ fantaTeamId: "Squadra3", slotsRemaining: { P: 3, D: 9, C: 9, A: 0 } }),
      team({ fantaTeamId: "Squadra4", slotsRemaining: { P: 3, D: 9, C: 9, A: 0 } }),
    ]);
    const facts = factsOf([], concentrated, "A");
    expect(facts.openSlots).toBe(12);
    expect(facts.teamsWithOpenSlot).toBe(2);
    expect(facts.widestOpening).toBe(6);
  });

  it("conta le riconferme dalla marca che il motore dà loro, non per differenza", () => {
    // `reduce()` semina le riconferme con `seq` negativo, sotto ogni evento
    // live. È quella marca che le distingue, e si legge direttamente: una
    // sottrazione fra posti occupati e acquisti di stasera sembrerebbe una
    // misura e sarebbe una deduzione.
    const withHeld = stateOf([
      team({
        fantaTeamId: "Io",
        slotsRemaining: { P: 3, D: 9, C: 9, A: 5 },
        roster: [
          { playerId: "vecchio1", role: "A", price: 60, seq: -2 },
          { playerId: "vecchio2", role: "A", price: 18, seq: -1 },
        ],
      }),
      team({ fantaTeamId: "Squadra2" }),
    ]);
    const facts = factsOf([], withHeld, "A");
    expect(facts.confirmedSlots).toBe(2);
    expect(facts.takenTonight).toBe(0);
  });

  it("non conta come riconferma un acquisto di stasera già in rosa", () => {
    const live = stateOf([
      team({
        fantaTeamId: "Io",
        slotsRemaining: { P: 3, D: 9, C: 9, A: 6 },
        roster: [{ playerId: "a1", role: "A", price: 40, seq: 1 }],
      }),
    ]);
    expect(factsOf([buy("a1", "A", "Io", 40)], live, "A").confirmedSlots).toBe(0);
  });

  it("a ruolo completo su tutto il tavolo dice zero squadre scoperte, non una", () => {
    const full = stateOf(
      TEAM_IDS.map((fantaTeamId) =>
        team({ fantaTeamId, slotsRemaining: { P: 3, D: 9, C: 9, A: 0 } }),
      ),
    );
    const facts = factsOf([], full, "A");
    expect(facts.openSlots).toBe(0);
    expect(facts.teamsWithOpenSlot).toBe(0);
    expect(facts.widestOpening).toBe(0);
  });
});

describe("roleDepletionReading — coerenza col motore", () => {
  it("i posti occupati del ruolo tornano con acquisti di stasera più riconferme", () => {
    // L'invariante NON è affermata dal pannello (nessuno dei quattro numeri a
    // schermo è ottenuto per differenza dagli altri): è verificata qui, su uno
    // stato prodotto davvero da `reduce()`, così una divergenza fra log e
    // stato ridotto si vede in un test invece che sullo schermo in asta.
    const confirmations = [
      { fantaTeamId: "Io", playerId: "vecchio1", role: "A" as Role, price: 60 },
      { fantaTeamId: "Squadra2", playerId: "vecchio2", role: "A" as Role, price: 18 },
    ];
    const log = [
      buy("a1", "A", "Io", 40),
      buy("a2", "A", "Squadra3", 25),
      buy("d1", "D", "Io", 9),
    ];
    const state = reduce(log, [...TEAM_IDS], confirmations);
    const facts = factsOf(log, state, "A");
    expect(facts.roleSlotsTotal - facts.openSlots).toBe(
      facts.takenTonight + facts.confirmedSlots,
    );
    expect(facts.takenTonight).toBe(2);
    expect(facts.confirmedSlots).toBe(2);
  });

  it("un acquisto annullato esce insieme dallo stato e dal conteggio di stasera", () => {
    const purchase = buy("a1", "A", "Io", 40);
    const log = [purchase, voidOf(purchase.seq)];
    const state = reduce(log, [...TEAM_IDS], []);
    const facts = factsOf(log, state, "A");
    expect(facts.takenTonight).toBe(0);
    expect(facts.roleSlotsTotal - facts.openSlots).toBe(0);
  });
});

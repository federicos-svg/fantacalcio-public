// SVINCOLO E SCAMBIO — i due gesti che il log non sapeva raccontare.
//
// COSA PROVA QUESTO FILE, e perche ognuna delle tre parti esiste.
//
//  1. LA CONTABILITA NON PERDE E NON CREA CREDITI. E l'unica cosa che questi
//     due eventi possono davvero rompere, e la rompono in due modi opposti:
//     uno svincolo che restituisse il prezzo pieno cancellerebbe il costo di
//     un errore; uno scambio che seguisse i prezzi delle righe regalerebbe
//     crediti a chi cede il giocatore piu caro. Il registro di reduce()
//     esiste per questo, e qui si verifica sui numeri.
//  2. LA GUARDIA E SUL RISULTATO. Lo scambio e libero per decisione di Pico
//     (2026-08-30): non uno-a-uno, non a pari ruolo. Quello che non puo
//     succedere e che una rosa esca da 3P/9D/9C/7A, che un budget vada sotto
//     zero, o che una rosa resti non completabile a COST_FLOOR.
//  3. IL LOG RESTA RIDUCIBILE. Un VOID che togliesse l'acquisto sotto uno
//     svincolo gia registrato produrrebbe un log che reduce() non sa leggere.
//     `voidFeasibility` lo rifiuta prima (`target-superseded`), e reduce()
//     lancia se ci arriva lo stesso: le due prove stanno insieme perche la
//     seconda e la rete sotto la prima.

import { describe, it, expect } from "vitest";
import {
  reduce,
  recordPurchase,
  recordRelease,
  recordTrade,
  recordVoid,
  releaseFeasibility,
  tradeFeasibility,
  voidFeasibility,
  standingPlayerIds,
  validateEvent,
  INITIAL_BUDGET,
  ROSTER_REQUIREMENTS,
  type AuctionEvent,
} from "../src/index.js";
import { FANTA_TEAM_IDS } from "../fixtures/synthetic.js";

const TEAMS = FANTA_TEAM_IDS;
const TS = "2026-08-30T10:00:00Z";
const A = "psg";
const B = "ataturk";

/** Applica una sequenza di acquisti, ognuno ammesso da `recordPurchase`. */
function buy(
  log: readonly AuctionEvent[],
  purchases: readonly { playerId: string; role: "P" | "D" | "C" | "A"; fantaTeamId: string; price: number }[],
): readonly AuctionEvent[] {
  let next = log;
  for (const p of purchases) next = recordPurchase(next, reduce(next, TEAMS), p, TS);
  return next;
}

const team = (log: readonly AuctionEvent[], id: string) => reduce(log, TEAMS).teams[id]!;

describe("svincolo — la casella si libera, i crediti tornano solo in parte", () => {
  it("restituisce esattamente i crediti dichiarati, non il prezzo pagato", () => {
    const bought = buy([], [{ playerId: "A1", role: "A", fantaTeamId: A, price: 40 }]);
    expect(team(bought, A).budgetResidual).toBe(INITIAL_BUDGET - 40);

    const released = recordRelease(bought, reduce(bought, TEAMS), {
      playerId: "A1",
      fantaTeamId: A,
      creditsReturned: 20,
    }, TS);

    const after = team(released, A);
    // 40 usciti, 20 tornati: 20 bruciati, che e cio che lo svincolo e costato.
    expect(after.budgetResidual).toBe(INITIAL_BUDGET - 20);
    expect(after.roster).toHaveLength(0);
    expect(after.slotsRemaining.A).toBe(ROSTER_REQUIREMENTS.A);
  });

  it("il giocatore svincolato torna libero: esce da purchasedPlayerIds", () => {
    const bought = buy([], [{ playerId: "A1", role: "A", fantaTeamId: A, price: 40 }]);
    expect(reduce(bought, TEAMS).purchasedPlayerIds).toContain("A1");

    const released = recordRelease(bought, reduce(bought, TEAMS), {
      playerId: "A1",
      fantaTeamId: A,
      creditsReturned: 20,
    }, TS);
    expect(reduce(released, TEAMS).purchasedPlayerIds).not.toContain("A1");
    // E puo essere ricomprato da un altro: e la ragione per cui deve uscire.
    const rebought = buy(released, [{ playerId: "A1", role: "A", fantaTeamId: B, price: 12 }]);
    expect(team(rebought, B).roster.map((r) => r.playerId)).toEqual(["A1"]);
  });

  it("uno svincolo a zero crediti brucia tutto il prezzo, e resta valido", () => {
    const bought = buy([], [{ playerId: "D1", role: "D", fantaTeamId: A, price: 15 }]);
    const released = recordRelease(bought, reduce(bought, TEAMS), {
      playerId: "D1",
      fantaTeamId: A,
      creditsReturned: 0,
    }, TS);
    expect(team(released, A).budgetResidual).toBe(INITIAL_BUDGET - 15);
  });

  it("rifiuta un recupero superiore al prezzo pagato: sarebbero crediti dal nulla", () => {
    const bought = buy([], [{ playerId: "D1", role: "D", fantaTeamId: A, price: 15 }]);
    const r = releaseFeasibility(reduce(bought, TEAMS), {
      playerId: "D1",
      fantaTeamId: A,
      creditsReturned: 16,
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("credits-above-price");
  });

  it("rifiuta un giocatore che quella squadra non ha, e una squadra che non esiste", () => {
    const bought = buy([], [{ playerId: "D1", role: "D", fantaTeamId: A, price: 15 }]);
    const s = reduce(bought, TEAMS);
    expect(
      releaseFeasibility(s, { playerId: "D1", fantaTeamId: B, creditsReturned: 5 }).violations,
    ).toContain("player-not-on-roster");
    expect(
      releaseFeasibility(s, { playerId: "D1", fantaTeamId: "ghost", creditsReturned: 5 }).violations,
    ).toEqual(["unknown-team"]);
  });

  it("rifiuta crediti non interi o negativi", () => {
    const bought = buy([], [{ playerId: "D1", role: "D", fantaTeamId: A, price: 15 }]);
    const s = reduce(bought, TEAMS);
    expect(
      releaseFeasibility(s, { playerId: "D1", fantaTeamId: A, creditsReturned: 7.5 }).violations,
    ).toContain("credits-invalid");
    expect(
      releaseFeasibility(s, { playerId: "D1", fantaTeamId: A, creditsReturned: -1 }).violations,
    ).toContain("credits-negative");
  });

  it("recordRelease lancia invece di appendere un gesto impossibile", () => {
    const bought = buy([], [{ playerId: "D1", role: "D", fantaTeamId: A, price: 15 }]);
    expect(() =>
      recordRelease(bought, reduce(bought, TEAMS), {
        playerId: "D1",
        fantaTeamId: A,
        creditsReturned: 99,
      }, TS),
    ).toThrow(/infeasible release/);
  });
});

describe("scambio — i giocatori cambiano rosa, solo il conguaglio cambia budget", () => {
  const scene = () =>
    buy([], [
      { playerId: "A1", role: "A", fantaTeamId: A, price: 84 },
      { playerId: "D1", role: "D", fantaTeamId: B, price: 3 },
    ]);

  it("senza conguaglio nessun budget si muove, per quanto diversi siano i prezzi", () => {
    const log = scene();
    const traded = recordTrade(log, reduce(log, TEAMS), {
      teamAId: A,
      teamBId: B,
      fromA: ["A1"],
      fromB: ["D1"],
      creditsAToB: 0,
    }, TS);

    // 84 contro 3: se il budget seguisse i prezzi, A guadagnerebbe 81 crediti
    // che nessuno ha pagato. Non si muove niente.
    expect(team(traded, A).budgetResidual).toBe(INITIAL_BUDGET - 84);
    expect(team(traded, B).budgetResidual).toBe(INITIAL_BUDGET - 3);
    // Le rose invece si sono scambiate, coi prezzi che le righe portavano.
    expect(team(traded, A).roster.map((r) => [r.playerId, r.price])).toEqual([["D1", 3]]);
    expect(team(traded, B).roster.map((r) => [r.playerId, r.price])).toEqual([["A1", 84]]);
  });

  it("il conguaglio si muove, e solo lui", () => {
    const log = scene();
    const traded = recordTrade(log, reduce(log, TEAMS), {
      teamAId: A,
      teamBId: B,
      fromA: ["A1"],
      fromB: ["D1"],
      creditsAToB: 10,
    }, TS);
    expect(team(traded, A).budgetResidual).toBe(INITIAL_BUDGET - 84 - 10);
    expect(team(traded, B).budgetResidual).toBe(INITIAL_BUDGET - 3 + 10);
  });

  it("un conguaglio negativo lo fa pagare all'altra", () => {
    const log = scene();
    const traded = recordTrade(log, reduce(log, TEAMS), {
      teamAId: A,
      teamBId: B,
      fromA: ["A1"],
      fromB: ["D1"],
      creditsAToB: -10,
    }, TS);
    expect(team(traded, A).budgetResidual).toBe(INITIAL_BUDGET - 84 + 10);
    expect(team(traded, B).budgetResidual).toBe(INITIAL_BUDGET - 3 - 10);
  });

  it("scambio libero: due contro uno, ruoli diversi, e passa", () => {
    const log = buy([], [
      { playerId: "A1", role: "A", fantaTeamId: A, price: 20 },
      { playerId: "A2", role: "A", fantaTeamId: A, price: 10 },
      { playerId: "C1", role: "C", fantaTeamId: B, price: 5 },
    ]);
    const traded = recordTrade(log, reduce(log, TEAMS), {
      teamAId: A,
      teamBId: B,
      fromA: ["A1", "A2"],
      fromB: ["C1"],
      creditsAToB: 0,
    }, TS);
    expect(team(traded, A).filled).toMatchObject({ A: 0, C: 1 });
    expect(team(traded, B).filled).toMatchObject({ A: 2, C: 0 });
  });

  it("rifiuta lo scambio che sfonderebbe il tetto di un ruolo", () => {
    // B riempie i suoi 3 portieri; A gliene manda un quarto senza riceverne.
    const log = buy([], [
      { playerId: "P9", role: "P", fantaTeamId: A, price: 1 },
      { playerId: "P1", role: "P", fantaTeamId: B, price: 1 },
      { playerId: "P2", role: "P", fantaTeamId: B, price: 1 },
      { playerId: "P3", role: "P", fantaTeamId: B, price: 1 },
    ]);
    const r = tradeFeasibility(reduce(log, TEAMS), {
      teamAId: A,
      teamBId: B,
      fromA: ["P9"],
      fromB: [],
      creditsAToB: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("role-overflow");
  });

  it("rifiuta il conguaglio che manderebbe un budget sotto zero", () => {
    const log = buy([], [
      { playerId: "A1", role: "A", fantaTeamId: A, price: 5 },
      { playerId: "D1", role: "D", fantaTeamId: B, price: 5 },
    ]);
    const r = tradeFeasibility(reduce(log, TEAMS), {
      teamAId: A,
      teamBId: B,
      fromA: ["A1"],
      fromB: ["D1"],
      creditsAToB: INITIAL_BUDGET,
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("insufficient-budget");
  });

  it("rifiuta lo scambio che lascia una rosa non piu completabile a 1 cr", () => {
    // A ha una casella sola libera e i crediti contati: un conguaglio che gli
    // lascia meno di quanto serve per riempirla e un vicolo cieco, non un
    // affare audace.
    const log = buy([], [
      { playerId: "A1", role: "A", fantaTeamId: A, price: 5 },
      { playerId: "D1", role: "D", fantaTeamId: B, price: 5 },
    ]);
    const s = reduce(log, TEAMS);
    const emptyA = s.teams[A]!.totalSlotsRemaining; // 27 caselle ancora vuote
    // Dopo lo scambio A ne avra sempre 27 (uno esce, uno entra): il conguaglio
    // che lo porta a 26 crediti rompe la riserva senza portarlo sotto zero.
    const r = tradeFeasibility(s, {
      teamAId: A,
      teamBId: B,
      fromA: ["A1"],
      fromB: ["D1"],
      creditsAToB: s.teams[A]!.budgetResidual - (emptyA - 1),
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("breaks-hard-reserve");
  });

  it("rifiuta scambio con se stessi, scambio vuoto, doppioni e giocatori non in rosa", () => {
    const log = scene();
    const s = reduce(log, TEAMS);
    expect(
      tradeFeasibility(s, { teamAId: A, teamBId: A, fromA: [], fromB: [], creditsAToB: 1 }).violations,
    ).toEqual(["same-team"]);
    expect(
      tradeFeasibility(s, { teamAId: A, teamBId: B, fromA: [], fromB: [], creditsAToB: 0 }).violations,
    ).toContain("empty-trade");
    expect(
      tradeFeasibility(s, { teamAId: A, teamBId: B, fromA: ["A1"], fromB: ["A1"], creditsAToB: 0 })
        .violations,
    ).toContain("duplicate-player");
    expect(
      tradeFeasibility(s, { teamAId: A, teamBId: B, fromA: ["D1"], fromB: [], creditsAToB: 0 })
        .violations,
    ).toContain("player-not-on-roster");
  });

  it("recordTrade lancia invece di appendere un gesto impossibile", () => {
    const log = scene();
    expect(() =>
      recordTrade(log, reduce(log, TEAMS), {
        teamAId: A,
        teamBId: B,
        fromA: ["D1"],
        fromB: [],
        creditsAToB: 0,
      }, TS),
    ).toThrow(/infeasible trade/);
  });
});

describe("annullamento — il log resta riducibile", () => {
  it("rifiuta di annullare l'acquisto sotto uno svincolo gia registrato", () => {
    const bought = buy([], [{ playerId: "A1", role: "A", fantaTeamId: A, price: 40 }]);
    const released = recordRelease(bought, reduce(bought, TEAMS), {
      playerId: "A1",
      fantaTeamId: A,
      creditsReturned: 20,
    }, TS);
    const r = voidFeasibility(released, 0);
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("target-superseded");
  });

  it("annullato prima lo svincolo, l'acquisto torna annullabile", () => {
    const bought = buy([], [{ playerId: "A1", role: "A", fantaTeamId: A, price: 40 }]);
    const released = recordRelease(bought, reduce(bought, TEAMS), {
      playerId: "A1",
      fantaTeamId: A,
      creditsReturned: 20,
    }, TS);
    const undone = recordVoid(released, 1, TS);
    // Lo svincolo e annullato: il giocatore e di nuovo in rosa, col suo prezzo.
    expect(team(undone, A).roster.map((r) => r.playerId)).toEqual(["A1"]);
    expect(team(undone, A).budgetResidual).toBe(INITIAL_BUDGET - 40);
    expect(voidFeasibility(undone, 0).ok).toBe(true);
  });

  it("annullare uno scambio rimette ogni giocatore e ogni credito dov'era", () => {
    const log = buy([], [
      { playerId: "A1", role: "A", fantaTeamId: A, price: 84 },
      { playerId: "D1", role: "D", fantaTeamId: B, price: 3 },
    ]);
    const traded = recordTrade(log, reduce(log, TEAMS), {
      teamAId: A,
      teamBId: B,
      fromA: ["A1"],
      fromB: ["D1"],
      creditsAToB: 10,
    }, TS);
    const undone = recordVoid(traded, 2, TS);
    // `lastSeq` avanza — il log e append-only e il VOID e un evento come gli
    // altri — ma le due squadre tornano identiche a com'erano.
    expect(reduce(undone, TEAMS).teams).toEqual(reduce(log, TEAMS).teams);
    expect(reduce(undone, TEAMS).purchasedPlayerIds).toEqual(
      reduce(log, TEAMS).purchasedPlayerIds,
    );
  });

  it("rifiuta di annullare lo svincolo sotto cui un altro ha gia ricomprato", () => {
    // LA DIREZIONE SIMMETRICA, e quella che mancava. Il caso gia coperto e
    // «acquisto sotto uno svincolo»; questo e «svincolo sotto un acquisto», ed
    // e legittimo che quell'acquisto esista: e proprio lo svincolo ad aver
    // rimesso il giocatore fra i liberi. Annullarlo lo metterebbe in DUE rose.
    // Trovato dalla lente Engineering sulla PR pubblica #73, dove
    // `voidFeasibility` rispondeva `ok` e nessuno se ne accorgeva fino al
    // bordo del salvataggio.
    const bought = buy([], [{ playerId: "A1", role: "A", fantaTeamId: A, price: 10 }]);
    const released = recordRelease(bought, reduce(bought, TEAMS), {
      playerId: "A1",
      fantaTeamId: A,
      creditsReturned: 5,
    }, TS);
    const rebought = buy(released, [{ playerId: "A1", role: "A", fantaTeamId: B, price: 8 }]);

    const r = voidFeasibility(rebought, 1);
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("target-superseded");

    // E annullato prima il ri-acquisto, lo svincolo torna annullabile.
    const undoneRebuy = recordVoid(rebought, 2, TS);
    expect(voidFeasibility(undoneRebuy, 1).ok).toBe(true);
  });

  it("reduce() lancia se lo stesso giocatore finisce in due rose", () => {
    // La rete sotto il rifiuto qui sopra, e non una ridondanza: `reduce()` e la
    // funzione da cui ogni numero dell'app discende, e su questo log produceva
    // otto budget plausibili e sbagliati invece di fermarsi.
    const broken: AuctionEvent[] = [
      { type: "PURCHASE", seq: 0, ts: TS, playerId: "A1", role: "A", fantaTeamId: A, price: 10 },
      { type: "RELEASE", seq: 1, ts: TS, playerId: "A1", fantaTeamId: A, creditsReturned: 5 },
      { type: "PURCHASE", seq: 2, ts: TS, playerId: "A1", role: "A", fantaTeamId: B, price: 8 },
      { type: "VOID", seq: 3, ts: TS, targetSeq: 1 },
    ];
    expect(() => reduce(broken, TEAMS)).toThrow(/already on/);
  });

  it("un riconfermato svincolato torna comprabile da un'altra squadra", () => {
    // IL FALSO POSITIVO CHE STAVA PER ENTRARE IN PRODUZIONE. §5 fa svincolare
    // il giocatore col prezzo piu alto, che benissimo puo essere un
    // riconfermato: dopo quello svincolo, un altro puo comprarlo. Il rifiuto
    // di `reduce()` guardava pero chi lo aveva riconfermato a t=0 e non chi lo
    // possedeva ADESSO, quindi lanciava — cioe fermava la schermata a meta
    // asta. Trovato dalla lente Quality & Delivery alla seconda passata.
    const confirmations = [{ fantaTeamId: A, playerId: "D1", role: "D" as const, price: 10 }];
    const released: AuctionEvent[] = [
      { type: "RELEASE", seq: 0, ts: TS, playerId: "D1", fantaTeamId: A, creditsReturned: 5 },
      { type: "PURCHASE", seq: 1, ts: TS, playerId: "D1", role: "D", fantaTeamId: B, price: 8 },
    ];
    const s = reduce(released, TEAMS, confirmations);
    expect(s.teams[B]!.roster.map((r) => r.playerId)).toEqual(["D1"]);
    expect(s.teams[A]!.roster).toHaveLength(0);
    // A ha pagato 10 alla riconferma e ne ha recuperati 5: 5 bruciati.
    expect(s.teams[A]!.budgetResidual).toBe(INITIAL_BUDGET - 5);
    expect(s.teams[B]!.budgetResidual).toBe(INITIAL_BUDGET - 8);
  });

  it("finche il riconfermato e in rosa, comprarlo resta un conflitto — con la sua frase", () => {
    // L'altra meta: il rifiuto che deve restare, e col messaggio specifico che
    // spiega da dove viene il conflitto invece di quello generico.
    const confirmations = [{ fantaTeamId: A, playerId: "D1", role: "D" as const, price: 10 }];
    const conflicting: AuctionEvent[] = [
      { type: "PURCHASE", seq: 0, ts: TS, playerId: "D1", role: "D", fantaTeamId: B, price: 8 },
    ];
    expect(() => reduce(conflicting, TEAMS, confirmations)).toThrow(
      /confirmations\/live-log conflict/,
    );
  });

  it("un VOID non si annulla a sua volta", () => {
    const bought = buy([], [{ playerId: "A1", role: "A", fantaTeamId: A, price: 40 }]);
    const undone = recordVoid(bought, 0, TS);
    expect(voidFeasibility(undone, 1).violations).toContain("target-not-purchase");
  });

  it("reduce() lancia sul log che nessun gesto avrebbe potuto costruire", () => {
    // Costruito a mano proprio perche recordVoid lo rifiuta: e la rete sotto
    // il rifiuto, e deve essere un'eccezione e non uno stato plausibile.
    const broken: AuctionEvent[] = [
      { type: "PURCHASE", seq: 0, ts: TS, playerId: "A1", role: "A", fantaTeamId: A, price: 40 },
      { type: "RELEASE", seq: 1, ts: TS, playerId: "A1", fantaTeamId: A, creditsReturned: 20 },
      { type: "VOID", seq: 2, ts: TS, targetSeq: 0 },
    ];
    expect(() => reduce(broken, TEAMS)).toThrow(/is not on/);
  });
});

describe("schema e forma", () => {
  it("validateEvent accetta i due eventi nuovi", () => {
    expect(
      validateEvent({
        type: "RELEASE",
        seq: 3,
        ts: TS,
        playerId: "A1",
        fantaTeamId: A,
        creditsReturned: 0,
      }),
    ).toMatchObject({ type: "RELEASE" });
    expect(
      validateEvent({
        type: "TRADE",
        seq: 4,
        ts: TS,
        teamAId: A,
        teamBId: B,
        fromA: [],
        fromB: ["D1"],
        creditsAToB: -5,
      }),
    ).toMatchObject({ type: "TRADE" });
  });

  it("rifiuta un recupero negativo gia nello schema", () => {
    expect(() =>
      validateEvent({
        type: "RELEASE",
        seq: 3,
        ts: TS,
        playerId: "A1",
        fantaTeamId: A,
        creditsReturned: -1,
      }),
    ).toThrow();
  });
});

describe("standingPlayerIds — chi e ancora di qualcuno, senza mai lanciare", () => {
  it("segue acquisti, svincoli e scambi come reduce()", () => {
    const log = buy([], [
      { playerId: "A1", role: "A", fantaTeamId: A, price: 20 },
      { playerId: "D1", role: "D", fantaTeamId: B, price: 5 },
    ]);
    const released = recordRelease(log, reduce(log, TEAMS), {
      playerId: "A1",
      fantaTeamId: A,
      creditsReturned: 10,
    }, TS);
    expect(standingPlayerIds(released)).toEqual(reduce(released, TEAMS).purchasedPlayerIds);
  });

  it("su un log che reduce() rifiuterebbe risponde lo stesso, invece di lanciare", () => {
    const broken: AuctionEvent[] = [
      { type: "RELEASE", seq: 0, ts: TS, playerId: "MAI-COMPRATO", fantaTeamId: "ghost", creditsReturned: 1 },
    ];
    expect(() => reduce(broken, TEAMS)).toThrow();
    expect(standingPlayerIds(broken)).toEqual([]);
  });
});

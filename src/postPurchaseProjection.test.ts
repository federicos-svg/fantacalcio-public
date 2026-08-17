// Test della proiezione «quanto mi resta se lo prendo» — logica pura, nessun
// DOM e nessuno storage, come price.test.ts e callGuard.test.ts (postura
// no-jsdom di questo repo). Gli stati di squadra non sono scritti a mano: si
// derivano da reduce() sulle fixture sintetiche del motore, così ogni numero
// atteso qui sotto è lo stesso numero che l'app vede a schermo.
import { describe, expect, it } from "vitest";
import { reduce } from "../packages/engine/src/reduce.js";
import { recordPurchase, purchaseFeasibility } from "../packages/engine/src/feasibility.js";
import { maxSafe } from "../packages/engine/src/auction.js";
import { COST_FLOOR, type AuctionEvent, type Role, type TeamState } from "../packages/engine/src/types.js";
import { FANTA_TEAM_IDS } from "../packages/engine/fixtures/synthetic.js";
import {
  projectAfterPurchase,
  projectionAlarmText,
  projectionLabelText,
  projectionValueText,
  type PostPurchaseProjection,
} from "./postPurchaseProjection.js";

const TEAMS = FANTA_TEAM_IDS;
const TS = "2026-08-01T12:00:00Z";
const ME = "psg";
const RIVAL = "ataturk";

/** Squadra a rosa vuota: 500 crediti, 28 slot. */
const freshTeam = (id = ME): TeamState => reduce([], TEAMS).teams[id]!;

/** Stato di squadra dopo una sequenza di acquisti reali (via recordPurchase,
 *  quindi solo acquisti ammissibili: nessuno stato inventato a mano). */
function teamAfter(
  purchases: readonly { playerId: string; role: Role; fantaTeamId: string; price: number }[],
  id = ME,
): TeamState {
  let log: readonly AuctionEvent[] = [];
  for (const p of purchases) {
    log = recordPurchase(log, reduce(log, TEAMS), p, TS);
  }
  return reduce(log, TEAMS).teams[id]!;
}

describe("projectAfterPurchase — la proiezione al prezzo digitato", () => {
  it("a rosa vuota, 30 cr lasciano 470 crediti e 27 slot", () => {
    const p = projectAfterPurchase(freshTeam(), "C", "30");
    expect(p).toEqual({
      kind: "after",
      fantaTeamId: ME,
      creditsAfter: 470,
      slotsAfter: 27,
      reserveAfter: 27,
      completable: true,
      missingCredits: 0,
    });
  });

  it("gli slot proiettati sono quelli residui MENO lo slot che questo acquisto riempie", () => {
    const team = teamAfter([{ playerId: "C5", role: "C", fantaTeamId: ME, price: 40 }]);
    expect(team.totalSlotsRemaining).toBe(27);
    const p = projectAfterPurchase(team, "D", "10");
    expect(p.kind === "after" && p.slotsAfter).toBe(26);
    expect(p.kind === "after" && p.creditsAfter).toBe(450); // 500 - 40 - 10
  });

  it("la riserva proiettata è quella del motore, non una seconda formula", () => {
    const team = freshTeam();
    const p = projectAfterPurchase(team, "A", "12");
    expect(p.kind === "after" && p.reserveAfter).toBe(maxSafe(team, "A").hardReserve);
  });

  it("parla della squadra che le viene passata, e lo dichiara", () => {
    const rival = teamAfter([{ playerId: "A1", role: "A", fantaTeamId: RIVAL, price: 120 }], RIVAL);
    const mine = projectAfterPurchase(freshTeam(), "A", "50");
    const theirs = projectAfterPurchase(rival, "A", "50");
    expect(mine.fantaTeamId).toBe(ME);
    expect(theirs.fantaTeamId).toBe(RIVAL);
    expect(mine.kind === "after" && mine.creditsAfter).toBe(450);
    expect(theirs.kind === "after" && theirs.creditsAfter).toBe(330); // 500 - 120 - 50
  });
});

describe("projectAfterPurchase — riserva dura", () => {
  it("al prezzo esattamente pari al massimo sicuro la rosa resta completabile", () => {
    const team = freshTeam();
    const ceiling = maxSafe(team, "C").maxSafe; // 500 - 27 = 473
    const p = projectAfterPurchase(team, "C", String(ceiling));
    expect(p.kind === "after" && p.completable).toBe(true);
    expect(p.kind === "after" && p.creditsAfter).toBe(27);
    expect(p.kind === "after" && p.missingCredits).toBe(0);
  });

  it("un credito oltre quel massimo la rompe, e dice di quanto", () => {
    const team = freshTeam();
    const p = projectAfterPurchase(team, "C", String(maxSafe(team, "C").maxSafe + 1));
    expect(p.kind === "after" && p.completable).toBe(false);
    expect(p.kind === "after" && p.creditsAfter).toBe(26);
    expect(p.kind === "after" && p.missingCredits).toBe(1);
  });

  it("un prezzo che supera il budget lascia crediti negativi, senza troncare", () => {
    const p = projectAfterPurchase(freshTeam(), "C", "600");
    expect(p.kind === "after" && p.creditsAfter).toBe(-100);
    expect(p.kind === "after" && p.completable).toBe(false);
    expect(p.kind === "after" && p.missingCredits).toBe(127); // 27 di riserva + 100 scoperti
  });

  /**
   * Squadra già bloccata a budget: uno stato che l'admission layer NON può
   * produrre (recordPurchase rifiuta ogni acquisto che lo creerebbe), quindi la
   * fixture è costruita a mano — sintetica, nessun dato reale. Serve perché è
   * il solo caso in cui `maxSafe().maxSafe` è troncato a 0: leggere «quanti
   * crediti mancano» da lì darebbe 1 invece di 5. La proiezione lo prende dalla
   * riserva, e infatti dà 5.
   */
  const budgetLockedTeam: TeamState = {
    fantaTeamId: ME,
    spent: 480,
    budgetResidual: 20,
    filled: { P: 3, D: 0, C: 0, A: 0 },
    slotsRemaining: { P: 0, D: 9, C: 9, A: 7 },
    totalSlotsRemaining: 25,
    roster: [],
  };

  it("su una squadra già bloccata a budget dice quanto manca davvero", () => {
    const ceiling = maxSafe(budgetLockedTeam, "D");
    expect(ceiling.biddable).toBe(false);
    expect(ceiling.maxSafe).toBe(0); // troncato: 20 - 24 = -4
    expect(ceiling.hardReserve).toBe(24);
    const p = projectAfterPurchase(budgetLockedTeam, "D", String(COST_FLOOR));
    expect(p.kind === "after" && p.completable).toBe(false);
    expect(p.kind === "after" && p.creditsAfter).toBe(19);
    expect(p.kind === "after" && p.reserveAfter).toBe(24);
    expect(p.kind === "after" && p.missingCredits).toBe(5);
    // La lettura sbagliata, quella che il campo troncato produrrebbe.
    expect(p.kind === "after" && p.missingCredits).not.toBe(COST_FLOOR - ceiling.maxSafe);
  });

  /**
   * L'equivalenza che impedisce le due verità. La proiezione e il bottone
   * «Registra acquisto» rispondono alla stessa domanda con due funzioni
   * diverse: se divergessero, la schermata direbbe «si completa» e il bottone
   * rifiuterebbe (o peggio, il contrario). Qui si confrontano su tutta la
   * scala dei prezzi ammissibili per una squadra qualsiasi.
   */
  it("il verdetto coincide sempre con purchaseFeasibility() del motore", () => {
    const log = [
      { type: "PURCHASE", seq: 0, ts: TS, playerId: "A1", role: "A", fantaTeamId: ME, price: 150 },
      { type: "PURCHASE", seq: 1, ts: TS, playerId: "C1", role: "C", fantaTeamId: ME, price: 90 },
    ] as const satisfies readonly AuctionEvent[];
    const state = reduce(log, TEAMS);
    const team = state.teams[ME]!;
    for (let price = 1; price <= team.budgetResidual + 5; price++) {
      const projection = projectAfterPurchase(team, "D", String(price));
      const violations = purchaseFeasibility(state, {
        playerId: "D9",
        role: "D",
        fantaTeamId: ME,
        price,
      }).violations;
      const engineRefuses =
        violations.includes("breaks-hard-reserve") || violations.includes("insufficient-budget");
      expect(projection.kind === "after" && projection.completable, `prezzo ${price}`).toBe(
        !engineRefuses,
      );
    }
  });
});

describe("projectAfterPurchase — casi limite", () => {
  it.each([
    ["campo vuoto", ""],
    ["solo spazi", "   "],
    ["zero", "0"],
    ["negativo", "-5"],
    ["decimale", "1.5"],
    ["notazione esponenziale", "1e3"],
    ["testo", "abc"],
    ["zero iniziale", "01"],
  ])("%s: nessuna proiezione, nessun numero finto", (_case, raw) => {
    const p = projectAfterPurchase(freshTeam(), "C", raw);
    expect(p.kind).toBe("no-price");
    expect(p.fantaTeamId).toBe(ME); // di chi si parla si sa comunque
    expect(projectionValueText(p)).toBe("restano — cr e — slot");
    expect(projectionValueText(p)).not.toMatch(/\d/);
    expect(projectionAlarmText(p)).toBe("");
  });

  it("accetta il prezzo valido circondato da spazi, come il bottone", () => {
    const p = projectAfterPurchase(freshTeam(), "C", "  30  ");
    expect(p.kind === "after" && p.creditsAfter).toBe(470);
  });

  it("ruolo pieno: non esiste un «dopo», e lo dice invece di calcolarlo", () => {
    const team = teamAfter([
      { playerId: "P1", role: "P", fantaTeamId: ME, price: 1 },
      { playerId: "P2", role: "P", fantaTeamId: ME, price: 1 },
      { playerId: "P3", role: "P", fantaTeamId: ME, price: 1 },
    ]);
    expect(team.slotsRemaining.P).toBe(0);
    const p = projectAfterPurchase(team, "P", "30");
    expect(p).toEqual({ kind: "no-slot", fantaTeamId: ME });
    expect(projectionValueText(p)).toBe("nessuno slot libero in questo ruolo");
    expect(projectionAlarmText(p)).toBe("");
    // Lo stesso ruolo pieno non impedisce la proiezione sugli altri ruoli.
    expect(projectAfterPurchase(team, "D", "30").kind).toBe("after");
  });

  it("il ruolo pieno vince sul prezzo mancante: prima non c'è lo slot", () => {
    const team = teamAfter([
      { playerId: "P1", role: "P", fantaTeamId: ME, price: 1 },
      { playerId: "P2", role: "P", fantaTeamId: ME, price: 1 },
      { playerId: "P3", role: "P", fantaTeamId: ME, price: 1 },
    ]);
    expect(projectAfterPurchase(team, "P", "").kind).toBe("no-slot");
  });

  it("è deterministica", () => {
    const team = freshTeam();
    expect(JSON.stringify(projectAfterPurchase(team, "C", "30"))).toBe(
      JSON.stringify(projectAfterPurchase(team, "C", "30")),
    );
  });
});

describe("la copia a schermo", () => {
  it("l'etichetta dichiara sempre di quale squadra parla", () => {
    expect(projectionLabelText("Io")).toBe("dopo l'acquisto · Io");
    expect(projectionLabelText("Brunoo")).toBe("dopo l'acquisto · Brunoo");
  });

  it("la riga dei numeri dice crediti e slot residui", () => {
    expect(projectionValueText(projectAfterPurchase(freshTeam(), "C", "30"))).toBe(
      "restano 470 cr e 27 slot",
    );
  });

  it("i crediti negativi portano il segno meno, non un valore troncato", () => {
    expect(projectionValueText(projectAfterPurchase(freshTeam(), "C", "600"))).toBe(
      "restano −100 cr e 27 slot",
    );
  });

  it("l'allarme tace finché la rosa resta completabile", () => {
    const team = freshTeam();
    expect(projectionAlarmText(projectAfterPurchase(team, "C", "1"))).toBe("");
    expect(projectionAlarmText(projectAfterPurchase(team, "C", String(maxSafe(team, "C").maxSafe)))).toBe(
      "",
    );
  });

  it("l'allarme dice quanti crediti mancano quando la riserva dura si rompe", () => {
    const team = freshTeam();
    expect(
      projectionAlarmText(projectAfterPurchase(team, "C", String(maxSafe(team, "C").maxSafe + 7))),
    ).toBe("rosa non completabile: mancano 7 cr");
  });

  it("al singolare il verbo è singolare", () => {
    const team = freshTeam();
    expect(
      projectionAlarmText(projectAfterPurchase(team, "C", String(maxSafe(team, "C").maxSafe + 1))),
    ).toBe("rosa non completabile: manca 1 cr");
  });

  it("un prezzo oltre il budget lo dice per quello che è", () => {
    expect(projectionAlarmText(projectAfterPurchase(freshTeam(), "C", "600"))).toBe(
      "oltre il budget di 100 cr",
    );
  });
});

/**
 * Il gemello della guardia anti-scope-creep di
 * packages/engine/tests/budget.test.ts §"anti-scope-creep guard": quella
 * protegge budgetPlan(), questa protegge la proiezione. Il blocco «dopo
 * l'acquisto» è contabilità su una cifra che l'operatore ha digitato — se un
 * giorno qualcuno ci facesse passare un valore, un prezzo consigliato, una
 * banda obiettivo o un'appetibilità, questo test diventa rosso PRIMA che quel
 * campo arrivi a schermo.
 */
describe("proiezione — guardia anti-scope-creep", () => {
  const banned = /alpha|value|valore|target|banda|stretch|price|prezzo|fairtome|appeal|appetib|consigl|suggest/i;

  it("nessun campo direttivo esce dalla proiezione", () => {
    const samples: PostPurchaseProjection[] = [
      projectAfterPurchase(freshTeam(), "C", "30"),
      projectAfterPurchase(freshTeam(), "C", ""),
      projectAfterPurchase(freshTeam(), "C", "600"),
    ];
    for (const sample of samples) {
      for (const key of Object.keys(sample)) {
        expect(banned.test(key), `campo «${key}»`).toBe(false);
      }
    }
    expect(Object.keys(projectAfterPurchase(freshTeam(), "C", "30")).sort()).toEqual(
      [
        "completable",
        "creditsAfter",
        "fantaTeamId",
        "kind",
        "missingCredits",
        "reserveAfter",
        "slotsAfter",
      ].sort(),
    );
  });

  it("nessuna parola direttiva nella copia a schermo", () => {
    const team = freshTeam();
    const texts = [
      projectionLabelText("Io"),
      projectionValueText(projectAfterPurchase(team, "C", "30")),
      projectionValueText(projectAfterPurchase(team, "C", "")),
      projectionValueText(projectAfterPurchase(team, "C", "600")),
      projectionAlarmText(projectAfterPurchase(team, "C", "600")),
      projectionAlarmText(projectAfterPurchase(team, "C", String(maxSafe(team, "C").maxSafe + 7))),
    ];
    for (const text of texts) {
      expect(banned.test(text), `copia «${text}»`).toBe(false);
      // «max» è la formulazione di un'altra corsia: qui non se ne introduce
      // una seconda, in nessuna delle sue forme.
      expect(/\bmax/i.test(text), `copia «${text}»`).toBe(false);
    }
  });
});

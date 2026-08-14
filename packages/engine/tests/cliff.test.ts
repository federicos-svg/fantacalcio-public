import { describe, it, expect } from "vitest";
import {
  CLIFF_GAP_RATIO,
  anchorBook,
  availableAnchoredInRole,
  cliffFacts,
  type PlayerAnchor,
} from "../src/index.js";
import { anchor, buildLog, buy, stateOf } from "./layer2Fixtures.js";

// Scala del ruolo A: 50, 40, 30, 30, 20, 10. Un solo P, per il caso limite
// "ultimo del ruolo".
const LISTINO: PlayerAnchor[] = [
  anchor("a1", "A", 50),
  anchor("a2", "A", 40),
  anchor("a3", "A", 30),
  anchor("a6", "A", 30),
  anchor("a4", "A", 20),
  anchor("a5", "A", 10),
  anchor("p1", "P", 12),
];
const BOOK = anchorBook(LISTINO);
const EMPTY = stateOf([]);

describe("cliffFacts — dislivello sulla scala delle ancore", () => {
  it("null per un giocatore senza ancora", () => {
    expect(cliffFacts("sconosciuto", BOOK, EMPTY)).toBeNull();
  });

  it("misura il salto verso la migliore alternativa a quota non superiore", () => {
    const facts = cliffFacts("a1", BOOK, EMPTY);
    expect(facts).toMatchObject({
      role: "A",
      anchor: 50,
      playerAvailable: true,
      othersAvailableInRole: 5,
      betterAvailable: 0,
      alternativesAtOrBelow: 5,
      nextAlternativeAnchor: 40,
      gap: 10,
      shape: "gap-below",
      isCliff: false, // 10/50 = 0,20 < 0,30
    });
    expect(facts?.gapRatio).toBeCloseTo(0.2, 10);
  });

  it("conta quanti disponibili stanno SOPRA di lui", () => {
    expect(cliffFacts("a4", BOOK, EMPTY)?.betterAvailable).toBe(4); // 50, 40, 30, 30
  });

  it("cliff quando il salto supera la quota dichiarata", () => {
    const facts = cliffFacts("a4", BOOK, EMPTY); // 20 -> 10
    expect(facts?.gap).toBe(10);
    expect(facts?.gapRatio).toBeCloseTo(0.5, 10);
    expect(facts?.isCliff).toBe(true);
  });

  it("un pari ancora disponibile è un sostituto perfetto: gap 0, nessun cliff", () => {
    const facts = cliffFacts("a3", BOOK, EMPTY);
    expect(facts?.nextAlternativeAnchor).toBe(30); // a6, stessa quota
    expect(facts?.gap).toBe(0);
    expect(facts?.gapRatio).toBe(0);
    expect(facts?.isCliff).toBe(false);
  });

  it("soglia inclusiva: esattamente CLIFF_GAP_RATIO è cliff, un credito meno no", () => {
    const atThreshold = anchorBook([anchor("x", "C", 100), anchor("y", "C", 70)]);
    expect(cliffFacts("x", atThreshold, EMPTY)?.gapRatio).toBeCloseTo(CLIFF_GAP_RATIO, 10);
    expect(cliffFacts("x", atThreshold, EMPTY)?.isCliff).toBe(true);

    const belowThreshold = anchorBook([anchor("x", "C", 100), anchor("y", "C", 71)]);
    expect(cliffFacts("x", belowThreshold, EMPTY)?.isCliff).toBe(false);
  });

  it("in fondo alla scala non c'è nessun salto da subire: non è un cliff", () => {
    const facts = cliffFacts("a5", BOOK, EMPTY);
    expect(facts).toMatchObject({
      shape: "bottom-of-ladder",
      alternativesAtOrBelow: 0,
      nextAlternativeAnchor: null,
      gap: null,
      gapRatio: null,
      isCliff: false,
    });
    expect(facts?.betterAvailable).toBe(5);
  });

  it("ultimo del ruolo: cliff, senza un rapporto da mostrare", () => {
    const facts = cliffFacts("p1", BOOK, EMPTY);
    expect(facts).toMatchObject({
      shape: "last-of-role",
      othersAvailableInRole: 0,
      gap: null,
      gapRatio: null,
      isCliff: true,
    });
  });

  it("i venduti escono dalla scala e il dislivello si allarga davvero", () => {
    const state = stateOf(buildLog([buy("a2", "A", "psg", 44)]));
    const facts = cliffFacts("a1", BOOK, state);
    expect(facts?.nextAlternativeAnchor).toBe(30);
    expect(facts?.gap).toBe(20);
    expect(facts?.gapRatio).toBeCloseTo(0.4, 10);
    expect(facts?.isCliff).toBe(true);
    expect(facts?.othersAvailableInRole).toBe(4);
  });

  it("anche i RICONFERMATI escono dalla scala: sono fuori mercato come i venduti", () => {
    const state = stateOf([], [{ fantaTeamId: "psg", playerId: "a2", role: "A", price: 44 }]);
    expect(cliffFacts("a1", BOOK, state)?.nextAlternativeAnchor).toBe(30);
    expect(availableAnchoredInRole("A", BOOK, state)).toBe(5);
  });

  it("comprare l'unica alternativa a scendere lascia il giocatore in fondo alla scala", () => {
    const state = stateOf(buildLog([buy("a5", "A", "psg", 10)]));
    const facts = cliffFacts("a4", BOOK, state);
    expect(facts?.shape).toBe("bottom-of-ladder");
    expect(facts?.isCliff).toBe(false);
  });

  it("segnala quando il giocatore stesso non è più disponibile", () => {
    const state = stateOf(buildLog([buy("a1", "A", "psg", 60)]));
    const facts = cliffFacts("a1", BOOK, state);
    expect(facts?.playerAvailable).toBe(false);
    expect(facts?.othersAvailableInRole).toBe(5); // sé stesso mai contato fra gli altri
  });

  it("è deterministico", () => {
    expect(JSON.stringify(cliffFacts("a1", BOOK, EMPTY))).toBe(
      JSON.stringify(cliffFacts("a1", BOOK, EMPTY)),
    );
  });
});

describe("availableAnchoredInRole — offerta residua ancorata", () => {
  it("conta i soli giocatori ancorati ancora sul mercato, per ruolo", () => {
    expect(availableAnchoredInRole("A", BOOK, EMPTY)).toBe(6);
    expect(availableAnchoredInRole("P", BOOK, EMPTY)).toBe(1);
    expect(availableAnchoredInRole("D", BOOK, EMPTY)).toBe(0);
    const state = stateOf(buildLog([buy("a1", "A", "psg", 60), buy("a2", "A", "ataturk", 44)]));
    expect(availableAnchoredInRole("A", BOOK, state)).toBe(4);
  });
});

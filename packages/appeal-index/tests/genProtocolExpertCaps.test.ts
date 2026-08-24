import { describe, it, expect } from "vitest";
import {
  EXPERT_HEALTH_CAPS,
  EXPERT_SCORE_GRID_STEP,
  EXPERT_STARTER_CAPS,
  applyExpertCaps,
  healthCap,
  penaltyTakerFlag,
  starterCap,
} from "../src/genProtocol/expertCaps.js";

describe("genProtocol/expertCaps — la tabella ratificata (§D.10.2)", () => {
  it("PROVA PER MUTAZIONE — i tetti di titolarita' sulla griglia dichiarata, valore per valore", () => {
    // Trascritti a mano dalla tabella ratificata:
    //   ≥8 → 38 | 6–7,5 → 33 | 4–5,5 → 24 | 2–3,5 → 15 | ≤1,5 → 8
    const attesi: readonly (readonly [number, number])[] = [
      [10, 38],
      [8.5, 38],
      [8, 38],
      [7.5, 33],
      [7, 33],
      [6.5, 33],
      [6, 33],
      [5.5, 24],
      [5, 24],
      [4.5, 24],
      [4, 24],
      [3.5, 15],
      [3, 15],
      [2.5, 15],
      [2, 15],
      [1.5, 8],
      [1, 8],
      [0.5, 8],
      [0, 8],
    ];
    for (const [score, cap] of attesi) {
      expect(starterCap(score).cap).toBe(cap);
    }
  });

  it("PROVA PER MUTAZIONE — i tetti di salute, valore per valore", () => {
    // ≥4 → nessuno | ≤3 → 20 | ≤1 → 10.
    const attesi: readonly (readonly [number, number | null])[] = [
      [10, null],
      [4.5, null],
      [4, null],
      [3.5, 20],
      [3, 20],
      [2, 20],
      [1.5, 20],
      [1, 10],
      [0.5, 10],
      [0, 10],
    ];
    for (const [score, cap] of attesi) {
      expect(healthCap(score).cap).toBe(cap);
    }
  });

  it("le due tabelle coprono tutta la retta e non hanno buchi", () => {
    for (let score = -3; score <= 13; score += 0.25) {
      expect(() => starterCap(score)).not.toThrow();
      expect(() => healthCap(score)).not.toThrow();
    }
    expect(EXPERT_STARTER_CAPS).toHaveLength(5);
    expect(EXPERT_HEALTH_CAPS).toHaveLength(3);
  });

  it("i bordi: le fasce sono chiuse-aperte, e un valore fuori griglia lo dichiara", () => {
    expect(EXPERT_SCORE_GRID_STEP).toBe(0.5);
    // 7,75 non esiste sulla griglia; per intervallo chiuso-aperto sta in [6, 8).
    expect(starterCap(7.75).cap).toBe(33);
    expect(starterCap(7.75).offGrid).toBe(true);
    expect(starterCap(7.5).offGrid).toBe(false);
    // Il caso limite della salute: 1 esatto e' «≤ 1», quindi 10 e non 20.
    expect(healthCap(1).cap).toBe(10);
    expect(healthCap(1.5).cap).toBe(20);
    expect(healthCap(3.75).cap).toBe(20);
    expect(healthCap(3.75).offGrid).toBe(true);
  });

  it("un punteggio non finito non e' un tetto: si ferma invece di indovinare", () => {
    expect(() => starterCap(Number.NaN)).toThrow(/punteggio non finito/);
    expect(() => healthCap(Number.POSITIVE_INFINITY)).toThrow(/punteggio non finito/);
  });
});

describe("genProtocol/expertCaps — l'applicazione, solo verso il basso", () => {
  it("`nFinal = min(nLayer, tetti)` e il grezzo resta accanto (sensibilita' obbligatoria)", () => {
    const result = applyExpertCaps(30, { titolarita: 5, salute: 8 });
    expect(result.raw).toBe(30);
    expect(result.capped).toBe(24);
    expect(result.starterCap).toBe(24);
    expect(result.healthCap).toBeNull();
    expect(result.capApplied).toBe(true);
  });

  it("il tetto piu' stringente vince, ed e' sempre un `min` — mai un rialzo", () => {
    const result = applyExpertCaps(30, { titolarita: 9, salute: 0.5 });
    expect(result.capped).toBe(10);
    // Un giudizio ottimo non alza una stima bassa: 12 resta 12.
    const basso = applyExpertCaps(12, { titolarita: 10, salute: 10 });
    expect(basso.capped).toBe(12);
    expect(basso.capApplied).toBe(false);
  });

  it("senza giudizio non c'e' tetto: `null` non e' zero", () => {
    const result = applyExpertCaps(35, { titolarita: null, salute: null });
    expect(result.capped).toBe(35);
    expect(result.starterCap).toBeNull();
    expect(result.healthCap).toBeNull();
    expect(result.capApplied).toBe(false);
  });

  it("«nessun tetto» della salute NON e' 38: non partecipa al min", () => {
    // Con N̂ = 40 (fuori scala per un errore a monte) e salute 9, il tetto
    // salute non deve tagliare a 38 fingendo di essere una regola.
    const result = applyExpertCaps(40, { titolarita: null, salute: 9 });
    expect(result.capped).toBe(40);
  });

  it("una stima non finita resta non finita: il tetto non la ripara", () => {
    expect(applyExpertCaps(Number.NaN, { titolarita: 5, salute: 5 }).capped).toBeNaN();
  });
});

describe("genProtocol/expertCaps — rigorista: fatto > giudizio (§D.15.4)", () => {
  it("un rigore OSSERVATO prevale su una designazione assente o contraria", () => {
    expect(penaltyTakerFlag({ expertDesignation: false, observedInEarlyMatchdays: true, historicalFlag: false })).toEqual({
      flag: 1,
      reason: "OBSERVED",
    });
    expect(penaltyTakerFlag({ expertDesignation: null, observedInEarlyMatchdays: true, historicalFlag: false }).flag).toBe(1);
  });

  it("senza osservazione valgono designazione e storia, in quest'ordine", () => {
    expect(penaltyTakerFlag({ expertDesignation: true, observedInEarlyMatchdays: false, historicalFlag: false }).reason).toBe("EXPERT");
    expect(penaltyTakerFlag({ expertDesignation: null, observedInEarlyMatchdays: false, historicalFlag: true }).reason).toBe("HISTORY");
    expect(penaltyTakerFlag({ expertDesignation: false, observedInEarlyMatchdays: false, historicalFlag: false })).toEqual({
      flag: 0,
      reason: "NONE",
    });
  });
});

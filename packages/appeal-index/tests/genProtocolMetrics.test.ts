import { describe, it, expect } from "vitest";
import {
  conformalCoverage,
  mae,
  multinomialLogLoss,
  seasonalContributionError,
  signedMeanError,
  spearmanByRole,
  weightedMae,
} from "../src/genProtocol/metrics.js";

describe("genProtocol/metrics — MAE e MAE pesato (§B.2)", () => {
  it("MAE: |1|+|2|+|0| su 3 righe = 1", () => {
    expect(mae([5, 5, 5], [4, 7, 5])).toBe(1);
  });

  it("MAE pesato: (35·1 + 2·10)/(35+2) = 55/37, calcolato a mano", () => {
    // Il caso del protocollo: una fantamedia su 35 partite e una su 2.
    expect(weightedMae([6, 6], [7, 16], [35, 2])).toBeCloseTo(55 / 37, 12);
  });

  it("il peso conta: senza pesi lo stesso caso darebbe 5,5 invece di ~1,49", () => {
    expect(mae([6, 6], [7, 16])).toBe(5.5);
    expect(weightedMae([6, 6], [7, 16], [35, 2])).toBeLessThan(2);
  });

  it("con pesi uguali coincide col MAE non pesato", () => {
    expect(weightedMae([1, 2, 3], [2, 4, 3], [1, 1, 1])).toBe(mae([1, 2, 3], [2, 4, 3]));
  });

  it("rifiuta pesi negativi, peso totale nullo e lunghezze disallineate", () => {
    expect(() => weightedMae([1], [1], [-1])).toThrow();
    expect(() => weightedMae([1], [1], [0])).toThrow();
    expect(() => weightedMae([1, 2], [1], [1])).toThrow();
  });

  it("un predittore noto-peggiore ha perdita maggiore (proprieta' d'ordinamento)", () => {
    const actual = [10, 20, 30, 40];
    const good = [11, 19, 31, 39];
    const bad = [1, 2, 3, 4];
    expect(mae(actual, good)).toBeLessThan(mae(actual, bad));
    expect(weightedMae(actual, good, [1, 2, 3, 4])).toBeLessThan(weightedMae(actual, bad, [1, 2, 3, 4]));
  });
});

describe("genProtocol/metrics — Spearman per ruolo (§B.2)", () => {
  it("separa i ruoli invece di mescolarli", () => {
    const rows = [
      { role: "D" as const, actual: 1, predicted: 1 },
      { role: "D" as const, actual: 2, predicted: 2 },
      { role: "D" as const, actual: 3, predicted: 3 },
      { role: "A" as const, actual: 1, predicted: 3 },
      { role: "A" as const, actual: 2, predicted: 2 },
      { role: "A" as const, actual: 3, predicted: 1 },
    ];
    const byRole = spearmanByRole(rows);
    expect(byRole.D).toBeCloseTo(1, 12);
    expect(byRole.A).toBeCloseTo(-1, 12);
    expect(byRole.P).toBeUndefined();
    expect(byRole.C).toBeUndefined();
  });

  it("un ruolo con una sola riga da' NaN, non zero: una correlazione su un punto non esiste", () => {
    const byRole = spearmanByRole([{ role: "P", actual: 5, predicted: 5 }]);
    expect(byRole.P).toBeNaN();
  });
});

describe("genProtocol/metrics — log-loss multinomiale (§B.2)", () => {
  it("media PER PRESENZA: con p=1 sul bin osservato la perdita e' 0", () => {
    expect(
      multinomialLogLoss([{ observedCounts: [0, 3, 0], predictedProbabilities: [0, 1, 0] }]),
    ).toBe(0);
  });

  it("uniforme su 3 bin: −ln(1/3) = ln 3, indipendente da quante presenze", () => {
    const third = 1 / 3;
    expect(
      multinomialLogLoss([{ observedCounts: [2, 1, 0], predictedProbabilities: [third, third, third] }]),
    ).toBeCloseTo(Math.log(3), 12);
  });

  it("pesa per presenze: 10 presenze di un giocatore contano dieci volte una", () => {
    const sharp = [0.9, 0.1];
    const flat = [0.5, 0.5];
    const loss = multinomialLogLoss([
      { observedCounts: [10, 0], predictedProbabilities: sharp },
      { observedCounts: [0, 1], predictedProbabilities: flat },
    ]);
    const expected = (10 * -Math.log(0.9) + 1 * -Math.log(0.5)) / 11;
    expect(loss).toBeCloseTo(expected, 12);
  });

  it("una probabilita' 0 su un bin osservato da' Infinity, senza epsilon di comodo", () => {
    expect(multinomialLogLoss([{ observedCounts: [1, 0], predictedProbabilities: [0, 1] }])).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("un predittore noto-peggiore ha log-loss maggiore", () => {
    const observed = { observedCounts: [8, 2], predictedProbabilities: [0.8, 0.2] };
    const worse = { observedCounts: [8, 2], predictedProbabilities: [0.2, 0.8] };
    expect(multinomialLogLoss([observed])).toBeLessThan(multinomialLogLoss([worse]));
  });
});

describe("genProtocol/metrics — errore di contributo stagionale e bias (§B.2)", () => {
  it("e' un rapporto fra somme: (1+1)/(2+8) = 0,2", () => {
    expect(seasonalContributionError([3, 7], [2, 8])).toBeCloseTo(0.2, 12);
  });

  it("un giocatore col contributo reale quasi nullo non domina la metrica", () => {
    const dominated = seasonalContributionError([1, 10], [0.001, 10]);
    expect(dominated).toBeLessThan(0.2);
  });

  it("denominatore nullo -> NaN, mai 0 («perfetto» dove non c'e' niente da misurare)", () => {
    expect(seasonalContributionError([1, -1], [0, 0])).toBeNaN();
  });

  it("errore firmato: negativo = si prevede meno di quanto e' stato pagato", () => {
    expect(signedMeanError([10, 20], [8, 18])).toBe(-2);
    expect(signedMeanError([10, 20], [12, 22])).toBe(2);
  });
});

describe("genProtocol/metrics — copertura conformal (§B.5)", () => {
  it("conta gli estremi come coperti", () => {
    expect(conformalCoverage([5], [5], [7])).toBe(1);
    expect(conformalCoverage([7], [5], [7])).toBe(1);
    expect(conformalCoverage([7.5], [5], [7])).toBe(0);
  });

  it("un intervallo piu' largo copre non meno di uno stretto", () => {
    const actual = [1, 5, 9];
    const narrow = conformalCoverage(actual, [4, 4, 4], [6, 6, 6]);
    const wide = conformalCoverage(actual, [0, 0, 0], [10, 10, 10]);
    expect(narrow).toBeLessThan(wide);
    expect(wide).toBe(1);
  });
});

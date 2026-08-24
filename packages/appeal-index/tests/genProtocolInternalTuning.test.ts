import { describe, it, expect } from "vitest";
import {
  GEN_REGULARIZATION_DIRECTION,
  compareByRegularization,
  tuneOnInnerFold,
} from "../src/genProtocol/internalTuning.js";
import { buildSeasonFolds, type GenFold } from "../src/genProtocol/foldScheme.js";

interface Row {
  readonly targetSeason: string;
  readonly value: number;
}

function foldWithInner(): GenFold<Row> {
  const rows: Row[] = [
    { targetSeason: "2016_17", value: 1 },
    { targetSeason: "2017_18", value: 2 },
    { targetSeason: "2018_19", value: 3 },
    { targetSeason: "2019_20", value: 4 },
  ];
  const folds = buildSeasonFolds(rows);
  return folds.find((f) => f.testBlock === "2019_20")!;
}

describe("genProtocol/internalTuning — la regola dei due livelli (§D.2)", () => {
  it("il fold di test NON e' visibile a chi tuna", () => {
    const fold = foldWithInner();
    const seen: Row[][] = [];
    tuneOnInnerFold(fold, [1, 2], (_hp, innerTrain, innerValidation) => {
      seen.push([...innerTrain], [...innerValidation]);
      return 1;
    });
    const allSeen = seen.flat().map((r) => r.targetSeason);
    expect(allSeen).not.toContain(fold.testBlock);
    // Il fold interno e' l'ultima stagione del training: 2018/19.
    expect(fold.inner.validationBlock).toBe("2018_19");
  });

  it("sceglie il punto con la perdita minima", () => {
    const fold = foldWithInner();
    const result = tuneOnInnerFold(fold, [10, 20, 30], (hp) => Math.abs(hp - 20));
    expect(result.chosen).toBe(20);
    expect(result.chosenIndex).toBe(1);
    expect(result.chosenLoss).toBe(0);
    expect(result.tieBreak).toBe("unique");
    expect(result.outcomes.map((o) => o.loss)).toEqual([10, 0, 10]);
  });

  it("pareggio -> il λ PIU' ALTO (§D.2)", () => {
    const fold = foldWithInner();
    const grid = [{ lambda: 0.01 }, { lambda: 1 }, { lambda: 100 }];
    const result = tuneOnInnerFold(
      fold,
      grid,
      () => 5,
      compareByRegularization([{ key: "lambda", value: (h) => h.lambda }]),
    );
    expect(result.chosen.lambda).toBe(100);
    expect(result.tiedIndices).toEqual([0, 1, 2]);
    expect(result.tieBreak).toBe("regularization");
  });

  it("pareggio -> il k PIU' ALTO e la profondita' PIU' BASSA", () => {
    const fold = foldWithInner();
    const byK = tuneOnInnerFold(
      fold,
      [{ k: 5 }, { k: 40 }],
      () => 1,
      compareByRegularization([{ key: "k", value: (h) => h.k }]),
    );
    expect(byK.chosen.k).toBe(40);

    const byDepth = tuneOnInnerFold(
      fold,
      [{ depth: 2 }, { depth: 1 }],
      () => 1,
      compareByRegularization([{ key: "depth", value: (h) => h.depth }]),
    );
    expect(byDepth.chosen.depth).toBe(1);
  });

  it("pareggio su M -> il numero di alberi PIU' BASSO", () => {
    const fold = foldWithInner();
    const result = tuneOnInnerFold(
      fold,
      [{ trees: 300 }, { trees: 50 }],
      () => 1,
      compareByRegularization([{ key: "trees", value: (h) => h.trees }]),
    );
    expect(result.chosen.trees).toBe(50);
  });

  it("pareggio sull'half-life -> il PIU' LUNGO: ∞ prima di 3 prima di 1,5", () => {
    const fold = foldWithInner();
    const grid = [{ halfLife: 1.5 }, { halfLife: 3 }, { halfLife: Number.POSITIVE_INFINITY }];
    const comparator = compareByRegularization<{ halfLife: number }>([{ key: "halfLife", value: (h) => h.halfLife }]);
    expect(tuneOnInnerFold(fold, grid, () => 1, comparator).chosen.halfLife).toBe(Number.POSITIVE_INFINITY);
    // E fra 1,5 e 3, vince 3: un half-life corto usa meno storia, non e' piu'
    // regolarizzante.
    expect(tuneOnInnerFold(fold, grid.slice(0, 2), () => 1, comparator).chosen.halfLife).toBe(3);
  });

  it("le direzioni preregistrate sono quelle attese — valori scritti a mano", () => {
    expect(GEN_REGULARIZATION_DIRECTION.lambda).toBe("higher");
    expect(GEN_REGULARIZATION_DIRECTION.k).toBe("higher");
    expect(GEN_REGULARIZATION_DIRECTION.depth).toBe("lower");
    expect(GEN_REGULARIZATION_DIRECTION.trees).toBe("lower");
    expect(GEN_REGULARIZATION_DIRECTION.halfLife).toBe("higher");
    // α non ha una direzione preregistrata: §D.2 non la dichiara.
    expect(GEN_REGULARIZATION_DIRECTION.alpha).toBeUndefined();
  });

  it("rifiuta un iperparametro senza direzione preregistrata invece di inventarla", () => {
    expect(() => compareByRegularization([{ key: "alpha" as never, value: () => 0 }])).toThrow(
      /no preregistered regularization direction/,
    );
  });

  it("senza comparatore il pareggio cade sull'indice di enumerazione piu' basso", () => {
    const fold = foldWithInner();
    const result = tuneOnInnerFold(fold, ["a", "b", "c"], () => 3);
    expect(result.chosen).toBe("a");
    expect(result.chosenIndex).toBe(0);
    expect(result.tieBreak).toBe("enumeration");
  });

  it("le regole a piu' chiavi si applicano nell'ordine dato", () => {
    const fold = foldWithInner();
    const grid = [
      { lambda: 1, k: 5 },
      { lambda: 1, k: 40 },
      { lambda: 0.1, k: 40 },
    ];
    const result = tuneOnInnerFold(
      fold,
      grid,
      () => 2,
      compareByRegularization([
        { key: "lambda", value: (h) => h.lambda },
        { key: "k", value: (h) => h.k },
      ]),
    );
    expect(result.chosen).toEqual({ lambda: 1, k: 40 });
  });

  it("un punto non valutabile resta scritto con il suo NaN e non vince", () => {
    const fold = foldWithInner();
    const result = tuneOnInnerFold(fold, [1, 2], (hp) => (hp === 1 ? NaN : 7));
    expect(result.outcomes[0]!.loss).toBeNaN();
    expect(result.chosen).toBe(2);
  });

  it("fallisce rumorosamente se nessun punto e' valutabile o la griglia e' vuota", () => {
    const fold = foldWithInner();
    expect(() => tuneOnInnerFold(fold, [1, 2], () => NaN)).toThrow(/no grid point produced a finite inner loss/);
    expect(() => tuneOnInnerFold(fold, [], () => 1)).toThrow(/empty hyperparameter grid/);
  });
});

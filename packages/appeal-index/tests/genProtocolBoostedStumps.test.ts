import { describe, it, expect } from "vitest";
import {
  BOOSTED_DEPTH_GRID,
  BOOSTED_EARLY_STOP_PATIENCE,
  BOOSTED_LEARNING_RATE_GRID,
  BOOSTED_MAX_TREES,
  BOOSTED_QUANTILE_BINS,
  BOOSTED_STUMPS_GRID,
  binIndexOf,
  fitBoostedStumps,
  predictWithBoostedStumps,
  quantileBinEdges,
  weightedMedian,
  type BoostedTrainingRow,
} from "../src/genProtocol/boostedStumps.js";
import { fitElasticNet, predictWithElasticNet } from "../src/genProtocol/elasticNet.js";
import { mae } from "../src/genProtocol/metrics.js";

/**
 * XOR sintetico: `y = 10` quando i segni di x1 e x2 differiscono, `0`
 * altrimenti. E' l'interazione pura — nessun modello additivo, quindi nessun
 * elastic net e nessuno stump di profondita' 1, puo' rappresentarlo.
 */
function xorGrid(): BoostedTrainingRow[] {
  const rows: BoostedTrainingRow[] = [];
  for (const x1 of [-3, -2, -1, 1, 2, 3]) {
    for (const x2 of [-3, -2, -1, 1, 2, 3]) {
      rows.push({ features: { x1, x2 }, target: (x1 > 0) !== (x2 > 0) ? 10 : 0 });
    }
  }
  return rows;
}

describe("genProtocol/boostedStumps — griglie e costanti (§D.2, FAM-4)", () => {
  it("lr ∈ {0,05; 0,1}, profondita' ∈ {1, 2}, M ≤ 300, pazienza 20, 32 bin", () => {
    expect(BOOSTED_LEARNING_RATE_GRID).toEqual([0.05, 0.1]);
    expect(BOOSTED_DEPTH_GRID).toEqual([1, 2]);
    expect(BOOSTED_MAX_TREES).toBe(300);
    expect(BOOSTED_EARLY_STOP_PATIENCE).toBe(20);
    expect(BOOSTED_QUANTILE_BINS).toBe(32);
    expect(BOOSTED_STUMPS_GRID).toHaveLength(4);
  });

  it("rifiuta una profondita' oltre 2: il protocollo le cappa a 2", () => {
    const rows = xorGrid();
    expect(() => fitBoostedStumps(rows, ["x1", "x2"], { learningRate: 0.1, depth: 3 })).toThrow(/depth must be 1 or 2/);
    expect(() => fitBoostedStumps(rows, ["x1", "x2"], { learningRate: 0.1, depth: 2, maxTrees: 500 })).toThrow(
      /maxTrees/,
    );
  });
});

describe("genProtocol/boostedStumps — binning per quantili", () => {
  it("produce al massimo 31 tagli e li collassa dove i valori distinti sono pochi", () => {
    const many = Array.from({ length: 1000 }, (_, i) => i);
    expect(quantileBinEdges(many).length).toBe(31);
    // Un flag 0/1 non genera 31 tagli: i duplicati collassano e restano i pochi
    // punti che separano davvero qualcosa.
    const flag = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0 : 1));
    const flagEdges = quantileBinEdges(flag);
    expect(flagEdges.length).toBeLessThanOrEqual(3);
    expect(new Set(flag.map((v) => binIndexOf(v, flagEdges))).size).toBe(2);
    expect(quantileBinEdges([]).length).toBe(0);
    // Una colonna costante non ha alcun taglio: non c'e' niente da separare.
    expect(quantileBinEdges([7, 7, 7, 7]).length).toBe(0);
  });

  it("l'indice di bin conta i tagli strettamente sotto il valore", () => {
    const edges = [1, 3, 5];
    expect(binIndexOf(0, edges)).toBe(0);
    expect(binIndexOf(1, edges)).toBe(0);
    expect(binIndexOf(2, edges)).toBe(1);
    expect(binIndexOf(5, edges)).toBe(2);
    expect(binIndexOf(6, edges)).toBe(3);
  });
});

describe("genProtocol/boostedStumps — mediana pesata (foglie L1)", () => {
  it("con pesi uguali e' la mediana bassa", () => {
    expect(weightedMedian([1, 2, 3], [1, 1, 1])).toBe(2);
    expect(weightedMedian([1, 2, 3, 4], [1, 1, 1, 1])).toBe(2);
  });

  it("un peso dominante sposta la mediana su quel valore", () => {
    expect(weightedMedian([1, 2, 100], [1, 1, 50])).toBe(100);
  });

  it("rifiuta peso totale nullo e input vuoto", () => {
    expect(() => weightedMedian([1], [0])).toThrow();
    expect(() => weightedMedian([], [])).toThrow();
  });
});

describe("genProtocol/boostedStumps — la non-linearita' emerge qui", () => {
  const train = [...xorGrid(), ...xorGrid(), ...xorGrid()];
  const validation = xorGrid();
  const test = xorGrid();
  const actual = test.map((r) => r.target);

  it("su un XOR batte nettamente il lineare (e la profondita' 1)", () => {
    const boosted = fitBoostedStumps(train, ["x1", "x2"], { learningRate: 0.1, depth: 2 }, validation);
    const boostedMae = mae(actual, test.map((r) => predictWithBoostedStumps(boosted, r.features)));

    const linear = fitElasticNet(train, ["x1", "x2"], { alpha: 0, lambda: 0.001 });
    const linearMae = mae(actual, test.map((r) => predictWithElasticNet(linear, r.features)));

    const stump = fitBoostedStumps(train, ["x1", "x2"], { learningRate: 0.1, depth: 1 }, validation);
    const stumpMae = mae(actual, test.map((r) => predictWithBoostedStumps(stump, r.features)));

    expect(boostedMae).toBeLessThan(1);
    expect(linearMae).toBeGreaterThan(4);
    // Un modello additivo non puo' rappresentare l'interazione: la profondita'
    // 1 non fa meglio del lineare, ed e' proprio la prova che serve a §D.5.
    expect(stumpMae).toBeGreaterThan(4);
    expect(boostedMae).toBeLessThan(linearMae);
    expect(boostedMae).toBeLessThan(stumpMae);
  });

  it("su un problema lineare non peggiora la costante di partenza", () => {
    const linearRows: BoostedTrainingRow[] = Array.from({ length: 60 }, (_, i) => ({
      features: { x: i - 30 },
      target: 2 * (i - 30),
    }));
    const fitted = fitBoostedStumps(linearRows, ["x"], { learningRate: 0.1, depth: 2 }, linearRows);
    const predictions = linearRows.map((r) => predictWithBoostedStumps(fitted, r.features));
    const constant = linearRows.map(() => fitted.baseValue);
    expect(mae(linearRows.map((r) => r.target), predictions)).toBeLessThan(
      mae(linearRows.map((r) => r.target), constant),
    );
  });
});

describe("genProtocol/boostedStumps — early-stop, missingness, determinismo", () => {
  const train = [...xorGrid(), ...xorGrid(), ...xorGrid()];
  const validation = xorGrid();

  it("l'early-stop tronca al numero di alberi migliore sul fold interno", () => {
    // La profondita' 1 non impara nulla su XOR: la validazione non migliora
    // mai e il modello viene troncato a zero alberi dopo la pazienza.
    const stump = fitBoostedStumps(train, ["x1", "x2"], { learningRate: 0.1, depth: 1 }, validation);
    expect(stump.earlyStopped).toBe(true);
    expect(stump.treeCount).toBe(0);
    expect(stump.validationLossByIteration.length).toBe(BOOSTED_EARLY_STOP_PATIENCE);
  });

  it("senza fold interno si fitta fino a maxTrees, senza troncare", () => {
    const fitted = fitBoostedStumps(train, ["x1", "x2"], { learningRate: 0.1, depth: 2, maxTrees: 25 });
    expect(fitted.treeCount).toBe(25);
    expect(fitted.earlyStopped).toBe(false);
    expect(fitted.validationLossByIteration).toEqual([]);
  });

  it("le righe con NaN sono escluse e contate, come in elasticNet", () => {
    const rows: BoostedTrainingRow[] = [
      ...train,
      { features: { x1: NaN, x2: 1 }, target: 5 },
      { features: { x1: 1, x2: 1 }, target: NaN },
      { features: { x1: 1, x2: 1 }, target: 5, weight: 0 },
    ];
    const fitted = fitBoostedStumps(rows, ["x1", "x2"], { learningRate: 0.1, depth: 2, maxTrees: 5 });
    expect(fitted.excludedForMissingFeature).toBe(1);
    expect(fitted.excludedForMissingTarget).toBe(1);
    expect(fitted.excludedForInvalidWeight).toBe(1);
    expect(fitted.excludedRowCount).toBe(3);
    expect(fitted.trainingRowCount).toBe(train.length);
  });

  it("una feature assente in predizione da' NaN", () => {
    const fitted = fitBoostedStumps(train, ["x1", "x2"], { learningRate: 0.1, depth: 2, maxTrees: 5 });
    expect(predictWithBoostedStumps(fitted, { x1: 1, x2: -1 })).not.toBeNaN();
    expect(predictWithBoostedStumps(fitted, { x1: 1 })).toBeNaN();
  });

  it("doppia esecuzione byte-identica (§B.3.1)", () => {
    const a = fitBoostedStumps(train, ["x1", "x2"], { learningRate: 0.05, depth: 2 }, validation);
    const b = fitBoostedStumps(train, ["x1", "x2"], { learningRate: 0.05, depth: 2 }, validation);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("l'artefatto serializzato produce le stesse predizioni", () => {
    const fitted = fitBoostedStumps(train, ["x1", "x2"], { learningRate: 0.1, depth: 2 }, validation);
    const roundTripped = JSON.parse(JSON.stringify(fitted)) as typeof fitted;
    for (const row of xorGrid()) {
      expect(predictWithBoostedStumps(roundTripped, row.features)).toBe(predictWithBoostedStumps(fitted, row.features));
    }
  });

  it("l'ordine delle righe non cambia il modello", () => {
    const a = fitBoostedStumps(train, ["x1", "x2"], { learningRate: 0.1, depth: 2, maxTrees: 20 });
    const b = fitBoostedStumps([...train].reverse(), ["x1", "x2"], { learningRate: 0.1, depth: 2, maxTrees: 20 });
    expect(JSON.stringify(a.trees)).toBe(JSON.stringify(b.trees));
    expect(a.baseValue).toBe(b.baseValue);
  });
});

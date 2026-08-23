import { describe, it, expect } from "vitest";
import {
  ELASTIC_NET_ALPHA_GRID,
  ELASTIC_NET_GRID,
  ELASTIC_NET_LAMBDA_GRID,
  ELASTIC_NET_MAX_ITERATIONS,
  ELASTIC_NET_TOLERANCE,
  fitElasticNet,
  predictWithElasticNet,
  type ElasticNetTrainingRow,
} from "../src/genProtocol/elasticNet.js";
import { solveRidge } from "../src/models/ridgeCore.js";
import { ZERO_VARIANCE_THRESHOLD, fitColumnStandardizer } from "../src/featureMatrix.js";

/** Dati sintetici deterministici: y = 2 + 3·x1 − 1,5·x2 + una perturbazione ciclica minima. */
function syntheticRows(): ElasticNetTrainingRow[] {
  return Array.from({ length: 40 }, (_, i) => {
    const x1 = (i % 8) - 3.5;
    const x2 = ((i * 3) % 11) - 5;
    return { features: { x1, x2 }, target: 2 + 3 * x1 - 1.5 * x2 + ((i % 5) - 2) * 0.01 };
  });
}

describe("genProtocol/elasticNet — griglie e costanti (§D.2)", () => {
  it("α ∈ {0; 0,5; 1} — valori attesi scritti a mano", () => {
    expect(ELASTIC_NET_ALPHA_GRID).toEqual([0, 0.5, 1]);
  });

  it("λ: 21 punti da 10^-4 a 10^1, passo 10^0,25", () => {
    expect(ELASTIC_NET_LAMBDA_GRID).toHaveLength(21);
    expect(ELASTIC_NET_LAMBDA_GRID[0]).toBeCloseTo(1e-4, 12);
    expect(ELASTIC_NET_LAMBDA_GRID[20]).toBeCloseTo(10, 12);
    // Quattro passi da 10^0,25 fanno esattamente una decade.
    expect(ELASTIC_NET_LAMBDA_GRID[4]! / ELASTIC_NET_LAMBDA_GRID[0]!).toBeCloseTo(10, 9);
    for (let i = 1; i < ELASTIC_NET_LAMBDA_GRID.length; i++) {
      expect(ELASTIC_NET_LAMBDA_GRID[i]! / ELASTIC_NET_LAMBDA_GRID[i - 1]!).toBeCloseTo(Math.pow(10, 0.25), 9);
    }
    expect(ELASTIC_NET_GRID).toHaveLength(63);
  });

  it("tolleranza 1e-6 e tetto 10.000 iterazioni", () => {
    expect(ELASTIC_NET_TOLERANCE).toBe(1e-6);
    expect(ELASTIC_NET_MAX_ITERATIONS).toBe(10000);
  });
});

describe("genProtocol/elasticNet — recupero di coefficienti noti", () => {
  it("con λ minimo ritrova i coefficienti generatori (in scala originale)", () => {
    const rows = syntheticRows();
    const fitted = fitElasticNet(rows, ["x1", "x2"], { alpha: 0, lambda: 1e-6 });
    // I coefficienti sono nello spazio standardizzato: si riportano dividendo
    // per la deviazione standard della colonna.
    const b1 = fitted.coefficients[0]! / fitted.standardizerStds[0]!;
    const b2 = fitted.coefficients[1]! / fitted.standardizerStds[1]!;
    expect(b1).toBeCloseTo(3, 2);
    expect(b2).toBeCloseTo(-1.5, 2);
    expect(fitted.converged).toBe(true);
  });

  it("α = 0 coincide con `solveRidge` (λ_ridge = W·λ) — l'estimatore ridge esistente", () => {
    const rows = syntheticRows();
    const lambda = 0.05;
    const fitted = fitElasticNet(rows, ["x1", "x2"], { alpha: 0, lambda });

    const raw = rows.map((r) => [r.features.x1!, r.features.x2!]);
    const standardizer = fitColumnStandardizer(raw);
    const ridge = solveRidge(
      raw.map((v) => standardizer.transform(v)),
      rows.map((r) => r.target),
      lambda * rows.length,
    );

    expect(fitted.intercept).toBeCloseTo(ridge.intercept, 9);
    expect(fitted.coefficients[0]!).toBeCloseTo(ridge.coefficients[0]!, 8);
    expect(fitted.coefficients[1]!).toBeCloseTo(ridge.coefficients[1]!, 8);
  });

  it("λ enorme manda i coefficienti a zero — l'intercetta no, che non e' penalizzata", () => {
    const rows = syntheticRows();
    for (const alpha of ELASTIC_NET_ALPHA_GRID) {
      const fitted = fitElasticNet(rows, ["x1", "x2"], { alpha, lambda: 1e6 });
      expect(Math.abs(fitted.coefficients[0]!)).toBeLessThan(1e-3);
      expect(Math.abs(fitted.coefficients[1]!)).toBeLessThan(1e-3);
    }
    const lasso = fitElasticNet(rows, ["x1", "x2"], { alpha: 1, lambda: 1000 });
    expect(lasso.coefficients).toEqual([0, 0]);
    // L'intercetta resta la media pesata del bersaglio.
    const mean = rows.reduce((s, r) => s + r.target, 0) / rows.length;
    expect(lasso.intercept).toBeCloseTo(mean, 9);
  });

  it("λ crescente riduce (debolmente) la norma dei coefficienti", () => {
    const rows = syntheticRows();
    let previous = Number.POSITIVE_INFINITY;
    for (const lambda of [0.001, 0.01, 0.1, 1, 10]) {
      const fitted = fitElasticNet(rows, ["x1", "x2"], { alpha: 1, lambda });
      const norm = Math.abs(fitted.coefficients[0]!) + Math.abs(fitted.coefficients[1]!);
      expect(norm).toBeLessThanOrEqual(previous + 1e-9);
      previous = norm;
    }
  });
});

describe("genProtocol/elasticNet — missingness e colonne degeneri", () => {
  it("una riga con NaN su una feature attiva e' esclusa E contata, mai imputata", () => {
    const rows: ElasticNetTrainingRow[] = [
      ...syntheticRows(),
      { features: { x1: NaN, x2: 1 }, target: 100 },
      { features: { x1: 1 }, target: 100 }, // x2 assente = come NaN
      { features: { x1: 1, x2: 1 }, target: NaN },
    ];
    const fitted = fitElasticNet(rows, ["x1", "x2"], { alpha: 0, lambda: 1e-6 });
    expect(fitted.excludedForMissingFeature).toBe(2);
    expect(fitted.excludedForMissingTarget).toBe(1);
    expect(fitted.excludedRowCount).toBe(3);
    expect(fitted.trainingRowCount).toBe(40);

    // L'esclusione e' reale: il fit e' identico a quello senza le righe rotte.
    const clean = fitElasticNet(syntheticRows(), ["x1", "x2"], { alpha: 0, lambda: 1e-6 });
    expect(fitted.coefficients).toEqual(clean.coefficients);
    expect(fitted.intercept).toBe(clean.intercept);
  });

  it("una colonna a varianza zero prende coefficiente 0 (soglia 1e-9 riusata)", () => {
    const rows = syntheticRows().map((r) => ({ ...r, features: { ...r.features, costante: 42 } }));
    const fitted = fitElasticNet(rows, ["x1", "x2", "costante"], { alpha: 0, lambda: 1e-6 });
    expect(fitted.zeroVarianceThreshold).toBe(ZERO_VARIANCE_THRESHOLD);
    expect(ZERO_VARIANCE_THRESHOLD).toBe(1e-9);
    expect(fitted.coefficients[2]).toBe(0);
    expect(fitted.standardizerStds[2]).toBe(0);
  });

  it("i pesi riga contano: pesare una sola riga la fa dominare il fit", () => {
    const rows: ElasticNetTrainingRow[] = [
      { features: { x: 0 }, target: 0 },
      { features: { x: 1 }, target: 1 },
      { features: { x: 2 }, target: 10, weight: 1000 },
    ];
    const unweighted = fitElasticNet(
      rows.map((r) => ({ features: r.features, target: r.target })),
      ["x"],
      { alpha: 0, lambda: 1e-9 },
    );
    const weighted = fitElasticNet(rows, ["x"], { alpha: 0, lambda: 1e-9 });
    expect(predictWithElasticNet(weighted, { x: 2 })).toBeGreaterThan(predictWithElasticNet(unweighted, { x: 2 }));
    expect(predictWithElasticNet(weighted, { x: 2 })).toBeCloseTo(10, 1);
  });

  it("rifiuta un set attivo vuoto, nomi duplicati e un α fuori [0,1]", () => {
    const rows = syntheticRows();
    expect(() => fitElasticNet(rows, [], { alpha: 0, lambda: 1 })).toThrow();
    expect(() => fitElasticNet(rows, ["x1", "x1"], { alpha: 0, lambda: 1 })).toThrow();
    expect(() => fitElasticNet(rows, ["x1"], { alpha: 2, lambda: 1 })).toThrow();
    expect(() => fitElasticNet([{ features: { x1: NaN }, target: 1 }], ["x1"], { alpha: 0, lambda: 1 })).toThrow(
      /no usable training rows/,
    );
  });
});

describe("genProtocol/elasticNet — predizione e determinismo", () => {
  it("una feature assente in predizione da' NaN, non un'imputazione", () => {
    const fitted = fitElasticNet(syntheticRows(), ["x1", "x2"], { alpha: 0, lambda: 1e-6 });
    expect(predictWithElasticNet(fitted, { x1: 1, x2: 1 })).not.toBeNaN();
    expect(predictWithElasticNet(fitted, { x1: 1 })).toBeNaN();
    expect(predictWithElasticNet(fitted, { x1: 1, x2: NaN })).toBeNaN();
  });

  it("l'artefatto serializzato produce le stesse predizioni", () => {
    const fitted = fitElasticNet(syntheticRows(), ["x1", "x2"], { alpha: 0.5, lambda: 0.01 });
    const roundTripped = JSON.parse(JSON.stringify(fitted)) as typeof fitted;
    expect(predictWithElasticNet(roundTripped, { x1: 2, x2: -1 })).toBe(predictWithElasticNet(fitted, { x1: 2, x2: -1 }));
  });

  it("doppia esecuzione byte-identica (§B.3.1)", () => {
    const a = fitElasticNet(syntheticRows(), ["x1", "x2"], { alpha: 0.5, lambda: 0.01 });
    const b = fitElasticNet(syntheticRows(), ["x1", "x2"], { alpha: 0.5, lambda: 0.01 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

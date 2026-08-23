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
import { applyModel, type GenSerializedModel } from "../src/genProtocol/recipeArtifact.js";
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

const ORTHOGONAL_NAMES = ["x1", "x2", "x3"] as const;

/**
 * Disegno fattoriale 2³: otto righe, tre colonne ±1 MUTUAMENTE ORTOGONALI.
 *
 * L'ortogonalita' non e' un vezzo: e' cio' che rende verificabile la frase «il
 * peso agisce sulla SUA feature e non sulle altre». Con colonne correlate un
 * coefficiente che si muove non direbbe se e' il peso o il vicino che ha ceduto
 * il posto; qui il coordinate descent disaccoppia le coordinate esattamente,
 * quindi «gli altri restano invariati» e' un'uguaglianza, non una speranza.
 *
 * Il termine `0,05·((i mod 3) − 1)` esiste perche' i ρ NON coincidano coi
 * coefficienti generatori: un valore atteso che si indovina a memoria non
 * proverebbe che il test legge davvero i dati.
 */
function orthogonalRows(): ElasticNetTrainingRow[] {
  return Array.from({ length: 8 }, (_, i) => {
    const x1 = (i & 1) === 0 ? -1 : 1;
    const x2 = (i & 2) === 0 ? -1 : 1;
    const x3 = (i & 4) === 0 ? -1 : 1;
    return {
      features: { x1, x2, x3 },
      target: 5 + 2 * x1 - 3 * x2 + 1.5 * x3 + 0.05 * ((i % 3) - 1),
    };
  });
}

/**
 * Il coefficiente atteso in FORMA CHIUSA, ricalcolato qui dai dati grezzi.
 *
 * Standardizzazione, ρ, z e soglia morbida sono riscritti in questo file: il
 * test non importa nessuna costante sorvegliata del modulo sotto esame e non
 * riusa nessuna delle sue funzioni, quindi una mutazione del fitter (peso
 * applicato solo alla soglia, solo al denominatore, o applicato a `λ` invece che
 * a `λ_j`) fa fallire il confronto invece di propagarsi anche nell'attesa.
 *
 * Vale perche' le colonne sono ortogonali e centrate: ogni coordinata risolve
 * un problema a una variabile, `β_j = S(ρ_j, λ·w_j·α) / (z_j + λ·w_j·(1−α))`.
 */
function expectedOrthogonalCoefficient(
  rows: readonly ElasticNetTrainingRow[],
  name: string,
  alpha: number,
  lambda: number,
  penaltyWeight: number,
): number {
  const n = rows.length;
  const column = rows.map((row) => row.features[name]!);
  const targets = rows.map((row) => row.target);
  const columnMean = column.reduce((sum, v) => sum + v, 0) / n;
  const columnStd = Math.sqrt(column.reduce((sum, v) => sum + (v - columnMean) ** 2, 0) / n);
  const standardized = column.map((v) => (v - columnMean) / columnStd);
  const targetMean = targets.reduce((sum, v) => sum + v, 0) / n;

  let rho = 0;
  let z = 0;
  for (let i = 0; i < n; i++) {
    rho += standardized[i]! * (targets[i]! - targetMean);
    z += standardized[i]! ** 2;
  }
  rho /= n;
  z /= n;

  const lambdaJ = lambda * penaltyWeight;
  const threshold = lambdaJ * alpha;
  const numerator = rho > threshold ? rho - threshold : rho < -threshold ? rho + threshold : 0;
  return numerator / (z + lambdaJ * (1 - alpha));
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

describe("genProtocol/elasticNet — penalita' per-feature (§D.13.2)", () => {
  it("il trucco dello scaling e' INERTE: lo z-score se lo mangia, ecco perche' il parametro esiste", () => {
    // La via che avrebbe evitato un parametro: riscalare la colonna per 1/√τ.
    // Qui non fa nulla, perche' `(c·x − c·x̄)/(c·σ)` e' `(x − x̄)/σ`.
    const base = orthogonalRows();
    const rescaled = base.map((row) => ({
      ...row,
      features: { ...row.features, x2: row.features.x2! * 0.1 },
    }));
    const fittedBase = fitElasticNet(base, ORTHOGONAL_NAMES, { alpha: 0.5, lambda: 0.4 });
    const fittedRescaled = fitElasticNet(rescaled, ORTHOGONAL_NAMES, { alpha: 0.5, lambda: 0.4 });

    for (let j = 0; j < ORTHOGONAL_NAMES.length; j++) {
      expect(fittedRescaled.coefficients[j]!).toBeCloseTo(fittedBase.coefficients[j]!, 12);
    }
    expect(fittedRescaled.intercept).toBeCloseTo(fittedBase.intercept, 12);
    // Lo scaling e' arrivato allo standardizer e li' e' morto.
    expect(fittedRescaled.standardizerStds[1]!).toBeCloseTo(fittedBase.standardizerStds[1]! * 0.1, 12);

    // Il peso di penalita', invece, morde.
    const penalized = fitElasticNet(base, ORTHOGONAL_NAMES, { alpha: 0.5, lambda: 0.4 }, [1, 100, 1]);
    expect(Math.abs(penalized.coefficients[1]!)).toBeLessThan(Math.abs(fittedBase.coefficients[1]!));
  });

  it("(a) pesi tutti 1 = nessun peso: artefatto BYTE-IDENTICO, campo assente", () => {
    for (const alpha of ELASTIC_NET_ALPHA_GRID) {
      for (const lambda of [1e-4, 0.01, 0.4, 1, 10]) {
        const implicit = fitElasticNet(syntheticRows(), ["x1", "x2"], { alpha, lambda });
        const explicit = fitElasticNet(syntheticRows(), ["x1", "x2"], { alpha, lambda }, [1, 1]);
        expect(JSON.stringify(explicit)).toBe(JSON.stringify(implicit));
        expect(explicit.penaltyWeights).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(explicit, "penaltyWeights")).toBe(false);
      }
    }
  });

  it("(a) anche su tre colonne e con pesi riga: uniforme non aggiunge e non toglie niente", () => {
    const rows = orthogonalRows().map((row, i) => ({ ...row, weight: 1 + (i % 3) }));
    const implicit = fitElasticNet(rows, ORTHOGONAL_NAMES, { alpha: 0.5, lambda: 0.4 });
    const explicit = fitElasticNet(rows, ORTHOGONAL_NAMES, { alpha: 0.5, lambda: 0.4 }, [1, 1, 1]);
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(implicit));
  });

  it("(f) prova per mutazione: i coefficienti pesati coincidono con la forma chiusa ricalcolata nel test", () => {
    const rows = orthogonalRows();
    const alpha = 0.5;
    const lambda = 0.4;
    const weights = [0.25, 3, 1];

    // Prima si valida il riferimento sul caso uniforme: se la forma chiusa non
    // descrivesse gia' il fitter di oggi, il confronto pesato non proverebbe niente.
    const uniform = fitElasticNet(rows, ORTHOGONAL_NAMES, { alpha, lambda });
    expect(uniform.converged).toBe(true);
    for (let j = 0; j < ORTHOGONAL_NAMES.length; j++) {
      expect(uniform.coefficients[j]!).toBeCloseTo(
        expectedOrthogonalCoefficient(rows, ORTHOGONAL_NAMES[j]!, alpha, lambda, 1),
        12,
      );
    }

    const weighted = fitElasticNet(rows, ORTHOGONAL_NAMES, { alpha, lambda }, weights);
    expect(weighted.converged).toBe(true);
    for (let j = 0; j < ORTHOGONAL_NAMES.length; j++) {
      expect(weighted.coefficients[j]!).toBeCloseTo(
        expectedOrthogonalCoefficient(rows, ORTHOGONAL_NAMES[j]!, alpha, lambda, weights[j]!),
        12,
      );
    }

    // Con α = 0,5 il peso entra sia nella soglia sia nel denominatore: le due
    // colonne pesate DEVONO muoversi, e quella a peso 1 restare dov'era.
    expect(weighted.coefficients[0]!).not.toBeCloseTo(uniform.coefficients[0]!, 6);
    expect(weighted.coefficients[1]!).not.toBeCloseTo(uniform.coefficients[1]!, 6);
    expect(weighted.coefficients[2]!).toBeCloseTo(uniform.coefficients[2]!, 12);
  });

  it("(f) il peso agisce anche sul ramo ridge puro (α = 0), dove la soglia morbida non esiste", () => {
    const rows = orthogonalRows();
    const fitted = fitElasticNet(rows, ORTHOGONAL_NAMES, { alpha: 0, lambda: 2 }, [0.5, 4, 1]);
    for (let j = 0; j < ORTHOGONAL_NAMES.length; j++) {
      expect(fitted.coefficients[j]!).toBeCloseTo(
        expectedOrthogonalCoefficient(rows, ORTHOGONAL_NAMES[j]!, 0, 2, [0.5, 4, 1][j]!),
        12,
      );
    }
  });

  it("(f) e sul ramo lasso puro (α = 1), dove il denominatore non dipende da λ", () => {
    const rows = orthogonalRows();
    const fitted = fitElasticNet(rows, ORTHOGONAL_NAMES, { alpha: 1, lambda: 0.8 }, [0.25, 2, 1]);
    for (let j = 0; j < ORTHOGONAL_NAMES.length; j++) {
      expect(fitted.coefficients[j]!).toBeCloseTo(
        expectedOrthogonalCoefficient(rows, ORTHOGONAL_NAMES[j]!, 1, 0.8, [0.25, 2, 1][j]!),
        12,
      );
    }
  });

  it("(b) un peso enorme spegne la sua feature e lascia le altre dove stavano", () => {
    const rows = orthogonalRows();
    const hyperparameters = { alpha: 0.5, lambda: 0.01 };
    const uniform = fitElasticNet(rows, ORTHOGONAL_NAMES, hyperparameters);
    const muted = fitElasticNet(rows, ORTHOGONAL_NAMES, hyperparameters, [1, 1e6, 1]);

    // La feature spenta portava segnale: senza il peso vale circa −3.
    expect(Math.abs(uniform.coefficients[1]!)).toBeGreaterThan(2.9);
    expect(muted.coefficients[1]!).toBe(0);

    expect(muted.coefficients[0]!).toBeCloseTo(uniform.coefficients[0]!, 12);
    expect(muted.coefficients[2]!).toBeCloseTo(uniform.coefficients[2]!, 12);
    // L'intercetta non e' penalizzata: resta la media del bersaglio.
    const targetMean = rows.reduce((sum, row) => sum + row.target, 0) / rows.length;
    expect(muted.intercept).toBeCloseTo(targetMean, 9);
  });

  it("(c) un peso < 1 shrinka MENO: il coefficiente cresce in valore assoluto", () => {
    const rows = orthogonalRows();
    const hyperparameters = { alpha: 0.5, lambda: 0.5 };
    const uniform = fitElasticNet(rows, ORTHOGONAL_NAMES, hyperparameters);
    const relieved = fitElasticNet(rows, ORTHOGONAL_NAMES, hyperparameters, [1, 0.1, 1]);

    expect(Math.abs(relieved.coefficients[1]!)).toBeGreaterThanOrEqual(Math.abs(uniform.coefficients[1]!));
    expect(Math.abs(relieved.coefficients[1]!)).toBeGreaterThan(Math.abs(uniform.coefficients[1]!));
    expect(relieved.coefficients[0]!).toBeCloseTo(uniform.coefficients[0]!, 12);
  });

  it("(c) |β| e' monotono non crescente nel peso di penalita'", () => {
    const rows = orthogonalRows();
    let previous = Number.POSITIVE_INFINITY;
    for (const weight of [0.1, 0.5, 1, 2, 10, 1000]) {
      const fitted = fitElasticNet(rows, ORTHOGONAL_NAMES, { alpha: 0.5, lambda: 0.5 }, [1, weight, 1]);
      const magnitude = Math.abs(fitted.coefficients[1]!);
      expect(magnitude).toBeLessThanOrEqual(previous + 1e-12);
      previous = magnitude;
    }
    expect(previous).toBeLessThan(0.1);
  });

  it("(d) rifiuta lunghezza sbagliata, peso ≤ 0 e peso non finito, con messaggi espliciti", () => {
    const rows = orthogonalRows();
    const hyperparameters = { alpha: 0.5, lambda: 0.4 };

    expect(() => fitElasticNet(rows, ORTHOGONAL_NAMES, hyperparameters, [1, 1])).toThrow(
      /penaltyWeights has 2 entries for 3 active features/,
    );
    expect(() => fitElasticNet(rows, ORTHOGONAL_NAMES, hyperparameters, [1, 1, 1, 1])).toThrow(/penaltyWeights has 4/);
    expect(() => fitElasticNet(rows, ORTHOGONAL_NAMES, hyperparameters, [])).toThrow(/penaltyWeights has 0/);

    for (const bad of [0, -1, -1e-12, NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => fitElasticNet(rows, ORTHOGONAL_NAMES, hyperparameters, [1, bad, 1])).toThrow(
        /finite and strictly positive/,
      );
    }
    // Il posto del peso rotto e' nel messaggio: un vettore lungo 130 non si
    // ispeziona a occhio.
    expect(() => fitElasticNet(rows, ORTHOGONAL_NAMES, hyperparameters, [1, 1, 0])).toThrow(/penaltyWeights\[2\]/);

    // La validazione avviene anche quando i pesi sono per il resto uniformi.
    expect(() => fitElasticNet(rows, ORTHOGONAL_NAMES, hyperparameters, [1, 1])).toThrow();
  });

  it("(e) roundtrip: i pesi si serializzano e la predizione dell'artefatto e' identica", () => {
    const rows = orthogonalRows();
    const weights = [0.5, 2, 1];
    const fitted = fitElasticNet(rows, ORTHOGONAL_NAMES, { alpha: 0.5, lambda: 0.3 }, weights);
    expect(fitted.penaltyWeights).toEqual(weights);

    const roundTripped = JSON.parse(JSON.stringify(fitted)) as typeof fitted;
    expect(roundTripped.penaltyWeights).toEqual(weights);
    expect(JSON.stringify(roundTripped)).toBe(JSON.stringify(fitted));

    const features = { x1: 1, x2: -1, x3: 1 };
    expect(predictWithElasticNet(roundTripped, features)).toBe(predictWithElasticNet(fitted, features));

    // E lo stesso artefatto passa dalla ricetta senza che nessuno debba
    // insegnarle il campo nuovo (§K, roundtrip `fit → serialize → apply`).
    const model: GenSerializedModel = { family: "FAM-2", parameters: roundTripped };
    expect(applyModel(model, { target: "T8", role: "A", features })).toBe(predictWithElasticNet(fitted, features));
  });

  it("(e) determinismo: due fit pesati identici sono byte-identici (§B.3.1)", () => {
    const a = fitElasticNet(orthogonalRows(), ORTHOGONAL_NAMES, { alpha: 0.5, lambda: 0.3 }, [0.5, 2, 1]);
    const b = fitElasticNet(orthogonalRows(), ORTHOGONAL_NAMES, { alpha: 0.5, lambda: 0.3 }, [0.5, 2, 1]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("un vettore uniforme diverso da 1 NON e' il caso uniforme: si serializza e cambia il fit", () => {
    const rows = orthogonalRows();
    const hyperparameters = { alpha: 0.5, lambda: 0.4 };
    const plain = fitElasticNet(rows, ORTHOGONAL_NAMES, hyperparameters);
    const doubled = fitElasticNet(rows, ORTHOGONAL_NAMES, hyperparameters, [2, 2, 2]);

    expect(doubled.penaltyWeights).toEqual([2, 2, 2]);
    expect(Math.abs(doubled.coefficients[1]!)).toBeLessThan(Math.abs(plain.coefficients[1]!));
    // `λ` resta quello dichiarato: il peso non lo riscrive nell'artefatto.
    expect(doubled.lambda).toBe(0.4);
  });

  it("il vettore serializzato e' una COPIA: mutarlo dopo il fit non tocca l'artefatto", () => {
    const weights = [0.5, 2, 1];
    const fitted = fitElasticNet(orthogonalRows(), ORTHOGONAL_NAMES, { alpha: 0.5, lambda: 0.3 }, weights);
    weights[1] = 999;
    expect(fitted.penaltyWeights).toEqual([0.5, 2, 1]);
  });

  it("una colonna a varianza nulla resta a 0 qualunque sia il suo peso", () => {
    const rows = orthogonalRows().map((row) => ({ ...row, features: { ...row.features, costante: 7 } }));
    const names = [...ORTHOGONAL_NAMES, "costante"];
    for (const weight of [1e-9, 1, 1e9]) {
      const fitted = fitElasticNet(rows, names, { alpha: 0.5, lambda: 0.4 }, [1, 1, 1, weight]);
      expect(fitted.coefficients[3]).toBe(0);
    }
  });
});

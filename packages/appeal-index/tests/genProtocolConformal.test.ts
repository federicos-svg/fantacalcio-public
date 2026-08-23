import { describe, it, expect } from "vitest";
import {
  CONFORMAL_LEVEL,
  buildConformalCoverageReport,
  conformalInterval,
  fitConformalRadiusByRole,
  quantileType7,
  type GenOofResidual,
} from "../src/genProtocol/conformal.js";

describe("genProtocol/conformal — quantile di tipo 7", () => {
  it("interpola linearmente fra gli ordini adiacenti (valori calcolati a mano)", () => {
    const xs = [1, 2, 3, 4];
    // h = (4−1)·0,5 = 1,5 -> 2 + 0,5·(3−2) = 2,5
    expect(quantileType7(xs, 0.5)).toBe(2.5);
    // h = 3·0,9 = 2,7 -> 3 + 0,7·(4−3) = 3,7
    expect(quantileType7(xs, 0.9)).toBeCloseTo(3.7, 12);
    expect(quantileType7(xs, 0)).toBe(1);
    expect(quantileType7(xs, 1)).toBe(4);
  });

  it("ordina l'input da solo e gestisce il caso a un valore", () => {
    expect(quantileType7([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(quantileType7([7], 0.9)).toBe(7);
  });

  it("e' monotono in p", () => {
    const xs = [5, 1, 9, 3, 7];
    let previous = -Infinity;
    for (const p of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const q = quantileType7(xs, p);
      expect(q).toBeGreaterThanOrEqual(previous);
      previous = q;
    }
  });

  it("rifiuta input vuoto, p fuori [0,1] e valori non finiti", () => {
    expect(() => quantileType7([], 0.5)).toThrow();
    expect(() => quantileType7([1, 2], 1.5)).toThrow();
    expect(() => quantileType7([1, NaN], 0.5)).toThrow();
  });
});

describe("genProtocol/conformal — q̂ per ruolo (§B.5)", () => {
  const residuals: GenOofResidual[] = [
    ...Array.from({ length: 10 }, (_, i) => ({ role: "D" as const, season: "2020_21", residual: i - 5 })),
    ...Array.from({ length: 10 }, (_, i) => ({ role: "A" as const, season: "2020_21", residual: (i - 5) * 4 })),
  ];

  it("il livello preregistrato e' 0,90", () => {
    expect(CONFORMAL_LEVEL).toBe(0.9);
  });

  it("calcola un raggio per ruolo e porta la sua n", () => {
    const fitted = fitConformalRadiusByRole(residuals);
    expect(fitted.level).toBe(0.9);
    expect(fitted.sampleSize.D).toBe(10);
    expect(fitted.sampleSize.A).toBe(10);
    expect(fitted.radius.P).toBeUndefined();
    // I valori assoluti dei residui D sono [5,4,3,2,1,0,1,2,3,4] -> ordinati
    // [0,1,1,2,2,3,3,4,4,5]; h = 9·0,9 = 8,1 -> 4 + 0,1·(5−4) = 4,1
    expect(fitted.radius.D).toBeCloseTo(4.1, 12);
  });

  it("NON usa un raggio pooled: il ruolo con errori piu' grandi ha un raggio piu' grande", () => {
    const fitted = fitConformalRadiusByRole(residuals);
    expect(fitted.radius.A!).toBeGreaterThan(fitted.radius.D!);
    expect(fitted.radius.A!).toBeCloseTo(4 * fitted.radius.D!, 9);
  });

  it("l'intervallo e' simmetrico attorno alla predizione", () => {
    expect(conformalInterval(10, 2)).toEqual({ lower: 8, upper: 12 });
    expect(() => conformalInterval(10, -1)).toThrow();
  });
});

describe("genProtocol/conformal — report di copertura per stagione e ruolo (§B.5)", () => {
  it("copre circa il livello dichiarato quando i residui vengono dalla stessa distribuzione", () => {
    const residuals: GenOofResidual[] = Array.from({ length: 100 }, (_, i) => ({
      role: "C" as const,
      season: "2020_21",
      residual: i - 50,
    }));
    const radius = fitConformalRadiusByRole(residuals);
    const rows = residuals.map((r, i) => ({
      role: r.role,
      season: i < 50 ? "2021_22" : "2022_23",
      actual: r.residual,
      prediction: 0,
    }));
    const report = buildConformalCoverageReport(rows, radius);
    expect(report.cells).toHaveLength(2);
    expect(report.cells.map((c) => c.season)).toEqual(["2021_22", "2022_23"]);
    expect(report.overallN).toBe(100);
    expect(report.overallCoverage).toBeGreaterThanOrEqual(0.85);
    for (const cell of report.cells) {
      expect(cell.n).toBe(50);
      expect(cell.radius).toBe(radius.radius.C);
    }
  });

  it("un raggio piu' grande copre non meno di uno piccolo (ordinamento)", () => {
    const rows = [
      { role: "D" as const, season: "2021_22", actual: 10, prediction: 0 },
      { role: "D" as const, season: "2021_22", actual: 1, prediction: 0 },
    ];
    const narrow = buildConformalCoverageReport(rows, { level: 0.9, radius: { D: 2 }, sampleSize: { D: 5 } });
    const wide = buildConformalCoverageReport(rows, { level: 0.9, radius: { D: 20 }, sampleSize: { D: 5 } });
    expect(narrow.overallCoverage).toBe(0.5);
    expect(wide.overallCoverage).toBe(1);
  });

  it("le righe di un ruolo senza q̂ sono CONTATE, non trattate come coperte", () => {
    const rows = [
      { role: "D" as const, season: "2021_22", actual: 1, prediction: 0 },
      { role: "P" as const, season: "2021_22", actual: 1, prediction: 0 },
      { role: "P" as const, season: "2021_22", actual: 9, prediction: 0 },
    ];
    const report = buildConformalCoverageReport(rows, { level: 0.9, radius: { D: 2 }, sampleSize: { D: 5 } });
    expect(report.rowsWithoutRadius).toBe(2);
    expect(report.overallN).toBe(1);
    expect(report.cells.map((c) => c.role)).toEqual(["D"]);
  });

  it("le celle sono ordinate per stagione e poi per ruolo canonico", () => {
    const rows = [
      { role: "A" as const, season: "2022_23", actual: 1, prediction: 0 },
      { role: "D" as const, season: "2021_22", actual: 1, prediction: 0 },
      { role: "A" as const, season: "2021_22", actual: 1, prediction: 0 },
    ];
    const report = buildConformalCoverageReport(rows, {
      level: 0.9,
      radius: { D: 2, A: 2 },
      sampleSize: { D: 5, A: 5 },
    });
    expect(report.cells.map((c) => `${c.season}/${c.role}`)).toEqual(["2021_22/D", "2021_22/A", "2022_23/A"]);
  });
});

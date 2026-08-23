// GEN-PROTOCOL-A §B.5 — incertezza: intervalli conformal split per ruolo. PURO.
//
// La regola, per intero: «Per T1/T2/T-N: intervalli conformal split per ruolo
// dai residui out-of-fold reali: `q̂_r = quantile(|residui OOF del ruolo r|,
// 0,90)`; intervallo = predizione ± `q̂_r`. Copertura dichiarata per stagione e
// ruolo. […] Ogni numero mostrato porta la propria `n`.»
//
// Perche' dai residui OOF e non dai residui di training: un residuo di
// training e' piccolo per costruzione — il modello ha visto quella riga — e un
// intervallo costruito su quelli sarebbe stretto esattamente dove non deve
// esserlo. Il residuo out-of-fold e' l'unico che misura l'errore su una riga
// che il modello non aveva.
//
// Perche' PER RUOLO: un portiere e un attaccante non hanno la stessa scala di
// errore, e un `q̂` pooled darebbe al portiere un intervallo preso in prestito
// dall'attaccante. §D.8 ricorda che il ruolo P e' «il piu' rotto e il piu'
// piccolo»: un intervallo che nasconde questo fatto e' peggio di nessun
// intervallo.

import { conformalCoverage } from "./metrics.js";
import { GEN_ROLES, type GenRole, type GenSeason } from "./genTypes.js";

/** Livello preregistrato del quantile conformal (§B.5). */
export const CONFORMAL_LEVEL = 0.9;

/**
 * Quantile di TIPO 7 (la convenzione di default di R e di `numpy.percentile`),
 * documentata perche' il protocollo dice «quantile» e non quale.
 *
 * Definizione: su `n` valori ordinati `x_0..x_{n-1}`, `h = (n−1)·p`, e il
 * risultato e' `x_⌊h⌋ + (h − ⌊h⌋)·(x_⌈h⌉ − x_⌊h⌋)` — interpolazione lineare
 * fra i due ordini adiacenti. Con `n = 1` restituisce l'unico valore.
 *
 * Il tipo 7 e' scelto e non subito: e' continuo in `p`, quindi il quantile non
 * salta quando una stagione aggiunge una riga, e questo evita che la copertura
 * dichiarata cambi a gradini per ragioni che non sono i dati.
 */
export function quantileType7(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error("quantileType7: empty input");
  if (!(p >= 0 && p <= 1)) throw new Error("quantileType7: p must be in [0, 1]");
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.some((v) => !Number.isFinite(v))) throw new Error("quantileType7: non-finite value in input");
  const n = sorted.length;
  if (n === 1) return sorted[0]!;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, n - 1);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}

/** Un residuo out-of-fold, con la sua etichetta di ruolo e stagione. */
export interface GenOofResidual {
  readonly role: GenRole;
  readonly season: GenSeason;
  /** `reale − predetto`; il valore assoluto e' cio' che entra nel quantile. */
  readonly residual: number;
}

export interface ConformalRadiusByRole {
  readonly level: number;
  /** `q̂_r` per ruolo. Un ruolo senza residui OOF non compare: non ha raggio, e non se ne inventa uno. */
  readonly radius: Readonly<Partial<Record<GenRole, number>>>;
  /** `n` per ruolo: §B.5 impone che ogni numero mostrato porti la propria `n`. */
  readonly sampleSize: Readonly<Partial<Record<GenRole, number>>>;
}

/** `q̂_r = quantile(|residui OOF del ruolo r|, 0,90)` (§B.5). */
export function fitConformalRadiusByRole(
  residuals: readonly GenOofResidual[],
  level: number = CONFORMAL_LEVEL,
): ConformalRadiusByRole {
  const radius: Partial<Record<GenRole, number>> = {};
  const sampleSize: Partial<Record<GenRole, number>> = {};
  for (const role of GEN_ROLES) {
    const absolute = residuals.filter((r) => r.role === role).map((r) => Math.abs(r.residual));
    if (absolute.length === 0) continue;
    radius[role] = quantileType7(absolute, level);
    sampleSize[role] = absolute.length;
  }
  return { level, radius, sampleSize };
}

export interface ConformalInterval {
  readonly lower: number;
  readonly upper: number;
}

/** Intervallo = predizione ± `q̂_r` (§B.5). Simmetrico per costruzione: e' un quantile di valori assoluti. */
export function conformalInterval(prediction: number, radius: number): ConformalInterval {
  if (!Number.isFinite(radius) || radius < 0) throw new Error("conformalInterval: radius must be finite and non-negative");
  return { lower: prediction - radius, upper: prediction + radius };
}

/** Una riga valutata per il report di copertura. */
export interface ConformalScoredRow {
  readonly role: GenRole;
  readonly season: GenSeason;
  readonly actual: number;
  readonly prediction: number;
}

export interface ConformalCoverageCell {
  readonly season: GenSeason;
  readonly role: GenRole;
  /** Quota di realizzati dentro l'intervallo. */
  readonly coverage: number;
  /** `n` della cella (§B.5). */
  readonly n: number;
  readonly radius: number;
}

export interface ConformalCoverageReport {
  readonly level: number;
  /** Ordinato per stagione e poi per ruolo canonico: due run devono stampare le stesse righe nello stesso ordine. */
  readonly cells: readonly ConformalCoverageCell[];
  /** Copertura complessiva sulle sole righe che hanno un raggio per il loro ruolo. */
  readonly overallCoverage: number;
  readonly overallN: number;
  /** Righe scartate perche' il loro ruolo non ha `q̂`: contate, mai ignorate (§D.7). */
  readonly rowsWithoutRadius: number;
}

/**
 * Copertura dichiarata per stagione e ruolo (§B.5).
 *
 * Le celle vuote non compaiono; le righe di un ruolo senza `q̂` sono contate a
 * parte invece di essere trattate come «coperte» o «non coperte», che sarebbe
 * in entrambi i casi un numero inventato.
 */
export function buildConformalCoverageReport(
  rows: readonly ConformalScoredRow[],
  radiusByRole: ConformalRadiusByRole,
): ConformalCoverageReport {
  const seasons = [...new Set(rows.map((r) => r.season))].sort();
  const cells: ConformalCoverageCell[] = [];
  const overallActual: number[] = [];
  const overallLower: number[] = [];
  const overallUpper: number[] = [];
  let rowsWithoutRadius = 0;

  for (const row of rows) {
    if (radiusByRole.radius[row.role] === undefined) rowsWithoutRadius++;
  }

  for (const season of seasons) {
    for (const role of GEN_ROLES) {
      const radius = radiusByRole.radius[role];
      if (radius === undefined) continue;
      const subset = rows.filter((r) => r.season === season && r.role === role);
      if (subset.length === 0) continue;
      const actual = subset.map((r) => r.actual);
      const lower = subset.map((r) => conformalInterval(r.prediction, radius).lower);
      const upper = subset.map((r) => conformalInterval(r.prediction, radius).upper);
      cells.push({ season, role, coverage: conformalCoverage(actual, lower, upper), n: subset.length, radius });
      overallActual.push(...actual);
      overallLower.push(...lower);
      overallUpper.push(...upper);
    }
  }

  return {
    level: radiusByRole.level,
    cells,
    overallCoverage: overallActual.length > 0 ? conformalCoverage(overallActual, overallLower, overallUpper) : NaN,
    overallN: overallActual.length,
    rowsWithoutRadius,
  };
}

// Fixture sintetiche per la curva storica rango→prezzo e per `P̂`
// (packages/engine/src/priceHistory.ts, packages/engine/src/expectedPrice.ts).
//
// NON è un file di test (non matcha la glob `*.test.ts` di Vitest): è il
// laboratorio deterministico su cui girano, come tests/layer2Fixtures.ts per lo
// strato 2. Zero dati reali — nessun nome di giocatore vero, nessun prezzo
// copiato da un'asta vera, nessuna stagione di una lega vera: le stagioni sono
// etichette sintetiche e i prezzi sono scelti perché i quantili si controllino
// a mano.

import {
  historicalPurchases,
  priceCurveBook,
  type HistoricalPurchaseInput,
  type PriceCurveBook,
  type PriceCurveOptions,
  type RankRow,
  type Role,
} from "../src/index.js";

/** Stagioni sintetiche, nel formato `YYYY/YY` che l'ordinamento richiede. */
export const SEASONS: readonly string[] = ["2021/22", "2022/23", "2023/24", "2024/25", "2025/26"];

/** Una stagione di una lega sintetica, per un solo ruolo. */
export interface SeasonSpec {
  readonly season: string;
  readonly role: Role;
  /**
   * I prezzi d'asta pagati in quella stagione per quel ruolo. L'ORDINE IN CUI
   * SI SCRIVONO NON CONTA: il rango storico lo dà il prezzo, decrescente.
   */
  readonly prices: readonly number[];
  /** I prezzi dei RINNOVI di quella stagione: fuori dalla curva, dentro il pool. */
  readonly renewals?: readonly number[];
}

export interface SyntheticHistory {
  readonly rows: readonly HistoricalPurchaseInput[];
  readonly roleByPlayerId: ReadonlyMap<string, Role>;
}

/**
 * Lo storico sintetico: righe nella forma che il client carica davvero
 * (stagione, giocatore, prezzo, tipo di acquisizione) più la mappa
 * giocatore→ruolo che il chiamante risolve dal listone.
 *
 * Costruito con `reduce`, mai scritto a mano riga per riga: una fixture
 * compilata a mano diverge dalla propria descrizione al primo ritocco.
 */
export function syntheticHistory(specs: readonly SeasonSpec[]): SyntheticHistory {
  const roleByPlayerId = new Map<string, Role>();
  const rows = specs.reduce<HistoricalPurchaseInput[]>((acc, spec) => {
    spec.prices.forEach((price, i) => {
      const playerId = `${spec.role}:${spec.season}:${i}`;
      roleByPlayerId.set(playerId, spec.role);
      acc.push({ season: spec.season, playerId, price, acquisition: "asta" });
    });
    (spec.renewals ?? []).forEach((price, i) => {
      const playerId = `${spec.role}:${spec.season}:rin${i}`;
      roleByPlayerId.set(playerId, spec.role);
      acc.push({ season: spec.season, playerId, price, acquisition: "riconferma" });
    });
    return acc;
  }, []);
  return { rows, roleByPlayerId };
}

/** Il libro delle curve da uno storico sintetico, in un passo solo. */
export function curveOf(
  specs: readonly SeasonSpec[],
  options: PriceCurveOptions = {},
): PriceCurveBook {
  const history = syntheticHistory(specs);
  return priceCurveBook(historicalPurchases(history.rows, history.roleByPlayerId).rows, options);
}

/** Una riga di listone come il rango la vede. `sold` esplicito, mai dedotto. */
export function rankRow(
  playerId: string,
  role: Role,
  total: number,
  appearances: number,
  sold = false,
): RankRow {
  return { playerId, role, forecast: { total, appearances }, sold };
}

/** Una riga di listone SENZA deposito servito: niente `T1̂`, quindi niente rango. */
export function rowWithoutForecast(playerId: string, role: Role, sold = false): RankRow {
  return { playerId, role, forecast: null, sold };
}

// ─── Scale di listone e di prezzo — per `V`, dove i ranghi devono arrivare a r* ──
//
// I ranghi di rimpiazzo del valore in crediti sono 25/73/73/57: una popolazione
// scritta a mano riga per riga non ci arriva, e una scritta a mano che ci
// arrivasse sarebbe illeggibile. Queste due scale la DERIVANO da una regola
// dichiarata — `T1̂` al rango, prezzo al rango — così la fixture dice la propria
// forma in una riga e resta vera al primo ritocco.

export interface RankLadderSpec {
  readonly role: Role;
  /** Quante righe di quel ruolo. */
  readonly count: number;
  /** `T1̂` al rango `r` (1-based, decrescente per costruzione della scala). */
  readonly totalAt: (rank: number) => number;
  /** `N̂` al rango `r`. Omesso: stagione piena (38). */
  readonly appearancesAt?: (rank: number) => number;
  /** Prefisso della chiave di listone. Omesso: il ruolo. */
  readonly prefix?: string;
}

/**
 * Le righe di listone di un ruolo, dal rango 1 al rango `count`.
 *
 * La chiave è numerata con lo zero-padding perché l'ordine alfabetico coincida
 * con l'ordine dei ranghi: l'ultimo pareggio di `roleRankBook` è `playerId`
 * crescente, e una fixture in cui `A:10` precede `A:2` renderebbe i pareggi
 * illeggibili invece che deterministici.
 */
export function rankLadder(spec: RankLadderSpec): RankRow[] {
  const prefix = spec.prefix ?? spec.role;
  return Array.from({ length: spec.count }, (_unused, i) => {
    const rank = i + 1;
    return rankRow(
      `${prefix}:${String(rank).padStart(3, "0")}`,
      spec.role,
      spec.totalAt(rank),
      spec.appearancesAt === undefined ? 38 : spec.appearancesAt(rank),
    );
  });
}

/**
 * I prezzi d'asta di una stagione, dal rango di prezzo 1 al rango `count`.
 * L'ordine in cui escono non conta (la curva ricalcola il rango dal prezzo):
 * conta che siano `count` prezzi generati dalla stessa regola dichiarata.
 */
export function priceLadder(count: number, priceAt: (rank: number) => number): number[] {
  return Array.from({ length: count }, (_unused, i) => priceAt(i + 1));
}

// GEN-PROTOCOL-A §B.4 punto 6 — bootstrap season-block delle differenze
// paired. PURO.
//
// La regola, per intero: «se l'evidenza non distingue B0 dal migliore
// candidato (differenza media dentro l'IC 95% del bootstrap season-block,
// 2.000 repliche, seed `20260902`): `NO_VERDICT`, si serve B0 e lo si scrive.»
//
// Perche' si ricampionano le STAGIONI e non le righe: le righe
// giocatore-stagione non sono repliche indipendenti — VAL-PROTOCOL-A §2 lo
// dice e §B.1 lo ripete vietando la cross-validation casuale per riga. Un
// bootstrap per riga produrrebbe intervalli stretti quanto si vuole
// semplicemente perche' ci sono migliaia di righe, e quegli intervalli
// direbbero «il candidato vince» su sette stagioni di evidenza travestite da
// migliaia. Il blocco e' la stagione perche' e' la stagione l'unita' che si
// ripete.
//
// Riuso dichiarato — e questa e' la parte che conta piu' del codice qui
// sotto: `MIN_SEASON_BLOCKS_FOR_INTERVAL` viene da `../phase4Selection.ts` e
// NON e' ridichiarata. Quella costante porta con se' un'analisi gia' scritta:
// sotto cinque blocchi il percentile bootstrap non e' «debole», e' un verdetto
// fortissimo fabbricato da un numero solo (con un blocco, tutte le repliche
// sono quel blocco e l'intervallo ha ampiezza zero, quindi «esclude lo zero»
// per qualunque valore non esattamente nullo). Ricopiarne il numero qui senza
// il ragionamento avrebbe prodotto, prima o poi, una versione con la soglia
// abbassata «perche' T3 ha solo due fold» — che e' esattamente il caso in cui
// la soglia serve. T3 con due fold ottiene infatti `null`, cioe' NO_VERDICT, e
// §B.1 lo aveva gia' scritto: «si dichiara subito che il potere statistico di
// T3 e' minimo e che la selezione di T3 pende strutturalmente verso la
// baseline».

import { MIN_SEASON_BLOCKS_FOR_INTERVAL } from "../phase4Selection.js";
import { mulberry32, nextIndex, GEN_SEEDS } from "./prng.js";
import { quantileType7 } from "./conformal.js";

/** Repliche preregistrate (§B.4 punto 6, §D.14). */
export const GEN_BOOTSTRAP_REPLICATES = 2000;

/** Seed preregistrato del bootstrap (§C). */
export const GEN_BOOTSTRAP_SEED = GEN_SEEDS.bootstrap;

/** Soglia minima di blocchi, riusata da `phase4Selection.ts` — vedi l'intestazione. */
export { MIN_SEASON_BLOCKS_FOR_INTERVAL };

export interface GenBootstrapOptions {
  readonly replicates?: number;
  readonly seed?: number;
  /** Livello dell'intervallo percentile. 0,95 e' quello del protocollo. */
  readonly level?: number;
}

export interface GenBootstrapInterval {
  /** `null` quando i blocchi sono meno di `MIN_SEASON_BLOCKS_FOR_INTERVAL`: nessuna evidenza, non un intervallo stretto. */
  readonly lower: number | null;
  readonly upper: number | null;
  /** Media osservata dei blocchi — il punto di cui l'intervallo dice l'incertezza. */
  readonly observedMean: number;
  readonly blocks: number;
  readonly replicates: number;
  readonly seed: number;
  readonly level: number;
  /** `true` quando l'intervallo e' stato RIFIUTATO per pochi blocchi. */
  readonly insufficientBlocks: boolean;
  /** `true` se l'intervallo esiste e contiene lo zero: e' la condizione di `NO_VERDICT` (§B.4.6). */
  readonly containsZero: boolean;
}

/**
 * Percentile bootstrap sulle medie di blocchi ricampionati con reimmissione.
 *
 * PRNG `mulberry32` col seed passato dal chiamante (§C): il seed non e'
 * hard-coded dentro la funzione perche' il protocollo ne preregistra tre
 * diversi per tre usi diversi, e una funzione che ne conosce uno solo
 * costringerebbe gli altri due a reimplementarla.
 *
 * Ordine di estrazione fissato: `replicates` repliche, ciascuna di `blocks`
 * estrazioni consecutive dallo stream. Due esecuzioni con lo stesso seed danno
 * gli stessi byte — che e' cio' che §B.3.1 chiede di dimostrare, non di
 * dichiarare.
 */
export function seasonBlockBootstrap(
  blockValues: readonly number[],
  options: GenBootstrapOptions = {},
): GenBootstrapInterval {
  const replicates = options.replicates ?? GEN_BOOTSTRAP_REPLICATES;
  const seed = options.seed ?? GEN_BOOTSTRAP_SEED;
  const level = options.level ?? 0.95;
  if (!Number.isInteger(replicates) || replicates < 1) throw new Error("seasonBlockBootstrap: replicates must be a positive integer");
  if (!(level > 0 && level < 1)) throw new Error("seasonBlockBootstrap: level must be in (0, 1)");
  if (blockValues.length === 0) throw new Error("seasonBlockBootstrap: no blocks");
  if (blockValues.some((v) => !Number.isFinite(v))) throw new Error("seasonBlockBootstrap: non-finite block value");

  let sum = 0;
  for (const v of blockValues) sum += v;
  const observedMean = sum / blockValues.length;

  const base = {
    observedMean,
    blocks: blockValues.length,
    replicates,
    seed,
    level,
  };

  if (blockValues.length < MIN_SEASON_BLOCKS_FOR_INTERVAL) {
    return { ...base, lower: null, upper: null, insufficientBlocks: true, containsZero: false };
  }

  const random = mulberry32(seed);
  const draws = new Array<number>(replicates);
  for (let r = 0; r < replicates; r++) {
    let acc = 0;
    for (let b = 0; b < blockValues.length; b++) acc += blockValues[nextIndex(random, blockValues.length)]!;
    draws[r] = acc / blockValues.length;
  }
  const tail = (1 - level) / 2;
  const lower = quantileType7(draws, tail);
  const upper = quantileType7(draws, 1 - tail);
  return { ...base, lower, upper, insufficientBlocks: false, containsZero: lower <= 0 && upper >= 0 };
}

/**
 * Le differenze PAIRED per blocco, candidato meno baseline (§B.4: «Confronti
 * sempre paired sugli stessi fold»).
 *
 * Negativo = il candidato sbaglia meno. Il segno e' fissato qui una volta per
 * tutte perche' un confronto in cui i due lati non concordano su chi sta
 * davanti e' un confronto che dice il contrario di quello che si crede.
 */
export function pairedBlockDifferences(
  candidatePerBlock: readonly number[],
  baselinePerBlock: readonly number[],
): readonly number[] {
  if (candidatePerBlock.length !== baselinePerBlock.length || candidatePerBlock.length === 0) {
    throw new Error("pairedBlockDifferences: candidate and baseline must cover the same non-empty set of blocks");
  }
  return candidatePerBlock.map((value, i) => value - baselinePerBlock[i]!);
}

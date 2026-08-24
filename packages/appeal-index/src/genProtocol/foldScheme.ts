// GEN-PROTOCOL-A §B.1 — lo schema di validazione: il tempo comanda. PURO.
//
// Perche' un modulo suo: i tre schemi del protocollo (stagioni per T1/T2/T-N/
// T-D/T6, aste per T3, coorti d'arrivo per T8) sembrano tre costruzioni
// diverse e sono la STESSA costruzione — finestra espandente su blocchi
// ordinati nel tempo, con i blocchi sigillati esclusi per identita' e non
// dedotti da «il piu' recente». Scriverla tre volte significherebbe avere tre
// occasioni di sbagliarla, e §B.1 vieta esattamente il tipo di errore che ne
// verrebbe fuori («qualunque split che metta il futuro nel passato»).
//
// Rapporto con `buildWalkForwardSplit` (`../validation.ts`), dichiarato:
// quello e' lo stesso schema, ma tipizzato sulla `FeatureRow` legacy a
// vettore fisso, che le righe del generatore non sono. Qui c'e' la stessa
// regola resa generica sul tipo di riga — e la coincidenza NON e' assunta:
// `genProtocolFoldScheme.test.ts` fa girare i due costruttori sulle stesse
// etichette di stagione e dimostra che la tabella dei 7 fold e' identica,
// riga per riga, a quella di §B.1.
//
// Il fold INTERNO (§D.2) nasce qui e non in `internalTuning.ts` per una
// ragione di confine: e' una proprieta' del fold, cioe' del disegno
// sperimentale, non della procedura che sceglie gli iperparametri. Se lo
// costruisse chi tuna, chi tuna potrebbe cambiarlo.

import { FORBIDDEN_SEASON } from "../phase4Protocol.js";
import { seasonYear } from "../identityStability.js";
import type { GenSeason } from "./genTypes.js";

/**
 * Il fold interno di §D.2: l'ULTIMA stagione del training del fold esterno fa
 * da validazione, il resto del training da train interno.
 *
 * Esempio del protocollo: fold di test 2021/22 -> interno 2020/21, train
 * interno il resto. Con `minTrainBlocks = 2` il train interno non e' mai
 * vuoto; se un chiamante abbassa quella soglia a 1, `trainRows` qui e' vuoto e
 * chi fitta fallisce rumorosamente invece di tunare su niente.
 */
export interface GenInnerFold<TRow> {
  readonly validationBlock: string;
  readonly trainRows: readonly TRow[];
  readonly validationRows: readonly TRow[];
}

/** Un fold esterno: blocco di test, blocchi di training, e il suo fold interno. */
export interface GenFold<TRow> {
  /** 1-based, nell'ordine della tabella di §B.1. */
  readonly foldIndex: number;
  readonly testBlock: string;
  /** In ordine temporale crescente; l'ultimo e' la validazione interna. */
  readonly trainBlocks: readonly string[];
  readonly trainRows: readonly TRow[];
  readonly testRows: readonly TRow[];
  readonly inner: GenInnerFold<TRow>;
}

export interface GenBlockFoldOptions {
  /**
   * Blocchi di training minimi prima del primo fold. 2 e' il valore del
   * protocollo: §B.1 fa partire i fold stagionali dal test 2018/19 con
   * 2016/17–2017/18 in training, e i fold d'asta da `a3` con `a1–a2`.
   */
  readonly minTrainBlocks?: number;
  /**
   * Blocchi SIGILLATI, esclusi per identita' da train e test (§F). Non si
   * deduce «il piu' recente»: la stagione bruciata e' un nome, non una
   * posizione — stessa scelta di `buildWalkForwardSplit`.
   */
  readonly sealedBlocks?: readonly string[];
}

const DEFAULT_MIN_TRAIN_BLOCKS = 2;

/**
 * Il costruttore unico: finestra espandente su `blockOrder`.
 *
 * `blockOrder` e' l'ordine TEMPORALE dichiarato dal chiamante (per le stagioni
 * lo deriva `buildSeasonFolds` da `seasonYear`). Un blocco presente nelle
 * righe ma assente dall'ordine e' un errore, non un blocco da mettere in
 * fondo: indovinare dove sta nel tempo e' esattamente il modo in cui il futuro
 * finisce nel passato.
 */
export function buildBlockFolds<TRow>(
  rows: readonly TRow[],
  blockOf: (row: TRow) => string,
  blockOrder: readonly string[],
  options: GenBlockFoldOptions = {},
): readonly GenFold<TRow>[] {
  const minTrainBlocks = options.minTrainBlocks ?? DEFAULT_MIN_TRAIN_BLOCKS;
  if (!Number.isInteger(minTrainBlocks) || minTrainBlocks < 1) {
    throw new Error("buildBlockFolds: minTrainBlocks must be a positive integer");
  }
  const sealed = new Set(options.sealedBlocks ?? []);
  const known = new Set(blockOrder);
  for (const row of rows) {
    const block = blockOf(row);
    if (!known.has(block) && !sealed.has(block)) {
      throw new Error(`buildBlockFolds: block '${block}' is not in the declared block order`);
    }
  }

  const evaluable = blockOrder.filter((b) => !sealed.has(b));
  const byBlock = new Map<string, TRow[]>();
  for (const row of rows) {
    const block = blockOf(row);
    if (sealed.has(block)) continue;
    const bucket = byBlock.get(block);
    if (bucket === undefined) byBlock.set(block, [row]);
    else bucket.push(row);
  }

  const folds: GenFold<TRow>[] = [];
  for (let i = minTrainBlocks; i < evaluable.length; i++) {
    const testBlock = evaluable[i]!;
    const trainBlocks = evaluable.slice(0, i);
    const testRows = byBlock.get(testBlock) ?? [];
    const trainRows = trainBlocks.flatMap((b) => byBlock.get(b) ?? []);
    if (trainRows.length === 0 || testRows.length === 0) continue;
    const validationBlock = trainBlocks[trainBlocks.length - 1]!;
    folds.push({
      foldIndex: folds.length + 1,
      testBlock,
      trainBlocks,
      trainRows,
      testRows,
      inner: {
        validationBlock,
        trainRows: trainBlocks.slice(0, -1).flatMap((b) => byBlock.get(b) ?? []),
        validationRows: byBlock.get(validationBlock) ?? [],
      },
    });
  }
  return folds;
}

/** La stagione sigillata: holdout di §F, mai in training ne' in test prima dell'apertura. */
export const GEN_SEALED_SEASON = FORBIDDEN_SEASON;

/** Minimo che una riga deve portare per essere assegnata a un fold stagionale. */
export interface GenSeasonKeyedRow {
  readonly targetSeason: GenSeason;
}

/**
 * I 7 fold stagionali di §B.1 (test 2018/19 -> 2024/25, training espandente da
 * 2016/17).
 *
 * L'ordine dei blocchi si deriva da `seasonYear`, non dall'ordine di arrivo
 * delle righe: due dataset con le stesse stagioni in ordine diverso devono
 * produrre gli stessi fold, o il determinismo di §B.3.1 e' una parola.
 */
export function buildSeasonFolds<TRow extends GenSeasonKeyedRow>(
  rows: readonly TRow[],
  options: GenBlockFoldOptions = {},
): readonly GenFold<TRow>[] {
  const seasons = [...new Set(rows.map((r) => r.targetSeason))].sort((a, b) => seasonYear(a) - seasonYear(b));
  return buildBlockFolds(rows, (r) => r.targetSeason, seasons, {
    minTrainBlocks: options.minTrainBlocks,
    sealedBlocks: options.sealedBlocks ?? [GEN_SEALED_SEASON],
  });
}

/** Una riga d'asta: il blocco e' l'asta in cui il prezzo si e' formato (§B.1, T3). */
export interface GenAuctionKeyedRow {
  readonly auction: string;
}

/**
 * I 2 fold d'asta di T3: test `a3` con train `a1–a2`, test `a4` con train
 * `a1–a3` (§B.1).
 *
 * `a5` (asta 2025/26) e' la fetta sigillata di T3 e va passata in
 * `sealedBlocks` dal chiamante: qui non si indovina quale asta sia la piu'
 * recente. Due soli fold sono un potere statistico dichiaratamente minimo —
 * il protocollo lo scrive prima di guardare i numeri, e la regola 1-SE fa il
 * resto (§B.4).
 */
export function buildAuctionFolds<TRow extends GenAuctionKeyedRow>(
  rows: readonly TRow[],
  auctionOrder: readonly string[],
  options: GenBlockFoldOptions = {},
): readonly GenFold<TRow>[] {
  return buildBlockFolds(rows, (r) => r.auction, auctionOrder, {
    minTrainBlocks: options.minTrainBlocks,
    sealedBlocks: options.sealedBlocks ?? [],
  });
}

/** Una riga di coorte d'arrivo: il blocco e' l'estate in cui il giocatore e' arrivato (§B.1, T8). */
export interface GenCohortKeyedRow {
  readonly cohort: string;
}

/**
 * I fold per coorti di T8: test = coorte dell'estate `t`, train = coorti
 * `< t`, «per `t` dal terzo anno di coorte in poi» (§B.1) — cioe' la stessa
 * finestra espandente con 2 blocchi minimi di training.
 *
 * La coorte 2025 e' la fetta sigillata di T8: la dichiara il chiamante, come
 * per le aste.
 */
export function buildCohortFolds<TRow extends GenCohortKeyedRow>(
  rows: readonly TRow[],
  cohortOrder: readonly string[],
  options: GenBlockFoldOptions = {},
): readonly GenFold<TRow>[] {
  return buildBlockFolds(rows, (r) => r.cohort, cohortOrder, {
    minTrainBlocks: options.minTrainBlocks,
    sealedBlocks: options.sealedBlocks ?? [],
  });
}

/**
 * La griglia degli half-life di recency (§B.1, §D.2): `{1,5; 3; ∞}`.
 *
 * `Infinity` non e' un valore sentinella scelto per comodita': e' la lettura
 * esatta di `0,5^{Δ/∞} = 0,5^0 = 1`, cioe' pesi uniformi. Il codice lo calcola
 * cosi', non con un ramo `if` che «significa» pesi uniformi.
 */
export const GEN_HALF_LIFE_GRID: readonly number[] = [1.5, 3, Number.POSITIVE_INFINITY] as const;

/**
 * Peso di recency di §B.1: `w = 0,5^{(anno_ultima_stagione_train − anno_riga)/h}`.
 *
 * `referenceSeason` e' l'ULTIMA stagione del training del fold, mai la
 * stagione di test: il peso e' una scelta appresa dentro il training fold
 * (§B.1, «la scelta avviene solo dentro il training fold, mai sul fold di
 * test»), e ancorarlo al test la porterebbe fuori.
 */
export function recencyWeight(rowSeason: GenSeason, referenceSeason: GenSeason, halfLife: number): number {
  if (!(halfLife > 0)) throw new Error("recencyWeight: halfLife must be positive (use Infinity for uniform weights)");
  const delta = seasonYear(referenceSeason) - seasonYear(rowSeason);
  if (!Number.isFinite(halfLife)) return 1;
  return Math.pow(0.5, delta / halfLife);
}

/** L'ultima stagione (o asta, o coorte) del training di un fold: l'ancora dei pesi di recency. */
export function foldReferenceBlock<TRow>(fold: GenFold<TRow>): string {
  const last = fold.trainBlocks[fold.trainBlocks.length - 1];
  if (last === undefined) throw new Error("foldReferenceBlock: fold has no training blocks");
  return last;
}

/** I pesi di recency delle righe di training di un fold stagionale, nello stesso ordine delle righe. */
export function foldRecencyWeights<TRow extends GenSeasonKeyedRow>(
  fold: GenFold<TRow>,
  halfLife: number,
): readonly number[] {
  const reference = foldReferenceBlock(fold);
  return fold.trainRows.map((r) => recencyWeight(r.targetSeason, reference, halfLife));
}

// GEN-PROTOCOL-A §D.2 — FAM-4, boosted stumps deterministici. PURO.
//
// La famiglia, per intero: «gradient boosting su alberi di profondita' ≤ 2:
// deterministico (niente subsampling), learning rate ∈ {0,05; 0,1},
// profondita' ∈ {1, 2} interni; M ≤ 300 alberi con early-stop sul fold
// interno. Solo ruoli D/C/A, solo set S2, un candidato esterno per bersaglio.
// E' l'unico challenger non lineare: se le interazioni contano, emerge qui; se
// non batte FAM-2, il dominio e' lineare-con-shrinkage e lo si scrive.»
//
// Il ruolo di questa famiglia nel disegno e' quindi FALSIFICARE, non vincere:
// §D.5 dichiara in anticipo che se FAM-4 batte FAM-2 fuori dalla regola 1-SE
// su ≥ 2 bersagli, la scelta stessa delle famiglie era sbagliata e la v2.0.0
// deve allargare il ramo non lineare. Perche' quella prova valga, la famiglia
// dev'essere implementata bene, non implementata perche' perda.
//
// Perche' niente subsampling: e' il protocollo a vietarlo, e la ragione e'
// §B.3.1 — il determinismo e' ammissibilita'. Uno stochastic gradient boosting
// con seed sarebbe riproducibile ma renderebbe il confronto paired dipendente
// da un seed, cioe' da una scelta che nessuna delle due parti del confronto
// controlla.
//
// La perdita e' L1, come la perdita primaria di §B.2: gradiente = segno del
// residuo, foglie = mediana (pesata) dei residui della foglia. Un boosting L2
// con selezione L1 ottimizzerebbe una cosa e verrebbe giudicato su un'altra.

/** Learning rate interni (§D.2, FAM-4). */
export const BOOSTED_LEARNING_RATE_GRID: readonly number[] = [0.05, 0.1] as const;

/** Profondita' interne (§D.2, FAM-4): 1 = stump puro, 2 = una interazione. */
export const BOOSTED_DEPTH_GRID: readonly number[] = [1, 2] as const;

/** Tetto di alberi (§D.2: «M ≤ 300 alberi»). */
export const BOOSTED_MAX_TREES = 300;

/** Pazienza dell'early-stop sul fold interno, in alberi. */
export const BOOSTED_EARLY_STOP_PATIENCE = 20;

/** Bin per quantili del train su cui gli split sono esatti. */
export const BOOSTED_QUANTILE_BINS = 32;

export interface BoostedStumpsHyperparameters {
  readonly learningRate: number;
  readonly depth: number;
  /** Tetto di alberi; l'early-stop puo' fermarsi prima. Default `BOOSTED_MAX_TREES`. */
  readonly maxTrees?: number;
}

/** La griglia interna di FAM-4: 2 × 2 = 4 punti, in ordine di enumerazione. */
export const BOOSTED_STUMPS_GRID: readonly BoostedStumpsHyperparameters[] = BOOSTED_LEARNING_RATE_GRID.flatMap(
  (learningRate) => BOOSTED_DEPTH_GRID.map((depth) => ({ learningRate, depth })),
);

export interface BoostedTrainingRow {
  readonly features: Readonly<Record<string, number>>;
  readonly target: number;
  /** Peso riga = recency (§B.1) × peso N (§B.2). Assente = 1. */
  readonly weight?: number;
}

/**
 * Un nodo dell'albero, in forma piatta e serializzabile («lista nodi»).
 *
 * `featureIndex === -1` marca una foglia: `value` e' il suo contributo, gia'
 * moltiplicato per il learning rate. Un nodo interno manda a sinistra le righe
 * con `binIndex <= threshold`.
 */
export interface BoostedNode {
  readonly featureIndex: number;
  readonly threshold: number;
  readonly left: number;
  readonly right: number;
  readonly value: number;
}

export interface FittedBoostedStumpsParameters {
  readonly artifactVersion: "gen-boosted-stumps-parameters-v1";
  readonly featureNames: readonly string[];
  /** Tagli per feature, dai quantili del TRAIN: `binEdges[j]` ha ≤ 31 elementi crescenti. */
  readonly binEdges: readonly (readonly number[])[];
  readonly quantileBins: number;
  /** Costante iniziale: la mediana pesata del bersaglio, ottimo L1 a modello vuoto. */
  readonly baseValue: number;
  readonly learningRate: number;
  readonly depth: number;
  readonly maxTrees: number;
  /** Gli alberi effettivamente serviti, gia' troncati all'iterazione migliore. */
  readonly trees: readonly (readonly BoostedNode[])[];
  /** Numero di alberi dopo il troncamento (= `trees.length`). */
  readonly treeCount: number;
  /** MAE di validazione per iterazione, se un fold interno e' stato passato. */
  readonly validationLossByIteration: readonly number[];
  readonly earlyStopped: boolean;
  readonly patience: number;
  readonly trainingRowCount: number;
  readonly excludedRowCount: number;
  readonly excludedForMissingFeature: number;
  readonly excludedForMissingTarget: number;
  readonly excludedForInvalidWeight: number;
}

/**
 * Mediana pesata «bassa»: il piu' piccolo valore il cui peso cumulato
 * raggiunge meta' del peso totale. Deterministica anche con pesi pari, che e'
 * il motivo per cui non si interpola fra i due valori centrali.
 */
export function weightedMedian(values: readonly number[], weights: readonly number[]): number {
  if (values.length !== weights.length || values.length === 0) {
    throw new Error("weightedMedian: length mismatch or empty input");
  }
  const order = values.map((v, i) => i).sort((a, b) => values[a]! - values[b]! || a - b);
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) throw new Error("weightedMedian: zero total weight");
  let cumulative = 0;
  for (const i of order) {
    cumulative += weights[i]!;
    if (cumulative * 2 >= total) return values[i]!;
  }
  return values[order[order.length - 1]!]!;
}

/** Quantile di tipo 7 su un array GIA' ordinato — la stessa convenzione di `conformal.ts`. */
function quantileOfSorted(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0) throw new Error("quantileOfSorted: empty input");
  if (n === 1) return sorted[0]!;
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, n - 1);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}

/**
 * Tagli per quantili del train, `BOOSTED_QUANTILE_BINS` bin -> ≤ 31 tagli.
 *
 * I duplicati si collassano: una feature con pochi valori distinti (un flag,
 * per esempio) produce pochi tagli, e va bene cosi'. Forzare 31 tagli su un
 * flag creerebbe split che non separano nulla e farebbero perdere tempo a ogni
 * albero.
 */
export function quantileBinEdges(values: readonly number[], bins: number = BOOSTED_QUANTILE_BINS): readonly number[] {
  if (!Number.isInteger(bins) || bins < 2) throw new Error("quantileBinEdges: bins must be an integer >= 2");
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const max = sorted[sorted.length - 1]!;
  const edges: number[] = [];
  for (let k = 1; k < bins; k++) {
    const edge = quantileOfSorted(sorted, k / bins);
    // Un taglio pari al massimo non separa nulla (`binIndexOf` conta i tagli
    // STRETTAMENTE sotto il valore): una colonna costante ha quindi zero tagli,
    // che e' il modo onesto di dire «qui non c'e' niente da dividere».
    if (edge >= max) continue;
    if (edges.length === 0 || edge > edges[edges.length - 1]!) edges.push(edge);
  }
  return edges;
}

/** Indice di bin: quanti tagli stanno STRETTAMENTE sotto il valore. In `[0, edges.length]`. */
export function binIndexOf(value: number, edges: readonly number[]): number {
  let count = 0;
  for (const edge of edges) {
    if (value > edge) count++;
    else break;
  }
  return count;
}

interface SplitCandidate {
  readonly featureIndex: number;
  readonly threshold: number;
  readonly gain: number;
}

/**
 * Miglior split su gradiente, criterio SSE pesato: massimizza
 * `S_L²/W_L + S_R²/W_R` con `S = Σ w·g`.
 *
 * Pareggi: vince il primo incontrato, cioe' la feature di indice piu' basso e,
 * a parita', il taglio piu' basso. E' l'unica regola che rende lo stesso
 * dataset -> lo stesso albero su qualunque macchina.
 */
function bestSplit(
  indices: readonly number[],
  bins: readonly (readonly number[])[],
  gradients: readonly number[],
  weights: readonly number[],
  edgeCounts: readonly number[],
): SplitCandidate | null {
  let best: SplitCandidate | null = null;
  for (let j = 0; j < edgeCounts.length; j++) {
    const nBins = edgeCounts[j]! + 1;
    if (nBins < 2) continue;
    const sumW = new Array<number>(nBins).fill(0);
    const sumWG = new Array<number>(nBins).fill(0);
    for (const i of indices) {
      const b = bins[i]![j]!;
      sumW[b] = sumW[b]! + weights[i]!;
      sumWG[b] = sumWG[b]! + weights[i]! * gradients[i]!;
    }
    let totalW = 0;
    let totalWG = 0;
    for (let b = 0; b < nBins; b++) {
      totalW += sumW[b]!;
      totalWG += sumWG[b]!;
    }
    if (totalW <= 0) continue;
    let leftW = 0;
    let leftWG = 0;
    for (let t = 0; t < nBins - 1; t++) {
      leftW += sumW[t]!;
      leftWG += sumWG[t]!;
      const rightW = totalW - leftW;
      if (leftW <= 0 || rightW <= 0) continue;
      const gain = (leftWG * leftWG) / leftW + ((totalWG - leftWG) * (totalWG - leftWG)) / rightW;
      if (best === null || gain > best.gain) best = { featureIndex: j, threshold: t, gain };
    }
  }
  return best;
}

/**
 * Fitta FAM-4.
 *
 * `validationRows` e' il FOLD INTERNO (§D.2): se c'e', l'early-stop legge il
 * MAE di validazione dopo ogni albero e tronca il modello all'iterazione
 * migliore dopo `BOOSTED_EARLY_STOP_PATIENCE` alberi senza miglioramento. Se
 * non c'e', si fitta fino a `maxTrees` — e sta al chiamante sapere che ha
 * rinunciato a un iperparametro che il protocollo vuole scelto dentro il
 * training fold.
 *
 * Le righe con `NaN` su una feature del set attivo escono dal fit e vengono
 * contate, esattamente come in `elasticNet.ts`: una sola politica di
 * missingness per tutte le famiglie, o i loro conteggi di coverage non sono
 * confrontabili (§B.3.2, §D.7).
 */
export function fitBoostedStumps(
  trainRows: readonly BoostedTrainingRow[],
  featureNames: readonly string[],
  hyperparameters: BoostedStumpsHyperparameters,
  validationRows: readonly BoostedTrainingRow[] = [],
): FittedBoostedStumpsParameters {
  if (featureNames.length === 0) throw new Error("fitBoostedStumps: empty active feature set");
  if (new Set(featureNames).size !== featureNames.length) {
    throw new Error("fitBoostedStumps: duplicate names in the active feature set");
  }
  const { learningRate, depth } = hyperparameters;
  const maxTrees = hyperparameters.maxTrees ?? BOOSTED_MAX_TREES;
  if (!Number.isFinite(learningRate) || learningRate <= 0) throw new Error("fitBoostedStumps: learningRate must be positive");
  if (!Number.isInteger(depth) || depth < 1 || depth > 2) {
    throw new Error("fitBoostedStumps: depth must be 1 or 2 (GEN-PROTOCOL-A §D.2 caps trees at depth 2)");
  }
  if (!Number.isInteger(maxTrees) || maxTrees < 1 || maxTrees > BOOSTED_MAX_TREES) {
    throw new Error(`fitBoostedStumps: maxTrees must be an integer in [1, ${BOOSTED_MAX_TREES}]`);
  }

  const usable = collectUsableRows(trainRows, featureNames);
  if (usable.X.length === 0) throw new Error("fitBoostedStumps: no usable training rows after exclusions");
  const validation = collectUsableRows(validationRows, featureNames);

  const binEdges = featureNames.map((_, j) => quantileBinEdges(usable.X.map((row) => row[j]!)));
  const edgeCounts = binEdges.map((e) => e.length);
  const trainBins = usable.X.map((row) => row.map((v, j) => binIndexOf(v, binEdges[j]!)));
  const validationBins = validation.X.map((row) => row.map((v, j) => binIndexOf(v, binEdges[j]!)));

  const n = usable.X.length;
  const baseValue = weightedMedian(usable.y, usable.w);
  const predictions = new Array<number>(n).fill(baseValue);
  const validationPredictions = new Array<number>(validation.X.length).fill(baseValue);

  const trees: (readonly BoostedNode[])[] = [];
  const validationLossByIteration: number[] = [];
  let bestIteration = 0;
  let bestValidationLoss = Number.POSITIVE_INFINITY;
  let earlyStopped = false;

  if (validation.X.length > 0) {
    bestValidationLoss = meanAbsolute(validation.y, validationPredictions, validation.w);
  }

  for (let m = 0; m < maxTrees; m++) {
    const residuals = usable.y.map((yi, i) => yi - predictions[i]!);
    const gradients = residuals.map((r) => Math.sign(r)); // L1: il gradiente e' il segno
    if (gradients.every((g) => g === 0)) break; // residui tutti nulli: non c'e' altro da imparare

    const tree = growTree(trainBins, gradients, residuals, usable.w, edgeCounts, depth, learningRate);
    if (tree === null) break; // nessuno split possibile: la griglia dei bin non separa piu' nulla
    trees.push(tree);
    for (let i = 0; i < n; i++) predictions[i] = predictions[i]! + leafValue(tree, trainBins[i]!);

    if (validation.X.length > 0) {
      for (let i = 0; i < validationPredictions.length; i++) {
        validationPredictions[i] = validationPredictions[i]! + leafValue(tree, validationBins[i]!);
      }
      const loss = meanAbsolute(validation.y, validationPredictions, validation.w);
      validationLossByIteration.push(loss);
      if (loss < bestValidationLoss) {
        bestValidationLoss = loss;
        bestIteration = trees.length;
      } else if (trees.length - bestIteration >= BOOSTED_EARLY_STOP_PATIENCE) {
        earlyStopped = true;
        break;
      }
    }
  }

  const kept = validation.X.length > 0 ? trees.slice(0, bestIteration) : trees;

  return {
    artifactVersion: "gen-boosted-stumps-parameters-v1",
    featureNames: [...featureNames],
    binEdges,
    quantileBins: BOOSTED_QUANTILE_BINS,
    baseValue,
    learningRate,
    depth,
    maxTrees,
    trees: kept,
    treeCount: kept.length,
    validationLossByIteration,
    earlyStopped,
    patience: BOOSTED_EARLY_STOP_PATIENCE,
    trainingRowCount: n,
    excludedRowCount:
      usable.excludedForMissingFeature + usable.excludedForMissingTarget + usable.excludedForInvalidWeight,
    excludedForMissingFeature: usable.excludedForMissingFeature,
    excludedForMissingTarget: usable.excludedForMissingTarget,
    excludedForInvalidWeight: usable.excludedForInvalidWeight,
  };
}

/**
 * Predice da un artefatto serializzato. Feature attiva assente o `NaN` ->
 * `NaN`, come in `elasticNet.ts`: la riga non e' scorata e la coverage lo dice.
 */
export function predictWithBoostedStumps(
  parameters: FittedBoostedStumpsParameters,
  features: Readonly<Record<string, number>>,
): number {
  const bins: number[] = [];
  for (let j = 0; j < parameters.featureNames.length; j++) {
    const raw = features[parameters.featureNames[j]!];
    if (raw === undefined || !Number.isFinite(raw)) return NaN;
    bins.push(binIndexOf(raw, parameters.binEdges[j]!));
  }
  let prediction = parameters.baseValue;
  for (const tree of parameters.trees) prediction += leafValue(tree, bins);
  return prediction;
}

// --- interni ---

interface UsableRows {
  readonly X: readonly (readonly number[])[];
  readonly y: readonly number[];
  readonly w: readonly number[];
  readonly excludedForMissingFeature: number;
  readonly excludedForMissingTarget: number;
  readonly excludedForInvalidWeight: number;
}

function collectUsableRows(rows: readonly BoostedTrainingRow[], featureNames: readonly string[]): UsableRows {
  const X: number[][] = [];
  const y: number[] = [];
  const w: number[] = [];
  let excludedForMissingFeature = 0;
  let excludedForMissingTarget = 0;
  let excludedForInvalidWeight = 0;
  for (const row of rows) {
    const vector = featureNames.map((name) => row.features[name] ?? NaN);
    if (vector.some((v) => !Number.isFinite(v))) {
      excludedForMissingFeature++;
      continue;
    }
    if (!Number.isFinite(row.target)) {
      excludedForMissingTarget++;
      continue;
    }
    const weight = row.weight ?? 1;
    // Peso 0 escluso e non «tenuto con peso 0»: la mediana pesata delle foglie
    // non e' definita se il peso totale e' nullo, e una riga che non pesa non
    // e' una riga di training — va contata come esclusa, non nascosta.
    if (!Number.isFinite(weight) || weight <= 0) {
      excludedForInvalidWeight++;
      continue;
    }
    X.push(vector);
    y.push(row.target);
    w.push(weight);
  }
  return { X, y, w, excludedForMissingFeature, excludedForMissingTarget, excludedForInvalidWeight };
}

function meanAbsolute(actual: readonly number[], predicted: readonly number[], weights: readonly number[]): number {
  let sumW = 0;
  let sumWE = 0;
  for (let i = 0; i < actual.length; i++) {
    sumW += weights[i]!;
    sumWE += weights[i]! * Math.abs(actual[i]! - predicted[i]!);
  }
  return sumW > 0 ? sumWE / sumW : NaN;
}

function leafValue(tree: readonly BoostedNode[], bins: readonly number[]): number {
  let node = tree[0]!;
  while (node.featureIndex !== -1) {
    node = bins[node.featureIndex]! <= node.threshold ? tree[node.left]! : tree[node.right]!;
  }
  return node.value;
}

/**
 * Costruisce un albero di profondita' `depth` sui gradienti, con le foglie
 * rimpiazzate dalla mediana pesata dei RESIDUI (la line-search esatta di L1) e
 * moltiplicate per il learning rate.
 */
function growTree(
  bins: readonly (readonly number[])[],
  gradients: readonly number[],
  residuals: readonly number[],
  weights: readonly number[],
  edgeCounts: readonly number[],
  depth: number,
  learningRate: number,
): readonly BoostedNode[] | null {
  const allIndices = gradients.map((_, i) => i);
  const nodes: BoostedNode[] = [];

  const build = (indices: readonly number[], remainingDepth: number): number => {
    if (remainingDepth > 0 && indices.length >= 2) {
      const split = bestSplit(indices, bins, gradients, weights, edgeCounts);
      if (split !== null) {
        const left: number[] = [];
        const right: number[] = [];
        for (const i of indices) {
          if (bins[i]![split.featureIndex]! <= split.threshold) left.push(i);
          else right.push(i);
        }
        if (left.length > 0 && right.length > 0) {
          const selfIndex = nodes.length;
          nodes.push({ featureIndex: split.featureIndex, threshold: split.threshold, left: -1, right: -1, value: 0 });
          const leftIndex = build(left, remainingDepth - 1);
          const rightIndex = build(right, remainingDepth - 1);
          nodes[selfIndex] = {
            featureIndex: split.featureIndex,
            threshold: split.threshold,
            left: leftIndex,
            right: rightIndex,
            value: 0,
          };
          return selfIndex;
        }
      }
    }
    const value =
      learningRate *
      weightedMedian(
        indices.map((i) => residuals[i]!),
        indices.map((i) => weights[i]!),
      );
    const selfIndex = nodes.length;
    nodes.push({ featureIndex: -1, threshold: 0, left: -1, right: -1, value });
    return selfIndex;
  };

  const rootSplit = bestSplit(allIndices, bins, gradients, weights, edgeCounts);
  if (rootSplit === null) return null;
  build(allIndices, depth);
  // La radice e' il nodo 0 solo se `build` l'ha creata per prima: lo fa,
  // perche' inserisce il nodo interno PRIMA di ricorrere sui figli.
  return nodes;
}

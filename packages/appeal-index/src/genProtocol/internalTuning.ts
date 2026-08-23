// GEN-PROTOCOL-A §D.2 — la «regola dei due livelli». PURO.
//
// La regola, per intero: «Gli iperparametri si scelgono dentro il training
// fold: fold interno = ultima stagione del training di quel fold; criterio
// interno = stessa perdita primaria del bersaglio; pareggio interno -> il
// valore piu' regolarizzante. Al livello esterno competono solo le
// strutture.»
//
// Perche' e' un modulo e non tre righe dentro ogni famiglia: e' il
// meccanismo che tiene i confronti esterni a due cifre per bersaglio (§D.14)
// ed e' l'unico punto in cui VAL-PROTOCOL-A puo' essere violato in silenzio —
// basta valutare una griglia sul fold di test e nessun numero prodotto dopo
// vale piu' niente. Passando di qui, la griglia vede `fold.inner` e non ha
// modo di vedere `fold.testRows`: la disciplina e' nella FIRMA, non nella
// buona volonta' di chi scrive la famiglia.

import type { GenFold } from "./foldScheme.js";

/** Quale estremo di un iperparametro e' il PIU' regolarizzante. */
export type GenRegularizationDirection = "higher" | "lower";

/**
 * Le direzioni preregistrate, iperparametro per iperparametro.
 *
 * §D.2 ne nomina tre («λ piu' alto, k piu' alto, albero piu' basso»); le altre
 * due sono la lettura dichiarata della stessa idea — meno capacita' di
 * adattarsi ai dati vince il pareggio:
 *
 * - `lambda` (FAM-2) — piu' alto: penalita' maggiore, coefficienti piu' vicini a 0.
 * - `k` (FAM-1, T-D) — piu' alto: piu' shrinkage verso la media di ruolo.
 * - `depth` (FAM-4) — piu' basso: un albero di profondita' 1 non puo'
 *   rappresentare interazioni, uno di profondita' 2 si'.
 * - `trees` / M (FAM-4) — piu' basso: ogni albero aggiunto e' capacita'
 *   aggiunta, ed e' la ragione per cui M ha un early-stop invece di un valore.
 * - `halfLife` (§B.1) — piu' ALTO, e questa e' l'unica che va spiegata perche'
 *   sembra andare al contrario. Un half-life corto NON e' piu' regolarizzante:
 *   accorciarlo non riduce la capacita' del modello, riduce i DATI EFFICACI su
 *   cui e' stimato (le stagioni vecchie pesano ~0), e un modello stimato su
 *   meno dati e' piu' variabile, non meno. Il valore piu' regolarizzante e'
 *   quello che usa la storia in modo piu' uniforme: `∞` prima di `3`, `3`
 *   prima di `1,5`.
 *
 * `alpha` di FAM-2 NON compare: §D.2 non ne dichiara una direzione, e
 * inventarla qui sarebbe una costante di selezione nata dopo il congelamento
 * del metro (§C). Un pareggio su `alpha` cade quindi sull'indice di
 * enumerazione, che e' deterministico ed e' gia' il tie-break finale di §B.4.5.
 */
export const GEN_REGULARIZATION_DIRECTION: Readonly<Record<string, GenRegularizationDirection>> = {
  lambda: "higher",
  k: "higher",
  depth: "lower",
  trees: "lower",
  halfLife: "higher",
} as const;

/** Una chiave di ordinamento per regolarizzazione su un iperparametro composito. */
export interface GenRegularizationRule<H> {
  /** Nome dell'iperparametro; deve esistere in `GEN_REGULARIZATION_DIRECTION`. */
  readonly key: keyof typeof GEN_REGULARIZATION_DIRECTION & string;
  /** Come si legge il valore numerico dall'iperparametro composito. */
  readonly value: (hyperparameters: H) => number;
}

/**
 * Costruisce il comparatore «piu' regolarizzante» da una lista ORDINATA di
 * regole: la prima decide, le successive rompono i suoi pareggi.
 *
 * Ritorna `< 0` se `a` e' piu' regolarizzante di `b` — cioe' l'ordinamento
 * mette per primo il valore che il protocollo vuole vincente in caso di
 * pareggio.
 */
export function compareByRegularization<H>(rules: readonly GenRegularizationRule<H>[]): (a: H, b: H) => number {
  if (rules.length === 0) throw new Error("compareByRegularization: at least one rule is required");
  for (const rule of rules) {
    if (GEN_REGULARIZATION_DIRECTION[rule.key] === undefined) {
      throw new Error(`compareByRegularization: no preregistered regularization direction for '${rule.key}'`);
    }
  }
  return (a, b) => {
    for (const rule of rules) {
      const direction = GEN_REGULARIZATION_DIRECTION[rule.key]!;
      const va = rule.value(a);
      const vb = rule.value(b);
      if (va === vb) continue;
      // `higher`: il valore maggiore e' piu' regolarizzante -> deve venire prima.
      return direction === "higher" ? vb - va : va - vb;
    }
    return 0;
  };
}

/** L'esito della griglia su un singolo punto. */
export interface GenInnerTuningOutcome<H> {
  /** Indice nella griglia, cioe' l'indice di enumerazione di §B.4.5. */
  readonly index: number;
  readonly hyperparameters: H;
  /** Perdita primaria del bersaglio sulla stagione interna; `NaN` = non valutabile. */
  readonly loss: number;
}

export interface GenInnerTuningResult<H> {
  readonly chosen: H;
  readonly chosenIndex: number;
  readonly chosenLoss: number;
  /** Ogni punto della griglia con la sua perdita — la griglia e' ispezionabile, non un oracolo. */
  readonly outcomes: readonly GenInnerTuningOutcome<H>[];
  /** Gli indici che hanno pareggiato sulla perdita minima (≥ 2 solo in caso di pareggio). */
  readonly tiedIndices: readonly number[];
  /** Come si e' chiuso: senza pareggio, per regolarizzazione, o per indice di enumerazione. */
  readonly tieBreak: "unique" | "regularization" | "enumeration";
}

/**
 * Fitta ogni punto della griglia sul TRAIN INTERNO, lo valuta sulla STAGIONE
 * INTERNA, sceglie.
 *
 * `fitAndEvaluate` riceve solo `innerTrain` e `innerValidation`: il fold di
 * test non passa di qui, e non e' un caso.
 *
 * Il pareggio e' uguaglianza ESATTA delle perdite. Nessuna tolleranza
 * inventata: una tolleranza e' una costante di selezione, e §C congela le
 * costanti di selezione. Il caso si presenta davvero (due λ abbastanza grandi
 * azzerano gli stessi coefficienti e producono lo stesso identico numero), ed
 * e' quello per cui il protocollo scrive la regola.
 *
 * Una perdita non finita significa «questo punto non e' valutabile su questo
 * fold interno» (fit degenere, validazione vuota): il punto esce dalla scelta e
 * resta scritto in `outcomes` col suo `NaN`, mai silenziosamente convertito in
 * un numero grande.
 */
export function tuneOnInnerFold<TRow, H>(
  fold: GenFold<TRow>,
  grid: readonly H[],
  fitAndEvaluate: (hyperparameters: H, innerTrain: readonly TRow[], innerValidation: readonly TRow[]) => number,
  moreRegularizing?: (a: H, b: H) => number,
): GenInnerTuningResult<H> {
  if (grid.length === 0) throw new Error("tuneOnInnerFold: empty hyperparameter grid");
  if (fold.inner.trainRows.length === 0) {
    throw new Error("tuneOnInnerFold: the inner fold has no training rows (minTrainBlocks must be >= 2)");
  }
  if (fold.inner.validationRows.length === 0) {
    throw new Error("tuneOnInnerFold: the inner fold has no validation rows");
  }

  const outcomes: GenInnerTuningOutcome<H>[] = grid.map((hyperparameters, index) => ({
    index,
    hyperparameters,
    loss: fitAndEvaluate(hyperparameters, fold.inner.trainRows, fold.inner.validationRows),
  }));

  const evaluable = outcomes.filter((o) => Number.isFinite(o.loss));
  if (evaluable.length === 0) {
    throw new Error("tuneOnInnerFold: no grid point produced a finite inner loss");
  }

  let best = evaluable[0]!.loss;
  for (const o of evaluable) if (o.loss < best) best = o.loss;
  const tied = evaluable.filter((o) => o.loss === best);

  let chosen = tied[0]!;
  let tieBreak: GenInnerTuningResult<H>["tieBreak"] = "unique";
  if (tied.length > 1) {
    if (moreRegularizing !== undefined) {
      const sorted = [...tied].sort((a, b) => {
        const byRegularization = moreRegularizing(a.hyperparameters, b.hyperparameters);
        // Indice di enumerazione come ultima parola: due punti indistinguibili
        // anche per regolarizzazione devono comunque ordinarsi sempre uguale.
        return byRegularization !== 0 ? byRegularization : a.index - b.index;
      });
      chosen = sorted[0]!;
      // «regularization» solo se il comparatore ha davvero distinto il vincitore
      // da almeno un altro pari-merito; altrimenti ha deciso l'enumerazione.
      const winner = chosen;
      tieBreak = tied.some((o) => moreRegularizing(winner.hyperparameters, o.hyperparameters) !== 0)
        ? "regularization"
        : "enumeration";
    } else {
      chosen = tied.reduce((lowest, o) => (o.index < lowest.index ? o : lowest));
      tieBreak = "enumeration";
    }
  }

  return {
    chosen: chosen.hyperparameters,
    chosenIndex: chosen.index,
    chosenLoss: chosen.loss,
    outcomes,
    tiedIndices: tied.map((o) => o.index),
    tieBreak,
  };
}

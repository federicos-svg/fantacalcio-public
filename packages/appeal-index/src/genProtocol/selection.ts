// GEN-PROTOCOL-A §B.3–§B.4 — ammissibilita' e ordine di selezione. PURO.
//
// Perche' un modulo NUOVO e non una modifica a `../phase4Selection.ts`: quello
// implementa VAL-PROTOCOL-A-PHASE4, che e' un altro protocollo con altre
// regole, altri artefatti e un `phase4ConfigHash()` che entra nell'identita' di
// ogni pacchetto gia' prodotto. Cambiarlo per farci entrare anche questo
// significherebbe che i due protocolli non sono piu' distinguibili a valle —
// e che i run gia' fatti diventano incomparabili con se stessi. Restano due
// moduli perche' sono due metri, e il metro di ciascuno e' congelato (§C).
//
// Le quattro condizioni di ammissibilita' di §B.3, «tutte insieme, nessuna
// negoziabile»:
//   1. nessuna violazione di anteriorita' (§G) ne' di determinismo;
//   2. coverage ≥ 90% delle righe che B0 sa scorare, sul denominatore pieno —
//      «vieta le vittorie per cherry-picking del sottoinsieme facile»;
//   3. batte B0 sulla perdita primaria in ≥ 4 fold su 7 (T3: 2 su 2; T8:
//      maggioranza) E in media;
//   4. veto per ruolo: se su un ruolo peggiora di > 5% mentre vince in media,
//      per QUEL ruolo resta B0.
//
// E l'ordine di §B.4: violazioni -> ammissibilita' -> primaria media -> regola
// 1-SE verso il piu' semplice -> Spearman medio per ruolo -> indice di
// enumerazione -> `NO_VERDICT` se l'IC bootstrap contiene lo zero.
//
// Il punto della regola 1-SE, che e' facile leggere come una formalita': senza
// di essa, con 65 confronti esterni (§D.14) il vincitore piu' probabile e' il
// candidato piu' flessibile che ha pescato il rumore giusto. Con essa, un
// candidato complesso deve battere il semplice di piu' di un errore standard
// per portarsi via la selezione — e se non ci riesce, la conclusione
// preregistrata e' che il dominio e' semplice, e si scrive.
//
// --- I FOLD NON MISURATI, e perche' «paired» vale anche qui (2026-08-28) ---
//
// Un candidato puo' non avere un numero su un fold: il fit non converge, la
// regola campionaria di §D.8 gatta la taglia `full` sui primi fold, la riga non
// esiste in quell'era. La rappresentazione e' `+∞` in `primaryLossPerFold`, e
// NON cambia: l'array resta lungo quanto i fold del bersaglio, cosi' l'indice
// e' il fold e il pairing e' posizionale.
//
// Cambia cosa se ne fa il confronto. Prima, la media di `primaryLossPerFold`
// includeva quel `+∞`: la media diventava `+∞` e «non batte B0 in media»
// scattava sempre, per un solo fold mancante su sette. Ma §B.3.3 chiede gia'
// la consistenza (≥ 4 fold su 7) come clausola SEPARATA, e con la media a `+∞`
// quella clausola non decideva mai niente — decideva la media, e decideva
// sempre no. Il risultato: la tolleranza esplicita di §D.8 («ammessa se
// fallisce ≤ 2 fold») era lettera morta, perche' il primo fold fallito
// eliminava il candidato prima che qualcuno contasse i fold.
//
// §B.4 apre con «confronti sempre paired sugli stessi fold». La lettura
// adottata — decisione registrata il 2026-08-28, gia' in vigore sui round — e'
// l'unica compatibile con quella riga: ogni confronto a coppie si calcola
// sull'INTERSEZIONE dei fold che entrambi i lati hanno misurato, e la media che
// ordina i due candidati e' la media paired su quell'intersezione. Mai la media
// propria di ciascuno su insiemi diversi, che e' un confronto fra due grandezze
// che non sono la stessa grandezza.
//
// Cosa NON cambia, ed e' la meta' che tiene in piedi l'altra:
//   - la consistenza di §B.3.3 conta le vittorie su TUTTI i fold, con il
//     denominatore pieno: un fold `+∞` non e' mai `< baseline`, quindi non e'
//     mai una vittoria. Un candidato che non misura piu' di 3 fold su 7 non
//     arriva a 4 vittorie e resta fuori — il tetto al numero di fold mancanti
//     esiste gia' li', e non ne serve un secondo;
//   - zero fold misurati resta inammissibile, con la media a `+∞` come prima;
//   - la tolleranza «≤ 2/7» di §D.8 resta una regola del ladder portieri: qui
//     non viene generalizzata a nessun altro candidato.
//
// Intersezione VUOTA fra due candidati parziali: il confronto e' INDETERMINATO,
// non perso. Non c'e' un fold su cui misurarli insieme, quindi non si puo' dire
// che uno batta l'altro; si applica la regola che il protocollo tiene per
// l'assenza di evidenza, cioe' l'ordine di complessita' preregistrato — vince
// il piu' semplice — e la catena di §K lo dichiara invece di lasciarlo dedurre.
//
// Dentro `selectGenCandidate` quel caso e' un cammino DIFENSIVO, e vale la pena
// dire perche': due candidati AMMISSIBILI non possono avere intersezione vuota.
// L'ammissibilita' chiede la maggioranza stretta dei fold (`⌊n/2⌋ + 1`) e un
// fold non misurato non e' mai una vittoria, quindi ciascuno dei due ha
// misurato piu' di meta' dei fold: due insiemi cosi' si intersecano sempre. La
// regola resta scritta lo stesso perche' la semantica del confronto vive in
// `pairedFoldComparison`, che e' esportata e usata anche fuori da questa
// macchina, e perche' un `mean` su un insieme vuoto sarebbe un'eccezione al
// posto di un verdetto.

import { mean } from "../stats.js";
import { GEN_ROLES, type GenRole, type GenTargetId } from "./genTypes.js";
import {
  pairedBlockDifferences,
  seasonBlockBootstrap,
  GEN_BOOTSTRAP_REPLICATES,
  GEN_BOOTSTRAP_SEED,
  type GenBootstrapInterval,
} from "./bootstrapBlock.js";

/**
 * L'ordine di complessita' preregistrato (§B.4.4), dal piu' semplice al piu'
 * complesso. E' una LISTA, non un punteggio: il protocollo non dice di quanto
 * FAM-4 sia piu' complessa di FAM-3, dice solo che lo e'.
 */
export const GEN_COMPLEXITY_ORDER = [
  "B0",
  "FAM-1",
  "FAM-2/S1",
  "FAM-2/S2",
  "FAM-2/S3",
  "FAM-3",
  "FAM-4",
] as const;

/**
 * L'ordine di complessita' del layer prime giornate (§D.15.2, v2.0.0):
 * `U0 < U1_G < U2_G` DENTRO ogni G.
 *
 * E' un secondo ordine, non un'estensione del primo: le due gare non si
 * incontrano mai (il layer corre su T-N contro l'incumbent T-N, i candidati di
 * §D.2 corrono fra loro), e mescolarle in una lista sola suggerirebbe un
 * confronto che il protocollo non prevede. Nessun confronto nemmeno FRA G
 * diversi: «non sono candidati in gara fra loro, sono contingenze di
 * calendario» — e infatti ogni G ha la sua selezione, con la sua baseline U0.
 */
export const GEN_LAYER_COMPLEXITY_ORDER = ["U0", "U1", "U2"] as const;

export type GenFamily = (typeof GEN_COMPLEXITY_ORDER)[number] | (typeof GEN_LAYER_COMPLEXITY_ORDER)[number];

/**
 * Posizione nell'ordine di complessita'; piu' basso = piu' semplice.
 *
 * `order` e' un parametro OPZIONALE con il default di §B.4.4: chi non lo passa
 * ottiene esattamente il comportamento dell'ondata 1. Esiste perche' §D.15 ha
 * introdotto una seconda gara con un proprio ordine, e l'alternativa —
 * duplicare la logica di selezione dentro il modulo del layer — avrebbe creato
 * due regole 1-SE da tenere allineate a mano.
 */
export function complexityRank(family: GenFamily, order: readonly string[] = GEN_COMPLEXITY_ORDER): number {
  const rank = order.indexOf(family);
  if (rank < 0) throw new Error(`complexityRank: '${family}' is not in the preregistered complexity order`);
  return rank;
}

/** Coverage minima rispetto a B0, sul denominatore pieno di §A.2 (§B.3.2). */
export const GEN_MIN_COVERAGE_RATIO = 0.9;

/** Peggioramento relativo per ruolo oltre il quale scatta il veto (§B.3.4). */
export const GEN_ROLE_REGRESSION_VETO = 0.05;

/**
 * Fold da vincere: MAGGIORANZA STRETTA dei fold del bersaglio.
 *
 * Il protocollo enumera tre casi — «≥ 4 fold su 7 (T3: 2 su 2; T8:
 * maggioranza)» — e sembrano tre regole. Sono una: `⌊n/2⌋ + 1`. Con 7 fold da'
 * 4; con i 2 fold di T3 da' 2, cioe' proprio «2 su 2»; e per T8 e' letteralmente
 * «maggioranza». Una regola sola invece di tre rami e' anche una regola sola da
 * sbagliare — e i tre valori sono verificati nel test contro numeri scritti a
 * mano, non contro questa funzione.
 */
export function requiredFoldWins(foldCount: number): number {
  if (!Number.isInteger(foldCount) || foldCount < 1) throw new Error("requiredFoldWins: foldCount must be a positive integer");
  return Math.floor(foldCount / 2) + 1;
}

/**
 * Errore standard della MEDIA delle differenze paired per fold (§B.4.4).
 *
 * Deviazione standard CAMPIONARIA (denominatore `n − 1`) diviso `√n`: e' lo
 * standard error della media di `n` valori, e con `n − 1` e' non distorta.
 * `../stats.ts` espone una `stdDev` di POPOLAZIONE (denominatore `n`), giusta
 * per il suo uso — la dispersione osservata di una colonna di feature — e
 * sbagliata per questo: qui i 7 fold sono un campione di stagioni, non la
 * popolazione delle stagioni possibili.
 *
 * Con meno di 2 valori l'errore standard non esiste e la funzione restituisce
 * `NaN`: la regola 1-SE allora non si applica, invece di applicarsi con un
 * numero inventato.
 */
export function standardErrorOfPairedDifferences(differences: readonly number[]): number {
  const n = differences.length;
  if (n < 2) return NaN;
  const m = mean(differences);
  let sumSquares = 0;
  for (const d of differences) sumSquares += (d - m) ** 2;
  return Math.sqrt(sumSquares / (n - 1)) / Math.sqrt(n);
}

/**
 * Un fold e' MISURATO quando la sua perdita e' un numero finito.
 *
 * `+∞` e' la rappresentazione preesistente del fold non misurato e resta tale;
 * il predicato e' scritto su `Number.isFinite` e non su `=== Infinity` perche'
 * un `NaN` arrivato da un fit degenere e' anch'esso assenza di misura, e
 * trattarlo come un numero lo farebbe entrare in una media.
 */
function isMeasuredFold(loss: number | undefined): loss is number {
  return loss !== undefined && Number.isFinite(loss);
}

/**
 * La media di un candidato sui soli fold che ha misurato; `+∞` se non ne ha
 * misurato nessuno.
 *
 * Serve solo a RIPORTARE la grandezza di un candidato nella catena. Non ordina
 * niente: due candidati con fold misurati diversi si ordinano con
 * `pairedFoldComparison`, non con due medie calcolate su insiemi diversi.
 */
function meanOfMeasuredFolds(perFold: readonly number[]): number {
  const measured = perFold.filter((loss) => isMeasuredFold(loss));
  return measured.length === 0 ? Number.POSITIVE_INFINITY : mean(measured);
}

/** Il confronto paired fra due serie per fold, sull'intersezione dei misurati (§B.4). */
export interface GenPairedComparison {
  /** I fold misurati da ENTRAMBI: la base `n` del confronto, da dichiarare. */
  readonly commonFolds: number;
  /** I fold del bersaglio, misurati o no: il denominatore di §B.3.3. */
  readonly totalFolds: number;
  /** Media della perdita del candidato sui soli fold comuni. */
  readonly candidateMean: number;
  /** Media della perdita del rivale SUGLI STESSI fold. */
  readonly rivalMean: number;
  /** `candidateMean − rivalMean`: negativo = il candidato sbaglia meno. */
  readonly meanGap: number;
  /** Errore standard delle differenze paired sui fold comuni (`n = commonFolds`). */
  readonly standardError: number;
  /** `false` con intersezione vuota: confronto INDETERMINATO, non confronto perso. */
  readonly determinate: boolean;
  /** Le differenze paired sui fold comuni, candidato meno rivale. */
  readonly differences: readonly number[];
}

/**
 * Confronta due serie di perdite per fold sui fold che ENTRAMBE hanno misurato.
 *
 * E' la forma eseguibile di «confronti sempre paired sugli stessi fold» (§B.4)
 * quando «gli stessi fold» non sono tutti: l'intersezione e' l'insieme piu'
 * grande su cui la frase resta vera. Con due serie complete l'intersezione e'
 * l'insieme pieno e i numeri sono, byte per byte, quelli di prima.
 *
 * Nessun cammino di questa funzione decide da solo: con intersezione vuota
 * restituisce `determinate: false` e lascia la decisione a chi chiama, che ha
 * l'ordine di complessita' preregistrato e il dovere di scriverlo.
 */
export function pairedFoldComparison(
  candidatePerFold: readonly number[],
  rivalPerFold: readonly number[],
): GenPairedComparison {
  const totalFolds = Math.max(candidatePerFold.length, rivalPerFold.length);
  const pairedLength = Math.min(candidatePerFold.length, rivalPerFold.length);
  const candidateCommon: number[] = [];
  const rivalCommon: number[] = [];
  for (let f = 0; f < pairedLength; f++) {
    const a = candidatePerFold[f];
    const b = rivalPerFold[f];
    if (!isMeasuredFold(a) || !isMeasuredFold(b)) continue;
    candidateCommon.push(a);
    rivalCommon.push(b);
  }
  const commonFolds = candidateCommon.length;
  if (commonFolds === 0) {
    return {
      commonFolds: 0,
      totalFolds,
      candidateMean: Number.NaN,
      rivalMean: Number.NaN,
      meanGap: Number.NaN,
      standardError: Number.NaN,
      determinate: false,
      differences: [],
    };
  }
  const candidateMean = mean(candidateCommon);
  const rivalMean = mean(rivalCommon);
  // Il segno delle differenze resta quello fissato una volta per tutte in
  // `pairedBlockDifferences` (negativo = il candidato sbaglia meno): una
  // seconda sottrazione scritta a mano qui sarebbe la prima occasione per
  // invertirlo senza accorgersene.
  const differences = pairedBlockDifferences(candidateCommon, rivalCommon);
  return {
    commonFolds,
    totalFolds,
    candidateMean,
    rivalMean,
    meanGap: candidateMean - rivalMean,
    standardError: standardErrorOfPairedDifferences(differences),
    determinate: true,
    differences,
  };
}

/** L'evidenza di B0 su un bersaglio: il metro contro cui tutto si misura (§B.3). */
export interface GenBaselineEvidence {
  readonly candidateId: string;
  /** Perdita primaria per fold, nell'ordine dei fold — identico per ogni candidato (§B.4, paired). */
  readonly primaryLossPerFold: readonly number[];
  /** Righe che B0 sa scorare sul denominatore pieno di §A.2: il denominatore della coverage. */
  readonly scoredRows: number;
  /** Perdita primaria media per ruolo, per il veto di §B.3.4. */
  readonly primaryLossByRole: Readonly<Partial<Record<GenRole, number>>>;
  /** Spearman medio per ruolo (§B.4.5, primo tie-break residuo). */
  readonly meanSpearmanByRole: number;
  /**
   * La famiglia della baseline nell'ordine di complessita' in uso. Opzionale e
   * con default `"B0"`: nella gara del layer (§D.15) la baseline e' `U0`, che
   * e' il primo elemento dell'ALTRO ordine.
   */
  readonly family?: GenFamily;
}

/** L'evidenza di un candidato esterno (§D.1). */
export interface GenCandidateEvidence extends GenBaselineEvidence {
  readonly family: GenFamily;
  /** Numero di feature del set attivo: tie-break a parita' di famiglia (§B.4.4). */
  readonly featureCount: number;
  /** Indice di enumerazione nella griglia di §D.2: l'ultimo tie-break, deterministico (§B.4.5). */
  readonly enumerationIndex: number;
  /** Violazioni di anteriorita' o determinismo gia' accertate a monte (§B.3.1, §G). */
  readonly violations?: readonly string[];
}

export interface GenRoleVeto {
  readonly role: GenRole;
  readonly candidateLoss: number;
  readonly baselineLoss: number;
  /** `(candidato − B0)/B0`: positivo = il candidato peggiora su quel ruolo. */
  readonly relativeRegression: number;
}

export type GenAdmissibilityFailure =
  | "VIOLATIONS"
  | "COVERAGE_BELOW_MINIMUM"
  | "NOT_ENOUGH_FOLD_WINS"
  | "DOES_NOT_BEAT_BASELINE_ON_AVERAGE";

export interface GenAdmissibilityVerdict {
  readonly candidateId: string;
  readonly admissible: boolean;
  readonly failures: readonly GenAdmissibilityFailure[];
  readonly violations: readonly string[];
  readonly coverageRatio: number;
  readonly foldWins: number;
  readonly requiredFoldWins: number;
  /** I fold del bersaglio: il denominatore pieno di §B.3.3, misurati o no. */
  readonly foldCount: number;
  /**
   * I fold su cui il confronto con B0 e' paired: la base `n` dichiarata delle
   * due medie qui sotto. Con un candidato completo vale `foldCount`.
   */
  readonly comparisonFolds: number;
  /** Perdita media del candidato SUI SOLI `comparisonFolds`; `+∞` se non ne ha nessuno. */
  readonly meanPrimaryLoss: number;
  /** Perdita media di B0 SUGLI STESSI `comparisonFolds` — mai su un altro insieme. */
  readonly baselineMeanPrimaryLoss: number;
  /**
   * I ruoli su cui resta B0 anche se il candidato vince in media (§B.3.4). NON
   * rende il candidato inammissibile: e' un veto PER RUOLO, ed e' la ragione
   * per cui lo stato finale si legge per bersaglio-ruolo e non per bersaglio.
   */
  readonly roleVetoes: readonly GenRoleVeto[];
}

/** Ammissibilita' di un candidato contro B0 (§B.3, le quattro condizioni insieme). */
export function assessAdmissibility(
  candidate: GenCandidateEvidence,
  baseline: GenBaselineEvidence,
): GenAdmissibilityVerdict {
  if (candidate.primaryLossPerFold.length !== baseline.primaryLossPerFold.length) {
    throw new Error(
      `assessAdmissibility: '${candidate.candidateId}' and baseline were evaluated over a different number of folds — the comparison would not be paired (§B.4)`,
    );
  }
  if (candidate.primaryLossPerFold.length === 0) throw new Error("assessAdmissibility: no folds");
  if (baseline.scoredRows <= 0) throw new Error("assessAdmissibility: the baseline scored no rows — there is no coverage denominator");

  const violations = candidate.violations ?? [];
  const failures: GenAdmissibilityFailure[] = [];
  if (violations.length > 0) failures.push("VIOLATIONS");

  const coverageRatio = candidate.scoredRows / baseline.scoredRows;
  if (coverageRatio < GEN_MIN_COVERAGE_RATIO) failures.push("COVERAGE_BELOW_MINIMUM");

  // «Batte» e' STRETTAMENTE minore: un pareggio su un fold non e' una vittoria,
  // e contarlo come tale renderebbe la soglia dei 4/7 piu' facile di quanto
  // il protocollo l'abbia scritta.
  //
  // Il conteggio NON cambia con i fold non misurati e non deve cambiare: `+∞`
  // non e' mai `< baseline`, quindi un fold mancante non e' una vittoria, e il
  // denominatore resta quello pieno. E' qui, non in una soglia nuova, che vive
  // il tetto al numero di fold che un candidato puo' permettersi di non
  // misurare (§B.3.3).
  const foldCount = candidate.primaryLossPerFold.length;
  let foldWins = 0;
  for (let f = 0; f < foldCount; f++) {
    if (candidate.primaryLossPerFold[f]! < baseline.primaryLossPerFold[f]!) foldWins++;
  }
  const required = requiredFoldWins(foldCount);
  if (foldWins < required) failures.push("NOT_ENOUGH_FOLD_WINS");

  // «E in media» (§B.3.3), PAIRED: la media del candidato sui fold che ha
  // misurato contro la media di B0 sugli STESSI fold. Senza nemmeno un fold in
  // comune la media resta `+∞` contro la media piena di B0 — cioe' esattamente
  // il verdetto di prima: un candidato che non ha misurato niente non ha battuto
  // niente.
  const versusBaseline = pairedFoldComparison(candidate.primaryLossPerFold, baseline.primaryLossPerFold);
  const meanPrimaryLoss = versusBaseline.determinate ? versusBaseline.candidateMean : Number.POSITIVE_INFINITY;
  const baselineMeanPrimaryLoss = versusBaseline.determinate
    ? versusBaseline.rivalMean
    : mean(baseline.primaryLossPerFold);
  if (!(meanPrimaryLoss < baselineMeanPrimaryLoss)) failures.push("DOES_NOT_BEAT_BASELINE_ON_AVERAGE");

  const roleVetoes: GenRoleVeto[] = [];
  for (const role of GEN_ROLES) {
    const candidateLoss = candidate.primaryLossByRole[role];
    const baselineLoss = baseline.primaryLossByRole[role];
    if (candidateLoss === undefined || baselineLoss === undefined) continue;
    if (!(baselineLoss > 0)) continue; // senza un denominatore positivo non esiste un peggioramento relativo
    const relativeRegression = (candidateLoss - baselineLoss) / baselineLoss;
    if (relativeRegression > GEN_ROLE_REGRESSION_VETO) {
      roleVetoes.push({ role, candidateLoss, baselineLoss, relativeRegression });
    }
  }

  return {
    candidateId: candidate.candidateId,
    admissible: failures.length === 0,
    failures,
    violations,
    coverageRatio,
    foldWins,
    requiredFoldWins: required,
    foldCount,
    comparisonFolds: versusBaseline.commonFolds,
    meanPrimaryLoss,
    baselineMeanPrimaryLoss,
    roleVetoes,
  };
}

export type GenSelectionStatus = "winner" | "B0" | "NO_VERDICT";

export interface GenSelectionStep {
  readonly stage: "violations" | "admissibility" | "mean_primary_loss" | "one_standard_error" | "tie_break" | "bootstrap";
  /** Riga leggibile: chi ha battuto chi, di quanto, con quale SE. */
  readonly message: string;
  readonly candidateId: string | null;
  /** Gli stessi numeri della riga, in forma serializzabile (§K: la catena di selezione e' un artefatto). */
  readonly numbers: Readonly<Record<string, number>>;
}

export interface GenOneStandardErrorEntry {
  readonly candidateId: string;
  /**
   * `media(candidato) − media(migliore)` SUI FOLD COMUNI ai due; ≥ 0 per
   * costruzione sul migliore, `NaN` quando il confronto e' indeterminato.
   */
  readonly meanGap: number;
  /** SE delle differenze paired sui fold comuni (`n = commonFolds`). */
  readonly standardError: number;
  readonly withinOneStandardError: boolean;
  readonly complexityRank: number;
  readonly featureCount: number;
  /** La base `n` del confronto con il migliore: i fold misurati da entrambi. */
  readonly commonFolds: number;
  /**
   * `false` con intersezione vuota. Un confronto indeterminato NON e' un
   * confronto perso: il candidato entra fra i pari-merito e decide l'ordine di
   * complessita' preregistrato, come per qualunque altra assenza di evidenza.
   */
  readonly determinate: boolean;
}

export interface GenSelectionInput {
  readonly target: GenTargetId;
  readonly baseline: GenBaselineEvidence;
  readonly candidates: readonly GenCandidateEvidence[];
  readonly bootstrap?: { readonly replicates?: number; readonly seed?: number };
  /**
   * L'ordine di complessita' da usare nella regola 1-SE. Default: quello di
   * §B.4.4. Il layer di §D.15 passa `GEN_LAYER_COMPLEXITY_ORDER`.
   */
  readonly complexityOrder?: readonly string[];
}

export interface GenSelectionResult {
  readonly target: GenTargetId;
  readonly status: GenSelectionStatus;
  /** L'id servito: il vincitore, oppure quello della baseline con `B0`/`NO_VERDICT`. */
  readonly servedCandidateId: string;
  readonly admissibility: readonly GenAdmissibilityVerdict[];
  /** Il candidato con la perdita media piu' bassa fra gli ammissibili, prima della regola 1-SE. */
  readonly lowestMeanLossCandidateId: string | null;
  readonly oneStandardError: readonly GenOneStandardErrorEntry[];
  /** IC bootstrap season-block della differenza media (servito vs B0); `null` se non applicabile. */
  readonly bootstrapInterval: GenBootstrapInterval | null;
  /** Stato per bersaglio-RUOLO: il veto di §B.3.4 puo' riportare un singolo ruolo a B0. */
  readonly statusByRole: Readonly<Partial<Record<GenRole, GenSelectionStatus>>>;
  /** La catena leggibile e serializzabile (§K). */
  readonly chain: readonly GenSelectionStep[];
}

/**
 * Esegue l'ordine di selezione di §B.4 su un bersaglio.
 *
 * Il fallback e' preregistrato e non e' un caso d'errore: se nessun candidato e'
 * ammissibile, o se l'IC bootstrap della differenza contiene lo zero, si serve
 * B0 e lo si scrive (§B.4.6). «Nessun vincitore» e' un esito del protocollo,
 * non un fallimento del run.
 */
export function selectGenCandidate(input: GenSelectionInput): GenSelectionResult {
  const { target, baseline, candidates } = input;
  const order = input.complexityOrder ?? GEN_COMPLEXITY_ORDER;
  const rankOf = (family: GenFamily): number => complexityRank(family, order);
  const chain: GenSelectionStep[] = [];
  const foldCount = baseline.primaryLossPerFold.length;
  if (foldCount === 0) throw new Error("selectGenCandidate: the baseline has no folds");

  const baselineMeanLoss = mean(baseline.primaryLossPerFold);

  // 1. violazioni — escluse prima di qualunque numero di merito (§B.4.1).
  for (const candidate of candidates) {
    const violations = candidate.violations ?? [];
    if (violations.length > 0) {
      chain.push({
        stage: "violations",
        candidateId: candidate.candidateId,
        message: `${candidate.candidateId} escluso per violazioni: ${violations.join(", ")}`,
        numbers: { violations: violations.length },
      });
    }
  }

  // 2. ammissibilita' vs B0 (§B.4.2).
  const admissibility = candidates.map((candidate) => assessAdmissibility(candidate, baseline));
  for (const verdict of admissibility) {
    chain.push({
      stage: "admissibility",
      candidateId: verdict.candidateId,
      message: verdict.admissible
        ? `${verdict.candidateId} ammissibile: coverage ${(verdict.coverageRatio * 100).toFixed(1)}%, ` +
          `${verdict.foldWins}/${foldCount} fold vinti (richiesti ${verdict.requiredFoldWins}), ` +
          `perdita media ${verdict.meanPrimaryLoss} contro ${verdict.baselineMeanPrimaryLoss} di B0 ` +
          `(confronto paired su n = ${verdict.comparisonFolds} fold comuni)` +
          (verdict.roleVetoes.length > 0
            ? `; veto per ruolo su ${verdict.roleVetoes.map((v) => v.role).join(", ")} (resta B0 la')`
            : "")
        : `${verdict.candidateId} inammissibile: ${verdict.failures.join(", ")} ` +
          `(confronto paired su n = ${verdict.comparisonFolds} fold comuni)`,
      numbers: {
        coverageRatio: verdict.coverageRatio,
        foldWins: verdict.foldWins,
        requiredFoldWins: verdict.requiredFoldWins,
        comparisonFolds: verdict.comparisonFolds,
        meanPrimaryLoss: verdict.meanPrimaryLoss,
        baselineMeanPrimaryLoss: verdict.baselineMeanPrimaryLoss,
        roleVetoes: verdict.roleVetoes.length,
      },
    });
  }

  const admissibleIds = new Set(admissibility.filter((v) => v.admissible).map((v) => v.candidateId));
  const admissible = candidates.filter((c) => admissibleIds.has(c.candidateId));

  if (admissible.length === 0) {
    chain.push({
      stage: "admissibility",
      candidateId: baseline.candidateId,
      message: "nessun candidato ammissibile: si serve B0 (fallback preregistrato, §B.3)",
      numbers: { admissibleCandidates: 0, baselineMeanPrimaryLoss: baselineMeanLoss },
    });
    return {
      target,
      status: "B0",
      servedCandidateId: baseline.candidateId,
      admissibility,
      lowestMeanLossCandidateId: null,
      oneStandardError: [],
      bootstrapInterval: null,
      statusByRole: uniformStatusByRole(baseline, "B0"),
      chain,
    };
  }

  // 3. perdita primaria media piu' bassa (§B.4.3), a confronti PAIRED.
  //
  // Non e' piu' un `argmin` su medie gia' calcolate: due candidati con fold
  // misurati diversi hanno medie che non sono la stessa grandezza, e il minimo
  // fra grandezze diverse non e' un ordinamento. Si riduce a coppie, e ogni
  // coppia si misura sull'intersezione dei suoi fold.
  //
  // L'ordine di riduzione e' FISSATO — indice di enumerazione, poi id — e non
  // e' quello dell'array in ingresso: con intersezioni diverse la relazione
  // «batte» non e' garantita transitiva, e un vincitore che dipendesse
  // dall'ordine di arrivo non sarebbe piu' deterministico (§B.3.1). Con
  // candidati tutti completi la riduzione ridiventa l'`argmin` di prima, con lo
  // stesso tie-break sull'indice di enumerazione (§B.4.5).
  const meanLossOf = new Map<string, number>();
  for (const candidate of admissible) {
    meanLossOf.set(candidate.candidateId, meanOfMeasuredFolds(candidate.primaryLossPerFold));
  }
  const reductionOrder = [...admissible].sort((a, b) => {
    const byEnumeration = a.enumerationIndex - b.enumerationIndex;
    if (byEnumeration !== 0) return byEnumeration;
    return a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0;
  });
  let best = reductionOrder[0]!;
  for (const candidate of reductionOrder.slice(1)) {
    const versus = pairedFoldComparison(candidate.primaryLossPerFold, best.primaryLossPerFold);
    if (!versus.determinate) {
      // Nessun fold in comune: non si puo' dire chi batte chi. Prevale il piu'
      // semplice; a parita' di famiglia resta chi e' arrivato prima
      // nell'ordine di riduzione, che e' l'indice di enumerazione piu' basso.
      const challenger = rankOf(candidate.family) < rankOf(best.family) ? candidate : best;
      chain.push({
        stage: "mean_primary_loss",
        candidateId: challenger.candidateId,
        message:
          `${candidate.candidateId} e ${best.candidateId} non hanno nessun fold misurato in comune: ` +
          `confronto indeterminato (n = 0), prevale il piu' semplice per l'ordine di complessita' ` +
          `preregistrato — ${challenger.candidateId} (${challenger.family})`,
        numbers: {
          commonFolds: 0,
          challengerComplexityRank: rankOf(candidate.family),
          incumbentComplexityRank: rankOf(best.family),
        },
      });
      best = challenger;
      continue;
    }
    // Pareggio esatto sulla media paired: vince l'indice di enumerazione piu'
    // basso, cosi' il «migliore» non dipende dall'ordine di arrivo (§B.4.5).
    if (
      versus.candidateMean < versus.rivalMean ||
      (versus.candidateMean === versus.rivalMean && candidate.enumerationIndex < best.enumerationIndex)
    ) {
      best = candidate;
    }
  }
  const bestMeasuredFolds = best.primaryLossPerFold.filter((loss) => isMeasuredFold(loss)).length;
  chain.push({
    stage: "mean_primary_loss",
    candidateId: best.candidateId,
    message:
      `perdita media piu' bassa fra gli ammissibili: ${best.candidateId} (${meanLossOf.get(best.candidateId)!}` +
      `, misurata su ${bestMeasuredFolds}/${foldCount} fold; confronti paired sui fold comuni)`,
    numbers: {
      meanPrimaryLoss: meanLossOf.get(best.candidateId)!,
      measuredFolds: bestMeasuredFolds,
      admissibleCandidates: admissible.length,
    },
  });

  // 4. regola 1-SE (§B.4.4). B0 partecipa: e' il primo elemento dell'ordine di
  // complessita', quindi se il divario del migliore da B0 sta dentro un errore
  // standard, il piu' semplice e' proprio B0.
  const contenders: {
    readonly id: string;
    readonly perFold: readonly number[];
    readonly family: GenFamily;
    readonly featureCount: number;
    readonly enumerationIndex: number;
    readonly meanSpearmanByRole: number;
  }[] = [
    {
      id: baseline.candidateId,
      perFold: baseline.primaryLossPerFold,
      family: baseline.family ?? "B0",
      featureCount: 0,
      enumerationIndex: -1,
      meanSpearmanByRole: baseline.meanSpearmanByRole,
    },
    ...admissible.map((c) => ({
      id: c.candidateId,
      perFold: c.primaryLossPerFold,
      family: c.family,
      featureCount: c.featureCount,
      enumerationIndex: c.enumerationIndex,
      meanSpearmanByRole: c.meanSpearmanByRole,
    })),
  ];

  const bestPerFold = best.primaryLossPerFold;
  const bestMeanLoss = meanLossOf.get(best.candidateId)!;
  const oneStandardError: GenOneStandardErrorEntry[] = contenders.map((contender) => {
    // Divario e SE sui soli fold che contendente e migliore hanno ENTRAMBI
    // misurato, con `n = commonFolds` dichiarato: e' la stessa regola di §B.4.4
    // («l'errore standard delle differenze paired per fold»), applicata
    // all'insieme piu' grande su cui quelle differenze esistono davvero.
    const versus = pairedFoldComparison(contender.perFold, bestPerFold);
    // Il migliore ha `meanGap === 0` ed e' dentro per definizione. Per gli
    // altri: dentro se il divario NON supera un errore standard. Un SE non
    // finito (meno di due fold comuni) lascia fuori tutti tranne il migliore,
    // invece di far entrare tutti con un numero che non c'e'.
    //
    // Il confronto INDETERMINATO (nessun fold in comune) entra invece fra i
    // pari-merito: non c'e' evidenza che il contendente sia peggiore, e la
    // regola preregistrata per l'assenza di evidenza e' l'ordine di
    // complessita' — che decide sotto, nel tie-break, dove il piu' semplice
    // vince e il piu' complesso perde.
    const withinOneStandardError =
      !versus.determinate ||
      versus.meanGap <= 0 ||
      (Number.isFinite(versus.standardError) && versus.meanGap <= versus.standardError);
    return {
      candidateId: contender.id,
      meanGap: versus.meanGap,
      standardError: versus.standardError,
      withinOneStandardError,
      complexityRank: rankOf(contender.family),
      featureCount: contender.featureCount,
      commonFolds: versus.commonFolds,
      determinate: versus.determinate,
    };
  });

  const tiedIds = new Set(oneStandardError.filter((e) => e.withinOneStandardError).map((e) => e.candidateId));
  const tied = contenders.filter((c) => tiedIds.has(c.id));
  const commonFoldsOf = new Map(oneStandardError.map((e) => [e.candidateId, e.commonFolds]));
  chain.push({
    stage: "one_standard_error",
    candidateId: best.candidateId,
    message:
      `regola 1-SE rispetto a ${best.candidateId}: ${tied.length} candidati entro un errore standard ` +
      `(${tied.map((c) => `${c.id} su n = ${commonFoldsOf.get(c.id)!} fold comuni`).join(", ")})`,
    numbers: { tiedCandidates: tied.length, bestMeanPrimaryLoss: bestMeanLoss },
  });

  const indeterminate = oneStandardError.filter((e) => !e.determinate);
  if (indeterminate.length > 0) {
    chain.push({
      stage: "one_standard_error",
      candidateId: best.candidateId,
      message:
        `confronto indeterminato con ${best.candidateId} (nessun fold misurato in comune, n = 0) per ` +
        `${indeterminate.map((e) => e.candidateId).join(", ")}: entrano fra i pari-merito e decide ` +
        "l'ordine di complessita' preregistrato",
      numbers: { indeterminateContenders: indeterminate.length, commonFolds: 0 },
    });
  }

  // 5. fra i pari-merito: il piu' semplice; a parita' di famiglia, meno
  //    feature; poi Spearman medio per ruolo piu' alto; poi indice di
  //    enumerazione piu' basso (§B.4.4–5).
  const chosen = [...tied].sort((a, b) => {
    const byComplexity = rankOf(a.family) - rankOf(b.family);
    if (byComplexity !== 0) return byComplexity;
    const byFeatures = a.featureCount - b.featureCount;
    if (byFeatures !== 0) return byFeatures;
    const bySpearman = b.meanSpearmanByRole - a.meanSpearmanByRole;
    if (bySpearman !== 0 && Number.isFinite(bySpearman)) return bySpearman;
    return a.enumerationIndex - b.enumerationIndex;
  })[0]!;
  chain.push({
    stage: "tie_break",
    candidateId: chosen.id,
    message:
      `piu' semplice fra i pari-merito: ${chosen.id} (complessita' ${chosen.family}, ` +
      `${chosen.featureCount} feature, Spearman medio per ruolo ${chosen.meanSpearmanByRole})`,
    numbers: {
      complexityRank: rankOf(chosen.family),
      featureCount: chosen.featureCount,
      meanSpearmanByRole: chosen.meanSpearmanByRole,
      enumerationIndex: chosen.enumerationIndex,
    },
  });

  if (chosen.id === baseline.candidateId) {
    chain.push({
      stage: "tie_break",
      candidateId: baseline.candidateId,
      message: "il piu' semplice entro 1 SE e' B0: si serve B0 (§B.4.4)",
      numbers: { baselineMeanPrimaryLoss: baselineMeanLoss },
    });
    return {
      target,
      status: "B0",
      servedCandidateId: baseline.candidateId,
      admissibility,
      lowestMeanLossCandidateId: best.candidateId,
      oneStandardError,
      bootstrapInterval: null,
      statusByRole: uniformStatusByRole(baseline, "B0"),
      chain,
    };
  }

  // 6. `NO_VERDICT` se l'IC bootstrap season-block della differenza media
  //    contiene lo zero (§B.4.6). Un intervallo rifiutato per pochi blocchi e'
  //    anch'esso assenza di evidenza, quindi anch'esso `NO_VERDICT`.
  //
  // I blocchi sono i fold che vincitore e B0 hanno ENTRAMBI misurato: un
  // blocco `+∞` non e' una stagione con un risultato estremo, e' una stagione
  // senza risultato, e passarla al bootstrap significherebbe ricampionare un
  // numero che non c'e' (`seasonBlockBootstrap` infatti la rifiuta). Meno
  // blocchi rende piu' facile che l'intervallo sia rifiutato per pochi blocchi
  // — che e' `NO_VERDICT`, cioe' la conclusione giusta quando l'evidenza e'
  // poca. L'intersezione non e' mai vuota: un candidato ammissibile ha battuto
  // B0 in media su almeno un fold comune, altrimenti non sarebbe ammissibile.
  const versusBaselineOfChosen = pairedFoldComparison(chosen.perFold, baseline.primaryLossPerFold);
  const bootstrapInterval = seasonBlockBootstrap(versusBaselineOfChosen.differences, {
    replicates: input.bootstrap?.replicates ?? GEN_BOOTSTRAP_REPLICATES,
    seed: input.bootstrap?.seed ?? GEN_BOOTSTRAP_SEED,
  });
  const noVerdict = bootstrapInterval.insufficientBlocks || bootstrapInterval.containsZero;
  chain.push({
    stage: "bootstrap",
    candidateId: chosen.id,
    message: noVerdict
      ? `l'evidenza non distingue ${chosen.id} da B0 (IC 95% season-block ` +
        (bootstrapInterval.insufficientBlocks
          ? `rifiutato: ${bootstrapInterval.blocks} blocchi`
          : `[${String(bootstrapInterval.lower)}, ${String(bootstrapInterval.upper)}] contiene lo zero`) +
        "): NO_VERDICT, si serve B0"
      : `${chosen.id} batte B0 di ${bootstrapInterval.observedMean} (IC 95% season-block ` +
        `[${String(bootstrapInterval.lower)}, ${String(bootstrapInterval.upper)}], zero escluso; ` +
        `n = ${versusBaselineOfChosen.commonFolds} fold comuni)`,
    numbers: {
      observedMeanDifference: bootstrapInterval.observedMean,
      commonFolds: versusBaselineOfChosen.commonFolds,
      blocks: bootstrapInterval.blocks,
      replicates: bootstrapInterval.replicates,
      seed: bootstrapInterval.seed,
    },
  });

  if (noVerdict) {
    return {
      target,
      status: "NO_VERDICT",
      servedCandidateId: baseline.candidateId,
      admissibility,
      lowestMeanLossCandidateId: best.candidateId,
      oneStandardError,
      bootstrapInterval,
      statusByRole: uniformStatusByRole(baseline, "NO_VERDICT"),
      chain,
    };
  }

  // 7. stato per bersaglio-ruolo: il veto di §B.3.4 riporta a B0 i soli ruoli
  //    su cui il vincitore peggiora di oltre il 5%.
  const winnerVerdict = admissibility.find((v) => v.candidateId === chosen.id)!;
  const vetoed = new Set(winnerVerdict.roleVetoes.map((v) => v.role));
  const statusByRole: Partial<Record<GenRole, GenSelectionStatus>> = {};
  for (const role of GEN_ROLES) {
    if (baseline.primaryLossByRole[role] === undefined) continue;
    statusByRole[role] = vetoed.has(role) ? "B0" : "winner";
  }
  for (const veto of winnerVerdict.roleVetoes) {
    chain.push({
      stage: "admissibility",
      candidateId: chosen.id,
      message:
        `veto per ruolo ${veto.role}: ${chosen.id} peggiora del ` +
        `${(veto.relativeRegression * 100).toFixed(1)}% su B0 (soglia ${GEN_ROLE_REGRESSION_VETO * 100}%) — su quel ruolo resta B0`,
      numbers: {
        relativeRegression: veto.relativeRegression,
        candidateLoss: veto.candidateLoss,
        baselineLoss: veto.baselineLoss,
      },
    });
  }

  return {
    target,
    status: "winner",
    servedCandidateId: chosen.id,
    admissibility,
    lowestMeanLossCandidateId: best.candidateId,
    oneStandardError,
    bootstrapInterval,
    statusByRole,
    chain,
  };
}

function uniformStatusByRole(
  baseline: GenBaselineEvidence,
  status: GenSelectionStatus,
): Readonly<Partial<Record<GenRole, GenSelectionStatus>>> {
  const out: Partial<Record<GenRole, GenSelectionStatus>> = {};
  for (const role of GEN_ROLES) {
    if (baseline.primaryLossByRole[role] === undefined) continue;
    out[role] = status;
  }
  return out;
}

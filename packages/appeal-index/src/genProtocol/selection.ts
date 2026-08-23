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
  readonly meanPrimaryLoss: number;
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
  let foldWins = 0;
  for (let f = 0; f < candidate.primaryLossPerFold.length; f++) {
    if (candidate.primaryLossPerFold[f]! < baseline.primaryLossPerFold[f]!) foldWins++;
  }
  const required = requiredFoldWins(candidate.primaryLossPerFold.length);
  if (foldWins < required) failures.push("NOT_ENOUGH_FOLD_WINS");

  const meanPrimaryLoss = mean(candidate.primaryLossPerFold);
  const baselineMeanPrimaryLoss = mean(baseline.primaryLossPerFold);
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
  /** `media(perdita candidato) − media(perdita migliore)`; ≥ 0 per costruzione sul migliore. */
  readonly meanGap: number;
  /** SE delle differenze paired per fold rispetto al migliore. */
  readonly standardError: number;
  readonly withinOneStandardError: boolean;
  readonly complexityRank: number;
  readonly featureCount: number;
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
          `perdita media ${verdict.meanPrimaryLoss} contro ${verdict.baselineMeanPrimaryLoss} di B0` +
          (verdict.roleVetoes.length > 0
            ? `; veto per ruolo su ${verdict.roleVetoes.map((v) => v.role).join(", ")} (resta B0 la')`
            : "")
        : `${verdict.candidateId} inammissibile: ${verdict.failures.join(", ")}`,
      numbers: {
        coverageRatio: verdict.coverageRatio,
        foldWins: verdict.foldWins,
        requiredFoldWins: verdict.requiredFoldWins,
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

  // 3. perdita primaria media piu' bassa (§B.4.3).
  const meanLossOf = new Map<string, number>();
  for (const candidate of admissible) meanLossOf.set(candidate.candidateId, mean(candidate.primaryLossPerFold));
  let best = admissible[0]!;
  for (const candidate of admissible) {
    const a = meanLossOf.get(candidate.candidateId)!;
    const b = meanLossOf.get(best.candidateId)!;
    // Pareggio esatto sulla media: vince l'indice di enumerazione piu' basso,
    // cosi' il «migliore» non dipende dall'ordine di arrivo (§B.4.5).
    if (a < b || (a === b && candidate.enumerationIndex < best.enumerationIndex)) best = candidate;
  }
  chain.push({
    stage: "mean_primary_loss",
    candidateId: best.candidateId,
    message: `perdita media piu' bassa fra gli ammissibili: ${best.candidateId} (${meanLossOf.get(best.candidateId)!})`,
    numbers: { meanPrimaryLoss: meanLossOf.get(best.candidateId)!, admissibleCandidates: admissible.length },
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
    const differences = pairedBlockDifferences(contender.perFold, bestPerFold);
    const standardError = standardErrorOfPairedDifferences(differences);
    const meanGap = mean(contender.perFold) - bestMeanLoss;
    // Il migliore ha `meanGap === 0` ed e' dentro per definizione. Per gli
    // altri: dentro se il divario NON supera un errore standard. Un SE non
    // finito (meno di due fold) lascia fuori tutti tranne il migliore, invece
    // di far entrare tutti con un numero che non c'e'.
    const withinOneStandardError = meanGap <= 0 || (Number.isFinite(standardError) && meanGap <= standardError);
    return {
      candidateId: contender.id,
      meanGap,
      standardError,
      withinOneStandardError,
      complexityRank: rankOf(contender.family),
      featureCount: contender.featureCount,
    };
  });

  const tiedIds = new Set(oneStandardError.filter((e) => e.withinOneStandardError).map((e) => e.candidateId));
  const tied = contenders.filter((c) => tiedIds.has(c.id));
  chain.push({
    stage: "one_standard_error",
    candidateId: best.candidateId,
    message:
      `regola 1-SE rispetto a ${best.candidateId}: ${tied.length} candidati entro un errore standard ` +
      `(${tied.map((c) => c.id).join(", ")})`,
    numbers: { tiedCandidates: tied.length, bestMeanPrimaryLoss: bestMeanLoss },
  });

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
  const differencesVsBaseline = pairedBlockDifferences(chosen.perFold, baseline.primaryLossPerFold);
  const bootstrapInterval = seasonBlockBootstrap(differencesVsBaseline, {
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
        `[${String(bootstrapInterval.lower)}, ${String(bootstrapInterval.upper)}], zero escluso)`,
    numbers: {
      observedMeanDifference: bootstrapInterval.observedMean,
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

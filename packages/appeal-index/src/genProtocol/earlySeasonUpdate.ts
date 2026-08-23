// GEN-PROTOCOL-A §D.15 — il layer delle prime giornate. PURO.
//
// Che cosa fa e perche' e' ammesso. I voti ufficiali sono per giornata su tutte
// le stagioni storiche, quindi «che cosa si sapeva dopo la giornata G» e'
// RICOSTRUIBILE, e il valore predittivo della presenza nelle prime G giornate
// si stima dai dati invece di ipotizzarlo. E' l'unica deroga all'anteriorita'
// di §G, ed e' circoscritta per iscritto: le sole informazioni della stagione
// target ammesse sono `p_1 … p_G` e `r_G`. Ogni altro uso della stagione
// target resta vietato — e l'audit di questo modulo, riga per riga, e' cio' che
// rende la deroga verificabile invece che dichiarata.
//
// DUE LIVELLI DI G, tenuti separati apposta:
//
//   1. la MECCANICA e' G-generica. Nessun numero cablato in `buildEarlyEvidence`,
//      nelle formule, nei clamp o nell'audit: G e' sempre un parametro. Non e'
//      generalita' gratuita — e' la richiesta esplicita del committente, che
//      vuole poter riusare il layer dopo l'asta (mercato di riparazione,
//      valutazioni in-season) senza rimetterci mano. Il test «meccanica con
//      G = 5» esiste per dimostrare che la genericita' e' reale e non promessa;
//   2. l'ISTANZA DI PROTOCOLLO e' congelata: `G ∈ {1, 2, 3}`
//      (`GEN_EARLY_SEASON_G_SET`). Per CIASCUN G si ricostruiscono i fold
//      storici a quel G e si corre la gara U0/U1_G/U2_G. La selezione e'
//      per-G, e fra G diversi non si confronta NULLA: «non sono candidati in
//      gara fra loro, sono contingenze di calendario». Il G effettivo al
//      serving lo determina la disponibilita' reale dei file
//      (`G_eff = min(3, giornate con XLSX validato)`), `G_eff = 0` -> layer
//      inattivo (U0). Oltre G = 3: versione successiva del protocollo, mai
//      un'estensione in corsa.
//
// Che cosa il layer NON fa (§D.15.9): nessun aggiornamento di T2/qualita' da
// due giornate; nessuna previsione di formazioni future; nessun uso delle
// statistiche in-corso come feature. E nessuna superficie che assomigli a un
// consiglio di formazione: resta un artefatto, e il no-go che lo vieta e'
// vigente.

import { ZERO_VARIANCE_THRESHOLD } from "../featureMatrix.js";
import { solveRidge } from "../models/ridgeCore.js";
import { isValidPresence, SEASON_MATCHDAYS, type GenRole, type MatchdayVote } from "./genTypes.js";
import { GEN_LAYER_COMPLEXITY_ORDER, selectGenCandidate, type GenSelectionInput, type GenSelectionResult } from "./selection.js";

export class EarlySeasonLayerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EarlySeasonLayerError";
  }
}

/**
 * L'insieme CONGELATO dei G di protocollo (§D.15, v2.0.0): `{1, 2, 3}`.
 *
 * Congelata e' la REGOLA, non il numero: la calibrazione gira per tutti e tre i
 * G sui fold storici, e quale si applichi al run finale lo decide la
 * disponibilita' dei file. Un G fuori da questo insieme non e' un'istanza di
 * protocollo: la meccanica lo accetta come parametro esplicito — ed e' il
 * senso di averla scritta generica — ma il percorso preregistrato lo rifiuta.
 */
export const GEN_EARLY_SEASON_G_SET: readonly number[] = [1, 2, 3] as const;

/** La griglia interna di λ per U2 (§D.15.2): scelta sul fold interno, regola dei due livelli §D.2. */
export const EARLY_RIDGE_LAMBDA_GRID: readonly number[] = [0.1, 1, 10] as const;

/** `true` se `G` e' un'istanza di protocollo (§D.15). `G = 0` significa layer inattivo. */
export function isProtocolG(G: number): boolean {
  return GEN_EARLY_SEASON_G_SET.includes(G);
}

/** Rifiuta un `G` fuori dall'insieme congelato: il percorso preregistrato non improvvisa. */
export function assertProtocolG(G: number): void {
  if (!isProtocolG(G)) {
    throw new EarlySeasonLayerError(
      `assertProtocolG: G = ${String(G)} non e' un'istanza di protocollo. §D.15 congela ` +
        `G ∈ {${GEN_EARLY_SEASON_G_SET.join(", ")}}; G = 0 significa layer inattivo (U0). ` +
        "Un G diverso e' uso futuro fuori protocollo v2.0.0 e va passato esplicitamente alla meccanica.",
    );
  }
}

/** L'evidenza delle prime G giornate per un giocatore (§D.15.1). */
export interface EarlyEvidence {
  /** La finestra osservata. Viaggia col dato: un'evidenza senza il suo G non e' interpretabile. */
  readonly G: number;
  /** `p_1 … p_G`, ciascuno 0/1: presenza valida (§A.1, `6*` inclusa). */
  readonly p: readonly number[];
  /** `Σ p_g`: le presenze gia' in cassaforte. */
  readonly sumP: number;
  /** `r_G = 1` se `Rf + Rs ≥ 1` nelle giornate 1..G (§D.15.1). */
  readonly rG: 0 | 1;
}

/** Una violazione dell'anteriorita' del layer: una riga oltre la giornata G. */
export interface EarlyEvidenceViolation {
  readonly matchday: number;
  readonly G: number;
  readonly message: string;
}

export interface EarlyEvidenceAudit {
  readonly righeVerificate: number;
  readonly violazioni: readonly EarlyEvidenceViolation[];
}

/**
 * L'audit di §D.15.6 in forma di report: ogni riga porta la propria giornata e
 * si verifica `giornata ≤ G`.
 *
 * E' la funzione che il canarino mette alla prova piantando una presenza alla
 * giornata `G + 1`: se questa non la intercettasse, la deroga di §G sarebbe
 * senza guardia — e una deroga senza guardia e' un permesso.
 */
export function auditEarlyEvidence(matchdays: readonly MatchdayVote[], G: number): EarlyEvidenceAudit {
  assertFiniteG(G);
  const violazioni: EarlyEvidenceViolation[] = [];
  for (const row of matchdays) {
    if (!Number.isInteger(row.matchday) || row.matchday < 1) {
      violazioni.push({
        matchday: row.matchday,
        G,
        message: `giornata '${String(row.matchday)}' non e' un intero ≥ 1: una riga senza giornata non e' verificabile`,
      });
      continue;
    }
    if (row.matchday > G) {
      violazioni.push({
        matchday: row.matchday,
        G,
        message:
          `giornata ${String(row.matchday)} > G = ${String(G)}: e' informazione della stagione target fuori ` +
          "dalla deroga di §D.15.6, cioe' leakage",
      });
    }
  }
  return { righeVerificate: matchdays.length, violazioni };
}

/**
 * Costruisce l'evidenza `E_G` dalle giornate 1..G della stagione target.
 *
 * L'assert riga per riga e' dentro la costruzione, non accanto: un'evidenza
 * costruita da righe non verificate non deve poter esistere nemmeno per un
 * istante, perche' l'istante dopo qualcuno la userebbe.
 */
export function buildEarlyEvidence(matchdays: readonly MatchdayVote[], G: number): EarlyEvidence {
  assertFiniteG(G);
  const audit = auditEarlyEvidence(matchdays, G);
  const first = audit.violazioni[0];
  if (first !== undefined) {
    throw new EarlySeasonLayerError(`buildEarlyEvidence: ${first.message}`);
  }
  const p = new Array<number>(G).fill(0);
  let rG: 0 | 1 = 0;
  for (const row of matchdays) {
    const index = row.matchday - 1;
    if (isValidPresence(row)) p[index] = 1;
    if (row.Rf + row.Rs >= 1) rG = 1;
  }
  let sumP = 0;
  for (const value of p) sumP += value;
  return { G, p, sumP, rG };
}

function assertFiniteG(G: number): void {
  if (!Number.isInteger(G) || G < 1 || G > SEASON_MATCHDAYS) {
    throw new EarlySeasonLayerError(
      `G deve essere un intero fra 1 e ${String(SEASON_MATCHDAYS)}; ricevuto '${String(G)}'. ` +
        "G = 0 non si passa qui: significa layer inattivo, e chi lo sa e' il chiamante.",
    );
  }
}

/**
 * U1 — l'aritmetica dichiarata (§D.15.2):
 * `Σp_g + N̂_base·(38 − G)/38`, clamp a `[Σp_g, Σp_g + 38 − G]`.
 *
 * Il clamp non e' cosmesi: senza estremo inferiore la stima potrebbe scendere
 * sotto presenze GIA' OSSERVATE (un fatto), e senza estremo superiore potrebbe
 * promettere piu' partite di quante ne restino da giocare.
 */
export function predictEarlyU1(evidence: EarlyEvidence, nBase: number): number {
  const remaining = SEASON_MATCHDAYS - evidence.G;
  if (!Number.isFinite(nBase)) return NaN;
  const prorata = (nBase * remaining) / SEASON_MATCHDAYS;
  const raw = evidence.sumP + prorata;
  return Math.min(evidence.sumP + remaining, Math.max(evidence.sumP, raw));
}

/** Una riga di training del ridge U2 (§D.15.2). */
export interface EarlyTrainingRow {
  readonly role: GenRole;
  readonly evidence: EarlyEvidence;
  /** `N̂_base`: predizione OUT-OF-FOLD dell'incumbent T-N sul medesimo fold. Mai in-sample. */
  readonly nBaseOof: number;
  /** `N_rest`: presenze valide nelle giornate G+1..38 della stagione target. */
  readonly nRest: number;
}

export interface FittedEarlyRidgeParameters {
  readonly artifactVersion: "gen-early-ridge-parameters-v1";
  readonly G: number;
  readonly role: GenRole;
  /** `["nBase", "p1", …, "pG"]` — l'ordine e' il contratto della predizione. */
  readonly featureNames: readonly string[];
  readonly means: readonly number[];
  readonly stds: readonly number[];
  readonly intercept: number;
  readonly coefficients: readonly number[];
  readonly lambda: number;
  readonly trainingRowCount: number;
  readonly excludedRowCount: number;
}

/** I nomi dei regressori di U2 a un dato G: `N̂_base` e le G presenze osservate. */
export function earlyRidgeFeatureNames(G: number): readonly string[] {
  assertFiniteG(G);
  const names = ["nBase"];
  for (let g = 1; g <= G; g++) names.push(`p${String(g)}`);
  return names;
}

/**
 * U2 — la ridge per ruolo su `N_rest` (§D.15.2).
 *
 * Il bersaglio e' `N_rest`, non `N` totale: le presenze gia' osservate non si
 * predicono, si sommano. Fittare sul totale significherebbe chiedere al modello
 * di imparare a copiare un pezzo del proprio input.
 *
 * Il solver e' `solveRidge` di `../models/ridgeCore.ts`, lo stesso che serve le
 * altre famiglie ridge del package: un secondo solver sottilmente diverso
 * renderebbe i verdetti non confrontabili con quelli che gli stanno accanto nel
 * report — e' scritto nell'intestazione di quel modulo, e vale anche qui.
 */
export function fitEarlyRidge(
  trainRows: readonly EarlyTrainingRow[],
  G: number,
  role: GenRole,
  lambda: number,
): FittedEarlyRidgeParameters {
  assertFiniteG(G);
  const featureNames = earlyRidgeFeatureNames(G);
  const usable = trainRows.filter(
    (row) =>
      row.role === role &&
      row.evidence.G === G &&
      Number.isFinite(row.nBaseOof) &&
      Number.isFinite(row.nRest) &&
      row.evidence.p.length === G,
  );
  if (usable.length === 0) throw new EarlySeasonLayerError(`fitEarlyRidge: nessuna riga utilizzabile per ruolo '${role}' a G = ${String(G)}`);

  const raw = usable.map((row) => [row.nBaseOof, ...row.evidence.p]);
  const y = usable.map((row) => row.nRest);
  const width = featureNames.length;
  const means = new Array<number>(width).fill(0);
  const stds = new Array<number>(width).fill(0);
  for (let j = 0; j < width; j++) {
    let sum = 0;
    for (const row of raw) sum += row[j]!;
    means[j] = sum / raw.length;
    let variance = 0;
    for (const row of raw) variance += (row[j]! - means[j]!) ** 2;
    stds[j] = Math.sqrt(variance / raw.length);
  }
  // Colonna a varianza nulla -> colonna di zeri, quindi coefficiente 0: la
  // stessa soglia `1e-9` di `../featureMatrix.ts`, riusata per non avere due
  // idee di «varianza nulla» nello stesso package. Succede davvero: con G = 1,
  // in un fold in cui tutti i titolari hanno giocato la prima, `p1` e' costante.
  const standardized = raw.map((row) => row.map((value, j) => (stds[j]! > ZERO_VARIANCE_THRESHOLD ? (value - means[j]!) / stds[j]! : 0)));
  const solution = solveRidge(standardized, y, lambda);
  return {
    artifactVersion: "gen-early-ridge-parameters-v1",
    G,
    role,
    featureNames,
    means,
    stds,
    intercept: solution.intercept,
    coefficients: solution.coefficients,
    lambda,
    trainingRowCount: usable.length,
    excludedRowCount: trainRows.filter((row) => row.role === role).length - usable.length,
  };
}

/**
 * U2 — la predizione: `Σp_g + f̂(N̂_base, p_1…p_G)` con `f̂` clampata a
 * `[0, 38 − G]` (§D.15.2).
 *
 * Il clamp e' sulla PARTE PREDETTA, non sul totale: `f̂` stima le presenze
 * residue, e non ne esistono meno di zero ne' piu' di quante giornate restino.
 */
export function predictEarlyU2(
  parameters: FittedEarlyRidgeParameters,
  evidence: EarlyEvidence,
  nBase: number,
): number {
  if (evidence.G !== parameters.G) {
    throw new EarlySeasonLayerError(
      `predictEarlyU2: l'artefatto e' calibrato a G = ${String(parameters.G)} e l'evidenza porta G = ${String(evidence.G)}`,
    );
  }
  if (!Number.isFinite(nBase)) return NaN;
  const values = [nBase, ...evidence.p];
  let rest = parameters.intercept;
  for (let j = 0; j < parameters.coefficients.length; j++) {
    const std = parameters.stds[j]!;
    const standardized = std > ZERO_VARIANCE_THRESHOLD ? (values[j]! - parameters.means[j]!) / std : 0;
    rest += standardized * parameters.coefficients[j]!;
  }
  const remaining = SEASON_MATCHDAYS - evidence.G;
  const clamped = Math.min(remaining, Math.max(0, rest));
  return evidence.sumP + clamped;
}

/** Gli esiti possibili della gara di un G. */
export type EarlyLayerWinner = "U0" | "U1" | "U2";

export interface EarlyLayerSelection {
  readonly G: number;
  readonly winner: EarlyLayerWinner;
  readonly selection: GenSelectionResult;
}

/**
 * La gara U0/U1_G/U2_G di UN G (§D.15.2), con le primitive di `selection.ts`.
 *
 * Non c'e' una riga di logica di selezione qui: si passa l'ordine di
 * complessita' del layer alla stessa `selectGenCandidate` che serve tutti gli
 * altri bersagli. Ammissibilita', 4/7, veto per ruolo, regola 1-SE, bootstrap e
 * `NO_VERDICT` restano quelli di §B.3/§B.4, invariati — che e' esattamente
 * quanto §D.15.2 prescrive.
 *
 * `U0` e' la baseline della gara, quindi `NO_VERDICT` e `B0` significano
 * entrambi «il layer non si accende»: e' un esito registrato, non un
 * fallimento (§D.15.8).
 */
export function selectEarlyLayerForG(input: GenSelectionInput & { readonly G: number }): EarlyLayerSelection {
  assertFiniteG(input.G);
  const selection = selectGenCandidate({
    ...input,
    complexityOrder: GEN_LAYER_COMPLEXITY_ORDER,
    baseline: { ...input.baseline, family: input.baseline.family ?? "U0" },
  });
  const winnerFamily =
    selection.status === "winner"
      ? input.candidates.find((candidate) => candidate.candidateId === selection.servedCandidateId)?.family
      : undefined;
  const winner: EarlyLayerWinner =
    winnerFamily === "U1" ? "U1" : winnerFamily === "U2" ? "U2" : "U0";
  return { G: input.G, winner, selection };
}

/** La sezione layer di una ricetta, per UN G dell'insieme congelato (§D.15.2, §K). */
export interface EarlyLayerRecipeEntry {
  readonly G: number;
  readonly winner: EarlyLayerWinner;
  /** I coefficienti per ruolo di U2; vuoto quando il vincitore e' U0 o U1. */
  readonly ridgeByRole: Readonly<Partial<Record<GenRole, FittedEarlyRidgeParameters>>>;
  /** Stato della selezione, cosi' com'e' uscito da §B.4: `winner | B0 | NO_VERDICT`. */
  readonly selectionStatus: GenSelectionResult["status"];
}

/**
 * Applica il layer con il G EFFETTIVO del run.
 *
 * `G = 0` -> layer inattivo, si restituisce `N̂_base` (U0) e lo si scrive nel
 * manifest. Un G senza entry nella ricetta e' un errore esplicito: servire un
 * G non calibrato significherebbe usare parametri stimati per un'altra
 * finestra, che e' un modo silenzioso di sbagliare.
 */
export function applyEarlyLayer(
  entries: readonly EarlyLayerRecipeEntry[],
  effectiveG: number,
  role: GenRole,
  nBase: number,
  evidence: EarlyEvidence | null,
): { readonly nLayer: number; readonly applied: EarlyLayerWinner; readonly G: number } {
  if (effectiveG === 0 || evidence === null) {
    return { nLayer: nBase, applied: "U0", G: 0 };
  }
  const entry = entries.find((candidate) => candidate.G === effectiveG);
  if (entry === undefined) {
    throw new EarlySeasonLayerError(
      `applyEarlyLayer: la ricetta non ha una entry per G = ${String(effectiveG)} ` +
        `(calibrati: ${entries.map((e) => e.G).join(", ") || "nessuno"})`,
    );
  }
  if (evidence.G !== effectiveG) {
    throw new EarlySeasonLayerError(
      `applyEarlyLayer: evidenza a G = ${String(evidence.G)} con G effettivo ${String(effectiveG)}`,
    );
  }
  if (entry.winner === "U0") return { nLayer: nBase, applied: "U0", G: effectiveG };
  if (entry.winner === "U1") return { nLayer: predictEarlyU1(evidence, nBase), applied: "U1", G: effectiveG };
  const ridge = entry.ridgeByRole[role];
  if (ridge === undefined) {
    throw new EarlySeasonLayerError(
      `applyEarlyLayer: U2 vincente a G = ${String(effectiveG)} ma nessun artefatto per il ruolo '${role}'`,
    );
  }
  return { nLayer: predictEarlyU2(ridge, evidence, nBase), applied: "U2", G: effectiveG };
}

// GEN-PROTOCOL-A §K — GEN-RECIPE@1.0.0: la ricetta, scritta e ispezionabile. PURA.
//
// «la ricetta finale: coefficienti, tabelle rango→prezzo, tetti GE ratificati,
// tutto scritto, versionato, ispezionabile» — il file `GEN-RECIPE` versionato
// sotto `recipes/`, fuori dal repository (§K). E la decisione del 2026-08-21:
// i pesi empirici selezionati dal generatore sono «scritti nella ricetta,
// versionati, ispezionabili, mai impliciti».
//
// La proprieta' che rende vera quella frase non e' il formato, e' il
// ROUNDTRIP: `fit → serialize → apply` deve produrre le STESSE predizioni del
// modello appena fittato. Se non lo facesse, la ricetta sarebbe un resoconto
// del modello, non il modello — e il giorno dell'asta girerebbe qualcosa di
// diverso da cio' che e' stato validato. Il test che lo verifica e' la ragione
// per cui questo modulo esiste separato dai fitter.
//
// La ricetta non contiene dati: contiene parametri, tabelle e versioni. Nessun
// nome di giocatore, nessuna quotazione, nessun identificatore privato — gli
// artefatti veri vivono fuori dal repository (§K), qui c'e' solo la forma.

import { predictWithBoostedStumps, type FittedBoostedStumpsParameters } from "./boostedStumps.js";
import {
  predictB0N,
  predictB0T1,
  predictB0T2,
  type B0PredictionInput,
  type FittedB0Parameters,
} from "./baselinesB0.js";
import {
  applyEarlyLayer,
  GEN_EARLY_SEASON_G_SET,
  type EarlyEvidence,
  type EarlyLayerRecipeEntry,
} from "./earlySeasonUpdate.js";
import { predictWithElasticNet, type FittedElasticNetParameters } from "./elasticNet.js";
import { applyExpertCaps, EXPERT_HEALTH_CAPS, EXPERT_STARTER_CAPS, type ExpertScores } from "./expertCaps.js";
import type { GenFeatureSet } from "./featureCatalog.js";
import type { GenRole, GenTargetId } from "./genTypes.js";
import { predictMarcel, type FittedMarcelParameters, type MarcelObservation } from "./shrinkageMarcel.js";
import type { GenPriceCurve, PriceResidualBand } from "./priceCurve.js";
import type { GenSelectionStatus } from "./selection.js";

/** La versione della ricetta (§K). Cambia con la sua FORMA, non col suo contenuto. */
export const GEN_RECIPE_VERSION = "GEN-RECIPE@1.0.0";

/** Il protocollo che l'ha prodotta, e la sua versione (§C, sigillo). */
export const GEN_RECIPE_PROTOCOL_ID = "GEN-PROTOCOL-A";
export const GEN_RECIPE_PROTOCOL_VERSION = "2.0.0";

export class GenRecipeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenRecipeError";
  }
}

/**
 * Un fattore di un composto chiede le osservazioni del PROPRIO bersaglio e non
 * le trova.
 *
 * Non e' un `GenRecipeError` qualunque perche' non e' un errore qualunque: e'
 * l'unico punto in cui il silenzio del chiamante produrrebbe un numero
 * plausibile e sbagliato. Un fattore FAM-1 senza osservazioni predice la media
 * di ruolo — che alla radice e' la definizione della famiglia (il giocatore
 * nuovo, §D.2), dentro un composto e' invece una degradazione muta: il
 * chiamante non sa quali fattori il composto contenga, quindi la sua omissione
 * non e' una dichiarazione sul giocatore, e' un'informazione mancante.
 * Si dice, non si stima.
 */
export class GenRecipeMissingObservationsError extends GenRecipeError {
  /** Il bersaglio del FATTORE che ha chiesto le osservazioni. */
  readonly missingTarget: GenTargetId;
  /** Il bersaglio del COMPOSTO che lo contiene: serve a dire dove guardare. */
  readonly compositeTarget: GenTargetId;

  constructor(missingTarget: GenTargetId, compositeTarget: GenTargetId) {
    super(
      `applyModel: il fattore '${missingTarget}' del composto '${compositeTarget}' e' FAM-1 e chiede le osservazioni del PROPRIO bersaglio, ` +
        `che non sono in \`marcelObservationsByTarget\`. Ogni fattore misura una grandezza diversa: passare le osservazioni di un bersaglio all'altro ` +
        `applicherebbe un composto diverso da quello misurato. Per dichiarare che il giocatore non ha stagioni osservate su '${missingTarget}', ` +
        `passare una lista VUOTA — l'assenza della chiave non e' una dichiarazione.`,
    );
    this.name = "GenRecipeMissingObservationsError";
    this.missingTarget = missingTarget;
    this.compositeTarget = compositeTarget;
  }
}

/**
 * Un modello serializzato, una variante per famiglia.
 *
 * FAM-3 e' ricorsiva perche' e' un COMPOSTO: `T1̂ = T2̂ × N̂` coi vincitori dei
 * rispettivi bersagli (§D.2). Serializzare il prodotto invece dei due fattori
 * perderebbe proprio l'informazione che rende il composto interessante — quale
 * dei due pezzi sbaglia.
 */
export type GenSerializedModel =
  | { readonly family: "B0"; readonly parameters: FittedB0Parameters }
  | { readonly family: "FAM-1"; readonly parameters: FittedMarcelParameters }
  | { readonly family: "FAM-2"; readonly parameters: FittedElasticNetParameters }
  | { readonly family: "FAM-4"; readonly parameters: FittedBoostedStumpsParameters }
  | { readonly family: "FAM-3"; readonly t2: GenSerializedModel; readonly tN: GenSerializedModel };

/** L'esito della selezione per un bersaglio-RUOLO (§B.4: lo stato si legge cosi'). */
export interface GenRecipeEntry {
  readonly target: GenTargetId;
  readonly role: GenRole;
  readonly status: GenSelectionStatus;
  /** L'id servito: il vincitore, oppure quello della baseline con `B0`/`NO_VERDICT`. */
  readonly servedCandidateId: string;
  /** Il modello da applicare. Con `B0`/`NO_VERDICT` e' l'artefatto B0: si serve un numero, non il nulla. */
  readonly model: GenSerializedModel;
  /** Il set di feature del vincitore; `null` per le famiglie che non ne usano uno. */
  readonly featureSet: GenFeatureSet | null;
  /** `q̂_r` conformal del ruolo (§B.5); `null` dove l'intervallo non e' definito. */
  readonly conformalRadius: number | null;
}

/** La sezione prezzi: la tabella scritta, coi quantili dei residui per fascia (§B.5, §D.11). */
export interface GenRecipePriceSection {
  readonly curve: GenPriceCurve;
  readonly residualBands: readonly PriceResidualBand[];
}

/** La sezione layer prime giornate (§D.15): una entry per ogni G dell'insieme congelato. */
export interface GenRecipeLayerSection {
  /** L'insieme congelato dei G calibrati. */
  readonly gSet: readonly number[];
  readonly entries: readonly EarlyLayerRecipeEntry[];
}

export interface GenRecipe {
  readonly recipeVersion: string;
  readonly protocolId: string;
  readonly protocolVersion: string;
  /** Versione del core pubblico che l'ha prodotta: la ricetta sa da che codice viene. */
  readonly coreVersion: string;
  /** Hash sha256 del documento di protocollo al merge (§C, sigillo). */
  readonly protocolHash: string;
  /** Impronta del contenuto del dataset: nessun confronto attraversa due impronte (§C). */
  readonly datasetContentFingerprint: string;
  /** I semi preregistrati usati (§C). */
  readonly seeds: Readonly<Record<string, number>>;
  /** La stagione per cui la ricetta e' costruita. */
  readonly targetSeason: string;
  readonly entries: readonly GenRecipeEntry[];
  readonly priceCurves: readonly GenRecipePriceSection[];
  /** I tetti GE ratificati, copiati nella ricetta perche' siano ispezionabili senza il codice (§D.10.2). */
  readonly expertCaps: {
    readonly starter: typeof EXPERT_STARTER_CAPS;
    readonly health: typeof EXPERT_HEALTH_CAPS;
  };
  readonly layer: GenRecipeLayerSection;
}

export interface BuildRecipeInput {
  readonly coreVersion: string;
  readonly protocolHash: string;
  readonly datasetContentFingerprint: string;
  readonly seeds: Readonly<Record<string, number>>;
  readonly targetSeason: string;
  readonly entries: readonly GenRecipeEntry[];
  readonly priceCurves: readonly GenRecipePriceSection[];
  readonly layer: GenRecipeLayerSection;
}

/**
 * Costruisce la ricetta.
 *
 * Le uniche cose che questa funzione decide sono le costanti di versione e la
 * copia della tabella dei tetti: tutto il resto arriva dal chiamante, che e'
 * l'orchestratore che ha fatto girare la selezione. Una funzione che
 * ricalcolasse qualcosa qui produrrebbe una ricetta che non e' quella che e'
 * stata validata.
 */
export function buildGenRecipe(input: BuildRecipeInput): GenRecipe {
  for (const entry of input.layer.entries) {
    if (!input.layer.gSet.includes(entry.G)) {
      throw new GenRecipeError(
        `buildGenRecipe: la sezione layer ha una entry per G = ${String(entry.G)} fuori dall'insieme dichiarato [${input.layer.gSet.join(", ")}]`,
      );
    }
  }
  return {
    recipeVersion: GEN_RECIPE_VERSION,
    protocolId: GEN_RECIPE_PROTOCOL_ID,
    protocolVersion: GEN_RECIPE_PROTOCOL_VERSION,
    coreVersion: input.coreVersion,
    protocolHash: input.protocolHash,
    datasetContentFingerprint: input.datasetContentFingerprint,
    seeds: input.seeds,
    targetSeason: input.targetSeason,
    entries: input.entries,
    priceCurves: input.priceCurves,
    expertCaps: { starter: EXPERT_STARTER_CAPS, health: EXPERT_HEALTH_CAPS },
    layer: input.layer,
  };
}

/**
 * Le osservazioni storiche del giocatore, indicizzate per BERSAGLIO.
 *
 * Le osservazioni di FAM-1 non sono «la storia del giocatore» in astratto: sono
 * la storia di UNA grandezza (fantamedia per T2, presenze per T-N, …), perche'
 * `value` e' «il valore osservato del bersaglio in quella stagione»
 * (`shrinkageMarcel.MarcelObservation`). Nei round di misura ogni candidato
 * riceve le osservazioni del bersaglio che sta misurando; un composto che le
 * mescolasse applicherebbe un modello diverso da quello misurato.
 *
 * E' una mappa di dati, non una lookup function, per una ragione precisa: la
 * forma applicabile della ricetta resta JSON-serializzabile, quindi un input di
 * serving puo' attraversare un confine di processo come lo attraversa la
 * ricetta (§K). Una funzione di lookup non sopravviverebbe a `JSON.stringify`.
 */
export type GenMarcelObservationsByTarget = Readonly<Partial<Record<GenTargetId, readonly MarcelObservation[]>>>;

/** Tutto cio' che serve ad applicare la ricetta a UNA riga. */
export interface GenApplyInput {
  readonly target: GenTargetId;
  readonly role: GenRole;
  /** Le feature della riga (`featureCatalog.buildGenFeatureRows`). */
  readonly features: Readonly<Record<string, number>>;
  /**
   * Le osservazioni storiche del giocatore per il bersaglio `target`: la forma
   * breve, sufficiente finche' il modello NON e' un composto.
   *
   * Vale solo alla radice: un fattore di FAM-3 misura un altro bersaglio e non
   * legge mai questo campo. Dove entrambi i campi parlano dello stesso
   * bersaglio vince `marcelObservationsByTarget`, che e' il piu' esplicito.
   */
  readonly marcelObservations?: readonly MarcelObservation[];
  /**
   * Le osservazioni storiche per bersaglio: la forma che un composto richiede.
   *
   * FAM-3 e' `T1̂ = T2̂ × N̂` (§D.2): i due fattori vivono su bersagli diversi,
   * quindi un fattore FAM-1 va servito con le osservazioni del proprio. Se il
   * fattore le chiede e la chiave manca, `applyModel` lancia
   * `GenRecipeMissingObservationsError` invece di degradare in silenzio alla
   * media di ruolo. Una lista VUOTA e' invece una dichiarazione legittima
   * («nessuna stagione osservata su quel bersaglio») e produce la media di
   * ruolo, che per §D.2 e' esattamente il caso del giocatore nuovo.
   */
  readonly marcelObservationsByTarget?: GenMarcelObservationsByTarget;
  /** I fatti di `s−1`: servono a B0. */
  readonly b0Input?: B0PredictionInput;
  /** Evidenza delle prime giornate: se presente, il layer di §D.15 si applica a T-N. */
  readonly earlyEvidence?: EarlyEvidence | null;
  /** Il G EFFETTIVO del run (§D.15.7). `0` = layer inattivo. */
  readonly effectiveG?: number;
  /** I punteggi degli esperti: se presenti, i tetti si applicano DOPO il layer (§D.15.3). */
  readonly expertScores?: ExpertScores;
}

export interface GenApplyResult {
  readonly target: GenTargetId;
  readonly role: GenRole;
  /** La predizione servita, dopo layer e tetti dove si applicano. */
  readonly prediction: number;
  /** La predizione del solo modello, prima del layer e dei tetti. */
  readonly modelPrediction: number;
  readonly servedCandidateId: string;
  readonly status: GenSelectionStatus;
  /** Intervallo conformal `pred ± q̂_r` (§B.5); `null` se il raggio non c'e'. */
  readonly interval: { readonly lower: number; readonly upper: number } | null;
  /** Quale candidato del layer e' stato applicato, e a quale G. */
  readonly layerApplied: "U0" | "U1" | "U2" | null;
  readonly layerG: number | null;
  /** `true` se un tetto GE ha morso (§D.10.2, sensibilita' obbligatoria). */
  readonly capApplied: boolean;
}

/**
 * Applica la ricetta a una riga.
 *
 * L'ordine e' quello di §D.15.3 e non e' negoziabile: modello -> layer prime
 * giornate -> tetti GE. Il layer puo' alzare (una presenza osservata e' un
 * fatto), i tetti possono solo abbassare (un giudizio non promette).
 */
export function applyRecipe(recipe: GenRecipe, input: GenApplyInput): GenApplyResult {
  const entry = recipe.entries.find((candidate) => candidate.target === input.target && candidate.role === input.role);
  if (entry === undefined) {
    throw new GenRecipeError(
      `applyRecipe: la ricetta non ha una entry per (${input.target}, ${input.role}) — servire un bersaglio-ruolo non selezionato sarebbe inventare un verdetto`,
    );
  }

  const modelPrediction = applyModel(entry.model, input);
  let prediction = modelPrediction;
  let layerApplied: "U0" | "U1" | "U2" | null = null;
  let layerG: number | null = null;
  let capApplied = false;

  if (input.target === "TN") {
    const effectiveG = input.effectiveG ?? 0;
    if (effectiveG !== 0 && !GEN_EARLY_SEASON_G_SET.includes(effectiveG)) {
      throw new GenRecipeError(
        `applyRecipe: G effettivo ${String(effectiveG)} fuori dall'insieme congelato [${GEN_EARLY_SEASON_G_SET.join(", ")}] (§D.15)`,
      );
    }
    const layer = applyEarlyLayer(recipe.layer.entries, effectiveG, input.role, prediction, input.earlyEvidence ?? null);
    prediction = layer.nLayer;
    layerApplied = layer.applied;
    layerG = layer.G;

    if (input.expertScores !== undefined) {
      const capped = applyExpertCaps(prediction, input.expertScores);
      prediction = capped.capped;
      capApplied = capped.capApplied;
    }
  }

  const interval =
    entry.conformalRadius === null || !Number.isFinite(prediction)
      ? null
      : { lower: prediction - entry.conformalRadius, upper: prediction + entry.conformalRadius };

  return {
    target: input.target,
    role: input.role,
    prediction,
    modelPrediction,
    servedCandidateId: entry.servedCandidateId,
    status: entry.status,
    interval,
    layerApplied,
    layerG,
    capApplied,
  };
}

/**
 * La predizione di UN modello serializzato.
 *
 * Una famiglia che non trova cio' che le serve nell'input NON improvvisa: FAM-1
 * senza osservazioni predice la media di ruolo (che e' la sua definizione),
 * B0 senza i fatti di `s−1` lancia. La differenza e' che nel primo caso il
 * fallback e' scritto nel protocollo, nel secondo mancherebbe un ingrediente.
 *
 * Dentro un composto quella simmetria si rompe, ed e' il motivo di
 * `GenRecipeMissingObservationsError`: la media di ruolo di un FATTORE non e'
 * un fallback dichiarato dal protocollo, e' un ingrediente mancante travestito
 * da numero.
 */
export function applyModel(model: GenSerializedModel, input: GenApplyInput): number {
  return applyModelForTarget(model, input, input.target, null);
}

/**
 * Il motore di `applyModel`, con il bersaglio ESPLICITO invece che implicito
 * nell'input.
 *
 * Il bersaglio viaggia come parametro e non come campo riscritto dell'input
 * (`{ ...input, target: "T2" }`) perche' un fattore di FAM-3 non e' l'input con
 * un campo diverso: e' una domanda diversa, su un'altra grandezza. Rendere la
 * differenza un parametro e' cio' che permette di risolvere le osservazioni sul
 * bersaglio giusto — e di sapere, in `factorOf`, se stiamo servendo la radice o
 * un pezzo di un composto.
 *
 * @param target il bersaglio di QUESTO modello: `input.target` alla radice, il
 *   bersaglio del fattore dentro un composto.
 * @param factorOf `null` alla radice; dentro un composto, il bersaglio del
 *   composto che ha chiamato questo fattore.
 */
function applyModelForTarget(
  model: GenSerializedModel,
  input: GenApplyInput,
  target: GenTargetId,
  factorOf: GenTargetId | null,
): number {
  switch (model.family) {
    case "FAM-2":
      return predictWithElasticNet(model.parameters, input.features);
    case "FAM-4":
      return predictWithBoostedStumps(model.parameters, input.features);
    case "FAM-1":
      return predictMarcel(model.parameters, input.role, resolveMarcelObservations(input, target, factorOf)).prediction;
    case "B0": {
      if (input.b0Input === undefined) {
        throw new GenRecipeError("applyModel: B0 ha bisogno dei fatti di s−1 (`b0Input`), che non sono stati passati");
      }
      switch (target) {
        case "TN":
          return predictB0N(model.parameters, input.b0Input);
        case "T2":
          return predictB0T2(model.parameters, input.b0Input);
        case "T1":
          return predictB0T1(model.parameters, input.b0Input);
        default:
          throw new GenRecipeError(`applyModel: B0 non ha una forma per il bersaglio '${target}' in questa ricetta`);
      }
    }
    case "FAM-3": {
      // Il composto: `T1̂ = T2̂ × N̂`, coi due fattori applicati alla stessa riga
      // ma ciascuno sul PROPRIO bersaglio — la stessa semantica dei round di
      // misura, dove il candidato T2 vede le osservazioni di T2 e il candidato
      // T-N quelle di T-N. Un composto applicato con le osservazioni mescolate
      // non e' il composto che e' stato misurato.
      const t2 = applyModelForTarget(model.t2, input, "T2", target);
      const tN = applyModelForTarget(model.tN, input, "TN", target);
      return t2 * tN;
    }
  }
}

/**
 * Le osservazioni FAM-1 del bersaglio richiesto.
 *
 * L'ordine e': la mappa per bersaglio, poi — solo alla radice — la forma breve,
 * poi il fallback di §D.2. Dentro un composto l'ultimo gradino non c'e': si
 * lancia.
 */
function resolveMarcelObservations(
  input: GenApplyInput,
  target: GenTargetId,
  factorOf: GenTargetId | null,
): readonly MarcelObservation[] {
  const byTarget = input.marcelObservationsByTarget?.[target];
  if (byTarget !== undefined) return byTarget;
  if (factorOf !== null) throw new GenRecipeMissingObservationsError(target, factorOf);
  // Alla radice il bersaglio e' quello che il chiamante ha chiesto: l'assenza di
  // osservazioni e' una dichiarazione sul giocatore («nessuna stagione
  // osservata»), e §D.2 le risponde con la media di ruolo.
  return input.marcelObservations ?? [];
}

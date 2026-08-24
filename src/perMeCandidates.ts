// CHI CHIAMARE PER ME — il layer puro della PRIMA metà del blocco «giocatore
// suggerito». Nessun DOM, nessuno storage, nessuna rete: stesso taglio di
// src/baitCandidates.ts, src/tierOrdering.ts e src/postPurchaseProjection.ts.
// Le parole a schermo vivono in src/ui/perMeRow.ts, che è l'altra metà del
// paio ed è testabile da sola.
//
// ─────────────────────────────────────────────────────────────────────────────
// 1. IL DIFETTO CHE QUESTO FILE ESISTE PER NON RIPETERE
// ─────────────────────────────────────────────────────────────────────────────
//
// `packages/engine/src/opportunities.ts` risponde alla domanda «chi costa meno
// di quanto vale per me» con una sottrazione dichiarata:
//
//     surplus = valore DICHIARATO da Owner − ancora corrente MISURATA
//
// Il primo ingrediente NON ESISTE PIÙ. Pico l'ha smontato il 2026-08-24: «non
// esiste il valore in crediti PER ME, esiste il valore in crediti relativo al
// momento dell'asta e quello assoluto». Con lui cadono il profilo di rischio,
// gli α e il costo-opportunità come ingredienti.
//
// E IL VALORE ASSOLUTO NON LO SOSTITUISCE. `packages/engine/src/absoluteValue.
// ts` deriva una base PIATTA PER RUOLO (il budget del ruolo diviso per i suoi
// slot). Sostituirla a `declaredValue` in quella sottrazione renderebbe
// `base − ancora` MONOTONA DECRESCENTE NEL PREZZO: a parità di ruolo vince
// sempre il più economico, cioè il peggiore. Sarebbe selezione avversa con un
// badge OCCASIONE sopra, e il gate di qualità non la intercetterebbe — quel
// gate guarda l'ANCORA, mai il lato del valore.
//
// PICO HA SCELTO: «costruiamo il box senza la sottrazione». Quindi qui NON
// compare nessuna sottrazione valore−prezzo, in nessuna forma: né esplicita, né
// travestita da rapporto valore/prezzo, da differenza di posizioni pesata o da
// «quanto sotto il valore sta». `src/perMeCandidates.test.ts` §"selezione
// avversa" pinna il comportamento su uno stato costruito apposta perché la
// sottrazione, se qualcuno la reintroducesse, metterebbe in cima il giocatore
// peggiore e più economico del ruolo.
//
// ─────────────────────────────────────────────────────────────────────────────
// 2. COSA ORDINA IL BOX, ALLORA: UN ORDINE TOTALE DICHIARATO SU FATTI
// ─────────────────────────────────────────────────────────────────────────────
//
// Lo stampo è quello che `opportunities.ts` dichiara di sé nella sezione «COSA
// NON C'È, di proposito»: «l'ordinamento qui è un ordine TOTALE DICHIARATO su
// fatti: stessa informazione, zero pesi nascosti». L'ordine del radar era
//
//     1. dentro il piano   2. surplus   3. ancora corrente   4. playerId
//
// e qui resta lo stesso, meno il criterio caduto. Il posto 2 è rimasto vuoto e
// va riempito con qualcosa che risponda alla STESSA domanda che il surplus
// rispondeva — «fra i candidati che il piano copre, quale viene prima?» — senza
// essere un numero scelto dal motore (§D9). Ci va la POSIZIONE NELL'ORDINE
// DICHIARATO DI APPETIBILITÀ del ruolo: quello di `buildTierBook`
// (src/tierOrdering.ts), che è l'ordine con cui questo repository costruisce già
// le fasce, viene dall'indice servito dal deposito, porta la propria ricetta e
// il proprio criterio di pareggio, e non ha un solo peso scritto qui dentro.
//
// CHE COSA CAMBIA, DETTO IN CHIARO: il sottoblocco non dice più «costa meno di
// quanto vale per te», perché non c'è più niente con cui dirlo. Dice «fra i
// liberi che il tuo piano copre e che puoi pagare, questi vengono prima
// nell'ordine di appetibilità dichiarato». È una frase diversa, ed è per questo
// che il titolo e la nota la scrivono per esteso invece di lasciarla intendere.
//
// LA SCELTA È DEL MOTORE E NON È RATIFICATA. Nessun documento assegna il posto
// del surplus all'ordine di appetibilità: la scelta è registrata come
// `PER_ME_ORDER_APPEAL_REPLACES_SURPLUS` in `UNRATIFIED_CHOICES`
// (packages/engine/src/declaredValues.ts), viaggia nel dato dentro
// `PerMeReading.ratification` e la nota la stampa. Stesso stampo di
// absoluteValue.ts e del gate di opportunities.ts: il calcolo non si toglie,
// perde la pretesa di essere un giudizio chiuso.
//
// ─────────────────────────────────────────────────────────────────────────────
// 3. I CANCELLI DI AMMISSIONE — le condizioni di opportunities.ts, meno una
// ─────────────────────────────────────────────────────────────────────────────
//
// Il radar ammetteva un candidato con cinque condizioni. Qui restano le prime
// quattro, alla lettera, e cade la quinta (`surplus > 0`) insieme al surplus:
//
//   1. HA UN'ANCORA — la riga porta la Qt.A. Senza quotazione non c'è nessuna
//      ancora da misurare: la riga resta FUORI, non a zero;
//   2. È ANCORA LIBERO — venduto o riconfermato ⇒ fuori (`purchasedPlayerIds`
//      copre entrambi);
//   3. HO UNO SLOT APERTO NEL SUO RUOLO — altrimenti non è un candidato per me;
//   4. IL MIO MAX BID VERO COPRE L'ANCORA CORRENTE — `maxSafe` (hard-safe, non
//      overridabile): un giocatore che non posso comprare non è un candidato.
//
// ORDINE DEI CANCELLI, il più economico per primo, come in baitCandidates.ts:
// prima i quattro `maxSafe` per ruolo (i ruoli pieni o budget-locked spariscono
// interi, con tutti i loro giocatori), poi la passata sul listone.
//
// ─────────────────────────────────────────────────────────────────────────────
// 4. COSA QUESTO FILE NON FA
// ─────────────────────────────────────────────────────────────────────────────
//
// Nessun valore, nessun fair-to-me, nessuna banda obiettivo, nessuno
// `stretch_cap`, nessun punteggio di occasione, nessun «offri X»: i gate
// `fair_to_me_promoted` e `decision_promoted` sono OFF e restano OFF. L'ancora
// corrente si MOSTRA come fatto — con la sua base, la sua inflazione e il suo
// campione — e non entra in nessuna sottrazione. `maxSafe` viene INTERROGATA,
// mai derivata né spostata di un credito.

import { maxSafe } from "../packages/engine/src/auction.js";
import {
  MIN_INFLATION_SAMPLE,
  anchorBook,
  currentAnchor,
  measuredInflation,
  type AnchorBook,
  type CurrentAnchor,
  type PlayerAnchor,
} from "../packages/engine/src/anchors.js";
import type {
  RatificationStatus,
  UnratifiedChoiceId,
} from "../packages/engine/src/declaredValues.js";
import { fitsPlan, type LivePlan, type RolePlanLine } from "../packages/engine/src/livePlan.js";
import {
  ROLES,
  type AuctionEvent,
  type AuctionState,
  type Role,
} from "../packages/engine/src/types.js";
import { rolePlanReading, type RolePlanDraft } from "./rolePlan.js";
import { buildTierBook } from "./tierOrdering.js";
import {
  listonePlayerKey,
  type ListonePlayer,
  type ListonePoolSource,
} from "./ui/listone.js";

// ─── Le scelte aperte che questo sottoblocco porta con sé ────────────────────

/**
 * Le due letture del motore su cui poggia OGNI riga prodotta qui, dichiarate
 * in blocco e non ramo per ramo — stesso trattamento di
 * `ABSOLUTE_VALUE_UNRATIFIED_CHOICES` (packages/engine/src/absoluteValue.ts).
 *
 * Sono aperte davvero: `grep` su `docs/` non trova né l'una né l'altra.
 * Dichiararne una in più è la direzione sicura; dichiararne una in meno
 * significherebbe far passare per chiusa una domanda che nessuno ha chiuso.
 *
 * `packages/engine/tests/callScreen.test.ts` §"ogni scelta aperta ha un motivo
 * scritto" tiene il vocabolario senza orfani e nomina queste due come portate
 * da una superficie FUORI dal motore; il test qui accanto prova che la lettura
 * le porta davvero, così quella dichiarazione non può diventare una bugia.
 */
export const PER_ME_UNRATIFIED_CHOICES: readonly UnratifiedChoiceId[] = [
  "PER_ME_ORDER_APPEAL_REPLACES_SURPLUS",
  "PER_ME_REQUIRES_COMPLETE_ROLE_PLAN",
];

const RATIFICATION: RatificationStatus = {
  ratified: false,
  unratifiedChoices: PER_ME_UNRATIFIED_CHOICES,
};

// ─── I parametri dichiarati ──────────────────────────────────────────────────

/** Quante righe al massimo. PROVVISORIO: 3, in attesa di conferma di Pico. */
export const PER_ME_ROWS_MAX = 3;

/**
 * I parametri in vigore, ESPORTATI accanto al numero che governano — stesso
 * modello di `BaitParameters` e di `PrecedentsReading.thresholds`, «perché la
 * soglia in vigore sia ispezionabile accanto al numero che lascia passare».
 *
 * NESSUN ALTRO PESO, NESSUN COEFFICIENTE, NEMMENO A ZERO: un coefficiente a
 * zero è un peso che aspetta di essere acceso, e questa riga non ne ha.
 */
export interface PerMeParameters {
  /** Quante righe al massimo. PROVVISORIO, vedi `rowsMaxStatus`. */
  readonly rowsMax: number;
  /**
   * Lo stato di `rowsMax`, nel dato e non in un commento: è l'unico parametro
   * che Pico non ha ancora confermato, e chi legge l'esito lo deve poter sapere
   * senza aprire questo file. Stessa stringa di `BaitParameters.rowsMaxStatus`:
   * i due sottoblocchi del riquadro non possono dire in due modi diversi la
   * stessa cosa (un test lo verifica).
   */
  readonly rowsMaxStatus: "provvisorio — in attesa di conferma di Pico";
  /**
   * Il campione minimo perché l'inflazione misurata valga come misura:
   * `MIN_INFLATION_SAMPLE` del motore, COPIATO qui solo per essere leggibile
   * accanto all'altro parametro. Non è scelto qui.
   */
  readonly minInflationSample: number;
}

export const PER_ME_PARAMETERS: PerMeParameters = {
  rowsMax: PER_ME_ROWS_MAX,
  rowsMaxStatus: "provvisorio — in attesa di conferma di Pico",
  minInflationSample: MIN_INFLATION_SAMPLE,
};

// ─── Il listino delle ancore, ricavato dalle righe a schermo ─────────────────

/**
 * Il listino delle ancore, oppure il motivo per cui non c'è.
 *
 * `anchorBook()` LANCIA su un listino invalido — è la sua postura fail-closed,
 * ed è quella giusta per una libreria. In mezzo a un'asta un'eccezione non
 * gestita fa sparire la schermata: qui il lancio si raccoglie e diventa un
 * esito DICHIARATO che il sottoblocco sa dire a parole. Fail-closed resta
 * fail-closed — nessuna riga viene mostrata — ma il guasto lo si legge invece
 * di subirlo. È lo stesso trattamento che `computeTierBook` riserva a
 * `tierBook()` (src/tierOrdering.ts).
 */
export type PerMeAnchorOutcome =
  | { readonly kind: "book"; readonly book: AnchorBook; readonly withQuotation: number }
  | {
      readonly kind: "refused";
      readonly reason: "no-quotation" | "anchors-refused";
      readonly detail: string;
    };

/**
 * IL CALCOLO VERO, e la ragione per cui la cache più sotto è dimostrabile
 * invece che promessa: questa funzione vede `pool` e NIENT'ALTRO, cioè
 * esattamente la chiave con cui il risultato viene conservato. Non riceve lo
 * stato d'asta, quindi non può dipendere da un acquisto; non riceve il log,
 * quindi non può dipendere da un prezzo. Aggiungere una dipendenza significa
 * allargare QUESTA firma — e chi la allarga trova la cache poche righe sotto il
 * proprio cursore. Stesso idioma di `computeTierBook`.
 *
 * UNA RIGA SENZA `quotation` NON DIVENTA ZERO. Resta fuori dal listino, e il
 * conteggio `withQuotation` lo dichiara: «vale zero» e «non l'ho» sono due
 * fatti diversi e solo il primo è un numero.
 */
function computePerMeAnchors(pool: readonly ListonePlayer[]): PerMeAnchorOutcome {
  const anchors: PlayerAnchor[] = [];
  for (const row of pool) {
    const q = row.quotation;
    if (q === undefined || !Number.isFinite(q) || q < 0) continue;
    anchors.push({ playerId: listonePlayerKey(row), role: row.role, quotation: q });
  }
  if (anchors.length === 0) {
    return { kind: "refused", reason: "no-quotation", detail: "" };
  }
  try {
    return { kind: "book", book: anchorBook(anchors), withQuotation: anchors.length };
  } catch (err) {
    return {
      kind: "refused",
      reason: "anchors-refused",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * MEMOIZZAZIONE SULL'IDENTITÀ del listone, non su un hash del contenuto — il
 * pattern di `buildTierBook`, riusato e non reinventato. `render()` in
 * src/main.ts ricostruisce l'intero DOM A OGNI TASTO della ricerca, e questo
 * listino è una passata su 532 righe più la validazione fail-closed del motore.
 *
 * `poolRows` è una CINTURA e non parte della chiave logica, per lo stesso
 * motivo scritto su `TierBookCacheEntry`: `state.pool` viene SOSTITUITO e mai
 * modificato in loco, ma il tipo dell'array non lo impedisce al compilatore.
 */
interface PerMeAnchorCacheEntry {
  readonly poolRows: number;
  readonly outcome: PerMeAnchorOutcome;
}

let anchorCache = new WeakMap<readonly ListonePlayer[], PerMeAnchorCacheEntry>();
let anchorBuilds = 0;
let anchorHits = 0;

/** I due contatori della cache. Esistono per essere ASSERITI: «un tasto nella
 *  ricerca non ricostruisce il listino» si prova contando, non a occhio. */
export function perMeAnchorCacheStats(): { readonly builds: number; readonly hits: number } {
  return { builds: anchorBuilds, hits: anchorHits };
}

/** Svuota cache e contatori: un test che eredita la voce del test precedente
 *  misura la storia invece del proprio caso. */
export function resetPerMeAnchorCache(): void {
  anchorCache = new WeakMap<readonly ListonePlayer[], PerMeAnchorCacheEntry>();
  anchorBuilds = 0;
  anchorHits = 0;
}

/** Il listino delle ancore delle righe a schermo, memoizzato sull'identità. */
export function perMeAnchors(pool: readonly ListonePlayer[]): PerMeAnchorOutcome {
  const cached = anchorCache.get(pool);
  if (cached !== undefined && cached.poolRows === pool.length) {
    anchorHits += 1;
    return cached.outcome;
  }
  anchorBuilds += 1;
  const outcome = computePerMeAnchors(pool);
  anchorCache.set(pool, { poolRows: pool.length, outcome });
  return outcome;
}

// ─── Il candidato ────────────────────────────────────────────────────────────

export interface PerMeCandidate {
  /**
   * LA RIGA DI LISTONE, non un adattamento: il candidato VIENE dal pool, quindi
   * `selectListonePlayer()` (src/main.ts) lo accetta senza conversioni. È la
   * ragione per cui il clic sulla riga può riusare l'unica via esistente per
   * armare la CTA «Avvia» invece di aprirne una seconda.
   */
  readonly player: ListonePlayer;
  /** `listonePlayerKey(player)`: la stessa identità dell'event log. */
  readonly playerId: string;
  readonly role: Role;
  /**
   * L'ancora corrente MISURATA, con base, inflazione applicata e campione.
   * Si MOSTRA accanto alla riga; non entra in nessuna sottrazione.
   */
  readonly anchor: CurrentAnchor;
  /** Il mio max bid vero nel ruolo (`maxSafe`), interrogato e non riderivato. */
  readonly maxBid: number;
  /** Il prezzo all'ancora sta dentro l'allocazione viva del ruolo? */
  readonly withinRolePlan: boolean;
  /** L'allocazione viva del ruolo e i suoi slot: i due numeri di `fitsPlan`. */
  readonly planAllocation: number;
  readonly planSlotsRemaining: number;
  /**
   * Posizione 1-based nell'ordine di appetibilità DICHIARATO del ruolo
   * (`buildTierBook`), o `null` quando la riga non ha un verdetto. `null` non è
   * zero e non è l'ultima posizione: è l'assenza di verdetto, e l'ordine la
   * tratta come tale.
   */
  readonly appealPosition: number | null;
  /** Quante righe del ruolo hanno un verdetto: la numerosità viaggia col fatto. */
  readonly appealOrderSize: number | null;
}

/** Perché il sottoblocco non ha righe. Vocabolario CHIUSO di nove motivi: sono
 *  nove cose diverse, e appiattirle in una sola etichetta sarebbe già mezza
 *  bugia. Ognuno ha la sua frase in src/ui/perMeRow.ts. */
export type PerMeEmptyReason =
  /** Nessuna riga di listone caricata: non c'è una popolazione da guardare. */
  | "no-pool"
  /** Righe caricate, ma nessuna porta la Qt.A: non c'è nessuna ancora da misurare. */
  | "no-quotation"
  /** Le quotazioni caricate non passano `validateAnchors`: fail-closed, col motivo. */
  | "anchors-refused"
  /** Nessun piano rosa dichiarato: il primo criterio dell'ordine non esiste. */
  | "plan-absent"
  /** Piano rosa dichiarato a metà: manca un target o la versione. */
  | "plan-incomplete"
  /** Piano rosa rifiutato dal motore (`validateRolePlan`). */
  | "plan-invalid"
  /** Tutti i miei reparti sono pieni o senza margine: non potrei chiamare nessuno. */
  | "no-open-role"
  /** Nessun libero con quotazione nei reparti che mi restano aperti. */
  | "no-free-in-open-roles"
  /** Ci sono liberi, ma il mio max bid non copre l'ancora corrente di nessuno. */
  | "no-affordable";

export type PerMeReading =
  | {
      readonly kind: "empty";
      readonly reason: PerMeEmptyReason;
      /** Dettaglio misurato del rifiuto (le violazioni del motore); `""` se non ce n'è. */
      readonly detail: string;
      readonly parameters: PerMeParameters;
      /** Quanti candidati sono stati DAVVERO costruiti. Zero prova il cancello. */
      readonly evaluated: number;
      readonly basis: PerMeBasis;
      readonly ratification: RatificationStatus;
    }
  | {
      readonly kind: "candidates";
      readonly candidates: readonly PerMeCandidate[];
      readonly parameters: PerMeParameters;
      readonly evaluated: number;
      /** Righe libere con ancora nei reparti aperti: la popolazione vera. */
      readonly freeInOpenRoles: number;
      /** Quanti candidati non hanno un verdetto di appetibilità: l'ordine lo dice
       *  invece di fingerlo. */
      readonly withoutAppealPosition: number;
      /** La versione del piano che ha prodotto il criterio 1 (§4.1: ogni
       *  spiegazione indica il `plan_version` usato). */
      readonly planVersion: string;
      readonly basis: PerMeBasis;
      readonly ratification: RatificationStatus;
    };

/** Su cosa poggia, dichiarato NEL DATO — come `PrecedentsReading.basis`. */
export type PerMeBasis = "current-anchors-and-declared-plan";

const BASIS: PerMeBasis = "current-anchors-and-declared-plan";

export interface PerMeInput {
  /** Le righe del listone come stanno a schermo. */
  readonly pool: readonly ListonePlayer[];
  /** Quale sorgente le ha prodotte: serve al libro delle fasce, che dichiara la provenienza. */
  readonly source: ListonePoolSource;
  /** Stato derivato dal log: rose, budget, slot, già venduti. */
  readonly state: AuctionState;
  /** Il log grezzo: i PREZZI stanno lì, e l'inflazione misurata si fa sui prezzi. */
  readonly log: readonly AuctionEvent[];
  /** Il mio posto. La domanda è cosa posso chiamare IO. */
  readonly selfId: string;
  /**
   * La DICHIARAZIONE di piano rosa di Pico, nella sua forma parziale
   * (src/rolePlan.ts). Arriva grezza e non già letta: la lettura ha bisogno del
   * `TeamState`, che questa funzione risolve comunque per `maxSafe`, e farla
   * qui evita che il chiamante ne risolva uno secondo — due `TeamState` per la
   * stessa domanda sono due risposte che possono divergere.
   */
  readonly planDraft: RolePlanDraft | null;
}

// ─── L'ordine dichiarato ─────────────────────────────────────────────────────

/**
 * L'ORDINE DEI CANDIDATI, dichiarato riga per riga e senza un solo peso:
 *
 *   1. `withinRolePlan`   DECRESCENTE  ← «dentro il mio piano prima»
 *   2. `appealPosition`   CRESCENTE    ← il posto lasciato dal surplus
 *   3. `anchor.correctedAnchor` DECRESCENTE
 *   4. `playerId`         CRESCENTE    ← ordine totale, deterministico
 *
 * La PROVENIENZA di ciascuno, che è ciò che lo rende un fatto e non un'opinione:
 *
 *   1. `fitsPlan(line, ancora)` su `LivePlan` — aritmetica dichiarata del motore
 *      sui TARGET DI RUOLO dichiarati da Pico (packages/engine/src/livePlan.ts).
 *      Stessa posizione e stesso criterio del radar occasioni;
 *   2. `positionOf` dell'ordine di appetibilità del ruolo, costruito da
 *      `buildTierBook` (src/tierOrdering.ts) sull'indice servito dal deposito
 *      privato, con la ricetta COPIATA dalle righe e il criterio di pareggio del
 *      motore. È il criterio che PRENDE IL POSTO DEL SURPLUS, ed è la scelta non
 *      ratificata `PER_ME_ORDER_APPEAL_REPLACES_SURPLUS`;
 *   3. `currentAnchor(...).correctedAnchor` — Qt.A misurata corretta
 *      dall'inflazione misurata (packages/engine/src/anchors.ts). Stessa
 *      posizione e stesso verso del radar occasioni, dove la frase era «a parità
 *      di surplus il pezzo più grosso della rosa vale prima»: qui è «a parità di
 *      posto nell'ordine, il pezzo più grosso prima». **Decrescente**, e il verso
 *      non è un dettaglio: è la direzione OPPOSTA a quella che la sottrazione
 *      caduta produrrebbe;
 *   4. `playerId` — l'idioma già in uso in `precedents.ts`, `competitors.ts` e
 *      `baitCandidates.ts`: stesso input, stessa lista, sempre.
 *
 * NESSUNA SOTTRAZIONE VALORE−PREZZO, in nessuna forma. Nessuno dei quattro
 * criteri mette in relazione un valore con un prezzo; il solo prezzo che compare
 * è l'ancora, e compare da sola.
 */
export function orderPerMeCandidates(candidates: readonly PerMeCandidate[]): PerMeCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      Number(b.withinRolePlan) - Number(a.withinRolePlan) ||
      compareAppealPosition(a.appealPosition, b.appealPosition) ||
      b.anchor.correctedAnchor - a.anchor.correctedAnchor ||
      a.playerId.localeCompare(b.playerId),
  );
}

/**
 * Confronto crescente sulla posizione, con l'ASSENZA dichiarata invece che
 * fabbricata: `null` non diventa 0 (sarebbe «il migliore») e non diventa
 * `Infinity` (sarebbe «l'ultimo misurato») — sono entrambi verdetti inventati.
 * Una riga senza verdetto finisce dopo tutte quelle che ne hanno uno, e la
 * vista lo dice (`withoutAppealPosition`). Stessa forma di
 * `compareAppealIndex` in src/baitCandidates.ts.
 */
function compareAppealPosition(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

// ─── Il calcolo ──────────────────────────────────────────────────────────────

/** Le righe davvero mostrate: l'ordine è già quello dichiarato, qui si tronca. */
export function perMeShownCandidates(reading: PerMeReading): readonly PerMeCandidate[] {
  return reading.kind === "candidates"
    ? reading.candidates.slice(0, reading.parameters.rowsMax)
    : [];
}

function empty(reason: PerMeEmptyReason, detail = ""): PerMeReading {
  return {
    kind: "empty",
    reason,
    detail,
    parameters: PER_ME_PARAMETERS,
    evaluated: 0,
    basis: BASIS,
    ratification: RATIFICATION,
  };
}

/**
 * I candidati «per me» allo stato corrente, o il motivo per cui non ce ne sono.
 *
 * ORDINE DELLE DOMANDE, dalla più a monte alla più a valle, così il motivo
 * mostrato è sempre il PRIMO che morde e non l'ultimo che si nota:
 * popolazione → quotazioni → listino valido → piano dichiarato → reparti
 * aperti → liberi nei reparti aperti → sostenibilità.
 *
 * Deterministico: stesso listone + stesso stato + stesso piano → stessa lista.
 * Non lancia mai: `anchorBook` e `tierBook` lanciano, e i due lanci sono già
 * raccolti a monte (`perMeAnchors`, `buildTierBook`).
 */
export function perMeCandidates(input: PerMeInput): PerMeReading {
  const { pool, source, state, log, selfId, planDraft } = input;

  if (pool.length === 0) return empty("no-pool");

  const anchors = perMeAnchors(pool);
  if (anchors.kind === "refused") return empty(anchors.reason, anchors.detail);

  const team = state.teams[selfId];
  if (team === undefined) {
    throw new Error(`perMeCandidates: unknown selfId "${selfId}"`);
  }

  const plan = rolePlanReading(team, planDraft);
  if (plan.kind === "absent") return empty("plan-absent");
  if (plan.kind === "incomplete") {
    return empty("plan-incomplete", plan.gaps.map((g) => g.kind).join(", "));
  }
  if (plan.kind === "invalid") {
    return empty(
      "plan-invalid",
      plan.issues.map((i) => `${i.role ?? "plan"}:${i.violation}`).join(", "),
    );
  }
  const live: LivePlan = plan.live;

  // CANCELLO 1 — quattro chiamate a `maxSafe`, non 532. Un reparto pieno o
  // budget-locked sparisce intero, con tutti i suoi giocatori.
  const maxBidByRole = {} as Record<Role, number>;
  let anyOpenRole = false;
  for (const role of ROLES) {
    const safe = maxSafe(team, role);
    maxBidByRole[role] = safe.biddable ? safe.maxSafe : 0;
    if (safe.biddable) anyOpenRole = true;
  }
  if (!anyOpenRole) return empty("no-open-role");

  const inflation = measuredInflation(log, anchors.book);
  const tiers = buildTierBook(pool, source, state);
  const purchased = new Set(state.purchasedPlayerIds);

  let freeInOpenRoles = 0;
  const out: PerMeCandidate[] = [];

  for (const row of pool) {
    const playerId = listonePlayerKey(row);
    if (purchased.has(playerId)) continue;
    const maxBid = maxBidByRole[row.role];
    if (maxBid <= 0) continue;
    const anchor = currentAnchor(playerId, anchors.book, inflation);
    if (anchor === null) continue; // nessuna Qt.A: fuori, non a zero
    freeInOpenRoles += 1;
    if (maxBid < anchor.correctedAnchor) continue;

    const line: RolePlanLine = live.perRole[anchor.role];
    const index = tiers.kind === "book" ? tiers.book.byRole.get(anchor.role) : undefined;
    const position = index?.positionOf.get(playerId);

    out.push({
      player: row,
      playerId,
      role: anchor.role,
      anchor,
      maxBid,
      withinRolePlan: fitsPlan(line, anchor.correctedAnchor),
      planAllocation: line.allocation,
      planSlotsRemaining: line.slotsRemaining,
      appealPosition: position ?? null,
      appealOrderSize: index === undefined ? null : index.order.length,
    });
  }

  if (freeInOpenRoles === 0) return empty("no-free-in-open-roles");
  if (out.length === 0) return empty("no-affordable");

  const candidates = orderPerMeCandidates(out);
  return {
    kind: "candidates",
    candidates,
    parameters: PER_ME_PARAMETERS,
    evaluated: candidates.length,
    freeInOpenRoles,
    withoutAppealPosition: candidates.filter((c) => c.appealPosition === null).length,
    planVersion: live.planVersion,
    basis: BASIS,
    ratification: RATIFICATION,
  };
}

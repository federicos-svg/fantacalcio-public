// CHI CHIAMARE PER ME — il layer puro della PRIMA metà del blocco «giocatore
// suggerito». Nessun DOM, nessuno storage, nessuna rete: stesso taglio di
// src/baitCandidates.ts, src/tierOrdering.ts e src/postPurchaseProjection.ts.
// Le parole a schermo vivono in src/ui/perMeRow.ts, che è l'altra metà del
// paio ed è testabile da sola.
//
// ─────────────────────────────────────────────────────────────────────────────
// 1. I DUE CRITERI, E CHI COMANDA SU CHI — decisione di Pico, 2026-08-25
// ─────────────────────────────────────────────────────────────────────────────
//
// Messo davanti ai due criteri possibili per questo riquadro — (1) «se ti
// serve»: ruolo scoperto, piano per ruolo, quanti ne mancano; (2) «se è un
// affare»: il surplus, cioè quanto Pico dichiara che valga meno quanto costerà
// — Pico ha risposto, in sessione, il 2026-08-25:
//
//     «Deve essere un mix tra le due cose. Il numero uno è il filtro a monte
//      ma il due è quello successivo»
//
// Tradotto in codice, e senza una virgola in più: **IL PIANO FILTRA, IL
// SURPLUS ORDINA CHI HA PASSATO IL FILTRO**. Sono i primi due criteri
// dell'ordine dichiarato più sotto, in quest'ordine e con questi ruoli.
//
// IL SURPLUS È LA SOTTRAZIONE DEL RADAR, NON UNA SUA IMITAZIONE:
//
//     surplus = valore DICHIARATO da Pico − ancora corrente MISURATA
//
// ed è la STESSA aritmetica, presa dove vive: `surplusOverAnchor`
// (packages/engine/src/opportunities.ts), la sola funzione del progetto che
// esegua quella sottrazione, condivisa con il radar occasioni e con la
// schermata CHIAMATA. Qui non se ne scrive una seconda copia: due copie della
// stessa sottrazione sono due occasioni di divergere su quale ancora
// sottrarre, e la risposta è una sola (`correctedAnchor`, la misurata).
//
// ─────────────────────────────────────────────────────────────────────────────
// 2. IL VALORE CHE ENTRA È QUELLO DICHIARATO, E SOLO QUELLO
// ─────────────────────────────────────────────────────────────────────────────
//
// L'ingrediente 1 della sottrazione è `DeclaredValueBook`
// (packages/engine/src/declaredValues.ts): l'INPUT DICHIARATO di Pico, §D9
// ingrediente 2. Non è model-derived, non è un `value` gated, non è una banda;
// è quanto Pico ha scritto che quel giocatore vale per lui.
//
// E IL VALORE ASSOLUTO NON LO SOSTITUISCE, MAI. `packages/engine/src/
// absoluteValue.ts` deriva una base PIATTA PER RUOLO (il budget del ruolo
// diviso per i suoi slot). Sostituirla a `declaredValue` in questa sottrazione
// renderebbe `base − ancora` MONOTONA DECRESCENTE NEL PREZZO: a parità di
// ruolo vincerebbe sempre il più economico, cioè il peggiore. Sarebbe
// selezione avversa, e il gate di qualità non la intercetterebbe — quel gate
// guarda l'ANCORA, mai il lato del valore. `src/perMeCandidates.test.ts`
// §"selezione avversa" pinna il comportamento su uno stato costruito apposta:
// senza valori dichiarati il peggiore e più economico del ruolo finisce
// ULTIMO, e nessun `absoluteValue` entra in questa via (una guardia di
// sorgente lo verifica per nome).
//
// UN VALORE DICHIARATO CHE MANCA NON DIVENTA ZERO. Oggi il core pubblico non
// ha ancora una sorgente d'app per il listino dei valori (src/main.ts passa
// `values: null` e dice perché): per tutte le righe il surplus è quindi
// `null`. `null` NON è 0 («vale zero per me» sarebbe una dichiarazione, e non
// c'è) e NON è `-Infinity` (sarebbe una misura, e non c'è). È l'assenza, e si
// tratta come tale: la riga resta VISIBILE, finisce dopo tutte quelle che un
// surplus ce l'hanno, e la vista lo dice con il proprio contatore
// (`withoutDeclaredValue`). È lo stesso stampo di `appealPosition` qui sotto,
// e un test lo difende.
//
// ─────────────────────────────────────────────────────────────────────────────
// 3. COSA DICE IL SOTTOBLOCCO, ADESSO CHE PUÒ DIRLO
// ─────────────────────────────────────────────────────────────────────────────
//
// Con il surplus al suo posto la frase «costa meno di quanto vale per te»
// torna DICIBILE — ma solo per le righe che hanno un valore dichiarato, ed è
// esattamente così che la vista la scrive: per quelle righe dice di quanto la
// riga sta sotto (o sopra) il valore dichiarato, per le altre dice «valore non
// dichiarato» e non fabbrica niente. Il titolo e la nota scrivono l'ordine per
// esteso invece di lasciarlo intendere, perché un ordine che non si legge è un
// peso nascosto scritto in un file.
//
// LA SCELTA CHE RESTA APERTA, E QUELLA CHE NON LO È PIÙ. L'ordine «piano
// prima, surplus poi» è la decisione di Pico del 2026-08-25 citata sopra: non
// è più una lettura del motore. Resta invece del motore, e non ratificata, chi
// decide A PARITÀ DI SURPLUS — e per le righe che un surplus non ce l'hanno:
// ci va la POSIZIONE NELL'ORDINE DICHIARATO DI APPETIBILITÀ del ruolo, quello
// di `buildTierBook` (src/tierOrdering.ts), che viene dall'indice servito dal
// deposito, porta la propria ricetta e il proprio criterio di pareggio, e non
// ha un solo peso scritto qui dentro. È registrata come
// `PER_ME_ORDER_APPEAL_BREAKS_SURPLUS_TIES` in `UNRATIFIED_CHOICES`
// (packages/engine/src/declaredValues.ts), viaggia nel dato dentro
// `PerMeReading.ratification` e la nota la stampa.
//
// ─────────────────────────────────────────────────────────────────────────────
// 4. I CANCELLI DI AMMISSIONE — le condizioni di opportunities.ts, meno una
// ─────────────────────────────────────────────────────────────────────────────
//
// Il radar ammetteva un candidato con cinque condizioni. Qui restano le prime
// quattro, alla lettera:
//
//   1. HA UN'ANCORA — la riga porta la Qt.A. Senza quotazione non c'è nessuna
//      ancora da misurare: la riga resta FUORI, non a zero;
//   2. È ANCORA LIBERO — venduto o riconfermato ⇒ fuori (`purchasedPlayerIds`
//      copre entrambi);
//   3. HO UNO SLOT APERTO NEL SUO RUOLO — altrimenti non è un candidato per me;
//   4. IL MIO MAX BID VERO COPRE L'ANCORA CORRENTE — `maxSafe` (hard-safe, non
//      overridabile): un giocatore che non posso comprare non è un candidato.
//
// LA QUINTA (`surplus > 0`) NON TORNA COME CANCELLO, ed è una differenza
// deliberata dal radar. Qui il surplus ORDINA, non ESCLUDE: una riga con
// surplus ≤ 0 resta visibile, dopo quelle con surplus positivo. Escluderla
// ridurrebbe ciò che Pico vede in asta — il radar può permetterselo perché
// risponde alla domanda «chi è un'occasione»; questo riquadro risponde a «chi
// chiamare adesso», e un giocatore che serve al piano resta chiamabile anche
// se costa quanto vale.
//
// ORDINE DEI CANCELLI, il più economico per primo, come in baitCandidates.ts:
// prima i quattro `maxSafe` per ruolo (i ruoli pieni o budget-locked spariscono
// interi, con tutti i loro giocatori), poi la passata sul listone.
//
// ─────────────────────────────────────────────────────────────────────────────
// 5. COSA QUESTO FILE NON FA
// ─────────────────────────────────────────────────────────────────────────────
//
// Nessun fair-to-me, nessuna banda obiettivo, nessuno `stretch_cap`, nessun
// punteggio di occasione, nessun badge OCCASIONE, nessun «offri X»: i gate
// `fair_to_me_promoted` e `decision_promoted` sono OFF e restano OFF. Il
// surplus è una sottrazione fra due numeri già dichiarati e già misurati, non
// un giudizio promosso. L'ancora corrente si MOSTRA come fatto — con la sua
// base, la sua inflazione e il suo campione — e nella sottrazione entra solo
// quella corretta. `maxSafe` viene INTERROGATA, mai derivata né spostata di un
// credito.

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
import {
  declaredValueOf,
  type DeclaredValueBook,
  type RatificationStatus,
  type UnratifiedChoiceId,
} from "../packages/engine/src/declaredValues.js";
import { surplusOverAnchor } from "../packages/engine/src/opportunities.js";
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
  "PER_ME_ORDER_APPEAL_BREAKS_SURPLUS_TIES",
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
   * Si MOSTRA accanto alla riga, ed è il SOTTRAENDO del surplus qui sotto:
   * quella CORRETTA dall'inflazione misurata, mai la Qt.A nuda.
   */
  readonly anchor: CurrentAnchor;
  /**
   * Il valore che PICO HA DICHIARATO per questo giocatore, in crediti, o `null`
   * se non l'ha dichiarato. `null` non è 0: «vale zero per me» sarebbe una
   * dichiarazione, «non l'ho dichiarato» è la sua assenza
   * (`declaredValueOf`, packages/engine/src/declaredValues.ts).
   */
  readonly declaredValue: number | null;
  /**
   * `declaredValue − anchor.correctedAnchor` — la sottrazione di
   * `surplusOverAnchor` (packages/engine/src/opportunities.ts), non una sua
   * copia — oppure `null` quando il valore dichiarato manca.
   *
   * PUÒ ESSERE ≤ 0 E LA RIGA RESTA. Qui il surplus ORDINA e non ESCLUDE: la
   * quinta condizione d'ammissione del radar (`surplus > 0`) non torna come
   * cancello, perché togliere dallo schermo un giocatore che il piano copre
   * ridurrebbe ciò che Pico vede in asta.
   */
  readonly surplus: number | null;
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
      /**
       * Quanti candidati non hanno un valore dichiarato da Pico, cioè per
       * quanti il surplus non è calcolabile. Gemello del contatore qui sopra e
       * per la stessa ragione: l'assenza si CONTA e si dice, non si riempie con
       * uno zero che sembrerebbe una dichiarazione.
       */
      readonly withoutDeclaredValue: number;
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
  /**
   * Il listino dei valori DICHIARATI da Pico, o `null` se il chiamante non ne
   * ha uno. È l'ingrediente 1 del surplus (§D9 ingrediente 2), e il campo è
   * OBBLIGATORIO di proposito: un chiamante deve DICHIARARE che non ha valori,
   * non dimenticarsene. Con `null` — oggi il caso dell'app, che non ha ancora
   * una sorgente per questo listino — nessuna riga ha un surplus, e nessuna
   * riga ne riceve uno fabbricato.
   */
  readonly values: DeclaredValueBook | null;
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
 *   1. `withinRolePlan`   DECRESCENTE  ← il FILTRO: «dentro il mio piano prima»
 *   2. `surplus`          DECRESCENTE  ← chi ORDINA fra quelli che il piano copre
 *   3. `appealPosition`   CRESCENTE    ← criterio di parità, non rimosso
 *   4. `anchor.correctedAnchor` DECRESCENTE
 *   5. `playerId`         CRESCENTE    ← ordine totale, deterministico
 *
 * I PRIMI DUE SONO LA DECISIONE DI PICO DEL 2026-08-25 (in sessione): «deve
 * essere un mix tra le due cose. Il numero uno è il filtro a monte ma il due è
 * quello successivo». Il piano filtra, il surplus ordina.
 *
 * La PROVENIENZA di ciascuno, che è ciò che lo rende un fatto e non un'opinione:
 *
 *   1. `fitsPlan(line, ancora)` su `LivePlan` — aritmetica dichiarata del motore
 *      sui TARGET DI RUOLO dichiarati da Pico (packages/engine/src/livePlan.ts).
 *      Stessa posizione e stesso criterio del radar occasioni;
 *   2. `surplusOverAnchor(valore dichiarato, ancora)` — la sottrazione del radar
 *      occasioni (packages/engine/src/opportunities.ts), presa da lì e non
 *      riscritta: valore DICHIARATO da Pico meno ancora corrente MISURATA. È il
 *      posto che il surplus aveva nel radar, e ci è tornato. **Ordina, non
 *      esclude**: un surplus ≤ 0 fa scendere la riga, non la fa sparire;
 *   3. `positionOf` dell'ordine di appetibilità del ruolo, costruito da
 *      `buildTierBook` (src/tierOrdering.ts) sull'indice servito dal deposito
 *      privato, con la ricetta COPIATA dalle righe e il criterio di pareggio del
 *      motore. È SCESO DI UN GRADINO e non è stato tolto: è ciò che decide a
 *      parità di surplus, ed è l'unico criterio che ordina le righe per cui un
 *      surplus non esiste. È la scelta non ratificata
 *      `PER_ME_ORDER_APPEAL_BREAKS_SURPLUS_TIES`;
 *   4. `currentAnchor(...).correctedAnchor` — Qt.A misurata corretta
 *      dall'inflazione misurata (packages/engine/src/anchors.ts). Stessa
 *      posizione e stesso verso del radar occasioni: «a parità di surplus il
 *      pezzo più grosso della rosa vale prima». **Decrescente**, e il verso non
 *      è un dettaglio: è ciò che tiene il più economico in fondo quando né il
 *      surplus né l'appetibilità hanno un verdetto da dare;
 *   5. `playerId` — l'idioma già in uso in `precedents.ts`, `competitors.ts` e
 *      `baitCandidates.ts`: stesso input, stessa lista, sempre.
 *
 * L'UNICA SOTTRAZIONE VALORE−PREZZO È QUELLA DEL CRITERIO 2, e ha per minuendo
 * il valore DICHIARATO da Pico. Nessun valore derivato entra in questa via: una
 * base piatta per ruolo renderebbe la sottrazione monotona decrescente nel
 * prezzo, cioè selezione avversa (§2 dell'intestazione).
 */
export function orderPerMeCandidates(candidates: readonly PerMeCandidate[]): PerMeCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      Number(b.withinRolePlan) - Number(a.withinRolePlan) ||
      compareSurplus(a.surplus, b.surplus) ||
      compareAppealPosition(a.appealPosition, b.appealPosition) ||
      b.anchor.correctedAnchor - a.anchor.correctedAnchor ||
      a.playerId.localeCompare(b.playerId),
  );
}

/**
 * Confronto DECRESCENTE sul surplus, con l'ASSENZA dichiarata invece che
 * fabbricata — lo stesso stampo di `compareAppealPosition` qui sotto, e per la
 * stessa ragione: `null` non diventa 0 (sarebbe la dichiarazione «vale
 * esattamente quanto costa», che nessuno ha fatto) e non diventa `-Infinity`
 * (sarebbe una misura, e non c'è nessuna misura). Una riga senza valore
 * dichiarato finisce dopo TUTTE quelle che un surplus ce l'hanno — anche dopo
 * quelle con surplus negativo, che una misura ce l'hanno — e la vista lo dice
 * (`withoutDeclaredValue`).
 */
function compareSurplus(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
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
  const { pool, source, state, log, selfId, planDraft, values } = input;

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

    // IL CRITERIO 2. `declaredValueOf` risponde `null` — mai 0 — quando Pico non
    // ha dichiarato niente su questo giocatore, e da `null` non si sottrae:
    // senza il primo ingrediente il surplus non esiste, e l'ordine lo sa.
    const declaredValue = values === null ? null : declaredValueOf(playerId, values);
    const surplus = declaredValue === null ? null : surplusOverAnchor(declaredValue, anchor);

    out.push({
      player: row,
      playerId,
      role: anchor.role,
      anchor,
      declaredValue,
      surplus,
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
    withoutDeclaredValue: candidates.filter((c) => c.surplus === null).length,
    planVersion: live.planVersion,
    basis: BASIS,
    ratification: RATIFICATION,
  };
}

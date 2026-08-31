// CHI CHIAMARE PER ME — il layer puro della PRIMA metà del blocco «giocatore
// suggerito». Nessun DOM, nessuno storage, nessuna rete: stesso taglio di
// src/baitCandidates.ts, src/tierOrdering.ts e src/postPurchaseProjection.ts.
// Le parole a schermo vivono in src/ui/perMeRow.ts, che è l'altra metà del
// paio ed è testabile da sola.
//
// ─────────────────────────────────────────────────────────────────────────────
// 1. I DUE CRITERI, E CHI COMANDA SU CHI — la struttura resta, la sostanza no
// ─────────────────────────────────────────────────────────────────────────────
//
// Messo davanti ai due criteri possibili per questo riquadro — (1) «se ti
// serve»: il piano; (2) «se è un affare»: il surplus — Pico ha risposto, in
// sessione, il 2026-08-25: «Deve essere un mix tra le due cose. Il numero uno
// è il filtro a monte ma il due è quello successivo». Tradotto in codice:
// **IL PIANO FILTRA, IL SURPLUS ORDINA**.
//
// QUELLA STRUTTURA È INTATTA; SONO CAMBIATI I DUE LATI (NOM-PROTOCOL-A §0):
//
//   - il PIANO non è più una dichiarazione a monte ma `PLAN*`, il piano
//     DINAMICO — una funzione pura dello stato, ricalcolata a ogni evento
//     (`dynamicPlan`, packages/engine/src/dynamicPlan.ts, §A.4). Non c'è più
//     niente da dichiarare perché il sottoblocco parli: dove esistono `V` e
//     `P̂` il piano esiste sempre;
//   - il SURPLUS non è più «valore dichiarato − ancora corrente» ma
//     `S(i) = V(i) − P̂(i)` (§A.3), cioè il valore in crediti del giocatore
//     meno il prezzo atteso di stasera — due grandezze che vivono nel motore
//     (`creditValueBook`, `expectedPriceReading`) e che questo file INTERROGA
//     senza riderivarle.
//
// L'OVERRIDE DI PICO RESTA, E COMANDA. Se una dichiarazione di piano rosa
// esiste ed è valida, `withinPlan` torna a essere `fitsPlan` sul piano vivo
// (`livePlan`) e l'etichetta lo dice: «piano dichiarato da te». Il dinamico è
// il DEFAULT, non un'esautorazione — ed è la stessa postura con cui `V`
// accoglie il valore dichiarato al posto di quello del generatore.
//
// ─────────────────────────────────────────────────────────────────────────────
// 2. IL «MOMENTO GIUSTO» NON È UNA PREVISIONE: È IL RICALCOLO
// ─────────────────────────────────────────────────────────────────────────────
//
// Non esiste da nessuna parte qui un «sparirà fra N chiamate»: quella stima
// resta vietata (DECISIONS 2026-08-24) e `nominationWindow.ts` è codice senza
// uso in questo regolamento. Quando un ruolo si svuota i `P̂` dei superstiti
// non cambiano ma il completamento sì, e la scarsità si legge dai FATTI del
// cliff (`cliffFactsOn`) che la riga mostra — alternative a scendere e rivali
// eleggibili con slot, due conteggi, non due stime.
//
// ─────────────────────────────────────────────────────────────────────────────
// 3. CIÒ CHE SI COSTRUISCE UNA VOLTA PER LETTURA, E NON PER CANDIDATO
// ─────────────────────────────────────────────────────────────────────────────
//
// Ogni grandezza di popolazione ha il proprio libro, costruito una volta:
//
//   - il listino delle ancore (`perMeAnchors`, memoizzato sull'identità del
//     pool — vedi la nota sulla cache più sotto);
//   - il libro dei valori (`creditValueBook`), che RESTITUISCE il libro dei
//     ranghi: quello stesso `ranks` alimenta il contesto del prezzo, così il
//     listone non viene riordinato due volte e soprattutto non può essere
//     ordinato in due modi diversi;
//   - il contesto del prezzo (`expectedPriceContext`), che fa QUATTRO chiamate
//     a `competitorSet` — una per ruolo — e non una per candidato;
//   - la scala del cliff (`cliffLadder`), letta poi con due ricerche binarie
//     per candidato;
//   - il costo per vincere adesso (`relativePriceReading`), che dipende da
//     (stato, ruolo, io) e NON dal giocatore: quattro letture, una per ruolo.
//
// LA CACHE DELLE ANCORE NON È STATA TOCCATA, ed è una scelta: la sua
// dimostrazione poggia su una firma STRETTA — `computePerMeAnchors` vede il
// pool e nient'altro — e tutto ciò che questo file ha aggiunto dipende dallo
// STATO o dal LOG. Metterlo dentro quella cache avrebbe reso falsa la
// dimostrazione invece che più veloce il render.
//
// ─────────────────────────────────────────────────────────────────────────────
// 4. NESSUN NUMERO DIRETTIVO, NESSUN PESO
// ─────────────────────────────────────────────────────────────────────────────
//
// L'ordine dichiarato (§B.1) è totale, deterministico e senza un solo
// coefficiente: `withinPlan` è un'appartenenza, `S` è una sottrazione, le
// alternative a scendere sono un conteggio, `V` è un credito e la chiave di
// listone è una stringa. Nessuna riga mostra mai un numero SOPRA `maxSafe`
// come cifra da offrire: `maxSafe` compare come fatto a sé, interrogato e mai
// riderivato.

import {
  anchorBook,
  cliffFactsOn,
  cliffLadder,
  competitorSet,
  creditValueBook,
  creditValueOf,
  compareCreditSurplus,
  currentAnchor,
  declaredValueOf,
  dynamicPlan,
  expectedPriceContext,
  expectedPriceReading,
  fitsPlan,
  historicalPurchases,
  maxSafe,
  measuredInflation,
  priceCurveBook,
  relativePriceReading,
  surplusReading,
  withinDynamicPlan,
  MIN_INFLATION_SAMPLE,
  MIN_PRICE_BAND_SAMPLE,
  type AnchorBook,
  type AuctionEvent,
  type AuctionState,
  type CliffFacts,
  type CreditValueBook,
  type CreditValueSource,
  type CurrentAnchor,
  type DeclaredValueBook,
  type DynamicPlan,
  type ExpectedPriceContext,
  type ExpectedPriceReading,
  type HistoricalPurchaseInput,
  type LivePlan,
  type PlayerAnchor,
  type RankRow,
  type RatificationStatus,
  type RelativePriceReading,
  type Role,
  type RolePlanLine,
  type UnratifiedChoiceId,
  COST_FLOOR,
  ROLES,
} from "../packages/engine/src/index.js";
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
 * SONO DUE NUOVE, E LE DUE DI IERI SONO USCITE INSIEME AL LORO OGGETTO:
 * `PER_ME_ORDER_APPEAL_BREAKS_SURPLUS_TIES` diceva che a parità di surplus
 * decidesse l'appetibilità, e il DTI §B.1 ha assegnato quel posto alle
 * alternative a scendere — la domanda è chiusa, non più aperta;
 * `PER_ME_REQUIRES_COMPLETE_ROLE_PLAN` diceva che senza piano dichiarato il
 * sottoblocco tacesse, e il piano dinamico ha tolto il caso.
 *
 * `packages/engine/tests/callScreen.test.ts` §"ogni scelta aperta ha un motivo
 * scritto" tiene il vocabolario senza orfani e nomina queste due come portate
 * da una superficie FUORI dal motore; il test qui accanto prova che la lettura
 * le porta davvero, così quella dichiarazione non può diventare una bugia.
 */
export const PER_ME_UNRATIFIED_CHOICES: readonly UnratifiedChoiceId[] = [
  "PER_ME_DECLARED_PLAN_FITS_ON_EXPECTED_PRICE",
  "PER_ME_REQUIRES_ANCHOR_SCALE",
];

const RATIFICATION: RatificationStatus = {
  ratified: false,
  unratifiedChoices: PER_ME_UNRATIFIED_CHOICES,
};

// ─── I parametri dichiarati ──────────────────────────────────────────────────

/** Quante righe al massimo. RATIFICATO da Pico il 2026-08-31. */
export const PER_ME_ROWS_MAX = 3;

/**
 * LO STATO DI `rowsMax`, NEL DATO E NON IN UN COMMENTO.
 *
 * Era «provvisorio — in attesa di conferma di Pico» dal giorno in cui il numero
 * è stato scritto; il DTI l'ha proposto come parametro dichiarato (§E, §J.3) e
 * Pico l'ha RATIFICATO il 2026-08-31. La stringa cambia, il posto no: resta un
 * campo del tipo, perché chi legge l'esito sappia da dove viene il tetto senza
 * aprire questo file.
 *
 * È LA STESSA STRINGA DI `BaitParameters.rowsMaxStatus`: i due sottoblocchi del
 * riquadro non possono dire in due modi diversi la stessa cosa, e un test lo
 * verifica confrontando i due letterali invece di fidarsi.
 */
export const ROWS_MAX_STATUS = "ratificato da Pico il 2026-08-31";

/**
 * I parametri in vigore, ESPORTATI accanto al numero che governano — stesso
 * modello di `BaitParameters` e di `PrecedentsReading.thresholds`, «perché la
 * soglia in vigore sia ispezionabile accanto al numero che lascia passare».
 *
 * NESSUN ALTRO PESO, NESSUN COEFFICIENTE, NEMMENO A ZERO: un coefficiente a
 * zero è un peso che aspetta di essere acceso, e questa riga non ne ha. I
 * quattro che ci sono governano tutti qualcosa: due campioni minimi (uno per
 * l'inflazione di serata, uno per la fascia della curva storica), la riserva
 * dura per slot che il piano dinamico lascia intatta, e il tetto delle righe.
 */
export interface PerMeParameters {
  readonly rowsMax: number;
  /** Vedi `ROWS_MAX_STATUS`: lo stato del tetto viaggia col tetto. */
  readonly rowsMaxStatus: typeof ROWS_MAX_STATUS;
  /**
   * Il campione minimo perché l'inflazione misurata valga come misura:
   * `MIN_INFLATION_SAMPLE` del motore, COPIATO qui solo per essere leggibile
   * accanto agli altri parametri. Non è scelto qui.
   */
  readonly minInflationSample: number;
  /**
   * Il campione minimo perché una fascia della curva storica sia leggibile:
   * `MIN_PRICE_BAND_SAMPLE` del motore. Governa la degradazione §D.7 — una
   * fascia di rango senza osservazioni o sotto campione non produce `P̂`, e la
   * riga lo DICE invece di mostrare un prezzo che non c'è.
   */
  readonly minPriceBandSample: number;
  /**
   * `COST_FLOOR`: la riserva dura per ogni slot non ancora pianificato. È il
   * vincolo del passo 3 del piano dinamico, interrogato al motore e mai
   * riderivato qui.
   */
  readonly costFloor: number;
}

export const PER_ME_PARAMETERS: PerMeParameters = {
  rowsMax: PER_ME_ROWS_MAX,
  rowsMaxStatus: ROWS_MAX_STATUS,
  minInflationSample: MIN_INFLATION_SAMPLE,
  minPriceBandSample: MIN_PRICE_BAND_SAMPLE,
  costFloor: COST_FLOOR,
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
 * NIENTE DI CIÒ CHE IL DTI HA PORTATO È ENTRATO QUI. `V`, `P̂`, il piano
 * dinamico, il cliff e il costo per vincere adesso dipendono tutti dallo stato
 * o dal log: vivono fuori da questa funzione, si costruiscono una volta per
 * lettura e non sono memoizzati. Allargare questa firma per infilarceli
 * avrebbe reso la dimostrazione falsa, non il render più veloce.
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
   * L'ancora corrente MISURATA, con base, inflazione applicata e campione. NON
   * è più il sottraendo del surplus — quel posto è di `P̂` — ma resta a schermo
   * perché è la SCOMPOSIZIONE dell'inflazione misurata di stasera, cioè l'unico
   * punto in cui si vede quanto il tavolo si sta scaldando e su quanti acquisti.
   */
  readonly anchor: CurrentAnchor;
  /** `V(i)` in crediti (§A.1). Un candidato senza `V` non è un candidato. */
  readonly value: number;
  /** Da dove viene `V`: il generatore, oppure la dichiarazione di Pico. */
  readonly valueSource: CreditValueSource;
  /**
   * La TARGA della ricetta che ha prodotto le previsioni di questa riga, letta
   * DAL DATO (`genForecast.recipeVersion`) e mai cablata qui. `null` quando la
   * riga non porta previsioni — il caso di un `V` che viene dall'override.
   */
  readonly valueRecipe: string | null;
  /**
   * `P̂(i)` col suo blocco d'incertezza, oppure l'ASSENZA col suo motivo.
   *
   * L'assenza è raggiungibile e non teorica: è il caso, nominato dal DTI §A.3,
   * di un giocatore che Pico ha dichiarato ma che il generatore non copre — e
   * il caso §D.7, la fascia di rango senza osservazioni o sotto campione. La
   * riga resta a schermo, in coda, e DICE il motivo invece di mostrare un
   * prezzo che nessuno ha misurato.
   */
  readonly expectedPrice: ExpectedPriceReading;
  /**
   * `S(i) = V(i) − P̂(i)`, oppure `null` quando `P̂` non esiste. `null` non è 0
   * («vale esattamente quanto costa» sarebbe una dichiarazione che nessuno ha
   * fatto) e non è `−Infinity`: la riga si ordina in coda, contata.
   */
  readonly surplus: number | null;
  /** Il costo per vincerlo ADESSO, col suo motivo quando non esiste. */
  readonly relativePrice: RelativePriceReading;
  /** I fatti di dislivello sulla scala delle ancore: il criterio 3 vive qui. */
  readonly cliff: CliffFacts;
  /** Quanti RIVALI eleggibili hanno ancora uno slot in questo ruolo. Un conteggio. */
  readonly rivalsWithSlot: number;
  /** Il mio max bid vero nel ruolo (`maxSafe`), interrogato e non riderivato. */
  readonly maxBid: number;
  /** Il giocatore è in `TARGET*` (o dentro il piano dichiarato, in override)? */
  readonly withinPlan: boolean;
  /** `alloc*[r]` del ruolo — o l'allocazione viva, in override. */
  readonly planAllocation: number;
  /** Gli slot del ruolo che il piano deve ancora coprire. */
  readonly planSlotsRemaining: number;
  /**
   * Quanti di quegli slot il piano DINAMICO ha già assegnato a un candidato
   * vero; `null` in override, dove il piano dichiarato non pianifica persone.
   */
  readonly planSlotsPlanned: number | null;
  /** `withinPlan(i) ∧ isCliff(i)`: due fatti già definiti, nessuna soglia nuova. */
  readonly flagNow: boolean;
  /**
   * Posizione 1-based nell'ordine di appetibilità DICHIARATO del ruolo
   * (`buildTierBook`), o `null` quando la riga non ha un verdetto.
   *
   * È USCITA DALL'ORDINE (§B.1: `V` ne è la trasformazione in crediti, e
   * tenerli entrambi sarebbe contare lo stesso fatto due volte) MA NON DALLA
   * RIGA: è una decisione registrata di Pico, non un dettaglio di resa.
   */
  readonly appealPosition: number | null;
  /** Quante righe del ruolo hanno un verdetto: la numerosità viaggia col fatto. */
  readonly appealOrderSize: number | null;
}

/**
 * Perché il sottoblocco non ha righe. Vocabolario CHIUSO di sette motivi.
 *
 * IL DTI §B.1 NE ELENCA CINQUE — `no-pool`, `no-forecast`, `no-open-role`,
 * `no-affordable`, `no-free-in-open-roles` — e i tre del piano dichiarato
 * (`plan-absent`/`incomplete`/`invalid`) SONO USCITI: il piano dinamico esiste
 * sempre dove esistono `V` e `P̂`, quindi non c'è più un silenzio da piano
 * mancante, e un piano dichiarato invalido si DICE e si torna al dinamico, mai
 * a un pannello vuoto (vedi `PerMePlanReading`).
 *
 * I DUE IN PIÙ RISPETTO AL DTI SONO LA SCALA DELLE ANCORE, e sono dichiarati
 * come lettura aperta (`PER_ME_REQUIRES_ANCHOR_SCALE`): da quella scala
 * vengono l'inflazione misurata che entra in `P̂`, le alternative a scendere
 * del criterio 3 e la scomposizione che la riga mostra. Senza di lei non c'è
 * niente da mostrare, e fingerla sarebbe peggio che tacere.
 */
export type PerMeEmptyReason =
  /** Nessuna riga di listone caricata: non c'è una popolazione da guardare. */
  | "no-pool"
  /** Righe caricate, ma nessuna porta la Qt.A: non c'è nessuna ancora da misurare. */
  | "no-quotation"
  /** Le quotazioni caricate non passano `validateAnchors`: fail-closed, col motivo. */
  | "anchors-refused"
  /** Il deposito è assente o monco: senza previsioni o senza storico non c'è né `V` né `P̂`. */
  | "no-forecast"
  /** Tutti i miei reparti sono pieni o senza margine: non potrei chiamare nessuno. */
  | "no-open-role"
  /** Nessun libero con quotazione nei reparti che mi restano aperti. */
  | "no-free-in-open-roles"
  /** Ci sono liberi con `V`, ma il mio max bid non copre il prezzo atteso di nessuno. */
  | "no-affordable";

/**
 * Che cosa un piano DICHIARATO aveva che non andava. Non è un motivo di
 * silenzio: è una degradazione che si DICE mentre il dinamico lavora.
 */
export type PerMeDeclaredPlanIssue = "plan-incomplete" | "plan-invalid";

/**
 * Quale piano ha filtrato, e con quale etichetta.
 *
 * `dynamic` è il default e porta il piano intero, così chi legge può vedere
 * quanti slot sono stati pianificati e a che prezzo. `declared` è l'override di
 * Pico e comanda quando c'è: il dinamico non lo corregge e non lo media.
 */
export type PerMePlanReading =
  | {
      readonly kind: "dynamic";
      readonly planVersion: string;
      readonly label: "piano ricalcolato adesso";
      readonly plan: DynamicPlan;
      /** Il guasto di una dichiarazione che c'era ma non reggeva, o `null`. */
      readonly declaredIssue: PerMeDeclaredPlanIssue | null;
      readonly declaredIssueDetail: string;
    }
  | {
      readonly kind: "declared";
      readonly planVersion: string;
      readonly label: "piano dichiarato da te";
      readonly live: LivePlan;
    };

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
      /** Quanti di quei liberi il deposito NON serve: niente `V`, quindi fuori. */
      readonly withoutValue: number;
      /** Quanti candidati non hanno `P̂`, cioè per quanti il surplus non esiste. */
      readonly withoutSurplus: number;
      /** Quanti candidati non hanno un verdetto di appetibilità. */
      readonly withoutAppealPosition: number;
      readonly plan: PerMePlanReading;
      readonly basis: PerMeBasis;
      readonly ratification: RatificationStatus;
    };

/** Su cosa poggia, dichiarato NEL DATO — come `PrecedentsReading.basis`. */
export type PerMeBasis = "credit-value-expected-price-and-dynamic-plan";

const BASIS: PerMeBasis = "credit-value-expected-price-and-dynamic-plan";

export interface PerMeInput {
  /** Le righe del listone come stanno a schermo. */
  readonly pool: readonly ListonePlayer[];
  /** Quale sorgente le ha prodotte: serve al libro delle fasce, che dichiara la provenienza. */
  readonly source: ListonePoolSource;
  /** Stato derivato dal log: rose, budget, slot, già venduti, `lastSeq`. */
  readonly state: AuctionState;
  /** Il log grezzo: i PREZZI stanno lì, e l'inflazione misurata si fa sui prezzi. */
  readonly log: readonly AuctionEvent[];
  /**
   * LO STORICO D'ASTA, da cui la curva rango→prezzo del passo 1 (§A.2). Vuoto
   * è un caso legittimo e DICHIARATO: senza storico la curva non è formabile e
   * il sottoblocco dice `no-forecast` invece di inventarne una.
   */
  readonly history: readonly HistoricalPurchaseInput[];
  /**
   * QUANTE riconferme sono state dichiarate. Ingresso OBBLIGATORIO e senza
   * ripiego: il DTI dichiara il ripiego della SOMMA dei rinnovi (489, §E) e non
   * ne dichiara nessuno per il loro NUMERO. Prima delle dichiarazioni è 0.
   */
  readonly renewalsCount: number;
  /**
   * `R_rinnovi`: la somma dei prezzi delle riconferme dichiarate. Omessa: si usa
   * il ripiego dichiarato del motore, e la provenienza lo dice.
   */
  readonly renewalsSpend?: number;
  /**
   * Il listino dei valori DICHIARATI da Pico, o `null` se il chiamante non ne
   * ha uno. È l'OVERRIDE di `V` (§A.1), e il campo è OBBLIGATORIO di proposito:
   * un chiamante deve DICHIARARE che non ha valori, non dimenticarsene. Con
   * `null` `V` viene tutto dal generatore, che basta: è la differenza con ieri,
   * quando senza questo listino nessuna riga aveva un surplus.
   */
  readonly values: DeclaredValueBook | null;
  /** Il mio posto. La domanda è cosa posso chiamare IO. */
  readonly selfId: string;
  /**
   * La DICHIARAZIONE di piano rosa di Pico, nella sua forma parziale
   * (src/rolePlan.ts), oppure `null`. `null` NON è più un silenzio: è il caso
   * normale, in cui comanda il piano dinamico.
   */
  readonly planDraft: RolePlanDraft | null;
}

// ─── L'ordine dichiarato ─────────────────────────────────────────────────────

/**
 * L'ORDINE DEI CANDIDATI (§B.1), dichiarato riga per riga e senza un solo peso:
 *
 *   1. `withinPlan`            DECRESCENTE  ← il piano FILTRA
 *   2. `surplus`               DECRESCENTE  ← il surplus ORDINA (null in coda)
 *   3. `alternativesAtOrBelow` CRESCENTE    ← scarsità MISURATA, da `cliffFacts`
 *   4. `value`                 DECRESCENTE
 *   5. `playerId`              CRESCENTE    ← ordine totale, deterministico
 *
 * LA PROVENIENZA DI CIASCUNO, che è ciò che lo rende un fatto e non un'opinione:
 *
 *   1. `withinDynamicPlan` su `PLAN*` (packages/engine/src/dynamicPlan.ts,
 *      §A.4) — oppure `fitsPlan` sul piano vivo, quando Pico ne ha dichiarato
 *      uno. Il piano filtra, come dal 2026-08-25;
 *   2. `surplusReading` (packages/engine/src/creditValue.ts, §A.3): `V − P̂`,
 *      presa dove vive e non riscritta. **Ordina, non esclude**: un surplus ≤ 0
 *      fa scendere la riga, non la fa sparire. L'assenza va in coda con
 *      `compareCreditSurplus`, che è la stessa regola del motore;
 *   3. `cliffFacts.alternativesAtOrBelow` (packages/engine/src/cliff.ts): a
 *      parità di convenienza, prima chi ha meno alternative sotto di sé, cioè
 *      chi ha il gradino più ripido dopo di lui. È un CONTEGGIO sulla scala
 *      delle ancore reali, non una stima di quanto durerà sul mercato;
 *   4. `V` in crediti — l'ultimo criterio di merito, e l'unico che ordina le
 *      righe per cui un surplus non esiste;
 *   5. `playerId` — l'idioma già in uso in `precedents.ts`, `competitors.ts` e
 *      `baitCandidates.ts`: stesso input, stessa lista, sempre.
 *
 * LA POSIZIONE DI APPETIBILITÀ È USCITA DA QUI e non dalla riga: `V` è la sua
 * trasformazione in crediti (stesso `T1̂`, stessa monotonia), quindi tenerli
 * entrambi nell'ordine sarebbe contare lo stesso fatto due volte (§B.1, §H.2).
 */
export function orderPerMeCandidates(candidates: readonly PerMeCandidate[]): PerMeCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      Number(b.withinPlan) - Number(a.withinPlan) ||
      compareCreditSurplus(a.surplus, b.surplus) ||
      a.cliff.alternativesAtOrBelow - b.cliff.alternativesAtOrBelow ||
      b.value - a.value ||
      a.playerId.localeCompare(b.playerId),
  );
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
 * Le righe del listone come il rango le vede: `T1̂`, `N̂`, ruolo, venduto.
 *
 * UNA RIGA SENZA `genForecast` NON RICEVE UNA PREVISIONE INVENTATA: porta
 * `forecast: null`, il libro dei ranghi la mette fra le `withoutForecast` e
 * l'assenza si legge col suo motivo. È lo stesso trattamento che la tabella del
 * listone riserva alla cella `n/d`.
 */
function rankRowsOf(pool: readonly ListonePlayer[], purchased: ReadonlySet<string>): RankRow[] {
  return pool.map((row) => {
    const targets = row.genForecast?.targets;
    const playerId = listonePlayerKey(row);
    return {
      playerId,
      role: row.role,
      forecast:
        targets === undefined
          ? null
          : { total: targets.T1.value, appearances: targets.TN.value },
      sold: purchased.has(playerId),
    };
  });
}

/**
 * I candidati «per me» allo stato corrente, o il motivo per cui non ce ne sono.
 *
 * ORDINE DELLE DOMANDE, dalla più a monte alla più a valle, così il motivo
 * mostrato è sempre il PRIMO che morde e non l'ultimo che si nota:
 * popolazione → quotazioni → reparti aperti → deposito → liberi nei reparti
 * aperti → deposito sui MIEI liberi → sostenibilità.
 *
 * Deterministico: stesso listone + stesso stato + stesso storico → stessa
 * lista. Non lancia mai: `anchorBook` e `tierBook` lanciano, e i due lanci sono
 * già raccolti a monte (`perMeAnchors`, `buildTierBook`).
 */
export function perMeCandidates(input: PerMeInput): PerMeReading {
  const { pool, source, state, log, selfId, planDraft, values, history } = input;

  if (pool.length === 0) return empty("no-pool");

  const anchors = perMeAnchors(pool);
  if (anchors.kind === "refused") return empty(anchors.reason, anchors.detail);

  const team = state.teams[selfId];
  if (team === undefined) {
    throw new Error(`perMeCandidates: unknown selfId "${selfId}"`);
  }

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

  // ── I LIBRI DI POPOLAZIONE, uno per grandezza, una volta per lettura ──────
  const purchased = new Set(state.purchasedPlayerIds);
  const roleByPlayerId = new Map<string, Role>();
  for (const row of pool) roleByPlayerId.set(listonePlayerKey(row), row.role);

  const curves = priceCurveBook(historicalPurchases(history, roleByPlayerId).rows);
  const valueBook: CreditValueBook = creditValueBook({
    rows: rankRowsOf(pool, purchased),
    renewalsCount: input.renewalsCount,
    ...(input.renewalsSpend === undefined ? {} : { renewalsSpend: input.renewalsSpend }),
    values,
  });
  if (valueBook.reason !== null) return empty("no-forecast", valueBook.reason);
  if (curves.reason !== null) return empty("no-forecast", curves.reason);

  const inflation = measuredInflation(log, anchors.book);
  // IL LIBRO DEI RANGHI SI RIUSA, NON SI RIFÀ: `creditValueBook` l'ha già
  // costruito su queste stesse righe, e ordinare il listone una seconda volta
  // sarebbe soprattutto il rischio di ordinarlo in due modi diversi.
  const prices: ExpectedPriceContext = expectedPriceContext({
    curves,
    ranks: valueBook.ranks,
    inflation,
    state,
    selfId,
    ...(input.renewalsSpend === undefined ? {} : { renewalsSpend: input.renewalsSpend }),
  });

  const ladder = cliffLadder(anchors.book, state);
  const tiers = buildTierBook(pool, source, state);

  // I DUE FATTI CHE DIPENDONO DAL RUOLO E NON DAL GIOCATORE: quattro letture
  // ciascuno, non una per candidato.
  const relativeByRole = {} as Record<Role, RelativePriceReading>;
  const rivalsByRole = {} as Record<Role, number>;
  for (const role of ROLES) {
    relativeByRole[role] = relativePriceReading({ state, role, selfId });
    rivalsByRole[role] = competitorSet(state, role, COST_FLOOR, selfId).eligible.length;
  }

  // ── IL PIANO — dinamico per default, dichiarato quando Pico lo dichiara ───
  const declared = rolePlanReading(team, planDraft);
  let live: LivePlan | null = null;
  let declaredIssue: PerMeDeclaredPlanIssue | null = null;
  let declaredIssueDetail = "";
  if (declared.kind === "live") {
    live = declared.live;
  } else if (declared.kind === "incomplete") {
    declaredIssue = "plan-incomplete";
    declaredIssueDetail = declared.gaps.map((g) => g.kind).join(", ");
  } else if (declared.kind === "invalid") {
    declaredIssue = "plan-invalid";
    declaredIssueDetail = declared.issues.map((i) => `${i.role ?? "plan"}:${i.violation}`).join(", ");
  }

  // ── LA PASSATA UNICA SUL LISTONE ─────────────────────────────────────────
  interface Row {
    readonly row: ListonePlayer;
    readonly playerId: string;
    readonly role: Role;
    readonly anchor: CurrentAnchor;
    readonly value: number;
    readonly valueSource: CreditValueSource;
    readonly expectedPrice: ExpectedPriceReading;
    readonly surplus: number | null;
    readonly inOpenRole: boolean;
  }

  let freeInOpenRoles = 0;
  let withValue = 0;
  const rows: Row[] = [];

  for (const row of pool) {
    const playerId = listonePlayerKey(row);
    if (purchased.has(playerId)) continue;
    const inOpenRole = maxBidByRole[row.role] > 0;
    const hasSlot = team.slotsRemaining[row.role] > 0;
    // Chi non serve né al pannello né al piano non costa nemmeno una lettura.
    if (!inOpenRole && !hasSlot) continue;
    const anchor = currentAnchor(playerId, anchors.book, inflation);
    if (anchor === null) continue; // nessuna Qt.A: fuori, non a zero
    if (inOpenRole) freeInOpenRoles += 1;

    const valueReading = creditValueOf(playerId, valueBook);
    if (valueReading.kind === "assente") continue; // niente `V`: fuori dalla popolazione
    if (inOpenRole) withValue += 1;

    const priceReading = expectedPriceReading(playerId, prices);
    const surplus = surplusReading(playerId, valueBook, prices);
    rows.push({
      row,
      playerId,
      role: row.role,
      anchor,
      value: valueReading.credits,
      valueSource: valueReading.source,
      expectedPrice: priceReading,
      surplus: surplus.kind === "surplus" ? surplus.credits : null,
      inOpenRole,
    });
  }

  if (freeInOpenRoles === 0) return empty("no-free-in-open-roles");
  if (withValue === 0) return empty("no-forecast", "nessun libero servito dal deposito");

  // IL PIANO DINAMICO si costruisce sui liberi con `V` E `P̂` nei ruoli con
  // slot — non sui soli reparti biddable: un reparto bloccato dal budget ha
  // comunque uno slot da completare, e il completamento lo deve sapere.
  const plan = dynamicPlan({
    budget: team.budgetResidual,
    slotsRemaining: team.slotsRemaining,
    candidates: rows.flatMap((r) =>
      r.expectedPrice.kind === "prezzo" && r.surplus !== null && team.slotsRemaining[r.role] > 0
        ? [
            {
              playerId: r.playerId,
              role: r.role,
              value: r.value,
              expectedPrice: r.expectedPrice.credits,
              surplus: r.surplus,
            },
          ]
        : [],
    ),
    lastSeq: state.lastSeq,
  });

  const out: PerMeCandidate[] = [];
  for (const r of rows) {
    if (!r.inOpenRole) continue;
    // CANCELLO 4 — «un candidato che non posso pagare al prezzo atteso non è un
    // candidato». Si applica dove un prezzo atteso ESISTE: su un'assenza non si
    // può dire «non posso pagarlo», e trattarla come un numero che sfonda
    // sarebbe usare l'assenza come misura. La riga senza `P̂` resta, in coda,
    // e dice il proprio motivo (§A.3, §D.7).
    if (r.expectedPrice.kind === "prezzo" && maxBidByRole[r.role] < r.expectedPrice.credits) continue;

    const cliff = cliffFactsOn(ladder, r.playerId);
    if (cliff === null) continue; // irraggiungibile: un'ancora esiste, quindi la scala lo conosce

    const line: RolePlanLine | null = live === null ? null : live.perRole[r.role];
    const withinPlan =
      line === null
        ? withinDynamicPlan(plan, r.playerId)
        : r.expectedPrice.kind === "prezzo" && fitsPlan(line, r.expectedPrice.credits);
    const index = tiers.kind === "book" ? tiers.book.byRole.get(r.role) : undefined;
    const position = index?.positionOf.get(r.playerId);
    const planLine = plan.perRole[r.role];

    out.push({
      player: r.row,
      playerId: r.playerId,
      role: r.role,
      anchor: r.anchor,
      value: r.value,
      valueSource: r.valueSource,
      valueRecipe: r.row.genForecast?.recipeVersion ?? null,
      expectedPrice: r.expectedPrice,
      surplus: r.surplus,
      relativePrice: relativeByRole[r.role],
      cliff,
      rivalsWithSlot: rivalsByRole[r.role],
      maxBid: maxBidByRole[r.role],
      withinPlan,
      planAllocation: line === null ? planLine.allocation : line.allocation,
      planSlotsRemaining: line === null ? planLine.slotsRemaining : line.slotsRemaining,
      planSlotsPlanned: line === null ? planLine.slotsPlanned : null,
      flagNow: withinPlan && cliff.isCliff,
      appealPosition: position ?? null,
      appealOrderSize: index === undefined ? null : index.order.length,
    });
  }

  if (out.length === 0) return empty("no-affordable");

  const candidates = orderPerMeCandidates(out);
  const planReading: PerMePlanReading =
    live === null
      ? {
          kind: "dynamic",
          planVersion: plan.planVersion,
          label: "piano ricalcolato adesso",
          plan,
          declaredIssue,
          declaredIssueDetail,
        }
      : {
          kind: "declared",
          planVersion: live.planVersion,
          label: "piano dichiarato da te",
          live,
        };

  return {
    kind: "candidates",
    candidates,
    parameters: PER_ME_PARAMETERS,
    evaluated: candidates.length,
    freeInOpenRoles,
    withoutValue: freeInOpenRoles - withValue,
    withoutSurplus: candidates.filter((c) => c.surplus === null).length,
    withoutAppealPosition: candidates.filter((c) => c.appealPosition === null).length,
    plan: planReading,
    basis: BASIS,
    ratification: RATIFICATION,
  };
}

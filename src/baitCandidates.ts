// CHI CHIAMARE PER FAR SPENDERE GLI ALTRI — il layer puro della seconda metà
// del blocco «giocatore suggerito». Nessun DOM, nessuno storage, nessuna rete:
// stesso taglio di src/tierOrdering.ts, src/nominationContext.ts e
// src/postPurchaseProjection.ts. Le parole a schermo vivono in
// src/ui/baitRow.ts, che è l'altra metà del paio ed è testabile da sola.
//
// ─────────────────────────────────────────────────────────────────────────────
// 1. LA GRANDEZZA PER AVVERSARIO È BINARIA, E NON È NEGOZIABILE
// ─────────────────────────────────────────────────────────────────────────────
//
// `packages/opponent-profiles/src/types.ts` vieta esplicitamente «un numero
// unico che aggreghi *quanto lo vuole*», e con esso ogni score, indice,
// punteggio, classifica di intensità e previsione di comportamento. Qui NON
// esiste nessuno scalare per avversario, e la garanzia è strutturale: il tipo
// `BaitExposure` non ha un solo campo numerico proprio — l'unica grandezza per
// avversario è la PRESENZA nell'elenco degli esposti, cioè un bit. Un test
// (`baitCandidates.test.ts` §"nessuno scalare per avversario") ispeziona gli
// oggetti prodotti e fallisce se qualcuno ne aggiunge uno.
//
// L'unica cosa che questo file conta è QUANTI avversari sono esposti, che è un
// censimento di persone e non una misura di desiderio.
//
// ─────────────────────────────────────────────────────────────────────────────
// 2. IL «DIVARIO» È UN ORDINE TOTALE DICHIARATO, NON UNA SOTTRAZIONE
// ─────────────────────────────────────────────────────────────────────────────
//
// «Vale molto per loro, poco in assoluto» sembra chiedere una sottrazione. Non
// la si può fare: le due grandezze non condividono un'unità — la prima è un
// conteggio di persone, la seconda un indice di appetibilità servito dal
// deposito — e sottrarre grandezze incommensurabili significa scegliere di
// nascosto un cambio fra le due. Il precedente da imitare è
// `packages/engine/src/opportunities.ts`, che rifiuta il prodotto
// `surplus x fit` e lo sostituisce con un ordine dichiarato: «stessa
// informazione, zero pesi nascosti».
//
// L'ordine è quello di `orderBaitCandidates()` più in basso, dichiarato riga
// per riga. Il criterio 4 (`listonePlayerKey`) replica l'idioma già presente in
// `precedents.ts` e `competitors.ts`: stesso input, stessa lista, sempre.
//
// L'INDICE DI APPETIBILITÀ AL CRITERIO 2 È UNA DEROGA STRETTA, autorizzata da
// Pico il 2026-08-24 con perimetro «una riga sola»: l'indice si usa SOLO per
// ordinare i candidati di questa riga, mai nella war board, mai nel listone,
// mai altrove. Non viene mostrato, non entra in nessuna aritmetica, non
// produce una soglia: è un comparatore e basta. Una riga senza indice non
// diventa zero (`?? 0` è vietato su tutta la via): resta senza verdetto e
// l'ordine la mette dopo quelle che ne hanno uno, dichiarandolo.
//
// ─────────────────────────────────────────────────────────────────────────────
// 3. IL CANCELLO DI AMMISSIONE: «CHIAMARE SIGNIFICA POTER COMPRARE»
// ─────────────────────────────────────────────────────────────────────────────
//
// Se nessuno rilancia, l'esca la paghi tu. Il controllo è quindi il CANCELLO
// DELLA POPOLAZIONE e non un filtro sui vincitori: un candidato non fattibile
// non viene nemmeno valutato. La differenza non è di efficienza ma di
// falsificabilità — un filtro finale si salta senza accorgersene, un cancello
// che precede il calcolo lascia il contatore `evaluated` a zero, e un test può
// asserire proprio quello (E9).
//
// ORDINE DEI CANCELLI, il più economico per primo:
//   1. RUOLI — `maxSafe(io, role)` QUATTRO volte, non 532. I ruoli pieni o
//      `budget-locked` spariscono interi, con tutti i loro giocatori.
//   2. FATTIBILITÀ PER RUOLO — `purchaseFeasibility` a prezzo e ruolo fissi
//      produce `role-full`, `insufficient-budget` e `breaks-hard-reserve`
//      INDIPENDENTEMENTE dal `playerId`. L'unica violazione davvero
//      per-candidato è `duplicate-player`, ed è una `Set.has` sull'insieme dei
//      già venduti che il chiamante ha già costruito.
//   3. PRE-FILTRO DI LISTONE — sopravvive solo la riga il cui club sta in
//      `hotClubs` o il cui id sta in `historyPlayers`. È ESATTO, non
//      euristico: la dimostrazione sta sul campo `hotClubs` dell'`ExposureBook`.
//   4. ESPOSIZIONE RIVALI — `maxSafe(rivale, ruolo)` per (posti x ruoli
//      aperti), calcolata una volta e riusata per tutti i candidati.
//   5. per candidato sopravvissuto: una manciata di ricerche su `Map`.
//
// ─────────────────────────────────────────────────────────────────────────────
// 4. COSTO — MEMOIZZAZIONE SULL'IDENTITÀ, E IL CALCOLO RICEVE SOLO LA CHIAVE
// ─────────────────────────────────────────────────────────────────────────────
//
// `render()` in src/main.ts ricostruisce l'intero DOM A OGNI TASTO della
// ricerca, e `auctionPrecedents()` esegue una validazione zod COMPLETA dello
// storico a ogni chiamata: il calcolo ingenuo è molto peggio di quanto suoni.
//
// Il pattern è quello di `buildTierBook` (src/tierOrdering.ts), riusato e non
// reinventato: `WeakMap` sull'IDENTITÀ del pool, mai su un hash del contenuto;
// la funzione che calcola riceve SOLO e SOLTANTO la chiave della cache, così
// «è ancora valida?» ha una risposta MECCANICA invece che disciplinare; e
// accanto vive una variante NON memoizzata (`baitCandidatesUncached`) come
// termine di paragone del test di trasparenza.
//
// LA CHIAVE, PER INTERO. `computeBaitCandidates` vede
// `(pool, book, seats, state, selfId, openingPrice, source, thresholds)` e
// nient'altro. Sei di questi sono confrontati per IDENTITÀ o per valore
// primitivo; l'unico che non ha un'identità stabile è `state`, perché
// `reduce()` ne costruisce uno nuovo a ogni render — e per lui la chiave è la
// coppia (`logLength`, `teamsStamp`), cioè la lunghezza del log append-only più
// una firma di 8 squadre x 5 interi. Non è «un hash del contenuto» nel senso
// che tierOrdering.ts rifiuta: là si trattava di ripassare 532 righe a ogni
// tasto, qui sono quaranta letture di campo, ed è l'unico modo onesto di
// stampare un oggetto che non ha identità.
//
// Fra un tasto e l'altro cambia solo `state.call.playerName`, che NON è nella
// firma: la cache colpisce ogni volta. Dopo un acquisto `logLength` e
// `teamsStamp` cambiano entrambi e il calcolo si rifà, che è corretto.
//
// ─────────────────────────────────────────────────────────────────────────────
// 5. COSA QUESTO FILE NON FA
// ─────────────────────────────────────────────────────────────────────────────
//
// Nessun valore, nessun fair-to-me, nessuna banda obiettivo, nessuno
// `stretch_cap`, nessun `ModelReceipt`, nessuna promozione di gate. Non importa
// `packages/engine/src/callScreen.ts` e non lo deve importare. `maxSafe` viene
// INTERROGATA, mai derivata né spostata di un credito: è hard-safe e non
// overridabile. L'unico credito che questo file dichiara è il PREZZO DI
// APERTURA, che è `COST_FLOOR` e ha già passato `purchaseFeasibility`.

import { maxSafe } from "../packages/engine/src/auction.js";
import { purchaseFeasibility } from "../packages/engine/src/feasibility.js";
import {
  COST_FLOOR,
  ROLES,
  type AuctionState,
  type Role,
  type TeamState,
} from "../packages/engine/src/types.js";
import {
  DEFAULT_PRECEDENT_THRESHOLDS,
  clubIdentityKey,
  medianPrice,
  newPrecedentFactCache,
  personHistories,
  precedentFactsFor,
  type PastAuctionPurchase,
  type PersonHistory,
  type PrecedentFact,
  type PrecedentThresholds,
} from "../packages/opponent-profiles/src/index.js";
import { projectAfterPurchase, type PostPurchaseProjection } from "./postPurchaseProjection.js";
import { buildTierBook } from "./tierOrdering.js";
import {
  listonePlayerKey,
  type ListonePlayer,
  type ListonePoolSource,
} from "./ui/listone.js";

// ─── I tre parametri dichiarati ──────────────────────────────────────────────

/**
 * I parametri in vigore, ESPORTATI accanto al numero che governano — stesso
 * modello di `PrecedentsReading.thresholds`, «perché la soglia in vigore sia
 * ispezionabile accanto al numero che lascia passare». Viaggiano dentro
 * `BaitReading`, quindi la vista li ha sempre sotto mano e può stamparli.
 *
 * NESSUN ALTRO PESO, NESSUN COEFFICIENTE, NEMMENO A ZERO: un coefficiente a
 * zero è un peso che aspetta di essere acceso, e questa riga non ne ha.
 */
export interface BaitParameters {
  /**
   * Il prezzo a cui la riga propone di aprire. DICHIARATO DA PICO il
   * 2026-08-24: `COST_FLOOR`, cioè 1.
   *
   * LA CONSEGUENZA, scritta e non lasciata implicita: a 1 credito il cancello
   * di ammissione NON MORDE attraverso `insufficient-budget` (un credito lo ha
   * chiunque non sia già a zero), morde attraverso `role-full` — il reparto è
   * pieno — e attraverso `breaks-hard-reserve` — pagare 1 lascerebbe i crediti
   * sotto la riserva dura degli altri slot obbligatori. È il caso E9: con 3
   * crediti e 4 slot da riempire, `3 - 1 = 2 < 3 x 1`.
   */
  readonly openingPrice: number;
  /**
   * Su quante stagioni misurate un fatto deve poggiare per contare.
   * DICHIARATA DA PICO il 2026-08-24: 1, il pavimento a cui il fatto esiste.
   * Vive in `DEFAULT_PRECEDENT_THRESHOLDS` (packages/opponent-profiles), che è
   * la casa delle soglie dichiarate; qui è ricopiata nell'esito solo perché
   * sia leggibile accanto alle altre due.
   */
  readonly minSeasonsMeasured: number;
  /** Quante righe al massimo. PROVVISORIO, vedi `rowsMaxStatus`. */
  readonly rowsMax: number;
  /**
   * Lo stato di `rowsMax`, nel dato e non in un commento: è l'unico dei tre
   * parametri che Pico non ha ancora confermato, e chi legge l'esito lo deve
   * poter sapere senza aprire questo file.
   */
  readonly rowsMaxStatus: "provvisorio — in attesa di conferma di Pico";
}

/** Quante righe al massimo. PROVVISORIO: 3, in attesa di conferma di Pico. */
export const BAIT_ROWS_MAX = 3;

export const BAIT_PARAMETERS: BaitParameters = {
  openingPrice: COST_FLOOR,
  minSeasonsMeasured: DEFAULT_PRECEDENT_THRESHOLDS.minSeasonsMeasured,
  rowsMax: BAIT_ROWS_MAX,
  rowsMaxStatus: "provvisorio — in attesa di conferma di Pico",
};

// ─── Il libro dell'esposizione ───────────────────────────────────────────────

/**
 * Le passate sullo storico d'asta, fatte UNA VOLTA e riusate da ogni
 * candidato. Non contiene nessun giudizio: sono raggruppamenti e insiemi.
 */
export interface ExposureBook {
  /** Le stagioni presenti nello storico, crescenti. Vuoto ⇒ nessuno storico. */
  readonly seasons: readonly string[];
  /** Quante righe lo storico porta. Zero ⇒ `no-history`, che è «non lo so». */
  readonly rows: number;
  /**
   * Lo storico raggruppato per persona — `personHistories()` di
   * packages/opponent-profiles, RIUSATO TALE E QUALE e non ricopiato.
   */
  readonly personHistories: ReadonlyMap<string, PersonHistory>;
  /** playerId → le persone che lo hanno comprato ALL'ASTA (mai per rinnovo). */
  readonly boughtBy: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * playerId → mediana dei prezzi d'asta pagati per lui, con `medianPrice()`
   * del pacchetto: la stessa aritmetica di `calledPlayerIsExpensive()`,
   * precalcolata invece che rifatta su tutto lo storico per ogni candidato.
   */
  readonly medianByPlayer: ReadonlyMap<string, number>;
  /**
   * I club su cui QUALCUNO ha raggiunto la soglia `clubShare` in ALMENO UNA
   * stagione, per chiave normalizzata (`clubIdentityKey`).
   *
   * PERCHÉ IL PRE-FILTRO È ESATTO E NON EURISTICO. `clubConcentrationFact()`
   * emette un fatto solo se `seasonsAtOrAbove >= 1`, cioè solo se quella
   * persona ha raggiunto la soglia su quel club in almeno una stagione — che è
   * esattamente la condizione di appartenenza a questo insieme. Una riga il cui
   * club non è qui dentro non può produrre il fatto `club` per NESSUNA persona.
   */
  readonly hotClubs: ReadonlySet<string>;
  /**
   * I giocatori comprati all'asta da qualcuno (le chiavi di `boughtBy`).
   *
   * Copre gli altri due fatti: `ricomprato` richiede un acquisto all'asta di
   * QUEL giocatore, e `piu-cari` richiede che il giocatore sia «caro», cioè che
   * lo storico ne conosca una mediana — e la mediana esiste solo per chi è
   * stato comprato all'asta almeno una volta.
   */
  readonly historyPlayers: ReadonlySet<string>;
  /** Le soglie con cui questo libro è stato costruito. `hotClubs` dipende da `clubShare`. */
  readonly thresholds: PrecedentThresholds;
}

/**
 * Il libro, calcolato. Due o tre passate sullo storico più ordinamenti piccoli;
 * nessuna validazione zod, perché il chiamante gli passa uno storico che il
 * boot ha già validato con `loadAuctionHistory` (fail-closed a monte).
 */
function computeExposureBook(
  history: readonly PastAuctionPurchase[],
  thresholds: PrecedentThresholds,
): ExposureBook {
  const histories = personHistories(history);

  const boughtBy = new Map<string, Set<string>>();
  const pricesByPlayer = new Map<string, number[]>();
  for (const row of history) {
    if (row.acquisition !== "asta") continue;
    const buyers = boughtBy.get(row.playerId);
    if (buyers === undefined) boughtBy.set(row.playerId, new Set([row.personId]));
    else buyers.add(row.personId);
    const prices = pricesByPlayer.get(row.playerId);
    if (prices === undefined) pricesByPlayer.set(row.playerId, [row.price]);
    else prices.push(row.price);
  }

  const medianByPlayer = new Map<string, number>();
  for (const [playerId, prices] of pricesByPlayer) {
    const median = medianPrice(prices);
    // `medianPrice` rende `null` solo su lista vuota, che qui non può esistere
    // (la chiave nasce insieme al primo prezzo). Nessun `?? 0`: se un giorno
    // potesse essere `null`, la voce semplicemente non c'è.
    if (median !== null) medianByPlayer.set(playerId, median);
  }

  // I club «caldi»: stessa aritmetica di `clubShares()` — denominatore = tutta
  // la spesa d'asta di quella persona in quella stagione, numeratore = la parte
  // su quel club — applicata una volta sola invece che per candidato.
  const hotClubs = new Set<string>();
  for (const person of histories.values()) {
    for (const season of person.seasons) {
      const rows = person.auctionsBySeason.get(season) ?? [];
      let total = 0;
      const byClub = new Map<string, number>();
      for (const row of rows) {
        total += row.price;
        const key = clubIdentityKey(row.club);
        byClub.set(key, (byClub.get(key) ?? 0) + row.price);
      }
      if (total <= 0) continue;
      for (const [key, amount] of byClub) {
        if (amount / total >= thresholds.clubShare) hotClubs.add(key);
      }
    }
  }

  return {
    seasons: [...new Set(history.map((r) => r.season))].sort(),
    rows: history.length,
    personHistories: histories,
    boughtBy,
    medianByPlayer,
    hotClubs,
    historyPlayers: new Set(boughtBy.keys()),
    thresholds,
  };
}

interface ExposureBookCacheEntry {
  readonly thresholds: PrecedentThresholds;
  readonly rows: number;
  readonly book: ExposureBook;
}

/**
 * LA CACHE DEL LIBRO. `WeakMap` sull'identità dello storico, esattamente come
 * `bookCache` in src/tierOrdering.ts: lo storico viene SOSTITUITO (mai mutato
 * in loco) da `loadAuctionHistoryFromText` / `forgetAuctionHistoryArchive`,
 * quindi `===` è già la domanda giusta; `weak` perché uno storico sostituito
 * deve poter essere raccolto insieme alla sua voce.
 *
 * `rows` è la stessa CINTURA di `poolRows` là: l'array è tipato
 * `readonly PastAuctionPurchase[]`, ma confrontare anche la lunghezza costa un
 * intero e fa scadere la voce nell'unica mutazione in loco che qualcuno
 * scriverebbe davvero.
 */
let exposureBookCache = new WeakMap<readonly PastAuctionPurchase[], ExposureBookCacheEntry>();
let exposureBookBuilds = 0;
let exposureBookHits = 0;

/**
 * Il libro dell'esposizione, memoizzato sull'IDENTITÀ dello storico.
 *
 * Le soglie fanno parte della chiave perché `hotClubs` dipende da `clubShare`:
 * un pre-filtro costruito con una soglia e usato con un'altra scarterebbe in
 * silenzio righe che il fatto avrebbe ammesso.
 */
export function exposureBook(
  history: readonly PastAuctionPurchase[],
  thresholds: PrecedentThresholds = DEFAULT_PRECEDENT_THRESHOLDS,
): ExposureBook {
  const cached = exposureBookCache.get(history);
  if (
    cached !== undefined &&
    cached.rows === history.length &&
    sameThresholds(cached.thresholds, thresholds)
  ) {
    exposureBookHits += 1;
    return cached.book;
  }
  exposureBookBuilds += 1;
  const book = computeExposureBook(history, thresholds);
  exposureBookCache.set(history, { thresholds, rows: history.length, book });
  return book;
}

/** Lo STESSO libro, senza guardare né toccare la cache. Termine di paragone. */
export function exposureBookUncached(
  history: readonly PastAuctionPurchase[],
  thresholds: PrecedentThresholds = DEFAULT_PRECEDENT_THRESHOLDS,
): ExposureBook {
  return computeExposureBook(history, thresholds);
}

function sameThresholds(a: PrecedentThresholds, b: PrecedentThresholds): boolean {
  return (
    a.clubShare === b.clubShare &&
    a.topPurchases === b.topPurchases &&
    a.topShare === b.topShare &&
    a.expensiveFrom === b.expensiveFrom &&
    a.minSeasonsMeasured === b.minSeasonsMeasured
  );
}

// ─── L'esposizione di un avversario ──────────────────────────────────────────

/**
 * ESPOSTO — la definizione, in codice, dove la funzione vive.
 *
 *   esposto(S, X)  ⟺  S ha uno slot aperto nel ruolo di X
 *                  ∧  maxSafe(S, ruolo(X)).biddable e regge il prezzo base
 *                  ∧  S ha ≥1 PrecedentFact misurato su X
 *                  ∧  quel fatto poggia su ≥ MIN_SEASONS_MEASURED stagioni
 *
 * Tre congiunzioni di fatti misurati più una soglia dichiarata.
 *
 * `esposto` NON DICE «lo vuole»: dice «ha già speso su questo, ha dove metterlo,
 * ha di che pagarlo». È la frase intera, ed è l'unica affermazione che questo
 * modulo si permette su una persona.
 *
 * IL TIFO DICHIARATO NON CREA ESPOSIZIONE, e la garanzia è strutturale e non
 * procedurale: `supportedClub` non è un `PrecedentFactId` (vedi
 * `PRECEDENT_FACT_IDS` in packages/opponent-profiles/src/types.ts), quindi non
 * può entrare in `facts`, quindi non può far comparire nessuno. Un tifoso che
 * sul proprio club ha speso lo 0% non è esposto, e `baitCandidates.test.ts` §E1
 * lo prova.
 */
export interface BaitExposure {
  /** Il POSTO a tavola: è così che la riga si scrive. */
  readonly fantaTeamId: string;
  /** La PERSONA a cui i precedenti appartengono. */
  readonly personId: string;
  /**
   * I fatti misurati su cui l'esposizione poggia, nell'ordine dichiarato dei
   * tipi. Ognuno porta la propria prova e la propria numerosità.
   *
   * NESSUN ALTRO CAMPO, e in particolare NESSUN NUMERO PROPRIO: la grandezza
   * per avversario è la presenza di questo oggetto nell'elenco, cioè un bit.
   */
  readonly facts: readonly PrecedentFact[];
}

/** Perché un avversario NON è esposto. Vocabolario chiuso, come i motivi vuoti. */
export type BaitExposureRefusal =
  /** Il reparto di quel ruolo è pieno: non ha dove metterlo. */
  | "role-full"
  /** `maxSafe` non è biddable o non regge il prezzo base: non ha di che pagarlo. */
  | "budget-locked"
  /** Nessun posto→persona, o nessuna stagione misurata: su di lui non esiste storico. */
  | "no-person"
  /** Ha lo slot e i crediti, ma nessun fatto misurato su questo giocatore. */
  | "no-fact"
  /** Il fatto c'è ma poggia su meno stagioni della soglia dichiarata. */
  | "below-sample";

/** Un avversario NON esposto, col motivo. Serve alla falsificabilità, non alla vista. */
export interface BaitRefusal {
  readonly fantaTeamId: string;
  readonly reason: BaitExposureRefusal;
}

// ─── Il candidato ────────────────────────────────────────────────────────────

export interface BaitCandidate {
  /**
   * LA RIGA DI LISTONE, non un adattamento: il candidato VIENE dal pool, quindi
   * `selectListonePlayer()` (src/main.ts) lo accetta senza conversioni. È la
   * ragione per cui il clic sulla riga dell'esca può riusare l'unica via
   * esistente per armare la CTA «Avvia» invece di aprirne una seconda.
   */
  readonly player: ListonePlayer;
  /** `listonePlayerKey(player)`: la stessa identità dell'event log. */
  readonly playerId: string;
  readonly role: Role;
  /** Gli avversari esposti, per posto crescente. Mai ordinati per «quanto». */
  readonly exposed: readonly BaitExposure[];
  /** Quanti sono. Un censimento di persone, non una misura di desiderio. */
  readonly exposedCount: number;
  /** Chi non lo è, e perché. Nessuno di questi entra nel conteggio. */
  readonly refused: readonly BaitRefusal[];
  /**
   * L'indice di appetibilità della riga, `null` quando la riga non ne porta
   * uno. Usato SOLO come criterio 2 dell'ordine (deroga stretta del
   * 2026-08-24), mai mostrato e mai sommato. `null` non è zero.
   */
  readonly appealIndex: number | null;
  /** Il prezzo di apertura, che ha già passato `purchaseFeasibility`. */
  readonly openingPrice: number;
  /** Slot del ruolo prima dell'acquisto (`me.slotsRemaining[role]`). */
  readonly roleSlotsBefore: number;
  /** «Quanto mi resta se lo prendo»: `projectAfterPurchase()`, non riscritto. */
  readonly projection: PostPurchaseProjection;
  /**
   * È anche in PRIMA FASCIA del suo ruolo (`buildTierBook`). Il fatto si
   * ACCOSTA, non pesa: non lo rimuove (sarebbe il sistema a decidere al posto
   * di Pico) e non lo promuove (resta dove l'ordine lo mette).
   */
  readonly alsoTopTier: boolean;
}

/** Perché il sottoblocco non ha righe. Vocabolario CHIUSO di sei motivi. */
export type BaitEmptyReason =
  /** Nessuna riga di listone caricata: non c'è una popolazione. */
  | "no-pool"
  /** Nessuno storico d'asta: non è «nessuno lo vuole», è «NON LO SO». */
  | "no-history"
  /** Tutti i miei reparti sono pieni: non potrei registrare nessun acquisto. */
  | "no-open-role"
  /** Ho un reparto aperto ma nemmeno il prezzo di apertura passa il cancello. */
  | "no-affordable-opening"
  /** Nessun libero su cui un avversario abbia insieme precedente, slot e crediti. */
  | "no-exposed"
  /** I fatti ci sono ma poggiano tutti sotto la soglia di stagioni dichiarata. */
  | "below-sample";

export type BaitReading =
  | {
      readonly kind: "empty";
      readonly reason: BaitEmptyReason;
      readonly parameters: BaitParameters;
      /** Quanti candidati sono stati DAVVERO valutati. Zero prova il cancello. */
      readonly evaluated: number;
      readonly seasons: readonly string[];
      /** Su cosa poggia, dichiarato nel dato — come `PrecedentsReading.basis`. */
      readonly basis: "auction-history";
    }
  | {
      readonly kind: "candidates";
      readonly candidates: readonly BaitCandidate[];
      readonly parameters: BaitParameters;
      readonly evaluated: number;
      readonly seasons: readonly string[];
      readonly basis: "auction-history";
      /** Quanti candidati non portano l'indice: l'ordine lo dice invece di fingerlo. */
      readonly withoutAppealIndex: number;
    };

export interface BaitInput {
  /** Le righe del listone come stanno a schermo. */
  readonly pool: readonly ListonePlayer[];
  /** Quale sorgente le ha prodotte: serve al libro delle fasce, che dichiara la provenienza. */
  readonly source: ListonePoolSource;
  /** Il libro dell'esposizione, già memoizzato sull'identità dello storico. */
  readonly book: ExposureBook;
  /** posto → persona (forma del registro lega). `null` = posto senza persona. */
  readonly seats: Readonly<Record<string, string | null>>;
  /** Stato derivato dal log: rose, budget, slot, già venduti. */
  readonly state: AuctionState;
  /** Il mio posto. La domanda è cosa possono spendere GLI ALTRI. */
  readonly selfId: string;
  /** Lunghezza del log: la firma dello stato derivato, per la cache. */
  readonly logLength: number;
  /** Il prezzo di apertura. Dichiarato, mai dedotto. */
  readonly openingPrice?: number;
}

// ─── L'ordine dichiarato ─────────────────────────────────────────────────────

/**
 * L'ORDINE DEI CANDIDATI, dichiarato riga per riga e senza un solo peso:
 *
 *   1. `exposedCount`        DECRESCENTE  ← «vale molto per loro»
 *   2. `appealIndex`         CRESCENTE    ← «vale meno in assoluto»
 *   3. `openingPrice`        CRESCENTE
 *   4. `playerId`            CRESCENTE    ← ordine totale, deterministico
 *
 * Il criterio 3 oggi è INERTE — il prezzo di apertura è `COST_FLOOR` per ogni
 * candidato — e resta scritto perché è un criterio dichiarato e non una
 * conseguenza del valore corrente di un parametro: il giorno in cui il prezzo
 * di apertura diventasse per candidato, l'ordine non cambierebbe forma.
 *
 * Il criterio 4 replica l'idioma di `precedents.ts` e `competitors.ts`: stesso
 * input, stessa lista, sempre.
 */
export function orderBaitCandidates(candidates: readonly BaitCandidate[]): BaitCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      b.exposedCount - a.exposedCount ||
      compareAppealIndex(a.appealIndex, b.appealIndex) ||
      a.openingPrice - b.openingPrice ||
      a.playerId.localeCompare(b.playerId),
  );
}

/**
 * Confronto crescente sull'indice, con l'ASSENZA dichiarata invece che
 * fabbricata: `null` non diventa 0 e non diventa `Infinity` — sono entrambi
 * numeri inventati che cambierebbero la posizione della riga. Una riga senza
 * verdetto finisce dopo tutte quelle che ne hanno uno, e la vista lo dice
 * (`withoutAppealIndex`).
 */
function compareAppealIndex(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/** L'indice della riga, o `null`. Nessun `?? 0`, mai, su questa via. */
function appealIndexOf(row: ListonePlayer): number | null {
  const score = row.appealIndex?.score;
  if (score === undefined || score === null || !Number.isFinite(score)) return null;
  return score;
}

// ─── Il calcolo ──────────────────────────────────────────────────────────────

/**
 * Il `playerId` con cui si INTERROGA il cancello per ruolo.
 *
 * `purchaseFeasibility` produce `role-full`, `insufficient-budget` e
 * `breaks-hard-reserve` indipendentemente dal giocatore: l'unica violazione
 * per-candidato è `duplicate-player`, che è una `Set.has` e che qui si vuole
 * fuori dai piedi. Due difese, e la seconda regge da sola:
 *  1. la sentinella comincia con un NUL, che `listonePlayerKey` non produce mai
 *     per la via nome+club (`normalizeIdentityPart` lascia solo `[a-z0-9-]`);
 *  2. `roleProbeViolations()` SCARTA comunque `duplicate-player` dall'esito
 *     della sonda, quindi anche una collisione impossibile — un `proxyId` che
 *     contenesse quel carattere — non cambierebbe la risposta del cancello.
 * La domanda del cancello è sul RUOLO; il doppione è una domanda sul candidato,
 * e ha già la sua `Set.has` più sotto.
 */
export const BAIT_ROLE_PROBE_PLAYER_ID = "\u0000bait-role-probe";

/**
 * Le violazioni della sonda che riguardano davvero il RUOLO. Esportata perché
 * un test possa asserire che `duplicate-player` non entra mai nel giudizio del
 * cancello per ruolo.
 */
export function roleProbeViolations(violations: readonly string[]): readonly string[] {
  return violations.filter((v) => v !== "duplicate-player");
}

interface RoleGate {
  /** I ruoli in cui posso davvero aprire a `openingPrice`. */
  readonly open: ReadonlySet<Role>;
  /** Almeno un ruolo ha uno slot libero, anche se poi non è finanziabile. */
  readonly anySlot: boolean;
}

function myRoleGate(
  state: AuctionState,
  me: TeamState,
  selfId: string,
  openingPrice: number,
): RoleGate {
  const open = new Set<Role>();
  let anySlot = false;
  // CANCELLO 1 — quattro chiamate a `maxSafe`, non 532.
  for (const role of ROLES) {
    if (me.slotsRemaining[role] > 0) anySlot = true;
    const safe = maxSafe(me, role);
    if (!safe.biddable || safe.maxSafe < openingPrice) continue;
    // CANCELLO 2 — `purchaseFeasibility` a prezzo e ruolo fissi. È la stessa
    // funzione che il bottone «Registra acquisto» consulta: la riga non può
    // proporre un'apertura che quel bottone rifiuterebbe.
    const probe = purchaseFeasibility(state, {
      playerId: BAIT_ROLE_PROBE_PLAYER_ID,
      role,
      fantaTeamId: selfId,
      price: openingPrice,
    });
    if (roleProbeViolations(probe.violations).length === 0) open.add(role);
  }
  return { open, anySlot };
}

/** I ruoli in cui un rivale può davvero aprire a `openingPrice`. */
function rivalOpenRoles(
  team: TeamState,
  roles: ReadonlySet<Role>,
  openingPrice: number,
): { readonly open: ReadonlySet<Role>; readonly refusalByRole: ReadonlyMap<Role, BaitExposureRefusal> } {
  const open = new Set<Role>();
  const refusalByRole = new Map<Role, BaitExposureRefusal>();
  for (const role of roles) {
    const safe = maxSafe(team, role);
    if (safe.reason === "role-full") {
      refusalByRole.set(role, "role-full");
      continue;
    }
    // «Ha il ruolo scoperto ma non i crediti» NON è esposizione: è la stessa
    // riga di `maxSafe` che il tavolo legge, interrogata e non derivata.
    if (!safe.biddable || safe.maxSafe < openingPrice) {
      refusalByRole.set(role, "budget-locked");
      continue;
    }
    open.add(role);
  }
  return { open, refusalByRole };
}

/**
 * IL CALCOLO VERO, e la ragione per cui la cache è dimostrabile invece che
 * promessa: questa funzione vede la firma qui sotto e NIENT'ALTRO, cioè
 * esattamente la chiave con cui il risultato viene conservato. Non riceve
 * `state.call`, quindi non può dipendere da ciò che si sta digitando; non
 * riceve un orologio, quindi non può dipendere dall'ora. Aggiungere una
 * dipendenza significa allargare QUESTA firma — e chi la allarga trova la
 * cache poche righe sotto il proprio cursore.
 */
function computeBaitCandidates(input: BaitInput): BaitReading {
  const { pool, source, book, seats, state, selfId } = input;
  const openingPrice = input.openingPrice ?? BAIT_PARAMETERS.openingPrice;
  const parameters: BaitParameters = { ...BAIT_PARAMETERS, openingPrice };
  const thresholds = book.thresholds;
  let evaluated = 0;

  const empty = (reason: BaitEmptyReason): BaitReading => ({
    kind: "empty",
    reason,
    parameters,
    evaluated,
    seasons: book.seasons,
    basis: "auction-history",
  });

  if (pool.length === 0) return empty("no-pool");
  if (book.rows === 0) return empty("no-history");

  const me = state.teams[selfId];
  // Un posto che non esiste non ha nessun reparto aperto: è la lettura
  // LETTERALMENTE vera di questo stato, non un'eccezione ingoiata. Un lancio
  // qui farebbe sparire la schermata in mezzo a un'asta — è la lezione già
  // scritta in testa a src/tierOrdering.ts — e un settimo motivo violerebbe il
  // vocabolario chiuso.
  if (me === undefined) return empty("no-open-role");

  const gate = myRoleGate(state, me, selfId, openingPrice);
  if (gate.open.size === 0) return empty(gate.anySlot ? "no-affordable-opening" : "no-open-role");

  // CANCELLO 4 — `maxSafe(rivale, ruolo)` per (posti x ruoli aperti), calcolata
  // una volta e riusata da tutti i candidati.
  interface Rival {
    readonly fantaTeamId: string;
    readonly personId: string | null;
    readonly open: ReadonlySet<Role>;
    readonly refusalByRole: ReadonlyMap<Role, BaitExposureRefusal>;
  }
  const rivals: Rival[] = [];
  for (const fantaTeamId of Object.keys(state.teams).sort((a, b) => a.localeCompare(b))) {
    if (fantaTeamId === selfId) continue;
    const team = state.teams[fantaTeamId];
    if (team === undefined) continue;
    const { open, refusalByRole } = rivalOpenRoles(team, gate.open, openingPrice);
    rivals.push({ fantaTeamId, personId: seats[fantaTeamId] ?? null, open, refusalByRole });
  }

  const purchased = new Set(state.purchasedPlayerIds);
  const tierOutcome = buildTierBook(pool, source, state);
  // Le soglie col pavimento a zero: servono a distinguere «nessun fatto» da
  // «fatto sotto il campione». Una sola implementazione del gate resta quella
  // di `precedentFactsFor`; qui il motivo si DERIVA confrontando le due
  // risposte, invece di riscrivere il filtro.
  const noSampleFloor: PrecedentThresholds = { ...thresholds, minSeasonsMeasured: 0 };
  // La memoria di lavoro dei due fatti che dipendono dal CLUB e non dal
  // giocatore: vive quanto questo giro, appartiene a questa funzione e sparisce
  // con lei. Le due soglie qui sopra differiscono solo per
  // `minSeasonsMeasured`, che nessuno dei due fatti legge, quindi lo stesso
  // oggetto serve legittimamente entrambi i giri (vedi `PrecedentFactCache`).
  const factCache = newPrecedentFactCache();

  const candidates: BaitCandidate[] = [];
  let factsSeen = 0;
  let factsBelowSample = 0;

  for (const row of pool) {
    const playerId = listonePlayerKey(row);
    // LA POPOLAZIONE, in quest'ordine.
    // (a) LIBERI. Un'esca che ti regala un doppione è una mossa che perdi due
    //     volte: `duplicate-player` è l'unica violazione per-candidato del
    //     cancello, ed è questa `Set.has`.
    if (purchased.has(playerId)) continue;
    // (b) DI RUOLO CON MIO SLOT APERTO + (c) il prezzo base passa
    //     `purchaseFeasibility` e `maxSafe`: entrambe già decise per ruolo.
    if (!gate.open.has(row.role)) continue;
    // (d) PRE-FILTRO DI LISTONE — esatto, vedi `ExposureBook.hotClubs`.
    if (!book.hotClubs.has(clubIdentityKey(row.club)) && !book.historyPlayers.has(playerId)) {
      continue;
    }

    // Da qui in poi è VALUTAZIONE: tutto ciò che precede è cancello, e
    // `evaluated` conta esattamente ciò che è stato calcolato.
    evaluated += 1;

    const called = { playerId, club: row.club };
    const median = book.medianByPlayer.get(playerId);
    const expensive = median !== undefined && median >= thresholds.expensiveFrom;

    const exposed: BaitExposure[] = [];
    const refused: BaitRefusal[] = [];
    for (const rival of rivals) {
      if (!rival.open.has(row.role)) {
        refused.push({
          fantaTeamId: rival.fantaTeamId,
          reason: rival.refusalByRole.get(row.role) ?? "budget-locked",
        });
        continue;
      }
      if (rival.personId === null) {
        refused.push({ fantaTeamId: rival.fantaTeamId, reason: "no-person" });
        continue;
      }
      const person = book.personHistories.get(rival.personId);
      if (person === undefined) {
        refused.push({ fantaTeamId: rival.fantaTeamId, reason: "no-person" });
        continue;
      }
      const facts = precedentFactsFor(person, called, thresholds, expensive, factCache);
      if (facts.length > 0) {
        factsSeen += 1;
        exposed.push({ fantaTeamId: rival.fantaTeamId, personId: rival.personId, facts });
        continue;
      }
      const raw = precedentFactsFor(person, called, noSampleFloor, expensive, factCache);
      if (raw.length > 0) {
        factsSeen += 1;
        factsBelowSample += 1;
        refused.push({ fantaTeamId: rival.fantaTeamId, reason: "below-sample" });
      } else {
        refused.push({ fantaTeamId: rival.fantaTeamId, reason: "no-fact" });
      }
    }

    if (exposed.length === 0) continue;

    candidates.push({
      player: row,
      playerId,
      role: row.role,
      exposed,
      exposedCount: exposed.length,
      refused,
      appealIndex: appealIndexOf(row),
      openingPrice,
      roleSlotsBefore: me.slotsRemaining[row.role],
      projection: projectAfterPurchase(me, row.role, String(openingPrice)),
      alsoTopTier:
        tierOutcome.kind === "book" &&
        tierOutcome.book.byRole.get(row.role)?.tierOf.get(playerId) === 1,
    });
  }

  if (candidates.length === 0) {
    // I due silenzi sono cose diverse, e appiattirli sarebbe già mezza bugia:
    // `below-sample` solo quando i fatti c'erano davvero e la SOLA ragione per
    // cui non contano è la soglia di stagioni.
    return empty(factsSeen > 0 && factsBelowSample === factsSeen ? "below-sample" : "no-exposed");
  }

  return {
    kind: "candidates",
    candidates: orderBaitCandidates(candidates),
    parameters,
    evaluated,
    seasons: book.seasons,
    basis: "auction-history",
    withoutAppealIndex: candidates.filter((c) => c.appealIndex === null).length,
  };
}

// ─── La cache ────────────────────────────────────────────────────────────────

/**
 * Cosa la voce conservata è stata costruita CON. Se uno solo non combacia, la
 * voce non vale e si ricalcola. Il pezzo restante della chiave — il `pool` — è
 * la chiave stessa della `WeakMap`, per IDENTITÀ di riferimento.
 *
 * `teamsStamp` è la firma dello stato derivato, che non ha un'identità stabile
 * perché `reduce()` ne costruisce uno nuovo a ogni render. `logLength` da solo
 * non basterebbe in un caso reale: le riconferme entrano nello stato senza
 * passare dal log (vedi `reduce()` e src/confirmationsStore.ts), quindi una
 * riconferma registrata mentre la schermata è aperta cambierebbe budget e slot
 * lasciando il log della stessa lunghezza. Le due insieme non hanno buchi.
 */
interface BaitCacheEntry {
  readonly book: ExposureBook;
  readonly seats: Readonly<Record<string, string | null>>;
  readonly source: ListonePoolSource;
  readonly selfId: string;
  readonly openingPrice: number;
  readonly logLength: number;
  readonly teamsStamp: string;
  readonly poolRows: number;
  readonly reading: BaitReading;
}

/**
 * La firma dello stato derivato: otto squadre per cinque interi, più quanti
 * giocatori risultano venduti. Quaranta letture di campo per tasto — tre ordini
 * di grandezza sotto la passata su 532 righe che src/tierOrdering.ts rifiuta di
 * fare, e l'unico modo onesto di stampare un oggetto che non ha identità.
 */
function teamsStamp(state: AuctionState): string {
  const parts: string[] = [];
  for (const id of Object.keys(state.teams).sort((a, b) => a.localeCompare(b))) {
    const t = state.teams[id]!;
    const s = t.slotsRemaining;
    parts.push(`${id}:${t.budgetResidual}:${s.P},${s.D},${s.C},${s.A}`);
  }
  return `${parts.join("|")}#${state.purchasedPlayerIds.length}`;
}

let baitCache = new WeakMap<readonly ListonePlayer[], BaitCacheEntry>();
let baitBuilds = 0;
let baitHits = 0;

/** I due contatori della cache. Esistono per essere ASSERITI: «un tasto nella
 *  ricerca non ricalcola» si prova CONTANDO, non guardando un cronometro. */
export function baitCandidatesCacheStats(): {
  readonly builds: number;
  readonly hits: number;
  readonly bookBuilds: number;
  readonly bookHits: number;
} {
  return {
    builds: baitBuilds,
    hits: baitHits,
    bookBuilds: exposureBookBuilds,
    bookHits: exposureBookHits,
  };
}

/** Svuota cache e contatori: un test che eredita la voce del test precedente
 *  misura la storia invece del proprio caso. */
export function resetBaitCandidatesCache(): void {
  baitCache = new WeakMap<readonly ListonePlayer[], BaitCacheEntry>();
  exposureBookCache = new WeakMap<readonly PastAuctionPurchase[], ExposureBookCacheEntry>();
  baitBuilds = 0;
  baitHits = 0;
  exposureBookBuilds = 0;
  exposureBookHits = 0;
}

/**
 * I candidati esca allo stato corrente, MEMOIZZATI. La porta pubblica.
 *
 * Puro e deterministico: stessi ingressi → stessa uscita. Non legge orologi,
 * non tocca lo storage, non conosce il DOM.
 */
export function baitCandidates(input: BaitInput): BaitReading {
  const openingPrice = input.openingPrice ?? BAIT_PARAMETERS.openingPrice;
  const stamp = teamsStamp(input.state);
  const cached = baitCache.get(input.pool);
  if (
    cached !== undefined &&
    cached.book === input.book &&
    cached.seats === input.seats &&
    cached.source === input.source &&
    cached.selfId === input.selfId &&
    cached.openingPrice === openingPrice &&
    cached.logLength === input.logLength &&
    cached.teamsStamp === stamp &&
    cached.poolRows === input.pool.length
  ) {
    baitHits += 1;
    return cached.reading;
  }
  baitBuilds += 1;
  const reading = computeBaitCandidates(input);
  baitCache.set(input.pool, {
    book: input.book,
    seats: input.seats,
    source: input.source,
    selfId: input.selfId,
    openingPrice,
    logLength: input.logLength,
    teamsStamp: stamp,
    poolRows: input.pool.length,
    reading,
  });
  return reading;
}

/**
 * Lo STESSO esito, calcolato senza guardare né toccare la cache.
 *
 * È il termine di paragone del test di trasparenza — la copia non memoizzata
 * contro cui si confronta quella memoizzata PASSO PER PASSO su una sequenza
 * lunga (stessa idea di `buildTierBookUncached` e di
 * `opportunityRadarReference.ts` nel motore). Non ha altri chiamanti e non deve
 * averne: l'app usa `baitCandidates`.
 */
export function baitCandidatesUncached(input: BaitInput): BaitReading {
  return computeBaitCandidates(input);
}

// IL RIQUADRO DEL VALORE — i quattro numeri della scheda del giocatore
// chiamato. Puro, deterministico, senza DOM (la resa sta in src/ui/valueBox.ts,
// il montaggio in src/main.ts).
//
// CHE COSA DEVE PORTARE, E DA DOVE VIENE L'AUTORITÀ. `docs/DECISIONS.md`
// §"Il riquadro del valore porta quattro numeri" (Pico, 2026-08-21): il
// riquadro porta QUATTRO numeri in DUE unità distinte — indice di appetibilità
// assoluto e relativo, valore assoluto e valore relativo in crediti. Lo stesso
// record dichiara esplicitamente che la FORMULA dei quattro numeri, il
// CAMPIONE MINIMO e il comportamento a COLD START **non sono decisi**, e
// lascia intero il vincolo «ingrediente mancante = `n/d`, mai un default».
// Questo file è costruito su quella riga: uno slot che non ha i suoi
// ingredienti dice `n/d` e dice PERCHÉ, e non c'è nessun ramo in cui un numero
// venga stimato, arrotondato da un vicino o riempito con un segnaposto.
//
// DA DOVE VIENE CIASCUN NUMERO, quando c'è.
//
//  1. INDICE ASSOLUTO — `appealIndex.score` della riga di listone del chiamato,
//     esattamente come il deposito privato lo serve, con etichetta di qualità e
//     versione della ricetta PORTATE DAL DATO e mai scritte qui
//     (`docs/DECISIONS.md` §"Estensione della deroga display-only dell'indice",
//     2026-08-21: l'indice può essere ingrediente dei due valori mostrati
//     **solo nel riquadro della scheda del chiamato**; la deroga display-only
//     del 2026-08-12 resta intera in tutto il resto, `n/d` compreso).
//
//  2. INDICE RELATIVO — «l'indice che si muove durante la serata». NON ESISTE:
//     nessuna funzione, in questo repository, calcola un indice che si muove
//     con l'asta, e la formula non è decisa. Lo slot è quindi sempre `n/d` col
//     proprio motivo. Inventarlo qui sarebbe esattamente ciò che §D9 vieta.
//
//  3. VALORE ASSOLUTO IN CREDITI — non più una dichiarazione giocatore per
//     giocatore, ma un numero DERIVATO: `absoluteValueReading()`
//     (packages/engine/src/absoluteValue.ts). Decisione di Pico del
//     2026-08-24, in tre passaggi: «non esiste il valore in crediti per me»
//     (esistono l'assoluto e il relativo al momento dell'asta); le tre gambe
//     dell'assoluto sono concorrenza nel ruolo, coppe europee e turnover,
//     valutazione del Gruppo Esperti; la SCALA IN CREDITI viene dal
//     regolamento — il budget d'asta ripartito sugli slot della rosa. La
//     catena passo per passo, con la provenienza di ogni numero, sta
//     nell'intestazione di quel modulo; qui si passano gli ingressi e si
//     traduce il suo esito in uno slot.
//
//     `CallScreen.declaredValue` NON alimenta più questo slot. Il listino di
//     valori per giocatore resta nel motore e resta l'ingrediente 2 di §D9 per
//     la catena FTM, che però — dopo la corsia dello slot 4, sotto — non ha più
//     un consumatore in questo riquadro; il valore assoluto non lo attraversa
//     più, ed è la ragione per cui questo slot non dipende da `call`.
//
//  4. VALORE RELATIVO IN CREDITI — `relativePriceReading()`
//     (packages/engine/src/relativeValue.ts): **quanto costa vincere adesso**,
//     cioè il secondo max bid fra i rivali eleggibili più uno, con tetto al max
//     bid del più ricco e a `maxSafe(io, ruolo)`. È `docs/DECISIONS.md` §"Il
//     prezzo relativo si assesta su quanto mette il secondo, non il più ricco"
//     (Pico, 2026-08-24): l'asta è a rilanci, e chi vince paga quanto è
//     disposto a mettere il secondo, più uno. Il più ricco dice soltanto SE
//     PUOI PERDERE; il secondo dice QUANTO TI COSTA VINCERE.
//
//     QUESTO SLOT NON PASSA PIÙ DALLA CATENA FAIR-TO-ME, ed è la correzione di
//     un difetto misurato: era nato agganciato a
//     `DecisionNumbers.fairToMeMaxEffective` (packages/engine/src/callScreen.ts)
//     — il tetto derivato dai valori dichiarati di Pico, dall'α del profilo di
//     rischio e dal costo opportunità del piano B — quattro ore dopo che Pico
//     aveva dichiarato una formula DIVERSA per lo stesso numero. Nessuno se
//     n'era accorto perché lo slot diceva comunque `n/d`. La catena FTM non è
//     stata cancellata: `callScreen()`, `chainOk` e `opportunityQualityGate`
//     restano dove sono, ed è il solo `fairToMeMaxEffective` a restare senza
//     consumatori su questo percorso — marcato come tale nell'intestazione di
//     `callScreen.ts` e in `SLOT_4_SOURCE_MOVED` qui sotto.
//
//     NON SERVONO DICHIARAZIONI DI PICO PER ACCENDERLO, e infatti si accende:
//     i suoi ingredienti sono soltanto fatti duri dell'event log — budget
//     residuo, slot residui, riserva dura — passati per `competitorSet()` e
//     `maxSafe()`.
//
//     LA RIGA SOTTO IL NUMERO DICE QUALE DEI TRE VINCOLI L'HA FISSATO, e non è
//     decorazione: `RelativePriceChain.boundBy` distingue un prezzo che il
//     MERCATO sta formando (`scala-dei-rivali`) da un TETTO STRUTTURALE che non
//     dice niente su quel giocatore — il max bid del più ricco, o il mio. A
//     tavolo fresco le otto squadre sono identiche, quindi il numero è lo
//     stesso — 473 — per ogni giocatore di ogni ruolo: senza quella riga la
//     cella direbbe per minuti la stessa cifra su ogni scheda senza spiegare
//     perché. Non è una formula nuova e non è un peso: è una differenza che il
//     motore calcola già, detta con parole diverse.
//
// I DUE TETTI DEL VALORE RELATIVO SONO SCRITTI NELLA FORMULA, non dedotti. Il
// record impone che il valore relativo non possa superare la capacità di spesa
// del tavolo, e quel vincolo è uno degli argomenti del minimo finale — il max
// bid del PIÙ RICCO fra i rivali eleggibili, che è «quanto il tavolo può
// pagarlo adesso» (un giocatore lo compra UNA squadra: la capacità è il massimo
// dei max bid veri, non la loro somma). Il secondo tetto è `maxSafe(io, ruolo)`,
// interrogata e mai riderivata: resta hard-safe e non overridabile. Nessuno dei
// due è un clamp aggiunto qui per prudenza — sono i due limiti che il record di
// Pico nomina, e stanno nel motore, non nella vista.
//
// NESSUNO DEI QUATTRO NUMERI PASSA PIÙ DAI VALORI DICHIARATI DI PICO, ed è la
// conseguenza congiunta delle due corsie del 2026-08-24: lo slot 3 deriva dal
// regolamento e dai target di ruolo, lo slot 4 dai vincoli duri del tavolo. Per
// questo l'etichetta di provenienza del motore (`DECLARED_VALUE_PROVENANCE`,
// «derivato dai tuoi valori») è USCITA da questo file invece di essere spostata
// da uno slot all'altro: non avrebbe più un numero legittimo da qualificare, e
// appiccicata a uno qualsiasi dei due sarebbe una frase falsa. La costante
// resta dov'è, nel motore, per chi costruirà una superficie che quei valori li
// usa davvero.
//
// COSA NON C'È, DI PROPOSITO:
//  - nessun `target_band`, nessuno `stretch_cap`, nessun «prendilo fino a» /
//    «mollalo a», nessun ranking, nessuna banda: il riquadro porta quattro
//    numeri e nient'altro. Che `fairToMeMaxEffective` e `stretchCap` oggi
//    coincidano numericamente nel motore è un fatto della catena, non una
//    ragione per accendere qui la superficie STOP: quella resta spenta, e
//    nessuna delle sue etichette compare;
//  - nessun `fairToMeMaxRaw`: il motore lo dichiara DIAGNOSTICO e NON
//    RENDERIZZABILE, e questo file non lo legge;
//  - nessun intervallo: `docs/DECISIONS.md` §"Valori precisi, mai intervalli"
//    (Pico, 2026-08-21) — scalari secchi, mai «fra 55 e 70»;
//  - nessun gate toccato: nessuna funzione di questo file legge, scrive o
//    dipende dal flag di promozione FTM dei manifest (`src/offline/
//    bundleIntegrity.ts`, dove un manifest che lo dichiara ON fa rifiutare
//    l'intero bundle) né dalla lista delle chiavi extra gated del listone
//    (`src/ui/listone.ts`). I due nomi compaiono qui come prosa, in questa
//    riga e solo per dire che restano fuori: `grep` li trova, il codice no.

import {
  type AbsoluteValueChain,
  type AbsoluteValueInput,
  type AbsoluteValueMissingReason,
  absoluteValueReading,
} from "../packages/engine/src/absoluteValue.js";
import type { CallScreen, NoTargetReason } from "../packages/engine/src/callScreen.js";
import {
  relativePriceReading,
  type RelativePriceBound,
  type RelativePriceMissingReason,
} from "../packages/engine/src/relativeValue.js";
import type { AuctionState, Role } from "../packages/engine/src/types.js";
import type { ListoneAppealIndex } from "./ui/listone.js";

/**
 * IL DEBITO DELLO SLOT 4, SALDATO — e la costante che lo dichiarava, sostituita.
 *
 * `#46` aveva introdotto `SLOT_4_SUPERSEDED` per dire, in un posto solo, che lo
 * slot 4 era ancora agganciato a `DecisionNumbers.fairToMeMaxEffective` mentre
 * Pico aveva già dichiarato un'altra formula, e che la riparazione sarebbe
 * arrivata in una PR dedicata. Questa è quella PR. Le due costanti NON
 * convivono: tenerle entrambe farebbe dire a questo file «non riparato» e
 * «riparato» nella stessa schermata, che è peggio di non averle mai scritte.
 *
 * CHE COSA È CAMBIATO, ESATTAMENTE UNA COSA: la sorgente dello slot 4. La
 * catena fair-to-me non è stata cancellata — `callScreen()` resta la
 * commutazione target/occasione/spettatore, `chainOk` resta l'invariante che
 * tiene ogni numero sotto `max_safe`, `opportunityQualityGate` resta il
 * cancello sulla qualità del dato. È il solo `fairToMeMaxEffective` a restare
 * senza consumatori, ed è marcato anche là dove nasce
 * (packages/engine/src/callScreen.ts).
 *
 * LA CONSEGUENZA CONGIUNTA delle due corsie del 2026-08-24 va detta qui perché
 * è qui che si vede: dopo `#46` (slot 3 derivato dal regolamento) e questa
 * (slot 4 dai vincoli duri del tavolo), il riquadro NON CONSUMA PIÙ un solo
 * valore dichiarato di Pico. `CallScreen` resta nella firma e non alimenta
 * nessuna cella; l'etichetta di provenienza del motore è uscita dal file.
 *
 * Pinnata da un test come le scelte non ratificate del motore
 * (`UNRATIFIED_CHOICES`, declaredValues.ts): documenta senza approvare, e
 * diventa rossa se qualcuno la cancella lasciando lo slot dov'è.
 */
export const SLOT_4_SOURCE_MOVED =
  "slot 4 (valore relativo): la sorgente è relativePriceReading() — secondo max bid " +
  "fra i rivali eleggibili, +1, con tetto al più ricco e a maxSafe(io, ruolo), " +
  "docs/DECISIONS.md 2026-08-24. Sostituisce SLOT_4_SUPERSEDED di #46, che " +
  "dichiarava il debito che questa corsia salda. DecisionNumbers.fairToMeMaxEffective " +
  "non alimenta più nessuna cella e resta senza consumatori: marcato, non rimosso.";

/** I quattro slot del riquadro, nell'ordine in cui il record li elenca. */
export type ValueSlotId =
  | "indice-assoluto"
  | "indice-relativo"
  | "valore-assoluto"
  | "valore-relativo";

export const VALUE_SLOT_ORDER: readonly ValueSlotId[] = [
  "indice-assoluto",
  "indice-relativo",
  "valore-assoluto",
  "valore-relativo",
];

/** Le due unità di misura decise dal record: due indici e due crediti. */
export type ValueSlotUnit = "indice" | "crediti";

/**
 * Perché uno slot non porta un numero. Ogni motivo è un fatto verificabile,
 * mai una scusa generica: chi legge deve poter capire se manca il dato, manca
 * una dichiarazione di Pico o manca proprio la decisione.
 */
export type ValueMissingReason =
  /** Nessun giocatore chiamato: non c'è soggetto di cui dire il valore. */
  | "nessun-chiamato"
  /** Il listone servito non porta nessun indice per questa riga. */
  | "indice-assente"
  /** L'indice c'è ma non ha verdetto (`score === null`): `n/d` portato dal dato. */
  | "indice-senza-verdetto"
  /** Nessuna formula decisa, e nessun codice che calcoli un indice che si muove. */
  | "indice-relativo-non-calcolato"
  /** L'app non ha oggi una sorgente per gli ingredienti dichiarati di §D9. */
  | "ingredienti-dichiarati-assenti"
  /** Il motore ha risposto, e la sua risposta è «qui non ci sono numeri». */
  | "motore-senza-numeri"
  // ── I motivi del VALORE ASSOLUTO derivato (absoluteValue.ts). Ognuno nomina
  //    LA COSA CHE MANCA: chi legge deve sapere se aspettare una dichiarazione
  //    di Pico, un dato, o niente del tutto.
  /** Pico non ha dichiarato il target di quel ruolo: la base non esiste. Mai
   *  una ripartizione uniforme di ripiego — sarebbe il peso nascosto di §D9. */
  | "ruolo-senza-target"
  /** Il target dichiarato non è un numero utilizzabile. */
  | "target-non-valido"
  /** La somma dei target dichiarati sfonda il budget del regolamento. */
  | "target-oltre-il-budget"
  /** Nessuna fascia per lui: nessun ordine, ruolo non ordinato, o senza verdetto. */
  | "fascia-assente"
  /** Ordinato, ma oltre l'ultima fascia: nessuno slot del ruolo gli corrisponde. */
  | "oltre-gli-slot-del-ruolo"
  /** La gamba CONCORRENZA ha un peso di Pico e non ha il suo ingrediente. */
  | "gamba-concorrenza-assente"
  /** La gamba COPPE ha un peso di Pico e non ha il suo ingrediente. */
  | "gamba-coppe-assente"
  /** La gamba PAGELLA ha un peso di Pico e non ha il suo ingrediente. */
  | "gamba-pagella-assente"
  // ── I motivi del PREZZO RELATIVO (relativeValue.ts). Ognuno nomina un fatto
  //    del tavolo, e nessuno di essi ha un numero di ripiego dietro: senza un
  //    secondo rivale non esiste un secondo max bid, e «non lo so» è la
  //    risposta giusta.
  /** Nessuna squadra mia in questo stato d'asta: non c'è un «io» che paghi. */
  | "tavolo-senza-la-mia-squadra"
  /** Il ruolo è pieno PER ME: non posso comprarlo, quindi non c'è un prezzo che io paghi. */
  | "ruolo-pieno-per-me"
  /** Il mio budget è bloccato dalla riserva dura: nessuna offerta valida, nessun prezzo. */
  | "non-posso-offrire"
  /** Nessun rivale può ancora comprarlo: non c'è nessuna asta da vincere. */
  | "nessun-rivale-eleggibile"
  /** Un solo rivale può ancora comprarlo: IL SECONDO NON ESISTE, e non si sostituisce col primo. */
  | "un-solo-rivale-eleggibile";

/**
 * I motivi del motore tradotti nei motivi del riquadro — uno a uno, senza
 * accorpamenti. È una mappa TOTALE sul vocabolario del motore: se un giorno
 * `absoluteValueReading` guadagna un motivo nuovo, il compilatore chiede questa
 * riga in più invece di lasciar passare un `n/d` muto.
 */
const ABSOLUTE_VALUE_REASON: Readonly<
  Record<AbsoluteValueMissingReason, ValueMissingReason>
> = {
  "nessun-chiamato": "nessun-chiamato",
  "ruolo-senza-target": "ruolo-senza-target",
  "target-non-valido": "target-non-valido",
  "target-oltre-il-budget": "target-oltre-il-budget",
  "fascia-assente": "fascia-assente",
  "oltre-gli-slot-del-ruolo": "oltre-gli-slot-del-ruolo",
  "gamba-concorrenza-assente": "gamba-concorrenza-assente",
  "gamba-coppe-assente": "gamba-coppe-assente",
  "gamba-pagella-assente": "gamba-pagella-assente",
};

/**
 * Come sopra, per `relativePriceReading`. Sono DUE mappe e non una: i due slot
 * hanno due motori, due vocabolari e due ragioni per tacere, e fonderle
 * significherebbe che un motivo nuovo di uno dei due passa senza che il
 * compilatore lo chieda.
 */
const RELATIVE_PRICE_REASON: Readonly<
  Record<RelativePriceMissingReason, ValueMissingReason>
> = {
  "squadra-assente": "tavolo-senza-la-mia-squadra",
  "ruolo-pieno-per-me": "ruolo-pieno-per-me",
  "max-safe-a-zero": "non-posso-offrire",
  "nessun-rivale-eleggibile": "nessun-rivale-eleggibile",
  "un-solo-rivale-eleggibile": "un-solo-rivale-eleggibile",
};

export type ValueSlot =
  | { readonly kind: "numero"; readonly value: number; readonly unit: ValueSlotUnit }
  | { readonly kind: "assente"; readonly reason: ValueMissingReason };

/**
 * Gli ingredienti che §D9 chiama «input dichiarato di Pico» e che la catena del
 * motore pretende per emettere i due numeri in crediti.
 */
export type DeclaredInputId = "valori-dichiarati" | "profilo-di-rischio";

/**
 * QUELLO CHE OGGI MANCA ALL'APP, misurato e non supposto.
 *
 * `packages/engine/src/callScreen.ts` è esportato da `packages/engine/src/
 * index.ts` e non ha un solo import in `src/`: il numero è scritto e provato,
 * ma l'app non lo può calcolare, perché DUE dei suoi ingressi sono
 * dichiarazioni di Pico e nessuna delle due ha una sorgente nel core pubblico —
 * `grep` su `src/` per `DeclaredValueBook`/`declaredValue` e per `ValueProfile`
 * torna a vuoto, e `declaredValueBook()` è costruito solo dalle fixture di test
 * del motore. Non è un cancello chiuso: è un dato che non entra da nessuna
 * parte.
 *
 * Questa costante è la dichiarazione di quel fatto in un posto solo.
 *
 * NON GOVERNA PIÙ NESSUNA CELLA, e va detto qui invece che scoperto leggendo
 * `src/main.ts`: dopo le due corsie del 2026-08-24 i due numeri in crediti si
 * accendono senza quelle dichiarazioni, quindi il riquadro non le aspetta più e
 * `valueBoxProps()` passa una lista vuota. Resta esportata e provata perché il
 * fatto che descrive è ancora vero — quelle due dichiarazioni una sorgente in
 * `src/` non ce l'hanno — e perché è il posto dove si riattaccherà, se
 * serviranno, invece di essere riscritta da capo.
 */
export const DECLARED_INPUTS_WITHOUT_SOURCE: readonly DeclaredInputId[] = [
  "valori-dichiarati",
  "profilo-di-rischio",
];

export interface CalledIdentity {
  readonly playerId: string;
  readonly role: Role;
}

export interface ValueBoxInput {
  /** Il chiamato, o `null` quando non c'è nessuna riga correlata. */
  readonly called: CalledIdentity | null;
  /**
   * L'indice della riga di listone del chiamato, esattamente come il deposito
   * lo serve. `undefined` quando quella riga non lo porta.
   */
  readonly appealIndex: ListoneAppealIndex | undefined;
  /**
   * La schermata CHIAMATA del motore per quel giocatore, quando l'app riesce a
   * costruirla; `null` quando non ha gli ingressi per chiederla. Alimenta il
   * NESSUNO DEI QUATTRO SLOT, ed è la conseguenza congiunta delle due corsie
   * del 2026-08-24: lo slot 3 deriva dal regolamento e dai target di ruolo, lo
   * slot 4 dai vincoli duri del tavolo. `call` resta nella firma — non si
   * cancella ciò che è stato scritto e provato — e continua a portare il
   * verdetto del motore in `ValueBoxReading.engineReason`, che oggi non spiega
   * più nessuna cella. In produzione è sempre `null` e lo è sempre stato: vedi
   * `SLOT_4_SOURCE_MOVED`.
   */
  readonly call: CallScreen | null;
  /**
   * Gli ingredienti dichiarati che mancano, quando `call` è `null`.
   *
   * NON GOVERNA PIÙ NESSUNA CELLA. Ogni `n/d` del riquadro nomina adesso la
   * cosa che manca A QUELLA cella — «manca il tuo target di ruolo», «un solo
   * rivale capiente» — che è più preciso di una nota generale in testata. La
   * nota che ne usciva prometteva una cella spenta per una ragione che non era
   * la sua, e per questo `src/main.ts` passa qui una lista vuota.
   */
  readonly missingDeclaredInputs: readonly DeclaredInputId[];
  /**
  /**
   * GLI INGRESSI DELLA DERIVAZIONE DEL VALORE ASSOLUTO — target dichiarati,
   * libro delle fasce, le tre gambe. Nessuno di essi dipende dalla serata: è
   * la firma stessa di `AbsoluteValueInput` a garantirlo (nessun
   * `AuctionState`, nessun log, nessuna rosa).
   *
   * `called` viene da qui e non da `input.called`: sono lo stesso giocatore, e
   * lasciarli due significa poter chiedere il valore assoluto di uno e mostrare
   * il riquadro di un altro. La funzione lo riscrive prima di chiamare.
   */
  readonly absolute: Omit<AbsoluteValueInput, "called">;
  /**
   * IL TAVOLO ADESSO, e serve al solo SLOT 4: lo stato d'asta prodotto dal
   * reducer più la propria identità. Non è opzionale e non ha un default —
   * l'app ce l'ha sempre, e un tavolo assente non è «zero rivali», è una
   * domanda a cui non si può rispondere.
   *
   * È L'ESATTO CONTRARIO DI `absolute` QUI SOPRA, e i due campi stanno vicini
   * perché la differenza si veda: quello non può contenere uno stato d'asta,
   * questo non contiene altro. Lo slot 3 è la fotografia che non dipende dalla
   * serata, lo slot 4 è la serata.
   *
   * Il RUOLO su cui si compete non sta qui: viene da `called.role`, perché
   * sono lo stesso ruolo e tenerne due significherebbe poter chiedere il prezzo
   * di un reparto mentre si mostra la scheda di un altro.
   */
  readonly table: ValueBoxTable;
}

/** Lo stato d'asta e l'identità di chi guarda: gli ingressi del prezzo relativo. */
export interface ValueBoxTable {
  readonly state: AuctionState;
  readonly selfId: string;
}

export interface ValueBoxReading {
  readonly called: boolean;
  readonly slots: Readonly<Record<ValueSlotId, ValueSlot>>;
  /** Etichetta di qualità dell'indice, PORTATA DAL DATO. `null` senza indice. */
  readonly indexQuality: string | null;
  /** Versione della ricetta, PORTATA DAL DATO. `null` senza indice. */
  readonly indexRecipe: string | null;
  /**
   * Il motivo del motore, quando è lui a non emettere numeri. Oggi non spiega
   * nessuna cella: vedi `SLOT_4_SOURCE_MOVED`.
   */
  readonly engineReason: NoTargetReason | null;
  /**
   * QUALE DEI TRE VINCOLI HA FISSATO IL PREZZO RELATIVO, o `null` quando quel
   * numero non c'è. È il gemello magro di `absoluteChain`: allo slot 4 serve
   * UNA distinzione, non l'intera catena, e il riquadro sta sopra il gesto
   * principale — ogni riga in più si paga in pixel (e2e/asta-gesto-principale).
   *
   * Serve a dire con parole diverse due cose diverse che il numero da solo
   * confonde: un prezzo che il mercato sta formando e un tetto strutturale.
   */
  readonly relativePriceBound: RelativePriceBound | null;
  /**
   * LA CATENA DEL VALORE ASSOLUTO, quando il numero esiste: budget, target,
   * slot, quota, fascia, base e le tre gambe con la loro posizione. `null`
   * quando lo slot 3 è `n/d`.
   *
   * Viaggia fino a chi mostra perché la derivazione dev'essere ISPEZIONABILE e
   * non solo corretta: un numero derivato che non sa dire da dove viene è
   * indistinguibile da un numero inventato.
   */
  readonly absoluteChain: AbsoluteValueChain | null;
  /**
   * `true` quando il valore assoluto sta sotto il credito minimo. SI DICHIARA,
   * non si aggiusta: un clamp al pavimento sarebbe una scelta silenziosa.
   */
  readonly absoluteBelowCostFloor: boolean;
  /** Gli ingredienti dichiarati che l'app non ha; vuoto quando li ha tutti. */
  readonly missingDeclaredInputs: readonly DeclaredInputId[];
}

const ABSENT = (reason: ValueMissingReason): ValueSlot => ({ kind: "assente", reason });

function noCalledPlayer(): ValueBoxReading {
  return {
    called: false,
    slots: {
      "indice-assoluto": ABSENT("nessun-chiamato"),
      "indice-relativo": ABSENT("nessun-chiamato"),
      "valore-assoluto": ABSENT("nessun-chiamato"),
      "valore-relativo": ABSENT("nessun-chiamato"),
    },
    indexQuality: null,
    indexRecipe: null,
    engineReason: null,
    relativePriceBound: null,
    absoluteChain: null,
    absoluteBelowCostFloor: false,
    missingDeclaredInputs: [],
  };
}

/** L'indice assoluto: il punteggio servito, o il perché non c'è. */
function absoluteIndexSlot(index: ListoneAppealIndex | undefined): ValueSlot {
  if (index === undefined) return ABSENT("indice-assente");
  if (index.score === null) return ABSENT("indice-senza-verdetto");
  return { kind: "numero", value: index.score, unit: "indice" };
}

/**
 * IL VALORE RELATIVO — lo SLOT 4: quanto costa vincere questo giocatore adesso.
 *
 * Tutto il calcolo sta in `relativePriceReading()`, che è del motore e non
 * conosce questa vista; qui si passa il tavolo e si traduce il suo esito in uno
 * slot. In particolare NON si aggiunge nessun tetto, nessun arrotondamento e
 * nessun ramo di ripiego: i due tetti del record di Pico sono già dentro quel
 * numero, e un terzo scritto qui sarebbe una formula che nessuno ha deciso.
 *
 * Torna anche il VINCOLO CHE HA FISSATO il numero, che la vista usa per dire
 * con parole diverse un prezzo di mercato e un tetto strutturale. È `null`
 * quando non c'è un numero: un vincolo senza il suo numero non lega niente.
 */
function relativeCreditSlot(
  table: ValueBoxTable,
  role: Role,
): { readonly slot: ValueSlot; readonly bound: RelativePriceBound | null } {
  const reading = relativePriceReading({
    state: table.state,
    role,
    selfId: table.selfId,
  });
  return reading.kind === "assente"
    ? { slot: ABSENT(RELATIVE_PRICE_REASON[reading.reason]), bound: null }
    : {
        slot: { kind: "numero", value: reading.credits, unit: "crediti" },
        bound: reading.chain.boundBy,
      };
}
/**
 * Il riquadro del valore per il giocatore chiamato adesso.
 *
 * Deterministica e totale: ogni slot esce o come numero o come assenza col
 * proprio motivo, e non esiste un terzo esito.
 */
export function valueBoxReading(input: ValueBoxInput): ValueBoxReading {
  if (input.called === null) return noCalledPlayer();

  // IL VALORE ASSOLUTO, derivato. `called` viene riscritto dal riquadro: il
  // giocatore di cui si dice il valore è, per costruzione, quello di cui si sta
  // mostrando la scheda.
  const derived = absoluteValueReading({ ...input.absolute, called: input.called });
  const absolute: ValueSlot =
    derived.kind === "assente"
      ? ABSENT(ABSOLUTE_VALUE_REASON[derived.reason])
      : { kind: "numero", value: derived.credits, unit: "crediti" };

  // IL VALORE RELATIVO, dal tavolo. I due numeri in crediti escono adesso da
  // DUE motori diversi e non hanno più un modo di fallire insieme: è la ragione
  // per cui la funzione che li produceva in coppia non esiste più.
  const { slot: relative, bound: relativePriceBound } = relativeCreditSlot(
    input.table,
    input.called.role,
  );

  return {
    called: true,
    slots: {
      "indice-assoluto": absoluteIndexSlot(input.appealIndex),
      // Sempre assente, e per un motivo che non è un difetto di questo file:
      // la formula non è decisa e nessun modulo del repository calcola un
      // indice che si muove con la serata. Vedi l'intestazione.
      "indice-relativo": ABSENT("indice-relativo-non-calcolato"),
      "valore-assoluto": absolute,
      "valore-relativo": relative,
    },
    indexQuality: input.appealIndex?.quality ?? null,
    indexRecipe: input.appealIndex?.recipe ?? null,
    // `creditsProvenance` NON C'È PIÙ: dopo le due corsie del 2026-08-24
    // nessuno dei quattro numeri è costruito sui valori dichiarati di Pico, e
    // l'etichetta che il motore impone accanto a quei numeri non avrebbe più
    // niente da qualificare. Tolta, non spostata da uno slot all'altro — vedi
    // l'intestazione e `SLOT_4_SOURCE_MOVED`.
    //
    // `engineReason` RESTA, e resta senza cella da spiegare: `call` è sempre
    // `null` in produzione e nessuno slot esce più con `motore-senza-numeri`.
    // Si riporta perché il verdetto del motore sul chiamato è un fatto, e
    // perché toglierlo qui vorrebbe dire togliere in un colpo solo anche
    // l'intera presa di `CallScreen` — una decisione di chi costruirà la
    // superficie dove Pico dichiara i suoi valori, non di questa corsia.
    engineReason: input.call?.noTargetReason ?? null,
    relativePriceBound,
    absoluteChain: derived.kind === "valore" ? derived.chain : null,
    absoluteBelowCostFloor: derived.kind === "valore" && derived.belowCostFloor,
    missingDeclaredInputs: input.call === null ? input.missingDeclaredInputs : [],
  };
}

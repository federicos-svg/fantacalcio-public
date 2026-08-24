// IL RIQUADRO DEL VALORE — i DUE INDICI della scheda del giocatore chiamato.
// Puro, deterministico, senza DOM (la resa sta in src/ui/valueBox.ts, il
// montaggio in src/main.ts).
//
// ─────────────────────────────────────────────────────────────────────────────
// I DUE NUMERI IN CREDITI SONO USCITI DAL RIQUADRO. DECISIONE DI PICO,
// 2026-08-24, in modale, alla lettera:
//
//     «Leva il valore assoluto e il valore relativo»
//
// È la risposta alla domanda che la review fresh-eyes su #47 aveva sollevato e
// che nessun record aveva chiuso: il riquadro affiancava due cifre in crediti
// con un rapporto di ~16× — «valore assoluto 30 cr» e «valore relativo 473 cr»
// — senza niente che le mettesse in relazione, e nei primi minuti d'asta il
// relativo era 473 su OGNI scheda di OGNI ruolo. Le alternative erano tre:
// raccordarle, nascondere il relativo a tavolo fresco, o toglierle. Pico ha
// scelto la terza. Non è stato detto che i due numeri siano sbagliati: è stato
// detto che non vanno in questo riquadro.
//
// CHE COSA È USCITO, E CHE COSA NO — la distinzione è tutta la corsia:
//
//  - ESCE IL CONSUMO. Questo file non chiama più `absoluteValueReading()` né
//    `relativePriceReading()`, non ha più uno slot 3 e uno slot 4, e non riceve
//    più né gli ingressi della derivazione (`AbsoluteValueInput`) né il tavolo
//    (`AuctionState` + identità). La resa dei due numeri, le loro etichette e i
//    loro `n/d` sono usciti con loro.
//  - RESTANO I DUE MOTORI, INTATTI E PROVATI.
//    `packages/engine/src/absoluteValue.ts` e
//    `packages/engine/src/relativeValue.ts` non sono stati toccati nel calcolo
//    e le loro suite restano intere: il numero continua a essere corretto, non
//    ha più una superficie che lo mostra.
//  - LA CONSEGUENZA VA DETTA, NON NASCOSTA: da adesso quei due moduli sono
//    codice del motore SENZA CONSUMATORI NELL'APP, cioè esattamente la forma di
//    difetto a cui questo progetto sta dando la caccia (`opportunities.ts` è
//    completo e non ha un solo chiamante). È scritto qui, nell'intestazione dei
//    due moduli e nel messaggio di commit che porta la frase di Pico, perché il
//    prossimo che passa lo TROVI invece di riscoprirlo.
//
// ─────────────────────────────────────────────────────────────────────────────
//
// CHE COSA PORTA ADESSO, E DA DOVE VIENE L'AUTORITÀ. `docs/DECISIONS.md`
// §"Il riquadro del valore porta quattro numeri" (Pico, 2026-08-21) resta la
// casa del riquadro, e la decisione del 2026-08-24 ne PRECISA il contenuto: dei
// quattro slot restano i DUE INDICI. Lo stesso record del 21 dichiara che la
// FORMULA dei numeri, il CAMPIONE MINIMO e il comportamento a COLD START non
// sono decisi, e lascia intero il vincolo «ingrediente mancante = `n/d`, mai un
// default». Questo file è costruito su quella riga: uno slot che non ha i suoi
// ingredienti dice `n/d` e dice PERCHÉ, e non c'è nessun ramo in cui un numero
// venga stimato, arrotondato da un vicino o riempito con un segnaposto.
//
//  1. INDICE ASSOLUTO — `appealIndex.score` della riga di listone del chiamato,
//     esattamente come il deposito privato lo serve, con etichetta di qualità e
//     versione della ricetta PORTATE DAL DATO e mai scritte qui
//     (`docs/DECISIONS.md` §"Estensione della deroga display-only dell'indice",
//     2026-08-21: l'indice può essere ingrediente dei valori mostrati **solo
//     nel riquadro della scheda del chiamato**; la deroga display-only del
//     2026-08-12 resta intera in tutto il resto, `n/d` compreso).
//
//  2. INDICE RELATIVO — «l'indice che si muove durante la serata». NON ESISTE:
//     nessuna funzione, in questo repository, calcola un indice che si muove
//     con l'asta, e la formula non è decisa. Lo slot è quindi sempre `n/d` col
//     proprio motivo. Inventarlo qui sarebbe esattamente ciò che §D9 vieta.
//
// UNA SOLA CELLA PORTA UN NUMERO, OGGI, e va detto invece che scoperto: con lo
// slot 2 sempre `n/d` per una formula non decisa, il riquadro mostra un numero
// e un'assenza dichiarata. È la conseguenza aritmetica della decisione di Pico,
// non una scelta di questo file, e non si compensa accendendo altro: una cella
// `n/d` col suo motivo è un'informazione, un numero inventato per riempire il
// riquadro sarebbe una bugia.
//
// NESSUNA DICHIARAZIONE DI PICO ENTRA PIÙ IN QUESTO FILE. I due numeri in
// crediti erano gli unici che potessero dipendere da un valore dichiarato o da
// un profilo di rischio; usciti loro, il riquadro non aspetta più niente da
// nessuno. Per questo sono usciti con loro anche `DECLARED_INPUTS_WITHOUT_SOURCE`
// e la riga di testata che li nominava: una nota che promette una cella spenta
// per una dichiarazione che nessuna cella aspetta è una frase senza soggetto.
// Il fatto che quelle due dichiarazioni una sorgente in `src/` non ce l'abbiano
// resta vero e resta scritto dove nasce, nel motore.
//
// COSA NON C'È, DI PROPOSITO:
//  - nessun numero in crediti, in nessuna cella: è la decisione del 2026-08-24;
//  - nessun `target_band`, nessuno `stretch_cap`, nessun «prendilo fino a» /
//    «mollalo a», nessun ranking, nessuna banda;
//  - nessun `fairToMeMaxRaw` e nessun `fairToMeMaxEffective`: il primo il
//    motore lo dichiara DIAGNOSTICO e NON RENDERIZZABILE, il secondo è senza
//    consumatori da #47 e lo resta;
//  - nessun intervallo: `docs/DECISIONS.md` §"Valori precisi, mai intervalli"
//    (Pico, 2026-08-21) — scalari secchi, mai «fra 55 e 70»;
//  - nessun gate toccato: nessuna funzione di questo file legge, scrive o
//    dipende dal flag di promozione FTM dei manifest (`src/offline/
//    bundleIntegrity.ts`, dove un manifest che lo dichiara ON fa rifiutare
//    l'intero bundle) né dalla lista delle chiavi extra gated del listone
//    (`src/ui/listone.ts`). I due nomi compaiono qui come prosa, in questa
//    riga e solo per dire che restano fuori: `grep` li trova, il codice no.

import type { Role } from "../packages/engine/src/types.js";
import type { ListoneAppealIndex } from "./ui/listone.js";

/**
 * I DUE NUMERI IN CREDITI SONO USCITI DAL RIQUADRO — la dichiarazione, in un
 * posto solo, con la frase che l'autorizza.
 *
 * SOSTITUISCE `SLOT_4_SOURCE_MOVED`, che diceva da dove lo slot 4 prendeva il
 * numero. Le due costanti NON convivono, per la stessa ragione per cui quella
 * non conviveva con `SLOT_4_SUPERSEDED` di #46: tenerle entrambe farebbe dire a
 * questo file «lo slot 4 legge il prezzo del tavolo» e «lo slot 4 non c'è più»
 * nella stessa schermata, che è peggio di non averle mai scritte. La catena
 * delle tre costanti è la cronologia della cella, e ogni anello è nel commit
 * che lo ha sostituito.
 *
 * QUELLO CHE DICHIARA, ed è un fatto scomodo che va tenuto in vista: dopo
 * questa corsia `absoluteValue.ts` e `relativeValue.ts` sono due moduli del
 * motore completi, provati e SENZA UN CHIAMANTE NELL'APP. Non è un difetto da
 * riparare qui — Pico ha deciso che quei numeri non stanno in questo riquadro,
 * non che il calcolo sia sbagliato — ma è la cosa che il prossimo lettore deve
 * trovare scritta invece di dedurla da un `grep` a vuoto.
 *
 * Pinnata da un test come le scelte non ratificate del motore
 * (`UNRATIFIED_CHOICES`, declaredValues.ts): documenta senza approvare, e
 * diventa rossa se qualcuno la cancella rimettendo le celle dov'erano.
 */
export const CREDITI_FUORI_DAL_RIQUADRO =
  "valore assoluto e valore relativo non sono più celle di questo riquadro: Pico, " +
  "2026-08-24, «Leva il valore assoluto e il valore relativo». Sostituisce " +
  "SLOT_4_SOURCE_MOVED. I due motori restano interi e provati — " +
  "packages/engine/src/absoluteValue.ts e packages/engine/src/relativeValue.ts — " +
  "e da adesso sono SENZA CONSUMATORI nell'app: dichiarato, non rimosso.";

/** I due slot del riquadro, nell'ordine in cui il record li elenca. */
export type ValueSlotId = "indice-assoluto" | "indice-relativo";

export const VALUE_SLOT_ORDER: readonly ValueSlotId[] = ["indice-assoluto", "indice-relativo"];

/**
 * L'unità di misura delle celle rimaste. UNA SOLA, e il tipo lo dice: `crediti`
 * è uscito insieme ai due numeri che lo portavano, e un'unità dichiarata che
 * nessuno slot può produrre sarebbe un ramo di resa che nessun test raggiunge.
 */
export type ValueSlotUnit = "indice";

/**
 * Perché uno slot non porta un numero. Ogni motivo è un fatto verificabile,
 * mai una scusa generica: chi legge deve poter capire se manca il dato, se il
 * dato c'è ma non ha verdetto, o se manca proprio la decisione.
 *
 * QUATTRO VOCI E NON DICIOTTO: le quattordici uscite sono quelle che spiegavano
 * i due numeri in crediti — i motivi del valore assoluto derivato, quelli del
 * prezzo relativo, l'assenza degli ingredienti dichiarati e il verdetto del
 * motore. Sono uscite con le celle che spiegavano; il vocabolario di ogni
 * motore resta intero a casa sua, dove è ancora provato.
 */
export type ValueMissingReason =
  /** Nessun giocatore chiamato: non c'è soggetto di cui dire il valore. */
  | "nessun-chiamato"
  /** Il listone servito non porta nessun indice per questa riga. */
  | "indice-assente"
  /** L'indice c'è ma non ha verdetto (`score === null`): `n/d` portato dal dato. */
  | "indice-senza-verdetto"
  /** Nessuna formula decisa, e nessun codice che calcoli un indice che si muove. */
  | "indice-relativo-non-calcolato";

export type ValueSlot =
  | { readonly kind: "numero"; readonly value: number; readonly unit: ValueSlotUnit }
  | { readonly kind: "assente"; readonly reason: ValueMissingReason };

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
}

export interface ValueBoxReading {
  readonly called: boolean;
  readonly slots: Readonly<Record<ValueSlotId, ValueSlot>>;
  /** Etichetta di qualità dell'indice, PORTATA DAL DATO. `null` senza indice. */
  readonly indexQuality: string | null;
  /** Versione della ricetta, PORTATA DAL DATO. `null` senza indice. */
  readonly indexRecipe: string | null;
}

const ABSENT = (reason: ValueMissingReason): ValueSlot => ({ kind: "assente", reason });

function noCalledPlayer(): ValueBoxReading {
  return {
    called: false,
    slots: {
      "indice-assoluto": ABSENT("nessun-chiamato"),
      "indice-relativo": ABSENT("nessun-chiamato"),
    },
    indexQuality: null,
    indexRecipe: null,
  };
}

/** L'indice assoluto: il punteggio servito, o il perché non c'è. */
function absoluteIndexSlot(index: ListoneAppealIndex | undefined): ValueSlot {
  if (index === undefined) return ABSENT("indice-assente");
  if (index.score === null) return ABSENT("indice-senza-verdetto");
  return { kind: "numero", value: index.score, unit: "indice" };
}

/**
 * Il riquadro del valore per il giocatore chiamato adesso.
 *
 * Deterministica e totale: ogni slot esce o come numero o come assenza col
 * proprio motivo, e non esiste un terzo esito.
 *
 * LA FIRMA È LA GARANZIA. Non riceve uno stato d'asta, non riceve una schermata
 * CHIAMATA, non riceve target dichiarati né un libro delle fasce: dopo la
 * decisione del 2026-08-24 non c'è più una cella che possa dipendere dalla
 * serata o da una dichiarazione di Pico, e la firma lo rende impossibile invece
 * di prometterlo in un commento.
 */
export function valueBoxReading(input: ValueBoxInput): ValueBoxReading {
  if (input.called === null) return noCalledPlayer();

  return {
    called: true,
    slots: {
      "indice-assoluto": absoluteIndexSlot(input.appealIndex),
      // Sempre assente, e per un motivo che non è un difetto di questo file:
      // la formula non è decisa e nessun modulo del repository calcola un
      // indice che si muove con la serata. Vedi l'intestazione.
      "indice-relativo": ABSENT("indice-relativo-non-calcolato"),
    },
    indexQuality: input.appealIndex?.quality ?? null,
    indexRecipe: input.appealIndex?.recipe ?? null,
  };
}

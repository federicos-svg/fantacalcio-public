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
//  3. VALORE ASSOLUTO IN CREDITI — il valore che Pico DICHIARA per quel
//     giocatore (`CallScreen.declaredValue`, cioè `DeclaredPlayerValue`):
//     ingrediente 2 della regola dei tre ingredienti (§D9), non derivato, non
//     imputato, e per costruzione «la fotografia che non dipende dalla serata».
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
//     `callScreen.ts` e in `SUPERSEDES_FAIR_TO_ME_IN_THE_RIQUADRO`.
//
//     NON SERVONO DICHIARAZIONI DI PICO PER ACCENDERLO, e infatti si accende:
//     i suoi ingredienti sono soltanto fatti duri dell'event log — budget
//     residuo, slot residui, riserva dura — passati per `competitorSet()` e
//     `maxSafe()`. È la ragione per cui è l'unico dei quattro numeri in crediti
//     che l'app di oggi sa davvero calcolare.
//
// IL TETTO DEL TAVOLO NON È PIÙ UNA CONSEGUENZA: È SCRITTO NELLA FORMULA. Il
// record impone che il valore relativo non possa superare la capacità di spesa
// del tavolo, e adesso quel vincolo è uno degli argomenti del minimo finale —
// il max bid del PIÙ RICCO fra i rivali eleggibili, che è «quanto il tavolo può
// pagarlo adesso» (un giocatore lo compra UNA squadra: la capacità è il massimo
// dei max bid veri, non la loro somma). Il secondo tetto è `maxSafe(io, ruolo)`,
// interrogata e mai riderivata: resta hard-safe e non overridabile. Nessuno dei
// due è un clamp aggiunto qui per prudenza — sono i due limiti che il record di
// Pico nomina, e stanno nel motore, non nella vista.
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

import type { CallScreen, NoTargetReason } from "../packages/engine/src/callScreen.js";
import { DECLARED_VALUE_PROVENANCE } from "../packages/engine/src/declaredValues.js";
import {
  relativePriceReading,
  type RelativePriceMissingReason,
} from "../packages/engine/src/relativeValue.js";
import type { AuctionState, Role } from "../packages/engine/src/types.js";
import type { ListoneAppealIndex } from "./ui/listone.js";

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
 * accorpamenti. È una mappa TOTALE sul vocabolario di `relativeValue.ts`: se un
 * giorno quel modulo guadagna un motivo nuovo, il compilatore chiede questa
 * riga in più invece di lasciar passare un `n/d` muto.
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
 * Questa costante è la dichiarazione di quel fatto in un posto solo. Il giorno
 * in cui i valori dichiarati e il profilo entrano nell'app, `valueBoxProps()`
 * passa un `CallScreen` vero al posto di `null` e i due slot in crediti si
 * accendono senza che questo file cambi.
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
   * solo SLOT 3 — lo slot 4 non la attraversa più.
   */
  readonly call: CallScreen | null;
  /** Gli ingredienti dichiarati che mancano, quando `call` è `null`. */
  readonly missingDeclaredInputs: readonly DeclaredInputId[];
  /**
   * IL TAVOLO ADESSO, e serve al solo SLOT 4: lo stato d'asta prodotto dal
   * reducer più la propria identità. Non è opzionale e non ha un default —
   * l'app ce l'ha sempre, e un tavolo assente non è «zero rivali», è una
   * domanda a cui non si può rispondere.
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
   * L'etichetta di provenienza che il motore impone accanto a ogni numero
   * costruito sui valori dichiarati. Qualifica il SOLO valore assoluto — il
   * valore relativo non passa dai valori dichiarati — ed è `null` quando quel
   * numero non è a schermo: una provenienza senza il suo numero non qualifica
   * niente, e appiccicata a un numero che viene da un'altra strada mentirebbe.
   */
  readonly creditsProvenance: string | null;
  /** Il motivo del motore, quando è lui a non emettere numeri. */
  readonly engineReason: NoTargetReason | null;
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
    creditsProvenance: null,
    engineReason: null,
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
 * IL VALORE ASSOLUTO — lo SLOT 3, e da questa corsia in poi l'unico dei quattro
 * che passa dalla schermata CHIAMATA del motore: il valore che Pico DICHIARA
 * per quel giocatore, non derivato e non imputato.
 */
function absoluteCreditSlot(
  call: CallScreen | null,
  missing: readonly DeclaredInputId[],
): {
  readonly absolute: ValueSlot;
  readonly engineReason: NoTargetReason | null;
} {
  if (call === null) {
    const reason: ValueMissingReason =
      missing.length > 0 ? "ingredienti-dichiarati-assenti" : "motore-senza-numeri";
    return { absolute: ABSENT(reason), engineReason: null };
  }
  const absolute: ValueSlot =
    call.declaredValue === null
      ? ABSENT("motore-senza-numeri")
      : { kind: "numero", value: call.declaredValue, unit: "crediti" };
  return { absolute, engineReason: call.noTargetReason };
}

/**
 * IL VALORE RELATIVO — lo SLOT 4: quanto costa vincere questo giocatore adesso.
 *
 * Tutto il calcolo sta in `relativePriceReading()`, che è del motore e non
 * conosce questa vista; qui si passa il tavolo e si traduce il suo esito in uno
 * slot. In particolare NON si aggiunge nessun tetto, nessun arrotondamento e
 * nessun ramo di ripiego: i due tetti del record di Pico sono già dentro quel
 * numero, e un terzo scritto qui sarebbe una formula che nessuno ha deciso.
 */
function relativeCreditSlot(table: ValueBoxTable, role: Role): ValueSlot {
  const reading = relativePriceReading({
    state: table.state,
    role,
    selfId: table.selfId,
  });
  return reading.kind === "assente"
    ? ABSENT(RELATIVE_PRICE_REASON[reading.reason])
    : { kind: "numero", value: reading.credits, unit: "crediti" };
}

/**
 * Il riquadro del valore per il giocatore chiamato adesso.
 *
 * Deterministica e totale: ogni slot esce o come numero o come assenza col
 * proprio motivo, e non esiste un terzo esito.
 */
export function valueBoxReading(input: ValueBoxInput): ValueBoxReading {
  if (input.called === null) return noCalledPlayer();

  const { absolute, engineReason } = absoluteCreditSlot(
    input.call,
    input.missingDeclaredInputs,
  );
  const relative = relativeCreditSlot(input.table, input.called.role);

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
    // LA PROVENIENZA QUALIFICA IL SOLO VALORE ASSOLUTO, ed è la conseguenza
    // diretta del cambio di sorgente dello slot 4: «derivato dai tuoi valori»
    // sarebbe falso accanto a un numero che dai valori dichiarati non passa.
    creditsProvenance: absolute.kind === "numero" ? DECLARED_VALUE_PROVENANCE : null,
    engineReason,
    missingDeclaredInputs: input.call === null ? input.missingDeclaredInputs : [],
  };
}

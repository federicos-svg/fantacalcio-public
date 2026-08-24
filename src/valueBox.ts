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
//     la catena FTM (slot 4); ma il valore assoluto non lo attraversa più, ed è
//     la ragione per cui questo slot non dipende più da `call`.
//
//  4. VALORE RELATIVO IN CREDITI — `DecisionNumbers.fairToMeMaxEffective`
//     (packages/engine/src/callScreen.ts): il tetto derivato dai valori
//     dichiarati di Pico, che si muove durante la serata perché si muovono i
//     suoi ingredienti misurati (il costo opportunità della migliore
//     alternativa ancora sul mercato e il max bid vero). È §D9 perimetro 1 —
//     «derivato dai valori dichiarati di Owner → visibile, nessun receipt» —
//     e NON il campo FTM model-derived, che resta gated e che questo file non
//     tocca in nessun ramo.
//
//     QUESTO SLOT NON È STATO TOCCATO IN QUESTA CORSIA, DI PROPOSITO — un
//     cambio di formula (slot 3) e un cambio di contratto (slot 4) nella
//     stessa PR sono due errori che si coprono a vicenda. Ma il difetto è
//     misurato e va dichiarato invece che lasciato implicito: vedi
//     `SLOT_4_SUPERSEDED` qui sotto, che lo scrive per esteso ed è pinnato da
//     un test. La riparazione è un'altra PR.
//
// IL TETTO DEL TAVOLO È GIÀ RISPETTATO, E NON SI AGGIUNGE NIENTE PER
// RISPETTARLO. Il record impone che il valore relativo non possa superare la
// capacità di spesa del tavolo. Quel vincolo è soddisfatto per costruzione, non
// per una clausola scritta qui: `fairToMeMaxEffective ≤ maxSafe(io, ruolo)`
// (invariante `chainOk` del motore), e `maxSafe(io, ruolo)` è uno degli addendi
// del massimo su tutte le squadre — un giocatore lo compra UNA squadra, quindi
// «quanto il tavolo può pagarlo adesso» è il massimo dei max bid veri, non la
// loro somma. Aggiungere qui un secondo clamp significherebbe scegliere una
// formula che Pico non ha deciso; l'invariante è invece verificata in
// src/valueBox.test.ts su stati d'asta costruiti col motore vero.
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
import { DECLARED_VALUE_PROVENANCE } from "../packages/engine/src/declaredValues.js";
import type { Role } from "../packages/engine/src/types.js";
import type { ListoneAppealIndex } from "./ui/listone.js";

/**
 * IL DIFETTO DELLO SLOT 4, MISURATO OGGI E DICHIARATO QUI INVECE CHE TACIUTO.
 *
 * Lo slot 4 è agganciato a `DecisionNumbers.fairToMeMaxEffective`, cioè alla
 * catena §4.2 della schermata CHIAMATA. Una decisione di Pico del **2026-08-24**
 * — la stessa giornata che ha smontato il modello dello slot 3 — dice che il
 * PREZZO RELATIVO si assesta su **quanto mette il secondo offerente, +1**.
 * Sono due formule diverse per lo stesso slot, e la seconda ha sostituito la
 * prima nello stesso giorno in cui la prima era ancora l'unica scritta nel
 * codice.
 *
 * QUI NON SI RIPARA NIENTE, e la ragione è di metodo: un cambio di FORMULA
 * (slot 3, questa PR) e un cambio di CONTRATTO (slot 4) nella stessa corsia
 * sono due errori che si coprono a vicenda — se il riquadro sbaglia un numero
 * non si sa più quale dei due cambi l'ha rotto. Questa costante è la
 * dichiarazione del debito in un posto solo, pinnata da un test come le scelte
 * non ratificate del motore (`UNRATIFIED_CHOICES`, declaredValues.ts): il test
 * la DOCUMENTA senza approvarla, e diventa rosso se qualcuno la cancella
 * lasciando lo slot 4 dov'è.
 */
export const SLOT_4_SUPERSEDED =
  "slot 4 (valore relativo): agganciato a fairToMeMaxEffective (catena §4.2), " +
  "mentre la decisione di Pico del 2026-08-24 assesta il prezzo relativo su " +
  "quanto mette il secondo offerente, +1. Formula sostituita, aggancio non " +
  "ancora spostato: riparazione in una PR dedicata, non in quella che cambia " +
  "la formula dello slot 3 (stesso giorno).";

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
  | "gamba-pagella-assente";

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
   * solo SLOT 4 — lo slot 3 non la attraversa più.
   */
  readonly call: CallScreen | null;
  /** Gli ingredienti dichiarati che mancano, quando `call` è `null`. */
  readonly missingDeclaredInputs: readonly DeclaredInputId[];
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
   * costruito sui valori dichiarati. `null` quando nessuno dei due numeri in
   * crediti è a schermo: una provenienza senza numero non qualifica niente.
   */
  readonly creditsProvenance: string | null;
  /** Il motivo del motore, quando è lui a non emettere numeri. */
  readonly engineReason: NoTargetReason | null;
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
    creditsProvenance: null,
    engineReason: null,
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
 * IL VALORE RELATIVO — lo SLOT 4, e da questa corsia in poi l'unico dei quattro
 * che passa dalla schermata CHIAMATA del motore.
 *
 * Non è stato toccato: stessa catena, stessi motivi, stesso `n/d` quando le due
 * dichiarazioni di Pico non hanno una sorgente nell'app. Il debito che porta
 * con sé è dichiarato in `SLOT_4_SUPERSEDED`, non nascosto.
 */
function relativeSlot(
  call: CallScreen | null,
  missing: readonly DeclaredInputId[],
): {
  readonly relative: ValueSlot;
  readonly engineReason: NoTargetReason | null;
} {
  if (call === null) {
    const reason: ValueMissingReason =
      missing.length > 0 ? "ingredienti-dichiarati-assenti" : "motore-senza-numeri";
    return { relative: ABSENT(reason), engineReason: null };
  }
  const relative: ValueSlot =
    call.numbers === null
      ? ABSENT("motore-senza-numeri")
      : { kind: "numero", value: call.numbers.fairToMeMaxEffective, unit: "crediti" };
  return { relative, engineReason: call.noTargetReason };
}

/**
 * Il riquadro del valore per il giocatore chiamato adesso.
 *
 * Deterministica e totale: ogni slot esce o come numero o come assenza col
 * proprio motivo, e non esiste un terzo esito.
 */
export function valueBoxReading(input: ValueBoxInput): ValueBoxReading {
  if (input.called === null) return noCalledPlayer();

  const { relative, engineReason } = relativeSlot(input.call, input.missingDeclaredInputs);

  // IL VALORE ASSOLUTO, derivato. `called` viene riscritto dal riquadro: il
  // giocatore di cui si dice il valore è, per costruzione, quello di cui si sta
  // mostrando la scheda.
  const derived = absoluteValueReading({ ...input.absolute, called: input.called });
  const absolute: ValueSlot =
    derived.kind === "assente"
      ? ABSENT(ABSOLUTE_VALUE_REASON[derived.reason])
      : { kind: "numero", value: derived.credits, unit: "crediti" };

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
    // L'etichetta di provenienza qualifica i numeri costruiti sui VALORI
    // DICHIARATI di Pico: da questa corsia in poi è il solo slot 4. Il valore
    // assoluto non li attraversa più e porta la propria catena
    // (`absoluteChain`), non questa etichetta.
    creditsProvenance: relative.kind === "numero" ? DECLARED_VALUE_PROVENANCE : null,
    engineReason,
    absoluteChain: derived.kind === "valore" ? derived.chain : null,
    absoluteBelowCostFloor: derived.kind === "valore" && derived.belowCostFloor,
    missingDeclaredInputs: input.call === null ? input.missingDeclaredInputs : [],
  };
}

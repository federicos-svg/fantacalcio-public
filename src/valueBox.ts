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
//  4. VALORE RELATIVO IN CREDITI — `DecisionNumbers.fairToMeMaxEffective`
//     (packages/engine/src/callScreen.ts): il tetto derivato dai valori
//     dichiarati di Pico, che si muove durante la serata perché si muovono i
//     suoi ingredienti misurati (il costo opportunità della migliore
//     alternativa ancora sul mercato e il max bid vero). È §D9 perimetro 1 —
//     «derivato dai valori dichiarati di Owner → visibile, nessun receipt» —
//     e NON il campo FTM model-derived, che resta gated e che questo file non
//     tocca in nessun ramo.
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

import type { CallScreen, NoTargetReason } from "../packages/engine/src/callScreen.js";
import { DECLARED_VALUE_PROVENANCE } from "../packages/engine/src/declaredValues.js";
import type { Role } from "../packages/engine/src/types.js";
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
  | "motore-senza-numeri";

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
   * costruirla; `null` quando non ha gli ingressi per chiederla.
   */
  readonly call: CallScreen | null;
  /** Gli ingredienti dichiarati che mancano, quando `call` è `null`. */
  readonly missingDeclaredInputs: readonly DeclaredInputId[];
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
 * I due numeri in crediti, insieme perché escono dalla stessa catena e falliscono
 * per lo stesso motivo: senza il valore dichiarato non esiste né la fotografia
 * né il tetto che se ne deriva.
 */
function creditSlots(
  call: CallScreen | null,
  missing: readonly DeclaredInputId[],
): {
  readonly absolute: ValueSlot;
  readonly relative: ValueSlot;
  readonly engineReason: NoTargetReason | null;
} {
  if (call === null) {
    const reason: ValueMissingReason =
      missing.length > 0 ? "ingredienti-dichiarati-assenti" : "motore-senza-numeri";
    return { absolute: ABSENT(reason), relative: ABSENT(reason), engineReason: null };
  }
  const absolute: ValueSlot =
    call.declaredValue === null
      ? ABSENT("motore-senza-numeri")
      : { kind: "numero", value: call.declaredValue, unit: "crediti" };
  const relative: ValueSlot =
    call.numbers === null
      ? ABSENT("motore-senza-numeri")
      : { kind: "numero", value: call.numbers.fairToMeMaxEffective, unit: "crediti" };
  return { absolute, relative, engineReason: call.noTargetReason };
}

/**
 * Il riquadro del valore per il giocatore chiamato adesso.
 *
 * Deterministica e totale: ogni slot esce o come numero o come assenza col
 * proprio motivo, e non esiste un terzo esito.
 */
export function valueBoxReading(input: ValueBoxInput): ValueBoxReading {
  if (input.called === null) return noCalledPlayer();

  const { absolute, relative, engineReason } = creditSlots(input.call, input.missingDeclaredInputs);
  const showsCredits = absolute.kind === "numero" || relative.kind === "numero";

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
    creditsProvenance: showsCredits ? DECLARED_VALUE_PROVENANCE : null,
    engineReason,
    missingDeclaredInputs: input.call === null ? input.missingDeclaredInputs : [],
  };
}

// RIQUADRO DEL VALORE — costruttori puri della resa dei quattro numeri.
// Il calcolo sta in src/valueBox.ts; qui ci sono soltanto etichette, testo e
// HTML, senza DOM e senza stato, come per src/ui/tierBand.ts.
//
// LE QUATTRO CELLE HANNO LA STESSA FORMA, sempre: nome dello slot, poi il
// numero oppure `n/d`, poi UNA riga che dice da dove viene il numero oppure
// perché non c'è. Una cella `n/d` non è mai muta e non è mai più corta delle
// altre: «non lo so» è un'informazione, e a schermo deve costare quanto un
// numero, altrimenti chi guarda legge una griglia rotta invece di una risposta.
//
// PERCHÉ IL PERCHÉ STA NELLA CELLA E NON IN UNA NOTA IN FONDO. Il riquadro sta
// SOPRA il gesto principale della schermata d'asta, e
// e2e/asta-gesto-principale.spec.ts asserisce che «ASSEGNA A» resti entro
// 560px dal bordo del documento: una nota metodologica per esteso qui sotto
// costava 52px misurati e da sola spingeva il gesto fuori dal budget. La
// scelta è la stessa già presa per INSIGHT GIOCATORE (src/ui/views.ts,
// renderPlayerInsightsBlock): le garanzie non spariscono, si spostano dove
// costano meno — una riga per cella, che dice della SUA cella, più una riga
// sola in testata. Tre motivi diversi in un paragrafo unico si leggono peggio
// e costano di più.
//
// NESSUNA PAROLA DIRETTIVA. Non compaiono «prendilo fino a», «mollalo a»,
// `target_band`, `stretch_cap`, `fair-to-me`, «conviene», né un ranking:
// `docs/NO_GO.md` §Prodotto e `docs/DECISIONS.md` §D9. Il riquadro dice quanto
// vale, non che cosa fare, e la testata lo dichiara a schermo.
//
// L'ETICHETTA DI QUALITÀ E LA RICETTA DELL'INDICE NON SONO SCRITTE QUI: sono
// le stringhe che il deposito ha servito accanto al punteggio, e la deroga
// display-only del 2026-08-12 impone che vengano dal dato. Se il dato non le
// porta, il riquadro non le inventa.

import type { NoTargetReason } from "../../packages/engine/src/callScreen.js";
import type {
  DeclaredInputId,
  ValueBoxReading,
  ValueMissingReason,
  ValueSlot,
  ValueSlotId,
} from "../valueBox.js";
import { VALUE_SLOT_ORDER } from "../valueBox.js";
import { escHtml } from "./theme.js";

export const VALUE_BOX_TITLE = "VALORE";

/** Il token di assenza del progetto. Mai un default, mai una cella vuota. */
export const VALUE_UNKNOWN = "n/d";

/** I nomi dei quattro slot, con le parole del record che li ha decisi. */
export const VALUE_SLOT_LABELS: Readonly<Record<ValueSlotId, string>> = {
  "indice-assoluto": "Indice assoluto",
  "indice-relativo": "Indice relativo",
  "valore-assoluto": "Valore assoluto",
  "valore-relativo": "Valore relativo",
};

/** Da dove viene lo slot quando porta un numero. Una riga, mai una promessa. */
const VALUE_SLOT_SOURCE: Readonly<Record<ValueSlotId, string>> = {
  "indice-assoluto": "dal listone, prima dell'asta",
  "indice-relativo": "si muove durante la serata",
  "valore-assoluto": "il valore che hai dichiarato",
  // Sovrascritta a runtime con l'etichetta che il motore impone
  // (`DECLARED_VALUE_PROVENANCE`), così la parola non può divergere dalla
  // costante: vedi `valueSlotWhyText`.
  "valore-relativo": "derivato dai tuoi valori, adesso",
};

/**
 * Perché una cella dice `n/d`. Ogni frase nomina la cosa che manca, così chi
 * legge sa se aspettare un dato, dichiarare un valore o attendere una
 * decisione — tre attese diverse che un «non disponibile» generico confonde.
 */
export const VALUE_MISSING_TEXT: Readonly<Record<ValueMissingReason, string>> = {
  "nessun-chiamato": "nessun giocatore chiamato",
  "indice-assente": "il listone non porta l'indice",
  "indice-senza-verdetto": "l'indice non ha verdetto su di lui",
  "indice-relativo-non-calcolato": "formula non decisa: non si calcola",
  "ingredienti-dichiarati-assenti": "manca una tua dichiarazione",
  "motore-senza-numeri": "il motore non emette numeri qui",
};

/** Il motivo del motore, quando è lui a non emettere numeri. */
export const ENGINE_REASON_TEXT: Readonly<Record<NoTargetReason, string>> = {
  "anchor-missing": "nessuna quotazione per lui nel listone",
  "already-assigned": "è già assegnato: nessuna asta in corso",
  "declared-value-missing": "non hai dichiarato un valore per lui",
  "role-full": "il ruolo è pieno: non puoi comprarlo",
  "not-biddable": "budget bloccato dalla riserva dura",
  "below-cost-floor": "la catena finisce sotto il credito minimo",
  "band-too-wide": "il margine è troppo largo per essere operativo",
};

/** Come si chiama, a schermo, un ingrediente dichiarato che manca. */
export const DECLARED_INPUT_TEXT: Readonly<Record<DeclaredInputId, string>> = {
  "valori-dichiarati": "i tuoi valori per giocatore",
  "profilo-di-rischio": "il tuo profilo di rischio",
};

/**
 * La garanzia che vale per tutto il riquadro, in una riga: la forma dei numeri
 * e il fatto che nessuno di essi è un consiglio. Le altre due garanzie — da
 * dove viene ciascun numero e perché uno manca — stanno nelle celle, che è
 * dove servono.
 */
export const VALUE_BOX_CAVEAT =
  "Valori precisi, mai intervalli, nessun prezzo di mercato previsto. Nessun consiglio: il giudizio è tuo.";

/**
 * La riga che dice quali dichiarazioni mancano, o stringa vuota quando non ne
 * manca nessuna. Nomina gli ingredienti uno per uno: «manca un dato» senza dire
 * quale è la stessa cella vuota travestita da frase.
 */
export function missingDeclaredInputsText(reading: ValueBoxReading): string {
  if (reading.missingDeclaredInputs.length === 0) return "";
  const names = reading.missingDeclaredInputs.map((id) => DECLARED_INPUT_TEXT[id]);
  const list =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]!}`;
  return `I due valori in crediti restano n/d finché ${list} non entrano nell'app.`;
}

/**
 * La riga che qualifica l'indice, costruita SOLO con le stringhe portate dal
 * dato. Vuota quando la riga di listone non porta nessun indice: senza indice
 * non c'è niente da qualificare, e una qualificazione senza numero sarebbe una
 * frase su un dato che non c'è.
 */
export function indexQualificationText(reading: ValueBoxReading): string {
  if (reading.indexQuality === null || reading.indexRecipe === null) return "";
  return `Indice: ${reading.indexQuality} · ricetta ${reading.indexRecipe}.`;
}

/**
 * La riga di testata, per intero: qualificazione dell'indice (dal dato), che
 * cosa manca (quando manca), e la garanzia che vale per tutto il riquadro.
 */
export function valueBoxNoteText(reading: ValueBoxReading): string {
  return [indexQualificationText(reading), missingDeclaredInputsText(reading), VALUE_BOX_CAVEAT]
    .filter((part) => part !== "")
    .join(" ");
}

/** Il testo della cella: il numero con la sua unità, oppure `n/d`. */
export function valueSlotText(slot: ValueSlot): string {
  if (slot.kind === "assente") return VALUE_UNKNOWN;
  return slot.unit === "crediti" ? `${slot.value} cr` : String(slot.value);
}

/** La riga sotto il numero: la provenienza se c'è un numero, il motivo se no. */
export function valueSlotWhyText(
  id: ValueSlotId,
  slot: ValueSlot,
  reading: ValueBoxReading,
): string {
  if (slot.kind === "numero") {
    // Il tetto derivato porta l'etichetta di provenienza che il motore impone,
    // presa dalla lettura e non riscritta qui: `DECLARED_VALUE_PROVENANCE`.
    if (id === "valore-relativo" && reading.creditsProvenance !== null) {
      return `${reading.creditsProvenance}, adesso`;
    }
    return VALUE_SLOT_SOURCE[id];
  }
  if (slot.reason === "motore-senza-numeri" && reading.engineReason !== null) {
    return ENGINE_REASON_TEXT[reading.engineReason];
  }
  return VALUE_MISSING_TEXT[slot.reason];
}

/** Le quattro celle, nell'ordine del record. */
export function valueBoxCellsHtml(reading: ValueBoxReading): string {
  return VALUE_SLOT_ORDER.map((id) => {
    const slot = reading.slots[id];
    const absent = slot.kind === "assente";
    return (
      `<div class="value-box__cell${absent ? " value-box__cell--absent" : ""}" id="value-box-cell-${id}">` +
      `<em>${escHtml(VALUE_SLOT_LABELS[id])}</em>` +
      `<strong id="value-box-number-${id}">${escHtml(valueSlotText(slot))}</strong>` +
      `<span id="value-box-why-${id}">${escHtml(valueSlotWhyText(id, slot, reading))}</span>` +
      `</div>`
    );
  }).join("");
}

/** Il corpo del riquadro: la sola griglia delle quattro celle. */
export function valueBoxHtml(reading: ValueBoxReading): string {
  return `<div class="value-box__grid" id="value-box-grid">${valueBoxCellsHtml(reading)}</div>`;
}

/** Forma parlata per l'aria-label: i quattro numeri letti in fila. */
export function valueBoxSpoken(reading: ValueBoxReading): string {
  const parts = VALUE_SLOT_ORDER.map(
    (id) => `${VALUE_SLOT_LABELS[id]}: ${valueSlotText(reading.slots[id])}`,
  );
  return `Valore del giocatore chiamato. ${parts.join("; ")}.`;
}

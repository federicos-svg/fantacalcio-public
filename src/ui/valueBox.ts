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
import type { RelativePriceBound } from "../../packages/engine/src/relativeValue.js";
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
  // Sovrascritta a runtime con la catena vera (budget → target → slot →
  // fascia), così la riga dice DA DOVE viene il numero e non una promessa
  // generica: vedi `valueSlotWhyText`.
  "valore-assoluto": "dal regolamento e dai tuoi target di ruolo",
  // Sovrascritta a runtime con la frase del VINCOLO che ha fissato il numero
  // (`RELATIVE_PRICE_BOUND_TEXT` qui sotto). Questa resta come fallback ed è la
  // sola descrizione onesta che si possa dare senza sapere quale dei tre ha
  // morso: non è un consiglio e non è un permesso.
  "valore-relativo": "quanto costa vincere adesso",
};

/**
 * LA RIGA DELLO SLOT 4, UNA PER VINCOLO. Tre frasi, non una, perché il numero
 * da solo confonde due cose che il motore tiene già separate
 * (`RelativePriceChain.boundBy`):
 *
 *  - `scala-dei-rivali` è un PREZZO CHE IL MERCATO STA FORMANDO: il secondo
 *    offerente è arrivato fin lì, e superarlo di un credito vince;
 *  - `tetto-del-piu-ricco` è un TETTO STRUTTURALE del tavolo, e non dice niente
 *    su quel giocatore: nessuno può arrivare più in alto, chiunque sia in asta.
 *    È il ramo che si vede nei primi minuti — a tavolo fresco le otto squadre
 *    sono identiche, quindi il numero è lo stesso per OGNI giocatore di OGNI
 *    ruolo. Senza questa riga la cella ripeterebbe la stessa cifra su ogni
 *    scheda senza dire perché, e chi guarda la leggerebbe come una misura del
 *    giocatore invece che del tavolo;
 *  - `tetto-max-safe` è il MIO tetto hard-safe: il tavolo chiede più di quanto
 *    io possa mettere. È un terzo fatto e non un doppione del secondo — quel
 *    tetto è del tavolo, questo è mio — e accorparli direbbe a chi legge che
 *    non può vincere quando invece è il tavolo a non poter salire.
 *
 * TRE E NON DUE, quindi, per la stessa ragione per cui i motivi di `n/d` sono
 * cinque e non uno: ognuno nomina un fatto diverso, e chi legge deve poter
 * sapere QUALE. Nessuna formula nuova, nessun peso, nessun coefficiente: è una
 * distinzione che `relativeValue.ts` calcola già e che finora restava nel
 * motore.
 */
export const RELATIVE_PRICE_BOUND_TEXT: Readonly<Record<RelativePriceBound, string>> = {
  "scala-dei-rivali": "il secondo max bid al tavolo, +1",
  "tetto-del-piu-ricco": "il tetto del tavolo: nessuno arriva più in alto",
  "tetto-max-safe": "il tuo max bid: il tavolo chiede di più",
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
  // I motivi del valore assoluto derivato. Ognuno NOMINA LA COSA CHE MANCA:
  // un «non disponibile» generico costringerebbe chi legge a indovinare se
  // aspettare un dato, dichiarare un target o non aspettare niente.
  // `ruolo-senza-target` È IL RAMO CHE SI VEDE OGGI SEMPRE — finché Pico non
  // compila il piano rosa — quindi è anche il solo che paga il vincolo di
  // altezza del riquadro: sta SOPRA il gesto principale, e
  // e2e/asta-gesto-principale.spec.ts tiene «ASSEGNA A» entro 560px dal bordo.
  // Una frase più lunga della più lunga già presente manderebbe la cella a due
  // righe e il gesto sotto la piega. Corta e precisa, quindi: nomina comunque
  // LA COSA CHE MANCA (il target, non «un dato»).
  "ruolo-senza-target": "manca il tuo target di ruolo",
  "target-non-valido": "il tuo target di ruolo non è un numero usabile",
  "target-oltre-il-budget": "i tuoi target superano i 500 crediti",
  "fascia-assente": "non ha una fascia: l'indice non lo ordina",
  "oltre-gli-slot-del-ruolo": "oltre l'ultima fascia: nessuno slot è suo",
  "gamba-concorrenza-assente": "manca la concorrenza, a cui hai dato peso",
  "gamba-coppe-assente": "manca il dato coppe, a cui hai dato peso",
  "gamba-pagella-assente": "manca la pagella completa, a cui hai dato peso",
  // I motivi del prezzo relativo. Stessa regola: ognuno nomina il fatto del
  // tavolo che manca, mai un «non disponibile» che costringa a indovinare.
  "tavolo-senza-la-mia-squadra": "la tua squadra non è a questo tavolo",
  "ruolo-pieno-per-me": "il tuo ruolo è pieno: non puoi comprarlo",
  "non-posso-offrire": "il tuo budget è bloccato dalla riserva",
  "nessun-rivale-eleggibile": "nessun rivale può ancora comprarlo",
  "un-solo-rivale-eleggibile": "un solo rivale capiente: non c'è un secondo",
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
 *
 * «IL VALORE RELATIVO» E NON PIÙ «I DUE VALORI IN CREDITI»: dalla decisione di
 * Pico del 2026-08-24 il valore ASSOLUTO non passa più dal listino per
 * giocatore né dal profilo di rischio — è derivato dal regolamento e dai target
 * di ruolo, e tace per un motivo suo, scritto nella sua cella. Lasciare qui la
 * vecchia frase significherebbe attribuire a queste due dichiarazioni un `n/d`
 * che non è più il loro.
 */
export function missingDeclaredInputsText(reading: ValueBoxReading): string {
  if (reading.missingDeclaredInputs.length === 0) return "";
  const names = reading.missingDeclaredInputs.map((id) => DECLARED_INPUT_TEXT[id]);
  const list =
    names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]!}`;
  // NESSUNA DELLE DUE VERSIONI IN CONFLITTO È RIMASTA, e non è un compromesso:
  // dopo le due corsie del 2026-08-24 nessuno dei due numeri in crediti aspetta
  // più quelle dichiarazioni, quindi la frase non ha più un soggetto —
  // «il valore assoluto» e «il valore relativo» sarebbero falsi tutti e due.
  // La funzione resta, e resta provata, perché il giorno in cui una cella
  // tornerà a dipendere da una dichiarazione di Pico questa è la riga che lo
  // dirà; oggi `src/main.ts` non le passa niente e la nota non compare. Il
  // soggetto viaggia adesso NELLA CELLA — «manca il tuo target di ruolo» —, che
  // è più preciso di una riga in testata e non costa altezza sopra il gesto.
  return `${list}: ancora fuori dall'app.`;
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

/**
 * IL NUMERO, RESO. Interi come interi, non interi con UN decimale.
 *
 * È una regola di RESA e non un arrotondamento del numero: il valore esatto
 * resta quello che il motore ha prodotto (`AbsoluteValueChain.total`), che non
 * viene toccato, clampato né arrotondato in nessun ramo. La quota di uno slot è
 * una divisione — 200 crediti su 9 difensori fanno 22,2222… — e stampare
 * diciassette cifre in un riquadro che si legge in due secondi durante un'asta
 * non è più onesto: è solo illeggibile. Un decimale è un decimo di credito,
 * cioè sotto la granularità di qualunque offerta al tavolo.
 *
 * La virgola e non il punto: è la scrittura italiana dei decimali, e il
 * riquadro parla italiano. Nessun `Intl`, nessuna locale del runtime — il
 * determinismo del progetto vale anche qui.
 */
export function valueNumberText(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(".", ",");
}

/** Il testo della cella: il numero con la sua unità, oppure `n/d`. */
export function valueSlotText(slot: ValueSlot): string {
  if (slot.kind === "assente") return VALUE_UNKNOWN;
  const text = valueNumberText(slot.value);
  return slot.unit === "crediti" ? `${text} cr` : text;
}

/**
 * LA CATENA DEL VALORE ASSOLUTO IN UNA RIGA, coi numeri veri e non con la
 * formula in astratto: «250 cr sul ruolo / 9 slot · fascia 3».
 *
 * Il budget del regolamento non compare in questa riga e non è una
 * dimenticanza: il target di ruolo È già la sua ripartizione, e ripetere «su
 * 500» accanto a un numero che quei 500 li ha già consumati aggiungerebbe una
 * cifra senza aggiungere un fatto. Il tetto resta nella catena esposta
 * (`AbsoluteValueChain.budget`), dove un revisore lo trova.
 *
 * QUANDO IL NUMERO STA SOTTO IL CREDITO MINIMO LO DICE, e non lo corregge: il
 * motore non clampa (sarebbe una scelta), quindi la sola cosa onesta che resta
 * a chi mostra è nominarlo.
 */
export function absoluteChainText(reading: ValueBoxReading): string {
  const chain = reading.absoluteChain;
  if (chain === null) return "";
  const head =
    `${valueNumberText(chain.roleTarget)} cr sul ruolo / ${chain.roleSlots} slot` +
    ` · fascia ${chain.tier}`;
  return reading.absoluteBelowCostFloor ? `${head} — sotto il credito minimo` : head;
}

/** La riga sotto il numero: la provenienza se c'è un numero, il motivo se no. */
export function valueSlotWhyText(
  id: ValueSlotId,
  slot: ValueSlot,
  reading: ValueBoxReading,
): string {
  if (slot.kind === "numero") {
    // IL VINCOLO CHE HA FISSATO IL PREZZO, in una riga. Qui c'era l'etichetta
    // di provenienza dei valori dichiarati: è uscita insieme all'ultimo numero
    // che poteva qualificare, perché dopo le due corsie del 2026-08-24 nessuno
    // dei quattro passa da quei valori (src/valueBox.ts, `SLOT_4_SOURCE_MOVED`).
    // Al suo posto una distinzione che si vede a schermo — prezzo formato dal
    // mercato contro tetto strutturale — e che il motore calcolava già.
    if (id === "valore-relativo" && reading.relativePriceBound !== null) {
      return RELATIVE_PRICE_BOUND_TEXT[reading.relativePriceBound];
    }
    // LA CATENA, IN UNA RIGA. Non è decorazione: un numero derivato che non sa
    // dire da dove viene si legge come un numero inventato, e questa cella è la
    // sola superficie su cui la derivazione arriva sotto gli occhi di Pico.
    if (id === "valore-assoluto" && reading.absoluteChain !== null) {
      return absoluteChainText(reading);
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

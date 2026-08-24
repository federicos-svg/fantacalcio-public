// RIQUADRO DEL VALORE — costruttori puri della resa dei DUE INDICI.
// Il calcolo sta in src/valueBox.ts; qui ci sono soltanto etichette, testo e
// HTML, senza DOM e senza stato, come per src/ui/tierBand.ts.
//
// I DUE NUMERI IN CREDITI NON SI RENDONO PIÙ. Decisione di Pico del 2026-08-24,
// in modale, alla lettera: «Leva il valore assoluto e il valore relativo». Sono
// uscite con loro tutte le stringhe che esistevano per accompagnarli — la riga
// della catena del valore assoluto, le tre frasi del vincolo che fissava il
// prezzo relativo, i quattordici motivi di `n/d` dei due motori, l'unità
// «cr» e la riga di testata sulle dichiarazioni mancanti. La motivazione per
// esteso, e la conseguenza sui due moduli del motore rimasti senza
// consumatori, stanno nell'intestazione di src/valueBox.ts e in
// `CREDITI_FUORI_DAL_RIQUADRO`.
//
// LE CELLE HANNO LA STESSA FORMA, sempre: nome dello slot, poi il numero
// oppure `n/d`, poi UNA riga che dice da dove viene il numero oppure perché non
// c'è. Una cella `n/d` non è mai muta e non è mai più corta delle altre: «non
// lo so» è un'informazione, e a schermo deve costare quanto un numero,
// altrimenti chi guarda legge una griglia rotta invece di una risposta.
//
// PERCHÉ IL PERCHÉ STA NELLA CELLA E NON IN UNA NOTA IN FONDO. Il riquadro sta
// SOPRA il gesto principale della schermata d'asta, e
// e2e/asta-gesto-principale.spec.ts asserisce che «ASSEGNA A» resti entro
// 560px dal bordo del documento: una nota metodologica per esteso qui sotto
// costava 52px misurati e da sola spingeva il gesto fuori dal budget. La
// scelta è la stessa già presa per INSIGHT GIOCATORE (src/ui/views.ts,
// renderPlayerInsightsBlock): le garanzie non spariscono, si spostano dove
// costano meno — una riga per cella, che dice della SUA cella, più una riga
// sola in testata.
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

import type { ValueBoxReading, ValueMissingReason, ValueSlot, ValueSlotId } from "../valueBox.js";
import { VALUE_SLOT_ORDER } from "../valueBox.js";
import { escHtml } from "./theme.js";

export const VALUE_BOX_TITLE = "VALORE";

/** Il token di assenza del progetto. Mai un default, mai una cella vuota. */
export const VALUE_UNKNOWN = "n/d";

/** I nomi dei due slot, con le parole del record che li ha decisi. */
export const VALUE_SLOT_LABELS: Readonly<Record<ValueSlotId, string>> = {
  "indice-assoluto": "Indice assoluto",
  "indice-relativo": "Indice relativo",
};

/**
 * Da dove viene lo slot quando porta un numero. Una riga, mai una promessa.
 *
 * UNA VOCE SOLA, E IL TIPO LO DICE. L'indice relativo non ha una riga di
 * provenienza perché non ha un numero: la formula non è decisa e nessun modulo
 * del repository la calcola, quindi quello slot esce SEMPRE come assenza e la
 * sua riga è il motivo, non la provenienza. Una seconda voce qui sarebbe una
 * frase che nessuna esecuzione può raggiungere e che nessun test può rompere —
 * la stessa forma di testo morto che una review avversariale ha trovato nello
 * slot 4 (vi aveva scritto «prendilo fino a qui» e la suite era rimasta verde).
 * In un file in cui il testo È il prodotto, una stringa senza guardia è un
 * pezzo di prodotto senza guardia: tolta, non riscritta. Il giorno in cui
 * l'indice relativo avrà una formula, il compilatore chiederà la riga.
 */
const VALUE_SLOT_SOURCE: Readonly<
  Record<Exclude<ValueSlotId, "indice-relativo">, string>
> = {
  "indice-assoluto": "dal listone, prima dell'asta",
};

/**
 * Perché una cella dice `n/d`. Ogni frase nomina la cosa che manca, così chi
 * legge sa se aspettare un dato o attendere una decisione — due attese diverse
 * che un «non disponibile» generico confonde.
 *
 * QUATTRO FRASI, ED È IL VOCABOLARIO INTERO: le quattordici uscite spiegavano i
 * due numeri in crediti e sono uscite con loro il 2026-08-24. Non sono state
 * accorpate in un `n/d` muto — sarebbe stata la perdita che questo file esiste
 * per impedire —: sono state tolte insieme alle celle che spiegavano, e i
 * vocabolari dei due motori restano interi e provati a casa loro.
 */
export const VALUE_MISSING_TEXT: Readonly<Record<ValueMissingReason, string>> = {
  "nessun-chiamato": "nessun giocatore chiamato",
  "indice-assente": "il listone non porta l'indice",
  "indice-senza-verdetto": "l'indice non ha verdetto su di lui",
  "indice-relativo-non-calcolato": "formula non decisa: non si calcola",
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
 * La riga di testata, per intero: qualificazione dell'indice (dal dato) e la
 * garanzia che vale per tutto il riquadro.
 *
 * LA TERZA PARTE È USCITA, E VA DETTO. Qui in mezzo passava
 * `missingDeclaredInputsText()`, la riga che nominava le dichiarazioni di Pico
 * ancora fuori dall'app. Non è stata ammorbidita: è stata tolta insieme alle
 * uniche due celle che potevano aspettare una dichiarazione — i due numeri in
 * crediti, usciti il 2026-08-24 —, perché una frase che promette una cella
 * spenta quando nessuna cella è spenta da quella causa è una frase senza
 * soggetto. Il fatto che quelle dichiarazioni una sorgente in `src/` non ce
 * l'abbiano resta vero e resta scritto nel motore, dove nasce.
 */
export function valueBoxNoteText(reading: ValueBoxReading): string {
  return [indexQualificationText(reading), VALUE_BOX_CAVEAT].filter((part) => part !== "").join(" ");
}

/**
 * IL NUMERO, RESO. Interi come interi, non interi con UN decimale.
 *
 * È una regola di RESA e non un arrotondamento del numero: il valore esatto
 * resta quello che il dato ha portato, che non viene toccato, clampato né
 * arrotondato in nessun ramo. Stampare diciassette cifre in un riquadro che si
 * legge in due secondi durante un'asta non è più onesto: è solo illeggibile.
 *
 * La virgola e non il punto: è la scrittura italiana dei decimali, e il
 * riquadro parla italiano. Nessun `Intl`, nessuna locale del runtime — il
 * determinismo del progetto vale anche qui.
 */
export function valueNumberText(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(".", ",");
}

/**
 * Il testo della cella: il numero, oppure `n/d`.
 *
 * NESSUNA UNITÀ ACCANTO AL NUMERO, e non è una dimenticanza: l'unico suffisso
 * che questo riquadro abbia mai scritto era «cr», ed è uscito con i due numeri
 * in crediti il 2026-08-24. Un indice non ha unità, e inventargliene una
 * sarebbe una qualificazione che il dato non porta.
 */
export function valueSlotText(slot: ValueSlot): string {
  if (slot.kind === "assente") return VALUE_UNKNOWN;
  return valueNumberText(slot.value);
}

/**
 * La riga sotto il numero: la provenienza se c'è un numero, il motivo se no.
 *
 * IL RAMO DELL'INDICE RELATIVO CON UN NUMERO È TOTALE E NON INVENTA NIENTE:
 * `valueBoxReading()` non produce mai quello slot come numero, e una coppia
 * incoerente costruita a mano riceve il token di assenza — «non lo so» — invece
 * di una descrizione a parole della provenienza di un numero di cui non si
 * conosce nessuna provenienza.
 */
export function valueSlotWhyText(id: ValueSlotId, slot: ValueSlot): string {
  if (slot.kind === "assente") return VALUE_MISSING_TEXT[slot.reason];
  if (id === "indice-relativo") return VALUE_UNKNOWN;
  return VALUE_SLOT_SOURCE[id];
}

/** Le celle, nell'ordine del record. */
export function valueBoxCellsHtml(reading: ValueBoxReading): string {
  return VALUE_SLOT_ORDER.map((id) => {
    const slot = reading.slots[id];
    const absent = slot.kind === "assente";
    return (
      `<div class="value-box__cell${absent ? " value-box__cell--absent" : ""}" id="value-box-cell-${id}">` +
      `<em>${escHtml(VALUE_SLOT_LABELS[id])}</em>` +
      `<strong id="value-box-number-${id}">${escHtml(valueSlotText(slot))}</strong>` +
      `<span id="value-box-why-${id}">${escHtml(valueSlotWhyText(id, slot))}</span>` +
      `</div>`
    );
  }).join("");
}

/** Il corpo del riquadro: la sola griglia delle celle. */
export function valueBoxHtml(reading: ValueBoxReading): string {
  return `<div class="value-box__grid" id="value-box-grid">${valueBoxCellsHtml(reading)}</div>`;
}

/**
 * Forma parlata per l'aria-label: le celle lette in fila, CON LA LORO RIGA —
 * nome, numero (o `n/d`), e da dove viene (o perché non c'è).
 *
 * LA RIGA NON È UN ORNAMENTO VISIVO, quindi non può fermarsi allo schermo. È la
 * stessa regola che governa le celle — «una cella `n/d` non è mai muta» — e
 * vale identica per chi la cella non la vede: senza la riga, chi ascolta
 * sentirebbe «Indice relativo: n/d» senza mai sapere che la formula non è
 * decisa, cioè un silenzio al posto di un'informazione.
 *
 * NESSUNA FRASE NUOVA: ogni pezzo è la stessa stringa che la cella mostra, e
 * ogni voce parla della PROPRIA cella. Nessuna riga mette in relazione due
 * numeri fra loro, qui come a schermo.
 */
export function valueBoxSpoken(reading: ValueBoxReading): string {
  const parts = VALUE_SLOT_ORDER.map((id) => {
    const slot = reading.slots[id];
    return `${VALUE_SLOT_LABELS[id]}: ${valueSlotText(slot)}, ${valueSlotWhyText(id, slot)}`;
  });
  return `Valore del giocatore chiamato. ${parts.join("; ")}.`;
}

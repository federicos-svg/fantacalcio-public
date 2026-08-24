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
  // Sovrascritta a runtime con la popolazione vera del ruolo, così la riga dice
  // FRA QUANTI la posizione è misurata e non una promessa generica: vedi
  // `valueSlotWhyText`.
  "indice-relativo": "fra i liberi del suo ruolo, adesso",
  // Sovrascritta a runtime con la catena vera (budget → target → slot →
  // fascia), così la riga dice DA DOVE viene il numero e non una promessa
  // generica: vedi `valueSlotWhyText`.
  "valore-assoluto": "dal regolamento e dai tuoi target di ruolo",
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
  // I motivi dell'INDICE RELATIVO. Quattro frasi diverse perché sono quattro
  // attese diverse: aspettare che il deposito serva l'indice, aspettare che
  // l'ordine copra questo ruolo, aspettare un verdetto su QUESTA riga, o non
  // aspettare niente perché il giocatore è già passato. Un «non disponibile»
  // unico le confonderebbe tutte.
  "indice-relativo-senza-ordine": "il listone non porta l'indice: nessun ordine",
  "indice-relativo-ruolo-non-ordinato": "il suo ruolo non è ordinato",
  "indice-relativo-non-ordinato": "senza verdetto: l'indice non lo ordina",
  "indice-relativo-gia-preso": "già preso: non è più in gioco",
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
  return `Il valore relativo resta n/d finché ${list} non entrano nell'app.`;
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

/**
 * Il testo della cella: il numero con la sua unità, oppure `n/d`.
 *
 * L'ORDINALE È UN SEGNO DI FORMA, non una conversione. `3º` e `3` sono lo
 * stesso numero; il maschile ordinale dice che è un RANGO e non un punteggio,
 * che è l'unica cosa che distingue a colpo d'occhio la cella 2 dalla cella 1 —
 * due numeri vicini, due significati diversi. Nessun `Intl`, nessuna locale del
 * runtime: il determinismo del progetto vale anche qui.
 */
export function valueSlotText(slot: ValueSlot): string {
  if (slot.kind === "assente") return VALUE_UNKNOWN;
  const text = valueNumberText(slot.value);
  if (slot.unit === "crediti") return `${text} cr`;
  return slot.unit === "posizione" ? `${text}º` : text;
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

/**
 * LA POPOLAZIONE SU CUI LA POSIZIONE È MISURATA, in una riga: «su 41 liberi
 * ordinati».
 *
 * È il denominatore, e senza di lui «3º» non dice niente — terzo su quattro e
 * terzo su quaranta sono due situazioni opposte.
 *
 * IL DENOMINATORE È `freeRankedInRole`, NON `freeInRole`, ed è una correzione
 * misurata e non una preferenza: la posizione è contata fra i giocatori che
 * l'indice ORDINA, e nel ruolo possono restare liberi anche giocatori senza
 * verdetto, che nell'ordine non ci sono. Scrivere «3º fra 4 liberi» quando gli
 * ordinati sono tre farebbe leggere «ultimo» a chi invece è ultimo di una
 * popolazione più piccola: il numeratore e il denominatore devono contare la
 * stessa cosa, altrimenti la frazione mente. Quanti ne restano liberi IN TUTTO
 * resta misurato in `ValueBoxReading.relativePopulation.freeInRole`.
 *
 * QUANTI NE HA PRESI PICO E QUANTI GLI AVVERSARI NON COMPAIONO QUI, e non è una
 * dimenticanza: non entrano nel numero (entrarci richiederebbe un coefficiente
 * che nessuno ha dichiarato), quindi una riga che dice DA DOVE VIENE il numero
 * mentirebbe a nominarli. Restano misurati nella lettura per chi li vuole, e
 * sono già a schermo nel pannello SVUOTAMENTO DEL RUOLO, che è la superficie il
 * cui mestiere è proprio quello.
 *
 * Il singolare si scrive al singolare: «su 1 libero ordinato». Nessun `Intl`,
 * nessuna locale del runtime — una `s` in più è una riga in meno di fiducia.
 */
export function relativePopulationText(reading: ValueBoxReading): string {
  const population = reading.relativePopulation;
  if (population === null) return "";
  const n = population.freeRankedInRole;
  return n === 1 ? "su 1 libero ordinato" : `su ${n} liberi ordinati`;
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
    // LA CATENA, IN UNA RIGA. Non è decorazione: un numero derivato che non sa
    // dire da dove viene si legge come un numero inventato, e questa cella è la
    // sola superficie su cui la derivazione arriva sotto gli occhi di Pico.
    if (id === "valore-assoluto" && reading.absoluteChain !== null) {
      return absoluteChainText(reading);
    }
    // Stessa ragione della catena qui sopra: una posizione senza il suo
    // denominatore si legge come un punteggio, cioè come un numero che non è.
    if (id === "indice-relativo" && reading.relativePopulation !== null) {
      return relativePopulationText(reading);
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

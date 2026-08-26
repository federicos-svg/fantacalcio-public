// LE ICONE DELLA SCHEDA, ACCANTO AL RADAR — costruttori HTML/SVG puri.
//
// Contratto: src/expertScheda.ts. Resa del radar: src/ui/pagellaRadar.ts.
//
// ── CHE COSA SONO, E DOVE STANNO ─────────────────────────────────────────────
//
// Cinque icone nella COLONNA DEL RADAR, sotto il disegno: quattro che si
// accendono e si spengono — rigorista, punizioni, angoli, ballottaggio — più
// una quinta che COMPARE SOLO se la fonte ha messo il giocatore in una delle
// sue tre liste.
//
// ERANO QUATTRO, E «PIAZZATI» ERA UNA SOLA. Le due specialità stavano dentro
// un'icona sola perché il contratto le teneva in un insieme: `piazzati:
// ["punizioni", "angoli"]`. Da quando la fonte porta anche IL POSTO NELLA FILA
// (src/expertScheda.ts §rango) un'icona sola non basta più — un giocatore può
// essere primo sulle punizioni e terzo sugli angoli, e un solo numero non
// potrebbe dire quale dei due sta mostrando. Due caselle, due numeri, nessuna
// ambiguità da risolvere a mente.
//
// IL NUMERO DELLA POSIZIONE È UNA PASTIGLIA SULL'ANGOLO della casella, non una
// riga sotto: la striscia sta su UNA riga alta 30px (e2e/scheda-icone.spec.ts)
// dentro la colonna del disegno, e una riga di numeri sotto le
// caselle costerebbe l'altezza di una riga di testo su una schermata che è già
// oltre il proprio budget verticale. La pastiglia è fuori dal flusso, quindi
// non gonfia niente; porta il colore della propria icona, quindi la spazzata di
// contrasto la misura come misura ogni altro testo.
//
// Stanno lì e non altrove per una ragione misurata, non estetica. La colonna
// del disegno è alta quanto l'elenco dei cinque assi che le sta accanto: a
// 1440px il radar ne occupa 116 di altezza e ne restano 62 vuoti sotto. La
// striscia ci entra intera, quindi il blocco della pagella NON CRESCE di un
// pixel dove il suo tetto è misurato (240px, e2e/pagella-radar.spec.ts). In
// LARGHEZZA la colonna è 136px e non più 116: cinque caselle da 24 con quattro
// spazi da 4 non stanno nel lato del radar, e le ultime due sarebbero uscite
// dalla colonna invece di andare a capo (src/styles/asta.css,
// `--pagella-figure-col`). Il radar resta 116px: i 20 in più sono aria. Nello
// stato senza voti — cioè oggi, su ogni giocatore — il radar non c'è e la
// striscia ne prende il posto nella stessa colonna, accanto alla frase: il
// blocco resta sotto gli 80px che quella stessa spec gli impone. Le icone
// devono comparire ANCHE lì, ed è il vincolo che decide la forma: se vivessero
// dentro il disegno non si vedrebbero su nessun giocatore finché l'estrazione
// della pagella non esiste.
//
// ── IL COLORE NON PORTA MAI NULLA DA SOLO ────────────────────────────────────
//
// ACCESO/SPENTO si legge senza colore, in tre modi ridondanti: il glifo è
// PIENO da acceso e in SOLO CONTORNO da spento; la cornice è continua da
// acceso e TRATTEGGIATA da spento; e il testo della didascalia dice a parole
// che cosa la scheda dichiara — o che non lo dichiara.
//
// LE TRE LISTE sono TRE GLIFI DIVERSI, non lo stesso glifo in tre colori: una
// spunta per «consigliato», una scintilla per «possibile sorpresa», una croce
// per «sconsigliato». Chi non distingue verde da rosso legge la forma; chi non
// vede affatto legge la frase. Il colore è il terzo canale, mai il primo.
//
// NESSUN COLORE NUOVO: --green, --text-accent e --stop-red esistono già in
// base.css e stanno rispettivamente a 4,79:1, 5,09:1 e 5,02:1 su
// --panel-inner, che è il fondo su cui queste icone sono dipinte. La misura
// non è dichiarata qui e basta: la didascalia di ogni icona è dipinta DELLO
// STESSO colore del suo glifo, quindi la spazzata di contrasto che misura i
// pixel resi (e2e/text-contrast-aa.spec.ts, via measureAllText) misura il
// colore dell'icona misurando il suo testo. Un glifo illeggibile non ha modo
// di restare fuori dalla prova.
//
// ── «N/D» NON SI FINGE ───────────────────────────────────────────────────────
//
// Un segnale che la scheda non dichiara produce un'icona SPENTA, mai un'icona
// accesa con un valore di comodo. E «spento» non è una parola sola: il
// ballottaggio spento perché la scheda lo dà titolare e il ballottaggio spento
// perché la scheda non dichiara la titolarità dicono due cose diverse, e la
// didascalia le scrive diverse. L'ultima icona, quando la lista non c'è,
// NON COMPARE: è ciò che «appare solo se» significa.
//
// E VALE ANCHE UN LIVELLO PIÙ GIÙ, sul numero. Un'icona accesa senza rango
// dichiarato NON prende la pastiglia — nessun «1» di comodo, che si leggerebbe
// come «il primo della fila» — e la sua didascalia lo DICE: `rango n/d`, la
// parola con cui il contratto dichiara ciò che manca. Un'icona spenta non ha
// mai una pastiglia: non c'è nessuna fila di cui essere il quantesimo.
//
// ── L'HOVER NON È L'UNICA VIA ────────────────────────────────────────────────
//
// Ogni icona è un BOTTONE. Non perché ci sia qualcosa da fare — non fa nulla —
// ma perché un bottone è l'unico elemento che prende il fuoco col tab, col tap
// e col mouse su ogni piattaforma. La didascalia compare su `:hover` e su
// `:focus-within`, e il TESTO INTERO è il contenuto accessibile del bottone:
// chi naviga a voce lo sente senza che nessun `title` debba comparire, e chi
// usa il telefono lo apre toccandolo. Un `title` e basta non sarebbe
// raggiungibile né da tastiera né col dito, ed è esattamente la superficie che
// serve durante un'asta dal vivo.

import {
  SCHEDA_CLUB_NON_DICHIARATA,
  SCHEDA_RANGO_NON_DICHIARATO,
} from "../expertScheda.js";
import type {
  BallottaggioSoggetto,
  ExpertInsightView,
  ListaEsperti,
} from "../expertScheda.js";
import {
  LISTA_ESPERTI_LABELS,
  PIAZZATI_BATTITORE,
  PIAZZATI_LABELS,
  RIGORI_LABELS,
  TITOLARITA_LABELS,
  conRango,
  rangoText,
} from "./schedaLabels.js";
import { escHtml } from "./theme.js";

/** Le cinque famiglie. `lista` è la sola che può non esserci. */
export type SchedaIconaKind =
  | "rigorista"
  | "punizioni"
  | "angoli"
  | "ballottaggio"
  | "lista";

/**
 * Il tono di un'icona. `neutro` è l'inchiostro della rampa — le prime tre non
 * hanno un colore proprio, e non devono averlo: se ogni icona fosse colorata,
 * il colore smetterebbe di significare «lista editoriale» e tornerebbe a
 * essere decorazione.
 */
export type SchedaIconaTono = "neutro" | "verde" | "blu" | "rosso";

export interface SchedaIcona {
  readonly id: string;
  readonly kind: SchedaIconaKind;
  readonly acceso: boolean;
  readonly tono: SchedaIconaTono;
  /** La parola in evidenza: il nome del segnale, o lo stato della lista. */
  readonly nome: string;
  /** Che cosa la scheda dice — o che cosa NON dice. Mai vuoto. */
  readonly dettaglio: string;
  /**
   * IL POSTO NELLA FILA, o `null`. `null` in tre casi diversi che a schermo si
   * vedono uguali (nessuna pastiglia) e nella didascalia no: l'icona è spenta
   * (nessuna fila), la famiglia non ha una fila (ballottaggio, lista), oppure
   * la scheda dichiara la fila e non l'ordine — e quel terzo caso è l'unico che
   * scrive `rango n/d`, perché è l'unico in cui un numero MANCA invece di non
   * esistere.
   */
  readonly rango: number | null;
  /** La frase intera: contenuto accessibile del bottone e forma parlata. */
  readonly parlato: string;
}

// ── Le parole ────────────────────────────────────────────────────────────────

export { LISTA_ESPERTI_LABELS };

/** Il tono di ciascuna lista: verde, blu, rosso — come li ha chiesti Pico. */
export const LISTA_ESPERTI_TONI: Readonly<Record<ListaEsperti, SchedaIconaTono>> = {
  consigliato: "verde",
  possibile_sorpresa: "blu",
  sconsigliato: "rosso",
};

/** La riga che dichiara da chi viene la lista: è un parere della fonte, non dell'app. */
export const LISTA_ESPERTI_DETTAGLIO = "lista del Gruppo Esperti";

/** `["a", "b", "c"]` -> `«a, b e c»`. Un elenco si legge con la «e», non con una virgola muta. */
export function elencoItaliano(parti: readonly string[]): string {
  if (parti.length === 0) return "";
  if (parti.length === 1) return parti[0] as string;
  return `${parti.slice(0, -1).join(", ")} e ${parti[parti.length - 1] as string}`;
}

/**
 * `{ surface: "Tizio", club: "ClubUno", sharePercent: 40 }` -> `«Tizio
 * (ClubUno) al 40%»`. Senza quota: nome e squadra. Senza squadra: `«Tizio
 * (squadra n/d)»`.
 *
 * LA SQUADRA SI SCRIVE SEMPRE, e non «solo quando è un'altra». Il riquadro non
 * sa quale sia la squadra del giocatore della scheda — la vista porta i segnali,
 * non la riga — e inventare qui una regola di resa («mostrala se differisce»)
 * significherebbe farle sapere una cosa che non sa. Ma soprattutto: la squadra
 * è entrata nel dato perché due omonimi pieni in club diversi non fossero più
 * indistinguibili, e nasconderla proprio nel punto in cui il rivale si legge
 * durante l'asta li rimetterebbe indistinguibili dove costa di più.
 *
 * `squadra n/d` NON È UN RIPIEGO GRAFICO: è il caso vero dei depositi scritti
 * prima di questa forma, dichiarato con la parola con cui questo repository
 * dichiara ciò che manca, invece che con la squadra del giocatore accanto.
 */
export function soggettoText(soggetto: BallottaggioSoggetto): string {
  const identita = `${soggetto.surface} (${soggetto.club ?? SCHEDA_CLUB_NON_DICHIARATA})`;
  return soggetto.sharePercent === undefined
    ? identita
    : `${identita} al ${soggetto.sharePercent}%`;
}

/**
 * CON CHI, e con quale quota — TUTTI gli altri, non «l'altro».
 *
 * Un ballottaggio a tre esiste, e cablare «l'altro» significherebbe far
 * sparire il terzo nome senza dirlo. L'elenco è quello del deposito, nel suo
 * ordine, e non è una graduatoria: le quote sono quelle che la scheda scrive.
 */
export function ballottaggioDettaglio(view: ExpertInsightView): string {
  const quota = view.percentuale === null ? "" : `, lui al ${view.percentuale}%`;
  if (view.ballottaggio.length === 0) {
    return `la scheda non dice con chi${quota}`;
  }
  return `con ${elencoItaliano(view.ballottaggio.map(soggettoText))}${quota}`;
}

function maiuscola(testo: string): string {
  return testo.length === 0 ? testo : `${testo[0]?.toUpperCase() ?? ""}${testo.slice(1)}`;
}

function icona(
  kind: SchedaIconaKind,
  acceso: boolean,
  tono: SchedaIconaTono,
  nome: string,
  dettaglio: string,
  rango: number | null = null,
): SchedaIcona {
  return {
    id: `player-insight-icona-${kind}`,
    kind,
    acceso,
    tono,
    nome,
    dettaglio,
    rango,
    parlato: `${maiuscola(nome)}: ${dettaglio}.`,
  };
}

/**
 * La didascalia di un'icona ACCESA che ha una fila: la parola del segnale col
 * proprio posto davanti, o la parola più la dichiarazione che l'ordine manca.
 *
 * Scritta una volta per tutte e tre le famiglie ordinate — rigorista, punizioni,
 * angoli — perché le tre frasi non possano divergere: sono lo stesso fatto
 * detto su tre file diverse, e tre copie sarebbero tre modi di dire `n/d`.
 */
export function dettaglioConRango(parola: string, rango: number | null): string {
  return rango === null ? `${parola} — ${SCHEDA_RANGO_NON_DICHIARATO}` : conRango(parola, rango);
}

// ── Il modello: quali icone, accese o spente, e perché ───────────────────────

/**
 * Le icone di questa vista. SEMPRE le prime quattro — accese o spente, ma
 * sempre presenti: una casella che sparisce quando il segnale manca è
 * indistinguibile da una casella che non è mai esistita, e chi legge in due
 * secondi conta le caselle. La quinta c'è SOLO quando la lista esiste.
 */
export function schedaIcone(view: ExpertInsightView): readonly SchedaIcona[] {
  const icone: SchedaIcona[] = [
    icona(
      "rigorista",
      view.rigori !== null,
      "neutro",
      "rigorista",
      view.rigori === null
        ? "la scheda non lo dichiara"
        : dettaglioConRango(RIGORI_LABELS[view.rigori], view.rangoRigori),
      view.rigori === null ? null : view.rangoRigori,
    ),
    // DUE FAMIGLIE DOVE PRIMA CE N'ERA UNA. La condizione di accensione resta
    // quella di sempre — la specialità è dichiarata fra i `piazzati` — ma
    // ciascuna porta il proprio numero, che è la ragione per cui si sono
    // divise.
    icona(
      "punizioni",
      view.piazzati.includes("punizioni"),
      "neutro",
      PIAZZATI_LABELS.punizioni,
      view.piazzati.includes("punizioni")
        ? dettaglioConRango(PIAZZATI_BATTITORE, view.rangoPunizioni)
        : "la scheda non le dichiara",
      view.rangoPunizioni,
    ),
    icona(
      "angoli",
      view.piazzati.includes("angoli"),
      "neutro",
      PIAZZATI_LABELS.angoli,
      view.piazzati.includes("angoli")
        ? dettaglioConRango(PIAZZATI_BATTITORE, view.rangoAngoli)
        : "la scheda non li dichiara",
      view.rangoAngoli,
    ),
    icona(
      "ballottaggio",
      view.titolarita === "ballottaggio",
      "neutro",
      "ballottaggio",
      view.titolarita === "ballottaggio"
        ? ballottaggioDettaglio(view)
        : // DUE SPENTI DIVERSI, scritti diversi: «la scheda lo dà titolare» è
          // un fatto, «la scheda non dichiara la titolarità» è un buco. Dirli
          // con la stessa frase manderebbe a cercare un dato che c'è già, o
          // farebbe credere risolto un dato che manca.
          view.titolarita === null
          ? "la scheda non dichiara la titolarità"
          : `la scheda lo dà ${TITOLARITA_LABELS[view.titolarita]}`,
    ),
  ];
  if (view.lista !== null) {
    icone.push(
      icona(
        "lista",
        true,
        LISTA_ESPERTI_TONI[view.lista],
        LISTA_ESPERTI_LABELS[view.lista],
        LISTA_ESPERTI_DETTAGLIO,
      ),
    );
  }
  return icone;
}

// ── I glifi ──────────────────────────────────────────────────────────────────
//
// Silhouette che non si somigliano, in un riquadro di 24 unità:
//
//  - RIGORISTA: il pallone sul dischetto — un tondo grande e un tondo piccolo.
//  - PUNIZIONI: la barriera e la palla piazzata davanti — tre sbarre e un tondo.
//  - ANGOLI: la bandierina d'angolo — asta verticale e triangolo.
//  - BALLOTTAGGIO: due punte che si fronteggiano attorno a una sbarra — «due
//    che si giocano un posto», e non un tondo né un triangolo.
//  - LISTE: spunta, scintilla, croce. Tre segni che restano diversi in bianco
//    e nero, e che nessuno confonde con le icone qui sopra.
//
// L'ANGOLO IN BASSO A DESTRA DI OGNI GLIFO ORDINATO È TENUTO LIBERO: è dove si
// posa la pastiglia del rango. Il pallone del rigorista sta in alto e il suo
// dischetto a sinistra; la palla della punizione sta in basso a sinistra e la
// barriera in alto a destra, corta abbastanza da non arrivare all'angolo;
// l'asta della bandierina è tutta a sinistra. Non è un vezzo di disegno: una
// pastiglia sopra la parte che identifica il glifo toglierebbe il primo dei
// tre canali con cui acceso/spento si legge senza colore.
//
// `scheda-icona__tratto` è il glifo che cambia con lo stato (pieno da acceso,
// contorno da spento). `scheda-icona__segno` è il tracciato che resta sempre
// tracciato — la spunta e la croce non hanno un dentro da riempire, e l'icona
// delle liste non ha uno stato spento perché quando non c'è non compare.

const GLIFI: Readonly<Record<string, string>> = {
  rigorista:
    `<circle class="scheda-icona__tratto" cx="11" cy="9" r="5.6"></circle>` +
    `<circle class="scheda-icona__tratto" cx="5.6" cy="19.4" r="1.9"></circle>`,
  punizioni:
    `<circle class="scheda-icona__tratto" cx="4.6" cy="18.8" r="2.7"></circle>` +
    `<path class="scheda-icona__tratto" d="M9.4 3.2h3.4v11.4H9.4z"></path>` +
    `<path class="scheda-icona__tratto" d="M14.2 3.2h3.4v11.4h-3.4z"></path>` +
    `<path class="scheda-icona__tratto" d="M19 3.2h3.4v11.4H19z"></path>`,
  angoli:
    `<path class="scheda-icona__tratto" d="M6.6 2.5h2.2v19H6.6z"></path>` +
    `<path class="scheda-icona__tratto" d="M9.6 3.4l9.2 3.4-9.2 3.4z"></path>`,
  ballottaggio:
    `<path class="scheda-icona__tratto" d="M2.2 12l6.6-5.2v10.4z"></path>` +
    `<path class="scheda-icona__tratto" d="M21.8 12l-6.6-5.2v10.4z"></path>` +
    `<path class="scheda-icona__tratto" d="M11 3.4h2v17.2h-2z"></path>`,
  consigliato: `<path class="scheda-icona__segno" d="M4 12.4l5.2 5.2L20 6.8"></path>`,
  possibile_sorpresa:
    `<path class="scheda-icona__tratto" d="M12 2q1.2 8.8 10 10-8.8 1.2-10 10-1.2-8.8-10-10 8.8-1.2 10-10z"></path>`,
  sconsigliato: `<path class="scheda-icona__segno" d="M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"></path>`,
};

/** Il nome del glifo di un'icona: per quella delle liste è lo STATO, non la
 *  famiglia. */
export function glifoKey(icona: SchedaIcona, lista: ListaEsperti | null): string {
  return icona.kind === "lista" ? (lista ?? "sconsigliato") : icona.kind;
}

/**
 * LA PASTIGLIA DEL RANGO, o stringa vuota.
 *
 * `aria-hidden` non è una svista: il numero è GIÀ nella frase accessibile del
 * bottone («Angoli: 2° battitore.»), e leggerlo due volte a chi naviga a voce
 * sarebbe rumore. Resta testo dipinto, quindi la spazzata di contrasto lo
 * misura — porta il colore della propria icona, come la didascalia.
 */
export function schedaIconaRangoHtml(icona: SchedaIcona): string {
  if (icona.rango === null) return "";
  return `<span class="scheda-icona__rango" aria-hidden="true">${escHtml(
    rangoText(icona.rango),
  )}</span>`;
}

// ── L'HTML ───────────────────────────────────────────────────────────────────

const TONO_CLASS: Readonly<Record<SchedaIconaTono, string>> = {
  neutro: "scheda-icona--neutro",
  verde: "scheda-icona--verde",
  blu: "scheda-icona--blu",
  rosso: "scheda-icona--rosso",
};

export function schedaIconaHtml(icona: SchedaIcona, lista: ListaEsperti | null): string {
  const glifo = GLIFI[glifoKey(icona, lista)] ?? "";
  const stato = icona.acceso ? "scheda-icona--on" : "scheda-icona--off";
  return `<li class="scheda-icona ${stato} ${TONO_CLASS[icona.tono]}" id="${icona.id}" data-acceso="${
    icona.acceso ? "si" : "no"
  }">
    <button class="scheda-icona__hit" type="button">
      <svg class="scheda-icona__glifo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${glifo}</svg>${schedaIconaRangoHtml(
        icona,
      )}
      <span class="scheda-icona__sr">${escHtml(icona.parlato)}</span>
    </button>
    <span class="scheda-icona__pop" aria-hidden="true"><b class="scheda-icona__pop-nome">${escHtml(
      icona.nome,
    )}</b> <span class="scheda-icona__pop-testo">${escHtml(icona.dettaglio)}</span></span>
  </li>`;
}

/** La striscia intera. Mai vuota negli stati in cui una scheda esiste. */
export function schedaIconeHtml(view: ExpertInsightView): string {
  const icone = schedaIcone(view);
  if (icone.length === 0) return "";
  return `<ul class="scheda-icone" id="player-insight-icone">${icone
    .map((i) => schedaIconaHtml(i, view.lista))
    .join("")}</ul>`;
}

/**
 * La forma parlata delle icone, per l'aria-label del pannello.
 *
 * C'è perché il pannello ha UNA etichetta parlata che riassume tutto
 * (src/ui/views.ts): senza questa riga chi naviga a voce sentirebbe il
 * riassunto del riquadro senza i nomi del ballottaggio, che sono proprio il
 * dato che le icone hanno aggiunto.
 */
export function schedaIconeSpoken(view: ExpertInsightView): string {
  return schedaIcone(view)
    .map((i) => i.parlato)
    .join(" ");
}

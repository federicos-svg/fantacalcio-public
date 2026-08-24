// #59 — IL LIBRO MASTRO DEL BUDGET VERTICALE DELLA SCHERMATA DI CHIAMATA.
//
// IL DIFETTO CHE QUESTO FILE CHIUDE. Il budget verticale della schermata di
// chiamata a 390px esiste da #333 ed è UN TOTALE SENZA PROPRIETARI: la guardia
// che lo misura (e2e/call-screen-order.spec.ts, «con 532 righe la paginazione
// è un controllo raggiungibile») confronta lo span intero con due schermate e
// dice «troppo» a cose fatte, SENZA DIRE A CHI. Il margine è stato eroso da
// corsie che non sapevano di star spendendo, e la riparazione è toccata ogni
// volta all'ultimo arrivato — quello sotto pressione, non quello che conosce
// il valore relativo dei blocchi.
//
// COSA FA QUESTO FILE, IN UNA FRASE: dichiara una riga per blocco, seminata
// con una MISURA e non con una scelta, e vincola la somma delle righe più la
// riserva a un'UGUAGLIANZA ESATTA col totale che Owner ha già dichiarato —
// così alzare la propria riga obbliga, NELLO STESSO DIFF, ad abbassarne
// un'altra o la riserva, con nome e cognome.
//
// PERCHÉ STA IN `src/` E NON IN `e2e/`. Le spec importano da `src/`, mai il
// contrario: mettendo qui il mastro e la sua aritmetica, l'identità
// «somma + riserva === totale» si verifica SENZA BROWSER, in millisecondi, a
// ogni `npm test` — e non solo quando qualcuno fa girare Playwright. Il
// browser serve solo a MISURARE; la classificazione dei fallimenti è la
// funzione pura `callScreenBudgetFindings()` qui sotto, che si testa a secco.
//
// NIENTE QUI È UN NUMERO SCELTO. Ogni allocazione è o una misura presa a
// schermo (stato e commit scritti accanto) o un'aritmetica dichiarata su
// misure. Le scelte che restano tali non sono nascoste dentro una costante:
// stanno in `CALL_SCREEN_BUDGET_UNRATIFIED`, pinnate da un test che le
// DOCUMENTA SENZA APPROVARLE — lo stesso trattamento che il motore riserva
// alle proprie scelte aperte (`UNRATIFIED_CHOICES`,
// packages/engine/src/declaredValues.ts).

import { LISTONE_PAGE_SIZE } from "./listone.js";

/* ────────────────────────────────────────────────────────────────────────────
   1. IL TOTALE — non è un numero nuovo, è quello che la guardia già usa
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * IL TELEFONO SU CUI SI CHIAMA. 390×844: la prima voce di `VIEWPORTS` in
 * `e2e/call-screen-order.spec.ts` da #333, cioè la risoluzione su cui quella
 * spec ha misurato il difetto originale (il campo di ricerca a 2507px
 * dall'inizio del documento, la terza schermata). Il mastro vive qui perché
 * la spec lo importi invece di riscriverlo: una risoluzione sola, in un posto
 * solo.
 */
export const CALL_SCREEN_BUDGET_VIEWPORT = { width: 390, height: 844 } as const;

/**
 * LE DUE SCHERMATE — il solo numero di questa storia che qualcuno abbia
 * DICHIARATO, e non si tocca.
 *
 * Provenienza, alla lettera dalla guardia che lo usa dal #333
 * (`e2e/call-screen-order.spec.ts`, test «con 532 righe la paginazione è un
 * controllo raggiungibile, non la sesta schermata»):
 *
 *   «Attaccata alla ricerca: la tabella che la separa dal campo è al massimo
 *    una pagina di LISTONE_PAGE_SIZE righe, quindi il controllo che serve a
 *    ogni ricerca sta entro DUE schermate — prima stava alla quinta a 390px.»
 *
 * Nasce da una richiesta di prodotto confermata da Owner. Qui è ESTRATTO, non
 * duplicato: il predicato di quella guardia resta byte per byte quello che
 * era, e la spec asserisce che `callScreenVerticalBudgetPx(viewport.height)`
 * vale esattamente ciò che il predicato calcola — se i due divergessero, il
 * rosso arriverebbe lì.
 */
export const CALL_SCREEN_BUDGET_SCREENS = 2;

/** Il budget verticale, in px, per una finestra alta `viewportHeightPx`. */
export function callScreenVerticalBudgetPx(viewportHeightPx: number): number {
  return viewportHeightPx * CALL_SCREEN_BUDGET_SCREENS;
}

/** Il totale dichiarato sul telefono dichiarato: 844 × 2 = 1688 px. */
export const CALL_SCREEN_VERTICAL_BUDGET_PX = callScreenVerticalBudgetPx(
  CALL_SCREEN_BUDGET_VIEWPORT.height,
);

/**
 * LO SPAN CHE IL BUDGET GOVERNA, definito esattamente come lo definisce la
 * guardia esistente: dal bordo SUPERIORE del campo di ricerca al bordo
 * SUPERIORE dell'indicatore di pagina del listone. Non è l'altezza del
 * documento e non è l'altezza della colonna: è la distanza fra la ragione per
 * cui la schermata esiste e il controllo che serve a ogni ricerca.
 *
 * Conseguenza diretta, e per questo scritta: ciò che sta SOPRA il campo di
 * ricerca consuma 0 px di questo budget — crescendo sposta in giù sia il
 * campo sia la paginazione, e la loro distanza non cambia. Quel margine è
 * governato dall'altra guardia di #333 (il campo sopra la piega), non da
 * questa.
 */
export const CALL_SCREEN_SPAN_START_SELECTOR = "#search-player";

/* ────────────────────────────────────────────────────────────────────────────
   2. GLI STATI — la schermata non ne ha uno solo, e il budget vale in tutti
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Gli stati che la schermata di chiamata assume a 390px. Non un elenco di
 * comodo: ognuno cambia QUALI blocchi esistono, e quindi quanto span si
 * consuma. La guardia totale di #333 ne misura uno solo — `ricerca` — ed è la
 * ragione per cui i due stati col contesto aperto hanno sfondato il totale
 * senza che nessuna guardia lo vedesse.
 */
export type CallScreenState =
  /** Boot: nessuna riga selezionata, ricerca vuota, listone a pagina piena. */
  | "ricerca"
  /** Una riga del listone è stata cliccata: compare CONTESTO CHIAMATA, chiuso. */
  | "riga-selezionata"
  /** Il corpo di CONTESTO CHIAMATA è aperto (la ricerca resta filtrata). */
  | "contesto-aperto"
  /** Contesto aperto E ricerca svuotata: il listone torna a pagina piena. */
  | "contesto-aperto-ricerca-vuota"
  /** IL TAVOLO è aperto (sta sotto la paginazione: non consuma questo span). */
  | "tavolo-aperto"
  /** Nessun pool caricabile: il listone rende il suo stato vuoto, senza pagine. */
  | "listone-non-caricabile";

export interface CallScreenStateSpec {
  readonly id: CallScreenState;
  readonly label: string;
  /**
   * In questo stato il listone mostra una PAGINA PIENA (`LISTONE_PAGE_SIZE`
   * righe)? È la condizione sotto cui vale l'uguaglianza derivata della riga
   * del listone: dove il filtro riduce le righe, la forma è un'altra e non si
   * pretende che sia quella.
   */
  readonly listoneFullPage: boolean;
}

export const CALL_SCREEN_STATES: readonly CallScreenStateSpec[] = [
  { id: "ricerca", label: "ricerca (boot)", listoneFullPage: true },
  { id: "riga-selezionata", label: "riga selezionata, contesto chiuso", listoneFullPage: false },
  { id: "contesto-aperto", label: "contesto della chiamata aperto", listoneFullPage: false },
  {
    id: "contesto-aperto-ricerca-vuota",
    label: "contesto aperto e ricerca svuotata",
    listoneFullPage: true,
  },
  { id: "tavolo-aperto", label: "IL TAVOLO aperto", listoneFullPage: true },
  { id: "listone-non-caricabile", label: "listone non caricabile", listoneFullPage: false },
];

/* ────────────────────────────────────────────────────────────────────────────
   3. LA FORMA DEL LISTONE — la riga più grande non è un numero piatto
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * ALTEZZA DI UNA RIGA DEL LISTONE, misurata. 92,5px a 390px con le colonne di
 * default di oggi, arrotondati al pixel (l'unità in cui il browser risponde).
 *
 * NON è una scelta e NON è un numero dichiarato da nessuno: è la conseguenza
 * di quante colonne la riga porta e di quanto sono lunghi i nomi che ci
 * stanno dentro. Vedi `LISTONE_COLONNE_DEFAULT_NON_DICHIARATE` e
 * `NOME_GIOCATORE_LUNGHEZZA_NON_DICHIARATA` in `CALL_SCREEN_BUDGET_UNRATIFIED`.
 */
export const LISTONE_ROW_PX = 93;

/** Da dove il blocco del listone comincia al bordo superiore della PRIMA riga:
 *  margine del blocco, titolo, filtro stato, icona colonne, testata colonne. */
export const LISTONE_HEAD_PX = 201;

/** Dal bordo inferiore dell'ULTIMA riga al bordo superiore dell'indicatore di
 *  pagina: la coda della tabella dentro lo span. */
export const LISTONE_TAIL_PX = 13;

/** Tutto ciò che nel listone non è una riga: testata + coda. */
export const LISTONE_CHROME_PX = LISTONE_HEAD_PX + LISTONE_TAIL_PX;

/**
 * L'ALLOCAZIONE DEL LISTONE È UN'UGUAGLIANZA DERIVATA DALLA SUA FORMA, non un
 * numero piatto: `(righe per pagina × altezza di riga) + testata`.
 *
 * È lo stesso idioma di `VALUE_BOX_TEXT_ROWS` in `e2e/value-box.spec.ts`
 * (`VALUE_SLOT_ORDER.length * 3 + 2`): la costante DESCRIVE LA FORMA, quindi
 * una riga in meno e una riga in più sono entrambe rosse.
 *
 * Perché conta qui: il listone vale i due terzi dello span (1139 px misurati
 * su 1627,5 allo stato `ricerca`). Scritto come prodotto, una colonna in più
 * che manda a capo il nome cambia `LISTONE_ROW_PX`, rompe l'uguaglianza e
 * NOMINA IL LISTONE — invece di far sfondare il totale all'ultimo blocco
 * arrivato, che con quella colonna non c'entra niente.
 */
export const LISTONE_ALLOCATION_PX = LISTONE_PAGE_SIZE * LISTONE_ROW_PX + LISTONE_CHROME_PX;

/* ────────────────────────────────────────────────────────────────────────────
   4. IL MASTRO — una riga per blocco
   ──────────────────────────────────────────────────────────────────────────── */

export type CallScreenBlockId =
  | "intestazione-ricerca"
  | "ricerca"
  | "esito-ricerca"
  | "contatore-interazioni"
  | "contesto-chiamata"
  | "giocatore-suggerito"
  | "listone";

export interface CallScreenBlockAllocation {
  readonly id: CallScreenBlockId;
  readonly label: string;
  /** L'id DOM con cui il blocco si riconosce a schermo. */
  readonly domId: string;
  /** px dello span che questo blocco può occupare. Una misura, o derivata. */
  readonly allocationPx: number;
  /** Lo stato in cui la misura è stata presa: quello in cui il blocco è più alto. */
  readonly measuredInState: CallScreenState;
  /** Il commit su cui la misura è stata presa. */
  readonly measuredAtCommit: string;
  /** Gli stati in cui il blocco DEVE esserci: se manca lì, è rosso. */
  readonly requiredIn: readonly CallScreenState[];
  /** Che cos'è la misura, in una riga. */
  readonly why: string;
}

/** Il commit su cui l'intero mastro è stato misurato, con Playwright, a 390×844. */
export const CALL_SCREEN_BUDGET_MEASURED_AT = "ac8814c";

const ALL_STATES: readonly CallScreenState[] = CALL_SCREEN_STATES.map((s) => s.id);

const WITH_SELECTION: readonly CallScreenState[] = [
  "riga-selezionata",
  "contesto-aperto",
  "contesto-aperto-ricerca-vuota",
];

/**
 * IL LIBRO MASTRO. Una riga per blocco, con la sua misura, lo stato in cui è
 * stata presa e gli stati in cui il blocco deve esserci.
 *
 * L'ordine è quello verticale della schermata (#333), non alfabetico: chi
 * legge il mastro sta guardando la schermata.
 */
export const CALL_SCREEN_BUDGET_LEDGER: readonly CallScreenBlockAllocation[] = [
  {
    id: "intestazione-ricerca",
    label: "RICERCA GIOCATORE (occhiello)",
    domId: "call-screen-eyebrow",
    allocationPx: 0,
    measuredInState: "ricerca",
    measuredAtCommit: CALL_SCREEN_BUDGET_MEASURED_AT,
    requiredIn: ALL_STATES,
    why:
      "consuma 0 px dello span PER COSTRUZIONE: sta sopra il bordo superiore del campo di " +
      "ricerca, che è dove lo span comincia. Se cresce sposta in giù campo e paginazione " +
      "insieme, e la loro distanza non cambia. Ha una riga lo stesso perché il blocco esiste, " +
      "e un blocco senza riga è rosso.",
  },
  {
    id: "ricerca",
    label: "riga di ricerca (nome, ruolo, squadra, Avvia, Reset)",
    domId: "call-search-row",
    allocationPx: 152,
    measuredInState: "ricerca",
    measuredAtCommit: CALL_SCREEN_BUDGET_MEASURED_AT,
    requiredIn: ALL_STATES,
    why:
      "151,5 px misurati: la parte della riga di ricerca che sta SOTTO il bordo superiore del " +
      "campo. A 390px i cinque controlli vanno a capo su tre righe.",
  },
  {
    id: "esito-ricerca",
    label: "esito della ricerca (suggerimento o errore di ruolo)",
    domId: "call-search-hint",
    allocationPx: 60,
    measuredInState: "ricerca",
    measuredAtCommit: CALL_SCREEN_BUDGET_MEASURED_AT,
    requiredIn: ALL_STATES,
    why:
      "59,75 px misurati a ricerca vuota (tre righe di testo, il caso più alto). Con una riga " +
      "selezionata la frase è più corta e misura 42,5: l'allocazione tiene il massimo.",
  },
  {
    id: "contatore-interazioni",
    label: "contatore delle interazioni di chiamata",
    domId: "call-interaction-count",
    allocationPx: 17,
    measuredInState: "ricerca",
    measuredAtCommit: CALL_SCREEN_BUDGET_MEASURED_AT,
    requiredIn: ALL_STATES,
    why: "17,25 px misurati: una riga di testo sola, uguale in tutti gli stati.",
  },
  {
    id: "contesto-chiamata",
    label: "CONTESTO CHIAMATA",
    domId: "nomination-context",
    allocationPx: 1096,
    measuredInState: "contesto-aperto",
    measuredAtCommit: CALL_SCREEN_BUDGET_MEASURED_AT,
    requiredIn: WITH_SELECTION,
    why:
      "1096,25 px misurati COL CORPO APERTO — il 65% dell'intero totale dichiarato, per un " +
      "blocco solo. Da chiuso ne misura 151,5. L'allocazione tiene l'aperto perché è " +
      "l'altezza che il blocco RAGGIUNGE, e un mastro che allocasse il chiuso direbbe verde " +
      "su una schermata che è al 161% del budget. Nessun documento dichiara quanto questo " +
      "pannello possa occupare: vedi CONTESTO_CHIAMATA_APERTO_NON_DICHIARATO.",
  },
  {
    id: "giocatore-suggerito",
    label: "GIOCATORE SUGGERITO (chi chiamare ora + esca)",
    domId: "suggested-player",
    allocationPx: 260,
    measuredInState: "ricerca",
    measuredAtCommit: CALL_SCREEN_BUDGET_MEASURED_AT,
    requiredIn: ALL_STATES,
    why:
      "260 px misurati: segnaposto onesto della prima metà (nessun motore di suggerimento " +
      "attivo) più la sezione esca, già compressa una volta da 218 a 71 px. È il blocco " +
      "dentro cui atterra «chi chiamare per me»: vedi CALL_SCREEN_BUDGET_RESERVE_PX per che " +
      "cosa costa oggi farlo entrare.",
  },
  {
    id: "listone",
    label: "LISTONE SVINCOLATI (fino alla paginazione)",
    domId: "listone-block",
    allocationPx: LISTONE_ALLOCATION_PX,
    measuredInState: "ricerca",
    measuredAtCommit: CALL_SCREEN_BUDGET_MEASURED_AT,
    requiredIn: ALL_STATES,
    why:
      "non un numero piatto ma (righe per pagina × altezza di riga) + testata = " +
      `${LISTONE_PAGE_SIZE} × ${LISTONE_ROW_PX} + ${LISTONE_CHROME_PX}. Misurati 1139 px allo ` +
      "stato ricerca, i due terzi dello span. Scritto come forma, una colonna in più che manda " +
      "a capo rompe l'uguaglianza e nomina il listone.",
  },
];

/** La somma delle allocazioni dichiarate. Derivata, mai scritta a mano. */
export const CALL_SCREEN_ALLOCATED_PX = CALL_SCREEN_BUDGET_LEDGER.reduce(
  (total, row) => total + row.allocationPx,
  0,
);

/**
 * LA RISERVA — «lo spazio che resta per il blocco che ancora non esiste».
 *
 * È un RESIDUO MISURATO, non un margine scelto: il totale dichiarato meno la
 * somma delle allocazioni. È scritta come letterale, e non calcolata, di
 * proposito: se fosse `TOTALE − SOMMA` l'identità del §5 sarebbe vera per
 * costruzione e non vincolerebbe nessuno. Scritta qui, alzare la propria riga
 * costringe NELLO STESSO DIFF ad abbassare questo numero o la riga di un
 * vicino, con nome e cognome.
 *
 * OGGI VALE −1041 px, ed è il fatto che questo mastro esiste per dire: dei
 * 1688 px dichiarati non ne resta nessuno, e i blocchi che ci sono già ne
 * chiedono 1041 in più di quelli che il totale concede. Il blocco che ancora
 * non esiste — «chi chiamare per me», la prima metà di GIOCATORE SUGGERITO,
 * già in lavorazione — non arriva in uno spazio vuoto: arriva dovendo
 * restituire la propria altezza PIÙ 1041 px presi da righe con un nome
 * (`callScreenNewBlockCostPx`). Una riserva che scende, in un file tracciato,
 * è l'allarme che prima non c'era da nessuna parte.
 */
export const CALL_SCREEN_BUDGET_RESERVE_PX = -1041;

/**
 * Che cosa costa, oggi, far entrare un blocco nuovo alto `heightPx`: quanti px
 * vanno restituiti da righe esistenti perché l'identità del §5 continui a
 * valere. Con la riserva negativa il costo è l'altezza PIÙ il rosso.
 */
export function callScreenNewBlockCostPx(heightPx: number): number {
  return heightPx - CALL_SCREEN_BUDGET_RESERVE_PX;
}

/* ────────────────────────────────────────────────────────────────────────────
   5. GLI STATI CHE OGGI SFONDANO — pinnati, non approvati
   ──────────────────────────────────────────────────────────────────────────── */

export interface CallScreenOverBudgetState {
  readonly state: CallScreenState;
  /** Lo span misurato, in px, arrotondato al pixel. */
  readonly spanPx: number;
  /** Di quanto supera il totale dichiarato. */
  readonly overBudgetPx: number;
  readonly why: string;
}

/**
 * GLI STATI CHE, MISURATI OGGI, STANNO OLTRE IL TOTALE DICHIARATO.
 *
 * Sono pinnati per essere DOCUMENTATI, non approvati: il test li asserisce
 * alla lettera, quindi diventano rossi appena la misura si muove — in meglio o
 * in peggio — invece di scivolare via in silenzio come hanno fatto finora. La
 * guardia totale di #333 non li vede perché misura solo lo stato di boot.
 *
 * Riparare queste due righe è una decisione di prodotto (che cosa CONTESTO
 * CHIAMATA mostra da aperto), non una modifica che un worker possa fare da sé:
 * qui si registra il debito, non lo si condona.
 */
export const CALL_SCREEN_OVER_BUDGET_STATES: readonly CallScreenOverBudgetState[] = [
  {
    state: "contesto-aperto",
    spanPx: 1874,
    overBudgetPx: 186,
    why:
      "il corpo di CONTESTO CHIAMATA aperto porta il blocco da 151,5 a 1096,25 px; il listone " +
      "è filtrato a una riga sola e lo span sfonda lo stesso.",
  },
  {
    state: "contesto-aperto-ricerca-vuota",
    spanPx: 2724,
    overBudgetPx: 1036,
    why:
      "contesto aperto E listone di nuovo a pagina piena: 2724 px contro 1688, il 161% del " +
      "totale dichiarato. È lo stato peggiore raggiungibile con due gesti, ed è esattamente " +
      "la somma delle allocazioni del mastro.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
   6. LE SCELTE CHE RESTANO TALI — documentate, non approvate
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Le cose che questo mastro ha dovuto assumere e che **nessun documento
 * canonico chiude**. Stesso vocabolario e stesso trattamento delle scelte
 * aperte del motore (`UNRATIFIED_CHOICES`,
 * packages/engine/src/declaredValues.ts): elenco macchina-leggibile, pinnato
 * da un test che le documenta senza approvarle.
 */
export type CallScreenBudgetUnratifiedId =
  | "NOME_GIOCATORE_LUNGHEZZA_NON_DICHIARATA"
  | "CONTESTO_CHIAMATA_APERTO_NON_DICHIARATO"
  | "LISTONE_COLONNE_DEFAULT_NON_DICHIARATE"
  | "RISERVA_NEGATIVA_SENZA_PROPRIETARIO"
  | "MISURE_LEGATE_AL_RENDERING_PINNATO";

export const CALL_SCREEN_BUDGET_UNRATIFIED: Readonly<
  Record<CallScreenBudgetUnratifiedId, string>
> = {
  NOME_GIOCATORE_LUNGHEZZA_NON_DICHIARATA:
    "nessun documento dichiara quanto può essere lungo un nome nel listone: con nomi da 18 " +
    "caratteri e i club veri già dichiarati nel repository la riga passa da 92,5 a 112,5 px e " +
    "lo span sfonda il totale OGGI, senza nessun blocco nuovo (vedi CALL_SCREEN_NAME_LENGTH_PINS)",
  CONTESTO_CHIAMATA_APERTO_NON_DICHIARATO:
    "nessun documento dichiara quanto CONTESTO CHIAMATA possa occupare da aperto: la sua " +
    "allocazione è semplicemente la misura di oggi, che da sola vale il 65% del totale",
  LISTONE_COLONNE_DEFAULT_NON_DICHIARATE:
    "LISTONE_ROW_PX è l'altezza che la riga ha con le colonne di default di oggi: quante " +
    "colonne la riga possa portare senza mandare a capo non è dichiarato da nessuna parte",
  RISERVA_NEGATIVA_SENZA_PROPRIETARIO:
    "la riserva è negativa (−1041 px): il totale dichiarato è già sfondato dai blocchi " +
    "esistenti, e nessuno ha dichiarato quale riga debba restituire lo spazio",
  MISURE_LEGATE_AL_RENDERING_PINNATO:
    "le allocazioni sono px misurati col browser pinnato di questo repository a 390×844: " +
    "cambiando motore di rendering o font di sistema vanno rimisurate, e il mastro lo dice " +
    "diventando rosso invece di derivare in silenzio",
};

export interface CallScreenNameLengthPin {
  /** Lunghezza dei nomi nella fixture, in caratteri. */
  readonly chars: number;
  /** Lo span misurato, in px, arrotondato al pixel. */
  readonly spanPx: number;
  /** Di quanto supera il totale dichiarato. */
  readonly overBudgetPx: number;
}

/**
 * IL FATTO CHE RIMETTE IN DISCUSSIONE TUTTI GLI ALTRI NUMERI, pinnato.
 *
 * Cambiando SOLO le stringhe della fixture — nomi più lunghi, club veri già
 * dichiarati in `src/ui/serieA.ts` — lo span passa da 1627,5 px (dentro) a
 * 1807,5 px (fuori), senza che sia comparso un solo blocco nuovo. Cioè: il
 * margine su cui si è trattato per tre merge è in buona parte un artefatto
 * della lunghezza dei nomi finti.
 *
 * Non si sceglie qui una lunghezza «giusta»: nessuno l'ha dichiarata. Si
 * PINNA la misura a 18 e 22 caratteri — documentare senza approvare — e il
 * giorno in cui Owner dichiara la lunghezza vera si cambia una costante e il
 * mastro dice da solo quanto manca.
 */
export const CALL_SCREEN_NAME_LENGTH_PINS: readonly CallScreenNameLengthPin[] = [
  { chars: 18, spanPx: 1808, overBudgetPx: 120 },
  { chars: 22, spanPx: 1828, overBudgetPx: 140 },
];

/* ────────────────────────────────────────────────────────────────────────────
   7. LA SPAZZATA CHE ATTRIBUISCE — funzione pura, testabile senza browser
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Un blocco raccolto a schermo. Il browser lo raccoglie PER FORMA (ogni figlio
 * della colonna della chiamata, qualunque cosa sia) e non da un elenco: è
 * l'unico modo che regge il blocco che ancora non esiste — quello arriva come
 * un figlio in più e viene misurato senza che nessuno se ne debba ricordare.
 * È lo stesso idioma della spazzata di `measureAllText` (e2e/helpers.ts).
 */
export interface MeasuredCallScreenBlock {
  /** L'id DOM del blocco. Stringa vuota se non ne ha uno. */
  readonly domId: string;
  /** tag + classi: serve a NOMINARE un blocco che nel mastro non c'è. */
  readonly description: string;
  /**
   * px dello span consumati da questo blocco. La raccolta è una piastrellatura
   * esatta — ogni blocco copre da dove finisce il precedente a dove finisce
   * lui, ritagliato sullo span — quindi la somma dei consumi È lo span, e i
   * margini fra due blocchi non spariscono: li paga il blocco sotto.
   */
  readonly consumptionPx: number;
}

/** La forma misurata del listone, che è ciò su cui la sua riga è un'uguaglianza. */
export interface CallScreenListoneShape {
  readonly rowCount: number;
  readonly rowHeightPx: number;
  readonly headPx: number;
  readonly tailPx: number;
}

export interface CallScreenSweep {
  readonly state: CallScreenState;
  /** Lo span misurato: dal campo di ricerca all'indicatore di pagina. */
  readonly spanPx: number;
  readonly blocks: readonly MeasuredCallScreenBlock[];
  /** `null` quando in questo stato non c'è nessuna riga (listone non caricabile). */
  readonly listone: CallScreenListoneShape | null;
}

export type CallScreenBudgetFinding =
  /** Anti-vacuità: una spazzata che non trova niente passerebbe per vuoto. */
  | { readonly kind: "spazzata-vuota"; readonly state: CallScreenState }
  /** Un blocco a schermo senza riga nel mastro. */
  | {
      readonly kind: "blocco-senza-riga";
      readonly state: CallScreenState;
      readonly domId: string;
      readonly description: string;
      readonly consumptionPx: number;
      readonly reservePx: number;
    }
  /** Una riga del mastro senza blocco a schermo, nello stato in cui deve esserci. */
  | {
      readonly kind: "riga-senza-blocco";
      readonly state: CallScreenState;
      readonly id: CallScreenBlockId;
      readonly label: string;
      readonly domId: string;
    }
  /** Un blocco più alto della propria allocazione. */
  | {
      readonly kind: "oltre-allocazione";
      readonly state: CallScreenState;
      readonly id: CallScreenBlockId;
      readonly label: string;
      readonly consumptionPx: number;
      readonly allocationPx: number;
      readonly overflowPx: number;
    }
  /** La forma del listone non è quella che la sua uguaglianza derivata prevede. */
  | {
      readonly kind: "forma-listone";
      readonly state: CallScreenState;
      readonly part: "righe" | "altezza-riga" | "testata" | "coda";
      readonly measured: number;
      readonly declared: number;
    };

/** Il pixel è l'unità in cui questo mastro è scritto e in cui si confronta. */
function px(value: number): number {
  return Math.round(value);
}

const LEDGER_BY_DOM_ID: ReadonlyMap<string, CallScreenBlockAllocation> = new Map(
  CALL_SCREEN_BUDGET_LEDGER.map((row) => [row.domId, row] as const),
);

/**
 * LA SPAZZATA CHE ATTRIBUISCE. Tre fallimenti, ciascuno con un nome, più
 * l'anti-vacuità e la forma del listone.
 *
 * Perché è una funzione pura e non un blocco di `expect` dentro la spec: così
 * i suoi casi si provano senza browser (`src/ui/callScreenBudget.test.ts`),
 * compresi quelli che a schermo si riproducono solo rompendo qualcosa.
 */
export function callScreenBudgetFindings(
  sweep: CallScreenSweep,
): readonly CallScreenBudgetFinding[] {
  const out: CallScreenBudgetFinding[] = [];

  // 0. ANTI-VACUITÀ. Una schermata svuotata non deve passare per «tutto a
  //    posto»: è un difetto che questo repository ha già pagato più volte.
  if (sweep.blocks.length === 0) {
    out.push({ kind: "spazzata-vuota", state: sweep.state });
  }

  // 1. UN BLOCCO A SCHERMO SENZA RIGA NEL MASTRO. Col suo identificativo, la
  //    sua altezza e quanta riserva è disponibile — che è il numero con cui si
  //    decide se può stare.
  for (const block of sweep.blocks) {
    if (LEDGER_BY_DOM_ID.has(block.domId)) continue;
    out.push({
      kind: "blocco-senza-riga",
      state: sweep.state,
      domId: block.domId,
      description: block.description,
      consumptionPx: px(block.consumptionPx),
      reservePx: CALL_SCREEN_BUDGET_RESERVE_PX,
    });
  }

  const seen = new Map(sweep.blocks.map((b) => [b.domId, b] as const));

  for (const row of CALL_SCREEN_BUDGET_LEDGER) {
    const block = seen.get(row.domId);

    // 2. UNA RIGA NEL MASTRO SENZA BLOCCO A SCHERMO, nello stato in cui
    //    dovrebbe esserci. Senza questo, una spazzata che non trova niente
    //    passerebbe per vuota una riga alla volta.
    if (block === undefined) {
      if (row.requiredIn.includes(sweep.state)) {
        out.push({
          kind: "riga-senza-blocco",
          state: sweep.state,
          id: row.id,
          label: row.label,
          domId: row.domId,
        });
      }
      continue;
    }

    // 3. UN BLOCCO PIÙ ALTO DELLA PROPRIA ALLOCAZIONE, col nome e di quanto
    //    sfora. È la guardia che morde PRIMA del totale.
    const consumption = px(block.consumptionPx);
    if (consumption > row.allocationPx) {
      out.push({
        kind: "oltre-allocazione",
        state: sweep.state,
        id: row.id,
        label: row.label,
        consumptionPx: consumption,
        allocationPx: row.allocationPx,
        overflowPx: consumption - row.allocationPx,
      });
    }
  }

  // 4. LA FORMA DEL LISTONE. Vale dove il listone mostra una pagina piena: è
  //    lì che (righe × altezza) + testata è un'uguaglianza e non una stima.
  const stateSpec = CALL_SCREEN_STATES.find((s) => s.id === sweep.state);
  if (stateSpec?.listoneFullPage === true && sweep.listone !== null) {
    const shape = sweep.listone;
    const parts: readonly {
      readonly part: "righe" | "altezza-riga" | "testata" | "coda";
      readonly measured: number;
      readonly declared: number;
    }[] = [
      { part: "righe", measured: shape.rowCount, declared: LISTONE_PAGE_SIZE },
      { part: "altezza-riga", measured: px(shape.rowHeightPx), declared: LISTONE_ROW_PX },
      { part: "testata", measured: px(shape.headPx), declared: LISTONE_HEAD_PX },
      { part: "coda", measured: px(shape.tailPx), declared: LISTONE_TAIL_PX },
    ];
    for (const p of parts) {
      if (p.measured !== p.declared) {
        out.push({ kind: "forma-listone", state: sweep.state, ...p });
      }
    }
  }

  return out;
}

/** Una riga di testo per fallimento, che NOMINA sempre il responsabile. */
export function describeCallScreenBudgetFinding(f: CallScreenBudgetFinding): string {
  switch (f.kind) {
    case "spazzata-vuota":
      return (
        `[${f.state}] la spazzata non ha trovato NESSUN blocco nella colonna della chiamata: ` +
        `schermata svuotata o spazzata inerte — non «tutto a posto»`
      );
    case "blocco-senza-riga":
      return (
        `[${f.state}] blocco a schermo senza riga nel mastro: ` +
        `${f.domId === "" ? "(senza id) " : `#${f.domId} `}${f.description} occupa ` +
        `${f.consumptionPx}px dello span; riserva disponibile ${f.reservePx}px — ` +
        `dichiaralo in CALL_SCREEN_BUDGET_LEDGER e abbassa nello stesso diff la riga di un ` +
        `vicino o la riserva`
      );
    case "riga-senza-blocco":
      return (
        `[${f.state}] riga «${f.id}» (${f.label}) dichiarata obbligatoria in questo stato ma ` +
        `#${f.domId} non è a schermo: o il blocco è sparito, o il mastro dichiara uno stato ` +
        `che non esiste più`
      );
    case "oltre-allocazione":
      return (
        `[${f.state}] «${f.id}» (${f.label}) occupa ${f.consumptionPx}px contro ` +
        `${f.allocationPx}px allocati: +${f.overflowPx}px oltre la propria riga`
      );
    case "forma-listone":
      return (
        `[${f.state}] la forma del listone non torna — ${f.part}: misurato ${f.measured}, ` +
        `dichiarato ${f.declared}. L'allocazione del listone è ` +
        `(${LISTONE_PAGE_SIZE} righe × ${LISTONE_ROW_PX}px) + ${LISTONE_CHROME_PX}px di ` +
        `testata: cambiare una di queste tre cose nomina IL LISTONE, non l'ultimo blocco arrivato`
      );
  }
}

/**
 * IL MESSAGGIO CHE OGGI MANCA ALLA GUARDIA TOTALE: «lo span è X su Y — il
 * blocco più oltre la propria allocazione è Z, di +N px».
 *
 * Si costruisce PRIMA di asserire e si passa alla guardia esistente come
 * messaggio: nessuna asserzione tolta, nessuna ammorbidita, nessun predicato
 * toccato. È l'unica cosa che quella guardia non sapeva dire.
 */
export function callScreenBudgetAttribution(
  sweep: CallScreenSweep,
  viewportHeightPx: number,
): string {
  const budget = callScreenVerticalBudgetPx(viewportHeightPx);
  const head = `lo span è ${px(sweep.spanPx)}px su ${budget}px`;

  const worst = callScreenBudgetFindings(sweep)
    .flatMap((f) => (f.kind === "oltre-allocazione" ? [f] : []))
    .sort((a, b) => b.overflowPx - a.overflowPx)[0];

  if (worst === undefined) {
    return (
      `${head} — nessun blocco è oltre la propria allocazione: ` +
      `il totale si è mosso senza che nessuna riga del mastro sfori, quindi il colpevole è ` +
      `fuori dai blocchi dichiarati (un blocco nuovo, o un margine)`
    );
  }
  return (
    `${head} — il blocco più oltre la propria allocazione è «${worst.id}» ` +
    `(${worst.label}), di +${worst.overflowPx}px su ${worst.allocationPx}px allocati`
  );
}

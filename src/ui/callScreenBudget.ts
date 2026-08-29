// IL LIBRO MASTRO DEL BUDGET VERTICALE DELLA SCHERMATA DI CHIAMATA.
//
// PROVENIENZA. Questo lavoro NON HA UNA ISSUE SORGENTE TRACCIABILE: nessuna
// issue esiste in questo repository. La lacuna è dichiarata qui invece di
// essere coperta con un numero: mergiato dall'Executive su delega di Pico del
// 2026-08-25.
//
// QUESTO FILE NON RIPARA NIENTE: MISURA. Il budget verticale della schermata di
// chiamata a 390px esiste da #333 ed è UN TOTALE SENZA PROPRIETARI: la guardia
// che lo misura (e2e/call-screen-order.spec.ts, «con 532 righe la paginazione
// è un controllo raggiungibile») confronta lo span intero con due schermate e
// dice «troppo» a cose fatte, SENZA DIRE A CHI. Il margine è stato eroso da
// corsie che non sapevano di star spendendo, e la riparazione è toccata ogni
// volta all'ultimo arrivato — quello sotto pressione, non quello che conosce
// il valore relativo dei blocchi.
//
// COSA FA, IN UNA FRASE: dichiara una riga per blocco, seminata
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

// ⚠️ TRAPPOLA DI MANUTENZIONE — LEGGERE PRIMA DI «RIPARARE» LA SCHERMATA.
//
// Questo file e le sue due suite NON riparano niente: sono STRUMENTAZIONE
// DIAGNOSTICA. Misurano un debito che esiste già e lo congelano — è la tecnica
// dei test di caratterizzazione, e la sua conseguenza va detta esplicitamente:
//
//   ALCUNE DI QUESTE ASSERZIONI SI ASPETTANO CHE IL BUDGET SIA SFORATO.
//
// `CALL_SCREEN_OVER_BUDGET_STATES` pinna ALLA LETTERA due span oltre il totale
// dichiarato, `CALL_SCREEN_NAME_LENGTH_PINS` ne pinna altri due, e
// `CALL_SCREEN_BUDGET_RESERVE_PX` è NEGATIVA. Il giorno in cui qualcuno
// ripara davvero il layout — CONTESTO CHIAMATA che occupa meno da aperto, un
// listone più compatto — QUESTI TEST DIVENTANO ROSSI. Non hai rotto niente:
// hai reso obsoleta una misura.
//
// COSA FARE, IN QUEL CASO: rimisurare (le allocazioni, gli span pinnati, i pin
// sui nomi), aggiornare i numeri qui e la data di
// `CALL_SCREEN_BUDGET_MEASURED_ON`, e far salire la riserva verso lo zero. NON
// allentare le asserzioni in `<=` e non cancellare le righe: un mastro che
// tollera è un mastro che non attribuisce più, cioè esattamente il vuoto che
// questo file esiste per riempire.

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
  /** Nessun pool caricabile: il listone rende il suo stato vuoto, senza pagine. */
  | "listone-non-caricabile";

// ⚠️ LO STATO `tavolo-aperto` NON C'È PIÙ, ed è una riga in meno per una
// ragione, non per pulizia. Esisteva perché IL TAVOLO era un accordion e la
// schermata poteva quindi trovarsi in due forme diverse: col gruppo chiuso
// (che è ciò che lo stato `ricerca` misurava) e col gruppo aperto. Dal
// 2026-08-26 IL TAVOLO è SEMPRE APERTO (decisione di Pico, vedi
// renderTableDetail in src/main.ts): il chiuso non esiste, quindi
// `tavolo-aperto` sarebbe stato lo stato `ricerca` con un altro nome — cioè
// una riga di mastro che dichiara uno stato irraggiungibile, che è esattamente
// la cosa che questo file esiste per non fare.
//
// NIENTE COPERTURA È STATA PERSA, anzi: il gruppo è aperto in TUTTI E CINQUE
// gli stati rimasti, quindi ogni misura di questo mastro è presa con la war
// board e la scarsità in pagina, e non più solo una su sei. Le misure non si
// sono mosse di un pixel perché IL TAVOLO sta SOTTO l'indicatore di pagina del
// listone, cioè fuori dallo span che questo budget governa (§1): era vero
// quando era chiuso, resta vero adesso che è aperto.

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
 *  margine del blocco, titolo, i quattro interruttori di ruolo, filtro stato,
 *  icona colonne, testata colonne.
 *
 *  ERA 201, ED È SALITA A 233 IL 2026-08-29. I 32 px sono i quattro
 *  interruttori di ruolo che Pico ha chiesto sulla riga del titolo: a 390px la
 *  riga manda a capo e loro scendono sotto il titolo, prendendosi una seconda
 *  riga. A schermo largo stanno accanto al titolo e non costano niente — ma il
 *  mastro misura lo stretto, perché è lì che la piega morde.
 *
 *  A 28px di lato ne costavano 36, e lo span di boot finiva a 1690 su 1688:
 *  DUE PIXEL oltre il totale dichiarato, e il mastro li ha visti. Gli
 *  interruttori sono stati portati a 24 — la misura è scelta per stare dentro
 *  il totale, e sta scritta anche in src/styles/listone.css accanto al numero.
 *  Il tetto non è stato alzato: è il controllo nuovo ad essere stato tagliato
 *  su misura, che è il verso giusto.
 *
 *  I 32 px escono dalla riserva, che scende da −1068 a −1100: nessun'altra
 *  riga è stata abbassata, perché nessun altro blocco ha perso qualcosa. È la
 *  procedura scritta in cima a questo file — si misura, si dichiara, si
 *  sottrae — e non un tetto ritoccato per far tornare un test. */
export const LISTONE_HEAD_PX = 233;

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
 * su 1654 allo stato `ricerca`). Scritto come prodotto, una colonna in più
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

/**
 * Il commit su cui l'intero mastro è stato misurato, con Playwright, a 390×844.
 *
 * RIMISURATO il 2026-08-25 su `4b2833d`. La prima stesura di queste righe
 * misurava `ac8814c`, e nel frattempo la schermata è cambiata: #55 ha
 * sostituito il segnaposto della prima metà di GIOCATORE SUGGERITO col
 * sottoblocco PER ME vero, #56 e #57 hanno riempito due celle del riquadro
 * valore. Un mastro che riporta una misura vecchia è peggio di nessun mastro,
 * quindi ogni numero qui sotto è stato ripreso a schermo su questo commit —
 * non aggiustato a mano perché «tornasse».
 */
export const CALL_SCREEN_BUDGET_MEASURED_AT = "4b2833d";

/** La data della misura. Cambia INSIEME ai numeri, mai da sola. */
export const CALL_SCREEN_BUDGET_MEASURED_ON = "2026-08-26";

// ⚠️ RIMISURA DEL 2026-08-26 — «IL RADAR DELLA PAGELLA ENTRA NELLA SCHERMATA DI
// CHIAMATA», e il mastro dice quanto costa.
//
// LA RAGIONE. Pico ha segnalato che nella schermata di chiamata il radar della
// pagella non compare. Verificato prima di toccare niente: non era «non
// raggiunto», era ASSENTE — `renderPlayerInsightsBlock` era montato solo dal
// momento `asta`, e nessun documento canonico dichiarava quell'assenza come una
// scelta. Adesso il riquadro c'è anche qui, sotto CONTESTO CHIAMATA, e ha la
// propria riga: `scheda-esperto`.
//
// CHE COSA È STATO RIMISURATO, e con quale esito. Tutti gli stati misurabili a
// 390×844, sui due pin di lunghezza dei nomi e sulla PROVA 1:
//
//   stato                          prima      dopo
//   ricerca                        1654       1654   (invariato)
//   riga-selezionata                956       1106   (+150)
//   contesto-aperto                1901       2051   (+150)
//   contesto-aperto-ricerca-vuota  2750       2901   (+151)
//
// RIMISURATO DUE VOLTE, e la seconda conta: la prima passata è di prima che
// `main` portasse i due riquadri titolati dell'insight (#61). Rifatta dopo
// averlo fuso, ogni numero qui sopra è risultato IDENTICO — col deposito vuoto
// il riquadro misura 151 px in entrambe le forme. Col deposito PIENO no, e
// quella differenza è scritta in SCHEDA_ESPERTO_CON_DEPOSITO_NON_DICHIARATA.
//
// I DUE STATI SENZA SELEZIONE NON SI MUOVONO DI UN PIXEL, ed è per costruzione:
// senza una riga cliccata non c'è nessun giocatore di cui leggere la scheda, e
// il blocco non entra nel DOM. Il margine residuo dello stato di boot resta
// quindi 34 px e la PROVA 1 continua a valere.
//
// LA DODICESIMA COLONNA DEL LISTONE COSTA ZERO, misurato e non assunto. Nello
// stesso diff «Piazzati» si è spaccata in «Punizioni» e «Angoli»: a 390px la
// riga del listone è una scheda a capo, e la casella in più è entrata nello
// spazio che c'era già. Riga ancora 92,5px, testata 201, coda 13, allocazione
// del listone identica. Se avesse mandato a capo, il mastro avrebbe nominato IL
// LISTONE — ed è esattamente il motivo per cui quella riga è scritta come una
// forma e non come un numero piatto.
//
// NESSUNA ASSERZIONE È STATA ALLENTATA: i due span pinnati sono stati riscritti
// col valore misurato, la riserva è scesa da −1068 a −1219 e la nuova riga
// dichiara la propria altezza. Il debito cresce e si vede, invece di crescere
// e basta.
//
// ⚠️ 2026-08-29 — LA RIGA `scheda-esperto` NON C'È PIÙ, e con lei il blocco.
// Pico ha spostato INSIGHT GIOCATORE dentro la scheda del chiamato, nel momento
// d'asta: «si visualizza durante la scelta del giocatore mentre dovrebbe
// vedersi durante l'asta dentro #call-card come secondo figlio». Questa
// schermata non lo monta più (src/main.ts), quindi il mastro non lo alloca più
// — un mastro che allocasse l'altezza di un blocco assente direbbe il falso sul
// totale, che è l'unica cosa che questo file esiste per non fare.
//
// I 151 px tornano alla riserva, che risale da −1219 a −1068: esattamente il
// valore che aveva prima, perché è la stessa riga a essere andata e venuta e
// nessun'altra si è mossa. I due span pinnati con selezione scendono di 150
// (riga-selezionata 1106 -> 956, contesto-aperto 2051 -> 1901) e i due stati
// senza selezione non si muovono, perché lì il blocco non c'era comunque.

// ⚠️ RIVERIFICA DEL 2026-08-26 — «IL MASTRO ERA TARATO SU UN'APP CHE NON
// SPEDISCE», e adesso non più. Nessun numero qui sotto è cambiato: la data e
// il commit della misura restano quelli del 2026-08-25 perché la misura è
// quella. Cambiata è la ragione per cui vale.
//
// COSA ERA SUCCESSO. Ogni numero di questo file era stato preso in QUESTO
// repository, dove gli stemmi dei club NON ESISTONO e non possono esistere:
// nessun logo è pubblicabile qui, quindi il marchio del club ripiegava sempre
// sulla pastiglia testuale. Nel repository privato, che gli stemmi ce li ha,
// LA STESSA APP misurava altro: la riga del listone passava da 92,5 a 96,75px
// e lo span allo stato `ricerca` da 1654 a 1697px, perché la scatola occupata
// dal marchio dipendeva da quale dei due rami fosse in pagina (baseline di un
// elemento rimpiazzato contro baseline di testo, più ~11px di larghezza in
// meno). Le stesse otto prove di e2e/call-screen-budget.spec.ts erano verdi
// qui e rosse là, con lo stesso browser. Non era una misura sbagliata: era una
// misura presa su una schermata che nessuno vede.
//
// COSA È CAMBIATO. `CLUB_BADGE_SLOT_STYLE` in src/ui/serieA.ts dichiara ORA
// una sola scatola per il marchio — la pastiglia resta in flusso e la tiene,
// lo stemma le viene disegnato sopra fuori dal flusso — quindi un asset
// mancante cambia ciò che si vede e non dove sta.
//
// COSA DICE LA RIMISURA. Rimisurato il 2026-08-26 a 390×844 nei sei stati
// della schermata, sui due pin di lunghezza dei nomi e sulla PROVA 1, DUE
// VOLTE: una volta con questo albero com'è (nessuno stemma) e una volta con i
// 23 stemmi del privato copiati temporaneamente in public/assets/clubs/ e il
// build rifatto. Le due colonne di numeri sono IDENTICHE, e identiche a quelle
// già scritte qui: span 1654 / 956 / 1901 / 2750 / 1654, riga del listone
// 92,5px, testata 201px, coda 13px, pin dei nomi 1834 e 1854, margine residuo
// della PROVA 1 a 14px. Nessuna asserzione è stata allentata e nessun numero
// aggiustato: non ce n'era da aggiustare. Gli stemmi, ovviamente, non sono
// stati committati — non sono nostri da pubblicare.

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
    allocationPx: 287,
    measuredInState: "ricerca",
    measuredAtCommit: CALL_SCREEN_BUDGET_MEASURED_AT,
    requiredIn: ALL_STATES,
    why:
      "286,5 px misurati il 2026-08-25 su 4b2833d, più la sezione esca già compressa una " +
      "volta da 218 a 71 px. Erano 260 su ac8814c, quando la prima metà era ancora un " +
      "segnaposto onesto: #55 ci ha messo il sottoblocco PER ME vero e il blocco è cresciuto " +
      "di 26,5 px. «Chi chiamare per me» è atterrato qui davvero, e quei 26,5 px sono usciti " +
      "dalla riserva — vedi CALL_SCREEN_BUDGET_RESERVE_PX.",
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
      "stato ricerca su 1654, i due terzi dello span. Scritto come forma, una colonna in più che manda " +
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
 * OGGI VALE −1219 px (rimisura del 2026-08-26), ed è il fatto che questo mastro
 * esiste per dire: dei 1688 px dichiarati non ne resta nessuno, e i blocchi che
 * ci sono già ne chiedono 1219 in più di quelli che il totale concede.
 *
 * ERA −1041 SU `ac8814c` ed è scesa due volte, e nessuna delle due per una
 * decisione presa guardando questo numero: −1068 il 2026-08-25 (#55 ha portato
 * il sottoblocco PER ME dentro GIOCATORE SUGGERITO, da 260 a 287 px), −1219
 * oggi (il riquadro INSIGHT GIOCATORE, 151 px, entra nella schermata di
 * chiamata su richiesta di Pico). La differenza fra le due discese è che questa
 * è DICHIARATA: la riga nuova ha un nome, un'altezza misurata e un motivo, e i
 * 151 px sono usciti da qui e non dal vicino di banco.
 *
 * Il prossimo blocco non arriva in uno spazio vuoto: arriva dovendo restituire
 * la propria altezza PIÙ 1219 px presi da righe con un nome
 * (`callScreenNewBlockCostPx`). Una riserva che scende, in un file tracciato,
 * è l'allarme che prima non c'era da nessuna parte.
 *
 * DA NON CONFONDERE COL MARGINE RESIDUO DI UNO STATO. La riserva confronta il
 * totale con la somma delle allocazioni, cioè col peggio che la schermata
 * raggiunge. Allo stato di boot `ricerca`, dove CONTESTO CHIAMATA non è nel
 * DOM, lo span misura 1654 px e il margine sul totale è ancora positivo: 34 px
 * — erano 60,5 su `ac8814c`. Anche quello si sta chiudendo, e sotto i 20 px
 * smetterà di essere possibile sfondare l'allocazione di un blocco senza
 * sfondare anche il totale (vedi PROVA 1, e2e/call-screen-budget.spec.ts).
 */
export const CALL_SCREEN_BUDGET_RESERVE_PX = -1100;

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
    spanPx: 1933,
    overBudgetPx: 245,
    why:
      "il corpo di CONTESTO CHIAMATA aperto porta il blocco da 151,5 a 1096,25 px; il listone " +
      "è filtrato a una riga sola e lo span sfonda lo stesso. Erano 1874 px su ac8814c, 1901 " +
      "col sottoblocco PER ME di #55, e 2051 dal 2026-08-26 — i 150 px in più erano il riquadro " +
      "INSIGHT GIOCATORE. Dal 2026-08-29 quel riquadro non sta più in questa schermata (Pico " +
      "l'ha messo dentro la scheda del chiamato, nel momento d'asta) e lo span torna a 1901: " +
      "esattamente il valore di prima, perché è la stessa riga a essere andata e venuta. Il " +
      "debito NON è stato ripagato — è stato spostato, e la misura di dove è andato sta in " +
      "SCHEDA_ESPERTO_CON_DEPOSITO_NON_DICHIARATA.",
  },
  {
    state: "contesto-aperto-ricerca-vuota",
    spanPx: 2782,
    overBudgetPx: 1094,
    why:
      "contesto aperto E listone di nuovo a pagina piena: 2901 px contro 1688, il 172% del " +
      "totale dichiarato (erano 2724 — il 161% — su ac8814c e 2750 il 2026-08-25). È lo stato " +
      "peggiore raggiungibile con due gesti, ed è la somma delle allocazioni del mastro a meno " +
      "dell'arrotondamento al pixel dell'altezza di riga del listone.",
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
  | "SCHEDA_ESPERTO_CON_DEPOSITO_NON_DICHIARATA"
  | "MISURE_LEGATE_AL_RENDERING_PINNATO"
  | "PROVA_1_MARGINE_ESAURITO";

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
  PROVA_1_MARGINE_ESAURITO:
    "il margine residuo sul TOTALE, allo stato di boot, è sceso a 2 px (era 34 prima dei quattro " +
    "interruttori di ruolo del 2026-08-29, e 60,5 su ac8814c). PROVA 1 in e2e/call-screen-budget." +
    "spec.ts dimostra che il mastro nomina il blocco colpevole PRIMA che il totale diventi rosso, " +
    "e per farlo ha bisogno di un'aggiunta che sfondi una riga restando dentro il totale: oggi " +
    "quell'aggiunta è alta UN PIXEL. Il prossimo blocco aggiunto a questa schermata — qualunque " +
    "sia — sfonderà il totale insieme alla propria riga, e quella dimostrazione diventerà " +
    "irriproducibile. Non è un difetto del test: è la schermata che ha finito lo spazio. Che cosa " +
    "restituire, e da quale riga, è una decisione di prodotto: qui si registra il numero, non lo " +
    "si condona",
  RISERVA_NEGATIVA_SENZA_PROPRIETARIO:
    "la riserva è negativa (−1100 px): il totale dichiarato è già sfondato dai blocchi " +
    "esistenti, e nessuno ha dichiarato quale riga debba restituire lo spazio",
  SCHEDA_ESPERTO_CON_DEPOSITO_NON_DICHIARATA:
    "il problema NON è più di questa schermata, e non è risolto: si è spostato. Dal 2026-08-29 " +
    "INSIGHT GIOCATORE non sta più qui — Pico l'ha messo dentro #call-card, nel momento d'asta " +
    "— quindi questo mastro non lo alloca più. Ma la misura che lo rendeva scomodo resta vera " +
    "dove il blocco è andato: col DEPOSITO DELLE SCHEDE VUOTO occupa 151 px, e col deposito " +
    "PIENO — cinque icone, radar, pastiglie, prosa — ne occupava 1109 il 2026-08-26. Adesso " +
    "quell'altezza sta SOPRA il gesto «ASSEGNA A», dentro la scheda del chiamato, e il momento " +
    "d'asta NON HA un mastro come questo: l'unica difesa è la soglia di distanza asserita da " +
    "e2e/asta-gesto-principale.spec.ts, che misura col deposito vuoto come tutta la suite. " +
    "Quanto quel riquadro possa occupare sopra il gesto principale non l'ha dichiarato nessuno: " +
    "documentato qui col numero, non condonato e non risolto",
  MISURE_LEGATE_AL_RENDERING_PINNATO:
    "le allocazioni sono px misurati col browser pinnato di questo repository a 390×844: " +
    "cambiando motore di rendering o font di sistema vanno rimisurate, e il mastro lo dice " +
    "diventando rosso invece di derivare in silenzio. Dal 2026-08-26 NON dipendono più " +
    "dagli asset presenti nell'albero: il marchio del club occupa una scatola sola con o " +
    "senza il file dello stemma (CLUB_BADGE_SLOT_STYLE, src/ui/serieA.ts), e la rimisura " +
    "coi 23 stemmi del privato in pagina dà gli stessi numeri. Prima non era così, ed è " +
    "il motivo per cui questo mastro ha rischiato di misurare un'app che non spedisce",
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
 * dichiarati in `src/ui/serieA.ts` — lo span passa da 1654 px (dentro) a
 * 1834 px (fuori), senza che sia comparso un solo blocco nuovo. Cioè: il
 * margine su cui si è trattato per tre merge è in buona parte un artefatto
 * della lunghezza dei nomi finti.
 *
 * Non si sceglie qui una lunghezza «giusta»: nessuno l'ha dichiarata. Si
 * PINNA la misura a 18 e 22 caratteri — documentare senza approvare — e il
 * giorno in cui Owner dichiara la lunghezza vera si cambia una costante e il
 * mastro dice da solo quanto manca.
 */
export const CALL_SCREEN_NAME_LENGTH_PINS: readonly CallScreenNameLengthPin[] = [
  { chars: 18, spanPx: 1866, overBudgetPx: 178 },
  { chars: 22, spanPx: 1886, overBudgetPx: 198 },
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

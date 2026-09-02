// INSIGHT GIOCATORE — costruttori HTML puri del riquadro delle schede
// Gruppo Esperti (contratto e risoluzione: src/expertScheda.ts).
//
// ── PERCHÉ QUESTA FORMA ──────────────────────────────────────────────────────
//
// Il riquadro si legge durante un'asta, con due secondi per decidere, e deve
// reggere DUE REGISTRI insieme:
//
//  1. LO STRATO VISIVO, per il colpo d'occhio. La titolarità è UNA pastiglia
//     con dentro il valore che la scheda dichiara — «ballottaggio» — e nulla
//     accanto. Qui c'era una scala a tre gradini con gli altri due spenti;
//     Pico l'ha tolta guardando il pannello, e la ragione regge meglio del
//     disegno che l'aveva messa: tre caselle di cui due spente sono un quiz,
//     una casella è una risposta, e chi legge in due secondi vuole la
//     risposta. Rigori e calci piazzati sono presenza/assenza e diventano
//     pastiglie; gli avvisi sono pastiglie con un marcatore proprio. La quota
//     del ballottaggio resta l'unica grandezza continua, barra più cifra.
//  2. LA PROSA, per ciò che non si comprime. Il perché di un avviso, una
//     situazione di mercato, una nota di contesto: sono frasi, e comprimerle
//     in un'icona le distruggerebbe. La nota NON è una didascalia sotto le
//     icone — su desktop sta in colonna ACCANTO allo strato visivo, alla sua
//     stessa altezza, con un corpo leggibile; su telefono si impila sotto.
//     È la seconda metà del contenuto, e occupa metà del riquadro.
//
// ── IL COLORE NON PORTA MAI NULLA DA SOLO ────────────────────────────────────
//
// La pastiglia della titolarità porta la sua PAROLA, per intero e mai troncata
// (è dimensionata sul contenuto, non su una colonna di griglia). Ogni altra
// pastiglia porta la sua parola. Gli avvisi hanno in più un marcatore testuale
// «!». Tutto il testo di questo modulo sta sui quattro livelli della rampa di
// base.css, che e2e/text-contrast-aa.spec.ts rimisura a ogni run: nulla qui è
// sotto 4,5:1, e il testo è tutto sotto i 14px, quindi l'eccezione «large text»
// non si applica da nessuna parte.
//
// ── COSA NON C'È, E NON DEVE ARRIVARCI ───────────────────────────────────────
//
// Nessun punteggio, nessuna classifica, nessuna banda di prezzo, nessun
// «conviene»: `value` / `fair_to_me` / `target_band` sono output direttivi
// dietro un gate chiuso (docs/NO_GO.md §Prodotto) e questo riquadro è
// descrittivo per costruzione. I tre fatti di onestà del payload —
// `validated: false`, `directive: false`, `contributesToIndex: false` — restano
// letterali nel contratto, restano verificati dai test e restano nel `title`
// della label; a schermo li riassume una sola scritta, «Scheda Esperto» (vedi
// `expertInsightLabel` più sotto per il perché).
//
// ── LE ICONE ACCANTO AL RADAR ────────────────────────────────────────────────
//
// Questo modulo MONTA la striscia di icone (src/ui/schedaIcone.ts) dentro il
// blocco della pagella, nella colonna del radar. Non è un terzo registro: le
// prime quattro — rigorista, punizioni, angoli, ballottaggio — ridicono in
// forma di segno ciò che le pastiglie qui sopra dicono in parole, per il colpo
// d'occhio, e aggiungono l'unico dato che a schermo non stava da nessuna parte:
// i NOMI degli altri in ballottaggio, con la loro quota. Ciascuna delle tre
// famiglie ordinate porta anche IL PROPRIO POSTO NELLA FILA, e le pastiglie qui
// sopra lo scrivono con le stesse parole: una casella che dice «1°» accanto a
// una pastiglia che dice solo «designato» costringerebbe a scegliere quale
// delle due creda.
//
// L'ULTIMA ICONA È UNA LISTA, NON UN «CONVIENE». Dice in quale delle tre
// liste del Gruppo Esperti — consigliati, possibili sorprese, sconsigliati —
// la FONTE ha messo il giocatore, esattamente come `fonte` dice con quale
// autorità la fonte parlava: è un fatto sulla scheda, non un giudizio
// dell'app, non un prezzo, non una banda e non un massimo di spesa.
// `sconsigliato` era già a schermo come avviso prima di queste icone; le altre
// due sono le sue sorelle nella stessa frase della fonte. Il riquadro resta
// descrittivo per costruzione: `directive: false` è ancora letterale nel
// payload, lo schema `.strict()` continua a rifiutare `value` / `fair_to_me` /
// `target_band` / `prezzo` / `maxBid` / `raccomandazione`, e i test del
// contratto continuano a cercarli per nome.
//
// Costruttori di stringhe puri — stesso idioma di warBoard.ts, roleBudgetPlan.ts
// e liveFacts.ts — così tutta la logica di resa è testabile senza DOM. Nessun
// `Date`, nessun `Intl`: la data della scheda si formatta affettando la sua
// stringa ISO, così la stessa scheda rende la stessa riga su ogni macchina.

import type {
  ExpertInsightAvailability,
  ExpertInsightView,
  ExpertSchedaCandidate,
  Fonte,
  Piazzati,
} from "../expertScheda.js";
import { SCHEDA_NOTA_MARCATURA_PAROLE, TITOLARITA_VALUES } from "../expertScheda.js";
import { pagellaBlockHtml, pagellaSpoken } from "./pagellaRadar.js";
import { SCHEDA_CARDS_CLASS, schedaCardHtml } from "./schedaCard.js";
import { schedaIconeHtml, schedaIconeSpoken } from "./schedaIcone.js";
import {
  AVVISO_LABELS,
  PIAZZATI_LABELS,
  RIGORI_LABELS,
  TITOLARITA_HEAD,
  TITOLARITA_LABELS,
  conRango,
} from "./schedaLabels.js";
import { escHtml } from "./theme.js";

export const EXPERT_INSIGHT_TITLE = "INSIGHT GIOCATORE";

/**
 * I NOMI DEI DUE RIQUADRI AFFIANCATI, e sono nomi di PROVENIENZA, non giudizi.
 *
 * Entrambi dicono «della scheda» perché è la cosa che chi legge deve sapere in
 * due secondi: quello che sta nei due riquadri l'ha scritto la fonte del Gruppo
 * Esperti, non l'ha calcolato l'app. È la stessa garanzia che la label in alto
 * a destra porta per l'intero pannello, ripetuta dove serve — sopra il
 * contenuto — e non un secondo caveat: qui non compare nessun «conviene»,
 * nessun punteggio e nessuna banda.
 */
export const EXPERT_INSIGHT_SEGNALI_TITLE = "SEGNALI DELLA SCHEDA";
export const EXPERT_INSIGHT_NOTE_TITLE = "NOTE DELLA SCHEDA";

// ── Etichette utente ─────────────────────────────────────────────────────────
//
// Le parole del vocabolario della scheda vivono in ./schedaLabels.ts — sotto
// questo modulo E sotto le icone accanto al radar, che hanno bisogno delle
// stesse. Qui restano RIESPORTATE: ogni import esistente le legge da dove le
// leggeva, e non ne esiste una seconda copia da tenere allineata a mano.
export { AVVISO_LABELS, PIAZZATI_LABELS, RIGORI_LABELS, TITOLARITA_HEAD, TITOLARITA_LABELS };

/**
 * L'autorità della fonte in parole, senza dire CHI. «Scheda ufficiale» e
 * «risposta staff» sono attribuzioni non identificanti; l'handle di una
 * persona reale non entra in questo repository e non entra in questa riga.
 */
export const FONTE_LABELS: Readonly<Record<Fonte, string>> = {
  scheda: "scheda ufficiale della squadra",
  staff: "risposta staff",
  // Non «ricerca sul web»: quel che conta per chi legge non è il mezzo con cui
  // l'ho trovata ma CHI lo ha scritto, e queste righe nascono da testate e siti
  // che firmano quel che pubblicano.
  stampa: "fonti di stampa",
  community: "fonte non di staff",
};

/** Quando la scheda non dichiara la fonte non si inventa: si dice che manca. */
export const FONTE_NON_DICHIARATA = "fonte non dichiarata";

// ── I tre fatti di onestà, letti dal payload e scritti a schermo ─────────────

/**
 * L'ETICHETTA UNICA, in alto a destra.
 *
 * Qui c'erano quattro pastiglie — «PARERE DI TERZI · NON VALIDATO · NON È UN
 * CONSIGLIO · FUORI DAL CALCOLO» — una per ciascuno dei tre letterali `false`
 * del payload più la provenienza. Sono state sostituite da una sola label per
 * decisione di Pico, presa guardando il pannello: **«Scheda Esperto»**.
 *
 * PERCHÉ LA DECISIONE È COERENTE COL DATO, e non una rinuncia. Quelle quattro
 * scritte erano state disegnate quando la fonte era il forum letto da una
 * macchina, e servivano ad avvertire chi legge che il segnale veniva da altri e
 * non era stato verificato. Da quando le schede le scrive Pico a mano prima
 * dell'asta, quelle scritte avvertono lui di ciò che ha scritto lui: dicono la
 * stessa cosa che dice il titolo del riquadro, e una riga identica sopra ogni
 * giocatore smette di essere letta dopo il terzo.
 *
 * LA GARANZIA NON SPARISCE, CAMBIA POSTO. I tre `false` restano nel payload e
 * restano verificati dai test del contratto; lo schema `.strict()` continua a
 * rifiutare `value` / `fair_to_me` / `target_band` / `prezzo` / `maxBid` /
 * `raccomandazione`; il `title` di questa label li nomina uno per uno, e la
 * forma parlata del pannello porta l'etichetta di qualità per intero. Ciò che
 * è stato tolto è l'inchiostro permanente a schermo, non il vincolo.
 */
export interface ExpertInsightLabel {
  readonly id: string;
  readonly text: string;
  readonly title: string;
}

export const EXPERT_INSIGHT_LABEL_TEXT = "Scheda Esperto";

export function expertInsightLabel(view: ExpertInsightView): ExpertInsightLabel {
  // Il `title` si costruisce dai CAMPI, non da un letterale: se uno dei tre
  // smettesse di essere `false` la frase corrispondente sparirebbe dal
  // tooltip, e il test che le cerca tutte e tre diventerebbe rosso invece di
  // restare verde su un payload cambiato sotto.
  const facts: string[] = ["Scheda preparata prima dell'asta dalle fonti del Gruppo Esperti."];
  if (view.validated === false) {
    facts.push("validated: false — nessuno ha verificato questo segnale contro un dato misurato.");
  }
  if (view.directive === false) {
    facts.push("directive: false — il riquadro descrive, non raccomanda. Nessun prezzo, nessun «conviene».");
  }
  if (view.contributesToIndex === false) {
    facts.push("contributesToIndex: false — non modifica nessun numero calcolato dall'app.");
  }
  return {
    id: "player-insight-label",
    text: EXPERT_INSIGHT_LABEL_TEXT,
    title: facts.join(" "),
  };
}

export function expertInsightLabelHtml(view: ExpertInsightView): string {
  const label = expertInsightLabel(view);
  return `<span class="expert-label" id="${label.id}" title="${escHtml(label.title)}">${escHtml(
    label.text,
  )}</span>`;
}

// ── Lo strato visivo ─────────────────────────────────────────────────────────

/**
 * LA TITOLARITÀ: **solo il valore che la scheda dichiara**.
 *
 * Qui c'era una scala a tre gradini con gli altri due spenti accanto a quello
 * acceso. Pico l'ha tolta guardando il pannello: «non c'è bisogno di mettere
 * più opzioni, basta soltanto quella valida nel caso specifico». Tre caselle di
 * cui due spente sono un quiz; una casella è una risposta — e a schermo stretto
 * la casella centrale si troncava in «BALLOTT…», che su un pannello da leggere
 * in due secondi è un difetto, non un dettaglio.
 *
 * Il valore è quindi una pastiglia dimensionata sul proprio contenuto
 * (`width: max-content`), non una cella di una griglia a tre: non può più
 * troncarsi, e e2e/player-insight.spec.ts lo rimisura a tutte e quattro le
 * larghezze confrontando `scrollWidth` con `clientWidth`.
 *
 * Quando la scheda non dichiara la titolarità non si disegna nessuna pastiglia:
 * una pastiglia spenta si leggerebbe come un valore.
 */
export function titolaritaHtml(view: ExpertInsightView): string {
  const value =
    view.titolarita === null
      ? `<span class="expert-titolarita__missing" id="player-insight-track-missing">non dichiarata dalla scheda</span>`
      : `<span class="expert-titolarita__value" id="player-insight-track-${view.titolarita}"
          aria-current="true">${escHtml(TITOLARITA_LABELS[view.titolarita])}</span>`;
  return `<div class="expert-titolarita" id="player-insight-track">
    <span class="expert-titolarita__head">${escHtml(TITOLARITA_HEAD)}</span>${value}${sharePercentHtml(view)}
  </div>`;
}

/**
 * La quota del ballottaggio: una barra riempita quanto la percentuale dichiara,
 * col numero SCRITTO accanto. La barra è ridondante col numero, mai al suo
 * posto — una barra senza cifra costringerebbe a stimare a occhio proprio nel
 * momento in cui non c'è tempo.
 *
 * LA BARRA È RIMASTA anche dopo la semplificazione della titolarità, ed è una
 * scelta motivata e non un residuo: tolta la scala a tre gradini, questa è la
 * sola grandezza CONTINUA del riquadro, cioè l'unica cosa che si legge senza
 * leggere. Costa 6px di altezza e nessuna riga — sta sulla stessa riga della
 * pastiglia — quindi l'inchiostro risparmiato togliendola sarebbe stato quasi
 * nullo, mentre «60» e «90» tornerebbero a distinguersi solo leggendo la cifra.
 */
export function sharePercentHtml(view: ExpertInsightView): string {
  if (view.percentuale === null) return "";
  const clamped = Math.max(0, Math.min(100, Math.round(view.percentuale)));
  return `<span class="expert-share" id="player-insight-share">
    <span class="expert-share__track" aria-hidden="true"><span class="expert-share__fill" style="width:${clamped}%"></span></span>
    <span class="expert-share__value">${clamped}% secondo la scheda</span>
  </span>`;
}

/** `2026-08-30` -> `30/08/2026`. Affettatura pura: nessun `Date`, nessun `Intl`. */
export function formatSchedaDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** `1` -> `1ª scelta`. La gerarchia della scheda, non una classifica dell'app. */
export function gerarchiaLabel(rank: number): string {
  return `${rank}ª scelta`;
}

interface Chip {
  readonly id: string;
  readonly kind: "signal" | "warn";
  readonly label: string;
  readonly value: string;
}

/**
 * Le pastiglie: gerarchia, rigori, calci piazzati, avvisi — in quest'ordine,
 * che è quello di quanto cambiano una decisione d'asta, e NON un ordinamento
 * calcolato su nulla. Ogni pastiglia porta la propria parola; il marcatore «!»
 * degli avvisi è testo, non un colore.
 */
export function expertInsightChips(view: ExpertInsightView): readonly Chip[] {
  const chips: Chip[] = [];
  if (view.gerarchia !== null) {
    chips.push({
      id: "player-insight-chip-gerarchia",
      kind: "signal",
      label: "gerarchia",
      value: gerarchiaLabel(view.gerarchia),
    });
  }
  // IL RANGO ENTRA NELLA PASTIGLIA, con le stesse parole della colonna e
  // dell'icona (`conRango`): «1° designato», «2° angoli». Una pastiglia che
  // dicesse solo «designato» accanto a un'icona che mostra «1°» direbbe meno
  // della casella che le sta sotto, e chi legge non saprebbe quale delle due
  // ha ragione. Rango assente = nessun numero, mai uno inventato.
  if (view.rigori !== null) {
    chips.push({
      id: "player-insight-chip-rigori",
      kind: "signal",
      label: "rigori",
      value: conRango(RIGORI_LABELS[view.rigori], view.rangoRigori),
    });
  }
  const ranghiPiazzati: Readonly<Record<Piazzati, number | null>> = {
    punizioni: view.rangoPunizioni,
    angoli: view.rangoAngoli,
  };
  for (const kind of view.piazzati) {
    chips.push({
      id: `player-insight-chip-${kind}`,
      kind: "signal",
      label: "piazzati",
      value: conRango(PIAZZATI_LABELS[kind], ranghiPiazzati[kind]),
    });
  }
  for (const avviso of view.avvisi) {
    chips.push({
      id: `player-insight-chip-${avviso}`,
      kind: "warn",
      label: "avviso",
      value: AVVISO_LABELS[avviso],
    });
  }
  return chips;
}

export function expertInsightChipsHtml(view: ExpertInsightView): string {
  const chips = expertInsightChips(view);
  if (chips.length === 0) return "";
  return `<span class="expert-chips" id="player-insight-chips">${chips
    .map(
      (chip) => `<span class="expert-chip expert-chip--${chip.kind}" id="${chip.id}">${
        chip.kind === "warn" ? `<span class="expert-chip__mark" aria-hidden="true">!</span>` : ""
      }<em>${escHtml(chip.label)}</em><b>${escHtml(chip.value)}</b></span>`,
    )
    .join("")}</span>`;
}

// ── Lo strato di prosa ───────────────────────────────────────────────────────

/**
 * La provenienza, l'attribuzione e la data, in UNA riga sola sotto la prosa.
 *
 * Perché la provenienza sta qui e non in una nota a piè di pannello: è un fatto
 * sulla FRESCHEZZA — dice che questo non è un dato live — e il posto in cui si
 * legge quel fatto è accanto alla data, non tre righe più sotto in corpo
 * minore. Una riga di nota in fondo costava, misurata a 390px, 47px di altezza
 * su una schermata che è già la più lunga dell'app, per dire una cosa che qui
 * sta in quattro parole.
 *
 * **PERCHÉ NON DICE PIÙ «trascritta a mano» (decisione di Pico, 2026-08-26).**
 * Lo diceva, e il giorno in cui il deposito ha smesso di essere battuto a mano
 * quella frase è diventata **falsa e stampata a schermo** sotto ogni giocatore:
 * le schede oggi escono da una catena di estrazione, non dalle dita di
 * qualcuno. Fra le due metà della vecchia frase, quella che il riquadro aveva
 * davvero bisogno di dire era la FRESCHEZZA — «questo non è un dato live» — e
 * quella metà resta vera qualunque cosa produca il deposito. Il meccanismo, che
 * è la metà diventata falsa, esce: nominarlo avrebbe rimesso la stessa frase in
 * scadenza al prossimo cambio di catena, e avrebbe anche introdotto a schermo
 * una distinzione di provenienza che la decisione del 2026-08-25 tiene fuori.
 */
export const EXPERT_INSIGHT_PROVENANCE = "preparata prima dell'asta";

export function expertInsightMetaText(view: ExpertInsightView): string {
  const fonte = view.fonte === null ? FONTE_NON_DICHIARATA : FONTE_LABELS[view.fonte];
  const data = view.aggiornata === null ? "senza data" : formatSchedaDate(view.aggiornata);
  return `${EXPERT_INSIGHT_PROVENANCE} · ${fonte} · ${data}`;
}

/**
 * LA MARCATURA DI PROVENIENZA DELLA PROSA, come PASTIGLIA e non come parentesi
 * quadra in mezzo alla frase (decisione di Pico, 2026-08-26).
 *
 * Il prefisso resta nel DATO — è lì che è verificabile, ed è la sola forma di
 * provenienza che sopravvive a uno schema `.strict()` che non ammette campi
 * fratelli. Ma il posto in cui Pico legge quelle due righe è la schermata
 * d'asta, con pochi secondi per decidere: davanti alla frase, `[sintesi
 * automatica]` si legge come un refuso della fonte, non come un fatto sulla
 * fonte. La stessa informazione, staccata, si legge per quello che è.
 *
 * **PERCHÉ RIUSA `.expert-chip` E NON UNA FORMA PROPRIA.** È la regola che
 * Pico ha posto sul riquadro insight lo stesso giorno: il vocabolario visivo
 * si riusa, non si duplica. Una pastiglia nuova qui sarebbe stata la seconda
 * lingua di una schermata che ne parla già una.
 *
 * **NON DICE «generata da un modello» PIÙ DI QUANTO LO DICA IL DATO.** Le
 * parole sono quelle della marcatura, derivate dalla costante del contratto
 * (`SCHEDA_NOTA_MARCATURA_PAROLE`) e non riscritte: se un giorno la marcatura
 * cambiasse parola, questa pastiglia cambierebbe con lei invece di restare
 * indietro senza che nessun test se ne accorga.
 *
 * Quando la prosa non è marcata la pastiglia NON esiste: una pastiglia spenta
 * che dice «scritta da una persona» sarebbe un'affermazione che nessuno ha
 * fatto — il contratto non ha un campo per la provenienza umana, e l'assenza
 * di marcatura non è una prova.
 */
export function expertInsightProseMarkHtml(view: ExpertInsightView): string {
  if (!view.notaGenerataDaModello || view.nota === "") return "";
  return `<span class="expert-chip expert-prose__mark" id="player-insight-prose-mark"><b>${escHtml(
    SCHEDA_NOTA_MARCATURA_PAROLE,
  )}</b></span>`;
}

/**
 * La prosa. Esiste anche da sola: una scheda con due righe di testo e nessun
 * segnale è una scheda legittima, e questo blocco la rende per intero.
 * Quando la prosa manca ma i segnali ci sono, il posto della prosa dichiara
 * che è vuoto invece di lasciare una colonna muta.
 */
export function expertInsightProseHtml(view: ExpertInsightView): string {
  const body =
    view.nota === ""
      ? `<p class="expert-prose__empty" id="player-insight-prose-empty">La scheda non porta note scritte: solo i segnali qui accanto.</p>`
      : `<p class="expert-prose__text" id="player-insight-prose">${escHtml(view.nota)}</p>`;
  return `<div class="expert-prose">
    ${expertInsightProseMarkHtml(view)}
    ${body}
    <span class="expert-prose__meta" id="player-insight-meta">${escHtml(expertInsightMetaText(view))}</span>
  </div>`;
}

// ── I quattro stati «non lo so» ──────────────────────────────────────────────

/**
 * Una frase per stato, e sono quattro frasi DIVERSE. «Non ho letto il file»,
 * «la scheda non è scritta», «ce ne sono due e non ne scelgo una» e «la fonte
 * non è attribuibile» portano a decisioni diverse: scriverle allo stesso modo
 * — o non scriverle affatto — farebbe leggere «non lo so» come «non c'è
 * niente di buono da dire su di lui».
 */
export const EXPERT_INSIGHT_EMPTY_TEXT: Readonly<
  Record<Exclude<ExpertInsightAvailability, "available">, string>
> = {
  source_unavailable:
    "Il deposito delle schede non è stato letto: «non lo so» non è «non c'è niente da dire su di lui».",
  no_expert_signal:
    "Deposito letto: per questo giocatore la scheda non è ancora stata scritta. Non è un giudizio sul giocatore.",
  identity_not_resolved:
    "Due schede risultano scritte su questo giocatore: non ne scelgo una. Vanno unite a mano prima dell'asta.",
  author_authority_not_verified:
    "La scheda dichiara una fonte che non è la scheda ufficiale né una risposta di staff: non è attribuibile, quindi non la mostro.",
};

/**
 * `identity_not_resolved` copre DUE situazioni che portano a due gesti diversi,
 * e scriverle allo stesso modo manderebbe Pico a cercare un problema che non ha:
 *
 *  - due schede sotto la STESSA identità — niente da scegliere, vanno unite a
 *    mano nel deposito: è la frase storica qui sopra;
 *  - più schede con NOMI DIVERSI che potrebbero essere sue — c'è eccome da
 *    scegliere, e la tendina è lì sotto: è questa frase.
 *
 * Lo stato resta uno solo perché il vocabolario dei cinque è chiuso e copiato
 * alla lettera dal privato (`EXPERT_INSIGHT_QUALITY_LABELS`): un sesto stato
 * inventato qui aprirebbe una divergenza fra i due repository proprio nel
 * dizionario che deve restare identico.
 */
export const EXPERT_INSIGHT_CHOICE_PENDING_TEXT =
  "Più schede potrebbero essere di questo giocatore, scritte con nomi diversi: la scelta è tua, qui sotto.";

/** La frase dello stato, con la distinzione qui sopra già applicata. */
export function expertInsightEmptyText(view: ExpertInsightView): string {
  if (view.availability === "available") return "";
  if (
    view.availability === "identity_not_resolved" &&
    view.candidates.length > 1 &&
    view.chosenSchedaKey === null
  ) {
    return EXPERT_INSIGHT_CHOICE_PENDING_TEXT;
  }
  return EXPERT_INSIGHT_EMPTY_TEXT[view.availability];
}

// ── L'AGGANCIO: quando la scheda è dedotta, e quando si chiede ───────────────
//
// Due superfici, per due situazioni diverse, e nessuna delle due esiste quando
// l'aggancio è ovvio (nome identico a quello del listone: la stragrande
// maggioranza delle righe, dove questo blocco è stringa vuota e non costa un
// pixel).
//
//  1. LA DICHIARAZIONE. La scheda è UNA sola, ma il nome non era identico —
//     «Rossi» sul listone, «Mario Rossi» sulla scheda. L'aggancio si fa, e si
//     DICE su quale nome la scheda è scritta. Un aggancio dedotto e taciuto è
//     la stessa classe di difetto che questo lavoro è nato per chiudere, a
//     specchio: prima spariva una scheda scritta, qui comparirebbe la scheda di
//     un altro — e in entrambi i casi chi legge non ha modo di accorgersene.
//  2. LA DOMANDA. Le schede candidate sono più d'una: la scelta è di Pico, non
//     dell'app. NESSUNA OPZIONE È PRESELEZIONATA — un `<select>` che parte su un
//     valore verrebbe letto come una risposta già data, e sarebbe l'app a
//     decidere fingendo di chiedere. Finché non sceglie, il riquadro non mostra
//     niente e lo dichiara.
//
// La scelta RESTA CAMBIABILE dopo che è stata data: il `<select>` non sparisce
// una volta agganciata la scheda, si sposta sotto il contenuto. Una risposta
// sbagliata data in due secondi durante un'asta deve costare altri due secondi,
// non un giro nelle impostazioni.

/** Testo dell'opzione vuota. Non è una scelta: è il posto dove non c'è ancora. */
export const SCHEDA_CHOICE_PLACEHOLDER = "Scegli la scheda…";

/**
 * Valore dell'opzione che ANNULLA la scelta. Non può collidere con la chiave di
 * una scheda: `listonePlayerKey` rende solo `[a-z0-9-]*__[a-z0-9-]*` (o
 * `proxy:<id>`, che qui non arriva mai — l'indice del deposito è su nome+
 * squadra), e questo valore contiene un `:` dopo un prefisso alfabetico che
 * quella forma non può produrre.
 */
export const SCHEDA_CHOICE_CLEAR_VALUE = "scheda-choice:nessuna";
export const SCHEDA_CHOICE_CLEAR_LABEL = "Nessuna di queste";

export const SCHEDA_CHOICE_QUESTION = "Più di una scheda potrebbe essere sua. Quale?";
export const SCHEDA_CHOICE_PENDING_NOTE =
  "Finché non scegli, il riquadro non mostra nessuna di queste schede.";
export const SCHEDA_CHOICE_LINKED_NOTE = "Scelta tua: cambiabile qui, e resta al prossimo avvio.";

/** Quando la scelta non si è potuta salvare, il riquadro lo DICE invece di prometterlo. */
export const SCHEDA_CHOICE_NOT_PERSISTED =
  "Scelta valida per questa sessione ma non salvata in locale (spazio del browser pieno o negato): al prossimo avvio la domanda torna.";

/** L'etichetta di un candidato nella tendina: il nome COME SCRITTO sulla scheda. */
export function schedaCandidateLabel(candidate: ExpertSchedaCandidate): string {
  const base = `${candidate.player} — ${candidate.club}`;
  // `count > 1` non è un dettaglio da nascondere: sceglierla lascia comunque due
  // schede sotto la stessa identità, e il riquadro dirà che vanno unite.
  return candidate.count > 1 ? `${base} (${candidate.count} schede)` : base;
}

/**
 * La riga che dichiara un aggancio DEDOTTO. Stringa vuota per l'aggancio
 * ovvio (`exact`) e per la scelta esplicita (`chosen`, che ha già la sua
 * tendina sotto): si scrive solo ciò che chi legge non può vedere da sé.
 */
export function schedaMatchNoteText(view: ExpertInsightView): string {
  if (view.matchedBy !== "contained" || view.matchedPlayer === null) return "";
  return `Scheda scritta su «${view.matchedPlayer}»: agganciata a questa riga perché il nome è contenuto.`;
}

export function schedaMatchNoteHtml(view: ExpertInsightView): string {
  const text = schedaMatchNoteText(view);
  if (text === "") return "";
  return `<p class="expert-match" id="player-insight-match">${escHtml(text)}</p>`;
}

/**
 * La tendina della scelta, o stringa vuota quando non c'è niente da chiedere.
 * `notPersisted` viene da chi conosce l'esito dell'ultima scrittura: questo
 * modulo non tocca lo storage e non lo indovina.
 */
export function schedaChoiceHtml(view: ExpertInsightView, notPersisted = false): string {
  if (view.candidates.length < 2) return "";
  const chosen = view.chosenSchedaKey;
  const options = [
    `<option value="" disabled${chosen === null ? " selected" : ""}>${escHtml(
      SCHEDA_CHOICE_PLACEHOLDER,
    )}</option>`,
    ...view.candidates.map(
      (candidate) =>
        `<option value="${escHtml(candidate.schedaKey)}"${
          candidate.schedaKey === chosen ? " selected" : ""
        }>${escHtml(schedaCandidateLabel(candidate))}</option>`,
    ),
  ];
  // «Nessuna di queste» esiste solo dopo una scelta: prima è già lo stato in cui
  // si è, e un'opzione che non cambia niente è rumore in un momento in cui si
  // legge in due secondi.
  if (chosen !== null) {
    options.push(
      `<option value="${SCHEDA_CHOICE_CLEAR_VALUE}">${escHtml(SCHEDA_CHOICE_CLEAR_LABEL)}</option>`,
    );
  }
  const note = chosen === null ? SCHEDA_CHOICE_PENDING_NOTE : SCHEDA_CHOICE_LINKED_NOTE;
  return `<div class="expert-choice" id="player-insight-choice">
    <label class="expert-choice__label" for="player-insight-choice-select">${escHtml(
      SCHEDA_CHOICE_QUESTION,
    )}</label>
    <select class="expert-choice__select" id="player-insight-choice-select" name="player-insight-choice">${options.join(
      "",
    )}</select>
    <span class="expert-choice__note" id="player-insight-choice-note">${escHtml(note)}</span>${
      notPersisted
        ? `<span class="expert-choice__warn" id="player-insight-choice-warn">${escHtml(
            SCHEDA_CHOICE_NOT_PERSISTED,
          )}</span>`
        : ""
    }
  </div>`;
}

// ── Il corpo del riquadro ────────────────────────────────────────────────────

/**
 * Forma parlata del riquadro, per l'aria-label del pannello.
 *
 * PORTA L'ETICHETTA DI QUALITÀ PER INTERO anche nello stato `available`, dove a
 * schermo non compare più: leggerla non costa una riga a nessuno, e chi
 * naviga a voce non ha la label «Scheda Esperto» in alto a destra a dirgli in
 * un colpo d'occhio che cosa sta ascoltando.
 */
/**
 * Ciò che l'aggancio aggiunge alla forma parlata. Chi naviga a voce non vede né
 * la riga di dichiarazione né la tendina: se la frase non le nomina, per lui la
 * scheda è semplicemente comparsa (o mancata) senza ragione.
 */
export function expertInsightLinkSpoken(view: ExpertInsightView): string {
  const parts: string[] = [];
  const note = schedaMatchNoteText(view);
  if (note !== "") parts.push(note);
  if (view.candidates.length > 1) {
    const chosen = view.candidates.find((c) => c.schedaKey === view.chosenSchedaKey);
    parts.push(
      chosen === undefined
        ? `${SCHEDA_CHOICE_QUESTION} ${view.candidates.map(schedaCandidateLabel).join("; ")}.`
        : `Scheda scelta da te: ${schedaCandidateLabel(chosen)}. ${SCHEDA_CHOICE_LINKED_NOTE}`,
    );
  }
  return parts.join(" ");
}

export function expertInsightSpoken(view: ExpertInsightView): string {
  const label = expertInsightLabel(view).text;
  const link = expertInsightLinkSpoken(view);
  const suffix = link === "" ? "" : ` ${link}`;
  if (view.availability !== "available") {
    return `${label}: ${view.quality}. ${expertInsightEmptyText(view)}${suffix}`;
  }
  const titolarita =
    view.titolarita === null
      ? "titolarità non dichiarata"
      : `titolarità ${TITOLARITA_LABELS[view.titolarita]}${
          view.percentuale === null ? "" : ` al ${Math.round(view.percentuale)} per cento`
        }`;
  const chips = expertInsightChips(view)
    .map((chip) => `${chip.label} ${chip.value}`)
    .join(", ");
  // LA MARCATURA ENTRA NELLA FORMA PARLATA, e prima del testo: chi ascolta il
  // riquadro non vede la pastiglia, e sentire la provenienza DOPO due righe di
  // prosa significa averle già ascoltate come se le avesse scritte una persona.
  const nota =
    view.nota === ""
      ? "nessuna nota scritta"
      : view.notaGenerataDaModello
        ? `${SCHEDA_NOTA_MARCATURA_PAROLE}: ${view.nota}`
        : view.nota;
  // LE ICONE ENTRANO NELLA FORMA PARLATA, e non sono un doppione delle
  // pastiglie qui sopra: portano i NOMI degli altri in ballottaggio e la lista
  // editoriale, che a schermo stanno solo lì. Senza questa riga chi naviga a
  // voce sentirebbe il riquadro intero tranne il dato che le icone aggiungono.
  return `${label}: ${view.quality}. ${titolarita}. ${chips === "" ? "nessun altro segnale" : chips}. ${schedaIconeSpoken(view)} ${nota}. ${pagellaSpoken(view.pagella)} ${expertInsightMetaText(view)}.${suffix}`;
}

/**
 * Il corpo intero: DUE RIQUADRI TITOLATI, AFFIANCATI SU DUE COLONNE su desktop
 * (segnali | note) e impilati sotto i 900px — la stessa soglia a cui
 * `.moment-blocks-grid` smette di affiancare i due pannelli qui sotto, così la
 * schermata cambia forma in un punto solo.
 *
 * LA FORMA È QUELLA DELLE SCHEDE DELLA SCHERMATA DI CHIAMATA (richiesta di
 * Pico, 2026-08-26): titolo in maiuscoletto piccolo, corpo di testo sotto,
 * riquadri affiancati. Non è uno stile nuovo e non è una seconda copia di
 * quello: `.scheda-card`, `.scheda-card__title` e `.scheda-cards` vivono in un
 * posto solo (src/ui/schedaCard.ts, src/styles/schedaCard.css) e li usano sia
 * questo riquadro sia i tre titoli della schermata di chiamata — «GIOCATORE
 * SUGGERITO — CHI CHIAMARE ORA», «PER ME», «PER FAR SPENDERE GLI ALTRI».
 *
 * LE DUE COLONNE ADESSO DICONO IL PROPRIO NOME. Erano due celle mute di una
 * griglia anonima: chi leggeva la colonna di destra doveva dedurre che quelle
 * frasi venissero dalla scheda e non dall'app. Il titolo lo dichiara — ed è
 * l'unica cosa che i due riquadri aggiungono al contenuto, che è identico a
 * quello di prima, pastiglia per pastiglia e riga per riga.
 *
 * NEGLI STATI VUOTI l'etichetta di qualità e la frase stanno nello STESSO
 * paragrafo. Non è compattezza fine a sé stessa: su questa schermata ogni riga
 * costa altezza al pannello successivo, e le due frasi dicono la stessa cosa a
 * due livelli di dettaglio — separarle in due blocchi faceva sembrare il
 * riquadro pieno di testo proprio dove non ha niente da dire.
 *
 * NELLO STATO `available` l'etichetta di qualità NON compare più. Diceva
 * «segnale esperto — descrittivo, non validato», cioè la stessa cosa della
 * label «Scheda Esperto» in alto a destra, una riga più sotto e in corpo
 * minore: due righe che dicono la stessa cosa sono una riga di troppo su
 * questa schermata. Resta nel payload (`view.quality`, verificata dai test del
 * contratto) e resta nella forma parlata del pannello. Negli altri quattro
 * stati continua a comparire, perché lì NON è ridondante: è il nome dello
 * stato, e «fonte non disponibile» e «identità non risolta» sono due cose
 * diverse che la label non distingue.
 */
export function expertInsightBodyHtml(view: ExpertInsightView, notPersisted = false): string {
  // La tendina della scelta sta SOTTO il contenuto in entrambi i rami, e non
  // sopra: quando la scheda è agganciata ciò che conta è la scheda, e la
  // possibilità di cambiare idea è un ripensamento, non il titolo del riquadro.
  const choice = schedaChoiceHtml(view, notPersisted);
  if (view.availability !== "available") {
    return `${schedaMatchNoteHtml(view)}<div class="expert-insight__empty" id="player-insight-empty">
      <p class="expert-insight__empty-text">${expertInsightQualityHtml(view)}<span
        class="expert-insight__empty-sep" aria-hidden="true"> — </span>${escHtml(
          expertInsightEmptyText(view),
        )}</p>
    </div>${choice}`;
  }
  // LA PAGELLA STA SOTTO LA GRIGLIA, a tutta larghezza, e non dentro la
  // colonna visiva. Due ragioni, e nessuna è estetica: l'elenco dei cinque
  // assi accanto al disegno ha bisogno di più larghezza di quanta ne abbia
  // metà pannello a 900px, e i cinque voti sono un REGISTRO DIVERSO da quello
  // sopra — lassù ci sono affermazioni categoriche della scheda, qui c'è una
  // scala numerica della fonte. Sono separati a schermo come sono separati nel
  // contratto (src/pagellaEsperti.ts), e la parola «Titolarità» compare in
  // entrambi i posti proprio per questo con due scritte diverse.
  return `${schedaMatchNoteHtml(view)}<div class="${SCHEDA_CARDS_CLASS}" id="player-insight-cards">${schedaCardHtml(
    {
      title: EXPERT_INSIGHT_SEGNALI_TITLE,
      id: "player-insight-card-segnali",
      bodyClass: "expert-insight__visual",
      bodyHtml: `${titolaritaHtml(view)}${expertInsightChipsHtml(view)}`,
    },
  )}${schedaCardHtml({
    title: EXPERT_INSIGHT_NOTE_TITLE,
    id: "player-insight-card-note",
    bodyHtml: expertInsightProseHtml(view),
  })}</div>${pagellaBlockHtml(view.pagella, schedaIconeHtml(view))}${choice}`;
}

/** L'etichetta di qualità, PORTATA DAL DATO e mai ricostruita dal renderer. */
export function expertInsightQualityHtml(view: ExpertInsightView): string {
  return `<span class="expert-insight__quality" id="player-insight-quality">${escHtml(view.quality)}</span>`;
}

/** Guardia di sviluppo: le etichette coprono esattamente il vocabolario del contratto. */
export const TITOLARITA_LABELS_COVER_VOCABULARY =
  Object.keys(TITOLARITA_LABELS).length === TITOLARITA_VALUES.length &&
  TITOLARITA_VALUES.every((value) => TITOLARITA_LABELS[value] !== undefined);

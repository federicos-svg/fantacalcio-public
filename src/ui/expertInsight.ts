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
// Costruttori di stringhe puri — stesso idioma di warBoard.ts, roleBudgetPlan.ts
// e liveFacts.ts — così tutta la logica di resa è testabile senza DOM. Nessun
// `Date`, nessun `Intl`: la data della scheda si formatta affettando la sua
// stringa ISO, così la stessa scheda rende la stessa riga su ogni macchina.

import type {
  Avviso,
  ExpertInsightAvailability,
  ExpertInsightView,
  Fonte,
  Piazzati,
  Rigori,
  Titolarita,
} from "../expertScheda.js";
import { TITOLARITA_VALUES } from "../expertScheda.js";
import { escHtml } from "./theme.js";

export const EXPERT_INSIGHT_TITLE = "INSIGHT GIOCATORE";

// ── Etichette utente ─────────────────────────────────────────────────────────

export const TITOLARITA_LABELS: Readonly<Record<Titolarita, string>> = {
  riserva: "riserva",
  ballottaggio: "ballottaggio",
  titolare: "titolare",
};

export const RIGORI_LABELS: Readonly<Record<Rigori, string>> = {
  designato: "designato",
  possibile: "possibile",
};

export const PIAZZATI_LABELS: Readonly<Record<Piazzati, string>> = {
  punizioni: "punizioni",
  angoli: "angoli",
};

export const AVVISO_LABELS: Readonly<Record<Avviso, string>> = {
  sconsigliato: "sconsigliato",
  rischio_fisico: "rischio fisico",
  provvisorio: "provvisorio",
  mercato: "mercato",
};

/**
 * L'autorità della fonte in parole, senza dire CHI. «Scheda ufficiale» e
 * «risposta staff» sono attribuzioni non identificanti; l'handle di una
 * persona reale non entra in questo repository e non entra in questa riga.
 */
export const FONTE_LABELS: Readonly<Record<Fonte, string>> = {
  scheda: "scheda ufficiale della squadra",
  staff: "risposta staff",
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
  const facts: string[] = ["Scheda trascritta a mano prima dell'asta dalle fonti del Gruppo Esperti."];
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
    <span class="expert-titolarita__head">TITOLARITÀ</span>${value}${sharePercentHtml(view)}
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
  if (view.rigori !== null) {
    chips.push({
      id: "player-insight-chip-rigori",
      kind: "signal",
      label: "rigori",
      value: RIGORI_LABELS[view.rigori],
    });
  }
  for (const kind of view.piazzati) {
    chips.push({
      id: `player-insight-chip-${kind}`,
      kind: "signal",
      label: "piazzati",
      value: PIAZZATI_LABELS[kind],
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
 * Perché la provenienza sta qui e non in una nota a piè di pannello: «scritta a
 * mano prima dell'asta» è un fatto sulla FRESCHEZZA — dice che questo non è un
 * dato live — e il posto in cui si legge quel fatto è accanto alla data, non
 * tre righe più sotto in corpo minore. Una riga di nota in fondo costava,
 * misurata a 390px, 47px di altezza su una schermata che è già la più lunga
 * dell'app, per dire una cosa che qui sta in cinque parole.
 */
export const EXPERT_INSIGHT_PROVENANCE = "trascritta a mano prima dell'asta";

export function expertInsightMetaText(view: ExpertInsightView): string {
  const fonte = view.fonte === null ? FONTE_NON_DICHIARATA : FONTE_LABELS[view.fonte];
  const data = view.aggiornata === null ? "senza data" : formatSchedaDate(view.aggiornata);
  return `${EXPERT_INSIGHT_PROVENANCE} · ${fonte} · ${data}`;
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

// ── Il corpo del riquadro ────────────────────────────────────────────────────

/**
 * Forma parlata del riquadro, per l'aria-label del pannello.
 *
 * PORTA L'ETICHETTA DI QUALITÀ PER INTERO anche nello stato `available`, dove a
 * schermo non compare più: leggerla non costa una riga a nessuno, e chi
 * naviga a voce non ha la label «Scheda Esperto» in alto a destra a dirgli in
 * un colpo d'occhio che cosa sta ascoltando.
 */
export function expertInsightSpoken(view: ExpertInsightView): string {
  const label = expertInsightLabel(view).text;
  if (view.availability !== "available") {
    return `${label}: ${view.quality}. ${EXPERT_INSIGHT_EMPTY_TEXT[view.availability]}`;
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
  const nota = view.nota === "" ? "nessuna nota scritta" : view.nota;
  return `${label}: ${view.quality}. ${titolarita}. ${chips === "" ? "nessun altro segnale" : chips}. ${nota}. ${expertInsightMetaText(view)}.`;
}

/**
 * Il corpo intero. Due colonne su desktop (visivo | prosa), impilate sotto i
 * 900px — la stessa soglia a cui `.moment-blocks-grid` smette di affiancare i
 * due pannelli qui sotto, così la schermata cambia forma in un punto solo.
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
export function expertInsightBodyHtml(view: ExpertInsightView): string {
  if (view.availability !== "available") {
    return `<div class="expert-insight__empty" id="player-insight-empty">
      <p class="expert-insight__empty-text">${expertInsightQualityHtml(view)}<span
        class="expert-insight__empty-sep" aria-hidden="true"> — </span>${escHtml(
          EXPERT_INSIGHT_EMPTY_TEXT[view.availability],
        )}</p>
    </div>`;
  }
  return `<div class="expert-insight__grid">
    <div class="expert-insight__visual">
      ${titolaritaHtml(view)}
      ${expertInsightChipsHtml(view)}
    </div>
    ${expertInsightProseHtml(view)}
  </div>`;
}

/** L'etichetta di qualità, PORTATA DAL DATO e mai ricostruita dal renderer. */
export function expertInsightQualityHtml(view: ExpertInsightView): string {
  return `<span class="expert-insight__quality" id="player-insight-quality">${escHtml(view.quality)}</span>`;
}

/** Guardia di sviluppo: le etichette coprono esattamente il vocabolario del contratto. */
export const TITOLARITA_LABELS_COVER_VOCABULARY =
  Object.keys(TITOLARITA_LABELS).length === TITOLARITA_VALUES.length &&
  TITOLARITA_VALUES.every((value) => TITOLARITA_LABELS[value] !== undefined);

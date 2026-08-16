// INSIGHT GIOCATORE — costruttori HTML puri del riquadro delle schede
// Gruppo Esperti (contratto e risoluzione: src/expertScheda.ts).
//
// ── PERCHÉ QUESTA FORMA ──────────────────────────────────────────────────────
//
// Il riquadro si legge durante un'asta, con due secondi per decidere, e deve
// reggere DUE REGISTRI insieme:
//
//  1. LO STRATO VISIVO, per il colpo d'occhio. I segnali del Gruppo Esperti
//     sono categorici e ordinati, quindi si disegnano: la titolarità è una
//     scala a tre gradini (riserva -> ballottaggio -> titolare) e viene resa
//     come una SCALA POSIZIONALE, non come un colore. La posizione su un asse
//     è il canale che si legge più in fretta di tutti — più della lunghezza,
//     molto più della tinta — e qui porta l'unica informazione che decide se
//     alzare la mano: «gioca o non gioca». Rigori e calci piazzati sono
//     presenza/assenza e diventano pastiglie; gli avvisi sono pastiglie con un
//     marcatore proprio.
//  2. LA PROSA, per ciò che non si comprime. Il perché di un avviso, una
//     situazione di mercato, una nota di contesto: sono frasi, e comprimerle
//     in un'icona le distruggerebbe. La nota NON è una didascalia sotto le
//     icone — su desktop sta in colonna ACCANTO allo strato visivo, alla sua
//     stessa altezza, con un corpo leggibile; su telefono si impila sotto.
//     È la seconda metà del contenuto, e occupa metà del riquadro.
//
// ── IL COLORE NON PORTA MAI NULLA DA SOLO ────────────────────────────────────
//
// Ogni gradino della scala porta la sua PAROLA («riserva», «ballottaggio»,
// «titolare»); il gradino attivo si distingue per posizione, riempimento,
// maiuscolo e peso, non per tinta. Ogni pastiglia porta la sua parola. Gli
// avvisi hanno in più un marcatore testuale «!». Tutto il testo di questo
// modulo sta sui quattro livelli della rampa di base.css, che e2e/
// text-contrast-aa.spec.ts rimisura a ogni run: nulla qui è sotto 4,5:1, e il
// testo è tutto sotto i 14px, quindi l'eccezione «large text» non si applica
// da nessuna parte.
//
// ── COSA NON C'È, E NON DEVE ARRIVARCI ───────────────────────────────────────
//
// Nessun punteggio, nessuna classifica, nessuna banda di prezzo, nessun
// «conviene»: `value` / `fair_to_me` / `target_band` sono output direttivi
// dietro un gate chiuso (docs/NO_GO.md §Prodotto) e questo riquadro è
// descrittivo per costruzione. I tre fatti di onestà del payload —
// `validated: false`, `directive: false`, `contributesToIndex: false` — sono
// resi a schermo in tutti e cinque gli stati: un flag vero solo nel JSON non lo
// legge nessuno, e chi guarda deve capire in un colpo d'occhio che sta
// leggendo il parere di terzi, non una raccomandazione del sistema.
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

/** La scala, dal gradino più basso al più alto. L'ordine È l'informazione. */
export const TITOLARITA_LADDER: readonly Titolarita[] = ["riserva", "ballottaggio", "titolare"];

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
 * Ogni voce nomina il campo del payload da cui nasce. Se un giorno uno dei tre
 * smettesse di essere `false`, questa riga non potrebbe più essere stampata da
 * un letterale e l'incoerenza uscirebbe allo scoperto invece di restare nel
 * JSON.
 */
export interface ExpertInsightFlag {
  readonly id: string;
  readonly text: string;
  readonly title: string;
}

export function expertInsightFlags(view: ExpertInsightView): readonly ExpertInsightFlag[] {
  const flags: ExpertInsightFlag[] = [];
  flags.push({
    id: "player-insight-flag-source",
    text: "PARERE DI TERZI",
    title:
      "Scheda del Gruppo Esperti trascritta a mano prima dell'asta. È il parere di terzi, non una misura di questa app.",
  });
  if (view.validated === false) {
    flags.push({
      id: "player-insight-flag-validated",
      text: "NON VALIDATO",
      title: "validated: false — nessuno ha verificato questo segnale contro un dato misurato.",
    });
  }
  if (view.directive === false) {
    flags.push({
      id: "player-insight-flag-directive",
      text: "NON È UN CONSIGLIO",
      title: "directive: false — il riquadro descrive, non raccomanda. Nessun prezzo, nessun «conviene».",
    });
  }
  if (view.contributesToIndex === false) {
    flags.push({
      id: "player-insight-flag-index",
      text: "FUORI DAL CALCOLO",
      title: "contributesToIndex: false — questo segnale non modifica nessun numero calcolato dall'app.",
    });
  }
  return flags;
}

export function expertInsightFlagsHtml(view: ExpertInsightView): string {
  return `<span class="expert-flags" id="player-insight-flags">${expertInsightFlags(view)
    .map(
      (flag, i) =>
        `${i === 0 ? "" : `<span class="expert-flags__sep" aria-hidden="true">·</span>`}<span class="expert-flags__item" id="${flag.id}" title="${escHtml(flag.title)}">${escHtml(flag.text)}</span>`,
    )
    .join("")}</span>`;
}

// ── Lo strato visivo ─────────────────────────────────────────────────────────

/**
 * La scala della titolarità: tre gradini nell'ordine, quello dichiarato
 * riempito e in maiuscolo. Gli altri due restano leggibili — servono a dare
 * la scala: «titolare» senza «riserva» accanto non dice quanto in alto sia.
 *
 * Quando la scheda non dichiara la titolarità la scala NON si disegna: tre
 * gradini tutti spenti si leggerebbero come «riserva» a colpo d'occhio. Al suo
 * posto una riga sola che dice che manca.
 */
export function titolaritaLadderHtml(view: ExpertInsightView): string {
  if (view.titolarita === null) {
    return `<div class="expert-ladder expert-ladder--none" id="player-insight-track">
      <span class="expert-ladder__top"><span class="expert-ladder__head">TITOLARITÀ</span><span
        class="expert-ladder__missing" id="player-insight-track-missing">non dichiarata dalla scheda</span></span>
    </div>`;
  }
  const steps = TITOLARITA_LADDER.map((step) => {
    const on = step === view.titolarita;
    return `<span class="expert-ladder__step${on ? " expert-ladder__step--on" : ""}"
      id="player-insight-track-${step}"${on ? ' aria-current="true"' : ""}>${escHtml(
        TITOLARITA_LABELS[step],
      )}</span>`;
  }).join("");
  return `<div class="expert-ladder" id="player-insight-track">
    <span class="expert-ladder__top"><span class="expert-ladder__head">TITOLARITÀ</span>${sharePercentHtml(
      view,
    )}</span>
    <span class="expert-ladder__scale">${steps}</span>
  </div>`;
}

/**
 * La quota del ballottaggio: una barra riempita quanto la percentuale dichiara,
 * col numero SCRITTO accanto. La barra è ridondante col numero, mai al suo
 * posto — una barra senza cifra costringerebbe a stimare a occhio proprio nel
 * momento in cui non c'è tempo.
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

/** Forma parlata del riquadro, per l'aria-label del pannello. */
export function expertInsightSpoken(view: ExpertInsightView): string {
  const flags = expertInsightFlags(view)
    .map((flag) => flag.text.toLowerCase())
    .join(", ");
  if (view.availability !== "available") {
    return `Insight giocatore: ${view.quality}. ${
      EXPERT_INSIGHT_EMPTY_TEXT[view.availability]
    } ${flags}.`;
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
  return `Insight giocatore: ${view.quality}. ${titolarita}. ${chips === "" ? "nessun altro segnale" : chips}. ${nota}. ${expertInsightMetaText(view)}. ${flags}.`;
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
  return `${expertInsightQualityHtml(view)}<div class="expert-insight__grid">
    <div class="expert-insight__visual">
      ${titolaritaLadderHtml(view)}
      ${expertInsightChipsHtml(view)}
    </div>
    ${expertInsightProseHtml(view)}
  </div>`;
}

/** L'etichetta di qualità, sempre visibile e sempre PORTATA DAL DATO. */
export function expertInsightQualityHtml(view: ExpertInsightView): string {
  return `<span class="expert-insight__quality" id="player-insight-quality">${escHtml(view.quality)}</span>`;
}

/** Guardia di sviluppo: la scala copre esattamente il vocabolario del contratto. */
export const TITOLARITA_LADDER_COVERS_VOCABULARY =
  TITOLARITA_LADDER.length === TITOLARITA_VALUES.length &&
  TITOLARITA_VALUES.every((value) => TITOLARITA_LADDER.includes(value));

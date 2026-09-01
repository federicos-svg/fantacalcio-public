// LA SCHEDA — il vocabolario visivo dei riquadri titolati, in un posto solo.
//
// PERCHÉ ESISTE. La schermata di chiamata aveva già la forma che Pico voleva
// vedere anche altrove: un TITOLO IN MAIUSCOLETTO PICCOLO e, sotto, il corpo —
// «GIOCATORE SUGGERITO — CHI CHIAMARE ORA» e «PER FAR SPENDERE GLI ALTRI»
// (src/ui/perMeRow.ts, src/ui/baitRow.ts). Quella forma era scritta TRE VOLTE:
// due regole CSS gemelle (`.per-me__title`, `.bait__title`) e un `style.cssText`
// a mano nell'occhiello del blocco suggerito, con una quarta variante di
// spaziatura. Tre copie non sono uno stile: sono tre cose che divergono al
// primo ritocco, e la prima divergenza c'era già (0.06em contro 0.04em).
//
// COSA STA QUI E COSA NO. Qui stanno i NOMI delle classi e i costruttori; le
// misure stanno in src/styles/schedaCard.css, una volta sola, con la ragione
// scritta accanto. Nessun colore nuovo, nessun corpo nuovo: la scheda usa i
// livelli della rampa di base.css che e2e/text-contrast-aa.spec.ts rimisura a
// ogni run.
//
// LE TRE PARTI, e sono indipendenti — un adottante ne prende quante gliene
// servono:
//   1. `SCHEDA_CARD_TITLE_CLASS` — il titolo. Lo prendono i tre titoli della
//      schermata di chiamata, che stanno già dentro UN riquadro solo e non ne
//      vogliono un secondo attorno;
//   2. `SCHEDA_CARD_CLASS` — il riquadro: contorno, raggio, respiro. Senza
//      riempimento, di proposito — vedi la nota nel CSS;
//   3. `SCHEDA_CARDS_CLASS` — la griglia che li AFFIANCA su due colonne dove
//      c'è larghezza e li impila dove non ce n'è.
//
// Costruttori puri di stringa più un costruttore di DOM: i due mondi che questo
// repository ha già (i moduli `*Html` di expertInsight.ts / warBoard.ts da una
// parte, i `render*` che creano elementi dall'altra) prendono la stessa forma
// senza che nessuno dei due debba convertirsi all'altro.

import { escHtml } from "./theme.js";

/** Il titolo in maiuscoletto piccolo. La parola la porta chi lo usa. */
export const SCHEDA_CARD_TITLE_CLASS = "scheda-card__title";

/**
 * IL SECONDO RANGO, e non un secondo titolo: il modificatore che si applica
 * ACCANTO a `SCHEDA_CARD_TITLE_CLASS` quando il testo non intesta il blocco ma
 * una delle sue metà, sotto un occhiello che le intesta entrambe.
 *
 * PERCHÉ ESISTE (Pico, 2026-08-31). «GIOCATORE SUGGERITO — CHI CHIAMARE ORA»
 * intesta adesso DAVVERO le due metà del blocco suggerito, e «PER ME» e «PER
 * FAR SPENDERE GLI ALTRI» sono i nomi delle due metà. Tre titoli con la stessa
 * identità visiva impilati uno sotto l'altro non dicono chi intesta chi: il
 * rango lo deve portare la FORMA, o l'occhiello resta un titolo fra tre.
 *
 * PERCHÉ QUI E NON IN perMe.css/bait.css. Le due metà lo usano ENTRAMBE. Scritto
 * nei due file sarebbero due copie della stessa forma — esattamente il difetto
 * che questo modulo è nato per chiudere, e che qui era già costato una
 * divergenza (0.06em contro 0.04em).
 */
export const SCHEDA_CARD_SUBTITLE_CLASS = "scheda-card__title--sub";

/** Il riquadro: contorno e respiro attorno a titolo + corpo. */
export const SCHEDA_CARD_CLASS = "scheda-card";

/** La griglia che affianca i riquadri su due colonne. */
export const SCHEDA_CARDS_CLASS = "scheda-cards";

/**
 * Il titolo come elemento del DOM. `tag` è un parametro perché i tre adottanti
 * della schermata di chiamata non sono d'accordo, e hanno ragione tutti:
 * PER ME e PER FAR SPENDERE GLI ALTRI intitolano una `<section>` con
 * `aria-labelledby` e sono `<h3>`, l'occhiello del blocco suggerito intitola
 * `<section id="suggested-player">`, che CONTIENE quelle due, ed è quindi un
 * `<h2>` — un livello sopra, non lo stesso. Forzarli allo stesso tag
 * appiattirebbe una gerarchia vera in un dettaglio di stile, e chi naviga per
 * intestazioni si troverebbe tre titoli pari dove ce n'è uno che ne intesta due.
 *
 * `subtitle` è il RANGO VISIVO, e viaggia insieme al tag per un motivo: i due
 * `<h3>` delle metà devono LEGGERSI come subordinati all'occhiello, non solo
 * esserlo nell'albero del documento. Vedi `SCHEDA_CARD_SUBTITLE_CLASS`.
 */
export function renderSchedaCardTitle(
  text: string,
  options: {
    readonly id?: string;
    readonly tag?: "h2" | "h3" | "div";
    readonly subtitle?: boolean;
  } = {},
): HTMLElement {
  const el = document.createElement(options.tag ?? "h3");
  el.className =
    options.subtitle === true
      ? `${SCHEDA_CARD_TITLE_CLASS} ${SCHEDA_CARD_SUBTITLE_CLASS}`
      : SCHEDA_CARD_TITLE_CLASS;
  if (options.id !== undefined) el.id = options.id;
  el.textContent = text;
  return el;
}

/** Il titolo come stringa, per i costruttori che rendono HTML. */
export function schedaCardTitleHtml(text: string, id?: string): string {
  const idAttr = id === undefined ? "" : ` id="${id}"`;
  return `<h3 class="${SCHEDA_CARD_TITLE_CLASS}"${idAttr}>${escHtml(text)}</h3>`;
}

export interface SchedaCardHtmlProps {
  /** La parola del titolo, in maiuscoletto piccolo. */
  readonly title: string;
  /** L'id del riquadro. Il titolo prende `${id}-title`, che lo etichetta. */
  readonly id: string;
  /** Il corpo, già reso: questo modulo non sa che cosa ci sia dentro. */
  readonly bodyHtml: string;
  /**
   * Il corpo ha bisogno di una propria griglia? Allora lo si avvolge in un
   * contenitore con questa classe. Senza, il corpo entra COME FIGLIO del
   * riquadro — che è già una griglia — e non nasce un `<div>` che non serve a
   * nessuno solo per avere un guscio.
   */
  readonly bodyClass?: string;
}

/**
 * Un riquadro intero: titolo sopra, corpo sotto, dentro il contorno.
 *
 * `aria-labelledby` e non `aria-label`: il nome accessibile è LO STESSO testo
 * che si vede, quindi non può divergere da quello a schermo — la classe di
 * difetto che questo repository ha già pagato altrove.
 */
export function schedaCardHtml(props: SchedaCardHtmlProps): string {
  const titleId = `${props.id}-title`;
  const body =
    props.bodyClass === undefined
      ? props.bodyHtml
      : `<div class="${props.bodyClass}">${props.bodyHtml}</div>`;
  return `<section class="${SCHEDA_CARD_CLASS}" id="${props.id}" aria-labelledby="${titleId}">${schedaCardTitleHtml(
    props.title,
    titleId,
  )}${body}</section>`;
}

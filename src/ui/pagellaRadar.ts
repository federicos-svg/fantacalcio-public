// IL RADAR DELLA PAGELLA — costruttori HTML/SVG puri per i cinque voti su 10
// del Gruppo Esperti (contratto: src/pagellaEsperti.ts).
//
// ── DOVE STA, E PERCHÉ LÌ ────────────────────────────────────────────────────
//
// Dentro il riquadro INSIGHT GIOCATORE della schermata d'asta, cioè nella
// scheda del giocatore chiamato. Quel riquadro sta SOTTO il gesto principale
// («ASSEGNA A»), e non per caso: e2e/asta-gesto-principale.spec.ts asserisce
// che ogni pannello della vista d'asta cominci sotto il titolo del gesto,
// così un riquadro nuovo — questo — non può spingerlo fuori dallo schermo
// quale che sia la sua altezza. La misura del budget (560px) è comunque
// rifatta in e2e/pagella-radar.spec.ts col radar acceso: l'argomento
// strutturale vale, ma si verifica lo stesso.
//
// ── PERCHÉ LE ETICHETTE NON SONO DENTRO L'SVG ────────────────────────────────
//
// Un radar disegna di solito il nome dell'asse al vertice. Qui no, e le
// ragioni sono due, entrambe misurabili:
//
//  1. `<text>` in SVG NON VA A CAPO. «Porta inviolata» e «Consiglio Esperti»
//     al vertice di un pentagono da 120px o si troncano o allargano il
//     riquadro oltre la colonna che lo contiene — e la spec del gesto
//     asserisce che la schermata non guadagni scorrimento orizzontale.
//  2. Ogni asse porta più della propria etichetta: il quarto dichiara di
//     dipendere dal ruolo, il quinto dichiara di essere un parere. Al vertice
//     di un pentagono quei marcatori non ci stanno, e senza di loro il disegno
//     direbbe meno del contratto.
//
// Quindi: l'SVG porta SOLO GEOMETRIA ed è `aria-hidden`; i cinque assi sono un
// ELENCO HTML accanto, con etichetta, voto e marcatori. L'elenco è il dato, il
// disegno è la forma — e chi naviga a voce non perde niente, perché non c'è
// niente nel disegno che non sia scritto nell'elenco.
//
// Come effetto secondario tutto il testo di questo modulo è testo HTML normale
// sulla rampa di base.css: e2e/text-contrast-aa.spec.ts lo misura con la
// spazzata che già usa per il resto dell'app, senza che nessuno debba fidarsi
// del fatto che `fill` e `color` di un `<text>` dicano la stessa cosa.
//
// ── COSA DISEGNA, E COSA SI RIFIUTA DI DISEGNARE ─────────────────────────────
//
//  - NESSUN VOTO (oggi: sempre) -> nessun disegno. Una riga sola che dice che
//    i voti non sono ancora estratti. Un pentagono vuoto su ogni giocatore
//    costerebbe ~130px di schermata per dire «non lo so» in modo decorativo.
//  - PAGELLA PARZIALE -> i punti degli assi che ci sono, e NIENTE POLIGONO. Un
//    poligono con un vertice mancante lo disegnerebbe al centro, cioè come uno
//    ZERO: la forma direbbe «pessimo» dove il dato dice «non lo so». È lo
//    stesso difetto che l'assenza-come-zero produce nei numeri, in geometria.
//  - PAGELLA COMPLETA -> il poligono pieno, più i cinque punti.
//
// Il quarto raggio è TRATTEGGIATO in tutti e tre i casi: è il segno che quello
// asse non è lo stesso asse per due giocatori di ruolo diverso. Non porta
// informazione da solo — l'elenco lo dice a parole — ma rende la differenza
// visibile nel disegno invece che solo nella didascalia.

import {
  PAGELLA_ASSI,
  PAGELLA_ETICHETTE,
  PAGELLA_VOTO_MAX,
  PAGELLA_TOTALE_MAX,
  type PagellaAsseView,
  type PagellaView,
  pagellaVotoText,
} from "../pagellaEsperti.js";
import { escHtml } from "./theme.js";

export const PAGELLA_TITLE = "PAGELLA GRUPPO ESPERTI";
export const PAGELLA_SCALE_CAPTION = `cinque voti su ${PAGELLA_VOTO_MAX} — parole e numeri della fonte`;

// ── Geometria ────────────────────────────────────────────────────────────────

/** Lato del riquadro di disegno, in unità di `viewBox`. */
export const RADAR_VIEWBOX = 100;
const RADAR_CENTER = RADAR_VIEWBOX / 2;
/** Raggio del fondo scala (voto 10). Il resto del riquadro è aria attorno. */
const RADAR_RADIUS = 40;

export interface RadarPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Il punto dell'asse `index` a `ratio` del fondo scala. L'asse 0 sta IN ALTO e
 * si gira in senso orario: è la convenzione che la didascalia dichiara, ed è
 * ciò che lega l'elenco al disegno senza scrivere numeri sui vertici.
 *
 * Arrotondato a due decimali perché la stessa pagella produca la stessa
 * stringa su ogni macchina: questo modulo è testato confrontando HTML.
 */
export function radarPoint(index: number, ratio: number): RadarPoint {
  const angle = ((-90 + index * (360 / PAGELLA_ASSI)) * Math.PI) / 180;
  const r = RADAR_RADIUS * ratio;
  return {
    x: Math.round((RADAR_CENTER + r * Math.cos(angle)) * 100) / 100,
    y: Math.round((RADAR_CENTER + r * Math.sin(angle)) * 100) / 100,
  };
}

function polygonPoints(ratios: readonly number[]): string {
  return ratios
    .map((ratio, index) => {
      const p = radarPoint(index, ratio);
      return `${p.x},${p.y}`;
    })
    .join(" ");
}

/** Un anello della griglia: il pentagono a `ratio` del fondo scala. */
function ringPoints(ratio: number): string {
  return polygonPoints(Array.from({ length: PAGELLA_ASSI }, () => ratio));
}

/**
 * Il disegno. `aria-hidden` per costruzione: tutto ciò che dice è già
 * nell'elenco accanto, e un albero SVG letto a voce sarebbe rumore.
 */
export function pagellaRadarSvgHtml(view: PagellaView): string {
  const grid = [1, 0.5]
    .map(
      (ratio) =>
        `<polygon class="pagella-radar__ring" points="${ringPoints(ratio)}"></polygon>`,
    )
    .join("");

  const spokes = view.assi
    .map((asse, index) => {
      const p = radarPoint(index, 1);
      const dashed = asse.dipendeDalRuolo ? " pagella-radar__spoke--role" : "";
      return `<line class="pagella-radar__spoke${dashed}" x1="${RADAR_CENTER}" y1="${RADAR_CENTER}" x2="${p.x}" y2="${p.y}"></line>`;
    })
    .join("");

  // Il poligono ESISTE SOLO SU UNA PAGELLA COMPLETA: vedi l'intestazione.
  const shape = view.completa
    ? `<polygon class="pagella-radar__shape" points="${polygonPoints(
        view.assi.map((asse) => (asse.voto ?? 0) / PAGELLA_VOTO_MAX),
      )}"></polygon>`
    : "";

  const dots = view.assi
    .map((asse, index) => {
      if (asse.voto === null) return "";
      const p = radarPoint(index, asse.voto / PAGELLA_VOTO_MAX);
      return `<circle class="pagella-radar__dot" cx="${p.x}" cy="${p.y}" r="2.6"></circle>`;
    })
    .join("");

  return `<svg class="pagella-radar" id="player-insight-radar" viewBox="0 0 ${RADAR_VIEWBOX} ${RADAR_VIEWBOX}" role="presentation" aria-hidden="true" focusable="false">${grid}${spokes}${shape}${dots}</svg>`;
}

// ── L'elenco dei cinque assi ─────────────────────────────────────────────────

/** Il marcatore di un asse, o `""`. È TESTO: non c'è nessun colore che porti da solo un fatto. */
export function pagellaAxisMarker(asse: PagellaAsseView): string {
  if (asse.dipendeDalRuolo) return "asse di ruolo";
  if (asse.parere) return "parere della fonte";
  return "";
}

/**
 * UN ASSE: l'etichetta sopra, il voto sotto, incolonnati e centrati.
 *
 * Erano una riga sola — numero d'ordine, etichetta, voto allineato a destra, e
 * sotto un marcatore — e i cinque assi si impilavano uno sull'altro. Ora i
 * cinque stanno FIANCO A FIANCO (`.pagella__assi`), quindi ogni asse è una
 * colonnina: etichetta, voto. Richiesta di Pico, 2026-08-29.
 *
 * TRE COSE SONO SPARITE DA QUI, e nessuna era un fatto che si perde:
 *
 * - il numero d'ordine (`pagella-asse__pos`) era `aria-hidden`, cioè già
 *   dichiarato decorativo: l'ordine lo porta la posizione, e con cinque
 *   colonne affiancate lo porta anche meglio di prima;
 * - il marcatore (`pagella-asse__marker`) — «asse di ruolo», «parere della
 *   fonte» — non sparisce dal prodotto: `pagellaSpoken()` continua a dirlo a
 *   chi naviga a voce, ed è l'unica superficie in cui quel testo era davvero
 *   necessario. `pagellaAxisMarker()` resta viva e testata per quella via;
 * - la didascalia della scala (`pagella__scale`) stava nell'intestazione del
 *   blocco, non qui.
 *
 * `index` non serve più a niente e non è più un parametro: tenerlo avrebbe
 * lasciato ai chiamanti l'impressione che l'ordine passi da loro.
 */
export function pagellaAxisRowHtml(asse: PagellaAsseView): string {
  const id = asse.asse === null ? "player-insight-pagella-quarto" : `player-insight-${asse.asse.replace(/_/g, "-")}`;
  const missing = asse.voto === null ? " pagella-asse--missing" : "";
  return `<li class="pagella-asse${missing}" id="${id}">
    <em class="pagella-asse__label">${escHtml(asse.etichetta)}</em>
    <b class="pagella-asse__voto">${escHtml(pagellaVotoText(asse.voto, asse.stato))}</b>
  </li>`;
}

// ── Il totale, e la verifica che può smentirci ───────────────────────────────

/**
 * La riga del totale, in parole, per ciascuno dei cinque esiti della verifica.
 *
 * `divergente` MOSTRA LA NOSTRA SOMMA. Fino al 2026-08-29 portava entrambi i
 * numeri e accusava l'estrazione di aver letto male: era la lettura giusta
 * finché una riga con la somma che non torna veniva SCARTATA in blocco
 * dall'estrattore, cioè finché una divergenza a schermo poteva solo essere
 * colpa nostra. Non è più così, ed è quella scoperta a cambiare questa frase:
 * la fonte scrive schede in cui i cinque voti sono giusti e il TOTALE no — la
 * forma è «8/10 + 8/10 + 7/10 + 6/10 + 7/10» con «TOTALE 35/50» scritto
 * accanto, dove la somma fa 36 — e diciannove righe su un corpus di 487
 * arrivavano a schermo con cinque «n/d», cioè come se la scheda non avesse
 * voti. I numeri di questo esempio sono inventati e la misura sta nel
 * repository privato, dove le schede vere possono essere nominate: qui no.
 *
 * Decisione di Pico, 2026-08-29, alla lettera: «mostra i voti e rifai tu la
 * somma». Quindi la riga dice la NOSTRA somma, che è l'unico numero di cui
 * rispondiamo, e non ripete quello della fonte.
 *
 * NIENTE È STATO CANCELLATO, e conta: `totaleFonte` resta nel contratto e nel
 * deposito esattamente come la fonte l'ha scritto, `verificaTotale` continua a
 * chiamare `divergente` questo caso, e la nota sotto il listone continua a
 * contare quante righe ne soffrono. Il giorno in cui si volesse rimettere
 * l'accusa a schermo, il dato per farlo è ancora tutto qui.
 */
export function pagellaTotaleText(view: PagellaView): string {
  const somma = view.totaleRicalcolato;
  const fonte = view.totaleFonte;
  switch (view.verificaTotale) {
    case "coerente":
      return `TOTALE ${somma}/${PAGELLA_TOTALE_MAX} — somma dei cinque voti, e coincide con il TOTALE scritto sulla scheda.`;
    case "divergente":
      return `TOTALE ${somma}/${PAGELLA_TOTALE_MAX} — somma dei cinque voti.`;
    case "non_verificabile":
      return `TOTALE non verificabile: ${view.votiPresenti} voti su ${PAGELLA_ASSI}. La scheda dichiara ${fonte}/${PAGELLA_TOTALE_MAX}, ma con dei voti mancanti la somma non lo conferma né lo smentisce.`;
    case "senza_totale_dichiarato":
      return somma === null
        ? `TOTALE non calcolabile: ${view.votiPresenti} voti su ${PAGELLA_ASSI}. Una somma parziale scritta «/${PAGELLA_TOTALE_MAX}» sarebbe un numero falso che sembra vero.`
        : `TOTALE ${somma}/${PAGELLA_TOTALE_MAX} — somma dei cinque voti; la scheda non scrive un TOTALE con cui confrontarla.`;
    case "nessun_voto":
      return `TOTALE non calcolabile: nessuno dei ${PAGELLA_ASSI} voti è stato estratto.`;
  }
}

/** La riga che dichiara un asse di ruolo sbagliato, o `""` quando non c'è niente da dichiarare. */
export function pagellaAxisMismatchText(view: PagellaView): string {
  if (!view.asseIncoerente || view.asseDichiarato === null || view.asseAtteso === null) return "";
  return `La scheda porta il voto «${PAGELLA_ETICHETTE[view.asseDichiarato]}», che è l'asse di un altro ruolo: per questa riga il quarto asse è «${PAGELLA_ETICHETTE[view.asseAtteso]}». Il voto non è stato usato né sommato.`;
}

// ── Le due frasi di didascalia ───────────────────────────────────────────────

/** Lega l'elenco al disegno. Senza questa frase il pentagono non si sa leggere. */
export const PAGELLA_ORDER_NOTE = `Il radar parte in alto e gira in senso orario, nell'ordine dell'elenco; il raggio tratteggiato è il quarto asse.`;

/**
 * Le due cose che il contratto dichiara e che il disegno da solo non può dire.
 * Sono UNA riga, non due paragrafi: questa schermata è la più lunga dell'app.
 */
export const PAGELLA_CAVEAT_NOTE = `Il quarto asse cambia col ruolo (portieri: porta inviolata; movimento: bonus) e non confronta due ruoli diversi. «Consiglio Esperti» è un parere della fonte, non una misura: come tutto questo riquadro, non entra in nessun calcolo dell'app.`;

/** Quando non c'è nemmeno un voto — cioè oggi, su ogni giocatore. */
export const PAGELLA_EMPTY_TEXT = `Nessuno dei cinque voti su ${PAGELLA_VOTO_MAX} è stato estratto da questa scheda: il radar non ha niente da disegnare. Non è un giudizio sul giocatore, e non è uno zero.`;

// ── Il blocco intero ─────────────────────────────────────────────────────────

/**
 * Il blocco, o STRINGA VUOTA quando non c'è nemmeno la scheda.
 *
 * Chi chiama passa la vista solo negli stati in cui una scheda esiste davvero:
 * negli altri quattro il riquadro ha già la propria frase, e un secondo
 * «non lo so» sotto il primo non aggiunge niente e costa due righe.
 *
 * `iconeHtml` è la STRISCIA DELLE ICONE della scheda (src/ui/schedaIcone.ts),
 * che questo modulo riceve già costruita e non sa costruire: le icone leggono
 * la scheda intera — rigori, piazzati, titolarità, liste — mentre qui dentro
 * arriva la sola pagella, e passare l'una dentro l'altra avrebbe legato il
 * radar a un contratto che non è il suo. Sta nella COLONNA DEL DISEGNO, sotto
 * il radar quando c'è un radar e al suo posto quando non c'è: è la sola parte
 * di questo blocco che ha qualcosa da dire anche quando i cinque voti non
 * esistono, cioè oggi, su ogni giocatore. Il perché di quella colonna, con le
 * misure, sta nell'intestazione di schedaIcone.ts.
 */
export function pagellaBlockHtml(view: PagellaView, iconeHtml = ""): string {
  // La didascalia della scala («cinque voti su 10 — parole e numeri della
  // fonte») è stata tolta dall'intestazione su richiesta di Pico, 2026-08-29.
  // Il «/10» resta scritto su OGNI voto (`pagellaVotoText`), quindi la scala si
  // legge dove serve invece che una volta in cima; e `PAGELLA_SCALE_CAPTION`
  // resta esportata perché è la frase che dichiara la provenienza dei numeri.
  const head = `<div class="pagella__head">
    <span class="pagella__title">${escHtml(PAGELLA_TITLE)}</span>
  </div>`;

  const mismatch = pagellaAxisMismatchText(view);
  const mismatchHtml =
    mismatch === ""
      ? ""
      : `<p class="pagella__mismatch" id="player-insight-pagella-mismatch">${escHtml(mismatch)}</p>`;

  if (view.votiPresenti === 0) {
    // Senza icone il blocco resta esattamente com'era: una frase a tutta
    // larghezza. La colonna esiste solo quando c'è qualcosa da metterci —
    // una colonna vuota stringerebbe la frase per niente.
    const corpo =
      iconeHtml === ""
        ? `<p class="pagella__empty" id="player-insight-pagella-empty">${escHtml(
            PAGELLA_EMPTY_TEXT,
          )}</p>
      ${mismatchHtml}`
        : `<div class="pagella__body">
        <div class="pagella__figure">${iconeHtml}</div>
        <div class="pagella__side">
          <p class="pagella__empty" id="player-insight-pagella-empty">${escHtml(
            PAGELLA_EMPTY_TEXT,
          )}</p>
          ${mismatchHtml}
        </div>
      </div>`;
    return `<section class="pagella pagella--empty" id="player-insight-pagella">
      ${head}
      ${corpo}
    </section>`;
  }

  const rows = view.assi.map((asse) => pagellaAxisRowHtml(asse)).join("");

  // LA FORMA DEL CORPO È CAMBIATA, e il perché sta qui invece che nel CSS.
  //
  // Richiesta di Pico, 2026-08-29, con l'immagine di come deve venire: la
  // striscia delle icone a sinistra, i cinque assi che occupano tutta la riga
  // alla sua destra, e IL TOTALE CENTRATO SOTTO, a tutta larghezza. Il totale
  // era incolonnato sotto gli assi dentro `.pagella__side`, cioè largo quanto
  // la sola colonna di destra; per stare sotto TUTTE E DUE le colonne deve
  // essere figlio del corpo, non della colonna. `.pagella__side` non serve più
  // qui e sparisce da questo ramo: resta nel ramo senza voti, dove una colonna
  // di testo accanto alle icone c'è ancora.
  //
  // Il radar e la nota restano SCRITTI nel documento e nascosti dal CSS
  // (`#player-insight-radar`, `.pagella__note` in asta.css): stessa richiesta,
  // stesso giorno. Non si cancella niente — `pagellaRadarSvgHtml` continua a
  // disegnare il pentagono e le due didascalie restano esportate e provate —
  // così il giorno in cui tornano a schermo basta togliere due regole di stile.
  return `<section class="pagella" id="player-insight-pagella">
    ${head}
    <div class="pagella__body">
      <div class="pagella__figure">${pagellaRadarSvgHtml(view)}${iconeHtml}</div>
      <ol class="pagella__assi" id="player-insight-pagella-assi">${rows}</ol>
      <p class="pagella__totale pagella__totale--${view.verificaTotale}" id="player-insight-pagella-totale">${escHtml(
        pagellaTotaleText(view),
      )}</p>
      ${mismatchHtml}
      <p class="pagella__note" id="player-insight-pagella-note">${escHtml(
        `${PAGELLA_ORDER_NOTE} ${PAGELLA_CAVEAT_NOTE}`,
      )}</p>
    </div>
  </section>`;
}

/**
 * La forma parlata. Chi naviga a voce non vede il disegno — ma non gli manca
 * niente, perché il disegno non porta nessun fatto che l'elenco non porti.
 */
export function pagellaSpoken(view: PagellaView): string {
  if (view.votiPresenti === 0) {
    const mismatch = pagellaAxisMismatchText(view);
    return `${PAGELLA_TITLE}: ${PAGELLA_EMPTY_TEXT}${mismatch === "" ? "" : ` ${mismatch}`}`;
  }
  const assi = view.assi
    .map((asse) => {
      const marker = pagellaAxisMarker(asse);
      return `${asse.etichetta} ${pagellaVotoText(asse.voto, asse.stato)}${
        marker === "" ? "" : ` (${marker})`
      }`;
    })
    .join("; ");
  const mismatch = pagellaAxisMismatchText(view);
  return `${PAGELLA_TITLE}: ${assi}. ${pagellaTotaleText(view)}${
    mismatch === "" ? "" : ` ${mismatch}`
  } ${PAGELLA_CAVEAT_NOTE}`;
}

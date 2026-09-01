// PER ME — le parole e la riga cliccabile della prima metà del blocco
// «giocatore suggerito».
//
// L'altra metà del paio di src/perMeCandidates.ts: là il calcolo puro, qui la
// forma. Stesso taglio di ./baitRow.ts, ./tierBand.ts e ./liveFacts.ts — ogni
// stringa nasce da una funzione pura ed è coperta da test, così anche la COPIA
// è falsificabile e non solo i numeri.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA RIGA È UN CONSIGLIO, NON UNA LETTURA — Pico, 2026-08-31
// ─────────────────────────────────────────────────────────────────────────────
//
// «Quello che voglio nelle due feature è un giocatore soltanto con Nome, ruolo
// e squadra. Non devo usarle per leggere ma come consiglio.» La riga porta
// quindi TRE COSE E NIENT'ALTRO: nome, ruolo, squadra. Sono spariti da qui `V`
// con la sua targa, il prezzo atteso coi tre qualificatori, il surplus, il
// costo per vincerlo adesso, i due conteggi di scarsità, l'appetibilità, la
// scomposizione dell'ancora, l'allocazione del piano, il max bid e il
// marcatore «⚑ adesso».
//
// I NUMERI NON SONO SPARITI DAL PRODOTTO, SONO SPARITI DA QUI. Restano dove sta
// l'azione — la schermata di chiamata che si arma cliccando il suggerito — e
// sono a UN CLIC di distanza, che è tutta la ragione per cui questa
// semplificazione non perde il fatto: `selectListonePlayer()` resta l'unica via
// che arma la CTA «Avvia».
//
// IL MOTORE NON È STATO TOCCATO, ed è il punto: `creditValue`, `expectedPrice`,
// `dynamicPlan`, `priceHistory`, `cliff` e src/perMeCandidates.ts continuano a
// calcolare tutto ciò che calcolavano — popolazione, cancelli, ordine, motivi.
// Con UNA riga sola (`rowsMax` 1, ratificato da Pico il 2026-08-31) quella
// scelta conta più di prima, non meno: è cambiato solo che cosa la vista
// disegna di ciò che il motore ha già deciso.
//
// LA NOTA NON C'È PIÙ, DEL TUTTO — Pico, 2026-08-31. Era già asciugata a due
// cose (targa della provenienza e parametri dichiarati) e pesava comunque 92 px
// contro i 34 della riga che annotava: messo davanti alla misura, Pico ha
// scelto «via del tutto». `perMeNoteText` e `#per-me-note` non esistono più.
// I DATI CHE LA NOTA LEGGEVA NON SE NE VANNO CON LEI: `PerMeReading.
// ratification`, `PER_ME_UNRATIFIED_CHOICES`, `withoutValue`, `withoutSurplus`,
// `withoutAppealPosition`, `parameters` e l'etichetta del piano restano nel
// modello e pinnati dai test del motore e di src/perMeCandidates.test.ts.
// Sparisce la vista, non il dato.
//
// QUELLO CHE RESTA, E NON PER INERZIA:
//  - I MOTIVI DEL SILENZIO. Sette frasi chiuse, e NON sono la nota: `#per-me-empty`
//    coi suoi sette `data-reason` è un altro elemento con un altro compito. Un
//    pannello che non ha un consiglio da dare deve dire PERCHÉ, altrimenti «non
//    lo so» e «non c'è nessuno» diventano la stessa cosa a schermo.
//  - IL NOME ACCESSIBILE. Il titolo resta nel DOM fuori dalla vista: è lui a
//    dare il nome a `#per-me-block` via `aria-labelledby`.
//
// LA SELEZIONE SI VEDE SU DUE CANALI, mai solo col colore: la riga selezionata
// porta un CONTORNO e la parola «✓ selezionato», oltre al fondo diverso.

import type {
  PerMeCandidate,
  PerMeEmptyReason,
  PerMeReading,
} from "../perMeCandidates.js";
import { perMeShownCandidates } from "../perMeCandidates.js";
import type { ListonePlayer } from "./listone.js";
import { renderSchedaCardTitle } from "./schedaCard.js";

/** Il NOME del sottoblocco. Nomina il contenuto, non l'intenzione. */
export const PER_ME_TITLE_SHORT = "PER ME";

/**
 * L'occhiello per esteso: il nome più ciò che le righe SONO, nell'ordine in cui
 * i criteri le ordinano. `PER_ME_TITLE_SHORT` è un prefisso letterale per
 * costruzione (il secondo è interpolato dal primo), e un test lo verifica: i
 * due non possono diventare due nomi diversi.
 */
export const PER_ME_TITLE = `${PER_ME_TITLE_SHORT} — liberi nel piano, che puoi pagare al prezzo atteso, per surplus e scarsità`;

/**
 * Quale dei due va a schermo. Stessa regola — e stessa misura — di
 * `baitTitleFor`: la seconda metà dell'occhiello descrive CHE COSA SONO LE
 * RIGHE, e senza righe non c'è niente da descrivere.
 */
export function perMeTitleFor(reading: PerMeReading): string {
  return reading.kind === "candidates" ? PER_ME_TITLE : PER_ME_TITLE_SHORT;
}

/** Il secondo canale della selezione, oltre al contorno: una parola. */
export const PER_ME_SELECTED_MARK = "✓ selezionato";

/**
 * QUANDO NON COMPARE, DICE QUALE SILENZIO È. Vocabolario CHIUSO di sette
 * motivi, sul modello di `baitEmptyText`: sette frasi diverse, perché sono
 * sette cose diverse, e appiattirle sarebbe già mezza bugia.
 *
 * NESSUNA DI QUESTE FRASI INVENTA UN NUMERO e nessuna dice «non c'è nessuno»
 * quando la verità è «non lo so». Le tre del piano dichiarato non ci sono più:
 * il piano dinamico esiste sempre dove esistono `V` e `P̂`, e una dichiarazione
 * rotta si dice nella nota mentre il dinamico lavora — mai un pannello vuoto.
 *
 * LE FRASI STANNO DENTRO LA LORO RIGA DEL MASTRO, e non è un vezzo: questo
 * blocco ha un'allocazione verticale misurata (`giocatore-suggerito`,
 * src/ui/callScreenBudget.ts) e una frase più lunga la sfonda —
 * e2e/call-screen-budget.spec.ts lo ha già dimostrato una volta.
 */
export function perMeEmptyText(reason: PerMeEmptyReason): string {
  switch (reason) {
    case "no-pool":
      return "Nessun listone caricato: senza righe non c'è una popolazione da guardare.";
    case "no-quotation":
      return "Nessuna riga del listone porta la Qt.A: senza quotazione non esiste un'ancora da misurare, e un'ancora inventata non è un'ancora.";
    case "anchors-refused":
      return "Le quotazioni caricate non passano la validazione del motore: da un listino rotto non si deriva nessuna ancora.";
    case "no-forecast":
      return "Deposito assente o monco: senza le previsioni servite o senza storico d'asta non si formano né V né il prezzo atteso, e nessuno dei due si inventa.";
    case "no-open-role":
      return "Nessun reparto aperto con margine: un acquisto non sarebbe registrabile in nessun ruolo.";
    case "no-free-in-open-roles":
      return "Nessun libero con quotazione nei reparti che ti restano aperti.";
    case "no-affordable":
      return "Ci sono liberi con V nei tuoi reparti aperti, ma il tuo max bid non copre il prezzo atteso di nessuno.";
  }
}

/** «Nome (A · Inter)» — chi è, in una riga. */
export function perMeHeadText(candidate: PerMeCandidate): string {
  return `${candidate.player.name} (${candidate.role} · ${candidate.player.club})`;
}

/**
 * TUTTO il testo del sottoblocco, in una stringa. Esiste per essere passato
 * alla guardia di deriva: una regex su questa stringa copre titolo, motivi e
 * teste insieme, invece di tre asserzioni che si dimenticano la quarta.
 * Riproduce SOLO ciò che il sottoblocco RENDE davvero — una guardia che
 * leggesse testo non renderizzato sorveglierebbe un'altra pagina.
 *
 * È PIÙ CORTO DI IERI PERCHÉ LA PAGINA LO È, non perché la guardia guardi
 * meno: la riga porta nome, ruolo e squadra, la nota non si stampa più (Pico,
 * 2026-08-31), e non c'è altro testo reso da sorvegliare.
 *
 * IL TITOLO RESTA IN QUESTA STRINGA anche da quando non si disegna più (Pico,
 * 2026-08-31): non è testo non renderizzato, è testo reso fuori dalla vista e
 * dentro l'albero di accessibilità — è il nome che chi naviga a voce sente
 * entrando nel sottoblocco.
 */
export function perMeSectionText(reading: PerMeReading): string {
  const out: string[] = [perMeTitleFor(reading)];
  if (reading.kind === "empty") {
    out.push(perMeEmptyText(reading.reason));
    return out.join("\n");
  }
  for (const candidate of perMeShownCandidates(reading)) {
    out.push(perMeHeadText(candidate));
  }
  return out.join("\n");
}

// ─── La riga a schermo ───────────────────────────────────────────────────────

export interface PerMeSectionProps {
  readonly reading: PerMeReading;
  /** `listonePlayerKey` del giocatore attualmente selezionato, o `null`. */
  readonly selectedKey: string | null;
}

function line(className: string, text: string): HTMLElement {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

/**
 * Il sottoblocco intero. `onSelect` È `selectListonePlayer` e non un suo
 * gemello: il candidato porta la propria `ListonePlayer`, quindi la stessa
 * funzione del listone si applica senza adattatori.
 *
 * ACCESSIBILITÀ, e non per compilare una casella: la riga è un `<button>` VERO.
 * Tab la raggiunge, Invio e Spazio la attivano, il dito la tocca, e non c'è un
 * solo listener di tastiera scritto a mano da tenere allineato — è il browser a
 * garantirlo.
 */
export function renderPerMeSection(
  props: PerMeSectionProps,
  onSelect: (player: ListonePlayer) => void,
): HTMLElement {
  const { reading, selectedKey } = props;
  const section = document.createElement("section");
  section.id = "per-me-block";
  section.className = "per-me";
  section.setAttribute("aria-labelledby", "per-me-title");

  // Il titolo è quello CONDIVISO (src/ui/schedaCard.ts): `.per-me__title` era
  // una copia byte per byte di `.bait__title`, e due copie della stessa forma
  // divergono al primo ritocco.
  //
  // NON SI DISEGNA PIÙ — «Nascondi #per-me-title» (Pico, 2026-08-31), e la
  // ragione è di struttura, non di gusto: l'occhiello che sta sopra
  // (`#suggested-player-title`, src/main.ts) diceva già la stessa cosa che
  // dice questo titolo. «CHI CHIAMARE ORA» e «PER ME» sono la stessa domanda,
  // e la stessa domanda scritta due volte non è una gerarchia.
  //
  // PERCHÉ IL GEMELLO DELL'ESCA INVECE RESTA A SCHERMO. Dal 2026-08-31
  // l'occhiello intesta DAVVERO le due metà, e la seconda si chiama «PER FAR
  // SPENDERE GLI ALTRI»: una domanda DIVERSA dalla prima, che nessun altro
  // elemento porta. Nasconderla lascerebbe due nomi impilati senza modo di
  // sapere quale risponde a quale domanda. Qui non si perde niente perché
  // l'occhiello ripete la domanda; là si perderebbe la seconda domanda.
  //
  // RESTA NEL DOM, FUORI DALLA VISTA, e non è un ripiego: `aria-labelledby`
  // punta qui, e un titolo tolto (o messo a `display: none`) lascerebbe
  // `#per-me-block` SENZA NOME ACCESSIBILE. L'idioma del non-disegnato è
  // quello che il repository ha già — `.listone-axis-tag__sr`,
  // `.scheda-icona__sr` — e la sua misura sta in src/styles/perMe.css.
  //
  // `subtitle: true` ANCHE SE NON SI VEDE, e non è una contraddizione: le due
  // metà sono pari, quindi i loro due nomi portano la stessa forma — quella
  // subordinata all'occhiello. Il modificatore del non-disegnato si applica
  // SOPRA, e tocca dove sta il titolo, non com'è fatto: è per questo che
  // e2e/player-insight.spec.ts può confrontare i tre titoli e trovarne due
  // identità, una per l'occhiello e una per le due metà, anche se a schermo di
  // metà se ne legge una sola.
  const title = renderSchedaCardTitle(perMeTitleFor(reading), {
    id: "per-me-title",
    subtitle: true,
  });
  title.classList.add("per-me__title--sr");
  section.appendChild(title);

  if (reading.kind === "empty") {
    const empty = document.createElement("p");
    empty.id = "per-me-empty";
    empty.className = "per-me__empty";
    empty.textContent = perMeEmptyText(reading.reason);
    empty.dataset.reason = reading.reason;
    section.appendChild(empty);
  } else {
    const rows = document.createElement("div");
    rows.id = "per-me-rows";
    rows.className = "per-me__rows";
    for (const candidate of perMeShownCandidates(reading)) {
      const selected = selectedKey === candidate.playerId;
      const row = document.createElement("button");
      row.type = "button";
      row.className = `per-me-row${selected ? " per-me-row--selected" : ""}`;
      row.dataset.playerKey = candidate.playerId;
      row.setAttribute("aria-pressed", selected ? "true" : "false");
      row.title = "Clic per selezionare questo giocatore nella ricerca";

      // LA RIGA È TRE COSE: nome, ruolo, squadra. Il resto è a un clic —
      // «Non devo usarle per leggere ma come consiglio» (Pico, 2026-08-31).
      const head = document.createElement("span");
      head.className = "per-me-row__head";
      head.appendChild(line("per-me-row__name", perMeHeadText(candidate)));
      row.appendChild(head);
      if (selected) row.appendChild(line("per-me-row__selected", PER_ME_SELECTED_MARK));

      row.addEventListener("click", () => onSelect(candidate.player));
      rows.appendChild(row);
    }
    section.appendChild(rows);
  }

  // NESSUNA NOTA. `#per-me-note` non esiste più in nessuno dei due esiti — «via
  // del tutto» (Pico, 2026-08-31). `#per-me-empty` qui sopra, invece, resta: è
  // il MOTIVO DEL SILENZIO, un altro elemento con un altro compito.

  return section;
}

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
// QUELLO CHE RESTA, E NON PER INERZIA:
//  - I MOTIVI DEL SILENZIO. Sette frasi chiuse: un pannello che non ha un
//    consiglio da dare deve dire PERCHÉ, altrimenti «non lo so» e «non c'è
//    nessuno» diventano la stessa cosa a schermo.
//  - LA NOTA, ASCIUGATA. Restano la targa della provenienza e i parametri
//    dichiarati (compreso il tetto delle righe col suo stato di ratifica): è
//    ciò che rende il consiglio ISPEZIONABILE e lo distingue da un oracolo.
//    Sono usciti l'ordine per esteso, le letture non ratificate e i tre
//    contatori delle assenze — vivono nel dato (`PerMeReading.ratification`,
//    `withoutValue`, `withoutSurplus`, `withoutAppealPosition`) e nei test del
//    motore, non più a schermo.
//  - IL NOME ACCESSIBILE. Il titolo resta nel DOM fuori dalla vista: è lui a
//    dare il nome a `#per-me-block` via `aria-labelledby`.
//
// LA SELEZIONE SI VEDE SU DUE CANALI, mai solo col colore: la riga selezionata
// porta un CONTORNO e la parola «✓ selezionato», oltre al fondo diverso.

import type {
  PerMeCandidate,
  PerMeEmptyReason,
  PerMeParameters,
  PerMePlanReading,
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

/**
 * LA NOTA COMPARE SOLO DOVE UN PARAMETRO HA GOVERNATO QUALCOSA — stessa regola,
 * e stessa ragione di altezza, di `baitNoteApplies`.
 *
 * Con le righe la nota c'è per intero. Nei due silenzi che nascono DOPO la
 * misura — `no-free-in-open-roles` e `no-affordable` — la nota resta perché lì
 * un parametro ha davvero deciso. Negli altri cinque esiti nessun numero è mai
 * stato prodotto: recitare i parametri sarebbe elencare soglie che non hanno
 * governato niente.
 */
export function perMeNoteApplies(reading: PerMeReading): boolean {
  return (
    reading.kind === "candidates" ||
    reading.reason === "no-free-in-open-roles" ||
    reading.reason === "no-affordable"
  );
}

/** «Nome (A · Inter)» — chi è, in una riga. */
export function perMeHeadText(candidate: PerMeCandidate): string {
  return `${candidate.player.name} (${candidate.role} · ${candidate.player.club})`;
}

/**
 * LA NOTA, ASCIUGATA AL MINIMO CHE TIENE IN PIEDI L'ISPEZIONE — decisione di
 * Pico del 2026-08-31, la stessa che ha ridotto la riga a nome, ruolo e
 * squadra.
 *
 * DUE COSE, E DUE SOLE, PERCHÉ SONO LE DUE CHE DISTINGUONO UN CONSIGLIO DA UN
 * ORACOLO:
 *
 *  1. LA TARGA DELLA PROVENIENZA — da dove vengono i numeri che HANNO SCELTO
 *     questo giocatore («V dal generatore e prezzo atteso dalla curva
 *     storica»), e quale piano ha filtrato, con la sua etichetta e la sua
 *     versione. Con una riga sola la scelta pesa più di prima: sapere chi l'ha
 *     fatta è l'unica cosa che permette di non fidarsi.
 *  2. I PARAMETRI DICHIARATI — i due campioni minimi, la riserva dura per slot
 *     e il tetto delle righe COL SUO STATO DI RATIFICA. Sono le soglie che
 *     hanno lasciato passare quella riga e non un'altra.
 *
 * UNA DICHIARAZIONE DI PIANO ROTTA RESTA DETTA QUI, ed è ancora provenienza:
 * l'etichetta dice «piano ricalcolato adesso» proprio perché la dichiarazione
 * di Pico non ha retto, e tacerlo farebbe sembrare dichiarato un piano che non
 * lo è.
 *
 * CHE COSA NE È USCITO, e dove vive adesso. L'ordine per esteso, le due letture
 * non ratificate e i tre contatori delle assenze non si stampano più: erano
 * lettura, e questo pannello ha smesso di essere una lettura. Restano
 * ISPEZIONABILI NEL DATO — `PerMeReading.ratification`,
 * `PER_ME_UNRATIFIED_CHOICES`, `withoutValue`, `withoutSurplus`,
 * `withoutAppealPosition` — e pinnati dai test del motore e di
 * src/perMeCandidates.test.ts, che nessuno di questi cambiamenti tocca.
 */
export function perMeNoteText(
  parameters: PerMeParameters,
  plan: PerMePlanReading | null,
): string {
  const parts = [
    "V dal generatore e prezzo atteso dalla curva storica" +
      (plan === null ? "" : `, ${plan.label} «${plan.planVersion}»`),
    `campione minimo ${parameters.minInflationSample} (inflazione) e ${parameters.minPriceBandSample} (fascia di prezzo)`,
    `riserva ${parameters.costFloor} cr per ogni slot non ancora pianificato`,
    `${parameters.rowsMax} ${parameters.rowsMax === 1 ? "riga" : "righe"} al massimo (${parameters.rowsMaxStatus})`,
  ];
  if (plan !== null && plan.kind === "dynamic" && plan.declaredIssue !== null) {
    parts.push(
      plan.declaredIssue === "plan-incomplete"
        ? "la tua dichiarazione di piano è a metà: comanda il piano ricalcolato"
        : "la tua dichiarazione di piano è stata rifiutata dal motore: comanda il piano ricalcolato",
    );
  }
  return parts.join(" · ");
}

/**
 * TUTTO il testo del sottoblocco, in una stringa. Esiste per essere passato
 * alla guardia di deriva: una regex su questa stringa copre titolo, motivi,
 * teste e nota insieme, invece di quattro asserzioni che si dimenticano la
 * quinta. Riproduce SOLO ciò che il sottoblocco RENDE davvero — una guardia
 * che leggesse testo non renderizzato sorveglierebbe un'altra pagina.
 *
 * È PIÙ CORTO DI IERI PERCHÉ LA PAGINA LO È, non perché la guardia guardi
 * meno: la riga porta nome, ruolo e squadra, e non c'è altro testo reso da
 * sorvegliare.
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
    if (perMeNoteApplies(reading)) {
      out.push(perMeNoteText(reading.parameters, null));
    }
    return out.join("\n");
  }
  for (const candidate of perMeShownCandidates(reading)) {
    out.push(perMeHeadText(candidate));
  }
  out.push(perMeNoteText(reading.parameters, reading.plan));
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
  // (`#suggested-player-mine-title`, src/main.ts) intitola
  // `<section id="suggested-player-mine">`, che contiene SOLO questo
  // sottoblocco — il pannello esca è una sezione sorella, appesa a
  // `#suggested-player`. «CHI CHIAMARE ORA» e «PER ME» nominavano quindi la
  // stessa cosa, impilati uno sotto l'altro.
  //
  // RESTA NEL DOM, FUORI DALLA VISTA, e non è un ripiego: `aria-labelledby`
  // punta qui, e un titolo tolto (o messo a `display: none`) lascerebbe
  // `#per-me-block` SENZA NOME ACCESSIBILE. L'idioma del non-disegnato è
  // quello che il repository ha già — `.listone-axis-tag__sr`,
  // `.scheda-icona__sr` — e la sua misura sta in src/styles/perMe.css.
  const title = renderSchedaCardTitle(perMeTitleFor(reading), { id: "per-me-title" });
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

  if (perMeNoteApplies(reading)) {
    const note = document.createElement("p");
    note.id = "per-me-note";
    note.className = "per-me__note";
    note.textContent = perMeNoteText(
      reading.parameters,
      reading.kind === "candidates" ? reading.plan : null,
    );
    section.appendChild(note);
  }

  return section;
}

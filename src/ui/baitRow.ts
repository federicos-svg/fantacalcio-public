// PER FAR SPENDERE GLI ALTRI — le parole e la riga cliccabile.
//
// L'altra metà del paio di src/baitCandidates.ts: là il calcolo puro, qui la
// forma. Stesso taglio di src/ui/tierBand.ts e src/ui/liveFacts.ts — ogni
// stringa nasce da una funzione pura ed è coperta da test, così anche la COPIA
// è falsificabile e non solo i numeri.
//
// ─────────────────────────────────────────────────────────────────────────────
// LA RIGA È UN CONSIGLIO, NON UNA LETTURA — Pico, 2026-08-31
// ─────────────────────────────────────────────────────────────────────────────
//
// «Quello che voglio nelle due feature è un giocatore soltanto con Nome, ruolo
// e squadra. Non devo usarle per leggere ma come consiglio.» La riga porta
// quindi TRE COSE E NIENT'ALTRO. Sono spariti da qui il conteggio degli
// avversari esposti, le righe di evidenza dei precedenti, la proiezione «se
// resta a te» e il marcatore di prima fascia.
//
// I FATTI NON SONO SPARITI DAL PRODOTTO, SONO SPARITI DA QUI. Il pannello
// AVVERSARI: I PRECEDENTI continua a mostrare i gesti misurati con la loro
// prova, e la schermata di chiamata — quella che si arma cliccando la riga —
// continua a mostrare che cosa costa. Sono a un clic di distanza.
//
// IL MOTORE NON È STATO TOCCATO: src/baitCandidates.ts calcola la stessa
// popolazione, gli stessi cancelli, lo stesso ordine e gli stessi sei motivi
// di silenzio. Con UNA riga sola (`rowsMax` 1, ratificato da Pico il
// 2026-08-31) quella scelta conta più di prima.
//
// IL TITOLO NOMINA CIÒ CHE IL BLOCCO CONTIENE, NON UN'INTENZIONE. È la regola
// con cui src/ui/liveFacts.ts ha corretto «INTERESSE SUL GIOCATORE» in «I
// PRECEDENTI»: per questo NON si chiama «CHI ABBOCCA» — nessuno qui sa se
// qualcuno abboccherà, e dirlo sarebbe una previsione di comportamento, cioè
// la cosa che l'intero pacchetto avversari vieta.
//
// LA NOTA RESTA, ASCIUGATA: la targa della provenienza e i tre parametri
// dichiarati. È ciò che rende il consiglio ISPEZIONABILE e lo distingue da un
// oracolo.
//
// IL GESTO È QUELLO DEL LISTONE, E LO È DAVVERO. La riga chiama
// `selectListonePlayer()` — l'UNICA via che arma la CTA «Avvia» — con la
// `ListonePlayer` che il candidato porta con sé. Non esiste una seconda via di
// selezione: due strade per selezionare un giocatore sono due superfici da
// sorvegliare, e la seconda diverge il giorno in cui la prima cambia.
//
// LA SELEZIONE SI VEDE SU DUE CANALI, mai solo col colore: la riga selezionata
// porta un CONTORNO e la parola «✓ selezionato», oltre al fondo diverso. Chi
// non distingue i colori legge comunque quale riga è armata.

import type {
  BaitCandidate,
  BaitEmptyReason,
  BaitParameters,
  BaitReading,
} from "../baitCandidates.js";
import { seasonsSpan } from "./liveFacts.js";
import type { ListonePlayer } from "./listone.js";
import { renderSchedaCardTitle } from "./schedaCard.js";

/** Il NOME del sottoblocco. Nomina il contenuto, non l'intenzione. */
export const BAIT_TITLE_SHORT = "PER FAR SPENDERE GLI ALTRI";

/** L'occhiello per esteso: il nome più ciò che le righe SONO. */
export const BAIT_TITLE = `${BAIT_TITLE_SHORT} — liberi su cui più avversari hanno un precedente, lo slot e i crediti`;

/**
 * Quale dei due va a schermo, e perché non è una scorciatoia di larghezza.
 *
 * La seconda metà dell'occhiello descrive CHE COSA SONO LE RIGHE. Senza righe
 * non c'è niente da descrivere: la frase del silenzio, subito sotto, dice già
 * per intero perché non ce ne sono, e ripetere «liberi su cui più avversari
 * hanno un precedente, lo slot e i crediti» sopra un «non lo so» aggiunge tre
 * righe di altezza e zero informazione.
 *
 * TRE RIGHE NON SONO UN DETTAGLIO SU QUESTA SCHERMATA. Misurato a 390px: 49,5px
 * di occhiello contro 16,5. `e2e/call-screen-order.spec.ts` tiene la
 * paginazione del listone entro due schermate dal campo di ricerca — una
 * decisione di prodotto di Pico, non un budget inventato — e con 532 righe e le
 * undici colonne di default di #41 quel margine è già quasi tutto speso. Un
 * blocco che NON HA NULLA DA DIRE non può prendersene un quarto di schermata.
 *
 * IL NOME NON CAMBIA MAI: `BAIT_TITLE_SHORT` è un prefisso letterale di
 * `BAIT_TITLE` per costruzione (il secondo è interpolato dal primo), e un test
 * lo verifica — così i due non possono diventare due nomi diversi.
 */
export function baitTitleFor(reading: BaitReading): string {
  return reading.kind === "candidates" ? BAIT_TITLE : BAIT_TITLE_SHORT;
}

/** Il secondo canale della selezione, oltre al contorno: una parola. */
export const BAIT_SELECTED_MARK = "✓ selezionato";

/**
 * QUANDO NON COMPARE, DICE QUALE SILENZIO È. Vocabolario CHIUSO di sei motivi,
 * sul modello di `PrecedentsEmptyReason`: sei frasi diverse, perché sono sei
 * cose diverse, e appiattirle sarebbe già mezza bugia.
 *
 * NESSUNA DI QUESTE FRASI DICE «NESSUNO ABBOCCA», e in particolare non lo dice
 * `no-history`: uno storico assente è «NON LO SO», che è l'opposto di una
 * risposta. La guardia di deriva in baitRow.test.ts cerca
 * `/vuole|abbocc|aggressiv|tilt|preved|probabil|stima/i` su TUTTO il testo del
 * sottoblocco e pretende zero riscontri — compreso il caso in cui la frase più
 * naturale da scrivere sarebbe proprio quella vietata.
 */
export function baitEmptyText(reason: BaitEmptyReason): string {
  switch (reason) {
    case "no-pool":
      return "Nessun listone caricato: senza righe non c'è una popolazione da guardare.";
    case "no-history":
      return "Nessuno storico d'asta caricato: non lo so — e «non lo so» non è «nessuno».";
    case "no-open-role":
      return "Nessuno slot libero nei tuoi reparti: un acquisto non sarebbe registrabile.";
    case "no-affordable-opening":
      return "Nemmeno l'apertura al prezzo base passa il cancello: la pagheresti lasciando la rosa non completabile.";
    case "no-exposed":
      return "Nessun libero su cui un avversario abbia insieme un precedente misurato, lo slot e i crediti.";
    case "below-sample":
      return "I precedenti trovati poggiano su meno stagioni della soglia: campione insufficiente, non assenza di precedenti.";
  }
}

/**
 * LA NOTA DEI PARAMETRI COMPARE SOLO DOVE UN PARAMETRO HA GOVERNATO QUALCOSA.
 *
 * La regola dichiarata è «la soglia in vigore ispezionabile ACCANTO AL NUMERO
 * CHE LASCIA PASSARE». Con `no-pool` e `no-history` non c'è nessun numero: la
 * popolazione non è mai esistita, nessun cancello ha girato, nessuna soglia ha
 * morso. Recitare lì «apertura a 1 cr · almeno 1 stagione misurata · al massimo
 * 3 righe» non è ispezionare una soglia accanto a un numero, è elencare
 * parametri che non hanno governato niente — e costava 64px su 844 in uno stato
 * in cui il blocco non ha nulla da dire (misurato a 390px).
 *
 * Negli altri quattro esiti la nota RESTA per intero, e sono esattamente quelli
 * in cui un parametro ha deciso il silenzio: `no-affordable-opening` è il prezzo
 * di apertura, `below-sample` è la soglia di stagioni, `no-open-role` e
 * `no-exposed` hanno avuto una popolazione vera su cui le soglie erano in
 * vigore.
 *
 * I PARAMETRI RESTANO ISPEZIONABILI NEL DATO in ogni caso: `BaitReading.
 * parameters` li porta anche negli esiti vuoti, e `BAIT_PARAMETERS` è
 * esportato. Qui cambia solo se la VISTA li stampa.
 */
export function baitNoteApplies(reading: BaitReading): boolean {
  return reading.kind === "candidates" || (reading.reason !== "no-pool" && reading.reason !== "no-history");
}

/** «Nome (A · Inter)» — chi è, in una riga. */
export function baitHeadText(candidate: BaitCandidate): string {
  return `${candidate.player.name} (${candidate.role} · ${candidate.player.club})`;
}

/**
 * LA NOTA, ASCIUGATA AL MINIMO CHE TIENE IN PIEDI L'ISPEZIONE — decisione di
 * Pico del 2026-08-31, la stessa che ha ridotto la riga a nome, ruolo e
 * squadra.
 *
 * DUE COSE, E DUE SOLE. La TARGA DELLA PROVENIENZA — «storico d'asta
 * misurato», con l'arco di stagioni su cui poggia — e i TRE PARAMETRI in
 * vigore, ciascuno accanto al numero che governa: il prezzo di apertura che
 * apre il cancello, la soglia di stagioni sotto cui un fatto non conta, e il
 * tetto delle righe col suo stato di ratifica. Sono le soglie che hanno
 * lasciato passare QUESTA riga e non un'altra: con una riga sola sono l'unica
 * cosa che permette di non fidarsi a scatola chiusa.
 *
 * CHE COSA NE È USCITO: il contatore delle righe senza indice di appetibilità.
 * Era lettura, e questo pannello ha smesso di essere una lettura. Resta
 * ispezionabile nel dato (`BaitReading.withoutAppealIndex`) e pinnato dai test
 * di src/baitCandidates.test.ts, che questo diff non tocca.
 */
export function baitNoteText(
  parameters: BaitParameters,
  seasons: readonly string[],
): string {
  return [
    `provenienza: storico d'asta misurato, ${seasonsSpan(seasons)}`,
    `apertura a ${parameters.openingPrice} cr`,
    `almeno ${parameters.minSeasonsMeasured} ${
      parameters.minSeasonsMeasured === 1 ? "stagione misurata" : "stagioni misurate"
    } per fatto`,
    `al massimo ${parameters.rowsMax} ${parameters.rowsMax === 1 ? "riga" : "righe"} (${parameters.rowsMaxStatus})`,
  ].join(" · ");
}

/** Le righe davvero mostrate: l'ordine è già quello dichiarato, qui si tronca. */
export function baitShownCandidates(reading: BaitReading): readonly BaitCandidate[] {
  return reading.kind === "candidates"
    ? reading.candidates.slice(0, reading.parameters.rowsMax)
    : [];
}

/**
 * TUTTO il testo del sottoblocco, in una stringa. Esiste per essere passato
 * alla guardia di deriva: una regex su questa stringa copre titolo, motivi,
 * teste e nota insieme, invece di quattro asserzioni che si dimenticano la
 * quinta. Riproduce SOLO ciò che il sottoblocco RENDE davvero — una guardia
 * che leggesse testo non renderizzato sorveglierebbe un'altra pagina.
 *
 * È PIÙ CORTO DI IERI PERCHÉ LA PAGINA LO È, non perché la guardia guardi
 * meno.
 */
export function baitSectionText(reading: BaitReading): string {
  const out: string[] = [baitTitleFor(reading)];
  if (reading.kind === "empty") {
    out.push(baitEmptyText(reading.reason));
    if (baitNoteApplies(reading)) {
      out.push(baitNoteText(reading.parameters, reading.seasons));
    }
    return out.join("\n");
  }
  for (const candidate of baitShownCandidates(reading)) {
    out.push(baitHeadText(candidate));
  }
  out.push(baitNoteText(reading.parameters, reading.seasons));
  return out.join("\n");
}

// ─── La riga a schermo ───────────────────────────────────────────────────────

export interface BaitSectionProps {
  readonly reading: BaitReading;
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
 * ACCESSIBILITÀ, e non per compilare una casella: la riga è un `<button>`
 * VERO. Tab la raggiunge, Invio e Spazio la attivano, il dito la tocca, e non
 * c'è un solo listener di tastiera scritto a mano da tenere allineato — è il
 * browser a garantirlo. La riga del listone oggi è un `<div>` con un listener
 * di click: questa non peggiora quella e non la imita nel difetto.
 */
export function renderBaitSection(
  props: BaitSectionProps,
  onSelect: (player: ListonePlayer) => void,
): HTMLElement {
  const { reading, selectedKey } = props;
  const section = document.createElement("section");
  section.id = "bait-block";
  section.className = "bait";
  section.setAttribute("aria-labelledby", "bait-title");

  // Il titolo è quello CONDIVISO (src/ui/schedaCard.ts) — vedi la nota gemella
  // in renderPerMeSection.
  section.appendChild(renderSchedaCardTitle(baitTitleFor(reading), { id: "bait-title" }));

  if (reading.kind === "empty") {
    const empty = document.createElement("p");
    empty.id = "bait-empty";
    empty.className = "bait__empty";
    empty.textContent = baitEmptyText(reading.reason);
    empty.dataset.reason = reading.reason;
    section.appendChild(empty);
  } else {
    const rows = document.createElement("div");
    rows.id = "bait-rows";
    rows.className = "bait__rows";
    for (const candidate of baitShownCandidates(reading)) {
      const selected = selectedKey === candidate.playerId;
      const row = document.createElement("button");
      row.type = "button";
      row.className = `bait-row${selected ? " bait-row--selected" : ""}`;
      row.dataset.playerKey = candidate.playerId;
      row.setAttribute("aria-pressed", selected ? "true" : "false");
      row.title = "Clic per selezionare questo giocatore nella ricerca";

      // LA RIGA È TRE COSE: nome, ruolo, squadra. Il resto è a un clic —
      // «Non devo usarle per leggere ma come consiglio» (Pico, 2026-08-31).
      const head = document.createElement("span");
      head.className = "bait-row__head";
      head.appendChild(line("bait-row__name", baitHeadText(candidate)));
      row.appendChild(head);
      if (selected) row.appendChild(line("bait-row__selected", BAIT_SELECTED_MARK));

      row.addEventListener("click", () => onSelect(candidate.player));
      rows.appendChild(row);
    }
    section.appendChild(rows);
  }

  if (baitNoteApplies(reading)) {
    const note = document.createElement("p");
    note.id = "bait-note";
    note.className = "bait__note";
    note.textContent = baitNoteText(reading.parameters, reading.seasons);
    section.appendChild(note);
  }

  return section;
}

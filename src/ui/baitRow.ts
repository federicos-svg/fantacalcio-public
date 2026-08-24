// PER FAR SPENDERE GLI ALTRI — le parole e la riga cliccabile.
//
// L'altra metà del paio di src/baitCandidates.ts: là il calcolo puro, qui la
// forma. Stesso taglio di src/ui/tierBand.ts e src/ui/liveFacts.ts — ogni
// stringa nasce da una funzione pura ed è coperta da test, così anche la COPIA
// è falsificabile e non solo i numeri.
//
// IL TITOLO NOMINA CIÒ CHE IL BLOCCO CONTIENE, NON UN'INTENZIONE. È la regola
// con cui src/ui/liveFacts.ts ha corretto «INTERESSE SUL GIOCATORE» in «I
// PRECEDENTI»: il titolo visibile deve dire cosa c'è dentro — gesti passati
// misurati, uno slot, dei crediti — e non affermare uno stato d'animo che
// nessun calcolo dietro di lui produce. Per questo NON si chiama «CHI ABBOCCA»:
// nessuno qui sa se qualcuno abboccherà, e dirlo sarebbe una previsione di
// comportamento, cioè la cosa che l'intero pacchetto avversari vieta.
//
// LA PROVA VIAGGIA COL FATTO, e non viene riscritta: `precedentMotive()` e
// `precedentEvidence()` sono quelle di src/ui/liveFacts.ts, importate. Il
// pannello AVVERSARI: I PRECEDENTI e questa riga non possono quindi dire due
// cose diverse dello stesso fatto.
//
// IL COSTO DEL PIANO B È CONTENUTO OBBLIGATO, non un di più: se nessuno
// rilancia, l'esca la paghi tu, quindi la seconda riga mostra sempre cosa
// succede se resta a te — e la producono `projectAfterPurchase()` e
// `projectionValueText`/`projectionAlarmText` di src/postPurchaseProjection.ts,
// già scritti, già testati, già in uso altrove. Qui non se ne riscrive nessuno.
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
  BaitExposure,
  BaitParameters,
  BaitReading,
} from "../baitCandidates.js";
import {
  projectionAlarmText,
  projectionValueText,
} from "../postPurchaseProjection.js";
import type { PrecedentFact } from "../../packages/opponent-profiles/src/types.js";
import { precedentEvidence, precedentMotive, seasonsSpan } from "./liveFacts.js";
import type { ListonePlayer } from "./listone.js";

/** L'occhiello del sottoblocco. Nomina il contenuto, non l'intenzione. */
export const BAIT_TITLE =
  "PER FAR SPENDERE GLI ALTRI — liberi su cui più avversari hanno un precedente, lo slot e i crediti";

/**
 * Il marcatore della prima fascia. Il fatto SI ACCOSTA, NON PESA: il candidato
 * non viene rimosso (sarebbe il sistema a decidere al posto di Pico) e non
 * viene promosso (resta dove l'ordine lo mette). Compare accanto alla riga e
 * non la sposta di una posizione.
 */
export const BAIT_TOP_TIER_MARKER =
  "⚠ è anche fra i primi liberi del suo ruolo: se resta a te non è un ripiego";

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
      return "Nessun listone caricato: senza righe non c'è nessuna popolazione da guardare.";
    case "no-history":
      return (
        "Nessuno storico d'asta caricato: non lo so. " +
        "Senza storico non c'è niente di misurato da mostrare, e «niente di misurato» non è «nessuno»."
      );
    case "no-open-role":
      return "Nessuno slot libero nei tuoi reparti: un acquisto non sarebbe nemmeno registrabile.";
    case "no-affordable-opening":
      return (
        "Nemmeno l'apertura al prezzo base passa il cancello di ammissione: " +
        "pagarla lascerebbe la rosa non completabile, e un'esca che non puoi comprare non è un'esca."
      );
    case "no-exposed":
      return (
        "Nessun libero su cui un avversario abbia insieme un precedente misurato, lo slot e i crediti."
      );
    case "below-sample":
      return (
        "I precedenti trovati poggiano su meno stagioni della soglia dichiarata: " +
        "campione insufficiente, che non è assenza di precedenti."
      );
  }
}

/** «Nome (A · Inter)» — chi è, in una riga. */
export function baitHeadText(candidate: BaitCandidate): string {
  return `${candidate.player.name} (${candidate.role} · ${candidate.player.club})`;
}

/**
 * Il CENSIMENTO, non una misura: quanti avversari, e di che cosa ne è fatta
 * l'esposizione. La frase intera è sempre la stessa e dice le tre condizioni
 * insieme, perché una sola delle tre non è esposizione.
 */
export function baitCountText(exposedCount: number): string {
  const who = exposedCount === 1 ? "1 avversario" : `${exposedCount} avversari`;
  return `${who} con un precedente, lo slot e i crediti`;
}

/**
 * «Se resta a te»: il costo del piano B, mostrato INSIEME alla mossa.
 * I numeri sono di `projectAfterPurchase()`; gli slot del reparto sono
 * l'unica sottrazione locale, ed è quella che DEFINISCE l'acquisto (uno slot
 * esce dagli slot), la stessa che `reduce()` esegue quando diventa evento.
 */
export function baitProjectionText(candidate: BaitCandidate): string {
  const head =
    `se resta a te a ${candidate.openingPrice} cr: ` +
    `slot ${candidate.role} ${candidate.roleSlotsBefore}→${candidate.roleSlotsBefore - 1}`;
  const alarm = projectionAlarmText(candidate.projection);
  const value = `${head} · ${projectionValueText(candidate.projection)}`;
  return alarm === "" ? value : `${value} · ${alarm}`;
}

/** Una riga di prova per ogni fatto: chi, che gesto, con quali numeri. */
export function baitEvidenceLines(
  exposure: BaitExposure,
  teamLabel: string,
): readonly string[] {
  return exposure.facts.map(
    (fact: PrecedentFact) => `${teamLabel} ${precedentMotive(fact)} — ${precedentEvidence(fact)}`,
  );
}

/**
 * La nota del blocco: la PROVENIENZA e i TRE PARAMETRI in vigore, accanto ai
 * numeri che governano — stesso modello di `PrecedentsReading.thresholds`. Il
 * parametro non confermato dichiara di esserlo.
 */
export function baitNoteText(
  parameters: BaitParameters,
  seasons: readonly string[],
  withoutAppealIndex: number,
): string {
  const parts = [
    `provenienza: storico d'asta misurato, ${seasonsSpan(seasons)}`,
    `apertura a ${parameters.openingPrice} cr`,
    `almeno ${parameters.minSeasonsMeasured} ${
      parameters.minSeasonsMeasured === 1 ? "stagione misurata" : "stagioni misurate"
    } per fatto`,
    `al massimo ${parameters.rowsMax} ${parameters.rowsMax === 1 ? "riga" : "righe"} (${parameters.rowsMaxStatus})`,
  ];
  if (withoutAppealIndex > 0) {
    parts.push(
      `${withoutAppealIndex} ${withoutAppealIndex === 1 ? "riga" : "righe"} senza indice di appetibilità: ` +
        "a parità di avversari restano in fondo, senza numero fabbricato",
    );
  }
  return parts.join(" · ");
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
 * conteggi, proiezioni, prove, marcatori e nota insieme, invece di sette
 * asserzioni che si dimenticano l'ottava.
 */
export function baitSectionText(
  reading: BaitReading,
  teamLabels: Readonly<Record<string, string>>,
): string {
  const out: string[] = [BAIT_TITLE];
  if (reading.kind === "empty") {
    out.push(baitEmptyText(reading.reason));
    out.push(baitNoteText(reading.parameters, reading.seasons, 0));
    return out.join("\n");
  }
  for (const candidate of baitShownCandidates(reading)) {
    out.push(baitHeadText(candidate));
    out.push(baitCountText(candidate.exposedCount));
    out.push(baitProjectionText(candidate));
    if (candidate.alsoTopTier) out.push(BAIT_TOP_TIER_MARKER);
    for (const exposure of candidate.exposed) {
      out.push(...baitEvidenceLines(exposure, teamLabels[exposure.fantaTeamId] ?? exposure.fantaTeamId));
    }
  }
  out.push(baitNoteText(reading.parameters, reading.seasons, reading.withoutAppealIndex));
  return out.join("\n");
}

// ─── La riga a schermo ───────────────────────────────────────────────────────

export interface BaitSectionProps {
  readonly reading: BaitReading;
  /** posto → nome mostrato. La riga scrive il POSTO, mai la persona. */
  readonly teamLabels: Readonly<Record<string, string>>;
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
  const { reading, teamLabels, selectedKey } = props;
  const section = document.createElement("section");
  section.id = "bait-block";
  section.className = "bait";
  section.setAttribute("aria-labelledby", "bait-title");

  const title = document.createElement("h3");
  title.id = "bait-title";
  title.className = "bait__title";
  title.textContent = BAIT_TITLE;
  section.appendChild(title);

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

      const head = document.createElement("span");
      head.className = "bait-row__head";
      head.appendChild(line("bait-row__name", baitHeadText(candidate)));
      head.appendChild(line("bait-row__count", baitCountText(candidate.exposedCount)));
      row.appendChild(head);

      row.appendChild(line("bait-row__projection", baitProjectionText(candidate)));
      if (candidate.alsoTopTier) {
        row.appendChild(line("bait-row__mark", BAIT_TOP_TIER_MARKER));
      }
      for (const exposure of candidate.exposed) {
        const label = teamLabels[exposure.fantaTeamId] ?? exposure.fantaTeamId;
        for (const text of baitEvidenceLines(exposure, label)) {
          row.appendChild(line("bait-row__evidence", text));
        }
      }
      if (selected) row.appendChild(line("bait-row__selected", BAIT_SELECTED_MARK));

      row.addEventListener("click", () => onSelect(candidate.player));
      rows.appendChild(row);
    }
    section.appendChild(rows);
  }

  const note = document.createElement("p");
  note.id = "bait-note";
  note.className = "bait__note";
  note.textContent = baitNoteText(
    reading.parameters,
    reading.seasons,
    reading.kind === "candidates" ? reading.withoutAppealIndex : 0,
  );
  section.appendChild(note);

  return section;
}

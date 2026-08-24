// PER ME — le parole e la riga cliccabile della prima metà del blocco
// «giocatore suggerito».
//
// L'altra metà del paio di src/perMeCandidates.ts: là il calcolo puro, qui la
// forma. Stesso taglio di ./baitRow.ts, ./tierBand.ts e ./liveFacts.ts — ogni
// stringa nasce da una funzione pura ed è coperta da test, così anche la COPIA
// è falsificabile e non solo i numeri.
//
// IL TITOLO NOMINA CIÒ CHE IL BLOCCO CONTIENE, NON UN'INTENZIONE — la regola
// con cui ./liveFacts.ts ha corretto «INTERESSE SUL GIOCATORE» in «I
// PRECEDENTI». Qui la regola morde più del solito, perché la frase spontanea
// («chi costa meno di quanto vale per te») è proprio quella che il blocco NON
// può più dire: il valore per me è stato smontato da Pico il 2026-08-24, e con
// lui la sottrazione che la reggeva. L'occhiello per esteso dice quindi che
// cosa le righe SONO — liberi che il piano copre, che si possono pagare, in
// ordine di appetibilità dichiarata — e nient'altro.
//
// NESSUN NUMERO DIRETTIVO, e non per prudenza: `fair_to_me_promoted` e
// `decision_promoted` sono gate OFF (PROJECT_STATE.md §"Gate attivi"). Qui non
// compare un «vale X», un «offri Y», una banda, un prezzo previsto o un
// punteggio di occasione. Compaiono l'ancora corrente misurata con la sua
// provenienza, il piano dichiarato da Pico, il max bid hard-safe e una
// posizione in un ordine dichiarato. `perMeRow.test.ts` §"guardia di deriva"
// cerca il vocabolario vietato su TUTTO il testo del sottoblocco.
//
// IL GESTO È QUELLO DEL LISTONE, E LO È DAVVERO. La riga chiama
// `selectListonePlayer()` — l'UNICA via che arma la CTA «Avvia» — con la
// `ListonePlayer` che il candidato porta con sé. Non esiste una seconda via di
// selezione: due strade per selezionare un giocatore sono due superfici da
// sorvegliare, e la seconda diverge il giorno in cui la prima cambia. È
// esattamente ciò che ./baitRow.ts fa già per l'altra metà del blocco.
//
// LA SELEZIONE SI VEDE SU DUE CANALI, mai solo col colore: la riga selezionata
// porta un CONTORNO e la parola «✓ selezionato», oltre al fondo diverso.

import type {
  PerMeCandidate,
  PerMeEmptyReason,
  PerMeParameters,
  PerMeReading,
} from "../perMeCandidates.js";
import { perMeShownCandidates } from "../perMeCandidates.js";
import { MAX_BID_LABEL } from "./budgetLabels.js";
import { formatSignedPercent } from "./liveFacts.js";
import type { ListonePlayer } from "./listone.js";

/** Il NOME del sottoblocco. Nomina il contenuto, non l'intenzione. */
export const PER_ME_TITLE_SHORT = "PER ME";

/**
 * L'occhiello per esteso: il nome più ciò che le righe SONO, nell'ordine in cui
 * i criteri le ordinano. `PER_ME_TITLE_SHORT` è un prefisso letterale per
 * costruzione (il secondo è interpolato dal primo), e un test lo verifica: i
 * due non possono diventare due nomi diversi.
 */
export const PER_ME_TITLE = `${PER_ME_TITLE_SHORT} — liberi nel tuo piano, che puoi pagare, per appetibilità`;

/**
 * Quale dei due va a schermo. Stessa regola — e stessa misura — di
 * `baitTitleFor`: la seconda metà dell'occhiello descrive CHE COSA SONO LE
 * RIGHE, e senza righe non c'è niente da descrivere. La frase del silenzio,
 * subito sotto, dice già per intero perché non ce ne sono; ripetere l'elenco
 * dei criteri sopra un «non lo so» aggiunge altezza e zero informazione, su una
 * schermata che è già oltre budget.
 */
export function perMeTitleFor(reading: PerMeReading): string {
  return reading.kind === "candidates" ? PER_ME_TITLE : PER_ME_TITLE_SHORT;
}

/** Il secondo canale della selezione, oltre al contorno: una parola. */
export const PER_ME_SELECTED_MARK = "✓ selezionato";

/**
 * QUANDO NON COMPARE, DICE QUALE SILENZIO È. Vocabolario CHIUSO di nove motivi,
 * sul modello di `baitEmptyText`: nove frasi diverse, perché sono nove cose
 * diverse, e appiattirle sarebbe già mezza bugia.
 *
 * NESSUNA DI QUESTE FRASI INVENTA UN NUMERO e nessuna dice «non c'è nessuno»
 * quando la verità è «non lo so»: le tre del piano indicano la dichiarazione che
 * manca, le due delle quotazioni indicano il dato che manca, e quella del
 * listino rifiutato porta il motivo del motore invece di nasconderlo.
 */
export function perMeEmptyText(reason: PerMeEmptyReason): string {
  switch (reason) {
    case "no-pool":
      return "Nessun listone caricato: senza righe non c'è una popolazione da guardare.";
    case "no-quotation":
      return "Nessuna riga del listone porta la Qt.A: senza quotazione non esiste un'ancora da misurare, e un'ancora inventata non è un'ancora.";
    case "anchors-refused":
      return "Le quotazioni caricate non passano la validazione del motore: da un listino rotto non si deriva nessuna ancora.";
    case "plan-absent":
      return "Nessun piano rosa dichiarato: il primo criterio dell'ordine è «dentro il tuo piano», e senza piano quell'ordine non esiste. Dichiaralo in ROSE → IL MIO PIANO.";
    case "plan-incomplete":
      return "Piano rosa dichiarato a metà: manca un target di ruolo o la versione del piano, e un piano incompleto non attraversa il confine verso il motore.";
    case "plan-invalid":
      return "Piano rosa rifiutato dal motore: finché la dichiarazione non è valida non se ne deriva nessun ordine.";
    case "no-open-role":
      return "Nessun reparto aperto con margine: un acquisto non sarebbe registrabile in nessun ruolo.";
    case "no-free-in-open-roles":
      return "Nessun libero con quotazione nei reparti che ti restano aperti.";
    case "no-affordable":
      return "Ci sono liberi nei tuoi reparti aperti, ma il tuo max bid non copre l'ancora corrente di nessuno.";
  }
}

/**
 * LA NOTA COMPARE SOLO DOVE UN PARAMETRO HA GOVERNATO QUALCOSA — stessa regola,
 * e stessa ragione di altezza, di `baitNoteApplies`.
 *
 * Con le righe la nota c'è per intero. Nei due silenzi che nascono DOPO la
 * misura — `no-free-in-open-roles` e `no-affordable` — la nota resta perché lì
 * un parametro ha davvero deciso: l'ancora corrente contro cui `no-affordable`
 * si pronuncia è corretta (o non corretta) dal campione minimo dichiarato. Negli
 * altri sette esiti nessun numero è mai stato prodotto: recitare i parametri
 * sarebbe elencare soglie che non hanno governato niente.
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
 * IL CRITERIO 2, DETTO A SCHERMO. È una POSIZIONE in un ordine dichiarato, non
 * un punteggio: il numero dell'indice non compare, perché non è il numero che
 * ordina questa riga e mostrarlo lo farebbe leggere come un giudizio.
 *
 * L'assenza di verdetto ha la sua frase e non un numero di ripiego: una riga
 * senza posizione non è «l'ultima», è «senza verdetto», e l'ordine la tratta
 * come tale (`compareAppealPosition`, src/perMeCandidates.ts).
 */
export function perMeAppealText(candidate: PerMeCandidate): string {
  if (candidate.appealPosition === null || candidate.appealOrderSize === null) {
    return "senza verdetto di appetibilità";
  }
  return `${candidate.appealPosition}ª di ${candidate.appealOrderSize} per appetibilità`;
}

/**
 * L'ANCORA CORRENTE, MOSTRATA E MAI SOTTRATTA. Porta sempre con sé i tre pezzi
 * che la rendono ispezionabile: la Qt.A nuda, l'inflazione applicata e il
 * campione su cui poggia. In cold start non c'è un numero al posto della misura
 * mancante: c'è la frase che dice che la misura manca.
 */
export function perMeAnchorText(candidate: PerMeCandidate): string {
  const a = candidate.anchor;
  const head = `ancora ${a.correctedAnchor} cr (Qt.A ${a.baseAnchor}`;
  if (a.coldStart || a.inflationApplied === null) {
    // La SOGLIA del campione non si ripete qui: sta nella nota, accanto agli
    // altri parametri, ed è la stessa per tutte le righe. Ripeterla su ognuna
    // costerebbe una riga di testo per candidato su uno schermo da 390px senza
    // aggiungere un fatto.
    return `${head} · nessuna inflazione misurata)`;
  }
  const where = a.basis === "role-inflation" ? "del ruolo" : "del tavolo";
  const what = a.n === 1 ? "acquisto" : "acquisti";
  return `${head} · inflazione misurata ${formatSignedPercent(a.inflationApplied)} su ${a.n} ${what} ${where})`;
}

/**
 * IL CRITERIO 1, DETTO A SCHERMO, più il tetto hard-safe accanto.
 *
 * «dentro/fuori dal piano» è un FATTO CONTABILE (`fitsPlan`), non un consiglio e
 * non un veto: un prezzo fuori piano resta comprabile se il budget lo consente,
 * semplicemente si sa che sfora. Il max bid porta il nome dichiarato in
 * ./budgetLabels.ts e non una formulazione propria: due nomi per due grandezze,
 * non cinque per due.
 */
export function perMePlanText(candidate: PerMeCandidate): string {
  const where = candidate.withinRolePlan ? "nel piano" : "fuori dal piano";
  // Il RUOLO si scrive con la lettera e non col nome esteso: il nome per esteso
  // costava una riga di testo in più a 390px, e la lettera è già quella che la
  // testa della riga porta due righe sopra.
  // «slot» è invariabile in italiano: qui non c'è nessun plurale da scegliere,
  // e un ternario con i due rami uguali sarebbe un ramo che non gira mai.
  return (
    `${where} ${candidate.role} (${candidate.planAllocation} cr / ` +
    `${candidate.planSlotsRemaining} slot) · ${MAX_BID_LABEL} ${candidate.maxBid} cr`
  );
}

/**
 * La nota del sottoblocco: la PROVENIENZA, l'ORDINE dichiarato criterio per
 * criterio, i parametri in vigore e la SCELTA NON RATIFICATA su cui l'ordine
 * poggia — stesso modello di `baitNoteText` e di `PrecedentsReading.thresholds`.
 *
 * L'ordine si stampa per esteso di proposito: è l'unica cosa che questo
 * sottoblocco «decide», e un ordine che non si legge è un peso nascosto scritto
 * in un file.
 */
export function perMeNoteText(
  parameters: PerMeParameters,
  planVersion: string | null,
  withoutAppealPosition: number,
): string {
  const parts = [
    "Qt.A del listone corretta dall'inflazione misurata" +
      (planVersion === null ? "" : `, piano «${planVersion}»`),
    "ordine: piano → appetibilità del ruolo → ancora → chiave di listone",
    `campione minimo ${parameters.minInflationSample}`,
    `${parameters.rowsMax} ${parameters.rowsMax === 1 ? "riga" : "righe"} al massimo (${parameters.rowsMaxStatus})`,
    "NON RATIFICATA: il posto del criterio caduto è preso dall'appetibilità",
  ];
  if (withoutAppealPosition > 0) {
    parts.push(
      `${withoutAppealPosition} ${withoutAppealPosition === 1 ? "riga" : "righe"} senza verdetto di appetibilità, in fondo senza posizione fabbricata`,
    );
  }
  return parts.join(" · ");
}

/**
 * TUTTO il testo del sottoblocco, in una stringa. Esiste per essere passato
 * alla guardia di deriva: una regex su questa stringa copre titolo, motivi,
 * teste, ancore, piano, posizioni e nota insieme, invece di sette asserzioni
 * che si dimenticano l'ottava. Riproduce SOLO ciò che la vista mostra davvero —
 * una guardia che leggesse testo non renderizzato sorveglierebbe un'altra pagina.
 */
export function perMeSectionText(reading: PerMeReading): string {
  const out: string[] = [perMeTitleFor(reading)];
  if (reading.kind === "empty") {
    out.push(perMeEmptyText(reading.reason));
    if (perMeNoteApplies(reading)) {
      out.push(perMeNoteText(reading.parameters, null, 0));
    }
    return out.join("\n");
  }
  for (const candidate of perMeShownCandidates(reading)) {
    out.push(perMeHeadText(candidate));
    out.push(perMeAppealText(candidate));
    out.push(perMeAnchorText(candidate));
    out.push(perMePlanText(candidate));
  }
  out.push(
    perMeNoteText(reading.parameters, reading.planVersion, reading.withoutAppealPosition),
  );
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

  const title = document.createElement("h3");
  title.id = "per-me-title";
  title.className = "per-me__title";
  title.textContent = perMeTitleFor(reading);
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

      const head = document.createElement("span");
      head.className = "per-me-row__head";
      head.appendChild(line("per-me-row__name", perMeHeadText(candidate)));
      head.appendChild(line("per-me-row__appeal", perMeAppealText(candidate)));
      row.appendChild(head);

      row.appendChild(line("per-me-row__anchor", perMeAnchorText(candidate)));
      row.appendChild(line("per-me-row__plan", perMePlanText(candidate)));
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
      reading.kind === "candidates" ? reading.planVersion : null,
      reading.kind === "candidates" ? reading.withoutAppealPosition : 0,
    );
    section.appendChild(note);
  }

  return section;
}

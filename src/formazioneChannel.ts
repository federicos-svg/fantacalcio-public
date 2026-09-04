// LE DUE PORTE DELLA PAGINA FORMAZIONE — leggere la lega, mandarle la formazione.
//
// QUI NON C'È NESSUNA RETE, ed è una regola di confine prima che di stile
// (CLAUDE.md, core pubblico): niente host, niente endpoint, niente header,
// niente credenziali, nemmeno il nome di una piattaforma. Questo file tiene due
// riferimenti — la porta di lettura e la porta di invio — e li chiama. Chi le
// implementa vive nel layer privato; nel core pubblico non sono collegate, e la
// pagina lo dichiara invece di fingere dati.
//
// PERCHÉ UN REGISTRO E NON UN IMPORT. Un import legherebbe la UI a una
// implementazione, e l'unica implementazione che il core pubblico può avere è
// una finta. Un registro tiene il buco visibile: finché nessuno collega niente,
// `readLineupChannelState()` risponde `porta_non_collegata`, che è la verità.
//
// OGNI ECCEZIONE DIVENTA UNO STATO DICHIARATO. Una porta che lancia non fa
// cadere lo schermo e non viene nemmeno tradotta in «non ho la formazione»: in
// lettura diventa `risposta_illeggibile`, in invio diventa `interrotta` — cioè
// «è partito e non sappiamo com'è finita», che è l'informazione da conservare.
// Trattare un invio esploso come «non inviato» sarebbe la bugia più costosa di
// questa schermata: si rimanderebbe sopra una formazione che forse è già lì.

import type {
  ConstraintReportLike,
  LineupChannelPort,
  LineupChannelState,
  LineupConstraints,
  LineupProducerPort,
  LineupSubmission,
  LineupSubmitPort,
  SubmitAttempt,
} from "../packages/league-channel-contract/src/index.js";

let channelPort: LineupChannelPort | null = null;
let submitPort: LineupSubmitPort | null = null;
let producerPort: LineupProducerPort | null = null;

/** Collega (o scollega, con `null`) la porta di lettura. */
export function connectLineupChannel(port: LineupChannelPort | null): void {
  channelPort = port;
}

/** Collega (o scollega, con `null`) la porta di invio. */
export function connectLineupSubmit(port: LineupSubmitPort | null): void {
  submitPort = port;
}

/** Collega (o scollega, con `null`) la porta del produttore di formazioni. */
export function connectLineupProducer(port: LineupProducerPort | null): void {
  producerPort = port;
}

/** Ciò che la lettura dei rapporti del produttore ha prodotto, e che cosa manca. */
export interface LineupProducerReports {
  readonly reports: ReadonlyMap<string, ConstraintReportLike>;
  /** Vuoto quando è andata bene, o quando il produttore non è collegato. */
  readonly failure: string;
}

const NESSUN_RAPPORTO: LineupProducerReports = { reports: new Map(), failure: "" };

/**
 * I MOTIVI DEL PRODUTTORE, competizione per competizione.
 *
 * `currentLineup` è la formazione che la lega riporta adesso, e va passata
 * sempre: con `locked: true` è quella che il produttore deve TENERE, e senza di
 * lei rifiuta invece di cercarne una di nascosto. La pagina ce l'ha già letta,
 * quindi non c'è nessuna ragione per non dargliela.
 *
 * Se il produttore non c'è, non si finge di averlo interrogato: si torna vuoti,
 * e la pagina mostrerà i soli motivi che sa provare da sé. Se c'è e rompe, lo si
 * DICE con `failure` invece di comportarsi come se non fosse mai stato
 * collegato: «non ha risposto» e «non c'è» sono due cose diverse.
 */
export function lineupProducerReports(
  state: LineupChannelState,
  constraintsByCompetition: ReadonlyMap<string, LineupConstraints>,
): LineupProducerReports {
  if (producerPort === null || state.kind !== "letto") return NESSUN_RAPPORTO;
  const reports = new Map<string, ConstraintReportLike>();
  try {
    for (const observed of state.competitions) {
      const competitionId = observed.competition.competitionId;
      const constraints = constraintsByCompetition.get(competitionId);
      if (constraints === undefined) continue;
      reports.set(
        competitionId,
        producerPort.report({
          competitionId,
          constraints,
          currentLineup: observed.state.kind === "letta" ? observed.state.lineup : null,
        }),
      );
    }
  } catch (error) {
    return {
      reports: new Map(),
      failure:
        "Il produttore di formazioni non ha risposto" +
        (error instanceof Error && error.message.length > 0 ? ` (${error.message})` : "") +
        ": i motivi mostrati qui sotto sono solo quelli che questa pagina sa provare da sé.",
    };
  }
  return { reports, failure: "" };
}

/**
 * Lo stato del canale, adesso.
 *
 * Tre esiti e tre cause distinte, perché sono rimedi diversi: nessuna porta
 * (`porta_non_collegata`), una porta che non restituisce niente
 * (`risposta_assente`), una porta che rompe o risponde qualcosa di non
 * interpretabile (`risposta_illeggibile`).
 */
export function readLineupChannelState(): LineupChannelState {
  if (channelPort === null) {
    return {
      kind: "sconosciuto",
      cause: "porta_non_collegata",
      detail: "",
    };
  }
  let state: LineupChannelState | null | undefined;
  try {
    state = channelPort.readState();
  } catch (error) {
    return {
      kind: "sconosciuto",
      cause: "risposta_illeggibile",
      detail: error instanceof Error ? error.message : "",
    };
  }
  if (state === null || state === undefined) {
    return { kind: "sconosciuto", cause: "risposta_assente", detail: "" };
  }
  return state;
}

/**
 * Manda l'invio alla porta, e riferisce che cosa è successo senza arrotondare.
 *
 * Non ritorna mai «fatto»: ritorna ciò che la porta ha detto, e `submissionUiState`
 * nel contratto di osservazione lo traduce nei tre stati che la pagina mostra.
 */
export function submitLineup(submission: LineupSubmission): SubmitAttempt {
  if (submitPort === null) {
    return {
      kind: "non_collegata",
      reason: "la porta di invio non è collegata in questa versione del sito",
    };
  }
  try {
    const attempt = submitPort.submit(submission);
    if (attempt === null || attempt === undefined) {
      return {
        kind: "interrotta",
        reason: "la porta di invio non ha detto com'è andata",
      };
    }
    return attempt;
  } catch (error) {
    return {
      kind: "interrotta",
      reason: error instanceof Error ? error.message : "la porta di invio si è interrotta",
    };
  }
}

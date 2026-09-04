// IL PARSER DELLA CLASSIFICA — contesto, non verità sulla lega.
//
// CHE COSA LEGGE: la classifica di Serie A come una fonte la pubblica —
// posizione, squadra, punti, partite, vinte, pareggiate, perse, gol fatti e
// subiti, differenza reti, andamento recente. Serve come contesto: chi sta
// bene, chi lotta.
//
// CHE COSA NON È: la classifica della lega. Sono due cose diverse, nessun numero
// dell'una si travasa nell'altra, e questo pacchetto non conosce la lega privata.
//
// OGNI COLONNA È UN CAMPO, E UNA COLONNA CHE NON C'È RESTA ASSENTE. Una fonte
// cambia le colonne che mostra; una colonna sparita che diventasse uno zero
// direbbe una cosa falsa con l'aria di un dato. Qui non c'è una sola riga che
// metta a zero un numero che non è stato letto.
//
// NIENTE SI CALCOLA AL POSTO DELLA FONTE. La differenza reti non si ricava dai
// gol fatti e subiti nemmeno quando sarebbe banale, e le partite giocate non si
// ricavano da vinte più pareggiate più perse. Le due verifiche che esistono —
// `goalDifferenceCheck` e `playedCheck` in `gameweekPages.ts` — dichiarano una
// divergenza; non la riparano.
//
// NIENTE RETE, NIENTE OROLOGIO, NIENTE NOMI DELLA FONTE: la tabella delle
// famiglie di chiavi arriva da fuori come parametro obbligatorio.

import { absentInSource, observed, type Field } from "./field.js";
import {
  arraysNamed,
  entriesOf,
  firstArrayIn,
  firstIntegerIn,
  firstLabelIn,
  firstReadableJson,
  firstWholeNumberIn,
  isRecord,
  label,
  stopAt,
  structuredBlocks,
} from "./indexPageScan.js";
import { readStandings, type FormOutcome, type ObservedStandings } from "./gameweekPages.js";
import type { ReadOutcome } from "./readOutcome.js";
import { readShapeTable, type ShapeTable } from "./sourceShape.js";

/**
 * Le famiglie di chiavi della classifica. Elenco chiuso: una in meno ferma il
 * parser prima che guardi il documento.
 */
export const STANDINGS_FAMILIES = [
  "rows",
  "position",
  "teamName",
  "points",
  "played",
  "won",
  "drawn",
  "lost",
  "goalsFor",
  "goalsAgainst",
  "goalDifference",
  "recentForm",
] as const;

export type StandingsFamily = (typeof STANDINGS_FAMILIES)[number];

/**
 * I modi di dire dell'andamento recente.
 *
 * Sono tre perché una fonte scrive «V», «N», «P» — o «W», «D», «L», o parole
 * intere — e nessuna di queste scritture appartiene a questo pacchetto: come i
 * nomi delle chiavi, arrivano da fuori.
 */
export const STANDINGS_WORDINGS = ["saysWin", "saysDraw", "saysLoss"] as const;

export type StandingsWording = (typeof STANDINGS_WORDINGS)[number];

export type StandingsShape = ShapeTable<StandingsFamily, StandingsWording>;

export function readStandingsShape(
  candidate: unknown,
  at: readonly string[] = ["standingsShape"],
): ReadOutcome<StandingsShape> {
  return readShapeTable(candidate, STANDINGS_FAMILIES, STANDINGS_WORDINGS, at);
}

/** I codici con cui questo parser dichiara di essersi fermato. Stabili: a valle ci si ragiona. */
export const STANDINGS_STOP_CODES = {
  emptyInput: "RAW_ASSENTE",
  noStructuredBlock: "BLOCCO_STRUTTURATO_ASSENTE",
  unreadableBlock: "BLOCCO_STRUTTURATO_ILLEGGIBILE",
  rowsNotOne: "ELENCO_RIGHE_NON_UNICO",
  rowsEmpty: "CLASSIFICA_VUOTA",
  rowUnreadable: "RIGA_NON_LEGGIBILE",
} as const;

/** Che cosa serve al parser, oltre al testo della pagina. */
export interface ParseStandingsRequest {
  /** Il contenuto grezzo già letto e depositato. Questa funzione non va a prenderlo. */
  readonly rawHtml: string;
  /** La tabella delle famiglie di chiavi, **obbligatoria**: vive nel privato. */
  readonly shape: StandingsShape;
  /** Etichetta della testata. Non un indirizzo: la lettura lo verifica. */
  readonly source: string;
  /** Etichetta della pagina. Non un percorso. */
  readonly page: string;
  /** Quando ABBIAMO LETTO, ISO-8601 con fuso. Lo passa chi chiama: qui non c'è orologio. */
  readonly observedAt: string;
  /**
   * La giornata che **avevamo chiesto**, se c'era.
   *
   * Una classifica non dichiara a quale giornata si riferisce, e questo parser
   * non le fa dire una cosa che non dice: il numero viaggia con l'origine
   * `requested-by-caller`, e `matchdayIfDeclared` continua a rispondere `null`.
   */
  readonly requestedMatchday: number | null;
}

function stop<T>(code: string, family: StandingsFamily | null, why: string): ReadOutcome<T> {
  return stopAt<T>("parseStandings", code, family, why);
}

/** Una colonna: il numero se la fonte lo dà, un'assenza dichiarata altrimenti. Mai uno zero. */
function wholeColumn(row: Record<string, unknown>, key: RegExp): Field<number> {
  const value = firstWholeNumberIn(row, key);
  return value === null ? absentInSource() : observed(value);
}

function formOutcomeFrom(value: unknown, shape: StandingsShape): FormOutcome | null {
  const text = label(value);
  if (text === null) return null;
  if (shape.wordings.saysWin.test(text)) return "win";
  if (shape.wordings.saysDraw.test(text)) return "draw";
  if (shape.wordings.saysLoss.test(text)) return "loss";
  return null;
}

/** Una riga letta, oppure **quale famiglia** non si è lasciata leggere. */
type RowResult =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly family: StandingsFamily };

function rowCandidate(element: unknown, shape: StandingsShape): RowResult {
  if (!isRecord(element)) return { ok: false, family: "rows" };

  // Posizione e squadra non sono campi: una riga senza uno dei due non è una
  // riga di classifica, ed è la struttura a essere cambiata.
  const position = firstWholeNumberIn(element, shape.keys.position);
  if (position === null || position < 1) return { ok: false, family: "position" };

  const team = firstLabelIn(element, shape.keys.teamName);
  if (team === null) return { ok: false, family: "teamName" };

  // L'ANDAMENTO RECENTE È TUTTO O NIENTE. Un esito che non si legge non si
  // salta: una serie più corta di quella pubblicata direbbe che la squadra ha
  // giocato meno partite di quante ne ha giocate.
  const rawForm = firstArrayIn(element, shape.keys.recentForm);
  let recentForm: Field<readonly FormOutcome[]> = absentInSource();
  if (rawForm !== null) {
    const outcomes: FormOutcome[] = [];
    for (const raw of rawForm) {
      const outcome = formOutcomeFrom(raw, shape);
      if (outcome === null) return { ok: false, family: "recentForm" };
      outcomes.push(outcome);
    }
    recentForm = observed(outcomes);
  }

  const goalDifference = firstIntegerIn(element, shape.keys.goalDifference);

  return {
    ok: true,
    value: {
      position,
      team,
      points: wholeColumn(element, shape.keys.points),
      played: wholeColumn(element, shape.keys.played),
      won: wholeColumn(element, shape.keys.won),
      drawn: wholeColumn(element, shape.keys.drawn),
      lost: wholeColumn(element, shape.keys.lost),
      goalsFor: wholeColumn(element, shape.keys.goalsFor),
      goalsAgainst: wholeColumn(element, shape.keys.goalsAgainst),
      // La differenza reti è l'unica colonna con segno: −7 è un numero
      // legittimo, e leggerla come le altre l'avrebbe rifiutata.
      goalDifference: goalDifference === null ? absentInSource() : observed(goalDifference),
      recentForm,
    },
  };
}

/**
 * DAL TESTO DELLA PAGINA AL TIPO DEL CONTRATTO — o a un esito che dice perché no.
 *
 * L'ultimo passo è deliberato: il candidato costruito qui passa da
 * `readStandings`, la stessa lettura fail-closed che userebbe chiunque altro.
 *
 * LA CLASSIFICA VUOTA È UNA FERMATA. Stessa scelta tecnica delle altre pagine,
 * dichiarata come tale e contestabile: una classifica senza righe che arrivasse
 * a valle sarebbe indistinguibile da un campionato non ancora cominciato.
 */
export function parseStandings(request: ParseStandingsRequest): ReadOutcome<ObservedStandings> {
  const shape = request.shape;
  if (request.rawHtml.length === 0) {
    return stop(STANDINGS_STOP_CODES.emptyInput, null, "nessun contenuto grezzo da leggere");
  }

  const blocks = structuredBlocks(request.rawHtml, shape.structuredBlocks);
  if (blocks.length === 0) {
    return stop(
      STANDINGS_STOP_CODES.noStructuredBlock,
      null,
      "nessuno dei modi dichiarati di estrarre il blocco di dati strutturati ha trovato qualcosa",
    );
  }
  const root = firstReadableJson(blocks);
  if (root === null) {
    return stop(STANDINGS_STOP_CODES.unreadableBlock, null, "nessuno dei blocchi trovati è JSON valido");
  }

  const entries = entriesOf(root);
  const rowLists = arraysNamed(entries, shape.keys.rows);
  if (rowLists.length !== 1) {
    return stop(
      STANDINGS_STOP_CODES.rowsNotOne,
      "rows",
      `attesa una sola classifica: trovati ${String(rowLists.length)} elenchi di righe`,
    );
  }
  const rowList = rowLists[0];
  if (rowList === undefined || !Array.isArray(rowList.value)) {
    return stop(STANDINGS_STOP_CODES.rowsNotOne, "rows", "elenco di righe non leggibile");
  }
  if (rowList.value.length === 0) {
    return stop(
      STANDINGS_STOP_CODES.rowsEmpty,
      "rows",
      "la classifica c'è ed è senza righe: nessuno può dire se il campionato non è cominciato o se la pagina è cambiata",
    );
  }

  const rows: Record<string, unknown>[] = [];
  for (const element of rowList.value) {
    const row = rowCandidate(element, shape);
    if (!row.ok) {
      return stop(
        STANDINGS_STOP_CODES.rowUnreadable,
        row.family,
        "una riga non ha la forma descritta: meglio nessuna classifica che una a metà",
      );
    }
    rows.push(row.value);
  }

  const candidate = {
    provenance: {
      source: request.source,
      page: request.page,
      observedAt: request.observedAt,
      matchday:
        request.requestedMatchday !== null &&
        Number.isInteger(request.requestedMatchday) &&
        request.requestedMatchday >= 1
          ? { origin: "requested-by-caller", number: request.requestedMatchday }
          : { origin: "unobserved" },
    },
    rows,
  };

  return readStandings(candidate, ["parseStandings"]);
}

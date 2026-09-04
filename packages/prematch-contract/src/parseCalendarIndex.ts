// IL PARSER DEL CALENDARIO — l'indice da cui si ricavano le pagine partita.
//
// PERCHÉ QUESTO PARSER È IL PIÙ IMPORTANTE DEI TRE. Senza l'indice, ogni
// lettura della giornata va indovinata a mano: quali partite si giocano, e
// quindi quali pagine andare a leggere. Con l'indice, la sequenza è un dato.
//
// CHE COSA DEVE RESTITUIRE, PER OGNI PARTITA: **le due squadre e la giornata** —
// quanto basta a chi, nel privato, sa costruire l'indirizzo di una pagina
// partita. Qui non c'è nessun indirizzo e non ce ne sarà: gli indirizzi vivono
// dall'altra parte del confine, e un indice che li portasse dentro farebbe
// entrare la fonte in un pacchetto che deve restarne fuori.
//
// LA GIORNATA NON SI RICAVA DALLA POSIZIONE NELL'ELENCO. È il vincolo che conta
// qui, ed è lo stesso errore che la provenienza esiste per impedire: il primo
// gruppo di un elenco **non è** la giornata 1, e un elenco che parte dalla 3
// perché le prime due sono già archiviate manderebbe ogni partita alla pagina
// sbagliata. Quindi: se il gruppo dichiara il suo numero, la giornata è
// `declared-by-source`; se non lo dichiara, è `unobserved`, **e basta**. Qui,
// a differenza delle altre pagine, non esiste nemmeno il ripiego
// `requested-by-caller` per il singolo gruppo: una pagina indice può portare
// più giornate insieme — misurato il 2026-09-04, serviva la 1 e la 2 — e
// attribuire a tutte quella che avevamo chiesto sarebbe la stessa deduzione
// travestita.
//
// NIENTE RETE, NIENTE OROLOGIO, NIENTE NOMI DELLA FONTE: la tabella delle
// famiglie di chiavi arriva da fuori come parametro obbligatorio.

import { absentInSource, observed, type Field } from "./field.js";
import {
  arraysNamed,
  declaredMatchdayIn,
  entriesOf,
  firstArrayIn,
  firstInstantIn,
  firstLabelIn,
  firstReadableJson,
  firstWholeNumberIn,
  isRecord,
  stopAt,
  structuredBlocks,
} from "./indexPageScan.js";
import { readCalendarIndex, type ObservedCalendarIndex, type ObservedScore } from "./gameweekPages.js";
import type { MatchdayReference } from "./provenance.js";
import { carryFailure, isRead, read, type ReadOutcome } from "./readOutcome.js";
import { readShapeTable, type ShapeTable } from "./sourceShape.js";

/**
 * Le famiglie di chiavi del calendario. Elenco chiuso: una in meno ferma il
 * parser prima che guardi il documento.
 *
 * `homeTeam` e `awayTeam` sono due famiglie distinte e non una sola con un
 * lato dichiarato a parte: in un indice le due squadre stanno una accanto
 * all'altra sotto due chiavi diverse, e pretendere qui la forma della pagina
 * partita avrebbe voluto dire non leggere niente.
 */
export const CALENDAR_INDEX_FAMILIES = [
  "gameweeks",
  "matchday",
  "fixtures",
  "homeTeam",
  "awayTeam",
  "kickOff",
  "homeScore",
  "awayScore",
] as const;

export type CalendarIndexFamily = (typeof CALENDAR_INDEX_FAMILIES)[number];

/** Il calendario non ha modi di dire da riconoscere: sono tutti numeri ed etichette. */
export const CALENDAR_INDEX_WORDINGS = [] as const;

export type CalendarIndexShape = ShapeTable<CalendarIndexFamily, never>;

export function readCalendarIndexShape(
  candidate: unknown,
  at: readonly string[] = ["calendarIndexShape"],
): ReadOutcome<CalendarIndexShape> {
  return readShapeTable<CalendarIndexFamily, never>(candidate, CALENDAR_INDEX_FAMILIES, CALENDAR_INDEX_WORDINGS, at);
}

/** I codici con cui questo parser dichiara di essersi fermato. Stabili: a valle ci si ragiona. */
export const CALENDAR_INDEX_STOP_CODES = {
  emptyInput: "RAW_ASSENTE",
  noStructuredBlock: "BLOCCO_STRUTTURATO_ASSENTE",
  unreadableBlock: "BLOCCO_STRUTTURATO_ILLEGGIBILE",
  gameweeksNotOne: "ELENCO_GIORNATE_NON_UNICO",
  gameweeksEmpty: "ELENCO_GIORNATE_VUOTO",
  gameweekNotRecord: "GIORNATA_NON_LEGGIBILE",
  fixturesMissing: "ELENCO_PARTITE_ASSENTE",
  fixturesEmpty: "ELENCO_PARTITE_VUOTO",
  fixtureUnreadable: "PARTITA_NON_LEGGIBILE",
} as const;

/** Che cosa serve al parser, oltre al testo della pagina. */
export interface ParseCalendarIndexRequest {
  /** Il contenuto grezzo già letto e depositato. Questa funzione non va a prenderlo. */
  readonly rawHtml: string;
  /** La tabella delle famiglie di chiavi, **obbligatoria**: vive nel privato. */
  readonly shape: CalendarIndexShape;
  /** Etichetta della testata. Non un indirizzo: la lettura lo verifica. */
  readonly source: string;
  /** Etichetta della pagina. Non un percorso. */
  readonly page: string;
  /** Quando ABBIAMO LETTO, ISO-8601 con fuso. Lo passa chi chiama: qui non c'è orologio. */
  readonly observedAt: string;
  /**
   * La giornata che **avevamo chiesto**, se c'era.
   *
   * Vale per la provenienza della pagina — che cosa siamo andati a cercare — e
   * **non scende mai nei singoli gruppi**: quelli dichiarano il proprio numero
   * o restano `unobserved`.
   */
  readonly requestedMatchday: number | null;
}

function stop<T>(code: string, family: CalendarIndexFamily | null, why: string): ReadOutcome<T> {
  return stopAt<T>("parseCalendarIndex", code, family, why);
}

/**
 * Il risultato, **solo se la fonte dà tutti e due i numeri**.
 *
 * Mezzo risultato non è un risultato: un 2 senza il numero dell'altra squadra
 * diventerebbe a valle un 2-0 che nessuno ha scritto.
 */
function scoreFrom(fixture: Record<string, unknown>, shape: CalendarIndexShape): Field<ObservedScore> {
  const home = firstWholeNumberIn(fixture, shape.keys.homeScore);
  const away = firstWholeNumberIn(fixture, shape.keys.awayScore);
  if (home === null || away === null) return absentInSource();
  return observed({ home, away });
}

/** Una partita dell'indice, oppure **quale famiglia** non si è lasciata leggere. */
type FixtureResult =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly family: CalendarIndexFamily };

function fixtureCandidate(element: unknown, shape: CalendarIndexShape): FixtureResult {
  if (!isRecord(element)) return { ok: false, family: "fixtures" };

  const home = firstLabelIn(element, shape.keys.homeTeam);
  if (home === null) return { ok: false, family: "homeTeam" };

  const away = firstLabelIn(element, shape.keys.awayTeam);
  if (away === null) return { ok: false, family: "awayTeam" };

  // Senza fuso il calcio d'inizio resta assente: un istante che non si può
  // ordinare rispetto al momento della lettura non serve a niente di ciò per
  // cui lo si legge.
  const kickOff = firstInstantIn(element, shape.keys.kickOff);

  return {
    ok: true,
    value: {
      home,
      away,
      kickOff: kickOff === null ? absentInSource() : observed(kickOff),
      score: scoreFrom(element, shape),
    },
  };
}

/**
 * CIÒ CHE SERVE A RITROVARE LA PAGINA DI UNA PARTITA.
 *
 * Le due squadre stanno sulla partita, la giornata sta sul gruppo: chi deve
 * ricostruire dove andare a leggere le vuole insieme, e senza questa funzione
 * le rimetterebbe insieme a mano ogni volta — cioè, prima o poi, guardando la
 * posizione nell'elenco.
 *
 * La giornata arriva **con la sua origine**: chi la usa vede da sé se la fonte
 * l'ha dichiarata o se non si sa, e `matchdayIfDeclared` resta l'unico modo di
 * ottenerne il numero per attribuire un'osservazione.
 */
export interface FixtureLookup {
  readonly home: string;
  readonly away: string;
  readonly matchday: MatchdayReference;
}

export function fixtureLookups(index: ObservedCalendarIndex): readonly FixtureLookup[] {
  const out: FixtureLookup[] = [];
  for (const gameweek of index.gameweeks) {
    for (const fixture of gameweek.fixtures) {
      out.push({ home: fixture.home, away: fixture.away, matchday: gameweek.matchday });
    }
  }
  return out;
}

function gameweekCandidate(
  element: unknown,
  shape: CalendarIndexShape,
): ReadOutcome<Record<string, unknown>> {
  if (!isRecord(element)) {
    return stop(CALENDAR_INDEX_STOP_CODES.gameweekNotRecord, "gameweeks", "una giornata che non è un oggetto");
  }

  const rawFixtures = firstArrayIn(element, shape.keys.fixtures);
  if (rawFixtures === null) {
    return stop(
      CALENDAR_INDEX_STOP_CODES.fixturesMissing,
      "fixtures",
      "questa giornata non porta il proprio elenco di partite",
    );
  }
  if (rawFixtures.length === 0) {
    return stop(
      CALENDAR_INDEX_STOP_CODES.fixturesEmpty,
      "fixtures",
      "l'elenco delle partite c'è ed è vuoto: nessuno può dire se la giornata non ha partite o se la pagina è cambiata",
    );
  }

  const fixtures: Record<string, unknown>[] = [];
  for (const raw of rawFixtures) {
    const fixture = fixtureCandidate(raw, shape);
    if (!fixture.ok) {
      return stop(
        CALENDAR_INDEX_STOP_CODES.fixtureUnreadable,
        fixture.family,
        "una partita non ha la forma descritta: meglio nessun indice che un indice a metà",
      );
    }
    fixtures.push(fixture.value);
  }

  // LA GIORNATA, O IL FATTO CHE NON SI SA. Nessun ripiego sulla posizione, e
  // nessun ripiego su ciò che avevamo chiesto.
  const declared = declaredMatchdayIn(element, shape.keys.matchday);
  const matchday: MatchdayReference =
    declared === null ? { origin: "unobserved" } : { origin: "declared-by-source", number: declared };

  return read({ matchday, fixtures });
}

/**
 * DAL TESTO DELLA PAGINA AL TIPO DEL CONTRATTO — o a un esito che dice perché no.
 *
 * L'ultimo passo è deliberato: il candidato costruito qui passa da
 * `readCalendarIndex`, la stessa lettura fail-closed che userebbe chiunque
 * altro.
 *
 * GLI ELENCHI VUOTI SONO FERMATE, non «zero partite». È una scelta tecnica
 * dell'Executive, dichiarata come tale e contestabile: un indice vuoto che
 * arrivasse a valle sarebbe indistinguibile da «questa giornata non si gioca», e
 * la conseguenza — non leggere nessuna pagina partita, senza che nessuno se ne
 * accorga — è peggiore di una fermata rumorosa.
 */
export function parseCalendarIndex(
  request: ParseCalendarIndexRequest,
): ReadOutcome<ObservedCalendarIndex> {
  const shape = request.shape;
  if (request.rawHtml.length === 0) {
    return stop(CALENDAR_INDEX_STOP_CODES.emptyInput, null, "nessun contenuto grezzo da leggere");
  }

  const blocks = structuredBlocks(request.rawHtml, shape.structuredBlocks);
  if (blocks.length === 0) {
    return stop(
      CALENDAR_INDEX_STOP_CODES.noStructuredBlock,
      null,
      "nessuno dei modi dichiarati di estrarre il blocco di dati strutturati ha trovato qualcosa",
    );
  }
  const root = firstReadableJson(blocks);
  if (root === null) {
    return stop(CALENDAR_INDEX_STOP_CODES.unreadableBlock, null, "nessuno dei blocchi trovati è JSON valido");
  }

  const entries = entriesOf(root);
  const gameweekLists = arraysNamed(entries, shape.keys.gameweeks);
  if (gameweekLists.length !== 1) {
    return stop(
      CALENDAR_INDEX_STOP_CODES.gameweeksNotOne,
      "gameweeks",
      `atteso un solo elenco di giornate: trovati ${String(gameweekLists.length)}`,
    );
  }
  const gameweekList = gameweekLists[0];
  if (gameweekList === undefined || !Array.isArray(gameweekList.value)) {
    return stop(CALENDAR_INDEX_STOP_CODES.gameweeksNotOne, "gameweeks", "elenco di giornate non leggibile");
  }
  if (gameweekList.value.length === 0) {
    return stop(
      CALENDAR_INDEX_STOP_CODES.gameweeksEmpty,
      "gameweeks",
      "l'elenco delle giornate c'è ed è vuoto: senza indice non si ricava nessuna pagina partita",
    );
  }

  const gameweeks: Record<string, unknown>[] = [];
  for (const element of gameweekList.value) {
    const gameweek = gameweekCandidate(element, shape);
    if (!isRead(gameweek)) return carryFailure(gameweek);
    gameweeks.push(gameweek.value);
  }

  const candidate = {
    provenance: {
      source: request.source,
      page: request.page,
      observedAt: request.observedAt,
      // LA PROVENIENZA DELLA PAGINA NON DICHIARA UNA GIORNATA. Un indice ne
      // porta più d'una: sceglierne una qui vorrebbe dire eleggerla «quella
      // corrente», che la pagina non dice. Ciò che sappiamo è che cosa avevamo
      // chiesto, e viaggia con l'origine che lo dice.
      matchday:
        request.requestedMatchday !== null &&
        Number.isInteger(request.requestedMatchday) &&
        request.requestedMatchday >= 1
          ? { origin: "requested-by-caller", number: request.requestedMatchday }
          : { origin: "unobserved" },
    },
    gameweeks,
  };

  return readCalendarIndex(candidate, ["parseCalendarIndex"]);
}

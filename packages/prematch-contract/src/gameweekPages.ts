// LE PAGINE DI GIORNATA — probabili di tutte le partite, calendario, classifica.
//
// Tre pagine diverse con un solo mestiere: dare **contesto** alla giornata.
// Nessuna di loro è la verità su chi è sceso in campo — quella sta sulla pagina
// della singola partita — e questo file non le lascia diventarlo.
//
// LA PAGINA DELLE PROBABILI DICHIARA DI ESSERE PROBABILE. Una formazione che si
// dichiarasse effettiva dentro una pagina di probabili è un `out-of-contract`:
// non perché sia impossibile, ma perché il lettore che ha costruito quel
// candidato ha mescolato due cose che il requisito di misurabilità vuole
// separate, e mescolate non si separano più a valle.
//
// IL CALENDARIO PUÒ PORTARE PIÙ DI UNA GIORNATA — misurato il 2026-09-04: la
// pagina indice serviva le giornate 1 e 2 insieme. Quindi il calendario qui è un
// elenco di giornate, ciascuna con la sua provenienza di giornata, e **nessuna
// di esse è "quella corrente"**: la pagina non lo dice, e noi non lo deduciamo.
//
// LA CLASSIFICA DI SERIE A NON È LA CLASSIFICA DELLA LEGA. Sono due cose
// diverse e il record lo scrive a chiare lettere: questa serve come contesto —
// chi sta bene, chi lotta — e nessun numero dell'una si travasa nell'altra.
// Questo pacchetto non conosce la lega privata, e non deve impararla.
//
// NIENTE SI CALCOLA AL POSTO DELLA FONTE. La differenza reti non si ricava dai
// gol fatti e subiti nemmeno quando sarebbe banale: se la fonte la dà si legge,
// se non la dà resta assente. Esiste però una verifica — `goalDifferenceCheck` —
// che quando ci sono tutti e tre i numeri dice se concordano. Dichiarare una
// divergenza è lecito e utile; ripararla no.

import { readField, type Field } from "./field.js";
import {
  readMatchdayReference,
  readProvenance,
  type MatchdayReference,
  type Provenance,
} from "./provenance.js";
import { readTeamLineup, type ObservedTeamLineup } from "./matchPage.js";
import {
  carryFailure,
  isRead,
  outOfContract,
  read,
  readInstant,
  readInteger,
  readLabel,
  readList,
  readRecord,
  readWholeNumber,
  shapeNotRecognised,
  type ReadOutcome,
} from "./readOutcome.js";

/** Una partita dentro la pagina generale delle probabili formazioni. */
export interface ObservedProbableMatch {
  readonly home: ObservedTeamLineup;
  readonly away: ObservedTeamLineup;
}

export interface ObservedProbableLineupsPage {
  readonly provenance: Provenance;
  readonly matches: readonly ObservedProbableMatch[];
}

/** Il risultato di una partita, come la fonte lo espone. */
export interface ObservedScore {
  readonly home: number;
  readonly away: number;
}

/**
 * Una partita nell'indice del calendario.
 *
 * Non porta collegamenti: gli indirizzi vivono nel layer privato, e un indice
 * che li portasse qui farebbe entrare la fonte dentro un pacchetto che deve
 * restarne fuori. Qui c'è chi gioca contro chi, quando, e — se la partita è
 * finita e la fonte lo dice — come è finita.
 */
export interface ObservedFixture {
  readonly home: string;
  readonly away: string;
  readonly kickOff: Field<string>;
  readonly score: Field<ObservedScore>;
}

/** Una giornata dell'indice, con la provenienza del proprio numero. */
export interface ObservedGameweekFixtures {
  readonly matchday: MatchdayReference;
  readonly fixtures: readonly ObservedFixture[];
}

export interface ObservedCalendarIndex {
  readonly provenance: Provenance;
  readonly gameweeks: readonly ObservedGameweekFixtures[];
}

/** L'esito di una partita nell'andamento recente, come la fonte lo espone. */
export type FormOutcome = "win" | "draw" | "loss";

/**
 * Una riga di classifica.
 *
 * Le colonne sono quelle misurate il 2026-09-04 e sono **tutte campi**: una
 * fonte può cambiare le colonne che mostra, e una colonna che sparisce deve
 * diventare un'assenza dichiarata, non uno zero.
 */
export interface StandingsRow {
  readonly position: number;
  readonly team: string;
  readonly points: Field<number>;
  readonly played: Field<number>;
  readonly won: Field<number>;
  readonly drawn: Field<number>;
  readonly lost: Field<number>;
  readonly goalsFor: Field<number>;
  readonly goalsAgainst: Field<number>;
  readonly goalDifference: Field<number>;
  readonly recentForm: Field<readonly FormOutcome[]>;
}

export interface ObservedStandings {
  readonly provenance: Provenance;
  readonly rows: readonly StandingsRow[];
}

/** L'esito di un controllo che non ripara niente. */
export type AgreementCheck = "agree" | "disagree" | "not-checkable";

/**
 * La differenza reti dichiarata concorda con i gol dichiarati?
 *
 * `not-checkable` quando uno dei tre numeri non è stato osservato: è la
 * risposta onesta, e non c'è nessuna versione di questa funzione che calcoli il
 * terzo numero dagli altri due. Una divergenza si mostra a chi legge; correggere
 * la fonte non è mestiere di questo pacchetto.
 */
export function goalDifferenceCheck(row: StandingsRow): AgreementCheck {
  if (
    row.goalsFor.presence !== "observed" ||
    row.goalsAgainst.presence !== "observed" ||
    row.goalDifference.presence !== "observed"
  ) {
    return "not-checkable";
  }
  return row.goalsFor.value - row.goalsAgainst.value === row.goalDifference.value ? "agree" : "disagree";
}

/**
 * Le partite giocate dichiarate concordano con vinte, pareggiate e perse?
 *
 * Stessa regola della precedente: si controlla, si dichiara, non si aggiusta.
 */
export function playedCheck(row: StandingsRow): AgreementCheck {
  if (
    row.played.presence !== "observed" ||
    row.won.presence !== "observed" ||
    row.drawn.presence !== "observed" ||
    row.lost.presence !== "observed"
  ) {
    return "not-checkable";
  }
  return row.won.value + row.drawn.value + row.lost.value === row.played.value ? "agree" : "disagree";
}

function readProbableMatch(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedProbableMatch> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const home = readTeamLineup(record.value["home"], [...at, "home"]);
  if (!isRead(home)) return carryFailure(home);

  const away = readTeamLineup(record.value["away"], [...at, "away"]);
  if (!isRead(away)) return carryFailure(away);

  for (const [side, lineup] of [
    ["home", home.value],
    ["away", away.value],
  ] as const) {
    if (lineup.nature !== "probable") {
      return outOfContract<ObservedProbableMatch>(
        "una pagina di probabili non porta formazioni effettive: la verità su chi è sceso in campo sta sulla pagina della partita",
        [...at, side, "nature"],
      );
    }
  }

  if (home.value.team === away.value.team) {
    return outOfContract<ObservedProbableMatch>("le due squadre di una partita non possono essere la stessa", at);
  }

  return read({ home: home.value, away: away.value });
}

export function readProbableLineupsPage(
  candidate: unknown,
  at: readonly string[] = ["probableLineupsPage"],
): ReadOutcome<ObservedProbableLineupsPage> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const provenance = readProvenance(record.value["provenance"], [...at, "provenance"]);
  if (!isRead(provenance)) return carryFailure(provenance);

  const matches = readList(record.value["matches"], [...at, "matches"], readProbableMatch);
  if (!isRead(matches)) return carryFailure(matches);

  return read({ provenance: provenance.value, matches: matches.value });
}

function readScore(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedScore> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const home = readWholeNumber(record.value["home"], [...at, "home"]);
  if (!isRead(home)) return carryFailure(home);

  const away = readWholeNumber(record.value["away"], [...at, "away"]);
  if (!isRead(away)) return carryFailure(away);

  return read({ home: home.value, away: away.value });
}

function readFixture(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedFixture> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const home = readLabel(record.value["home"], [...at, "home"]);
  if (!isRead(home)) return carryFailure(home);

  const away = readLabel(record.value["away"], [...at, "away"]);
  if (!isRead(away)) return carryFailure(away);

  if (home.value === away.value) {
    return outOfContract<ObservedFixture>("le due squadre di una partita non possono essere la stessa", at);
  }

  const kickOff = readField(record.value["kickOff"], [...at, "kickOff"], readInstant);
  if (!isRead(kickOff)) return carryFailure(kickOff);

  const score = readField(record.value["score"], [...at, "score"], readScore);
  if (!isRead(score)) return carryFailure(score);

  return read({ home: home.value, away: away.value, kickOff: kickOff.value, score: score.value });
}

function readGameweekFixtures(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedGameweekFixtures> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const matchday = readMatchdayReference(record.value["matchday"], [...at, "matchday"]);
  if (!isRead(matchday)) return carryFailure(matchday);

  const fixtures = readList(record.value["fixtures"], [...at, "fixtures"], readFixture);
  if (!isRead(fixtures)) return carryFailure(fixtures);

  return read({ matchday: matchday.value, fixtures: fixtures.value });
}

export function readCalendarIndex(
  candidate: unknown,
  at: readonly string[] = ["calendarIndex"],
): ReadOutcome<ObservedCalendarIndex> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const provenance = readProvenance(record.value["provenance"], [...at, "provenance"]);
  if (!isRead(provenance)) return carryFailure(provenance);

  const gameweeks = readList(record.value["gameweeks"], [...at, "gameweeks"], readGameweekFixtures);
  if (!isRead(gameweeks)) return carryFailure(gameweeks);

  return read({ provenance: provenance.value, gameweeks: gameweeks.value });
}

function readFormOutcome(candidate: unknown, at: readonly string[]): ReadOutcome<FormOutcome> {
  if (candidate === "win" || candidate === "draw" || candidate === "loss") return read(candidate);
  return shapeNotRecognised<FormOutcome>("atteso win, draw oppure loss", at);
}

function readStandingsRow(candidate: unknown, at: readonly string[]): ReadOutcome<StandingsRow> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const position = readWholeNumber(record.value["position"], [...at, "position"]);
  if (!isRead(position)) return carryFailure(position);
  if (position.value < 1) {
    return outOfContract<StandingsRow>("una posizione di classifica parte da 1", [...at, "position"]);
  }

  const team = readLabel(record.value["team"], [...at, "team"]);
  if (!isRead(team)) return carryFailure(team);

  // Sette colonne lette una per una e non in ciclo: un ciclo su un dizionario
  // avrebbe avuto bisogno di un ripiego per la colonna che il compilatore non
  // sa esserci, e un ripiego è esattamente ciò che questo pacchetto vieta.
  const points = readField(record.value["points"], [...at, "points"], readWholeNumber);
  if (!isRead(points)) return carryFailure(points);
  const played = readField(record.value["played"], [...at, "played"], readWholeNumber);
  if (!isRead(played)) return carryFailure(played);
  const won = readField(record.value["won"], [...at, "won"], readWholeNumber);
  if (!isRead(won)) return carryFailure(won);
  const drawn = readField(record.value["drawn"], [...at, "drawn"], readWholeNumber);
  if (!isRead(drawn)) return carryFailure(drawn);
  const lost = readField(record.value["lost"], [...at, "lost"], readWholeNumber);
  if (!isRead(lost)) return carryFailure(lost);
  const goalsFor = readField(record.value["goalsFor"], [...at, "goalsFor"], readWholeNumber);
  if (!isRead(goalsFor)) return carryFailure(goalsFor);
  const goalsAgainst = readField(record.value["goalsAgainst"], [...at, "goalsAgainst"], readWholeNumber);
  if (!isRead(goalsAgainst)) return carryFailure(goalsAgainst);

  // La differenza reti è l'unica colonna con segno: −7 è un numero legittimo,
  // e leggerla come le altre l'avrebbe rifiutata.
  const goalDifference = readField(record.value["goalDifference"], [...at, "goalDifference"], readInteger);
  if (!isRead(goalDifference)) return carryFailure(goalDifference);

  const recentForm = readField(record.value["recentForm"], [...at, "recentForm"], (value, valueAt) =>
    readList(value, valueAt, readFormOutcome),
  );
  if (!isRead(recentForm)) return carryFailure(recentForm);

  return read({
    position: position.value,
    team: team.value,
    points: points.value,
    played: played.value,
    won: won.value,
    drawn: drawn.value,
    lost: lost.value,
    goalsFor: goalsFor.value,
    goalsAgainst: goalsAgainst.value,
    goalDifference: goalDifference.value,
    recentForm: recentForm.value,
  });
}

export function readStandings(
  candidate: unknown,
  at: readonly string[] = ["standings"],
): ReadOutcome<ObservedStandings> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const provenance = readProvenance(record.value["provenance"], [...at, "provenance"]);
  if (!isRead(provenance)) return carryFailure(provenance);

  const rows = readList(record.value["rows"], [...at, "rows"], readStandingsRow);
  if (!isRead(rows)) return carryFailure(rows);

  return read({ provenance: provenance.value, rows: rows.value });
}

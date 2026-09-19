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
// LA PREVISIONE SU UN GIOCATORE VIVE QUI, e non nel tipo del giocatore. La
// percentuale di titolarità e il «in dubbio» sono affermazioni su una partita
// che deve ancora cominciare: sulla pagina della partita, dove la stessa
// struttura racconta chi è sceso in campo, non vorrebbero dire niente. Stanno
// quindi in `ObservedStartingForecast`, accanto alle formazioni della pagina
// delle probabili e non dentro di esse — vedi `ObservedProbableMatch`.
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

import { readField, readFieldOrUnobserved, type Field } from "./field.js";
import {
  readMatchdayReference,
  readProvenance,
  type MatchdayReference,
  type Provenance,
} from "./provenance.js";
import { readCompleteness, readTeamLineup, type Completeness, type ObservedTeamLineup } from "./matchPage.js";
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

/**
 * LA PREVISIONE DELLA FONTE SU UN GIOCATORE — percentuale di titolarità e
 * dubbio, e perché stanno qui e non dentro `ObservedPlayer`.
 *
 * `ObservedPlayer` descrive **un nome in una lista**, e la stessa struttura
 * serve la pagina della partita, dove la lista dice chi è **sceso in campo**.
 * Una percentuale di titolarità su chi è già sceso in campo non significa
 * niente, e un giocatore «in dubbio» che ha giocato nemmeno: sono affermazioni
 * su una partita che deve ancora cominciare. Appenderle al giocatore osservato
 * avrebbe messo una previsione dentro il tipo che serve anche a raccontare i
 * fatti — e le due cose, una volta mescolate, a valle non si separano più.
 * Stanno quindi qui, nella casa della pagina delle **probabili**, che è la
 * pagina dove quelle affermazioni esistono.
 *
 * `player` è l'etichetta della fonte, non un'identità risolta: è la stessa
 * avvertenza di `ObservedPlayer.displayName`, e vale qui per intero. Questo
 * pacchetto **non ricongiunge** la previsione al giocatore dell'undici: i due
 * elenchi arrivano come la fonte li scrive, e chi consuma decide che cosa farne.
 * Nemmeno si pretende che ogni nome previsto compaia in formazione — una fonte
 * può dare una percentuale a un giocatore che poi non schiera — e una verifica
 * del genere qui dentro rifiuterebbe come «fuori contratto» un fatto vero.
 */
export interface ObservedStartingForecast {
  readonly player: string;
  /**
   * LA PERCENTUALE COME LA FONTE LA SCRIVE, nella scala della fonte: da 0 a
   * 100. Non si riscala a 0–1, non si arrotonda, non si confronta con niente.
   *
   * `0` OSSERVATO È UN DATO, non un'assenza: vuol dire che la fonte ha scritto
   * zero. L'assenza è il campo che dichiara di non esserci, ed è l'unica cosa
   * che questo contratto accetta quando la fonte tace — mai uno zero di comodo,
   * che a valle sarebbe indistinguibile da «non giocherà di sicuro».
   */
  readonly startingProbability: Field<number>;
  /**
   * «IN DUBBIO», **dichiarato dalla fonte**.
   *
   * Tre stati e non due, ed è il motivo per cui è un campo e non un booleano
   * nudo: `true` è «la fonte lo dà in dubbio», `false` è «la fonte dice che in
   * dubbio non è», e l'assenza è «la fonte non si esprime». Un booleano solo
   * avrebbe schiacciato gli ultimi due su `false`, cioè avrebbe fatto dire alla
   * fonte una cosa che non ha detto.
   *
   * NON SI RICAVA DALLA PERCENTUALE, in nessuna direzione. Una soglia — «sotto
   * il 60% è in dubbio» — sarebbe una nostra regola spacciata per una lettura,
   * e questo contratto non ne ha nemmeno una.
   */
  readonly doubtful: Field<boolean>;
}

/**
 * Le previsioni per una squadra, **con la dichiarazione di quanto l'elenco è
 * completo**.
 *
 * Stessa regola di ogni altra lista del contratto, e qui serve a impedire una
 * deduzione precisa: da un elenco di previsioni non dichiarato completo non si
 * ricava che i giocatori non nominati siano titolari sicuri, né che non siano
 * in dubbio. Non se ne ricava niente.
 */
export interface ObservedForecastList {
  readonly forecasts: readonly ObservedStartingForecast[];
  readonly completeness: Completeness;
}

/**
 * Una partita dentro la pagina generale delle probabili formazioni.
 *
 * Le due previsioni stanno accanto alle due formazioni e non dentro di esse: la
 * formazione è `ObservedTeamLineup`, che la pagina delle probabili **divide con
 * la pagina della partita**, dove una previsione non avrebbe senso. Un campo di
 * lato — `homeForecasts`, `awayForecasts` — tiene la previsione dove la
 * previsione esiste, e lascia intatto il tipo condiviso.
 */
export interface ObservedProbableMatch {
  readonly home: ObservedTeamLineup;
  readonly away: ObservedTeamLineup;
  readonly homeForecasts: Field<ObservedForecastList>;
  readonly awayForecasts: Field<ObservedForecastList>;
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

/**
 * Una percentuale come la fonte la scrive: da 0 a 100, decimali ammessi.
 *
 * I decimali passano perché una fonte che scrive `87.5` ha scritto ottantasette
 * e mezzo, e rifiutarlo — o arrotondarlo — sarebbe questo pacchetto che corregge
 * la fonte. Fuori dall'intervallo ci si ferma invece di riscalare: un `250` non
 * è una percentuale, è una colonna diversa finita lì, e riscalarlo produrrebbe
 * un numero credibile e falso.
 */
function readPercentage(candidate: unknown, at: readonly string[]): ReadOutcome<number> {
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    return shapeNotRecognised<number>("attesa una percentuale come numero", at);
  }
  if (candidate < 0 || candidate > 100) {
    return outOfContract<number>("una percentuale di titolarità sta fra 0 e 100, e non si riscala", at);
  }
  return read(candidate);
}

/** Un sì o un no **dichiarato**: una stringa o un numero qui non sono un sì. */
function readDeclaredFlag(candidate: unknown, at: readonly string[]): ReadOutcome<boolean> {
  if (typeof candidate !== "boolean") {
    return shapeNotRecognised<boolean>("atteso un sì o un no dichiarato dalla fonte", at);
  }
  return read(candidate);
}

export function readStartingForecast(
  candidate: unknown,
  at: readonly string[],
): ReadOutcome<ObservedStartingForecast> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const player = readLabel(record.value["player"], [...at, "player"]);
  if (!isRead(player)) return carryFailure(player);

  const startingProbability = readField(
    record.value["startingProbability"],
    [...at, "startingProbability"],
    readPercentage,
  );
  if (!isRead(startingProbability)) return carryFailure(startingProbability);

  const doubtful = readField(record.value["doubtful"], [...at, "doubtful"], readDeclaredFlag);
  if (!isRead(doubtful)) return carryFailure(doubtful);

  return read({
    player: player.value,
    startingProbability: startingProbability.value,
    doubtful: doubtful.value,
  });
}

function readForecastList(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedForecastList> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const forecasts = readList(record.value["forecasts"], [...at, "forecasts"], readStartingForecast);
  if (!isRead(forecasts)) return carryFailure(forecasts);

  const completeness = readCompleteness(record.value["completeness"], [...at, "completeness"]);
  if (!isRead(completeness)) return carryFailure(completeness);

  return read({ forecasts: forecasts.value, completeness: completeness.value });
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
    // `undeclared` PASSA, `actual` NO, E LA DIFFERENZA NON È UNA SFUMATURA.
    // «Effettiva» è una dichiarazione della fonte, e una pagina di probabili che
    // la scrive sta pubblicando qualcosa che va letto dove la verità vive — la
    // pagina della partita — non qui. «Non dichiarata» non è una dichiarazione:
    // è il silenzio misurato sul depositato, e rifiutarlo qui vorrebbe dire
    // buttare via l'unica fonte che i dati ce li ha. Passa, e si porta dietro
    // l'incertezza: `canStandAsTruth` le nega la verità comunque.
    if (lineup.nature === "actual") {
      return outOfContract<ObservedProbableMatch>(
        "una pagina di probabili non porta formazioni dichiarate effettive: la verità su chi è sceso in campo sta sulla pagina della partita",
        [...at, side, "nature"],
      );
    }
  }

  if (home.value.team === away.value.team) {
    return outOfContract<ObservedProbableMatch>("le due squadre di una partita non possono essere la stessa", at);
  }

  // Le previsioni sono nate dopo la pagina: un candidato che non le nomina è un
  // lettore scritto prima, e di lui si può dire soltanto che non ha guardato.
  const homeForecasts = readFieldOrUnobserved(
    record.value["homeForecasts"],
    [...at, "homeForecasts"],
    readForecastList,
  );
  if (!isRead(homeForecasts)) return carryFailure(homeForecasts);

  const awayForecasts = readFieldOrUnobserved(
    record.value["awayForecasts"],
    [...at, "awayForecasts"],
    readForecastList,
  );
  if (!isRead(awayForecasts)) return carryFailure(awayForecasts);

  return read({
    home: home.value,
    away: away.value,
    homeForecasts: homeForecasts.value,
    awayForecasts: awayForecasts.value,
  });
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

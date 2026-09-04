// LA PAGINA DI UNA PARTITA — la formazione, e chi è sceso in campo davvero.
//
// Che cosa descrive questo file: **ciò che una pagina pre-partita espone su una
// singola partita** — formazione per squadra, panchina, sostituzioni, modulo,
// allenatore, arbitro — e nient'altro. Nessun host, nessun indirizzo, nessun
// selettore: chi legge la pagina vive nel layer privato e consegna qui un
// candidato già estratto. Questo pacchetto dice che forma deve avere, e lo
// rifiuta quando non ce l'ha.
//
// LA PREVISIONE E LA VERITÀ SONO LA STESSA STRUTTURA, e non è un risparmio: è
// il fatto osservato il 2026-09-04 — la stessa pagina porta le probabili prima
// del fischio d'inizio e le formazioni effettive dopo. Quello che le distingue
// non è la forma, sono due cose che vanno tenute separate con cura:
//
//   * `nature`, che la fonte DICHIARA — probabile oppure effettiva. Non si
//     deduce: una pagina che non lo dichiara non produce una formazione, perché
//     una previsione scambiata per una verità falsa ogni misura futura;
//   * il MOMENTO dell'istantanea rispetto al calcio d'inizio, che si calcola
//     dagli istanti e serve alla regola (a) del requisito di misurabilità:
//     vale l'ultima istantanea presa prima del calcio d'inizio, e ciò che una
//     fonte scrive dopo non conta come previsione.
//
// I DUE NON SI IMPLICANO. Una fonte può pubblicare le formazioni ufficiali un'ora
// prima del fischio: `nature` è «effettiva» e l'istantanea è «prima». Chi
// confondesse le due dimensioni finirebbe per dedurre l'una dall'altra, che è
// esattamente il divieto.
//
// OGNI LISTA DICE QUANTO È COMPLETA, e chi la legge non lo indovina. È il
// requisito che nasce dalla misura di affidabilità e cade qui: una fonte che
// nomina l'undici e tace sulla panchina non è una fonte che ha detto «questi
// undici e nessun altro». Vedi `Completeness` e `ObservedRoster` qui sotto.
//
// QUESTO FILE NON MISURA NIENTE. Il confronto per giocatore, l'aggregazione per
// fonte e per squadra, le soglie e i pesi sono lavoro futuro, esplicitamente non
// progettato nel record che autorizza queste pagine. Qui c'è solo la materia
// prima che quel lavoro richiederà: dati con la loro provenienza, e un'istantanea
// che sa dire da che parte del fischio d'inizio sta.

import { readField, type Field } from "./field.js";
import { readProvenance, type Provenance } from "./provenance.js";
import {
  carryFailure,
  isRead,
  outOfContract,
  read,
  readInstant,
  readLabel,
  readList,
  readRecord,
  readWholeNumber,
  shapeNotRecognised,
  type ReadOutcome,
} from "./readOutcome.js";

/**
 * QUANTO LA FONTE DICHIARA DI AVER DETTO — e perché è un dato, non un dettaglio.
 *
 * Una lista di nomi, da sola, non dice se è tutta la lista. E quella differenza
 * decide se una fonte è brava o se ha soltanto taciuto: se una pagina nomina
 * l'undici e non dice niente della panchina, ogni panchinaro le risulterebbe
 * «previsto non titolare» — e siccome in panchina si va spesso, la fonte
 * apparirebbe **brava per caso**, con un merito che nessuno le ha visto
 * guadagnare. Sapendo invece che quella lista è parziale, quei giocatori escono
 * dal conto come **silenzio**, che è la verità.
 *
 * Tre valori e non due:
 *
 *   * `declared-complete` — la fonte dichiara che quella lista è completa. Solo
 *     qui l'assenza di un nome è un'informazione;
 *   * `declared-partial` — la fonte dichiara che ne manca un pezzo;
 *   * `unknown` — **la pagina non lo dice**, ed è il valore di gran lunga più
 *     frequente. Non è un ripiego prudente: è il fatto.
 *
 * **`unknown` non ha un default ottimista, e non ne avrà mai uno.** Chi in
 * futuro sarà tentato di far valere «completa» quando la pagina tace stia
 * attento a che cosa compra: guadagna qualche osservazione in più nella misura,
 * e in cambio regala punteggio a ogni fonte che si è limitata a scrivere meno.
 * Il conto non torna in nessun caso.
 *
 * NON SI DEDUCE DAL CONTEGGIO. Undici nomi non dichiarano una lista completa —
 * una fonte può pubblicarne undici perché sono quelli che sa, non perché siano
 * tutti — e questo pacchetto non ha, e non deve avere, una funzione che guardi
 * la lunghezza dell'elenco per decidere.
 */
export type Completeness = "declared-complete" | "declared-partial" | "unknown";

/**
 * Una lista di giocatori **con la dichiarazione di quanto è completa**.
 *
 * I due dati viaggiano insieme perché separarli è precisamente il modo in cui
 * si perdono: una lista che gira da sola arriva a valle senza il suo «forse
 * manca qualcuno», e a valle nessuno può più recuperarlo.
 *
 * Attenzione alla distinzione che è già costata cara: `players: []` dentro un
 * campo osservato significa «la fonte espone la sezione e lì non c'è nessuno»;
 * una panchina che sulla pagina **non compare affatto** non è una panchina
 * vuota, è un campo `absent-in-source` o `not-observed`, e non deve mai
 * diventare un elenco vuoto.
 */
export interface ObservedRoster {
  readonly players: readonly ObservedPlayer[];
  readonly completeness: Completeness;
}

/**
 * La completezza di una lista, tenendo conto anche del caso in cui la lista non
 * ci sia: nessuna lista, nessuna dichiarazione, quindi `unknown`.
 */
export function rosterCompleteness(roster: Field<ObservedRoster>): Completeness {
  return roster.presence === "observed" ? roster.value.completeness : "unknown";
}

/**
 * L'ASSENZA DI UN NOME DA QUESTA LISTA VUOL DIRE QUALCOSA?
 *
 * Vero **solo** se la lista è stata osservata e la fonte la dichiara completa.
 * È la funzione che chi misura l'affidabilità di una fonte deve attraversare
 * prima di contare un giocatore come «non previsto»: fuori di qui quel conto si
 * fa a occhio, e a occhio si conta il silenzio come una previsione.
 */
export function absenceIsMeaningful(roster: Field<ObservedRoster>): boolean {
  return rosterCompleteness(roster) === "declared-complete";
}

/**
 * Un giocatore come la fonte lo scrive.
 *
 * `displayName` è l'etichetta della fonte, **non un'identità risolta**: due
 * fonti scrivono lo stesso giocatore in due modi, e riconciliarli è un altro
 * mestiere con un'altra casa. Inventare qui un identificativo significherebbe
 * decidere in silenzio che due nomi sono la stessa persona.
 */
export interface ObservedPlayer {
  readonly displayName: string;
  readonly shirtNumber: Field<number>;
  /** L'etichetta di ruolo della fonte, se c'è: non il ruolo di lega. */
  readonly role: Field<string>;
}

/**
 * Una sostituzione.
 *
 * `minute` è un campo, e sulla pagina partita osservata il 2026-09-04 è
 * **assente nella fonte**: i minuti di ingresso e di uscita lì non ci sono. Il
 * tipo lo sa dire; il lettore non lo inventa.
 */
export interface ObservedSubstitution {
  readonly off: string;
  readonly on: string;
  readonly minute: Field<number>;
}

/**
 * Un ballottaggio: due o più nomi in lizza per lo stesso posto.
 *
 * `favourite` esiste solo se **la fonte** indica un favorito. Nessuna funzione
 * di questo pacchetto ne sceglie uno: un ballottaggio risolto da noi sarebbe un
 * output direttivo travestito da lettura.
 */
export interface ObservedDuel {
  readonly contenders: readonly string[];
  readonly favourite: Field<string>;
}

/** Che cosa la fonte dichiara di stare pubblicando. Mai dedotto. */
export type LineupNature = "probable" | "actual";

/**
 * Il modulo come la fonte lo scrive — «4-3-3», «3-5-2».
 *
 * È il modulo **della fonte**, non il modulo del regolamento della lega: i due
 * vivono in mondi diversi e questo pacchetto non conosce il secondo. La lettura
 * controlla soltanto che il testo abbia la forma di un modulo; non verifica che
 * i numeri sommino a dieci, perché una fonte che scrive un modulo impossibile è
 * un fatto da dichiarare, non da correggere.
 */
export type FormationShape = string;

export interface ObservedTeamLineup {
  /** L'etichetta della squadra come la fonte la scrive. */
  readonly team: string;
  readonly nature: LineupNature;
  readonly module: Field<FormationShape>;
  readonly coach: Field<string>;
  readonly starters: Field<ObservedRoster>;
  readonly bench: Field<ObservedRoster>;
  readonly substitutions: Field<readonly ObservedSubstitution[]>;
  readonly unavailable: Field<ObservedRoster>;
  readonly suspended: Field<ObservedRoster>;
  readonly duels: Field<readonly ObservedDuel[]>;
  /**
   * La formazione **nel suo insieme**: la fonte dichiara di aver detto tutto
   * quello che c'era da dire su questa squadra, oppure no.
   *
   * Non si ricava dalla completezza delle singole liste, e non è la loro
   * congiunzione: una fonte può dichiarare completo l'undici e completa la
   * panchina, e tacere che gli indisponibili li pubblica altrove. Ricavarlo
   * sarebbe la solita deduzione, con la solita conseguenza — una fonte che
   * sembra più informativa di quanto sia.
   */
  readonly completeness: Completeness;
}

/**
 * La pagina di una partita.
 *
 * `referee` è un campo come gli altri: il record lo ammette «se la pagina lo
 * espone», e una pagina che non lo espone lo dichiara assente.
 */
export interface ObservedMatchPage {
  readonly provenance: Provenance;
  readonly home: ObservedTeamLineup;
  readonly away: ObservedTeamLineup;
  readonly kickOff: Field<string>;
  readonly referee: Field<string>;
}

/** Da che parte del fischio d'inizio sta un'istantanea. */
export type SnapshotSide = "before-kick-off" | "after-kick-off" | "undetermined";

/**
 * Colloca un'istantanea rispetto al calcio d'inizio — fail-closed.
 *
 * Tre esiti e non due, perché il caso in cui non si sa è reale e frequente: se
 * il calcio d'inizio non è stato osservato, l'istantanea è `undetermined` e
 * **non vale né come previsione né come verifica**. Anche l'istante esattamente
 * uguale al fischio d'inizio è `undetermined`: non è «prima» in nessun senso
 * utile, e chiamarlo previsione sarebbe un arrotondamento a nostro favore.
 */
export function classifySnapshot(observedAt: string, kickOff: Field<string>): SnapshotSide {
  if (kickOff.presence !== "observed") return "undetermined";
  const observedMs = Date.parse(observedAt);
  const kickOffMs = Date.parse(kickOff.value);
  if (Number.isNaN(observedMs) || Number.isNaN(kickOffMs)) return "undetermined";
  if (observedMs < kickOffMs) return "before-kick-off";
  if (observedMs > kickOffMs) return "after-kick-off";
  return "undetermined";
}

/** L'istantanea di questa pagina, rispetto al suo calcio d'inizio. */
export function matchPageSnapshot(page: ObservedMatchPage): SnapshotSide {
  return classifySnapshot(page.provenance.observedAt, page.kickOff);
}

const MODULE_SHAPE = /^\d{1,2}(-\d{1,2}){1,4}$/;

function readModule(candidate: unknown, at: readonly string[]): ReadOutcome<FormationShape> {
  const label = readLabel(candidate, at);
  if (!isRead(label)) return label;
  if (!MODULE_SHAPE.test(label.value)) {
    return outOfContract<FormationShape>("un modulo è fatto di numeri separati da trattini", at);
  }
  return label;
}

function readMinute(candidate: unknown, at: readonly string[]): ReadOutcome<number> {
  const minute = readWholeNumber(candidate, at);
  if (!isRead(minute)) return minute;
  // Nessun tetto sui recuperi: 90+7 si scrive 97, e un minuto alto è un fatto,
  // non un errore. Il tetto largo serve solo a fermare un numero che non è un
  // minuto — un anno, un identificativo — finito lì per sbaglio.
  if (minute.value > 130) {
    return outOfContract<number>("un minuto di partita non arriva a 130", at);
  }
  return minute;
}

export function readPlayer(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedPlayer> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const displayName = readLabel(record.value["displayName"], [...at, "displayName"]);
  if (!isRead(displayName)) return carryFailure(displayName);

  const shirtNumber = readField(record.value["shirtNumber"], [...at, "shirtNumber"], readWholeNumber);
  if (!isRead(shirtNumber)) return carryFailure(shirtNumber);

  const role = readField(record.value["role"], [...at, "role"], readLabel);
  if (!isRead(role)) return carryFailure(role);

  return read({ displayName: displayName.value, shirtNumber: shirtNumber.value, role: role.value });
}

export function readSubstitution(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedSubstitution> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const off = readLabel(record.value["off"], [...at, "off"]);
  if (!isRead(off)) return carryFailure(off);

  const on = readLabel(record.value["on"], [...at, "on"]);
  if (!isRead(on)) return carryFailure(on);

  if (off.value === on.value) {
    return outOfContract<ObservedSubstitution>("chi esce e chi entra non possono essere lo stesso nome", at);
  }

  const minute = readField(record.value["minute"], [...at, "minute"], readMinute);
  if (!isRead(minute)) return carryFailure(minute);

  return read({ off: off.value, on: on.value, minute: minute.value });
}

export function readDuel(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedDuel> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const contenders = readList(record.value["contenders"], [...at, "contenders"], readLabel);
  if (!isRead(contenders)) return carryFailure(contenders);
  if (contenders.value.length < 2) {
    return outOfContract<ObservedDuel>("un ballottaggio ha almeno due nomi in lizza", [...at, "contenders"]);
  }

  const favourite = readField(record.value["favourite"], [...at, "favourite"], readLabel);
  if (!isRead(favourite)) return carryFailure(favourite);
  const chosen = favourite.value.presence === "observed" ? favourite.value.value : null;
  if (chosen !== null && !contenders.value.includes(chosen)) {
    return outOfContract<ObservedDuel>(
      "il favorito indicato dalla fonte non è fra i nomi in lizza",
      [...at, "favourite"],
    );
  }

  return read({ contenders: contenders.value, favourite: favourite.value });
}

/**
 * Legge la dichiarazione di completezza.
 *
 * **Obbligatoria e senza ripiego.** Una lista che arriva qui senza dichiarare
 * quanto è completa non diventa `unknown`: si ferma. La differenza è fra una
 * pagina che non lo dice — e allora chi l'ha letta scrive `unknown`, che è un
 * fatto — e un candidato costruito male, che è un difetto e va visto. Un
 * ripiego silenzioso qui renderebbe i due casi indistinguibili per sempre.
 */
function readCompleteness(candidate: unknown, at: readonly string[]): ReadOutcome<Completeness> {
  if (candidate === "declared-complete" || candidate === "declared-partial" || candidate === "unknown") {
    return read(candidate);
  }
  return shapeNotRecognised<Completeness>(
    "la completezza va dichiarata: declared-complete, declared-partial oppure unknown",
    at,
  );
}

function readRoster(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedRoster> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const players = readList(record.value["players"], [...at, "players"], readPlayer);
  if (!isRead(players)) return carryFailure(players);

  const completeness = readCompleteness(record.value["completeness"], [...at, "completeness"]);
  if (!isRead(completeness)) return carryFailure(completeness);

  return read({ players: players.value, completeness: completeness.value });
}

export function readTeamLineup(candidate: unknown, at: readonly string[]): ReadOutcome<ObservedTeamLineup> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const team = readLabel(record.value["team"], [...at, "team"]);
  if (!isRead(team)) return carryFailure(team);

  const nature = record.value["nature"];
  if (nature !== "probable" && nature !== "actual") {
    return shapeNotRecognised<ObservedTeamLineup>(
      "la natura della formazione va dichiarata dalla fonte: probable oppure actual",
      [...at, "nature"],
    );
  }

  const module = readField(record.value["module"], [...at, "module"], readModule);
  if (!isRead(module)) return carryFailure(module);

  const coach = readField(record.value["coach"], [...at, "coach"], readLabel);
  if (!isRead(coach)) return carryFailure(coach);

  const starters = readField(record.value["starters"], [...at, "starters"], readRoster);
  if (!isRead(starters)) return carryFailure(starters);

  const bench = readField(record.value["bench"], [...at, "bench"], readRoster);
  if (!isRead(bench)) return carryFailure(bench);

  const substitutions = readField(record.value["substitutions"], [...at, "substitutions"], (value, valueAt) =>
    readList(value, valueAt, readSubstitution),
  );
  if (!isRead(substitutions)) return carryFailure(substitutions);

  const unavailable = readField(record.value["unavailable"], [...at, "unavailable"], readRoster);
  if (!isRead(unavailable)) return carryFailure(unavailable);

  const suspended = readField(record.value["suspended"], [...at, "suspended"], readRoster);
  if (!isRead(suspended)) return carryFailure(suspended);

  const duels = readField(record.value["duels"], [...at, "duels"], (value, valueAt) =>
    readList(value, valueAt, readDuel),
  );
  if (!isRead(duels)) return carryFailure(duels);

  const completeness = readCompleteness(record.value["completeness"], [...at, "completeness"]);
  if (!isRead(completeness)) return carryFailure(completeness);

  return read({
    team: team.value,
    nature,
    module: module.value,
    coach: coach.value,
    starters: starters.value,
    bench: bench.value,
    substitutions: substitutions.value,
    unavailable: unavailable.value,
    suspended: suspended.value,
    duels: duels.value,
    completeness: completeness.value,
  });
}

export function readMatchPage(candidate: unknown, at: readonly string[] = ["matchPage"]): ReadOutcome<ObservedMatchPage> {
  const record = readRecord(candidate, at);
  if (!isRead(record)) return carryFailure(record);

  const provenance = readProvenance(record.value["provenance"], [...at, "provenance"]);
  if (!isRead(provenance)) return carryFailure(provenance);

  const home = readTeamLineup(record.value["home"], [...at, "home"]);
  if (!isRead(home)) return carryFailure(home);

  const away = readTeamLineup(record.value["away"], [...at, "away"]);
  if (!isRead(away)) return carryFailure(away);

  if (home.value.team === away.value.team) {
    return outOfContract<ObservedMatchPage>("le due squadre di una partita non possono essere la stessa", at);
  }

  const kickOff = readField(record.value["kickOff"], [...at, "kickOff"], readInstant);
  if (!isRead(kickOff)) return carryFailure(kickOff);

  const referee = readField(record.value["referee"], [...at, "referee"], readLabel);
  if (!isRead(referee)) return carryFailure(referee);

  return read({
    provenance: provenance.value,
    home: home.value,
    away: away.value,
    kickOff: kickOff.value,
    referee: referee.value,
  });
}

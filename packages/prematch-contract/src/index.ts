// IL CONTRATTO PRE-PARTITA — che cosa una pagina di stampa sportiva espone,
// detto in tipi e funzioni pure, senza sapere da dove viene.
//
// COSA C'È QUI DENTRO: la provenienza obbligatoria di ogni osservazione (fonte,
// momento della lettura, giornata e da dove viene il suo numero); il campo che
// sa dire le due assenze; la pagina di una partita con probabili, formazioni
// effettive, panchina, sostituzioni, modulo, allenatore e arbitro; la pagina
// generale delle probabili; l'indice del calendario; la classifica di Serie A.
//
// COSA NON C'È, E NON DEVE ARRIVARCI:
//
//   * host, indirizzi, percorsi, selettori, intestazioni HTTP, rete. Chi legge
//     davvero una pagina vive nel layer privato; qui si dice solo che forma
//     deve avere ciò che consegna;
//   * dati reali. Le fixture di prova sono sintetiche, e i nomi che compaiono
//     nei test sono inventati;
//   * testo editoriale. Non esiste un campo che possa contenere una frase, e la
//     lettura rifiuta le stringhe lunghe come tali;
//   * qualunque misura di affidabilità di una fonte — confronto, aggregazione,
//     soglie, pesi. Il record che autorizza queste pagine dice che la misura è
//     lavoro futuro e non è progettata lì; a maggior ragione non è progettata
//     qui. Questo pacchetto prepara la materia prima e si ferma;
//   * l'identità dei giocatori. Un nome è l'etichetta che la fonte scrive, non
//     una persona riconosciuta: riconciliare due fonti è un altro mestiere.
//
// QUELLO CHE LA MISURA TROVERÀ QUI, quando qualcuno la costruirà: ogni lista di
// giocatori porta la propria `Completeness`, e `absenceIsMeaningful` dice se
// l'assenza di un nome da quella lista significa qualcosa. Senza quel dato una
// fonte che tace su metà squadra apparirebbe brava per caso.

export {
  MAX_LABEL_LENGTH,
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

export {
  absentInSource,
  isObserved,
  mapField,
  notObserved,
  observed,
  observedValue,
  readField,
  type Field,
} from "./field.js";

export {
  looksLikeAddress,
  matchdayDeclaredBySource,
  matchdayIfDeclared,
  matchdayRequestedByCaller,
  matchdayUnobserved,
  readMatchdayReference,
  readProvenance,
  type MatchdayReference,
  type Provenance,
} from "./provenance.js";

export {
  absenceIsMeaningful,
  classifySnapshot,
  matchPageSnapshot,
  readDuel,
  readMatchPage,
  readPlayer,
  readSubstitution,
  readTeamLineup,
  rosterCompleteness,
  type Completeness,
  type FormationShape,
  type LineupNature,
  type ObservedDuel,
  type ObservedMatchPage,
  type ObservedPlayer,
  type ObservedRoster,
  type ObservedSubstitution,
  type ObservedTeamLineup,
  type SnapshotSide,
} from "./matchPage.js";

export {
  goalDifferenceCheck,
  playedCheck,
  readCalendarIndex,
  readProbableLineupsPage,
  readStandings,
  type AgreementCheck,
  type FormOutcome,
  type ObservedCalendarIndex,
  type ObservedFixture,
  type ObservedGameweekFixtures,
  type ObservedProbableLineupsPage,
  type ObservedProbableMatch,
  type ObservedScore,
  type ObservedStandings,
  type StandingsRow,
} from "./gameweekPages.js";

// IL CONTRATTO PRE-PARTITA — che cosa una pagina di stampa sportiva espone,
// detto in tipi e funzioni pure, senza sapere da dove viene.
//
// I PARSER STANNO QUI, non dentro un nodo di workflow: quattro funzioni pure —
// un testo entra, un esito esce — una per pagina: `parseMatchPage`,
// `parseProbableLineupsPage`, `parseCalendarIndex`, `parseStandings`. I casi
// che contano sono test, a partire da quello che conta di più: la struttura
// cambiata sotto di noi, in cui il parser si ferma e lo dichiara invece di
// restituire mezza formazione. Chi va a prendere la pagina e deposita il raw
// resta nel privato.
//
// IL CALENDARIO È L'INDICE, e per questo il suo parser non è uno dei quattro a
// caso: da lì si ricavano le partite di una giornata, e senza di lui ogni
// lettura va indovinata a mano. La sua regola più stretta è che la giornata di
// un gruppo si legge dichiarata o non si legge affatto — mai dalla posizione
// nell'elenco.
//
// MA IL PARSER NON SA DI CHI È LA PAGINA. I nomi delle chiavi arrivano da fuori
// come parametro obbligatorio — la `SourceShape` — e vivono nel privato: un
// elenco di nomi di campo **dice di quale sito si tratta**, e la regola del
// confine, nel dubbio, manda al privato. **Ambiguità segnalata** come il
// documento del confine richiede: un parser è pubblico, la forma della fonte
// che legge no. Senza tabella questo pacchetto non tenta niente — vedi
// `sourceShape.ts`, e leggilo prima di pensare di riportarla dentro.
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
// fonte che tace su metà squadra apparirebbe brava per caso. Il parser delle
// probabili la **produce**, leggendola dai modi di dire dichiarati nella
// tabella: undici, panchina e formazione intera, ciascuna con la sua, e
// `unknown` — «non so» — ogni volta che la pagina non lo dice.

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

export { PARSE_STOP_CODES, parseMatchPage, type ParseRequest } from "./parseMatchPage.js";

export {
  MATCH_PAGE_WORDINGS,
  SOURCE_SHAPE_FAMILIES,
  compilePattern,
  readShapeTable,
  readSourceShape,
  type MatchPageWording,
  type ShapeTable,
  type SourceShape,
  type SourceShapeFamily,
  type SourceShapePatterns,
} from "./sourceShape.js";

export {
  PROBABLE_LINEUPS_FAMILIES,
  PROBABLE_LINEUPS_STOP_CODES,
  PROBABLE_LINEUPS_WORDINGS,
  parseProbableLineupsPage,
  readProbableLineupsShape,
  type ParseProbableLineupsRequest,
  type ProbableLineupsFamily,
  type ProbableLineupsShape,
  type ProbableLineupsWording,
} from "./parseProbableLineupsPage.js";

export {
  CALENDAR_INDEX_FAMILIES,
  CALENDAR_INDEX_STOP_CODES,
  CALENDAR_INDEX_WORDINGS,
  fixtureLookups,
  parseCalendarIndex,
  readCalendarIndexShape,
  type CalendarIndexFamily,
  type CalendarIndexShape,
  type FixtureLookup,
  type ParseCalendarIndexRequest,
} from "./parseCalendarIndex.js";

export {
  STANDINGS_FAMILIES,
  STANDINGS_STOP_CODES,
  STANDINGS_WORDINGS,
  parseStandings,
  readStandingsShape,
  type ParseStandingsRequest,
  type StandingsFamily,
  type StandingsShape,
  type StandingsWording,
} from "./parseStandings.js";

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

// IL PARSER DELLA PAGINA GENERALE DELLE PROBABILI — tutte le partite di una
// giornata, e la dichiarazione di quanto ogni lista è completa.
//
// PERCHÉ QUESTA PAGINA HA UN PARSER SUO. La pagina della singola partita dice
// tutto di una partita; questa dice qualcosa di tutte. Le due forme non si
// leggono con lo stesso codice — qui c'è un elenco di partite, là ce n'era una —
// e fingere che siano la stessa cosa avrebbe prodotto un parser che indovina
// quale delle due sta guardando.
//
// LA COSA CHE QUESTO PARSER DEVE PRODURRE, E CHE L'ALTRO NON PRODUCEVA: **la
// dichiarazione di completezza**. Chi misura quanto una fonte ci prende
// (`packages/source-reliability`) deve sapere se una lista è completa o
// parziale, perché da lì dipende se un giocatore previsto e mai comparso è un
// disaccordo o una cosa non decidibile. Se una pagina nomina l'undici e tace
// sulla panchina, ogni panchinaro le risulterebbe «previsto non titolare», e la
// fonte apparirebbe **brava per caso**.
//
// TRE DICHIARAZIONI E NON UNA: l'undici, la panchina, la formazione intera.
// Sono tre fatti diversi — una fonte può dichiarare completo l'undici e tacere
// sul resto — e la terza **non è la congiunzione delle prime due**: ricavarla
// sarebbe la solita deduzione, con la solita conseguenza.
//
// IL VALORE PUÒ ESSERE «NON SO», ED È IL VALORE PIÙ FREQUENTE. Quando la pagina
// non lo dice, la completezza è `unknown`: non `declared-complete`, non un
// booleano che parte da vero. Un default ottimista qui regalerebbe punteggio a
// ogni fonte che si è limitata a scrivere meno — vedi `matchPage.ts`,
// §`Completeness`, dove il conto è fatto per esteso.
//
// NIENTE RETE, NIENTE OROLOGIO, NIENTE NOMI DELLA FONTE: la tabella delle
// famiglie di chiavi arriva da fuori come parametro obbligatorio, esattamente
// come per la pagina della partita. Le famiglie nuove che servono qui —
// `matches`, e le tre della completezza — sono **ingressi richiesti**, non
// costanti scritte qui dentro: senza, il parser non parte.

import { absentInSource, notObserved, observed, type Field } from "./field.js";
import {
  arraysNamed,
  declaredMatchdayAmong,
  entriesOf,
  firstArrayIn,
  firstLabelIn,
  firstReadableJson,
  firstWholeNumberIn,
  isRecord,
  label,
  stopAt,
  structuredBlocks,
  MODULE_SHAPE,
  type Entry,
} from "./documentScan.js";
import {
  readProbableLineupsPage,
  type ObservedProbableLineupsPage,
} from "./gameweekPages.js";
import type { Completeness, ObservedPlayer, ObservedRoster } from "./matchPage.js";
import type { MatchdayReference } from "./provenance.js";
import { carryFailure, isRead, read, type ReadOutcome } from "./readOutcome.js";
import { readShapeTable, type ShapeTable } from "./sourceShape.js";

/**
 * Le famiglie di chiavi della pagina delle probabili. Elenco chiuso: una in meno
 * ferma il parser prima che guardi il documento.
 *
 * Le quattro che non compaiono sulla pagina della singola partita sono le
 * ragioni per cui questa tabella è un ingresso a sé: `matches`, l'elenco delle
 * partite, e le tre chiavi sotto cui una fonte **dichiara** quanto una lista è
 * completa. Nessuna di loro ha un valore per difetto qui dentro.
 */
export const PROBABLE_LINEUPS_FAMILIES = [
  "matches",
  "teamName",
  "starters",
  "bench",
  "playerName",
  "shirtNumber",
  "role",
  "module",
  "coach",
  "status",
  "homeSide",
  "matchday",
  "startersCompleteness",
  "benchCompleteness",
  "lineupCompleteness",
] as const;

export type ProbableLineupsFamily = (typeof PROBABLE_LINEUPS_FAMILIES)[number];

/**
 * I modi di dire della fonte.
 *
 * `saysComplete` e `saysPartial` sono ciò che rende la completezza un dato letto
 * invece che una supposizione: senza di loro non esiste modo di distinguere una
 * fonte che dichiara «formazione completa» da una che tace, e la distinzione è
 * tutto il punto.
 */
export const PROBABLE_LINEUPS_WORDINGS = [
  "saysActual",
  "saysProbable",
  "saysComplete",
  "saysPartial",
] as const;

export type ProbableLineupsWording = (typeof PROBABLE_LINEUPS_WORDINGS)[number];

export type ProbableLineupsShape = ShapeTable<ProbableLineupsFamily, ProbableLineupsWording>;

export function readProbableLineupsShape(
  candidate: unknown,
  at: readonly string[] = ["probableLineupsShape"],
): ReadOutcome<ProbableLineupsShape> {
  return readShapeTable(candidate, PROBABLE_LINEUPS_FAMILIES, PROBABLE_LINEUPS_WORDINGS, at);
}

/** I codici con cui questo parser dichiara di essersi fermato. Stabili: a valle ci si ragiona. */
export const PROBABLE_LINEUPS_STOP_CODES = {
  emptyInput: "RAW_ASSENTE",
  noStructuredBlock: "BLOCCO_STRUTTURATO_ASSENTE",
  unreadableBlock: "BLOCCO_STRUTTURATO_ILLEGGIBILE",
  matchesNotOne: "ELENCO_PARTITE_NON_UNICO",
  matchesEmpty: "ELENCO_PARTITE_VUOTO",
  matchNotRecord: "PARTITA_NON_LEGGIBILE",
  startersNotTwo: "TITOLARI_NON_DUE",
  natureUndeclared: "NATURA_NON_DICHIARATA",
  natureConflicting: "NATURA_DISCORDE",
  homeSideUndeclared: "LATO_CASA_NON_DICHIARATO",
  lineupUnreadable: "FORMAZIONE_NON_LEGGIBILE",
} as const;

/** Che cosa serve al parser, oltre al testo della pagina. */
export interface ParseProbableLineupsRequest {
  /** Il contenuto grezzo già letto e depositato. Questa funzione non va a prenderlo. */
  readonly rawHtml: string;
  /** La tabella delle famiglie di chiavi, **obbligatoria**: vive nel privato. */
  readonly shape: ProbableLineupsShape;
  /** Etichetta della testata. Non un indirizzo: la lettura lo verifica. */
  readonly source: string;
  /** Etichetta della pagina. Non un percorso. */
  readonly page: string;
  /** Quando ABBIAMO LETTO, ISO-8601 con fuso. Lo passa chi chiama: qui non c'è orologio. */
  readonly observedAt: string;
  /** La giornata che **avevamo chiesto**, se c'era: non diventa quella dichiarata. */
  readonly requestedMatchday: number | null;
}

function stop<T>(code: string, family: ProbableLineupsFamily | null, why: string): ReadOutcome<T> {
  return stopAt<T>("parseProbableLineupsPage", code, family, why);
}

/**
 * LA COMPLETEZZA COME LA FONTE LA DICHIARA — e `unknown` in tutti gli altri casi.
 *
 * Tre soli modi di ottenere qualcosa di diverso da «non so»: la chiave c'è, il
 * suo testo si legge, e quel testo corrisponde a uno dei due modi di dire della
 * tabella. Chiave assente, testo che non corrisponde, valore che non è un testo:
 * `unknown`. **Non esiste un ramo che restituisca `declared-complete` senza una
 * dichiarazione**, e non deve nascerne uno: sarebbe il default ottimista che
 * questo pacchetto vieta in `matchPage.ts`.
 */
function completenessFrom(
  container: Record<string, unknown>,
  key: RegExp,
  shape: ProbableLineupsShape,
): Completeness {
  const declared = firstLabelIn(container, key);
  if (declared === null) return "unknown";
  if (shape.wordings.saysComplete.test(declared)) return "declared-complete";
  if (shape.wordings.saysPartial.test(declared)) return "declared-partial";
  return "unknown";
}

function playerFrom(element: unknown, shape: ProbableLineupsShape): ObservedPlayer | null {
  if (!isRecord(element)) return null;
  const name = firstLabelIn(element, shape.keys.playerName);
  if (name === null) return null;
  const shirt = firstWholeNumberIn(element, shape.keys.shirtNumber);
  const role = firstLabelIn(element, shape.keys.role);
  return {
    displayName: name,
    shirtNumber: shirt === null ? absentInSource() : observed(shirt),
    role: role === null ? absentInSource() : observed(role),
  };
}

/**
 * Un elenco di giocatori con la sua dichiarazione, **tutto o niente**.
 *
 * Un elemento che non si legge non si salta: saltarlo produrrebbe una lista più
 * corta che a valle sembra una formazione con pochi giocatori — il difetto
 * peggiore, perché non ha l'aria di un difetto.
 *
 * La completezza NON si guarda dalla lunghezza: undici nomi non sono una
 * dichiarazione, e qui non c'è nessuna riga che conti gli elementi.
 */
function rosterFrom(
  elements: readonly unknown[] | null,
  container: Record<string, unknown>,
  completenessKey: RegExp,
  shape: ProbableLineupsShape,
): ObservedRoster | null {
  if (elements === null) return null;
  const players: ObservedPlayer[] = [];
  for (const element of elements) {
    const player = playerFrom(element, shape);
    if (player === null) return null;
    players.push(player);
  }
  return { players, completeness: completenessFrom(container, completenessKey, shape) };
}

function natureFromText(text: string | null, shape: ProbableLineupsShape): "probable" | "actual" | null {
  if (text === null) return null;
  if (shape.wordings.saysActual.test(text)) return "actual";
  if (shape.wordings.saysProbable.test(text)) return "probable";
  return null;
}

/**
 * La natura dichiarata da qualche parte fra queste voci.
 *
 * Due dichiarazioni discordi non si arbitrano: chi scegliesse la prima trovata
 * deciderebbe a caso se una formazione è una previsione o un fatto.
 */
function declaredNature(
  entries: readonly Entry[],
  shape: ProbableLineupsShape,
): "probable" | "actual" | "conflicting" | null {
  let found: "probable" | "actual" | null = null;
  for (const entry of entries) {
    if (!shape.keys.status.test(entry.key)) continue;
    const here = natureFromText(label(entry.value), shape);
    if (here === null) continue;
    if (found !== null && found !== here) return "conflicting";
    found = here;
  }
  return found;
}

/** Una formazione letta, oppure **quale famiglia** non si è lasciata leggere. */
type LineupResult =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly family: ProbableLineupsFamily };

function lineupCandidate(
  block: Record<string, unknown>,
  nature: "probable" | "actual",
  shape: ProbableLineupsShape,
): LineupResult {
  const team = firstLabelIn(block, shape.keys.teamName);
  if (team === null) return { ok: false, family: "teamName" };

  const rawStarters = firstArrayIn(block, shape.keys.starters);
  if (rawStarters === null) return { ok: false, family: "starters" };
  const starters = rosterFrom(rawStarters, block, shape.keys.startersCompleteness, shape);
  if (starters === null) return { ok: false, family: "playerName" };

  const rawBench = firstArrayIn(block, shape.keys.bench);
  const bench = rawBench === null ? null : rosterFrom(rawBench, block, shape.keys.benchCompleteness, shape);
  if (rawBench !== null && bench === null) return { ok: false, family: "bench" };

  const moduleText = firstLabelIn(block, shape.keys.module);
  const coach = firstLabelIn(block, shape.keys.coach);

  const asField = <T>(value: T | null): Field<T> => (value === null ? absentInSource<T>() : observed(value));

  return {
    ok: true,
    value: {
      team,
      nature,
      module: moduleText !== null && MODULE_SHAPE.test(moduleText) ? observed(moduleText) : absentInSource(),
      coach: asField(coach),
      starters: observed(starters),
      // Panchina assente NON è panchina vuota: è la sezione che la pagina non
      // espone, e resta un'assenza dichiarata.
      bench: asField(bench),
      // Questa pagina non porta sostituzioni, indisponibili, squalificati né
      // ballottaggi: non li abbiamo guardati qui, e «non guardato» non è «la
      // fonte non ce l'ha».
      substitutions: notObserved(),
      unavailable: notObserved(),
      suspended: notObserved(),
      duels: notObserved(),
      completeness: completenessFrom(block, shape.keys.lineupCompleteness, shape),
    },
  };
}

function homeSideIndex(blocks: readonly Record<string, unknown>[], shape: ProbableLineupsShape): number {
  let index = -1;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block === undefined) continue;
    for (const key of Object.keys(block)) {
      if (!shape.keys.homeSide.test(key)) continue;
      const value = block[key];
      if (value === true || (typeof value === "string" && /^(home|casa|true)$/i.test(value.trim()))) {
        index = i;
      }
    }
  }
  return index;
}

function matchdayReference(
  entries: readonly Entry[],
  shape: ProbableLineupsShape,
  requested: number | null,
): MatchdayReference {
  const declared = declaredMatchdayAmong(entries, shape.keys.matchday);
  if (declared !== null) return { origin: "declared-by-source", number: declared };
  if (requested !== null && Number.isInteger(requested) && requested >= 1) {
    return { origin: "requested-by-caller", number: requested };
  }
  return { origin: "unobserved" };
}

/** Una partita della pagina, oppure la fermata che la riguarda. */
function matchCandidate(
  element: unknown,
  pageNature: "probable" | "actual" | null,
  shape: ProbableLineupsShape,
): ReadOutcome<Record<string, unknown>> {
  if (!isRecord(element)) {
    return stop(PROBABLE_LINEUPS_STOP_CODES.matchNotRecord, "matches", "una partita che non è un oggetto");
  }

  const entries = entriesOf(element);
  const starterEntries = arraysNamed(entries, shape.keys.starters);
  if (starterEntries.length !== 2) {
    return stop(
      PROBABLE_LINEUPS_STOP_CODES.startersNotTwo,
      "starters",
      `attesi due elenchi di titolari, uno per squadra: trovati ${String(starterEntries.length)}`,
    );
  }
  const teamBlocks = starterEntries.map((entry) => entry.container);

  const here = declaredNature(entries, shape);
  if (here === "conflicting") {
    return stop(
      PROBABLE_LINEUPS_STOP_CODES.natureConflicting,
      "status",
      "questa partita dichiara sia probabile sia effettiva, e non si sceglie per lei",
    );
  }

  const natures: ("probable" | "actual")[] = [];
  for (const block of teamBlocks) {
    const own = natureFromText(firstLabelIn(block, shape.keys.status), shape);
    const chosen = own ?? here ?? pageNature;
    if (chosen === null) {
      return stop(
        PROBABLE_LINEUPS_STOP_CODES.natureUndeclared,
        "status",
        "la pagina non dichiara se questa formazione è probabile o effettiva, e non si deduce",
      );
    }
    natures.push(chosen);
  }

  const homeIndex = homeSideIndex(teamBlocks, shape);
  if (homeIndex === -1) {
    return stop(
      PROBABLE_LINEUPS_STOP_CODES.homeSideUndeclared,
      "homeSide",
      "la partita non dichiara quale squadra gioca in casa, e l'ordine degli elenchi non lo dice",
    );
  }
  const awayIndex = homeIndex === 0 ? 1 : 0;

  const homeBlock = teamBlocks[homeIndex];
  const awayBlock = teamBlocks[awayIndex];
  const homeNature = natures[homeIndex];
  const awayNature = natures[awayIndex];
  if (homeBlock === undefined || awayBlock === undefined || homeNature === undefined || awayNature === undefined) {
    return stop(PROBABLE_LINEUPS_STOP_CODES.startersNotTwo, "starters", "blocco squadra mancante dopo la lettura");
  }

  const home = lineupCandidate(homeBlock, homeNature, shape);
  const away = lineupCandidate(awayBlock, awayNature, shape);
  for (const side of [home, away]) {
    if (!side.ok) {
      return stop(
        PROBABLE_LINEUPS_STOP_CODES.lineupUnreadable,
        side.family,
        "un pezzo della formazione non ha la forma descritta: meglio nessuna formazione che una a metà",
      );
    }
  }
  if (!home.ok || !away.ok) {
    return stop(PROBABLE_LINEUPS_STOP_CODES.lineupUnreadable, "starters", "formazione non leggibile");
  }

  return read({ home: home.value, away: away.value });
}

/**
 * DAL TESTO DELLA PAGINA AL TIPO DEL CONTRATTO — o a un esito che dice perché no.
 *
 * L'ultimo passo è deliberato: il candidato costruito qui passa da
 * `readProbableLineupsPage`, la stessa lettura fail-closed che userebbe chiunque
 * altro. È anche il punto in cui una pagina che dichiarasse formazioni
 * effettive viene respinta come `out-of-contract`: questo parser non la
 * riscrive, la fa rifiutare.
 *
 * L'ELENCO DI PARTITE VUOTO È UNA FERMATA, non «zero partite». È una scelta
 * tecnica dell'Executive, dichiarata come tale e contestabile: un elenco vuoto
 * che arrivasse a valle sarebbe indistinguibile da «questa giornata non ha
 * partite», e questo pacchetto dichiara le ambiguità invece di risolverle. Chi
 * legge il codice di fermata sa che deve andare a guardare la pagina.
 */
export function parseProbableLineupsPage(
  request: ParseProbableLineupsRequest,
): ReadOutcome<ObservedProbableLineupsPage> {
  const shape = request.shape;
  if (request.rawHtml.length === 0) {
    return stop(PROBABLE_LINEUPS_STOP_CODES.emptyInput, null, "nessun contenuto grezzo da leggere");
  }

  const blocks = structuredBlocks(request.rawHtml, shape.structuredBlocks);
  if (blocks.length === 0) {
    return stop(
      PROBABLE_LINEUPS_STOP_CODES.noStructuredBlock,
      null,
      "nessuno dei modi dichiarati di estrarre il blocco di dati strutturati ha trovato qualcosa",
    );
  }
  const root = firstReadableJson(blocks);
  if (root === null) {
    return stop(PROBABLE_LINEUPS_STOP_CODES.unreadableBlock, null, "nessuno dei blocchi trovati è JSON valido");
  }

  const entries = entriesOf(root);
  const matchLists = arraysNamed(entries, shape.keys.matches);
  if (matchLists.length !== 1) {
    return stop(
      PROBABLE_LINEUPS_STOP_CODES.matchesNotOne,
      "matches",
      `atteso un solo elenco di partite: trovati ${String(matchLists.length)}`,
    );
  }
  const matchList = matchLists[0];
  if (matchList === undefined || !Array.isArray(matchList.value)) {
    return stop(PROBABLE_LINEUPS_STOP_CODES.matchesNotOne, "matches", "elenco di partite non leggibile");
  }
  if (matchList.value.length === 0) {
    return stop(
      PROBABLE_LINEUPS_STOP_CODES.matchesEmpty,
      "matches",
      "l'elenco delle partite c'è ed è vuoto: nessuno può dire se la giornata non ha partite o se la pagina è cambiata",
    );
  }

  // LA NATURA DELLA PAGINA SI LEGGE FUORI DALLE PARTITE. Se si guardasse tutto
  // il documento, la dichiarazione di una singola partita entrerebbe nel conto
  // della pagina intera, e due partite in stati diversi — capita: le ufficiali
  // escono una alla volta — fermerebbero la lettura di tutte.
  const insideMatches = new Set(entriesOf(matchList.value).map((entry) => entry.container));
  const outerEntries = entries.filter((entry) => !insideMatches.has(entry.container));
  const pageNature = declaredNature(outerEntries, shape);
  if (pageNature === "conflicting") {
    return stop(
      PROBABLE_LINEUPS_STOP_CODES.natureConflicting,
      "status",
      "la pagina dichiara sia probabile sia effettiva, e non si sceglie per lei",
    );
  }

  const matches: Record<string, unknown>[] = [];
  for (const element of matchList.value) {
    const match = matchCandidate(element, pageNature, shape);
    if (!isRead(match)) return carryFailure(match);
    matches.push(match.value);
  }

  const candidate = {
    provenance: {
      source: request.source,
      page: request.page,
      observedAt: request.observedAt,
      matchday: matchdayReference(entries, shape, request.requestedMatchday),
    },
    matches,
  };

  return readProbableLineupsPage(candidate, ["parseProbableLineupsPage"]);
}

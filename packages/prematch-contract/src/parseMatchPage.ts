// IL PARSER DELLA PAGINA DI UNA PARTITA — funzione pura, e sta qui apposta.
//
// PERCHÉ NEL CORE PUBBLICO E NON DENTRO UN NODO DI WORKFLOW. Un parser dentro un
// nodo non ha prove automatiche: nessuno lo esegue finché non gira in
// produzione, e quando gira è tardi. Qui invece i casi che contano sono test —
// la panchina dichiarata e la panchina assente, la probabile e l'effettiva,
// l'arbitro che c'è e quello che non c'è, e soprattutto **la struttura cambiata
// sotto di noi**, che è il caso in cui un parser scritto male restituisce mezza
// formazione e a valle sembra una squadra con pochi giocatori.
//
// PERCHÉ NON SA DI CHI È LA PAGINA CHE LEGGE. I nomi delle chiavi — quale campo
// porta i titolari, quale la panchina — non stanno qui: arrivano come parametro
// obbligatorio, la `SourceShape`, che vive nel privato. Il motivo per esteso è
// in `sourceShape.ts`, e va letto prima di essere tentati di riportarla dentro:
// un elenco di nomi di campo **dice di quale sito si tratta**, e la regola del
// confine, nel dubbio, manda al privato. Senza tabella questo file non tenta
// niente e non ha un elenco di riserva.
//
// COSA NON C'È QUI, e non deve arrivarci: niente rete, niente host, niente
// indirizzi, niente credenziali, nessun HTML reale. Chi va a prendere la pagina
// e deposita il raw vive nel layer privato; questa funzione riceve **un testo**
// e restituisce **un esito**.
//
// PURA DAVVERO: nessun orologio (nessun `new Date()`, nessun `Date.now()`),
// nessun numero casuale, nessuna variabile di ambiente, nessuno stato fra una
// chiamata e l'altra. Il momento dell'osservazione lo passa chi chiama, perché
// è un dato dell'osservazione e non del calcolo. L'unico uso di `Date` è
// `Date.parse` dentro la lettura degli istanti: una funzione del suo argomento
// e di nient'altro.
//
// COME LEGGE, E PERCHÉ COSÌ. Le famiglie di chiavi si cercano **per nome**, non
// per percorso: l'osservazione di una struttura misura quali campi esistono, non
// a che profondità stanno, e un percorso scritto a mano si rompe al primo
// annidamento diverso. Di ogni famiglia si pretende di trovare quanto serve —
// due elenchi di titolari, uno per squadra. Trovarne zero, uno o tre non è un
// caso da gestire con fantasia: è la struttura che è cambiata, e si dichiara.
//
// FERMARSI È UN ESITO, NON UN FALLIMENTO. Ogni «non so» di questo file è un
// `shape-not-recognised` con un codice stabile, **il nome della famiglia di
// chiavi** che mancava e il punto in cui si è fermato: un motivo si legge anche
// senza aver scritto il parser. Non esiste un ramo che restituisca una
// formazione parziale: o la pagina ha la forma descritta, o non se ne ricava
// niente.

import { absentInSource, notObserved, observed, type Field } from "./field.js";
import {
  readMatchPage,
  type Completeness,
  type ObservedMatchPage,
  type ObservedPlayer,
  type ObservedRoster,
  type ObservedSubstitution,
} from "./matchPage.js";
import type { MatchdayReference } from "./provenance.js";
import { isRead, readLabel, shapeNotRecognised, type ReadOutcome } from "./readOutcome.js";
import type { SourceShape, SourceShapeFamily } from "./sourceShape.js";

/**
 * I codici con cui il parser dichiara di essersi fermato.
 *
 * Sono stabili perché a valle qualcuno ci ragiona sopra: la stop condition
 * «struttura di pagina non riconosciuta» dei record di fonte è latching per la
 * giornata, e un motivo scritto a mano ogni volta non si può contare.
 */
export const PARSE_STOP_CODES = {
  emptyInput: "RAW_ASSENTE",
  noStructuredBlock: "BLOCCO_STRUTTURATO_ASSENTE",
  unreadableBlock: "BLOCCO_STRUTTURATO_ILLEGGIBILE",
  startersNotTwo: "TITOLARI_NON_DUE",
  teamBlockMissing: "BLOCCO_SQUADRA_ASSENTE",
  natureUndeclared: "NATURA_NON_DICHIARATA",
  natureConflicting: "NATURA_DISCORDE",
  homeSideUndeclared: "LATO_CASA_NON_DICHIARATO",
  lineupUnreadable: "FORMAZIONE_NON_LEGGIBILE",
} as const;

/** Che cosa serve al parser, oltre al testo della pagina. */
export interface ParseRequest {
  /** Il contenuto grezzo già letto e depositato. Questa funzione non va a prenderlo. */
  readonly rawHtml: string;
  /**
   * La tabella delle famiglie di chiavi, **obbligatoria**: senza, il parser non
   * sa come si chiamano le cose e non tira a indovinare. Vive nel privato — vedi
   * `sourceShape.ts` — ed è compilata da `readSourceShape`.
   */
  readonly shape: SourceShape;
  /** Etichetta della testata. Non un indirizzo: la lettura lo verifica. */
  readonly source: string;
  /** Etichetta della pagina. Non un percorso. */
  readonly page: string;
  /** Quando ABBIAMO LETTO, ISO-8601 con fuso. Lo passa chi chiama: qui non c'è orologio. */
  readonly observedAt: string;
  /**
   * La giornata che **avevamo chiesto**, se c'era.
   *
   * Non è la giornata della pagina e non lo diventa: se la pagina non ne
   * dichiara una, questo numero viaggia con l'origine `requested-by-caller`, e
   * a valle `matchdayIfDeclared` continua a rispondere `null`.
   */
  readonly requestedMatchday: number | null;
}

const MODULE_SHAPE = /^\d{1,2}(-\d{1,2}){1,4}$/;
const INSTANT_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

interface Entry {
  readonly key: string;
  readonly value: unknown;
  readonly container: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Una fermata, detta in modo che si capisca da fuori: il codice, **la famiglia
 * di chiavi** in ballo quando ce n'è una, e il perché in parole.
 */
function stop<T>(code: string, family: SourceShapeFamily | null, why: string): ReadOutcome<T> {
  const where = family === null ? ["parseMatchPage"] : ["parseMatchPage", "keys", family];
  const named = family === null ? why : `famiglia di chiavi "${family}": ${why}`;
  return shapeNotRecognised<T>(`${code} — ${named}`, where);
}

/** Un'etichetta pulita, oppure `null`. Le stringhe lunghe come una frase non lo sono. */
function label(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const outcome = readLabel(value.replace(/\s+/g, " "), []);
  return isRead(outcome) ? outcome.value : null;
}

/**
 * Ogni coppia chiave/valore del documento, **una volta sola**, con il proprio
 * contenitore. Contarne una due volte farebbe fallire il controllo «due elenchi
 * di titolari» proprio sulle pagine giuste.
 */
function entriesOf(root: unknown): readonly Entry[] {
  const out: Entry[] = [];
  const walk = (value: unknown, depth: number): void => {
    if (depth > 14 || out.length > 20000) return;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length && i < 60; i += 1) walk(value[i], depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    for (const key of Object.keys(value)) {
      out.push({ key, value: value[key], container: value });
      walk(value[key], depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

function structuredBlocks(html: string, shape: SourceShape): readonly string[] {
  const out: string[] = [];
  for (const pattern of shape.structuredBlocks) {
    // `exec` su una regexp con stato globale sarebbe una funzione con memoria:
    // se ne fa una copia senza `g` per restare puri fra una chiamata e l'altra.
    const once = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
    const match = once.exec(html);
    const body = match?.[1];
    if (body !== undefined && out.length < 10) out.push(body);
  }
  return out;
}

function firstReadableJson(blocks: readonly string[]): unknown {
  for (const block of blocks) {
    try {
      const parsed: unknown = JSON.parse(block);
      if (typeof parsed === "object" && parsed !== null) return parsed;
    } catch {
      // Un blocco illeggibile non è fatale finché ne resta un altro. Fatale è
      // non averne nessuno, e lo dice chi chiama.
    }
  }
  return null;
}

function firstLabelIn(container: Record<string, unknown>, pattern: RegExp): string | null {
  for (const key of Object.keys(container)) {
    if (!pattern.test(key)) continue;
    const text = label(container[key]);
    if (text !== null) return text;
  }
  return null;
}

function firstWholeNumberIn(container: Record<string, unknown>, pattern: RegExp): number | null {
  for (const key of Object.keys(container)) {
    if (!pattern.test(key)) continue;
    const value = container[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
    if (typeof value === "string" && /^\d{1,3}$/.test(value.trim())) return Number(value.trim());
  }
  return null;
}

function firstArrayIn(container: Record<string, unknown>, pattern: RegExp): readonly unknown[] | null {
  for (const key of Object.keys(container)) {
    const value = container[key];
    if (pattern.test(key) && Array.isArray(value)) return value;
  }
  return null;
}

// --- i pezzi della formazione ----------------------------------------------

function playerFrom(element: unknown, shape: SourceShape): ObservedPlayer | null {
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
 * Un elenco di giocatori, **tutto o niente**.
 *
 * Un elemento che non si legge non si salta: saltarlo produrrebbe una lista più
 * corta che a valle sembra una formazione con pochi giocatori — il difetto
 * peggiore di tutti, perché non ha l'aria di un difetto.
 *
 * La completezza è `unknown` e viene scritta **qui, in un posto solo**: nessuna
 * pagina osservata la dichiara, e undici nomi non sono una dichiarazione. Il
 * giorno in cui una fonte la dichiarasse, questa è la riga da cambiare.
 */
function rosterFrom(elements: readonly unknown[] | null, shape: SourceShape): ObservedRoster | null {
  if (elements === null) return null;
  const players: ObservedPlayer[] = [];
  for (const element of elements) {
    const player = playerFrom(element, shape);
    if (player === null) return null;
    players.push(player);
  }
  const completeness: Completeness = "unknown";
  return { players, completeness };
}

function substitutionsFrom(
  elements: readonly unknown[] | null,
  shape: SourceShape,
): readonly ObservedSubstitution[] | null {
  if (elements === null) return null;
  const out: ObservedSubstitution[] = [];
  for (const element of elements) {
    if (!isRecord(element)) return null;
    const off = firstLabelIn(element, shape.keys.substitutionOff);
    const on = firstLabelIn(element, shape.keys.substitutionOn);
    if (off === null || on === null || off === on) return null;
    // Se la fonte non espone il minuto, resta assente: nessuno lo mette a zero.
    const minute = firstWholeNumberIn(element, shape.keys.minute);
    out.push({ off, on, minute: minute === null ? absentInSource() : observed(minute) });
  }
  return out;
}

function natureFromText(text: string | null, shape: SourceShape): "probable" | "actual" | null {
  if (text === null) return null;
  if (shape.saysActual.test(text)) return "actual";
  if (shape.saysProbable.test(text)) return "probable";
  return null;
}

/**
 * La natura dichiarata da qualche parte nella pagina.
 *
 * Due dichiarazioni discordi non si arbitrano: chi scegliesse la prima trovata
 * deciderebbe a caso se una formazione è una previsione o un fatto, che è
 * esattamente la confusione che il requisito di misurabilità vieta.
 */
function pageNature(entries: readonly Entry[], shape: SourceShape): "probable" | "actual" | "conflicting" | null {
  let found: "probable" | "actual" | null = null;
  for (const entry of entries) {
    if (!shape.keys.status.test(entry.key)) continue;
    const read = natureFromText(label(entry.value), shape);
    if (read === null) continue;
    if (found !== null && found !== read) return "conflicting";
    found = read;
  }
  return found;
}

/** Una formazione letta, oppure **quale famiglia** non si è lasciata leggere. */
type LineupResult =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly family: SourceShapeFamily };

function lineupCandidate(
  block: Record<string, unknown>,
  nature: "probable" | "actual",
  shape: SourceShape,
): LineupResult {
  const team = firstLabelIn(block, shape.keys.teamName);
  if (team === null) return { ok: false, family: "teamName" };

  const starters = rosterFrom(firstArrayIn(block, shape.keys.starters), shape);
  if (starters === null) return { ok: false, family: "playerName" };

  const rawBench = firstArrayIn(block, shape.keys.bench);
  const bench = rawBench === null ? null : rosterFrom(rawBench, shape);
  if (rawBench !== null && bench === null) return { ok: false, family: "bench" };

  const rawSubs = firstArrayIn(block, shape.keys.substitutions);
  const substitutions = rawSubs === null ? null : substitutionsFrom(rawSubs, shape);
  if (rawSubs !== null && substitutions === null) return { ok: false, family: "substitutions" };

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
      substitutions: asField(substitutions),
      // Questa pagina non porta indisponibili, squalificati e ballottaggi: non
      // li abbiamo guardati qui, e «non guardato» non è «la fonte non ce l'ha».
      unavailable: notObserved(),
      suspended: notObserved(),
      duels: notObserved(),
      completeness: "unknown",
    },
  };
}

function matchdayReference(
  entries: readonly Entry[],
  shape: SourceShape,
  requested: number | null,
): MatchdayReference {
  for (const entry of entries) {
    if (!shape.keys.matchday.test(entry.key)) continue;
    const value = entry.value;
    if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 60) {
      return { origin: "declared-by-source", number: value };
    }
    if (typeof value === "string" && /^\s*\d{1,2}\s*$/.test(value)) {
      const number = Number(value.trim());
      if (number >= 1) return { origin: "declared-by-source", number };
    }
  }
  // È ciò che ABBIAMO CHIESTO, non ciò che la pagina dichiara: l'origine lo
  // dice, e a valle nessuno può scambiare le due cose.
  if (requested !== null && Number.isInteger(requested) && requested >= 1) {
    return { origin: "requested-by-caller", number: requested };
  }
  return { origin: "unobserved" };
}

function homeSideIndex(blocks: readonly Record<string, unknown>[], shape: SourceShape): number {
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

function refereeFrom(entries: readonly Entry[], shape: SourceShape): string | null {
  for (const entry of entries) {
    if (!shape.keys.referee.test(entry.key)) continue;
    const name = label(entry.value);
    if (name !== null) return name;
  }
  return null;
}

/**
 * Il calcio d'inizio, **solo con il fuso**.
 *
 * Un istante senza fuso non si può confrontare con il momento della lettura, e
 * il confronto è tutto ciò per cui serve: meglio dichiararlo assente che
 * ordinarlo a caso.
 */
function kickOffFrom(entries: readonly Entry[], shape: SourceShape): Field<string> {
  for (const entry of entries) {
    if (!shape.keys.kickOff.test(entry.key)) continue;
    if (typeof entry.value !== "string") continue;
    if (INSTANT_WITH_ZONE.test(entry.value)) return observed(entry.value);
  }
  return absentInSource();
}

/**
 * DAL TESTO DELLA PAGINA AL TIPO DEL CONTRATTO — o a un esito che dice perché no.
 *
 * L'ultimo passo è deliberato: il candidato costruito qui viene dato in pasto a
 * `readMatchPage`, la stessa lettura fail-closed che userebbe chiunque altro.
 * Così il parser non ha una sua idea privata di che cosa sia valido, e un giorno
 * in cui il contratto diventasse più severo il parser lo scoprirebbe subito.
 */
export function parseMatchPage(request: ParseRequest): ReadOutcome<ObservedMatchPage> {
  const shape = request.shape;
  if (request.rawHtml.length === 0) {
    return stop(PARSE_STOP_CODES.emptyInput, null, "nessun contenuto grezzo da leggere");
  }

  const blocks = structuredBlocks(request.rawHtml, shape);
  if (blocks.length === 0) {
    return stop(
      PARSE_STOP_CODES.noStructuredBlock,
      null,
      "nessuno dei modi dichiarati di estrarre il blocco di dati strutturati ha trovato qualcosa",
    );
  }
  const root = firstReadableJson(blocks);
  if (root === null) {
    return stop(PARSE_STOP_CODES.unreadableBlock, null, "nessuno dei blocchi trovati è JSON valido");
  }

  const entries = entriesOf(root);
  const starterEntries = entries.filter((entry) => shape.keys.starters.test(entry.key) && Array.isArray(entry.value));
  if (starterEntries.length !== 2) {
    return stop(
      PARSE_STOP_CODES.startersNotTwo,
      "starters",
      `attesi due elenchi di titolari, uno per squadra: trovati ${String(starterEntries.length)}`,
    );
  }

  const teamBlocks: Record<string, unknown>[] = [];
  for (const entry of starterEntries) teamBlocks.push(entry.container);
  if (teamBlocks.length !== 2) {
    return stop(PARSE_STOP_CODES.teamBlockMissing, "starters", "un elenco di titolari senza il proprio blocco squadra");
  }

  const declaredNature = pageNature(entries, shape);
  if (declaredNature === "conflicting") {
    return stop(
      PARSE_STOP_CODES.natureConflicting,
      "status",
      "la pagina dichiara sia probabile sia effettiva, e non si sceglie per lei",
    );
  }

  const natures: ("probable" | "actual")[] = [];
  for (const block of teamBlocks) {
    const own = natureFromText(firstLabelIn(block, shape.keys.status), shape);
    const chosen = own ?? declaredNature;
    if (chosen === null) {
      return stop(
        PARSE_STOP_CODES.natureUndeclared,
        "status",
        "la pagina non dichiara se questa formazione è probabile o effettiva, e non si deduce",
      );
    }
    natures.push(chosen);
  }

  const homeIndex = homeSideIndex(teamBlocks, shape);
  if (homeIndex === -1) {
    return stop(
      PARSE_STOP_CODES.homeSideUndeclared,
      "homeSide",
      "la pagina non dichiara quale squadra gioca in casa, e l'ordine degli elenchi non lo dice",
    );
  }
  const awayIndex = homeIndex === 0 ? 1 : 0;

  const homeBlock = teamBlocks[homeIndex];
  const awayBlock = teamBlocks[awayIndex];
  const homeNature = natures[homeIndex];
  const awayNature = natures[awayIndex];
  if (homeBlock === undefined || awayBlock === undefined || homeNature === undefined || awayNature === undefined) {
    return stop(PARSE_STOP_CODES.teamBlockMissing, "starters", "blocco squadra mancante dopo la lettura");
  }

  const home = lineupCandidate(homeBlock, homeNature, shape);
  const away = lineupCandidate(awayBlock, awayNature, shape);
  for (const side of [home, away]) {
    if (!side.ok) {
      return stop(
        PARSE_STOP_CODES.lineupUnreadable,
        side.family,
        "un pezzo della formazione non ha la forma descritta: meglio nessuna formazione che una a metà",
      );
    }
  }
  if (!home.ok || !away.ok) {
    return stop(PARSE_STOP_CODES.lineupUnreadable, "starters", "formazione non leggibile");
  }

  const referee = refereeFrom(entries, shape);

  const candidate = {
    provenance: {
      source: request.source,
      page: request.page,
      observedAt: request.observedAt,
      matchday: matchdayReference(entries, shape, request.requestedMatchday),
    },
    home: home.value,
    away: away.value,
    kickOff: kickOffFrom(entries, shape),
    referee: referee === null ? absentInSource() : observed(referee),
  };

  return readMatchPage(candidate, ["parseMatchPage"]);
}

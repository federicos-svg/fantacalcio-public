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
// COME LEGGE, E PERCHÉ COSÌ. L'osservazione della struttura (2026-09-04) ha
// misurato **quali famiglie di campi** esistono nel blocco di dati strutturati
// della pagina — titolari, panchina, sostituzioni, modulo, allenatore, arbitro —
// non a che profondità stanno. Quindi si cerca **per nome di chiave**, e si
// pretende di trovarne esattamente quante ne servono: due elenchi di titolari,
// uno per squadra. Trovarne zero, uno o tre non è un caso da gestire con
// fantasia, è la struttura che è cambiata, e si dichiara.
//
// FERMARSI È UN ESITO, NON UN FALLIMENTO. Ogni «non so» di questo file è un
// `shape-not-recognised` con un codice stabile e il punto in cui si è fermato.
// Non esiste un ramo che restituisca una formazione parziale: o la pagina ha la
// forma osservata, o non se ne ricava niente.

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

// --- famiglie di chiavi, come l'osservazione le ha misurate -----------------

const KEY_STARTERS = /(titolari|starters|startingeleven|starting_eleven|startinglineup|lineup)/i;
const KEY_BENCH = /(panchina|bench|riserve|substitutes)/i;
const KEY_SUBSTITUTIONS = /(sostituzioni|substitutions|cambi)/i;
const KEY_MODULE = /(modulo|formation|schema)/i;
const KEY_COACH = /(allenatore|coach|manager|mister)/i;
const KEY_REFEREE = /(arbitro|referee)/i;
const KEY_TEAM_NAME = /(^team$|teamname|nomesquadra|squadra|club)/i;
const KEY_PLAYER_NAME = /(displayname|shortname|fullname|playername|nomegiocatore|^nome$|^name$|^giocatore$|^player$)/i;
const KEY_SHIRT = /(shirtnumber|shirt_number|numeromaglia|^numero$|^number$|jersey)/i;
const KEY_ROLE = /(^ruolo$|^role$|position|posizione)/i;
const KEY_STATUS = /(status|stato|tipoformazione|lineuptype|lineupstatus)/i;
const KEY_HOME_SIDE = /(ishome|^home|home$|casa)/i;
const KEY_KICKOFF = /(kickoff|kick_off|datainizio|startdate|starttime|dataora|orariogara)/i;
const KEY_MATCHDAY = /(giornata|matchday|matchweek|^round$|gameweek)/i;
const KEY_OFF = /(esce|out$|playerout|sostituito)/i;
const KEY_ON = /(entra|in$|playerin|subentrato)/i;
const KEY_MINUTE = /(minuto|minute)/i;

const SAYS_ACTUAL = /(ufficial|confermat|effettiv|official|confirmed)/i;
const SAYS_PROBABLE = /(probabil|previst|attes|predicted|expected|probable)/i;

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

function stop<T>(code: string, why: string, at: readonly string[]): ReadOutcome<T> {
  return shapeNotRecognised<T>(`${code} — ${why}`, at);
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

function structuredBlocks(html: string): readonly string[] {
  const out: string[] = [];
  const next = /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (next?.[1] !== undefined) out.push(next[1]);
  const ld = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(ld)) {
    const body = match[1];
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

function playerFrom(element: unknown): ObservedPlayer | null {
  if (!isRecord(element)) return null;
  const name = firstLabelIn(element, KEY_PLAYER_NAME);
  if (name === null) return null;
  const shirt = firstWholeNumberIn(element, KEY_SHIRT);
  const role = firstLabelIn(element, KEY_ROLE);
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
 * La completezza è `unknown` e viene scritta **qui, in un posto solo**: la
 * pagina osservata non la dichiara, e undici nomi non sono una dichiarazione.
 * Il giorno in cui una fonte la dichiarasse, questa è la riga da cambiare.
 */
function rosterFrom(elements: readonly unknown[] | null): ObservedRoster | null {
  if (elements === null) return null;
  const players: ObservedPlayer[] = [];
  for (const element of elements) {
    const player = playerFrom(element);
    if (player === null) return null;
    players.push(player);
  }
  const completeness: Completeness = "unknown";
  return { players, completeness };
}

function substitutionsFrom(elements: readonly unknown[] | null): readonly ObservedSubstitution[] | null {
  if (elements === null) return null;
  const out: ObservedSubstitution[] = [];
  for (const element of elements) {
    if (!isRecord(element)) return null;
    const off = firstLabelIn(element, KEY_OFF);
    const on = firstLabelIn(element, KEY_ON);
    if (off === null || on === null || off === on) return null;
    // Sulla pagina osservata il minuto non c'è. Se un giorno comparisse, questa
    // riga lo legge; finché non c'è resta assente, e nessuno lo mette a zero.
    const minute = firstWholeNumberIn(element, KEY_MINUTE);
    out.push({ off, on, minute: minute === null ? absentInSource() : observed(minute) });
  }
  return out;
}

function natureFromText(text: string | null): "probable" | "actual" | null {
  if (text === null) return null;
  if (SAYS_ACTUAL.test(text)) return "actual";
  if (SAYS_PROBABLE.test(text)) return "probable";
  return null;
}

/**
 * La natura dichiarata da qualche parte nella pagina.
 *
 * Due dichiarazioni discordi non si arbitrano: chi scegliesse la prima trovata
 * deciderebbe a caso se una formazione è una previsione o un fatto, che è
 * esattamente la confusione che il requisito di misurabilità vieta.
 */
function pageNature(entries: readonly Entry[]): "probable" | "actual" | "conflicting" | null {
  let found: "probable" | "actual" | null = null;
  for (const entry of entries) {
    if (!KEY_STATUS.test(entry.key)) continue;
    const read = natureFromText(label(entry.value));
    if (read === null) continue;
    if (found !== null && found !== read) return "conflicting";
    found = read;
  }
  return found;
}

function lineupCandidate(
  block: Record<string, unknown>,
  nature: "probable" | "actual",
): Record<string, unknown> | null {
  const team = firstLabelIn(block, KEY_TEAM_NAME);
  if (team === null) return null;

  const starters = rosterFrom(firstArrayIn(block, KEY_STARTERS));
  if (starters === null) return null;

  const rawBench = firstArrayIn(block, KEY_BENCH);
  const bench = rawBench === null ? null : rosterFrom(rawBench);
  if (rawBench !== null && bench === null) return null;

  const rawSubs = firstArrayIn(block, KEY_SUBSTITUTIONS);
  const substitutions = rawSubs === null ? null : substitutionsFrom(rawSubs);
  if (rawSubs !== null && substitutions === null) return null;

  const moduleText = firstLabelIn(block, KEY_MODULE);
  const coach = firstLabelIn(block, KEY_COACH);

  const asField = <T>(value: T | null): Field<T> => (value === null ? absentInSource<T>() : observed(value));

  return {
    team,
    nature,
    module: moduleText !== null && MODULE_SHAPE.test(moduleText) ? observed(moduleText) : absentInSource(),
    coach: asField(coach),
    starters: observed(starters),
    // Panchina assente NON è panchina vuota: è la sezione che la pagina non
    // espone, e resta un'assenza dichiarata.
    bench: asField(bench),
    substitutions: asField(substitutions),
    // Questa pagina non porta indisponibili, squalificati e ballottaggi: non li
    // abbiamo guardati qui, e «non guardato» non è «la fonte non ce l'ha».
    unavailable: notObserved(),
    suspended: notObserved(),
    duels: notObserved(),
    completeness: "unknown",
  };
}

function matchdayReference(entries: readonly Entry[], requested: number | null): MatchdayReference {
  for (const entry of entries) {
    if (!KEY_MATCHDAY.test(entry.key)) continue;
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

function homeSideIndex(blocks: readonly Record<string, unknown>[]): number {
  let index = -1;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block === undefined) continue;
    for (const key of Object.keys(block)) {
      if (!KEY_HOME_SIDE.test(key)) continue;
      const value = block[key];
      if (value === true || (typeof value === "string" && /^(home|casa|true)$/i.test(value.trim()))) {
        index = i;
      }
    }
  }
  return index;
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
  const at = ["parseMatchPage"];
  if (request.rawHtml.length === 0) {
    return stop(PARSE_STOP_CODES.emptyInput, "nessun contenuto grezzo da leggere", at);
  }

  const blocks = structuredBlocks(request.rawHtml);
  if (blocks.length === 0) {
    return stop(
      PARSE_STOP_CODES.noStructuredBlock,
      "la pagina non porta il blocco di dati strutturati osservato",
      at,
    );
  }
  const root = firstReadableJson(blocks);
  if (root === null) {
    return stop(PARSE_STOP_CODES.unreadableBlock, "nessuno dei blocchi trovati è JSON valido", at);
  }

  const entries = entriesOf(root);
  const starterEntries = entries.filter((entry) => KEY_STARTERS.test(entry.key) && Array.isArray(entry.value));
  if (starterEntries.length !== 2) {
    return stop(
      PARSE_STOP_CODES.startersNotTwo,
      `attesi due elenchi di titolari, uno per squadra: trovati ${String(starterEntries.length)}`,
      [...at, "starters"],
    );
  }

  const teamBlocks: Record<string, unknown>[] = [];
  for (const entry of starterEntries) teamBlocks.push(entry.container);
  if (teamBlocks.length !== 2) {
    return stop(PARSE_STOP_CODES.teamBlockMissing, "un elenco di titolari senza il proprio blocco squadra", at);
  }

  const declaredNature = pageNature(entries);
  if (declaredNature === "conflicting") {
    return stop(
      PARSE_STOP_CODES.natureConflicting,
      "la pagina dichiara sia probabile sia effettiva, e non si sceglie per lei",
      [...at, "nature"],
    );
  }

  const natures: ("probable" | "actual")[] = [];
  for (const block of teamBlocks) {
    const own = natureFromText(firstLabelIn(block, KEY_STATUS));
    const chosen = own ?? declaredNature;
    if (chosen === null) {
      return stop(
        PARSE_STOP_CODES.natureUndeclared,
        "la pagina non dichiara se questa formazione è probabile o effettiva, e non si deduce",
        [...at, "nature"],
      );
    }
    natures.push(chosen);
  }

  const homeIndex = homeSideIndex(teamBlocks);
  if (homeIndex === -1) {
    return stop(
      PARSE_STOP_CODES.homeSideUndeclared,
      "la pagina non dichiara quale squadra gioca in casa, e l'ordine degli elenchi non lo dice",
      [...at, "home"],
    );
  }
  const awayIndex = homeIndex === 0 ? 1 : 0;

  const homeBlock = teamBlocks[homeIndex];
  const awayBlock = teamBlocks[awayIndex];
  const homeNature = natures[homeIndex];
  const awayNature = natures[awayIndex];
  if (homeBlock === undefined || awayBlock === undefined || homeNature === undefined || awayNature === undefined) {
    return stop(PARSE_STOP_CODES.teamBlockMissing, "blocco squadra mancante dopo la lettura", at);
  }

  const home = lineupCandidate(homeBlock, homeNature);
  const away = lineupCandidate(awayBlock, awayNature);
  if (home === null || away === null) {
    return stop(
      PARSE_STOP_CODES.lineupUnreadable,
      "un elenco di giocatori non ha la forma osservata: meglio nessuna formazione che una a metà",
      [...at, "lineup"],
    );
  }

  const refereeName = firstLabelIn(isRecord(root) ? root : {}, KEY_REFEREE) ?? refereeFrom(entries);
  const kickOff = kickOffFrom(entries);

  const candidate = {
    provenance: {
      source: request.source,
      page: request.page,
      observedAt: request.observedAt,
      matchday: matchdayReference(entries, request.requestedMatchday),
    },
    home,
    away,
    kickOff,
    referee: refereeName === null ? absentInSource() : observed(refereeName),
  };

  return readMatchPage(candidate, at);
}

function refereeFrom(entries: readonly Entry[]): string | null {
  for (const entry of entries) {
    if (!KEY_REFEREE.test(entry.key)) continue;
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
function kickOffFrom(entries: readonly Entry[]): Field<string> {
  for (const entry of entries) {
    if (!KEY_KICKOFF.test(entry.key)) continue;
    if (typeof entry.value !== "string") continue;
    if (INSTANT_WITH_ZONE.test(entry.value)) return observed(entry.value);
  }
  return absentInSource();
}

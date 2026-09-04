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
//
// QUANDO UNA COSA È SCRITTA PIÙ DI UNA VOLTA — **il primo vince, e dove il
// primo non basta si rifiuta**. È la convenzione unica di questo file, e prima
// non c'era: alcune letture prendevano il primo valore trovato e una — il lato
// di casa — prendeva l'ultimo, senza che nessuna delle due fosse dichiarata.
// Due convenzioni opposte sulla stessa specie di ambiguità sono un difetto
// anche quando ogni singola riga sembra ragionevole.
//
// La convenzione si legge così, e vale per tutto il file:
//
//   1. per un dato **accessorio** — l'etichetta della squadra, il modulo,
//      l'allenatore, la maglia, il ruolo, l'arbitro, il calcio d'inizio, la
//      giornata — vince **il primo valore leggibile** nell'ordine in cui il
//      documento lo espone. Un secondo valore più avanti non lo sostituisce e
//      non lo corregge: è, al più, rumore, e il rumore non deve poter cambiare
//      il risultato a seconda di dove capita;
//   2. per un dato che **decide di che partita si tratta** — se la formazione è
//      probabile o effettiva, e quale squadra gioca in casa — «il primo» non è
//      una risposta accettabile, perché sceglierebbe a caso fra due
//      affermazioni che non possono essere vere insieme. Lì due dichiarazioni
//      discordi sono un'AMBIGUITÀ e la lettura si ferma, dicendo quale famiglia
//      di chiavi l'ha prodotta.
//
// Il secondo punto non è teorico. Le espressioni della tabella privata sono
// compilate **non ancorate**: una chiave come `isHomeTeamFavourite` dentro il
// blocco della squadra ospite basta a far scattare la famiglia `homeSide` sul
// blocco sbagliato. Con la regola «vince l'ultimo» quella chiave **invertiva la
// partita in silenzio**, e una partita invertita inverte tutto ciò che a valle
// si costruisce sopra. Con questa regola, invece, si ferma.

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
  startersSameBlock: "TITOLARI_STESSO_BLOCCO",
  natureUndeclared: "NATURA_NON_DICHIARATA",
  natureConflicting: "NATURA_DISCORDE",
  homeSideUndeclared: "LATO_CASA_NON_DICHIARATO",
  homeSideConflicting: "LATO_CASA_DISCORDE",
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

/**
 * GLI ISTANTI CHE QUESTO PARSER EMETTE — il contratto verso chi li consuma.
 *
 * Questa forma è l'unica che esce di qui, e vale sia per il calcio d'inizio sia
 * per il momento della lettura: ISO-8601 **con il fuso scritto**, o come `Z` o
 * come scostamento esplicito (`+02:00`). Un istante senza fuso non è un istante
 * incompleto da correggere più tardi: è **malformato**, e qui viene dichiarato
 * assente invece che emesso.
 *
 * IL MOTIVO STA A VALLE, non qui. La misura di affidabilità di una fonte vive
 * sul confronto fra quando abbiamo letto e il calcio d'inizio — è ciò che
 * separa una previsione da una cronaca. Due ore di scostamento attraversano
 * quel confine per intero: un `20:45` senza fuso, letto da chi ragiona in UTC,
 * diventa un `22:45` italiano, e una lettura fatta prima della partita sembra
 * fatta dopo.
 *
 * LA DIVISIONE DEL LAVORO, dichiarata perché nessuno dei due lati la deduca:
 * **questo parser emette il fuso**, e **chi consuma normalizza a UTC prima di
 * confrontare**. Il parser non normalizza — riscrivere l'istante della fonte in
 * un altro fuso è già un'interpretazione, e questo file non ne fa — e chi
 * confronta non suppone un fuso quando non lo trova: rifiuta.
 */
const INSTANT_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * LA COMPLETEZZA RESTA «NON SO», E IL PERCHÉ È UN LIMITE DELLA FONTE.
 *
 * Non è una svista né una riga rimasta indietro: è ciò che la struttura che
 * sappiamo descrivere permette di dire. La `SourceShape` — l'unica cosa che
 * questo parser sa della fonte — ha una famiglia di chiavi per i titolari, una
 * per la panchina, una per lo stato «probabile o effettiva», e **nessuna che
 * dica dove una pagina dichiari di aver elencato tutti**. Senza quella
 * famiglia, «completa» e «parziale» qui non si possono leggere: si potrebbero
 * solo dedurre, e dedurle sarebbe il difetto peggiore dei tre.
 *
 * PERCHÉ NON SI DEDUCE. Undici nomi non sono una dichiarazione di completezza:
 * una fonte può pubblicarne undici perché sono quelli che sa. Chi scrivesse
 * «completa» guardando la lunghezza dell'elenco regalerebbe punteggio a ogni
 * fonte che si limita a scrivere meno, e la misura di affidabilità premierebbe
 * il silenzio — esattamente ciò che deve invece penalizzare.
 *
 * COSA SERVIREBBE PER FARLA VALERE DAVVERO, detto per intero perché chi arriva
 * dopo non debba ricostruirlo: una nuova famiglia di chiavi in `SourceShape` e
 * i modi di dire «completa» e «parziale» accanto a `saysActual` e
 * `saysProbable`. Sono due cose che vivono nella tabella privata, non qui: la
 * loro assenza è una **proprietà della fonte descritta**, e finché dura, questa
 * costante è la risposta onesta. Il giorno in cui la tabella le porti, questo è
 * il punto unico da cambiare, ed è unico apposta.
 */
const UNKNOWN_COMPLETENESS: Completeness = "unknown";

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

// I TRE MODI DI PESCARE UN VALORE DENTRO UN CONTENITORE.
//
// Tutti e tre applicano il punto 1 della convenzione in testa al file — **vince
// il primo valore leggibile** — e lo applicano allo stesso modo: si scorrono le
// chiavi nell'ordine in cui il documento le espone, e alla prima che è della
// famiglia giusta e porta un valore della forma giusta ci si ferma. Nessuno dei
// tre continua a cercare per vedere se più avanti c'è di meglio.

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
 * La completezza è `unknown`, e viene scritta **qui, in un posto solo**. Il
 * perché per esteso è in `UNKNOWN_COMPLETENESS`: è un limite dichiarato della
 * struttura che sappiamo descrivere, non una svista.
 */
function rosterFrom(elements: readonly unknown[] | null, shape: SourceShape): ObservedRoster | null {
  if (elements === null) return null;
  const players: ObservedPlayer[] = [];
  for (const element of elements) {
    const player = playerFrom(element, shape);
    if (player === null) return null;
    players.push(player);
  }
  return { players, completeness: UNKNOWN_COMPLETENESS };
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

/**
 * La natura di **una** squadra: quella che dichiara il suo blocco se ce l'ha,
 * altrimenti quella dichiarata dalla pagina. `null` quando non la dichiara
 * nessuno dei due, e allora non si deduce.
 *
 * Dentro il blocco vale il punto 1 della convenzione: `firstLabelIn` prende la
 * prima chiave della famiglia `status` che porti un'etichetta leggibile. Le
 * dichiarazioni discordi **fra** blocchi le ha già intercettate `pageNature`,
 * che le vede tutte.
 */
function sideFrom(
  block: Record<string, unknown>,
  declared: "probable" | "actual" | null,
  shape: SourceShape,
): Side | null {
  const own = natureFromText(firstLabelIn(block, shape.keys.status), shape);
  const nature = own ?? declared;
  return nature === null ? null : { block, nature };
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
      // Stesso limite dichiarato delle liste, per la formazione nel suo
      // insieme: vedi `UNKNOWN_COMPLETENESS`.
      completeness: UNKNOWN_COMPLETENESS,
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

/** Una squadra della pagina: il suo blocco, e la natura già decisa per lei. */
interface Side {
  readonly block: Record<string, unknown>;
  readonly nature: "probable" | "actual";
}

const SAYS_HOME = /^(home|casa|true)$/i;
const SAYS_AWAY = /^(away|trasferta|ospite|false)$/i;

/**
 * Che cosa dichiara **questo** blocco sul proprio lato: casa, trasferta,
 * tutt'e due, oppure niente.
 *
 * «Tutt'e due» non è un caso astratto da mettere in conto per scrupolo: le
 * espressioni della tabella non sono ancorate, quindi nello stesso blocco
 * possono cadere due chiavi diverse della famiglia `homeSide` che dicono cose
 * opposte. Quando succede, questo blocco non dichiara niente di utilizzabile, e
 * chi chiama si ferma invece di scegliere.
 */
function declaredSideOf(block: Record<string, unknown>, shape: SourceShape): "home" | "away" | "both" | null {
  let saysHome = false;
  let saysAway = false;
  for (const key of Object.keys(block)) {
    if (!shape.keys.homeSide.test(key)) continue;
    const value = block[key];
    if (value === true || (typeof value === "string" && SAYS_HOME.test(value.trim()))) saysHome = true;
    else if (value === false || (typeof value === "string" && SAYS_AWAY.test(value.trim()))) saysAway = true;
  }
  if (saysHome && saysAway) return "both";
  if (saysHome) return "home";
  if (saysAway) return "away";
  return null;
}

/** Le due squadre messe in ordine, oppure il motivo per cui non si ordinano. */
type OrderedSides =
  | { readonly kind: "ordered"; readonly home: Side; readonly away: Side }
  | { readonly kind: "undeclared" }
  | { readonly kind: "conflicting"; readonly why: string };

/**
 * CHI GIOCA IN CASA — dal campo dichiarato, e mai dalla posizione.
 *
 * Qui vive il punto 2 della convenzione in testa al file. Prima questa funzione
 * restituiva **l'ultimo** blocco che si dichiarava in casa senza mai fermarsi:
 * con due dichiarazioni di casa vinceva quella scritta più in basso, cioè la
 * partita si decideva sull'ordine del documento, che è esattamente ciò che il
 * campo dichiarato esiste per non far succedere. E siccome le espressioni della
 * tabella non sono ancorate, bastava una chiave come `isHomeTeamFavourite`
 * dentro il blocco ospite per **invertire la partita in silenzio**.
 *
 * Ora due dichiarazioni di casa sono un'ambiguità e si rifiuta — la stessa
 * politica che `pageNature` applica alle dichiarazioni discordi di natura.
 * Averne due opposte, nello stesso parser, sulla stessa specie di problema, era
 * il difetto sotto il difetto.
 */
function orderSides(first: Side, second: Side, shape: SourceShape): OrderedSides {
  const firstSaid = declaredSideOf(first.block, shape);
  const secondSaid = declaredSideOf(second.block, shape);

  if (firstSaid === "both" || secondSaid === "both") {
    return {
      kind: "conflicting",
      why: "un blocco squadra si dichiara insieme in casa e in trasferta, e non si sceglie per lui",
    };
  }
  if (firstSaid === "home" && secondSaid === "home") {
    return {
      kind: "conflicting",
      why: "entrambi i blocchi squadra si dichiarano in casa, e l'ordine in cui compaiono non è una risposta",
    };
  }
  if (firstSaid === "home") return { kind: "ordered", home: first, away: second };
  if (secondSaid === "home") return { kind: "ordered", home: second, away: first };
  return { kind: "undeclared" };
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
 * Il calcio d'inizio, **solo con il fuso** — `Z` o scostamento esplicito.
 *
 * Il contratto verso chi consuma, e la divisione del lavoro che ne segue, sono
 * scritti per esteso su `INSTANT_WITH_ZONE`. Qui basta la conseguenza: un
 * istante senza fuso non si può confrontare con il momento della lettura, e il
 * confronto è tutto ciò per cui questo campo serve. Meglio dichiararlo assente
 * che ordinarlo a caso.
 *
 * Vale il punto 1 della convenzione: **il primo** istante ben formato che si
 * incontra vince, e nessuno più avanti lo sostituisce.
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
  // Due elenchi di titolari, presi **per nome** e non per posizione. La forma
  // destrutturata non è un vezzo: è ciò che rende il «sono esattamente due» un
  // fatto anche per il compilatore, e toglie di mezzo i controlli che dopo
  // questo punto non potevano più fallire — e che, non potendo fallire, non
  // proteggevano nessuno pur avendone l'aria.
  const [firstStarters, secondStarters, ...extraStarters] = starterEntries;
  if (firstStarters === undefined || secondStarters === undefined || extraStarters.length > 0) {
    return stop(
      PARSE_STOP_CODES.startersNotTwo,
      "starters",
      `attesi due elenchi di titolari, uno per squadra: trovati ${String(starterEntries.length)}`,
    );
  }
  // DUE ELENCHI, MA NELLO STESSO CONTENITORE. Un blocco è una squadra: due
  // elenchi di titolari dentro lo stesso oggetto non sono due squadre, sono una
  // struttura che non è quella descritta — e con le espressioni della tabella
  // non ancorate ci si arriva con due chiavi simili nello stesso posto. Va
  // fermato qui, dove si vede: più a valle diventerebbe «le due squadre di una
  // partita non possono essere la stessa», cioè un problema di contenuto al
  // posto di un problema di struttura.
  if (firstStarters.container === secondStarters.container) {
    return stop(
      PARSE_STOP_CODES.startersSameBlock,
      "starters",
      "due elenchi di titolari nello stesso blocco squadra: un blocco è una squadra, e due squadre non ci stanno",
    );
  }

  const declaredNature = pageNature(entries, shape);
  if (declaredNature === "conflicting") {
    return stop(
      PARSE_STOP_CODES.natureConflicting,
      "status",
      "la pagina dichiara sia probabile sia effettiva, e non si sceglie per lei",
    );
  }

  const firstSide = sideFrom(firstStarters.container, declaredNature, shape);
  const secondSide = sideFrom(secondStarters.container, declaredNature, shape);
  if (firstSide === null || secondSide === null) {
    return stop(
      PARSE_STOP_CODES.natureUndeclared,
      "status",
      "la pagina non dichiara se questa formazione è probabile o effettiva, e non si deduce",
    );
  }

  const ordered = orderSides(firstSide, secondSide, shape);
  if (ordered.kind === "undeclared") {
    return stop(
      PARSE_STOP_CODES.homeSideUndeclared,
      "homeSide",
      "la pagina non dichiara quale squadra gioca in casa, e l'ordine degli elenchi non lo dice",
    );
  }
  if (ordered.kind === "conflicting") {
    return stop(PARSE_STOP_CODES.homeSideConflicting, "homeSide", ordered.why);
  }

  const lineupWhy = "un pezzo della formazione non ha la forma descritta: meglio nessuna formazione che una a metà";
  const home = lineupCandidate(ordered.home.block, ordered.home.nature, shape);
  if (!home.ok) return stop(PARSE_STOP_CODES.lineupUnreadable, home.family, lineupWhy);
  const away = lineupCandidate(ordered.away.block, ordered.away.nature, shape);
  if (!away.ok) return stop(PARSE_STOP_CODES.lineupUnreadable, away.family, lineupWhy);

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

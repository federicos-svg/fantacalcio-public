// L'ARCHIVIO AVVERSARI — LA VIA D'INGRESSO.
//
// IL DIFETTO CHE QUESTO FILE CHIUDE. Il pannello AVVERSARI: I PRECEDENTI
// (src/ui/liveFacts.ts) è costruito, testato e difeso: legge lo storico d'asta
// multi-stagione e i profili d'intervista da `state.auctionHistory` /
// `state.opponentProfiles`, che main.ts riempie al boot da `loadAuctionHistory`
// / `loadOpponentProfiles`. Ma nessun codice dell'app ha mai CHIAMATO
// `saveAuctionHistory` o `saveOpponentProfiles`: i due depositi runtime-local
// esistevano solo come lettura. In produzione il pannello avrebbe detto
// «Nessuno storico d'asta caricato» per sempre — una stanza arredata senza
// porta. Questo modulo è la porta, e non è nient'altro.
//
// PERCHÉ NON INVENTA UN FORMATO. La forma esatta del dato in ingresso è già
// dichiarata dal pacchetto: `AuctionHistoryStore` (`{ schemaVersion, purchases }`,
// packages/opponent-profiles/src/historySchema.ts) e `OpponentProfileStore`
// (`{ schemaVersion, profiles }`, .../profileSchema.ts). Il file che Pico
// prepara è ESATTAMENTE uno di quei due involucri, e la validazione passa dai
// validatori veri del pacchetto — non da una seconda ricetta scritta qui, che
// col tempo divergerebbe da quella che il lettore applica. Da qui anche la
// scelta di DUE archivi separati invece di un involucro unico che li contenga:
// un involucro nuovo sarebbe un terzo schema da tenere allineato agli altri
// due, e renderebbe atomica una scrittura che localStorage non può rendere
// atomica su due chiavi.
//
// FAIL-CLOSED, E LA CONSEGUENZA CHE CONTA DAVVERO. Un file non conforme non
// carica NIENTE: né a metà, né «solo le righe buone». Un conteggio di
// precedenti calcolato su metà delle righe è un numero sbagliato con l'aria di
// un fatto. E soprattutto non TOCCA l'archivio già presente: chi prova a
// caricare il file sbagliato la sera dell'asta non deve ritrovarsi senza
// quello giusto. Ogni esito di questo modulo riporta ciò che la memoria locale
// contiene ADESSO — riletto da lì, mai dedotto — proprio perché quella
// promessa sia verificabile invece che dichiarata.
//
// PRIVACY (issue #234, nota privacy; packages/opponent-profiles/tests/privacy.test.ts).
// Uno storico d'asta reale dice, dietro un `personId` opaco, chi ha speso cosa
// per cinque stagioni: sono amici di Pico, con nome e cognome nel registro
// lega. Da qui due regole che questo file applica per costruzione e non per
// attenzione:
//
//   1. NIENTE RETE E NIENTE I/O. Il testo del file arriva da un `FileReader`
//      locale (src/ui/opponentArchiveSettings.ts) e finisce nello storage
//      locale del browser. Non esiste qui — e non deve esistere — nessun
//      helper di export, download o serializzazione verso un file: sarebbe il
//      meccanismo con cui un archivio reale esce, e il pacchetto non lo
//      fornisce proprio per questo.
//   2. NESSUN MESSAGGIO D'ERRORE CITA IL CONTENUTO. Un rifiuto dice che cosa
//      non va nella FORMA — quale campo, a quale riga, con quale tipo di
//      violazione — e mai quale nome, quale club o quale prezzo. La garanzia è
//      strutturale: `safeIssuePath()` fa passare solo i nomi di campo che lo
//      schema dichiara e gli indici di riga; qualunque altro segmento — che è
//      esattamente il caso in cui una chiave inventata potrebbe essere un nome
//      di persona — viene sostituito da un'etichetta fissa.

import {
  clearAuctionHistory,
  clearOpponentProfiles,
  historyLogSummary,
  loadAuctionHistory,
  loadOpponentProfiles,
  opponentProfileSchema,
  pastAuctionPurchaseSchema,
  saveAuctionHistory,
  saveOpponentProfiles,
  validateAuctionHistoryStore,
  validateOpponentProfileStore,
  type OpponentProfile,
  type PastAuctionPurchase,
  type ProfileIssue,
  type StorageLike,
} from "../packages/opponent-profiles/src/index.js";

// ── Esito, e il tono con cui la schermata lo dice ────────────────────────────

/**
 * Il messaggio che la schermata mostra dopo un'azione sull'archivio.
 *
 * `tone` è separato dal testo perché la schermata deve poter distinguere un
 * rifiuto da una conferma senza rileggere la frase: il colore è
 * un'informazione, e dedurlo da una sottostringa sarebbe un accoppiamento che
 * si rompe alla prima riscrittura del testo.
 */
export interface ArchiveMessage {
  readonly tone: "ok" | "error";
  readonly text: string;
}

/**
 * L'esito di un'azione, più CIÒ CHE LA MEMORIA LOCALE CONTIENE ADESSO.
 *
 * `stored` non è «quello che ho appena caricato»: è il risultato di una
 * rilettura da storage fatta dopo l'azione, qualunque essa sia andata. È così
 * che la promessa «un file sbagliato non cancella l'archivio già presente»
 * diventa verificabile invece che dichiarata — e che «sopravvive al reload»
 * smette di essere una promessa: se la scrittura non ha attecchito, `stored` è
 * il vecchio archivio (o niente) e il messaggio lo dice.
 */
export interface ArchiveApplied<T> {
  readonly message: ArchiveMessage;
  readonly stored: readonly T[];
}

// ── I nomi di campo che è lecito stampare ────────────────────────────────────

/**
 * I segmenti di path ammessi in un messaggio d'errore, per lo storico.
 *
 * Derivati dallo schema invece che scritti a mano dove è possibile: un campo
 * aggiunto domani a `pastAuctionPurchaseSchema` compare qui senza che nessuno
 * debba ricordarsene. I due nomi dell'involucro (`schemaVersion`, `purchases`)
 * vivono su `auctionHistoryStoreSchema`, che è un `ZodEffects` per via del
 * `.refine()` sui duplicati e quindi non espone `.shape`: sono scritti a mano,
 * e `opponentArchive.test.ts` verifica che restino quelli.
 */
export const HISTORY_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  "schemaVersion",
  "purchases",
  ...Object.keys(pastAuctionPurchaseSchema.shape),
]);

/**
 * Gli stessi, per i profili. `value` / `status` / `declaredAt` sono
 * l'involucro `Declared<T>` di ogni risposta d'intervista (types.ts): non
 * appartengono a `opponentProfileSchema.shape`, che li tiene un livello più
 * sotto, e senza di loro un errore su una dichiarazione uscirebbe come
 * «campo non previsto» proprio dove il campo era previsto eccome.
 */
export const PROFILE_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  "schemaVersion",
  "profiles",
  ...Object.keys(opponentProfileSchema.shape),
  "value",
  "status",
  "declaredAt",
]);

/** Ciò che prende il posto di un segmento non riconosciuto. Mai il segmento. */
export const UNKNOWN_FIELD_LABEL = "campo non previsto";

/** Ciò che prende il posto del path vuoto: la violazione è sull'involucro. */
export const ROOT_PATH_LABEL = "involucro del file";

/**
 * Path di una violazione -> testo sicuro da stampare.
 *
 * LA REGOLA È UN ELENCO CHIUSO, non un filtro su ciò che «sembra» un dato
 * personale. Un segmento passa solo se è un indice di riga (diventa «riga N»,
 * contata da 1 come la leggerebbe un essere umano) o se è uno dei nomi di
 * campo che lo schema dichiara. Tutto il resto diventa `UNKNOWN_FIELD_LABEL`,
 * ed è il caso che conta: zod riporta le chiavi NON riconosciute per nome
 * (`unrecognized_keys`), e una chiave non riconosciuta è esattamente il posto
 * dove finirebbe un `"Mario Rossi"` scritto per sbaglio come nome di campo.
 * Il pacchetto le stampa di proposito — lì il chiamante è il layer privato —
 * ma questa schermata è la superficie di un file scritto a mano, e qui vince
 * la regola più stretta.
 */
export function safeIssuePath(path: string, allowed: ReadonlySet<string>): string {
  if (path === "") return ROOT_PATH_LABEL;
  return path
    .split(".")
    .map((segment) => {
      if (/^\d+$/.test(segment)) return `riga ${Number(segment) + 1}`;
      return allowed.has(segment) ? segment : UNKNOWN_FIELD_LABEL;
    })
    .join(" › ");
}

/**
 * Codice zod -> perché quella riga non va bene, in italiano.
 *
 * Il codice grezzo non viene mai stampato nemmeno come ripiego: appartiene a
 * un vocabolario chiuso e sarebbe innocuo, ma «non conforme» è ciò che questa
 * schermata sa dire con certezza, e un codice inglese in mezzo a una frase
 * italiana non aiuta chi deve correggere un file a mano.
 */
export function issueReasonText(code: string): string {
  switch (code) {
    case "invalid_type":
      return "tipo sbagliato (o campo mancante)";
    case "unrecognized_keys":
      return "campo non previsto dallo schema";
    case "invalid_literal":
      return "schemaVersion diverso da 1";
    case "invalid_enum_value":
      return "valore fuori dall'elenco ammesso";
    case "invalid_string":
      return "formato non valido";
    case "too_small":
      return "valore troppo piccolo o testo vuoto";
    case "too_big":
      return "valore troppo grande o testo troppo lungo";
    case "custom":
      return "regola dell'archivio violata (per esempio due righe identiche)";
    default:
      return "non conforme";
  }
}

/** Quante violazioni il messaggio elenca prima di riassumere le altre. */
export const ISSUE_LINES_MAX = 4;

/**
 * L'elenco delle violazioni, già sicuro da stampare, troncato.
 *
 * Troncato e non completo perché un file storto produce facilmente centinaia
 * di issue identiche, e un muro di righe uguali nasconde la prima — che è
 * quasi sempre quella da correggere. Il numero totale resta scritto, così non
 * si scambia il troncamento per l'elenco intero.
 */
export function issueLines(
  issues: readonly ProfileIssue[],
  allowed: ReadonlySet<string>,
): readonly string[] {
  const lines = issues
    .slice(0, ISSUE_LINES_MAX)
    .map((issue) => `${safeIssuePath(issue.path, allowed)}: ${issueReasonText(issue.code)}`);
  const rest = issues.length - lines.length;
  return rest > 0 ? [...lines, `…e altre ${rest} violazioni dello stesso file.`] : lines;
}

// ── Testo -> archivio validato, o il motivo del rifiuto ──────────────────────

type ParseOutcome<T> =
  | { readonly ok: true; readonly value: readonly T[] }
  | { readonly ok: false; readonly text: string };

/**
 * Prefisso comune di ogni rifiuto: dice subito la cosa che serve sapere per
 * prima, cioè che NULLA è cambiato. La ragione dettagliata viene dopo.
 */
const REFUSED_PREFIX = "File rifiutato: nulla è stato caricato e l'archivio già presente non è stato toccato.";

const NOT_JSON = `${REFUSED_PREFIX} Il file non è JSON leggibile.`;

function refusalText(issues: readonly ProfileIssue[], allowed: ReadonlySet<string>): string {
  const lines = issueLines(issues, allowed);
  if (lines.length === 0) return `${REFUSED_PREFIX} La forma del file non corrisponde allo schema.`;
  return `${REFUSED_PREFIX} ${lines.join(" · ")}`;
}

function parseJson(text: string): { readonly ok: true; readonly json: unknown } | { readonly ok: false } {
  try {
    return { ok: true, json: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Testo del file -> gli acquisti passati, o il motivo per cui non lo è. */
export function parseAuctionHistoryText(text: string): ParseOutcome<PastAuctionPurchase> {
  const json = parseJson(text);
  if (!json.ok) return { ok: false, text: NOT_JSON };
  const validated = validateAuctionHistoryStore(json.json);
  if (!validated.ok) return { ok: false, text: refusalText(validated.issues, HISTORY_PATH_SEGMENTS) };
  return { ok: true, value: validated.store.purchases };
}

/** Testo del file -> i profili d'intervista, o il motivo per cui non lo è. */
export function parseOpponentProfilesText(text: string): ParseOutcome<OpponentProfile> {
  const json = parseJson(text);
  if (!json.ok) return { ok: false, text: NOT_JSON };
  const validated = validateOpponentProfileStore(json.json);
  if (!validated.ok) return { ok: false, text: refusalText(validated.issues, PROFILE_PATH_SEGMENTS) };
  return { ok: true, value: validated.store.profiles };
}

// ── Le quattro azioni ────────────────────────────────────────────────────────
//
// Tutte e quattro finiscono nello stesso modo: RILEGGENDO dallo storage. Non è
// una precauzione ridondante sopra la rilettura che `saveAuctionHistory()` fa
// già al proprio interno — quella confronta la stringa scritta con quella
// riletta e trasforma una quota piena in un `write-failed`. Questa rilegge
// attraverso il VALIDATORE, cioè per la stessa porta da cui l'app legge al
// boot: è l'unica che risponda alla domanda che conta davvero, «al prossimo
// reload che cosa troverò?».

const SAVED_OK = "Archivio salvato nella memoria locale di questo browser e riletto da lì: sopravvive al reload.";

const WRITE_FAILED =
  "Archivio NON salvato: la memoria locale del browser ha rifiutato la scrittura (spazio pieno o negato). " +
  "L'archivio già presente non è stato toccato.";

const REREAD_FAILED =
  "Scrittura eseguita ma la rilettura di controllo non l'ha ritrovata conforme: non conto su questo archivio, " +
  "e nemmeno tu dovresti. Riprova, oppure rimuovilo e ricaricalo.";

const REVALIDATION_FAILED =
  "Archivio NON salvato: la rivalidazione in scrittura lo ha rifiutato. L'archivio già presente non è stato toccato.";

const REMOVED_OK = "Archivio rimosso dalla memoria locale di questo browser.";

const REMOVE_FAILED =
  "Archivio NON rimosso: la memoria locale del browser ha rifiutato la cancellazione. " +
  "Quello che c'era è ancora lì.";

/** Rilettura di controllo dello storico: la stessa che l'app fa al boot. */
function storedHistory(storage: StorageLike): readonly PastAuctionPurchase[] {
  return loadAuctionHistory(storage).purchases;
}

/** Rilettura di controllo dei profili: la stessa che l'app fa al boot. */
function storedProfiles(storage: StorageLike): readonly OpponentProfile[] {
  return loadOpponentProfiles(storage).profiles;
}

/**
 * Carica lo storico d'asta dal testo di un file scelto a mano.
 *
 * L'ordine dei passi è il vincolo, non un dettaglio di stile: si valida PRIMA
 * di toccare qualunque cosa, così un file storto non ha nessun modo di
 * arrivare alla scrittura. Il ramo di rifiuto rilegge comunque lo storage —
 * senza scriverci — perché la schermata mostri l'archivio che è rimasto lì, e
 * non una lista svuotata dal fallimento.
 */
export function applyAuctionHistoryText(
  storage: StorageLike,
  text: string,
): ArchiveApplied<PastAuctionPurchase> {
  const parsed = parseAuctionHistoryText(text);
  if (!parsed.ok) {
    return { message: { tone: "error", text: parsed.text }, stored: storedHistory(storage) };
  }
  const saved = saveAuctionHistory(storage, parsed.value);
  if (!saved.ok) {
    return {
      message: { tone: "error", text: saved.reason === "invalid" ? REVALIDATION_FAILED : WRITE_FAILED },
      stored: storedHistory(storage),
    };
  }
  const reread = loadAuctionHistory(storage);
  if (!reread.ok || reread.purchases.length !== parsed.value.length) {
    return { message: { tone: "error", text: REREAD_FAILED }, stored: reread.purchases };
  }
  return { message: { tone: "ok", text: SAVED_OK }, stored: reread.purchases };
}

/** Carica i profili d'intervista. Stessa sequenza, stesso patto. */
export function applyOpponentProfilesText(
  storage: StorageLike,
  text: string,
): ArchiveApplied<OpponentProfile> {
  const parsed = parseOpponentProfilesText(text);
  if (!parsed.ok) {
    return { message: { tone: "error", text: parsed.text }, stored: storedProfiles(storage) };
  }
  const saved = saveOpponentProfiles(storage, parsed.value);
  if (!saved.ok) {
    return {
      message: { tone: "error", text: saved.reason === "invalid" ? REVALIDATION_FAILED : WRITE_FAILED },
      stored: storedProfiles(storage),
    };
  }
  const reread = loadOpponentProfiles(storage);
  if (!reread.ok || reread.profiles.length !== parsed.value.length) {
    return { message: { tone: "error", text: REREAD_FAILED }, stored: reread.profiles };
  }
  return { message: { tone: "ok", text: SAVED_OK }, stored: reread.profiles };
}

/**
 * Rimuove lo storico.
 *
 * Esiste perché l'alternativa — «svuota la memoria del browser a mano» — non è
 * un'operazione che si chiede a qualcuno la sera dell'asta: cancellerebbe
 * anche il log dell'asta in corso, le riconferme e il listone, che vivono
 * nelle chiavi accanto.
 */
export function forgetAuctionHistory(storage: StorageLike): ArchiveApplied<PastAuctionPurchase> {
  const removed = clearAuctionHistory(storage);
  const stored = storedHistory(storage);
  return { message: { tone: removed ? "ok" : "error", text: removed ? REMOVED_OK : REMOVE_FAILED }, stored };
}

/** Rimuove i profili. Stessa ragione, stessa forma. */
export function forgetOpponentProfiles(storage: StorageLike): ArchiveApplied<OpponentProfile> {
  const removed = clearOpponentProfiles(storage);
  const stored = storedProfiles(storage);
  return { message: { tone: removed ? "ok" : "error", text: removed ? REMOVED_OK : REMOVE_FAILED }, stored };
}

// ── Che cosa è caricato, in numeri ───────────────────────────────────────────
//
// Questi numeri si leggono PRIMA dell'asta, non si scoprono durante: dicono se
// il pannello avrà qualcosa da dire, e in quale misura. Sono tutti conteggi ed
// etichette di stagione — nessun nome, nessun prezzo, nessun `personId` esce di
// qui, esattamente come da `historyLogSummary()`, che infatti è riusato invece
// di essere riscritto.

export interface HistoryArchiveSummary {
  readonly purchaseCount: number;
  readonly peopleCount: number;
  readonly seasons: readonly string[];
  /** Righe comprate ALL'ASTA: le sole che il conteggio dei precedenti usa. */
  readonly auctionCount: number;
  /** Righe di rinnovo: contate a parte perché rinnovare non è ricomprare. */
  readonly renewalCount: number;
  /**
   * Quante PERSONE dello storico occupano oggi un posto rivale al tavolo.
   *
   * È il numero che dice davvero se il pannello parlerà: uno storico di dieci
   * persone che al tavolo non siedono produce zero righe, e senza questo
   * numero la cosa si scoprirebbe soltanto in asta, davanti a un pannello muto.
   */
  readonly rivalsCovered: number;
  /** Su quanti posti rivali è calcolato il numero qui sopra. */
  readonly rivalSeats: number;
}

/** Le persone sedute a un posto rivale (il proprio posto escluso). */
function rivalPersonIds(
  seats: Readonly<Record<string, string | null>>,
  selfSeatId: string,
): ReadonlySet<string> {
  return new Set(
    Object.entries(seats)
      .filter(([seatId, personId]) => seatId !== selfSeatId && personId !== null)
      .map(([, personId]) => personId as string),
  );
}

function rivalSeatCount(
  seats: Readonly<Record<string, string | null>>,
  selfSeatId: string,
): number {
  return Object.keys(seats).filter((seatId) => seatId !== selfSeatId).length;
}

export function historyArchiveSummary(
  purchases: readonly PastAuctionPurchase[],
  seats: Readonly<Record<string, string | null>>,
  selfSeatId: string,
): HistoryArchiveSummary {
  const base = historyLogSummary({ schemaVersion: 1, purchases });
  const rivals = rivalPersonIds(seats, selfSeatId);
  const covered = new Set(purchases.map((p) => p.personId).filter((id) => rivals.has(id)));
  return {
    purchaseCount: base.purchaseCount,
    peopleCount: base.peopleCount,
    seasons: base.seasons,
    auctionCount: purchases.filter((p) => p.acquisition === "asta").length,
    renewalCount: purchases.filter((p) => p.acquisition === "riconferma").length,
    rivalsCovered: covered.size,
    rivalSeats: rivalSeatCount(seats, selfSeatId),
  };
}

export interface ProfilesArchiveSummary {
  readonly profileCount: number;
  /** Quanti di quei profili appartengono a una persona seduta a un posto rivale. */
  readonly rivalsCovered: number;
  readonly rivalSeats: number;
  /**
   * Quanti profili portano un tifo CONFERMATO.
   *
   * È l'unico campo del profilo che il pannello dei precedenti legge (la nota
   * subordinata sul club tifato), e solo se confermato: contarli qui evita di
   * far credere che un archivio di profili pieno di risposte «proposte» abbia
   * un effetto che non ha.
   */
  readonly confirmedAffinityCount: number;
}

export function profilesArchiveSummary(
  profiles: readonly OpponentProfile[],
  seats: Readonly<Record<string, string | null>>,
  selfSeatId: string,
): ProfilesArchiveSummary {
  const rivals = rivalPersonIds(seats, selfSeatId);
  return {
    profileCount: profiles.length,
    rivalsCovered: new Set(profiles.map((p) => p.personId).filter((id) => rivals.has(id))).size,
    rivalSeats: rivalSeatCount(seats, selfSeatId),
    confirmedAffinityCount: profiles.filter((p) => p.affinityClubs?.status === "confermato").length,
  };
}

// ── Le stesse cifre, in italiano ─────────────────────────────────────────────

/** «2023/24 → 2025/26», o la stagione unica, o niente. */
export function seasonsSpanText(seasons: readonly string[]): string {
  if (seasons.length === 0) return "nessuna stagione";
  if (seasons.length === 1) return `1 stagione (${seasons[0]})`;
  return `${seasons.length} stagioni (${seasons[0]} → ${seasons[seasons.length - 1]})`;
}

export const HISTORY_EMPTY_TEXT =
  "Nessuno storico d'asta caricato. Finché resta così il pannello AVVERSARI: I PRECEDENTI lo dichiara e non mostra nessun elenco: un elenco vuoto lì significherebbe «nessuno lo vuole», che è un'altra frase.";

export const PROFILES_EMPTY_TEXT =
  "Nessun profilo d'intervista caricato. Non è indispensabile: i precedenti si misurano sullo storico d'asta. Senza profili manca solo la nota sul club tifato, che da sola non fa comparire nessuno nel pannello.";

/**
 * Il riepilogo dello storico in una frase.
 *
 * Chiude sempre con la copertura al tavolo, perché è la sola cifra che
 * risponde alla domanda per cui si guarda questa schermata prima dell'asta:
 * «di questi, quanti ne vedrò davvero?».
 */
export function historySummaryText(summary: HistoryArchiveSummary): string {
  const purchases = `${summary.purchaseCount} ${summary.purchaseCount === 1 ? "acquisto" : "acquisti"}`;
  const people = `${summary.peopleCount} ${summary.peopleCount === 1 ? "partecipante" : "partecipanti"}`;
  const breakdown = `${summary.auctionCount} all'asta, ${summary.renewalCount} per rinnovo (i rinnovi non contano come riacquisti)`;
  const coverage =
    summary.rivalsCovered === 0
      ? `Nessuna di queste persone occupa uno dei ${summary.rivalSeats} posti rivali del tavolo: così com'è, il pannello non avrà niente da dire. Assegna i posti in «Partecipanti e squadre».`
      : `${summary.rivalsCovered} ${summary.rivalsCovered === 1 ? "occupa" : "occupano"} uno dei ${summary.rivalSeats} posti rivali del tavolo.`;
  return `${seasonsSpanText(summary.seasons)} · ${purchases} · ${people}. Di cui ${breakdown}. ${coverage}`;
}

export function profilesSummaryText(summary: ProfilesArchiveSummary): string {
  const profiles = `${summary.profileCount} ${summary.profileCount === 1 ? "profilo" : "profili"}`;
  const affinity = `${summary.confirmedAffinityCount} con un tifo confermato in intervista`;
  const coverage =
    summary.rivalsCovered === 0
      ? `Nessuno di questi profili appartiene a una persona seduta a uno dei ${summary.rivalSeats} posti rivali.`
      : `${summary.rivalsCovered} ${summary.rivalsCovered === 1 ? "appartiene" : "appartengono"} a una persona seduta a uno dei ${summary.rivalSeats} posti rivali.`;
  return `${profiles} · ${affinity}. ${coverage}`;
}

// MISURA DELL'ACCORDO FRA CIÒ CHE UNA FONTE DICHIARA E CHI È SCESO IN CAMPO
// DAVVERO. Pacchetto di sola misura, funzioni pure, nessuna rete, nessun
// orologio.
//
// CHE COSA GARANTISCE. Date le previsioni dichiarate da una o più fonti per una
// giornata — ciascuna con la propria targa: fonte, momento dell'osservazione,
// giornata, e il lato della partita a cui appartiene l'istantanea — e le
// formazioni effettive della stessa giornata osservate dopo il calcio
// d'inizio, questo modulo produce il confronto **giocatore per giocatore** e lo
// aggrega **per fonte**, **per fonte e squadra**, **per fonte e giornata**.
// Ogni misura viaggia con la propria numerosità: quante chiamate decise, quante
// giornate, quante assenze, quante partite non verificabili. La previsione usata
// è **l'ultima istantanea prima del calcio d'inizio**, la verifica **una
// istantanea successiva al calcio d'inizio**: se i due lati si mescolano — una
// previsione osservata dopo il fischio d'inizio, una verifica osservata prima,
// un'istantanea dichiarata sul lato sbagliato — il confronto **non viene fatto
// a metà, viene rifiutato**, con il motivo scritto. L'esito è deterministico:
// stesse osservazioni in ingresso, stesso esito, nello stesso ordine.
//
// CHE COSA NON GARANTISCE. Non dice quale fonte sia migliore, non ordina le
// fonti, non assegna pesi, non produce una fiducia, non suggerisce di credere a
// nessuno: un pacchetto che misura non può anche premiare, altrimenti la misura
// diventa la giustificazione della scelta che l'ha prodotta. Non sa se
// l'osservazione che riceve sia stata raccolta bene: la targa la dichiara chi
// osserva, e qui viene solo verificata nella forma e nella coerenza temporale.
// Non conosce il calendario: una partita è rinviata perché l'osservazione lo
// dichiara, non perché questo modulo lo deduca. Non completa liste parziali e
// non indovina il silenzio: se una fonte non si è pronunciata su un giocatore,
// quel giocatore non entra nel conto degli errori — entra nel conto delle
// assenze, che è un conto diverso e sta accanto all'altro.
//
// PERCHÉ UNA MISURA E NON UN GIUDIZIO. Il vincolo è scritto e non è una
// preferenza di stile: nessuna fonte si pesa prima di essere misurata, e i pesi
// che un giorno potrebbero derivare da queste misure restano output direttivo
// dietro il loro gate. Fino ad allora l'unica cosa onesta che si può dire è
// quanto una fonte ha azzeccato, su quante osservazioni, su quali squadre e in
// quante giornate — e poche giornate non autorizzano alcuna conclusione. Per
// questo ogni aggregato porta `tooSparseToConclude` con la ragione esplicita, e
// per questo gli aggregati escono in ordine **alfabetico** e mai per tasso di
// accordo: un ordinamento per risultato è già una classifica, e una classifica
// è già un giudizio.
//
// CHI È ASSENTE DA UNA LISTA COMPLETA. Un giocatore su cui la fonte si è
// pronunciata e che non compare in nessuna delle due liste effettive non è un
// caso solo: dipende da che cosa la fonte aveva detto. Se lo dava **titolare**,
// e la lista effettiva si dichiara completa, la fonte ha sbagliato: è un
// disaccordo. Se lo dava **fuori**, e la lista si dichiara completa, la fonte
// ha detto il vero — quel giocatore non è sceso in campo dal primo minuto — ed
// è un accordo. Trattare i due casi allo stesso modo punirebbe proprio le fonti
// che pubblicano anche gli esclusi, cioè quelle che dicono di più; e una misura
// che punisce chi dice il vero non misura più niente. Se la lista **non** si
// dichiara completa — parziale o non dichiarata — nessuno dei due casi si
// decide: l'assenza non è informativa e l'esito è «non decidibile».
//
// ISTANTI. Si accetta ISO-8601 con `Z` **oppure** con offset esplicito, con i
// secondi facoltativi e i millisecondi facoltativi, e si **normalizza a UTC**
// prima di qualunque confronto. Un istante **senza** fuso è rifiutato: è
// ambiguo, e tutto questo confronto vive o muore sul momento del calcio
// d'inizio. Gli istanti che escono nell'esito sono già normalizzati, perché un
// consumatore che li confrontasse fra loro non debba rifare — e sbagliare — la
// stessa normalizzazione.
//
// SCELTE TECNICHE DICHIARATE E CONTESTABILI (non decisioni di prodotto): le due
// soglie di numerosità qui sotto; la normalizzazione a UTC fatta con aritmetica
// del calendario invece che con un orologio, e la forma canonica interna a
// larghezza fissa con i millisecondi sempre scritti, perché su di essa l'ordine
// lessicografico coincida con l'ordine cronologico; il rifiuto — invece del
// silenzio — quando due istantanee della stessa fonte per la stessa partita
// portano lo stesso istante ma contenuti diversi; la completezza della lista
// effettiva a **tre stati**, con `unknown` che non decide mai un esito.

/** Versione della ricetta di misura: viaggia con l'esito, perché un numero senza la sua ricetta non è riproducibile. */
export const AGREEMENT_MEASURE_VERSION = "source_agreement_v1";

/**
 * Il lato della partita a cui appartiene un'istantanea. È parte della targa e
 * non un dettaglio: le due facce del confronto non sono intercambiabili.
 */
export type SnapshotPhase = "pre_kickoff" | "post_kickoff";

/** Ciò che si può dire di un giocatore: o è in campo dal primo minuto, o non lo è. */
export type StarterCall = "starter" | "non_starter";

/** Targa obbligatoria di ogni osservazione: fonte, momento, giornata, lato. */
export interface ObservationStamp {
  /** Identificativo della fonte che ha osservato. Non vuoto. */
  readonly source: string;
  /**
   * Momento dell'osservazione: ISO-8601 con `Z` **oppure** con offset esplicito
   * (`2026-09-04T18:00:00+02:00`), secondi e millisecondi facoltativi. Senza
   * fuso è rifiutato. Viene normalizzato a UTC prima di ogni confronto.
   */
  readonly observedAt: string;
  /** Giornata di campionato: intero positivo. */
  readonly matchday: number;
  /** Lato della partita. Una previsione è `pre_kickoff`, una verifica `post_kickoff`. */
  readonly phase: SnapshotPhase;
}

/** Ciò che una fonte dichiara di un singolo giocatore. Chi non compare qui è silenzio, non errore. */
export interface PlayerCall {
  readonly playerId: string;
  readonly call: StarterCall;
}

/** Un'istantanea di previsione: ciò che una fonte dichiarava per una squadra, a un certo momento. */
export interface ForecastSnapshot {
  readonly stamp: ObservationStamp;
  readonly team: string;
  readonly calls: readonly PlayerCall[];
}

/** Una partita si è giocata, oppure è stata rinviata. Il rinvio non è un errore di previsione. */
export type FixtureStatus = "played" | "postponed";

/**
 * Quanto è completa la lista effettiva che abbiamo in mano. Tre stati e non
 * due: «completa», «parziale» e «non lo so» sono tre cose diverse, e schiacciare
 * il terzo su uno degli altri due è il modo in cui un dubbio diventa
 * silenziosamente una certezza. Chi produce queste osservazioni dichiara
 * `unknown` finché non ha di meglio, e `unknown` qui **non decide mai**: non
 * autorizza un accordo e non autorizza un disaccordo.
 *
 * Le tre etichette sono scritte come le scrive il produttore delle pagine
 * pre-partita, così che al confine non serva una tabella di traduzione: una
 * traduzione è un posto in più dove il terzo stato può sparire.
 */
export type ActualCompleteness = "declared-complete" | "declared-partial" | "unknown";

/**
 * La formazione effettiva di una squadra in una giornata, osservata dopo il
 * calcio d'inizio. `completeness` dichiara se le liste sono complete: da quel
 * campo dipende se un giocatore previsto e mai comparso produca un esito
 * deciso — accordo o disaccordo, a seconda di ciò che la fonte aveva detto —
 * oppure una cosa che le liste in nostro possesso non permettono di decidere.
 */
export interface ActualLineup {
  readonly stamp: ObservationStamp;
  readonly team: string;
  /** Calcio d'inizio: il confine fra i due lati dell'osservazione. Stesse regole di `observedAt`. */
  readonly kickoffAt: string;
  readonly status: FixtureStatus;
  readonly starters: readonly string[];
  readonly bench: readonly string[];
  readonly completeness: ActualCompleteness;
}

/** Che cosa è successo al confronto di un singolo giocatore. Nessun caso è assorbito in silenzio. */
export type ComparisonOutcome =
  /** Previsto titolare, sceso in campo dal primo minuto. */
  | "agreement_starter"
  /** Previsto non titolare, non sceso in campo dal primo minuto. */
  | "agreement_non_starter"
  /** Previsto titolare, non titolare. */
  | "disagreement_predicted_starter"
  /** Previsto non titolare, titolare. */
  | "disagreement_predicted_non_starter"
  /** Previsto **titolare**, e assente da una lista effettiva che si dichiara completa: disaccordo. */
  | "disagreement_absent_from_complete_squad"
  /** Previsto **fuori**, e assente da una lista effettiva che si dichiara completa: la fonte aveva ragione. */
  | "agreement_absent_from_complete_squad"
  /** Previsto, assente da una lista effettiva parziale o non dichiarata: non decidibile, e contato a parte. */
  | "undecidable_actual_incomplete"
  /** Presente nella formazione effettiva, e la fonte non si è pronunciata: assenza, non errore. */
  | "source_silent";

/** Il confronto di un singolo giocatore, con addosso tutto ciò che serve a rifarlo. */
export interface PlayerComparison {
  readonly source: string;
  readonly matchday: number;
  readonly team: string;
  readonly playerId: string;
  /** `null` = la fonte non si è pronunciata su questo giocatore. */
  readonly predicted: StarterCall | null;
  /** `null` = il giocatore non compare nella formazione effettiva. */
  readonly actual: StarterCall | null;
  readonly outcome: ComparisonOutcome;
  /** Istante normalizzato a UTC, non la stringa dichiarata: qui si confronta, non si cita. */
  readonly forecastObservedAt: string;
  /** Istante normalizzato a UTC. */
  readonly actualObservedAt: string;
  /** Istante normalizzato a UTC. */
  readonly kickoffAt: string;
}

/** La numerosità, che sta accanto a ogni misura e non sotto di essa. */
export interface AgreementCounts {
  readonly agreements: number;
  readonly disagreements: number;
  /** `agreements + disagreements`: le sole chiamate su cui un accordo ha senso. */
  readonly decided: number;
  /**
   * Previsto titolare, non sceso in campo dal primo minuto — che compaia in
   * panchina o che non compaia affatto in una lista dichiarata completa.
   * Insieme a `predictedNonStarterStarting` **scompone esattamente**
   * `disagreements`: la somma dei due è il totale, sempre e su ogni aggregato.
   */
  readonly predictedStarterNotStarting: number;
  /** Previsto non titolare, titolare. L'altra metà esatta di `disagreements`. */
  readonly predictedNonStarterStarting: number;
  /** Giocatori su cui la fonte non si è pronunciata, dentro partite che ha coperto. */
  readonly sourceSilent: number;
  /** Previsioni non decidibili perché la lista effettiva non si dichiarava completa. */
  readonly undecidable: number;
  /** Partite coperte dalla fonte e poi rinviate: nessun errore, nessun accordo. */
  readonly postponedFixtures: number;
  /** Partite giocate su cui la fonte non si è pronunciata affatto. */
  readonly fixturesNotCovered: number;
  /** Partite giocate e confrontate. */
  readonly fixturesCompared: number;
  /** Giornate con almeno una chiamata decisa. */
  readonly matchdays: number;
}

/** Perché una misura è troppo scarsa per dire qualcosa. Codici, non prosa da interpretare. */
export type SparsityReason =
  | "no_decided_comparison"
  | "single_matchday_is_not_evidence"
  | "matchdays_below_minimum"
  | "decided_calls_below_minimum";

export interface AgreementMeasure {
  readonly counts: AgreementCounts;
  /** `agreements / decided`, oppure `null` se non c'è nulla di deciso. Mai uno zero inventato. */
  readonly agreementRate: number | null;
  readonly tooSparseToConclude: boolean;
  readonly sparsityReasons: readonly SparsityReason[];
}

export interface SourceMeasure extends AgreementMeasure {
  readonly source: string;
}
export interface SourceTeamMeasure extends AgreementMeasure {
  readonly source: string;
  readonly team: string;
}
export interface SourceMatchdayMeasure extends AgreementMeasure {
  readonly source: string;
  readonly matchday: number;
}

export interface FixtureRef {
  readonly matchday: number;
  readonly team: string;
}
export interface SourceFixtureRef extends FixtureRef {
  readonly source: string;
}

/** Il registro dei casi che non sono confronti, tenuto separato e mai fuso nelle percentuali. */
export interface FixtureLedger {
  /** Partite dichiarate rinviate dall'osservazione effettiva. */
  readonly postponed: readonly FixtureRef[];
  /** Partite previste da almeno una fonte e mai verificate: nessuna formazione effettiva osservata. */
  readonly withoutActual: readonly FixtureRef[];
  /** Partite giocate su cui una fonte nota non si è pronunciata affatto. */
  readonly notCoveredBySource: readonly SourceFixtureRef[];
}

export interface AgreementReport {
  readonly measureVersion: typeof AGREEMENT_MEASURE_VERSION;
  readonly comparisons: readonly PlayerComparison[];
  readonly bySource: readonly SourceMeasure[];
  readonly bySourceAndTeam: readonly SourceTeamMeasure[];
  readonly bySourceAndMatchday: readonly SourceMatchdayMeasure[];
  readonly fixtures: FixtureLedger;
  /** Fatti dichiarati che non sono errori ma che chi legge deve sapere. */
  readonly notices: readonly string[];
}

export type RejectionCode =
  | "empty_identifier"
  | "invalid_matchday"
  | "malformed_instant"
  | "forecast_not_pre_kickoff"
  | "actual_not_post_kickoff"
  | "forecast_observed_after_kickoff"
  | "actual_observed_before_kickoff"
  | "ambiguous_latest_forecast"
  | "duplicate_actual_lineup"
  | "player_listed_twice"
  | "postponed_with_lineup";

export interface Rejection {
  readonly code: RejectionCode;
  readonly detail: string;
}

export type AgreementOutcome =
  | { readonly ok: true; readonly report: AgreementReport }
  | { readonly ok: false; readonly rejections: readonly Rejection[] };

/**
 * Soglie di numerosità. Scelta tecnica dichiarata e contestabile: sotto queste
 * un aggregato per fonte o per fonte-e-squadra si dichiara troppo scarso, e chi
 * legge sa che il numero c'è ma non regge un'affermazione.
 */
export const MIN_MATCHDAYS_FOR_A_READING = 5;
export const MIN_DECIDED_CALLS_FOR_A_READING = 50;

// ---------------------------------------------------------------------------
// Istanti — confronto senza orologio.
// ---------------------------------------------------------------------------

/**
 * La forma accettata in ingresso: ISO-8601 con fuso **esplicito** — `Z` oppure
 * un offset `±HH:MM` — secondi facoltativi, millesimi facoltativi. Un istante
 * senza fuso non è accettato: sarebbe un'ora senza un posto nel mondo, e qui si
 * decide se una previsione è arrivata prima del fischio d'inizio.
 */
const ACCEPTED_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  const table = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const days = table[month - 1] ?? 0;
  if (month === 2 && isLeapYear(year)) return 29;
  return days;
}

/**
 * Giorni dall'epoca a una data del calendario gregoriano proletico, con
 * aritmetica intera e senza orologio: è questa funzione, e non un `Date`, che
 * permette di spostare un istante dal suo fuso a UTC anche quando lo
 * spostamento attraversa la mezzanotte, la fine del mese o la fine dell'anno.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** L'inversa esatta di `daysFromCivil`. */
function civilFromDays(days: number): { readonly year: number; readonly month: number; readonly day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const y = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return { year: month <= 2 ? y + 1 : y, month, day };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * Porta un istante accettabile alla forma canonica interna — UTC, larghezza
 * fissa, millesimi **sempre scritti** — oppure restituisce `null` se non è
 * accettabile. `null` non è «zero» né «adesso»: è un rifiuto, e chi chiama lo
 * traduce in `malformed_instant`.
 *
 * I millesimi ci sono sempre proprio perché il confronto resti lessicografico:
 * fra `…:00Z` e `…:00.500Z` l'ordine fra stringhe direbbe il falso, perché `.`
 * viene prima di `Z`; fra `…:00.000Z` e `…:00.500Z` dice il vero.
 */
export function canonicaliseInstant(raw: string): string | null {
  const m = ACCEPTED_INSTANT.exec(raw);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const milli = m[7] === undefined ? 0 : Number(m[7].padEnd(3, "0"));
  const zone = m[8] ?? "";
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  let offsetMinutes = 0;
  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return null;
    offsetMinutes = (zone.startsWith("-") ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  }

  // Il fuso si toglie **prima** del confronto, mai dopo: un adattatore che
  // tagliasse `+02:00` senza spostare l'ora sposterebbe l'istante di due ore.
  const totalMinutes = daysFromCivil(year, month, day) * 1440 + hour * 60 + minute - offsetMinutes;
  const utcDays = Math.floor(totalMinutes / 1440);
  const minuteOfDay = totalMinutes - utcDays * 1440;
  const civil = civilFromDays(utcDays);
  return (
    `${pad(civil.year, 4)}-${pad(civil.month, 2)}-${pad(civil.day, 2)}` +
    `T${pad(Math.floor(minuteOfDay / 60), 2)}:${pad(minuteOfDay % 60, 2)}:${pad(second, 2)}.${pad(milli, 3)}Z`
  );
}

/** Vero se l'istante è ISO-8601 con fuso esplicito e cade su una data che esiste. */
export function isAcceptableInstant(raw: string): boolean {
  return canonicaliseInstant(raw) !== null;
}

/**
 * `-1`, `0`, `1` fra due istanti **già normalizzati** da `canonicaliseInstant`.
 * Su quella forma l'ordine lessicografico coincide con l'ordine cronologico: è
 * così che questo modulo confronta due momenti senza mai istanziare un orologio.
 */
export function compareInstants(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Validazione dell'ingresso — tutti i motivi insieme, mai il primo e via.
// ---------------------------------------------------------------------------

function isNonEmptyId(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Chiave iniettiva: `JSON.stringify` di una tupla, non una concatenazione con
 * un separatore. Un identificativo che contenesse il separatore farebbe
 * collidere due partite diverse, e una collisione qui sposterebbe in silenzio
 * i confronti di una squadra sotto un'altra.
 */
function fixtureKey(matchday: number, team: string): string {
  return JSON.stringify([matchday, team]);
}

function sourceFixtureKey(source: string, matchday: number, team: string): string {
  return JSON.stringify([source, matchday, team]);
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) twice.add(value);
    seen.add(value);
  }
  return [...twice].sort();
}

/**
 * Valida la targa e restituisce il momento **già normalizzato a UTC**, oppure
 * `null` se quel momento non è accettabile. Validare e normalizzare nello
 * stesso posto è deliberato: se fossero due passaggi, esisterebbe un punto del
 * programma in cui un istante è valido ma non ancora confrontabile.
 */
function validateStamp(
  stamp: ObservationStamp,
  where: string,
  expected: SnapshotPhase,
  rejections: Rejection[],
): string | null {
  if (!isNonEmptyId(stamp.source)) {
    rejections.push({ code: "empty_identifier", detail: `${where}: fonte senza identificativo` });
  }
  if (!Number.isInteger(stamp.matchday) || stamp.matchday < 1) {
    rejections.push({ code: "invalid_matchday", detail: `${where}: giornata non valida (${String(stamp.matchday)})` });
  }
  const observedAt = canonicaliseInstant(stamp.observedAt);
  if (observedAt === null) {
    rejections.push({
      code: "malformed_instant",
      detail: `${where}: momento non accettabile, serve ISO-8601 con fuso esplicito (${stamp.observedAt})`,
    });
  }
  if (stamp.phase !== expected) {
    rejections.push({
      code: expected === "pre_kickoff" ? "forecast_not_pre_kickoff" : "actual_not_post_kickoff",
      detail: `${where}: istantanea dichiarata "${stamp.phase}" dove serve "${expected}"`,
    });
  }
  return observedAt;
}

function describeForecast(snapshot: ForecastSnapshot): string {
  return `previsione ${snapshot.stamp.source}/g${String(snapshot.stamp.matchday)}/${snapshot.team}@${snapshot.stamp.observedAt}`;
}

// ---------------------------------------------------------------------------
// La misura.
// ---------------------------------------------------------------------------

interface FixtureFacts {
  readonly lineup: ActualLineup;
  /** Momento della verifica, già normalizzato a UTC. */
  readonly observedAt: string;
  /** Calcio d'inizio, già normalizzato a UTC. */
  readonly kickoffAt: string;
  readonly starters: ReadonlySet<string>;
  readonly bench: ReadonlySet<string>;
}

function callsSignature(calls: readonly PlayerCall[]): string {
  return [...calls]
    .map((c) => `${c.playerId}:${c.call}`)
    .sort()
    .join("|");
}

/**
 * Un'istantanea di previsione con accanto il suo momento già normalizzato a
 * UTC. Le due cose viaggiano insieme perché nessun confronto avvenga mai sulla
 * stringa dichiarata: due istanti scritti in fusi diversi si ordinano solo
 * dopo essere stati portati sullo stesso.
 */
interface StampedForecast {
  readonly snapshot: ForecastSnapshot;
  readonly at: string;
}

/**
 * Sceglie l'ultima istantanea prima del calcio d'inizio fra quelle di una fonte
 * per una partita. Due istantanee con lo **stesso** istante non hanno un
 * «ultima»: se dicono la stessa cosa sono un doppione e se ne tiene una,
 * dichiarandolo; se dicono cose diverse il confronto si rifiuta invece di
 * sceglierne una a caso.
 */
function pickLatest(
  entries: readonly StampedForecast[],
  rejections: Rejection[],
  notices: string[],
): StampedForecast | null {
  let latest = entries[0];
  if (latest === undefined) return null;
  for (const candidate of entries) {
    if (compareInstants(candidate.at, latest.at) > 0) latest = candidate;
  }
  const chosen = latest;
  const tied = entries.filter((e) => compareInstants(e.at, chosen.at) === 0);
  if (tied.length > 1) {
    const signatures = new Set(tied.map((e) => callsSignature(e.snapshot.calls)));
    if (signatures.size > 1) {
      rejections.push({
        code: "ambiguous_latest_forecast",
        detail: `${describeForecast(chosen.snapshot)}: ${String(tied.length)} istantanee allo stesso istante con contenuti diversi`,
      });
      return null;
    }
    notices.push(
      `${describeForecast(chosen.snapshot)}: ${String(tied.length)} istantanee identiche allo stesso istante, contate una volta`,
    );
  }
  return chosen;
}

interface AccumulatorLabel {
  readonly source: string;
  readonly team?: string;
  readonly matchday?: number;
}

interface LabelledAccumulator {
  readonly label: AccumulatorLabel;
  readonly acc: CountAccumulator;
}

interface CountAccumulator {
  agreements: number;
  disagreements: number;
  predictedStarterNotStarting: number;
  predictedNonStarterStarting: number;
  sourceSilent: number;
  undecidable: number;
  postponedFixtures: number;
  fixturesNotCovered: number;
  fixturesCompared: number;
  readonly decidedMatchdays: Set<number>;
}

function newAccumulator(): CountAccumulator {
  return {
    agreements: 0,
    disagreements: 0,
    predictedStarterNotStarting: 0,
    predictedNonStarterStarting: 0,
    sourceSilent: 0,
    undecidable: 0,
    postponedFixtures: 0,
    fixturesNotCovered: 0,
    fixturesCompared: 0,
    decidedMatchdays: new Set<number>(),
  };
}

/**
 * Ogni disaccordo incrementa **uno e uno solo** dei due sotto-conti, e ogni
 * accordo nessuno dei due: è questa la ragione per cui
 * `predictedStarterNotStarting + predictedNonStarterStarting` è sempre uguale a
 * `disagreements`. Un disaccordo che non ricadesse in nessuno dei due lascerebbe
 * una scomposizione che non torna, cioè un numero che nessuno può rifare.
 */
function absorb(acc: CountAccumulator, comparison: PlayerComparison): void {
  switch (comparison.outcome) {
    case "agreement_starter":
    case "agreement_non_starter":
    case "agreement_absent_from_complete_squad":
      acc.agreements += 1;
      acc.decidedMatchdays.add(comparison.matchday);
      break;
    case "disagreement_predicted_starter":
    case "disagreement_absent_from_complete_squad":
      // Previsto titolare e non sceso in campo dal primo minuto: che sia
      // finito in panchina o che non compaia affatto in una lista dichiarata
      // completa, l'errore della fonte è lo stesso.
      acc.disagreements += 1;
      acc.predictedStarterNotStarting += 1;
      acc.decidedMatchdays.add(comparison.matchday);
      break;
    case "disagreement_predicted_non_starter":
      acc.disagreements += 1;
      acc.predictedNonStarterStarting += 1;
      acc.decidedMatchdays.add(comparison.matchday);
      break;
    case "undecidable_actual_incomplete":
      acc.undecidable += 1;
      break;
    case "source_silent":
      acc.sourceSilent += 1;
      break;
  }
}

function seal(acc: CountAccumulator): AgreementCounts {
  const decided = acc.agreements + acc.disagreements;
  return {
    agreements: acc.agreements,
    disagreements: acc.disagreements,
    decided,
    predictedStarterNotStarting: acc.predictedStarterNotStarting,
    predictedNonStarterStarting: acc.predictedNonStarterStarting,
    sourceSilent: acc.sourceSilent,
    undecidable: acc.undecidable,
    postponedFixtures: acc.postponedFixtures,
    fixturesNotCovered: acc.fixturesNotCovered,
    fixturesCompared: acc.fixturesCompared,
    matchdays: acc.decidedMatchdays.size,
  };
}

/**
 * La dichiarazione di scarsità. `singleMatchdayIsAlwaysSparse` è vero per gli
 * aggregati di una sola giornata: una giornata è un episodio, non una misura, e
 * il record che governa questo lavoro lo dice in una riga — poche giornate non
 * autorizzano conclusioni.
 */
export function declareSparsity(counts: AgreementCounts, singleMatchdayIsAlwaysSparse: boolean): {
  readonly tooSparseToConclude: boolean;
  readonly sparsityReasons: readonly SparsityReason[];
} {
  const reasons: SparsityReason[] = [];
  if (counts.decided === 0) reasons.push("no_decided_comparison");
  if (singleMatchdayIsAlwaysSparse) {
    reasons.push("single_matchday_is_not_evidence");
  } else {
    if (counts.matchdays < MIN_MATCHDAYS_FOR_A_READING) reasons.push("matchdays_below_minimum");
    if (counts.decided < MIN_DECIDED_CALLS_FOR_A_READING) reasons.push("decided_calls_below_minimum");
  }
  return { tooSparseToConclude: reasons.length > 0, sparsityReasons: reasons };
}

function measureOf(acc: CountAccumulator, singleMatchday: boolean): AgreementMeasure {
  const counts = seal(acc);
  const { tooSparseToConclude, sparsityReasons } = declareSparsity(counts, singleMatchday);
  return {
    counts,
    agreementRate: counts.decided === 0 ? null : counts.agreements / counts.decided,
    tooSparseToConclude,
    sparsityReasons,
  };
}

/**
 * Confronta le previsioni dichiarate con le formazioni effettive e restituisce
 * la misura, oppure il rifiuto con tutti i suoi motivi.
 *
 * Non ordina le fonti, non le pesa, non ne raccomanda nessuna: gli aggregati
 * escono in ordine alfabetico di fonte, squadra e giornata, e chi legge fa il
 * resto — dietro il gate che quel resto lo autorizza.
 */
export function measureSourceAgreement(input: {
  readonly forecasts: readonly ForecastSnapshot[];
  readonly actuals: readonly ActualLineup[];
}): AgreementOutcome {
  const rejections: Rejection[] = [];
  const notices: string[] = [];

  // --- validazione delle previsioni ---
  for (const snapshot of input.forecasts) {
    const where = describeForecast(snapshot);
    validateStamp(snapshot.stamp, where, "pre_kickoff", rejections);
    if (!isNonEmptyId(snapshot.team)) {
      rejections.push({ code: "empty_identifier", detail: `${where}: squadra senza identificativo` });
    }
    for (const call of snapshot.calls) {
      if (!isNonEmptyId(call.playerId)) {
        rejections.push({ code: "empty_identifier", detail: `${where}: giocatore senza identificativo` });
      }
    }
    for (const twice of duplicates(snapshot.calls.map((c) => c.playerId))) {
      rejections.push({ code: "player_listed_twice", detail: `${where}: ${twice} dichiarato due volte` });
    }
  }

  // --- validazione delle formazioni effettive ---
  const byFixture = new Map<string, ActualLineup>();
  for (const lineup of input.actuals) {
    const where = `formazione effettiva g${String(lineup.stamp.matchday)}/${lineup.team}@${lineup.stamp.observedAt}`;
    const observedAt = validateStamp(lineup.stamp, where, "post_kickoff", rejections);
    if (!isNonEmptyId(lineup.team)) {
      rejections.push({ code: "empty_identifier", detail: `${where}: squadra senza identificativo` });
    }
    const kickoffAt = canonicaliseInstant(lineup.kickoffAt);
    if (kickoffAt === null) {
      rejections.push({
        code: "malformed_instant",
        detail: `${where}: calcio d'inizio non accettabile, serve ISO-8601 con fuso esplicito (${lineup.kickoffAt})`,
      });
    } else if (observedAt !== null && compareInstants(observedAt, kickoffAt) < 0) {
      rejections.push({
        code: "actual_observed_before_kickoff",
        detail: `${where}: verifica osservata prima del calcio d'inizio (${lineup.kickoffAt})`,
      });
    }
    const roster = [...lineup.starters, ...lineup.bench];
    for (const playerId of roster) {
      if (!isNonEmptyId(playerId)) {
        rejections.push({ code: "empty_identifier", detail: `${where}: giocatore senza identificativo` });
      }
    }
    for (const twice of duplicates(roster)) {
      rejections.push({ code: "player_listed_twice", detail: `${where}: ${twice} elencato due volte` });
    }
    if (lineup.status === "postponed" && roster.length > 0) {
      rejections.push({
        code: "postponed_with_lineup",
        detail: `${where}: partita dichiarata rinviata ma con ${String(roster.length)} giocatori in lista`,
      });
    }
    const key = fixtureKey(lineup.stamp.matchday, lineup.team);
    if (byFixture.has(key)) {
      rejections.push({ code: "duplicate_actual_lineup", detail: `${where}: seconda formazione effettiva per la stessa partita` });
    } else {
      byFixture.set(key, lineup);
    }
  }

  // --- coerenza temporale fra i due lati ---
  // Il confronto avviene fra istanti già normalizzati: una previsione scritta
  // con offset e un calcio d'inizio scritto in `Z` sono confrontabili solo dopo
  // essere stati portati sullo stesso fuso, e prima no.
  for (const snapshot of input.forecasts) {
    const lineup = byFixture.get(fixtureKey(snapshot.stamp.matchday, snapshot.team));
    if (lineup === undefined) continue;
    const observedAt = canonicaliseInstant(snapshot.stamp.observedAt);
    const kickoffAt = canonicaliseInstant(lineup.kickoffAt);
    if (observedAt === null || kickoffAt === null) continue;
    if (compareInstants(observedAt, kickoffAt) >= 0) {
      rejections.push({
        code: "forecast_observed_after_kickoff",
        detail: `${describeForecast(snapshot)}: previsione osservata al calcio d'inizio o dopo (${lineup.kickoffAt})`,
      });
    }
  }

  if (rejections.length > 0) {
    const sorted = [...rejections].sort((a, b) => (a.code === b.code ? (a.detail < b.detail ? -1 : 1) : a.code < b.code ? -1 : 1));
    return { ok: false, rejections: sorted };
  }

  // --- confronto ---
  const knownSources = [...new Set(input.forecasts.map((s) => s.stamp.source))].sort();
  const forecastsByKey = new Map<string, StampedForecast[]>();
  for (const snapshot of input.forecasts) {
    const at = canonicaliseInstant(snapshot.stamp.observedAt);
    // Impossibile a questo punto: un istante non normalizzabile è già uscito
    // come `malformed_instant` sopra. Resta scritto perché il tipo dica il vero
    // invece di essere costretto a mentire con un'asserzione.
    if (at === null) continue;
    const key = sourceFixtureKey(snapshot.stamp.source, snapshot.stamp.matchday, snapshot.team);
    const bucket = forecastsByKey.get(key);
    if (bucket === undefined) forecastsByKey.set(key, [{ snapshot, at }]);
    else bucket.push({ snapshot, at });
  }

  const comparisons: PlayerComparison[] = [];
  const bySource = new Map<string, LabelledAccumulator>();
  const bySourceTeam = new Map<string, LabelledAccumulator>();
  const bySourceMatchday = new Map<string, LabelledAccumulator>();
  const postponed: FixtureRef[] = [];
  const withoutActual: FixtureRef[] = [];
  const notCoveredBySource: SourceFixtureRef[] = [];

  const accumulatorFor = (
    map: Map<string, LabelledAccumulator>,
    key: string,
    label: AccumulatorLabel,
  ): CountAccumulator => {
    const existing = map.get(key);
    if (existing !== undefined) return existing.acc;
    const fresh: LabelledAccumulator = { label, acc: newAccumulator() };
    map.set(key, fresh);
    return fresh.acc;
  };

  const fixtures: FixtureFacts[] = [];
  for (const lineup of byFixture.values()) {
    const observedAt = canonicaliseInstant(lineup.stamp.observedAt);
    const kickoffAt = canonicaliseInstant(lineup.kickoffAt);
    // Come sopra: già rifiutati, e qui non si indovina un istante mancante.
    if (observedAt === null || kickoffAt === null) continue;
    fixtures.push({
      lineup,
      observedAt,
      kickoffAt,
      starters: new Set(lineup.starters),
      bench: new Set(lineup.bench),
    });
  }
  fixtures.sort((a, b) =>
    a.lineup.stamp.matchday === b.lineup.stamp.matchday
      ? a.lineup.team < b.lineup.team
        ? -1
        : a.lineup.team > b.lineup.team
          ? 1
          : 0
      : a.lineup.stamp.matchday - b.lineup.stamp.matchday,
  );

  for (const facts of fixtures) {
    const { lineup } = facts;
    const matchday = lineup.stamp.matchday;
    if (lineup.status === "postponed") {
      postponed.push({ matchday, team: lineup.team });
    }
    for (const source of knownSources) {
      const bucket = forecastsByKey.get(sourceFixtureKey(source, matchday, lineup.team)) ?? [];
      const sourceAcc = accumulatorFor(bySource, source, { source });
      const teamAcc = accumulatorFor(bySourceTeam, JSON.stringify([source, lineup.team]), { source, team: lineup.team });
      const matchdayAcc = accumulatorFor(bySourceMatchday, JSON.stringify([source, matchday]), { source, matchday });
      const accs = [sourceAcc, teamAcc, matchdayAcc];

      if (lineup.status === "postponed") {
        // Un rinvio non è un errore di previsione: si conta come rinvio, e solo
        // per la fonte che quella partita l'aveva davvero coperta.
        if (bucket.length > 0) for (const acc of accs) acc.postponedFixtures += 1;
        continue;
      }
      if (bucket.length === 0) {
        // Silenzio sull'intera partita: una fonte che non si è pronunciata su
        // una partita non riceve ventidue assenze, riceve una partita non
        // coperta. Confondere i due conti gonfia il denominatore delle assenze.
        notCoveredBySource.push({ source, matchday, team: lineup.team });
        for (const acc of accs) acc.fixturesNotCovered += 1;
        continue;
      }
      const latest = pickLatest(bucket, rejections, notices);
      if (latest === null) continue;
      for (const acc of accs) acc.fixturesCompared += 1;

      const called = new Map<string, StarterCall>();
      for (const call of latest.snapshot.calls) called.set(call.playerId, call.call);
      // L'universo è l'unione delle due liste: chi non compare in nessuna delle
      // due non esiste per questo confronto e non entra nel conto.
      const universe = [...new Set([...called.keys(), ...lineup.starters, ...lineup.bench])].sort();

      for (const playerId of universe) {
        const predicted = called.get(playerId) ?? null;
        const actual: StarterCall | null = facts.starters.has(playerId)
          ? "starter"
          : facts.bench.has(playerId)
            ? "non_starter"
            : null;
        let outcome: ComparisonOutcome;
        if (predicted === null) {
          outcome = "source_silent";
        } else if (actual === null) {
          // Assente da entrambe le liste. Se le liste non si dichiarano
          // complete, l'assenza non dice niente e non si decide. Se si
          // dichiarano complete, l'assenza dice che quel giocatore non è
          // sceso in campo dal primo minuto: dà torto a chi lo dava titolare
          // e ragione a chi lo dava fuori.
          if (lineup.completeness !== "declared-complete") {
            outcome = "undecidable_actual_incomplete";
          } else {
            outcome =
              predicted === "starter"
                ? "disagreement_absent_from_complete_squad"
                : "agreement_absent_from_complete_squad";
          }
        } else if (predicted === actual) {
          outcome = predicted === "starter" ? "agreement_starter" : "agreement_non_starter";
        } else {
          outcome = predicted === "starter" ? "disagreement_predicted_starter" : "disagreement_predicted_non_starter";
        }
        const comparison: PlayerComparison = {
          source,
          matchday,
          team: lineup.team,
          playerId,
          predicted,
          actual,
          outcome,
          forecastObservedAt: latest.at,
          actualObservedAt: facts.observedAt,
          kickoffAt: facts.kickoffAt,
        };
        comparisons.push(comparison);
        for (const acc of accs) absorb(acc, comparison);
      }
    }
  }

  // Previsioni senza verifica: la fonte si è pronunciata, noi non abbiamo
  // osservato niente dopo il calcio d'inizio. Non è un errore di nessuno.
  const seenWithoutActual = new Set<string>();
  for (const snapshot of input.forecasts) {
    const key = fixtureKey(snapshot.stamp.matchday, snapshot.team);
    if (byFixture.has(key) || seenWithoutActual.has(key)) continue;
    seenWithoutActual.add(key);
    withoutActual.push({ matchday: snapshot.stamp.matchday, team: snapshot.team });
  }

  if (rejections.length > 0) {
    const sorted = [...rejections].sort((a, b) => (a.code === b.code ? (a.detail < b.detail ? -1 : 1) : a.code < b.code ? -1 : 1));
    return { ok: false, rejections: sorted };
  }

  comparisons.sort((a, b) => {
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    if (a.matchday !== b.matchday) return a.matchday - b.matchday;
    if (a.team !== b.team) return a.team < b.team ? -1 : 1;
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });

  const sourceMeasures: SourceMeasure[] = [...bySource.values()]
    .map(({ label, acc }) => ({ source: label.source, ...measureOf(acc, false) }))
    .sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));

  const teamMeasures: SourceTeamMeasure[] = [...bySourceTeam.values()]
    .map(({ label, acc }) => ({ source: label.source, team: label.team ?? "", ...measureOf(acc, false) }))
    .sort((a, b) => (a.source !== b.source ? (a.source < b.source ? -1 : 1) : a.team < b.team ? -1 : a.team > b.team ? 1 : 0));

  const matchdayMeasures: SourceMatchdayMeasure[] = [...bySourceMatchday.values()]
    .map(({ label, acc }) => ({ source: label.source, matchday: label.matchday ?? 0, ...measureOf(acc, true) }))
    .sort((a, b) => (a.source !== b.source ? (a.source < b.source ? -1 : 1) : a.matchday - b.matchday));

  const sortFixtures = <T extends FixtureRef>(list: T[]): T[] =>
    [...list].sort((a, b) => (a.matchday !== b.matchday ? a.matchday - b.matchday : a.team < b.team ? -1 : a.team > b.team ? 1 : 0));

  return {
    ok: true,
    report: {
      measureVersion: AGREEMENT_MEASURE_VERSION,
      comparisons,
      bySource: sourceMeasures,
      bySourceAndTeam: teamMeasures,
      bySourceAndMatchday: matchdayMeasures,
      fixtures: {
        postponed: sortFixtures(postponed),
        withoutActual: sortFixtures(withoutActual),
        notCoveredBySource: [...notCoveredBySource].sort((a, b) =>
          a.source !== b.source
            ? a.source < b.source
              ? -1
              : 1
            : a.matchday !== b.matchday
              ? a.matchday - b.matchday
              : a.team < b.team
                ? -1
                : a.team > b.team
                  ? 1
                  : 0,
        ),
      },
      notices: [...notices].sort(),
    },
  };
}

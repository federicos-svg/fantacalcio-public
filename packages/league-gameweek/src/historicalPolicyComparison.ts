// IL CONFRONTO STORICO — §11.3 del disegno del generatore, WP-10.
//
// CHE COSA È. La tabella POLITICHE × STAGIONI che §14 chiede alla riga WP-10,
// con i suoi intervalli bootstrap, e il report che la rende leggibile. Politiche
// sulle righe (le sei di §11.1), stagioni sulle colonne, una colonna in più per
// tutte le stagioni insieme. In ogni cella: il valore della metrica dichiarata
// sulla base di giornate comune, e l'intervallo — quando c'è abbastanza storia
// perché un intervallo voglia dire qualcosa.
//
// CHE COSA NON È, dichiarato qui invece che scoperto dopo:
//  - NON carica le stagioni. §11.3 parla di undici stagioni di voti: quei voti
//    stanno nel layer privato e questo pacchetto non li ha e non deve averli.
//    Qui arrivano OSSERVAZIONI già misurate — una riga per stagione, politica e
//    giornata — e questo modulo fa l'aritmetica del confronto, non la raccolta.
//  - NON ricostruisce le rose sintetiche di §11.3 (la nostra rosa reale più rose
//    fittizie a 3/9/9/7) né l'oracolo di disponibilità: sono ingressi privati,
//    e fabbricarli qui vorrebbe dire fabbricare i numeri che poi si misurano.
//  - NON decide niente. §11.3 dice che il confronto storico serve a ORDINARE le
//    politiche, e che se una politica vince sullo storico e perde in ombra
//    prevale l'ombra. Un ordinamento non è una promozione, e qui non c'è nessun
//    gate: questa è una tabella, e leggerla non è applicarla.
//
// ─────────────────────────────────────────────────────────────────────────────
// LE SCELTE CHE §11.3 NON CHIUDE. Sono dell'Executive, sono dichiarate qui
// perché siano contestabili, e si cambiano con un record datato — non di
// nascosto cambiando un default.
// ─────────────────────────────────────────────────────────────────────────────
//
// SCELTA 1 — LA METRICA IN TABELLA: il RIMPIANTO in punti di lega per giornata.
// §11.2 elenca due misure sommabili per giornata — i punti di lega realizzati e
// il rimpianto — e §11.3 non dice quale vada in tabella. Va il rimpianto, e la
// ragione è nella frase di §11.3: il confronto storico serve a ORDINARE le
// politiche, non a stimare i punti veri. Il rimpianto si misura contro il tetto
// ex-post della STESSA giornata, quindi toglie dal confronto quanto quella
// giornata fosse facile o difficile per chiunque; i punti realizzati no, e su
// undici stagioni mescolerebbero l'ordinamento delle politiche con la deriva dei
// punteggi fra un'annata e l'altra. I punti realizzati restano disponibili come
// seconda metrica dichiarabile, perché chi legge la tabella del rimpianto ha il
// diritto di vedere anche la scala su cui quel rimpianto si è prodotto.
//
// SCELTA 2 — QUANTE RIPETIZIONI: 2000, e come minimo 200. Agli estremi del 2,5 %
// e del 97,5 %, 2000 ripetizioni mettono cinquanta valori in ciascuna coda: il
// rumore Monte-Carlo dell'estremo è allora piccolo rispetto all'incertezza
// campionaria che l'estremo sta stimando. Sotto 200 le code hanno meno di cinque
// valori e l'estremo è deciso da quei cinque: è un numero che cambia riga a ogni
// ripetizione del calcolo, e si rifiuta invece di pubblicarlo.
//
// SCELTA 3 — QUALE LIVELLO E QUALE METODO: 95 %, metodo percentile. Il percentile
// è il metodo che non chiede niente alla forma della distribuzione; BCa
// correggerebbe l'asimmetria ma la sua accelerazione si stima con un jackknife
// su trentotto punti, cioè con la stessa scarsità che si sta cercando di
// dichiarare. Correggere una stima rumorosa con una correzione rumorosa dà un
// intervallo più stretto e non più vero.
//
// SCELTA 4 — L'UNITÀ RICAMPIONATA È LA GIORNATA, E IL RICAMPIONAMENTO È APPAIATO.
// Dentro una stagione si ricampionano le giornate, non le stagioni: le stagioni
// sono undici, e undici unità non fanno un intervallo. Le stesse giornate
// estratte valgono per TUTTE le politiche della stagione (bootstrap appaiato):
// è la condizione perché due politiche si confrontino sulle stesse giornate e
// non sul rumore di due ricampionamenti indipendenti. Per la colonna di tutte le
// stagioni il ricampionamento è STRATIFICATO: ogni stagione ricampiona dentro di
// sé e conserva la propria numerosità, così la composizione per stagione della
// colonna cumulata non cambia da una ripetizione all'altra.
//
// SCELTA 5 — LA SOGLIA SOTTO CUI L'INTERVALLO NON SI PUBBLICA: dieci giornate
// in comune. Il motivo non è un'usanza, è che sotto quella soglia l'intervallo
// non SEMBRA rotto. Con n unità, la probabilità che una data unità non entri in
// un ricampionamento è (1 − 1/n)^n ≈ 0,37 per qualunque n: la degenerazione non
// si vede, e un intervallo su quattro giornate esce stretto, simmetrico e
// rispettabile esattamente come uno su trentotto. In più, con n unità la media
// ricampionata può assumere solo un numero finito e piccolo di valori distinti,
// e gli estremi percentili si incastrano su quella griglia grossolana: la
// larghezza che si legge è la spaziatura della griglia, non l'incertezza. Con
// n < 10 una sola giornata pesa almeno un decimo della media, e l'intervallo
// misura quella giornata invece della politica. Sotto soglia il risultato dice
// «non misurabile con questa storia» e non porta nessun numero: un intervallo
// stretto per caso è la forma statistica dell'affermazione falsa.
//
// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISMO — le tre cose che lo tengono in piedi.
// ─────────────────────────────────────────────────────────────────────────────
//  1. I SOTTO-SEMI si derivano con `mix32`, lo stesso mescolatore che
//     `opponentDistribution` usa per il sorteggio avversario. Non c'è una
//     seconda disciplina del seme in questo pacchetto, e non deve nascerne una.
//  2. IL SOTTO-SEME DI UNA STAGIONE DIPENDE DAL SUO NOME, non dalla sua
//     posizione. È questo che rende il risultato invariante per permutazione
//     delle stagioni in ingresso: la stagione «SYN-02» vede lo stesso flusso di
//     numeri casuali che arrivi prima, seconda o ultima.
//  3. LE SOMME SI FANNO IN ORDINE CANONICO. La somma in virgola mobile non è
//     associativa: sommare gli stessi addendi in due ordini diversi dà due
//     numeri che differiscono negli ultimi bit, e «stesso intervallo bit per
//     bit» sarebbe falso. Quindi le stagioni si scorrono in ordine alfabetico
//     del nome, le giornate in ordine crescente, e le politiche nell'ordine del
//     catalogo di §11.1 — sempre, qualunque sia l'ordine di arrivo.

import { LEAGUE_RULE_VERSION, type LeagueRuleVersion } from "./leagueGameweek.js";
import { SEED_MODULUS, mulberry32 } from "./lineupProposer.js";
import { mix32 } from "./opponentDistribution.js";
import { type PolicyMatchday, policySeasonTable } from "./policyMetrics.js";
import { REFERENCE_POLICIES, type ReferencePolicyId, referencePolicy } from "./referencePolicies.js";

// ─────────────────────────────────────────────────────────────────────────────
// Le costanti dichiarate.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Il sale del sotto-seme del confronto storico, sul modello di
 * `OPPONENT_DRAW_SUBSEED_SALT`: un numero fisso e dichiarato. Cambiarlo cambia
 * ogni intervallo mai calcolato, quindi non si cambia senza un record.
 */
export const HISTORICAL_BOOTSTRAP_SUBSEED_SALT = 0x48535431 as const; // "HST1"

/** Ripetizioni di default del bootstrap — scelta 2. */
export const DEFAULT_BOOTSTRAP_REPLICATES = 2000 as const;

/** Sotto questo numero di ripetizioni l'intervallo si rifiuta — scelta 2. */
export const MIN_BOOTSTRAP_REPLICATES = 200 as const;

/** Livello di confidenza di default — scelta 3. */
export const DEFAULT_CONFIDENCE_LEVEL = 0.95 as const;

/**
 * LA SOGLIA — scelta 5. Sotto dieci giornate in comune l'intervallo non si
 * pubblica e la cella dichiara «non misurabile con questa storia».
 */
export const MIN_MATCHDAYS_FOR_INTERVAL = 10 as const;

/** Cifre decimali del report. Il report è testo, non un formato di scambio. */
export const REPORT_DECIMALS = 3 as const;

/**
 * Le due metriche sommabili per giornata di §11.2. Chiuse: una terza metrica è
 * un'altra tabella, non un altro valore di questo campo.
 */
export type HistoricalComparisonMetric = "LEAGUE_POINTS_REGRET" | "LEAGUE_POINTS";

/** La metrica di default — scelta 1. */
export const DEFAULT_HISTORICAL_METRIC: HistoricalComparisonMetric = "LEAGUE_POINTS_REGRET";

const METRIC_LABEL: Record<HistoricalComparisonMetric, string> = {
  LEAGUE_POINTS_REGRET: "rimpianto in punti di lega per giornata",
  LEAGUE_POINTS: "punti di lega realizzati per giornata",
};

/** Per una metrica, «meglio» è più basso o più alto? Serve solo al report. */
const METRIC_LOWER_IS_BETTER: Record<HistoricalComparisonMetric, boolean> = {
  LEAGUE_POINTS_REGRET: true,
  LEAGUE_POINTS: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// I sotto-semi.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Il sotto-seme del confronto storico, derivato dal seme con `mix32` esattamente
 * come `opponentDrawSubSeed` deriva il suo: stessa disciplina, sale diverso.
 */
export function historicalBootstrapSubSeed(seed: number): number {
  return mix32((seed >>> 0) ^ HISTORICAL_BOOTSTRAP_SUBSEED_SALT);
}

/**
 * IL SOTTO-SEME DI UNA STAGIONE, DERIVATO DAL SUO NOME.
 *
 * Il nome si ripiega nel mescolatore un carattere alla volta — sempre lo stesso
 * `mix32`, mai una seconda funzione di hash — così il flusso di una stagione
 * dipende da (seme, nome) e da nient'altro: non dalla posizione in cui la
 * stagione arriva, non da quante stagioni ci sono, non da quante politiche.
 * È questa proprietà, e non un ordinamento fatto a valle, che rende identico
 * l'intervallo quando le stagioni arrivano permutate.
 */
export function seasonBootstrapSubSeed(seed: number, seasonId: string): number {
  let h = historicalBootstrapSubSeed(seed);
  for (let i = 0; i < seasonId.length; i += 1) {
    h = mix32(h ^ (seasonId.charCodeAt(i) >>> 0));
  }
  return h >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gli ingressi.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UNA GIORNATA DI UNA POLITICA IN UNA STAGIONE PASSATA, come la misura chi ha i
 * dati. Entrambe le misure di §11.2 in una riga sola: la tabella ne usa una, e
 * quale sia lo dichiara la tabella.
 *
 * `null` vuol dire «non calcolabile» — esito non risolto, o nessuna formazione —
 * e non vuol dire zero. L'ASSENZA di una riga non vuol dire niente ed è un
 * errore: si veda la guardia di rettangolarità più sotto.
 */
export interface HistoricalMatchdayObservation {
  /** Identificativo della stagione. Stringa opaca: qui non se ne legge niente. */
  readonly season: string;
  readonly policy: ReferencePolicyId;
  readonly matchday: number;
  /** Punti di lega realizzati in quella giornata (§11.2, misura 1). */
  readonly leaguePoints: number | null;
  /** Rimpianto in punti di lega contro il tetto ex-post (§11.2, misura 2). */
  readonly leaguePointsRegret: number | null;
}

export interface HistoricalComparisonInput {
  readonly observations: readonly HistoricalMatchdayObservation[];
  /** Quale delle due misure va in tabella. Default: scelta 1. */
  readonly metric?: HistoricalComparisonMetric;
  /** Seme del bootstrap. Intero in [0, 2^32). */
  readonly seed: number;
  readonly replicates?: number;
  readonly confidenceLevel?: number;
  /** La soglia di scelta 5. Si può alzare o abbassare, ma va dichiarata. */
  readonly minMatchdaysForInterval?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Le uscite.
// ─────────────────────────────────────────────────────────────────────────────

export interface BootstrapInterval {
  readonly lower: number;
  readonly upper: number;
  readonly level: number;
  readonly replicates: number;
  /** Le unità ricampionate: giornate, non stagioni. */
  readonly resampledUnits: number;
}

/**
 * UNA CELLA DELLA TABELLA. Ogni campo numerico è ricalcolabile dai suoi ingressi
 * e solo da quelli: `total` è la somma dei valori della metrica sulle giornate
 * della base comune, `mean` è `total / matchdaysCounted`. Non c'è nessuna via
 * privata che porti a questi numeri.
 */
export interface HistoricalCell {
  readonly policy: ReferencePolicyId;
  readonly season: string;
  /** Le giornate della base comune della stagione. Zero = cella non misurata. */
  readonly matchdaysCounted: number;
  /** Somma della metrica sulla base comune; `null` se non c'è base. */
  readonly total: number | null;
  /** `total / matchdaysCounted`; `null` se non c'è base. */
  readonly mean: number | null;
  /** `null` sotto soglia, o senza base: e allora `intervalReason` dice perché. */
  readonly interval: BootstrapInterval | null;
  readonly intervalReason: string;
}

/**
 * LA COLONNA DI TUTTE LE STAGIONI — la riga «totale» del confronto.
 *
 * `total` e `mean` SI RICOSTRUISCONO DALLE CELLE, e devono: `total` è la somma
 * dei `total` delle celle in ordine canonico di stagione, `mean` è la media
 * pesata dei `mean` delle celle con peso `matchdaysCounted`. Non esiste una
 * seconda via di calcolo, ed è deliberato: un totale calcolato per conto proprio
 * è un totale che nessuno ricontrolla.
 *
 * L'INTERVALLO, INVECE, NON SI RICOSTRUISCE DALLE CELLE, e non deve sembrare che
 * lo faccia. Viene da un ricampionamento stratificato sull'insieme di tutte le
 * giornate comuni: è più stretto della combinazione ingenua degli intervalli per
 * stagione, e leggerlo come loro media sarebbe leggerlo male.
 */
export interface HistoricalPooledCell {
  readonly policy: ReferencePolicyId;
  readonly matchdaysCounted: number;
  readonly total: number | null;
  readonly mean: number | null;
  readonly interval: BootstrapInterval | null;
  readonly intervalReason: string;
}

/** La diagnosi della base di una stagione: quali giornate entrano e perché no. */
export interface SeasonBasis {
  readonly season: string;
  /** Tutte le giornate viste nella stagione, crescenti. */
  readonly matchdaysSeen: readonly number[];
  /** Quelle su cui OGNI politica ha un valore: la base comune, crescenti. */
  readonly matchdaysCommon: readonly number[];
  /** Quelle escluse perché almeno una politica non le ha, crescenti. */
  readonly matchdaysExcluded: readonly number[];
  /** `true` se nessuna giornata è stata esclusa. */
  readonly sameBasis: boolean;
  readonly reason: string;
}

export interface HistoricalComparison {
  readonly metric: HistoricalComparisonMetric;
  /** Stagioni in ordine canonico (alfabetico del nome). */
  readonly seasons: readonly string[];
  /** Politiche in ordine canonico (l'ordine del catalogo di §11.1). */
  readonly policies: readonly ReferencePolicyId[];
  /** Le celle, in ordine politica-maggiore e stagione crescente. */
  readonly cells: readonly HistoricalCell[];
  /** La colonna «tutte le stagioni», una riga per politica, ordine canonico. */
  readonly pooled: readonly HistoricalPooledCell[];
  readonly seasonBasis: readonly SeasonBasis[];
  readonly seed: number;
  readonly replicates: number;
  readonly confidenceLevel: number;
  readonly minMatchdaysForInterval: number;
  readonly reason: string;
  readonly leagueRuleVersion: LeagueRuleVersion;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilità interne.
// ─────────────────────────────────────────────────────────────────────────────

/** L'indice di una politica nel catalogo di §11.1. È l'ordine canonico. */
function policyRank(policy: ReferencePolicyId): number {
  const index = REFERENCE_POLICIES.findIndex((descriptor) => descriptor.id === policy);
  if (index < 0) {
    // `referencePolicy` alza l'errore con il messaggio giusto: non se ne scrive
    // un secondo qui.
    referencePolicy(policy);
  }
  return index;
}

function metricValue(
  observation: HistoricalMatchdayObservation,
  metric: HistoricalComparisonMetric,
): number | null {
  return metric === "LEAGUE_POINTS_REGRET" ? observation.leaguePointsRegret : observation.leaguePoints;
}

/**
 * Gli estremi percentili di un campione GIÀ ORDINATO. Regola dichiarata, perché
 * «il percentile» non è una definizione sola: l'estremo basso è il valore in
 * posizione `floor(alpha/2 · B)`, quello alto in posizione
 * `ceil((1 − alpha/2) · B) − 1`, entrambi contati da zero e tagliati agli
 * estremi del campione. Con B = 2000 e livello 95 % sono le posizioni 50 e 1949.
 */
function percentileEndpoints(sorted: readonly number[], level: number): { lower: number; upper: number } {
  const replicates = sorted.length;
  const alpha = 1 - level;
  const lowIndex = Math.min(replicates - 1, Math.max(0, Math.floor((alpha / 2) * replicates)));
  const highIndex = Math.min(replicates - 1, Math.max(0, Math.ceil((1 - alpha / 2) * replicates) - 1));
  return { lower: sorted[lowIndex] as number, upper: sorted[highIndex] as number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Il calcolo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LA TABELLA POLITICHE × STAGIONI CON GLI INTERVALLI BOOTSTRAP — WP-10.
 *
 * Funzione pura: stesse osservazioni e stesso seme, stessa tabella bit per bit,
 * comunque siano ordinate le osservazioni in ingresso.
 */
export function historicalPolicyComparison(input: HistoricalComparisonInput): HistoricalComparison {
  const metric = input.metric ?? DEFAULT_HISTORICAL_METRIC;
  const replicates = input.replicates ?? DEFAULT_BOOTSTRAP_REPLICATES;
  const level = input.confidenceLevel ?? DEFAULT_CONFIDENCE_LEVEL;
  const threshold = input.minMatchdaysForInterval ?? MIN_MATCHDAYS_FOR_INTERVAL;
  const seed = input.seed;

  assertParameters({ seed, replicates, level, threshold });

  const observations = input.observations;
  if (observations.length === 0) {
    throw new Error(
      "confronto storico: nessuna osservazione. Una tabella vuota non è un confronto in parità: è " +
        "nessun confronto, e stamparla con delle celle a zero farebbe sembrare misurato ciò che non " +
        "è stato osservato.",
    );
  }

  // 1. Indicizzazione e guardie di forma.
  const seasonSet = new Set<string>();
  const policySet = new Set<ReferencePolicyId>();
  const byKey = new Map<string, HistoricalMatchdayObservation>();
  for (const observation of observations) {
    if (typeof observation.season !== "string" || observation.season.length === 0) {
      throw new Error(
        "confronto storico: stagione senza nome. Il nome della stagione è la chiave del suo " +
          "sotto-seme: senza nome due stagioni diverse condividerebbero lo stesso flusso di numeri " +
          "casuali e i loro intervalli sarebbero copie l'uno dell'altro.",
      );
    }
    policyRank(observation.policy);
    if (!Number.isInteger(observation.matchday) || observation.matchday < 1) {
      throw new Error(
        `confronto storico: giornata non valida (${String(observation.matchday)}) nella stagione ` +
          `${observation.season}. Le giornate sono interi da 1 in su.`,
      );
    }
    assertFiniteOrNull(observation.leaguePoints, observation, "leaguePoints");
    assertFiniteOrNull(observation.leaguePointsRegret, observation, "leaguePointsRegret");
    const key = `${observation.season}|${String(observation.policy)}|${observation.matchday}`;
    if (byKey.has(key)) {
      throw new Error(
        `confronto storico: due righe per ${String(observation.policy)} alla giornata ` +
          `${observation.matchday} della stagione ${observation.season}. Due esiti per la stessa ` +
          "giornata non sono un dato più ricco: uno dei due è di un'altra formazione, e tenerli " +
          "entrambi conterebbe due volte una giornata sola.",
      );
    }
    byKey.set(key, observation);
    seasonSet.add(observation.season);
    policySet.add(observation.policy);
  }

  // ORDINE CANONICO, una volta per tutte. Da qui in poi nessun ciclo di questa
  // funzione scorre le osservazioni nell'ordine in cui sono arrivate.
  const seasons = [...seasonSet].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const policies = [...policySet].sort((a, b) => policyRank(a) - policyRank(b));

  // 2. Rettangolarità: ogni politica ha una riga per ogni giornata di ogni
  //    stagione in cui la tabella la mette. Una riga mancante non è un `null`:
  //    `null` dichiara «non calcolabile», l'assenza non dichiara niente, e
  //    lasciarla passare significherebbe far sparire una giornata da una
  //    politica sola — che è il modo più facile di farle vincere il confronto.
  const matchdaysBySeason = new Map<string, number[]>();
  for (const season of seasons) {
    const seen = new Set<number>();
    for (const observation of observations) {
      if (observation.season === season) seen.add(observation.matchday);
    }
    const ordered = [...seen].sort((a, b) => a - b);
    matchdaysBySeason.set(season, ordered);
    for (const policy of policies) {
      for (const matchday of ordered) {
        if (!byKey.has(`${season}|${String(policy)}|${matchday}`)) {
          throw new Error(
            `confronto storico: nella stagione ${season} manca la riga di ${String(policy)} alla ` +
              `giornata ${matchday}. Una riga assente non è «non calcolabile»: «non calcolabile» si ` +
              "scrive null ed entra nella diagnosi della base, l'assenza invece toglierebbe in " +
              "silenzio una giornata a una politica sola.",
          );
        }
      }
    }
  }

  // 3. La base comune di ogni stagione. La diagnosi per politica la fa
  //    `policySeasonTable`, che è già l'auditor della base in questo pacchetto:
  //    riceve le righe GIÀ in ordine canonico, così anche i suoi totali sono
  //    invarianti per permutazione dell'ingresso e confrontabili bit per bit
  //    con i totali delle celle (il controllo incrociato del punto 5).
  const seasonBasis: SeasonBasis[] = [];
  const commonBySeason = new Map<string, number[]>();
  const auditedBySeason = new Map<string, ReturnType<typeof policySeasonTable>>();
  for (const season of seasons) {
    const matchdaysSeen = matchdaysBySeason.get(season) as number[];
    const entries: PolicyMatchday[] = [];
    for (const policy of policies) {
      for (const matchday of matchdaysSeen) {
        const observation = byKey.get(`${season}|${String(policy)}|${matchday}`) as HistoricalMatchdayObservation;
        entries.push({ policy, matchday, leaguePoints: metricValue(observation, metric) });
      }
    }
    const audited = policySeasonTable(entries);
    auditedBySeason.set(season, audited);
    const excluded = new Set<number>();
    for (const row of audited.rows) for (const matchday of row.matchdaysNotCounted) excluded.add(matchday);
    const matchdaysCommon = matchdaysSeen.filter((matchday) => !excluded.has(matchday));
    const matchdaysExcluded = matchdaysSeen.filter((matchday) => excluded.has(matchday));
    commonBySeason.set(season, matchdaysCommon);
    seasonBasis.push({
      season,
      matchdaysSeen,
      matchdaysCommon,
      matchdaysExcluded,
      sameBasis: audited.sameBasis,
      reason: audited.sameBasis
        ? `${matchdaysCommon.length} giornata/e, tutte le politiche sulla stessa base`
        : `base comune ridotta a ${matchdaysCommon.length} giornata/e su ${matchdaysSeen.length}: ` +
          `esclusa/e ${matchdaysExcluded.join(", ")} perché almeno una politica non le ha calcolabili. ` +
          "Il confronto è appaiato: una giornata che manca a una politica non può contarla nessuno, " +
          "altrimenti due colonne misurerebbero due insiemi di giornate diversi.",
    });
  }

  // 4. I ricampionamenti, una volta per stagione e condivisi da tutte le
  //    politiche (bootstrap appaiato, scelta 4). Di ogni ripetizione si tiene
  //    la SOMMA per politica, non gli indici: la somma è ciò che serve alla
  //    cella e alla colonna cumulata, e tenere la matrice degli indici sarebbe
  //    tenere in memoria un dettaglio che nessuno rilegge.
  const replicateSums = new Map<string, Float64Array>();
  for (const season of seasons) {
    const common = commonBySeason.get(season) as number[];
    const units = common.length;
    const perPolicy = policies.map(
      (policy) =>
        common.map(
          (matchday) =>
            metricValue(byKey.get(`${season}|${String(policy)}|${matchday}`) as HistoricalMatchdayObservation, metric) as number,
        ),
    );
    const sums = policies.map(() => new Float64Array(replicates));
    if (units > 0) {
      const random = mulberry32(seasonBootstrapSubSeed(seed, season));
      const values = policies.map((_, p) => perPolicy[p] as number[]);
      const targets = policies.map((_, p) => sums[p] as Float64Array);
      for (let b = 0; b < replicates; b += 1) {
        for (let k = 0; k < units; k += 1) {
          // Un solo flusso di numeri casuali per la stagione, un'estrazione per
          // unità: gli indici sono gli stessi per tutte le politiche, ed è
          // questo che rende appaiato il confronto.
          const drawn = Math.min(units - 1, Math.floor(random() * units));
          for (let p = 0; p < targets.length; p += 1) {
            const target = targets[p] as Float64Array;
            target[b] = (target[b] as number) + ((values[p] as number[])[drawn] as number);
          }
        }
      }
    }
    for (let p = 0; p < policies.length; p += 1) {
      replicateSums.set(`${season}|${String(policies[p] as ReferencePolicyId)}`, sums[p] as Float64Array);
    }
  }

  // 5. Le celle. Somma in ordine di giornata crescente, media dalla somma, e il
  //    controllo incrociato contro `policySeasonTable`.
  const cells: HistoricalCell[] = [];
  for (const policy of policies) {
    for (const season of seasons) {
      const common = commonBySeason.get(season) as number[];
      const units = common.length;
      if (units === 0) {
        cells.push({
          policy,
          season,
          matchdaysCounted: 0,
          total: null,
          mean: null,
          interval: null,
          intervalReason:
            `non misurabile con questa storia: nessuna giornata in comune nella stagione ${season}`,
        });
        continue;
      }
      let total = 0;
      for (const matchday of common) {
        total += metricValue(
          byKey.get(`${season}|${String(policy)}|${matchday}`) as HistoricalMatchdayObservation,
          metric,
        ) as number;
      }
      // IL CONTROLLO INCROCIATO. Quando la base è comune a tutte le politiche,
      // la somma di questa cella deve coincidere con il cumulato che
      // `policySeasonTable` — l'auditor già spedito — calcola per la stessa
      // politica sulla stessa stagione, e coincidere ESATTAMENTE: le due somme
      // hanno gli stessi addendi nello stesso ordine crescente di giornata, e
      // in virgola mobile «stessi addendi nello stesso ordine» vuol dire stessi
      // bit. Se un giorno divergono, una delle due è sbagliata e nessuna delle
      // due lo direbbe da sola: qui si ferma invece di stampare il numero.
      const audited = auditedBySeason.get(season) as ReturnType<typeof policySeasonTable>;
      if (audited.sameBasis) {
        const auditedRow = audited.rows.find((row) => row.policy === policy);
        if (auditedRow === undefined || auditedRow.total !== total) {
          throw new Error(
            `confronto storico: la cella ${String(policy)} × ${season} vale ${total} ma il cumulato ` +
              `di controllo vale ${String(auditedRow?.total)}. Due strade per lo stesso numero hanno ` +
              "dato due numeri: la tabella non si stampa finché non coincidono.",
          );
        }
      }
      const mean = total / units;
      const sums = replicateSums.get(`${season}|${String(policy)}`) as Float64Array;
      const { interval, intervalReason } = intervalFrom(sums, units, replicates, level, threshold, {
        what: `la stagione ${season}`,
      });
      cells.push({ policy, season, matchdaysCounted: units, total, mean, interval, intervalReason });
    }
  }

  // 6. LA COLONNA CUMULATA, RICOSTRUITA DALLE CELLE. `total` è la somma dei
  //    `total` delle celle in ordine canonico di stagione; non c'è una seconda
  //    passata sulle osservazioni che produca lo stesso numero per un'altra
  //    strada, perché una seconda strada è esattamente ciò che nessuno
  //    ricontrolla.
  const pooled: HistoricalPooledCell[] = [];
  for (const policy of policies) {
    const rowCells = cells.filter((cell) => cell.policy === policy);
    let total = 0;
    let units = 0;
    let anyCounted = false;
    for (const cell of rowCells) {
      if (cell.total === null) continue;
      anyCounted = true;
      total += cell.total;
      units += cell.matchdaysCounted;
    }
    if (!anyCounted || units === 0) {
      pooled.push({
        policy,
        matchdaysCounted: 0,
        total: null,
        mean: null,
        interval: null,
        intervalReason: "non misurabile con questa storia: nessuna giornata in comune in nessuna stagione",
      });
      continue;
    }
    // Le somme ricampionate si sommano per stagione in ordine canonico: è il
    // bootstrap STRATIFICATO di scelta 4, e l'ordine fisso è ciò che lo rende
    // identico bit per bit quando le stagioni arrivano permutate.
    const pooledSums = new Float64Array(replicates);
    for (const season of seasons) {
      if ((commonBySeason.get(season) as number[]).length === 0) continue;
      const seasonSums = replicateSums.get(`${season}|${String(policy)}`) as Float64Array;
      for (let b = 0; b < replicates; b += 1) {
        pooledSums[b] = (pooledSums[b] as number) + (seasonSums[b] as number);
      }
    }
    const { interval, intervalReason } = intervalFrom(pooledSums, units, replicates, level, threshold, {
      what: "tutte le stagioni insieme",
      stratified: true,
    });
    pooled.push({ policy, matchdaysCounted: units, total, mean: total / units, interval, intervalReason });
  }

  const withoutInterval = cells.filter((cell) => cell.interval === null).length;
  return {
    metric,
    seasons,
    policies,
    cells,
    pooled,
    seasonBasis,
    seed,
    replicates,
    confidenceLevel: level,
    minMatchdaysForInterval: threshold,
    reason:
      `${policies.length} politica/che × ${seasons.length} stagione/i, metrica: ${METRIC_LABEL[metric]}; ` +
      `bootstrap appaiato sulle giornate, ${replicates} ripetizioni, percentile al ` +
      `${(level * 100).toFixed(1)} %, soglia ${threshold} giornate` +
      (withoutInterval > 0 ? `; ${withoutInterval} cella/e senza intervallo` : "") +
      ". Serve a ORDINARE le politiche (§11.3), non a stimare i punti veri.",
    leagueRuleVersion: LEAGUE_RULE_VERSION,
  };
}

function intervalFrom(
  sums: Float64Array,
  units: number,
  replicates: number,
  level: number,
  threshold: number,
  context: { readonly what: string; readonly stratified?: boolean },
): { interval: BootstrapInterval | null; intervalReason: string } {
  if (units < threshold) {
    return {
      interval: null,
      intervalReason:
        `non misurabile con questa storia: ${units} giornata/e in comune su ${context.what}, soglia ` +
        `${threshold}. Un intervallo su così poche giornate esce stretto e simmetrico come uno su una ` +
        "stagione intera, e la sua larghezza misura una giornata sola invece della politica: per " +
        "questo non se ne pubblica nessuno.",
    };
  }
  const means = new Array<number>(replicates);
  for (let b = 0; b < replicates; b += 1) means[b] = (sums[b] as number) / units;
  means.sort((a, b) => a - b);
  const { lower, upper } = percentileEndpoints(means, level);
  return {
    interval: { lower, upper, level, replicates, resampledUnits: units },
    intervalReason:
      `percentile al ${(level * 100).toFixed(1)} % su ${replicates} ripetizioni, ` +
      `${units} giornata/e ricampionata/e` +
      (context.stratified === true
        ? ", stratificato per stagione. NON è la combinazione degli intervalli per stagione ed è più " +
          "stretto di loro: leggerlo come una loro media sarebbe leggerlo male."
        : ""),
  };
}

function assertFiniteOrNull(
  value: number | null,
  observation: HistoricalMatchdayObservation,
  field: string,
): void {
  if (value === null) return;
  if (!Number.isFinite(value)) {
    throw new Error(
      `confronto storico: ${field} non finito alla giornata ${observation.matchday} di ` +
        `${String(observation.policy)} nella stagione ${observation.season}. «Non calcolabile» si ` +
        "scrive null, non NaN: un NaN si propaga nella somma e spegne una colonna intera senza dirlo.",
    );
  }
}

function assertParameters(input: {
  readonly seed: number;
  readonly replicates: number;
  readonly level: number;
  readonly threshold: number;
}): void {
  // Stessa guardia del seme del produttore: `mulberry32` fa `seed >>> 0`, e un
  // seme troncato in silenzio renderebbe irriproducibile un intervallo che deve
  // poter essere rifatto identico a distanza di mesi.
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed >= SEED_MODULUS) {
    throw new Error(
      `confronto storico: seed non valido (${String(input.seed)}). Serve un intero in [0, 2^32): il ` +
        "PRNG lo tronca con `>>> 0`, e due chiamate «con semi diversi» darebbero lo stesso intervallo.",
    );
  }
  if (!Number.isInteger(input.replicates) || input.replicates < MIN_BOOTSTRAP_REPLICATES) {
    throw new Error(
      `confronto storico: ripetizioni non valide (${String(input.replicates)}). Serve un intero >= ` +
        `${MIN_BOOTSTRAP_REPLICATES}: sotto questa soglia le code del percentile contengono meno di ` +
        "cinque ripetizioni, e l'estremo pubblicato cambia a ogni ricalcolo.",
    );
  }
  if (!Number.isFinite(input.level) || input.level <= 0.5 || input.level >= 1) {
    throw new Error(
      `confronto storico: livello di confidenza non valido (${String(input.level)}). Serve un numero ` +
        "in (0,5, 1): sotto la metà l'«intervallo» conterrebbe il vero valore meno spesso di quanto " +
        "lo escluda, e chiamarlo intervallo di confidenza sarebbe un abuso di nome.",
    );
  }
  if (!Number.isInteger(input.threshold) || input.threshold < 2) {
    throw new Error(
      `confronto storico: soglia non valida (${String(input.threshold)}). Serve un intero >= 2: con ` +
        "una unità sola il ricampionamento restituisce sempre la stessa unità e l'intervallo è un punto.",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Il report.
// ─────────────────────────────────────────────────────────────────────────────

function formatNumber(value: number | null): string {
  if (value === null) return "—";
  const fixed = value.toFixed(REPORT_DECIMALS);
  // `-0,000` è zero scritto in modo da sembrare un numero negativo piccolo.
  return fixed === `-${(0).toFixed(REPORT_DECIMALS)}` ? (0).toFixed(REPORT_DECIMALS) : fixed;
}

function formatCell(mean: number | null, interval: BootstrapInterval | null): string {
  if (mean === null) return "—";
  if (interval === null) return `${formatNumber(mean)} (non misurabile)`;
  return `${formatNumber(mean)} [${formatNumber(interval.lower)}; ${formatNumber(interval.upper)}]`;
}

/**
 * IL REPORT — la tabella di WP-10 in testo semplice, deterministico.
 *
 * Porta con sé tutto ciò che serve a rifarla: metrica, seme, ripetizioni,
 * livello, soglia. Una tabella senza il proprio seme è una tabella che non si
 * può ricontrollare, e una tabella che non si ricontrolla è un'opinione.
 *
 * Le celle sotto soglia NON portano un intervallo e lo dicono in chiaro: è la
 * stessa scelta 5, vista dal lato di chi legge.
 */
export function formatHistoricalComparison(comparison: HistoricalComparison): string {
  const lines: string[] = [];
  const better = METRIC_LOWER_IS_BETTER[comparison.metric] ? "più basso è meglio" : "più alto è meglio";
  lines.push("CONFRONTO STORICO DELLE POLITICHE — §11.3");
  lines.push(`Metrica: ${METRIC_LABEL[comparison.metric]} (${better}).`);
  lines.push(
    `Bootstrap appaiato sulle giornate, ${comparison.replicates} ripetizioni, percentile al ` +
      `${(comparison.confidenceLevel * 100).toFixed(1)} %, seme ${comparison.seed}.`,
  );
  lines.push(
    `Sotto ${comparison.minMatchdaysForInterval} giornate in comune l'intervallo non si pubblica: ` +
      "la cella dice «non misurabile».",
  );
  lines.push(`Regolamento: ${comparison.leagueRuleVersion}.`);
  lines.push("");

  const header = ["politica", ...comparison.seasons, "tutte le stagioni"];
  const rows: string[][] = [header];
  for (const policy of comparison.policies) {
    const descriptor = referencePolicy(policy);
    const row = [descriptor.name];
    for (const season of comparison.seasons) {
      const cell = comparison.cells.find((c) => c.policy === policy && c.season === season);
      row.push(cell === undefined ? "—" : formatCell(cell.mean, cell.interval));
    }
    const pooledCell = comparison.pooled.find((c) => c.policy === policy);
    row.push(pooledCell === undefined ? "—" : formatCell(pooledCell.mean, pooledCell.interval));
    rows.push(row);
  }
  const widths = header.map((_, column) => Math.max(...rows.map((row) => (row[column] as string).length)));
  for (const row of rows) {
    lines.push(row.map((value, column) => value.padEnd(widths[column] as number)).join("  "));
  }

  lines.push("");
  lines.push("Base di giornate per stagione:");
  for (const basis of comparison.seasonBasis) {
    lines.push(`  ${basis.season}: ${basis.reason}`);
  }
  lines.push("");
  lines.push(
    "La colonna «tutte le stagioni» si ricostruisce dalle celle per il valore (media pesata sulle " +
      "giornate contate), NON per l'intervallo: quello viene da un ricampionamento stratificato ed è " +
      "più stretto della combinazione degli intervalli per stagione.",
  );
  lines.push(
    "Questo confronto ORDINA le politiche sulle stagioni passate con il solo lato nostro (§11.3). " +
      "Non stima i punti veri e non promuove niente: se una politica vince qui e perde in ombra, " +
      "prevale l'ombra, perché l'ombra ha l'avversario vero.",
  );
  return lines.join("\n");
}

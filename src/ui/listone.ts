// Listone Svincolati — internal row shape + pure helpers for the display
// table (parsing, column model, sorting, cell/row formatting). UI-only:
// this type is deliberately separate from the engine's PoolPlayer
// (packages/engine/src/types.ts), which stays value-free and is never fed
// by this file. Rows here are for rendering only — never read by
// reduce/feasibility/auction logic, never promote any gate. See
// docs/data/LISTONE_UI_LOAD_CONTRACT.md for the JSON shape this expects.

import { type Role, ROLES } from "../../packages/engine/src/types.js";
import {
  PAGELLA_ASSENTE,
  PAGELLA_ASSI_DI_RUOLO,
  PAGELLA_ETICHETTE,
  PAGELLA_NON_APPLICABILE,
  PAGELLA_VOTO_MAX,
  type PagellaAsse,
  type PagellaAsseView,
  type PagellaView,
  pagellaVuota,
} from "../pagellaEsperti.js";
import { escHtml, roleChipHtml } from "./theme.js";
import { RANGO_IGNOTO } from "./schedaLabels.js";
import { clubBadgeHtml } from "./serieA.js";
// La formattazione decimale italiana deterministica di questo repository —
// niente `Intl`, virgola, un decimale. Importata e non ricopiata: una seconda
// implementazione dello stesso numero è il modo in cui due schermate finiscono
// per scrivere «6,4» e «6.42» dello stesso dato.
import { formatDecimal1 } from "./liveFacts.js";

export type ListoneCellValue = string | number;

/**
 * One row of the Listone Svincolati table. `name`/`role`/`club` are
 * required; `quotation` is optional. `extra` carries any additional
 * columns present in a full source file, copied verbatim from the loaded
 * JSON — never fabricated, never inferred. We don't hardcode specific
 * extra column names (e.g. guessed real-listone fields): this repo has
 * never parsed the real listone XLSX (it's handled as an opaque binary,
 * see docs/automation/N8N_LISTINO_PRICES_RUNBOOK.md), so any such name
 * would be a guess, not something "derived directly from the source
 * file". Extra columns are instead discovered from whatever keys the
 * loaded JSON rows actually contain.
 */
export interface ListonePlayer {
  /** Stable synthetic/proxy identifier when the source can provide one.
   * The final-listone collision audit remains DATA-05. */
  readonly proxyId?: string | number;
  readonly name: string;
  readonly role: Role;
  readonly club: string;
  readonly quotation?: number;
  readonly extra?: Readonly<Record<string, ListoneCellValue>>;
  /** Present only when the served payload carries one — see below. */
  readonly appealIndex?: ListoneAppealIndex;
  /** Le previsioni del motore GEN-PROTOCOL-A per questa riga, quando il
   *  deposito le serve. Assente = giocatore non servibile, e la UI lo dice
   *  (`n/d`) invece di inventarne una — vedi `ListoneGenForecast`. */
  readonly genForecast?: ListoneGenForecast;
}

/**
 * The appeal index of one row, exactly as the private deposit serves it.
 *
 * Every qualifier travels with the number: `quality` is the evidence label the
 * Algorithm Factory computed next to the score, `recipe` the version of the
 * composition recipe that produced it. Neither is ever written in this file —
 * the UI is not allowed to state (or omit) a caveat the data did not carry.
 * `score === null` is an honest "no verdict", rendered `n/d` and never
 * replaced by a default, a midpoint or a blank.
 *
 * Display-only, like the rest of the pool: it feeds no engine, no ranking, no
 * suggestion and promotes no gate. See docs/DECISIONS.md §"Eccezioni operative
 * scritte" (2026-08-12, indice di appetibilità display-only) and
 * docs/data/APPEAL_INDEX_SERVING_CONTRACT.md.
 */
export interface ListoneAppealIndex {
  readonly score: number | null;
  readonly quality: string;
  readonly recipe: string;
  readonly components: Readonly<Record<string, number | null>>;
}

// ── LE PREVISIONI DEL MOTORE (GEN-PROTOCOL-A) — CONTRATTO DI SOLA LETTURA ────
//
// L'APP LEGGE, NON CALCOLA, e questo non è un modo di dire: il barrel del
// pacchetto dell'indice resta NON importabile da `src/`, e nessuna riga di
// questo file conosce la ricetta. Qui arriva un payload già prodotto altrove, e
// l'unica cosa che questo modulo può fare con un payload malformato è
// RIFIUTARLO: mai un default, mai un numero inventato, mai un caveat aggiunto o
// tolto rispetto a quello che il dato dice.
//
// (Il percorso di quel barrel non è scritto qui apposta: l'invariante è pinnata
// da un test che cerca la stringa nel TESTO dei file di `src/` — import o
// commento che sia — quindi nominarlo la farebbe diventare rossa.)
//
// I TRE BERSAGLI, nel vocabolario della ricetta (GEN-RECIPE@1.0.0):
//   T2 — fantamedia prevista;
//   TN — presenze previste, con l'eventuale tetto degli esperti già applicato
//        a monte (§D.10.2) e DICHIARATO dal dato (`capApplied`);
//   T1 — totale previsto (composto).
// Sono tutti e tre obbligatori quando `genForecast` c'è: due bersagli su tre
// sarebbero una previsione monca che la tabella mostrerebbe come completa.
//
// UNA RIGA PUÒ NON AVERNE. Un giocatore non servibile non ha `genForecast`, e
// questo è un dato — la cella dice `n/d`, come per l'indice.
export type GenForecastTargetId = "T2" | "TN" | "T1";

/** L'ordine in cui i tre bersagli si leggono: prima la fantamedia, poi le
 *  presenze, poi il totale che le compone. Dichiarato una volta — colonne,
 *  riga d'insight e nota sotto la tabella lo condividono invece di riscriverlo. */
export const GEN_FORECAST_TARGET_IDS: readonly GenForecastTargetId[] = ["T2", "TN", "T1"];

/**
 * Lo stato di un bersaglio COME LO DICHIARA IL DATO. Vocabolario chiuso: la
 * ricetta ne conosce un terzo (`NO_VERDICT`, vedi schemas/gen-recipe.schema.json
 * §entry.status), ma un bersaglio senza verdetto non produce una previsione da
 * servire — la riga arriva senza `genForecast` e l'assenza si legge `n/d`. Un
 * `status` fuori da questi due non è una parola che questo modulo possa
 * mostrare senza inventarne il significato: il pool si rifiuta.
 */
export type GenForecastStatus = "winner" | "B0";

const GEN_FORECAST_STATUSES: readonly string[] = ["winner", "B0"];

/** I campi che un bersaglio può portare, e nient'altro — vedi
 *  `isGenForecastTarget` per perché qui l'ignoto si rifiuta. */
const GEN_FORECAST_TARGET_FIELDS: readonly string[] = ["value", "interval", "status", "capApplied"];

/**
 * L'AUTORITÀ, e perché il vocabolario è chiuso a una parola sola.
 *
 * L'etichetta a schermo la porta il DATO (`authority`), mai il renderer — ma
 * l'unico valore che questa superficie può mostrare è `advisory`: un payload
 * che dichiarasse un'autorità diversa chiederebbe al sito di esporre un output
 * direttivo, che è un no-go finché il gate che lo valida non esiste. Quindi non
 * si cabla la parola «advisory» nella resa (verrebbe mostrata anche su un dato
 * che dice altro): si RIFIUTA il pool e non si mostra niente.
 */
export const GEN_FORECAST_AUTHORITY_ADVISORY = "advisory";

/**
 * Il raggio conformal di un bersaglio, `null` quando non c'è — ed è il caso di
 * oggi, perché i raggi non esistono ancora. È nel contratto lo stesso, perché
 * il formato di trasporto lo prevede e un payload valido non deve mai essere
 * rifiutato da questa parte del confine.
 */
export interface ListoneGenForecastInterval {
  readonly lo: number;
  readonly hi: number;
}

export interface ListoneGenForecastTarget {
  readonly value: number;
  readonly interval: ListoneGenForecastInterval | null;
  readonly status: GenForecastStatus;
  /** SOLO su TN: il tetto degli esperti (§D.10.2) è stato applicato a questa
   *  previsione. Booleano dichiarato dal dato; sugli altri due bersagli il
   *  campo non esiste e la sua presenza invalida il pool. */
  readonly capApplied?: boolean;
}

/**
 * Le previsioni di una riga, esattamente come il deposito privato le serve.
 *
 * Ogni qualificatore VIAGGIA COL NUMERO — versione della ricetta, versione del
 * protocollo, identificativo del run, autorità — perché una previsione senza la
 * ricetta che l'ha prodotta non è ispezionabile, e questo file non è
 * autorizzato a supplire con una costante. Display-only, come il resto del
 * pool: non alimenta nessun motore, nessuna fascia, nessun gate, e NON entra
 * nel riquadro del valore (`ValueSlotId` è chiuso a quattro, src/valueBox.ts).
 */
export interface ListoneGenForecast {
  readonly recipeVersion: string;
  readonly protocolVersion: string;
  readonly runId: string;
  readonly authority: string;
  readonly targets: Readonly<Record<GenForecastTargetId, ListoneGenForecastTarget>>;
}

export type ColumnKind = "string" | "number" | "role";
export type SortDirection = "asc" | "desc";

export interface ListoneColumn {
  readonly key: string; // "name" | "role" | "club" | "quotation" | an extra key
  readonly label: string;
  readonly kind: ColumnKind;
  readonly core: boolean;
  /**
   * BLINDATA: nessuna preferenza la spegne, mai. Vale oggi per le sole tre
   * colonne d'identità (nome, ruolo, squadra) ed è il modo in cui il divieto
   * VIAGGIA COL DATO invece di restare un commento: la bandiera arriva ovunque
   * arrivi la colonna, quindi chi calcola le colonne visibili non può
   * dimenticarsene (`visibleColumnKeys`, src/listoneColumnPrefs.ts).
   *
   * Assente = falso, ed è il default giusto: una colonna nuova nasce
   * spegnibile, e una colonna spegnibile non può far sparire l'identità di una
   * riga. Aggiunta il 2026-08-24 dopo la review di PR #41, che eseguendo
   * l'app ha spento «Nome» dal pannello e ha visto la riga ridursi a
   * `P CLU ClubUno n/d …` senza il nome del giocatore.
   */
  readonly locked?: boolean;
}

export interface ListoneSort {
  readonly key: string;
  readonly direction: SortDirection;
}

const CORE_COLUMNS: readonly ListoneColumn[] = [
  { key: "name", label: "Nome", kind: "string", core: true },
  { key: "role", label: "Ruolo", kind: "role", core: true },
  { key: "club", label: "Squadra", kind: "string", core: true },
  { key: "quotation", label: "Quotazione", kind: "number", core: true },
];

/**
 * Le tre colonne d'identità: nome, ruolo, squadra. Sono le prime tre della
 * lista di Pico (2026-08-24) e le uniche che nessuna vista può spegnere senza
 * che la riga smetta di dire di chi parla.
 *
 * DAL 2026-08-24 QUESTA FRASE NON È PIÙ SOLO UN COMMENTO: `locked: true` la
 * rende vera per costruzione. Prima lo era solo per buona volontà, e infatti
 * non lo era — il pannello «Colonne visibili» generava un interruttore anche
 * per queste tre e spegnerlo funzionava.
 */
const IDENTITY_COLUMNS: readonly ListoneColumn[] = CORE_COLUMNS.slice(0, 3).map((c) => ({
  ...c,
  locked: true,
}));

/**
 * Le chiavi delle tre colonne blindate — DERIVATE, mai riscritte a mano: due
 * elenchi che devono restare uguali sono un difetto in attesa del giorno in
 * cui qualcuno ne aggiorna uno solo.
 */
export const LISTONE_IDENTITY_COLUMN_KEYS: readonly string[] = IDENTITY_COLUMNS.map((c) => c.key);

/** La quotazione di listino. Resta una colonna del pool a tutti gli effetti —
 *  validata, ordinabile, riaccendibile — ma dal 2026-08-24 NON è più visibile
 *  di default: Pico ha chiesto undici colonne e questa non è fra loro
 *  («Nascondile, ma lasciale attivabili»). */
const QUOTATION_COLUMN: ListoneColumn = CORE_COLUMNS[3] as ListoneColumn;

/** Column key of the appeal index. Not a core column: it exists only when the
 *  served pool actually carries an index, and disappears with it. */
export const APPEAL_INDEX_COLUMN_KEY = "appealIndex";

/** Il nome del campo di riga che porta le previsioni. Non è una chiave di
 *  colonna — le colonne sono tre, una per bersaglio — ed è qui perché la
 *  validazione deve sapere che non è una colonna extra del file caricato. */
export const GEN_FORECAST_FIELD = "genForecast";

/**
 * LE TRE COLONNE DELLE PREVISIONI, una per bersaglio.
 *
 * Tre e non una: sono tre grandezze diverse (un voto medio, un conteggio di
 * partite, un totale di punti) e una colonna sola le renderebbe non ordinabili
 * — la stessa ragione per cui «punizioni» e «angoli» sono due colonne e non una
 * cella con dentro due numeri.
 *
 * La chiave porta il nome del bersaglio COME LO CHIAMA LA RICETTA (`T2`, `TN`,
 * `T1`): l'etichetta a schermo è in italiano, ma la chiave — che finisce
 * nell'archivio delle preferenze e in `data-col` — resta agganciata al
 * vocabolario del contratto, così una colonna riaccesa nel 2027 parla ancora
 * della stessa cosa.
 */
export const GEN_FORECAST_COLUMN_KEY_BY_TARGET: Readonly<Record<GenForecastTargetId, string>> = {
  T2: "genForecast_T2",
  TN: "genForecast_TN",
  T1: "genForecast_T1",
};

export const GEN_FORECAST_COLUMN_KEYS: readonly string[] = GEN_FORECAST_TARGET_IDS.map(
  (target) => GEN_FORECAST_COLUMN_KEY_BY_TARGET[target],
);

/** Dalla chiave di colonna al bersaglio, o `undefined` se quella chiave non è
 *  una delle tre. Derivata dalla mappa qui sopra e mai riscritta a mano. */
const GEN_FORECAST_TARGET_BY_COLUMN_KEY: ReadonlyMap<string, GenForecastTargetId> = new Map(
  GEN_FORECAST_TARGET_IDS.map((target) => [GEN_FORECAST_COLUMN_KEY_BY_TARGET[target], target]),
);

/**
 * LE ETICHETTE — le parole del prodotto, non le sigle del protocollo.
 *
 * «prev.» sta per «prevista/previste/previsto» e compare in tutte e tre:
 * l'abbreviazione è la stessa parola in tre concordanze diverse, e ripeterla
 * per esteso mangerebbe la larghezza della cifra su una tabella che a 390px si
 * legge già stretta. Che siano previsioni, e di chi, lo dicono per esteso il
 * tooltip della colonna e la nota sotto la tabella.
 */
export const GEN_FORECAST_COLUMN_LABELS: Readonly<Record<GenForecastTargetId, string>> = {
  T2: "Fantamedia prev.",
  TN: "Presenze prev.",
  T1: "Totale prev.",
};

/**
 * IL MARCATORE DEL TETTO — un segno accanto alla cifra delle presenze, e la
 * frase per esteso nell'altro canale (`GEN_FORECAST_CAP_LABEL`).
 *
 * Discreto ma non muto, e soprattutto NON un colore: la cella è larga un
 * pollice, la stampa è in bianco e nero e chi legge a voce non vede nessuna
 * tinta. Stesso idioma dei marcatori d'asse «PI»/«BO» (`cellMarkerHtml`), che è
 * già misurato dalla guardia di contrasto.
 *
 * La freccia verso il basso dice la direzione del tetto: la previsione è stata
 * TAGLIATA verso il basso, mai alzata.
 */
export const GEN_FORECAST_CAP_MARKER = "▾";

/** La frase per esteso del marcatore. Dichiara UN FATTO DEL DATO — il tetto è
 *  stato applicato — e non lo interpreta: quanto abbia tagliato, e perché, non
 *  è qualcosa che il payload dica e questa cella non lo indovina. */
export const GEN_FORECAST_CAP_LABEL = "tetto esperti applicato";

// ── LE COLONNE DEL GRUPPO ESPERTI ────────────────────────────────────────────
//
// L'ELENCO È DI PICO, E L'ORDINE ANCHE (richiesta del committente, 2026-08-24):
// «nome, ruolo, squadra, indice di appetibilità, Titolarità, Media Voto,
// Salute, No Malus/Bonus, Consiglio Esperti, rigorista, piazzati». Undici
// colonne visibili di default; tutto il resto — la quotazione di listino
// compresa — resta nel listone, nascosto e riaccendibile dal pannello
// «Colonne visibili».
//
// I CINQUE VOTI SONO VOTI, NON GIUDIZI CATEGORICI. Sono su scala 0–10 e
// arrivano dalle schede del Gruppo Esperti. Questo commento diceva «OGGI NON
// ESISTONO ANCORA»: dal 2026-08-26 l'estrazione privata li produce. Ogni cella
// che il deposito non copre continua a dire `n/d` — mai uno zero, mai un
// trattino, mai una media: un voto che nessuno ha scritto non è un voto basso.
//
// ── IL QUARTO ASSE: UNA COLONNA SOLA, E L'AMBIGUITÀ SI LEGGE NELLA CELLA ────
//
// DECISIONE DEL COMMITTENTE, 2026-08-24, testuale: «Interpreti quella colonna
// in modo promiscuo lasciando "No Malus/Bonus" e lo valorizzi. Tanto è una
// cosa che per i portieri vale in un modo e per i giocatori di movimento in un
// altro ma lo so.»
//
// Questo INVERTE la scelta di due colonne separate con cui #33 è entrata in
// `main` il 2026-08-24. L'argomento di #33 — «ordinare una colonna sola
// confronterebbe la porta inviolata di un portiere col bonus di un attaccante»
// — resta VERO, e non viene appianato: viene DICHIARATO nella cella. Ogni
// cella che porta un voto porta anche il marcatore dell'asse che sta
// mostrando (`PI` / `BO`), quindi chi ordina la colonna vede, riga per riga,
// che cosa sta confrontando invece di doverlo dedurre dal ruolo.
//
// Il contratto degli assi NON cambia: restano due assi distinti
// (`pagella_porta_inviolata`, `pagella_bonus`) in src/pagellaEsperti.ts, ed è
// `resolvePagella` a scegliere quale si applica alla riga. Questa colonna è
// una VISTA sui due, non un terzo asse: nessuno ha fuso due grandezze nel
// contratto, si è fusa la loro COLONNA.
//
// PERCHÉ QUESTE CHIAVI E NON ALTRE. `pagella_*` è il prefisso con cui la
// pagella del Gruppo Esperti è nominata nel contratto (src/pagellaEsperti.ts):
// le quattro chiavi che descrivono lo stesso asse portano lo stesso nome, così
// la colonna e il radar d'asta parlano della stessa cosa invece di crearne due.

/** Il quarto asse ha UN NOME SOLO PER RUOLO e UNA COLONNA SOLA (decisione del
 *  committente, 2026-08-24): per i portieri la fonte lo chiama «No malus», per
 *  il movimento «Bonus». La chiave NON è l'id di nessun asse del contratto —
 *  è la chiave della colonna che li mostra tutti e due, uno per riga. */
export const NO_MALUS_BONUS_COLUMN_KEY = "pagella_no_malus_bonus";

/** I cinque voti /10, nell'ordine dell'elenco di Pico. */
export const EXPERT_VOTE_COLUMN_KEYS = [
  "pagella_titolarita",
  "pagella_media_voto",
  "pagella_salute",
  NO_MALUS_BONUS_COLUMN_KEY,
  "pagella_consiglio",
] as const;

export type ExpertVoteColumnKey = (typeof EXPERT_VOTE_COLUMN_KEYS)[number];

/** La scala dei cinque voti. Dichiarata una volta e detta a schermo nella nota
 *  sotto la tabella, perché su un telefono non esiste il passaggio del mouse. */
export const EXPERT_VOTE_MAX = PAGELLA_VOTO_MAX;

/**
 * I MARCATORI DELL'ASSE DI RUOLO — il secondo canale della colonna promiscua.
 *
 * Due lettere accanto al numero, non un colore: il colore da solo non
 * sopravvive a una stampa, a un daltonismo, né alla resa stretta in cui la
 * cella è larga quanto un pollice. Chi ordina «No Malus/Bonus» deve poter
 * vedere CHE COSA sta confrontando senza risalire al ruolo della riga.
 *
 * Le parole intere («Porta inviolata», «Bonus») stanno nel tooltip e nel
 * `title` della cella: nella cella non ci starebbero senza mangiarsi il
 * numero, che è il dato.
 */
export const ROLE_AXIS_MARKERS: Readonly<Record<string, string>> = {
  pagella_porta_inviolata: "PI",
  pagella_bonus: "BO",
};

// ── I TRE SEGNALI ORDINATI: RIGORI, PUNIZIONI, ANGOLI ───────────────────────
//
// ERANO DUE COLONNE, «Rigorista» e «Piazzati», e la seconda fondeva le due
// specialità in una cella sola («punizioni · angoli»). Da oggi sono TRE, e la
// ragione è nel dato: la fonte non pubblica insiemi, pubblica ELENCHI
// ORDINATI — chi tira per primo, chi per secondo (src/expertScheda.ts §rango).
//
// PERCHÉ DUE COLONNE E NON UNA CON DENTRO DUE NUMERI. «Punizioni 1° · angoli
// 3°» in una cella larga un pollice è una cella che si legge due volte: non si
// può ORDINARE per una delle due (una colonna sola ha un valore solo per riga,
// e ordinarla confronterebbe la punizione di uno con l'angolo di un altro), e
// nella resa stretta va a capo perdendo l'accoppiamento fra la parola e il suo
// numero. Due colonne rendono ciascuna fila ordinabile per il proprio rango,
// che è esattamente la domanda che Pico si fa davanti al listone: «di questi
// che restano, chi batte per primo?».
//
// PICO HA CHIESTO «LA COLONNA ANGOLI PIÙ TUTTI I DATI»: la colonna esiste, e
// «tutti i dati» è il rango accanto alla specialità — non un dato in più
// inventato per riempirla.
//
// LE UNDICI COLONNE DI DEFAULT DIVENTANO DODICI. L'elenco del 2026-08-24
// («…rigorista, piazzati») resta quello, con la sua ultima voce spaccata in
// due: nessuna colonna è sparita e nessuna è comparsa che non fosse già in
// quell'elenco sotto un altro nome. Misurato prima di scriverlo: a 390px la
// riga del listone NON cresce (la casella in più entra nella riga a capo che
// c'era già), quindi il libro mastro del budget verticale non cambia di un
// pixel — vedi src/ui/callScreenBudget.ts.
export const RIGORISTA_COLUMN_KEY = "scheda_rigorista";
export const PUNIZIONI_COLUMN_KEY = "scheda_punizioni";
export const ANGOLI_COLUMN_KEY = "scheda_angoli";

/**
 * Le otto colonne che NON vivono sulla riga del listone: i cinque voti e i
 * tre segnali di scheda. Il loro valore arriva dall'esterno, riga per riga
 * (vedi `ListoneRowSignals`), perché il deposito delle schede è un'altra
 * fonte con un'altra identità di aggancio — nome + squadra, non la riga.
 */
export const SIGNAL_COLUMN_KEYS: readonly string[] = [
  ...EXPERT_VOTE_COLUMN_KEYS,
  RIGORISTA_COLUMN_KEY,
  PUNIZIONI_COLUMN_KEY,
  ANGOLI_COLUMN_KEY,
];

/**
 * I SEGNALI DI UNA RIGA — ciò che la tabella mostra e che la riga di listone
 * non porta.
 *
 * UNA SORGENTE SOLA (decisione del committente, 2026-08-24): il DEPOSITO DELLE
 * SCHEDE. #33 aveva aperto una seconda strada — un campo `pagella` sulla riga
 * di listone — e due posti da cui leggere gli stessi cinque numeri sono due
 * posti che il giorno dopo dicono cose diverse. Il campo di riga è stato
 * tolto; il radar del riquadro d'asta legge già da qui
 * (`resolveExpertInsight`, src/expertScheda.ts), quindi tabella e radar non
 * possono più divergere su uno stesso giocatore.
 *
 * Le due etichette arrivano GIÀ TRADOTTE dal vocabolario chiuso delle schede
 * (`RIGORI_LABELS` / `PIAZZATI_LABELS` in src/ui/expertInsight.ts, costruite
 * su `RIGORI_VALUES` / `PIAZZATI_VALUES` di src/expertScheda.ts). Questo
 * modulo non traduce e non inventa parole: se una parola non è nel
 * vocabolario, non è arrivata da qui. È anche ciò che tiene questo file
 * fuori dal ciclo di import fra `expertScheda.ts` e `ui/listone.ts`.
 *
 * `pagella` è una VISTA GIÀ RISOLTA (`PagellaView`), non la forma depositata:
 * il quarto asse è già stato scelto in base al ruolo della riga, e un voto
 * dell'asse sbagliato è già stato rifiutato. Risolvere è lavoro del contratto,
 * non di chi disegna una tabella.
 */
export interface ListoneRowSignals {
  /**
   * LE TRE CELLE ORDINATE, COL SOLO POSTO IN FILA: «1», «2», «3», oppure `?`
   * quando la scheda dichiara la fila ma non il posto; `null` quando non
   * dichiara nemmeno la fila.
   *
   * Portavano la parola davanti — «1° designato», «2° battitore» — fino al
   * 2026-08-29: la specialità è già scritta nell'intestazione della colonna e
   * nel suo tooltip, quindi in cella la diceva due volte, su ogni riga di un
   * listone da cinquecento. Le altre superfici (la pastiglia del riquadro,
   * l'icona accanto al radar) continuano a scriverla con `conRango`, perché
   * là l'intestazione che la dichiara non esiste.
   *
   * Restano STRINGHE GIÀ COMPOSTE e non una coppia (parola, numero) da unire
   * qui: chi rende una tabella non decide come si scrive un posto in fila.
   */
  readonly rigori: string | null;
  readonly punizioni: string | null;
  readonly angoli: string | null;
  readonly pagella: PagellaView;
}

/** Nessun segnale, col quarto asse già nominato dal ruolo della riga: lo stato
 *  onesto quando il deposito delle schede non porta niente su questo giocatore. */
export function emptyRowSignals(role: Role | null = null): ListoneRowSignals {
  return { rigori: null, punizioni: null, angoli: null, pagella: pagellaVuota(role) };
}

export type ListoneRowSignalsLookup = (p: ListonePlayer) => ListoneRowSignals;

/** Il lookup di default — usato dai test e da ogni chiamante che non ha (o non
 *  vuole) il deposito delle schede: ogni riga senza segnali, ogni cella `n/d`. */
export const noRowSignals: ListoneRowSignalsLookup = (p) => emptyRowSignals(p.role);

/** Il testo di una casella che non ha un valore da mostrare. UNA SOLA
 *  costante, e viene dal contratto: `n/d` è una dichiarazione di assenza e
 *  deve leggersi identica nella tabella, nel riquadro d'asta e nel radar. */
export const VALUE_NOT_AVAILABLE = PAGELLA_ASSENTE;

/**
 * `n.a.` — «non si applica», che NON è `n/d`. Su questo #33 aveva ragione e la
 * distinzione resta (decisione del committente, 2026-08-24: «tienile
 * distinte»).
 *
 * Con una colonna sola il caso cambia forma ma non sparisce: non è più «questo
 * asse non esiste per questo ruolo» — la colonna promiscua mostra sempre
 * l'asse giusto — ma «la scheda porta il voto dell'ALTRO ruolo». Quel voto non
 * si applica a questa riga e non viene usato: `resolvePagella` lo rifiuta
 * (`asseIncoerente`) e la cella lo dice con questa parola invece di far
 * sparire il fatto dietro un `n/d` che vorrebbe dire «nessuno l'ha estratto».
 */
export const VALUE_NOT_APPLICABLE = PAGELLA_NON_APPLICABILE;

const CORE_KEYS = new Set(CORE_COLUMNS.map((c) => c.key));
CORE_KEYS.add("proxyId");
CORE_KEYS.add(APPEAL_INDEX_COLUMN_KEY);
// Le previsioni sono un campo STRUTTURATO della riga, non una colonna extra:
// senza questa riga `isListonePlayer` le vedrebbe come una cella con dentro un
// oggetto e rifiuterebbe ogni pool che le porta.
CORE_KEYS.add(GEN_FORECAST_FIELD);

// Gate OFF means local/static display data cannot create decision surfaces by
// choosing a suggestive extra-column name. Reject the whole pool fail-closed.
// Exported so the runtime listone endpoint's own copy of this list
// (packages/listone-live-serve/src/depositPayload.ts, which cannot import this
// DOM-bound module into a Worker bundle) can be asserted equal to it in tests
// instead of drifting from it silently.
export const LISTONE_GATED_EXTRA_KEYS: readonly string[] = [
  "ranking",
  "rank",
  "projection",
  "projection_score",
  "modifier",
  "target_band",
  "stretch_cap",
  "ftm",
  "fair_to_me",
  "fair_to_me_max",
  "fair_to_me_max_raw",
  "fair_to_me_max_effective",
];

const GATED_EXTRA_KEYS = new Set(LISTONE_GATED_EXTRA_KEYS);

/** Invisible formatting characters (zero-width space/joiner, soft hyphen, word
 *  joiner, BOM, bidi controls). They carry no glyph, so a key that contains
 *  them is the same key on screen as one that does not. */
const FORMAT_CHARACTERS = /\p{Cf}/gu;

/** Combining marks, stripped after NFD: `Età` → `eta`, `ŕanking` → `ranking`. */
const COMBINING_MARKS = /\p{M}/gu;

/** A letter or a digit that is not `[a-z0-9]` after all the folding above —
 *  i.e. a script this filter cannot map onto the alphabet the gated list is
 *  written in. Cyrillic `т` renders as an ASCII `t`, and no Unicode
 *  normalization form turns it into one. */
const UNMAPPABLE_ALPHANUMERIC = /(?![a-z0-9])[\p{L}\p{N}]/u;

/** Anything that is not `[a-z0-9]`, collapsed to a single `_`. */
const SEPARATOR_RUN = /[^a-z0-9]+/g;

/**
 * Reduces an extra-column key to the ASCII alphabet `LISTONE_GATED_EXTRA_KEYS`
 * is written in, or returns `null` when the key cannot be expressed in that
 * alphabet at all.
 *
 * Allowlist-oriented on purpose (issue #225). Stripping a fixed list of
 * separators at the edges only thinned the bypass class — `FTM_`, `_ftm`,
 * `Target _Band`, `FTM:`, `ftm/`, `FTM!` all walked past it, and so did every
 * invisible or look-alike character. What has to be closed is the alphabet:
 * after the folding below a key is either plain `[a-z0-9_]`, and comparable
 * against the list, or it is refused.
 *
 * Each step answers a bypass verified by running it, not by assuming it:
 *  1. NFKC folds the compatibility forms that render as ASCII — fullwidth
 *     `ＦＴＭ`, mathematical `𝐟𝐭𝐦`, NBSP and ideographic space. It does *not*
 *     touch zero-width characters or cross-script look-alikes, so it is
 *     necessary and nowhere near sufficient.
 *  2. Format characters are deleted outright: they are invisible.
 *  3. NFD + mark stripping folds accents, real ones and decorative ones.
 *  4. Whatever letter or digit is still not `[a-z0-9]` cannot be proven
 *     different from the gated key it imitates, so the key is refused instead
 *     of being declared safe because the comparison failed (`null`).
 *  5. Every run of remaining non-alphanumerics becomes one `_`, edges dropped —
 *     so separators, whatever and however many, stop changing the answer.
 *  6. If nothing survives that (`"   "`, `"..."`, `"___"`, an emoji, a lone
 *     surrogate), the key carries no comparable content and is refused too.
 *     Not a hole — no gated key is empty — but the guard is what makes the
 *     sentence above *true*: the answer is the alphabet or `null`, never `""`.
 *
 * Kept in sync, character for character, with `normalizedDepositExtraKey` in
 * packages/listone-live-serve/src/depositPayload.ts — see the note on
 * `LISTONE_DEPOSIT_GATED_EXTRA_KEYS` for why that copy exists, and
 * tests/depositPayload.test.ts for the assertions that keep the two equal.
 */
export function normalizedListoneExtraKey(key: string): string | null {
  const folded = key
    .normalize("NFKC")
    .replace(FORMAT_CHARACTERS, "")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase();
  if (UNMAPPABLE_ALPHANUMERIC.test(folded)) return null;
  const normalized = folded.replace(SEPARATOR_RUN, "_").replace(/^_+|_+$/g, "");
  return normalized === "" ? null : normalized;
}

/** True when the key must be refused: it is a gated decision field, or it is
 *  not expressible in the alphabet that list is written in and therefore
 *  cannot be shown to be anything else. */
export function isGatedListoneExtraKey(key: string): boolean {
  const normalized = normalizedListoneExtraKey(key);
  return normalized === null || GATED_EXTRA_KEYS.has(normalized);
}

/**
 * LE UNDICI COLONNE VISIBILI DI DEFAULT, nell'ordine chiesto da Pico il
 * 2026-08-24: nome, ruolo, squadra, indice di appetibilità, Titolarità, Media
 * Voto, Salute, No Malus/Bonus, Consiglio Esperti, rigorista, piazzati.
 *
 * ERANO QUATTRO (name, role, club, quotation) e la QUOTAZIONE non è più fra
 * loro. Non è stata tolta dal listone: è nascosta e riaccendibile dal pannello
 * «Colonne visibili», che è esattamente la scelta che Pico ha fatto quando gli
 * è stato chiesto che fine facessero le colonne fuori dall'elenco
 * («Nascondile, ma lasciale attivabili»).
 *
 * `appealIndex` è nell'elenco ma la sua colonna esiste solo quando il pool
 * porta davvero un indice — regola invariata, vedi `listoneColumns`: qui
 * cambia il POSTO che occupa quando c'è, non la condizione che la fa esistere.
 *
 * LE TRE PREVISIONI DEL MOTORE NON SONO IN QUESTO ELENCO, ed è una scelta
 * dichiarata e non una dimenticanza. L'elenco è di Pico (2026-08-24) e la
 * risposta sulle colonne fuori da esso è testuale: «Nascondile, ma lasciale
 * attivabili». Le tre colonne esistono quindi nel listone di un pool che porta
 * previsioni, al loro posto (subito dopo l'indice), spente finché non le si
 * accende dal pannello «Colonne visibili» — e la nota sotto la tabella dice che
 * ci sono. Accenderle di default sarebbe anche un cambio di altezza della riga
 * a 390px che nessuno ha ancora MISURATO su un pool con previsioni, e il libro
 * mastro del budget verticale (src/ui/callScreenBudget.ts) si aggiorna con una
 * misura, non con una stima.
 */
export const DEFAULT_VISIBLE_COLUMN_KEYS: readonly string[] = [
  ...IDENTITY_COLUMNS.map((c) => c.key),
  APPEAL_INDEX_COLUMN_KEY,
  ...SIGNAL_COLUMN_KEYS,
];

/**
 * Le colonne visibili di default PER QUESTO POOL: le undici qui sopra, meno
 * quelle che per questo pool non esistono affatto (oggi: l'indice, quando il
 * deposito non ne porta uno). Filtrare invece di enumerare i casi tiene una
 * regola sola quando le colonne condizionali diventeranno più di una.
 */
export function defaultVisibleColumnKeys(pool: readonly ListonePlayer[]): string[] {
  const existing = new Set(listoneColumns(pool).map((c) => c.key));
  return DEFAULT_VISIBLE_COLUMN_KEYS.filter((key) => existing.has(key));
}

/** The one clause that is true of every pool, whatever loaded it — so the
 *  remote and fallback notes below can never drift on the part that matters. */
const DISPLAY_ONLY_CLAUSE = "Solo visualizzazione, non usato dal motore decisionale.";

/** True only of a pool that carries no appeal index. Kept separate from the
 *  clause above precisely so it disappears when it stops being true, instead
 *  of denying on screen a column the same screen is showing. */
const NO_APPEAL_INDEX_CLAUSE = "Nessuna appetibilità calcolata.";

const FALLBACK_PREFIX =
  "Listone 2025/26 — fallback temporaneo caricato automaticamente (o caricato/sostituito manualmente).";

/** Fixed, honest note shown whenever a pool without an index is on screen — see LISTONE_UI_LOAD_CONTRACT.md. */
export const LISTONE_FALLBACK_NOTE = `${FALLBACK_PREFIX} ${DISPLAY_ONLY_CLAUSE} ${NO_APPEAL_INDEX_CLAUSE}`;

function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

function isCellValue(v: unknown): v is ListoneCellValue {
  return typeof v === "string" || typeof v === "number";
}

function isScaleValue(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100);
}

/**
 * Same fail-closed posture as the rest of this validator: an index without its
 * quality label or recipe version, or with a value outside 0–100, invalidates
 * the whole pool rather than being shown stripped of what qualifies it.
 */
function isAppealIndex(v: unknown): v is ListoneAppealIndex {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (!isScaleValue(o.score)) return false;
  if (typeof o.quality !== "string" || o.quality.trim() === "") return false;
  if (typeof o.recipe !== "string" || o.recipe.trim() === "") return false;
  if (typeof o.components !== "object" || o.components === null || Array.isArray(o.components)) return false;
  const components = o.components as Record<string, unknown>;
  const names = Object.keys(components);
  if (names.length === 0) return false;
  return names.every((name) => isScaleValue(components[name]));
}

/** Un numero servito: finito, e nient'altro. `NaN`/`Infinity` arriverebbero a
 *  schermo verbatim (o farebbero comparare l'incomparabile nell'ordinamento). */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** `null` oppure due estremi finiti col basso non sopra l'alto. Un intervallo
 *  rovesciato non è un intervallo stretto: è un dato sbagliato. */
function isGenForecastInterval(v: unknown): v is ListoneGenForecastInterval | null {
  if (v === null) return true;
  if (typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== "lo" && k !== "hi")) return false;
  if (!isFiniteNumber(o.lo) || !isFiniteNumber(o.hi)) return false;
  return o.lo <= o.hi;
}

/**
 * Un bersaglio, con la stessa postura fail-closed del resto del validatore: un
 * valore non finito, uno stato fuori vocabolario, un intervallo malformato o un
 * `capApplied` su un bersaglio che non è TN invalidano il POOL INTERO invece di
 * essere mostrati senza ciò che li qualifica.
 *
 * `capApplied` SOLO SU TN, e la simmetria è voluta: il campo dichiara il tetto
 * degli esperti (§D.10.2), che si applica alle presenze e a nient'altro.
 * Trovarlo su T2 o T1 significa che chi ha prodotto il payload sta parlando di
 * un'altra cosa, e questo modulo non è nella posizione di indovinare quale.
 */
function isGenForecastTarget(v: unknown, target: GenForecastTargetId): v is ListoneGenForecastTarget {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  // NIENTE CHIAVI SCONOSCIUTE QUI DENTRO, ed è l'unico posto del contratto in
  // cui l'ignoto è un rifiuto invece di un'omissione (vedi `isGenForecast`).
  // Una chiave in più su un BERSAGLIO qualifica un numero che questa superficie
  // mostra — un livello di copertura, un'unità, un troncamento — e mostrare il
  // numero senza il suo qualificatore è esattamente il difetto che questo
  // contratto esiste per non avere.
  if (Object.keys(o).some((k) => !GEN_FORECAST_TARGET_FIELDS.includes(k))) return false;
  if (!isFiniteNumber(o.value)) return false;
  if (!("interval" in o) || !isGenForecastInterval(o.interval)) return false;
  if (typeof o.status !== "string" || !GEN_FORECAST_STATUSES.includes(o.status)) return false;
  if (target === "TN") {
    if (o.capApplied !== undefined && typeof o.capApplied !== "boolean") return false;
  } else if (o.capApplied !== undefined) {
    return false;
  }
  return true;
}

/**
 * Le previsioni di una riga. Tutti e tre i bersagli o nessuno: `genForecast`
 * presente con due bersagli su tre è una previsione monca, e mostrarla come
 * completa sarebbe esattamente il difetto che questo contratto esiste per non
 * avere.
 *
 * L'autorità è controllata QUI e non alla resa: vedi
 * `GEN_FORECAST_AUTHORITY_ADVISORY` per perché il vocabolario è chiuso a una
 * parola sola.
 *
 * CIÒ CHE NON È RICONOSCIUTO SI IGNORA, e non è un cedimento: un campo in più
 * accanto a `runId`, o un quarto bersaglio dentro `targets`, è dato che questa
 * superficie non mostra — non un qualificatore di un numero che mostra. Non
 * entra nel pool (`copyGenForecast` ricompone campo per campo) e non fa
 * sparire il listone il giorno in cui il produttore aggiunge un bersaglio.
 * Dentro un bersaglio la regola si ribalta: lì l'ignoto è un rifiuto.
 */
function isGenForecast(v: unknown): v is ListoneGenForecast {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  for (const field of ["recipeVersion", "protocolVersion", "runId"] as const) {
    if (typeof o[field] !== "string" || (o[field] as string).trim() === "") return false;
  }
  if (o.authority !== GEN_FORECAST_AUTHORITY_ADVISORY) return false;
  if (typeof o.targets !== "object" || o.targets === null || Array.isArray(o.targets)) return false;
  const targets = o.targets as Record<string, unknown>;
  return GEN_FORECAST_TARGET_IDS.every((target) => isGenForecastTarget(targets[target], target));
}

/**
 * La copia campo per campo di una previsione già validata: solo ciò che questo
 * contratto nomina entra nel pool. `capApplied` resta un campo OPZIONALE e non
 * diventa `false` per comodità — «il tetto non è stato applicato» e «il dato
 * non lo dichiara» sono due frasi diverse, e la seconda non si trasforma nella
 * prima passando di qui.
 */
function copyGenForecast(forecast: ListoneGenForecast): ListoneGenForecast {
  const targets = Object.fromEntries(
    GEN_FORECAST_TARGET_IDS.map((id) => {
      const target = forecast.targets[id];
      return [
        id,
        {
          value: target.value,
          interval: target.interval === null ? null : { lo: target.interval.lo, hi: target.interval.hi },
          status: target.status,
          ...(target.capApplied !== undefined ? { capApplied: target.capApplied } : {}),
        },
      ];
    }),
  ) as Record<GenForecastTargetId, ListoneGenForecastTarget>;
  return {
    recipeVersion: forecast.recipeVersion,
    protocolVersion: forecast.protocolVersion,
    runId: forecast.runId,
    authority: forecast.authority,
    targets,
  };
}

/** La tripla che identifica il run che ha prodotto una previsione. Un pool è un
 *  run solo, quindi è una tripla sola — vedi il controllo in
 *  `validateListonePool`. */
function genForecastRunKey(forecast: ListoneGenForecast): string {
  return JSON.stringify([forecast.recipeVersion, forecast.protocolVersion, forecast.runId]);
}

function isListonePlayer(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.name !== "string" || o.name.trim() === "") return false;
  if (!isRole(o.role)) return false;
  if (typeof o.club !== "string" || o.club.trim() === "") return false;
  if (
    o.proxyId !== undefined &&
    !(
      (typeof o.proxyId === "string" && o.proxyId.trim() !== "") ||
      (typeof o.proxyId === "number" && Number.isFinite(o.proxyId))
    )
  ) return false;
  // Number.isFinite + non-negative: quotation is display-only but is sorted
  // and rendered as text, so an Infinity/NaN/-50 slipping through (validator
  // otherwise fail-closed everywhere else — see isScaleValue above for the
  // appeal index) shows up verbatim on screen (audit r2 D9, probe C').
  // No upper bound and no Number.isInteger requirement: decimal quotations
  // are ordinary listone data, unlike the 0-100 appeal-index scale.
  if (
    o.quotation !== undefined &&
    (typeof o.quotation !== "number" || !Number.isFinite(o.quotation) || o.quotation < 0)
  ) return false;
  if (o.appealIndex !== undefined && !isAppealIndex(o.appealIndex)) return false;
  if (o[GEN_FORECAST_FIELD] !== undefined && !isGenForecast(o[GEN_FORECAST_FIELD])) return false;
  for (const key of Object.keys(o)) {
    if (CORE_KEYS.has(key)) continue;
    if (isGatedListoneExtraKey(key)) return false;
    // Extra column: only plain string/number allowed — nothing structural
    // (object/array/null) sneaks into the table as a "column".
    if (!isCellValue(o[key])) return false;
  }
  return true;
}

/**
 * Validates arbitrary parsed JSON as a listone pool. Returns null (not a
 * throw) on any shape mismatch — defense-in-depth against untrusted local
 * file content, same posture as the engine's voteRecordValidation. Rejects
 * the whole list if a single item is malformed — no partial load.
 */
export type ListonePoolValidation =
  | { readonly ok: true; readonly pool: ListonePlayer[] }
  | {
      readonly ok: false;
      readonly reason:
        | "invalid-shape"
        | "gated-field"
        | "duplicate-identity"
        | "ambiguous-identity"
        | "inconsistent-appeal-index"
        | "inconsistent-gen-forecast"
        | "mixed-extra-column-type"
        | "mixed-identity-scheme";
      readonly identity?: string;
    };

export function validateListonePool(json: unknown): ListonePoolValidation {
  if (!Array.isArray(json)) return { ok: false, reason: "invalid-shape" };
  const out: ListonePlayer[] = [];
  for (const item of json) {
    if (typeof item === "object" && item !== null) {
      const gatedKey = Object.keys(item).find((key) => !CORE_KEYS.has(key) && isGatedListoneExtraKey(key));
      if (gatedKey) return { ok: false, reason: "gated-field", identity: gatedKey };
    }
    if (!isListonePlayer(item)) return { ok: false, reason: "invalid-shape" };
    const extraKeys = Object.keys(item).filter((k) => !CORE_KEYS.has(k));
    const player: ListonePlayer = {
      ...(item.proxyId !== undefined ? { proxyId: item.proxyId as string | number } : {}),
      name: item.name as string,
      role: item.role as Role,
      club: item.club as string,
      ...(item.quotation !== undefined ? { quotation: item.quotation as number } : {}),
      ...(item.appealIndex !== undefined ? { appealIndex: item.appealIndex as ListoneAppealIndex } : {}),
      // SOLO I CAMPI RICONOSCIUTI, ricomposti uno per uno invece di copiare
      // l'oggetto servito: ciò che `isGenForecast` ignora (un campo in più
      // accanto a `runId`, un quarto bersaglio) si ferma QUI. La riga che
      // finisce nel pool — e quindi in `localStorage`, e nella sessione di
      // domani — non trasporta nulla che questo file non abbia nominato.
      ...(item[GEN_FORECAST_FIELD] !== undefined
        ? { genForecast: copyGenForecast(item[GEN_FORECAST_FIELD] as ListoneGenForecast) }
        : {}),
      ...(extraKeys.length > 0
        ? { extra: Object.fromEntries(extraKeys.map((k) => [k, item[k] as ListoneCellValue])) }
        : {}),
    };
    out.push(player);
  }
  // One pool is one Factory run, so it is one recipe. Two versions in the same
  // pool mean rows from different runs were mixed, and the note under the
  // table could no longer name the recipe the column was computed with.
  const recipes = new Set(out.flatMap((p) => (p.appealIndex ? [p.appealIndex.recipe] : [])));
  if (recipes.size > 1) return { ok: false, reason: "inconsistent-appeal-index" };
  // Gemello del controllo qui sopra, sulle previsioni: un pool è UN run del
  // motore, quindi UNA tripla ricetta+protocollo+run. Due triple nello stesso
  // pool significano righe di run diversi mescolate, e la nota sotto la tabella
  // non potrebbe più nominare la ricetta con cui le colonne sono state
  // calcolate senza scegliere arbitrariamente una delle due.
  const runs = new Set(out.flatMap((p) => (p.genForecast ? [genForecastRunKey(p.genForecast)] : [])));
  if (runs.size > 1) return { ok: false, reason: "inconsistent-gen-forecast" };
  // listonePlayerKey uses proxy:<id> when a row carries proxyId, and
  // <name>__<club> otherwise: the SAME physical player represented once with
  // proxyId and once without resolves to two different keys, so neither the
  // duplicate-identity nor the ambiguous-identity check below ever sees them
  // as the same row (audit r2 D8, probe S/Q — reachable only via manual
  // loading, since neither the private deposit nor the shipped asset emits
  // proxyId). Reject the mixed scheme itself, fail-closed, rather than trying
  // to detect the collision after the fact.
  if (out.some((p) => p.proxyId !== undefined) && out.some((p) => p.proxyId === undefined)) {
    return { ok: false, reason: "mixed-identity-scheme" };
  }
  // isCellValue accepts a string OR a number per cell, so nothing stopped the
  // same extra-column key from carrying both types across different rows.
  // sortListonePool then compares numerically only when BOTH sides of a pair
  // are numbers, string-compares otherwise: a non-transitive, non-reversible
  // comparator on that column (audit r2 D10, probe U — '10','2',9,100,'9'
  // sorted neither numerically nor lexicographically, and desc-reversed !=
  // asc). Reject fail-closed here instead: a column present on this pool
  // stays one type for every row that has it, same posture as the recipe
  // check above.
  const extraKeyKinds = new Map<string, "string" | "number">();
  for (const player of out) {
    if (!player.extra) continue;
    for (const [key, value] of Object.entries(player.extra)) {
      const kind = typeof value === "number" ? "number" : "string";
      const seen = extraKeyKinds.get(key);
      if (seen === undefined) {
        extraKeyKinds.set(key, kind);
      } else if (seen !== kind) {
        return { ok: false, reason: "mixed-extra-column-type", identity: key };
      }
    }
  }
  const identities = new Map<string, ListonePlayer>();
  for (const player of out) {
    const identity = listonePlayerKey(player);
    const existing = identities.get(identity);
    if (existing) {
      return {
        ok: false,
        reason: player.proxyId === undefined && existing.proxyId === undefined
          ? "ambiguous-identity"
          : "duplicate-identity",
        identity,
      };
    }
    identities.set(identity, player);
  }
  return { ok: true, pool: out };
}

export function parseListonePool(json: unknown): ListonePlayer[] | null {
  const result = validateListonePool(json);
  return result.ok ? result.pool : null;
}

/**
 * Parses raw JSON text (e.g. a file's contents, or a localStorage value)
 * into a validated pool, or null on any failure (bad JSON, wrong shape).
 * Pure — no I/O, no throw — used both for the manual file loader and for
 * restoring a previously-saved pool on app boot (see main.ts).
 */
export function parseListoneJsonText(text: string): ListonePlayer[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return parseListonePool(parsed);
}

/**
 * Where the pool currently on screen came from. `"remote"` is the private
 * deposit served by GET /api/listone; `"manual"` is the debug/override file
 * picker and is never produced by `resolveListonePool` — only set by the
 * caller that handled the upload (see main.ts loadPoolFromText).
 */
export type ListonePoolSource = "remote" | "static" | "local-storage" | "manual" | "none";

export interface ResolveListonePoolInput {
  /** Raw JSON text served by GET /api/listone, or null if it failed/is unavailable. */
  readonly remoteJsonText: string | null;
  /** Raw JSON text fetched from the shipped static asset, or null if the fetch failed/hasn't happened. */
  readonly staticJsonText: string | null;
  /** Raw JSON text previously saved to localStorage, or null if nothing saved. */
  readonly localStorageText: string | null;
}

export interface ResolvedListonePool {
  readonly pool: ListonePlayer[];
  readonly source: ListonePoolSource;
}

/**
 * Decides which source populates the pool on boot (or after a "dimentica"
 * reset): the private deposit served by /api/listone wins whenever it parses,
 * then the shipped static asset, then a previously-saved localStorage copy,
 * and an empty pool (no error) is the last resort. A source that fails to
 * parse is skipped, not fatal — the next one down still gets its turn. Pure —
 * no fetch, no localStorage access — so it's unit-testable without a DOM or
 * network; see main.ts for the I/O that feeds it.
 *
 * A source that parses to ZERO rows is skipped exactly like one that fails to
 * parse — for every source, not just the deposit (audit round 2, finding 5).
 * `[]` is syntactically a valid pool and was therefore winning over the copy
 * below it: a degraded static asset (broken build/deploy) emptied the panel
 * AND, because main.ts persists whatever the automatic sources produced,
 * destroyed the last good offline copy — the one defence meant for auction
 * day. Zero rows is a broken pipeline anywhere it comes from, never "the
 * listone is empty today".
 */
export function resolveListonePool(input: ResolveListonePoolInput): ResolvedListonePool {
  if (input.remoteJsonText !== null) {
    const pool = parseListoneJsonText(input.remoteJsonText);
    // A deposit that parses to zero rows is a broken pipeline, not an empty
    // listone, and it is the source most able to go empty on its own between
    // two page loads — so it falls through to the shipped asset instead of
    // emptying the panel. GET /api/listone already refuses the same payload
    // upstream (`payload_empty`); this is the second half of that guard, for
    // any other way an empty body could reach here. The same clause now
    // guards the two sources below it, see this function's doc comment.
    if (pool && pool.length > 0) return { pool, source: "remote" };
  }
  if (input.staticJsonText !== null) {
    const pool = parseListoneJsonText(input.staticJsonText);
    if (pool && pool.length > 0) return { pool, source: "static" };
  }
  if (input.localStorageText !== null) {
    const pool = parseListoneJsonText(input.localStorageText);
    if (pool && pool.length > 0) return { pool, source: "local-storage" };
  }
  return { pool: [], source: "none" };
}

/**
 * "GG/MM/AAAA HH:MM" for a Drive `modifiedTime`, always read in Europe/Rome
 * (the timezone every schedule in this project is expressed in), or null when
 * there is no usable timestamp — the caller then drops the clause instead of
 * showing an invented or misleading date.
 *
 * The parts are assembled here rather than handed to `dateStyle`/`timeStyle`
 * on purpose: a formatted pattern varies with the ICU version bundled in the
 * host, numeric 2-digit parts do not. Same reasoning as
 * `compareNormalizedUnicode` in packages/xlsx-adapter/src/listoneCandidate.ts.
 */
export function formatListoneUpdatedAt(isoTimestamp: string | null): string | null {
  if (isoTimestamp === null || isoTimestamp.trim() === "") return null;
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = part("day");
  const month = part("month");
  const year = part("year");
  const hour = part("hour");
  const minute = part("minute");
  if (!day || !month || !year || !hour || !minute) return null;
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

/**
 * The note under the table, told from the source that actually produced the
 * rows on screen. Only a pool served by the private deposit says so; every
 * other source keeps the unchanged fallback wording, because the app still has
 * no way to tell which season a locally-loaded file represents.
 */
export function listoneSourceNote(
  source: ListonePoolSource,
  modifiedAt: string | null,
  hasAppealIndex: boolean = false,
): string {
  const tail = hasAppealIndex ? DISPLAY_ONLY_CLAUSE : `${DISPLAY_ONLY_CLAUSE} ${NO_APPEAL_INDEX_CLAUSE}`;
  if (source !== "remote") return `${FALLBACK_PREFIX} ${tail}`;
  const updatedAt = formatListoneUpdatedAt(modifiedAt);
  const freshness = updatedAt === null ? "" : ` (dati aggiornati al ${updatedAt})`;
  return `Listone aggiornato automaticamente dal deposito privato${freshness}. ${tail}`;
}

/**
 * The line that qualifies the "Indice" column, or `null` when the pool carries
 * no index at all (nothing to qualify, so no claim is made).
 *
 * Every substantive word comes from the rows: the recipe version and the
 * quality labels are the ones the Algorithm Factory computed beside each
 * score. The counts are just how many rows got a verdict and how many did not
 * — stated plainly so an empty-looking column is never mistaken for a broken
 * table.
 */
export function listoneAppealIndexNote(pool: readonly ListonePlayer[]): string | null {
  const indices = pool.flatMap((p) => (p.appealIndex ? [p.appealIndex] : []));
  if (indices.length === 0) return null;
  const recipes = [...new Set(indices.map((index) => index.recipe))].sort();
  const qualities = [...new Set(indices.map((index) => index.quality))].sort();
  const withVerdict = indices.filter((index) => index.score !== null).length;
  return (
    `Indice: ${qualities.join(" / ")} — ricetta ${recipes.join(" / ")}; ` +
    `${withVerdict} con verdetto, ${indices.length - withVerdict} n/d. ${DISPLAY_ONLY_CLAUSE}`
  );
}

/**
 * La riga che qualifica le tre colonne delle previsioni, `null` quando il pool
 * non ne porta nessuna (niente da qualificare, quindi nessuna affermazione).
 *
 * Gemella di `listoneAppealIndexNote`, e per la stessa ragione: ogni parola che
 * conta viene dalle righe — la versione della ricetta, quella del protocollo,
 * l'identificativo del run e l'AUTORITÀ, che è la parola con cui il dato stesso
 * dichiara di non essere direttivo. I conteggi sono solo quante righe hanno
 * avuto una previsione e quante no.
 *
 * DICE ANCHE DOVE SONO LE COLONNE. Le tre non sono accese di default (vedi
 * `DEFAULT_VISIBLE_COLUMN_KEYS`): una previsione che esiste e non si vede, con
 * nessuna riga che lo dica, sarebbe indistinguibile da una che non è arrivata.
 */
export function listoneGenForecastNote(pool: readonly ListonePlayer[]): string | null {
  const forecasts = pool.flatMap((p) => (p.genForecast ? [p.genForecast] : []));
  if (forecasts.length === 0) return null;
  // Il pool è già stato rifiutato se le triple divergono (`inconsistent-gen-
  // forecast`), quindi qui la prima riga parla per tutte. Resta un `[...new
  // Set()]` e non un `forecasts[0]` perché un pool costruito a mano nei test —
  // o il giorno in cui quel controllo cambiasse — deve far comparire la
  // divergenza nella nota, non nasconderla dietro la prima riga incontrata.
  const recipes = [...new Set(forecasts.map((f) => f.recipeVersion))].sort();
  const protocols = [...new Set(forecasts.map((f) => f.protocolVersion))].sort();
  const runs = [...new Set(forecasts.map((f) => f.runId))].sort();
  const authorities = [...new Set(forecasts.map((f) => f.authority))].sort();
  const capped = forecasts.filter((f) => f.targets.TN.capApplied === true).length;
  const fallback = forecasts.filter((f) =>
    GEN_FORECAST_TARGET_IDS.some((target) => f.targets[target].status !== "winner"),
  ).length;
  const labels = GEN_FORECAST_TARGET_IDS.map(
    (target) => `${GEN_FORECAST_COLUMN_LABELS[target]} (${target})`,
  ).join(", ");
  return (
    `Previsioni di ricerca — ${labels}: ${authorities.join(" / ")}, ricetta ` +
    `${recipes.join(" / ")}, protocollo ${protocols.join(" / ")}, run ${runs.join(" / ")}. ` +
    `${forecasts.length} righe con previsione, ${pool.length - forecasts.length} senza (${VALUE_NOT_AVAILABLE}). ` +
    `Presenze col tetto degli esperti applicato (${GEN_FORECAST_CAP_MARKER}): ${capped}. ` +
    `Righe con almeno un bersaglio non «winner»: ${fallback}. ` +
    `Le tre colonne si accendono dal pannello «Colonne visibili». ` +
    DISPLAY_ONLY_CLAUSE
  );
}

/**
 * LA RIGA CHE QUALIFICA LE SETTE COLONNE DEL GRUPPO ESPERTI — e che, finché i
 * voti non ci sono, DICE che non ci sono.
 *
 * Non torna mai `null`, ed è una differenza voluta rispetto alla nota
 * dell'indice qui sopra. Cinque colonne intere di `n/d` senza una riga che le
 * spieghi si leggono come una tabella rotta, non come un dato che manca — e
 * l'unico posto in cui l'assenza è scritta a parole, oggi, è questo. La
 * scala 0–10 sta qui e non solo nel tooltip per la stessa ragione: su un
 * telefono, dove il listone si legge davvero durante l'asta, il passaggio del
 * mouse non esiste.
 *
 * I CONTEGGI SONO DI #33 E RESTANO (portati sulla sorgente unica, 2026-08-24).
 * «Quante divergono dal TOTALE della fonte» è il numero che dice se
 * l'estrazione sta leggendo male; «quante portano l'asse di un altro ruolo» è
 * il numero che dice se sta leggendo la scheda del giocatore sbagliato. Sono
 * le due prove che il contratto della pagella si è procurato apposta, e
 * contarle a schermo è ciò che le rende utili invece che teoriche.
 *
 * PRENDE LE VISTE GIÀ RISOLTE e non il pool: risolvere costa (l'aggancio
 * nome+squadra sul deposito delle schede), e chi chiama sa se c'è qualcosa da
 * contare. Con l'elenco vuoto — cioè oggi, perché il deposito non porta
 * ancora nessuna pagella — non si sweepa niente e la riga dice l'assenza.
 */
export function listoneExpertSignalsNote(viste: readonly PagellaView[]): string {
  const conVoti = viste.filter((v) => v.votiPresenti > 0);
  if (conVoti.length === 0) {
    return (
      `Gruppo Esperti: i cinque voti (Titolarità, Media voto, Salute, No malus / Bonus, ` +
      `Consiglio esperti) sono su scala 0–${EXPERT_VOTE_MAX} e oggi NON sono ancora estratti: ` +
      `ogni casella dice «${VALUE_NOT_AVAILABLE}». Assenza dichiarata, mai uno zero. ` +
      NO_MALUS_BONUS_CLAUSE +
      PARERE_CLAUSE +
      SCHEDA_SIGNALS_CLAUSE +
      DISPLAY_ONLY_CLAUSE
    );
  }
  const complete = conVoti.filter((v) => v.completa).length;
  const parziali = conVoti.length - complete;
  const divergenti = conVoti.filter((v) => v.verificaTotale === "divergente").length;
  const incoerenti = conVoti.filter((v) => v.asseIncoerente).length;
  // I conteggi vanno DOPO la loro etichetta, non prima (regola di #33): «1
  // righe con pagella» è ciò che «numero + sostantivo» produce ogni volta che
  // il conteggio vale uno, e questa riga sta sotto la tabella che Pico guarda
  // durante l'asta. Con l'etichetta davanti la riga si legge uguale per 0, 1 e 200.
  return (
    `Gruppo Esperti: i cinque voti sono su scala 0–${EXPERT_VOTE_MAX}, scritti dalla fonte. ` +
    `Righe con voti: ${conVoti.length} — complete ${complete}, parziali ${parziali}. ` +
    `Righe in cui la somma dei cinque voti non coincide col TOTALE scritto ` +
    `sulla scheda — a schermo vale la somma: ${divergenti}. ` +
    `Righe la cui scheda porta l'asse di un altro ruolo (voto non usato, cella ` +
    `«${VALUE_NOT_APPLICABLE}»): ${incoerenti}. ` +
    NO_MALUS_BONUS_CLAUSE +
    PARERE_CLAUSE +
    SCHEDA_SIGNALS_CLAUSE +
    DISPLAY_ONLY_CLAUSE
  );
}

/**
 * «Consiglio esperti» è un PARERE, non una misura — clausola di #33, tenuta in
 * entrambi i rami della nota. Gli altri quattro assi provano a misurare
 * qualcosa del giocatore; il quinto è il giudizio di chi scrive la scheda, e
 * chi legge la tabella deve saperlo senza passare dal tooltip.
 */
const PARERE_CLAUSE =
  `«${PAGELLA_ETICHETTE.pagella_consiglio}» è un parere della fonte, non una misura, ` +
  "e non entra in nessun calcolo di questa applicazione. ";

/** Il quarto asse, spiegato una volta sola: la colonna è una, i marcatori due. */
const NO_MALUS_BONUS_CLAUSE =
  `«No malus / Bonus» è UNA colonna per DUE assi del contratto: «No malus / Porta inviolata» ` +
  `(${ROLE_AXIS_MARKERS.pagella_porta_inviolata}) per i portieri, «Bonus» ` +
  `(${ROLE_AXIS_MARKERS.pagella_bonus}) per il movimento. Ogni cella con un voto porta il ` +
  `marcatore dell'asse che sta mostrando, così ordinare la colonna dice sempre che cosa ` +
  `sta confrontando. ` +
  `«${VALUE_NOT_APPLICABLE}» = la scheda porta l'asse dell'altro ruolo e il voto non si usa; ` +
  `«${VALUE_NOT_AVAILABLE}» = l'asse è quello giusto e nessuno l'ha ancora estratto. `;

/** Rigorista e piazzati: riportano la scheda, e il silenzio non è un «no». */
const SCHEDA_SIGNALS_CLAUSE =
  `«Rigorista», «Punizioni» e «Angoli» riportano la scheda col POSTO NELLA FILA: «1» è il ` +
  `primo. «${RANGO_IGNOTO}» quando la scheda dichiara la fila e non il posto; ` +
  `«${VALUE_NOT_AVAILABLE}» quando non dichiara nemmeno la fila — che non significa che il ` +
  `giocatore non li calci. `;


/** Le due colonne delle specialità dicono la stessa cosa su due file diverse:
 *  una frase sola, con dentro la fila di cui parla. Due testi scritti a mano
 *  divergerebbero alla prima correzione, e il lettore leggerebbe due regole
 *  dove ce n'è una. */
const PIAZZATI_TOOLTIP = (specialita: string, di: string): string =>
  `Il POSTO NELLA FILA dei battitori ${di} secondo la scheda del Gruppo Esperti: «1» è il ` +
  `primo. «${RANGO_IGNOTO}» quando la scheda dichiara la specialità e non l'ordine. ` +
  `«${VALUE_NOT_AVAILABLE}» quando la scheda non nomina «${specialita}» fra i calci ` +
  `piazzati — non significa che non li batta.`;

const APPEAL_INDEX_COLUMN: ListoneColumn = {
  key: APPEAL_INDEX_COLUMN_KEY,
  label: "Indice",
  kind: "number",
  core: false,
};

/**
 * Le sette colonne che leggono i segnali di riga. Le etichette sono le parole
 * di Pico; il quarto asse porta ENTRAMBI i nomi di ruolo nell'intestazione
 * condivisa e uno solo — quello giusto — sulla riga (vedi
 * `listoneColumnLabelForRole`).
 */
const SIGNAL_COLUMNS: readonly ListoneColumn[] = [
  { key: "pagella_titolarita", label: "Titolarità", kind: "number", core: false },
  { key: "pagella_media_voto", label: "Media voto", kind: "number", core: false },
  { key: "pagella_salute", label: "Salute", kind: "number", core: false },
  { key: NO_MALUS_BONUS_COLUMN_KEY, label: "No malus / Bonus", kind: "number", core: false },
  { key: "pagella_consiglio", label: "Consiglio esperti", kind: "number", core: false },
  { key: RIGORISTA_COLUMN_KEY, label: "Rigorista", kind: "string", core: false },
  { key: PUNIZIONI_COLUMN_KEY, label: "Punizioni", kind: "string", core: false },
  { key: ANGOLI_COLUMN_KEY, label: "Angoli", kind: "string", core: false },
];

/** True when the served pool actually carries an index for at least one row. */
export function poolHasAppealIndex(pool: readonly ListonePlayer[]): boolean {
  return pool.some((p) => p.appealIndex !== undefined);
}

/** Gemella della funzione qui sopra: vero solo se ALMENO UNA riga porta le
 *  previsioni. Senza previsioni le tre colonne non esistono — tre colonne di
 *  `n/d` su un pool che non ne porta nessuna non direbbero niente a nessuno e
 *  costerebbero larghezza a una tabella che a 390px si legge già stretta. */
export function poolHasGenForecast(pool: readonly ListonePlayer[]): boolean {
  return pool.some((p) => p.genForecast !== undefined);
}

/**
 * Le tre colonne delle previsioni, nell'ordine dei bersagli.
 *
 * `kind: "number"` come l'indice: si ordinano numericamente sul VALORE SERVITO,
 * non sul testo arrotondato — l'arrotondamento avviene solo alla resa (vedi
 * `listoneCellText`), quindi due previsioni che a schermo dicono «24» restano
 * ordinate fra loro come il dato le distingue.
 */
const GEN_FORECAST_COLUMNS: readonly ListoneColumn[] = GEN_FORECAST_TARGET_IDS.map((target) => ({
  key: GEN_FORECAST_COLUMN_KEY_BY_TARGET[target],
  label: GEN_FORECAST_COLUMN_LABELS[target],
  kind: "number" as ColumnKind,
  core: false,
}));

/** Le chiavi che questo file calcola da sé. Una colonna extra del file
 *  caricato che portasse uno di questi nomi sarebbe una SECONDA colonna con
 *  la stessa chiave: due intestazioni identiche e un ordinamento ambiguo. */
const RESERVED_COLUMN_KEYS: ReadonlySet<string> = new Set([
  ...CORE_COLUMNS.map((c) => c.key),
  APPEAL_INDEX_COLUMN_KEY,
  ...GEN_FORECAST_COLUMN_KEYS,
  ...SIGNAL_COLUMN_KEYS,
  // I due assi di ruolo del contratto non sono colonne — la colonna che li
  // mostra è `pagella_no_malus_bonus` — ma una colonna extra del file caricato
  // che si chiamasse così si leggerebbe come un asse di pagella senza esserlo.
  ...PAGELLA_ASSI_DI_RUOLO,
]);

/**
 * L'elenco completo delle colonne di un pool, NELL'ORDINE IN CUI SI VEDONO —
 * che è quello dell'elenco di Pico (2026-08-24) e non più quello della forma
 * della riga:
 *
 *   nome, ruolo, squadra, [indice], [le tre previsioni], i cinque voti,
 *   rigorista, piazzati, quotazione, poi le colonne extra del file caricato
 *   (alfabetiche).
 *
 * L'ordine sta QUI e non nella lista delle colonne visibili apposta: una
 * colonna riaccesa dal pannello torna al suo posto invece di comparire in
 * fondo, e due utenti che accendono le stesse colonne vedono la stessa
 * tabella. La visibilità decide CHI si vede, mai DOVE.
 *
 * L'indice compare solo quando il pool ne porta uno: regola invariata, ed è la
 * stessa che vale per le tre previsioni del motore.
 * I sette segnali invece ci sono SEMPRE, perché la loro assenza è un dato —
 * `n/d` — e una colonna che sparisce non dice niente a nessuno.
 */
export function listoneColumns(pool: readonly ListonePlayer[]): ListoneColumn[] {
  const extraKeys = new Set<string>();
  for (const p of pool) {
    if (p.extra) for (const k of Object.keys(p.extra)) extraKeys.add(k);
  }
  const extraColumns: ListoneColumn[] = [...extraKeys]
    .filter((key) => !RESERVED_COLUMN_KEYS.has(key))
    .sort((a, b) => a.localeCompare(b, "it"))
    .map((key) => ({
      key,
      label: key,
      kind: inferExtraColumnKind(pool, key),
      core: false,
    }));
  return [
    ...IDENTITY_COLUMNS,
    ...(poolHasAppealIndex(pool) ? [APPEAL_INDEX_COLUMN] : []),
    // SUBITO DOPO L'INDICE, e come l'indice esistono solo se il pool le porta.
    // Il posto non è estetico: l'indice è la lettura sintetica del modello e le
    // tre previsioni sono le grandezze da cui quella lettura nasce, quindi si
    // leggono di seguito invece di essere separate dalle sette colonne del
    // Gruppo Esperti, che sono una fonte diversa.
    ...(poolHasGenForecast(pool) ? GEN_FORECAST_COLUMNS : []),
    ...SIGNAL_COLUMNS,
    QUOTATION_COLUMN,
    ...extraColumns,
  ];
}

/**
 * L'ETICHETTA DI UNA COLONNA PER UNA RIGA DI QUEL RUOLO — l'unico punto in cui
 * «No malus / Bonus» smette di essere due parole insieme.
 *
 * È UNA COLONNA SOLA (decisione dell'Executive, 2026-08-24) perché è UN VOTO
 * SOLO: la fonte lo chiama «No malus» sulla scheda di un portiere e «Bonus» su
 * quella di chiunque altro. L'intestazione della tabella li porta entrambi,
 * perché una colonna sopra righe di ruoli diversi non può scegliere; la
 * scheda stretta, dove ogni casella sta sotto la riga di UN giocatore, porta
 * la parola del suo ruolo e nient'altro. Nessuno dei due ruoli legge mai la
 * parola dell'altro sopra il proprio numero.
 */
export function listoneColumnLabelForRole(column: ListoneColumn, role: Role): string {
  if (column.key !== NO_MALUS_BONUS_COLUMN_KEY) return column.label;
  return role === "P" ? "No malus" : "Bonus";
}

function inferExtraColumnKind(pool: readonly ListonePlayer[], key: string): ColumnKind {
  for (const p of pool) {
    const v = p.extra?.[key];
    if (v !== undefined) return typeof v === "number" ? "number" : "string";
  }
  return "string";
}

/**
 * Le larghezze relative, condivise fra intestazione (views.ts) e righe.
 *
 * Contano SOLO nella resa larga: sotto i 900px la riga diventa una scheda a
 * griglia e questi rapporti non si applicano più (src/styles/listone.css).
 * Con undici colonne il nome resta il doppio di una colonna qualsiasi e i
 * cinque voti — una o due cifre — stanno stretti apposta, per lasciare
 * respiro a nome e squadra, che sono quelli che si leggono a colpo d'occhio.
 */
export function listoneColumnFlex(key: string): number {
  if (key === "name") return 2;
  if (key === "club") return 1.5;
  if (key === "role") return 0.8;
  if (key === APPEAL_INDEX_COLUMN_KEY) return 0.9;
  // Le tre previsioni: l'etichetta («Fantamedia prev.») è più lunga della
  // cifra, ed è l'etichetta a decidere la larghezza minima di queste colonne.
  if (GEN_FORECAST_COLUMN_KEYS.includes(key)) return 1.1;
  if ((EXPERT_VOTE_COLUMN_KEYS as readonly string[]).includes(key)) return 0.85;
  // I tre segnali ordinati portano ora UN CARATTERE SOLO — «1», «2», «3», «?»
  // (2026-08-29) — quindi la larghezza non la decide più il valore: la decide
  // l'INTESTAZIONE, che è la stringa più lunga delle due. «Rigorista» è più
  // larga di «Punizioni» e «Angoli», e per questo tiene il proprio 1.1: non è
  // il residuo della parola «designato» che stava in cella, è la parola che
  // sta ancora in testa alla colonna.
  if (key === RIGORISTA_COLUMN_KEY) return 1.1;
  if (key === PUNIZIONI_COLUMN_KEY || key === ANGOLI_COLUMN_KEY) return 1;
  if (key === "quotation") return 0.9;
  return 1;
}

// Extended meaning for column headers/filters, shown as a hover tooltip.
// These are standard, widely-used Fantacalcio glossary terms (the same
// abbreviations appear on effectively every Italian fantasy-football
// listone) — this documents what an abbreviation *means*, it does not
// redistribute the source's proprietary values or calculation method.
// Keyed by literal header text, same as the extra columns themselves (see
// docs/data/LISTONE_UI_LOAD_CONTRACT.md) — case/punctuation must match the
// source header exactly.
const COLUMN_TOOLTIPS: Readonly<Record<string, string>> = {
  name: "Nome del giocatore.",
  role: "Ruolo classico: P (portiere), D (difensore), C (centrocampista), A (attaccante).",
  club: "Squadra di appartenenza in Serie A.",
  quotation: "Qt.A — Quotazione Attuale: prezzo di listino per l'asta, stagione corrente.",
  "Id": "Identificativo numerico del giocatore nel listone sorgente.",
  "RM": "Ruolo Mantra: ruolo secondo lo schema \"Mantra\", più granulare del ruolo classico P/D/C/A.",
  "Qt.I": "Quotazione Iniziale: prezzo di listino di inizio della stagione di riferimento (prima degli aggiornamenti).",
  "Diff.": "Differenza tra Qt.A e Qt.I: variazione della quotazione classica nel corso della stagione.",
  "Qt.A M": "Quotazione Attuale Mantra: prezzo di listino attuale secondo lo schema Mantra.",
  "Qt.I M": "Quotazione Iniziale Mantra: prezzo di listino iniziale secondo lo schema Mantra.",
  "Diff.M": "Differenza Mantra tra Qt.A M e Qt.I M.",
  "FVM": "Fantavalore di Mercato: indice sintetico di rendimento/valore per il fantacalcio classico.",
  "FVM M": "Fantavalore di Mercato Mantra: lo stesso indice secondo lo schema Mantra.",
  [APPEAL_INDEX_COLUMN_KEY]:
    "Indice di appetibilità 0–100, percentile entro la coorte del proprio ruolo. " +
    "Etichetta di qualità e versione della ricetta nella nota sotto la tabella. " +
    "n/d quando il modello non ha un verdetto per quel giocatore.",
  [GEN_FORECAST_COLUMN_KEY_BY_TARGET.T2]:
    "Fantamedia PREVISTA (bersaglio T2) dal motore di ricerca, servita già calcolata. " +
    "Previsione advisory, non validata: non è un consiglio, non entra in nessun calcolo " +
    "di questa applicazione e non tocca il riquadro del valore. Arrotondata a un decimale " +
    "solo a schermo. n/d quando il deposito non serve una previsione per quel giocatore. " +
    "Ricetta, protocollo e run nella nota sotto la tabella.",
  [GEN_FORECAST_COLUMN_KEY_BY_TARGET.TN]:
    "Presenze PREVISTE (bersaglio TN) dal motore di ricerca, servite già calcolate. " +
    "Il marcatore «" +
    GEN_FORECAST_CAP_MARKER +
    "» accanto al numero dice che la previsione porta il tetto degli esperti già " +
    "applicato — lo dichiara il dato, non questa tabella. Previsione advisory, non " +
    "validata, fuori da ogni calcolo. Arrotondata all'intero solo a schermo. " +
    "n/d quando il deposito non serve una previsione per quel giocatore.",
  [GEN_FORECAST_COLUMN_KEY_BY_TARGET.T1]:
    "Totale PREVISTO (bersaglio T1, composto) dal motore di ricerca, servito già calcolato. " +
    "Previsione advisory, non validata: non è un consiglio e non entra in nessun calcolo " +
    "di questa applicazione. Arrotondato all'intero solo a schermo. " +
    "n/d quando il deposito non serve una previsione per quel giocatore.",
  // Le etichette NON portano il prefisso «GE» che #33 aveva introdotto: l'elenco
  // del committente (2026-08-24) nomina le colonne «Titolarità, Media Voto,
  // Salute, No Malus/Bonus, Consiglio Esperti» e quelle parole si vedono in
  // tabella. La collisione che il prefisso difendeva — «Titolarità» voto contro
  // la pastiglia «TITOLARITÀ» del riquadro d'asta — resta chiusa dove #33 l'ha
  // chiusa davvero: chiavi prefissate `pagella_*`, file separati, e l'etichetta
  // del CONTRATTO che resta «Titolarità (voto)» (PAGELLA_ETICHETTE). Qui la
  // prima riga del tooltip dice la differenza a parole.
  pagella_titolarita:
    `Voto di titolarità 0–${EXPERT_VOTE_MAX} scritto dal Gruppo Esperti. ` +
    "NON è la titolarità categorica (titolare / ballottaggio / riserva) del riquadro " +
    "INSIGHT GIOCATORE: quella è un'affermazione, questo è un voto su una scala.",
  pagella_media_voto: `Voto 0–${EXPERT_VOTE_MAX} sulla media voto attesa, scritto dal Gruppo Esperti.`,
  pagella_salute: `Voto 0–${EXPERT_VOTE_MAX} sulla salute e la tenuta fisica, scritto dal Gruppo Esperti.`,
  [NO_MALUS_BONUS_COLUMN_KEY]:
    `Voto 0–${EXPERT_VOTE_MAX} del Gruppo Esperti sul QUARTO ASSE, che dipende dal ruolo: ` +
    `«${PAGELLA_ETICHETTE.pagella_porta_inviolata}» (No malus) per i portieri, marcatore ` +
    `${ROLE_AXIS_MARKERS.pagella_porta_inviolata}; «${PAGELLA_ETICHETTE.pagella_bonus}» per il ` +
    `movimento, marcatore ${ROLE_AXIS_MARKERS.pagella_bonus}. ` +
    "UNA colonna sola per decisione del committente (2026-08-24): sono due grandezze diverse " +
    "nello stesso posto della riga, e ogni cella dichiara con il marcatore quale delle due " +
    "sta mostrando — ordinare la colonna resta quindi leggibile invece di confrontare in " +
    "silenzio la porta inviolata di un portiere col bonus di un attaccante. " +
    `«${VALUE_NOT_APPLICABLE}» quando la scheda porta l'asse dell'ALTRO ruolo: quel voto non ` +
    `si applica a questa riga e non viene usato. «${VALUE_NOT_AVAILABLE}» quando l'asse è ` +
    "quello giusto e nessuno l'ha ancora estratto.",
  pagella_consiglio:
    `Voto 0–${EXPERT_VOTE_MAX} del «Consiglio Esperti», scritto dal Gruppo Esperti: è un PARERE ` +
    "della fonte, non una misura, e non entra in nessun calcolo di questa applicazione.",
  [RIGORISTA_COLUMN_KEY]:
    "Il POSTO NELLA FILA dei rigoristi come lo dichiara la scheda del Gruppo Esperti: «1» è il " +
    `primo rigorista. «${RANGO_IGNOTO}» quando la scheda lo dà fra i rigoristi senza dire in che ` +
    "ordine — è il caso del «rigorista possibile». " +
    "n/d quando la scheda non lo dice affatto — non significa che non li tiri.",
  [PUNIZIONI_COLUMN_KEY]: PIAZZATI_TOOLTIP("punizioni", "delle punizioni"),
  [ANGOLI_COLUMN_KEY]: PIAZZATI_TOOLTIP("angoli", "degli angoli"),
};

/**
 * Extended, hover-friendly description of a column's meaning — used for
 * both the sortable table header and the column-visibility checkboxes, so
 * the two always say the same thing about the same key. Falls back to the
 * column's own label for any key without a known mapping (e.g. an extra
 * column this file has never seen before) rather than showing nothing.
 */
export function listoneColumnTooltip(column: ListoneColumn): string {
  return COLUMN_TOOLTIPS[column.key] ?? `${column.label} — colonna aggiuntiva dal file caricato.`;
}

/**
 * Accent- and case-folding normalizer for a human-typed name fragment.
 *
 * Exported because every reader of a human-typed name — the listone search
 * bar (`filterListonePool`) above all — must fold it with EXACTLY the same
 * rules used to build `listonePlayerKey` below. Two normalizers that drift
 * apart would mean a search that matches a row the log then records under a
 * different identity \u2014 so there is one function, not a copy.
 *
 * Every run of non-alphanumeric characters collapses to a single `-`, which
 * makes the output safe to use for `startsWith`/`includes` matching on
 * multi-word input: `"de bruyne"` and `"de-bruyne"` fold to the same string.
 */
export function normalizeIdentityPart(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Stable identity for a listone row — accent/case-insensitive name+club pair.
 * Doubles as the auction log's `playerId` (see main.ts doAssign) so a
 * purchase recorded from a listone click can always be matched back to that
 * same row later (the "Assegnato" flag below), independent of timestamps.
 */
export function listonePlayerKey(p: { readonly proxyId?: string | number; readonly name: string; readonly club: string }): string {
  if (p.proxyId !== undefined) return `proxy:${String(p.proxyId)}`;
  return `${normalizeIdentityPart(p.name)}__${normalizeIdentityPart(p.club)}`;
}

/**
 * Best-effort name recovered straight from a playerId that no longer matches
 * any loaded pool row (listone reloaded/changed since the purchase, or a
 * pre-existing log entry from before playerId was name+club-based). Prefer
 * resolvePlayerDisplayName below whenever a pool is available.
 */
export function legacyPlayerIdDisplayName(playerId: string): string {
  const sep = playerId.indexOf("__");
  const namePart = sep === -1 ? playerId.replace(/-\d+$/, "") : playerId.slice(0, sep);
  const spaced = namePart.replace(/-+/g, " ").trim();
  return spaced || playerId;
}

/**
 * A pool indexed by `listonePlayerKey` — the single structure every
 * playerId → row lookup goes through.
 *
 * It exists because the lookup used to be a linear `pool.find` that
 * recomputed `listonePlayerKey` (NFD normalize + 3 regex) for every row it
 * walked: one full-listone scan per resolved id. With a complete auction
 * (224 standing purchases) and a real listone (532 rows) the STORICO panel
 * alone did ~119k normalizations per render — and render() rebuilds the whole
 * DOM on every keystroke of the player search, so the critical path of a call
 * degraded to ~140 ms per keystroke exactly when the log was longest (audit
 * round 2, finding 2). Building this once per render turns that into one
 * O(pool) pass plus O(1) lookups.
 *
 * CHE COSA È DAVVERO GARANTITO DA UN TEST, E CHE COSA NO. La frase qui sopra
 * ha due metà con due statuti diversi, e tenerle separate è il punto:
 *   - «una passata O(pool)» — GARANTITA, e contata: `src/ui/listone.test.ts`
 *     §"resolves a whole panel of ids with ONE key computation per pool row"
 *     conta le applicazioni di `listonePlayerKey` riga per riga (getter su
 *     `proxyId`) e pretende ESATTAMENTE `pool.length`. È un'uguaglianza, non
 *     una soglia: una sola chiave in più la fa fallire. Ha sostituito
 *     un'asserzione cronometrata che lasciava passare un degrado di otto
 *     volte — vedi il commento in testa a quel describe.
 *   - «una volta per render» — NON garantita da nessun test: è una proprietà
 *     dei CALL SITE, non di questa funzione. Dove il pannello riceve l'indice
 *     già costruito (`warBoardFullHtml`, `renderWarBoardFull`,
 *     `renderRoseCard`) la firma stessa lo impone e non c'è niente da
 *     provare; dove lo costruisce da sé sono OTTO call site, enumerati in due
 *     passi: `grep -rn 'listonePoolIndex('` per le chiamate dirette, poi
 *     `grep -rn 'auctionDisplayIndex('` per i call site del wrapper (riga
 *     1350) — non tre: `src/main.ts:926`
 *     (`poolOrphanNotice`), `:1581` (`nominationContextTopAssigned`), `:2878`
 *     (`renderRiconfermeSettings`), `:3146` (`schedaRowTarget` — un indice
 *     O(pool) intero costruito per un solo `.get()`: debito reale, non una
 *     regressione di questa PR), `:4287` (`renderTableDetail`, STORICO),
 *     `:5410` e `:5469` (entrambi dentro `renderZona4`), più
 *     `src/ui/views.ts:1448` (`renderRoseScreen`). Restano tutti scoperti,
 *     perché vivono in `src/main.ts`, che esegue `render()` e
 *     `window.addEventListener` all'import e non è importabile in un test;
 *     `views.ts:1448` costruisce DOM. Ricostruire questo
 *     indice dentro il ciclo di render, una volta per id invece che una per
 *     pannello, oggi non farebbe fallire niente.
 *
 * Duplicate keys keep `pool.find`'s answer — the FIRST row wins — so this is
 * a drop-in for the scan it replaces. (`validateListonePool` already refuses
 * a pool with two rows on the same identity, so this is a tie-break that
 * should never be needed, not a supported shape.)
 */
export function listonePoolIndex(pool: readonly ListonePlayer[]): Map<string, ListonePlayer> {
  const index = new Map<string, ListonePlayer>();
  for (const p of pool) {
    const key = listonePlayerKey(p);
    if (!index.has(key)) index.set(key, p);
  }
  return index;
}

/**
 * Resolves an event log playerId back to a display name, preferring the
 * real (correctly cased) name from the currently-loaded pool when a row's
 * key still matches, falling back to a reconstruction from the id itself
 * otherwise. Used by Storico/Rose so purchased players show their real
 * name, not a re-derived slug.
 *
 * Takes the pool's index (see `listonePoolIndex`), not the pool: resolving a
 * whole panel's worth of ids is the hot path, and the caller builds the index
 * once for all of them.
 */
export function resolvePlayerDisplayName(
  playerId: string,
  poolIndex: ReadonlyMap<string, ListonePlayer>,
): string {
  const match = poolIndex.get(playerId);
  return match ? match.name : legacyPlayerIdDisplayName(playerId);
}

/**
 * The playerIds among `playerIds` that no row of the indexed pool carries —
 * i.e. purchases in the standing log whose identity the listone currently on
 * screen cannot account for.
 *
 * The event log's `playerId` IS a `listonePlayerKey` (see above), so it is
 * only as stable as the pool that produced it: swap the pool for one that
 * spells a name differently, or serves a different season, and every id
 * already written becomes an orphan — the player is shown as free, is
 * clickable again, and the engine accepts the second purchase because
 * `duplicate-player` compares playerIds, not physical players (audit round 2,
 * finding 1). This is the detector that lets the caller refuse or announce
 * that substitution instead of performing it in silence.
 *
 * Order-preserving and de-duplicated, so the caller can name the orphans in
 * the order they were bought.
 */
export function orphanPlayerIds(
  playerIds: readonly string[],
  poolIndex: ReadonlyMap<string, ListonePlayer>,
): string[] {
  const seen = new Set<string>();
  const orphans: string[] = [];
  for (const id of playerIds) {
    if (seen.has(id) || poolIndex.has(id)) continue;
    seen.add(id);
    orphans.push(id);
  }
  return orphans;
}

export type ListoneStatusFilter = "available" | "assigned" | "all";

export interface ListoneSearchFilter {
  readonly text: string;
  readonly role: Role | "";
  readonly club: string;
  readonly status: ListoneStatusFilter;
}

/**
 * Single source of truth for what the listone table displays: the search
 * bar (name substring + role + club — same fields driving "Ricerca
 * giocatore") plus the Assegnato status filter. `assignedKeys` are
 * listonePlayerKey values derived from the auction log's purchased players
 * (see main.ts), never the engine's raw playerId format directly.
 */
export function filterListonePool(
  pool: readonly ListonePlayer[],
  filter: ListoneSearchFilter,
  assignedKeys: ReadonlySet<string>,
): ListonePlayer[] {
  // Same fold used to build listonePlayerKey (normalizeIdentityPart):
  // otherwise a name typed without its accent — exactly what's typed hearing
  // it called — would miss in this search bar even though the row it names is
  // right there (audit r2 D6).
  // Applied to BOTH sides: normalizeIdentityPart also collapses separators to
  // "-", so a name-side-only fold would break multi-word queries like
  // "de sintetis" against a name folded to "de-sintetis".
  const q = normalizeIdentityPart(filter.text.trim());
  return pool.filter((p) => {
    if (q && !normalizeIdentityPart(p.name).includes(q)) return false;
    if (filter.role && p.role !== filter.role) return false;
    if (filter.club && p.club !== filter.club) return false;
    const isAssigned = assignedKeys.has(listonePlayerKey(p));
    if (filter.status === "available") return !isAssigned;
    if (filter.status === "assigned") return isAssigned;
    return true; // "all"
  });
}

/** Rows shown per page in the listone table. */
export const LISTONE_PAGE_SIZE = 10;

export interface ListonePage {
  readonly items: ListonePlayer[];
  /** 1-indexed, clamped to [1, totalPages]. */
  readonly page: number;
  /** Always >= 1, even for an empty pool. */
  readonly totalPages: number;
}

/**
 * Slices an already-sorted/filtered pool into one page. Pure — no state,
 * no DOM — so paging composes cleanly with sortListonePool upstream
 * (sort first, then paginate the result) without this function needing to
 * know anything about sorting. An out-of-range page (e.g. the pool shrank
 * after a reload) is clamped rather than returning an empty page.
 */
export function paginateListonePool(
  pool: readonly ListonePlayer[],
  page: number,
  pageSize: number = LISTONE_PAGE_SIZE,
): ListonePage {
  const totalPages = Math.max(1, Math.ceil(pool.length / pageSize));
  const clampedPage = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const start = (clampedPage - 1) * pageSize;
  return { items: pool.slice(start, start + pageSize), page: clampedPage, totalPages };
}

/**
 * Il valore ORDINABILE di una casella. `signals` porta ciò che la riga non ha:
 * i cinque voti e i due segnali di scheda. Il default `noRowSignals` non è una
 * comodità — è la postura fail-closed di questo file: chi non ha il deposito
 * delle schede non ottiene numeri, ottiene `undefined`, che si rende `n/d` e
 * finisce in fondo all'ordinamento in entrambe le direzioni.
 */
export function listoneCellValue(
  p: ListonePlayer,
  columnKey: string,
  signals: ListoneRowSignalsLookup = noRowSignals,
): ListoneCellValue | undefined {
  switch (columnKey) {
    case "name":
      return p.name;
    case "role":
      return p.role;
    case "club":
      return p.club;
    case "quotation":
      return p.quotation;
    case APPEAL_INDEX_COLUMN_KEY:
      // A withheld verdict has no value to compare: `undefined` sorts last in
      // both directions, exactly like a missing cell, and renders `n/d`.
      return p.appealIndex?.score ?? undefined;
    case GEN_FORECAST_COLUMN_KEY_BY_TARGET.T2:
    case GEN_FORECAST_COLUMN_KEY_BY_TARGET.TN:
    case GEN_FORECAST_COLUMN_KEY_BY_TARGET.T1:
      // IL VALORE SERVITO, non quello arrotondato: l'arrotondamento è una
      // scelta di resa (`listoneCellText`) e non deve fondere in un pareggio
      // due previsioni che il dato distingue. Una riga senza previsione è
      // `undefined`, come una cella che non c'è: `n/d` a schermo, ultima in
      // entrambe le direzioni dell'ordinamento.
      return genForecastTarget(p, columnKey)?.value ?? undefined;
    // I TRE SEGNALI ORDINATI. Il valore è la stringa già composta col rango
    // davanti («1° designato»), e questo rende l'ORDINAMENTO ALFABETICO della
    // colonna l'ordine della fila: `1°…` prima di `2°…`, e le celle senza
    // rango — che cominciano con una lettera — dopo tutte quelle che ce l'hanno,
    // prima delle `n/d`, che sono `undefined` e finiscono sempre in fondo. Non
    // è un effetto collaterale fortunato: è la ragione per cui il numero sta
    // davanti e non in coda (vedi `conRango`, src/ui/schedaLabels.ts).
    case RIGORISTA_COLUMN_KEY:
      return signals(p).rigori ?? undefined;
    case PUNIZIONI_COLUMN_KEY:
      return signals(p).punizioni ?? undefined;
    case ANGOLI_COLUMN_KEY:
      return signals(p).angoli ?? undefined;
    default:
      if ((EXPERT_VOTE_COLUMN_KEYS as readonly string[]).includes(columnKey)) {
        return expertVoteAxis(p, columnKey, signals)?.voto ?? undefined;
      }
      return p.extra?.[columnKey];
  }
}

/** Il bersaglio che una delle tre colonne mostra su QUESTA riga, `undefined`
 *  quando la colonna non è una delle tre o la riga non porta previsioni. */
function genForecastTarget(
  p: ListonePlayer,
  columnKey: string,
): ListoneGenForecastTarget | undefined {
  const target = GEN_FORECAST_TARGET_BY_COLUMN_KEY.get(columnKey);
  return target === undefined ? undefined : p.genForecast?.targets[target];
}

/**
 * IL TESTO DI UNA PREVISIONE, arrotondato QUI E SOLO QUI.
 *
 * Un decimale per la fantamedia — è un voto, e il decimo è la differenza fra
 * un titolare da 6,4 e uno da 6,0 — e l'intero per presenze e totale, che sono
 * conteggi: mostrare «24,1 presenze» prometterebbe una precisione che una
 * previsione di partite giocate non ha.
 *
 * La virgola decimale viene da `formatDecimal1` (src/ui/liveFacts.ts), che è
 * già la formattazione italiana deterministica di questo repository: una
 * funzione, non una terza copia con un `toFixed` scritto a mano.
 */
export function genForecastValueText(target: GenForecastTargetId, value: number): string {
  return target === "T2" ? formatDecimal1(value) : String(Math.round(value));
}

/**
 * L'ASSE DEL CONTRATTO che una colonna di voto mostra su QUESTA riga.
 *
 * Per i quattro assi comuni è una corrispondenza uno a uno. Per la colonna
 * promiscua «No Malus/Bonus» è il quarto asse — quello che `resolvePagella` ha
 * già scelto dal ruolo della riga — e si trova per `dipendeDalRuolo`, non per
 * posizione: l'ordine degli assi è quello della fonte e non un indice su cui
 * appoggiarsi.
 */
function expertVoteAxis(
  p: ListonePlayer,
  columnKey: string,
  signals: ListoneRowSignalsLookup,
): PagellaAsseView | undefined {
  const { assi } = signals(p).pagella;
  if (columnKey === NO_MALUS_BONUS_COLUMN_KEY) return assi.find((a) => a.dipendeDalRuolo);
  return assi.find((a) => a.asse === (columnKey as PagellaAsse));
}

/**
 * IL MARCATORE DELL'ASSE — il secondo canale della colonna promiscua, e
 * `null` per ogni altra colonna.
 *
 * Compare SOLO quando la cella porta davvero un voto. Su una cella `n/d` non
 * aggiungerebbe niente di vero — non c'è nessun numero di cui dire da quale
 * asse viene — e oggi, che ogni cella è `n/d`, riempirebbe la colonna di
 * sigle senza dati accanto.
 */
/** L'asse per esteso, per il `title` del marcatore: la sigla da sola è un
 *  secondo canale, non un indovinello. */
export function expertVoteAxisTitle(
  p: ListonePlayer,
  columnKey: string,
  signals: ListoneRowSignalsLookup = noRowSignals,
): string {
  const axis = expertVoteAxis(p, columnKey, signals);
  return axis?.asse === null || axis === undefined ? "" : PAGELLA_ETICHETTE[axis.asse];
}

/**
 * Vero SOLO sulla colonna delle presenze previste, e solo quando il dato
 * dichiara il tetto applicato. Esportata perché la riga d'insight della
 * schermata d'asta dice lo stesso fatto a parole invece che col segno, e le due
 * superfici devono leggere la stessa condizione.
 */
export function genForecastCapApplied(p: ListonePlayer, columnKey: string): boolean {
  return genForecastTarget(p, columnKey)?.capApplied === true;
}

export function expertVoteAxisMarker(
  p: ListonePlayer,
  columnKey: string,
  signals: ListoneRowSignalsLookup = noRowSignals,
): string | null {
  if (columnKey !== NO_MALUS_BONUS_COLUMN_KEY) return null;
  const axis = expertVoteAxis(p, columnKey, signals);
  if (axis === undefined || axis.voto === null || axis.asse === null) return null;
  return ROLE_AXIS_MARKERS[axis.asse] ?? null;
}

/**
 * IL TESTO DI UNA CASELLA, cioè dove `undefined` smette di essere una cosa
 * sola e torna a essere quello che è per quella colonna.
 *
 *  - le sette colonne di segnale e l'indice dicono `n/d`: il dato ESISTE come
 *    domanda e nessuno ha ancora scritto la risposta. Mai `0`, mai una media,
 *    mai un trattino che si legge come «zero bonus»;
 *  - la colonna del quarto asse dice `n.a.` in UN caso solo, e non è lo stesso
 *    `n/d`: la scheda porta il voto dell'ALTRO ruolo. `resolvePagella` non lo
 *    usa (`asseIncoerente`), e la cella lo dichiara invece di far sparire il
 *    fatto dietro un «non estratto»;
 *  - una colonna del file caricato che non ha valore su questa riga tiene il
 *    trattino di sempre: lì il buco è del file, e non c'è nessuna fonte a cui
 *    attribuirlo.
 */
export function listoneCellText(
  p: ListonePlayer,
  columnKey: string,
  signals: ListoneRowSignalsLookup = noRowSignals,
): string {
  const value = listoneCellValue(p, columnKey, signals);
  if (columnKey === APPEAL_INDEX_COLUMN_KEY) {
    // Rounding happens here and nowhere else: the served score keeps its full
    // precision (Phase 5 `roundingPoint: "render_only"`).
    return typeof value === "number" ? String(Math.round(value)) : VALUE_NOT_AVAILABLE;
  }
  const forecastTarget = GEN_FORECAST_TARGET_BY_COLUMN_KEY.get(columnKey);
  if (forecastTarget !== undefined) {
    // Stessa regola dell'indice: si arrotonda alla resa e mai nel dato. La
    // cifra e basta — il marcatore del tetto è un ELEMENTO che
    // `listoneCellHtml` aggiunge accanto (due canali, vedi `cellMarkerHtml`),
    // così questa stringa resta ciò che si ordina e ciò che un'asserzione di
    // assenza confronta.
    return typeof value === "number" ? genForecastValueText(forecastTarget, value) : VALUE_NOT_AVAILABLE;
  }
  if (columnKey === NO_MALUS_BONUS_COLUMN_KEY && value === undefined) {
    return signals(p).pagella.asseIncoerente ? VALUE_NOT_APPLICABLE : VALUE_NOT_AVAILABLE;
  }
  if (SIGNAL_COLUMN_KEYS.includes(columnKey)) {
    return value === undefined ? VALUE_NOT_AVAILABLE : String(value);
  }
  return value === undefined ? "—" : String(value);
}

/**
 * Sorts a pool by one column, returning a new array (never mutates).
 * Numbers compare numerically, everything else compares as a string
 * (Italian locale). Missing values always sort last, in either direction.
 */
export function sortListonePool(
  pool: readonly ListonePlayer[],
  columnKey: string,
  direction: SortDirection,
  signals: ListoneRowSignalsLookup = noRowSignals,
): ListonePlayer[] {
  return [...pool].sort((a, b) => {
    const va = listoneCellValue(a, columnKey, signals);
    const vb = listoneCellValue(b, columnKey, signals);
    if (va === undefined && vb === undefined) return 0;
    if (va === undefined) return 1;
    if (vb === undefined) return -1;
    const cmp =
      typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "it");
    return direction === "asc" ? cmp : -cmp;
  });
}

/** Header label with a sort indicator when this column is the active sort key. */
export function listoneColumnHeaderLabel(column: ListoneColumn, sort: ListoneSort | null): string {
  if (!sort || sort.key !== column.key) return column.label;
  return `${column.label} ${sort.direction === "asc" ? "▲" : "▼"}`;
}

/**
 * Pure row HTML for the given (already-filtered/ordered) visible columns —
 * kept separate from DOM construction so it is unit-testable without a
 * DOM environment (this project has no jsdom/happy-dom test setup — same
 * pattern as roleChipHtml/renderRoleChip in theme.ts). `isAssigned` adds a
 * small "Assegnato" badge next to the name — defaults to false so existing
 * callers/tests that never pass it keep their prior output.
 */
export function listoneRowHtml(
  p: ListonePlayer,
  columns: readonly ListoneColumn[],
  isAssigned: boolean = false,
  signals: ListoneRowSignalsLookup = noRowSignals,
): string {
  return columns.map((col) => listoneCellHtml(p, col, isAssigned, signals)).join("");
}

/**
 * L'attributo che porta l'intestazione DENTRO la casella.
 *
 * Sotto i 900px la tabella non è più una tabella: l'intestazione a undici
 * colonne non esiste e ogni casella si porta la propria etichetta, disegnata
 * da `content: attr(data-label)` (src/styles/listone.css). Non è una copia
 * decorativa — è l'unico posto in cui, su un telefono, si legge di che
 * grandezza è quel numero, e per questo l'etichetta è quella del RUOLO DELLA
 * RIGA, non quella condivisa dell'intestazione.
 */
function cellAttributes(p: ListonePlayer, col: ListoneColumn): string {
  return (
    ` data-col="${escHtml(col.key)}" data-label="${escHtml(listoneColumnLabelForRole(col, p.role))}"` +
    ` style="--col-flex:${listoneColumnFlex(col.key)};"`
  );
}

/**
 * IL MARCATORE, IN DUE CANALI CHE NON SI SOSTITUISCONO.
 *
 * ERA UNO `<span title="…">` E BASTA, ed è il difetto che questa funzione
 * chiude (debito dichiarato di #41): un `title` su un elemento non focusabile
 * lo apre SOLO il passaggio del mouse. Chi legge a voce non lo incontra mai —
 * un `title` non è contenuto, è un attributo che la maggior parte degli
 * screen reader non annuncia su un `<span>` generico — e chi naviga da
 * tastiera nemmeno, perché la cella non riceve il fuoco. La sigla restava
 * quindi due lettere non spiegate per tutti quelli che non hanno un mouse.
 *
 * ADESSO LA FRASE È CONTENUTO. La stessa stringa del `title` vive dentro
 * l'elemento come testo fuori dalla vista (`.listone-axis-tag__sr`), quindi è
 * il NOME ACCESSIBILE della cella e si sente senza che nessuna nuvoletta debba
 * comparire — stesso idioma di `.scheda-icona__sr` in src/ui/schedaIcone.ts,
 * che questo repository usa già per la striscia di icone del riquadro d'asta.
 * Il `title` resta per il mouse: non è più l'unico canale, è uno dei due.
 *
 * DUE USI, UNA FORMA. Nato per i marcatori d'asse «PI»/«BO» della colonna
 * promiscua, porta oggi anche il «▾» del tetto degli esperti sulle presenze
 * previste: sono due fatti diversi, ma la domanda che pongono alla cella è la
 * stessa — «qualifica questa cifra senza rubarle il posto, e dillo anche a chi
 * non ha un mouse». Una seconda forma per la stessa domanda sarebbe una
 * seconda classe da misurare e da tenere allineata.
 *
 * ZERO STOP DI TABULAZIONE AGGIUNTI, ed è una scelta, non una dimenticanza.
 * La strada ovvia — dare `tabindex="0"` al marcatore — su un listone da 532
 * righe aggiungerebbe fino a 532 fermate in una tabella che si attraversa già
 * a fatica, per far comparire una nuvoletta che la frase qui dentro dice
 * meglio. La sigla visibile è `aria-hidden` perché «BO» letto a voce è un
 * suono, non una parola: chi ascolta sente «6 Bonus», chi guarda legge «6 BO».
 */
function cellMarkerHtml(marker: string, label: string): string {
  return (
    `<span class="listone-axis-tag" title="${escHtml(label)}">` +
    `<span aria-hidden="true">${escHtml(marker)}</span>` +
    `<span class="listone-axis-tag__sr">${escHtml(label)}</span>` +
    `</span>`
  );
}

function listoneCellHtml(
  p: ListonePlayer,
  col: ListoneColumn,
  isAssigned: boolean,
  signals: ListoneRowSignalsLookup,
): string {
  const attrs = cellAttributes(p, col);
  const value = listoneCellValue(p, col.key, signals);
  if (col.kind === "role" && typeof value === "string") {
    // Riga già assegnata -> pastiglia ARRETRATA. `opacity: 0.6` su tutta la
    // riga faceva due cose insieme: attenuava il testo (ed è per questo che è
    // stata tolta — portava il nome del giocatore a 4,28:1) e attenuava il
    // disco della pastiglia. Solo la prima andava disfatta: senza questa
    // variante il disco tornava fra 2,1x e 2,5x più luminoso, e le righe che
    // non puoi più comprare diventavano la cosa più accesa del listone. Il
    // disco arretrato è lo stesso hue a L 0.42 — vedi ROLE_CHIP_MUTED_TEXT in
    // theme.ts per i numeri.
    return `<div class="listone-cell"${attrs}>${roleChipHtml(value, isAssigned ? "muted" : "full")}</div>`;
  }
  if (col.key === "club" && typeof value === "string") {
    return `<div class="listone-cell listone-cell--club"${attrs}>${clubBadgeHtml(value)}${escHtml(value)}</div>`;
  }
  if (col.key === "name" && typeof value === "string") {
    const badge = isAssigned ? `<span class="badge badge--assigned">Assegnato</span>` : "";
    return `<div class="listone-cell listone-cell--name"${attrs}>${escHtml(value)}${badge}</div>`;
  }
  const text = listoneCellText(p, col.key, signals);
  const mono = col.kind === "number" ? " listone-cell--mono" : "";
  // IL MARCATORE È UN ELEMENTO, non due lettere incollate al numero: così ha
  // una classe sua (si può rimpicciolire senza toccare la cifra), porta l'asse
  // per esteso in DUE canali (vedi `axisMarkerHtml`), e un test può chiederlo
  // per selettore invece di frugare in una stringa. `listoneCellText` resta la
  // sola cifra — è quello che si ordina e quello che le asserzioni di assenza
  // confrontano.
  const axis = expertVoteAxisMarker(p, col.key, signals);
  const marker = axis === null ? "" : cellMarkerHtml(axis, expertVoteAxisTitle(p, col.key, signals));
  // Il tetto degli esperti sulle presenze previste: stesso elemento a due
  // canali, e solo quando il DATO lo dichiara applicato. `capApplied: false` e
  // un dato che non lo nomina affatto non aggiungono niente alla cella — non
  // c'è nessun fatto da dire — e riempirla di segni renderebbe illeggibile il
  // caso in cui il fatto c'è.
  const cap = genForecastCapApplied(p, col.key)
    ? cellMarkerHtml(GEN_FORECAST_CAP_MARKER, GEN_FORECAST_CAP_LABEL)
    : "";
  return `<div class="listone-cell${mono}"${attrs}>${escHtml(text)}${marker}${cap}</div>`;
}

/**
 * L'intestazione dello stato vuoto — non cliccabile, nessun pool da ordinare.
 *
 * Mostra le stesse colonne che si vedrebbero con un listone caricato (quelle
 * di default che esistono senza pool), non più le quattro di una volta: lo
 * scheletro di una tabella vuota deve somigliare alla tabella che arriverà,
 * altrimenti insegna una forma che poi cambia da sola.
 */
export function listoneTableHeadHtml(): string {
  const visible = new Set(defaultVisibleColumnKeys([]));
  return listoneColumns([])
    .filter((c) => visible.has(c.key))
    .map(
      (c) =>
        `<div class="listone-cell" data-col="${escHtml(c.key)}" style="--col-flex:${listoneColumnFlex(c.key)};">` +
        `${escHtml(c.label)}</div>`,
    )
    .join("");
}

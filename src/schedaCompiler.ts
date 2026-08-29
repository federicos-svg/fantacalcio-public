// IL COMPILATORE DI SCHEDE — layer puro.
//
// IL PROBLEMA, MISURATO. Il deposito del Gruppo Esperti (src/expertScheda.ts)
// è un file JSON che Pico scrive PRIMA dell'asta: ~200 schede, fra i 20
// secondi di una scheda magra e i 90 di una piena, circa due ore in tutto.
// Finora l'unico modo di scriverlo era battere il JSON a mano, e lo schema del
// deposito è `.strict()`: una virgola di troppo, una chiave scritta male, un
// `percentuale` diventato `quota` e `parseExpertSchedaDeposit` rifiuta TUTTO —
// non la riga sbagliata, il file intero (è fail-closed apposta: metà deposito
// sarebbe peggio di nessun deposito). Due ore di lavoro dietro un refuso.
//
// CHE COSA FA QUESTO MODULO, E CHE COSA NON FA. Trasforma i valori di un
// modulo compilabile — stringhe, come le rende qualunque controllo del DOM —
// in una `ExpertScheda` valida, oppure nell'elenco dei motivi per cui non lo
// è; tiene le schede in composizione in `localStorage` e le rilegge; e alla
// fine costruisce il TESTO del deposito. Non tocca il DOM, non fa I/O di rete,
// non conosce il browser: la schermata sta in src/main.ts, qui c'è solo la
// regola, testabile fuori dal browser come nominationContext.ts, leagueTeams.ts
// e schedaLinks.ts.
//
// LA VALIDAZIONE È QUELLA VERA, NON UNA SUA IMITAZIONE. Ogni scheda costruita
// qui passa per `parseExpertSchedaDeposit` — la stessa funzione che leggerà il
// file a runtime — prima di essere considerata buona, e il deposito completo ci
// ripassa un'altra volta prima di essere offerto. Non esiste in questo file una
// seconda descrizione di che cos'è una scheda valida: esiste un ORACOLO, ed è
// il contratto. Il costo è un `JSON.parse` per scheda salvata, cioè niente su
// due ore di lavoro, e il ricavo è che questo modulo non può divergere dallo
// schema nemmeno se qualcuno cambia lo schema domani.
//
// FAIL-CLOSED, MA NELLA DIREZIONE GIUSTA. Un archivio locale illeggibile rende
// zero schede — mai un elenco parziale che sembra completo. Una scrittura che
// non attecchisce rende `false`, perché chi chiama lo DICA: la promessa «il
// lavoro non si perde» vale solo se la sua rottura è visibile subito.
//
// DODICI CAMPI, NON NOVE — E UNA GUARDIA CHE LO SORVEGLIA. Il contratto del
// deposito è cresciuto tre volte (`ballottaggio`, `lista`, `pagella`) mentre
// questo modulo restava a nove campi, e nessun test è diventato rosso: le prove
// guardavano un campo alla volta, cioè esattamente i campi che c'erano già. Un
// test per campo non può accorgersi di un campo che manca. Da qui
// `SCHEDA_ENTRY_POINTS` più sotto — l'elenco di dove arriva OGNI chiave del
// contratto — e la guardia strutturale che lo confronta con le chiavi vere
// dello schema (src/schedaCompiler.test.ts). Le due sole eccezioni, `player` e
// `club`, sono dichiarate col loro motivo: non sono incompilabili, sono
// compilate dalla riga di listone.
//
// NIENTE DI DIRETTIVO, MAI. Non c'è (e non può entrare) `value`, `fair_to_me`,
// `target_band`, un prezzo, un `maxBid` o un punteggio: lo schema `.strict()`
// del contratto rifiuta qualunque chiave che non sia nel suo vocabolario, e
// questo modulo non ne inventa nessuna — docs/NO_GO.md §Prodotto.

import { z } from "zod";
import type { Role } from "../packages/engine/src/types.js";
import type { StorageLike } from "./logRecovery.js";
import {
  AVVISO_VALUES,
  EXPERT_SCHEDA_SCHEMA_VERSION,
  FONTE_VALUES,
  LISTA_ESPERTI_VALUES,
  PIAZZATI_VALUES,
  RIGORI_VALUES,
  SCHEDA_BALLOTTAGGIO_MAX,
  SCHEDA_CLUB_NON_DICHIARATA,
  SCHEDA_GERARCHIA_MAX,
  SCHEDA_GERARCHIA_MIN,
  SCHEDA_NAME_MAX,
  SCHEDA_NOTA_MARCATURA_PAROLE,
  SCHEDA_NOTA_MAX,
  SCHEDA_PERCENTUALE_MAX,
  SCHEDA_PERCENTUALE_MIN,
  SCHEDA_RANGO_MAX,
  SCHEDA_RANGO_MIN,
  TITOLARITA_VALUES,
  ballottaggioVisibile,
  isValidIsoDate,
  leggiNota,
  parseExpertSchedaDeposit,
  schedaHasContent,
  stessoSoggettoBallottaggio,
  type Avviso,
  type BallottaggioIdentita,
  type BallottaggioSoggetto,
  type ExpertScheda,
  type Fonte,
  type ListaEsperti,
  type Piazzati,
  type Rigori,
  type SchedaTarget,
  type Titolarita,
} from "./expertScheda.js";
import {
  PAGELLA_ASSI,
  PAGELLA_ASSENTE,
  PAGELLA_ASSI_TUTTI,
  PAGELLA_ETICHETTE,
  PAGELLA_TOTALE_MAX,
  PAGELLA_VOTI_SCHEMA_KEYS,
  PAGELLA_VOTO_MAX,
  PAGELLA_VOTO_MIN,
  pagellaAsseDelRuolo,
  pagellaHasContent,
  resolvePagella,
  type PagellaAsse,
  type PagellaAsseDiRuolo,
  type PagellaScheda,
} from "./pagellaEsperti.js";
import { listonePlayerKey } from "./ui/listone.js";
import {
  AVVISO_LABELS,
  FONTE_LABELS,
  PIAZZATI_LABELS,
  RIGORI_LABELS,
  TITOLARITA_LABELS,
  formatSchedaDate,
  gerarchiaLabel,
} from "./ui/expertInsight.js";
import { LISTA_ESPERTI_LABELS, conRango } from "./ui/schedaLabels.js";

// ── L'archivio locale ────────────────────────────────────────────────────────

export const SCHEDA_DRAFTS_STORAGE_KEY = "fac_scheda_drafts";
export const SCHEDA_DRAFTS_SCHEMA_VERSION = 1;

/**
 * Un tetto, non una regola di prodotto — stessa ragione di `SCHEDA_LINKS_MAX`:
 * difende da un `localStorage` gonfiato da altro, non limita il lavoro. Il
 * listone reale sta sotto le 600 righe e le schede attese sono ~200.
 */
export const SCHEDA_DRAFTS_MAX = 2000;

/** Chiavi di riga: sono `listonePlayerKey`, qualunque cosa più lunga non lo è. */
const KEY_MAX = 200;

/** Il nome del file che Pico deposita. Uno solo, scritto una volta sola. */
export const SCHEDA_DEPOSIT_FILENAME = "schede_gruppo_esperti.json";

/**
 * Il modulo COME LO RENDE IL DOM: tutto stringa, anche i numeri e le date,
 * perché è esattamente ciò che un `<select>`, un `<input>` e un gruppo di
 * checkbox producono. La conversione (e il rifiuto) avvengono in un posto solo,
 * `buildScheda` qui sotto — mai sparse fra i gestori di evento.
 */
export interface SchedaFormValues {
  readonly titolarita: string;
  readonly percentuale: string;
  /**
   * GLI ALTRI in ballottaggio, una riga per soggetto e due stringhe per riga.
   * Una riga esiste appena UNO dei due campi è scritto. Una quota battuta
   * senza il nome non sparisce quindi dalla forma: diventa un rifiuto che si
   * legge (`buildScheda`), perché il numero c'è e chi l'ha scritto deve
   * saperlo.
   */
  readonly ballottaggio: readonly SchedaBallottaggioValues[];
  readonly gerarchia: string;
  readonly rigori: string;
  /**
   * IL RANGO DEI TRE INCARICHI — «il quantesimo della fila» — come lo rende il
   * DOM: stringa, `""` per «non dichiarato». `""` NON è `0`: la distinzione fra
   * «la scheda non lo dice» e un numero vale in scrittura esattamente come in
   * lettura (src/expertScheda.ts §rango), o non vale.
   *
   * Ognuno vive accanto al proprio segnale nel modulo, come nella `shape` del
   * contratto: un rango battuto senza la sua fila è un rifiuto che si legge —
   * `buildScheda` lo dice con la stessa parola con cui lo direbbe il deposito.
   */
  readonly rangoRigori: string;
  readonly piazzati: readonly string[];
  readonly rangoPunizioni: string;
  readonly rangoAngoli: string;
  readonly avvisi: readonly string[];
  /**
   * La lista editoriale. `""` è L'ASSENZA e non un quarto valore del
   * vocabolario: è la stessa forma di `titolarita`, `rigori` e `fonte` — un
   * `<option value="">` separato, che non finisce mai dentro la scheda.
   */
  readonly lista: string;
  readonly nota: string;
  readonly aggiornata: string;
  readonly fonte: string;
  readonly pagella: SchedaPagellaValues;
}

/**
 * Un soggetto del ballottaggio come lo rende il DOM: tre stringhe.
 *
 * `surface` E `club` VIAGGIANO INSIEME e vengono dallo STESSO gesto — la scelta
 * di una riga di listone, che porta già tutte e due. Non ci sono due controlli:
 * c'è un `<select>` di righe, e la riga scelta scrive entrambe le caselle. È la
 * stessa forma con cui `player` e `club` della scheda arrivano da
 * `SchedaTarget`, un livello più giù.
 */
export interface SchedaBallottaggioValues {
  /** Il nome dell'altro, preso da una riga del listone — mai battuto a mano. */
  readonly surface: string;
  /**
   * La sua squadra, dalla stessa riga. `""` è L'ASSENZA — una scheda ripresa da
   * un deposito scritto prima che questa metà esistesse — e non diventa mai una
   * squadra dedotta: `buildScheda` non scrive la chiave, e il riquadro dichiara
   * che manca.
   */
  readonly club: string;
  /** La sua quota, o `""` quando la scheda non la dichiara. `""` non è `0`. */
  readonly sharePercent: string;
}

/**
 * Una riga di ballottaggio vuota — la casella che la schermata apre in coda.
 *
 * È una COSTANTE e non un letterale ripetuto perché è la testimone della
 * guardia annidata: le sue chiavi sono ciò che la guardia confronta con le
 * chiavi vere del soggetto nel contratto. Un letterale scritto in tre posti
 * avrebbe permesso a due di essi di restare indietro senza che si veda, che è
 * il difetto di cui questo file parla dalla prima riga.
 */
export const EMPTY_SCHEDA_BALLOTTAGGIO_ROW: SchedaBallottaggioValues = {
  surface: "",
  club: "",
  sharePercent: "",
};

/**
 * I VOTI DELLA PAGELLA come li rende il DOM: sei caselle e il totale, tutte
 * stringhe, `""` per «non scritto».
 *
 * SEI e non cinque: le chiavi sono quelle dello schema (src/pagellaEsperti.ts),
 * e lo schema ne ammette sei perché il QUARTO ASSE dipende dal ruolo — «porta
 * inviolata» per i portieri, «bonus» per il movimento. La pagella ne porta
 * comunque cinque: lo schema RIFIUTA quella che li dichiara entrambi, e
 * `buildScheda` oppone lo stesso rifiuto prima, con la stessa parola.
 *
 * Tenere qui tutte e sei — invece di un solo campo «quarto asse» — è ciò che
 * permette di RIAPRIRE una scheda che porta l'asse dell'altro ruolo (importata
 * da un deposito scritto altrove) e di toglierlo. Un campo solo l'avrebbe
 * scartato in silenzio alla riapertura, cioè avrebbe cancellato del lavoro per
 * non doverlo mostrare.
 *
 * `totaleFonte` è il totale COME LO DICHIARA LA FONTE, non la somma dei
 * cinque: la somma si ricalcola e serve a smentirlo, e su divergenza restano
 * scritti tutti e due (src/pagellaEsperti.ts §«il totale è derivato»).
 */
export interface SchedaPagellaValues {
  readonly pagella_titolarita: string;
  readonly pagella_media_voto: string;
  readonly pagella_salute: string;
  readonly pagella_porta_inviolata: string;
  readonly pagella_bonus: string;
  readonly pagella_consiglio: string;
  readonly totaleFonte: string;
}

export const EMPTY_SCHEDA_PAGELLA: SchedaPagellaValues = {
  pagella_titolarita: "",
  pagella_media_voto: "",
  pagella_salute: "",
  pagella_porta_inviolata: "",
  pagella_bonus: "",
  pagella_consiglio: "",
  totaleFonte: "",
};

export const EMPTY_SCHEDA_FORM: SchedaFormValues = {
  titolarita: "",
  percentuale: "",
  ballottaggio: [],
  gerarchia: "",
  rigori: "",
  rangoRigori: "",
  piazzati: [],
  rangoPunizioni: "",
  rangoAngoli: "",
  avvisi: [],
  lista: "",
  nota: "",
  aggiornata: "",
  fonte: "",
  pagella: EMPTY_SCHEDA_PAGELLA,
};

/**
 * La scheda APERTA e non ancora salvata, con la riga di listone a cui
 * appartiene.
 *
 * Perché è persistita anche lei e non solo le schede salvate: una scheda piena
 * costa 90 secondi di battitura, e un reload accidentale a metà è la stessa
 * perdita di lavoro che questa schermata esiste per evitare. Qui dentro NON
 * c'è validazione di contratto — è testo in corso di scrittura, può essere
 * incoerente per definizione, e il contratto lo incontra al salvataggio.
 */
export interface SchedaEditing {
  readonly rowKey: string;
  readonly values: SchedaFormValues;
}

/**
 * Tutto il lavoro in corso: le schede già scritte, indicizzate sulla riga di
 * listone da cui vengono, più quella eventualmente aperta.
 *
 * LA CHIAVE È LA RIGA DI LISTONE, non l'identità della scheda. È la stessa
 * scelta di `schedaLinkRowKey`: la scheda si scrive guardando una riga, e da
 * quella riga si deve poter ritrovare per correggerla. `player` e `club` dentro
 * la scheda restano quelli della riga — è ciò che garantisce l'aggancio di
 * `findSchedaCandidates` invece di sperarci.
 *
 * `Map`, non oggetto: l'ordine di inserimento è l'ordine in cui Pico ha
 * scritto, ed è l'ordine con cui le schede finiscono nel deposito. Determinismo
 * senza ordinamenti impliciti, e nessuna graduatoria.
 */
export interface SchedaDraftState {
  readonly schede: ReadonlyMap<string, ExpertScheda>;
  readonly editing: SchedaEditing | null;
}

export const NO_SCHEDA_DRAFTS: SchedaDraftState = { schede: new Map(), editing: null };

/**
 * I TRE CAMPI NUOVI PORTANO UN `.default()`, e gli altri nove no.
 *
 * Non è una svista di simmetria: è la sola forma in cui l'archivio già scritto
 * sopravvive al giorno in cui il modulo cresce. Una scheda APERTA salvata ieri
 * non ha `ballottaggio`, `lista` né `pagella`; senza il default cadrebbe fuori
 * da `formSchema`, e il `.catch(null)` qui sotto la trasformerebbe in «nessuna
 * scheda aperta» — cioè fino a 90 secondi di battitura persi in silenzio, per
 * un campo che nessuno aveva ancora compilato. Col default rientra intera, coi
 * campi nuovi vuoti.
 */
const formSchema = z
  .object({
    titolarita: z.string(),
    percentuale: z.string(),
    // `club` porta un `.default("")` per la stessa ragione dei tre campi che ne
    // hanno già uno, ma un livello più giù — dentro la riga invece che sulla
    // scheda. Una scheda APERTA salvata prima che la squadra esistesse ha righe
    // con due chiavi soltanto: senza il default cadrebbe fuori da `formSchema`,
    // cioè fino a 90 secondi di battitura trasformati in «nessuna scheda
    // aperta» per una metà d'identità che nessuno aveva ancora potuto scrivere.
    ballottaggio: z
      .array(
        z
          .object({
            surface: z.string(),
            club: z.string().default(""),
            sharePercent: z.string(),
          })
          .strict(),
      )
      .default([]),
    gerarchia: z.string(),
    rigori: z.string(),
    // I TRE RANGHI PORTANO UN `.default("")` per la stessa ragione dei campi
    // che ne hanno già uno: una scheda APERTA salvata prima di oggi non ha
    // queste chiavi, e senza il default cadrebbe fuori da `formSchema` — cioè
    // fino a 90 secondi di battitura trasformati in «nessuna scheda aperta»
    // per tre caselle che nessuno aveva ancora potuto compilare.
    rangoRigori: z.string().default(""),
    piazzati: z.array(z.string()),
    rangoPunizioni: z.string().default(""),
    rangoAngoli: z.string().default(""),
    avvisi: z.array(z.string()),
    lista: z.string().default(""),
    nota: z.string(),
    aggiornata: z.string(),
    fonte: z.string(),
    pagella: z
      .object({
        pagella_titolarita: z.string(),
        pagella_media_voto: z.string(),
        pagella_salute: z.string(),
        pagella_porta_inviolata: z.string(),
        pagella_bonus: z.string(),
        pagella_consiglio: z.string(),
        totaleFonte: z.string(),
      })
      .strict()
      .default(EMPTY_SCHEDA_PAGELLA),
  })
  .strict();

const draftsSchema = z
  .object({
    schemaVersion: z.literal(SCHEDA_DRAFTS_SCHEMA_VERSION),
    entries: z.array(
      z
        .object({
          rowKey: z.string().min(1).max(KEY_MAX),
          // Volutamente NON descritta qui: la forma di una scheda la conosce
          // il contratto, e l'oracolo qui sotto gliela chiede. Una seconda
          // descrizione in questo file sarebbe una regola che può divergere.
          scheda: z.record(z.string(), z.unknown()),
        })
        .strict(),
    ),
    // `.catch(null)`: una scheda APERTA malformata torna «nessuna scheda
    // aperta» e basta. Non deve poter cancellare le schede già SALVATE, che
    // sono il lavoro vero — è l'unica asimmetria di questo archivio, ed è
    // deliberata.
    editing: z
      .object({ rowKey: z.string().min(1).max(KEY_MAX), values: formSchema })
      .strict()
      .nullable()
      .catch(null),
  })
  .strict();

/** Le schede in un elenco che il contratto sa validare tutto insieme. */
function depositTextOf(schede: readonly unknown[]): string {
  return JSON.stringify({ schemaVersion: EXPERT_SCHEDA_SCHEMA_VERSION, schede }, null, 2);
}

/**
 * Legge l'archivio. Non lancia mai. Qualunque cosa non sia esattamente la forma
 * attesa — JSON rotto, versione diversa, chiavi doppie, una scheda che il
 * CONTRATTO rifiuta — rende l'archivio vuoto: meglio ricominciare sapendolo che
 * lavorare su un elenco a cui manca in silenzio qualcosa.
 */
export function loadSchedaDrafts(storage: StorageLike): SchedaDraftState {
  try {
    const raw = storage.getItem(SCHEDA_DRAFTS_STORAGE_KEY);
    if (raw === null) return NO_SCHEDA_DRAFTS;
    const parsed = draftsSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) return NO_SCHEDA_DRAFTS;
    const entries = parsed.data.entries;
    if (entries.length > SCHEDA_DRAFTS_MAX) return NO_SCHEDA_DRAFTS;

    const schede = new Map<string, ExpertScheda>();
    // L'oracolo: sono schede valide solo se il contratto le accetta tutte.
    const store = parseExpertSchedaDeposit(depositTextOf(entries.map((e) => e.scheda)));
    if (!store.ok) return NO_SCHEDA_DRAFTS;
    for (const entry of entries) {
      // Due schede sulla stessa riga di listone non si risolvono scegliendone
      // una: sarebbe la metà sbagliata, in silenzio.
      if (schede.has(entry.rowKey)) return NO_SCHEDA_DRAFTS;
      schede.set(entry.rowKey, entry.scheda as unknown as ExpertScheda);
    }
    return { schede, editing: parsed.data.editing };
  } catch {
    return NO_SCHEDA_DRAFTS;
  }
}

/**
 * Scrive l'archivio. Rende `false` quando la scrittura non ha attecchito —
 * stessa postura di `saveSchedaLinks` e `saveLeagueRoster`, e per la stessa
 * ragione: chi chiama deve poterlo DIRE, invece di lasciar credere che due ore
 * di lavoro siano al sicuro quando al prossimo reload non ci saranno più.
 *
 * La rilettura di controllo dopo la scrittura non è teatro: uno storage che
 * accetta `setItem` e non conserva nulla (modalità private di alcuni browser,
 * quota esaurita senza eccezione) è esattamente il caso in cui il lavoro
 * sparirebbe senza un solo errore.
 */
export function saveSchedaDrafts(storage: StorageLike, state: SchedaDraftState): boolean {
  if (state.schede.size > SCHEDA_DRAFTS_MAX) return false;
  const entries = [...state.schede].map(([rowKey, scheda]) => ({ rowKey, scheda }));
  const parsed = draftsSchema.safeParse({
    schemaVersion: SCHEDA_DRAFTS_SCHEMA_VERSION,
    entries,
    editing: state.editing,
  });
  if (!parsed.success) return false;
  // Stesso oracolo della lettura: non si persiste ciò che non si potrebbe
  // rileggere.
  if (!parseExpertSchedaDeposit(depositTextOf(entries.map((e) => e.scheda))).ok) return false;
  const raw = JSON.stringify(parsed.data);
  try {
    storage.setItem(SCHEDA_DRAFTS_STORAGE_KEY, raw);
    return storage.getItem(SCHEDA_DRAFTS_STORAGE_KEY) === raw;
  } catch {
    return false;
  }
}

/** L'archivio con una scheda in più (o senza quella riga, con `null`). Puro. */
export function withScheda(
  state: SchedaDraftState,
  rowKey: string,
  scheda: ExpertScheda | null,
): SchedaDraftState {
  const schede = new Map(state.schede);
  if (scheda === null) schede.delete(rowKey);
  else schede.set(rowKey, scheda);
  return { ...state, schede };
}

/** L'archivio con un'altra scheda aperta (o nessuna, con `null`). Puro. */
export function withEditing(state: SchedaDraftState, editing: SchedaEditing | null): SchedaDraftState {
  return { ...state, editing };
}

// ── Dal modulo compilato alla scheda ─────────────────────────────────────────

export type SchedaField =
  | "identita"
  | "titolarita"
  | "percentuale"
  | "ballottaggio"
  | "gerarchia"
  | "rigori"
  | "rangoRigori"
  | "piazzati"
  | "rangoPunizioni"
  | "rangoAngoli"
  | "avvisi"
  | "lista"
  | "nota"
  | "aggiornata"
  | "fonte"
  | "pagella"
  | "scheda";

// ── LA VIA D'INGRESSO DI OGNI CAMPO DEL CONTRATTO ────────────────────────────
//
// IL DIFETTO CHE QUESTO ELENCO ESISTE PER RENDERE RUMOROSO, misurato: il
// contratto `ExpertScheda` è cresciuto tre volte — `ballottaggio`, `lista`,
// `pagella` — e questo modulo è rimasto a nove campi su dodici. Nessun test è
// diventato rosso, perché nessun test guardava il contratto e il modulo
// INSIEME: le due cose erano corrette ciascuna per conto proprio, e in mezzo
// c'era un dato che il deposito ammetteva e che l'unica persona autorizzata a
// scriverlo non poteva scrivere. Un campo irraggiungibile non è un campo
// mancante: è lavoro impossibile che nessuno dichiara.
//
// LA GUARDIA. `src/schedaCompiler.test.ts` §«la guardia strutturale» legge
// `EXPERT_SCHEDA_SCHEMA_KEYS` — le chiavi VERE dello schema, non un elenco
// scritto a mano — e pretende che ognuna compaia qui sotto. Aggiungere una
// chiave al contratto senza darle una via d'ingresso rende rossa la guardia lo
// stesso giorno.
//
// LE ECCEZIONI SI DICHIARANO UNA PER UNA, COL MOTIVO, e non con uno `skip`
// generico: uno `skip` avrebbe spento la guardia esattamente sui campi su cui
// serve. Oggi sono due, `player` e `club`, e il motivo è lo stesso per
// entrambe — non sono «non compilabili», sono compilate DA UN'ALTRA PARTE, la
// riga di listone, ed è quella scelta che fa agganciare la scheda al giocatore.

/**
 * Da dove arriva una chiave del contratto: da un campo del modulo, oppure —
 * dichiarandolo — dalla riga di listone scelta.
 */
export type SchedaEntryPoint =
  | { readonly kind: "form"; readonly field: keyof SchedaFormValues }
  | { readonly kind: "riga-di-listone"; readonly perche: string };

const IDENTITA_DA_LISTONE =
  "Non si batte a mano: viene dalla riga di listone scelta (SchedaTarget). È la sola cosa che garantisce che la scheda si agganci a quel giocatore invece di sperarci — un campo di testo qui riaprirebbe il difetto peggiore di questo riquadro, la scheda scritta, depositata e mai resa.";

export const SCHEDA_ENTRY_POINTS = {
  player: { kind: "riga-di-listone", perche: IDENTITA_DA_LISTONE },
  club: { kind: "riga-di-listone", perche: IDENTITA_DA_LISTONE },
  titolarita: { kind: "form", field: "titolarita" },
  percentuale: { kind: "form", field: "percentuale" },
  ballottaggio: { kind: "form", field: "ballottaggio" },
  gerarchia: { kind: "form", field: "gerarchia" },
  rigori: { kind: "form", field: "rigori" },
  rangoRigori: { kind: "form", field: "rangoRigori" },
  piazzati: { kind: "form", field: "piazzati" },
  rangoPunizioni: { kind: "form", field: "rangoPunizioni" },
  rangoAngoli: { kind: "form", field: "rangoAngoli" },
  avvisi: { kind: "form", field: "avvisi" },
  lista: { kind: "form", field: "lista" },
  nota: { kind: "form", field: "nota" },
  aggiornata: { kind: "form", field: "aggiornata" },
  fonte: { kind: "form", field: "fonte" },
  pagella: { kind: "form", field: "pagella" },
} as const satisfies Readonly<Record<keyof ExpertScheda, SchedaEntryPoint>>;

/**
 * Lo stesso patto un livello più giù, dentro la pagella: uno schema `.strict()`
 * rigido solo al primo livello lascia crescere l'oggetto annidato senza che
 * niente diventi rosso, ed è il punto cieco classico. I SEI ASSI non stanno
 * qui uno per uno: la guardia li confronta direttamente con le chiavi di
 * `SchedaPagellaValues`, così un asse nuovo nel contratto è rosso senza che
 * nessuno debba ricordarsi di aggiungerlo anche a un elenco.
 */
export const SCHEDA_PAGELLA_ENTRY_POINTS = {
  voti: { kind: "form", field: "pagella" },
  totaleFonte: { kind: "form", field: "pagella" },
} as const satisfies Readonly<Record<string, SchedaEntryPoint>>;

/**
 * E lo stesso patto dentro il SOGGETTO DEL BALLOTTAGGIO — il terzo livello
 * annidato del contratto, e il solo che era rimasto scoperto.
 *
 * Il commento del contratto chiamava per nome «il punto cieco classico di uno
 * schema rigido solo al primo livello», e `.strict()` lo chiudeva in LETTURA:
 * una chiave in più dentro il soggetto è un errore di validazione. In
 * SCRITTURA no. Un campo dichiarato dentro il soggetto e non cablato nel
 * modulo passava l'intera suite senza che una sola prova diventasse rossa —
 * misurato dalla review, 179 test su 179 verdi. Oggi non c'è nessun campo
 * scoperto (zero su due), ed è esattamente per questo che la guardia va messa
 * adesso: è il posto in cui il quarto ripetersi dello stesso difetto
 * aspetterebbe in silenzio.
 *
 * Le tre chiavi si compilano dalla stessa riga del modulo — un `<select>` di
 * righe di listone, che scrive INSIEME il nome e la squadra, e una casella
 * numerica per la quota — quindi la via d'ingresso è il campo `ballottaggio`;
 * quale casella della riga sia quale lo verifica la guardia confrontando le
 * chiavi del contratto con `EMPTY_SCHEDA_BALLOTTAGGIO_ROW`.
 *
 * `club` NON È UNA TERZA ECCEZIONE. Le due eccezioni dichiarate del primo
 * livello (`player` e `club` della scheda) esistono perché lassù l'identità non
 * ha un campo del modulo: la porta la riga scelta nel pannello. Qui la riga
 * scelta È un campo del modulo — il `<select>` di questa casella — quindi la
 * squadra ha una via d'ingresso vera e passa la guardia per merito, senza
 * allargarle il perimetro di ciò che non sorveglia.
 */
export const SCHEDA_BALLOTTAGGIO_ENTRY_POINTS = {
  surface: { kind: "form", field: "ballottaggio" },
  club: { kind: "form", field: "ballottaggio" },
  sharePercent: { kind: "form", field: "ballottaggio" },
} as const satisfies Readonly<Record<keyof BallottaggioSoggetto, SchedaEntryPoint>>;

export interface SchedaFieldError {
  readonly field: SchedaField;
  readonly message: string;
}

export type SchedaBuildResult =
  | { readonly ok: true; readonly scheda: ExpertScheda }
  | { readonly ok: false; readonly errors: readonly SchedaFieldError[] };

/** Intero scritto a mano, senza sorprese: niente `1e2`, niente `3.5`, niente ` `. */
function parseInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * I valori scelti, nell'ordine del VOCABOLARIO e senza ripetizioni. L'ordine
 * del vocabolario e non quello dei clic: due schede identiche compilate in
 * ordine diverso devono produrre lo stesso JSON, altrimenti un diff del
 * deposito mostrerebbe differenze che non ci sono.
 */
function pickVocabulary<T extends string>(
  chosen: readonly string[],
  vocabulary: readonly T[],
): { readonly values: readonly T[]; readonly unknown: readonly string[] } {
  const set = new Set(chosen);
  const values = vocabulary.filter((v) => set.has(v));
  const known = new Set<string>(vocabulary);
  return { values, unknown: chosen.filter((c) => !known.has(c)) };
}

// L'IDENTITÀ DI UN SOGGETTO AI FINI DEL CONFRONTO non si piega più qui.
//
// C'era `foldName`, cioè `normalizeIdentityPart` sul solo nome, e rispondeva
// alla domanda «due righe di ballottaggio sono la stessa persona?» — che col
// solo nome non è più rispondibile. Con la squadra dentro il soggetto la
// risposta ha due metà e un ramo dichiarato per la metà che può mancare, e vive
// dove vive il contratto: `stessoSoggettoBallottaggio`, in
// src/expertScheda.ts. Una copia qui sarebbe la seconda superficie che questo
// modulo passa la vita a evitare:
// il compilatore CHIEDE al contratto, come già chiede alla vista con
// `ballottaggioVisibile`.

/**
 * I NOMI DEL BALLOTTAGGIO CHE NESSUNA RIGA DEL LISTONE CARICATO PORTA.
 *
 * Non è una validazione e non rifiuta niente: è una DICHIARAZIONE. Un rivale
 * può legittimamente non stare nel listone della lega, e rifiutare quel nome
 * cancellerebbe un fatto vero della scheda. Ma il caso opposto — il nome che
 * non corrisponde a nessuno perché è un refuso, o perché arriva da un deposito
 * scritto contro un altro listone — deve essere VISIBILE, non silenzioso.
 *
 * E si dice per UGUAGLIANZA, mai per somiglianza: agganciare «al più simile»
 * attaccherebbe in silenzio il rivale sbagliato, che è esattamente ciò che
 * `planSchedaImport` si rifiuta di fare quando riprende un deposito. Qui vale
 * la stessa regola, per la stessa ragione.
 *
 * UGUAGLIANZA DI CHE COSA. Da quando il soggetto porta la squadra, di
 * IDENTITÀ — `stessoSoggettoBallottaggio`, la stessa funzione con cui il
 * compilatore riconosce due righe per la stessa persona. Non è una raffinatezza
 * contabile: col solo nome, «Mario Rossi (ClubDue)» risultava «nel listone»
 * perché il listone porta un «Mario Rossi (ClubUno)», cioè un'altra persona.
 * Il soggetto che la squadra NON la dichiara continua a dirsi sul solo nome:
 * è tutto ciò che di lui si sa, e inventargli una squadra per poterlo
 * confrontare meglio sarebbe il default fabbricato che questo campo esiste per
 * non avere.
 *
 * Rende i nomi COME SONO SCRITTI — con la squadra quando c'è, perché è la
 * squadra a rendere leggibile QUALE dei due omonimi non corrisponde — nell'ordine
 * in cui compaiono e senza ripetizioni: è un elenco da mostrare, non un insieme
 * da contare.
 */
export function schedaBallottaggioFuoriListone(
  soggetti: readonly SchedaBallottaggioValues[],
  rows: Iterable<{ readonly name: string; readonly club: string }>,
): readonly string[] {
  const known: BallottaggioIdentita[] = [];
  for (const row of rows) known.push({ surface: row.name, club: row.club });
  const out: string[] = [];
  const seen: BallottaggioIdentita[] = [];
  for (const soggetto of soggetti) {
    const surface = soggetto.surface.trim();
    if (surface === "") continue;
    const identita: BallottaggioIdentita = { surface, club: soggetto.club.trim() };
    if (known.some((row) => stessoSoggettoBallottaggio(row, identita))) continue;
    if (seen.some((altro) => stessoSoggettoBallottaggio(altro, identita))) continue;
    seen.push(identita);
    out.push(soggettoFuoriListoneText(identita));
  }
  return out;
}

/**
 * Come si NOMINA un soggetto fuori dal listone: «Bruna Placeholder (ClubUno)»,
 * oppure il solo nome quando la scheda non dichiara la squadra.
 *
 * Il ramo senza squadra non scrive `n/d`: qui la frase che segue l'elenco dice
 * già «non corrisponde a nessuna riga del listone caricato», e una squadra
 * dichiarata assente dentro un elenco di cose assenti sarebbe rumore. Il posto
 * in cui l'assenza si dichiara è il riassunto della scheda (`schedaSummary`) e
 * il dettaglio dell'icona, dove il soggetto viene RILETTO come dato.
 */
function soggettoFuoriListoneText(identita: BallottaggioIdentita): string {
  const club = (identita.club ?? "").trim();
  return club === "" ? identita.surface : `${identita.surface} (${club})`;
}

/**
 * I CINQUE VOTI E IL TOTALE DICHIARATO, dal modulo alla forma del deposito.
 *
 * Sta fuori da `buildScheda` perché serve due volte: al salvataggio, e alla
 * riga di verifica che il pannello scrive MENTRE si compila. Due copie di
 * questa lettura divergerebbero proprio sul punto delicato — che cosa vuol
 * dire un voto mancante — quindi ce n'è una sola.
 *
 * LE TRE REGOLE, tutte già scritte in src/pagellaEsperti.ts:
 *
 *  1. UN VOTO MANCANTE RESTA MANCANTE. `""` non diventa `0` e non diventa
 *     niente: la chiave semplicemente non entra. `Titolarità 1/10` è un
 *     giudizio durissimo e legittimo della fonte, «titolarità non scritta» è
 *     un buco nostro, e uno zero fabbricato renderebbe le due indistinguibili
 *     a schermo e dentro il totale.
 *  2. IL QUARTO ASSE DIPENDE DAL RUOLO. Lo schema RIFIUTA la pagella che porta
 *     «porta inviolata» e «bonus» insieme; qui lo stesso rifiuto arriva prima
 *     e con la stessa parola, invece di uscire come «il contratto ha rifiutato
 *     questa scheda». E quando l'asse scritto non è quello che il ruolo della
 *     riga si aspetta, il voto NON verrebbe usato dalla vista
 *     (`resolvePagella` → `asseIncoerente`): qui si rifiuta dicendolo, e la
 *     differenza con l'estrattore automatico è chi ha in mano la scheda. Qui
 *     c'è una persona che può correggere il ruolo o il voto in due secondi;
 *     l'estrattore legge una fonte che non può cambiare, e per lui rifiutare
 *     significa buttare via anche gli altri quattro voti.
 *  3. IL TOTALE NON SI RICALCOLA QUI. `totaleFonte` è il numero che la FONTE
 *     dichiara: sommare i cinque e scrivere il risultato al suo posto
 *     cancellerebbe l'unica prova che uno dei due numeri è sbagliato. Su
 *     divergenza restano scritti entrambi — non è un errore di compilazione, è
 *     un fatto della scheda, e il pannello lo dichiara.
 */
export function buildSchedaPagella(
  values: SchedaPagellaValues,
  role: Role | null | undefined,
): { readonly pagella: PagellaScheda; readonly errors: readonly SchedaFieldError[] } {
  const errors: SchedaFieldError[] = [];
  // Si LEGGE nell'ordine degli assi (comuni, poi quello di ruolo) perché è
  // l'ordine in cui i messaggi d'errore devono uscire — quello in cui le
  // caselle stanno a schermo.
  const letti = new Map<PagellaAsse, number>();
  for (const asse of PAGELLA_ASSI_TUTTI) {
    const raw = values[asse].trim();
    if (raw === "") continue;
    const parsed = parseInteger(raw);
    if (parsed === null || parsed < PAGELLA_VOTO_MIN || parsed > PAGELLA_VOTO_MAX) {
      errors.push({
        field: "pagella",
        message: `Il voto «${PAGELLA_ETICHETTE[asse]}» è un intero fra ${PAGELLA_VOTO_MIN} e ${PAGELLA_VOTO_MAX}.`,
      });
      continue;
    }
    letti.set(asse, parsed);
  }

  // Si SCRIVE nell'ordine dello SCHEMA, che non è lo stesso.
  //
  // Non è pedanteria: è la condizione perché il giro si chiuda. Il deposito
  // riletto passa per zod, e zod ricostruisce l'oggetto nell'ordine della
  // propria `shape`; se il compilatore scrivesse le stesse chiavi in un altro
  // ordine, scaricare → reimportare → riscaricare renderebbe un file DIVERSO a
  // parità di contenuto. Un diff che mostra differenze che non ci sono su un
  // file che Pico rilegge a occhio, e l'asserzione «byte per byte» del giro
  // completo (e2e/schede-compiler.spec.ts) diventerebbe rossa. Misurato: senza
  // questa riga il round trip di una pagella completa non torna.
  const voti: { -readonly [K in PagellaAsse]?: number } = {};
  for (const asse of PAGELLA_VOTI_SCHEMA_KEYS) {
    const voto = letti.get(asse);
    if (voto !== undefined) voti[asse] = voto;
  }

  const porta = voti.pagella_porta_inviolata !== undefined;
  const bonus = voti.pagella_bonus !== undefined;
  if (porta && bonus) {
    errors.push({
      field: "pagella",
      message: `Il quarto asse dipende dal ruolo: «${PAGELLA_ETICHETTE.pagella_porta_inviolata}» (portieri) e «${PAGELLA_ETICHETTE.pagella_bonus}» (movimento) non possono stare nella stessa pagella. Una scheda parla di un giocatore, e quel giocatore ha un ruolo solo.`,
    });
  } else {
    const atteso = pagellaAsseDelRuolo(role);
    const dichiarato: PagellaAsseDiRuolo | null = porta
      ? "pagella_porta_inviolata"
      : bonus
        ? "pagella_bonus"
        : null;
    if (atteso !== null && dichiarato !== null && atteso !== dichiarato) {
      errors.push({
        field: "pagella",
        message: `Questa riga di listone si aspetta «${PAGELLA_ETICHETTE[atteso]}» come quarto asse: il voto scritto su «${PAGELLA_ETICHETTE[dichiarato]}» non verrebbe mostrato dal riquadro. Spostalo o toglilo.`,
      });
    }
  }

  let totaleFonte: number | undefined;
  const totaleRaw = values.totaleFonte.trim();
  if (totaleRaw !== "") {
    const parsed = parseInteger(totaleRaw);
    if (parsed === null || parsed < 0 || parsed > PAGELLA_TOTALE_MAX) {
      errors.push({
        field: "pagella",
        message: `Il TOTALE dichiarato dalla fonte è un intero fra 0 e ${PAGELLA_TOTALE_MAX}.`,
      });
    } else {
      totaleFonte = parsed;
    }
  }

  return {
    pagella: { voti, ...(totaleFonte === undefined ? {} : { totaleFonte }) },
    errors,
  };
}

/**
 * LA RIGA CHE IL PANNELLO SCRIVE SOTTO LA PAGELLA MENTRE SI COMPILA.
 *
 * Serve a smentire chi compila prima che il deposito parta, ed è la ragione per
 * cui il totale della fonte vive nel contratto: la somma si ricalcola e si
 * CONFRONTA. Su divergenza la riga scrive tutti e due i numeri e non ne appiana
 * nessuno — appianare cancellerebbe la prova che uno dei due è sbagliato.
 * Su pagella parziale non scrive nessuna somma: «20/50» con tre voti su cinque
 * è un numero falso che sembra vero.
 *
 * QUI I DUE NUMERI RESTANO ENTRAMBI, e non è in contraddizione con il riquadro
 * d'asta, che dal 2026-08-29 mostra la sola somma. Le due superfici parlano a
 * due persone diverse: là c'è chi sta per fare un'offerta e non può farci
 * niente, qui c'è chi ha la scheda davanti e può guardare quale dei due numeri
 * è sbagliato. Quel che è cambiato anche qui è l'ACCUSA: la riga diceva
 * «almeno un numero è stato letto male», cioè dava la colpa a chi trascrive.
 * Sul corpus reale la somma che non torna è quasi sempre della fonte, quindi
 * la riga adesso nomina tutte e due le possibilità e non ne sceglie una.
 *
 * La verifica non è riscritta qui: è `resolvePagella` + `verificaTotale`, le
 * stesse che il riquadro d'asta e la nota sotto il listone già usano.
 */
export function schedaPagellaVerificaText(
  values: SchedaPagellaValues,
  role: Role | null | undefined,
): string {
  const view = resolvePagella(buildSchedaPagella(values, role).pagella, role);
  const scritti = `${view.votiPresenti} ${view.votiPresenti === 1 ? "voto" : "voti"} su ${PAGELLA_ASSI}`;
  const dichiarato =
    view.totaleFonte === null ? null : `${view.totaleFonte}/${PAGELLA_TOTALE_MAX}`;
  switch (view.verificaTotale) {
    case "nessun_voto":
      return `Nessun voto scritto: la pagella resta assente. Assente si scrive «${PAGELLA_ASSENTE}» e non «0».`;
    case "senza_totale_dichiarato":
      return view.completa
        ? `${scritti}: somma ${view.totaleRicalcolato}/${PAGELLA_TOTALE_MAX}. La scheda non dichiara un TOTALE: non c'è niente da confrontare.`
        : `${scritti}: una pagella parziale non produce nessuna somma. Nessun TOTALE dichiarato.`;
    case "non_verificabile":
      return `${scritti}: una pagella parziale non produce nessuna somma, quindi il TOTALE dichiarato (${dichiarato}) resta scritto ma non confrontabile.`;
    case "coerente":
      return `${scritti}: somma ${view.totaleRicalcolato}/${PAGELLA_TOTALE_MAX}, TOTALE dichiarato ${dichiarato}. Tornano.`;
    case "divergente":
      return `${scritti}: somma ${view.totaleRicalcolato}/${PAGELLA_TOTALE_MAX} contro un TOTALE dichiarato di ${dichiarato}. NON TORNANO: o un voto è stato trascritto male, o è la scheda a sbagliare la propria somma. Restano scritti tutti e due — non si appiana nessuno dei due, e la scheda si salva lo stesso.`;
  }
}

/**
 * Il modulo compilato -> la scheda, o TUTTI i motivi per cui non lo è.
 *
 * Tutti insieme e non il primo: chi compila 200 schede non deve scoprire il
 * secondo errore dopo aver corretto il primo. Ogni errore porta il campo a cui
 * appartiene, così la schermata può marcarlo invece di limitarsi a un messaggio
 * in fondo.
 *
 * L'IDENTITÀ NON SI SCRIVE, SI SCEGLIE: `player` e `club` arrivano dalla riga
 * di listone selezionata (`SchedaTarget`), mai da un campo di testo. È la sola
 * cosa che garantisce che la scheda si agganci a quella riga —
 * `findSchedaCandidates` cerca per nome+squadra piegati — e toglie di mezzo
 * l'errore peggiore: la scheda scritta, salvata, depositata e invisibile.
 */
export function buildScheda(target: SchedaTarget, values: SchedaFormValues): SchedaBuildResult {
  const errors: SchedaFieldError[] = [];
  const player = target.name.trim();
  const club = target.club.trim();

  if (player === "" || club === "") {
    errors.push({ field: "identita", message: "Scegli una riga del listone: nome e squadra vengono da lì." });
  } else if (player.length > SCHEDA_NAME_MAX || club.length > SCHEDA_NAME_MAX) {
    errors.push({
      field: "identita",
      message: `Nome o squadra oltre ${SCHEDA_NAME_MAX} caratteri: il contratto del deposito non li accetta.`,
    });
  }

  let titolarita: Titolarita | undefined;
  if (values.titolarita !== "") {
    if ((TITOLARITA_VALUES as readonly string[]).includes(values.titolarita)) {
      titolarita = values.titolarita as Titolarita;
    } else {
      errors.push({ field: "titolarita", message: "Titolarità fuori dal vocabolario della scheda." });
    }
  }

  let percentuale: number | undefined;
  if (values.percentuale.trim() !== "") {
    const parsed = parseInteger(values.percentuale);
    if (parsed === null || parsed < SCHEDA_PERCENTUALE_MIN || parsed > SCHEDA_PERCENTUALE_MAX) {
      errors.push({
        field: "percentuale",
        message: `La percentuale è un intero fra ${SCHEDA_PERCENTUALE_MIN} e ${SCHEDA_PERCENTUALE_MAX}.`,
      });
    } else {
      percentuale = parsed;
      // Il riquadro mostra la percentuale SOLO insieme a una titolarità
      // (resolveExpertInsight: «una percentuale da sola non è un ballottaggio,
      // è un numero senza soggetto»). Scritta da sola verrebbe salvata,
      // depositata e mai resa: una perdita silenziosa, che qui diventa una
      // domanda esplicita.
      if (titolarita === undefined) {
        errors.push({
          field: "percentuale",
          message: "Una percentuale senza titolarità non verrebbe mostrata dal riquadro: scegli la titolarità o togli il numero.",
        });
      }
    }
  }

  // ── GLI ALTRI IN BALLOTTAGGIO ────────────────────────────────────────────
  //
  // È l'unico campo che risponde a «quanti si contendono quel posto»: la quota
  // dice quanto vale la contesa, questo dice CON CHI. Le regole applicate qui
  // sono tutte scritte altrove e nessuna è inventata:
  //  - il TETTO di quattro e la lunghezza del nome vengono dal contratto
  //    (`SCHEDA_BALLOTTAGGIO_MAX`, `SCHEDA_NAME_MAX`);
  //  - «il giocatore stesso non è in questa lista» è dichiarato da
  //    `BallottaggioSoggetto` in src/expertScheda.ts: la sua quota è
  //    `percentuale`, scritta una volta sola, e due numeri per la stessa quota
  //    possono divergere;
  //  - senza `titolarita: "ballottaggio"` l'elenco NON ARRIVA ALLA VISTA
  //    (`resolveExpertInsight`: un elenco di rivali su un giocatore dato
  //    titolare non è un ballottaggio, è un elenco senza soggetto). Scritto
  //    così verrebbe salvato, depositato e mai reso — la stessa perdita
  //    silenziosa che `percentuale` senza titolarità già rifiuta, e la si
  //    rifiuta allo stesso modo.
  //
  // CHE COSA È CAMBIATO CON LA SQUADRA. Le tre regole sono le stesse; ciò che
  // cambia è che «la stessa persona» non si dice più per nome, si dice per
  // IDENTITÀ — `stessoSoggettoBallottaggio`, una funzione sola per tutte e tre
  // le domande. Due omonimi pieni in club diversi sono due persone: entrambi
  // possono stare nello stesso ballottaggio, e uno dei due può perfino avere il
  // nome del giocatore della scheda senza essere lui. Sul soggetto che la
  // squadra non la dichiara la risposta resta quella di prima, sul solo nome:
  // fail-closed, perché non c'è modo di sapere se sia un altro.
  const soggetti: BallottaggioSoggetto[] = [];
  if (values.ballottaggio.length > SCHEDA_BALLOTTAGGIO_MAX) {
    errors.push({
      field: "ballottaggio",
      message: `Un ballottaggio porta al massimo ${SCHEDA_BALLOTTAGGIO_MAX} altri nomi: oltre non è un ballottaggio, è un elenco di rosa.`,
    });
  }
  const soggettiVisti: BallottaggioIdentita[] = [];
  for (const riga of values.ballottaggio) {
    const surface = riga.surface.trim();
    const clubAltro = riga.club.trim();
    const quotaRaw = riga.sharePercent.trim();
    if (surface === "" && clubAltro === "" && quotaRaw === "") continue;
    if (surface === "") {
      // Quello che c'è, scritto: buttarlo via in silenzio sarebbe la perdita
      // che questo pannello esiste per non avere. La quota si nomina per prima
      // perché è il caso che si vede davvero — la squadra da sola arriva solo
      // da un archivio manomesso, visto che il `<select>` scrive le due metà
      // dell'identità insieme.
      const scritto = quotaRaw !== "" ? `Una quota (${quotaRaw})` : `Una squadra (${clubAltro})`;
      errors.push({
        field: "ballottaggio",
        message: `${scritto} senza nome non è un soggetto: scegli chi si gioca il posto, oppure togli il ${quotaRaw !== "" ? "numero" : "resto"}.`,
      });
      continue;
    }
    if (surface.length > SCHEDA_NAME_MAX) {
      errors.push({
        field: "ballottaggio",
        message: `«${surface}» supera ${SCHEDA_NAME_MAX} caratteri: il contratto del deposito non lo accetta.`,
      });
      continue;
    }
    if (clubAltro.length > SCHEDA_NAME_MAX) {
      errors.push({
        field: "ballottaggio",
        message: `La squadra di «${surface}» supera ${SCHEDA_NAME_MAX} caratteri: il contratto del deposito non la accetta.`,
      });
      continue;
    }
    const identita: BallottaggioIdentita = { surface, club: clubAltro };
    if (player !== "" && stessoSoggettoBallottaggio({ surface: player, club }, identita)) {
      errors.push({
        field: "ballottaggio",
        message: "Il giocatore della scheda non va fra gli altri del ballottaggio: la sua quota è QUOTA DEL BALLOTTAGGIO, scritta una volta sola.",
      });
      continue;
    }
    if (soggettiVisti.some((altro) => stessoSoggettoBallottaggio(altro, identita))) {
      errors.push({
        field: "ballottaggio",
        message: `«${surface}» compare due volte nello stesso ballottaggio: due righe per la stessa persona sono due quote che possono divergere.`,
      });
      continue;
    }
    soggettiVisti.push(identita);
    let sharePercent: number | undefined;
    if (quotaRaw !== "") {
      const parsed = parseInteger(quotaRaw);
      if (parsed === null || parsed < SCHEDA_PERCENTUALE_MIN || parsed > SCHEDA_PERCENTUALE_MAX) {
        errors.push({
          field: "ballottaggio",
          message: `La quota di «${surface}» è un intero fra ${SCHEDA_PERCENTUALE_MIN} e ${SCHEDA_PERCENTUALE_MAX}.`,
        });
        continue;
      }
      sharePercent = parsed;
    }
    // NELL'ORDINE DELLO SCHEMA — nome, squadra, quota — e non in quello in cui
    // le tre caselle capitano. È la condizione perché scarica → reimporta →
    // riscarica renda lo stesso file: zod ricostruisce il soggetto nell'ordine
    // della propria `shape`, e il difetto è già successo una volta sui voti
    // della pagella. Una squadra assente NON scrive la chiave: `""` non
    // diventa una squadra, resta «non dichiarata».
    soggetti.push({
      surface,
      ...(clubAltro === "" ? {} : { club: clubAltro }),
      ...(sharePercent === undefined ? {} : { sharePercent }),
    });
  }
  // La condizione non è riscritta qui: è `ballottaggioVisibile`, la funzione
  // che il riquadro d'asta usa per decidere che cosa mostrare. Il compilatore
  // CHIEDE alla vista — «con questa titolarità, questi nomi arriverebbero a
  // schermo?» — invece di sapere per conto proprio, che è il modo in cui due
  // regole identiche cominciano a divergere.
  if (soggetti.length > 0 && ballottaggioVisibile({ titolarita, ballottaggio: soggetti }).length === 0) {
    errors.push({
      field: "ballottaggio",
      message: "Questi nomi non verrebbero mostrati dal riquadro: gli altri del ballottaggio arrivano alla vista solo con la titolarità «ballottaggio». Scegli quella titolarità o togli i nomi.",
    });
  }

  let gerarchia: number | undefined;
  if (values.gerarchia.trim() !== "") {
    const parsed = parseInteger(values.gerarchia);
    if (parsed === null || parsed < SCHEDA_GERARCHIA_MIN || parsed > SCHEDA_GERARCHIA_MAX) {
      errors.push({
        field: "gerarchia",
        message: `La gerarchia è un intero fra ${SCHEDA_GERARCHIA_MIN} e ${SCHEDA_GERARCHIA_MAX} (1 = prima scelta).`,
      });
    } else {
      gerarchia = parsed;
    }
  }

  let rigori: Rigori | undefined;
  if (values.rigori !== "") {
    if ((RIGORI_VALUES as readonly string[]).includes(values.rigori)) {
      rigori = values.rigori as Rigori;
    } else {
      errors.push({ field: "rigori", message: "Designazione rigori fuori dal vocabolario della scheda." });
    }
  }

  const piazzatiPick = pickVocabulary<Piazzati>(values.piazzati, PIAZZATI_VALUES);
  if (piazzatiPick.unknown.length > 0) {
    errors.push({ field: "piazzati", message: "Calci piazzati fuori dal vocabolario della scheda." });
  }

  // ── I TRE RANGHI ─────────────────────────────────────────────────────────
  //
  // Due rifiuti, e sono due cose diverse. Il primo è di FORMA: un rango è un
  // intero fra 1 e 9, e lo dice col limite letto dal contratto, non con una
  // copia scritta qui. Il secondo è di COERENZA: un rango senza la sua fila
  // («secondo battitore d'angoli» su una scheda che non dichiara gli angoli)
  // è la contraddizione che il deposito rifiuta fail-closed — e rifiutarla
  // QUI, con la parola giusta e il campo giusto, è la differenza fra una
  // correzione di dieci secondi e un file rifiutato in blocco a cose fatte.
  //
  // L'ordine dei due controlli non è indifferente: si guarda prima la forma,
  // così un refuso non viene raccontato come un problema di coerenza.
  const rango = (
    field: SchedaField & ("rangoRigori" | "rangoPunizioni" | "rangoAngoli"),
    raw: string,
    fila: string,
    dichiarata: boolean,
  ): number | undefined => {
    if (raw.trim() === "") return undefined;
    const parsed = parseInteger(raw);
    if (parsed === null || parsed < SCHEDA_RANGO_MIN || parsed > SCHEDA_RANGO_MAX) {
      errors.push({
        field,
        message: `Il rango è un intero fra ${SCHEDA_RANGO_MIN} e ${SCHEDA_RANGO_MAX} (1 = il primo della fila). Lascia vuoto se la scheda non lo dichiara: vuoto non è zero.`,
      });
      return undefined;
    }
    if (!dichiarata) {
      errors.push({
        field,
        message: `Rango scritto senza ${fila}: un rango ordina una fila, e questa scheda non dice che il giocatore ne faccia parte.`,
      });
      return undefined;
    }
    return parsed;
  };

  const rangoRigori = rango(
    "rangoRigori",
    values.rangoRigori,
    "la designazione RIGORI",
    rigori !== undefined,
  );
  const rangoPunizioni = rango(
    "rangoPunizioni",
    values.rangoPunizioni,
    "«punizioni» fra i CALCI PIAZZATI",
    piazzatiPick.values.includes("punizioni"),
  );
  const rangoAngoli = rango(
    "rangoAngoli",
    values.rangoAngoli,
    "«angoli» fra i CALCI PIAZZATI",
    piazzatiPick.values.includes("angoli"),
  );
  const avvisiPick = pickVocabulary<Avviso>(values.avvisi, AVVISO_VALUES);
  if (avvisiPick.unknown.length > 0) {
    errors.push({ field: "avvisi", message: "Avvisi fuori dal vocabolario della scheda." });
  }

  // ── LA LISTA EDITORIALE ──────────────────────────────────────────────────
  //
  // Vocabolario chiuso e `""` = ASSENZA, tenuta distinta dai tre valori: non
  // esiste una quarta lista «nessuna», esiste una scheda che non lo dice. È la
  // stessa forma di `titolarita`, `rigori` e `fonte`, e il riquadro la legge
  // così — `resolveListaEsperti` rende `null`, e la quarta icona resta spenta.
  //
  // Non è un consiglio d'asta e non può diventarlo: dice IN QUALE LISTA la
  // fonte ha messo il giocatore, come `fonte` dice chi parla.
  let lista: ListaEsperti | undefined;
  if (values.lista !== "") {
    if ((LISTA_ESPERTI_VALUES as readonly string[]).includes(values.lista)) {
      lista = values.lista as ListaEsperti;
    } else {
      errors.push({ field: "lista", message: "Lista fuori dal vocabolario della scheda." });
    }
  }

  // `.trim()` prima di misurare perché è quello che misura lo schema
  // (`z.string().trim().max(...)`): il contatore a schermo e il limite che
  // rifiuta devono contare la STESSA cosa.
  const nota = values.nota.trim();
  if (nota.length > SCHEDA_NOTA_MAX) {
    errors.push({
      field: "nota",
      message: `La nota supera ${SCHEDA_NOTA_MAX} caratteri di ${nota.length - SCHEDA_NOTA_MAX}: accorciala. Non viene tagliata da sola.`,
    });
  }

  let aggiornata: string | undefined;
  if (values.aggiornata.trim() !== "") {
    const iso = values.aggiornata.trim();
    if (!isValidIsoDate(iso)) {
      errors.push({ field: "aggiornata", message: "La data va scritta come AAAA-MM-GG e deve esistere sul calendario." });
    } else {
      aggiornata = iso;
    }
  }

  let fonte: Fonte | undefined;
  if (values.fonte !== "") {
    if ((FONTE_VALUES as readonly string[]).includes(values.fonte)) {
      fonte = values.fonte as Fonte;
    } else {
      errors.push({ field: "fonte", message: "Fonte fuori dal vocabolario della scheda." });
    }
  }

  // La pagella: i cinque voti col ruolo della RIGA accanto, perché è la riga a
  // sapere quale sia il quarto asse — la scheda non dichiara un ruolo, e
  // chiederglielo aprirebbe una seconda verità sull'identità del giocatore.
  const pagellaBuild = buildSchedaPagella(values.pagella, target.role);
  errors.push(...pagellaBuild.errors);
  const pagella = pagellaHasContent(pagellaBuild.pagella) ? pagellaBuild.pagella : undefined;

  if (errors.length > 0) return { ok: false, errors };

  const scheda: ExpertScheda = {
    player,
    club,
    ...(titolarita === undefined ? {} : { titolarita }),
    ...(percentuale === undefined ? {} : { percentuale }),
    ...(soggetti.length === 0 ? {} : { ballottaggio: soggetti }),
    ...(gerarchia === undefined ? {} : { gerarchia }),
    ...(rigori === undefined ? {} : { rigori }),
    // NELL'ORDINE DELLA `shape` DEL CONTRATTO, rango subito dopo la sua fila:
    // zod ricostruisce in quell'ordine e questo file scrive nello stesso, o
    // scarica → reimporta → riscarica renderebbe due file diversi a parità di
    // contenuto (src/expertScheda.ts, il commento sull'ordine delle chiavi).
    ...(rangoRigori === undefined ? {} : { rangoRigori }),
    ...(piazzatiPick.values.length === 0 ? {} : { piazzati: piazzatiPick.values }),
    ...(rangoPunizioni === undefined ? {} : { rangoPunizioni }),
    ...(rangoAngoli === undefined ? {} : { rangoAngoli }),
    ...(avvisiPick.values.length === 0 ? {} : { avvisi: avvisiPick.values }),
    ...(lista === undefined ? {} : { lista }),
    ...(nota === "" ? {} : { nota }),
    ...(aggiornata === undefined ? {} : { aggiornata }),
    ...(fonte === undefined ? {} : { fonte }),
    // Una pagella VUOTA non entra: `{ voti: {} }` passerebbe lo schema e
    // sarebbe una chiave in più che non dice niente — e `schedaHasContent` la
    // conta per zero, quindi la scheda finirebbe comunque «aperta ma vuota».
    ...(pagella === undefined ? {} : { pagella }),
  };

  // Aperta ≠ compilata: una scheda senza un solo segnale e senza prosa è
  // valida per lo schema ma il riquadro la rende come «nessun segnale esperto»
  // (resolveExpertInsight). Salvarla farebbe salire il contatore di avanzamento
  // su un lavoro che a schermo non esiste.
  if (!schedaHasContent(scheda)) {
    return {
      ok: false,
      errors: [
        {
          field: "scheda",
          message: "La scheda non dice ancora niente: senza almeno un segnale o una nota il riquadro la leggerebbe come «nessun segnale esperto».",
        },
      ],
    };
  }

  // L'oracolo, sulla scheda singola: se il contratto la rifiuta ora, il
  // deposito intero verrebbe rifiutato dopo — e allora sarebbe tardi.
  if (!parseExpertSchedaDeposit(depositTextOf([scheda])).ok) {
    return {
      ok: false,
      errors: [{ field: "scheda", message: "Il contratto del deposito ha rifiutato questa scheda. Rivedi i campi." }],
    };
  }

  return { ok: true, scheda };
}

/** La scheda salvata -> il modulo, per riaprirla e correggerla. */
export function schedaToForm(scheda: ExpertScheda): SchedaFormValues {
  const voti = scheda.pagella?.voti ?? {};
  const pagella: SchedaPagellaValues = {
    ...EMPTY_SCHEDA_PAGELLA,
    // Un voto assente torna `""`, mai `"0"`: la distinzione fra «non estratto»
    // e «zero» è la stessa in lettura e in scrittura, o non è.
    ...Object.fromEntries(
      PAGELLA_ASSI_TUTTI.map((asse) => [asse, voti[asse] === undefined ? "" : String(voti[asse])]),
    ),
    totaleFonte: scheda.pagella?.totaleFonte === undefined ? "" : String(scheda.pagella.totaleFonte),
  };
  return {
    titolarita: scheda.titolarita ?? "",
    percentuale: scheda.percentuale === undefined ? "" : String(scheda.percentuale),
    // Una squadra assente torna `""`, mai la squadra del giocatore della riga:
    // riaprire una scheda vecchia non è il momento in cui indovinarle una metà
    // d'identità che non ha mai avuto. Resta vuota, il modulo lo mostra, e il
    // salvataggio non scrive la chiave — la stessa regola dei voti qui sotto.
    ballottaggio: (scheda.ballottaggio ?? []).map((soggetto) => ({
      surface: soggetto.surface,
      club: soggetto.club ?? "",
      sharePercent: soggetto.sharePercent === undefined ? "" : String(soggetto.sharePercent),
    })),
    gerarchia: scheda.gerarchia === undefined ? "" : String(scheda.gerarchia),
    rigori: scheda.rigori ?? "",
    // Un rango assente torna `""`, mai `"0"` e mai un numero dedotto
    // dall'ordine in cui le schede sono state scritte: riaprire una scheda del
    // deposito vecchio non è il momento in cui inventarle una posizione.
    rangoRigori: scheda.rangoRigori === undefined ? "" : String(scheda.rangoRigori),
    piazzati: [...(scheda.piazzati ?? [])],
    rangoPunizioni: scheda.rangoPunizioni === undefined ? "" : String(scheda.rangoPunizioni),
    rangoAngoli: scheda.rangoAngoli === undefined ? "" : String(scheda.rangoAngoli),
    avvisi: [...(scheda.avvisi ?? [])],
    lista: scheda.lista ?? "",
    nota: scheda.nota ?? "",
    aggiornata: scheda.aggiornata ?? "",
    fonte: scheda.fonte ?? "",
    pagella,
  };
}

// ── L'avanzamento ────────────────────────────────────────────────────────────

/**
 * Quante schede sono scritte e quante mancano, sulle righe del listone caricato.
 *
 * `orphans` non è un dettaglio contabile: sono schede scritte su righe che il
 * listone caricato ORA non ha più (listone ricaricato, riga cambiata di nome).
 * Restano nel deposito e restano contate a parte, perché sparire dal conteggio
 * senza dirlo è il modo in cui il lavoro si perde senza un errore.
 */
export interface SchedaProgress {
  readonly total: number;
  readonly written: number;
  readonly missing: number;
  readonly orphans: number;
  /** 0..100 interi. `0` quando non c'è listone: nessun avanzamento su nulla. */
  readonly percent: number;
}

export function schedaProgress(
  rowKeys: Iterable<string>,
  schede: ReadonlyMap<string, ExpertScheda>,
): SchedaProgress {
  const keys = new Set(rowKeys);
  let written = 0;
  for (const key of keys) if (schede.has(key)) written += 1;
  const total = keys.size;
  let orphans = 0;
  for (const key of schede.keys()) if (!keys.has(key)) orphans += 1;
  return {
    total,
    written,
    missing: total - written,
    orphans,
    percent: total === 0 ? 0 : Math.round((written / total) * 100),
  };
}

// ── Il deposito ──────────────────────────────────────────────────────────────

export type SchedaDepositResult =
  | { readonly ok: true; readonly text: string; readonly count: number }
  | { readonly ok: false; readonly reason: "empty" }
  | { readonly ok: false; readonly reason: "invalid" }
  | { readonly ok: false; readonly reason: "duplicate"; readonly identities: readonly string[] };

/**
 * Il TESTO del deposito, pronto da scaricare — o il motivo per cui non lo è.
 *
 * Tre rifiuti, tutti dichiarati a chi compila e nessuno silenzioso:
 *  - `empty`     — nessuna scheda scritta: non c'è niente da depositare;
 *  - `invalid`   — il contratto lo rifiuta. Non dovrebbe accadere (ogni scheda
 *                  ci è già passata da sola), e proprio per questo va detto
 *                  invece di consegnare un file rotto;
 *  - `duplicate` — due schede finiscono sulla STESSA identità di listone. Il
 *                  file sarebbe valido, ma `resolveExpertInsight` renderebbe
 *                  quel giocatore come `identity_not_resolved` invece di
 *                  mostrarne una: cioè due schede scritte e zero lette.
 *
 * Indentato a due spazi: il deposito lo rilegge un umano, e un file su una riga
 * sola non si controlla a occhio.
 */
export function buildSchedaDeposit(schede: ReadonlyMap<string, ExpertScheda>): SchedaDepositResult {
  const list = [...schede.values()];
  if (list.length === 0) return { ok: false, reason: "empty" };
  const text = depositTextOf(list);
  const store = parseExpertSchedaDeposit(text);
  if (!store.ok) return { ok: false, reason: "invalid" };
  const identities: string[] = [];
  for (const [, bucket] of store.byPlayerKey) {
    const first = bucket[0];
    if (bucket.length > 1 && first !== undefined) identities.push(`${first.player} (${first.club})`);
  }
  if (identities.length > 0) return { ok: false, reason: "duplicate", identities };
  return { ok: true, text, count: list.length };
}

// ── RIPRENDERE UN DEPOSITO GIÀ SCRITTO ───────────────────────────────────────
//
// PERCHÉ IL GIRO SI CHIUDE SOLO QUI. Le due ore di compilazione sono
// distribuite su più sere, e finché il deposito usciva a senso unico —
// si scarica, non si ricarica — il lavoro viveva SOLO in `localStorage`: un
// browser pulito, un'altra macchina o una cronologia svuotata e le due ore
// sparivano senza che nessuno se ne accorgesse. È la stessa classe di difetto
// silenzioso che tutto questo pannello esiste per non avere. E c'è il caso
// normale, non solo quello sfortunato: il deposito è su Drive da tre giorni e
// un ballottaggio è cambiato — senza rilettura l'unica strada è riscrivere.
//
// L'IDENTITÀ SI RIAGGANCIA PER UGUAGLIANZA ESATTA, e non con la regola a
// contenimento di `findSchedaCandidates`. Le due servono a cose diverse: là si
// legge un deposito scritto da fonti che usano il nome intero contro un listone
// che scrive il cognome, e un aggancio dedotto viene DICHIARATO a schermo prima
// di essere creduto; qui si RISCRIVE l'archivio locale, e un aggancio dedotto
// male attaccherebbe in silenzio la scheda di un giocatore alla riga di un
// altro. Una scheda che non trova la sua riga non viene persa: entra con la
// propria identità come chiave e il pannello la conta fra quelle «senza riga
// nel listone», che è un fatto visibile invece di un'ipotesi.
//
// LA FUSIONE NON SI DECIDE DA SOLA. Le schede del file che NON esistono in
// locale entrano sempre (aggiungono, non distruggono: non c'è niente da
// perdere e quindi niente da chiedere). Le schede in CONFLITTO — stessa riga,
// due versioni — non si sovrascrivono e non si scartano: chi chiama deve
// portare una decisione, e senza quella `applySchedaImport` rende `null`
// invece di sceglierne una.

/** Una scheda del file, con la riga di listone su cui è finita. */
export interface SchedaImportEntry {
  readonly rowKey: string;
  readonly player: string;
  readonly club: string;
  /** `false` quando nessuna riga del listone caricato ha questa identità. */
  readonly matched: boolean;
}

export interface SchedaImportPlan {
  /** riga di listone -> scheda del file. Ordine: quello del file. */
  readonly incoming: ReadonlyMap<string, ExpertScheda>;
  /** Le schede del file su righe che in locale non hanno ancora niente. */
  readonly fresh: readonly SchedaImportEntry[];
  /** Le schede del file su righe che in locale hanno GIÀ una scheda. */
  readonly conflicts: readonly SchedaImportEntry[];
  /** Le schede del file che non corrispondono a nessuna riga del listone. */
  readonly unmatched: readonly SchedaImportEntry[];
}

export type SchedaImportResult =
  | { readonly ok: true; readonly plan: SchedaImportPlan }
  | { readonly ok: false; readonly reason: "absent" | "unreadable" | "invalid" | "empty" }
  | { readonly ok: false; readonly reason: "duplicate"; readonly identities: readonly string[] };

/** L'identità di una riga di listone: la stessa metà con cui il deposito indicizza. */
export interface SchedaImportRow {
  readonly rowKey: string;
  readonly name: string;
  readonly club: string;
}

/**
 * Il testo di un deposito -> che cosa succederebbe a importarlo. NON importa
 * niente: risponde soltanto, e la risposta è ciò che il pannello mostra prima
 * di chiedere conferma.
 *
 * Il rifiuto passa per `parseExpertSchedaDeposit`, la funzione vera: un file
 * illeggibile o non conforme non produce una lettura parziale e non tocca
 * niente di ciò che c'è già — la stessa postura fail-closed del deposito
 * servito a runtime, per la stessa ragione (metà schede sarebbe peggio di
 * nessuna scheda, e qui in più cancellerebbe del lavoro).
 */
export function planSchedaImport(
  rawText: string | null,
  rows: Iterable<SchedaImportRow>,
  current: ReadonlyMap<string, ExpertScheda>,
): SchedaImportResult {
  const store = parseExpertSchedaDeposit(rawText);
  if (!store.ok) return { ok: false, reason: store.reason };

  // identità (nome+squadra piegati) -> chiave della riga di listone. La chiave
  // di riga può essere un `proxy:` che dal nome non si ricostruisce, quindi
  // l'indice va costruito nel verso giusto una volta sola.
  const identityToRow = new Map<string, string>();
  for (const row of rows) {
    const identity = listonePlayerKey({ name: row.name, club: row.club });
    if (!identityToRow.has(identity)) identityToRow.set(identity, row.rowKey);
  }

  const duplicates: string[] = [];
  for (const [, bucket] of store.byPlayerKey) {
    const first = bucket[0];
    if (bucket.length > 1 && first !== undefined) duplicates.push(`${first.player} (${first.club})`);
  }
  // Lo stesso rifiuto che `buildSchedaDeposit` oppone in uscita: due schede
  // sulla stessa identità sono un file valido che a schermo non mostra niente.
  if (duplicates.length > 0) return { ok: false, reason: "duplicate", identities: duplicates };

  const incoming = new Map<string, ExpertScheda>();
  const fresh: SchedaImportEntry[] = [];
  const conflicts: SchedaImportEntry[] = [];
  const unmatched: SchedaImportEntry[] = [];
  for (const [identity, bucket] of store.byPlayerKey) {
    const scheda = bucket[0];
    if (scheda === undefined) continue;
    const mapped = identityToRow.get(identity);
    const entry: SchedaImportEntry = {
      rowKey: mapped ?? identity,
      player: scheda.player,
      club: scheda.club,
      matched: mapped !== undefined,
    };
    incoming.set(entry.rowKey, scheda);
    (current.has(entry.rowKey) ? conflicts : fresh).push(entry);
    if (!entry.matched) unmatched.push(entry);
  }
  if (incoming.size === 0) return { ok: false, reason: "empty" };
  return { ok: true, plan: { incoming, fresh, conflicts, unmatched } };
}

/** Che cosa fare delle schede in conflitto. Non ha un valore di riposo. */
export type SchedaImportResolution = "keep-local" | "take-file";

/**
 * L'archivio dopo l'importazione, o `null` quando manca la decisione che serve.
 *
 * `null` NON è un errore tecnico: è «ci sono conflitti e nessuno ha ancora
 * detto che cosa farne». Renderlo invece di scegliere è l'intero punto di
 * questa funzione — una fusione automatica sceglierebbe per Pico proprio dove
 * la scelta costa del lavoro.
 *
 * L'ordine è deterministico: le schede locali restano dove sono, quelle nuove
 * si accodano nell'ordine del file.
 */
export function applySchedaImport(
  current: ReadonlyMap<string, ExpertScheda>,
  plan: SchedaImportPlan,
  resolution: SchedaImportResolution | null,
): ReadonlyMap<string, ExpertScheda> | null {
  if (plan.conflicts.length > 0 && resolution === null) return null;
  const next = new Map(current);
  for (const [rowKey, scheda] of plan.incoming) {
    if (next.has(rowKey) && resolution === "keep-local") continue;
    next.set(rowKey, scheda);
  }
  return next;
}

// ── Il riassunto di una scheda, per rileggerla senza riaprirla ───────────────

/**
 * Una riga di parole per una scheda salvata: le stesse etichette che il riquadro
 * mostra a schermo (src/ui/expertInsight.ts), non una seconda traduzione del
 * vocabolario. Puro: nessun `Date`, nessun `Intl`, nessun DOM.
 */
export function schedaSummary(scheda: ExpertScheda): string {
  const parts: string[] = [];
  if (scheda.titolarita !== undefined) {
    const share = scheda.percentuale === undefined ? "" : ` ${scheda.percentuale}%`;
    parts.push(`${TITOLARITA_LABELS[scheda.titolarita]}${share}`);
  }
  // Gli altri del ballottaggio, ciascuno con la propria squadra e la propria
  // quota quando ci sono. Una quota assente resta assente: nessun «0%»
  // fabbricato accanto a un nome. Una SQUADRA assente si DICE — `n/d` col
  // motivo, mai una squadra dedotta: è la riga in cui un deposito scritto prima
  // di questa forma dichiara di non poter distinguere due omonimi.
  const soggetti = scheda.ballottaggio ?? [];
  if (soggetti.length > 0) {
    const nomi = soggetti.map((s) => {
      const quota = s.sharePercent === undefined ? "" : ` ${s.sharePercent}%`;
      return `${s.surface} (${s.club ?? SCHEDA_CLUB_NON_DICHIARATA})${quota}`;
    });
    parts.push(`con: ${nomi.join(", ")}`);
  }
  if (scheda.gerarchia !== undefined) parts.push(gerarchiaLabel(scheda.gerarchia));
  // IL RANGO SI RILEGGE INSIEME AL SEGNALE CHE ORDINA, con le stesse parole di
  // ogni altra superficie (`conRango`, src/ui/schedaLabels.ts): chi rilegge la
  // scheda che ha appena scritto deve vedere «1° designato», cioè quello che
  // vedrà nel listone e sotto l'icona, non una terza forma inventata qui.
  if (scheda.rigori !== undefined) {
    parts.push(`rigori: ${conRango(RIGORI_LABELS[scheda.rigori], scheda.rangoRigori)}`);
  }
  const piazzati = scheda.piazzati ?? [];
  if (piazzati.length > 0) {
    const ranghi: Readonly<Record<Piazzati, number | undefined>> = {
      punizioni: scheda.rangoPunizioni,
      angoli: scheda.rangoAngoli,
    };
    parts.push(
      `piazzati: ${piazzati.map((p) => conRango(PIAZZATI_LABELS[p], ranghi[p])).join(", ")}`,
    );
  }
  for (const avviso of scheda.avvisi ?? []) parts.push(`! ${AVVISO_LABELS[avviso]}`);
  // LA MARCATURA SI VEDE ANCHE QUI, e non è una rifinitura: il compilatore è
  // il posto in cui una persona RIVEDE le schede importate dal modulo, cioè il
  // solo momento in cui può decidere di riscrivere una prosa che ha scritto un
  // modello. Senza questa parola le due prose si distinguono solo aprendo il
  // campo e leggendo la parentesi quadra.
  //
  // IL CONTEGGIO RESTA SULLA STRINGA INTERA, marcatura compresa: è un budget di
  // caratteri contro `SCHEDA_NOTA_MAX`, e il tetto lo misura tutto.
  const notaGrezza = (scheda.nota ?? "").trim();
  if (notaGrezza !== "") {
    const marcata = leggiNota(notaGrezza).generataDaModello
      ? `, ${SCHEDA_NOTA_MARCATURA_PAROLE}`
      : "";
    parts.push(`nota (${notaGrezza.length} caratteri${marcata})`);
  }
  // La lista COME LA SCHEDA LA SCRIVE, non `resolveListaEsperti`: qui si
  // rilegge ciò che si è compilato, e l'avviso `sconsigliato` — che nella vista
  // avrebbe la precedenza — è già scritto due righe più su come avviso. La
  // precedenza è una regola della VISTA, non un modo di riassumere il campo.
  if (scheda.lista !== undefined) parts.push(`lista: ${LISTA_ESPERTI_LABELS[scheda.lista]}`);
  if (scheda.pagella !== undefined && pagellaHasContent(scheda.pagella)) {
    // Nessun ruolo da passare: il riassunto rilegge la scheda, non una riga di
    // listone. `resolvePagella` senza ruolo mostra l'asse che la scheda stessa
    // dichiara — che è esattamente ciò che qui si sta rileggendo.
    const view = resolvePagella(scheda.pagella, null);
    const totale = view.completa
      ? `${view.totaleRicalcolato}/${PAGELLA_TOTALE_MAX}`
      : PAGELLA_ASSENTE;
    const dichiarato =
      view.totaleFonte === null
        ? ""
        : `, dichiarato ${view.totaleFonte}/${PAGELLA_TOTALE_MAX}${view.verificaTotale === "divergente" ? " — non torna" : ""}`;
    parts.push(`pagella: ${view.votiPresenti}/${PAGELLA_ASSI} voti, somma ${totale}${dichiarato}`);
  }
  if (scheda.fonte !== undefined) parts.push(FONTE_LABELS[scheda.fonte]);
  if (scheda.aggiornata !== undefined) parts.push(formatSchedaDate(scheda.aggiornata));
  return parts.join(" · ");
}

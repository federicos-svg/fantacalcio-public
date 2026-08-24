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
// NIENTE DI DIRETTIVO, MAI. Non c'è (e non può entrare) `value`, `fair_to_me`,
// `target_band`, un prezzo, un `maxBid` o un punteggio: lo schema `.strict()`
// del contratto rifiuta qualunque chiave che non sia nel suo vocabolario, e
// questo modulo non ne inventa nessuna — docs/NO_GO.md §Prodotto.

import { z } from "zod";
import type { StorageLike } from "./logRecovery.js";
import {
  AVVISO_VALUES,
  EXPERT_SCHEDA_SCHEMA_VERSION,
  FONTE_VALUES,
  PIAZZATI_VALUES,
  RIGORI_VALUES,
  SCHEDA_GERARCHIA_MAX,
  SCHEDA_GERARCHIA_MIN,
  SCHEDA_NAME_MAX,
  SCHEDA_NOTA_MAX,
  SCHEDA_PERCENTUALE_MAX,
  SCHEDA_PERCENTUALE_MIN,
  TITOLARITA_VALUES,
  isValidIsoDate,
  parseExpertSchedaDeposit,
  schedaHasContent,
  type Avviso,
  type ExpertScheda,
  type Fonte,
  type Piazzati,
  type Rigori,
  type SchedaTarget,
  type Titolarita,
} from "./expertScheda.js";
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
  readonly gerarchia: string;
  readonly rigori: string;
  readonly piazzati: readonly string[];
  readonly avvisi: readonly string[];
  readonly nota: string;
  readonly aggiornata: string;
  readonly fonte: string;
}

export const EMPTY_SCHEDA_FORM: SchedaFormValues = {
  titolarita: "",
  percentuale: "",
  gerarchia: "",
  rigori: "",
  piazzati: [],
  avvisi: [],
  nota: "",
  aggiornata: "",
  fonte: "",
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

const formSchema = z
  .object({
    titolarita: z.string(),
    percentuale: z.string(),
    gerarchia: z.string(),
    rigori: z.string(),
    piazzati: z.array(z.string()),
    avvisi: z.array(z.string()),
    nota: z.string(),
    aggiornata: z.string(),
    fonte: z.string(),
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
  | "gerarchia"
  | "rigori"
  | "piazzati"
  | "avvisi"
  | "nota"
  | "aggiornata"
  | "fonte"
  | "scheda";

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
  const avvisiPick = pickVocabulary<Avviso>(values.avvisi, AVVISO_VALUES);
  if (avvisiPick.unknown.length > 0) {
    errors.push({ field: "avvisi", message: "Avvisi fuori dal vocabolario della scheda." });
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

  if (errors.length > 0) return { ok: false, errors };

  const scheda: ExpertScheda = {
    player,
    club,
    ...(titolarita === undefined ? {} : { titolarita }),
    ...(percentuale === undefined ? {} : { percentuale }),
    ...(gerarchia === undefined ? {} : { gerarchia }),
    ...(rigori === undefined ? {} : { rigori }),
    ...(piazzatiPick.values.length === 0 ? {} : { piazzati: piazzatiPick.values }),
    ...(avvisiPick.values.length === 0 ? {} : { avvisi: avvisiPick.values }),
    ...(nota === "" ? {} : { nota }),
    ...(aggiornata === undefined ? {} : { aggiornata }),
    ...(fonte === undefined ? {} : { fonte }),
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
  return {
    titolarita: scheda.titolarita ?? "",
    percentuale: scheda.percentuale === undefined ? "" : String(scheda.percentuale),
    gerarchia: scheda.gerarchia === undefined ? "" : String(scheda.gerarchia),
    rigori: scheda.rigori ?? "",
    piazzati: [...(scheda.piazzati ?? [])],
    avvisi: [...(scheda.avvisi ?? [])],
    nota: scheda.nota ?? "",
    aggiornata: scheda.aggiornata ?? "",
    fonte: scheda.fonte ?? "",
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
  if (scheda.gerarchia !== undefined) parts.push(gerarchiaLabel(scheda.gerarchia));
  if (scheda.rigori !== undefined) parts.push(`rigori: ${RIGORI_LABELS[scheda.rigori]}`);
  const piazzati = scheda.piazzati ?? [];
  if (piazzati.length > 0) parts.push(`piazzati: ${piazzati.map((p) => PIAZZATI_LABELS[p]).join(", ")}`);
  for (const avviso of scheda.avvisi ?? []) parts.push(`! ${AVVISO_LABELS[avviso]}`);
  const nota = (scheda.nota ?? "").trim();
  if (nota !== "") parts.push(`nota (${nota.length} caratteri)`);
  if (scheda.fonte !== undefined) parts.push(FONTE_LABELS[scheda.fonte]);
  if (scheda.aggiornata !== undefined) parts.push(formatSchedaDate(scheda.aggiornata));
  return parts.join(" · ");
}

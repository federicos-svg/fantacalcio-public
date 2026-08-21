// CHI ERA IN GARA — il flag che si mette al submit, e la coda locale che lo
// tiene al sicuro senza mai mettersi in mezzo all'acquisto.
//
// PERCHÉ ESISTE. Durante la serata si registrano gli acquisti, non i rilanci
// (Pico, 2026-08-21: «non metterò ogni singolo rilancio»). Non esiste quindi
// alcun flusso da cui dedurre chi voleva un giocatore: la marcatura fatta a
// mano nel momento in cui si registra l'assegnazione è l'UNICA fonte di
// interesse che l'asta produrrà. Il contratto dei profili avversario lo
// prevedeva già: `engagements` è «uno stream separato» senza produttore nel
// repo (OPPONENT_PROFILE_CONTRACT.md §4.1), e questo modulo è il posto in cui
// quello stream comincia a esistere — dalla parte locale, in coda.
//
// IL VINCOLO CHE GOVERNA TUTTO IL RESTO: IL FLAG NON PUÒ FAR FALLIRE
// L'ACQUISTO. Mai. L'assegnazione è l'unica cosa che la sera dell'asta deve
// riuscire sempre, quindi qui NON si applica il fail-closed del log d'asta:
//
//   - il log d'asta (logRecovery.ts) è fail-closed di proposito — se non si
//     salva, l'acquisto NON è avvenuto, e va detto;
//   - questa coda è best-effort — se non si salva, l'acquisto è avvenuto lo
//     stesso e il flag resta in memoria per la sessione, dichiarato come non
//     persistito.
//
// Le due discipline convivono senza contraddirsi perché parlano di due cose
// diverse: la contabilità dell'asta e un dato di contorno. Nessuna funzione di
// questo modulo può far cadere un acquisto, e nessuna lancia: ogni esito è un
// valore di ritorno.
//
// NON TOCCA IL LOG D'ASTA. Chiave di storage propria, envelope proprio,
// nessun `AuctionEvent` prodotto, nessuna riga che entri in `reduce()`: il
// flag non altera `max_safe`, non entra nella contabilità e non cambia niente
// di ciò che il motore calcola. Il legame con l'acquisto è il `purchaseSeq`,
// letto — mai scritto — dal log.
//
// OFFLINE È UNO STATO NORMALE, NON UN ERRORE. La coda è locale per
// costruzione: nessuna rete qui dentro, nessun tentativo di spedizione. La
// corsia che la spedirà (scrittura su Drive) è un'altra e non è implementata
// da questo modulo.
//
// IL VOID NON SI PROPAGA QUI, E NON È UNA DIMENTICANZA. La coda non osserva
// il log e non cancella nulla quando un acquisto viene annullato. Due motivi,
// entrambi deliberati:
//
//   1. il fatto registrato è «questi avversari si sono fatti sotto per quel
//      giocatore», ed è vero anche se poi la vendita è stata annullata: è
//      un'osservazione del tavolo, non una riga di contabilità;
//   2. il legame con l'acquisto è il `purchaseSeq`, e il log resta l'UNICA
//      autorità su che cosa sta in piedi. Un consumatore che voglia scartare i
//      flag delle vendite annullate lo fa incrociando i due, come già fa
//      `computeOpponentCounters()` (contratto §5). Una seconda copia della
//      regola del VOID, dentro questo modulo, potrebbe divergere dalla prima.
//
// PRIVACY. Si registrano POSTI (`fantaTeamId`), mai persone e mai etichette
// umane: è la stessa forma che l'event log usa già, e il registro lega
// (src/leagueTeams.ts) resta l'unico ponte verso un nome. Lo schema è
// `.strict()`, quindi una chiave `name`/`displayName` finita qui per sbaglio è
// un errore di validazione, non un dato salvato in silenzio
// (docs/data/OPPONENT_PROFILE_CONTRACT.md §1, garanzie 1 e 2).

import { z } from "zod";
import type { StorageLike } from "./logRecovery.js";

export const INTEREST_FLAGS_STORAGE_KEY = "fac_interest_flags";
export const INTEREST_FLAGS_QUARANTINE_STORAGE_KEY = "fac_interest_flags_quarantine";
export const INTEREST_FLAGS_SCHEMA_VERSION = 1;

/**
 * Tetto della coda. Un'asta di lega ha 8 posti × 25 slot = 200 acquisti al
 * massimo: 400 voci sono il doppio di un'asta intera, quindi il tetto non può
 * mordere durante una serata reale e serve solo a impedire che una coda mai
 * svuotata cresca senza fine nello storage del browser. Quando morde si
 * scartano le voci PIÙ VECCHIE, mai la più recente: la marcatura appena fatta
 * è quella che l'operatore ha ancora in mente.
 */
export const INTEREST_FLAGS_QUEUE_MAX = 400;

const interestFlagSchema = z
  .object({
    purchaseSeq: z.number().int().nonnegative(),
    playerId: z.string().min(1),
    /** Il posto che ha vinto l'asta — dal log, non una seconda verità. */
    winnerFantaTeamId: z.string().min(1),
    price: z.number().int().nonnegative(),
    /**
     * I posti marcati come «era in gara». Elenco eventualmente VUOTO: non
     * marcare nulla è un esito normale e va distinto da «non ho chiesto».
     * Chi ha vinto NON viene tolto da qui: il flag registra ciò che
     * l'operatore ha marcato, e la sottrazione (se serve) è del consumatore.
     */
    contenders: z.array(z.string().min(1)),
    /** ISO 8601, dal chiamante: questo modulo non legge l'orologio. */
    flaggedAt: z.string().min(1),
  })
  .strict();

const interestFlagsEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(INTEREST_FLAGS_SCHEMA_VERSION),
    pending: z.array(interestFlagSchema),
  })
  .strict();

export type InterestFlag = z.infer<typeof interestFlagSchema>;

// ── I/O che non lancia mai ──────────────────────────────────────────────
// Stessa forma dei safeGetItem/safeSetItem di confirmationsStore.ts. Qui la
// regola «non lancia mai» non è una comodità: è il vincolo del task.

type ReadResult =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly message: string };

type WriteResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

function safeGetItem(storage: StorageLike, key: string): ReadResult {
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function safeSetItem(storage: StorageLike, key: string, value: string): WriteResult {
  try {
    storage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ── Load ────────────────────────────────────────────────────────────────

export type LoadInterestFlagsResult =
  /** La chiave non è mai stata scritta: coda vuota, nulla da dire. */
  | { readonly status: "none"; readonly pending: readonly InterestFlag[] }
  | { readonly status: "valid"; readonly pending: readonly InterestFlag[] }
  /** Contenuto illeggibile: messo in quarantena verbatim, coda ripartita vuota. */
  | {
      readonly status: "quarantined";
      readonly pending: readonly InterestFlag[];
      readonly quarantinedRaw: string;
      readonly quarantineStored: boolean;
    }
  /** Lo storage stesso non si è lasciato leggere. */
  | { readonly status: "storage-error"; readonly pending: readonly InterestFlag[]; readonly message: string };

/**
 * Rilegge la coda al boot, fail-SOFT.
 *
 * La disciplina è quella già usata dal recovery esistente — quarantena del
 * testo grezzo, mai una ri-derivazione a indovinare — ma l'esito è l'opposto
 * per costruzione: qui NIENTE blocca lo schermo. Una coda di flag illeggibile
 * non è una contabilità d'asta corrotta; è un dato di contorno che si è perso,
 * e far comparire una schermata di blocco per lui la sera dell'asta sarebbe
 * esattamente il difetto che questo modulo esiste per non avere.
 *
 * In tutti e quattro gli esiti `pending` è un array usabile: il chiamante non
 * deve mai distinguere i casi per poter continuare a lavorare.
 */
export function loadInterestFlags(storage: StorageLike): LoadInterestFlagsResult {
  const read = safeGetItem(storage, INTEREST_FLAGS_STORAGE_KEY);
  if (!read.ok) return { status: "storage-error", pending: [], message: read.message };
  const raw = read.value;
  if (raw === null) return { status: "none", pending: [] };

  const parsed = parseEnvelope(raw);
  if (parsed === null) {
    const quarantine = safeSetItem(storage, INTEREST_FLAGS_QUARANTINE_STORAGE_KEY, raw);
    return { status: "quarantined", pending: [], quarantinedRaw: raw, quarantineStored: quarantine.ok };
  }
  return { status: "valid", pending: parsed };
}

function parseEnvelope(raw: string): readonly InterestFlag[] | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = interestFlagsEnvelopeSchema.safeParse(json);
  return result.success ? result.data.pending : null;
}

// ── Enqueue ─────────────────────────────────────────────────────────────

export type EnqueueInterestFlagResult =
  /** Scritta nello storage: la coda su disco e quella in memoria coincidono. */
  | { readonly ok: true; readonly pending: readonly InterestFlag[] }
  /**
   * NON scritta. `pending` contiene comunque la voce nuova: la sessione la
   * conserva in memoria e il chiamante lo DICE, invece di far sparire in
   * silenzio una marcatura che l'operatore ha fatto davvero.
   */
  | {
      readonly ok: false;
      readonly reason: "invalid-entry" | "storage-error";
      readonly message: string;
      readonly pending: readonly InterestFlag[];
    };

/**
 * Accoda un flag, best-effort, senza mai lanciare.
 *
 * `current` è la coda che il chiamante ha in memoria, non una rilettura dello
 * storage: la sera dell'asta la verità di lavoro è quella in memoria, e
 * rileggere prima di ogni scrittura significherebbe che un `getItem` che
 * lancia possa impedire un `setItem` che invece sarebbe riuscito.
 *
 * Idempotente sul `purchaseSeq`: riaccodare lo stesso acquisto SOSTITUISCE la
 * voce esistente invece di aggiungerne una seconda — due marcature per lo
 * stesso acquisto sarebbero una contraddizione, non due fatti.
 */
export function enqueueInterestFlag(
  storage: StorageLike,
  current: readonly InterestFlag[],
  entry: InterestFlag,
): EnqueueInterestFlagResult {
  const validated = interestFlagSchema.safeParse(entry);
  if (!validated.success) {
    // Path del campo + codice, mai il valore che ha fallito (contratto §1).
    const issue = validated.error.issues[0];
    const where = issue === undefined ? "?" : `${issue.path.join(".") || "(root)"}:${issue.code}`;
    return {
      ok: false,
      reason: "invalid-entry",
      message: `Flag non conforme allo schema (${where}).`,
      pending: current,
    };
  }

  const next = capQueue([...current.filter((f) => f.purchaseSeq !== entry.purchaseSeq), validated.data]);
  const write = safeSetItem(
    storage,
    INTEREST_FLAGS_STORAGE_KEY,
    JSON.stringify({ schemaVersion: INTEREST_FLAGS_SCHEMA_VERSION, pending: next }),
  );
  if (!write.ok) return { ok: false, reason: "storage-error", message: write.message, pending: next };
  return { ok: true, pending: next };
}

function capQueue(entries: readonly InterestFlag[]): readonly InterestFlag[] {
  return entries.length <= INTEREST_FLAGS_QUEUE_MAX
    ? entries
    : entries.slice(entries.length - INTEREST_FLAGS_QUEUE_MAX);
}

// ── Vocabolario dell'esito, in un posto solo ────────────────────────────

/**
 * Che cosa dire quando la coda non si è salvata. Una frase sola, e la sua
 * prima metà è l'unica cosa che conta al tavolo: l'acquisto c'è.
 *
 * Non è un `role="alert"` e non è rosso: allarmare per un dato di contorno
 * mentre l'asta corre costerebbe più di quanto vale il dato.
 */
export const INTEREST_FLAG_NOT_PERSISTED_NOTICE =
  "Acquisto registrato. La marcatura «chi era in gara» resta solo in questa sessione: " +
  "non è stata scritta nello spazio locale del browser.";

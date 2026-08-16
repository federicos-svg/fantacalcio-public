// Opponent profiles — runtime-local persistence.
//
// THE POINT OF THIS FILE IS WHERE THE DATA IS *NOT*. Issue #234's privacy
// note: "i profili sono giudizi personali su persone reali della lega — mai
// versionati, mai loggati". The repo therefore carries the SCHEMA and this
// reader/writer, and never a profile: real profiles exist only in the
// browser's local storage on Owner's machine, written and read here.
//
// The consequence for callers: there is no export function, no download, no
// serialisation helper aimed at a file. Adding one would be the moment a real
// profile could land in a repo, a log, or an attachment — so the package does
// not provide the mechanism at all.
//
// Fail-closed and non-destructive, exactly like `src/leagueTeams.ts`
// (`loadLeagueRoster`): anything unparseable yields an EMPTY list rather than
// an exception, and a write is verified by reading it back so a silent
// quota/permission failure surfaces to the caller instead of losing an
// interview.

import {
  opponentProfileStoreSchema,
  validateOpponentProfileStore,
  zodIssuesToProfileIssues,
  type ProfileIssue,
} from "./profileSchema.js";
import {
  auctionHistoryStoreSchema,
  validateAuctionHistoryStore,
} from "./historySchema.js";
import {
  AUCTION_HISTORY_SCHEMA_VERSION,
  OPPONENT_PROFILE_SCHEMA_VERSION,
  type OpponentProfile,
  type PastAuctionPurchase,
} from "./types.js";

/**
 * The two-method storage surface this package needs. A structural mirror of
 * `src/logRecovery.ts`'s `StorageLike`, redefined rather than imported so the
 * package keeps no dependency on the app root; TypeScript's structural typing
 * makes a real `window.localStorage` assignable to it with zero coupling.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Runtime-local key. Never a file path, never a repo location. */
export const OPPONENT_PROFILES_STORAGE_KEY = "fac_opponent_profiles";

export type LoadOutcome =
  | { readonly ok: true; readonly profiles: readonly OpponentProfile[] }
  | {
      readonly ok: false;
      readonly reason: "absent" | "unreadable" | "invalid";
      readonly issues: readonly ProfileIssue[];
      /** Always empty — a failed load never yields a partial profile set. */
      readonly profiles: readonly [];
    };

/**
 * Reads the profile store.
 *
 * A malformed store is reported as `invalid` WITH its issues rather than
 * quietly returning nothing: on the night of the auction, "the profiles are
 * missing" and "the profiles are corrupt" call for different reactions, and
 * the issues are path+code only, so surfacing them is safe (profileSchema.ts).
 */
export function loadOpponentProfiles(
  storage: StorageLike,
  key: string = OPPONENT_PROFILES_STORAGE_KEY,
): LoadOutcome {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { ok: false, reason: "unreadable", issues: [], profiles: [] };
  }
  if (raw === null) return { ok: false, reason: "absent", issues: [], profiles: [] };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "unreadable", issues: [], profiles: [] };
  }

  const validated = validateOpponentProfileStore(json);
  if (!validated.ok) {
    return { ok: false, reason: "invalid", issues: validated.issues, profiles: [] };
  }
  return { ok: true, profiles: validated.store.profiles };
}

export type SaveOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "invalid" | "write-failed";
      readonly issues: readonly ProfileIssue[];
    };

/**
 * Writes the profile store, re-validating first and reading back after.
 *
 * Re-validating on the way OUT (not only on the way in) is what keeps an
 * object assembled in memory — by interview tooling, by a test, by a future
 * caller — from persisting a shape the reader would then refuse. And the
 * read-back is what turns a full-quota or blocked-storage failure into a
 * `write-failed` the caller can show, instead of an interview that silently
 * evaporates.
 */
export function saveOpponentProfiles(
  storage: StorageLike,
  profiles: readonly OpponentProfile[],
  key: string = OPPONENT_PROFILES_STORAGE_KEY,
): SaveOutcome {
  const parsed = opponentProfileStoreSchema.safeParse({
    schemaVersion: OPPONENT_PROFILE_SCHEMA_VERSION,
    profiles,
  });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", issues: zodIssuesToProfileIssues(parsed.error) };
  }
  const raw = JSON.stringify(parsed.data);
  try {
    storage.setItem(key, raw);
  } catch {
    return { ok: false, reason: "write-failed", issues: [] };
  }
  try {
    if (storage.getItem(key) !== raw) {
      return { ok: false, reason: "write-failed", issues: [] };
    }
  } catch {
    return { ok: false, reason: "write-failed", issues: [] };
  }
  return { ok: true };
}

/** Removes every stored profile. The only destructive operation offered. */
export function clearOpponentProfiles(
  storage: StorageLike,
  key: string = OPPONENT_PROFILES_STORAGE_KEY,
): boolean {
  try {
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Storico d'asta multi-stagione — stessa regola, stesso posto
// ---------------------------------------------------------------------------
//
// Lo storico d'asta di una lega reale è dato personale quanto un profilo, e per
// una ragione più diretta: dice, con nome e cognome dietro un `personId`, chi
// ha speso cosa per cinque stagioni. Vive quindi esattamente dove vivono i
// profili — nello storage locale del browser di Pico — e il repository ne
// porta lo schema, il lettore e i fatti sintetici delle fixture, mai una riga
// reale.
//
// Anche qui non esiste alcun helper di export verso file: il meccanismo con
// cui uno storico reale potrebbe uscire non è stato scritto, ed è il test di
// privacy a verificarlo per nome di funzione.

/** Chiave runtime-local. Mai un percorso, mai una destinazione remota. */
export const AUCTION_HISTORY_STORAGE_KEY = "fac_auction_history";

export type HistoryLoadOutcome =
  | { readonly ok: true; readonly purchases: readonly PastAuctionPurchase[] }
  | {
      readonly ok: false;
      readonly reason: "absent" | "unreadable" | "invalid";
      readonly issues: readonly ProfileIssue[];
      /** Sempre vuoto: un caricamento fallito non rende mai uno storico parziale. */
      readonly purchases: readonly [];
    };

/**
 * Legge lo storico d'asta.
 *
 * Uno storico malformato è riportato come `invalid` CON le sue issue, non
 * silenziosamente come assente: la sera dell'asta «lo storico non c'è» e «lo
 * storico è corrotto» chiedono due reazioni diverse, e le issue sono path +
 * codice (historySchema.ts), quindi mostrarle è sicuro.
 *
 * Uno storico parzialmente valido NON viene salvato a metà: i precedenti sono
 * conteggi, e un conteggio calcolato su metà delle righe è un numero sbagliato
 * con l'aria di un fatto.
 */
export function loadAuctionHistory(
  storage: StorageLike,
  key: string = AUCTION_HISTORY_STORAGE_KEY,
): HistoryLoadOutcome {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { ok: false, reason: "unreadable", issues: [], purchases: [] };
  }
  if (raw === null) return { ok: false, reason: "absent", issues: [], purchases: [] };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "unreadable", issues: [], purchases: [] };
  }

  const validated = validateAuctionHistoryStore(json);
  if (!validated.ok) {
    return { ok: false, reason: "invalid", issues: validated.issues, purchases: [] };
  }
  return { ok: true, purchases: validated.store.purchases };
}

/**
 * Scrive lo storico, ri-validando prima e rileggendo dopo — stesse due
 * ragioni di `saveOpponentProfiles()`: una struttura assemblata in memoria non
 * deve poter finire in una forma che il lettore rifiuterebbe, e una quota
 * piena deve diventare un `write-failed` visibile invece di uno storico
 * evaporato in silenzio.
 */
export function saveAuctionHistory(
  storage: StorageLike,
  purchases: readonly PastAuctionPurchase[],
  key: string = AUCTION_HISTORY_STORAGE_KEY,
): SaveOutcome {
  const parsed = auctionHistoryStoreSchema.safeParse({
    schemaVersion: AUCTION_HISTORY_SCHEMA_VERSION,
    purchases,
  });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", issues: zodIssuesToProfileIssues(parsed.error) };
  }
  const raw = JSON.stringify(parsed.data);
  try {
    storage.setItem(key, raw);
  } catch {
    return { ok: false, reason: "write-failed", issues: [] };
  }
  try {
    if (storage.getItem(key) !== raw) {
      return { ok: false, reason: "write-failed", issues: [] };
    }
  } catch {
    return { ok: false, reason: "write-failed", issues: [] };
  }
  return { ok: true };
}

/** Rimuove lo storico. L'unica operazione distruttiva offerta, come per i profili. */
export function clearAuctionHistory(
  storage: StorageLike,
  key: string = AUCTION_HISTORY_STORAGE_KEY,
): boolean {
  try {
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}

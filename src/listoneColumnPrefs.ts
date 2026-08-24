// LE COLONNE CHE PICO HA ACCESO O SPENTO — piccolo side-store persistente,
// sulla forma di src/leagueTeams.ts e src/schedaLinks.ts (zod `.strict()`,
// fail-closed a vuoto), non sulla macchina più grande di src/logRecovery.ts:
// qui non c'è nessuno stream di mutazioni da proteggere, solo una manciata di
// interruttori premuti una volta e riletti a ogni boot.
//
// PERCHÉ SI SALVANO LE DEVIAZIONI E NON L'ELENCO DELLE VISIBILI. La richiesta
// di Pico (2026-08-24) è «di default vedi solo le tue undici; le altre restano
// disponibili e le riaccendi quando vuoi». Salvare l'elenco assoluto delle
// colonne visibili sembra più semplice ed è la scelta sbagliata, per due
// motivi che si vedono solo dopo:
//
//  1. il default NON è costante — dipende dal pool (l'indice di appetibilità
//     esiste solo quando il deposito ne porta uno) e cambierà ancora quando i
//     voti del Gruppo Esperti verranno estratti. Un elenco assoluto scritto
//     oggi congelerebbe il default di oggi: una colonna aggiunta domani
//     resterebbe spenta per chiunque abbia mai toccato l'interruttore una
//     volta, senza che nessuno capisca perché;
//  2. una colonna che sparisce dal listone (una colonna extra di un file poi
//     sostituito) resterebbe scritta nell'archivio per sempre.
//
// Salvare invece le DEVIAZIONI — «questa l'ho spenta», «questa l'ho accesa» —
// tiene il default vivo: cambia il default, cambia ciò che si vede, e la
// scelta esplicita di Pico sopravvive comunque.
//
// FAIL-CLOSED A VUOTO, e la conseguenza è dichiarata: un archivio illeggibile
// non produce una tabella storta, produce LE UNDICI COLONNE DI DEFAULT. È la
// direzione giusta dell'errore — «riparto da quello che hai chiesto» invece di
// «ho ricostruito a metà quello che credevo avessi acceso».

import { z } from "zod";
import type { StorageLike } from "./logRecovery.js";

export const LISTONE_COLUMN_PREFS_STORAGE_KEY = "fac_listone_columns";
export const LISTONE_COLUMN_PREFS_SCHEMA_VERSION = 1;

/** Una chiave di colonna: `name`, `pagella_salute`, o l'intestazione di una
 *  colonna extra del file caricato. Qualunque cosa più lunga non lo è. */
const KEY_MAX = 200;

/**
 * Un tetto, non una regola di prodotto: una difesa contro un `localStorage`
 * gonfiato da qualcos'altro che diventerebbe un ciclo lungo su una schermata
 * che si ridisegna a ogni tasto premuto. Un listone reale porta una dozzina di
 * colonne; duecento sono già un ordine di grandezza oltre il plausibile.
 */
export const LISTONE_COLUMN_PREFS_MAX = 200;

const prefsSchema = z
  .object({
    schemaVersion: z.literal(LISTONE_COLUMN_PREFS_SCHEMA_VERSION),
    /** Colonne di default che Pico ha SPENTO. */
    hidden: z.array(z.string().min(1).max(KEY_MAX)).max(LISTONE_COLUMN_PREFS_MAX),
    /** Colonne fuori default che Pico ha ACCESO. */
    shown: z.array(z.string().min(1).max(KEY_MAX)).max(LISTONE_COLUMN_PREFS_MAX),
  })
  .strict();

export interface ListoneColumnPrefs {
  readonly hidden: readonly string[];
  readonly shown: readonly string[];
}

/** Nessuna deviazione: si vedono esattamente le colonne di default. */
export const EMPTY_LISTONE_COLUMN_PREFS: ListoneColumnPrefs = { hidden: [], shown: [] };

/**
 * Una chiave in ENTRAMBI gli elenchi è una contraddizione — «l'ho spenta» e
 * «l'ho accesa» sulla stessa colonna — e non c'è nessuna regola onesta per
 * decidere quale delle due valga. Si rifiuta l'archivio intero e si riparte
 * dal default, che è la sola cosa che nessuno ha dovuto interpretare.
 */
function isCoherent(prefs: ListoneColumnPrefs): boolean {
  const hidden = new Set(prefs.hidden);
  return prefs.shown.every((key) => !hidden.has(key));
}

/** Legge l'archivio. Non lancia mai: qualunque guaio torna vuoto. */
export function loadListoneColumnPrefs(storage: StorageLike): ListoneColumnPrefs {
  try {
    const raw = storage.getItem(LISTONE_COLUMN_PREFS_STORAGE_KEY);
    if (raw === null) return EMPTY_LISTONE_COLUMN_PREFS;
    const parsed = prefsSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) return EMPTY_LISTONE_COLUMN_PREFS;
    const prefs: ListoneColumnPrefs = {
      hidden: [...new Set(parsed.data.hidden)],
      shown: [...new Set(parsed.data.shown)],
    };
    return isCoherent(prefs) ? prefs : EMPTY_LISTONE_COLUMN_PREFS;
  } catch {
    return EMPTY_LISTONE_COLUMN_PREFS;
  }
}

/**
 * Scrive l'archivio. Torna `false` quando la scrittura non ha tenuto — la
 * rilettura è parte del contratto, come in `saveLeagueRoster`: una quota piena
 * o una modalità privata che accetta `setItem` e non conserva niente deve
 * poter essere DETTA, non scoperta al reload successivo.
 */
export function saveListoneColumnPrefs(storage: StorageLike, prefs: ListoneColumnPrefs): boolean {
  if (!isCoherent(prefs)) return false;
  const parsed = prefsSchema.safeParse({
    schemaVersion: LISTONE_COLUMN_PREFS_SCHEMA_VERSION,
    hidden: [...prefs.hidden],
    shown: [...prefs.shown],
  });
  if (!parsed.success) return false;
  const raw = JSON.stringify(parsed.data);
  try {
    storage.setItem(LISTONE_COLUMN_PREFS_STORAGE_KEY, raw);
    return storage.getItem(LISTONE_COLUMN_PREFS_STORAGE_KEY) === raw;
  } catch {
    return false;
  }
}

/**
 * Se questa colonna si vede, dati il default e le deviazioni salvate.
 *
 * `locked` È LA PRIMA RIGA E NON UN CASO PARTICOLARE (2026-08-24, varco chiuso
 * dopo la review di PR #41): una colonna blindata si vede E BASTA, qualunque
 * cosa dica l'archivio. Non è una gentilezza verso l'interfaccia — è la
 * garanzia che nemmeno un `localStorage` scritto a mano, o rimasto da prima
 * della blindatura con `hidden: ["name"]` dentro, possa far uscire dalla
 * tabella la colonna che dice DI CHI PARLA la riga.
 */
export function isColumnVisible(
  key: string,
  defaultKeys: readonly string[],
  prefs: ListoneColumnPrefs,
  locked = false,
): boolean {
  if (locked) return true;
  return defaultKeys.includes(key) ? !prefs.hidden.includes(key) : prefs.shown.includes(key);
}

/**
 * L'interruttore. Registra sempre la DEVIAZIONE dal default corrente, mai lo
 * stato assoluto — ed è ciò che rende impossibile lasciare una chiave nei due
 * elenchi insieme: spegnere una colonna di default la mette fra le `hidden` e
 * la toglie dalle `shown`, e viceversa.
 *
 * `locked` non ha nemmeno bisogno di essere gestito qui perché non ci arriva
 * mai: il pannello non attacca un gestore del clic a una colonna blindata e
 * `toggleListoneColumn` (src/main.ts) rifiuta la chiave prima di chiamare
 * questa funzione. Se ci arrivasse comunque, la deviazione scritta resterebbe
 * senza effetto: `isColumnVisible` mostra una colonna blindata comunque.
 */
export function toggleColumnPref(
  prefs: ListoneColumnPrefs,
  key: string,
  defaultKeys: readonly string[],
): ListoneColumnPrefs {
  const visible = isColumnVisible(key, defaultKeys, prefs);
  const hidden = prefs.hidden.filter((k) => k !== key);
  const shown = prefs.shown.filter((k) => k !== key);
  if (visible) {
    // Spegnere: una colonna di default diventa una deviazione «spenta»; una
    // colonna accesa a mano torna semplicemente a non essere accesa.
    return defaultKeys.includes(key) ? { hidden: [...hidden, key], shown } : { hidden, shown };
  }
  return defaultKeys.includes(key) ? { hidden, shown } : { hidden, shown: [...shown, key] };
}

/**
 * Le colonne visibili, NELL'ORDINE DI `columns` — cioè quello dell'elenco di
 * Pico, deciso in src/ui/listone.ts. Le deviazioni dicono CHI si vede; non
 * hanno voce su DOVE, così una colonna riaccesa torna al suo posto invece di
 * comparire in coda nell'ordine in cui è stata premuta.
 *
 * E NON HANNO VOCE SULLE COLONNE BLINDATE: una colonna che si porta dietro
 * `locked: true` è nell'elenco comunque. La bandiera arriva qui col dato, non
 * come parametro a parte, apposta — un parametro si può dimenticare di
 * passare, un campo dell'oggetto no.
 */
export function visibleColumnKeys(
  columns: readonly { readonly key: string; readonly locked?: boolean }[],
  defaultKeys: readonly string[],
  prefs: ListoneColumnPrefs,
): string[] {
  return columns
    .filter((c) => isColumnVisible(c.key, defaultKeys, prefs, c.locked === true))
    .map((c) => c.key);
}

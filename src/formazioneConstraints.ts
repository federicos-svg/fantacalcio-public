// I VINCOLI DELLA FORMAZIONE, SALVATI FRA UNA SESSIONE E L'ALTRA.
//
// Piccolo side-store persistente, sulla forma di `src/listoneColumnPrefs.ts` e
// `src/leagueTeams.ts` — zod `.strict()`, fail-closed a vuoto, rilettura dopo
// la scrittura — e non sulla macchina più grande di `src/logRecovery.ts`: qui
// non c'è nessuno stream di mutazioni da proteggere, solo tre comandi premuti
// una volta e riletti al boot.
//
// PERCHÉ PER COMPETIZIONE, e non un blocco solo. Campionato e coppa sono due
// partite diverse contro due avversari diversi (§22 e §23): «questo lo voglio
// in campo» può valere per l'una e non per l'altra, e un vincolo unico
// costringerebbe Pico a scegliere una volta per due formazioni che non ha
// nemmeno visto insieme.
//
// PERCHÉ NON SI VALIDA QUI CHE IL VINCOLO SIA ANCORA SENSATO. Questo file sa
// leggere e scrivere; non sa chi è in rosa oggi. Un giocatore bloccato che
// domani non è più in squadra è un vincolo perfettamente ben formato e non più
// applicabile, e chi se ne accorge è `reconcileConstraints` nel contratto di
// osservazione, che la rosa ce l'ha davanti. La divisione conta: se questo file
// scartasse gli id «strani» durante il caricamento, la quarantena diventerebbe
// invisibile e Pico non saprebbe mai che una sua spunta è caduta.
//
// FAIL-CLOSED A VUOTO, con la conseguenza dichiarata: un archivio illeggibile
// non produce mezzo elenco di vincoli — produce NESSUN vincolo, e lo si dice a
// schermo. Mezzo elenco di vincoli è la cosa peggiore che si possa applicare a
// una formazione: è una preferenza che nessuno ha espresso.

import { z } from "zod";
import type { StorageLike } from "./logRecovery.js";
import {
  MODULES,
  type LineupConstraints,
  type Module,
} from "../packages/league-channel-contract/src/index.js";

export const FORMAZIONE_CONSTRAINTS_STORAGE_KEY = "fac_formazione_vincoli";
export const FORMAZIONE_CONSTRAINTS_SCHEMA_VERSION = 1;

/** Un id opaco: quello che il canale della lega genera. Più lungo non lo è. */
const ID_MAX = 200;

/**
 * Tetti, non regole di prodotto: difese contro un `localStorage` gonfiato da
 * qualcos'altro, che diventerebbe un ciclo lungo su una schermata ridisegnata a
 * ogni clic. Una rosa reale sta sotto i trenta giocatori e le competizioni sono
 * due; questi numeri sono già un ordine di grandezza oltre il plausibile.
 */
export const FORMAZIONE_CONSTRAINTS_MAX_LOCKED = 60;
export const FORMAZIONE_CONSTRAINTS_MAX_COMPETITIONS = 16;

/**
 * Il modulo si valida contro l'elenco di §9 ri-esportato dal contratto, non
 * contro una lista battuta a mano: un modulo che qui passasse e là non
 * esistesse sarebbe un vincolo salvabile e mai applicabile.
 */
const moduleSchema = z.string().refine((value): value is Module => (MODULES as readonly string[]).includes(value));

const entrySchema = z
  .object({
    competitionId: z.string().min(1).max(ID_MAX),
    lockedStarterIds: z.array(z.string().min(1).max(ID_MAX)).max(FORMAZIONE_CONSTRAINTS_MAX_LOCKED),
    lockedModule: moduleSchema.optional(),
    locked: z.boolean(),
  })
  .strict();

const storeSchema = z
  .object({
    schemaVersion: z.literal(FORMAZIONE_CONSTRAINTS_SCHEMA_VERSION),
    perCompetition: z.array(entrySchema).max(FORMAZIONE_CONSTRAINTS_MAX_COMPETITIONS),
  })
  .strict();

/**
 * L'esito della rilettura al boot.
 *
 * - `ok` — l'archivio è stato letto (anche quando è semplicemente assente);
 * - `quarantined` — c'era qualcosa e non era leggibile: si riparte senza
 *   vincoli, e la pagina lo dice;
 * - `storage-error` — il browser non dà accesso all'archivio: i vincoli di
 *   oggi resteranno solo in memoria, e anche questo si dice.
 */
export type FormazioneConstraintsStatus = "ok" | "quarantined" | "storage-error";

export interface FormazioneConstraintsLoad {
  readonly status: FormazioneConstraintsStatus;
  readonly byCompetition: ReadonlyMap<string, LineupConstraints>;
}

const EMPTY: ReadonlyMap<string, LineupConstraints> = new Map();

/**
 * Un id di competizione ripetuto è una contraddizione — due elenchi di vincoli
 * per la stessa partita — e non c'è nessuna regola onesta per decidere quale
 * valga. Si rifiuta l'archivio intero, come fa `listoneColumnPrefs` con una
 * colonna che risulti insieme accesa e spenta.
 */
function hasDuplicateCompetitions(entries: readonly { competitionId: string }[]): boolean {
  return new Set(entries.map((entry) => entry.competitionId)).size !== entries.length;
}

/** Legge l'archivio. Non lancia mai: qualunque guaio torna senza vincoli. */
export function loadFormazioneConstraints(storage: StorageLike): FormazioneConstraintsLoad {
  let raw: string | null;
  try {
    raw = storage.getItem(FORMAZIONE_CONSTRAINTS_STORAGE_KEY);
  } catch {
    return { status: "storage-error", byCompetition: EMPTY };
  }
  if (raw === null) return { status: "ok", byCompetition: EMPTY };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { status: "quarantined", byCompetition: EMPTY };
  }
  const result = storeSchema.safeParse(parsed);
  if (!result.success) return { status: "quarantined", byCompetition: EMPTY };
  if (hasDuplicateCompetitions(result.data.perCompetition)) {
    return { status: "quarantined", byCompetition: EMPTY };
  }

  const byCompetition = new Map<string, LineupConstraints>();
  for (const entry of result.data.perCompetition) {
    // Gli id ripetuti dentro lo stesso elenco non sono una contraddizione: sono
    // la stessa spunta scritta due volte. Si tiene la prima e si prosegue.
    const lockedStarterIds = [...new Set(entry.lockedStarterIds)];
    byCompetition.set(
      entry.competitionId,
      entry.lockedModule === undefined
        ? { lockedStarterIds, locked: entry.locked }
        : { lockedStarterIds, lockedModule: entry.lockedModule, locked: entry.locked },
    );
  }
  return { status: "ok", byCompetition };
}

/**
 * Scrive l'archivio. Torna `false` quando la scrittura non ha tenuto — la
 * rilettura è parte del contratto, come in `saveListoneColumnPrefs`: una quota
 * piena, o una modalità privata che accetta `setItem` e non conserva niente,
 * deve poter essere DETTA e non scoperta al reload successivo.
 */
export function saveFormazioneConstraints(
  storage: StorageLike,
  byCompetition: ReadonlyMap<string, LineupConstraints>,
): boolean {
  const perCompetition = [...byCompetition.entries()].map(([competitionId, constraints]) => ({
    competitionId,
    lockedStarterIds: [...constraints.lockedStarterIds],
    ...(constraints.lockedModule === undefined ? {} : { lockedModule: constraints.lockedModule }),
    locked: constraints.locked,
  }));
  const parsed = storeSchema.safeParse({
    schemaVersion: FORMAZIONE_CONSTRAINTS_SCHEMA_VERSION,
    perCompetition,
  });
  if (!parsed.success) return false;
  const raw = JSON.stringify(parsed.data);
  try {
    storage.setItem(FORMAZIONE_CONSTRAINTS_STORAGE_KEY, raw);
    return storage.getItem(FORMAZIONE_CONSTRAINTS_STORAGE_KEY) === raw;
  } catch {
    return false;
  }
}

/** La riga da mostrare al boot quando l'archivio non è al sicuro. Vuota è la norma. */
export function formazioneConstraintsNotice(status: FormazioneConstraintsStatus): string {
  if (status === "quarantined") {
    return (
      "I vincoli della formazione salvati in locale non erano leggibili e sono stati messi da parte: " +
      "si riparte senza vincoli. Le spunte e i blocchi vanno rimessi."
    );
  }
  if (status === "storage-error") {
    return (
      "L'archivio locale dei vincoli non è accessibile in questo browser: le spunte e i blocchi di " +
      "oggi resteranno solo in memoria e non saranno qui al prossimo avvio."
    );
  }
  return "";
}

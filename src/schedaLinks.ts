// LE RISPOSTE DI PICO SULL'AGGANCIO DELLE SCHEDE — piccolo side-store
// persistente, sulla forma di src/leagueTeams.ts (zod, fail-closed a vuoto),
// non sulla macchina più grande di src/logRecovery.ts: qui non c'è nessuno
// stream di mutazioni live da proteggere, solo un pugno di risposte date una
// volta e rilette a ogni boot.
//
// CHE COS'È UNA RIGA DI QUESTO ARCHIVIO. Quando più schede del Gruppo Esperti
// potrebbero appartenere alla stessa riga di listone, `resolveExpertInsight`
// (src/expertScheda.ts) NON sceglie: chiede. La risposta di Pico è una riga qui
// dentro — «per la riga X del listone vale la scheda Y» — e deve sopravvivere
// al reload, altrimenti la stessa domanda tornerebbe a ogni chiamata e la
// risposta varrebbe meno del tempo per darla.
//
// NON È UNA CORREZIONE DEL DEPOSITO, ed è la ragione per cui vive di qua e non
// dentro le schede. Il deposito è scritto a mano da Pico e letto da un endpoint
// privato in sola lettura: il sito non lo riscrive mai. Questo archivio è
// l'opinione del LETTORE su quale scheda sia quale, tenuta nel browser che l'ha
// data — cancellarlo perde una comodità, non un dato.
//
// FAIL-CLOSED A VUOTO, e la conseguenza è dichiarata: un archivio illeggibile
// non produce agganci sbagliati, produce la domanda di nuovo. È la direzione
// giusta dell'errore — «te lo richiedo» invece di «ho scelto io».

import { z } from "zod";
import type { StorageLike } from "./logRecovery.js";
import type { SchedaTarget } from "./expertScheda.js";
import { listonePlayerKey } from "./ui/listone.js";

export const SCHEDA_LINKS_STORAGE_KEY = "fac_scheda_links";
export const SCHEDA_LINKS_SCHEMA_VERSION = 1;

/**
 * Un tetto, non una regola di prodotto: nient'altro che una difesa contro un
 * `localStorage` gonfiato da qualcos'altro (o da un'altra scheda del browser)
 * che diventerebbe un ciclo lungo su una schermata che si ridisegna spesso.
 * Il listone reale sta sotto le 600 righe, quindi non lo si tocca giocando.
 */
export const SCHEDA_LINKS_MAX = 2000;

/** Chiavi e valori sono `listonePlayerKey`: qualunque cosa più lunga non lo è. */
const KEY_MAX = 200;

const linksSchema = z
  .object({
    schemaVersion: z.literal(SCHEDA_LINKS_SCHEMA_VERSION),
    /** chiave della riga di listone -> chiave della scheda scelta. */
    links: z.record(z.string().min(1).max(KEY_MAX), z.string().min(1).max(KEY_MAX)),
  })
  .strict();

/** riga di listone -> scheda scelta. Vuota è lo stato normale. */
export type SchedaLinks = ReadonlyMap<string, string>;

export const NO_SCHEDA_LINKS: SchedaLinks = new Map();

/**
 * La chiave con cui una riga di listone entra in questo archivio.
 *
 * È `listonePlayerKey` su NOME + SQUADRA, senza `proxyId`, cioè esattamente
 * l'identità su cui lavora l'aggancio: la risposta è data guardando quel nome e
 * quella squadra, e deve ritrovarsi a partire da quei due. `validateListonePool`
 * rifiuta già un pool con due righe sotto la stessa coppia, quindi la chiave è
 * unica dentro un listone (src/ui/listone.ts, `ambiguous-identity`).
 */
export function schedaLinkRowKey(target: SchedaTarget): string {
  return listonePlayerKey({ name: target.name, club: target.club });
}

/**
 * L'archivio con una risposta in più, o senza quella riga quando `schedaKey` è
 * `null` («nessuna di queste», che riporta la domanda allo stato iniziale).
 * Pura: rende una mappa nuova, non tocca quella ricevuta.
 */
export function withSchedaLink(
  links: SchedaLinks,
  rowKey: string,
  schedaKey: string | null,
): SchedaLinks {
  const next = new Map(links);
  if (schedaKey === null) next.delete(rowKey);
  else next.set(rowKey, schedaKey);
  return next;
}

/**
 * Legge l'archivio. Non lancia mai: qualunque cosa non sia esattamente la forma
 * attesa rende una mappa vuota, cioè «nessuna risposta data» — che è lo stato
 * di partenza legittimo, non un errore da mostrare.
 */
export function loadSchedaLinks(storage: StorageLike): SchedaLinks {
  try {
    const raw = storage.getItem(SCHEDA_LINKS_STORAGE_KEY);
    if (raw === null) return NO_SCHEDA_LINKS;
    const parsed = linksSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) return NO_SCHEDA_LINKS;
    const entries = Object.entries(parsed.data.links);
    if (entries.length > SCHEDA_LINKS_MAX) return NO_SCHEDA_LINKS;
    return new Map(entries);
  } catch {
    return NO_SCHEDA_LINKS;
  }
}

/**
 * Scrive l'archivio. Rende `false` quando la scrittura non ha attecchito —
 * stessa postura di `saveLeagueRoster`, e per la stessa ragione: chi chiama
 * deve poterlo DIRE, invece di lasciar credere che una risposta sia al sicuro
 * quando al prossimo reload non ci sarà più.
 */
export function saveSchedaLinks(storage: StorageLike, links: SchedaLinks): boolean {
  if (links.size > SCHEDA_LINKS_MAX) return false;
  const parsed = linksSchema.safeParse({
    schemaVersion: SCHEDA_LINKS_SCHEMA_VERSION,
    links: Object.fromEntries(links),
  });
  if (!parsed.success) return false;
  const raw = JSON.stringify(parsed.data);
  try {
    storage.setItem(SCHEDA_LINKS_STORAGE_KEY, raw);
    return storage.getItem(SCHEDA_LINKS_STORAGE_KEY) === raw;
  } catch {
    return false;
  }
}

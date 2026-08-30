// RINNOVI — chi, di QUESTA squadra, è davvero riconfermabile dall'anno scorso.
//
// Il layer puro dietro il pannello RINNOVO della schermata ROSA: nessun DOM,
// nessuno storage, nessuna rete, nessuna lettura di `window` — stesso taglio di
// src/perMeCandidates.ts e src/roleDepletion.ts. Le parole a schermo e la
// modale vivono altrove; qui c'è solo la derivazione dell'elenco, così è
// verificabile senza jsdom/happy-dom (nessuno dei due è configurato in questo
// progetto).
//
// ─────────────────────────────────────────────────────────────────────────────
// 1. PERCHÉ L'ELENCO NON PUÒ ESSERE «I GIOCATORI DELLA SCORSA STAGIONE»
// ─────────────────────────────────────────────────────────────────────────────
//
// Un pannello che offrisse in blocco la rosa dell'anno prima proporrebbe mosse
// che il regolamento rifiuta (LEAGUE_RULES §4) e le farebbe scoprire solo al
// momento del salvataggio, quando `validateConfirmations` le respinge. Le
// stesse tre regole che quel cancello applica a valle sono quindi applicate qui
// a monte, in modo che ciò che si vede sia già ciò che si può fare:
//
//  a. NESSUN PORTIERE, e un solo D, un solo C, un solo A per squadra. Il tetto
//     non è riscritto qui: è `CONFIRMATION_LIMITS` (packages/engine/src/
//     confirmations.ts), importato. Una seconda copia di quei numeri sarebbe
//     una seconda occasione di divergere dal cancello che decide davvero.
//  b. IL PREZZO È QUELLO PAGATO L'ANNO PRIMA, non una quotazione di oggi: viene
//     dalla riga di storico, mai dal listone.
//  c. NON SI RINNOVA DUE STAGIONI DI FILA. Una riga con `acquisition ===
//     "riconferma"` nella stagione precedente non è materiale rinnovabile
//     adesso, ed è la stessa distinzione load-bearing che
//     `ACQUISITION_KINDS` dichiara in packages/opponent-profiles/src/types.ts:
//     un rinnovo non è un gesto ripetuto, è non aver mai lasciato il giocatore.
//
// ─────────────────────────────────────────────────────────────────────────────
// 2. «STAGIONE PRECEDENTE» È UN FATTO DELLO STORICO, NON DELL'OROLOGIO
// ─────────────────────────────────────────────────────────────────────────────
//
// La stagione da cui si rinnova è la MASSIMA presente nello storico, in ordine
// lessicografico. Non si deriva da `Date`, e la ragione non è purismo: un
// modulo che leggesse l'orologio darebbe risposte diverse allo scoccare di un
// capodanno, non sarebbe riproducibile in un test e non saprebbe comunque
// nulla di quando la lega ha davvero giocato. Lo storico sa entrambe le cose e
// le dice da solo.
//
// L'ordinamento lessicografico è legittimo perché l'etichetta è vincolata a
// `SEASON_PATTERN` (`YYYY/YY`), e quel vincolo esiste esattamente per questo —
// packages/opponent-profiles/src/types.ts lo scrive per esteso: «l'ordinamento
// cronologico di questo pacchetto è l'ordinamento LESSICOGRAFICO
// dell'etichetta, e lo è correttamente solo se l'etichetta comincia con l'anno
// a quattro cifre. Una stagione scritta "21-22" ordinerebbe in silenzio dopo
// "2025/26"». Da qui la scelta di IGNORARE le righe con un'etichetta fuori
// pattern invece di ordinarle insieme alle altre: una sola riga malformata
// potrebbe altrimenti eleggersi «stagione precedente» e svuotare il pannello
// senza che nessuno capisca perché. Se dopo quel filtro non resta nessuna
// stagione ordinabile, il modulo tace con il proprio motivo
// (`no-previous-season`) invece di indovinare un anno.
//
// ─────────────────────────────────────────────────────────────────────────────
// 3. IL RUOLO VIENE DAL LISTONE, PERCHÉ NELLO STORICO NON C'È
// ─────────────────────────────────────────────────────────────────────────────
//
// `PastAuctionPurchase` porta stagione, persona, giocatore, club, prezzo e modo
// d'acquisto: nessun ruolo. Il ruolo si legge quindi sulla riga di listone
// corrispondente, risolta per `playerId` — che è la STESSA chiave che
// `listonePlayerKey` produce, come già fa src/baitCandidates.ts quando indicizza
// lo storico. L'indice è `listonePoolIndex`, la funzione che il repo usa già per
// questa risoluzione: nessuna scansione lineare scritta a mano qui dentro.
//
// UN GIOCATORE CHE IL LISTONE NON CONOSCE PIÙ SPARISCE, IN SILENZIO E DI
// PROPOSITO. Se è uscito dalla Serie A non c'è nessun ruolo da attribuirgli e
// nessuna riconferma da proporre: non è un errore da segnalare, è un giocatore
// che non esiste più per questa asta. Inventargli un ruolo — o mostrarlo come
// riga «ruolo ignoto» — significherebbe proporre una mossa che il cancello
// rifiuterebbe comunque.
//
// ─────────────────────────────────────────────────────────────────────────────
// 4. LA REGOLA DELLE FRASI ONESTE
// ─────────────────────────────────────────────────────────────────────────────
//
// Un elenco vuoto non è mai «nessuno»: è uno di sette silenzi diversi, ognuno
// con una causa diversa e una conseguenza diversa per chi legge (stessa
// disciplina di `PerMeEmptyReason` in src/perMeCandidates.ts e delle frasi
// oneste di src/ui/roleDepletion.ts). «Non ho caricato lo storico» e «questa
// squadra ha già usato il suo difensore» portano a due azioni opposte, e un
// elenco vuoto identico per entrambi le confonderebbe. Da qui
// `RenewalEmptyReason`, vocabolario CHIUSO e non fondibile.

import {
  CONFIRMATION_LIMITS,
  type ConfirmationInput,
} from "../packages/engine/src/confirmations.js";
import type { Role } from "../packages/engine/src/types.js";
import {
  SEASON_PATTERN,
  type PastAuctionPurchase,
} from "../packages/opponent-profiles/src/types.js";
import { listonePoolIndex, type ListonePlayer } from "./ui/listone.js";

/**
 * Un giocatore che questa squadra può davvero riconfermare, e il prezzo a cui
 * lo farebbe.
 *
 * `name` e `club` vengono dalla RIGA DI LISTONE, non dallo storico: il club
 * registrato nello storico è quello della stagione passata, e stampare quello
 * accanto a un giocatore che nel frattempo si è mosso mostrerebbe come attuale
 * un fatto vecchio di un anno. Il prezzo, al contrario, viene dallo storico ed è
 * il solo che il regolamento ammette (§4).
 */
export interface RenewalCandidate {
  /** Chiave di listone — la stessa che `listonePlayerKey` produce. */
  readonly playerId: string;
  readonly name: string;
  readonly club: string;
  readonly role: Role;
  /** Prezzo pagato nella stagione precedente. Mai una quotazione di oggi. */
  readonly price: number;
}

/**
 * Perché il pannello non ha righe. Sette silenzi distinti, mai fondibili in un
 * «nessun candidato» buono per tutti: ognuno nasce da una causa diversa e
 * indirizza a un'azione diversa.
 */
export type RenewalEmptyReason =
  /** Il ruolo non è riconfermabile per regolamento (P: `CONFIRMATION_LIMITS` 0). */
  | "role-not-renewable"
  /** Questa squadra ha già speso tutte le riconferme di questo ruolo. Non è
   *  «non ha nessuno»: è «non ne può più aggiungere». */
  | "role-limit-reached"
  /** Nessuno storico caricato. Non è «non ha rinnovabili», è «non lo so». */
  | "no-history"
  /** Il posto non ha una persona assegnata: senza `personId` non esiste lo
   *  storico DI NESSUNO da interrogare — i precedenti seguono l'essere umano,
   *  non il posto a tavola (packages/opponent-profiles/src/types.ts). */
  | "seat-unassigned"
  /** Lo storico c'è ma nessuna sua riga porta un'etichetta di stagione
   *  ordinabile (`SEASON_PATTERN`): «la stagione precedente» non ha una
   *  definizione, e il modulo non ne indovina una. */
  | "no-previous-season"
  /** Nessun listone caricato: senza righe non c'è nessun ruolo da attribuire e
   *  nessun nome da mostrare. */
  | "no-pool"
  /** Tutto era a posto e non è sopravvissuto nessuno ai filtri: nessun acquisto
   *  all'asta di quel ruolo, oppure erano tutti già riconfermati, già in rosa,
   *  o non più in listone. */
  | "no-renewable";

/**
 * L'esito. Due rami, mai un elenco vuoto senza motivo scritto: nel ramo pieno
 * viaggia anche la STAGIONE da cui si rinnova, così il pannello può dirla invece
 * di lasciarla intendere.
 */
export type RenewalReading =
  | {
      readonly kind: "candidates";
      readonly season: string;
      readonly candidates: readonly RenewalCandidate[];
    }
  | {
      readonly kind: "empty";
      readonly reason: RenewalEmptyReason;
      /** Dettaglio misurato del silenzio, quando ce n'è uno; assente altrimenti. */
      readonly detail?: string;
    };

/**
 * Tutto ciò che serve, ESPLICITO E INIETTATO. Nessun accesso a globali, a
 * storage o al motore: il chiamante passa ciò che ha in mano, e lo stesso input
 * dà sempre lo stesso esito.
 */
export interface RenewalInput {
  /** Lo storico d'asta multi-stagione, come il deposito runtime-local lo tiene. */
  readonly history: readonly PastAuctionPurchase[];
  /** `LeagueRoster.seats`: posto -> persona, `null` quando il posto è libero. */
  readonly seats: Readonly<Record<string, string | null>>;
  /** Le righe di listone come stanno a schermo. */
  readonly pool: readonly ListonePlayer[];
  /**
   * Le riconferme GIÀ dichiarate per questa stagione, di TUTTE le squadre.
   * Servono a due cose insieme, ed è il motivo per cui l'input è uno solo:
   * contare quante ne ha già usate questa squadra su questo ruolo, ed escludere
   * i giocatori già presi da chiunque — `duplicate-player` è una violazione
   * globale del cancello, non per squadra, quindi un giocatore riconfermato da
   * un'altra squadra qui non deve comparire.
   */
  readonly confirmations: readonly ConfirmationInput[];
  /**
   * I giocatori già in rosa in questa stagione (l'event log dell'asta in corso),
   * quando il chiamante li ha. Assenti = elenco vuoto: prima dell'asta non c'è
   * ancora nessun acquisto, e non è un'omissione da segnalare.
   */
  readonly purchasedPlayerIds?: readonly string[];
  /** Il POSTO per cui si sta rinnovando. */
  readonly fantaTeamId: string;
  /** Il ruolo dello slot vuoto su cui si è cliccato. */
  readonly role: Role;
}

/**
 * La stagione da cui si rinnova: la massima etichetta ORDINABILE dello storico,
 * o `null` quando non ce n'è nessuna. Esportata perché il pannello possa
 * scriverla anche nei rami vuoti, senza ricavarla per conto proprio con una
 * seconda regola d'ordinamento.
 */
export function previousSeason(history: readonly PastAuctionPurchase[]): string | null {
  let latest: string | null = null;
  for (const row of history) {
    if (!SEASON_PATTERN.test(row.season)) continue;
    if (latest === null || row.season > latest) latest = row.season;
  }
  return latest;
}

function empty(reason: RenewalEmptyReason, detail?: string): RenewalReading {
  return detail === undefined ? { kind: "empty", reason } : { kind: "empty", reason, detail };
}

/**
 * L'elenco dei giocatori effettivamente rinnovabili da questa squadra, per
 * questo ruolo, dalla stagione precedente.
 *
 * L'ORDINE DEI CANCELLI È DICHIARATO E NON CASUALE: prima ciò che dipende solo
 * dal REGOLAMENTO (il ruolo non si rinnova; il ruolo è esaurito), che è vero
 * anche a schermo spento e non ha bisogno di nessun dato caricato; poi le
 * ASSENZE DI DATO, dalla più esterna alla più specifica (nessuno storico; posto
 * senza persona; nessuna stagione ordinabile; nessun listone); infine i FILTRI
 * sui candidati veri. Così il motivo che esce è sempre il più a monte fra quelli
 * veri, e chi legge sa quale ostacolo togliere per primo.
 *
 * ORDINE DEL RISULTATO, dichiarato: prezzo pagato DECRESCENTE — il rinnovo che
 * pesa di più sul budget è la decisione che va guardata per prima — e a parità
 * di prezzo `playerId` CRESCENTE, che è un criterio arbitrario ma totale, quindi
 * l'elenco non dipende mai dall'ordine in cui le righe stavano nello storico.
 */
export function renewalCandidates(input: RenewalInput): RenewalReading {
  const limit = CONFIRMATION_LIMITS[input.role];
  if (limit <= 0) return empty("role-not-renewable");

  const usedForRole = input.confirmations.filter(
    (c) => c.fantaTeamId === input.fantaTeamId && c.role === input.role,
  ).length;
  if (usedForRole >= limit) return empty("role-limit-reached", `${usedForRole}/${limit}`);

  if (input.history.length === 0) return empty("no-history");

  const personId = input.seats[input.fantaTeamId] ?? null;
  if (personId === null) return empty("seat-unassigned", input.fantaTeamId);

  const season = previousSeason(input.history);
  if (season === null) return empty("no-previous-season");

  if (input.pool.length === 0) return empty("no-pool");
  const poolIndex = listonePoolIndex(input.pool);

  // Già presi, da chiunque e in qualunque modo: una riconferma dichiarata da
  // un'altra squadra e un acquisto di stasera bloccano il giocatore allo stesso
  // modo, e il cancello a valle li tratta come un unico `duplicate-player`.
  const taken = new Set<string>([
    ...input.confirmations.map((c) => c.playerId),
    ...(input.purchasedPlayerIds ?? []),
  ]);

  // Lo storico dichiara una riga per giocatore per stagione; se ne arrivassero
  // due, la prima incontrata vince e la seconda non raddoppia la riga a schermo.
  const byPlayer = new Map<string, RenewalCandidate>();
  for (const row of input.history) {
    if (row.personId !== personId) continue;
    if (row.season !== season) continue;
    // Il divieto di rinnovare due stagioni di fila, applicato dove nasce.
    if (row.acquisition !== "asta") continue;
    if (taken.has(row.playerId)) continue;
    if (byPlayer.has(row.playerId)) continue;
    const listed = poolIndex.get(row.playerId);
    // Uscito dalla Serie A: niente ruolo, niente riga, nessun rumore.
    if (listed === undefined) continue;
    if (listed.role !== input.role) continue;
    byPlayer.set(row.playerId, {
      playerId: row.playerId,
      name: listed.name,
      club: listed.club,
      role: listed.role,
      price: row.price,
    });
  }

  const candidates = [...byPlayer.values()].sort(
    (a, b) => b.price - a.price || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0),
  );
  if (candidates.length === 0) return empty("no-renewable", season);

  return { kind: "candidates", season, candidates };
}

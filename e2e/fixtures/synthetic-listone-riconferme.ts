// LE RICONFERME §4 — scena sintetica per la porta NUOVA: la casella di Rosa.
//
// Tutto inventato: club «ClubUno/Due/…», giocatori «Difensore Rinnovabile» e
// compagnia, persone con UUID legati a nessuno e con NOMI DI FANTASQUADRA, non
// di persona. Nessuna spesa di un partecipante reale della lega è riprodotta
// qui e nessuna può esserlo (issue #234, nota privacy).
//
// PERCHÉ QUESTA FIXTURE ORA SEMINA UNO STORICO D'ASTA. Il vecchio pannello
// «Riconferme pre-asta» delle Impostazioni lasciava scegliere QUALUNQUE riga di
// listone del ruolo giusto e digitare un prezzo a mano: al fixture bastava un
// listone. Il pannello RINNOVO della casella di Rosa non lo permette — elenca
// solo i giocatori che quella squadra aveva DAVVERO l'anno scorso, col prezzo
// pagato allora, letti da `fac_auction_history` (src/renewals.ts). Senza
// storico seminato direbbe, con ragione, «nessuno storico d'asta caricato», e
// non si potrebbe riconfermare niente. Serve anche il registro lega
// (`fac_league_teams`): i precedenti seguono la PERSONA, non il posto a tavola,
// quindi un posto senza persona non ha storico da interrogare.
//
// I CASI CHE LO STORICO PORTA, e servono tutti:
//   Difensore Rinnovabile        preso all'asta da Io: il rinnovo del caso normale;
//   Difensore Al Limite          preso all'asta da Io al PREZZO MASSIMO che la
//                                riserva dura ammette per una riconferma sola;
//   Difensore Oltre Riserva      un credito sopra quel massimo: rifiuto semantico;
//   Difensore Tutto Il Budget    l'intero budget iniziale: stesso rifiuto,
//                                per la via del residuo a zero;
//   Difensore Già Rinnovato      RICONFERMATO da Io l'anno scorso — §4 vieta due
//                                stagioni di fila, quindi non compare;
//   Difensore Di Un Altro        preso da un'ALTRA persona: non è roba di Io;
//   Difensore Vecchia Stagione   preso da Io ma in una stagione PRECEDENTE a
//                                quella da cui si rinnova: non compare;
//   Difensore Solo In Listone    mai nello storico: prova che l'elenco NON è
//                                quello del listone;
//   Centrocampista / Attaccante  un rinnovabile per ciascun ruolo, per misurare
//                                il tetto §4 (1 D, 1 C, 1 A);
//   Portiere Rinnovabile Mai     preso all'asta da Io l'anno scorso eppure MAI
//                                rinnovabile: in porta il divieto è del
//                                regolamento, non della mancanza di dati.
//
// Il seeding passa da `localStorage`, che è il canale da cui l'app li legge
// davvero (`loadAuctionHistory` / `loadLeagueRoster`): la suite esercita il
// percorso vero — schema, validazione fail-closed, join posto→persona — e non
// una porta di servizio aperta per i test. Stesso pattern di
// ./synthetic-precedents.ts e ./synthetic-rosa-slot.ts.

import type { Page } from "@playwright/test";
import type { ListonePlayer } from "../../src/ui/listone.js";
import { listonePlayerKey } from "../../src/ui/listone.js";
import { LEAGUE_ROSTER_STORAGE_KEY } from "../../src/leagueTeams.js";
import { INITIAL_BUDGET, TOTAL_SLOTS } from "../../packages/engine/src/types.js";
import { hardReserve } from "../../packages/engine/src/auction.js";
import {
  AUCTION_HISTORY_STORAGE_KEY,
} from "../../packages/opponent-profiles/src/storage.js";
import type {
  AuctionHistoryStore,
  PastAuctionPurchase,
} from "../../packages/opponent-profiles/src/types.js";

/** La stagione da cui si rinnova: la MASSIMA ordinabile dello storico. */
export const PREVIOUS_SEASON = "2025/26";
/** Una stagione più vecchia, che il pannello non deve mai pescare. */
export const OLDER_SEASON = "2024/25";

/**
 * IL CONFINE DEL PREZZO, DERIVATO DAL MOTORE E NON BATTUTO A MANO.
 *
 * `validateConfirmations` (packages/engine/src/confirmations.ts) rifiuta una
 * riconferma quando il budget che resta non basta a riempire al minimo OGNI
 * altro slot obbligatorio: con una riconferma sola gli slot che restano sono
 * `TOTAL_SLOTS - 1`, quindi il prezzo massimo ammesso è
 * `INITIAL_BUDGET - hardReserve(TOTAL_SLOTS - 1)`. Scriverlo qui come «473»
 * significherebbe fissare in una fixture un numero che appartiene al
 * regolamento: se domani cambia `COST_FLOOR` o la dimensione della rosa, questa
 * scena deve seguirlo da sola.
 */
export const RENEWAL_PRICE_CEILING = INITIAL_BUDGET - hardReserve(TOTAL_SLOTS - 1);
/** Un credito sopra il massimo: il primo prezzo che la riserva dura rifiuta. */
export const RENEWAL_PRICE_OVER = RENEWAL_PRICE_CEILING + 1;
/** L'intero budget su una riconferma sola: residuo zero, stesso rifiuto. */
export const RENEWAL_PRICE_WHOLE_BUDGET = INITIAL_BUDGET;

const row = (
  name: string,
  role: ListonePlayer["role"],
  club: string,
  quotation: number,
): ListonePlayer => ({ name, role, club, quotation });

export const D_TARGET = row("Difensore Rinnovabile", "D", "ClubUno", 30);
export const D_CEILING = row("Difensore Al Limite", "D", "ClubDue", 14);
export const D_OVER = row("Difensore Oltre Riserva", "D", "ClubTre", 16);
export const D_WHOLE = row("Difensore Tutto Il Budget", "D", "ClubQuattro", 11);
export const D_RENEWED_LAST_YEAR = row("Difensore Gia Rinnovato", "D", "ClubCinque", 9);
export const D_OTHER_TEAM = row("Difensore Di Un Altro", "D", "ClubSei", 7);
export const D_OLD_SEASON = row("Difensore Vecchia Stagione", "D", "ClubSette", 8);
export const D_ONLY_LISTONE = row("Difensore Solo In Listone", "D", "ClubOtto", 6);
export const C_TARGET = row("Centrocampista Rinnovabile", "C", "ClubUno", 25);
export const A_TARGET = row("Attaccante Rinnovabile", "A", "ClubDue", 40);
export const P_NEVER_RENEWABLE = row("Portiere Rinnovabile Mai", "P", "ClubTre", 5);

/** Il listone sintetico su cui gira questa spec. */
export const RICONFERME_LISTONE_POOL: readonly ListonePlayer[] = [
  D_TARGET,
  D_CEILING,
  D_OVER,
  D_WHOLE,
  D_RENEWED_LAST_YEAR,
  D_OTHER_TEAM,
  D_OLD_SEASON,
  D_ONLY_LISTONE,
  C_TARGET,
  A_TARGET,
  P_NEVER_RENEWABLE,
];

/** I prezzi pagati l'anno scorso: quelli — e solo quelli — che il rinnovo può riproporre. */
export const LAST_SEASON_PRICE = {
  dTarget: 35,
  dCeiling: RENEWAL_PRICE_CEILING,
  dOver: RENEWAL_PRICE_OVER,
  dWhole: RENEWAL_PRICE_WHOLE_BUDGET,
  dRenewedLastYear: 9,
  dOtherTeam: 6,
  dOldSeason: 12,
  cTarget: 20,
  aTarget: 40,
  pNeverRenewable: 5,
} as const;

/** Il prezzo che il caso normale porta in rosa e sottrae al budget iniziale. */
export const RICONFERME_TARGET_PRICE = LAST_SEASON_PRICE.dTarget;

/** Un giocatore comprato dal vivo durante la spec, mai rinnovabile: serve solo
 *  a rendere NON VUOTO lo storico dell'asta in corso. */
export const LIVE_PURCHASE_PLAYER = D_ONLY_LISTONE;
export const LIVE_PURCHASE_PRICE = 20;

export interface RenewalRow {
  readonly player: ListonePlayer;
  readonly price: number;
}

/**
 * L'elenco che il pannello RINNOVO deve mostrare per Io/D, NELL'ORDINE in cui
 * deve mostrarlo: prezzo pagato DECRESCENTE (src/renewals.ts lo dichiara — il
 * rinnovo che pesa di più sul budget è la decisione da guardare per prima).
 */
export const IO_RENEWABLE_D: readonly RenewalRow[] = [
  { player: D_WHOLE, price: LAST_SEASON_PRICE.dWhole },
  { player: D_OVER, price: LAST_SEASON_PRICE.dOver },
  { player: D_CEILING, price: LAST_SEASON_PRICE.dCeiling },
  { player: D_TARGET, price: LAST_SEASON_PRICE.dTarget },
];

/** Le quattro assenze motivate dall'elenco di Io/D, ognuna per una ragione diversa. */
export const IO_EXCLUDED_D: readonly ListonePlayer[] = [
  D_RENEWED_LAST_YEAR,
  D_OTHER_TEAM,
  D_OLD_SEASON,
  D_ONLY_LISTONE,
];

export const PEOPLE = {
  io: { id: "person:00000000-0000-4000-8000-0000000000c1", name: "Squadra Sintetica Io", seat: "Io" },
  due: { id: "person:00000000-0000-4000-8000-0000000000c2", name: "Dinamo Sintetica", seat: "Squadra2" },
} as const;

/**
 * Il posto DELIBERATAMENTE senza persona: senza `personId` non esiste lo
 * storico di nessuno da interrogare, ed è un silenzio diverso da «non ha
 * rinnovabili».
 */
export const UNSEATED_TEAM_ID = "Squadra3";

/** Il registro lega: due posti occupati, gli altri liberi. */
export function riconfermeRoster(): unknown {
  return {
    schemaVersion: 2,
    people: Object.values(PEOPLE).map((p) => ({ id: p.id, name: p.name })),
    seats: Object.fromEntries(Object.values(PEOPLE).map((p) => [p.seat, p.id])),
  };
}

function purchase(
  season: string,
  personId: string,
  player: ListonePlayer,
  price: number,
  acquisition: PastAuctionPurchase["acquisition"] = "asta",
): PastAuctionPurchase {
  return { season, personId, playerId: listonePlayerKey(player), club: player.club, price, acquisition };
}

export function riconfermeHistory(): AuctionHistoryStore {
  const io = PEOPLE.io.id;
  return {
    schemaVersion: 1,
    purchases: [
      purchase(PREVIOUS_SEASON, io, D_TARGET, LAST_SEASON_PRICE.dTarget),
      purchase(PREVIOUS_SEASON, io, D_CEILING, LAST_SEASON_PRICE.dCeiling),
      purchase(PREVIOUS_SEASON, io, D_OVER, LAST_SEASON_PRICE.dOver),
      purchase(PREVIOUS_SEASON, io, D_WHOLE, LAST_SEASON_PRICE.dWhole),
      purchase(PREVIOUS_SEASON, io, D_RENEWED_LAST_YEAR, LAST_SEASON_PRICE.dRenewedLastYear, "riconferma"),
      purchase(PREVIOUS_SEASON, PEOPLE.due.id, D_OTHER_TEAM, LAST_SEASON_PRICE.dOtherTeam),
      purchase(OLDER_SEASON, io, D_OLD_SEASON, LAST_SEASON_PRICE.dOldSeason),
      purchase(PREVIOUS_SEASON, io, C_TARGET, LAST_SEASON_PRICE.cTarget),
      purchase(PREVIOUS_SEASON, io, A_TARGET, LAST_SEASON_PRICE.aTarget),
      purchase(PREVIOUS_SEASON, io, P_NEVER_RENEWABLE, LAST_SEASON_PRICE.pNeverRenewable),
    ],
  };
}

/**
 * Semina registro lega e storico d'asta, e ricarica: l'app li legge al boot.
 * `localStorage.clear()` prima, così la scena non eredita nulla — in
 * particolare NESSUNA chiave `fac_confirmations`, che è la premessa di metà
 * delle prove qui sotto.
 */
export async function seedRiconfermeScene(page: Page): Promise<void> {
  await page.evaluate(
    ([roster, history, keys]) => {
      localStorage.clear();
      localStorage.setItem(keys.roster, JSON.stringify(roster));
      localStorage.setItem(keys.history, JSON.stringify(history));
    },
    [
      riconfermeRoster(),
      riconfermeHistory(),
      { roster: LEAGUE_ROSTER_STORAGE_KEY, history: AUCTION_HISTORY_STORAGE_KEY },
    ] as const,
  );
  await page.reload();
}

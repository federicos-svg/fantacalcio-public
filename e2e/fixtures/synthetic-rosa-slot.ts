// LA CASELLA DI ROSA — scena sintetica per la modale a due pannelli.
//
// Tutto inventato: club «ClubUno/Due/Tre», giocatori «Difensore Alfa» e
// compagnia. Nessuna riga di listone reale, nessuna spesa di un partecipante
// vero, nessun nome di persona: le «persone» qui hanno nomi di fantasquadra e
// UUID legati a nessuno, come in synthetic-precedents.ts e per la stessa
// ragione (issue #234, nota privacy).
//
// PERCHE LA SCENA HA UNO STORICO D'ASTA. Il pannello RINNOVO non pesca dal
// listone: pesca dai giocatori che quella squadra aveva davvero l'anno scorso
// (src/renewals.ts). Senza storico seminato quel pannello direbbe — con
// ragione — «nessuno storico d'asta caricato», e la meta interessante della
// modale resterebbe non misurata.
//
// I QUATTRO CASI CHE LO STORICO PORTA, e servono tutti e quattro:
//   Difensore Alfa    comprato all'asta da Io: RINNOVABILE;
//   Difensore Beta    comprato all'asta da Io, ma piu caro: serve a misurare
//                     l'ordine (prezzo decrescente) e a provare che l'elenco
//                     non e quello del listone;
//   Difensore Gamma   RICONFERMATO da Io l'anno scorso: §4 vieta due stagioni
//                     di fila, quindi NON deve comparire;
//   Difensore Delta   comprato da un'ALTRA squadra: non e roba di Io.
//
// Il seeding passa da `localStorage`, che e il canale da cui l'app li legge
// davvero (`loadAuctionHistory` / `loadLeagueRoster`): la suite esercita il
// percorso vero — schema, validazione fail-closed, join posto->persona — e non
// una porta di servizio aperta per i test.

import type { Page } from "@playwright/test";
import type { ListonePlayer } from "../../src/ui/listone.js";
import { listonePlayerKey } from "../../src/ui/listone.js";

export const LEAGUE_ROSTER_KEY = "fac_league_teams";
export const AUCTION_HISTORY_KEY = "fac_auction_history";

/** La stagione da cui si rinnova: la massima ordinabile dello storico. */
export const PREVIOUS_SEASON = "2025/26";

export const D_ALFA: ListonePlayer = {
  name: "Difensore Alfa",
  role: "D",
  club: "ClubUno",
  quotation: 12,
};
export const D_BETA: ListonePlayer = {
  name: "Difensore Beta",
  role: "D",
  club: "ClubUno",
  quotation: 20,
};
export const D_GAMMA: ListonePlayer = {
  name: "Difensore Gamma",
  role: "D",
  club: "ClubDue",
  quotation: 9,
};
export const D_DELTA: ListonePlayer = {
  name: "Difensore Delta",
  role: "D",
  club: "ClubDue",
  quotation: 7,
};
export const A_ALFA: ListonePlayer = {
  name: "Attaccante Alfa",
  role: "A",
  club: "ClubTre",
  quotation: 30,
};

export const ROSA_SLOT_POOL: readonly ListonePlayer[] = [
  D_ALFA,
  D_BETA,
  D_GAMMA,
  D_DELTA,
  A_ALFA,
];

/** I prezzi pagati l'anno scorso: quelli che il rinnovo deve riproporre. */
export const LAST_SEASON_PRICE = { alfa: 14, beta: 31, gamma: 9, delta: 6 } as const;

const PEOPLE = {
  io: { id: "person:00000000-0000-4000-8000-0000000000a1", name: "Squadra Io", seat: "Io" },
  due: { id: "person:00000000-0000-4000-8000-0000000000a2", name: "Squadra Due", seat: "Squadra2" },
} as const;

export function rosaSlotRoster(): unknown {
  return {
    schemaVersion: 2,
    people: Object.values(PEOPLE).map((p) => ({ id: p.id, name: p.name })),
    seats: Object.fromEntries(Object.values(PEOPLE).map((p) => [p.seat, p.id])),
  };
}

export function rosaSlotHistory(): unknown {
  const row = (
    player: ListonePlayer,
    personId: string,
    price: number,
    acquisition: "asta" | "riconferma",
  ) => ({
    season: PREVIOUS_SEASON,
    personId,
    playerId: listonePlayerKey(player),
    club: player.club,
    price,
    acquisition,
  });
  return {
    schemaVersion: 1,
    purchases: [
      row(D_ALFA, PEOPLE.io.id, LAST_SEASON_PRICE.alfa, "asta"),
      row(D_BETA, PEOPLE.io.id, LAST_SEASON_PRICE.beta, "asta"),
      row(D_GAMMA, PEOPLE.io.id, LAST_SEASON_PRICE.gamma, "riconferma"),
      row(D_DELTA, PEOPLE.due.id, LAST_SEASON_PRICE.delta, "asta"),
    ],
  };
}

/** Semina registro lega e storico d'asta, e ricarica: l'app li legge al boot. */
export async function seedRosaSlotScene(page: Page): Promise<void> {
  await page.evaluate(
    ([roster, history, keys]) => {
      localStorage.clear();
      localStorage.setItem(keys.roster, JSON.stringify(roster));
      localStorage.setItem(keys.history, JSON.stringify(history));
    },
    [
      rosaSlotRoster(),
      rosaSlotHistory(),
      { roster: LEAGUE_ROSTER_KEY, history: AUCTION_HISTORY_KEY },
    ] as const,
  );
  await page.reload();
}

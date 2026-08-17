// PRECEDENTI D'ASTA — deposito runtime-local sintetico per la suite E2E.
//
// Tutto inventato: club «ClubUno/Due/Tre», giocatori «Primo/Quarto Portiere»,
// persone con UUID legati a nessuno e con NOMI DI FANTASQUADRA, non di
// persona. Nessuna spesa e nessun tifo di un partecipante reale della lega è
// riprodotto qui, e nessuno può esserlo (issue #234, nota privacy): i dati
// veri vivono solo nello storage locale del browser di Pico e non entrano nel
// repository per nessuna via.
//
// PERCHÉ IL SEEDING PASSA DA `localStorage`. È lo stesso canale da cui l'app
// li legge davvero (`loadAuctionHistory` / `loadOpponentProfiles` /
// `loadLeagueRoster`, tutti runtime-local): la suite esercita quindi il
// percorso vero — schema, validazione fail-closed, join posto→persona — e non
// una porta di servizio aperta apposta per i test.
//
// I tre casi seminati sono i tre che il pannello deve saper distinguere:
//   Squadra2  ha RICOMPRATO il chiamato due volte all'asta e lo ha RINNOVATO
//             una terza: il conteggio deve dire 2;
//   Squadra3  TIFA il club del chiamato e ci ha speso il 4%: non deve
//             comparire, perché il tifo non è un fatto sul giocatore;
//   Squadra4  quote alte sul club per due stagioni e CROLLO a zero
//             nell'ultima: le tre stagioni devono restare leggibili una per
//             una, mai fuse in una media.

import type { Page } from "@playwright/test";
import type { ListonePlayer } from "../../src/ui/listone.js";
import { listonePlayerKey } from "../../src/ui/listone.js";
import type {
  AuctionHistoryStore,
  OpponentProfile,
  PastAuctionPurchase,
} from "../../packages/opponent-profiles/src/types.js";

export const LEAGUE_ROSTER_KEY = "fac_league_teams";
export const OPPONENT_PROFILES_KEY = "fac_opponent_profiles";
export const AUCTION_HISTORY_KEY = "fac_auction_history";

/** Il listone sintetico su cui gira questa parte della suite. */
export const PRECEDENT_POOL: readonly ListonePlayer[] = [
  { name: "Primo Portiere", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Secondo Portiere", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Terzo Portiere", role: "P", club: "ClubDue", quotation: 5 },
  { name: "Quarto Portiere", role: "P", club: "ClubDue", quotation: 5 },
  { name: "Primo Difensore", role: "D", club: "ClubTre", quotation: 8 },
  { name: "Primo Attaccante", role: "A", club: "ClubQuattro", quotation: 20 },
];

/** Il giocatore che la suite chiama. Club «ClubDue», come Terzo Portiere. */
export const CALLED_NAME = "Quarto Portiere";
export const CALLED_CLUB = "ClubDue";

/**
 * L'identità del chiamato, calcolata con LA STESSA funzione che l'event log
 * usa per registrare un acquisto. Una seconda ricetta qui farebbe passare per
 * «un altro giocatore» lo stesso giocatore, e il test resterebbe verde su un
 * pannello vuoto per il motivo sbagliato.
 */
export const CALLED_PLAYER_ID = listonePlayerKey({ name: CALLED_NAME, club: CALLED_CLUB });

export const PEOPLE = {
  squadra2: {
    id: "person:00000000-0000-4000-8000-0000000000e2",
    name: "Dinamo Sintetica",
    seat: "Squadra2",
  },
  squadra3: {
    id: "person:00000000-0000-4000-8000-0000000000e3",
    name: "Atletico Sintetico",
    seat: "Squadra3",
  },
  squadra4: {
    id: "person:00000000-0000-4000-8000-0000000000e4",
    name: "Real Sintetica",
    seat: "Squadra4",
  },
} as const;

export const SEASONS = ["2023/24", "2024/25", "2025/26"] as const;

interface Row {
  readonly player: string;
  readonly club: string;
  readonly price: number;
  readonly renewal?: true;
}

function season(personId: string, s: string, rows: readonly Row[]): PastAuctionPurchase[] {
  return rows.map((r) => ({
    season: s,
    personId,
    playerId: r.player,
    club: r.club,
    price: r.price,
    acquisition: r.renewal === true ? "riconferma" : "asta",
  }));
}

/**
 * Squadra2 — due riacquisti all'asta del chiamato e un rinnovo in mezzo.
 * Prezzi 30 e 40: la mediana è 35, sotto la soglia dichiarata di «caro», così
 * il fatto sui propri più cari resta fuori e il pannello di questa scena
 * mostra i due fatti che interessano al test.
 */
function squadra2(): PastAuctionPurchase[] {
  const p = PEOPLE.squadra2.id;
  return [
    ...season(p, "2023/24", [
      { player: CALLED_PLAYER_ID, club: CALLED_CLUB, price: 30 },
      { player: "sint-e2-a", club: "ClubUno", price: 40 },
      { player: "sint-e2-b", club: "ClubTre", price: 30 },
    ]),
    ...season(p, "2024/25", [
      { player: CALLED_PLAYER_ID, club: CALLED_CLUB, price: 25, renewal: true },
      { player: "sint-e2-c", club: "ClubUno", price: 60 },
      { player: "sint-e2-d", club: "ClubTre", price: 40 },
    ]),
    ...season(p, "2025/26", [
      { player: CALLED_PLAYER_ID, club: CALLED_CLUB, price: 40 },
      { player: "sint-e2-e", club: "ClubUno", price: 60 },
    ]),
  ];
}

/**
 * Squadra3 — tifa ClubDue e ci ha speso il 4%. Otto righe piatte per stagione
 * (i primi tre fanno 48 su 100) così questa persona resta senza fatti QUALUNQUE
 * soglia sia in vigore: la sua assenza dal pannello deve dipendere dalla
 * regola sul tifo, non dalla fortuna di una soglia.
 */
function squadra3(): PastAuctionPurchase[] {
  const p = PEOPLE.squadra3.id;
  const flat = (s: string): PastAuctionPurchase[] =>
    season(p, s, [
      { player: `sint-e3-${s.slice(0, 4)}-1`, club: "ClubUno", price: 18 },
      { player: `sint-e3-${s.slice(0, 4)}-2`, club: "ClubTre", price: 16 },
      { player: `sint-e3-${s.slice(0, 4)}-3`, club: "ClubUno", price: 14 },
      { player: `sint-e3-${s.slice(0, 4)}-4`, club: "ClubQuattro", price: 13 },
      { player: `sint-e3-${s.slice(0, 4)}-5`, club: "ClubUno", price: 12 },
      { player: `sint-e3-${s.slice(0, 4)}-6`, club: "ClubTre", price: 11 },
      { player: `sint-e3-${s.slice(0, 4)}-7`, club: "ClubUno", price: 9 },
      { player: `sint-e3-${s.slice(0, 4)}-8`, club: "ClubQuattro", price: 3 },
      { player: `sint-e3-${s.slice(0, 4)}-9`, club: CALLED_CLUB, price: 4 }, // 4%
    ]);
  return [...flat("2023/24"), ...flat("2024/25"), ...flat("2025/26")];
}

/** Squadra4 — 45%, 35%, poi zero: il crollo nell'ultima stagione. */
function squadra4(): PastAuctionPurchase[] {
  const p = PEOPLE.squadra4.id;
  const shape = (s: string, onCalledClub: readonly number[]): PastAuctionPurchase[] =>
    season(
      p,
      s,
      [20, 15, 14, 13, 12, 11, 10, 5].map((price, i) => ({
        player: `sint-e4-${s.slice(0, 4)}-${i + 1}`,
        club: onCalledClub.includes(price) ? CALLED_CLUB : "ClubUno",
        price,
      })),
    );
  return [
    ...shape("2023/24", [20, 15, 10]), // 45%
    ...shape("2024/25", [20, 15]), // 35%
    ...shape("2025/26", []), // 0%
  ];
}

export function syntheticPrecedentHistory(): AuctionHistoryStore {
  return {
    schemaVersion: 1,
    purchases: [...squadra2(), ...squadra3(), ...squadra4()],
  };
}

/**
 * I profili d'intervista sintetici. Entrambe le persone dichiarano — e hanno
 * CONFERMATO — il tifo per il club del giocatore chiamato; una ci ha speso,
 * l'altra no, e il pannello deve trattarle in modo diverso.
 */
export function syntheticPrecedentProfiles(): readonly OpponentProfile[] {
  const affinity = {
    value: [CALLED_CLUB],
    status: "confermato" as const,
    declaredAt: "2026-08-20",
  };
  return [
    { schemaVersion: 1, personId: PEOPLE.squadra2.id, interviewId: "e2e-1", affinityClubs: affinity },
    { schemaVersion: 1, personId: PEOPLE.squadra3.id, interviewId: "e2e-2", affinityClubs: affinity },
  ];
}

/** Il registro lega sintetico: tre posti occupati, gli altri liberi. */
export function syntheticRoster(): unknown {
  return {
    schemaVersion: 2,
    people: Object.values(PEOPLE).map((p) => ({ id: p.id, name: p.name })),
    seats: Object.fromEntries(Object.values(PEOPLE).map((p) => [p.seat, p.id])),
  };
}

/**
 * Semina i tre depositi runtime-local e ricarica, perché l'app li legge al
 * boot. Da chiamare dopo `page.goto("/")` e dopo l'eventuale `localStorage.clear()`.
 */
export async function seedPrecedents(page: Page): Promise<void> {
  await page.evaluate(
    ([roster, profiles, history, keys]) => {
      localStorage.setItem(keys.roster, JSON.stringify(roster));
      localStorage.setItem(keys.profiles, JSON.stringify({ schemaVersion: 1, profiles }));
      localStorage.setItem(keys.history, JSON.stringify(history));
    },
    [
      syntheticRoster(),
      syntheticPrecedentProfiles(),
      syntheticPrecedentHistory(),
      {
        roster: LEAGUE_ROSTER_KEY,
        profiles: OPPONENT_PROFILES_KEY,
        history: AUCTION_HISTORY_KEY,
      },
    ] as const,
  );
  await page.reload();
}

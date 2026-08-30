import { describe, it, expect } from "vitest";
import { previousSeason, renewalCandidates, type RenewalInput } from "./renewals.js";
import { listonePlayerKey, type ListonePlayer } from "./ui/listone.js";
import type { ConfirmationInput } from "../packages/engine/src/confirmations.js";
import type { Role } from "../packages/engine/src/types.js";
import type { PastAuctionPurchase } from "../packages/opponent-profiles/src/types.js";

// Solo fixture sintetiche: nessun giocatore reale, nessun club reale, nessuna
// quotazione reale — nemmeno nei nomi (CLAUDE.md, core pubblico).
//
// I `playerId` non sono mai scritti a mano: si ricavano da `listonePlayerKey`
// sulla stessa riga di listone che il caso usa. È la prova, non l'assunzione,
// che la chiave dello storico e quella del listone siano la stessa cosa — se le
// due divergessero, questi test diventerebbero rossi invece di continuare a
// passare su costanti allineate a mano.

const IO = "Io";
const ALTRA = "Squadra2";
const PICO = "person:11111111-1111-1111-1111-111111111111";
const ALTRA_PERSONA = "person:22222222-2222-2222-2222-222222222222";

const SEASON_PREV = "2025/26";
const SEASON_OLD = "2024/25";

function listed(name: string, role: Role, club: string): ListonePlayer {
  return { name, role, club };
}

const DIFENSORE_ALFA = listed("Difensore Alfa", "D", "ClubUno");
const DIFENSORE_BETA = listed("Difensore Beta", "D", "ClubDue");
const DIFENSORE_GAMMA = listed("Difensore Gamma", "D", "ClubTre");
const CENTRO_ALFA = listed("Centrocampista Alfa", "C", "ClubUno");
const PORTIERE_ALFA = listed("Portiere Alfa", "P", "ClubUno");
/** Uscito dalla Serie A: c'è nello storico, non nel listone di quest'anno. */
const SPARITO = listed("Difensore Sparito", "D", "ClubQuattro");

const POOL: readonly ListonePlayer[] = [
  DIFENSORE_ALFA,
  DIFENSORE_BETA,
  DIFENSORE_GAMMA,
  CENTRO_ALFA,
  PORTIERE_ALFA,
];

function id(p: ListonePlayer): string {
  return listonePlayerKey(p);
}

function bought(
  p: ListonePlayer,
  price: number,
  overrides: Partial<PastAuctionPurchase> = {},
): PastAuctionPurchase {
  return {
    season: SEASON_PREV,
    personId: PICO,
    playerId: id(p),
    club: p.club,
    price,
    acquisition: "asta",
    ...overrides,
  };
}

function input(overrides: Partial<RenewalInput> = {}): RenewalInput {
  return {
    history: [bought(DIFENSORE_ALFA, 30)],
    seats: { [IO]: PICO, [ALTRA]: ALTRA_PERSONA },
    pool: POOL,
    confirmations: [],
    fantaTeamId: IO,
    role: "D",
    ...overrides,
  };
}

function confirmation(
  p: ListonePlayer,
  price: number,
  fantaTeamId = IO,
): ConfirmationInput {
  return { fantaTeamId, playerId: id(p), role: p.role, price };
}

describe("previousSeason", () => {
  it("è la stagione lessicograficamente massima, non l'ultima riga incontrata", () => {
    const history = [
      bought(DIFENSORE_ALFA, 10, { season: SEASON_PREV }),
      bought(DIFENSORE_BETA, 10, { season: SEASON_OLD }),
    ];
    expect(previousSeason(history)).toBe(SEASON_PREV);
    expect(previousSeason([...history].reverse())).toBe(SEASON_PREV);
  });

  it("ignora le etichette fuori da SEASON_PATTERN invece di ordinarle", () => {
    // "25-26" ordinerebbe DOPO "2025/26" in lessicografico: se entrasse
    // nell'ordinamento si eleggerebbe stagione precedente da sola.
    const history = [
      bought(DIFENSORE_ALFA, 10, { season: SEASON_PREV }),
      bought(DIFENSORE_BETA, 10, { season: "25-26" }),
    ];
    expect(previousSeason(history)).toBe(SEASON_PREV);
    expect(previousSeason([bought(DIFENSORE_BETA, 10, { season: "25-26" })])).toBeNull();
  });

  it("senza storico non c'è nessuna stagione da cui rinnovare", () => {
    expect(previousSeason([])).toBeNull();
  });
});

describe("renewalCandidates — i silenzi, uno per causa", () => {
  it("role-not-renewable: il portiere non si riconferma mai (CONFIRMATION_LIMITS.P = 0)", () => {
    const reading = renewalCandidates(
      input({
        role: "P",
        history: [bought(PORTIERE_ALFA, 20)],
        pool: POOL,
      }),
    );
    expect(reading).toEqual({ kind: "empty", reason: "role-not-renewable" });
  });

  it("role-not-renewable vince anche quando manca tutto il resto: è regola, non dato", () => {
    const reading = renewalCandidates(input({ role: "P", history: [], pool: [], seats: {} }));
    expect(reading).toEqual({ kind: "empty", reason: "role-not-renewable" });
  });

  it("role-limit-reached: la squadra ha già usato il suo difensore", () => {
    const reading = renewalCandidates(
      input({
        history: [bought(DIFENSORE_ALFA, 30)],
        confirmations: [confirmation(DIFENSORE_BETA, 25)],
      }),
    );
    expect(reading).toEqual({ kind: "empty", reason: "role-limit-reached", detail: "1/1" });
  });

  it("una riconferma di UN'ALTRA squadra non consuma il mio limite", () => {
    const reading = renewalCandidates(
      input({
        history: [bought(DIFENSORE_ALFA, 30)],
        confirmations: [confirmation(DIFENSORE_BETA, 25, ALTRA)],
      }),
    );
    expect(reading.kind).toBe("candidates");
  });

  it("una riconferma di un ALTRO ruolo non consuma il limite del difensore", () => {
    const reading = renewalCandidates(
      input({
        history: [bought(DIFENSORE_ALFA, 30)],
        confirmations: [confirmation(CENTRO_ALFA, 40)],
      }),
    );
    expect(reading.kind).toBe("candidates");
  });

  it("no-history: nessuno storico caricato non è «non ha rinnovabili»", () => {
    expect(renewalCandidates(input({ history: [] }))).toEqual({
      kind: "empty",
      reason: "no-history",
    });
  });

  it("seat-unassigned: senza persona sul posto non esiste lo storico di nessuno", () => {
    expect(renewalCandidates(input({ seats: { [IO]: null } }))).toEqual({
      kind: "empty",
      reason: "seat-unassigned",
      detail: IO,
    });
  });

  it("seat-unassigned anche quando il posto non compare proprio nella mappa", () => {
    expect(renewalCandidates(input({ seats: {} }))).toEqual({
      kind: "empty",
      reason: "seat-unassigned",
      detail: IO,
    });
  });

  it("no-previous-season: storico presente, nessuna etichetta ordinabile", () => {
    const reading = renewalCandidates(
      input({ history: [bought(DIFENSORE_ALFA, 30, { season: "25-26" })] }),
    );
    expect(reading).toEqual({ kind: "empty", reason: "no-previous-season" });
  });

  it("no-pool: senza listone non c'è ruolo da attribuire né nome da mostrare", () => {
    expect(renewalCandidates(input({ pool: [] }))).toEqual({
      kind: "empty",
      reason: "no-pool",
    });
  });

  it("no-renewable: tutto a posto, nessun superstite — e dice su quale stagione ha guardato", () => {
    const reading = renewalCandidates(
      input({ history: [bought(CENTRO_ALFA, 40)], role: "D" }),
    );
    expect(reading).toEqual({ kind: "empty", reason: "no-renewable", detail: SEASON_PREV });
  });
});

describe("renewalCandidates — chi resta fuori dall'elenco", () => {
  it("chi era già stato RINNOVATO l'anno prima non si rinnova due volte di fila", () => {
    const reading = renewalCandidates(
      input({
        history: [
          bought(DIFENSORE_ALFA, 30, { acquisition: "riconferma" }),
          bought(DIFENSORE_BETA, 12),
        ],
      }),
    );
    expect(reading).toEqual({
      kind: "candidates",
      season: SEASON_PREV,
      candidates: [
        { playerId: id(DIFENSORE_BETA), name: "Difensore Beta", club: "ClubDue", role: "D", price: 12 },
      ],
    });
  });

  it("chi non è più in listone sparisce senza rumore, non diventa una riga «ruolo ignoto»", () => {
    const reading = renewalCandidates(
      input({ history: [bought(SPARITO, 50), bought(DIFENSORE_BETA, 12)] }),
    );
    expect(reading).toEqual({
      kind: "candidates",
      season: SEASON_PREV,
      candidates: [
        { playerId: id(DIFENSORE_BETA), name: "Difensore Beta", club: "ClubDue", role: "D", price: 12 },
      ],
    });
  });

  it("chi era di un'altra persona non entra: i precedenti seguono l'essere umano", () => {
    const reading = renewalCandidates(
      input({
        history: [
          bought(DIFENSORE_ALFA, 30, { personId: ALTRA_PERSONA }),
          bought(DIFENSORE_BETA, 12),
        ],
      }),
    );
    expect(reading.kind === "candidates" && reading.candidates.map((c) => c.playerId)).toEqual([
      id(DIFENSORE_BETA),
    ]);
  });

  it("chi è stato comprato in una stagione più vecchia non è materiale di rinnovo", () => {
    const reading = renewalCandidates(
      input({
        history: [
          bought(DIFENSORE_ALFA, 99, { season: SEASON_OLD }),
          bought(DIFENSORE_BETA, 12),
        ],
      }),
    );
    expect(reading.kind === "candidates" && reading.candidates.map((c) => c.playerId)).toEqual([
      id(DIFENSORE_BETA),
    ]);
  });

  it("si tiene solo il ruolo chiesto: il centrocampista non compare fra i difensori", () => {
    const reading = renewalCandidates(
      input({ history: [bought(CENTRO_ALFA, 40), bought(DIFENSORE_BETA, 12)] }),
    );
    expect(reading.kind === "candidates" && reading.candidates.map((c) => c.playerId)).toEqual([
      id(DIFENSORE_BETA),
    ]);
  });

  it("chi è già stato riconfermato da CHIUNQUE quest'anno è bloccato per tutti", () => {
    const reading = renewalCandidates(
      input({
        history: [bought(DIFENSORE_ALFA, 30), bought(DIFENSORE_BETA, 12)],
        confirmations: [confirmation(DIFENSORE_ALFA, 30, ALTRA)],
      }),
    );
    expect(reading.kind === "candidates" && reading.candidates.map((c) => c.playerId)).toEqual([
      id(DIFENSORE_BETA),
    ]);
  });

  it("chi è già in rosa quest'anno non si rinnova", () => {
    const reading = renewalCandidates(
      input({
        history: [bought(DIFENSORE_ALFA, 30), bought(DIFENSORE_BETA, 12)],
        purchasedPlayerIds: [id(DIFENSORE_ALFA)],
      }),
    );
    expect(reading.kind === "candidates" && reading.candidates.map((c) => c.playerId)).toEqual([
      id(DIFENSORE_BETA),
    ]);
  });
});

describe("renewalCandidates — ordine e prezzo", () => {
  it("prezzo decrescente, poi playerId crescente, indipendente dall'ordine dello storico", () => {
    const history = [
      bought(DIFENSORE_BETA, 12),
      bought(DIFENSORE_GAMMA, 30),
      bought(DIFENSORE_ALFA, 30),
    ];
    const expected = [id(DIFENSORE_ALFA), id(DIFENSORE_GAMMA), id(DIFENSORE_BETA)];
    const straight = renewalCandidates(input({ history }));
    const reversed = renewalCandidates(input({ history: [...history].reverse() }));
    expect(straight.kind === "candidates" && straight.candidates.map((c) => c.playerId)).toEqual(
      expected,
    );
    expect(reversed.kind === "candidates" && reversed.candidates.map((c) => c.playerId)).toEqual(
      expected,
    );
  });

  it("il prezzo è quello pagato l'anno prima; nome, club e ruolo vengono dal listone", () => {
    const reading = renewalCandidates(
      // Club dello storico diverso da quello del listone: il giocatore si è
      // mosso, e a schermo va il club di oggi.
      input({ history: [bought(DIFENSORE_ALFA, 37, { club: "ClubVecchio" })] }),
    );
    expect(reading).toEqual({
      kind: "candidates",
      season: SEASON_PREV,
      candidates: [
        { playerId: id(DIFENSORE_ALFA), name: "Difensore Alfa", club: "ClubUno", role: "D", price: 37 },
      ],
    });
  });

  it("una riga doppia sulla stessa stagione non raddoppia il candidato", () => {
    const reading = renewalCandidates(
      input({ history: [bought(DIFENSORE_ALFA, 30), bought(DIFENSORE_ALFA, 30)] }),
    );
    expect(reading.kind === "candidates" && reading.candidates).toHaveLength(1);
  });
});

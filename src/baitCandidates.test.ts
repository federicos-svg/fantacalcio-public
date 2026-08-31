// CHI CHIAMARE PER FAR SPENDERE GLI ALTRI — le prove, ingresso → uscita attesa.
//
// Ogni fixture è SINTETICA: nessun giocatore, club, quotazione o persona reale
// entra in questo file, e non può entrarci (nota privacy, issue #234). I nomi
// sono «Sintetico …», i club «ClubAlfa/Beta/…», le persone UUID legati a
// nessuno.
//
// LA FORMA DELLE PROVE. Ogni caso dichiara l'INGRESSO e l'USCITA ATTESA, e la
// maggior parte è scritta perché diventi rossa se una promessa CENTRALE viene
// rotta — non perché copra una riga. Le sette rotture deliberate elencate nel
// rapporto passano di qui.

import { describe, it, expect, beforeEach } from "vitest";
import {
  BAIT_PARAMETERS,
  BAIT_ROLE_PROBE_PLAYER_ID,
  baitCandidates,
  exposureBook,
  orderBaitCandidates,
  resetBaitCandidatesCache,
  roleProbeViolations,
  type BaitCandidate,
  type BaitInput,
  type BaitReading,
} from "./baitCandidates.js";
import { resetTierBookCache } from "./tierOrdering.js";
import { listonePlayerKey, type ListonePlayer } from "./ui/listone.js";
import { maxSafe } from "../packages/engine/src/auction.js";
import { purchaseFeasibility } from "../packages/engine/src/feasibility.js";
import {
  COST_FLOOR,
  ROLES,
  type AuctionState,
  type Role,
  type TeamState,
} from "../packages/engine/src/types.js";
import {
  DEFAULT_PRECEDENT_THRESHOLDS,
  PRECEDENT_FACT_IDS,
  auctionPrecedents,
  calledPlayerIsExpensive,
  newPrecedentFactCache,
  precedentFactsFor,
  type OpponentProfile,
  type PastAuctionPurchase,
} from "../packages/opponent-profiles/src/index.js";

// ─── Il tavolo sintetico ─────────────────────────────────────────────────────

const SELF = "Io";
const SEATS_IDS = ["Io", "Squadra2", "Squadra3", "Squadra4", "Squadra5", "Squadra6", "Squadra7", "Squadra8"];
const SEASONS = ["2021/22", "2022/23", "2023/24", "2024/25", "2025/26"] as const;

const PERSON = {
  Squadra2: "person:00000000-0000-4000-8000-0000000000e2",
  Squadra3: "person:00000000-0000-4000-8000-0000000000e3",
  Squadra4: "person:00000000-0000-4000-8000-0000000000e4",
  Squadra6: "person:00000000-0000-4000-8000-0000000000e6",
} as const;

const SEATS: Record<string, string | null> = {
  Io: null,
  Squadra2: PERSON.Squadra2,
  Squadra3: PERSON.Squadra3,
  Squadra4: PERSON.Squadra4,
  Squadra5: null,
  Squadra6: PERSON.Squadra6,
  Squadra7: null,
  Squadra8: null,
};

const FULL_SLOTS: Record<Role, number> = { P: 3, D: 9, C: 9, A: 7 };

function team(
  fantaTeamId: string,
  slots: Record<Role, number> = FULL_SLOTS,
  budgetResidual = 500,
): TeamState {
  const total = slots.P + slots.D + slots.C + slots.A;
  return {
    fantaTeamId,
    spent: 500 - budgetResidual,
    budgetResidual,
    filled: { P: 3 - slots.P, D: 9 - slots.D, C: 9 - slots.C, A: 7 - slots.A },
    slotsRemaining: { ...slots },
    totalSlotsRemaining: total,
    roster: [],
  };
}

function stateOf(
  overrides: Readonly<Record<string, TeamState>> = {},
  purchasedPlayerIds: readonly string[] = [],
): AuctionState {
  const teams: Record<string, TeamState> = {};
  for (const id of SEATS_IDS) teams[id] = overrides[id] ?? team(id);
  return { teams, purchasedPlayerIds, lastSeq: purchasedPlayerIds.length - 1 };
}

// ─── Il listone sintetico ────────────────────────────────────────────────────

const CLUB_ALFA = "ClubAlfa";
const CLUB_BETA = "ClubBeta";
const CLUB_GAMMA = "ClubGamma";

/** X — l'attaccante libero di ClubAlfa attorno a cui girano quasi tutti i casi. */
const X: ListonePlayer = { name: "Sintetico Alfa", role: "A", club: CLUB_ALFA, quotation: 20 };
const X_ID = listonePlayerKey(X);

/** Una riga di ClubBeta: club MAI toccato dallo storico, quindi fuori dal pre-filtro. */
const COLD: ListonePlayer = { name: "Sintetico Beta", role: "A", club: CLUB_BETA, quotation: 4 };

const POOL: readonly ListonePlayer[] = [X, COLD];

// ─── Lo storico sintetico ────────────────────────────────────────────────────

function row(
  personId: string,
  season: string,
  playerId: string,
  club: string,
  price: number,
  acquisition: "asta" | "riconferma" = "asta",
): PastAuctionPurchase {
  return { season, personId, playerId, club, price, acquisition };
}

/**
 * Squadra2 — TIFA ClubAlfa (dichiarazione confermata, sotto) e ci ha speso
 * ZERO in tutte le stagioni. Sette righe piatte da club diversi: nessuna quota
 * su ClubAlfa, nessun ricomprato, top-3 sotto il 50%.
 */
function squadra2(): PastAuctionPurchase[] {
  const out: PastAuctionPurchase[] = [];
  for (const s of SEASONS) {
    const prices = [13, 13, 13, 13, 13, 13, 9, 13];
    prices.forEach((price, i) => {
      out.push(row(PERSON.Squadra2, s, `sint-e2-${s.slice(0, 4)}-${i}`, CLUB_GAMMA, price));
    });
  }
  return out;
}

/**
 * Squadra3 — 22% su ClubAlfa in TRE stagioni su cinque (soglia 0,15), zero
 * nelle prime due. Le righe restanti sono piatte apposta: top-3 al 48%, sotto
 * la soglia `topShare`, così il caso mostra il fatto `club` e non due fatti.
 */
function squadra3(): PastAuctionPurchase[] {
  const out: PastAuctionPurchase[] = [];
  SEASONS.forEach((s, index) => {
    const onAlfa = index >= 2;
    if (onAlfa) out.push(row(PERSON.Squadra3, s, `sint-e3-${s.slice(0, 4)}-alfa`, CLUB_ALFA, 22));
    const others = onAlfa ? [13, 13, 13, 13, 13, 13] : [13, 13, 13, 13, 13, 13, 13, 9];
    others.forEach((price, i) => {
      out.push(row(PERSON.Squadra3, s, `sint-e3-${s.slice(0, 4)}-${i}`, CLUB_GAMMA, price));
    });
  });
  return out;
}

/**
 * Squadra6 — ha RICOMPRATO X all'asta in due stagioni (60 e 71) e lo ha
 * RINNOVATO una terza volta. Il rinnovo è PROVENIENZA del conteggio, mai un
 * secondo segnale.
 */
function squadra6(): PastAuctionPurchase[] {
  return [
    row(PERSON.Squadra6, "2022/23", X_ID, CLUB_ALFA, 60),
    row(PERSON.Squadra6, "2022/23", "sint-e6-a", CLUB_GAMMA, 20),
    row(PERSON.Squadra6, "2022/23", "sint-e6-b", CLUB_GAMMA, 20),
    row(PERSON.Squadra6, "2022/23", "sint-e6-c", CLUB_GAMMA, 20),
    row(PERSON.Squadra6, "2022/23", "sint-e6-d", CLUB_GAMMA, 20),
    row(PERSON.Squadra6, "2022/23", "sint-e6-e", CLUB_GAMMA, 20),
    row(PERSON.Squadra6, "2023/24", X_ID, CLUB_ALFA, 71),
    row(PERSON.Squadra6, "2023/24", "sint-e6-f", CLUB_GAMMA, 20),
    row(PERSON.Squadra6, "2023/24", "sint-e6-g", CLUB_GAMMA, 20),
    row(PERSON.Squadra6, "2023/24", "sint-e6-h", CLUB_GAMMA, 20),
    row(PERSON.Squadra6, "2023/24", "sint-e6-i", CLUB_GAMMA, 20),
    row(PERSON.Squadra6, "2023/24", "sint-e6-j", CLUB_GAMMA, 20),
    row(PERSON.Squadra6, "2024/25", X_ID, CLUB_ALFA, 55, "riconferma"),
    row(PERSON.Squadra6, "2024/25", "sint-e6-k", CLUB_GAMMA, 20),
    row(PERSON.Squadra6, "2024/25", "sint-e6-l", CLUB_GAMMA, 20),
  ];
}

const HISTORY: readonly PastAuctionPurchase[] = [...squadra2(), ...squadra3(), ...squadra6()];

/** Il tifo DICHIARATO E CONFERMATO di Squadra2 per il club di X. */
const PROFILES: readonly OpponentProfile[] = [
  {
    schemaVersion: 1,
    personId: PERSON.Squadra2,
    interviewId: "sint-1",
    affinityClubs: { value: [CLUB_ALFA], status: "confermato", declaredAt: "2026-08-24" },
  },
];

// ─── L'ingresso ──────────────────────────────────────────────────────────────

interface Case {
  readonly pool?: readonly ListonePlayer[];
  readonly history?: readonly PastAuctionPurchase[];
  readonly seats?: Record<string, string | null>;
  readonly teams?: Readonly<Record<string, TeamState>>;
  readonly purchased?: readonly string[];
  readonly thresholds?: typeof DEFAULT_PRECEDENT_THRESHOLDS;
}

function inputOf(c: Case = {}): BaitInput {
  const history = c.history ?? HISTORY;
  return {
    pool: c.pool ?? POOL,
    source: "remote",
    book: exposureBook(history, c.thresholds ?? DEFAULT_PRECEDENT_THRESHOLDS),
    seats: c.seats ?? SEATS,
    state: stateOf(c.teams ?? {}, c.purchased ?? []),
    selfId: SELF,
    logLength: (c.purchased ?? []).length,
  };
}

function reading(c: Case = {}): BaitReading {
  return baitCandidates(inputOf(c));
}

function candidateFor(r: BaitReading, playerId: string): BaitCandidate | undefined {
  return r.kind === "candidates" ? r.candidates.find((x) => x.playerId === playerId) : undefined;
}

function exposedSeats(r: BaitReading, playerId: string): readonly string[] {
  return (candidateFor(r, playerId)?.exposed ?? []).map((e) => e.fantaTeamId);
}

function refusalFor(r: BaitReading, playerId: string, seat: string): string | undefined {
  return candidateFor(r, playerId)?.refused.find((x) => x.fantaTeamId === seat)?.reason;
}

beforeEach(() => {
  resetBaitCandidatesCache();
  resetTierBookCache();
});

// ─── E1 — il tifo non crea esposizione ───────────────────────────────────────

describe("E1 — il tifo dichiarato non crea esposizione", () => {
  it("Squadra2 tifa il club di X, ci ha speso lo 0%, ha slot e crediti: NON è esposta", () => {
    const r = reading();
    expect(exposedSeats(r, X_ID)).not.toContain("Squadra2");
    expect(refusalFor(r, X_ID, "Squadra2")).toBe("no-fact");
  });

  it("e il tifo È davvero dichiarato e confermato: lo prova il pannello che lo legge", () => {
    // Il contraddittorio del caso: `auctionPrecedents` VEDE il tifo di
    // Squadra2 su quel club (`supportedClub` non è null) — quindi la sua
    // assenza dall'esca non dipende da una fixture sbagliata, dipende dalla
    // regola. Squadra2 non compare nemmeno lì, perché `supportedClub` non è un
    // `PrecedentFact`: è la stessa garanzia strutturale, vista da due lati.
    const panel = auctionPrecedents({
      called: { playerId: X_ID, club: CLUB_ALFA },
      history: HISTORY,
      seats: SEATS,
      profiles: PROFILES,
      selfSeatId: SELF,
    });
    expect(panel.opponents.map((o) => o.fantaTeamId)).not.toContain("Squadra2");
    const withProfile = auctionPrecedents({
      called: { playerId: X_ID, club: CLUB_ALFA },
      history: [...HISTORY, row(PERSON.Squadra2, "2025/26", "sint-e2-alfa", CLUB_ALFA, 1)],
      seats: SEATS,
      profiles: PROFILES,
      selfSeatId: SELF,
    });
    // Con una riga su ClubAlfa il tifo diventa VISIBILE come nota (con la sua
    // spesa misurata accanto) senza però creare la voce: la spesa è sotto la
    // soglia, quindi nessun fatto, quindi nessuna riga. Il tifo, da solo, non
    // ha mai un modo di far comparire nessuno.
    expect(withProfile.opponents.map((o) => o.fantaTeamId)).not.toContain("Squadra2");
  });

  it("l'ingresso dell'esca non ha nemmeno un canale per i profili d'intervista", () => {
    // Garanzia STRUTTURALE, non procedurale: `BaitInput` non ha un campo
    // `profiles`, quindi nessuna versione futura di questo calcolo può leggere
    // un tifo senza prima allargare la firma — che è la riga che un revisore
    // vede.
    expect(Object.keys(inputOf())).not.toContain("profiles");
  });
});

// ─── E2 — la concentrazione sul club, con la sua prova ───────────────────────

describe("E2 — Squadra3, 22% sul club di X in 3 stagioni su 5", () => {
  it("è esposta, contribuisce +1, e la prova è quella misurata", () => {
    const r = reading();
    expect(exposedSeats(r, X_ID)).toContain("Squadra3");
    const exposure = candidateFor(r, X_ID)!.exposed.find((e) => e.fantaTeamId === "Squadra3")!;
    const fact = exposure.facts.find((f) => f.id === "club");
    expect(fact).toBeDefined();
    expect(fact).toMatchObject({
      id: "club",
      club: CLUB_ALFA,
      seasonsMeasured: 5,
      seasonsAtOrAbove: 3,
      threshold: 0.15,
    });
    expect(candidateFor(r, X_ID)!.exposedCount).toBe(exposedSeats(r, X_ID).length);
  });

  it("la provenienza dichiarata è lo storico d'asta misurato", () => {
    expect(reading().basis).toBe("auction-history");
  });
});

// ─── E3/E4 — slot e crediti, uno per volta ───────────────────────────────────

describe("E3 — slot pieno nel ruolo: non è esposizione", () => {
  it("Squadra3 con A a zero non contribuisce, e il motivo è role-full", () => {
    const r = reading({
      teams: { Squadra3: team("Squadra3", { P: 3, D: 9, C: 9, A: 0 }) },
    });
    expect(exposedSeats(r, X_ID)).not.toContain("Squadra3");
    expect(refusalFor(r, X_ID, "Squadra3")).toBe("role-full");
    // E il conteggio NON lo include: è il numero che finisce a schermo.
    expect(candidateFor(r, X_ID)!.exposedCount).toBe(candidateFor(r, X_ID)!.exposed.length);
    expect(exposedSeats(r, X_ID)).toEqual(["Squadra6"]);
  });
});

describe("E4 — «ha il ruolo scoperto ma non i crediti» non è esposizione", () => {
  it("Squadra3 budget-locked (maxSafe 0) non contribuisce", () => {
    // 27 slot da riempire dopo questo, 27 crediti: maxSafe = 0, budget-locked.
    const locked = team("Squadra3", FULL_SLOTS, 27);
    expect(maxSafe(locked, "A")).toMatchObject({ biddable: false, maxSafe: 0, reason: "budget-locked" });
    const r = reading({ teams: { Squadra3: locked } });
    expect(exposedSeats(r, X_ID)).not.toContain("Squadra3");
    expect(refusalFor(r, X_ID, "Squadra3")).toBe("budget-locked");
  });
});

// ─── E5 — ricomprato, col rinnovo come provenienza ───────────────────────────

describe("E5 — Squadra6 ha ricomprato X due volte, più un rinnovo", () => {
  it("è esposta col fatto `ricomprato`, e il rinnovo resta fuori dal conteggio", () => {
    const r = reading();
    const exposure = candidateFor(r, X_ID)!.exposed.find((e) => e.fantaTeamId === "Squadra6")!;
    const fact = exposure.facts.find((f) => f.id === "ricomprato");
    expect(fact).toMatchObject({
      id: "ricomprato",
      auctionPurchases: 2,
      purchaseSeasons: ["2022/23", "2023/24"],
      renewalsExcluded: 1,
    });
    expect(fact).toHaveProperty("prices", [
      { season: "2022/23", price: 60 },
      { season: "2023/24", price: 71 },
    ]);
  });

  it("il rinnovo non è un secondo segnale: due acquisti d'asta, non tre", () => {
    const r = reading();
    const fact = candidateFor(r, X_ID)!
      .exposed.find((e) => e.fantaTeamId === "Squadra6")!
      .facts.find((f) => f.id === "ricomprato")!;
    expect(fact).toHaveProperty("auctionPurchases", 2);
  });
});

// ─── E6/E7 — i silenzi, e sono due cose diverse ──────────────────────────────

describe("E6 — nessun esposto", () => {
  it("il sottoblocco non ha righe e il motivo è no-exposed", () => {
    // Uno storico che esiste ma non tocca né il giocatore né il suo club.
    const elsewhere = [
      row(PERSON.Squadra3, "2025/26", "sint-altro-1", CLUB_GAMMA, 30),
      row(PERSON.Squadra3, "2025/26", "sint-altro-2", CLUB_GAMMA, 30),
      row(PERSON.Squadra3, "2025/26", "sint-altro-3", CLUB_GAMMA, 40),
    ];
    const r = reading({ history: elsewhere, pool: [COLD] });
    expect(r.kind).toBe("empty");
    expect(r).toMatchObject({ reason: "no-exposed" });
  });
});

describe("E7 — nessuno storico", () => {
  it("il motivo è no-history, che è «non lo so» e non una risposta", () => {
    const r = reading({ history: [] });
    expect(r).toMatchObject({ kind: "empty", reason: "no-history" });
  });
});

// ─── E8 — il candidato in prima fascia si marca, non si toglie ───────────────

describe("E8 — il candidato è anche in prima fascia del suo ruolo", () => {
  /** Dodici attaccanti: con otto squadre al tavolo la prima fascia ne prende 8. */
  function tieredPool(): ListonePlayer[] {
    const rows: ListonePlayer[] = [
      { ...X, appealIndex: index(99) },
      { ...COLD, appealIndex: index(1) },
    ];
    for (let i = 0; i < 12; i += 1) {
      rows.push({
        name: `Sintetico Riempitivo ${String(i).padStart(2, "0")}`,
        role: "A",
        club: CLUB_GAMMA,
        quotation: 3,
        appealIndex: index(90 - i * 5),
      });
    }
    return rows;
  }
  const index = (score: number) => ({
    score,
    quality: "sintetico — fixture, non validato",
    recipe: "SYNTHETIC-APPEAL-RECIPE@0.0.0",
    components: { appetibilitaBase: score },
  });

  it("la riga COMPARE, col marcatore, e non viene rimossa", () => {
    const r = reading({ pool: tieredPool() });
    const candidate = candidateFor(r, X_ID);
    expect(candidate).toBeDefined();
    expect(candidate!.alsoTopTier).toBe(true);
  });

  it("il marcatore non muove la riga di una posizione: l'ordine lo ignora", () => {
    const r = reading({ pool: tieredPool() });
    expect(r.kind).toBe("candidates");
    if (r.kind !== "candidates") return;
    const before = r.candidates.map((c) => c.playerId);
    const flipped = r.candidates.map((c) => ({ ...c, alsoTopTier: !c.alsoTopTier }));
    expect(orderBaitCandidates(flipped).map((c) => c.playerId)).toEqual(before);
  });

  it("una riga in fondo all'ordine di fascia NON porta il marcatore", () => {
    // La contro-prova: senza di lei «marcatore sempre acceso» passerebbe.
    const rows = tieredPool();
    const bottom: ListonePlayer = {
      name: "Sintetico Fondo",
      role: "A",
      club: CLUB_ALFA,
      quotation: 1,
      appealIndex: index(0.5),
    };
    const r = reading({ pool: [...rows, bottom] });
    expect(candidateFor(r, listonePlayerKey(bottom))?.alsoTopTier).toBe(false);
  });
});

// ─── E9/E10 — il cancello, PRIMA del calcolo ─────────────────────────────────

describe("E9 — l'apertura non è finanziabile: nessun candidato viene calcolato", () => {
  it("no-affordable-opening, e il contatore delle valutazioni resta a zero", () => {
    const me = team(SELF, { P: 0, D: 0, C: 1, A: 3 }, 3);
    expect(me.totalSlotsRemaining).toBe(4);
    // La contabilità del caso, verificata sul motore e non assunta:
    // 3 − 1 = 2 < 3 x 1 ⇒ breaks-hard-reserve, e maxSafe è budget-locked.
    expect(
      purchaseFeasibility(stateOf({ Io: me }), {
        playerId: X_ID,
        role: "A",
        fantaTeamId: SELF,
        price: COST_FLOOR,
      }).violations,
    ).toContain("breaks-hard-reserve");
    expect(maxSafe(me, "A").reason).toBe("budget-locked");

    const r = reading({ teams: { Io: me } });
    expect(r).toMatchObject({ kind: "empty", reason: "no-affordable-opening", evaluated: 0 });
  });
});

describe("E10 — tutti i miei reparti pieni", () => {
  it("no-open-role, e ancora zero valutazioni", () => {
    const r = reading({ teams: { Io: team(SELF, { P: 0, D: 0, C: 0, A: 0 }) } });
    expect(r).toMatchObject({ kind: "empty", reason: "no-open-role", evaluated: 0 });
  });
});

describe("il cancello è della POPOLAZIONE, non dei vincitori", () => {
  it("un candidato ammesso lascia il contatore a uno, non a due", () => {
    // Due righe nel listone, una sola sopravvive al pre-filtro: il conteggio
    // dice che l'altra non è stata nemmeno guardata.
    const r = reading();
    expect(r).toMatchObject({ kind: "candidates", evaluated: 1 });
  });

  it("un giocatore già venduto non entra nella popolazione", () => {
    const r = reading({ purchased: [X_ID] });
    expect(r).toMatchObject({ kind: "empty", evaluated: 0 });
  });

  it("la sonda del cancello per ruolo non giudica mai sul doppione", () => {
    expect(roleProbeViolations(["role-full", "duplicate-player"])).toEqual(["role-full"]);
    expect(BAIT_ROLE_PROBE_PLAYER_ID.startsWith(" ")).toBe(true);
    // E la sonda non può collidere con una chiave di listone della via
    // nome+club: il normalizzatore lascia solo `[a-z0-9-]`.
    expect(listonePlayerKey(X)).not.toContain(" ");
  });
});

// ─── E13 — la soglia di campione è un INTERRUTTORE ───────────────────────────

describe("E13 — un fatto su una sola stagione, con la soglia a due", () => {
  /** Squadra4 compra X una volta sola, in una stagione sola. */
  const oneSeason: readonly PastAuctionPurchase[] = [
    row(PERSON.Squadra4, "2025/26", X_ID, CLUB_ALFA, 30),
    row(PERSON.Squadra4, "2025/26", "sint-e4-a", CLUB_GAMMA, 30),
  ];

  it("con la soglia dichiarata (1) è esposta", () => {
    const r = reading({ history: oneSeason, seats: SEATS });
    expect(exposedSeats(r, X_ID)).toEqual(["Squadra4"]);
  });

  it("con la soglia a 2 NON è esposta, e il motivo è below-sample", () => {
    const r = reading({
      history: oneSeason,
      thresholds: { ...DEFAULT_PRECEDENT_THRESHOLDS, minSeasonsMeasured: 2 },
    });
    // Nessun candidato resta: il sottoblocco dichiara quale silenzio è, e non
    // lo confonde con «nessun precedente».
    expect(r).toMatchObject({ kind: "empty", reason: "below-sample" });
  });

  it("interruttore, non peso: fra 1 e 2 non esiste un mezzo fatto", () => {
    const at1 = reading({ history: oneSeason });
    resetBaitCandidatesCache();
    const at2 = reading({
      history: oneSeason,
      thresholds: { ...DEFAULT_PRECEDENT_THRESHOLDS, minSeasonsMeasured: 2 },
    });
    expect(at1.kind).toBe("candidates");
    expect(at2.kind).toBe("empty");
  });
});

// ─── L'ordine dichiarato ─────────────────────────────────────────────────────

describe("l'ordine è totale, dichiarato e senza pesi", () => {
  function candidate(over: Partial<BaitCandidate>): BaitCandidate {
    return {
      player: X,
      playerId: "id",
      role: "A",
      exposed: [],
      exposedCount: 0,
      refused: [],
      appealIndex: null,
      openingPrice: COST_FLOOR,
      roleSlotsBefore: 7,
      projection: { kind: "no-price", fantaTeamId: SELF },
      alsoTopTier: false,
      ...over,
    };
  }

  it("1. più avversari esposti prima", () => {
    const out = orderBaitCandidates([
      candidate({ playerId: "a", exposedCount: 1 }),
      candidate({ playerId: "b", exposedCount: 3 }),
    ]);
    expect(out.map((c) => c.playerId)).toEqual(["b", "a"]);
  });

  it("2. a parità, l'indice di appetibilità PIÙ BASSO prima", () => {
    const out = orderBaitCandidates([
      candidate({ playerId: "a", exposedCount: 2, appealIndex: 80 }),
      candidate({ playerId: "b", exposedCount: 2, appealIndex: 12 }),
    ]);
    expect(out.map((c) => c.playerId)).toEqual(["b", "a"]);
  });

  it("una riga senza indice non diventa zero: resta in fondo, dichiarata", () => {
    const out = orderBaitCandidates([
      candidate({ playerId: "senza", exposedCount: 2, appealIndex: null }),
      candidate({ playerId: "alto", exposedCount: 2, appealIndex: 99 }),
    ]);
    // Con `?? 0` «senza» starebbe PRIMA di «alto», perché 0 < 99.
    expect(out.map((c) => c.playerId)).toEqual(["alto", "senza"]);
  });

  it("4. l'ultimo criterio è la chiave di listone: stesso input, stessa lista", () => {
    const same = [
      candidate({ playerId: "zeta", exposedCount: 1, appealIndex: 5 }),
      candidate({ playerId: "alfa", exposedCount: 1, appealIndex: 5 }),
    ];
    expect(orderBaitCandidates(same).map((c) => c.playerId)).toEqual(["alfa", "zeta"]);
    expect(orderBaitCandidates([...same].reverse()).map((c) => c.playerId)).toEqual(["alfa", "zeta"]);
  });
});

// ─── Gli invarianti ──────────────────────────────────────────────────────────

describe("invarianti — verificati, non assunti", () => {
  it("nessuno scalare per avversario: la grandezza è la PRESENZA, cioè un bit", () => {
    const r = reading();
    expect(r.kind).toBe("candidates");
    if (r.kind !== "candidates") return;
    for (const c of r.candidates) {
      for (const exposure of c.exposed) {
        const numeric = Object.entries(exposure).filter(([, v]) => typeof v === "number");
        expect(numeric, `campo numerico per avversario su ${exposure.fantaTeamId}`).toEqual([]);
        expect(Object.keys(exposure).sort()).toEqual(["facts", "fantaTeamId", "personId"]);
      }
    }
  });

  it("gli esposti escono per POSTO crescente, mai per «quanto»", () => {
    const r = reading();
    const seats = exposedSeats(r, X_ID);
    expect([...seats].sort((a, b) => a.localeCompare(b))).toEqual([...seats]);
  });

  it("l'unico credito dichiarato è il prezzo base, e sta sotto maxSafe", () => {
    const r = reading();
    if (r.kind !== "candidates") throw new Error("atteso un candidato");
    const me = stateOf().teams[SELF]!;
    for (const c of r.candidates) {
      expect(c.openingPrice).toBe(COST_FLOOR);
      const safe = maxSafe(me, c.role);
      expect(safe.biddable).toBe(true);
      expect(c.openingPrice).toBeLessThanOrEqual(safe.maxSafe);
    }
  });

  it("i tre parametri viaggiano con l'esito, ispezionabili accanto ai numeri", () => {
    expect(reading().parameters).toEqual({
      openingPrice: COST_FLOOR,
      minSeasonsMeasured: DEFAULT_PRECEDENT_THRESHOLDS.minSeasonsMeasured,
      rowsMax: 3,
      rowsMaxStatus: "ratificato da Pico il 2026-08-31",
    });
    expect(BAIT_PARAMETERS.openingPrice).toBe(COST_FLOOR);
    expect(BAIT_PARAMETERS.minSeasonsMeasured).toBe(1);
  });

  it("nessun campo direttivo esce da qui", () => {
    const r = reading();
    if (r.kind !== "candidates") throw new Error("atteso un candidato");
    const keys = new Set(r.candidates.flatMap((c) => Object.keys(c)));
    for (const forbidden of [
      "value",
      "valore",
      "fairToMe",
      "targetBand",
      "stretchCap",
      "score",
      "punteggio",
      "intensity",
      "weight",
      "probability",
    ]) {
      expect(keys.has(forbidden), `campo direttivo ${forbidden}`).toBe(false);
    }
  });

  it("nessun ruolo aperto per me ⇒ nessun avversario viene nemmeno interrogato", () => {
    for (const role of ROLES) {
      const only: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
      only[role] = 1;
      const r = reading({ teams: { Io: team(SELF, only) } });
      // Con un solo reparto aperto, un candidato di ruolo diverso non è mai
      // valutato: il cancello 1 lo esclude insieme a tutto il suo ruolo.
      if (role !== "A") expect(r).toMatchObject({ evaluated: 0 });
      else expect(r).toMatchObject({ kind: "candidates" });
    }
  });
});

// ─── Il pre-filtro è ESATTO: la prova contro la via lenta ────────────────────

describe("il pre-filtro non scarta niente che il fatto avrebbe ammesso", () => {
  /**
   * LA VIA LENTA E OVVIAMENTE CORRETTA: `auctionPrecedents()` per OGNI riga
   * libera, cioè una validazione zod completa dello storico per candidato —
   * esattamente ciò che l'esca esiste per non fare. È il termine di paragone
   * del pre-filtro, sullo stesso modello di `opportunityRadarReference.ts`.
   */
  function referenceExposed(
    pool: readonly ListonePlayer[],
    history: readonly PastAuctionPurchase[],
    state: AuctionState,
  ): Map<string, string[]> {
    const out = new Map<string, string[]>();
    const me = state.teams[SELF]!;
    for (const p of pool) {
      const playerId = listonePlayerKey(p);
      if (state.purchasedPlayerIds.includes(playerId)) continue;
      const mine = maxSafe(me, p.role);
      if (!mine.biddable || mine.maxSafe < COST_FLOOR) continue;
      const panel = auctionPrecedents({
        called: { playerId, club: p.club },
        history,
        seats: SEATS,
        profiles: PROFILES,
        selfSeatId: SELF,
      });
      const seats = panel.opponents
        .filter((o) => {
          const t = state.teams[o.fantaTeamId];
          if (t === undefined) return false;
          const safe = maxSafe(t, p.role);
          return safe.biddable && safe.maxSafe >= COST_FLOOR;
        })
        .map((o) => o.fantaTeamId);
      if (seats.length > 0) out.set(playerId, seats);
    }
    return out;
  }

  /**
   * IL TRIPWIRE, ed è la guardia che il confronto con la via lenta NON dà.
   *
   * IL BUCO CHE CHIUDE. Il caso qui sotto confronta pre-filtro e via lenta su
   * una FIXTURE: prova che i due concordano su ciò che quella fixture contiene.
   * Se domani `PRECEDENT_FACT_IDS` guadagnasse un quarto fatto NEUTRO rispetto
   * al club e all'acquisto — poniamo «ha speso molto nella stessa fascia di
   * prezzo» — il pre-filtro comincerebbe a scartare in silenzio righe che quel
   * fatto avrebbe ammesso, e il confronto resterebbe verde: la fixture quel
   * fatto non lo conosce, quindi le due vie continuerebbero a concordare su
   * niente. È un falso negativo invisibile, il guasto peggiore per un
   * pre-filtro.
   *
   * PERCHÉ QUESTA FORMA. Non dipende da nessuna fixture: si rompe nell'ISTANTE
   * in cui il vocabolario cresce, qualunque cosa la nuova fixture contenga.
   * `precedentFactsFor()` (packages/opponent-profiles/src/precedents.ts) chiama
   * tre costruttori CABLATI A MANO e non itera su questo elenco, e
   * `computeExposureBook()` (src/baitCandidates.ts) ricava `hotClubs` e
   * `historyPlayers` da quella stessa terna: niente lega meccanicamente i due,
   * e questa riga è il legame.
   *
   * QUANDO SCATTA, NON AGGIORNARE IL LETTERALE E BASTA. Il verde si ricompra
   * rivedendo, in quest'ordine:
   *   1. `computeExposureBook()` in src/baitCandidates.ts — il nuovo fatto è
   *      coperto da `hotClubs` o da `historyPlayers`? Se non lo è, il
   *      pre-filtro NON è più esatto e va allargato (o rimosso per quel fatto);
   *   2. la fixture del caso «via lenta» qui sotto — deve contenere una riga
   *      che quel nuovo fatto ammette e che il pre-filtro potrebbe scartare,
   *      altrimenti il confronto resta cieco esattamente come oggi;
   *   3. il commento su `ExposureBook.hotClubs`, che DICHIARA l'esattezza del
   *      pre-filtro e diventerebbe falso.
   * Solo dopo si aggiorna questo letterale.
   */
  it("il pre-filtro copre esattamente i fatti dichiarati: un quarto fatto deve rivedere questo test", () => {
    expect(PRECEDENT_FACT_IDS).toEqual(["ricomprato", "club", "piu-cari"]);
  });

  it("stessi candidati e stessi esposti della via lenta", () => {
    const pool = [
      X,
      COLD,
      { name: "Sintetico Gamma", role: "C", club: CLUB_GAMMA, quotation: 6 } as ListonePlayer,
      { name: "Sintetico Delta", role: "D", club: CLUB_ALFA, quotation: 6 } as ListonePlayer,
    ];
    const state = stateOf();
    const fast = baitCandidates({ ...inputOf({ pool }), state });
    const slow = referenceExposed(pool, HISTORY, state);
    const fastMap = new Map<string, string[]>(
      fast.kind === "candidates"
        ? fast.candidates.map((c) => [c.playerId, c.exposed.map((e) => e.fantaTeamId)])
        : [],
    );
    expect([...fastMap.keys()].sort()).toEqual([...slow.keys()].sort());
    for (const [playerId, seats] of slow) {
      // Il confronto è di APPARTENENZA, non di ordine: `auctionPrecedents`
      // ordina gli avversari per forza del tipo di fatto, l'esca per posto
      // crescente — e la seconda è una scelta dichiarata (una graduatoria di
      // intensità è esattamente ciò che qui non si fa). L'ordine per posto ha
      // la sua asserzione dedicata più sopra.
      expect([...(fastMap.get(playerId) ?? [])].sort(), `esposti su ${playerId}`).toEqual(
        [...seats].sort(),
      );
    }
  });

  it("la memoria di lavoro dei fatti è trasparente: con e senza, gli stessi fatti", () => {
    // `precedentFactsFor` accetta una `PrecedentFactCache` per non ricalcolare
    // i due fatti che dipendono dal CLUB e non dal giocatore. Se quella memoria
    // rispondesse anche una sola volta con il fatto di un'altra persona o di un
    // altro club, i numeri resterebbero plausibili e sarebbero di qualcun
    // altro: qui le due vie si confrontano su ogni coppia (persona, riga).
    const book = exposureBook(HISTORY);
    const cache = newPrecedentFactCache();
    const pool = [X, COLD, { name: "Sintetico Gamma", role: "C", club: CLUB_GAMMA } as ListonePlayer];
    for (const person of book.personHistories.values()) {
      for (const p of pool) {
        const playerId = listonePlayerKey(p);
        const median = book.medianByPlayer.get(playerId);
        const expensive =
          median !== undefined && median >= DEFAULT_PRECEDENT_THRESHOLDS.expensiveFrom;
        const called = { playerId, club: p.club };
        expect(
          precedentFactsFor(person, called, DEFAULT_PRECEDENT_THRESHOLDS, expensive, cache),
          `${person.personId} su ${playerId}`,
        ).toEqual(precedentFactsFor(person, called, DEFAULT_PRECEDENT_THRESHOLDS, expensive));
      }
    }
  });

  it("la mediana precalcolata dice la stessa cosa di calledPlayerIsExpensive", () => {
    const book = exposureBook(HISTORY);
    for (const playerId of book.historyPlayers) {
      const median = book.medianByPlayer.get(playerId);
      const expensive = median !== undefined && median >= DEFAULT_PRECEDENT_THRESHOLDS.expensiveFrom;
      expect(
        expensive,
        `pertinenza «caro» su ${playerId}`,
      ).toBe(
        calledPlayerIsExpensive(
          HISTORY,
          { playerId, club: "" },
          DEFAULT_PRECEDENT_THRESHOLDS.expensiveFrom,
        ),
      );
    }
  });
});

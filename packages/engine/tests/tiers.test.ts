import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  APPEAL_ORDER_TIE_BREAK,
  ROSTER_REQUIREMENTS,
  buildRoleAppealOrder,
  maxSafe,
  reduce,
  tierBook,
  tierFacts,
  validateAppealOrdering,
  type AppealOrdering,
  type AuctionEvent,
  type ConfirmationInput,
  type PoolPlayer,
  type Role,
  type TierFacts,
} from "../src/index.js";
import { FANTA_TEAM_IDS, syntheticPool } from "../fixtures/synthetic.js";
import {
  SYNTHETIC_ORDER_PROVENANCE,
  idsOf,
  orderingOf,
  syntheticAppealOrdering,
} from "../fixtures/syntheticAppealOrder.js";

const TEAMS = FANTA_TEAM_IDS;
const TS = "2026-08-01T12:00:00Z";
const POOL = syntheticPool();

function purchase(
  seq: number,
  playerId: string,
  role: Role,
  fantaTeamId: string,
  price: number,
): AuctionEvent {
  return { type: "PURCHASE", seq, ts: TS, playerId, role, fantaTeamId, price };
}

/** Il libro sintetico standard: tutti e quattro i ruoli, otto squadre. */
function book8(): ReturnType<typeof tierBook> {
  return tierBook(syntheticAppealOrdering(), { teamsCount: TEAMS.length, pool: POOL });
}

function factsFor(
  playerId: string,
  role: Role,
  log: readonly AuctionEvent[] = [],
  opts: {
    book?: ReturnType<typeof tierBook> | null;
    selfId?: string;
    confirmations?: readonly ConfirmationInput[];
  } = {},
): TierFacts {
  const state = reduce(log, TEAMS, opts.confirmations ?? []);
  return tierFacts({
    state,
    log,
    playerId,
    role,
    book: opts.book === undefined ? book8() : opts.book,
    ...(opts.selfId === undefined ? {} : { selfId: opts.selfId }),
  });
}

// ─── L'aritmetica delle fasce viene dal regolamento, non dal motore ──────────

describe("fasce — quante e quanto larghe", () => {
  it("il numero di fasce di un ruolo È ROSTER_REQUIREMENTS, e la larghezza è il numero di squadre", () => {
    const b = book8();
    expect(b.tierSize).toBe(8);
    expect(b.byRole.get("P")!.tierCount).toBe(ROSTER_REQUIREMENTS.P);
    expect(b.byRole.get("D")!.tierCount).toBe(ROSTER_REQUIREMENTS.D);
    expect(b.byRole.get("C")!.tierCount).toBe(ROSTER_REQUIREMENTS.C);
    expect(b.byRole.get("A")!.tierCount).toBe(ROSTER_REQUIREMENTS.A);
    // I numeri di Pico: P 3 fasce / 24 giocatori, D 9/72, C 9/72, A 7/56.
    expect(ROSTER_REQUIREMENTS.P * b.tierSize).toBe(24);
    expect(ROSTER_REQUIREMENTS.D * b.tierSize).toBe(72);
    expect(ROSTER_REQUIREMENTS.C * b.tierSize).toBe(72);
    expect(ROSTER_REQUIREMENTS.A * b.tierSize).toBe(56);
  });

  it("i primi otto del ruolo sono prima fascia, i successivi otto seconda", () => {
    const index = book8().byRole.get("C")!;
    expect(index.tiers[0]).toEqual(idsOf("C", 1, 8));
    expect(index.tiers[1]).toEqual(idsOf("C", 9, 16));
    expect(index.tierOf.get("C1")).toBe(1);
    expect(index.tierOf.get("C8")).toBe(1);
    expect(index.tierOf.get("C9")).toBe(2);
  });

  it("il giocatore chiamato porta fascia, posizione e provenienza", () => {
    const facts = factsFor("C9", "C");
    expect(facts.placement).toEqual({ kind: "tier", tier: 2, position: 9 });
    expect(facts.provenance).toEqual(SYNTHETIC_ORDER_PROVENANCE);
    expect(facts.tierCount).toBe(9);
    expect(facts.tierSize).toBe(8);
    expect(facts.occupancy).toEqual({
      tier: 2,
      originalSize: 8,
      freeCount: 8,
      takenCount: 0,
    });
  });
});

// ─── Casi limite, uno per uno ────────────────────────────────────────────────

describe("caso limite — fondo (il caso normale col listone vero)", () => {
  // P ha 3 fasce da 8 = 24 posti; ordiniamo 26 portieri: gli ultimi due sono fondo.
  const longP = orderingOf([{ role: "P", playerIds: idsOf("P", 1, 26) }]);
  const b = tierBook(longP, { teamsCount: 8 });

  it("oltre l'ultima fascia non c'è una fascia: c'è «fondo»", () => {
    const index = b.byRole.get("P")!;
    expect(index.fondo).toEqual(["P25", "P26"]);
    expect(index.tierOf.has("P25")).toBe(false);
    expect(index.tiers).toHaveLength(3);
  });

  it("il chiamato di fondo ha tier null ma conserva posizione e provenienza", () => {
    const facts = factsFor("P25", "P", [], { book: b });
    expect(facts.placement).toEqual({ kind: "fondo", tier: null, position: 25 });
    expect(facts.provenance).toEqual(SYNTHETIC_ORDER_PROVENANCE);
  });

  it("fuori fascia non si inventa una contabilità di fascia: è null, non zero", () => {
    const facts = factsFor("P25", "P", [], { book: b });
    expect(facts.occupancy).toBeNull();
    expect(facts.pricesPaidInTier).toBeNull();
    for (const opponent of facts.opponents) {
      expect(opponent.ownedAtTierOrBetter).toBeNull();
      expect(opponent.ownedSameTier).toBeNull();
      expect(opponent.pricesPaidInTier).toBeNull();
    }
  });
});

describe("caso limite — ordinamento assente", () => {
  const facts = factsFor("C1", "C", [], { book: null });

  it("dice «non lo so», non una fascia dedotta", () => {
    expect(facts.placement).toEqual({ kind: "no-ordering", tier: null, position: null });
    expect(facts.provenance).toBeNull();
    expect(facts.occupancy).toBeNull();
    expect(facts.pricesPaidInTier).toBeNull();
  });

  it("i fatti che NON dipendono dall'ordinamento restano misurati", () => {
    expect(facts.tierCount).toBe(ROSTER_REQUIREMENTS.C); // regolamento, non ordinamento
    expect(facts.tierSize).toBe(TEAMS.length); // censimento del tavolo
    expect(facts.opponents).toHaveLength(TEAMS.length);
    for (const opponent of facts.opponents) {
      expect(opponent.slotsRemainingInRole).toBe(ROSTER_REQUIREMENTS.C);
      expect(opponent.budgetResidual).toBe(500);
      expect(opponent.maxBid.biddable).toBe(true);
      expect(opponent.ownedAtTierOrBetter).toBeNull();
    }
  });
});

describe("caso limite — ordinamento parziale", () => {
  it("ruolo non coperto dall'ordinamento ⇒ «role-not-ordered», con la provenienza del libro", () => {
    const partial = tierBook(orderingOf([{ role: "C", playerIds: idsOf("C", 1, 8) }]), {
      teamsCount: 8,
    });
    const facts = factsFor("A1", "A", [], { book: partial });
    expect(facts.placement).toEqual({ kind: "role-not-ordered", tier: null, position: null });
    expect(facts.provenance).toEqual(SYNTHETIC_ORDER_PROVENANCE);
  });

  it("giocatore del ruolo assente dall'ordine ⇒ «unranked», non ultimo", () => {
    const partial = tierBook(orderingOf([{ role: "C", playerIds: idsOf("C", 1, 8) }]), {
      teamsCount: 8,
    });
    const facts = factsFor("C20", "C", [], { book: partial });
    expect(facts.placement).toEqual({ kind: "unranked", tier: null, position: null });
    expect(facts.occupancy).toBeNull();
  });

  it("«role-not-ordered» e «unranked» restano due esiti distinti", () => {
    const partial = tierBook(orderingOf([{ role: "C", playerIds: idsOf("C", 1, 8) }]), {
      teamsCount: 8,
    });
    expect(factsFor("A1", "A", [], { book: partial }).placement.kind).not.toBe(
      factsFor("C20", "C", [], { book: partial }).placement.kind,
    );
  });
});

describe("caso limite — ordinamento incoerente", () => {
  it("duplicato nello stesso ruolo: violazione riportata e libro rifiutato", () => {
    const dup = orderingOf([{ role: "C", playerIds: ["C1", "C2", "C1"] }]);
    const result = validateAppealOrdering(dup);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { role: "C", index: 2, playerId: "C1", violation: "duplicate-player" },
    ]);
    expect(() => tierBook(dup, { teamsCount: 8 })).toThrow(/duplicate-player/);
  });

  it("stesso giocatore in due ruoli diversi è un duplicato", () => {
    const dup = orderingOf([
      { role: "C", playerIds: ["C1"] },
      { role: "A", playerIds: ["C1"] },
    ]);
    expect(validateAppealOrdering(dup).issues.map((i) => i.violation)).toEqual([
      "duplicate-player",
    ]);
  });

  it("giocatore che non è nel listone", () => {
    const ghost = orderingOf([{ role: "C", playerIds: ["C1", "C999"] }]);
    expect(validateAppealOrdering(ghost, POOL).issues).toEqual([
      { role: "C", index: 1, playerId: "C999", violation: "unknown-player" },
    ]);
    expect(() => tierBook(ghost, { teamsCount: 8, pool: POOL })).toThrow(/unknown-player/);
    // Senza listone il controllo non può esistere, e il contratto lo dichiara.
    expect(validateAppealOrdering(ghost).ok).toBe(true);
  });

  it("giocatore ordinato sotto un ruolo che non è il suo", () => {
    const wrong = orderingOf([{ role: "C", playerIds: ["A1"] }]);
    expect(validateAppealOrdering(wrong, POOL).issues).toEqual([
      { role: "C", index: 0, playerId: "A1", violation: "role-mismatch" },
    ]);
  });

  it("id vuoto", () => {
    const empty = orderingOf([{ role: "C", playerIds: ["C1", ""] }]);
    expect(validateAppealOrdering(empty).issues).toEqual([
      { role: "C", index: 1, playerId: "", violation: "player-id-empty" },
    ]);
  });

  it("ruolo dichiarato due volte", () => {
    const twice = orderingOf([
      { role: "C", playerIds: ["C1"] },
      { role: "C", playerIds: ["C2"] },
    ]);
    expect(validateAppealOrdering(twice).issues).toEqual([
      { role: "C", index: 1, playerId: "", violation: "duplicate-role" },
    ]);
  });

  it("provenienza incompleta: una fascia senza provenienza non è utilizzabile", () => {
    for (const broken of [
      { source: "", recipe: "R@1", tieBreak: "t" },
      { source: "s", recipe: "", tieBreak: "t" },
      { source: "s", recipe: "R@1", tieBreak: "" },
    ]) {
      const ordering: AppealOrdering = orderingOf([{ role: "C", playerIds: ["C1"] }], broken);
      expect(validateAppealOrdering(ordering).issues).toEqual([
        { role: null, index: -1, playerId: "", violation: "provenance-incomplete" },
      ]);
      expect(() => tierBook(ordering, { teamsCount: 8 })).toThrow(/provenance-incomplete/);
    }
  });

  it("riporta OGNI violazione trovata, non solo la prima", () => {
    const messy = orderingOf(
      [
        { role: "C", playerIds: ["", "C1", "C1"] },
        { role: "C", playerIds: ["C999"] },
      ],
      { source: "", recipe: "R@1", tieBreak: "t" },
    );
    expect(validateAppealOrdering(messy, POOL).issues.map((i) => i.violation)).toEqual([
      "provenance-incomplete",
      "player-id-empty",
      "duplicate-player",
      "duplicate-role",
      "unknown-player",
    ]);
  });
});

describe("caso limite — listone corto (meno giocatori di fasce × squadre)", () => {
  it("l'ultima fascia occupata è parziale, le successive sono vuote, e non c'è fondo", () => {
    // Il pool sintetico ha 30 C: 3 fasce piene da 8 + una da 6, e 5 fasce vuote.
    const index = book8().byRole.get("C")!;
    expect(index.tiers.map((t) => t.length)).toEqual([8, 8, 8, 6, 0, 0, 0, 0, 0]);
    expect(index.fondo).toEqual([]);
  });

  it("originalSize è MISURATO sulla fascia, non assunto uguale a tierSize", () => {
    const facts = factsFor("C29", "C");
    expect(facts.placement.tier).toBe(4);
    expect(facts.occupancy).toEqual({
      tier: 4,
      originalSize: 6, // non 8
      freeCount: 6,
      takenCount: 0,
    });
  });

  it("una fixture da sei righe in tutto resta trattabile", () => {
    const tiny: PoolPlayer[] = [
      { playerId: "c1", role: "C", name: "c-1" },
      { playerId: "c2", role: "C", name: "c-2" },
      { playerId: "c3", role: "C", name: "c-3" },
      { playerId: "a1", role: "A", name: "a-1" },
      { playerId: "a2", role: "A", name: "a-2" },
      { playerId: "a3", role: "A", name: "a-3" },
    ];
    const b = tierBook(
      orderingOf([
        { role: "C", playerIds: ["c1", "c2", "c3"] },
        { role: "A", playerIds: ["a1", "a2", "a3"] },
      ]),
      { teamsCount: 8, pool: tiny },
    );
    const facts = factsFor("c3", "C", [], { book: b });
    expect(facts.placement).toEqual({ kind: "tier", tier: 1, position: 3 });
    expect(facts.occupancy!.originalSize).toBe(3);
  });
});

describe("caso limite — pareggi nell'indice", () => {
  it("il criterio di rottura è dichiarato, esportato e applicato", () => {
    expect(APPEAL_ORDER_TIE_BREAK).toBe(
      "punteggio decrescente, pareggi rotti per playerId crescente (code unit UTF-16)",
    );
    const order = buildRoleAppealOrder("C", [
      { playerId: "C3", score: 62 },
      { playerId: "C1", score: 62 },
      { playerId: "C2", score: 91 },
    ]);
    expect(order.playerIds).toEqual(["C2", "C1", "C3"]);
  });

  it("l'ordine non dipende dall'ordine di ingresso (ordine totale, non sort stabile)", () => {
    const a = buildRoleAppealOrder("C", [
      { playerId: "C1", score: 62 },
      { playerId: "C2", score: 62 },
    ]);
    const b = buildRoleAppealOrder("C", [
      { playerId: "C2", score: 62 },
      { playerId: "C1", score: 62 },
    ]);
    expect(a.playerIds).toEqual(b.playerIds);
    expect(a.playerIds).toEqual(["C1", "C2"]);
  });

  it("un pareggio a cavallo del confine di fascia resta deterministico", () => {
    const entries = idsOf("C", 1, 16).map((playerId) => ({ playerId, score: 50 }));
    const b1 = tierBook(orderingOf([buildRoleAppealOrder("C", entries)]), { teamsCount: 8 });
    const b2 = tierBook(orderingOf([buildRoleAppealOrder("C", entries.slice().reverse())]), {
      teamsCount: 8,
    });
    expect(b1.byRole.get("C")!.tiers[0]).toEqual(b2.byRole.get("C")!.tiers[0]);
  });

  it("nessun verdetto ⇒ nessuna posizione: `unranked`, mai ultimo", () => {
    const order = buildRoleAppealOrder("C", [
      { playerId: "C1", score: 80 },
      { playerId: "C2", score: null },
      { playerId: "C3", score: Number.NaN },
      { playerId: "C4", score: Number.POSITIVE_INFINITY },
    ]);
    expect(order.playerIds).toEqual(["C1"]);
    const facts = factsFor("C2", "C", [], {
      book: tierBook(orderingOf([order]), { teamsCount: 8 }),
    });
    expect(facts.placement.kind).toBe("unranked");
  });
});

describe("caso limite — avversario senza slot e avversario senza budget", () => {
  it("ruolo pieno: zero slot, maxBid non offribile con motivo «role-full»", () => {
    const log: AuctionEvent[] = [];
    idsOf("P", 1, 3).forEach((playerId, i) => {
      log.push(purchase(i, playerId, "P", "psg", 1));
    });
    const facts = factsFor("P9", "P", log, { selfId: "new_milf" });
    const psg = facts.opponents.find((o) => o.fantaTeamId === "psg")!;
    expect(psg.slotsRemainingInRole).toBe(0);
    expect(psg.maxBid.biddable).toBe(false);
    expect(psg.maxBid.reason).toBe("role-full");
    expect(psg.maxBid.maxSafe).toBe(0);
  });

  it("budget esaurito: maxBid non offribile con motivo «budget-locked»", () => {
    const log: AuctionEvent[] = [purchase(0, "A1", "A", "ataturk", 500)];
    const facts = factsFor("C1", "C", log, { selfId: "new_milf" });
    const ataturk = facts.opponents.find((o) => o.fantaTeamId === "ataturk")!;
    expect(ataturk.budgetResidual).toBe(0);
    expect(ataturk.slotsRemainingInRole).toBe(9);
    expect(ataturk.maxBid.biddable).toBe(false);
    expect(ataturk.maxBid.reason).toBe("budget-locked");
  });

  it("maxBid è esattamente maxSafe(), non una seconda formula", () => {
    const log: AuctionEvent[] = [purchase(0, "C1", "C", "ac_vostra", 120)];
    const state = reduce(log, TEAMS);
    const facts = tierFacts({ state, log, playerId: "C2", role: "C", book: book8() });
    for (const opponent of facts.opponents) {
      expect(opponent.maxBid).toEqual(maxSafe(state.teams[opponent.fantaTeamId]!, "C"));
    }
  });
});

// ─── I fatti che il pannello deve poter mostrare ─────────────────────────────

describe("quanti ne restano di quella fascia", () => {
  it("conta i liberi e i presi, riconferme comprese", () => {
    const log: AuctionEvent[] = [
      purchase(0, "C1", "C", "psg", 40),
      purchase(1, "C2", "C", "ataturk", 33),
    ];
    const confirmations: ConfirmationInput[] = [
      { fantaTeamId: "new_milf", playerId: "C3", role: "C", price: 25 },
    ];
    const facts = factsFor("C5", "C", log, { confirmations });
    expect(facts.occupancy).toEqual({
      tier: 1,
      originalSize: 8,
      freeCount: 5, // C1, C2 comprati stasera; C3 riconfermato
      takenCount: 3,
    });
  });

  it("un VOID rimette il giocatore fra i liberi", () => {
    const log: AuctionEvent[] = [
      purchase(0, "C1", "C", "psg", 40),
      { type: "VOID", seq: 1, ts: TS, targetSeq: 0 },
    ];
    expect(factsFor("C5", "C", log).occupancy!.freeCount).toBe(8);
  });
});

describe("per ogni avversario — cosa ha già in quel ruolo e quella fascia", () => {
  const log: AuctionEvent[] = [
    purchase(0, "C1", "C", "psg", 90), // psg: prima fascia
    purchase(1, "C9", "C", "psg", 40), // psg: seconda fascia
    purchase(2, "C10", "C", "ataturk", 35), // ataturk: seconda fascia
    purchase(3, "A1", "A", "psg", 70), // altro ruolo: non conta
  ];

  it("«di quella fascia o migliore» include le fasce sopra", () => {
    const facts = factsFor("C11", "C", log); // chiamato di seconda fascia
    const psg = facts.opponents.find((o) => o.fantaTeamId === "psg")!;
    expect(psg.ownedAtTierOrBetter).toBe(2); // C1 (1ª) + C9 (2ª)
    expect(psg.ownedSameTier).toBe(1); // solo C9
    const ataturk = facts.opponents.find((o) => o.fantaTeamId === "ataturk")!;
    expect(ataturk.ownedAtTierOrBetter).toBe(1);
    expect(ataturk.ownedSameTier).toBe(1);
    const nobody = facts.opponents.find((o) => o.fantaTeamId === "ac_vostra")!;
    expect(nobody.ownedAtTierOrBetter).toBe(0);
  });

  it("una fascia migliore non conta come «stessa fascia»", () => {
    const facts = factsFor("C2", "C", log); // chiamato di prima fascia
    const psg = facts.opponents.find((o) => o.fantaTeamId === "psg")!;
    expect(psg.ownedAtTierOrBetter).toBe(1); // solo C1: C9 è più in basso
    expect(psg.ownedSameTier).toBe(1);
  });

  it("le riconferme contano nella rosa: chi l'ha già, l'ha già", () => {
    const facts = factsFor("C11", "C", [], {
      confirmations: [{ fantaTeamId: "psg", playerId: "C1", role: "C", price: 55 }],
    });
    const psg = facts.opponents.find((o) => o.fantaTeamId === "psg")!;
    expect(psg.ownedAtTierOrBetter).toBe(1);
  });

  it("un giocatore in rosa senza fascia non entra nel conteggio", () => {
    const partial = tierBook(orderingOf([{ role: "C", playerIds: idsOf("C", 1, 8) }]), {
      teamsCount: 8,
    });
    const facts = factsFor("C3", "C", [purchase(0, "C20", "C", "psg", 12)], { book: partial });
    const psg = facts.opponents.find((o) => o.fantaTeamId === "psg")!;
    expect(psg.ownedAtTierOrBetter).toBe(0);
  });
});

describe("i prezzi davvero pagati stasera per ruolo e fascia", () => {
  const log: AuctionEvent[] = [
    purchase(0, "C1", "C", "psg", 90),
    purchase(1, "C2", "C", "psg", 61),
    purchase(2, "C3", "C", "ataturk", 74),
    purchase(3, "C9", "C", "psg", 30), // seconda fascia: fuori dal conto di prima
    purchase(4, "A1", "A", "psg", 88), // altro ruolo: fuori dal conto
    purchase(5, "C4", "C", "ac_vostra", 999),
    { type: "VOID", seq: 6, ts: TS, targetSeq: 5 }, // annullato: non è mai stato pagato
  ];

  it("il registro del tavolo: i singoli prezzi in ordine crescente", () => {
    const facts = factsFor("C5", "C", log);
    // «quanti» = length, «minimo» = primo, «massimo» = ultimo: la derivazione
    // che fa chi mostra, senza che il motore esporti una coppia di estremi.
    expect(facts.pricesPaidInTier).toEqual([61, 74, 90]);
    expect(facts.pricesPaidInTier).toHaveLength(3);
  });

  it("una coppia di estremi NON viene esportata (divieto di forma §D9 perimetro 2)", () => {
    const facts = factsFor("C5", "C", log);
    expect(Array.isArray(facts.pricesPaidInTier)).toBe(true);
    for (const opponent of facts.opponents) {
      expect(Array.isArray(opponent.pricesPaidInTier)).toBe(true);
    }
  });

  it("per avversario, solo ciò che HA pagato lui", () => {
    const facts = factsFor("C5", "C", log, { selfId: "new_milf" });
    const psg = facts.opponents.find((o) => o.fantaTeamId === "psg")!;
    expect(psg.pricesPaidInTier).toEqual([61, 90]);
    const ataturk = facts.opponents.find((o) => o.fantaTeamId === "ataturk")!;
    expect(ataturk.pricesPaidInTier).toEqual([74]);
  });

  it("chi non ha pagato niente porta la lista vuota, e non la si confonde col «non lo so»", () => {
    const facts = factsFor("C5", "C", log);
    const nobody = facts.opponents.find((o) => o.fantaTeamId === "new_casatiello")!;
    expect(nobody.pricesPaidInTier).toEqual([]); // in fascia, nessun acquisto
    const outOfTier = factsFor("C5", "C", log, { book: null });
    expect(outOfTier.opponents[0]!.pricesPaidInTier).toBeNull(); // fascia ignota
  });

  it("le riconferme sono prezzi della stagione scorsa: fuori dal registro di serata", () => {
    const facts = factsFor("C5", "C", [], {
      confirmations: [{ fantaTeamId: "psg", playerId: "C1", role: "C", price: 55 }],
    });
    expect(facts.pricesPaidInTier).toEqual([]);
    // …ma la riconferma resta contata nella rosa e fra i presi della fascia.
    expect(facts.occupancy!.takenCount).toBe(1);
    expect(
      facts.opponents.find((o) => o.fantaTeamId === "psg")!.ownedAtTierOrBetter,
    ).toBe(1);
  });

  it("il registro del tavolo comprende sé stessi; `opponents` no", () => {
    const facts = factsFor("C5", "C", log, { selfId: "psg" });
    expect(facts.opponents.map((o) => o.fantaTeamId)).not.toContain("psg");
    expect(facts.opponents).toHaveLength(TEAMS.length - 1);
    expect(facts.pricesPaidInTier).toEqual([61, 74, 90]);
  });
});

// ─── Determinismo e coerenza strutturale ─────────────────────────────────────

describe("determinismo", () => {
  const log: AuctionEvent[] = [
    purchase(0, "C1", "C", "psg", 90),
    purchase(1, "C9", "C", "ataturk", 31),
  ];

  it("stesso stato → stessa uscita, byte per byte", () => {
    const a = JSON.stringify(factsFor("C5", "C", log));
    const b = JSON.stringify(factsFor("C5", "C", log));
    expect(a).toBe(b);
  });

  it("gli avversari escono in ordine di id crescente, sempre", () => {
    const ids = factsFor("C5", "C", log).opponents.map((o) => o.fantaTeamId);
    expect(ids).toEqual(ids.slice().sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
  });

  it("il CODICE del modulo non contiene sorgenti di non-determinismo", () => {
    // Si scansiona il codice, non i commenti: l'intestazione di tiers.ts NOMINA
    // per esteso ciò che evita (`localeCompare`, `Math.random`, …) e nominarlo
    // è metà del suo valore. Lo strippaggio è volutamente ingenuo — blocchi
    // `/* */` e righe `//` — e il modulo è scritto per restare compatibile con
    // esso: nessuna stringa e nessun regex literal vi contiene `//` o `/*`.
    const source = readFileSync(new URL("../src/tiers.ts", import.meta.url), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const forbidden of [
      "Math.random",
      "Intl.",
      "localeCompare",
      "toLocale",
      "performance.now",
      "process.env",
      "globalThis",
    ]) {
      expect({ forbidden, present: code.includes(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
    }
    // `new Date`, `Date.now`, `Date.parse`: nessun orologio, in nessuna forma.
    expect(/\bDate\b/.test(code)).toBe(false);
    // …e lo strippaggio deve aver lasciato in piedi il codice vero.
    expect(code.includes("export function tierFacts")).toBe(true);
  });
});

describe("coerenza strutturale", () => {
  it("un libro costruito per un numero di squadre diverso dal tavolo viene rifiutato", () => {
    const b = tierBook(syntheticAppealOrdering(), { teamsCount: 10 });
    expect(() =>
      tierFacts({ state: reduce([], TEAMS), log: [], playerId: "C1", role: "C", book: b }),
    ).toThrow(/tierSize mismatch/);
  });

  it("teamsCount non intero o < 1 viene rifiutato alla costruzione", () => {
    for (const teamsCount of [0, -1, 1.5, Number.NaN]) {
      expect(() => tierBook(syntheticAppealOrdering(), { teamsCount })).toThrow(
        /teamsCount must be an integer/,
      );
    }
  });

  it("un tavolo di dimensione diversa produce fasce di larghezza diversa, senza costanti cablate", () => {
    const teams = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const b = tierBook(syntheticAppealOrdering(), { teamsCount: teams.length });
    expect(b.byRole.get("C")!.tiers[0]).toEqual(idsOf("C", 1, 10));
    const facts = tierFacts({
      state: reduce([], teams),
      log: [],
      playerId: "C10",
      role: "C",
      book: b,
    });
    expect(facts.placement.tier).toBe(1);
    expect(facts.tierSize).toBe(10);
  });
});

// ─── La guardia: il motore non può produrre un consiglio ─────────────────────

describe("anti-scope-creep — il motore non può produrre un consiglio", () => {
  const log: AuctionEvent[] = [
    purchase(0, "C1", "C", "psg", 90),
    purchase(1, "C9", "C", "ataturk", 31),
  ];
  const facts = factsFor("C5", "C", log, { selfId: "new_milf" });

  /** Ogni chiave, a ogni profondità, del valore di ritorno. */
  function allKeys(value: unknown, acc: string[] = []): string[] {
    if (Array.isArray(value)) {
      for (const item of value) allKeys(item, acc);
    } else if (value !== null && typeof value === "object") {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        acc.push(key);
        allKeys((value as Record<string, unknown>)[key], acc);
      }
    }
    return acc;
  }

  it("nessun campo direttivo, a nessuna profondità", () => {
    // `price` NON è vietato qui, a differenza di budget.test.ts: i prezzi di
    // questo modulo sono quelli DAVVERO PAGATI, letti dall'event log. È il
    // prezzo PREDETTO a essere vietato, e infatti «expected/predicted/stima»
    // sono nella lista.
    const banned =
      /value|fair|target|stretch|alpha|expect|predict|forecast|probab|recommend|suggest|advice|consig|scor|rank|intensit|priorit|attes|stima|previs/i;
    const offenders = allKeys(facts).filter((key) => banned.test(key));
    expect(offenders).toEqual([]);
  });

  it("l'insieme delle chiavi di primo livello è chiuso", () => {
    expect(Object.keys(facts).sort()).toEqual(
      [
        "basis",
        "occupancy",
        "opponents",
        "placement",
        "playerId",
        "pricesPaidInTier",
        "provenance",
        "role",
        "tierCount",
        "tierSize",
      ].sort(),
    );
    expect(facts.basis).toBe("measured-facts");
  });

  it("l'insieme delle chiavi di ogni struttura annidata è chiuso", () => {
    expect(Object.keys(facts.placement).sort()).toEqual(
      ["kind", "position", "tier"].sort(),
    );
    expect(Object.keys(facts.provenance!).sort()).toEqual(
      ["recipe", "source", "tieBreak"].sort(),
    );
    expect(Object.keys(facts.occupancy!).sort()).toEqual(
      ["freeCount", "originalSize", "takenCount", "tier"].sort(),
    );
    // Il registro è una lista di numeri: nessuna chiave da chiudere, e
    // soprattutto nessuna coppia di estremi (vedi §"Il registro, non una banda").
    expect(facts.pricesPaidInTier!.every((p) => typeof p === "number")).toBe(true);
    for (const opponent of facts.opponents) {
      expect(Object.keys(opponent).sort()).toEqual(
        [
          "budgetResidual",
          "fantaTeamId",
          "maxBid",
          "ownedAtTierOrBetter",
          "ownedSameTier",
          "pricesPaidInTier",
          "slotsRemainingInRole",
        ].sort(),
      );
    }
  });

  it("non esiste un ordinamento degli avversari per «quanto lo vogliono»", () => {
    // L'unico ordine prodotto è quello degli id: nessuna classifica di
    // intensità, nessun punteggio su cui ordinare.
    const byId = facts.opponents.map((o) => o.fantaTeamId);
    expect(byId).toEqual(byId.slice().sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
    for (const opponent of facts.opponents) {
      const keys = Object.keys(opponent);
      expect(keys).not.toContain("interest");
      expect(keys).not.toContain("eligible");
      expect(keys).not.toContain("position");
    }
  });

  it("nessun booleano di primo livello che si legga come un via libera", () => {
    // L'unico booleano dell'intera struttura è `maxBid.biddable`, che è di
    // `maxSafe()` e significa «può fare un'offerta valida», non «offri».
    const booleans = Object.entries(facts).filter(([, v]) => typeof v === "boolean");
    expect(booleans).toEqual([]);
  });
});

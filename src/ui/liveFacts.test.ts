import { describe, it, expect } from "vitest";
import {
  MOMENT_FACTS_NOTE,
  OPPONENT_REACH_NOTE,
  OPPONENT_REACH_NO_ROLE,
  OPPONENT_REACH_TITLE,
  competitorBlockerDetail,
  competitorBlockerLabel,
  competitorReachHeadline,
  competitorReachHtml,
  formatDecimal1,
  formatSignedPercent,
  marketPressureHtml,
  momentScarcityHtml,
} from "./liveFacts.js";
import { competitorSet } from "../../packages/engine/src/competitors.js";
import { residualPressure } from "../../packages/engine/src/anchors.js";
import { roleScarcity } from "../../packages/engine/src/auction.js";
import type { AuctionState, PoolPlayer, Role, TeamState } from "../../packages/engine/src/types.js";
import { INITIAL_BUDGET, ROSTER_REQUIREMENTS, TOTAL_SLOTS } from "../../packages/engine/src/types.js";

// Synthetic fixtures only — no real player, club or quotation anywhere (same
// rule as src/ui/warBoard.test.ts and e2e/fixtures/).

// Every directive family that must never reach this surface: the blocks built
// here are measured facts, and a regression that let one of these words in
// would be a product violation, not a cosmetic one.
const DIRECTIVE = /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|consigl|dovresti|spingi/i;

function team(overrides: Partial<TeamState> = {}): TeamState {
  const slotsRemaining = overrides.slotsRemaining ?? { ...ROSTER_REQUIREMENTS };
  const totalSlotsRemaining =
    overrides.totalSlotsRemaining ??
    slotsRemaining.P + slotsRemaining.D + slotsRemaining.C + slotsRemaining.A;
  return {
    fantaTeamId: "Squadra2",
    spent: 0,
    budgetResidual: INITIAL_BUDGET,
    filled: { P: 0, D: 0, C: 0, A: 0 },
    roster: [],
    ...overrides,
    slotsRemaining,
    totalSlotsRemaining,
  };
}

function stateOf(teams: readonly TeamState[]): AuctionState {
  return {
    teams: Object.fromEntries(teams.map((t) => [t.fantaTeamId, t])),
    purchasedPlayerIds: [],
    lastSeq: 0,
  };
}

/** Eight untouched teams — the state at the very first call. */
function freshState(): AuctionState {
  return stateOf(
    ["Io", "Squadra2", "Squadra3", "Squadra4", "Squadra5", "Squadra6", "Squadra7", "Squadra8"].map(
      (fantaTeamId) => team({ fantaTeamId }),
    ),
  );
}

const LABELS: Record<string, string> = {
  Io: "Io",
  Squadra2: "Bea",
  Squadra3: "Cor",
  Squadra4: "Squadra4",
  Squadra5: "Squadra5",
  Squadra6: "Squadra6",
  Squadra7: "Squadra7",
  Squadra8: "Squadra8",
};

// ── Formatting: deterministic and locale-free ───────────────────────────────

describe("formatDecimal1", () => {
  it("uses the Italian decimal comma without any Intl/locale dependency", () => {
    expect(formatDecimal1(17.857142857142858)).toBe("17,9");
    expect(formatDecimal1(16.018181818181816)).toBe("16,0");
    expect(formatDecimal1(0)).toBe("0,0");
  });

  it("never prints a negative zero", () => {
    expect(formatDecimal1(-0.01)).toBe("0,0");
    expect(formatDecimal1(-0)).toBe("0,0");
  });

  it("declares a non-finite figure as n/d instead of NaN", () => {
    expect(formatDecimal1(Number.NaN)).toBe("n/d");
    expect(formatDecimal1(Number.POSITIVE_INFINITY)).toBe("n/d");
  });
});

describe("formatSignedPercent", () => {
  it("carries the direction in the text, not only in a colour", () => {
    expect(formatSignedPercent(0.0812)).toBe("+8%");
    expect(formatSignedPercent(-0.103)).toBe("−10%");
  });

  it("prints an exact zero unsigned, never -0%", () => {
    expect(formatSignedPercent(0)).toBe("0%");
    expect(formatSignedPercent(-0.0004)).toBe("0%");
  });

  it("declares a non-finite ratio as n/d", () => {
    expect(formatSignedPercent(Number.NaN)).toBe("n/d");
  });
});

// ── MOMENTO DELL'ASTA — scarsità ───────────────────────────────────────────

describe("momentScarcityHtml", () => {
  const pool: readonly PoolPlayer[] = [
    { playerId: "p1", role: "P", name: "Alfa Sintetico" },
    { playerId: "p2", role: "P", name: "Beta Sintetico" },
    { playerId: "d1", role: "D", name: "Gamma Sintetico" },
  ];

  it("shows both numbers for every role, with their separate provenance", () => {
    const html = momentScarcityHtml(roleScarcity(freshState(), pool), true, "P");
    // 8 teams x 3 P slots = 24 free P slots, from the event log alone.
    expect(html).toContain(`id="moment-scarcity-slots-P">24<`);
    // Row count of the loaded listone — a different number, different source.
    expect(html).toContain(`id="moment-scarcity-pool-P">2<`);
    expect(html).toContain(`id="moment-scarcity-slots-A">56<`);
    expect(html).toContain(`id="moment-scarcity-pool-A">0<`);
    for (const role of ["P", "D", "C", "A"]) {
      expect(html).toContain(`id="moment-scarcity-${role}"`);
    }
  });

  it("shows n/d, never 0, when no listone is loaded", () => {
    const html = momentScarcityHtml(roleScarcity(freshState(), []), false, "D");
    expect(html).toContain(`id="moment-scarcity-pool-D">n/d<`);
    expect(html).toContain(`id="moment-scarcity-slots-D">72<`);
  });

  it("marks the called role in words as well as by class", () => {
    const html = momentScarcityHtml(roleScarcity(freshState(), pool), true, "C");
    expect(html).toContain(`id="moment-scarcity-C"`);
    expect(html).toMatch(/moment-scarcity__cell--called[\s\S]*?id="moment-scarcity-C"/);
    expect(html).toContain("in asta");
    expect(html.match(/moment-scarcity__cell--called/g)).toHaveLength(1);
  });

  it("marks nothing when the moment carries no role", () => {
    const html = momentScarcityHtml(roleScarcity(freshState(), pool), true, "");
    expect(html).not.toContain("moment-scarcity__cell--called");
    // Every role cell is still there: no role selected is not a reason to
    // show less.
    for (const role of ["P", "D", "C", "A"]) {
      expect(html).toContain(`id="moment-scarcity-${role}"`);
    }
  });

  it("counts a role whose slots are all filled as 0 free slots", () => {
    const exhausted = stateOf([
      team({ fantaTeamId: "Io", slotsRemaining: { P: 0, D: 9, C: 9, A: 7 } }),
      team({ fantaTeamId: "Squadra2", slotsRemaining: { P: 0, D: 9, C: 9, A: 7 } }),
    ]);
    const html = momentScarcityHtml(roleScarcity(exhausted, pool), true, "P");
    expect(html).toContain(`id="moment-scarcity-slots-P">0<`);
  });
});

// ── MOMENTO DELL'ASTA — mercato ────────────────────────────────────────────

describe("marketPressureHtml", () => {
  it("reads exactly at the starting endowment when nothing has been bought", () => {
    const html = marketPressureHtml(residualPressure(freshState()));
    expect(html).toContain(`id="moment-market-credits">4000<`);
    expect(html).toContain(`id="moment-market-slots">224<`);
    expect(html).toContain(`id="moment-market-per-slot">17,9 cr<`);
    expect(html).toContain(`>0%<`);
    expect(html).toContain("moment-market__delta--flat");
    expect(html).toContain("Censimento su 8 squadre");
  });

  it("shows the drop when the table has paid over its per-slot endowment", () => {
    const spent = stateOf([
      team({
        fantaTeamId: "Io",
        spent: 476,
        budgetResidual: 24,
        slotsRemaining: { P: 3, D: 9, C: 9, A: 3 },
      }),
      team({ fantaTeamId: "Squadra2" }),
    ]);
    const pressure = residualPressure(spent);
    expect(pressure.creditsRemaining).toBe(524);
    expect(pressure.slotsRemaining).toBe(24 + TOTAL_SLOTS);
    const html = marketPressureHtml(pressure);
    expect(html).toContain("moment-market__delta--down");
    expect(html).toMatch(/id="moment-market-delta"[^>]*>−\d+%</);
  });

  it("shows the rise when credits outnumber the slots left", () => {
    const loose = stateOf([
      team({ fantaTeamId: "Io", slotsRemaining: { P: 0, D: 0, C: 0, A: 1 } }),
      team({ fantaTeamId: "Squadra2", slotsRemaining: { P: 0, D: 0, C: 0, A: 1 } }),
    ]);
    const html = marketPressureHtml(residualPressure(loose));
    expect(html).toContain("moment-market__delta--up");
    expect(html).toMatch(/id="moment-market-delta"[^>]*>\+\d+%</);
  });

  it("declares n/d with its reason when no slot is left, never a 0", () => {
    const done = stateOf([
      team({ fantaTeamId: "Io", slotsRemaining: { P: 0, D: 0, C: 0, A: 0 } }),
      team({ fantaTeamId: "Squadra2", slotsRemaining: { P: 0, D: 0, C: 0, A: 0 } }),
    ]);
    const pressure = residualPressure(done);
    expect(pressure.reason).toBe("no-remaining-slots");
    const html = marketPressureHtml(pressure);
    expect(html).toContain(`id="moment-market-per-slot">n/d<`);
    expect(html).toContain(`id="moment-market-slots">0<`);
    expect(html).toContain("moment-market__delta--none");
    expect(html).toContain("non ha denominatore");
  });

  it("carries the declared baseline next to the delta", () => {
    const html = marketPressureHtml(residualPressure(freshState()));
    // 500 / 28 — a league rule constant, not a weight chosen by the system.
    expect(html).toContain("vs partenza (17,9)");
  });
});

// ── AVVERSARI — chi può arrivare alla cifra ────────────────────────────────

describe("competitorBlockerLabel / competitorBlockerDetail", () => {
  it("names each hard constraint separately, never one for another", () => {
    expect(competitorBlockerLabel("role-full")).toBe("ruolo pieno");
    expect(competitorBlockerLabel("budget-locked")).toBe("budget bloccato");
    expect(competitorBlockerLabel("below-threshold")).toBe("sotto la soglia");
    expect(competitorBlockerDetail("role-full")).toContain("non le serve");
    expect(competitorBlockerDetail("budget-locked")).toContain("riserva dura");
    expect(competitorBlockerDetail("below-threshold")).toContain("max bid sicuro");
  });
});

describe("competitorReachHeadline", () => {
  it("counts rivals against the typed figure", () => {
    const set = competitorSet(freshState(), "P", 30, "Io");
    expect(competitorReachHeadline(set, "price")).toBe("7 rivali su 7 possono arrivare a 30 cr");
  });

  it("declares the fallback threshold instead of pretending a price was said", () => {
    const set = competitorSet(freshState(), "P", 1, "Io");
    expect(competitorReachHeadline(set, "floor")).toContain("al rilancio minimo (1 cr)");
    expect(competitorReachHeadline(set, "floor")).toContain("nessun prezzo ancora inserito");
  });

  it("reports the threshold actually applied, rounded up as the engine rounds it", () => {
    // competitorSet ceils the threshold: you cannot beat 32,4 with 32.
    const set = competitorSet(freshState(), "P", 32.4, "Io");
    expect(competitorReachHeadline(set, "price")).toContain("a 33 cr");
  });
});

describe("competitorReachHtml", () => {
  it("lists every rival with max bid and free slots, in the engine's order", () => {
    const html = competitorReachHtml(competitorSet(freshState(), "P", 30, "Io"), LABELS);
    // maxSafe for an untouched team = 500 − 27 = 473.
    expect(html).toContain(`id="opponent-reach-Squadra2"`);
    expect(html).toContain("<em>max</em>473");
    expect(html).toContain("<em>slot</em>3");
    // Self is never among the rivals.
    expect(html).not.toContain(`id="opponent-reach-Io"`);
    expect(html).toContain("PUÒ ARRIVARE A 30 CR");
    // The display label wins over the seat id.
    expect(html).toContain(">Bea<");
  });

  it("keeps both groups present even when one of them is empty", () => {
    const html = competitorReachHtml(competitorSet(freshState(), "P", 30, "Io"), LABELS);
    expect(html).toContain(`id="opponent-reach-eligible"`);
    expect(html).toContain(`id="opponent-reach-excluded"`);
    expect(html).toContain("Nessun rivale è fuori: tutti possono arrivarci.");
  });

  it("separates the three exclusion reasons instead of collapsing them", () => {
    const mixed = stateOf([
      team({ fantaTeamId: "Io" }),
      // role-full: no P slot left at all.
      team({ fantaTeamId: "Squadra2", slotsRemaining: { P: 0, D: 9, C: 9, A: 7 }, budgetResidual: 400 }),
      // below-threshold: can still bid, but not that high.
      team({ fantaTeamId: "Squadra3", budgetResidual: 40 }),
      // budget-locked: residual below the hard reserve of the other slots.
      team({ fantaTeamId: "Squadra4", budgetResidual: 3 }),
      // eligible.
      team({ fantaTeamId: "Squadra5" }),
    ]);
    const set = competitorSet(mixed, "P", 30, "Io");
    expect(set.eligibleCount).toBe(1);
    const html = competitorReachHtml(set, LABELS);
    expect(html).toMatch(/id="opponent-reach-Squadra2"[\s\S]*?ruolo pieno/);
    expect(html).toMatch(/id="opponent-reach-Squadra3"[\s\S]*?sotto la soglia/);
    expect(html).toMatch(/id="opponent-reach-Squadra4"[\s\S]*?budget bloccato/);
    expect(html).toMatch(/id="opponent-reach-Squadra5"[\s\S]*?opponent-reach__bid/);
    // A locked team's ceiling is reported as 0, never as a sub-floor figure
    // dressed up as a bid.
    expect(html).toMatch(/id="opponent-reach-Squadra4"[\s\S]*?<em>max<\/em>0/);
  });

  it("says so in words when nobody else can reach the figure", () => {
    const broke = stateOf([
      team({ fantaTeamId: "Io" }),
      team({ fantaTeamId: "Squadra2", budgetResidual: 40 }),
    ]);
    const set = competitorSet(broke, "P", 200, "Io");
    expect(set.eligibleCount).toBe(0);
    const html = competitorReachHtml(set, LABELS);
    expect(html).toContain("Nessun rivale può arrivare a questa cifra.");
    // The excluded rival is still listed with its numbers: "nobody can" is
    // not a reason to stop showing who was checked.
    expect(html).toContain(`id="opponent-reach-Squadra2"`);
  });

  it("escapes a display label instead of letting it reach the DOM as markup", () => {
    const set = competitorSet(freshState(), "P", 5, "Io");
    const html = competitorReachHtml(set, { ...LABELS, Squadra2: `<img src=x onerror="boom">` });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("orders rivals by max bid descending, then by id — same list every time", () => {
    const uneven = stateOf([
      team({ fantaTeamId: "Io" }),
      team({ fantaTeamId: "Squadra2", budgetResidual: 100 }),
      team({ fantaTeamId: "Squadra3", budgetResidual: 300 }),
      team({ fantaTeamId: "Squadra4", budgetResidual: 200 }),
    ]);
    const html = competitorReachHtml(competitorSet(uneven, "P", 10, "Io"), LABELS);
    const order = [...html.matchAll(/id="opponent-reach-(Squadra\d)"/g)].map((m) => m[1]);
    expect(order).toEqual(["Squadra3", "Squadra4", "Squadra2"]);
  });
});

// ── The product boundary these blocks must never cross ─────────────────────

describe("no directive output reaches the live blocks", () => {
  const role: Role = "A";

  it("keeps every rendered string inside measured facts", () => {
    const pool: readonly PoolPlayer[] = [{ playerId: "a1", role, name: "Delta Sintetico" }];
    const html =
      momentScarcityHtml(roleScarcity(freshState(), pool), true, role) +
      marketPressureHtml(residualPressure(freshState())) +
      competitorReachHtml(competitorSet(freshState(), role, 30, "Io"), LABELS) +
      competitorReachHeadline(competitorSet(freshState(), role, 30, "Io"), "price") +
      MOMENT_FACTS_NOTE +
      OPPONENT_REACH_NOTE +
      OPPONENT_REACH_NO_ROLE;
    expect(html).not.toMatch(DIRECTIVE);
  });

  it("states the basis of the opponent block, so no reader can take it for intent", () => {
    expect(OPPONENT_REACH_NOTE).toContain("Solo vincolo duro");
    expect(OPPONENT_REACH_NOTE).toContain("non significa «lo vuole»");
    expect(OPPONENT_REACH_NOTE).toContain("nessun indice comportamentale");
  });

  it("titles the opponent block by what it measures, never by an intent", () => {
    // Il titolo ereditato dal segnaposto affermava un interesse che
    // `competitorSet` non calcola (`basis: "hard-constraints"`) e che §D9
    // vieta di inferire. Deve dire raggiungibilità, e col verbo modale: «chi
    // arriva» sarebbe una previsione, «chi PUÒ arrivare» è aritmetica.
    expect(OPPONENT_REACH_TITLE).toBe("AVVERSARI: CHI PUÒ ARRIVARCI");
    expect(OPPONENT_REACH_TITLE).not.toMatch(/interess/i);
    expect(OPPONENT_REACH_TITLE).toMatch(/PUÒ/);
    // Il soggetto resta quello: a essere sbagliato era il predicato.
    expect(OPPONENT_REACH_TITLE).toMatch(/^AVVERSARI/);
    // Più corto della stringa che sostituisce: non può traboccare dove quella
    // non traboccava, a nessuna delle tre larghezze.
    expect(OPPONENT_REACH_TITLE.length).toBeLessThan("AVVERSARI — INTERESSE SUL GIOCATORE".length);
    // Stessa parola delle intestazioni dei due gruppi: una frase sola.
    const html = competitorReachHtml(competitorSet(freshState(), "P", 30, "Io"), LABELS);
    expect(html).toContain("PUÒ ARRIVARE A 30 CR");
    expect(html).toContain("NON PUÒ ARRIVARCI");
  });

  it("states the two provenances of the moment block", () => {
    expect(MOMENT_FACTS_NOTE).toContain("derivata dal log dell'asta");
    expect(MOMENT_FACTS_NOTE).toContain("listone caricato");
    expect(MOMENT_FACTS_NOTE).toContain("nessun dato di modello");
  });

  it("explains, rather than hides, the block with no role", () => {
    expect(OPPONENT_REACH_NO_ROLE).toContain("senza ruolo");
  });
});

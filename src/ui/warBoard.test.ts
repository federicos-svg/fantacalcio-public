import { describe, it, expect } from "vitest";
import {
  WAR_BOARD_ACQUISITIONS_SHOWN,
  WAR_BOARD_FULL_NOTE,
  WAR_BOARD_MINI_NOTE,
  warBoardAcquisitionsShown,
  warBoardBidDisplay,
  warBoardFullHtml,
  warBoardMiniHtml,
} from "./warBoard.js";
import type { WarBoardRow } from "../../packages/engine/src/auction.js";
import type { Role, RosterEntry } from "../../packages/engine/src/types.js";
import { listonePlayerKey, listonePoolIndex, type ListonePlayer } from "./listone.js";

// Synthetic fixtures only — no real player/club name anywhere, per project
// no-go (same rule as src/ui/listone.test.ts and e2e/fixtures/).

const EMPTY_INDEX = listonePoolIndex([]);

function entry(playerId: string, role: Role, price: number, seq: number): RosterEntry {
  return { playerId, role, price, seq };
}

function row(overrides: Partial<WarBoardRow> = {}): WarBoardRow {
  return {
    fantaTeamId: "Squadra2",
    isSelf: false,
    budgetResidual: 440,
    maxBid: { biddable: true, maxSafe: 414, hardReserve: 26 },
    slotsRemaining: { P: 3, D: 9, C: 9, A: 6 },
    totalSlotsRemaining: 27,
    acquisitions: [],
    ...overrides,
  };
}

describe("warBoardBidDisplay", () => {
  it("shows a biddable ceiling as its credit figure", () => {
    const display = warBoardBidDisplay({ biddable: true, maxSafe: 414, hardReserve: 26 });
    expect(display.value).toBe("414");
    expect(display.note).toBe("");
    expect(display.stateClass).toBe("war-board-bid--open");
    expect(display.spoken).toContain("414");
  });

  it("never prints a sub-floor figure as if it were a ceiling", () => {
    // maxSafe() reports `maxSafe: Math.max(0, ms)` when the team is locked —
    // a number BELOW the cost floor. Showing it would read as "can bid that
    // much", which is false: the team cannot bid at all.
    const display = warBoardBidDisplay({
      biddable: false,
      maxSafe: 0,
      hardReserve: 27,
      reason: "budget-locked",
    });
    expect(display.value).toBe("—");
    expect(display.note).toBe("budget bloccato");
    expect(display.stateClass).toBe("war-board-bid--locked");
  });

  it("reports a complete roster as its own state, not as a failure", () => {
    const display = warBoardBidDisplay({
      biddable: false,
      maxSafe: 0,
      hardReserve: 0,
      reason: "role-full",
    });
    expect(display.value).toBe("—");
    expect(display.note).toBe("rosa completa");
    expect(display.stateClass).toBe("war-board-bid--done");
    expect(display.spoken).toContain("rosa completa");
  });

  it("gives every state a note in words, never colour alone", () => {
    const states = [
      warBoardBidDisplay({ biddable: false, maxSafe: 0, hardReserve: 1, reason: "budget-locked" }),
      warBoardBidDisplay({ biddable: false, maxSafe: 0, hardReserve: 0, reason: "role-full" }),
    ];
    for (const state of states) {
      expect(state.note).not.toBe("");
      expect(state.spoken).not.toBe("");
    }
  });
});

describe("warBoardAcquisitionsShown", () => {
  it("keeps the head of the (already most-recent-first) list and counts the rest", () => {
    const acquisitions = [
      entry("e", "A", 60, 4),
      entry("d", "C", 30, 3),
      entry("c", "D", 12, 2),
      entry("b", "D", 8, 1),
      entry("a", "P", 5, 0),
    ];
    const { shown, hidden } = warBoardAcquisitionsShown(row({ acquisitions }));
    expect(shown).toHaveLength(WAR_BOARD_ACQUISITIONS_SHOWN);
    expect(shown.map((e) => e.playerId)).toEqual(["e", "d", "c"]);
    expect(hidden).toBe(2);
  });

  it("hides nothing when the team has fewer acquisitions than the window", () => {
    const { shown, hidden } = warBoardAcquisitionsShown(
      row({ acquisitions: [entry("a", "P", 5, 0)] }),
    );
    expect(shown.map((e) => e.playerId)).toEqual(["a"]);
    expect(hidden).toBe(0);
  });

  it("reports an untouched roster as empty, never as a negative remainder", () => {
    const { shown, hidden } = warBoardAcquisitionsShown(row({ acquisitions: [] }));
    expect(shown).toEqual([]);
    expect(hidden).toBe(0);
  });
});

describe("warBoardMiniHtml", () => {
  const rows = [
    row({ fantaTeamId: "Io", isSelf: true, budgetResidual: 500 }),
    row({ fantaTeamId: "Squadra2" }),
  ];
  const labels = { Io: "Io", Squadra2: "Nome Due" };

  it("renders one identified item per team, self included", () => {
    const html = warBoardMiniHtml(rows, labels);
    expect(html).toContain('id="war-board-mini-Io"');
    expect(html).toContain('id="war-board-mini-Squadra2"');
    expect(html).toContain("war-board-mini__item--self");
    expect(html).toContain("Nome Due");
  });

  it("carries budget and max bid, and nothing else, per team", () => {
    const html = warBoardMiniHtml([rows[1]!], labels);
    expect(html).toContain("440");
    expect(html).toContain("414");
    // The compact variant must stay two numbers: no slots, no acquisitions.
    // That compactness is the reason it is admitted on the live auction
    // screen at all (docs/FRONTEND_STRUCTURE.md, revisione invariante #86).
    expect(html).not.toContain("war-board__slot");
    expect(html).not.toContain("war-board__acq");
  });

  it("gives every item a spoken label, since the visible form is abbreviated", () => {
    const html = warBoardMiniHtml([rows[0]!], labels);
    expect(html).toContain('aria-label="Io (io): budget residuo 500 crediti, max bid 414 crediti"');
  });

  it("falls back to the team id when no display label is configured", () => {
    const html = warBoardMiniHtml([row({ fantaTeamId: "Squadra7" })], {});
    expect(html).toContain("Squadra7");
  });

  it("escapes team labels instead of interpolating them as markup", () => {
    const html = warBoardMiniHtml([row({ fantaTeamId: "Squadra2" })], {
      Squadra2: '<img src=x onerror="boom">',
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("warBoardFullHtml", () => {
  const pool: readonly ListonePlayer[] = [
    { name: "Dario Placeholder", role: "A", club: "ClubQuattro", quotation: 20 },
    { name: "Aldo Prova", role: "P", club: "ClubUno", quotation: 5 },
  ];
  const index = listonePoolIndex(pool);
  const labels = { Io: "Io", Squadra2: "Nome Due" };

  it("renders budget, max bid and free slots per role for every team", () => {
    const html = warBoardFullHtml([row()], labels, EMPTY_INDEX);
    expect(html).toContain('id="war-board-full-Squadra2"');
    expect(html).toContain("440 cr");
    expect(html).toContain("414 cr");
    expect(html).toContain("war-board__slot");
    // Every role is listed, including the ones already full.
    expect(html).toContain('aria-label="Slot residui per ruolo: P 3, D 9, C 9, A 6"');
  });

  it("resolves acquisition names through the pool index and shows the price paid", () => {
    // The log stores a listonePlayerKey, not a display name — the board must
    // resolve it back through the index the caller built, exactly like Rose.
    const html = warBoardFullHtml(
      [row({ acquisitions: [entry(listonePlayerKey(pool[0]!), "A", 60, 1)] })],
      labels,
      index,
    );
    expect(html).toContain("Dario Placeholder");
    expect(html).toContain("60");
  });

  it("marks a riconferma pre-asta with the same badge the Rose card uses", () => {
    const live = warBoardFullHtml([row({ acquisitions: [entry("x", "A", 60, 1)] })], labels, EMPTY_INDEX);
    const confirmed = warBoardFullHtml(
      [row({ acquisitions: [entry("x", "A", 60, -1)] })],
      labels,
      EMPTY_INDEX,
    );
    expect(live).not.toContain("roster-badge-confirmed");
    expect(confirmed).toContain("roster-badge-confirmed");
    expect(confirmed).toContain('aria-label="Riconfermato"');
  });

  it("truncates the acquisition list and says how many are not shown", () => {
    const acquisitions = [
      entry("e", "A", 60, 4),
      entry("d", "C", 30, 3),
      entry("c", "D", 12, 2),
      entry("b", "D", 8, 1),
    ];
    const html = warBoardFullHtml([row({ acquisitions })], labels, EMPTY_INDEX);
    expect(html).toContain("+1 precedenti");
  });

  it("states an untouched roster instead of rendering an empty list", () => {
    const html = warBoardFullHtml([row()], labels, EMPTY_INDEX);
    expect(html).toContain("nessun acquisto");
    expect(html).not.toContain("war-board__acq-list");
  });

  it("tags the self row without filtering it out", () => {
    const html = warBoardFullHtml(
      [row({ fantaTeamId: "Io", isSelf: true }), row()],
      labels,
      EMPTY_INDEX,
    );
    expect(html).toContain("war-board__card--self");
    expect(html).toContain('id="war-board-full-Io"');
    expect(html).toContain('id="war-board-full-Squadra2"');
  });
});

describe("§D9 — the war board carries accounting only", () => {
  // No directive output before the gate that validates it (docs/NO_GO.md,
  // docs/DECISIONS.md §D9): not a value, not a fair-to-me, not a target band,
  // not a behavioural score, and no wording that suggests an action.
  const DIRECTIVE = /valore|value|fair.?to.?me|target.?band|stretch|prendilo|mollalo|consigli|suggeri|tension|occasion|esca|interesse|indice/i;

  const rows = [
    row({ fantaTeamId: "Io", isSelf: true, budgetResidual: 500 }),
    row({
      fantaTeamId: "Squadra2",
      acquisitions: [entry("x", "A", 60, 1), entry("y", "C", 30, 0)],
    }),
    row({
      fantaTeamId: "Squadra3",
      maxBid: { biddable: false, maxSafe: 0, hardReserve: 27, reason: "budget-locked" },
    }),
  ];
  const labels = { Io: "Io", Squadra2: "Nome Due", Squadra3: "Nome Tre" };

  it("emits no directive field in either variant", () => {
    expect(warBoardMiniHtml(rows, labels)).not.toMatch(DIRECTIVE);
    expect(warBoardFullHtml(rows, labels, EMPTY_INDEX)).not.toMatch(DIRECTIVE);
  });

  it("says in words that it is accounting and nothing more", () => {
    expect(WAR_BOARD_MINI_NOTE).toContain("nessun suggerimento");
    expect(WAR_BOARD_FULL_NOTE).toContain("nessuna raccomandazione");
    expect(WAR_BOARD_FULL_NOTE).toContain("nessun indice comportamentale");
  });

  it("never repeats the STORICO ACQUISTI panel title in its notes", () => {
    // Several e2e specs locate that panel with a case-insensitive `hasText`;
    // a nested repetition makes the locator ambiguous (strict-mode failure).
    expect(WAR_BOARD_MINI_NOTE.toLowerCase()).not.toContain("storico acquisti");
    expect(WAR_BOARD_FULL_NOTE.toLowerCase()).not.toContain("storico acquisti");
  });
});

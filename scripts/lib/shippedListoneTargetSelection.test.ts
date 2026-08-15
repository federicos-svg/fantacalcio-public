// Committed, CI-run coverage for `findUniqueRoleATarget`
// (e2e/shipped-listone.ts) — specifically the part a green Playwright run on
// the public 6-row fixture can never exercise, because none of that
// fixture's 6 names collide by substring: the OLD (exact-name-only) selector
// and the NEW (exact-name + search-safe) selector agree on that fixture, so
// CI staying green there proves non-regression, never proves the fix.
//
// Lives here, not under e2e/, on purpose: vitest.config.ts excludes
// `e2e/**` wholesale (Playwright owns that directory), so a test file placed
// there would silently never run — passing coverage that isn't coverage.
// `npm test` (vitest run, part of `npm run verify`) already scans
// `scripts/lib/**` (see the sibling *.test.ts files here), so this is where
// the assertion actually executes on every push.
//
// Synthetic data only, nowhere a real player name — same "Bianchi" /
// "Bianchi Junior" worked example already used in e2e/shipped-listone.ts's
// own comments and in this PR's manual proof.
import { describe, expect, it } from "vitest";
import { findUniqueRoleATarget } from "../../e2e/shipped-listone.js";
import { filterListonePool, type ListonePlayer } from "../../src/ui/listone.js";

const row = (name: string, role: ListonePlayer["role"], club: string): ListonePlayer => ({
  name,
  role,
  club,
  quotation: 10,
});

describe("findUniqueRoleATarget — substring-safety (e2e/shipped-listone.ts)", () => {
  it("discards a role-A candidate whose exact-unique name collides by substring, and picks the next safe one", () => {
    // "Sintetico Bianchi" is the FIRST role-A row with an exact-unique name —
    // exactly what the OLD selector (`pool.find(p => p.role === "A" &&
    // nameCounts.get(p.name) === 1)`, the line this fix replaced) would have
    // picked. But it is a prefix of "Sintetico Bianchi Junior"'s name, so
    // typing it into #search-player (filterListonePool, substring match)
    // would leave TWO rows on screen, not one.
    const pool: readonly ListonePlayer[] = [
      row("Sintetico Rossi", "P", "SintClub01"),
      row("Sintetico Verdi", "D", "SintClub02"),
      row("Sintetico Bianchi", "A", "SintClub03"),
      row("Sintetico Bianchi Junior", "C", "SintClub04"),
      row("Sintetico Neri", "A", "SintClub05"),
    ];

    // Confirms the collision with the REAL filter (not a re-implementation
    // of its substring rule) before asserting on the selection that depends
    // on it — the same function `#search-player` and `selectListoneRowByName`
    // (e2e/helpers.ts) actually run at runtime.
    const ambiguousMatches = filterListonePool(
      pool,
      { text: "Sintetico Bianchi", role: "", club: "", status: "all" },
      new Set(),
    );
    expect(ambiguousMatches.map((p) => p.name)).toEqual(["Sintetico Bianchi", "Sintetico Bianchi Junior"]);

    const safeMatches = filterListonePool(
      pool,
      { text: "Sintetico Neri", role: "", club: "", status: "all" },
      new Set(),
    );
    expect(safeMatches).toHaveLength(1);

    // The assertion that matters: the ambiguous candidate is discarded, the
    // next exact-unique AND search-safe candidate is chosen instead.
    expect(findUniqueRoleATarget(pool).name).toBe("Sintetico Neri");
  });

  it("throws distinguishing 'no exact-unique role A at all' from 'candidates exist but none is search-safe'", () => {
    const noRoleAPool: readonly ListonePlayer[] = [
      row("Sintetico Rossi", "P", "SintClub01"),
      row("Sintetico Verdi", "D", "SintClub02"),
      row("Sintetico Blu", "C", "SintClub03"),
    ];
    expect(() => findUniqueRoleATarget(noRoleAPool)).toThrow(/nessuna riga di ruolo "A" con nome unico/);
    // The OTHER message must NOT fire for this pool — the two are mutually exclusive.
    expect(() => findUniqueRoleATarget(noRoleAPool)).not.toThrow(/NESSUNA sopravvive/);

    // Two role-A rows, each exact-unique, each a substring collision with a
    // THIRD row — so no candidate is ever search-safe. The dead end this
    // fix's throw exists to name explicitly instead of silently picking an
    // unsafe fallback.
    const deadEndPool: readonly ListonePlayer[] = [
      row("Sintetico Alfa", "A", "SintClub01"),
      row("Sintetico Alfa Beta", "C", "SintClub02"),
      row("Sintetico Gamma", "A", "SintClub03"),
      row("Sintetico Gamma Delta", "P", "SintClub04"),
    ];
    expect(() => findUniqueRoleATarget(deadEndPool)).toThrow(/NESSUNA sopravvive/);
    expect(() => findUniqueRoleATarget(deadEndPool)).not.toThrow(/nessuna riga di ruolo "A" con nome unico/);
  });
});

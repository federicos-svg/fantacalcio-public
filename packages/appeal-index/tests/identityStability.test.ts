import { describe, it, expect } from "vitest";
import { analyzeIdentityKeyStability, type SeasonRosterEntry } from "../src/identityStability.js";
import { buildUnstableIdentitySeasons, rosterEntriesFromSeasonRecords } from "../fixtures/syntheticSeasons.js";

function stableRoster(n: number): SeasonRosterEntry[] {
  const out: SeasonRosterEntry[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ season: "2020_21", externalId: 1000 + i, name: `Synthetic Player ${i}`, role: "C" });
    out.push({ season: "2021_22", externalId: 1000 + i, name: `Synthetic Player ${i}`, role: "C" });
  }
  return out;
}

describe("analyzeIdentityKeyStability", () => {
  it("declares 'stable' when external_id maps 1:1 to the same name across seasons", () => {
    const report = analyzeIdentityKeyStability(stableRoster(15));
    expect(report.verdict).toBe("stable");
    expect(report.recommendedJoinKey).toBe("external_id");
    expect(report.stableMatchRate).toBe(1);
    expect(report.collisionRate).toBe(0);
    expect(report.driftRate).toBe(0);
  });

  it("declares 'insufficient_data' below the minimum comparable-case threshold", () => {
    const report = analyzeIdentityKeyStability(stableRoster(2));
    expect(report.verdict).toBe("insufficient_data");
    expect(report.recommendedJoinKey).toBe("normalized_name_role");
  });

  it("detects a within-season externalId collision (different names, same season)", () => {
    const roster: SeasonRosterEntry[] = [
      ...stableRoster(12),
      { season: "2020_21", externalId: 9999, name: "Player One", role: "A" },
      { season: "2020_21", externalId: 9999, name: "Player Two", role: "A" },
    ];
    const report = analyzeIdentityKeyStability(roster);
    expect(report.withinSeasonCollisions).toBe(1);
    expect(report.notes.some((n) => n.includes("within-season"))).toBe(true);
  });

  it("declares 'unstable' on the synthetic collision+drift fixture and recommends the name/role fallback", () => {
    const unstable = buildUnstableIdentitySeasons();
    const roster = rosterEntriesFromSeasonRecords(unstable);
    const report = analyzeIdentityKeyStability(roster);
    expect(report.verdict).toBe("unstable");
    expect(report.recommendedJoinKey).toBe("normalized_name_role");
    expect(report.collisionRate).toBeGreaterThan(0);
    expect(report.driftRate).toBeGreaterThan(0);
    expect(report.notes.some((n) => n.includes("R1"))).toBe(true);
  });

  it("pairwise diagnostics cover every consecutive season pair", () => {
    const roster = stableRoster(15);
    // add a third season so there are two consecutive pairs
    const extended = [...roster, ...roster.filter((r) => r.season === "2021_22").map((r) => ({ ...r, season: "2022_23" }))];
    const report = analyzeIdentityKeyStability(extended);
    expect(report.seasonsAnalyzed).toEqual(["2020_21", "2021_22", "2022_23"]);
    expect(report.pairwise).toHaveLength(2);
  });

  it("throws on a malformed season string", () => {
    expect(() =>
      analyzeIdentityKeyStability([{ season: "not-a-season", externalId: 1, name: "X", role: "A" }]),
    ).toThrow();
  });
});

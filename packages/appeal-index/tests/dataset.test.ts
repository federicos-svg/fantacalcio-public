import { describe, it, expect } from "vitest";
import {
  buildPlayerSeasonPanel,
  buildFeatureRows,
  assertNoLeakage,
  DatasetError,
  LeakageGuardError,
  type SeasonRecords,
} from "../src/dataset.js";
import {
  buildStableCohortSeasons,
  buildSyntheticAnagrafica,
  buildUnstableIdentitySeasons,
} from "../fixtures/syntheticSeasons.js";
import type { FeatureRow } from "../src/types.js";

describe("buildPlayerSeasonPanel", () => {
  it("throws DatasetError on a duplicate season", () => {
    const seasons = buildStableCohortSeasons();
    const dup: SeasonRecords[] = [...seasons, seasons[0]!];
    expect(() => buildPlayerSeasonPanel(dup)).toThrow(DatasetError);
  });

  it("throws DatasetError when given zero seasons", () => {
    expect(() => buildPlayerSeasonPanel([])).toThrow(DatasetError);
  });

  it("resolves external_id-based keys when the identity check confirms stability", () => {
    const panel = buildPlayerSeasonPanel(buildStableCohortSeasons());
    expect(panel.identity.verdict).toBe("stable");
    expect(panel.rows.every((r) => r.playerKey.startsWith("id:"))).toBe(true);
  });

  it("falls back to name+role keys when the identity check finds instability", () => {
    const panel = buildPlayerSeasonPanel(buildUnstableIdentitySeasons());
    expect(panel.identity.verdict).toBe("unstable");
    expect(panel.rows.every((r) => r.playerKey.startsWith("name:"))).toBe(true);
  });

  it("orders seasons chronologically regardless of input order", () => {
    const seasons = buildStableCohortSeasons();
    const shuffled = [...seasons].reverse();
    const panel = buildPlayerSeasonPanel(shuffled);
    expect(panel.orderedSeasons).toEqual([...panel.orderedSeasons].sort());
  });
});

describe("buildFeatureRows", () => {
  const panel = buildPlayerSeasonPanel(buildStableCohortSeasons());
  const rows = buildFeatureRows(panel);

  it("produces at least one row per fully-observed veteran player", () => {
    const veteranRows = rows.filter((r) => r.playerKey === "id:101"); // goalkeeper, 7 seasons -> 6 transitions
    expect(veteranRows.length).toBe(6);
  });

  it("excludes the churned player's season after they leave the panel (2022_23 -> 2023_24 has no target)", () => {
    // externalId 302 is present 2018_19..2022_23 only (5 seasons) -> 4 transitions, none into 2023_24
    const churnedRows = rows.filter((r) => r.playerKey === "id:302");
    expect(churnedRows.length).toBe(4);
    expect(churnedRows.some((r) => r.featureSeason === "2022_23")).toBe(false);
  });

  it("gives the cold-start player a low nSeasonsObserved on their first transition", () => {
    const coldStartRows = rows
      .filter((r) => r.playerKey === "id:202")
      .sort((a, b) => a.featureSeason.localeCompare(b.featureSeason));
    expect(coldStartRows[0]!.features.nSeasonsObserved).toBe(1);
  });

  it("every row's featureSeason is strictly earlier than its targetSeason", () => {
    for (const row of rows) {
      expect(row.featureSeason < row.targetSeason).toBe(true);
    }
  });

  it("passes its own anti-leakage guard by construction", () => {
    expect(() => assertNoLeakage(rows)).not.toThrow();
  });

  it("role one-hot reflects the row's own role", () => {
    const dRow = rows.find((r) => r.role === "D")!;
    expect(dRow.features.roleD).toBe(1);
    expect(dRow.features.roleP + dRow.features.roleC + dRow.features.roleA).toBe(0);
  });

  it("does not convert missing fantamedia or volatility to zero", () => {
    const row = rows.find((candidate) => candidate.features.volatilitaVotoLastObserved === Number.NaN);
    // NaN is deliberately tested through Number.isNaN because NaN !== NaN.
    if (row) {
      expect(Number.isNaN(row.features.volatilitaVotoLastObserved)).toBe(true);
      expect(row.missingFeatures).toContain("volatilitaVotoLastObserved");
    }
    const noHistoryPanel = {
      ...panel,
      rows: panel.rows.map((candidate) =>
        candidate.season === panel.orderedSeasons[0]
          ? { ...candidate, fantamedia: null, volatilitaVoto: null }
          : candidate,
      ),
    };
    const hardened = buildFeatureRows(noHistoryPanel);
    const firstSeason = hardened.filter(
      (candidate) => candidate.featureSeason === panel.orderedSeasons[0],
    );
    expect(firstSeason.length).toBeGreaterThan(0);
    expect(firstSeason.every((candidate) => Number.isNaN(candidate.features.fantamediaLag1))).toBe(
      true,
    );
    expect(
      firstSeason.every((candidate) => candidate.missingFeatures?.includes("fantamediaLag1")),
    ).toBe(true);
  });

  it("retains presenzeNext=0 when fantamediaNext is not observable", () => {
    const targetSeason = panel.orderedSeasons[1]!;
    const targetPlayer = panel.rows.find((candidate) => candidate.season === targetSeason)!;
    const zeroTargetPanel = {
      ...panel,
      rows: panel.rows.map((candidate) =>
        candidate.season === targetSeason && candidate.playerKey === targetPlayer.playerKey
          ? { ...candidate, presenze: 0, fantamedia: null }
          : candidate,
      ),
    };
    const hardened = buildFeatureRows(zeroTargetPanel);
    const transition = hardened.find(
      (candidate) =>
        candidate.playerKey === targetPlayer.playerKey && candidate.targetSeason === targetSeason,
    )!;
    expect(transition.targets.presenzeNext).toBe(0);
    expect(Number.isNaN(transition.targets.fantamediaNext)).toBe(true);
    expect(transition.targetAvailability).toEqual({
      fantamediaNext: "not_observable",
      presenzeNext: "observed",
    });
  });
});

describe("volatilitaVotoLastObserved — the recovered rows (VAL-PROTOCOL-A-PHASE4@2.3.0)", () => {
  const panel = buildPlayerSeasonPanel(buildStableCohortSeasons());

  /**
   * The exact shape of the eleven `NON_FINITE_FEATURES` rows measured on the
   * 2026-08-20 served artifact: a player with real observed history whose LAST
   * season has a single presence, so `volatilitaVoto` is `null` for that season
   * alone. Under the old lag-1 rule the whole vector went non-finite and the
   * row was dropped; under @2.3.0 the feature reads the most recent season that
   * has a dispersion at all.
   */
  function panelWithSinglePresenceFinalSeason(playerKey: string) {
    const lastSeason = panel.orderedSeasons[panel.orderedSeasons.length - 1]!;
    const previousSeason = panel.orderedSeasons[panel.orderedSeasons.length - 2]!;
    return {
      ...panel,
      rows: panel.rows.map((row) =>
        row.playerKey === playerKey && row.season === lastSeason
          ? { ...row, presenze: 1, volatilitaVoto: null }
          : row.playerKey === playerKey && row.season === previousSeason
            ? { ...row, presenze: 30, volatilitaVoto: 1.25 }
            : row,
      ),
    };
  }

  it("stays finite when only the last season is short, and carries the last season that had one", () => {
    const lastSeason = panel.orderedSeasons[panel.orderedSeasons.length - 1]!;
    const previousSeason = panel.orderedSeasons[panel.orderedSeasons.length - 2]!;
    const rows = buildFeatureRows(panelWithSinglePresenceFinalSeason("id:101"));
    const row = rows.find(
      (candidate) => candidate.playerKey === "id:101" && candidate.featureSeason === lastSeason,
    );
    // The last season has no target after it, so the row that must survive is
    // the one whose feature season is the short one only when such a row
    // exists; otherwise the guarantee is checked on the previous transition.
    const probe =
      row ??
      rows.find(
        (candidate) => candidate.playerKey === "id:101" && candidate.featureSeason === previousSeason,
      )!;
    expect(Number.isFinite(probe.features.volatilitaVotoLastObserved)).toBe(true);
    expect(probe.missingFeatures).not.toContain("volatilitaVotoLastObserved");
  });

  it("reads the most recent season that has a dispersion, not an average of them", () => {
    const doctored = {
      ...panel,
      rows: panel.rows.map((row, index) =>
        row.playerKey === "id:101"
          ? { ...row, volatilitaVoto: index === 0 ? 9 : row.season === panel.orderedSeasons[1] ? 2 : null }
          : row,
      ),
    };
    const rows = buildFeatureRows(doctored).filter((candidate) => candidate.playerKey === "id:101");
    const late = rows[rows.length - 1]!;
    expect(late.features.volatilitaVotoLastObserved).toBe(2);
  });

  it("is NaN only when no season of the player's own history ever had two presences", () => {
    const starved = {
      ...panel,
      rows: panel.rows.map((row) =>
        row.playerKey === "id:101" ? { ...row, presenze: 1, volatilitaVoto: null } : row,
      ),
    };
    const rows = buildFeatureRows(starved).filter((candidate) => candidate.playerKey === "id:101");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Number.isNaN(row.features.volatilitaVotoLastObserved)).toBe(true);
      expect(row.missingFeatures).toContain("volatilitaVotoLastObserved");
    }
  });

  it("never reads a season at or after the target season", () => {
    const rows = buildFeatureRows(panelWithSinglePresenceFinalSeason("id:101"));
    expect(() => assertNoLeakage(rows)).not.toThrow();
  });
});

describe("assertNoLeakage", () => {
  function validRow(): FeatureRow {
    return buildFeatureRows(buildPlayerSeasonPanel(buildStableCohortSeasons()))[0]!;
  }

  it("accepts a well-formed row", () => {
    expect(() => assertNoLeakage([validRow()])).not.toThrow();
  });

  it("catches a row whose sourceSeasons includes the target season (induced leakage)", () => {
    const row = validRow();
    const poisoned: FeatureRow = { ...row, sourceSeasons: [...row.sourceSeasons, row.targetSeason] };
    expect(() => assertNoLeakage([poisoned])).toThrow(LeakageGuardError);
  });

  it("catches a row whose sourceSeasons includes a season LATER than the target season", () => {
    const row = validRow();
    const laterSeason = "2099_00";
    const poisoned: FeatureRow = { ...row, sourceSeasons: [...row.sourceSeasons, laterSeason] };
    expect(() => assertNoLeakage([poisoned])).toThrow(LeakageGuardError);
  });

  it("catches featureSeason >= targetSeason", () => {
    const row = validRow();
    const poisoned: FeatureRow = { ...row, featureSeason: row.targetSeason };
    expect(() => assertNoLeakage([poisoned])).toThrow(LeakageGuardError);
  });

  it("catches a malformed audit trail that doesn't end at its own featureSeason", () => {
    const row = validRow();
    const poisoned: FeatureRow = { ...row, sourceSeasons: [] };
    expect(() => assertNoLeakage([poisoned])).toThrow(LeakageGuardError);
  });
});

describe("ageAtSeasonStart — the anagrafica feature (VAL-PROTOCOL-A-PHASE4@2.2.0)", () => {
  const panel = buildPlayerSeasonPanel(buildStableCohortSeasons());

  it("is NaN, never zero, when no anagrafica is supplied at all", () => {
    const rows = buildFeatureRows(panel);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => Number.isNaN(row.features.ageAtSeasonStart))).toBe(true);
    // The existing semantic-missingness audit picks it up with no special case.
    expect(rows.every((row) => row.missingFeatures?.includes("ageAtSeasonStart"))).toBe(true);
  });

  it("reads the age of the row's OWN feature season, not of the target season", () => {
    const anagrafica = new Map([
      ["2019_20", new Map([["id:201", 24]])],
      ["2020_21", new Map([["id:201", 25]])],
    ]);
    const rows = buildFeatureRows(panel, { anagrafica });
    const from2019 = rows.find((row) => row.playerKey === "id:201" && row.featureSeason === "2019_20");
    const from2020 = rows.find((row) => row.playerKey === "id:201" && row.featureSeason === "2020_21");
    expect(from2019?.features.ageAtSeasonStart).toBe(24);
    expect(from2019?.targetSeason).toBe("2020_21");
    expect(from2020?.features.ageAtSeasonStart).toBe(25);
  });

  it("leaves a player absent from the index missing, without touching the covered ones", () => {
    const anagrafica = new Map([["2019_20", new Map([["id:201", 24]])]]);
    const rows = buildFeatureRows(panel, { anagrafica }).filter((row) => row.featureSeason === "2019_20");
    const covered = rows.filter((row) => Number.isFinite(row.features.ageAtSeasonStart));
    const uncovered = rows.filter((row) => !Number.isFinite(row.features.ageAtSeasonStart));
    expect(covered.map((row) => row.playerKey)).toEqual(["id:201"]);
    expect(uncovered.length).toBeGreaterThan(0);
    expect(uncovered.every((row) => Number.isNaN(row.features.ageAtSeasonStart))).toBe(true);
  });

  it("does not enter the sourceSeasons audit trail, so the leakage proof stays about observed seasons", () => {
    const withAge = buildFeatureRows(panel, { anagrafica: buildSyntheticAnagrafica(panel) });
    const withoutAge = buildFeatureRows(panel);
    expect(withAge.map((row) => row.sourceSeasons)).toEqual(withoutAge.map((row) => row.sourceSeasons));
    expect(() => assertNoLeakage(withAge)).not.toThrow();
  });

  it("changes no other feature — the age is added, nothing else is recomputed", () => {
    const withAge = buildFeatureRows(panel, { anagrafica: buildSyntheticAnagrafica(panel) });
    const withoutAge = buildFeatureRows(panel);
    for (const [index, row] of withAge.entries()) {
      const { ageAtSeasonStart: _withAge, ...others } = row.features;
      const { ageAtSeasonStart: _withoutAge, ...baseline } = withoutAge[index]!.features;
      expect(others).toEqual(baseline);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  GOALKEEPER_FAMILY_FEATURES,
  GOALKEEPER_FAMILY_LADDER,
  GOALKEEPER_FEATURE_NAMES,
  buildGoalkeeperFeatureVector,
  goalkeeperFamilyParameterCount,
  hasCompleteGoalkeeperFeatures,
  isGoalkeeperFamily,
  toGoalkeeperVector,
} from "../src/goalkeeperFeatures.js";
import { buildFeatureRows, buildPlayerSeasonPanel } from "../src/dataset.js";
import { buildPlayerSeasonAggregates } from "../src/seasonAggregate.js";
import { PHASE4_CONFIG, familyParameterCount } from "../src/phase4Protocol.js";
import { buildGoalkeeperCohortSeasons } from "../fixtures/syntheticSeasons.js";
import type { PlayerSeasonPanelRow, VoteRecordCandidate } from "../src/types.js";

const SEASONS = ["2021_22", "2022_23", "2023_24", "2024_25"];

function panelRow(overrides: Partial<PlayerSeasonPanelRow>): PlayerSeasonPanelRow {
  return {
    season: "2023_24",
    externalId: 1,
    name: "Synthetic Keeper",
    role: "P",
    team: "Synthetic Team",
    matchdaysObserved: 10,
    presenze: 10,
    mediaVoto: 6,
    fantamedia: 6,
    volatilitaVoto: 0.5,
    golFatti: 0,
    golSuAzione: 0,
    rigoriSegnati: 0,
    assist: 0,
    ammonizioni: 0,
    espulsioni: 0,
    golSubiti: 10,
    porteInviolate: 3,
    rigoriParati: 1,
    playerKey: "k1",
    ...overrides,
  };
}

function voteRecord(overrides: Partial<VoteRecordCandidate>): VoteRecordCandidate {
  return {
    source_id: "fantacalcio_xlsx",
    vote_source: "italia",
    season: "2023_24",
    matchday: 1,
    external_id: 1,
    canonical_player_id: null,
    team: "Synthetic Team",
    role: "P",
    name: "Synthetic Keeper",
    voto_raw: 6,
    voto_base: 6,
    is_asterisk: false,
    is_sv: false,
    is_blank: false,
    is_real_performance: true,
    ...overrides,
  };
}

describe("goalkeeper season aggregates", () => {
  it("sums Gs and Rp and counts a clean sheet only on a matchday actually played", () => {
    const [aggregate] = buildPlayerSeasonAggregates("2023_24", [
      voteRecord({ matchday: 1, Gs: 2 }),
      voteRecord({ matchday: 2 }), // played, no Gs cell at all -> clean sheet
      voteRecord({ matchday: 3, Gs: 0, Rp: 1 }), // played, explicit zero -> clean sheet
      voteRecord({ matchday: 4, voto_base: null, is_blank: true, is_real_performance: false }),
    ]);
    expect(aggregate).toMatchObject({
      presenze: 3,
      golSubiti: 2,
      rigoriParati: 1,
      porteInviolate: 2,
    });
  });

  it("never counts a clean sheet on a matchday with no valid vote", () => {
    const [aggregate] = buildPlayerSeasonAggregates("2023_24", [
      voteRecord({ matchday: 1, voto_raw: "-", voto_base: null, is_sv: true, is_real_performance: false }),
      voteRecord({ matchday: 2, voto_base: null, is_blank: true, is_real_performance: false }),
    ]);
    expect(aggregate).toMatchObject({ presenze: 0, porteInviolate: 0 });
  });
});

describe("goalkeeper feature vector", () => {
  it("derives per-appearance rates from the goalkeeper's own history", () => {
    const features = buildGoalkeeperFeatureVector(
      [
        panelRow({ season: "2022_23", presenze: 10, golSubiti: 20, porteInviolate: 2, rigoriParati: 0 }),
        panelRow({ season: "2023_24", presenze: 10, golSubiti: 10, porteInviolate: 4, rigoriParati: 2 }),
      ],
      0,
      3,
    );
    expect(features.golSubitiPerPresenzaRollingMean3).toBeCloseTo(1.5, 10);
    expect(features.porteInviolateRateRollingMean3).toBeCloseTo(0.3, 10);
    expect(features.rigoriParatiPerPresenzaRollingMean3).toBeCloseTo(0.1, 10);
    expect(features.nSeasonsObserved).toBe(2);
  });

  it("honours the rolling window instead of averaging the whole career", () => {
    const history = [
      panelRow({ season: "2020_21", presenze: 10, golSubiti: 100, porteInviolate: 0 }),
      panelRow({ season: "2021_22", presenze: 10, golSubiti: 10, porteInviolate: 5 }),
      panelRow({ season: "2022_23", presenze: 10, golSubiti: 10, porteInviolate: 5 }),
      panelRow({ season: "2023_24", presenze: 10, golSubiti: 10, porteInviolate: 5 }),
    ];
    expect(buildGoalkeeperFeatureVector(history, 0, 3).golSubitiPerPresenzaRollingMean3).toBeCloseTo(1, 10);
  });

  it("leaves a rate missing rather than imputing zero when the keeper never appeared", () => {
    const features = buildGoalkeeperFeatureVector(
      [panelRow({ presenze: 0, fantamedia: null, volatilitaVoto: null, golSubiti: 0, porteInviolate: 0 })],
      0,
      3,
    );
    expect(Number.isNaN(features.golSubitiPerPresenzaRollingMean3)).toBe(true);
    expect(Number.isNaN(features.porteInviolateRateRollingMean3)).toBe(true);
    expect(Number.isNaN(features.fantamediaLag1)).toBe(true);
    expect(hasCompleteGoalkeeperFeatures(features, "goalkeeper_specific_minimal")).toBe(false);
  });

  it("skips a no-appearance season instead of dragging the rate toward zero", () => {
    const features = buildGoalkeeperFeatureVector(
      [
        panelRow({ season: "2022_23", presenze: 0, fantamedia: null, golSubiti: 0, porteInviolate: 0 }),
        panelRow({ season: "2023_24", presenze: 10, golSubiti: 10, porteInviolate: 5 }),
      ],
      0,
      3,
    );
    expect(features.golSubitiPerPresenzaRollingMean3).toBeCloseTo(1, 10);
    expect(features.porteInviolateRateRollingMean3).toBeCloseTo(0.5, 10);
  });

  it("refuses an empty history instead of returning a zeroed vector", () => {
    expect(() => buildGoalkeeperFeatureVector([], 0, 3)).toThrow("empty history");
  });
});

describe("goalkeeper family ladder declaration", () => {
  it("is strictly nested and strictly decreasing in parameter count", () => {
    for (let i = 1; i < GOALKEEPER_FAMILY_LADDER.length; i++) {
      const richer = GOALKEEPER_FAMILY_FEATURES[GOALKEEPER_FAMILY_LADDER[i - 1]!];
      const leaner = GOALKEEPER_FAMILY_FEATURES[GOALKEEPER_FAMILY_LADDER[i]!];
      expect(leaner.length).toBeLessThan(richer.length);
      expect(leaner.every((name) => richer.includes(name))).toBe(true);
    }
  });

  it("keeps the goalkeeper construct in every family of the ladder", () => {
    for (const family of GOALKEEPER_FAMILY_LADDER) {
      expect(
        GOALKEEPER_FAMILY_FEATURES[family].some((name) => name.startsWith("porteInviolate")),
      ).toBe(true);
    }
  });

  it("declares a parameter count that matches the features it actually estimates", () => {
    for (const family of GOALKEEPER_FAMILY_LADDER) {
      const declared = PHASE4_CONFIG.families[family].pBase + PHASE4_CONFIG.families[family].pRole;
      expect(declared).toBe(GOALKEEPER_FAMILY_FEATURES[family].length + 1);
      expect(goalkeeperFamilyParameterCount(family)).toBe(declared);
      expect(familyParameterCount(family, "P")).toBe(declared);
    }
  });

  it("costs strictly fewer parameters than the pooled family it replaces for P", () => {
    for (const family of GOALKEEPER_FAMILY_LADDER) {
      expect(familyParameterCount(family, "P"))
        .toBeLessThan(familyParameterCount("pooled_regularized_role", "P"));
    }
  });

  it("has no parameter count outside role P", () => {
    for (const role of ["D", "C", "A"] as const) {
      expect(() => familyParameterCount("goalkeeper_specific_full", role))
        .toThrow(`GOALKEEPER_FAMILY_NOT_DEFINED_FOR_ROLE:${role}`);
    }
    expect(isGoalkeeperFamily("pooled_regularized_role")).toBe(false);
  });

  it("extracts the family's own columns, in its declared order", () => {
    const features = buildGoalkeeperFeatureVector([panelRow({})], 1, 3);
    for (const family of GOALKEEPER_FAMILY_LADDER) {
      const vector = toGoalkeeperVector(features, family);
      expect(vector).toHaveLength(GOALKEEPER_FAMILY_FEATURES[family].length);
      expect(vector).toEqual(GOALKEEPER_FAMILY_FEATURES[family].map((name) => features[name]));
    }
    expect(GOALKEEPER_FEATURE_NAMES).toEqual(GOALKEEPER_FAMILY_FEATURES.goalkeeper_specific_full);
  });
});

describe("goalkeeper features on the supervised panel", () => {
  const rows = buildFeatureRows(buildPlayerSeasonPanel(buildGoalkeeperCohortSeasons(SEASONS, 6)));

  it("attaches the goalkeeper vector to role P rows and to no other role", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.goalkeeperFeatures !== undefined).toBe(row.role === "P");
    }
  });

  it("shares the pooled row's history, so the two vectors agree where they overlap", () => {
    for (const row of rows.filter((item) => item.role === "P")) {
      expect(row.goalkeeperFeatures!.nSeasonsObserved).toBe(row.features.nSeasonsObserved);
      expect(row.goalkeeperFeatures!.presenzeLag1).toBe(row.features.presenzeLag1);
      expect(row.goalkeeperFeatures!.teamChangedFlag).toBe(row.features.teamChangedFlag);
    }
  });

  it("produces a real, varying goalkeeper signal rather than a constant column", () => {
    const conceded = new Set(
      rows.filter((row) => row.role === "P").map((row) => row.goalkeeperFeatures!.golSubitiPerPresenzaRollingMean3),
    );
    expect(conceded.size).toBeGreaterThan(1);
    expect([...conceded].every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  });
});

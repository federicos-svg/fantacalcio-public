import { describe, it, expect } from "vitest";
import {
  GEN_HALF_LIFE_GRID,
  GEN_SEALED_SEASON,
  buildAuctionFolds,
  buildBlockFolds,
  buildCohortFolds,
  buildSeasonFolds,
  foldRecencyWeights,
  foldReferenceBlock,
  recencyWeight,
} from "../src/genProtocol/foldScheme.js";
import { buildWalkForwardSplit } from "../src/validation.js";
import { FEATURE_NAMES, type FeatureRow, type FeatureVector } from "../src/types.js";

/**
 * La tabella di GEN-PROTOCOL-A §B.1, TRASCRITTA A MANO dal protocollo.
 *
 * Non e' derivata da nessuna costante del codice: e' il valore atteso
 * indipendente contro cui si sorveglia il costruttore dei fold. Se qualcuno
 * cambiasse `minTrainBlocks`, l'ordinamento delle stagioni o l'esclusione
 * della stagione sigillata, questa tabella se ne accorge.
 */
const PROTOCOL_TABLE_B1: readonly { readonly test: string; readonly train: readonly string[] }[] = [
  { test: "2018_19", train: ["2016_17", "2017_18"] },
  { test: "2019_20", train: ["2016_17", "2017_18", "2018_19"] },
  { test: "2020_21", train: ["2016_17", "2017_18", "2018_19", "2019_20"] },
  { test: "2021_22", train: ["2016_17", "2017_18", "2018_19", "2019_20", "2020_21"] },
  { test: "2022_23", train: ["2016_17", "2017_18", "2018_19", "2019_20", "2020_21", "2021_22"] },
  { test: "2023_24", train: ["2016_17", "2017_18", "2018_19", "2019_20", "2020_21", "2021_22", "2022_23"] },
  {
    test: "2024_25",
    train: ["2016_17", "2017_18", "2018_19", "2019_20", "2020_21", "2021_22", "2022_23", "2023_24"],
  },
];

/** Le stagioni-target possibili: la prima e' 2016/17 (le feature vogliono la precedente). */
const TARGET_SEASONS = [
  "2016_17",
  "2017_18",
  "2018_19",
  "2019_20",
  "2020_21",
  "2021_22",
  "2022_23",
  "2023_24",
  "2024_25",
] as const;

const PREVIOUS_SEASON: Readonly<Record<string, string>> = {
  "2016_17": "2015_16",
  "2017_18": "2016_17",
  "2018_19": "2017_18",
  "2019_20": "2018_19",
  "2020_21": "2019_20",
  "2021_22": "2020_21",
  "2022_23": "2021_22",
  "2023_24": "2022_23",
  "2024_25": "2023_24",
  "2025_26": "2024_25",
};

function zeroFeatures(): FeatureVector {
  return Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])) as unknown as FeatureVector;
}

/** Una `FeatureRow` legacy minima e senza leakage, per far girare `buildWalkForwardSplit`. */
function legacyRow(playerKey: string, targetSeason: string): FeatureRow {
  const featureSeason = PREVIOUS_SEASON[targetSeason]!;
  return {
    playerKey,
    name: `sintetico-${playerKey}`,
    role: "C",
    featureSeason,
    targetSeason,
    features: zeroFeatures(),
    targets: { fantamediaNext: 6, presenzeNext: 20 },
    sourceSeasons: [featureSeason],
  };
}

describe("genProtocol/foldScheme — i 7 fold di §B.1", () => {
  const genRows = TARGET_SEASONS.flatMap((season) => [
    { playerKey: "a", targetSeason: season },
    { playerKey: "b", targetSeason: season },
  ]);

  it("produce esattamente la tabella §B.1, fold per fold", () => {
    const folds = buildSeasonFolds(genRows);
    expect(folds).toHaveLength(7);
    expect(folds.map((f) => f.testBlock)).toEqual(PROTOCOL_TABLE_B1.map((r) => r.test));
    folds.forEach((fold, i) => {
      expect(fold.foldIndex).toBe(i + 1);
      expect(fold.trainBlocks).toEqual(PROTOCOL_TABLE_B1[i]!.train);
      expect(fold.testRows.map((r) => r.targetSeason)).toEqual([PROTOCOL_TABLE_B1[i]!.test, PROTOCOL_TABLE_B1[i]!.test]);
      expect(fold.trainRows).toHaveLength(PROTOCOL_TABLE_B1[i]!.train.length * 2);
    });
  });

  it("coincide con `buildWalkForwardSplit` (minTrainTargetSeasons=2), invece di assumerlo", () => {
    const legacyRows = TARGET_SEASONS.flatMap((season) => [legacyRow("a", season), legacyRow("b", season)]);
    const legacy = buildWalkForwardSplit(legacyRows, { minTrainTargetSeasons: 2 });
    const folds = buildSeasonFolds(genRows);

    expect(legacy.folds).toHaveLength(folds.length);
    legacy.folds.forEach((legacyFold, i) => {
      expect(legacyFold.testSeason).toBe(folds[i]!.testBlock);
      const legacyTrainSeasons = [...new Set(legacyFold.trainRows.map((r) => r.targetSeason))].sort();
      expect(legacyTrainSeasons).toEqual([...folds[i]!.trainBlocks].sort());
    });
  });

  it("esclude la stagione sigillata per identita', non perche' e' l'ultima", () => {
    expect(GEN_SEALED_SEASON).toBe("2025_26");
    const withSealed = [...genRows, { playerKey: "a", targetSeason: "2025_26" }, { playerKey: "b", targetSeason: "2025_26" }];
    const folds = buildSeasonFolds(withSealed);
    expect(folds.map((f) => f.testBlock)).toEqual(PROTOCOL_TABLE_B1.map((r) => r.test));
    expect(folds.flatMap((f) => f.trainBlocks)).not.toContain("2025_26");
  });

  it("l'ordine di arrivo delle righe non cambia i fold", () => {
    const shuffled = [...genRows].reverse();
    expect(buildSeasonFolds(shuffled).map((f) => f.testBlock)).toEqual(
      buildSeasonFolds(genRows).map((f) => f.testBlock),
    );
  });

  it("il fold interno e' l'ultima stagione del training (§D.2)", () => {
    const folds = buildSeasonFolds(genRows);
    // Esempio testuale del protocollo: test 2021/22 -> interno 2020/21.
    const fold2021 = folds.find((f) => f.testBlock === "2021_22")!;
    expect(fold2021.inner.validationBlock).toBe("2020_21");
    expect(fold2021.inner.validationRows.map((r) => r.targetSeason)).toEqual(["2020_21", "2020_21"]);
    expect([...new Set(fold2021.inner.trainRows.map((r) => r.targetSeason))]).toEqual([
      "2016_17",
      "2017_18",
      "2018_19",
      "2019_20",
    ]);
    for (const fold of folds) {
      expect(fold.inner.validationBlock).toBe(fold.trainBlocks[fold.trainBlocks.length - 1]);
      expect(fold.inner.trainRows.length + fold.inner.validationRows.length).toBe(fold.trainRows.length);
    }
  });
});

describe("genProtocol/foldScheme — fold d'asta (T3) e per coorti (T8)", () => {
  it("T3: due soli fold — test a3 con train a1–a2, test a4 con train a1–a3", () => {
    const rows = ["a1", "a2", "a3", "a4", "a5"].flatMap((auction) => [
      { playerKey: "x", auction },
      { playerKey: "y", auction },
    ]);
    const folds = buildAuctionFolds(rows, ["a1", "a2", "a3", "a4"], { sealedBlocks: ["a5"] });
    expect(folds).toHaveLength(2);
    expect(folds[0]!.testBlock).toBe("a3");
    expect(folds[0]!.trainBlocks).toEqual(["a1", "a2"]);
    expect(folds[1]!.testBlock).toBe("a4");
    expect(folds[1]!.trainBlocks).toEqual(["a1", "a2", "a3"]);
    expect(folds.flatMap((f) => f.trainBlocks)).not.toContain("a5");
  });

  it("T8: test = coorte dell'estate t, train = coorti precedenti, dal terzo anno in poi", () => {
    const rows = ["2021", "2022", "2023", "2024", "2025"].flatMap((cohort) => [
      { playerKey: "x", cohort },
      { playerKey: "y", cohort },
    ]);
    const folds = buildCohortFolds(rows, ["2021", "2022", "2023", "2024"], { sealedBlocks: ["2025"] });
    expect(folds.map((f) => f.testBlock)).toEqual(["2023", "2024"]);
    expect(folds[0]!.trainBlocks).toEqual(["2021", "2022"]);
  });

  it("rifiuta un blocco che non e' nell'ordine dichiarato invece di metterlo in fondo", () => {
    expect(() =>
      buildBlockFolds([{ auction: "a9" }], (r) => r.auction, ["a1", "a2", "a3"]),
    ).toThrow(/not in the declared block order/);
  });
});

describe("genProtocol/foldScheme — pesi di recency (§B.1)", () => {
  it("la griglia e' {1,5; 3; ∞}", () => {
    expect(GEN_HALF_LIFE_GRID).toEqual([1.5, 3, Number.POSITIVE_INFINITY]);
  });

  it("w = 0,5^{Δ/h}: a mano, con h=3 e Δ=3 il peso e' esattamente 0,5", () => {
    expect(recencyWeight("2018_19", "2021_22", 3)).toBeCloseTo(0.5, 12);
    // Δ = 6, h = 3 -> 0,5^2 = 0,25
    expect(recencyWeight("2015_16", "2021_22", 3)).toBeCloseTo(0.25, 12);
    // Δ = 3, h = 1,5 -> 0,5^2 = 0,25
    expect(recencyWeight("2018_19", "2021_22", 1.5)).toBeCloseTo(0.25, 12);
    // Δ = 0 -> peso 1 per qualunque h
    expect(recencyWeight("2021_22", "2021_22", 1.5)).toBe(1);
  });

  it("h = ∞ significa pesi uniformi, non un ramo speciale", () => {
    for (const season of ["2015_16", "2018_19", "2021_22"]) {
      expect(recencyWeight(season, "2021_22", Number.POSITIVE_INFINITY)).toBe(1);
    }
  });

  it("i pesi di un fold sono ancorati all'ultima stagione del TRAINING, non al test", () => {
    const rows = TARGET_SEASONS.map((season) => ({ playerKey: "a", targetSeason: season }));
    const fold = buildSeasonFolds(rows).find((f) => f.testBlock === "2021_22")!;
    expect(foldReferenceBlock(fold)).toBe("2020_21");
    const weights = foldRecencyWeights(fold, 3);
    // La riga 2020_21 e' l'ancora -> peso 1; la 2017_18 dista 3 anni -> 0,5.
    expect(weights[fold.trainRows.findIndex((r) => r.targetSeason === "2020_21")]).toBe(1);
    expect(weights[fold.trainRows.findIndex((r) => r.targetSeason === "2017_18")]).toBeCloseTo(0.5, 12);
  });

  it("rifiuta un half-life non positivo", () => {
    expect(() => recencyWeight("2018_19", "2021_22", 0)).toThrow();
    expect(() => recencyWeight("2018_19", "2021_22", -1)).toThrow();
  });
});

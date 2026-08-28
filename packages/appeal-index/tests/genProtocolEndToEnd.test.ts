// GEN-PROTOCOL-A — il giro completo, dai mondi sintetici alla ricetta.
//
// Questi non sono unit test: sono la prova che il motore, messo davanti a
// domande di cui si conosce la risposta, risponde bene. Sono quattro domande:
//
//   1. quando il segnale C'E', lo trova? (powerWorld -> vincitore, coefficienti
//      recuperati per segno e per ordine);
//   2. quando NON c'e', si trattiene? (nullWorld su tre semi fissi -> mai un
//      vincitore);
//   3. quando qualcuno guarda il futuro, se ne accorge? (canarino §G.4 e
//      canarino SV);
//   4. due giri identici producono lo stesso artefatto, byte per byte?
//
// Piu' la quinta, arrivata con la v2.0.0: il layer delle prime giornate si
// accende dove c'e' qualcosa da imparare e non dove non c'e'.

import { describe, it, expect } from "vitest";
import {
  buildGenFeatureRows,
  type GenFeatureSet,
} from "../src/genProtocol/featureCatalog.js";
import { GEN_SEALED_SEASON, buildSeasonFolds } from "../src/genProtocol/foldScheme.js";
import {
  ELASTIC_NET_GRID,
  fitElasticNet,
  predictWithElasticNet,
  type FittedElasticNetParameters,
} from "../src/genProtocol/elasticNet.js";
import { MARCEL_GRID, fitMarcel, predictMarcel, type MarcelObservation } from "../src/genProtocol/shrinkageMarcel.js";
import { fitB0, predictB0T2 } from "../src/genProtocol/baselinesB0.js";
import { tuneOnInnerFold } from "../src/genProtocol/internalTuning.js";
import { mae, weightedMae } from "../src/genProtocol/metrics.js";
import { selectGenCandidate, type GenSelectionResult } from "../src/genProtocol/selection.js";
import { auditAnteriority, runLeakCanary } from "../src/genProtocol/anteriorityAudit.js";
import {
  EARLY_RIDGE_LAMBDA_GRID,
  GEN_EARLY_SEASON_G_SET,
  buildEarlyEvidence,
  fitEarlyRidge,
  predictEarlyU1,
  predictEarlyU2,
  selectEarlyLayerForG,
  type EarlyEvidence,
  type EarlyLayerRecipeEntry,
  type EarlyTrainingRow,
} from "../src/genProtocol/earlySeasonUpdate.js";
import { GEN_PROTOCOL_CORE_VERSION } from "../src/genProtocol/index.js";
import { applyRecipe, buildGenRecipe, type GenRecipe } from "../src/genProtocol/recipeArtifact.js";
import { GEN_SEEDS } from "../src/genProtocol/prng.js";
import {
  PLANTED_COEFFICIENTS,
  PLANTED_FEATURES,
  leakCanaryWorld,
  nullWorld,
  powerWorld,
  svCoercionCanary,
  type PlantedFeature,
  type SyntheticWorld,
} from "../src/genProtocol/syntheticWorld.js";
import { isValidPresence, type GenFeatureRow, type GenRole, type GenSeason } from "../src/genProtocol/genTypes.js";

// Undici stagioni da 2015/16: le stesse dieci modellabili di §A.2 piu' la
// sigillata, cosi' i fold prodotti sono ESATTAMENTE i sette di §B.1.
const WORLD_OPTIONS = { seasons: 11, firstSeason: "2015_16" as GenSeason };

/** La versione del protocollo dichiarata dal chiamante: qui sintetica, come l'hash. */
const PROTOCOL_VERSION = "9.9.9-sintetica";

/** Il set attivo del giro completo: i due lag del blocco X, le sette piantate, le due di rumore. */
const ACTIVE_FEATURES = [
  "fantamediaLag1",
  "presenzeLag1",
  ...PLANTED_FEATURES,
  "clearancesPer90",
  "interceptionsPer90",
];

/** Il set del solo recupero dei coefficienti: senza i lag, che assorbirebbero il segnale piantato. */
const RECOVERY_FEATURES = [...PLANTED_FEATURES, "clearancesPer90", "interceptionsPer90"];

function featureRowsOf(world: SyntheticWorld, set: GenFeatureSet = "S2"): GenFeatureRow[] {
  const out: GenFeatureRow[] = [];
  for (const season of world.seasons.slice(1)) {
    if (season === GEN_SEALED_SEASON) continue; // §F: la fetta sigillata non entra, nemmeno per descrivere
    out.push(...buildGenFeatureRows(world.panel, set, season));
  }
  return out.filter((row) => row.role !== "P" && Number.isFinite(row.targets.t2));
}

function observationsOf(world: SyntheticWorld): Map<string, MarcelObservation[]> {
  const map = new Map<string, MarcelObservation[]>();
  for (const row of world.panel) {
    if (row.fantamedia === null) continue;
    const list = map.get(row.playerKey) ?? [];
    list.push({ season: row.season, value: row.fantamedia, presences: row.presenze });
    map.set(row.playerKey, list);
  }
  return map;
}

function before(season: GenSeason, target: GenSeason): boolean {
  return Number(season.slice(0, 4)) < Number(target.slice(0, 4));
}

const meanOf = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

interface PipelineResult {
  readonly rows: readonly GenFeatureRow[];
  readonly foldBlocks: readonly string[];
  readonly selection: GenSelectionResult;
  readonly baselineLossPerFold: readonly number[];
  readonly elasticLossPerFold: readonly number[];
  readonly marcelLossPerFold: readonly number[];
  readonly finalFit: FittedElasticNetParameters;
  readonly recipe: GenRecipe;
}

/**
 * Il giro completo su T2: fold di §B.1, tuning interno di §D.2, tre candidati,
 * selezione di §B.4, ricetta di §K.
 *
 * Nessuna scorciatoia: gli iperparametri si scelgono SEMPRE sul fold interno, e
 * il fold di test non entra mai in un fit.
 */
function runT2Pipeline(world: SyntheticWorld, activeFeatures: readonly string[]): PipelineResult {
  const rows = featureRowsOf(world);
  const observations = observationsOf(world);
  const folds = buildSeasonFolds(rows);

  const toElastic = (row: GenFeatureRow) => ({
    features: row.features,
    target: row.targets.t2,
    weight: row.targets.t2Weight,
  });
  const toMarcel = (row: GenFeatureRow) => ({
    playerKey: row.playerKey,
    role: row.role,
    season: row.targetSeason,
    value: row.targets.t2,
    presences: row.targets.t2Weight,
  });
  const historyOf = (row: GenFeatureRow): MarcelObservation[] =>
    (observations.get(row.playerKey) ?? []).filter((observation) => before(observation.season, row.targetSeason));

  const baselineLossPerFold: number[] = [];
  const elasticLossPerFold: number[] = [];
  const marcelLossPerFold: number[] = [];
  const roleLoss: Record<string, { baseline: number[]; elastic: number[] }> = {};

  for (const fold of folds) {
    const actual = fold.testRows.map((row) => row.targets.t2);
    const weights = fold.testRows.map((row) => row.targets.t2Weight);

    const b0 = fitB0(
      fold.trainRows.map((row) => ({
        role: row.role,
        presenze: row.targets.tN,
        fantamedia: Number.isFinite(row.targets.t2) ? row.targets.t2 : null,
      })),
    );
    const baselinePredictions = fold.testRows.map((row) =>
      predictB0T2(b0, {
        role: row.role,
        presenzeLag1: Number.isFinite(row.features.presenzeLag1!) ? row.features.presenzeLag1! : null,
        fantamediaLag1: Number.isFinite(row.features.fantamediaLag1!) ? row.features.fantamediaLag1! : null,
      }),
    );
    baselineLossPerFold.push(weightedMae(actual, baselinePredictions, weights));

    const tunedMarcel = tuneOnInnerFold(fold, MARCEL_GRID, (hyper, innerTrain, innerValidation) => {
      const fit = fitMarcel(innerTrain.map(toMarcel), hyper, innerTrain[innerTrain.length - 1]!.targetSeason);
      const predictions = innerValidation.map((row) => predictMarcel(fit, row.role, historyOf(row)).prediction);
      return weightedMae(
        innerValidation.map((row) => row.targets.t2),
        predictions,
        innerValidation.map((row) => row.targets.t2Weight),
      );
    });
    const marcelFit = fitMarcel(
      fold.trainRows.map(toMarcel),
      tunedMarcel.chosen,
      fold.trainBlocks[fold.trainBlocks.length - 1]!,
    );
    marcelLossPerFold.push(
      weightedMae(actual, fold.testRows.map((row) => predictMarcel(marcelFit, row.role, historyOf(row)).prediction), weights),
    );

    const tunedElastic = tuneOnInnerFold(fold, ELASTIC_NET_GRID, (hyper, innerTrain, innerValidation) => {
      const fit = fitElasticNet(innerTrain.map(toElastic), activeFeatures, hyper);
      const scored = innerValidation
        .map((row) => ({ row, prediction: predictWithElasticNet(fit, row.features) }))
        .filter((entry) => Number.isFinite(entry.prediction));
      if (scored.length === 0) return NaN;
      return weightedMae(
        scored.map((entry) => entry.row.targets.t2),
        scored.map((entry) => entry.prediction),
        scored.map((entry) => entry.row.targets.t2Weight),
      );
    });
    const elasticFit = fitElasticNet(fold.trainRows.map(toElastic), activeFeatures, tunedElastic.chosen);
    const elasticPredictions = fold.testRows.map((row) => predictWithElasticNet(elasticFit, row.features));
    elasticLossPerFold.push(weightedMae(actual, elasticPredictions, weights));

    for (const role of ["D", "C", "A"] as GenRole[]) {
      const indexed = fold.testRows.map((row, index) => ({ row, index })).filter((entry) => entry.row.role === role);
      roleLoss[role] ??= { baseline: [], elastic: [] };
      const roleActual = indexed.map((entry) => entry.row.targets.t2);
      const roleWeights = indexed.map((entry) => entry.row.targets.t2Weight);
      roleLoss[role]!.baseline.push(weightedMae(roleActual, indexed.map((entry) => baselinePredictions[entry.index]!), roleWeights));
      roleLoss[role]!.elastic.push(weightedMae(roleActual, indexed.map((entry) => elasticPredictions[entry.index]!), roleWeights));
    }
  }

  const selection = selectGenCandidate({
    target: "T2",
    baseline: {
      candidateId: "B0",
      primaryLossPerFold: baselineLossPerFold,
      scoredRows: rows.length,
      primaryLossByRole: {
        D: meanOf(roleLoss.D!.baseline),
        C: meanOf(roleLoss.C!.baseline),
        A: meanOf(roleLoss.A!.baseline),
      },
      meanSpearmanByRole: 0.2,
    },
    candidates: [
      {
        candidateId: "FAM-1",
        family: "FAM-1",
        featureCount: 0,
        enumerationIndex: 0,
        primaryLossPerFold: marcelLossPerFold,
        scoredRows: rows.length,
        primaryLossByRole: {
          D: meanOf(marcelLossPerFold),
          C: meanOf(marcelLossPerFold),
          A: meanOf(marcelLossPerFold),
        },
        meanSpearmanByRole: 0.25,
      },
      {
        candidateId: "FAM-2/S2",
        family: "FAM-2/S2",
        featureCount: activeFeatures.length,
        enumerationIndex: 1,
        primaryLossPerFold: elasticLossPerFold,
        scoredRows: rows.length,
        primaryLossByRole: {
          D: meanOf(roleLoss.D!.elastic),
          C: meanOf(roleLoss.C!.elastic),
          A: meanOf(roleLoss.A!.elastic),
        },
        meanSpearmanByRole: 0.3,
      },
    ],
  });

  // Refit finale sull'intero training disponibile (fetta sigillata esclusa),
  // con gli iperparametri scelti sull'ultimo fold interno: e' il refit di
  // serving di §F.
  const lastFold = folds[folds.length - 1]!;
  const tunedFinal = tuneOnInnerFold(lastFold, ELASTIC_NET_GRID, (hyper, innerTrain, innerValidation) => {
    const fit = fitElasticNet(innerTrain.map(toElastic), activeFeatures, hyper);
    const scored = innerValidation
      .map((row) => ({ row, prediction: predictWithElasticNet(fit, row.features) }))
      .filter((entry) => Number.isFinite(entry.prediction));
    if (scored.length === 0) return NaN;
    return weightedMae(
      scored.map((entry) => entry.row.targets.t2),
      scored.map((entry) => entry.prediction),
      scored.map((entry) => entry.row.targets.t2Weight),
    );
  });
  const finalFit = fitElasticNet(rows.map(toElastic), activeFeatures, tunedFinal.chosen);

  const recipe = buildGenRecipe({
    coreVersion: GEN_PROTOCOL_CORE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    protocolHash: "0".repeat(64),
    datasetContentFingerprint: `synthetic-${String(world.seed)}`,
    seeds: { ...GEN_SEEDS },
    targetSeason: "2026_27",
    entries: (["D", "C", "A"] as GenRole[]).map((role) => ({
      target: "T2" as const,
      role,
      status: selection.statusByRole[role] ?? selection.status,
      servedCandidateId: selection.servedCandidateId,
      model: { family: "FAM-2" as const, parameters: finalFit },
      featureSet: "S2" as const,
      conformalRadius: null,
    })),
    priceCurves: [],
    layer: { gSet: [...GEN_EARLY_SEASON_G_SET], entries: [] },
  });

  return {
    rows,
    foldBlocks: folds.map((fold) => fold.testBlock),
    selection,
    baselineLossPerFold,
    elasticLossPerFold,
    marcelLossPerFold,
    finalFit,
    recipe,
  };
}

const POWER_WORLD = powerWorld(101, WORLD_OPTIONS);
const POWER = runT2Pipeline(POWER_WORLD, ACTIVE_FEATURES);

describe("GEN-PROTOCOL-A end-to-end — powerWorld: quando il segnale c'e', si trova", () => {
  it("i fold prodotti sono ESATTAMENTE i sette di §B.1", () => {
    expect(POWER.foldBlocks).toEqual([
      "2018_19",
      "2019_20",
      "2020_21",
      "2021_22",
      "2022_23",
      "2023_24",
      "2024_25",
    ]);
    // La stagione sigillata non compare, ne' come test ne' come training (§F).
    expect(POWER.rows.some((row) => row.targetSeason === GEN_SEALED_SEASON)).toBe(false);
  });

  it("il vincitore e' FAM-2, batte B0 in TUTTI i fold e in media", () => {
    expect(POWER.selection.status).toBe("winner");
    expect(POWER.selection.servedCandidateId).toBe("FAM-2/S2");
    for (let f = 0; f < POWER.foldBlocks.length; f++) {
      expect(POWER.elasticLossPerFold[f]!).toBeLessThan(POWER.baselineLossPerFold[f]!);
    }
    expect(meanOf(POWER.elasticLossPerFold)).toBeLessThan(meanOf(POWER.baselineLossPerFold));
  });

  it("il vincitore e' AMMISSIBILE per tutte e quattro le condizioni di §B.3", () => {
    const verdict = POWER.selection.admissibility.find((entry) => entry.candidateId === "FAM-2/S2")!;
    expect(verdict.admissible).toBe(true);
    expect(verdict.failures).toEqual([]);
    expect(verdict.coverageRatio).toBeGreaterThanOrEqual(0.9);
    expect(verdict.foldWins).toBeGreaterThanOrEqual(verdict.requiredFoldWins);
    expect(verdict.roleVetoes).toEqual([]);
  });

  it("l'IC bootstrap season-block esclude lo zero: non e' un pareggio travestito", () => {
    const interval = POWER.selection.bootstrapInterval!;
    expect(interval.containsZero).toBe(false);
    expect(interval.upper!).toBeLessThan(0); // il vincitore ha perdita MINORE
    expect(interval.blocks).toBe(7);
  });

  it("la catena di selezione e' leggibile e serializzabile (§K)", () => {
    expect(POWER.selection.chain.length).toBeGreaterThan(3);
    expect(POWER.selection.chain.map((step) => step.stage)).toContain("one_standard_error");
    expect(() => JSON.stringify(POWER.selection.chain)).not.toThrow();
  });

  it("la ricetta gira: applyRecipe riproduce ESATTAMENTE le predizioni del modello fittato", () => {
    const serialized = JSON.parse(JSON.stringify(POWER.recipe)) as GenRecipe;
    const sample = POWER.rows.slice(0, 25);
    for (const row of sample) {
      const direct = predictWithElasticNet(POWER.finalFit, row.features);
      const applied = applyRecipe(serialized, { target: "T2", role: row.role, features: row.features });
      expect(applied.prediction).toBe(direct);
    }
  });

  it("i coefficienti piantati si recuperano: segno giusto per tutti e sette", () => {
    const recovery = runT2Pipeline(POWER_WORLD, RECOVERY_FEATURES);
    const fit = recovery.finalFit;
    for (const feature of PLANTED_FEATURES) {
      const index = fit.featureNames.indexOf(feature);
      const coefficient = fit.coefficients[index]!;
      const truth = PLANTED_COEFFICIENTS[feature];
      expect(Math.sign(coefficient)).toBe(Math.sign(truth));
    }
    // Le due feature di RUMORE non ricevono peso: tolleranza dichiarata 0,05
    // sulla scala standardizzata (i coefficienti veri stanno fra 0,08 e 0,9).
    for (const noise of ["clearancesPer90", "interceptionsPer90"]) {
      const index = fit.featureNames.indexOf(noise);
      expect(Math.abs(fit.coefficients[index]!)).toBeLessThan(0.05);
    }
  });

  it("e si recupera anche l'ORDINE di importanza, sulla scala standardizzata", () => {
    const recovery = runT2Pipeline(POWER_WORLD, RECOVERY_FEATURES);
    const fit = recovery.finalFit;
    const ranked = PLANTED_FEATURES.map((feature) => {
      const index = fit.featureNames.indexOf(feature);
      return {
        feature,
        fitted: Math.abs(fit.coefficients[index]!),
        // `|β| × sd(feature)` e' il coefficiente vero sulla scala su cui il
        // modello fitta: senza la sd i due ordini non sarebbero confrontabili.
        truth: Math.abs(PLANTED_COEFFICIENTS[feature] * fit.standardizerStds[index]!),
      };
    });
    const byFitted = [...ranked].sort((a, b) => b.fitted - a.fitted).map((entry) => entry.feature);
    const byTruth = [...ranked].sort((a, b) => b.truth - a.truth).map((entry) => entry.feature);
    expect(byFitted).toEqual(byTruth);
  });
});

describe("GEN-PROTOCOL-A end-to-end — nullWorld: quando il segnale non c'e', ci si trattiene", () => {
  // Tre semi FISSI: il test non ne prova altri finche' non passa.
  for (const seed of [201, 202, 203]) {
    it(`seme ${String(seed)}: mai un vincitore — si serve B0 o si dichiara NO_VERDICT`, () => {
      const result = runT2Pipeline(nullWorld(seed, WORLD_OPTIONS), ACTIVE_FEATURES);
      expect(result.selection.status).not.toBe("winner");
      expect(["B0", "NO_VERDICT"]).toContain(result.selection.status);
      expect(result.selection.servedCandidateId).toBe("B0");
      // E il divario dalla baseline e' minuscolo: non e' che il candidato
      // perda di brutto, e' che non distingue.
      const gap = Math.abs(meanOf(result.elasticLossPerFold) - meanOf(result.baselineLossPerFold));
      expect(gap / meanOf(result.baselineLossPerFold)).toBeLessThan(0.05);
    });
  }
});

describe("GEN-PROTOCOL-A end-to-end — i canarini", () => {
  it("leakCanaryWorld: il builder pulito passa (0 violazioni) e l'audit conta tutte le righe", () => {
    const world = leakCanaryWorld(7);
    const targetSeason = world.seasons[world.seasons.length - 2]!;
    const rows = buildGenFeatureRows(world.panel, "S2", targetSeason);
    const audit = auditAnteriority(rows);
    expect(audit.violazioni).toHaveLength(0);
    expect(audit.righeVerificate).toBe(rows.length);

    const canary = runLeakCanary(world.panel, (panel) => buildGenFeatureRows(panel, "S2", targetSeason));
    expect(canary.violazioni).toHaveLength(0);
  });

  it("leakCanaryWorld: una riga contaminata a mano viene INTERCETTATA (violazioni > 0)", () => {
    const world = leakCanaryWorld(7);
    const targetSeason = world.seasons[world.seasons.length - 2]!;
    const rows = buildGenFeatureRows(world.panel, "S2", targetSeason);
    // Violazione indotta: una riga che dichiara di aver usato la stagione
    // target. Non e' un caso ipotetico — e' il difetto che §G.2 cerca.
    const contaminated = rows.map((row, index) =>
      index === 0 ? { ...row, sourceSeasons: [...row.sourceSeasons, targetSeason] } : row,
    );
    const audit = auditAnteriority(contaminated);
    expect(audit.violazioni.length).toBeGreaterThan(0);
    expect(audit.violazioni[0]!.kind).toBe("SOURCE_SEASON_NOT_BEFORE_TARGET");
  });

  it("svCoercionCanary: i conteggi dei null tornano ESATTI a valle del catalogo", () => {
    const world = svCoercionCanary(31);
    // Il canarino dichiara i suoi numeri; il catalogo li deve riprodurre.
    let presenze = 0;
    for (const row of world.panel) presenze += row.matchdays.filter(isValidPresence).length;
    expect(presenze).toBe(world.expectedValidPresences);

    const rows = buildGenFeatureRows(world.panel, "S1", "2020_21");
    for (const row of rows) {
      const panelRow = world.panel.find((candidate) => candidate.playerKey === row.playerKey)!;
      if (world.allSvPlayers.includes(row.playerKey)) {
        // Stagione interamente SV: le presenze valgono 0 (un valore osservato),
        // la fantamedia NON esiste — e mai uno 0 al suo posto.
        expect(row.features.presenzeLag1).toBe(0);
        expect(row.features.presenzeRolling3).toBe(0);
        expect(row.features.fantamediaLag1).toBeNaN();
        expect(row.features.fantamediaRolling3).toBeNaN();
        expect(row.features.bonusRate).toBeNaN();
      } else {
        // 19 presenze su 38 giornate, meta' SV: il conteggio a valle e' quello
        // delle presenze VALIDE, non delle righe.
        expect(row.features.presenzeLag1).toBe(19);
        expect(row.features.presenzeRolling3).toBeCloseTo(panelRow.presenze, 6);
        expect(Number.isFinite(row.features.fantamediaRolling3!)).toBe(true);
      }
    }
  });
});

describe("GEN-PROTOCOL-A end-to-end — determinismo (§B.3.1)", () => {
  it("due giri completi del powerWorld producono ricette byte-identiche", () => {
    const first = runT2Pipeline(powerWorld(101, WORLD_OPTIONS), ACTIVE_FEATURES);
    const second = runT2Pipeline(powerWorld(101, WORLD_OPTIONS), ACTIVE_FEATURES);
    expect(JSON.stringify(second.recipe)).toBe(JSON.stringify(first.recipe));
    expect(JSON.stringify(second.selection)).toBe(JSON.stringify(first.selection));
  });
});

// --- il layer delle prime giornate, §D.15 ----------------------------------

interface LayerRow extends EarlyTrainingRow {
  readonly targetSeason: GenSeason;
  readonly nTotal: number;
}

function layerRowsOf(world: SyntheticWorld, G: number): LayerRow[] {
  const byPlayer = new Map<string, Map<GenSeason, (typeof world.panel)[number]>>();
  for (const row of world.panel) {
    const seasons = byPlayer.get(row.playerKey) ?? new Map();
    seasons.set(row.season, row);
    byPlayer.set(row.playerKey, seasons);
  }
  const out: LayerRow[] = [];
  for (let i = 1; i < world.seasons.length; i++) {
    const season = world.seasons[i]!;
    if (season === GEN_SEALED_SEASON) continue;
    const previous = world.seasons[i - 1]!;
    for (const seasons of byPlayer.values()) {
      const target = seasons.get(season);
      const lag = seasons.get(previous);
      if (target === undefined || lag === undefined) continue;
      const evidence: EarlyEvidence = buildEarlyEvidence(
        target.matchdays.filter((md) => md.matchday <= G),
        G,
      );
      out.push({
        role: target.role,
        evidence,
        nBaseOof: lag.presenze,
        nRest: target.matchdays.filter((md) => md.matchday > G && isValidPresence(md)).length,
        targetSeason: season,
        nTotal: target.presenze,
      });
    }
  }
  return out;
}

/**
 * L'incumbent T-N, CALIBRATO per ruolo (`N_s ≈ a + b·N_{s−1}`) sul fold
 * indicato.
 *
 * Senza questa calibrazione U0 sarebbe il lag grezzo, e U2 lo batterebbe per
 * sola regressione verso la media: si misurerebbe la taratura dell'incumbent,
 * non il valore dell'evidenza. §D.15.2 chiede infatti `N̂_base` = predizione
 * out-of-fold dell'incumbent, non il lag.
 */
function calibrateIncumbent(rows: readonly LayerRow[], fitRows: readonly LayerRow[]): LayerRow[] {
  const out: LayerRow[] = [];
  for (const role of ["P", "D", "C", "A"] as GenRole[]) {
    const target = rows.filter((row) => row.role === role);
    const fit = fitRows.filter((row) => row.role === role);
    if (fit.length < 10) {
      out.push(...target);
      continue;
    }
    const meanX = meanOf(fit.map((row) => row.nBaseOof));
    const meanY = meanOf(fit.map((row) => row.nTotal));
    let sxy = 0;
    let sxx = 0;
    for (const row of fit) {
      sxy += (row.nBaseOof - meanX) * (row.nTotal - meanY);
      sxx += (row.nBaseOof - meanX) ** 2;
    }
    const slope = sxx > 0 ? sxy / sxx : 0;
    const intercept = meanY - slope * meanX;
    for (const row of target) out.push({ ...row, nBaseOof: intercept + slope * row.nBaseOof });
  }
  return out;
}

interface LayerOutcome {
  readonly winner: "U0" | "U1" | "U2";
  readonly u0: readonly number[];
  readonly u1: readonly number[];
  readonly u2: readonly number[];
  readonly entry: EarlyLayerRecipeEntry;
}

function runLayerPipeline(world: SyntheticWorld, G: number): LayerOutcome {
  const rows = layerRowsOf(world, G);
  const folds = buildSeasonFolds(rows).map((fold) => ({
    ...fold,
    trainRows: calibrateIncumbent(fold.trainRows, fold.inner.trainRows),
    testRows: calibrateIncumbent(fold.testRows, fold.trainRows),
    inner: {
      ...fold.inner,
      trainRows: calibrateIncumbent(fold.inner.trainRows, fold.inner.trainRows),
      validationRows: calibrateIncumbent(fold.inner.validationRows, fold.inner.trainRows),
    },
  }));

  const u0: number[] = [];
  const u1: number[] = [];
  const u2: number[] = [];
  let lastFits = new Map<GenRole, ReturnType<typeof fitEarlyRidge>>();

  for (const fold of folds) {
    const actual = fold.testRows.map((row) => row.nTotal);
    u0.push(mae(actual, fold.testRows.map((row) => row.nBaseOof)));
    u1.push(mae(actual, fold.testRows.map((row) => predictEarlyU1(row.evidence, row.nBaseOof))));

    const tuned = tuneOnInnerFold(
      fold,
      EARLY_RIDGE_LAMBDA_GRID.map((lambda) => ({ lambda })),
      (hyper, innerTrain, innerValidation) => {
        let sum = 0;
        let count = 0;
        for (const role of ["P", "D", "C", "A"] as GenRole[]) {
          const trainRole = innerTrain.filter((row) => row.role === role);
          const validationRole = innerValidation.filter((row) => row.role === role);
          if (trainRole.length < 10 || validationRole.length === 0) continue;
          const fit = fitEarlyRidge(trainRole, G, role, hyper.lambda);
          for (const row of validationRole) {
            sum += Math.abs(row.nTotal - predictEarlyU2(fit, row.evidence, row.nBaseOof));
            count++;
          }
        }
        return count > 0 ? sum / count : NaN;
      },
    );
    const fits = new Map<GenRole, ReturnType<typeof fitEarlyRidge>>();
    for (const role of ["P", "D", "C", "A"] as GenRole[]) {
      const trainRole = fold.trainRows.filter((row) => row.role === role);
      if (trainRole.length < 10) continue;
      fits.set(role, fitEarlyRidge(trainRole, G, role, tuned.chosen.lambda));
    }
    lastFits = fits;
    u2.push(
      mae(
        actual,
        fold.testRows.map((row) => {
          const fit = fits.get(row.role);
          return fit === undefined ? row.nBaseOof : predictEarlyU2(fit, row.evidence, row.nBaseOof);
        }),
      ),
    );
  }

  const outcome = selectEarlyLayerForG({
    G,
    target: "TN",
    baseline: {
      candidateId: "U0",
      primaryLossPerFold: u0,
      scoredRows: rows.length,
      primaryLossByRole: { D: meanOf(u0), C: meanOf(u0), A: meanOf(u0) },
      meanSpearmanByRole: 0.3,
    },
    candidates: [
      {
        candidateId: `U1_G${String(G)}`,
        family: "U1",
        featureCount: 1,
        enumerationIndex: 0,
        primaryLossPerFold: u1,
        scoredRows: rows.length,
        primaryLossByRole: { D: meanOf(u1), C: meanOf(u1), A: meanOf(u1) },
        meanSpearmanByRole: 0.3,
      },
      {
        candidateId: `U2_G${String(G)}`,
        family: "U2",
        featureCount: G + 1,
        enumerationIndex: 1,
        primaryLossPerFold: u2,
        scoredRows: rows.length,
        primaryLossByRole: { D: meanOf(u2), C: meanOf(u2), A: meanOf(u2) },
        meanSpearmanByRole: 0.3,
      },
    ],
  });

  const ridgeByRole: Partial<Record<GenRole, ReturnType<typeof fitEarlyRidge>>> = {};
  if (outcome.winner === "U2") for (const [role, fit] of lastFits) ridgeByRole[role] = fit;

  return {
    winner: outcome.winner,
    u0,
    u1,
    u2,
    entry: { G, winner: outcome.winner, ridgeByRole, selectionStatus: outcome.selection.status },
  };
}

describe("GEN-PROTOCOL-A end-to-end — il layer prime giornate (§D.15)", () => {
  const shocked = powerWorld(303, { ...WORLD_OPTIONS, starterRegime: "shocked" });
  const blind = nullWorld(401, { ...WORLD_OPTIONS, starterRegime: "earlyIndependent" });

  it("dove la titolarita' CAMBIA alle prime giornate, il layer si accende — per ogni G del protocollo", () => {
    for (const G of GEN_EARLY_SEASON_G_SET) {
      const outcome = runLayerPipeline(shocked, G);
      expect(outcome.winner).not.toBe("U0");
      expect(meanOf(outcome.u1)).toBeLessThan(meanOf(outcome.u0));
      expect(outcome.entry.G).toBe(G);
    }
  });

  it("piu' giornate osservate, piu' guadagno: il layer legge davvero l'evidenza", () => {
    const g1 = runLayerPipeline(shocked, 1);
    const g3 = runLayerPipeline(shocked, 3);
    expect(meanOf(g3.u1)).toBeLessThan(meanOf(g1.u1));
  });

  it("dove le prime giornate non dicono nulla sul resto, il FITTATO non si accende", () => {
    // Il layer resta comunque meglio di U0, e non e' un difetto: U1 sostituisce
    // una STIMA con un FATTO su G giornate di 38, quindi guadagna sempre un po'
    // — per aritmetica, non per segnale. Cio' che il null deve mostrare e' che
    // il candidato FITTATO (U2), che avrebbe bisogno di un segnale vero per
    // pagare la sua complessita', non viene selezionato.
    for (const G of GEN_EARLY_SEASON_G_SET) {
      const outcome = runLayerPipeline(blind, G);
      expect(outcome.winner).not.toBe("U2");
    }
  });

  it("e il guadagno del layer e' molto piu' grande dove l'evidenza conta davvero", () => {
    const informative = runLayerPipeline(shocked, 2);
    const blindOutcome = runLayerPipeline(blind, 2);
    const gain = (outcome: LayerOutcome): number =>
      (meanOf(outcome.u0) - meanOf(outcome.u1)) / meanOf(outcome.u0);
    expect(gain(informative)).toBeGreaterThan(2 * gain(blindOutcome));
  });

  it("la ricetta serializza una entry per ogni G, e applyRecipe usa quella del G effettivo", () => {
    const entries = GEN_EARLY_SEASON_G_SET.map((G) => runLayerPipeline(shocked, G).entry);
    const recipe = buildGenRecipe({
      coreVersion: GEN_PROTOCOL_CORE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      protocolHash: "0".repeat(64),
      datasetContentFingerprint: "synthetic-layer",
      seeds: { ...GEN_SEEDS },
      targetSeason: "2026_27",
      entries: [
        {
          target: "TN",
          role: "C",
          status: "B0",
          servedCandidateId: "B0",
          model: {
            family: "B0",
            parameters: fitB0([
              { role: "C", presenze: 20, fantamedia: 6 },
              { role: "C", presenze: 30, fantamedia: 7 },
            ]),
          },
          featureSet: null,
          conformalRadius: null,
        },
      ],
      priceCurves: [],
      layer: { gSet: [...GEN_EARLY_SEASON_G_SET], entries },
    });
    expect(recipe.layer.entries.map((entry) => entry.G)).toEqual([1, 2, 3]);

    const b0Input = { role: "C" as const, presenzeLag1: 20, fantamediaLag1: 6.5 };
    for (const G of GEN_EARLY_SEASON_G_SET) {
      const evidence = buildEarlyEvidence(
        Array.from({ length: G }, (_, g) => ({
          season: "2026_27" as GenSeason,
          matchday: g + 1,
          votoBase: 6,
          isAsterisk: false,
          Gf: 0,
          Gs: 0,
          Rp: 0,
          Rs: 0,
          Rf: 0,
          Au: 0,
          Amm: 0,
          Esp: 0,
          Ass: 0,
        })),
        G,
      );
      const applied = applyRecipe(recipe, {
        target: "TN",
        role: "C",
        features: {},
        b0Input,
        effectiveG: G,
        earlyEvidence: evidence,
      });
      expect(applied.layerG).toBe(G);
      expect(applied.layerApplied).toBe(recipe.layer.entries.find((entry) => entry.G === G)!.winner);
    }
  });
});

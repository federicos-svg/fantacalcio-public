import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  GEN_RECIPE_PROTOCOL_ID,
  GEN_RECIPE_VERSION,
  GenRecipeError,
  applyModel,
  applyRecipe,
  buildGenRecipe,
  type GenRecipe,
  type GenRecipeEntry,
} from "../src/genProtocol/recipeArtifact.js";
import { GEN_PROTOCOL_CORE_VERSION } from "../src/genProtocol/index.js";
import { fitElasticNet, predictWithElasticNet } from "../src/genProtocol/elasticNet.js";
import { fitMarcel, predictMarcel } from "../src/genProtocol/shrinkageMarcel.js";
import { fitBoostedStumps, predictWithBoostedStumps } from "../src/genProtocol/boostedStumps.js";
import { fitB0, predictB0N, predictB0T1, predictB0T2 } from "../src/genProtocol/baselinesB0.js";
import { buildPriceCurve, residualQuantilesByRankBand, type GenAuctionRow } from "../src/genProtocol/priceCurve.js";
import {
  GEN_EARLY_SEASON_G_SET,
  buildEarlyEvidence,
  fitEarlyRidge,
  predictEarlyU1,
  predictEarlyU2,
  type EarlyLayerRecipeEntry,
  type EarlyTrainingRow,
} from "../src/genProtocol/earlySeasonUpdate.js";
import { GEN_SEEDS } from "../src/genProtocol/prng.js";
import type { GenSeason, MatchdayVote } from "../src/genProtocol/genTypes.js";

const SEASON: GenSeason = "2026_27";
const FEATURES = ["x1", "x2"];

function md(matchday: number, votoBase: number | null): MatchdayVote {
  return {
    season: SEASON,
    matchday,
    votoBase,
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
  };
}

const elasticRows = Array.from({ length: 40 }, (_, i) => ({
  features: { x1: i % 7, x2: (i * 3) % 5 },
  target: 2 + 0.5 * (i % 7) - 0.2 * ((i * 3) % 5),
}));
const elastic = fitElasticNet(elasticRows, FEATURES, { alpha: 0.5, lambda: 0.01 });

const boosted = fitBoostedStumps(elasticRows, FEATURES, { learningRate: 0.1, depth: 2, maxTrees: 20 });

const marcel = fitMarcel(
  Array.from({ length: 20 }, (_, i) => ({
    playerKey: `K${String(i)}`,
    role: "C" as const,
    season: "2024_25" as GenSeason,
    value: 6 + (i % 5) * 0.2,
    presences: 10 + i,
  })),
  { k: 10, halfLife: 3 },
  "2024_25",
);

const b0 = fitB0([
  { role: "C", presenze: 10, fantamedia: 6, mediaVotoBase: 6 },
  { role: "C", presenze: 20, fantamedia: 7, mediaVotoBase: 6.2 },
  { role: "C", presenze: 30, fantamedia: 8, mediaVotoBase: 6.4 },
]);

const auctions: GenAuctionRow[] = [
  { auction: "a1", playerKey: "P1", role: "C", price: 80, isRenewal: false },
  { auction: "a1", playerKey: "P2", role: "C", price: 40, isRenewal: false },
  { auction: "a2", playerKey: "P3", role: "C", price: 70, isRenewal: false },
  { auction: "a2", playerKey: "P4", role: "C", price: 30, isRenewal: false },
];
const curve = buildPriceCurve(auctions, "C", ["a1", "a2"], {
  bandWidth: 1,
  smoothing: "none",
  renormalization: "poolRatio",
});

const layerTraining: EarlyTrainingRow[] = Array.from({ length: 50 }, (_, i) => ({
  role: "C" as const,
  evidence: buildEarlyEvidence([md(1, i % 3 === 0 ? null : 6), md(2, i % 4 === 0 ? null : 6)], 2),
  nBaseOof: 8 + (i % 20),
  nRest: Math.min(36, Math.round(0.7 * (8 + (i % 20)) + (i % 3 === 0 ? 0 : 6))),
}));
const layerRidge = fitEarlyRidge(layerTraining, 2, "C", 1);

const entries: GenRecipeEntry[] = [
  {
    target: "T2",
    role: "C",
    status: "winner",
    servedCandidateId: "FAM-2/S2:pooled",
    model: { family: "FAM-2", parameters: elastic },
    featureSet: "S2",
    conformalRadius: 1.25,
  },
  {
    target: "T1",
    role: "C",
    status: "winner",
    servedCandidateId: "FAM-4/S2",
    model: { family: "FAM-4", parameters: boosted },
    featureSet: "S2",
    conformalRadius: null,
  },
  {
    target: "TN",
    role: "C",
    status: "B0",
    servedCandidateId: "B0",
    model: { family: "B0", parameters: b0 },
    featureSet: null,
    conformalRadius: 4,
  },
  {
    target: "TD",
    role: "C",
    status: "NO_VERDICT",
    servedCandidateId: "B0",
    model: { family: "FAM-1", parameters: marcel },
    featureSet: null,
    conformalRadius: null,
  },
];

const layerEntries: EarlyLayerRecipeEntry[] = [
  { G: 1, winner: "U0", ridgeByRole: {}, selectionStatus: "NO_VERDICT" },
  { G: 2, winner: "U2", ridgeByRole: { C: layerRidge }, selectionStatus: "winner" },
  { G: 3, winner: "U1", ridgeByRole: {}, selectionStatus: "winner" },
];

const recipe: GenRecipe = buildGenRecipe({
  coreVersion: GEN_PROTOCOL_CORE_VERSION,
  protocolHash: "a".repeat(64),
  datasetContentFingerprint: "fingerprint-sintetico",
  seeds: { ...GEN_SEEDS },
  targetSeason: SEASON,
  entries,
  priceCurves: [{ curve, residualBands: residualQuantilesByRankBand([{ rank: 1, actual: 80, predicted: 75 }]) }],
  layer: { gSet: [...GEN_EARLY_SEASON_G_SET], entries: layerEntries },
});

describe("genProtocol/recipeArtifact — identita' e forma (§K)", () => {
  it("porta le tre versioni distinte: ricetta, protocollo, core", () => {
    expect(recipe.recipeVersion).toBe("GEN-RECIPE@1.0.0");
    expect(GEN_RECIPE_VERSION).toBe("GEN-RECIPE@1.0.0");
    expect(recipe.protocolId).toBe("GEN-PROTOCOL-A");
    expect(GEN_RECIPE_PROTOCOL_ID).toBe("GEN-PROTOCOL-A");
    expect(recipe.protocolVersion).toBe("2.0.0");
    expect(recipe.coreVersion).toBe(GEN_PROTOCOL_CORE_VERSION);
  });

  it("copia i tetti ratificati e la sezione layer, con il G di ciascuna entry", () => {
    expect(recipe.expertCaps.starter[0]!.cap).toBe(38);
    expect(recipe.expertCaps.health[2]!.cap).toBe(10);
    expect(recipe.layer.gSet).toEqual([1, 2, 3]);
    expect(recipe.layer.entries.map((entry) => entry.G)).toEqual([1, 2, 3]);
  });

  it("una entry di layer fuori dall'insieme dichiarato non entra nella ricetta", () => {
    expect(() =>
      buildGenRecipe({
        coreVersion: GEN_PROTOCOL_CORE_VERSION,
        protocolHash: "b".repeat(64),
        datasetContentFingerprint: "f",
        seeds: {},
        targetSeason: SEASON,
        entries,
        priceCurves: [],
        layer: { gSet: [1, 2, 3], entries: [{ G: 4, winner: "U1", ridgeByRole: {}, selectionStatus: "winner" }] },
      }),
    ).toThrow(GenRecipeError);
  });

  it("e' serializzabile e ri-leggibile senza perdere nulla", () => {
    const roundtrip = JSON.parse(JSON.stringify(recipe)) as GenRecipe;
    expect(JSON.stringify(roundtrip)).toBe(JSON.stringify(recipe));
  });
});

describe("genProtocol/recipeArtifact — il ROUNDTRIP fit → serialize → apply", () => {
  const features = { x1: 3, x2: 2 };
  const serialized = JSON.parse(JSON.stringify(recipe)) as GenRecipe;

  it("FAM-2: la predizione da ricetta e' IDENTICA a quella del modello appena fittato", () => {
    const direct = predictWithElasticNet(elastic, features);
    const fromRecipe = applyRecipe(serialized, { target: "T2", role: "C", features });
    expect(fromRecipe.prediction).toBe(direct);
    expect(fromRecipe.status).toBe("winner");
  });

  it("FAM-4: idem, e la ricetta ricorda quale candidato serve", () => {
    const direct = predictWithBoostedStumps(boosted, features);
    const fromRecipe = applyRecipe(serialized, { target: "T1", role: "C", features });
    expect(fromRecipe.prediction).toBe(direct);
    expect(fromRecipe.servedCandidateId).toBe("FAM-4/S2");
  });

  it("FAM-1: idem, con le osservazioni del giocatore", () => {
    const observations = [{ season: "2024_25" as GenSeason, value: 6.5, presences: 20 }];
    const direct = predictMarcel(marcel, "C", observations).prediction;
    const fromRecipe = applyRecipe(serialized, {
      target: "TD",
      role: "C",
      features,
      marcelObservations: observations,
    });
    expect(fromRecipe.prediction).toBe(direct);
    expect(fromRecipe.status).toBe("NO_VERDICT");
  });

  it("B0: idem, con i fatti di s−1, e per ciascuno dei suoi tre bersagli", () => {
    const b0Input = { role: "C" as const, presenzeLag1: 20, fantamediaLag1: 6.4 };
    expect(
      applyRecipe(serialized, { target: "TN", role: "C", features, b0Input, effectiveG: 0 }).prediction,
    ).toBe(predictB0N(b0, b0Input));
    expect(applyModel({ family: "B0", parameters: b0 }, { target: "T2", role: "C", features, b0Input })).toBe(
      predictB0T2(b0, b0Input),
    );
    expect(applyModel({ family: "B0", parameters: b0 }, { target: "T1", role: "C", features, b0Input })).toBe(
      predictB0T1(b0, b0Input),
    );
  });

  it("FAM-3 composto: `T1̂ = T2̂ × N̂`, coi due fattori applicati alla stessa riga", () => {
    const b0Input = { role: "C" as const, presenzeLag1: 20, fantamediaLag1: 6.4 };
    const composite = applyModel(
      { family: "FAM-3", t2: { family: "FAM-2", parameters: elastic }, tN: { family: "B0", parameters: b0 } },
      { target: "T1", role: "C", features, b0Input },
    );
    expect(composite).toBeCloseTo(predictWithElasticNet(elastic, features) * predictB0N(b0, b0Input), 12);
  });

  it("l'intervallo conformal e' `pred ± q̂_r`, e manca dove il raggio manca", () => {
    const withRadius = applyRecipe(serialized, { target: "T2", role: "C", features });
    expect(withRadius.interval).toEqual({
      lower: withRadius.prediction - 1.25,
      upper: withRadius.prediction + 1.25,
    });
    expect(applyRecipe(serialized, { target: "T1", role: "C", features }).interval).toBeNull();
  });

  it("un bersaglio-ruolo non selezionato non si serve: si dice, non si inventa", () => {
    expect(() => applyRecipe(serialized, { target: "T2", role: "A", features })).toThrow(GenRecipeError);
  });
});

describe("genProtocol/recipeArtifact — layer e tetti, nell'ordine di §D.15.3", () => {
  const b0Input = { role: "C" as const, presenzeLag1: 20, fantamediaLag1: 6.4 };
  const features = { x1: 3, x2: 2 };
  const evidence = buildEarlyEvidence([md(1, 6), md(2, 6)], 2);

  it("il layer si applica a T-N col G effettivo, e la ricetta usa la entry di QUEL G", () => {
    const applied = applyRecipe(recipe, {
      target: "TN",
      role: "C",
      features,
      b0Input,
      effectiveG: 2,
      earlyEvidence: evidence,
    });
    expect(applied.layerApplied).toBe("U2");
    expect(applied.layerG).toBe(2);
    expect(applied.prediction).toBeCloseTo(predictEarlyU2(layerRidge, evidence, applied.modelPrediction), 12);
  });

  it("a G = 3 vince U1: la ricetta applica l'aritmetica dichiarata, non la ridge di G = 2", () => {
    const evidence3 = buildEarlyEvidence([md(1, 6), md(2, 6), md(3, null)], 3);
    const applied = applyRecipe(recipe, {
      target: "TN",
      role: "C",
      features,
      b0Input,
      effectiveG: 3,
      earlyEvidence: evidence3,
    });
    expect(applied.layerApplied).toBe("U1");
    expect(applied.prediction).toBeCloseTo(predictEarlyU1(evidence3, applied.modelPrediction), 12);
  });

  it("a G = 1 il layer non si accende: la stima resta quella del modello", () => {
    const evidence1 = buildEarlyEvidence([md(1, 6)], 1);
    const applied = applyRecipe(recipe, {
      target: "TN",
      role: "C",
      features,
      b0Input,
      effectiveG: 1,
      earlyEvidence: evidence1,
    });
    expect(applied.layerApplied).toBe("U0");
    expect(applied.prediction).toBe(applied.modelPrediction);
  });

  it("G effettivo fuori dall'insieme congelato e' un errore esplicito", () => {
    expect(() =>
      applyRecipe(recipe, { target: "TN", role: "C", features, b0Input, effectiveG: 4, earlyEvidence: evidence }),
    ).toThrow(/fuori dall'insieme congelato/);
  });

  it("i tetti arrivano DOPO il layer, e solo verso il basso", () => {
    const senzaTetti = applyRecipe(recipe, {
      target: "TN",
      role: "C",
      features,
      b0Input,
      effectiveG: 2,
      earlyEvidence: evidence,
    });
    const conTetti = applyRecipe(recipe, {
      target: "TN",
      role: "C",
      features,
      b0Input,
      effectiveG: 2,
      earlyEvidence: evidence,
      expertScores: { titolarita: 3, salute: 10 },
    });
    expect(conTetti.prediction).toBeLessThanOrEqual(senzaTetti.prediction);
    expect(conTetti.prediction).toBeLessThanOrEqual(15);
    expect(conTetti.capApplied).toBe(true);
    // Il numero grezzo del modello resta leggibile: la sensibilita' obbligatoria
    // di §D.10.2 si calcola su quella coppia.
    expect(conTetti.modelPrediction).toBe(senzaTetti.modelPrediction);
  });

  it("un tetto generoso non alza nulla", () => {
    const applied = applyRecipe(recipe, {
      target: "TN",
      role: "C",
      features,
      b0Input,
      effectiveG: 2,
      earlyEvidence: evidence,
      expertScores: { titolarita: 10, salute: 10 },
    });
    expect(applied.capApplied).toBe(false);
  });
});

describe("genProtocol/recipeArtifact — parita' con lo schema JSON", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const schema = JSON.parse(readFileSync(resolve(root, "schemas/gen-recipe.schema.json"), "utf8")) as {
    properties?: Record<string, unknown>;
    required?: string[];
    $defs?: Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
  };

  const fieldNames = [
    "recipeVersion",
    "protocolId",
    "protocolVersion",
    "coreVersion",
    "protocolHash",
    "datasetContentFingerprint",
    "seeds",
    "targetSeason",
    "entries",
    "priceCurves",
    "expertCaps",
    "layer",
  ] as const;

  it("ogni campo del contratto resta required e dichiarato nello schema", () => {
    expect(schema.required).toEqual(expect.arrayContaining([...fieldNames]));
    expect(Object.keys(schema.properties ?? {})).toEqual(expect.arrayContaining([...fieldNames]));
  });

  it("la ricetta costruita ha ESATTAMENTE le chiavi dello schema, senza extra", () => {
    expect(Object.keys(recipe).sort()).toEqual([...fieldNames].sort());
  });

  it("le chiavi di una entry e di una entry di layer coincidono con lo schema", () => {
    expect(Object.keys(recipe.entries[0]!).sort()).toEqual([...(schema.$defs?.entry?.required ?? [])].sort());
    expect(Object.keys(recipe.layer.entries[0]!).sort()).toEqual(
      [...(schema.$defs?.layerEntry?.required ?? [])].sort(),
    );
  });

  it("le fasce dei tetti hanno la forma dichiarata dallo schema", () => {
    expect(Object.keys(recipe.expertCaps.starter[0]!).sort()).toEqual(
      [...(schema.$defs?.capBand?.required ?? [])].sort(),
    );
  });
});

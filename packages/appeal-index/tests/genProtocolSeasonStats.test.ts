import { describe, it, expect } from "vitest";
import {
  DEFAULT_MIN_RATIO_DENOMINATOR,
  MIN_MINUTES_FOR_PER90,
  SEASON_STAT_FIELDS,
  SeasonStatsError,
  TIER_A_FIELDS,
  TIER_B_FIELDS,
  TIER_B_FIRST_TARGET_SEASON,
  assertValidSeasonStatsRow,
  isSeasonStatField,
  isTierBField,
  per90,
  ratio,
  readStatField,
  validateSeasonStatsRow,
} from "../src/genProtocol/seasonStats.js";

describe("genProtocol/seasonStats — il catalogo dei campi di stagione (§D.5, §D.3)", () => {
  it("ha 93 campi, tutti distinti e in ordine alfabetico", () => {
    // I tre numeri sono scritti a mano: 93 campi, 90 Tier A, 3 Tier B (§D.3, P0.6).
    expect(SEASON_STAT_FIELDS).toHaveLength(93);
    expect(new Set(SEASON_STAT_FIELDS).size).toBe(93);
    expect([...SEASON_STAT_FIELDS]).toEqual([...SEASON_STAT_FIELDS].sort());
  });

  it("separa 90 Tier A e 3 Tier B, e i Tier B sono quelli del protocollo", () => {
    expect(TIER_A_FIELDS).toHaveLength(90);
    expect([...TIER_B_FIELDS].sort()).toEqual(["expectedAssists", "expectedGoals", "goalsPrevented"]);
    expect(isTierBField("expectedGoals")).toBe(true);
    expect(isTierBField("goals")).toBe(false);
    for (const field of TIER_A_FIELDS) expect(isTierBField(field)).toBe(false);
  });

  it("i confini d'era attesi sono quelli di §D.3, trascritti a mano", () => {
    expect(TIER_B_FIRST_TARGET_SEASON.goalsPrevented).toBe("2021_22");
    expect(TIER_B_FIRST_TARGET_SEASON.expectedGoals).toBe("2022_23");
    expect(TIER_B_FIRST_TARGET_SEASON.expectedAssists).toBe("2022_23");
  });

  it("riconosce i nomi noti e rifiuta gli altri", () => {
    expect(isSeasonStatField("goalKicks")).toBe(true);
    expect(isSeasonStatField("goalKick")).toBe(false);
  });
});

describe("genProtocol/seasonStats — per90 e ratio (§D.5, convenzioni globali)", () => {
  it("le soglie sono 270 minuti e 10 eventi — valori scritti a mano", () => {
    expect(MIN_MINUTES_FOR_PER90).toBe(270);
    expect(DEFAULT_MIN_RATIO_DENOMINATOR).toBe(10);
  });

  it("per90: 10 gol in 900 minuti fanno esattamente 1 per 90", () => {
    // 10 × 90 / 900 = 1.
    expect(per90(10, 900)).toBe(1);
  });

  it("per90 e' indefinito sotto 270 minuti, e proprio A 270 e' definito", () => {
    expect(per90(3, 269)).toBeNaN();
    expect(per90(3, 270)).toBeCloseTo(1, 12);
  });

  it("per90 con un ingresso non osservato da' NaN, mai 0 (§D.3)", () => {
    expect(per90(null, 900)).toBeNaN();
    expect(per90(5, null)).toBeNaN();
    expect(per90(undefined, 900)).toBeNaN();
  });

  it("ratio: 7 su 20 fa 0,35; sotto il denominatore minimo e' NaN", () => {
    expect(ratio(7, 20)).toBeCloseTo(0.35, 12);
    expect(ratio(7, 9)).toBeNaN();
    expect(ratio(7, 10)).toBeCloseTo(0.7, 12);
  });

  it("ratio onora un denominatore minimo diverso: le eccezioni 5 e 3 del catalogo", () => {
    expect(ratio(2, 5, 5)).toBeCloseTo(0.4, 12);
    expect(ratio(2, 4, 5)).toBeNaN();
    expect(ratio(1, 3, 3)).toBeCloseTo(1 / 3, 12);
    expect(ratio(1, 2, 3)).toBeNaN();
  });

  it("ratio con numeratore non osservato da' NaN, non 0", () => {
    expect(ratio(null, 20)).toBeNaN();
    expect(ratio(3, null)).toBeNaN();
  });
});

describe("genProtocol/seasonStats — il validatore strutturale", () => {
  it("distingue osservato, non osservato e non chiesto", () => {
    const validation = validateSeasonStatsRow({ goals: 4, expectedGoals: null });
    expect(validation.observedFields).toEqual(["goals"]);
    expect(validation.nullFields).toEqual(["expectedGoals"]);
    expect(validation.absentFields).toHaveLength(91);
    expect(validation.unknownKeys).toEqual([]);
  });

  it("non coerce MAI: un valore che non e' un numero fa fallire, non diventa un numero", () => {
    expect(() => validateSeasonStatsRow({ goals: "4" })).toThrow(SeasonStatsError);
    expect(() => validateSeasonStatsRow({ goals: Number.NaN })).toThrow(SeasonStatsError);
  });

  it("segnala le chiavi sconosciute e, con l'assert, si ferma", () => {
    const validation = validateSeasonStatsRow({ goals: 1, inventedField: 2 });
    expect(validation.unknownKeys).toEqual(["inventedField"]);
    expect(() => assertValidSeasonStatsRow({ goals: 1, inventedField: 2 })).toThrow(/chiavi sconosciute/);
  });

  it("readStatField legge un numero, e riporta null sia per assente sia per non osservato", () => {
    expect(readStatField({ goals: 3 }, "goals")).toBe(3);
    expect(readStatField({ goals: null }, "goals")).toBeNull();
    expect(readStatField({}, "goals")).toBeNull();
    expect(readStatField(undefined, "goals")).toBeNull();
  });
});

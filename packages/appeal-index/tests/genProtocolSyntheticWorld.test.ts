import { describe, it, expect } from "vitest";
import {
  NOISE_FEATURES,
  PLANTED_COEFFICIENTS,
  PLANTED_FEATURES,
  earlyEvidenceCanaryMatchdays,
  leakCanaryWorld,
  nullWorld,
  powerWorld,
  svCoercionCanary,
} from "../src/genProtocol/syntheticWorld.js";
import { buildGenFeatureRows } from "../src/genProtocol/featureCatalog.js";
import { isValidPresence, matchdayFantavoto } from "../src/genProtocol/genTypes.js";

describe("genProtocol/syntheticWorld — dimensioni e determinismo", () => {
  it("il powerWorld rispetta i minimi dichiarati: ≥ 6 stagioni × ≥ 120 giocatori", () => {
    const world = powerWorld(1);
    expect(world.seasons.length).toBeGreaterThanOrEqual(6);
    expect(new Set(world.panel.map((row) => row.playerKey)).size).toBeGreaterThanOrEqual(120);
    expect(world.panel.length).toBe(world.seasons.length * world.roleOf.size);
  });

  it("due generazioni con lo stesso seme sono byte-identiche; semi diversi no", () => {
    expect(JSON.stringify(powerWorld(42))).toBe(JSON.stringify(powerWorld(42)));
    expect(JSON.stringify(powerWorld(42))).not.toBe(JSON.stringify(powerWorld(43)));
    expect(JSON.stringify(nullWorld(9))).toBe(JSON.stringify(nullWorld(9)));
  });

  it("i coefficienti veri sono sette, con due segni negativi", () => {
    expect(PLANTED_FEATURES).toHaveLength(7);
    const values = PLANTED_FEATURES.map((feature) => PLANTED_COEFFICIENTS[feature]);
    expect(values.filter((value) => value < 0)).toHaveLength(2);
    expect(NOISE_FEATURES).toHaveLength(2);
    for (const noise of NOISE_FEATURES) {
      expect(PLANTED_FEATURES as readonly string[]).not.toContain(noise);
    }
  });

  it("rispetta la guardia della tariffa: `Gs` solo sulle righe di portiere", () => {
    for (const row of powerWorld(3).panel) {
      for (const md of row.matchdays) {
        if (row.role === "P") continue;
        expect(md.Gs).toBe(0);
      }
    }
  });

  it("i voti base stanno sulla griglia 0,5 e dentro [1, 10] (P0.3)", () => {
    for (const row of powerWorld(5).panel.slice(0, 40)) {
      for (const md of row.matchdays) {
        if (md.votoBase === null) continue;
        expect(md.votoBase).toBeGreaterThanOrEqual(1);
        expect(md.votoBase).toBeLessThanOrEqual(10);
        expect(Math.round(md.votoBase * 2)).toBeCloseTo(md.votoBase * 2, 12);
      }
    }
  });

  it("gli aggregati del panel tornano con la tariffa canonica, riga per riga", () => {
    for (const row of powerWorld(11).panel.slice(0, 30)) {
      const presenze = row.matchdays.filter(isValidPresence);
      expect(row.presenze).toBe(presenze.length);
      const totale = presenze.reduce((sum, md) => sum + matchdayFantavoto(md, row.role, row.playerKey), 0);
      expect(row.totFantavoto).toBeCloseTo(totale, 9);
      if (presenze.length === 0) {
        expect(row.fantamedia).toBeNull();
      } else {
        expect(row.fantamedia).toBeCloseTo(totale / presenze.length, 9);
      }
    }
  });

  it("nel powerWorld il segnale ESISTE: la fantamedia correla con la titolarita' precedente", () => {
    const world = powerWorld(17);
    const rows = buildGenFeatureRows(world.panel, "S2", world.seasons[4]!).filter(
      (row) => row.role !== "P" && Number.isFinite(row.targets.t2) && Number.isFinite(row.features.titolaritaShare),
    );
    const alta = rows.filter((row) => row.features.titolaritaShare! > 0.6).map((row) => row.targets.t2);
    const bassa = rows.filter((row) => row.features.titolaritaShare! < 0.4).map((row) => row.targets.t2);
    const media = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(alta.length).toBeGreaterThan(5);
    expect(bassa.length).toBeGreaterThan(5);
    expect(media(alta)).toBeGreaterThan(media(bassa));
  });

  it("nel nullWorld il segnale NON esiste: le due medie non si separano", () => {
    const world = nullWorld(17);
    const rows = buildGenFeatureRows(world.panel, "S2", world.seasons[4]!).filter(
      (row) => row.role !== "P" && Number.isFinite(row.targets.t2) && Number.isFinite(row.features.titolaritaShare),
    );
    const alta = rows.filter((row) => row.features.titolaritaShare! > 0.6).map((row) => row.targets.t2);
    const bassa = rows.filter((row) => row.features.titolaritaShare! < 0.4).map((row) => row.targets.t2);
    const media = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(Math.abs(media(alta) - media(bassa))).toBeLessThan(0.5);
  });
});

describe("genProtocol/syntheticWorld — i canarini", () => {
  it("leakCanaryWorld porta tre righe finte in una stagione FUTURA", () => {
    const world = leakCanaryWorld(21);
    expect(world.futureRows).toHaveLength(3);
    for (const row of world.futureRows) expect(row.season).toBe(world.futureSeason);
    expect(Number(world.futureSeason.slice(0, 4))).toBe(Number(world.targetSeason.slice(0, 4)) + 1);
  });

  it("earlyEvidenceCanaryMatchdays pianta esattamente una riga oltre la finestra", () => {
    for (const G of [1, 2, 3, 5]) {
      const rows = earlyEvidenceCanaryMatchdays("2026_27", G);
      expect(rows).toHaveLength(G + 1);
      expect(rows.filter((row) => row.matchday > G)).toHaveLength(1);
    }
  });

  it("svCoercionCanary dichiara i conteggi attesi, e a valle tornano esatti", () => {
    const world = svCoercionCanary(31);
    let svRows = 0;
    let validPresences = 0;
    for (const row of world.panel) {
      for (const md of row.matchdays) {
        if (md.votoBase === null) svRows++;
        else validPresences++;
      }
    }
    expect(svRows).toBe(world.expectedSvRows);
    expect(validPresences).toBe(world.expectedValidPresences);
    // 12 giocatori × 38 giornate: la somma dei due conteggi copre tutto.
    expect(svRows + validPresences).toBe(12 * 38);
  });

  it("i due giocatori interamente SV hanno N = 0, T1 = 0 e T2 INDEFINITO — mai 0", () => {
    const world = svCoercionCanary(31);
    expect(world.allSvPlayers).toHaveLength(2);
    for (const playerKey of world.allSvPlayers) {
      const row = world.panel.find((candidate) => candidate.playerKey === playerKey)!;
      expect(row.presenze).toBe(0);
      expect(row.totFantavoto).toBe(0);
      expect(row.fantamedia).toBeNull();
      expect(row.mediaVotoBase).toBeNull();
    }
  });
});

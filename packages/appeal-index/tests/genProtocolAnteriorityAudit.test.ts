import { describe, it, expect } from "vitest";
import {
  GEN_CANARY_FAKE_PLAYERS,
  GenLeakageGuardError,
  assertNoGenLeakage,
  auditAnteriority,
  nextSeason,
  runLeakCanary,
} from "../src/genProtocol/anteriorityAudit.js";
import { buildGenFeatureRows } from "../src/genProtocol/featureCatalog.js";
import { leakCanaryWorld } from "../src/genProtocol/syntheticWorld.js";
import type { GenFeatureRow, GenSeason } from "../src/genProtocol/genTypes.js";

function row(overrides: Partial<GenFeatureRow> = {}): GenFeatureRow {
  return {
    playerKey: "PK",
    role: "C",
    targetSeason: "2019_20",
    features: { fantamediaLag1: 6 },
    sourceSeasons: ["2017_18", "2018_19"],
    recencyWeight: 1,
    presenceWeight: 10,
    targets: { tN: 10, t1: 60, t2: 6, t2Weight: 10, tDBinCounts: null },
    ...overrides,
  };
}

describe("genProtocol/anteriorityAudit — §G.2, la riverifica per riga", () => {
  it("una riga pulita passa e viene contata", () => {
    const report = auditAnteriority([row(), row({ playerKey: "PK2" })]);
    expect(report.righeVerificate).toBe(2);
    expect(report.violazioni).toEqual([]);
    expect(() => assertNoGenLeakage([row()])).not.toThrow();
  });

  it("INTERCETTA una stagione sorgente pari al target — la violazione indotta a mano", () => {
    const report = auditAnteriority([row({ sourceSeasons: ["2018_19", "2019_20"] })]);
    expect(report.violazioni).toHaveLength(1);
    expect(report.violazioni[0]!.kind).toBe("SOURCE_SEASON_NOT_BEFORE_TARGET");
    expect(() => assertNoGenLeakage([row({ sourceSeasons: ["2019_20"] })])).toThrow(GenLeakageGuardError);
  });

  it("INTERCETTA una stagione sorgente SUCCESSIVA al target", () => {
    const report = auditAnteriority([row({ sourceSeasons: ["2018_19", "2020_21"] })]);
    expect(report.violazioni.some((v) => v.kind === "SOURCE_SEASON_NOT_BEFORE_TARGET")).toBe(true);
  });

  it("INTERCETTA una traccia d'audit vuota o disordinata: senza traccia non c'e' verifica", () => {
    expect(auditAnteriority([row({ sourceSeasons: [] })]).violazioni[0]!.kind).toBe("EMPTY_SOURCE_SEASONS");
    expect(
      auditAnteriority([row({ sourceSeasons: ["2018_19", "2017_18"] })]).violazioni.some(
        (v) => v.kind === "SOURCE_SEASONS_NOT_SORTED",
      ),
    ).toBe(true);
  });

  it("nextSeason calcola l'etichetta canonica, anche a cavallo del secolo", () => {
    expect(nextSeason("2018_19")).toBe("2019_20");
    expect(nextSeason("2024_25")).toBe("2025_26");
    expect(nextSeason("2098_99")).toBe("2099_00");
  });
});

describe("genProtocol/anteriorityAudit — §G.4, il canarino di protocollo", () => {
  const world = leakCanaryWorld(7);
  const targetSeason: GenSeason = world.seasons[world.seasons.length - 2]!;

  it("tre giocatori finti: il conteggio e' quello di §G.4", () => {
    expect(GEN_CANARY_FAKE_PLAYERS).toBe(3);
  });

  it("un builder PULITO passa il canarino: nessuna riga del passato cambia di un bit", () => {
    const report = runLeakCanary(world.panel, (panel) => buildGenFeatureRows(panel, "S2", targetSeason));
    expect(report.violazioni).toEqual([]);
    expect(report.righeVerificate).toBeGreaterThan(50);
  });

  it("il canarino CANTA su un builder che guarda il futuro — violazione indotta", () => {
    // Builder difettoso apposta: aggiunge una feature che dipende dall'INTERO
    // panel — quindi anche dalle stagioni successive al target. E' la forma
    // piu' comune di leakage silenzioso (una normalizzazione, un rango, una
    // media «di popolazione» calcolata su tutto), e §G.4 e' scritto per questa.
    const leaky = (panel: Parameters<typeof buildGenFeatureRows>[0]): readonly GenFeatureRow[] =>
      buildGenFeatureRows(panel, "S2", targetSeason).map((r) => ({
        ...r,
        features: { ...r.features, quotaSuPanelIntero: r.targets.tN / panel.length },
      }));
    const report = runLeakCanary(world.panel, leaky);
    expect(report.violazioni.length).toBeGreaterThan(0);
    expect(report.violazioni[0]!.kind).toBe("CANARY_ROW_CHANGED");
  });

  it("le righe del passato restano identiche anche iniettando la stagione futura del mondo", () => {
    const before = buildGenFeatureRows(world.panel, "S2", targetSeason);
    const after = buildGenFeatureRows([...world.panel, ...world.futureRows], "S2", targetSeason);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });
});

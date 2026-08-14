import { describe, it, expect } from "vitest";
import {
  runAppealIndexPipeline,
  renderAppealIndexReportMarkdown,
  type RunAppealIndexPipelineOptions,
} from "../src/report.js";
import type { SeasonRecords } from "../src/dataset.js";
import { buildStableCohortSeasons, buildSyntheticAnagraficaForSeasons } from "../fixtures/syntheticSeasons.js";

// `ageAtSeasonStart` (@2.2.0) is part of the pooled vector, so a fixture run
// without an anagrafica would leave every row incomplete and every comparator
// empty. One fully-covered synthetic index, reused by every call below, keeps
// these tests about the report rather than about coverage — that is what
// anagraficaCoverage.test.ts covers.
const SYNTHETIC_ANAGRAFICA = buildSyntheticAnagraficaForSeasons(buildStableCohortSeasons());

function runPipeline(seasons: readonly SeasonRecords[], opts: RunAppealIndexPipelineOptions = {}) {
  return runAppealIndexPipeline(seasons, { anagrafica: SYNTHETIC_ANAGRAFICA, ...opts });
}

describe("runAppealIndexPipeline", () => {
  const seasons = buildStableCohortSeasons();
  const report = runPipeline(seasons, { datasetProvenance: "synthetic_fixture" });

  it("never sets any gate and is never connected to the live app", () => {
    expect(report.gateStatus).toEqual({
      dataPromoted: false,
      canonicalPromoted: false,
      decisionPromoted: false,
      fairToMePromoted: false,
      connectedToLiveApp: false,
    });
  });

  it("includes the Id/Cod. stability verdict", () => {
    expect(report.identity.verdict).toBe("stable");
  });

  it("reports both targets with a diagnostic comparator and at least one fold", () => {
    for (const target of ["fantamediaNext", "presenzeNext"] as const) {
      const t = report.perTarget[target];
      expect(t.nFolds).toBeGreaterThan(0);
      expect(t.results.length).toBeGreaterThan(0);
      expect(typeof t.diagnosticComparatorName).toBe("string");
    }
  });

  it("keeps the baseline as a fixture-only diagnostic comparator", () => {
    // Documents the actual, non-cherry-picked outcome on this fixture — see
    // docs/data/APPEAL_INDEX_OFFLINE_ML_CONTRACT.md "il ML potrebbe non servire".
    expect(report.perTarget.fantamediaNext.diagnosticComparatorIsBaseline).toBe(true);
    expect(report.perTarget.presenzeNext.diagnosticComparatorIsBaseline).toBe(true);
  });

  it("does not silently treat the latest fixture season as a holdout", () => {
    expect(report.datasetSummary.holdoutSeason).toBeNull();
    expect(report.perTarget.fantamediaNext.holdout.season).toBeNull();
  });

  it("produces illustrative components without validation claims", () => {
    expect(report.sampleComponents.length).toBeGreaterThan(0);
    for (const sample of report.sampleComponents) {
      expect(sample.components.appetibilitaBase.validated).toBe(false);
      expect(sample.components.affidabilita.validated).toBe(false);
    }
  });

  it("is fully deterministic across repeated runs on the same input", () => {
    const again = runPipeline(seasons, { datasetProvenance: "synthetic_fixture" });
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  });

  it("throws a clear error instead of silently producing an empty report on too little data", () => {
    const tooShort = seasons.slice(0, 1);
    expect(() => runPipeline(tooShort)).toThrow();
  });

  it("sampleSize: 0 computes zero sample rows (safe mode never even builds a real playerKey list)", () => {
    const safeReport = runPipeline(seasons, { datasetProvenance: "synthetic_fixture", sampleSize: 0 });
    expect(safeReport.sampleComponents).toEqual([]);
  });

  it("a negative sampleSize is treated the same as 0 (no samples), not as slice(-N) from the end", () => {
    const safeReport = runPipeline(seasons, { datasetProvenance: "synthetic_fixture", sampleSize: -1 });
    expect(safeReport.sampleComponents).toEqual([]);
  });
});

describe("renderAppealIndexReportMarkdown", () => {
  const report = runPipeline(buildStableCohortSeasons(), { datasetProvenance: "synthetic_fixture" });
  const markdown = renderAppealIndexReportMarkdown(report);

  it("mentions the Id/Cod. verdict and every target", () => {
    expect(markdown).toContain("Verifica stabilità Id/Cod.");
    expect(markdown).toContain("fantamediaNext");
    expect(markdown).toContain("presenzeNext");
  });

  it("declares gate status explicitly in the rendered text", () => {
    expect(markdown).toContain("data_promoted=false");
    expect(markdown).toContain("connected_to_live_app=false");
  });

  it("never contains a literal 'undefined' or 'NaN' string (a formatting/data gap)", () => {
    expect(markdown).not.toContain("undefined");
    expect(markdown).not.toMatch(/\bNaN\b/);
  });

  it("by default includes the per-player sample section with real playerKeys (fixture-only demo behavior)", () => {
    expect(report.sampleComponents.length).toBeGreaterThan(0);
    expect(markdown).toContain("## Componenti indice (esempio, dati sintetici)");
    for (const sample of report.sampleComponents) {
      expect(markdown).toContain(sample.playerKey);
    }
  });
});

describe("renderAppealIndexReportMarkdown — safe/identity-only mode (includeSamples: false)", () => {
  const seasons = buildStableCohortSeasons();
  // Full (unsafe) report still carries sampleComponents in-memory here —
  // this test proves the RENDER-time guard alone is enough to keep every
  // playerKey out of the printed text, as a second, independent layer of
  // defense on top of runAppealIndexPipeline's sampleSize:0 (see the
  // pipeline describe block above).
  const report = runPipeline(seasons, { datasetProvenance: "synthetic_fixture" });
  const safeMarkdown = renderAppealIndexReportMarkdown(report, { includeSamples: false });

  it("never prints any real sampleComponents playerKey", () => {
    expect(report.sampleComponents.length).toBeGreaterThan(0); // sanity: there ARE samples to leak
    for (const sample of report.sampleComponents) {
      expect(safeMarkdown).not.toContain(sample.playerKey);
    }
  });

  it("omits the per-player sample section entirely and explains why", () => {
    expect(safeMarkdown).not.toContain("## Componenti indice (esempio, dati sintetici)");
    expect(safeMarkdown).toContain("## Componenti indice (esempio)");
    expect(safeMarkdown).toContain("Omesso in modalità identity-only/safe");
  });

  it("still includes every aggregate identity-stability field", () => {
    expect(safeMarkdown).toContain("Verifica stabilità Id/Cod.");
    expect(safeMarkdown).toContain(`Verdetto: **${report.identity.verdict}**`);
    expect(safeMarkdown).toContain(`stableMatchRate=`);
    expect(safeMarkdown).toContain(`driftRate=`);
    expect(safeMarkdown).toContain(`collisionRate=`);
    expect(safeMarkdown).toContain(`withinSeasonCollisions=${report.identity.withinSeasonCollisions}`);
  });

  it("still declares gate status and dataset/target sections (aggregate-only, safe either way)", () => {
    expect(safeMarkdown).toContain("data_promoted=false");
    expect(safeMarkdown).toContain("connected_to_live_app=false");
    expect(safeMarkdown).toContain("fantamediaNext");
    expect(safeMarkdown).toContain("presenzeNext");
  });

  it("combined with sampleSize:0 upstream, produces a report with no sampleComponents to begin with", () => {
    const safeReport = runPipeline(seasons, { datasetProvenance: "synthetic_fixture", sampleSize: 0 });
    const fullySafeMarkdown = renderAppealIndexReportMarkdown(safeReport, { includeSamples: false });
    expect(safeReport.sampleComponents).toEqual([]);
    expect(fullySafeMarkdown).not.toContain("### "); // no per-player subheading at all
  });
});

describe("renderAppealIndexReportMarkdown — dataset provenance", () => {
  const seasons = buildStableCohortSeasons();

  it("labels an explicitly synthetic fixture and keeps every gate OFF", () => {
    const report = runPipeline(seasons, {
      datasetProvenance: "synthetic_fixture",
      sampleSize: 0,
    });
    const rendered = renderAppealIndexReportMarkdown(report, { includeSamples: false });
    expect(rendered).toContain("report offline (SINTETICO)");
    expect(rendered).toContain("fixture sintetica dichiarata dal chiamante");
    expect(Object.values(report.gateStatus).every((value) => value === false)).toBe(true);
  });

  it("labels explicitly external/real data without synthetic claims and keeps every gate OFF", () => {
    const report = runPipeline(seasons, {
      datasetProvenance: "external_real",
      sampleSize: 0,
    });
    const rendered = renderAppealIndexReportMarkdown(report, { includeSamples: false });
    expect(rendered).toContain("DATI ESTERNI/REALI — DICHIARATI DAL CHIAMANTE");
    expect(rendered).not.toContain("(SINTETICO)");
    expect(rendered).not.toContain("Dataset costruito solo su fixture sintetiche");
    expect(rendered).not.toContain("nessuna esecuzione su dati reali");
    expect(Object.values(report.gateStatus).every((value) => value === false)).toBe(true);
  });

  it("fails closed when provenance is absent instead of claiming real data", () => {
    const report = runPipeline(seasons, { sampleSize: 0 });
    const rendered = renderAppealIndexReportMarkdown(report, { includeSamples: false });
    expect(report.datasetProvenance).toBe("unknown");
    expect(rendered).toContain("PROVENIENZA NON DICHIARATA");
    expect(rendered).not.toContain("(SINTETICO)");
    expect(rendered).not.toContain("DATI ESTERNI/REALI");
    expect(Object.values(report.gateStatus).every((value) => value === false)).toBe(true);
  });
});

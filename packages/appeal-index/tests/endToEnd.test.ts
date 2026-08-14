// End-to-end pipeline tests — the strongest anti-leakage proof in this test
// suite: it does not just check FeatureRow.sourceSeasons bookkeeping (see
// dataset.test.ts), it proves that mutating the raw vote data of the FINAL
// season leaves every walk-forward fold's result byte-identical, because no
// fold's train/test rows ever depend on that season — only the (separately
// reported) holdout fold does.

import { describe, it, expect } from "vitest";
import { buildStableCohortSeasons, buildSyntheticAnagraficaForSeasons } from "../fixtures/syntheticSeasons.js";
import { runAppealIndexPipeline } from "../src/report.js";
import type { SeasonRecords } from "../src/dataset.js";
import type { VoteRecordCandidate } from "../src/types.js";

// One fully-covered synthetic anagrafica for `ageAtSeasonStart` (@2.2.0),
// shared by the poisoned and unpoisoned runs. It is deliberately the SAME
// index for both: mutating the final season's vote data must not change the
// cohort's identities, so an age that moved between the two runs would be a
// finding, not a fixture detail.
const SYNTHETIC_ANAGRAFICA = buildSyntheticAnagraficaForSeasons(buildStableCohortSeasons());

function runPipeline(seasons: readonly SeasonRecords[]) {
  return runAppealIndexPipeline(seasons, { anagrafica: SYNTHETIC_ANAGRAFICA });
}

function mutateFinalSeason(seasons: readonly SeasonRecords[]): SeasonRecords[] {
  const lastSeason = [...seasons].map((s) => s.season).sort().at(-1)!;
  return seasons.map((s) => {
    if (s.season !== lastSeason) return s;
    const mutatedRecords: VoteRecordCandidate[] = s.records.map((r) => ({
      ...r,
      voto_base: r.voto_base !== null ? 9.5 : r.voto_base,
      voto_raw: r.voto_base !== null ? 9.5 : r.voto_raw,
      Gf: 5,
      Ass: 5,
    }));
    return { season: s.season, records: mutatedRecords };
  });
}

describe("end-to-end anti-leakage proof", () => {
  const original = buildStableCohortSeasons();
  const mutated = mutateFinalSeason(original);
  const reportOriginal = runPipeline(original);
  const reportMutated = runPipeline(mutated);

  it("Id/Cod. identity analysis is unaffected by performance data in the final season", () => {
    expect(reportMutated.identity).toEqual(reportOriginal.identity);
  });

  it("every walk-forward fold result is IDENTICAL whether or not the final season's data was poisoned", () => {
    const withoutFinal = (result: typeof reportOriginal.perTarget.fantamediaNext.results) =>
      result.map((candidate) =>
        candidate.perFold.filter((fold) => fold.testSeason !== "2024_25"),
      );
    expect(withoutFinal(reportMutated.perTarget.fantamediaNext.results)).toEqual(
      withoutFinal(reportOriginal.perTarget.fantamediaNext.results),
    );
  });

  it("the (separately reported) HOLDOUT metrics DO change — proving the mutation actually reached the pipeline", () => {
    const before = reportOriginal.perTarget.fantamediaNext.results[0]!.perFold.at(-1)!;
    const after = reportMutated.perTarget.fantamediaNext.results[0]!.perFold.at(-1)!;
    expect(after.mae).toBeGreaterThan(before.mae * 10);
  });
});

describe("end-to-end determinism", () => {
  it("running the full pipeline twice on the same input yields byte-identical output", () => {
    const seasons = buildStableCohortSeasons();
    const a = runPipeline(seasons);
    const b = runPipeline(seasons);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("end-to-end gate/scope invariants", () => {
  it("never activates any repo gate and is never marked as connected to the live app", () => {
    const report = runPipeline(buildStableCohortSeasons());
    expect(Object.values(report.gateStatus).every((v) => v === false)).toBe(true);
  });

  it("declares at least one non-empty limits/risks entry", () => {
    const report = runPipeline(buildStableCohortSeasons());
    expect(report.limits.length).toBeGreaterThan(0);
    expect(report.limits.every((l) => l.length > 0)).toBe(true);
  });
});

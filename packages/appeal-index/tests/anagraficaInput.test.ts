import { describe, expect, it } from "vitest";
import {
  ANAGRAFICA_INDEX_VERSION,
  assertAnagraficaSuperset,
  countAnagraficaEntries,
  mergeAnagraficaIndexes,
  parseAnagraficaIndex,
  readAnagraficaFromDataset,
  resolvedSubjectKeys,
  serializeAnagraficaIndex,
} from "../src/anagraficaInput.js";

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    anagraficaVersion: ANAGRAFICA_INDEX_VERSION,
    resolutionVersion: "wikidata-anagrafica-resolution-v1",
    referenceDateType: "SEASON_START_DATE",
    ageBySeason: { "2019_20": { "id:201": 28 }, "2020_21": { "id:201": 29 } },
    ...overrides,
  };
}

describe("parseAnagraficaIndex", () => {
  it("accepts a well-formed block and preserves season/player structure", () => {
    const index = parseAnagraficaIndex(valid());
    expect(index.get("2019_20")?.get("id:201")).toBe(28);
    expect(index.get("2020_21")?.get("id:201")).toBe(29);
  });

  it("refuses an unknown version rather than guessing the shape", () => {
    expect(() => parseAnagraficaIndex(valid({ anagraficaVersion: "v2" }))).toThrow(/unsupported anagraficaVersion/);
  });

  it("refuses a reference date type other than SEASON_START_DATE", () => {
    expect(() => parseAnagraficaIndex(valid({ referenceDateType: "OBSERVATION_DATE" }))).toThrow(
      /SEASON_START_DATE/,
    );
  });

  it("refuses a missing resolutionVersion — the upstream policy must be identifiable", () => {
    expect(() => parseAnagraficaIndex(valid({ resolutionVersion: "" }))).toThrow(/resolutionVersion missing/);
  });

  it.each([
    ["a non-integer age", 28.5],
    ["a negative age", -1],
    ["an implausibly small age", 3],
    ["an implausibly large age", 120],
    ["a NaN age", Number.NaN],
    ["a string age", "28"],
  ])("refuses %s instead of coercing or clamping it", (_label, age) => {
    expect(() => parseAnagraficaIndex(valid({ ageBySeason: { "2019_20": { "id:1": age } } }))).toThrow(
      /ANAGRAFICA_INDEX_SCHEMA/,
    );
  });

  it("refuses an array where an object is required", () => {
    expect(() => parseAnagraficaIndex(valid({ ageBySeason: [] }))).toThrow(/ageBySeason must be an object/);
    expect(() => parseAnagraficaIndex(valid({ ageBySeason: { "2019_20": [] } }))).toThrow(/must be an object/);
  });

  it("refuses an empty season or player key", () => {
    expect(() => parseAnagraficaIndex(valid({ ageBySeason: { "": { "id:1": 28 } } }))).toThrow(/empty season key/);
    expect(() => parseAnagraficaIndex(valid({ ageBySeason: { "2019_20": { "": 28 } } }))).toThrow(/empty playerKey/);
  });
});

describe("readAnagraficaFromDataset", () => {
  it("treats an absent block as absent — a dataset built before the pilot is not an error", () => {
    expect(readAnagraficaFromDataset({ seasons: [] })).toBeUndefined();
    expect(readAnagraficaFromDataset({ seasons: [], anagrafica: null })).toBeUndefined();
    expect(readAnagraficaFromDataset("not an object")).toBeUndefined();
  });

  it("never tolerates a present-but-malformed block", () => {
    expect(() => readAnagraficaFromDataset({ seasons: [], anagrafica: { anagraficaVersion: "wrong" } })).toThrow(
      /ANAGRAFICA_INDEX_SCHEMA/,
    );
  });

  it("round-trips through serialize with stable, sorted bytes", () => {
    const index = new Map([
      ["2020_21", new Map([["id:9", 21], ["id:1", 30]])],
      ["2019_20", new Map([["id:1", 29]])],
    ]);
    const serialized = serializeAnagraficaIndex(index, "wikidata-anagrafica-resolution-v1");
    expect(Object.keys(serialized.ageBySeason)).toEqual(["2019_20", "2020_21"]);
    expect(Object.keys(serialized.ageBySeason["2020_21"]!)).toEqual(["id:1", "id:9"]);
    expect(JSON.stringify(serialized)).toBe(
      JSON.stringify(serializeAnagraficaIndex(index, "wikidata-anagrafica-resolution-v1")),
    );
    const parsed = readAnagraficaFromDataset({ seasons: [], anagrafica: serialized });
    expect(parsed?.get("2020_21")?.get("id:9")).toBe(21);
  });

  it("carries no QID, birth date, statement or observation payload — only ages", () => {
    const serialized = serializeAnagraficaIndex(new Map([["2019_20", new Map([["id:1", 29]])]]), "v1");
    // The block is exactly four fields, three of them metadata. Asserted as a
    // whole rather than by keyword so a future field carrying real Wikidata
    // payload into the repository has to be added here deliberately.
    expect(Object.keys(serialized).sort()).toEqual([
      "ageBySeason",
      "anagraficaVersion",
      "referenceDateType",
      "resolutionVersion",
    ]);
    expect(Object.values(serialized.ageBySeason["2019_20"]!).every((value) => typeof value === "number")).toBe(true);
    const text = JSON.stringify(serialized);
    expect(text).not.toMatch(/\bQ\d+\b/);
    expect(text).not.toMatch(/birthDate|statement|observedAt|wikidataEntityId/i);
  });
});

describe("a deposit that grows across authorized slices", () => {
  const base = new Map<string, ReadonlyMap<string, number>>([
    ["2019_20", new Map([["id:1", 28], ["id:2", 24]])],
    ["2020_21", new Map([["id:1", 29]])],
  ]);

  it("counts every (season, player) pair, not just the seasons", () => {
    expect(countAnagraficaEntries(base)).toBe(3);
    expect(countAnagraficaEntries(new Map())).toBe(0);
  });

  it("reports every subject already resolved, across all seasons", () => {
    expect([...resolvedSubjectKeys(base)].sort()).toEqual(["id:1", "id:2"]);
  });

  it("merges a later slice into a genuine superset of both", () => {
    const addition = new Map<string, ReadonlyMap<string, number>>([
      ["2020_21", new Map([["id:3", 20]])],
      ["2021_22", new Map([["id:3", 21]])],
    ]);
    const merged = mergeAnagraficaIndexes(base, addition);
    expect(countAnagraficaEntries(merged)).toBe(5);
    expect(merged.get("2020_21")?.get("id:1")).toBe(29);
    expect(merged.get("2020_21")?.get("id:3")).toBe(20);
    // The bytes do not depend on which slice resolved what: the same entries
    // arriving in the other order serialize identically.
    expect(JSON.stringify(serializeAnagraficaIndex(merged, "v1"))).toBe(
      JSON.stringify(serializeAnagraficaIndex(mergeAnagraficaIndexes(addition, base), "v1")),
    );
  });

  it("refuses a merge that would change an age already deposited", () => {
    // A birth date is static, so this is a wrong resolution somewhere, never an
    // update — silently keeping either value would put an unexplained number
    // into the model.
    const conflicting = new Map<string, ReadonlyMap<string, number>>([["2019_20", new Map([["id:1", 31]])]]);
    expect(() => mergeAnagraficaIndexes(base, conflicting)).toThrow(/ANAGRAFICA_INDEX_AGE_CONFLICT/);
  });

  it("refuses a candidate that dropped a season or a player of the base", () => {
    const lostSeason = new Map([["2019_20", new Map([["id:1", 28], ["id:2", 24]])]]);
    expect(() => assertAnagraficaSuperset(base, lostSeason, "t")).toThrow(/ANAGRAFICA_INDEX_NOT_A_SUPERSET/);
    const lostPlayer = new Map([
      ["2019_20", new Map([["id:1", 28]])],
      ["2020_21", new Map([["id:1", 29]])],
    ]);
    expect(() => assertAnagraficaSuperset(base, lostPlayer, "t")).toThrow(/ANAGRAFICA_INDEX_NOT_A_SUPERSET/);
    expect(() => assertAnagraficaSuperset(base, base, "t")).not.toThrow();
  });
});

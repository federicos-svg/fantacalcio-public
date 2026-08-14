import { describe, it, expect } from "vitest";
import { findDuplicateEnrichmentListoneIds, indexListoneCandidatesById } from "../src/duplicates.js";
import type { EnrichmentRecord, ListoneCandidate } from "../src/types.js";

// All fixtures below are synthetic — no real player/team names anywhere.
function record(listoneId: string): EnrichmentRecord {
  return {
    listoneId,
    nome: "Synth Testman",
    ruolo: "A",
    squadraAttuale: "Synthopoli",
    titolaritaPrevista: "titolare",
    injuryFlag: "nessuno",
    source: "synthetic_source_a",
    sourceMethod: "manual_file",
    confidence: "alta",
    updatedAt: "2026-07-10",
  };
}

function candidate(listoneId: string, name = "Synth Testman"): ListoneCandidate {
  return { listoneId, name, role: "A", team: "Synthopoli" };
}

describe("findDuplicateEnrichmentListoneIds", () => {
  it("finds no duplicates when every listoneId is unique", () => {
    const found = findDuplicateEnrichmentListoneIds([record("1"), record("2"), record("3")]);
    expect(found.size).toBe(0);
  });

  it("finds a listoneId repeated across enrichment rows, never deduplicating silently", () => {
    const found = findDuplicateEnrichmentListoneIds([record("1"), record("2"), record("1")]);
    expect(found.has("1")).toBe(true);
    expect(found.has("2")).toBe(false);
    expect(found.size).toBe(1);
  });
});

describe("indexListoneCandidatesById", () => {
  it("indexes zero candidates for an id absent from the caller-supplied list", () => {
    const index = indexListoneCandidatesById([candidate("1")]);
    expect(index.get("2")).toBeUndefined();
  });

  it("indexes exactly one candidate", () => {
    const index = indexListoneCandidatesById([candidate("1")]);
    expect(index.get("1")?.length).toBe(1);
  });

  it("indexes more than one candidate sharing the same listoneId, never picking one", () => {
    const index = indexListoneCandidatesById([candidate("1", "Synth A"), candidate("1", "Synth B")]);
    expect(index.get("1")?.length).toBe(2);
  });
});

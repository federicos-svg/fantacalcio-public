import { describe, it, expect } from "vitest";
import { runManualEnrichmentPipeline } from "../src/pipeline.js";
import { MANDATORY_COLUMNS } from "../src/sheetReader.js";
import type { ListoneCandidate, ManualEnrichmentOptions, SheetRow, Workbook } from "../src/types.js";

// All fixtures below are synthetic — no real player/team names anywhere.
// Synthetic allowlist for this test file only, not a claim about any real
// registered source.
const OPTIONS: ManualEnrichmentOptions = { allowedSources: new Set(["synthetic_source_a"]) };

const HEADER: SheetRow = [...MANDATORY_COLUMNS];

const ROW_VALID = ["101", "Synth Testman", "A", "Synthopoli", "titolare", "nessuno", "synthetic_source_a", "manual_file", "alta", "2026-07-10"];
const ROW_TEAM_CHANGE = ["102", "Synth Voyager", "D", "Synthopoli", "ballottaggio", "dubbio", "synthetic_source_a", "manual_file", "media", "2026-07-10"];
const ROW_MISSING_SOURCE = ["103", "Synth Ranger", "C", "Synthopoli", "riserva", "ignoto", "", "manual_file", "bassa", "2026-07-10"];
const ROW_NO_CANDIDATE = ["104", "Synth Nomad", "A", "Synthopoli", "titolare", "nessuno", "synthetic_source_a", "manual_file", "alta", "2026-07-10"];
const ROW_AMBIGUOUS_ID = ["105", "Synth Drifter", "A", "Synthopoli", "titolare", "nessuno", "synthetic_source_a", "manual_file", "alta", "2026-07-10"];
const ROW_DUP_A = ["106", "Synth Echo A", "P", "Synthopoli", "titolare", "nessuno", "synthetic_source_a", "manual_file", "alta", "2026-07-10"];
const ROW_DUP_B = ["106", "Synth Echo B", "P", "Synthopoli", "titolare", "nessuno", "synthetic_source_a", "manual_file", "alta", "2026-07-10"];
const EMPTY_ROW: SheetRow = new Array(HEADER.length).fill(null);

const WORKBOOK: Workbook = [
  {
    name: "Enrichment",
    rows: [
      HEADER,
      ROW_VALID,
      ROW_TEAM_CHANGE,
      ROW_MISSING_SOURCE,
      ROW_NO_CANDIDATE,
      ROW_AMBIGUOUS_ID,
      ROW_DUP_A,
      ROW_DUP_B,
      EMPTY_ROW,
    ],
  },
];

const CANDIDATES: readonly ListoneCandidate[] = [
  { listoneId: "101", name: "Synth Testman", role: "A", team: "Synthopoli" },
  { listoneId: "102", name: "Synth Voyager", role: "D", team: "Altrove FC" }, // team differs -> transfer
  { listoneId: "103", name: "Synth Ranger", role: "C", team: "Synthopoli" },
  // no candidate for 104 on purpose
  { listoneId: "105", name: "Synth Drifter A", role: "A", team: "Synthopoli" },
  { listoneId: "105", name: "Synth Drifter B", role: "A", team: "Synthopoli" }, // two candidates, same id
  { listoneId: "106", name: "Synth Echo", role: "P", team: "Synthopoli" },
];

describe("runManualEnrichmentPipeline — end-to-end su fixture sintetiche", () => {
  it("processes every non-empty data row and skips the fully-empty one", () => {
    const result = runManualEnrichmentPipeline(WORKBOOK, CANDIDATES, OPTIONS);
    expect(result.headerIssues).toEqual([]);
    expect(result.rows.length).toBe(7);
    expect(result.report.emptyRowsSkipped).toBe(1);
    expect(result.report.totalRowsRead).toBe(8);
  });

  it("a fully valid, exactly-matching row -> valid", () => {
    const result = runManualEnrichmentPipeline(WORKBOOK, CANDIDATES, OPTIONS);
    const row101 = result.rows.find((r) => r.record?.listoneId === "101");
    expect(row101?.status).toBe("valid");
    expect(row101?.join?.identityOutcome).toBe("accept_candidate");
  });

  it("a team-only mismatch (transfer) -> warning, never silently valid", () => {
    const result = runManualEnrichmentPipeline(WORKBOOK, CANDIDATES, OPTIONS);
    const row102 = result.rows.find((r) => r.record?.listoneId === "102");
    expect(row102?.status).toBe("warning");
  });

  it("a missing mandatory field -> invalid, record:null, no join ever attempted", () => {
    const result = runManualEnrichmentPipeline(WORKBOOK, CANDIDATES, OPTIONS);
    // ROW_MISSING_SOURCE is the 3rd data row after the header -> sheet row 4.
    // Looked up by rowRef, not by record.listoneId: record is null for this
    // row (see fieldValidation.ts), so a record?.listoneId-based lookup
    // would silently match nothing.
    const row103 = result.rows.find((r) => r.rowRef === 4);
    expect(row103?.status).toBe("invalid");
    expect(row103?.record).toBeNull();
    expect(row103?.join).toBeUndefined();
    expect(row103?.issues.some((i) => i.code === "missing_field" && i.field === "source")).toBe(true);
  });

  it("zero listone candidates -> requires_manual_review, never a name-based fallback", () => {
    const result = runManualEnrichmentPipeline(WORKBOOK, CANDIDATES, OPTIONS);
    const row104 = result.rows.find((r) => r.record?.listoneId === "104");
    expect(row104?.status).toBe("requires_manual_review");
    expect(row104?.join?.matchCount).toBe(0);
  });

  it("more than one listone candidate for the same id -> ambiguous", () => {
    const result = runManualEnrichmentPipeline(WORKBOOK, CANDIDATES, OPTIONS);
    const row105 = result.rows.find((r) => r.record?.listoneId === "105");
    expect(row105?.status).toBe("ambiguous");
    expect(row105?.join?.matchCount).toBe(2);
  });

  it("duplicate enrichment rows sharing a listoneId -> both routed to requires_manual_review, never one silently promoted valid", () => {
    const result = runManualEnrichmentPipeline(WORKBOOK, CANDIDATES, OPTIONS);
    const dupRows = result.rows.filter((r) => r.record?.listoneId === "106");
    expect(dupRows.length).toBe(2);
    for (const r of dupRows) {
      expect(r.status).toBe("requires_manual_review");
      expect(r.issues.some((i) => i.code === "duplicate_listone_id_in_enrichment")).toBe(true);
    }
  });

  it("aggregate report reflects the mix of outcomes with no dataset leaking into it", () => {
    const result = runManualEnrichmentPipeline(WORKBOOK, CANDIDATES, OPTIONS);
    const { report } = result;
    expect(report.countsByStatus.valid).toBe(1);
    expect(report.countsByStatus.warning).toBe(1);
    expect(report.countsByStatus.invalid).toBe(1);
    expect(report.countsByStatus.requires_manual_review).toBe(3); // 104 + the two duplicate 106 rows
    expect(report.countsByStatus.ambiguous).toBe(1);
    expect(report.gatesPromoted).toBe(false);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("Synth");
    expect(serialized).not.toContain("Synthopoli");
  });
});

describe("runManualEnrichmentPipeline — source non registrata", () => {
  it("a source outside options.allowedSources -> invalid, record:null, never silently valid", () => {
    const rowUnregisteredSource = [
      "999",
      "Synth Outsider",
      "A",
      "Synthopoli",
      "titolare",
      "nessuno",
      "not_a_registered_source",
      "manual_file",
      "alta",
      "2026-07-10",
    ];
    const workbook: Workbook = [{ name: "Enrichment", rows: [HEADER, rowUnregisteredSource] }];
    const result = runManualEnrichmentPipeline(workbook, CANDIDATES, OPTIONS);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]?.status).toBe("invalid");
    expect(result.rows[0]?.record).toBeNull();
    expect(result.rows[0]?.issues.some((i) => i.code === "unregistered_source")).toBe(true);
  });

  it("the same workbook with a wider allowedSources accepts the row — pipeline behavior tracks the caller's allowlist, not a hardcoded one", () => {
    const rowOtherSource = [
      "999",
      "Synth Outsider",
      "A",
      "Synthopoli",
      "titolare",
      "nessuno",
      "another_source",
      "manual_file",
      "alta",
      "2026-07-10",
    ];
    const workbook: Workbook = [{ name: "Enrichment", rows: [HEADER, rowOtherSource] }];
    const widerOptions: ManualEnrichmentOptions = { allowedSources: new Set(["synthetic_source_a", "another_source"]) };
    const result = runManualEnrichmentPipeline(workbook, [], widerOptions);
    expect(result.rows[0]?.record).not.toBeNull();
    expect(result.rows[0]?.issues.some((i) => i.code === "unregistered_source")).toBe(false);
  });
});

describe("runManualEnrichmentPipeline — header non valido", () => {
  it("missing mandatory column -> no rows parsed, header issue reported", () => {
    const badHeader: SheetRow = MANDATORY_COLUMNS.filter((c) => c !== "ruolo");
    const workbook: Workbook = [{ name: "Enrichment", rows: [badHeader, ROW_VALID] }];
    const result = runManualEnrichmentPipeline(workbook, CANDIDATES, OPTIONS);
    expect(result.headerIssues.some((i) => i.code === "missing_mandatory_column" && i.field === "ruolo")).toBe(true);
    expect(result.rows).toEqual([]);
    expect(result.report.headerValid).toBe(false);
  });

  it("duplicated column header -> no rows parsed, header issue reported", () => {
    const badHeader: SheetRow = [...MANDATORY_COLUMNS, "nome"];
    const workbook: Workbook = [{ name: "Enrichment", rows: [badHeader, ROW_VALID] }];
    const result = runManualEnrichmentPipeline(workbook, CANDIDATES, OPTIONS);
    expect(result.headerIssues.some((i) => i.code === "duplicate_column_header" && i.field === "nome")).toBe(true);
    expect(result.rows).toEqual([]);
  });

  it("an empty workbook produces a header issue, never a crash", () => {
    const result = runManualEnrichmentPipeline([], CANDIDATES, OPTIONS);
    expect(result.headerIssues.length).toBeGreaterThan(0);
    expect(result.rows).toEqual([]);
  });
});

describe("runManualEnrichmentPipeline — determinismo e nessuna canonicalizzazione", () => {
  it("same input always yields the same output", () => {
    const first = runManualEnrichmentPipeline(WORKBOOK, CANDIDATES, OPTIONS);
    const second = runManualEnrichmentPipeline(WORKBOOK, CANDIDATES, OPTIONS);
    expect(first).toEqual(second);
  });

  it("never carries canonical_player_id/canonical_team_id/isCanonical:true anywhere in the result", () => {
    const result = runManualEnrichmentPipeline(WORKBOOK, CANDIDATES, OPTIONS);
    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain("canonical_player_id");
    expect(serialized).not.toContain("canonical_team_id");
    expect(serialized).not.toContain("iscanonical\":true");
  });
});

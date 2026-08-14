// Synthetic end-to-end integration test: builds a real XLSX workbook in
// memory, decodes it EXCLUSIVELY via packages/xlsx-adapter (the one decoder
// in this repo), then feeds the decoded workbook to this package's pipeline.
// `exceljs` is used directly here ONLY to construct the synthetic bytes —
// never in packages/manual-enrichment/src (see sheetReader.ts's header).
// No file is ever written to disk; no real data anywhere in this file.
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { decodeWorkbookFromBytes } from "../../xlsx-adapter/src/xlsxWorkbookAdapter.js";
import { runManualEnrichmentPipeline } from "../src/pipeline.js";
import { MANDATORY_COLUMNS } from "../src/sheetReader.js";
import type { ListoneCandidate, ManualEnrichmentOptions } from "../src/types.js";

const OPTIONS: ManualEnrichmentOptions = { allowedSources: new Set(["synthetic_source_a"]) };

async function buildSyntheticEnrichmentXlsxBytes(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Enrichment");
  const header = [...MANDATORY_COLUMNS];
  const rows: (string | number)[][] = [
    header,
    ["201", "Synth Voyager", "A", "Synthopoli", "titolare", "nessuno", "synthetic_source_a", "manual_file", "alta", "2026-07-10"],
    ["202", "Synth Ranger", "D", "Synthopoli", "ballottaggio", "dubbio", "synthetic_source_a", "manual_file", "media", "2026-07-11"],
  ];
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      ws.getCell(r + 1, c + 1).value = cell;
    });
  });
  const buf = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

const CANDIDATES: readonly ListoneCandidate[] = [
  { listoneId: "201", name: "Synth Voyager", role: "A", team: "Synthopoli" },
  { listoneId: "202", name: "Synth Ranger", role: "D", team: "Synthopoli" },
];

describe("XLSX bytes -> xlsx-adapter -> manual-enrichment pipeline (synthetic round-trip)", () => {
  it("decodes real XLSX bytes via the shared decoder and validates/joins the resulting rows", async () => {
    const bytes = await buildSyntheticEnrichmentXlsxBytes();
    const workbook = await decodeWorkbookFromBytes(bytes);

    const result = runManualEnrichmentPipeline(workbook, CANDIDATES, OPTIONS);

    expect(result.headerIssues).toEqual([]);
    expect(result.rows.length).toBe(2);
    const row201 = result.rows.find((r) => r.record?.listoneId === "201");
    const row202 = result.rows.find((r) => r.record?.listoneId === "202");
    expect(row201?.status).toBe("valid");
    expect(row202?.status).toBe("valid");
    expect(result.report.gatesPromoted).toBe(false);
  });
});

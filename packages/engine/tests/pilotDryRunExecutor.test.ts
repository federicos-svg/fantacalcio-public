import { describe, it, expect } from "vitest";
import { runPilotDryRun } from "../src/pilotDryRunExecutor.js";
import { ZIP_MAGIC_BYTES, type RawFileCandidate } from "../src/rawFileValidation.js";

// PURE, in-memory, fixture-only. Bytes/manifest below are synthetic — NEVER a
// real acquisition. This locks the composition of L1 (raw_file) + L2
// (acquisition_manifest) into a single dry-run verdict. Does NOT execute the
// real pilot: no download, no endpoint, no Drive/n8n.

const H = "a".repeat(64);

function syntheticZipLike(extraByteCount = 16): Uint8Array {
  return Uint8Array.from([...ZIP_MAGIC_BYTES, ...Array.from({ length: extraByteCount }, (_, i) => i % 256)]);
}

function syntheticHtml(): Uint8Array {
  return new TextEncoder().encode("<!DOCTYPE html><html></html>");
}

const validRawFile: RawFileCandidate = {
  bytes: syntheticZipLike(),
  rawHash: H,
  season: "2021_22",
  seasonCode: "16",
  matchday: 38,
  manifestStatus: "success",
  hashConflict: false,
};

const validAcquisitionManifest = {
  acquisition_id: "2021_22-md38-0001",
  season: "2021_22",
  season_code: "16",
  matchday: 38,
  source_kind: "fantacalcio_xlsx_private_endpoint",
  source_url_template: "${FANTACALCIO_XLSX_SOURCE_BASE_URL}/api/v1/Excel/votes/{season_code}/{matchday}",
  source_url_resolved_redacted: "<FANTACALCIO_XLSX_SOURCE_BASE_URL>/api/v1/Excel/votes/16/38",
  auth_secret_ref: "FANTACALCIO_XLSX_SOURCE_AUTH_SECRET_REF",
  acquired_at: "2026-06-30T12:00:00Z",
  http_status: 200,
  response_kind: "xlsx",
  original_filename: "Voti_Fantacalcio_Stagione_2021_22_Giornata_38.xlsx",
  canonical_filename: "Voti_Fantacalcio_2021_22_G38.xlsx",
  drive_target_folder_kind: "raw",
  drive_target_path: "Raw/2021_22/Voti_Fantacalcio_2021_22_G38.xlsx",
  raw_hash: H,
  raw_size_bytes: 20480,
  status: "success",
  error_code: null,
  error_message: null,
  skipped_reason: null,
  rejected_reason: null,
  provenance: { acquired_by: "n8n:fantacalcio_raw_acquisition", tool: "n8n", tool_version: "design-v1" },
  source_license: "proprietary_personal_use",
  storage_allowed: "private_drive_only",
  redistribution_allowed: false,
};

describe("runPilotDryRun — L1+L2 composition on synthetic fixtures", () => {
  it("L1 valid + L2 valid -> accepted, no blocking reasons, gate stays off", () => {
    const r = runPilotDryRun({ rawFile: validRawFile, acquisitionManifest: validAcquisitionManifest });
    expect(r.l1.status).toBe("valid");
    expect(r.l2.status).toBe("valid");
    expect(r.accepted_for_pilot_dry_run).toBe(true);
    expect(r.blocking_reasons).toEqual([]);
    expect(r.data_promoted_eligible).toBe(false);
  });

  it("L1 invalid (missing season link) -> not accepted, blocking reason names l1", () => {
    const r = runPilotDryRun({
      rawFile: { ...validRawFile, season: null },
      acquisitionManifest: validAcquisitionManifest,
    });
    expect(r.l1.status).toBe("invalid");
    expect(r.accepted_for_pilot_dry_run).toBe(false);
    expect(r.blocking_reasons).toContain("l1:missing_season_link");
  });

  it("L2 invalid (missing acquisition_id) -> not accepted, blocking reason names l2", () => {
    const { acquisition_id: _drop, ...manifestWithoutId } = validAcquisitionManifest;
    const r = runPilotDryRun({ rawFile: validRawFile, acquisitionManifest: manifestWithoutId });
    expect(r.l2.status).toBe("invalid");
    expect(r.accepted_for_pilot_dry_run).toBe(false);
    expect(r.blocking_reasons).toContain("l2:invalid_acquisition_id");
  });

  it("L1 hash-change conflict (anti-overwrite) -> not accepted", () => {
    const r = runPilotDryRun({
      rawFile: { ...validRawFile, hashConflict: true },
      acquisitionManifest: validAcquisitionManifest,
    });
    expect(r.l1.status).toBe("rejected");
    expect(r.l1.reason).toBe("hash_change_conflict");
    expect(r.accepted_for_pilot_dry_run).toBe(false);
    expect(r.blocking_reasons).toContain("l1:hash_change_conflict");
  });

  it("a non-Excel payload -> not accepted", () => {
    const r = runPilotDryRun({
      rawFile: { ...validRawFile, bytes: syntheticHtml() },
      acquisitionManifest: validAcquisitionManifest,
    });
    expect(r.l1.status).toBe("rejected");
    expect(r.l1.reason).toBe("non_excel_payload");
    expect(r.accepted_for_pilot_dry_run).toBe(false);
  });

  it("an incoherent manifest status (vs http_status/response_kind) -> not accepted", () => {
    const r = runPilotDryRun({
      rawFile: validRawFile,
      acquisitionManifest: { ...validAcquisitionManifest, status: "failed" },
    });
    expect(r.l2.status).toBe("invalid");
    expect(r.accepted_for_pilot_dry_run).toBe(false);
    expect(r.blocking_reasons).toContain("l2:status_mismatch");
  });

  it("both L1 and L2 invalid accumulate blocking reasons from both levels", () => {
    const r = runPilotDryRun({
      rawFile: { ...validRawFile, matchday: null },
      acquisitionManifest: { ...validAcquisitionManifest, status: "failed" },
    });
    expect(r.accepted_for_pilot_dry_run).toBe(false);
    expect(r.blocking_reasons.some((b) => b.startsWith("l1:"))).toBe(true);
    expect(r.blocking_reasons.some((b) => b.startsWith("l2:"))).toBe(true);
  });

  it("is deterministic (same input -> same output)", () => {
    const input = { rawFile: { ...validRawFile }, acquisitionManifest: { ...validAcquisitionManifest } };
    expect(runPilotDryRun(input)).toEqual(runPilotDryRun({ ...input }));
  });
});

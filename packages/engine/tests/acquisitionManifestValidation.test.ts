import { describe, it, expect } from "vitest";
import { validateAcquisitionManifest, isAcquisitionManifestAcceptable } from "../src/acquisitionManifestValidation.js";

// PURE, in-memory, fixture-only. Manifests below are synthetic — NEVER a real
// acquisition. This locks the level-2 "acquisition_manifest" coherence check
// (docs/data/RAW_ACQUISITION_CONTRACT.md decision table,
// VALIDATION_IDENTITY_CONTRACT.md §"Livello 2").

const H = "a".repeat(64);

const successManifest = {
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

describe("validateAcquisitionManifest — level 2 coherence on synthetic manifests", () => {
  it("a well-formed success manifest (200+xlsx+raw) is valid", () => {
    const m = validateAcquisitionManifest(successManifest);
    expect(m.status).toBe("valid");
    expect(m.issueCount).toBe(0);
    expect(isAcquisitionManifestAcceptable(m)).toBe(true);
  });

  it("a skipped manifest (404+not_found+none) is valid", () => {
    const m = validateAcquisitionManifest({
      ...successManifest,
      http_status: 404,
      response_kind: "not_found",
      drive_target_folder_kind: "none",
      drive_target_path: null,
      raw_hash: null,
      raw_size_bytes: null,
      status: "skipped",
      skipped_reason: "file_not_available",
    });
    expect(m.status).toBe("valid");
  });

  it.each([401, 403] as const)("a failed manifest (%i+unauthorized+none) is valid", (httpStatus) => {
    const m = validateAcquisitionManifest({
      ...successManifest,
      http_status: httpStatus,
      response_kind: "unauthorized",
      drive_target_folder_kind: "none",
      drive_target_path: null,
      raw_hash: null,
      raw_size_bytes: null,
      status: "failed",
      error_code: "auth_error",
      error_message: `endpoint returned ${httpStatus}`,
    });
    expect(m.status).toBe("valid");
  });

  it("a failed manifest (500+server_error+none) is valid", () => {
    const m = validateAcquisitionManifest({
      ...successManifest,
      http_status: 500,
      response_kind: "server_error",
      drive_target_folder_kind: "none",
      drive_target_path: null,
      raw_hash: null,
      raw_size_bytes: null,
      status: "failed",
      error_code: "server_error",
      error_message: "endpoint returned 500",
    });
    expect(m.status).toBe("valid");
  });

  it("a rejected manifest (200+non_excel+rejected) is valid", () => {
    const m = validateAcquisitionManifest({
      ...successManifest,
      response_kind: "non_excel",
      drive_target_folder_kind: "rejected",
      drive_target_path: "Rejected/2021_22/Voti_Fantacalcio_2021_22_G38.xlsx",
      status: "rejected",
      rejected_reason: "non_excel_payload",
    });
    expect(m.status).toBe("valid");
  });

  it("status inconsistent with http_status/response_kind is invalid", () => {
    const m = validateAcquisitionManifest({ ...successManifest, status: "failed" });
    expect(m.status).toBe("invalid");
    expect(m.issues.map((i) => i.code)).toContain("status_mismatch");
  });

  it("drive_target_folder_kind inconsistent with http_status/response_kind is invalid", () => {
    const m = validateAcquisitionManifest({ ...successManifest, drive_target_folder_kind: "rejected" });
    expect(m.status).toBe("invalid");
    expect(m.issues.map((i) => i.code)).toContain("drive_target_folder_kind_mismatch");
  });

  it("an undocumented http_status/response_kind combination is invalid", () => {
    const m = validateAcquisitionManifest({ ...successManifest, http_status: 404, response_kind: "xlsx" });
    expect(m.status).toBe("invalid");
    expect(m.issues.map((i) => i.code)).toContain("invalid_http_status_response_kind_combo");
  });

  it("a source_url_template carrying a real host is invalid (no leak)", () => {
    const m = validateAcquisitionManifest({
      ...successManifest,
      source_url_template: "https://real-host.example/api/v1/Excel/votes/{season_code}/{matchday}",
    });
    expect(m.status).toBe("invalid");
    expect(m.issues.map((i) => i.code)).toContain("source_url_template_leak");
  });

  it("a resolved URL that is not base-redacted is invalid (no leak)", () => {
    const m = validateAcquisitionManifest({
      ...successManifest,
      source_url_resolved_redacted: "https://real-host.example/api/v1/Excel/votes/16/38",
    });
    expect(m.status).toBe("invalid");
    expect(m.issues.map((i) => i.code)).toContain("source_url_resolved_leak");
  });

  it("a missing auth_secret_ref is invalid", () => {
    const m = validateAcquisitionManifest({ ...successManifest, auth_secret_ref: "" });
    expect(m.issues.map((i) => i.code)).toContain("invalid_auth_secret_ref");
  });

  it("a drive_target_path that looks like an opaque Drive id (not a conceptual path) is invalid", () => {
    const m = validateAcquisitionManifest({
      ...successManifest,
      drive_target_path: "1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvWxYz1234",
    });
    expect(m.status).toBe("invalid");
    expect(m.issues.map((i) => i.code)).toContain("drive_target_path_not_conceptual");
  });

  it("a null drive_target_path is accepted (skip/failed carry no payload)", () => {
    const m = validateAcquisitionManifest({
      ...successManifest,
      http_status: 404,
      response_kind: "not_found",
      drive_target_folder_kind: "none",
      drive_target_path: null,
      raw_hash: null,
      raw_size_bytes: null,
      status: "skipped",
    });
    expect(m.issues.map((i) => i.code)).not.toContain("drive_target_path_not_conceptual");
  });

  it("redistribution_allowed = true is invalid", () => {
    const m = validateAcquisitionManifest({ ...successManifest, redistribution_allowed: true });
    expect(m.issues.map((i) => i.code)).toContain("redistribution_allowed_not_false");
  });

  it("storage_allowed different from private_drive_only is invalid", () => {
    const m = validateAcquisitionManifest({ ...successManifest, storage_allowed: "public" });
    expect(m.issues.map((i) => i.code)).toContain("invalid_storage_allowed");
  });

  it("source_license different from proprietary_personal_use is invalid", () => {
    const m = validateAcquisitionManifest({ ...successManifest, source_license: "commercial" });
    expect(m.issues.map((i) => i.code)).toContain("invalid_source_license");
  });

  it("a non-object input is invalid with a single issue", () => {
    const m = validateAcquisitionManifest("not-a-manifest");
    expect(m.status).toBe("invalid");
    expect(m.issues).toHaveLength(1);
    expect(m.issues[0]?.code).toBe("not_an_object");
  });

  it("a missing acquisition_id is invalid", () => {
    const { acquisition_id: _drop, ...rest } = successManifest;
    const m = validateAcquisitionManifest(rest);
    expect(m.issues.map((i) => i.code)).toContain("invalid_acquisition_id");
  });

  it("accepts the synthetic 2026/27 linkage and rejects codes outside the 10..21 mapping", () => {
    const future = validateAcquisitionManifest({
      ...successManifest,
      acquisition_id: "2026_27-md38-synthetic",
      season: "2026_27",
      season_code: "21",
      source_url_resolved_redacted: "<FANTACALCIO_XLSX_SOURCE_BASE_URL>/api/v1/Excel/votes/21/38",
      original_filename: "synthetic_2026_27_G38.xlsx",
      canonical_filename: "Voti_Fantacalcio_2026_27_G38.xlsx",
      drive_target_path: "Raw/2026_27/Voti_Fantacalcio_2026_27_G38.xlsx",
    });
    expect(future.status).toBe("valid");
    const m = validateAcquisitionManifest({ ...successManifest, season_code: "09" });
    expect(m.issues.map((i) => i.code)).toContain("invalid_season_code");
  });

  it("a season that does not match the mapped season for season_code is invalid", () => {
    // season_code 17 maps to 2022_23, not 2021_22 — well-formed but wrong per the 0D mapping.
    const m = validateAcquisitionManifest({ ...successManifest, season_code: "17" });
    expect(m.issues.map((i) => i.code)).toContain("season_season_code_mismatch");
  });

  it("a matchday outside 1..38 is invalid", () => {
    expect(validateAcquisitionManifest({ ...successManifest, matchday: 0 }).issues.map((i) => i.code)).toContain("invalid_matchday");
    expect(validateAcquisitionManifest({ ...successManifest, matchday: 39 }).issues.map((i) => i.code)).toContain("invalid_matchday");
  });

  it("a wrong source_kind is invalid", () => {
    const m = validateAcquisitionManifest({ ...successManifest, source_kind: "generic_http" });
    expect(m.issues.map((i) => i.code)).toContain("invalid_source_kind");
  });

  it("a missing acquired_at is invalid", () => {
    const m = validateAcquisitionManifest({ ...successManifest, acquired_at: "" });
    expect(m.issues.map((i) => i.code)).toContain("invalid_acquired_at");
  });

  it("a malformed raw_hash (present but not 64-hex) is invalid", () => {
    const m = validateAcquisitionManifest({ ...successManifest, raw_hash: "not-a-hash" });
    expect(m.issues.map((i) => i.code)).toContain("invalid_raw_hash");
  });

  it("a negative raw_size_bytes is invalid", () => {
    const m = validateAcquisitionManifest({ ...successManifest, raw_size_bytes: -1 });
    expect(m.issues.map((i) => i.code)).toContain("invalid_raw_size_bytes");
  });

  it("a missing/malformed provenance is invalid", () => {
    expect(validateAcquisitionManifest({ ...successManifest, provenance: null }).issues.map((i) => i.code)).toContain("invalid_provenance");
    const wrongTool = validateAcquisitionManifest({
      ...successManifest,
      provenance: { acquired_by: "n8n:x", tool: "zapier", tool_version: "v1" },
    });
    expect(wrongTool.issues.map((i) => i.code)).toContain("invalid_provenance_tool");
  });

  it("an unexpected extra field is invalid (schema is additionalProperties:false)", () => {
    const m = validateAcquisitionManifest({ ...successManifest, extra_field: "leak" });
    expect(m.issues.map((i) => i.code)).toContain("unexpected_field");
  });

  it("a success manifest with raw_size_bytes = 0 is invalid (must be > 0)", () => {
    const m = validateAcquisitionManifest({ ...successManifest, raw_size_bytes: 0 });
    expect(m.issues.map((i) => i.code)).toContain("success_invalid_raw_size_bytes");
  });

  it("a skipped manifest that still carries a drive_target_path is invalid (no silent payload)", () => {
    const m = validateAcquisitionManifest({
      ...successManifest,
      http_status: 404,
      response_kind: "not_found",
      drive_target_folder_kind: "none",
      drive_target_path: "Raw/2021_22/leaked.xlsx",
      raw_hash: null,
      raw_size_bytes: null,
      status: "skipped",
    });
    expect(m.issues.map((i) => i.code)).toContain("no_payload_status_drive_target_path_not_null");
  });

  it("a rejected manifest missing rejected_reason is invalid", () => {
    const m = validateAcquisitionManifest({
      ...successManifest,
      response_kind: "non_excel",
      drive_target_folder_kind: "rejected",
      drive_target_path: "Rejected/2021_22/Voti_Fantacalcio_2021_22_G38.xlsx",
      status: "rejected",
      rejected_reason: null,
    });
    expect(m.issues.map((i) => i.code)).toContain("rejected_missing_reason");
  });

  it("a rejected manifest whose path is not under Rejected/ is invalid", () => {
    const m = validateAcquisitionManifest({
      ...successManifest,
      response_kind: "non_excel",
      drive_target_folder_kind: "rejected",
      drive_target_path: "Raw/2021_22/Voti_Fantacalcio_2021_22_G38.xlsx",
      status: "rejected",
      rejected_reason: "non_excel_payload",
    });
    expect(m.issues.map((i) => i.code)).toContain("rejected_missing_drive_target_path");
  });

  it("data_promoted_eligible is always false", () => {
    expect(validateAcquisitionManifest(successManifest).data_promoted_eligible).toBe(false);
    expect(validateAcquisitionManifest("garbage").data_promoted_eligible).toBe(false);
  });

  it("is deterministic (same manifest -> same result)", () => {
    expect(validateAcquisitionManifest(successManifest)).toEqual(validateAcquisitionManifest({ ...successManifest }));
  });
});

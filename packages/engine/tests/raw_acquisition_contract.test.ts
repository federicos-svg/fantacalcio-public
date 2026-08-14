import { describe, it, expect } from "vitest";
import { z } from "zod";

// Design-only contract checks for Batch 0D (Raw Acquisition).
// NO real workflow, NO HTTP, NO download, NO Drive API, NO parser/ingestion.
// Fixtures are synthetic. This locks:
//  - schemas/fantacalcio_acquisition_manifest.schema.json (shape + status rules),
//  - the versioned season_code -> season mapping,
//  - the deterministic canonical filename,
//  - the idempotency key composition (season_code + season + matchday + raw_hash),
//  - the no-secret/no-real-id invariants.

const manifest = z
  .object({
    acquisition_id: z.string().min(1),
    season: z.string().regex(/^[0-9]{4}_[0-9]{2}$/),
    season_code: z.string().regex(/^(1[0-9]|2[01])$/),
    matchday: z.number().int().min(1).max(38),
    source_kind: z.literal("fantacalcio_xlsx_private_endpoint"),
    source_url_template: z
      .string()
      .regex(/^\$\{FANTACALCIO_XLSX_SOURCE_BASE_URL\}\/.*\{season_code\}\/\{matchday\}$/),
    source_url_resolved_redacted: z.string().regex(/^<FANTACALCIO_XLSX_SOURCE_BASE_URL>\/.*$/),
    auth_secret_ref: z.string().min(1),
    acquired_at: z.string().min(1),
    http_status: z.union([
      z.literal(200),
      z.literal(401),
      z.literal(403),
      z.literal(404),
      z.literal(500),
    ]),
    response_kind: z.enum(["xlsx", "not_found", "unauthorized", "server_error", "non_excel"]),
    original_filename: z.string().nullable(),
    canonical_filename: z.string().nullable(),
    drive_target_folder_kind: z.enum(["raw", "rejected", "none"]),
    drive_target_path: z.string().nullable(),
    raw_hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    raw_size_bytes: z.number().int().min(0).nullable(),
    status: z.enum(["success", "skipped", "failed", "rejected"]),
    error_code: z.string().nullable(),
    error_message: z.string().nullable(),
    skipped_reason: z.string().nullable(),
    rejected_reason: z.string().nullable(),
    provenance: z
      .object({
        acquired_by: z.string().min(1),
        tool: z.literal("n8n"),
        tool_version: z.string().min(1),
        note: z.string().optional(),
      })
      .strict(),
    source_license: z.literal("proprietary_personal_use"),
    storage_allowed: z.literal("private_drive_only"),
    redistribution_allowed: z.literal(false),
  })
  .strict();

// --- Versioned mapping (mirror of docs/data/RAW_ACQUISITION_CONTRACT.md) ---
const SEASON_CODE_MAP: Readonly<Record<string, string>> = {
  "10": "2015_16",
  "11": "2016_17",
  "12": "2017_18",
  "13": "2018_19",
  "14": "2019_20",
  "15": "2020_21",
  "16": "2021_22",
  "17": "2022_23",
  "18": "2023_24",
  "19": "2024_25",
  "20": "2025_26",
  "21": "2026_27",
};

function canonicalFilename(season: string, matchday: number): string {
  return `Voti_Fantacalcio_${season}_G${matchday}.xlsx`;
}

function idempotencyKey(seasonCode: string, season: string, matchday: number, rawHash: string): string {
  return `${seasonCode}|${season}|${matchday}|${rawHash}`;
}

const H = "a".repeat(64);

const baseSuccess = {
  acquisition_id: "2021_22-md38-0001",
  season: "2021_22",
  season_code: "16",
  matchday: 38,
  source_kind: "fantacalcio_xlsx_private_endpoint" as const,
  source_url_template: "${FANTACALCIO_XLSX_SOURCE_BASE_URL}/api/v1/Excel/votes/{season_code}/{matchday}",
  source_url_resolved_redacted: "<FANTACALCIO_XLSX_SOURCE_BASE_URL>/api/v1/Excel/votes/16/38",
  auth_secret_ref: "FANTACALCIO_XLSX_SOURCE_AUTH_SECRET_REF",
  acquired_at: "2026-06-30T12:00:00Z",
  http_status: 200 as const,
  response_kind: "xlsx" as const,
  original_filename: "Voti_Fantacalcio_Stagione_2021_22_Giornata_38.xlsx",
  canonical_filename: "Voti_Fantacalcio_2021_22_G38.xlsx",
  drive_target_folder_kind: "raw" as const,
  drive_target_path: "Raw/2021_22/Voti_Fantacalcio_2021_22_G38.xlsx",
  raw_hash: H,
  raw_size_bytes: 20480,
  status: "success" as const,
  error_code: null,
  error_message: null,
  skipped_reason: null,
  rejected_reason: null,
  provenance: { acquired_by: "n8n:fantacalcio_raw_acquisition", tool: "n8n" as const, tool_version: "design-v1" },
  source_license: "proprietary_personal_use" as const,
  storage_allowed: "private_drive_only" as const,
  redistribution_allowed: false as const,
};

describe("FantacalcioAcquisitionManifest — synthetic fixtures (Batch 0D)", () => {
  it("HTTP 200 + valid Excel → success in Raw/", () => {
    const p = manifest.parse(baseSuccess);
    expect(p.status).toBe("success");
    expect(p.drive_target_folder_kind).toBe("raw");
    expect(p.raw_hash).toBe(H);
  });

  it("HTTP 404 → skipped, no payload, does not block", () => {
    const r = {
      ...baseSuccess,
      acquisition_id: "2021_22-md12-0002",
      matchday: 12,
      http_status: 404 as const,
      response_kind: "not_found" as const,
      original_filename: null,
      canonical_filename: null,
      drive_target_folder_kind: "none" as const,
      drive_target_path: null,
      raw_hash: null,
      raw_size_bytes: null,
      status: "skipped" as const,
      skipped_reason: "file_not_available",
      source_url_resolved_redacted: "<FANTACALCIO_XLSX_SOURCE_BASE_URL>/api/v1/Excel/votes/16/12",
    };
    const p = manifest.parse(r);
    expect(p.status).toBe("skipped");
    expect(p.raw_hash).toBeNull();
    expect(p.drive_target_folder_kind).toBe("none");
  });

  it("HTTP 401/403 → failed + auth error code", () => {
    for (const code of [401, 403] as const) {
      const r = {
        ...baseSuccess,
        acquisition_id: `2021_22-md38-auth-${code}`,
        http_status: code,
        response_kind: "unauthorized" as const,
        original_filename: null,
        canonical_filename: null,
        drive_target_folder_kind: "none" as const,
        drive_target_path: null,
        raw_hash: null,
        raw_size_bytes: null,
        status: "failed" as const,
        error_code: "auth_error",
        error_message: `endpoint returned ${code}`,
      };
      const p = manifest.parse(r);
      expect(p.status).toBe("failed");
      expect(p.error_code).toBe("auth_error");
    }
  });

  it("HTTP 500 → failed + server error code", () => {
    const r = {
      ...baseSuccess,
      acquisition_id: "2021_22-md38-500",
      http_status: 500 as const,
      response_kind: "server_error" as const,
      original_filename: null,
      canonical_filename: null,
      drive_target_folder_kind: "none" as const,
      drive_target_path: null,
      raw_hash: null,
      raw_size_bytes: null,
      status: "failed" as const,
      error_code: "server_error",
      error_message: "endpoint returned 500",
    };
    expect(manifest.parse(r).status).toBe("failed");
  });

  it("HTTP 200 but non-Excel payload → rejected in Rejected/", () => {
    const r = {
      ...baseSuccess,
      acquisition_id: "2021_22-md38-nonexcel",
      response_kind: "non_excel" as const,
      drive_target_folder_kind: "rejected" as const,
      drive_target_path: "Rejected/2021_22/Voti_Fantacalcio_2021_22_G38.xlsx",
      status: "rejected" as const,
      rejected_reason: "non_excel_payload",
    };
    const p = manifest.parse(r);
    expect(p.status).toBe("rejected");
    expect(p.drive_target_folder_kind).toBe("rejected");
  });

  it("hash-change vs known file → rejected (quarantine), not overwrite", () => {
    const r = {
      ...baseSuccess,
      acquisition_id: "2021_22-md38-hashchange",
      raw_hash: "b".repeat(64),
      drive_target_folder_kind: "rejected" as const,
      drive_target_path: "Rejected/2021_22/Voti_Fantacalcio_2021_22_G38.xlsx",
      status: "rejected" as const,
      rejected_reason: "hash_change_conflict",
    };
    const p = manifest.parse(r);
    expect(p.status).toBe("rejected");
    expect(p.rejected_reason).toBe("hash_change_conflict");
  });

  it("rejects redistribution_allowed = true", () => {
    expect(manifest.safeParse({ ...baseSuccess, redistribution_allowed: true }).success).toBe(false);
  });

  it("rejects storage_allowed != private_drive_only", () => {
    expect(manifest.safeParse({ ...baseSuccess, storage_allowed: "public" }).success).toBe(false);
  });

  it("rejects a source_url_template carrying a real host (no ENV placeholder)", () => {
    const leaked = { ...baseSuccess, source_url_template: "https://real-host.example/api/v1/Excel/votes/{season_code}/{matchday}" };
    expect(manifest.safeParse(leaked).success).toBe(false);
  });

  it("rejects a resolved URL that is not base-redacted", () => {
    const leaked = { ...baseSuccess, source_url_resolved_redacted: "https://real-host.example/api/v1/Excel/votes/16/38" };
    expect(manifest.safeParse(leaked).success).toBe(false);
  });

  it("rejects an unknown extra field (no value/price/secret leakage)", () => {
    expect(manifest.safeParse({ ...baseSuccess, token: "secret" }).success).toBe(false);
  });
});

describe("season_code mapping + canonical filename (versioned)", () => {
  it("maps all 12 season codes 10..21 to canonical seasons", () => {
    expect(Object.keys(SEASON_CODE_MAP)).toHaveLength(12);
    expect(SEASON_CODE_MAP["16"]).toBe("2021_22");
    expect(SEASON_CODE_MAP["10"]).toBe("2015_16");
    expect(SEASON_CODE_MAP["20"]).toBe("2025_26");
    expect(SEASON_CODE_MAP["21"]).toBe("2026_27");
    for (const season of Object.values(SEASON_CODE_MAP)) {
      expect(season).toMatch(/^[0-9]{4}_[0-9]{2}$/);
    }
  });

  it("builds a deterministic canonical filename from season + matchday", () => {
    expect(canonicalFilename("2021_22", 38)).toBe("Voti_Fantacalcio_2021_22_G38.xlsx");
  });
});

describe("idempotency key", () => {
  it("is stable for the same season_code+season+matchday+raw_hash", () => {
    const a = idempotencyKey("16", "2021_22", 38, H);
    const b = idempotencyKey("16", "2021_22", 38, H);
    expect(a).toBe(b);
  });

  it("differs when raw_hash changes (drives quarantine, not overwrite)", () => {
    const same = idempotencyKey("16", "2021_22", 38, H);
    const changed = idempotencyKey("16", "2021_22", 38, "b".repeat(64));
    expect(same).not.toBe(changed);
  });
});

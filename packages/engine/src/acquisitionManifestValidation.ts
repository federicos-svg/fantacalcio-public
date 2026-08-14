// Synthetic acquisition-manifest (level 2) validator — PURE, in-memory, fixture-only.
//
// Scope (approved minimal perimeter): re-check, at runtime, that an acquisition
// manifest object matches the schema-minimal shape AND is internally coherent
// per the documented contracts (schemas/fantacalcio_acquisition_manifest.schema.json,
// docs/data/RAW_ACQUISITION_CONTRACT.md "Mapping season_code -> season" +
// "Comportamento per risposta HTTP -> status manifest",
// VALIDATION_IDENTITY_CONTRACT.md level 2 "acquisition manifest validation"):
// required fields present and well-typed, `season`/`season_code` consistent
// with the versioned 0D mapping, `status` + `drive_target_folder_kind` +
// per-status payload fields matching `http_status` + `response_kind` per the
// decision table, and no real URL/secret/Drive-id leaking into the
// ENV-placeholder/redacted fields. There is NO HTTP/Drive/n8n I/O, NO
// download, NO dependency, NO persistence, NO parser/normalizer/ingestion, NO
// identity matching.
//
// Defense-in-depth: input is `unknown` — this does not trust the type system,
// so a hand-built or future manifest object can be validated too.
//
// Gate invariant (enforced by construction): validation success ≠
// `data_promoted` — this module has no notion of promotion, it only decides
// whether a manifest clears the level-2 coherence bar.

export interface AcquisitionManifestIssue {
  readonly code: string;
  readonly message: string;
}

export type AcquisitionManifestValidationStatus = "valid" | "invalid";

export interface AcquisitionManifestValidationManifest {
  readonly status: AcquisitionManifestValidationStatus;
  readonly issueCount: number;
  readonly issues: readonly AcquisitionManifestIssue[];
  /** Gate stays OFF: this validator never promotes anything. Always false. */
  readonly data_promoted_eligible: false;
}

const HTTP_STATUSES: ReadonlySet<number> = new Set([200, 401, 403, 404, 500]);
const RESPONSE_KINDS: ReadonlySet<string> = new Set(["xlsx", "not_found", "unauthorized", "server_error", "non_excel"]);
const MANIFEST_STATUSES: ReadonlySet<string> = new Set(["success", "skipped", "failed", "rejected"]);
const DRIVE_FOLDER_KINDS: ReadonlySet<string> = new Set(["raw", "rejected", "none"]);

const SEASON_RE = /^[0-9]{4}_[0-9]{2}$/;
const RAW_HASH_RE = /^[a-f0-9]{64}$/;
const SOURCE_URL_TEMPLATE_RE = /^\$\{FANTACALCIO_XLSX_SOURCE_BASE_URL\}\/.*\{season_code\}\/\{matchday\}$/;
const SOURCE_URL_RESOLVED_RE = /^<FANTACALCIO_XLSX_SOURCE_BASE_URL>\/.*$/;
const DRIVE_PATH_RE = /^(Raw|Rejected)\/[0-9]{4}_[0-9]{2}\/.+$/;
const REJECTED_DRIVE_PATH_RE = /^Rejected\/[0-9]{4}_[0-9]{2}\/.+$/;

// Versioned season_code -> season mapping (mirror of docs/data/RAW_ACQUISITION_CONTRACT.md
// "Mapping season_code -> season", locked by packages/engine/tests/raw_acquisition_contract.test.ts).
const SEASON_CODE_MAP: Readonly<Record<string, string>> = Object.freeze({
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
});

// Full field set of schemas/fantacalcio_acquisition_manifest.schema.json
// (additionalProperties: false) — any other key is a schema violation.
const KNOWN_FIELDS: ReadonlySet<string> = new Set([
  "acquisition_id",
  "season",
  "season_code",
  "matchday",
  "source_kind",
  "source_url_template",
  "source_url_resolved_redacted",
  "auth_secret_ref",
  "acquired_at",
  "http_status",
  "response_kind",
  "original_filename",
  "canonical_filename",
  "drive_target_folder_kind",
  "drive_target_path",
  "raw_hash",
  "raw_size_bytes",
  "status",
  "error_code",
  "error_message",
  "skipped_reason",
  "rejected_reason",
  "provenance",
  "source_license",
  "storage_allowed",
  "redistribution_allowed",
]);

interface StatusRule {
  readonly httpStatus: number;
  readonly responseKind: string;
  readonly status: string;
  readonly driveTargetFolderKind: string;
}

// Decision table — mirror of docs/data/RAW_ACQUISITION_CONTRACT.md
// "Comportamento per risposta HTTP -> status manifest". One row per documented
// http_status/response_kind combination; any other combination is invalid.
const STATUS_RULES: readonly StatusRule[] = [
  { httpStatus: 200, responseKind: "xlsx", status: "success", driveTargetFolderKind: "raw" },
  { httpStatus: 404, responseKind: "not_found", status: "skipped", driveTargetFolderKind: "none" },
  { httpStatus: 401, responseKind: "unauthorized", status: "failed", driveTargetFolderKind: "none" },
  { httpStatus: 403, responseKind: "unauthorized", status: "failed", driveTargetFolderKind: "none" },
  { httpStatus: 500, responseKind: "server_error", status: "failed", driveTargetFolderKind: "none" },
  { httpStatus: 200, responseKind: "non_excel", status: "rejected", driveTargetFolderKind: "rejected" },
];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function isNullableNonNegativeInt(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0);
}

/**
 * Validates a single acquisition manifest (level 2). Pure and deterministic:
 * the same input always yields the same manifest (issues in check order).
 *
 * Checks (all synthetic, no real data, no gate):
 *   - schema-minimal shape: object, no unexpected fields, non-empty
 *     `acquisition_id`, `season` (`YYYY_YY`) consistent with a known
 *     `season_code` (10..21, versioned 0D mapping), `matchday` integer 1..38,
 *     `source_kind` fixed literal, non-empty `acquired_at`, known
 *     `http_status`/`response_kind`/`status`/`drive_target_folder_kind`
 *     enums, well-typed nullable fields (`original_filename`,
 *     `canonical_filename`, `raw_hash` 64-hex-or-null, `raw_size_bytes`
 *     non-negative-int-or-null, `error_code`, `error_message`,
 *     `skipped_reason`, `rejected_reason`), and a `provenance` object
 *     (`acquired_by`, `tool==="n8n"`, `tool_version`);
 *   - `status` + `drive_target_folder_kind` coherent with `http_status` +
 *     `response_kind` per the documented decision table
 *     (200+xlsx->success/raw, 404+not_found->skipped/none,
 *     401|403+unauthorized->failed/none, 500+server_error->failed/none,
 *     200+non_excel->rejected/rejected);
 *   - per-status payload completeness: `success` carries a Raw/ path,
 *     `canonical_filename`, a well-formed `raw_hash`, and `raw_size_bytes >
 *     0`; `skipped`/`failed` carry no payload (`drive_target_path`/
 *     `raw_hash`/`raw_size_bytes` all `null`); `rejected` carries a
 *     Rejected/ path and a non-empty `rejected_reason`;
 *   - `source_url_template` carries only the ENV placeholder (no real host);
 *   - `source_url_resolved_redacted` keeps the base URL redacted;
 *   - `auth_secret_ref` is a non-empty symbolic string;
 *   - `drive_target_path`, when present, is a conceptual `Raw/<season>/...` or
 *     `Rejected/<season>/...` path, never a raw Drive id;
 *   - `source_license`/`storage_allowed`/`redistribution_allowed` match the
 *     fixed personal-use/private/no-redistribution invariants.
 */
export function validateAcquisitionManifest(manifest: unknown): AcquisitionManifestValidationManifest {
  const issues: AcquisitionManifestIssue[] = [];
  const add = (code: string, message: string): void => {
    issues.push({ code, message });
  };

  if (!isObject(manifest)) {
    add("not_an_object", `manifest is not an object (got ${typeof manifest})`);
    return finalize(issues);
  }

  for (const key of Object.keys(manifest)) {
    if (!KNOWN_FIELDS.has(key)) {
      add("unexpected_field", `unexpected field '${key}' (schema is additionalProperties:false)`);
    }
  }

  if (!isNonEmptyString(manifest["acquisition_id"])) {
    add("invalid_acquisition_id", "acquisition_id must be a non-empty string");
  }

  const season = manifest["season"];
  const seasonFormatOk = typeof season === "string" && SEASON_RE.test(season);
  if (!seasonFormatOk) {
    add("invalid_season", `season must match YYYY_YY (got ${JSON.stringify(season)})`);
  }
  const seasonCode = manifest["season_code"];
  const seasonCodeOk = typeof seasonCode === "string" && seasonCode in SEASON_CODE_MAP;
  if (!seasonCodeOk) {
    add("invalid_season_code", `season_code must be one of the versioned 0D codes 10..21 (got ${JSON.stringify(seasonCode)})`);
  }
  if (seasonFormatOk && seasonCodeOk && SEASON_CODE_MAP[seasonCode as string] !== season) {
    add("season_season_code_mismatch", `season '${season}' does not match the season mapped from season_code '${seasonCode}'`);
  }

  const matchday = manifest["matchday"];
  if (!(typeof matchday === "number" && Number.isInteger(matchday) && matchday >= 1 && matchday <= 38)) {
    add("invalid_matchday", `matchday must be an integer 1..38 (got ${JSON.stringify(matchday)})`);
  }

  if (manifest["source_kind"] !== "fantacalcio_xlsx_private_endpoint") {
    add("invalid_source_kind", "source_kind must be 'fantacalcio_xlsx_private_endpoint'");
  }
  if (!isNonEmptyString(manifest["acquired_at"])) {
    add("invalid_acquired_at", "acquired_at must be a non-empty string");
  }

  const httpStatus = manifest["http_status"];
  const httpStatusOk = typeof httpStatus === "number" && HTTP_STATUSES.has(httpStatus);
  if (!httpStatusOk) {
    add("invalid_http_status", `http_status must be one of 200/401/403/404/500 (got ${JSON.stringify(httpStatus)})`);
  }

  const responseKind = manifest["response_kind"];
  const responseKindOk = typeof responseKind === "string" && RESPONSE_KINDS.has(responseKind);
  if (!responseKindOk) {
    add("invalid_response_kind", `response_kind must be a known kind (got ${JSON.stringify(responseKind)})`);
  }

  const status = manifest["status"];
  const statusOk = typeof status === "string" && MANIFEST_STATUSES.has(status);
  if (!statusOk) {
    add("invalid_status", `status must be one of success/skipped/failed/rejected (got ${JSON.stringify(status)})`);
  }

  const driveTargetFolderKind = manifest["drive_target_folder_kind"];
  const driveTargetFolderKindOk = typeof driveTargetFolderKind === "string" && DRIVE_FOLDER_KINDS.has(driveTargetFolderKind);
  if (!driveTargetFolderKindOk) {
    add(
      "invalid_drive_target_folder_kind",
      `drive_target_folder_kind must be raw/rejected/none (got ${JSON.stringify(driveTargetFolderKind)})`,
    );
  }

  // Nullable-but-required fields: must be present with the right type, value
  // may legitimately be null (e.g. no payload on skip/failed).
  if (!isNullableString(manifest["original_filename"])) {
    add("invalid_original_filename", "original_filename must be a string or null");
  }
  if (!isNullableString(manifest["canonical_filename"])) {
    add("invalid_canonical_filename", "canonical_filename must be a string or null");
  }
  const rawHash = manifest["raw_hash"];
  const rawHashOk = rawHash === null || (typeof rawHash === "string" && RAW_HASH_RE.test(rawHash));
  if (!rawHashOk) {
    add("invalid_raw_hash", "raw_hash must be a 64-hex sha256 string or null");
  }
  if (!isNullableNonNegativeInt(manifest["raw_size_bytes"])) {
    add("invalid_raw_size_bytes", "raw_size_bytes must be a non-negative integer or null");
  }
  if (!isNullableString(manifest["error_code"])) {
    add("invalid_error_code", "error_code must be a string or null");
  }
  if (!isNullableString(manifest["error_message"])) {
    add("invalid_error_message", "error_message must be a string or null");
  }
  if (!isNullableString(manifest["skipped_reason"])) {
    add("invalid_skipped_reason", "skipped_reason must be a string or null");
  }
  if (!isNullableString(manifest["rejected_reason"])) {
    add("invalid_rejected_reason", "rejected_reason must be a string or null");
  }

  const provenance = manifest["provenance"];
  if (!isObject(provenance)) {
    add("invalid_provenance", "provenance must be an object");
  } else {
    if (!isNonEmptyString(provenance["acquired_by"])) {
      add("invalid_provenance_acquired_by", "provenance.acquired_by must be a non-empty string");
    }
    if (provenance["tool"] !== "n8n") {
      add("invalid_provenance_tool", "provenance.tool must be 'n8n'");
    }
    if (!isNonEmptyString(provenance["tool_version"])) {
      add("invalid_provenance_tool_version", "provenance.tool_version must be a non-empty string");
    }
  }

  // Cross-field coherence only once the four fields above are individually
  // well-formed — otherwise a mismatch here would just be noise on top of the
  // field-level errors already raised.
  const drivePath = manifest["drive_target_path"];
  if (httpStatusOk && responseKindOk && statusOk && driveTargetFolderKindOk) {
    const rule = STATUS_RULES.find((r) => r.httpStatus === httpStatus && r.responseKind === responseKind);
    if (!rule) {
      add(
        "invalid_http_status_response_kind_combo",
        `http_status ${httpStatus} with response_kind '${responseKind}' is not a documented combination`,
      );
    } else {
      if (status !== rule.status) {
        add(
          "status_mismatch",
          `status '${status}' is inconsistent with http_status ${httpStatus} + response_kind '${responseKind}' (expected '${rule.status}')`,
        );
      }
      if (driveTargetFolderKind !== rule.driveTargetFolderKind) {
        add(
          "drive_target_folder_kind_mismatch",
          `drive_target_folder_kind '${driveTargetFolderKind}' is inconsistent with http_status ${httpStatus} + response_kind '${responseKind}' (expected '${rule.driveTargetFolderKind}')`,
        );
      }

      // Per-status payload completeness, only for a manifest that already
      // matches the decision table above (no point piling on more noise).
      if (status === rule.status && driveTargetFolderKind === rule.driveTargetFolderKind) {
        if (rule.status === "success") {
          if (!(typeof drivePath === "string" && DRIVE_PATH_RE.test(drivePath) && drivePath.startsWith("Raw/"))) {
            add("success_missing_drive_target_path", "a success manifest must have a Raw/<season>/... drive_target_path");
          }
          if (!isNonEmptyString(manifest["canonical_filename"])) {
            add("success_missing_canonical_filename", "a success manifest must have a non-empty canonical_filename");
          }
          if (!(rawHashOk && rawHash !== null)) {
            add("success_missing_raw_hash", "a success manifest must have a well-formed raw_hash");
          }
          const rawSize = manifest["raw_size_bytes"];
          if (!(typeof rawSize === "number" && Number.isInteger(rawSize) && rawSize > 0)) {
            add("success_invalid_raw_size_bytes", "a success manifest must have raw_size_bytes > 0");
          }
        } else if (rule.status === "skipped" || rule.status === "failed") {
          if (drivePath !== null) {
            add("no_payload_status_drive_target_path_not_null", `a ${rule.status} manifest must have drive_target_path = null`);
          }
          if (rawHash !== null) {
            add("no_payload_status_raw_hash_not_null", `a ${rule.status} manifest must have raw_hash = null`);
          }
          if (manifest["raw_size_bytes"] !== null) {
            add("no_payload_status_raw_size_bytes_not_null", `a ${rule.status} manifest must have raw_size_bytes = null`);
          }
        } else if (rule.status === "rejected") {
          if (!(typeof drivePath === "string" && REJECTED_DRIVE_PATH_RE.test(drivePath))) {
            add("rejected_missing_drive_target_path", "a rejected manifest must have a Rejected/<season>/... drive_target_path");
          }
          if (!isNonEmptyString(manifest["rejected_reason"])) {
            add("rejected_missing_reason", "a rejected manifest must have a non-empty rejected_reason");
          }
        }
      }
    }
  }

  // No real URL/secret in the source fields.
  const template = manifest["source_url_template"];
  if (typeof template !== "string" || !SOURCE_URL_TEMPLATE_RE.test(template)) {
    add("source_url_template_leak", "source_url_template must use the ENV placeholder only (no real host)");
  }
  const resolved = manifest["source_url_resolved_redacted"];
  if (typeof resolved !== "string" || !SOURCE_URL_RESOLVED_RE.test(resolved)) {
    add("source_url_resolved_leak", "source_url_resolved_redacted must keep the base URL redacted");
  }
  if (!isNonEmptyString(manifest["auth_secret_ref"])) {
    add("invalid_auth_secret_ref", "auth_secret_ref must be a non-empty symbolic string");
  }

  // No real Drive id: a stored payload's conceptual path must follow the
  // documented Raw/<season>/... or Rejected/<season>/... shape.
  if (drivePath !== null && (!isNonEmptyString(drivePath) || !DRIVE_PATH_RE.test(drivePath))) {
    add(
      "drive_target_path_not_conceptual",
      "drive_target_path must be a conceptual Raw/<season>/... or Rejected/<season>/... path, never a raw Drive id",
    );
  }

  // Fixed personal-use/private/no-redistribution invariants.
  if (manifest["source_license"] !== "proprietary_personal_use") {
    add("invalid_source_license", "source_license must be 'proprietary_personal_use'");
  }
  if (manifest["storage_allowed"] !== "private_drive_only") {
    add("invalid_storage_allowed", "storage_allowed must be 'private_drive_only'");
  }
  if (manifest["redistribution_allowed"] !== false) {
    add("redistribution_allowed_not_false", "redistribution_allowed must be false");
  }

  return finalize(issues);
}

function finalize(issues: AcquisitionManifestIssue[]): AcquisitionManifestValidationManifest {
  return {
    status: issues.length > 0 ? "invalid" : "valid",
    issueCount: issues.length,
    issues,
    data_promoted_eligible: false,
  };
}

/** Convenience: true iff the manifest has no coherence issues. */
export function isAcquisitionManifestAcceptable(m: AcquisitionManifestValidationManifest): boolean {
  return m.status === "valid";
}

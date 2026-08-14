import { createHash } from "node:crypto";

export const LISTONE_LIVE_BUNDLE_VERSION = "listone-live-bundle-v1";
export const LISTONE_LIVE_BUNDLE_MANIFEST_VERSION = "listone-live-bundle-manifest-v1";
export const LISTONE_CANDIDATE_SCHEMA_VERSION = "listone-candidate-wire-v1";

export type ListoneBundleRole = "P" | "D" | "C" | "A";

export interface ValidatedListoneBundleRow {
  readonly role: ListoneBundleRole;
}

export interface ListoneCandidateManifest {
  readonly source_id: string;
  readonly season: string;
  readonly raw_sha256: string;
  readonly transform_version: string;
  readonly schema_version: string;
  readonly candidate_sha256: string;
  readonly total_records: number;
  readonly role_counts: Readonly<Record<ListoneBundleRole, number>>;
  readonly validation_outcome: "ok";
  readonly collision_check_outcome: "COLLISION_CHECK_PASS";
  readonly in_process_repeatability: "PASS";
  readonly cross_process_determinism: "PASS";
  readonly parser_commit: string;
  readonly gates: Readonly<Record<BundleGate, false>>;
}

export type BundleGate =
  | "data_promoted"
  | "canonical_promoted"
  | "decision_promoted"
  | "fair_to_me_promoted"
  | "live_ui_ready";

export interface ListoneLiveBundleManifest {
  readonly manifest_version: typeof LISTONE_LIVE_BUNDLE_MANIFEST_VERSION;
  readonly bundle_version: typeof LISTONE_LIVE_BUNDLE_VERSION;
  readonly source_id: string;
  readonly season: string;
  readonly raw_sha256: string;
  readonly transform_version: string;
  readonly candidate_schema_version: typeof LISTONE_CANDIDATE_SCHEMA_VERSION;
  readonly candidate_sha256: string;
  readonly bundle_sha256: string;
  readonly bundle_size_bytes: number;
  readonly total_records: number;
  readonly role_counts: Readonly<Record<ListoneBundleRole, number>>;
  readonly parser_commit: string;
  readonly builder_commit: string;
  readonly validations: {
    readonly candidate_manifest: "PASS";
    readonly candidate_hash: "PASS";
    readonly canonical_serialization: "PASS";
    readonly ui_pool_contract: "PASS";
    readonly bundle_byte_identity: "PASS";
  };
  readonly runtime_contract: {
    readonly payload_shape: "top-level-array";
    readonly browser_local_static_asset: true;
    readonly backend_dependency: false;
    readonly decision_engine_dependency: false;
  };
  readonly rehearsal: {
    readonly pipeline: "PASS";
    readonly ui_preload: "NOT_RUN";
    readonly offline_runtime: "NOT_RUN";
    readonly manual_rehearsal: "NOT_RUN";
  };
  readonly promotion: {
    readonly status: "NOT_PROMOTED";
    readonly final_auction_run: false;
    readonly public_asset_written: false;
  };
  readonly gates: Readonly<Record<BundleGate, false>>;
  readonly staleness_rule: string;
}

export interface BuildListoneLiveBundleInput {
  readonly candidateText: string;
  readonly candidateManifest: unknown;
  readonly validatedRows: readonly ValidatedListoneBundleRow[];
  readonly builderCommit: string;
}

export interface BuildListoneLiveBundleResult {
  readonly bundleText: string;
  readonly bundleManifest: ListoneLiveBundleManifest;
  readonly bundleManifestText: string;
}

export class ListoneLiveBundleError extends Error {
  constructor(readonly errors: readonly string[]) {
    super(`Invalid listone live-bundle input:\n${errors.join("\n")}`);
    this.name = "ListoneLiveBundleError";
  }
}

const ROLE_ORDER: readonly ListoneBundleRole[] = ["P", "D", "C", "A"];
const GATES: readonly BundleGate[] = [
  "data_promoted",
  "canonical_promoted",
  "decision_promoted",
  "fair_to_me_promoted",
  "live_ui_ready",
];
const SHA256_RE = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const SEASON_RE = /^\d{4}_\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function utf8Size(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function countRoles(rows: readonly ValidatedListoneBundleRow[]): Record<ListoneBundleRole, number> {
  const counts: Record<ListoneBundleRole, number> = { P: 0, D: 0, C: 0, A: 0 };
  for (const row of rows) counts[row.role] += 1;
  return counts;
}

function parseCandidateManifest(value: unknown, errors: string[]): ListoneCandidateManifest | null {
  if (!isRecord(value)) {
    errors.push("candidate manifest must be an object");
    return null;
  }

  const requiredString = (key: string): string | null => {
    const candidate = value[key];
    if (typeof candidate !== "string" || candidate.trim() === "") {
      errors.push(`candidate manifest ${key} must be a non-empty string`);
      return null;
    }
    return candidate;
  };

  const sourceId = requiredString("source_id");
  const season = requiredString("season");
  const rawHash = requiredString("raw_sha256");
  const transformVersion = requiredString("transform_version");
  const schemaVersion = requiredString("schema_version");
  const candidateHash = requiredString("candidate_sha256");
  const parserCommit = requiredString("parser_commit");

  if (season !== null && !SEASON_RE.test(season)) errors.push("candidate manifest season must match YYYY_YY");
  if (rawHash !== null && !SHA256_RE.test(rawHash)) errors.push("candidate manifest raw_sha256 must be lowercase SHA-256");
  if (candidateHash !== null && !SHA256_RE.test(candidateHash)) errors.push("candidate manifest candidate_sha256 must be lowercase SHA-256");
  if (schemaVersion !== null && schemaVersion !== LISTONE_CANDIDATE_SCHEMA_VERSION) {
    errors.push(`candidate manifest schema_version must be ${LISTONE_CANDIDATE_SCHEMA_VERSION}`);
  }
  if (parserCommit !== null && !COMMIT_RE.test(parserCommit)) {
    errors.push("candidate manifest parser_commit must be a 40-character lowercase commit SHA");
  }

  const totalRecords = value.total_records;
  if (!Number.isInteger(totalRecords) || (totalRecords as number) < 0) {
    errors.push("candidate manifest total_records must be a non-negative integer");
  }

  const roleCountsValue = value.role_counts;
  const roleCounts: Record<ListoneBundleRole, number> = { P: 0, D: 0, C: 0, A: 0 };
  if (!isRecord(roleCountsValue)) {
    errors.push("candidate manifest role_counts must be an object");
  } else {
    const extraKeys = Object.keys(roleCountsValue).filter((key) => !ROLE_ORDER.includes(key as ListoneBundleRole));
    if (extraKeys.length > 0) errors.push(`candidate manifest role_counts has unknown roles: ${extraKeys.join(",")}`);
    for (const role of ROLE_ORDER) {
      const count = roleCountsValue[role];
      if (!Number.isInteger(count) || (count as number) < 0) {
        errors.push(`candidate manifest role_counts.${role} must be a non-negative integer`);
      } else {
        roleCounts[role] = count as number;
      }
    }
  }

  if (value.validation_outcome !== "ok") errors.push("candidate manifest validation_outcome must be ok");
  if (value.collision_check_outcome !== "COLLISION_CHECK_PASS") {
    errors.push("candidate manifest collision_check_outcome must be COLLISION_CHECK_PASS");
  }
  if (value.in_process_repeatability !== "PASS") {
    errors.push("candidate manifest in_process_repeatability must be PASS");
  }
  if (value.cross_process_determinism !== "PASS") {
    errors.push("candidate manifest cross_process_determinism must be PASS");
  }

  const gatesValue = value.gates;
  if (!isRecord(gatesValue)) {
    errors.push("candidate manifest gates must be an object");
  } else {
    const extraKeys = Object.keys(gatesValue).filter((key) => !GATES.includes(key as BundleGate));
    if (extraKeys.length > 0) errors.push(`candidate manifest gates has unknown keys: ${extraKeys.join(",")}`);
    for (const gate of GATES) {
      if (gatesValue[gate] !== false) errors.push(`candidate manifest gate ${gate} must remain false`);
    }
  }

  if (
    sourceId === null ||
    season === null ||
    rawHash === null ||
    transformVersion === null ||
    schemaVersion === null ||
    candidateHash === null ||
    parserCommit === null ||
    !Number.isInteger(totalRecords)
  ) return null;

  return {
    source_id: sourceId,
    season,
    raw_sha256: rawHash,
    transform_version: transformVersion,
    schema_version: schemaVersion,
    candidate_sha256: candidateHash,
    total_records: totalRecords as number,
    role_counts: roleCounts,
    validation_outcome: "ok",
    collision_check_outcome: "COLLISION_CHECK_PASS",
    in_process_repeatability: "PASS",
    cross_process_determinism: "PASS",
    parser_commit: parserCommit,
    gates: {
      data_promoted: false,
      canonical_promoted: false,
      decision_promoted: false,
      fair_to_me_promoted: false,
      live_ui_ready: false,
    },
  };
}

export function validateListoneLiveBundleInput(input: BuildListoneLiveBundleInput): readonly string[] {
  const errors: string[] = [];
  const manifest = parseCandidateManifest(input.candidateManifest, errors);

  let parsedCandidate: unknown = null;
  try {
    parsedCandidate = JSON.parse(input.candidateText);
  } catch {
    errors.push("candidate JSON is not parseable");
  }
  if (!Array.isArray(parsedCandidate)) errors.push("candidate JSON must be a top-level array");
  if (Array.isArray(parsedCandidate)) {
    const canonicalText = JSON.stringify(parsedCandidate, null, 2) + "\n";
    if (canonicalText !== input.candidateText) {
      errors.push("candidate JSON bytes are not in canonical 2-space/trailing-newline form");
    }
  }

  if (!COMMIT_RE.test(input.builderCommit)) {
    errors.push("builderCommit must be a 40-character lowercase commit SHA");
  }

  for (const [index, row] of input.validatedRows.entries()) {
    if (!ROLE_ORDER.includes(row.role)) errors.push(`validatedRows[${index}].role is invalid`);
  }

  if (manifest !== null) {
    const actualCandidateHash = sha256(input.candidateText);
    if (actualCandidateHash !== manifest.candidate_sha256) {
      errors.push(`candidate_sha256 mismatch: manifest=${manifest.candidate_sha256} actual=${actualCandidateHash}`);
    }
    if (manifest.total_records !== input.validatedRows.length) {
      errors.push(`total_records mismatch: manifest=${manifest.total_records} validated=${input.validatedRows.length}`);
    }
    if (Array.isArray(parsedCandidate) && parsedCandidate.length !== input.validatedRows.length) {
      errors.push(`candidate row-count mismatch: parsed=${parsedCandidate.length} validated=${input.validatedRows.length}`);
    }
    const actualRoleCounts = countRoles(input.validatedRows);
    for (const role of ROLE_ORDER) {
      if (manifest.role_counts[role] !== actualRoleCounts[role]) {
        errors.push(
          `role_counts.${role} mismatch: manifest=${manifest.role_counts[role]} validated=${actualRoleCounts[role]}`,
        );
      }
    }
  }

  return errors;
}

export function buildListoneLiveBundle(input: BuildListoneLiveBundleInput): BuildListoneLiveBundleResult {
  const errors = validateListoneLiveBundleInput(input);
  if (errors.length > 0) throw new ListoneLiveBundleError(errors);

  const manifestErrors: string[] = [];
  const candidateManifest = parseCandidateManifest(input.candidateManifest, manifestErrors);
  if (candidateManifest === null || manifestErrors.length > 0) {
    throw new ListoneLiveBundleError(
      manifestErrors.length > 0 ? manifestErrors : ["candidate manifest could not be parsed after validation"],
    );
  }

  const bundleText = input.candidateText;
  const bundleHash = sha256(bundleText);
  const roleCounts = countRoles(input.validatedRows);
  const gates: Record<BundleGate, false> = {
    data_promoted: false,
    canonical_promoted: false,
    decision_promoted: false,
    fair_to_me_promoted: false,
    live_ui_ready: false,
  };

  const bundleManifest: ListoneLiveBundleManifest = {
    manifest_version: LISTONE_LIVE_BUNDLE_MANIFEST_VERSION,
    bundle_version: LISTONE_LIVE_BUNDLE_VERSION,
    source_id: candidateManifest.source_id,
    season: candidateManifest.season,
    raw_sha256: candidateManifest.raw_sha256,
    transform_version: candidateManifest.transform_version,
    candidate_schema_version: LISTONE_CANDIDATE_SCHEMA_VERSION,
    candidate_sha256: candidateManifest.candidate_sha256,
    bundle_sha256: bundleHash,
    bundle_size_bytes: utf8Size(bundleText),
    total_records: input.validatedRows.length,
    role_counts: roleCounts,
    parser_commit: candidateManifest.parser_commit,
    builder_commit: input.builderCommit,
    validations: {
      candidate_manifest: "PASS",
      candidate_hash: "PASS",
      canonical_serialization: "PASS",
      ui_pool_contract: "PASS",
      bundle_byte_identity: "PASS",
    },
    runtime_contract: {
      payload_shape: "top-level-array",
      browser_local_static_asset: true,
      backend_dependency: false,
      decision_engine_dependency: false,
    },
    rehearsal: {
      pipeline: "PASS",
      ui_preload: "NOT_RUN",
      offline_runtime: "NOT_RUN",
      manual_rehearsal: "NOT_RUN",
    },
    promotion: {
      status: "NOT_PROMOTED",
      final_auction_run: false,
      public_asset_written: false,
    },
    gates,
    staleness_rule:
      "Any new raw_sha256 or candidate_sha256 makes this rehearsal bundle and manifest stale. Rebuild from the new snapshot; never reuse this bundle as FINAL_AUCTION_RUN.",
  };

  return {
    bundleText,
    bundleManifest,
    bundleManifestText: JSON.stringify(bundleManifest, null, 2) + "\n",
  };
}

// Raw-file acceptability (Validation + Identity Contract, level 1 "raw_file") —
// PURE, in-memory, fixture-only. Operationalizes on real bytes the magic-byte
// sniff step that VALIDATION_IDENTITY_CONTRACT.md (level 1) and
// PILOT_AUTHORIZATION_REQUEST.md (§4, "L1") describe as design: "esiste +
// .xlsx/OOXML plausibile (magic bytes ZIP) + raw_hash + linkage + manifest
// success + no overwrite silenzioso".
//
// Scope (approved minimal perimeter): superficial binary/provenance check only
// — magic bytes on a byte buffer, `raw_hash` *shape* (64-hex, computed upstream,
// out of scope here), season/matchday linkage, acquisition-manifest coherence,
// hash-change conflict. NO XLSX reading, NO parsing, NO hashing, NO file/
// network/Drive I/O, NO dependency. Bytes handed to this module are ALWAYS
// synthetic fixtures in this repo — no real XLSX ever ships here.
//
// Gate invariant (enforced by construction): `rawFileAcceptable success ≠
// data_promoted` — this module has no notion of promotion; it only decides
// whether a raw candidate clears the level-1 bar defined by the contract.

/** First 4 bytes of a ZIP/OOXML container (an .xlsx is a renamed ZIP). */
export const ZIP_MAGIC_BYTES: readonly number[] = Object.freeze([0x50, 0x4b, 0x03, 0x04]);

/** Superficial binary sniff — checks the leading bytes only, never parses content. */
export function hasZipMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < ZIP_MAGIC_BYTES.length) return false;
  return ZIP_MAGIC_BYTES.every((expected, i) => bytes[i] === expected);
}

/** Shared validation-status enum subset this level actually emits (see VALIDATION_IDENTITY_CONTRACT.md). */
export type RawFileAcceptability = "valid" | "invalid" | "rejected";

/** Deterministic reason codes for a non-`valid` outcome. */
export type RawFileRejectionReason =
  | "hash_change_conflict"
  | "empty_payload"
  | "non_excel_payload"
  | "missing_or_malformed_raw_hash"
  | "missing_season_link"
  | "invalid_season_link"
  | "manifest_not_success";

export interface RawFileCandidate {
  /** Raw payload bytes. Always a synthetic fixture in this repo. */
  readonly bytes: Uint8Array;
  /** sha256 hex digest, computed upstream (out of scope here) — this module only checks its shape. */
  readonly rawHash: string | null;
  readonly season: string | null;
  readonly seasonCode: string | null;
  readonly matchday: number | null;
  /** `status` of the linked acquisition manifest (level 2). */
  readonly manifestStatus: string;
  /** True when `rawHash` differs from a previously known hash for the same season/matchday (anti-overwrite). */
  readonly hashConflict: boolean;
}

export interface RawFileValidationResult {
  readonly status: RawFileAcceptability;
  readonly rawSizeBytes: number;
  readonly reason: RawFileRejectionReason | null;
}

const RAW_HASH_RE = /^[a-f0-9]{64}$/;

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

/**
 * True only if `seasonCode` is a known 0D code (10..21), `season` is exactly the
 * season it maps to (not just any `YYYY_YY`-shaped string), and `matchday` is an
 * integer in 1..38 — the actual 0D/L1 linkage contract, not mere field presence.
 */
function isValidSeasonLinkage(season: string, seasonCode: string, matchday: number): boolean {
  const expectedSeason = SEASON_CODE_MAP[seasonCode];
  if (expectedSeason === undefined || expectedSeason !== season) return false;
  return Number.isInteger(matchday) && matchday >= 1 && matchday <= 38;
}

/**
 * Decides whether a raw candidate is an acceptable level-1 "raw_file" —
 * mirrors, on real bytes, the acceptability predicate of
 * VALIDATION_IDENTITY_CONTRACT.md §"Livello 1". Order matches the contract:
 * anti-overwrite first, then payload/format, then linkage, then manifest.
 */
export function rawFileAcceptable(candidate: RawFileCandidate): RawFileValidationResult {
  const rawSizeBytes = candidate.bytes.length;

  if (candidate.hashConflict) {
    return { status: "rejected", rawSizeBytes, reason: "hash_change_conflict" };
  }
  if (rawSizeBytes <= 0) {
    return { status: "invalid", rawSizeBytes, reason: "empty_payload" };
  }
  if (!hasZipMagicBytes(candidate.bytes)) {
    return { status: "rejected", rawSizeBytes, reason: "non_excel_payload" };
  }
  if (!candidate.rawHash || !RAW_HASH_RE.test(candidate.rawHash)) {
    return { status: "invalid", rawSizeBytes, reason: "missing_or_malformed_raw_hash" };
  }
  if (!candidate.season || !candidate.seasonCode || candidate.matchday == null) {
    return { status: "invalid", rawSizeBytes, reason: "missing_season_link" };
  }
  if (!isValidSeasonLinkage(candidate.season, candidate.seasonCode, candidate.matchday)) {
    return { status: "invalid", rawSizeBytes, reason: "invalid_season_link" };
  }
  if (candidate.manifestStatus !== "success") {
    return { status: "invalid", rawSizeBytes, reason: "manifest_not_success" };
  }
  return { status: "valid", rawSizeBytes, reason: null };
}

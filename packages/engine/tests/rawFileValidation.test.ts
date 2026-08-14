import { describe, it, expect } from "vitest";
import { hasZipMagicBytes, rawFileAcceptable, ZIP_MAGIC_BYTES, type RawFileCandidate } from "../src/rawFileValidation.js";

// PURE, in-memory, fixture-only. Bytes below are synthetic filler — NEVER a real
// XLSX file. This locks the level-1 "raw_file" acceptability predicate on real
// byte buffers (VALIDATION_IDENTITY_CONTRACT.md §"Livello 1",
// PILOT_AUTHORIZATION_REQUEST.md §4 "L1").

const H = "a".repeat(64);

function syntheticZipLike(extraByteCount = 16): Uint8Array {
  return Uint8Array.from([...ZIP_MAGIC_BYTES, ...Array.from({ length: extraByteCount }, (_, i) => i % 256)]);
}

function syntheticHtml(): Uint8Array {
  return new TextEncoder().encode("<!DOCTYPE html><html></html>");
}

const baseCandidate: RawFileCandidate = {
  bytes: syntheticZipLike(),
  rawHash: H,
  season: "2021_22",
  seasonCode: "16",
  matchday: 38,
  manifestStatus: "success",
  hashConflict: false,
};

describe("hasZipMagicBytes", () => {
  it("recognizes the ZIP/OOXML magic bytes at the start of a buffer", () => {
    expect(hasZipMagicBytes(syntheticZipLike())).toBe(true);
  });
  it("rejects a buffer without the magic bytes", () => {
    expect(hasZipMagicBytes(syntheticHtml())).toBe(false);
  });
  it("rejects a buffer shorter than the magic-byte sequence", () => {
    expect(hasZipMagicBytes(Uint8Array.from([0x50, 0x4b]))).toBe(false);
  });
  it("does not match if any of the first 4 bytes differs", () => {
    expect(hasZipMagicBytes(Uint8Array.from([0x50, 0x4b, 0x03, 0x05, 0x00]))).toBe(false);
  });
});

describe("rawFileAcceptable — level 1 predicate on real bytes", () => {
  it("a complete, ZIP-magic, hashed, linked candidate with a success manifest is valid", () => {
    const r = rawFileAcceptable(baseCandidate);
    expect(r.status).toBe("valid");
    expect(r.reason).toBeNull();
    expect(r.rawSizeBytes).toBe(baseCandidate.bytes.length);
  });

  it("hash-change conflict is rejected before any other check (no silent overwrite)", () => {
    const r = rawFileAcceptable({ ...baseCandidate, hashConflict: true, bytes: syntheticHtml() });
    expect(r.status).toBe("rejected");
    expect(r.reason).toBe("hash_change_conflict");
  });

  it("empty payload is invalid", () => {
    const r = rawFileAcceptable({ ...baseCandidate, bytes: new Uint8Array(0) });
    expect(r.status).toBe("invalid");
    expect(r.reason).toBe("empty_payload");
  });

  it("a non-Excel payload (real bytes, no magic match) is rejected", () => {
    const r = rawFileAcceptable({ ...baseCandidate, bytes: syntheticHtml() });
    expect(r.status).toBe("rejected");
    expect(r.reason).toBe("non_excel_payload");
  });

  it("a missing or malformed raw_hash is invalid", () => {
    expect(rawFileAcceptable({ ...baseCandidate, rawHash: null }).reason).toBe("missing_or_malformed_raw_hash");
    expect(rawFileAcceptable({ ...baseCandidate, rawHash: "not-a-hash" }).reason).toBe(
      "missing_or_malformed_raw_hash",
    );
  });

  it("a missing season/season_code/matchday link is invalid", () => {
    expect(rawFileAcceptable({ ...baseCandidate, season: null }).reason).toBe("missing_season_link");
    expect(rawFileAcceptable({ ...baseCandidate, seasonCode: null }).reason).toBe("missing_season_link");
    expect(rawFileAcceptable({ ...baseCandidate, matchday: null }).reason).toBe("missing_season_link");
  });

  it("accepts the synthetic 2026/27 linkage and rejects codes outside the 10..21 mapping", () => {
    expect(
      rawFileAcceptable({ ...baseCandidate, season: "2026_27", seasonCode: "21" }),
    ).toMatchObject({ status: "valid", reason: null });
    expect(rawFileAcceptable({ ...baseCandidate, seasonCode: "09" }).reason).toBe("invalid_season_link");
    expect(rawFileAcceptable({ ...baseCandidate, season: "2026_27", seasonCode: "22" }).reason).toBe("invalid_season_link");
  });

  it("a season that does not match the mapped season for season_code is invalid (not just non-empty)", () => {
    // season_code 17 maps to 2022_23, not 2021_22 — well-formed but wrong per the 0D mapping.
    const r = rawFileAcceptable({ ...baseCandidate, seasonCode: "17" });
    expect(r.status).toBe("invalid");
    expect(r.reason).toBe("invalid_season_link");
  });

  it("a matchday outside 1..38 is invalid", () => {
    expect(rawFileAcceptable({ ...baseCandidate, matchday: 0 }).reason).toBe("invalid_season_link");
    expect(rawFileAcceptable({ ...baseCandidate, matchday: 39 }).reason).toBe("invalid_season_link");
  });

  it("a non-integer matchday is invalid", () => {
    expect(rawFileAcceptable({ ...baseCandidate, matchday: 38.5 }).reason).toBe("invalid_season_link");
  });

  it("a manifest status other than success is invalid", () => {
    const r = rawFileAcceptable({ ...baseCandidate, manifestStatus: "skipped" });
    expect(r.status).toBe("invalid");
    expect(r.reason).toBe("manifest_not_success");
  });

  it("is deterministic (same candidate -> same result)", () => {
    expect(rawFileAcceptable(baseCandidate)).toEqual(rawFileAcceptable({ ...baseCandidate }));
  });
});

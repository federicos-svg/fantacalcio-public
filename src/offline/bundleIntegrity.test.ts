// Runtime bundle-hash verification (BUNDLE-01 Part 2).
//
// The load-bearing test in this file is the compatibility one: it runs the REAL
// build-time builder (packages/xlsx-adapter/src/listoneLiveBundle.ts, which
// hashes with node:crypto `createHash`) and feeds its real output bytes and its
// real manifest to the runtime verifier (which hashes with WebCrypto
// `crypto.subtle.digest`). If those two ever stop producing the same hex
// string, the auction-day artifact would be unverifiable and this test goes
// red — which is the only reason to believe the two halves are compatible at
// all. Everything else here is the fail-closed matrix.
//
// No DOM: pure functions plus Node's own WebCrypto, per this repo's no-jsdom
// posture (see src/ui/listone.ts).
import { createHash, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildListoneLiveBundle,
  LISTONE_CANDIDATE_SCHEMA_VERSION,
  LISTONE_LIVE_BUNDLE_MANIFEST_VERSION as BUILDER_MANIFEST_VERSION,
  LISTONE_LIVE_BUNDLE_VERSION as BUILDER_BUNDLE_VERSION,
} from "../../packages/xlsx-adapter/src/listoneLiveBundle.js";
import {
  bundleIntegrityFailureText,
  declaredOnGate,
  LISTONE_LIVE_BUNDLE_MANIFEST_VERSION,
  LISTONE_LIVE_BUNDLE_VERSION,
  MANIFEST_ABSENT,
  parseRuntimeBundleManifest,
  sha256HexOf,
  toHex,
  verifyListoneBundle,
} from "./bundleIntegrity.js";

const subtle = webcrypto.subtle;

const ROWS = [
  { name: "Alpha Sintetico", role: "P", club: "Club Uno", quotation: 4 },
  { name: "Beta Sintetico", role: "D", club: "Club Due", quotation: 7 },
  { name: "Gamma Sintetico", role: "C", club: "Club Tre", quotation: 9 },
  { name: "Delta Sintetico", role: "A", club: "Club Quattro", quotation: 12 },
] as const;

const CANDIDATE_TEXT = JSON.stringify(ROWS, null, 2) + "\n";
const CANDIDATE_HASH = createHash("sha256").update(CANDIDATE_TEXT, "utf8").digest("hex");

function builderInput() {
  return {
    candidateText: CANDIDATE_TEXT,
    validatedRows: ROWS,
    builderCommit: "a".repeat(40),
    candidateManifest: {
      source_id: "fantacalcio_xlsx",
      season: "2026_27",
      raw_sha256: "b".repeat(64),
      transform_version: "listone-xlsx-v2",
      schema_version: LISTONE_CANDIDATE_SCHEMA_VERSION,
      candidate_sha256: CANDIDATE_HASH,
      total_records: ROWS.length,
      role_counts: { P: 1, D: 1, C: 1, A: 1 },
      validation_outcome: "ok" as const,
      collision_check_outcome: "COLLISION_CHECK_PASS" as const,
      in_process_repeatability: "PASS" as const,
      cross_process_determinism: "PASS" as const,
      parser_commit: "c".repeat(40),
      gates: {
        data_promoted: false,
        canonical_promoted: false,
        decision_promoted: false,
        fair_to_me_promoted: false,
        live_ui_ready: false,
      },
    },
  };
}

/** UTF-8 bytes of a string as a standalone ArrayBuffer — what a real
 *  `response.arrayBuffer()` hands the gate. */
function utf8(text: string): ArrayBuffer {
  const view = new TextEncoder().encode(text);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

describe("build-time <-> runtime hash compatibility", () => {
  it("keeps the two version constants identical to the builder's", () => {
    expect(LISTONE_LIVE_BUNDLE_MANIFEST_VERSION).toBe(BUILDER_MANIFEST_VERSION);
    expect(LISTONE_LIVE_BUNDLE_VERSION).toBe(BUILDER_BUNDLE_VERSION);
  });

  it("verifies a bundle produced by the real builder against its real manifest", async () => {
    const built = buildListoneLiveBundle(builderInput());
    const verdict = await verifyListoneBundle({
      bytes: utf8(built.bundleText),
      manifestJson: JSON.parse(built.bundleManifestText),
      digest: subtle,
    });

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    // Byte-for-byte: what the browser computed IS what the builder wrote.
    expect(verdict.sha256).toBe(built.bundleManifest.bundle_sha256);
    expect(verdict.sha256).toBe(createHash("sha256").update(built.bundleText, "utf8").digest("hex"));
    expect(verdict.manifest.total_records).toBe(ROWS.length);
  });

  it("rejects the real builder's manifest against a bundle with one byte changed", async () => {
    const built = buildListoneLiveBundle(builderInput());
    const tampered = built.bundleText.replace("Alpha Sintetico", "Alpha Sintetica");
    expect(tampered).not.toBe(built.bundleText);
    expect(tampered.length).toBe(built.bundleText.length);

    const verdict = await verifyListoneBundle({
      bytes: utf8(tampered),
      manifestJson: JSON.parse(built.bundleManifestText),
      digest: subtle,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failure.kind).toBe("hash-mismatch");
  });
});

describe("sha256HexOf", () => {
  it("matches node's createHash for the same bytes, lowercase hex", async () => {
    const text = "listone-live-bundle";
    const result = await sha256HexOf(subtle, utf8(text));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hex).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
    expect(result.hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the leading zero of every byte below 0x10", () => {
    // 0x00 0x0f 0xff — the classic hex-encoder bug drops the first two zeros.
    const bytes = new Uint8Array([0, 15, 255]);
    expect(toHex(bytes.buffer as ArrayBuffer)).toBe("000fff");
  });

  it("fails closed when crypto.subtle is unavailable (insecure context)", async () => {
    const result = await sha256HexOf(null, utf8("x"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("digest-unavailable");
  });

  it("fails closed when digest itself throws", async () => {
    const result = await sha256HexOf(
      {
        digest: () => {
          throw new Error("boom");
        },
      },
      utf8("x"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toEqual({ kind: "digest-failed", message: "boom" });
  });
});

describe("parseRuntimeBundleManifest", () => {
  const valid = {
    manifest_version: LISTONE_LIVE_BUNDLE_MANIFEST_VERSION,
    bundle_version: LISTONE_LIVE_BUNDLE_VERSION,
    bundle_sha256: "d".repeat(64),
    bundle_size_bytes: 12,
    total_records: 3,
    source_id: "fantacalcio_xlsx",
    season: "2026_27",
  };

  it("accepts a well-formed manifest", () => {
    const parsed = parseRuntimeBundleManifest(valid);
    expect(parsed.ok).toBe(true);
  });

  it("refuses a manifest for another artifact kind even when it carries a sha256", () => {
    const parsed = parseRuntimeBundleManifest({ ...valid, manifest_version: "some-other-manifest-v1" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join(" ")).toContain("manifest_version");
  });

  it.each([
    ["uppercase hash", { bundle_sha256: "D".repeat(64) }],
    ["short hash", { bundle_sha256: "d".repeat(63) }],
    ["missing size", { bundle_size_bytes: undefined }],
    ["negative records", { total_records: -1 }],
    ["empty season", { season: "" }],
  ])("refuses a manifest with %s", (_label, patch) => {
    expect(parseRuntimeBundleManifest({ ...valid, ...patch }).ok).toBe(false);
  });

  it.each([null, "text", 7, [], undefined])("refuses a non-object manifest (%s)", (value) => {
    expect(parseRuntimeBundleManifest(value).ok).toBe(false);
  });
});

describe("declaredOnGate", () => {
  it("finds a gate declared ON", () => {
    expect(declaredOnGate({ gates: { data_promoted: false, live_ui_ready: true } })).toBe("live_ui_ready");
  });
  it("treats all-false and missing gates as no gate on", () => {
    expect(declaredOnGate({ gates: { data_promoted: false } })).toBeNull();
    expect(declaredOnGate({})).toBeNull();
    expect(declaredOnGate("nope")).toBeNull();
  });
});

describe("verifyListoneBundle fail-closed matrix", () => {
  const bundleText = JSON.stringify(ROWS, null, 2) + "\n";
  const bundleBytes = utf8(bundleText);
  const goodManifest = {
    manifest_version: LISTONE_LIVE_BUNDLE_MANIFEST_VERSION,
    bundle_version: LISTONE_LIVE_BUNDLE_VERSION,
    bundle_sha256: createHash("sha256").update(bundleText, "utf8").digest("hex"),
    bundle_size_bytes: Buffer.byteLength(bundleText, "utf8"),
    total_records: ROWS.length,
    source_id: "fantacalcio_xlsx",
    season: "2026_27",
    gates: {
      data_promoted: false,
      canonical_promoted: false,
      decision_promoted: false,
      fair_to_me_promoted: false,
      live_ui_ready: false,
    },
  };

  it("accepts matching bytes", async () => {
    const verdict = await verifyListoneBundle({ bytes: bundleBytes, manifestJson: goodManifest, digest: subtle });
    expect(verdict.ok).toBe(true);
  });

  it("refuses an absent manifest", async () => {
    const verdict = await verifyListoneBundle({ bytes: bundleBytes, manifestJson: MANIFEST_ABSENT, digest: subtle });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failure.kind).toBe("manifest-absent");
  });

  it("refuses a malformed manifest", async () => {
    const verdict = await verifyListoneBundle({
      bytes: bundleBytes,
      manifestJson: { manifest_version: "wrong" },
      digest: subtle,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failure.kind).toBe("manifest-malformed");
  });

  it("refuses a divergent hash and names both sides", async () => {
    const verdict = await verifyListoneBundle({
      bytes: bundleBytes,
      manifestJson: { ...goodManifest, bundle_sha256: "e".repeat(64) },
      digest: subtle,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok || verdict.failure.kind !== "hash-mismatch") throw new Error("expected hash-mismatch");
    expect(verdict.failure.expected).toBe("e".repeat(64));
    expect(verdict.failure.actual).toBe(goodManifest.bundle_sha256);
  });

  it("refuses a size that disagrees before hashing anything", async () => {
    const verdict = await verifyListoneBundle({
      bytes: bundleBytes,
      manifestJson: { ...goodManifest, bundle_size_bytes: goodManifest.bundle_size_bytes + 1 },
      // A null digest proves the size check ran first: it would have failed
      // with digest-unavailable otherwise.
      digest: null,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failure.kind).toBe("size-mismatch");
  });

  it("refuses when crypto.subtle is unavailable", async () => {
    const verdict = await verifyListoneBundle({ bytes: bundleBytes, manifestJson: goodManifest, digest: null });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failure.kind).toBe("digest-unavailable");
  });

  it("refuses a manifest that declares a gate ON", async () => {
    const verdict = await verifyListoneBundle({
      bytes: bundleBytes,
      manifestJson: { ...goodManifest, gates: { ...goodManifest.gates, decision_promoted: true } },
      digest: subtle,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok || verdict.failure.kind !== "gate-declared-on") throw new Error("expected gate-declared-on");
    expect(verdict.failure.gate).toBe("decision_promoted");
  });

  it("refuses bytes that hash correctly but are not the array the runtime expects", async () => {
    const notAnArray = '{"rows":[]}';
    const verdict = await verifyListoneBundle({
      bytes: utf8(notAnArray),
      manifestJson: {
        ...goodManifest,
        bundle_sha256: createHash("sha256").update(notAnArray, "utf8").digest("hex"),
        bundle_size_bytes: Buffer.byteLength(notAnArray, "utf8"),
      },
      digest: subtle,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failure.kind).toBe("bundle-unparseable");
  });

  it("refuses a row count that disagrees with the manifest", async () => {
    const verdict = await verifyListoneBundle({
      bytes: bundleBytes,
      manifestJson: { ...goodManifest, total_records: ROWS.length + 1 },
      digest: subtle,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failure.kind).toBe("record-count-mismatch");
  });

  it("verifies an empty bundle only against a manifest that declares it empty", async () => {
    const emptyText = "[]\n";
    const emptyManifest = {
      ...goodManifest,
      bundle_sha256: createHash("sha256").update(emptyText, "utf8").digest("hex"),
      bundle_size_bytes: Buffer.byteLength(emptyText, "utf8"),
      total_records: 0,
    };
    const verdict = await verifyListoneBundle({ bytes: utf8(emptyText), manifestJson: emptyManifest, digest: subtle });
    expect(verdict.ok).toBe(true);
  });
});

describe("bundleIntegrityFailureText", () => {
  it("names the asset, the expectation and the reality on a mismatch", () => {
    const text = bundleIntegrityFailureText("/data/listone.json", {
      kind: "hash-mismatch",
      expected: "a".repeat(64),
      actual: "b".repeat(64),
    });
    expect(text).toContain("/data/listone.json");
    expect(text).toContain("a".repeat(64));
    expect(text).toContain("b".repeat(64));
  });

  it("produces a non-empty, asset-naming sentence for every failure kind", () => {
    const failures = [
      { kind: "manifest-absent" },
      { kind: "manifest-malformed", errors: ["x"] },
      { kind: "digest-unavailable" },
      { kind: "digest-failed", message: "boom" },
      { kind: "hash-mismatch", expected: "a", actual: "b" },
      { kind: "size-mismatch", expected: 1, actual: 2 },
      { kind: "bundle-unparseable" },
      { kind: "record-count-mismatch", expected: 1, actual: 2 },
      { kind: "gate-declared-on", gate: "live_ui_ready" },
      { kind: "integrity-policy-unusable", errors: ["/app-integrity.json missing"] },
    ] as const;
    for (const failure of failures) {
      const text = bundleIntegrityFailureText("/data/x.json", failure);
      expect(text.length).toBeGreaterThan(20);
      expect(text).toContain("/data/x.json");
    }
  });
});

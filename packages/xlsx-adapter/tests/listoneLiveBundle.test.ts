import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildListoneLiveBundle,
  LISTONE_CANDIDATE_SCHEMA_VERSION,
  LISTONE_LIVE_BUNDLE_MANIFEST_VERSION,
  LISTONE_LIVE_BUNDLE_VERSION,
  ListoneLiveBundleError,
  validateListoneLiveBundleInput,
  type BuildListoneLiveBundleInput,
} from "../src/listoneLiveBundle.js";

const ROWS = [
  { name: "Alpha Synthetic", role: "P", club: "Club One", quotation: 4 },
  { name: "Beta Synthetic", role: "D", club: "Club Two", quotation: 7 },
  { name: "Gamma Synthetic", role: "C", club: "Club Three", quotation: 9 },
  { name: "Delta Synthetic", role: "A", club: "Club Four", quotation: 12 },
] as const;
const CANDIDATE_TEXT = JSON.stringify(ROWS, null, 2) + "\n";
const CANDIDATE_HASH = createHash("sha256").update(CANDIDATE_TEXT, "utf8").digest("hex");
const COMMIT = "a".repeat(40);
const RAW_HASH = "b".repeat(64);

function validInput(): BuildListoneLiveBundleInput {
  return {
    candidateText: CANDIDATE_TEXT,
    validatedRows: ROWS,
    builderCommit: COMMIT,
    candidateManifest: {
      source_id: "fantacalcio_listino_xlsx",
      season: "2026_27",
      raw_sha256: RAW_HASH,
      transform_version: "listone-xlsx-v2",
      schema_version: LISTONE_CANDIDATE_SCHEMA_VERSION,
      candidate_sha256: CANDIDATE_HASH,
      total_records: 4,
      role_counts: { P: 1, D: 1, C: 1, A: 1 },
      validation_outcome: "ok",
      collision_check_outcome: "COLLISION_CHECK_PASS",
      in_process_repeatability: "PASS",
      cross_process_determinism: "PASS",
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

describe("listone live-bundle rehearsal", () => {
  it("keeps bundle bytes identical to the validated candidate", () => {
    const result = buildListoneLiveBundle(validInput());
    expect(result.bundleText).toBe(CANDIDATE_TEXT);
    expect(result.bundleManifest.bundle_sha256).toBe(CANDIDATE_HASH);
    expect(result.bundleManifest.candidate_sha256).toBe(CANDIDATE_HASH);
    expect(result.bundleManifest.validations.bundle_byte_identity).toBe("PASS");
  });

  it("emits a deterministic non-promotional manifest", () => {
    const first = buildListoneLiveBundle(validInput());
    const second = buildListoneLiveBundle(validInput());
    expect(first.bundleManifestText).toBe(second.bundleManifestText);
    expect(first.bundleManifest.manifest_version).toBe(LISTONE_LIVE_BUNDLE_MANIFEST_VERSION);
    expect(first.bundleManifest.bundle_version).toBe(LISTONE_LIVE_BUNDLE_VERSION);
    expect(first.bundleManifest.promotion).toEqual({
      status: "NOT_PROMOTED",
      final_auction_run: false,
      public_asset_written: false,
    });
    expect(Object.values(first.bundleManifest.gates).every((gate) => gate === false)).toBe(true);
  });

  it("records only the pipeline as passed and leaves UI/offline/manual evidence not run", () => {
    const result = buildListoneLiveBundle(validInput());
    expect(result.bundleManifest.rehearsal).toEqual({
      pipeline: "PASS",
      ui_preload: "NOT_RUN",
      offline_runtime: "NOT_RUN",
      manual_rehearsal: "NOT_RUN",
    });
  });

  it("rejects a candidate hash mismatch", () => {
    const input = validInput();
    const candidateManifest = { ...(input.candidateManifest as Record<string, unknown>), candidate_sha256: "d".repeat(64) };
    expect(validateListoneLiveBundleInput({ ...input, candidateManifest })).toContain(
      `candidate_sha256 mismatch: manifest=${"d".repeat(64)} actual=${CANDIDATE_HASH}`,
    );
  });

  it("rejects manifest row-count and role-count drift", () => {
    const input = validInput();
    const candidateManifest = {
      ...(input.candidateManifest as Record<string, unknown>),
      total_records: 5,
      role_counts: { P: 2, D: 1, C: 1, A: 1 },
    };
    const errors = validateListoneLiveBundleInput({ ...input, candidateManifest });
    expect(errors).toContain("total_records mismatch: manifest=5 validated=4");
    expect(errors).toContain("role_counts.P mismatch: manifest=2 validated=1");
  });

  it("rejects any gate that is not explicitly false", () => {
    const input = validInput();
    const manifest = input.candidateManifest as Record<string, unknown>;
    const gates = { ...(manifest.gates as Record<string, unknown>), live_ui_ready: true };
    const errors = validateListoneLiveBundleInput({ ...input, candidateManifest: { ...manifest, gates } });
    expect(errors).toContain("candidate manifest gate live_ui_ready must remain false");
  });

  it("rejects non-canonical JSON bytes even when the parsed rows are equivalent", () => {
    const input = validInput();
    const compact = JSON.stringify(ROWS);
    const hash = createHash("sha256").update(compact, "utf8").digest("hex");
    const manifest = { ...(input.candidateManifest as Record<string, unknown>), candidate_sha256: hash };
    expect(validateListoneLiveBundleInput({ ...input, candidateText: compact, candidateManifest: manifest })).toContain(
      "candidate JSON bytes are not in canonical 2-space/trailing-newline form",
    );
  });

  it("rejects a manifest that claims the wrong candidate schema", () => {
    const input = validInput();
    const candidateManifest = { ...(input.candidateManifest as Record<string, unknown>), schema_version: "future-wire-v9" };
    expect(validateListoneLiveBundleInput({ ...input, candidateManifest })).toContain(
      `candidate manifest schema_version must be ${LISTONE_CANDIDATE_SCHEMA_VERSION}`,
    );
  });

  it("rejects missing parser commit provenance", () => {
    const input = validInput();
    const candidateManifest = { ...(input.candidateManifest as Record<string, unknown>), parser_commit: "unknown" };
    expect(validateListoneLiveBundleInput({ ...input, candidateManifest })).toContain(
      "candidate manifest parser_commit must be a 40-character lowercase commit SHA",
    );
  });

  it("rejects malformed candidate JSON", () => {
    const input = validInput();
    const malformed = '[{"name":';
    const candidateManifest = {
      ...(input.candidateManifest as Record<string, unknown>),
      candidate_sha256: createHash("sha256").update(malformed, "utf8").digest("hex"),
    };
    const errors = validateListoneLiveBundleInput({ ...input, candidateText: malformed, candidateManifest });
    expect(errors).toContain("candidate JSON is not parseable");
    expect(errors).toContain("candidate JSON must be a top-level array");
  });

  it("rejects a parseable candidate payload that is not an array", () => {
    const input = validInput();
    const objectPayload = JSON.stringify({ rows: ROWS }, null, 2) + "\n";
    const candidateManifest = {
      ...(input.candidateManifest as Record<string, unknown>),
      candidate_sha256: createHash("sha256").update(objectPayload, "utf8").digest("hex"),
    };
    expect(
      validateListoneLiveBundleInput({ ...input, candidateText: objectPayload, candidateManifest }),
    ).toContain("candidate JSON must be a top-level array");
  });

  it("rejects an invalid role in the validated rows", () => {
    const input = validInput();
    const validatedRows = [{ role: "X" }] as unknown as BuildListoneLiveBundleInput["validatedRows"];
    expect(validateListoneLiveBundleInput({ ...input, validatedRows })).toContain(
      "validatedRows[0].role is invalid",
    );
  });

  it("throws one fail-closed error containing all validation failures", () => {
    const input = validInput();
    expect(() => buildListoneLiveBundle({ ...input, builderCommit: "not-a-commit" })).toThrow(ListoneLiveBundleError);
  });
});

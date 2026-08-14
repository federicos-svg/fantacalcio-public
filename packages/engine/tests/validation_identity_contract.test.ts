import { describe, it, expect } from "vitest";
import { z } from "zod";

// Design-only contract checks for Batch 0E (Validation + Identity).
// NO parser, NO ingestion, NO real data, data_promoted stays OFF.
// Fixtures are synthetic. This locks:
//  - schemas/fantacalcio_validation_manifest.schema.json,
//  - schemas/fantacalcio_identity_candidate.schema.json,
//  - schemas/fantacalcio_manual_review_item.schema.json,
//  - the shared status enum, the "data_promoted stays OFF" invariant,
//  - the raw-file acceptability predicate, and the
//    "ambiguous identity never auto-promotes" rule.

const STATUS = ["valid", "invalid", "warning", "ambiguous", "requires_manual_review", "rejected"] as const;

const validationManifest = z
  .object({
    validation_id: z.string().min(1),
    validation_level: z.enum([
      "raw_file",
      "acquisition_manifest",
      "normalized_candidate",
      "vote_record",
      "identity",
      "promotion_gate",
    ]),
    target_ref: z.string().min(1),
    season: z.string().regex(/^[0-9]{4}_[0-9]{2}$/).nullable(),
    season_code: z.string().regex(/^(1[0-9]|2[01])$/).nullable(),
    matchday: z.number().int().min(1).max(38).nullable(),
    status: z.enum(STATUS),
    checks: z.array(
      z
        .object({
          check_id: z.string().min(1),
          name: z.string().min(1),
          outcome: z.enum(["pass", "fail", "warn", "skip"]),
          detail: z.string().optional(),
        })
        .strict(),
    ),
    blocking: z.boolean(),
    requires_manual_review: z.boolean(),
    review_item_ref: z.string().nullable(),
    validated_at: z.string().min(1),
    validator: z.string().min(1),
    notes: z.string().optional(),
    data_promoted_eligible: z.literal(false),
  })
  .strict();

const identityCandidate = z
  .object({
    identity_candidate_id: z.string().min(1),
    entity_kind: z.enum(["player", "team"]),
    canonical_player_id: z.string().nullable(),
    canonical_team_id: z.string().nullable(),
    display_name: z.string().min(1),
    source_name: z.string().min(1),
    normalized_name: z.string().min(1),
    aliases: z.array(z.string().min(1)),
    season: z.string().regex(/^[0-9]{4}_[0-9]{2}$/).nullable(),
    season_code: z.string().regex(/^(1[0-9]|2[01])$/).nullable(),
    team_context: z.string().nullable(),
    external_ids: z.array(
      z.object({ source_id: z.string().min(1), external_id: z.string().min(1) }).strict(),
    ),
    confidence: z.number().min(0).max(1),
    match_method: z.enum(["exact", "normalized", "fuzzy", "manual", "none"]),
    identity_status: z.enum(STATUS),
    ambiguity_kind: z
      .enum([
        "homonym",
        "team_change",
        "name_change_suffix",
        "abbreviation",
        "special_chars_accents",
        "new_foreign",
        "team_naming_variant",
      ])
      .nullable(),
    manual_review_reason: z.string().nullable(),
    provenance: z
      .object({
        source_id: z.string().min(1),
        acquisition_ref: z.string().min(1),
        observed_in: z.string().min(1),
      })
      .strict(),
    canonical_promoted: z.literal(false),
  })
  .strict();

const reviewItem = z
  .object({
    review_item_id: z.string().min(1),
    created_at: z.string().min(1),
    origin: z.enum(["validation", "identity"]),
    origin_ref: z.string().min(1),
    entity_kind: z.enum(["player", "team", "file", "manifest", "vote_record", "none"]),
    reason_code: z.enum([
      "ambiguous_identity",
      "homonym",
      "team_change",
      "name_change",
      "abbreviation",
      "special_chars",
      "new_foreign",
      "team_naming_variant",
      "hash_change_conflict",
      "schema_violation",
      "low_confidence",
      "other",
    ]),
    reason_detail: z.string().optional().or(z.string()),
    candidates: z.array(
      z.object({ ref: z.string().min(1), score: z.number().min(0).max(1), note: z.string().optional() }).strict(),
    ),
    blocking: z.boolean(),
    status: z.enum(["open", "resolved", "rejected", "deferred"]),
    resolution: z
      .object({
        decision: z.string().min(1),
        decided_by: z.string().min(1),
        decided_at: z.string().min(1),
        note: z.string().optional(),
      })
      .strict()
      .nullable(),
  })
  .strict();

// --- raw-file acceptability predicate (mirror of contract level 1) ---
// Pure, synthetic — NOT a parser. Decides if a raw is an acceptable candidate.
const ZIP_MAGIC = "504b0304";
function rawFileAcceptable(input: {
  size_bytes: number;
  magic_hex: string;
  raw_hash: string | null;
  season: string | null;
  season_code: string | null;
  matchday: number | null;
  manifest_status: string;
  hash_conflict: boolean;
}): (typeof STATUS)[number] {
  if (input.hash_conflict) return "rejected"; // hash-change vs known -> quarantine, never overwrite
  if (input.size_bytes <= 0) return "invalid";
  if (input.magic_hex.toLowerCase() !== ZIP_MAGIC) return "rejected"; // non-Excel payload
  if (!input.raw_hash || !/^[a-f0-9]{64}$/.test(input.raw_hash)) return "invalid";
  if (!input.season || !input.season_code || input.matchday == null) return "invalid";
  if (input.manifest_status !== "success") return "invalid";
  return "valid";
}

const H = "a".repeat(64);

describe("FantacalcioValidationManifest — synthetic (Batch 0E)", () => {
  const base = {
    validation_id: "val-raw-2021_22-md38-0001",
    validation_level: "raw_file" as const,
    target_ref: "acq:2021_22-md38-0001",
    season: "2021_22",
    season_code: "16",
    matchday: 38,
    status: "valid" as const,
    checks: [{ check_id: "c1", name: "magic_bytes_zip", outcome: "pass" as const }],
    blocking: false,
    requires_manual_review: false,
    review_item_ref: null,
    validated_at: "2026-06-30T12:00:00Z",
    validator: "design-v1",
    data_promoted_eligible: false as const,
  };

  it("a valid raw-file validation manifest parses", () => {
    expect(validationManifest.parse(base).status).toBe("valid");
  });

  it("data_promoted_eligible must be false (gate OFF in 0E)", () => {
    expect(validationManifest.safeParse({ ...base, data_promoted_eligible: true }).success).toBe(false);
  });

  it("accepts a promotion_gate run that is still not eligible", () => {
    const g = { ...base, validation_id: "val-gate-1", validation_level: "promotion_gate" as const, season: null, season_code: null, matchday: null, status: "requires_manual_review" as const, blocking: true, requires_manual_review: true, review_item_ref: "rev-1" };
    expect(validationManifest.parse(g).data_promoted_eligible).toBe(false);
  });

  it("rejects an unknown status (locks the shared enum)", () => {
    expect(validationManifest.safeParse({ ...base, status: "promoted" }).success).toBe(false);
  });
});

describe("raw-file acceptability predicate (level 1)", () => {
  const ok = { size_bytes: 20480, magic_hex: ZIP_MAGIC, raw_hash: H, season: "2021_22", season_code: "16", matchday: 38, manifest_status: "success", hash_conflict: false };

  it("a complete, ZIP-magic, hashed, linked raw with success manifest is valid", () => {
    expect(rawFileAcceptable(ok)).toBe("valid");
  });
  it("empty payload is invalid", () => {
    expect(rawFileAcceptable({ ...ok, size_bytes: 0 })).toBe("invalid");
  });
  it("non-Excel payload is rejected", () => {
    expect(rawFileAcceptable({ ...ok, magic_hex: "3c21444f" })).toBe("rejected"); // '<!DO' (HTML)
  });
  it("hash-change conflict is rejected (no silent overwrite)", () => {
    expect(rawFileAcceptable({ ...ok, hash_conflict: true })).toBe("rejected");
  });
  it("missing season/matchday link is invalid", () => {
    expect(rawFileAcceptable({ ...ok, season: null })).toBe("invalid");
    expect(rawFileAcceptable({ ...ok, matchday: null })).toBe("invalid");
  });
  it("manifest not success is invalid", () => {
    expect(rawFileAcceptable({ ...ok, manifest_status: "skipped" })).toBe("invalid");
  });
});

describe("FantacalcioIdentityCandidate — synthetic (Batch 0E)", () => {
  const player = {
    identity_candidate_id: "idc-p-0001",
    entity_kind: "player" as const,
    canonical_player_id: null,
    canonical_team_id: null,
    display_name: "Synthetic Rossi",
    source_name: "ROSSI",
    normalized_name: "rossi",
    aliases: ["Synthetic Rossi M."],
    season: "2021_22",
    season_code: "16",
    team_context: "TeamSynthetic",
    external_ids: [{ source_id: "fantacalcio_xlsx", external_id: "1234" }],
    confidence: 0.95,
    match_method: "normalized" as const,
    identity_status: "valid" as const,
    ambiguity_kind: null,
    manual_review_reason: null,
    provenance: { source_id: "fantacalcio_xlsx", acquisition_ref: "acq:2021_22-md38-0001", observed_in: "2021_22/md38" },
    canonical_promoted: false as const,
  };

  it("a high-confidence candidate validates with canonical id still null (not promoted)", () => {
    const p = identityCandidate.parse(player);
    expect(p.canonical_player_id).toBeNull();
    expect(p.canonical_promoted).toBe(false);
  });

  it("canonical_promoted = true is rejected (no promotion in 0E)", () => {
    expect(identityCandidate.safeParse({ ...player, canonical_promoted: true }).success).toBe(false);
  });

  it("an ambiguous homonym candidate keeps canonical id null and needs review", () => {
    const amb = {
      ...player,
      identity_candidate_id: "idc-p-0002",
      confidence: 0.62,
      match_method: "fuzzy" as const,
      identity_status: "requires_manual_review" as const,
      ambiguity_kind: "homonym" as const,
      manual_review_reason: "two players share normalized_name 'rossi' in same season",
    };
    const p = identityCandidate.parse(amb);
    expect(p.canonical_player_id).toBeNull();
    expect(p.identity_status).toBe("requires_manual_review");
    expect(p.ambiguity_kind).toBe("homonym");
  });

  it("rejects an unknown ambiguity_kind", () => {
    expect(identityCandidate.safeParse({ ...player, ambiguity_kind: "twins" }).success).toBe(false);
  });

  it("rejects confidence out of [0,1]", () => {
    expect(identityCandidate.safeParse({ ...player, confidence: 1.4 }).success).toBe(false);
  });
});

describe("FantacalcioManualReviewItem — synthetic (Batch 0E)", () => {
  const open = {
    review_item_id: "rev-0001",
    created_at: "2026-06-30T12:00:00Z",
    origin: "identity" as const,
    origin_ref: "idc-p-0002",
    entity_kind: "player" as const,
    reason_code: "homonym" as const,
    reason_detail: "two 'rossi' in 2021_22",
    candidates: [
      { ref: "idc-p-0002", score: 0.62, note: "fuzzy" },
      { ref: "idc-p-0009", score: 0.58 },
    ],
    blocking: true,
    status: "open" as const,
    resolution: null,
  };

  it("an open blocking review item parses with null resolution", () => {
    const r = reviewItem.parse(open);
    expect(r.status).toBe("open");
    expect(r.resolution).toBeNull();
    expect(r.blocking).toBe(true);
  });

  it("a resolved item carries a symbolic resolver, no real account", () => {
    const resolved = {
      ...open,
      status: "resolved" as const,
      resolution: { decision: "matched:idc-p-0002", decided_by: "owner", decided_at: "2026-06-30T13:00:00Z", note: "older player" },
    };
    expect(reviewItem.parse(resolved).resolution?.decided_by).toBe("owner");
  });

  it("rejects an unknown reason_code", () => {
    expect(reviewItem.safeParse({ ...open, reason_code: "vibes" }).success).toBe(false);
  });

  it("rejects an unknown queue status", () => {
    expect(reviewItem.safeParse({ ...open, status: "archived" }).success).toBe(false);
  });
});

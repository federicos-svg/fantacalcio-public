import { describe, it, expect } from "vitest";
import { z } from "zod";
import { evaluateIdentityCandidate, type MinimalIdentityRow } from "../src/identityCandidateEvaluator.js";
import {
  buildManualReviewItem,
  type ManualReviewItemContext,
} from "../src/manualReviewItemBuilder.js";

// All rows/context below are synthetic fixtures invented for this test only
// — never real players, ids, clubs, or seasons (see docs/NO_GO.md). Season
// strings look like the real `YYYY_YY` shape only because the identity
// contract requires that shape; the values themselves are placeholders.
const rowA: MinimalIdentityRow = {
  externalId: "ext-001",
  name: "Synth Testman",
  role: "P",
  team: "Synth FC Alpha",
};

const ctx: ManualReviewItemContext = {
  seasonA: "2019_20",
  seasonB: "2020_21",
  sourceLabel: "synthetic_fixture",
  createdAt: "2026-01-01T00:00:00Z",
  rowRefA: "fixture:rowA:001",
  rowRefB: "fixture:rowB:001",
};

describe("buildManualReviewItem — accept_candidate", () => {
  it("returns null: nothing to review when the pair is accepted", () => {
    const evaluation = evaluateIdentityCandidate(rowA, { ...rowA });
    expect(evaluation.policy.outcome).toBe("accept_candidate");
    expect(buildManualReviewItem(evaluation, ctx)).toBeNull();
  });
});

describe("buildManualReviewItem — reject_candidate (explicit safer/minimal choice)", () => {
  it("returns null: a confident non-match is not routed to manual review", () => {
    const b: MinimalIdentityRow = { ...rowA, externalId: "ext-002" };
    const evaluation = evaluateIdentityCandidate(rowA, b);
    expect(evaluation.policy.outcome).toBe("reject_candidate");
    expect(buildManualReviewItem(evaluation, ctx)).toBeNull();
  });
});

describe("buildManualReviewItem — insufficient_evidence (explicit safer/minimal choice)", () => {
  it("returns null: no external_id on one side gives no signal to review here", () => {
    const b: MinimalIdentityRow = { ...rowA, externalId: null };
    const evaluation = evaluateIdentityCandidate(rowA, b);
    expect(evaluation.policy.outcome).toBe("insufficient_evidence");
    expect(buildManualReviewItem(evaluation, ctx)).toBeNull();
  });
});

describe("buildManualReviewItem — review_name_mismatch", () => {
  it("creates a review item with reason_code name_change, open, blocking, unresolved", () => {
    const b: MinimalIdentityRow = { ...rowA, name: "Synth Omega Testman" };
    const evaluation = evaluateIdentityCandidate(rowA, b);
    expect(evaluation.policy.outcome).toBe("review_name_mismatch");

    const item = buildManualReviewItem(evaluation, ctx);
    expect(item).not.toBeNull();
    expect(item!.origin).toBe("identity");
    expect(item!.entity_kind).toBe("player");
    expect(item!.reason_code).toBe("name_change");
    expect(item!.blocking).toBe(true);
    expect(item!.status).toBe("open");
    expect(item!.resolution).toBeNull();
    expect(item!.identity_signals.outcome).toBe("review_name_mismatch");
    expect(item!.identity_signals.confidence_band).toBe("medium");
  });
});

describe("buildManualReviewItem — review_external_id_reuse", () => {
  it("creates a review item with reason_code external_id_reuse", () => {
    const b: MinimalIdentityRow = { ...rowA, name: "Zeta Otherman" };
    const evaluation = evaluateIdentityCandidate(rowA, b);
    expect(evaluation.policy.outcome).toBe("review_external_id_reuse");

    const item = buildManualReviewItem(evaluation, ctx);
    expect(item).not.toBeNull();
    expect(item!.reason_code).toBe("external_id_reuse");
    expect(item!.blocking).toBe(true);
    expect(item!.status).toBe("open");
    expect(item!.resolution).toBeNull();
    expect(item!.identity_signals.outcome).toBe("review_external_id_reuse");
    expect(item!.identity_signals.confidence_band).toBe("low");
    expect(item!.identity_signals.name_token_overlap).toBe(0);
  });
});

describe("buildManualReviewItem — review_role_change", () => {
  it("creates a review item with reason_code role_change", () => {
    const b: MinimalIdentityRow = { ...rowA, role: "D" };
    const evaluation = evaluateIdentityCandidate(rowA, b);
    expect(evaluation.policy.outcome).toBe("review_role_change");

    const item = buildManualReviewItem(evaluation, ctx);
    expect(item).not.toBeNull();
    expect(item!.reason_code).toBe("role_change");
    expect(item!.blocking).toBe(true);
    expect(item!.status).toBe("open");
    expect(item!.resolution).toBeNull();
    expect(item!.identity_signals.outcome).toBe("review_role_change");
    expect(item!.identity_signals.role_same).toBe(false);
  });
});

describe("buildManualReviewItem — entity_kind override", () => {
  it("honors context.entityKind when given (e.g. team candidates)", () => {
    const b: MinimalIdentityRow = { ...rowA, role: "D" };
    const evaluation = evaluateIdentityCandidate(rowA, b);
    const item = buildManualReviewItem(evaluation, { ...ctx, entityKind: "team" });
    expect(item!.entity_kind).toBe("team");
  });
});

describe("buildManualReviewItem — deterministic id/shape", () => {
  it("same evaluation + same context always produces the same review_item_id", () => {
    const b: MinimalIdentityRow = { ...rowA, role: "D" };
    const evaluation = evaluateIdentityCandidate(rowA, b);
    const first = buildManualReviewItem(evaluation, ctx);
    const second = buildManualReviewItem(evaluation, ctx);
    expect(first).toEqual(second);
    expect(first!.review_item_id).toBe(second!.review_item_id);
  });

  it("a different synthetic row ref changes the review_item_id", () => {
    const b: MinimalIdentityRow = { ...rowA, role: "D" };
    const evaluation = evaluateIdentityCandidate(rowA, b);
    const first = buildManualReviewItem(evaluation, ctx);
    const second = buildManualReviewItem(evaluation, { ...ctx, rowRefB: "fixture:rowB:002" });
    expect(first!.review_item_id).not.toBe(second!.review_item_id);
  });

  it("falls back to a safe placeholder ref when rowRefA/rowRefB are omitted", () => {
    const b: MinimalIdentityRow = { ...rowA, role: "D" };
    const evaluation = evaluateIdentityCandidate(rowA, b);
    const { rowRefA, rowRefB, ...bareCtx } = ctx;
    const item = buildManualReviewItem(evaluation, bareCtx);
    expect(item!.candidates[0]!.ref).toBe("unspecified_row_b");
    expect(item!.review_item_id).toContain("unspecified_row_a");
    expect(item!.review_item_id).toContain("unspecified_row_b");
  });
});

describe("buildManualReviewItem — no canonical ids, ever", () => {
  it("output never contains canonical_player_id/canonical_team_id in any casing, across every review outcome", () => {
    const variants: MinimalIdentityRow[] = [
      { ...rowA, name: "Synth Omega Testman" }, // review_name_mismatch
      { ...rowA, name: "Zeta Otherman" }, // review_external_id_reuse
      { ...rowA, role: "D" }, // review_role_change
    ];
    const forbidden = ["canonical_player_id", "canonical_team_id", "canonicalPlayerId", "canonicalTeamId"];
    for (const b of variants) {
      const evaluation = evaluateIdentityCandidate(rowA, b);
      const item = buildManualReviewItem(evaluation, ctx);
      expect(item).not.toBeNull();
      const json = JSON.stringify(item).toLowerCase();
      for (const term of forbidden) {
        expect(json).not.toContain(term.toLowerCase());
      }
    }
  });

  it("null-returning outcomes trivially carry no canonical ids either", () => {
    const acceptEval = evaluateIdentityCandidate(rowA, { ...rowA });
    const rejectEval = evaluateIdentityCandidate(rowA, { ...rowA, externalId: "ext-002" });
    const insufficientEval = evaluateIdentityCandidate(rowA, { ...rowA, externalId: null });
    expect(buildManualReviewItem(acceptEval, ctx)).toBeNull();
    expect(buildManualReviewItem(rejectEval, ctx)).toBeNull();
    expect(buildManualReviewItem(insufficientEval, ctx)).toBeNull();
  });
});

describe("buildManualReviewItem — only synthetic fixture strings surface", () => {
  it("review_item_id/origin_ref/candidates are built only from the synthetic context supplied, nothing invented", () => {
    const b: MinimalIdentityRow = { ...rowA, name: "Synth Omega Testman" };
    const evaluation = evaluateIdentityCandidate(rowA, b);
    const item = buildManualReviewItem(evaluation, ctx)!;
    expect(item.review_item_id).toBe(
      "review:synthetic_fixture:2019_20:2020_21:review_name_mismatch:fixture:rowA:001:fixture:rowB:001",
    );
    expect(item.origin_ref).toBe("synthetic_fixture:2019_20->2020_21");
    expect(item.candidates).toEqual([
      { ref: "fixture:rowB:001", score: item.identity_signals.name_token_overlap, note: evaluation.policy.reasonCode },
    ]);
  });
});

// --- JSON schema compatibility (schemas/fantacalcio_manual_review_item.schema.json) ---
//
// Mirrors the schema with zod (no ajv dependency in this repo), the same
// pattern already used by packages/engine/tests/validation_identity_contract.test.ts.
// FASE 3 Schema Contract Alignment v1 extended the real schema with
// `external_id_reuse`/`role_change` reason codes and an optional
// `identity_signals` object — this mirror (and the test below) validates
// the builder's *entire* output, `identity_signals` included, not a
// stripped-down subset.
const reviewItemSchema = z
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
      "external_id_reuse",
      "role_change",
      "other",
    ]),
    reason_detail: z.string(),
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
    identity_signals: z
      .object({
        outcome: z.enum(["review_name_mismatch", "review_external_id_reuse", "review_role_change"]),
        confidence_band: z.enum(["high", "medium", "low", "not_applicable"]),
        name_token_overlap: z.number().min(0).max(1),
        role_same: z.boolean(),
        team_same: z.boolean(),
        external_id_same: z.boolean(),
        external_id_present_a: z.boolean(),
        external_id_present_b: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();

describe("buildManualReviewItem — schema compatibility (full payload, incl. identity_signals)", () => {
  it("the entire review-item payload, identity_signals included, parses against fantacalcio_manual_review_item.schema.json", () => {
    const outcomes: MinimalIdentityRow[] = [
      { ...rowA, name: "Synth Omega Testman" },
      { ...rowA, name: "Zeta Otherman" },
      { ...rowA, role: "D" },
    ];
    for (const b of outcomes) {
      const evaluation = evaluateIdentityCandidate(rowA, b);
      const item = buildManualReviewItem(evaluation, ctx)!;
      expect(reviewItemSchema.safeParse(item).success).toBe(true);
    }
  });

  it("identity_signals.outcome is restricted to the three review_* outcomes (schema enum), never accept/reject/insufficient_evidence", () => {
    const b: MinimalIdentityRow = { ...rowA, name: "Synth Omega Testman" };
    const evaluation = evaluateIdentityCandidate(rowA, b);
    const item = buildManualReviewItem(evaluation, ctx)!;
    const allowed = ["review_name_mismatch", "review_external_id_reuse", "review_role_change"];
    expect(allowed).toContain(item.identity_signals.outcome);
  });
});

describe("buildManualReviewItem — purity/determinism", () => {
  it("never throws, same input always produces the same output", () => {
    const b: MinimalIdentityRow = { ...rowA, name: "Synth Omega Testman" };
    const evaluation = evaluateIdentityCandidate(rowA, b);
    expect(() => buildManualReviewItem(evaluation, ctx)).not.toThrow();
    expect(buildManualReviewItem(evaluation, ctx)).toEqual(buildManualReviewItem(evaluation, ctx));
  });
});

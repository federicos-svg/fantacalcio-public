import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const evidenceValue = z
  .object({
    status: z.enum(["observed", "inferred", "missing"]),
    value: z.unknown(),
    basis: z.string().min(1),
    confidence: z.enum(["low", "medium", "high"]).optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.status === "missing" && entry.value !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "missing evidence must have null value" });
    }
    if (entry.status === "inferred" && entry.confidence === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "inferred evidence requires confidence" });
    }
  });

const fieldNames = [
  "run_id",
  "protocol",
  "source_commit",
  "working_tree",
  "command",
  "runtime",
  "dependencies",
  "seasons",
  "input_manifest_hash",
  "artifact_hashes",
  "targets",
  "feature_set",
  "population",
  "split",
  "missingness_pipeline",
  "candidate_model_id",
  "seed",
  "determinism",
  "metrics",
  "evidence_status",
  "oof_outputs",
  "timestamp",
  "sensitivity",
  "known_limits",
] as const;

const manifestSchema = z
  .object({
    manifest_version: z.literal("1.0.0"),
    source_commit_status: z.enum(["observed", "inferred", "missing"]),
    ...Object.fromEntries(fieldNames.map((name) => [name, evidenceValue])),
  })
  .strict();

describe("VAL run manifest provenance contract", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const fixture = JSON.parse(
    readFileSync(resolve(root, "fixtures/val-run-manifest.historical-redacted.json"), "utf8"),
  ) as unknown;
  const jsonSchema = JSON.parse(
    readFileSync(resolve(root, "schemas/val-run-manifest.schema.json"), "utf8"),
  ) as { properties?: Record<string, unknown>; required?: string[] };

  it("validates the fully redacted historical fixture", () => {
    const parsed = manifestSchema.parse(fixture) as Record<
      string,
      { readonly status?: unknown; readonly value?: unknown } | string
    >;
    expect(parsed.source_commit_status).toBe("inferred");
    expect((parsed.source_commit as { status: unknown }).status).toBe("inferred");
    expect((parsed.evidence_status as { value: unknown }).value).toBe("no_verdict");
    expect((parsed.sensitivity as { value: unknown }).value).toMatchObject({
      contains_real_player_data: false,
    });
  });

  it("keeps every contract field required in the JSON Schema", () => {
    expect(jsonSchema.required).toEqual(
      expect.arrayContaining(["manifest_version", "source_commit_status", ...fieldNames]),
    );
    expect(Object.keys(jsonSchema.properties ?? {})).toEqual(
      expect.arrayContaining(["manifest_version", "source_commit_status", ...fieldNames]),
    );
  });

  it("rejects invented values for missing evidence", () => {
    const candidate = structuredClone(fixture) as Record<string, unknown>;
    candidate.command = {
      status: "missing",
      value: "npm run invented-command",
      basis: "Not recovered.",
    };
    expect(() => manifestSchema.parse(candidate)).toThrow(/missing evidence must have null value/);
  });
});

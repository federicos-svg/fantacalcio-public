// Phase 5 — SCORE-NORMALIZATION-A: terminal 0..100 display representation
// for already-computed appeal-index components — PURE, no I/O, no real data.
//
// Scope is deliberately narrow: this defines HOW an already-computed decimal
// component value becomes a terminal 0-100 number. It never fits, selects or
// re-validates a model, never changes a disposition, never raises an
// evidence_cap, and never produces a composite score across components or
// roles. See docs/data/VAL_PHASE5_SCORE_NORMALIZATION_CONTRACT.md for the
// full preregistered protocol this file implements.

import { createHash } from "node:crypto";
import type { AppealIndexComponent } from "./appealIndex.js";
import { stableJson, type Phase4Verdict } from "./phase4Protocol.js";
import type { Role } from "./types.js";

export const PHASE5_PROTOCOL = "VAL-PROTOCOL-A-PHASE5@1.0.0" as const;

export type EvidenceTier = "scouting_backed" | "heuristic_only" | "not_available";

export const PHASE5_CONFIG = {
  protocolVersion: PHASE5_PROTOCOL,
  method: "within_role_percentile_rank",
  emptyCohortFallback: 50,
  tieRule: "less_than_or_equal",
  roundingPoint: "render_only",
  scaleMin: 0,
  scaleMax: 100,
  gates: {
    data_promoted: false,
    canonical_promoted: false,
    decision_promoted: false,
    fair_to_me_promoted: false,
    live_ui_ready: false,
  },
  forbidden: [
    "composite_score_across_components",
    "composite_score_across_roles",
    "confidence_or_accuracy_claim",
    "no_verdict_numeric_fallback",
    "vor_normalization",
    "real_data_run_in_this_batch",
  ],
} as const;

export function phase5ConfigHash(): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(stableJson(PHASE5_CONFIG)).digest("hex")}`;
}

const SCOUTING_DISPOSITIONS: readonly Phase4Verdict[] = [
  "SCOUTING_MODEL_SELECTED",
  "SCOUTING_ROLE_SPECIFIC_MODEL_SELECTED",
];

/** Disposition -> evidenceTier mapping. Pure lookup, never inferred from a value. */
export function evidenceTierFor(disposition: Phase4Verdict): EvidenceTier {
  if (disposition === "NO_VERDICT") return "not_available";
  if ((SCOUTING_DISPOSITIONS as readonly string[]).includes(disposition)) return "scouting_backed";
  return "heuristic_only"; // HEURISTIC_ONLY, BASELINE_RETAINED
}

/** Within-cohort percentile rank in [0,1]. Empty cohort -> 0.5 midpoint,
 *  matching the existing ruoloRarita heuristic fallback (appealIndex.ts). */
export function percentileRankWithinCohort(value: number, cohort: readonly number[]): number {
  if (cohort.length === 0) return 0.5;
  const belowOrEqual = cohort.filter((v) => v <= value).length;
  return belowOrEqual / cohort.length;
}

export interface NormalizedComponentDisplay {
  readonly scale0to100: number | null;
  readonly disposition: Phase4Verdict;
  readonly evidenceTier: EvidenceTier;
  readonly role: Role;
  readonly method: typeof PHASE5_CONFIG.method;
}

export interface NormalizeComponentInput {
  readonly component: AppealIndexComponent;
  /** Disposition is caller-supplied, never inferred: on synthetic fixtures it
   *  must be declared as such, never presented as a real Phase 4 verdict. */
  readonly disposition: Phase4Verdict;
  readonly role: Role;
  /** Same-role reference cohort, train-fold-only when the component derives
   *  from a fitted target — same anti-leakage discipline as dataset.ts. */
  readonly cohort: readonly number[];
}

export function normalizeComponentForDisplay(
  input: NormalizeComponentInput,
): NormalizedComponentDisplay {
  const { component, disposition, role, cohort } = input;
  const evidenceTier = evidenceTierFor(disposition);
  const base = { disposition, evidenceTier, role, method: PHASE5_CONFIG.method } as const;

  // NO_VERDICT and missing_input are withheld unconditionally: never the
  // empty-cohort midpoint, never a fabricated number of any kind.
  if (disposition === "NO_VERDICT" || component.availability === "missing_input") {
    return { ...base, scale0to100: null };
  }

  const value = component.value;
  if (value === null || !Number.isFinite(value)) {
    return { ...base, scale0to100: null };
  }

  return { ...base, scale0to100: percentileRankWithinCohort(value, cohort) * 100 };
}

/** Rounds only at the render boundary — the core function above never rounds. */
export function roundForRender(scale0to100: number | null): string {
  if (scale0to100 === null) return "n/d";
  return Math.round(scale0to100).toString();
}

export function assertPhase5OutputShape(value: unknown): void {
  const text = JSON.stringify(value);
  for (const forbidden of [
    /"compositeScore"/i,
    /"overallAppeal"/i,
    /"aggregateScore"/i,
    /"confidence"\s*:/i,
    /"accuracy"\s*:/i,
    /"receipt"/i,
    /canonical_player_id/i,
    /target_band/i,
    /stretch_cap/i,
    /"data_promoted":true/,
    /"decision_promoted":true/,
    /"role_VOR"/i,
    /"archetype_VOR"/i,
  ]) {
    if (forbidden.test(text)) throw new Error(`PHASE5_FORBIDDEN_OUTPUT:${forbidden.source}`);
  }
}

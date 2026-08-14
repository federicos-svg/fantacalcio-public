// Pilot dry-run executor (L1 + L2 composition) — PURE, in-memory, fixture-only.
//
// Scope (approved minimal perimeter): compose the existing, independent L1
// ("raw_file", rawFileValidation.ts) and L2 ("acquisition_manifest",
// acquisitionManifestValidation.ts) executors into a single deterministic
// dry-run verdict over a synthetic candidate. This does NOT execute the real
// pilot described in docs/data/PILOT_AUTHORIZATION_REQUEST.md: it downloads
// nothing, opens no endpoint, calls no Drive/n8n, and adds NO new validation
// logic of its own — every check still lives in its own L1/L2 module. This is
// purely an orchestration/observability layer, same spirit as
// packages/engine/src/pipeline.ts for the parser/normalizer/validator chain.
//
// Gate invariant (enforced by construction): `data_promoted_eligible` is
// always `false` — a dry-run "accepted" verdict is NOT a promotion and does
// NOT authorize any real acquisition.

import { rawFileAcceptable, type RawFileCandidate, type RawFileAcceptability, type RawFileRejectionReason } from "./rawFileValidation.js";
import { validateAcquisitionManifest, type AcquisitionManifestValidationStatus } from "./acquisitionManifestValidation.js";

export interface PilotDryRunInput {
  readonly rawFile: RawFileCandidate;
  /** `unknown` on purpose — L2 is defense-in-depth and re-checks its own shape. */
  readonly acquisitionManifest: unknown;
}

export interface PilotDryRunL1Outcome {
  readonly status: RawFileAcceptability;
  readonly reason: RawFileRejectionReason | null;
}

export interface PilotDryRunL2Outcome {
  readonly status: AcquisitionManifestValidationStatus;
  readonly issueCount: number;
}

export interface PilotDryRunResult {
  readonly l1: PilotDryRunL1Outcome;
  readonly l2: PilotDryRunL2Outcome;
  /** True only when both L1 and L2 are `valid`. Never implies a real pilot run. */
  readonly accepted_for_pilot_dry_run: boolean;
  /** One entry per L1/L2 finding that keeps the candidate from being accepted. Empty iff accepted. */
  readonly blocking_reasons: readonly string[];
  /** Gate stays OFF: a dry-run verdict never promotes anything. Always false. */
  readonly data_promoted_eligible: false;
}

/**
 * Runs the L1 raw-file check and the L2 acquisition-manifest check over a
 * synthetic candidate and composes a single dry-run verdict. Pure and
 * deterministic: the same input always yields the same result. Neither
 * sub-check is re-implemented here — this only reads their outcomes.
 */
export function runPilotDryRun(input: PilotDryRunInput): PilotDryRunResult {
  const l1Result = rawFileAcceptable(input.rawFile);
  const l2Result = validateAcquisitionManifest(input.acquisitionManifest);

  const blockingReasons: string[] = [];
  if (l1Result.status !== "valid") {
    blockingReasons.push(`l1:${l1Result.reason ?? l1Result.status}`);
  }
  if (l2Result.status !== "valid") {
    for (const issue of l2Result.issues) {
      blockingReasons.push(`l2:${issue.code}`);
    }
  }

  return {
    l1: { status: l1Result.status, reason: l1Result.reason },
    l2: { status: l2Result.status, issueCount: l2Result.issueCount },
    accepted_for_pilot_dry_run: l1Result.status === "valid" && l2Result.status === "valid",
    blocking_reasons: blockingReasons,
    data_promoted_eligible: false,
  };
}

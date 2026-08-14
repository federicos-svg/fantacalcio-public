// Cross-season join key resolution — PURE, no I/O.
//
// Deliberately NOT `canonical_player_id` (packages/engine / Batch 0E): this
// key is local to this offline ML package, sets no gate, is never promoted,
// and is never consumed by the live app. See
// docs/data/APPEAL_INDEX_OFFLINE_ML_CONTRACT.md.

import type { Role } from "./types.js";
import { normalizePlayerName } from "./nameNormalization.js";
import type { IdentityStabilityReport } from "./identityStability.js";

export interface KeyableEntry {
  readonly externalId: number;
  readonly name: string;
  readonly role: Role;
}

/**
 * Resolve the join key used to link the same player across seasons for
 * dataset-building purposes ONLY, given the verdict of
 * `analyzeIdentityKeyStability`. When the checker has NOT confirmed
 * `external_id` as stable (verdict `"unstable"` or `"insufficient_data"`),
 * this conservatively falls back to a normalized-name + role key instead of
 * trusting `externalId` by default — the opposite of what a naive
 * "Id/Cod. is the primary key" assumption would do.
 */
export function resolvePlayerKey(entry: KeyableEntry, stability: IdentityStabilityReport): string {
  if (stability.recommendedJoinKey === "external_id") {
    return `id:${entry.externalId}`;
  }
  return `name:${normalizePlayerName(entry.name)}|role:${entry.role}`;
}

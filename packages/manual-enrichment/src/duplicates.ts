// Manual Enrichment v1 — duplicate detection.
//
// Detects, never fixes. No automatic deduplication anywhere in this package:
// a duplicate always routes to a status the pipeline maps away from `valid`
// (see pipeline.ts), never a silent pick of "the last one wins".

import type { EnrichmentRecord, ListoneCandidate } from "./types.js";

/** Every `listoneId` that appears more than once across the enrichment rows read from the sheet. */
export function findDuplicateEnrichmentListoneIds(records: readonly EnrichmentRecord[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.listoneId, (counts.get(r.listoneId) ?? 0) + 1);
  const duplicated = new Set<string>();
  for (const [id, count] of counts) if (count > 1) duplicated.add(id);
  return duplicated;
}

/** Builds an index of listone candidates by `listoneId` — a caller-supplied id may map to 0, 1, or (if the caller's own data has a collision) more than one candidate. */
export function indexListoneCandidatesById(
  candidates: readonly ListoneCandidate[],
): ReadonlyMap<string, readonly ListoneCandidate[]> {
  const index = new Map<string, ListoneCandidate[]>();
  for (const c of candidates) {
    const existing = index.get(c.listoneId);
    if (existing) existing.push(c);
    else index.set(c.listoneId, [c]);
  }
  return index;
}

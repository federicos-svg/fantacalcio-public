import { createHash } from "node:crypto";

/**
 * Sorts object keys recursively (arrays keep their order) so the same
 * logical value always serializes to the same bytes, independent of
 * property insertion order. Mirrors the pattern already used by
 * `packages/data-platform-contract/src/contract.ts` — kept as a small,
 * independent copy rather than an import because that function is private
 * to its module and this SDK must stay usable without depending on
 * `data-platform-contract` internals beyond its exported types.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Deterministic content fingerprint of any JSON-serializable artifact. */
export function fingerprintArtifact(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

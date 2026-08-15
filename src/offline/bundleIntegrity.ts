// Runtime hash verification of the listone live bundle (BUNDLE-01, Part 2).
//
// The build side of this contract is packages/xlsx-adapter/src/listoneLiveBundle.ts:
// it writes a manifest whose `bundle_sha256` is
// `createHash("sha256").update(bundleText, "utf8").digest("hex")` — lowercase
// hex over the UTF-8 bytes of the bundle. This module is the browser half of
// the same contract: it digests the EXACT bytes the network/cache handed us
// (an ArrayBuffer, never a re-encoded string) with `crypto.subtle.digest` and
// compares hex to hex. Same algorithm, same encoding, same casing — which is
// what makes the two directly comparable, and what the unit tests assert by
// running the real builder and verifying its real output.
//
// Everything here is PURE except the injected `digest` function, so it runs in
// this repo's node-only test environment (no jsdom — see src/ui/listone.ts).
//
// Fail-closed is the whole point: every branch below that is not a proven
// match returns a failure. There is no "verify if convenient" path and no
// fallback that loads the bytes anyway — the caller (integrityGate.ts) turns
// any failure into a blocking, readable error state.

// The two version strings are RE-DECLARED here rather than imported from
// packages/xlsx-adapter/src/listoneLiveBundle.ts on purpose: that module opens
// with `import { createHash } from "node:crypto"`, so importing even a single
// constant from it would drag a Node built-in into the browser bundle. The
// copies cannot drift silently — src/offline/bundleIntegrity.test.ts imports
// the builder's own constants (in Node, where that import is free) and asserts
// the two pairs are identical, the same drift-guard pattern
// LISTONE_GATED_EXTRA_KEYS already uses in src/ui/listone.ts.
export const LISTONE_LIVE_BUNDLE_MANIFEST_VERSION = "listone-live-bundle-manifest-v1";
export const LISTONE_LIVE_BUNDLE_VERSION = "listone-live-bundle-v1";

/**
 * The `SubtleCrypto` surface this module needs — one method. Declared
 * structurally so a test can pass a fake (or `null`, for the
 * insecure-context case) without a DOM.
 */
export interface DigestLike {
  digest(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer>;
}

/** The subset of the live-bundle manifest the browser verifies against. */
export interface RuntimeBundleManifest {
  readonly manifest_version: string;
  readonly bundle_version: string;
  readonly bundle_sha256: string;
  readonly bundle_size_bytes: number;
  readonly total_records: number;
  readonly source_id: string;
  readonly season: string;
}

export type BundleIntegrityFailure =
  /** No manifest is served next to a bundle the build declared as manifest-carrying. */
  | { readonly kind: "manifest-absent" }
  /** A manifest is served but is not JSON, or not a valid live-bundle manifest. */
  | { readonly kind: "manifest-malformed"; readonly errors: readonly string[] }
  /** `crypto.subtle` is missing — an insecure context. Nothing can be proven, so nothing is trusted. */
  | { readonly kind: "digest-unavailable" }
  /** `crypto.subtle.digest` itself threw. */
  | { readonly kind: "digest-failed"; readonly message: string }
  | { readonly kind: "hash-mismatch"; readonly expected: string; readonly actual: string }
  | { readonly kind: "size-mismatch"; readonly expected: number; readonly actual: number }
  /** Bytes hash correctly but are not the top-level array the runtime contract requires. */
  | { readonly kind: "bundle-unparseable" }
  | { readonly kind: "record-count-mismatch"; readonly expected: number; readonly actual: number }
  /** A manifest that declares a project gate ON is refused outright (docs/NO_GO.md). */
  | { readonly kind: "gate-declared-on"; readonly gate: string }
  /** The build itself did not serve a readable integrity policy — see integrityGate.ts. */
  | { readonly kind: "integrity-policy-unusable"; readonly errors: readonly string[] };

export type BundleIntegrityVerdict =
  | { readonly ok: true; readonly sha256: string; readonly manifest: RuntimeBundleManifest }
  | { readonly ok: false; readonly failure: BundleIntegrityFailure };

/** Sentinel for "the manifest fetch found nothing", distinct from "found null". */
export const MANIFEST_ABSENT = Symbol("bundle-manifest-absent");

const SHA256_RE = /^[0-9a-f]{64}$/;

/** Same five gates the builder pins to `false` (listoneLiveBundle.ts BundleGate). */
const GATES = [
  "data_promoted",
  "canonical_promoted",
  "decision_promoted",
  "fair_to_me_promoted",
  "live_ui_ready",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Lowercase hex of a digest, byte by byte. Written out rather than via
 * `toString(16)` shortcuts so a byte < 0x10 always keeps its leading zero —
 * the classic way a hex encoder silently produces a 63-character "hash" that
 * then never matches anything.
 */
export function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/**
 * sha256 of the exact bytes, or a failure. `digest` is injected: in the browser
 * it is `crypto.subtle`, which exists only in a secure context (https or
 * localhost). A missing one is NOT a reason to skip verification — it is
 * `digest-unavailable`, i.e. a failure.
 */
export async function sha256HexOf(
  digest: DigestLike | null | undefined,
  bytes: ArrayBuffer,
): Promise<{ ok: true; hex: string } | { ok: false; failure: BundleIntegrityFailure }> {
  if (digest === null || digest === undefined || typeof digest.digest !== "function") {
    return { ok: false, failure: { kind: "digest-unavailable" } };
  }
  try {
    const out = await digest.digest("SHA-256", bytes);
    return { ok: true, hex: toHex(out) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, failure: { kind: "digest-failed", message } };
  }
}

export type ParseManifestResult =
  | { readonly ok: true; readonly manifest: RuntimeBundleManifest }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Strict manifest parse. Deliberately checks the two version fields as well as
 * the hash: a manifest for some other artifact kind must not be able to
 * "validate" the listone bundle just because it happens to carry a sha256.
 */
export function parseRuntimeBundleManifest(value: unknown): ParseManifestResult {
  if (!isRecord(value)) return { ok: false, errors: ["manifest must be a JSON object"] };
  const errors: string[] = [];

  if (value.manifest_version !== LISTONE_LIVE_BUNDLE_MANIFEST_VERSION) {
    errors.push(`manifest_version must be ${LISTONE_LIVE_BUNDLE_MANIFEST_VERSION}`);
  }
  if (value.bundle_version !== LISTONE_LIVE_BUNDLE_VERSION) {
    errors.push(`bundle_version must be ${LISTONE_LIVE_BUNDLE_VERSION}`);
  }
  if (typeof value.bundle_sha256 !== "string" || !SHA256_RE.test(value.bundle_sha256)) {
    errors.push("bundle_sha256 must be a lowercase sha256 hex string");
  }
  if (!Number.isInteger(value.bundle_size_bytes) || (value.bundle_size_bytes as number) < 0) {
    errors.push("bundle_size_bytes must be a non-negative integer");
  }
  if (!Number.isInteger(value.total_records) || (value.total_records as number) < 0) {
    errors.push("total_records must be a non-negative integer");
  }
  if (typeof value.source_id !== "string" || value.source_id === "") errors.push("source_id must be a non-empty string");
  if (typeof value.season !== "string" || value.season === "") errors.push("season must be a non-empty string");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    manifest: {
      manifest_version: value.manifest_version as string,
      bundle_version: value.bundle_version as string,
      bundle_sha256: value.bundle_sha256 as string,
      bundle_size_bytes: value.bundle_size_bytes as number,
      total_records: value.total_records as number,
      source_id: value.source_id as string,
      season: value.season as string,
    },
  };
}

/** The first gate a manifest declares ON, or null. Missing gates are not "on". */
export function declaredOnGate(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const gates = value.gates;
  if (!isRecord(gates)) return null;
  for (const gate of GATES) {
    if (gates[gate] === true) return gate;
  }
  return null;
}

export interface VerifyBundleInput {
  /** The exact bytes served for the bundle. */
  readonly bytes: ArrayBuffer;
  /** Parsed manifest JSON, or MANIFEST_ABSENT when none was served. */
  readonly manifestJson: unknown | typeof MANIFEST_ABSENT;
  /** `crypto.subtle` in the browser; null when the context is not secure. */
  readonly digest: DigestLike | null | undefined;
}

/**
 * The whole verification, in one fail-closed pass. Order matters: the manifest
 * is validated before anything is hashed (a malformed manifest has no hash to
 * compare against), and the bytes are parsed only after their digest matched
 * (parsing unverified bytes proves nothing).
 */
export async function verifyListoneBundle(input: VerifyBundleInput): Promise<BundleIntegrityVerdict> {
  if (input.manifestJson === MANIFEST_ABSENT) {
    return { ok: false, failure: { kind: "manifest-absent" } };
  }

  const parsed = parseRuntimeBundleManifest(input.manifestJson);
  if (!parsed.ok) return { ok: false, failure: { kind: "manifest-malformed", errors: parsed.errors } };

  const gateOn = declaredOnGate(input.manifestJson);
  if (gateOn !== null) return { ok: false, failure: { kind: "gate-declared-on", gate: gateOn } };

  const manifest = parsed.manifest;
  if (input.bytes.byteLength !== manifest.bundle_size_bytes) {
    return {
      ok: false,
      failure: { kind: "size-mismatch", expected: manifest.bundle_size_bytes, actual: input.bytes.byteLength },
    };
  }

  const digested = await sha256HexOf(input.digest, input.bytes);
  if (!digested.ok) return { ok: false, failure: digested.failure };
  if (digested.hex !== manifest.bundle_sha256) {
    return { ok: false, failure: { kind: "hash-mismatch", expected: manifest.bundle_sha256, actual: digested.hex } };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.bytes));
  } catch {
    return { ok: false, failure: { kind: "bundle-unparseable" } };
  }
  if (!Array.isArray(decoded)) return { ok: false, failure: { kind: "bundle-unparseable" } };
  if (decoded.length !== manifest.total_records) {
    return {
      ok: false,
      failure: { kind: "record-count-mismatch", expected: manifest.total_records, actual: decoded.length },
    };
  }

  return { ok: true, sha256: digested.hex, manifest };
}

/**
 * The sentence shown on screen. Italian, like every other user-facing string
 * in this app, and deliberately concrete: it names the asset, what was
 * expected and what was actually served. "Errore di integrità" alone would be
 * a silent failure with extra steps.
 */
export function bundleIntegrityFailureText(assetUrl: string, failure: BundleIntegrityFailure): string {
  switch (failure.kind) {
    case "manifest-absent":
      return (
        `Il bundle ${assetUrl} è stato pacchettizzato con un manifest di integrità, ` +
        "ma il manifest non è stato servito. Senza manifest l'hash non è verificabile: " +
        "i dati non vengono caricati."
      );
    case "manifest-malformed":
      return (
        `Il manifest di integrità di ${assetUrl} non è leggibile come manifest live-bundle ` +
        `(${failure.errors.join("; ")}). I dati non vengono caricati.`
      );
    case "digest-unavailable":
      return (
        "crypto.subtle non è disponibile in questo contesto (serve https oppure localhost): " +
        `l'hash di ${assetUrl} non è calcolabile e i dati non vengono caricati.`
      );
    case "digest-failed":
      return `Il calcolo dell'hash di ${assetUrl} è fallito (${failure.message}). I dati non vengono caricati.`;
    case "hash-mismatch":
      return (
        `L'hash del bundle servito non corrisponde al manifest per ${assetUrl}. ` +
        `Atteso ${failure.expected}, calcolato ${failure.actual}. I dati non vengono caricati.`
      );
    case "size-mismatch":
      return (
        `La dimensione del bundle servito non corrisponde al manifest per ${assetUrl}. ` +
        `Attesi ${failure.expected} byte, ricevuti ${failure.actual}. I dati non vengono caricati.`
      );
    case "bundle-unparseable":
      return (
        `Il bundle ${assetUrl} ha l'hash dichiarato ma non è la lista JSON attesa dal runtime. ` +
        "I dati non vengono caricati."
      );
    case "record-count-mismatch":
      return (
        `Il numero di righe del bundle ${assetUrl} non corrisponde al manifest. ` +
        `Attese ${failure.expected}, trovate ${failure.actual}. I dati non vengono caricati.`
      );
    case "gate-declared-on":
      return (
        `Il manifest di ${assetUrl} dichiara il gate ${failure.gate} attivo. ` +
        "Un bundle con un gate ON non è caricabile da questa build: i dati non vengono caricati."
      );
    case "integrity-policy-unusable":
      return (
        "Questa build non serve una policy di integrità leggibile " +
        `(${failure.errors.join("; ")}), quindi non può dichiarare cosa si aspetta da ${assetUrl}. ` +
        "Nessun payload dati viene caricato. Ricostruisci l'artefatto con `npm run build` e ricarica."
      );
  }
}

/** Short machine-ish label used in the blocking screen's heading and in tests. */
export function bundleIntegrityFailureCode(failure: BundleIntegrityFailure): string {
  return failure.kind;
}

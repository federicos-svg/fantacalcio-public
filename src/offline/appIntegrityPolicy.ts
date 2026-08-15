// App integrity policy — the single artifact that ties the packaged build to
// what the browser is allowed to run and trust offline (BUNDLE-01,
// docs/AUCTION_2026_EXECUTION_PLAN.md §5.4).
//
// It is emitted by the build (scripts/build-service-worker.mjs) into
// `dist/app-integrity.json` and read back at runtime by two different
// consumers, which is exactly why the shape lives here as PURE, dependency-free
// logic instead of inside either of them:
//
//   - the service worker (src/offline/sw.ts) gets `build_id` + `precache`
//     baked in at build time, so a new bundle produces a NEW cache name and
//     the previous shell can never be served after an update;
//   - the page-side integrity gate (src/offline/integrityGate.ts) reads the
//     policy at boot to know which data assets carry a hash manifest that has
//     to be verified before their bytes are handed to the app.
//
// Nothing here does I/O, so it is unit-testable under this repo's no-jsdom
// posture (see src/ui/roleBudgetPlan.ts for the same reasoning).

/** Schema version of `app-integrity.json`. A different value is refused, never coerced. */
export const APP_INTEGRITY_POLICY_VERSION = "app-integrity-v1";

/** Where the built policy is served from. Root-relative: same origin, always. */
export const APP_INTEGRITY_POLICY_URL = "/app-integrity.json";

/**
 * Cache-name prefix owned by this app. Every Cache Storage entry the service
 * worker creates starts with it, so `activate` can delete every OTHER version
 * of OUR shell without ever touching a cache some other app on the same origin
 * might own.
 */
export const SHELL_CACHE_PREFIX = "fac-shell-";

/**
 * One built file, with the sha256 of its exact bytes. Covers everything the
 * build emitted — the app shell AND the shipped data payloads — because the
 * build id below has to change when ANY of them changes.
 */
export interface BuiltFileIntegrity {
  /** Root-relative URL as served, e.g. `/assets/index-YnPWR5RI.js`. */
  readonly url: string;
  /** Lowercase hex sha256 of the file's bytes — same format as `bundle_sha256`. */
  readonly sha256: string;
  /** Byte length of the file. */
  readonly bytes: number;
}

/**
 * A data asset whose bytes are only usable after their hash matches the
 * manifest that ships next to them.
 *
 * `manifestRequired` is decided at BUILD time, by the presence of
 * `<asset>.manifest.json` in the built output — not at runtime. That is what
 * makes "manifest assente" a fail-closed condition for a bundle that was
 * packaged with one (the BUNDLE-01/DATA-05 final asset), while the synthetic
 * proxy asset shipped today — which has no manifest yet — stays loadable
 * exactly as before instead of being degraded by this work.
 */
export interface ProtectedDataAsset {
  /** Root-relative URL of the data asset itself. */
  readonly url: string;
  /** Root-relative URL of its hash manifest (`listoneLiveBundle.ts` shape). */
  readonly manifestUrl: string;
  /** True when the build found a manifest: from then on its absence is a failure. */
  readonly manifestRequired: boolean;
}

export interface AppIntegrityPolicy {
  readonly policy_version: typeof APP_INTEGRITY_POLICY_VERSION;
  /** sha256 over every built file's `url:sha256` line, sorted. Content-derived, never a clock. */
  readonly build_id: string;
  readonly files: readonly BuiltFileIntegrity[];
  readonly data: readonly ProtectedDataAsset[];
  /** Exact URL list the service worker precaches at install. */
  readonly precache: readonly string[];
}

export type ParsePolicyResult =
  | { readonly ok: true; readonly policy: AppIntegrityPolicy }
  | { readonly ok: false; readonly errors: readonly string[] };

const SHA256_RE = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function rootRelativeUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

/**
 * Strict parser: every field is checked, unknown shapes are refused with the
 * reason, nothing is defaulted. A policy that does not parse is treated by the
 * caller as "no policy at all" — which, in a production build, is itself a
 * fail-closed condition (see integrityGate.ts).
 */
export function parseAppIntegrityPolicy(value: unknown): ParsePolicyResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["policy must be a JSON object"] };

  if (value.policy_version !== APP_INTEGRITY_POLICY_VERSION) {
    errors.push(`policy_version must be ${APP_INTEGRITY_POLICY_VERSION}`);
  }
  if (!nonEmptyString(value.build_id) || !SHA256_RE.test(value.build_id)) {
    errors.push("build_id must be a lowercase sha256 hex string");
  }

  const files: BuiltFileIntegrity[] = [];
  if (!Array.isArray(value.files)) {
    errors.push("files must be an array");
  } else {
    for (const [index, entry] of value.files.entries()) {
      if (!isRecord(entry)) {
        errors.push(`files[${index}] must be an object`);
        continue;
      }
      if (!rootRelativeUrl(entry.url)) errors.push(`files[${index}].url must be a root-relative URL`);
      if (typeof entry.sha256 !== "string" || !SHA256_RE.test(entry.sha256)) {
        errors.push(`files[${index}].sha256 must be a lowercase sha256 hex string`);
      }
      if (!Number.isInteger(entry.bytes) || (entry.bytes as number) < 0) {
        errors.push(`files[${index}].bytes must be a non-negative integer`);
      }
      if (rootRelativeUrl(entry.url) && typeof entry.sha256 === "string" && Number.isInteger(entry.bytes)) {
        files.push({ url: entry.url, sha256: entry.sha256, bytes: entry.bytes as number });
      }
    }
  }

  const data: ProtectedDataAsset[] = [];
  if (!Array.isArray(value.data)) {
    errors.push("data must be an array");
  } else {
    for (const [index, entry] of value.data.entries()) {
      if (!isRecord(entry)) {
        errors.push(`data[${index}] must be an object`);
        continue;
      }
      if (!rootRelativeUrl(entry.url)) errors.push(`data[${index}].url must be a root-relative URL`);
      if (!rootRelativeUrl(entry.manifestUrl)) errors.push(`data[${index}].manifestUrl must be a root-relative URL`);
      if (typeof entry.manifestRequired !== "boolean") errors.push(`data[${index}].manifestRequired must be a boolean`);
      if (rootRelativeUrl(entry.url) && rootRelativeUrl(entry.manifestUrl) && typeof entry.manifestRequired === "boolean") {
        data.push({ url: entry.url, manifestUrl: entry.manifestUrl, manifestRequired: entry.manifestRequired });
      }
    }
  }

  const precache: string[] = [];
  if (!Array.isArray(value.precache)) {
    errors.push("precache must be an array");
  } else {
    for (const [index, entry] of value.precache.entries()) {
      if (!rootRelativeUrl(entry)) errors.push(`precache[${index}] must be a root-relative URL`);
      else precache.push(entry);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    policy: {
      policy_version: APP_INTEGRITY_POLICY_VERSION,
      build_id: value.build_id as string,
      files,
      data,
      precache,
    },
  };
}

/**
 * Cache name for a build. Deriving it from `build_id` — itself derived from the
 * shell's content hashes — is what makes a new bundle invalidate the old cache
 * mechanically: a changed byte anywhere in the shell changes `build_id`,
 * changes the cache name, and the previous cache is deleted on activate. No
 * hand-maintained version counter to forget to bump.
 */
export function shellCacheName(buildId: string): string {
  return `${SHELL_CACHE_PREFIX}${buildId}`;
}

/**
 * Every cache of OURS that is not the current one. Caches that do not carry
 * our prefix are never returned: deleting a cache this app did not create is
 * not this service worker's business.
 */
export function staleShellCacheNames(existing: readonly string[], current: string): string[] {
  return existing.filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== current);
}

/** The protected-asset entry for a pathname, or null when the path is not protected. */
export function protectedAssetFor(
  policy: AppIntegrityPolicy,
  pathname: string,
): ProtectedDataAsset | null {
  return policy.data.find((asset) => asset.url === pathname) ?? null;
}

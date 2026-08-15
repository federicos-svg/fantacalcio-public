// Service-worker routing policy — PURE, no `self`, no Cache API, no fetch.
//
// The service worker (src/offline/sw.ts) is the one file in this repo that
// cannot be exercised by the test runner: it only exists inside a
// ServiceWorkerGlobalScope. So every decision it makes lives here instead, as
// plain functions over plain data, and sw.ts is reduced to the imperative shell
// that wires those decisions to the real Cache API.
//
// The strategy is explicit per class of request, never "cache everything":
//
//   navigation   network-first with a bounded timeout, cache fallback.
//                Cache-first would be faster but would serve the PREVIOUS
//                index.html for one whole load after an update — the exact
//                stale-shell failure BUNDLE-01 must not have on 03/09. The
//                timeout is what covers the auction-day case that is worse
//                than being offline: a network that accepts the connection and
//                never answers (captive portal / hotspot).
//   shell-asset  cache-first. Filenames under /assets/ are content-hashed by
//                the build, so a given URL's bytes never change; a new build
//                produces new URLs AND a new cache name.
//   data-asset   network-first, cache fallback, and the cache is refreshed on
//                every success — the listone must be the freshest one that is
//                actually reachable, and the last good copy must survive going
//                offline. Integrity of those bytes is NOT decided here: the
//                page-side gate (integrityGate.ts) verifies the hash of
//                whatever comes out, cache or network alike.
//   network-only /api/** — the private deposit is never cached. A stale
//                deposit served from Cache Storage during an auction would be
//                worse than no deposit at all, which the app already handles.
//   passthrough  everything else: cross-origin, non-GET, unknown same-origin
//                paths. The service worker does not answer what it was not
//                built to answer.

export type SwRouteKind = "navigation" | "shell-asset" | "data-asset" | "network-only" | "passthrough";

export interface SwRequestFacts {
  /** HTTP method, uppercase. */
  readonly method: string;
  /** `request.mode` — "navigate" for a document load. */
  readonly mode: string;
  /** Absolute request URL. */
  readonly url: string;
  /** The service worker's own origin. */
  readonly origin: string;
  /** Exact URL paths the install step precached, root-relative. */
  readonly precachedPaths: ReadonlySet<string>;
}

/** Paths under this prefix are the app's own build output (content-hashed names). */
export const SHELL_ASSET_PREFIX = "/assets/";
/** Paths under this prefix are shipped data payloads (the listone and its manifest). */
export const DATA_ASSET_PREFIX = "/data/";
/** Paths under this prefix are backend endpoints and are never cached. */
export const NETWORK_ONLY_PREFIX = "/api/";

/** How long a navigation waits for the network before falling back to the cached shell. */
export const NAVIGATION_NETWORK_TIMEOUT_MS = 2500;

export function classifySwRequest(facts: SwRequestFacts): SwRouteKind {
  if (facts.method !== "GET") return "passthrough";

  let pathname: string;
  try {
    const parsed = new URL(facts.url);
    if (parsed.origin !== facts.origin) return "passthrough";
    pathname = parsed.pathname;
  } catch {
    return "passthrough";
  }

  if (pathname.startsWith(NETWORK_ONLY_PREFIX)) return "network-only";
  // Checked before the prefix rules: a document load is a navigation whatever
  // path it carries, and it is the only request that can bring the app back
  // from a cold start.
  if (facts.mode === "navigate") return "navigation";
  if (pathname.startsWith(DATA_ASSET_PREFIX)) return "data-asset";
  if (pathname.startsWith(SHELL_ASSET_PREFIX)) return "shell-asset";
  // Anything else that was explicitly precached (index.html, the integrity
  // policy, the root) is served as shell too — being in the precache list IS
  // the declaration that this build owns that URL.
  if (facts.precachedPaths.has(pathname)) return "shell-asset";
  return "passthrough";
}

/**
 * The cache key a navigation falls back to. Every navigation resolves to the
 * single app shell — this is a one-document app whose routing is client-side —
 * so a deep link opened offline still gets the shell instead of a cache miss.
 */
export function navigationFallbackPath(precachedPaths: ReadonlySet<string>): string | null {
  if (precachedPaths.has("/index.html")) return "/index.html";
  if (precachedPaths.has("/")) return "/";
  return null;
}

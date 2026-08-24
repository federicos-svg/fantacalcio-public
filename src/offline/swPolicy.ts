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
//   absent-asset a same-origin /assets/** URL this build does NOT own:
//                answered locally with a 404, never fetched. The precache list
//                is the COMPLETE inventory of this build's /assets/** URLs —
//                scripts/build-service-worker.mjs enumerates every file under
//                dist/ and buildIntegrityPolicy precaches all of them — so a
//                path under that prefix that is missing from the list is proof
//                the artifact does not contain it, not a hint. Asking the
//                network for it can only produce a 404, the SPA fallback's
//                index.html dressed up as an image, or, offline, a failed
//                request; and the callers of these URLs already degrade on the
//                image's own `onerror` (club logos, src/ui/serieA.ts). This is
//                the rule that makes a cold start's club badges independent of
//                the race BUNDLE-01 lost until now: the precache install and
//                the page's first render run concurrently, so whether a club
//                logo happened to be written into Cache Storage during an
//                earlier online visit depended on which of the two got there
//                first. Measured on the failing spec (offline-cold-start,
//                "boots from cache with the context offline"): 19 failures out
//                of 20 under CPU pressure before this rule, 0 after it.
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

export type SwRouteKind =
  | "navigation"
  | "shell-asset"
  | "absent-asset"
  | "data-asset"
  | "network-only"
  | "passthrough";

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

/**
 * How long a shipped data payload waits for the network before the cached copy
 * takes over.
 *
 * 4000 and not 2500 because the payload is not the same size class: the shell
 * documents are a few kB, the real listone is orders of magnitude larger, and a
 * bound tight enough for an HTML document would abandon a download that was
 * simply still arriving. The figure is not invented here either — it is the one
 * the app itself already applies to the same payload from the other direction
 * (`LISTONE_REMOTE_TIMEOUT_MS` in src/main.ts, "a listone that hasn't arrived in
 * 4s is not worth a blank panel during an auction"). Two different numbers for
 * the same object would be two different beliefs about the same auction.
 */
export const DATA_ASSET_NETWORK_TIMEOUT_MS = 4000;

/**
 * How long a cache MISS on a shell asset waits for the network.
 *
 * Same bound as a navigation, and for the same reason: a shell asset that is
 * not in the cache is a document-sized file on the critical rendering path.
 * Reaching this code at all already means the precache did not answer, so the
 * only choice left is between failing fast and hanging — and hanging a
 * subresource hangs the page that needs it.
 */
export const SHELL_ASSET_NETWORK_TIMEOUT_MS = NAVIGATION_NETWORK_TIMEOUT_MS;

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
  // Precache membership is checked BEFORE the /assets/ prefix, not after,
  // because it is the stronger fact: being in the precache list IS the
  // declaration that this build owns that URL — index.html, the integrity
  // policy and the root reach the shell strategy through this line too.
  if (facts.precachedPaths.has(pathname)) return "shell-asset";
  // Under the shell prefix but absent from the inventory: this build does not
  // have the file, so there is nothing the network could usefully add. See the
  // `absent-asset` paragraph in the header.
  if (pathname.startsWith(SHELL_ASSET_PREFIX)) return "absent-asset";
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

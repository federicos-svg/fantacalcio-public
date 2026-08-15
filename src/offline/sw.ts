// The service worker — the imperative shell around swPolicy.ts.
//
// BUNDLE-01 Part 1: without this file the app simply does not start without
// the network, however good the offline behaviour of the already-loaded core
// is. A page that was never fetched cannot run.
//
// Built, never served from src/: scripts/build-service-worker.mjs compiles this
// file to `dist/sw.js` as a classic (IIFE) script and injects two build-time
// constants below. Classic and not `{ type: "module" }` deliberately — a module
// service worker is still not supported everywhere, and the one guarantee this
// file exists to provide is "it starts".
//
// The two injected constants are what make a new bundle invalidate the old
// cache: `__FAC_BUILD_ID__` is derived from the sha256 of every shell file, so
// any change to the built app changes the cache name AND the bytes of this very
// file — which is what makes the browser notice there is a new worker at all.
// A service worker whose bytes never change is a service worker that never
// updates, and a shell cached under a name that never changes is the stale
// shell BUNDLE-01 must not ship.

import {
  classifySwRequest,
  navigationFallbackPath,
  DATA_ASSET_NETWORK_TIMEOUT_MS,
  NAVIGATION_NETWORK_TIMEOUT_MS,
  SHELL_ASSET_NETWORK_TIMEOUT_MS,
} from "./swPolicy.js";
import { shellCacheName, staleShellCacheNames } from "./appIntegrityPolicy.js";

declare const __FAC_BUILD_ID__: string;
declare const __FAC_PRECACHE__: readonly string[];

// ── Minimal ServiceWorkerGlobalScope typing ──────────────────────────────────
// tsconfig.json ships the DOM lib (this is a browser app), not WebWorker, so
// `self` is typed as a Window here. Rather than widen the project-wide lib list
// for one file — which would make every OTHER file typecheck against APIs it
// must not use — the handful of members this worker touches are declared
// locally and `self` is cast once.
interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}
interface ServiceWorkerGlobalScopeLike {
  readonly location: { readonly origin: string };
  readonly caches: CacheStorage;
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: "install" | "activate", listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void;
}

const sw = self as unknown as ServiceWorkerGlobalScopeLike;

const CACHE_NAME = shellCacheName(__FAC_BUILD_ID__);
const PRECACHE: readonly string[] = __FAC_PRECACHE__;
const PRECACHED_PATHS: ReadonlySet<string> = new Set(PRECACHE);

/**
 * Install is fail-closed: `addAll` rejects as a whole if a single URL fails, so
 * a partially cached shell is never activated. The app keeps working online
 * with no worker at all, which is exactly the state it was in before this file
 * existed — a half-populated cache that boots into a broken page offline would
 * be strictly worse.
 *
 * `cache: "reload"` bypasses the browser's HTTP cache for the precache
 * requests: the point is to store what the server has NOW, not whatever a
 * previous visit left in the HTTP cache.
 */
sw.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await sw.caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
      // Take over as soon as this install succeeds instead of waiting for every
      // tab to close: the alternative is a browser that keeps running the
      // PREVIOUS worker — and serving its cache — for an unbounded time.
      await sw.skipWaiting();
    })(),
  );
});

/**
 * Activate deletes every other cache this app owns. That is the invalidation
 * step: after it, the only shell that can be served is the one this build
 * precached. Caches without our prefix are left alone.
 */
sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await sw.caches.keys();
      await Promise.all(staleShellCacheNames(names, CACHE_NAME).map((name) => sw.caches.delete(name)));
      await sw.clients.claim();
    })(),
  );
});

/** A network fetch that is abandoned — not merely slow — after `ms`. */
async function fetchWithTimeout(request: Request, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cache lookup SCOPED to this build's cache.
 *
 * Not `caches.match(request)`: the CacheStorage-level match searches EVERY
 * cache on the origin, so a leftover cache from a previous build — or from
 * anything else that ever cached this origin — could answer for us. Scoping the
 * lookup is the second half of the anti-stale-shell rule, the one that holds
 * even in the window before `activate` has finished deleting the old caches.
 */
async function matchInCache(request: Request | string): Promise<Response | undefined> {
  const cache = await sw.caches.open(CACHE_NAME);
  // `ignoreVary` is load-bearing, not a nicety. The precache is keyed by URL:
  // entries are stored from plain `new Request(url)` calls, with no Origin
  // header. The page then asks for the very same files with `crossorigin`
  // (that is how Vite emits the module script and the stylesheet), i.e. WITH an
  // Origin header — and the server answers `Vary: Origin`. Without this flag
  // the two do not match, every asset misses the cache, and a cold start offline
  // renders the empty HTML shell with no JS and no CSS: measured, not feared.
  return cache.match(request, { ignoreVary: true });
}

/** Stores a successful response, ignoring storage failures (a full quota must
 *  never turn a working response into a failed one). */
async function putInCache(request: Request, response: Response): Promise<void> {
  try {
    const cache = await sw.caches.open(CACHE_NAME);
    await cache.put(request, response);
  } catch {
    /* cache write failures are non-fatal: the live response was already served */
  }
}

async function handleNavigation(request: Request): Promise<Response> {
  try {
    const fresh = await fetchWithTimeout(request, NAVIGATION_NETWORK_TIMEOUT_MS);
    if (fresh.ok) {
      await putInCache(request, fresh.clone());
      return fresh;
    }
  } catch {
    /* offline, timed out, or refused — fall through to the cached shell */
  }
  const fallbackPath = navigationFallbackPath(PRECACHED_PATHS);
  if (fallbackPath !== null) {
    const cached = await matchInCache(fallbackPath);
    if (cached) return cached;
  }
  const cachedExact = await matchInCache(request);
  if (cachedExact) return cachedExact;
  // Nothing cached and no network: say so in a page instead of the browser's
  // own dinosaur, so the state is readable during an auction.
  return new Response(OFFLINE_SHELL_MISSING_HTML, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function handleShellAsset(request: Request): Promise<Response> {
  const cached = await matchInCache(request);
  if (cached) return cached;
  // Bounded like every other network call in this file. Cache-first makes this
  // the rarer path, not a safe one: a subresource left pending on a network
  // that never answers hangs the page just as thoroughly as a pending
  // navigation, and here there is no cached copy to fall back to — so failing
  // fast (the request rejects, the browser reports it) is the only honest
  // outcome, and it must arrive in bounded time.
  const fresh = await fetchWithTimeout(request, SHELL_ASSET_NETWORK_TIMEOUT_MS);
  if (fresh.ok) await putInCache(request, fresh.clone());
  return fresh;
}

async function handleDataAsset(request: Request): Promise<Response> {
  try {
    // THE bound that matters on auction day. This path is network-first even
    // with a warm cache, so an unbounded fetch here does not merely slow the
    // first visit down: on a network that accepts the connection and never
    // answers, the promise neither resolves nor rejects, the `catch` below is
    // never reached, and the app hangs WHILE HOLDING a perfectly good cached
    // listone. The timeout is what turns that into the fallback this function
    // was written to perform.
    const fresh = await fetchWithTimeout(request, DATA_ASSET_NETWORK_TIMEOUT_MS);
    if (fresh.ok) {
      await putInCache(request, fresh.clone());
      return fresh;
    }
    // A 404/500 from the server does not delete the last good copy: an asset
    // that stops being deployed must not also stop being available offline.
    const cachedOnError = await matchInCache(request);
    return cachedOnError ?? fresh;
  } catch {
    const cached = await matchInCache(request);
    if (cached) return cached;
    throw new Error("data asset unavailable offline and not cached");
  }
}

const OFFLINE_SHELL_MISSING_HTML =
  '<!doctype html><html lang="it"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  "<title>Fantacalcio Auction Copilot — offline</title></head>" +
  '<body style="font-family:system-ui,sans-serif;background:#0f1115;color:#e6e6e6;padding:24px">' +
  "<h1>App non disponibile offline</h1>" +
  "<p>Questa copia del browser non ha ancora una cache dell'app: serve una visita online " +
  "per installarla. Torna online e ricarica.</p></body></html>";

sw.addEventListener("fetch", (event) => {
  const request = event.request;
  const kind = classifySwRequest({
    method: request.method,
    mode: request.mode,
    url: request.url,
    origin: sw.location.origin,
    precachedPaths: PRECACHED_PATHS,
  });
  if (kind === "passthrough" || kind === "network-only") return;
  if (kind === "navigation") {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (kind === "data-asset") {
    event.respondWith(handleDataAsset(request));
    return;
  }
  event.respondWith(handleShellAsset(request));
});

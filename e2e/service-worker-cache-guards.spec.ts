// Regression cover for the two corrections inside `matchInCache`
// (src/offline/sw.ts): `ignoreVary: true` and the scoping of the lookup to
// THIS build's cache. Both were found by measurement while building
// BUNDLE-01, and neither was covered by a test that goes red when the
// correction is removed — so nothing stopped a future refactor from deleting
// them in silence. These two specs are that stop.
//
// Each is written to fail for exactly one reason, and each has been falsified
// by removing the line it protects (see the report for the before/after).
//
// An honest limit, declared rather than papered over: the ORIGINAL failure
// that motivated `ignoreVary` — `Vary: Origin` on the precached assets versus
// the `crossorigin` requests Vite emits — is no longer reproducible end to end
// in this harness. It was measured (the cold start rendered an empty shell with
// no JS and no CSS), it was fixed by that flag, and today removing the flag no
// longer breaks the cold start: something in the browser/preview-server pair
// now matches those two requests anyway. `Vary` matching itself has not gone
// away, so the first spec below drives the SAME line through the same code
// path with a Vary header this test CAN control — `Origin` cannot be set on a
// Request from script, it is a forbidden header name, which is precisely why
// the production case cannot be staged by hand.
import { expect, test, type Page } from "@playwright/test";
// `waitForServiceWorkerControl` viveva in tre copie identiche (qui,
// e2e/offline-cold-start.spec.ts, e ora anche le spec del listone che devono
// aspettare la fine del precache). Una sola, in e2e/helpers.ts: tre copie della
// stessa attesa possono divergere proprio sulla condizione che fa da guardia.
import { waitForServiceWorkerControl } from "./helpers.js";

const LISTONE_PATH = "/data/listone_2025_26.json";
const PRECACHED_MARKER = '[{"name":"Cache Precaricata","role":"P","club":"ClubCache","quotation":1}]';
const POISON_MARKER = '[{"name":"Cache Avvelenata","role":"P","club":"ClubVeleno","quotation":99}]';

/** The one cache this build owns. */
async function currentCacheName(page: Page): Promise<string> {
  const names = await page.evaluate(() => caches.keys());
  const ours = names.filter((name) => name.startsWith("fac-shell-"));
  expect(ours, "exactly one cache of ours must exist after activation").toHaveLength(1);
  return ours[0]!;
}

test.describe("service worker cache lookup — regression guards", () => {
  test("a Vary header the live request does not match still resolves from the precache", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await waitForServiceWorkerControl(page);
    const cacheName = await currentCacheName(page);

    // Restage the precached listone as a response that VARIES on a header the
    // stored request does not carry — the same shape as the production
    // `Vary: Origin` entry, with a header this test is allowed to set.
    await page.evaluate(
      async ([name, path, body]) => {
        const cache = await caches.open(name!);
        await cache.put(
          new Request(path!),
          new Response(body!, {
            status: 200,
            headers: { "content-type": "application/json", Vary: "X-Fac-Probe" },
          }),
        );
      },
      [cacheName, LISTONE_PATH, PRECACHED_MARKER] as const,
    );

    // Offline, so the cache is the only possible answer: whatever comes back
    // came out of `matchInCache`.
    await context.setOffline(true);

    const served = await page.evaluate(async (path) => {
      try {
        const res = await fetch(path, { headers: { "X-Fac-Probe": "live-request" } });
        return { ok: res.ok, body: await res.text() };
      } catch (error) {
        return { ok: false, body: `THREW: ${String(error)}` };
      }
    }, LISTONE_PATH);

    // Without `ignoreVary: true` this is a cache MISS, the network is off, and
    // the fetch rejects — offline the app would find no listone at all.
    expect(served.ok, `the precached entry must still be found: got ${served.body}`).toBe(true);
    expect(served.body).toBe(PRECACHED_MARKER);
  });

  test("a network that hangs falls back to the cached listone instead of waiting forever", async ({
    page,
    context,
  }) => {
    // THE auction-day case, and the one an unbounded `fetch` inside
    // `handleDataAsset` would lose: the listone path is network-first even with
    // a warm cache, so a network that accepts the connection and never answers
    // leaves the promise neither resolved nor rejected — the `catch` that does
    // the cache fallback is never reached, and the app hangs WHILE HOLDING a
    // perfectly good copy. Nothing about this needs the device to be offline.
    await page.goto("/");
    await waitForServiceWorkerControl(page);
    const cacheName = await currentCacheName(page);

    // A marker in the cache, so the assertion can tell "answered from cache"
    // from "the network answered after all" — a hang that is not really a hang
    // would otherwise pass silently.
    await page.evaluate(
      async ([name, path, body]) => {
        const cache = await caches.open(name!);
        await cache.put(
          new Request(path!),
          new Response(body!, { status: 200, headers: { "content-type": "application/json" } }),
        );
      },
      [cacheName, LISTONE_PATH, PRECACHED_MARKER] as const,
    );

    // The network accepts the request and never answers it. The route handler
    // deliberately never calls fulfill/continue/abort.
    let hungRequests = 0;
    await context.route(`**${LISTONE_PATH}`, () => {
      hungRequests += 1;
    });

    const outcome = await page.evaluate(async (path) => {
      const startedAt = performance.now();
      try {
        const res = await fetch(path);
        return { settled: true, body: await res.text(), ms: performance.now() - startedAt };
      } catch (error) {
        return { settled: false, body: `THREW: ${String(error)}`, ms: performance.now() - startedAt };
      }
    }, LISTONE_PATH);

    // The request really was intercepted and left hanging: otherwise this test
    // proves nothing about timeouts.
    expect(hungRequests, "the network request must have been intercepted and left pending").toBeGreaterThan(0);
    // It settled — bounded — and it settled with the CACHED copy.
    expect(outcome.settled).toBe(true);
    expect(outcome.body).toBe(PRECACHED_MARKER);
    // Bounded by the service worker's data-asset timeout, not by luck.
    expect(outcome.ms).toBeLessThan(15_000);

    // And the app itself stays usable throughout.
    await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  });

  test("a shell asset missing from the cache fails fast instead of hanging", async ({ page, context }) => {
    // The cache-first path's own version of the same hazard. Reaching the
    // network here means the precache did not answer, so there is nothing to
    // fall back to — but "nothing to fall back to" must arrive as a failure in
    // bounded time, not as a subresource that stays pending and hangs whatever
    // needed it. Nothing wraps this one: no integrity gate, no outer bound, so
    // the worker's own timeout is the only thing standing between the page and
    // an unbounded wait.
    await page.goto("/");
    await waitForServiceWorkerControl(page);
    const cacheName = await currentCacheName(page);

    const shellAssetUrl = await page.evaluate(async () => {
      const policy = (await (await fetch("/app-integrity.json")).json()) as {
        files: Array<{ url: string }>;
      };
      return policy.files.map((file) => file.url).find((url) => url.endsWith(".js")) ?? null;
    });
    expect(shellAssetUrl, "the build must ship a hashed JS asset").not.toBeNull();

    // Hole in the cache + a network that accepts and never answers.
    await page.evaluate(
      async ([name, url]) => {
        const cache = await caches.open(name!);
        await cache.delete(url!);
      },
      [cacheName, shellAssetUrl] as const,
    );
    let hungRequests = 0;
    await context.route(`**${shellAssetUrl}`, () => {
      hungRequests += 1;
    });

    const outcome = await page.evaluate(async (url) => {
      const startedAt = performance.now();
      try {
        const res = await fetch(url!);
        return { settled: true, ok: res.ok, ms: performance.now() - startedAt };
      } catch {
        return { settled: true, ok: false, ms: performance.now() - startedAt };
      }
    }, shellAssetUrl);

    expect(hungRequests, "the network request must have been intercepted and left pending").toBeGreaterThan(0);
    expect(outcome.settled).toBe(true);
    expect(outcome.ok).toBe(false);
    expect(outcome.ms).toBeLessThan(15_000);
  });

  test("an /assets/ URL this build does not contain is answered locally, never from the network", async ({
    page,
    context,
  }) => {
    // BUNDLE-01, the race that made `offline-cold-start.spec.ts` flaky: the
    // club badges ask for `/assets/clubs/<slug>.svg`, a URL computed from the
    // club name at runtime (src/ui/serieA.ts), and this repository ships no
    // logo file at all. Such a URL can never be in the precache list, so it
    // used to fall through to the network — where, offline and cold, it simply
    // failed, and where, online, it landed in Cache Storage only if the page
    // happened to re-render AFTER `clients.claim()`. That coin toss is what
    // this spec removes: the precache list is the complete inventory of the
    // built artifact, so a `/assets/` path missing from it is proof of absence,
    // and the worker answers it itself.
    await page.goto("/");
    await waitForServiceWorkerControl(page);

    // The URL the APP really asks for, taken from the rendered badge rather
    // than reconstructed here — a hardcoded slug would keep passing after the
    // product stopped requesting it.
    const logoPath = await page.evaluate(() => {
      const img = document.querySelector('img[src^="/assets/clubs/"]');
      return img === null ? null : new URL(img.getAttribute("src")!, location.origin).pathname;
    });
    expect(logoPath, "the app must be rendering at least one club logo URL").not.toBeNull();

    // Precondition — and it is a QUESTION asked of the deployment, not an
    // assertion made about it. If a deployment ships the club logos, they are
    // precached like any other built file, the worker answers them from the
    // precache, and the rule under test — "an `/assets/` URL this build does
    // NOT contain" — simply has no subject here. The spec then SAYS SO and
    // skips, which is exactly what the paragraph above always prescribed:
    // «the rule under test never applies, and this spec must say so instead of
    // proving nothing».
    //
    // Why a skip and not an assertion, stated because the difference is the
    // whole correction. This file is PUBLIC-OWNED: it is vendored, unchanged,
    // into a private deployment that DOES ship the logo files. As an assertion
    // the precondition was a claim about THIS repository's asset inventory that
    // silently turned into a claim about a DIFFERENT tree's inventory the
    // moment it crossed that boundary — and there it went red against a build
    // that was behaving perfectly correctly. A test that fails because its
    // premise stopped holding is not covering the rule any more, it is
    // reporting its own premise.
    //
    // Nothing is weakened. Where the rule applies — no logo in the precache,
    // which is this repository, that ships no logo file at all — every
    // assertion below runs exactly as before, unchanged. What disappears is
    // only the ability to fail for a reason that has nothing to do with the
    // worker.
    const precache = await page.evaluate(
      async () => ((await (await fetch("/app-integrity.json")).json()) as { precache: string[] }).precache,
    );
    test.skip(
      precache.includes(logoPath!),
      "this deployment ships the club logos in its precache: the rule under test does not apply here",
    );

    // A network that accepts the request and never answers it. If the worker
    // reaches for the network at all, this counter moves.
    let hungRequests = 0;
    await context.route(`**${logoPath}`, () => {
      hungRequests += 1;
    });

    const outcome = await page.evaluate(async (path) => {
      try {
        const res = await fetch(path!);
        return { settled: true, status: res.status };
      } catch (error) {
        return { settled: false, status: `THREW: ${String(error)}` };
      }
    }, logoPath);

    // THE assertion: the network was never asked. Not "it was fast" — a
    // threshold would only say the timeout happened to be short today.
    expect(hungRequests, "the worker must not fetch an asset this build does not contain").toBe(0);
    // And the app gets the answer it already knows how to handle: a load
    // failure, which is what drives the club badge's `onerror` fallback.
    expect(outcome.settled).toBe(true);
    expect(outcome.status).toBe(404);

    // Offline changes nothing, which is the whole point of the rule.
    await context.setOffline(true);
    const offlineOutcome = await page.evaluate(async (path) => {
      try {
        return { settled: true, status: (await fetch(path!)).status };
      } catch (error) {
        return { settled: false, status: `THREW: ${String(error)}` };
      }
    }, logoPath);
    expect(offlineOutcome.settled).toBe(true);
    expect(offlineOutcome.status).toBe(404);
    expect(hungRequests, "still no network attempt once the context is offline").toBe(0);
  });

  test("a foreign cache is never consulted, even when this build's cache has a hole", async ({ page, context }) => {
    await page.goto("/");
    await waitForServiceWorkerControl(page);
    const cacheName = await currentCacheName(page);

    // The exact state a global `caches.match()` would fall for, held LIVE at
    // the moment of the fetch (not merely before an activation): a cache this
    // app does not own — so `activate` will never delete it — holding an
    // answer for a URL that is missing from the current cache.
    await page.evaluate(
      async ([name, path, poison]) => {
        const foreign = await caches.open("some-other-app-cache-v1");
        await foreign.put(
          new Request(path!),
          new Response(poison!, { status: 200, headers: { "content-type": "application/json" } }),
        );
        const ours = await caches.open(name!);
        await ours.delete(path!);
      },
      [cacheName, LISTONE_PATH, POISON_MARKER] as const,
    );

    // Both preconditions really hold at fetch time.
    expect(await page.evaluate(() => caches.keys())).toContain("some-other-app-cache-v1");
    expect(
      await page.evaluate(
        async ([name, path]) => (await (await caches.open(name!)).match(path!)) !== undefined,
        [cacheName, LISTONE_PATH] as const,
      ),
    ).toBe(false);

    await context.setOffline(true);

    const served = await page.evaluate(async (path) => {
      try {
        const res = await fetch(path);
        return { ok: res.ok, body: await res.text() };
      } catch (error) {
        return { ok: false, body: `THREW: ${String(error)}` };
      }
    }, LISTONE_PATH);

    // The only acceptable outcome is "nothing" — a miss the app already knows
    // how to survive. Returning another cache's bytes as this build's listone
    // is the failure being guarded against.
    expect(served.body).not.toContain("Cache Avvelenata");
    expect(served.ok).toBe(false);

    // And the app itself keeps running on what it already holds, rather than
    // ingesting the foreign payload.
    await expect(page.locator("#critical-budget")).toHaveText("500 cr");
    const persistedPool = await page.evaluate(() => window.localStorage.getItem("fac_pool"));
    expect(persistedPool ?? "").not.toContain("Cache Avvelenata");
  });
});

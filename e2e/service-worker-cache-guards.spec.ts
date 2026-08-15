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

const LISTONE_PATH = "/data/listone_2025_26.json";
const PRECACHED_MARKER = '[{"name":"Cache Precaricata","role":"P","club":"ClubCache","quotation":1}]';
const POISON_MARKER = '[{"name":"Cache Avvelenata","role":"P","club":"ClubVeleno","quotation":99}]';

/** Resolves once the worker controls the page — i.e. install (and its
 *  `cache.addAll`) completed and activate claimed this client. */
async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) return false;
      await navigator.serviceWorker.ready;
      return navigator.serviceWorker.controller !== null;
    },
    undefined,
    { timeout: 15_000 },
  );
}

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

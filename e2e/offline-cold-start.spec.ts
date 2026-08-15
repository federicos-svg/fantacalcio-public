// BUNDLE-01 Part 1 — the proof that matters: a NETWORK-FREE COLD START.
//
// Every other offline assertion in this suite (receipts-offline.spec.ts,
// shadow-offline-states.spec.ts) switches the network off AFTER `page.goto("/")`
// has already delivered the app: it proves the loaded core keeps working, which
// is a different and weaker claim. Here the page that boots has never been
// fetched: the previous page is closed, the whole browser CONTEXT is switched
// offline, and a brand-new page navigates to "/" with nothing but Cache Storage
// to answer it.
//
// Deliberately NOT using installSyntheticNetworkGuard: a `route.fulfill` answer
// is served by Playwright, not by the network, so a suite-standard route guard
// would hand the app its data even with the context offline — and the test
// would prove nothing about a cold start. Everything here comes from the real
// built artifact and the real service-worker cache; the only interception is a
// recorder that aborts (and fails the test on) anything leaving this origin.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The listone that actually ships in the build. Synthetic content (see
// public/data/listone_2025_26.json), read here so the assertions follow the
// asset instead of hardcoding a copy of it.
const SHIPPED_LISTONE = JSON.parse(
  readFileSync(fileURLToPath(new URL("../public/data/listone_2025_26.json", import.meta.url)), "utf8"),
) as ReadonlyArray<{ name: string; role: string; club: string; quotation: number }>;

const TARGET = SHIPPED_LISTONE.find((row) => row.role === "A") ?? SHIPPED_LISTONE[0]!;
const PRICE = 17;

/** `build_id` of the artifact THIS worktree just built. */
function localBuildId(): string {
  const policyPath = fileURLToPath(new URL("../dist/app-integrity.json", import.meta.url));
  return (JSON.parse(readFileSync(policyPath, "utf8")) as { build_id: string }).build_id;
}

/** `build_id` of the artifact the server under test is actually serving. */
async function servedBuildId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const res = await fetch("/app-integrity.json");
    return (await res.json()).build_id as string;
  });
}

/**
 * Refuses to prove anything about the wrong tree.
 *
 * The suite's own harness (e2e/harness/global-setup.ts) is the primary guard
 * and runs first: it compares the served `index.html` with this tree's and
 * stops the whole run against a foreign server. This assertion is the
 * per-artifact complement, and covers what a once-per-run check cannot: the
 * `app-integrity.json` this feature actually depends on, re-read inside the
 * test — so a dist rebuilt underneath a running suite, or a policy answered
 * from a stale cache, is caught where it would corrupt the evidence.
 */
async function expectServingThisTree(page: Page): Promise<string> {
  const served = await servedBuildId(page);
  expect(
    served,
    "the server under test is serving a DIFFERENT build than this worktree's dist/ — " +
      "every result below would be about someone else's tree (check for a stale/foreign preview server on this port)",
  ).toBe(localBuildId());
  return served;
}

/** Records and blocks anything that would leave this origin; same-origin
 *  requests are left to the real network (which is the point: offline must
 *  really mean offline). */
async function installOriginOnlyGuard(context: BrowserContext, externalRequests: string[]): Promise<void> {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    externalRequests.push(route.request().url());
    return route.abort("blockedbyclient");
  });
}

/** Resolves once the worker is installed, activated AND controlling this page —
 *  which, with the install step awaiting `cache.addAll`, means the precache is
 *  complete. No timers, no arbitrary waits. */
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

async function assignTarget(page: Page): Promise<void> {
  await page.getByText(TARGET.name, { exact: true }).click();
  const avvia = page.getByRole("button", { name: /^Avvia/ });
  await expect(avvia).toBeEnabled();
  await avvia.click();
  await expect(page.locator("#assign-team")).toHaveValue("Io");
  await page.locator("#assign-price").fill(String(PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
}

test.describe("BUNDLE-01 — network-free cold start", () => {
  test("boots from cache with the context offline and stays fully operational", async ({ context }) => {
    const externalRequests: string[] = [];
    await installOriginOnlyGuard(context, externalRequests);

    // ── 1. One online visit. This is the only thing the cold start below is
    // allowed to depend on.
    const warm = await context.newPage();
    await warm.goto("/");
    await expect(warm.locator("#critical-budget")).toHaveText("500 cr");
    await expect(warm.getByText(TARGET.name, { exact: true })).toBeVisible();
    await waitForServiceWorkerControl(warm);

    // The shell really is in Cache Storage, under a cache named for THIS
    // build — not "some cache exists", and not another checkout's.
    const buildId = await expectServingThisTree(warm);
    const cacheNames = await warm.evaluate(() => caches.keys());
    expect(cacheNames).toEqual([`fac-shell-${buildId}`]);

    // ── 2. The tab is closed and the whole context loses the network. Nothing
    // of the app survives in memory: what boots next is a genuine cold start.
    await warm.close();
    await context.setOffline(true);

    const cold = await context.newPage();
    const coldFailures: string[] = [];
    cold.on("requestfailed", (request) => coldFailures.push(request.url()));

    await cold.goto("/");

    // ── 3. The app is there, with its listone, with no network at all.
    await expect(cold.locator("#critical-budget")).toHaveText("500 cr");
    await expect(cold.locator("#critical-max-bid")).toContainText("473 cr");
    for (const row of SHIPPED_LISTONE) {
      await expect(cold.getByText(row.name, { exact: true })).toBeVisible();
    }
    // Offline is *recognised*, not merely survived (UI-FIX-03 state).
    await cold.locator("nav").getByText("Impostazioni", { exact: true }).click();
    await cold.locator("#settings-tab-status").click();
    await expect(cold.locator("#connectivity-status")).toContainText("OFFLINE");
    await cold.locator("nav").getByText("Asta", { exact: true }).click();

    // ── 4. Assign — offline, on a page that was never fetched.
    await assignTarget(cold);
    await expect(cold.locator("#critical-budget")).toHaveText(`${500 - PRICE} cr`);
    await expect(cold.locator("#critical-spent")).toHaveText(`${PRICE} cr`);

    // ── 5. Export the log (still offline).
    const downloadPromise = cold.waitForEvent("download");
    await cold.locator("#auction-log-export").click();
    const exportedPath = await (await downloadPromise).path();
    expect(exportedPath).not.toBeNull();

    // ── 6. Undo it.
    await cold.getByRole("button", { name: "Annulla", exact: true }).press("Enter");
    await cold.locator("#void-confirm-apply").click();
    await expect(cold.locator("#critical-budget")).toHaveText("500 cr");

    // ── 7. Import it back.
    await cold.locator("#auction-log-import-file").setInputFiles(exportedPath!);
    await cold.locator("#import-confirm-apply").click();
    await expect(cold.locator("#critical-budget")).toHaveText(`${500 - PRICE} cr`);

    // ── 8. Replay: a full reload, still with no network, restores the state
    // from the persisted log — the app comes back a second time from cache.
    await cold.reload();
    await expect(cold.locator("#critical-budget")).toHaveText(`${500 - PRICE} cr`);
    await expect(cold.locator("#critical-spent")).toHaveText(`${PRICE} cr`);
    const storico = cold.locator(".panel", { hasText: "STORICO ACQUISTI" });
    await expect(storico).toContainText(TARGET.name);

    // Nothing left this origin at any point, and nothing about the offline
    // session was a silent network success.
    expect(externalRequests).toEqual([]);
    expect(coldFailures.filter((url) => !url.includes("/api/"))).toEqual([]);
  });

  test("recovers a corrupted log from the last-known-good copy while offline and cold", async ({ context }) => {
    const externalRequests: string[] = [];
    await installOriginOnlyGuard(context, externalRequests);

    const warm = await context.newPage();
    await warm.goto("/");
    await expectServingThisTree(warm);
    await waitForServiceWorkerControl(warm);
    await assignTarget(warm);
    await expect(warm.locator("#critical-budget")).toHaveText(`${500 - PRICE} cr`);
    // A completed save wrote both copies (LIVE-02): corrupt only the canonical.
    expect(await warm.evaluate(() => window.localStorage.getItem("fac_log_lkg"))).not.toBeNull();
    await warm.evaluate(() => window.localStorage.setItem("fac_log", "{not json"));
    await warm.close();

    await context.setOffline(true);
    const cold = await context.newPage();
    await cold.goto("/");

    // Recovery from the last-known-good copy works with no network and no
    // server: the standing purchase is back and the corrupted raw is quarantined.
    await expect(cold.locator("#critical-budget")).toHaveText(`${500 - PRICE} cr`);
    await expect(cold.locator("body")).toContainText("ripristinat", { ignoreCase: true });
    expect(await cold.evaluate(() => window.localStorage.getItem("fac_log_quarantine"))).toContain("{not json");
    expect(externalRequests).toEqual([]);
  });

  test("a first visit that has never been online cannot cold start — and says so", async ({ browser }) => {
    // The documented boundary of this whole mechanism: a cache has to be filled
    // once. Asserted rather than assumed, in its own fresh context with no
    // storage and no worker.
    const context = await browser.newContext();
    await context.setOffline(true);
    const page = await context.newPage();
    await expect(page.goto("/")).rejects.toThrow();
    await context.close();
  });
});

test.describe("BUNDLE-01 — cache versioning", () => {
  test("a cache from another build is deleted on activation and never served", async ({ context }) => {
    const externalRequests: string[] = [];
    await installOriginOnlyGuard(context, externalRequests);

    const page = await context.newPage();
    await page.goto("/");
    await waitForServiceWorkerControl(page);

    const buildId = await expectServingThisTree(page);

    // Plant a cache exactly as a PREVIOUS build would have left it, holding a
    // shell that must never be served again.
    const staleName = "fac-shell-0000000000000000000000000000000000000000000000000000000000000000";
    await page.evaluate(async (name) => {
      const cache = await caches.open(name);
      await cache.put(
        "/index.html",
        new Response("<!doctype html><title>STALE SHELL</title><body>STALE SHELL</body>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );
    }, staleName);
    expect(await page.evaluate(() => caches.keys())).toContain(staleName);

    // Re-register: install + activate run again, and activate is where the
    // invalidation happens.
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.unregister();
    });
    await page.reload();
    await waitForServiceWorkerControl(page);

    expect(await page.evaluate(() => caches.keys())).toEqual([`fac-shell-${buildId}`]);

    // And offline, the shell that comes back is this build's, not the planted one.
    await page.close();
    await context.setOffline(true);
    const cold = await context.newPage();
    await cold.goto("/");
    await expect(cold.locator("body")).not.toContainText("STALE SHELL");
    await expect(cold.locator("#critical-budget")).toHaveText("500 cr");
    expect(externalRequests).toEqual([]);
  });
});

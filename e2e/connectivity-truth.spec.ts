// The app must not claim a working setup while its requests are going nowhere.
//
// `navigator.onLine` — the only signal the connectivity state used to have — is
// documented as optimistic: it says the device believes it has a network
// interface, not that this app is being answered. The two come apart exactly
// where an auction cannot afford it. Measured before writing a line of the fix:
// with the browser context fully ONLINE and every request accepted and never
// answered (a hall captive portal, a saturated hotspot), `navigator.onLine`
// stayed `true` and the app reported «CLIENT LOCALE — Core locale pronto;
// nessun backend richiesto» while nothing could be fetched at all.
//
// This spec pins the corrected behaviour, and it is written so it can only pass
// for the right reason: it asserts that the browser flag still says `true`
// while the app says OFFLINE. A regression to "just read navigator.onLine"
// cannot satisfy both halves at once.
import { expect, test, type Page } from "@playwright/test";

const LISTONE_PATH = "/data/listone_2025_26.json";

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

async function openConnectivityStatus(page: Page): Promise<void> {
  await page.locator("nav").getByText("Impostazioni", { exact: true }).click();
  await page.locator("#settings-tab-status").click();
}

test.describe("connectivity is reported from evidence, not from an optimistic flag", () => {
  test("a network that accepts and never answers is reported as OFFLINE, with navigator.onLine still true", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await waitForServiceWorkerControl(page);

    // The captive portal: the shell still loads (that is what makes the state
    // deceptive — the app looks perfectly healthy), the data never arrives.
    let hung = 0;
    await context.route(`**${LISTONE_PATH}`, () => {
      hung += 1;
    });
    await context.route("**/api/listone", () => {
      hung += 1;
    });

    await page.reload();
    await openConnectivityStatus(page);

    // The app tells the truth...
    await expect(page.locator("#connectivity-status")).toContainText("OFFLINE", { timeout: 20_000 });
    await expect(page.locator("#connectivity-status")).toHaveClass(/operating-state--offline/);
    // ...and it is NOT because the browser figured it out: the flag the old
    // implementation trusted is still saying everything is fine.
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    expect(hung, "the requests must really have been left pending").toBeGreaterThan(0);

    // Nothing about the auction core is degraded by saying so. (The critical
    // strip lives on the Asta screen, not in Impostazioni.)
    await page.locator("nav").getByText("Asta", { exact: true }).click();
    await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  });

  test("the state goes back to normal on its own once requests are answered again", async ({ page, context }) => {
    await page.goto("/");
    await waitForServiceWorkerControl(page);

    let releaseNetwork = false;
    await context.route(`**${LISTONE_PATH}`, async (route) => {
      if (!releaseNetwork) return; // accepted, never answered
      await route.continue();
    });

    await page.reload();
    await openConnectivityStatus(page);
    await expect(page.locator("#connectivity-status")).toContainText("OFFLINE", { timeout: 20_000 });

    // The portal lets us through. The very next answered request is enough:
    // the claim this layer made is the only thing it takes back.
    releaseNetwork = true;
    await page.evaluate(async (path) => {
      await fetch(path).catch(() => undefined);
    }, LISTONE_PATH);

    await expect(page.locator("#connectivity-status")).toContainText("CLIENT LOCALE", { timeout: 20_000 });
    await expect(page.locator("#connectivity-status")).toHaveClass(/operating-state--online/);
  });

  test("reconnecting to a network that answers nothing does NOT go back to 'all good'", async ({
    page,
    context,
  }) => {
    // THE reconnection defect, reproduced exactly as the review reproduced it:
    // the portal is armed BEFORE the browser announces `online`, so not one
    // request is ever attempted by the app itself. The old code announced
    // «Core locale pronto» instantly on the event alone.
    await page.goto("/");
    await waitForServiceWorkerControl(page);
    await openConnectivityStatus(page);

    await context.setOffline(true);
    await expect(page.locator("#connectivity-status")).toContainText("OFFLINE", { timeout: 20_000 });

    // Captive portal: every same-origin request is accepted and never answered.
    let attempted = 0;
    await context.route("**/*", () => {
      attempted += 1;
    });

    // The browser announces that an interface came up. It is a hypothesis.
    await context.setOffline(false);
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);

    // Long past every timeout in the chain (probe 3s, re-check 5s), the app
    // must still be telling the truth.
    await page.waitForTimeout(9_000);
    await expect(page.locator("#connectivity-status")).toContainText("OFFLINE");
    await expect(page.locator("#connectivity-status")).toHaveClass(/operating-state--offline/);
    // And it did not sit there passively: it kept asking.
    expect(attempted, "the app must have tried to verify the announcement").toBeGreaterThan(0);
  });

  test("when the network really comes back, the app notices on its own", async ({ page, context }) => {
    // The symmetric defect, which would be just as damaging: a banner stuck on
    // OFFLINE after a successful reconnection. No reload, no click, no
    // operator action — and, deliberately, no browser event either: the portal
    // simply starts answering, which is what a hall portal does when it lets
    // you through.
    await page.goto("/");
    await waitForServiceWorkerControl(page);
    await openConnectivityStatus(page);

    let blocking = true;
    await context.route("**/*", async (route) => {
      if (blocking) return; // accepted, never answered
      await route.continue();
    });

    // Get the app into the offline state through evidence alone, with the
    // browser still convinced everything is fine.
    await page.reload();
    await openConnectivityStatus(page);
    await expect(page.locator("#connectivity-status")).toContainText("OFFLINE", { timeout: 20_000 });
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);

    // The portal lets us through. Nothing else happens.
    blocking = false;

    await expect(page.locator("#connectivity-status")).toContainText("CLIENT LOCALE", { timeout: 20_000 });
    await expect(page.locator("#connectivity-status")).toHaveClass(/operating-state--online/);
  });

  test("a cached answer never passes for a working network (single authority)", async ({ page, context }) => {
    // With a service worker in the middle, what the page observes is not
    // evidence about the network: a response served from Cache Storage after
    // the worker's own fetch timed out looks exactly like a network success.
    // This pins the rule that only the worker's own observations count while it
    // is controlling the page.
    await page.goto("/");
    await waitForServiceWorkerControl(page);
    await openConnectivityStatus(page);

    await context.route("**/*", () => {
      /* accepted, never answered */
    });
    await page.reload();
    await openConnectivityStatus(page);
    await expect(page.locator("#connectivity-status")).toContainText("OFFLINE", { timeout: 20_000 });

    // A request the worker CAN satisfy from cache — the very shape that used to
    // flip the banner back to «tutto a posto» milliseconds after the worker had
    // reported the truth.
    const served = await page.evaluate(async () => {
      const res = await fetch("/data/listone_2025_26.json").catch(() => null);
      return res === null ? null : res.status;
    });
    expect(served, "the cached listone must still be served").toBe(200);

    await page.waitForTimeout(1_000);
    await expect(page.locator("#connectivity-status")).toContainText("OFFLINE");
  });

  test("the worker keeps its last verdict for a document that did not exist yet", async ({ page, context }) => {
    // Retention, tested where it can actually be isolated: on the channel.
    //
    // Declared limit, because the alternative would be a test that looks
    // stronger than it is: the BANNER-level version of this scenario does not
    // isolate retention at all. A cold page under a dead network fails its own
    // boot requests within milliseconds, and those live pushes reach the same
    // verdict — verified by disabling retention entirely, after which every
    // banner-level test stayed green. What retention actually covers is the
    // window between the document appearing and its first post-load request:
    // real, but not observable through the banner. So this asserts the
    // mechanism directly — the worker answers a newly-loaded page's question
    // with the verdict it formed while no page existed.
    await page.goto("/");
    await waitForServiceWorkerControl(page);

    // A request the network swallows, so the worker forms a verdict.
    await context.route("**/data/listone_2025_26.json", () => {});
    await page.evaluate(async () => {
      await fetch("/data/listone_2025_26.json").catch(() => undefined);
    });

    // Exactly what a freshly-loaded document asks, and nothing else.
    const retained = await page.evaluate(async () => {
      const controller = navigator.serviceWorker.controller;
      if (!controller) return { error: "no controller" };
      return new Promise<unknown>((resolve) => {
        const onMessage = (event: MessageEvent): void => {
          const data = event.data as { type?: string; url?: string } | null;
          if (data?.type === "fac-network-truth" && data.url === "(retained)") {
            navigator.serviceWorker.removeEventListener("message", onMessage);
            resolve(data);
          }
        };
        navigator.serviceWorker.addEventListener("message", onMessage);
        controller.postMessage({ type: "fac-network-truth-query" });
        setTimeout(() => resolve({ error: "no answer" }), 8_000);
      });
    });

    expect(retained).toEqual({ type: "fac-network-truth", reachable: false, url: "(retained)" });
  });

  test("a cold page under a dead network reports OFFLINE while the browser says otherwise", async ({ context }) => {
    // The configuration itself still matters, whichever path carries the
    // verdict: a document that boots with the browser convinced it is online
    // and a network that answers nothing must not present a healthy app.
    const warm = await context.newPage();
    await warm.goto("/");
    await waitForServiceWorkerControl(warm);
    await warm.close();

    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      // The shell still loads from cache; every network answer is withheld.
      if (url.pathname === "/" || url.pathname === "/index.html") return;
      return;
    });

    const cold = await context.newPage();
    await cold.goto("/");
    expect(await cold.evaluate(() => navigator.onLine)).toBe(true);
    await openConnectivityStatus(cold);
    await expect(cold.locator("#connectivity-status")).toContainText("OFFLINE", { timeout: 20_000 });
  });

  test("a genuinely offline browser is still reported as OFFLINE", async ({ page, context }) => {
    // The non-regression half: the flag remains a valid source when it is
    // right, and this layer never overrides it.
    await page.goto("/");
    await waitForServiceWorkerControl(page);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await openConnectivityStatus(page);
    await expect(page.locator("#connectivity-status")).toContainText("OFFLINE");
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  });
});

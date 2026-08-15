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

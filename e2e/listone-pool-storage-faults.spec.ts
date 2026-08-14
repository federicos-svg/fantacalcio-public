// Audit motore round 2 (#231, commento 5292582619) — findings 4 and 5, the
// two failure modes of the listone's own persistence.
//
//   PROBE G — `savePersistedPool` called browserStorage.setItem naked, and its
//             call sites sit BEFORE render(): a quota/denied-storage throw at
//             boot skipped the repaint, so the panel said "Nessun listone
//             caricato al momento." while state.pool already held the rows,
//             with no error anywhere ("rows painted after boot: 0",
//             "any error message about the listone? 0").
//   PROBE R — the same throw on an EXPLICIT manual load: the screen kept
//             showing the PREVIOUS pool while the app had already switched to
//             the new one, and said nothing.
//   PROBE T — an empty static asset (`[]`) was accepted as a valid pool, won
//             over a perfectly good saved copy, and then OVERWROTE it: with
//             both sources down afterwards the panel stayed empty forever
//             ("saved pool now: []").
//
// The fault is injected the same way in every test: Storage.prototype.setItem
// throws for the listone key ONLY, so the auction log's own storage (a
// different key, fail-closed by its own path) is untouched.
import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, readLocalStorageRaw, LISTONE_ASSET_PATH } from "./helpers.js";

const POOL_STORAGE_KEY = "fac_pool";

const MANUAL_POOL = [
  { name: "Manuale Uno", role: "P", club: "ClubManuale", quotation: 7 },
  { name: "Manuale Due", role: "C", club: "ClubManuale", quotation: 11 },
] as const;

/** Makes every write of the listone key throw, for the whole page lifetime. */
async function denyPoolStorageWrites(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patched(this: Storage, k: string, v: string): void {
      if (k === key) throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, k, v);
    };
  }, POOL_STORAGE_KEY);
}

test.describe("listone pool persistence faults (audit r2, findings 4 and 5)", () => {
  test("PROBE G: a listone that cannot be saved is still painted, and the failure is stated", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await denyPoolStorageWrites(page);
    await page.goto("/");

    // render() is reached: the rows the fetch already produced are on screen,
    // not the empty state the skipped repaint used to leave behind.
    await expect(page.getByText(SYNTHETIC_LISTONE_POOL[0]!.name, { exact: true })).toBeVisible();
    await expect(page.getByText("Nessun listone caricato al momento.")).toHaveCount(0);
    await expect(page.locator("#pool-notice")).toContainText("non salvato in locale");
    expect(pageErrors).toEqual([]);

    // Nothing was persisted — which is exactly what the notice says.
    expect(await readLocalStorageRaw(page, POOL_STORAGE_KEY)).toBeNull();
    expect(externalRequests).toEqual([]);
  });

  test("PROBE R: a manual load that cannot be saved shows the NEW pool, not the old one", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await denyPoolStorageWrites(page);
    await page.goto("/");
    await expect(page.getByText(SYNTHETIC_LISTONE_POOL[0]!.name, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Caricamento manuale/ }).click();
    await page.getByText("Carica listone (JSON locale)").locator("input[type=file]").setInputFiles({
      name: "manual-pool.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(MANUAL_POOL)),
    });

    // The screen agrees with the app's own state: the file the operator just
    // picked is the one on screen, and the fact it will not survive a reload
    // is stated rather than discovered.
    await expect(page.getByText(MANUAL_POOL[0]!.name, { exact: true })).toBeVisible();
    await expect(page.getByText(SYNTHETIC_LISTONE_POOL[0]!.name, { exact: true })).toHaveCount(0);
    await expect(page.locator("#pool-notice")).toContainText("non salvato in locale");
    expect(pageErrors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test("PROBE T: an empty static asset neither empties the panel nor destroys the offline copy", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    await page.goto("/");
    await expect(page.getByText(SYNTHETIC_LISTONE_POOL[0]!.name, { exact: true })).toBeVisible();
    const savedBefore = await readLocalStorageRaw(page, POOL_STORAGE_KEY);
    expect(JSON.parse(savedBefore!)).toEqual(SYNTHETIC_LISTONE_POOL);

    // The static asset degrades to `[]` — a broken build/deploy, the shape the
    // probe used. The deposit stays unavailable, so the saved copy is the only
    // thing left standing.
    await context.unroute("**/*");
    await installSyntheticNetworkGuard(context, [], externalRequests);
    await page.reload();

    await expect(page.getByText(SYNTHETIC_LISTONE_POOL[0]!.name, { exact: true })).toBeVisible();
    await expect(page.getByText("Nessun listone caricato al momento.")).toHaveCount(0);
    // The offline copy is intact — with both sources down it is still there.
    expect(JSON.parse((await readLocalStorageRaw(page, POOL_STORAGE_KEY))!)).toEqual(SYNTHETIC_LISTONE_POOL);

    await context.unroute("**/*");
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === LISTONE_ASSET_PATH) return route.fulfill({ status: 500, body: "" });
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
      externalRequests.push(route.request().url());
      return route.abort("blockedbyclient");
    });
    await page.reload();
    await expect(page.getByText(SYNTHETIC_LISTONE_POOL[0]!.name, { exact: true })).toBeVisible();
    expect(externalRequests).toEqual([]);
  });
});

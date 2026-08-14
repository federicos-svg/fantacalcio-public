import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, LISTONE_ASSET_PATH } from "./helpers.js";

test("a live-bundle-shaped static payload preloads and survives asset failure via local cache", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  for (const player of SYNTHETIC_LISTONE_POOL) {
    await expect(page.getByText(player.name, { exact: true })).toBeVisible();
  }
  const persisted = await page.evaluate(() => window.localStorage.getItem("fac_pool"));
  expect(persisted).not.toBeNull();
  expect(JSON.parse(persisted ?? "[]")).toEqual(SYNTHETIC_LISTONE_POOL);

  await context.unroute("**/*");
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === LISTONE_ASSET_PATH) return route.abort("failed");
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    externalRequests.push(route.request().url());
    return route.abort("blockedbyclient");
  });

  await page.reload();
  for (const player of SYNTHETIC_LISTONE_POOL) {
    await expect(page.getByText(player.name, { exact: true })).toBeVisible();
  }
  expect(externalRequests).toEqual([]);
});

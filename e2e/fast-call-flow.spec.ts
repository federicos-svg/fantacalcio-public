import { expect, test } from "@playwright/test";
import { E2E_PURCHASE_PRICE, E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, selectStatusFilter } from "./helpers.js";

test("live filter, click selection, sold guard and interaction count work on the synthetic proxy", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  await page.locator("#search-player").fill("Dario");
  await expect(page.locator(".listone-row")).toHaveCount(1);
  await expect(page.locator("#call-interaction-count")).toHaveText("Interazioni chiamata: 1");

  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await expect(page.locator("#call-interaction-count")).toHaveText("Interazioni chiamata: 2");
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeEnabled();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  await selectStatusFilter(page, "assigned");
  const soldRow = page.locator(".listone-row", { hasText: E2E_TARGET_PLAYER.name });
  await expect(soldRow).toContainText("Assegnato");
  await expect(soldRow).toHaveClass(/listone-row--assigned/);
  await expect(soldRow).not.toHaveClass(/listone-row--clickable/);
  await soldRow.click();
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeDisabled();
  await expect(page.locator("#call-interaction-count")).toHaveText("Interazioni chiamata: 0");
  expect(externalRequests).toEqual([]);
});

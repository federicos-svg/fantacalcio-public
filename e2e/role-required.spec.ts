import { expect, test } from "@playwright/test";
import { E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, readLocalStorageRaw } from "./helpers.js";

test("missing role blocks launch without changing log, budget or player state", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.locator("#search-role").selectOption("");

  await expect(page.getByRole("alert")).toContainText("Ruolo obbligatorio");
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeDisabled();
  expect(await readLocalStorageRaw(page, "fac_log")).toBeNull();
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  await expect(page.locator("#critical-roster")).toContainText("0/7");
  await expect(page.getByText(E2E_TARGET_PLAYER.name, { exact: true })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

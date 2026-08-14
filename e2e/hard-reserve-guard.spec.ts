import { expect, test } from "@playwright/test";
import { E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, readLocalStorageJson } from "./helpers.js";

// Replaces e2e/manual-foreign-scouting.spec.ts. That spec drove the
// hard-reserve refusal message through the manual-scouting creation form,
// which no longer exists; the guard itself is unchanged and applies to every
// purchase, so it is exercised here through an ordinary listone player
// instead of being dropped along with the form.
test("a purchase above max_safe is refused with the hard-reserve message and writes no event", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();

  // 474 = max_safe + 1 on an untouched roster (500 − (28 − 1) × COST_FLOOR).
  await expect(page.locator("#critical-max-bid")).toContainText("473 cr");
  await page.locator("#assign-price").fill("474");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.getByText(/hard reserve violata/)).toBeVisible();
  expect(await readLocalStorageJson<unknown[]>(page, "fac_log")).toBeNull();
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");

  // Exactly at the ceiling the same purchase goes through.
  await page.locator("#assign-price").fill("473");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).toContainText(E2E_TARGET_PLAYER.name);
  await expect(page.locator("#critical-budget")).toHaveText("27 cr");
  await expect(page.locator("#critical-max-bid")).toContainText("budget bloccato");
  expect(externalRequests).toEqual([]);
});

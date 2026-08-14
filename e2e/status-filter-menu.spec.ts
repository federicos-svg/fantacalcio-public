import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL, E2E_TARGET_PLAYER, E2E_PURCHASE_PRICE } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, selectStatusFilter } from "./helpers.js";

test("the status filter opens a menu, applies the choice and closes on outside click or Escape", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  const trigger = page.locator("#listone-status-filter-trigger");
  const list = page.locator("#listone-status-filter-list");

  // Closed by default, and the trigger shows the active filter as a value.
  await expect(trigger).toContainText("Liberi");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(list).toHaveCount(0);

  // The click that opens the menu must not also close it: the trigger
  // re-renders, so a dismissal handler comparing against the live element
  // would see a detached target and shut the menu instantly.
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(list).toBeVisible();
  await expect(list.locator("[role='option']")).toHaveCount(3);
  await expect(page.locator("#listone-status-filter-option-available")).toHaveAttribute("aria-selected", "true");

  // Picking applies the filter, closes the menu and updates the trigger.
  await page.locator("#listone-status-filter-option-all").click();
  await expect(trigger).toContainText("Tutti");
  await expect(list).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Escape closes without changing the choice.
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(trigger).toContainText("Tutti");

  // A click elsewhere closes it too.
  await trigger.click();
  await expect(list).toBeVisible();
  await page.locator(".panel", { hasText: "STORICO ACQUISTI" }).click();
  await expect(list).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test("the filter still selects what the listone shows", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  // Default "Liberi" hides the player just bought.
  await expect(page.locator(".listone-row", { hasText: E2E_TARGET_PLAYER.name })).toHaveCount(0);

  await selectStatusFilter(page, "assigned");
  await expect(page.locator(".listone-row", { hasText: E2E_TARGET_PLAYER.name })).toContainText("Assegnato");

  await selectStatusFilter(page, "all");
  await expect(page.locator(".listone-row")).toHaveCount(SYNTHETIC_LISTONE_POOL.length);
  expect(externalRequests).toEqual([]);
});

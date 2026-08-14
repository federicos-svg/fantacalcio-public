import { expect, test } from "@playwright/test";
import { E2E_PURCHASE_PRICE, E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  expectGateStatesVisible,
  gotoScreen,
  installSyntheticNetworkGuard,
  openSettingsSection,
} from "./helpers.js";

const FORBIDDEN_SURFACE_TEXT = [
  "ranking",
  "projection",
  "modifier",
  "target_band",
  "stretch_cap",
  "fair_to_me",
  "ftm",
] as const;

test("malformed local authority and gated listone fields fail closed", async ({ page, context }) => {
  const externalRequests: string[] = [];
  // Both keys below are real sources the frontend actually reads
  // (readPersistedPoolText/KEY_POOL in main.ts, resolveListonePool in
  // src/ui/listone.ts): a locally-injected pool override and a
  // network-served static pool, each carrying a forbidden field
  // (target_band / projection) that must never survive parsing.
  await context.addInitScript(() => {
    localStorage.setItem("fac_pool", JSON.stringify([
      { name: "Injected Local", role: "A", club: "Club Local", target_band: "10-20" },
    ]));
  });
  await installSyntheticNetworkGuard(context, [
    { name: "Injected Static", role: "A", club: "Club Static", projection: 99 },
  ], externalRequests);

  await page.goto("/");
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  await expect(page.locator("#critical-slots")).toHaveText("28");
  // Single ceiling: 500 − (28 − 1) × COST_FLOOR. The hard reserve is not
  // shown separately — it is `slot × COST_FLOOR`, already on screen as "28".
  await expect(page.locator("#critical-max-bid")).toContainText("473 cr");

  const visibleText = (await page.locator("body").innerText()).toLowerCase();
  for (const forbidden of FORBIDDEN_SURFACE_TEXT) expect(visibleText).not.toContain(forbidden);

  await gotoScreen(page, "Impostazioni");
  await expectGateStatesVisible(page);
  expect(externalRequests).toEqual([]);
});

test("offline is distinct and the already-loaded accounting core remains usable", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.getByText(E2E_TARGET_PLAYER.name, { exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "status");
  await expect(page.locator("#connectivity-status")).toContainText("OFFLINE");
  await expectGateStatesVisible(page);
  await gotoScreen(page, "Asta");

  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - E2E_PURCHASE_PRICE} cr`);
  await expect(page.locator("#critical-slots")).toHaveText("27");

  await page.getByRole("button", { name: "Annulla", exact: true }).press("Enter");
  await page.locator("#void-confirm-apply").click();
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  await expect(page.locator("#critical-slots")).toHaveText("28");
  expect(externalRequests).toEqual([]);
});

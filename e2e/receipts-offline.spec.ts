import { expect, test } from "@playwright/test";
import { E2E_PURCHASE_PRICE, E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  expectGateStatesVisible,
  gotoScreen,
  installSyntheticNetworkGuard,
  openSettingsSection,
  readLocalStorageJson,
} from "./helpers.js";

const FORBIDDEN = ["ranking", "projection", "modifier", "target_band", "stretch_cap", "fair_to_me", "ftm"];

test("real surfaces fail closed even when every promotion gate is force-set in localStorage", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  // The frontend has no code path that reads any of these keys back — there
  // is no receipt/promotion matrix wired into this offline build at all.
  // What this proves instead is the real invariant: even when every gate an
  // authorized backend could set is force-set here (the one thing a browser
  // user could actually do), nothing gated ever surfaces on reload.
  await page.evaluate(() => {
    for (const gate of [
      "data_promoted",
      "canonical_promoted",
      "decision_promoted",
      "fair_to_me_promoted",
      "live_ui_ready",
    ]) localStorage.setItem(gate, "true");
  });
  await page.reload();

  await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  // One ceiling for every role: 500 − (28 − 1) × COST_FLOOR.
  await expect(page.locator("#critical-max-bid")).toContainText("473 cr");

  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const field of FORBIDDEN) expect(text).not.toContain(field);

  // The gate states moved to Impostazioni; they must stay closed there.
  await gotoScreen(page, "Impostazioni");
  await expectGateStatesVisible(page);
  await gotoScreen(page, "Asta");

  expect(externalRequests).toEqual([]);
});

test("the loaded core assigns, voids, exports and imports offline, then reloads persisted state after reconnect", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.getByText(E2E_TARGET_PLAYER.name, { exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "status");
  await expect(page.locator("#connectivity-status")).toContainText("OFFLINE");
  await gotoScreen(page, "Asta");

  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#auction-log-export").click();
  const exportedPath = await (await downloadPromise).path();
  expect(exportedPath).not.toBeNull();

  await page.getByRole("button", { name: "Annulla", exact: true }).press("Enter");
  await page.locator("#void-confirm-apply").click();
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");

  await page.locator("#auction-log-import-file").setInputFiles(exportedPath!);
  await page.locator("#import-confirm-apply").click();
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - E2E_PURCHASE_PRICE} cr`);
  const stored = await readLocalStorageJson<unknown[]>(page, "fac_log");
  expect(stored).toHaveLength(1);

  // A network-free cold start is packaging work for BUNDLE-01. Reconnect
  // only to reload the already-persisted local state from this dev bundle.
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - E2E_PURCHASE_PRICE} cr`);
  await expect(page.locator("#listone-status-filter-trigger")).toBeVisible();
  expect(externalRequests).toEqual([]);
});

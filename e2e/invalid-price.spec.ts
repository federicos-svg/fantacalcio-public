import { expect, test } from "@playwright/test";
import { E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, readLocalStorageRaw } from "./helpers.js";

// LIVE-xx / #219: doAssign's strict integer parser (src/price.ts,
// parsePositiveIntegerPrice) rejects "0" — no leading zero, no zero — and
// the caller must show exactly this message, not silently drop the click.
test("a price of 0 is rejected with the exact validation message and no purchase is recorded", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill("0");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  await expect(page.getByText("Prezzo non valido: inserisci un numero intero positivo.", { exact: true })).toBeVisible();

  // Nothing was applied: no log written, budget untouched, still on the
  // asta moment with the same call in progress.
  expect(await readLocalStorageRaw(page, "fac_log")).toBeNull();
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  await expect(page.locator("#critical-spent")).toHaveText("0 cr");
  await expect(page.locator("#price-display")).toBeVisible();
  expect(externalRequests).toEqual([]);
});

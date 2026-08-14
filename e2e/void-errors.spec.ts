import { expect, test, type Page } from "@playwright/test";
import { E2E_PURCHASE_PRICE, E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, readLocalStorageJson } from "./helpers.js";

async function purchaseAndOpenVoid(page: Page): Promise<void> {
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await page.getByText("Annulla", { exact: true }).click();
}

test("void storage error is visible and leaves in-memory and persisted purchase unchanged", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await purchaseAndOpenVoid(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let failed = false;
    Storage.prototype.setItem = function (key: string, value: string): void {
      if (key === "fac_log_lkg" && !failed) {
        failed = true;
        throw new DOMException("synthetic quota", "QuotaExceededError");
      }
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Annulla acquisto", exact: true }).click();
  await expect(page.getByText(/Impossibile salvare nel browser/)).toBeVisible();
  await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).toContainText(E2E_TARGET_PLAYER.name);
  const log = await readLocalStorageJson<Array<{ type: string }>>(page, "fac_log");
  expect(log?.map((event) => event.type)).toEqual(["PURCHASE"]);
  expect(externalRequests).toEqual([]);
});

test("void partial write activates the blocking LIVE-02 recovery screen", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await purchaseAndOpenVoid(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let lkgWrites = 0;
    Storage.prototype.setItem = function (key: string, value: string): void {
      if (key === "fac_log_lkg") {
        lkgWrites += 1;
        if (lkgWrites > 1) throw new DOMException("synthetic rollback", "QuotaExceededError");
      }
      if (key === "fac_log") {
        throw new DOMException("synthetic canonical", "QuotaExceededError");
      }
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Annulla acquisto", exact: true }).click();
  await expect(page.getByText(/Persistenza in stato indeterminato/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Riprova" })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

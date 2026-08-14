import { expect, test } from "@playwright/test";
import { installSyntheticNetworkGuard } from "./helpers.js";
import { LOG_STORAGE_KEY, QUARANTINE_STORAGE_KEY } from "../src/logRecovery.js";

test("exports the in-memory raw payload when quarantine storage fails", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, [], externalRequests);
  const corrupted = "{raw-corrotto-byte-per-byte}";
  await page.addInitScript(
    ({ logKey, quarantineKey, raw }) => {
      window.localStorage.setItem(logKey, raw);
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string): void {
        if (key === quarantineKey) throw new DOMException("quota synthetic", "QuotaExceededError");
        original.call(this, key, value);
      };
    },
    { logKey: LOG_STORAGE_KEY, quarantineKey: QUARANTINE_STORAGE_KEY, raw: corrupted },
  );

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /recovery richiesta/i })).toBeVisible();
  await expect(page.getByText(/quarantena non può essere salvata/i)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /esporta payload corrotto/i }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString("utf8")).toBe(corrupted);
  expect(externalRequests).toEqual([]);
});

test("a throwing localStorage getter renders the fail-closed screen", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, [], externalRequests);
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("access denied synthetic", "SecurityError");
      },
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /storage del browser non disponibile/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /riprova lettura storage/i })).toBeVisible();
  // The storage-error state replaces the ENTIRE app (see render() in
  // main.ts): no header, no nav, no Asta/Rose/Impostazioni screen — all of
  // which live inside the "app-shell" wrapper, so it must never mount here.
  await expect(page.locator(".app-shell")).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

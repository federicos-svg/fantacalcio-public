import { expect, test, type Page } from "@playwright/test";
import { E2E_PURCHASE_PRICE, E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
] as const;

/**
 * The critical strip deliberately paints OVER the confirmation overlays
 * (z-index 110 vs 100) so the accounting stays readable. That only works if
 * the dialog starts below the strip: otherwise the strip covers the dialog's
 * heading, which for a void is the text that says whether this is the last
 * purchase or an earlier one (LIVE-06). Asserts the heading's top edge is
 * strictly below the strip's bottom edge, at the real rendered geometry.
 */
async function expectHeadingClearsCriticalStrip(page: Page, headingId: string): Promise<void> {
  const gap = await page.evaluate((id) => {
    const strip = document.getElementById("critical-auction-strip");
    const heading = document.getElementById(id);
    if (!strip || !heading) return null;
    return heading.getBoundingClientRect().top - strip.getBoundingClientRect().bottom;
  }, headingId);
  expect(gap, `#${headingId} must render below #critical-auction-strip`).not.toBeNull();
  expect(gap!).toBeGreaterThan(0);
}

async function purchase(page: Page): Promise<void> {
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#search-player")).toBeFocused();
}

test("assignment, undo and import confirmations preserve critical visibility and keyboard focus", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await purchase(page);

    const strip = page.locator("#critical-auction-strip");
    await expect(strip).toBeInViewport();

    const undo = page.getByRole("button", { name: "Annulla", exact: true });
    await undo.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#void-confirm-overlay")).toBeVisible();
    await expect(page.locator("#void-confirm-cancel")).toBeFocused();
    await expect(strip).toBeInViewport();
    await expectHeadingClearsCriticalStrip(page, "void-confirm-title");

    await page.keyboard.press("Tab");
    await expect(page.locator("#void-confirm-apply")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#void-confirm-cancel")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#void-confirm-overlay")).toHaveCount(0);
    await expect(undo).toBeFocused();

    await undo.press("Enter");
    await page.locator("#void-confirm-apply").click();
    await expect(page.locator("#void-confirm-overlay")).toHaveCount(0);
    await expect(strip).toBeFocused();
    await expect(page.getByText("Nessun acquisto registrato.")).toBeVisible();

    await page.locator("#auction-log-import-file").setInputFiles({
      name: "synthetic-empty.v1.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"format":"fantacalcio-auction-log","version":1,"log":[]}\n'),
    });
    await expect(page.locator("#import-confirm-overlay")).toBeVisible();
    await expect(page.locator("#import-confirm-cancel")).toBeFocused();
    await expect(strip).toBeInViewport();
    await expectHeadingClearsCriticalStrip(page, "import-confirm-title");
    await page.keyboard.press("Escape");
    await expect(page.locator("#import-confirm-overlay")).toHaveCount(0);
    await expect(page.locator("#auction-log-import")).toBeFocused();
  }

  expect(externalRequests).toEqual([]);
});

import { expect, test, type Page } from "@playwright/test";
import { E2E_PURCHASE_PRICE, E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";

// First E2E coverage of the Rose screen (#219). It is a read-only recap
// derived from the real event log (see src/ui/views.ts renderRoseScreen) —
// the grid content itself is real, only the svincola/assegna/modifica-budget
// controls are inert DEV placeholders.

/** Number of grid columns the Rose team-card grid (.teams-grid, shared with
 *  the war board COMPLETA — see src/styles/asta.css) is actually laid out with
 *  at the current viewport, read straight off the live computed style. */
async function roseGridColumnCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector(".teams-grid");
    if (!el) return 0;
    return getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length;
  });
}

test("Rose screen lists every league team from the real event log, with inert DEV controls", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  // One real purchase first, so the screen has to reflect reduce(state.log)
  // rather than just the empty-roster default.
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  await gotoScreen(page, "Rose");
  // NESSUNA RIGA DI INTESTAZIONE. La schermata non si presenta più a parole:
  // #rose-screen-hint è stato tolto, e la spec lo sorveglia perché non torni
  // per inerzia insieme a un pannello nuovo.
  await expect(page.locator("#rose-screen-hint")).toHaveCount(0);

  // 8 fixed league teams (see FANTA_TEAM_IDS in src/main.ts), one card each.
  await expect(page.locator(".panel--compact")).toHaveCount(8);
  await expect(page.getByText("Io ● io", { exact: true })).toBeVisible();
  await expect(page.getByText(`${500 - E2E_PURCHASE_PRICE} cr`, { exact: true })).toBeVisible();
  await expect(page.getByText(E2E_TARGET_PLAYER.name, { exact: true })).toBeVisible();

  // The DEV svincola control is visible but never performs a real action —
  // it only opens the mock modal (src/ui/views.ts renderMockModal).
  await page.getByTitle("Svincola (non attivo)").click();
  await expect(page.getByText("Funzione non attiva in questa shell di sviluppo", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Chiudi", exact: true }).click();
  await expect(page.getByText("Funzione non attiva in questa shell di sviluppo", { exact: false })).toHaveCount(0);

  // Read-only: the underlying purchase is untouched by the mock interaction.
  await expect(page.getByText(E2E_TARGET_PLAYER.name, { exact: true })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("Rose screen grid follows the .teams-grid breakpoints (1 col at 390px, up to 4 on desktop)", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await gotoScreen(page, "Rose");
  await expect(page.locator(".panel--compact")).toHaveCount(8);
  await expect(page.locator(".panel--compact").first()).toBeVisible();
  expect(await roseGridColumnCount(page)).toBe(1);

  // Same page, no reload: the grid is plain CSS media queries, so it must
  // react live to a viewport resize alone.
  await page.setViewportSize({ width: 700, height: 900 });
  expect(await roseGridColumnCount(page)).toBe(2);

  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await roseGridColumnCount(page)).toBe(4);

  expect(externalRequests).toEqual([]);
});

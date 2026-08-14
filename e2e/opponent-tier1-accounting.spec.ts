import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";

// #221 (2) — packages/engine/src/auction.ts opponentTier1() wired back to a
// screen after PR #86 removed its panel, as a pure accounting view.
// The UI invariant (docs/FRONTEND_STRUCTURE.md) is asserted here, not merely
// documented: the AVVERSARI TIER-1 block must NOT be on the Asta screen. It
// lives on Rose instead.

const TARGET = SYNTHETIC_LISTONE_POOL[3]!; // role A

test("the Tier-1 opponent accounting view lives on Rose, never on the Asta screen", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  await expect(page.locator("#opponent-tier1-panel")).toHaveCount(0);

  await page.getByText(TARGET.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-team").selectOption("Squadra2");
  await page.locator("#assign-price").fill("60");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#opponent-tier1-panel")).toHaveCount(0);

  await gotoScreen(page, "Rose");
  await expect(page.locator("#opponent-tier1-panel")).toBeVisible();
  // 7 opponents: the 8 league teams minus "Io".
  await expect(page.locator("#opponent-tier1-grid > .opponent-tier1__card")).toHaveCount(7);
  await expect(page.locator("#opponent-tier1-Io")).toHaveCount(0);
  await expect(page.locator("#opponent-tier1-Squadra2")).toContainText("440");
  await expect(page.locator("#opponent-tier1-Squadra2")).toContainText("slot residui: 27");
  await expect(page.locator("#opponent-tier1-Squadra3")).toContainText("500");
  await expect(page.locator("#opponent-tier1-Squadra3")).toContainText("slot residui: 28");

  // Accounting only: each card carries credits and free slots and nothing
  // else, and the panel says so explicitly.
  await expect(page.locator("#opponent-tier1-note")).toContainText("Nessuna stima di interesse");
  await expect(page.locator("#opponent-tier1-note")).toContainText("nessun indice comportamentale");

  // The Rose team cards themselves are untouched by the new panel.
  await expect(page.locator(".panel--compact")).toHaveCount(8);
  expect(externalRequests).toEqual([]);
});

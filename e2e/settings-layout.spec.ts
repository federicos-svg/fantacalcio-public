import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard, openSettingsSection } from "./helpers.js";

test("the settings menu swaps the right-hand panel and survives a re-render", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Impostazioni");

  // Opens on the area you act on; each menu entry carries its own icon.
  // Four areas: teams, riconferme pre-asta (#231), schede Gruppo Esperti,
  // status.
  await expect(page.locator("#settings-tab-teams")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#settings-tab-riconferme")).toHaveAttribute("aria-selected", "false");
  await expect(page.locator("#settings-tab-schede")).toHaveAttribute("aria-selected", "false");
  await expect(page.locator("#settings-tab-status")).toHaveAttribute("aria-selected", "false");
  await expect(page.locator("#settings-menu svg")).toHaveCount(4);
  await expect(page.locator("#new-person-name")).toBeVisible();

  // Only the selected area is built, so the other one is absent from the DOM
  // entirely — not merely hidden.
  await expect(page.locator("#shadow-status")).toHaveCount(0);

  await openSettingsSection(page, "status");
  await expect(page.locator("#shadow-status")).toBeVisible();
  await expect(page.locator("#new-person-name")).toHaveCount(0);
  await expect(page.locator("#settings-panel")).toHaveAttribute("aria-labelledby", "settings-tab-status");

  // The regression this design guards against: render() rebuilds the whole
  // DOM on every keystroke, so a selection living only in the DOM would snap
  // back. Adding a participant re-renders.
  await openSettingsSection(page, "teams");
  await page.locator("#new-person-name").fill("Bruno");
  await page.locator("#add-person").click();
  await expect(page.locator("#league-people-list input")).toHaveValue("Bruno");
  await expect(page.locator("#settings-tab-teams")).toHaveAttribute("aria-selected", "true");
  // Adding a participant hands the keyboard BACK to the name field, so the
  // next one can be typed without reaching for the mouse — and it does so ONE
  // FRAME after the re-render (focusAfterRender, src/main.ts). Asserting it
  // here is not a wait dressed up as an assertion: it is that contract, and
  // until it has landed the app still owes the page a focus move that will
  // overwrite whatever this test focuses next. That is precisely how CI run
  // #45 lost the ArrowDown below into the text field — the menu never moved
  // and #settings-tab-riconferme stayed aria-selected="false" for the whole
  // timeout. Same guard purchase() already uses in e2e/critical-overlays.spec.ts.
  await expect(page.locator("#new-person-name")).toBeFocused();

  // Arrow keys move within the menu, and focus follows across the re-render.
  // Four stops now (teams -> riconferme -> schede -> status -> wraps to teams).
  await page.locator("#settings-tab-teams").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#settings-tab-riconferme")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#settings-tab-riconferme")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#settings-tab-schede")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#settings-tab-schede")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#settings-tab-status")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#settings-tab-status")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#settings-tab-teams")).toHaveAttribute("aria-selected", "true");

  // Roving tabindex: the menu is a single tab stop, not one per entry.
  await expect(page.locator("#settings-tab-teams")).toHaveAttribute("tabindex", "0");
  await expect(page.locator("#settings-tab-riconferme")).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#settings-tab-schede")).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("#settings-tab-status")).toHaveAttribute("tabindex", "-1");

  // No development placeholder left on this screen.
  await expect(page.getByText("DEV STATICO")).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

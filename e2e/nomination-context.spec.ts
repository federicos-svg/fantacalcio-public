import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import type { ListonePlayer } from "../src/ui/listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

// #221 (4) — "Contesto chiamata" / `nomination_context`, D7 Binario A.
// Read-only, on-demand, and built only from deterministic facts already in
// scope. The D7 constraints are asserted, not just documented: no ranking of
// candidates, no "chiama X", no per-opponent behavioural index, and no effect
// whatsoever on `max_safe`.

const TARGET = SYNTHETIC_LISTONE_POOL[3]!; // role A
const SECOND = SYNTHETIC_LISTONE_POOL[2]!; // role C

// A second, wholly synthetic attacker: the shared fixture has exactly one row
// per role, and the "prices already paid in the role" facts are only readable
// while a still-callable player of that same role is selected.
const SPARE_ATTACKER: ListonePlayer = { name: "Ennio Riserva", role: "A", club: "ClubCinque", quotation: 14 };
const POOL_WITH_SPARE_ATTACKER: readonly ListonePlayer[] = [...SYNTHETIC_LISTONE_POOL, SPARE_ATTACKER];

// 8 league teams (FANTA_TEAM_IDS in src/main.ts) x ROSTER_REQUIREMENTS.
const LEAGUE_SLOTS_A = 8 * 7;

async function openContextFor(page: Page, playerName: string): Promise<void> {
  await page.getByText(playerName, { exact: true }).click();
  await expect(page.locator("#nomination-context-toggle")).toHaveAttribute("aria-expanded", "false");
  await page.locator("#nomination-context-toggle").click();
  await expect(page.locator("#nomination-context-toggle")).toHaveAttribute("aria-expanded", "true");
}

test("the Contesto chiamata panel is on-demand, factual, and never touches the safe bid ceiling", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  // No selected player, no context: the panel has no subject to describe.
  await expect(page.locator("#nomination-context")).toHaveCount(0);

  await page.getByText(TARGET.name, { exact: true }).click();
  await expect(page.locator("#nomination-context")).toBeVisible();
  await expect(page.locator("#nomination-context-subject")).toContainText(TARGET.name);
  // On-demand: closed by default, body not even in the DOM.
  await expect(page.locator("#nomination-context-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#nomination-context-body")).toHaveCount(0);

  // D7: `nomination_context` never modifies max_safe. The ceiling shown by the
  // engine must be byte-identical before and after opening the panel.
  const ceilingBefore = await page.locator("#critical-max-bid").innerText();
  await page.locator("#nomination-context-toggle").click();
  await expect(page.locator("#nomination-context-body")).toBeVisible();
  expect(await page.locator("#critical-max-bid").innerText()).toBe(ceilingBefore);

  await expect(page.locator("#nomination-context-slots")).toHaveText(String(LEAGUE_SLOTS_A));
  await expect(page.locator("#nomination-context-pool")).toHaveText("1");
  await expect(page.locator("#nomination-context-purchases")).toHaveText("0");
  await expect(page.locator("#nomination-context-top")).toContainText("Nessun attaccante ancora assegnato");
  // Opponent rows: credits and slots, one per opponent, "Io" excluded.
  await expect(page.locator("#nomination-context-opponents li")).toHaveCount(7);
  await expect(page.locator("#nomination-context-opponent-Squadra2")).toContainText("500 cr");
  await expect(page.locator("#nomination-context-opponent-Io")).toHaveCount(0);

  // D7 negatives: no directive/gated field ever reaches this surface.
  const panelText = await page.locator("#nomination-context").innerText();
  expect(panelText).not.toMatch(/fair.to.me|target.band|stretch.cap|chiama /i);

  // Collapsing works and the choice is honoured.
  await page.locator("#nomination-context-toggle").click();
  await expect(page.locator("#nomination-context-body")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("Contesto chiamata reports prices already paid in the role, from the log only", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL_WITH_SPARE_ATTACKER, externalRequests);
  await page.goto("/");

  await page.getByText(TARGET.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-team").selectOption("Squadra4");
  await page.locator("#assign-price").fill("45");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  // A different role: its own facts must stay empty.
  await openContextFor(page, SECOND.name);
  await expect(page.locator("#nomination-context-purchases")).toHaveText("0");
  await expect(page.locator("#nomination-context-top")).toContainText("Nessun centrocampista ancora assegnato");

  // Reset clears the selection, and with it the panel's only subject.
  await page.getByRole("button", { name: "✕ Reset", exact: true }).click();
  await expect(page.locator("#nomination-context")).toHaveCount(0);

  // A new selection comes back closed — no context is ever left open and
  // re-pointed at a different player. openContextFor asserts that.
  await openContextFor(page, SPARE_ATTACKER.name);

  await expect(page.locator("#nomination-context-purchases")).toHaveText("1");
  const top = page.locator("#nomination-context-top");
  await expect(top).toContainText(TARGET.name);
  await expect(top).toContainText("Squadra4");
  await expect(top).toContainText("45 cr");
  expect(externalRequests).toEqual([]);
});

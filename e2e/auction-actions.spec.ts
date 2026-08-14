import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL, E2E_TARGET_PLAYER, E2E_PURCHASE_PRICE } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, readLocalStorageJson, selectStatusFilter } from "./helpers.js";

interface StoredEvent {
  readonly type: "PURCHASE" | "VOID";
  readonly fantaTeamId?: string;
  readonly targetSeq?: number;
}

async function selectAndLaunch(page: Page): Promise<void> {
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
}

test("opponent assignment keeps budget, slots, history and player state coherent after reload", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await selectAndLaunch(page);
  await page.locator("#assign-team").selectOption("Squadra2");
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  const teams = page.locator(".panel", { hasText: "SQUADRE (LEGA)" });
  const opponent = teams.locator("div", { hasText: /^Squadra2$/ }).locator("..");
  await expect(opponent).toContainText("490 cr");
  await expect(opponent).toContainText("A");
  await expect(opponent).toContainText("6");
  const history = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(history).toContainText(E2E_TARGET_PLAYER.name);
  await expect(history).toContainText("Squadra2");
  await selectStatusFilter(page, "assigned");
  await expect(page.locator(".listone-row", { hasText: E2E_TARGET_PLAYER.name })).toContainText("Assegnato");

  await page.reload();
  await expect(teams).toContainText("Squadra2");
  await expect(opponent).toContainText("490 cr");
  await expect(history).toContainText("Squadra2");
  const log = await readLocalStorageJson<StoredEvent[]>(page, "fac_log");
  expect(log).toHaveLength(1);
  expect(log![0]).toMatchObject({ type: "PURCHASE", fantaTeamId: "Squadra2" });
  expect(externalRequests).toEqual([]);
});

test("undo persists a VOID and restores budget, slot, history and player availability after reload", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await selectAndLaunch(page);
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await page.getByText("Annulla", { exact: true }).click();
  await page.getByRole("button", { name: "Annulla acquisto", exact: true }).click();

  await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  await expect(page.locator("#critical-spent")).toHaveText("0 cr");
  await expect(page.locator("#critical-roster")).toContainText("0/7");
  await expect(page.getByText("Nessun acquisto registrato.")).toBeVisible();
  await expect(page.getByText(E2E_TARGET_PLAYER.name, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  await expect(page.locator("#critical-spent")).toHaveText("0 cr");
  await expect(page.locator("#critical-roster")).toContainText("0/7");
  await expect(page.getByText("Nessun acquisto registrato.")).toBeVisible();
  const log = await readLocalStorageJson<StoredEvent[]>(page, "fac_log");
  expect(log?.map((event) => event.type)).toEqual(["PURCHASE", "VOID"]);
  expect(log![1]?.targetSeq).toBe(0);
  expect(externalRequests).toEqual([]);
});

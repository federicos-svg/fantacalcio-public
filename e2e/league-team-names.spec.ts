import { expect, test, type Page } from "@playwright/test";
import { E2E_PURCHASE_PRICE, E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard, readLocalStorageJson } from "./helpers.js";

// Participants are people, not seats. A person's identity survives moving to
// another team and survives leaving the league entirely, which is what makes
// per-person data worth keeping. Seats are what the auction log records, and
// they never change.

async function addPerson(page: Page, name: string): Promise<void> {
  await page.locator("#new-person-name").fill(name);
  await page.locator("#add-person").click();
}

/** Seats `name` on `seatId`. Matches the option by substring rather than by
 *  exact label: a person already seated elsewhere is listed as
 *  "Bruno (ora Squadra2)", which is the point of the affordance. */
async function seat(page: Page, seatId: string, name: string): Promise<void> {
  const select = page.locator(`#seat-person-${seatId}`);
  const value = await select.locator("option", { hasText: name }).first().getAttribute("value");
  await select.selectOption(value ?? "");
}

test("a participant keeps their identity across seats and across leaving the league", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Impostazioni");

  await expect(page.locator("#league-people-empty")).toBeVisible();
  await addPerson(page, "Anna");
  await addPerson(page, "Bruno");
  await expect(page.locator("#league-people-empty")).toHaveCount(0);

  await seat(page, "Io", "Anna");
  await seat(page, "Squadra2", "Bruno");
  await gotoScreen(page, "Asta");
  await expect(page.locator(".panel", { hasText: "SQUADRE (LEGA)" })).toContainText("Anna");
  await expect(page.locator(".panel", { hasText: "SQUADRE (LEGA)" })).toContainText("Bruno");

  // Same person, different team: Squadra2 goes free, nobody is duplicated.
  await gotoScreen(page, "Impostazioni");
  await seat(page, "Squadra3", "Bruno");
  await expect(page.locator("#seat-person-Squadra2")).toHaveValue("");
  await gotoScreen(page, "Asta");
  const teams = page.locator(".panel", { hasText: "SQUADRE (LEGA)" });
  await expect(teams).toContainText("Bruno");
  await expect(teams).toContainText("Squadra2");

  // Bruno leaves the league: the seat frees, the person stays in the archive
  // and stays pickable — so coming back is a re-selection, not a re-creation.
  await gotoScreen(page, "Impostazioni");
  await page.locator("#seat-person-Squadra3").selectOption("");
  const archived = page.locator("#league-people-list input");
  await expect(archived).toHaveCount(2);
  await expect(archived.nth(1)).toHaveValue("Bruno");
  await expect(page.locator("#league-people-list").getByText("senza squadra")).toBeVisible();
  await expect(page.locator("#seat-person-Squadra4")).toContainText("Bruno");

  await seat(page, "Squadra4", "Bruno");
  await gotoScreen(page, "Asta");
  await expect(page.locator(".panel", { hasText: "SQUADRE (LEGA)" })).toContainText("Bruno");
  expect(externalRequests).toEqual([]);
});

test("the seat locks once it has bought, while renaming the person stays possible", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Impostazioni");
  await addPerson(page, "Brunoo");
  await seat(page, "Squadra2", "Brunoo");
  await expect(page.locator("#seat-person-Squadra2")).toBeEnabled();

  await gotoScreen(page, "Asta");
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#assign-team")).toContainText("Brunoo");
  await page.locator("#assign-team").selectOption("Squadra2");
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).toContainText("Brunoo");

  // The log records the SEAT, never the person or their name.
  const log = await readLocalStorageJson<Array<{ fantaTeamId?: string }>>(page, "fac_log");
  expect(log?.[0]?.fantaTeamId).toBe("Squadra2");

  await gotoScreen(page, "Impostazioni");
  await expect(page.locator("#seat-person-Squadra2")).toBeDisabled();
  await expect(page.locator("#seat-person-note-Squadra2")).toContainText("Posto assegnato");
  await expect(page.locator("#seat-person-Squadra3")).toBeEnabled();

  // Fixing the typo is a rename, not a change of occupant, so it is allowed
  // even though the seat is locked — and it follows the person everywhere.
  const nameField = page.locator("#league-people-list input").first();
  await nameField.fill("Bruno");
  await gotoScreen(page, "Asta");
  await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).toContainText("Bruno");

  // Voiding empties the seat's roster, so the seat is unclaimed and reopens.
  await page.getByText("Annulla", { exact: true }).click();
  await page.getByRole("button", { name: "Annulla acquisto", exact: true }).click();
  await gotoScreen(page, "Impostazioni");
  await expect(page.locator("#seat-person-Squadra2")).toBeEnabled();
  await expect(page.locator("#seat-person-note-Squadra2")).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test("a name already in the archive is refused instead of creating a second identity", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Impostazioni");

  await addPerson(page, "Bruno");
  await addPerson(page, "  bruno ");
  await expect(page.locator("#league-teams-error")).toContainText("già un partecipante");
  await expect(page.locator("#league-people-list input")).toHaveCount(1);

  // Survives a reload: the archive and the assignment are persisted.
  await seat(page, "Squadra2", "Bruno");
  await page.reload();
  await gotoScreen(page, "Impostazioni");
  await expect(page.locator("#seat-person-Squadra2")).not.toHaveValue("");
  await expect(page.locator("#league-people-list input")).toHaveValue("Bruno");
  expect(externalRequests).toEqual([]);
});

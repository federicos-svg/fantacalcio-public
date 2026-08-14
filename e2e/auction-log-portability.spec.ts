import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL, E2E_TARGET_PLAYER, E2E_PURCHASE_PRICE } from "./fixtures/synthetic-listone.js";
import {
  expectAssignedEffectsVisible,
  gotoScreen,
  installSyntheticNetworkGuard,
  openSettingsSection,
  readLocalStorageRaw,
} from "./helpers.js";
import { LOG_STORAGE_KEY } from "../src/logRecovery.js";
import { CONFIRMATIONS_STORAGE_KEY } from "../src/confirmationsStore.js";

test("exports, confirms replacement, imports, and survives reload without external network", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expectAssignedEffectsVisible(page, E2E_TARGET_PLAYER.name, E2E_PURCHASE_PRICE, "1/7");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#auction-log-export").click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  expect(exportedPath).not.toBeNull();

  await page.getByText("Annulla", { exact: true }).click();
  await page.getByRole("button", { name: "Annulla acquisto", exact: true }).click();
  await expect(page.getByText("Nessun acquisto registrato.")).toBeVisible();

  await page.locator("#auction-log-import-file").setInputFiles(exportedPath!);
  await page.locator("#import-confirm-apply").click();
  await expectAssignedEffectsVisible(page, E2E_TARGET_PLAYER.name, E2E_PURCHASE_PRICE, "1/7");
  const importedRaw = await readLocalStorageRaw(page, LOG_STORAGE_KEY);

  await page.locator("#auction-log-import-file").setInputFiles({
    name: "empty.v1.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"fantacalcio-auction-log","version":1,"log":[]}\n'),
  });
  await page.locator("#import-confirm-cancel").click();
  await expect(page.getByText(/Import annullato/)).toBeVisible();
  expect(await readLocalStorageRaw(page, LOG_STORAGE_KEY)).toBe(importedRaw);

  await page.locator("#auction-log-import-file").setInputFiles({
    name: "invalid.v1.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"fantacalcio-auction-log","version":1,"log":[{"type":"VOID","seq":0,"ts":"2026-07-25T00:00:00.000Z","targetSeq":99}]}\n'),
  });
  await page.locator("#import-confirm-apply").click();
  await expect(page.getByText(/semanticamente valido/)).toBeVisible();
  expect(await readLocalStorageRaw(page, LOG_STORAGE_KEY)).toBe(importedRaw);

  await page.reload();
  await expectAssignedEffectsVisible(page, E2E_TARGET_PLAYER.name, E2E_PURCHASE_PRICE, "1/7");
  expect(externalRequests).toEqual([]);
});

// Tranche 2b (#231): portable log v2 — the envelope now also carries the
// riconferme batch, so an export/import round-trip restores BOTH stores,
// not just the log.
test("v2 export carries the riconferme batch, and reimporting on a wiped device restores both stores", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator(".listone-row").first()).toBeVisible();

  // A riconferma via the panel (role D — "Beatrice Fittizia").
  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "riconferme");
  await page.locator("#riconferme-picker-Io-D").selectOption({ label: "Beatrice Fittizia (ClubDue)" });
  await page.locator("#riconferme-price-Io-D").fill("15");
  await page.locator("#riconferme-confirm-Io-D").click();
  await expect(page.locator("#riconferme-slot-Io-D")).toContainText("Beatrice Fittizia");

  // A live purchase makes the log non-empty too.
  await gotoScreen(page, "Asta");
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - E2E_PURCHASE_PRICE - 15} cr`);

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#auction-log-export").click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  expect(exportedPath).not.toBeNull();
  const exportedEnvelope = JSON.parse(await readFile(exportedPath!, "utf-8"));
  expect(exportedEnvelope.version).toBe(2);
  expect(exportedEnvelope.confirmations).toEqual([
    { fantaTeamId: "Io", playerId: expect.any(String), role: "D", price: 15 },
  ]);

  // Wipe everything (simulate a fresh device/browser) and import the v2
  // file: both the log and the riconferme come back, atomically-with-
  // verified-rollback per the archived design. The wiped device's log is
  // empty, so the import applies immediately (no replace-confirmation
  // dialog — that only guards a NON-empty standing log).
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator(".listone-row").first()).toBeVisible();
  await page.locator("#auction-log-import-file").setInputFiles(exportedPath!);
  // Not expectAssignedEffectsVisible: that helper assumes a clean 500 cr
  // baseline, but this device also carries the imported 15 cr riconferma.
  const storicoPanel = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(storicoPanel).toContainText(E2E_TARGET_PLAYER.name);
  await expect(storicoPanel).toContainText(`${E2E_PURCHASE_PRICE} cr`);
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - E2E_PURCHASE_PRICE - 15} cr`);

  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "riconferme");
  await expect(page.locator("#riconferme-slot-Io-D")).toContainText("Beatrice Fittizia");
  await expect(page.locator("#riconferme-slot-Io-D")).toContainText("15 cr");

  expect(externalRequests).toEqual([]);
});

// v1 legacy import (no `confirmations` key at all) is still accepted, but
// only after validation against the DEVICE's current riconferme — never a
// second, divergent source of truth for a file that carries none.
test("a v1 legacy file with no confirmations key still imports, validated against the device's current riconferme", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator(".listone-row").first()).toBeVisible();

  // Device already has a riconferma unrelated to the imported (empty) log.
  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "riconferme");
  await page.locator("#riconferme-picker-Io-D").selectOption({ label: "Beatrice Fittizia (ClubDue)" });
  await page.locator("#riconferme-price-Io-D").fill("15");
  await page.locator("#riconferme-confirm-Io-D").click();
  await expect(page.locator("#riconferme-slot-Io-D")).toContainText("Beatrice Fittizia");

  await gotoScreen(page, "Asta");
  await expect(page.locator("#critical-budget")).toHaveText("485 cr"); // 500 - 15
  // Post-review fix (round 2, #285): the log is empty, but the DEVICE has a
  // real riconferma — the replace-confirmation dialog now gates on either
  // condition, not just a non-empty log, so it must appear here too. The
  // copy names this file's own (v1) scope explicitly: only the log.
  await page.locator("#auction-log-import-file").setInputFiles({
    name: "legacy.v1.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"fantacalcio-auction-log","version":1,"log":[]}\n'),
  });
  await expect(page.locator("#import-confirm-overlay")).toBeVisible();
  await expect(page.locator("#import-confirm-body")).toContainText("solo lo storico");
  await expect(page.locator("#import-confirm-body")).toContainText("le riconferme del dispositivo restano");
  await page.locator("#import-confirm-apply").click();
  await expect(page.locator("#import-confirm-overlay")).toHaveCount(0);
  await expect(page.getByText(/Import completato/)).toBeVisible();
  await expect(page.locator("#critical-budget")).toHaveText("485 cr");

  // The device's riconferma was untouched by a v1 import (it carries none).
  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "riconferme");
  await expect(page.locator("#riconferme-slot-Io-D")).toContainText("Beatrice Fittizia");

  expect(externalRequests).toEqual([]);
});

// Pins fix 1 (#285) directly: importing a v2 file (which carries its OWN,
// different riconferme) onto a device with an EMPTY log but a real
// riconferma already entered used to skip the confirm dialog entirely
// (the old gate only checked the log) and silently replace it. The dialog
// must now appear, name the v2 scope explicitly (storico E riconferme), and
// "Mantieni storico" must leave BOTH stores completely untouched.
test("v2 import onto an empty log with riconferme already entered shows the replace dialog; cancelling changes nothing", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator(".listone-row").first()).toBeVisible();

  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "riconferme");
  await page.locator("#riconferme-picker-Io-D").selectOption({ label: "Beatrice Fittizia (ClubDue)" });
  await page.locator("#riconferme-price-Io-D").fill("15");
  await page.locator("#riconferme-confirm-Io-D").click();
  await expect(page.locator("#riconferme-slot-Io-D")).toContainText("Beatrice Fittizia");

  await gotoScreen(page, "Asta");
  await expect(page.locator("#critical-budget")).toHaveText("485 cr"); // 500 - 15
  const confirmationsBefore = await readLocalStorageRaw(page, CONFIRMATIONS_STORAGE_KEY);
  const logBefore = await readLocalStorageRaw(page, LOG_STORAGE_KEY);

  // A well-formed, empty v2 envelope — log is still empty on this device, so
  // ONLY the confirmations condition is what must trigger the dialog here.
  await page.locator("#auction-log-import-file").setInputFiles({
    name: "wipe.v2.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"fantacalcio-auction-log","version":2,"log":[],"confirmations":[]}\n'),
  });
  await expect(page.locator("#import-confirm-overlay")).toBeVisible();
  await expect(page.locator("#import-confirm-body")).toContainText("storico E riconferme");

  await page.locator("#import-confirm-cancel").click();
  await expect(page.locator("#import-confirm-overlay")).toHaveCount(0);
  await expect(page.getByText(/Import annullato/)).toBeVisible();

  // Nothing changed — neither store was touched by the cancelled import.
  await expect(page.locator("#critical-budget")).toHaveText("485 cr");
  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "riconferme");
  await expect(page.locator("#riconferme-slot-Io-D")).toContainText("Beatrice Fittizia");
  expect(await readLocalStorageRaw(page, CONFIRMATIONS_STORAGE_KEY)).toBe(confirmationsBefore);
  expect(await readLocalStorageRaw(page, LOG_STORAGE_KEY)).toBe(logBefore);

  expect(externalRequests).toEqual([]);
});

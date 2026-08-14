// LIVE-02 / UI-TEST-01 recovery scenario 2 — see
// docs/AUCTION_2026_EXECUTION_PLAN.md LIVE-02. A corrupted canonical
// `fac_log` with no valid last-known-good copy blocks: a real recovery
// screen (not a mock, not silently an empty auction), retry, forensic
// export byte-for-byte, and only a new (empty) log after an explicit,
// separate confirmation — never presented as "repairing" the old one.
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { LOG_STORAGE_KEY, QUARANTINE_STORAGE_KEY } from "../src/logRecovery.js";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, readLocalStorageRaw } from "./helpers.js";

// Deliberately not valid JSON, with non-ASCII content — the export must
// reproduce this exactly, not just "close enough".
const CORRUPTED_CANONICAL = "not json at all, definitely corrupted — 你好";

test("blocks with a real recovery screen when no valid copy exists, and only starts a new log after explicit confirmation", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  // Synthetic setup only: pre-seed a corrupted canonical log with no
  // last-known-good key at all, before the app's boot-time read.
  await page.addInitScript(
    ({ logKey, corrupted }) => {
      window.localStorage.setItem(logKey, corrupted);
    },
    { logKey: LOG_STORAGE_KEY, corrupted: CORRUPTED_CANONICAL },
  );

  await page.goto("/");

  // A real, accessible recovery screen — not a mock, not a blank page.
  const heading = page.getByRole("heading", { name: /recovery richiesta/i });
  await expect(heading).toBeVisible();
  // Normal auction mutation UI is not reachable at all while blocked.
  await expect(page.getByRole("button", { name: "Registra acquisto", exact: true })).toHaveCount(0);

  // Retry: a real re-read/re-validate of storage (still corrupted -> still blocked).
  const retryBtn = page.getByRole("button", { name: "Riprova lettura storage", exact: true });
  await expect(retryBtn).toBeVisible();
  await retryBtn.click();
  await expect(heading).toBeVisible();

  // Export: the downloaded bytes/text match the original corrupted payload
  // exactly — no normalization, no loss, even though it was never valid JSON.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta payload corrotto", exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("expected a saved download path");
  const downloadedText = await readFile(downloadPath, "utf-8");
  expect(downloadedText).toBe(CORRUPTED_CANONICAL);

  // Starting a new log is impossible without an explicit, separate
  // confirmation — the first click only opens the confirm step.
  await page.getByRole("button", { name: "Inizia nuovo log", exact: true }).click();
  await expect(page.getByRole("button", { name: "Registra acquisto", exact: true })).toHaveCount(0);
  const confirmHeading = page.getByText("Confermi di iniziare un nuovo log vuoto?", { exact: true });
  await expect(confirmHeading).toBeVisible();

  // Cancel path: backs out without starting anything.
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(confirmHeading).toHaveCount(0);
  await expect(heading).toBeVisible();

  // Confirm for real this time.
  await page.getByRole("button", { name: "Inizia nuovo log", exact: true }).click();
  await page.getByRole("button", { name: "Sì, inizia un nuovo log vuoto", exact: true }).click();

  // After confirmation: the app is usable with a genuinely empty log —
  // never a silently-fabricated one, since it was only reached through the
  // explicit confirm click above.
  await expect(heading).toHaveCount(0);
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  const storicoPanel = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(storicoPanel).toContainText("Nessun acquisto registrato.");

  // The quarantine is still available after starting the new log — never
  // auto-cleared — and still exportable via the persistent notice.
  const quarantinedAfter = await readLocalStorageRaw(page, QUARANTINE_STORAGE_KEY);
  expect(quarantinedAfter).toBe(CORRUPTED_CANONICAL);
  await expect(page.getByRole("button", { name: "Esporta payload non valido", exact: true })).toBeVisible();

  // No external request happened at any point in this test.
  expect(externalRequests).toEqual([]);
});

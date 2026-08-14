// LIVE-02 / UI-TEST-01 recovery scenario 1 — see
// docs/AUCTION_2026_EXECUTION_PLAN.md LIVE-02. A corrupted canonical `fac_log`
// with a valid last-known-good copy recovers silently-but-visibly: the app
// loads the last-known-good event, shows a persistent (non-modal) notice
// explaining what happened, the corrupted payload is preserved in quarantine
// rather than discarded, AND the auction stays writable afterwards — the
// recovered log becomes the canonical, so the next purchase persists normally.
// That last part is what this spec was missing when the optimistic-concurrency
// write (audit fix 1) shipped: without a post-recovery write, nothing here
// noticed that every save after a recovery was being refused as
// `divergent-log`. Everything else out of scope for LIVE-02 (undo/void UI,
// export/import, receipt guards, offline, opponent assign) is not covered here.
import { test, expect } from "@playwright/test";
import { listonePlayerKey, type ListonePlayer } from "../src/ui/listone.js";
import { LOG_STORAGE_KEY, LAST_KNOWN_GOOD_STORAGE_KEY, QUARANTINE_STORAGE_KEY } from "../src/logRecovery.js";
import { SYNTHETIC_LISTONE_POOL, E2E_TARGET_PLAYER, E2E_PURCHASE_PRICE } from "./fixtures/synthetic-listone.js";
import {
  installSyntheticNetworkGuard,
  readLocalStorageRaw,
  readLocalStorageJson,
  expectAssignedEffectsVisible,
  selectStatusFilter,
} from "./helpers.js";

// A second, unambiguous synthetic player to buy AFTER the recovery — a
// different role from E2E_TARGET_PLAYER so the roster counters move visibly.
const POST_RECOVERY_PLAYER: ListonePlayer = SYNTHETIC_LISTONE_POOL[2]!;
const POST_RECOVERY_PRICE = 7;

interface PersistedEvent {
  readonly type: string;
  readonly playerId: string;
  readonly price?: number;
}

// Deliberately not valid JSON — this must never be treated as an empty log.
const CORRUPTED_CANONICAL = "{ this is not a valid auction log at all !!";

test("recovers from a valid last-known-good copy when the canonical log is corrupted", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  const lastKnownGoodEvent = {
    type: "PURCHASE",
    seq: 0,
    ts: "2026-08-01T10:00:00.000Z",
    playerId: listonePlayerKey(E2E_TARGET_PLAYER),
    role: E2E_TARGET_PLAYER.role,
    fantaTeamId: "Io",
    price: E2E_PURCHASE_PRICE,
  };
  const lastKnownGoodEnvelope = JSON.stringify({ schemaVersion: 1, log: [lastKnownGoodEvent] });

  // Synthetic setup only: pre-seed a corrupted canonical log and a valid
  // last-known-good copy BEFORE the app's own module script runs (it reads
  // storage synchronously at boot) — addInitScript is the only way to win
  // that race deterministically. This test never reloads afterward, so the
  // addInitScript-on-reload trap from the self-assign spec doesn't apply.
  await page.addInitScript(
    ({ logKey, lkgKey, corrupted, lkg }) => {
      window.localStorage.setItem(logKey, corrupted);
      window.localStorage.setItem(lkgKey, lkg);
    },
    {
      logKey: LOG_STORAGE_KEY,
      lkgKey: LAST_KNOWN_GOOD_STORAGE_KEY,
      corrupted: CORRUPTED_CANONICAL,
      lkg: lastKnownGoodEnvelope,
    },
  );

  await page.goto("/");

  // Recovery notice visible and accessible (role=alert), explains a
  // recovery happened — never silently hidden.
  const banner = page.getByRole("alert").filter({ hasText: "copia di sicurezza" });
  await expect(banner).toBeVisible();

  // Budget/roster/history/assigned status all coherent with the recovered
  // (last-known-good) event, verified via UI only.
  await expectAssignedEffectsVisible(page, E2E_TARGET_PLAYER.name, E2E_PURCHASE_PRICE, "1/7");

  // The corrupted payload is preserved in quarantine, byte-for-byte —
  // never re-derived, never silently discarded.
  const quarantined = await readLocalStorageRaw(page, QUARANTINE_STORAGE_KEY);
  expect(quarantined).toBe(CORRUPTED_CANONICAL);

  // The export control for the quarantined payload is present in the notice.
  await expect(banner.getByRole("button", { name: "Esporta payload non valido", exact: true })).toBeVisible();

  // The recovery also RE-PERSISTED the recovered log as the canonical: the
  // corrupted text is gone from `fac_log` (it lives on in quarantine, checked
  // above) and the canonical now holds exactly the recovered event.
  const canonicalAfterRecovery = await readLocalStorageJson<PersistedEvent[]>(page, LOG_STORAGE_KEY);
  expect(canonicalAfterRecovery).toHaveLength(1);
  expect(canonicalAfterRecovery![0]).toMatchObject({
    type: "PURCHASE",
    playerId: listonePlayerKey(E2E_TARGET_PLAYER),
    price: E2E_PURCHASE_PRICE,
  });

  // ── The operator keeps working after the recovery ────────────────────────
  // A real purchase, through the real UI. Before the re-persist landed this
  // was refused forever ("Un'altra scheda ha modificato lo storico"), because
  // the write compared its baseline against the corrupted canonical.
  await selectStatusFilter(page, "available");
  const nextRow = page.getByText(POST_RECOVERY_PLAYER.name, { exact: true });
  await expect(nextRow).toBeVisible();
  await nextRow.click();

  const avviaButton = page.getByRole("button", { name: /^Avvia/ });
  await expect(avviaButton).toBeEnabled();
  await avviaButton.click();

  await expect(page.locator("#assign-team")).toHaveValue("Io");
  await page.locator("#assign-price").fill(String(POST_RECOVERY_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  // No persistence error of any kind — in particular not the multi-tab one.
  await expect(page.getByText(/Un'altra scheda ha modificato lo storico/)).toHaveCount(0);

  // Visible effects of BOTH purchases: budget net of the two prices, the
  // recovered purchase still in the history, the new one alongside it.
  await expect(page.locator("#critical-budget")).toHaveText(
    `${500 - E2E_PURCHASE_PRICE - POST_RECOVERY_PRICE} cr`,
  );
  await expect(page.locator("#critical-spent")).toHaveText(
    `${E2E_PURCHASE_PRICE + POST_RECOVERY_PRICE} cr`,
  );
  const storicoPanel = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(storicoPanel).toContainText(E2E_TARGET_PLAYER.name);
  await expect(storicoPanel).toContainText(POST_RECOVERY_PLAYER.name);

  // Persisted, not just rendered: the canonical now holds both events, and
  // the corrupted payload is still exactly where it was quarantined.
  const canonicalAfterPurchase = await readLocalStorageJson<PersistedEvent[]>(page, LOG_STORAGE_KEY);
  expect(canonicalAfterPurchase).toHaveLength(2);
  expect(canonicalAfterPurchase![1]).toMatchObject({
    type: "PURCHASE",
    playerId: listonePlayerKey(POST_RECOVERY_PLAYER),
    price: POST_RECOVERY_PRICE,
  });
  expect(await readLocalStorageRaw(page, QUARANTINE_STORAGE_KEY)).toBe(CORRUPTED_CANONICAL);

  // No external request happened at any point in this test.
  expect(externalRequests).toEqual([]);
});

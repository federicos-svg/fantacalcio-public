// TEST-HARNESS-01 + first slice of UI-TEST-01 — see
// docs/AUCTION_2026_EXECUTION_PLAN.md §5.2. Covers exactly: open app -> load
// synthetic listone -> select a player -> launch the call -> assign to "Io"
// at a synthetic price -> see budget/roster-history/assigned-status update
// -> full reload -> see the same three restored from the persisted event
// log. Everything else (opponent assign, undo, void, corrupted-log
// recovery — see recovery-*.spec.ts, export/import, receipt guards,
// offline, performance/rehearsal, new LIVE features) is explicitly out of
// scope for this slice.
import { test, expect } from "@playwright/test";
import { listonePlayerKey } from "../src/ui/listone.js";
import {
  SYNTHETIC_LISTONE_POOL,
  E2E_TARGET_PLAYER,
  E2E_PURCHASE_PRICE,
} from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, readLocalStorageJson, expectAssignedEffectsVisible } from "./helpers.js";

const LOG_STORAGE_KEY = "fac_log";
const POOL_STORAGE_KEY = "fac_pool";

interface PersistedPurchaseEvent {
  readonly type: string;
  readonly playerId: string;
  readonly role: string;
  readonly fantaTeamId: string;
  readonly price: number;
}

test.describe("Self assignment persists across reload (UI-TEST-01 — first slice)", () => {
  test("assign a synthetic player to Io, then reload and see budget/history/status restored", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

    // 1. Open the app. Playwright gives every test its own fresh, isolated
    // browser context (no storageState configured anywhere in this suite),
    // so localStorage starts empty here independent of execution order or
    // any prior test — verified explicitly right below rather than assumed.
    // (Deliberately not an addInitScript localStorage.clear(): that would
    // re-fire on the reload in step 7 too, wiping the very persistence this
    // test exists to check — a real trap, not a hypothetical one.)
    await page.goto("/");
    expect(await readLocalStorageJson(page, LOG_STORAGE_KEY)).toBeNull();

    // 2. Synthetic listone loads (intercepted fetch, never the real asset).
    const targetRow = page.getByText(E2E_TARGET_PLAYER.name, { exact: true });
    await expect(targetRow).toBeVisible();

    // 3. Select the player by clicking its listone row (real user
    // interaction — this is the only way the app's own "Avvia" gate opens).
    await targetRow.click();

    // 4. Launch the call.
    const avviaButton = page.getByRole("button", { name: /^Avvia/ });
    await expect(avviaButton).toBeEnabled();
    await avviaButton.click();

    // 5. Assign to "Io" (already the default team) at a synthetic price.
    await expect(page.locator("#assign-team")).toHaveValue("Io");
    await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
    await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

    // 6. Visible effects: budget, roster/history, assigned status.
    await expectAssignedEffectsVisible(page, E2E_TARGET_PLAYER.name, E2E_PURCHASE_PRICE, "1/7");

    // Proof this test never touched the real listone: the only pool ever
    // persisted to this browser's storage is byte-for-byte the synthetic
    // fixture above — no real/unauthorized payload was ever created.
    const persistedPool = await readLocalStorageJson<unknown>(page, POOL_STORAGE_KEY);
    expect(persistedPool).toEqual(SYNTHETIC_LISTONE_POOL);

    const logBeforeReload = await readLocalStorageJson<PersistedPurchaseEvent[]>(page, LOG_STORAGE_KEY);
    expect(logBeforeReload).toHaveLength(1);
    expect(logBeforeReload![0]).toMatchObject({
      type: "PURCHASE",
      playerId: listonePlayerKey(E2E_TARGET_PLAYER),
      role: "A",
      fantaTeamId: "Io",
      price: E2E_PURCHASE_PRICE,
    });

    // 7. Full reload.
    await page.reload();

    // 8. The valid event survives the reload; budget/history/status stay
    // coherent — re-checked via the same UI-only assertions as step 6.
    await expectAssignedEffectsVisible(page, E2E_TARGET_PLAYER.name, E2E_PURCHASE_PRICE, "1/7");

    const logAfterReload = await readLocalStorageJson<PersistedPurchaseEvent[]>(page, LOG_STORAGE_KEY);
    expect(logAfterReload).toEqual(logBeforeReload);

    // No external request happened at any point in this test.
    expect(externalRequests).toEqual([]);
  });
});

// Shared E2E helpers — network policy, storage reads, and the
// budget/roster-history/assigned-status assertions used by both the
// self-assign+reload spec and the LIVE-02 recovery specs. Extracted only
// because the duplication across those specs was real, not speculative.
import { type BrowserContext, type Page, expect } from "@playwright/test";

export const LISTONE_ASSET_PATH = "/data/listone_2025_26.json";
export const LISTONE_REMOTE_PATH = "/api/listone";

/**
 * How the guard answers GET /api/listone (functions/api/listone.ts), which the
 * Vite preview server this suite runs against cannot serve — it has no Pages
 * Functions runtime.
 *
 * - `unavailable` (the default): a 404 JSON error, i.e. the endpoint not
 *   deployed. Every pre-existing spec relies on this to keep exercising the
 *   static-asset path exactly as before.
 * - `serve`: a synthetic deposit payload, optionally with its freshness header.
 * - `passthrough`: let the preview server answer, which it does with the SPA's
 *   own index.html at status 200 — the case the app's content-type check has
 *   to reject rather than treat as data.
 */
export type RemoteListoneRoute =
  | { readonly kind: "unavailable" }
  | { readonly kind: "serve"; readonly rows: unknown; readonly modifiedAt?: string }
  | { readonly kind: "passthrough" };

/**
 * The only network policy every spec in this suite uses: the synthetic
 * listone fixture for the exact asset path, an explicit answer for the
 * private-deposit endpoint, pass-through for same-origin (the app's own build
 * + the intercepted asset), and a hard abort — recorded, never silently
 * allowed — for anything else. Every spec asserts `externalRequests` is empty
 * at the end.
 */
export async function installSyntheticNetworkGuard(
  context: BrowserContext,
  syntheticListonePool: unknown,
  externalRequests: string[],
  remote: RemoteListoneRoute = { kind: "unavailable" },
): Promise<void> {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === LISTONE_ASSET_PATH) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(syntheticListonePool),
      });
    }
    if (url.pathname === LISTONE_REMOTE_PATH && remote.kind !== "passthrough") {
      if (remote.kind === "unavailable") {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "not_found" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: remote.modifiedAt === undefined ? {} : { "x-listone-modified-at": remote.modifiedAt },
        body: JSON.stringify(remote.rows),
      });
    }
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return route.continue();
    }
    externalRequests.push(route.request().url());
    return route.abort("blockedbyclient");
  });
}

/**
 * Switches screen through the real top-bar nav (plain spans with click
 * handlers, not links — hence the text locator scoped to <nav>). The app
 * status states (SHADOW / NO TARGET / connectivity) live in Impostazioni,
 * not in the Asta view, so any spec asserting them has to go there first.
 */
export async function gotoScreen(
  page: Page,
  label: "Asta" | "Rose" | "Impostazioni",
): Promise<void> {
  await page.locator("nav").getByText(label, { exact: true }).click();
}

/**
 * Picks a Listone status filter from its dropdown. The options only exist
 * while the menu is open, so every spec that filters goes through here.
 */
export async function selectStatusFilter(
  page: Page,
  value: "available" | "assigned" | "all",
): Promise<void> {
  const trigger = page.locator("#listone-status-filter-trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  await page.locator(`#listone-status-filter-option-${value}`).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

/**
 * Picks an Impostazioni area from the left menu. Only the selected area's
 * body is in the DOM, so this is what makes its content assertable at all.
 */
export async function openSettingsSection(page: Page, id: "teams" | "riconferme" | "status"): Promise<void> {
  const tab = page.locator(`#settings-tab-${id}`);
  if ((await tab.getAttribute("aria-selected")) === "true") return;
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

/** Asserts the two always-closed gate states, in the area that shows them. */
export async function expectGateStatesVisible(page: Page): Promise<void> {
  await openSettingsSection(page, "status");
  await expect(page.locator("#shadow-status")).toBeVisible();
  await expect(page.locator("#shadow-status")).toContainText("SHADOW");
  await expect(page.locator("#no-target-status")).toContainText("NO TARGET");
}

/** Reads and JSON-parses a localStorage value — only for keys known to
 *  hold JSON (`fac_log`, `fac_log_lkg`). For the quarantine key (which may
 *  hold non-JSON text by design) use readLocalStorageRaw instead. */
export async function readLocalStorageJson<T>(page: Page, key: string): Promise<T | null> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), key);
  return raw === null ? null : (JSON.parse(raw) as T);
}

/** Reads a localStorage value as-is, no parsing — used for the quarantine
 *  key, whose content is deliberately never normalized. */
export async function readLocalStorageRaw(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => window.localStorage.getItem(k), key);
}

/**
 * The same budget/roster-history/assigned-status assertions used right
 * after an assignment and again after a reload/recovery — verified only
 * through the UI, never internal state.
 */
export async function expectAssignedEffectsVisible(
  page: Page,
  playerName: string,
  price: number,
  roleCount: string,
): Promise<void> {
  // Budget/spent/roster all live in the sticky strip now — the separate
  // BUDGET & ROSA panel was folded into it.
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - price} cr`);
  await expect(page.locator("#critical-spent")).toHaveText(`${price} cr`);
  await expect(page.locator("#critical-roster")).toContainText(roleCount);

  const storicoPanel = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(storicoPanel).toContainText(playerName);
  await expect(storicoPanel).toContainText(`${price} cr`);
  await expect(storicoPanel).toContainText("Io");

  await selectStatusFilter(page, "assigned");
  const assignedRow = page.locator(".listone-row", { hasText: playerName });
  await expect(assignedRow).toContainText("Assegnato");
}

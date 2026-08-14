import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, readLocalStorageJson, selectStatusFilter } from "./helpers.js";

// LIVE-06 — voiding a purchase that is NOT the last one registered.
// The engine always supported it (voidFeasibility/recordVoid accept any target
// seq and reduce() replays the whole log, so the derived state is
// order-independent — packages/engine/src/feasibility.ts,
// packages/engine/src/reduce.ts); only the UI restricted the affordance to the
// most recent purchase. This spec drives the real screen: two purchases, void
// the FIRST, and assert the recomputed state through the UI and the persisted
// log — never internal state.

interface StoredEvent {
  readonly type: "PURCHASE" | "VOID";
  readonly seq: number;
  readonly playerId?: string;
  readonly targetSeq?: number;
}

// Two distinct roles so the roster progress of each is independently readable.
const FIRST = SYNTHETIC_LISTONE_POOL[3]!; // role A
const SECOND = SYNTHETIC_LISTONE_POOL[2]!; // role C
const FIRST_PRICE = 40;
const SECOND_PRICE = 25;

async function buy(page: Page, name: string, price: number): Promise<void> {
  await page.getByText(name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(price));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#search-player")).toBeFocused();
}

test("a non-last purchase can be voided after an explicit confirmation, and the state is recomputed", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  await buy(page, FIRST.name, FIRST_PRICE);
  await buy(page, SECOND.name, SECOND_PRICE);
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - FIRST_PRICE - SECOND_PRICE} cr`);

  // Both purchases carry their own Annulla affordance — the older one included.
  const history = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(history.getByRole("button", { name: "Annulla", exact: true })).toHaveCount(2);

  // seq 0 is the FIRST purchase, i.e. not the most recent one still standing.
  await page.locator("#undo-purchase-0").click();
  await expect(page.locator("#void-confirm-overlay")).toBeVisible();
  await expect(page.locator("#void-confirm-title")).toHaveText("Annullare questo acquisto?");
  await expect(page.locator("#void-confirm-overlay")).toContainText(FIRST.name);
  // The non-last case is never silent: the dialog states that the later
  // purchases survive and the state is recomputed from the whole log.
  await expect(page.locator("#void-confirm-non-latest-note")).toBeVisible();
  await expect(page.locator("#void-confirm-non-latest-note")).toContainText("Gli acquisti successivi restano validi");

  // Explicit confirmation is required: dismissing changes nothing at all.
  await page.keyboard.press("Escape");
  await expect(page.locator("#void-confirm-overlay")).toHaveCount(0);
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - FIRST_PRICE - SECOND_PRICE} cr`);
  await expect(history).toContainText(FIRST.name);

  await page.locator("#undo-purchase-0").click();
  await page.locator("#void-confirm-apply").click();
  await expect(page.locator("#void-confirm-overlay")).toHaveCount(0);

  // Recomputed state: only the voided purchase is gone, the later one stands.
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - SECOND_PRICE} cr`);
  await expect(page.locator("#critical-spent")).toHaveText(`${SECOND_PRICE} cr`);
  await expect(page.locator("#critical-roster")).toContainText("0/7"); // role A freed
  await expect(page.locator("#critical-roster")).toContainText("1/9"); // role C untouched
  await expect(history).toContainText(SECOND.name);
  await expect(history).not.toContainText(FIRST.name);
  await expect(history.getByRole("button", { name: "Annulla", exact: true })).toHaveCount(1);

  // The voided player is callable again; the surviving one is still assigned.
  await selectStatusFilter(page, "available");
  await expect(page.locator(".listone-row", { hasText: FIRST.name })).toBeVisible();
  await selectStatusFilter(page, "assigned");
  await expect(page.locator(".listone-row", { hasText: SECOND.name })).toContainText("Assegnato");

  // Append-only: a compensating VOID, never a deletion or a rewrite.
  const log = await readLocalStorageJson<StoredEvent[]>(page, "fac_log");
  expect(log?.map((event) => event.type)).toEqual(["PURCHASE", "PURCHASE", "VOID"]);
  expect(log![2]?.targetSeq).toBe(0);

  await page.reload();
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - SECOND_PRICE} cr`);
  await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).toContainText(SECOND.name);
  expect(externalRequests).toEqual([]);
});

test("voiding the most recent purchase keeps its own wording and shows no non-last warning", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  await buy(page, FIRST.name, FIRST_PRICE);
  await buy(page, SECOND.name, SECOND_PRICE);

  await page.locator("#undo-purchase-1").click();
  await expect(page.locator("#void-confirm-title")).toHaveText("Annullare l'ultimo acquisto?");
  await expect(page.locator("#void-confirm-non-latest-note")).toHaveCount(0);

  await page.locator("#void-confirm-apply").click();
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - FIRST_PRICE} cr`);
  const history = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(history).toContainText(FIRST.name);
  await expect(history).not.toContainText(SECOND.name);
  expect(externalRequests).toEqual([]);
});

// Riconferme pre-asta (LEAGUE_RULES.md §4, tranche 2b, #231) — the
// Impostazioni panel end-to-end: insertion, the critical strip moving by
// the confirmed price, a confirmed player becoming unselectable elsewhere,
// the Rose "R" badge, STORICO ACQUISTI never listing a riconferma, the
// read-only gate once the log is non-empty, and reload mid-asta producing
// identical state. See the archived design (issue #231, comment
// 5290847863) for the acceptance this spec covers.
import { expect, test } from "@playwright/test";
import {
  RICONFERME_LISTONE_POOL,
  RICONFERME_TARGET_PLAYER,
  RICONFERME_TARGET_PRICE,
  RICONFERME_OTHER_D_PLAYER,
} from "./fixtures/synthetic-listone-riconferme.js";
import {
  gotoScreen,
  installSyntheticNetworkGuard,
  openSettingsSection,
  readLocalStorageJson,
  selectStatusFilter,
} from "./helpers.js";
import { listonePlayerKey } from "../src/ui/listone.js";

function pickerLabel(p: { readonly name: string; readonly club: string }): string {
  return `${p.name} (${p.club})`;
}

test("riconferme pre-asta: insertion updates the critical strip, blocks reselection, badges Rose, never appears as an event, gates read-only, and survives reload mid-asta", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, RICONFERME_LISTONE_POOL, externalRequests);
  await page.goto("/");
  // Wait for the listone to have actually loaded before touching any
  // riconferme picker — selectOption queries the DOM synchronously and
  // will not wait for an option that has not landed yet.
  await expect(page.locator(".listone-row").first()).toBeVisible();

  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "riconferme");

  // Fixed, non-blocking notice on the "due stagioni di fila" constraint —
  // always visible (design proposal (c): not enforced, only declared).
  await expect(page.locator("#riconferme-two-seasons-note")).toBeVisible();
  await expect(page.locator("#riconferme-two-seasons-note")).toContainText("due stagioni");
  await expect(page.locator("#riconferme-readonly-note")).toHaveCount(0);
  await expect(page.locator("#riconferme-empty-listone-note")).toHaveCount(0);
  // Fix 8 (PX polish, round 2, #285): the lock preavviso is visible only
  // while the panel is editable — gone once the log is non-empty (asserted
  // further down, right after the read-only gate kicks in).
  await expect(page.locator("#riconferme-lock-note")).toBeVisible();
  await expect(page.locator("#riconferme-lock-note")).toContainText("sola lettura");

  // Fix 5 (a11y, round 2, #285): the picker/price/confirm controls have
  // distinct, speaking accessible names — not just a shared visual layout.
  await expect(page.locator("#riconferme-picker-Io-D")).toHaveAccessibleName(/Riconferma difensore per Io/i);
  await expect(page.locator("#riconferme-price-Io-D")).toHaveAccessibleName(/Prezzo riconferma difensore per Io/i);
  await expect(page.locator("#riconferme-confirm-Io-D")).toHaveAccessibleName(/Conferma riconferma difensore per Io/i);

  // Confirm "Difensore Confermato" for Io's D slot at 35 cr — the exact
  // numbers the archived design's own example uses (500 -> 465).
  await page.locator("#riconferme-picker-Io-D").selectOption({ label: pickerLabel(RICONFERME_TARGET_PLAYER) });
  await page.locator("#riconferme-price-Io-D").fill(String(RICONFERME_TARGET_PRICE));
  await page.locator("#riconferme-confirm-Io-D").click();

  await expect(page.locator("#riconferme-slot-Io-D")).toContainText(RICONFERME_TARGET_PLAYER.name);
  await expect(page.locator("#riconferme-slot-Io-D")).toContainText(`${RICONFERME_TARGET_PRICE} cr`);
  await expect(page.locator("#riconferme-remove-Io-D")).toBeVisible();
  // Fix 5: the remove button's accessible name comes from aria-label, not
  // just the `title` tooltip.
  await expect(page.locator("#riconferme-remove-Io-D")).toHaveAccessibleName(
    `Rimuovi la riconferma di ${RICONFERME_TARGET_PLAYER.name}`,
  );
  await expect(page.locator("#riconferme-error")).toHaveCount(0);

  const stored = await readLocalStorageJson<{ schemaVersion: number; confirmations: unknown[] }>(
    page,
    "fac_confirmations",
  );
  expect(stored?.confirmations).toHaveLength(1);

  // Another seat's D picker excludes the just-confirmed player, but still
  // offers the OTHER D-role player — "riconfermato non selezionabile" is
  // scoped to that one player, not the whole role.
  const squadra2Picker = page.locator("#riconferme-picker-Squadra2-D");
  await expect(squadra2Picker.locator("option", { hasText: RICONFERME_TARGET_PLAYER.name })).toHaveCount(0);
  await expect(squadra2Picker.locator("option", { hasText: RICONFERME_OTHER_D_PLAYER.name })).toHaveCount(1);

  // Critical strip: 500 -> 465, hand-computed the same way the design's own
  // example states it.
  await gotoScreen(page, "Asta");
  await expect(page.locator("#critical-budget")).toHaveText("465 cr");
  await expect(page.locator("#critical-spent")).toHaveText("35 cr");

  // The riconfermato is excluded from the default "Liberi" Listone view
  // (chiamata già protetta via purchasedPlayerIds — no new code for this,
  // only this assertion) and reappears tagged once "Assegnati" is picked.
  await expect(page.locator(".listone-row", { hasText: RICONFERME_TARGET_PLAYER.name })).toHaveCount(0);
  await selectStatusFilter(page, "assigned");
  await expect(page.locator(".listone-row", { hasText: RICONFERME_TARGET_PLAYER.name })).toContainText("Assegnato");
  await selectStatusFilter(page, "available");

  // STORICO ACQUISTI never lists a riconferma: it iterates AuctionEvents
  // only, and a riconferma never becomes one.
  const storicoPanel = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(storicoPanel).toContainText("Nessun acquisto registrato.");
  await expect(storicoPanel.getByText(RICONFERME_TARGET_PLAYER.name)).toHaveCount(0);
  // No "Annulla" affordance can exist for it either, for the same reason —
  // there is no PURCHASE row to attach one to.
  await expect(page.getByText("Annulla", { exact: true })).toHaveCount(0);

  // Rose: the "R" badge sits on the riconfermato's row.
  await gotoScreen(page, "Rose");
  const ioCard = page.locator(".panel--compact", { hasText: "Io" }).first();
  await expect(ioCard).toContainText(RICONFERME_TARGET_PLAYER.name);
  await expect(ioCard.locator(".roster-badge-confirmed")).toHaveCount(1);
  // Fix 5: the badge's accessible name is "Riconfermato", not the raw "R"
  // glyph or only the (weaker) title tooltip.
  await expect(ioCard.locator(".roster-badge-confirmed")).toHaveAccessibleName("Riconfermato");

  // A live purchase of an unrelated player makes the log non-empty.
  await gotoScreen(page, "Asta");
  await page.getByText(RICONFERME_OTHER_D_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill("20");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#critical-budget")).toHaveText("445 cr"); // 465 - 20

  // The riconferme panel is now read-only: no picker, no remove button,
  // the existing entry is still displayed exactly as before.
  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "riconferme");
  await expect(page.locator("#riconferme-readonly-note")).toBeVisible();
  // Fix 8: the lock preavviso only makes sense while EDITABLE — once the
  // read-only gate is active, it must not still be telling the operator
  // riconferme will "become" read-only; they already are.
  await expect(page.locator("#riconferme-lock-note")).toHaveCount(0);
  await expect(page.locator("#riconferme-slot-Io-D")).toContainText(RICONFERME_TARGET_PLAYER.name);
  await expect(page.locator("#riconferme-remove-Io-D")).toHaveCount(0);
  await expect(page.locator("#riconferme-picker-Squadra2-D")).toHaveCount(0);

  // Reload mid-asta: identical state — the riconferma AND the live
  // purchase both persisted, budget/Rose/badge all reproduce exactly.
  await page.reload();
  await expect(page.locator("#critical-budget")).toHaveText("445 cr");
  await gotoScreen(page, "Rose");
  const ioCardAfterReload = page.locator(".panel--compact", { hasText: "Io" }).first();
  await expect(ioCardAfterReload).toContainText(RICONFERME_TARGET_PLAYER.name);
  await expect(ioCardAfterReload.locator(".roster-badge-confirmed")).toHaveCount(1);
  await expect(ioCardAfterReload).toContainText(RICONFERME_OTHER_D_PLAYER.name);

  expect(externalRequests).toEqual([]);
});

test("price boundary: 473 accepted, 474 and 500 rejected as team-hard-reserve-broken with a humanized message", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, RICONFERME_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator(".listone-row").first()).toBeVisible();
  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "riconferme");

  const targetKey = listonePlayerKey(RICONFERME_TARGET_PLAYER);

  // First attempt: pick the player once, then submit a rejected price.
  await page.locator("#riconferme-picker-Io-D").selectOption({ label: pickerLabel(RICONFERME_TARGET_PLAYER) });
  await page.locator("#riconferme-price-Io-D").fill("474");
  await page.locator("#riconferme-confirm-Io-D").click();

  // 474: probed directly against validateConfirmations() — the first price
  // the hard reserve rejects for a lone confirmation on an otherwise-empty
  // team (28 mandatory slots, COST_FLOOR 1 cr: 500 - 474 = 26 <
  // hardReserve(27) = 27). NOT the design note's approximate "475/476".
  await expect(page.locator("#riconferme-error")).toBeVisible();
  await expect(page.locator("#riconferme-error")).toContainText("completabile");
  // Rejected: the slot stays in PICKER mode (its player name is only text
  // inside the still-present <select>'s own options, not a filled entry).
  await expect(page.locator("#riconferme-picker-Io-D")).toBeVisible();
  await expect(page.locator("#riconferme-slot-Io-D .riconferme-slot__name")).toHaveCount(0);
  // Fix 6 (PX, round 2, #285): render() rebuilds the whole panel on a
  // rejected attempt too, but the operator's picker/price selection must
  // survive it — pinned here by NOT re-selecting the player before the next
  // attempt below, and asserting the values are already back exactly as
  // typed. The error must also be scrolled into view, not just present in
  // the DOM off-screen.
  await expect(page.locator("#riconferme-picker-Io-D")).toHaveValue(targetKey);
  await expect(page.locator("#riconferme-price-Io-D")).toHaveValue("474");
  await expect(page.locator("#riconferme-error")).toBeInViewport();

  // 500: the entire budget on one confirmation — same violation, still
  // refused. Only the price is changed; the player stays picked from the
  // preserved draft, never re-selected.
  await page.locator("#riconferme-price-Io-D").fill("500");
  await page.locator("#riconferme-confirm-Io-D").click();
  await expect(page.locator("#riconferme-error")).toBeVisible();
  await expect(page.locator("#riconferme-picker-Io-D")).toBeVisible();
  await expect(page.locator("#riconferme-slot-Io-D .riconferme-slot__name")).toHaveCount(0);
  await expect(page.locator("#riconferme-picker-Io-D")).toHaveValue(targetKey);
  await expect(page.locator("#riconferme-price-Io-D")).toHaveValue("500");

  // 473: the exact accepted boundary — again, no re-selection needed.
  await page.locator("#riconferme-price-Io-D").fill("473");
  await page.locator("#riconferme-confirm-Io-D").click();
  await expect(page.locator("#riconferme-error")).toHaveCount(0);
  await expect(page.locator("#riconferme-slot-Io-D")).toContainText(RICONFERME_TARGET_PLAYER.name);
  await expect(page.locator("#riconferme-slot-Io-D")).toContainText("473 cr");

  expect(externalRequests).toEqual([]);
});

// Fix 7 (PX polish, round 2, #285): a refusal must not sit there sticky
// forever — leaving the riconferme settings tab (or the whole Impostazioni
// screen) and coming back is a "next render the operator asked for", which
// clears both the stale error and the preserved draft (fix 6) alongside it.
test("a riconferme refusal clears on navigating to a different settings tab, and again on leaving Impostazioni entirely", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, RICONFERME_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator(".listone-row").first()).toBeVisible();
  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "riconferme");

  await page.locator("#riconferme-confirm-Io-D").click();
  await expect(page.locator("#riconferme-error")).toBeVisible();
  await expect(page.locator("#riconferme-error")).toContainText("Seleziona un giocatore");

  // Switching settings tab away and back clears it.
  await openSettingsSection(page, "teams");
  await openSettingsSection(page, "riconferme");
  await expect(page.locator("#riconferme-error")).toHaveCount(0);

  // Reproduce the refusal, then leave via the top-level Asta/Impostazioni
  // nav instead — must clear it just the same.
  await page.locator("#riconferme-confirm-Io-D").click();
  await expect(page.locator("#riconferme-error")).toBeVisible();
  await gotoScreen(page, "Asta");
  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "riconferme");
  await expect(page.locator("#riconferme-error")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("no fac_confirmations key at boot: byte-identical to pre-2b (empty batch, no banner, no blocked screen)", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, RICONFERME_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator(".listone-row").first()).toBeVisible();

  expect(await page.evaluate(() => window.localStorage.getItem("fac_confirmations"))).toBeNull();
  await expect(page.locator("#confirmations-quarantine-banner")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /riconferme pre-asta non valide/i })).toHaveCount(0);
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");

  await gotoScreen(page, "Impostazioni");
  await openSettingsSection(page, "riconferme");
  await expect(page.locator("#riconferme-grid")).toBeVisible();
  await expect(page.locator("#riconferme-slot-Io-D")).not.toContainText("cr");

  expect(externalRequests).toEqual([]);
});

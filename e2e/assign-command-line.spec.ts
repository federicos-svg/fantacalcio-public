import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard, readLocalStorageJson, selectStatusFilter } from "./helpers.js";

// T13 #231 — command line di inserimento. One typed line records a purchase
// without walking select -> Avvia -> prezzo -> conferma.
//
// The two properties this spec exists to protect, driven through the real
// screen (never internal state):
//  1. a line that resolves to exactly one purchase commits on Enter, is
//     persisted, and survives a reload;
//  2. a line that does NOT resolve — ambiguous team, already-assigned player —
//     commits nothing at all, and a resolved line that would break the hard
//     reserve is still refused by purchaseFeasibility(). `max_safe` is not
//     overridable from this path any more than from the form.

interface StoredEvent {
  readonly type: "PURCHASE" | "VOID";
  readonly seq: number;
  readonly playerId?: string;
  readonly fantaTeamId?: string;
  readonly price?: number;
}

const TARGET = SYNTHETIC_LISTONE_POOL[3]!; // "Dario Placeholder", role A
const OTHER = SYNTHETIC_LISTONE_POOL[2]!; // "Carlo Esempio", role C
const PRICE = 34;

test("one typed line assigns a player, is persisted and survives a reload", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  const input = page.locator("#assign-command-input");
  const preview = page.locator("#assign-command-preview");
  const submit = page.locator("#assign-command-submit");

  await expect(page.locator("#assign-command-panel")).toBeVisible();
  // Nothing typed yet: no interpretation, nothing committable.
  await expect(submit).toBeDisabled();

  // `<squadra> <prezzo> <giocatore>`, with an aggressive prefix on the name.
  await input.fill(`io ${PRICE} dario`);

  // The preview states exactly what will be written, before it is written.
  await expect(preview).toContainText(TARGET.name);
  await expect(preview).toContainText(TARGET.club);
  await expect(preview).toContainText("Attaccante");
  await expect(preview).toContainText(`${PRICE} cr`);
  await expect(submit).toBeEnabled();

  await input.press("Enter");

  // Committed through the ordinary accounting: self budget and roster move.
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - PRICE} cr`);
  await expect(page.locator("#critical-spent")).toHaveText(`${PRICE} cr`);
  await expect(page.locator("#critical-roster")).toContainText("1/7");
  await expect(page.locator(".panel", { hasText: "STORICO ACQUISTI" })).toContainText(TARGET.name);

  // The line is cleared and focus stays on it, ready for the next call.
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(submit).toBeDisabled();

  // The player is marked sold in the listone like any other purchase.
  await selectStatusFilter(page, "assigned");
  await expect(page.locator(".listone-row", { hasText: TARGET.name })).toContainText("Assegnato");

  // Append-only log, exactly one PURCHASE, with the resolved team and price.
  const log = await readLocalStorageJson<StoredEvent[]>(page, "fac_log");
  expect(log?.map((event) => event.type)).toEqual(["PURCHASE"]);
  expect(log![0]?.fantaTeamId).toBe("Io");
  expect(log![0]?.price).toBe(PRICE);

  await page.reload();
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - PRICE} cr`);
  expect(externalRequests).toEqual([]);
});

test("a line that does not resolve commits nothing, and the hard reserve still refuses one that does", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  const input = page.locator("#assign-command-input");
  const preview = page.locator("#assign-command-preview");
  const submit = page.locator("#assign-command-submit");
  const history = page.locator(".panel", { hasText: "STORICO ACQUISTI" });

  // 1. Ambiguous team: "squadra" prefixes seven seats. Never disambiguated.
  await input.fill("squadra 10 carlo");
  await expect(preview).toContainText("corrisponde a più squadre");
  await expect(submit).toBeDisabled();
  // Enter is inert on an unresolved line — no event, no budget movement.
  await input.press("Enter");
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  await expect(history).not.toContainText(OTHER.name);

  // 2. Unknown player.
  await input.fill("io 10 zzz");
  await expect(preview).toContainText("Nessun giocatore disponibile");
  await expect(submit).toBeDisabled();

  // 3. Missing price: the grammar is stated, not guessed.
  await input.fill("io dario");
  await expect(preview).toContainText("Manca il prezzo");
  await expect(submit).toBeDisabled();

  // 4. A resolved line that would break the hard reserve is refused by the
  //    engine, not by the parser: 500 cr on the first of 28 mandatory slots
  //    leaves the roster uncompletable. `max_safe` stays non-overridable.
  await input.fill("io 500 dario");
  await expect(submit).toBeEnabled();
  await input.press("Enter");
  await expect(page.locator("#assign-command-error")).toContainText("hard reserve");
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");
  await expect(history).not.toContainText(TARGET.name);
  expect(await readLocalStorageJson<StoredEvent[]>(page, "fac_log")).toBeNull();

  // 5. Once a player is assigned, naming them again says so explicitly
  //    instead of looking like a typo.
  await input.fill("io 20 dario");
  await input.press("Enter");
  await expect(history).toContainText(TARGET.name);
  await input.fill("io 5 dario");
  await expect(preview).toContainText("è già stato assegnato");
  await expect(submit).toBeDisabled();

  expect(externalRequests).toEqual([]);
});

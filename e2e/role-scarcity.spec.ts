import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

// #221 (1) — packages/engine/src/auction.ts roleScarcity() wired to the call
// screen. Two differently-sourced numbers per role: free slots across the whole
// table (auction log only) and rows still unsold in the loaded listone.
// No model field, no receipt, no gate.

const TARGET = SYNTHETIC_LISTONE_POOL[3]!; // role A

// 8 league teams (FANTA_TEAM_IDS in src/main.ts) x ROSTER_REQUIREMENTS.
const LEAGUE_SLOTS = { P: 8 * 3, D: 8 * 9, C: 8 * 9, A: 8 * 7 } as const;

test("role scarcity is on the call screen and follows the real log", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  // #333 — il pannello è ancora sulla schermata di chiamata, dentro IL TAVOLO,
  // sotto il listone: risponde alla domanda «quanto mi serve questo ruolo» dal
  // lato del TAVOLO (slot liberi sommati sulle 8 squadre), non dal mio, e non è
  // una delle risposte da leggere nei due secondi di una chiamata. Dal
  // 2026-08-26 quel gruppo è SEMPRE APERTO: si legge senza gesti.
  await expect(page.locator("#role-scarcity-panel")).toBeVisible();
  for (const role of ["P", "D", "C", "A"] as const) {
    await expect(page.locator(`#scarcity-slots-${role}`)).toHaveText(String(LEAGUE_SLOTS[role]));
    // One synthetic row per role in the fixture pool.
    await expect(page.locator(`#scarcity-pool-${role}`)).toHaveText("1");
  }

  // A real purchase moves both numbers for that role, and only for that role.
  await page.getByText(TARGET.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill("30");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  await expect(page.locator("#scarcity-slots-A")).toHaveText(String(LEAGUE_SLOTS.A - 1));
  await expect(page.locator("#scarcity-pool-A")).toHaveText("0");
  await expect(page.locator("#scarcity-slots-C")).toHaveText(String(LEAGUE_SLOTS.C));
  await expect(page.locator("#scarcity-pool-C")).toHaveText("1");
  expect(externalRequests).toEqual([]);
});

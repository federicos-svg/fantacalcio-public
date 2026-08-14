import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

// #231 audit round 2, finding 7 (D7) — the "Squadra" filter's <select> was
// populated from the hardcoded SERIE_A_CLUBS_2026_27 list (src/ui/serieA.ts)
// instead of the clubs actually present in the loaded pool. PROBE B/J in the
// audit measured 85/532 real-listone players unreachable via the club
// filter, and a synthetic pool (this suite's own fixture, clubs
// ClubUno..ClubQuattro) had a fully EMPTY intersection with the hardcoded
// list — meaning the club filter offered 20 options that never matched a
// single loaded row, and never offered the 4 that would.
//
// This spec reproduces that with the same synthetic fixture already used
// across e2e/: none of its club names are Serie A club names, so before the
// fix the select can never filter to a real pool row, and after the fix it
// must.

test("the club filter is populated from the loaded pool, not a hardcoded Serie A list", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  const clubSelect = page.locator("#search-club");
  await expect(clubSelect).toBeVisible();

  // Every club actually in the loaded pool must be offered as an option —
  // this is the direct fix for PROBE B/J's "85/532 unreachable" measurement.
  const poolClubs = [...new Set(SYNTHETIC_LISTONE_POOL.map((p) => p.club))];
  const optionTexts = await clubSelect.locator("option").allTextContents();
  for (const club of poolClubs) {
    expect(optionTexts).toContain(club);
  }

  // The hardcoded 2026/27 list must not leak in as unreachable options: none
  // of them are in this pool, so none should be offered — otherwise the
  // select still contains options that "select an empty result" (PROBE J).
  expect(optionTexts).not.toContain("Milan");
  expect(optionTexts).not.toContain("Atalanta");

  // Selecting a real pool club must actually filter the Listone down to
  // that club's row(s) — filterability, not just presence in the <select>.
  const target = SYNTHETIC_LISTONE_POOL[3]!; // club "ClubQuattro", role A
  await clubSelect.selectOption({ label: target.club });
  await expect(page.locator(".listone-row")).toHaveCount(1);
  await expect(page.locator(".listone-row", { hasText: target.name })).toContainText(target.club);

  expect(externalRequests).toEqual([]);
});

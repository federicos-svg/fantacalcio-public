import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";

// #231 tranche 3, corsia B — war board TAVOLO in two variants, as decided by
// Owner (2026-08-14 ~12:50Z, bacheca #222 voce 18): MINI during the live
// auction, COMPLETA during player selection.
//
// This spec enforces the two things a reader of docs/FRONTEND_STRUCTURE.md
// must be able to trust:
//  1. one variant per moment, never both — the revised #86 invariant admits a
//     COMPACT strip to the live screen, not the full board;
//  2. the pre-existing half of that invariant is untouched: AVVERSARI TIER-1
//     still never appears on the Asta screen (that is asserted in full by
//     e2e/opponent-tier1-accounting.spec.ts; re-checked here because this
//     change is the one that could break it).

const TARGET = SYNTHETIC_LISTONE_POOL[3]!; // role A

// 8 teams x 28 mandatory slots, 500 credits each (packages/engine/src/types.ts).
// maxSafe = budget − (slot residui − 1) x COST_FLOOR, COST_FLOOR = 1:
//  - untouched team: 500 − 27 = 473
//  - after one purchase at 60:  440 − 26 = 414
const FRESH_MAX_BID = "473";
const AFTER_PURCHASE_MAX_BID = "414";
const PRICE = 60;

// No directive output may reach this surface (docs/DECISIONS.md §D9,
// docs/NO_GO.md): the board is accounting off the event log and nothing else.
const DIRECTIVE = /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|consigl/i;

test("the war board shows the COMPLETE variant while choosing, the MINI strip while bidding", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  // ── Momento chiamata: the full board, and only it ─────────────────────────
  // #333 — the COMPLETE board is still a chiamata-moment block; it sits inside
  // IL TAVOLO together with SCARSITÀ, and since 2026-08-26 that group is always
  // open, so the board is on screen with no gesture at all.
  // "One variant per moment, never both" is unchanged and is what this test
  // exists for: the MINI strip must still be absent HERE and the COMPLETE one
  // absent there.
  await expect(page.locator("#war-board-mini")).toHaveCount(0);
  await expect(page.locator("#war-board-full")).toBeVisible();
  // All eight teams, "io" included — unlike opponentTier1(), warBoardRows()
  // never filters self out.
  await expect(page.locator("#war-board-full-grid > .war-board__card")).toHaveCount(8);
  await expect(page.locator("#war-board-full-Io")).toHaveClass(/war-board__card--self/);

  const selfCard = page.locator("#war-board-full-Io");
  await expect(selfCard).toContainText("500 cr");
  await expect(selfCard).toContainText(`${FRESH_MAX_BID} cr`);
  await expect(selfCard).toContainText("nessun acquisto");
  // Free slots per role are part of the COMPLETE variant only.
  await expect(selfCard.locator(".war-board__slot")).toHaveCount(4);

  // The Asta screen still has no AVVERSARI TIER-1 block: the revision admits
  // the war board, it does not bring that panel back.
  await expect(page.locator("#opponent-tier1-panel")).toHaveCount(0);

  // ── Momento asta: the compact strip, and only it ──────────────────────────
  await page.getByText(TARGET.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();

  await expect(page.locator("#war-board-mini")).toBeVisible();
  await expect(page.locator("#war-board-full")).toHaveCount(0);
  await expect(page.locator("#war-board-mini-list > .war-board-mini__item")).toHaveCount(8);

  // Two numbers per team and nothing else — the compactness is the reason
  // this variant is allowed on the live screen at all.
  await expect(page.locator("#war-board-mini .war-board__slot")).toHaveCount(0);
  await expect(page.locator("#war-board-mini .war-board__acq-list")).toHaveCount(0);

  const miniOpponent = page.locator("#war-board-mini-Squadra2");
  await expect(miniOpponent).toContainText("500");
  await expect(miniOpponent).toContainText(FRESH_MAX_BID);
  // Stesso numero, stesso nome delle card COMPLETE: la sigla del tetto è
  // «max bid» in tutte e due le varianti. Era «max» nuda — la stessa parola
  // con cui la fascia critica chiama il tetto di REPARTO, che è un'altra
  // grandezza (src/ui/budgetLabels.ts, src/ui/maxLabels.test.ts).
  await expect(miniOpponent).toContainText(`max bid${FRESH_MAX_BID}`);
  // The visible form is abbreviated (bdg/max), so each cell carries the full
  // reading for assistive tech.
  await expect(miniOpponent).toHaveAttribute(
    "aria-label",
    `Squadra2: budget residuo 500 crediti, max bid ${FRESH_MAX_BID} crediti`,
  );
  await expect(page.locator("#war-board-mini-Io")).toHaveAttribute(
    "aria-label",
    /^Io \(io\): budget residuo 500 crediti/,
  );
  await expect(page.locator("#opponent-tier1-panel")).toHaveCount(0);

  // ── The purchase lands on the board, from the log only ────────────────────
  await page.locator("#assign-team").selectOption("Squadra2");
  await page.locator("#assign-price").fill(String(PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  // Registering a purchase returns to the chiamata moment: full board again.
  // No gesture is needed at any point — IL TAVOLO is always open.
  await expect(page.locator("#war-board-full")).toBeVisible();
  await expect(page.locator("#war-board-mini")).toHaveCount(0);

  const buyerCard = page.locator("#war-board-full-Squadra2");
  await expect(buyerCard).toContainText(`${500 - PRICE} cr`);
  await expect(buyerCard).toContainText(`${AFTER_PURCHASE_MAX_BID} cr`);
  // Last purchases: the real player name, resolved through the loaded pool,
  // and the price actually paid.
  await expect(buyerCard.locator(".war-board__acq-item")).toHaveCount(1);
  await expect(buyerCard).toContainText(TARGET.name);
  await expect(buyerCard).toContainText(String(PRICE));
  // Nobody else moved.
  await expect(page.locator("#war-board-full-Squadra3")).toContainText("500 cr");
  await expect(page.locator("#war-board-full-Squadra3")).toContainText("nessun acquisto");

  // §D9: accounting only, and the panel says so.
  expect(await page.locator("#war-board-full").innerText()).not.toMatch(DIRECTIVE);
  // La nota in calce è stata tolta dalla schermata: la garanzia §D9 non era
  // nella frase, è nel pannello — che continua a non contenere nulla di
  // direttivo, ed è la riga qui sopra a misurarlo sul testo vero.
  await expect(page.locator("#war-board-full-note")).toHaveCount(0);

  // Neither variant follows the user off the Asta screen.
  await gotoScreen(page, "Rose");
  await expect(page.locator("#war-board-full")).toHaveCount(0);
  await expect(page.locator("#war-board-mini")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("both war board variants stay readable at 390, 768 and 1280 without sideways scrolling", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 720 },
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    // Each viewport starts from an empty auction — a persisted log would make
    // the next iteration's listone selection point at an assigned row.
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // COMPLETE: same 1/2/4 grid as the Rose screen and AVVERSARI TIER-1.
    // Nessun gesto dentro il ciclo: IL TAVOLO è sempre aperto, quindi il
    // reload di ogni giro non ha nessuno stato da azzerare.
    await expect(page.locator("#war-board-full")).toBeVisible();
    const fullColumns = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector("#war-board-full-grid")!)
          .gridTemplateColumns.trim()
          .split(/\s+/).length,
    );
    expect(fullColumns).toBe(viewport.width < 640 ? 1 : viewport.width < 1024 ? 2 : 4);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

    // MINI: one strip on a desktop viewport, wrapping (never shrinking below
    // legibility) on narrower ones. Asserted as "at most 8 cells per row" +
    // "no cell narrower than the 104px floor", not as a fixed column count:
    // the strip is auto-fit by design.
    await page.getByText(TARGET.name, { exact: true }).click();
    await page.getByRole("button", { name: /^Avvia/ }).click();
    await expect(page.locator("#war-board-mini")).toBeVisible();
    // LA MIA RIGA È FUORI DALLA MISURA PERCHÉ È FUORI DALLA STRISCIA.
    // «Nascondi #war-board-mini-Io dentro a #war-board-mini-list» — Pico,
    // 2026-08-29. Resta costruita nel documento (la riga qui sotto lo
    // pretende, così nessuno può scambiare «nascosta» per «sparita»), ma un
    // elemento con `display: none` è largo zero: lasciarla dentro la misura
    // avrebbe fatto fallire il pavimento dei 104px su una cella che non si
    // vede. Le sette celle che si vedono rispondono della soglia come prima.
    await expect(page.locator("#war-board-mini-Io")).toHaveCount(1);
    await expect(page.locator("#war-board-mini-Io")).toBeHidden();
    const strip = await page.evaluate(() => {
      const items = [...document.querySelectorAll("#war-board-mini-list > li")].filter(
        (el) => el.getClientRects().length > 0,
      );
      const widths = items.map((el) => el.getBoundingClientRect().width);
      const rows = new Set(items.map((el) => Math.round(el.getBoundingClientRect().top)));
      return { count: items.length, minWidth: Math.min(...widths), rowCount: rows.size };
    });
    expect(strip.count, "le sette squadre avversarie restano a schermo").toBe(7);
    expect(strip.minWidth).toBeGreaterThanOrEqual(100);
    // On a desktop viewport it really is ONE strip; on a phone it wraps, but
    // never past four rows — beyond that it stops being a strip.
    if (viewport.width >= 1280) expect(strip.rowCount).toBe(1);
    expect(strip.rowCount).toBeLessThanOrEqual(4);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }

  expect(externalRequests).toEqual([]);
});

import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";

// #221 — responsive check for the panels added by T12, at the three viewports
// the task requires: 390 / 768 / 1280. Layout is asserted off the live computed
// style (same technique as e2e/rose-screen.spec.ts), plus the hard rule that
// the page never scrolls sideways.
//
// PLAN-01 added a fourth panel (PIANO ROSA, on Rose) whose CSS reasons about
// 390px like the others. A panel whose layout is not walked at these three
// widths is a panel whose layout nobody measures: it belongs here.

const TARGET = SYNTHETIC_LISTONE_POOL[3]!; // role A

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
] as const;

async function columnCount(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return 0;
    return getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length;
  }, selector);
}

/** True when the document does not scroll sideways at the current viewport. */
async function fitsHorizontally(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

test("every new panel is readable at 390, 768 and 1280 without sideways scrolling", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    // Each viewport starts from an empty auction: the persisted log survives a
    // goto(), and step 3 below leaves purchases behind that would make the
    // next iteration's listone selections point at already-assigned rows.
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 0. La pagina di partenza non scorre di lato a nessuna delle tre
    //    larghezze, prima ancora di aprire qualsiasi pannello.
    expect(await fitsHorizontally(page)).toBe(true);

    // 1. Scarsità per ruolo: 2 columns on a phone, 4 from 640px up.
    //    Sta dentro IL TAVOLO, che è sempre aperto (2026-08-26): niente da
    //    aprire dentro il ciclo, e niente stato dell'app che un reload possa
    //    azzerare. Il pannello è identico a prima: questa asserzione misura le
    //    stesse colonne di sempre.
    await expect(page.locator("#role-scarcity-panel")).toBeVisible();
    expect(await columnCount(page, "#role-scarcity-grid")).toBe(viewport.width < 640 ? 2 : 4);
    expect(await fitsHorizontally(page)).toBe(true);

    // 2. Contesto chiamata, expanded.
    await page.getByText(TARGET.name, { exact: true }).click();
    await page.locator("#nomination-context-toggle").click();
    await expect(page.locator("#nomination-context-body")).toBeVisible();
    await expect(page.locator("#nomination-context-opponents-list")).toBeVisible();
    expect(await columnCount(page, "#nomination-context-body")).toBe(viewport.width < 768 ? 1 : 3);
    expect(await columnCount(page, "#nomination-context-opponents-list")).toBe(
      viewport.width < 640 ? 1 : viewport.width < 1024 ? 2 : 4,
    );
    expect(await fitsHorizontally(page)).toBe(true);

    // 3. The LIVE-06 non-last void confirmation — the tallest dialog in the
    //    app, since it carries the extra warning. Two failure modes worth
    //    asserting at every viewport: its heading disappearing under the
    //    sticky critical strip (which paints over overlays on purpose), and
    //    the dialog running past a short viewport so the buttons that confirm
    //    or cancel an irreversible-looking action are off screen.
    await page.getByRole("button", { name: /^Avvia/ }).click();
    await page.locator("#assign-price").fill("40");
    await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
    await page.getByText(SYNTHETIC_LISTONE_POOL[2]!.name, { exact: true }).click();
    await page.getByRole("button", { name: /^Avvia/ }).click();
    await page.locator("#assign-price").fill("25");
    await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

    await page.locator("#undo-purchase-0").click();
    await expect(page.locator("#void-confirm-non-latest-note")).toBeVisible();
    const dialogGeometry = await page.evaluate(() => {
      const strip = document.getElementById("critical-auction-strip")!.getBoundingClientRect();
      const heading = document.getElementById("void-confirm-title")!.getBoundingClientRect();
      return { headingGap: heading.top - strip.bottom };
    });
    expect(dialogGeometry.headingGap).toBeGreaterThan(0);
    await expect(page.locator("#void-confirm-title")).toBeInViewport();
    await expect(page.locator("#void-confirm-apply")).toBeInViewport();
    await expect(page.locator("#void-confirm-cancel")).toBeInViewport();
    expect(await fitsHorizontally(page)).toBe(true);
    await page.keyboard.press("Escape");

    // 4. Avversari Tier-1 on Rose: 1 / 2 / 4 columns.
    await gotoScreen(page, "Rose");
    await expect(page.locator("#opponent-tier1-panel")).toBeVisible();
    expect(await columnCount(page, "#opponent-tier1-grid")).toBe(
      viewport.width < 640 ? 1 : viewport.width < 1024 ? 2 : 4,
    );
    expect(await fitsHorizontally(page)).toBe(true);

    // 5. PIANO ROSA (PLAN-01), same screen, right above the panel in step 4:
    //    the SAME 1 / 2 / 4 thresholds. These are two four-card grids stacked
    //    on one screen — at a width where one shows two columns and the other
    //    four, the difference would mean nothing to the person reading them,
    //    which is the whole reason the thresholds are shared and asserted here
    //    against the very same expression.
    await expect(page.locator("#role-plan-panel")).toBeVisible();
    expect(await columnCount(page, "#role-plan-grid")).toBe(
      viewport.width < 640 ? 1 : viewport.width < 1024 ? 2 : 4,
    );
    //    Its declaration form is a grid too, and at 390px it must not be the
    //    thing that starts a sideways scroll: four number fields plus a free
    //    text one, each with a full-length label.
    await expect(page.locator("#role-plan-target-P")).toBeVisible();
    await expect(page.locator("#role-plan-version")).toBeVisible();
    expect(await fitsHorizontally(page)).toBe(true);
  }

  expect(externalRequests).toEqual([]);
});

// ── LE DUE GRIGLIE DI ROSE CAMBIANO COLONNE INSIEME ─────────────────────────
//
// PIANO ROSA (#role-plan-grid) e AVVERSARI TIER-1 (#opponent-tier1-grid) sono
// due griglie di quattro schede impilate sulla stessa schermata. Se cambiassero
// numero di colonne a larghezze diverse, esisterebbero fasce in cui quella di
// sopra ne mostra due e quella di sotto quattro — una differenza che per chi
// legge non significa niente, perché non c'è niente che la giustifichi.
//
// PERCHÉ SERVE UN TEST A PARTE. Il test qui sopra gira a 390 / 768 / 1280, e
// NESSUNA di quelle tre larghezze cade fra 640-719 o fra 1024-1079: con soglie
// divergenti (720 e 1080 contro 640 e 1024) i tre viewport darebbero comunque
// 1 / 2 / 4 per entrambe le griglie e il test resterebbe verde. Le larghezze
// che seguono sono esattamente quelle in cui la divergenza si vede — la soglia
// e il pixel prima, per tutte e due le soglie.
test("le due griglie di quattro schede di Rose cambiano colonne alle stesse larghezze", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await gotoScreen(page, "Rose");
  await expect(page.locator("#role-plan-panel")).toBeVisible();
  await expect(page.locator("#opponent-tier1-panel")).toBeVisible();

  // I media query si rivalutano al ridimensionamento: la pagina non va
  // ricostruita, e infatti quello che si misura è la sola CSS.
  for (const { width, columns } of [
    { width: 639, columns: 1 },
    { width: 640, columns: 2 },
    { width: 719, columns: 2 },
    { width: 720, columns: 2 },
    { width: 1023, columns: 2 },
    { width: 1024, columns: 4 },
    { width: 1079, columns: 4 },
    { width: 1080, columns: 4 },
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    const plan = await columnCount(page, "#role-plan-grid");
    const tier1 = await columnCount(page, "#opponent-tier1-grid");
    expect(plan, `PIANO ROSA a ${width}px`).toBe(columns);
    expect(tier1, `AVVERSARI TIER-1 a ${width}px`).toBe(columns);
    expect(plan, `a ${width}px le due griglie di Rose mostrano un numero di colonne diverso`).toBe(
      tier1,
    );
    expect(await fitsHorizontally(page), `la pagina scorre di lato a ${width}px`).toBe(true);
  }

  expect(externalRequests).toEqual([]);
});

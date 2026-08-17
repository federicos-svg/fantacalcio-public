import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
] as const;

// `baseURL` is Playwright's own fixture, fed by `use.baseURL` in
// playwright.config.ts — the single place the suite's port is decided (and
// the single place `E2E_PORT` moves it). This spec used to hardcode
// `http://127.0.0.1:4173` in its network filter, which made it the only
// non-portable spec of the suite: on any other port every request, including
// the app's own, was aborted. Deriving the origin here keeps the filter
// exactly as strict — same-origin continues, everything else aborts — while
// removing the second source of truth about the port.
test("budget, slots and the safe bid ceiling stay visible in rehearsal viewports", async ({
  page,
  context,
  baseURL,
}) => {
  if (baseURL === undefined) throw new Error("baseURL non configurato: vedi playwright.config.ts");
  const appOrigin = new URL(baseURL).origin;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === appOrigin) await route.continue();
    else await route.abort();
  });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const strip = page.locator("#critical-auction-strip");
    await expect(strip).toBeVisible();
    await expect(page.locator("#critical-budget")).toHaveText("500 cr");
    await expect(page.locator("#critical-slots")).toHaveText("28");
    // One ceiling, not one per role: 500 − (28 − 1) × COST_FLOOR.
    await expect(page.locator("#critical-max-bid")).toContainText("473 cr");
    // The status badges belong to Impostazioni now, not to the Asta view.
    await expect(page.locator("#operating-mode-status")).toHaveCount(0);

    // Issue #265 item #1 — budgetPlan().perRole, visible for every role at
    // every rehearsal viewport. Fresh boot (no purchases): budgetResidual
    // 500, slotsRemaining {P:3, D:9, C:9, A:7}, totalSlotsRemaining 28,
    // COST_FLOOR 1 — hand-computed from packages/engine/src/budget.ts so
    // this assertion is independent of the engine's own unit tests.
    const perRole: Record<"P" | "D" | "C" | "A", { slots: number; min: number; max: number }> = {
      P: { slots: 3, min: 3, max: 475 }, // 500 − hardReserve(28-3)
      D: { slots: 9, min: 9, max: 481 }, // 500 − hardReserve(28-9)
      C: { slots: 9, min: 9, max: 481 },
      A: { slots: 7, min: 7, max: 479 }, // 500 − hardReserve(28-7)
    };
    // #331 punto 5: la fascia è UNA RIGA SOLA, e il dettaglio per ruolo
    // (barra di avanzamento + inviluppo di budget) sta dietro un gesto —
    // ridotto, non tolto. Il gesto è l'avanzamento rosa stesso, che resta
    // sulla riga. Prima si verifica che il dettaglio sia davvero chiuso, poi
    // lo si apre: così questa spec continua a misurare le stesse celle e in
    // più fallisce se il gesto smette di funzionare.
    const rosterToggle = page.locator("#critical-roster");
    await expect(rosterToggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#critical-role-plan-P")).toBeHidden();
    await rosterToggle.click();
    await expect(rosterToggle).toHaveAttribute("aria-expanded", "true");

    for (const role of ["P", "D", "C", "A"] as const) {
      const cell = page.locator(`#critical-role-plan-${role}`);
      await expect(cell).toBeVisible();
      const { slots, min, max } = perRole[role];
      await expect(cell).toContainText(`slot${slots}`);
      await expect(cell).toContainText(`min${min}`);
      // «max reparto», non «max»: maxAllocatable è quanto l'intero reparto di
      // quel ruolo può ancora assorbire, non quanto si può mettere su una
      // sola offerta — che è maxSafe, la metrica «Max bid sicuro» qui sopra,
      // a poche decine di pixel. Le due coincidono solo con UN solo slot
      // libero nel reparto; con due o più divergono e la sigla condivisa le
      // faceva leggere come la stessa cifra (src/ui/budgetLabels.ts).
      await expect(cell).toContainText(`max reparto${max}`);
      // Contabilità, non consigli: no directive/advisory wording anywhere
      // in the cell (docs/NO_GO.md §Prodotto).
      const text = ((await cell.textContent()) ?? "").toLowerCase();
      expect(text).not.toMatch(/consigli|suggeri|target|prezzo equo/);
      // …e mai il nome dell'ALTRA grandezza dentro la cella di questa.
      expect(text).not.toContain("max bid");
    }

    // Le due grandezze convivono nella stessa banda: qui si verifica che
    // portino due nomi diversi, non che stiano lontane.
    await expect(page.locator("#critical-max-bid")).toContainText("Max bid sicuro");
    await expect(page.locator("#critical-max-bid")).not.toContainText("max reparto");

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(strip).toBeInViewport();

    const box = await strip.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  }
});

import { expect, test } from "@playwright/test";
import {
  SYNTHETIC_LISTONE_POOL,
  SYNTHETIC_REMOTE_LISTONE_POOL,
  SYNTHETIC_REMOTE_MODIFIED_AT,
  SYNTHETIC_REMOTE_MODIFIED_AT_LABEL,
  SYNTHETIC_REMOTE_LISTONE_POOL_WITH_INDEX,
  SYNTHETIC_APPEAL_INDEX_QUALITY,
  SYNTHETIC_APPEAL_INDEX_RECIPE,
} from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

// GET /api/listone (functions/api/listone.ts) is always stubbed here — the
// Vite preview server this suite runs against has no Pages Functions runtime,
// and the endpoint's own logic is unit-tested in
// packages/listone-live-serve/tests. What these specs prove is the browser
// half: which source ends up on screen, and whether the note says so honestly.
// Zero external network in every case.

const REMOTE_NOTE = "Listone aggiornato automaticamente dal deposito privato";
const FALLBACK_NOTE = "Listone 2025/26 — fallback temporaneo caricato automaticamente";

test("the private deposit wins over the static asset and says so, with its date", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
    kind: "serve",
    rows: SYNTHETIC_REMOTE_LISTONE_POOL,
    modifiedAt: SYNTHETIC_REMOTE_MODIFIED_AT,
  });
  await page.goto("/");

  for (const player of SYNTHETIC_REMOTE_LISTONE_POOL) {
    await expect(page.getByText(player.name, { exact: true })).toBeVisible();
  }
  // The static fixture is still served on its own path — it just lost.
  await expect(page.getByText(SYNTHETIC_LISTONE_POOL[0]!.name, { exact: true })).toHaveCount(0);

  const note = page.getByText(REMOTE_NOTE);
  await expect(note).toBeVisible();
  await expect(note).toContainText(`(dati aggiornati al ${SYNTHETIC_REMOTE_MODIFIED_AT_LABEL})`);
  await expect(note).toContainText("non usato dal motore decisionale");
  await expect(page.getByText(FALLBACK_NOTE)).toHaveCount(0);

  // A remote pool becomes the offline copy too, exactly like the static asset.
  const persisted = await page.evaluate(() => window.localStorage.getItem("fac_pool"));
  expect(JSON.parse(persisted ?? "[]")).toEqual(SYNTHETIC_REMOTE_LISTONE_POOL);
  expect(externalRequests).toEqual([]);
});

test("an unavailable deposit falls back to the static asset and keeps the fallback note", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, { kind: "unavailable" });
  await page.goto("/");

  for (const player of SYNTHETIC_LISTONE_POOL) {
    await expect(page.getByText(player.name, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(FALLBACK_NOTE)).toBeVisible();
  await expect(page.getByText(REMOTE_NOTE)).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test("a deposit answered by the SPA fallback (200 text/html) is refused, not shown as data", async ({ page, context }) => {
  const externalRequests: string[] = [];
  // No stub for /api/listone: the preview server answers it with index.html at
  // status 200. Only the content-type check keeps that out of the pool.
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, { kind: "passthrough" });
  await page.goto("/");

  for (const player of SYNTHETIC_LISTONE_POOL) {
    await expect(page.getByText(player.name, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(FALLBACK_NOTE)).toBeVisible();
  await expect(page.getByText(REMOTE_NOTE)).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test("a deposit payload the UI validator refuses leaves the static asset on screen", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
    kind: "serve",
    // A gated decision field — refused wholesale, never partially loaded.
    rows: [{ name: "Gino Vietato", role: "A", club: "ClubSette", quotation: 30, target_band: 42 }],
  });
  await page.goto("/");

  for (const player of SYNTHETIC_LISTONE_POOL) {
    await expect(page.getByText(player.name, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Gino Vietato", { exact: true })).toHaveCount(0);
  await expect(page.getByText(FALLBACK_NOTE)).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("the served index is on screen with its quality label, its recipe version and an honest n/d", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
    kind: "serve",
    rows: SYNTHETIC_REMOTE_LISTONE_POOL_WITH_INDEX,
    modifiedAt: SYNTHETIC_REMOTE_MODIFIED_AT,
  });
  await page.goto("/");

  // Visible without opening the column picker.
  await expect(page.locator(".listone-table-head")).toContainText("Indice");

  const withVerdict = page.locator(".listone-row", { hasText: "Furio Remoto" });
  const withoutVerdict = page.locator(".listone-row", { hasText: "Elena Deposito" });
  // 72.5 is rounded for display only; the withheld verdict says n/d, not "—".
  await expect(withVerdict).toContainText("73");
  await expect(withoutVerdict).toContainText("n/d");

  // Quality label and recipe version come from the rows, not from the page.
  const indexNote = page.getByText("Indice:", { exact: false });
  await expect(indexNote).toContainText(SYNTHETIC_APPEAL_INDEX_QUALITY);
  await expect(indexNote).toContainText(SYNTHETIC_APPEAL_INDEX_RECIPE);
  await expect(indexNote).toContainText("1 con verdetto, 1 n/d");
  await expect(indexNote).toContainText("non usato dal motore decisionale");

  expect(externalRequests).toEqual([]);
});

test("an index without its quality label is refused, index and rows together", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
    kind: "serve",
    rows: [
      {
        name: "Gino SenzaEtichetta",
        role: "A",
        club: "ClubOtto",
        quotation: 30,
        appealIndex: { score: 90, quality: "", recipe: SYNTHETIC_APPEAL_INDEX_RECIPE, components: { appetibilitaBase: 90 } },
      },
    ],
  });
  await page.goto("/");

  for (const player of SYNTHETIC_LISTONE_POOL) {
    await expect(page.getByText(player.name, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Gino SenzaEtichetta", { exact: true })).toHaveCount(0);
  await expect(page.getByText(FALLBACK_NOTE)).toBeVisible();
  await expect(page.locator(".listone-table-head")).not.toContainText("Indice");
  expect(externalRequests).toEqual([]);
});

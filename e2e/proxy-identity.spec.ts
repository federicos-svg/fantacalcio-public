import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

test("ambiguous proxy rows are rejected explicitly with no silent overwrite", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await page.getByRole("button", { name: /Caricamento manuale/ }).click();
  await page.getByText("Carica listone (JSON locale)").locator("input[type=file]").setInputFiles({
    name: "ambiguous-proxy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([
      { name: "Nìme Synthetic", role: "A", club: "Club Alfa" },
      { name: "Nime Synthetic", role: "A", club: "CLUB ALFA" },
    ])),
  });
  await expect(page.getByText(/Identità ambigua/)).toBeVisible();
  await expect(page.getByText(/Nessuna riga è stata caricata/)).toBeVisible();
  await expect(page.getByText("Nìme Synthetic", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Nime Synthetic", { exact: true })).toHaveCount(0);

  const fileInput = page.getByText("Carica listone (JSON locale)").locator("input[type=file]");
  await fileInput.setInputFiles({
    name: "duplicate-proxy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([
      { proxyId: "duplicate", name: "Synthetic One", role: "A", club: "Club Alfa" },
      { proxyId: "duplicate", name: "Synthetic Two", role: "D", club: "Club Beta" },
    ])),
  });
  await expect(page.getByText(/Identificatore duplicato/)).toBeVisible();
  await expect(page.getByText("Synthetic One", { exact: true })).toHaveCount(0);

  await fileInput.setInputFiles({
    name: "disambiguated-proxy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([
      { proxyId: "one", name: "Same Synthetic", role: "A", club: "Club Alfa" },
      { proxyId: "two", name: "Same Synthetic", role: "D", club: "Club Alfa" },
    ])),
  });
  await expect(page.getByText("Same Synthetic", { exact: true })).toHaveCount(2);
  expect(externalRequests).toEqual([]);
});

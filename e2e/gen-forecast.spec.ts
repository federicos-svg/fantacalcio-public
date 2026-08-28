import { expect, test, type Page } from "@playwright/test";
import {
  SYNTHETIC_GEN_FORECAST_ABSENT_PLAYER,
  SYNTHETIC_GEN_PROTOCOL,
  SYNTHETIC_GEN_RECIPE,
  SYNTHETIC_GEN_RUN,
  SYNTHETIC_LISTONE_POOL,
  SYNTHETIC_REMOTE_LISTONE_POOL_WITH_GEN_FORECAST,
} from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";
import {
  GEN_FORECAST_CAP_LABEL,
  GEN_FORECAST_CAP_MARKER,
  GEN_FORECAST_COLUMN_KEY_BY_TARGET,
  GEN_FORECAST_COLUMN_LABELS,
  VALUE_NOT_AVAILABLE,
} from "../src/ui/listone.js";
import { GEN_FORECAST_INSIGHT_ID } from "../src/ui/genForecastInsight.js";

// LE PREVISIONI DEL MOTORE SUL DOM VIVO — il payload arriva dallo STESSO canale
// dell'app reale (`GET /api/listone`, qui sintetico), non da una porta di
// servizio: la spec esercita il contratto di lettura, le colonne e la riga
// d'insight come le vedrà Pico.
//
// LE QUATTRO COSE CHE QUESTA SPEC DIFENDE:
//  1. la nota sotto la tabella DICHIARA le previsioni — ricetta, protocollo,
//     run e autorità, tutte parole del dato — anche quando le colonne sono
//     spente: una previsione che c'è e non si vede, senza una riga che lo dica,
//     è indistinguibile da una che non è arrivata;
//  2. le tre colonne NON sono accese di default (l'elenco di Pico del
//     2026-08-24 decide chi è acceso) e si accendono dal pannello;
//  3. accese, dicono i numeri con l'arrotondamento della resa, il marcatore del
//     tetto degli esperti dove il DATO lo dichiara, e `n/d` — mai uno zero —
//     sulla riga che il deposito non serve;
//  4. il riquadro INSIGHT GIOCATORE legge le previsioni del chiamato con
//     l'etichetta di autorità, e NON ne mostra nessuna per un giocatore che non
//     ne ha.
//
// Tutte le righe sono sintetiche e il guard di rete aborta qualunque altra cosa.

const WITH_CAP = SYNTHETIC_REMOTE_LISTONE_POOL_WITH_GEN_FORECAST[0]!;
const WITHOUT_CAP = SYNTHETIC_REMOTE_LISTONE_POOL_WITH_GEN_FORECAST[1]!;

async function boot(page: Page, context: Parameters<typeof installSyntheticNetworkGuard>[0]): Promise<string[]> {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
    kind: "serve",
    rows: SYNTHETIC_REMOTE_LISTONE_POOL_WITH_GEN_FORECAST,
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
  await expect(page.getByText(WITH_CAP.name, { exact: true })).toBeVisible();
  return externalRequests;
}

const headerTexts = (page: Page): Promise<string[]> =>
  page.locator(".listone-table-head > div").allTextContents();

function cell(page: Page, name: string, key: string) {
  return page.locator(".listone-row", { hasText: name }).locator(`[data-col="${key}"]`);
}

async function openColumnPanel(page: Page): Promise<void> {
  const toggle = page.locator("#listone-column-panel-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(page.locator("#listone-column-panel")).toBeVisible();
}

test("la nota dichiara le previsioni servite, e le colonne restano spente finché nessuno le accende", async ({
  page,
  context,
}) => {
  const externalRequests = await boot(page, context);

  const note = page.locator("#listone-gen-forecast-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText(SYNTHETIC_GEN_RECIPE);
  await expect(note).toContainText(SYNTHETIC_GEN_PROTOCOL);
  await expect(note).toContainText(SYNTHETIC_GEN_RUN);
  await expect(note).toContainText("advisory");
  await expect(note).toContainText("2 righe con previsione, 1 senza");
  await expect(note).toContainText("non usato dal motore decisionale");

  // Spente: nessuna delle tre etichette è nell'intestazione…
  const headers = await headerTexts(page);
  for (const label of Object.values(GEN_FORECAST_COLUMN_LABELS)) {
    expect(headers).not.toContain(label);
  }
  // …ma i tre interruttori ci sono, e dichiarano di essere spenti.
  await openColumnPanel(page);
  for (const key of Object.values(GEN_FORECAST_COLUMN_KEY_BY_TARGET)) {
    const toggle = page.locator(`#listone-column-toggle-${key}`);
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  }

  expect(externalRequests).toEqual([]);
});

test("accese, le tre colonne dicono i numeri arrotondati, il tetto degli esperti e n/d", async ({
  page,
  context,
}) => {
  const externalRequests = await boot(page, context);

  await openColumnPanel(page);
  for (const key of Object.values(GEN_FORECAST_COLUMN_KEY_BY_TARGET)) {
    await page.locator(`#listone-column-toggle-${key}`).click();
    await expect(page.locator(`#listone-column-toggle-${key}`)).toHaveAttribute("aria-pressed", "true");
  }

  // AL LORO POSTO: subito dopo le tre colonne d'identità (questo pool non porta
  // l'indice), nell'ordine dei bersagli.
  expect((await headerTexts(page)).slice(0, 6)).toEqual([
    "Nome",
    "Ruolo",
    "Squadra",
    GEN_FORECAST_COLUMN_LABELS.T2,
    GEN_FORECAST_COLUMN_LABELS.TN,
    GEN_FORECAST_COLUMN_LABELS.T1,
  ]);

  // L'ARROTONDAMENTO È DELLA RESA: 6,42 -> «6,4», 24,1 -> «24», 154,8 -> «155».
  await expect(cell(page, WITH_CAP.name, GEN_FORECAST_COLUMN_KEY_BY_TARGET.T2)).toHaveText("6,4");
  await expect(cell(page, WITH_CAP.name, GEN_FORECAST_COLUMN_KEY_BY_TARGET.T1)).toHaveText("155");
  await expect(cell(page, WITHOUT_CAP.name, GEN_FORECAST_COLUMN_KEY_BY_TARGET.T2)).toHaveText("5,9");
  await expect(cell(page, WITHOUT_CAP.name, GEN_FORECAST_COLUMN_KEY_BY_TARGET.TN)).toHaveText("30");

  // IL TETTO, dove il dato lo dichiara: il segno e la frase per esteso, che è
  // il canale di chi non ha un mouse.
  const cappedCell = cell(page, WITH_CAP.name, GEN_FORECAST_COLUMN_KEY_BY_TARGET.TN);
  await expect(cappedCell).toContainText(GEN_FORECAST_CAP_MARKER);
  await expect(cappedCell.locator(".listone-axis-tag__sr")).toHaveText(GEN_FORECAST_CAP_LABEL);
  // `capApplied: false` non porta nessun segno.
  await expect(
    cell(page, WITHOUT_CAP.name, GEN_FORECAST_COLUMN_KEY_BY_TARGET.TN).locator(".listone-axis-tag"),
  ).toHaveCount(0);

  // LA RIGA CHE IL DEPOSITO NON SERVE: `n/d`, mai uno zero.
  for (const key of Object.values(GEN_FORECAST_COLUMN_KEY_BY_TARGET)) {
    await expect(cell(page, SYNTHETIC_GEN_FORECAST_ABSENT_PLAYER, key)).toHaveText(VALUE_NOT_AVAILABLE);
  }

  expect(externalRequests).toEqual([]);
});

test("INSIGHT GIOCATORE legge le previsioni del chiamato, e non ne inventa per chi non ne ha", async ({
  page,
  context,
}) => {
  const externalRequests = await boot(page, context);

  await page.getByText(WITH_CAP.name, { exact: true }).click();
  await expect(page.locator("#player-insight-panel")).toBeVisible();

  const row = page.locator(`#${GEN_FORECAST_INSIGHT_ID}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText(`${GEN_FORECAST_COLUMN_LABELS.T2} 6,4`);
  await expect(row).toContainText(`${GEN_FORECAST_COLUMN_LABELS.TN} 24`);
  await expect(row).toContainText(`${GEN_FORECAST_COLUMN_LABELS.T1} 155`);
  await expect(row).toContainText(GEN_FORECAST_CAP_LABEL);
  // L'AUTORITÀ ARRIVA DAL DATO, e la riga non promette nulla di direttivo.
  await expect(row).toContainText(`previsioni di ricerca, advisory — ${SYNTHETIC_GEN_RECIPE}`);
  await expect(row).not.toContainText("consigl");
  // Il riquadro del valore resta chiuso a quattro slot: nessuna previsione
  // dentro (decisione registrata, src/valueBox.ts).
  await expect(page.locator("#value-box")).toHaveCount(0);

  // Un giocatore che il deposito non serve: nessuna riga, non una riga vuota.
  // Il Reset serve perché una selezione riempie la barra di ricerca e filtra il
  // listone: senza, l'altra riga non è più a schermo da cliccare.
  await page.getByRole("button", { name: /Reset/ }).click();
  await expect(page.getByText(SYNTHETIC_GEN_FORECAST_ABSENT_PLAYER, { exact: true })).toBeVisible();
  await page.getByText(SYNTHETIC_GEN_FORECAST_ABSENT_PLAYER, { exact: true }).click();
  await expect(page.locator("#player-insight-panel")).toBeVisible();
  await expect(page.locator(`#${GEN_FORECAST_INSIGHT_ID}`)).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";

// LA PAGINA FORMAZIONE, VISTA DAL BROWSER.
//
// Che cosa questa suite può misurare e che cosa no, detto prima per non far
// credere il contrario a chi la legge. Il core pubblico non ha nessuna porta
// verso la lega — è la regola di confine, non una mancanza di questa schermata
// — quindi il build che Playwright guida può mostrare UN solo stato del canale:
// «porta non collegata». È esattamente lo stato più importante da sorvegliare
// qui, perché è quello in cui la pagina potrebbe mentire mostrando una griglia
// vuota; i tre stati dell'invio e gli altri stati del canale sono provati senza
// browser, dove le porte si possono alimentare con fixture sintetiche
// (packages/league-channel-contract/tests/lineupCoachSurface.test.ts,
// src/formazioneChannel.test.ts).

test("Formazione è la prima voce della barra e la navigazione funziona", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  const voci = page.locator("nav span");
  await expect(voci).toHaveCount(4);
  await expect(voci.nth(0)).toHaveText("Formazione");
  await expect(voci.nth(1)).toHaveText("Asta");
  await expect(voci.nth(2)).toHaveText("Rose");
  await expect(voci.nth(3)).toHaveText("Impostazioni");

  await gotoScreen(page, "Formazione");
  await expect(page.locator("#formazione-screen")).toBeVisible();

  // E si torna indietro senza perdere niente: le altre schermate restano quelle.
  await gotoScreen(page, "Asta");
  await expect(page.locator("#formazione-screen")).toHaveCount(0);
  await gotoScreen(page, "Rose");
  await expect(page.locator(".teams-grid")).toBeVisible();
  await gotoScreen(page, "Formazione");
  await expect(page.locator("#formazione-screen")).toBeVisible();

  expect(externalRequests).toEqual([]);
});

test("quando la lega non è collegata la pagina lo dice, e non mostra nessuna formazione", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Formazione");

  // L'AVVISO PRENDE IL POSTO DELLA SQUADRA: c'è l'avviso, e non c'è nessun
  // pezzo di formazione accanto a lui. Una griglia vuota si leggerebbe «non ho
  // ancora schierato», che è una conclusione precisa e falsa.
  const avviso = page.locator("#formazione-stato-ignoto");
  await expect(avviso).toBeVisible();
  await expect(avviso).toContainText("non è collegato");
  await expect(avviso).toHaveAttribute("role", "alert");

  await expect(page.locator("[id^='formazione-competizione-']")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-salva-']")).toHaveCount(0);
  await expect(page.locator(".formazione-riga")).toHaveCount(0);
  await expect(page.locator("#formazione-stato-invio")).toHaveCount(0);

  // E la schermata d'asta resta raggiungibile: il ripiego non toglie niente.
  await gotoScreen(page, "Asta");
  await expect(page.locator("#listone-block")).toBeVisible();

  expect(externalRequests).toEqual([]);
});

test("la barra si raggiunge da tastiera, e la voce attiva si vede", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  const formazione = page.locator("nav span").nth(0);
  await expect(formazione).toHaveAttribute("role", "button");
  await formazione.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#formazione-screen")).toBeVisible();
  // La voce attiva non si distingue solo per colore: cambia anche il peso.
  await expect(formazione).toHaveCSS("font-weight", "700");

  expect(externalRequests).toEqual([]);
});

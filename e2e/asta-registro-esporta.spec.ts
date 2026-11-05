import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { E2E_PURCHASE_PRICE, E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { apriAsta, installSyntheticNetworkGuard, readLocalStorageRaw } from "./helpers.js";
import { LOG_STORAGE_KEY } from "../src/logRecovery.js";

// IL REGISTRO DELL'ASTA SI ESPORTA ANCORA — e il restyling dell'Asta non lo tocca.
//
// Il registro vive solo nel browser di chi lo ha scritto: se «Esporta» smettesse
// di scaricarlo, o toccasse ciò che c'è nello storage, i dati andrebbero persi
// senza che nessuno se ne accorga. La prova di portabilità
// (auction-log-portability.spec.ts) controlla il giro esporta → importa; questa
// guarda i tre punti che un lavoro di sola grafica potrebbe rompere senza
// romperla: (1) il pannello, i due comandi e i loro testi sono dove sono;
// (2) il file scaricato CONTIENE l'acquisto registrato; (3) l'esportazione non
// cambia di un byte la chiave del registro nel browser.

test("«Esporta» scarica il registro con l'acquisto dentro e non cambia lo storage", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await apriAsta(page);
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();

  const pannello = page.locator(".panel", { hasText: "STORICO ACQUISTI, SVINCOLI E SCAMBI" });
  await expect(pannello).toBeVisible();
  await expect(pannello.locator("#auction-log-export")).toHaveText("Esporta");
  await expect(pannello.locator("#auction-log-import")).toHaveText("Importa");

  const prima = await readLocalStorageRaw(page, LOG_STORAGE_KEY);
  expect(prima, "il registro è nello storage prima di esportare").not.toBeNull();

  const download = page.waitForEvent("download");
  await page.locator("#auction-log-export").click();
  const file = await (await download).path();
  const testo = await readFile(file!, "utf8");
  expect(() => JSON.parse(testo)).not.toThrow();
  expect(testo).toContain("dario-placeholder");
  expect(testo).toContain(String(E2E_PURCHASE_PRICE));

  expect(await readLocalStorageRaw(page, LOG_STORAGE_KEY), "l'esportazione non scrive nello storage").toBe(prima);
  expect(externalRequests).toEqual([]);
});

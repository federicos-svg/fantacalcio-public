import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";
import { PROVA_COMPETITION_ID, PROVA_PREFISSO_ID } from "../src/formazioneProva.js";

// LA FORMAZIONE SU UNO SCHERMO DI TELEFONO.
//
// Gira sul progetto `telefono` di playwright.config.ts — lo stesso Chromium con
// lo schermo, il rapporto di pixel e il tocco di un Pixel 5 — ed è l'unico file
// che ci gira: il costo si spende dove serve.
//
// PERCHÉ SERVE QUI E NON ALTROVE. Questa schermata disegna undici gettoni più la
// panchina più i non convocati, ed è quindi la candidata naturale a uscire dallo
// schermo in verticale. «Plausibile leggendo il CSS» non è una misura: un
// `flex-wrap` che non avvolge, un `min-width` di troppo o una tabella larga
// dentro un riquadro producono tutti la stessa cosa — una pagina che scorre in
// orizzontale — e nessuna delle tre si vede in un foglio di stile letto.
//
// CHE COSA SI MISURA, e non è «bello». Due cose sole, entrambe verificabili:
// che la pagina NON scorra in orizzontale, e che tutto ciò che serve a schierare
// — il campo, la barra dei moduli, la panchina, i comandi, il Salva — sia
// raggiungibile e PREMIBILE col dito. Un comando che c'è ma non si può toccare
// è un comando che non c'è.

/** Quanto la pagina sborda in orizzontale, in pixel. Zero è la norma. */
async function sbordoOrizzontale(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

/** Apre la pagina con la rete sorvegliata e accende la prova. */
async function apriSulTelefono(
  page: Page,
  context: Parameters<typeof installSyntheticNetworkGuard>[0],
  externalRequests: string[],
): Promise<void> {
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Formazione");
  await page.locator("#formazione-prova-entra").click();
  await expect(page.locator("#formazione-prova-marchio")).toBeVisible();
}

test("la pagina non scorre in orizzontale, né con l'avviso né col campo intero", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Formazione");

  // Prima con l'avviso al posto della squadra, che è ciò che questo build
  // mostra senza la prova: se sborda già qui, sborda per il guscio e non per il
  // campo, e saperlo cambia dove si guarda.
  expect(await sbordoOrizzontale(page), "con l'avviso al posto della squadra").toBe(0);

  await page.locator("#formazione-prova-entra").click();
  await expect(page.locator("#formazione-prova-marchio")).toBeVisible();

  // E poi col campo intero, la panchina e i non convocati a schermo.
  expect(await sbordoOrizzontale(page), "col campo intero").toBe(0);

  // Anche in fondo alla pagina: `scrollWidth` si misura sul documento, ma un
  // riquadro largo più in basso si porta dietro la pagina solo quando lo si
  // raggiunge in certi motori. Si scorre e si rimisura.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await sbordoOrizzontale(page), "in fondo alla pagina").toBe(0);

  expect(externalRequests).toEqual([]);
});

test("il campo ci sta: le quattro linee sono dentro lo schermo, e la porta resta in basso", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriSulTelefono(page, context, externalRequests);

  const campo = page.locator(`#formazione-titolari-${PROVA_COMPETITION_ID} .formazione-campo`);
  await expect(campo).toBeVisible();

  const larghezza = page.viewportSize()?.width ?? 0;
  expect(larghezza).toBeGreaterThan(0);
  const box = await campo.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(larghezza + 1);

  // Le quattro linee ci sono ancora — su uno schermo stretto i gettoni vanno a
  // capo dentro la loro linea, non si perde una linea — e la porta resta sotto
  // l'attacco: il campo si stringe, non si rovescia.
  const linee = campo.locator(".formazione-campo__linea");
  await expect(linee).toHaveCount(4);
  const porta = await linee.nth(0).boundingBox();
  const attacco = await linee.nth(3).boundingBox();
  expect(porta?.y ?? 0).toBeGreaterThan(attacco?.y ?? 0);

  // E ogni gettone sta dentro lo schermo, nessuno escluso.
  const gettoni = page.locator(".formazione-riga");
  const quanti = await gettoni.count();
  expect(quanti).toBeGreaterThan(15);
  for (let i = 0; i < quanti; i += 1) {
    const g = await gettoni.nth(i).boundingBox();
    expect(g?.x ?? -1, `gettone ${i} a sinistra`).toBeGreaterThanOrEqual(0);
    expect((g?.x ?? 0) + (g?.width ?? 0), `gettone ${i} a destra`).toBeLessThanOrEqual(
      larghezza + 1,
    );
  }

  expect(externalRequests).toEqual([]);
});

test("col dito si schiera davvero: modulo, scambio, panchina e Salva sono tutti premibili", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriSulTelefono(page, context, externalRequests);

  // LA BARRA DEI MODULI. Sette riquadri su uno schermo stretto: vanno a capo, e
  // si premono. `tap()` e non `click()` — su questo progetto il tocco c'è, ed è
  // il gesto con cui la pagina viene usata davvero.
  const modulo433 = page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}-433`);
  await modulo433.scrollIntoViewIfNeeded();
  await expect(modulo433).toBeVisible();
  await modulo433.tap();
  await expect(page.locator(`#formazione-titolari-${PROVA_COMPETITION_ID} .formazione-campo`))
    .toHaveAttribute("data-modulo", "433");
  await page.locator(`#formazione-annulla-${PROVA_COMPETITION_ID}`).tap();

  // IL GESTO IN DUE TEMPI, che sul telefono è l'unico che esiste: il
  // trascinamento nativo sotto un dito non c'è.
  const titolare = `${PROVA_PREFISSO_ID}Centrocampista-4`;
  const panchinaro = `${PROVA_PREFISSO_ID}Centrocampista-5`;
  const gettoneTitolare = page.locator(
    `#formazione-${PROVA_COMPETITION_ID}-${titolare}-gettone`,
  );
  await gettoneTitolare.scrollIntoViewIfNeeded();
  await gettoneTitolare.tap();
  await expect(
    page.locator(`#formazione-${PROVA_COMPETITION_ID}-${titolare}-gettone`),
  ).toHaveAttribute("aria-pressed", "true");

  const gettonePanchina = page.locator(
    `#formazione-${PROVA_COMPETITION_ID}-${panchinaro}-gettone`,
  );
  await gettonePanchina.scrollIntoViewIfNeeded();
  await gettonePanchina.tap();
  await expect(
    page.locator(`#formazione-titolari-${PROVA_COMPETITION_ID}`),
  ).toContainText(panchinaro);

  // I COMANDI DEL GETTONE, che sono i più piccoli della pagina: se il dito non
  // li prende, sul telefono la panchina non si riordina.
  const su = page.locator(`#formazione-${PROVA_COMPETITION_ID}-${titolare}-panchina-su`);
  await su.scrollIntoViewIfNeeded();
  await expect(su).toBeVisible();
  await su.tap();

  // I NON CONVOCATI e il salvataggio, in fondo.
  await expect(page.locator(`#formazione-fuori-${PROVA_COMPETITION_ID}`)).toBeVisible();
  const salva = page.locator(`#formazione-salva-${PROVA_COMPETITION_ID}`);
  await salva.scrollIntoViewIfNeeded();
  await expect(salva).toBeVisible();
  await salva.tap();
  await expect(page.locator("#formazione-stato-invio")).toBeVisible();

  // E dopo tutto questo la pagina continua a non scorrere in orizzontale.
  expect(await sbordoOrizzontale(page)).toBe(0);

  expect(externalRequests).toEqual([]);
});

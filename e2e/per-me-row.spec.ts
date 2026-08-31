import { expect, test } from "@playwright/test";
import { installSyntheticNetworkGuard } from "./helpers.js";
import { PER_ME_POOL } from "./fixtures/synthetic-per-me.js";
import { PER_ME_TITLE_SHORT } from "../src/ui/perMeRow.js";

// «PER ME» SENZA PIANO — l'unico stato che questo sottoblocco può raggiungere.
//
// CHE COSA C'ERA QUI PRIMA, e perché non c'è più. Questa spec percorreva la
// catena intera del gesto — clic, tastiera, dito, fino alla schermata d'asta con
// QUEL giocatore — su una scena che seminava in `localStorage` un piano rosa
// dichiarato. Il pannello PIANO ROSA e la sua persistenza sono stati rimossi:
// non esiste più un posto in cui una dichiarazione nasca, quindi
// `perMeCandidates` risponde `plan-absent` a ogni chiamata e nessuna riga «per
// me» arriva mai a schermo. Tenere in piedi quei test seminando una chiave che
// nessuno rilegge non li avrebbe resi veri: li avrebbe resi verdi.
//
// DOVE VIVE ADESSO QUELLA COPERTURA. L'ordine dei candidati, i suoi criteri e i
// nove motivi di silenzio restano coperti a livello di modulo da
// src/perMeCandidates.test.ts, che chiama la funzione con una dichiarazione
// costruita nel test e non ha bisogno di una sorgente viva. Quello che si è
// perso è la catena end-to-end del gesto, e si perde perché il gesto non è
// raggiungibile: tornerà con la superficie che lo riporterà a schermo.

test("senza piano dichiarato il sottoblocco dice QUALE dichiarazione manca", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_POOL, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const empty = page.locator("#per-me-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toHaveAttribute("data-reason", "plan-absent");
  await expect(empty).toContainText("Nessun piano rosa dichiarato");
  await expect(empty).toContainText("Quel pannello è stato rimosso");
  await expect(page.locator("#per-me-rows")).toHaveCount(0);

  // SENZA POPOLAZIONE ORDINATA, IL BLOCCO NON RECITA PARAMETRI CHE NON HANNO
  // GOVERNATO NIENTE: niente nota, e l'occhiello è il solo nome.
  await expect(page.locator("#per-me-note")).toHaveCount(0);
  await expect(page.locator("#per-me-title")).toHaveText(PER_ME_TITLE_SHORT);

  // IL TITOLO C'È E NON SI DISEGNA — «Nascondi #per-me-title» (Pico,
  // 2026-08-31). Le due metà di questa pretesa non si possono separare, ed è
  // il motivo per cui stanno in un test solo:
  //
  //   a. NON OCCUPA LA VISTA. Il rettangolo è quello dell'idioma
  //      visually-hidden del repository (1×1 px, `clip-path: inset(50%)`), non
  //      una riga di testo alta 16 px. Un `display: none` passerebbe anche qui
  //      — ed è proprio quello che la lettera b vieta.
  //   b. DÀ ANCORA IL NOME AL BLOCCO. `aria-labelledby` punta a lui: se
  //      sparisse dal rendering, `#per-me-block` resterebbe SENZA nome
  //      accessibile, e nessuno se ne accorgerebbe guardando la pagina.
  const titleBox = await page
    .locator("#per-me-title")
    .evaluate((el) => el.getBoundingClientRect());
  expect(titleBox.height, "il titolo non occupa una riga a schermo").toBeLessThanOrEqual(1);
  expect(titleBox.width, "il titolo non occupa larghezza a schermo").toBeLessThanOrEqual(1);

  const accessibleName = await page.locator("#per-me-block").evaluate((el) => {
    const by = el.getAttribute("aria-labelledby") ?? "";
    return document.getElementById(by)?.textContent ?? null;
  });
  expect(accessibleName, "il sottoblocco ha ancora un nome accessibile").toBe(PER_ME_TITLE_SHORT);

  // E IL NOME CHE SI VEDE È QUELLO DI SOPRA, uno solo: l'occhiello che
  // intitola la sezione in cui questo sottoblocco vive è la ragione per cui il
  // titolo di qui era un doppione.
  await expect(page.locator("#suggested-player-mine-title")).toBeVisible();

  const emptyHeight = await page
    .locator("#per-me-block")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(
    emptyHeight,
    `il sottoblocco muto costa ${Math.round(emptyHeight)}px: era 120 quando è stato misurato, ` +
      `39 dal 2026-08-31 — 22,5 px in meno, la riga di titolo che non si disegna più`,
  ).toBeLessThan(150);

  expect(externalRequests).toEqual([]);
});

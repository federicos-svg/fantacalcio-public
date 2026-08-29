import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

// I QUATTRO INTERRUTTORI DI RUOLO sulla riga del titolo del listone.
//
// Richiesta di Pico, 2026-08-29: «inserisci qui 4 toggle inline per filtrare
// rapidamente P/D/C/A», e — sulla resa stretta — «per il mobile scegli la
// soluzione migliore».
//
// La fixture porta un giocatore per ruolo, il che rende il conteggio delle
// righe la misura diretta del filtro: quattro righe senza filtro, una sola
// con un ruolo acceso. Un pool con due difensori proverebbe la stessa cosa
// più debolmente, perché «due righe» non distingue «ha filtrato per D» da
// «ha filtrato per qualcos'altro che per caso ne lascia due».

const RIGHE = ".listone-row";

test("un interruttore filtra, e premerlo di nuovo lo spegne", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  const gruppo = page.locator("#listone-role-filter");
  const difensori = page.locator("#listone-role-filter-D");

  // Quattro interruttori, nessuno acceso: il listone li mostra tutti.
  await expect(gruppo.locator("button")).toHaveCount(4);
  await expect(page.locator(RIGHE)).toHaveCount(4);
  for (const r of ["P", "D", "C", "A"]) {
    await expect(page.locator(`#listone-role-filter-${r}`)).toHaveAttribute("aria-pressed", "false");
  }

  // Acceso: resta la sola riga di quel ruolo, e lo stato è dichiarato.
  await difensori.click();
  await expect(difensori).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(RIGHE)).toHaveCount(1);
  await expect(page.locator(RIGHE)).toContainText("Beatrice Fittizia");

  // UNO ALLA VOLTA: accendere un secondo spegne il primo. Non è una
  // limitazione da aggirare — il ruolo filtrato è lo stesso che l'asta usa per
  // i propri conti, e ne esiste uno solo.
  await page.locator("#listone-role-filter-A").click();
  await expect(difensori).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#listone-role-filter-A")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(RIGHE)).toHaveCount(1);
  await expect(page.locator(RIGHE)).toContainText("Dario Placeholder");

  // Premere quello già acceso torna a «tutti»: è ciò che rende quattro
  // bottoni sufficienti senza un quinto che dica «Tutti».
  await page.locator("#listone-role-filter-A").click();
  await expect(page.locator("#listone-role-filter-A")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(RIGHE)).toHaveCount(4);

  expect(externalRequests).toEqual([]);
});

test("gli interruttori e il menu «Ruolo» sono la stessa cosa, e non possono contraddirsi", async ({
  page,
  context,
}) => {
  // È l'asserzione che giustifica la scelta di NON dare agli interruttori uno
  // stato proprio. Con due stati separati la schermata avrebbe potuto dire
  // «solo difensori» col menu e «solo attaccanti» coi bottoni, e mostrare un
  // elenco vuoto che nessuno dei due controlli spiega.
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  const menu = page.locator("#search-role");

  // Dall'interruttore al menu.
  await page.locator("#listone-role-filter-C").click();
  await expect(menu).toHaveValue("C");

  // E dal menu all'interruttore.
  await menu.selectOption("P");
  await expect(page.locator("#listone-role-filter-P")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#listone-role-filter-C")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(RIGHE)).toHaveCount(1);
  await expect(page.locator(RIGHE)).toContainText("Aldo Prova");

  // «Tutti» dal menu spegne anche gli interruttori.
  await menu.selectOption("");
  for (const r of ["P", "D", "C", "A"]) {
    await expect(page.locator(`#listone-role-filter-${r}`)).toHaveAttribute("aria-pressed", "false");
  }
  await expect(page.locator(RIGHE)).toHaveCount(4);

  expect(externalRequests).toEqual([]);
});

test("i quattro restano su una riga sola, anche a 390px, e non fanno scorrere di lato", async ({
  page,
  context,
}) => {
  // La resa stretta che Pico ha lasciato decidere a me. `flex-wrap: nowrap`
  // sul gruppo: a mandare a capo è la RIGA DEL TITOLO, che porta gli
  // interruttori sotto al titolo tutti insieme — non il gruppo, che spezzato
  // perderebbe proprio l'informazione che porta (quattro ruoli affiancati,
  // uno solo acceso).
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const cime = await page.locator("#listone-role-filter button").evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().top)),
  );
  expect(cime).toHaveLength(4);
  // Tutte e quattro alla stessa altezza: se uno fosse andato a capo, la sua
  // cima sarebbe più in basso di almeno l'altezza di un bottone.
  expect(new Set(cime).size, `le cime dei quattro interruttori: ${cime.join(", ")}`).toBe(1);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "nessuno scorrimento laterale a 390px",
  ).toBe(true);

  // E funzionano anche stretti: non sono decorazione che sopravvive al
  // riflow senza più fare il proprio mestiere.
  await page.locator("#listone-role-filter-P").click();
  await expect(page.locator(RIGHE)).toHaveCount(1);
  await expect(page.locator(RIGHE)).toContainText("Aldo Prova");

  expect(externalRequests).toEqual([]);
});

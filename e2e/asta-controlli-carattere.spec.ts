import { expect, test, type Page } from "@playwright/test";
import { E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { apriAsta, installSyntheticNetworkGuard } from "./helpers.js";

// L'ASTA HA IL CARATTERE DEL SITO, NON UNO SUO (restyling «Lavagna» dell'Asta).
//
// Fino al restyling l'Asta teneva il carattere di sistema di prima
// (`.app-shell[data-screen="asta"]` in layout.css, con `font-family: revert` sui
// controlli del modulo). Quell'eccezione è tolta: il testo dell'Asta è Barlow
// come quello di Formazione, Rose e Impostazioni, e i controlli del modulo
// ereditano la famiglia dal testo (`button, input, select, textarea { font-family:
// inherit }` di base.css). Questa prova tiene ferme tre cose, senza scrivere nel
// test un nome di carattere diverso da quello del sito:
//  1. il carattere della schermata d'Asta è quello del corpo del sito;
//  2. i controlli (compresi i due che dichiarano `inherit` da sé, `#critical-roster`
//     e `.moment-facts__toggle`, e quelli che non dichiarano niente, «Avvia» e il
//     campo prezzo) hanno la stessa famiglia della schermata: non esiste più un
//     controllo che torna al carattere di default del browser;
//  3. l'altezza dei due controlli con `inherit` dichiarato è quella che avrebbero
//     con `font-family: inherit` imposto in linea.

async function misura(page: Page, selettore: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (el === null) return null;
    const shell = el.closest<HTMLElement>(".app-shell");
    const prima = {
      famiglia: getComputedStyle(el).fontFamily,
      corpo: getComputedStyle(el).fontSize,
      altezza: el.getBoundingClientRect().height,
    };
    const stile = el.getAttribute("style");
    el.style.setProperty("font-family", "inherit", "important");
    const conInherit = { famiglia: getComputedStyle(el).fontFamily, altezza: el.getBoundingClientRect().height };
    if (stile === null) el.removeAttribute("style");
    else el.setAttribute("style", stile);
    return {
      ...prima,
      famigliaSchermata: shell === null ? null : getComputedStyle(shell).fontFamily,
      schermata: shell?.dataset.screen ?? null,
      conInherit,
    };
  }, selettore);
}

async function controlla(page: Page, selettore: string): Promise<void> {
  const m = await misura(page, selettore);
  expect(m, `${selettore} esiste nell'Asta`).not.toBeNull();
  expect(m?.schermata, `${selettore} sta nella schermata d'Asta`).toBe("asta");
  expect(m?.famiglia, `${selettore}: stesso carattere della schermata d'Asta`).toBe(m?.famigliaSchermata);
  expect(m?.famiglia, `${selettore}: già uguale a ciò che dà «inherit»`).toBe(m?.conInherit.famiglia);
  expect(m?.altezza, `${selettore}: stessa altezza che avrebbe con «inherit»`).toBe(m?.conInherit.altezza);
}

test("nell'Asta tutti i controlli hanno il carattere del sito, e quelli con `inherit` dichiarato restano alti quanto con `inherit`", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await apriAsta(page);

  // I due controlli stanno in momenti diversi dell'Asta: la fascia della rosa
  // (`#critical-roster`) nella chiamata, il riquadro «momento dell'asta»
  // (`.moment-facts__toggle`) dopo «Avvia». Si misurano dove ci sono.
  await expect(page.locator("#critical-roster")).toBeVisible();
  await controlla(page, "#critical-roster");

  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#assign-price")).toBeVisible();
  await expect(page.locator("#moment-facts-toggle")).toBeVisible();
  await controlla(page, ".moment-facts__toggle");

  // Un controllo che NON dichiara il suo carattere («Avvia», il campo prezzo)
  // prende ora quello della schermata, come tutti gli altri.
  const avvia = await misura(page, "#assign-price");
  expect(avvia, "il campo prezzo esiste").not.toBeNull();
  expect(avvia?.famiglia, "il campo prezzo eredita il carattere della schermata").toBe(avvia?.famigliaSchermata);
  const corpo = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(avvia?.famigliaSchermata, "la schermata d'Asta ha il carattere del corpo del sito").toBe(corpo);
  expect(externalRequests).toEqual([]);
});

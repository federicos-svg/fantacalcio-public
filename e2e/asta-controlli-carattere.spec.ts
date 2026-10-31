import { expect, test, type Page } from "@playwright/test";
import { E2E_TARGET_PLAYER, SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { apriAsta, installSyntheticNetworkGuard } from "./helpers.js";

// L'ASTA TIENE IL CARATTERE DI PRIMA, ANCHE NEI CONTROLLI CHE LO DICHIARANO.
//
// L'Asta non entra nel restyling: tiene il carattere di sistema di prima
// (`.app-shell[data-screen="asta"]` in layout.css) e i controlli del modulo
// tornano al carattere di default del browser con `font-family: revert`. Quella
// regola, scritta con la specificità dello schermo (0,2,1), batteva anche i
// `font-family: inherit` che l'Asta dichiara apposta su due controlli —
// `#critical-roster` (asta.css) e `.moment-facts__toggle` — e li portava ad
// Arial: il secondo perdeva 2px di altezza (28 → 26) rispetto a prima.
//
// COSA SI MISURA, SENZA UN CARATTERE SCRITTO NELLA PROVA (cambia da macchina a
// macchina: qui `system-ui` risolve su Inter, altrove su un altro):
//  1. il carattere calcolato di quei due controlli è IDENTICO a quello della
//     schermata d'Asta di cui sono figli — è ciò che `inherit` significa;
//  2. la loro altezza è la stessa che avrebbero con `font-family: inherit`
//     imposto in linea (`!important`): se la cascata dà loro un altro
//     carattere, l'altezza cambia con lui;
//  3. controllo positivo — un controllo che NON dichiara il suo carattere
//     («Avvia») resta al carattere di default del browser, diverso da quello
//     della schermata: la regola `revert` non è sparita, ha solo smesso di
//     travolgere ciò che la batteva per dichiarazione.

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

test("nell'Asta i controlli che dichiarano `inherit` lo mantengono: stesso carattere e stessa altezza di prima", async ({
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

  // Controllo positivo: «Avvia» non dichiara un carattere, quindi resta a quello
  // di default del browser (revert), diverso da quello della schermata.
  const avvia = await misura(page, "#assign-price");
  expect(avvia, "il campo prezzo esiste").not.toBeNull();
  expect(avvia?.famiglia, "i controlli senza carattere proprio restano al default del browser").not.toBe(
    avvia?.famigliaSchermata,
  );
  expect(externalRequests).toEqual([]);
});

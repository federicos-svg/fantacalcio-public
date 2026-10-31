import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

// IL MARCHIO DELLA BARRA NON TIENE L'EVENTO `load`.
//
// PERCHÉ QUESTA PROVA ESISTE. Un `<img>` con `src` assegnato alla creazione
// parte subito e ritarda `load` di 45–130 ms (misura nel commento di
// `MARCHIO_SRC`, src/main.ts). `page.goto` di Playwright torna al `load`, quindi
// ogni prova e2e ne parte più tardi di altrettanto, mentre il resto dell'avvio
// — compreso un deposito che risponde a tempo fisso — è già in corso: così la
// PROBE L di e2e/listone-identity-reconciliation.spec.ts (deposito a +1200 ms)
// diventava instabile. Il tempo non si può provare in modo deterministico; la
// CAUSA sì, e questa prova tiene ferma quella: nell'istante dell'evento `load`
// il marchio esiste già nel documento ma il file non gli è ancora stato dato, e
// subito dopo gli viene dato e si vede.
//
// L'osservatore sta in uno script di avvio, che gira prima del codice del sito:
// il suo ascoltatore di `load` è il primo registrato, quindi legge lo stato che
// il sito lascia al `load`, non quello che ha già riparato un attimo dopo.

test.describe("marchio della barra e evento load", () => {
  test("al load il file non è ancora assegnato; subito dopo sì, e il marchio si vede", async ({ page, context }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
      kind: "unavailable",
    });
    await page.addInitScript(() => {
      window.addEventListener("load", () => {
        const img = document.querySelector<HTMLImageElement>("img.topbar__marchio");
        (window as unknown as { __alLoad: { presente: boolean; conFile: boolean } }).__alLoad = {
          presente: img !== null,
          conFile: img?.hasAttribute("src") ?? false,
        };
      });
    });

    await page.goto("/");

    const alLoad = await page.evaluate(
      () => (window as unknown as { __alLoad?: { presente: boolean; conFile: boolean } }).__alLoad,
    );
    expect(alLoad, "il marchio deve esistere già quando scatta `load`").toEqual({
      presente: true,
      conFile: false,
    });

    // Dopo il `load` il file c'è, è caricato e ha le sue misure: non resta
    // nascosto per sempre da `:not([src])`.
    const marchio = page.locator("img.topbar__marchio");
    await expect(marchio).toHaveAttribute("src", "/brand/orizzontale-colori.svg");
    await expect(marchio).toBeVisible();
    await expect
      .poll(() => marchio.evaluate((img) => (img as HTMLImageElement).naturalWidth), { timeout: 5_000 })
      .toBeGreaterThan(0);
    // Il nome accessibile non cambia, e non dipende dal file.
    await expect(marchio).toHaveAttribute("alt", "Fantacalcio Copilot");
    expect(externalRequests).toEqual([]);
  });

  test("un render dopo il load dà il file al marchio subito, senza aspettare altro", async ({ page, context }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
      kind: "unavailable",
    });
    await page.goto("/");
    await expect(page.locator("img.topbar__marchio")).toHaveAttribute("src", /orizzontale-colori\.svg$/);

    // Cambiare schermata ricostruisce la barra: il marchio nuovo nasce col file.
    await page.locator("nav").getByText("Rose", { exact: true }).click();
    await expect(page.locator("img.topbar__marchio")).toHaveAttribute("src", /orizzontale-colori\.svg$/);
    await expect(page.locator("img.topbar__marchio")).toBeVisible();
    expect(externalRequests).toEqual([]);
  });
});

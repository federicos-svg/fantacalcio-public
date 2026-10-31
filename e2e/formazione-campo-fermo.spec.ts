import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";
import { PROVA_COMPETITION_ID } from "../src/formazioneProva.js";

// IL CAMPO RESTA FERMO SOLO SE CI STA NELLA FINESTRA.
//
// Sullo schermo largo il campo resta in vista mentre la colonna di destra scorre
// (`.fz-pitch[data-fermo]`). L'altezza del riquadro dipende dal modulo: a 1440×1000
// il 4-4-2 sta (circa 940px), gli altri moduli vanno a capo di più e arrivano a
// 1200–1300px. Un riquadro fermo più alto della finestra nasconde la sua parte
// bassa — la porta e l'avviso rosso «in campo, e senza un posto» che gli sta sotto
// — finché la colonna scorre. Questa prova tiene ferma la regola, per ogni modulo
// e per due altezze di finestra:
//   - se il riquadro è fermo, sta TUTTO nella finestra a ogni scorrimento;
//   - se non è fermo, è perché non ci starebbe (non si rinuncia per niente);
//   - e scorre come ogni altro pezzo della pagina, quindi l'avviso si raggiunge.

const MODULI = ["442", "541", "433", "352"] as const;
const MARGINE = 12;

async function apriProva(page: Page, context: Parameters<typeof installSyntheticNetworkGuard>[0]) {
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, []);
  await page.goto("/");
  await gotoScreen(page, "Formazione");
  await page.locator("#formazione-prova-entra").click();
  await expect(page.locator("#formazione-prova-marchio")).toBeVisible();
}

async function stato(page: Page) {
  return page.evaluate(() => {
    const pitch = document.querySelector<HTMLElement>(".fz-pitch");
    if (pitch === null) return null;
    const r = pitch.getBoundingClientRect();
    return {
      altezza: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      posizione: getComputedStyle(pitch).position,
      fermo: pitch.hasAttribute("data-fermo"),
      finestra: window.innerHeight,
    };
  });
}

for (const altezza of [1000, 1500]) {
  test(`a 1440×${altezza}: il campo è fermo solo se ci sta, e allora si vede tutto a ogni scorrimento`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 1440, height: altezza });
    await apriProva(page, context);

    const visti: string[] = [];
    let fermoVisto = 0;
    for (const modulo of MODULI) {
      const bottone = page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}-${modulo}`);
      await bottone.scrollIntoViewIfNeeded();
      if (await bottone.isEnabled()) await bottone.click();
      await expect(
        page.locator(`#formazione-titolari-${PROVA_COMPETITION_ID} .formazione-campo`),
      ).toHaveAttribute("data-modulo", modulo);

      // La misura arriva dopo il disegno (un fotogramma): si aspetta che `data-fermo`
      // dica la verità sull'altezza di adesso, invece di leggerlo a metà.
      await expect
        .poll(async () => {
          const s = await stato(page);
          return s !== null && s.fermo === (s.altezza + 2 * MARGINE <= s.finestra);
        }, { message: `${modulo}: data-fermo coincide con «ci sta nella finestra»` })
        .toBe(true);

      const s0 = await stato(page);
      expect(s0, `${modulo}: il riquadro del campo esiste`).not.toBeNull();
      visti.push(`${modulo}=${s0?.altezza}${s0?.fermo ? "F" : "s"}`);
      expect(s0?.posizione, `${modulo}: fermo ⇒ sticky, non fermo ⇒ statico`).toBe(
        s0?.fermo ? "sticky" : "static",
      );

      // Scorrendo: se è fermo, sta TUTTO nella finestra a ogni passo, quindi la
      // porta e l'eventuale avviso rosso si vedono; se non è fermo scorre con la
      // pagina e l'avviso, che sta dentro il riquadro, si raggiunge scorrendo.
      for (const y of [0, 300, 700, 1100, 1500]) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        const s = await stato(page);
        // «Fermo» vuol dire attaccato al bordo alto (top = margine). Quando la colonna
        // finisce il riquadro riparte con la pagina e il suo bordo alto sale sopra il
        // margine: lì non è più fermo e non gli si chiede di stare nella finestra.
        if (s?.fermo === true && Math.abs(s.top - MARGINE) <= 1) {
          expect(s.bottom, `${modulo}, scorrimento ${y}: il riquadro fermo sta tutto nella finestra`).toBeLessThanOrEqual(s.finestra);
          fermoVisto += 1;
        }
      }
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    expect(fermoVisto, "almeno una volta il riquadro è stato visto fermo, attaccato al bordo alto").toBeGreaterThan(0);

    if (altezza === 1000) {
      // A 1000px solo il 4-4-2 sta; a 1500 ci stanno tutti. Non si fa dipendere la
      // prova da queste cifre (cambiano con i caratteri), ma almeno una delle due
      // metà dev'essere stata vista a ogni altezza: senza questo la regola
      // «fermo solo se ci sta» potrebbe non essere mai stata messa alla prova.
      expect(visti.some((v) => v.endsWith("F")), `almeno un modulo fermo (${visti.join(", ")})`).toBe(true);
      expect(visti.some((v) => v.endsWith("s")), `almeno un modulo non fermo (${visti.join(", ")})`).toBe(true);
    } else {
      expect(visti.every((v) => v.endsWith("F")), `a 1500px ci stanno tutti (${visti.join(", ")})`).toBe(true);
    }
  });
}

import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";
import { PROVA_COMPETITION_ID } from "../src/formazioneProva.js";

// «FORMAZIONE NASCOSTA» E «VALE PER TUTTE LE COMPETIZIONI»: LA RIGA INTERA REAGISCE.
//
// La casella è di 20px e l'etichetta, da sola, alta quanto le sue righe di
// testo: toccare lo spazio fra l'una e l'altra, o sopra e sotto il testo, non
// faceva niente. La riga è alta almeno 44px (la misura del dito) e deve
// reagire su tutta la sua superficie. Il comportamento — la stessa casella, la
// stessa etichetta — non cambia: si prova cliccando in punti della riga che non
// sono né la casella né il testo, e leggendo la casella vera.

for (const [nome, prefisso] of [
  ["Formazione nascosta", "formazione-nascosta"],
  ["Vale per tutte le competizioni", "formazione-tutte-competizioni"],
] as const) {
  test(`«${nome}»: la riga è alta almeno 44px e reagisce su tutta la sua superficie`, async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    await page.goto("/");
    await gotoScreen(page, "Formazione");
    await page.locator("#formazione-prova-entra").click();

    const casella = page.locator(`#${prefisso}-${PROVA_COMPETITION_ID}`);
    const riga = page.locator(".fz-flag").filter({ has: casella });
    await casella.scrollIntoViewIfNeeded();
    // L'app ricostruisce il DOM a ogni cambio di stato: la riga può risultare
    // staccata per un istante e `boundingBox` restituire `null`. Si rilegge finché
    // c'è, invece di far dipendere la prova da quell'istante.
    await expect.poll(async () => (await riga.boundingBox()) !== null).toBe(true);
    const box = await riga.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    const x0 = box?.x ?? 0;
    const y0 = box?.y ?? 0;
    const w = box?.width ?? 0;
    const h = box?.height ?? 0;

    // Quattro punti che non sono né la casella (20px a sinistra) né la riga di
    // testo dell'etichetta: il bordo alto della riga, il bordo basso, lo spazio
    // fra la casella e il testo, e la fascia a destra del testo.
    const punti: Array<[string, number, number]> = [
      ["bordo alto", x0 + 120, y0 + 2],
      ["bordo basso", x0 + 120, y0 + h - 2],
      ["fra la casella e il testo", x0 + 28, y0 + h / 2],
      ["a destra del testo", x0 + w - 12, y0 + h / 2],
    ];
    let atteso = false;
    for (const [dove, x, y] of punti) {
      await page.mouse.click(x, y);
      atteso = !atteso;
      if (atteso) await expect(casella, dove).toBeChecked();
      else await expect(casella, dove).not.toBeChecked();
    }

    // E il gesto di sempre funziona ancora: la casella stessa, e il suo testo.
    await casella.check();
    await expect(casella).toBeChecked();
    await page.locator(`label[for="${prefisso}-${PROVA_COMPETITION_ID}"]`).click();
    await expect(casella).not.toBeChecked();
    expect(externalRequests).toEqual([]);
  });
}

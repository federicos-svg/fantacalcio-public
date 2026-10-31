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

test("la barra in alto sta su una riga sola, sotto i 56px, con le quattro voci", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  // Prima la barra andava a capo (marchio sopra, voci sotto) e saliva a 85px, il
  // doppio, su ogni schermata. Al telefono resta il simbolo del marchio e le
  // quattro voci su una riga: nessuna voce tolta, nessuna fuori schermo.
  const larghezza = page.viewportSize()?.width ?? 0;
  await expect(page.locator(".topbar")).toBeVisible();
  // UNA SOLA LETTURA, DENTRO LA PAGINA. L'app ricostruisce tutto il DOM a ogni
  // cambio di stato: una misura fatta con più chiamate (`boundingBox` sulla barra,
  // poi su ogni voce) può trovare la barra staccata fra una chiamata e l'altra e
  // restituire `null`. Qui barra e voci si leggono nello stesso istante.
  const barra = await page.evaluate(() => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const topbar = document.querySelector(".topbar");
    return {
      barra: topbar === null ? null : rect(topbar),
      voci: Array.from(document.querySelectorAll(".topbar__voce")).map(rect),
    };
  });
  expect(barra.barra?.height ?? 999, "altezza della barra").toBeLessThanOrEqual(56);

  expect(barra.voci, "le quattro voci ci sono tutte").toHaveLength(4);
  const topPrima = barra.voci[0]?.y ?? -1;
  for (const [i, b] of barra.voci.entries()) {
    expect(b.y, `la voce ${i} sta sulla stessa riga della prima`).toBeCloseTo(topPrima, 0);
    expect(b.x, `la voce ${i} a sinistra`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, `la voce ${i} a destra`).toBeLessThanOrEqual(larghezza);
    expect(b.height, `la voce ${i} è premibile (≥ 44px)`).toBeGreaterThanOrEqual(44);
  }
  expect(await sbordoOrizzontale(page), "la barra non fa scorrere in orizzontale").toBe(0);

  // Il simbolo c'è e il nome del prodotto resta nell'`alt`: togliere la scritta
  // non toglie il nome a chi non vede.
  const marchio = page.locator("img.topbar__marchio");
  await expect(marchio).toBeVisible();
  await expect(marchio).toHaveAttribute("alt", "Fantacalcio Copilot");
  expect(externalRequests).toEqual([]);
});

test("nel campo i comandi hanno il fondo pieno: le linee del campo non li attraversano", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriSulTelefono(page, context, externalRequests);

  // Le linee del campo (cerchio, aree, metà campo) stanno sotto i comandi; con un
  // fondo trasparente si vedevano attraverso il bottone e tagliavano le scritte.
  const campo = page.locator(`#formazione-titolari-${PROVA_COMPETITION_ID} .formazione-campo`);
  const fondi = await campo.evaluate((el) => {
    const trasparente = (c: string) => c === "transparent" || /^rgba\(.*,\s*0\)$/.test(c);
    const fuori: string[] = [];
    let quanti = 0;
    for (const nodo of el.querySelectorAll<HTMLElement>(".fz-mini, .fz-spunta")) {
      quanti += 1;
      const c = getComputedStyle(nodo).backgroundColor;
      if (trasparente(c)) fuori.push(`${nodo.className}: ${c}`);
    }
    return { quanti, fuori };
  });
  expect(fondi.quanti, "i comandi del campo ci sono").toBeGreaterThan(10);
  expect(fondi.fuori, "comandi del campo con fondo trasparente").toEqual([]);
  expect(externalRequests).toEqual([]);
});

/**
 * UNA SOLA LETTURA, DENTRO LA PAGINA, di ciò che interessa dell'allineamento del
 * campo: per ogni linea, la quota (in alto) della casella e del primo bottone di
 * ogni scheda, e quante righe occupa l'etichetta «Lo voglio in campo».
 */
async function leggiAllineamento(page: Page) {
  return page.evaluate(() => {
    const linee = Array.from(document.querySelectorAll(".formazione-campo__linea"));
    return {
      linee: linee.map((linea) =>
        Array.from(linea.querySelectorAll(".fz-unit")).map((unita) => {
          const casella = unita.querySelector("input[type=checkbox]")?.getBoundingClientRect().top ?? NaN;
          const bottone = unita.querySelector(".fz-mini")?.getBoundingClientRect().top ?? NaN;
          const etichetta = unita.querySelector<HTMLElement>(".fz-spunta label");
          const stile = etichetta === null ? null : getComputedStyle(etichetta);
          const righe =
            etichetta === null || stile === null
              ? NaN
              : Math.round(etichetta.getBoundingClientRect().height / parseFloat(stile.lineHeight));
          return {
            casella,
            bottone,
            righeEtichetta: righe,
            corpo: stile === null ? NaN : parseFloat(stile.fontSize),
          };
        }),
      ),
      nota: (() => {
        const nota = document.querySelector(".formazione-campo .fz-comandi__nota");
        return nota === null ? null : getComputedStyle(nota).backgroundColor;
      })(),
    };
  });
}

for (const modulo of ["442", "541"] as const) {
  test(`campo al telefono, modulo ${modulo}: le schede di una fila restano allineate, l'etichetta sta su due righe al più, la nota del portiere ha il fondo`, async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await apriSulTelefono(page, context, externalRequests);
    const bottoneModulo = page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}-${modulo}`);
    await bottoneModulo.scrollIntoViewIfNeeded();
    if (await bottoneModulo.isEnabled()) await bottoneModulo.tap();
    await expect(
      page.locator(`#formazione-titolari-${PROVA_COMPETITION_ID} .formazione-campo`),
    ).toHaveAttribute("data-modulo", modulo);

    // I nomi vanno a capo su un numero diverso di righe da una scheda all'altra
    // della stessa fila: la casella e «In panchina» devono stare comunque alla
    // stessa quota (i testi sono quelli, cambia solo la disposizione).
    const m = await leggiAllineamento(page);
    expect(m.linee, "quattro linee").toHaveLength(4);
    for (const [i, linea] of m.linee.entries()) {
      expect(linea.length, `la linea ${i} ha schede`).toBeGreaterThan(0);
      const c0 = linea[0]?.casella ?? NaN;
      const b0 = linea[0]?.bottone ?? NaN;
      for (const [k, scheda] of linea.entries()) {
        expect(scheda.casella, `linea ${i}, scheda ${k}: casella alla stessa quota`).toBeCloseTo(c0, 0);
        expect(scheda.bottone, `linea ${i}, scheda ${k}: «In panchina» alla stessa quota`).toBeCloseTo(b0, 0);
        expect(scheda.righeEtichetta, `linea ${i}, scheda ${k}: «Lo voglio in campo» su due righe al più`).toBeLessThanOrEqual(2);
        expect(scheda.corpo, `linea ${i}, scheda ${k}: corpo dell'etichetta ≥ 12px`).toBeGreaterThanOrEqual(12);
      }
    }

    // La nota «esce quando entra un altro portiere» sta dentro l'area del
    // portiere: senza fondo, le linee le passano attraverso le lettere.
    expect(m.nota, "la nota del portiere esiste").not.toBeNull();
    expect(m.nota, "la nota del portiere ha il fondo pieno").not.toMatch(/^rgba\(.*,\s*0\)$|^transparent$/);
    expect(externalRequests).toEqual([]);
  });
}

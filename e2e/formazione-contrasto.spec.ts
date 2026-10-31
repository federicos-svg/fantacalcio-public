import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  AA_NORMAL_TEXT,
  gotoScreen,
  installSyntheticNetworkGuard,
  measureAllText,
} from "./helpers.js";
import { PROVA_COMPETITION_ID, PROVA_PREFISSO_ID } from "../src/formazioneProva.js";

// LA PAGINA FORMAZIONE SI LEGGE E SI TOCCA — con i colori e i caratteri nuovi.
//
// PERCHÉ UN FILE A PARTE. La spazzata di contrasto di e2e/text-contrast-aa.spec.ts
// attraversa l'Asta, le Rose, le Impostazioni e il listone, ma non ha mai avuto
// una scena sulla Formazione: era l'unica schermata a restare fuori. Con la
// direzione «Lavagna» (menta al posto del blu, gesso al posto del bianco freddo,
// Barlow al posto del carattere di sistema) la pagina ha cambiato i colori di
// ogni testo e di ogni bordo, e la prima cosa che serve è una misura che lo
// dica. Questa non tocca la spazzata esistente: usa le stesse funzioni
// (`measureAllText`, da helpers.ts), la stessa soglia, le stesse tre caselle
// (misurato sopra soglia, misurato sotto soglia, non classificabile — le ultime
// due rosse), e le stesse esenzioni dichiarate in helpers.ts.
//
// DUE COSE SI MISURANO, LE DUE CHE LA DIREZIONE PROMETTE:
//  1. ogni testo ≥ 4,5:1 sul proprio fondo e ≥ 12px di corpo;
//  2. ogni comando alto almeno 44px — bottoni, tendina, righe delle caselle —
//     perché «dove lo spazio lo permette» non è una frase che si può misurare, e
//     questo sì: se un comando scende sotto, la prova dice quale.
//
// OGNI SCENA è raggiunta col gesto vero (si prende, si posa, si salva), mai con
// uno stato seminato: quello che si misura è quello che Pico vedrebbe. Le scene
// sono quelle in cui compaiono i colori che la schermata usa soltanto qui — il
// gettone in mano, il posto vuoto, la modifica non inviata, l'esito del
// salvataggio, il conflitto con una spunta, la blindatura — perché il testo che
// compare solo dopo un gesto è esattamente quello che una spazzata a pagina
// ferma non vede.

const SCHERMATA = "#formazione-screen, #formazione-screen *";

const CENTROCAMPISTA = `${PROVA_PREFISSO_ID}Centrocampista-4`;
const PANCHINARO = `${PROVA_PREFISSO_ID}Centrocampista-5`;
const ATTACCANTE = `${PROVA_PREFISSO_ID}Attaccante-1`;

function gettone(playerId: string): string {
  return `#formazione-${PROVA_COMPETITION_ID}-${playerId}-gettone`;
}

/** Quanti testi una scena ha misurato davvero, per non passare per vuoto. */
async function misuraScena(page: Page, scena: string): Promise<number> {
  const spazzata = await measureAllText(page, SCHERMATA);

  const nonClassificabili = spazzata
    .filter((m) => m.kind === "unclassified")
    .map((m) => `${scena}: ${m.reason} — ${m.label}`);
  expect(
    nonClassificabili,
    `testo non classificabile in «${scena}»: non si può dire leggibile, quindi si boccia`,
  ).toEqual([]);

  const misurati = spazzata.flatMap((m) => (m.kind === "measured" ? [m] : []));

  const sottoSoglia = misurati
    .filter((m) => m.exempt === null && m.ratio < AA_NORMAL_TEXT)
    .map(
      (m) =>
        `${scena}: ${m.fg} su ${m.bg} @opacity ${m.opacity.toFixed(2)} = ${m.ratio.toFixed(2)}:1 ` +
        `(${m.fontSize}px) — ${m.label}`,
    );
  expect(sottoSoglia, `contrasto sotto ${AA_NORMAL_TEXT}:1 in «${scena}»`).toEqual([]);

  // IL CORPO MINIMO È 12px. Vale anche per i comandi spenti: sono esenti dalla
  // soglia di contrasto (WCAG), non dalla leggibilità del corpo.
  const piccoli = misurati
    .filter((m) => m.fontSize < 12)
    .map((m) => `${scena}: ${m.fontSize}px — ${m.label} «${m.text}»`);
  expect(piccoli, `testo sotto i 12px in «${scena}»`).toEqual([]);

  return misurati.length;
}

/** Ogni comando a schermo è alto almeno 44px. */
async function expectComandiDa44(page: Page, scena: string): Promise<number> {
  const troppoBassi = await page.evaluate(() => {
    const out: string[] = [];
    let quanti = 0;
    const scope = document.querySelector("#formazione-screen");
    if (scope === null) return { quanti, out: ["manca #formazione-screen"] };
    for (const el of Array.from(
      scope.querySelectorAll("button, select, .fz-spunta, .fz-flag"),
    )) {
      if (el.getClientRects().length === 0) continue;
      const r = el.getBoundingClientRect();
      quanti += 1;
      // Mezzo pixel di tolleranza: l'arrotondamento del layout, non una misura.
      if (r.height < 43.5) {
        const id = el.id ? `#${el.id}` : `.${String(el.className).split(/\s+/).join(".")}`;
        out.push(`${id} alto ${r.height.toFixed(1)}px («${(el.textContent ?? "").trim().slice(0, 30)}»)`);
      }
    }
    return { quanti, out };
  });
  expect(troppoBassi.out, `comandi sotto i 44px in «${scena}»`).toEqual([]);
  return troppoBassi.quanti;
}

async function apriLaProva(
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

/** Le scene, in ordine, su qualunque larghezza. */
async function percorriLeScene(page: Page, larghezza: string): Promise<void> {
  let misurati = 0;
  let comandi = 0;
  const scena = async (nome: string): Promise<void> => {
    misurati += await misuraScena(page, `${nome} @${larghezza}`);
    comandi += await expectComandiDa44(page, `${nome} @${larghezza}`);
  };

  // 1. La pagina com'è appena accesa la prova.
  await scena("formazione/prova");

  // 2. Un conflitto con una spunta: il riquadro che CHIEDE. Prima di ogni altra
  //    mossa, sulla pagina com'è appena accesa, perché è la sequenza che la
  //    pagina già sorveglia (e2e/formazione-campo.spec.ts). La spunta resta
  //    messa: da qui in poi un giocatore porta anche «lo voglio in campo».
  await page
    .locator(`#formazione-spunta-${PROVA_COMPETITION_ID}-${PROVA_PREFISSO_ID}Centrocampista-1`)
    .check();
  await page.locator(gettone(`${PROVA_PREFISSO_ID}Centrocampista-1`)).click();
  await page.locator(gettone(PANCHINARO)).click();
  await expect(page.locator(`#formazione-conflitto-${PROVA_COMPETITION_ID}`)).toBeVisible();
  await scena("formazione/conflitto");
  await page.locator(`#formazione-conflitto-lascia-${PROVA_COMPETITION_ID}`).click();
  await scena("formazione/spunta-messa");

  // 3. Un giocatore in mano: il bordo e l'anello menta, e le destinazioni.
  await page.locator(gettone(CENTROCAMPISTA)).click();
  await expect(page.locator(gettone(CENTROCAMPISTA))).toHaveAttribute("aria-pressed", "true");
  await scena("formazione/in-mano");

  // 4. Lo scambio: la modifica non inviata, e poi l'esito del salvataggio.
  await page.locator(gettone(PANCHINARO)).click();
  await expect(page.locator(`#formazione-modifica-${PROVA_COMPETITION_ID}`)).toHaveAttribute(
    "data-modificata",
    "si",
  );
  await scena("formazione/modificata");
  await page.locator(`#formazione-salva-${PROVA_COMPETITION_ID}`).click();
  await expect(page.locator("#formazione-stato-invio")).toBeVisible();
  await scena("formazione/salvata");

  // 5. Un posto vuoto: il reparto scoperto, a vista.
  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-${ATTACCANTE}-in-panchina`).click();
  await expect(page.locator(".formazione-posto-vuoto")).toHaveCount(1);
  await scena("formazione/posto-vuoto");

  // 6. La blindatura: i comandi restano a vista, spenti — e leggibili.
  await page.locator(`#formazione-blindata-${PROVA_COMPETITION_ID}`).check();
  await expect(page.locator(`#formazione-blindata-${PROVA_COMPETITION_ID}`)).toBeChecked();
  await scena("formazione/blindata");

  // Non è passata per vuoto: una pagina con undici gettoni, la panchina, i non
  // convocati e i riquadri porta centinaia di testi e decine di comandi.
  expect(misurati, "la spazzata della Formazione non ha misurato quasi nulla").toBeGreaterThan(600);
  expect(comandi, "i comandi della Formazione non sono stati contati").toBeGreaterThan(150);
}

test("la Formazione si legge (≥ 4,5:1, corpo ≥ 12px) e si tocca (≥ 44px) sul computer", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriLaProva(page, context, externalRequests);
  await page.setViewportSize({ width: 1440, height: 900 });
  await percorriLeScene(page, "1440");
  expect(externalRequests).toEqual([]);
});

test("la Formazione si legge e si tocca anche sul telefono, dove il campo è a righe", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriLaProva(page, context, externalRequests);
  await page.setViewportSize({ width: 390, height: 844 });
  await percorriLeScene(page, "390");

  // IL CAMPO È UN CAMPO A RIGHE, e si misura: le quattro linee sono davvero
  // quattro righe sovrapposte (porta in basso), ogni linea sta su una riga sola
  // — i gettoni di una stessa linea hanno la stessa altezza di partenza — e
  // l'intero campo è molto più basso della colonna di undici gettoni che era.
  await page.locator(`#formazione-annulla-${PROVA_COMPETITION_ID}`).click();
  const campo = page.locator(`#formazione-titolari-${PROVA_COMPETITION_ID} .formazione-campo`);
  await expect(campo).toBeVisible();
  const righe = await campo.locator(".formazione-campo__linea").evaluateAll((linee) =>
    linee.map((linea) => {
      const tops = Array.from(linea.children).map((c) => Math.round(c.getBoundingClientRect().top));
      return { quanti: tops.length, tops: new Set(tops).size };
    }),
  );
  expect(righe, "quattro linee").toHaveLength(4);
  for (const [i, riga] of righe.entries()) {
    expect(riga.tops, `la linea ${i} sta su una riga sola (${riga.quanti} posti)`).toBe(1);
  }
  const alto = (await campo.boundingBox())?.height ?? 0;
  expect(alto, "il campo al telefono è una colonna lunga, non un campo").toBeLessThan(1100);
  expect(externalRequests).toEqual([]);
});

test("la pagina non scorre di lato a nessuna larghezza, dal telefono stretto allo schermo largo", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriLaProva(page, context, externalRequests);

  // Le larghezze sono quelle dove il disegno CAMBIA: 320 (il telefono più
  // stretto), 360 e 390 (telefoni), 561 (subito sopra il punto in cui il campo
  // smette di essere stretto), 768 (tablet), 1099 e 1100 (la colonna sola e
  // l'inizio delle due colonne), 1440 (computer). Un solo guasto di larghezza
  // — un `min-width` di troppo, un gettone che non si stringe — fa scorrere
  // TUTTA la pagina, ed è quello che qui si cerca.
  for (const larghezza of [320, 360, 390, 561, 768, 1099, 1100, 1440]) {
    await page.setViewportSize({ width: larghezza, height: 900 });
    const sbordo = await page.evaluate(() => {
      const doc = document.documentElement;
      return Math.max(0, doc.scrollWidth - doc.clientWidth);
    });
    expect(sbordo, `la pagina sborda di ${sbordo}px a ${larghezza}px`).toBe(0);

    // E nessun gettone esce dal campo: ognuno sta dentro il rettangolo del campo.
    const fuori = await page.evaluate(() => {
      const campo = document.querySelector(".formazione-campo");
      if (campo === null) return ["manca il campo"];
      const c = campo.getBoundingClientRect();
      const out: string[] = [];
      for (const el of Array.from(campo.querySelectorAll(".formazione-riga"))) {
        const r = el.getBoundingClientRect();
        if (r.left < c.left - 1 || r.right > c.right + 1) {
          out.push(`${el.id} esce di ${Math.max(c.left - r.left, r.right - c.right).toFixed(1)}px`);
        }
      }
      return out;
    });
    expect(fuori, `gettoni fuori dal campo a ${larghezza}px`).toEqual([]);
  }
  expect(externalRequests).toEqual([]);
});

test("senza la prova — la lega non risponde — i riquadri di avviso e l'invito si leggono e si toccano", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Formazione");
  await expect(page.locator("#formazione-prova-invito")).toBeVisible();
  for (const larghezza of [1440, 390]) {
    await page.setViewportSize({ width: larghezza, height: 900 });
    expect(await misuraScena(page, `formazione/senza-prova @${larghezza}`)).toBeGreaterThanOrEqual(5);
    expect(await expectComandiDa44(page, `formazione/senza-prova @${larghezza}`)).toBeGreaterThan(0);
  }
  expect(externalRequests).toEqual([]);
});

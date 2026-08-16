import { expect, test, type Page } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import { AA_NORMAL_TEXT, installSyntheticNetworkGuard, textContrast } from "./helpers.js";

// «QUANTO MI RESTA SE LO PRENDO» — la quarta domanda del tavolo, a schermo.
//
// Budget, Spesi e Slot dicono lo stato ADESSO. Nessun pannello diceva lo stato
// che si otterrebbe pagando la cifra che si sta digitando: a due secondi dal
// rilancio quel conto si faceva a mente. Il blocco «dopo l'acquisto» sta dentro
// la riga ASSEGNA A e risponde mentre il prezzo viene battuto.
//
// Cosa preme questa spec, e perché ogni riga è portante:
//  1. la proiezione SEGUE la cifra digitata, senza re-render (il campo del
//     prezzo non chiama render() apposta: perderebbe fuoco e cursore);
//  2. dichiara DI CHI PARLA e cambia soggetto con il menu ASSEGNA A — sulla
//     stessa schermata maxSafe() è già letta con due ricette diverse, quindi
//     una proiezione anonima sarebbe una terza lettura indistinguibile;
//  3. col campo vuoto o con una cifra non valida NON mostra un numero finto;
//  4. quando il prezzo rompe la riserva dura lo dice, e dice di quanto;
//  5. è VISIBILE nell'istante in cui serve, cioè con il campo del prezzo a
//     fuoco — il blocco «Prezzo da pagare» in cima allo schermo, in quel
//     momento, è già scorso fuori;
//  6. nessun output direttivo: contabilità, mai un consiglio.
//
// Ogni riga del listone è sintetica e la guardia di rete aborta tutto il resto.

const POOL: readonly ListonePlayer[] = [
  { name: "Primo Portiere", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Secondo Portiere", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Terzo Portiere", role: "P", club: "ClubDue", quotation: 5 },
  { name: "Quarto Portiere", role: "P", club: "ClubDue", quotation: 5 },
  { name: "Primo Difensore", role: "D", club: "ClubTre", quotation: 8 },
  { name: "Secondo Difensore", role: "D", club: "ClubTre", quotation: 8 },
  { name: "Primo Attaccante", role: "A", club: "ClubQuattro", quotation: 20 },
];

// docs/DECISIONS.md §D9 / docs/NO_GO.md §Prodotto: questo blocco è aritmetica
// su una cifra che l'operatore ha digitato. Nessuna di queste parole può
// comparirci sopra. «max» è nell'elenco per un secondo motivo: è la
// formulazione di un'altra corsia e qui non se ne introduce una seconda.
const DIRECTIVE =
  /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|consigl|dovresti|spingi|convien|appetib|valore|\bmax/i;

/** Apre il momento live su un giocatore, dalla schermata di chiamata. */
async function callPlayer(page: Page, name: string): Promise<void> {
  await page.getByText(name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#assign-price")).toBeVisible();
}

/** Registra un acquisto per il percorso ordinario del form. */
async function buy(page: Page, name: string, teamId: string, price: number): Promise<void> {
  await callPlayer(page, name);
  await page.locator("#assign-team").selectOption(teamId);
  await page.locator("#assign-price").fill(String(price));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#role-scarcity-panel")).toBeVisible();
}

async function boot(page: Page, context: Parameters<typeof installSyntheticNetworkGuard>[0]): Promise<string[]> {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  return externalRequests;
}

test("la proiezione segue la cifra digitata e dice di chi parla", async ({ page, context }) => {
  const externalRequests = await boot(page, context);
  await callPlayer(page, "Quarto Portiere");

  // Il blocco esiste, ed è uno solo.
  await expect(page.locator("#assign-after")).toHaveCount(1);
  await expect(page.locator("#assign-after")).toBeVisible();

  // Campo vuoto: nessun numero, e nemmeno un numero finto travestito da zero.
  await expect(page.locator("#assign-after-label")).toHaveText("dopo l'acquisto · Io");
  await expect(page.locator("#assign-after-value")).toHaveText("restano — cr e — slot");
  expect(await page.locator("#assign-after-value").textContent()).not.toMatch(/\d/);
  await expect(page.locator("#assign-after-alarm")).toBeHidden();

  // 30 cr su una rosa intonsa: 500 − 30 = 470 crediti, 28 − 1 = 27 slot.
  await page.locator("#assign-price").fill("30");
  await expect(page.locator("#assign-after-value")).toHaveText("restano 470 cr e 27 slot");
  await expect(page.locator("#assign-after-alarm")).toBeHidden();

  // La cifra cambia, la proiezione cambia con lei — senza che il campo perda il
  // fuoco: quel campo non chiama render() proprio per questo.
  await page.locator("#assign-price").fill("120");
  await expect(page.locator("#assign-after-value")).toHaveText("restano 380 cr e 27 slot");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("assign-price");

  // Torna a vuoto: torna a non dire niente, invece di lasciare l'ultimo numero.
  await page.locator("#assign-price").fill("");
  await expect(page.locator("#assign-after-value")).toHaveText("restano — cr e — slot");

  // Zero non è un prezzo (parsePositiveIntegerPrice lo rifiuta come il bottone).
  await page.locator("#assign-price").fill("0");
  await expect(page.locator("#assign-after-value")).toHaveText("restano — cr e — slot");

  expect(externalRequests).toEqual([]);
});

test("cambiando squadra nel menu la proiezione cambia soggetto e numeri", async ({
  page,
  context,
}) => {
  const externalRequests = await boot(page, context);

  // Squadra2 ha già speso 120 su un attaccante: da qui in poi i suoi numeri e i
  // miei non possono più coincidere per caso.
  await buy(page, "Primo Attaccante", "Squadra2", 120);

  await callPlayer(page, "Primo Difensore");
  await page.locator("#assign-price").fill("30");

  // La squadra selezionata all'apertura è la propria.
  await expect(page.locator("#assign-team")).toHaveValue("Io");
  await expect(page.locator("#assign-after-label")).toHaveText("dopo l'acquisto · Io");
  await expect(page.locator("#assign-after-value")).toHaveText("restano 470 cr e 27 slot");

  // Stessa cifra, altra squadra: 500 − 120 − 30 = 350 crediti, 27 − 1 = 26 slot.
  await page.locator("#assign-team").selectOption("Squadra2");
  await expect(page.locator("#assign-after-label")).toHaveText("dopo l'acquisto · Squadra2");
  await expect(page.locator("#assign-after-value")).toHaveText("restano 350 cr e 26 slot");

  // E si torna indietro: il soggetto è sempre quello del menu, non un ricordo.
  await page.locator("#assign-team").selectOption("Io");
  await expect(page.locator("#assign-after-label")).toHaveText("dopo l'acquisto · Io");
  await expect(page.locator("#assign-after-value")).toHaveText("restano 470 cr e 27 slot");

  expect(externalRequests).toEqual([]);
});

test("quando il prezzo rompe la riserva dura la proiezione lo dice, e di quanto", async ({
  page,
  context,
}) => {
  const externalRequests = await boot(page, context);
  await callPlayer(page, "Quarto Portiere");

  // 473 = 500 − 27 slot da riempire dopo questo: l'ultimo prezzo che lascia la
  // rosa completabile. Nessun allarme.
  await page.locator("#assign-price").fill("473");
  await expect(page.locator("#assign-after-value")).toHaveText("restano 27 cr e 27 slot");
  await expect(page.locator("#assign-after-alarm")).toBeHidden();
  await expect(page.locator("#assign-after")).not.toHaveClass(/assign-after--alarm/);

  // Un credito più in là la rosa non si completa più, e la riga lo dice.
  await page.locator("#assign-price").fill("474");
  await expect(page.locator("#assign-after-value")).toHaveText("restano 26 cr e 27 slot");
  await expect(page.locator("#assign-after-alarm")).toBeVisible();
  await expect(page.locator("#assign-after-alarm")).toHaveText(
    "rosa non completabile: manca 1 cr",
  );
  await expect(page.locator("#assign-after")).toHaveClass(/assign-after--alarm/);

  // E il bottone «Registra acquisto» dice la stessa cosa: la proiezione non può
  // promettere un acquisto che l'admission layer rifiuta.
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#assign-price")).toBeVisible(); // niente acquisto: si resta qui
  await expect(page.getByText(/hard reserve violata/)).toBeVisible();

  // Oltre il budget è un fatto diverso, e ha parole diverse.
  await page.locator("#assign-price").fill("600");
  await expect(page.locator("#assign-after-value")).toHaveText("restano −100 cr e 27 slot");
  await expect(page.locator("#assign-after-alarm")).toHaveText("oltre il budget di 100 cr");

  // Tornando sotto soglia l'allarme sparisce: non resta appiccicato.
  await page.locator("#assign-price").fill("10");
  await expect(page.locator("#assign-after-alarm")).toBeHidden();
  await expect(page.locator("#assign-after")).not.toHaveClass(/assign-after--alarm/);

  expect(externalRequests).toEqual([]);
});

test("la proiezione è a schermo proprio mentre si digita il prezzo", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const externalRequests = await boot(page, context);
  await callPlayer(page, "Quarto Portiere");

  // Questo è il motivo per cui il blocco NON sta accanto a «Prezzo da pagare»
  // in cima: con il campo del prezzo a fuoco quel blocco è già fuori schermo.
  await page.locator("#assign-price").fill("30");
  const geometry = await page.evaluate(() => {
    const rect = (id: string) => {
      const el = document.getElementById(id);
      return el === null ? null : el.getBoundingClientRect();
    };
    const after = rect("assign-after");
    const priceInput = rect("assign-price");
    const priceDisplay = rect("price-display");
    return {
      afterInViewport: after !== null && after.top >= 0 && after.bottom <= window.innerHeight,
      priceDisplayTop: priceDisplay?.top ?? null,
      sameBand: after !== null && priceInput !== null && Math.abs(after.top - priceInput.top) < 200,
      // La riga ASSEGNA A non deve essere cresciuta in altezza: il blocco sta
      // nello spazio orizzontale che quella riga aveva già libero.
      formRowHeight: document.querySelector(".form-row")?.getBoundingClientRect().height ?? 0,
    };
  });
  expect(geometry.afterInViewport, "la proiezione deve essere leggibile mentre si digita").toBe(
    true,
  );
  expect(geometry.sameBand, "la proiezione sta nella stessa banda del campo prezzo").toBe(true);
  expect(geometry.formRowHeight, "la riga ASSEGNA A non deve crescere").toBeLessThanOrEqual(60);
  // La misura che spiega la scelta: il blocco in cima è sopra il bordo alto.
  expect(geometry.priceDisplayTop).toBeLessThan(0);

  // Nessuno scorrimento laterale introdotto dal blocco.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  expect(externalRequests).toEqual([]);
});

test("contabilità, mai consiglio — e testo conforme AA", async ({ page, context }) => {
  await boot(page, context);
  await callPlayer(page, "Quarto Portiere");
  await page.locator("#assign-price").fill("474"); // stato con allarme: massimo testo a schermo

  const text = (await page.locator("#assign-after").textContent()) ?? "";
  expect(text.length).toBeGreaterThan(0);
  expect(text, `copia della proiezione: «${text}»`).not.toMatch(DIRECTIVE);

  for (const sel of ["#assign-after-label", "#assign-after-value", "#assign-after-alarm"]) {
    expect(await textContrast(page, sel), `contrasto ${sel}`).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  }
});

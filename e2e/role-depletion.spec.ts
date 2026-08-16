import { expect, test } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import { AA_NORMAL_TEXT, installSyntheticNetworkGuard, measureAllText } from "./helpers.js";

// IL RUOLO STASERA, SULLO SCHERMO.
//
// La decisione di Pico del 16/08/2026 — «solo il tavolo adesso; la versione che
// guarda anche il listino si valuta dopo l'asta» — governa questa superficie.
// Quello che questa spec verifica, e perché ogni verifica porta peso:
//
//  1. il riquadro esiste sulla schermata live e a inizio asta DICE che stasera
//     non è ancora successo niente, invece di mostrare uno zero muto;
//  2. il censimento dei posti c'è comunque, perché non è un campione: 8 squadre
//     x 7 posti da attaccante = 56, tutti liberi alla prima chiamata;
//  3. dopo due acquisti veri, registrati dal form come li registra Pico, i
//     numeri si muovono: quanti, da chi, a che prezzi;
//  4. NESSUNA QUOTAZIONE DI LISTINO compare nel riquadro. Le righe sintetiche
//     di questa spec portano quotazioni volutamente irripetibili (137, 111,
//     129): se una di quelle cifre comparisse nel pannello, la decisione
//     sarebbe stata aggirata e questa spec sarebbe rossa;
//  5. nessun output direttivo (docs/NO_GO.md §Prodotto);
//  6. il testo del riquadro sta sopra 4,5:1 su ogni sua riga.
//
// Ogni riga è sintetica e la guardia di rete blocca qualunque altra richiesta.

const POOL: readonly ListonePlayer[] = [
  { name: "Primo Attaccante", role: "A", club: "ClubUno", quotation: 137 },
  { name: "Secondo Attaccante", role: "A", club: "ClubUno", quotation: 111 },
  { name: "Terzo Attaccante", role: "A", club: "ClubDue", quotation: 129 },
  { name: "Primo Portiere", role: "P", club: "ClubTre", quotation: 111 },
];

/** Le quotazioni della fixture: nessuna di queste cifre può stare nel riquadro. */
const QUOTATIONS = ["137", "111", "129"];

const DIRECTIVE =
  /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|consigl|dovresti|spingi|ranking|classifica|punteggio/i;

test("il riquadro IL RUOLO STASERA misura il tavolo, e solo il tavolo", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const panel = page.locator("#role-depletion-panel");
  const headline = page.locator("#role-depletion-headline");

  // ── Asta appena aperta ────────────────────────────────────────────────────
  await page.getByText("Primo Attaccante", { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(panel).toBeVisible();

  // Il ruolo è nominato per esteso, non con la sola sigla.
  await expect(page.locator("#role-depletion-role")).toContainText("Attaccanti");

  // Il silenzio è una frase, e dice anche che cosa NON significa.
  await expect(headline).toContainText("non è ancora successo niente");
  await expect(headline).toContainText("Non vuol dire «il ruolo è pieno»");

  // Il censimento c'è lo stesso: non è un campione e non ha cold start.
  await expect(page.locator("#role-depletion-slots-total")).toHaveText("56");
  await expect(page.locator("#role-depletion-slots-open")).toHaveText("56");
  await expect(page.locator("#role-depletion-taken")).toHaveText("0");
  await expect(page.locator("#role-depletion-confirmed")).toHaveText("0");
  await expect(page.locator("#role-depletion-census-basis")).toContainText(
    "8 squadre su 8 cercano ancora almeno un posto di questo ruolo",
  );
  await expect(page.locator("#role-depletion-census-basis")).toContainText("la più scoperta ne ha 7");

  // Nessun elenco vuoto sotto la frase: sarebbe un elenco DI nessuno.
  await expect(page.locator("#role-depletion-buyers")).toHaveCount(0);

  // ── Due acquisti veri, dal form come li registra Pico ──────────────────────
  await page.locator("#assign-team").selectOption("Io");
  await page.locator("#assign-price").fill("40");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#search-player")).toBeVisible();

  await page.getByText("Secondo Attaccante", { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-team").selectOption("Squadra2");
  await page.locator("#assign-price").fill("25");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#search-player")).toBeVisible();

  // Terza chiamata: ora il riquadro ha due acquisti da raccontare.
  await page.getByText("Terzo Attaccante", { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(panel).toBeVisible();

  await expect(headline).toHaveText("2 attaccanti presi stasera, da 2 squadre, per 65 crediti.");

  // Chi ha preso, quanti e a che prezzi — i prezzi in chiaro, uno per uno.
  await expect(page.locator("#role-depletion-buyer-Io")).toContainText("1 preso · 40 cr");
  await expect(page.locator("#role-depletion-buyer-Io")).toContainText("40");
  await expect(page.locator("#role-depletion-buyer-Squadra2")).toContainText("1 preso · 25 cr");

  // Il censimento si è mosso con loro: due posti da attaccante in meno.
  await expect(page.locator("#role-depletion-slots-total")).toHaveText("56");
  await expect(page.locator("#role-depletion-slots-open")).toHaveText("54");
  await expect(page.locator("#role-depletion-taken")).toHaveText("2");
  await expect(page.locator("#role-depletion-confirmed")).toHaveText("0");

  // ── La guardia della decisione, sullo schermo ─────────────────────────────
  // Le quotazioni della fixture sono a schermo (il listone le mostra) ma NON
  // qui dentro: il riquadro non le ha mai viste.
  const panelText = (await panel.innerText()).replace(/\s+/g, " ");
  for (const quotation of QUOTATIONS) {
    expect(panelText, `la quotazione ${quotation} non deve raggiungere il riquadro`).not.toContain(
      quotation,
    );
  }
  // La nota dichiara la regola, ed è l'unico punto in cui la parola compare.
  await expect(page.locator("#role-depletion-note")).toContainText(
    "Le quotazioni del listino non entrano in questo conto, nemmeno per ordinare le righe",
  );

  // ── Nessun output direttivo, e nessuna banda qualitativa ──────────────────
  // «bassa/media/alta» è la forma che il motore della tensione produce e che
  // questa corsia ha lasciato fuori: se comparisse, comparirebbe qui.
  expect(panelText).not.toMatch(DIRECTIVE);
  expect(panelText).not.toMatch(/\btension[ae]\b/i);
  expect(panelText).not.toMatch(/\b(bassa|alta)\b/i);
  await expect(page.locator("#role-depletion-note")).toContainText("Nessuna banda, nessun punteggio");

  // ── Contrasto: ogni riga del riquadro sopra 4,5:1 ─────────────────────────
  const measured = await measureAllText(page, "#role-depletion-panel, #role-depletion-panel *");
  expect(measured.length).toBeGreaterThan(4);
  const tooLow = measured.filter((m) => m.ratio < AA_NORMAL_TEXT);
  expect(tooLow.map((m) => `${m.label} ${m.ratio.toFixed(2)}:1`)).toEqual([]);

  expect(externalRequests).toEqual([]);
});

// LO STATO «NESSUNA CHIAMATA» NON È COPERTO QUI, ed è una scelta dichiarata,
// non una dimenticanza: la schermata live si raggiunge SOLO da una riga del
// listone correlata, quindi su quella schermata il ruolo c'è sempre. Il ramo
// esiste perché il calcolo è pubblico e può ricevere `""` da un chiamante
// futuro, e resta verificato dove è verificabile davvero — src/roleDepletion.
// test.ts e src/ui/roleDepletion.test.ts, che lo esercitano direttamente
// invece di simularlo attraverso una UI che non lo produce.

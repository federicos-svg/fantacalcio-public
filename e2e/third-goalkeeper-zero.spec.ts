import { expect, test, type Page } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import {
  AA_NORMAL_TEXT,
  installSyntheticNetworkGuard,
  readLocalStorageJson,
  selectListoneRowByName,
  textContrast,
} from "./helpers.js";

// IL TERZO PORTIERE A 0, PREMUTO DAVVERO.
//
// LEAGUE_RULES §6 (decisione di Pico, 2026-08-15) ammette che il terzo — e
// ultimo — portiere di una squadra si chiuda a 0 crediti, quando l'operatore
// dichiara che le condizioni valgono. L'eccezione era coperta a livello di
// motore (packages/engine/tests/feasibility.test.ts) ma NESSUNA spec premeva
// il bottone: un percorso che SCRIVE nel registro degli acquisti restava senza
// prova end-to-end. Questa spec preme, e verifica l'effetto dove l'operatore lo
// legge — storico, budget, rosa, log persistito, e dopo un reload.
//
// Verifica anche le due cose che il bottone dice di sé:
//  - il suo PESO VISIVO (deve dipingersi come «Registra acquisto», perché fa la
//    stessa cosa: registrare un acquisto — non come un'azione minore);
//  - la MOTIVAZIONE dello 0 nello storico, che senza etichetta è
//    indistinguibile da un errore di battitura, e il suo contrasto misurato
//    sul DOM vivo (stessa soglia AA di e2e/text-contrast-aa.spec.ts).
//
// Tutte le righe del listone sono sintetiche e il network guard aborta
// qualunque altra richiesta.

const POOL: readonly ListonePlayer[] = [
  { name: "Portiere Alfa", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Portiere Beta", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Portiere Gamma", role: "P", club: "ClubDue", quotation: 5 },
  { name: "Mediano Delta", role: "C", club: "ClubTre", quotation: 12 },
];

const ZERO_BUTTON = "#declare-third-goalkeeper-zero";
const ZERO_BUTTON_LABEL = "Dichiaro e registro a 0 cr";

interface StoredEvent {
  readonly type: "PURCHASE" | "VOID";
  readonly seq: number;
  readonly price?: number;
  readonly playerId?: string;
  readonly targetSeq?: number;
  readonly thirdGoalkeeperZeroDeclared?: true;
}

/**
 * IL SEGNALE DI PRONTEZZA, e perché è questo.
 *
 * Serve una cosa sola: che il primo render dopo il reload sia ARRIVATO A
 * SCHERMO, prima di cercare una riga del listone. Non è un'asserzione sul
 * prodotto — è un cancello.
 *
 * Era `#role-scarcity-panel`. Quel pannello ha smesso di essere un elemento di
 * primo livello: vive dentro il blocco IL TAVOLO, che nasce CHIUSO, quindi sta
 * nel DOM ma `hidden`. Aspettarne la visibilità significherebbe aspettare per
 * sempre, e aprire il blocco per farlo comparire sarebbe far compiere al
 * cancello un gesto che l'operatore non compie.
 *
 * `#search-player` è equivalente e non ha quel problema: è il campo di ricerca
 * del momento CHIAMATA, cioè lo stesso momento e lo stesso passaggio di render
 * — l'intera schermata viene attaccata al documento in un colpo solo
 * (`app.appendChild(wrapper)`), quindi i due elementi diventavano visibili
 * nello stesso istante — ed è sempre visibile, senza gesti. È anche il segnale
 * che questa stessa spec già usa dopo ogni acquisto (`buy()`), e quello che le
 * spec sorelle usano su questa schermata.
 */
async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
}

/** Apre il momento LIVE su un giocatore, passando dal vero flusso di chiamata. */
async function call(page: Page, name: string): Promise<void> {
  await selectListoneRowByName(page, name);
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#assign-price")).toBeVisible();
}

/** Acquisto ordinario a prezzo digitato — la via che il bottone NON usa. */
async function buy(page: Page, name: string, price: number): Promise<void> {
  await call(page, name);
  await page.locator("#assign-price").fill(String(price));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#search-player")).toBeFocused();
}

function storico(page: Page) {
  return page.locator(".panel", { hasText: "STORICO ACQUISTI" });
}

test("il bottone del terzo portiere a 0 registra l'acquisto, e lo storico dice che quello 0 è una dichiarazione", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);
  await boot(page);

  // Due portieri in rosa: il prossimo P di questa squadra È il terzo slot.
  await buy(page, "Portiere Alfa", 10);
  await buy(page, "Portiere Beta", 5);
  await call(page, "Portiere Gamma");

  const zeroBtn = page.locator(ZERO_BUTTON);
  await expect(zeroBtn).toBeVisible();
  await expect(zeroBtn).toHaveText(ZERO_BUTTON_LABEL);

  // PESO VISIVO = COSA FA. Dipinto come «Registra acquisto», non come un
  // comando secondario: stesso fondo, e un fondo che esiste (la variante
  // fantasma è trasparente). Misurato sullo stile calcolato, non sulla classe:
  // rimettere `btn--secondary` fa fallire questa asserzione comunque si chiami.
  const paint = await page.evaluate((selector) => {
    const zero = document.querySelector(selector);
    const registra = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Registra acquisto",
    );
    if (zero === null || registra === undefined) return null;
    return {
      zeroBg: getComputedStyle(zero).backgroundColor,
      registraBg: getComputedStyle(registra).backgroundColor,
      zeroWeight: getComputedStyle(zero).fontWeight,
      registraWeight: getComputedStyle(registra).fontWeight,
    };
  }, ZERO_BUTTON);
  expect(paint, "servono entrambi i bottoni a schermo").not.toBeNull();
  expect(paint!.zeroBg, "il bottone che registra a 0 deve avere un fondo pieno").not.toBe(
    "rgba(0, 0, 0, 0)",
  );
  expect(paint!.zeroBg).toBe(paint!.registraBg);
  expect(paint!.zeroWeight).toBe(paint!.registraWeight);

  // L'ERRORE INDIRIZZA AL BOTTONE. Digitare 0 nel campo prezzo resta un
  // rifiuto (il minimo è 1 cr), ma qui non è più un vicolo cieco: il messaggio
  // nomina il gesto che quel caso lo registra, con le parole del bottone.
  await page.locator("#assign-price").fill("0");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  const priceError = page.getByText(/^Prezzo non valido/);
  await expect(priceError).toBeVisible();
  await expect(priceError).toContainText("Prezzo non valido: inserisci un numero intero positivo.");
  await expect(priceError).toContainText(ZERO_BUTTON_LABEL);
  // Il rifiuto non ha registrato niente: il log non esiste ancora oltre i due
  // acquisti precedenti.
  expect((await readLocalStorageJson<StoredEvent[]>(page, "fac_log"))?.length).toBe(2);

  // IL CLICK. Un solo gesto: dichiara e registra.
  await zeroBtn.click();
  await expect(page.locator("#search-player")).toBeFocused();

  // EFFETTO NEL REGISTRO, letto dove lo legge l'operatore.
  await expect(storico(page)).toContainText("Portiere Gamma");
  const declared = storico(page).locator(".badge--declared-zero");
  await expect(declared).toHaveText("terzo portiere dichiarato");
  // L'etichetta sta sulla riga di QUELL'acquisto, accanto alla cifra che
  // spiega — non è un cartello generico appeso al pannello.
  const declaredRow = declared.locator("xpath=..");
  await expect(declaredRow).toContainText("Portiere Gamma");
  await expect(declaredRow).toContainText("0 cr");

  // Il testo dell'etichetta regge la soglia AA come il resto dell'app.
  expect(
    await textContrast(page, ".badge--declared-zero"),
    "etichetta «terzo portiere dichiarato»",
  ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);

  // Contabilità: lo 0 non toglie crediti e chiude il reparto portieri.
  await expect(page.locator("#critical-budget")).toHaveText("485 cr");
  await expect(page.locator("#critical-spent")).toHaveText("15 cr");
  await expect(page.locator("#critical-roster")).toContainText("3/3");

  // Il log persistito porta la dichiarazione, non solo il prezzo.
  const log = await readLocalStorageJson<StoredEvent[]>(page, "fac_log");
  expect(log?.length).toBe(3);
  expect(log![2]).toMatchObject({
    type: "PURCHASE",
    price: 0,
    thirdGoalkeeperZeroDeclared: true,
  });
  // E nessun acquisto ordinario la porta.
  expect("thirdGoalkeeperZeroDeclared" in log![0]!).toBe(false);
  expect("thirdGoalkeeperZeroDeclared" in log![1]!).toBe(false);

  // Rileggendo domani (ricarica: stato ricostruito dal log) lo 0 si spiega
  // ancora da sé.
  await page.reload();
  await expect(storico(page).locator(".badge--declared-zero")).toHaveText("terzo portiere dichiarato");
  await expect(page.locator("#critical-budget")).toHaveText("485 cr");

  expect(externalRequests).toEqual([]);
});

test("al confine budgetResidual === otherSlots la schermata e il bottone dicono la stessa cosa", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);
  await boot(page);

  // ── Come si arriva al confine, con soli gesti ammessi ─────────────────────
  // Ogni acquisto ammesso lascia budgetResidual >= totalSlotsRemaining (è la
  // hard reserve). L'unico modo di scendere sotto è annullare un acquisto A
  // COSTO ZERO: restituisce lo slot senza restituire crediti. Da lì il budget
  // residuo copre esattamente gli ALTRI slot — max_safe vale 0 e non è
  // offribile — mentre il terzo portiere a 0 resta ammesso.
  await buy(page, "Portiere Alfa", 10); // 490 cr, 27 slot
  await buy(page, "Portiere Beta", 5); // 485 cr, 26 slot
  await call(page, "Portiere Gamma");
  await page.locator(ZERO_BUTTON).click(); // 485 cr, 25 slot
  await expect(page.locator("#critical-max-bid")).toContainText("461 cr");
  await buy(page, "Mediano Delta", 461); // esattamente max_safe -> 24 cr, 24 slot
  await expect(page.locator("#critical-budget")).toHaveText("24 cr");

  // Annullato lo 0: 24 cr per 25 slot, cioè budgetResidual === otherSlots.
  await page.locator("#undo-purchase-2").click();
  await expect(page.locator("#void-confirm-overlay")).toBeVisible();
  // Chi annulla uno 0 deve sapere se sta cancellando un errore o una scelta.
  await expect(page.locator("#void-confirm-overlay")).toContainText("terzo portiere dichiarato");
  await page.locator("#void-confirm-apply").click();
  await expect(page.locator("#void-confirm-overlay")).toHaveCount(0);
  await expect(page.locator("#critical-budget")).toHaveText("24 cr");
  await expect(page.locator("#critical-slots")).toHaveText("25");

  // ── La schermata ──────────────────────────────────────────────────────────
  await call(page, "Portiere Gamma");
  const note = page.locator("#max-safe-note");
  // «n/d» resta — è vero per qualunque prezzo digitabile — ma non è più
  // l'ultima parola: la nota dice cosa resta possibile.
  await expect(note).toContainText("n/d");
  await expect(note).toContainText("resta solo il terzo portiere a 0 cr");

  // ── E il comportamento ────────────────────────────────────────────────────
  // Il minimo digitabile (1 cr) è davvero rifiutato: «n/d» non è una bugia.
  await page.locator("#assign-price").fill("1");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.getByText(/hard reserve violata/)).toBeVisible();
  await expect(page.locator("#critical-budget")).toHaveText("24 cr");

  // Il gesto che la nota dichiara possibile lo è davvero — e non legge il
  // campo prezzo, che è rimasto a 1.
  await page.locator(ZERO_BUTTON).click();
  await expect(page.locator("#search-player")).toBeFocused();
  await expect(page.locator("#critical-budget")).toHaveText("24 cr"); // lo 0 non costa
  await expect(page.locator("#critical-roster")).toContainText("3/3");
  await expect(storico(page).locator(".badge--declared-zero")).toHaveText("terzo portiere dichiarato");

  const log = await readLocalStorageJson<StoredEvent[]>(page, "fac_log");
  expect(log?.map((e) => e.type)).toEqual(["PURCHASE", "PURCHASE", "PURCHASE", "PURCHASE", "VOID", "PURCHASE"]);
  expect(log![5]).toMatchObject({ type: "PURCHASE", price: 0, thirdGoalkeeperZeroDeclared: true });

  expect(externalRequests).toEqual([]);
});

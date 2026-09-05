import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";
import { PROVA_COMPETITION_ID, PROVA_SALVATAGGIO_MOTIVO } from "../src/formazioneProva.js";

// LA PAGINA FORMAZIONE, VISTA DAL BROWSER.
//
// Che cosa questa suite può misurare e che cosa no, detto prima per non far
// credere il contrario a chi la legge. Il core pubblico non ha nessuna porta
// verso la lega — è la regola di confine, non una mancanza di questa schermata
// — quindi il build che Playwright guida può mostrare UN solo stato del canale:
// «porta non collegata». È esattamente lo stato più importante da sorvegliare
// qui, perché è quello in cui la pagina potrebbe mentire mostrando una griglia
// vuota; i tre stati dell'invio e gli altri stati del canale sono provati senza
// browser, dove le porte si possono alimentare con fixture sintetiche
// (packages/league-channel-contract/tests/lineupCoachSurface.test.ts,
// src/formazioneChannel.test.ts).

test("Formazione è la prima voce della barra e la navigazione funziona", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  const voci = page.locator("nav span");
  await expect(voci).toHaveCount(4);
  await expect(voci.nth(0)).toHaveText("Formazione");
  await expect(voci.nth(1)).toHaveText("Asta");
  await expect(voci.nth(2)).toHaveText("Rose");
  await expect(voci.nth(3)).toHaveText("Impostazioni");

  await gotoScreen(page, "Formazione");
  await expect(page.locator("#formazione-screen")).toBeVisible();

  // E si torna indietro senza perdere niente: le altre schermate restano quelle.
  await gotoScreen(page, "Asta");
  await expect(page.locator("#formazione-screen")).toHaveCount(0);
  await gotoScreen(page, "Rose");
  await expect(page.locator(".teams-grid")).toBeVisible();
  await gotoScreen(page, "Formazione");
  await expect(page.locator("#formazione-screen")).toBeVisible();

  expect(externalRequests).toEqual([]);
});

test("quando la lega non è collegata la pagina lo dice, e non mostra nessuna formazione", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Formazione");

  // L'AVVISO PRENDE IL POSTO DELLA SQUADRA: c'è l'avviso, e non c'è nessun
  // pezzo di formazione accanto a lui. Una griglia vuota si leggerebbe «non ho
  // ancora schierato», che è una conclusione precisa e falsa.
  const avviso = page.locator("#formazione-stato-ignoto");
  await expect(avviso).toBeVisible();
  await expect(avviso).toContainText("non è collegato");
  await expect(avviso).toHaveAttribute("role", "alert");

  await expect(page.locator("[id^='formazione-competizione-']")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-salva-']")).toHaveCount(0);
  await expect(page.locator(".formazione-riga")).toHaveCount(0);
  await expect(page.locator("#formazione-stato-invio")).toHaveCount(0);

  // E NEMMENO I COMANDI DI MODIFICA. Da quando la formazione si può cambiare,
  // «l'avviso prende il posto della squadra» ha una superficie più larga da
  // difendere: una tendina del modulo, un «Annulla le modifiche» o una riga
  // «come letta dalla piattaforma» accanto all'avviso direbbero che una
  // formazione c'è, ed è la stessa bugia della griglia vuota.
  await expect(page.locator("[id^='formazione-modifica-']")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-comandi-']")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-annulla-']")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-modulo-schierato-']")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-panchina-']")).toHaveCount(0);

  // E la schermata d'asta resta raggiungibile: il ripiego non toglie niente.
  await gotoScreen(page, "Asta");
  await expect(page.locator("#listone-block")).toBeVisible();

  expect(externalRequests).toEqual([]);
});

test("la barra si raggiunge da tastiera, e la voce attiva si vede", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  const formazione = page.locator("nav span").nth(0);
  await expect(formazione).toHaveAttribute("role", "button");
  await formazione.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#formazione-screen")).toBeVisible();
  // La voce attiva non si distingue solo per colore: cambia anche il peso.
  await expect(formazione).toHaveCSS("font-weight", "700");

  expect(externalRequests).toEqual([]);
});

/* ────────────────────────────────────────────────────────────────────────────
   I DUE DIFETTI CHE SI VEDONO DAL BROWSER

   La modalità dimostrativa è l'unico stato in cui questo build mostra una
   formazione intera — la porta verso la lega non è collegata, ed è una regola di
   confine, non una mancanza — quindi è qui che si misurano le due cose che
   riguardano il DOM: che un esito di salvataggio non sopravviva alla mossa che
   lo smentisce, e che la porta d'invio non venga chiamata affatto.
   ──────────────────────────────────────────────────────────────────────────── */

/** Apre la pagina con la rete sorvegliata, va sulla Formazione, accende la prova. */
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

test("l'esito di un salvataggio non sopravvive alla modifica che lo smentisce", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriLaProva(page, context, externalRequests);

  // Salva: l'esito compare, e dice che la validazione è passata.
  await page.locator(`#formazione-salva-${PROVA_COMPETITION_ID}`).click();
  const stato = page.locator("#formazione-stato-invio");
  await expect(stato).toBeVisible();
  await expect(stato).toContainText("ha passato la validazione");

  // LA MOSSA CHE LO SMENTISCE. Il 343 con questa rosa non è schierabile: la
  // pagina lo dice, e il salvataggio si ferma.
  await page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}`).selectOption("343");
  await expect(page.locator(`#formazione-salva-impedito-${PROVA_COMPETITION_ID}`)).toContainText(
    "Non si può salvare",
  );

  // E QUI STAVA IL DIFETTO: le due frasi convivevano sullo stesso schermo, con
  // la rassicurante più in grande. L'esito non si aggiorna e non si corregge:
  // non c'è.
  await expect(stato).toHaveCount(0);
  const testo = (await page.locator("#formazione-screen").textContent()) ?? "";
  expect(testo).not.toContain("ha passato la validazione");

  // E TORNANDO ESATTAMENTE ALLA FORMAZIONE DI PRIMA l'esito torna, perché è la
  // sua: un esito è una frase su UNA formazione, non su un momento, e su quella
  // formazione è ancora vero. È la stessa regola letta dall'altro verso, e vale
  // anche per il giorno in cui la frase sarà «inviata e confermata» — se si
  // rimette in campo esattamente ciò che è stato inviato, quello è ciò che la
  // piattaforma ha.
  await page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}`).selectOption("442");
  await expect(page.locator(`#formazione-salva-${PROVA_COMPETITION_ID}`)).toBeEnabled();
  await expect(page.locator("#formazione-stato-invio")).toContainText("ha passato la validazione");

  // Ma basta una mossa qualunque — non solo il modulo — perché sparisca di nuovo.
  await page.locator(`#formazione-panchina-${PROVA_COMPETITION_ID} button`).first().click();
  await expect(page.locator("#formazione-stato-invio")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("in prova la porta d'invio non viene chiamata affatto, e dalla ragione si vede", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriLaProva(page, context, externalRequests);

  await page.locator(`#formazione-salva-${PROVA_COMPETITION_ID}`).click();
  const stato = page.locator("#formazione-stato-invio");
  await expect(stato).toBeVisible();

  // LA RAGIONE, ALLA LETTERA. Chiamare la porta d'invio in prova produrrebbe lo
  // stesso stato `da_inviare`, la stessa etichetta e lo stesso paragrafo: a
  // cambiare sarebbe SOLO questa riga, perché la porta risponderebbe «non sono
  // collegata». È il punto in cui la promessa «la porta non viene chiamata
  // affatto» smette di essere una frase in un commento.
  await expect(stato).toContainText(PROVA_SALVATAGGIO_MOTIVO);

  const testo = (await page.locator("#formazione-screen").textContent()) ?? "";
  expect(testo, "nessuna risposta della porta d'invio è arrivata a schermo").not.toContain(
    "porta di invio",
  );
  expect(testo, "nessuna risposta della porta d'invio è arrivata a schermo").not.toContain(
    "nulla è partito",
  );

  expect(externalRequests).toEqual([]);
});

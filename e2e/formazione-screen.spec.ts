import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";

// LA PAGINA FORMAZIONE, VISTA DAL BROWSER.
//
// Che cosa questa suite può misurare e che cosa no, detto prima per non far
// credere il contrario a chi la legge. La porta di lettura ora è collegata — a
// `/api/formazione`, un percorso dello stesso sito che il layer PRIVATO serve —
// quindi il build che Playwright guida la interroga davvero e riceve un `404`,
// perché qui quel percorso non esiste. Lo stato osservabile è quindi «la lega
// non ha risposto», ed è lo stato più importante da sorvegliare: è quello in cui
// la pagina potrebbe mentire mostrando una griglia vuota.
//
// **La riga che questa suite difende è cambiata di causa, non di sostanza.**
// Prima diceva «questa versione del sito non ha il canale»; ora dice «ho
// chiesto e non mi hanno risposto», che è la verità di questo build. Gli altri
// stati del canale — letto, illeggibile, giornata sbagliata — e i tre stati
// dell'invio sono provati senza browser, dove le porte si alimentano con
// fixture sintetiche (`packages/league-channel-contract/tests/*`,
// `src/formazioneCanaleRemoto.test.ts`, `src/formazioneLettura.test.ts`).

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

test("quando la lega non risponde la pagina lo dice, e non mostra nessuna formazione", async ({
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
  // «HO CHIESTO E NON MI HANNO RISPOSTO», non «qui il canale non c'è»: sono due
  // stati diversi con due rimedi diversi, e da quando la porta è collegata
  // questo build è nel primo. Il dettaglio porta il codice che il percorso ha
  // restituito, perché senza di lui «non ha risposto» non si diagnostica.
  await expect(avviso).toContainText("La lega non ha risposto");
  await expect(avviso).toContainText("404");
  await expect(avviso).toHaveAttribute("role", "alert");

  // E NESSUNA FASCIA DEL MOMENTO DELLA LETTURA: non c'è niente da datare, e una
  // riga «letta mai» sopra il nulla aggiungerebbe rumore a un messaggio chiaro.
  await expect(page.locator("#formazione-momento-lettura")).toHaveCount(0);

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

import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { depositoConSquadra, depositoRosaVuota } from "./fixtures/synthetic-formazione.js";
import { installSyntheticNetworkGuard } from "./helpers.js";

// DOVE ATTERRA CHI APRE IL SITO — e che nessuno lo sposti dopo.
//
// IL DIFETTO CHE QUESTE PROVE SORVEGLIANO. Il sito apriva sull'Asta, perché la
// prima pagina veniva decisa prima ancora di collegare la porta della lega;
// poi, a pagina già disegnata, la risposta arrivava e la pagina passava da sola
// alla Formazione — fino a cinque secondi dopo l'apertura, sotto gli occhi di
// chi non aveva toccato niente. La decisione presa è un'altra: la prima pagina
// è la Formazione, e quando ancora non si sa se c'è una squadra è la Formazione
// lo stesso, con l'avviso che dichiara di non sapere.
//
// PERCHÉ QUESTE PROVE HANNO BISOGNO DEL BROWSER. Tutto ciò che decide — quale
// schermata, con quale avviso — è già provato senza browser
// (`src/primaPagina.test.ts`, `packages/league-channel-contract/tests/`). Qui si
// misura l'unica cosa che quelle prove non possono vedere: che cosa ha davanti
// una persona nel secondo in cui apre il sito, e se ciò che ha davanti si muove
// da solo mentre lo guarda. Per misurarlo serve **il tempo**: il guard tiene la
// risposta della lega per aria quanto basta a guardarci dentro.

const ATTESA_LUNGA = 3000;
const ATTESA_BREVE = 1200;

test("il sito apre sulla Formazione mentre sta ancora chiedendo alla lega", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, undefined, {
    kind: "unavailable",
    delayMs: ATTESA_LUNGA,
  });
  await page.goto("/");

  // LA PRIMA PAGINA, prima che la lega abbia risposto: è la Formazione. Col
  // codice di prima qui c'era l'Asta, e questa riga non passava.
  await expect(page.locator("#formazione-screen")).toBeVisible();

  // E L'ATTESA SI VEDE: non una pagina vuota, non un guasto — «sto chiedendo».
  const attesa = page.locator("#formazione-lettura-in-corso");
  await expect(attesa).toBeVisible();
  await expect(attesa).toContainText("chiedendo");
  await expect(attesa).toHaveAttribute("role", "status");

  // MAI UNA GRIGLIA VUOTA NÉ UN CAMPO VERDE VUOTO: si leggerebbero «non ho
  // ancora schierato», che è una conclusione precisa e falsa.
  await expect(page.locator(".formazione-campo")).toHaveCount(0);
  await expect(page.locator(".formazione-riga")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-competizione-']")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-salva-']")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("la lega tace: la pagina lo dice, e resta la pagina", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, undefined, {
    kind: "unavailable",
    delayMs: ATTESA_BREVE,
  });
  await page.goto("/");
  await expect(page.locator("#formazione-lettura-in-corso")).toBeVisible();

  // L'attesa finisce male: la lettura non è disponibile. Cambia l'avviso —
  // «sto chiedendo» diventa «non hanno risposto», col codice per diagnosticare
  // — e NON cambia la schermata.
  const avviso = page.locator("#formazione-stato-ignoto");
  await expect(avviso).toBeVisible();
  await expect(avviso).toContainText("La lega non ha risposto");
  await expect(avviso).toContainText("404");
  await expect(page.locator("#formazione-lettura-in-corso")).toHaveCount(0);
  await expect(page.locator("#formazione-screen")).toBeVisible();
  await expect(page.locator(".formazione-campo")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("la lettura arriva e la pagina si riempie restando dov'è", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, undefined, {
    kind: "serve",
    deposit: depositoConSquadra(),
    delayMs: ATTESA_BREVE,
  });
  await page.goto("/");
  await expect(page.locator("#formazione-lettura-in-corso")).toBeVisible();

  // Quando la squadra arriva, arriva QUI: stessa schermata, l'avviso lascia il
  // posto alla formazione vera.
  await expect(page.locator("#formazione-competizione-c-campionato")).toBeVisible();
  await expect(page.locator("#formazione-screen")).toBeVisible();
  await expect(page.locator("#formazione-lettura-in-corso")).toHaveCount(0);
  await expect(page.locator("#formazione-stato-ignoto")).toHaveCount(0);
  await expect(page.locator(".formazione-campo").first()).toBeVisible();

  expect(externalRequests).toEqual([]);
});

test("una lettura con la squadra vuota non cambia la pagina sotto i piedi: la dichiara", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, undefined, {
    kind: "serve",
    deposit: depositoRosaVuota(),
    delayMs: ATTESA_BREVE,
  });
  await page.goto("/");
  await expect(page.locator("#formazione-screen")).toBeVisible();
  await expect(page.locator("#formazione-lettura-in-corso")).toBeVisible();

  // È IL CASO IN CUI L'APERTURA AVREBBE SCELTO L'ASTA — rosa vuota, niente da
  // schierare — e scoprirlo DOPO non è un motivo per spostare chi sta
  // guardando: la Formazione lo dichiara e resta.
  const dichiarazione = page.locator("#formazione-rosa-vuota");
  await expect(dichiarazione).toBeVisible();
  await expect(dichiarazione).toContainText("rosa è vuota");
  await expect(page.locator("#formazione-screen")).toBeVisible();

  // E la dichiarazione PRENDE IL POSTO della squadra: niente campo vuoto
  // accanto, niente pannelli di competizione, niente Salva.
  await expect(page.locator(".formazione-campo")).toHaveCount(0);
  await expect(page.locator(".formazione-riga")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-competizione-']")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-salva-']")).toHaveCount(0);

  // L'Asta resta a un clic, come dice la pagina: è una scelta di chi guarda,
  // non un salto deciso dal sito.
  await page.locator("nav").getByText("Asta", { exact: true }).click();
  await expect(page.locator("#formazione-screen")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

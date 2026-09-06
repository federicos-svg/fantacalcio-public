import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  depositoConNomeMancante,
  depositoConSquadra,
  SENZA_NOME_ID,
} from "./fixtures/synthetic-formazione.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";
import {
  PROVA_COMPETITION_ID,
  PROVA_MARCHIO_GETTONE,
  PROVA_PREFISSO_ID,
} from "../src/formazioneProva.js";

// IL NOME DEL GIOCATORE SUL GETTONE, VISTO DAL BROWSER.
//
// PERCHÉ QUESTA SUITE ESISTE. La schermata ha mostrato per mesi
// l'IDENTIFICATIVO interno della piattaforma — `4896`, `6151`, `572` — al posto
// del nome, in campo e in panchina. Non era un solo difetto: era una catena in
// cui ogni anello poteva perdere il nome per conto suo, e l'ultimo anello — il
// gettone — lo stampava letteralmente. Qui si misura l'ultimo anello, che è
// l'unico che un test senza browser non può guardare.
//
// LE TRE COSE CHE QUESTA SUITE TIENE FERME, e sono tre cose diverse:
//
//  1. un nome LETTO si vede, e l'identificativo non prende il suo posto;
//  2. un nome NON letto non diventa un buco e non diventa un finto nome: si
//     mostra l'identificativo E SI DICHIARA che il nome non c'è. «Assente» e
//     «vuoto» non sono la stessa cosa, e la differenza deve arrivare a chi
//     guarda, non fermarsi nel contratto;
//  3. in PROVA ogni gettone porta il marchio, e lo porta in una forma che NON
//     dipende da che cosa c'è scritto sopra. Finché la pagina stampava solo
//     identificativi, il marchio poteva vivere dentro l'identificativo
//     (`ESEMPIO-…`); adesso che mostra i nomi, quel marchio sparirebbe da solo
//     il primo giorno in cui il deposito porta i nomi — senza che nessuno abbia
//     sbagliato niente. Per questo la targa è un elemento suo, e per questo la
//     si misura come tale.

const CAMPIONATO = "c-campionato";

function gettone(competitionId: string, playerId: string): string {
  return `#formazione-${competitionId}-${playerId}-gettone`;
}

/** Apre la pagina con la rete sorvegliata e il deposito che le si vuole dare. */
async function apriConDeposito(
  page: Page,
  context: Parameters<typeof installSyntheticNetworkGuard>[0],
  externalRequests: string[],
  deposit: Record<string, unknown>,
): Promise<void> {
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, undefined, {
    kind: "serve",
    deposit,
  });
  await page.goto("/");
  await gotoScreen(page, "Formazione");
  await expect(page.locator(`#formazione-competizione-${CAMPIONATO}`)).toBeVisible();
}

test("il gettone porta il NOME del giocatore, non l'identificativo", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await apriConDeposito(page, context, externalRequests, depositoConSquadra());

  // `g-p1` è il portiere della fixture, e nella fixture ha un nome. Il gettone
  // deve dire quel nome.
  const portiere = page.locator(gettone(CAMPIONATO, "g-p1"));
  await expect(portiere).toBeVisible();
  const nome = portiere.locator(".formazione-gettone__nome");
  await expect(nome).toHaveText("Portiere Uno");
  await expect(nome).toHaveAttribute("data-nome", "letto");

  // E NON dice l'identificativo: è la metà della prova che si romperebbe se
  // qualcuno rimettesse `player.id` come testo del gettone. Senza questa riga
  // la prova passerebbe anche mostrando entrambi, che è lo stato che il
  // committente ha visto e segnalato.
  await expect(nome).not.toHaveText("g-p1");
  await expect(portiere.locator(".formazione-gettone__nome-ignoto")).toHaveCount(0);

  // Anche in panchina, che è l'altro posto in cui i numeri si vedevano.
  const panchinaro = page.locator(gettone(CAMPIONATO, "g-a3"));
  await expect(panchinaro.locator(".formazione-gettone__nome")).toHaveText("Attaccante Tre");

  expect(externalRequests).toEqual([]);
});

test("un giocatore SENZA nome osservato mostra l'identificativo E LO DICHIARA", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriConDeposito(page, context, externalRequests, depositoConNomeMancante());

  const senzaNome = page.locator(gettone(CAMPIONATO, SENZA_NOME_ID));
  await expect(senzaNome).toBeVisible();

  // L'identificativo si vede — non un buco, non una casella vuota.
  const nome = senzaNome.locator(".formazione-gettone__nome");
  await expect(nome).toHaveText(SENZA_NOME_ID);
  await expect(nome).toHaveAttribute("data-nome", "non-letto");

  // E LA DICHIARAZIONE C'È. È questa riga a distinguere «mostro un
  // identificativo perché il nome non c'è» da «mostro una stringa e chi guarda
  // la scambia per un nome»: senza di lei il gettone tornerebbe a essere
  // esattamente ciò che era prima, cioè un numero senza spiegazione.
  await expect(senzaNome.locator(".formazione-gettone__nome-ignoto")).toBeVisible();
  await expect(senzaNome.locator(".formazione-gettone__nome-ignoto")).toHaveText(
    "nome non letto dalla lega",
  );

  // I VICINI RESTANO NOMI. Il caso misto è quello vero, e la pagina deve
  // mostrare le due cose insieme senza confonderle.
  const conNome = page.locator(gettone(CAMPIONATO, "g-d2"));
  await expect(conNome.locator(".formazione-gettone__nome")).toHaveText("Difensore Due");
  await expect(conNome.locator(".formazione-gettone__nome-ignoto")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("il ruolo e i segni già presenti restano dove erano", async ({ page, context }) => {
  // Il nome si AGGIUNGE al gettone: non riorganizza ciò che c'era. `g-a3` è in
  // dubbio nella fixture, e quel segno deve restare accanto al nome.
  const externalRequests: string[] = [];
  await apriConDeposito(page, context, externalRequests, depositoConSquadra());

  const inDubbio = page.locator(gettone(CAMPIONATO, "g-a3"));
  await expect(inDubbio).toHaveAttribute("data-ruolo", "A");
  await expect(inDubbio).toContainText("in_dubbio");
  await expect(inDubbio.locator(".formazione-gettone__nome")).toHaveText("Attaccante Tre");

  expect(externalRequests).toEqual([]);
});

test("in prova OGNI gettone porta il marchio, e il marchio non sta dentro il testo", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Formazione");
  await page.locator("#formazione-prova-entra").click();
  await expect(page.locator("#formazione-prova-marchio")).toBeVisible();

  const gettoni = page.locator(`#formazione-competizione-${PROVA_COMPETITION_ID} .formazione-gettone`);
  const quanti = await gettoni.count();
  // La prova ha una rosa intera: se questo numero crollasse, le righe qui sotto
  // passerebbero a vuoto invece di misurare qualcosa.
  expect(quanti).toBeGreaterThan(10);

  // OGNI gettone, non «almeno uno»: un marchio che copre metà schermata non
  // protegge un ritaglio dell'altra metà.
  const targhe = page.locator(
    `#formazione-competizione-${PROVA_COMPETITION_ID} .formazione-gettone .formazione-gettone__prova`,
  );
  await expect(targhe).toHaveCount(quanti);
  await expect(targhe.first()).toHaveText(PROVA_MARCHIO_GETTONE);

  // E LA TARGA È UN ELEMENTO SUO, non un pezzo della stringa mostrata. È la
  // riga che rende la prova rossa se qualcuno tornasse ad affidare il marchio
  // al solo prefisso dell'identificativo: quel prefisso vive dentro un dato che
  // domani, con i nomi nel deposito, non si vedrebbe più.
  const primo = gettoni.first();
  const testoMostrato = (await primo.locator(".formazione-gettone__nome").textContent()) ?? "";
  const targaDelPrimo = primo.locator(".formazione-gettone__prova");
  await expect(targaDelPrimo).toBeVisible();
  await expect(targaDelPrimo).toHaveAttribute("data-prova", "attiva");
  // Il marchio resta leggibile ANCHE togliendo di mezzo l'identificativo: la
  // targa non è una sottostringa di ciò che il gettone mostra.
  expect(testoMostrato.replace(PROVA_PREFISSO_ID, "")).not.toContain(PROVA_MARCHIO_GETTONE);

  expect(externalRequests).toEqual([]);
});

test("fuori dalla prova nessun gettone porta la targa", async ({ page, context }) => {
  // Il contrario della riga sopra, e conta quanto lei: una targa che comparisse
  // sempre non direbbe più niente, e la prova sopra resterebbe verde per il
  // motivo sbagliato.
  const externalRequests: string[] = [];
  await apriConDeposito(page, context, externalRequests, depositoConSquadra());

  await expect(page.locator(".formazione-gettone__prova")).toHaveCount(0);
  await expect(page.locator("#formazione-prova-marchio")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

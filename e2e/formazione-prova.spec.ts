import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard, readLocalStorageRaw } from "./helpers.js";
import {
  FORMAZIONE_PROVA_STORAGE_KEY,
  PROVA_COMPETITION_ID,
  PROVA_ETICHETTA_SALVATAGGIO,
  PROVA_PREFISSO_ID,
  PROVA_TESTO_COMANDO,
  PROVA_TESTO_USCITA,
  PROVA_TITOLO,
} from "../src/formazioneProva.js";
import { FORMAZIONE_CONSTRAINTS_STORAGE_KEY } from "../src/formazioneConstraints.js";

// LA PROVA CON UNA SQUADRA DI ESEMPIO, VISTA DAL BROWSER.
//
// Che cosa questa suite misura, detto prima. Il core pubblico non ha nessuna
// porta verso la lega — è la regola di confine, non una mancanza — quindi il
// build che Playwright guida mostra un solo stato del canale: «porta non
// collegata». È lo stato in cui la prova esiste, ed è quindi qui che si può
// misurare tutto ciò che riguarda il DOM: che non si accenda da sola, che il
// marchio resti a schermo e non si possa chiudere, che ogni comando funzioni,
// che il salvataggio non dichiari mai un invio, che le spunte della prova non
// finiscano nell'archivio vero.
//
// Ciò che da qui NON si può misurare è il caso in cui la lega risponde davvero,
// perché in questo build non risponde nessuno: che i dati veri vincano sempre
// sulla prova è provato senza browser, dove il canale si alimenta con fixture
// sintetiche (src/formazioneProva.test.ts §«i dati veri vincono sempre»).

const COMPETIZIONE = `#formazione-competizione-${PROVA_COMPETITION_ID}`;

/** Apre la pagina con la rete sorvegliata e va sulla Formazione. */
async function apriFormazione(
  page: Page,
  context: Parameters<typeof installSyntheticNetworkGuard>[0],
  externalRequests: string[],
): Promise<void> {
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await gotoScreen(page, "Formazione");
}

/** Accende la prova con il comando, che è l'unico modo per accenderla. */
async function accendiLaProva(page: Page): Promise<void> {
  await page.locator("#formazione-prova-entra").click();
  await expect(page.locator("#formazione-prova-marchio")).toBeVisible();
}

test("la prova non si accende da sola: senza il comando la pagina è quella di prima", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriFormazione(page, context, externalRequests);

  // L'avviso resta al posto della squadra, e nessun dato di esempio compare.
  await expect(page.locator("#formazione-stato-ignoto")).toBeVisible();
  await expect(page.locator("#formazione-prova-marchio")).toHaveCount(0);
  await expect(page.locator(".formazione-riga")).toHaveCount(0);
  await expect(page.locator("[id^='formazione-competizione-']")).toHaveCount(0);
  await expect(page.getByText(PROVA_PREFISSO_ID, { exact: false })).toHaveCount(0);

  // Il comando c'è, è un bottone vero, e sta sotto l'avviso: la verità sul
  // canale resta la prima cosa che si legge.
  const comando = page.locator("#formazione-prova-entra");
  await expect(comando).toBeVisible();
  await expect(comando).toHaveText(PROVA_TESTO_COMANDO);
  await expect(comando).toHaveJSProperty("tagName", "BUTTON");

  expect(externalRequests).toEqual([]);
});

test("accesa la prova, il marchio è nel corpo della pagina e non si può chiudere", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriFormazione(page, context, externalRequests);
  await accendiLaProva(page);

  // IN TESTA E IN CODA: un ritaglio dello schermo non può mostrare la
  // formazione senza mostrare anche che è finta.
  const testa = page.locator("#formazione-prova-marchio");
  const coda = page.locator("#formazione-prova-marchio-coda");
  await expect(testa).toBeVisible();
  await expect(coda).toBeVisible();
  for (const marchio of [testa, coda]) {
    await expect(marchio).toContainText(PROVA_TITOLO);
    await expect(marchio).toContainText("non è la tua squadra");
    await expect(marchio).toContainText("non parte niente verso nessuna lega");
  }
  await expect(testa).toHaveAttribute("role", "alert");

  // NON RICHIUDIBILE: l'unico bottone del marchio è quello che spegne la prova,
  // cioè che toglie i dati insieme al marchio. Nessun «chiudi», nessuna «x».
  await expect(testa.locator("button")).toHaveCount(1);
  await expect(testa.locator("button")).toHaveText(PROVA_TESTO_USCITA);
  await expect(coda.locator("button")).toHaveCount(0);

  // E il marchio sta anche sul titolo del riquadro, che è attaccato alla
  // formazione che marca.
  await expect(page.locator(COMPETIZIONE)).toContainText(PROVA_TITOLO);

  // IL MARCHIO È NEL DATO: ogni riga di giocatore porta il prefisso addosso.
  const righe = page.locator(".formazione-riga");
  const quante = await righe.count();
  expect(quante).toBeGreaterThan(15);
  for (let i = 0; i < quante; i += 1) {
    await expect(righe.nth(i)).toContainText(PROVA_PREFISSO_ID);
  }

  // Con la prova accesa non si offre di riaccenderla.
  await expect(page.locator("#formazione-prova-entra")).toHaveCount(0);
  // E l'avviso «canale non collegato» ha lasciato il posto alla formazione:
  // non convivono, come non convivono avviso e squadra vera.
  await expect(page.locator("#formazione-stato-ignoto")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("il marchio resta dopo un ricaricamento: la prova non si spegne da sola", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriFormazione(page, context, externalRequests);
  await accendiLaProva(page);

  const salvato = await readLocalStorageRaw(page, FORMAZIONE_PROVA_STORAGE_KEY);
  expect(salvato).not.toBeNull();

  await page.reload();
  await gotoScreen(page, "Formazione");
  await expect(page.locator("#formazione-prova-marchio")).toBeVisible();
  await expect(page.locator(COMPETIZIONE)).toContainText(PROVA_TITOLO);

  expect(externalRequests).toEqual([]);
});

test("i comandi della formazione funzionano tutti sulla squadra di esempio", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriFormazione(page, context, externalRequests);
  await accendiLaProva(page);

  const titolari = page.locator(`#formazione-titolari-${PROVA_COMPETITION_ID}`);
  const panchina = page.locator(`#formazione-panchina-${PROVA_COMPETITION_ID}`);
  const fuori = page.locator(`#formazione-fuori-${PROVA_COMPETITION_ID}`);
  const modifica = page.locator(`#formazione-modifica-${PROVA_COMPETITION_ID}`);

  // Si parte da ciò che «la piattaforma riporta», e la formazione è legale.
  await expect(modifica).toHaveAttribute("data-modificata", "no");
  await expect(page.locator(`#formazione-legalita-${PROVA_COMPETITION_ID}`)).toHaveAttribute(
    "data-esito",
    "verificata",
  );

  // 1. SPOSTARE UN GIOCATORE: un titolare va in panchina, e la riga «modificata»
  //    lo dice subito.
  const unTitolare = `${PROVA_PREFISSO_ID}Centrocampista-4`;
  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-${unTitolare}-in-panchina`).click();
  await expect(modifica).toHaveAttribute("data-modificata", "si");
  await expect(panchina).toContainText(unTitolare);
  await expect(titolari).not.toContainText(unTitolare);

  // 2. RIENTRARE DALLA PANCHINA, e uscire dai convocati da lì.
  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-${unTitolare}-in-campo`).click();
  await expect(titolari).toContainText(unTitolare);
  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-${unTitolare}-in-panchina`).click();
  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-${unTitolare}-fuori`).click();
  await expect(fuori).toContainText(unTitolare);

  // 3. ANNULLARE: un gesto solo, e si torna esattamente alla formazione letta.
  await page.locator(`#formazione-annulla-${PROVA_COMPETITION_ID}`).click();
  await expect(modifica).toHaveAttribute("data-modificata", "no");
  await expect(titolari).toContainText(unTitolare);

  // 4. RIORDINARE LA PANCHINA: chi entra prima e chi entra dopo.
  const idSecondo = `${PROVA_PREFISSO_ID}Difensore-5`;
  await expect(panchina.locator(".formazione-riga").nth(1)).toContainText(idSecondo);
  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-${idSecondo}-panchina-su`).click();
  await expect(panchina.locator(".formazione-riga").nth(0)).toContainText(idSecondo);
  // Il primo della panchina non può salire ancora: il comando resta a vista,
  // disabilitato, invece di sparire.
  await expect(
    page.locator(`#formazione-${PROVA_COMPETITION_ID}-${idSecondo}-panchina-su`),
  ).toBeDisabled();
  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-${idSecondo}-panchina-giu`).click();
  await expect(panchina.locator(".formazione-riga").nth(1)).toContainText(idSecondo);

  // 5. IL RIFIUTO QUANDO LA MOSSA NON ESISTE: il portiere non lascia la porta
  //    vuota, e il comando disabilitato lo dice prima ancora del clic.
  const portiere = `${PROVA_PREFISSO_ID}Portiere-1`;
  await expect(
    page.locator(`#formazione-${PROVA_COMPETITION_ID}-${portiere}-in-panchina`),
  ).toBeDisabled();
  await expect(titolari).toContainText("esce quando entra un altro portiere");

  // 6. CAMBIARE MODULO, e vedere subito che l'undici non lo compone.
  const modulo = page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}`);
  await modulo.selectOption("352");
  await expect(modulo).toHaveValue("352");
  const legalita = page.locator(`#formazione-legalita-${PROVA_COMPETITION_ID}`);
  await expect(legalita).toContainText("COSÌ NON SI PUÒ MANDARE");
  await expect(page.locator(`#formazione-salva-${PROVA_COMPETITION_ID}`)).toBeDisabled();
  await expect(page.locator(`#formazione-salva-impedito-${PROVA_COMPETITION_ID}`)).toBeVisible();
  await page.locator(`#formazione-annulla-${PROVA_COMPETITION_ID}`).click();
  await expect(modulo).toHaveValue("442");

  // 7. LE DUE OPZIONI DELLA FORMAZIONE.
  const nascosta = page.locator(`#formazione-nascosta-${PROVA_COMPETITION_ID}`);
  await nascosta.check();
  await expect(nascosta).toBeChecked();
  await expect(modifica).toHaveAttribute("data-modificata", "si");
  const tutte = page.locator(`#formazione-tutte-competizioni-${PROVA_COMPETITION_ID}`);
  await tutte.check();
  await expect(legalita).toContainText("NON FERMA NIENTE");
  await page.locator(`#formazione-annulla-${PROVA_COMPETITION_ID}`).click();
  await expect(nascosta).not.toBeChecked();

  expect(externalRequests).toEqual([]);
});

test("le spunte, il blocco totale e i motivi di rifiuto si provano davvero", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriFormazione(page, context, externalRequests);
  await accendiLaProva(page);

  // LA SPUNTA SU CHI NON SCENDE IN CAMPO: l'avvertimento si vede, e non ferma
  // niente — la squadra è di chi la schiera.
  const indisponibile = `${PROVA_PREFISSO_ID}Attaccante-2`;
  await page.locator(`#formazione-spunta-${PROVA_COMPETITION_ID}-${indisponibile}`).check();
  const avvertimenti = page.locator(`#formazione-avvertimenti-vincoli-${PROVA_COMPETITION_ID}`);
  await expect(avvertimenti).toBeVisible();
  await expect(avvertimenti).toContainText("LOCKED_PLAYER_NEVER_PLAYS");
  await expect(avvertimenti).toContainText(indisponibile);
  await expect(page.locator(`#formazione-salva-${PROVA_COMPETITION_ID}`)).toBeEnabled();

  // IL CONFLITTO FRA UNA MODIFICA E UN VINCOLO si chiede, non si risolve da soli.
  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-${indisponibile}-in-panchina`).click();
  const conflitto = page.locator(`#formazione-conflitto-${PROVA_COMPETITION_ID}`);
  await expect(conflitto).toBeVisible();
  await expect(conflitto).toContainText("CONTRADDICE UN VINCOLO CHE HAI MESSO");
  await page.locator(`#formazione-conflitto-lascia-${PROVA_COMPETITION_ID}`).click();
  await expect(conflitto).toHaveCount(0);
  await expect(page.locator(`#formazione-titolari-${PROVA_COMPETITION_ID}`)).toContainText(
    indisponibile,
  );
  // Ripetuto, stavolta togliendo il vincolo: la mossa si esegue e la spunta va via.
  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-${indisponibile}-in-panchina`).click();
  await page.locator(`#formazione-conflitto-procedi-${PROVA_COMPETITION_ID}`).click();
  await expect(page.locator(`#formazione-panchina-${PROVA_COMPETITION_ID}`)).toContainText(
    indisponibile,
  );
  await expect(
    page.locator(`#formazione-spunta-${PROVA_COMPETITION_ID}-${indisponibile}`),
  ).not.toBeChecked();
  await page.locator(`#formazione-annulla-${PROVA_COMPETITION_ID}`).click();

  // IL MOTIVO DI RIFIUTO QUANDO I VINCOLI SONO IMPOSSIBILI: sei difensori
  // spuntati non entrano in nessuno dei sette moduli di §9.
  for (const numero of [1, 2, 3, 4, 5, 6]) {
    await page
      .locator(`#formazione-spunta-${PROVA_COMPETITION_ID}-${PROVA_PREFISSO_ID}Difensore-${numero}`)
      .check();
  }
  const impossibile = page.locator(`#formazione-impossibile-${PROVA_COMPETITION_ID}`);
  await expect(impossibile).toBeVisible();
  await expect(impossibile).toContainText("LA FORMAZIONE NON SI PUÒ FARE");
  await expect(page.locator(`#formazione-salva-${PROVA_COMPETITION_ID}`)).toBeDisabled();
  for (const numero of [5, 6]) {
    await page
      .locator(`#formazione-spunta-${PROVA_COMPETITION_ID}-${PROVA_PREFISSO_ID}Difensore-${numero}`)
      .uncheck();
  }
  await expect(impossibile).toHaveCount(0);

  // IL BLOCCO TOTALE: i comandi che cambierebbero la formazione si spengono e
  // restano a vista, e toglierlo li riaccende.
  const blindata = page.locator(`#formazione-blindata-${PROVA_COMPETITION_ID}`);
  await blindata.check();
  await expect(page.locator(COMPETIZIONE)).toContainText("Formazione blindata");
  const unTitolare = `${PROVA_PREFISSO_ID}Centrocampista-4`;
  await expect(
    page.locator(`#formazione-${PROVA_COMPETITION_ID}-${unTitolare}-in-panchina`),
  ).toBeDisabled();
  await expect(page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}`)).toBeDisabled();
  await blindata.uncheck();
  await expect(
    page.locator(`#formazione-${PROVA_COMPETITION_ID}-${unTitolare}-in-panchina`),
  ).toBeEnabled();

  expect(externalRequests).toEqual([]);
});

test("Salva in prova: la validazione gira, e non parte niente verso nessuna lega", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriFormazione(page, context, externalRequests);
  await accendiLaProva(page);

  await page.locator(`#formazione-salva-${PROVA_COMPETITION_ID}`).click();

  const stato = page.locator("#formazione-stato-invio");
  await expect(stato).toBeVisible();
  await expect(stato).toHaveAttribute("data-stato", "da_inviare");
  await expect(stato).toHaveAttribute("data-prova", "attiva");
  await expect(stato).toContainText(PROVA_ETICHETTA_SALVATAGGIO);
  await expect(stato).toContainText("Non è stato inviato niente");
  await expect(stato).toContainText("questa è una prova");

  // MAI «INVIATA», MAI «CONFERMATA»: né qui né altrove nella pagina.
  const testo = (await page.locator("#formazione-screen").textContent()) ?? "";
  expect(testo.toLowerCase()).not.toContain("inviata e confermata");
  expect(testo.toLowerCase()).not.toContain("inviata, esito ignoto");

  // Una formazione illegale si ferma prima, con il motivo: la validazione è
  // quella vera, non una scorciatoia della prova.
  await page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}`).selectOption("343");
  await expect(page.locator(`#formazione-salva-${PROVA_COMPETITION_ID}`)).toBeDisabled();
  await expect(page.locator(`#formazione-salva-impedito-${PROVA_COMPETITION_ID}`)).toContainText(
    "Non si può salvare",
  );

  expect(externalRequests).toEqual([]);
});

test("le spunte della prova non finiscono fra i vincoli della squadra vera", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriFormazione(page, context, externalRequests);

  // Si parte da un archivio dei vincoli veri che non esiste ancora.
  expect(await readLocalStorageRaw(page, FORMAZIONE_CONSTRAINTS_STORAGE_KEY)).toBeNull();

  await accendiLaProva(page);
  await page
    .locator(`#formazione-spunta-${PROVA_COMPETITION_ID}-${PROVA_PREFISSO_ID}Difensore-1`)
    .check();
  // Il modulo bloccato prima della blindatura: con la formazione blindata i
  // comandi che la cambierebbero si spengono, ed è il comportamento vero.
  await page.locator(`#formazione-modulo-${PROVA_COMPETITION_ID}`).selectOption("433");
  await page.locator(`#formazione-blindata-${PROVA_COMPETITION_ID}`).check();

  // Tre vincoli messi sulla squadra di esempio, e l'archivio vero è ancora vuoto.
  expect(await readLocalStorageRaw(page, FORMAZIONE_CONSTRAINTS_STORAGE_KEY)).toBeNull();
  const prova = await readLocalStorageRaw(page, FORMAZIONE_PROVA_STORAGE_KEY);
  expect(prova).not.toBeNull();
  expect(prova).not.toContain(PROVA_PREFISSO_ID);

  // E uscendo dalla prova non resta niente: né i vincoli della squadra finta,
  // né la squadra finta.
  await page.locator("#formazione-prova-esci").click();
  await expect(page.locator("#formazione-stato-ignoto")).toBeVisible();
  await expect(page.locator("#formazione-prova-marchio")).toHaveCount(0);
  await expect(page.locator(".formazione-riga")).toHaveCount(0);
  expect(await readLocalStorageRaw(page, FORMAZIONE_CONSTRAINTS_STORAGE_KEY)).toBeNull();

  // Rientrando, la squadra di esempio riparte pulita: i vincoli di prima erano
  // di una squadra che non esiste.
  await accendiLaProva(page);
  await expect(
    page.locator(`#formazione-spunta-${PROVA_COMPETITION_ID}-${PROVA_PREFISSO_ID}Difensore-1`),
  ).not.toBeChecked();
  await expect(page.locator(`#formazione-blindata-${PROVA_COMPETITION_ID}`)).not.toBeChecked();

  expect(externalRequests).toEqual([]);
});

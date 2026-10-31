import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { depositoConSquadra } from "./fixtures/synthetic-formazione.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";
import { PROVA_COMPETITION_ID } from "../src/formazioneProva.js";

// LE SCRITTE DELLA PAGINA FORMAZIONE, VISTE DAL BROWSER.
//
// Decisione di Pico, 31/10/2026, in modale — alla domanda «Le scritte poco
// chiare della pagina formazione («in_dubbio» col trattino, «voglio», «Posa
// qui», i moduli scritti «442» invece di «4-4-2»): le sistemo?» ha risposto «Sì,
// solo queste», cioè «le riscrivo in italiano chiaro, senza cambiare cosa fanno
// i comandi».
//
// COSA TIENE FERMO QUESTA SUITE, e sono due cose diverse:
//
//  1. NESSUNA SCRITTA DA PROGRAMMA. Una parola col trattino basso — `in_dubbio`,
//     `id_fuori_rosa`, `LOCKED_TOO_MANY` — non deve comparire né nel testo che
//     si legge né nei nomi accessibili (`aria-label`, `title`) di nessuno degli
//     stati in cui la pagina mostra codici. Il controllo guarda la pagina così
//     com'è dopo ogni gesto che fa nascere un codice, e non un elenco di codici
//     scritto qui: un codice nuovo che tornasse crudo a schermo lo prende lo
//     stesso.
//  2. IL DATO NON CAMBIA. Cambia come si mostra e basta: gli identificativi, gli
//     attributi `data-*` e le classi portano ancora i valori del contratto
//     («442», `in_dubbio`), perché sono i ganci su cui le altre prove e il
//     disegno poggiano.
//
// FUORI DAL PERIMETRO, dichiarato: il guasto di lettura mostra il suo «codice
// tecnico» accanto alla frase, apposta, per chi apre il runbook
// (e2e/formazione-guasto-lettura.spec.ts). Non è uno stato della squadra e non
// è in queste prove.

const COMPETIZIONE = `#formazione-competizione-${PROVA_COMPETITION_ID}`;
const CAMPIONATO = "c-campionato";

/**
 * Le parole col trattino basso che la pagina mostra: nel testo visibile, e negli
 * attributi che un lettore di schermo legge al posto del testo.
 */
async function scritteCrude(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const parolaDaProgramma = /[A-Za-zÀ-ÿ]+_[A-Za-zÀ-ÿ_]*/g;
    const trovate = new Set<string>();
    for (const voce of document.body.innerText.match(parolaDaProgramma) ?? []) {
      trovate.add(`testo: ${voce}`);
    }
    for (const elemento of Array.from(document.querySelectorAll("*"))) {
      for (const attributo of ["aria-label", "title", "alt", "placeholder"]) {
        const valore = elemento.getAttribute(attributo);
        if (valore === null) continue;
        for (const voce of valore.match(parolaDaProgramma) ?? []) {
          trovate.add(`${attributo}: ${voce}`);
        }
      }
    }
    return [...trovate];
  });
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

test("il controllo non è cieco: una parola col trattino basso, se compare, viene vista", async ({
  page,
  context,
}) => {
  // IL CONTROLLO POSITIVO delle prove qui sotto. Un rilevatore che non rileva
  // lascerebbe verdi tutte le altre per sempre; qui si pianta a mano una scritta
  // da programma, in tutte e tre le forme in cui potrebbe tornare, e si pretende
  // che venga vista.
  const externalRequests: string[] = [];
  await apriLaProva(page, context, externalRequests);
  expect(await scritteCrude(page)).toEqual([]);

  await page.evaluate(() => {
    const finta = document.createElement("div");
    finta.id = "scritta-finta";
    finta.textContent = "in_dubbio";
    finta.setAttribute("aria-label", "id_fuori_rosa");
    finta.setAttribute("title", "LOCKED_TOO_MANY");
    document.body.appendChild(finta);
  });
  expect(await scritteCrude(page)).toEqual([
    "testo: in_dubbio",
    "aria-label: id_fuori_rosa",
    "title: LOCKED_TOO_MANY",
  ]);

  expect(externalRequests).toEqual([]);
});

test("in prova nessun codice col trattino basso compare, in nessuno degli stati che ne producono", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriLaProva(page, context, externalRequests);

  // LA SQUADRA DI ESEMPIO, appena aperta: ha un giocatore «in dubbio».
  expect(await scritteCrude(page)).toEqual([]);
  const inDubbio = page.locator(`${COMPETIZIONE} .fz-chip--in_dubbio`);
  await expect(inDubbio).toHaveCount(1);
  await expect(inDubbio).toHaveText("in dubbio");

  // LA SPUNTA SU CHI NON SCENDE IN CAMPO: l'avvertimento e il segno sulla riga.
  const indisponibile = `ESEMPIO-Attaccante-2`;
  await page.locator(`#formazione-spunta-${PROVA_COMPETITION_ID}-${indisponibile}`).check();
  const avvertimenti = page.locator(`#formazione-avvertimenti-vincoli-${PROVA_COMPETITION_ID}`);
  await expect(avvertimenti).toContainText("giocatore che non gioca");
  await expect(
    page.locator(`#formazione-giocatore-${PROVA_COMPETITION_ID}-${indisponibile} .fz-chip--codice`),
  ).toHaveText("giocatore che non gioca");
  expect(await scritteCrude(page)).toEqual([]);

  // UN MODULO CHE LA FORMAZIONE NON REGGE: le violazioni dell'invio, tutte.
  await page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}-343`).click();
  const legalita = page.locator(`#formazione-legalita-bloccanti-${PROVA_COMPETITION_ID}`);
  await expect(legalita).toContainText("difensori in numero sbagliato");
  await expect(legalita).toContainText("attaccanti in numero sbagliato");
  // Anche la frase accanto al titolo nomina il modulo come lo nomina il bottone.
  await expect(legalita).toContainText("il modulo «3-4-3» richiede 3 difensori");
  await expect(legalita).not.toContainText(/«\d{3}»/);
  expect(await scritteCrude(page)).toEqual([]);

  // TROPPE SPUNTE: i motivi di rifiuto dei vincoli, tutti insieme.
  const spunte = page.locator(`[id^="formazione-spunta-${PROVA_COMPETITION_ID}-"]`);
  for (let i = 0; i < 13; i += 1) await spunte.nth(i).check();
  const impossibile = page.locator(`#formazione-impossibile-${PROVA_COMPETITION_ID}`);
  await expect(impossibile).toContainText("troppi giocatori spuntati");
  expect(await scritteCrude(page)).toEqual([]);

  expect(externalRequests).toEqual([]);
});

test("con la squadra letta dalla lega: «in dubbio», «fuori rosa», e il dato resta quello del contratto", async ({
  page,
  context,
}) => {
  // Un deposito sintetico in cui un titolare porta un identificativo che nella
  // rosa non c'è: è il caso che il contratto chiama `id_fuori_rosa`.
  const deposito = depositoConSquadra() as {
    competitions: { lineup: { starterIds: string[] } }[];
  };
  deposito.competitions[0]!.lineup.starterIds[0] = "g-fuori-rosa";

  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, undefined, {
    kind: "serve",
    deposit: deposito as unknown as Record<string, unknown>,
  });
  await page.goto("/");
  await gotoScreen(page, "Formazione");
  await expect(page.locator(`#formazione-competizione-${CAMPIONATO}`)).toBeVisible();

  // `g-a3` è in dubbio nella fixture: si legge «in dubbio», e il vestito del
  // segno e il nome per il lettore di schermo dicono la stessa cosa.
  const gettone = page.locator(`#formazione-${CAMPIONATO}-g-a3-gettone`);
  await expect(gettone).toContainText("in dubbio");
  await expect(gettone).toHaveAttribute("aria-label", /, in dubbio/);
  // Il valore del contratto non si è mosso: sta ancora nella classe.
  await expect(gettone.locator(".fz-chip--in_dubbio")).toHaveText("in dubbio");

  // L'identificativo che nella rosa non c'è: la violazione bloccante dice «fuori
  // rosa», e la stessa parola sta sulla riga di chi nomina.
  const bloccanti = page.locator(`#formazione-legalita-bloccanti-${CAMPIONATO}`);
  await expect(bloccanti).toContainText("fuori rosa");
  expect(await scritteCrude(page)).toEqual([]);

  expect(externalRequests).toEqual([]);
});

test("i moduli si leggono coi trattini, e i valori che si scambiano restano «442»", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriLaProva(page, context, externalRequests);

  // I bottoni, nell'ordine in cui la pagina li disegna.
  const chiavi = page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID} .fz-modulo__chiave`);
  await expect(chiavi).toHaveText(["5-4-1", "4-5-1", "5-3-2", "4-4-2", "3-5-2", "4-3-3", "3-4-3"]);

  // IL DATO NON CAMBIA: l'identificativo e `data-modulo` portano ancora il valore
  // della lega, che è quello che si scambia e su cui le altre prove poggiano.
  const quattroQuattroDue = page.locator(
    `#formazione-modulo-schierato-${PROVA_COMPETITION_ID}-442`,
  );
  await expect(quattroQuattroDue).toHaveAttribute("data-modulo", "442");
  await expect(quattroQuattroDue).toHaveAttribute("aria-label", /^Modulo 4-4-2 — /);
  await expect(page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}-343`)).toHaveAttribute(
    "aria-label",
    /^Schiera il modulo 3-4-3 — /,
  );
  await expect(page.locator(".formazione-campo")).toHaveAttribute("data-modulo", "442");

  // La riga «moduli dichiarati dalla lega» e il selettore del modulo bloccato.
  await expect(page.locator(`#formazione-comandi-${PROVA_COMPETITION_ID}`)).toContainText(
    "moduli dichiarati dalla lega: 5-4-1, 4-5-1, 5-3-2, 4-4-2, 3-5-2, 4-3-3, 3-4-3",
  );
  const selettore = page.locator(`#formazione-modulo-${PROVA_COMPETITION_ID}`);
  await expect(selettore.locator("option")).toHaveText([
    "nessun blocco",
    "5-4-1",
    "4-5-1",
    "5-3-2",
    "4-4-2",
    "3-5-2",
    "4-3-3",
    "3-4-3",
  ]);
  // Scegliere «4-4-2» blocca il valore «442».
  await selettore.selectOption({ label: "4-4-2" });
  await expect(selettore).toHaveValue("442");

  // E NELLE FRASI: col modulo bloccato, schierarne un altro chiede conferma, e il
  // conflitto nomina i due moduli coi trattini (Pico, 31/10/2026: «Sì, solo
  // queste»), come i bottoni. Il valore che si scambia è ancora «442».
  await page.locator(`#formazione-modulo-schierato-${PROVA_COMPETITION_ID}-343`).click();
  const conflitto = page.locator(`#formazione-conflitto-${PROVA_COMPETITION_ID}`);
  await expect(conflitto).toHaveAttribute("data-conflitto", "modulo_bloccato");
  await expect(conflitto).toContainText(
    "il modulo bloccato è «4-4-2»: schierare «3-4-3» contraddice quel vincolo",
  );
  await expect(conflitto).toContainText(
    "il blocco sul modulo «4-4-2» viene tolto, e la formazione passa a «3-4-3»",
  );
  await expect(conflitto).not.toContainText(/«\d{3}»/);

  expect(externalRequests).toEqual([]);
});

test("«Lo voglio in campo» e «Mettilo in panchina»: i comandi hanno parole piene", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await apriLaProva(page, context, externalRequests);

  // La spunta sul gettone: la scritta accanto al controllo, che è la stessa frase
  // che la pagina usa quando la spunta è messa.
  const etichetta = page.locator(
    `label[for="formazione-spunta-${PROVA_COMPETITION_ID}-ESEMPIO-Portiere-1"]`,
  );
  await expect(etichetta).toHaveText("Lo voglio in campo");
  await expect(
    page.getByRole("checkbox", { name: /ESEMPIO-Portiere-1.*lo voglio in campo/ }),
  ).toBeVisible();

  // Le due zone dove si lascia il gettone preso in mano.
  const panchina = page.locator(`#formazione-panchina-posa-${PROVA_COMPETITION_ID}`);
  const fuori = page.locator(`#formazione-fuori-posa-${PROVA_COMPETITION_ID}`);
  await expect(panchina).toHaveText("Mettilo in panchina");
  await expect(fuori).toHaveText("Mettilo fuori dai convocati");
  // Senza niente in mano sono spente, e il nome per il lettore di schermo lo dice.
  await expect(page.getByRole("button", { name: /^Mettilo in panchina — non si può/ })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /^Mettilo fuori dai convocati — non si può/ }),
  ).toBeDisabled();
  await expect(page.locator("#formazione-screen")).not.toContainText("Posa qui:");

  // E FANNO ANCORA LA COSA DI PRIMA: si prende un titolare, e la zona si accende
  // con lo stesso nome di sempre per chi non vede (il comando non è cambiato).
  await page.locator(`#formazione-${PROVA_COMPETITION_ID}-ESEMPIO-Centrocampista-4-gettone`).click();
  await expect(panchina).toBeEnabled();
  await expect(panchina).toHaveAttribute("aria-label", "Manda «ESEMPIO-Centrocampista-4» in panchina");
  await panchina.click();
  await expect(
    page.locator(`#formazione-panchina-${PROVA_COMPETITION_ID}`),
  ).toContainText("ESEMPIO-Centrocampista-4");

  expect(externalRequests).toEqual([]);
});

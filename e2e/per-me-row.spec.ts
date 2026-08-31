import { expect, test, type Page } from "@playwright/test";
import { installSyntheticNetworkGuard } from "./helpers.js";
import {
  AUCTION_HISTORY_KEY,
  PER_ME_DEPOSIT_POOL,
  PER_ME_GEN_RECIPE,
  PER_ME_POOL,
  syntheticPerMeHistory,
} from "./fixtures/synthetic-per-me.js";
import { PER_ME_TITLE_SHORT } from "../src/ui/perMeRow.js";

/**
 * IL TETTO DI REGRESSIONE DEL SOTTOBLOCCO PIENO, in px, misurato a 390×844 sul
 * DOM vivo. Non è una soglia scelta: è la misura arrotondata per eccesso al
 * pixel, come fa il mastro del budget con le proprie allocazioni.
 *
 * 1002 -> 134 -> 35. Il primo salto è la riga ridotta a nome, ruolo e squadra
 * col tetto delle righe portato a UNA («un giocatore soltanto», Pico,
 * 2026-08-31). IL SECONDO È LA NOTA, TOLTA DEL TUTTO la sera dello stesso
 * giorno: dei 134 px, 92 erano la nota e ~34 la riga — l'annotazione costava
 * quasi il triplo del consiglio che annotava, e messo davanti alla misura Pico
 * ha scelto «via del tutto». Misurato dopo: 34,22 px, cioè la riga e nient'altro.
 *
 * 35 E NON 34: il tetto arrotonda per ECCESSO al pixel, come il mastro, o
 * starebbe sotto la misura che deve contenere.
 *
 * IL SOTTOBLOCCO PIENO COSTA ADESSO MENO DI QUELLO MUTO — 34,2 contro 78 px,
 * perché la frase del silenzio è più lunga di una riga di consiglio — e questo
 * chiude `PER_ME_POPOLATO_FUORI_DALLA_MISURA` in src/ui/callScreenBudget.ts:
 * il mastro misura lo stato muto, e da oggi quello stato è il PEGGIORE dei due.
 */
const PER_ME_FULL_HEIGHT_CEILING_PX = 35;

// «PER ME» — I DUE ESITI VERI DEL SOTTOBLOCCO, SUL DOM VIVO.
//
// CHE COSA C'ERA QUI PRIMA, E PERCHÉ NON DESCRIVE PIÙ LA REALTÀ. Fino a stamane
// questa spec verificava che la riga portasse `V` con la sua targa, il prezzo
// atteso coi tre qualificatori, il surplus, il costo per vincerlo adesso, i due
// conteggi di scarsità, l'appetibilità, l'ancora, l'allocazione del piano e il
// marcatore «⚑ adesso». Pico ha deciso altro, e in prima persona: «Quello che
// voglio nelle due feature è un giocatore soltanto con Nome, ruolo e squadra.
// Non devo usarle per leggere ma come consiglio.»
//
// QUELLE ASSERZIONI NON SONO STATE ALLENTATE, SONO STATE ROVESCIATE: al posto
// di «la riga porta questi fatti» c'è «la riga NON porta nessuno di questi
// fatti», voce per voce, così che il giorno in cui uno tornasse a schermo
// questa spec lo dica col suo nome. È la stessa tecnica con cui il mastro del
// budget pinna un debito: documentare, non condonare.
//
// LA COPERTURA CHE RESTA, INTATTA. La catena end-to-end del gesto — clic e
// tastiera, fino alla schermata d'asta con QUEL giocatore — è la ragione per
// cui la semplificazione non perde niente: i numeri sono a un clic. Restano
// anche il ricalcolo del piano dinamico provato sul vivo, il silenzio
// dichiarato (`no-forecast`) e le due pretese sul titolo nascosto.
//
// Fixture sintetiche: nessun giocatore reale, nessun prezzo d'asta reale,
// nessuna persona reale. Il network guard aborta ogni richiesta esterna.

/** La scena SERVITA: previsioni sul listone e storico d'asta in memoria. */
async function bootServed(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(
    ([key, store]) => {
      localStorage.clear();
      localStorage.setItem(key as string, JSON.stringify(store));
    },
    [AUCTION_HISTORY_KEY, syntheticPerMeHistory()] as const,
  );
  await page.reload();
  await expect(page.locator("#per-me-rows")).toBeVisible();
}

test("con deposito e storico il pannello CONSIGLIA: un giocatore, con nome ruolo e squadra", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_DEPOSIT_POOL, externalRequests);
  await bootServed(page);

  // IL TETTO RATIFICATO TRONCA DAVVERO: UNA riga, non tre e non sessanta.
  const rows = page.locator("#per-me-rows .per-me-row");
  await expect(rows).toHaveCount(1);
  await expect(page.locator("#per-me-empty")).toHaveCount(0);

  // LA RIGA È TRE COSE, e l'asserzione è sulla FORMA INTERA e non su un
  // «contiene»: «Nome (R · Club)», niente prima e niente dopo.
  const riga = ((await rows.first().innerText()) ?? "").trim();
  expect(riga).toMatch(/^[^()]+ \([PDCA] · [^()]+\)$/);

  // E QUI SOTTO C'È IL ROVESCIO DI CIÒ CHE QUESTA SPEC ASSERIVA IERI: nessuno
  // dei fatti che la riga portava è tornato a schermo. Sono a un clic — sulla
  // schermata di chiamata che la riga arma — e il motore che li calcola è
  // intatto, coperto da src/perMeCandidates.test.ts e da packages/engine.
  expect(riga).not.toContain(PER_ME_GEN_RECIPE); // la targa di `V`
  expect(riga).not.toMatch(/\bV \d/);
  expect(riga).not.toMatch(/\bS [+−]\d/); // il surplus
  expect(riga).not.toContain("atteso"); // il prezzo atteso e i tre qualificatori
  expect(riga).not.toContain("aste simili");
  expect(riga).not.toContain("tende a sbagliare");
  expect(riga).not.toContain("vincerlo adesso"); // il costo per vincerlo ora
  expect(riga).not.toContain("alternativ"); // i due fatti di scarsità
  expect(riga).not.toContain("rival");
  expect(riga).not.toContain("appetibilità");
  expect(riga).not.toContain("ancora"); // la scomposizione dell'ancora
  expect(riga).not.toContain("Qt.A");
  expect(riga).not.toContain("piano"); // l'allocazione dinamica del ruolo
  expect(riga).not.toContain("max bid");
  expect(riga).not.toContain("⚑"); // il marcatore del momento
  await expect(page.locator("#per-me-rows .per-me-row__now")).toHaveCount(0);

  // LA NOTA NON C'È PIÙ, DEL TUTTO — «via del tutto» (Pico, 2026-08-31), messo
  // davanti alla misura: pesava 92 px contro i 34 della riga che annotava.
  // L'elemento non esiste in nessuno dei due esiti, e le sue parole non
  // ricompaiono altrove nel sottoblocco.
  await expect(page.locator("#per-me-note")).toHaveCount(0);
  const blocco = (await page.locator("#per-me-block").textContent()) ?? "";
  expect(blocco).not.toContain("V dal generatore");
  expect(blocco).not.toContain("curva storica");
  expect(blocco).not.toContain("campione minimo");
  expect(blocco).not.toContain("riserva 1 cr");
  expect(blocco).not.toContain("al massimo");
  expect(blocco).not.toContain("ratificato da Pico");
  expect(blocco).not.toContain("NOM-DYN@");

  // NESSUN VERBO DI PREVISIONE O DI DESIDERIO nel testo reso: la guardia di
  // deriva vive in src/ui/perMeRow.test.ts, qui si verifica che ciò che arriva
  // DAVVERO a schermo non la contraddica.
  const testo = (await page.locator("#per-me-block").textContent()) ?? "";
  expect(testo).not.toMatch(/valore|vale |conviene|affare|occasion|sconto|preved|probabil|stima/i);

  expect(externalRequests).toEqual([]);
});

test("clic sulla riga → «Avvia» → schermata d'asta con QUEL giocatore", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_DEPOSIT_POOL, externalRequests);
  await bootServed(page);

  // Prima del gesto la CTA è disarmata: senza questo, «si arma» sarebbe vero
  // per caso.
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeDisabled();

  const first = page.locator("#per-me-rows .per-me-row").first();
  const nome = (await first.locator(".per-me-row__name").textContent()) ?? "";
  const soloNome = nome.slice(0, nome.indexOf(" (")).trim();
  expect(soloNome.length).toBeGreaterThan(0);

  await first.click();

  // 1. IL GIOCATORE RISULTA SELEZIONATO ESATTAMENTE COME DAL LISTONE.
  await expect(page.locator("#search-player")).toHaveValue(soloNome);
  await expect(page.locator("#search-role")).toHaveValue("A");

  // 2. LA SELEZIONE SI VEDE, e su un secondo canale oltre al colore.
  const selected = page.locator("#per-me-rows .per-me-row[aria-pressed='true']");
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText("✓ selezionato");

  // 3. LA CTA SI ARMA — e da lì «Avvia» porta in asta senza passaggi in più.
  const avvia = page.getByRole("button", { name: /^Avvia/ });
  await expect(avvia).toBeEnabled();
  await avvia.click();

  // 4. SI È NELLA SCHERMATA D'ASTA, CON QUEL GIOCATORE.
  await expect(page.locator("#assign-price")).toBeVisible();
  await expect(page.locator("#call-card")).toContainText(soloNome);

  expect(externalRequests).toEqual([]);
});

test("la stessa catena da TASTIERA: la riga è un <button> vero", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_DEPOSIT_POOL, externalRequests);
  await bootServed(page);

  // La riga è UNA sola dal 2026-08-31, quindi la tastiera si prova su quella:
  // era `.nth(1)` quando le righe erano tre. Ciò che il test dimostra non
  // cambia — che la riga è un `<button>` vero e che Invio la attiva.
  const row = page.locator("#per-me-rows .per-me-row").first();
  await row.focus();
  await expect(row).toBeFocused();
  const nome = (await row.locator(".per-me-row__name").textContent()) ?? "";
  const soloNome = nome.slice(0, nome.indexOf(" (")).trim();

  await page.keyboard.press("Enter");
  await expect(page.locator("#search-player")).toHaveValue(soloNome);
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeEnabled();

  expect(externalRequests).toEqual([]);
});

test("il piano dinamico si RICALCOLA: comprato il primo, la lista cambia da sé", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_DEPOSIT_POOL, externalRequests);
  await bootServed(page);

  const primaNomi = await page.locator("#per-me-rows .per-me-row__name").allTextContents();

  // Il gesto vero: si porta il primo in asta e lo si assegna. Nessuna
  // previsione di durata è stata fatta — è il RICALCOLO a spostare la lista.
  await page.locator("#per-me-rows .per-me-row").first().click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill("30");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#per-me-rows")).toBeVisible();

  const dopoNomi = await page.locator("#per-me-rows .per-me-row__name").allTextContents();
  expect(dopoNomi).not.toEqual(primaNomi);
  // LA VERSIONE DEL PIANO NON SI LEGGE PIÙ A SCHERMO — la nota che la portava
  // è stata tolta il 2026-08-31 («via del tutto», Pico) — e questa spec non la
  // sostituisce con un'asserzione su un elemento che non c'è. Il fatto che il
  // piano si sia riscritto è provato da CIÒ CHE SI VEDE: la riga consigliata è
  // cambiata da sé, senza nessun gesto sul pannello. `planVersion` resta nel
  // modello e pinnato da packages/engine/tests/dynamicPlan.test.ts e da
  // src/perMeCandidates.test.ts.
  await expect(page.locator("#per-me-note")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("senza le previsioni servite il sottoblocco dice QUALE deposito manca", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_POOL, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const empty = page.locator("#per-me-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toHaveAttribute("data-reason", "no-forecast");
  await expect(empty).toContainText("Deposito assente o monco");
  await expect(page.locator("#per-me-rows")).toHaveCount(0);
  // IL MOTIVO DEL PIANO DICHIARATO NON ESISTE PIÙ: il piano dinamico esiste
  // sempre dove esistono `V` e prezzo atteso, quindi nessun pannello può più
  // tacere per una dichiarazione che manca.
  await expect(empty).not.toContainText("piano rosa");

  // IL MOTIVO DEL SILENZIO C'È, LA NOTA NO. Sono due elementi diversi con due
  // compiti diversi, e solo il secondo se n'è andato: `#per-me-empty` qui sopra
  // dice PERCHÉ il pannello tace — «non lo so» non deve diventare «non c'è
  // nessuno» — mentre `#per-me-note` non esiste più in nessuno stato.
  await expect(page.locator("#per-me-note")).toHaveCount(0);
  await expect(page.locator("#per-me-title")).toHaveText(PER_ME_TITLE_SHORT);

  // IL TITOLO C'È E NON SI DISEGNA — «Nascondi #per-me-title» (Pico,
  // 2026-08-31). Il gemello dell'esca invece SI VEDE, e la differenza non è
  // una svista: qui l'occhiello dice già la stessa cosa, là c'è la seconda
  // domanda, che nessun altro elemento porta (e2e/bait-row.spec.ts la prova).
  // Le due metà di questa pretesa non si possono separare, ed è il motivo per
  // cui stanno in un test solo:
  //
  //   a. NON OCCUPA LA VISTA. Il rettangolo è quello dell'idioma
  //      visually-hidden del repository (1×1 px, `clip-path: inset(50%)`), non
  //      una riga di testo alta 16 px. Un `display: none` passerebbe anche qui
  //      — ed è proprio quello che la lettera b vieta.
  //   b. DÀ ANCORA IL NOME AL BLOCCO. `aria-labelledby` punta a lui: se
  //      sparisse dal rendering, `#per-me-block` resterebbe SENZA nome
  //      accessibile, e nessuno se ne accorgerebbe guardando la pagina.
  const titleBox = await page
    .locator("#per-me-title")
    .evaluate((el) => el.getBoundingClientRect());
  expect(titleBox.height, "il titolo non occupa una riga a schermo").toBeLessThanOrEqual(1);
  expect(titleBox.width, "il titolo non occupa larghezza a schermo").toBeLessThanOrEqual(1);

  const accessibleName = await page.locator("#per-me-block").evaluate((el) => {
    const by = el.getAttribute("aria-labelledby") ?? "";
    return document.getElementById(by)?.textContent ?? null;
  });
  expect(accessibleName, "il sottoblocco ha ancora un nome accessibile").toBe(PER_ME_TITLE_SHORT);

  // E IL NOME CHE SI VEDE PER QUESTA METÀ È QUELLO DI SOPRA — l'occhiello, che
  // dal 2026-08-31 intesta DAVVERO le due metà e non più la sola prima
  // («L'occhiello sale a intestare le due metà», Pico). Non basta che esista:
  // deve INTESTARE, e qui si prova che lo fa in tutti e tre i modi in cui una
  // pagina può dirlo.
  //
  //   a. È VISIBILE, e sta nel blocco;
  //   b. DÀ IL NOME al blocco intero via `aria-labelledby`, come i due titoli
  //      delle metà lo danno alle loro sezioni;
  //   c. STA SOPRA LE DUE METÀ NELL'ALBERO, non dentro una di loro: è figlio
  //      di `#suggested-player`, ed è la pretesa che diventa rossa il giorno
  //      in cui qualcuno lo rimettesse dentro la prima metà — che è com'era
  //      fino a stamane.
  const occhiello = page.locator("#suggested-player-title");
  await expect(occhiello).toBeVisible();
  await expect(occhiello).toHaveText("GIOCATORE SUGGERITO — CHI CHIAMARE ORA");
  await expect(page.locator("#suggested-player")).toHaveAttribute(
    "aria-labelledby",
    "suggested-player-title",
  );
  expect(
    await page.evaluate(
      () =>
        document.getElementById("suggested-player-title")?.parentElement?.id ?? null,
    ),
    "l'occhiello è figlio del blocco, non di una delle due metà",
  ).toBe("suggested-player");
  // E LE DUE METÀ GLI STANNO SOTTO PARI: stesso genitore, nessuna delle due
  // annidata dentro l'altra. `#suggested-player-mine` non esiste più — dopo la
  // salita dell'occhiello avvolgeva un'unica sezione e non nominava più niente.
  expect(
    await page.evaluate(() => [
      document.getElementById("per-me-block")?.parentElement?.id ?? null,
      document.getElementById("bait-block")?.parentElement?.id ?? null,
    ]),
    "le due metà sono sorelle dentro lo stesso contenitore",
  ).toEqual(["suggested-player-halves", "suggested-player-halves"]);

  const emptyHeight = await page
    .locator("#per-me-block")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(
    emptyHeight,
    `il sottoblocco muto costa ${Math.round(emptyHeight)}px: era 120 quando è stato misurato, ` +
      `39 dal 2026-08-31 col titolo nascosto, 78 con la frase del deposito mancante`,
  ).toBeLessThan(150);

  expect(externalRequests).toEqual([]);
});

test("il sottoblocco PIENO ha un tetto di regressione, misurato a 390×844", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PER_ME_DEPOSIT_POOL, externalRequests);
  await page.setViewportSize({ width: 390, height: 844 });
  await bootServed(page);

  const fullHeight = await page
    .locator("#per-me-block")
    .evaluate((el) => el.getBoundingClientRect().height);

  // ⚠️ QUESTO NUMERO È UNA MISURA, NON UNA SCELTA. 1002 px quando la riga
  // portava i nove fatti del DTI; 133,5 da quando ne porta tre — nome, ruolo e
  // squadra, tetto delle righe UNO (Pico, 2026-08-31); 34,2 da quando la nota
  // non c'è più (Pico, la sera dello stesso giorno: «via del tutto»).
  //
  // DOVE ERANO ANDATI I 133,5 px, ed è la misura che ha deciso: 92 la NOTA e
  // ~34 la riga. Messo davanti al fatto che l'annotazione costava quasi il
  // triplo del consiglio che annotava, Pico ha tolto la nota invece di
  // asciugarla ancora. Quello che resta è la riga, e il blocco misura la riga.
  //
  // IL MASTRO DEL BUDGET ADESSO CONTIENE QUESTA SCENA, e la lacuna che lo
  // diceva si è chiusa: la fixture di e2e/call-screen-budget.spec.ts non porta
  // il deposito, quindi là il sottoblocco è MUTO e misura 78 px — cioè PIÙ dei
  // 34,2 che misura pieno, perché la frase del silenzio è più lunga di una riga
  // di consiglio. L'allocazione di `giocatore-suggerito` è misurata sullo stato
  // muto, che da oggi è il peggiore dei due: vedi il `why` di
  // `giocatore-suggerito` in src/ui/callScreenBudget.ts.
  expect(
    Math.round(fullHeight),
    `il sottoblocco pieno costa ${Math.round(fullHeight)}px a 390×844 (78 da muto)`,
  ).toBeLessThanOrEqual(PER_ME_FULL_HEIGHT_CEILING_PX);
  // …E NON È VUOTO. Un tetto così basso passerebbe anche su un blocco sparito:
  // la riga c'è, e il pavimento lo dice.
  expect(Math.round(fullHeight), "il sottoblocco pieno non è sparito").toBeGreaterThan(20);

  expect(externalRequests).toEqual([]);
});

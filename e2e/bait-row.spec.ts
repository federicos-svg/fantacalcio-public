import { expect, test, type Page } from "@playwright/test";
import { installSyntheticNetworkGuard } from "./helpers.js";
import { PRECEDENT_POOL, seedPrecedents } from "./fixtures/synthetic-precedents.js";
import { BAIT_TITLE, BAIT_TITLE_SHORT } from "../src/ui/baitRow.js";
import { PER_ME_TITLE_SHORT } from "../src/ui/perMeRow.js";

// LA RIGA DELL'ESCA SI CLICCA COME UNA RIGA DI LISTONE — il gesto, dal primo
// tocco all'ultimo.
//
// IL DIFETTO CHE QUESTA SPEC ESISTE PER PREVENIRE, ed è la ragione per cui
// Pico l'ha chiesta: tre test separati che provano i tre pezzi — «il clic
// popola i campi», «la CTA si arma», «Avvia porta in asta» — passano tutti e
// tre anche quando la catena è rotta nel mezzo. Qui c'è UN test che parte dal
// gesto e finisce nella schermata d'asta con QUEL giocatore; i pezzi separati
// non lo sostituiscono.
//
// PERCHÉ LA CATENA PUÒ ESSERE RIUSATA E NON RIFATTA. `selectListonePlayer()` è
// l'UNICA via che arma la CTA «Avvia» (src/main.ts, e `isCallCorrelated` lo
// verifica); il candidato dell'esca È una `ListonePlayer` presa dal pool,
// quindi la stessa funzione si applica senza adattatori. Due strade per
// selezionare un giocatore sarebbero due superfici da sorvegliare, e la
// seconda divergerebbe il giorno in cui la prima cambia.
//
// TRE GESTI, NON UNO: mouse, tastiera e dito. La riga è un `<button>` vero,
// quindi Tab la raggiunge e Invio/Spazio la attivano senza un solo listener di
// tastiera scritto a mano — ed è questa spec a impedire che torni a essere un
// `<div>` con un listener di click, che è ciò che la riga di listone è oggi.
//
// LA SCENA. Il listone sintetico e lo storico d'asta sintetico di
// e2e/fixtures/synthetic-precedents.ts, seminati da `localStorage` come li
// legge davvero il boot. Zero dati reali, e il network guard aborta qualunque
// altra cosa.
//
// LA RIGA È TRE COSE, DAL 2026-08-31: nome, ruolo, squadra. «Quello che voglio
// nelle due feature è un giocatore soltanto con Nome, ruolo e squadra. Non devo
// usarle per leggere ma come consiglio» (Pico). Sono usciti da questa spec il
// censimento degli avversari esposti, la proiezione «se resta a te» e le righe
// di evidenza dei precedenti: non perché le asserzioni desse fastidio, ma
// perché quel testo non è più a schermo. Al loro posto c'è la pretesa opposta e
// più forte — che nessuno di quei fatti torni sulla riga.
//
// IL CANDIDATO ATTESO, calcolato sulla fixture e non indovinato: con otto
// squadre a rose vuote ogni reparto è aperto e ogni budget capiente, quindi
// l'ordine è per numero di avversari esposti e poi per chiave di listone, e il
// primo di quell'ordine è Primo Portiere (ClubUno), con tre avversari esposti.
// Gli altri — Secondo Portiere, Primo Difensore, le righe su ClubDue — restano
// fuori dal tetto di UNA riga: il motore continua a ordinarli tutti, la vista
// ne disegna uno.

const FIRST_ROW = "Primo Portiere";

/** La guardia di deriva, sul DOM VIVO. Gemella di src/ui/baitRow.test.ts §E14. */
const DRIFT = /vuole|abbocc|aggressiv|tilt|preved|probabil|stima/i;

/**
 * La guardia di deriva su UNA STRINGA VUOTA sarebbe verde senza provare
 * niente: `""` non corrisponde a nessuna regex. Prima di negare, si asserisce
 * che c'è qualcosa da negare — il titolo del sottoblocco e una lunghezza
 * minima. È la stessa classe di difetto che #41 ha corretto sul proprio
 * `toHaveCount(0)` (e2e/listone-colonne-default.spec.ts §"le cinque celle di
 * voto devono esistere per poterle negare").
 */
async function expectNoDrift(page: Page, where: string): Promise<void> {
  const text = await page.locator("#bait-block").innerText();
  expect(text, `${where}: il nome non c'è, la guardia non sta guardando il blocco giusto`)
    .toContain(BAIT_TITLE_SHORT);
  // Oltre al nome deve esserci del contenuto vero: il titolo da solo non è
  // qualcosa da negare.
  const beyondTitle = text.replace(BAIT_TITLE_SHORT, "").trim();
  expect(beyondTitle.length, `${where}: oltre al nome il sottoblocco è vuoto`).toBeGreaterThan(40);
  expect(text, where).not.toMatch(DRIFT);
}

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await seedPrecedents(page);
  await expect(page.locator("#bait-rows")).toBeVisible();
}

/** Posizione assoluta nel documento del bordo superiore di un elemento. */
async function documentTop(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) throw new Error(`ordine: nessun elemento per ${sel}`);
    return el.getBoundingClientRect().top + window.scrollY;
  }, selector);
}

test("il sottoblocco mostra IL candidato atteso, dentro GIOCATORE SUGGERITO", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);
  await boot(page);

  const rows = page.locator("#bait-rows .bait-row");
  // Il tetto ratificato è 1: non tre, non tutti. Era 3 fino a stamane, e la
  // decisione successiva di Pico nella stessa giornata lo supera.
  await expect(rows).toHaveCount(1);

  // LA RIGA È TRE COSE, e l'asserzione è sulla FORMA INTERA e non su un
  // «contiene»: «Nome (R · Club)», niente prima e niente dopo.
  const riga = ((await rows.first().innerText()) ?? "").trim();
  expect(riga).toBe(`${FIRST_ROW} (P · ClubUno)`);

  // IL ROVESCIO DI CIÒ CHE QUESTA SPEC ASSERIVA IERI: nessuno dei fatti che la
  // riga portava è tornato a schermo. I precedenti coi loro numeri restano nel
  // pannello AVVERSARI: I PRECEDENTI, e il costo del piano B sulla schermata di
  // chiamata che questa riga arma — a un clic.
  expect(riga).not.toContain("avversari"); // il censimento degli esposti
  expect(riga).not.toContain("avversario");
  expect(riga).not.toContain("se resta a te"); // la proiezione del piano B
  expect(riga).not.toContain("slot");
  expect(riga).not.toContain("restano");
  expect(riga).not.toContain("ha speso su"); // le righe di evidenza
  expect(riga).not.toContain("dal 15% in su");
  expect(riga).not.toContain("⚠"); // il marcatore di prima fascia
  await expect(page.locator("#bait-rows .bait-row__mark")).toHaveCount(0);
  await expect(page.locator("#bait-rows .bait-row__evidence")).toHaveCount(0);

  // Con le righe, l'occhiello è quello per esteso: dice CHE COSA sono.
  await expect(page.locator("#bait-title")).toHaveText(BAIT_TITLE);

  // LA NOTA NON C'È PIÙ, DEL TUTTO — «via del tutto» (Pico, 2026-08-31), messo
  // davanti alla misura della gemella `#per-me-note`: 92 px di annotazione per
  // 34 px di riga annotata. Qui la nota costava anche di più — `#bait-block`
  // popolato è sceso da 178,7 a 91 px a 390×844, cioè 87,7 px di sola
  // annotazione. L'elemento non esiste in nessuno dei due esiti, e
  // le sue parole non ricompaiono altrove nel sottoblocco.
  await expect(page.locator("#bait-note")).toHaveCount(0);
  const blocco = (await page.locator("#bait-block").textContent()) ?? "";
  expect(blocco).not.toContain("provenienza");
  expect(blocco).not.toContain("storico d'asta misurato");
  expect(blocco).not.toContain("apertura a 1 cr");
  expect(blocco).not.toContain("stagione misurata");
  expect(blocco).not.toContain("al massimo");
  expect(blocco).not.toContain("ratificato da Pico");

  // Il blocco ospita DUE sottoblocchi: la prima metà non è stata toccata, e il
  // listone resta sotto (e2e/call-screen-order.spec.ts).
  const suggested = page.locator("#suggested-player");
  await expect(suggested).toContainText("GIOCATORE SUGGERITO — CHI CHIAMARE ORA");
  // La PRIMA metà è il sottoblocco «PER ME», che in questa scena non ha né le
  // previsioni servite né lo storico d'asta e quindi dice QUALE deposito gli
  // manca invece di ordinare su numeri che non esistono.
  await expect(suggested).toContainText(PER_ME_TITLE_SHORT);
  await expect(page.locator("#per-me-empty")).toHaveAttribute("data-reason", "no-forecast");
  expect(await page.evaluate(() =>
    document.getElementById("suggested-player")!.contains(document.getElementById("bait-block")),
  )).toBe(true);
  expect(await documentTop(page, "#bait-block")).toBeGreaterThan(
    await documentTop(page, "#suggested-player-mine"),
  );
  expect(await documentTop(page, "#listone-block")).toBeGreaterThan(
    await documentTop(page, "#bait-block"),
  );

  // GUARDIA DI DERIVA sul testo davvero renderizzato.
  await expectNoDrift(page, "con le righe");

  expect(externalRequests).toEqual([]);
});

test("E15 — clic sulla riga → «Avvia» → schermata d'asta con QUEL giocatore", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);
  await boot(page);

  // Prima del gesto la CTA è disarmata: senza questo, «si arma» sarebbe vero
  // per caso.
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeDisabled();

  await page.locator("#bait-rows .bait-row").first().click();

  // 1. IL GIOCATORE RISULTA SELEZIONATO ESATTAMENTE COME DAL LISTONE: i tre
  //    campi della ricerca si popolano con quella riga.
  await expect(page.locator("#search-player")).toHaveValue(FIRST_ROW);
  await expect(page.locator("#search-role")).toHaveValue("P");
  await expect(page.locator("#search-club")).toHaveValue("ClubUno");
  await expect(page.locator(".hint-text").first()).toContainText(
    `✓ Selezionato dal listone: ${FIRST_ROW}`,
  );

  // 2. LA SELEZIONE SI VEDE, e su un secondo canale oltre al colore.
  const selected = page.locator("#bait-rows .bait-row[aria-pressed='true']");
  await expect(selected).toHaveCount(1);
  await expect(selected).toContainText("✓ selezionato");
  await expect(selected).toContainText(FIRST_ROW);

  // 3. LA CTA SI ARMA — e da lì «Avvia» porta in asta senza passaggi in più.
  const avvia = page.getByRole("button", { name: /^Avvia/ });
  await expect(avvia).toBeEnabled();
  await avvia.click();

  // 4. SI È NELLA SCHERMATA D'ASTA, CON QUEL GIOCATORE.
  await expect(page.locator("#assign-price")).toBeVisible();
  await expect(page.locator("#call-card")).toContainText(FIRST_ROW);
  await expect(page.locator("#call-card")).toContainText("ClubUno");

  expect(externalRequests).toEqual([]);
});

test("E16 — la stessa catena da TASTIERA: Tab per raggiungerla, Invio per attivarla", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);
  await boot(page);

  // La riga è un <button> vero: è questo che le dà Tab e Invio/Spazio senza un
  // solo listener di tastiera scritto a mano.
  const control = await page.evaluate(() => {
    const el = document.querySelector("#bait-rows .bait-row") as HTMLButtonElement;
    return { tag: el.tagName, type: el.type, tabIndex: el.tabIndex, disabled: el.disabled };
  });
  expect(control.tag).toBe("BUTTON");
  expect(control.type).toBe("button");
  expect(control.tabIndex).toBeGreaterThanOrEqual(0);
  expect(control.disabled).toBe(false);

  // RAGGIUNGIBILE CON TAB, partendo da un controllo che sta prima nella
  // schermata. Non si asserisce il NUMERO di tabulazioni — cambierebbe con
  // ogni controllo aggiunto in mezzo — ma che la riga si raggiunga.
  await page.locator("#search-club").focus();
  let reached = false;
  for (let i = 0; i < 12 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(
      () => document.activeElement?.classList.contains("bait-row") === true,
    );
  }
  expect(reached, "la riga dell'esca non è raggiungibile con Tab").toBe(true);

  // ATTIVABILE CON INVIO, e la catena arriva in fondo come col mouse.
  const focusedName = await page.evaluate(
    () => (document.activeElement as HTMLElement).dataset.playerKey ?? "",
  );
  expect(focusedName).not.toBe("");
  await page.keyboard.press("Enter");
  await expect(page.locator("#search-player")).not.toHaveValue("");
  const chosen = await page.locator("#search-player").inputValue();
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeEnabled();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#call-card")).toContainText(chosen);

  expect(externalRequests).toEqual([]);
});

test("E16 — e con la BARRA SPAZIATRICE, che è l'altro tasto di un bottone", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);
  await boot(page);

  // Era `.nth(2)` quando le righe erano tre: col tetto a UNA il gesto si prova
  // sulla riga che c'è. Ciò che il test dimostra non cambia — che la riga è un
  // `<button>` vero e che la barra spaziatrice la attiva come Invio.
  const row = page.locator("#bait-rows .bait-row").first();
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press("Space");

  await expect(page.locator("#search-player")).toHaveValue(FIRST_ROW);
  await expect(page.getByRole("button", { name: /^Avvia/ })).toBeEnabled();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#call-card")).toContainText(FIRST_ROW);

  expect(externalRequests).toEqual([]);
});

test.describe("E16 — col dito, a 390x844", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("il tocco fa esattamente quello che fa il clic, fino alla schermata d'asta", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);
    await boot(page);

    const row = page.locator("#bait-rows .bait-row").first();
    await row.scrollIntoViewIfNeeded();
    await row.tap();

    await expect(page.locator("#search-player")).toHaveValue(FIRST_ROW);
    await expect(page.locator("#bait-rows .bait-row[aria-pressed='true']")).toContainText(
      "✓ selezionato",
    );

    const avvia = page.getByRole("button", { name: /^Avvia/ });
    await expect(avvia).toBeEnabled();
    await avvia.tap();
    await expect(page.locator("#call-card")).toContainText(FIRST_ROW);

    // La pagina non scorre mai di lato, nemmeno col blocco in più.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);

    expect(externalRequests).toEqual([]);
  });
});

test("senza storico il sottoblocco dice «non lo so», e non «nessuno»", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, PRECEDENT_POOL, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const empty = page.locator("#bait-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toHaveAttribute("data-reason", "no-history");
  await expect(empty).toContainText("non lo so");
  await expect(empty).toContainText("«non lo so» non è «nessuno»");
  await expect(page.locator("#bait-rows")).toHaveCount(0);

  // IL MOTIVO DEL SILENZIO C'È, LA NOTA NO. Sono due elementi diversi con due
  // compiti diversi, e solo il secondo se n'è andato: `#bait-empty` qui sopra
  // dice PERCHÉ il pannello tace — e per `no-history` dice proprio «non lo so»,
  // che è l'opposto di «nessuno» — mentre `#bait-note` non esiste più in
  // nessuno stato. Un blocco che non ha nulla da dire non si prende un quarto
  // di schermata: vedi e2e/call-screen-order.spec.ts, che tiene la paginazione
  // entro due schermate.
  await expect(page.locator("#bait-note")).toHaveCount(0);
  await expect(page.locator("#bait-title")).toHaveText(BAIT_TITLE_SHORT);
  const emptyHeight = await page
    .locator("#bait-block")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(emptyHeight, "il sottoblocco vuoto è tornato a costare mezza schermata").toBeLessThan(120);

  await expectNoDrift(page, "senza storico");

  expect(externalRequests).toEqual([]);
});

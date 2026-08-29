import { expect, test, type Page } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import { LISTONE_PAGE_SIZE } from "../src/ui/listone.js";
import { PER_ME_TITLE_SHORT } from "../src/ui/perMeRow.js";
import {
  CALL_SCREEN_BUDGET_VIEWPORT,
  CALL_SCREEN_SPAN_START_SELECTOR,
  callScreenBudgetAttribution,
  callScreenVerticalBudgetPx,
} from "../src/ui/callScreenBudget.js";
import {
  installSyntheticNetworkGuard,
  sweepCallScreen,
  waitForCallScreenSettled,
} from "./helpers.js";

// #333 — L'ORDINE DELLA SCHERMATA DI RICERCA È UNA DECISIONE, E QUESTA SPEC LA
// TIENE FERMA.
//
// Le quattro domande del tavolo, in ordine di frequenza (confermate da Pico):
//   1. quanto posso spendere per questo;
//   2. chi me lo contende;
//   3. quanto mi serve davvero questo ruolo adesso;
//   4. quanto mi resta se lo prendo.
// Criterio: ciò che serve alla decisione più frequente sta in alto e non si
// scrolla; ciò che non serve a nessuna delle quattro scende.
//
// IL DIFETTO CHE QUESTA SPEC IMPEDISCE DI RIFARE. `#search-player` — l'unica
// ragione per cui questa schermata esiste — stava sotto la piega a TUTTE e
// quattro le risoluzioni: a 390px a 2507px dall'inizio del documento, cioè la
// terza schermata, con davanti un blocco vuoto per costruzione (GIOCATORE
// SUGGERITO) e due letture del tavolo (SCARSITÀ, WAR BOARD). Misurato, non
// stimato.
//
// PERCHÉ MORDE. Non basta asserire che il campo esista: un campo che esiste
// 2500px più in basso esisteva anche prima. Le tre asserzioni sono
// complementari e ciascuna da sola diventa rossa se il campo torna giù:
//  a. geometria — il rettangolo del campo sta interamente dentro la finestra
//     a scroll 0;
//  b. hit-test — `elementFromPoint` sul centro del campo restituisce IL CAMPO:
//     copre il caso in cui è sì dentro la finestra ma sotto la fascia critica
//     appiccicata in alto, che dipinge sopra la pagina di proposito;
//  c. ordine — nessuno dei blocchi che erano davanti gli è tornato davanti.
//
// LA FIXTURE NON PUÒ MENTIRE SULLA SCALA. Il listone spedito da questo
// repository ha 6 righe; quello privato ne spedisce 532 (vedi
// e2e/shipped-listone.ts). Ogni caso qui gira su ENTRAMBI: con 532 righe la
// paginazione smette di essere «Pagina 1 di 1» inerte e diventa un controllo
// usato a ogni ricerca, quindi ha anch'essa un limite di quota qui.
//
// Tutte le righe sono sintetiche e il network guard aborta qualunque altra
// cosa.

const VIEWPORTS = [
  // La stessa risoluzione, in un posto solo: il telefono su cui il
  // budget verticale è dichiarato vive nel libro mastro
  // (src/ui/callScreenBudget.ts) e questa spec lo IMPORTA invece di
  // riscriverlo. Valore identico a prima, nessuna costante duplicata.
  CALL_SCREEN_BUDGET_VIEWPORT,
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const ROLES = ["P", "D", "C", "A"] as const;

/** Pool sintetico della SCALA del listone privato (532 righe), zero dati reali. */
function syntheticPoolOfSize(rows: number): readonly ListonePlayer[] {
  return Array.from({ length: rows }, (_, i) => ({
    name: `Sintetico ${String(i + 1).padStart(3, "0")}`,
    role: ROLES[i % ROLES.length]!,
    club: `Club${(i % 20) + 1}`,
    quotation: 1 + (i % 40),
  }));
}

const SMALL_POOL = syntheticPoolOfSize(6);
const LARGE_POOL = syntheticPoolOfSize(532);

const POOLS = [
  { label: "6 righe", pool: SMALL_POOL },
  { label: "532 righe", pool: LARGE_POOL },
] as const;

interface FoldReport {
  readonly rect: { top: number; bottom: number; height: number };
  readonly viewportHeight: number;
  readonly hitTestHitsSelf: boolean;
  readonly coveredByStickyChrome: boolean;
}

/** Il campo è dentro la finestra, e nel punto in cui si vede c'è LUI. */
async function foldReport(page: Page, selector: string): Promise<FoldReport> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) throw new Error(`piega: nessun elemento per ${sel}`);
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const strip = document.getElementById("critical-auction-strip");
    const stripBottom = strip === null ? 0 : strip.getBoundingClientRect().bottom;
    return {
      rect: { top: r.top, bottom: r.bottom, height: r.height },
      viewportHeight: window.innerHeight,
      hitTestHitsSelf: hit !== null && (hit === el || el.contains(hit)),
      coveredByStickyChrome: r.top < stripBottom,
    };
  }, selector);
}

/** Posizione assoluta nel documento del bordo superiore di un elemento. */
async function documentTop(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) throw new Error(`ordine: nessun elemento per ${sel}`);
    return el.getBoundingClientRect().top + window.scrollY;
  }, selector);
}

async function boot(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto("/");
  // Ogni giro riparte da un'asta vuota: il log persiste attraverso un goto(),
  // e uno stato residuo cambierebbe le altezze che questa spec misura.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
}

test("il campo di ricerca è sopra la piega a 390, 1280, 1440 e 1920 — con 6 righe e con 532", async ({
  page,
  context,
}) => {
  for (const { label, pool } of POOLS) {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, pool, externalRequests);

    for (const viewport of VIEWPORTS) {
      const where = `${label} @ ${viewport.width}px`;
      await boot(page, viewport);

      // a. GEOMETRIA — dentro la finestra, senza scrollare di un pixel.
      const search = await foldReport(page, "#search-player");
      expect(search.rect.height, `${where}: il campo deve avere un'altezza`).toBeGreaterThan(0);
      expect(
        search.rect.bottom,
        `${where}: il campo di ricerca finisce a ${Math.round(search.rect.bottom)}px, ` +
          `oltre la piega a ${search.viewportHeight}px`,
      ).toBeLessThanOrEqual(search.viewportHeight);

      // b. HIT-TEST — nel punto dove si vede c'è il campo, non la fascia
      //    critica appiccicata in alto (che dipinge sopra la pagina di
      //    proposito) né altro.
      expect(search.coveredByStickyChrome, `${where}: il campo finisce sotto la fascia critica`).toBe(
        false,
      );
      expect(search.hitTestHitsSelf, `${where}: il centro del campo non è cliccabile`).toBe(true);

      // c. IL CAMPO NON SI PERDE MAI, A NESSUNO SCORRIMENTO — e questa è la
      //    forma nuova di una pretesa vecchia.
      //
      //    Diceva: «i blocchi che stavano davanti al campo stanno dietro»,
      //    confrontando le posizioni assolute nel documento. Era il modo di
      //    dire «il campo è il primo, quindi non serve scorrere per
      //    raggiungerlo». Dal 2026-08-29 la riga di ricerca è FISSA in fondo
      //    allo schermo (richiesta di Pico: «metti #call-search-row in
      //    position fixed con lo stesso stile di #assign-block»), quindi non
      //    sta più nel flusso e un confronto di posizioni nel documento non
      //    dice più niente: un elemento fisso ha la posizione della finestra,
      //    non quella della pagina.
      //
      //    La proprietà che contava si può però pretendere in forma PIÙ FORTE
      //    di prima: non «è in cima quando non hai scrollato», ma «è in vista
      //    SEMPRE, anche in fondo alla pagina». È ciò che questa riga misura,
      //    ed è rossa il giorno in cui la barra torna nel flusso.
      const fissa = await page.evaluate(() => {
        const row = document.getElementById("call-search-row");
        if (row === null) return null;
        const prima = row.getBoundingClientRect();
        window.scrollTo(0, document.body.scrollHeight);
        const dopo = row.getBoundingClientRect();
        window.scrollTo(0, 0);
        const campo = document.getElementById("search-player")?.getBoundingClientRect() ?? null;
        return {
          position: getComputedStyle(row).position,
          restaFerma: Math.abs(prima.top - dopo.top) < 1,
          campoInVista:
            campo !== null && campo.top >= 0 && campo.bottom <= window.innerHeight + 1,
        };
      });
      expect(fissa, `${where}: la riga di ricerca non esiste`).not.toBeNull();
      expect(fissa!.position, `${where}: la riga di ricerca non è fissa`).toBe("fixed");
      expect(
        fissa!.restaFerma,
        `${where}: la riga di ricerca si è mossa scorrendo fino in fondo`,
      ).toBe(true);
      expect(fissa!.campoInVista, `${where}: il campo non è in vista`).toBe(true);

      // c-bis. ORDINE VERTICALE DEL LISTONE (richiesta di Pico, 2026-08-17):
      //    il listone sta SOTTO il blocco del giocatore suggerito. Confronto
      //    fra posizioni assolute nel documento, come sopra: vale anche per
      //    ciò che è fuori dalla finestra, e diventa rosso se qualcuno
      //    rimette la tabella davanti al segnaposto.
      expect(
        await documentTop(page, "#listone-block"),
        `${where}: il listone è tornato sopra GIOCATORE SUGGERITO`,
      ).toBeGreaterThan(await documentTop(page, "#suggested-player"));

      // La pagina non scorre mai di lato.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        `${where}: scroll orizzontale`,
      ).toBe(true);
    }

    expect(externalRequests, `${label}: richieste esterne`).toEqual([]);
  }
});

test("con 532 righe la paginazione è un controllo raggiungibile, non la sesta schermata", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, externalRequests);

  const expectedPages = Math.ceil(LARGE_POOL.length / LISTONE_PAGE_SIZE);

  for (const viewport of VIEWPORTS) {
    await boot(page, viewport);
    // La paginazione esiste davvero: con 532 righe non è più «Pagina 1 di 1».
    const indicator = page.getByText(`Pagina 1 di ${expectedPages}`, { exact: true });
    await expect(indicator, `${viewport.width}px: indicatore di pagina`).toBeVisible();

    // DA DOVE SI MISURA, E PERCHÉ NON È PIÙ IL CAMPO DI RICERCA.
    //
    // Questa guardia ha sempre misurato la distanza fra il campo e la
    // paginazione. Dal 2026-08-29 `#call-search-row` è `position: fixed` in
    // fondo alla finestra («con lo stesso stile di #assign-block», Pico): il
    // campo non sta più nel flusso, e il suo rettangolo sta dove finisce la
    // FINESTRA, non dove stanno i blocchi che nel documento lo seguono.
    //
    // Misurare ancora da lì lasciava questa guardia VERDE PER IL MOTIVO
    // SBAGLIATO: a 390px la distanza risultava 1019 px su 1688 non perché la
    // schermata fosse corta, ma perché il punto di partenza era sceso a 727 px
    // dall'inizio del documento. Peggio, quel numero si ACCORCIA quando la
    // barra si allunga — cioè la guardia diventava più contenta proprio quando
    // la schermata peggiora. Un verde che si stringe quando la barra cresce è
    // un verde che mente.
    //
    // Adesso il punto di partenza è quello che il mastro dichiara
    // (`CALL_SCREEN_SPAN_START_SELECTOR`, src/ui/callScreenBudget.ts): il primo
    // blocco della schermata ancora in flusso, l'occhiello «RICERCA GIOCATORE».
    // Le due misure — questa guardia e il mastro — tornano così a essere LA
    // STESSA, che è la condizione sotto cui l'attribuzione qui sotto ha senso.
    // Che il campo debba stare sopra la piega resta provato dall'altra guardia
    // di questa spec, che lo misura in coordinate di finestra e regge la barra
    // fissa senza cambiare una riga.
    const top = await documentTop(page, CALL_SCREEN_SPAN_START_SELECTOR);
    const indicatorTop = await page.evaluate((text) => {
      const el = [...document.querySelectorAll("span")].find((s) => s.textContent === text);
      if (el === undefined) throw new Error("paginazione non trovata");
      return el.getBoundingClientRect().top + window.scrollY;
    }, `Pagina 1 di ${expectedPages}`);

    // IL TOTALE DICHIARATO NON È PIÙ UN NUMERO SOLO DI QUESTA SPEC.
    // `callScreenVerticalBudgetPx` è l'ESTRAZIONE del numero che il predicato
    // qui sotto calcola, non una seconda copia: questa riga è ciò che rende
    // impossibile ai due divergere. Il predicato resta quello che era.
    expect(
      callScreenVerticalBudgetPx(viewport.height),
      `${viewport.width}px: il totale del mastro non è più quello della guardia`,
    ).toBe(viewport.height * 2);

    // E ADESSO LA GUARDIA SA DIRE A CHI. Prima di asserire si chiama la
    // spazzata per blocco e si costruisce il messaggio che a questa guardia è
    // sempre mancato: fin qui sapeva dire «troppo», mai «di chi». Nessuna
    // asserzione tolta, nessuna ammorbidita, nessun predicato toccato — solo
    // il messaggio. L'attribuzione esiste alla risoluzione su cui il mastro è
    // stato misurato; altrove si dice che non c'è, invece di inventarla.
    await waitForCallScreenSettled(page);
    const attribution =
      viewport.width === CALL_SCREEN_BUDGET_VIEWPORT.width &&
      viewport.height === CALL_SCREEN_BUDGET_VIEWPORT.height
        ? callScreenBudgetAttribution(await sweepCallScreen(page, "ricerca"), viewport.height)
        : `lo span è ${Math.round(indicatorTop - top)}px su ${callScreenVerticalBudgetPx(viewport.height)}px — ` +
          `il mastro per blocco (src/ui/callScreenBudget.ts) è misurato a ` +
          `${CALL_SCREEN_BUDGET_VIEWPORT.width}×${CALL_SCREEN_BUDGET_VIEWPORT.height}: qui nessuna attribuzione`;

    // Attaccata alla ricerca: la tabella che separa la paginazione dall'inizio
    // della schermata è al massimo una pagina di LISTONE_PAGE_SIZE righe,
    // quindi il controllo che serve a ogni ricerca sta entro DUE schermate —
    // prima stava alla quinta a 390px.
    expect(
      indicatorTop - top,
      `${viewport.width}px: la paginazione è a ${Math.round(indicatorTop - top)}px dall'occhiello della ricerca — ${attribution}`,
    ).toBeLessThan(viewport.height * 2);
  }

  expect(externalRequests).toEqual([]);
});

test("IL TAVOLO è sempre aperto: nessun gesto lo apre, nessun controllo lo chiude", async ({
  page,
  context,
}) => {
  // DECISIONE DI PICO, 2026-08-26: «sempre aperto». La lettura scelta è la
  // letterale — NON È PIÙ UN ACCORDION — e questa prova misura esattamente
  // quella: non «nasce aperto» (che un accordion soddisfa e che si romperebbe
  // al primo click), ma «non esiste un modo di chiuderlo».
  //
  // Ciò che #333 aveva ottenuto NON viene disfatto e resta provato qui sotto:
  // il gruppo sta SOTTO l'intero pannello della chiamata, quindi la sua altezza
  // non spinge giù il campo di ricerca (la prova d'ordine, più in alto in
  // questo file, confronta le due posizioni assolute).
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SMALL_POOL, externalRequests);
  await boot(page, { width: 1280, height: 720 });

  const body = page.locator("#table-detail-body");
  const head = page.locator("#table-detail-head");

  // 1. APERTO AL BOOT, senza che nessuno abbia toccato niente.
  await expect(body).toBeVisible();
  // La testata dice ancora il nome del gruppo e che cosa contiene: era la
  // ragione per cui il vecchio gesto lo dichiarava prima di aprirsi, e resta
  // valida su una testata che non apre nulla.
  await expect(head).toContainText("IL TAVOLO");
  await expect(head).toContainText("scarsità per ruolo");
  await expect(head).toContainText("war board");

  // 2. NON C'È NIENTE DA CLICCARE. Il vecchio controllo non esiste più, e non
  //    è tornato con un altro nome: dentro il gruppo non c'è nessun bottone e
  //    nessun `aria-expanded`, che è ciò che distingue «sempre aperto» da
  //    «aperto di default».
  await expect(page.locator("#table-detail-toggle")).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      buttons: document.querySelectorAll("#table-detail > button, #table-detail__head button").length,
      headButtons: document.querySelectorAll("#table-detail-head button").length,
      expanded: document.querySelectorAll("#table-detail [aria-expanded]").length,
      hidden: document.querySelectorAll("#table-detail [hidden]").length,
    })),
    "IL TAVOLO non deve avere un controllo che lo chiuda",
  ).toEqual({ buttons: 0, headButtons: 0, expanded: 0, hidden: 0 });

  // 3. I DUE PANNELLI SONO QUELLI DI SEMPRE — stessi numeri, stessa struttura:
  //    otto schede di war board, quattro celle di scarsità. Nessuna
  //    informazione è stata tolta lungo la strada, in nessuno dei due passaggi
  //    (dietro il gesto con #333, davanti a tutti oggi).
  await expect(page.locator("#role-scarcity-panel")).toBeVisible();
  await expect(page.locator("#role-scarcity-grid > .scarcity-cell")).toHaveCount(4);
  await expect(page.locator("#war-board-full")).toBeVisible();
  await expect(page.locator("#war-board-full-grid > .war-board__card")).toHaveCount(8);
  // La griglia SQUADRE (LEGA) è stata RIMOSSA su richiesta di Pico
  // (2026-08-17): non deve tornare né qui dentro né altrove nella schermata.
  await expect(page.locator(".panel", { hasText: "SQUADRE (LEGA)" })).toHaveCount(0);

  // 4. RESTA APERTO ATTRAVERSO I RE-RENDER. La schermata si ricostruisce a ogni
  //    battuta di tasto nella ricerca: prima ciò che sopravviveva era uno stato
  //    dell'app, adesso non c'è nessuno stato da far sopravvivere — e la
  //    differenza si vede solo provandolo.
  await page.locator("#search-player").fill("Sint");
  await expect(body).toBeVisible();
  await page.locator("#search-player").fill("");
  await expect(body).toBeVisible();
  // E attraverso un reload: nessuna preferenza salvata, nessuno stato azzerato.
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
  await expect(body).toBeVisible();
  await expect(page.locator("#table-detail-toggle")).toHaveCount(0);

  // 5. GIOCATORE SUGGERITO non è stato cancellato: sta sotto la ricerca e
  //    sopra il listone, visibile, e dice ancora esattamente quello che diceva.
  const suggested = page.locator("#suggested-player");
  await expect(suggested).toHaveCount(1);
  await expect(suggested).toContainText("GIOCATORE SUGGERITO — CHI CHIAMARE ORA");
  // La prima metà del blocco non è più un segnaposto: è il sottoblocco «PER
  // ME». Qui il piano rosa non è dichiarato, quindi dice quale dichiarazione
  // manca — che è ancora «esattamente quello che diceva», cioè la verità sul
  // proprio stato, e non una frase generica.
  await expect(suggested).toContainText(PER_ME_TITLE_SHORT);
  await expect(page.locator("#per-me-empty")).toHaveAttribute("data-reason", "plan-absent");

  // 6. INSERIMENTO RAPIDO è stato RIMOSSO su richiesta di Pico (2026-08-17):
  //    né il pannello né i suoi controlli esistono più, in nessun momento.
  for (const selector of [
    "#assign-command-panel",
    "#assign-command-input",
    "#assign-command-submit",
    "#assign-command-preview",
  ]) {
    await expect(page.locator(selector), `${selector} non deve esistere`).toHaveCount(0);
  }

  expect(externalRequests).toEqual([]);
});

test("selezionato un giocatore, «chi me lo contende» è a un gesto sopra la piega", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SMALL_POOL, externalRequests);

  for (const viewport of VIEWPORTS) {
    const where = `${viewport.width}px`;
    await boot(page, viewport);

    // La selezione avviene cliccando una riga del listone, come sempre.
    await page.locator(".listone-row--clickable").first().click();
    await page.evaluate(() => window.scrollTo(0, 0));

    // CONTESTO CHIAMATA resta on-demand (D7 Binario A: si apre solo con un
    // gesto esplicito, e questa spec non cambia quella decisione). Ciò che
    // cambia è DOVE sta il gesto: sopra la piega, subito sotto la ricerca,
    // non alla quarta schermata.
    const toggleReport = await foldReport(page, "#nomination-context-toggle");
    expect(
      toggleReport.rect.bottom,
      `${where}: il gesto del contesto chiamata finisce a ` +
        `${Math.round(toggleReport.rect.bottom)}px, oltre la piega a ${toggleReport.viewportHeight}px`,
    ).toBeLessThanOrEqual(toggleReport.viewportHeight);
    expect(toggleReport.hitTestHitsSelf, `${where}: il gesto non è cliccabile dove si vede`).toBe(
      true,
    );

    // E il campo di ricerca non è stato spinto giù dalla comparsa del pannello.
    const search = await foldReport(page, "#search-player");
    expect(search.rect.bottom, `${where}: campo di ricerca dopo la selezione`).toBeLessThanOrEqual(
      search.viewportHeight,
    );

    // Aperto, risponde a tre delle quattro domande insieme: prezzi già pagati
    // nel ruolo (D1), avversari con credito e slot (D2), scarsità del ruolo (D3).
    await page.locator("#nomination-context-toggle").click();
    await expect(page.locator("#nomination-context-prices")).toBeVisible();
    await expect(page.locator("#nomination-context-opponents-list")).toBeVisible();
    await expect(page.locator("#nomination-context-scarcity")).toBeVisible();
  }

  expect(externalRequests).toEqual([]);
});

test("il gruppo IL TAVOLO esiste solo nella chiamata: nel momento d'asta c'è la war board MINI", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SMALL_POOL, externalRequests);
  await boot(page, { width: 1280, height: 720 });

  // Nella chiamata: la war board COMPLETA è dentro il gruppo, in chiaro.
  await expect(page.locator("#table-detail")).toHaveCount(1);
  await expect(page.locator("#war-board-full")).toBeVisible();

  await page.locator(".listone-row--clickable").first().click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#assign-price")).toBeVisible();

  // Nel momento d'asta il gruppo non esiste, e non ha portato con sé la war
  // board COMPLETA nel momento sbagliato: lì vive la MINI, come prima
  // (e2e/war-board.spec.ts) — la contabilità di tutto il tavolo resta in
  // chiaro, senza gesti.
  await expect(page.locator("#table-detail")).toHaveCount(0);
  await expect(page.locator("#war-board-full")).toHaveCount(0);
  await expect(page.locator("#war-board-mini")).toBeVisible();

  expect(externalRequests).toEqual([]);
});

test("nel momento d'asta INSIGHT GIOCATORE sta sopra TAVOLO — BUDGET E MAX BID", async ({
  page,
  context,
}) => {
  // ORDINE VERTICALE DEI DUE BLOCCHI ADIACENTI (richiesta di Pico,
  // 2026-08-17): scambiati fra loro, INSIGHT sopra e TAVOLO sotto. Stesso
  // idioma dell'asserzione listone/suggerito qui sopra — id semantici e
  // posizioni assolute nel documento, non indici di figli né classi di
  // layout: il confronto vale anche per ciò che sta fuori dalla finestra, e
  // diventa rosso se qualcuno rimette la war board davanti alla scheda.
  //
  // La riga di legenda «bdg = crediti residui · max bid = …» NON è un blocco a
  // sé: è l'ultima riga del pannello della war board MINI. Uno scambio che la
  // lasciasse indietro separerebbe la legenda dai numeri che spiega, quindi il
  // caso asserisce anche il suo contenimento e la sua posizione DENTRO il
  // pannello.
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SMALL_POOL, externalRequests);

  for (const viewport of VIEWPORTS) {
    const where = `${viewport.width}px`;
    await boot(page, viewport);

    await page.locator(".listone-row--clickable").first().click();
    await page.getByRole("button", { name: /^Avvia/ }).click();
    await expect(page.locator("#assign-price")).toBeVisible();

    // I due blocchi esistono entrambi: un confronto fra due assenti passerebbe
    // per vuoto (documentTop lancia se il selettore non trova niente).
    await expect(page.locator("#player-insight-panel")).toHaveCount(1);
    await expect(page.locator("#war-board-mini")).toHaveCount(1);

    const insightTop = await documentTop(page, "#player-insight-panel");
    const miniTop = await documentTop(page, "#war-board-mini");
    expect(
      miniTop,
      `${where}: TAVOLO — BUDGET E MAX BID sta a ${miniTop}px e INSIGHT GIOCATORE a ${insightTop}px: ` +
        `la war board MINI è tornata sopra INSIGHT GIOCATORE`,
    ).toBeGreaterThan(insightTop);

    // La legenda segue la war board: dentro il pannello, sotto le otto schede.
    expect(
      await page.evaluate(
        () =>
          document
            .querySelector("#war-board-mini")
            ?.contains(document.querySelector("#war-board-mini-note")) ?? false,
      ),
      `${where}: la riga di legenda è uscita dal pannello della war board MINI`,
    ).toBe(true);
    const noteTop = await documentTop(page, "#war-board-mini-note");
    const listTop = await documentTop(page, "#war-board-mini-list");
    expect(
      noteTop,
      `${where}: la legenda è a ${noteTop}px e le schede squadra a ${listTop}px`,
    ).toBeGreaterThan(listTop);
    expect(
      noteTop,
      `${where}: la legenda della war board è finita sopra INSIGHT GIOCATORE`,
    ).toBeGreaterThan(insightTop);
  }

  expect(externalRequests).toEqual([]);
});

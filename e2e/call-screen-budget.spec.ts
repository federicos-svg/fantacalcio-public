import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { LISTONE_PAGE_SIZE, type ListonePlayer } from "../src/ui/listone.js";
import { SERIE_A_CLUBS_2026_27 } from "../src/ui/serieA.js";
import {
  CALL_SCREEN_BUDGET_LEDGER,
  CALL_SCREEN_BUDGET_VIEWPORT,
  CALL_SCREEN_NAME_LENGTH_PINS,
  CALL_SCREEN_OVER_BUDGET_STATES,
  CALL_SCREEN_STATES,
  CALL_SCREEN_VERTICAL_BUDGET_PX,
  LISTONE_ALLOCATION_PX,
  callScreenBudgetFindings,
  describeCallScreenBudgetFinding,
  type CallScreenState,
} from "../src/ui/callScreenBudget.js";
import {
  LISTONE_ASSET_PATH,
  installSyntheticNetworkGuard,
  sweepCallScreen,
  waitForCallScreenSettled,
} from "./helpers.js";

// IL BUDGET VERTICALE HA UN TOTALE E NESSUN PROPRIETARIO: L'ULTIMO
// ARRIVATO PAGA PER TUTTI.
//
// IL DIFETTO, MISURATO. La guardia di #333 (e2e/call-screen-order.spec.ts)
// misura lo SPAN INTERO della schermata di chiamata contro due schermate e
// dice «troppo» a cose fatte, SENZA DIRE A CHI. Tre merge hanno speso il
// margine senza saperlo, e la riparazione è toccata ogni volta all'ultimo
// arrivato — quello sotto pressione, non quello che conosce il valore relativo
// dei blocchi.
//
// QUESTA SPEC È LA META' A SCHERMO DEL LIBRO MASTRO. L'altra metà —
// l'aritmetica, la classificazione dei fallimenti e le scelte non ratificate —
// vive in src/ui/callScreenBudget.ts e si verifica SENZA BROWSER a ogni
// `npm test`. Qui il browser fa solo due cose: MISURA (sweepCallScreen, per
// forma e non da un elenco) e ROMPE (le quattro prove in fondo).
//
// PERCHÉ LA GUARDIA PER BLOCCO MORDE PRIMA DEL TOTALE. Una riga di testo
// aggiunta a un blocco esistente sfora la SUA allocazione restando ben dentro
// le due schermate: il rosso arriva col nome del blocco, mentre il totale è
// ancora verde. È tutto il punto.
//
// LA FIXTURE NON PUÒ MENTIRE SULLE STRINGHE. I club sono quelli VERI già
// dichiarati in src/ui/serieA.ts, non stringhe inventate corte: misurato,
// cambiando SOLO le stringhe della fixture lo span passa da dentro a fuori
// budget senza nessun blocco nuovo — vedi CALL_SCREEN_NAME_LENGTH_PINS e il
// caso «i nomi lunghi sfondano il budget da soli» qui sotto. Nessun dato reale
// di giocatore: nomi e quotazioni restano sintetici.

// E NON PUÒ MENTIRE NEMMENO SUGLI ASSET. Fino al 2026-08-26 questa spec era
// verde qui e rossa nel repository privato COL MEDESIMO BROWSER, perché là gli
// stemmi dei club esistono e qui non possono esistere: il marchio del club
// occupava due scatole diverse sui due rami (immagine caricata / ripiego
// testuale), la riga del listone passava da 92,5 a 96,75px e il mastro
// misurava una schermata che non spedisce. La scatola adesso è una sola
// (CLUB_BADGE_SLOT_STYLE, src/ui/serieA.ts) e i numeri qui sotto sono stati
// riverificati con e senza i 23 stemmi in pagina: identici.

// ⚠️ TRAPPOLA DI MANUTENZIONE. Due test qui sotto — «il contesto della chiamata
// aperto sfonda il totale dichiarato» e «i nomi lunghi sfondano il budget da
// soli» — ASSERISCONO CHE IL BUDGET È SFORATO, e pinnano gli span alla lettera.
// Sono test di caratterizzazione: congelano un debito, non lo riparano. Il
// giorno in cui qualcuno ripara davvero il layout DIVENTANO ROSSI, e non
// perché qualcosa si sia rotto. In quel caso si rimisura e si aggiornano i
// numeri in src/ui/callScreenBudget.ts (con la data), non si allentano le
// asserzioni.
//
// È SUCCESSO IL 2026-08-29, e non era una riparazione. «Metti #call-search-row
// in position fixed con lo stesso stile di #assign-block» (Pico) ha tolto la
// riga di ricerca dal flusso: i quattro span pinnati qui sotto sono scesi di
// 113-114 px e il margine della PROVA 1 è risalito da 1 a 81. Nessuna
// asserzione è stata allentata — i pin sono stati RIMISURATI e riscritti alla
// lettera, e la PROVA 1 rovesciata con la ragione accanto. I 152 px non sono
// stati restituiti: sono passati a `--assign-bar-h`, un budget che questo
// mastro non contabilizza (BARRA_FISSA_FUORI_DAL_TOTALE).

const ROLES = ["P", "D", "C", "A"] as const;

/** La scala del listone privato (532 righe), zero dati reali. */
const POOL_ROWS = 532;

/**
 * La lunghezza dei nomi della fixture di riferimento, in caratteri.
 *
 * NON è una lunghezza dichiarata: nessun documento dice quanto può essere
 * lungo un nome nel listone. È la lunghezza che la fixture di questo
 * repository ha oggi, e su cui l'intero mastro è stato misurato. Il giorno in
 * cui Owner dichiara la lunghezza vera si cambia questa costante e il mastro
 * dice da solo quanto manca.
 */
const FIXTURE_NAME_CHARS = 13;

/**
 * Pool sintetico con nomi di lunghezza ESATTA e i club veri già dichiarati nel
 * repository. La lunghezza è un parametro perché è la variabile che l'analisi
 * ha trovato decisiva, non per gusto di generalità.
 */
function syntheticPool(rows: number, nameChars: number): readonly ListonePlayer[] {
  return Array.from({ length: rows }, (_, i) => {
    const suffix = String(i + 1).padStart(3, "0");
    const stem = "Sinteticonome".padEnd(nameChars - 4, "o").slice(0, nameChars - 4);
    return {
      name: `${stem} ${suffix}`,
      role: ROLES[i % ROLES.length]!,
      club: SERIE_A_CLUBS_2026_27[i % SERIE_A_CLUBS_2026_27.length]!,
      quotation: 1 + (i % 40),
    };
  });
}

const POOL = syntheticPool(POOL_ROWS, FIXTURE_NAME_CHARS);

async function boot(page: Page): Promise<void> {
  await page.setViewportSize({ ...CALL_SCREEN_BUDGET_VIEWPORT });
  await page.goto("/");
  // Ogni giro riparte da un'asta vuota: il log persiste attraverso un goto(),
  // e uno stato residuo cambierebbe le altezze che questa spec misura.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
  // IL LISTONE DEVE AVER FINITO DI ARRIVARE, e non è una precauzione
  // generica. Il pool si carica in modo asincrono: `#search-player` è visibile
  // PRIMA che le righe esistano, e il render che le porta ricostruisce l'intera
  // colonna. Misurare o rompere qualcosa in quella finestra significa misurare
  // una schermata che sta per essere sostituita — e le prove di rottura qui
  // sotto, che iniettano nel DOM, si vedevano cancellare l'iniezione.
  await expect(page.locator(".listone-row")).toHaveCount(LISTONE_PAGE_SIZE);
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitForCallScreenSettled(page);
}

/** Porta la schermata nello stato chiesto, con i gesti veri dell'interfaccia. */
async function enterState(page: Page, state: CallScreenState): Promise<void> {
  const first = POOL[0]!;
  switch (state) {
    case "ricerca":
    case "listone-non-caricabile":
      break;
    case "riga-selezionata":
      await page.getByText(first.name, { exact: true }).first().click();
      await expect(page.locator("#nomination-context")).toBeVisible();
      break;
    case "contesto-aperto":
      await page.getByText(first.name, { exact: true }).first().click();
      await page.locator("#nomination-context-toggle").click();
      await expect(page.locator("#nomination-context-body")).toBeVisible();
      break;
    case "contesto-aperto-ricerca-vuota":
      await page.getByText(first.name, { exact: true }).first().click();
      await page.locator("#nomination-context-toggle").click();
      await expect(page.locator("#nomination-context-body")).toBeVisible();
      // Svuotare la ricerca riporta il listone a pagina piena SENZA chiudere
      // il contesto: due gesti, ed è lo stato peggiore raggiungibile.
      await page.locator("#search-player").fill("");
      await expect(page.locator(".listone-row")).toHaveCount(LISTONE_PAGE_SIZE);
      break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitForCallScreenSettled(page);
}

/**
 * Il guasto che rende il listone non caricabile: l'asset dati risponde 500 fin
 * dal PRIMO caricamento, quindi non c'è nessuna copia salvata da cui ripartire
 * e nessuna voce di cache da sfrattare. Rompere DOPO un caricamento riuscito
 * sarebbe un'altra scena — quella la coprono le spec di recupero — e per
 * questa introdurrebbe una corsa fra il salvataggio del pool e la sua
 * cancellazione.
 */
async function bootBrokenListone(
  context: BrowserContext,
  page: Page,
  externalRequests: string[],
): Promise<void> {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === LISTONE_ASSET_PATH) return route.fulfill({ status: 500, body: "" });
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    externalRequests.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.setViewportSize({ ...CALL_SCREEN_BUDGET_VIEWPORT });
  await page.goto("/");
  await expect(page.locator("#search-player")).toBeVisible();
  await expect(page.getByText("Nessun listone caricato al momento.")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitForCallScreenSettled(page);
}

function report(findings: readonly ReturnType<typeof callScreenBudgetFindings>[number][]): string[] {
  return findings.map(describeCallScreenBudgetFinding);
}

/* ────────────────────────────────────────────────────────────────────────────
   1. IL MASTRO REGGE IN OGNI STATO CHE LA SCHERMATA ASSUME
   ──────────────────────────────────────────────────────────────────────────── */

test("ogni blocco della schermata di chiamata sta dentro la propria riga del mastro, in ogni stato", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);

  for (const state of CALL_SCREEN_STATES) {
    if (state.id === "listone-non-caricabile") continue; // guasto dedicato, sotto
    await boot(page);
    await enterState(page, state.id);

    const sweep = await sweepCallScreen(page, state.id);

    // ANTI-VACUITÀ, prima di ogni altra cosa: una spazzata che non trova
    // niente passerebbe per verde. Questo repository ha già pagato quel
    // difetto più di una volta.
    expect(sweep.blocks.length, `${state.label}: la spazzata non vede blocchi`).toBeGreaterThan(0);
    // La piastrellatura è esatta: la somma dei consumi È lo span. Se non lo
    // fosse, un blocco potrebbe consumare budget senza che nessuno paghi.
    const tiled = sweep.blocks.reduce((t, b) => t + b.consumptionPx, 0);
    expect(tiled, `${state.label}: la piastrellatura non copre lo span`).toBeCloseTo(
      sweep.spanPx,
      1,
    );

    expect(report(callScreenBudgetFindings(sweep)), `${state.label}`).toEqual([]);
  }

  expect(externalRequests).toEqual([]);
});

test("col listone non caricabile il mastro non passa per vuoto: i blocchi ci sono e sono dichiarati", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await bootBrokenListone(context, page, externalRequests);

  const sweep = await sweepCallScreen(page, "listone-non-caricabile");
  // Senza paginazione lo span finisce dove finisce la colonna: non c'è un
  // controllo di pagina da raggiungere, ma i blocchi esistono e vanno
  // attribuiti lo stesso.
  expect(sweep.listone).toBeNull();
  expect(sweep.blocks.length).toBeGreaterThan(0);
  expect(report(callScreenBudgetFindings(sweep))).toEqual([]);
  expect(externalRequests).toEqual([]);
});

/* ────────────────────────────────────────────────────────────────────────────
   2. I DUE STATI CHE OGGI SFONDANO IL TOTALE — misurati, pinnati, non approvati
   ──────────────────────────────────────────────────────────────────────────── */

test("il contesto della chiamata aperto sfonda il totale dichiarato, e nessuna guardia lo vedeva", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);

  for (const debt of CALL_SCREEN_OVER_BUDGET_STATES) {
    await boot(page);
    await enterState(page, debt.state);
    const sweep = await sweepCallScreen(page, debt.state);

    // PINNATO ALLA LETTERA, non «sotto una soglia»: il debito è documentato,
    // non condonato. Diventa rosso appena la misura si muove — in meglio o in
    // peggio — invece di scivolare via come ha fatto finora. Ripararlo è una
    // decisione di prodotto su che cosa CONTESTO CHIAMATA mostra da aperto.
    expect(Math.round(sweep.spanPx), `${debt.state}: lo span pinnato`).toBe(debt.spanPx);
    expect(
      Math.round(sweep.spanPx) - CALL_SCREEN_VERTICAL_BUDGET_PX,
      `${debt.state}: lo scarto dal totale dichiarato`,
    ).toBe(debt.overBudgetPx);
    // L'asserzione che dice la verità sul totale: questo stato È oltre.
    expect(
      Math.round(sweep.spanPx),
      `${debt.state}: ${debt.why}`,
    ).toBeGreaterThan(CALL_SCREEN_VERTICAL_BUDGET_PX);
    // …e il mastro, che alloca a ogni blocco l'altezza che RAGGIUNGE, non ha
    // niente da attribuire: nessun blocco è cresciuto oltre la propria riga.
    // Lo sfondamento non è colpa di un blocco, è la somma — cioè esattamente
    // ciò che la riserva negativa dichiara.
    expect(report(callScreenBudgetFindings(sweep)), `${debt.state}`).toEqual([]);
  }

  expect(externalRequests).toEqual([]);
});

/* ────────────────────────────────────────────────────────────────────────────
   3. IL FATTO CHE RIMETTE IN DISCUSSIONE TUTTI I NUMERI: LA LUNGHEZZA DEI NOMI
   ──────────────────────────────────────────────────────────────────────────── */

test("i nomi lunghi muovono lo span di 200px da soli, e per 18px non lo sfondano più", async ({
  page,
  context,
}) => {
  // La misura di riferimento del mastro, con la fixture di oggi: DENTRO.
  {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, POOL, externalRequests);
    await boot(page);
    const sweep = await sweepCallScreen(page, "ricerca");
    expect(
      Math.round(sweep.spanPx),
      `con nomi da ${FIXTURE_NAME_CHARS} caratteri lo span sta dentro le due schermate`,
    ).toBeLessThan(CALL_SCREEN_VERTICAL_BUDGET_PX);
    expect(report(callScreenBudgetFindings(sweep))).toEqual([]);
    expect(externalRequests).toEqual([]);
    await context.unroute("**/*");
  }

  // Cambiando SOLO le stringhe — stessi blocchi, stesse colonne, stessi club
  // veri — lo span si muove di 200 px. Fino al 2026-08-29 quei 200 px BASTAVANO
  // a portarlo fuori dal totale; dal 2026-08-30 non bastano più, perché la
  // colonna della chiamata ha perso 103 px (il contatore delle interazioni e
  // l'istruzione sempre a schermo sulla ricerca). Il pin resta ALLA LETTERA in
  // entrambi i sensi: documentare senza approvare vale anche quando la misura
  // rientra, perché 18 px su 1688 sono l'1% e due righe di testo li rimangiano.
  for (const pin of CALL_SCREEN_NAME_LENGTH_PINS) {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, syntheticPool(POOL_ROWS, pin.chars), externalRequests);
    await boot(page);
    const sweep = await sweepCallScreen(page, "ricerca");

    expect(Math.round(sweep.spanPx), `nomi da ${pin.chars} caratteri: span pinnato`).toBe(
      pin.spanPx,
    );
    expect(
      Math.round(sweep.spanPx) - CALL_SCREEN_VERTICAL_BUDGET_PX,
      `nomi da ${pin.chars} caratteri: scarto dal totale`,
    ).toBe(pin.deltaFromBudgetPx);
    // IL MARGINE È SOTTILE E VA DETTO COSÌ COM'È: dentro, ma per pochissimo.
    expect(
      Math.round(sweep.spanPx),
      `nomi da ${pin.chars} caratteri: lo span sta dentro il totale, e di quanto`,
    ).toBeLessThan(CALL_SCREEN_VERTICAL_BUDGET_PX);
    expect(
      CALL_SCREEN_VERTICAL_BUDGET_PX - Math.round(sweep.spanPx),
      `nomi da ${pin.chars} caratteri: il margine che resta è meno del 3% del totale`,
    ).toBeLessThan(CALL_SCREEN_VERTICAL_BUDGET_PX * 0.03);

    // E il mastro NOMINA IL LISTONE, non l'ultimo blocco arrivato: la riga si
    // è alzata, quindi l'uguaglianza derivata dalla sua forma non torna più.
    const findings = callScreenBudgetFindings(sweep);
    expect(
      findings.map((f) => (f.kind === "forma-listone" ? f.part : f.kind)),
      `nomi da ${pin.chars} caratteri`,
    ).toContain("altezza-riga");
    expect(report(findings).join(" | ")).toContain("LISTONE");

    expect(externalRequests).toEqual([]);
    await context.unroute("**/*");
  }
});

/* ────────────────────────────────────────────────────────────────────────────
   4. LE QUATTRO PROVE DI ROTTURA — a schermo, sul DOM vero
   ────────────────────────────────────────────────────────────────────────────
   Ciascuna rompe UNA cosa e pretende UN fallimento con UN nome. Le stesse
   quattro sono provate anche a secco in src/ui/callScreenBudget.test.ts: là
   sulla logica, qui sulla schermata.
   ──────────────────────────────────────────────────────────────────────────── */

test("PROVA 1 — una riga di testo in più a un blocco esistente: rosso il mastro col suo nome, verde il totale", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);
  await boot(page);

  // QUANTO ALTA DEV'ESSERE L'AGGIUNTA, E PERCHÉ È SCRITTA COSÌ. Allo stato
  // `ricerca` lo span misura 1470 px su 1688 dichiarati: il margine residuo
  // sul TOTALE è 218 px. L'aggiunta di questa prova è alta 20 px: sfonda
  // l'allocazione del blocco (281 px) e resta dentro il totale, che è
  // esattamente la scena da dimostrare.
  //
  // ── LA PROVA È STATA ROVESCIATA IL 2026-08-29 (sera), E NON PERCHÉ IL
  //    DEBITO SIA STATO RIPAGATO ────────────────────────────────────────────
  //
  // Qui c'era scritto che il giorno previsto era arrivato: i quattro
  // interruttori di ruolo avevano preso 32 dei 34 px che restavano, il margine
  // era sceso a 2, e l'aggiunta era stata tagliata a UN pixel perché 2
  // atterrava sul tetto e il tetto non è «dentro». Era «l'ultima volta»: la
  // prossima aggiunta avrebbe sfondato il totale insieme alla propria riga e
  // la scena sarebbe diventata irriproducibile.
  //
  // Non è andata così, e la ragione non è un merito di nessuno. «Metti
  // #call-search-row in position fixed con lo stesso stile di #assign-block»
  // (Pico, 2026-08-29) ha tolto la riga di ricerca DAL FLUSSO: 152 px che lo
  // span non vede più, quindi il margine risale da 2 a 115 e l'aggiunta torna
  // a 20 px, cioè una riga di testo vera. QUEI 152 PX NON SONO STATI
  // RESTITUITI: sono passati a `--assign-bar-h` (132 px in coda alla pagina,
  // src/styles/layout.css), un budget che questo mastro non contabilizza e che
  // nessuna guardia sorveglia. Il sollievo è PRESTATO: se la barra tornasse nel
  // flusso, il margine torna a 2 px e questa scena torna sull'orlo. Vedi
  // BARRA_FISSA_FUORI_DAL_TOTALE e PROVA_1_MARGINE_RIAPERTO_SENZA_RIPAGARE in
  // src/ui/callScreenBudget.ts.
  const EXTRA_PX = 20;

  // IL GAP DELLA GRIGLIA, NOMINATO E NON ASSORBITO. `#suggested-player` è una
  // griglia dal 2026-08-29 («Metti #suggested-player-mine e #bait-block uno
  // affianco all'altro», Pico) e a 390px sta su UNA colonna: le due metà si
  // impilano e fra loro c'è un `gap` di 14 px. Un `div` in più dentro il blocco
  // è quindi una terza riga della griglia, e costa la propria altezza PIÙ il
  // gap — misurato: aggiunta da 1 px -> +15, da 20 -> +34, da 100 -> +114.
  //
  // Il numero sta scritto qui e non ingoiato dentro l'atteso perché uno
  // sforamento di «+34 px» per un'aggiunta da 20 non si sa più leggere: o si
  // dice da dove vengono i 14 px, o il giorno in cui la griglia cambia gap
  // questa prova diventa rossa senza che nessuno sappia perché.
  const SUGGESTED_GRID_GAP_PX = 14;

  // IL CUSCINO CHE SI È APERTO IL 2026-08-30, e va nominato o questa prova
  // diventa illeggibile. L'allocazione di un blocco è il massimo che RAGGIUNGE
  // su tutti gli stati, e per `giocatore-suggerito` quel massimo è 281 px —
  // misurato con una riga selezionata. Allo stato `ricerca`, dove questa prova
  // gira, il blocco ne consuma 267: il sottoblocco PER ME mostra la sua frase
  // di silenzio, che è più corta di quando c'è una riga scelta.
  //
  // Fino a ieri i due numeri coincidevano (300,5 contro 301) e lo sforamento
  // era esattamente l'aggiunta più il gap. Adesso i 14 px di differenza vanno
  // sottratti, e sono la stessa quantità del gap solo per coincidenza.
  const PER_ME_SILENT_CUSHION_PX = 14;
  await page.evaluate((extraPx) => {
    const host = document.getElementById("suggested-player");
    if (host === null) throw new Error("prova 1: #suggested-player non è a schermo");
    const extra = document.createElement("div");
    extra.style.cssText = `font-size:13px;line-height:1.5;height:${extraPx}px;overflow:hidden;`;
    extra.textContent = "una riga di testo in più che nessuno ha dichiarato";
    host.appendChild(extra);
  }, EXTRA_PX);
  await waitForCallScreenSettled(page);

  const sweep = await sweepCallScreen(page, "ricerca");
  const findings = callScreenBudgetFindings(sweep);

  // a. IL MASTRO È ROSSO, E NOMINA QUEL BLOCCO. Uno solo, non «la schermata».
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({
    kind: "oltre-allocazione",
    id: "giocatore-suggerito",
    overflowPx: EXTRA_PX + SUGGESTED_GRID_GAP_PX - PER_ME_SILENT_CUSHION_PX,
  });
  expect(describeCallScreenBudgetFinding(findings[0]!)).toContain("giocatore-suggerito");

  // b. LA GUARDIA TOTALE È ANCORA VERDE. È la dimostrazione che la guardia per
  //    blocco morde PRIMA del totale, cioè tutto il punto di questa PR: senza
  //    il mastro, questa riga di testo entrerebbe senza che nessuno paghi, e
  //    il conto arriverebbe al blocco successivo.
  expect(
    Math.round(sweep.spanPx),
    "il totale è ancora dentro le due schermate: senza il mastro nessuno avrebbe detto niente",
  ).toBeLessThan(CALL_SCREEN_VERTICAL_BUDGET_PX);

  // …e di quanto è ancora verde: il margine residuo, misurato, è ciò che
  // resta prima che una scena come questa smetta di esistere.
  //
  // ERA 14 PX, POI UNO, POI 81, E ADESSO 184. La riga che lo porta esiste
  // apposta perché quel numero arrivi a qualcuno invece di scivolare via.
  //
  // I DUE SALTI NON HANNO LO STESSO VALORE, e vanno letti separati. Il primo
  // (1 -> 81) fu un PRESTITO: 152 px di riga di ricerca usciti dal flusso e
  // finiti in `--assign-bar-h`, un budget che nessuno misura; se la barra
  // tornasse nel flusso quel margine tornerebbe a 1. Il secondo (81 -> 184) è
  // invece SPAZIO RESTITUITO: il contatore delle interazioni di chiamata e
  // l'istruzione sempre a schermo sulla ricerca hanno smesso di esistere il
  // 2026-08-30, e il sottoblocco PER ME si è accorciato. Nessuno di quei px è
  // parcheggiato altrove.
  //
  // 218 di margine a boot, meno i 34 (20 + il gap della griglia) che questa
  // prova ci mette dentro.
  expect(
    CALL_SCREEN_VERTICAL_BUDGET_PX - Math.round(sweep.spanPx),
    "margine residuo sul totale, con l'aggiunta già dentro",
  ).toBe(184);

  expect(externalRequests).toEqual([]);
});

test("PROVA 2 — un blocco finto nella colonna: rosso per «senza riga nel mastro», non per sforamento", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);
  await boot(page);

  await page.evaluate(() => {
    const column = document.getElementById("call-screen-column");
    const listone = document.getElementById("listone-block");
    if (column === null || listone === null) throw new Error("prova 2: colonna incompleta");
    const fake = document.createElement("section");
    fake.id = "blocco-mai-dichiarato";
    fake.style.cssText = "height:120px;";
    fake.textContent = "un blocco che nessuno ha messo nel mastro";
    column.insertBefore(fake, listone);
  });
  await waitForCallScreenSettled(page);

  const findings = callScreenBudgetFindings(await sweepCallScreen(page, "ricerca"));
  expect(findings.map((f) => f.kind)).toEqual(["blocco-senza-riga"]);
  const line = describeCallScreenBudgetFinding(findings[0]!);
  expect(line).toContain("blocco-mai-dichiarato");
  expect(line).toContain("riserva disponibile");

  expect(externalRequests).toEqual([]);
});

test("PROVA 3 — una riga tolta al listone rompe l'uguaglianza derivata, non un tetto", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);
  await boot(page);

  await page.evaluate(() => {
    const row = document.querySelector(".listone-row");
    if (row === null) throw new Error("prova 3: nessuna riga di listone");
    row.remove();
  });
  await waitForCallScreenSettled(page);

  const sweep = await sweepCallScreen(page, "ricerca");
  const findings = callScreenBudgetFindings(sweep);

  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({ kind: "forma-listone", part: "righe" });
  // La prova che non è un `<=`: togliendo una riga il listone consuma MENO, e
  // un tetto sarebbe stato più contento di prima.
  const listone = sweep.blocks.find((b) => b.domId === "listone-block");
  expect(Math.round(listone!.consumptionPx)).toBeLessThan(LISTONE_ALLOCATION_PX);

  expect(externalRequests).toEqual([]);
});

test("PROVA 4 — schermata svuotata: rompe l'anti-vacuità, non passa per vuoto", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);
  await boot(page);

  await page.evaluate(() => {
    const column = document.getElementById("call-screen-column");
    if (column === null) throw new Error("prova 4: colonna assente");
    column.replaceChildren();
  });

  const findings = callScreenBudgetFindings(await sweepCallScreen(page, "ricerca"));
  expect(findings.some((f) => f.kind === "spazzata-vuota")).toBe(true);
  // E ogni riga obbligatoria dello stato viene nominata, una per una: la
  // spazzata non dice «vuoto», dice CHI manca.
  expect(findings.flatMap((f) => (f.kind === "riga-senza-blocco" ? [f.id] : []))).toEqual(
    CALL_SCREEN_BUDGET_LEDGER.filter((r) => r.requiredIn.includes("ricerca")).map((r) => r.id),
  );

  expect(externalRequests).toEqual([]);
});

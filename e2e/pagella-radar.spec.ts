import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  FULL_SCHEDA,
  OTHER_PLAYER,
  PAGELLA_SCHEDA,
  PAGELLA_SCHEDA_DIVERGENTE,
  PAGELLA_SCHEDA_PARZIALE,
  PAGELLA_SCHEDA_PORTIERE,
  PAGELLA_SCHEDA_RUOLO_SBAGLIATO,
  SCHEDA_PLAYER,
  schedeDeposit,
} from "./fixtures/synthetic-schede.js";
import {
  AA_NORMAL_TEXT,
  installSyntheticNetworkGuard,
  measureAllText,
} from "./helpers.js";
import type { ExpertScheda } from "../src/expertScheda.js";
import { EXPERT_SCHEDA_SCHEMA_VERSION } from "../src/expertScheda.js";
import type { ListonePlayer } from "../src/ui/listone.js";
import { PAGELLA_ASSI } from "../src/pagellaEsperti.js";
import { PAGELLA_EMPTY_TEXT } from "../src/ui/pagellaRadar.js";

// IL RADAR DELLA PAGELLA, SUL DOM VIVO.
//
// Quattro famiglie di prova, e nessuna sostituisce l'altra:
//
//  a. GLI STATI. Assente (oggi il caso normale), parziale, completo,
//     divergente. Le tre forme del dato mancante devono rendersi DIVERSE fra
//     loro e nessuna deve poter essere scambiata per uno zero.
//  b. IL RUOLO. Il quarto asse di un portiere e quello di un attaccante non
//     sono lo stesso asse, e a schermo non si chiamano allo stesso modo.
//  c. LA GEOMETRIA DELLA SCHERMATA. Il riquadro cresce di un blocco: qui si
//     MISURA la sua altezza e si rifà la misura del gesto principale
//     («ASSEGNA A» entro 560px, e2e/asta-gesto-principale.spec.ts) col radar
//     acceso e col pool alla scala del listone vero. L'argomento strutturale —
//     il riquadro sta sotto il gesto, quindi la sua altezza non lo riguarda —
//     regge, ma non si assume: si rimisura.
//  d. IL CONTRASTO. Ogni testo del blocco, misurato sul DOM vivo con la stessa
//     funzione della guardia d'insieme (e2e/text-contrast-aa.spec.ts), sopra
//     4,5:1. L'SVG non porta testo apposta — vedi src/ui/pagellaRadar.ts — e
//     questa prova è ciò che lo verifica invece di prometterlo.
//
// Tutto sintetico: pool, schede e voti sono inventati; la guardia di rete
// aborta e registra qualunque richiesta che non sia same-origin.

const SCHEDE_PATH = "/api/schede";
const TARGET = SYNTHETIC_LISTONE_POOL.find((p) => p.name === SCHEDA_PLAYER)!;

const PAGELLA = "#player-insight-pagella";

async function routeSchede(context: BrowserContext, schede: readonly ExpertScheda[]): Promise<void> {
  await context.route(`**${SCHEDE_PATH}`, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: schedeDeposit(schede) }),
  );
}

async function boot(
  page: Page,
  context: BrowserContext,
  schede: readonly ExpertScheda[],
  pool: readonly ListonePlayer[] = SYNTHETIC_LISTONE_POOL,
): Promise<string[]> {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, pool, externalRequests);
  await routeSchede(context, schede);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
  return externalRequests;
}

async function call(page: Page, name: string): Promise<void> {
  await page.getByText(name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#player-insight-panel")).toBeVisible();
}

// ── a. GLI STATI ─────────────────────────────────────────────────────────────

test("assente — oggi il caso normale: una frase, nessun pentagono, nessuno zero", async ({
  page,
  context,
}) => {
  // La scheda c'è (Pico l'ha scritta) ma la pagella no: è esattamente lo stato
  // in cui l'app resterà finché l'estrazione privata non esisterà.
  const external = await boot(page, context, [FULL_SCHEDA]);
  await call(page, TARGET.name);

  await expect(page.locator(PAGELLA)).toBeVisible();
  await expect(page.locator("#player-insight-pagella-empty")).toHaveText(PAGELLA_EMPTY_TEXT);
  // Niente disegno, niente elenco, niente totale — e soprattutto nessuno zero.
  await expect(page.locator("#player-insight-radar")).toHaveCount(0);
  await expect(page.locator("#player-insight-pagella-assi")).toHaveCount(0);
  await expect(page.locator("#player-insight-pagella-totale")).toHaveCount(0);
  await expect(page.locator(PAGELLA)).not.toContainText("0/10");

  // E COSTA POCO, che è metà del punto: lo stato assente è quello che l'app
  // mostra su OGNI giocatore finché l'estrazione privata non esiste. Misurato
  // 56px — una frase — contro i 219px del blocco disegnato. Un pentagono vuoto
  // su ogni chiamata sarebbe costato quei 219px per non dire niente.
  const altezza = await page
    .locator(PAGELLA)
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));
  expect(altezza, `lo stato assente è alto ${altezza}px`).toBeLessThanOrEqual(80);

  expect(external).toEqual([]);
});

test("completa — cinque voti, il poligono, e il totale che torna", async ({ page, context }) => {
  const external = await boot(page, context, [PAGELLA_SCHEDA]);
  await call(page, TARGET.name);

  // IL RADAR È DISEGNATO E NON SI VEDE. «Nascondi #pagella-radar e
  // .pagella__note» — Pico, 2026-08-29 — quindi l'asserzione è rovesciata, non
  // cancellata: il pentagono deve continuare a esistere nel documento con
  // tutti i suoi vertici (le due righe qui sotto li contano) e deve restare
  // fuori dalla vista. Il giorno in cui torna a schermo basta togliere una
  // regola di stile, e questa riga se ne accorge.
  await expect(page.locator("#player-insight-radar")).toHaveCount(1);
  await expect(page.locator("#player-insight-radar")).toBeHidden();
  // La didascalia, nascosta con lui, per la stessa ragione e con la stessa
  // pretesa: scritta nel documento, non a schermo.
  await expect(page.locator("#player-insight-pagella-note")).toBeHidden();
  await expect(page.locator("#player-insight-pagella-assi li")).toHaveCount(PAGELLA_ASSI);
  await expect(page.locator("#player-insight-pagella-totale")).toContainText("39/50");
  await expect(page.locator("#player-insight-pagella-totale")).toContainText("coincide");
  // I cinque punti e il poligono, contati sul DOM vivo.
  await expect(page.locator("#player-insight-radar .pagella-radar__dot")).toHaveCount(PAGELLA_ASSI);
  await expect(page.locator("#player-insight-radar .pagella-radar__shape")).toHaveCount(1);
  // Il voto della titolarità NON si legge come la pastiglia categorica sopra.
  await expect(page.locator("#player-insight-pagella-titolarita")).toContainText("Titolarità (voto)");
  await expect(page.locator("#player-insight-pagella-titolarita")).toContainText("9/10");
  await expect(page.locator("#player-insight-track")).toContainText("ballottaggio");

  expect(external).toEqual([]);
});

test("parziale — i punti che ci sono e NESSUN poligono: un vertice mancante non è uno zero", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [PAGELLA_SCHEDA_PARZIALE]);
  await call(page, TARGET.name);

  await expect(page.locator("#player-insight-radar .pagella-radar__dot")).toHaveCount(2);
  await expect(page.locator("#player-insight-radar .pagella-radar__shape")).toHaveCount(0);
  // Le cinque righe restano cinque: tre dicono «n/d», non «0» e non vuoto.
  await expect(page.locator("#player-insight-pagella-assi li")).toHaveCount(PAGELLA_ASSI);
  await expect(page.locator("#player-insight-pagella-assi .pagella-asse--missing")).toHaveCount(3);
  await expect(page.locator("#player-insight-pagella-totale")).toContainText("non calcolabile");
  await expect(page.locator("#player-insight-pagella-totale")).toContainText("numero falso");

  expect(external).toEqual([]);
});

test("divergente — la somma e il totale della fonte NON coincidono, e restano tutti e due", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [PAGELLA_SCHEDA_DIVERGENTE]);
  await call(page, TARGET.name);

  const totale = page.locator("#player-insight-pagella-totale");
  await expect(totale).toContainText("39/50");
  await expect(totale).toContainText("41/50");
  await expect(totale).toContainText("letto male");
  await expect(totale).toHaveClass(/pagella__totale--divergente/);

  expect(external).toEqual([]);
});

// ── b. IL RUOLO ──────────────────────────────────────────────────────────────

test("il quarto asse cambia col ruolo: porta inviolata al portiere, bonus al movimento", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [PAGELLA_SCHEDA, PAGELLA_SCHEDA_PORTIERE]);

  await call(page, OTHER_PLAYER);
  await expect(page.locator("#player-insight-pagella-porta-inviolata")).toContainText(
    "Porta inviolata",
  );
  await expect(page.locator("#player-insight-pagella-bonus")).toHaveCount(0);
  await expect(page.locator("#player-insight-pagella-totale")).toContainText("12/50");

  // Stessa schermata, altro giocatore: l'asse è un altro, e si chiama altro.
  await page.goto("/");
  await expect(page.locator("#search-player")).toBeVisible();
  await call(page, TARGET.name);
  await expect(page.locator("#player-insight-pagella-bonus")).toContainText("Bonus");
  await expect(page.locator("#player-insight-pagella-porta-inviolata")).toHaveCount(0);

  expect(external).toEqual([]);
});

test("asse del ruolo sbagliato — il voto non si usa e la riga lo dichiara", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [PAGELLA_SCHEDA_RUOLO_SBAGLIATO]);
  await call(page, OTHER_PLAYER);

  const mismatch = page.locator("#player-insight-pagella-mismatch");
  await expect(mismatch).toBeVisible();
  await expect(mismatch).toContainText("Bonus");
  await expect(mismatch).toContainText("Porta inviolata");
  await expect(mismatch).toContainText("non è stato usato");
  // Il quarto asse resta senza voto: nessun 6 riciclato su «porta inviolata».
  await expect(page.locator("#player-insight-pagella-porta-inviolata")).toContainText("n/d");
  await expect(page.locator("#player-insight-pagella-totale")).toContainText("non verificabile");

  expect(external).toEqual([]);
});

// ── c. LA GEOMETRIA DELLA SCHERMATA ──────────────────────────────────────────

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

/** Lo stesso budget di e2e/asta-gesto-principale.spec.ts, non una copia più larga. */
const ASSIGN_HEADING_BUDGET_PX = 560;

const ROLES = ["P", "D", "C", "A"] as const;

/** Pool sintetico alla scala del listone privato (532 righe), come nella spec del gesto. */
const LARGE_POOL: readonly ListonePlayer[] = Array.from({ length: 532 }, (_, i) => ({
  name: `Sintetico ${String(i + 1).padStart(3, "0")}`,
  role: ROLES[i % ROLES.length]!,
  club: `Club${(i % 20) + 1}`,
  quotation: 1 + (i % 40),
}));

/** Il chiamato di quella spec — un attaccante, quindi quarto asse «bonus». */
const LARGE_CALLED = LARGE_POOL[3]!;

const LARGE_SCHEDA: ExpertScheda = {
  player: LARGE_CALLED.name,
  club: LARGE_CALLED.club,
  titolarita: "ballottaggio",
  percentuale: 60,
  nota: "Scheda sintetica, scritta per misurare l'altezza della schermata.",
  aggiornata: "2026-08-30",
  fonte: "scheda",
  pagella: {
    voti: {
      pagella_titolarita: 9,
      pagella_media_voto: 7,
      pagella_salute: 9,
      pagella_bonus: 6,
      pagella_consiglio: 8,
    },
    totaleFonte: 41,
  },
};

test("il radar non sposta il gesto principale: «ASSEGNA A» resta entro il budget", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  await installSyntheticNetworkGuard(context, LARGE_POOL, external);
  await context.route(`**${SCHEDE_PATH}`, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schemaVersion: EXPERT_SCHEDA_SCHEMA_VERSION, schede: [LARGE_SCHEDA] }),
    }),
  );

  for (const viewport of VIEWPORTS) {
    const where = `${viewport.width}×${viewport.height}`;
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator("#search-player")).toBeVisible();
    await call(page, LARGE_CALLED.name);

    // Il radar è DAVVERO disegnato: senza questa riga la misura sotto
    // proverebbe che una schermata senza radar sta nel budget, che si sapeva
    // già. Da quando il radar è nascosto (vedi il test «completa») la prova
    // che sia disegnato è la sua presenza nel documento, non la sua
    // visibilità — e la misura del gesto qui sotto vale ANCHE DI PIÙ: il
    // pentagono nascosto non costa più altezza, e «ASSEGNA A» deve restare
    // entro il budget lo stesso.
    await expect(page.locator("#player-insight-radar")).toHaveCount(1);

    const g = await page.evaluate(() => {
      window.scrollTo(0, 0);
      const heading = [...document.querySelectorAll(".panel-title")].find(
        (el) => (el.textContent ?? "").trim() === "ASSEGNA A",
      );
      if (heading === undefined) throw new Error("gesto: nessun titolo «ASSEGNA A»");
      const button = [...document.querySelectorAll("button")].find(
        (b) => (b.textContent ?? "").trim() === "Registra acquisto",
      );
      if (button === undefined) throw new Error("gesto: nessun bottone «Registra acquisto»");
      const pagella = document.getElementById("player-insight-pagella");
      if (pagella === null) throw new Error("pagella: il blocco non è a schermo");
      const br = button.getBoundingClientRect();
      const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
      return {
        headingTop: Math.round(heading.getBoundingClientRect().top + window.scrollY),
        pagellaHeight: Math.round(pagella.getBoundingClientRect().height),
        pagellaTop: Math.round(pagella.getBoundingClientRect().top + window.scrollY),
        buttonInViewport: br.top >= 0 && br.bottom <= window.innerHeight + 1,
        buttonHitsSelf: hit !== null && (hit === button || button.contains(hit)),
        noHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
      };
    });

    // ASSERZIONE INVERTITA — e la ragione strutturale è cambiata, non sparita.
    //
    // Qui si pretendeva che la pagella stesse SOTTO il gesto e che il gesto
    // restasse entro un budget di distanza dal documento. Dal 2026-08-29 la
    // pagella sta dentro la scheda del chiamato e quindi SOPRA il gesto, ed è
    // esattamente il cambiamento che ha reso impossibile il vecchio budget:
    // col radar acceso «ASSEGNA A» finiva a 845px su una finestra alta 900.
    //
    // Pico ha fissato il gesto in fondo allo schermo, e con lui la garanzia si
    // è spostata di un piano: non più «la pagella non lo spinge giù», ma «dove
    // stia la pagella non lo riguarda». Si asserisce quindi che la pagella sia
    // sopra — è il posto chiesto — e che il gesto resti in vista lo stesso.
    expect(
      g.pagellaTop,
      `${where}: la pagella deve stare SOPRA il gesto, dentro la scheda del chiamato`,
    ).toBeLessThan(g.headingTop);

    expect(
      g.buttonInViewport,
      `${where}: col radar acceso il gesto è in vista (pagella alta ${g.pagellaHeight}px)`,
    ).toBe(true);
    expect(g.buttonHitsSelf, `${where}: il centro del bottone risponde al bottone`).toBe(true);

    // IL TETTO DEL BLOCCO, e da dove viene il numero. Misurato 219px su questo
    // albero con questa fixture (radar 116px, cinque righe, riga del totale,
    // didascalia). La soglia sta a 240: ~20px di margine, cioè una riga di
    // testo in più che va a capo su uno schermo stretto — non abbastanza per
    // farci entrare una sezione nuova senza accorgersene. Con «ASSEGNA A»
    // misurato a 430px, cioè ESATTAMENTE dov'era senza radar, il budget del
    // gesto non è nemmeno sfiorato: il tetto qui serve a tenere il blocco una
    // fascia della colonna e non una seconda schermata.
    expect(
      g.pagellaHeight,
      `${where}: il blocco pagella è alto ${g.pagellaHeight}px`,
    ).toBeLessThanOrEqual(240);

    expect(g.buttonInViewport, `${where}: «Registra acquisto» resta in vista`).toBe(true);
    expect(g.buttonHitsSelf, `${where}: il centro del bottone risponde al bottone`).toBe(true);
    expect(g.noHorizontalScroll, `${where}: nessuno scorrimento orizzontale`).toBe(true);
  }

  expect(external).toEqual([]);
});

test("nessuno scorrimento laterale a schermo stretto, col radar acceso", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [PAGELLA_SCHEDA]);
  for (const width of [390, 560, 768, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("#search-player")).toBeVisible();
    await call(page, TARGET.name);
    await expect(page.locator("#player-insight-radar")).toHaveCount(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(overflow, `${width}px: nessuno scorrimento orizzontale`).toBe(true);
  }
  expect(external).toEqual([]);
});

// ── d. IL CONTRASTO ──────────────────────────────────────────────────────────

test("ogni testo del blocco pagella si legge: sopra AA, in tutti gli stati", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [
    PAGELLA_SCHEDA_DIVERGENTE,
    PAGELLA_SCHEDA_RUOLO_SBAGLIATO,
  ]);

  for (const who of [TARGET.name, OTHER_PLAYER]) {
    await page.goto("/");
    await expect(page.locator("#search-player")).toBeVisible();
    await call(page, who);
    await expect(page.locator(PAGELLA)).toBeVisible();

    const measured = await measureAllText(page, `${PAGELLA}, ${PAGELLA} *`);
    // La spazzata deve aver guardato QUALCOSA: una spazzata vuota passerebbe.
    expect(measured.length, `${who}: la spazzata del blocco pagella non vede testo`).toBeGreaterThan(
      4,
    );
    for (const item of measured) {
      if (item.kind === "unclassified") {
        throw new Error(`${who}: testo non classificabile — ${item.label}: ${item.reason}`);
      }
      expect(
        item.ratio,
        `${who}: ${item.label} a ${item.ratio.toFixed(2)}:1 (${item.fg} su ${item.bg}, ${item.fontSize}px)`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  }

  expect(external).toEqual([]);
});

// ── e. IL RADAR NELLA SCHERMATA DI CHIAMATA ──────────────────────────────────
//
// IL DIFETTO CHE QUESTA PROVA IMPEDISCE DI RIFARE, segnalato da Pico: il radar
// «durante l'asta» non compariva, e non perché fosse scrollato via — il
// riquadro che lo contiene era montato SOLO dal momento d'asta, cioè dopo
// «Avvia». Nella schermata di CHIAMATA, dove si guarda il giocatore prima di
// decidere se chiamarlo, non esisteva nel DOM.
//
// ASSERZIONE INVERTITA — il riquadro NON è più nella schermata di chiamata.
//
// Ci stava da #333, e questo test pretendeva che ci fosse appena una riga era
// selezionata. Pico l'ha spostato il 2026-08-29: «si visualizza durante la
// scelta del giocatore mentre dovrebbe vedersi durante l'asta dentro
// #call-card come secondo figlio». Qui parlava di un giocatore che nessuno
// aveva ancora chiamato, e costava alla schermata più affollata del prodotto.
//
// Il test resta, invertito, e continua a servire: prova che il riquadro non
// torni di soppiatto in una schermata da cui è stato tolto di proposito, e
// che il MOMENTO D'ASTA invece ce l'abbia — cioè che sia stato spostato e non
// perso. Le due metà insieme sono la differenza fra «tolto» e «rotto».

test("il radar NON sta nella schermata di chiamata, e sta nel momento d'asta", async ({
  page,
  context,
}) => {
  const external = await boot(page, context, [PAGELLA_SCHEDA]);

  // Prima del clic: nessun soggetto, nessun riquadro.
  await expect(page.locator("#player-insight-panel")).toHaveCount(0);

  // Un clic sulla riga — NON «Avvia»: si resta nella schermata di chiamata.
  await page.getByText(TARGET.name, { exact: true }).click();
  await expect(page.locator("#nomination-context")).toBeVisible();
  await expect(page.locator("#assign-price")).toHaveCount(0);

  // E il riquadro NON c'è: qui il giocatore non è ancora stato chiamato.
  await expect(page.locator("#player-insight-panel")).toHaveCount(0);

  // Ora si avvia il momento d'asta, ed è là che il riquadro deve comparire.
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#assign-price")).toBeVisible();

  // Il riquadro c'è, col radar disegnato — nascosto a schermo dal 2026-08-29,
  // vedi il test «completa» — e i cinque assi.
  await expect(page.locator("#player-insight-panel")).toBeVisible();
  await expect(page.locator("#player-insight-radar")).toHaveCount(1);
  await expect(page.locator("#player-insight-pagella-assi li")).toHaveCount(PAGELLA_ASSI);
  await expect(page.locator("#player-insight-pagella-totale")).toContainText("39/50");
  // E la striscia delle icone, che è l'altra metà della colonna del disegno:
  // QUATTRO, perché questa scheda non mette il giocatore in nessuna delle tre
  // liste editoriali e la quinta casella «appare solo se» — fail-closed.
  await expect(page.locator("#player-insight-icone > li")).toHaveCount(4);
  // Il rango della fila arriva fin qui: la scheda dichiara 1° sui rigori.
  await expect(page.locator("#player-insight-icona-rigorista .scheda-icona__rango")).toHaveText(
    "1\u00b0",
  );

  // IL POSTO, asserito per posizione. Le due ancore di prima — CONTESTO
  // CHIAMATA e GIOCATORE SUGGERITO — appartengono alla schermata di chiamata e
  // qui non esistono più: cercarle faceva scadere il test invece di fallire,
  // che è il modo peggiore di dire una cosa vera.
  //
  // L'ancora giusta è la scheda che lo contiene: secondo figlio, subito sotto
  // la riga d'identità del chiamato (Pico, 2026-08-29).
  expect(
    await page.evaluate(() => {
      const card = document.getElementById("call-card");
      return card === null ? "" : (card.children[1]?.id ?? "");
    }),
  ).toBe("player-insight-panel");

  expect(external).toEqual([]);
});

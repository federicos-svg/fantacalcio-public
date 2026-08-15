import { expect, test, type Page } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import { gotoScreen, installSyntheticNetworkGuard } from "./helpers.js";

// I FATTI MISURATI DEL MOMENTO LIVE, sullo schermo.
//
// The `asta` moment used to mount three DEV STATICO placeholders — INSIGHT
// GIOCATORE, MOMENTO DELL'ASTA, AVVERSARI — on the tightest screen of the
// app: three blocks that declared themselves empty while the engine already
// knew the answer to two of them. This spec proves the two that could be
// answered now ARE answered, from the event log alone, and that the third is
// still honestly empty rather than filled with a number nobody measured.
//
// What is asserted, and why each assertion is load-bearing:
//  1. MOMENTO DELL'ASTA carries roleScarcity() — the same panel the chiamata
//     moment already had — plus residualPressure()'s census of credits and
//     slots still on the table;
//  2. AVVERSARI carries competitorSet(): who can still reach the figure being
//     TYPED, which means the block has to follow the price field without a
//     full re-render (that field never calls render(), on purpose — it would
//     take focus and caret mid-auction);
//  3. the three exclusion reasons stay distinct (ruolo pieno / sotto la
//     soglia / budget bloccato): collapsing them would tell the operator the
//     wrong thing about why a rival is out;
//  4. INSIGHT GIOCATORE keeps its DEV STATICO marker — nothing was removed,
//     and the one block that still has no measurable fact still says so;
//  5. no directive output reaches any of it (docs/NO_GO.md §Prodotto).
//
// Every row is synthetic and the network guard aborts anything else.

const LIVE_POOL: readonly ListonePlayer[] = [
  { name: "Primo Portiere", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Secondo Portiere", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Terzo Portiere", role: "P", club: "ClubDue", quotation: 5 },
  { name: "Quarto Portiere", role: "P", club: "ClubDue", quotation: 5 },
  { name: "Primo Difensore", role: "D", club: "ClubTre", quotation: 8 },
  { name: "Primo Attaccante", role: "A", club: "ClubQuattro", quotation: 20 },
];

const CALLED = "Quarto Portiere";

// docs/DECISIONS.md §D9 / docs/NO_GO.md §Prodotto: these blocks are measured
// facts. Not one of these words may appear on the surface they build.
const DIRECTIVE =
  /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|consigl|dovresti|spingi|ranking|projection/i;

/**
 * Contrasto REALE del testo di un elemento, misurato sul DOM vivo: colore e
 * sfondo si leggono da getComputedStyle e si convertono via canvas (che sa
 * risolvere `oklch()` come lo risolve il browser), poi si compone l'eventuale
 * `opacity` degli antenati contro lo sfondo che sta sotto il gruppo di
 * composizione, esattamente come fa il compositore.
 *
 * Serve perché la regressione che questo test blocca era invisibile al
 * codice: `--text-dim` di per sé è un token accettato altrove, ma dentro una
 * riga con `opacity: 0.78` diventava 1,99:1 — sotto qualunque soglia
 * leggibile. Un test sul solo nome del token non l'avrebbe mai vista.
 */
async function textContrast(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) throw new Error(`contrasto: nessun elemento per ${sel}`);

    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const parse = (color: string): readonly [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
    };
    const mix = (
      src: readonly [number, number, number, number],
      dst: readonly [number, number, number, number],
      alpha: number,
    ): readonly [number, number, number, number] =>
      [0, 1, 2, 3].map((i) => alpha * src[i]! + (1 - alpha) * dst[i]!) as unknown as [
        number,
        number,
        number,
        number,
      ];
    const luminance = (c: readonly [number, number, number, number]): number => {
      const [r, g, b] = [c[0], c[1], c[2]].map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    // La catena dall'elemento fino alla radice, con la sua opacità.
    const chain: Element[] = [];
    for (let node: Element | null = el; node !== null; node = node.parentElement) chain.push(node);
    const alphas = chain.map((node) => Number(getComputedStyle(node).opacity));
    const cumulative = alphas.reduce((acc, a) => acc * a, 1);
    // L'antenato più alto che apre un gruppo di composizione (opacity < 1).
    let groupTop = -1;
    alphas.forEach((a, i) => {
      if (a < 1) groupTop = i;
    });

    const bgAt = (from: number): readonly [number, number, number, number] => {
      for (let i = from; i < chain.length; i++) {
        const bg = parse(getComputedStyle(chain[i]!).backgroundColor);
        if (bg[3] > 0) return bg;
      }
      return [255, 255, 255, 1];
    };
    // Sotto il gruppo: ciò contro cui l'intero layer viene composto.
    const backdrop = bgAt(groupTop + 1);
    // Dentro il gruppo: lo sfondo su cui il testo è davvero disegnato.
    const own = bgAt(0);

    const fg = mix(parse(getComputedStyle(el).color), backdrop, cumulative);
    const bg = mix(own, backdrop, cumulative);
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  }, selector);
}

/** Quante righe occupa davvero il testo di un elemento. */
async function lineBoxes(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) throw new Error(`righe: nessun elemento per ${sel}`);
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getClientRects().length;
  }, selector);
}

/** Opens the live moment on a player, from the chiamata screen. */
async function callPlayer(page: Page, name: string): Promise<void> {
  await page.getByText(name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#moment-facts-panel")).toBeVisible();
}

/** Records one purchase through the ordinary form path. */
async function buy(page: Page, name: string, teamId: string, price: number): Promise<void> {
  await callPlayer(page, name);
  await page.locator("#assign-team").selectOption(teamId);
  await page.locator("#assign-price").fill(String(price));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  // A recorded purchase returns to the chiamata moment.
  await expect(page.locator("#role-scarcity-panel")).toBeVisible();
}

test("the live moment carries scarcity, the market census and who can reach the figure", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LIVE_POOL, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // ── Stato vuoto: asta appena aperta ───────────────────────────────────────
  await callPlayer(page, CALLED);

  // MOMENTO DELL'ASTA — scarsità dal log, disponibilità dal listone caricato.
  // 8 squadre x 3 slot P = 24 slot liberi; 4 portieri nel listone, nessuno
  // ancora venduto.
  await expect(page.locator("#moment-scarcity-slots-P")).toHaveText("24");
  await expect(page.locator("#moment-scarcity-pool-P")).toHaveText("4");
  await expect(page.locator("#moment-scarcity-slots-A")).toHaveText("56");
  // Il ruolo in asta è marcato, e in parole, non solo col colore.
  await expect(page.locator("#moment-scarcity-P")).toHaveClass(/moment-scarcity__cell--called/);
  await expect(page.locator("#moment-scarcity-P")).toContainText("in asta");
  await expect(page.locator(".moment-scarcity__cell--called")).toHaveCount(1);

  // MERCATO — censimento: 8 x 500 crediti, 8 x 28 slot, esattamente la
  // dotazione iniziale per slot (500/28).
  await expect(page.locator("#moment-market-credits")).toHaveText("4000");
  await expect(page.locator("#moment-market-slots")).toHaveText("224");
  await expect(page.locator("#moment-market-per-slot")).toHaveText("17,9 cr");
  await expect(page.locator("#moment-market-delta")).toHaveText("0%");
  await expect(page.locator("#moment-market-basis")).toContainText("Censimento su 8 squadre");

  // AVVERSARI — nessun prezzo ancora inserito: la domanda degrada a quella
  // onesta più debole (chi può entrare al rilancio minimo), dichiarata.
  await expect(page.locator("#opponent-reach-headline")).toContainText("7 rivali su 7");
  await expect(page.locator("#opponent-reach-headline")).toContainText("al rilancio minimo (1 cr)");
  await expect(page.locator("#opponent-reach-eligible .opponent-reach__row")).toHaveCount(7);
  // La propria squadra non è mai fra i rivali.
  await expect(page.locator("#opponent-reach-Io")).toHaveCount(0);
  // Entrambi i gruppi restano presenti anche quando uno è vuoto.
  await expect(page.locator("#opponent-reach-excluded")).toContainText("Nessun rivale è fuori");

  // ── Il blocco segue la cifra che si sta digitando ─────────────────────────
  await page.locator("#assign-price").fill("30");
  await expect(page.locator("#opponent-reach-headline")).toHaveText(
    "7 rivali su 7 possono arrivare a 30 cr",
  );
  await expect(page.locator("#opponent-reach-eligible")).toContainText("PUÒ ARRIVARE A 30 CR");
  // max bid di una squadra intonsa: 500 − 27 = 473; slot P liberi: 3.
  await expect(page.locator("#opponent-reach-Squadra2")).toContainText("473");
  await expect(page.locator("#opponent-reach-Squadra2")).toContainText("3");
  // ...senza che il campo prezzo perda il fuoco: quel campo non chiama
  // render() proprio per questo, e l'aggiornamento in place deve rispettarlo.
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("assign-price");

  // ── Il titolo dice ciò che il pannello misura, non un'intenzione ──────────
  await expect(page.locator("#opponent-reach-panel .panel-title")).toHaveText(
    "AVVERSARI: CHI PUÒ ARRIVARCI",
  );
  // `competitorSet` ha `basis: "hard-constraints"`: la parola «interesse» non
  // deve comparire da nessuna parte in questo pannello, titolo compreso.
  expect(await page.locator("#opponent-reach-panel").innerText()).not.toMatch(/interess/i);
  // La smentita nel corpo resta comunque: precisa la lettura dei numeri.
  await expect(page.locator("#opponent-reach-note")).toContainText("non significa «lo vuole»");

  // ── INSIGHT GIOCATORE: ancora onestamente vuoto, e ancora lì ──────────────
  await expect(page.getByText("INSIGHT GIOCATORE", { exact: true })).toBeVisible();
  await expect(page.getByText("DEV STATICO", { exact: true })).toHaveCount(1);

  // ── Nessun output direttivo su questa schermata ───────────────────────────
  expect(await page.locator("#moment-facts-panel").innerText()).not.toMatch(DIRECTIVE);
  expect(await page.locator("#opponent-reach-panel").innerText()).not.toMatch(DIRECTIVE);
  await expect(page.locator("#opponent-reach-note")).toContainText("Solo vincolo duro");
  await expect(page.locator("#opponent-reach-note")).toContainText("non significa «lo vuole»");
  await expect(page.locator("#moment-facts-note")).toContainText("nessun dato di modello");

  // Nessuno dei due blocchi segue l'utente fuori dal momento asta.
  await page.getByText("← Indietro alla ricerca").click();
  await expect(page.locator("#moment-facts-panel")).toHaveCount(0);
  await expect(page.locator("#opponent-reach-panel")).toHaveCount(0);
  await gotoScreen(page, "Rose");
  await expect(page.locator("#moment-facts-panel")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("ruolo esaurito e budget esaurito restano due fatti distinti, per la squadra giusta", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LIVE_POOL, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Squadra2 riempie i suoi 3 slot P al minimo: ruolo pieno, budget intatto.
  await buy(page, "Primo Portiere", "Squadra2", 1);
  await buy(page, "Secondo Portiere", "Squadra2", 1);
  await buy(page, "Terzo Portiere", "Squadra2", 1);

  // Squadra3 spende tutto il suo max bid sicuro su un attaccante: slot P
  // ancora liberi, ma il tetto residuo scende a 1 credito.
  await buy(page, "Primo Attaccante", "Squadra3", 473);

  await callPlayer(page, CALLED);
  await page.locator("#assign-price").fill("30");

  // ── Le due esclusioni non si confondono ───────────────────────────────────
  await expect(page.locator("#opponent-reach-headline")).toHaveText(
    "5 rivali su 7 possono arrivare a 30 cr",
  );
  await expect(page.locator("#opponent-reach-Squadra2")).toContainText("ruolo pieno");
  await expect(page.locator("#opponent-reach-Squadra2")).toContainText("0"); // slot P residui
  await expect(page.locator("#opponent-reach-Squadra3")).toContainText("sotto la soglia");
  await expect(page.locator("#opponent-reach-Squadra3")).toContainText("1"); // max bid residuo
  await expect(page.locator("#opponent-reach-excluded .opponent-reach__row")).toHaveCount(2);
  await expect(page.locator("#opponent-reach-eligible .opponent-reach__row")).toHaveCount(5);

  // ── Il motivo dell'esclusione deve essere LEGGIBILE ───────────────────────
  // È l'informazione più utile della riga, e viveva in una riga con
  // `opacity: 0.78` che la portava a 1,99:1. Misurato sul DOM vivo, non
  // dedotto dal nome del token: AA pieno (4,5:1) perché è testo piccolo.
  const reason = "#opponent-reach-Squadra2 .opponent-reach__reason";
  expect(await textContrast(page, reason)).toBeGreaterThanOrEqual(4.5);
  // E nessun antenato della riga esclusa può rimettere un'opacità: era quella
  // a moltiplicare contro lo sfondo ogni cifra e ogni parola della riga.
  expect(
    await page.evaluate(() => {
      let node = document.querySelector("#opponent-reach-Squadra2");
      while (node !== null) {
        if (Number(getComputedStyle(node).opacity) < 1) return false;
        node = node.parentElement;
      }
      return true;
    }),
  ).toBe(true);
  // Anche il resto della riga esclusa resta sopra AA: nome e numeri.
  expect(
    await textContrast(page, "#opponent-reach-Squadra2 .opponent-reach__name"),
  ).toBeGreaterThanOrEqual(4.5);
  expect(
    await textContrast(page, "#opponent-reach-Squadra2 .opponent-reach__bid"),
  ).toBeGreaterThanOrEqual(4.5);

  // Abbassando la soglia sotto il tetto di Squadra3, quella squadra rientra:
  // è un vincolo aritmetico, non un giudizio su di lei.
  await page.locator("#assign-price").fill("1");
  await expect(page.locator("#opponent-reach-headline")).toHaveText(
    "6 rivali su 7 possono arrivare a 1 cr",
  );
  await expect(page.locator("#opponent-reach-Squadra2")).toContainText("ruolo pieno");

  // ── Il momento si è mosso con l'asta ──────────────────────────────────────
  // 24 − 3 slot P; 4 − 3 portieri ancora a listone; 56 − 1 slot A.
  await expect(page.locator("#moment-scarcity-slots-P")).toHaveText("21");
  await expect(page.locator("#moment-scarcity-pool-P")).toHaveText("1");
  await expect(page.locator("#moment-scarcity-slots-A")).toHaveText("55");
  await expect(page.locator("#moment-scarcity-pool-A")).toHaveText("0");

  // 4000 − 476 crediti su 224 − 4 slot = 16,0 per slot, contro i 17,9 di
  // partenza: il tavolo ha pagato sopra la propria dotazione per slot.
  await expect(page.locator("#moment-market-credits")).toHaveText("3524");
  await expect(page.locator("#moment-market-slots")).toHaveText("220");
  await expect(page.locator("#moment-market-per-slot")).toHaveText("16,0 cr");
  await expect(page.locator("#moment-market-delta")).toHaveText("−10%");
  await expect(page.locator("#moment-market-delta")).toHaveClass(/moment-market__delta--down/);

  expect(externalRequests).toEqual([]);
});

test("senza listone caricato la disponibilità resta n/d e i rivali restano contati", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  // Nessun listone: l'asset statico risponde con un payload vuoto e il
  // deposito privato non è raggiungibile. Gli slot liberi vengono dal log e
  // restano un numero; la disponibilità a listone non esiste e lo dice.
  await installSyntheticNetworkGuard(context, [], externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Senza pool non c'è riga da cliccare: il momento asta si raggiunge
  // dall'inserimento manuale del giocatore chiamato.
  await page.locator("#search-player").fill("Ignoto Sintetico");
  const avvia = page.getByRole("button", { name: /^Avvia/ });
  // Senza correlazione con una riga del listone l'avvio resta disabilitato:
  // è la barriera esistente, e non è questo blocco a doverla aggirare.
  await expect(avvia).toBeDisabled();

  // Il pannello scarsità del momento CHIAMATA mostra già l'onestà attesa,
  // ed è la stessa che il momento LIVE mostrerebbe: n/d, mai 0.
  await expect(page.locator("#scarcity-pool-P")).toHaveText("n/d");
  await expect(page.locator("#scarcity-slots-P")).toHaveText("24");

  expect(externalRequests).toEqual([]);
});

test("offline non regredisce: i due blocchi restano pieni e corretti", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LIVE_POOL, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText(CALLED, { exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  // Entrambi i blocchi sono funzioni pure dello stato già ridotto: niente
  // rete, niente fetch, niente degrado.
  await callPlayer(page, CALLED);
  await expect(page.locator("#moment-market-per-slot")).toHaveText("17,9 cr");
  await expect(page.locator("#moment-scarcity-slots-P")).toHaveText("24");
  await page.locator("#assign-price").fill("12");
  await expect(page.locator("#opponent-reach-headline")).toHaveText(
    "7 rivali su 7 possono arrivare a 12 cr",
  );

  // E l'acquisto registrato offline si riflette sui blocchi al giro dopo.
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#critical-budget")).toHaveText("488 cr");
  await callPlayer(page, "Primo Portiere");
  await expect(page.locator("#moment-scarcity-pool-P")).toHaveText("3");
  await expect(page.locator("#moment-market-credits")).toHaveText("3988");

  expect(externalRequests).toEqual([]);
});

test("i due blocchi restano leggibili a 390, 768 e 1280 senza scroll orizzontale", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LIVE_POOL, externalRequests);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 720 },
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await callPlayer(page, CALLED);

    // Due pannelli densi affiancati impilano sotto i 900px invece di
    // comprimersi sotto la soglia di leggibilità.
    const columns = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".moment-blocks-grid")!)
          .gridTemplateColumns.trim()
          .split(/\s+/).length,
    );
    expect(columns).toBe(viewport.width < 900 ? 1 : 2);

    // Le quattro celle di ruolo ci sono a ogni larghezza: il nome esteso del
    // ruolo esce dalla vista sotto i 560px ma resta nell'albero di
    // accessibilità, non viene eliminato.
    await expect(page.locator(".moment-scarcity__cell")).toHaveCount(4);
    await expect(page.locator("#moment-scarcity-P")).toContainText("Portieri");

    await expect(page.locator("#opponent-reach-eligible .opponent-reach__row")).toHaveCount(7);
    // Il titolo. A 768 e 1280 deve stare su UNA riga: lì il margine è ampio e
    // un titolo che va a capo segnala che qualcuno l'ha allungato senza
    // guardare. A 390 il margine misurato è di 2px, quindi la pretesa è più
    // debole ma comunque stringente: mai più di due righe (quante ne prendeva
    // il titolo vecchio) e mai traboccare fuori dalla propria scatola.
    const titleSel = "#opponent-reach-panel .panel-title";
    const titleLines = await lineBoxes(page, titleSel);
    if (viewport.width >= 700) expect(titleLines).toBe(1);
    expect(titleLines).toBeLessThanOrEqual(2);
    expect(
      await page.evaluate((sel) => {
        const el = document.querySelector(sel)!;
        return el.scrollWidth <= el.clientWidth;
      }, titleSel),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }

  expect(externalRequests).toEqual([]);
});

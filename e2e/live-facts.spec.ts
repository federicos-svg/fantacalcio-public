import { expect, test, type Page } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import {
  AA_NORMAL_TEXT,
  gotoScreen,
  installSyntheticNetworkGuard,
  textContrast,
} from "./helpers.js";
import {
  CALLED_CLUB,
  PEOPLE,
  seedPrecedents,
} from "./fixtures/synthetic-precedents.js";

// I FATTI MISURATI DEL MOMENTO LIVE, sullo schermo.
//
// The `asta` moment used to mount three DEV STATICO placeholders — INSIGHT
// GIOCATORE, MOMENTO DELL'ASTA, AVVERSARI — on the tightest screen of the
// app: three blocks that declared themselves empty while the engine already
// knew the answer to two of them. This spec proves the two that could be
// answered now ARE answered, and that the third is still honestly empty
// rather than filled with a number nobody measured.
//
// What is asserted, and why each assertion is load-bearing:
//  1. MOMENTO DELL'ASTA carries roleScarcity() — the same panel the chiamata
//     moment already had — plus residualPressure()'s census of credits and
//     slots still on the table;
//  2. AVVERSARI carries auctionPrecedents(): che cosa ogni avversario ha già
//     fatto che riguardi il giocatore chiamato, contato sullo storico d'asta
//     multi-stagione — con la prova accanto e la numerosità in vista;
//  3. quel pannello NON mostra più la raggiungibilità per vincolo duro (#331
//     punto 1, decisione di Pico): la spec fallisce se quella torna, e
//     verifica nella stessa scena che max bid, budget e slot per ruolo siano
//     rimasti visibili dove vivono adesso — nessuna informazione è sparita;
//  4. INSIGHT GIOCATORE è ancora lì e, senza deposito raggiungibile, è ancora
//     onestamente vuoto — ma non è più un segnaposto DEV STATICO: porta le
//     schede del Gruppo Esperti servite a runtime (src/expertScheda.ts), e in
//     questa scena l'endpoint non risponde JSON, quindi lo stato è
//     `source_unavailable` e il riquadro lo DICE. La prova che il blocco resta
//     onesto è cambiata di forma insieme al blocco: qui si verifica lo stato
//     onesto e la dichiarazione di non-validazione, in e2e/player-insight.spec.ts
//     tutti e cinque gli stati;
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

/* `textContrast` vive in e2e/helpers.ts: la stessa misura la usa ora anche
   e2e/text-contrast-aa.spec.ts, che la estende a tutta l'app. Una copia
   sola — due copie potrebbero divergere proprio sul calcolo che fa da
   guardia. Motivazione completa e algoritmo: helpers.ts. */

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
  // A recorded purchase returns to the chiamata moment. #333: the marker of
  // that moment is the search field — SCARSITÀ PER RUOLO lives under IL TAVOLO,
  // below the whole call panel, so its visibility no longer tracks the moment.
  await expect(page.locator("#search-player")).toBeVisible();
}

test("the live moment carries scarcity, the market census and an honest empty precedents panel", async ({
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

  // AVVERSARI — nessuno storico caricato: il pannello DICE che non ha fatti.
  // È la degradazione onesta che regge tutto il resto: un elenco vuoto senza
  // questa frase si leggerebbe come «nessuno lo vuole», che è una cosa
  // diversa da «non lo so».
  await expect(page.locator("#opponent-precedents-headline")).toContainText(
    "Nessuno storico d'asta caricato",
  );
  await expect(page.locator("#opponent-precedents-headline")).toContainText(
    "non significa «nessuno lo vuole»",
  );
  await expect(page.locator("#opponent-precedents-list")).toHaveCount(0);

  // ── Il pannello NON è tornato a mostrare la raggiungibilità ───────────────
  // La riga di sintesi non cambia quando si batte una cifra: i precedenti sono
  // del giocatore, non del prezzo. È la differenza esatta col blocco che stava
  // qui prima, che si ricalcolava a ogni tasto.
  const beforeTyping = await page.locator("#opponent-precedents-headline").innerText();
  await page.locator("#assign-price").fill("30");
  await expect(page.locator("#opponent-precedents-headline")).toHaveText(beforeTyping);
  const panelText = await page.locator("#opponent-precedents-panel").innerText();
  expect(panelText).not.toMatch(/può arrivar|arrivarci|rilancio minimo|rivali su/i);
  expect(panelText).not.toMatch(/max bid|slot liber|sotto la soglia|ruolo pieno|budget bloccato/i);
  // Il vecchio pannello non esiste più con nessuno dei suoi ganci.
  await expect(page.locator("#opponent-reach-panel")).toHaveCount(0);
  await expect(page.locator("#opponent-reach-headline")).toHaveCount(0);
  await expect(page.locator("#opponent-reach-eligible")).toHaveCount(0);

  // ── …E NESSUNA CIFRA È SPARITA DALL'APP ───────────────────────────────────
  // Il vincolo duro è uscito da QUEL riquadro, non dall'applicazione. Qui, in
  // questa stessa schermata, la striscia war board porta ancora il max bid
  // vero e il budget residuo di tutte le otto squadre.
  const mini = page.locator("#war-board-mini-Squadra2");
  await expect(mini).toContainText("473"); // 500 − 27, il max bid di una squadra intonsa
  await expect(mini).toContainText("500"); // budget residuo
  await expect(page.locator("#war-board-mini-note")).toContainText("max bid");
  await expect(page.locator(".war-board-mini__item")).toHaveCount(8);
  // E gli slot liberi del ruolo in asta restano nel blocco qui accanto.
  await expect(page.locator("#moment-scarcity-slots-P")).toHaveText("24");

  // ── Il titolo dice ciò che il pannello contiene ───────────────────────────
  await expect(page.locator("#opponent-precedents-panel .panel-title")).toHaveText(
    "AVVERSARI: I PRECEDENTI",
  );
  // Il pannello non afferma un'intenzione che non calcola: né «interesse» né
  // «lo vuole» compaiono se non nella nota, dove sono negati.
  expect(await page.locator("#opponent-precedents-headline").innerText()).not.toMatch(/interess/i);
  await expect(page.locator("#opponent-precedents-note")).toContainText("il giudizio è tuo");

  // ── INSIGHT GIOCATORE: ancora onestamente vuoto, e ancora lì ──────────────
  // Il marcatore DEV STATICO se n'è andato con il segnaposto: il blocco ora
  // porta le schede del Gruppo Esperti, e in questa scena il deposito non è
  // raggiungibile. L'asserzione che quel blocco resti ONESTO non è stata tolta,
  // è diventata più stretta — prima bastava una pastiglia gialla, ora servono
  // lo stato dichiarato, l'assenza di qualunque contenuto e la dichiarazione
  // di non-validazione, che è ciò che quella pastiglia significava.
  await expect(page.getByText("INSIGHT GIOCATORE", { exact: true })).toBeVisible();
  await expect(page.getByText("DEV STATICO", { exact: true })).toHaveCount(0);
  await expect(page.locator("#player-insight-quality")).toHaveText(
    "fonte aggiuntiva non disponibile",
  );
  await expect(page.locator("#player-insight-empty")).toBeVisible();
  await expect(page.locator("#player-insight-track")).toHaveCount(0);
  await expect(page.locator("#player-insight-prose")).toHaveCount(0);
  await expect(page.locator("#player-insight-label")).toHaveText("Scheda Esperto");
  // `consigl` è l'unica famiglia di DIRECTIVE che questo riquadro DEVE
  // contenere, e solo in forma negata: «NON È UN CONSIGLIO» è la resa a schermo
  // di `directive: false`, cioè esattamente il vincolo che DIRECTIVE difende.
  // Il divieto qui è quindi sulle famiglie che non possono essere una
  // negazione, e la negazione viene verificata a parte invece di sparire.
  expect(await page.locator("#player-insight-panel").innerText()).not.toMatch(
    /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|dovresti|spingi\b|ranking|projection/i,
  );
  expect(await page.locator("#player-insight-label").getAttribute("title")).toContain("validated: false");

  // ── Nessun output direttivo su questa schermata ───────────────────────────
  expect(await page.locator("#moment-facts-panel").innerText()).not.toMatch(DIRECTIVE);
  expect(await page.locator("#opponent-precedents-panel").innerText()).not.toMatch(DIRECTIVE);
  await expect(page.locator("#opponent-precedents-note")).toContainText("gesti già compiuti");
  await expect(page.locator("#opponent-precedents-note")).toContainText(
    "tifare una squadra non è averci speso",
  );
  await expect(page.locator("#moment-facts-note")).toContainText("nessun dato di modello");

  // Nessuno dei due blocchi segue l'utente fuori dal momento asta.
  await page.getByText("← Indietro alla ricerca").click();
  await expect(page.locator("#moment-facts-panel")).toHaveCount(0);
  await expect(page.locator("#opponent-precedents-panel")).toHaveCount(0);
  await gotoScreen(page, "Rose");
  await expect(page.locator("#moment-facts-panel")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("ruolo esaurito e budget esaurito restano due fatti distinti, e restano VISIBILI", async ({
  page,
  context,
}) => {
  // Questo test copriva le tre esclusioni del vecchio pannello AVVERSARI
  // (ruolo pieno / sotto la soglia / budget bloccato). Quel pannello non
  // mostra più la raggiungibilità per vincolo duro (#331 punto 1), quindi le
  // asserzioni cambiano SOGGETTO ma non oggetto: i due fatti restano
  // distinti, e la spec verifica che restino distinti e leggibili DOVE VIVONO
  // ADESSO — il tetto nella striscia war board della schermata live, gli slot
  // per ruolo nella war board COMPLETA. È la prova che «ridurre» non ha tolto
  // informazione: se una delle due sparisse, questo test diventerebbe rosso.
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

  // ── Gli slot per ruolo, squadra per squadra: war board COMPLETA ───────────
  // IL TAVOLO è sempre aperto: nessun gesto prima di leggere.
  await expect(page.locator("#war-board-full-Squadra2 .war-board__slots")).toHaveAttribute(
    "aria-label",
    /Slot residui per ruolo: P 0/,
  );
  // Squadra3 ha ancora i suoi tre slot P: i due fatti non si confondono.
  await expect(page.locator("#war-board-full-Squadra3 .war-board__slots")).toHaveAttribute(
    "aria-label",
    /Slot residui per ruolo: P 3/,
  );

  await callPlayer(page, CALLED);

  // ── Il tetto di ciascuna squadra: striscia war board, schermata live ──────
  // Squadra3 ha speso tutto il suo max bid sicuro: le resta 1 credito di
  // tetto e 27 di budget. Squadra2 ha speso 3 crediti e ne conserva 497.
  await expect(page.locator("#war-board-mini-Squadra3")).toHaveAttribute(
    "aria-label",
    /budget residuo 27 crediti, max bid 1 credit/,
  );
  await expect(page.locator("#war-board-mini-Squadra2")).toHaveAttribute(
    "aria-label",
    /budget residuo 497 crediti, max bid 4?7?0? ?/,
  );

  // ── E il tetto resta LEGGIBILE, non solo presente ─────────────────────────
  // Stessa misura AA che il vecchio pannello pretendeva sul motivo di
  // esclusione: sul DOM vivo, non dedotta dal nome del token.
  expect(
    await textContrast(page, "#war-board-mini-Squadra3 .war-board-mini__bid"),
  ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  expect(
    await textContrast(page, "#war-board-mini-Squadra3 .war-board-mini__name"),
  ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  // Nessun antenato può rimettere un'opacità: era quella a moltiplicare ogni
  // cifra contro lo sfondo nel pannello che stava qui prima.
  expect(
    await page.evaluate(() => {
      let node: Element | null = document.querySelector("#war-board-mini-Squadra3");
      while (node !== null) {
        if (Number(getComputedStyle(node).opacity) < 1) return false;
        node = node.parentElement;
      }
      return true;
    }),
  ).toBe(true);

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

test("i precedenti d'asta, con la prova accanto e la numerosità in vista", async ({
  page,
  context,
}) => {
  // Lo storico e i profili arrivano dal deposito runtime-local, cioè dallo
  // stesso canale da cui l'app li legge davvero: la scena esercita schema,
  // validazione e join posto→persona, non una porta di servizio.
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LIVE_POOL, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await seedPrecedents(page);
  await callPlayer(page, CALLED);

  // ── La sintesi: quanti, su quanti, e su quale storico ─────────────────────
  const headline = page.locator("#opponent-precedents-headline");
  await expect(headline).toContainText("2 avversari hanno un precedente d'asta");
  await expect(headline).toContainText("su 7 avversari esaminati");
  await expect(headline).toContainText("Storico: 3 stagioni (2023/24 → 2025/26)");
  // I posti senza persona sono dichiarati: su di loro non esiste storico, e
  // tacerlo li farebbe leggere come «non hanno precedenti».
  await expect(headline).toContainText("4 posti non hanno una persona assegnata");

  // ── Il fatto più forte: ha ricomprato QUESTO giocatore ────────────────────
  const squadra2 = page.locator("#opponent-precedents-Squadra2");
  await expect(squadra2).toContainText(PEOPLE.squadra2.name);
  await expect(squadra2).toContainText("l'ha ricomprato all'asta");
  await expect(squadra2).toContainText("2 volte");
  await expect(squadra2).toContainText("30 cr nel 2023/24");
  await expect(squadra2).toContainText("40 cr nel 2025/26");
  await expect(squadra2).toContainText("misurato su 3 stagioni");
  // IL RINNOVO NON È UN RIACQUISTO: tre stagioni con quel giocatore in rosa,
  // due volte ricomprato. Il conteggio deve dire 2, e dire perché.
  await expect(squadra2).toContainText("1 rinnovo non contato");
  await expect(squadra2).not.toContainText("3 volte");

  // ── Il crollo dell'ultima stagione resta leggibile come tale ──────────────
  const squadra4 = page.locator("#opponent-precedents-Squadra4");
  await expect(squadra4).toContainText(`ha speso su ${CALLED_CLUB}`);
  await expect(squadra4).toContainText("2 stagioni su 3 misurate dal 15% in su");
  const series = squadra4.locator(".opponent-precedents__season");
  await expect(series).toHaveCount(3);
  await expect(series.nth(0)).toHaveText("23/2445%");
  await expect(series.nth(1)).toHaveText("24/2535%");
  await expect(series.nth(2)).toHaveText("25/260%");

  // ── IL TIFO NON BASTA, E NON PUÒ BASTARE ──────────────────────────────────
  // Squadra3 tifa ClubDue — dichiarato e confermato nel profilo seminato — e
  // su quel club ha speso il 4%. Non compare: la riga stessa sarebbe
  // l'affermazione «lo vuole», e nessun gesto la sostiene.
  await expect(page.locator("#opponent-precedents-Squadra3")).toHaveCount(0);
  expect(await page.locator("#opponent-precedents-panel").innerText()).not.toContain(
    PEOPLE.squadra3.name,
  );
  await expect(page.locator(".opponent-precedents__row")).toHaveCount(2);
  // Dove la riga esiste già, il tifo si accosta CON la spesa misurata accanto,
  // e sta sotto i fatti, mai al posto loro.
  const support = squadra2.locator(".opponent-precedents__support");
  await expect(support).toContainText("tifo dichiarato");
  await expect(support).toContainText(CALLED_CLUB);
  await expect(support).toContainText("spesa misurata su quel club");

  // ── Leggibilità: ogni parte della riga regge AA sul DOM vivo ──────────────
  for (const sel of [
    "#opponent-precedents-Squadra2 .opponent-precedents__name",
    "#opponent-precedents-Squadra2 .opponent-precedents__motive",
    "#opponent-precedents-Squadra2 .opponent-precedents__evidence",
    "#opponent-precedents-Squadra4 .opponent-precedents__season",
    "#opponent-precedents-Squadra2 .opponent-precedents__support",
  ]) {
    expect(await textContrast(page, sel), sel).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  }

  // ── E il vincolo duro non è tornato dalla finestra ────────────────────────
  const panelText = await page.locator("#opponent-precedents-panel").innerText();
  expect(panelText).not.toMatch(/può arrivar|arrivarci|rilancio minimo|rivali su/i);
  expect(panelText).not.toMatch(/max bid|slot liber|sotto la soglia|ruolo pieno|budget bloccato/i);
  expect(panelText).not.toMatch(DIRECTIVE);
  // Battere una cifra non cambia un solo numero di questo pannello: i
  // precedenti sono del giocatore, non del prezzo.
  const before = await page.locator("#opponent-precedents-body").innerHTML();
  await page.locator("#assign-price").fill("77");
  expect(await page.locator("#opponent-precedents-body").innerHTML()).toBe(before);

  expect(externalRequests).toEqual([]);
});

test("uno storico corrotto non degrada in silenzio: il pannello dice che non ha fatti", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, LIVE_POOL, externalRequests);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  // Una stagione scritta «23-24» invece che «2023/24»: ordinerebbe in silenzio
  // dopo il 2025/26. Il lettore è fail-closed e rende una lista VUOTA, mai una
  // lista a metà — un conteggio di precedenti su metà delle righe sarebbe un
  // numero sbagliato con l'aria di un fatto.
  await page.evaluate(() => {
    localStorage.setItem(
      "fac_auction_history",
      JSON.stringify({
        schemaVersion: 1,
        purchases: [
          {
            season: "23-24",
            personId: "person:00000000-0000-4000-8000-0000000000e2",
            playerId: "sint-rotto",
            club: "ClubUno",
            price: 10,
            acquisition: "asta",
          },
        ],
      }),
    );
  });
  await page.reload();
  await callPlayer(page, CALLED);

  await expect(page.locator("#opponent-precedents-headline")).toContainText(
    "Nessuno storico d'asta caricato",
  );
  await expect(page.locator("#opponent-precedents-list")).toHaveCount(0);
  // E in nessun caso si torna alla domanda vecchia.
  expect(await page.locator("#opponent-precedents-panel").innerText()).not.toMatch(
    /può arrivar|rivali su|max bid/i,
  );

  expect(externalRequests).toEqual([]);
});

test("senza listone caricato la disponibilità resta n/d, mai uno 0 travestito da misura", async ({
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
  // Sta dentro IL TAVOLO, che è sempre aperto: quel «n/d» l'operatore lo vede
  // senza compiere nessun gesto, ed è per questo che `toBeVisible()` qui sotto
  // vale come prova — `toHaveText` da solo passerebbe anche su DOM nascosto.
  await expect(page.locator("#scarcity-pool-P")).toBeVisible();
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
  // Il pannello dei precedenti è una funzione pura dello storico runtime-local
  // e del giocatore chiamato: offline non degrada e non prova a raggiungere
  // niente. Senza storico caricato dice, offline come online, che non ha fatti.
  await expect(page.locator("#opponent-precedents-headline")).toContainText(
    "Nessuno storico d'asta caricato",
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
    // Con lo storico seminato il pannello è nel suo stato PIENO: misurare la
    // responsività sullo stato vuoto sarebbe misurare la scatola, non ciò che
    // ci sta dentro.
    await seedPrecedents(page);

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

    await expect(page.locator(".opponent-precedents__row")).toHaveCount(2);
    // La serie per stagione va a capo invece di comprimersi o traboccare: è
    // l'unico pezzo del pannello che cresce con la lunghezza dello storico.
    await expect(page.locator("#opponent-precedents-Squadra4 .opponent-precedents__season")).toHaveCount(3);
    expect(
      await page.evaluate(() => {
        const el = document.querySelector("#opponent-precedents-Squadra4 .opponent-precedents__series")!;
        return el.scrollWidth <= el.clientWidth + 1;
      }),
    ).toBe(true);
    // Il titolo. A 768 e 1280 deve stare su UNA riga: lì il margine è ampio e
    // un titolo che va a capo segnala che qualcuno l'ha allungato senza
    // guardare. A 390 il margine misurato è di 2px, quindi la pretesa è più
    // debole ma comunque stringente: mai più di due righe (quante ne prendeva
    // il titolo vecchio) e mai traboccare fuori dalla propria scatola.
    const titleSel = "#opponent-precedents-panel .panel-title";
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

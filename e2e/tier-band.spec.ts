import { expect, test, type Page } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import {
  TIER_BAND_NO_INDEX,
  TIER_BAND_TITLE,
  TIER_BAND_UNKNOWN_WORD,
} from "../src/ui/tierBand.js";
import {
  AA_NORMAL_TEXT,
  gotoScreen,
  installSyntheticNetworkGuard,
  selectListoneRowByName,
  textContrast,
} from "./helpers.js";

// LE FASCE D'ASTA, SULLO SCHERMO.
//
// packages/engine/src/tiers.ts calcolava le fasce d'asta — in che fascia sta
// il giocatore chiamato, quanti ne restano di quella fascia, quali prezzi sono
// stati davvero pagati stasera dentro di essa — e non aveva un solo import in
// tutto il repository: motore costruito, provato, e mai arrivato sotto gli
// occhi di nessuno. Questa spec percorre il giro vero e verifica le tre cose
// che il riquadro deve fare:
//
//  1. dire IN CHE FASCIA sta il giocatore attualmente chiamato, con la PAROLA
//     della fascia per intero — mai una sigla, mai il solo colore;
//  2. dire CHE COSA È STATO DAVVERO PAGATO in quella fascia stasera, letto dal
//     log d'asta vero costruito qui dentro comprando davvero;
//  3. DIRE che non lo sa quando il dato non c'è — ed è la scena più
//     importante di questo file: un listone senza indice di appetibilità non
//     produce fasce, e quel caso deve rendere una frase onesta, non un
//     pannello vuoto né una fascia inventata.
//
// Tutte le righe sono sintetiche — nomi, club, punteggi e ricetta — e il
// network guard aborta qualunque altra richiesta.

const RECIPE = "APPEAL-INDEX-RECIPE@1.0.0";
const QUALITY = "sperimentale — fixture sintetica, non validato";

/** Una riga con verdetto dell'indice; `score: null` = nessun verdetto. */
function indexed(name: string, score: number | null): ListonePlayer {
  return {
    name,
    role: "C",
    club: "ClubUno",
    quotation: 10,
    appealIndex: { score, quality: QUALITY, recipe: RECIPE, components: { appetibilitaBase: score } },
  };
}

// Dodici centrocampisti in ordine di punteggio decrescente: con otto squadre
// al tavolo i primi otto sono PRIMA fascia e i quattro successivi SECONDA —
// una seconda fascia parziale, che è il caso in cui `originalSize` deve essere
// misurato (4) e non assunto uguale alla larghezza (8).
const TIER_1 = ["Alfa", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"];
const TIER_2 = ["India", "Juliett", "Kilo", "Lima"];

const POOL_WITH_INDEX: readonly ListonePlayer[] = [
  ...TIER_1.map((n, i) => indexed(`Mediano ${n}`, 90 - i)),
  ...TIER_2.map((n, i) => indexed(`Mediano ${n}`, 70 - i)),
  // Riga senza verdetto: l'indice non dice niente su di lei. Deve risultare
  // FUORI dall'ordine (`unranked`), non ultima.
  indexed("Mediano Zulu", null),
  // Un portiere senza indice affatto: serve solo a dare al listone più di un
  // ruolo, non viene mai chiamato.
  { name: "Portiere Sintetico", role: "P", club: "ClubDue", quotation: 5 },
];

/** Lo stesso listone senza NESSUN indice: la scena 3. */
const POOL_WITHOUT_INDEX: readonly ListonePlayer[] = POOL_WITH_INDEX.map(
  ({ appealIndex: _drop, ...row }) => row,
);

// docs/NO_GO.md §Prodotto: nessuna di queste parole può comparire su questa
// superficie. Stessa famiglia della guardia già in uso in live-facts.spec.ts.
const DIRECTIVE =
  /fair.?to.?me|target.?band|stretch.?cap|prendilo|mollalo|consigl|dovresti|spingi|convien|ranking|projection|prezzo atteso/i;

/**
 * «Nessun prezzo atteso» e «Nessun consiglio» sono le uniche due famiglie di
 * DIRECTIVE che questo riquadro DEVE contenere, e solo in forma NEGATA: sono
 * la resa a schermo del divieto, non la sua violazione. Il divieto vale quindi
 * su tutto il resto, e le due negazioni si verificano a parte invece di
 * sparire — stesso trattamento che live-facts.spec.ts riserva al «NON È UN
 * CONSIGLIO» del riquadro INSIGHT GIOCATORE.
 */
async function expectNoDirectiveOutput(page: Page): Promise<void> {
  const panelText = await page.locator("#tier-band-panel").innerText();
  const stripped = panelText.replace(/nessun prezzo atteso/gi, "").replace(/nessun consiglio/gi, "");
  expect(stripped).not.toMatch(DIRECTIVE);
  await expect(page.locator("#tier-band-note")).toContainText("nessun prezzo atteso");
  await expect(page.locator("#tier-band-note")).toContainText("Nessun consiglio");
  await expect(page.locator("#tier-band-note")).toContainText("il giudizio è tuo");
}

/** Apre il momento live su un giocatore, dalla schermata di chiamata. */
async function callPlayer(page: Page, name: string): Promise<void> {
  await selectListoneRowByName(page, name);
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#tier-band-panel")).toBeVisible();
}

/** Torna alla ricerca senza registrare niente. */
async function backToSearch(page: Page): Promise<void> {
  await page.getByText("← Indietro alla ricerca").click();
  await expect(page.locator("#search-player")).toBeVisible();
}

/** Registra un acquisto vero, dal form ASSEGNA A. */
async function buy(page: Page, name: string, teamId: string, price: number): Promise<void> {
  await callPlayer(page, name);
  await page.locator("#assign-team").selectOption(teamId);
  await page.locator("#assign-price").fill(String(price));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#search-player")).toBeVisible();
}

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
}

test("la fascia del chiamato e il registro di quella fascia arrivano a schermo", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL_WITHOUT_INDEX, externalRequests, {
    kind: "serve",
    rows: POOL_WITH_INDEX,
  });
  await boot(page);

  // ── Un'asta vera: due acquisti in prima fascia, uno in seconda ────────────
  await buy(page, "Mediano Alfa", "Squadra2", 90);
  await buy(page, "Mediano Bravo", "Squadra3", 61);
  await buy(page, "Mediano Kilo", "Squadra4", 30);

  // ── 1. LA FASCIA DEL CHIAMATO, con la parola per intero ───────────────────
  await callPlayer(page, "Mediano Charlie");
  await expect(page.locator("#tier-band-panel .panel-title")).toHaveText(TIER_BAND_TITLE);
  await expect(page.locator("#tier-band-name")).toHaveText("Prima fascia");
  const headline = page.locator("#tier-band-headline");
  await expect(headline).toContainText("Prima fascia di 9");
  await expect(headline).toContainText("larga 8 come le squadre al tavolo");
  await expect(headline).toContainText("Posizione 3");
  await expect(headline).toContainText("centrocampisti");

  // ── 2. CHE COSA È STATO DAVVERO PAGATO IN QUELLA FASCIA STASERA ───────────
  // Due acquisti di prima fascia (90 e 61), crescenti. Il 30 di Mediano Kilo è
  // di SECONDA fascia e non entra in questo conto: se ci entrasse, il riquadro
  // starebbe misurando un'altra fascia.
  await expect(page.locator("#tier-band-prices-count")).toHaveText("2 acquisti");
  await expect(page.locator(".tier-band__price")).toHaveText(["61cr", "90cr"]);
  await expect(page.locator("#tier-band-price-list")).toHaveAttribute(
    "aria-label",
    /61, 90 crediti/,
  );
  // …e la contabilità della fascia: ne restano 6 degli 8, due già presi.
  await expect(page.locator("#tier-band-free")).toHaveText("6");
  await expect(page.locator("#tier-band-taken")).toHaveText("2");
  await expect(page.locator("#tier-band-occupancy")).toContainText("di 8");

  // La provenienza sta ACCANTO alla fascia — condizione vincolante del record
  // che autorizza queste fasce: una fascia la cui provenienza non si legge non
  // è utilizzabile. Ricetta e criterio dei pareggi vengono dal dato, non da
  // questa schermata.
  const provenance = page.locator("#tier-band-provenance");
  await expect(provenance).toContainText(RECIPE);
  await expect(provenance).toContainText("deposito privato");
  await expect(provenance).toContainText("pareggi:");
  await expect(provenance).toContainText("Verdetto su 12 righe di 14 caricate.");
  // Il PUNTEGGIO dell'indice non compare da nessuna parte: serve a mettere in
  // fila, e la fila è ciò che si mostra.
  const panelText = await page.locator("#tier-band-panel").innerText();
  expect(panelText).not.toMatch(/\b(90|88|70)[,.]\d|punteggio 9\d/);
  await expectNoDirectiveOutput(page);

  // ── La seconda fascia è un'altra fascia, e la sua ultima è parziale ───────
  await backToSearch(page);
  await callPlayer(page, "Mediano Lima");
  await expect(page.locator("#tier-band-name")).toHaveText("Seconda fascia");
  await expect(page.locator("#tier-band-headline")).toContainText("Seconda fascia di 9");
  await expect(page.locator("#tier-band-headline")).toContainText("Posizione 12");
  // `originalSize` è MISURATO: la seconda fascia di questo listone ha 4
  // giocatori, non 8. Uno è già stato comprato (Kilo, a 30).
  await expect(page.locator("#tier-band-occupancy")).toContainText("di 4");
  await expect(page.locator("#tier-band-free")).toHaveText("3");
  await expect(page.locator("#tier-band-prices-count")).toHaveText("1 acquisto");
  await expect(page.locator(".tier-band__price")).toHaveText(["30cr"]);

  // ── 3a. NESSUN VERDETTO SU QUESTO GIOCATORE: il riquadro lo DICE ──────────
  await backToSearch(page);
  await callPlayer(page, "Mediano Zulu");
  await expect(page.locator("#tier-band-name")).toHaveText(TIER_BAND_UNKNOWN_WORD);
  await expect(page.locator("#tier-band-headline")).toContainText(
    "non ha un verdetto su questo giocatore",
  );
  // Fuori fascia non si inventa una contabilità: nessun conteggio, nessun
  // registro, e nessun contenitore vuoto che sembri un elenco di «niente».
  await expect(page.locator("#tier-band-body")).toHaveCount(0);
  await expect(page.locator("#tier-band-prices")).toHaveCount(0);
  // La provenienza resta: l'ordine esiste, è questo giocatore a esserne fuori.
  await expect(page.locator("#tier-band-provenance")).toContainText(RECIPE);

  // ── Il testo si legge: AA misurato sul DOM vivo ───────────────────────────
  for (const sel of ["#tier-band-name", "#tier-band-headline", "#tier-band-provenance", "#tier-band-note"]) {
    expect(await textContrast(page, sel), `fascia: ${sel}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  }

  // ── Il riquadro non segue l'operatore fuori dal momento asta ──────────────
  await backToSearch(page);
  await expect(page.locator("#tier-band-panel")).toHaveCount(0);
  await gotoScreen(page, "Rose");
  await expect(page.locator("#tier-band-panel")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("un listone senza indice di appetibilità non produce fasce, e il riquadro lo dice", async ({
  page,
  context,
}) => {
  // LA SCENA PIÙ IMPORTANTE DI QUESTO FILE. Il listone statico dell'app non
  // porta l'indice: senza di esso non esiste nessun ordine di appetibilità, e
  // senza ordine non esistono fasce. Il riquadro deve DIRLO — un pannello
  // vuoto, o peggio una fascia dedotta dalla quotazione, sarebbe la stessa
  // disonestà che il progetto rifiuta ovunque.
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL_WITHOUT_INDEX, externalRequests, {
    kind: "unavailable",
  });
  await boot(page);

  await callPlayer(page, "Mediano Alfa");

  await expect(page.locator("#tier-band-panel")).toBeVisible();
  await expect(page.locator("#tier-band-name")).toHaveText(TIER_BAND_UNKNOWN_WORD);
  const headline = page.locator("#tier-band-headline");
  await expect(headline).toHaveText(TIER_BAND_NO_INDEX);
  await expect(headline).toContainText("non porta l'indice di appetibilità");
  await expect(headline).toContainText("significa «non lo so»");
  // La frase NEGA esplicitamente la lettura sbagliata, come fa il pannello dei
  // precedenti con «nessuno lo vuole».
  await expect(headline).toContainText("non significa «giocatore senza fascia»");

  // Nessuna fascia, nessun numero di fascia, nessun registro: non c'è NIENTE
  // da cui una fascia potrebbe essere dedotta, e infatti non ne compare una.
  await expect(page.locator("#tier-band-body")).toHaveCount(0);
  await expect(page.locator("#tier-band-prices")).toHaveCount(0);
  await expect(page.locator("#tier-band-occupancy")).toHaveCount(0);
  await expect(page.locator("#tier-band-provenance")).toHaveText("Ordine di appetibilità: n/d.");
  const panelText = await page.locator("#tier-band-panel").innerText();
  expect(panelText).not.toMatch(/prima fascia|seconda fascia|terza fascia|fascia \d/i);
  await expectNoDirectiveOutput(page);

  // Il riquadro resta LEGGIBILE anche nello stato in cui non sa: è lo stato
  // che l'operatore incontra più spesso.
  for (const sel of ["#tier-band-name", "#tier-band-headline", "#tier-band-provenance"]) {
    expect(await textContrast(page, sel), `senza indice: ${sel}`).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  }

  expect(externalRequests).toEqual([]);
});

import { expect, test, type Page } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import {
  AA_NORMAL_TEXT,
  gotoScreen,
  installSyntheticNetworkGuard,
  measureAllText,
  openSettingsSection,
  resolveTokenColors,
  selectStatusFilter,
  textContrast,
} from "./helpers.js";

// IL TESTO ATTENUATO SI LEGGE, IN TUTTA L'APP.
//
// e2e/live-facts.spec.ts misura il contrasto reale di tre elementi dei
// pannelli AVVERSARI. Questa spec estende la stessa misura — stesso codice,
// da helpers.ts — a tutti i punti d'uso principali del testo attenuato
// dell'app, sulle schermate e nei momenti in cui l'operatore li guarda
// davvero: Asta/chiamata, Asta/live, Rose, Impostazioni, Listone.
//
// PERCHÉ ESISTE. `--text-dim` produceva fra 2,11:1 e 3,08:1 ovunque comparisse
// (2,43:1 su --panel-inner, 2,75:1 su --panel), contro i 4,5:1 che WCAG AA
// chiede per il testo normale — e tutto il testo attenuato di questa app sta
// sotto i 14px, quindi l'eccezione "large text" (3:1) non si applica in
// nessuno di questi punti. Non è una questione estetica: è la leggibilità
// del testo secondario DURANTE un'asta, in una stanza rumorosa e coi secondi
// contati. La rampa di base.css è stata schiarita per questo; questa spec è
// ciò che impedisce che torni indietro senza che nessuno se ne accorga.
//
// DUE GUARDIE, COMPLEMENTARI:
//  1. un elenco esplicito di punti d'uso — diagnosticabile: quando fallisce si
//     sa QUALE testo è tornato illeggibile e in quale schermata;
//  2. una spazzata su tutto ciò che è a schermo — non aggirabile: un punto
//     d'uso nuovo, aggiunto domani in un pannello nuovo, viene misurato senza
//     che nessuno debba ricordarsi di aggiungerlo a un elenco.
//
// Tutte le righe sono sintetiche e il network guard aborta qualunque altra
// cosa.

const POOL: readonly ListonePlayer[] = [
  { name: "Primo Portiere", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Secondo Portiere", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Terzo Portiere", role: "P", club: "ClubDue", quotation: 5 },
  { name: "Quarto Portiere", role: "P", club: "ClubDue", quotation: 5 },
  { name: "Primo Difensore", role: "D", club: "ClubTre", quotation: 8 },
  { name: "Primo Attaccante", role: "A", club: "ClubQuattro", quotation: 20 },
];

/**
 * I quattro livelli della rampa del testo di base.css. La spazzata usa QUESTI
 * per decidere cosa è "testo dell'app" e va misurato — non un elenco di
 * selettori, e non un elenco di colori attesi: i valori vengono risolti dal
 * documento a runtime (resolveTokenColors), così la spazzata segue il token
 * ovunque il token vada.
 *
 * Perché non colori scritti a mano: con una costante di colori attesi, riportare
 * --text-sec al valore vecchio faceva cambiare colore agli elementi che lo
 * usano, quelli non corrispondevano più alla costante, la spazzata li saltava e
 * il test restava VERDE mentre l'app era tornata sotto soglia. Verificato sul
 * campo mentre si controllava che questa guardia mordesse davvero.
 */
const TEXT_RAMP_TOKENS = [
  "--text-dim",
  "--text-sec",
  "--text-mid",
  "--text-primary",
] as const;

/** Apre il momento LIVE su un giocatore, dalla schermata di chiamata. */
async function callPlayer(page: Page, name: string): Promise<void> {
  await page.getByText(name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#moment-facts-panel")).toBeVisible();
}

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#role-scarcity-panel")).toBeVisible();
}

/**
 * La spazzata: ogni elemento a schermo che porta testo proprio, visibile, e il
 * cui colore è uno dei quattro livelli della rampa, deve stare sopra AA.
 *
 * Cosa resta fuori, e perché — le uniche due esclusioni, entrambe motivate:
 *  - i controlli DISABILITATI: WCAG 1.4.3 li esenta esplicitamente ("inactive
 *    user interface component"), e l'attenuazione È il segnale che il comando
 *    non è premibile. Con la rampa schiarita passano comunque da 2,11:1 a
 *    4,07:1, ma non sono tenuti alla soglia e non devono far fallire la suite;
 *  - i colori FUORI dalla rampa del testo (pastiglie di ruolo, verde crediti,
 *    rosso STOP, accent): hanno ciascuno la propria motivazione di prodotto,
 *    non sono "il testo secondario dell'app" e non è questa la spec che
 *    decide di cambiarli.
 */
async function expectRampAboveAA(page: Page, scene: string): Promise<number> {
  const resolved = await resolveTokenColors(page, TEXT_RAMP_TOKENS);
  const byColor = new Map(Object.entries(resolved).map(([token, hex]) => [hex, token]));
  const measured = await measureAllText(page);
  const ramp = measured.filter((m) => byColor.has(m.fg) && !m.disabled);
  const failures = ramp
    .filter((m) => m.ratio < AA_NORMAL_TEXT)
    .map(
      (m) =>
        `${scene}: ${byColor.get(m.fg)} su ${m.bg} @opacity ${m.opacity.toFixed(2)} = ` +
        `${m.ratio.toFixed(2)}:1 (${m.fontSize}px) — ${m.label}`,
    );
  expect(failures, `contrasto sotto ${AA_NORMAL_TEXT}:1 in «${scene}»`).toEqual([]);
  return ramp.length;
}

test("il testo attenuato regge AA in ogni schermata e in entrambi i momenti", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);
  await boot(page);

  let sampled = 0;

  // ── ASTA — momento CHIAMATA ───────────────────────────────────────────────
  // I punti d'uso espliciti: micro-etichette del piano per ruolo, nota della
  // riga di comando, etichetta del filtro di stato, nota del listone.
  // Ognuno era fra 2,43:1 e 2,75:1 prima della schiaritura.
  for (const sel of [
    ".critical-role-plan-item em", // --text-dim, 2,75:1 prima
    "#assign-command-preview", // --text-dim, 2,75:1 prima
    ".status-filter__label", // --text-dim, «FILTRO», 2,75:1 prima
    ".status-filter__caret", // --text-dim, 2,75:1 prima
    ".listone-table-head > div", // --text-sec su --panel-inner, 4,01:1 prima
    ".scarcity-metric > span", // --text-sec, «slot liberi» / «in listone»
  ]) {
    expect(await textContrast(page, sel), `chiamata: ${sel}`).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  }
  sampled += await expectRampAboveAA(page, "asta/chiamata");

  // ── ASTA — momento LIVE ───────────────────────────────────────────────────
  await callPlayer(page, "Quarto Portiere");
  await page.locator("#assign-price").fill("30");
  for (const sel of [
    "#moment-market-basis", // --text-dim su --panel-inner, 2,43:1 prima
    "#war-board-mini-note", // --text-dim, «bdg = crediti residui · max = …»
    ".opponent-reach__empty", // --text-dim, «Nessun rivale è fuori…»
    ".moment-scarcity__called", // --accent come testo, «IN ASTA», 3,02:1 prima
    ".moment-market__head", // --text-sec su --panel-inner, 4,01:1 prima
    ".war-board-mini__name", // --text-sec su --panel-inner, 4,01:1 prima
  ]) {
    expect(await textContrast(page, sel), `live: ${sel}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  }
  sampled += await expectRampAboveAA(page, "asta/live");

  // ── LISTONE — riga già assegnata ──────────────────────────────────────────
  // Il caso che nessuna schiaritura del token da sola risolveva: `opacity:
  // 0.6` sulla riga moltiplicava ogni figlio contro lo sfondo e portava il
  // badge «Assegnato» a 1,67:1 e il NOME del giocatore a 4,28:1.
  await page.locator("#assign-team").selectOption("Io");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#role-scarcity-panel")).toBeVisible();
  await selectStatusFilter(page, "all");
  const assignedRow = page.locator(".listone-row--assigned").first();
  await expect(assignedRow).toBeVisible();
  // Nessun antenato della riga assegnata può reintrodurre un'opacità: era
  // quella a moltiplicare contro lo sfondo ogni cella e ogni parola.
  expect(
    await page.evaluate(() => {
      let node: Element | null = document.querySelector(".listone-row--assigned");
      while (node !== null) {
        if (Number(getComputedStyle(node).opacity) < 1) return false;
        node = node.parentElement;
      }
      return true;
    }),
    "una riga assegnata non deve stare dentro un gruppo di composizione",
  ).toBe(true);
  expect(
    await textContrast(page, ".listone-row--assigned .badge--assigned"),
    "badge «Assegnato»",
  ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  // La riga resta comunque ARRETRATA rispetto a una libera: la gerarchia non
  // è stata pagata per ottenere il contrasto. --text-dim contro --text-mid.
  const dimmed = await page.evaluate(() => {
    const assigned = document.querySelector(".listone-row--assigned");
    const free = document.querySelector(".listone-row:not(.listone-row--assigned)");
    if (assigned === null || free === null) return null;
    return [getComputedStyle(assigned).color, getComputedStyle(free).color];
  });
  expect(dimmed, "servono una riga assegnata e una libera").not.toBeNull();
  expect(dimmed![0], "la riga assegnata non deve avere lo stesso colore di una libera").not.toBe(
    dimmed![1],
  );
  sampled += await expectRampAboveAA(page, "asta/listone-assegnati");

  // ── ROSE ──────────────────────────────────────────────────────────────────
  await gotoScreen(page, "Rose");
  for (const sel of [
    "#opponent-tier1-note", // --text-dim, nota di contabilità
    ".opponent-tier1__total", // --text-sec su --panel-inner, 4,01:1 prima
  ]) {
    expect(await textContrast(page, sel), `rose: ${sel}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  }
  sampled += await expectRampAboveAA(page, "rose");

  // ── IMPOSTAZIONI ──────────────────────────────────────────────────────────
  await gotoScreen(page, "Impostazioni");
  for (const section of ["teams", "riconferme", "status"] as const) {
    await openSettingsSection(page, section);
    sampled += await expectRampAboveAA(page, `impostazioni/${section}`);
  }

  // La spazzata non può essere passata per vuoto: se i colori della rampa non
  // corrispondono più a nulla (token rinominato, valori cambiati senza
  // aggiornare TEXT_RAMP) questo test lo dice, invece di restare verde
  // misurando zero elementi.
  expect(sampled, "la spazzata non ha trovato testo della rampa: TEXT_RAMP è disallineata")
    .toBeGreaterThan(400);

  expect(externalRequests).toEqual([]);
});

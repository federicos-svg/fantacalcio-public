import { expect, test, type Page } from "@playwright/test";
import { ROLES, ROSTER_REQUIREMENTS } from "../packages/engine/src/types.js";
import { LOG_STORAGE_KEY } from "../src/logRecovery.js";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { AA_NORMAL_TEXT, installSyntheticNetworkGuard, measureAllText, textContrast } from "./helpers.js";

// I QUATTRO COLORI DELLA PUNTATA CRITICA, E IL PULSANTE CHE DISTRUGGE.
//
// PERCHÉ ESISTE. `src/styles/asta.css` dipinge il numero di «Max bid sicuro»
// di quattro colori diversi a seconda dello stato — open (--green), locked
// (--text-accent), stop (--stop-red), done (--text-sec) — e `.btn--danger`
// (`src/styles/components.css`) dipinge di bianco su --stop-red-dark ogni
// azione distruttiva. Prima di questa spec, `git grep -l "critical-bid--" --
// e2e/` e `git grep -l "btn--danger" -- e2e/` non restituivano NIENTE: nessuna
// scena della suite faceva comparire quegli elementi. La spazzata di
// e2e/text-contrast-aa.spec.ts misura solo ciò che è a schermo, quindi vedeva
// il solo stato `open` (il boot pulito) e non vedeva mai il pulsante, che
// compare solo al SECONDO tempo di una conferma. Gli altri tre colori e il
// pulsante erano VERDI PER ASSENZA: non misurati, non protetti, e nessun test
// sarebbe diventato rosso rendendoli illeggibili.
//
// Uno dei tre non misurati è il rosso che dice «fermati»: quello che compare
// quando NON si deve rilanciare. Se fosse sotto soglia lo si scoprirebbe
// mentre si sta per fare un'offerta, in una stanza rumorosa, a voce alta.
//
// COME È COSTRUITA. Stesso idioma delle altre spec di contrasto: si costruisce
// la SCENA in cui l'elemento esiste davvero nel DOM, e poi si misura il
// rapporto REALE sul browser vivo con `textContrast` (e2e/helpers.ts), che
// compone tutta la catena — opacity, sfondi, pseudo-elementi — e LANCIA se il
// selettore non trova nulla o se il colore reso non è ricostruibile. È quella
// eccezione a rendere impossibile un nuovo verde per assenza: una scena che
// smette di costruire il proprio stato diventa rossa, non silenziosa.
//
// LA COMPLETEZZA NON È UN ELENCO SCRITTO A MANO. In fondo al primo test
// l'insieme degli stati MISURATI viene confrontato con l'insieme degli stati
// DICHIARATI dal foglio di stile, letto a runtime dal documento. Uno stato
// nuovo aggiunto domani in asta.css, e mai messo in scena, fa fallire questo
// test invece di nascere già verde per assenza.
//
// Tutte le righe sono sintetiche e il network guard aborta qualunque altra
// cosa.

/** Il numero della puntata critica, per stato. `> strong` è il numero;
 *  `> strong em` è la nota inline che lo accompagna quando c'è, e ne eredita
 *  il colore (asta.css: `.critical-metric--bid > strong em` non ridichiara
 *  `color`), a 11px — testo normale per WCAG, nessuna eccezione «large». */
const bidNumber = (state: string): string => `#critical-max-bid.critical-bid--${state} > strong`;

/** Gli stati che il foglio di stile dipinge DAVVERO, letti dal documento e
 *  non da una costante scritta a mano: una costante mentirebbe il giorno in
 *  cui qualcuno aggiunge un quinto stato senza aggiornarla — che è
 *  esattamente il modo in cui questi quattro colori sono arrivati fin qui
 *  senza mai essere misurati. */
async function statesDeclaredInStylesheet(page: Page): Promise<string[]> {
  const found = await page.evaluate(() => {
    const out = new Set<string>();
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        // Foglio cross-origin: in questa app non ne esistono (il build è
        // same-origin e il network guard aborta il resto), quindi non è un
        // caso da tollerare in silenzio.
        throw new Error("foglio di stile non leggibile: gli stati dichiarati non sono verificabili");
      }
      for (const rule of Array.from(rules)) {
        const selector = (rule as CSSStyleRule).selectorText;
        if (typeof selector !== "string") continue;
        for (const match of selector.matchAll(/\.critical-bid--([a-z-]+)/g)) out.add(match[1]!);
      }
    }
    return [...out];
  });
  return found.sort();
}

/**
 * Misura il numero della puntata nello stato dato e restituisce il rapporto.
 *
 * Non «prova a misurare»: pretende che l'elemento porti la classe di QUELLO
 * stato prima di misurarlo, così una scena che non riesce a costruire il
 * proprio stato fallisce sul posto invece di misurare per sbaglio un altro
 * colore e passare.
 */
async function measureBid(page: Page, state: string, scene: string): Promise<number> {
  await expect(
    page.locator("#critical-max-bid"),
    `la scena «${scene}» non ha prodotto lo stato «${state}» della puntata critica`,
  ).toHaveClass(new RegExp(`\\bcritical-bid--${state}\\b`));
  const ratio = await textContrast(page, bidNumber(state));
  expect(ratio, `${scene}: numero della puntata, stato «${state}»`).toBeGreaterThanOrEqual(
    AA_NORMAL_TEXT,
  );
  // La nota inline, quando lo stato ne ha una: stesso colore, corpo più
  // piccolo, e la si legge esattamente negli stati in cui qualcosa non va.
  if ((await page.locator(`${bidNumber(state)} em`).count()) > 0) {
    expect(
      await textContrast(page, `${bidNumber(state)} em`),
      `${scene}: nota della puntata, stato «${state}»`,
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  }
  return ratio;
}

/** Sostituisce lo storico persistito e ricarica l'app: la scena nasce dal log,
 *  che è l'unica sorgente da cui lo stato d'asta è derivato. */
async function bootWithLog(page: Page, log: readonly unknown[]): Promise<void> {
  await page.evaluate(
    ([key, events]) => window.localStorage.setItem(key as string, JSON.stringify(events)),
    [LOG_STORAGE_KEY, log] as const,
  );
  await page.reload();
  await expect(page.locator("#critical-max-bid")).toBeVisible();
}

const purchase = (seq: number, role: "P" | "D" | "C" | "A", price: number) => ({
  type: "PURCHASE" as const,
  seq,
  ts: `2026-08-01T10:00:${String(seq).padStart(2, "0")}.000Z`,
  playerId: `synthetic-${role}-${seq}`,
  role,
  fantaTeamId: "Io",
  price,
});

test("il numero della puntata critica si legge in tutti e quattro i suoi stati", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator("#search-player")).toBeVisible();

  const measured = new Map<string, number>();

  // ── OPEN — il boot pulito ─────────────────────────────────────────────────
  // L'unico dei quattro che una scena della suite già faceva comparire, per
  // caso e non per scelta. Qui è misurato per nome.
  measured.set("open", await measureBid(page, "open", "boot pulito"));

  // ── LOCKED — il gesto d'uso, per intero ───────────────────────────────────
  // Un acquisto ESATTAMENTE al tetto: 500 − (28 − 1) × COST_FLOOR = 473.
  // Restano 27 crediti per 27 slot obbligatori, cioè `freeBudget === 0`: la
  // rosa è ancora completabile, ma solo al minimo. Nessuna scorciatoia — è
  // la stessa strada che percorre l'operatore.
  await page.getByText(SYNTHETIC_LISTONE_POOL[3]!.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill("473");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#search-player")).toBeVisible();
  await expect(page.locator("#critical-budget")).toHaveText("27 cr");
  measured.set("locked", await measureBid(page, "locked", "acquisto al tetto (gesto d'uso)"));

  // ── DONE — rosa completa ──────────────────────────────────────────────────
  // Costruito dallo storico invece che da 28 acquisti a mano. È la stessa
  // strada del gesto, percorsa in un passo solo: ognuno di questi 28 acquisti
  // a 1 credito PASSEREBBE `purchaseFeasibility()` (budget 500, hard reserve
  // sempre coperta), quindi lo stato è raggiungibile per la via normale e la
  // scorciatoia riguarda solo il numero di click.
  const fullRoster = ROLES.flatMap((role) =>
    Array.from({ length: ROSTER_REQUIREMENTS[role] }, () => role),
  ).map((role, i) => purchase(i, role, 1));
  await bootWithLog(page, fullRoster);
  await expect(page.locator("#critical-slots")).toHaveText("0");
  measured.set("done", await measureBid(page, "done", "rosa completa"));

  // ── STOP — il rosso che dice «fermati» ────────────────────────────────────
  //
  // PERCHÉ QUESTA SCENA NON PUÒ NASCERE DA UN GESTO. Lo stato è
  // `!plan.isCompletable`, cioè budget residuo minore della hard reserve degli
  // slot obbligatori ancora vuoti. Ogni strada di scrittura dell'app lo
  // impedisce PRIMA che accada: un acquisto che romperebbe la hard reserve è
  // rifiutato da `purchaseFeasibility()` (`breaks-hard-reserve`, vedi
  // e2e/hard-reserve-guard.spec.ts) e una riconferma pre-asta che la
  // romperebbe è rifiutata da `validateConfirmations()`
  // (`team-hard-reserve-broken`, src/confirmationsStore.ts); un VOID non può
  // produrlo, perché restituisce crediti e libera slot. Costruire lo stato
  // «come lo farebbe l'operatore» è quindi impossibile per costruzione.
  //
  // COME È COSTRUITO INVECE, E PERCHÉ È LEGITTIMO. Da uno storico che NON è
  // passato per quella porta — esattamente il caso che il prodotto contempla:
  // `validateAuctionLog()` (src/logRecovery.ts) accetta questo log, perché i
  // suoi invarianti sono `budgetResidual >= 0` e `slotsRemaining >= 0` e
  // questo storico li rispetta entrambi. Un log importato da un altro
  // dispositivo, o scritto da una versione precedente, può presentarsi
  // esattamente così: lo stato NON è ipotetico, è solo irraggiungibile dai
  // gesti di questa schermata. È per un log del genere che il colore esiste.
  //
  // Un acquisto da 490 crediti lascia 10 crediti per 27 slot obbligatori:
  // deficit 17, `maxSafe` sotto il minimo, rosa non completabile.
  await bootWithLog(page, [purchase(0, "A", 490)]);
  await expect(page.locator("#critical-budget")).toHaveText("10 cr");
  await expect(page.locator("#critical-max-bid")).toContainText("rosa non completabile");
  measured.set("stop", await measureBid(page, "stop", "storico non completabile (via dichiarata)"));

  // LA COMPLETEZZA, NON UN ELENCO. Gli stati messi in scena devono essere
  // ESATTAMENTE quelli che il foglio di stile dipinge. Uno stato in più in
  // asta.css senza una scena qui: rosso. Una scena che smette di costruire il
  // proprio stato: già rossa sopra, in `measureBid`.
  expect(
    [...measured.keys()].sort(),
    "gli stati misurati non coincidono con quelli dichiarati da src/styles/asta.css",
  ).toEqual(await statesDeclaredInStylesheet(page));

  expect(externalRequests).toEqual([]);
});

test("il pulsante distruttivo si legge nel momento in cui compare", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator("#search-player")).toBeVisible();

  // `.btn--danger` non esiste al primo tempo di nessun flusso: è il SECONDO
  // tempo, quello che conferma. Serve quindi un acquisto da annullare, e poi
  // il gesto che apre la conferma.
  await page.getByText(SYNTHETIC_LISTONE_POOL[3]!.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill("40");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#search-player")).toBeVisible();

  await page.locator("#undo-purchase-0").click();
  await expect(page.locator("#void-confirm-overlay")).toBeVisible();
  const danger = page.locator("#void-confirm-apply");
  await expect(danger).toHaveClass(/\bbtn--danger\b/);
  expect(
    await textContrast(page, "#void-confirm-apply"),
    "pulsante distruttivo: «Annulla acquisto»",
  ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);

  // E ogni ALTRO `.btn--danger` a schermo in questa scena, cercato per classe
  // e non per id: la classe è una sola e la vestono tutte le azioni
  // distruttive dell'app, quindi misurarla per identità è ciò che impedisce a
  // un'istanza futura di nascere non misurata.
  const buttons = await measureAllText(page, ".btn--danger");
  expect(
    buttons.flatMap((m) => (m.kind === "unclassified" ? [`${m.reason} — ${m.label}`] : [])),
    "pulsante distruttivo non classificabile: la misura non può dirlo leggibile, quindi lo boccia",
  ).toEqual([]);
  const painted = buttons.flatMap((m) => (m.kind === "measured" ? [m] : []));
  expect(painted.length, "nessun .btn--danger in scena: la misura sarebbe verde per assenza")
    .toBeGreaterThan(0);
  expect(
    painted
      .filter((m) => m.ratio < AA_NORMAL_TEXT)
      .map((m) => `${m.fg} su ${m.bg} = ${m.ratio.toFixed(2)}:1 (${m.fontSize}px) — ${m.label}`),
    `pulsante distruttivo sotto ${AA_NORMAL_TEXT}:1`,
  ).toEqual([]);

  expect(externalRequests).toEqual([]);
});

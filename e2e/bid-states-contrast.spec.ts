import { expect, test, type Page } from "@playwright/test";
import { ROLES, ROSTER_REQUIREMENTS } from "../packages/engine/src/types.js";
import { LOG_STORAGE_KEY } from "../src/logRecovery.js";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  AA_NORMAL_TEXT,
  installSyntheticNetworkGuard,
  measureAllText,
  textContrast,
} from "./helpers.js";

// I COLORI DEL TETTO DI UNA OFFERTA — FASCIA CRITICA E WAR BOARD — E IL
// PULSANTE CHE DISTRUGGE.
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
// LA COMPLETEZZA NON È UN ELENCO SCRITTO A MANO. In fondo a ogni test
// l'insieme degli stati MISURATI viene confrontato con l'insieme degli stati
// DICHIARATI dal foglio di stile, letto a runtime dal documento. Uno stato
// nuovo aggiunto domani in asta.css, e mai messo in scena, fa fallire questo
// test invece di nascere già verde per assenza.
//
// E IL GUARD SCENDE, non si ferma al primo livello. La sua prima versione
// enumerava solo le regole di primo livello di ogni foglio: uno stato dentro
// un `@media` le sfuggiva, e passava verde. Non era teorico — asta.css ha già
// un blocco `@media (max-width: 520px)` che tocca la stessa famiglia della
// fascia critica (`.critical-metric--bid`), quindi il posto dove un quinto
// colore sarebbe nato invisibile esisteva già. Ora `walkRules` ricorre in
// OGNI contenitore di regole: `@media`, `@supports`, `@layer`, `@container`,
// le regole annidate del CSS moderno (`CSSStyleRule.cssRules`) e i fogli
// tirati dentro da `@import`. Il difetto che questo file esiste per chiudere
// era dentro il guard stesso; adesso non c'è più, e la prova è una mutazione
// annidata che fa rosso (vedi il corpo della PR).
//
// LA STESSA FAMIGLIA, DUE VOLTE. Il tetto di UNA offerta è dipinto in due
// posti: la fascia critica (`.critical-bid--*`, quattro stati, il MIO tetto) e
// la war board (`.war-board-bid--*`, tre stati, il tetto di OGNI squadra del
// tavolo). Sono due insiemi di colori distinti su sfondi distinti — `--bg` per
// la fascia, `--panel-inner` per le card e per la striscia — quindi due misure
// distinte e due guard di completezza distinti, uno per famiglia.
//
// Tutte le righe sono sintetiche e il network guard aborta qualunque altra
// cosa.

/** Il numero della puntata critica, per stato. `> strong` è il numero;
 *  `> strong em` è la nota inline che lo accompagna quando c'è, e ne eredita
 *  il colore (asta.css: `.critical-metric--bid > strong em` non ridichiara
 *  `color`), a 11px — testo normale per WCAG, nessuna eccezione «large». */
const bidNumber = (state: string): string => `#critical-max-bid.critical-bid--${state} > strong`;

/**
 * Gli stati che il foglio di stile dipinge DAVVERO per una famiglia di classi
 * (`critical-bid`, `war-board-bid`), letti dal documento e non da una costante
 * scritta a mano: una costante mentirebbe il giorno in cui qualcuno aggiunge
 * uno stato senza aggiornarla — che è esattamente il modo in cui questi colori
 * sono arrivati fin qui senza mai essere misurati.
 *
 * SCENDE NEI CONTENITORI, e questa non è una raffinatezza: la prima versione
 * di questo guard enumerava solo `sheet.cssRules`, cioè le regole di PRIMO
 * LIVELLO, e uno stato dichiarato dentro un `@media` le passava sotto il naso
 * intatto — lo stesso «verde per assenza» che il guard esiste per rendere
 * impossibile, dentro il guard. `@media`, `@supports`, `@layer`, `@container`
 * e le regole annidate del CSS moderno espongono tutti `cssRules`
 * (`CSSGroupingRule`, e `CSSStyleRule` da quando il nesting è nel linguaggio):
 * si ricorre su quello, senza elencare i tipi uno per uno, così un contenitore
 * che il linguaggio aggiungerà domani è già coperto.
 *
 * `@import` è l'unico caso che `cssRules` non copre: il foglio importato NON
 * compare in `document.styleSheets`, si raggiunge solo da `CSSImportRule.
 * styleSheet`. Oggi in questo repo non ce ne sono; il ramo c'è lo stesso,
 * perché il costo è tre righe e l'alternativa è un buco che si riapre con un
 * `@import` aggiunto senza pensarci.
 */
async function statesDeclaredInStylesheet(page: Page, family: string): Promise<string[]> {
  const found = await page.evaluate((fam) => {
    const out = new Set<string>();
    const pattern = new RegExp(`\\.${fam}--([a-z0-9-]+)`, "g");

    /** Un foglio illeggibile non è un caso da tollerare in silenzio: sarebbe
     *  di nuovo una dichiarazione invisibile alla misura. */
    const rulesOf = (sheet: CSSStyleSheet): CSSRuleList => {
      try {
        return sheet.cssRules;
      } catch {
        // Foglio cross-origin: in questa app non ne esistono (il build è
        // same-origin e il network guard aborta il resto).
        throw new Error("foglio di stile non leggibile: gli stati dichiarati non sono verificabili");
      }
    };

    const walkRules = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        const selector = (rule as CSSStyleRule).selectorText;
        if (typeof selector === "string") {
          for (const match of selector.matchAll(pattern)) out.add(match[1]!);
        }
        const imported = (rule as CSSImportRule).styleSheet as CSSStyleSheet | null | undefined;
        if (imported !== undefined && imported !== null) walkRules(rulesOf(imported));
        // `CSSGroupingRule` e discendenti: @media, @supports, @layer,
        // @container, e le regole annidate di una CSSStyleRule.
        const nested = (rule as CSSGroupingRule).cssRules as CSSRuleList | undefined | null;
        if (nested !== undefined && nested !== null) walkRules(nested);
      }
    };

    for (const sheet of Array.from(document.styleSheets)) walkRules(rulesOf(sheet));
    return [...out];
  }, family);
  return found.sort();
}

/**
 * Gli stati messi in scena devono essere ESATTAMENTE quelli che il foglio di
 * stile dipinge per quella famiglia. Uno stato in più in asta.css senza una
 * scena qui: rosso. Una scena che smette di costruire il proprio stato: già
 * rossa prima, dove la scena viene misurata.
 */
async function expectStatesComplete(
  page: Page,
  family: string,
  measured: ReadonlyMap<string, number>,
): Promise<void> {
  expect(
    [...measured.keys()].sort(),
    `gli stati misurati di .${family}--* non coincidono con quelli dichiarati da src/styles/asta.css`,
  ).toEqual(await statesDeclaredInStylesheet(page, family));
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

  // LA COMPLETEZZA, NON UN ELENCO.
  await expectStatesComplete(page, "critical-bid", measured);

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

// ─── IL TETTO DEL TAVOLO: GLI STESSI STATI, ALTRI TRE COLORI ─────────────────
//
// La war board dipinge il tetto di OGNI squadra con una seconda famiglia di
// classi — `.war-board-bid--open/--locked/--done` (asta.css:611-616) — su
// `--panel-inner` invece che su `--bg`, e con una nota accanto quando il tetto
// non è un numero. Prima di questo test `git grep -l "war-board-bid--" --
// e2e/` era VUOTO: nessuna scena della suite portava una squadra fuori da
// `open`, quindi due colori su tre non erano misurati da niente, e il terzo lo
// era per caso (live-facts.spec.ts misura `.war-board-mini__bid` senza mai
// chiedere in quale stato si trovi — se domani quella squadra cambiasse stato,
// la misura seguirebbe il colore nuovo senza dirlo).
//
// Le due varianti del tabellone (MINI durante l'asta, COMPLETA durante la
// chiamata — src/ui/warBoard.ts) portano le STESSE classi su sfondi diversi e
// corpi diversi, quindi si misurano tutte e due: misurarne una sola sarebbe
// verde per assenza sull'altra.

/** La cella del tetto nella card COMPLETA: l'unica metrica che NON è il
 *  budget (quello ha il proprio modificatore e il proprio colore). */
const fullBidMetric = (team: string): string =>
  `#war-board-full-${team} .war-board__metric:not(.war-board__metric--budget)`;

/**
 * Misura il tetto di una squadra sulla card COMPLETA: la cifra, la sua
 * etichetta e — quando lo stato ne ha una — la nota che dice a parole ciò che
 * il colore da solo non può dire.
 *
 * Come `measureBid`, pretende PRIMA che l'elemento porti la classe di quello
 * stato: una scena che non riesce a costruire il proprio stato fallisce sul
 * posto invece di misurare un altro colore e passare.
 */
async function measureWarBoardFull(
  page: Page,
  team: string,
  state: string,
  scene: string,
): Promise<number> {
  const metric = fullBidMetric(team);
  await expect(
    page.locator(`${metric} > strong`),
    `la scena «${scene}» non ha prodotto lo stato «${state}» del tetto di ${team}`,
  ).toHaveClass(new RegExp(`\\bwar-board-bid--${state}\\b`));

  const ratio = await textContrast(page, `${metric} > strong.war-board-bid--${state}`);
  expect(ratio, `${scene}: war board COMPLETA, tetto di ${team}, stato «${state}»`).toBeGreaterThanOrEqual(
    AA_NORMAL_TEXT,
  );
  expect(
    await textContrast(page, `${metric} > span`),
    `${scene}: war board COMPLETA, etichetta del tetto di ${team}`,
  ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  // La nota esiste esattamente negli stati in cui il tetto NON è un numero, ed
  // è lì che portare l'informazione fuori dal colore conta di più.
  if ((await page.locator(`${metric} > .war-board__bid-note`).count()) > 0) {
    expect(
      await textContrast(page, `${metric} > .war-board__bid-note`),
      `${scene}: war board COMPLETA, nota del tetto di ${team}, stato «${state}»`,
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  }
  return ratio;
}

/** Lo stesso tetto sulla striscia MINI: stessa classe di stato, sfondo uguale
 *  (`--panel-inner`) ma corpo più piccolo, e l'etichetta è un `em` dentro la
 *  cella invece di uno `span` sopra. */
async function measureWarBoardMini(
  page: Page,
  team: string,
  state: string,
  scene: string,
): Promise<number> {
  const cell = `#war-board-mini-${team} .war-board-mini__bid`;
  await expect(
    page.locator(cell),
    `la scena «${scene}» non ha prodotto lo stato «${state}» del tetto di ${team} sulla striscia`,
  ).toHaveClass(new RegExp(`\\bwar-board-bid--${state}\\b`));

  const ratio = await textContrast(page, `${cell}.war-board-bid--${state}`);
  expect(ratio, `${scene}: war board MINI, tetto di ${team}, stato «${state}»`).toBeGreaterThanOrEqual(
    AA_NORMAL_TEXT,
  );
  expect(
    await textContrast(page, `${cell} em`),
    `${scene}: war board MINI, etichetta del tetto di ${team}`,
  ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  return ratio;
}

/**
 * Uno storico che mette TRE squadre in TRE stati diversi nello stesso istante,
 * così i tre colori si misurano sulla stessa schermata e non uno alla volta.
 *
 *  - `Squadra2` → `locked`. Un acquisto da 474 crediti: restano 26 crediti per
 *    27 slot obbligatori, quindi `maxSafe = 26 − 26 = 0`, sotto COST_FLOOR →
 *    `budget-locked`.
 *  - `Squadra3` → `done`. Rosa completa, 28 acquisti da 1 credito: nessun
 *    ruolo aperto → `role-full`.
 *  - `Io` (e le altre quattro) → `open`. Intatta: `maxSafe = 500 − 27 = 473`.
 *
 * PERCHÉ `locked` NON PUÒ NASCERE DA UN GESTO, e perché la via dichiarata è
 * legittima — la stessa forma dell'argomento già scritto per `stop` qui sopra,
 * ma l'aritmetica è diversa e va detta per intero.
 *
 * `purchaseFeasibility()` (packages/engine/src/feasibility.ts) ammette un
 * acquisto solo se `budget − prezzo >= totalSlotsRemaining − 1`, cioè se dopo
 * l'acquisto vale `budget' >= slot'`. Ma `budget-locked` è per definizione
 * `budget − (slot − 1) < COST_FLOOR`, cioè `budget < slot`. Le due condizioni
 * si escludono: DOPO un acquisto ammesso una squadra è sempre `open`. Un VOID
 * restituisce crediti e libera uno slot, e una riconferma pre-asta passa dallo
 * stesso vincolo (`residual >= hardReserve(slotsRemaining)`,
 * packages/engine/src/confirmations.ts → `team-hard-reserve-broken`). Non
 * esiste gesto di questa app che lasci una squadra in `budget-locked`: è
 * esattamente la stessa porta chiusa che rende `stop` irraggiungibile nella
 * fascia critica, vista dal lato del tavolo.
 *
 * Lo storico però è VALIDO: `validateAuctionLog()` (src/logRecovery.ts)
 * pretende `budgetResidual >= 0` e `slotsRemaining >= 0`, e 500 − 474 = 26
 * rispetta entrambi. Un log importato da un altro dispositivo, o scritto da
 * una versione precedente, può presentarsi così — ed è per un log del genere
 * che quel colore esiste. Lo stato non è ipotetico: è irraggiungibile dai
 * gesti, non dal prodotto.
 */
const warBoardLog: readonly unknown[] = [
  {
    type: "PURCHASE",
    seq: 0,
    ts: "2026-08-01T10:00:00.000Z",
    playerId: "synthetic-locked-A-0",
    role: "A",
    fantaTeamId: "Squadra2",
    price: 474,
  },
  ...ROLES.flatMap((role) => Array.from({ length: ROSTER_REQUIREMENTS[role] }, () => role)).map(
    (role, i) => ({
      type: "PURCHASE",
      seq: i + 1,
      ts: `2026-08-01T10:01:${String(i).padStart(2, "0")}.000Z`,
      playerId: `synthetic-done-${role}-${i}`,
      role,
      fantaTeamId: "Squadra3",
      price: 1,
    }),
  ),
];

test("il tetto della war board si legge in tutti e tre i suoi stati, in tutte e due le varianti", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator("#search-player")).toBeVisible();
  await bootWithLog(page, warBoardLog);

  // ── La variante COMPLETA (momento chiamata) ───────────────────────────────
  // IL TAVOLO è sempre aperto: la war board COMPLETA si legge senza gesti.
  await expect(page.locator("#war-board-full")).toBeVisible();
  // Le tre squadre sono davvero dove le vogliamo, detto in parole e non solo
  // in colore: è la stessa informazione che il colore porta, letta dal testo.
  await expect(page.locator("#war-board-full-Squadra2")).toContainText("26 cr");
  await expect(page.locator("#war-board-full-Squadra2")).toContainText("budget bloccato");
  await expect(page.locator("#war-board-full-Squadra3")).toContainText("rosa completa");
  await expect(page.locator("#war-board-full-Io")).toContainText("473 cr");

  const full = new Map<string, number>();
  full.set("open", await measureWarBoardFull(page, "Io", "open", "squadra intatta"));
  full.set("locked", await measureWarBoardFull(page, "Squadra2", "locked", "budget bloccato (via dichiarata)"));
  full.set("done", await measureWarBoardFull(page, "Squadra3", "done", "rosa completa"));
  await expectStatesComplete(page, "war-board-bid", full);

  // ── La variante MINI (momento asta) ───────────────────────────────────────
  // Stessi stati, stesse squadre: lo stato viene dal log, non dalla schermata.
  await page.getByText(SYNTHETIC_LISTONE_POOL[3]!.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#war-board-mini")).toBeVisible();

  const mini = new Map<string, number>();
  mini.set("open", await measureWarBoardMini(page, "Io", "open", "squadra intatta"));
  mini.set("locked", await measureWarBoardMini(page, "Squadra2", "locked", "budget bloccato (via dichiarata)"));
  mini.set("done", await measureWarBoardMini(page, "Squadra3", "done", "rosa completa"));
  await expectStatesComplete(page, "war-board-bid", mini);

  expect(externalRequests).toEqual([]);
});

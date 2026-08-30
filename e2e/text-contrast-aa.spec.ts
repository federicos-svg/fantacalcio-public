import { expect, test, type Page } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import { schedeDeposit } from "./fixtures/synthetic-schede.js";
import { ROLE_CHIP_CLASS } from "../src/ui/theme.js";
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

// IL TESTO SI LEGGE, IN TUTTA L'APP.
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
// TRE GUARDIE, COMPLEMENTARI:
//  1. un elenco esplicito di punti d'uso — diagnosticabile: quando fallisce si
//     sa QUALE testo è tornato illeggibile e in quale schermata;
//  2. una spazzata su tutto ciò che è a schermo — non aggirabile: un punto
//     d'uso nuovo, aggiunto domani in un pannello nuovo, viene misurato senza
//     che nessuno debba ricordarsi di aggiungerlo a un elenco;
//  3. le PASTIGLIE DI RUOLO, cercate per classe e non per colore: non portano
//     un token della rampa, e il glifo bianco su D (3,02:1) e su A (4,07:1)
//     era l'ultima famiglia di testo sotto soglia rimasta in questa app.
//
// LA SPAZZATA È FAIL-CLOSED. Fino a poco fa la guardia n. 2 misurava solo il
// testo il cui colore composito corrispondeva a un token della rampa, e solo i
// nodi di testo. C'erano quindi TRE modi di rendere illeggibile un testo senza
// che questa spec lo dicesse: dipingerlo di un colore qualsiasi; mettere un
// `opacity` su un pannello, che il colore composito lo cambia da sé; scriverlo
// con `::before` / `::after { content: … }`, che la spazzata non guardava
// proprio. Nei primi due casi l'elemento usciva dall'insieme misurato invece
// di essere bocciato; nel terzo non ci entrava mai. Tutte e tre le fughe sono
// state verificate rompendo davvero, non ragionando. Adesso ogni testo
// visibile — nodi di testo e pseudo-elementi — finisce in una di tre caselle:
// misurato e sopra AA, misurato e sotto AA (rosso), non classificabile
// (rosso, col motivo e il selettore stampati). Le uniche esclusioni sono
// dichiarate in helpers.ts — UNMEASURABLE_TEXT e THRESHOLD_EXEMPT — e ognuna
// porta scritto perché esiste.
//
// Tutte le righe sono sintetiche e il network guard aborta qualunque altra
// cosa.

const POOL: readonly ListonePlayer[] = [
  { name: "Primo Portiere", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Secondo Portiere", role: "P", club: "ClubUno", quotation: 5 },
  { name: "Terzo Portiere", role: "P", club: "ClubDue", quotation: 5 },
  { name: "Quarto Portiere", role: "P", club: "ClubDue", quotation: 5 },
  { name: "Primo Difensore", role: "D", club: "ClubTre", quotation: 8 },
  { name: "Primo Centrocampista", role: "C", club: "ClubTre", quotation: 12 },
  { name: "Primo Attaccante", role: "A", club: "ClubQuattro", quotation: 20 },
];

/**
 * I quattro livelli della rampa del testo di base.css.
 *
 * A COSA SERVONO, ADESSO. Solo a due cose, entrambe descrittive:
 *  - dire QUALE token è finito sotto soglia nel messaggio d'errore, perché
 *    «--text-dim su #26292f» si corregge e «#a8a9ae su #26292f» no;
 *  - provare che la rampa è ancora viva e ancora in uso (l'asserzione in fondo
 *    al test), così un token rinominato o smesso di usare si vede.
 *
 * NON decidono più CHI viene misurato. Lo facevano, ed era il difetto: un
 * testo dipinto fuori rampa non veniva bocciato, veniva escluso dall'insieme.
 * I valori restano risolti dal documento a runtime (resolveTokenColors) e mai
 * scritti a mano, perché anche l'etichetta diagnostica deve seguire il token
 * ovunque il token vada.
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
  // #333: il segnale di «schermata di chiamata pronta» è il campo di ricerca,
  // che è l'unica ragione per cui la schermata esiste.
  await expect(page.locator("#search-player")).toBeVisible();
}

/** Quanti elementi una scena ha davvero misurato, e quanti di questi
 *  portavano un colore della rampa. Il secondo numero non è un cancello: è la
 *  prova che la rampa è ancora in uso. */
type SweepCount = { readonly measured: number; readonly onRamp: number };

/**
 * LA SPAZZATA, FAIL-CLOSED: ogni elemento a schermo che porta testo proprio e
 * visibile o sta sopra AA, o fa fallire questo test — e se non è stato
 * possibile classificarlo, fa fallire questo test lo stesso, col motivo e il
 * selettore stampati.
 *
 * NIENTE FILTRO SUL COLORE. Il colore non decide più chi viene misurato: i
 * colori della rampa servono soltanto a scrivere «--text-dim» invece di
 * «#a8a9ae» nel messaggio d'errore. Prima decidevano, e allora un testo
 * dipinto fuori rampa — o un `opacity` su un antenato, che cambia il colore
 * composito e basta — usciva dall'insieme misurato invece di essere bocciato.
 * Il modo più facile di rendere illeggibile un testo era anche il modo più
 * facile di farlo sparire dalla prova che doveva impedirlo.
 *
 * E NIENTE FILTRO SULLA PROVENIENZA: il `content` di `::before` / `::after` è
 * testo dipinto a schermo esattamente come un nodo di testo, e viene misurato
 * come tale (helpers.ts, measureAllText).
 *
 * Cosa resta fuori, e perché: SOLO ciò che è dichiarato in helpers.ts —
 * UNMEASURABLE_TEXT (contenuto di <head>, testo del widget nativo di
 * <select>) e THRESHOLD_EXEMPT (controlli disabilitati, che WCAG 1.4.3 esenta
 * esplicitamente e che qui restano misurati e riportati, solo non tenuti alla
 * soglia). Ogni voce porta scritto accanto il proprio perché.
 *
 * In particolare NON sono più fuori i colori che non appartengono alla rampa —
 * verde crediti, rosso STOP, accent, glifi delle pastiglie, bianco sui
 * bottoni: sono testo dell'app, si leggono o non si leggono, e adesso la
 * spazzata lo dice.
 */
async function expectAllTextAboveAA(
  page: Page,
  scene: string,
  scope = "*",
): Promise<SweepCount> {
  const resolved = await resolveTokenColors(page, TEXT_RAMP_TOKENS);
  const byColor = new Map(Object.entries(resolved).map(([token, hex]) => [hex, token]));
  const swept = await measureAllText(page, scope);

  // Categoria 3 — NON CLASSIFICABILE: rossa, non saltata. È l'intero motivo
  // per cui questa spazzata è stata riscritta.
  const unclassified = swept
    .filter((m) => m.kind === "unclassified")
    .map((m) => `${scene}: ${m.reason} — ${m.label}`);
  expect(
    unclassified,
    `testo non classificabile in «${scene}»: la spazzata non può dirlo leggibile, quindi lo boccia`,
  ).toEqual([]);

  const measured = swept.flatMap((m) => (m.kind === "measured" ? [m] : []));
  // Categoria 2 — MISURATO E SOTTO SOGLIA.
  const failures = measured
    .filter((m) => m.exempt === null && m.ratio < AA_NORMAL_TEXT)
    .map(
      (m) =>
        `${scene}: ${byColor.get(m.fg) ?? m.fg} su ${m.bg} @opacity ${m.opacity.toFixed(2)} = ` +
        `${m.ratio.toFixed(2)}:1 (${m.fontSize}px) — ${m.label}`,
    );
  expect(failures, `contrasto sotto ${AA_NORMAL_TEXT}:1 in «${scene}»`).toEqual([]);

  const held = measured.filter((m) => m.exempt === null);
  return { measured: held.length, onRamp: held.filter((m) => byColor.has(m.fg)).length };
}

/**
 * LE PASTIGLIE DI RUOLO — la terza guardia, con la stessa soglia.
 *
 * Il chip P/D/C/A è testo a 10px dentro un disco colorato: testo normale per
 * WCAG, soglia 4,5:1, nessuna eccezione "large text". Col glifo bianco D
 * stava a 3,02:1 e A a 4,07:1 — i due ruoli che in asta si guardano di più.
 * Il glifo è passato a scuro (theme.ts, ROLE_COLORS): D 5,22:1, A 4,79:1.
 * P era già scuro (9,18:1) e C regge il bianco (4,83:1): invariati.
 *
 * I FONDI non sono cambiati e non devono cambiare: la convenzione di hue dei
 * ruoli (A a 18, distinto dallo STOP a 25) è una decisione di prodotto.
 *
 * Perché per classe e non per colore: `.role-chip` è una classe di sola
 * identità, senza regole CSS. Un selettore costruito sui colori attesi
 * smetterebbe di corrispondere proprio nell'istante in cui qualcuno rimette
 * il bianco — zero elementi misurati, test verde, app rotta. È lo stesso
 * inciampo, già visto sul campo, che ha portato TEXT_RAMP_TOKENS a risolversi
 * da :root a runtime invece che da una costante scritta a mano.
 */
/** Luminanza relativa WCAG di un colore già composito, in `#rrggbb`. Serve
 *  solo a confrontare due dischi fra loro: il contrasto lo misura helpers.ts. */
function relativeLuminance(hex: string): number {
  const channel = (i: number): number => {
    const s = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

async function expectRoleChipsAboveAA(page: Page, scene: string): Promise<Set<string>> {
  const chips = await measureAllText(page, `.${ROLE_CHIP_CLASS}`);
  // Stessa regola della spazzata: una pastiglia che non si riesce a
  // classificare non è una pastiglia da saltare.
  expect(
    chips.flatMap((m) => (m.kind === "unclassified" ? [`${scene}: ${m.reason} — ${m.label}`] : [])),
    `pastiglia di ruolo non classificabile in «${scene}»`,
  ).toEqual([]);
  const measured = chips.flatMap((m) => (m.kind === "measured" ? [m] : []));
  const failures = measured
    .filter((m) => m.ratio < AA_NORMAL_TEXT)
    .map(
      (m) =>
        `${scene}: pastiglia «${m.text}» ${m.fg} su ${m.bg} @opacity ${m.opacity.toFixed(2)} = ` +
        `${m.ratio.toFixed(2)}:1 (${m.fontSize}px)`,
    );
  expect(failures, `pastiglie di ruolo sotto ${AA_NORMAL_TEXT}:1 in «${scene}»`).toEqual([]);
  return new Set(measured.map((m) => m.text));
}

test("il testo regge AA in ogni schermata, in entrambi i momenti e su ogni pastiglia", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);
  await boot(page);

  let sampled = 0;
  let onRamp = 0;
  // I ruoli le cui pastiglie sono state DAVVERO misurate almeno una volta.
  // Serve a rendere impossibile un verde per assenza: vedi l'asserzione in
  // fondo al test.
  const rolesSeen = new Set<string>();
  const sweepScene = async (scene: string): Promise<void> => {
    const count = await expectAllTextAboveAA(page, scene);
    sampled += count.measured;
    onRamp += count.onRamp;
    for (const role of await expectRoleChipsAboveAA(page, scene)) rolesSeen.add(role);
  };

  // ── ASTA — momento CHIAMATA ───────────────────────────────────────────────
  // #331 punto 5: il dettaglio per ruolo della fascia critica (barre e
  // micro-etichette del piano) sta dietro un gesto. Va APERTO prima di
  // misurare: `measureAllText` salta ciò che non ha rettangolo, quindi
  // lasciarlo chiuso non farebbe fallire nulla — farebbe smettere di misurare,
  // che è il modo esatto in cui questa suite era già riuscita a restare verde
  // sull'app rotta (vedi la nota su resolveTokenColors in helpers.ts).
  // Lo stato resta aperto per le scene successive: la fascia si ricostruisce a
  // ogni render, ma `criticalPlanOpen` è stato dell'app, non del DOM.
  await page.locator("#critical-roster").click();
  await expect(page.locator("#critical-role-plan-P")).toBeVisible();

  // SCARSITÀ PER RUOLO e WAR BOARD non hanno più bisogno di un gesto: IL
  // TAVOLO è sempre aperto (2026-08-26), quindi i due pannelli hanno il proprio
  // rettangolo fin dal boot e `measureAllText` li misura senza che nessuno li
  // apra. Erano l'unica parte di questa spazzata che dipendeva da uno stato
  // dell'app — compreso `.scarcity-metric > span`, uno dei punti d'uso
  // espliciti qui sotto.

  // #COLONNE (2026-08-24): il pannello «Colonne visibili» sta dietro un gesto,
  // esattamente come i due qui sopra — da chiuso non ha rettangolo e la
  // spazzata non lo salta, semplicemente non trova nulla da misurare. È il
  // comando con cui si riaccendono le colonne nascoste: va aperto, o resta
  // fuori sorveglianza. Anche questo stato sopravvive alle scene successive.
  await page.locator("#listone-column-panel-toggle").click();
  await expect(page.locator("#listone-column-panel")).toBeVisible();

  // I punti d'uso espliciti: micro-etichette del piano per ruolo, etichetta
  // del filtro di stato, nota del listone.
  // Ognuno era fra 2,43:1 e 2,75:1 prima della schiaritura.
  for (const sel of [
    ".critical-role-plan-item em", // --text-dim, 2,75:1 prima
    ".status-filter__label", // --text-dim, «FILTRO», 2,75:1 prima
    ".status-filter__caret", // --text-dim, 2,75:1 prima
    ".listone-table-head > div", // --text-sec su --panel-inner, 4,01:1 prima
    ".scarcity-metric > span", // --text-sec, «slot liberi» / «in listone»
    ".listone-columns__label", // --text-sec su --panel-inner, «Colonne:»
    ".listone-columns__toggle", // --text-sec, l'interruttore spento
    ".listone-columns__toggle[aria-pressed='true']", // --text-primary, acceso
    ".listone-columns__mark", // --text-accent, il segno di spunta
    ".listone-columns__lock", // --text-sec, «sempre» sulle tre blindate
    "#listone-columns-identity-note", // --text-sec, la riga che dice perché
    "#listone-expert-signals-note", // --text-dim, la riga che dichiara i n/d
  ]) {
    expect(await textContrast(page, sel), `chiamata: ${sel}`).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  }
  await sweepScene("asta/chiamata");

  // ── ASTA — momento LIVE ───────────────────────────────────────────────────
  await callPlayer(page, "Quarto Portiere");
  await page.locator("#assign-price").fill("30");
  // #331 punto 2 — MOMENTO DELL'ASTA è ridotto al ruolo chiamato dentro la
  // scheda del giocatore, e gli altri tre ruoli più il censimento MERCATO
  // stanno dietro un gesto. La spazzata misura solo ciò che è VISIBILE: senza
  // aprire, questi selettori uscirebbero dalla misura in silenzio e il
  // contrasto smetterebbe di essere sorvegliato proprio dove nessuno guarda.
  // Restano nell'elenco esplicito, e per starci il gesto va fatto.
  await page.locator("#moment-facts-toggle").click();
  await expect(page.locator("#moment-facts-detail")).toBeVisible();
  for (const sel of [
    "#moment-market-basis", // --text-dim su --panel-inner, 2,43:1 prima
    "#war-board-mini-note", // --text-dim, «bdg = crediti residui · max bid = …»
    "#opponent-precedents-headline", // --text-mid, la sintesi dei precedenti
    ".moment-scarcity__called", // --accent come testo, «IN ASTA», 3,02:1 prima
    ".moment-market__head", // --text-sec su --panel-inner, 4,01:1 prima
    ".war-board-mini__name", // --text-sec su --panel-inner, 4,01:1 prima
  ]) {
    expect(await textContrast(page, sel), `live: ${sel}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  }
  await sweepScene("asta/live");

  // ── LISTONE — riga già assegnata ──────────────────────────────────────────
  // Il caso che nessuna schiaritura del token da sola risolveva: `opacity:
  // 0.6` sulla riga moltiplicava ogni figlio contro lo sfondo e portava il
  // badge «Assegnato» a 1,67:1 e il NOME del giocatore a 4,28:1.
  await page.locator("#assign-team").selectOption("Io");
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#search-player")).toBeVisible();
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
  // ARRETRATA ANCHE NELLE PARTI NON TESTUALI. `opacity` attenuava tutto;
  // `color` attenua solo il testo, quindi togliendo l'opacità il disco della
  // pastiglia era tornato fra 2,1x e 2,5x più luminoso — la riga che non puoi
  // più comprare diventava la cosa più accesa del listone. La variante
  // arretrata (theme.ts, mutedBg) lo rimette giù senza opacità e senza
  // toccare il testo; qui si verifica che ci resti, confrontando lo STESSO
  // ruolo fra una riga assegnata e una libera.
  // Anche qui una pastiglia non classificabile non vale come confronto: si
  // prendono solo le misurate, e si esige che ce ne sia almeno una.
  const measuredChips = async (sel: string): Promise<{ bg: string; text: string }[]> =>
    (await measureAllText(page, sel)).flatMap((m) => (m.kind === "measured" ? [m] : []));
  const assignedChips = await measuredChips(`.listone-row--assigned .${ROLE_CHIP_CLASS}`);
  const freeChips = await measuredChips(
    `.listone-row:not(.listone-row--assigned) .${ROLE_CHIP_CLASS}`,
  );
  expect(assignedChips.length, "serve almeno una pastiglia in riga assegnata").toBeGreaterThan(0);
  const brightest = new Map<string, number>();
  for (const chip of freeChips) {
    const lum = relativeLuminance(chip.bg);
    brightest.set(chip.text, Math.max(brightest.get(chip.text) ?? 0, lum));
  }
  for (const chip of assignedChips) {
    const free = brightest.get(chip.text);
    expect(free, `serve una riga libera con la pastiglia «${chip.text}» da confrontare`).toBeDefined();
    expect(
      relativeLuminance(chip.bg),
      `la pastiglia «${chip.text}» di una riga assegnata è accesa quanto quella di una riga libera: ` +
        `la riga non si legge più come arretrata`,
    ).toBeLessThan(free!);
  }
  await sweepScene("asta/listone-assegnati");

  // ── ROSE ──────────────────────────────────────────────────────────────────
  await gotoScreen(page, "Rose");
  for (const sel of [
    "#opponent-tier1-note", // --text-dim, nota di contabilità
    ".opponent-tier1__total", // --text-sec su --panel-inner, 4,01:1 prima
  ]) {
    expect(await textContrast(page, sel), `rose: ${sel}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  }
  await sweepScene("rose");

  // ── IMPOSTAZIONI ──────────────────────────────────────────────────────────
  await gotoScreen(page, "Impostazioni");
  // Un partecipante creato prima della spazzata: senza nessuno in archivio la
  // riga «nome → identificativo» non esiste, e il testo più piccolo di questa
  // schermata — l'identificativo, 10,5px monospace su --panel-inner — non
  // verrebbe misurato affatto.
  await openSettingsSection(page, "teams");
  await page.locator("#new-person-name").fill("Persona Sintetica");
  await page.locator("#add-person").click();
  await expect(page.locator("#league-people-list .person-id-value")).toHaveCount(1);
  // CINQUE sezioni: la spazzata le attraversa tutte. `archivio` entra qui
  // insieme alle altre — l'unione di id di `openSettingsSection` non è più
  // ferma, quindi il giro a mano che serviva prima non serve più.
  for (const section of ["teams", "riconferme", "schede", "archivio", "status"] as const) {
    await openSettingsSection(page, section);
    await sweepScene(`impostazioni/${section}`);
  }
  // ARCHIVIO AVVERSARI, secondo passaggio: i due riquadri della forma del file
  // stanno dentro un <details> CHIUSO, e `measureAllText` salta ciò che non ha
  // rettangolo. Il giro qui sopra li ha quindi attraversati senza misurarli:
  // vanno aperti, o il loro testo resta fuori dalla spazzata.
  await openSettingsSection(page, "archivio");
  await page.locator("#archive-history-shape summary").click();
  await page.locator("#archive-profiles-shape summary").click();
  await sweepScene("impostazioni/archivio-dettagli");

  // SCHEDE — il modulo e il riquadro d'allarme esistono solo dopo un gesto:
  // da chiusi non hanno rettangolo, e `measureAllText` salta ciò che non ne
  // ha. Senza questi due gesti la spazzata resterebbe verde su un pannello
  // intero mai misurato — lo stesso modo in cui questa suite era già riuscita
  // a restare verde sull'app rotta.
  await openSettingsSection(page, "schede");
  await page.locator("#schede-player").selectOption({ index: 1 });
  await expect(page.locator("#schede-form")).toBeVisible();
  // I punti d'uso ESPLICITI del pannello, misurati uno per uno come quelli
  // delle altre schermate. Non sono un doppione della spazzata: la spazzata
  // salta ciò che sta dentro un gruppo di composizione (il colore composito
  // non corrisponde più al token, vedi expectRampAboveAA), quindi da sola
  // resterebbe verde se domani qualcuno attenuasse questo pannello con
  // un'`opacity`. Questi selettori misurano il colore REALE, qualunque esso
  // sia diventato.
  for (const sel of [
    "#schede-progress-count", // l'avanzamento delle due ore
    "#schede-progress-percent", // la cifra accanto alla barra
    "#schede-identity-note", // perché nome e squadra non si scrivono
    "#schede-nota-counter", // il contatore della nota, --text-dim
    ".schede-check", // le etichette delle checkbox del vocabolario
    // I due blocchi arrivati coi tre campi che il contratto ammetteva e che
    // nessuno poteva scrivere: la loro prosa è --text-dim su .schede-group,
    // cioè una superficie che prima non esisteva.
    "#schede-ballottaggio-hint", // perché i nomi arrivano al riquadro solo col ballottaggio
    "#schede-pagella-hint", // «un voto vuoto resta n/d, non diventa zero»
    "#schede-pagella-verifica", // somma ricalcolata contro totale dichiarato
  ]) {
    expect(await textContrast(page, sel), `schede: ${sel}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  }
  await sweepScene("impostazioni/schede-modulo");

  // Il modulo vuoto rifiutato: misura il riquadro d'allarme e il contatore
  // della nota, cioè le due superfici che compaiono solo quando qualcosa va
  // storto — che è esattamente quando devono essere leggibili.
  await page.locator("#schede-save").click();
  await expect(page.locator("#schede-errors")).toBeVisible();
  for (const sel of ["#schede-errors li", "#schede-deposit-status"]) {
    expect(await textContrast(page, sel), `schede: ${sel}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  }
  await sweepScene("impostazioni/schede-errori");

  // ── LISTONE A 390px — LA RESA CHE SI LEGGE DAVVERO IN ASTA ────────────────
  //
  // #COLONNE (2026-08-24): sotto i 900px il listone smette di essere una
  // tabella e ogni casella si porta la propria etichetta, disegnata da
  // `content: attr(data-label)` su `::before`. È testo dipinto a schermo che
  // A 1280px NON ESISTE — quindi nessuna delle scene qui sopra lo ha mai
  // toccato, e sarebbe stato l'unico testo dell'app fuori misura proprio nel
  // formato in cui il listone si legge davvero: un telefono, in piedi, con i
  // secondi contati.
  //
  // Spazzata RISTRETTA al listone e non all'intera pagina: cambiare viewport
  // ridisegna ogni pannello dell'app, e una scena d'insieme a 390px
  // misurerebbe (e potrebbe bocciare) mezza applicazione per ragioni che non
  // hanno niente a che vedere con queste colonne. Ristretta resta comunque
  // fail-closed: dentro il listone, un testo non classificabile è rosso
  // esattamente come uno sotto soglia.
  await gotoScreen(page, "Asta");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".listone-row").first()).toBeVisible();
  // Le etichette esistono solo sotto i 900px: se questa non c'è, la misura
  // qui sotto starebbe guardando il vuoto.
  expect(
    await page
      .locator('.listone-row [data-col="scheda_rigorista"]')
      .first()
      .evaluate((el) => getComputedStyle(el, "::before").content),
    "a 390px ogni casella deve portare la propria etichetta",
  ).toContain("Rigorista");
  const narrow = await expectAllTextAboveAA(
    page,
    "asta/listone-390",
    ".listone-table, .listone-table *, .listone-columns, .listone-columns *",
  );
  expect(narrow.measured, "la spazzata stretta non ha misurato nulla nel listone").toBeGreaterThan(
    20,
  );
  sampled += narrow.measured;
  onRamp += narrow.onRamp;

  // La spazzata non può essere passata per vuoto — due pavimenti distinti,
  // perché adesso misurano due cose diverse.
  //
  // 1. QUANTO TESTO È STATO DAVVERO MISURATO. Con il filtro sul colore tolto
  //    questo è il conto di tutto il testo dell'app, non del solo sottoinsieme
  //    riconosciuto: se crolla, qualcosa ha smesso di renderizzare o la
  //    spazzata ha ricominciato a saltare.
  // RITARATO il 2026-08-24 sul riallineamento di #41 su `main`: 1500 -> 2700.
  // Il pavimento era rimasto quello di quando la spazzata attraversava meno
  // scene; poi #23 ha aggiunto l'area «archivio» (due scene), #33 il radar e
  // le icone, #41 il listone a 390px, e NESSUNO l'ha rialzato. A 3033 misurati
  // un pavimento a 1500 avrebbe lasciato sparire METÀ delle scene senza
  // diventare rosso: aveva smesso di essere un pavimento. 2700 è ~90% del
  // misurato — abbastanza sotto da non essere fragile, abbastanza vicino da
  // accorgersi di una schermata che smette di renderizzare.
  expect(sampled, "la spazzata non ha misurato quasi nulla: schermate vuote o spazzata inerte")
    .toBeGreaterThan(2700);

  // 2. QUANTO DI QUEL TESTO PORTA ANCORA UN COLORE DELLA RAMPA. È la difesa
  //    che c'era prima, conservata intatta: un token rinominato o smesso di
  //    usare lo si vede qui invece che da un verde silenzioso. Non è più un
  //    cancello sull'insieme misurato — è un'osservazione sull'app.
  // RITARATO il 2026-08-24 con lo stesso criterio: 400 -> 1600 su 1814
  // misurati. Qui lo scarto era ancora più grosso — il pavimento vecchio
  // valeva un quarto del vero.
  expect(onRamp, "nessun testo usa più la rampa: TEXT_RAMP_TOKENS è disallineata")
    .toBeGreaterThan(1600);

  // Stessa difesa per le pastiglie: tutti e quattro i ruoli devono essere
  // stati misurati almeno una volta. Senza questo, togliere la classe
  // `.role-chip` (o smettere di renderizzare un ruolo) farebbe misurare zero
  // pastiglie e il test resterebbe verde con l'app sotto soglia.
  expect(
    [...rolesSeen].sort(),
    "le pastiglie di ruolo non sono state misurate: classe .role-chip persa o ruolo non renderizzato",
  ).toEqual(["A", "C", "D", "P"]);

  expect(externalRequests).toEqual([]);
});

// ── IL MARCATORE DELL'ASSE, MISURATO DAVVERO ─────────────────────────────────
//
// PERCHÉ SERVE UNA SCENA A PARTE. `.listone-axis-tag` compare SOLO su una
// cella che porta un voto, e un voto esiste solo se il deposito delle schede
// porta una pagella. Il test qui sopra non ne serve nessuna — è il ramo di
// oggi, ogni cella `n/d` — quindi il marcatore non ha mai avuto un rettangolo
// e la spazzata non ha mai avuto niente da misurare su di lui. Il commento in
// src/styles/listone.css dichiarava che sta «sulla rampa che la guardia di
// contrasto misura»: era vero come intenzione e falso come fatto.
//
// Non reinventa la misura: stesse funzioni (`measureAllText`, `textContrast`
// da helpers.ts), stessa soglia, stesse categorie. Cambia solo la SCENA.

const AXIS_PAGELLA_MOVIMENTO = {
  voti: {
    pagella_titolarita: 9,
    pagella_media_voto: 7,
    pagella_salute: 9,
    pagella_bonus: 6,
    pagella_consiglio: 8,
  },
  totaleFonte: 39,
} as const;

const AXIS_PAGELLA_PORTIERE = {
  voti: {
    pagella_titolarita: 1,
    pagella_media_voto: 1,
    pagella_salute: 8,
    pagella_porta_inviolata: 1,
    pagella_consiglio: 1,
  },
  totaleFonte: 12,
} as const;

test("il marcatore dell'asse regge AA — sigla visibile e frase fuori dalla vista", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, POOL, externalRequests);
  // Registrata DOPO il guard: Playwright valuta i route handler dal più recente.
  await context.route("**/api/schede", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: schedeDeposit([
        {
          player: "Primo Difensore",
          club: "ClubTre",
          titolarita: "titolare",
          pagella: AXIS_PAGELLA_MOVIMENTO,
        },
        {
          player: "Primo Portiere",
          club: "ClubUno",
          titolarita: "titolare",
          pagella: AXIS_PAGELLA_PORTIERE,
        },
      ] as never),
    }),
  );
  await boot(page);

  // La scena deve avere SOSTANZA: senza marcatori a schermo questa spec
  // sarebbe verde misurando il nulla — lo stesso difetto che la spazzata
  // d'insieme esiste per non avere.
  const tags = page.locator(".listone-row .listone-axis-tag");
  await expect(tags).toHaveCount(2);
  await expect(page.locator(".listone-axis-tag__sr").first()).toHaveCount(1);

  // I due punti d'uso espliciti: la sigla che si vede e la frase che non si
  // vede ma che il browser dipinge lo stesso (1px, clippata) e che quindi
  // entra nella spazzata come qualunque altro testo.
  for (const sel of [
    ".listone-axis-tag [aria-hidden='true']", // «PI» / «BO», --text-sec a 9,5px
    ".listone-axis-tag__sr", // la frase per esteso, stesso colore
  ]) {
    expect(await textContrast(page, sel), `marcatore: ${sel}`).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  }

  // E la spazzata d'insieme sulla stessa scena, con le stesse tre categorie.
  const swept = await expectAllTextAboveAA(page, "asta/listone-marcatore-asse");
  expect(swept.measured, "spazzata inerte sulla scena del marcatore").toBeGreaterThan(100);

  expect(externalRequests).toEqual([]);
});

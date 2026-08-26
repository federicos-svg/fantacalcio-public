import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  COMMUNITY_SCHEDA,
  FULL_NAME_SCHEDA,
  FULL_SCHEDA,
  OTHER_CLUB,
  OTHER_PLAYER,
  OTHER_PLAYER_SCHEDA,
  PROSE_ONLY_SCHEDA,
  SCHEDA_CLUB,
  SCHEDA_PLAYER,
  SECOND_FULL_NAME,
  SECOND_FULL_NAME_SCHEDA,
  SHORT_NAME,
  schedeDeposit,
} from "./fixtures/synthetic-schede.js";
import {
  AA_NORMAL_TEXT,
  installSyntheticNetworkGuard,
  measureAllText,
  resolveTokenColors,
  textContrast,
} from "./helpers.js";
import { EXPERT_INSIGHT_QUALITY_LABELS } from "../src/expertScheda.js";
import {
  EXPERT_INSIGHT_CHOICE_PENDING_TEXT,
  EXPERT_INSIGHT_EMPTY_TEXT,
  EXPERT_INSIGHT_LABEL_TEXT,
  SCHEDA_CHOICE_CLEAR_LABEL,
  SCHEDA_CHOICE_LINKED_NOTE,
} from "../src/ui/expertInsight.js";

// INSIGHT GIOCATORE — il riquadro delle schede del Gruppo Esperti sul DOM vivo.
//
// Le schede sono scritte a mano da Pico PRIMA dell'asta e servite a runtime dal
// deposito privato su `/api/schede` (stessa forma e stesso perimetro di
// `/api/listone`). Qui il deposito è sintetico e viaggia sullo STESSO canale
// dell'app reale: la spec esercita content-type, JSON, validazione fail-closed
// e indicizzazione per `listonePlayerKey`, non una porta di servizio.
//
// LE TRE COSE CHE QUESTA SPEC DIFENDE:
//  1. TUTTI E CINQUE gli stati di disponibilità sono raggiungibili e onesti —
//     i quattro «non lo so» non devono mai sembrare pieni;
//  2. il riquadro si dichiara per quello che è con UNA label, «Scheda Esperto»
//     in alto a destra (decisione di Pico: quattro scritte di caveat sopra ogni
//     giocatore smettono di essere lette). I tre letterali `false` del payload
//     restano nel contratto e nel `title` della label, e la forma parlata del
//     pannello porta l'etichetta di qualità per intero: la prova qui sotto
//     diventa rossa se una di queste tre cose sparisce;
//  3. lo strato visivo e lo strato di PROSA convivono, restano leggibili sopra
//     AA e non fanno traboccare la schermata a nessuna delle quattro larghezze.

const SCHEDE_PATH = "/api/schede";
const TARGET = SYNTHETIC_LISTONE_POOL.find((p) => p.name === SCHEDA_PLAYER)!;

type SchedeRoute =
  | { readonly kind: "not-deployed" }
  | { readonly kind: "not-json" }
  | { readonly kind: "serve"; readonly body: string };

/**
 * Risponde a `/api/schede` come farebbe l'endpoint privato. Registrata DOPO il
 * guard di rete: Playwright valuta i route handler dal più recente, quindi
 * questo vince sul pass-through same-origin del guard senza toccarlo.
 */
async function routeSchede(context: BrowserContext, route: SchedeRoute): Promise<void> {
  await context.route(`**${SCHEDE_PATH}`, (r) => {
    if (route.kind === "not-deployed") {
      return r.fulfill({ status: 503, contentType: "application/json", body: `{"error":"not_configured"}` });
    }
    if (route.kind === "not-json") {
      // Il caso vero di «Pages Functions non c'è»: la SPA risponde 200 con la
      // propria index.html, e trattarla come dati sarebbe un default silenzioso.
      return r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html></html>" });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: route.body });
  });
}

async function boot(page: Page, context: BrowserContext, route: SchedeRoute): Promise<string[]> {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await routeSchede(context, route);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
  return externalRequests;
}

/** Apre il momento LIVE sul giocatore chiamato. */
async function callTarget(page: Page): Promise<void> {
  await page.getByText(TARGET.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#player-insight-panel")).toBeVisible();
}

/** Il riquadro non mostra MAI contenuto negli stati che dichiarano di non averne. */
async function expectNoContent(page: Page): Promise<void> {
  await expect(page.locator("#player-insight-track")).toHaveCount(0);
  await expect(page.locator("#player-insight-chips")).toHaveCount(0);
  await expect(page.locator("#player-insight-prose")).toHaveCount(0);
  await expect(page.locator("#player-insight-meta")).toHaveCount(0);
}

/**
 * LA LABEL UNICA, E LA GARANZIA CHE PORTA.
 *
 * RIFATTA, non svuotata: cercava le quattro pastiglie di caveat («PARERE DI
 * TERZI · NON VALIDATO · NON È UN CONSIGLIO · FUORI DAL CALCOLO»), che Pico ha
 * ridotto a una sola label guardando il pannello. La garanzia non è sparita,
 * si è spostata, e questa funzione la segue nei tre posti dove vive adesso:
 *  - a schermo: UNA label, visibile, con la sua parola, e nessun residuo delle
 *    quattro di prima (un ritorno silenzioso a quelle è rosso);
 *  - nel `title` della label: i tre campi del payload nominati uno per uno,
 *    così `validated: false` resta leggibile da chi va a cercarlo;
 *  - nella forma parlata del pannello: l'etichetta di qualità DELLO STATO per
 *    intero — chi naviga a voce non ha la label in alto a destra, e nello stato
 *    pieno quell'etichetta è proprio «segnale esperto — descrittivo, non
 *    validato».
 */
async function expectHonestyVisible(
  page: Page,
  quality: (typeof EXPERT_INSIGHT_QUALITY_LABELS)[keyof typeof EXPERT_INSIGHT_QUALITY_LABELS],
): Promise<void> {
  const label = page.locator("#player-insight-label");
  await expect(label).toBeVisible();
  await expect(label).toHaveText(EXPERT_INSIGHT_LABEL_TEXT);
  await expect(page.locator("#player-insight-panel")).not.toContainText("PARERE DI TERZI");
  await expect(page.locator("#player-insight-panel")).not.toContainText("FUORI DAL CALCOLO");
  const title = (await label.getAttribute("title")) ?? "";
  expect(title).toContain("validated: false");
  expect(title).toContain("directive: false");
  expect(title).toContain("contributesToIndex: false");
  const spoken = (await page.locator("#player-insight-panel").getAttribute("aria-label")) ?? "";
  expect(spoken).toContain(EXPERT_INSIGHT_LABEL_TEXT);
  expect(spoken).toContain(quality);
}

test("i cinque stati: deposito non letto, scheda non scritta, doppia scheda, fonte non di staff, scheda piena", async ({
  page,
  context,
}) => {
  // 1. source_unavailable — l'endpoint non è deployato.
  const externalRequests = await boot(page, context, { kind: "not-json" });
  await callTarget(page);
  await expect(page.locator("#player-insight-quality")).toHaveText(
    EXPERT_INSIGHT_QUALITY_LABELS.source_unavailable,
  );
  await expect(page.locator("#player-insight-empty")).toContainText(
    EXPERT_INSIGHT_EMPTY_TEXT.source_unavailable,
  );
  await expectNoContent(page);
  await expectHonestyVisible(page, EXPERT_INSIGHT_QUALITY_LABELS.source_unavailable);

  // 2. no_expert_signal — il deposito si legge, questo giocatore non ha scheda.
  await context.unrouteAll();
  const requests2 = await boot(page, context, {
    kind: "serve",
    body: schedeDeposit([OTHER_PLAYER_SCHEDA]),
  });
  await callTarget(page);
  await expect(page.locator("#player-insight-quality")).toHaveText(
    EXPERT_INSIGHT_QUALITY_LABELS.no_expert_signal,
  );
  await expect(page.locator("#player-insight-empty")).toContainText(
    EXPERT_INSIGHT_EMPTY_TEXT.no_expert_signal,
  );
  await expectNoContent(page);
  await expectHonestyVisible(page, EXPERT_INSIGHT_QUALITY_LABELS.no_expert_signal);

  // 3. identity_not_resolved — due schede sullo stesso giocatore.
  await context.unrouteAll();
  await boot(page, context, {
    kind: "serve",
    body: schedeDeposit([FULL_SCHEDA, PROSE_ONLY_SCHEDA]),
  });
  await callTarget(page);
  await expect(page.locator("#player-insight-quality")).toHaveText(
    EXPERT_INSIGHT_QUALITY_LABELS.identity_not_resolved,
  );
  await expect(page.locator("#player-insight-empty")).toContainText(
    EXPERT_INSIGHT_EMPTY_TEXT.identity_not_resolved,
  );
  // Nessuna delle due schede trapela: né i segnali della piena né la prosa.
  await expectNoContent(page);
  await expect(page.locator("#player-insight-panel")).not.toContainText("Ballottaggio aperto");
  await expectHonestyVisible(page, EXPERT_INSIGHT_QUALITY_LABELS.identity_not_resolved);

  // 4. author_authority_not_verified — fonte non di staff.
  await context.unrouteAll();
  await boot(page, context, { kind: "serve", body: schedeDeposit([COMMUNITY_SCHEDA]) });
  await callTarget(page);
  await expect(page.locator("#player-insight-quality")).toHaveText(
    EXPERT_INSIGHT_QUALITY_LABELS.author_authority_not_verified,
  );
  await expect(page.locator("#player-insight-empty")).toContainText(
    EXPERT_INSIGHT_EMPTY_TEXT.author_authority_not_verified,
  );
  await expectNoContent(page);
  await expect(page.locator("#player-insight-panel")).not.toContainText("Ballottaggio aperto");
  await expectHonestyVisible(page, EXPERT_INSIGHT_QUALITY_LABELS.author_authority_not_verified);

  // 5. available — la scheda piena, entrambi gli strati.
  await context.unrouteAll();
  await boot(page, context, { kind: "serve", body: schedeDeposit([FULL_SCHEDA]) });
  await callTarget(page);
  // Nello stato pieno l'etichetta di qualità non è più una seconda riga a
  // schermo (diceva la stessa cosa della label): resta nel payload e nella
  // forma parlata, che `expectHonestyVisible` verifica.
  await expect(page.locator("#player-insight-quality")).toHaveCount(0);
  await expect(page.locator("#player-insight-empty")).toHaveCount(0);
  await expectHonestyVisible(page, EXPERT_INSIGHT_QUALITY_LABELS.available);
  // LA PROVA CHE DEVE MORDERE: nello stato pieno la non-validazione resta
  // dichiarata, nel tooltip della label e nella forma parlata del pannello.
  const spokenFull = (await page.locator("#player-insight-panel").getAttribute("aria-label")) ?? "";
  expect(spokenFull).toContain("non validato");

  expect(externalRequests).toEqual([]);
  expect(requests2).toEqual([]);
});

test("un vocabolario solo: i riquadri di INSIGHT GIOCATORE hanno la forma delle schede della chiamata", async ({
  page,
  context,
}) => {
  // RICHIESTA DI PICO, 2026-08-26: il riquadro insight «nella forma delle
  // schede che già esistono nella schermata di chiamata» — titolo in
  // maiuscoletto piccolo, corpo sotto, riquadri affiancati su due colonne.
  //
  // QUESTA PROVA MISURA LA COSA CHE CONTA, che non è «l'insight ha dei
  // titoli»: è che i titoli dei DUE POSTI siano LO STESSO STILE. Un test che
  // guardasse solo il pannello insight resterebbe verde il giorno in cui
  // qualcuno ritocca una delle due copie — che è esattamente com'era prima di
  // questo lavoro, quando le copie erano tre e una era già divergente.
  const externalRequests = await boot(page, context, {
    kind: "serve",
    body: schedeDeposit([FULL_SCHEDA]),
  });

  /** Corpo, peso, spaziatura e colore di un titolo: la sua identità visiva. */
  async function titleStyles(selector: string): Promise<readonly string[]> {
    return page.$$eval(selector, (els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return [cs.fontSize, cs.fontWeight, cs.letterSpacing, cs.color, cs.marginBottom].join("|");
      }),
    );
  }

  // 1. LA SCHERMATA DI CHIAMATA. I tre titoli del blocco suggerito —
  //    «GIOCATORE SUGGERITO — CHI CHIAMARE ORA», «PER ME», «PER FAR SPENDERE
  //    GLI ALTRI» — portano tutti la classe condivisa.
  const chiamataTitles = page.locator("#suggested-player .scheda-card__title");
  await expect(chiamataTitles).toHaveCount(3);
  await expect(chiamataTitles.nth(0)).toContainText("GIOCATORE SUGGERITO — CHI CHIAMARE ORA");
  await expect(chiamataTitles.nth(1)).toContainText("PER ME");
  await expect(chiamataTitles.nth(2)).toContainText("PER FAR SPENDERE GLI ALTRI");
  const chiamataStyles = await titleStyles("#suggested-player .scheda-card__title");
  // Tre titoli, UNA identità visiva: è ciò che «una copia sola» vuol dire.
  expect(new Set(chiamataStyles).size, `tre titoli, ${chiamataStyles.length} stili`).toBe(1);

  // 2. IL PANNELLO INSIGHT, nel momento d'asta: due riquadri, ciascuno col
  //    proprio titolo, e il titolo è LO STESSO di quelli della chiamata.
  await callTarget(page);
  const cards = page.locator("#player-insight-cards > .scheda-card");
  await expect(cards).toHaveCount(2);
  await expect(page.locator("#player-insight-card-segnali-title")).toHaveText("SEGNALI DELLA SCHEDA");
  await expect(page.locator("#player-insight-card-note-title")).toHaveText("NOTE DELLA SCHEDA");
  const insightStyles = await titleStyles("#player-insight-cards .scheda-card__title");
  expect(insightStyles).toHaveLength(2);
  expect(
    new Set([...chiamataStyles, ...insightStyles]).size,
    `i due posti sono divergiti: chiamata ${chiamataStyles[0]}, insight ${insightStyles[0]}`,
  ).toBe(1);

  // 3. I RIQUADRI ETICHETTATI DAL PROPRIO TITOLO, non solo in grassetto: chi
  //    naviga a voce sente il nome del riquadro in cui si trova.
  for (const id of ["player-insight-card-segnali", "player-insight-card-note"]) {
    const labelled = await page.evaluate((cardId) => {
      const el = document.getElementById(cardId)!;
      const by = el.getAttribute("aria-labelledby") ?? "";
      return { by, text: document.getElementById(by)?.textContent ?? null };
    }, id);
    expect(labelled.by, `${id}: aria-labelledby`).toBe(`${id}-title`);
    expect(labelled.text, `${id}: il titolo puntato esiste`).not.toBeNull();
  }

  // 4. AFFIANCATI DOVE C'È LARGHEZZA, IMPILATI DOVE NON CE N'È. Due riquadri
  //    densi affiancati a 390px smettono di essere leggibili molto prima di
  //    smettere di entrarci: la soglia è la stessa del resto della schermata.
  for (const [width, height, affiancati] of [
    [1280, 900, true],
    [390, 844, false],
  ] as const) {
    await page.setViewportSize({ width, height });
    const [segnali, note] = await Promise.all([
      page.locator("#player-insight-card-segnali").boundingBox(),
      page.locator("#player-insight-card-note").boundingBox(),
    ]);
    expect(segnali, `${width}px: riquadro segnali`).not.toBeNull();
    expect(note, `${width}px: riquadro note`).not.toBeNull();
    if (affiancati) {
      expect(note!.x, `${width}px: i due riquadri devono stare affiancati`).toBeGreaterThan(
        segnali!.x + segnali!.width - 1,
      );
    } else {
      expect(Math.round(note!.x), `${width}px: i due riquadri devono impilarsi`).toBe(
        Math.round(segnali!.x),
      );
      expect(note!.y, `${width}px: le note stanno sotto i segnali`).toBeGreaterThan(segnali!.y);
    }
    // E la pagina non scorre mai di lato, a nessuna delle due larghezze.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `${width}px: scorrimento laterale`,
    ).toBe(true);
  }

  expect(externalRequests).toEqual([]);
});

test("la scheda piena: la scala si legge prima del testo, e il testo resta", async ({ page, context }) => {
  const externalRequests = await boot(page, context, {
    kind: "serve",
    body: schedeDeposit([FULL_SCHEDA]),
  });
  await callTarget(page);

  // LO STRATO VISIVO. Solo il valore dichiarato: le altre due opzioni non
  // compaiono più (decisione di Pico — una casella è una risposta, tre di cui
  // due spente sono un quiz).
  await expect(page.locator("#player-insight-track-ballottaggio")).toHaveText("ballottaggio");
  await expect(page.locator("#player-insight-track-riserva")).toHaveCount(0);
  await expect(page.locator("#player-insight-track-titolare")).toHaveCount(0);
  await expect(page.locator(".expert-titolarita__value")).toHaveCount(1);
  // Il valore si distingue anche SENZA colore: maiuscolo e grassetto.
  const onStyle = await page.locator("#player-insight-track-ballottaggio").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { transform: cs.textTransform, weight: Number(cs.fontWeight) };
  });
  expect(onStyle.transform).toBe("uppercase");
  expect(onStyle.weight).toBeGreaterThanOrEqual(700);

  // La quota porta la cifra accanto alla barra: nessuna stima a occhio.
  await expect(page.locator("#player-insight-share")).toContainText("60% secondo la scheda");
  const fill = await page.locator(".expert-share__fill").evaluate((el) => el.getBoundingClientRect().width);
  const track = await page.locator(".expert-share__track").evaluate((el) => el.getBoundingClientRect().width);
  expect(fill / track).toBeGreaterThan(0.5);
  expect(fill / track).toBeLessThan(0.7);

  // Le pastiglie, ciascuna con la sua parola.
  await expect(page.locator("#player-insight-chip-gerarchia")).toContainText("2ª scelta");
  await expect(page.locator("#player-insight-chip-rigori")).toContainText("designato");
  await expect(page.locator("#player-insight-chip-punizioni")).toContainText("punizioni");
  await expect(page.locator("#player-insight-chip-mercato")).toContainText("mercato");
  // L'avviso non è distinto dal solo colore: porta un marcatore testuale.
  await expect(page.locator("#player-insight-chip-mercato .expert-chip__mark")).toHaveText("!");

  // LO STRATO DI PROSA. È la seconda metà del contenuto, non una didascalia:
  // arriva intera e ha un corpo leggibile, non da nota a piè di pagina.
  await expect(page.locator("#player-insight-prose")).toContainText(FULL_SCHEDA.nota as string);
  const prose = await page.locator("#player-insight-prose").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { size: parseFloat(cs.fontSize), height: el.getBoundingClientRect().height };
  });
  expect(prose.size).toBeGreaterThanOrEqual(12);
  expect(prose.height).toBeGreaterThan(20);
  await expect(page.locator("#player-insight-meta")).toContainText("preparata prima dell'asta");
  await expect(page.locator("#player-insight-meta")).toContainText("scheda ufficiale della squadra");
  await expect(page.locator("#player-insight-meta")).toContainText("30/08/2026");

  expect(externalRequests).toEqual([]);
});

test("una scheda di sola prosa è legittima: nessun segnale, il testo per intero", async ({ page, context }) => {
  await boot(page, context, { kind: "serve", body: schedeDeposit([PROSE_ONLY_SCHEDA]) });
  await callTarget(page);
  await expect(page.locator("#player-insight-quality")).toHaveCount(0);
  await expect(page.locator("#player-insight-prose")).toContainText(PROSE_ONLY_SCHEDA.nota as string);
  // Nessun valore acceso e nessuna pastiglia inventata per riempire il vuoto.
  await expect(page.locator(".expert-titolarita__value")).toHaveCount(0);
  await expect(page.locator("#player-insight-track-missing")).toBeVisible();
  await expect(page.locator("#player-insight-chips")).toHaveCount(0);
  await expect(page.locator("#player-insight-meta")).toContainText("fonte non dichiarata");
  await expectHonestyVisible(page, EXPERT_INSIGHT_QUALITY_LABELS.available);
});

test("il riquadro pieno regge AA e non fa traboccare la schermata a 390, 1280, 1440 e 1920", async ({
  page,
  context,
}) => {
  await boot(page, context, { kind: "serve", body: schedeDeposit([FULL_SCHEDA]) });
  const tokens = await resolveTokenColors(page, ["--text-dim", "--text-sec", "--text-mid", "--text-primary"]);
  const byColor = new Map(Object.entries(tokens).map(([token, hex]) => [hex, token]));

  for (const width of [390, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator("#search-player")).toBeVisible();
    await callTarget(page);
    await expect(page.locator("#player-insight-prose")).toBeVisible();

    // LA PAROLA DELLA TITOLARITÀ NON SI TRONCA MAI. Prima era una cella di una
    // griglia a tre colonne e a schermo stretto diventava «BALLOTT…»: su un
    // pannello che deve leggersi in due secondi è un difetto, non un dettaglio.
    // Adesso la pastiglia è dimensionata sul proprio contenuto, e questa è la
    // misura che lo prova — il testo reso sta dentro la sua scatola.
    const value = page.locator("#player-insight-track-ballottaggio");
    await expect(value).toHaveText("ballottaggio");
    const fit = await value.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
      text: (el.textContent ?? "").trim(),
    }));
    expect(fit.text, `parola troncata a ${width}px`).toBe("ballottaggio");
    expect(
      fit.scroll,
      `parola tagliata dentro la pastiglia a ${width}px (scroll ${fit.scroll} > client ${fit.client})`,
    ).toBeLessThanOrEqual(fit.client + 1);

    // Nessuno scorrimento laterale, a nessuna delle quattro larghezze.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `scorrimento laterale a ${width}px`,
    ).toBe(true);

    // Ogni testo del riquadro che porta un livello della rampa sta sopra AA.
    const swept = await measureAllText(page, "#player-insight-panel, #player-insight-panel *");
    // Un testo NON CLASSIFICABILE è un fallimento, non un salto (la regola
    // fail-closed di e2e/helpers.ts). Senza questa riga un elemento reso non
    // misurabile — `filter`, `mix-blend-mode` — uscirebbe da sé dal filtro sul
    // colore qui sotto, e il riquadro resterebbe verde senza essere stato letto.
    expect(
      swept.flatMap((m) => (m.kind === "unclassified" ? [`${width}px: ${m.reason} — ${m.label}`] : [])),
      `testo non classificabile nel riquadro a ${width}px`,
    ).toEqual([]);
    const measured = swept.flatMap((m) => (m.kind === "measured" ? [m] : []));
    // `m.exempt !== null` è il vecchio `m.disabled`: la stessa e sola esenzione
    // dalla soglia, quella che WCAG 1.4.3 concede agli «inactive user interface
    // components», adesso col proprio motivo scritto accanto invece che un
    // booleano muto (THRESHOLD_EXEMPT in e2e/helpers.ts).
    const ramp = measured.filter((m) => byColor.has(m.fg) && m.exempt === null);
    expect(ramp.length, `nessun testo misurato nel riquadro a ${width}px`).toBeGreaterThan(4);
    const failures = ramp
      .filter((m) => m.ratio < AA_NORMAL_TEXT)
      .map((m) => `${width}px: ${byColor.get(m.fg)} = ${m.ratio.toFixed(2)}:1 (${m.fontSize}px) — ${m.label}`);
    expect(failures, `contrasto sotto ${AA_NORMAL_TEXT}:1 nel riquadro a ${width}px`).toEqual([]);

    // Il gradino acceso e il marcatore d'avviso NON portano un token della
    // rampa (fondo accent l'uno, rosso STOP l'altro): la spazzata qui sopra li
    // salta per costruzione, quindi vanno misurati per identità — stessa
    // ragione per cui le pastiglie di ruolo hanno la loro guardia dedicata in
    // e2e/text-contrast-aa.spec.ts.
    for (const selector of ["#player-insight-track-ballottaggio", "#player-insight-chip-mercato .expert-chip__mark"]) {
      const ratio = await textContrast(page, selector);
      expect(ratio, `${selector} sotto AA a ${width}px`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  }
});

// ── L'AGGANCIO DEL NOME, SUL DOM VIVO ────────────────────────────────────────
//
// PERCHÉ QUESTA SPEC ESISTE. Le fonti del Gruppo Esperti scrivono «Dario
// Placeholder»; il listone della lega, sulla stessa riga, scrive «Placeholder».
// Prima dell'aggancio le due chiavi non si incontravano e il riquadro
// dichiarava «la scheda non è ancora stata scritta» su una scheda che ESISTE:
// un difetto invisibile, che avrebbe potuto mangiare una parte delle ~200
// schede compilate a mano prima del 3 settembre senza lasciare traccia a
// schermo. Qui la stessa asimmetria passa dal canale vero — `/api/schede`,
// content-type, validazione, indicizzazione — e non da una porta di servizio.
//
// LE TRE COSE CHE DIFENDE:
//  1. una scheda scritta con un nome diverso ma compatibile ARRIVA a schermo, e
//     l'aggancio dedotto è DICHIARATO (un aggancio taciuto sarebbe lo stesso
//     difetto a specchio: la scheda di un altro, senza modo di accorgersene);
//  2. con più schede possibili l'app NON sceglie: chiede, e nessuna opzione
//     parte selezionata;
//  3. la risposta di Pico aggancia la scheda giusta, resta cambiabile, e
//     sopravvive al reload — altrimenti la stessa domanda tornerebbe a ogni
//     chiamata e rispondere non varrebbe il tempo speso.

/** Il listone della lega scrive il cognome nudo: è la riga che cerca le schede. */
const SHORT_NAME_POOL = [
  { name: SHORT_NAME, role: "A", club: SCHEDA_CLUB, quotation: 20 },
  { name: OTHER_PLAYER, role: "P", club: OTHER_CLUB, quotation: 5 },
] as const;

async function bootShortName(page: Page, context: BrowserContext, body: string): Promise<string[]> {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SHORT_NAME_POOL, externalRequests);
  await routeSchede(context, { kind: "serve", body });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
  return externalRequests;
}

/** Apre il momento LIVE sulla riga scritta col cognome nudo. */
async function callShortName(page: Page): Promise<void> {
  await page.getByText(SHORT_NAME, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await expect(page.locator("#player-insight-panel")).toBeVisible();
}

test("una scheda scritta col nome intero arriva sulla riga scritta col cognome, e lo dichiara", async ({
  page,
  context,
}) => {
  const externalRequests = await bootShortName(page, context, schedeDeposit([FULL_NAME_SCHEDA]));
  await callShortName(page);

  // La scheda c'è: prima non ci sarebbe stata, e il riquadro avrebbe detto che
  // non era stata scritta.
  await expect(page.locator("#player-insight-prose")).toContainText("come la scrivono le fonti");
  await expect(page.locator("#player-insight-track-titolare")).toBeVisible();
  await expect(page.locator("#player-insight-empty")).toHaveCount(0);

  // L'aggancio è dedotto, quindi è scritto: su quale nome la scheda è scritta.
  await expect(page.locator("#player-insight-match")).toContainText(SCHEDA_PLAYER);
  // Nessuna domanda da fare: un candidato solo.
  await expect(page.locator("#player-insight-choice")).toHaveCount(0);
  await expectHonestyVisible(page, EXPERT_INSIGHT_QUALITY_LABELS.available);
  expect(externalRequests).toEqual([]);
});

test("due schede possibili: l'app chiede, non sceglie — e la risposta resta dopo il reload", async ({
  page,
  context,
}) => {
  const externalRequests = await bootShortName(
    page,
    context,
    schedeDeposit([FULL_NAME_SCHEDA, SECOND_FULL_NAME_SCHEDA]),
  );
  await callShortName(page);

  // 1. LA DOMANDA. Nessun contenuto delle due schede trapela: metà scheda
  // mostrata mentre si dichiara di non sapere si legge come «pieno».
  await expect(page.locator("#player-insight-quality")).toHaveText(
    EXPERT_INSIGHT_QUALITY_LABELS.identity_not_resolved,
  );
  await expect(page.locator("#player-insight-empty")).toContainText(
    EXPERT_INSIGHT_CHOICE_PENDING_TEXT,
  );
  await expectNoContent(page);

  const select = page.locator("#player-insight-choice-select");
  await expect(select).toBeVisible();
  // NESSUNA OPZIONE PRESELEZIONATA: un `<select>` che parte su un valore è una
  // risposta data dall'app con l'aria di una domanda.
  await expect(select).toHaveValue("");
  const options = await select.locator("option:not([disabled])").allTextContents();
  expect(options).toEqual([
    `${SCHEDA_PLAYER} — ${SCHEDA_CLUB}`,
    `${SECOND_FULL_NAME} — ${SCHEDA_CLUB}`,
  ]);

  // 2. LA RISPOSTA. Aggancia quella scheda, e solo quella.
  await select.selectOption({ label: `${SECOND_FULL_NAME} — ${SCHEDA_CLUB}` });
  await expect(page.locator("#player-insight-prose")).toContainText("Seconda scheda");
  await expect(page.locator("#player-insight-panel")).not.toContainText("come la scrivono le fonti");
  await expect(page.locator("#player-insight-track-riserva")).toBeVisible();
  // La tendina non sparisce: la scelta è cambiabile, e lo dice.
  await expect(page.locator("#player-insight-choice-note")).toContainText(SCHEDA_CHOICE_LINKED_NOTE);
  await expect(page.locator("#player-insight-choice-warn")).toHaveCount(0);

  // 3. IL RELOAD. Senza persistenza la stessa domanda tornerebbe a ogni
  // chiamata, e rispondere non varrebbe il tempo speso.
  await page.reload();
  await expect(page.locator("#search-player")).toBeVisible();
  await callShortName(page);
  await expect(page.locator("#player-insight-prose")).toContainText("Seconda scheda");
  await expect(page.locator("#player-insight-choice-select")).toHaveValue(
    /placeholder/,
  );

  // 4. CAMBIARE IDEA. «Nessuna di queste» riporta alla domanda, non a un'altra
  // scheda scelta dall'app.
  await page
    .locator("#player-insight-choice-select")
    .selectOption({ label: SCHEDA_CHOICE_CLEAR_LABEL });
  await expect(page.locator("#player-insight-empty")).toContainText(
    EXPERT_INSIGHT_CHOICE_PENDING_TEXT,
  );
  await expect(page.locator("#player-insight-choice-select")).toHaveValue("");
  await expectNoContent(page);

  expect(externalRequests).toEqual([]);
});

test("le superfici dell'aggancio reggono AA e stanno nel pannello a 390, 1280, 1440 e 1920", async ({
  page,
  context,
}) => {
  // Le due superfici dell'aggancio non compaiono nel flusso della spec AA qui
  // sopra — esistono solo dove i nomi divergono — quindi senza questa prova
  // resterebbero l'unica parte del riquadro mai rimisurata a schermo vero.
  //
  // LA PROVA È IN DUE PEZZI, e il secondo è quello che morde davvero. La
  // spazzata di `measureAllText` misura SOLO il testo che porta un colore
  // della rampa: un elemento dipinto con un colore fuori rampa non è
  // «bocciato», è SALTATO, e la spazzata resterebbe verde ignorandolo. Perciò
  // qui si verifica prima che ciascuna superficie sia effettivamente DENTRO
  // l'insieme misurato, e poi che l'insieme stia sopra AA.
  const uno = schedeDeposit([FULL_NAME_SCHEDA]);
  const due = schedeDeposit([FULL_NAME_SCHEDA, SECOND_FULL_NAME_SCHEDA]);
  await bootShortName(page, context, uno);
  // I token si risolvono DOPO il primo caricamento: su una pagina vuota
  // `:root` non porta ancora il foglio di stile, i colori tornerebbero vuoti e
  // la spazzata resterebbe verde non avendo misurato niente.
  const tokens = await resolveTokenColors(page, [
    "--text-dim",
    "--text-sec",
    "--text-mid",
    "--text-primary",
    "--stop-red",
  ]);
  const byColor = new Map(Object.entries(tokens).map(([token, hex]) => [hex, token]));

  /** Il testo del riquadro che porta un livello della rampa, misurato adesso. */
  async function rampNow(width: number, step: string): Promise<readonly string[]> {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `scorrimento laterale a ${width}px (${step})`,
    ).toBe(true);
    const swept = await measureAllText(page, "#player-insight-panel, #player-insight-panel *");
    // Stessa regola fail-closed del test qui sopra: non classificabile = rosso.
    expect(
      swept.flatMap((m) =>
        m.kind === "unclassified" ? [`${width}px ${step}: ${m.reason} — ${m.label}`] : [],
      ),
      `testo non classificabile a ${width}px (${step})`,
    ).toEqual([]);
    const measured = swept.flatMap((m) => (m.kind === "measured" ? [m] : []));
    // `m.exempt !== null` è il vecchio `m.disabled` — vedi il commento sopra.
    const ramp = measured.filter((m) => byColor.has(m.fg) && m.exempt === null);
    const failures = ramp
      .filter((m) => m.ratio < AA_NORMAL_TEXT)
      .map(
        (m) =>
          `${width}px ${step}: ${byColor.get(m.fg)} = ${m.ratio.toFixed(2)}:1 (${m.fontSize}px) — ${m.label}`,
      );
    expect(failures, `contrasto sotto ${AA_NORMAL_TEXT}:1 a ${width}px (${step})`).toEqual([]);
    return ramp.map((m) => m.label);
  }

  for (const width of [390, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });

    // 1. L'AGGANCIO DEDOTTO: una scheda sola, con un nome diverso ma compatibile.
    await context.unrouteAll();
    await bootShortName(page, context, uno);
    await callShortName(page);
    await expect(page.locator("#player-insight-match")).toBeVisible();
    const dedotta = await rampNow(width, "dedotta");
    expect(
      dedotta.some((label) => label.includes("player-insight-match")),
      `la riga di dichiarazione non è nella spazzata a ${width}px: colore fuori rampa`,
    ).toBe(true);

    // 2. LA DOMANDA, e 3. LA RISPOSTA: la tendina resta a schermo dopo la
    // scelta, quindi va misurata in tutti e due gli stati.
    await context.unrouteAll();
    await bootShortName(page, context, due);
    await callShortName(page);
    const select = page.locator("#player-insight-choice-select");
    await expect(select).toBeVisible();

    for (const step of ["domanda", "risposta"] as const) {
      if (step === "risposta") {
        await select.selectOption({ label: `${SECOND_FULL_NAME} — ${SCHEDA_CLUB}` });
        await expect(page.locator("#player-insight-prose")).toBeVisible();
      }
      // La tendina non deborda dal suo posto: a 390px è la riga più larga del
      // riquadro, ed è l'unica che porta due nomi interi su una riga sola.
      const fit = await page
        .locator("#player-insight-choice")
        .evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(
        fit.scroll,
        `tendina più larga del suo posto a ${width}px (${step})`,
      ).toBeLessThanOrEqual(fit.client + 1);

      const labels = await rampNow(width, step);
      for (const marker of ["expert-choice__label", "player-insight-choice-note"]) {
        expect(
          labels.some((label) => label.includes(marker)),
          `«${marker}» non è nella spazzata a ${width}px (${step}): colore fuori rampa`,
        ).toBe(true);
      }
    }
  }
});

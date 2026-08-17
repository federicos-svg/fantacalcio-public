import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  COMMUNITY_SCHEDA,
  FULL_SCHEDA,
  OTHER_PLAYER_SCHEDA,
  PROSE_ONLY_SCHEDA,
  SCHEDA_PLAYER,
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
import { EXPERT_INSIGHT_EMPTY_TEXT, EXPERT_INSIGHT_LABEL_TEXT } from "../src/ui/expertInsight.js";

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
  await expect(page.locator("#player-insight-meta")).toContainText("trascritta a mano prima dell'asta");
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
    const measured = await measureAllText(page, "#player-insight-panel, #player-insight-panel *");
    const ramp = measured.filter((m) => byColor.has(m.fg) && !m.disabled);
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

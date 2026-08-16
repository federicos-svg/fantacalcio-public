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
import { EXPERT_INSIGHT_EMPTY_TEXT } from "../src/ui/expertInsight.js";

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
//  2. il riquadro DICHIARA A SCHERMO di non essere validato, di non essere un
//     consiglio e di non entrare in nessun calcolo: i tre fatti stanno nel
//     payload come letterali `false`, e un flag vero solo nel JSON non lo legge
//     nessuno. La prova qui sotto diventa rossa se quella dichiarazione sparisce;
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
 * I TRE FATTI DI ONESTÀ, A SCHERMO. Questa è la funzione che deve diventare
 * rossa se il riquadro smette di dire che il segnale non è validato: la
 * pastiglia deve esserci, deve essere VISIBILE, deve portare la parola, e la
 * stessa dichiarazione deve stare nell'aria-label del pannello — cioè anche
 * per chi il riquadro non lo vede.
 */
async function expectHonestyVisible(page: Page): Promise<void> {
  const validated = page.locator("#player-insight-flag-validated");
  await expect(validated).toBeVisible();
  await expect(validated).toHaveText("NON VALIDATO");
  await expect(page.locator("#player-insight-flag-directive")).toHaveText("NON È UN CONSIGLIO");
  await expect(page.locator("#player-insight-flag-index")).toHaveText("FUORI DAL CALCOLO");
  await expect(page.locator("#player-insight-flag-source")).toHaveText("PARERE DI TERZI");
  const spoken = await page.locator("#player-insight-panel").getAttribute("aria-label");
  expect(spoken ?? "").toContain("non validato");
  expect(spoken ?? "").toContain("non è un consiglio");
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
  await expectHonestyVisible(page);

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
  await expectHonestyVisible(page);

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
  await expectHonestyVisible(page);

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
  await expectHonestyVisible(page);

  // 5. available — la scheda piena, entrambi gli strati.
  await context.unrouteAll();
  await boot(page, context, { kind: "serve", body: schedeDeposit([FULL_SCHEDA]) });
  await callTarget(page);
  await expect(page.locator("#player-insight-quality")).toHaveText(
    EXPERT_INSIGHT_QUALITY_LABELS.available,
  );
  await expect(page.locator("#player-insight-empty")).toHaveCount(0);
  await expectHonestyVisible(page);

  expect(externalRequests).toEqual([]);
  expect(requests2).toEqual([]);
});

test("la scheda piena: la scala si legge prima del testo, e il testo resta", async ({ page, context }) => {
  const externalRequests = await boot(page, context, {
    kind: "serve",
    body: schedeDeposit([FULL_SCHEDA]),
  });
  await callTarget(page);

  // LO STRATO VISIVO. Tutti e tre i gradini restano scritti — «titolare» senza
  // «riserva» accanto non direbbe quanto in alto sia — e uno solo è acceso.
  await expect(page.locator("#player-insight-track-riserva")).toHaveText("riserva");
  await expect(page.locator("#player-insight-track-ballottaggio")).toHaveText("ballottaggio");
  await expect(page.locator("#player-insight-track-titolare")).toHaveText("titolare");
  await expect(page.locator(".expert-ladder__step--on")).toHaveCount(1);
  await expect(page.locator("#player-insight-track-ballottaggio")).toHaveAttribute("aria-current", "true");
  // Il gradino acceso si distingue anche SENZA colore: maiuscolo e grassetto.
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
  await expect(page.locator("#player-insight-quality")).toHaveText(EXPERT_INSIGHT_QUALITY_LABELS.available);
  await expect(page.locator("#player-insight-prose")).toContainText(PROSE_ONLY_SCHEDA.nota as string);
  // Nessuna scala accesa e nessuna pastiglia inventata per riempire il vuoto.
  await expect(page.locator(".expert-ladder__step")).toHaveCount(0);
  await expect(page.locator("#player-insight-track-missing")).toBeVisible();
  await expect(page.locator("#player-insight-chips")).toHaveCount(0);
  await expect(page.locator("#player-insight-meta")).toContainText("fonte non dichiarata");
  await expectHonestyVisible(page);
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

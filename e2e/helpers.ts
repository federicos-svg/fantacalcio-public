// Shared E2E helpers — network policy, storage reads, and the
// budget/roster-history/assigned-status assertions used by both the
// self-assign+reload spec and the LIVE-02 recovery specs. Extracted only
// because the duplication across those specs was real, not speculative.
import { type BrowserContext, type Page, expect } from "@playwright/test";
import { LISTONE_PAGE_SIZE } from "../src/ui/listone.js";

export const LISTONE_ASSET_PATH = "/data/listone_2025_26.json";
export const LISTONE_REMOTE_PATH = "/api/listone";

/**
 * How the guard answers GET /api/listone (functions/api/listone.ts), which the
 * Vite preview server this suite runs against cannot serve — it has no Pages
 * Functions runtime.
 *
 * - `unavailable` (the default): a 404 JSON error, i.e. the endpoint not
 *   deployed. Every pre-existing spec relies on this to keep exercising the
 *   static-asset path exactly as before.
 * - `serve`: a synthetic deposit payload, optionally with its freshness header.
 * - `passthrough`: let the preview server answer, which it does with the SPA's
 *   own index.html at status 200 — the case the app's content-type check has
 *   to reject rather than treat as data.
 */
export type RemoteListoneRoute =
  | { readonly kind: "unavailable" }
  | { readonly kind: "serve"; readonly rows: unknown; readonly modifiedAt?: string }
  | { readonly kind: "passthrough" };

/**
 * The only network policy every spec in this suite uses: the synthetic
 * listone fixture for the exact asset path, an explicit answer for the
 * private-deposit endpoint, pass-through for same-origin (the app's own build
 * + the intercepted asset), and a hard abort — recorded, never silently
 * allowed — for anything else. Every spec asserts `externalRequests` is empty
 * at the end.
 */
export async function installSyntheticNetworkGuard(
  context: BrowserContext,
  syntheticListonePool: unknown,
  externalRequests: string[],
  remote: RemoteListoneRoute = { kind: "unavailable" },
): Promise<void> {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === LISTONE_ASSET_PATH) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(syntheticListonePool),
      });
    }
    if (url.pathname === LISTONE_REMOTE_PATH && remote.kind !== "passthrough") {
      if (remote.kind === "unavailable") {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "not_found" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: remote.modifiedAt === undefined ? {} : { "x-listone-modified-at": remote.modifiedAt },
        body: JSON.stringify(remote.rows),
      });
    }
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return route.continue();
    }
    externalRequests.push(route.request().url());
    return route.abort("blockedbyclient");
  });
}

/**
 * Switches screen through the real top-bar nav (plain spans with click
 * handlers, not links — hence the text locator scoped to <nav>). The app
 * status states (SHADOW / NO TARGET / connectivity) live in Impostazioni,
 * not in the Asta view, so any spec asserting them has to go there first.
 */
export async function gotoScreen(
  page: Page,
  label: "Asta" | "Rose" | "Impostazioni",
): Promise<void> {
  await page.locator("nav").getByText(label, { exact: true }).click();
}

/**
 * Picks a Listone status filter from its dropdown. The options only exist
 * while the menu is open, so every spec that filters goes through here.
 */
export async function selectStatusFilter(
  page: Page,
  value: "available" | "assigned" | "all",
): Promise<void> {
  const trigger = page.locator("#listone-status-filter-trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  await page.locator(`#listone-status-filter-option-${value}`).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

/**
 * #333 — Opens "IL TAVOLO" on the chiamata screen: the one gesture behind
 * which SCARSITÀ PER RUOLO, TAVOLO — WAR BOARD and SQUADRE (LEGA) now live.
 *
 * Every spec that reads one of those three panels goes through here. They were
 * not removed and their markup is byte-identical — they are one click away
 * instead of occupying the top half of the screen, so what changed in those
 * specs is the single line that opens them, never what they then assert.
 *
 * Idempotent: `state.tableDetailOpen` survives re-renders (a purchase returns
 * to the chiamata moment with the group still open), so a spec that opens it
 * once can keep asserting through the rest of its flow.
 */
export async function openTableDetail(page: Page): Promise<void> {
  const toggle = page.locator("#table-detail-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#table-detail-body")).toBeVisible();
}

/**
 * Picks an Impostazioni area from the left menu. Only the selected area's
 * body is in the DOM, so this is what makes its content assertable at all.
 */
export async function openSettingsSection(
  page: Page,
  id: "teams" | "riconferme" | "schede" | "status",
): Promise<void> {
  const tab = page.locator(`#settings-tab-${id}`);
  if ((await tab.getAttribute("aria-selected")) === "true") return;
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

/** Asserts the two always-closed gate states, in the area that shows them. */
export async function expectGateStatesVisible(page: Page): Promise<void> {
  await openSettingsSection(page, "status");
  await expect(page.locator("#shadow-status")).toBeVisible();
  await expect(page.locator("#shadow-status")).toContainText("SHADOW");
  await expect(page.locator("#no-target-status")).toContainText("NO TARGET");
}

/** Reads and JSON-parses a localStorage value — only for keys known to
 *  hold JSON (`fac_log`, `fac_log_lkg`). For the quarantine key (which may
 *  hold non-JSON text by design) use readLocalStorageRaw instead. */
export async function readLocalStorageJson<T>(page: Page, key: string): Promise<T | null> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), key);
  return raw === null ? null : (JSON.parse(raw) as T);
}

/** Reads a localStorage value as-is, no parsing — used for the quarantine
 *  key, whose content is deliberately never normalized. */
export async function readLocalStorageRaw(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => window.localStorage.getItem(k), key);
}

/**
 * The same budget/roster-history/assigned-status assertions used right
 * after an assignment and again after a reload/recovery — verified only
 * through the UI, never internal state.
 */
export async function expectAssignedEffectsVisible(
  page: Page,
  playerName: string,
  price: number,
  roleCount: string,
): Promise<void> {
  // Budget/spent/roster all live in the sticky strip now — the separate
  // BUDGET & ROSA panel was folded into it.
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - price} cr`);
  await expect(page.locator("#critical-spent")).toHaveText(`${price} cr`);
  await expect(page.locator("#critical-roster")).toContainText(roleCount);

  const storicoPanel = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(storicoPanel).toContainText(playerName);
  await expect(storicoPanel).toContainText(`${price} cr`);
  await expect(storicoPanel).toContainText("Io");

  await selectStatusFilter(page, "assigned");
  const assignedRow = page.locator(".listone-row", { hasText: playerName });
  await expect(assignedRow).toContainText("Assegnato");
}

/**
 * Asserts the CONTENT, ORDER and EXACTNESS of the listone rows currently
 * rendered on screen: `.listone-row > div:first-child` is always the player
 * name — the first entry of `CORE_COLUMNS` in src/ui/listone.ts (not exported,
 * so this relies on the render order in src/ui/views.ts instead of importing
 * the list directly, same posture as the rest of this suite). `toHaveText` on
 * a multi-element locator fails on any extra row, missing row, or reordering —
 * a strictly stronger check than asserting individual names are present
 * somewhere on the page.
 */
export async function expectListoneRows(page: Page, names: readonly string[]): Promise<void> {
  await expect(page.locator(".listone-row > div:first-child")).toHaveText([...names]);
}

/**
 * Asserts that the WHOLE shipped pool is on screen, unfiltered: the note
 * under the table reads "N giocatori caricati" (src/ui/views.ts — only shown
 * when the displayed pool equals the full loaded pool, i.e. no search/status
 * filter is narrowing it) and the pagination indicator reads
 * "Pagina 1 di ⌈N / LISTONE_PAGE_SIZE⌉". `LISTONE_PAGE_SIZE` is imported from
 * src/ui/listone.ts, never hand-copied, so the expected page count tracks the
 * real constant if it ever changes.
 */
export async function expectListoneWholePoolLoaded(page: Page, total: number): Promise<void> {
  const totalPages = Math.max(1, Math.ceil(total / LISTONE_PAGE_SIZE));
  const listonePanel = page.locator(".panel--bordered", { hasText: "LISTONE SVINCOLATI" });
  await expect(listonePanel).toContainText(`${total} giocatori caricati.`);
  await expect(listonePanel).toContainText(`Pagina 1 di ${totalPages}`);
}

/**
 * Selects a listone row by player name through the REAL search flow instead
 * of clicking on text that happens to be visible: fills `#search-player`,
 * which filters the table live and resets it to page 1 (see the `input`
 * listener in src/main.ts), waits for the filter to narrow the table to
 * exactly one row, then clicks it.
 *
 * Required on a real (paginated) listone: `getByText(name).click()` only
 * works when the target row already happens to be on the currently-rendered
 * page, which a large real listone does not guarantee — the whole reason this
 * helper exists (see e2e/shipped-listone.ts).
 */
export async function selectListoneRowByName(page: Page, name: string): Promise<void> {
  await page.locator("#search-player").fill(name);
  const rows = page.locator(".listone-row");
  await expect(rows).toHaveCount(1);
  await rows.first().click();
}

/* ────────────────────────────────────────────────────────────────────────────
   CONTRASTO DEL TESTO, MISURATO SUL DOM VIVO
   ────────────────────────────────────────────────────────────────────────────
   Stava dentro e2e/live-facts.spec.ts, che l'aveva introdotto per i pannelli
   degli avversari. È qui perché ora lo usa anche e2e/text-contrast-aa.spec.ts,
   che estende la stessa misura a tutta l'app: una funzione sola, non due copie
   che possono divergere proprio sul calcolo che deve fare da guardia.

   Colore e sfondo si leggono da getComputedStyle e si convertono via canvas
   (che sa risolvere `oklch()` come lo risolve il browser), poi si compone
   l'eventuale `opacity` degli antenati contro lo sfondo che sta sotto il
   gruppo di composizione, esattamente come fa il compositore.

   Serve perché la regressione che questo test blocca era invisibile al codice:
   `--text-dim` di per sé è un token accettato altrove, ma dentro una riga con
   `opacity: 0.78` diventava 1,99:1 — sotto qualunque soglia leggibile. Un test
   sul solo nome del token non l'avrebbe mai vista.

   La soglia è 4,5:1: WCAG AA per il testo normale. Il testo attenuato di
   questa app è quasi tutto sotto i 14px, quindi l'eccezione "large text"
   (3:1) non si applica da nessuna parte in cui la usiamo. */
export const AA_NORMAL_TEXT = 4.5;

/** Il calcolo, iniettato nella pagina una volta sola e riusato dalle due
 *  funzioni pubbliche qui sotto. */
const CONTRAST_IN_PAGE = `(el) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const parse = (color) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const mix = (src, dst, alpha) => [0,1,2,3].map((i) => alpha * src[i] + (1 - alpha) * dst[i]);
  const luminance = (c) => {
    const [r, g, b] = [c[0], c[1], c[2]].map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const chain = [];
  for (let node = el; node !== null; node = node.parentElement) chain.push(node);
  const alphas = chain.map((node) => Number(getComputedStyle(node).opacity));
  const cumulative = alphas.reduce((acc, a) => acc * a, 1);
  let groupTop = -1;
  alphas.forEach((a, i) => { if (a < 1) groupTop = i; });
  const bgAt = (from) => {
    for (let i = from; i < chain.length; i++) {
      const bg = parse(getComputedStyle(chain[i]).backgroundColor);
      if (bg[3] > 0) return bg;
    }
    return [255, 255, 255, 1];
  };
  const backdrop = bgAt(groupTop + 1);
  const own = bgAt(0);
  const fg = mix(parse(getComputedStyle(el).color), backdrop, cumulative);
  const bg = mix(own, backdrop, cumulative);
  const hex = (c) => "#" + [0,1,2].map((i) => Math.round(c[i]).toString(16).padStart(2, "0")).join("");
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return { ratio: (hi + 0.05) / (lo + 0.05), fg: hex(fg), bg: hex(bg), opacity: cumulative };
}`;

/** Contrasto REALE del testo di un elemento, misurato sul DOM vivo. */
export async function textContrast(page: Page, selector: string): Promise<number> {
  return page.evaluate(
    ([sel, body]) => {
      const el = document.querySelector(sel as string);
      if (el === null) throw new Error(`contrasto: nessun elemento per ${sel}`);
      // eslint-disable-next-line no-new-func
      return (new Function(`return ${body}`)() as (e: Element) => { ratio: number })(el).ratio;
    },
    [selector, CONTRAST_IN_PAGE] as const,
  );
}

/** Una misura per OGNI elemento che porta testo proprio e visibile. Serve alla
 *  spazzata d'insieme: non un elenco di selettori scelti a mano, ma tutto ciò
 *  che è davvero a schermo in quel momento. */
export type MeasuredText = {
  readonly ratio: number;
  readonly fg: string;
  readonly bg: string;
  readonly opacity: number;
  readonly fontSize: number;
  readonly text: string;
  readonly label: string;
  readonly disabled: boolean;
};
/**
 * `selector` restringe la spazzata a una famiglia di elementi invece che a
 * tutto il documento. Il default `*` è la spazzata d'insieme di sempre; la
 * forma ristretta serve alle pastiglie di ruolo, che non portano un token
 * della rampa e vanno quindi cercate per IDENTITÀ (`.role-chip`) e non per
 * colore — un filtro sul colore smette di corrispondere proprio quando il
 * colore torna sbagliato, ed è il modo esatto in cui questa suite era già
 * riuscita a restare verde sull'app rotta (vedi resolveTokenColors sotto).
 */
export async function measureAllText(page: Page, selector = "*"): Promise<MeasuredText[]> {
  return page.evaluate(([body, sel]) => {
    // eslint-disable-next-line no-new-func
    const measure = new Function(`return ${body}`)() as (
      e: Element,
    ) => { ratio: number; fg: string; bg: string; opacity: number };
    const out: MeasuredText[] = [];
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const ownText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent ?? "").trim())
        .join(" ")
        .trim();
      if (ownText === "") continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const m = measure(el);
      const cls = typeof el.className === "string" ? el.className : "";
      out.push({
        ratio: m.ratio,
        fg: m.fg,
        bg: m.bg,
        opacity: m.opacity,
        fontSize: parseFloat(cs.fontSize),
        text: ownText,
        label: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${
          cls ? "." + cls.split(/\s+/).join(".") : ""
        } «${ownText.slice(0, 34)}»`,
        disabled: el.closest("[disabled]") !== null || el.closest(":disabled") !== null,
      });
    }
    return out;
  }, [CONTRAST_IN_PAGE, selector] as const) as Promise<MeasuredText[]>;
}

/**
 * I colori della rampa del testo COME LI RISOLVE IL BROWSER ADESSO, letti da
 * `:root` e passati per lo stesso canvas che risolve `oklch()`.
 *
 * Letti a runtime e non scritti a mano in una costante: una costante di colori
 * attesi rende la spazzata cieca proprio quando serve. Se qualcuno riporta
 * `--text-dim` al valore vecchio, gli elementi che lo usano cambiano colore e
 * NON corrispondono più a un elenco fisso — la spazzata li salta e resta verde
 * mentre l'app è tornata illeggibile (verificato: succedeva davvero).
 * Risolvendo i token dal documento, la spazzata segue il token ovunque vada e
 * misura sempre gli stessi elementi.
 */
export async function resolveTokenColors(
  page: Page,
  tokens: readonly string[],
): Promise<Record<string, string>> {
  return page.evaluate((names) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const root = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const name of names) {
      const raw = root.getPropertyValue(name).trim();
      if (raw === "") continue;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = raw;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[name] =
        "#" +
        [d[0]!, d[1]!, d[2]!]
          .map((v) => Math.round(v).toString(16).padStart(2, "0"))
          .join("");
    }
    return out;
  }, tokens);
}

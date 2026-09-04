// Shared E2E helpers — network policy, storage reads, and the
// budget/roster-history/assigned-status assertions used by both the
// self-assign+reload spec and the LIVE-02 recovery specs. Extracted only
// because the duplication across those specs was real, not speculative.
import { type BrowserContext, type Page, expect } from "@playwright/test";
import { LISTONE_PAGE_SIZE } from "../src/ui/listone.js";
import { CALL_SCREEN_SPAN_START_SELECTOR } from "../src/ui/callScreenBudget.js";
import type { CallScreenState, CallScreenSweep } from "../src/ui/callScreenBudget.js";

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

/* ────────────────────────────────────────────────────────────────────────────
   IL SERVICE WORKER COME TERZA FONTE — precondizioni, non assunzioni
   ────────────────────────────────────────────────────────────────────────────
   Da quando src/offline/** esiste, ogni spec che gira contro il build di
   preview ha un service worker installato, e con esso una TERZA fonte per il
   listone oltre alla rete e a localStorage: la Cache Storage di questo build.
   `context.route` intercetta anche le fetch che partono dal worker, quindi la
   copia in cache è quella che la spec ha servito — ma solo se la spec aspetta
   che l'install (e il suo `cache.addAll`) sia finito prima di cambiare le
   rotte. Le due funzioni qui sotto sono ciò che rende quel confine esplicito:
   la prima chiude la corsa, la seconda toglie di mezzo la cache quando una
   spec dichiara che "entrambe le fonti sono giù".
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Resolves once the service worker CONTROLS the page — i.e. `install` (and the
 * `cache.addAll` precache inside its `waitUntil`) completed and `activate`
 * claimed this client.
 *
 * Una spec che cambia rotta (`context.unroute` + nuova `context.route`) mentre
 * l'install è ancora in volo lascia una finestra in cui le fetch del worker
 * raggiungono il server vero: il precache finisce per contenere l'ASSET
 * SPEDITO invece della fixture, e da lì in poi la spec prova qualcosa che non
 * ha scelto. Aspettare il controllo è ciò che rende quella finestra
 * inesistente.
 */
export async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) return false;
      await navigator.serviceWorker.ready;
      return navigator.serviceWorker.controller !== null;
    },
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Toglie l'asset dati da OGNI cache che questo build possiede, e prova che è
 * sparito.
 *
 * Serve alle spec che iniettano un guasto sull'asset statico (500, abort) e
 * poi asseriscono su ciò che resta in piedi. Senza questo passo la premessa è
 * falsa: `handleDataAsset` (src/offline/sw.ts) è network-first CON fallback in
 * cache — per specifica, ed è la stessa regola che
 * e2e/service-worker-cache-guards.spec.ts pretende — quindi una risposta 500
 * non arriva all'app: arriva l'ultima copia buona. Il prodotto ha ragione; è
 * la spec che deve dire davvero ciò che assume.
 *
 * Fail-closed in due punti, perché un helper che smette di fare qualcosa senza
 * dirlo trasformerebbe queste spec in verdi che non provano nulla: pretende di
 * trovare almeno una cache di questo build (nessuna cache = nessun worker =
 * la premessa non è stata verificata, non "va tutto bene"), e ricontrolla dopo
 * la cancellazione che nessuna cache risponda più per quel path.
 */
export async function evictDataAssetFromServiceWorkerCache(
  page: Page,
  path: string = LISTONE_ASSET_PATH,
): Promise<void> {
  const outcome = await page.evaluate(async (assetPath) => {
    const ours = (await caches.keys()).filter((name) => name.startsWith("fac-shell-"));
    for (const name of ours) {
      const cache = await caches.open(name);
      // Per-entry, non solo `cache.delete(path)`: le voci del precache sono
      // memorizzate da `new Request(url)` e la pagina le richiede con header
      // diversi, la stessa asimmetria che obbliga `matchInCache` a
      // `ignoreVary` — cancellare per chiave esatta lascerebbe superstiti.
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname === assetPath) await cache.delete(request, { ignoreVary: true });
      }
      await cache.delete(assetPath, { ignoreVary: true });
    }
    const survivors: string[] = [];
    for (const name of ours) {
      const cache = await caches.open(name);
      if (await cache.match(assetPath, { ignoreVary: true })) survivors.push(name);
    }
    return { ours, survivors };
  }, path);
  expect(
    outcome.ours,
    "nessuna cache di questo build: il service worker non è installato, quindi questa spec non ha verificato la premessa che dichiara",
  ).not.toEqual([]);
  expect(outcome.survivors, `l'asset ${path} risponde ancora da queste cache`).toEqual([]);
}

/**
 * Switches screen through the real top-bar nav (plain spans with click
 * handlers, not links — hence the text locator scoped to <nav>). The app
 * status states (SHADOW / NO TARGET / connectivity) live in Impostazioni,
 * not in the Asta view, so any spec asserting them has to go there first.
 */
export async function gotoScreen(
  page: Page,
  label: "Formazione" | "Asta" | "Rose" | "Impostazioni",
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

// `openTableDetail()` NON ESISTE PIÙ, e la sua assenza è la firma del cambio:
// IL TAVOLO è SEMPRE APERTO dal 2026-08-26 (decisione di Pico), quindi non c'è
// più un gesto da compiere prima di leggere SCARSITÀ PER RUOLO o TAVOLO — WAR
// BOARD. Le spec che li leggono non aprono niente: li leggono. Che il gruppo
// sia davvero aperto senza gesti — e che nessun controllo possa richiuderlo —
// è provato in un posto solo, e2e/call-screen-order.spec.ts, invece di essere
// riasserito quindici volte.

/**
 * Picks an Impostazioni area from the left menu. Only the selected area's
 * body is in the DOM, so this is what makes its content assertable at all.
 */
export async function openSettingsSection(
  page: Page,
  id: "teams" | "schede" | "archivio" | "status",
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
   CONTRASTO DEL TESTO, MISURATO SUL DOM VIVO — E FAIL-CLOSED
   ────────────────────────────────────────────────────────────────────────────
   Stava dentro e2e/live-facts.spec.ts, che l'aveva introdotto per i pannelli
   degli avversari. È qui perché ora lo usa anche e2e/text-contrast-aa.spec.ts,
   che estende la stessa misura a tutta l'app: una funzione sola, non due copie
   che possono divergere proprio sul calcolo che deve fare da guardia.

   LA REGOLA, IN UNA FRASE: un testo che la spazzata non riesce a classificare
   è un FALLIMENTO, non un elemento da saltare.

   Perché la regola è questa e non «misura ciò che riconosci». La versione
   precedente decideva cosa misurare confrontando il colore COMPOSITO del testo
   con i quattro token della rampa: se corrispondeva lo misurava, altrimenti lo
   lasciava fuori dall'insieme. Due modi banali di rendere illeggibile un testo
   erano quindi anche due modi di farlo sparire dalla prova che doveva
   impedirlo — verificati entrambi sul campo, non dedotti:

     1. dipingere il testo con un colore FUORI dalla rampa: nessuna
        corrispondenza, elemento escluso, spec verde;
     2. mettere un `opacity` su un pannello: il colore composito dei figli
        cambia, smette di corrispondere al token, e gli elementi escono
        dall'insieme misurato invece di fallire;
     3. scrivere il testo con `::before` / `::after { content: … }`: la
        spazzata guardava solo i nodi di testo, quindi quel testo non era
        escluso — non veniva proprio VISTO. Terza strada, stessa fuga,
        verificata rompendo come le altre due.

   Una guardia che si disattiva da sola quando il difetto compare è peggio di
   nessuna guardia: produce un verde che qualcuno userà per dire che
   l'accessibilità è coperta. Da qui in poi il filtro per token è
   DESCRITTIVO (serve a dire QUALE token è sotto soglia in un messaggio
   d'errore), mai un cancello: la misura è il colore realmente reso e la
   classificazione ha tre esiti, di cui due rossi.

   COME SI COMPONE IL COLORE REALMENTE RESO. Colore e sfondi si leggono da
   getComputedStyle e si convertono via canvas (che sa risolvere `oklch()` e
   `color-mix()` come li risolve il browser), poi:
     - la pila degli sfondi si compone CON LA SUA ALFA, dal più esterno opaco
       verso l'elemento: uno sfondo semitrasparente non vale più come opaco;
     - l'`opacity` cumulativa degli antenati si applica al gruppo di
       composizione contro lo sfondo che sta sotto il gruppo, esattamente come
       fa il compositore;
     - l'alfa del colore del testo si compone anch'essa;
     - uno PSEUDO-ELEMENTO è semplicemente uno strato in più in cima alla
       catena, col proprio colore, la propria alfa e il proprio sfondo: non ha
       bisogno di regole sue.

   Serve perché la regressione che questo test blocca era invisibile al codice:
   `--text-dim` di per sé è un token accettato altrove, ma dentro una riga con
   `opacity: 0.78` diventava 1,99:1 — sotto qualunque soglia leggibile. Un test
   sul solo nome del token non l'avrebbe mai vista.

   LIMITI DICHIARATI, DUE. Scritti qui perché siano governabili, non perché
   siano trascurabili per definizione.

   1. `backdrop-filter` sfoca ciò che traspare da uno sfondo non completamente
      opaco. Qui il fondo che traspare si compone NON sfocato: l'errore vale
      solo per la frazione di trasparenza dello sfondo che lo copre (per
      .critical-auction-strip: 6%), e uno sfocamento conserva la media locale
      del colore, quindi il termine d'errore è una frazione del 6% di una
      differenza di luminanza. Dove lo sfondo è opaco la misura è esatta e il
      `backdrop-filter` è irrilevante.

   2. Lo sfondo si cerca risalendo gli ANTENATI. Un testo posizionato sopra un
      elemento che non è un suo antenato (un overlay assoluto steso su un
      fratello) verrebbe misurato contro lo sfondo del proprio antenato, non
      contro ciò che gli sta davvero dietro. Non è un buco aperto in questa
      app — nessun testo qui si sovrappone a un fratello con sfondo diverso —
      ma la misura NON lo coprirebbe, e chiuderlo vuol dire hit-testing, non
      aritmetica sugli stili. Se un giorno servisse un overlay del genere, va
      chiuso prima, non dopo.

   La soglia è 4,5:1: WCAG AA per il testo normale. Il testo attenuato di
   questa app è quasi tutto sotto i 14px, quindi l'eccezione "large text"
   (3:1) non si applica da nessuna parte in cui la usiamo. */
export const AA_NORMAL_TEXT = 4.5;

/**
 * LE UNICHE ESCLUSIONI DAL PERIMETRO — dichiarate, non silenziose.
 *
 * Un'eccezione dichiarata è governabile: si legge, si discute, si toglie. Un
 * salto silenzioso no. Ogni voce porta scritto accanto PERCHÉ esiste, e la
 * lista è deliberatamente corta: tutto ciò che non è qui dentro o si misura o
 * fa fallire la spazzata.
 *
 * Non è qui il posto dei testi «difficili da misurare»: è il posto dei testi
 * che il browser non dipinge come testo della pagina.
 */
export const UNMEASURABLE_TEXT: readonly { readonly selector: string; readonly why: string }[] = [
  {
    selector: "head, head *",
    why:
      "contenuto di <head> (<title>, <script>, <style>): non è testo reso, il browser non lo " +
      "dipinge in nessuna condizione",
  },
  {
    selector: "option, optgroup",
    why:
      "testo del widget nativo di <select>: lo dipinge il browser con i propri colori, non " +
      "genera box nel documento e il CSS della pagina non lo governa",
  },
];

/**
 * L'UNICA ESENZIONE DALLA SOGLIA — misurata e riportata lo stesso, solo non
 * tenuta a 4,5:1.
 *
 * Diversa dalle esclusioni qui sopra: questi elementi SI misurano, il loro
 * rapporto si legge nel report, semplicemente non fanno fallire la spec.
 *
 * Ristretta a `:disabled`, che in CSS corrisponde ai soli controlli di form
 * davvero disattivati. La versione precedente accettava anche `[disabled]`,
 * cioè QUALUNQUE elemento con quell'attributo: un `<div disabled>` — dove
 * l'attributo non significa nulla — bastava a sottrarre alla soglia tutto il
 * suo sottoalbero. Nell'app di oggi la differenza fra i due selettori è zero
 * elementi (verificato), quindi restringere non toglie copertura: chiude un
 * buco.
 */
export const THRESHOLD_EXEMPT: readonly { readonly selector: string; readonly why: string }[] = [
  {
    selector: ":disabled, :disabled *",
    why:
      "controllo disattivato: WCAG 1.4.3 esenta esplicitamente gli «inactive user interface " +
      "components», e l'attenuazione È il segnale che il comando non è premibile",
  },
];

/** Il calcolo, iniettato nella pagina una volta sola e riusato dalle due
 *  funzioni pubbliche qui sotto. Restituisce un ESITO, non un numero: o la
 *  misura, o il motivo per cui non è stato possibile misurare. */
const CONTRAST_IN_PAGE = `(el, pseudo) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const parse = (color) => {
    if (!CSS.supports("color", color)) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  /* source-over, la stessa del compositore: nessuna scorciatoia che tratti
     un'alfa < 1 come opaca. */
  const over = (src, dst) => {
    const a = src[3] + dst[3] * (1 - src[3]);
    if (a === 0) return [0, 0, 0, 0];
    const c = [0, 1, 2].map((i) => (src[i] * src[3] + dst[i] * dst[3] * (1 - src[3])) / a);
    return [c[0], c[1], c[2], a];
  };
  const fade = (c, k) => [c[0], c[1], c[2], c[3] * k];
  const luminance = (c) => {
    const [r, g, b] = [c[0], c[1], c[2]].map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const tag = (n) => n.tagName.toLowerCase() + (n.id ? "#" + n.id : "");
  const no = (reason) => ({ ok: false, reason: reason });

  /* LA CATENA DI COMPOSIZIONE, dal più interno alla radice.
     Con \`pseudo\` il primo strato è lo PSEUDO-ELEMENTO: dipinge SOPRA lo
     sfondo dell'elemento che lo genera e porta un proprio colore, una propria
     alfa e un proprio sfondo, quindi entra nella catena come uno strato in
     più — non come un caso a parte, così tutto ciò che c'è sotto (opacity,
     filter, pila degli sfondi) vale per lui identico. */
  const chain = [];
  for (let node = el; node !== null; node = node.parentElement) chain.push(node);
  const styles = chain.map((n) => getComputedStyle(n));
  const labels = chain.map(tag);
  if (pseudo) {
    styles.unshift(getComputedStyle(el, pseudo));
    labels.unshift(tag(el) + pseudo);
  }

  /* Trasformazioni che riscrivono il colore reso in modi che questa misura
     non sa rifare. Non si approssimano: si dichiarano non classificabili.
     \`filter: opacity(.4)\` e \`filter: brightness(.3)\` sono esattamente lo
     stesso attacco dell'\`opacity\`, per una strada che l'aritmetica qui sotto
     non vede: senza questo controllo tornerebbero a passare in silenzio. */
  for (let i = 0; i < styles.length; i++) {
    if (styles[i].filter !== "none")
      return no("colore reso non ricostruibile: filter «" + styles[i].filter + "» su " + labels[i]);
    if (styles[i].mixBlendMode !== "normal")
      return no("colore reso non ricostruibile: mix-blend-mode «" + styles[i].mixBlendMode + "» su " + labels[i]);
  }

  const alphas = styles.map((s) => Number(s.opacity));
  if (alphas.some((a) => !Number.isFinite(a))) return no("opacity non numerica nella catena degli antenati");
  const cumulative = alphas.reduce((acc, a) => acc * a, 1);
  if (cumulative === 0) return no("testo reso invisibile: opacity 0 nella catena degli antenati");
  let groupTop = -1;
  alphas.forEach((a, i) => { if (a < 1) groupTop = i; });

  /* Pila degli sfondi da \`from\` verso la radice, composta con la sua alfa e
     fermata al primo strato davvero opaco. */
  const stack = (from, to) => {
    const layers = [];
    for (let i = from; i <= to; i++) {
      if (styles[i].backgroundImage !== "none")
        return { error: "sfondo non risolvibile: background-image su " + labels[i] };
      const c = parse(styles[i].backgroundColor);
      if (c === null)
        return { error: "sfondo non risolvibile: «" + styles[i].backgroundColor + "» su " + labels[i] };
      layers.push(c);
      if (c[3] === 1) break;
    }
    let acc = [0, 0, 0, 0];
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return { color: acc };
  };

  const backdrop = stack(groupTop + 1, styles.length - 1);
  if (backdrop.error !== undefined) return no(backdrop.error);
  if (backdrop.color[3] < 1)
    return no("nessuno sfondo opaco fino alla radice: il colore reso dietro il testo non è determinabile");
  const group = groupTop < 0 ? { color: [0, 0, 0, 0] } : stack(0, groupTop);
  if (group.error !== undefined) return no(group.error);

  /* -webkit-text-fill-color, non \`color\`: quando c'è è LUI il colore con cui
     il testo viene dipinto, e vale \`currentcolor\` (quindi \`color\`) quando
     nessuno lo tocca. Leggerlo chiude a costo zero la scappatoia di
     ridipingere il testo lasciando \`color\` al valore giusto. */
  const painted = styles[0].webkitTextFillColor || styles[0].color;
  const ink = parse(painted);
  if (ink === null) return no("colore del testo non risolvibile: «" + painted + "»");
  if (ink[3] === 0) return no("testo reso invisibile: colore del testo completamente trasparente");

  const bg = over(fade(group.color, cumulative), backdrop.color);
  const fg = over(fade(over(ink, group.color), cumulative), backdrop.color);
  const hex = (c) => "#" + [0,1,2].map((i) => Math.round(c[i]).toString(16).padStart(2, "0")).join("");
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return { ok: true, ratio: (hi + 0.05) / (lo + 0.05), fg: hex(fg), bg: hex(bg), opacity: cumulative };
}`;

/**
 * Contrasto REALE del testo di un elemento, misurato sul DOM vivo.
 *
 * Fallisce — non restituisce un numero comodo — quando l'elemento non c'è o
 * quando il colore reso non è ricostruibile: chi chiede il contrasto di un
 * selettore preciso sta asserendo che quel testo si legge, e «non ho potuto
 * misurarlo» non è una risposta che possa passare per un successo.
 */
export async function textContrast(page: Page, selector: string): Promise<number> {
  return page.evaluate(
    ([sel, body]) => {
      const el = document.querySelector(sel as string);
      if (el === null) throw new Error(`contrasto: nessun elemento per ${sel}`);
      // eslint-disable-next-line no-new-func
      const measure = new Function(`return ${body}`)() as (
        e: Element,
        pseudo: string | null,
      ) => { ok: true; ratio: number } | { ok: false; reason: string };
      const out = measure(el, null);
      if (!out.ok) throw new Error(`contrasto: ${sel} non classificabile — ${out.reason}`);
      return out.ratio;
    },
    [selector, CONTRAST_IN_PAGE] as const,
  );
}

/**
 * Una voce per OGNI elemento che porta testo proprio e visibile: o la misura,
 * o il motivo per cui non è stato possibile misurarla. Nessuna terza via
 * silenziosa — è esattamente la terza via silenziosa il difetto che questa
 * forma esiste per togliere.
 */
export type TextMeasurement =
  | {
      readonly kind: "measured";
      readonly ratio: number;
      readonly fg: string;
      readonly bg: string;
      readonly opacity: number;
      readonly fontSize: number;
      readonly text: string;
      readonly label: string;
      /** Motivo dell'esenzione dalla soglia (THRESHOLD_EXEMPT), o `null`. */
      readonly exempt: string | null;
    }
  | {
      readonly kind: "unclassified";
      readonly reason: string;
      readonly text: string;
      readonly label: string;
    };

/**
 * La spazzata: ogni testo a schermo, di qualunque provenienza.
 *
 * DUE PROVENIENZE, NON UNA. Un elemento produce testo in due modi e la
 * spazzata li tratta uguale:
 *  - i propri NODI DI TESTO (`nodeType === 3`);
 *  - il `content` dei propri PSEUDO-ELEMENTI `::before` / `::after`.
 * Il secondo non c'era: `::after { content: "beta"; color: … }` era testo
 * dipinto a schermo che nessuna casella misurava — la stessa fuga chiusa qui
 * sopra per una terza strada, verificata rompendo davvero. Uno pseudo-elemento
 * entra come uno strato in più della catena di composizione (vedi
 * CONTRAST_IN_PAGE), quindi porta con sé il proprio colore, la propria alfa e
 * il proprio sfondo senza alcuna regola speciale.
 *
 * Cosa NON entra nell'insieme, e sono solo tre famiglie, tutte dimostrate dal
 * browser e mai dal colore del testo:
 *  - ciò che è in UNMEASURABLE_TEXT, per il motivo scritto lì accanto;
 *  - ciò che non viene proprio dipinto: nessun box generato
 *    (`getClientRects()` vuoto, cioè `display: none` e discendenti) oppure
 *    `visibility` diversa da `visible`;
 *  - uno pseudo-elemento che non genera testo: `content` assente (`none` /
 *    `normal`) o fatto di sole immagini (`url(...)`), che non ha un colore del
 *    testo da misurare.
 *
 * In particolare NON esce più dall'insieme un elemento perché il suo colore
 * «non è riconosciuto»: il colore non decide più chi viene misurato. E non ne
 * esce più uno perché il suo box è di area nulla — un box 0×0 non prova che il
 * testo non sia dipinto (basta `overflow: visible`), mentre l'assenza di box
 * sì.
 *
 * `selector` restringe la spazzata a una famiglia di elementi invece che a
 * tutto il documento. Il default `*` è la spazzata d'insieme; la forma
 * ristretta serve alle pastiglie di ruolo, che vanno cercate per IDENTITÀ
 * (`.role-chip`) e non per colore.
 */
export async function measureAllText(page: Page, selector = "*"): Promise<TextMeasurement[]> {
  return page.evaluate(
    ([body, sel, unmeasurable, exempt]) => {
      // eslint-disable-next-line no-new-func
      const measure = new Function(`return ${body as string}`)() as (
        e: Element,
        pseudo: string | null,
      ) =>
        | { ok: true; ratio: number; fg: string; bg: string; opacity: number }
        | { ok: false; reason: string };
      const out: TextMeasurement[] = [];
      for (const el of Array.from(document.querySelectorAll(sel as string))) {
        if (
          (unmeasurable as readonly { readonly selector: string }[]).some((x) =>
            el.matches(x.selector),
          )
        )
          continue;
        // Non dipinto affatto: nessun box generato, o reso invisibile da
        // `visibility`. Sono le sole due uscite mute che restano.
        if (el.getClientRects().length === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility !== "visible") continue;
        const cls = typeof el.className === "string" ? el.className : "";
        const self = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${
          cls ? "." + cls.split(/\s+/).join(".") : ""
        }`;
        const waiver = (
          exempt as readonly { readonly selector: string; readonly why: string }[]
        ).find((x) => el.matches(x.selector));

        /** Una sola porta d'uscita per entrambe le provenienze: misura, oppure
         *  «non classificabile». Mai un `continue` silenzioso. */
        const record = (pseudo: string | null, text: string, size: number): void => {
          const label = `${self}${pseudo ?? ""} «${text.slice(0, 34)}»`;
          const m = measure(el, pseudo);
          if (!m.ok) {
            out.push({ kind: "unclassified", reason: m.reason, text, label });
            return;
          }
          out.push({
            kind: "measured",
            ratio: m.ratio,
            fg: m.fg,
            bg: m.bg,
            opacity: m.opacity,
            fontSize: size,
            text,
            label,
            exempt: waiver === undefined ? null : waiver.why,
          });
        };

        const ownText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => (n.textContent ?? "").trim())
          .join(" ")
          .trim();
        if (ownText !== "") record(null, ownText, parseFloat(cs.fontSize));

        for (const pseudo of ["::before", "::after"]) {
          const ps = getComputedStyle(el, pseudo);
          const content = ps.content;
          // Nessun contenuto generato: lo pseudo-elemento non esiste.
          if (content === "" || content === "none" || content === "normal") continue;
          // Sole immagini: c'è un box, ma non c'è testo di cui misurare il
          // colore. Qualunque altra forma (stringhe, `attr()`, `counter()`,
          // e le loro combinazioni con un'immagine) è testo e si misura.
          if (/^\s*(url\([^)]*\)|image-set\([^)]*\)|linear-gradient\([^)]*\))\s*$/.test(content))
            continue;
          if (ps.visibility !== "visible") continue;
          record(pseudo, content, parseFloat(ps.fontSize));
        }
      }
      return out;
    },
    [CONTRAST_IN_PAGE, selector, UNMEASURABLE_TEXT, THRESHOLD_EXEMPT] as const,
  ) as Promise<TextMeasurement[]>;
}

/**
 * I colori della rampa del testo COME LI RISOLVE IL BROWSER ADESSO, letti da
 * `:root` e passati per lo stesso canvas che risolve `oklch()`.
 *
 * ATTENZIONE A COSA SERVONO ADESSO: solo a DIRE quale token è finito sotto
 * soglia in un messaggio d'errore, e a provare che la rampa esiste ancora ed è
 * ancora in uso. Non decidono più chi viene misurato — è esattamente ciò che
 * facevano prima, ed è il motivo per cui bastava dipingere un testo di un
 * colore qualsiasi per farlo uscire dalla prova invece che bocciarlo.
 *
 * Letti a runtime e non scritti a mano in una costante: una costante di colori
 * attesi renderebbe anche questa informazione descrittiva sbagliata appena il
 * token cambia valore.
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

/* ────────────────────────────────────────────────────────────────────────────
   LA SPAZZATA DEL BUDGET VERTICALE DELLA SCHERMATA DI CHIAMATA
   ────────────────────────────────────────────────────────────────────────────
   Il browser qui MISURA soltanto. Chi decide che cosa è un fallimento — e a
   CHI attribuirlo — è la funzione pura `callScreenBudgetFindings()` in
   src/ui/callScreenBudget.ts, che gira senza browser e si prova a secco.
   Questa separazione è il motivo per cui il mastro non costa un giro di
   Playwright per essere verificato.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Aspetta che la schermata di chiamata abbia SMESSO DI MUOVERSI, e non è una
 * precauzione generica: è la chiusura di una corsa misurata.
 *
 * Ogni club del listone rende un `<img>` verso `/assets/clubs/<slug>.svg`
 * (src/ui/serieA.ts). Questo repository pubblico non spedisce nessun logo,
 * quindi ognuna di quelle immagini fa 404 e solo allora `onerror` la nasconde
 * e accende la pastiglia testuale — che è PIÙ LARGA (min-width 28px contro i
 * 18px dell'immagine). Fra il primo paint e l'ultimo 404 la cella del nome va
 * a capo in modo diverso, e la stessa riga misura 92,5px oppure 96,75px a
 * seconda di quando si guarda. Misurato: senza questa attesa la stessa scena
 * dava due span diversi a due esecuzioni consecutive.
 */
export async function waitForCallScreenSettled(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Array.from(document.images).every((img) => img.complete),
    undefined,
    { timeout: 15_000 },
  );
  // Due frame: il primo lascia applicare gli `onerror`, il secondo lascia
  // ricalcolare il layout che quelli hanno cambiato.
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * Raccoglie i blocchi della schermata di chiamata PER FORMA — ogni figlio di
 * `#call-screen-column`, qualunque cosa sia — e non da un elenco. È lo stesso
 * idioma della spazzata di `measureAllText` qui sopra, ed è l'unico che regge
 * il blocco che ancora non esiste: quello arriva come un figlio in più e viene
 * misurato senza che nessuno debba ricordarsi di aggiungerlo da qualche parte.
 *
 * LA PIASTRELLATURA È ESATTA. Ogni blocco copre da dove finisce il precedente
 * a dove finisce lui, ritagliato sullo span dichiarato (dal bordo superiore
 * del blocco che `CALL_SCREEN_SPAN_START_SELECTOR` nomina a quello
 * dell'indicatore di pagina). Quindi la somma dei consumi È lo span, e i
 * margini fra due blocchi non spariscono nel nulla: li paga il blocco sotto,
 * che è quello che li ha chiesti.
 *
 * DUE REGOLE, E NESSUNA DELLE DUE È SCRITTA QUI DENTRO A MANO. L'inizio dello
 * span è quello che il mastro dichiara (src/ui/callScreenBudget.ts), e un
 * figlio FUORI DAL FLUSSO consuma 0 e non fa avanzare il cursore — un
 * elemento `fixed`/`absolute` non occupa altezza verticale, quindi non c'è
 * span da attribuirgli, e contarlo faceva sparire dalla piastrellatura il
 * blocco subito dopo di lui. La dimostrazione, in numeri, sta nel ciclo.
 */
export async function sweepCallScreen(
  page: Page,
  state: CallScreenState,
): Promise<CallScreenSweep> {
  return page.evaluate(
    ({ st, startSelector }) => {
      const docTop = (el: Element): number => el.getBoundingClientRect().top + window.scrollY;
      const docBottom = (el: Element): number => el.getBoundingClientRect().bottom + window.scrollY;
      const outOfFlow = (el: Element): boolean => {
        const position = getComputedStyle(el).position;
        return position === "fixed" || position === "absolute";
      };

      const column = document.getElementById("call-screen-column");
      if (column === null) throw new Error("mastro: #call-screen-column non è a schermo");

      // DA DOVE COMINCIA LO SPAN NON È PIÙ SCRITTO QUI. Fino al 2026-08-29
      // questa riga cercava `#search-player` a mano mentre il mastro
      // DICHIARAVA l'inizio dello span in `CALL_SCREEN_SPAN_START_SELECTOR`
      // (src/ui/callScreenBudget.ts): la costante non aveva un solo lettore in
      // tutto il repository, quindi il confine dichiarato e il confine
      // misurato potevano divergere senza che niente diventasse rosso — ed è
      // esattamente quello che è successo quando il campo di ricerca è uscito
      // dal flusso. Adesso il selettore arriva dal mastro, che resta l'unico
      // posto in cui quel confine è scritto.
      //
      // Deliberatamente NON un throw quando il blocco d'inizio manca: una
      // schermata svuotata deve arrivare alla spazzata e rompere
      // l'ANTI-VACUITÀ con il suo nome, non morire prima con un errore
      // d'infrastruttura che somiglia a un problema del test. Che il campo
      // debba stare sopra la piega lo prova già e2e/call-screen-order.spec.ts.
      const start = document.querySelector(startSelector);
      const indicator = Array.from(document.querySelectorAll("span")).find((s) =>
        /^Pagina \d+ di \d+$/.test(s.textContent ?? ""),
      );

      const spanStart = start === null ? docTop(column) : docTop(start);
      // Senza paginazione (listone non caricabile) lo span finisce dove finisce
      // la colonna: non c'è un controllo di pagina da raggiungere.
      const spanEnd = indicator === undefined ? docBottom(column) : docTop(indicator);

      const children = Array.from(column.children);
      const blocks = [];
      let cursor = docTop(column);
      for (const el of children) {
        // UN FIGLIO FUORI DAL FLUSSO CONSUMA 0 E NON FA AVANZARE IL CURSORE.
        //
        // Perché, e non è una comodità: `position: fixed` (o `absolute`) toglie
        // l'elemento dal flusso, quindi NON occupa altezza verticale — i
        // fratelli sotto di lui salgono a prendersi il suo posto. Il suo
        // rettangolo però continua a esistere, e per una barra fissata in
        // fondo alla finestra sta CENTINAIA di pixel più in basso dei fratelli
        // che nel documento lo seguono.
        //
        // Contarlo faceva due danni insieme, misurati il 2026-08-29 con
        // `#call-search-row` fissato in fondo (Pico, vedi asta.css): la barra
        // si prendeva 652 px di span che non consuma, e il cursore finiva a
        // 844 px, cioè SOTTO il blocco successivo — che risultava consumare 0
        // e spariva dalla piastrellatura, mentre la regione sotto di lui
        // veniva contata due volte. Somma dei consumi 2158,75 contro uno span
        // di 1572,5: la piastrellatura non era più esatta, e un'identità che
        // non torna non attribuisce più niente a nessuno.
        const skipped = outOfFlow(el);
        const bottom = docBottom(el);
        const cls = typeof el.className === "string" ? el.className.trim() : "";
        blocks.push({
          domId: el.id,
          description: `${el.tagName.toLowerCase()}${cls === "" ? "" : `.${cls.split(/\s+/).join(".")}`}`,
          consumptionPx: skipped
            ? 0
            : Math.max(0, Math.min(spanEnd, bottom) - Math.max(spanStart, cursor)),
        });
        if (!skipped) cursor = bottom;
      }

      const rows = Array.from(document.querySelectorAll(".listone-row"));
      const listoneBlock = document.getElementById("listone-block");
      let listone = null;
      if (rows.length > 0 && listoneBlock !== null) {
        const index = children.indexOf(listoneBlock);
        // Il vicino di sopra è il precedente IN FLUSSO, per la stessa ragione
        // del ciclo: un fratello fuori dal flusso non è il bordo da cui la
        // testata del listone comincia, e prenderlo darebbe una testata
        // misurata da un rettangolo che sta da un'altra parte.
        let previous: Element | null = null;
        for (let i = index - 1; i >= 0; i -= 1) {
          const candidate = children[i]!;
          if (!outOfFlow(candidate)) {
            previous = candidate;
            break;
          }
        }
        const listoneStart = previous === null ? docTop(listoneBlock) : docBottom(previous);
        const last = rows[rows.length - 1]!;
        listone = {
          rowCount: rows.length,
          // Il MASSIMO, non la prima: una riga sola che va a capo perché il suo
          // club è più lungo degli altri deve bastare a rompere la forma.
          rowHeightPx: Math.max(...rows.map((r) => r.getBoundingClientRect().height)),
          headPx: docTop(rows[0]!) - listoneStart,
          tailPx: spanEnd - docBottom(last),
        };
      }

      return { state: st, spanPx: spanEnd - spanStart, blocks, listone };
    },
    { st: state, startSelector: CALL_SCREEN_SPAN_START_SELECTOR },
  );
}

/**
 * APRE IL CARICAMENTO MANUALE, che dal 2026-08-29 non è più a schermo.
 *
 * «Nascondi anche quello» — Pico, sullo stesso screenshot delle quattro note
 * sotto la tabella. Il comando resta COSTRUITO e funzionante: quel che sparisce
 * è la via per raggiungerlo col dito. Quattro suite lo usano per caricare un
 * listone a mano e provare quel che succede dopo — un file malformato, una
 * scrittura che non tiene, due righe proxy ambigue — e quelle prove non
 * parlano del bottone: parlano di che cosa fa l'app col file.
 *
 * Perciò il clic diventa PROGRAMMATICO. Non è un modo di aggirare la
 * nascondibilità per far passare un test: è la sola forma in cui quelle prove
 * possono continuare a esistere, e la riga che le precede — il blocco DEVE
 * essere nascosto — è ciò che impedisce a questo helper di diventare il modo
 * in cui il comando torna a schermo senza che nessuno se ne accorga.
 */
export async function apriCaricamentoManuale(page: Page): Promise<void> {
  const blocco = page.locator("#listone-manual-override");
  await expect(blocco).toHaveCount(1);
  await expect(blocco, "il caricamento manuale è tornato a schermo").toBeHidden();
  await page.evaluate(() => {
    const bottone = document
      .getElementById("listone-manual-override")
      ?.querySelector("button");
    if (bottone === null || bottone === undefined) throw new Error("CARICAMENTO_MANUALE_ASSENTE");
    bottone.click();
  });
}

/**
 * Preme un comando DENTRO il caricamento manuale, che è nascosto: stessa
 * ragione e stessi limiti di `apriCaricamentoManuale` qui sopra. Il testo si
 * confronta per intero e non per sottostringa, perché dentro quel blocco
 * convivono più comandi e prendere il primo che «contiene» sarebbe un test che
 * preme un bottone diverso da quello che dichiara.
 */
export async function premiNelCaricamentoManuale(page: Page, testo: string): Promise<void> {
  await page.evaluate((atteso) => {
    const blocco = document.getElementById("listone-manual-override");
    if (blocco === null) throw new Error("CARICAMENTO_MANUALE_ASSENTE");
    // `button` e `span` insieme: dentro questo blocco un comando è un bottone
    // e l'altro è uno span con un gestore di clic. Cercarne uno solo dei due
    // farebbe fallire questa funzione con «non trovato» su un comando che
    // esiste — e la differenza fra i due non è una proprietà che questa prova
    // debba conoscere.
    const bottoni = [...blocco.querySelectorAll<HTMLElement>("button, span")];
    const trovato = bottoni.find((b) => (b.textContent ?? "").trim() === atteso);
    if (trovato === undefined) {
      throw new Error(
        `COMANDO_NON_TROVATO: "${atteso}" fra [${bottoni.map((b) => (b.textContent ?? "").trim()).join(" | ")}]`,
      );
    }
    trovato.click();
  }, testo);
}

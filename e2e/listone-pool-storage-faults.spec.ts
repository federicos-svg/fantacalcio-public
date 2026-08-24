// Audit motore round 2 (#231, commento 5292582619) — findings 4 and 5, the
// two failure modes of the listone's own persistence.
//
//   PROBE G — `savePersistedPool` called browserStorage.setItem naked, and its
//             call sites sit BEFORE render(): a quota/denied-storage throw at
//             boot skipped the repaint, so the panel said "Nessun listone
//             caricato al momento." while state.pool already held the rows,
//             with no error anywhere ("rows painted after boot: 0",
//             "any error message about the listone? 0").
//   PROBE R — the same throw on an EXPLICIT manual load: the screen kept
//             showing the PREVIOUS pool while the app had already switched to
//             the new one, and said nothing.
//   PROBE T — an empty static asset (`[]`) was accepted as a valid pool, won
//             over a perfectly good saved copy, and then OVERWROTE it: with
//             both sources down afterwards the panel stayed empty forever
//             ("saved pool now: []").
//
// The fault is injected the same way in every test: Storage.prototype.setItem
// throws for the listone key ONLY, so the auction log's own storage (a
// different key, fail-closed by its own path) is untouched.
//
// ── PROBE T e la terza fonte (correzione della PRECONDIZIONE) ────────────────
// PROBE T dichiara, nel suo ultimo blocco, che "entrambe le fonti sono giù" e
// che quindi a schermo può esserci solo la copia salvata. Da quando
// src/offline/** è nel build quella frase era falsa: le fonti sono TRE, e la
// terza — la Cache Storage del service worker — resta in piedi. `handleDataAsset`
// (src/offline/sw.ts) è network-first con fallback in cache PER SPECIFICA
// (swPolicy.ts: "the last good copy must survive going offline"), ed è la
// stessa regola che e2e/service-worker-cache-guards.spec.ts pretende e prova.
// Il prodotto ha ragione: era la spec ad asserire su una premessa che non
// aveva stabilito.
//
// Perché il difetto era INVISIBILE qui e rosso altrove: in questo repository
// l'asset spedito contiene le stesse righe della fixture, quindi la copia
// servita dalla cache è indistinguibile da quella salvata e il test passa
// senza distinguere le due fonti. Riprodotto a livello di stato (cache di
// questo build caricata con i byte dell'asset spedito, asset spedito diverso
// dalla fixture) il blocco finale diventa rosso con "N giocatori caricati" al
// posto delle righe sintetiche — la stessa firma dell'artefatto di fallimento
// misurato nel repository privato.
//
// La correzione non tocca il prodotto e non indebolisce nulla:
//   1. si aspetta che il worker CONTROLLI la pagina prima di cambiare rotta,
//      così l'`addAll` dell'install non può più correre contro la finestra di
//      `context.unroute` e finire per precacheare l'asset vero;
//   2. prima del blocco finale si toglie l'asset dalla cache di questo build
//      (`evictDataAssetFromServiceWorkerCache`, che fallisce se non trova
//      nessuna cache o se una voce sopravvive), così "entrambe le fonti giù"
//      torna vero come il test assume;
//   3. le asserzioni si RAFFORZANO invece di allentarsi: righe esatte, in
//      ordine, via `expectListoneRows` — che va rosso su qualunque altro pool,
//      compresa la copia spedita — e la copia offline verificata intatta anche
//      nel blocco finale, dove prima non era controllata affatto.
import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  installSyntheticNetworkGuard,
  readLocalStorageRaw,
  waitForServiceWorkerControl,
  evictDataAssetFromServiceWorkerCache,
  expectListoneRows,
  LISTONE_ASSET_PATH,
} from "./helpers.js";

const SYNTHETIC_LISTONE_NAMES = SYNTHETIC_LISTONE_POOL.map((player) => player.name);

const POOL_STORAGE_KEY = "fac_pool";

const MANUAL_POOL = [
  { name: "Manuale Uno", role: "P", club: "ClubManuale", quotation: 7 },
  { name: "Manuale Due", role: "C", club: "ClubManuale", quotation: 11 },
] as const;

/** Makes every write of the listone key throw, for the whole page lifetime. */
async function denyPoolStorageWrites(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patched(this: Storage, k: string, v: string): void {
      if (k === key) throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, k, v);
    };
  }, POOL_STORAGE_KEY);
}

test.describe("listone pool persistence faults (audit r2, findings 4 and 5)", () => {
  test("PROBE G: a listone that cannot be saved is still painted, and the failure is stated", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await denyPoolStorageWrites(page);
    await page.goto("/");

    // render() is reached: the rows the fetch already produced are on screen,
    // not the empty state the skipped repaint used to leave behind.
    await expect(page.getByText(SYNTHETIC_LISTONE_POOL[0]!.name, { exact: true })).toBeVisible();
    await expect(page.getByText("Nessun listone caricato al momento.")).toHaveCount(0);
    await expect(page.locator("#pool-notice")).toContainText("non salvato in locale");
    expect(pageErrors).toEqual([]);

    // Nothing was persisted — which is exactly what the notice says.
    expect(await readLocalStorageRaw(page, POOL_STORAGE_KEY)).toBeNull();
    expect(externalRequests).toEqual([]);
  });

  test("PROBE R: a manual load that cannot be saved shows the NEW pool, not the old one", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await denyPoolStorageWrites(page);
    await page.goto("/");
    await expect(page.getByText(SYNTHETIC_LISTONE_POOL[0]!.name, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Caricamento manuale/ }).click();
    await page.getByText("Carica listone (JSON locale)").locator("input[type=file]").setInputFiles({
      name: "manual-pool.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(MANUAL_POOL)),
    });

    // The screen agrees with the app's own state: the file the operator just
    // picked is the one on screen, and the fact it will not survive a reload
    // is stated rather than discovered.
    await expect(page.getByText(MANUAL_POOL[0]!.name, { exact: true })).toBeVisible();
    await expect(page.getByText(SYNTHETIC_LISTONE_POOL[0]!.name, { exact: true })).toHaveCount(0);
    await expect(page.locator("#pool-notice")).toContainText("non salvato in locale");
    expect(pageErrors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test("PROBE T: an empty static asset neither empties the panel nor destroys the offline copy", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    await page.goto("/");
    await expectListoneRows(page, SYNTHETIC_LISTONE_NAMES);
    // Prima di toccare le rotte: l'install del worker (e il suo precache) è
    // finito, quindi da qui in poi la cache di questo build contiene ciò che
    // QUESTA spec ha servito e non ciò che il server spedisce.
    await waitForServiceWorkerControl(page);
    const savedBefore = await readLocalStorageRaw(page, POOL_STORAGE_KEY);
    expect(JSON.parse(savedBefore!)).toEqual(SYNTHETIC_LISTONE_POOL);

    // The static asset degrades to `[]` — a broken build/deploy, the shape the
    // probe used. The deposit stays unavailable, so the saved copy is the only
    // thing left standing.
    await context.unroute("**/*");
    await installSyntheticNetworkGuard(context, [], externalRequests);
    await page.reload();

    await expectListoneRows(page, SYNTHETIC_LISTONE_NAMES);
    await expect(page.getByText("Nessun listone caricato al momento.")).toHaveCount(0);
    // The offline copy is intact — with both sources down it is still there.
    expect(JSON.parse((await readLocalStorageRaw(page, POOL_STORAGE_KEY))!)).toEqual(SYNTHETIC_LISTONE_POOL);

    // "Entrambe le fonti giù" comprende la cache del service worker, che
    // altrimenti risponderebbe al posto della rete — per specifica. Toglierla
    // di mezzo QUI è ciò che rende vera la premessa del blocco sotto; l'helper
    // fallisce se non trova la cache o se una voce sopravvive, quindi questo
    // passo non può diventare un no-op in silenzio.
    await evictDataAssetFromServiceWorkerCache(page);

    await context.unroute("**/*");
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === LISTONE_ASSET_PATH) return route.fulfill({ status: 500, body: "" });
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
      externalRequests.push(route.request().url());
      return route.abort("blockedbyclient");
    });
    await page.reload();
    // Righe esatte e in ordine, non "un nome è visibile da qualche parte":
    // è questa forma che distingue la copia salvata da qualunque altro pool
    // (asset spedito compreso) e che toglie il mascheramento di questo repo.
    await expectListoneRows(page, SYNTHETIC_LISTONE_NAMES);
    await expect(page.getByText("Nessun listone caricato al momento.")).toHaveCount(0);
    // L'altra metà dell'invariante, nel punto in cui conta di più: con tutte
    // le fonti giù la copia offline è ancora quella, non è stata distrutta né
    // sostituita.
    expect(JSON.parse((await readLocalStorageRaw(page, POOL_STORAGE_KEY))!)).toEqual(SYNTHETIC_LISTONE_POOL);
    expect(externalRequests).toEqual([]);
  });
});

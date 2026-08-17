// "survives asset failure via local cache": la copia locale del titolo è
// localStorage, non la Cache Storage del service worker. La distinzione non era
// verificata — e da quando src/offline/** è nel build non è più gratuita: se
// l'asset viene abortito ma il worker ne ha ancora una copia, `handleDataAsset`
// risponde dalla cache (network-first CON fallback, per specifica) e la spec
// resta verde senza aver mai esercitato il ricadere su localStorage.
//
// Stessa classe di difetto di PROBE T in e2e/listone-pool-storage-faults.spec.ts
// (vedi la sua intestazione per il meccanismo per intero, riprodotto e
// misurato): qui è invisibile per la stessa ragione — l'asset spedito da questo
// repository contiene le stesse righe della fixture — e rosso dove i dati sono
// reali. La correzione è la stessa e non tocca il prodotto: si aspetta che il
// worker controlli la pagina prima di cambiare rotta, si toglie l'asset dalla
// cache di questo build prima del reload, e si asserisce sulle righe ESATTE
// invece che su "ogni nome è visibile da qualche parte".
import { expect, test } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import {
  installSyntheticNetworkGuard,
  waitForServiceWorkerControl,
  evictDataAssetFromServiceWorkerCache,
  expectListoneRows,
  LISTONE_ASSET_PATH,
} from "./helpers.js";

const SYNTHETIC_LISTONE_NAMES = SYNTHETIC_LISTONE_POOL.map((player) => player.name);

test("a live-bundle-shaped static payload preloads and survives asset failure via local cache", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");

  await expectListoneRows(page, SYNTHETIC_LISTONE_NAMES);
  await waitForServiceWorkerControl(page);
  const persisted = await page.evaluate(() => window.localStorage.getItem("fac_pool"));
  expect(persisted).not.toBeNull();
  expect(JSON.parse(persisted ?? "[]")).toEqual(SYNTHETIC_LISTONE_POOL);

  // L'asset non è raggiungibile NEMMENO dal worker: è l'unico stato in cui
  // "sopravvive via local cache" può significare localStorage.
  await evictDataAssetFromServiceWorkerCache(page);

  await context.unroute("**/*");
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === LISTONE_ASSET_PATH) return route.abort("failed");
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    externalRequests.push(route.request().url());
    return route.abort("blockedbyclient");
  });

  await page.reload();
  await expectListoneRows(page, SYNTHETIC_LISTONE_NAMES);
  expect(JSON.parse((await page.evaluate(() => window.localStorage.getItem("fac_pool"))) ?? "[]")).toEqual(
    SYNTHETIC_LISTONE_POOL,
  );
  expect(externalRequests).toEqual([]);
});

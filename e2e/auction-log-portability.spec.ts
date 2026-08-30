import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { SYNTHETIC_LISTONE_POOL, E2E_TARGET_PLAYER, E2E_PURCHASE_PRICE } from "./fixtures/synthetic-listone.js";
import {
  expectAssignedEffectsVisible,
  gotoScreen,
  installSyntheticNetworkGuard,
  readLocalStorageRaw,
} from "./helpers.js";
import { LOG_STORAGE_KEY } from "../src/logRecovery.js";
import { CONFIRMATIONS_STORAGE_KEY } from "../src/confirmationsStore.js";
import { LEAGUE_ROSTER_STORAGE_KEY, LEAGUE_ROSTER_SCHEMA_VERSION } from "../src/leagueTeams.js";
import { AUCTION_HISTORY_STORAGE_KEY } from "../packages/opponent-profiles/src/storage.js";
import { listonePlayerKey } from "../src/ui/listone.js";

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * DA DOVE NASCE UNA RICONFERMA, ADESSO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Non più da un'area delle Impostazioni: quel pannello — e ogni suo id
 * `#riconferme-*` — non esiste più. Il gesto vive nella pagina ROSE, sulla
 * CASELLA VUOTA della scheda di rosa, che apre una modale a due schede
 * («inserisci a mano» / «rinnova dall'anno scorso»).
 *
 * E NON È LO STESSO GESTO CON UN ALTRO VESTITO. Il vecchio pannello lasciava
 * scegliere qualunque riga di listone del ruolo giusto e battere il prezzo a
 * mano; la scheda RINNOVO elenca soltanto i giocatori che QUELLA squadra aveva
 * davvero l'anno scorso, letti dallo storico d'asta, al prezzo pagato allora
 * (src/renewals.ts, LEAGUE_RULES.md §4). Da qui i due depositi seminati sotto:
 * senza registro lega non c'è la persona seduta al posto «Io», e senza storico
 * non c'è nessuno da rinnovare — il pannello direbbe, con ragione, che non sa.
 *
 * Il cuore di queste spec — export v2 che porta con sé il batch riconferme,
 * reimport su un dispositivo pulito, file v1 legacy senza chiave
 * `confirmations` — non cambia: cambia solo la porta da cui la riconferma
 * entra e quella da cui si rilegge.
 */

/**
 * The riconferma target, DERIVED from the pool this spec itself injects rather
 * than restated by hand. What these tests need is a PROPERTY — "the role-D row
 * of the injected pool" — never the name that row happens to carry: the name
 * was written out eight times below, so a rename in
 * e2e/fixtures/synthetic-listone.ts turned this spec red for a reason it does
 * not test. Same posture as e2e/shipped-listone.ts: follow the data by
 * identity, and fail loudly (throw, at import time) rather than silently if the
 * pool can no longer exercise the case.
 */
const RICONFERMA_PLAYER = (() => {
  const row = SYNTHETIC_LISTONE_POOL.find((p) => p.role === "D");
  if (!row) {
    throw new Error(
      'auction-log-portability: nessuna riga di ruolo "D" in SYNTHETIC_LISTONE_POOL ' +
        "(e2e/fixtures/synthetic-listone.ts). Queste spec rinnovano un difensore dalla casella " +
        "vuota #roster-slot-Io-D-0: senza una riga D il caso non è esercitabile.",
    );
  }
  if (!row.club) {
    throw new Error(
      'auction-log-portability: la riga di ruolo "D" di SYNTHETIC_LISTONE_POOL non ha club. ' +
        "L'etichetta della riga di rinnovo vale `nome (club)` solo quando il club c'è " +
        "(src/main.ts, renderRenewalRow), quindi RICONFERMA_ROW_LABEL non descriverebbe più " +
        "ciò che il DOM mostra.",
    );
  }
  return row;
})();

/** Exactly how src/main.ts (renderRenewalRow) labels that row in the renewal
 *  list — composed from the same fields, never a second hand-written copy. */
const RICONFERMA_ROW_LABEL = `${RICONFERMA_PLAYER.name} (${RICONFERMA_PLAYER.club})`;

/** La stessa identità che l'event log registra e che lo storico d'asta indicizza:
 *  una seconda ricetta qui farebbe passare per «un altro giocatore» lo stesso
 *  giocatore, e il pannello resterebbe vuoto per il motivo sbagliato. */
const RICONFERMA_PLAYER_ID = listonePlayerKey(RICONFERMA_PLAYER);

/** Il prezzo PAGATO L'ANNO SCORSO. Non è più un numero che si batte in un
 *  campo: è un fatto dello storico, e il rinnovo lo ripropone tale e quale
 *  (§4). Tutti i budget attesi qui sotto si derivano da questa costante. */
const RICONFERMA_PRICE = 15;

/** La stagione da cui si rinnova: l'unica etichetta dello storico seminato, e
 *  quindi la massima ordinabile — cioè quella che src/renewals.ts elegge. */
const PREVIOUS_SEASON = "2025/26";

/** La persona seduta al posto «Io». Nome di fantasquadra e UUID legato a
 *  nessuno, come in e2e/fixtures/synthetic-precedents.ts e per la stessa
 *  ragione (issue #234, nota privacy). */
const PERSON_IO = {
  id: "person:00000000-0000-4000-8000-0000000000c1",
  name: "Squadra Io",
} as const;

/**
 * Semina i DUE depositi da cui il rinnovo legge, e ricarica perché l'app li
 * legge al boot: il registro lega (chi siede al posto «Io») e lo storico
 * d'asta (che cosa quella persona aveva l'anno scorso, e a quanto).
 *
 * Passa da `localStorage` perché è il canale vero — `loadLeagueRoster` /
 * `loadAuctionHistory` — non una porta di servizio aperta per i test.
 */
async function seedLastSeasonRoster(page: Page): Promise<void> {
  await page.evaluate(
    ([keys, roster, history]) => {
      window.localStorage.setItem(keys.roster, JSON.stringify(roster));
      window.localStorage.setItem(keys.history, JSON.stringify(history));
    },
    [
      { roster: LEAGUE_ROSTER_STORAGE_KEY, history: AUCTION_HISTORY_STORAGE_KEY },
      {
        schemaVersion: LEAGUE_ROSTER_SCHEMA_VERSION,
        people: [{ id: PERSON_IO.id, name: PERSON_IO.name }],
        seats: { Io: PERSON_IO.id },
      },
      {
        schemaVersion: 1,
        purchases: [
          {
            season: PREVIOUS_SEASON,
            personId: PERSON_IO.id,
            playerId: RICONFERMA_PLAYER_ID,
            club: RICONFERMA_PLAYER.club,
            price: RICONFERMA_PRICE,
            acquisition: "asta",
          },
        ],
      },
    ] as const,
  );
  await page.reload();
  await expect(page.locator(".listone-row").first()).toBeVisible();
}

/**
 * Il gesto nuovo, per intero: casella D vuota di «Io» nella pagina ROSE →
 * scheda RINNOVO → «Rinnova». Verifica per strada le due cose che rendono
 * quella riga un rinnovo e non una scelta libera: la stagione da cui viene e
 * il prezzo pagato allora, che nessuno digita.
 */
async function riconfermaFromEmptySlot(page: Page): Promise<void> {
  await gotoScreen(page, "Rose");
  const slot = page.locator("#roster-slot-Io-D-0");
  await expect(slot).toHaveClass(/roster-slot--empty/);
  await slot.click();
  await page.locator("#roster-slot-tab-rinnovo").click();
  await expect(page.locator("#roster-slot-renewal-locked")).toHaveCount(0);
  await expect(page.locator("#roster-slot-renewal-season")).toContainText(PREVIOUS_SEASON);
  const row = page.locator("#roster-slot-renewal-list li", { hasText: RICONFERMA_ROW_LABEL });
  await expect(row).toContainText(`${RICONFERMA_PRICE} cr`);
  await row.locator(`#roster-slot-renew-${RICONFERMA_PLAYER_ID}`).click();
  await expect(page.locator("#roster-slot-overlay")).toHaveCount(0);
}

/**
 * La rilettura, dalla stessa parte da cui si è entrati: la casella D di «Io»
 * ora è PIENA, porta nome e prezzo del riconfermato, e la pastiglia
 * `.roster-badge-confirmed` dice che è arrivato lì per riconferma e non
 * dall'asta (src/ui/views.ts, renderRoseCard: `entry.seq < 0`).
 */
async function expectRiconfermaOnRoseCard(page: Page): Promise<void> {
  await gotoScreen(page, "Rose");
  const slot = page.locator("#roster-slot-Io-D-0");
  await expect(slot).toHaveClass(/roster-slot--filled/);
  await expect(slot).toContainText(RICONFERMA_PLAYER.name);
  await expect(slot).toContainText(String(RICONFERMA_PRICE));
  await expect(slot.locator(".roster-badge-confirmed")).toBeVisible();
}

test("exports, confirms replacement, imports, and survives reload without external network", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expectAssignedEffectsVisible(page, E2E_TARGET_PLAYER.name, E2E_PURCHASE_PRICE, "1/7");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#auction-log-export").click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  expect(exportedPath).not.toBeNull();

  await page.getByText("Annulla", { exact: true }).click();
  await page.getByRole("button", { name: "Annulla acquisto", exact: true }).click();
  // «Nessun GESTO registrato»: da quando il log registra anche svincoli e
  // scambi, il vuoto di quel pannello non parla più di soli acquisti
  // (src/main.ts, STORICO ACQUISTI, SVINCOLI E SCAMBI).
  await expect(page.getByText("Nessun gesto registrato.")).toBeVisible();

  await page.locator("#auction-log-import-file").setInputFiles(exportedPath!);
  await page.locator("#import-confirm-apply").click();
  await expectAssignedEffectsVisible(page, E2E_TARGET_PLAYER.name, E2E_PURCHASE_PRICE, "1/7");
  const importedRaw = await readLocalStorageRaw(page, LOG_STORAGE_KEY);

  await page.locator("#auction-log-import-file").setInputFiles({
    name: "empty.v1.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"fantacalcio-auction-log","version":1,"log":[]}\n'),
  });
  await page.locator("#import-confirm-cancel").click();
  await expect(page.getByText(/Import annullato/)).toBeVisible();
  expect(await readLocalStorageRaw(page, LOG_STORAGE_KEY)).toBe(importedRaw);

  await page.locator("#auction-log-import-file").setInputFiles({
    name: "invalid.v1.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"fantacalcio-auction-log","version":1,"log":[{"type":"VOID","seq":0,"ts":"2026-07-25T00:00:00.000Z","targetSeq":99}]}\n'),
  });
  await page.locator("#import-confirm-apply").click();
  await expect(page.getByText(/semanticamente valido/)).toBeVisible();
  expect(await readLocalStorageRaw(page, LOG_STORAGE_KEY)).toBe(importedRaw);

  await page.reload();
  await expectAssignedEffectsVisible(page, E2E_TARGET_PLAYER.name, E2E_PURCHASE_PRICE, "1/7");
  expect(externalRequests).toEqual([]);
});

// Tranche 2b (#231): portable log v2 — the envelope now also carries the
// riconferme batch, so an export/import round-trip restores BOTH stores,
// not just the log.
test("v2 export carries the riconferme batch, and reimporting on a wiped device restores both stores", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator(".listone-row").first()).toBeVisible();

  // Una riconferma sulla riga di ruolo D del pool iniettato, dal gesto vero:
  // prima i due depositi da cui il rinnovo la pesca, poi la casella vuota.
  await seedLastSeasonRoster(page);
  await riconfermaFromEmptySlot(page);
  await expectRiconfermaOnRoseCard(page);

  // A live purchase makes the log non-empty too.
  await gotoScreen(page, "Asta");
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(E2E_PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#critical-budget")).toHaveText(
    `${500 - E2E_PURCHASE_PRICE - RICONFERMA_PRICE} cr`,
  );

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#auction-log-export").click();
  const download = await downloadPromise;
  const exportedPath = await download.path();
  expect(exportedPath).not.toBeNull();
  const exportedEnvelope = JSON.parse(await readFile(exportedPath!, "utf-8"));
  expect(exportedEnvelope.version).toBe(2);
  expect(exportedEnvelope.confirmations).toEqual([
    { fantaTeamId: "Io", playerId: expect.any(String), role: "D", price: RICONFERMA_PRICE },
  ]);

  // Wipe everything (simulate a fresh device/browser) and import the v2
  // file: both the log and the riconferme come back, atomically-with-
  // verified-rollback per the archived design. The wiped device's log is
  // empty, so the import applies immediately (no replace-confirmation
  // dialog — that only guards a NON-empty standing log).
  //
  // La pulizia porta via anche registro lega e storico d'asta, ed è giusto
  // così: dopo il clear non si rinnova più niente, si RILEGGE ciò che il file
  // ha riportato. Il batch riconferme viaggia dentro l'envelope e non dentro
  // lo storico d'asta — che è esattamente ciò che questo test misura.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator(".listone-row").first()).toBeVisible();
  await page.locator("#auction-log-import-file").setInputFiles(exportedPath!);
  // Not expectAssignedEffectsVisible: that helper assumes a clean 500 cr
  // baseline, but this device also carries the imported 15 cr riconferma.
  const storicoPanel = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(storicoPanel).toContainText(E2E_TARGET_PLAYER.name);
  await expect(storicoPanel).toContainText(`${E2E_PURCHASE_PRICE} cr`);
  await expect(page.locator("#critical-budget")).toHaveText(
    `${500 - E2E_PURCHASE_PRICE - RICONFERMA_PRICE} cr`,
  );

  await expectRiconfermaOnRoseCard(page);

  expect(externalRequests).toEqual([]);
});

// v1 legacy import (no `confirmations` key at all) is still accepted, but
// only after validation against the DEVICE's current riconferme — never a
// second, divergent source of truth for a file that carries none.
test("a v1 legacy file with no confirmations key still imports, validated against the device's current riconferme", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator(".listone-row").first()).toBeVisible();

  // Device already has a riconferma unrelated to the imported (empty) log.
  await seedLastSeasonRoster(page);
  await riconfermaFromEmptySlot(page);
  await expectRiconfermaOnRoseCard(page);

  await gotoScreen(page, "Asta");
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - RICONFERMA_PRICE} cr`);
  // Post-review fix (round 2, #285): the log is empty, but the DEVICE has a
  // real riconferma — the replace-confirmation dialog now gates on either
  // condition, not just a non-empty log, so it must appear here too. The
  // copy names this file's own (v1) scope explicitly: only the log.
  await page.locator("#auction-log-import-file").setInputFiles({
    name: "legacy.v1.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"fantacalcio-auction-log","version":1,"log":[]}\n'),
  });
  await expect(page.locator("#import-confirm-overlay")).toBeVisible();
  await expect(page.locator("#import-confirm-body")).toContainText("solo lo storico");
  await expect(page.locator("#import-confirm-body")).toContainText("le riconferme del dispositivo restano");
  await page.locator("#import-confirm-apply").click();
  await expect(page.locator("#import-confirm-overlay")).toHaveCount(0);
  await expect(page.getByText(/Import completato/)).toBeVisible();
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - RICONFERMA_PRICE} cr`);

  // The device's riconferma was untouched by a v1 import (it carries none).
  await expectRiconfermaOnRoseCard(page);

  expect(externalRequests).toEqual([]);
});

// Pins fix 1 (#285) directly: importing a v2 file (which carries its OWN,
// different riconferme) onto a device with an EMPTY log but a real
// riconferma already entered used to skip the confirm dialog entirely
// (the old gate only checked the log) and silently replace it. The dialog
// must now appear, name the v2 scope explicitly (storico E riconferme), and
// "Mantieni storico" must leave BOTH stores completely untouched.
test("v2 import onto an empty log with riconferme already entered shows the replace dialog; cancelling changes nothing", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
  await page.goto("/");
  await expect(page.locator(".listone-row").first()).toBeVisible();

  await seedLastSeasonRoster(page);
  await riconfermaFromEmptySlot(page);
  await expectRiconfermaOnRoseCard(page);

  await gotoScreen(page, "Asta");
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - RICONFERMA_PRICE} cr`);
  const confirmationsBefore = await readLocalStorageRaw(page, CONFIRMATIONS_STORAGE_KEY);
  const logBefore = await readLocalStorageRaw(page, LOG_STORAGE_KEY);

  // A well-formed, empty v2 envelope — log is still empty on this device, so
  // ONLY the confirmations condition is what must trigger the dialog here.
  await page.locator("#auction-log-import-file").setInputFiles({
    name: "wipe.v2.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"fantacalcio-auction-log","version":2,"log":[],"confirmations":[]}\n'),
  });
  await expect(page.locator("#import-confirm-overlay")).toBeVisible();
  await expect(page.locator("#import-confirm-body")).toContainText("storico E riconferme");

  await page.locator("#import-confirm-cancel").click();
  await expect(page.locator("#import-confirm-overlay")).toHaveCount(0);
  await expect(page.getByText(/Import annullato/)).toBeVisible();

  // Nothing changed — neither store was touched by the cancelled import.
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - RICONFERMA_PRICE} cr`);
  await expectRiconfermaOnRoseCard(page);
  expect(await readLocalStorageRaw(page, CONFIRMATIONS_STORAGE_KEY)).toBe(confirmationsBefore);
  expect(await readLocalStorageRaw(page, LOG_STORAGE_KEY)).toBe(logBefore);

  expect(externalRequests).toEqual([]);
});

// Riconferme pre-asta recovery (tranche 2b, #231) — LIVE-02-style
// fail-closed recovery for a SEPARATE store (src/confirmationsStore.ts):
// corrupted + non-empty log -> full-screen block with a two-step "Riparti
// senza riconferme"; corrupted + empty log -> non-blocking banner; no key
// -> byte-identical to pre-2b (covered in riconferme-panel.spec.ts). Also
// covers the confirmations/live-log conflict (audit fix 3 of #283): never
// a crash, always the SAME governed blocked screen the log's own
// persistence failures use.
//
// DOVE SI DICHIARA UNA RICONFERMA, DAL RIORDINO DELLA PAGINA ROSA: non più in
// un'area delle Impostazioni — quel pannello non esiste più, con tutti i suoi
// id `#riconferme-*` — ma nella casella VUOTA della scheda di rosa, che apre
// una modale a due schede («inserisci a mano» / «rinnova dall'anno scorso»).
// Il recupero misurato qui non cambia di una riga: cambia solo la porta da cui
// si verifica che, dopo, la riconferma sia di nuovo dichiarabile.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { LOG_STORAGE_KEY } from "../src/logRecovery.js";
import { CONFIRMATIONS_QUARANTINE_STORAGE_KEY, CONFIRMATIONS_STORAGE_KEY } from "../src/confirmationsStore.js";
import { SYNTHETIC_LISTONE_POOL } from "./fixtures/synthetic-listone.js";
import { gotoScreen, installSyntheticNetworkGuard, readLocalStorageRaw } from "./helpers.js";

// Deliberately not valid JSON, with non-ASCII content — export must
// reproduce this exactly.
const CORRUPTED_CONFIRMATIONS = "not json at all, definitely corrupted riconferme — 你好";

const VALID_LOG = [
  { type: "PURCHASE", seq: 0, ts: "2026-08-01T10:00:00.000Z", playerId: "pre-existing-player", role: "A", fantaTeamId: "Io", price: 10 },
];

test("corrupted confirmations + non-empty log -> blocked screen; explicit two-step restart clears only the riconferme, never the standing log", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  await page.addInitScript(
    ({ confirmationsKey, corrupted, logKey, log }) => {
      window.localStorage.setItem(confirmationsKey, corrupted);
      window.localStorage.setItem(logKey, JSON.stringify(log));
    },
    { confirmationsKey: CONFIRMATIONS_STORAGE_KEY, corrupted: CORRUPTED_CONFIRMATIONS, logKey: LOG_STORAGE_KEY, log: VALID_LOG },
  );
  await page.goto("/");

  const heading = page.getByRole("heading", { name: /riconferme pre-asta non valide/i });
  await expect(heading).toBeVisible();
  await expect(page.getByRole("button", { name: "Registra acquisto", exact: true })).toHaveCount(0);

  // Retry: still corrupted -> still blocked.
  await page.getByRole("button", { name: "Riprova lettura storage", exact: true }).click();
  await expect(heading).toBeVisible();

  // Export: exact bytes, never normalized.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta riconferme corrotte", exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("expected a saved download path");
  expect(await readFile(downloadPath, "utf-8")).toBe(CORRUPTED_CONFIRMATIONS);

  // Two-step restart: the first click only opens the confirmation, cancel
  // backs out without changing anything.
  await page.getByRole("button", { name: "Riparti senza riconferme", exact: true }).click();
  await expect(page.getByRole("button", { name: "Registra acquisto", exact: true })).toHaveCount(0);
  const confirmHeading = page.getByText("Confermi di ripartire senza riconferme?", { exact: true });
  await expect(confirmHeading).toBeVisible();
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(confirmHeading).toHaveCount(0);
  await expect(heading).toBeVisible();

  // Confirm for real.
  await page.getByRole("button", { name: "Riparti senza riconferme", exact: true }).click();
  await page.getByRole("button", { name: "Sì, riparti senza riconferme", exact: true }).click();

  // Usable again — the STANDING log survived untouched (this action never
  // touches it), only the riconferme were cleared.
  await expect(heading).toHaveCount(0);
  await expect(page.locator("#critical-spent")).toHaveText("10 cr");
  const storicoPanel = page.locator(".panel", { hasText: "STORICO ACQUISTI" });
  await expect(storicoPanel).toContainText("10 cr");

  // The quarantine is still available after restarting — never auto-cleared.
  const quarantinedAfter = await readLocalStorageRaw(page, CONFIRMATIONS_QUARANTINE_STORAGE_KEY);
  expect(quarantinedAfter).toBe(CORRUPTED_CONFIRMATIONS);
  const banner = page.locator("#confirmations-quarantine-banner");
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Esporta riconferme non valide", exact: true })).toBeVisible();

  // La riconferma è di nuovo dichiarabile — dalla casella vuota della pagina
  // ROSE, che è dove il gesto vive adesso. Due cose insieme: la casella di
  // ruolo D di «Io» è VUOTA (il batch è stato davvero azzerato, non solo
  // nascosto), e la sua scheda RINNOVO è bloccata perché il log non è vuoto —
  // un cancello separato e ortogonale al recupero, esattamente come lo era la
  // vecchia nota di sola lettura del pannello nelle Impostazioni.
  await gotoScreen(page, "Rose");
  const emptyDefenderSlot = page.locator("#roster-slot-Io-D-0");
  await expect(emptyDefenderSlot).toHaveClass(/roster-slot--empty/);
  await emptyDefenderSlot.click();
  await page.locator("#roster-slot-tab-rinnovo").click();
  // DAL 2026-08-30 IL LUCCHETTO SUL LOG NON ESISTE PIU: qui il rinnovo si apre
  // e dice la propria ragione di merito — questa scena non ha storico d'asta
  // caricato — invece di rimandare a un cancello che non c'e. Il recupero da
  // riconferme corrotte resta ortogonale, che era il punto di questa spec.
  await expect(page.locator("#roster-slot-renewal-locked")).toHaveCount(0);
  await expect(page.locator("#roster-slot-renewal-empty")).toHaveAttribute(
    "data-reason",
    "no-history",
  );
  await page.locator("#roster-slot-close").click();
  await expect(page.locator("#roster-slot-overlay")).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

test("corrupted confirmations + empty log -> non-blocking banner, the empty slot stays open to a riconferma", async ({ page, context }) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  await page.addInitScript(
    ({ confirmationsKey, corrupted }) => {
      window.localStorage.setItem(confirmationsKey, corrupted);
    },
    { confirmationsKey: CONFIRMATIONS_STORAGE_KEY, corrupted: CORRUPTED_CONFIRMATIONS },
  );
  await page.goto("/");

  // Never blocked: the app is fully usable, the notice is a banner.
  await expect(page.getByRole("heading", { name: /riconferme pre-asta non valide/i })).toHaveCount(0);
  const banner = page.locator("#confirmations-quarantine-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("quarantena");
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");

  const downloadPromise = page.waitForEvent("download");
  await banner.getByRole("button", { name: "Esporta riconferme non valide", exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("expected a saved download path");
  expect(await readFile(downloadPath, "utf-8")).toBe(CORRUPTED_CONFIRMATIONS);

  // Dichiarabile: il log è vuoto, quindi la quarantena NON chiude la strada —
  // la casella vuota si apre e la scheda rinnovo non è bloccata. Che poi
  // l'elenco sia vuoto per «nessuno storico d'asta caricato» è il silenzio
  // onesto di questo dispositivo, non un blocco: `#roster-slot-renewal-empty`
  // viene stampato solo DOPO il cancello del log, quindi la sua presenza prova
  // che il cancello non è scattato. La riconferma vera, dal suo storico, è
  // misurata in e2e/auction-log-portability.spec.ts.
  await gotoScreen(page, "Rose");
  await page.locator("#roster-slot-Io-D-0").click();
  await page.locator("#roster-slot-tab-rinnovo").click();
  await expect(page.locator("#roster-slot-renewal-locked")).toHaveCount(0);
  await expect(page.locator("#roster-slot-renewal-empty")).toHaveAttribute("data-reason", "no-history");

  expect(externalRequests).toEqual([]);
});

// Post-review fix (round 2, #285): before this fix, a throwing getItem
// scoped to ONLY the confirmations key fell through to a silent "nessuna
// riconferma" (state.confirmations = [], no banner, no blocked screen) —
// indistinguishable from a device that genuinely never had any. Pins the
// fix: this now renders its OWN full-screen block, distinct from both the
// "invalid data" blocked screen above and the log's own storage-error
// screen, and recovers once storage is usable again via the same "Riprova".
test("a throwing getItem scoped to the confirmations key alone renders its own fail-closed screen, never a silent empty batch", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  await page.addInitScript(
    ({ confirmationsKey }) => {
      const original = Storage.prototype.getItem;
      (window as unknown as { __restoreConfirmationsGetItem: () => void }).__restoreConfirmationsGetItem = () => {
        Storage.prototype.getItem = original;
      };
      Storage.prototype.getItem = function (this: Storage, key: string): string | null {
        if (key === confirmationsKey) throw new DOMException("access denied synthetic", "SecurityError");
        return original.call(this, key);
      };
    },
    { confirmationsKey: CONFIRMATIONS_STORAGE_KEY },
  );
  await page.goto("/");

  // Its own screen — never the log's "recovery richiesta" heading, never
  // silently rendering the normal app shell with an empty riconferme batch.
  const heading = page.getByRole("heading", { name: /storage delle riconferme non disponibile/i });
  await expect(heading).toBeVisible();
  await expect(page.getByRole("heading", { name: /recovery richiesta/i })).toHaveCount(0);
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Riprova lettura storage", exact: true })).toBeVisible();

  // Recovers via "Riprova" once the read works again — the log itself was
  // never touched (nothing was written while blocked), so a normal empty
  // boot follows.
  await page.evaluate(() => (window as unknown as { __restoreConfirmationsGetItem: () => void }).__restoreConfirmationsGetItem());
  await page.getByRole("button", { name: "Riprova lettura storage", exact: true }).click();
  await expect(heading).toHaveCount(0);
  await expect(page.locator("#critical-budget")).toHaveText("500 cr");

  expect(externalRequests).toEqual([]);
});

test("individually-valid confirmations and log that conflict together (audit fix 3) -> governed blocked screen, never a crash", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);

  // Each store is independently valid — this is exactly the state a
  // multi-tab race could leave behind (see PR body): a confirmations save
  // and a log save that never saw each other's write. reduce() itself
  // throws on this combination (packages/engine/src/reduce.ts, "audit fix
  // 3"); the app must degrade into a governed screen, never a raw crash.
  const confirmationsEnvelope = {
    schemaVersion: 1,
    confirmations: [{ fantaTeamId: "Io", playerId: "conflict-player", role: "D", price: 50 }],
  };
  const conflictingLog = [
    { type: "PURCHASE", seq: 0, ts: "2026-08-01T10:00:00.000Z", playerId: "conflict-player", role: "D", fantaTeamId: "Squadra2", price: 20 },
  ];

  await page.addInitScript(
    ({ confirmationsKey, confirmations, logKey, log }) => {
      window.localStorage.setItem(confirmationsKey, JSON.stringify(confirmations));
      window.localStorage.setItem(logKey, JSON.stringify(log));
    },
    { confirmationsKey: CONFIRMATIONS_STORAGE_KEY, confirmations: confirmationsEnvelope, logKey: LOG_STORAGE_KEY, log: conflictingLog },
  );
  await page.goto("/");

  // Boot's own validateAuctionLog gate catches this (reduce() throws,
  // caught by the SAME try/catch that already handles any other replay
  // failure): the canonical log is treated as invalid -> quarantined, and
  // with no last-known-good copy present -> unrecoverable -> the log's own
  // blocked screen. Never a raw JS exception reaching the page.
  const heading = page.getByRole("heading", { name: /recovery richiesta/i });
  await expect(heading).toBeVisible();
  await expect(page.getByRole("button", { name: "Registra acquisto", exact: true })).toHaveCount(0);

  expect(externalRequests).toEqual([]);
});

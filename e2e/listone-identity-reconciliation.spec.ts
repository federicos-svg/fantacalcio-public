// Audit motore round 2 (#231, commento 5292582619) — findings 1 and 3, the
// two that share one root: the auction log's `playerId` IS a
// `listonePlayerKey` of the row that was clicked, so the log's identities are
// only as stable as the pool that produced them, and NOTHING used to compare
// the two when the pool changed.
//
// The probes reproduced here are the report's own, in its notation:
//   PROBE E  — buy with the deposit unreachable, then reload with the deposit
//              serving the same players under an updated spelling: the player
//              came back free and clickable, was bought a second time, and
//              budget/slots counted twice (500 -> 450 -> 390, A 2/7).
//   PROBE M  — the derived scarcity counter went back up, counting an
//              already-bought player as still available in the listone.
//   PROBE L  — the deposit lands DURING the 4s window while the asta moment is
//              open on the selected player: the purchase was recorded with the
//              identity of the pool that had already been replaced on screen.
//   PROBE F  — a malformed manual file empties the pool, and the armed
//              selection survived it: "Avvia" stayed enabled on a player no
//              listone contains, and the purchase went through.
//
// PROBE E-CONF (post-#285 escalation) reproduces the same root cause for a
// RICONFERMA (src/confirmationsStore.ts, `state.confirmations`) instead of a
// live PURCHASE: a riconferma is never written to `state.log` (it seeds a
// team's INITIAL roster — see reduce()'s own doc comment), so the D1
// reconciliation this file otherwise covers — built against the log alone —
// could not see it at all, and a pool swap that orphaned a riconfermato
// player was applied instead of refused.
//
// PROBE E-NEG is the negative control for all of the above: the refusal is
// fail-closed, so what has to be proven is not only that it fires when
// coverage is lost, but that it does NOT fire when coverage is kept. Without
// it, a change that refuses every automatic substitution would keep the whole
// positive side of this file green while making the app unable to ever load a
// new listone.
//
// Every row here is synthetic (see fixtures/synthetic-listone.ts) and the
// network guard refuses anything but the intercepted paths.
// LE NOTE SOTTO LA TABELLA DEL LISTONE NON SONO PIÙ A SCHERMO — «nascondi i
// blocchi nello screenshot», Pico, 2026-08-29. Restano SCRITTE nel documento,
// quindi ogni pretesa sul loro CONTENUTO vale ancora parola per parola: dove
// c'era `toBeVisible()` ora c'è `toBeHidden()`, e le righe che provano la
// provenienza del dato non si toccano. La provenienza non si perde nemmeno
// per chi naviga a voce: la porta l'`aria-label` del pannello del listone
// (src/ui/views.ts), come Pico ha deciso per la provenienza della fascia.

import { expect, test } from "@playwright/test";
import type { ListonePlayer } from "../src/ui/listone.js";
import { listonePlayerKey } from "../src/ui/listone.js";
import { CONFIRMATIONS_STORAGE_KEY, CONFIRMATIONS_SCHEMA_VERSION } from "../src/confirmationsStore.js";
import { SYNTHETIC_LISTONE_POOL, E2E_TARGET_PLAYER } from "./fixtures/synthetic-listone.js";
import {
  installSyntheticNetworkGuard,
  readLocalStorageJson,
  selectStatusFilter,
  LISTONE_REMOTE_PATH,
} from "./helpers.js";

const LOG_STORAGE_KEY = "fac_log";
const PURCHASE_PRICE = 50;

/**
 * The same four synthetic players the static asset serves, with the target's
 * name spelled differently — the shape of every real listone change (a
 * corrected spelling, a different season's file, a different source): same
 * physical player, different `listonePlayerKey`, so every id already in the
 * log stops resolving.
 */
const RENAMED_TARGET: ListonePlayer = { ...E2E_TARGET_PLAYER, name: `${E2E_TARGET_PLAYER.name} Junior` };
const RENAMED_DEPOSIT_POOL: readonly ListonePlayer[] = SYNTHETIC_LISTONE_POOL.map((p) =>
  p.name === E2E_TARGET_PLAYER.name ? RENAMED_TARGET : p,
);

/**
 * The control pool for PROBE E-NEG: the same kind of change as
 * `RENAMED_DEPOSIT_POOL` — one player re-spelled, so it is unmistakably a
 * different listone and not the same file served twice — applied to a player
 * nobody bought. The single variable between the two fixtures is therefore
 * WHICH row moves: the purchased one (coverage lost, must be refused) or an
 * untouched one (coverage kept, must be applied).
 */
const BYSTANDER_PLAYER: ListonePlayer = SYNTHETIC_LISTONE_POOL[2]!;
const RENAMED_BYSTANDER: ListonePlayer = { ...BYSTANDER_PLAYER, name: `${BYSTANDER_PLAYER.name} Junior` };
const COVERING_DEPOSIT_POOL: readonly ListonePlayer[] = SYNTHETIC_LISTONE_POOL.map((p) =>
  p.name === BYSTANDER_PLAYER.name ? RENAMED_BYSTANDER : p,
);

async function buyTarget(page: import("@playwright/test").Page): Promise<void> {
  await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
  await page.getByRole("button", { name: /^Avvia/ }).click();
  await page.locator("#assign-price").fill(String(PURCHASE_PRICE));
  await page.getByRole("button", { name: "Registra acquisto", exact: true }).click();
  await expect(page.locator("#critical-budget")).toHaveText(`${500 - PURCHASE_PRICE} cr`);
}

test.describe("listone ⇄ log identity reconciliation (audit r2, findings 1 and 3)", () => {
  test("PROBE E/M: a deposit that orphans a standing purchase is refused, not applied in silence", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    // First boot: deposit unreachable, so the static asset is what the
    // purchase below is recorded against.
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
      kind: "unavailable",
    });
    await page.goto("/");
    await buyTarget(page);
    // Il contatore di scarsità sta dentro IL TAVOLO, che è sempre aperto: la
    // PROBE resta una prova di ciò che si VEDE, e la visibilità è asserita —
    // `toHaveText` da solo passerebbe anche su DOM invisibile.
    await expect(page.locator("#scarcity-pool-A")).toBeVisible();
    await expect(page.locator("#scarcity-pool-A")).toHaveText("0");

    const logAfterPurchase = await readLocalStorageJson<{ playerId: string }[]>(page, LOG_STORAGE_KEY);
    expect(logAfterPurchase).toHaveLength(1);
    expect(logAfterPurchase![0]!.playerId).toEqual(listonePlayerKey(E2E_TARGET_PLAYER));

    // Second boot: the deposit is reachable and serves the same players under
    // the updated spelling. Nothing else happens — a page reload during a
    // four-hour auction is ordinary.
    await context.unroute("**/*");
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
      kind: "serve",
      rows: RENAMED_DEPOSIT_POOL,
    });
    await page.reload();

    // The substitution is refused: the listone coherent with the standing log
    // stays on screen, and the operator is told why, in a notice that cannot
    // be dismissed.
    const notice = page.locator("#pool-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Sostituzione automatica del listone rifiutata");
    await expect(notice).toContainText(E2E_TARGET_PLAYER.name);
    await expect(page.getByText(RENAMED_TARGET.name, { exact: true })).toHaveCount(0);

    // Accounting is untouched, and the physical player is still accounted for:
    // one purchase, budget spent once, one A slot filled, still "Assegnato",
    // and the scarcity counter has NOT gone back up (PROBE M).
    await expect(page.locator("#critical-budget")).toHaveText(`${500 - PURCHASE_PRICE} cr`);
    await expect(page.locator("#critical-roster")).toContainText("1/7");
    // Il contatore di scarsità sta dentro IL TAVOLO, che è sempre aperto: la
    // PROBE resta una prova di ciò che si VEDE, e la visibilità è asserita —
    // `toHaveText` da solo passerebbe anche su DOM invisibile.
    await expect(page.locator("#scarcity-pool-A")).toBeVisible();
    await expect(page.locator("#scarcity-pool-A")).toHaveText("0");
    await selectStatusFilter(page, "assigned");
    await expect(page.locator(".listone-row", { hasText: E2E_TARGET_PLAYER.name })).toContainText("Assegnato");

    // The row cannot be armed again, so no second purchase of the same
    // physical player is reachable at all.
    await expect(page.locator(".listone-row--clickable", { hasText: E2E_TARGET_PLAYER.name })).toHaveCount(0);
    await selectStatusFilter(page, "available");
    await expect(page.locator(".listone-row", { hasText: E2E_TARGET_PLAYER.name })).toHaveCount(0);

    const logAfterReload = await readLocalStorageJson<unknown[]>(page, LOG_STORAGE_KEY);
    expect(logAfterReload).toEqual(logAfterPurchase);
    expect(externalRequests).toEqual([]);
  });

  test("PROBE E-NEG (negative control): a deposit that still covers the standing purchase is APPLIED, not refused", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    // Identical setup to PROBE E/M above, right down to the purchase: first
    // boot with the deposit unreachable, so the standing purchase is recorded
    // against the static asset's spelling.
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
      kind: "unavailable",
    });
    await page.goto("/");
    await buyTarget(page);

    const logAfterPurchase = await readLocalStorageJson<{ playerId: string }[]>(page, LOG_STORAGE_KEY);
    expect(logAfterPurchase).toHaveLength(1);
    expect(logAfterPurchase![0]!.playerId).toEqual(listonePlayerKey(E2E_TARGET_PLAYER));

    // Second boot, and here is the only difference from PROBE E/M: the deposit
    // re-spells a player nobody bought, so no standing identity stops
    // resolving. This is the ordinary case — a corrected listone arriving
    // mid-auction — and it MUST go through. A fail-closed check that cannot
    // tell this apart from the orphaning one would leave the app permanently
    // stuck on whichever listone happened to be loaded first.
    await context.unroute("**/*");
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
      kind: "serve",
      rows: COVERING_DEPOSIT_POOL,
    });
    await page.reload();

    // Applied: the deposit's rows are what the panel shows, and the note under
    // the table names the deposit as the source that actually won.
    await expect(page.getByText(RENAMED_BYSTANDER.name, { exact: true })).toBeVisible();
    await expect(page.getByText(BYSTANDER_PLAYER.name, { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Listone aggiornato automaticamente dal deposito privato/)).toBeHidden();

    // Not refused, and nothing else was announced either: no refusal, no
    // orphan clause, no spurious disarm — the notice surface is absent
    // altogether, which is the whole point of this control.
    await expect(page.locator("#pool-notice")).toHaveCount(0);

    // Accounting rides through the substitution untouched: the purchase is
    // still counted once, still resolves to a row of the NEW pool, and the
    // player is still off the available list.
    await expect(page.locator("#critical-budget")).toHaveText(`${500 - PURCHASE_PRICE} cr`);
    await expect(page.locator("#critical-roster")).toContainText("1/7");
    // Il contatore di scarsità sta dentro IL TAVOLO, che è sempre aperto: la
    // PROBE resta una prova di ciò che si VEDE, e la visibilità è asserita —
    // `toHaveText` da solo passerebbe anche su DOM invisibile.
    await expect(page.locator("#scarcity-pool-A")).toBeVisible();
    await expect(page.locator("#scarcity-pool-A")).toHaveText("0");
    await selectStatusFilter(page, "assigned");
    await expect(page.locator(".listone-row", { hasText: E2E_TARGET_PLAYER.name })).toContainText("Assegnato");
    await selectStatusFilter(page, "available");
    await expect(page.locator(".listone-row", { hasText: E2E_TARGET_PLAYER.name })).toHaveCount(0);

    const logAfterReload = await readLocalStorageJson<unknown[]>(page, LOG_STORAGE_KEY);
    expect(logAfterReload).toEqual(logAfterPurchase);
    expect(externalRequests).toEqual([]);
  });

  test("PROBE E-CONF (post-#285 escalation): a deposit that orphans a standing RICONFERMA is refused, exactly like a standing purchase", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    // Seed a riconferma for the target player BEFORE boot, via the
    // confirmations store (src/confirmationsStore.ts) — never the log. This
    // is the regression case the escalation describes: a riconferma is not
    // an AuctionEvent (see reduce()'s own doc comment), so the log stays
    // empty for the whole test and the standing-purchase reconciliation
    // this file otherwise covers cannot see it unless it also reads
    // `state.confirmations`.
    const confirmationsEnvelope = {
      schemaVersion: CONFIRMATIONS_SCHEMA_VERSION,
      confirmations: [
        {
          fantaTeamId: "Io",
          playerId: listonePlayerKey(E2E_TARGET_PLAYER),
          role: E2E_TARGET_PLAYER.role,
          price: PURCHASE_PRICE,
        },
      ],
    };
    await page.addInitScript(
      ({ key, envelope }) => {
        window.localStorage.setItem(key, JSON.stringify(envelope));
      },
      { key: CONFIRMATIONS_STORAGE_KEY, envelope: confirmationsEnvelope },
    );

    // First boot: deposit unreachable, so the riconferma resolves against
    // the static asset's spelling. No purchase, no call, no log entry.
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
      kind: "unavailable",
    });
    await page.goto("/");
    await expect(page.locator("#critical-budget")).toHaveText(`${500 - PURCHASE_PRICE} cr`);
    expect(await readLocalStorageJson(page, LOG_STORAGE_KEY)).toBeNull();

    // Second boot: the deposit is reachable and serves the same players
    // under the updated spelling — same reload-during-a-live-auction shape
    // as PROBE E/M above, this time with nothing in the log to detect it:
    // only `standingPurchasedPlayerIds()` reading `state.confirmations` too
    // can catch this one.
    await context.unroute("**/*");
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
      kind: "serve",
      rows: RENAMED_DEPOSIT_POOL,
    });
    await page.reload();

    // Refused exactly like a standing purchase would be: the listone
    // coherent with the standing riconferma stays on screen, and the
    // operator is told why, in a notice that cannot be dismissed.
    const notice = page.locator("#pool-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Sostituzione automatica del listone rifiutata");
    await expect(notice).toContainText(E2E_TARGET_PLAYER.name);
    await expect(page.getByText(RENAMED_TARGET.name, { exact: true })).toHaveCount(0);

    // The riconfermato is still accounted for: budget unchanged, still
    // "Assegnato", and not reachable as a fresh purchase under either
    // spelling — a riconferma orphaned by the swap would otherwise come
    // back free and clickable, exactly like an orphaned purchase would.
    await expect(page.locator("#critical-budget")).toHaveText(`${500 - PURCHASE_PRICE} cr`);
    await selectStatusFilter(page, "assigned");
    await expect(page.locator(".listone-row", { hasText: E2E_TARGET_PLAYER.name })).toContainText("Assegnato");
    await selectStatusFilter(page, "available");
    await expect(page.locator(".listone-row", { hasText: E2E_TARGET_PLAYER.name })).toHaveCount(0);

    // The whole scenario stayed a riconferma end to end: no PURCHASE ever
    // entered the log, and the confirmations store itself is untouched by
    // the refused swap.
    expect(await readLocalStorageJson(page, LOG_STORAGE_KEY)).toBeNull();
    const storedConfirmations = await readLocalStorageJson<typeof confirmationsEnvelope>(
      page,
      CONFIRMATIONS_STORAGE_KEY,
    );
    expect(storedConfirmations).toEqual(confirmationsEnvelope);
    expect(externalRequests).toEqual([]);
  });

  test("PROBE E: the refusal is not a lock-in — 'Dimentica listone' still substitutes, and says what it costs", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
      kind: "unavailable",
    });
    await page.goto("/");
    await buyTarget(page);

    await context.unroute("**/*");
    await installSyntheticNetworkGuard(context, RENAMED_DEPOSIT_POOL, externalRequests, {
      kind: "serve",
      rows: RENAMED_DEPOSIT_POOL,
    });
    await page.reload();
    await expect(page.locator("#pool-notice")).toContainText("Sostituzione automatica del listone rifiutata");

    // The explicit way out the notice names: it empties the pool, so there is
    // nothing left to orphan and the incoming listone applies.
    await page.getByRole("button", { name: /Caricamento manuale/ }).click();
    // `exact` because the notice above names this very affordance.
    await page.getByText("✕ dimentica il listone salvato", { exact: true }).click();

    await expect(page.getByText(RENAMED_TARGET.name, { exact: true })).toBeVisible();
    // ...and the consequence is stated instead of being discovered later: the
    // standing purchase no longer matches any row of the listone on screen.
    const notice = page.locator("#pool-notice");
    await expect(notice).toContainText("1 acquisto dello storico non corrisponde");
    await expect(notice).toContainText("budget e slot verrebbero contati due volte");

    // The orphan clause is derived, not stored: voiding the purchase it talks
    // about makes it true of nothing, so it stops being shown — a warning that
    // outlived its subject would be its own defect.
    await page.locator("#undo-purchase-0").click();
    await page.locator("#void-confirm-apply").click();
    await expect(page.locator("#pool-notice")).toHaveCount(0);
    await expect(page.locator("#critical-budget")).toHaveText("500 cr");
    expect(externalRequests).toEqual([]);
  });

  test("PROBE L: a deposit landing while the asta moment is open disarms the selection instead of recording a stale identity", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests, {
      kind: "unavailable",
    });
    // The deposit answers late but well inside the app's 4s window — the
    // situation the probe reproduced: it lands with the asta moment already
    // open on the selected player. Registered AFTER the guard so it wins for
    // this path (Playwright matches the most recently added route first).
    await context.route(`**${LISTONE_REMOTE_PATH}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(RENAMED_DEPOSIT_POOL),
      });
    });
    await page.goto("/");

    // Arm the call on the static asset's row and open the asta moment BEFORE
    // the deposit lands.
    await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
    await page.getByRole("button", { name: /^Avvia/ }).click();
    await expect(page.locator("#assign-price")).toBeVisible();

    // The deposit lands: its rows are what the listone shows now.
    await expect(page.getByText(RENAMED_TARGET.name, { exact: true })).toBeVisible({ timeout: 10_000 });

    // Back to the call moment, with the reason stated: the assignment form is
    // gone, so no purchase can be recorded against an identity the listone on
    // screen no longer contains.
    await expect(page.locator("#assign-price")).toHaveCount(0);
    await expect(page.locator("#pool-notice")).toContainText("Selezione annullata");
    await expect(page.getByRole("button", { name: /^Avvia/ })).toBeDisabled();
    expect(await readLocalStorageJson(page, LOG_STORAGE_KEY)).toBeNull();
    expect(externalRequests).toEqual([]);
  });

  test("PROBE F: a malformed manual file empties the pool AND disarms the selection", async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];
    await installSyntheticNetworkGuard(context, SYNTHETIC_LISTONE_POOL, externalRequests);
    await page.goto("/");

    // Armed exactly as the probe had it: the row is selected, "Avvia" is
    // enabled, and the operator then loads the wrong file.
    await page.getByText(E2E_TARGET_PLAYER.name, { exact: true }).click();
    await expect(page.getByRole("button", { name: /^Avvia/ })).toBeEnabled();

    await page.getByRole("button", { name: /Caricamento manuale/ }).click();
    await page.getByText("Carica listone (JSON locale)").locator("input[type=file]").setInputFiles({
      name: "malformed.json",
      mimeType: "application/json",
      buffer: Buffer.from("{not json"),
    });

    // The pool is wiped and the error is visible — and, unlike the probe, the
    // CTA is no longer armed on a player no listone contains, so no purchase
    // can be recorded against an identity nothing on screen can ever show
    // again as "Assegnato".
    await expect(page.getByText("File non valido: non è JSON leggibile.")).toBeVisible();
    await expect(page.getByText("Nessun listone caricato al momento.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Avvia/ })).toBeDisabled();
    await expect(page.locator("#pool-notice")).toContainText("Selezione annullata");
    expect(await readLocalStorageJson(page, LOG_STORAGE_KEY)).toBeNull();
    expect(externalRequests).toEqual([]);
  });
});

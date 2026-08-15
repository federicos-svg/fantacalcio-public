// BUNDLE-01 Part 2 in the browser: the hash the packaging pipeline wrote is
// the hash the running app computes — and a bundle whose hash does not match
// never reaches the auction.
//
// The bundle and the manifest served here are produced by the REAL build-time
// builder (packages/xlsx-adapter/src/listoneLiveBundle.ts, node:crypto
// `createHash`), and verified in the page by `crypto.subtle.digest`. Two
// different implementations of SHA-256, on the same bytes, agreeing — that is
// the compatibility evidence the acceptance asks for, taken end to end rather
// than asserted between two functions.
//
// Service workers are blocked in this file on purpose: the integrity gate lives
// in the page, and a cache in the middle would only add a variable. The worker
// has its own spec (e2e/offline-cold-start.spec.ts), where it is the subject.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { buildListoneLiveBundle } from "../packages/xlsx-adapter/src/listoneLiveBundle.js";
import { createHash } from "node:crypto";

test.use({ serviceWorkers: "block" });

const ASSET_PATH = "/data/listone_2025_26.json";
const MANIFEST_PATH = "/data/listone_2025_26.manifest.json";
const POLICY_PATH = "/app-integrity.json";

// Accented on purpose (see src/offline/bundleIntegrity.test.ts for the full
// reasoning): node's `createHash(...).update(text, "utf8")` at build time and
// `crypto.subtle.digest` over the served bytes in the browser agree trivially
// on ASCII. If either side re-encoded the payload, these rows would diverge —
// and this is an Italian listone, where accents are the normal case.
const ROWS = [
  { name: "Niccolò Barattù", role: "P", club: "Città Sintetica", quotation: 5 },
  { name: "Beatrice Fittizià", role: "D", club: "Müller Straße", quotation: 8 },
  { name: "François Père", role: "C", club: "ClubTré", quotation: 12 },
  { name: "Dario 𝔘nicode", role: "A", club: "ClubQuattro", quotation: 20 },
] as const;

const CANDIDATE_TEXT = JSON.stringify(ROWS, null, 2) + "\n";

/** The real packaging output: bundle bytes + the manifest that declares them. */
const BUILT = buildListoneLiveBundle({
  candidateText: CANDIDATE_TEXT,
  validatedRows: ROWS,
  builderCommit: "a".repeat(40),
  candidateManifest: {
    source_id: "fantacalcio_xlsx",
    season: "2026_27",
    raw_sha256: "b".repeat(64),
    transform_version: "listone-xlsx-v2",
    schema_version: "listone-candidate-wire-v1",
    candidate_sha256: createHash("sha256").update(CANDIDATE_TEXT, "utf8").digest("hex"),
    total_records: ROWS.length,
    role_counts: { P: 1, D: 1, C: 1, A: 1 },
    validation_outcome: "ok",
    collision_check_outcome: "COLLISION_CHECK_PASS",
    in_process_repeatability: "PASS",
    cross_process_determinism: "PASS",
    parser_commit: "c".repeat(40),
    gates: {
      data_promoted: false,
      canonical_promoted: false,
      decision_promoted: false,
      fair_to_me_promoted: false,
      live_ui_ready: false,
    },
  },
});

interface RouteOptions {
  /** Body served for the bundle. Defaults to the builder's own bytes. */
  readonly bundleText?: string;
  /** Manifest body, or `null` to serve none (404). Defaults to the builder's. */
  readonly manifestText?: string | null;
  /**
   * `null` serves no integrity policy at all (404 — a broken artifact).
   * `"hang"` accepts the request and never answers it, which is the captive
   * portal at boot: a different failure, and a different instruction.
   */
  readonly policy?: null | "hang";
}

/**
 * Same posture as the suite's shared guard — same-origin passes through,
 * anything external is recorded and aborted — plus the two payloads this spec
 * is about. The policy is rewritten (not replaced) so `manifestRequired` is
 * true: today's build ships no manifest, and this spec is about the packaged
 * bundle that will.
 */
async function installBundleRoutes(
  context: BrowserContext,
  externalRequests: string[],
  options: RouteOptions = {},
): Promise<void> {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === POLICY_PATH) {
      if (options.policy === null) {
        return route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not_found"}' });
      }
      if (options.policy === "hang") {
        // Accepted and never answered. No fulfill, no abort — the request just
        // stays pending, exactly like a hall portal that swallows traffic.
        return;
      }
      const response = await route.fetch();
      const policy = (await response.json()) as {
        data: Array<{ url: string; manifestUrl: string; manifestRequired: boolean }>;
      };
      const patched = {
        ...policy,
        data: policy.data.map((entry) =>
          entry.url === ASSET_PATH ? { ...entry, manifestRequired: true } : entry,
        ),
      };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(patched) });
    }

    if (url.pathname === ASSET_PATH) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: options.bundleText ?? BUILT.bundleText,
      });
    }

    if (url.pathname === MANIFEST_PATH) {
      const manifestText = options.manifestText === undefined ? BUILT.bundleManifestText : options.manifestText;
      if (manifestText === null) {
        return route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not_found"}' });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: manifestText });
    }

    if (url.pathname === "/api/listone") {
      return route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not_found"}' });
    }

    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
    externalRequests.push(route.request().url());
    return route.abort("blockedbyclient");
  });
}

function integrityStatus(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute("data-fac-bundle-integrity"));
}

const blockingScreen = (page: Page) => page.locator("#bundle-integrity-blocked");

test.describe("BUNDLE-01 — runtime hash verification", () => {
  test("a bundle whose sha256 matches its manifest is verified and loaded", async ({ page, context }) => {
    const externalRequests: string[] = [];
    await installBundleRoutes(context, externalRequests);
    await page.goto("/");

    for (const row of ROWS) {
      await expect(page.getByText(row.name, { exact: true })).toBeVisible();
    }
    await expect(blockingScreen(page)).toHaveCount(0);
    await expect.poll(() => integrityStatus(page)).toBe("verified");

    // The app is fully operational on the verified bundle.
    await expect(page.locator("#critical-budget")).toHaveText("500 cr");
    expect(externalRequests).toEqual([]);
  });

  test("the hash the browser computes is the one the builder wrote", async ({ page, context }) => {
    // Explicit, independent restatement of the compatibility claim: WebCrypto
    // in the page, over the exact bytes served, equals `bundle_sha256`.
    const externalRequests: string[] = [];
    await installBundleRoutes(context, externalRequests);
    await page.goto("/");
    await expect.poll(() => integrityStatus(page)).toBe("verified");

    const inBrowser = await page.evaluate(async (assetPath) => {
      const bytes = await (await fetch(assetPath)).arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }, ASSET_PATH);

    expect(inBrowser).toBe(BUILT.bundleManifest.bundle_sha256);
    expect(inBrowser).toBe(createHash("sha256").update(BUILT.bundleText, "utf8").digest("hex"));
  });

  test("a divergent hash blocks the app, names both hashes, and loads nothing", async ({ page, context }) => {
    const externalRequests: string[] = [];
    // One ACCENT different, identical UTF-8 byte length: the size check cannot
    // catch it, so this really exercises the digest in the browser.
    const tampered = BUILT.bundleText.replace("Niccolò", "Niccolà");
    expect(tampered).not.toBe(BUILT.bundleText);
    await installBundleRoutes(context, externalRequests, { bundleText: tampered });
    await page.goto("/");

    await expect(blockingScreen(page)).toBeVisible();
    await expect(blockingScreen(page)).toHaveAttribute("data-integrity-code", "hash-mismatch");
    const detail = await page.locator("#bundle-integrity-detail").innerText();
    expect(detail).toContain(BUILT.bundleManifest.bundle_sha256);
    expect(detail).toContain(createHash("sha256").update(tampered, "utf8").digest("hex"));
    expect(detail).toContain(ASSET_PATH);

    // Fail-closed: neither the tampered row nor the original one was loaded,
    // and nothing was written to the local pool copy.
    await expect(page.getByText("Niccolà Barattù", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem("fac_pool"))).toBeNull();
    expect(await integrityStatus(page)).toBe("failed");
    expect(externalRequests).toEqual([]);
  });

  test("a missing manifest blocks a bundle the build packaged one for", async ({ page, context }) => {
    const externalRequests: string[] = [];
    await installBundleRoutes(context, externalRequests, { manifestText: null });
    await page.goto("/");

    await expect(blockingScreen(page)).toBeVisible();
    await expect(blockingScreen(page)).toHaveAttribute("data-integrity-code", "manifest-absent");
    expect(await page.evaluate(() => window.localStorage.getItem("fac_pool"))).toBeNull();
    expect(externalRequests).toEqual([]);
  });

  test("a malformed manifest blocks the app", async ({ page, context }) => {
    const externalRequests: string[] = [];
    await installBundleRoutes(context, externalRequests, { manifestText: '{"manifest_version":"nope"}' });
    await page.goto("/");

    await expect(blockingScreen(page)).toBeVisible();
    await expect(blockingScreen(page)).toHaveAttribute("data-integrity-code", "manifest-malformed");
    expect(externalRequests).toEqual([]);
  });

  test("a manifest that declares a gate ON is refused outright", async ({ page, context }) => {
    const externalRequests: string[] = [];
    const withGateOn = JSON.stringify({
      ...BUILT.bundleManifest,
      gates: { ...BUILT.bundleManifest.gates, live_ui_ready: true },
    });
    await installBundleRoutes(context, externalRequests, { manifestText: withGateOn });
    await page.goto("/");

    await expect(blockingScreen(page)).toBeVisible();
    await expect(blockingScreen(page)).toHaveAttribute("data-integrity-code", "gate-declared-on");
    expect(externalRequests).toEqual([]);
  });

  test("a production build that serves no integrity policy refuses every data payload", async ({ page, context }) => {
    const externalRequests: string[] = [];
    await installBundleRoutes(context, externalRequests, { policy: null });
    await page.goto("/");

    await expect(blockingScreen(page)).toBeVisible();
    await expect(blockingScreen(page)).toHaveAttribute("data-integrity-code", "integrity-policy-unusable");
    expect(await page.evaluate(() => window.localStorage.getItem("fac_pool"))).toBeNull();
    expect(externalRequests).toEqual([]);
  });

  test("a network that swallows the policy blocks the app WITHOUT telling anyone to rebuild it", async ({
    page,
    context,
  }) => {
    // The captive portal at boot, and the one case where the screen used to
    // contradict itself: the detail paragraph correctly said «ricarica appena la
    // rete risponde, oppure disconnettiti — da offline l'app riparte dalla copia
    // in cache», and the paragraph under it added «Ricostruisci o riscarica il
    // bundle e il suo manifest». Nothing was ever hashed here, so there is no
    // artifact to rebuild — and at the auction table nobody could rebuild one
    // anyway. Reproduced live in review; this is the guard.
    const externalRequests: string[] = [];
    await installBundleRoutes(context, externalRequests, { policy: "hang" });
    await page.goto("/");

    // ~5s: POLICY_FETCH_ATTEMPTS attempts of POLICY_FETCH_TIMEOUT_MS each.
    await expect(blockingScreen(page)).toBeVisible({ timeout: 15_000 });
    await expect(blockingScreen(page)).toHaveAttribute("data-integrity-code", "integrity-policy-unreachable");

    // The remedy that IS right for this failure is on screen...
    const detail = await page.locator("#bundle-integrity-detail").innerText();
    expect(detail).toContain("appena la rete risponde");
    // ...and the one that is wrong for it is nowhere on the screen at all.
    const screenText = await blockingScreen(page).innerText();
    expect(screenText).not.toContain("Ricostruisci");
    expect(screenText).not.toContain("riscarica il bundle");
    await expect(page.locator("#bundle-integrity-next-steps")).toHaveCount(0);

    // Fail-closed is untouched: still a block, still nothing loaded.
    expect(await page.evaluate(() => window.localStorage.getItem("fac_pool"))).toBeNull();
    expect(await integrityStatus(page)).toBe("failed");
    expect(externalRequests).toEqual([]);
  });

  test("a broken artifact still says how to fix the artifact", async ({ page, context }) => {
    // The other side of the same rule, so the fix cannot be "delete the advice":
    // a hash that does not match IS an artifact problem, and the screen must
    // still say what to do about it.
    const externalRequests: string[] = [];
    const tampered = BUILT.bundleText.replace("Niccolò", "Niccolà");
    await installBundleRoutes(context, externalRequests, { bundleText: tampered });
    await page.goto("/");

    await expect(blockingScreen(page)).toBeVisible();
    await expect(blockingScreen(page)).toHaveAttribute("data-integrity-code", "hash-mismatch");
    await expect(page.locator("#bundle-integrity-next-steps")).toContainText("Ricostruisci o riscarica il bundle");
  });

  test("the shipped build, which packages no manifest yet, loads exactly as before", async ({ page, context }) => {
    // The non-regression half of the contract: with the real, unpatched policy
    // (`manifestRequired: false`) the app is unchanged — no block, no missing
    // rows — and the state is recorded as unverified rather than presented as
    // checked.
    const externalRequests: string[] = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/listone") {
        return route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not_found"}' });
      }
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
      externalRequests.push(route.request().url());
      return route.abort("blockedbyclient");
    });
    await page.goto("/");

    await expect(page.locator("#critical-budget")).toHaveText("500 cr");
    await expect(page.getByText("Aldo Prova", { exact: true })).toBeVisible(); // the real shipped asset
    await expect(blockingScreen(page)).toHaveCount(0);
    await expect.poll(() => integrityStatus(page)).toBe("unverified");
    expect(externalRequests).toEqual([]);
  });
});

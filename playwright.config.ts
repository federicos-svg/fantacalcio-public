import { defineConfig, devices } from "@playwright/test";
import { resolveE2ePort } from "./scripts/lib/e2ePreviewServer.js";

// Deterministic port for the Vite *preview* server this suite drives — never
// the dev server, so E2E always exercises the same static build CI and
// Cloudflare Pages ship (see CI-01, docs/AUCTION_2026_EXECUTION_PLAN.md
// TEST-HARNESS-01). --strictPort fails the run fast on a port collision
// instead of silently binding elsewhere and drifting from baseURL.
//
// The port is no longer HARDCODED, only DEFAULTED: `E2E_PORT` moves it, and
// with it `baseURL`, the readiness url and the preview command — one constant,
// no second copy anywhere in the suite (a spec that needs the origin takes the
// `baseURL` fixture, see e2e/critical-readability.spec.ts). The default stays
// 4173, so `npm run test:e2e`, the documented commands and
// .github/workflows/ci.yml keep working literally unchanged.
//
// Why it had to become movable: several worktrees of this repository run in
// parallel on the same machine (delegated workers, rehearsals, file-disjoint
// corsie), and a hardcoded port plus `reuseExistingServer: true` made one of
// them silently test ANOTHER tree's build and report green. `E2E_PORT` is the
// way out of the collision; `globalSetup` below is what makes the collision
// impossible to ignore when it happens anyway.
const PORT = resolveE2ePort(process.env);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Identity check of whatever is serving BASE_URL, run once before the first
  // test: same tree -> proceed (and say so), foreign tree -> stop the run with
  // an explicit error. This is the guard that makes `reuseExistingServer`
  // below safe to keep: reuse stays available (the CI job depends on it — it
  // starts the preview server itself as an explicit, diagnosable step), but a
  // reused server can no longer pass itself off as this tree's.
  globalSetup: "./e2e/harness/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    // Diagnostics only on failure — a green run produces no trace/screenshot
    // (video stays off entirely: not needed for this suite, one more
    // artifact kind avoided).
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // Opt-in override for environments where Playwright's own browser-path
    // resolution (PLAYWRIGHT_BROWSERS_PATH) doesn't contain a revision
    // matching this pinned @playwright/test version — e.g. a sandbox with a
    // pre-provisioned Chromium at a fixed path. Unset in CI and on a normal
    // dev machine, where `npx playwright install chromium` (see
    // .github/workflows/ci.yml) provides the matching revision normally.
    ...(process.env.E2E_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE } }
      : {}),
  },
  // Chromium-only per TEST-HARNESS-01 scope — no Firefox/WebKit projects.
  //
  // DUE PROGETTI, NON DUE BROWSER. Il secondo è lo STESSO Chromium con lo
  // schermo di un telefono, e non gira l'intera suite: `testMatch` lo lega a un
  // file solo. La ragione è che il costo va speso dove serve — la pagina
  // Formazione disegna undici gettoni più la panchina, ed è la schermata che
  // esce dallo schermo in verticale se qualcuno le mette accanto una colonna in
  // più — mentre far girare 270 prove due volte pagherebbe a ogni push un
  // controllo che quelle prove non fanno.
  //
  // `Pixel 5` e non un `viewport` scritto a mano: porta con sé il rapporto di
  // pixel, il tocco e la stringa d'agente di un telefono vero, cioè le
  // condizioni in cui la pagina viene guardata davvero. Un `viewport` stretto su
  // un desktop proverebbe una cosa che somiglia al telefono senza esserlo.
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /telefono\.spec\.ts/,
    },
    {
      name: "telefono",
      use: { ...devices["Pixel 5"] },
      testMatch: /telefono\.spec\.ts/,
    },
  ],
  webServer: {
    // Portable across Linux CI and Windows: plain npm-script chaining via
    // `&&`, no POSIX-only shell syntax, no external process manager.
    // --host 127.0.0.1 explicit, not Vite's bare default: the CI runner's
    // "preview server never becomes ready" failures (see the timeout/hang
    // history below) traced back to this — `vite preview` printed its ready
    // banner and kept running the whole time, but nothing was listening on
    // the literal 127.0.0.1 this config/CI probe both target, on that
    // runner's dual-stack loopback. Forcing the same explicit address on
    // both the server and every probe removes the ambiguity.
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    // Always true, not just locally: in CI the workflow starts+readiness-
    // polls the preview server itself as an explicit, diagnosable step
    // (.github/workflows/ci.yml) — decoupled from Playwright's own spawn
    // management, whose stdio handling proved unreliable there (see the
    // "stdout"/"stderr" note below). When that server is already responding
    // at `url`, Playwright reuses it and never re-spawns here at all. On a
    // clean local run with nothing listening yet, this command still spawns
    // it exactly as before.
    //
    // Reuse is kept — removing it would break the CI job above and take away
    // a legitimate local workflow (`npm run preview` in one terminal, the
    // suite in another). What changed is that it is no longer BLIND: the
    // `globalSetup` declared at the top of this config verifies that whatever
    // answers at `url` is serving THIS tree's `dist/`, and stops the run with
    // an explicit error when it is not. Reuse of your own server: unchanged.
    // Reuse of somebody else's: now impossible to do quietly.
    reuseExistingServer: true,
    // 120s, not 60s: a cold CI runner doing `vite build` + `vite preview`
    // back-to-back needs real headroom beyond a warm local re-run.
    timeout: 120_000,
    // Stream the build/preview server's own output locally for diagnostics
    // (useful when iterating on this config). Deliberately NOT "pipe" in CI:
    // a run with this set to "pipe" on GitHub Actions hung indefinitely past
    // every configured timeout on the `E2E` step (the underlying `npm run
    // preview` process tree never released the piped stdout descriptor,
    // which keeps a GitHub Actions step "in_progress" forever even after
    // Playwright itself would have moved on) — a real, observed failure
    // mode, not a hypothetical one. Default "ignore" avoids it; on failure,
    // the uploaded HTML report / trace still carry the real diagnostics.
    stdout: process.env.CI ? "ignore" : "pipe",
    stderr: process.env.CI ? "ignore" : "pipe",
  },
});

// The single import BUNDLE-01 adds to src/main.ts.
//
// Import order is the mechanism, not a detail: an ES module's imports are
// evaluated before the importing module's own body, so putting this file first
// in main.ts means the fetch gate is installed and the service worker
// registration is under way BEFORE `autoLoadListonePool()` — the app's first
// network call — exists, let alone runs. That is what makes the gate
// unbypassable without a single line of coupling inside the loader.
//
// Everything here is wiring: the decisions live in integrityGate.ts (what to
// verify), bundleIntegrity.ts (how), integrityScreen.ts (how the refusal is
// shown), serviceWorkerRegistration.ts (the offline shell). This file only
// connects them to the real browser objects, and does nothing at all outside a
// browser (so importing it from a Node test is inert).

import { createIntegrityGate } from "./integrityGate.js";
import { setIntegrityStatus, showIntegrityBlockingScreen } from "./integrityScreen.js";
import { registerServiceWorker } from "./serviceWorkerRegistration.js";

function bootOfflineLayer(): void {
  const originalFetch = window.fetch.bind(window);

  const gate = createIntegrityGate({
    fetchImpl: originalFetch,
    origin: window.location.origin,
    // Undefined outside a secure context (plain http on a non-localhost host).
    // Passed through as null on purpose: bundleIntegrity.ts treats a missing
    // digest as a failure, never as a reason to skip the check.
    digest: window.crypto?.subtle ?? null,
    // A dev server (`npm run dev`) ships no built integrity policy and must
    // stay usable; a production build that is missing one is a broken artifact.
    productionBuild: import.meta.env.PROD,
    onStatus: (status) => setIntegrityStatus(document, status),
    onFailure: (report) => showIntegrityBlockingScreen(document, report),
  });

  window.fetch = gate.fetch as typeof window.fetch;

  // Registration is deliberately NOT awaited and deliberately not followed by
  // an automatic reload on `controllerchange`: a page that reloads itself
  // because a new worker took over is a page that can reload itself in the
  // middle of an auction. Freshness is handled where it costs nothing instead —
  // navigations are network-first inside the worker (src/offline/swPolicy.ts).
  void registerServiceWorker(navigator.serviceWorker ?? null);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  bootOfflineLayer();
}

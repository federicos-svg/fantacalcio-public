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
import {
  createNetworkTruth,
  isNetworkTruthMessage,
  NETWORK_TRUTH_QUERY,
  type NetworkTruth,
} from "./networkTruth.js";
import { registerServiceWorker } from "./serviceWorkerRegistration.js";

/**
 * Connects the service worker's observations to the app's own connectivity
 * state. The app reads `navigator.onLine` and listens for the standard
 * `online`/`offline` window events (src/main.ts); this dispatches those events
 * when the worker proves the flag wrong, so the correction needs no change to
 * the app's state handling — only better inputs to it.
 */
function connectNetworkTruth(truth: NetworkTruth): void {
  const container = navigator.serviceWorker;
  if (!container) return;

  container.addEventListener("message", (event: MessageEvent) => {
    if (!isNetworkTruthMessage(event.data)) return;
    if (event.data.reachable) truth.observeReachable(event.data.url);
    else truth.observeUnreachable(event.data.url);
  });

  // A cold start's earliest failures happen before this document exists, so the
  // page asks for the verdict instead of assuming silence means success. Asked
  // once the worker is actually controlling us, which is also when it can
  // answer.
  void container.ready
    .then(() => container.controller?.postMessage({ type: NETWORK_TRUTH_QUERY }))
    .catch(() => undefined);
  container.addEventListener("controllerchange", () => {
    container.controller?.postMessage({ type: NETWORK_TRUTH_QUERY });
  });
}

function bootOfflineLayer(): void {
  const originalFetch = window.fetch.bind(window);

  const networkTruth = createNetworkTruth({
    dispatch: (event) => window.dispatchEvent(new Event(event)),
    isBrowserOnline: () => navigator.onLine,
  });

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
    // The gate is the OTHER witness of the same fact — but only while no
    // service worker is controlling this page.
    //
    // Once a worker is in the middle, what the page observes stops being
    // evidence about the NETWORK: a response served from Cache Storage after
    // the worker's own fetch timed out is indistinguishable, from here, from a
    // network that answered. Measured, not assumed — the first version of this
    // wiring reported `offline` from the worker at 4066 ms and then took it
    // straight back at 4090 ms, because the cached listone the worker had just
    // substituted arrived here looking like a success.
    //
    // So the rule is single-authority: with a controller, only the worker's own
    // observations count; without one (a first visit, or a browser where
    // registration failed), the gate is the only witness there is.
    onNetworkObservation: (reachable, url) => {
      if (navigator.serviceWorker?.controller) return;
      if (reachable) networkTruth.observeReachable(url);
      else networkTruth.observeUnreachable(url);
    },
    onFailure: (report) => showIntegrityBlockingScreen(document, report),
  });

  window.fetch = gate.fetch as typeof window.fetch;

  // Registration is deliberately NOT awaited and deliberately not followed by
  // an automatic reload on `controllerchange`: a page that reloads itself
  // because a new worker took over is a page that can reload itself in the
  // middle of an auction. Freshness is handled where it costs nothing instead —
  // navigations are network-first inside the worker (src/offline/swPolicy.ts).
  connectNetworkTruth(networkTruth);
  void registerServiceWorker(navigator.serviceWorker ?? null);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  bootOfflineLayer();
}

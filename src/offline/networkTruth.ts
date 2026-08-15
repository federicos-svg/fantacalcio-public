// What "offline" actually means, decided from evidence instead of from a
// browser flag that is allowed to be optimistic.
//
// The app derives its connectivity state from `navigator.onLine` plus the
// window `online`/`offline` events (src/main.ts). That flag answers a narrower
// question than the one an auction needs: it says whether the device believes
// it has a network interface, NOT whether this app's requests are being
// answered. The two come apart in exactly the situation this whole batch is
// about — a hotel/hall captive portal, or a saturated hotspot, accepts the
// connection and never replies. Measured, not assumed: with the browser context
// fully online and every request left pending, `navigator.onLine` stays `true`
// and the app reports «CLIENT LOCALE — Core locale pronto; nessun backend
// richiesto» while nothing at all can be fetched. That screen is a lie at the
// exact moment its truth matters most.
//
// The evidence needed to do better already exists inside this layer: the
// service worker sees every request it handles fail, time out, or succeed. This
// module turns those observations into the SAME signal the app already listens
// for — the standard `offline`/`online` window events — so the fix needs no
// change to the app's own state handling, only better inputs to it.
//
// Two rules keep this conservative, and they are the reason it cannot make the
// state worse than the flag alone:
//
//  1. it only ever CORRECTS an optimistic browser. When the browser already
//     says offline, there is nothing to add;
//  2. it only takes back its OWN claim. `online` is dispatched exclusively to
//     undo an offline this module itself asserted — never to override a browser
//     that is reporting a genuine outage.

/** Message names on the service-worker ⇄ page channel. Kept as literals shared
 *  by both sides; sw.ts cannot import types from a module the app also pulls
 *  in, so the shapes below are the contract. */
export const NETWORK_TRUTH_MESSAGE = "fac-network-truth";
export const NETWORK_TRUTH_QUERY = "fac-network-truth-query";

/** What the worker reports after handling a request. */
export interface NetworkTruthMessage {
  readonly type: typeof NETWORK_TRUTH_MESSAGE;
  /** false = the origin did not answer (rejection or timeout); true = it did. */
  readonly reachable: boolean;
  /** The path that produced the observation — diagnostics only. */
  readonly url: string;
}

export function isNetworkTruthMessage(value: unknown): value is NetworkTruthMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === NETWORK_TRUTH_MESSAGE &&
    typeof message.reachable === "boolean" &&
    typeof message.url === "string"
  );
}

export interface NetworkTruthDeps {
  /** Dispatches a standard connectivity event on the window. */
  readonly dispatch: (event: "online" | "offline") => void;
  /** The browser's own opinion, read fresh at every decision. */
  readonly isBrowserOnline: () => boolean;
}

export interface NetworkTruth {
  /** The origin failed to answer a request (rejection or timeout). */
  readonly observeUnreachable: (url: string) => void;
  /** The origin answered a request from the network. */
  readonly observeReachable: (url: string) => void;
  /** True while this module is the reason the app considers itself offline. */
  readonly hasClaimedOffline: () => boolean;
}

export function createNetworkTruth(deps: NetworkTruthDeps): NetworkTruth {
  let claimedOffline = false;

  return {
    observeUnreachable: () => {
      // Nothing to correct if the browser is already telling the truth: the app
      // is offline by its own reckoning and has already reacted.
      if (!deps.isBrowserOnline()) return;
      if (claimedOffline) return;
      claimedOffline = true;
      deps.dispatch("offline");
    },
    observeReachable: () => {
      // Only ever takes back what this module itself asserted. If the offline
      // state came from the browser, only the browser gets to end it.
      if (!claimedOffline) return;
      claimedOffline = false;
      // A browser that has meanwhile gone offline for real must not be
      // contradicted on the way out either.
      if (!deps.isBrowserOnline()) return;
      deps.dispatch("online");
    },
    hasClaimedOffline: () => claimedOffline,
  };
}

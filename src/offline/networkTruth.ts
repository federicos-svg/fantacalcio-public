// What "offline" actually means, decided from evidence instead of from a
// browser flag that is allowed to be optimistic — in BOTH directions.
//
// The app derives its connectivity state from `navigator.onLine` plus the
// window `online`/`offline` events (src/main.ts). That flag answers a narrower
// question than the one an auction needs: it says whether the device believes
// it has a network interface, NOT whether this app's requests are being
// answered. Measured, not assumed:
//
//  - a hall captive portal, with the browser context fully ONLINE and every
//    request accepted and never answered, leaves `navigator.onLine === true`
//    while nothing can be fetched;
//  - and the symmetric one, which is why this module also owns the way BACK:
//    reconnecting to a network that only serves a login page fires a real
//    `online` event, and the app used to declare «Core locale pronto» on the
//    spot — no request attempted, no verification, and no second chance,
//    because nothing in this app re-checks connectivity on its own.
//
// So the browser's two announcements are treated very differently, and
// deliberately so:
//
//  - `offline` is TRUSTED and passes straight through. The browser saying "no
//    interface" is conclusive; there is nothing to add and nothing to verify.
//  - `online` is a HYPOTHESIS. It is intercepted before the app can act on it
//    (see src/offline/register.ts) and only re-announced once a real request
//    has come back from THIS origin (see src/offline/networkProbe.ts).
//
// The other half of the same promise: while the app considers itself offline
// and the browser thinks otherwise, this module re-probes on a bounded schedule
// — so a portal that lets us through at 21:14, with no browser event to mark
// the moment, is noticed without the operator doing anything. A banner stuck on
// OFFLINE after the network really came back would be the symmetric defect, and
// during an auction it is just as damaging.

/** Message names on the service-worker ⇄ page channel. Kept as literals shared
 *  by both sides; sw.ts cannot import types from a module the app also pulls
 *  in, so the shapes below are the contract. */
export const NETWORK_TRUTH_MESSAGE = "fac-network-truth";
export const NETWORK_TRUTH_QUERY = "fac-network-truth-query";

/** What the worker reports after handling a request. `url` travels with the
 *  verdict so a live channel is readable in devtools; the state machine below
 *  does not branch on it, and does not pretend to. */
export interface NetworkTruthMessage {
  readonly type: typeof NETWORK_TRUTH_MESSAGE;
  /** false = the origin did not answer (rejection or timeout); true = it did. */
  readonly reachable: boolean;
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

/** Why the app currently considers itself offline. */
export type OfflineReason =
  /** The browser said so. Conclusive, and only the browser can lift it. */
  | "browser"
  /** Requests are not being answered, whatever the browser believes. */
  | "evidence";

/**
 * How long between two re-probes while waiting for a network to come back.
 *
 * Short enough that an operator who walks back into coverage mid-auction sees
 * the banner correct itself rather than wondering, and affordable because it
 * runs ONLY while the app already believes it is offline: one small same-origin
 * request, never a heartbeat during a healthy session.
 */
export const RECHECK_INTERVAL_MS = 5_000;

export interface NetworkTruthDeps {
  /** Dispatches a standard connectivity event on the window. */
  readonly dispatch: (event: "online" | "offline") => void;
  /** The browser's own opinion, read fresh at every decision. */
  readonly isBrowserOnline: () => boolean;
  /** Asks the network whether THIS origin answers. Resolves false on any doubt. */
  readonly probe: () => Promise<boolean>;
  /** Injected so tests drive the schedule instead of waiting for it. */
  readonly schedule: (run: () => void, ms: number) => number;
  readonly cancel: (handle: number) => void;
  readonly recheckIntervalMs?: number;
}

export interface NetworkTruth {
  /** A request this layer owns failed at the network level. */
  readonly observeUnreachable: () => void;
  /** A request this layer owns came back from the network. */
  readonly observeReachable: () => void;
  /**
   * The browser announced `online`. NOT taken at face value: the announcement
   * is verified before the app is allowed to act on it.
   */
  readonly handleBrowserOnlineClaim: () => Promise<void>;
  /** The browser announced `offline`. Trusted, recorded, no probing while it holds. */
  readonly handleBrowserOffline: () => void;
  /** Why the app is offline right now, or null. */
  readonly offlineReason: () => OfflineReason | null;
}

export function createNetworkTruth(deps: NetworkTruthDeps): NetworkTruth {
  const recheckIntervalMs = deps.recheckIntervalMs ?? RECHECK_INTERVAL_MS;
  let reason: OfflineReason | null = null;
  let recheckHandle: number | null = null;
  let probeInFlight = false;

  const stopRecheck = (): void => {
    if (recheckHandle === null) return;
    deps.cancel(recheckHandle);
    recheckHandle = null;
  };

  /**
   * Keeps asking, on a bounded schedule, while the app thinks it is offline and
   * the browser thinks it is not. That gap is exactly the captive-portal state,
   * and it is the one state no browser event will ever announce the end of.
   */
  const scheduleRecheck = (): void => {
    if (recheckHandle !== null) return;
    if (reason === null) return;
    // A browser that says it has no interface will not be proved wrong by a
    // request; waiting for its own `online` event costs nothing and probes it
    // would spend for nothing.
    if (!deps.isBrowserOnline()) return;
    recheckHandle = deps.schedule(() => {
      recheckHandle = null;
      void runProbe();
    }, recheckIntervalMs);
  };

  const goOnline = (): void => {
    const wasOffline = reason !== null;
    reason = null;
    stopRecheck();
    // Only announce a change that IS one. This matters because the browser's
    // own `online` event was suppressed on the way in (register.ts): when the
    // app was offline — for any reason, including the browser's own earlier
    // outage — this dispatch is the only thing that brings it back, and when it
    // was not offline there is nothing to bring back.
    if (wasOffline && deps.isBrowserOnline()) deps.dispatch("online");
  };

  const goOffline = (next: OfflineReason): void => {
    const wasOffline = reason !== null;
    reason = next;
    if (!wasOffline) deps.dispatch("offline");
    scheduleRecheck();
  };

  const runProbe = async (): Promise<void> => {
    if (probeInFlight) return;
    probeInFlight = true;
    try {
      const reachable = await deps.probe();
      if (reachable) {
        goOnline();
        return;
      }
      // A probe that comes back empty-handed is evidence in its own right: it
      // is how a reconnection to a portal is caught, and it is the difference
      // between "the app noticed" and "the app announced what it was told".
      if (deps.isBrowserOnline()) goOffline("evidence");
    } finally {
      probeInFlight = false;
    }
  };

  return {
    observeUnreachable: () => {
      // Nothing to correct if the browser is already telling the truth: the app
      // is offline by its own reckoning and has already reacted.
      if (!deps.isBrowserOnline()) return;
      if (reason !== null) return;
      goOffline("evidence");
    },

    observeReachable: () => {
      // ONE guard, not two: `reason !== "evidence"` already covers both cases
      // that must produce silence — "never claimed anything" (null) and "the
      // browser declared the outage" ("browser"). An earlier version checked
      // null separately; it was redundant with this line and with `goOnline`'s
      // own no-op-when-not-offline, and a redundant guard is a guard no test
      // can hold to account.
      //
      // What survives is the rule that matters: a stray successful request
      // never lifts an outage this layer did not itself infer. A
      // browser-declared one is lifted only through the verified path
      // (handleBrowserOnlineClaim), which is the whole point — otherwise a
      // cached response arriving while the flag flips back would put the app
      // "online" with nothing checked.
      if (reason !== "evidence") return;
      goOnline();
    },

    handleBrowserOnlineClaim: async () => {
      // The event says an interface came up. Nothing more. The app is told
      // only after a request has come back from this origin — and if none
      // does, the probe's own failure is what keeps (or puts) the app in the
      // offline state, rather than an announcement nobody checked.
      //
      // Deliberately runs even when the app is not currently offline:
      // reconnecting to a portal from a healthy-looking state is exactly the
      // case where nothing else would ever ask.
      await runProbe();
    },

    handleBrowserOffline: () => {
      // Trusted, and recorded rather than re-announced: the browser's own
      // event reaches src/main.ts untouched (this layer never intercepts
      // `offline`), so dispatching a second one would only duplicate a render.
      // No probing while it holds — nothing can prove a missing interface
      // wrong, and every probe spent on it is spent for nothing.
      stopRecheck();
      reason = "browser";
    },

    offlineReason: () => reason,
  };
}

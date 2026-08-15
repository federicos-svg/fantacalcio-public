// The rules that let evidence correct `navigator.onLine` in both directions,
// without ever making the app's connectivity state worse than the flag alone.
import { describe, expect, it } from "vitest";
import {
  createNetworkTruth,
  isNetworkTruthMessage,
  NETWORK_TRUTH_MESSAGE,
} from "./networkTruth.js";

interface HarnessOptions {
  readonly browserOnline?: boolean;
  /** Verdicts the probe returns, in order; the last one repeats. */
  readonly probeResults?: readonly boolean[];
}

function harness(options: HarnessOptions = {}) {
  const dispatched: Array<"online" | "offline"> = [];
  const scheduled: Array<{ run: () => void; ms: number; handle: number }> = [];
  const cancelled: number[] = [];
  let online = options.browserOnline ?? true;
  let probeCalls = 0;
  let nextHandle = 1;

  const results = options.probeResults ?? [false];

  const truth = createNetworkTruth({
    dispatch: (event) => dispatched.push(event),
    isBrowserOnline: () => online,
    probe: async () => {
      const index = Math.min(probeCalls, results.length - 1);
      probeCalls += 1;
      return results[index]!;
    },
    schedule: (run, ms) => {
      const handle = nextHandle++;
      scheduled.push({ run, ms, handle });
      return handle;
    },
    cancel: (handle) => cancelled.push(handle),
    recheckIntervalMs: 10_000,
  });

  return {
    truth,
    dispatched,
    scheduled,
    cancelled,
    probeCalls: () => probeCalls,
    setBrowserOnline: (value: boolean) => {
      online = value;
    },
    /** Fires the pending scheduled re-check, as the clock would, and waits for
     *  the probe it starts to settle. One macrotask turn is enough: the
     *  injected probe resolves immediately, so nothing here depends on how fast
     *  the machine is. */
    runPendingRecheck: async () => {
      const pending = scheduled.pop();
      expect(pending, "a re-check must have been scheduled").toBeDefined();
      pending!.run();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe("evidence that the origin is not answering", () => {
  it("declares offline when the origin stops answering an optimistic browser", () => {
    const h = harness();
    h.truth.observeUnreachable();
    expect(h.dispatched).toEqual(["offline"]);
    expect(h.truth.offlineReason()).toBe("evidence");
  });

  it("declares it once, not once per failed request", () => {
    const h = harness();
    h.truth.observeUnreachable();
    h.truth.observeUnreachable();
    h.truth.observeUnreachable();
    expect(h.dispatched).toEqual(["offline"]);
  });

  it("says nothing at all when the browser already knows it is offline", () => {
    const h = harness({ browserOnline: false });
    h.truth.observeUnreachable();
    expect(h.dispatched).toEqual([]);
    expect(h.truth.offlineReason()).toBeNull();
  });
});

describe("evidence that the origin is answering again", () => {
  it("takes its own claim back when the origin answers", () => {
    const h = harness();
    h.truth.observeUnreachable();
    h.truth.observeReachable();
    expect(h.dispatched).toEqual(["offline", "online"]);
    expect(h.truth.offlineReason()).toBeNull();
  });

  it("stays silent when it never claimed anything — browser online", () => {
    // Isolates the "nothing to take back" guard on its own: the browser is
    // ONLINE here, so the second guard (never contradict a browser that says
    // offline) cannot be what produces the silence. Removing the first guard
    // makes this test dispatch a spurious `online`.
    const h = harness({ browserOnline: true });
    h.truth.observeReachable();
    expect(h.dispatched).toEqual([]);
    expect(h.truth.offlineReason()).toBeNull();
  });

  it("does not lift a browser-declared outage on its own evidence", () => {
    // The browser is the only one that can end its own claim — and it does so
    // through the verified path, never through a stray successful request.
    const h = harness();
    h.truth.handleBrowserOffline();
    h.setBrowserOnline(false);
    h.truth.observeReachable();
    expect(h.dispatched).toEqual([]);
    expect(h.truth.offlineReason()).toBe("browser");
  });

  it("does not lift a browser-declared outage even once the flag has flipped back", () => {
    // The case that isolates the guard, and the only one that can: the browser
    // has withdrawn its own claim (flag true again) but nothing has been
    // verified yet, and a cached response arrives looking like a success.
    // Without the guard this goes "online" with nothing checked — which is the
    // very defect this layer exists to prevent, arriving through the back door.
    const h = harness({ browserOnline: true });
    h.truth.handleBrowserOffline();
    expect(h.truth.offlineReason()).toBe("browser");

    h.truth.observeReachable();

    expect(h.dispatched).toEqual([]);
    expect(h.truth.offlineReason()).toBe("browser");
  });

  it("can claim again after recovering", () => {
    const h = harness();
    h.truth.observeUnreachable();
    h.truth.observeReachable();
    h.truth.observeUnreachable();
    expect(h.dispatched).toEqual(["offline", "online", "offline"]);
  });
});

describe("the browser's `online` announcement is a hypothesis", () => {
  it("does not go online while the network still refuses to answer", async () => {
    // THE reconnection defect: a captive portal armed before reconnecting.
    const h = harness({ probeResults: [false] });
    h.truth.observeUnreachable();
    expect(h.dispatched).toEqual(["offline"]);

    await h.truth.handleBrowserOnlineClaim();

    expect(h.dispatched).toEqual(["offline"]);
    expect(h.truth.offlineReason()).not.toBeNull();
    expect(h.probeCalls()).toBe(1);
  });

  it("goes online once a request really comes back", async () => {
    const h = harness({ probeResults: [true] });
    h.truth.observeUnreachable();
    await h.truth.handleBrowserOnlineClaim();
    expect(h.dispatched).toEqual(["offline", "online"]);
    expect(h.truth.offlineReason()).toBeNull();
  });

  it("verifies even when it was not offline, so a portal cannot pass unnoticed", async () => {
    const h = harness({ probeResults: [false] });
    await h.truth.handleBrowserOnlineClaim();
    // The probe failed: the app learns it is not really connected.
    expect(h.dispatched).toEqual(["offline"]);
    expect(h.truth.offlineReason()).toBe("evidence");
  });

  it("converts a lifted browser outage into an evidence-based one until proven", async () => {
    const h = harness({ probeResults: [false] });
    h.truth.handleBrowserOffline();
    expect(h.truth.offlineReason()).toBe("browser");
    await h.truth.handleBrowserOnlineClaim();
    // The browser withdrew its claim, but nothing answered: the app stays
    // offline on evidence instead of following the announcement — and without
    // a duplicate event, because it is already showing offline.
    expect(h.truth.offlineReason()).toBe("evidence");
    expect(h.dispatched).toEqual([]);
  });
});

describe("recovery without an operator and without an event", () => {
  it("keeps re-checking while offline against a browser that thinks it is online", async () => {
    // The portal that lets us through at 21:14: no browser event marks the
    // moment, so the only way to notice is to keep asking. The scheduled
    // re-check is the FIRST probe here — nothing probes at the moment the
    // failure is observed.
    const h = harness({ probeResults: [true] });
    h.truth.observeUnreachable();
    expect(h.scheduled).toHaveLength(1);
    expect(h.scheduled[0]?.ms).toBe(10_000);

    await h.runPendingRecheck();

    expect(h.dispatched).toEqual(["offline", "online"]);
    expect(h.truth.offlineReason()).toBeNull();
  });

  it("re-arms the schedule while the answer is still no", async () => {
    const h = harness({ probeResults: [false, false] });
    h.truth.observeUnreachable();
    await h.runPendingRecheck();
    expect(h.dispatched).toEqual(["offline"]);
    expect(h.scheduled).toHaveLength(1); // a fresh one, for the next round
  });

  it("does not probe while the browser itself reports no interface", () => {
    const h = harness({ browserOnline: false });
    h.truth.handleBrowserOffline();
    expect(h.scheduled).toHaveLength(0);
    expect(h.probeCalls()).toBe(0);
  });

  it("stops re-checking as soon as the network is back", async () => {
    const h = harness({ probeResults: [true] });
    h.truth.observeUnreachable();
    const armed = h.scheduled[0]?.handle;
    h.truth.observeReachable();
    expect(h.cancelled).toContain(armed);
  });

  it("never runs two probes at once", async () => {
    const h = harness({ probeResults: [false] });
    const first = h.truth.handleBrowserOnlineClaim();
    const second = h.truth.handleBrowserOnlineClaim();
    await Promise.all([first, second]);
    expect(h.probeCalls()).toBe(1);
  });
});

describe("isNetworkTruthMessage", () => {
  it("accepts the worker's message shape", () => {
    expect(isNetworkTruthMessage({ type: NETWORK_TRUTH_MESSAGE, reachable: false, url: "/x" })).toBe(true);
  });

  it("rejects anything else that lands on the same channel", () => {
    expect(isNetworkTruthMessage(null)).toBe(false);
    expect(isNetworkTruthMessage("offline")).toBe(false);
    expect(isNetworkTruthMessage({ type: "something-else", reachable: false, url: "/x" })).toBe(false);
    expect(isNetworkTruthMessage({ type: NETWORK_TRUTH_MESSAGE, reachable: "no", url: "/x" })).toBe(false);
    expect(isNetworkTruthMessage({ type: NETWORK_TRUTH_MESSAGE, reachable: false })).toBe(false);
  });
});

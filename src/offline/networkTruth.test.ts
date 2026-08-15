// The rules that let evidence correct `navigator.onLine` without ever making
// the app's connectivity state worse than the flag alone.
import { describe, expect, it } from "vitest";
import {
  createNetworkTruth,
  isNetworkTruthMessage,
  NETWORK_TRUTH_MESSAGE,
} from "./networkTruth.js";

function harness(browserOnline = true) {
  const dispatched: Array<"online" | "offline"> = [];
  let online = browserOnline;
  const truth = createNetworkTruth({
    dispatch: (event) => dispatched.push(event),
    isBrowserOnline: () => online,
  });
  return {
    truth,
    dispatched,
    setBrowserOnline: (value: boolean) => {
      online = value;
    },
  };
}

describe("createNetworkTruth", () => {
  it("declares offline when the origin stops answering an optimistic browser", () => {
    const h = harness(true);
    h.truth.observeUnreachable("/data/listone.json");
    expect(h.dispatched).toEqual(["offline"]);
    expect(h.truth.hasClaimedOffline()).toBe(true);
  });

  it("declares it once, not once per failed request", () => {
    const h = harness(true);
    h.truth.observeUnreachable("/a.json");
    h.truth.observeUnreachable("/b.json");
    h.truth.observeUnreachable("/c.json");
    expect(h.dispatched).toEqual(["offline"]);
  });

  it("takes its own claim back when the origin answers again", () => {
    const h = harness(true);
    h.truth.observeUnreachable("/data/listone.json");
    h.truth.observeReachable("/data/listone.json");
    expect(h.dispatched).toEqual(["offline", "online"]);
    expect(h.truth.hasClaimedOffline()).toBe(false);
  });

  it("says nothing at all when the browser already knows it is offline", () => {
    // Nothing to correct: the app has already reacted to the browser's own
    // event, and a second one would be noise.
    const h = harness(false);
    h.truth.observeUnreachable("/data/listone.json");
    expect(h.dispatched).toEqual([]);
    expect(h.truth.hasClaimedOffline()).toBe(false);
  });

  it("never announces online on its own initiative", () => {
    // A successful request while the module has claimed nothing must not
    // override a browser that is reporting a genuine outage.
    const h = harness(false);
    h.truth.observeReachable("/data/listone.json");
    expect(h.dispatched).toEqual([]);
  });

  it("does not contradict a browser that went offline for real while it was claiming", () => {
    const h = harness(true);
    h.truth.observeUnreachable("/data/listone.json");
    h.setBrowserOnline(false);
    h.truth.observeReachable("/data/listone.json");
    // The claim is released — the browser owns the state now — but no `online`
    // is dispatched over a browser that says otherwise.
    expect(h.dispatched).toEqual(["offline"]);
    expect(h.truth.hasClaimedOffline()).toBe(false);
  });

  it("can claim again after recovering", () => {
    const h = harness(true);
    h.truth.observeUnreachable("/x");
    h.truth.observeReachable("/x");
    h.truth.observeUnreachable("/x");
    expect(h.dispatched).toEqual(["offline", "online", "offline"]);
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

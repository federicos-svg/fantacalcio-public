// The service worker's routing decisions, tested where they can be tested:
// sw.ts itself only exists inside a ServiceWorkerGlobalScope, so every rule it
// applies lives in swPolicy.ts and is exercised here.
import { describe, expect, it } from "vitest";
import {
  classifySwRequest,
  navigationFallbackPath,
  DATA_ASSET_NETWORK_TIMEOUT_MS,
  NAVIGATION_NETWORK_TIMEOUT_MS,
  SHELL_ASSET_NETWORK_TIMEOUT_MS,
  type SwRequestFacts,
} from "./swPolicy.js";
import { ASSET_FETCH_TIMEOUT_MS } from "./integrityGate.js";

const ORIGIN = "https://asta.example";
const PRECACHED = new Set(["/", "/index.html", "/app-integrity.json", "/assets/index-abc.js", "/data/listone.json"]);

function facts(patch: Partial<SwRequestFacts>): SwRequestFacts {
  return {
    method: "GET",
    mode: "cors",
    url: `${ORIGIN}/assets/index-abc.js`,
    origin: ORIGIN,
    precachedPaths: PRECACHED,
    ...patch,
  };
}

describe("classifySwRequest", () => {
  it("treats a document load as a navigation whatever path it carries", () => {
    expect(classifySwRequest(facts({ mode: "navigate", url: `${ORIGIN}/` }))).toBe("navigation");
    expect(classifySwRequest(facts({ mode: "navigate", url: `${ORIGIN}/rose` }))).toBe("navigation");
    expect(classifySwRequest(facts({ mode: "navigate", url: `${ORIGIN}/index.html` }))).toBe("navigation");
  });

  it("routes hashed build output to the shell strategy", () => {
    expect(classifySwRequest(facts({ url: `${ORIGIN}/assets/index-abc.js` }))).toBe("shell-asset");
    // INVERTED, declared: this line used to assert "shell-asset" for
    // /assets/index-abc.css, and it passed for the wrong reason — the css is
    // NOT in this fixture's precache set, so what it really proved was the old
    // rule "anything under /assets/ is shell", the rule that sent a cold start
    // to the network for files the build does not contain. The prefix no longer
    // decides on its own; the precache list does. The same file, precached, is
    // still shell — asserted right below, so nothing that was proved here is
    // lost.
    expect(classifySwRequest(facts({ url: `${ORIGIN}/assets/index-abc.css` }))).toBe("absent-asset");
    const withCss = new Set([...PRECACHED, "/assets/index-abc.css"]);
    expect(
      classifySwRequest(facts({ url: `${ORIGIN}/assets/index-abc.css`, precachedPaths: withCss })),
    ).toBe("shell-asset");
  });

  it("answers a /assets/ path this build does not contain without touching the network", () => {
    // The club logos: their URL is computed from the club name at runtime
    // (src/ui/serieA.ts), so it exists whether or not the build ships the file.
    // When it does not, the precache list says so, and the only honest answer
    // is a local 404 — the app degrades to its text badge on `onerror` and the
    // network is never asked, offline or not.
    expect(classifySwRequest(facts({ url: `${ORIGIN}/assets/clubs/milan.svg` }))).toBe("absent-asset");
    expect(classifySwRequest(facts({ url: `${ORIGIN}/assets/clubs/verona.png` }))).toBe("absent-asset");
    // And when the build DOES ship it, it is an ordinary precached shell asset:
    // the private overlay's real logos are copied into dist/ before the policy
    // is computed, so they are in the list like every other built file.
    const withLogo = new Set([...PRECACHED, "/assets/clubs/milan.svg"]);
    expect(classifySwRequest(facts({ url: `${ORIGIN}/assets/clubs/milan.svg`, precachedPaths: withLogo }))).toBe(
      "shell-asset",
    );
  });

  it("keeps a /assets/ document load a navigation, absent or not", () => {
    // The navigation rule is checked before both, and must stay that way: a
    // deep link is how the app comes back from a cold start.
    expect(classifySwRequest(facts({ mode: "navigate", url: `${ORIGIN}/assets/clubs/milan.svg` }))).toBe("navigation");
  });

  it("routes anything else that was precached to the shell strategy too", () => {
    expect(classifySwRequest(facts({ url: `${ORIGIN}/app-integrity.json` }))).toBe("shell-asset");
    expect(classifySwRequest(facts({ url: `${ORIGIN}/index.html` }))).toBe("shell-asset");
  });

  it("routes shipped data payloads to the data strategy", () => {
    expect(classifySwRequest(facts({ url: `${ORIGIN}/data/listone.json` }))).toBe("data-asset");
    expect(classifySwRequest(facts({ url: `${ORIGIN}/data/listone.manifest.json` }))).toBe("data-asset");
  });

  it("never caches the backend endpoints", () => {
    expect(classifySwRequest(facts({ url: `${ORIGIN}/api/listone` }))).toBe("network-only");
    // Even as a navigation: the /api/ rule is checked first on purpose.
    expect(classifySwRequest(facts({ mode: "navigate", url: `${ORIGIN}/api/listone` }))).toBe("network-only");
  });

  it("passes through anything that is not a same-origin GET", () => {
    expect(classifySwRequest(facts({ method: "POST" }))).toBe("passthrough");
    expect(classifySwRequest(facts({ method: "HEAD" }))).toBe("passthrough");
    expect(classifySwRequest(facts({ url: "https://other.example/assets/index-abc.js" }))).toBe("passthrough");
    expect(classifySwRequest(facts({ url: "not a url" }))).toBe("passthrough");
  });

  it("passes through an unknown same-origin path it was not built to answer", () => {
    expect(classifySwRequest(facts({ url: `${ORIGIN}/unknown/thing.txt` }))).toBe("passthrough");
  });

  it("is decided by the precache list, not by the file name, for root-level files", () => {
    const withoutPolicy = new Set(["/", "/index.html"]);
    expect(
      classifySwRequest(facts({ url: `${ORIGIN}/app-integrity.json`, precachedPaths: withoutPolicy })),
    ).toBe("passthrough");
  });
});

describe("navigationFallbackPath", () => {
  it("prefers the explicit document over the directory alias", () => {
    expect(navigationFallbackPath(new Set(["/", "/index.html"]))).toBe("/index.html");
  });
  it("falls back to the root when only that was precached", () => {
    expect(navigationFallbackPath(new Set(["/"]))).toBe("/");
  });
  it("returns null when there is no shell to serve", () => {
    expect(navigationFallbackPath(new Set(["/assets/index-abc.js"]))).toBeNull();
  });
});

describe("stacked timeouts", () => {
  it("keeps the service worker's data bound strictly inside the gate's own bound", () => {
    // The ordering invariant, asserted so it cannot drift: the gate wraps the
    // worker on the same request, so the worker must be the one that gives up
    // first — it is the layer holding the cached copy. Equal figures were the
    // original bug (the gate aborted the request whose fallback was about to
    // succeed); see ASSET_FETCH_TIMEOUT_MS in src/offline/integrityGate.ts.
    expect(ASSET_FETCH_TIMEOUT_MS).toBeGreaterThan(DATA_ASSET_NETWORK_TIMEOUT_MS);
    // And the data payload gets a looser bound than a document, because it is
    // not the same size class.
    expect(DATA_ASSET_NETWORK_TIMEOUT_MS).toBeGreaterThan(NAVIGATION_NETWORK_TIMEOUT_MS);
    expect(SHELL_ASSET_NETWORK_TIMEOUT_MS).toBe(NAVIGATION_NETWORK_TIMEOUT_MS);
  });
});

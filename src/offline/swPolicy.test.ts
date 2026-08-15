// The service worker's routing decisions, tested where they can be tested:
// sw.ts itself only exists inside a ServiceWorkerGlobalScope, so every rule it
// applies lives in swPolicy.ts and is exercised here.
import { describe, expect, it } from "vitest";
import { classifySwRequest, navigationFallbackPath, type SwRequestFacts } from "./swPolicy.js";

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
    expect(classifySwRequest(facts({ url: `${ORIGIN}/assets/index-abc.css` }))).toBe("shell-asset");
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

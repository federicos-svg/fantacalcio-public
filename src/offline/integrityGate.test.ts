// The fetch gate: what reaches the app, and what is refused before it can.
//
// Node 22 supplies `Response`/`Request`/WebCrypto globally, so the real
// wrapper can be exercised end-to-end here with a scripted fetch — no DOM, no
// browser, no jsdom (this repo has none: see src/ui/listone.ts).
import { createHash, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { APP_INTEGRITY_POLICY_URL, APP_INTEGRITY_POLICY_VERSION } from "./appIntegrityPolicy.js";
import { LISTONE_LIVE_BUNDLE_MANIFEST_VERSION, LISTONE_LIVE_BUNDLE_VERSION } from "./bundleIntegrity.js";
import { createIntegrityGate, type IntegrityFailureReport, type IntegrityStatus } from "./integrityGate.js";

const ORIGIN = "https://asta.example";
const ASSET = "/data/listone_2026_27.json";
const MANIFEST = "/data/listone_2026_27.manifest.json";

const BUNDLE_TEXT = JSON.stringify([{ name: "Alpha", role: "P", club: "Uno", quotation: 3 }], null, 2) + "\n";
const BUNDLE_HASH = createHash("sha256").update(BUNDLE_TEXT, "utf8").digest("hex");

function policyJson(manifestRequired: boolean): unknown {
  return {
    policy_version: APP_INTEGRITY_POLICY_VERSION,
    build_id: "f".repeat(64),
    files: [{ url: ASSET, sha256: BUNDLE_HASH, bytes: Buffer.byteLength(BUNDLE_TEXT, "utf8") }],
    data: [{ url: ASSET, manifestUrl: MANIFEST, manifestRequired }],
    precache: ["/", "/index.html", ASSET],
  };
}

function manifestJson(patch: Record<string, unknown> = {}): unknown {
  return {
    manifest_version: LISTONE_LIVE_BUNDLE_MANIFEST_VERSION,
    bundle_version: LISTONE_LIVE_BUNDLE_VERSION,
    bundle_sha256: BUNDLE_HASH,
    bundle_size_bytes: Buffer.byteLength(BUNDLE_TEXT, "utf8"),
    total_records: 1,
    source_id: "fantacalcio_xlsx",
    season: "2026_27",
    gates: {
      data_promoted: false,
      canonical_promoted: false,
      decision_promoted: false,
      fair_to_me_promoted: false,
      live_ui_ready: false,
    },
    ...patch,
  };
}

interface Harness {
  readonly gate: ReturnType<typeof createIntegrityGate>;
  readonly requested: string[];
  readonly statuses: Array<{ status: IntegrityStatus; detail: string }>;
  readonly failures: IntegrityFailureReport[];
}

/**
 * A route that accepts the connection and never answers — the captive-portal
 * shape. It rejects only when the caller's AbortSignal fires, so a gate without
 * a timeout hangs here exactly as it would in a hotel wifi.
 */
function hangsForever(): (init?: RequestInit) => Promise<Response> {
  return (init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return; // no timeout wired: hang forever, which is the bug under test
      if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
}

/** `routes` maps a pathname to the response the network gives; anything not
 *  listed answers 404, exactly like a path that was never deployed. */
function harness(options: {
  routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>;
  productionBuild?: boolean;
  digest?: { digest(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer> } | null;
  policyTimeoutMs?: number;
  policyAttempts?: number;
}): Harness {
  const requested: string[] = [];
  const statuses: Array<{ status: IntegrityStatus; detail: string }> = [];
  const failures: IntegrityFailureReport[] = [];

  const gate = createIntegrityGate({
    fetchImpl: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, ORIGIN);
      requested.push(url.pathname);
      const route = options.routes[url.pathname];
      if (route === undefined) return new Response("not found", { status: 404 });
      return route(init);
    },
    origin: ORIGIN,
    digest: options.digest === undefined ? webcrypto.subtle : options.digest,
    productionBuild: options.productionBuild ?? true,
    onStatus: (status, detail) => statuses.push({ status, detail }),
    onFailure: (report) => failures.push(report),
    // Short but real: the fake never resolves, so the outcome depends on the
    // timeout existing, never on how fast the machine is.
    policyTimeoutMs: options.policyTimeoutMs ?? 25,
    policyAttempts: options.policyAttempts,
  });

  return { gate, requested, statuses, failures };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function bundleResponse(text = BUNDLE_TEXT): Response {
  return new Response(text, { status: 200, headers: { "content-type": "application/json" } });
}

describe("verified path", () => {
  it("returns the exact bytes and records the verified status", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)),
        [ASSET]: () => bundleResponse(),
        [MANIFEST]: () => jsonResponse(manifestJson()),
      },
    });

    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe(BUNDLE_TEXT);
    expect(h.failures).toEqual([]);
    expect(h.statuses.at(-1)?.status).toBe("verified");
    expect(h.statuses.at(-1)?.detail).toContain(BUNDLE_HASH);
  });

  it("preserves the response headers the app relies on", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)),
        [ASSET]: () => bundleResponse(),
        [MANIFEST]: () => jsonResponse(manifestJson()),
      },
    });
    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("fail-closed refusals", () => {
  it("refuses a divergent hash: no bytes to the app, one blocking report", async () => {
    // Same byte length as the declared bundle, one character different — so
    // this really exercises the hash and not the cheaper size check.
    const tampered = BUNDLE_TEXT.replace("Alpha", "Alpho");
    expect(Buffer.byteLength(tampered, "utf8")).toBe(Buffer.byteLength(BUNDLE_TEXT, "utf8"));
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)),
        [ASSET]: () => bundleResponse(tampered),
        [MANIFEST]: () => jsonResponse(manifestJson()),
      },
    });

    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("Alpho");
    expect(h.failures).toHaveLength(1);
    expect(h.failures[0]?.code).toBe("hash-mismatch");
    expect(h.failures[0]?.text).toContain(BUNDLE_HASH);
    expect(h.statuses.at(-1)?.status).toBe("failed");
  });

  it("refuses a missing manifest when the build packaged one", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)),
        [ASSET]: () => bundleResponse(),
      },
    });
    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.status).toBe(503);
    expect(h.failures[0]?.code).toBe("manifest-absent");
  });

  it("refuses a manifest served as JSON that does not parse", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)),
        [ASSET]: () => bundleResponse(),
        [MANIFEST]: () => new Response("{ broken", { status: 200, headers: { "content-type": "application/json" } }),
      },
    });
    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.status).toBe(503);
    expect(h.failures[0]?.code).toBe("manifest-malformed");
  });

  it("reads an SPA-fallback HTML answer as 'no manifest', not as a corrupt one", async () => {
    // A static host that answers every unknown path with index.html at 200 —
    // the exact shape main.ts already refuses for /api/listone. With a manifest
    // the build declared as packaged, this is still a hard failure; the point
    // is that it is reported as absent, which is what actually happened.
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)),
        [ASSET]: () => bundleResponse(),
        [MANIFEST]: () =>
          new Response("<!doctype html><title>app</title>", { status: 200, headers: { "content-type": "text/html" } }),
      },
    });
    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.status).toBe(503);
    expect(h.failures[0]?.code).toBe("manifest-absent");
  });

  it("does not turn an SPA-fallback answer into a failure when no manifest was packaged", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(false)),
        [ASSET]: () => bundleResponse(),
        [MANIFEST]: () =>
          new Response("<!doctype html><title>app</title>", { status: 200, headers: { "content-type": "text/html" } }),
      },
    });
    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe(BUNDLE_TEXT);
    expect(h.statuses.at(-1)?.status).toBe("unverified");
    expect(h.failures).toEqual([]);
  });

  it("refuses when crypto.subtle is unavailable", async () => {
    const h = harness({
      digest: null,
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)),
        [ASSET]: () => bundleResponse(),
        [MANIFEST]: () => jsonResponse(manifestJson()),
      },
    });
    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.status).toBe(503);
    expect(h.failures[0]?.code).toBe("digest-unavailable");
  });

  it("reports the blocking screen once even across repeated attempts", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)),
        [ASSET]: () => bundleResponse("[]\n"),
        [MANIFEST]: () => jsonResponse(manifestJson()),
      },
    });
    await h.gate.fetch(`${ORIGIN}${ASSET}`);
    await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(h.failures).toHaveLength(1);
    expect(h.statuses.filter((entry) => entry.status === "failed")).toHaveLength(2);
  });
});

describe("unverified but not degraded", () => {
  it("passes the bytes through when the build packaged no manifest for the asset", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(false)),
        [ASSET]: () => bundleResponse(),
      },
    });
    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe(BUNDLE_TEXT);
    expect(h.failures).toEqual([]);
    expect(h.statuses.at(-1)?.status).toBe("unverified");
  });

  it("still verifies when a manifest turns up for an asset the build did not require one for", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(false)),
        [ASSET]: () => bundleResponse(),
        [MANIFEST]: () => jsonResponse(manifestJson({ bundle_sha256: "0".repeat(64) })),
      },
    });
    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.status).toBe(503);
    expect(h.failures[0]?.code).toBe("hash-mismatch");
  });
});

describe("pass-through", () => {
  it("never touches a path the policy does not protect", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)),
        "/api/listone": () => jsonResponse([{ name: "Remote", role: "P", club: "X", quotation: 1 }]),
      },
    });
    const res = await h.gate.fetch(`${ORIGIN}/api/listone`);
    expect(res.ok).toBe(true);
    expect(h.requested).not.toContain(MANIFEST);
    expect(h.failures).toEqual([]);
  });

  it("never touches a non-GET request, or a cross-origin one", async () => {
    const h = harness({ routes: { [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)) } });
    await h.gate.fetch(`${ORIGIN}${ASSET}`, { method: "POST" });
    await h.gate.fetch("https://elsewhere.example/data/listone_2026_27.json");
    expect(h.failures).toEqual([]);
    expect(h.statuses).toEqual([]);
  });

  it("leaves an unavailable asset as the app's existing unavailable path", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)),
        [ASSET]: () => new Response("nope", { status: 500 }),
      },
    });
    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.status).toBe(500);
    expect(h.failures).toEqual([]);
  });

  it("accepts a Request object and a URL object, not only a string", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)),
        [ASSET]: () => bundleResponse(),
        [MANIFEST]: () => jsonResponse(manifestJson()),
      },
    });
    expect((await h.gate.fetch(new Request(`${ORIGIN}${ASSET}`))).ok).toBe(true);
    expect((await h.gate.fetch(new URL(`${ORIGIN}${ASSET}`))).ok).toBe(true);
    expect(h.failures).toEqual([]);
  });
});

describe("the policy itself", () => {
  it("refuses every data payload of a production build that ships no policy", async () => {
    const h = harness({ routes: { [ASSET]: () => bundleResponse() }, productionBuild: true });
    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.status).toBe(503);
    expect(h.failures[0]?.code).toBe("integrity-policy-unusable");
    expect(h.failures[0]?.text).toContain(APP_INTEGRITY_POLICY_URL);
  });

  it("refuses every data payload of a production build whose policy is malformed", async () => {
    const h = harness({
      routes: { [APP_INTEGRITY_POLICY_URL]: () => jsonResponse({ policy_version: "nope" }), [ASSET]: () => bundleResponse() },
      productionBuild: true,
    });
    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.status).toBe(503);
    expect(h.failures).toHaveLength(1);
  });

  it("leaves a dev server (no policy, not a production build) working exactly as before", async () => {
    const h = harness({ routes: { [ASSET]: () => bundleResponse() }, productionBuild: false });
    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe(BUNDLE_TEXT);
    expect(h.failures).toEqual([]);
  });

  it("does not block non-data paths even when the policy is unusable", async () => {
    const h = harness({ routes: { "/index.html": () => new Response("<html></html>", { status: 200 }) } });
    const res = await h.gate.fetch(`${ORIGIN}/index.html`);
    expect(res.ok).toBe(true);
    expect(h.failures).toEqual([]);
  });

  it("gives up on a network that never answers, and says exactly that", async () => {
    // The captive-portal case, on a FIRST visit: no cache, no service worker,
    // nothing on screen. Without the timeout this test never finishes — which
    // is precisely the failure it exists to prevent.
    const h = harness({
      routes: { [APP_INTEGRITY_POLICY_URL]: hangsForever(), [ASSET]: () => bundleResponse() },
      policyTimeoutMs: 25,
    });

    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.status).toBe(503);
    expect(h.failures).toHaveLength(1);
    expect(h.failures[0]?.code).toBe("integrity-policy-unreachable");
    // The message must point at the network, not at rebuilding the app.
    expect(h.failures[0]?.text).toContain("25 ms");
    expect(h.failures[0]?.text.toLowerCase()).toContain("captive");
    expect(h.failures[0]?.text).not.toContain("npm run build");
  });

  it("retries a network that never answers, exactly as many times as declared", async () => {
    const h = harness({
      routes: { [APP_INTEGRITY_POLICY_URL]: hangsForever(), [ASSET]: () => bundleResponse() },
      policyTimeoutMs: 15,
      policyAttempts: 3,
    });
    await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(h.requested.filter((path) => path === APP_INTEGRITY_POLICY_URL)).toHaveLength(3);
    expect(h.failures[0]?.text).toContain("3 tentativi");
  });

  it("recovers when the retry succeeds: a transient blip must not block the app", async () => {
    let attempt = 0;
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: (init) => {
          attempt += 1;
          return attempt === 1 ? hangsForever()(init) : jsonResponse(policyJson(true));
        },
        [ASSET]: () => bundleResponse(),
        [MANIFEST]: () => jsonResponse(manifestJson()),
      },
      policyTimeoutMs: 15,
    });

    const res = await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(res.ok).toBe(true);
    expect(await res.text()).toBe(BUNDLE_TEXT);
    expect(h.failures).toEqual([]);
    expect(h.statuses.at(-1)?.status).toBe("verified");
    expect(attempt).toBe(2);
  });

  it("does not retry a server that answered: a 404 is a verdict, not a blip", async () => {
    const h = harness({ routes: { [ASSET]: () => bundleResponse() } });
    await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(h.requested.filter((path) => path === APP_INTEGRITY_POLICY_URL)).toHaveLength(1);
    expect(h.failures[0]?.code).toBe("integrity-policy-unusable");
  });

  it("names both possible causes when the server answers without a policy", async () => {
    const h = harness({ routes: { [ASSET]: () => bundleResponse() } });
    await h.gate.fetch(`${ORIGIN}${ASSET}`);
    const text = h.failures[0]?.text ?? "";
    // A blip behind a proxy and a genuinely incomplete artifact both produce
    // this state; the operator must be told both, not just the second.
    expect(text.toLowerCase()).toContain("portale captive");
    expect(text).toContain("npm run build");
    expect(text.toLowerCase()).toContain("ricaricare");
  });

  it("treats a policy served as unparseable JSON as malformed, not unreachable", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () =>
          new Response("{ broken", { status: 200, headers: { "content-type": "application/json" } }),
        [ASSET]: () => bundleResponse(),
      },
    });
    await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(h.failures[0]?.code).toBe("integrity-policy-unusable");
    expect(h.requested.filter((path) => path === APP_INTEGRITY_POLICY_URL)).toHaveLength(1);
  });

  it("fetches the policy once, however many assets are gated", async () => {
    const h = harness({
      routes: {
        [APP_INTEGRITY_POLICY_URL]: () => jsonResponse(policyJson(true)),
        [ASSET]: () => bundleResponse(),
        [MANIFEST]: () => jsonResponse(manifestJson()),
      },
    });
    await h.gate.fetch(`${ORIGIN}${ASSET}`);
    await h.gate.fetch(`${ORIGIN}${ASSET}`);
    expect(h.requested.filter((path) => path === APP_INTEGRITY_POLICY_URL)).toHaveLength(1);
  });
});

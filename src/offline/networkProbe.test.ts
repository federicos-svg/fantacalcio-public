// The probe has one job: turn "an interface came up" into "our origin answered".
// It has to be impossible to satisfy from cache, and impossible to satisfy by
// whatever intercepted the connection.
import { describe, expect, it } from "vitest";
import { APP_INTEGRITY_POLICY_VERSION } from "./appIntegrityPolicy.js";
import { probeOrigin } from "./networkProbe.js";

const BUILD_ID = "a".repeat(64);

function policyBody(buildId = BUILD_ID): unknown {
  return {
    policy_version: APP_INTEGRITY_POLICY_VERSION,
    build_id: buildId,
    files: [{ url: "/assets/index-abc.js", sha256: "b".repeat(64), bytes: 10 }],
    data: [],
    precache: ["/", "/index.html"],
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

interface Call {
  readonly url: string;
  readonly init?: RequestInit;
}

function harness(respond: (call: Call) => Promise<Response> | Response, expectedBuildId: string | null = BUILD_ID) {
  const calls: Call[] = [];
  let nonce = 0;
  return {
    calls,
    run: () =>
      probeOrigin({
        fetchImpl: async (input, init) => {
          const call = { url: String(input), init };
          calls.push(call);
          return respond(call);
        },
        expectedBuildId,
        nonce: () => String((nonce += 1)),
        timeoutMs: 30,
      }),
  };
}

describe("probeOrigin", () => {
  it("accepts an answer that carries THIS build's policy", async () => {
    const h = harness(() => jsonResponse(policyBody()));
    expect(await h.run()).toEqual({ reachable: true });
  });

  it("cannot be answered from cache: the URL is unique and the HTTP cache is bypassed", async () => {
    const h = harness(() => jsonResponse(policyBody()));
    await h.run();
    await h.run();
    expect(h.calls[0]?.url).toContain("/app-integrity.json?probe=");
    expect(h.calls[0]?.url).not.toBe(h.calls[1]?.url);
    expect(h.calls[0]?.init?.cache).toBe("no-store");
    expect(h.calls[0]?.init?.signal).toBeDefined();
  });

  it("refuses a captive portal's login page, however healthy the status code", async () => {
    const h = harness(
      () => new Response("<!doctype html><title>Wi-Fi login</title>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect(await h.run()).toEqual({ reachable: false, reason: "not-our-origin" });
  });

  it("refuses a well-formed policy that belongs to another build", async () => {
    const h = harness(() => jsonResponse(policyBody("c".repeat(64))));
    expect(await h.run()).toEqual({ reachable: false, reason: "not-our-origin" });
  });

  it("refuses JSON that is not a policy at all", async () => {
    const h = harness(() => jsonResponse({ status: "ok" }));
    expect(await h.run()).toEqual({ reachable: false, reason: "not-our-origin" });
  });

  it("refuses a non-OK status", async () => {
    const h = harness(() => new Response("nope", { status: 502 }));
    expect(await h.run()).toEqual({ reachable: false, reason: "not-our-origin" });
  });

  it("reports no answer when the connection fails", async () => {
    const h = harness(() => {
      throw new TypeError("Failed to fetch");
    });
    expect(await h.run()).toEqual({ reachable: false, reason: "no-answer" });
  });

  it("gives up on a network that accepts and never answers", async () => {
    // Without the bound this test does not finish — which is the point.
    const h = harness(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          call.init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    expect(await h.run()).toEqual({ reachable: false, reason: "no-answer" });
  });

  it("still requires a policy of our own schema when the build id is unknown", async () => {
    const unknown = harness(() => jsonResponse(policyBody("d".repeat(64))), null);
    expect(await unknown.run()).toEqual({ reachable: true });
    const portal = harness(
      () => new Response("<html>portal</html>", { status: 200, headers: { "content-type": "text/html" } }),
      null,
    );
    expect(await portal.run()).toEqual({ reachable: false, reason: "not-our-origin" });
  });
});

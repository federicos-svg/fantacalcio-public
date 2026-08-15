// Registration is best-effort: it must report every outcome and throw none.
// An app that fails to boot because its cache could not be installed would be
// a worse auction-day failure than the one BUNDLE-01 closes.
import { describe, expect, it } from "vitest";
import {
  registerServiceWorker,
  SERVICE_WORKER_SCOPE,
  SERVICE_WORKER_URL,
  type ServiceWorkerRegistrationOutcome,
} from "./serviceWorkerRegistration.js";

describe("registerServiceWorker", () => {
  it("registers at root scope with the HTTP cache bypassed for the worker script", async () => {
    const calls: Array<{ url: string; options?: { scope?: string; updateViaCache?: string } }> = [];
    const outcome = await registerServiceWorker({
      register: async (url, options) => {
        calls.push({ url, options });
        return {};
      },
    });

    expect(outcome).toBe("registered");
    expect(calls).toEqual([
      { url: SERVICE_WORKER_URL, options: { scope: SERVICE_WORKER_SCOPE, updateViaCache: "none" } },
    ]);
  });

  it("reports unsupported instead of throwing when the browser has no service workers", async () => {
    const seen: ServiceWorkerRegistrationOutcome[] = [];
    expect(await registerServiceWorker(null, (outcome) => seen.push(outcome))).toBe("unsupported");
    expect(await registerServiceWorker(undefined)).toBe("unsupported");
    expect(await registerServiceWorker({} as never)).toBe("unsupported");
    expect(seen).toEqual(["unsupported"]);
  });

  it("reports a rejected registration instead of propagating it", async () => {
    const details: string[] = [];
    const outcome = await registerServiceWorker(
      {
        register: async () => {
          throw new Error("SecurityError: not a secure context");
        },
      },
      (_outcome, detail) => details.push(detail),
    );
    expect(outcome).toBe("failed");
    expect(details[0]).toContain("secure context");
  });

  it("reports a non-Error rejection too", async () => {
    const outcome = await registerServiceWorker({
      register: async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal -- the browser can reject with anything
        throw "blocked by policy";
      },
    });
    expect(outcome).toBe("failed");
  });
});

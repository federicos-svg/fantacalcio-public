import { describe, expect, it } from "vitest";
import { classifyHttpStatus, computeBackoffDelayMs, nextRetryDecision } from "../src/retryPolicy.js";
import type { RetryPolicy } from "../src/types.js";

const POLICY: RetryPolicy = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000 };

describe("classifyHttpStatus", () => {
  it("maps 401/403/429 to their non-transient kinds", () => {
    expect(classifyHttpStatus(401)).toBe("unauthorized_401");
    expect(classifyHttpStatus(403)).toBe("forbidden_403");
    expect(classifyHttpStatus(429)).toBe("rate_limited_429");
  });

  it("maps any 5xx to server_error_5xx", () => {
    expect(classifyHttpStatus(500)).toBe("server_error_5xx");
    expect(classifyHttpStatus(503)).toBe("server_error_5xx");
    expect(classifyHttpStatus(599)).toBe("server_error_5xx");
  });

  it("maps anything else to unexpected_schema", () => {
    expect(classifyHttpStatus(200)).toBe("unexpected_schema");
    expect(classifyHttpStatus(302)).toBe("unexpected_schema");
    expect(classifyHttpStatus(418)).toBe("unexpected_schema");
  });
});

describe("nextRetryDecision", () => {
  it("stops on 401 regardless of attempt count", () => {
    expect(nextRetryDecision(0, POLICY, "unauthorized_401")).toBe("stop");
  });

  it("stops on 403", () => {
    expect(nextRetryDecision(0, POLICY, "forbidden_403")).toBe("stop");
  });

  it("stops on 429", () => {
    expect(nextRetryDecision(0, POLICY, "rate_limited_429")).toBe("stop");
  });

  it("stops on unexpected_schema even on the first attempt", () => {
    expect(nextRetryDecision(0, POLICY, "unexpected_schema")).toBe("stop");
  });

  it("stops on not_authorized_in_session and not_callable", () => {
    expect(nextRetryDecision(0, POLICY, "not_authorized_in_session")).toBe("stop");
    expect(nextRetryDecision(0, POLICY, "not_callable")).toBe("stop");
  });

  it("retries a 5xx below maxRetries", () => {
    expect(nextRetryDecision(0, POLICY, "server_error_5xx")).toBe("retry");
    expect(nextRetryDecision(2, POLICY, "server_error_5xx")).toBe("retry");
  });

  it("stops a 5xx once maxRetries is reached", () => {
    expect(nextRetryDecision(3, POLICY, "server_error_5xx")).toBe("stop");
  });
});

describe("computeBackoffDelayMs", () => {
  it("doubles per attempt from baseDelayMs", () => {
    expect(computeBackoffDelayMs(0, POLICY)).toBe(100);
    expect(computeBackoffDelayMs(1, POLICY)).toBe(200);
    expect(computeBackoffDelayMs(2, POLICY)).toBe(400);
  });

  it("caps at maxDelayMs", () => {
    expect(computeBackoffDelayMs(10, POLICY)).toBe(1000);
  });

  it("rejects a negative attempt", () => {
    expect(() => computeBackoffDelayMs(-1, POLICY)).toThrow();
  });
});

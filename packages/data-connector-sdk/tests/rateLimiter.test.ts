import { describe, expect, it } from "vitest";
import { evaluateRateLimit, INITIAL_RATE_LIMITER_STATE } from "../src/rateLimiter.js";
import type { RateLimitPolicy } from "../src/types.js";

const POLICY: RateLimitPolicy = { maxRequestsPerWindow: 2, windowMs: 1000, minIntervalMs: 100 };

describe("evaluateRateLimit", () => {
  it("allows the first request", () => {
    const decision = evaluateRateLimit(INITIAL_RATE_LIMITER_STATE, POLICY, 0);
    expect(decision.allowed).toBe(true);
    expect(decision.waitMs).toBe(0);
    expect(decision.nextState.requestsInWindow).toBe(1);
  });

  it("enforces the minimum interval between requests", () => {
    const first = evaluateRateLimit(INITIAL_RATE_LIMITER_STATE, POLICY, 0);
    const second = evaluateRateLimit(first.nextState, POLICY, 50);
    expect(second.allowed).toBe(false);
    expect(second.waitMs).toBe(50);
  });

  it("allows a second request once minIntervalMs has passed and the window has room", () => {
    const first = evaluateRateLimit(INITIAL_RATE_LIMITER_STATE, POLICY, 0);
    const second = evaluateRateLimit(first.nextState, POLICY, 150);
    expect(second.allowed).toBe(true);
    expect(second.nextState.requestsInWindow).toBe(2);
  });

  it("blocks once the window quota is exhausted, even past minIntervalMs", () => {
    const first = evaluateRateLimit(INITIAL_RATE_LIMITER_STATE, POLICY, 0);
    const second = evaluateRateLimit(first.nextState, POLICY, 150);
    const third = evaluateRateLimit(second.nextState, POLICY, 300);
    expect(third.allowed).toBe(false);
    expect(third.waitMs).toBeGreaterThan(0);
  });

  it("resets the window once windowMs has fully elapsed", () => {
    const first = evaluateRateLimit(INITIAL_RATE_LIMITER_STATE, POLICY, 0);
    const second = evaluateRateLimit(first.nextState, POLICY, 150);
    const afterWindow = evaluateRateLimit(second.nextState, POLICY, 1300);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.nextState.requestsInWindow).toBe(1);
  });

  it("is a pure function: identical input always produces identical output", () => {
    const a = evaluateRateLimit(INITIAL_RATE_LIMITER_STATE, POLICY, 42);
    const b = evaluateRateLimit(INITIAL_RATE_LIMITER_STATE, POLICY, 42);
    expect(a).toEqual(b);
  });
});

import type { RateLimitPolicy } from "./types.js";

export interface RateLimiterState {
  readonly windowStartMs: number;
  readonly requestsInWindow: number;
  readonly lastRequestAtMs: number | null;
}

export const INITIAL_RATE_LIMITER_STATE: RateLimiterState = {
  windowStartMs: 0,
  requestsInWindow: 0,
  lastRequestAtMs: null,
};

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly waitMs: number;
  readonly nextState: RateLimiterState;
}

/**
 * Pure, deterministic token-window rate limiter. The caller supplies `nowMs`
 * explicitly (no `Date.now()` inside) so this is fully unit-testable without
 * real timers and safe to call from a read-only connector without ever
 * touching the clock or the network itself.
 */
export function evaluateRateLimit(
  state: RateLimiterState,
  policy: RateLimitPolicy,
  nowMs: number,
): RateLimitDecision {
  const windowElapsed = nowMs - state.windowStartMs;
  const inSameWindow = windowElapsed < policy.windowMs && state.requestsInWindow > 0;
  const windowStartMs = inSameWindow ? state.windowStartMs : nowMs;
  const requestsInWindow = inSameWindow ? state.requestsInWindow : 0;

  const minIntervalRemaining =
    state.lastRequestAtMs === null ? 0 : Math.max(0, policy.minIntervalMs - (nowMs - state.lastRequestAtMs));

  const windowExhausted = requestsInWindow >= policy.maxRequestsPerWindow;
  const windowRemaining = windowExhausted ? windowStartMs + policy.windowMs - nowMs : 0;

  const waitMs = Math.max(minIntervalRemaining, windowExhausted ? windowRemaining : 0);
  const allowed = waitMs <= 0;

  if (!allowed) {
    return {
      allowed: false,
      waitMs,
      nextState: { windowStartMs, requestsInWindow, lastRequestAtMs: state.lastRequestAtMs },
    };
  }

  return {
    allowed: true,
    waitMs: 0,
    nextState: {
      windowStartMs,
      requestsInWindow: requestsInWindow + 1,
      lastRequestAtMs: nowMs,
    },
  };
}

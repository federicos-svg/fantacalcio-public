import { NON_TRANSIENT_ERROR_KINDS, type ProviderErrorKind, type RetryPolicy } from "./types.js";

/**
 * Classifies an HTTP status into a provider error kind. 401/403/429 are
 * never transitory by design — see `NON_TRANSIENT_ERROR_KINDS`. Only 5xx is
 * ever eligible for a retry.
 */
export function classifyHttpStatus(status: number): ProviderErrorKind {
  if (status === 401) return "unauthorized_401";
  if (status === 403) return "forbidden_403";
  if (status === 429) return "rate_limited_429";
  if (status >= 500 && status < 600) return "server_error_5xx";
  return "unexpected_schema";
}

export type RetryDecision = "stop" | "retry";

/**
 * Fail-closed retry decision: any non-transient kind (401/403/429/unexpected
 * schema/session-not-authorized/not-callable) always stops immediately,
 * regardless of attempt count or policy. Only `server_error_5xx` may retry,
 * and only up to `policy.maxRetries`.
 */
export function nextRetryDecision(
  attempt: number,
  policy: RetryPolicy,
  errorKind: ProviderErrorKind,
): RetryDecision {
  if (NON_TRANSIENT_ERROR_KINDS.includes(errorKind)) return "stop";
  if (errorKind === "server_error_5xx" && attempt < policy.maxRetries) return "retry";
  return "stop";
}

/**
 * Deterministic exponential backoff (no jitter, no `Date.now()`/`Math.random`):
 * `baseDelayMs * 2^attempt`, capped at `maxDelayMs`. `attempt` is 0-based
 * (the delay before the first retry, i.e. after the first failure).
 */
export function computeBackoffDelayMs(attempt: number, policy: RetryPolicy): number {
  if (attempt < 0) throw new Error("attempt must be >= 0");
  const raw = policy.baseDelayMs * 2 ** attempt;
  return Math.min(raw, policy.maxDelayMs);
}

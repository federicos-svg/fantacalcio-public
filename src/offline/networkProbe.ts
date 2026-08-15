// The question "is the network back?" answered by asking the network, and by
// checking that the answer really came from US.
//
// A browser `online` event means an interface came up. It is not evidence that
// this app can be served: a captive portal is "online" by that definition, and
// so is a hotspot that accepts connections and answers nothing. So the event is
// treated as a hypothesis and this module is what tests it.
//
// Two properties make the probe trustworthy:
//
//  1. it cannot be answered from cache. The URL carries a one-shot nonce, which
//     misses every Cache Storage entry (matching is by full URL, search string
//     included), and `cache: "no-store"` keeps the HTTP cache out too. What
//     comes back came from the network, or nothing did;
//  2. it cannot be forged by whatever intercepted the connection. A portal can
//     return 200 with its own login page for any URL; it cannot return THIS
//     build's integrity policy. Comparing `build_id` with the one this page was
//     built from turns "something answered" into "our origin answered".
//
// Same-origin only, one small JSON file, and only while the app already
// believes it is offline — this is not a heartbeat that runs during a healthy
// auction.

import { APP_INTEGRITY_POLICY_URL, parseAppIntegrityPolicy } from "./appIntegrityPolicy.js";

/** Bound on a single probe. Short: this is a local file, and a probe that has
 *  to wait is itself the answer. */
export const PROBE_TIMEOUT_MS = 3000;

export interface ProbeDeps {
  readonly fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** `build_id` this page was built from, when known. */
  readonly expectedBuildId: string | null;
  /** Distinguishes one probe from the next; never a clock. */
  readonly nonce: () => string;
  readonly timeoutMs?: number;
  readonly policyUrl?: string;
}

export type ProbeVerdict =
  | { readonly reachable: true }
  /** Nothing answered in time, or the connection failed outright. */
  | { readonly reachable: false; readonly reason: "no-answer" }
  /** Something answered, but not this origin's build — a portal, a proxy page. */
  | { readonly reachable: false; readonly reason: "not-our-origin" };

export async function probeOrigin(deps: ProbeDeps): Promise<ProbeVerdict> {
  const policyUrl = deps.policyUrl ?? APP_INTEGRITY_POLICY_URL;
  const timeoutMs = deps.timeoutMs ?? PROBE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await deps.fetchImpl(`${policyUrl}?probe=${deps.nonce()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { reachable: false, reason: "not-our-origin" };

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // A portal's HTML login page lands here.
      return { reachable: false, reason: "not-our-origin" };
    }

    const parsed = parseAppIntegrityPolicy(body);
    if (!parsed.ok) return { reachable: false, reason: "not-our-origin" };
    // When the build id is known, identity is exact. When it is not (a dev
    // server, or a boot where the policy never loaded), a well-formed policy of
    // our own schema is still far beyond what an interceptor produces by
    // accident — and it is the strongest claim available without inventing one.
    if (deps.expectedBuildId !== null && parsed.policy.build_id !== deps.expectedBuildId) {
      return { reachable: false, reason: "not-our-origin" };
    }
    return { reachable: true };
  } catch {
    return { reachable: false, reason: "no-answer" };
  } finally {
    clearTimeout(timer);
  }
}

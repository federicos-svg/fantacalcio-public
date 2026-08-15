// The page-side integrity gate (BUNDLE-01 Part 2).
//
// What it is: a wrapper installed over `window.fetch` at import time, BEFORE
// the app module body runs, that intercepts exactly the data assets the build
// declared as hash-protected and refuses to hand their bytes to the app unless
// the sha256 of those exact bytes matches the manifest served next to them.
//
// Why a fetch wrapper and not a call site inside the loader: the verification
// has to cover every path that can reach the bundle — boot, "dimentica"/reload,
// a retry after the deposit fails — and it has to be in place before the first
// of them starts. Wrapping the one function all of them go through is the only
// place where that is true by construction rather than by remembering to call
// it. It is also entirely additive: no existing loader changes, and an asset
// the policy does not mention is passed straight through, arguments untouched.
//
// Fail-closed means all of this, and it is what every branch below implements:
//   - a mismatching bundle is never returned to the app (the wrapper answers
//     with a 503 instead of the bytes), AND the app is covered by a blocking,
//     readable error state — never one without the other, never a silent
//     downgrade to the previous copy;
//   - `crypto.subtle` missing (insecure context) is a failure, not a licence to
//     skip the check;
//   - in a production build, an integrity policy that is missing or malformed
//     fails every `/data/` fetch, because a build that cannot say what it
//     expects cannot be trusted about what it serves.
//
// What it deliberately does NOT do: verify the app shell's own hashes at
// runtime. The code that would run that check is part of the shell it would be
// checking, so the result would prove nothing. The shell hashes in the policy
// exist to derive `build_id` (and with it the cache name), which is a
// packaging guarantee, not a runtime self-attestation.

import {
  APP_INTEGRITY_POLICY_URL,
  parseAppIntegrityPolicy,
  protectedAssetFor,
  type AppIntegrityPolicy,
} from "./appIntegrityPolicy.js";
import {
  bundleIntegrityFailureCode,
  bundleIntegrityFailureText,
  MANIFEST_ABSENT,
  verifyListoneBundle,
  type BundleIntegrityFailure,
  type DigestLike,
} from "./bundleIntegrity.js";
import { DATA_ASSET_PREFIX } from "./swPolicy.js";

export type IntegrityStatus = "verified" | "unverified" | "failed";

export interface IntegrityFailureReport {
  /** Machine-readable failure kind, e.g. `hash-mismatch`. */
  readonly code: string;
  /** The asset the failure is about. */
  readonly assetUrl: string;
  /** The sentence shown on screen. */
  readonly text: string;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface IntegrityGateDeps {
  /** The untouched `fetch` this gate wraps. Also used for its own requests. */
  readonly fetchImpl: FetchLike;
  /** Origin of the page, e.g. `https://example.org`. */
  readonly origin: string;
  /** `crypto.subtle`, or null when the context is not secure. */
  readonly digest: DigestLike | null;
  /** `import.meta.env.PROD` at the edge: a dev server ships no policy and must stay usable. */
  readonly productionBuild: boolean;
  /** Called every time the gate reaches a verdict for an asset. */
  readonly onStatus: (status: IntegrityStatus, detail: string) => void;
  /** Called once per failure — the blocking screen. */
  readonly onFailure: (report: IntegrityFailureReport) => void;
  /** Overridable only for tests. */
  readonly policyUrl?: string;
}

type PolicyState =
  | { readonly kind: "ready"; readonly policy: AppIntegrityPolicy }
  | { readonly kind: "absent" }
  | { readonly kind: "malformed"; readonly errors: readonly string[] };

export interface IntegrityGate {
  /** Drop-in replacement for `window.fetch`. */
  readonly fetch: FetchLike;
  /** Resolves once the policy has been loaded (or found absent) — tests only. */
  readonly ready: Promise<PolicyState>;
}

/** The 503 the app sees instead of unverified bytes. Same shape as any other
 *  refused source, so the existing fail-closed loader path handles it. */
function refusedResponse(code: string): Response {
  return new Response(JSON.stringify({ error: "bundle_integrity_failed", code }), {
    status: 503,
    statusText: "Bundle integrity check failed",
    headers: { "content-type": "application/json" },
  });
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init && typeof init.method === "string") return init.method.toUpperCase();
  if (typeof input === "string" || input instanceof URL) return "GET";
  return input.method.toUpperCase();
}

function urlOf(input: RequestInfo | URL, origin: string): URL | null {
  try {
    if (typeof input === "string") return new URL(input, origin);
    if (input instanceof URL) return input;
    return new URL(input.url, origin);
  } catch {
    return null;
  }
}

export function createIntegrityGate(deps: IntegrityGateDeps): IntegrityGate {
  const policyUrl = deps.policyUrl ?? APP_INTEGRITY_POLICY_URL;
  let reported = false;

  const report = (assetUrl: string, failure: BundleIntegrityFailure): void => {
    const text = bundleIntegrityFailureText(assetUrl, failure);
    deps.onStatus("failed", text);
    // One blocking screen, not one per request: a retry loop must not repaint
    // the same failure over and over.
    if (reported) return;
    reported = true;
    deps.onFailure({ code: bundleIntegrityFailureCode(failure), assetUrl, text });
  };

  const loadPolicy = async (): Promise<PolicyState> => {
    let raw: unknown;
    try {
      const res = await deps.fetchImpl(policyUrl);
      if (!res.ok) return { kind: "absent" };
      raw = await res.json();
    } catch {
      return { kind: "absent" };
    }
    const parsed = parseAppIntegrityPolicy(raw);
    return parsed.ok ? { kind: "ready", policy: parsed.policy } : { kind: "malformed", errors: parsed.errors };
  };

  // Started immediately, at construction: the wrapper awaits this promise
  // before deciding anything, so there is no window in which the app's own
  // first fetch could outrun the policy and slip past the gate.
  const ready = loadPolicy();

  const gatedFetch: FetchLike = async (input, init) => {
    if (methodOf(input, init) !== "GET") return deps.fetchImpl(input, init);
    const url = urlOf(input, deps.origin);
    if (url === null || url.origin !== deps.origin) return deps.fetchImpl(input, init);
    if (url.pathname === policyUrl) return deps.fetchImpl(input, init);

    // Started BEFORE the policy is awaited, on purpose: gating must not put a
    // round trip in front of the app's own boot fetches. The policy is
    // consulted about the RESPONSE, not about whether to send the request, so
    // the two run in parallel and the gate costs no added latency on the path
    // that matters (the listone at boot).
    const responsePromise = deps.fetchImpl(input, init);
    const state = await ready;

    if (state.kind !== "ready") {
      // No usable policy. In a dev build that is normal (nothing is packaged
      // yet) and everything passes through. In a production build it means the
      // artifact was not produced by `npm run build` — so no packaged data
      // payload is trusted at all.
      if (!deps.productionBuild) return responsePromise;
      if (!url.pathname.startsWith(DATA_ASSET_PREFIX)) return responsePromise;
      // The in-flight request is abandoned, not awaited: its bytes are refused
      // either way, and an unobserved rejection must not surface as an error.
      void responsePromise.catch(() => undefined);
      const failure: BundleIntegrityFailure = {
        kind: "integrity-policy-unusable",
        errors: state.kind === "absent" ? [`${policyUrl} non è stato servito da questa build`] : state.errors,
      };
      report(url.pathname, failure);
      return refusedResponse(bundleIntegrityFailureCode(failure));
    }

    const asset = protectedAssetFor(state.policy, url.pathname);
    if (asset === null) return responsePromise;

    // Also parallel: the manifest is fetched while the bundle's body is still
    // arriving. Both are local, both are needed, neither has to wait.
    const manifestPromise = (async (): Promise<unknown | typeof MANIFEST_ABSENT> => {
      try {
        const manifestRes = await deps.fetchImpl(asset.manifestUrl);
        // The content-type check is what makes "not deployed" deterministic,
        // and it is the same rule main.ts already applies to /api/listone: a
        // static host with an SPA fallback answers an unknown path with
        // index.html at status 200, and reading THAT as a manifest would turn
        // "there is no manifest" into "the manifest is corrupt" — two different
        // verdicts with two different consequences. A manifest really served as
        // JSON that fails to parse stays a hard failure below.
        const contentType = (manifestRes.headers.get("content-type") ?? "").toLowerCase();
        if (manifestRes.ok && contentType.includes("application/json")) {
          try {
            return await manifestRes.json();
          } catch {
            return { malformed: "manifest is served as JSON but does not parse" };
          }
        }
        return MANIFEST_ABSENT;
      } catch {
        return MANIFEST_ABSENT;
      }
    })();

    const response = await responsePromise;
    // A source that failed to answer is the app's existing "unavailable" path
    // (fetchStaticListone returns null): nothing was served, so there is
    // nothing to verify and nothing to block.
    if (!response.ok) {
      void manifestPromise.catch(() => undefined);
      return response;
    }

    const bytes = await response.arrayBuffer();
    const manifestJson = await manifestPromise;

    if (manifestJson === MANIFEST_ABSENT && !asset.manifestRequired) {
      // The build did not package a manifest for this asset (today's synthetic
      // proxy listone). Nothing is claimed about these bytes and nothing is
      // degraded either: the state is recorded, visibly and machine-readably,
      // as `unverified` rather than quietly presented as checked. The day the
      // asset ships with its manifest, the build flips manifestRequired and
      // this same branch becomes a hard failure.
      deps.onStatus("unverified", `${url.pathname}: nessun manifest di integrità pacchettizzato`);
      return new Response(bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    const verdict = await verifyListoneBundle({ bytes, manifestJson, digest: deps.digest });
    if (!verdict.ok) {
      report(url.pathname, verdict.failure);
      return refusedResponse(bundleIntegrityFailureCode(verdict.failure));
    }

    deps.onStatus("verified", `${url.pathname}: sha256 ${verdict.sha256} verificato sul manifest`);
    return new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  return { fetch: gatedFetch, ready };
}

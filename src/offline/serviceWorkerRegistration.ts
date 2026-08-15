// Service-worker registration — the smallest possible amount of code that can
// fail without taking the app with it.
//
// Registration is best-effort by design: an app that refuses to start because
// its offline cache could not be installed would be a worse auction-day
// failure than the one BUNDLE-01 is closing. Every outcome is reported back to
// the caller instead of thrown.
//
// `updateViaCache: "none"` is not decoration. Without it the browser may serve
// /sw.js from its own HTTP cache when checking for an update, so a new build
// can keep running the old worker — and therefore the old shell cache — for
// as long as that cached copy is considered fresh. The other half of the same
// guarantee lives in the build: `dist/sw.js` carries the build id in its bytes
// (scripts/build-service-worker.mjs), so a new bundle always produces a
// byte-different worker for the browser to notice.

export const SERVICE_WORKER_URL = "/sw.js";
export const SERVICE_WORKER_SCOPE = "/";

export type ServiceWorkerRegistrationOutcome = "registered" | "unsupported" | "failed";

/** The one method of `navigator.serviceWorker` this module uses. */
export interface ServiceWorkerContainerLike {
  register(
    url: string,
    options?: { scope?: string; updateViaCache?: "imports" | "all" | "none" },
  ): Promise<unknown>;
}

export async function registerServiceWorker(
  container: ServiceWorkerContainerLike | null | undefined,
  onOutcome?: (outcome: ServiceWorkerRegistrationOutcome, detail: string) => void,
): Promise<ServiceWorkerRegistrationOutcome> {
  const notify = (outcome: ServiceWorkerRegistrationOutcome, detail: string): ServiceWorkerRegistrationOutcome => {
    onOutcome?.(outcome, detail);
    return outcome;
  };

  if (container === null || container === undefined || typeof container.register !== "function") {
    return notify("unsupported", "navigator.serviceWorker non disponibile");
  }
  try {
    await container.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE, updateViaCache: "none" });
    return notify("registered", `${SERVICE_WORKER_URL} registrato con scope ${SERVICE_WORKER_SCOPE}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return notify("failed", message);
  }
}

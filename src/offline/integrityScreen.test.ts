// The blocking screen must not contradict itself.
//
// The defect this pins was reproduced live: for `integrity-policy-unreachable`
// — the captive portal at boot, where the network accepts and never answers —
// the screen's first paragraph correctly said «ricarica la pagina appena la
// rete risponde, oppure disconnettiti dalla rete», and the paragraph right
// under it added, unconditionally and for every failure kind, «Ricostruisci o
// riscarica il bundle e il suo manifest». For that case no hash was ever
// computed and there is no artifact to rebuild: it is a wrong instruction, and
// one nobody at the auction table could carry out anyway.
//
// Tested through the pure function rather than the DOM on purpose — this suite
// runs in Node, and the rule under test is a mapping from failure code to text,
// not a rendering detail. The rendered screen is covered end to end in
// e2e/bundle-integrity.spec.ts.
import { describe, expect, it } from "vitest";
import { integrityNextStepsText } from "./integrityScreen.js";
import {
  bundleIntegrityFailureCode,
  bundleIntegrityFailureText,
  type BundleIntegrityFailure,
} from "./bundleIntegrity.js";

const ASSET = "/data/listone_2025_26.json";

/**
 * Every failure the verifier can produce, as the real values — so a renamed or
 * added kind shows up here as a compile error or a new case, never as a silent
 * gap. Codes are taken from `bundleIntegrityFailureCode`, never typed out.
 */
const ALL_FAILURES: readonly BundleIntegrityFailure[] = [
  { kind: "manifest-absent" },
  { kind: "manifest-malformed", errors: ["manifest_version"] },
  { kind: "digest-unavailable" },
  { kind: "digest-failed", message: "boom" },
  { kind: "hash-mismatch", expected: "a".repeat(64), actual: "b".repeat(64) },
  { kind: "size-mismatch", expected: 410, actual: 409 },
  { kind: "bundle-unparseable" },
  { kind: "record-count-mismatch", expected: 4, actual: 3 },
  { kind: "gate-declared-on", gate: "live_ui_ready" },
  { kind: "integrity-policy-unusable", errors: ["non è stato servito"] },
  { kind: "integrity-policy-unreachable", timeoutMs: 2500, attempts: 2 },
];

/** The instruction that must never appear under a policy-level failure. */
const REBUILD_INSTRUCTION = "Ricostruisci o riscarica il bundle";

const POLICY_FAILURES = ALL_FAILURES.filter((failure) => failure.kind.startsWith("integrity-policy-"));

describe("integrityNextStepsText", () => {
  it("adds no rebuild instruction for a policy that never answered", () => {
    // THE regression guard. `integrity-policy-unreachable` means the app never
    // learned what to expect, so it never hashed anything: telling the operator
    // to rebuild the bundle is wrong, and it contradicts the sentence above it.
    const failure: BundleIntegrityFailure = {
      kind: "integrity-policy-unreachable",
      timeoutMs: 2500,
      attempts: 2,
    };
    expect(integrityNextStepsText(bundleIntegrityFailureCode(failure))).toBeNull();
  });

  it("adds nothing for either policy-level failure, because their own text already says what to do", () => {
    expect(POLICY_FAILURES).toHaveLength(2);
    for (const failure of POLICY_FAILURES) {
      const code = bundleIntegrityFailureCode(failure);
      expect(integrityNextStepsText(code), code).toBeNull();
    }
  });

  it("keeps the rebuild instruction for every failure the app actually hashed against", () => {
    // The other half: omitting the advice everywhere would be just as wrong.
    // These failures name an artifact that really is inconsistent, and their own
    // sentence stops at "I dati non vengono caricati" without saying what next.
    const artifactFailures = ALL_FAILURES.filter((failure) => !failure.kind.startsWith("integrity-policy-"));
    expect(artifactFailures.length).toBeGreaterThan(0);
    for (const failure of artifactFailures) {
      const code = bundleIntegrityFailureCode(failure);
      const text = integrityNextStepsText(code);
      expect(text, code).not.toBeNull();
      expect(text, code).toContain(REBUILD_INSTRUCTION);
    }
  });

  it("is silent exactly where the failure's own sentence carries a remedy", () => {
    // Not a restatement of the mapping: it checks the PREMISE the mapping rests
    // on. A policy failure is skipped because `bundleIntegrityFailureText`
    // already tells the operator what to do; if that text ever loses its
    // remedy, silence would stop being the right answer and this fails.
    for (const failure of POLICY_FAILURES) {
      const text = bundleIntegrityFailureText(ASSET, failure);
      expect(text, failure.kind).toMatch(/ricaric/i);
      expect(text, failure.kind).toContain("Nessun payload dati viene caricato");
    }
  });

  it("says the data was not loaded whenever it speaks at all", () => {
    // The one piece of information the generic paragraph carried that is true
    // for every kind. Dropping it along with the wrong advice would be the
    // value-reducing version of this fix.
    const text = integrityNextStepsText("hash-mismatch");
    expect(text).not.toBeNull();
    expect(text).toContain("Nessun dato di questo bundle è stato caricato");
  });

  it("treats an unknown code as an artifact failure", () => {
    // Fail-safe direction: a future failure kind gets the generic advice until
    // someone decides otherwise, rather than silently losing its "what now".
    expect(integrityNextStepsText("some-future-kind")).toContain(REBUILD_INSTRUCTION);
  });
});

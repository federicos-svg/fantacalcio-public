// The blocking screen for an integrity failure, plus the machine-readable
// status marker.
//
// Two rules shape this file:
//
// 1. It never touches `#app`. The app owns that node and rewrites it on every
//    render (see main.ts render()), so anything appended inside would be wiped
//    on the next repaint. This screen is a sibling of `#app` on <body>, which
//    also means it survives — deliberately — every re-render underneath it.
//
// 2. It carries its own colours inline instead of using the app's CSS custom
//    properties. This screen exists precisely for the case where what was
//    served cannot be trusted; making it depend on a stylesheet that may itself
//    be part of the problem would be a fragile way to say so. Inline styles
//    also keep it out of src/styles/*.css, which stays owned by the UI work.
//
// The wording matters as much as the block: "cosa non torna" is spelled out by
// bundleIntegrityFailureText (src/offline/bundleIntegrity.ts) — which asset,
// what was expected, what was actually served.
//
// And a third rule, learned from a defect: this screen adds no advice of its
// own on top of a failure that already carries the right one. See
// integrityNextStepsText below.

import type { IntegrityFailureReport, IntegrityStatus } from "./integrityGate.js";

export const INTEGRITY_SCREEN_ID = "bundle-integrity-blocked";
export const INTEGRITY_STATUS_ATTRIBUTE = "data-fac-bundle-integrity";
export const INTEGRITY_HEADING_ID = "bundle-integrity-heading";
export const INTEGRITY_NEXT_STEPS_ID = "bundle-integrity-next-steps";

/**
 * The failures whose own sentence already tells the operator what to do, so the
 * generic instruction below must NOT be added under it.
 *
 * Both are policy-level: the app never got as far as computing a hash, because
 * it never learned what this build expects. `integrity-policy-unreachable` is
 * the captive portal at boot — the network accepts and never answers — and
 * `integrity-policy-unusable` is the policy that arrived unreadable, which
 * bundleIntegrityFailureText already splits into its two causes and their two
 * different remedies.
 *
 * This exists because the screen used to append "Ricostruisci o riscarica il
 * bundle e il suo manifest" unconditionally, under a first paragraph that for
 * the captive-portal case correctly said the opposite («ricarica appena la rete
 * risponde, oppure disconnettiti»). Reproduced live in review. Two instructions
 * that contradict each other are worse than one, and at the auction table the
 * generic one cannot even be carried out: there is no artifact to rebuild, only
 * a network that is not answering.
 */
const SELF_EXPLAINING_FAILURE_CODES: ReadonlySet<string> = new Set([
  "integrity-policy-unreachable",
  "integrity-policy-unusable",
]);

/**
 * The "what now" paragraph, or `null` when `report.text` already covers it.
 *
 * Pure and exported so the rule is testable without a DOM: the screen renders
 * whatever this returns and adds nothing of its own.
 */
export function integrityNextStepsText(code: string): string | null {
  if (SELF_EXPLAINING_FAILURE_CODES.has(code)) return null;
  return (
    "Nessun dato di questo bundle è stato caricato. Ricostruisci o riscarica il bundle e il suo manifest, " +
    "poi ricarica la pagina. Finché l'hash non corrisponde, l'app resta bloccata di proposito."
  );
}

/**
 * Publishes the current verdict on <html> so it is observable without scraping
 * text: `verified`, `unverified` (nothing was packaged to check against) or
 * `failed`. Once `failed`, it never goes back — a later, unrelated success must
 * not erase the record of a refusal.
 */
export function setIntegrityStatus(doc: Document, status: IntegrityStatus): void {
  const root = doc.documentElement;
  if (root.getAttribute(INTEGRITY_STATUS_ATTRIBUTE) === "failed") return;
  root.setAttribute(INTEGRITY_STATUS_ATTRIBUTE, status);
}

/**
 * Replaces the usable app with the failure. Idempotent: a second failure
 * updates nothing, because the first one is the one that explains what
 * happened.
 */
export function showIntegrityBlockingScreen(doc: Document, report: IntegrityFailureReport): void {
  if (doc.getElementById(INTEGRITY_SCREEN_ID) !== null) return;

  const overlay = doc.createElement("div");
  overlay.id = INTEGRITY_SCREEN_ID;
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-live", "assertive");
  overlay.setAttribute("aria-labelledby", INTEGRITY_HEADING_ID);
  overlay.setAttribute("data-integrity-code", report.code);
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:24px",
    "background:#0b0d12",
    "color:#f2f4f8",
    "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    "overflow:auto",
  ].join(";");

  const panel = doc.createElement("div");
  panel.style.cssText = [
    "max-width:720px",
    "width:100%",
    "border:2px solid #d9534f",
    "border-radius:12px",
    "background:#15181f",
    "padding:24px",
  ].join(";");

  const heading = doc.createElement("h1");
  heading.id = INTEGRITY_HEADING_ID;
  heading.textContent = "Bundle non verificato: app bloccata";
  heading.style.cssText = "margin:0 0 12px;font-size:1.35rem;color:#ff8a84";

  const body = doc.createElement("p");
  body.id = "bundle-integrity-detail";
  body.textContent = report.text;
  body.style.cssText = "margin:0 0 12px;line-height:1.5;font-size:1rem";

  const nextStepsText = integrityNextStepsText(report.code);

  const code = doc.createElement("p");
  code.id = "bundle-integrity-code";
  code.textContent = `Codice: ${report.code} — asset: ${report.assetUrl}`;
  // Last element when there is no "what now" paragraph, so it carries no
  // trailing margin then.
  code.style.cssText = `margin:0 0 ${nextStepsText === null ? "0" : "12px"};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.85rem;color:#c8ccd6;word-break:break-all`;

  panel.append(heading, body, code);

  if (nextStepsText !== null) {
    const next = doc.createElement("p");
    next.id = INTEGRITY_NEXT_STEPS_ID;
    next.textContent = nextStepsText;
    next.style.cssText = "margin:0;line-height:1.5;font-size:0.95rem;color:#c8ccd6";
    panel.append(next);
  }
  overlay.appendChild(panel);
  doc.body.appendChild(overlay);
  // The page underneath must not scroll behind the block, and focus moves to
  // the heading so the failure is announced rather than merely painted.
  doc.body.style.overflow = "hidden";
  heading.setAttribute("tabindex", "-1");
  heading.focus();
}

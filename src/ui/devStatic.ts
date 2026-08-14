// Single marker pattern for "not wired up yet" UI in the development shell.
// Rule (do not deviate): dashed red border on the panel (signals
// "provisional"), an AMBER "DEV STATICO" chip/badge/note (never red — red
// is reserved for the real STOP/Violations badge, so the two are never
// confusable by color alone), and a short honest sentence explaining what
// is missing. No real data, no fake prediction, no numeric value that
// could be mistaken for a real one.

import { C, DEV_BORDER, DEV_ACCENT, DEV_ACCENT_TEXT } from "./theme.js";

/** Full panel: wraps a block that doesn't do anything real yet. */
export function devStaticPanel(title: string, note: string, inner: HTMLElement | string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `position:relative;border:2px dashed ${DEV_BORDER};border-radius:12px;padding:18px 20px 16px;background:${C.panel};`;

  const chip = document.createElement("span");
  chip.textContent = "DEV STATICO";
  chip.style.cssText = `position:absolute;top:-11px;right:14px;background:${DEV_ACCENT};color:${DEV_ACCENT_TEXT};font-size:10px;font-weight:800;letter-spacing:0.05em;padding:2px 8px;border-radius:4px;`;
  wrap.appendChild(chip);

  if (title) {
    const t = document.createElement("div");
    t.style.cssText = `font-size:12px;font-weight:700;letter-spacing:0.07em;color:${C.textSec};margin-bottom:10px;`;
    t.textContent = title;
    wrap.appendChild(t);
  }

  const body = document.createElement("div");
  if (typeof inner === "string") {
    body.style.cssText = `font-size:13px;line-height:1.5;color:${C.textDim};`;
    body.textContent = inner;
  } else {
    body.appendChild(inner);
  }
  wrap.appendChild(body);

  const noteEl = document.createElement("div");
  noteEl.style.cssText = `font-size:11px;line-height:1.4;color:${DEV_ACCENT};margin-top:10px;font-style:italic;`;
  noteEl.textContent = note;
  wrap.appendChild(noteEl);

  return wrap;
}

/**
 * Inline marker for a single non-operative control (e.g. an icon button
 * inside an otherwise real/dynamic block, like the Rose grid). Clicking the
 * control should open a mock modal (see main.ts openMock) rather than doing
 * nothing silently.
 */
export function devStaticBadge(): HTMLElement {
  const badge = document.createElement("span");
  badge.textContent = "DEV";
  badge.title = "Controllo non operativo in questa shell di sviluppo.";
  badge.style.cssText = `font-size:8.5px;font-weight:800;letter-spacing:0.04em;color:${DEV_ACCENT_TEXT};background:${DEV_ACCENT};border-radius:3px;padding:0 3px;margin-left:4px;vertical-align:middle;`;
  return badge;
}

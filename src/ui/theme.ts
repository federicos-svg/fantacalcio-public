// Shared palette + tiny DOM utility. Extracted from main.ts so devStatic.ts
// and views.ts can reuse the same tokens without duplicating them.

export const C = {
  bg: "oklch(0.19 0.008 270)",
  panel: "oklch(0.24 0.01 270)",
  panelInner: "oklch(0.28 0.012 270)",
  border: "oklch(0.32 0.012 270)",
  accent: "oklch(0.55 0.13 250)",
  accentDim: "oklch(0.35 0.06 250)",
  textPrimary: "oklch(0.96 0.005 270)",
  textSec: "oklch(0.62 0.01 270)",
  textMid: "oklch(0.82 0.006 270)",
  textDim: "oklch(0.5 0.01 270)",
  stopRed: "oklch(0.66 0.19 25)",
  stopRedDark: "oklch(0.5 0.16 25)",
  green: "oklch(0.65 0.15 145)",
  mono: "ui-monospace,'SF Mono',Menlo,Consolas,monospace",
};

/**
 * DEV-shell marker colors. The panel border stays RED + DASHED (signals
 * "provisional", same family as STOP so it still reads as "pay attention")
 * — but the chip/badge/note use an AMBER accent, not red, so the "DEV
 * STATICO" label can never be mistaken for the "STOP" badge at a glance:
 * different hue (75 = amber vs 25 = red), not just a different border
 * style. STOP means "auction plan infeasible, act now"; DEV STATICO means
 * "not implemented yet, informational only".
 */
export const DEV_BORDER = "oklch(0.62 0.19 25)";
export const DEV_ACCENT = "oklch(0.78 0.15 75)";
export const DEV_ACCENT_TEXT = "oklch(0.2 0.03 75)";

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Uniform role chip palette (P/D/C/A) — one dot+letter look everywhere a
 * role appears, instead of ad-hoc plain text per screen. C reuses the
 * app's existing accent blue (no new near-duplicate token). A is red but
 * at a different hue (18) than the STOP badge (hue 25, C.stopRed) — same
 * "role at a glance" convention as most Fantacalcio apps, deliberately not
 * identical to the STOP token so the two stay visually distinct.
 */
export const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  P: { bg: "oklch(0.82 0.14 95)", text: "oklch(0.25 0.03 95)" },
  D: { bg: "oklch(0.65 0.16 145)", text: "white" },
  C: { bg: C.accent, text: "white" },
  A: { bg: "oklch(0.62 0.22 18)", text: "white" },
};

const ROLE_CHIP_STYLE =
  "display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;font-size:10px;font-weight:800;line-height:1;flex:none;";

/** HTML-string chip, for embedding inline in existing innerHTML templates. */
export function roleChipHtml(role: string): string {
  const c = ROLE_COLORS[role];
  if (!c) return escHtml(role);
  return `<span style="${ROLE_CHIP_STYLE}background:${c.bg};color:${c.text};">${escHtml(role)}</span>`;
}

/** DOM-element chip, for spots that build nodes via createElement. */
export function renderRoleChip(role: string): HTMLElement {
  const c = ROLE_COLORS[role];
  const span = document.createElement("span");
  span.textContent = role;
  span.style.cssText = `${ROLE_CHIP_STYLE}background:${c?.bg ?? C.textDim};color:${c?.text ?? "white"};`;
  return span;
}

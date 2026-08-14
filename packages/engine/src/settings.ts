// Auction settings — Batch 3 (data-free, gate-safe).
// Aggressiveness is the single human knob (DECISIONS D3). It maps to α, the
// tolerance used by the future fair-to-me inequality (DECISIONS l.35).
// NOTE: α is defined here but intentionally NOT wired to any bid / value /
// fair-to-me / target_band / stretch_cap. Those consumers arrive post-gate
// (Batch 4/5). This module is pure config: no state, no data, no directives.

/** The only human-tunable strategy knob during the auction. */
export type Aggressiveness = "Prudente" | "Media" | "Aggressiva";

/** Default per DECISIONS D3. */
export const DEFAULT_AGGRESSIVENESS: Aggressiveness = "Media";

/**
 * α v1 — tolerance multiplier per aggressiveness level.
 * Values are v1, deliberately tunable in future, NOT placeholders.
 * Monotone: Prudente < Media < Aggressiva.
 */
const ALPHA_V1: Readonly<Record<Aggressiveness, number>> = {
  Prudente: 0.85,
  Media: 1.0,
  Aggressiva: 1.15,
};

/**
 * Pure mapping aggressiveness -> α. Deterministic; exhaustive over the union.
 * Does NOT consume or produce any auction state or directive output.
 */
export function alphaFor(aggressiveness: Aggressiveness): number {
  const alpha = ALPHA_V1[aggressiveness];
  if (alpha === undefined) {
    // Unreachable for valid Aggressiveness; guards against widened inputs.
    throw new Error(`unknown aggressiveness: ${aggressiveness as string}`);
  }
  return alpha;
}

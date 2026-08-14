// Per-role structural budget envelope readout — issue #265 item #1.
//
// `budgetPlan(team).perRole` (packages/engine/src/budget.ts, untouched by
// this batch) already computes slotsRemaining/minReserve/maxAllocatable for
// every role; renderCriticalAuctionStrip() (src/main.ts) already calls
// budgetPlan(), but until now never rendered `.perRole` — this module is
// the missing display step, nothing more. Pure accounting: no value/target/
// price field, no recommendation, no directive label (docs/NO_GO.md
// §Prodotto, matrice UI §3 "Contabilità... | Visibile | Nessuno").
//
// Pure string builder (like theme.ts's roleChipHtml) so it is unit-testable
// without jsdom/happy-dom — this project has neither configured (see
// src/ui/theme.test.ts). main.ts only splices the returned markup into the
// critical strip's innerHTML; it owns no logic of its own.

import type { RoleBudgetEnvelope } from "../../packages/engine/src/budget.js";

/**
 * One role's plan cell: three short numeric fields, no prose — has to stay
 * readable "sotto pressione" (mid-auction) at the smallest rehearsal
 * viewport (390px). `slot` restates slotsRemaining next to the roster bar
 * above it; `min`/`max` are minReserve/maxAllocatable, the two numbers the
 * engine computes but the UI never showed before this batch.
 *
 * A literal " · " separates the three <span> items (not just CSS gap) so
 * the numbers stay distinguishable in plain textContent too — assistive
 * tech and Playwright's textContent-based assertions read the raw text,
 * which CSS spacing does not affect.
 */
export function roleBudgetPlanHtml(envelope: RoleBudgetEnvelope): string {
  const items: readonly { readonly label: string; readonly value: number }[] = [
    { label: "slot", value: envelope.slotsRemaining },
    { label: "min", value: envelope.minReserve },
    { label: "max", value: envelope.maxAllocatable },
  ];
  return items
    .map((item) => `<span class="critical-role-plan-item"><em>${item.label}</em>${item.value}</span>`)
    .join(" · ");
}

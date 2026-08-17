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
import { ROLE_MAX_LABEL } from "./budgetLabels.js";

/**
 * One role's plan cell: three short numeric fields, no prose — has to stay
 * readable "sotto pressione" (mid-auction) at the smallest rehearsal
 * viewport (390px). `slot` restates slotsRemaining next to the roster bar
 * above it; `min`/`max reparto` are minReserve/maxAllocatable, the two
 * numbers the engine computes but the UI never showed before this batch.
 *
 * PERCHÉ «max reparto» E NON «max». Questa cella vive dentro la fascia
 * critica, a poche decine di pixel dalla metrica «Max bid sicuro», che è
 * un'ALTRA grandezza: maxSafe() è il tetto di UNA offerta, maxAllocatable è
 * quanto l'intero reparto può ancora assorbire su tutti i suoi slot insieme.
 * Coincidono solo con un solo slot libero nel reparto; con due o più la
 * seconda è strutturalmente maggiore (di hardReserve(slot − 1)) e la stessa
 * sigla «max» faceva leggere due cifre diverse come la stessa. Il nome sta
 * in src/ui/budgetLabels.ts, con l'altro: due grandezze, due nomi.
 *
 * `min` resta senza qualificatore: è la riserva dello STESSO reparto (lo
 * dicono i due numeri accanto, `slot` e `max reparto`) e non collide con
 * nessun'altra etichetta a schermo, mentre ogni parola in più costa la
 * lettura in due secondi che questa cella deve reggere a 390px.
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
    { label: ROLE_MAX_LABEL, value: envelope.maxAllocatable },
  ];
  return items
    .map((item) => `<span class="critical-role-plan-item"><em>${item.label}</em>${item.value}</span>`)
    .join(" · ");
}

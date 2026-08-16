import { describe, it, expect } from "vitest";
import { roleBudgetPlanHtml } from "./roleBudgetPlan.js";
import type { RoleBudgetEnvelope } from "../../packages/engine/src/budget.js";

// Issue #265 item #1: budgetPlan().perRole was computed but never rendered.
// This is the pure formatting seam — main.ts only splices the returned
// markup in; no DOM here, so no jsdom/happy-dom needed (see
// src/ui/theme.test.ts for the same reasoning).

const envelope = (over: Partial<RoleBudgetEnvelope> = {}): RoleBudgetEnvelope => ({
  role: "D",
  slotsRemaining: 9,
  minReserve: 9,
  maxAllocatable: 481,
  ...over,
});

describe("roleBudgetPlanHtml", () => {
  it("renders slotsRemaining, minReserve and maxAllocatable as plain numbers", () => {
    const html = roleBudgetPlanHtml(envelope());
    expect(html).toContain(">9<");
    expect(html).toContain(">481<");
  });

  it("carries no prose — only the three short numeric labels", () => {
    const html = roleBudgetPlanHtml(envelope());
    expect(html).toContain("<em>slot</em>");
    expect(html).toContain("<em>min</em>");
    // «max reparto», non «max»: maxAllocatable è il tetto dell'INTERO reparto,
    // e la sigla nuda era la stessa che la fascia critica e la war board
    // usavano per maxSafe — il tetto di UNA offerta, un'altra grandezza.
    // Divergenza e leggibilità delle due etichette: src/ui/maxLabels.test.ts.
    expect(html).toContain("<em>max reparto</em>");
    expect(html).not.toContain("<em>max</em>");
    // No recommendation/directive wording of any kind.
    expect(html.toLowerCase()).not.toMatch(/consigli|suggeri|target|prezzo equo/);
  });

  it("reflects each field independently for a role with a different envelope", () => {
    const html = roleBudgetPlanHtml(envelope({ slotsRemaining: 0, minReserve: 0, maxAllocatable: 0 }));
    expect(html).toContain(">0<");
    expect(html.match(/>0</g)?.length).toBe(3);
  });

  it("uses stable class hooks for e2e/CSS targeting", () => {
    const html = roleBudgetPlanHtml(envelope());
    expect(html.match(/class="critical-role-plan-item"/g)?.length).toBe(3);
  });

  it("separates the three items with a literal middle dot, not CSS gap alone", () => {
    // Assistive tech and DOM textContent-based assertions read raw text —
    // CSS spacing alone would merge "slot9min9max481" into one token.
    const html = roleBudgetPlanHtml(envelope({ slotsRemaining: 9, minReserve: 9, maxAllocatable: 481 }));
    expect(html).toContain("slot</em>9</span> · <span");
    expect(html).toContain("min</em>9</span> · <span");
  });
});

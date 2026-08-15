import { describe, it, expect } from "vitest";
import {
  COST_FLOOR,
  INITIAL_BUDGET,
  ROLES,
  ROSTER_REQUIREMENTS,
  TOTAL_SLOTS,
  budgetPlan,
  fitsPlan,
  livePlan,
  validateRolePlan,
  type Role,
} from "../src/index.js";
import { TEAMS, buildLog, buy, fillRole, stateOf } from "./layer2Fixtures.js";
import { plan } from "./layer3Fixtures.js";

const SELF = TEAMS[0]!;

/** Il piano dichiarato di riferimento: 450 crediti su 500, 50 lasciati liberi. */
const DECLARED = plan({ P: 20, D: 80, C: 140, A: 210 });

function planOf(specs: Parameters<typeof buildLog>[0], declared = DECLARED) {
  const state = stateOf(buildLog(specs));
  return livePlan({ team: state.teams[SELF]!, plan: declared });
}

describe("validateRolePlan — fail-closed", () => {
  it("accetta un piano pulito", () => {
    expect(validateRolePlan(DECLARED)).toEqual({ ok: true, issues: [] });
  });

  it.each([
    ["NaN", Number.NaN],
    ["negativo", -1],
  ])("rifiuta un target %s, indicando il ruolo", (_label, target) => {
    const result = validateRolePlan(plan({ P: 20, D: 80, C: 140, A: target }));
    expect(result.issues).toEqual([{ role: "A", violation: "target-invalid" }]);
  });

  it("rifiuta un piano senza versione: una spiegazione deve poterla citare", () => {
    const result = validateRolePlan(plan({ P: 1 }, ""));
    expect(result.issues).toEqual([{ role: null, violation: "plan-version-empty" }]);
  });

  it("rifiuta una somma sopra la dotazione iniziale di lega", () => {
    const result = validateRolePlan(plan({ P: 100, D: 100, C: 200, A: 200 }));
    expect(result.issues).toEqual([{ role: null, violation: "total-exceeds-initial-budget" }]);
  });

  it("non aggiunge il totale quando un target è già invalido (niente NaN nella somma)", () => {
    const result = validateRolePlan(plan({ P: Number.NaN, D: 80, C: 140, A: 210 }));
    expect(result.issues.map((i) => i.violation)).toEqual(["target-invalid"]);
  });

  it("livePlan lancia su un piano invalido", () => {
    const state = stateOf([]);
    expect(() => livePlan({ team: state.teams[SELF]!, plan: plan({ A: -1 }) })).toThrow(
      /invalid role plan/,
    );
  });
});

describe("livePlan — stato iniziale, nessun acquisto", () => {
  const result = planOf([]);

  it("alloca esattamente i target dichiarati quando ci stanno tutti", () => {
    expect(result.perRole.P.allocation).toBe(20);
    expect(result.perRole.D.allocation).toBe(80);
    expect(result.perRole.C.allocation).toBe(140);
    expect(result.perRole.A.allocation).toBe(210);
    expect(result.overCommitted).toBe(false);
    expect(result.reallocationBasis).toBe("declared-residual-targets");
  });

  it("il budget libero vero è ciò che il piano non impegna", () => {
    expect(result.unallocated).toBe(INITIAL_BUDGET - 450);
    expect(result.budgetResidual).toBe(INITIAL_BUDGET);
    expect(result.totalSlotsRemaining).toBe(TOTAL_SLOTS);
  });

  it("nessun ruolo è chiuso e non c'è niente da riallocare", () => {
    expect(result.freedByClosedRoles).toBe(0);
    for (const role of ROLES) {
      expect(result.perRole[role].closed).toBe(false);
      expect(result.perRole[role].reallocated).toBe(0);
    }
  });

  it("porta la versione del piano usata (§4.1)", () => {
    expect(result.planVersion).toBe("test-plan-1");
  });

  it("riusa `budgetPlan` invece di riderivare riserva e tetti", () => {
    const state = stateOf([]);
    const envelope = budgetPlan(state.teams[SELF]!);
    expect(result.totalReserve).toBe(envelope.totalReserve);
    for (const role of ROLES) {
      expect(result.perRole[role].minReserve).toBe(envelope.perRole[role].minReserve);
      expect(result.perRole[role].maxAllocatable).toBe(envelope.perRole[role].maxAllocatable);
    }
  });
});

describe("livePlan — ricalcolo a ogni assegnazione (il navigatore)", () => {
  it("spendere sotto il target di ruolo alza la disponibilità per slot residuo", () => {
    const before = planOf([]);
    const after = planOf([buy("a1", "A", SELF, 10)]);
    expect(after.perRole.A.spent).toBe(10);
    expect(after.perRole.A.residualTarget).toBe(200);
    expect(after.perRole.A.slotsRemaining).toBe(ROSTER_REQUIREMENTS.A - 1);
    expect(after.perRole.A.perSlotHeadroom!).toBeGreaterThan(before.perRole.A.perSlotHeadroom!);
  });

  it("spendere sopra il target di ruolo abbassa la disponibilità per slot residuo", () => {
    const before = planOf([]);
    const after = planOf([buy("a1", "A", SELF, 120)]);
    expect(after.perRole.A.perSlotHeadroom!).toBeLessThan(before.perRole.A.perSlotHeadroom!);
  });

  it("le riconferme contano già contro il target del ruolo", () => {
    // Riconferma D a 30 (LEAGUE_RULES §4): i crediti sono usciti dal budget
    // prima della prima chiamata, quindi il piano del ruolo D deve saperlo.
    const state = stateOf([], [{ fantaTeamId: SELF, playerId: "d_conf", role: "D", price: 30 }]);
    const result = livePlan({ team: state.teams[SELF]!, plan: DECLARED });
    expect(result.perRole.D.spent).toBe(30);
    expect(result.perRole.D.residualTarget).toBe(80 - 30);
    expect(result.perRole.D.slotsRemaining).toBe(ROSTER_REQUIREMENTS.D - 1);
    expect(result.budgetResidual).toBe(INITIAL_BUDGET - 30);
  });

  it("mostra lo scostamento spesa-piano invece di riscrivere il target", () => {
    const after = planOf([buy("p1", "P", SELF, 35)]);
    expect(after.perRole.P.declaredTarget).toBe(20);
    expect(after.perRole.P.spent).toBe(35);
    expect(after.perRole.P.overspend).toBe(15);
    expect(after.perRole.P.residualTarget).toBe(0);
  });
});

describe("livePlan — riallocazione quando un ruolo si chiude", () => {
  // Portiere dichiarato a 60 e completato a 15: 45 crediti tornano liberi.
  const FREEING = plan({ P: 60, D: 80, C: 140, A: 210 });
  const specs = fillRole(SELF, "P", 3, 5);
  const result = planOf(specs, FREEING);

  it("libera i crediti residui del ruolo chiuso", () => {
    expect(result.perRole.P.closed).toBe(true);
    expect(result.perRole.P.slotsRemaining).toBe(0);
    expect(result.perRole.P.perSlotHeadroom).toBeNull();
    expect(result.freedByClosedRoles).toBe(60 - 15);
  });

  it("un ruolo chiuso non tiene allocazione: non gli serve più nulla", () => {
    expect(result.perRole.P.allocation).toBe(0);
  });

  it("li ridistribuisce ai ruoli aperti, in proporzione ai target residui DI OWNER", () => {
    for (const role of ["D", "C", "A"] as const) {
      expect(result.perRole[role].reallocated).toBeGreaterThan(0);
    }
    // Proporzionale ai residui dichiarati: A (210) riceve più di C (140), che
    // riceve più di D (80). Le proporzioni sono le sue, non del sistema.
    expect(result.perRole.A.reallocated).toBeGreaterThan(result.perRole.C.reallocated);
    expect(result.perRole.C.reallocated).toBeGreaterThan(result.perRole.D.reallocated);
    expect(result.reallocationBasis).toBe("declared-residual-targets");
  });

  it("l'arrotondamento per difetto lascia il resto visibile invece di spalmarlo", () => {
    const allocated = ROLES.reduce((sum, role) => sum + result.perRole[role].allocation, 0);
    expect(result.unallocated).toBe(result.budgetResidual - allocated);
    expect(result.unallocated).toBeGreaterThanOrEqual(0);
  });

  it("non rialloca verso un ruolo a cui Owner non ha destinato nulla", () => {
    const noAttack = planOf(fillRole(SELF, "P", 3, 5), plan({ P: 60, D: 80, C: 140, A: 0 }));
    expect(noAttack.perRole.A.residualTarget).toBe(0);
    expect(noAttack.perRole.A.allocation).toBe(noAttack.perRole.A.minReserve);
    expect(noAttack.perRole.A.reallocated).toBe(noAttack.perRole.A.minReserve);
  });

  it("perdere un obiettivo non consuma budget: il piano resta quello di prima", () => {
    // Un rivale si prende il giocatore: l'acquisto NON è mio. Il mio piano non
    // perde crediti, e la sua allocazione per ruolo resta identica.
    const mine = planOf([]);
    const lost = planOf([buy("a1", "A", TEAMS[1]!, 90)]);
    expect(lost.perRole.A.allocation).toBe(mine.perRole.A.allocation);
    expect(lost.perRole.A.slotsRemaining).toBe(mine.perRole.A.slotsRemaining);
    expect(lost.budgetResidual).toBe(mine.budgetResidual);
  });
});

describe("livePlan — invarianti contabili", () => {
  const SCENARIOS: readonly (readonly [string, ReturnType<typeof buildLog>])[] = [
    ["vuoto", buildLog([])],
    ["portieri chiusi", buildLog(fillRole(SELF, "P", 3, 5))],
    ["un big preso", buildLog([buy("a1", "A", SELF, 180)])],
    ["quasi tutto speso", buildLog([buy("a1", "A", SELF, 400)])],
    [
      "rosa quasi piena",
      buildLog([
        ...fillRole(SELF, "P", 3, 20),
        ...fillRole(SELF, "D", 9, 20),
        ...fillRole(SELF, "C", 9, 20),
        ...fillRole(SELF, "A", 4, 20),
      ]),
    ],
  ];

  it.each(SCENARIOS)("[%s] ogni allocazione copre la riserva dura del ruolo", (_label, log) => {
    const state = stateOf(log);
    const result = livePlan({ team: state.teams[SELF]!, plan: DECLARED });
    for (const role of ROLES) {
      const line = result.perRole[role];
      expect(line.allocation).toBeGreaterThanOrEqual(line.minReserve);
      expect(line.allocation).toBe(Math.trunc(line.allocation));
    }
  });

  it.each(SCENARIOS)(
    "[%s] la somma delle allocazioni non supera il budget residuo (rosa completabile)",
    (_label, log) => {
      const state = stateOf(log);
      const result = livePlan({ team: state.teams[SELF]!, plan: DECLARED });
      const allocated = ROLES.reduce((sum, role) => sum + result.perRole[role].allocation, 0);
      if (result.isCompletable) {
        expect(allocated).toBeLessThanOrEqual(result.budgetResidual);
        expect(result.unallocated).toBeGreaterThanOrEqual(0);
      }
      expect(result.unallocated).toBe(result.budgetResidual - allocated);
    },
  );

  it("comprime il piano invece di romperlo quando non ci sta più", () => {
    const result = planOf([buy("a1", "A", SELF, 400)]);
    expect(result.overCommitted).toBe(true);
    expect(result.isCompletable).toBe(true);
    const allocated = ROLES.reduce((sum, role) => sum + result.perRole[role].allocation, 0);
    expect(allocated).toBeLessThanOrEqual(result.budgetResidual);
  });

  it("con la rosa non completabile mostra lo scoperto invece di rimpicciolire il piano", () => {
    const specs = [
      ...fillRole(SELF, "P", 3, 20),
      ...fillRole(SELF, "D", 9, 20),
      ...fillRole(SELF, "C", 9, 20),
      ...fillRole(SELF, "A", 4, 20),
    ];
    const result = planOf(specs);
    expect(result.budgetResidual).toBe(0);
    expect(result.isCompletable).toBe(false);
    expect(result.budgetShortfall).toBe(3 * COST_FLOOR);
    expect(result.unallocated).toBe(-result.budgetShortfall);
  });

  it("con la rosa completa non resta niente da allocare", () => {
    const specs = [
      ...fillRole(SELF, "P", 3, 1),
      ...fillRole(SELF, "D", 9, 1),
      ...fillRole(SELF, "C", 9, 1),
      ...fillRole(SELF, "A", 7, 1),
    ];
    const result = planOf(specs);
    expect(result.totalSlotsRemaining).toBe(0);
    expect(result.reallocationBasis).toBe("roster-complete");
    for (const role of ROLES) expect(result.perRole[role].allocation).toBe(0);
    expect(result.unallocated).toBe(result.budgetResidual);
  });

  it("piano esaurito con slot aperti: resta la sola riserva dura, dichiarata", () => {
    const result = planOf([], plan({ P: 0, D: 0, C: 0, A: 0 }));
    expect(result.reallocationBasis).toBe("hard-floor-only");
    for (const role of ROLES) {
      expect(result.perRole[role].allocation).toBe(result.perRole[role].minReserve);
    }
    expect(result.unallocated).toBe(INITIAL_BUDGET - TOTAL_SLOTS * COST_FLOOR);
  });

  it("un piano che non chiede nulla sopra la riserva dura NON è un piano compresso", () => {
    // `overCommitted` deve distinguere «il piano non ci sta» da «il piano non
    // chiede niente»: senza la distinzione ogni piano vuoto sembrerebbe sfondato.
    expect(planOf([], plan({ P: 0, D: 0, C: 0, A: 0 })).overCommitted).toBe(false);
    const complete = [
      ...fillRole(SELF, "P", 3, 1),
      ...fillRole(SELF, "D", 9, 1),
      ...fillRole(SELF, "C", 9, 1),
      ...fillRole(SELF, "A", 7, 1),
    ];
    expect(planOf(complete).overCommitted).toBe(false);
  });

  it("è deterministico: stesso stato e stesso piano, stesso risultato", () => {
    const specs = [buy("a1", "A", SELF, 60), ...fillRole(SELF, "P", 3, 4)];
    expect(planOf(specs)).toEqual(planOf(specs));
  });
});

describe("fitsPlan — fatto contabile, non un veto", () => {
  const line = planOf([]).perRole.D; // allocazione 80 su 9 slot

  it("accetta un prezzo che lascia riempibili gli altri slot del ruolo", () => {
    expect(fitsPlan(line, 72)).toBe(true); // 72 + 8 × floor = 80
  });

  it("rifiuta un prezzo che consumerebbe anche i crediti degli altri slot", () => {
    expect(fitsPlan(line, 73)).toBe(false);
  });

  it("porta il prezzo al floor: un giocatore non si compra a 0", () => {
    expect(fitsPlan(line, 0)).toBe(fitsPlan(line, COST_FLOOR));
  });

  it("rifiuta un ruolo senza slot residui e un prezzo non finito", () => {
    const closed = planOf(fillRole(SELF, "P", 3, 5)).perRole.P;
    expect(fitsPlan(closed, 1)).toBe(false);
    expect(fitsPlan(line, Number.NaN)).toBe(false);
  });
});

describe("livePlan — perimetro: nessuna autorità sul limite hard-safe", () => {
  it("non produce nessun campo che possa passare per un tetto di offerta", () => {
    const result = planOf([]);
    const roleKeys = Object.keys(result.perRole.A as unknown as Record<string, unknown>);
    for (const forbidden of ["maxSafe", "maxBid", "value", "fairToMe", "targetBand"]) {
      expect(roleKeys).not.toContain(forbidden);
    }
    expect(Object.keys(result as unknown as Record<string, unknown>)).not.toContain("maxSafe");
  });

  it("l'allocazione di ruolo può superare il max bid vero senza pretendere di limitarlo", () => {
    // Il piano è un piano, non un vincolo: dice dove vanno i crediti, non
    // quanto si può offrire. `maxSafe` resta l'unico limite hard-safe (D4).
    const state = stateOf(buildLog([]));
    const result = livePlan({ team: state.teams[SELF]!, plan: DECLARED });
    const roles: readonly Role[] = ROLES;
    expect(roles.some((role) => result.perRole[role].allocation > 0)).toBe(true);
  });
});

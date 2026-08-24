// Test del piano rosa lato app — logica pura, nessun DOM e nessuno storage
// reale, come postPurchaseProjection.test.ts (postura no-jsdom di questo repo).
// Gli stati di squadra si derivano da reduce()/recordPurchase sulle fixture
// sintetiche del motore, così ogni numero atteso è lo stesso che l'app vede.
//
// LE DUE PROVE CHE QUESTO FILE ESISTE PER PORTARE, e che nessun'altra suite
// porta perché prima di questo batch nessuno importava `livePlan`:
//
//  1. UN PIANO ASSENTE NON PRODUCE UN NUMERO. Non «non lo mostra»: non lo
//     produce affatto — `RolePlanRow.plan` resta `null` in ogni riga, e non
//     esiste un ramo che lo popoli senza che il motore l'abbia calcolato;
//  2. «NON DICHIARATO» E «DICHIARATO ZERO» NON COLLASSANO. Sono due stati
//     diversi del dato, sopravvivono al giro attraverso lo storage, e portano a
//     due letture diverse: il primo non arriva nemmeno al motore, il secondo ci
//     arriva ed è un piano che il motore esegue.

import { describe, expect, it } from "vitest";
import { reduce } from "../packages/engine/src/reduce.js";
import { recordPurchase } from "../packages/engine/src/feasibility.js";
import { budgetPlan } from "../packages/engine/src/budget.js";
import { livePlan } from "../packages/engine/src/livePlan.js";
import { INITIAL_BUDGET, ROLES, type AuctionEvent, type Role, type TeamState } from "../packages/engine/src/types.js";
import { FANTA_TEAM_IDS } from "../packages/engine/fixtures/synthetic.js";
import {
  EMPTY_ROLE_PLAN_DRAFT,
  ROLE_PLAN_STORAGE_KEY,
  clearRolePlan,
  declaredTotal,
  loadRolePlan,
  parseTargetInput,
  rolePlanReading,
  saveRolePlan,
  withPlanVersion,
  withTarget,
  type RolePlanDraft,
} from "./rolePlan.js";
import type { StorageLike } from "./logRecovery.js";

const TEAMS = FANTA_TEAM_IDS;
const TS = "2026-08-01T12:00:00Z";
const ME = "psg";

const freshTeam = (): TeamState => reduce([], TEAMS).teams[ME]!;

function teamAfter(
  purchases: readonly { playerId: string; role: Role; fantaTeamId: string; price: number }[],
): TeamState {
  let log: readonly AuctionEvent[] = [];
  for (const p of purchases) log = recordPurchase(log, reduce(log, TEAMS), p, TS);
  return reduce(log, TEAMS).teams[ME]!;
}

const draft = (targets: Partial<Record<Role, number>>, planVersion = "pre-asta 1"): RolePlanDraft => ({
  planVersion,
  targets,
});

/** Piano completo di riferimento: 450 su 500, 50 lasciati liberi. */
const FULL = draft({ P: 20, D: 80, C: 140, A: 210 });

function memoryStorage(): StorageLike & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("rolePlanReading — il piano assente non produce numeri", () => {
  it("senza nessuna dichiarazione la lettura è «absent» e nessuna riga porta numeri di piano", () => {
    const reading = rolePlanReading(freshTeam(), null);
    expect(reading.kind).toBe("absent");
    expect(reading.rows).toHaveLength(4);
    for (const row of reading.rows) {
      expect(row.plan).toBeNull();
      expect(row.declared).toEqual({ kind: "undeclared" });
    }
  });

  it("una dichiarazione completamente vuota è «absent», non un piano a zero", () => {
    const reading = rolePlanReading(freshTeam(), EMPTY_ROLE_PLAN_DRAFT);
    expect(reading.kind).toBe("absent");
    expect(reading.rows.every((row) => row.plan === null)).toBe(true);
  });

  it("i fatti misurati restano visibili anche senza piano: il pannello non tace su ciò che sa", () => {
    const team = teamAfter([{ playerId: "p1", role: "A", fantaTeamId: ME, price: 40 }]);
    const envelope = budgetPlan(team);
    const reading = rolePlanReading(team, null);
    for (const row of reading.rows) {
      expect(row.slotsRemaining).toBe(team.slotsRemaining[row.role]);
      expect(row.slotsFilled).toBe(team.filled[row.role]);
      expect(row.minReserve).toBe(envelope.perRole[row.role].minReserve);
      expect(row.maxAllocatable).toBe(envelope.perRole[row.role].maxAllocatable);
    }
  });
});

describe("rolePlanReading — «non dichiarato» e «dichiarato zero» non collassano", () => {
  it("il ruolo non dichiarato tiene la lettura incompleta e non arriva al motore", () => {
    const reading = rolePlanReading(freshTeam(), draft({ D: 80, C: 140, A: 210 }));
    expect(reading.kind).toBe("incomplete");
    if (reading.kind !== "incomplete") throw new Error("ramo atteso");
    expect(reading.gaps).toEqual([{ kind: "role-undeclared", role: "P" }]);
    const portieri = reading.rows.find((r) => r.role === "P")!;
    expect(portieri.declared).toEqual({ kind: "undeclared" });
    expect(portieri.plan).toBeNull();
  });

  it("lo stesso ruolo dichiarato a ZERO è invece un piano, e il motore lo esegue", () => {
    const reading = rolePlanReading(freshTeam(), draft({ P: 0, D: 80, C: 140, A: 210 }));
    expect(reading.kind).toBe("live");
    if (reading.kind !== "live") throw new Error("ramo atteso");
    const portieri = reading.rows.find((r) => r.role === "P")!;
    expect(portieri.declared).toEqual({ kind: "declared", target: 0 });
    expect(portieri.plan).not.toBeNull();
    // Target 0 -> nessun credito riallocato al ruolo: resta la sola riserva dura.
    expect(portieri.plan!.allocation).toBe(portieri.minReserve);
    expect(portieri.plan!.residualTarget).toBe(0);
  });

  it("le due dichiarazioni portano a due letture diverse a parità di stato di squadra", () => {
    const team = freshTeam();
    const undeclared = rolePlanReading(team, draft({ D: 80, C: 140, A: 210 }));
    const zero = rolePlanReading(team, draft({ P: 0, D: 80, C: 140, A: 210 }));
    expect(undeclared.kind).not.toBe(zero.kind);
  });

  it("nessun ruolo dichiarato ma la versione c'è: incompleto, con quattro buchi nominati", () => {
    const reading = rolePlanReading(freshTeam(), draft({}));
    expect(reading.kind).toBe("incomplete");
    if (reading.kind !== "incomplete") throw new Error("ramo atteso");
    expect(reading.gaps).toEqual(ROLES.map((role) => ({ kind: "role-undeclared", role })));
  });

  it("quattro target ma nessuna versione: incompleto — §4.1 vuole il plan_version citabile", () => {
    const reading = rolePlanReading(freshTeam(), draft({ P: 20, D: 80, C: 140, A: 210 }, "   "));
    expect(reading.kind).toBe("incomplete");
    if (reading.kind !== "incomplete") throw new Error("ramo atteso");
    expect(reading.gaps).toEqual([{ kind: "plan-version-missing" }]);
    expect(reading.rows.every((row) => row.plan === null)).toBe(true);
  });
});

describe("rolePlanReading — piano completo", () => {
  it("delega al motore invece di riderivare: le righe sono `livePlan()`", () => {
    const team = teamAfter([
      { playerId: "a1", role: "A", fantaTeamId: ME, price: 90 },
      { playerId: "d1", role: "D", fantaTeamId: ME, price: 12 },
    ]);
    const reading = rolePlanReading(team, FULL);
    expect(reading.kind).toBe("live");
    if (reading.kind !== "live") throw new Error("ramo atteso");
    const expected = livePlan({ team, plan: { planVersion: FULL.planVersion, targets: { P: 20, D: 80, C: 140, A: 210 } } });
    expect(reading.live).toEqual(expected);
    for (const row of reading.rows) {
      const line = expected.perRole[row.role];
      expect(row.plan).toEqual({
        spent: line.spent,
        residualTarget: line.residualTarget,
        overspend: line.overspend,
        allocation: line.allocation,
        reallocated: line.reallocated,
        closed: line.closed,
      });
    }
  });

  it("lo scostamento sopra il piano è quello del motore, mai nascosto", () => {
    const team = teamAfter([{ playerId: "a1", role: "A", fantaTeamId: ME, price: 240 }]);
    const reading = rolePlanReading(team, FULL);
    if (reading.kind !== "live") throw new Error("ramo atteso");
    const attaccanti = reading.rows.find((r) => r.role === "A")!;
    expect(attaccanti.plan!.overspend).toBe(30);
    expect(attaccanti.plan!.residualTarget).toBe(0);
  });

  it("la versione del piano attraversa fino alla lettura (§4.1)", () => {
    const reading = rolePlanReading(freshTeam(), FULL);
    if (reading.kind !== "live") throw new Error("ramo atteso");
    expect(reading.live.planVersion).toBe("pre-asta 1");
  });
});

describe("rolePlanReading — piano rifiutato dal motore", () => {
  it("somma sopra la dotazione: si riportano le violazioni del motore, senza numeri di piano", () => {
    const reading = rolePlanReading(freshTeam(), draft({ P: 100, D: 100, C: 200, A: 200 }));
    expect(reading.kind).toBe("invalid");
    if (reading.kind !== "invalid") throw new Error("ramo atteso");
    expect(reading.issues).toEqual([{ role: null, violation: "total-exceeds-initial-budget" }]);
    expect(reading.rows.every((row) => row.plan === null)).toBe(true);
  });

  it("non lancia mai: la schermata di un'asta non può ricevere un'eccezione al posto di un pannello", () => {
    expect(() => rolePlanReading(freshTeam(), draft({ P: 500, D: 500, C: 500, A: 500 }))).not.toThrow();
  });
});

describe("parseTargetInput — il campo vuoto non è uno zero", () => {
  it.each([
    ["", { kind: "undeclared" }],
    ["   ", { kind: "undeclared" }],
    ["0", { kind: "declared", target: 0 }],
    ["20", { kind: "declared", target: 20 }],
    [String(INITIAL_BUDGET), { kind: "declared", target: INITIAL_BUDGET }],
  ])("«%s» -> %o", (raw, expected) => {
    expect(parseTargetInput(raw as string)).toEqual(expected);
  });

  it.each([
    ["1,5", "not-an-integer"],
    ["1.5", "not-an-integer"],
    ["venti", "not-an-integer"],
    ["-3", "negative"],
    [String(INITIAL_BUDGET + 1), "above-cap"],
  ])("rifiuta «%s» senza correggerlo d'ufficio", (raw, reason) => {
    expect(parseTargetInput(raw as string)).toEqual({ kind: "rejected", reason });
  });
});

describe("withTarget / withPlanVersion", () => {
  it("un input vuoto RIMUOVE il target invece di scriverci zero", () => {
    const next = withTarget(draft({ P: 20, D: 80 }), "P", parseTargetInput(""));
    expect("P" in next.targets).toBe(false);
    expect(next.targets.D).toBe(80);
  });

  it("uno zero digitato viene scritto come zero, non rimosso", () => {
    const next = withTarget(draft({ D: 80 }), "P", parseTargetInput("0"));
    expect("P" in next.targets).toBe(true);
    expect(next.targets.P).toBe(0);
  });

  it("un input rifiutato non tocca la dichiarazione", () => {
    const before = draft({ P: 20 });
    expect(withTarget(before, "P", parseTargetInput("-1"))).toEqual(before);
  });

  it("la versione si tronca al massimo consentito invece di essere rifiutata", () => {
    const next = withPlanVersion(draft({ P: 1 }), "x".repeat(200));
    expect(next.planVersion).toHaveLength(40);
  });
});

describe("declaredTotal — il totale porta il suo denominatore", () => {
  it("conta solo i ruoli dichiarati, e dice quanti sono", () => {
    expect(declaredTotal(draft({ P: 20, D: 80 }))).toEqual({ total: 100, roles: 2 });
  });

  it("uno zero dichiarato è un ruolo dichiarato, e conta nel denominatore", () => {
    expect(declaredTotal(draft({ P: 0 }))).toEqual({ total: 0, roles: 1 });
    expect(declaredTotal(draft({}))).toEqual({ total: 0, roles: 0 });
  });
});

describe("persistenza — il giro attraverso lo storage non inventa target", () => {
  it("un ruolo non dichiarato resta non dichiarato dopo salva/rileggi", () => {
    const storage = memoryStorage();
    expect(saveRolePlan(storage, draft({ D: 80, C: 140, A: 210 }))).toBe(true);
    const back = loadRolePlan(storage)!;
    expect("P" in back.targets).toBe(false);
    expect(rolePlanReading(freshTeam(), back).kind).toBe("incomplete");
  });

  it("un ruolo dichiarato a zero resta zero dopo salva/rileggi", () => {
    const storage = memoryStorage();
    saveRolePlan(storage, draft({ P: 0, D: 80, C: 140, A: 210 }));
    const back = loadRolePlan(storage)!;
    expect(back.targets.P).toBe(0);
    expect(rolePlanReading(freshTeam(), back).kind).toBe("live");
  });

  it("nessuna copia conservata -> `null`, che non è una dichiarazione vuota", () => {
    expect(loadRolePlan(memoryStorage())).toBeNull();
  });

  it("copia illeggibile -> rifiutata in blocco, mai una dichiarazione parziale indovinata", () => {
    for (const raw of ["{", "null", '{"schemaVersion":2,"planVersion":"x","targets":{}}', '{"schemaVersion":1,"planVersion":"x","targets":{"P":"venti"}}', '{"schemaVersion":1,"planVersion":"x","targets":{"P":-1}}']) {
      const storage = memoryStorage();
      storage.map.set(ROLE_PLAN_STORAGE_KEY, raw);
      expect(loadRolePlan(storage)).toBeNull();
    }
  });

  it("una scrittura che non attecchisce viene riportata, non ingoiata", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    expect(saveRolePlan(storage, FULL)).toBe(false);
  });

  it("clearRolePlan cancella davvero", () => {
    const storage = memoryStorage();
    saveRolePlan(storage, FULL);
    expect(clearRolePlan(storage)).toBe(true);
    expect(loadRolePlan(storage)).toBeNull();
  });
});

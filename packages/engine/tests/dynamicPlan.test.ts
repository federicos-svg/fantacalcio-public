// `PLAN*` — IL PIANO DINAMICO (NOM-PROTOCOL-A §A.4), provato passo per passo.
//
// Fixture sintetiche: giocatori «pl-*», numeri inventati. Nessun dato reale,
// nessun listone vero, nessuna quotazione presa da una fonte.
//
// CHE COSA QUESTI TEST DEVONO PROVARE, e non solo esercitare:
//  - l'ordine del passo 2 è quello di `S` e i suoi due pareggi lo rendono
//    TOTALE (stessa popolazione mescolata → stesso piano);
//  - la riserva dura del passo 3 è quella di `maxSafe`, interrogata: dopo ogni
//    presa restano almeno `COST_FLOOR` crediti per ogni slot ancora scoperto;
//  - il passo 4 pianifica a pavimento e lo DICHIARA, anche quando il budget non
//    lo copre (`budgetLeft` negativo è un fatto, non un bug);
//  - il «momento giusto» è il RICALCOLO: tolto dai candidati chi è stato
//    venduto, il piano si riscrive da solo e il successivo entra.

import { describe, expect, it } from "vitest";
import {
  DYNAMIC_PLAN_VERSION_PREFIX,
  compareDynamicPlanCandidates,
  dynamicPlan,
  dynamicPlanVersion,
  withinDynamicPlan,
  type DynamicPlanCandidate,
} from "../src/dynamicPlan.js";
import { hardReserve } from "../src/auction.js";
import { COST_FLOOR, ROLES, type Role } from "../src/types.js";

const NO_SLOTS: Readonly<Record<Role, number>> = { P: 0, D: 0, C: 0, A: 0 };

function candidate(
  playerId: string,
  role: Role,
  value: number,
  expectedPrice: number,
): DynamicPlanCandidate {
  return { playerId, role, value, expectedPrice, surplus: value - expectedPrice };
}

/** Tre attaccanti con surplus 30 / 20 / 10, prezzi crescenti. */
const A_TOP = candidate("pl-a-top", "A", 90, 60);
const A_MID = candidate("pl-a-mid", "A", 60, 40);
const A_LOW = candidate("pl-a-low", "A", 30, 20);
const D_ONE = candidate("pl-d-uno", "D", 50, 25);
/** Un difensore con il surplus più BASSO di tutti: serve dove l'ordine deve
 *  mettere in coda un ruolo diverso da quello che si riempie per primo. */
const D_CODA = candidate("pl-d-coda", "D", 26, 21);

describe("il passo 2 — l'ordine è quello di S, e i pareggi lo rendono totale", () => {
  it("ordina per surplus decrescente", () => {
    const ordered = [A_LOW, A_TOP, A_MID].sort(compareDynamicPlanCandidates);
    expect(ordered.map((c) => c.playerId)).toEqual(["pl-a-top", "pl-a-mid", "pl-a-low"]);
  });

  it("a parità di surplus decide V, e poi la chiave: nessun pareggio resta aperto", () => {
    // Stesso `S = 10` per tutti e tre: il primo pareggio è `V` decrescente.
    const alto = candidate("pl-z", "A", 50, 40);
    const basso = candidate("pl-a", "A", 20, 10);
    const pari = candidate("pl-b", "A", 20, 10);
    const ordered = [pari, basso, alto].sort(compareDynamicPlanCandidates);
    expect(ordered.map((c) => c.playerId)).toEqual(["pl-z", "pl-a", "pl-b"]);
    // Ordine TOTALE: nessuna coppia distinta confronta a zero.
    expect(compareDynamicPlanCandidates(basso, pari)).not.toBe(0);
    expect(compareDynamicPlanCandidates(basso, basso)).toBe(0);
  });

  it("mescolare i candidati non cambia il piano — CON PAREGGI VERI", () => {
    // PERCHÉ I PAREGGI SONO IL PUNTO, e non un ornamento della fixture. Con
    // quattro candidati dai surplus tutti distinti questo test era verde
    // qualunque cosa facesse il terzo criterio: `Array.prototype.sort` è
    // stabile in V8, quindi con un confronto che non torna mai 0 l'ordine
    // d'inserimento non può influire E IL RAMO DEL PAREGGIO NON VIENE MAI
    // ESERCITATO. Dimostrava che `.sort()` funziona, non che l'ordine è
    // TOTALE. Il caso che rompe l'invariante è esattamente l'altro: due
    // candidati che il confronto NON riesce a separare finirebbero nel piano
    // nell'ordine in cui sono arrivati, e la stessa popolazione mescolata
    // darebbe due piani diversi.
    //
    // Qui tre attaccanti sono in PAREGGIO PIENO — stesso `S` e stesso `V` — e
    // solo la chiave li separa; gli slot in A sono DUE, quindi il tie-break non
    // decide un ordine cosmetico ma CHI ENTRA NEL PIANO e chi resta fuori.
    const A_PARI_C = candidate("pl-a-pari-c", "A", 60, 40);
    const A_PARI_A = candidate("pl-a-pari-a", "A", 60, 40);
    const A_PARI_B = candidate("pl-a-pari-b", "A", 60, 40);

    // IL PAREGGIO C'È DAVVERO, ed è asserito prima di usarlo: se un domani la
    // fixture si sbilanciasse, questo test tornerebbe a provare `.sort()` in
    // silenzio invece di provare il tie-break.
    for (const [x, y] of [
      [A_PARI_A, A_PARI_B],
      [A_PARI_B, A_PARI_C],
    ] as const) {
      expect(x.surplus).toBe(y.surplus);
      expect(x.value).toBe(y.value);
      // I due criteri di sopra sono muti: è la CHIAVE a decidere, e decide.
      expect(y.surplus - x.surplus || y.value - x.value).toBe(0);
      expect(compareDynamicPlanCandidates(x, y)).toBeLessThan(0);
    }

    const slots = { ...NO_SLOTS, A: 2, D: 1 };
    const tutti = [D_ONE, A_PARI_C, A_PARI_A, A_PARI_B];
    const piano = (candidates: readonly DynamicPlanCandidate[]) =>
      dynamicPlan({ budget: 200, slotsRemaining: slots, candidates, lastSeq: 3 });

    // Il piano di riferimento: la chiave sceglie `pari-a` e `pari-b`, e
    // `pari-c` resta fuori per ruolo pieno. È il tie-break, osservabile.
    const atteso = piano(tutti);
    expect(atteso.targets.map((t) => t.playerId)).toEqual([
      "pl-d-uno",
      "pl-a-pari-a",
      "pl-a-pari-b",
    ]);
    // `pari-c` non entra, e il piano non lo conta nemmeno fra gli scartati per
    // ruolo pieno: chiuso il terzo slot il ciclo si ferma e lui non viene mai
    // esaminato. Ciò che conta qui è che sia FUORI, e che a deciderlo sia stata
    // la chiave e non l'ordine d'arrivo.
    expect(withinDynamicPlan(atteso, "pl-a-pari-a")).toBe(true);
    expect(withinDynamicPlan(atteso, "pl-a-pari-b")).toBe(true);
    expect(withinDynamicPlan(atteso, "pl-a-pari-c")).toBe(false);

    // TUTTE E 24 LE PERMUTAZIONI, non due: con un pareggio a tre l'ordine
    // d'inserimento ha 24 modi di essere sbagliato e sceglierne due sarebbe
    // scegliere quali buchi guardare.
    const permutazioni = <T,>(items: readonly T[]): readonly (readonly T[])[] =>
      items.length <= 1
        ? [items]
        : items.flatMap((item, i) =>
            permutazioni([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
              item,
              ...rest,
            ]),
          );

    const ordini = permutazioni(tutti);
    expect(ordini).toHaveLength(24);
    for (const ordine of ordini) {
      const etichetta = ordine.map((c) => c.playerId).join(",");
      const p = piano(ordine);
      expect(p.targets, etichetta).toEqual(atteso.targets);
      expect(p.perRole, etichetta).toEqual(atteso.perRole);
      expect(p.planVersion, etichetta).toBe(atteso.planVersion);
      expect(p.targetIds, etichetta).toEqual(atteso.targetIds);
    }
  });
});

describe("il passo 3 — la riserva dura è quella di maxSafe, interrogata", () => {
  it("ogni presa lascia COST_FLOOR per ogni slot ancora scoperto", () => {
    const plan = dynamicPlan({
      budget: 130,
      slotsRemaining: { ...NO_SLOTS, A: 3, D: 1 },
      candidates: [A_TOP, A_MID, A_LOW, D_ONE],
      lastSeq: 7,
    });
    for (const pick of plan.targets) {
      expect(pick.reserveAfter).toBe(hardReserve(pick.slotsAfter));
      expect(pick.ceiling).toBe(pick.budgetBefore - pick.reserveAfter);
      expect(pick.expectedPrice).toBeLessThanOrEqual(pick.ceiling);
    }
    // Il budget non è mai sceso sotto la riserva degli slot ancora scoperti.
    const spent = plan.targets.reduce((s, p) => s + p.expectedPrice, 0);
    const scoperti = plan.slotsTotal - plan.targets.length;
    expect(plan.budget - spent).toBeGreaterThanOrEqual(hardReserve(scoperti));
  });

  it("il tetto morde davvero: il caro resta fuori e il piano lo conta", () => {
    // 4 slot, budget 50. Il primo (60) sfonda 50 − 3 = 47 e resta fuori;
    // il secondo (40) passa; il terzo (20) trova 10 − 2 = 8 e resta fuori.
    const plan = dynamicPlan({
      budget: 50,
      slotsRemaining: { ...NO_SLOTS, A: 4 },
      candidates: [A_TOP, A_MID, A_LOW],
      lastSeq: 0,
    });
    expect(plan.targets.map((p) => p.playerId)).toEqual(["pl-a-mid"]);
    expect(plan.skippedByCeiling).toBe(2);
    expect(withinDynamicPlan(plan, "pl-a-top")).toBe(false);
    expect(withinDynamicPlan(plan, "pl-a-mid")).toBe(true);
  });

  it("un ruolo pianificato del tutto non riceve una seconda presa, e lo conta", () => {
    // Un solo slot in A e uno in D: dopo il primo attaccante gli altri due
    // trovano il ruolo pieno, e il piano NON si ferma — resta uno slot D da
    // completare, quindi il conto degli scartati per ruolo pieno è visibile.
    const plan = dynamicPlan({
      budget: 400,
      slotsRemaining: { ...NO_SLOTS, A: 1, D: 1 },
      candidates: [A_TOP, A_MID, A_LOW, D_CODA],
      lastSeq: 2,
    });
    expect(plan.targets.map((p) => p.playerId)).toEqual(["pl-a-top", "pl-d-coda"]);
    expect(plan.skippedByRoleFull).toBe(2);
    expect(plan.perRole.A.slotsPlanned).toBe(1);
    expect(plan.perRole.A.slotsAtFloor).toBe(0);
  });

  it("un candidato in un ruolo senza slot non entra al passo 1, ed è contato", () => {
    const plan = dynamicPlan({
      budget: 400,
      slotsRemaining: { ...NO_SLOTS, A: 2 },
      candidates: [A_TOP, D_ONE],
      lastSeq: 1,
    });
    expect(plan.considered).toBe(1);
    expect(plan.excluded).toBe(1);
    expect(withinDynamicPlan(plan, "pl-d-uno")).toBe(false);
  });
});

describe("il passo 4 — gli slot senza candidato sono pianificati a pavimento", () => {
  it("alloc*[r] è la somma dei P̂ dei presi più il pavimento dei residui", () => {
    const plan = dynamicPlan({
      budget: 300,
      slotsRemaining: { ...NO_SLOTS, A: 3, D: 2 },
      candidates: [A_TOP, A_MID, D_ONE],
      lastSeq: 11,
    });
    expect(plan.perRole.A.plannedSpend).toBe(100); // 60 + 40
    expect(plan.perRole.A.slotsAtFloor).toBe(1);
    expect(plan.perRole.A.allocation).toBe(100 + COST_FLOOR);
    expect(plan.perRole.D.plannedSpend).toBe(25);
    expect(plan.perRole.D.allocation).toBe(25 + COST_FLOOR);
    // I ruoli senza slot restano a zero: nessun pavimento inventato.
    expect(plan.perRole.P.allocation).toBe(0);
    expect(plan.perRole.C.allocation).toBe(0);
    // L'identità del piano: la somma delle righe è l'impegno totale.
    const somma = ROLES.reduce((s, r) => s + plan.perRole[r].allocation, 0);
    expect(somma).toBe(plan.allocated);
    expect(plan.allocated).toBe(plan.plannedSpend + plan.floorSpend);
    expect(plan.budgetLeft).toBe(plan.budget - plan.allocated);
  });

  it("senza candidati ogni slot è pianificato a pavimento, e nulla è inventato", () => {
    const plan = dynamicPlan({
      budget: 20,
      slotsRemaining: { ...NO_SLOTS, A: 2, C: 3 },
      candidates: [],
      lastSeq: 0,
    });
    expect(plan.targets).toEqual([]);
    expect(plan.allocated).toBe(5 * COST_FLOOR);
    expect(plan.floorSpend).toBe(5 * COST_FLOOR);
    expect(plan.plannedSpend).toBe(0);
  });

  it("un budget che non copre nemmeno il pavimento lo DICE, invece di azzerare", () => {
    const plan = dynamicPlan({
      budget: 2,
      slotsRemaining: { ...NO_SLOTS, A: 5 },
      candidates: [A_TOP],
      lastSeq: 4,
    });
    expect(plan.targets).toEqual([]);
    expect(plan.allocated).toBe(5 * COST_FLOOR);
    expect(plan.budgetLeft).toBe(-3);
  });
});

describe("la versione del piano è la posizione nel log, non un numero scelto", () => {
  it("porta il seq dell'ultimo evento", () => {
    expect(dynamicPlanVersion(42)).toBe(`${DYNAMIC_PLAN_VERSION_PREFIX}42`);
    const plan = dynamicPlan({ budget: 10, slotsRemaining: NO_SLOTS, candidates: [], lastSeq: 42 });
    expect(plan.planVersion).toBe("NOM-DYN@42");
  });

  it("il log vuoto porta il proprio −1, non uno zero inventato", () => {
    expect(dynamicPlanVersion(-1)).toBe("NOM-DYN@-1");
  });
});

describe("il «momento giusto» è il ricalcolo, non una previsione", () => {
  it("tolto il preso dai candidati, il successivo entra da sé", () => {
    const slots = { ...NO_SLOTS, A: 1 };
    const prima = dynamicPlan({ budget: 100, slotsRemaining: slots, candidates: [A_TOP, A_MID], lastSeq: 5 });
    expect(prima.targets.map((p) => p.playerId)).toEqual(["pl-a-top"]);

    // Il migliore è stato comprato da un altro: sparisce dai liberi, e il piano
    // non ha bisogno di nessuna stima di durata per rifarsi.
    const dopo = dynamicPlan({ budget: 100, slotsRemaining: slots, candidates: [A_MID], lastSeq: 6 });
    expect(dopo.targets.map((p) => p.playerId)).toEqual(["pl-a-mid"]);
    expect(dopo.planVersion).toBe("NOM-DYN@6");
    expect(dopo.planVersion).not.toBe(prima.planVersion);
  });

  it("uno slot in meno cambia il completamento senza toccare i prezzi", () => {
    const candidates = [A_TOP, A_MID, A_LOW];
    const tre = dynamicPlan({ budget: 130, slotsRemaining: { ...NO_SLOTS, A: 3 }, candidates, lastSeq: 1 });
    const uno = dynamicPlan({ budget: 130, slotsRemaining: { ...NO_SLOTS, A: 1 }, candidates, lastSeq: 2 });
    expect(tre.targets).toHaveLength(3);
    expect(uno.targets).toHaveLength(1);
    // I `P̂` non si sono mossi: è il completamento a essere cambiato.
    expect(uno.targets[0]!.expectedPrice).toBe(tre.targets[0]!.expectedPrice);
  });
});

describe("nessuna eccezione sul percorso critico", () => {
  it("slot negativi o non interi non sono slot, e non lanciano", () => {
    const plan = dynamicPlan({
      budget: 50,
      slotsRemaining: { P: -3, D: 2.5, C: 0, A: 2 },
      candidates: [A_TOP, D_ONE],
      lastSeq: 0,
    });
    expect(plan.slotsTotal).toBe(2);
    expect(plan.perRole.P.slotsRemaining).toBe(0);
    expect(plan.perRole.D.slotsRemaining).toBe(0);
    expect(plan.perRole.A.slotsRemaining).toBe(2);
  });

  it("un numero non finito è escluso e contato, non attraversa la disuguaglianza", () => {
    const rotto: DynamicPlanCandidate = {
      playerId: "pl-rotto",
      role: "A",
      value: Number.NaN,
      expectedPrice: 10,
      surplus: Number.NaN,
    };
    const plan = dynamicPlan({
      budget: 100,
      slotsRemaining: { ...NO_SLOTS, A: 2 },
      candidates: [rotto, A_MID],
      lastSeq: 0,
    });
    expect(plan.excluded).toBe(1);
    expect(plan.targets.map((p) => p.playerId)).toEqual(["pl-a-mid"]);
  });
});

import { describe, it, expect } from "vitest";
import {
  APPEAL_INDEX_DECIMALS,
  LEAGUE_TEAMS,
  REPLACEMENT_RANK,
  ROSTER_SLOTS_BY_ROLE,
  allocateCredits,
  allocateCreditsAbsolute,
  allocateCreditsRelative,
  buildT7Chain,
  computeVorp,
  fairToMe,
  greedyCompletion,
  type GreedyCandidate,
  type VorpInput,
} from "../src/genProtocol/vorp.js";
import type { GenRole } from "../src/genProtocol/genTypes.js";

function ladder(role: GenRole, count: number, top = 1000, step = 5): VorpInput[] {
  return Array.from({ length: count }, (_, i) => ({
    playerKey: `${role}${String(i + 1).padStart(3, "0")}`,
    role,
    t1Hat: top - i * step,
  }));
}

describe("genProtocol/vorp — T4: i ranghi di replacement (§A.4)", () => {
  it("PROVA PER MUTAZIONE — i quattro ranghi sono 25/73/73/57, scritti a mano", () => {
    // Nessuno di questi numeri e' letto dalla costante che sorveglia: se
    // qualcuno cambiasse `REPLACEMENT_RANK`, questo test cadrebbe.
    expect(REPLACEMENT_RANK.P).toBe(25);
    expect(REPLACEMENT_RANK.D).toBe(73);
    expect(REPLACEMENT_RANK.C).toBe(73);
    expect(REPLACEMENT_RANK.A).toBe(57);
  });

  it("i ranghi discendono dall'aritmetica dichiarata: 8 squadre × 3/9/9/7 + 1", () => {
    expect(LEAGUE_TEAMS).toBe(8);
    expect(ROSTER_SLOTS_BY_ROLE).toEqual({ P: 3, D: 9, C: 9, A: 7 });
    expect(LEAGUE_TEAMS * ROSTER_SLOTS_BY_ROLE.P + 1).toBe(REPLACEMENT_RANK.P);
    expect(LEAGUE_TEAMS * ROSTER_SLOTS_BY_ROLE.D + 1).toBe(REPLACEMENT_RANK.D);
    expect(LEAGUE_TEAMS * ROSTER_SLOTS_BY_ROLE.A + 1).toBe(REPLACEMENT_RANK.A);
  });

  it("il VORP si misura sul valore del rango di replacement, e non e' mai negativo", () => {
    const rows = computeVorp(ladder("A", 60, 1000, 5)).rows;
    // Il 57° vale 1000 − 56·5 = 720. Il primo ha VORP 1000 − 720 = 280.
    expect(rows[0]!.vorp).toBeCloseTo(280, 12);
    expect(rows[56]!.vorp).toBeCloseTo(0, 12);
    expect(rows[59]!.vorp).toBe(0);
    for (const row of rows) expect(row.vorp).toBeGreaterThanOrEqual(0);
  });

  it("l'indice e' 100 sul migliore del ruolo, 0 sotto il replacement, separato per ruolo", () => {
    const result = computeVorp([...ladder("A", 60), ...ladder("D", 80, 500, 2)]);
    const attaccanti = result.rows.filter((row) => row.role === "A");
    const difensori = result.rows.filter((row) => row.role === "D");
    expect(attaccanti[0]!.appealIndex).toBe(100);
    expect(difensori[0]!.appealIndex).toBe(100);
    expect(attaccanti[59]!.appealIndex).toBe(0);
    expect(APPEAL_INDEX_DECIMALS).toBe(1);
    // Un decimale, davvero: nessun indice con piu' cifre.
    for (const row of result.rows) {
      expect(Math.round(row.appealIndex * 10) / 10).toBe(row.appealIndex);
    }
  });

  it("una predizione non scorabile non riceve un indice inventato, e viene contata", () => {
    const result = computeVorp([
      ...ladder("C", 80),
      { playerKey: "C_NAN", role: "C", t1Hat: Number.NaN },
    ]);
    const nan = result.rows.find((row) => row.playerKey === "C_NAN")!;
    expect(nan.appealIndex).toBeNaN();
    expect(result.byRole.find((summary) => summary.role === "C")!.scoredRows).toBe(80);
  });

  it("con meno giocatori del rango di replacement lo dice, invece di fingere", () => {
    const result = computeVorp(ladder("P", 10));
    const summary = result.byRole[0]!;
    expect(summary.shortOfReplacementRank).toBe(true);
    expect(summary.replacementValue).toBeCloseTo(1000 - 9 * 5, 12);
  });
});

describe("genProtocol/vorp — T5: crediti e largest-remainder (§D.11)", () => {
  const rows = computeVorp(ladder("C", 80, 1000, 5)).rows;

  it("PROVA PER MUTAZIONE — `Σ credito = |{VORP>0}| + B_res`, esattamente", () => {
    for (const bRes of [0, 1, 7, 100, 1776, 2500]) {
      const allocation = allocateCredits(rows, bRes);
      const positives = allocation.rows.filter((row) => Number.isFinite(row.vorp) && row.vorp > 0);
      const total = positives.reduce((sum, row) => sum + row.credits, 0);
      expect(total).toBe(positives.length + bRes);
      // E ogni credito e' un intero: i crediti d'asta non hanno decimali.
      for (const row of allocation.rows) expect(Number.isInteger(row.credits)).toBe(true);
    }
  });

  it("chi ha VORP ≤ 0 prende 1 credito, mai 0 e mai una quota", () => {
    const allocation = allocateCredits(rows, 1000);
    for (const row of allocation.rows) {
      if (row.vorp > 0) continue;
      expect(row.credits).toBe(1);
      expect(row.exactShare).toBe(0);
    }
  });

  it("piu' VORP, piu' crediti: l'ordine non si inverte mai", () => {
    const allocation = allocateCredits(rows, 1500);
    const positives = allocation.rows.filter((row) => row.vorp > 0);
    for (let i = 1; i < positives.length; i++) {
      if (positives[i - 1]!.vorp <= positives[i]!.vorp) continue;
      expect(positives[i - 1]!.credits).toBeGreaterThanOrEqual(positives[i]!.credits);
    }
  });

  it("T5 assoluto: `B_pool = 4.000 − R`, `Slot = 224 − rinnovi`, `B_res` la differenza", () => {
    const allocation = allocateCreditsAbsolute(rows, { renewalSpend: 400, renewalCount: 20 });
    expect(allocation.bPool).toBe(3600);
    expect(allocation.slots).toBe(204);
    expect(allocation.bRes).toBe(3396);
    expect(allocation.allocatedToPositive).toBe(allocation.positiveVorpCount + 3396);
  });

  it("T5 relativo: stessa aritmetica sullo stato residuo passato dal chiamante", () => {
    const allocation = allocateCreditsRelative(rows, { residualBudget: 300, residualSlots: 12 });
    expect(allocation.bRes).toBe(288);
    expect(allocation.allocatedToPositive).toBe(allocation.positiveVorpCount + 288);
  });

  it("un `B_res` non intero non passa: i crediti non hanno decimali", () => {
    expect(() => allocateCredits(rows, 10.5)).toThrow(/intero non negativo/);
  });
});

describe("genProtocol/vorp — T7: completamento greedy, fair-to-me, catena (§D.11)", () => {
  const candidates: GreedyCandidate[] = [
    { playerKey: "TOP", role: "A", normalizedName: "alfa", value: 60, expectedPrice: 30, appealIndex: 100 },
    { playerKey: "MID", role: "A", normalizedName: "beta", value: 30, expectedPrice: 20, appealIndex: 60 },
    { playerKey: "LOW", role: "A", normalizedName: "gamma", value: 10, expectedPrice: 10, appealIndex: 20 },
    { playerKey: "DEF", role: "D", normalizedName: "delta", value: 25, expectedPrice: 15, appealIndex: 50 },
  ];
  const state = { budget: 60, slotsByRole: { P: 0, D: 1, C: 0, A: 2 } };

  it("il greedy ordina per valore/prezzo e rispetta slot e budget", () => {
    const completion = greedyCompletion(candidates, state);
    expect(completion.picked).toContain("TOP");
    expect(completion.spent).toBeLessThanOrEqual(state.budget);
    // Non si comprano piu' attaccanti degli slot disponibili.
    const attaccanti = completion.picked.filter((key) => key !== "DEF");
    expect(attaccanti.length).toBeLessThanOrEqual(2);
  });

  it("lascia sempre almeno un credito per slot: la rosa si completa", () => {
    const caro: GreedyCandidate[] = [
      { playerKey: "CARO", role: "A", normalizedName: "a", value: 100, expectedPrice: 60, appealIndex: 100 },
      { playerKey: "ALTRO", role: "D", normalizedName: "b", value: 5, expectedPrice: 1, appealIndex: 10 },
    ];
    const completion = greedyCompletion(caro, { budget: 60, slotsByRole: { P: 0, D: 1, C: 0, A: 1 } });
    // Comprare CARO a 60 lascerebbe 0 crediti per lo slot D: non si fa.
    expect(completion.picked).not.toContain("CARO");
  });

  it("fair-to-me e' la DIFFERENZA fra i due completamenti, ed e' deterministico", () => {
    const result = fairToMe(candidates, state, "TOP");
    expect(result.withFocal - result.withoutFocal).toBeCloseTo(result.fairToMe, 12);
    expect(fairToMe(candidates, state, "TOP")).toEqual(result);
    // Un giocatore forte a prezzo 0 vale positivo per questa rosa.
    expect(result.fairToMe).toBeGreaterThan(0);
  });

  it("pagare di piu' non puo' aumentare il valore marginale", () => {
    const gratis = fairToMe(candidates, state, "TOP", 0).fairToMe;
    const caro = fairToMe(candidates, state, "TOP", 40).fairToMe;
    expect(caro).toBeLessThanOrEqual(gratis);
  });

  it("PROVA PER MUTAZIONE — la catena `banda ≤ stretch ≤ ftm ≤ max_safe` regge sempre", () => {
    const casi = [
      { p25: 10, p75: 25, p90: 40, fairToMe: 30, maxSafe: 50 },
      { p25: 10, p75: 25, p90: 40, fairToMe: 30, maxSafe: 12 },
      { p25: 30, p75: 60, p90: 80, fairToMe: 20, maxSafe: 100 },
      { p25: -5, p75: 25, p90: 40, fairToMe: 30, maxSafe: 50 },
      { p25: 0, p75: 0, p90: 0, fairToMe: 0, maxSafe: 0 },
    ];
    for (const caso of casi) {
      const chain = buildT7Chain(caso);
      expect(chain.targetBand[0]).toBeLessThanOrEqual(chain.targetBand[1]);
      expect(chain.targetBand[1]).toBeLessThanOrEqual(chain.stretchCap);
      expect(chain.stretchCap).toBeLessThanOrEqual(chain.fairToMe);
      expect(chain.fairToMe).toBeLessThanOrEqual(chain.maxSafe);
      // `max_safe` esce IDENTICO a come e' entrato: hard-safe, mai spostato.
      expect(chain.maxSafe).toBe(caso.maxSafe);
      expect(chain.targetBand[0]).toBeGreaterThanOrEqual(0);
    }
  });

  it("un max_safe basso taglia tutta la catena, non solo l'ultimo anello", () => {
    const chain = buildT7Chain({ p25: 10, p75: 25, p90: 40, fairToMe: 30, maxSafe: 8 });
    expect(chain.fairToMe).toBe(8);
    expect(chain.stretchCap).toBe(8);
    expect(chain.targetBand).toEqual([8, 8]);
  });
});

import { describe, it, expect } from "vitest";
import {
  EARLY_RIDGE_LAMBDA_GRID,
  EarlySeasonLayerError,
  GEN_EARLY_SEASON_G_SET,
  applyEarlyLayer,
  assertProtocolG,
  auditEarlyEvidence,
  buildEarlyEvidence,
  earlyRidgeFeatureNames,
  fitEarlyRidge,
  isProtocolG,
  predictEarlyU1,
  predictEarlyU2,
  selectEarlyLayerForG,
  type EarlyLayerRecipeEntry,
  type EarlyTrainingRow,
} from "../src/genProtocol/earlySeasonUpdate.js";
import { GEN_LAYER_COMPLEXITY_ORDER, complexityRank } from "../src/genProtocol/selection.js";
import { SEASON_MATCHDAYS, type GenSeason, type MatchdayVote } from "../src/genProtocol/genTypes.js";
import { earlyEvidenceCanaryMatchdays } from "../src/genProtocol/syntheticWorld.js";

const SEASON: GenSeason = "2026_27";

function md(matchday: number, votoBase: number | null, extra: Partial<MatchdayVote> = {}): MatchdayVote {
  return {
    season: SEASON,
    matchday,
    votoBase,
    isAsterisk: false,
    Gf: 0,
    Gs: 0,
    Rp: 0,
    Rs: 0,
    Rf: 0,
    Au: 0,
    Amm: 0,
    Esp: 0,
    Ass: 0,
    ...extra,
  };
}

describe("genProtocol/earlySeasonUpdate — l'istanza congelata (§D.15, v2.0.0)", () => {
  it("l'insieme dei G di protocollo e' {1, 2, 3}, scritto a mano", () => {
    expect([...GEN_EARLY_SEASON_G_SET]).toEqual([1, 2, 3]);
    expect(isProtocolG(1)).toBe(true);
    expect(isProtocolG(3)).toBe(true);
    expect(isProtocolG(0)).toBe(false);
    expect(isProtocolG(4)).toBe(false);
    expect(() => assertProtocolG(4)).toThrow(EarlySeasonLayerError);
    expect(() => assertProtocolG(2)).not.toThrow();
  });

  it("l'ordine di complessita' del layer e' U0 < U1 < U2, e non si mescola con quello di §B.4.4", () => {
    expect([...GEN_LAYER_COMPLEXITY_ORDER]).toEqual(["U0", "U1", "U2"]);
    expect(complexityRank("U0", GEN_LAYER_COMPLEXITY_ORDER)).toBe(0);
    expect(complexityRank("U2", GEN_LAYER_COMPLEXITY_ORDER)).toBe(2);
    // Fuori dal proprio ordine, una famiglia del layer non ha rango.
    expect(() => complexityRank("U1")).toThrow();
  });

  it("la griglia interna di λ e' {0,1; 1; 10}", () => {
    expect([...EARLY_RIDGE_LAMBDA_GRID]).toEqual([0.1, 1, 10]);
  });
});

describe("genProtocol/earlySeasonUpdate — l'evidenza e il suo audit (§D.15.1, §D.15.6)", () => {
  it("costruisce `p_1…p_G`, `Σp` e `r_G` dalle giornate 1..G", () => {
    const evidence = buildEarlyEvidence([md(1, 6), md(2, null)], 2);
    expect(evidence.G).toBe(2);
    expect(evidence.p).toEqual([1, 0]);
    expect(evidence.sumP).toBe(1);
    expect(evidence.rG).toBe(0);
  });

  it("il `6*` conta come presenza valida (§A.1)", () => {
    const evidence = buildEarlyEvidence([md(1, 6, { isAsterisk: true })], 1);
    expect(evidence.p).toEqual([1]);
    expect(evidence.sumP).toBe(1);
  });

  it("`r_G` si accende con un rigore segnato O sbagliato nelle prime G giornate", () => {
    expect(buildEarlyEvidence([md(1, 6, { Rf: 1 })], 1).rG).toBe(1);
    expect(buildEarlyEvidence([md(1, 6, { Rs: 1 })], 1).rG).toBe(1);
    expect(buildEarlyEvidence([md(1, 6)], 1).rG).toBe(0);
  });

  it("IL CANARINO: una presenza alla giornata G+1 viene intercettata, a ogni G", () => {
    for (const G of GEN_EARLY_SEASON_G_SET) {
      const rows = earlyEvidenceCanaryMatchdays(SEASON, G);
      const audit = auditEarlyEvidence(rows, G);
      expect(audit.violazioni).toHaveLength(1);
      expect(audit.violazioni[0]!.matchday).toBe(G + 1);
      expect(() => buildEarlyEvidence(rows, G)).toThrow(/leakage/);
    }
  });

  it("una riga senza giornata valida non passa: non e' verificabile, quindi non e' verificata", () => {
    expect(auditEarlyEvidence([md(0, 6)], 2).violazioni).toHaveLength(1);
  });
});

describe("genProtocol/earlySeasonUpdate — U1, l'aritmetica dichiarata (§D.15.2)", () => {
  it("PROVA PER MUTAZIONE — la prorata e' `Σp + N̂·(38−G)/38`, calcolata a mano", () => {
    const evidence = buildEarlyEvidence([md(1, 6), md(2, 6)], 2);
    // Σp = 2, N̂_base = 19: 2 + 19·36/38 = 2 + 18 = 20.
    expect(predictEarlyU1(evidence, 19)).toBeCloseTo(20, 12);
    // Con G = 1 e N̂_base = 38: 1 + 38·37/38 = 1 + 37 = 38.
    const g1 = buildEarlyEvidence([md(1, 6)], 1);
    expect(predictEarlyU1(g1, 38)).toBeCloseTo(38, 12);
  });

  it("PROVA PER MUTAZIONE — il clamp e' `[Σp, Σp + 38 − G]`, ai due estremi", () => {
    const evidence = buildEarlyEvidence([md(1, 6), md(2, 6)], 2);
    // Estremo inferiore: nemmeno un N̂_base a 0 puo' scendere sotto le presenze
    // GIA' osservate.
    expect(predictEarlyU1(evidence, 0)).toBe(2);
    // Estremo superiore: 2 + 36 = 38, e non oltre.
    expect(predictEarlyU1(evidence, 1000)).toBe(38);
    // Con G = 3 e zero presenze: [0, 35].
    const zero = buildEarlyEvidence([md(1, null), md(2, null), md(3, null)], 3);
    expect(predictEarlyU1(zero, 0)).toBe(0);
    expect(predictEarlyU1(zero, 1000)).toBe(35);
  });

  it("una base non finita non produce un numero", () => {
    expect(predictEarlyU1(buildEarlyEvidence([md(1, 6)], 1), Number.NaN)).toBeNaN();
  });
});

describe("genProtocol/earlySeasonUpdate — U2, la ridge per ruolo (§D.15.2)", () => {
  function trainingRows(G: number): EarlyTrainingRow[] {
    const rows: EarlyTrainingRow[] = [];
    for (let i = 0; i < 60; i++) {
      const presente = i % 3 !== 0;
      const evidence = buildEarlyEvidence(
        Array.from({ length: G }, (_, g) => md(g + 1, presente ? 6 : null)),
        G,
      );
      const nBaseOof = 10 + (i % 20);
      // Verita' sintetica: chi ha giocato le prime giornate gioca di piu' dopo.
      const nRest = Math.min(SEASON_MATCHDAYS - G, Math.round(0.6 * nBaseOof + (presente ? 8 : 0)));
      rows.push({ role: "C", evidence, nBaseOof, nRest });
    }
    return rows;
  }

  it("i regressori sono `N̂_base` e le G presenze, in quest'ordine", () => {
    expect(earlyRidgeFeatureNames(2)).toEqual(["nBase", "p1", "p2"]);
    expect(earlyRidgeFeatureNames(3)).toEqual(["nBase", "p1", "p2", "p3"]);
  });

  it("recupera il segno del segnale: le presenze osservate alzano le presenze residue", () => {
    const fitted = fitEarlyRidge(trainingRows(2), 2, "C", 0.1);
    expect(fitted.coefficients).toHaveLength(3);
    expect(fitted.coefficients[0]!).toBeGreaterThan(0); // piu' base, piu' resto
    expect(fitted.coefficients[1]!).toBeGreaterThan(0); // presenza alla prima, piu' resto
    expect(fitted.trainingRowCount).toBe(60);
  });

  it("λ piu' grande shrinka i coefficienti verso zero", () => {
    const piccolo = fitEarlyRidge(trainingRows(2), 2, "C", 0.1);
    const grande = fitEarlyRidge(trainingRows(2), 2, "C", 10);
    expect(Math.abs(grande.coefficients[0]!)).toBeLessThan(Math.abs(piccolo.coefficients[0]!));
  });

  it("PROVA PER MUTAZIONE — la predizione somma `Σp` e clampa la PARTE PREDETTA a `[0, 38−G]`", () => {
    const fitted = fitEarlyRidge(trainingRows(2), 2, "C", 0.1);
    const evidence = buildEarlyEvidence([md(1, 6), md(2, 6)], 2);
    const prediction = predictEarlyU2(fitted, evidence, 20);
    expect(prediction).toBeGreaterThanOrEqual(evidence.sumP);
    expect(prediction).toBeLessThanOrEqual(evidence.sumP + SEASON_MATCHDAYS - 2);

    // Un artefatto con coefficienti assurdi: il clamp regge lo stesso.
    const assurdo = { ...fitted, intercept: 10_000 };
    expect(predictEarlyU2(assurdo, evidence, 20)).toBe(evidence.sumP + SEASON_MATCHDAYS - 2);
    const negativo = { ...fitted, intercept: -10_000 };
    expect(predictEarlyU2(negativo, evidence, 20)).toBe(evidence.sumP);
  });

  it("un artefatto calibrato a un G diverso non si applica di nascosto", () => {
    const fitted = fitEarlyRidge(trainingRows(2), 2, "C", 1);
    const evidence = buildEarlyEvidence([md(1, 6)], 1);
    expect(() => predictEarlyU2(fitted, evidence, 20)).toThrow(/calibrato a G/);
  });

  it("una colonna costante non fa esplodere il fit: coefficiente 0 e via", () => {
    const G = 1;
    const rows: EarlyTrainingRow[] = Array.from({ length: 30 }, (_, i) => ({
      role: "D" as const,
      evidence: buildEarlyEvidence([md(1, 6)], G), // p1 costante a 1
      nBaseOof: 10 + i,
      nRest: 20 + (i % 5),
    }));
    const fitted = fitEarlyRidge(rows, G, "D", 1);
    expect(fitted.coefficients[1]).toBe(0);
    expect(Number.isFinite(fitted.intercept)).toBe(true);
  });
});

describe("genProtocol/earlySeasonUpdate — MECCANICA G-generica (fuori protocollo v2.0.0)", () => {
  it("con G = 5 la meccanica funziona: evidenza, clamp e audit restano coerenti", () => {
    const G = 5;
    // Test di MECCANICA, non di protocollo: G = 5 non e' un'istanza
    // preregistrata (§D.15 congela {1,2,3}) e infatti l'assert lo rifiuta. Qui
    // si verifica solo che la genericita' sia reale, come chiede il committente
    // per gli usi futuri (mercato di riparazione, valutazioni in-season).
    expect(isProtocolG(G)).toBe(false);

    const evidence = buildEarlyEvidence([md(1, 6), md(2, null), md(3, 6), md(4, 6), md(5, null)], G);
    expect(evidence.p).toEqual([1, 0, 1, 1, 0]);
    expect(evidence.sumP).toBe(3);
    // U1: 3 + N̂·(38−5)/38; con N̂ = 38 -> 3 + 33 = 36, che e' anche il tetto.
    expect(predictEarlyU1(evidence, 38)).toBeCloseTo(36, 12);
    expect(predictEarlyU1(evidence, 1000)).toBe(36);
    expect(predictEarlyU1(evidence, 0)).toBe(3);

    // L'audit usa il G in esame: la giornata 6 e' fuori, la 5 dentro.
    expect(auditEarlyEvidence(earlyEvidenceCanaryMatchdays(SEASON, G), G).violazioni[0]!.matchday).toBe(6);
    expect(auditEarlyEvidence([md(5, 6)], G).violazioni).toEqual([]);

    expect(earlyRidgeFeatureNames(G)).toEqual(["nBase", "p1", "p2", "p3", "p4", "p5"]);
  });

  it("G fuori dai limiti fisici della stagione resta un errore", () => {
    expect(() => buildEarlyEvidence([md(1, 6)], 0)).toThrow(EarlySeasonLayerError);
    expect(() => buildEarlyEvidence([md(1, 6)], 39)).toThrow(EarlySeasonLayerError);
  });
});

describe("genProtocol/earlySeasonUpdate — la gara per-G e l'applicazione (§D.15.2, §D.15.3)", () => {
  const baseline = {
    candidateId: "U0",
    primaryLossPerFold: [4, 4, 4, 4, 4, 4, 4],
    scoredRows: 500,
    primaryLossByRole: { D: 4, C: 4, A: 4 },
    meanSpearmanByRole: 0.3,
  };

  it("U1 che batte U0 su tutti i fold vince la gara di quel G", () => {
    const outcome = selectEarlyLayerForG({
      G: 2,
      target: "TN",
      baseline,
      candidates: [
        {
          candidateId: "U1_G2",
          family: "U1",
          featureCount: 1,
          enumerationIndex: 0,
          primaryLossPerFold: [3, 3.1, 2.9, 3, 3.2, 2.8, 3],
          scoredRows: 500,
          primaryLossByRole: { D: 3, C: 3, A: 3 },
          meanSpearmanByRole: 0.4,
        },
      ],
      bootstrap: { replicates: 200 },
    });
    expect(outcome.winner).toBe("U1");
    expect(outcome.selection.status).toBe("winner");
    expect(outcome.G).toBe(2);
  });

  it("un layer che non batte l'incumbent NON si accende: e' un esito registrato (§D.15.8)", () => {
    const outcome = selectEarlyLayerForG({
      G: 2,
      target: "TN",
      baseline,
      candidates: [
        {
          candidateId: "U2_G2",
          family: "U2",
          featureCount: 3,
          enumerationIndex: 1,
          primaryLossPerFold: [4.1, 4.2, 4.0, 4.3, 4.1, 4.2, 4.0],
          scoredRows: 500,
          primaryLossByRole: { D: 4.1, C: 4.2, A: 4.1 },
          meanSpearmanByRole: 0.3,
        },
      ],
      bootstrap: { replicates: 200 },
    });
    expect(outcome.winner).toBe("U0");
  });

  it("a parita' dentro 1 SE vince il PIU' SEMPLICE: U1 batte U2", () => {
    const outcome = selectEarlyLayerForG({
      G: 3,
      target: "TN",
      baseline,
      candidates: [
        {
          candidateId: "U1_G3",
          family: "U1",
          featureCount: 1,
          enumerationIndex: 0,
          // Le differenze per fold devono VARIARE, altrimenti l'errore
          // standard e' zero e un vantaggio anche minimo e' certo: e' la
          // regola 1-SE che funziona, non un caso da aggirare.
          primaryLossPerFold: [3.0, 3.1, 2.9, 3.2, 2.8, 3.0, 3.0],
          scoredRows: 500,
          primaryLossByRole: { D: 3, C: 3, A: 3 },
          meanSpearmanByRole: 0.4,
        },
        {
          candidateId: "U2_G3",
          family: "U2",
          featureCount: 4,
          enumerationIndex: 1,
          primaryLossPerFold: [2.9, 3.15, 2.95, 3.05, 2.9, 2.95, 3.05],
          scoredRows: 500,
          primaryLossByRole: { D: 2.99, C: 2.99, A: 2.99 },
          meanSpearmanByRole: 0.41,
        },
      ],
      bootstrap: { replicates: 200 },
    });
    expect(outcome.winner).toBe("U1");
  });

  it("applyEarlyLayer: G = 0 lascia la stima com'e', un G non calibrato e' un errore", () => {
    const entries: EarlyLayerRecipeEntry[] = [
      { G: 2, winner: "U1", ridgeByRole: {}, selectionStatus: "winner" },
    ];
    const evidence = buildEarlyEvidence([md(1, 6), md(2, 6)], 2);
    expect(applyEarlyLayer(entries, 0, "C", 19, null)).toEqual({ nLayer: 19, applied: "U0", G: 0 });
    expect(applyEarlyLayer(entries, 2, "C", 19, evidence).nLayer).toBeCloseTo(20, 12);
    expect(() => applyEarlyLayer(entries, 3, "C", 19, evidence)).toThrow(/non ha una entry per G = 3/);
  });

  it("applyEarlyLayer rifiuta un'evidenza costruita a un G diverso da quello effettivo", () => {
    const entries: EarlyLayerRecipeEntry[] = [
      { G: 2, winner: "U1", ridgeByRole: {}, selectionStatus: "winner" },
    ];
    const evidence = buildEarlyEvidence([md(1, 6)], 1);
    expect(() => applyEarlyLayer(entries, 2, "C", 19, evidence)).toThrow(/evidenza a G = 1/);
  });

  it("U2 vincente senza artefatto per il ruolo si ferma invece di improvvisare", () => {
    const entries: EarlyLayerRecipeEntry[] = [
      { G: 1, winner: "U2", ridgeByRole: {}, selectionStatus: "winner" },
    ];
    const evidence = buildEarlyEvidence([md(1, 6)], 1);
    expect(() => applyEarlyLayer(entries, 1, "P", 19, evidence)).toThrow(/nessun artefatto per il ruolo/);
  });
});

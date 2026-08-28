import { describe, it, expect } from "vitest";
import {
  GEN_COMPLEXITY_ORDER,
  GEN_MIN_COVERAGE_RATIO,
  GEN_ROLE_REGRESSION_VETO,
  assessAdmissibility,
  complexityRank,
  pairedFoldComparison,
  requiredFoldWins,
  selectGenCandidate,
  standardErrorOfPairedDifferences,
  type GenBaselineEvidence,
  type GenCandidateEvidence,
} from "../src/genProtocol/selection.js";

const BASELINE: GenBaselineEvidence = {
  candidateId: "B0",
  primaryLossPerFold: [10, 10, 10, 10, 10, 10, 10],
  scoredRows: 1000,
  primaryLossByRole: { D: 10, C: 10, A: 10 },
  meanSpearmanByRole: 0.3,
};

function candidate(overrides: Partial<GenCandidateEvidence> & { candidateId: string }): GenCandidateEvidence {
  return {
    family: "FAM-2/S1",
    featureCount: 12,
    enumerationIndex: 0,
    primaryLossPerFold: [9, 9, 9, 9, 9, 9, 9],
    scoredRows: 1000,
    primaryLossByRole: { D: 9, C: 9, A: 9 },
    meanSpearmanByRole: 0.4,
    ...overrides,
  };
}

describe("genProtocol/selection — costanti preregistrate (§B.3, §B.4)", () => {
  it("l'ordine di complessita' e' quello di §B.4.4 — trascritto a mano", () => {
    expect(GEN_COMPLEXITY_ORDER).toEqual([
      "B0",
      "FAM-1",
      "FAM-2/S1",
      "FAM-2/S2",
      "FAM-2/S3",
      "FAM-3",
      "FAM-4",
    ]);
    expect(complexityRank("B0")).toBe(0);
    expect(complexityRank("FAM-1")).toBeLessThan(complexityRank("FAM-2/S1"));
    expect(complexityRank("FAM-2/S3")).toBeLessThan(complexityRank("FAM-3"));
    expect(complexityRank("FAM-3")).toBeLessThan(complexityRank("FAM-4"));
    expect(complexityRank("FAM-4")).toBe(6);
  });

  it("le soglie sono 90% di coverage e 5% di regressione per ruolo", () => {
    expect(GEN_MIN_COVERAGE_RATIO).toBe(0.9);
    expect(GEN_ROLE_REGRESSION_VETO).toBe(0.05);
  });

  it("i fold da vincere: 4 su 7, 2 su 2, maggioranza altrove — valori scritti a mano", () => {
    expect(requiredFoldWins(7)).toBe(4);
    expect(requiredFoldWins(2)).toBe(2);
    expect(requiredFoldWins(3)).toBe(2);
    expect(requiredFoldWins(4)).toBe(3);
    expect(requiredFoldWins(1)).toBe(1);
  });

  it("l'errore standard e' quello CAMPIONARIO della media (n−1), calcolato a mano", () => {
    // [2, 4, 4, 4, 5, 5, 7, 9]: media 5, sd campionaria = sqrt(32/7) = 2,138,
    // SE = 2,138/sqrt(8) = 0,756.
    expect(standardErrorOfPairedDifferences([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7) / Math.sqrt(8), 12);
    expect(standardErrorOfPairedDifferences([3, 3, 3])).toBe(0);
    expect(standardErrorOfPairedDifferences([1])).toBeNaN();
  });
});

describe("genProtocol/selection — ammissibilita' (§B.3)", () => {
  it("la coverage al 90% e' il confine: 900/1000 passa, 899/1000 no", () => {
    expect(assessAdmissibility(candidate({ candidateId: "c", scoredRows: 900 }), BASELINE).admissible).toBe(true);
    const short = assessAdmissibility(candidate({ candidateId: "c", scoredRows: 899 }), BASELINE);
    expect(short.admissible).toBe(false);
    expect(short.failures).toContain("COVERAGE_BELOW_MINIMUM");
    expect(short.coverageRatio).toBeCloseTo(0.899, 12);
  });

  it("meno di 4 fold vinti su 7 e' inammissibile anche vincendo largamente in media", () => {
    const verdict = assessAdmissibility(
      candidate({ candidateId: "c", primaryLossPerFold: [1, 1, 1, 11, 11, 11, 11] }),
      BASELINE,
    );
    expect(verdict.foldWins).toBe(3);
    expect(verdict.requiredFoldWins).toBe(4);
    expect(verdict.meanPrimaryLoss).toBeLessThan(verdict.baselineMeanPrimaryLoss);
    expect(verdict.admissible).toBe(false);
    expect(verdict.failures).toEqual(["NOT_ENOUGH_FOLD_WINS"]);
  });

  it("vincere 4 fold ma non in media resta inammissibile", () => {
    const verdict = assessAdmissibility(
      candidate({ candidateId: "c", primaryLossPerFold: [9, 9, 9, 9, 20, 20, 20] }),
      BASELINE,
    );
    expect(verdict.foldWins).toBe(4);
    expect(verdict.failures).toEqual(["DOES_NOT_BEAT_BASELINE_ON_AVERAGE"]);
  });

  it("un pareggio su un fold NON e' una vittoria", () => {
    const verdict = assessAdmissibility(
      candidate({ candidateId: "c", primaryLossPerFold: [10, 10, 10, 10, 9, 9, 9] }),
      BASELINE,
    );
    expect(verdict.foldWins).toBe(3);
    expect(verdict.admissible).toBe(false);
  });

  it("le violazioni escludono a prescindere dai numeri di merito", () => {
    const verdict = assessAdmissibility(
      candidate({ candidateId: "c", primaryLossPerFold: [1, 1, 1, 1, 1, 1, 1], violations: ["LEAKAGE"] }),
      BASELINE,
    );
    expect(verdict.admissible).toBe(false);
    expect(verdict.failures).toContain("VIOLATIONS");
  });

  it("il veto per ruolo scatta OLTRE il 5%, non al 5% esatto", () => {
    const atThreshold = assessAdmissibility(
      candidate({ candidateId: "c", primaryLossByRole: { D: 9, C: 9, A: 10.5 } }),
      BASELINE,
    );
    expect(atThreshold.roleVetoes).toEqual([]);

    const beyond = assessAdmissibility(
      candidate({ candidateId: "c", primaryLossByRole: { D: 9, C: 9, A: 10.6 } }),
      BASELINE,
    );
    expect(beyond.roleVetoes).toHaveLength(1);
    expect(beyond.roleVetoes[0]!.role).toBe("A");
    expect(beyond.roleVetoes[0]!.relativeRegression).toBeCloseTo(0.06, 12);
    // Il veto NON rende inammissibile il candidato: agisce sul solo ruolo.
    expect(beyond.admissible).toBe(true);
  });

  it("rifiuta un confronto su un numero di fold diverso: non sarebbe paired", () => {
    expect(() =>
      assessAdmissibility(candidate({ candidateId: "c", primaryLossPerFold: [9, 9] }), BASELINE),
    ).toThrow(/not be paired/);
  });
});

describe("genProtocol/selection — l'ordine di §B.4", () => {
  it("il complesso vince quando batte il semplice FUORI da 1 SE", () => {
    const result = selectGenCandidate({
      target: "T1",
      baseline: BASELINE,
      candidates: [
        candidate({
          candidateId: "fam1",
          family: "FAM-1",
          featureCount: 2,
          enumerationIndex: 0,
          primaryLossPerFold: [9.8, 9.9, 10.0, 9.9, 9.8, 9.9, 10.0],
          primaryLossByRole: { D: 9.9, C: 9.9, A: 9.9 },
        }),
        candidate({
          candidateId: "fam4",
          family: "FAM-4",
          featureCount: 40,
          enumerationIndex: 1,
          primaryLossPerFold: [8.1, 7.9, 8.2, 7.8, 8.0, 8.1, 7.9],
          primaryLossByRole: { D: 8, C: 8, A: 8 },
        }),
      ],
    });
    expect(result.status).toBe("winner");
    expect(result.servedCandidateId).toBe("fam4");
    expect(result.lowestMeanLossCandidateId).toBe("fam4");
    expect(result.bootstrapInterval!.containsZero).toBe(false);
    expect(result.statusByRole).toEqual({ D: "winner", C: "winner", A: "winner" });
    const tied = result.oneStandardError.filter((e) => e.withinOneStandardError).map((e) => e.candidateId);
    expect(tied).toEqual(["fam4"]);
  });

  it("dentro 1 SE vince il PIU' SEMPLICE, anche se ha la media piu' alta", () => {
    const result = selectGenCandidate({
      target: "T1",
      baseline: BASELINE,
      candidates: [
        candidate({
          candidateId: "fam1",
          family: "FAM-1",
          featureCount: 2,
          enumerationIndex: 0,
          primaryLossPerFold: [9, 9, 9, 9, 9, 9, 9],
          primaryLossByRole: { D: 9, C: 9, A: 9 },
        }),
        candidate({
          candidateId: "fam4",
          family: "FAM-4",
          featureCount: 40,
          enumerationIndex: 1,
          primaryLossPerFold: [7, 11, 7, 11, 7, 11, 8],
          primaryLossByRole: { D: 8.8, C: 8.9, A: 8.9 },
        }),
      ],
    });
    // fam4 ha la media piu' bassa...
    expect(result.lowestMeanLossCandidateId).toBe("fam4");
    // ...ma fam1 e' dentro un errore standard ed e' piu' semplice.
    expect(result.servedCandidateId).toBe("fam1");
    expect(result.status).toBe("winner");
    const fam1Entry = result.oneStandardError.find((e) => e.candidateId === "fam1")!;
    expect(fam1Entry.withinOneStandardError).toBe(true);
    expect(fam1Entry.meanGap).toBeLessThanOrEqual(fam1Entry.standardError);
    // B0 invece resta fuori: il divario da fam4 supera un errore standard.
    expect(result.oneStandardError.find((e) => e.candidateId === "B0")!.withinOneStandardError).toBe(false);
  });

  it("a parita' di famiglia vince chi ha MENO feature", () => {
    const result = selectGenCandidate({
      target: "T2",
      baseline: BASELINE,
      candidates: [
        candidate({ candidateId: "ricco", family: "FAM-2/S2", featureCount: 90, enumerationIndex: 0 }),
        candidate({ candidateId: "magro", family: "FAM-2/S2", featureCount: 12, enumerationIndex: 1 }),
      ],
    });
    expect(result.servedCandidateId).toBe("magro");
  });

  it("pareggio residuo: Spearman medio per ruolo piu' alto, poi indice di enumerazione", () => {
    const bySpearman = selectGenCandidate({
      target: "T2",
      baseline: BASELINE,
      candidates: [
        candidate({ candidateId: "basso", enumerationIndex: 0, meanSpearmanByRole: 0.31 }),
        candidate({ candidateId: "alto", enumerationIndex: 1, meanSpearmanByRole: 0.55 }),
      ],
    });
    expect(bySpearman.servedCandidateId).toBe("alto");

    const byEnumeration = selectGenCandidate({
      target: "T2",
      baseline: BASELINE,
      candidates: [
        candidate({ candidateId: "secondo", enumerationIndex: 5, meanSpearmanByRole: 0.4 }),
        candidate({ candidateId: "primo", enumerationIndex: 1, meanSpearmanByRole: 0.4 }),
      ],
    });
    expect(byEnumeration.servedCandidateId).toBe("primo");
  });

  it("NO_VERDICT quando l'IC bootstrap della differenza contiene lo zero", () => {
    const result = selectGenCandidate({
      target: "T1",
      baseline: BASELINE,
      candidates: [
        candidate({
          candidateId: "instabile",
          family: "FAM-4",
          primaryLossPerFold: [5, 12, 5, 12, 5, 12, 5],
          primaryLossByRole: { D: 8, C: 8, A: 8 },
        }),
      ],
    });
    expect(result.status).toBe("NO_VERDICT");
    // Si serve B0 e lo si scrive.
    expect(result.servedCandidateId).toBe("B0");
    expect(result.bootstrapInterval!.containsZero).toBe(true);
    expect(result.statusByRole).toEqual({ D: "NO_VERDICT", C: "NO_VERDICT", A: "NO_VERDICT" });
    expect(result.chain.at(-1)!.message).toMatch(/NO_VERDICT/);
  });

  it("T3, due soli fold: l'IC e' rifiutato e la selezione pende sulla baseline", () => {
    const twoFoldBaseline: GenBaselineEvidence = { ...BASELINE, primaryLossPerFold: [10, 10] };
    const result = selectGenCandidate({
      target: "T3",
      baseline: twoFoldBaseline,
      candidates: [
        candidate({
          candidateId: "curva",
          family: "FAM-1",
          primaryLossPerFold: [7, 8],
          primaryLossByRole: { D: 7.5, C: 7.5, A: 7.5 },
        }),
      ],
    });
    expect(result.status).toBe("NO_VERDICT");
    expect(result.bootstrapInterval!.insufficientBlocks).toBe(true);
    expect(result.servedCandidateId).toBe("B0");
  });

  it("il veto per ruolo riporta a B0 SOLO quel ruolo", () => {
    const result = selectGenCandidate({
      target: "T1",
      baseline: BASELINE,
      candidates: [
        candidate({
          candidateId: "vincitore",
          family: "FAM-2/S2",
          primaryLossPerFold: [8.1, 7.9, 8.2, 7.8, 8.0, 8.1, 7.9],
          primaryLossByRole: { D: 7, C: 7, A: 10.6 },
        }),
      ],
    });
    expect(result.status).toBe("winner");
    expect(result.servedCandidateId).toBe("vincitore");
    expect(result.statusByRole).toEqual({ D: "winner", C: "winner", A: "B0" });
    expect(result.chain.some((s) => s.message.includes("veto per ruolo A"))).toBe(true);
  });

  it("nessun candidato ammissibile -> B0, fallback preregistrato", () => {
    const result = selectGenCandidate({
      target: "TN",
      baseline: BASELINE,
      candidates: [candidate({ candidateId: "peggiore", primaryLossPerFold: [11, 11, 11, 11, 11, 11, 11] })],
    });
    expect(result.status).toBe("B0");
    expect(result.servedCandidateId).toBe("B0");
    expect(result.lowestMeanLossCandidateId).toBeNull();
    expect(result.oneStandardError).toEqual([]);
    expect(result.statusByRole).toEqual({ D: "B0", C: "B0", A: "B0" });
  });

  it("un candidato con violazioni non arriva alla selezione, e la catena lo dice", () => {
    const result = selectGenCandidate({
      target: "T1",
      baseline: BASELINE,
      candidates: [
        candidate({
          candidateId: "sporco",
          primaryLossPerFold: [1, 1, 1, 1, 1, 1, 1],
          violations: ["LEAKAGE_SOURCE_SEASON"],
        }),
      ],
    });
    expect(result.status).toBe("B0");
    expect(result.chain[0]!.stage).toBe("violations");
    expect(result.chain[0]!.message).toContain("LEAKAGE_SOURCE_SEASON");
  });
});

describe("genProtocol/selection — la catena e' leggibile e serializzabile (§K)", () => {
  it("sopravvive a un round-trip JSON e racconta chi ha battuto chi", () => {
    const result = selectGenCandidate({
      target: "T1",
      baseline: BASELINE,
      candidates: [
        candidate({
          candidateId: "fam4",
          family: "FAM-4",
          featureCount: 40,
          primaryLossPerFold: [8.1, 7.9, 8.2, 7.8, 8.0, 8.1, 7.9],
          primaryLossByRole: { D: 8, C: 8, A: 8 },
        }),
      ],
    });
    const roundTripped = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(roundTripped.status).toBe(result.status);
    expect(roundTripped.chain).toEqual(result.chain);
    expect(result.chain.map((s) => s.stage)).toEqual([
      "admissibility",
      "mean_primary_loss",
      "one_standard_error",
      "tie_break",
      "bootstrap",
    ]);
    for (const step of result.chain) {
      expect(step.message.length).toBeGreaterThan(0);
      for (const value of Object.values(step.numbers)) expect(typeof value).toBe("number");
    }
    const bootstrapStep = result.chain.at(-1)!;
    expect(bootstrapStep.numbers.seed).toBe(20260902);
    expect(bootstrapStep.numbers.replicates).toBe(2000);
    expect(bootstrapStep.numbers.blocks).toBe(7);
  });

  it("due esecuzioni identiche danno la stessa catena, byte per byte", () => {
    const input = {
      target: "T1" as const,
      baseline: BASELINE,
      candidates: [
        candidate({
          candidateId: "fam2",
          primaryLossPerFold: [9.1, 8.9, 9.2, 8.8, 9.0, 9.1, 8.9],
          primaryLossByRole: { D: 9, C: 9, A: 9 },
        }),
      ],
    };
    expect(JSON.stringify(selectGenCandidate(input))).toBe(JSON.stringify(selectGenCandidate(input)));
  });
});

// --- Fold non misurati: la semantica paired anche alla selezione finale ---
//
// `+∞` significa «fold non misurato» e la rappresentazione non cambia: l'array
// resta lungo quanto i fold. Cambia il confronto — media paired sui fold che i
// due lati hanno ENTRAMBI misurato (§B.4, decisione registrata il 2026-08-28).
// I test sotto sono differenziali: con la semantica precedente (media propria
// con `+∞` dentro) ciascuno di essi dava l'esito opposto, e lo dicono.

const NON_MISURATO = Number.POSITIVE_INFINITY;

/** La media INGENUA, quella di prima: include il fold non misurato. */
function mediaIngenua(perFold: readonly number[]): number {
  return perFold.reduce((sum, value) => sum + value, 0) / perFold.length;
}

describe("genProtocol/selection — confronto paired sui fold comuni (§B.4)", () => {
  it("due serie complete: l'intersezione e' l'insieme pieno e le medie sono quelle di sempre", () => {
    const comparison = pairedFoldComparison([9, 9, 9, 9, 9, 9, 9], [10, 10, 10, 10, 10, 10, 10]);
    expect(comparison.determinate).toBe(true);
    expect(comparison.commonFolds).toBe(7);
    expect(comparison.totalFolds).toBe(7);
    expect(comparison.candidateMean).toBe(9);
    expect(comparison.rivalMean).toBe(10);
    expect(comparison.meanGap).toBe(-1);
    expect(comparison.standardError).toBe(0);
  });

  it("un fold non misurato porta la base a n = 6, e le due medie stanno sugli stessi sei fold", () => {
    const comparison = pairedFoldComparison(
      [NON_MISURATO, 9, 9, 9, 9, 9, 9],
      [2, 10, 10, 10, 10, 10, 10],
    );
    expect(comparison.commonFolds).toBe(6);
    expect(comparison.candidateMean).toBe(9);
    // Il fold 1 della baseline (2) NON entra: non ha un compagno con cui essere
    // paired. La media piena della baseline sarebbe 8,857… — un altro numero.
    expect(comparison.rivalMean).toBe(10);
    expect(comparison.differences).toEqual([-1, -1, -1, -1, -1, -1]);
  });

  it("intersezione vuota: confronto INDETERMINATO, non confronto perso", () => {
    const comparison = pairedFoldComparison(
      [1, 1, 1, NON_MISURATO, NON_MISURATO, NON_MISURATO, NON_MISURATO],
      [NON_MISURATO, NON_MISURATO, NON_MISURATO, 2, 2, 2, 2],
    );
    expect(comparison.determinate).toBe(false);
    expect(comparison.commonFolds).toBe(0);
    expect(comparison.totalFolds).toBe(7);
    expect(Number.isNaN(comparison.meanGap)).toBe(true);
    expect(Number.isNaN(comparison.standardError)).toBe(true);
    expect(comparison.differences).toEqual([]);
  });
});

describe("genProtocol/selection — fold non misurati: ammissibilita' paired (§B.3.3)", () => {
  const R2_LIKE: GenCandidateEvidence = candidate({
    candidateId: "r2-parziale",
    family: "FAM-2/S1",
    featureCount: 12,
    enumerationIndex: 0,
    // Il fold 1 non e' stato misurato; sugli altri sei il candidato vince.
    primaryLossPerFold: [NON_MISURATO, 8.1, 7.9, 8.2, 7.8, 8.0, 8.1],
    primaryLossByRole: { D: 8, C: 8, A: 8 },
  });

  it("un fold non misurato su sette non e' piu' una condanna: ammissibile sui sei comuni", () => {
    const verdict = assessAdmissibility(R2_LIKE, BASELINE);
    expect(verdict.admissible).toBe(true);
    expect(verdict.foldCount).toBe(7);
    expect(verdict.comparisonFolds).toBe(6);
    expect(verdict.foldWins).toBe(6);
    expect(verdict.meanPrimaryLoss).toBeCloseTo(48.1 / 6, 12);
    expect(verdict.baselineMeanPrimaryLoss).toBe(10);
    // Il morso: con la media di prima questo stesso candidato valeva `+∞`, e
    // «DOES_NOT_BEAT_BASELINE_ON_AVERAGE» scattava per un fold su sette.
    expect(Number.isFinite(mediaIngenua(R2_LIKE.primaryLossPerFold))).toBe(false);
  });

  it("...e puo' vincere la selezione, con la base del confronto dichiarata", () => {
    const result = selectGenCandidate({ target: "T2", baseline: BASELINE, candidates: [R2_LIKE] });
    expect(result.status).toBe("winner");
    expect(result.servedCandidateId).toBe("r2-parziale");
    expect(result.lowestMeanLossCandidateId).toBe("r2-parziale");
    // Il bootstrap ricampiona i sei fold comuni: i `+∞` non sono blocchi.
    expect(result.bootstrapInterval!.blocks).toBe(6);
    expect(result.bootstrapInterval!.containsZero).toBe(false);
    expect(result.chain.some((step) => step.message.includes("n = 6 fold comuni"))).toBe(true);
    expect(result.oneStandardError.find((e) => e.candidateId === "B0")!.commonFolds).toBe(6);
  });

  it("la media di B0 e' quella sugli STESSI fold, mai quella piena", () => {
    const baselineIrregolare: GenBaselineEvidence = {
      ...BASELINE,
      primaryLossPerFold: [2, 10, 10, 10, 10, 10, 10],
    };
    const verdict = assessAdmissibility(
      candidate({
        candidateId: "parziale",
        primaryLossPerFold: [NON_MISURATO, 9, 9, 9, 9, 9, 9],
        primaryLossByRole: { D: 9, C: 9, A: 9 },
      }),
      baselineIrregolare,
    );
    expect(verdict.comparisonFolds).toBe(6);
    expect(verdict.meanPrimaryLoss).toBe(9);
    expect(verdict.baselineMeanPrimaryLoss).toBe(10);
    expect(verdict.admissible).toBe(true);
    // Con la media PIENA di B0 (8,857…) lo stesso candidato «non batteva B0»:
    // due grandezze misurate su fold diversi non sono un confronto.
    expect(mediaIngenua(baselineIrregolare.primaryLossPerFold)).toBeLessThan(9);
  });

  it("la consistenza ≥ 4/7 non cambia: un fold mancante non e' una vittoria", () => {
    const verdict = assessAdmissibility(
      candidate({
        candidateId: "troppo-parziale",
        primaryLossPerFold: [1, 1, 1, NON_MISURATO, NON_MISURATO, NON_MISURATO, NON_MISURATO],
        primaryLossByRole: { D: 1, C: 1, A: 1 },
      }),
      BASELINE,
    );
    expect(verdict.foldWins).toBe(3);
    expect(verdict.requiredFoldWins).toBe(4);
    expect(verdict.failures).toContain("NOT_ENOUGH_FOLD_WINS");
    expect(verdict.admissible).toBe(false);
    // E non perche' la media sia brutta: sui tre fold comuni stravince. E' la
    // consistenza a mettere il tetto ai fold mancanti — non serve una soglia
    // nuova accanto a lei.
    expect(verdict.comparisonFolds).toBe(3);
    expect(verdict.meanPrimaryLoss).toBe(1);
    expect(verdict.failures).not.toContain("DOES_NOT_BEAT_BASELINE_ON_AVERAGE");
  });

  it("zero fold misurati resta fuori, con la media a `+∞` come prima", () => {
    const maiMisurato = candidate({
      candidateId: "mai-misurato",
      primaryLossPerFold: [
        NON_MISURATO,
        NON_MISURATO,
        NON_MISURATO,
        NON_MISURATO,
        NON_MISURATO,
        NON_MISURATO,
        NON_MISURATO,
      ],
      primaryLossByRole: { D: NON_MISURATO, C: NON_MISURATO, A: NON_MISURATO },
    });
    const verdict = assessAdmissibility(maiMisurato, BASELINE);
    expect(verdict.comparisonFolds).toBe(0);
    expect(verdict.foldWins).toBe(0);
    expect(verdict.meanPrimaryLoss).toBe(Number.POSITIVE_INFINITY);
    expect(verdict.baselineMeanPrimaryLoss).toBe(10);
    expect(verdict.failures).toContain("DOES_NOT_BEAT_BASELINE_ON_AVERAGE");
    expect(verdict.admissible).toBe(false);

    const result = selectGenCandidate({ target: "T1", baseline: BASELINE, candidates: [maiMisurato] });
    expect(result.status).toBe("B0");
    expect(result.servedCandidateId).toBe("B0");
  });
});

describe("genProtocol/selection — fold non misurati: l'ordine di §B.4", () => {
  it("il pairing CAMBIA il vincitore: il parziale batte il completo sui sei fold comuni", () => {
    const result = selectGenCandidate({
      target: "T1",
      baseline: BASELINE,
      candidates: [
        candidate({
          candidateId: "completo",
          family: "FAM-2/S1",
          featureCount: 12,
          enumerationIndex: 0,
          primaryLossPerFold: [9, 9, 9, 9, 9, 9, 9],
          primaryLossByRole: { D: 9, C: 9, A: 9 },
        }),
        candidate({
          candidateId: "parziale",
          family: "FAM-2/S1",
          featureCount: 12,
          enumerationIndex: 1,
          primaryLossPerFold: [NON_MISURATO, 8.5, 8.5, 8.5, 8.5, 8.5, 8.5],
          primaryLossByRole: { D: 8.5, C: 8.5, A: 8.5 },
        }),
      ],
    });
    // Con la semantica di prima `parziale` era inammissibile e la selezione
    // serviva `completo`: qui l'ordine si rovescia sui fold che condividono.
    expect(result.admissibility.find((v) => v.candidateId === "completo")!.admissible).toBe(true);
    expect(result.admissibility.find((v) => v.candidateId === "parziale")!.admissible).toBe(true);
    expect(result.lowestMeanLossCandidateId).toBe("parziale");
    expect(result.servedCandidateId).toBe("parziale");
    expect(result.status).toBe("winner");
    const completo = result.oneStandardError.find((e) => e.candidateId === "completo")!;
    expect(completo.commonFolds).toBe(6);
    expect(completo.determinate).toBe(true);
    expect(completo.withinOneStandardError).toBe(false);
  });

  it("il vincitore non dipende dall'ordine di arrivo dei candidati", () => {
    const completo = candidate({
      candidateId: "completo",
      family: "FAM-2/S1",
      featureCount: 12,
      enumerationIndex: 0,
      primaryLossPerFold: [9, 9, 9, 9, 9, 9, 9],
      primaryLossByRole: { D: 9, C: 9, A: 9 },
    });
    const parziale = candidate({
      candidateId: "parziale",
      family: "FAM-2/S1",
      featureCount: 12,
      enumerationIndex: 1,
      primaryLossPerFold: [NON_MISURATO, 8.5, 8.5, 8.5, 8.5, 8.5, 8.5],
      primaryLossByRole: { D: 8.5, C: 8.5, A: 8.5 },
    });
    const diretto = selectGenCandidate({ target: "T1", baseline: BASELINE, candidates: [completo, parziale] });
    const invertito = selectGenCandidate({ target: "T1", baseline: BASELINE, candidates: [parziale, completo] });
    expect(invertito.servedCandidateId).toBe(diretto.servedCandidateId);
    expect(invertito.lowestMeanLossCandidateId).toBe(diretto.lowestMeanLossCandidateId);
  });

  it("due parziali senza fold in comune non sono mai entrambi ammissibili: lo vieta gia' §B.3.3", () => {
    const result = selectGenCandidate({
      target: "T1",
      baseline: BASELINE,
      candidates: [
        candidate({
          candidateId: "primi-quattro",
          family: "FAM-1",
          featureCount: 2,
          enumerationIndex: 0,
          primaryLossPerFold: [7, 7, 7, 7, NON_MISURATO, NON_MISURATO, NON_MISURATO],
          primaryLossByRole: { D: 7, C: 7, A: 7 },
        }),
        candidate({
          candidateId: "ultimi-tre",
          family: "FAM-4",
          featureCount: 40,
          enumerationIndex: 1,
          primaryLossPerFold: [NON_MISURATO, NON_MISURATO, NON_MISURATO, NON_MISURATO, 6, 6, 6],
          primaryLossByRole: { D: 6, C: 6, A: 6 },
        }),
      ],
    });
    // La maggioranza stretta dei fold vale per entrambi: due insiemi che
    // coprono piu' di meta' dei sette fold si intersecano sempre. Chi non
    // arriva a 4 vittorie esce prima di poter essere confrontato.
    expect(result.admissibility.filter((v) => v.admissible).map((v) => v.candidateId)).toEqual(["primi-quattro"]);
    expect(result.admissibility.find((v) => v.candidateId === "ultimi-tre")!.failures).toContain(
      "NOT_ENOUGH_FOLD_WINS",
    );
    // E quattro fold comuni sono meno dei cinque blocchi che l'IC richiede:
    // l'evidenza non basta, e la conclusione preregistrata e' NO_VERDICT.
    expect(result.bootstrapInterval!.blocks).toBe(4);
    expect(result.bootstrapInterval!.insufficientBlocks).toBe(true);
    expect(result.status).toBe("NO_VERDICT");
    expect(result.servedCandidateId).toBe("B0");
  });
});

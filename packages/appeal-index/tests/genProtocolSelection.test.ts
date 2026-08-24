import { describe, it, expect } from "vitest";
import {
  GEN_COMPLEXITY_ORDER,
  GEN_MIN_COVERAGE_RATIO,
  GEN_ROLE_REGRESSION_VETO,
  assessAdmissibility,
  complexityRank,
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

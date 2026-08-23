import { describe, it, expect } from "vitest";
import {
  GEN_COVERAGE_SITUATIONS,
  MIN_PRESENCES_FOR_RATES,
  UNMATCHED_FAMILIES,
  classifyCoverage,
  coverageSummary,
  splitUnmatchedRows,
  type GenCoverageFacts,
} from "../src/genProtocol/coverageClassifier.js";

function facts(overrides: Partial<GenCoverageFacts> = {}): GenCoverageFacts {
  return {
    playerKey: "PK",
    role: "C",
    identitaInReview: false,
    haStoricoVotiSerieA: false,
    ultimaStagioneVoti: null,
    haVotiInS1: false,
    presenzeS1: null,
    haStatsDomesticheS1: false,
    haStatsEstere: false,
    legaEsteraCoperta: false,
    haStatsSerieB: false,
    ...overrides,
  };
}

describe("genProtocol/coverageClassifier — le undici situazioni", () => {
  it("sono undici, A–K, ciascuna con nome, descrizione e decisione", () => {
    const letters = Object.keys(GEN_COVERAGE_SITUATIONS);
    expect(letters).toHaveLength(11);
    expect(letters.sort()).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]);
    for (const entry of Object.values(GEN_COVERAGE_SITUATIONS)) {
      expect(entry.nome.length).toBeGreaterThan(3);
      expect(entry.descrizione.length).toBeGreaterThan(10);
      expect(entry.decisione.length).toBeGreaterThan(10);
    }
  });

  it("A — storico completo: voti in s−1 con presenze e statistiche agganciate", () => {
    const verdict = classifyCoverage(
      facts({
        haStoricoVotiSerieA: true,
        haVotiInS1: true,
        ultimaStagioneVoti: "2025_26",
        presenzeS1: 25,
        haStatsDomesticheS1: true,
      }),
    );
    expect(verdict.situazione).toBe("A");
    expect(verdict.modelloApplicabile).toBe("domestic_full");
    expect(verdict.servable).toBe(true);
  });

  it("H — voti senza statistiche: resta il set S1", () => {
    const verdict = classifyCoverage(
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 20, haStatsDomesticheS1: false }),
    );
    expect(verdict.situazione).toBe("H");
    expect(verdict.tierFeature).toBe("S1");
    expect(verdict.reasonCode).toBe("VOTES_WITHOUT_DOMESTIC_STATS");
  });

  it("F — storico interrotto: la riga si emette lo stesso, con Lag1 a NaN", () => {
    const verdict = classifyCoverage(
      facts({ haStoricoVotiSerieA: true, haVotiInS1: false, ultimaStagioneVoti: "2023_24" }),
    );
    expect(verdict.situazione).toBe("F");
    expect(verdict.servable).toBe(true);
    expect(verdict.motivo).toContain("2023_24");
  });

  it("I — storico minimo: sotto le 2 presenze i tassi non esistono, si serve la baseline", () => {
    const verdict = classifyCoverage(
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 1, haStatsDomesticheS1: true }),
    );
    expect(verdict.situazione).toBe("I");
    expect(verdict.modelloApplicabile).toBe("baseline_only");
    expect(MIN_PRESENCES_FOR_RATES).toBe(2);
  });

  it("J — stagione tutta SV: N = 0 e' un valore, T2 resta indefinito", () => {
    const verdict = classifyCoverage(
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 0, haStatsDomesticheS1: true }),
    );
    expect(verdict.situazione).toBe("J");
    expect(verdict.servable).toBe(true);
    expect(verdict.motivo).toContain("indefinito");
  });

  it("K — identita' in review: viene PRIMA di tutto, e non si indovina", () => {
    const verdict = classifyCoverage(
      facts({ identitaInReview: true, haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 30, haStatsDomesticheS1: true }),
    );
    expect(verdict.situazione).toBe("K");
    expect(verdict.servable).toBe(false);
    expect(verdict.modelloApplicabile).toBe("none");
  });

  it("B e C — estero, e la copertura della lega decide se e' servibile", () => {
    const coperta = classifyCoverage(facts({ haStatsEstere: true, legaEsteraCoperta: true }));
    expect(coperta.situazione).toBe("B");
    expect(coperta.modelloApplicabile).toBe("foreign_transition");
    expect(coperta.servable).toBe(true);

    const scoperta = classifyCoverage(facts({ haStatsEstere: true, legaEsteraCoperta: false }));
    expect(scoperta.situazione).toBe("C");
    expect(scoperta.servable).toBe(false);
    expect(scoperta.reasonCode).toBe("FOREIGN_LEAGUE_NOT_COLLECTED");
  });

  it("D — la Serie B ha la precedenza sull'estero: e' disponibile per decisione (§D.13)", () => {
    const verdict = classifyCoverage(facts({ haStatsSerieB: true, haStatsEstere: true, legaEsteraCoperta: false }));
    expect(verdict.situazione).toBe("D");
    expect(verdict.servable).toBe(true);
  });

  it("E — statistiche domestiche senza voti: nessun blocco X", () => {
    const verdict = classifyCoverage(facts({ haStatsDomesticheS1: true }));
    expect(verdict.situazione).toBe("E");
    expect(verdict.reasonCode).toBe("DOMESTIC_STATS_WITHOUT_VOTES");
  });

  it("G — esordiente assoluto: `n/d` motivato, MAI la media di ruolo", () => {
    const verdict = classifyCoverage(facts());
    expect(verdict.situazione).toBe("G");
    expect(verdict.servable).toBe(false);
    expect(verdict.modelloApplicabile).toBe("none");
    expect(verdict.motivo).toContain("mai una media di ruolo");
  });

  it("nessuna situazione servibile finisce con modello `none`, e viceversa", () => {
    const casi: GenCoverageFacts[] = [
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 25, haStatsDomesticheS1: true }),
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 25 }),
      facts({ haStoricoVotiSerieA: true, haVotiInS1: false, ultimaStagioneVoti: "2022_23" }),
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 1 }),
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 0 }),
      facts({ haStatsDomesticheS1: true }),
      facts({ haStatsSerieB: true }),
      facts({ haStatsEstere: true, legaEsteraCoperta: true }),
      facts({ haStatsEstere: true }),
      facts(),
      facts({ identitaInReview: true }),
    ];
    const situazioni = new Set(casi.map((caso) => classifyCoverage(caso).situazione));
    // Undici casi, undici situazioni distinte: il set minimo di fatti le separa
    // davvero tutte.
    expect(situazioni.size).toBe(11);
    for (const caso of casi) {
      const verdict = classifyCoverage(caso);
      expect(verdict.servable).toBe(verdict.modelloApplicabile !== "none");
      expect(verdict.motivo.length).toBeGreaterThan(10);
    }
  });
});

describe("genProtocol/coverageClassifier — la scomposizione delle righe senza match", () => {
  it("le famiglie senza storico sono {B, C, D, E, G}", () => {
    expect([...UNMATCHED_FAMILIES]).toEqual(["B", "C", "D", "E", "G"]);
  });

  it("separa e CONTA: un numero solo diventa cinque numeri con cinque risposte", () => {
    const rows: GenCoverageFacts[] = [
      ...Array.from({ length: 40 }, (_, i) => facts({ playerKey: `B${String(i)}`, haStatsEstere: true, legaEsteraCoperta: true })),
      ...Array.from({ length: 25 }, (_, i) => facts({ playerKey: `C${String(i)}`, haStatsEstere: true })),
      ...Array.from({ length: 60 }, (_, i) => facts({ playerKey: `D${String(i)}`, haStatsSerieB: true })),
      ...Array.from({ length: 5 }, (_, i) => facts({ playerKey: `E${String(i)}`, haStatsDomesticheS1: true })),
      ...Array.from({ length: 20 }, (_, i) => facts({ playerKey: `G${String(i)}` })),
      // Righe CON storico: non entrano nella scomposizione.
      ...Array.from({ length: 300 }, (_, i) =>
        facts({ playerKey: `A${String(i)}`, haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 20, haStatsDomesticheS1: true }),
      ),
    ];
    const split = splitUnmatchedRows(rows);
    expect(split.total).toBe(150);
    expect(split.counts.B).toBe(40);
    expect(split.counts.C).toBe(25);
    expect(split.counts.D).toBe(60);
    expect(split.counts.E).toBe(5);
    expect(split.counts.G).toBe(20);
    // Servibili: B (40) + D (60) + E (5) = 105; C e G restano `n/d` motivati.
    expect(split.servable).toBe(105);
    expect(split.rows.C).toHaveLength(25);

    const summary = coverageSummary(rows);
    expect(summary.A).toBe(300);
    expect(summary.B + summary.C + summary.D + summary.E + summary.G).toBe(150);
  });
});

import { describe, it, expect } from "vitest";
import {
  GEN_COVERAGE_SITUATIONS,
  MIN_PRESENCES_FOR_RATES,
  UNMATCHED_FAMILIES,
  classifyCoverage,
  coverageSummary,
  splitUnmatchedRows,
  type GenCoverageFacts,
  type GenCoverageSituation,
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
    haStatsEstereRecenti: false,
    statsSpezzateSuDueLeghe: false,
    cambioSquadraInSerieA: false,
    ...overrides,
  };
}

describe("genProtocol/coverageClassifier — le undici situazioni", () => {
  it("sono undici, A–K, ciascuna con nome, descrizione, decisione e addestrabilita'", () => {
    const letters = Object.keys(GEN_COVERAGE_SITUATIONS);
    expect(letters).toHaveLength(11);
    expect(letters.sort()).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]);
    for (const entry of Object.values(GEN_COVERAGE_SITUATIONS)) {
      expect(entry.nome.length).toBeGreaterThan(3);
      expect(entry.descrizione.length).toBeGreaterThan(10);
      expect(entry.decisione.length).toBeGreaterThan(10);
    }
  });

  it("la tabella lettera -> situazione e' quella del committente (prova per mutazione)", () => {
    // I valori attesi sono scritti QUI, indipendenti dal modulo: se qualcuno
    // rimescola le lettere — com'e' gia' successo una volta — questo test cade
    // prima che un report esca con la lettera sbagliata.
    const attese: Record<GenCoverageSituation, { nome: string; addestrabile: string }> = {
      A: { nome: "anni consecutivi in Serie A", addestrabile: "si" },
      B: { nome: "in Serie A, ha saltato l'ultimo anno", addestrabile: "si" },
      C: { nome: "promosso dalla Serie B", addestrabile: "no_solo_valutabile" },
      D: { nome: "arrivo da uno dei 14 campionati esteri", addestrabile: "no_solo_valutabile" },
      E: { nome: "arrivo da un campionato fuori dai 14", addestrabile: "no" },
      F: { nome: "ex Serie A, tornato dopo anni all'estero", addestrabile: "si_condizionata" },
      G: { nome: "esordiente assoluto o dalla Primavera", addestrabile: "no" },
      H: { nome: "in Serie A ma con pochissime presenze", addestrabile: "si_condizionata" },
      I: { nome: "portiere di riserva", addestrabile: "si" },
      J: { nome: "trasferito a stagione in corso", addestrabile: "si_condizionata" },
      K: { nome: "cambio squadra dentro la Serie A", addestrabile: "si" },
    };
    for (const [lettera, attesa] of Object.entries(attese)) {
      const entry = GEN_COVERAGE_SITUATIONS[lettera as GenCoverageSituation];
      expect(`${lettera}: ${entry.nome}`).toBe(`${lettera}: ${attesa.nome}`);
      expect(`${lettera}: ${entry.addestrabile}`).toBe(`${lettera}: ${attesa.addestrabile}`);
    }
  });

  it("A — anni consecutivi in Serie A: voti in s−1 con presenze e statistiche agganciate", () => {
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
    expect(verdict.reasonCode).toBe("FULL_HISTORY");
    expect(verdict.servable).toBe(true);
  });

  it("A anche senza statistiche di stagione: cambia il reason code, non la lettera", () => {
    // «Voti senza statistiche di stagione» e' una PROFONDITA' della riga, non
    // una situazione della tabella: resta A, sul solo blocco X.
    const verdict = classifyCoverage(
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 20, haStatsDomesticheS1: false }),
    );
    expect(verdict.situazione).toBe("A");
    expect(verdict.tierFeature).toBe("S1");
    expect(verdict.modelloApplicabile).toBe("domestic_s1_only");
    expect(verdict.reasonCode).toBe("VOTES_WITHOUT_DOMESTIC_STATS");
  });

  it("K — cambio squadra dentro la Serie A: decisione identica ad A, lettera distinta per il report", () => {
    const comune = { haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 25, haStatsDomesticheS1: true };
    const restato = classifyCoverage(facts(comune));
    const cambiato = classifyCoverage(facts({ ...comune, cambioSquadraInSerieA: true }));
    expect(restato.situazione).toBe("A");
    expect(cambiato.situazione).toBe("K");
    // Tutto il resto e' identico: il cambio maglia e' gia' una feature del
    // modello (`teamChangedFlag`), non una decisione diversa.
    expect({ ...cambiato, situazione: "A" }).toEqual(restato);
  });

  it("B — ha saltato l'ultimo anno: la riga si emette lo stesso, con Lag1 a NaN", () => {
    const verdict = classifyCoverage(
      facts({ haStoricoVotiSerieA: true, haVotiInS1: false, ultimaStagioneVoti: "2023_24" }),
    );
    expect(verdict.situazione).toBe("B");
    expect(verdict.servable).toBe(true);
    expect(verdict.reasonCode).toBe("HISTORY_GAP_IN_PREVIOUS_SEASON");
    expect(verdict.motivo).toContain("2023_24");
  });

  it("F — lo stesso buco, ma riempito all'estero: e' un'altra situazione", () => {
    const verdict = classifyCoverage(
      facts({
        haStoricoVotiSerieA: true,
        haVotiInS1: false,
        ultimaStagioneVoti: "2022_23",
        haStatsEstere: true,
        haStatsEstereRecenti: true,
      }),
    );
    expect(verdict.situazione).toBe("F");
    expect(verdict.servable).toBe(true);
    expect(verdict.reasonCode).toBe("RETURN_AFTER_SEASONS_ABROAD");
    // Il limite dichiarato: le feature estere recenti NON entrano nel modello
    // domestico congelato, e la riga lo dice invece di lasciarlo intendere.
    expect(verdict.motivo).toContain("FUORI dal modello domestico congelato");
    expect(GEN_COVERAGE_SITUATIONS.F.decisione).toContain("v2.0.0");
  });

  it("H — pochissime presenze: sotto le 2 i tassi non esistono, si serve la baseline", () => {
    const verdict = classifyCoverage(
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 1, haStatsDomesticheS1: true }),
    );
    expect(verdict.situazione).toBe("H");
    expect(verdict.modelloApplicabile).toBe("baseline_only");
    expect(verdict.reasonCode).toBe("TOO_FEW_PRESENCES_FOR_RATES");
    expect(MIN_PRESENCES_FOR_RATES).toBe(2);
  });

  it("la stagione tutta SV e' un reason code dentro H, non una lettera", () => {
    const verdict = classifyCoverage(
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 0, haStatsDomesticheS1: true }),
    );
    expect(verdict.situazione).toBe("H");
    expect(verdict.reasonCode).toBe("ALL_SV_SEASON");
    expect(verdict.servable).toBe(true);
    expect(verdict.motivo).toContain("indefinito");
  });

  it("I — il portiere con lo stesso storico magro ha lettera propria (§D.8)", () => {
    const magro = { haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 1 };
    const centrocampista = classifyCoverage(facts({ ...magro, role: "C" }));
    const portiere = classifyCoverage(facts({ ...magro, role: "P" }));
    expect(centrocampista.situazione).toBe("H");
    expect(portiere.situazione).toBe("I");
    // Stessa meccanica: cambia la lettera che il report conta, non la decisione.
    expect(portiere.modelloApplicabile).toBe(centrocampista.modelloApplicabile);
    expect(portiere.reasonCode).toBe(centrocampista.reasonCode);
    // E vale anche per la stagione tutta SV e per le statistiche senza voti.
    expect(classifyCoverage(facts({ ...magro, role: "P", presenzeS1: 0 })).situazione).toBe("I");
    expect(classifyCoverage(facts({ role: "P", haStatsDomesticheS1: true })).situazione).toBe("I");
  });

  it("J — s−1 spezzata su due campionati: si valuta PRIMA della soglia di presenze", () => {
    const verdict = classifyCoverage(
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 1, statsSpezzateSuDueLeghe: true }),
    );
    expect(verdict.situazione).toBe("J");
    expect(verdict.reasonCode).toBe("SPLIT_SEASON_ACROSS_LEAGUES");
    expect(verdict.servable).toBe(true);
    // Mezza stagione ha per costruzione poche presenze: leggerla come «storico
    // magro» sarebbe diagnosticare il giocatore invece del dato.
    expect(verdict.situazione).not.toBe("H");
    // Due meta' entrambe estere non sono J: nessuna produce un bersaglio.
    expect(
      classifyCoverage(facts({ statsSpezzateSuDueLeghe: true, haStatsEstere: true, legaEsteraCoperta: true }))
        .situazione,
    ).toBe("D");
  });

  it("l'identita' in review e' ORTOGONALE: la lettera si stima, la riga resta sospesa", () => {
    const dati = { haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 30, haStatsDomesticheS1: true };
    const risolta = classifyCoverage(facts(dati));
    const inReview = classifyCoverage(facts({ ...dati, identitaInReview: true }));
    expect(risolta.situazione).toBe("A");
    // La lettera stimata sopravvive — dice che cosa si recupererebbe — ma la
    // riga non e' servibile finche' non si sa CHI e' (§A.0.4).
    expect(inReview.situazione).toBe("A");
    expect(inReview.servable).toBe(false);
    expect(inReview.modelloApplicabile).toBe("none");
    expect(inReview.reasonCode).toBe("IDENTITY_REVIEW_REQUIRED");
    // E accompagna QUALUNQUE lettera, non solo A.
    const esordiente = classifyCoverage(facts({ identitaInReview: true }));
    expect(esordiente.situazione).toBe("G");
    expect(esordiente.reasonCode).toBe("IDENTITY_REVIEW_REQUIRED");
  });

  it("D ed E — estero, e la copertura della lega decide se e' servibile", () => {
    const coperta = classifyCoverage(facts({ haStatsEstere: true, legaEsteraCoperta: true }));
    expect(coperta.situazione).toBe("D");
    expect(coperta.modelloApplicabile).toBe("foreign_transition");
    expect(coperta.servable).toBe(true);

    const scoperta = classifyCoverage(facts({ haStatsEstere: true, legaEsteraCoperta: false }));
    expect(scoperta.situazione).toBe("E");
    expect(scoperta.servable).toBe(false);
    expect(scoperta.reasonCode).toBe("FOREIGN_LEAGUE_NOT_COLLECTED");
  });

  it("C — la Serie B ha la precedenza sull'estero: e' disponibile per decisione (§D.13)", () => {
    const verdict = classifyCoverage(facts({ haStatsSerieB: true, haStatsEstere: true, legaEsteraCoperta: false }));
    expect(verdict.situazione).toBe("C");
    expect(verdict.servable).toBe(true);
    expect(verdict.reasonCode).toBe("SERIE_B_ONLY");
  });

  it("statistiche domestiche senza voti: il criterio scritto le manda in H, non in G", () => {
    // Il vettore di stagione c'e', il bersaglio no: e' un bersaglio magro (H),
    // non un giocatore di cui non esiste niente (G).
    const conStatistiche = classifyCoverage(facts({ haStatsDomesticheS1: true }));
    expect(conStatistiche.situazione).toBe("H");
    expect(conStatistiche.reasonCode).toBe("DOMESTIC_STATS_WITHOUT_VOTES");
    expect(conStatistiche.servable).toBe(true);
    expect(classifyCoverage(facts()).situazione).toBe("G");
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
      facts({ haStoricoVotiSerieA: true, haVotiInS1: false, ultimaStagioneVoti: "2022_23" }),
      facts({ haStatsSerieB: true }),
      facts({ haStatsEstere: true, legaEsteraCoperta: true }),
      facts({ haStatsEstere: true }),
      facts({ haStoricoVotiSerieA: true, haVotiInS1: false, ultimaStagioneVoti: "2021_22", haStatsEstereRecenti: true }),
      facts(),
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 1 }),
      facts({ role: "P", haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 1 }),
      facts({ haStoricoVotiSerieA: true, haVotiInS1: true, presenzeS1: 12, statsSpezzateSuDueLeghe: true }),
      facts({
        haStoricoVotiSerieA: true,
        haVotiInS1: true,
        presenzeS1: 25,
        haStatsDomesticheS1: true,
        cambioSquadraInSerieA: true,
      }),
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
  it("le famiglie senza riscontro su s−1 sono {B, C, D, E, G}", () => {
    expect([...UNMATCHED_FAMILIES]).toEqual(["B", "C", "D", "E", "G"]);
  });

  it("separa e CONTA: un numero solo diventa cinque numeri con cinque risposte", () => {
    const rows: GenCoverageFacts[] = [
      // B — in Serie A, ha saltato l'ultimo anno: nessun match su s−1.
      ...Array.from({ length: 5 }, (_, i) =>
        facts({ playerKey: `B${String(i)}`, haStoricoVotiSerieA: true, ultimaStagioneVoti: "2023_24" }),
      ),
      ...Array.from({ length: 60 }, (_, i) => facts({ playerKey: `C${String(i)}`, haStatsSerieB: true })),
      ...Array.from({ length: 40 }, (_, i) =>
        facts({ playerKey: `D${String(i)}`, haStatsEstere: true, legaEsteraCoperta: true }),
      ),
      ...Array.from({ length: 25 }, (_, i) => facts({ playerKey: `E${String(i)}`, haStatsEstere: true })),
      ...Array.from({ length: 20 }, (_, i) => facts({ playerKey: `G${String(i)}` })),
      // Righe CON riscontro su s−1: non entrano nella scomposizione.
      ...Array.from({ length: 300 }, (_, i) =>
        facts({
          playerKey: `A${String(i)}`,
          haStoricoVotiSerieA: true,
          haVotiInS1: true,
          presenzeS1: 20,
          haStatsDomesticheS1: true,
        }),
      ),
      // Nemmeno le statistiche domestiche senza voti (H) e i rientri
      // dall'estero (F): il committente non le mette nelle 150.
      ...Array.from({ length: 7 }, (_, i) => facts({ playerKey: `H${String(i)}`, haStatsDomesticheS1: true })),
      ...Array.from({ length: 3 }, (_, i) =>
        facts({
          playerKey: `F${String(i)}`,
          haStoricoVotiSerieA: true,
          ultimaStagioneVoti: "2022_23",
          haStatsEstereRecenti: true,
        }),
      ),
    ];
    const split = splitUnmatchedRows(rows);
    expect(split.total).toBe(150);
    expect(split.counts.B).toBe(5);
    expect(split.counts.C).toBe(60);
    expect(split.counts.D).toBe(40);
    expect(split.counts.E).toBe(25);
    expect(split.counts.G).toBe(20);
    expect(split.counts.F).toBe(0);
    expect(split.counts.H).toBe(0);
    // Servibili: B (5) + C (60) + D (40) = 105; E e G restano `n/d` motivati.
    expect(split.servable).toBe(105);
    expect(split.rows.E).toHaveLength(25);
    expect(split.inIdentityReview).toBe(0);

    const summary = coverageSummary(rows);
    expect(summary.A).toBe(300);
    expect(summary.F).toBe(3);
    expect(summary.H).toBe(7);
    expect(summary.B + summary.C + summary.D + summary.E + summary.G).toBe(150);
  });

  it("un rientro dopo un anno di buco entra nel conto: e' la correzione delle lettere", () => {
    // Con la mappa sbagliata questa riga finiva in una lettera fuori dalle
    // famiglie e spariva dal primo passo, pur non avendo alcun riscontro su s−1.
    const split = splitUnmatchedRows([
      facts({ playerKey: "rientro", haStoricoVotiSerieA: true, haVotiInS1: false, ultimaStagioneVoti: "2023_24" }),
    ]);
    expect(split.total).toBe(1);
    expect(split.counts.B).toBe(1);
    expect(split.servable).toBe(1);
  });

  it("le righe sospese per identita' si contano a parte, dentro la famiglia stimata", () => {
    const split = splitUnmatchedRows([
      facts({ playerKey: "noto", haStatsSerieB: true }),
      facts({ playerKey: "ignoto", haStatsSerieB: true, identitaInReview: true }),
    ]);
    expect(split.counts.C).toBe(2);
    expect(split.inIdentityReview).toBe(1);
    // Sospesa vuol dire non servibile: il conteggio dei servibili non la include.
    expect(split.servable).toBe(1);
  });
});

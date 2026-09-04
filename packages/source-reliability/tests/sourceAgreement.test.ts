import { describe, it, expect } from "vitest";
import {
  AGREEMENT_MEASURE_VERSION,
  MIN_DECIDED_CALLS_FOR_A_READING,
  MIN_MATCHDAYS_FOR_A_READING,
  compareInstants,
  isCanonicalInstant,
  measureSourceAgreement,
  type ActualLineup,
  type AgreementReport,
  type ForecastSnapshot,
  type PlayerCall,
  type StarterCall,
} from "../src/index.js";

// FIXTURE SINTETICHE. Fonti, squadre e giocatori sono nomi inventati: qui non
// entra nessun dato reale, e nessuna delle fonti dichiarate altrove nel
// progetto compare con il proprio nome. Chi legge questi test deve poter
// verificare la misura senza sapere di chi si parla — è esattamente ciò che il
// pacchetto pretende di fare.

const KICKOFF = "2026-09-13T18:45:00Z";
const BEFORE = "2026-09-13T17:00:00Z";
const AFTER = "2026-09-13T21:30:00Z";

function forecast(options: {
  readonly source: string;
  readonly team: string;
  readonly matchday?: number;
  readonly observedAt?: string;
  readonly starters?: readonly string[];
  readonly nonStarters?: readonly string[];
  readonly phase?: "pre_kickoff" | "post_kickoff";
}): ForecastSnapshot {
  const calls: PlayerCall[] = [
    ...(options.starters ?? []).map((playerId): PlayerCall => ({ playerId, call: "starter" })),
    ...(options.nonStarters ?? []).map((playerId): PlayerCall => ({ playerId, call: "non_starter" })),
  ];
  return {
    stamp: {
      source: options.source,
      observedAt: options.observedAt ?? BEFORE,
      matchday: options.matchday ?? 1,
      phase: options.phase ?? "pre_kickoff",
    },
    team: options.team,
    calls,
  };
}

function actual(options: {
  readonly team: string;
  readonly matchday?: number;
  readonly observedAt?: string;
  readonly kickoffAt?: string;
  readonly starters?: readonly string[];
  readonly bench?: readonly string[];
  readonly benchComplete?: boolean;
  readonly status?: "played" | "postponed";
  readonly phase?: "pre_kickoff" | "post_kickoff";
  readonly source?: string;
}): ActualLineup {
  return {
    stamp: {
      source: options.source ?? "verita-sintetica",
      observedAt: options.observedAt ?? AFTER,
      matchday: options.matchday ?? 1,
      phase: options.phase ?? "post_kickoff",
    },
    team: options.team,
    kickoffAt: options.kickoffAt ?? KICKOFF,
    status: options.status ?? "played",
    starters: options.starters ?? [],
    bench: options.bench ?? [],
    benchComplete: options.benchComplete ?? true,
  };
}

function reportOf(input: {
  readonly forecasts: readonly ForecastSnapshot[];
  readonly actuals: readonly ActualLineup[];
}): AgreementReport {
  const outcome = measureSourceAgreement(input);
  if (!outcome.ok) throw new Error("atteso un esito, ricevuto un rifiuto: " + JSON.stringify(outcome.rejections));
  return outcome.report;
}

function rejectionCodes(input: {
  readonly forecasts: readonly ForecastSnapshot[];
  readonly actuals: readonly ActualLineup[];
}): readonly string[] {
  const outcome = measureSourceAgreement(input);
  if (outcome.ok) throw new Error("atteso un rifiuto, ricevuto un esito");
  return outcome.rejections.map((r) => r.code);
}

describe("istanti senza orologio", () => {
  it("accetta solo la forma canonica UTC e solo date che esistono", () => {
    expect(isCanonicalInstant("2026-09-13T18:45:00Z")).toBe(true);
    expect(isCanonicalInstant("2028-02-29T00:00:00Z")).toBe(true); // bisestile
    expect(isCanonicalInstant("2026-02-29T00:00:00Z")).toBe(false); // non bisestile
    expect(isCanonicalInstant("2026-13-01T00:00:00Z")).toBe(false);
    expect(isCanonicalInstant("2026-09-13T24:00:00Z")).toBe(false);
    expect(isCanonicalInstant("2026-09-13T18:45Z")).toBe(false);
    expect(isCanonicalInstant("2026-09-13T18:45:00+02:00")).toBe(false);
  });

  it("ordina lessicograficamente, che su forma canonica è ordine cronologico", () => {
    expect(compareInstants(BEFORE, KICKOFF)).toBe(-1);
    expect(compareInstants(AFTER, KICKOFF)).toBe(1);
    expect(compareInstants(KICKOFF, KICKOFF)).toBe(0);
  });
});

describe("il confronto è per giocatore", () => {
  const base = {
    forecasts: [
      forecast({
        source: "fonte-alfa",
        team: "squadra-uno",
        starters: ["p1", "p2", "p3"],
        nonStarters: ["p4"],
      }),
    ],
    actuals: [actual({ team: "squadra-uno", starters: ["p1", "p2", "p4"], bench: ["p3", "p5"] })],
  };

  it("classifica ogni giocatore, e chi non è in nessuna delle due liste non entra nel conto", () => {
    const report = reportOf(base);
    const outcomes = new Map(report.comparisons.map((c) => [c.playerId, c.outcome]));
    expect(outcomes.get("p1")).toBe("agreement_starter"); // previsto titolare, titolare
    expect(outcomes.get("p2")).toBe("agreement_starter");
    expect(outcomes.get("p3")).toBe("disagreement_predicted_starter"); // previsto titolare, in panchina
    expect(outcomes.get("p4")).toBe("disagreement_predicted_non_starter"); // previsto fuori, titolare
    expect(outcomes.get("p5")).toBe("source_silent"); // la fonte non si è pronunciata
    expect(outcomes.get("p9")).toBeUndefined(); // in nessuna delle due liste: non esiste per la misura
    expect(report.comparisons).toHaveLength(5);
  });

  it("il silenzio della fonte sta in un conto suo e non tocca il tasso di accordo", () => {
    const report = reportOf(base);
    const measure = report.bySource[0];
    expect(measure?.source).toBe("fonte-alfa");
    expect(measure?.counts.agreements).toBe(2);
    expect(measure?.counts.disagreements).toBe(2);
    expect(measure?.counts.decided).toBe(4);
    expect(measure?.counts.sourceSilent).toBe(1); // contato, e fuori dal denominatore
    expect(measure?.agreementRate).toBe(0.5);
  });

  it("ogni confronto porta con sé fonte, giornata, squadra e i tre momenti", () => {
    const report = reportOf(base);
    const first = report.comparisons[0];
    expect(first?.source).toBe("fonte-alfa");
    expect(first?.matchday).toBe(1);
    expect(first?.team).toBe("squadra-uno");
    expect(first?.forecastObservedAt).toBe(BEFORE);
    expect(first?.actualObservedAt).toBe(AFTER);
    expect(first?.kickoffAt).toBe(KICKOFF);
    expect(report.measureVersion).toBe(AGREEMENT_MEASURE_VERSION);
  });
});

describe("un giocatore previsto e mai comparso", () => {
  it("è un disaccordo se la lista effettiva si dichiara completa", () => {
    const report = reportOf({
      forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1", "fantasma"] })],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"], bench: ["p2"], benchComplete: true })],
    });
    const ghost = report.comparisons.find((c) => c.playerId === "fantasma");
    expect(ghost?.outcome).toBe("disagreement_absent_from_complete_squad");
    expect(report.bySource[0]?.counts.disagreements).toBe(1);
    expect(report.bySource[0]?.counts.undecidable).toBe(0);
  });

  it("non è decidibile se la lista effettiva si dichiara parziale, e non finisce fra gli errori", () => {
    const report = reportOf({
      forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1", "fantasma"] })],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"], bench: [], benchComplete: false })],
    });
    const ghost = report.comparisons.find((c) => c.playerId === "fantasma");
    expect(ghost?.outcome).toBe("undecidable_partial_actual");
    expect(report.bySource[0]?.counts.disagreements).toBe(0);
    expect(report.bySource[0]?.counts.undecidable).toBe(1);
    expect(report.bySource[0]?.counts.decided).toBe(1);
  });
});

describe("una partita rinviata non è un errore di previsione", () => {
  const input = {
    forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1", "p2"] })],
    actuals: [actual({ team: "squadra-uno", status: "postponed" })],
  };

  it("non produce nessun confronto e nessun disaccordo", () => {
    const report = reportOf(input);
    expect(report.comparisons).toHaveLength(0);
    expect(report.bySource[0]?.counts.disagreements).toBe(0);
    expect(report.bySource[0]?.counts.decided).toBe(0);
    expect(report.bySource[0]?.agreementRate).toBeNull(); // niente di deciso: mai uno zero inventato
  });

  it("il rinvio si dichiara, per la partita e per la fonte che l'aveva coperta", () => {
    const report = reportOf(input);
    expect(report.fixtures.postponed).toEqual([{ matchday: 1, team: "squadra-uno" }]);
    expect(report.bySource[0]?.counts.postponedFixtures).toBe(1);
  });

  it("una partita rinviata con giocatori in lista è una contraddizione e si rifiuta", () => {
    expect(
      rejectionCodes({
        forecasts: [],
        actuals: [actual({ team: "squadra-uno", status: "postponed", starters: ["p1"] })],
      }),
    ).toContain("postponed_with_lineup");
  });
});

describe("assenze di copertura, tenute distinte dalle assenze sul singolo giocatore", () => {
  it("una fonte muta sull'intera partita non riceve undici silenzi ma una partita non coperta", () => {
    const report = reportOf({
      forecasts: [
        forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1", "p2", "p3"] }),
        forecast({ source: "fonte-beta", team: "squadra-due", matchday: 1, starters: ["q1"] }),
      ],
      actuals: [
        actual({ team: "squadra-uno", starters: ["p1", "p2", "p3"] }),
        actual({ team: "squadra-due", starters: ["q1"] }),
      ],
    });
    const beta = report.bySource.find((m) => m.source === "fonte-beta");
    expect(beta?.counts.sourceSilent).toBe(0);
    expect(beta?.counts.fixturesNotCovered).toBe(1);
    expect(beta?.counts.fixturesCompared).toBe(1);
    expect(report.fixtures.notCoveredBySource).toEqual([
      { source: "fonte-alfa", matchday: 1, team: "squadra-due" },
      { source: "fonte-beta", matchday: 1, team: "squadra-uno" },
    ]);
  });

  it("una previsione mai verificata resta a registro, e non è un errore di nessuno", () => {
    const report = reportOf({
      forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", matchday: 7, starters: ["p1"] })],
      actuals: [],
    });
    expect(report.comparisons).toHaveLength(0);
    expect(report.fixtures.withoutActual).toEqual([{ matchday: 7, team: "squadra-uno" }]);
    expect(report.bySource).toHaveLength(0);
  });
});

describe("i due lati dell'osservazione non si mescolano", () => {
  it("una previsione dichiarata dopo il calcio d'inizio è rifiutata", () => {
    expect(
      rejectionCodes({
        forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", phase: "post_kickoff", starters: ["p1"] })],
        actuals: [actual({ team: "squadra-uno", starters: ["p1"] })],
      }),
    ).toContain("forecast_not_pre_kickoff");
  });

  it("una verifica dichiarata prima del calcio d'inizio è rifiutata", () => {
    expect(
      rejectionCodes({
        forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1"] })],
        actuals: [actual({ team: "squadra-uno", starters: ["p1"], phase: "pre_kickoff" })],
      }),
    ).toContain("actual_not_post_kickoff");
  });

  it("l'etichetta non basta: una previsione osservata dopo il fischio d'inizio è rifiutata", () => {
    expect(
      rejectionCodes({
        forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", observedAt: AFTER, starters: ["p1"] })],
        actuals: [actual({ team: "squadra-uno", starters: ["p1"] })],
      }),
    ).toContain("forecast_observed_after_kickoff");
  });

  it("nemmeno esattamente al calcio d'inizio: il confine è chiuso a destra", () => {
    expect(
      rejectionCodes({
        forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", observedAt: KICKOFF, starters: ["p1"] })],
        actuals: [actual({ team: "squadra-uno", starters: ["p1"] })],
      }),
    ).toContain("forecast_observed_after_kickoff");
  });

  it("una verifica osservata prima del calcio d'inizio è rifiutata", () => {
    expect(
      rejectionCodes({
        forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1"] })],
        actuals: [actual({ team: "squadra-uno", starters: ["p1"], observedAt: "2026-09-13T18:00:00Z" })],
      }),
    ).toContain("actual_observed_before_kickoff");
  });

  it("un momento non canonico, una giornata non valida, un doppione: rifiuto con tutti i motivi insieme", () => {
    const codes = rejectionCodes({
      forecasts: [
        forecast({ source: "fonte-alfa", team: "squadra-uno", observedAt: "13/09/2026 17:00", starters: ["p1"] }),
        forecast({ source: "fonte-alfa", team: "squadra-due", matchday: 0, starters: ["p1"] }),
        forecast({ source: "", team: "squadra-tre", starters: ["p1", "p1"] }),
      ],
      actuals: [
        actual({ team: "squadra-uno", starters: ["p1"] }),
        actual({ team: "squadra-uno", starters: ["p2"] }),
      ],
    });
    expect(new Set(codes)).toEqual(
      new Set(["malformed_instant", "invalid_matchday", "empty_identifier", "player_listed_twice", "duplicate_actual_lineup"]),
    );
  });
});

describe("l'ultima istantanea prima del calcio d'inizio", () => {
  it("vince sulle precedenti, qualunque sia l'ordine in ingresso", () => {
    const early = forecast({
      source: "fonte-alfa",
      team: "squadra-uno",
      observedAt: "2026-09-12T09:00:00Z",
      starters: ["p9"],
    });
    const late = forecast({
      source: "fonte-alfa",
      team: "squadra-uno",
      observedAt: "2026-09-13T18:00:00Z",
      starters: ["p1"],
    });
    const middle = forecast({
      source: "fonte-alfa",
      team: "squadra-uno",
      observedAt: "2026-09-13T12:00:00Z",
      starters: ["p5"],
    });
    const actuals = [actual({ team: "squadra-uno", starters: ["p1"], bench: ["p5", "p9"] })];
    const a = reportOf({ forecasts: [early, late, middle], actuals });
    const b = reportOf({ forecasts: [middle, early, late], actuals });
    expect(a).toEqual(b);
    const p1 = a.comparisons.find((c) => c.playerId === "p1");
    expect(p1?.outcome).toBe("agreement_starter");
    expect(p1?.forecastObservedAt).toBe("2026-09-13T18:00:00Z");
    expect(a.comparisons.find((c) => c.playerId === "p9")?.outcome).toBe("source_silent");
  });

  it("due istantanee allo stesso istante con contenuti diversi non hanno un'ultima: rifiuto", () => {
    const codes = rejectionCodes({
      forecasts: [
        forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1"] }),
        forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p2"] }),
      ],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"], bench: ["p2"] })],
    });
    expect(codes).toContain("ambiguous_latest_forecast");
  });

  it("due istantanee identiche allo stesso istante sono un doppione: contate una volta, e dichiarato", () => {
    const report = reportOf({
      forecasts: [
        forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1"] }),
        forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1"] }),
      ],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"] })],
    });
    expect(report.comparisons).toHaveLength(1);
    expect(report.notices).toHaveLength(1);
    expect(report.notices[0]).toContain("identiche");
  });
});

describe("si aggrega per fonte, per squadra e per giornata", () => {
  // Una fonte precisa su una squadra e sbadata su un'altra: è esattamente la
  // domanda posta — «affidabili per alcune squadre e meno per altre».
  const input = {
    forecasts: [
      forecast({ source: "fonte-alfa", team: "squadra-uno", matchday: 1, starters: ["a1", "a2"] }),
      forecast({ source: "fonte-alfa", team: "squadra-due", matchday: 1, starters: ["b1", "b2"] }),
      forecast({ source: "fonte-alfa", team: "squadra-uno", matchday: 2, starters: ["a1", "a2"] }),
      forecast({ source: "fonte-alfa", team: "squadra-due", matchday: 2, starters: ["b1", "b2"] }),
    ],
    actuals: [
      actual({ team: "squadra-uno", matchday: 1, starters: ["a1", "a2"] }),
      actual({ team: "squadra-due", matchday: 1, starters: ["b1"], bench: ["b2"] }),
      actual({ team: "squadra-uno", matchday: 2, starters: ["a1", "a2"] }),
      actual({ team: "squadra-due", matchday: 2, starters: ["b1"], bench: ["b2"] }),
    ],
  };

  it("la stessa fonte ha misure diverse su squadre diverse", () => {
    const report = reportOf(input);
    const uno = report.bySourceAndTeam.find((m) => m.team === "squadra-uno");
    const due = report.bySourceAndTeam.find((m) => m.team === "squadra-due");
    expect(uno?.agreementRate).toBe(1);
    expect(uno?.counts.decided).toBe(4);
    expect(due?.agreementRate).toBe(0.5);
    expect(due?.counts.predictedStarterNotStarting).toBe(2);
  });

  it("l'aggregato per fonte è la somma delle sue squadre, con la propria numerosità", () => {
    const report = reportOf(input);
    const alfa = report.bySource[0];
    expect(alfa?.counts.decided).toBe(8);
    expect(alfa?.counts.matchdays).toBe(2);
    expect(alfa?.counts.fixturesCompared).toBe(4);
    expect(alfa?.agreementRate).toBe(0.75);
  });

  it("l'aggregato per giornata esiste e resta separato", () => {
    const report = reportOf(input);
    expect(report.bySourceAndMatchday.map((m) => m.matchday)).toEqual([1, 2]);
    expect(report.bySourceAndMatchday[0]?.counts.decided).toBe(4);
  });
});

describe("la numerosità sta accanto a ogni misura, e la scarsità si dichiara", () => {
  it("una sola giornata non è una prova, e l'aggregato per giornata lo dice sempre", () => {
    const report = reportOf({
      forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1"] })],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"] })],
    });
    const perMatchday = report.bySourceAndMatchday[0];
    expect(perMatchday?.agreementRate).toBe(1); // il numero c'è
    expect(perMatchday?.tooSparseToConclude).toBe(true); // e non regge un'affermazione
    expect(perMatchday?.sparsityReasons).toContain("single_matchday_is_not_evidence");
  });

  it("poche giornate o poche chiamate decise: la ragione è esplicita", () => {
    const report = reportOf({
      forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1"] })],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"] })],
    });
    expect(report.bySource[0]?.sparsityReasons).toEqual(["matchdays_below_minimum", "decided_calls_below_minimum"]);
  });

  it("niente di deciso non diventa un tasso zero: resta n/d, e dichiarato", () => {
    const report = reportOf({
      forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1"] })],
      actuals: [actual({ team: "squadra-uno", starters: [], bench: [], benchComplete: false })],
    });
    const alfa = report.bySource[0];
    expect(alfa?.agreementRate).toBeNull();
    expect(alfa?.sparsityReasons).toContain("no_decided_comparison");
  });

  it("con abbastanza giornate e abbastanza chiamate la scarsità si spegne", () => {
    const forecasts: ForecastSnapshot[] = [];
    const actuals: ActualLineup[] = [];
    const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"];
    for (let matchday = 1; matchday <= MIN_MATCHDAYS_FOR_A_READING; matchday += 1) {
      forecasts.push(forecast({ source: "fonte-alfa", team: "squadra-uno", matchday, starters: players }));
      actuals.push(actual({ team: "squadra-uno", matchday, starters: players }));
    }
    const report = reportOf({ forecasts, actuals });
    const alfa = report.bySource[0];
    expect(alfa?.counts.matchdays).toBe(MIN_MATCHDAYS_FOR_A_READING);
    expect(alfa?.counts.decided).toBeGreaterThanOrEqual(MIN_DECIDED_CALLS_FOR_A_READING);
    expect(alfa?.tooSparseToConclude).toBe(false);
    expect(alfa?.sparsityReasons).toEqual([]);
    // Anche quando la scarsità si spegne, l'esito resta una misura: nessun
    // giudizio, nessun peso, nessuna posizione in classifica.
    expect(Object.keys(alfa ?? {}).sort()).toEqual(
      ["agreementRate", "counts", "source", "sparsityReasons", "tooSparseToConclude"].sort(),
    );
  });
});

describe("misura, non giudizio", () => {
  const input = {
    forecasts: [
      forecast({ source: "zeta-precisa", team: "squadra-uno", starters: ["p1", "p2"] }),
      forecast({ source: "alfa-sbadata", team: "squadra-uno", starters: ["p3", "p4"] }),
    ],
    actuals: [actual({ team: "squadra-uno", starters: ["p1", "p2"], bench: ["p3", "p4"] })],
  };

  it("l'ordine degli aggregati è alfabetico, mai per tasso di accordo", () => {
    const report = reportOf(input);
    expect(report.bySource.map((m) => m.source)).toEqual(["alfa-sbadata", "zeta-precisa"]);
    // La prima della lista è la peggiore: se l'ordine fosse una classifica,
    // questa riga sarebbe rossa.
    expect(report.bySource[0]?.agreementRate).toBeLessThan(report.bySource[1]?.agreementRate ?? 0);
  });

  it("l'esito non contiene nessun campo di raccomandazione, peso o posizione", () => {
    const report = reportOf(input);
    const serialised = JSON.stringify(report);
    for (const forbidden of ["weight", "peso", "rank", "score", "trust", "fiducia", "best", "recommend", "confidence"]) {
      expect(serialised.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("determinismo", () => {
  it("lo stesso ingresso, in ordine diverso, produce lo stesso esito", () => {
    const forecasts = [
      forecast({ source: "fonte-beta", team: "squadra-due", matchday: 2, starters: ["b1"] }),
      forecast({ source: "fonte-alfa", team: "squadra-uno", matchday: 1, starters: ["a1", "a2"] }),
      forecast({ source: "fonte-beta", team: "squadra-uno", matchday: 1, starters: ["a2"] }),
    ];
    const actuals = [
      actual({ team: "squadra-due", matchday: 2, starters: ["b1"] }),
      actual({ team: "squadra-uno", matchday: 1, starters: ["a1"], bench: ["a2"] }),
    ];
    const straight = reportOf({ forecasts, actuals });
    const reversed = reportOf({ forecasts: [...forecasts].reverse(), actuals: [...actuals].reverse() });
    expect(straight).toEqual(reversed);
    expect(JSON.stringify(straight)).toBe(JSON.stringify(reversed));
  });

  it("i confronti escono ordinati per fonte, giornata, squadra e giocatore", () => {
    const report = reportOf({
      forecasts: [
        forecast({ source: "fonte-beta", team: "squadra-uno", matchday: 2, starters: ["p2", "p1"] }),
        forecast({ source: "fonte-alfa", team: "squadra-uno", matchday: 2, starters: ["p1"] }),
      ],
      actuals: [actual({ team: "squadra-uno", matchday: 2, starters: ["p1", "p2"] })],
    });
    const keys: readonly StarterCall[] = report.comparisons
      .map((c) => c.predicted)
      .filter((c): c is StarterCall => c !== null);
    expect(keys.length).toBeGreaterThan(0);
    const order = report.comparisons.map((c) => c.source + "/" + String(c.matchday) + "/" + c.team + "/" + c.playerId);
    expect(order).toEqual([...order].sort());
  });
});

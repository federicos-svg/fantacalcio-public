import { describe, it, expect } from "vitest";
import {
  AGREEMENT_MEASURE_VERSION,
  MIN_DECIDED_CALLS_FOR_A_READING,
  MIN_MATCHDAYS_FOR_A_READING,
  canonicaliseInstant,
  compareInstants,
  isAcceptableInstant,
  measureSourceAgreement,
  type ActualCompleteness,
  type ActualLineup,
  type AgreementMeasure,
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

/** Le stesse tre soglie come escono normalizzate nell'esito: UTC, millesimi scritti. */
const KICKOFF_UTC = "2026-09-13T18:45:00.000Z";
const BEFORE_UTC = "2026-09-13T17:00:00.000Z";
const AFTER_UTC = "2026-09-13T21:30:00.000Z";

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
  readonly completeness?: ActualCompleteness;
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
    completeness: options.completeness ?? "declared-complete",
  };
}

/**
 * L'IDENTITÀ DELLA SCOMPOSIZIONE, VERIFICATA SU OGNI AGGREGATO PRODOTTO DA
 * QUESTA SUITE. `disagreements` non è un totale a sé: è esattamente la somma
 * dei suoi due sotto-conti, e `decided` è esattamente accordi più disaccordi.
 * Un disaccordo che non ricadesse in nessuno dei due sotto-conti — è successo —
 * lascerebbe una scomposizione che non torna, cioè un numero che chi legge non
 * può rifare. Sta dentro `reportOf` di proposito: così ogni scenario della
 * suite, presente e futuro, la controlla senza doverselo ricordare.
 */
function expectCountsDecompose(report: AgreementReport): void {
  const aggregates: readonly AgreementMeasure[] = [
    ...report.bySource,
    ...report.bySourceAndTeam,
    ...report.bySourceAndMatchday,
  ];
  for (const measure of aggregates) {
    const { counts } = measure;
    expect({
      scomposizione: counts.predictedStarterNotStarting + counts.predictedNonStarterStarting,
      decisi: counts.agreements + counts.disagreements,
    }).toEqual({ scomposizione: counts.disagreements, decisi: counts.decided });
  }
}

function reportOf(input: {
  readonly forecasts: readonly ForecastSnapshot[];
  readonly actuals: readonly ActualLineup[];
}): AgreementReport {
  const outcome = measureSourceAgreement(input);
  if (!outcome.ok) throw new Error("atteso un esito, ricevuto un rifiuto: " + JSON.stringify(outcome.rejections));
  expectCountsDecompose(outcome.report);
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
  it("accetta ISO-8601 con fuso esplicito, con secondi e millesimi facoltativi", () => {
    expect(isAcceptableInstant("2026-09-13T18:45:00Z")).toBe(true);
    expect(isAcceptableInstant("2026-09-13T18:45Z")).toBe(true); // secondi facoltativi
    expect(isAcceptableInstant("2026-09-13T18:45:00.250Z")).toBe(true); // millesimi
    expect(isAcceptableInstant("2026-09-04T18:00:00+02:00")).toBe(true); // offset esplicito
    expect(isAcceptableInstant("2026-09-04T18:00-03:30")).toBe(true);
    expect(isAcceptableInstant("2028-02-29T00:00:00Z")).toBe(true); // bisestile
  });

  it("rifiuta un istante senza fuso: un'ora senza un posto nel mondo non si confronta", () => {
    // È il caso che rende inutile qualunque adattatore: senza fuso non esiste
    // una traduzione giusta, esiste solo una supposizione.
    expect(isAcceptableInstant("2026-09-04T18:00:00")).toBe(false);
    expect(isAcceptableInstant("2026-09-04T18:00")).toBe(false);
    expect(isAcceptableInstant("2026-09-04 18:00:00Z")).toBe(false);
    expect(isAcceptableInstant("13/09/2026 17:00")).toBe(false);
  });

  it("rifiuta le date che non esistono e le ore che non esistono", () => {
    expect(isAcceptableInstant("2026-02-29T00:00:00Z")).toBe(false); // non bisestile
    expect(isAcceptableInstant("2026-13-01T00:00:00Z")).toBe(false);
    expect(isAcceptableInstant("2026-09-13T24:00:00Z")).toBe(false);
    expect(isAcceptableInstant("2026-09-13T18:45:00+24:00")).toBe(false);
  });

  it("normalizza a UTC prima di confrontare, e lo spostamento attraversa il giorno", () => {
    expect(canonicaliseInstant("2026-09-04T18:00:00+02:00")).toBe("2026-09-04T16:00:00.000Z");
    expect(canonicaliseInstant("2026-09-04T18:00:00-03:30")).toBe("2026-09-04T21:30:00.000Z");
    // Un adattatore che tagliasse l'offset invece di spostare l'ora finirebbe
    // qui: `2026-01-01T00:30:00+02:00` è il 31 dicembre dell'anno prima.
    expect(canonicaliseInstant("2026-01-01T00:30:00+02:00")).toBe("2025-12-31T22:30:00.000Z");
    expect(canonicaliseInstant("2026-03-01T00:30:00+02:00")).toBe("2026-02-28T22:30:00.000Z");
    expect(canonicaliseInstant("2028-03-01T00:30:00+02:00")).toBe("2028-02-29T22:30:00.000Z"); // bisestile
  });

  it("scrive sempre i millesimi, perché il confronto fra stringhe resti quello fra istanti", () => {
    // Senza millesimi fissi `…:00Z` e `…:00.500Z` si ordinerebbero al
    // contrario: il punto viene prima della zeta nell'alfabeto delle stringhe.
    expect(canonicaliseInstant("2026-09-13T18:45Z")).toBe("2026-09-13T18:45:00.000Z");
    expect(canonicaliseInstant("2026-09-13T18:45:00.5Z")).toBe("2026-09-13T18:45:00.500Z");
    const secco = canonicaliseInstant("2026-09-13T18:45:00Z") ?? "";
    const mezzo = canonicaliseInstant("2026-09-13T18:45:00.500Z") ?? "";
    expect(compareInstants(secco, mezzo)).toBe(-1);
  });

  it("due istanti scritti in fusi diversi si ordinano correttamente una volta normalizzati", () => {
    const conOffset = canonicaliseInstant("2026-09-13T20:00:00+02:00") ?? ""; // 18:00Z
    const conZulu = canonicaliseInstant("2026-09-13T19:00:00Z") ?? "";
    expect(compareInstants(conOffset, conZulu)).toBe(-1);
    // Sulle stringhe dichiarate, senza normalizzare, l'ordine sarebbe rovesciato.
    expect(compareInstants("2026-09-13T20:00:00+02:00", "2026-09-13T19:00:00Z")).toBe(1);
  });

  it("non accetta il proprio esito come ingresso non normalizzato: la forma canonica è stabile", () => {
    const once = canonicaliseInstant("2026-09-04T18:00:00+02:00") ?? "";
    expect(canonicaliseInstant(once)).toBe(once);
  });

  it("ordina lessicograficamente, che su forma normalizzata è ordine cronologico", () => {
    expect(compareInstants(BEFORE_UTC, KICKOFF_UTC)).toBe(-1);
    expect(compareInstants(AFTER_UTC, KICKOFF_UTC)).toBe(1);
    expect(compareInstants(KICKOFF_UTC, KICKOFF_UTC)).toBe(0);
  });
});

describe("il confine con chi produce le pagine pre-partita", () => {
  it("una previsione con offset esplicito è misurabile, non malformata", () => {
    // Il caso misurato al confine: `+02:00` è ciò che il produttore emette, e
    // rifiutarlo cancellerebbe la fonte invece di misurarla.
    const report = reportOf({
      forecasts: [
        forecast({
          source: "fonte-alfa",
          team: "squadra-uno",
          observedAt: "2026-09-13T20:00:00+02:00", // 18:00Z, prima del calcio d'inizio
          starters: ["p1"],
        }),
      ],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"] })],
    });
    expect(report.comparisons[0]?.outcome).toBe("agreement_starter");
    expect(report.comparisons[0]?.forecastObservedAt).toBe("2026-09-13T18:00:00.000Z");
  });

  it("l'offset sposta l'istante: una previsione tardiva resta tardiva anche scritta in un altro fuso", () => {
    // `2026-09-13T20:00:00-02:00` è 22:00Z, cioè dopo il calcio d'inizio delle
    // 18:45Z. Chi tagliasse l'offset leggerebbe 20:00Z e la accetterebbe:
    // qui il rifiuto arriva perché l'ora viene spostata, non tagliata.
    expect(
      rejectionCodes({
        forecasts: [
          forecast({ source: "fonte-alfa", team: "squadra-uno", observedAt: "2026-09-13T20:00:00-02:00", starters: ["p1"] }),
        ],
        actuals: [actual({ team: "squadra-uno", starters: ["p1"] })],
      }),
    ).toContain("forecast_observed_after_kickoff");
  });

  it("un istante senza fuso resta malformato, di qua e di là dal confine", () => {
    expect(
      rejectionCodes({
        forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", observedAt: "2026-09-13T17:00:00", starters: ["p1"] })],
        actuals: [actual({ team: "squadra-uno", starters: ["p1"] })],
      }),
    ).toContain("malformed_instant");
    expect(
      rejectionCodes({
        forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1"] })],
        actuals: [actual({ team: "squadra-uno", starters: ["p1"], kickoffAt: "2026-09-13T18:45:00" })],
      }),
    ).toContain("malformed_instant");
  });

  it("la completezza ha tre stati, e `unknown` non decide mai un esito", () => {
    // Il produttore scrive `unknown` finché non sa: qui quel dubbio resta un
    // dubbio. Mapparlo su «completa» accenderebbe disaccordi inventati,
    // mapparlo su «parziale» sarebbe un'altra affermazione che nessuno ha fatto.
    for (const completeness of ["declared-partial", "unknown"] as const) {
      const report = reportOf({
        forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1"], nonStarters: ["assente"] })],
        actuals: [actual({ team: "squadra-uno", starters: ["p1"], bench: [], completeness })],
      });
      const assente = report.comparisons.find((c) => c.playerId === "assente");
      expect(assente?.outcome).toBe("undecidable_actual_incomplete");
      expect(report.bySource[0]?.counts.undecidable).toBe(1);
      expect(report.bySource[0]?.counts.disagreements).toBe(0);
      expect(report.bySource[0]?.counts.agreements).toBe(1); // solo p1
    }
  });

  it("gli istanti dell'esito escono già normalizzati, così nessuno a valle li riconfronta a mano", () => {
    const report = reportOf({
      forecasts: [
        forecast({ source: "fonte-alfa", team: "squadra-uno", observedAt: "2026-09-13T19:00:00+02:00", starters: ["p1"] }),
      ],
      actuals: [
        actual({
          team: "squadra-uno",
          starters: ["p1"],
          observedAt: "2026-09-13T23:30:00+02:00",
          kickoffAt: "2026-09-13T20:45:00+02:00",
        }),
      ],
    });
    const only = report.comparisons[0];
    expect(only?.forecastObservedAt).toBe(BEFORE_UTC);
    expect(only?.actualObservedAt).toBe(AFTER_UTC);
    expect(only?.kickoffAt).toBe(KICKOFF_UTC);
  });

  it("accanto all'istante normalizzato resta quello dichiarato, parola per parola", () => {
    // La misura non sostituisce l'osservazione, le sta accanto: fra sei mesi,
    // davanti a un numero che non torna, si deve poter vedere che cosa la fonte
    // aveva DETTO, non solo che cosa noi ne abbiamo FATTO.
    const report = reportOf({
      forecasts: [
        forecast({ source: "fonte-alfa", team: "squadra-uno", observedAt: "2026-09-13T19:00:00+02:00", starters: ["p1"] }),
      ],
      actuals: [
        actual({
          team: "squadra-uno",
          starters: ["p1"],
          observedAt: "2026-09-13T23:30:00+02:00",
          kickoffAt: "2026-09-13T20:45:00+02:00",
        }),
      ],
    });
    const only = report.comparisons[0];
    expect(only?.forecastObservedAtDeclared).toBe("2026-09-13T19:00:00+02:00");
    expect(only?.actualObservedAtDeclared).toBe("2026-09-13T23:30:00+02:00");
    expect(only?.kickoffAtDeclared).toBe("2026-09-13T20:45:00+02:00");
    // E resta distinto dal canonico: se i due campi coincidessero sempre, uno
    // dei due non starebbe servendo a niente.
    expect(only?.forecastObservedAtDeclared).not.toBe(only?.forecastObservedAt);
  });

  it("il campo dichiarato è memoria, non un metro: chi lo confrontasse rifarebbe il difetto delle due ore", () => {
    // La previsione è delle 20:00 in un fuso a +02:00, cioè le 18:00Z: **prima**
    // del calcio d'inizio delle 18:45Z, quindi misurabile. Sulle stringhe
    // dichiarate «20:00…» viene dopo «18:45Z», e chi confrontasse quelle
    // rifiuterebbe una previsione perfettamente tempestiva — lo spostamento di
    // due ore attraverso il calcio d'inizio, di nuovo, questa volta introdotto
    // da dentro invece che da un adattatore.
    const dichiarato = "2026-09-13T20:00:00+02:00";
    expect(compareInstants(dichiarato, KICKOFF)).toBe(1); // il metro sbagliato dice «dopo»
    expect(compareInstants(canonicaliseInstant(dichiarato) ?? "", KICKOFF_UTC)).toBe(-1); // quello giusto dice «prima»

    const report = reportOf({
      forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", observedAt: dichiarato, starters: ["p1"] })],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"] })],
    });
    // Il confronto è avvenuto, quindi il modulo ha usato il canonico e non il
    // dichiarato: se usasse il dichiarato, qui ci sarebbe un rifiuto.
    expect(report.comparisons[0]?.outcome).toBe("agreement_starter");
    expect(report.comparisons[0]?.forecastObservedAt).toBe("2026-09-13T18:00:00.000Z");
    expect(report.comparisons[0]?.forecastObservedAtDeclared).toBe(dichiarato);
  });

  it("nemmeno per scegliere l'ultima istantanea: l'ordine è quello degli istanti, non delle stringhe", () => {
    // Due istantanee della stessa fonte: `2026-09-13T18:30:00Z` e
    // `2026-09-13T20:15:00+02:00`, che è le 18:15Z. L'ultima è la prima delle
    // due; sulle stringhe dichiarate vincerebbe la seconda, e la misura
    // userebbe la previsione più vecchia credendola la più fresca.
    const report = reportOf({
      forecasts: [
        forecast({
          source: "fonte-alfa",
          team: "squadra-uno",
          observedAt: "2026-09-13T18:30:00Z",
          starters: ["p1"],
        }),
        forecast({
          source: "fonte-alfa",
          team: "squadra-uno",
          observedAt: "2026-09-13T20:15:00+02:00", // 18:15Z: più vecchia
          starters: ["p2"],
        }),
      ],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"], bench: ["p2"] })],
    });
    expect(report.comparisons.find((c) => c.playerId === "p1")?.outcome).toBe("agreement_starter");
    expect(report.comparisons[0]?.forecastObservedAt).toBe("2026-09-13T18:30:00.000Z");
    expect(report.comparisons[0]?.forecastObservedAtDeclared).toBe("2026-09-13T18:30:00Z");
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

  it("i due tipi di disaccordo si contano ciascuno nel suo, e nessuno nell'altro", () => {
    // p3 è previsto titolare e finisce in panchina; p4 è previsto fuori e gioca.
    // Sono due errori diversi e chi legge deve poterli distinguere: un conto che
    // li sommasse tutti e due nello stesso posto renderebbe questa riga rossa.
    const report = reportOf(base);
    const measure = report.bySource[0];
    expect(measure?.counts.predictedStarterNotStarting).toBe(1);
    expect(measure?.counts.predictedNonStarterStarting).toBe(1);
  });

  it("ogni confronto porta con sé fonte, giornata, squadra e i tre momenti", () => {
    const report = reportOf(base);
    const first = report.comparisons[0];
    expect(first?.source).toBe("fonte-alfa");
    expect(first?.matchday).toBe(1);
    expect(first?.team).toBe("squadra-uno");
    expect(first?.forecastObservedAt).toBe(BEFORE_UTC);
    expect(first?.actualObservedAt).toBe(AFTER_UTC);
    expect(first?.kickoffAt).toBe(KICKOFF_UTC);
    expect(report.measureVersion).toBe(AGREEMENT_MEASURE_VERSION);
  });
});

describe("un giocatore previsto e mai comparso", () => {
  it("se era dato titolare è un disaccordo, quando la lista effettiva si dichiara completa", () => {
    const report = reportOf({
      forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1", "fantasma"] })],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"], bench: ["p2"], completeness: "declared-complete" })],
    });
    const ghost = report.comparisons.find((c) => c.playerId === "fantasma");
    expect(ghost?.outcome).toBe("disagreement_absent_from_complete_squad");
    expect(report.bySource[0]?.counts.disagreements).toBe(1);
    expect(report.bySource[0]?.counts.undecidable).toBe(0);
    // E il disaccordo si scompone: previsto titolare, non sceso in campo.
    expect(report.bySource[0]?.counts.predictedStarterNotStarting).toBe(1);
    expect(report.bySource[0]?.counts.predictedNonStarterStarting).toBe(0);
  });

  it("se era dato fuori è un ACCORDO: la fonte aveva ragione, quel giocatore non è sceso in campo", () => {
    // IL CASO CHE PUNIVA CHI DICE IL VERO. La fonte pubblica anche gli esclusi:
    // dà `p1` titolare e `tizio` fuori. La lista effettiva è completa e `tizio`
    // non c'è — cioè non ha giocato dal primo minuto, esattamente come detto.
    // Contarlo come disaccordo penalizzava le fonti più informative, e più
    // volte per partita, proprio nella misura che serve a capire di chi fidarsi.
    const report = reportOf({
      forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1"], nonStarters: ["tizio"] })],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"], bench: ["p2"], completeness: "declared-complete" })],
    });
    const tizio = report.comparisons.find((c) => c.playerId === "tizio");
    expect(tizio?.outcome).toBe("agreement_absent_from_complete_squad");
    expect(tizio?.predicted).toBe("non_starter");
    expect(tizio?.actual).toBeNull(); // non compare in nessuna delle due liste, e resta dichiarato
    const alfa = report.bySource[0];
    expect(alfa?.counts.disagreements).toBe(0);
    expect(alfa?.counts.agreements).toBe(2); // p1 titolare, tizio fuori
    expect(alfa?.counts.decided).toBe(2);
    expect(alfa?.agreementRate).toBe(1);
  });

  it("una fonte che pubblica anche gli esclusi non finisce sotto a una che tace su di loro", () => {
    // Due fonti che dicono la stessa identica verità sui titolari: la prima
    // elenca anche i fuori, la seconda no. Se dire di più costasse punti, la
    // misura direbbe che tacere conviene.
    const report = reportOf({
      forecasts: [
        forecast({ source: "fonte-loquace", team: "squadra-uno", starters: ["p1"], nonStarters: ["t1", "t2", "t3"] }),
        forecast({ source: "fonte-reticente", team: "squadra-uno", starters: ["p1"] }),
      ],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"], bench: [], completeness: "declared-complete" })],
    });
    const loquace = report.bySource.find((m) => m.source === "fonte-loquace");
    const reticente = report.bySource.find((m) => m.source === "fonte-reticente");
    expect(loquace?.agreementRate).toBe(1);
    expect(reticente?.agreementRate).toBe(1);
    expect(loquace?.counts.decided).toBe(4); // ha detto di più, ed è stata misurata su di più
    expect(reticente?.counts.decided).toBe(1);
  });

  it("non è decidibile se la lista effettiva non si dichiara completa, e non finisce fra gli errori", () => {
    const report = reportOf({
      forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1", "fantasma"] })],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"], bench: [], completeness: "declared-partial" })],
    });
    const ghost = report.comparisons.find((c) => c.playerId === "fantasma");
    expect(ghost?.outcome).toBe("undecidable_actual_incomplete");
    expect(report.bySource[0]?.counts.disagreements).toBe(0);
    expect(report.bySource[0]?.counts.undecidable).toBe(1);
    expect(report.bySource[0]?.counts.decided).toBe(1);
  });

  it("nemmeno quando era dato fuori: su una lista non completa non si regala un accordo", () => {
    // La simmetria vale in tutte e due le direzioni. Se l'assenza non è
    // informativa, non lo è né a favore né contro la fonte.
    const report = reportOf({
      forecasts: [forecast({ source: "fonte-alfa", team: "squadra-uno", starters: ["p1"], nonStarters: ["tizio"] })],
      actuals: [actual({ team: "squadra-uno", starters: ["p1"], bench: [], completeness: "declared-partial" })],
    });
    expect(report.comparisons.find((c) => c.playerId === "tizio")?.outcome).toBe("undecidable_actual_incomplete");
    expect(report.bySource[0]?.counts.agreements).toBe(1); // solo p1
    expect(report.bySource[0]?.counts.undecidable).toBe(1);
  });
});

describe("la scomposizione dei disaccordi torna sempre", () => {
  // `reportOf` verifica l'identità su ogni aggregato di ogni scenario della
  // suite; qui la si mette alla prova su un caso che mescola tutti e tre i tipi
  // di disaccordo insieme, su più squadre e più giornate — cioè il posto dove
  // un sotto-conto dimenticato avrebbe più spazio per nascondersi.
  const input = {
    forecasts: [
      forecast({
        source: "fonte-alfa",
        team: "squadra-uno",
        matchday: 1,
        starters: ["a1", "a2", "svanito"],
        nonStarters: ["a3"],
      }),
      forecast({ source: "fonte-alfa", team: "squadra-due", matchday: 2, starters: ["b1"], nonStarters: ["b2", "escluso"] }),
      forecast({ source: "fonte-beta", team: "squadra-uno", matchday: 1, starters: ["a3"], nonStarters: ["a1"] }),
    ],
    actuals: [
      actual({ team: "squadra-uno", matchday: 1, starters: ["a1", "a3"], bench: ["a2"] }),
      actual({ team: "squadra-due", matchday: 2, starters: ["b1", "b2"], bench: [] }),
    ],
  };

  it("ogni disaccordo ricade in uno e un solo sotto-conto, su fonte, squadra e giornata", () => {
    const report = reportOf(input);
    const alfa = report.bySource.find((m) => m.source === "fonte-alfa");
    // Previsto titolare e non sceso in campo: a2, finito in panchina, e
    // `svanito`, assente da una lista completa. Previsto fuori e titolare: a3 e
    // b2. Quattro disaccordi, due per parte, e nessuno fuori dai due conti.
    expect(alfa?.counts.disagreements).toBe(4);
    expect(alfa?.counts.predictedStarterNotStarting).toBe(2);
    expect(alfa?.counts.predictedNonStarterStarting).toBe(2);
    // `escluso` era dato fuori e non compare: accordo, non disaccordo.
    expect(report.comparisons.find((c) => c.playerId === "escluso")?.outcome).toBe("agreement_absent_from_complete_squad");
  });

  it("nessun aggregato ha disaccordi che non si sanno spiegare", () => {
    const report = reportOf(input);
    const aggregates = [...report.bySource, ...report.bySourceAndTeam, ...report.bySourceAndMatchday];
    expect(aggregates.length).toBeGreaterThan(0);
    for (const measure of aggregates) {
      const { counts } = measure;
      expect(counts.predictedStarterNotStarting + counts.predictedNonStarterStarting).toBe(counts.disagreements);
      expect(counts.agreements + counts.disagreements).toBe(counts.decided);
    }
  });

  it("i sotto-conti aggregati coincidono con i confronti che li hanno prodotti", () => {
    // La scomposizione non deve solo tornare con sé stessa: deve tornare con i
    // fatti. Un conto che quadrasse per costruzione ma non corrispondesse a
    // nessun confronto sarebbe una scomposizione ordinata e falsa.
    const report = reportOf(input);
    for (const measure of report.bySource) {
      const mine = report.comparisons.filter((c) => c.source === measure.source);
      const count = (...outcomes: readonly string[]): number =>
        mine.filter((c) => outcomes.includes(c.outcome)).length;
      expect(measure.counts.predictedStarterNotStarting).toBe(
        count("disagreement_predicted_starter", "disagreement_absent_from_complete_squad"),
      );
      expect(measure.counts.predictedNonStarterStarting).toBe(count("disagreement_predicted_non_starter"));
      expect(measure.counts.agreements).toBe(
        count("agreement_starter", "agreement_non_starter", "agreement_absent_from_complete_squad"),
      );
      expect(measure.counts.undecidable).toBe(count("undecidable_actual_incomplete"));
      expect(measure.counts.sourceSilent).toBe(count("source_silent"));
    }
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

  it("e NON per una fonte che quella partita non l'aveva coperta", () => {
    // `fonte-beta` esiste — si è pronunciata sulla seconda partita — ma sulla
    // partita rinviata non aveva detto niente. Attribuirle il rinvio le darebbe
    // credito per una copertura che non c'è stata, e un giorno la farebbe
    // sembrare più presente di quanto sia. Un rinvio non coperto non è nemmeno
    // una partita non coperta: non c'è stata partita.
    const report = reportOf({
      forecasts: [
        forecast({ source: "fonte-alfa", team: "squadra-uno", matchday: 1, starters: ["p1", "p2"] }),
        forecast({ source: "fonte-beta", team: "squadra-due", matchday: 1, starters: ["q1"] }),
      ],
      actuals: [
        actual({ team: "squadra-uno", matchday: 1, status: "postponed" }),
        actual({ team: "squadra-due", matchday: 1, starters: ["q1"] }),
      ],
    });
    const alfa = report.bySource.find((m) => m.source === "fonte-alfa");
    const beta = report.bySource.find((m) => m.source === "fonte-beta");
    expect(alfa?.counts.postponedFixtures).toBe(1);
    expect(beta?.counts.postponedFixtures).toBe(0);
    expect(beta?.counts.fixturesNotCovered).toBe(0); // e nemmeno finisce fra le partite non coperte
    expect(report.fixtures.notCoveredBySource).toEqual([{ source: "fonte-alfa", matchday: 1, team: "squadra-due" }]);
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
    expect(p1?.forecastObservedAt).toBe("2026-09-13T18:00:00.000Z");
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
      actuals: [actual({ team: "squadra-uno", starters: [], bench: [], completeness: "unknown" })],
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

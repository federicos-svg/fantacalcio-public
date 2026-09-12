import { describe, it, expect } from "vitest";
import {
  DECIDED_CALLS_PER_MATCHDAY,
  MEASURED_MATCHDAYS_WITH_EQUAL_WEIGHTS,
  PRIOR_MEAN_WITHOUT_EVIDENCE,
  PRIOR_PSEUDO_COUNTS,
  PRIOR_STRENGTH_MATCHDAYS,
  Q_BENCH,
  Q_CLIP_MAX,
  Q_CLIP_MIN,
  Q_DOUBT,
  Q_STARTER,
  STARTER_COMBINATION_VERSION,
  combineStarterProbabilities,
  logistic,
  logit,
  measuredWeight,
  type CombinedStarterProbability,
  type SourceTeamReadings,
  type SourceTeamReliability,
  type StarterProbabilityOutcome,
  type StarterProbabilityReport,
} from "../src/index.js";

// FIXTURE SINTETICHE. Fonti, squadre e giocatori sono nomi inventati: qui non
// entra nessun dato reale, nessuna quotazione, e nessuna delle fonti dichiarate
// altrove nel progetto compare con il proprio nome. Chi legge questi test deve
// poter verificare la combinazione senza sapere di chi si parla.

const TEAM = "squadra_1";
const OTHER_TEAM = "squadra_2";

function readings(source: string, entries: Readonly<Record<string, "starter" | "doubt" | "bench" | "unavailable">>): SourceTeamReadings {
  return {
    source,
    readings: Object.entries(entries).map(([playerId, status]) => ({
      playerId,
      reading: { kind: "status", status } as const,
    })),
  };
}

function ledgerRow(options: {
  readonly source: string;
  readonly team?: string;
  readonly measuredMatchdays: number;
  readonly decided: number;
  readonly agreements: number;
}): SourceTeamReliability {
  return {
    source: options.source,
    team: options.team ?? TEAM,
    measuredMatchdays: options.measuredMatchdays,
    decided: options.decided,
    agreements: options.agreements,
  };
}

function expectOk(outcome: StarterProbabilityOutcome): StarterProbabilityReport {
  if (!outcome.ok) throw new Error(`atteso un esito buono, arrivati rifiuti: ${JSON.stringify(outcome.rejections)}`);
  return outcome.report;
}

function playerNamed(report: { readonly players: readonly CombinedStarterProbability[] }, playerId: string): CombinedStarterProbability {
  const found = report.players.find((p) => p.playerId === playerId);
  if (found === undefined) throw new Error(`nessun giocatore ${playerId} nell'esito`);
  return found;
}

/**
 * La media a pesi uguali, ricalcolata **qui** e non chiesta al modulo: un test
 * che si facesse dare il numero dal codice che deve controllare non
 * controllerebbe niente. L'ordine della somma è quello alfabetico delle fonti,
 * lo stesso che il modulo dichiara di usare, perché due somme in virgola
 * mobile in ordine diverso non danno lo stesso bit.
 */
function equalWeightAverage(qs: readonly number[]): number {
  let sum = 0;
  for (const q of qs) sum += logit(q);
  return logistic(sum / qs.length);
}

describe("§14, WP-5 — «il champion usa pesi uguali»: la frase, ri-eseguita", () => {
  // Tre fonti che dicono cose diverse sullo stesso giocatore, così che un
  // cambio di pesi si veda: se dicessero tutte la stessa cosa, qualunque peso
  // darebbe lo stesso risultato e il test sarebbe verde per il motivo sbagliato.
  const sources: readonly SourceTeamReadings[] = [
    readings("fonte_alfa", { giocatore_01: "starter", giocatore_02: "bench" }),
    readings("fonte_beta", { giocatore_01: "bench", giocatore_02: "starter" }),
    readings("fonte_gamma", { giocatore_01: "doubt", giocatore_02: "starter" }),
  ];

  /** Affidabilità molto diverse fra loro: alfa quasi sempre giusta, beta quasi sempre sbagliata. */
  function ledger(measuredMatchdays: number): readonly SourceTeamReliability[] {
    return [
      ledgerRow({ source: "fonte_alfa", measuredMatchdays, decided: 200, agreements: 190 }),
      ledgerRow({ source: "fonte_beta", measuredMatchdays, decided: 200, agreements: 20 }),
      ledgerRow({ source: "fonte_gamma", measuredMatchdays, decided: 200, agreements: 100 }),
    ];
  }

  it("a sei giornate misurate il risultato è **esattamente** la media a pesi uguali dei logit", () => {
    const report = expectOk(
      combineStarterProbabilities({ team: TEAM, matchday: 7, sources, reliability: ledger(6) }),
    );

    expect(report.weighting).toBe("equal");
    expect(report.weightingReason).toBe("below_threshold_equal_weights");
    expect(report.teamMeasuredMatchdays).toBe(6);
    expect(report.weights.map((w) => w.weight)).toEqual([1, 1, 1]);

    // Esattamente, non «circa»: stesso bit.
    expect(playerNamed(report, "giocatore_01").pStarter).toBe(equalWeightAverage([Q_STARTER, Q_BENCH, Q_DOUBT]));
    expect(playerNamed(report, "giocatore_02").pStarter).toBe(equalWeightAverage([Q_BENCH, Q_STARTER, Q_STARTER]));
  });

  it("sotto soglia l'affidabilità misurata non tocca il risultato: registri opposti, esito identico", () => {
    const optimistic = ledger(6);
    const reversed: readonly SourceTeamReliability[] = [
      ledgerRow({ source: "fonte_alfa", measuredMatchdays: 6, decided: 200, agreements: 20 }),
      ledgerRow({ source: "fonte_beta", measuredMatchdays: 6, decided: 200, agreements: 190 }),
      ledgerRow({ source: "fonte_gamma", measuredMatchdays: 6, decided: 200, agreements: 100 }),
    ];

    const a = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 7, sources, reliability: optimistic }));
    const b = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 7, sources, reliability: reversed }));

    expect(a.players).toEqual(b.players);
    // E l'ombra, che i pesi li usa, invece cambia: è la prova che i due
    // registri erano davvero diversi e che il champion li ha ignorati apposta.
    expect(a.shadow?.players).not.toEqual(b.shadow?.players);
  });

  it("alla settima giornata misurata il peso cambia, e con lui il risultato", () => {
    const sotto = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 8, sources, reliability: ledger(6) }));
    const sopra = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 8, sources, reliability: ledger(7) }));

    expect(sopra.weighting).toBe("measured");
    expect(sopra.weightingReason).toBe("threshold_passed_measured_weights");
    expect(sopra.teamMeasuredMatchdays).toBe(7);

    // I pesi non sono più tutti uno, e sono ordinati come le fonti.
    expect(sopra.weights.map((w) => w.source)).toEqual(["fonte_alfa", "fonte_beta", "fonte_gamma"]);
    expect(sopra.weights.every((w) => w.weight !== 1)).toBe(true);
    expect(sopra.weights[0]!.weight).toBeGreaterThan(sopra.weights[1]!.weight);

    // Il risultato non è più la media a pesi uguali…
    const media = equalWeightAverage([Q_STARTER, Q_BENCH, Q_DOUBT]);
    expect(playerNamed(sopra, "giocatore_01").pStarter).not.toBe(media);
    expect(playerNamed(sopra, "giocatore_01").pStarter).not.toBe(playerNamed(sotto, "giocatore_01").pStarter);

    // …e si è spostato verso ciò che dice la fonte misurata più affidabile,
    // che su giocatore_01 dice «titolare».
    expect(playerNamed(sopra, "giocatore_01").pStarter!).toBeGreaterThan(media);
  });

  it("la settima giornata è l'unico confine: sei è ancora uguale, sette no", () => {
    for (const measured of [0, 1, 5, MEASURED_MATCHDAYS_WITH_EQUAL_WEIGHTS]) {
      const report = expectOk(
        combineStarterProbabilities({ team: TEAM, matchday: 8, sources, reliability: ledger(measured) }),
      );
      expect([measured, report.weighting]).toEqual([measured, "equal"]);
    }
    for (const measured of [MEASURED_MATCHDAYS_WITH_EQUAL_WEIGHTS + 1, 12, 38]) {
      const report = expectOk(
        combineStarterProbabilities({ team: TEAM, matchday: 8, sources, reliability: ledger(measured) }),
      );
      expect([measured, report.weighting]).toEqual([measured, "measured"]);
    }
  });
});

describe("la soglia è per squadra, non globale", () => {
  const sources: readonly SourceTeamReadings[] = [
    readings("fonte_alfa", { giocatore_01: "starter" }),
    readings("fonte_beta", { giocatore_01: "bench" }),
  ];

  // Un solo registro, due squadre con storie diverse: una misurata a lungo,
  // l'altra appena cominciata.
  const reliability: readonly SourceTeamReliability[] = [
    ledgerRow({ source: "fonte_alfa", team: TEAM, measuredMatchdays: 7, decided: 200, agreements: 180 }),
    ledgerRow({ source: "fonte_beta", team: TEAM, measuredMatchdays: 7, decided: 200, agreements: 60 }),
    ledgerRow({ source: "fonte_alfa", team: OTHER_TEAM, measuredMatchdays: 2, decided: 50, agreements: 45 }),
    ledgerRow({ source: "fonte_beta", team: OTHER_TEAM, measuredMatchdays: 2, decided: 50, agreements: 15 }),
  ];

  it("la squadra con sette giornate usa i pesi misurati anche se l'altra ne ha due", () => {
    const misurata = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 8, sources, reliability }));
    const acerba = expectOk(combineStarterProbabilities({ team: OTHER_TEAM, matchday: 8, sources, reliability }));

    expect(misurata.weighting).toBe("measured");
    expect(misurata.teamMeasuredMatchdays).toBe(7);
    expect(acerba.weighting).toBe("equal");
    expect(acerba.teamMeasuredMatchdays).toBe(2);
    expect(acerba.weights.map((w) => w.weight)).toEqual([1, 1]);
  });

  it("una giornata conta per la squadra se **almeno una** fonte l'ha misurata su quella squadra", () => {
    const disparo: readonly SourceTeamReliability[] = [
      ledgerRow({ source: "fonte_alfa", measuredMatchdays: 7, decided: 200, agreements: 180 }),
      ledgerRow({ source: "fonte_beta", measuredMatchdays: 1, decided: 20, agreements: 6 }),
    ];
    const report = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 8, sources, reliability: disparo }));
    expect(report.teamMeasuredMatchdays).toBe(7);
    expect(report.weighting).toBe("measured");
    // La fonte arrivata da poco entra lo stesso, col suo peso e la sua storia corta.
    expect(report.weights[1]!.measuredMatchdays).toBe(1);
  });
});

describe("il prior Beta: i numeri sono scritti, e cambiarli si vede", () => {
  it("le costanti del prior sono quelle dichiarate nel file", () => {
    // Se qualcuno le cambia senza accorgersene, questo test glielo dice — e il
    // test comportamentale qui sotto glielo ridice con un numero.
    expect(PRIOR_STRENGTH_MATCHDAYS).toBe(2);
    expect(DECIDED_CALLS_PER_MATCHDAY).toBe(11);
    expect(PRIOR_PSEUDO_COUNTS).toBe(22);
    expect(PRIOR_MEAN_WITHOUT_EVIDENCE).toBe(0.5);
    expect(MEASURED_MATCHDAYS_WITH_EQUAL_WEIGHTS).toBe(6);
    expect([Q_STARTER, Q_DOUBT, Q_BENCH, Q_CLIP_MIN, Q_CLIP_MAX]).toEqual([0.9, 0.5, 0.1, 0.02, 0.98]);
    expect(STARTER_COMBINATION_VERSION).toBe("starter_probability_v1");
  });

  it("il peso misurato è la media a posteriori, con i ventidue pseudo-conteggi scritti a mano nel test", () => {
    // Pooled: 150 accordi su 300 chiamate decise, su due squadre → media 0,5.
    // alpha = 0,5 × 22 = 11; beta = 11.
    // Su questa squadra: 90 accordi su 100 → (90 + 11) / (100 + 22).
    const computed = measuredWeight({ pooledAgreements: 150, pooledDecided: 300, agreements: 90, decided: 100 });
    expect(computed.priorAlpha).toBe(11);
    expect(computed.priorBeta).toBe(11);
    expect(computed.weight).toBe((90 + 11) / (100 + 22));
  });

  it("il prior è pooled su tutte le squadre: le altre righe della stessa fonte spostano il peso", () => {
    const soloQui = measuredWeight({ pooledAgreements: 10, pooledDecided: 100, agreements: 10, decided: 100 });
    const anchePoolate = measuredWeight({ pooledAgreements: 190, pooledDecided: 200, agreements: 10, decided: 100 });
    // Stessi conteggi su questa squadra, storia pooled diversa → peso diverso,
    // e più alto dove la fonte va bene altrove.
    expect(anchePoolate.weight).toBeGreaterThan(soloQui.weight);
    expect(soloQui.priorAlpha).toBe(0.1 * 22);
  });

  it("senza nessuna evidenza pooled il prior è mezzo e mezzo, e non un numero preferito", () => {
    const computed = measuredWeight({ pooledAgreements: 0, pooledDecided: 0, agreements: 0, decided: 0 });
    expect(computed.priorAlpha).toBe(PRIOR_MEAN_WITHOUT_EVIDENCE * PRIOR_PSEUDO_COUNTS);
    expect(computed.weight).toBe(PRIOR_MEAN_WITHOUT_EVIDENCE);
  });

  it("il pooling passa per `combineStarterProbabilities`: le righe delle **altre** squadre spostano il peso su questa", () => {
    // Due registri identici su questa squadra, diversi solo altrove. Se il
    // prior guardasse la sola squadra combinata, i due peserebbero uguale e il
    // pooling sarebbe una parola nel commento invece che un'operazione.
    const sources: readonly SourceTeamReadings[] = [
      readings("fonte_alfa", { giocatore_01: "starter" }),
      readings("fonte_beta", { giocatore_01: "bench" }),
    ];
    const qui = ledgerRow({ source: "fonte_alfa", measuredMatchdays: 9, decided: 100, agreements: 50 });
    const beta = ledgerRow({ source: "fonte_beta", measuredMatchdays: 9, decided: 100, agreements: 50 });

    const senzaStoriaAltrove = expectOk(
      combineStarterProbabilities({ team: TEAM, matchday: 10, sources, reliability: [qui, beta] }),
    );
    const conStoriaAltrove = expectOk(
      combineStarterProbabilities({
        team: TEAM,
        matchday: 10,
        sources,
        reliability: [qui, beta, ledgerRow({ source: "fonte_alfa", team: OTHER_TEAM, measuredMatchdays: 9, decided: 400, agreements: 400 })],
      }),
    );

    const pesoDiAlfa = (report: StarterProbabilityReport): number =>
      report.weights.find((w) => w.source === "fonte_alfa")!.weight;

    // Senza altre righe: media pooled 50/100 = 0,5 → alpha 11 → (50+11)/(100+22).
    expect(pesoDiAlfa(senzaStoriaAltrove)).toBe((50 + 11) / (100 + 22));
    // Con l'altra squadra: media pooled 450/500 = 0,9 → alpha 19,8 → (50+19,8)/(100+22).
    expect(pesoDiAlfa(conStoriaAltrove)).toBe((50 + 0.9 * 22) / (100 + 22));
    expect(pesoDiAlfa(conStoriaAltrove)).toBeGreaterThan(pesoDiAlfa(senzaStoriaAltrove));

    // E il peso più alto si vede nel risultato, non solo nel campo `weights`.
    expect(playerNamed(conStoriaAltrove, "giocatore_01").pStarter!).toBeGreaterThan(
      playerNamed(senzaStoriaAltrove, "giocatore_01").pStarter!,
    );
  });

  it("il peso di una fonte mai misurata su questa squadra è il prior, non zero e non uno", () => {
    const sources: readonly SourceTeamReadings[] = [
      readings("fonte_alfa", { giocatore_01: "starter" }),
      readings("fonte_nuova", { giocatore_01: "bench" }),
    ];
    const reliability: readonly SourceTeamReliability[] = [
      ledgerRow({ source: "fonte_alfa", measuredMatchdays: 7, decided: 200, agreements: 180 }),
      ledgerRow({ source: "fonte_nuova", team: OTHER_TEAM, measuredMatchdays: 3, decided: 60, agreements: 30 }),
    ];
    const report = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 8, sources, reliability }));
    const nuova = report.weights.find((w) => w.source === "fonte_nuova")!;
    expect(nuova.measuredMatchdays).toBe(0);
    // Nessuna chiamata decisa su questa squadra: il peso è la sola media del
    // prior, cioè la media pooled della fonte, che altrove vale 30/60.
    expect(nuova.weight).toBe(0.5);
  });
});

describe("la formula: logit, ritaglio, indisponibilità", () => {
  const reliability: readonly SourceTeamReliability[] = [];

  it("due fonti d'accordo su «quasi certo» non producono un dubbio (per questo la media è in logit)", () => {
    const sources: readonly SourceTeamReadings[] = [
      { source: "fonte_alfa", readings: [{ playerId: "giocatore_01", reading: { kind: "declaredProbability", probability: 0.98 } }] },
      readings("fonte_beta", { giocatore_01: "starter" }),
    ];
    const report = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 1, sources, reliability }));
    const p = playerNamed(report, "giocatore_01").pStarter!;
    // La media aritmetica darebbe 0,94, cioè meno della meno sicura delle due.
    expect(p).toBeGreaterThan(Q_STARTER);
    expect(p).toBe(equalWeightAverage([0.98, Q_STARTER]));
  });

  it("una percentuale dichiarata viene ritagliata, e un 100% non diventa una certezza infinita", () => {
    const sources: readonly SourceTeamReadings[] = [
      {
        source: "fonte_alfa",
        readings: [
          { playerId: "giocatore_01", reading: { kind: "declaredProbability", probability: 1 } },
          { playerId: "giocatore_02", reading: { kind: "declaredProbability", probability: 0 } },
        ],
      },
      readings("fonte_beta", { giocatore_01: "bench", giocatore_02: "starter" }),
    ];
    const report = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 1, sources, reliability }));
    expect(playerNamed(report, "giocatore_01").contributors[0]!.q).toBe(Q_CLIP_MAX);
    expect(playerNamed(report, "giocatore_02").contributors[0]!.q).toBe(Q_CLIP_MIN);
    // Ritagliata, quindi finita: l'altra fonte conta ancora qualcosa.
    expect(playerNamed(report, "giocatore_01").pStarter).toBe(equalWeightAverage([Q_CLIP_MAX, Q_BENCH]));
    expect(playerNamed(report, "giocatore_01").pStarter!).toBeLessThan(1);
  });

  it("una sola fonte che lo dà indisponibile porta `pStarter` a zero, comunque parlino le altre", () => {
    const sources: readonly SourceTeamReadings[] = [
      readings("fonte_alfa", { giocatore_01: "starter" }),
      readings("fonte_beta", { giocatore_01: "starter" }),
      readings("fonte_gamma", { giocatore_01: "unavailable" }),
    ];
    const report = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 1, sources, reliability }));
    const player = playerNamed(report, "giocatore_01");
    expect(player.pStarter).toBe(0);
    expect(player.decidedByUnavailability).toBe(true);
    // E non è un caso di media: il numero è zero esatto, non un epsilon.
    expect(Object.is(player.pStarter, 0)).toBe(true);
  });

  it("il silenzio di una fonte non è una panchina: chi tace non entra nella media", () => {
    const sources: readonly SourceTeamReadings[] = [
      readings("fonte_alfa", { giocatore_01: "starter" }),
      readings("fonte_beta", { giocatore_02: "starter" }),
    ];
    const report = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 1, sources, reliability }));
    const primo = playerNamed(report, "giocatore_01");
    expect(primo.contributors.map((c) => c.source)).toEqual(["fonte_alfa"]);
    // Una fonte sola resta se stessa, a meno del viaggio di andata e ritorno in
    // logit: `logistic(logit(0,9))` non è `0,9` bit per bit, e un test che
    // pretendesse il contrario mentirebbe sull'aritmetica invece che sul codice.
    expect(primo.pStarter).toBe(equalWeightAverage([Q_STARTER]));
    expect(primo.pStarter!).toBeCloseTo(Q_STARTER, 12);
    expect(report.players.map((p) => p.playerId)).toEqual(["giocatore_01", "giocatore_02"]);
  });

  it("l'esito non dipende dall'ordine in cui il chiamante passa le fonti", () => {
    const sources: readonly SourceTeamReadings[] = [
      readings("fonte_alfa", { giocatore_01: "starter" }),
      readings("fonte_beta", { giocatore_01: "bench" }),
      readings("fonte_gamma", { giocatore_01: "doubt" }),
    ];
    const dritto = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 1, sources, reliability }));
    const rovescio = expectOk(
      combineStarterProbabilities({ team: TEAM, matchday: 1, sources: [...sources].reverse(), reliability }),
    );
    expect(JSON.stringify(rovescio)).toBe(JSON.stringify(dritto));
  });
});

describe("l'ombra: la combinazione pesata gira anche sotto soglia", () => {
  const sources: readonly SourceTeamReadings[] = [
    readings("fonte_alfa", { giocatore_01: "starter" }),
    readings("fonte_beta", { giocatore_01: "bench" }),
  ];
  const reliability: readonly SourceTeamReliability[] = [
    ledgerRow({ source: "fonte_alfa", measuredMatchdays: 3, decided: 100, agreements: 95 }),
    ledgerRow({ source: "fonte_beta", measuredMatchdays: 3, decided: 100, agreements: 10 }),
  ];

  it("sotto soglia l'ombra c'è, dichiara di essere pesata, e dice un numero diverso dal champion", () => {
    const report = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 4, sources, reliability }));
    expect(report.weighting).toBe("equal");
    expect(report.shadow).not.toBeNull();
    expect(report.shadow!.weighting).toBe("measured");
    expect(report.shadow!.weights.every((w) => w.weight !== 1)).toBe(true);
    expect(playerNamed(report.shadow!, "giocatore_01").pStarter).not.toBe(playerNamed(report, "giocatore_01").pStarter);
  });

  it("sopra soglia l'ombra sparisce, perché sarebbe il risultato stesso", () => {
    const sopra = reliability.map((row) => ({ ...row, measuredMatchdays: 9 }));
    const report = expectOk(combineStarterProbabilities({ team: TEAM, matchday: 10, sources, reliability: sopra }));
    expect(report.weighting).toBe("measured");
    expect(report.shadow).toBeNull();
  });
});

describe("ciò che si rifiuta invece di indovinarlo", () => {
  const sources: readonly SourceTeamReadings[] = [readings("fonte_alfa", { giocatore_01: "starter" })];

  function rejectionCodes(outcome: StarterProbabilityOutcome): readonly string[] {
    if (outcome.ok) throw new Error("atteso un rifiuto, arrivato un esito buono");
    return outcome.rejections.map((r) => r.code);
  }

  it("una giornata non intera o non positiva", () => {
    expect(rejectionCodes(combineStarterProbabilities({ team: TEAM, matchday: 0, sources, reliability: [] }))).toContain(
      "invalid_matchday",
    );
  });

  it("una squadra senza nome e nessuna fonte", () => {
    const codes = rejectionCodes(combineStarterProbabilities({ team: "  ", matchday: 1, sources: [], reliability: [] }));
    expect(codes).toContain("empty_identifier");
    expect(codes).toContain("no_readings");
  });

  it("la stessa fonte due volte, e lo stesso giocatore due volte dentro una fonte", () => {
    const doppia = rejectionCodes(
      combineStarterProbabilities({
        team: TEAM,
        matchday: 1,
        sources: [readings("fonte_alfa", { giocatore_01: "starter" }), readings("fonte_alfa", { giocatore_01: "bench" })],
        reliability: [],
      }),
    );
    expect(doppia).toContain("source_listed_twice");

    const ripetuto = rejectionCodes(
      combineStarterProbabilities({
        team: TEAM,
        matchday: 1,
        sources: [
          {
            source: "fonte_alfa",
            readings: [
              { playerId: "giocatore_01", reading: { kind: "status", status: "starter" } },
              { playerId: "giocatore_01", reading: { kind: "status", status: "bench" } },
            ],
          },
        ],
        reliability: [],
      }),
    );
    expect(ripetuto).toContain("player_listed_twice");
  });

  it("una percentuale fuori da [0, 1]", () => {
    const codes = rejectionCodes(
      combineStarterProbabilities({
        team: TEAM,
        matchday: 1,
        sources: [
          { source: "fonte_alfa", readings: [{ playerId: "giocatore_01", reading: { kind: "declaredProbability", probability: 1.4 } }] },
        ],
        reliability: [],
      }),
    );
    expect(codes).toContain("probability_out_of_range");
  });

  it("un registro incoerente: più accordi che chiamate decise, o conteggi non interi", () => {
    const codes = rejectionCodes(
      combineStarterProbabilities({
        team: TEAM,
        matchday: 1,
        sources,
        reliability: [
          ledgerRow({ source: "fonte_alfa", measuredMatchdays: 3, decided: 10, agreements: 11 }),
          ledgerRow({ source: "fonte_beta", measuredMatchdays: 1.5, decided: 10, agreements: 5 }),
        ],
      }),
    );
    expect(codes.filter((c) => c === "reliability_counts_invalid").length).toBe(2);
  });

  it("la stessa coppia fonte-squadra due volte nel registro", () => {
    const codes = rejectionCodes(
      combineStarterProbabilities({
        team: TEAM,
        matchday: 1,
        sources,
        reliability: [
          ledgerRow({ source: "fonte_alfa", measuredMatchdays: 3, decided: 10, agreements: 5 }),
          ledgerRow({ source: "fonte_alfa", measuredMatchdays: 4, decided: 12, agreements: 6 }),
        ],
      }),
    );
    expect(codes).toContain("reliability_row_twice");
  });

  it("sopra soglia, se ogni peso è zero non si media: si rifiuta", () => {
    const codes = rejectionCodes(
      combineStarterProbabilities({
        team: TEAM,
        matchday: 10,
        sources: [readings("fonte_alfa", { giocatore_01: "starter" }), readings("fonte_beta", { giocatore_01: "bench" })],
        reliability: [
          ledgerRow({ source: "fonte_alfa", measuredMatchdays: 9, decided: 300, agreements: 0 }),
          ledgerRow({ source: "fonte_beta", measuredMatchdays: 9, decided: 300, agreements: 0 }),
        ],
      }),
    );
    expect(codes).toEqual(["no_usable_weight"]);
  });

  it("un giocatore nominato solo da fonti a peso zero esce `null`, non un mezzo inventato", () => {
    const report = expectOk(
      combineStarterProbabilities({
        team: TEAM,
        matchday: 10,
        sources: [
          readings("fonte_alfa", { giocatore_01: "starter", giocatore_02: "starter" }),
          readings("fonte_beta", { giocatore_02: "bench" }),
        ],
        reliability: [
          // Mai un accordo, da nessuna parte: media pooled zero, alpha zero, peso zero.
          ledgerRow({ source: "fonte_alfa", measuredMatchdays: 9, decided: 300, agreements: 0 }),
          ledgerRow({ source: "fonte_beta", measuredMatchdays: 9, decided: 300, agreements: 210 }),
        ],
      }),
    );
    expect(report.weighting).toBe("measured");
    expect(report.weights.find((w) => w.source === "fonte_alfa")!.weight).toBe(0);
    // Solo alfa lo nomina, e alfa pesa zero.
    expect(playerNamed(report, "giocatore_01").pStarter).toBeNull();
    // Il secondo lo nomina anche beta, che pesa: il numero c'è ed è solo di
    // beta, a meno dell'andata e ritorno in logit.
    expect(playerNamed(report, "giocatore_02").pStarter!).toBeCloseTo(Q_BENCH, 12);
  });
});

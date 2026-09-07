import { describe, expect, it } from "vitest";
import {
  type CompetitionObjective,
  type Lineup,
  LEAGUE_POINTS,
  type LineupValuation,
  type PlayerForecast,
  type WeightedOpponentLineup,
  compareLineupValuations,
  describeCompetitionObjective,
  drawOpponentLineupIndices,
  modalOpponentIndex,
  mulberry32,
  normalisedOpponentWeights,
  opponentDrawSubSeed,
  playerDrawSubSeed,
  proposeLineup,
  scenarioObjectiveValue,
  simulateGameweek,
} from "../src/index.js";

// GOLDEN FIXTURE DELL'OBIETTIVO SU DISTRIBUZIONE — WP-1.
//
// Tutti i numeri qui sotto sono SINTETICI e scelti per riprodurre esattamente
// la tabella di §2.1 del disegno esecutivo: una formazione stabile che fa
// sempre 71 e una variabile che fa 78 quattro volte su dieci e 65 sei volte su
// dieci, contro un avversario che fa 74 e quindi due goal. Non somigliano a una
// giornata vera, e non devono: servono a far cadere la decisione esattamente
// sul punto in cui i due obiettivi divergono.
//
// COME I NUMERI SONO COSTRUITI, perché chi li rifà a mano ci arrivi:
//  - entrambe le squadre giocano 352, quindi il modificatore modulo vale +0,5
//    per ciascuna e si annulla nella differenza;
//  - tre difensori in campo: §19 chiede portiere PIÙ QUATTRO difensori con
//    voto, quindi il modificatore difesa non si attiva per nessuno dei due;
//  - cinque centrocampisti per parte, tutti a voto base 6,0: le somme sono
//    uguali e §20 dà zero;
//  - ogni attaccante che porta un punteggio sopra il voto base dichiara
//    `receivedAnyBonus`, e §21 lo esclude dal modificatore attacco; gli altri
//    hanno voto base 6,0, che la tabella di §21 paga zero. Il modificatore
//    attacco è quindi zero da entrambe le parti, in ogni scenario.
// Ne segue che la differenza fra le formazioni sta TUTTA nel punteggio dei
// giocatori, che è esattamente quel che la fixture vuole isolare.

const forecast = (
  id: string,
  role: PlayerForecast["role"],
  baseVote: number,
  fantasyScore: number,
  voteProbability = 1,
): PlayerForecast => ({
  id,
  role,
  voteProbability,
  expected: {
    baseVote,
    fantasyScore,
    receivedAnyBonus: fantasyScore > baseVote,
    missedPenalty: false,
  },
});

/** La nostra rosa: la parte fissa vale 65 con un attaccante solo in campo. */
const SQUAD: readonly PlayerForecast[] = [
  forecast("P1", "P", 6, 6),
  forecast("D1", "D", 6, 6),
  forecast("D2", "D", 6, 6),
  forecast("D3", "D", 6, 6),
  forecast("C1", "C", 6, 6),
  forecast("C2", "C", 6, 6),
  forecast("C3", "C", 6, 6),
  forecast("C4", "C", 6, 6),
  forecast("C5", "C", 6, 8.5),
  forecast("A1", "A", 6, 6),
  // L'alternativa STABILE: gioca sempre e vale 6.
  forecast("A2", "A", 6, 6),
  // L'alternativa VARIABILE: quattro volte su dieci vale 13, sei volte è un
  // senza voto puro che nessuno copre — la panchina delle formazioni bloccate
  // qui sotto è VUOTA di proposito.
  forecast("A3", "A", 6, 13, 0.4),
  // Serve solo al caso «pareggio»: con lui il nostro totale fa 72, cioè due
  // goal come l'avversario.
  forecast("A5", "A", 6, 7),
];

/** L'avversario: fisso, 74 punti, due goal. */
const OPPONENT_PLAYERS: readonly PlayerForecast[] = [
  forecast("oP", "P", 6, 6),
  forecast("oD1", "D", 6, 6),
  forecast("oD2", "D", 6, 6),
  forecast("oD3", "D", 6, 6),
  forecast("oC1", "C", 6, 6),
  forecast("oC2", "C", 6, 6),
  forecast("oC3", "C", 6, 6),
  forecast("oC4", "C", 6, 6),
  forecast("oC5", "C", 6, 6),
  forecast("oA1", "A", 6, 9.5),
  forecast("oA2", "A", 6, 10),
  // Un quarto difensore che la formazione modale NON schiera: serve alla
  // seconda formazione della distribuzione, che è un 4-5-1.
  forecast("oD4", "D", 6, 6),
];

const OPPONENT_LINEUP: Lineup = {
  module: "352",
  goalkeeperId: "oP",
  starterIds: ["oD1", "oD2", "oD3", "oC1", "oC2", "oC3", "oC4", "oC5", "oA1", "oA2"],
  benchIds: [],
};

const ourLineup = (secondStriker: string): Lineup => ({
  module: "352",
  goalkeeperId: "P1",
  starterIds: ["D1", "D2", "D3", "C1", "C2", "C3", "C4", "C5", "A1", secondStriker],
  benchIds: [],
});

const LINEUP_A = ourLineup("A2"); // stabile: 71 sempre
const LINEUP_B = ourLineup("A3"); // variabile: 78 col 40 %, 65 col 60 %
const LINEUP_DRAW = ourLineup("A5"); // 72: due goal, quindi pareggio

const CONTEXT = { matchday: 1, weAreHome: true } as const;

/** Valuta una formazione DATA sugli stessi scenari, senza nessuna ricerca. */
function evaluate(lineup: Lineup, competition?: CompetitionObjective) {
  const proposal = proposeLineup({
    squad: SQUAD,
    opponent: { lineup: OPPONENT_LINEUP, players: OPPONENT_PLAYERS },
    context: CONTEXT,
    competition,
    constraints: { lockedStarterIds: [], locked: true },
    currentLineup: lineup,
  });
  expect(proposal.feasible).toBe(true);
  return proposal;
}

describe("§2.1 — l'obiettivo sceglie la formazione variabile, la media sceglie quella stabile", () => {
  it("i tre punteggi della tabella di §2.1 escono dal simulatore, non da una formula parallela", () => {
    const lines = new Map(
      [...SQUAD, ...OPPONENT_PLAYERS].map((f) => [
        f.id,
        {
          id: f.id,
          role: f.role,
          baseVote: f.expected.baseVote,
          fantasyScore: f.expected.fantasyScore,
          receivedAnyBonus: f.expected.receivedAnyBonus,
          missedPenalty: f.expected.missedPenalty,
        },
      ]),
    );
    const stabile = simulateGameweek({
      ourLineup: LINEUP_A,
      theirLineup: OPPONENT_LINEUP,
      players: lines,
      context: CONTEXT,
    });
    expect(stabile.ours.total).toBe(71);
    expect(stabile.theirs.total).toBe(74);
    expect(stabile.ourGoals).toBe(1);
    expect(stabile.theirGoals).toBe(2);

    const variabile = simulateGameweek({
      ourLineup: LINEUP_B,
      theirLineup: OPPONENT_LINEUP,
      players: lines,
      context: CONTEXT,
    });
    expect(variabile.ours.total).toBe(78);
    expect(variabile.ourGoals).toBe(3);
  });

  it("B ha l'obiettivo più alto e la MEDIA più bassa: è esattamente la tabella di §2.1", () => {
    const a = evaluate(LINEUP_A);
    const b = evaluate(LINEUP_B);

    // Gli scenari sono enumerati, non campionati: i numeri sono esatti.
    expect(a.estimate.method).toBe("exact");
    expect(b.estimate.method).toBe("exact");

    // La stabile: sempre 71, sempre un goal contro due, zero punti.
    expect(a.estimate.expectedOurTotal).toBeCloseTo(71, 12);
    expect(a.estimate.objectiveValue).toBeCloseTo(0, 12);
    expect(a.estimate.ourTotalVariance).toBeCloseTo(0, 12);

    // La variabile: 0,4 × 78 + 0,6 × 65 = 70,2 di media, e 0,4 × 3 = 1,2 punti.
    expect(b.estimate.expectedOurTotal).toBeCloseTo(70.2, 12);
    expect(b.estimate.objectiveValue).toBeCloseTo(1.2, 12);
    expect(b.estimate.winProbability).toBeCloseTo(0.4, 12);

    // IL PUNTO DI §2.1, in due righe: chi massimizza la media sceglie A, chi
    // massimizza i punti di lega attesi sceglie B, e A non vince mai.
    expect(a.estimate.expectedOurTotal).toBeGreaterThan(b.estimate.expectedOurTotal);
    expect(b.estimate.objectiveValue).toBeGreaterThan(a.estimate.objectiveValue);
    expect(
      compareLineupValuations(
        b.estimate as unknown as LineupValuation,
        a.estimate as unknown as LineupValuation,
      ),
    ).toBeGreaterThan(0);
  });
});

describe("§3.2 — i criteri fini, nell'ordine dichiarato", () => {
  const base: LineupValuation = {
    objectiveValue: 1.2,
    undecidedWeight: 0,
    expectedLeaguePoints: 1.2,
    expectedOurTotal: 70,
    ourTotalVariance: 10,
    winProbability: 0.4,
    drawProbability: 0,
    lossProbability: 0.6,
    fullyTabulated: true,
    allResolved: true,
  };

  it("primo criterio: l'obiettivo, e batte un punteggio atteso più alto", () => {
    const migliore = { ...base, objectiveValue: 1.3, expectedOurTotal: 60 };
    expect(compareLineupValuations(migliore, base)).toBeGreaterThan(0);
  });

  it("secondo criterio: a parità di obiettivo vince il punteggio atteso maggiore", () => {
    const migliore = { ...base, expectedOurTotal: 71 };
    expect(compareLineupValuations(migliore, base)).toBeGreaterThan(0);
  });

  it("terzo criterio: a parità anche di punteggio atteso vince la VARIANZA MINORE", () => {
    const piuTranquilla = { ...base, ourTotalVariance: 4 };
    expect(compareLineupValuations(piuTranquilla, base)).toBeGreaterThan(0);
    expect(compareLineupValuations(base, piuTranquilla)).toBeLessThan(0);
  });

  it("a parità dei tre criteri il confronto non decide: decide l'ordine stabile della ricerca", () => {
    expect(compareLineupValuations(base, { ...base })).toBe(0);
  });
});

describe("§3.3 — l'obiettivo della coppa", () => {
  it("coppa IGNOTA: si usa l'obiettivo del campionato e lo si DICHIARA", () => {
    const ignota = evaluate(LINEUP_B, { kind: "cup_unknown" });
    const campionato = evaluate(LINEUP_B, { kind: "league" });

    expect(ignota.estimate.objectiveKind).toBe("cup_unknown");
    expect(ignota.estimate.objectiveUnit).toBe("LEAGUE_POINTS");
    expect(ignota.estimate.objectiveValue).toBeCloseTo(campionato.estimate.objectiveValue, 12);
    expect(ignota.estimate.objectiveValue).toBeCloseTo(ignota.estimate.expectedLeaguePoints, 12);
    // La dichiarazione non è un commento nel codice: viaggia con il risultato.
    expect(ignota.objectiveLabel).toMatch(/STATO DELLA COPPA IGNOTO/);
    expect(ignota.objectiveLabel).toMatch(/si osservano/);
  });

  it("girone di coppa: stessa forma del campionato, etichetta diversa", () => {
    const girone = evaluate(LINEUP_B, { kind: "cup_group" });
    const campionato = evaluate(LINEUP_B, { kind: "league" });
    expect(girone.estimate.objectiveValue).toBeCloseTo(campionato.estimate.objectiveValue, 12);
    expect(girone.objectiveLabel).toMatch(/girone di coppa/);
    expect(girone.objectiveLabel).toMatch(/non per analogia con §22/);
  });

  it("finale in gara secca: la parità VALE ZERO, e il campionato la paga un punto", () => {
    const inCampionato = evaluate(LINEUP_DRAW, { kind: "league" });
    expect(inCampionato.estimate.drawProbability).toBeCloseTo(1, 12);
    expect(inCampionato.estimate.objectiveValue).toBeCloseTo(LEAGUE_POINTS.draw, 12);

    const inFinale = evaluate(LINEUP_DRAW, { kind: "cup_single_match_final" });
    expect(inFinale.estimate.objectiveUnit).toBe("PROBABILITY");
    expect(inFinale.estimate.objectiveValue).toBeCloseTo(0, 12);
    expect(inFinale.objectiveLabel).toMatch(/PARITÀ VALE ZERO/);

    // E una formazione che vince a volte vale la sua probabilità di vittoria.
    const vincente = evaluate(LINEUP_B, { kind: "cup_single_match_final" });
    expect(vincente.estimate.objectiveValue).toBeCloseTo(0.4, 12);
  });

  it("ritorno del doppio confronto: P(passaggio del turno) con l'andata come stato noto", () => {
    // Andata persa 1-2, punteggi 71 a 74. Al ritorno servono i tre punti E la
    // somma dei punteggi, perché i punti sulle due gare finiscono pari.
    const andata = { ourGoals: 1, theirGoals: 2, ourScore: 71, theirScore: 74 };
    const competition: CompetitionObjective = { kind: "cup_knockout_second_leg", firstLeg: andata };

    // La stabile perde anche il ritorno: 0 punti contro 6, non passa mai.
    const stabile = evaluate(LINEUP_A, competition);
    expect(stabile.estimate.objectiveUnit).toBe("PROBABILITY");
    expect(stabile.estimate.objectiveValue).toBeCloseTo(0, 12);

    // La variabile passa nel solo scenario in cui vince 78-74: 3 punti a 3,
    // poi 71 + 78 = 149 contro 74 + 74 = 148 (§23, somma dei punteggi).
    const variabile = evaluate(LINEUP_B, competition);
    expect(variabile.estimate.objectiveValue).toBeCloseTo(0.4, 12);
    expect(variabile.estimate.undecidedWeight).toBeCloseTo(0, 12);

    // In campionato la stessa formazione vale 1,2 punti: l'obiettivo di coppa
    // NON è una riscalatura di quello di campionato, è un'altra domanda.
    expect(variabile.estimate.expectedLeaguePoints).toBeCloseTo(1.2, 12);
    expect(variabile.objectiveLabel).toMatch(/P\(passaggio del turno\)/);
  });

  it("parità ANCHE nella somma dei punteggi: fail-closed, massa non attribuita", () => {
    // Andata 1-2 con punteggi 71 a 75: al ritorno vinto 78-74 le somme fanno
    // 149 e 149. §23 registra questo caso come UNSPECIFIED e vieta di dedurlo.
    const competition: CompetitionObjective = {
      kind: "cup_knockout_second_leg",
      firstLeg: { ourGoals: 1, theirGoals: 2, ourScore: 71, theirScore: 75 },
    };
    const variabile = evaluate(LINEUP_B, competition);
    // Lo scenario da 0,4 non è attribuito a nessuno: non conta come passaggio
    // e non conta come eliminazione.
    expect(variabile.estimate.undecidedWeight).toBeCloseTo(0.4, 12);
    expect(variabile.estimate.objectiveValue).toBeCloseTo(0, 12);
    expect(variabile.reason).toMatch(/MASSA NON ATTRIBUITA/);
    expect(variabile.reason).toMatch(/minorante/);
  });

  it("lo scenario indeciso lo dichiara anche la funzione pura, con il suo articolo", () => {
    const outcome = simulateGameweek({
      ourLineup: LINEUP_B,
      theirLineup: OPPONENT_LINEUP,
      players: new Map(
        [...SQUAD, ...OPPONENT_PLAYERS].map((f) => [
          f.id,
          {
            id: f.id,
            role: f.role,
            baseVote: f.expected.baseVote,
            fantasyScore: f.expected.fantasyScore,
            receivedAnyBonus: f.expected.receivedAnyBonus,
            missedPenalty: f.expected.missedPenalty,
          },
        ]),
      ),
      context: CONTEXT,
    });
    const pari = scenarioObjectiveValue(
      outcome,
      { kind: "cup_knockout_second_leg", firstLeg: { ourGoals: 1, theirGoals: 2, ourScore: 71, theirScore: 75 } },
      LEAGUE_POINTS,
    );
    expect(pari.decided).toBe(false);
    expect(pari.reason).toMatch(/UNSPECIFIED/);
  });

  it("uno stato d'andata non leggibile si rifiuta invece di essere riempito", () => {
    const outcome = simulateGameweek({
      ourLineup: LINEUP_A,
      theirLineup: OPPONENT_LINEUP,
      players: new Map(
        [...SQUAD, ...OPPONENT_PLAYERS].map((f) => [
          f.id,
          {
            id: f.id,
            role: f.role,
            baseVote: f.expected.baseVote,
            fantasyScore: f.expected.fantasyScore,
            receivedAnyBonus: f.expected.receivedAnyBonus,
            missedPenalty: f.expected.missedPenalty,
          },
        ]),
      ),
      context: CONTEXT,
    });
    expect(() =>
      scenarioObjectiveValue(
        outcome,
        {
          kind: "cup_knockout_second_leg",
          firstLeg: { ourGoals: 1, theirGoals: 2, ourScore: Number.NaN, theirScore: 74 },
        },
        LEAGUE_POINTS,
      ),
    ).toThrow(/andata: ourScore non è un numero finito/);
  });

  it("l'etichetta dichiara sempre unità e competizione", () => {
    for (const competition of [
      { kind: "league" },
      { kind: "cup_group" },
      { kind: "cup_single_match_final" },
      { kind: "cup_unknown" },
      { kind: "cup_knockout_second_leg", firstLeg: { ourGoals: 0, theirGoals: 0, ourScore: 60, theirScore: 60 } },
    ] as const) {
      const described = describeCompetitionObjective(competition, LEAGUE_POINTS);
      expect(described.kind).toBe(competition.kind);
      expect(described.label.length).toBeGreaterThan(20);
    }
  });
});

describe("la distribuzione delle formazioni avversarie", () => {
  /**
   * Una seconda formazione avversaria, DIVERSA sul serio: 4-5-1 invece di
   * 3-5-2. Cambia tre cose insieme, ed è il motivo per cui la distribuzione
   * serve — §19 gli attiva il modificatore difesa (quattro difensori con
   * voto), §9 ci regala −1 invece di +0,5, e l'attaccante in meno gli toglie
   * punteggio.
   */
  const OPPONENT_ALT: Lineup = {
    module: "451",
    goalkeeperId: "oP",
    starterIds: ["oD1", "oD2", "oD3", "oD4", "oC1", "oC2", "oC3", "oC4", "oC5", "oA1"],
    benchIds: [],
  };

  it("una formazione singola È una distribuzione a un elemento: stesso risultato bit a bit", () => {
    const senza = evaluate(LINEUP_B);
    const con = proposeLineup({
      squad: SQUAD,
      opponent: {
        lineup: OPPONENT_LINEUP,
        players: OPPONENT_PLAYERS,
        lineupDistribution: [{ lineup: OPPONENT_LINEUP, weight: 1 }],
      },
      context: CONTEXT,
      constraints: { lockedStarterIds: [], locked: true },
      currentLineup: LINEUP_B,
    });
    expect(con.estimate.objectiveValue).toBe(senza.estimate.objectiveValue);
    expect(con.estimate.expectedOurTotal).toBe(senza.estimate.expectedOurTotal);
    expect(con.estimate.ourTotalVariance).toBe(senza.estimate.ourTotalVariance);
    expect(con.estimate.opponentLineups).toBe(1);
    expect(con.estimate.opponentLineupShare).toEqual([1]);
  });

  it("i pesi sono relativi e si normalizzano; la modale è il peso maggiore, parità all'ordine", () => {
    expect(normalisedOpponentWeights([{ lineup: OPPONENT_LINEUP, weight: 3 }, { lineup: OPPONENT_ALT, weight: 1 }], "x")).toEqual([
      0.75, 0.25,
    ]);
    expect(modalOpponentIndex([0.25, 0.75])).toBe(1);
    // Parità: vince il primo dichiarato, e l'ordine è parte del contratto.
    expect(modalOpponentIndex([0.5, 0.5])).toBe(0);
  });

  it("un peso non positivo si rifiuta invece di essere trattato come «poco probabile»", () => {
    const distribution: WeightedOpponentLineup[] = [
      { lineup: OPPONENT_LINEUP, weight: 1 },
      { lineup: OPPONENT_ALT, weight: 0 },
    ];
    expect(() => normalisedOpponentWeights(distribution, "x")).toThrow(/peso non valido/);
  });

  it("una modale dichiarata che i pesi smentiscono si rifiuta", () => {
    expect(() =>
      proposeLineup({
        squad: SQUAD,
        opponent: {
          lineup: OPPONENT_LINEUP,
          players: OPPONENT_PLAYERS,
          lineupDistribution: [
            { lineup: OPPONENT_LINEUP, weight: 1 },
            { lineup: OPPONENT_ALT, weight: 9 },
          ],
        },
        context: CONTEXT,
        constraints: { lockedStarterIds: [], locked: true },
        currentLineup: LINEUP_B,
      }),
    ).toThrow(/non è la modale della distribuzione/);
  });

  it("una candidata illegale non è «meno probabile»: è impossibile, e si rifiuta", () => {
    const illegale: Lineup = { ...OPPONENT_LINEUP, module: "442" };
    expect(() =>
      proposeLineup({
        squad: SQUAD,
        opponent: {
          lineup: OPPONENT_LINEUP,
          players: OPPONENT_PLAYERS,
          lineupDistribution: [
            { lineup: OPPONENT_LINEUP, weight: 9 },
            { lineup: illegale, weight: 1 },
          ],
        },
        context: CONTEXT,
        constraints: { lockedStarterIds: [], locked: true },
        currentLineup: LINEUP_B,
      }),
    ).toThrow(/non è legale/);
  });

  it("con due formazioni avversarie l'obiettivo è la media pesata sui due mondi", () => {
    // Contro il 343 l'avversario ci regala 1,5 invece di 0,5: il nostro totale
    // sale di 1 e il loro scende di 1 (loro ricevono il nostro 352, invariato).
    const misto = proposeLineup({
      squad: SQUAD,
      opponent: {
        lineup: OPPONENT_LINEUP,
        players: OPPONENT_PLAYERS,
        lineupDistribution: [
          { lineup: OPPONENT_LINEUP, weight: 3 },
          { lineup: OPPONENT_ALT, weight: 1 },
        ],
      },
      context: CONTEXT,
      constraints: { lockedStarterIds: [], locked: true },
      currentLineup: LINEUP_A,
    });
    expect(misto.estimate.opponentLineups).toBe(2);
    expect(misto.estimate.opponentLineupShare[0]).toBeCloseTo(0.75, 12);
    expect(misto.estimate.opponentLineupShare[1]).toBeCloseTo(0.25, 12);
    // 0,75 × 71 + 0,25 × 69,5 = 70,625: la media pesata, non uno dei due mondi.
    expect(misto.estimate.expectedOurTotal).toBeCloseTo(70.625, 12);
    // Contro il 3-5-2 si perde 1-2 e non si prende niente; contro il 4-5-1 si
    // pareggia 1-1 e si prende un punto: 0,25 × 1.
    expect(misto.estimate.objectiveValue).toBeCloseTo(0.25, 12);
    expect(misto.estimate.drawProbability).toBeCloseTo(0.25, 12);
    // E la varianza non è più zero: due mondi diversi sono due punteggi diversi.
    expect(misto.estimate.ourTotalVariance).toBeGreaterThan(0);
  });
});

describe("i due sotto-semi, e il vettore avversario che non dipende dalla ricerca", () => {
  it("il sotto-seme dei giocatori è il seme di giornata; quello avversario ne differisce", () => {
    for (const seed of [0, 1, 20260903, 4294967295]) {
      expect(playerDrawSubSeed(seed)).toBe(seed);
      expect(opponentDrawSubSeed(seed)).not.toBe(seed);
    }
    // Semi vicini devono dare sotto-semi lontani, altrimenti «due flussi» è un
    // nome per lo stesso flusso.
    expect(opponentDrawSubSeed(1)).not.toBe(opponentDrawSubSeed(2));
  });

  it("con una formazione sola non si estrae nulla: un sorteggio a un esito solo non è un sorteggio", () => {
    expect(drawOpponentLineupIndices([1], 8, 7, mulberry32)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("il vettore avversario dipende SOLO da pesi, budget e seme", () => {
    const uno = drawOpponentLineupIndices([0.5, 0.3, 0.2], 512, 42, mulberry32);
    const due = drawOpponentLineupIndices([0.5, 0.3, 0.2], 512, 42, mulberry32);
    expect(due).toEqual(uno);
    expect(drawOpponentLineupIndices([0.5, 0.3, 0.2], 512, 43, mulberry32)).not.toEqual(uno);
    // Le quote realizzate seguono i pesi: non è una prova di correttezza
    // statistica, è la prova che le soglie cumulate non sono invertite.
    const quota = (index: number) => uno.filter((i) => i === index).length / uno.length;
    expect(quota(0)).toBeGreaterThan(quota(1));
    expect(quota(1)).toBeGreaterThan(quota(2));
    expect(quota(0) + quota(1) + quota(2)).toBe(1);
  });

  it("stesso seme, stessi scenari avversari, anche cambiando il numero di candidate", () => {
    // Due rose di dimensione diversa: la seconda ha più giocatori, quindi più
    // formazioni candidate e più mosse nel vicinato. Il vettore delle
    // formazioni avversarie deve restare identico, altrimenti due giornate
    // «uguali» non sarebbero confrontabili.
    const incerti = Array.from({ length: 8 }, (_, i) => forecast(`X${i}`, "C", 6, 6, 0.5));
    const rosaCorta: readonly PlayerForecast[] = [...SQUAD, ...incerti];
    const rosaLunga: readonly PlayerForecast[] = [
      ...rosaCorta,
      ...Array.from({ length: 4 }, (_, i) => forecast(`Y${i}`, "D", 6, 6)),
      forecast("Y9", "P", 6, 6),
    ];
    const distribution: WeightedOpponentLineup[] = [
      { lineup: OPPONENT_LINEUP, weight: 3 },
      {
        lineup: {
          module: "451",
          goalkeeperId: "oP",
          starterIds: ["oD1", "oD2", "oD3", "oD4", "oC1", "oC2", "oC3", "oC4", "oC5", "oA1"],
          benchIds: [],
        },
        weight: 1,
      },
    ];
    const run = (squad: readonly PlayerForecast[]) =>
      proposeLineup({
        squad,
        opponent: { lineup: OPPONENT_LINEUP, players: OPPONENT_PLAYERS, lineupDistribution: distribution },
        context: CONTEXT,
        scenarioBudget: 128,
        seed: 12345,
      });
    const corta = run(rosaCorta);
    const lunga = run(rosaLunga);
    expect(corta.estimate.method).toBe("sampled");
    expect(lunga.estimate.method).toBe("sampled");
    // Le due ricerche hanno davvero valutato un numero diverso di formazioni…
    expect(lunga.evaluated).not.toBe(corta.evaluated);
    // …e nonostante questo hanno visto gli stessi avversari, scenario per scenario.
    expect(lunga.estimate.opponentLineupShare).toEqual(corta.estimate.opponentLineupShare);
  });
});

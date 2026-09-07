import { describe, expect, it } from "vitest";
// LA CONTRO-PROVA DELLA TARIFFA vive qui e non nel sorgente, ed è deliberato.
// Il pacchetto della fase d'asta non deve entrare nel motore della Fase 2 — è
// il perimetro che le guardie di isolamento tengono — ma un TEST può leggere
// entrambe le tabelle e pretendere che dicano la stessa cosa. Così la
// duplicazione dichiarata in testa a `playerScenario.ts` non è una promessa:
// è un test che diventa rosso il giorno in cui una delle due cambia da sola.
import { FANTAVOTO_TARIFF, GS_MALUS_PER_GOAL_CONCEDED, GS_MALUS_ROLE } from "../../appeal-index/src/fantavoto.js";
import {
  BASE_VOTE_GRID,
  BONUS_MALUS_TARIFF,
  GOAL_CONCEDED_MALUS,
  GOAL_CONCEDED_MALUS_ROLE,
  type Lineup,
  type PlayerDistribution,
  type PlayerForecast,
  assertPlayerDistribution,
  proposeLineup,
  resolveNoVote,
  samplePlayerLine,
} from "../src/index.js";

/** Un PRNG finto a sequenza dichiarata: nessuna casualità, solo una lista. */
const sequence = (values: readonly number[]): (() => number) => {
  let i = 0;
  return () => values[i++] ?? 0;
};

const DISTRIBUTION_BASE: PlayerDistribution = {
  pPlays: 1,
  pStarter: 1,
  pSub: 0,
  baseVote: [{ vote: 6, probability: 1 }],
  events: { pGoal: 0, pAssist: 0, pYellow: 0, pRed: 0, pOwnGoal: 0, pPenMissed: 0, pPenSaved: 0 },
  svKind: { clean: 1, booked: 0, sentOffDuringMatch: 0, withOtherBonusMalus: 0, sentOffAfterMatch: 0 },
  asOf: "2026-09-07T10:00:00Z",
  sourceQuality: "fixture sintetica",
};

describe("la tariffa di §12 nella Fase 2", () => {
  it("la griglia del voto base va da 4 a 10 a passi di mezzo punto", () => {
    expect(BASE_VOTE_GRID[0]).toBe(4);
    expect(BASE_VOTE_GRID[BASE_VOTE_GRID.length - 1]).toBe(10);
    expect(BASE_VOTE_GRID.length).toBe(13);
    expect(BASE_VOTE_GRID).toContain(6.5);
    expect(BASE_VOTE_GRID).not.toContain(3.5);
  });

  it("dice gli stessi numeri della tariffa della fase d'asta, evento per evento", () => {
    // Il gol da rigore non ha una riga sua: §12 prezza IL GOL, e la fase d'asta
    // lo sa (`Rf` vale quanto `Gf`). Qui si verifica proprio quella coincidenza.
    expect(BONUS_MALUS_TARIFF.goal).toBe(FANTAVOTO_TARIFF.Gf);
    expect(BONUS_MALUS_TARIFF.goal).toBe(FANTAVOTO_TARIFF.Rf);
    expect(BONUS_MALUS_TARIFF.assist).toBe(FANTAVOTO_TARIFF.Ass);
    expect(BONUS_MALUS_TARIFF.penaltySaved).toBe(FANTAVOTO_TARIFF.Rp);
    expect(BONUS_MALUS_TARIFF.penaltyMissed).toBe(FANTAVOTO_TARIFF.Rs);
    expect(BONUS_MALUS_TARIFF.ownGoal).toBe(FANTAVOTO_TARIFF.Au);
    expect(BONUS_MALUS_TARIFF.yellowCard).toBe(FANTAVOTO_TARIFF.Amm);
    expect(BONUS_MALUS_TARIFF.redCard).toBe(FANTAVOTO_TARIFF.Esp);
    expect(GOAL_CONCEDED_MALUS).toBe(GS_MALUS_PER_GOAL_CONCEDED);
    expect(GOAL_CONCEDED_MALUS_ROLE).toBe(GS_MALUS_ROLE);
  });
});

describe("il campionatore di uno scenario per giocatore", () => {
  it("chi gioca prende il voto estratto e gli eventi che il regolamento prezza", () => {
    const line = samplePlayerLine(
      { id: "X", role: "C" },
      {
        ...DISTRIBUTION_BASE,
        baseVote: [{ vote: 7, probability: 1 }],
        events: { ...DISTRIBUTION_BASE.events, pGoal: 1, pYellow: 1 },
      },
      // gioca, voto, gol, assist, giallo, rosso, autogol, rigore sbagliato, rigore parato
      sequence([0, 0, 0, 0.9, 0, 0.9, 0.9, 0.9, 0.9]),
    );
    expect(line.baseVote).toBe(7);
    // 7 più 3 di gol meno 0,5 di ammonizione: §12, e il malus del cartellino su
    // un giocatore CON voto si somma davvero — è il contrasto di §13.
    expect(line.fantasyScore).toBe(9.5);
    expect(line.receivedAnyBonus).toBe(true);
    expect(line.missedPenalty).toBe(false);
  });

  it("il rigore sbagliato accende il flag che §21 usa per escludere l'attaccante", () => {
    const line = samplePlayerLine(
      { id: "X", role: "A" },
      { ...DISTRIBUTION_BASE, events: { ...DISTRIBUTION_BASE.events, pPenMissed: 1 } },
      sequence([0, 0, 0.9, 0.9, 0.9, 0.9, 0.9, 0, 0.9]),
    );
    expect(line.fantasyScore).toBe(3);
    expect(line.missedPenalty).toBe(true);
    expect(line.receivedAnyBonus).toBe(false);
  });

  it("al portiere i gol subiti costano −1 l'uno, e a nessun altro", () => {
    const keeper = samplePlayerLine(
      { id: "P", role: "P" },
      {
        ...DISTRIBUTION_BASE,
        events: { ...DISTRIBUTION_BASE.events, goalsConceded: [0.2, 0.3, 0.5] },
      },
      // gioca, voto, sette eventi a zero, poi i gol subiti: 0,9 cade nel terzo caso
      sequence([0, 0, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9]),
    );
    expect(keeper.fantasyScore).toBe(4); // 6 − 2
  });

  it("le cinque fattispecie del senza voto arrivano intatte a §13", () => {
    const svDistribution = (kind: keyof PlayerDistribution["svKind"]): PlayerDistribution => ({
      ...DISTRIBUTION_BASE,
      pPlays: 0,
      pStarter: 0,
      pSub: 0,
      svKind: {
        clean: 0,
        booked: 0,
        sentOffDuringMatch: 0,
        withOtherBonusMalus: 0,
        sentOffAfterMatch: 0,
        [kind]: 1,
      } as PlayerDistribution["svKind"],
      svOtherBonusMalus: kind === "withOtherBonusMalus" ? 3 : undefined,
    });
    const draw = (kind: keyof PlayerDistribution["svKind"]) =>
      samplePlayerLine({ id: "X", role: "C" }, svDistribution(kind), sequence([0.5, 0]));

    // Non basta che la riga sia «un senza voto»: deve portare i due dati che
    // `resolveNoVote` usa per scegliere fra i cinque esiti di §13.
    const puro = draw("clean");
    expect(puro.baseVote).toBeNull();
    expect(resolveNoVote({ cards: puro.cards ?? null, otherBonusMalus: puro.otherBonusMalus ?? null }).status).toBe(
      "must_be_replaced",
    );

    const ammonito = draw("booked");
    expect(ammonito.cards).toBe("yellow");
    const ammonitoOutcome = resolveNoVote({
      cards: ammonito.cards ?? null,
      otherBonusMalus: ammonito.otherBonusMalus ?? null,
    });
    expect(ammonitoOutcome.status).toBe("office_score");
    expect(ammonitoOutcome.baseVote).toBe(5);

    const espulso = draw("sentOffDuringMatch");
    expect(
      resolveNoVote({ cards: espulso.cards ?? null, otherBonusMalus: espulso.otherBonusMalus ?? null }).fantasyScore,
    ).toBe(4);

    const conBonus = draw("withOtherBonusMalus");
    expect(conBonus.otherBonusMalus).toBe(3);
    expect(
      resolveNoVote({ cards: conBonus.cards ?? null, otherBonusMalus: conBonus.otherBonusMalus ?? null }).fantasyScore,
    ).toBe(9); // 6 + 3

    const dopoIlFischio = draw("sentOffAfterMatch");
    expect(dopoIlFischio.cards).toBe("red_after_match");
    expect(
      resolveNoVote({
        cards: dopoIlFischio.cards ?? null,
        otherBonusMalus: dopoIlFischio.otherBonusMalus ?? null,
      }).status,
    ).toBe("must_be_replaced");
  });
});

describe("la distribuzione si dichiara per intero, o si rifiuta", () => {
  const check = (patch: Partial<PlayerDistribution>, role: "C" | "P" = "C", modalBaseVote = 6) =>
    assertPlayerDistribution(
      { id: "X", role, voteProbability: patch.pPlays ?? 1, modalBaseVote },
      { ...DISTRIBUTION_BASE, ...patch },
      "rosa",
    );

  it("pPlays e voteProbability sono lo stesso numero: se divergono si rifiuta", () => {
    expect(() =>
      assertPlayerDistribution(
        { id: "X", role: "C", voteProbability: 0.8, modalBaseVote: 6 },
        DISTRIBUTION_BASE,
        "rosa",
      ),
    ).toThrow(/contraddice voteProbability/);
  });

  it("un voto fuori dalla griglia si rifiuta: §21 vieta di interpolare", () => {
    expect(() => check({ baseVote: [{ vote: 6.3, probability: 1 }] })).toThrow(/fuori dalla griglia/);
  });

  it("i voti devono essere in ordine crescente stretto", () => {
    expect(() =>
      check({
        baseVote: [
          { vote: 7, probability: 0.5 },
          { vote: 6, probability: 0.5 },
        ],
      }),
    ).toThrow(/ordine strettamente crescente/);
  });

  it("una distribuzione che non somma a uno si rifiuta invece di lasciare la massa in giro", () => {
    expect(() =>
      check({
        baseVote: [
          { vote: 6, probability: 0.5 },
          { vote: 7, probability: 0.2 },
        ],
      }),
    ).toThrow(/somma 0.7 invece di 1/);
  });

  it("la riga modale deve essere davvero la moda della distribuzione", () => {
    expect(() =>
      check(
        {
          baseVote: [
            { vote: 5, probability: 0.9 },
            { vote: 8, probability: 0.1 },
          ],
        },
        "C",
        8,
      ),
    ).toThrow(/dichiarata MODALE, non media/);
  });

  it("i gol subiti sono obbligatori per il portiere e vietati per gli altri", () => {
    expect(() => check({}, "P")).toThrow(/manca la distribuzione dei gol subiti/);
    expect(() =>
      check({ events: { ...DISTRIBUTION_BASE.events, goalsConceded: [1] } }),
    ).toThrow(/gol subiti dichiarati su un giocatore di ruolo C/);
  });

  it("le cinque fattispecie di §13 sommano a uno", () => {
    expect(() =>
      check({ svKind: { clean: 0.5, booked: 0, sentOffDuringMatch: 0, withOtherBonusMalus: 0, sentOffAfterMatch: 0 } }),
    ).toThrow(/le cinque fattispecie del senza voto/);
  });

  it("il senza voto «con altro bonus/malus» senza il suo valore non è calcolabile", () => {
    expect(() =>
      check({
        svKind: { clean: 0.5, booked: 0, sentOffDuringMatch: 0, withOtherBonusMalus: 0.5, sentOffAfterMatch: 0 },
      }),
    ).toThrow(/svOtherBonusMalus non è dichiarato/);
    expect(() =>
      check({
        svKind: { clean: 0.5, booked: 0, sentOffDuringMatch: 0, withOtherBonusMalus: 0.5, sentOffAfterMatch: 0 },
        svOtherBonusMalus: 0,
      }),
    ).toThrow(/È il senza voto puro/);
  });

  it("un istante senza fuso non è un istante", () => {
    expect(() => check({ asOf: "2026-09-07 10:00" })).toThrow(/non è un istante ISO 8601 con fuso/);
    expect(() => check({ asOf: "2026-09-07T10:00:00+02:00" })).not.toThrow();
  });

  it("la qualità della fonte si dichiara", () => {
    expect(() => check({ sourceQuality: "" })).toThrow(/sourceQuality mancante/);
  });

  it("titolare e subentrante sono esiti che si escludono", () => {
    expect(() => check({ pStarter: 0.7, pSub: 0.5 })).toThrow(/superano 1/);
  });
});

// ── GOLDEN FIXTURE END-TO-END: la varianza del PUNTEGGIO, non della presenza.
//
// È la seconda metà di §2.1 del disegno, quella che la sola incertezza di
// presenza non sa produrre: due terzi difensori, uno che prende sempre 6,5 e
// uno che nove volte su dieci prende 4 e una volta su dieci prende 10, con un
// gol al 50 %. Il primo ha il punteggio atteso PIÙ ALTO e non vince mai; il
// secondo ha il punteggio atteso più basso e vince ogni tanto. La previsione
// puntuale sceglie il primo — la sua riga modale è migliore — e il livello 2
// si sposta sul secondo. È il motivo per cui il livello 1 è solo un innesco.
//
// I numeri sono costruiti come nella fixture di WP-1: tre difensori in campo
// (§19 non si attiva, servono quattro difensori con voto), cinque
// centrocampisti a 6,0 per parte (§20 dà zero), attaccanti a voto base 6,0
// (§21 li paga zero), stesso modulo per entrambi (§9 si annulla). La parte
// fissa vale 65 e il terzo difensore ci somma il suo punteggio.

const forecast = (
  id: string,
  role: PlayerForecast["role"],
  baseVote: number,
  fantasyScore: number,
  distribution?: PlayerDistribution,
): PlayerForecast => ({
  id,
  role,
  voteProbability: distribution?.pPlays ?? 1,
  expected: { baseVote, fantasyScore, receivedAnyBonus: fantasyScore > baseVote, missedPenalty: false },
  ...(distribution === undefined ? {} : { distribution }),
});

const STABLE: PlayerDistribution = {
  ...DISTRIBUTION_BASE,
  baseVote: [{ vote: 6.5, probability: 1 }],
};

const VARIABLE: PlayerDistribution = {
  ...DISTRIBUTION_BASE,
  baseVote: [
    { vote: 4, probability: 0.9 },
    { vote: 10, probability: 0.1 },
  ],
  events: { ...DISTRIBUTION_BASE.events, pGoal: 0.5 },
};

const SQUAD: readonly PlayerForecast[] = [
  forecast("P1", "P", 6, 6),
  // D1 e D2 valgono 9 e non si toccano: senza di loro il terzo posto in difesa
  // non sarebbe una scelta fra D3 e D4, sarebbe una scelta fra quattro terzetti.
  // La fixture deve isolare UNA decisione.
  forecast("D1", "D", 6, 9),
  forecast("D2", "D", 6, 9),
  forecast("D3", "D", 6.5, 6.5, STABLE),
  forecast("D4", "D", 4, 4, VARIABLE),
  forecast("C1", "C", 6, 6),
  forecast("C2", "C", 6, 6),
  forecast("C3", "C", 6, 6),
  forecast("C4", "C", 6, 6),
  // Zavorra: serve solo a riportare la parte fissa a 65 dopo i due difensori da
  // 9. Il voto base resta 6,0, quindi §20 continua a dare zero.
  forecast("C5", "C", 6, 2.5),
  forecast("A1", "A", 6, 6),
  forecast("A2", "A", 6, 6),
];

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
];

const OPPONENT_LINEUP: Lineup = {
  module: "352",
  goalkeeperId: "oP",
  starterIds: ["oD1", "oD2", "oD3", "oC1", "oC2", "oC3", "oC4", "oC5", "oA1", "oA2"],
  benchIds: [],
};

const CONTEXT = { matchday: 1, weAreHome: true } as const;

const propose = (extra: Partial<Parameters<typeof proposeLineup>[0]> = {}) =>
  proposeLineup({
    squad: SQUAD,
    opponent: { lineup: OPPONENT_LINEUP, players: OPPONENT_PLAYERS },
    context: CONTEXT,
    constraints: { lockedStarterIds: [], lockedModule: "352", locked: false },
    ...extra,
  });

describe("la varianza del punteggio decide, e la previsione puntuale no", () => {
  it("il difensore stabile vale 71,5 esatti e non vince mai", () => {
    const stabile = propose({
      constraints: { lockedStarterIds: [], locked: true },
      currentLineup: {
        module: "352",
        goalkeeperId: "P1",
        starterIds: ["D1", "D2", "D3", "C1", "C2", "C3", "C4", "C5", "A1", "A2"],
        benchIds: ["D4"],
      },
    });
    expect(stabile.estimate.method).toBe("sampled");
    // Non c'è niente di casuale in questa formazione: 6,5 con probabilità uno.
    expect(stabile.estimate.expectedOurTotal).toBe(71.5);
    expect(stabile.estimate.ourTotalVariance).toBe(0);
    expect(stabile.estimate.objectiveValue).toBe(0);
    expect(stabile.estimate.lossProbability).toBe(1);
  });

  it("la ricerca sceglie il difensore variabile: obiettivo più alto, media più bassa", () => {
    const proposta = propose();
    expect(proposta.feasible).toBe(true);
    const undici = [proposta.lineup?.goalkeeperId, ...(proposta.lineup?.starterIds ?? [])];
    // La previsione puntuale schierava il difensore stabile…
    expect(proposta.pointForecast.lineup?.starterIds).toContain("D3");
    expect(proposta.pointForecast.lineup?.starterIds).not.toContain("D4");
    // …e il livello 2, sugli scenari, si è spostato sull'altro.
    expect(undici).toContain("D4");
    expect(undici).not.toContain("D3");

    // I due numeri della tabella di §2.1, questa volta prodotti dalla ricerca:
    // 0,05 × 3 + 0,05 × 1 + 0,45 × 1 = 0,65 punti attesi, contro zero;
    // 65 + 6,1 = 71,1 di punteggio atteso, contro 71,5.
    expect(proposta.estimate.objectiveValue).toBeCloseTo(0.65, 1);
    expect(proposta.estimate.objectiveValue).toBeGreaterThan(0);
    expect(proposta.estimate.expectedOurTotal).toBeCloseTo(71.1, 1);
    expect(proposta.estimate.expectedOurTotal).toBeLessThan(71.5);
    expect(proposta.estimate.ourTotalVariance).toBeGreaterThan(0);
  });
});

describe("determinismo e scenari condivisi", () => {
  it("stesso seme, stesso risultato bit a bit; seme diverso, risultato diverso", () => {
    const uno = propose({ seed: 7 });
    const due = propose({ seed: 7 });
    expect(due.lineup).toEqual(uno.lineup);
    expect(due.estimate).toEqual(uno.estimate);
    expect(due.reason).toBe(uno.reason);

    const altro = propose({ seed: 8 });
    expect(altro.estimate.expectedOurTotal).not.toBe(uno.estimate.expectedOurTotal);
  });

  it("tutte le candidate della stessa giornata vedono gli STESSI scenari", () => {
    // La prova: la formazione scelta dalla ricerca, rivalutata da sola con
    // `locked`, deve dare gli stessi identici numeri. Se gli scenari fossero
    // rigenerati per candidata, i due conti differirebbero — e il confronto
    // fra formazioni misurerebbe il campionamento invece delle formazioni.
    const proposta = propose({ seed: 4242 });
    const rivalutata = propose({
      seed: 4242,
      constraints: { lockedStarterIds: [], locked: true },
      currentLineup: proposta.lineup as Lineup,
    });
    expect(rivalutata.estimate.objectiveValue).toBe(proposta.estimate.objectiveValue);
    expect(rivalutata.estimate.expectedOurTotal).toBe(proposta.estimate.expectedOurTotal);
    expect(rivalutata.estimate.ourTotalVariance).toBe(proposta.estimate.ourTotalVariance);
    expect(rivalutata.estimate.winProbability).toBe(proposta.estimate.winProbability);
  });

  it("una distribuzione impedisce l'enumerazione esatta, e lo dice", () => {
    // Un solo giocatore incerto starebbe nel budget, ma le combinazioni di voto
    // ed eventi no: fingere di enumerarle vorrebbe dire troncarle in silenzio.
    expect(propose({ scenarioBudget: 4096 }).estimate.method).toBe("sampled");
  });
});

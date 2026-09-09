import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  BASE_FORECAST_MARK,
  DECAY_HALF_LIFE_SEASONS,
  HISTORY_SEASONS,
  SHRINK_PSEUDO_OBSERVATIONS,
  type AppearanceEvents,
  type BaseForecast,
  type ExPostCeilingInput,
  type GameweekContext,
  type Lineup,
  type NoVoteKind,
  type ObservedHistory,
  type ObservedPlayerLine,
  type PlayerAppearance,
  type PlayerForecast,
  type Role,
  type TeamGameweek,
  bestElevenExPostPolicy,
  buildBaseForecasts,
  observedHistory,
  proposeLineup,
} from "../src/index.js";

// FIXTURE SINTETICHE. Identificatori costruiti (`LUNGO`, `DUE`, `SQUADRA_1`…),
// voti scelti a mano sulla griglia dei mezzi punti, nessun dato reale, nessuna
// rete, nessun orologio: `ASOF` è una stringa dichiarata e non viene mai
// confrontata con l'ora corrente.
//
// I NUMERI ATTESI SONO DERIVATI A MANO, non copiati da un'esecuzione. Ogni
// blocco che ne contiene uno porta il conto per esteso: è l'unico modo perché
// una formula sbagliata ma stabile non passi comunque.

const ASOF = "2026-09-07T18:00:00Z";
const PROVENANCE = "fixture sintetica — tabellini inventati per la prova";

const S0 = "STAGIONE_0";
const S1 = "STAGIONE_1";
const S2 = "STAGIONE_2";
const S3 = "STAGIONE_3";
const SEASONS = [S0, S1, S2, S3];

const noEvents: AppearanceEvents = {
  goal: false,
  assist: false,
  yellow: false,
  red: false,
  ownGoal: false,
  penaltyMissed: false,
  penaltySaved: false,
};

function voted(
  playerId: string,
  role: Role,
  season: string,
  gameweek: number,
  baseVote: number,
  over: Partial<AppearanceEvents> = {},
  started = true,
): PlayerAppearance {
  return {
    playerId,
    role,
    season,
    gameweek,
    voted: true,
    baseVote,
    started,
    events: { ...noEvents, ...over },
  };
}

function missed(
  playerId: string,
  role: Role,
  season: string,
  gameweek: number,
  noVoteKind: NoVoteKind = "clean",
  otherBonusMalus?: number,
): PlayerAppearance {
  return {
    playerId,
    role,
    season,
    gameweek,
    voted: false,
    noVoteKind,
    ...(otherBonusMalus === undefined ? {} : { otherBonusMalus }),
  };
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}

// ─── IL CORPO STORICO DELLA PROVA ─────────────────────────────────────────
//
// Tutto in `STAGIONE_0`, cioè a peso 1: il decadimento ha una prova sua e qui
// solo disturberebbe i conti a mano.
//
// RUOLO C — il pool verso cui tutti i centrocampisti vengono tirati:
//   C_RUOLO      40 giornate con voto, tutte 6
//   C_RUOLO_SV   10 giornate senza voto: 7 `clean`, 2 `booked`, 1 con
//                bonus/malus −2
//   LUNGO        30 giornate con voto, tutte 7           (storia lunga)
//   DUE           2 giornate con voto, tutte 8           (due presenze fortunate)
//   PANCHINARO   30 giornate: 3 con voto a 8, 27 senza voto (buone medie, non gioca)
//   ZERO_C        nessuna giornata                       (zero presenze)
//
// Totali di ruolo C: voto 40+30+2+3 = 75; senza voto 10+27 = 37; a disposizione
// 112. Voti: 6 → 40, 7 → 30, 8 → 5.
//
// RUOLO A — deliberatamente isolato: il solo `A_RUOLO`, così che `ZERO_A` (che
// non ha nemmeno una giornata) riceva ESATTAMENTE la distribuzione del ruolo e
// il conto si possa scrivere in una riga.
//   A_RUOLO      8 giornate con voto a 6, 2 senza voto `clean`
//
// RUOLO P e le squadre: due squadre da 20 giornate, `SQUADRA_1` non subisce mai
// gol e `SQUADRA_2` ne subisce sempre 2.

function corpusAppearances(): PlayerAppearance[] {
  const out: PlayerAppearance[] = [];
  for (const gw of range(1, 40)) out.push(voted("C_RUOLO", "C", S0, gw, 6));
  for (const gw of range(1, 7)) out.push(missed("C_RUOLO_SV", "C", S0, gw, "clean"));
  for (const gw of range(8, 9)) out.push(missed("C_RUOLO_SV", "C", S0, gw, "booked"));
  out.push(missed("C_RUOLO_SV", "C", S0, 10, "withOtherBonusMalus", -2));

  for (const gw of range(1, 30)) out.push(voted("LUNGO", "C", S0, gw, 7));
  for (const gw of range(1, 2)) out.push(voted("DUE", "C", S0, gw, 8));
  for (const gw of range(1, 3)) out.push(voted("PANCHINARO", "C", S0, gw, 8));
  for (const gw of range(4, 30)) out.push(missed("PANCHINARO", "C", S0, gw, "clean"));

  for (const gw of range(1, 8)) out.push(voted("A_RUOLO", "A", S0, gw, 6));
  for (const gw of range(9, 10)) out.push(missed("A_RUOLO", "A", S0, gw, "clean"));

  for (const gw of range(1, 8)) out.push(voted("P_RUOLO", "P", S0, gw, 6));
  for (const gw of range(9, 10)) out.push(missed("P_RUOLO", "P", S0, gw, "clean"));
  for (const gw of range(1, 20)) out.push(voted("PORTIERE_1", "P", S0, gw, 6));

  for (const gw of range(1, 12)) out.push(voted("D_RUOLO", "D", S0, gw, 6));
  for (const gw of range(13, 14)) out.push(missed("D_RUOLO", "D", S0, gw, "clean"));

  // `MISTO` vive su TRE stagioni, quindi i suoi pesi non sono interi: 1,
  // 0,5^(1/1,5) e 0,5^(2/1,5). È lui che rende la prova di determinismo
  // sensibile davvero — sommare venti pesi interi dà lo stesso numero in
  // qualunque ordine, sommare sessanta pesi irrazionali no, e senza l'ordine
  // canonico del modulo il confronto bit a bit fallirebbe.
  for (const season of [S0, S1, S2]) {
    for (const gw of range(1, 20)) out.push(voted("MISTO", "D", season, gw, gw % 2 === 0 ? 6 : 7));
  }

  return out;
}

function corpusTeams(): TeamGameweek[] {
  const out: TeamGameweek[] = [];
  for (const gw of range(1, 20)) out.push({ teamId: "SQUADRA_1", season: S0, gameweek: gw, goalsConceded: 0 });
  for (const gw of range(1, 20)) out.push({ teamId: "SQUADRA_2", season: S0, gameweek: gw, goalsConceded: 2 });
  return out;
}

function history(over: Partial<Parameters<typeof observedHistory>[0]> = {}): ObservedHistory {
  return observedHistory({
    seasons: SEASONS,
    appearances: corpusAppearances(),
    teamGameweeks: corpusTeams(),
    provenance: PROVENANCE,
    ...over,
  });
}

const SUBJECTS = [
  { playerId: "LUNGO", role: "C" as Role, teamId: "SQUADRA_1" },
  { playerId: "DUE", role: "C" as Role, teamId: "SQUADRA_1" },
  { playerId: "PANCHINARO", role: "C" as Role, teamId: "SQUADRA_1" },
  { playerId: "ZERO_C", role: "C" as Role, teamId: "SQUADRA_1" },
  { playerId: "ZERO_A", role: "A" as Role, teamId: "SQUADRA_1" },
  { playerId: "PORTIERE_1", role: "P" as Role, teamId: "SQUADRA_1" },
  { playerId: "PORTIERE_2", role: "P" as Role, teamId: "SQUADRA_2" },
  { playerId: "MISTO", role: "D" as Role, teamId: "SQUADRA_1" },
];

function forecasts(): ReadonlyMap<string, BaseForecast> {
  const built = buildBaseForecasts({ history: history(), players: SUBJECTS, asOf: ASOF });
  return new Map(built.map((f) => [f.playerId, f]));
}

/** La massa del voto `vote` nella distribuzione, o 0 se il voto non c'è. */
function massOf(f: BaseForecast, vote: number): number {
  const found = f.forecast.distribution?.baseVote.find((mass) => mass.vote === vote);
  return found === undefined ? 0 : found.probability;
}

const P12 = 12;

describe("previsione base — pochi dati non valgono quanto tanti (§6.2, shrink)", () => {
  it("chi ha una storia lunga porta il proprio voto: 7 al 85%", () => {
    // Conto a mano. Voti del ruolo C: 6 → 40/75, 7 → 30/75, 8 → 5/75.
    // LUNGO ha 30 giornate con voto, tutte a 7, quindi con K = 10:
    //   P(7) = (30 + 10·30/75) / (30 + 10) = 34/40 = 0,85
    //   P(6) = (0  + 10·40/75) / 40        = (40/7,5)/40 = 2/15
    //   P(8) = (0  + 10· 5/75) / 40        = 1/60
    const lungo = forecasts().get("LUNGO") as BaseForecast;
    expect(massOf(lungo, 7)).toBeCloseTo(0.85, P12);
    expect(massOf(lungo, 6)).toBeCloseTo(2 / 15, P12);
    expect(massOf(lungo, 8)).toBeCloseTo(1 / 60, P12);
    expect(lungo.forecast.expected.baseVote).toBe(7);
    // Il ruolo pesa un quarto: 10 osservazioni finte su 30 vere più 10.
    expect(lungo.evidence.priorSharePerformance).toBeCloseTo(0.25, P12);
  });

  it("DUE PRESENZE FORTUNATE NON VALGONO VENTI: due 8 non fanno un giocatore da 8", () => {
    // DUE ha esattamente due giornate, entrambe a 8 — il caso di inizio
    // stagione. Il conto:
    //   P(8) = (2 + 10·5/75) / (2 + 10) = (2 + 2/3)/12 = 2/9
    //   P(6) = (0 + 10·40/75)/12        = (16/3)/12    = 4/9
    //   P(7) = (0 + 10·30/75)/12        = 4/12         = 1/3
    // Il voto MODALE resta 6, cioè quello del ruolo: la sua fortuna sposta la
    // distribuzione, non la ribalta. Se lo shrink sparisse, P(8) diventerebbe 1
    // e questo test sarebbe rosso.
    const map = forecasts();
    const due = map.get("DUE") as BaseForecast;
    expect(due.evidence.votedInHistory).toBe(2);
    expect(massOf(due, 8)).toBeCloseTo(2 / 9, P12);
    expect(massOf(due, 6)).toBeCloseTo(4 / 9, P12);
    expect(massOf(due, 7)).toBeCloseTo(1 / 3, P12);
    expect(due.forecast.expected.baseVote).toBe(6);

    // E il confronto che è il punto: con 30 giornate il giocatore comanda, con
    // 2 comanda il ruolo.
    const lungo = map.get("LUNGO") as BaseForecast;
    expect(due.evidence.priorSharePerformance).toBeGreaterThan(lungo.evidence.priorSharePerformance);
    expect(due.evidence.priorSharePerformance).toBeCloseTo(10 / 12, P12);
  });

  it("ZERO PRESENZE: la previsione È quella del ruolo, e lo dice", () => {
    // `ZERO_A` non ha nemmeno una giornata, e il ruolo A contiene solo
    // `A_RUOLO`: 8 giornate con voto a 6, 2 senza voto. Quindi, esattamente:
    //   pPlays        = 8/10 = 0,8         (la frequenza del ruolo)
    //   P(voto 6)     = 1                  (l'unico voto osservato nel ruolo)
    //   svKind.clean  = 1
    // Nessun ripiego inventato: «non lo so» diventa «come il suo ruolo».
    const zeroA = forecasts().get("ZERO_A") as BaseForecast;
    const d = zeroA.forecast.distribution;
    expect(zeroA.evidence.gameweeksInHistory).toBe(0);
    expect(zeroA.evidence.votedInHistory).toBe(0);
    expect(zeroA.evidence.priorSharePerformance).toBe(1);
    expect(zeroA.evidence.priorShareAvailability).toBe(1);
    expect(d?.pPlays).toBeCloseTo(0.8, P12);
    expect(d?.baseVote).toEqual([{ vote: 6, probability: 1 }]);
    expect(d?.svKind.clean).toBeCloseTo(1, P12);
    expect(zeroA.forecast.expected.baseVote).toBe(6);
    expect(zeroA.forecast.expected.fantasyScore).toBe(6);
  });

  it("zero presenze in un ruolo affollato: la previsione è il pool del ruolo, non uno zero", () => {
    // `ZERO_C` non ha giornate ma il ruolo C sì: pPlays = 75/112, e la
    // distribuzione del voto è quella del ruolo (6 → 40/75, 7 → 30/75, 8 → 5/75).
    const zeroC = forecasts().get("ZERO_C") as BaseForecast;
    expect(zeroC.forecast.voteProbability).toBeCloseTo(75 / 112, P12);
    expect(massOf(zeroC, 6)).toBeCloseTo(40 / 75, P12);
    expect(massOf(zeroC, 7)).toBeCloseTo(30 / 75, P12);
    expect(massOf(zeroC, 8)).toBeCloseTo(5 / 75, P12);
    expect(zeroC.forecast.expected.baseVote).toBe(6);
  });

  it("il decadimento pesa meno le stagioni vecchie, e taglia quelle fuori finestra", () => {
    // Due giocatori identici tranne la stagione: uno gioca nella più recente,
    // l'altro due stagioni fa. Con mezza vita 1,5, il peso di due stagioni fa è
    // 0,5^(2/1,5) = 0,3968…, quindi il secondo resta più vicino al ruolo.
    const extra: PlayerAppearance[] = [];
    for (const gw of range(1, 10)) extra.push(voted("RECENTE", "C", S0, gw, 8));
    for (const gw of range(1, 10)) extra.push(voted("VECCHIO", "C", S2, gw, 8));
    // E uno che ha giocato SOLO fuori dalla finestra delle 3 stagioni: le sue
    // giornate non contano, e il modulo lo dichiara invece di nasconderlo.
    for (const gw of range(1, 10)) extra.push(voted("FUORI", "C", S3, gw, 8));

    const built = buildBaseForecasts({
      history: history({ appearances: [...corpusAppearances(), ...extra] }),
      players: [
        { playerId: "RECENTE", role: "C", teamId: "SQUADRA_1" },
        { playerId: "VECCHIO", role: "C", teamId: "SQUADRA_1" },
        { playerId: "FUORI", role: "C", teamId: "SQUADRA_1" },
      ],
      asOf: ASOF,
    });
    const [recente, vecchio, fuori] = built as readonly BaseForecast[];

    expect((recente as BaseForecast).evidence.performanceWeight).toBeCloseTo(10, P12);
    expect((vecchio as BaseForecast).evidence.performanceWeight).toBeCloseTo(
      10 * Math.pow(0.5, 2 / DECAY_HALF_LIFE_SEASONS),
      P12,
    );
    expect(massOf(recente as BaseForecast, 8)).toBeGreaterThan(massOf(vecchio as BaseForecast, 8));

    expect((fuori as BaseForecast).evidence.gameweeksInHistory).toBe(0);
    expect((fuori as BaseForecast).evidence.discardedOutOfWindow).toBe(10);
    expect((fuori as BaseForecast).evidence.performanceWeight).toBe(0);
    expect(HISTORY_SEASONS).toBe(3);
  });
});

describe("previsione base — giocare e rendere restano due domande diverse", () => {
  it("chi non gioca mai ha una disponibilità bassa e un rendimento alto: due numeri, non uno", () => {
    // `PANCHINARO`: 3 giornate con voto a 8 su 30 a disposizione. Le sue medie
    // sono migliori di quelle di `LUNGO` (8 contro 7), ma scende in campo un
    // decimo delle volte.
    //   pPlays(PANCHINARO) = (3 + 10·75/112) / (30 + 10) = 1086/4480
    //   pPlays(LUNGO)      = (30 + 10·75/112)/ (30 + 10) =  411/448
    // Il rendimento CONDIZIONATO A GIOCARE va nell'altro verso:
    //   P(8 | gioca) di PANCHINARO = (3 + 10·5/75)/(3+10) = 11/39
    //   P(8 | gioca) di LUNGO      = 1/60
    const map = forecasts();
    const panca = map.get("PANCHINARO") as BaseForecast;
    const lungo = map.get("LUNGO") as BaseForecast;

    expect(panca.forecast.voteProbability).toBeCloseTo(1086 / 4480, P12);
    expect(lungo.forecast.voteProbability).toBeCloseTo(411 / 448, P12);
    expect(panca.forecast.voteProbability).toBeLessThan(lungo.forecast.voteProbability / 3);

    expect(massOf(panca, 8)).toBeCloseTo(11 / 39, P12);
    expect(massOf(panca, 8)).toBeGreaterThan(massOf(lungo, 8));

    // LA PROVA CHE LE DUE DOMANDE NON SI SONO MESCOLATE: la distribuzione del
    // voto è condizionata a giocare, quindi somma a uno DA SOLA, senza che la
    // massa mancante sia finita in un voto basso. Se qualcuno moltiplicasse il
    // rendimento per la disponibilità — la «media pesata per la presenza» —
    // questa somma varrebbe 0,24 e il test sarebbe rosso.
    const total = (panca.forecast.distribution?.baseVote ?? []).reduce((s, m) => s + m.probability, 0);
    expect(total).toBeCloseTo(1, P12);
  });

  it("la disponibilità non tocca il voto modale, e il voto non tocca la disponibilità", () => {
    // Stessa storia di voti, disponibilità diversa: `SEMPRE` gioca 20 su 20,
    // `RARO` gioca 20 su 60. Il voto modale e la distribuzione condizionata
    // devono essere IDENTICI; solo `pPlays` cambia.
    const extra: PlayerAppearance[] = [];
    for (const gw of range(1, 20)) extra.push(voted("SEMPRE", "C", S0, gw, 7));
    for (const gw of range(1, 20)) extra.push(voted("RARO", "C", S0, gw, 7));
    for (const gw of range(21, 60)) extra.push(missed("RARO", "C", S0, gw, "clean"));

    const built = buildBaseForecasts({
      history: history({ appearances: [...corpusAppearances(), ...extra] }),
      players: [
        { playerId: "SEMPRE", role: "C", teamId: "SQUADRA_1" },
        { playerId: "RARO", role: "C", teamId: "SQUADRA_1" },
      ],
      asOf: ASOF,
    });
    const sempre = built[0] as BaseForecast;
    const raro = built[1] as BaseForecast;

    expect(raro.forecast.distribution?.baseVote).toEqual(sempre.forecast.distribution?.baseVote);
    expect(raro.forecast.expected.baseVote).toBe(sempre.forecast.expected.baseVote);
    expect(raro.forecast.voteProbability).toBeLessThan(sempre.forecast.voteProbability);
  });

  it("titolare e subentrante stanno sotto la disponibilità, non accanto", () => {
    const lungo = forecasts().get("LUNGO") as BaseForecast;
    const d = lungo.forecast.distribution;
    expect((d?.pStarter as number) + (d?.pSub as number)).toBeCloseTo(d?.pPlays as number, P12);
    expect((d?.pStarter as number) + (d?.pSub as number)).toBeLessThanOrEqual(1);
  });
});

describe("previsione base — ciò che il regolamento paga a sé", () => {
  it("i gol subiti sono della SQUADRA, e solo il portiere li paga", () => {
    // `SQUADRA_1` non subisce mai gol, `SQUADRA_2` ne subisce sempre due. Il
    // pool di tutte le squadre è metà e metà, quindi con K = 10 su 20 giornate:
    //   portiere di SQUADRA_1: P(0) = (20 + 10·0,5)/30 = 5/6, P(2) = 5/30 = 1/6
    //   portiere di SQUADRA_2: specchiato.
    // Il modale è 0 per il primo e 2 per il secondo, e §12-bis paga −1 per gol:
    // il secondo perde due punti nella riga modale.
    const map = forecasts();
    const p1 = map.get("PORTIERE_1") as BaseForecast;
    const p2 = map.get("PORTIERE_2") as BaseForecast;

    expect(p1.forecast.distribution?.events.goalsConceded).toBeDefined();
    const c1 = p1.forecast.distribution?.events.goalsConceded as readonly number[];
    expect(c1[0]).toBeCloseTo(5 / 6, P12);
    expect(c1[1]).toBeCloseTo(0, P12);
    expect(c1[2]).toBeCloseTo(1 / 6, P12);

    const c2 = p2.forecast.distribution?.events.goalsConceded as readonly number[];
    expect(c2[0]).toBeCloseTo(1 / 6, P12);
    expect(c2[2]).toBeCloseTo(5 / 6, P12);

    expect(p1.forecast.expected.fantasyScore).toBe(6);
    expect(p2.forecast.expected.fantasyScore).toBe(4);

    // E chi non è portiere non porta affatto quel campo: una riga così
    // significherebbe che il dato non ha la semantica attesa (§12-bis).
    expect((map.get("LUNGO") as BaseForecast).forecast.distribution?.events.goalsConceded).toBeUndefined();
  });

  it("le cinque fattispecie del senza voto sommano a uno, e il valore viene dal ruolo", () => {
    // Il ruolo C ha una sola occorrenza di `withOtherBonusMalus`, con valore
    // −2: è quello che ogni centrocampista eredita, perché una media personale
    // su una occorrenza sarebbe rumore.
    const panca = forecasts().get("PANCHINARO") as BaseForecast;
    const sv = panca.forecast.distribution?.svKind;
    const total =
      (sv?.clean as number) +
      (sv?.booked as number) +
      (sv?.sentOffDuringMatch as number) +
      (sv?.withOtherBonusMalus as number) +
      (sv?.sentOffAfterMatch as number);
    expect(total).toBeCloseTo(1, P12);
    expect(sv?.withOtherBonusMalus).toBeGreaterThan(0);
    expect(panca.forecast.distribution?.svOtherBonusMalus).toBeCloseTo(-2, P12);
  });

  it("un ruolo senza senza-voto osservati si ferma invece di ripiegare", () => {
    // «Niente default, mai»: le cinque fattispecie di §13 pagano punteggi
    // diversi, e sceglierne una d'ufficio sposterebbe punteggi interi.
    const appearances = corpusAppearances().filter((a) => a.role !== "D" || a.voted);
    expect(() =>
      buildBaseForecasts({
        history: history({ appearances }),
        players: [{ playerId: "D_RUOLO", role: "D", teamId: "SQUADRA_1" }],
        asOf: ASOF,
      }),
    ).toThrowError(/nessun senza voto osservato per il ruolo D/);
  });

  it("un ruolo mai osservato si ferma: non c'è niente verso cui tirare", () => {
    expect(() =>
      buildBaseForecasts({
        history: history({ appearances: corpusAppearances().filter((a) => a.role !== "D") }),
        players: [{ playerId: "ZERO_D", role: "D", teamId: "SQUADRA_1" }],
        asOf: ASOF,
      }),
    ).toThrowError(/nessuna giornata di ruolo D/);
  });

  it("un portiere senza nessuna giornata di squadra si ferma invece di regalare l'imbattibilità", () => {
    expect(() =>
      buildBaseForecasts({
        history: history({ teamGameweeks: [] }),
        players: [{ playerId: "PORTIERE_1", role: "P", teamId: "SQUADRA_1" }],
        asOf: ASOF,
      }),
    ).toThrowError(/nessuna giornata di squadra con gol subiti/);
  });

  it("una giornata letta due volte è un errore, non una media che conta doppio", () => {
    const doubled = [...corpusAppearances(), voted("LUNGO", "C", S0, 1, 7)];
    expect(() =>
      buildBaseForecasts({
        history: history({ appearances: doubled }),
        players: [{ playerId: "LUNGO", role: "C", teamId: "SQUADRA_1" }],
        asOf: ASOF,
      }),
    ).toThrowError(/ha due righe per la giornata 1/);
  });
});

describe("previsione base — determinismo", () => {
  it("stesso ingresso, stessa uscita: ordine delle righe e ordine delle richieste compresi", () => {
    const straight = buildBaseForecasts({ history: history(), players: SUBJECTS, asOf: ASOF });

    // L'ORDINE DEGLI INGRESSI CAMBIA, I NUMERI NO. Le righe si rovesciano, le
    // giornate di squadra pure, e le richieste si chiedono al contrario: se il
    // modulo sommasse nell'ordine ricevuto, la virgola mobile darebbe numeri
    // vicini ma non uguali, e `toEqual` — che confronta bit a bit — sarebbe rosso.
    const shuffledHistory = history({
      appearances: [...corpusAppearances()].reverse(),
      teamGameweeks: [...corpusTeams()].reverse(),
    });
    const reversed = buildBaseForecasts({
      history: shuffledHistory,
      players: [...SUBJECTS].reverse(),
      asOf: ASOF,
    });

    expect(reversed.map((f) => f.playerId)).toEqual([...SUBJECTS].reverse().map((p) => p.playerId));
    for (const one of straight) {
      const other = reversed.find((f) => f.playerId === one.playerId) as BaseForecast;
      expect(other).toEqual(one);
    }
  });

  it("due esecuzioni identiche danno lo stesso oggetto, campo per campo", () => {
    expect(buildBaseForecasts({ history: history(), players: SUBJECTS, asOf: ASOF })).toEqual(
      buildBaseForecasts({ history: history(), players: SUBJECTS, asOf: ASOF }),
    );
  });

  it("nessun orologio: `asOf` è quello dichiarato e nient'altro", () => {
    // Il modulo non legge l'ora: l'istante che esce è quello che è entrato.
    // Nessuna data letterale viene confrontata con l'ora corrente, qui o altrove.
    const other = "2020-01-02T03:04:05+02:00";
    const built = buildBaseForecasts({ history: history(), players: SUBJECTS, asOf: other });
    for (const f of built) expect(f.forecast.distribution?.asOf).toBe(other);
  });
});

describe("previsione base — il consumatore la accetta com'è", () => {
  it("il produttore di formazione la consuma e propone una formazione", () => {
    // WP-1/WP-2 sono già su `main`: qui si prova che l'uscita di WP-4 entra in
    // `proposeLineup` senza adattatori. Rosa sintetica di 25, avversario
    // sintetico di 25, budget di scenari ridotto perché il test misuri
    // l'integrazione e non la potenza della macchina.
    const roles: readonly (readonly [Role, number])[] = [
      ["P", 3],
      ["D", 8],
      ["C", 8],
      ["A", 6],
    ];
    const appearances = corpusAppearances();
    const squad: { playerId: string; role: Role; teamId: string }[] = [];
    const theirs: { playerId: string; role: Role; teamId: string }[] = [];
    for (const [role, count] of roles) {
      for (let i = 1; i <= count; i += 1) {
        for (const [prefix, list] of [
          ["N", squad],
          ["L", theirs],
        ] as const) {
          const id = `${prefix}${role}${i}`;
          // Storia deterministica: da 6 a 10 giornate, voti che ruotano su una
          // lista fissa. Nessun caso, nessuna data.
          const votes = [5.5, 6, 6.5, 7, 6];
          for (let gw = 1; gw <= 6 + (i % 5); gw += 1) {
            appearances.push(voted(id, role, S0, gw, votes[(gw + i) % votes.length] as number));
          }
          appearances.push(missed(id, role, S0, 20, "clean"));
          list.push({ playerId: id, role, teamId: prefix === "N" ? "SQUADRA_1" : "SQUADRA_2" });
        }
      }
    }

    const built = buildBaseForecasts({
      history: history({ appearances }),
      players: [...squad, ...theirs],
      asOf: ASOF,
    });
    const ours = built.filter((f) => f.playerId.startsWith("N")).map((f) => f.forecast);
    const opponent = built.filter((f) => f.playerId.startsWith("L")).map((f) => f.forecast);
    const theirLineup: Lineup = {
      module: "442",
      goalkeeperId: "LP1",
      starterIds: ["LD1", "LD2", "LD3", "LD4", "LC1", "LC2", "LC3", "LC4", "LA1", "LA2"],
      benchIds: ["LP2", "LD5", "LC5", "LA3"],
    };
    const context: GameweekContext = { matchday: 5, weAreHome: true };

    const proposal = proposeLineup({
      squad: ours,
      opponent: { lineup: theirLineup, players: opponent },
      context,
      scenarioBudget: 64,
    });

    expect(proposal.feasible).toBe(true);
    expect(proposal.lineup?.starterIds).toHaveLength(10);
    // E due esecuzioni con lo stesso seme restano identiche: il determinismo
    // della previsione non è annullato da quello del produttore.
    const again = proposeLineup({
      squad: ours,
      opponent: { lineup: theirLineup, players: opponent },
      context,
      scenarioBudget: 64,
    });
    expect(again.lineup).toEqual(proposal.lineup);
  });

  it("ogni previsione porta la targa che dice PREVISIONE, e la provenienza dello storico", () => {
    for (const f of forecasts().values()) {
      expect(f.forecast.distribution?.sourceQuality).toContain(BASE_FORECAST_MARK);
      expect(f.forecast.distribution?.sourceQuality).toContain(PROVENANCE);
      expect(f.evidence.reason).toContain(BASE_FORECAST_MARK);
    }
    expect(BASE_FORECAST_MARK).toContain("NON è un'osservazione");
    expect(SHRINK_PSEUDO_OBSERVATIONS).toBe(10);
  });
});

describe("previsione base — una previsione non è un'osservazione", () => {
  it("`tsc --noEmit` rifiuta di far passare questa previsione per un voto letto", () => {
    // COME SI LEGGE QUESTO TEST. Cinque `@ts-expect-error`, e sono asserzioni
    // del COMPILATORE, non di vitest: se una di quelle costruzioni tornasse a
    // compilare, `tsc` segnalerebbe una direttiva inutilizzata e
    // `npm run typecheck` — il PRIMO comando di `npm run verify` — sarebbe
    // rosso prima ancora che vitest parta. Il corpo esiste per tenere i
    // tentativi dentro un file che si esegue davvero, e per dire che gli
    // oggetti rifiutati non sono inventati: sono esattamente quelli che questo
    // modulo consegna.
    const lungo = forecasts().get("LUNGO") as BaseForecast;

    // 1) LA RIGA DI GIORNATA COSTRUITA DALLA PREVISIONE — la stessa forma che
    //    `expectedLine()` consegna al simulatore — non è un voto osservato.
    const forecastLine = {
      id: lungo.forecast.id,
      role: lungo.forecast.role,
      baseVote: lungo.forecast.expected.baseVote,
      fantasyScore: lungo.forecast.expected.fantasyScore,
      receivedAnyBonus: lungo.forecast.expected.receivedAnyBonus,
      missedPenalty: lungo.forecast.expected.missedPenalty,
    };
    // @ts-expect-error — previsione dove si aspettano voti osservati.
    const asObserved: ObservedPlayerLine = forecastLine;

    // 2) E nemmeno in blocco, dalle due porte del tetto ex-post.
    // @ts-expect-error — il tetto non accetta righe di previsione.
    const asCeilingSquad: ExPostCeilingInput["squadLines"] = [forecastLine];
    // @ts-expect-error — e nemmeno dalla porta di servizio, la mappa di tutti.
    const asCeilingPlayers: ExPostCeilingInput["players"] = new Map([[lungo.playerId, forecastLine]]);

    // 3) NEL VERSO DEL PREVISORE: l'uscita di un motore non rientra come
    //    storico. Il corpo storico non si scrive in un letterale, perché il
    //    sigillo è un simbolo che questo file non può nominare — la porta
    //    prevista resta `observedHistory()`.
    // @ts-expect-error — manca il sigillo, e nessun letterale può nominarlo.
    const forgedHistory: ObservedHistory = {
      seasons: SEASONS,
      appearances: [],
      teamGameweeks: [],
      origin: "OBSERVED",
      provenance: "targa scritta a mano su uno storico qualunque",
    };
    // @ts-expect-error — e quindi nemmeno la funzione lo accetta.
    const wouldNotCompile = (): unknown => buildBaseForecasts({ history: {}, players: [], asOf: ASOF });

    expect(asObserved.id).toBe("LUNGO");
    expect(asCeilingSquad).toHaveLength(1);
    expect(asCeilingPlayers.size).toBe(1);
    expect(forgedHistory.origin).toBe("OBSERVED");
    expect(typeof wouldNotCompile).toBe("function");
  });

  it("un cast attraversa il tipo ma non la guardia: il tetto ex-post rifiuta questa previsione", () => {
    // IL VARCO CHE IL SIGILLO NON CHIUDE, E CHI LO CHIUDE AL SUO POSTO. Un tipo
    // nominale in TypeScript ferma l'ASSEGNAZIONE, non chi scrive il cast: qui
    // il cast si scrive apposta, con le righe VERE di questa previsione, e a
    // fermarlo è la guardia a runtime del tetto — quella che pretende la targa
    // che solo `observedLines()` appiccica.
    const built = buildBaseForecasts({ history: history(), players: SUBJECTS, asOf: ASOF });
    const forced = built.map(
      (f) =>
        ({
          id: f.forecast.id,
          role: f.forecast.role,
          baseVote: f.forecast.expected.baseVote,
          fantasyScore: f.forecast.expected.fantasyScore,
          receivedAnyBonus: f.forecast.expected.receivedAnyBonus,
          missedPenalty: f.forecast.expected.missedPenalty,
        }) as unknown as ObservedPlayerLine,
    );
    const theirLineup: Lineup = {
      module: "442",
      goalkeeperId: "PORTIERE_2",
      starterIds: [],
      benchIds: [],
    };

    expect(() =>
      bestElevenExPostPolicy({
        squadLines: forced,
        theirLineup,
        players: new Map(forced.map((line) => [line.id, line])),
        context: { matchday: 5, weAreHome: true },
      }),
    ).toThrowError(/non porta una provenienza dichiarata/);
  });

  it("uno storico senza targa non produce previsioni: la guardia scatta prima di ogni conto", () => {
    // Il cast DIMENTICO — chi attraversa `ObservedHistory` senza passare da
    // `observedHistory()` e quindi non porta nemmeno la provenienza.
    const forged = {
      seasons: SEASONS,
      appearances: corpusAppearances(),
      teamGameweeks: corpusTeams(),
      origin: "OBSERVED",
    } as unknown as ObservedHistory;

    expect(() => buildBaseForecasts({ history: forged, players: SUBJECTS, asOf: ASOF })).toThrowError(
      /non porta una provenienza dichiarata/,
    );
    expect(() =>
      observedHistory({ seasons: SEASONS, appearances: [], teamGameweeks: [], provenance: "   " }),
    ).toThrowError(/la provenienza dello storico non è dichiarata/);
  });

  it("le guardie di tipo esistono, e una loro rimozione si vede nel diff", () => {
    // Mordono a `tsc --noEmit` e vivono accanto al modulo che produce le
    // previsioni; questo test impedisce che spariscano in silenzio insieme al
    // varco che riaprirebbero.
    const SOURCE = readFileSync(new URL("../src/baseForecast.ts", import.meta.url), "utf8");
    expect(SOURCE).toContain("type AssertBaseForecastLineIsNotObserved");
    expect(SOURCE).toContain("type AssertCeilingRefusesBaseForecast");
    expect(SOURCE).toContain("type AssertPlainHistoryIsNotObserved");
    // Il sigillo NON esce dal modulo: se venisse esportato, un letterale
    // qualunque potrebbe nominarlo e il tipo tornerebbe strutturale, cioè
    // tornerebbe a essere un commento.
    expect(SOURCE).toContain("declare const OBSERVED_HISTORY_SEAL: unique symbol;");
    expect(SOURCE).not.toContain("export declare const OBSERVED_HISTORY_SEAL");
    // E la base resta cieca al contesto di partita (§6.2) e all'orologio:
    // nessuna di queste cose entra nel CODICE finché qualcuno non decide che il
    // motore ricco ha dimostrato di saperle usare. Il confronto si fa sulle
    // sole righe di codice, perché i commenti del modulo NOMINANO apposta ciò
    // che non usano — una guardia che leggesse anche quelli sarebbe rossa per
    // aver letto la propria dichiarazione di innocenza.
    const CODE = SOURCE.split("\n")
      .filter((line) => {
        const trimmed = line.trimStart();
        return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
      })
      .join("\n");
    expect(CODE).not.toContain("weAreHome");
    expect(CODE).not.toContain("Math.random");
    expect(CODE).not.toContain("Date.now");
    expect(CODE).not.toContain("new Date");
    expect(CODE).not.toContain("fetch(");
  });
});

describe("previsione base — la riga modale e la distribuzione dicono la stessa cosa", () => {
  it("il voto modale è un massimo della distribuzione, per ogni giocatore", () => {
    // `assertPlayerDistribution` lo pretende, e il modulo lo chiama su ogni
    // uscita: questo test lo rende visibile invece che implicito.
    for (const f of forecasts().values()) {
      const masses = f.forecast.distribution?.baseVote ?? [];
      const top = Math.max(...masses.map((m) => m.probability));
      const modes = masses.filter((m) => m.probability === top).map((m) => m.vote);
      expect(modes).toContain(f.forecast.expected.baseVote);
      expect(f.forecast.distribution?.pPlays).toBe(f.forecast.voteProbability);
    }
  });

  it("un bonus che non è più probabile che no non entra nella riga modale, ma resta nella distribuzione", () => {
    // Scelta dichiarata (d) in testa al modulo: la riga modale è modale fino in
    // fondo. `BOMBER` segna in 8 giornate su 20, quindi P(gol) ≈ 0,4 e la riga
    // modale non gli dà il gol; la distribuzione sì, ed è quella che il livello
    // 2 usa per decidere. Il flag di §21 e il punteggio escono dalla STESSA
    // configurazione, quindi non possono contraddirsi.
    const extra: PlayerAppearance[] = [];
    for (const gw of range(1, 8)) extra.push(voted("BOMBER", "A", S0, gw, 6, { goal: true }));
    for (const gw of range(9, 20)) extra.push(voted("BOMBER", "A", S0, gw, 6));
    // E uno che segna quasi sempre: 18 su 20, quindi il gol entra anche nella
    // riga modale — con il flag, altrimenti §21 lo pagherebbe due volte.
    for (const gw of range(1, 18)) extra.push(voted("INFALLIBILE", "A", S0, gw, 6, { goal: true }));
    for (const gw of range(19, 20)) extra.push(voted("INFALLIBILE", "A", S0, gw, 6));

    const built = buildBaseForecasts({
      history: history({ appearances: [...corpusAppearances(), ...extra] }),
      players: [
        { playerId: "BOMBER", role: "A", teamId: "SQUADRA_1" },
        { playerId: "INFALLIBILE", role: "A", teamId: "SQUADRA_1" },
      ],
      asOf: ASOF,
    });
    const bomber = built[0] as BaseForecast;
    const infallibile = built[1] as BaseForecast;

    expect(bomber.forecast.distribution?.events.pGoal).toBeGreaterThan(0.2);
    expect(bomber.forecast.distribution?.events.pGoal).toBeLessThan(0.5);
    expect(bomber.forecast.expected.receivedAnyBonus).toBe(false);
    expect(bomber.forecast.expected.fantasyScore).toBe(bomber.forecast.expected.baseVote);

    expect(infallibile.forecast.distribution?.events.pGoal).toBeGreaterThan(0.5);
    expect(infallibile.forecast.expected.receivedAnyBonus).toBe(true);
    expect(infallibile.forecast.expected.fantasyScore).toBe(infallibile.forecast.expected.baseVote + 3);
  });

  it("una previsione consegnata è già passata dal controllo del consumatore", () => {
    // Il modulo chiama `assertPlayerDistribution` su ogni uscita: se una
    // distribuzione non sommasse a uno, o se il voto modale non fosse un
    // massimo, l'errore uscirebbe qui col nome del giocatore invece che dentro
    // `proposeLineup` dodici passaggi più in là. La contro-prova è che il
    // produttore accetta senza lamentarsi le stesse previsioni.
    const built = buildBaseForecasts({ history: history(), players: SUBJECTS, asOf: ASOF });
    const squad: readonly PlayerForecast[] = built.map((f) => f.forecast);
    for (const f of squad) {
      expect(f.distribution).toBeDefined();
      expect(f.expected.receivedAnyBonus).toBeTypeOf("boolean");
      expect(f.expected.missedPenalty).toBeTypeOf("boolean");
    }
  });
});

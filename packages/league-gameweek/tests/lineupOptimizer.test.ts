import { describe, it, expect } from "vitest";
import {
  type GameweekContext,
  type Lineup,
  type PlayerLine,
  type Role,
  bestLineupExPost,
  combinations,
  compareOutcomesWithoutDeclaredPoints,
  leaguePointsOf,
  lineupRegret,
  objectiveValue,
  resultSign,
  simulateGameweek,
} from "../src/index.js";

// FIXTURE SINTETICHE: identificatori costruiti, voti scelti a mano.

const p = (id: string, role: Role, baseVote: number | null, fantasyScore: number | null = baseVote): PlayerLine => ({
  id,
  role,
  baseVote,
  fantasyScore,
});

/**
 * Rosa nostra: due portieri, sei difensori, sei centrocampisti, quattro
 * attaccanti. I voti crescono con il numero, così «il migliore» è sempre
 * identificabile a occhio nel test.
 */
function ourSquad(): PlayerLine[] {
  return [
    p("P1", "P", 6),
    p("P2", "P", 7),
    p("D1", "D", 5),
    p("D2", "D", 5.5),
    p("D3", "D", 6),
    p("D4", "D", 6.5),
    p("D5", "D", 7),
    p("D6", "D", 7.5),
    p("C1", "C", 5),
    p("C2", "C", 5.5),
    p("C3", "C", 6),
    p("C4", "C", 6.5),
    p("C5", "C", 7),
    p("C6", "C", 7.5),
    p("A1", "A", 5),
    p("A2", "A", 6),
    p("A3", "A", 7),
    p("A4", "A", 8),
  ];
}

/** Rosa avversaria piatta a 6, schierata 4-4-2. */
function theirSquad(): PlayerLine[] {
  const out: PlayerLine[] = [p("oP1", "P", 6)];
  for (let i = 1; i <= 4; i += 1) out.push(p(`oD${i}`, "D", 6));
  for (let i = 1; i <= 4; i += 1) out.push(p(`oC${i}`, "C", 6));
  out.push(p("oA1", "A", 6));
  // Un attaccante avversario da 4,5: serve a portare il loro totale a 65,5,
  // cioè appena sotto la soglia del primo goal. È lì che il modificatore
  // modulo smette di essere un dettaglio e diventa un risultato.
  out.push(p("oA2", "A", 4.5));
  return out;
}

const THEIR_LINEUP: Lineup = {
  module: "442",
  goalkeeperId: "oP1",
  starterIds: ["oD1", "oD2", "oD3", "oD4", "oC1", "oC2", "oC3", "oC4", "oA1", "oA2"],
  benchIds: [],
};

const CONTEXT: GameweekContext = { matchday: 10, weAreHome: true };
const allPlayers = (): Map<string, PlayerLine> =>
  new Map([...ourSquad(), ...theirSquad()].map((line) => [line.id, line]));

describe("combinazioni", () => {
  it("le genera tutte, senza ripetizioni e in ordine deterministico", () => {
    expect(combinations([1, 2, 3], 2)).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
    expect(combinations([1, 2, 3, 4, 5, 6, 7, 8, 9], 5)).toHaveLength(126);
    expect(combinations([1, 2], 0)).toEqual([[]]);
    expect(combinations([1, 2], 3)).toEqual([]);
  });
});

describe("miglior formazione ex-post", () => {
  it("sceglie i giocatori migliori del loro ruolo", () => {
    const best = bestLineupExPost({
      squad: ourSquad(),
      theirLineup: THEIR_LINEUP,
      players: allPlayers(),
      context: CONTEXT,
    });
    expect(best.feasible).toBe(true);
    const ids = new Set([best.lineup!.goalkeeperId, ...best.lineup!.starterIds]);
    // I peggiori del loro ruolo non devono essere in campo.
    expect(ids.has("D1")).toBe(false);
    expect(ids.has("C1")).toBe(false);
    expect(ids.has("A1")).toBe(false);
    // Il portiere migliore sì.
    expect(best.lineup!.goalkeeperId).toBe("P2");
  });

  it("massimizza il RISULTATO, non il nostro punteggio: qui un punto in più costa la vittoria", () => {
    // Fixture costruita perché i due criteri cadano su moduli diversi, e perché
    // la differenza sia il risultato e non un decimale.
    //
    // Nostra rosa: portiere e quattro difensori da 5 (media sotto il 6, quindi
    // modificatore difesa a zero in ogni modulo), quattro centrocampisti da 6,
    // attaccanti 8 / 7,5 / 5,5. Loro: undici da 6 tranne un attaccante da 4,5,
    // che porta il loro totale appena sotto la soglia del primo goal.
    //
    //   4-4-2 -> noi 70, loro 65,5  =>  1-0, VITTORIA
    //   3-4-3 -> noi 70,5, loro 67  =>  1-1, pareggio
    //
    // Il 3-4-3 segna mezzo punto in più e regala 1,5 punti all'avversario: con
    // quei 1,5 punti loro superano il 66 e trovano il goal che pareggia. Un
    // ottimizzatore che massimizzasse `ours.total` sceglierebbe il 3-4-3 e
    // trasformerebbe una vittoria in un pareggio — è l'errore che la review
    // critica ha trovato nell'impianto del recap, ed è la ragione di questo test.
    const rosa: PlayerLine[] = [
      p("P1", "P", 5),
      p("D1", "D", 5),
      p("D2", "D", 5),
      p("D3", "D", 5),
      p("D4", "D", 5),
      p("C1", "C", 6),
      p("C2", "C", 6),
      p("C3", "C", 6),
      p("C4", "C", 6),
      p("A1", "A", 8),
      p("A2", "A", 7.5),
      p("A3", "A", 5.5),
    ];
    const players = new Map([...rosa, ...theirSquad()].map((l) => [l.id, l]));

    const outcomeOf = (module: "442" | "343", starters: readonly string[]) =>
      simulateGameweek({
        ourLineup: { module, goalkeeperId: "P1", starterIds: [...starters], benchIds: [] },
        theirLineup: THEIR_LINEUP,
        players,
        context: CONTEXT,
      });

    const out442 = outcomeOf("442", ["D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A1", "A2"]);
    const out343 = outcomeOf("343", ["D1", "D2", "D3", "C1", "C2", "C3", "C4", "A1", "A2", "A3"]);

    // Le premesse del test, verificate e non assunte.
    expect(out343.ours.total).toBeGreaterThan(out442.ours.total); // 70,5 > 70
    expect([out442.ourGoals, out442.theirGoals]).toEqual([1, 0]); // vittoria
    expect([out343.ourGoals, out343.theirGoals]).toEqual([1, 1]); // pareggio
    expect(out343.theirs.moduleFromOpponent).toBe(1.5); // il regalo che pareggia

    const best = bestLineupExPost({ squad: rosa, theirLineup: THEIR_LINEUP, players, context: CONTEXT });
    expect(best.lineup!.module).toBe("442");
    expect(best.outcome!.ourGoals).toBeGreaterThan(best.outcome!.theirGoals);
    // E il massimo scelto NON è il massimo del nostro punteggio.
    expect(best.outcome!.ours.total).toBeLessThan(out343.ours.total);
  });

  it("non produce una formazione monca quando i giocatori con voto non bastano", () => {
    const scarsa = ourSquad().map((line) => (line.role === "A" ? { ...line, baseVote: null, fantasyScore: null } : line));
    const best = bestLineupExPost({
      squad: scarsa,
      theirLineup: THEIR_LINEUP,
      players: new Map([...scarsa, ...theirSquad()].map((l) => [l.id, l])),
      context: CONTEXT,
    });
    expect(best.feasible).toBe(false);
    expect(best.lineup).toBeNull();
    expect(best.reason).toMatch(/insufficienti/);
  });

  it("è deterministica: due chiamate identiche danno la stessa formazione", () => {
    const first = bestLineupExPost({
      squad: ourSquad(),
      theirLineup: THEIR_LINEUP,
      players: allPlayers(),
      context: CONTEXT,
    });
    const second = bestLineupExPost({
      squad: ourSquad(),
      theirLineup: THEIR_LINEUP,
      players: allPlayers(),
      context: CONTEXT,
    });
    expect(second.lineup).toEqual(first.lineup);
    expect(second.outcome!.ours.total).toBe(first.outcome!.ours.total);
  });

  it("nessuna formazione legale batte quella dichiarata migliore, provato per forza bruta su un modulo", () => {
    // Controprova indipendente della separabilità: per il 4-4-2 si enumerano
    // TUTTE le formazioni e si verifica che nessuna superi il massimo trovato.
    const squad = ourSquad();
    const players = allPlayers();
    const best = bestLineupExPost({
      squad,
      theirLineup: THEIR_LINEUP,
      players,
      context: CONTEXT,
      onlyModule: "442",
    });
    const value = (o: ReturnType<typeof simulateGameweek>): number => objectiveValue(o, null).value;
    const keepers = squad.filter((l) => l.role === "P");
    const defenders = squad.filter((l) => l.role === "D");
    const midfielders = squad.filter((l) => l.role === "C");
    const strikers = squad.filter((l) => l.role === "A");
    let brute = -Infinity;
    for (const k of keepers) {
      for (const d of combinations(defenders, 4)) {
        for (const c of combinations(midfielders, 4)) {
          for (const a of combinations(strikers, 2)) {
            const starters = [...d, ...c, ...a];
            const chosen = new Set([k.id, ...starters.map((x) => x.id)]);
            const lineup: Lineup = {
              module: "442",
              goalkeeperId: k.id,
              starterIds: starters.map((x) => x.id),
              benchIds: squad.filter((x) => !chosen.has(x.id)).map((x) => x.id),
            };
            brute = Math.max(brute, value(simulateGameweek({ ourLineup: lineup, theirLineup: THEIR_LINEUP, players, context: CONTEXT })));
          }
        }
      }
    }
    expect(value(best.outcome!)).toBe(brute);
  });
});

describe("regret", () => {
  it("è zero per la formazione ottima e positivo per una peggiore", () => {
    const players = allPlayers();
    const best = bestLineupExPost({ squad: ourSquad(), theirLineup: THEIR_LINEUP, players, context: CONTEXT });
    const optimal = simulateGameweek({
      ourLineup: best.lineup!,
      theirLineup: THEIR_LINEUP,
      players,
      context: CONTEXT,
    });
    expect(lineupRegret(optimal, best).scoreRegret).toBe(0);

    const scarsa: Lineup = {
      module: "442",
      goalkeeperId: "P1",
      starterIds: ["D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A1", "A2"],
      benchIds: ["P2", "D5", "C5", "A3"],
    };
    const chosen = simulateGameweek({ ourLineup: scarsa, theirLineup: THEIR_LINEUP, players, context: CONTEXT });
    const regret = lineupRegret(chosen, best);
    expect(regret.comparable).toBe(true);
    expect(regret.scoreRegret).toBeGreaterThan(0);
    expect(regret.bestTotal).toBeGreaterThan(regret.chosenTotal);
  });

  it("non è mai negativo", () => {
    const players = allPlayers();
    const best = bestLineupExPost({ squad: ourSquad(), theirLineup: THEIR_LINEUP, players, context: CONTEXT });
    const optimal = simulateGameweek({ ourLineup: best.lineup!, theirLineup: THEIR_LINEUP, players, context: CONTEXT });
    expect(lineupRegret(optimal, best).goalRegret).toBeGreaterThanOrEqual(0);
  });

  it("si dichiara non comparabile se la formazione scelta ha titolari senza voto scoperti", () => {
    const rosa = ourSquad().map((l) => (l.id === "A2" ? { ...l, baseVote: null, fantasyScore: null } : l));
    const players = new Map([...rosa, ...theirSquad()].map((l) => [l.id, l]));
    const scoperta: Lineup = {
      module: "442",
      goalkeeperId: "P1",
      starterIds: ["D1", "D2", "D3", "D4", "C1", "C2", "C3", "C4", "A1", "A2"],
      benchIds: [],
    };
    const chosen = simulateGameweek({ ourLineup: scoperta, theirLineup: THEIR_LINEUP, players, context: CONTEXT });
    const best = bestLineupExPost({ squad: rosa, theirLineup: THEIR_LINEUP, players, context: CONTEXT });
    const regret = lineupRegret(chosen, best);
    expect(regret.comparable).toBe(false);
    expect(regret.reason).toMatch(/non è quello ufficiale/);
  });
});

describe("funzione obiettivo", () => {
  const players = allPlayers();
  const vinta: Lineup = {
    module: "442",
    goalkeeperId: "P2",
    starterIds: ["D6", "D5", "D4", "D3", "C6", "C5", "C4", "C3", "A4", "A3"],
    benchIds: [],
  };

  it("con i punti dichiarati li usa, e li dichiara nell'etichetta", () => {
    const outcome = simulateGameweek({ ourLineup: vinta, theirLineup: THEIR_LINEUP, players, context: CONTEXT });
    const value = leaguePointsOf(outcome, { win: 3, draw: 1, loss: 0 });
    expect(value.objective).toBe("LEAGUE_POINTS");
    expect(value.label).toContain("V 3");
    expect([3, 1, 0]).toContain(value.value);
  });

  it("senza punti dichiarati NON inventa il 3-1-0 e dice che cosa sta usando", () => {
    const outcome = simulateGameweek({ ourLineup: vinta, theirLineup: THEIR_LINEUP, players, context: CONTEXT });
    const value = objectiveValue(outcome, null);
    expect(value.objective).toBe("GOALS_THEN_SCORE");
    expect(value.label).toMatch(/NON è la funzione obiettivo/);
  });

  it("senza punti dichiarati una vittoria batte un pareggio, anche con meno punteggio", () => {
    // L'ordine è quello dei criteri di classifica del regolamento meno i punti:
    // esito, poi punteggio totale, poi differenza reti. Un pareggio con più
    // punti NON supera una vittoria.
    const vittoriaMagra = { ourGoals: 1, theirGoals: 0, ours: { total: 68 } } as never as import("../src/index.js").GameweekOutcome;
    const pareggioRicco = { ourGoals: 2, theirGoals: 2, ours: { total: 90 } } as never as import("../src/index.js").GameweekOutcome;
    expect(objectiveValue(vittoriaMagra, null).value).toBeGreaterThan(objectiveValue(pareggioRicco, null).value);
    expect(compareOutcomesWithoutDeclaredPoints(vittoriaMagra, pareggioRicco)).toBeLessThan(0);
    expect(resultSign(vittoriaMagra)).toBe(1);
    expect(resultSign(pareggioRicco)).toBe(0);
  });

  it("a parità di esito comanda il punteggio totale, non la differenza reti", () => {
    const strettaMaAlta = { ourGoals: 2, theirGoals: 1, ours: { total: 80 } } as never as import("../src/index.js").GameweekOutcome;
    const larghaMaBassa = { ourGoals: 3, theirGoals: 0, ours: { total: 75 } } as never as import("../src/index.js").GameweekOutcome;
    expect(compareOutcomesWithoutDeclaredPoints(strettaMaAlta, larghaMaBassa)).toBeLessThan(0);
  });

  it("i punti dichiarati cambiano davvero il criterio, non solo l'etichetta", () => {
    const outcome = simulateGameweek({ ourLineup: vinta, theirLineup: THEIR_LINEUP, players, context: CONTEXT });
    const conPunti = objectiveValue(outcome, { win: 3, draw: 1, loss: 0 }).value;
    const senzaPunti = objectiveValue(outcome, null).value;
    expect(conPunti).not.toBe(senzaPunti);
  });
});

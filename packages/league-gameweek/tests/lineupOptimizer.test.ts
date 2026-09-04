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
  LEAGUE_POINTS,
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
    const value = (o: ReturnType<typeof simulateGameweek>): number => objectiveValue(o, LEAGUE_POINTS).value;
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

  it("coi punti di lega due vittorie non sono la stessa cosa: il pareggio lo rompe il punteggio", () => {
    // 3/1/0 è un obiettivo piatto — ogni vittoria vale 3 — e da solo lascerebbe
    // l'ottimizzatore indifferente fra una vittoria coi migliori e una coi
    // peggiori. §22 mette «somma punteggio totale» subito dopo i punti.
    const vittoriaRicca = { ourGoals: 2, theirGoals: 1, ours: { total: 90 } } as never as import("../src/index.js").GameweekOutcome;
    const vittoriaMagra = { ourGoals: 2, theirGoals: 1, ours: { total: 70 } } as never as import("../src/index.js").GameweekOutcome;
    expect(objectiveValue(vittoriaRicca, LEAGUE_POINTS).value).toBeGreaterThan(
      objectiveValue(vittoriaMagra, LEAGUE_POINTS).value,
    );
    // Ma nessun punteggio compra un esito: un pareggio ricchissimo resta sotto.
    const pareggioRicchissimo = { ourGoals: 1, theirGoals: 1, ours: { total: 200 } } as never as import("../src/index.js").GameweekOutcome;
    expect(objectiveValue(vittoriaMagra, LEAGUE_POINTS).value).toBeGreaterThan(
      objectiveValue(pareggioRicchissimo, LEAGUE_POINTS).value,
    );
  });

  it("i punti dichiarati sono 3/1/0, la convenzione della Serie A", () => {
    expect(LEAGUE_POINTS).toEqual({ win: 3, draw: 1, loss: 0 });
  });

  it("i punti dichiarati cambiano davvero il criterio, non solo l'etichetta", () => {
    const outcome = simulateGameweek({ ourLineup: vinta, theirLineup: THEIR_LINEUP, players, context: CONTEXT });
    const conPunti = objectiveValue(outcome, { win: 3, draw: 1, loss: 0 }).value;
    const senzaPunti = objectiveValue(outcome, null).value;
    expect(conPunti).not.toBe(senzaPunti);
  });
});

describe("l'ottimizzatore contro la forza bruta, su un campionario di rose", () => {
  // QUESTO TEST ESISTE PERCHÉ LA PRIMA VERSIONE ERA SBAGLIATA.
  //
  // `bestLineupExPost` dichiara di trovare il massimo esatto senza enumerare
  // tutte le formazioni. La prima stesura sceglieva i centrocampisti PRIMA
  // degli attaccanti, contro un attacco «di riferimento» arbitrario: siccome i
  // centrocampisti muovono entrambi i totali e la conversione in goal è a
  // bande, il centrocampo migliore accanto a un attacco finto non è il
  // migliore accanto a quello vero. Una review indipendente ha prodotto il
  // controesempio; la prima rosa generata qui sotto è proprio quella.
  //
  // Un solo caso scelto a mano non basta a difendere una pretesa di
  // esattezza: qui si generano rose deterministiche e si confronta ogni volta
  // con l'enumerazione completa.
  function lcg(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  it("nessuna rosa in cui la forza bruta batta l'algoritmo", () => {
    const rnd = lcg(12345);
    const vote = (): number => Math.round((4 + rnd() * 5) * 2) / 2;
    const bonus = (): number => Math.round(rnd() * 8) - 3;
    // Voti base prima, bonus/malus poi: il punteggio individuale è scorrelato
    // dal voto base, ed è proprio lì che l'ordine dei ruoli conta.
    const withScores = (lines: readonly PlayerLine[]): PlayerLine[] =>
      lines.map((l) => ({ ...l, fantasyScore: (l.baseVote as number) + bonus() }));
    const voted = (id: string, role: Role): PlayerLine => ({ id, role, baseVote: vote(), fantasyScore: 0 });

    for (let trial = 0; trial < 30; trial += 1) {
      const rosaBase: PlayerLine[] = [voted("P1", "P")];
      for (let i = 1; i <= 6; i += 1) rosaBase.push(voted(`D${i}`, "D"));
      for (let i = 1; i <= 6; i += 1) rosaBase.push(voted(`C${i}`, "C"));
      for (let i = 1; i <= 5; i += 1) rosaBase.push(voted(`A${i}`, "A"));
      const rosa = withScores(rosaBase);
      const loroBase: PlayerLine[] = [voted("oP1", "P")];
      for (let i = 1; i <= 4; i += 1) loroBase.push(voted(`oD${i}`, "D"));
      for (let i = 1; i <= 4; i += 1) loroBase.push(voted(`oC${i}`, "C"));
      for (let i = 1; i <= 2; i += 1) loroBase.push(voted(`oA${i}`, "A"));
      const loro = withScores(loroBase);
      const players = new Map([...rosa, ...loro].map((l) => [l.id, l]));

      const best = bestLineupExPost({
        squad: rosa,
        theirLineup: THEIR_LINEUP,
        players,
        context: CONTEXT,
        onlyModule: "442",
      });
      expect(best.feasible).toBe(true);

      const value = (o: ReturnType<typeof simulateGameweek>): number => objectiveValue(o, LEAGUE_POINTS).value;
      let brute = -Infinity;
      for (const d of combinations(rosa.filter((l) => l.role === "D"), 4)) {
        for (const c of combinations(rosa.filter((l) => l.role === "C"), 4)) {
          for (const a of combinations(rosa.filter((l) => l.role === "A"), 2)) {
            const starters = [...d, ...c, ...a];
            const chosen = new Set(["P1", ...starters.map((x) => x.id)]);
            const lineup: Lineup = {
              module: "442",
              goalkeeperId: "P1",
              starterIds: starters.map((x) => x.id),
              benchIds: rosa.filter((x) => !chosen.has(x.id)).map((x) => x.id),
            };
            brute = Math.max(
              brute,
              value(simulateGameweek({ ourLineup: lineup, theirLineup: THEIR_LINEUP, players, context: CONTEXT })),
            );
          }
        }
      }
      expect(value(best.outcome!), `rosa numero ${trial}`).toBe(brute);
    }
  });
});

describe("punti di lega dichiarati", () => {
  it("rifiuta tre numeri disordinati invece di cercare un massimo che non lo è", () => {
    const players = allPlayers();
    const lineup: Lineup = {
      module: "442",
      goalkeeperId: "P2",
      starterIds: ["D6", "D5", "D4", "D3", "C6", "C5", "C4", "C3", "A4", "A3"],
      benchIds: [],
    };
    const outcome = simulateGameweek({ ourLineup: lineup, theirLineup: THEIR_LINEUP, players, context: CONTEXT });
    // Una vittoria che vale meno di un pareggio romperebbe in silenzio la
    // monotonia su cui poggia tutta la ricerca del massimo.
    expect(() => leaguePointsOf(outcome, { win: 0, draw: 3, loss: 1 })).toThrow(/non ordinati/);
    expect(() => leaguePointsOf(outcome, { win: 3, draw: 1, loss: 0 })).not.toThrow();
    // Tre numeri uguali sono ordinati, anche se rendono l'obiettivo piatto.
    expect(() => leaguePointsOf(outcome, { win: 1, draw: 1, loss: 1 })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `mustStart` — i titolari imposti. L'insieme vuoto non è un caso particolare
// da gestire: è LA STESSA ricerca di sempre, e questa è la prova che lo è.
// ─────────────────────────────────────────────────────────────────────────────

describe("titolari imposti (`mustStart`)", () => {
  const base = {
    squad: ourSquad(),
    theirLineup: THEIR_LINEUP,
    players: allPlayers(),
    context: CONTEXT,
  };

  it("assente, insieme vuoto e insieme vuoto con un modulo solo danno il risultato IDENTICO", () => {
    // La garanzia «con l'insieme vuoto la ricerca è quella di sempre» non è una
    // frase: qui si confronta l'intero risultato — formazione, esito, conteggio
    // delle valutazioni e motivo — fra la chiamata senza l'argomento e quella
    // con l'argomento vuoto. Se `mustStart: []` prendesse un ramo diverso, il
    // numero di formazioni valutate lo direbbe subito.
    expect(bestLineupExPost({ ...base, mustStart: [] })).toEqual(bestLineupExPost(base));

    // E vale anche accanto all'altro argomento facoltativo, che tocca gli
    // stessi pool: i due non interferiscono.
    expect(bestLineupExPost({ ...base, onlyModule: "442", mustStart: [] })).toEqual(
      bestLineupExPost({ ...base, onlyModule: "442" }),
    );
  });

  it("gli imposti sono schierati, e la formazione resta la migliore FRA QUELLE che li rispettano", () => {
    const libera = bestLineupExPost(base);
    // D1 (5,0) e A1 (5,0) sono i peggiori dei loro ruoli: la ricerca libera non
    // li schiera, e imposti ci vanno comunque, a un costo che si misura.
    expect(libera.lineup!.starterIds).not.toContain("D1");
    expect(libera.lineup!.starterIds).not.toContain("A1");

    const imposta = bestLineupExPost({ ...base, mustStart: ["D1", "A1"] });
    expect(imposta.feasible).toBe(true);
    expect(imposta.lineup!.starterIds).toContain("D1");
    expect(imposta.lineup!.starterIds).toContain("A1");
    expect(imposta.outcome!.ours.total).toBeLessThan(libera.outcome!.ours.total);
  });

  it("un portiere imposto è il portiere, e nessun altro viene provato", () => {
    const libera = bestLineupExPost(base);
    expect(libera.lineup!.goalkeeperId).toBe("P2"); // 7,0 contro 6,0
    const imposta = bestLineupExPost({ ...base, mustStart: ["P1"] });
    expect(imposta.lineup!.goalkeeperId).toBe("P1");
    // Un portiere solo da provare invece di due: metà delle valutazioni.
    expect(imposta.evaluated).toBeLessThan(libera.evaluated);
  });

  it("un imposto SENZA VOTO entra lo stesso: non è una scelta della funzione, è una volontà", () => {
    // `Dsv` non ha voto, quindi la ricerca non lo sceglierebbe mai. Imposto,
    // ci va: la regola «ex-post non si schiera chi non ha voto» descrive ciò
    // che questa funzione SCEGLIE, e un imposto non è una sua scelta.
    const squad = [...ourSquad(), p("Dsv", "D", null, null)];
    const players = new Map(allPlayers());
    players.set("Dsv", p("Dsv", "D", null, null));
    const imposta = bestLineupExPost({ ...base, squad, players, mustStart: ["Dsv"] });
    expect(imposta.feasible).toBe(true);
    expect(imposta.lineup!.starterIds).toContain("Dsv");
  });

  it("un modulo che non regge gli imposti si dichiara insufficiente, non li scarta", () => {
    // Cinque difensori imposti nel 4-4-2: il modulo ne chiede quattro.
    const imposta = bestLineupExPost({
      ...base,
      onlyModule: "442",
      mustStart: ["D1", "D2", "D3", "D4", "D5"],
    });
    expect(imposta.feasible).toBe(false);
    expect(imposta.lineup).toBeNull();
    expect(imposta.reason).toMatch(/5 D imposti/);
  });

  it("un id imposto che non è in rosa è un errore di chi chiama, e si ferma subito", () => {
    expect(() => bestLineupExPost({ ...base, mustStart: ["Xfantasma"] })).toThrow(/non è in rosa/);
  });
});

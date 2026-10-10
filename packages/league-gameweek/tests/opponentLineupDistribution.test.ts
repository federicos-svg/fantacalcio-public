import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BEHAVIOUR_QUANTITIES,
  EARLY_SEASON_REPEAT_FLOOR,
  ELEVEN_REPEAT_STARTING_SHARE,
  type BehaviourEstimate,
  type BehaviourQuantityId,
  type EstimateBasis,
  type GameweekContext,
  type LeagueBehaviourProfile,
  type Lineup,
  type ObservedLeagueGameweek,
  type ObservedMatch,
  type ObservedTeamLineup,
  type PlayerForecast,
  type PlayerLine,
  type TeamBehaviourProfile,
  behaviourEstimate,
  leagueBehaviourProfile,
  lineupKey,
  MODULES,
  observedLeagueGameweeks,
  opponentLineupDistribution,
  teamBehaviourProfile,
} from "../src/index.js";

// LE PROVE DEL PRODUTTORE DELLA DISTRIBUZIONE AVVERSARIA (§8.4).
//
// IL CRITERIO CHE QUESTE PROVE ESISTONO PER DIFENDERE: una distribuzione
// inventata è peggio del fallimento di adesso. Ogni prova qui sotto verifica
// o (a) che un peso onesto sia calcolato correttamente dai conteggi dichiarati,
// o (b) che una situazione senza abbastanza informazione fermi il calcolo
// invece di produrre un numero verosimile ma inventato.

// ─── FIXTURE MINIME, SINTETICHE ─────────────────────────────────────────────

const CONTEXT = (matchday: number): GameweekContext => ({ matchday, weAreHome: true });

function forecast(
  id: string,
  role: PlayerForecast["role"],
  voteProbability = 1,
): PlayerForecast {
  return {
    id,
    role,
    voteProbability,
    expected: { baseVote: 6, fantasyScore: 6, receivedAnyBonus: false, missedPenalty: false },
  };
}

/**
 * LA ROSA AVVERSARIA COMPLETA: un portiere più 5D/5C/3A, tutti disponibili.
 * Con questa rosa i sette moduli di §9 sono TUTTI legali (il massimo che
 * qualunque modulo chiede è 5D/5C/2A o 4D/3C/3A, e qui ne abbiamo abbastanza
 * per ognuno). Serve al caso "nessuna restrizione".
 */
const FULL_OPPONENT_SQUAD: readonly PlayerForecast[] = [
  forecast("o-gk", "P"),
  forecast("o-d1", "D"),
  forecast("o-d2", "D"),
  forecast("o-d3", "D"),
  forecast("o-d4", "D"),
  forecast("o-d5", "D"),
  forecast("o-c1", "C"),
  forecast("o-c2", "C"),
  forecast("o-c3", "C"),
  forecast("o-c4", "C"),
  forecast("o-c5", "C"),
  forecast("o-a1", "A"),
  forecast("o-a2", "A"),
  forecast("o-a3", "A"),
];

/**
 * LA STESSA ROSA CON SOLO 3 DIFENSORI DISPONIBILI (`voteProbability: 0` sui
 * restanti due — §13, senza voto in ogni scenario, come `neverPlays()` di
 * `lineupProposer.ts`). Con 3D disponibili solo 352 e 343 restano legali:
 * ogni altro modulo ne chiede 4 o 5.
 */
const LIMITED_DEFENCE_SQUAD: readonly PlayerForecast[] = FULL_OPPONENT_SQUAD.map((f) =>
  f.id === "o-d4" || f.id === "o-d5" ? { ...f, voteProbability: 0 } : f,
);

/** Rosa senza abbastanza giocatori per NESSUNO dei sette moduli. */
const HOPELESS_SQUAD: readonly PlayerForecast[] = [
  forecast("o-gk", "P"),
  forecast("o-d1", "D"),
  forecast("o-d2", "D"),
  forecast("o-c1", "C"),
  forecast("o-c2", "C"),
  forecast("o-a1", "A"),
];

/** La nostra formazione di riferimento — fissa, 3-5-2, undici nomi nostri. */
const OUR_REFERENCE_LINEUP: Lineup = {
  module: "352",
  goalkeeperId: "u-gk",
  starterIds: ["u-d1", "u-d2", "u-d3", "u-c1", "u-c2", "u-c3", "u-c4", "u-c5", "u-a1", "u-a2"],
  benchIds: ["u-b1"],
};

function ourLine(id: string, role: PlayerLine["role"]): [string, PlayerLine] {
  return [id, { id, role, baseVote: 6, fantasyScore: 6, receivedAnyBonus: false, missedPenalty: false }];
}

const OUR_REFERENCE_PLAYERS: ReadonlyMap<string, PlayerLine> = new Map([
  ourLine("u-gk", "P"),
  ourLine("u-d1", "D"),
  ourLine("u-d2", "D"),
  ourLine("u-d3", "D"),
  ourLine("u-c1", "C"),
  ourLine("u-c2", "C"),
  ourLine("u-c3", "C"),
  ourLine("u-c4", "C"),
  ourLine("u-c5", "C"),
  ourLine("u-a1", "A"),
  ourLine("u-a2", "A"),
  ourLine("u-b1", "D"),
]);

/**
 * UN PROFILO §8.3 COSTRUITO A MANO — non passa da `leagueBehaviourProfile()`,
 * perché queste prove vogliono controllare ESATTAMENTE `moduleFielded.share`
 * e `elevenIdenticalToPrevious.share` per verificare l'aritmetica di questo
 * file punto per punto. Il profilo VERO, costruito dai conteggi osservati, è
 * testato più sotto nel blocco "capo a capo".
 */
function handBuiltProfile(options: {
  readonly moduleShare: readonly number[];
  readonly repeatShare?: number;
  readonly gameweeksObserved?: number;
  readonly basis?: EstimateBasis;
}): TeamBehaviourProfile {
  const repeatShare = options.repeatShare ?? 0.2;
  const basis = options.basis ?? "osservazioni-e-riferimento";
  const gameweeksObserved = options.gameweeksObserved ?? 10;
  const placeholderTwoWay = (share0: number): BehaviourEstimate["share"] => [share0, 1 - share0];
  const estimateFor = (id: BehaviourQuantityId): BehaviourEstimate => {
    const def = BEHAVIOUR_QUANTITIES.find((q) => q.id === id);
    if (def === undefined) throw new Error(`quantità di test sconosciuta: ${id}`);
    const share =
      id === "moduleFielded"
        ? options.moduleShare
        : id === "elevenIdenticalToPrevious"
          ? placeholderTwoWay(repeatShare)
          : placeholderTwoWay(0.5);
    const counts = share.map(() => 0);
    return {
      quantity: id,
      label: def.label,
      categories: def.categories,
      counts,
      observations: gameweeksObserved,
      notMeasurable: 0,
      share,
      leagueReference: share,
      leagueCounts: counts,
      leagueObservations: gameweeksObserved,
      leagueReferenceWeight: 0,
      basis,
    };
  };
  return {
    teamId: "avversario-di-prova",
    gameweeksObserved,
    gameweeksDiscardedUnconfirmed: 0,
    estimates: BEHAVIOUR_QUANTITIES.map((q) => estimateFor(q.id)),
    basis,
    reason: "profilo di prova costruito a mano",
  };
}

/** Distribuzione uniforme sui sette moduli, nell'ordine di `MODULES`. */
const UNIFORM_MODULE_SHARE: readonly number[] = MODULES.map(() => 1 / MODULES.length);

/** Distribuzione sbilanciata: 433 domina, gli altri si spartiscono il resto. */
const SKEWED_MODULE_SHARE: readonly number[] = MODULES.map((m) => (m === "433" ? 0.7 : 0.05));

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

// ─── 1) CASO BASE: TUTTI I MODULI LEGALI, NESSUNA FORMAZIONE PRECEDENTE ─────

describe("opponentLineupDistribution — caso base", () => {
  it("con rosa piena tutti e sette i moduli sono legali e i pesi sono i pesi del profilo", () => {
    const result = opponentLineupDistribution({
      opponentForecast: FULL_OPPONENT_SQUAD,
      opponentBehaviour: handBuiltProfile({ moduleShare: SKEWED_MODULE_SHARE }),
      ourReferenceLineup: OUR_REFERENCE_LINEUP,
      ourReferencePlayers: OUR_REFERENCE_PLAYERS,
      context: CONTEXT(10),
    });
    expect(result.feasible).toBe(true);
    expect(result.legalModules).toEqual(MODULES);
    expect(result.illegalModules).toEqual([]);
    expect(result.distribution).toHaveLength(MODULES.length);
    expect(sum(result.distribution.map((d) => d.weight))).toBeCloseTo(1, 10);
    // Il modulo 433 pesa 0,7 nel profilo: con tutti i moduli legali la
    // rinormalizzazione è un no-op (la somma delle share è già 1).
    const module433 = result.distribution.find((d) => d.lineup.module === "433");
    expect(module433?.weight).toBeCloseTo(0.7, 10);
    // La formazione modale è quella a peso maggiore: 433.
    expect(result.modalLineup?.module).toBe("433");
    expect(result.repeatPreviousWeight).toBeNull();
  });

  it("ogni formazione della distribuzione è strutturalmente legale per il suo modulo", () => {
    const result = opponentLineupDistribution({
      opponentForecast: FULL_OPPONENT_SQUAD,
      opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE }),
      ourReferenceLineup: OUR_REFERENCE_LINEUP,
      ourReferencePlayers: OUR_REFERENCE_PLAYERS,
      context: CONTEXT(10),
    });
    expect(result.feasible).toBe(true);
    for (const candidate of result.distribution) {
      expect(candidate.lineup.starterIds).toHaveLength(10);
      expect(new Set([candidate.lineup.goalkeeperId, ...candidate.lineup.starterIds]).size).toBe(11);
    }
  });
});

// ─── 2) MODULI ILLEGALI: A PESO ZERO E RINORMALIZZATI (§8.4 punto 4) ────────

describe("opponentLineupDistribution — moduli illegali con la rosa del momento", () => {
  it("con solo 3 difensori disponibili restano legali solo 352 e 343, e i pesi si rinormalizzano", () => {
    const result = opponentLineupDistribution({
      opponentForecast: LIMITED_DEFENCE_SQUAD,
      opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE }),
      ourReferenceLineup: OUR_REFERENCE_LINEUP,
      ourReferencePlayers: OUR_REFERENCE_PLAYERS,
      context: CONTEXT(10),
    });
    expect(result.feasible).toBe(true);
    expect([...result.legalModules].sort()).toEqual(["343", "352"]);
    expect([...result.illegalModules].sort()).toEqual(
      [...MODULES.filter((m) => m !== "343" && m !== "352")].sort(),
    );
    expect(result.distribution).toHaveLength(2);
    // Share uniforme: 1/7 ciascuno prima della restrizione, 1/2 e 1/2 dopo.
    for (const candidate of result.distribution) {
      expect(candidate.weight).toBeCloseTo(0.5, 10);
    }
    expect(sum(result.distribution.map((d) => d.weight))).toBeCloseTo(1, 10);
  });

  it("fail-closed: nessun modulo legale con una rosa impossibile", () => {
    const result = opponentLineupDistribution({
      opponentForecast: HOPELESS_SQUAD,
      opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE }),
      ourReferenceLineup: OUR_REFERENCE_LINEUP,
      ourReferencePlayers: OUR_REFERENCE_PLAYERS,
      context: CONTEXT(10),
    });
    expect(result.feasible).toBe(false);
    expect(result.distribution).toEqual([]);
    expect(result.modalLineup).toBeNull();
    expect(result.illegalModules).toEqual(MODULES);
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

// ─── 3) LA FORMAZIONE DELLA GIORNATA PRECEDENTE (§8.4 punto 5) ──────────────

describe("opponentLineupDistribution — formazione della giornata precedente", () => {
  const PREVIOUS_LINEUP: Lineup = {
    module: "541",
    goalkeeperId: "o-gk",
    starterIds: ["o-d1", "o-d2", "o-d3", "o-d4", "o-d5", "o-c1", "o-c2", "o-c3", "o-c4", "o-a1"],
    benchIds: ["o-a2", "o-a3"],
  };

  it("fuori dalla finestra iniziale il peso è esattamente la quota osservata, senza floor", () => {
    const result = opponentLineupDistribution({
      opponentForecast: FULL_OPPONENT_SQUAD,
      opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 0.3 }),
      ourReferenceLineup: OUR_REFERENCE_LINEUP,
      ourReferencePlayers: OUR_REFERENCE_PLAYERS,
      context: CONTEXT(10), // oltre la finestra delle prime 6 giornate
      previousLineup: PREVIOUS_LINEUP,
    });
    expect(result.feasible).toBe(true);
    expect(result.repeatPreviousWeight).toBeCloseTo(0.3, 10);
    expect(result.repeatPreviousFloored).toBe(false);
    expect(sum(result.distribution.map((d) => d.weight))).toBeCloseTo(1, 10);
    // Identificata per CHIAVE STRUTTURALE esatta, non solo per modulo: con
    // rosa piena l'undici "razionale" di 541 (scelto da `bestLineupExPost`)
    // può differere da `PREVIOUS_LINEUP` pur condividendo modulo e portiere,
    // e in quel caso resta un candidato SEPARATO con solo il peso di modulo.
    const previousKey = lineupKey(PREVIOUS_LINEUP);
    const repeatCandidate = result.distribution.find((d) => lineupKey(d.lineup) === previousKey);
    expect(repeatCandidate?.weight).toBeCloseTo(0.3, 10);
  });

  it("nelle prime 6 giornate una quota osservata sotto il 10% viene alzata al floor", () => {
    const result = opponentLineupDistribution({
      opponentForecast: FULL_OPPONENT_SQUAD,
      opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 0.02 }),
      ourReferenceLineup: OUR_REFERENCE_LINEUP,
      ourReferencePlayers: OUR_REFERENCE_PLAYERS,
      context: CONTEXT(3), // dentro la finestra
      previousLineup: PREVIOUS_LINEUP,
    });
    expect(result.repeatPreviousWeight).toBeCloseTo(0.1, 10);
    expect(result.repeatPreviousFloored).toBe(true);
  });

  it("il confine della finestra è inclusivo: la giornata 6 flora, la giornata 7 no", () => {
    // §8.4 punto 5: "mai sotto il 10% nelle prime 6 giornate" — "prime 6"
    // include la sesta. Il confine è l'unico punto in cui `<=` e `<` si
    // distinguono, e nessun'altra prova di questo file lo tocca: le prove
    // sopra usano 1, 3 e 10, mai il valore esatto della soglia.
    const withRepeat = (matchday: number) =>
      opponentLineupDistribution({
        opponentForecast: FULL_OPPONENT_SQUAD,
        opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 0.02 }),
        ourReferenceLineup: OUR_REFERENCE_LINEUP,
        ourReferencePlayers: OUR_REFERENCE_PLAYERS,
        context: CONTEXT(matchday),
        previousLineup: PREVIOUS_LINEUP,
      });
    const gameweek6 = withRepeat(6);
    expect(gameweek6.repeatPreviousWeight).toBeCloseTo(0.1, 10);
    expect(gameweek6.repeatPreviousFloored).toBe(true);

    const gameweek7 = withRepeat(7);
    expect(gameweek7.repeatPreviousWeight).toBeCloseTo(0.02, 10);
    expect(gameweek7.repeatPreviousFloored).toBe(false);
  });

  it("nelle prime 6 giornate una quota osservata già sopra il 10% non viene toccata", () => {
    const result = opponentLineupDistribution({
      opponentForecast: FULL_OPPONENT_SQUAD,
      opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 0.4 }),
      ourReferenceLineup: OUR_REFERENCE_LINEUP,
      ourReferencePlayers: OUR_REFERENCE_PLAYERS,
      context: CONTEXT(1),
      previousLineup: PREVIOUS_LINEUP,
    });
    expect(result.repeatPreviousWeight).toBeCloseTo(0.4, 10);
    expect(result.repeatPreviousFloored).toBe(false);
  });

  it("una formazione precedente identica all'undici razionale di un modulo si fonde per somma dei pesi", () => {
    // Con rosa limitata a 3D, l'undici razionale di 352 useremo COME
    // formazione "precedente": stessi undici, stesso modulo, stessa panchina
    // costruita dallo stesso criterio (fantasyScore decrescente, poi id).
    const restricted = LIMITED_DEFENCE_SQUAD;
    const withoutPrevious = opponentLineupDistribution({
      opponentForecast: restricted,
      opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 0.3 }),
      ourReferenceLineup: OUR_REFERENCE_LINEUP,
      ourReferencePlayers: OUR_REFERENCE_PLAYERS,
      context: CONTEXT(10),
    });
    const rational352 = withoutPrevious.distribution.find((d) => d.lineup.module === "352");
    expect(rational352).toBeDefined();
    const merged = opponentLineupDistribution({
      opponentForecast: restricted,
      opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 0.3 }),
      ourReferenceLineup: OUR_REFERENCE_LINEUP,
      ourReferencePlayers: OUR_REFERENCE_PLAYERS,
      context: CONTEXT(10),
      previousLineup: (rational352 as { lineup: Lineup }).lineup,
    });
    expect(merged.feasible).toBe(true);
    // Niente candidato in più: la formazione precedente coincide con quella
    // già presente per 352, quindi il totale resta legali+0, non legali+1.
    expect(merged.distribution).toHaveLength(withoutPrevious.distribution.length);
    const mergedEntry = merged.distribution.find((d) => d.lineup.module === "352");
    // Il peso è quello del modulo (0,7 del pool residuo) PIÙ 0,3 di ripetizione.
    expect(mergedEntry?.weight).toBeCloseTo((rational352 as { weight: number }).weight * 0.7 + 0.3, 6);
    expect(sum(merged.distribution.map((d) => d.weight))).toBeCloseTo(1, 10);
  });
});

// ─── 4) GUARDIE FAIL-CLOSED: DATI CONTRADDITTORI, MAI UNA DISTRIBUZIONE
// PARZIALE SPACCIATA PER COMPLETA ───────────────────────────────────────────

describe("opponentLineupDistribution — guardie fail-closed", () => {
  it("rifiuta id condivisi fra la rosa avversaria e i nostri giocatori di riferimento", () => {
    const contaminated = FULL_OPPONENT_SQUAD.map((f) => (f.id === "o-gk" ? { ...f, id: "u-gk" } : f));
    expect(() =>
      opponentLineupDistribution({
        opponentForecast: contaminated,
        opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE }),
        ourReferenceLineup: OUR_REFERENCE_LINEUP,
        ourReferencePlayers: OUR_REFERENCE_PLAYERS,
        context: CONTEXT(10),
      }),
    ).toThrow(/id condivisi/);
  });

  it("rifiuta una formazione di riferimento nostra illegale", () => {
    const illegalOurLineup: Lineup = { ...OUR_REFERENCE_LINEUP, starterIds: OUR_REFERENCE_LINEUP.starterIds.slice(1) };
    expect(() =>
      opponentLineupDistribution({
        opponentForecast: FULL_OPPONENT_SQUAD,
        opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE }),
        ourReferenceLineup: illegalOurLineup,
        ourReferencePlayers: OUR_REFERENCE_PLAYERS,
        context: CONTEXT(10),
      }),
    ).toThrow(/formazione di riferimento nostra non è legale/);
  });

  it("rifiuta una formazione precedente strutturalmente illegale (conteggi di ruolo sbagliati per il modulo dichiarato)", () => {
    const brokenPrevious: Lineup = {
      module: "442",
      goalkeeperId: "o-gk",
      // Solo 3 difensori dichiarati per un modulo che ne chiede 4.
      starterIds: ["o-d1", "o-d2", "o-d3", "o-c1", "o-c2", "o-c3", "o-c4", "o-a1", "o-a2", "o-a3"],
      benchIds: [],
    };
    expect(() =>
      opponentLineupDistribution({
        opponentForecast: FULL_OPPONENT_SQUAD,
        opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE }),
        ourReferenceLineup: OUR_REFERENCE_LINEUP,
        ourReferencePlayers: OUR_REFERENCE_PLAYERS,
        context: CONTEXT(10),
        previousLineup: brokenPrevious,
      }),
    ).toThrow(/formazione della giornata precedente.*non è legale/);
  });

  it("rifiuta una formazione precedente con giocatori in panchina che non sono nella rosa dichiarata", () => {
    const foreignBench: Lineup = {
      module: "352",
      goalkeeperId: "o-gk",
      starterIds: ["o-d1", "o-d2", "o-d3", "o-c1", "o-c2", "o-c3", "o-c4", "o-c5", "o-a1", "o-a2"],
      benchIds: ["fantasma-non-in-rosa"],
    };
    expect(() =>
      opponentLineupDistribution({
        opponentForecast: FULL_OPPONENT_SQUAD,
        opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE }),
        ourReferenceLineup: OUR_REFERENCE_LINEUP,
        ourReferencePlayers: OUR_REFERENCE_PLAYERS,
        context: CONTEXT(10),
        previousLineup: foreignBench,
      }),
    ).toThrow(/panchina giocatori che non sono nella rosa/);
  });

  it("rifiuta un peso di modulo non finito o non positivo nel profilo (conteggi contraddittori)", () => {
    const brokenShare = MODULES.map((m) => (m === "433" ? 0 : 1 / (MODULES.length - 1)));
    expect(() =>
      opponentLineupDistribution({
        opponentForecast: FULL_OPPONENT_SQUAD,
        opponentBehaviour: handBuiltProfile({ moduleShare: brokenShare }),
        ourReferenceLineup: OUR_REFERENCE_LINEUP,
        ourReferencePlayers: OUR_REFERENCE_PLAYERS,
        context: CONTEXT(10),
      }),
    ).toThrow(/peso del modulo 433.*non è un numero finito e positivo/);
  });

  it("rifiuta una quota di ripetizione del profilo sopra 1 (contraddittoria, non 'più sicura')", () => {
    // Un `TeamBehaviourProfile` malformato con `elevenIdenticalToPrevious.
    // share[0] > 1`: senza il tetto superiore questo produrrebbe un
    // `repeatWeight` sopra 1 e quindi un `modulePool` negativo, cioè pesi
    // negativi o nulli su tutte le altre candidate — in silenzio.
    const legalPrevious: Lineup = {
      module: "352",
      goalkeeperId: "o-gk",
      starterIds: ["o-d1", "o-d2", "o-d3", "o-c1", "o-c2", "o-c3", "o-c4", "o-c5", "o-a1", "o-a2"],
      benchIds: ["o-d4", "o-d5", "o-a3"],
    };
    expect(() =>
      opponentLineupDistribution({
        opponentForecast: FULL_OPPONENT_SQUAD,
        opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 1.5 }),
        ourReferenceLineup: OUR_REFERENCE_LINEUP,
        ourReferencePlayers: OUR_REFERENCE_PLAYERS,
        context: CONTEXT(10),
        previousLineup: legalPrevious,
      }),
    ).toThrow(/quota "ripete la formazione".*non è una quota valida in \[0, 1\]/);
  });

  it("rifiuta una rosa avversaria vuota", () => {
    expect(() =>
      opponentLineupDistribution({
        opponentForecast: [],
        opponentBehaviour: handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE }),
        ourReferenceLineup: OUR_REFERENCE_LINEUP,
        ourReferencePlayers: OUR_REFERENCE_PLAYERS,
        context: CONTEXT(10),
      }),
    ).toThrow(/rosa avversaria è vuota/);
  });
});

// ─── 5) CAPO A CAPO: DAL PROFILO VERO (§8.3, `leagueBehaviourProfile`) ALLA
// DISTRIBUZIONE — LE PROVE CHE DECIDONO ──────────────────────────────────────

/** Una formazione sintetica di §8.2 per il profilo reale, id per squadra. */
function synthLineup(teamId: string, module: (typeof MODULES)[number]) {
  const players = Array.from({ length: 20 }, (_, i) => `${teamId}-p${i + 1}`);
  const [gk, ...rest] = players;
  return {
    teamId,
    module,
    goalkeeperId: gk as string,
    starterIds: rest.slice(0, 10),
    benchIds: rest.slice(10, 15),
    status: "confermata" as const,
  };
}

describe("opponentLineupDistribution — capo a capo dal profilo reale (§8.3 → §8.4)", () => {
  // "forte" gioca sempre 433 per trenta giornate: tantissima sicurezza.
  // "scarso" gioca 442 per due sole giornate: pochissima sicurezza.
  // "rivale"/"rivale2" alternano 352/541 solo per dare due squadre avversarie
  // valide alle partite; il loro profilo non è oggetto di queste prove.
  // "fantasma" è dichiarata e non compare MAI in nessuna fotografia.
  const gameweeks: ObservedLeagueGameweek[] = [];
  for (let g = 1; g <= 30; g += 1) {
    gameweeks.push({
      gameweek: g,
      matches: [
        {
          home: synthLineup("forte", "433"),
          away: synthLineup("rivale", g % 2 === 0 ? "352" : "541"),
          outcome: "pareggio",
        },
      ],
    });
  }
  gameweeks.push({
    gameweek: 31,
    matches: [{ home: synthLineup("scarso", "442"), away: synthLineup("rivale2", "352"), outcome: "pareggio" }],
  });
  gameweeks.push({
    gameweek: 32,
    matches: [{ home: synthLineup("scarso", "442"), away: synthLineup("rivale2", "541"), outcome: "pareggio" }],
  });

  const history = observedLeagueGameweeks({ gameweeks, provenance: "prova capo a capo, sintetica" });
  const profile = leagueBehaviourProfile({
    history,
    teams: ["forte", "scarso", "rivale", "rivale2", "fantasma"],
  });

  it("una squadra con 30 giornate osservate e una con 2 producono distribuzioni con sicurezza diversa", () => {
    const forteProfile = teamBehaviourProfile(profile, "forte");
    const scarsoProfile = teamBehaviourProfile(profile, "scarso");
    expect(forteProfile.gameweeksObserved).toBe(30);
    expect(scarsoProfile.gameweeksObserved).toBe(2);

    const distributionFor = (team: TeamBehaviourProfile) =>
      opponentLineupDistribution({
        opponentForecast: FULL_OPPONENT_SQUAD,
        opponentBehaviour: team,
        ourReferenceLineup: OUR_REFERENCE_LINEUP,
        ourReferencePlayers: OUR_REFERENCE_PLAYERS,
        context: CONTEXT(20),
      });

    const forteResult = distributionFor(forteProfile);
    const scarsoResult = distributionFor(scarsoProfile);
    expect(forteResult.feasible).toBe(true);
    expect(scarsoResult.feasible).toBe(true);

    const weightOf = (r: typeof forteResult, mod: (typeof MODULES)[number]) =>
      r.distribution.find((d) => d.lineup.module === mod)?.weight ?? 0;

    const forteOn433 = weightOf(forteResult, "433");
    const scarsoOn442 = weightOf(scarsoResult, "442");

    // LE DUE PROVE CHE DECIDONO, AFFIANCATE: con 30 giornate tutte sullo
    // stesso modulo, il peso sul modulo osservato deve essere marcatamente
    // più alto di quello che due sole giornate possono giustificare —
    // perché k = 4 (§8.4) pesa quanto quattro giornate osservate, e due
    // giornate contro quattro di riferimento non possono dominare la stima.
    expect(forteOn433).toBeGreaterThan(0.8);
    expect(scarsoOn442).toBeLessThan(forteOn433);
    expect(scarsoOn442).toBeLessThan(0.5);
    // eslint-disable-next-line no-console
    console.info(
      `[capo a capo §8.4] peso su 433 con 30 giornate osservate: ${forteOn433.toFixed(4)}; ` +
        `peso su 442 con 2 giornate osservate: ${scarsoOn442.toFixed(4)}`,
    );
  });

  it("una squadra mai osservata riceve il riferimento di lega, non l'equiprobabilità ingenua", () => {
    const fantasmaProfile = teamBehaviourProfile(profile, "fantasma");
    expect(fantasmaProfile.gameweeksObserved).toBe(0);
    expect(fantasmaProfile.basis).toBe("riferimento-di-lega");

    const result = opponentLineupDistribution({
      opponentForecast: FULL_OPPONENT_SQUAD,
      opponentBehaviour: fantasmaProfile,
      ourReferenceLineup: OUR_REFERENCE_LINEUP,
      ourReferencePlayers: OUR_REFERENCE_PLAYERS,
      context: CONTEXT(20),
    });
    expect(result.feasible).toBe(true);
    expect(result.basis).toBe("riferimento-di-lega");

    const module433Weight = result.distribution.find((d) => d.lineup.module === "433")?.weight ?? 0;
    const uniformWeight = 1 / MODULES.length;
    // "Ignoranza" (riferimento di lega, sbilanciato dalle 30 giornate di
    // 433 nel resto della lega) è un esito MISURABILMENTE diverso da "tutti
    // i moduli equiprobabili": qui il riferimento sale ben sopra 1/7.
    expect(module433Weight).toBeGreaterThan(uniformWeight * 1.5);

    // E deve coincidere ESATTAMENTE con la quota di riferimento di lega
    // dichiarata dal profilo (nessuna restrizione di modulo qui: tutti e
    // sette sono legali con la rosa piena, quindi la rinormalizzazione è un
    // no-op e il peso deve essere identico al riferimento).
    const moduleFieldedReference = behaviourEstimate(fantasmaProfile, "moduleFielded").leagueReference;
    const idx433 = MODULES.indexOf("433");
    expect(module433Weight).toBeCloseTo(moduleFieldedReference[idx433] as number, 10);
  });
});

// ─── 6) ZERO COPPIE OSSERVATE: LA QUOTA «RIPETE» NON È UNA MISURA ───────────
// (decisione tecnica dell'Executive del 2026-10-10, contestabile)
//
// Una squadra che non ha nemmeno una coppia di giornate confermate e
// consecutive ha `observations === 0` sulla stima `elevenIdenticalToPrevious`:
// la sua `share` è il riferimento di lega preso in prestito (0,10 se nessuno ha
// una coppia — 0,5 fino al 2026-10-10, prima della nota del 2026-10-11 —, la
// quota degli altri altrimenti), non una misura sua. Quella
// quota NON deve fare della formazione di ieri la più pesata: pesa il floor
// del 10 % in QUALUNQUE giornata, e `repeatPreviousFloored` lo dice.

/** Lo stesso profilo, con le osservazioni di UNA sola quantità riportate a `n`. */
function withRepeatObservations(profile: TeamBehaviourProfile, n: number): TeamBehaviourProfile {
  return {
    ...profile,
    estimates: profile.estimates.map((e) =>
      e.quantity === "elevenIdenticalToPrevious" ? { ...e, observations: n } : e,
    ),
  };
}

describe("opponentLineupDistribution — la precedente senza nessuna coppia osservata", () => {
  const PREVIOUS_LINEUP: Lineup = {
    module: "541",
    goalkeeperId: "o-gk",
    starterIds: ["o-d1", "o-d2", "o-d3", "o-d4", "o-d5", "o-c1", "o-c2", "o-c3", "o-c4", "o-a1"],
    benchIds: ["o-a2", "o-a3"],
  };

  const run = (behaviour: TeamBehaviourProfile, matchday: number) =>
    opponentLineupDistribution({
      opponentForecast: FULL_OPPONENT_SQUAD,
      opponentBehaviour: behaviour,
      ourReferenceLineup: OUR_REFERENCE_LINEUP,
      ourReferencePlayers: OUR_REFERENCE_PLAYERS,
      context: CONTEXT(matchday),
      previousLineup: PREVIOUS_LINEUP,
    });

  describe("con observations === 0 il peso è il floor e il flag è vero, a qualunque giornata", () => {
    // I valori in prestito sono INGRESSI scritti a mano, e il peso non deve
    // dipendere da quale ne presti il profilo: 0,5 è l'uniforme a due categorie,
    // che il profilo prestava a una squadra senza coppie in una lega senza coppie
    // fino al 2026-10-10 (da allora il profilo presta 0,10: nota del 2026-10-11),
    // e resta fra i casi proprio perché il pavimento tenga con qualunque valore;
    // 0,89 è la quota che una squadra senza coppie prende in prestito da una
    // lega che ripete quasi sempre; 0,02 è quella presa in prestito da una lega
    // che non ripete quasi mai, SOTTO il floor: il peso resta il floor e non scende
    // con la quota (review della PR #123: con `Math.min(quota, floor)` al posto
    // del floor, senza questo caso, tutte le prove restavano verdi). In nessuno
    // dei tre casi è una misura SUA.
    const cases = [0.02, 0.5, 0.89].flatMap((borrowedShare) =>
      [1, 3, 6, 7, 10, 30].map((matchday) => ({ borrowedShare, matchday })),
    );
    it.each(cases)(
      "quota in prestito $borrowedShare, giornata $matchday: pesa il floor, non la quota",
      ({ borrowedShare, matchday }) => {
        const behaviour = withRepeatObservations(
          handBuiltProfile({
            moduleShare: UNIFORM_MODULE_SHARE,
            repeatShare: borrowedShare,
            gameweeksObserved: 0,
            basis: "riferimento-di-lega",
          }),
          0,
        );
        const result = run(behaviour, matchday);
        expect(result.feasible).toBe(true);
        expect(result.repeatPreviousWeight).toBe(EARLY_SEASON_REPEAT_FLOOR);
        expect(result.repeatPreviousFloored).toBe(true);
        expect(sum(result.distribution.map((d) => d.weight))).toBeCloseTo(1, 10);
        const repeatCandidate = result.distribution.find((d) => lineupKey(d.lineup) === lineupKey(PREVIOUS_LINEUP));
        expect(repeatCandidate?.weight).toBeCloseTo(EARLY_SEASON_REPEAT_FLOOR, 10);
        // Il resto (0,9) va ai moduli, uniformi qui: la precedente NON è la più pesata.
        const heaviestOther = Math.max(
          ...result.distribution.filter((d) => lineupKey(d.lineup) !== lineupKey(PREVIOUS_LINEUP)).map((d) => d.weight),
        );
        expect(heaviestOther).toBeGreaterThan(EARLY_SEASON_REPEAT_FLOOR);
        expect(result.reason).toMatch(/nessuna coppia di giornate consecutive osservata/);
        // Fuori dalle prime 6 giornate il motivo NON può dire «prime 6 giornate».
        if (matchday > 6) expect(result.reason).not.toMatch(/prime 6 giornate/);
      },
    );

    it("conta le osservazioni della STIMA, non le giornate della squadra: molte giornate ma nessuna coppia consecutiva", () => {
      const behaviour = withRepeatObservations(
        handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 0.5, gameweeksObserved: 5 }),
        0,
      );
      expect(behaviour.gameweeksObserved).toBe(5);
      const result = run(behaviour, 12);
      expect(result.repeatPreviousWeight).toBe(EARLY_SEASON_REPEAT_FLOOR);
      expect(result.repeatPreviousFloored).toBe(true);
    });

    it("un profilo contraddittorio resta fail-closed anche a zero osservazioni", () => {
      const behaviour = withRepeatObservations(
        handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 1.5 }),
        0,
      );
      expect(() => run(behaviour, 10)).toThrow(/non è una quota valida in \[0, 1\]/);
    });
  });

  describe("con observations >= 1 tutto come prima", () => {
    it.each([1, 2, 10])("%i osservazioni, fuori finestra: pesa la quota stimata, anche se è 0,5", (n) => {
      const behaviour = withRepeatObservations(
        handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 0.5 }),
        n,
      );
      const result = run(behaviour, 10);
      expect(result.repeatPreviousWeight).toBeCloseTo(0.5, 10);
      expect(result.repeatPreviousFloored).toBe(false);
    });

    it.each([1, 2, 10])("%i osservazioni, dentro la finestra: il floor alza solo una quota sotto il 10 %", (n) => {
      const low = run(
        withRepeatObservations(handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 0.02 }), n),
        3,
      );
      expect(low.repeatPreviousWeight).toBeCloseTo(EARLY_SEASON_REPEAT_FLOOR, 10);
      expect(low.repeatPreviousFloored).toBe(true);
      const high = run(
        withRepeatObservations(handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 0.4 }), n),
        3,
      );
      expect(high.repeatPreviousWeight).toBeCloseTo(0.4, 10);
      expect(high.repeatPreviousFloored).toBe(false);
    });

    it("un profilo che non porta il campo observations non è letto come «zero osservazioni»", () => {
      // Le trascrizioni parziali di `BehaviourEstimate` (solo `quantity` e
      // `share`) esistono fuori da questo pacchetto: per loro il comportamento
      // è quello di sempre, e per essere corrette devono portare il campo.
      const complete = handBuiltProfile({ moduleShare: UNIFORM_MODULE_SHARE, repeatShare: 0.5 });
      const partial = {
        ...complete,
        estimates: complete.estimates.map(({ quantity, share }) => ({ quantity, share })),
      } as unknown as TeamBehaviourProfile;
      const result = run(partial, 10);
      expect(result.repeatPreviousWeight).toBeCloseTo(0.5, 10);
      expect(result.repeatPreviousFloored).toBe(false);
    });
  });

  describe("lo scenario che ha motivato la correzione: due certi contro due al 55 %", () => {
    // Rosa avversaria con quattro attaccanti: due dati al 100 % e con il
    // punteggio atteso più alto, due dati al 55 % e con quello più basso. La
    // formazione di ieri schierava i due al 55 %. Sintetico, tutto: nessun
    // dato vero.
    const attacker = (id: string, voteProbability: number, score: number): PlayerForecast => ({
      id,
      role: "A",
      voteProbability,
      expected: { baseVote: score, fantasyScore: score, receivedAnyBonus: false, missedPenalty: false },
    });
    const SQUAD: readonly PlayerForecast[] = [
      ...FULL_OPPONENT_SQUAD.filter((f) => f.role !== "A"),
      attacker("o-a1", 1, 6.5),
      attacker("o-a2", 1, 6.5),
      attacker("o-a3", 0.55, 5.5),
      attacker("o-a4", 0.55, 5.5),
    ];
    // 352 è il modulo più usato dalla squadra di prova e anche quello di ieri.
    const MODULE_SHARE = MODULES.map((m) => (m === "352" ? 0.4 : 0.1));
    const SWAP: Readonly<Record<string, string>> = { "o-a1": "o-a3", "o-a2": "o-a4", "o-a3": "o-a1", "o-a4": "o-a2" };
    const swap = (id: string): string => SWAP[id] ?? id;

    const distribute = (behaviour: TeamBehaviourProfile, previousLineup?: Lineup) =>
      opponentLineupDistribution({
        opponentForecast: SQUAD,
        opponentBehaviour: behaviour,
        ourReferenceLineup: OUR_REFERENCE_LINEUP,
        ourReferencePlayers: OUR_REFERENCE_PLAYERS,
        context: CONTEXT(10),
        ...(previousLineup === undefined ? {} : { previousLineup }),
      });

    // L'undici di ieri: quello razionale di oggi per 352, con i due al 100 %
    // scambiati con i due al 55 %. Costruito dalla distribuzione stessa, così
    // differisce da lei SOLO per i due nomi.
    const base = distribute(handBuiltProfile({ moduleShare: MODULE_SHARE }));
    const rational352 = base.distribution.find((d) => d.lineup.module === "352")?.lineup as Lineup;
    const YESTERDAY: Lineup = {
      module: rational352.module,
      goalkeeperId: rational352.goalkeeperId,
      starterIds: rational352.starterIds.map(swap),
      benchIds: rational352.benchIds.map(swap),
    };

    it("premessa: ieri schierava i due al 55 %, l'undici razionale di oggi i due al 100 %", () => {
      expect(rational352.starterIds).toContain("o-a1");
      expect(rational352.starterIds).toContain("o-a2");
      expect(YESTERDAY.starterIds).toContain("o-a3");
      expect(YESTERDAY.starterIds).toContain("o-a4");
      expect(lineupKey(YESTERDAY)).not.toBe(lineupKey(rational352));
    });

    it("con una quota di ripetizione MISURATA di 0,5 la modale è ancora ieri (il comportamento di prima, per chi ha osservazioni)", () => {
      const measured = withRepeatObservations(
        handBuiltProfile({ moduleShare: MODULE_SHARE, repeatShare: 0.5 }),
        1,
      );
      const result = distribute(measured, YESTERDAY);
      expect(result.repeatPreviousWeight).toBeCloseTo(0.5, 10);
      expect(lineupKey(result.modalLineup as Lineup)).toBe(lineupKey(YESTERDAY));
    });

    it("con la stessa quota 0,5 ma ZERO osservazioni la modale contiene i due al 100 % e non i due al 55 %", () => {
      const unmeasured = withRepeatObservations(
        handBuiltProfile({ moduleShare: MODULE_SHARE, repeatShare: 0.5, gameweeksObserved: 0, basis: "riferimento-di-lega" }),
        0,
      );
      const result = distribute(unmeasured, YESTERDAY);
      expect(result.repeatPreviousWeight).toBe(EARLY_SEASON_REPEAT_FLOOR);
      expect(result.repeatPreviousFloored).toBe(true);
      const modal = result.modalLineup as Lineup;
      expect(lineupKey(modal)).not.toBe(lineupKey(YESTERDAY));
      expect(modal.starterIds).toContain("o-a1");
      expect(modal.starterIds).toContain("o-a2");
      expect(modal.starterIds).not.toContain("o-a3");
      expect(modal.starterIds).not.toContain("o-a4");
      // 0,9 ai moduli, di cui il 40 % a 352: 0,36 contro lo 0,10 di ieri.
      const modalWeight = result.distribution.find((d) => lineupKey(d.lineup) === lineupKey(modal))?.weight;
      expect(modalWeight).toBeCloseTo(0.9 * 0.4, 10);
      expect(result.distribution.find((d) => lineupKey(d.lineup) === lineupKey(YESTERDAY))?.weight).toBeCloseTo(
        EARLY_SEASON_REPEAT_FLOOR,
        10,
      );
    });
  });

  describe("capo a capo dal profilo reale: una squadra senza coppie non eredita l'abitudine della lega", () => {
    // "forte" ripete lo stesso undici per dodici giornate consecutive: la
    // lega, nel suo insieme, ripete quasi sempre. "isolata" compare in due
    // giornate NON consecutive (2 e 5): ha giornate osservate, e zero coppie.
    // "fantasma" è dichiarata e non compare mai.
    const gameweeks: ObservedLeagueGameweek[] = [];
    for (let g = 1; g <= 12; g += 1) {
      const matches = [
        { home: synthLineup("forte", "433"), away: synthLineup("rivale", "352"), outcome: "pareggio" as const },
      ];
      if (g === 2 || g === 5) {
        matches.push({
          home: synthLineup("isolata", "442"),
          away: synthLineup("rivale2", "541"),
          outcome: "pareggio" as const,
        });
      }
      gameweeks.push({ gameweek: g, matches });
    }
    const profile = leagueBehaviourProfile({
      history: observedLeagueGameweeks({ gameweeks, provenance: "prova zero coppie, sintetica" }),
      teams: ["forte", "isolata", "rivale", "rivale2", "fantasma"],
    });
    const repeatOf = (teamId: string) => behaviourEstimate(teamBehaviourProfile(profile, teamId), "elevenIdenticalToPrevious");

    it("premessa: isolata ha giornate ma zero coppie, e la lega ripete molto: la sua quota NON è l'abitudine della lega", () => {
      const isolata = teamBehaviourProfile(profile, "isolata");
      expect(isolata.gameweeksObserved).toBe(2);
      expect(repeatOf("isolata").observations).toBe(0);
      // Fino al 2026-10-10 il profilo le prestava il riferimento di lega per
      // intero (peso 1), e la prova leggeva «quota in prestito ben sopra 0,5». Dal
      // 2026-10-11 la squadra tira verso la quota di partenza e il riferimento di
      // lega, riportato, pesa zero: il valore atteso di questa premessa cambia per
      // effetto di quella decisione. Che cosa sia diventata la quota (0,10) lo
      // fissano le prove della sezione 7; qui resta ciò che dà senso al caso: la
      // LEGA ripete molto (22 coppie su 22), cioè c'è un'abitudine altrui da non
      // ereditare — il riferimento riportato è ben sopra 0,5 e sopra il pavimento.
      expect(repeatOf("isolata").leagueReferenceWeight).toBe(0);
      expect(repeatOf("isolata").leagueReference[0]).toBeGreaterThan(0.5);
      expect(repeatOf("isolata").leagueReference[0]).toBeGreaterThan(EARLY_SEASON_REPEAT_FLOOR);
      expect(repeatOf("fantasma").observations).toBe(0);
      expect(repeatOf("forte").observations).toBeGreaterThan(0);
    });

    it.each(["isolata", "fantasma"])("%s: la precedente pesa il floor, a giornata 3 e a giornata 20", (teamId) => {
      for (const matchday of [3, 20]) {
        const result = run(teamBehaviourProfile(profile, teamId), matchday);
        expect(result.repeatPreviousWeight).toBe(EARLY_SEASON_REPEAT_FLOOR);
        expect(result.repeatPreviousFloored).toBe(true);
      }
    });

    it("forte, che ha coppie osservate, pesa la quota stimata come sempre", () => {
      const result = run(teamBehaviourProfile(profile, "forte"), 20);
      expect(result.repeatPreviousWeight).toBeCloseTo(repeatOf("forte").share[0] as number, 12);
      // La soglia era 0,8 con l'ancora uniforme (11 coppie identiche, bersaglio
      // di squadra = riferimento di lega: ≈ 0,96). Con la squadra ancorata allo
      // 0,10 (nota del 2026-10-11) la quota è (11 + 4·0,10) / (11 + 4) = 0,76: il
      // valore atteso cambia per effetto di quella decisione. Resta «alta», ben
      // sopra il pavimento: la soglia è 0,5.
      expect(result.repeatPreviousWeight).toBeGreaterThan(0.5);
      expect(result.repeatPreviousFloored).toBe(false);
    });
  });
});

// ─── 7) SI PARTE SEMPRE DAL 10 % E SI SALE SOLO SE L'AVVERSARIO RIPETE ───────
// (decisione di Pico, in modale, 2026-10-11, nota «AGGIUNTA DEL 2026-10-11» in
// testa a `leagueBehaviourProfile.ts` e a `opponentLineupDistribution.ts`)
//
// IL DIFETTO CHE QUESTE PROVE CHIUDONO. Con l'ancora uniforme dello shrink di
// lega, una squadra con UNA coppia osservata e «non identica» (cioè che aveva
// cambiato formazione) riceveva una quota di ripetizione ≈ 0,356 — 3,5 volte lo
// 0,10 di una squadra mai osservata. La regola di Pico è sulla SQUADRA («cambiare
// formazione abbassa la fiducia che la ripeta»), quindi le proprietà valgono in
// OGNI lega, comprese quelle che ripetono molto: la quota di squadra tira verso
// lo 0,10 e non verso il riferimento di lega (secondo passo della correzione).
// Tutte le prove sotto vanno dal profilo VERO al peso, su storie sintetiche
// costruite coppia per coppia: nessun valore è scritto a mano come se il
// profilo lo avesse prodotto.
//
// LA FORMA DELLE STORIE. Ogni squadra in esame ha una sequenza di coppie
// «identica» / «diversa» fra giornate consecutive (nessun'altra squadra del
// campione ha coppie, salvo dove la prova la pianta apposta); ogni giornata la
// squadra gioca contro un avversario che compare UNA volta sola in tutta la
// storia, quindi senza coppie. Così le coppie di lega sono esattamente quelle
// dichiarate dalla prova, e i numeri si controllano a mano.

type Coppia = "identica" | "diversa";

/** Un undici sintetico della squadra alla «versione» v: versioni diverse, undici diversi. */
function lineupAtVersion(teamId: string, version: number): ObservedTeamLineup {
  const players = Array.from({ length: 30 }, (_, i) => `${teamId}-p${i + 1}`);
  const eleven = players.slice(version, version + 11);
  const [goalkeeper, ...starters] = eleven;
  return {
    teamId,
    module: "442",
    goalkeeperId: goalkeeper as string,
    starterIds: starters,
    benchIds: players.filter((id) => !eleven.includes(id)).slice(0, 5),
    status: "confermata",
  };
}

/**
 * Il profilo VERO di una lega in cui ogni squadra di `sequenze` ha esattamente le
 * coppie dichiarate: `["diversa"]` = due giornate consecutive con undici diversi
 * (una coppia, non identica), `["identica", "identica"]` = tre giornate con lo
 * stesso undici (due coppie, identiche), `[]` = una sola giornata (zero coppie).
 */
function leagueFromPairs(sequenze: Readonly<Record<string, readonly Coppia[]>>): LeagueBehaviourProfile {
  const squadre = Object.keys(sequenze);
  const dichiarate = new Set<string>(squadre);
  const giornate = Math.max(...squadre.map((t) => (sequenze[t] as readonly Coppia[]).length)) + 1;
  const gameweeks: ObservedLeagueGameweek[] = [];
  for (let g = 1; g <= giornate; g += 1) {
    const matches: ObservedMatch[] = [];
    for (const team of squadre) {
      const passi = sequenze[team] as readonly Coppia[];
      if (g > passi.length + 1) continue;
      const version = passi.slice(0, g - 1).filter((passo) => passo === "diversa").length;
      const avversario = `contro-${team}-${g}`;
      dichiarate.add(avversario);
      matches.push({
        home: lineupAtVersion(team, version),
        away: lineupAtVersion(avversario, 0),
        outcome: "pareggio",
      });
    }
    gameweeks.push({ gameweek: g, matches });
  }
  return leagueBehaviourProfile({
    history: observedLeagueGameweeks({ gameweeks, provenance: "prova della quota di partenza, sintetica" }),
    teams: [...dichiarate],
  });
}

describe("opponentLineupDistribution — si parte sempre dal 10 % e si sale solo se l'avversario ripete", () => {
  const SQUADRA = "T";
  /** La formazione di ieri: un 5-4-1 legale con la rosa piena (id da `FULL_OPPONENT_SQUAD`). */
  const IERI: Lineup = {
    module: "541",
    goalkeeperId: "o-gk",
    starterIds: ["o-d1", "o-d2", "o-d3", "o-d4", "o-d5", "o-c1", "o-c2", "o-c3", "o-c4", "o-a1"],
    benchIds: ["o-a2", "o-a3"],
  };
  const GIORNATE_DENTRO_LA_FINESTRA = [1, 3, 6] as const;
  const GIORNATE_FUORI_DALLA_FINESTRA = [7, 10, 20, 38] as const;

  const weightOf = (profile: LeagueBehaviourProfile, matchday: number) =>
    opponentLineupDistribution({
      opponentForecast: FULL_OPPONENT_SQUAD,
      opponentBehaviour: teamBehaviourProfile(profile, SQUADRA),
      ourReferenceLineup: OUR_REFERENCE_LINEUP,
      ourReferencePlayers: OUR_REFERENCE_PLAYERS,
      context: CONTEXT(matchday),
      previousLineup: IERI,
    });
  const repeatShareOf = (profile: LeagueBehaviourProfile) =>
    behaviourEstimate(teamBehaviourProfile(profile, SQUADRA), "elevenIdenticalToPrevious");

  it("il 10 % è un numero solo: il pavimento discende dalla quota di partenza e il letterale compare una volta sola", () => {
    expect(ELEVEN_REPEAT_STARTING_SHARE).toBe(0.1);
    expect(EARLY_SEASON_REPEAT_FLOOR).toBe(ELEVEN_REPEAT_STARTING_SHARE);
    // Due costanti che oggi valgono lo stesso numero non bastano: domani
    // potrebbero divergere. Nel CODICE (commenti tolti) dei due moduli il
    // letterale dello 0,1 compare esattamente una volta.
    const codice = ["../src/leagueBehaviourProfile.ts", "../src/opponentLineupDistribution.ts"]
      .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
      .map((sorgente) => sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))
      .join("\n");
    expect(codice.match(/(?<![\d.])0?\.10?(?![\d.])/g) ?? []).toHaveLength(1);
  });

  describe("(a) zero coppie osservate: il peso è il 10 %, in qualunque giornata e in qualunque lega", () => {
    const leghe: ReadonlyArray<readonly [string, Readonly<Record<string, readonly Coppia[]>>]> = [
      ["nessuna coppia in tutta la lega", { [SQUADRA]: [] }],
      ["una lega che ripete sempre", { [SQUADRA]: [], Z: ["identica", "identica", "identica"] }],
      ["una lega che cambia sempre", { [SQUADRA]: [], Z: ["diversa", "diversa", "diversa"] }],
    ];
    it.each(leghe)("%s", (_nome, sequenze) => {
      const profile = leagueFromPairs(sequenze);
      expect(repeatShareOf(profile).observations).toBe(0);
      for (const matchday of [...GIORNATE_DENTRO_LA_FINESTRA, ...GIORNATE_FUORI_DALLA_FINESTRA]) {
        const result = weightOf(profile, matchday);
        expect(result.repeatPreviousWeight, `giornata ${matchday}`).toBe(0.1);
        expect(result.repeatPreviousFloored, `giornata ${matchday}`).toBe(true);
      }
    });
  });

  /** Le leghe in cui si prova, a parità di squadra in esame: da sola, e con un'altra che ripete o cambia. */
  const LEGHE: ReadonlyArray<readonly [string, Readonly<Record<string, readonly Coppia[]>>]> = [
    ["la squadra da sola (nessun'altra coppia in lega)", {}],
    ["gli altri ripetono quasi sempre (con la coppia della squadra: 3 identiche su 5)", { Z: ["identica", "identica", "identica", "diversa"] }],
    ["gli altri ripetono sempre", { Z: ["identica", "identica", "identica", "identica", "identica"] }],
    ["gli altri cambiano sempre", { Z: ["diversa", "diversa", "diversa"] }],
  ];

  describe("(b) una coppia osservata e «non identica»: il peso non supera il 10 %, in OGNI lega", () => {
    // Nelle prime 6 giornate il pavimento tiene il peso a 0,10; dopo, scende
    // sotto. E questo vale anche dove la lega ripete molto: la quota di squadra
    // non passa dal riferimento di lega.
    it.each(LEGHE)("%s", (_nome, altre) => {
      const profile = leagueFromPairs({ ...altre, [SQUADRA]: ["diversa"] });
      const estimate = repeatShareOf(profile);
      expect(estimate.observations).toBe(1);
      expect(estimate.counts).toEqual([0, 1]);
      expect(estimate.share[0] as number).toBeLessThanOrEqual(ELEVEN_REPEAT_STARTING_SHARE);
      for (const matchday of GIORNATE_DENTRO_LA_FINESTRA) {
        const result = weightOf(profile, matchday);
        expect(result.repeatPreviousWeight, `giornata ${matchday}`).toBe(0.1);
        expect(result.repeatPreviousFloored, `giornata ${matchday}`).toBe(true);
      }
      for (const matchday of GIORNATE_FUORI_DALLA_FINESTRA) {
        const result = weightOf(profile, matchday);
        expect(result.repeatPreviousWeight as number, `giornata ${matchday}`).toBeLessThan(0.1);
        expect(result.repeatPreviousWeight as number, `giornata ${matchday}`).toBeGreaterThan(0);
        expect(result.repeatPreviousFloored, `giornata ${matchday}`).toBe(false);
      }
    });
  });

  describe("(c) una coppia osservata e «identica»: il peso supera il 10 %, in OGNI lega", () => {
    it.each(LEGHE)("%s", (_nome, altre) => {
      const profile = leagueFromPairs({ ...altre, [SQUADRA]: ["identica"] });
      const estimate = repeatShareOf(profile);
      expect(estimate.observations).toBe(1);
      expect(estimate.counts).toEqual([1, 0]);
      expect(estimate.share[0] as number).toBeGreaterThan(ELEVEN_REPEAT_STARTING_SHARE);
      for (const matchday of [...GIORNATE_DENTRO_LA_FINESTRA, ...GIORNATE_FUORI_DALLA_FINESTRA]) {
        const result = weightOf(profile, matchday);
        expect(result.repeatPreviousWeight as number, `giornata ${matchday}`).toBeGreaterThan(0.1);
        expect(result.repeatPreviousFloored, `giornata ${matchday}`).toBe(false);
      }
    });
  });

  describe("(d) monotonia: una coppia «identica» in più non abbassa mai il peso, una «non identica» in più non lo alza mai", () => {
    // TUTTE le storie di squadra fino a sei coppie (127 sequenze, la vuota
    // compresa), in quattro leghe: la squadra da sola, con una che ripete quasi
    // sempre, con una che ripete sempre, con una che cambia sempre. Si
    // confronta la storia con la stessa storia più UNA coppia, sulla quota del
    // profilo, sul riferimento di lega (che si muove nello stesso verso) e sul
    // peso della precedente (dentro e fuori dalla finestra delle prime 6
    // giornate). Il passo da ZERO a una coppia è compreso, in ogni lega: lo
    // 0,10 dello zero coppie è il punto di partenza da cui «identica» sale e
    // «non identica» scende, senza eccezioni.
    const sequenzeFinoA = (lunghezza: number): Coppia[][] => {
      let correnti: Coppia[][] = [[]];
      const tutte: Coppia[][] = [[]];
      for (let n = 1; n <= lunghezza; n += 1) {
        correnti = correnti.flatMap((s): Coppia[][] => [[...s, "identica"], [...s, "diversa"]]);
        tutte.push(...correnti);
      }
      return tutte;
    };
    const EPS = 1e-12;

    it.each(LEGHE)("%s", (nomeLega, altre) => {
      let confronti = 0;
      for (const base of sequenzeFinoA(6)) {
        const prima = leagueFromPairs({ ...altre, [SQUADRA]: base });
        const pesiPrima = [3, 20].map((matchday) => weightOf(prima, matchday).repeatPreviousWeight as number);
        for (const coppia of ["identica", "diversa"] as const) {
          const dopo = leagueFromPairs({ ...altre, [SQUADRA]: [...base, coppia] });
          const verso = coppia === "identica" ? 1 : -1;
          const spostamento = (a: number, b: number) => verso * (b - a);
          const etichetta = `${[...base, coppia].join(",") || "(vuota)"} (${nomeLega})`;
          expect(
            spostamento(repeatShareOf(prima).share[0] as number, repeatShareOf(dopo).share[0] as number),
            `quota: ${etichetta}`,
          ).toBeGreaterThanOrEqual(-EPS);
          expect(
            spostamento(
              repeatShareOf(prima).leagueReference[0] as number,
              repeatShareOf(dopo).leagueReference[0] as number,
            ),
            `riferimento di lega: ${etichetta}`,
          ).toBeGreaterThanOrEqual(-EPS);
          [3, 20].forEach((matchday, i) => {
            const pesoDopo = weightOf(dopo, matchday).repeatPreviousWeight as number;
            expect(spostamento(pesiPrima[i] as number, pesoDopo), `peso, giornata ${matchday}: ${etichetta}`)
              .toBeGreaterThanOrEqual(-EPS);
          });
          confronti += 1;
        }
      }
      // 127 sequenze x 2 coppie: la prova non è vuota per una svista nel generatore.
      expect(confronti).toBe(127 * 2);
    });
  });

  describe("(e) i numeri dell'esempio: una lega con una sola coppia, «non identica»", () => {
    it("prima ≈ 0,356 (uniforme), dopo 0,08 (squadra ancorata al 10 %): sotto lo 0,10 di chi non è mai stato osservato", () => {
      // IL CALCOLO DI PRIMA, scritto a mano: riferimento (0 + 8·0,5) / (1 + 8) ≈
      // 0,444 e squadra (0 + 4·0,444) / (1 + 4) ≈ 0,356, cioè 3,5 volte lo 0,10.
      const riferimentoPrima = (0 + 8 * 0.5) / (1 + 8);
      const quotaPrima = (0 + 4 * riferimentoPrima) / (1 + 4);
      expect(riferimentoPrima).toBeCloseTo(0.4444, 4);
      expect(quotaPrima).toBeCloseTo(0.3556, 4);
      expect(quotaPrima / 0.1).toBeGreaterThan(3.5);

      // IL CALCOLO DI ADESSO, dal profilo vero. Il riferimento di lega, riportato
      // e non usato: (0 + 8·0,10) / (1 + 8) ≈ 0,0889. La squadra, ancorata allo
      // 0,10 con k = 4: (0 + 4·0,10) / (1 + 4) = 0,08.
      const profile = leagueFromPairs({ [SQUADRA]: ["diversa"] });
      const estimate = repeatShareOf(profile);
      expect(estimate.leagueReference[0] as number).toBeCloseTo((0 + 8 * 0.1) / (1 + 8), 12);
      expect(estimate.leagueReference[0] as number).toBeCloseTo(0.0889, 4);
      expect(estimate.share[0] as number).toBeCloseTo((0 + 4 * 0.1) / (1 + 4), 12);
      expect(estimate.share[0] as number).toBeCloseTo(0.08, 12);
      expect(estimate.share[0] as number).toBeLessThanOrEqual(0.1);
      // I campi dicono ciò che è stato usato: l'ancora, non la lega.
      expect(estimate.leagueReferenceWeight).toBe(0);
      expect(estimate.teamAnchor).toEqual([0.1, 0.9]);
      expect(estimate.teamAnchorWeight as number).toBeCloseTo(4 / 5, 12);
      expect(estimate.basis).toBe("osservazioni-e-quota-di-partenza");

      // Il peso, fuori dalla finestra: la quota stessa; dentro: il pavimento.
      expect(weightOf(profile, 20).repeatPreviousWeight as number).toBeCloseTo(0.08, 12);
      expect(weightOf(profile, 20).repeatPreviousWeight as number).toBeLessThanOrEqual(0.1);
      expect(weightOf(profile, 3).repeatPreviousWeight).toBe(0.1);
    });

    it("e con NESSUNA coppia in tutta la lega il riferimento è proprio l'ancora: 0,10 / 0,90; la squadra senza coppie la prende intera", () => {
      const profile = leagueFromPairs({ [SQUADRA]: [] });
      const estimate = repeatShareOf(profile);
      expect(estimate.leagueObservations).toBe(0);
      expect(estimate.leagueReference[0] as number).toBeCloseTo(0.1, 12);
      expect(estimate.leagueReference[1] as number).toBeCloseTo(0.9, 12);
      expect(estimate.share).toEqual([0.1, 0.9]);
      expect(estimate.basis).toBe("quota-di-partenza");
      expect(estimate.teamAnchorWeight).toBe(1);
    });

    it("la quota di una squadra è (identiche + k·0,10) / (coppie + k) per ogni storia fino a sei coppie, in ogni lega", () => {
      // La forma chiusa, controllata su tutte le storie e su tutte le leghe:
      // dipende solo dalla squadra, mai dalle altre.
      const sequenze: Coppia[][] = [[]];
      let correnti: Coppia[][] = [[]];
      for (let n = 1; n <= 6; n += 1) {
        correnti = correnti.flatMap((s): Coppia[][] => [[...s, "identica"], [...s, "diversa"]]);
        sequenze.push(...correnti);
      }
      for (const [nomeLega, altre] of LEGHE) {
        for (const sequenza of sequenze) {
          const estimate = repeatShareOf(leagueFromPairs({ ...altre, [SQUADRA]: sequenza }));
          const identiche = sequenza.filter((c) => c === "identica").length;
          expect(estimate.share[0] as number, `${sequenza.join(",") || "(vuota)"} (${nomeLega})`).toBeCloseTo(
            (identiche + 4 * 0.1) / (sequenza.length + 4),
            12,
          );
        }
      }
    });
  });

  describe("il limite della prima stesura non c'è più: in una lega che ripete molto, UNA coppia «non identica» pesa come altrove", () => {
    // Nella prima stesura della correzione (solo l'ancora di LEGA) una squadra con
    // una coppia «non identica» prendeva 4/5 del riferimento di lega, e in una lega
    // che ripete molto pesava più dello 0,10 di chi non ha coppie (3 identiche su 5
    // in lega: ≈ 0,23). Qui si fissa che non è più così: la quota di squadra non
    // passa dal riferimento di lega, che si riporta e pesa zero.
    it("la lega ripete molto, la squadra con una coppia «non identica» pesa 0,08 e quella con zero coppie 0,10", () => {
      const altre: Readonly<Record<string, readonly Coppia[]>> = { Z: ["identica", "identica", "identica", "diversa"] };
      const profile = leagueFromPairs({ ...altre, [SQUADRA]: ["diversa"] });
      const estimate = repeatShareOf(profile);
      // La lega ripete molto, e lo dice: il riferimento riportato è ben sopra lo 0,10...
      expect(estimate.leagueReference[0] as number).toBeGreaterThan(0.2);
      // ...ma non entra nella stima della squadra.
      expect(estimate.leagueReferenceWeight).toBe(0);
      expect(estimate.share[0] as number).toBeCloseTo(0.08, 12);
      expect(weightOf(profile, 20).repeatPreviousWeight as number).toBeCloseTo(0.08, 12);
      expect(weightOf(profile, 20).repeatPreviousWeight as number).toBeLessThanOrEqual(0.1);
      // La stessa squadra con ZERO coppie, nella stessa lega, pesa 0,10.
      const senzaCoppie = leagueFromPairs({ ...altre, [SQUADRA]: [] });
      expect(repeatShareOf(senzaCoppie).share).toEqual([0.1, 0.9]);
      expect(weightOf(senzaCoppie, 20).repeatPreviousWeight).toBe(0.1);
    });

    it("la stessa storia di squadra dà la stessa quota in leghe diverse", () => {
      const quote = LEGHE.map(([, altre]) =>
        repeatShareOf(leagueFromPairs({ ...altre, [SQUADRA]: ["diversa", "identica"] })).share[0],
      );
      for (const quota of quote) expect(quota).toBe(quote[0]);
    });
  });
});

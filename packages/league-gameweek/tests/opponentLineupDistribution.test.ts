import { describe, expect, it } from "vitest";

import {
  BEHAVIOUR_QUANTITIES,
  type BehaviourEstimate,
  type BehaviourQuantityId,
  type EstimateBasis,
  type GameweekContext,
  type Lineup,
  type ObservedLeagueGameweek,
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

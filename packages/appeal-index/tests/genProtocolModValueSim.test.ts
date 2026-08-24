import { describe, it, expect } from "vitest";
import {
  DEFENSE_BLOCK_DEFENDERS,
  MIDFIELD_OPPONENT_SIZES,
  MIDFIELD_OWN_TEAMMATES,
  MOD_VALUE_DRAWS,
  MOD_VALUE_MC_ERROR_THRESHOLD,
  MOD_VALUE_SEED,
  OWNED_POOL_SIZE,
  REPLACEMENT_POOL_RANK,
  buildContextPools,
  buildMatchdayArchive,
  computeDeltaMA,
  realizedJointDistribution,
  realizedVoteDistribution,
  simulateDeltaMC,
  simulateDeltaMD,
  type ModValueSubject,
} from "../src/genProtocol/modValueSim.js";
import { GEN_SEEDS } from "../src/genProtocol/prng.js";
import { VOTE_BIN_COUNT } from "../src/genProtocol/voteDistribution.js";
import { powerWorld } from "../src/genProtocol/syntheticWorld.js";
import type { GenRole, GenSeason, MatchdayVote } from "../src/genProtocol/genTypes.js";

const world = powerWorld(77, { seasons: 3, players: 200 });
const archiveSeasons: GenSeason[] = [world.seasons[0]!, world.seasons[1]!];
const archive = buildMatchdayArchive(world.panel, archiveSeasons);

// Ranking sintetico: l'ordine di arrivo nel panel, che basta a formare i pool.
const ranking = new Map<string, number>();
{
  const byRole = new Map<GenRole, number>();
  for (const playerKey of world.roleOf.keys()) {
    const role = world.roleOf.get(playerKey)!;
    const next = (byRole.get(role) ?? 0) + 1;
    byRole.set(role, next);
    ranking.set(playerKey, next);
  }
}
const pools = buildContextPools(ranking, (playerKey) => world.roleOf.get(playerKey));

function subject(role: GenRole, playerKey: string, shift: number): ModValueSubject {
  // Distribuzione concentrata attorno a un voto: `shift` sposta la massa verso
  // l'alto, cosi' due soggetti si distinguono davvero.
  const probabilities = new Array<number>(VOTE_BIN_COUNT).fill(0);
  probabilities[Math.min(VOTE_BIN_COUNT - 1, Math.max(0, 4 + shift))] = 1;
  return { playerKey, role, voteDistribution: probabilities };
}

describe("genProtocol/modValueSim — le costanti di §D.9", () => {
  it("M = 20.000, soglia MC 5%, seme 20260903 — valori scritti a mano", () => {
    expect(MOD_VALUE_DRAWS).toBe(20_000);
    expect(MOD_VALUE_MC_ERROR_THRESHOLD).toBe(0.05);
    expect(MOD_VALUE_SEED).toBe(20260903);
    expect(GEN_SEEDS.modifierSimulation).toBe(20260903);
  });

  it("i pool posseduti sono 24/72/72/56 e i replacement 25/73/73/57", () => {
    expect(OWNED_POOL_SIZE).toEqual({ P: 24, D: 72, C: 72, A: 56 });
    expect(REPLACEMENT_POOL_RANK).toEqual({ P: 25, D: 73, C: 73, A: 57 });
    for (const role of ["P", "D", "C", "A"] as const) {
      expect(REPLACEMENT_POOL_RANK[role]).toBe(OWNED_POOL_SIZE[role] + 1);
    }
  });

  it("il blocco difesa e' portiere + 4, il centrocampo 1 + 4 contro {4, 5}", () => {
    expect(DEFENSE_BLOCK_DEFENDERS).toBe(4);
    expect(MIDFIELD_OWN_TEAMMATES).toBe(4);
    expect([...MIDFIELD_OPPONENT_SIZES]).toEqual([4, 5]);
  });
});

describe("genProtocol/modValueSim — l'archivio e i pool", () => {
  it("l'archivio contiene solo le stagioni dichiarate: una giornata futura sarebbe leakage", () => {
    expect(archive.keys.every((key) => archiveSeasons.includes(key.season))).toBe(true);
    expect(archive.keys.some((key) => key.season === world.seasons[2])).toBe(false);
    expect(archive.keys).toHaveLength(archiveSeasons.length * 38);
  });

  it("le chiavi sono ordinate: il seme non basterebbe a riprodurre un ordine casuale", () => {
    const serialized = archive.keys.map((key) => `${key.season}#${String(key.matchday).padStart(2, "0")}`);
    expect([...serialized]).toEqual([...serialized].sort());
  });

  it("i pool prendono i primi N del ranking e il replacement e' il successivo", () => {
    expect(pools.owned.C).toHaveLength(72);
    expect(pools.owned.A.length).toBeLessThanOrEqual(56);
    const replacementC = pools.replacement.C!;
    expect(ranking.get(replacementC)).toBe(73);
    expect(pools.owned.C).not.toContain(replacementC);
  });
});

describe("genProtocol/modValueSim — ΔMD e ΔMC", () => {
  const options = { draws: 400, seed: 20260903 };

  it("ΔMD e' deterministico a parita' di seme", () => {
    const first = simulateDeltaMD(subject("D", pools.owned.D[0]!, 0), archive, pools, options);
    const second = simulateDeltaMD(subject("D", pools.owned.D[0]!, 0), archive, pools, options);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("un difensore che prende voti alti contribuisce PIU' di uno che li prende bassi", () => {
    const forte = simulateDeltaMD(subject("D", pools.owned.D[0]!, 3), archive, pools, options);
    const debole = simulateDeltaMD(subject("D", pools.owned.D[0]!, -3), archive, pools, options);
    expect(forte.perMatchday).toBeGreaterThan(debole.perMatchday);
  });

  it("lo stesso vale per il portiere, che entra nel blocco difesa dal suo lato", () => {
    const forte = simulateDeltaMD(subject("P", pools.owned.P[0]!, 4), archive, pools, options);
    const debole = simulateDeltaMD(subject("P", pools.owned.P[0]!, -4), archive, pools, options);
    expect(forte.perMatchday).toBeGreaterThan(debole.perMatchday);
  });

  it("ΔMC distingue un centrocampista forte da uno debole", () => {
    const forte = simulateDeltaMC(subject("C", pools.owned.C[0]!, 3), archive, pools, options);
    const debole = simulateDeltaMC(subject("C", pools.owned.C[0]!, -3), archive, pools, options);
    expect(forte.perMatchday).toBeGreaterThan(debole.perMatchday);
    expect(forte.target).toBe("MC");
  });

  it("la versione stagionale e' `Δ · N̂`, ed e' `null` se `N̂` non e' stato passato", () => {
    const senza = simulateDeltaMD(subject("D", pools.owned.D[1]!, 2), archive, pools, options);
    expect(senza.seasonal).toBeNull();
    const con = simulateDeltaMD(subject("D", pools.owned.D[1]!, 2), archive, pools, {
      ...options,
      expectedPresences: 30,
    });
    expect(con.seasonal).toBeCloseTo(con.perMatchday * 30, 12);
  });

  it("l'errore MC e' riportato e la soglia del 5% e' un flag, non un'eccezione", () => {
    const result = simulateDeltaMC(subject("C", pools.owned.C[2]!, 2), archive, pools, { draws: 30, seed: 1 });
    expect(Number.isFinite(result.mcStandardError)).toBe(true);
    expect(typeof result.mcErrorAboveThreshold).toBe("boolean");
    expect(result.draws).toBe(30);
  });

  it("gli SV ricampionati sono CONTATI, non nascosti", () => {
    const result = simulateDeltaMD(subject("D", pools.owned.D[3]!, 1), archive, pools, options);
    expect(result.resampledSlots).toBeGreaterThan(0);
  });

  it("i ruoli sbagliati non entrano dalla porta di servizio", () => {
    expect(() => simulateDeltaMD(subject("C", "X", 0), archive, pools, options)).toThrow(/ΔMD e' definito per P e D/);
    expect(() => simulateDeltaMC(subject("A", "X", 0), archive, pools, options)).toThrow(/ΔMC e' definito per C/);
  });
});

describe("genProtocol/modValueSim — ΔMA in forma chiusa", () => {
  function joint(noBonus: readonly number[], bonus: readonly number[]): readonly number[] {
    return [...noBonus, ...bonus];
  }

  it("e' `Σ p(v, no-bonus)·bonus(v)`, calcolato a mano sulla tabella §21", () => {
    // Massa: 50% voto 7 senza bonus (+1), 50% voto 6,5 senza bonus (+0,5).
    const noBonus = [0, 0, 0, 0, 0, 0.5, 0.5, 0, 0];
    const bonus = new Array<number>(9).fill(0);
    const result = computeDeltaMA(
      { playerKey: "A1", role: "A", voteDistribution: noBonus, jointDistribution: joint(noBonus, bonus) },
      { draws: 100 },
    );
    // 0,5·0,5 + 0,5·1 = 0,75.
    expect(result.perMatchday).toBeCloseTo(0.75, 12);
  });

  it("una massa CON bonus non contribuisce: il bonus esclude dall'eleggibilita' (§21)", () => {
    const noBonus = new Array<number>(9).fill(0);
    const bonus = new Array<number>(9).fill(0);
    bonus[8] = 1; // voto ≥ 8 ma con gol/assist/rigore sbagliato
    const result = computeDeltaMA(
      { playerKey: "A2", role: "A", voteDistribution: noBonus, jointDistribution: joint(noBonus, bonus) },
      { draws: 100 },
    );
    expect(result.perMatchday).toBe(0);
  });

  it("un voto insufficiente non contribuisce, nemmeno senza bonus", () => {
    const noBonus = new Array<number>(9).fill(0);
    noBonus[2] = 1; // voto 5
    const result = computeDeltaMA(
      { playerKey: "A3", role: "A", voteDistribution: noBonus, jointDistribution: joint(noBonus, new Array<number>(9).fill(0)) },
      { draws: 100 },
    );
    expect(result.perMatchday).toBe(0);
  });

  it("senza la congiunta a 18 bin si ferma: non si indovina l'eleggibilita'", () => {
    expect(() =>
      computeDeltaMA({ playerKey: "A4", role: "A", voteDistribution: new Array<number>(9).fill(1 / 9) }),
    ).toThrow(/congiunta a 18 bin/);
  });
});

describe("genProtocol/modValueSim — il backtest usa la distribuzione REALIZZATA", () => {
  function md(matchday: number, votoBase: number | null, extra: Partial<MatchdayVote> = {}): MatchdayVote {
    return {
      season: "2019_20",
      matchday,
      votoBase,
      isAsterisk: false,
      Gf: 0,
      Gs: 0,
      Rp: 0,
      Rs: 0,
      Rf: 0,
      Au: 0,
      Amm: 0,
      Esp: 0,
      Ass: 0,
      ...extra,
    };
  }

  it("la distribuzione realizzata e' quella osservata, e ignora gli SV", () => {
    const distribution = realizedVoteDistribution([md(1, 6), md(2, 7), md(3, null), md(4, 6)])!;
    expect(distribution).toHaveLength(9);
    expect(distribution[4]).toBeCloseTo(2 / 3, 12); // due voti 6 su tre presenze
    expect(distribution[6]).toBeCloseTo(1 / 3, 12);
    expect(realizedVoteDistribution([md(1, null)])).toBeNull();
  });

  it("la congiunta realizzata separa le presenze con bonus da quelle senza", () => {
    const joint = realizedJointDistribution([md(1, 7), md(2, 7, { Gf: 1 })])!;
    expect(joint).toHaveLength(18);
    expect(joint[6]).toBeCloseTo(0.5, 12); // voto 7 senza bonus
    expect(joint[15]).toBeCloseTo(0.5, 12); // voto 7 con bonus
  });
});

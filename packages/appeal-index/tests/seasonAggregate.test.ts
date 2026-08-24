import { describe, it, expect } from "vitest";
import { buildPlayerSeasonAggregates, SeasonAggregateError } from "../src/seasonAggregate.js";
import type { VoteRecordCandidate } from "../src/types.js";

function record(overrides: Partial<VoteRecordCandidate> = {}): VoteRecordCandidate {
  return {
    source_id: "fantacalcio_xlsx",
    vote_source: "italia",
    season: "2024_25",
    matchday: 1,
    external_id: 1,
    canonical_player_id: null,
    team: "Synthetic Team",
    role: "C",
    name: "Synthetic Player",
    voto_raw: 6,
    voto_base: 6,
    is_asterisk: false,
    is_sv: false,
    is_blank: false,
    is_real_performance: true,
    ...overrides,
  };
}

describe("buildPlayerSeasonAggregates", () => {
  it("excludes ALL (coach) rows", () => {
    const rows = [record(), record({ role: "ALL", external_id: 2, name: "Coach" })];
    const aggs = buildPlayerSeasonAggregates("2024_25", rows);
    expect(aggs).toHaveLength(1);
    expect(aggs[0]!.externalId).toBe(1);
  });

  it("aggregates presenze/mediaVoto/fantamedia across matchdays for the same player", () => {
    const rows = [
      record({ matchday: 1, voto_base: 6, voto_raw: 6 }),
      record({ matchday: 2, voto_base: 7, voto_raw: 7, Gf: 1 }),
      record({ matchday: 3, voto_base: null, voto_raw: "", is_blank: true, is_real_performance: false }),
    ];
    const [agg] = buildPlayerSeasonAggregates("2024_25", rows);
    expect(agg!.matchdaysObserved).toBe(3);
    expect(agg!.presenze).toBe(2);
    expect(agg!.mediaVoto).toBeCloseTo(6.5);
    expect(agg!.fantamedia).toBeCloseTo((6 + 10) / 2);
    expect(agg!.volatilitaVoto).toBeGreaterThan(0);
    expect(agg!.golFatti).toBe(1);
  });

  it("«gol fatti» e' il totale Gf + Rf, e le due componenti restano leggibili a parte", () => {
    // Allineamento del 2026-08-24: un rigore segnato e' un gol, quindi entra in
    // `golFatti`. Chi vuole distinguere il bomber dal rigorista designato legge
    // le componenti, che sono dichiarate e non derivate a occhio.
    const rows = [
      record({ matchday: 1, voto_base: 6, voto_raw: 6, Gf: 2 }),
      record({ matchday: 2, voto_base: 7, voto_raw: 7, Rf: 1 }),
      record({ matchday: 3, voto_base: 6, voto_raw: 6, Gf: 1, Rf: 1 }),
    ];
    const [agg] = buildPlayerSeasonAggregates("2024_25", rows);
    expect(agg!.golSuAzione).toBe(3);
    expect(agg!.rigoriSegnati).toBe(2);
    expect(agg!.golFatti).toBe(5);
    // L'identita' che tiene insieme i tre campi, asserita e non sperata.
    expect(agg!.golFatti).toBe(agg!.golSuAzione + agg!.rigoriSegnati);
  });

  it("un rigorista puro ha golFatti > 0 con golSuAzione a zero", () => {
    const rows = [record({ matchday: 1, voto_base: 6, voto_raw: 6, Rf: 2 })];
    const [agg] = buildPlayerSeasonAggregates("2024_25", rows);
    expect(agg!.golSuAzione).toBe(0);
    expect(agg!.golFatti).toBe(2);
    // E il fantavoto li paga: 6 + 3 + 3 = 12.
    expect(agg!.fantamedia).toBeCloseTo(12);
  });

  it("returns null mediaVoto/fantamedia/volatilitaVoto for a player with zero presenze", () => {
    const rows = [record({ voto_base: null, voto_raw: "", is_blank: true, is_real_performance: false })];
    const [agg] = buildPlayerSeasonAggregates("2024_25", rows);
    expect(agg!.presenze).toBe(0);
    expect(agg!.mediaVoto).toBeNull();
    expect(agg!.fantamedia).toBeNull();
    expect(agg!.volatilitaVoto).toBeNull();
  });

  it("throws SeasonAggregateError when a record's season does not match the requested season", () => {
    expect(() => buildPlayerSeasonAggregates("2024_25", [record({ season: "2023_24" })])).toThrow(SeasonAggregateError);
  });

  it("throws SeasonAggregateError when the same externalId maps to two distinct names within one season", () => {
    const rows = [record({ name: "Player One" }), record({ matchday: 2, name: "Player Two" })];
    expect(() => buildPlayerSeasonAggregates("2024_25", rows)).toThrow(SeasonAggregateError);
  });
});

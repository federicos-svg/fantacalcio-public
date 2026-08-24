import { describe, it, expect } from "vitest";
import { computeFantavoto, FANTAVOTO_TARIFF, GS_MALUS_PER_GOAL_CONCEDED } from "../src/fantavoto.js";
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

describe("computeFantavoto", () => {
  it("returns voto_base unchanged with no stat events", () => {
    expect(computeFantavoto(record())).toBe(6);
  });

  it("applies the documented tariff for a goal and an assist", () => {
    const r = record({ Gf: 1, Ass: 1 });
    expect(computeFantavoto(r)).toBeCloseTo(6 + FANTAVOTO_TARIFF.Gf + FANTAVOTO_TARIFF.Ass);
  });

  it("applies malus for a missed penalty, a card, and a red card", () => {
    const r = record({ Rs: 1, Amm: 1, Esp: 1 });
    expect(computeFantavoto(r)).toBeCloseTo(6 + FANTAVOTO_TARIFF.Rs + FANTAVOTO_TARIFF.Amm + FANTAVOTO_TARIFF.Esp);
  });

  // ASSERZIONE INVERTITA il 2026-08-23, e la ragione e' scritta perche' non
  // sembri una comodita'. Il test diceva «ignores Gs and Rf»: era vero contro
  // la tariffa che escludeva i gol subiti, ed e' falso da quando Pico ha
  // chiuso la platea del malus (LEAGUE_RULES.md §12, DECISIONS.md §D9 punto 6,
  // domanda aperta «da chiudere prima del rerun»). `Gs` ora conta, per il solo
  // portiere. `Rf` resta ignorato, e la sua ragione non e' cambiata: un rigore
  // segnato e' gia' dentro `Gf`.
  it("Gs conta per il PORTIERE: -1 per gol subito", () => {
    const keeper = record({ role: "P", Gs: 3 });
    expect(computeFantavoto(keeper)).toBeCloseTo(6 + 3 * GS_MALUS_PER_GOAL_CONCEDED);
    // Un portiere che para un rigore e ne subisce due: entrambi contano.
    const busy = record({ role: "P", Gs: 2, Rp: 1 });
    expect(computeFantavoto(busy)).toBeCloseTo(6 + 2 * GS_MALUS_PER_GOAL_CONCEDED + FANTAVOTO_TARIFF.Rp);
  });

  it("Rf resta ignorato — un rigore segnato e' gia' dentro Gf", () => {
    expect(computeFantavoto(record({ Gf: 1, Rf: 2 }))).toBe(computeFantavoto(record({ Gf: 1 })));
  });

  it("un gol subito su una riga NON di portiere ferma il calcolo, non lo aggiusta", () => {
    // La guardia chiesta da Pico chiudendo la platea: una riga cosi' significa
    // che la colonna non ha la semantica attesa, e un numero calcolato su una
    // premessa falsa e' peggio di nessun numero.
    expect(() => computeFantavoto(record({ role: "D", Gs: 1 }))).toThrow(/malus gol subito/);
    expect(() => computeFantavoto(record({ role: "C", Gs: 2 }))).toThrow();
    // `Gs: 0` su un giocatore di movimento e' normale e non ferma niente.
    expect(computeFantavoto(record({ role: "D", Gs: 0 }))).toBe(6);
  });

  it("throws when voto_base is null (blank/SV row) — caller must filter presence rows first", () => {
    expect(() => computeFantavoto(record({ voto_base: null, is_blank: true }))).toThrow();
  });
});

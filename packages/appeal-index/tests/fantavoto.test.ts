import { describe, it, expect } from "vitest";
import { computeFantavoto, FANTAVOTO_TARIFF } from "../src/fantavoto.js";
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

  it("ignores Gs and Rf even if present — deliberately excluded from the tariff", () => {
    const withExtra = record({ Gf: 1, Gs: 3, Rf: 2 });
    const plain = record({ Gf: 1 });
    expect(computeFantavoto(withExtra)).toBe(computeFantavoto(plain));
  });

  it("throws when voto_base is null (blank/SV row) — caller must filter presence rows first", () => {
    expect(() => computeFantavoto(record({ voto_base: null, is_blank: true }))).toThrow();
  });
});

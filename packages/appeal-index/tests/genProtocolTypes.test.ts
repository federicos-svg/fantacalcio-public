import { describe, it, expect } from "vitest";
import {
  GEN_PRIMARY_LOSS,
  GEN_ROLES,
  GEN_TN_CLAMP,
  isValidPresence,
  type MatchdayVote,
} from "../src/genProtocol/genTypes.js";

function vote(overrides: Partial<MatchdayVote> = {}): MatchdayVote {
  return {
    season: "2019_20",
    matchday: 1,
    votoBase: 6,
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
    ...overrides,
  };
}

describe("genProtocol/genTypes — presenza valida (§A.1)", () => {
  it("presenza valida ⇔ il voto base esiste", () => {
    expect(isValidPresence(vote({ votoBase: 6 }))).toBe(true);
    expect(isValidPresence(vote({ votoBase: 4 }))).toBe(true);
    expect(isValidPresence(vote({ votoBase: null }))).toBe(false);
  });

  it("il `6*` e' una presenza valida: voto d'ufficio 6, non un senza-voto", () => {
    expect(isValidPresence(vote({ votoBase: 6, isAsterisk: true }))).toBe(true);
  });

  it("un senza-voto NON diventa zero: resta null e non e' presenza", () => {
    const sv = vote({ votoBase: null, Gf: 1 });
    expect(sv.votoBase).toBeNull();
    expect(sv.votoBase).not.toBe(0);
    expect(isValidPresence(sv)).toBe(false);
  });
});

describe("genProtocol/genTypes — costanti congelate (§B.2, §C)", () => {
  it("i ruoli sono i quattro canonici, in ordine", () => {
    expect(GEN_ROLES).toEqual(["P", "D", "C", "A"]);
  });

  it("le perdite primarie sono quelle della tabella §B.2 — valori attesi scritti a mano", () => {
    expect(GEN_PRIMARY_LOSS.T1).toBe("mae");
    expect(GEN_PRIMARY_LOSS.T2).toBe("weightedMae");
    expect(GEN_PRIMARY_LOSS.TN).toBe("mae");
    expect(GEN_PRIMARY_LOSS.T3).toBe("mae");
    expect(GEN_PRIMARY_LOSS.TD).toBe("multinomialLogLoss");
    expect(GEN_PRIMARY_LOSS.T6).toBe("seasonalContributionError");
    expect(GEN_PRIMARY_LOSS.T8).toBe("mae");
  });

  it("ogni bersaglio ha UNA perdita primaria, e sono sette bersagli", () => {
    expect(Object.keys(GEN_PRIMARY_LOSS).sort()).toEqual(["T1", "T2", "T3", "T6", "T8", "TD", "TN"]);
  });

  it("il clamp di T-N e' [0, 38] — 38 giornate, non 34 e non 40", () => {
    expect(GEN_TN_CLAMP).toEqual([0, 38]);
  });
});

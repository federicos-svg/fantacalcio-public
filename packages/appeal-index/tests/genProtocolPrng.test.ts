import { describe, it, expect } from "vitest";
import { GEN_SEEDS, mulberry32, nextIndex } from "../src/genProtocol/prng.js";

/**
 * I tre valori attesi del seme 0, derivati A MANO dall'aritmetica di
 * mulberry32 e scritti qui come costanti indipendenti — mai letti dal modulo
 * sorvegliato.
 *
 * Derivazione del PRIMO, passo per passo (a 32 bit non firmati):
 *   a  = (0 + 0x6D2B79F5) >>> 0            = 1831565813   (0x6D2B79F5)
 *   t  = imul(a ^ (a >>> 15), 1 | a)       = 4269581823   (0xFE7CA5FF)
 *   t  = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t
 *                                          = 1144366260
 *   out = (t ^ (t >>> 14)) >>> 0           = 1144304738
 *   1144304738 / 2^32                      = 0.26642920868471265
 */
const MULBERRY32_SEED_0 = [0.26642920868471265, 0.0003297457005828619, 0.2232720274478197] as const;

describe("genProtocol/prng — mulberry32", () => {
  it("riproduce i tre valori noti del seme 0", () => {
    const random = mulberry32(0);
    expect(random()).toBe(MULBERRY32_SEED_0[0]);
    expect(random()).toBe(MULBERRY32_SEED_0[1]);
    expect(random()).toBe(MULBERRY32_SEED_0[2]);
  });

  it("il primo valore del seme 0 e' 1144304738 / 2^32, ricalcolato nel test", () => {
    expect(mulberry32(0)()).toBe(1144304738 / 4294967296);
  });

  it("due stream con lo stesso seme sono identici, con semi diversi no", () => {
    const a = mulberry32(GEN_SEEDS.bootstrap);
    const b = mulberry32(GEN_SEEDS.bootstrap);
    const c = mulberry32(GEN_SEEDS.bootstrap + 1);
    const first = Array.from({ length: 20 }, () => a());
    expect(Array.from({ length: 20 }, () => b())).toEqual(first);
    expect(Array.from({ length: 20 }, () => c())).not.toEqual(first);
  });

  it("resta dentro [0, 1)", () => {
    const random = mulberry32(12345);
    for (let i = 0; i < 5000; i++) {
      const v = random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("il seme e' forzato a 32 bit non firmati: -1 e 0xFFFFFFFF sono lo stesso stream", () => {
    expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)());
  });

  it("rifiuta un seme non finito", () => {
    expect(() => mulberry32(NaN)).toThrow();
    expect(() => mulberry32(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("genProtocol/prng — nextIndex e semi preregistrati", () => {
  it("copre tutti gli indici e nessuno fuori range", () => {
    const random = mulberry32(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const idx = nextIndex(random, 5);
      expect(Number.isInteger(idx)).toBe(true);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(5);
      seen.add(idx);
    }
    expect(seen.size).toBe(5);
  });

  it("rifiuta un n non intero positivo", () => {
    const random = mulberry32(1);
    expect(() => nextIndex(random, 0)).toThrow();
    expect(() => nextIndex(random, 2.5)).toThrow();
  });

  it("i semi sono quelli congelati da §C — valori attesi scritti a mano", () => {
    expect(GEN_SEEDS.identityAudit).toBe(20260825);
    expect(GEN_SEEDS.bootstrap).toBe(20260902);
    expect(GEN_SEEDS.modifierSimulation).toBe(20260903);
  });
});

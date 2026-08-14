import { describe, it, expect } from "vitest";
import {
  alphaFor,
  DEFAULT_AGGRESSIVENESS,
  type Aggressiveness,
} from "../src/index.js";

describe("aggressiveness — α mapping v1", () => {
  it("maps the three levels to their exact α", () => {
    expect(alphaFor("Prudente")).toBe(0.85);
    expect(alphaFor("Media")).toBe(1.0);
    expect(alphaFor("Aggressiva")).toBe(1.15);
  });

  it("default is Media", () => {
    expect(DEFAULT_AGGRESSIVENESS).toBe("Media");
    expect(alphaFor(DEFAULT_AGGRESSIVENESS)).toBe(1.0);
  });

  it("is deterministic (same input -> same output)", () => {
    expect(alphaFor("Aggressiva")).toBe(alphaFor("Aggressiva"));
  });

  it("is monotone: Prudente < Media < Aggressiva", () => {
    expect(alphaFor("Prudente")).toBeLessThan(alphaFor("Media"));
    expect(alphaFor("Media")).toBeLessThan(alphaFor("Aggressiva"));
  });

  it("covers every Aggressiveness level (exhaustive, no undefined)", () => {
    const levels: Aggressiveness[] = ["Prudente", "Media", "Aggressiva"];
    for (const lvl of levels) {
      expect(typeof alphaFor(lvl)).toBe("number");
      expect(Number.isFinite(alphaFor(lvl))).toBe(true);
    }
  });

  it("throws on an invalid level forced past the type", () => {
    expect(() => alphaFor("Folle" as Aggressiveness)).toThrow(/unknown aggressiveness/);
  });
});

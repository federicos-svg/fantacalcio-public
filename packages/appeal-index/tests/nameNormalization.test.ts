import { describe, it, expect } from "vitest";
import { normalizePlayerName } from "../src/nameNormalization.js";

describe("normalizePlayerName", () => {
  it("lowercases and trims", () => {
    expect(normalizePlayerName("  Synthetic Player  ")).toBe("synthetic player");
  });

  it("strips diacritics", () => {
    expect(normalizePlayerName("Città Synthetic")).toBe("citta synthetic");
  });

  it("collapses punctuation and repeated whitespace", () => {
    expect(normalizePlayerName("Synthetic-Player   V.")).toBe("synthetic player v");
  });

  it("is stable under repeated application", () => {
    const once = normalizePlayerName("Synthétic  Plàyer");
    expect(normalizePlayerName(once)).toBe(once);
  });
});

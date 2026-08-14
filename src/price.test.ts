// Unit tests for the strict positive-integer price parser used by the
// "Registra acquisto" form (src/main.ts doAssign) — previously untested.
// Pure logic, no DOM/storage, per this repo's no-jsdom testing posture (see
// src/logRecovery.test.ts).
import { describe, expect, it } from "vitest";
import { parsePositiveIntegerPrice } from "./price.js";

describe("parsePositiveIntegerPrice", () => {
  it.each(["1", "5", "25", "999"])("accepts a bare positive integer %s", (raw) => {
    expect(parsePositiveIntegerPrice(raw)).toBe(Number(raw));
  });

  it("trims surrounding whitespace around an otherwise valid integer", () => {
    expect(parsePositiveIntegerPrice("  25  ")).toBe(25);
  });

  it("rejects zero", () => {
    expect(parsePositiveIntegerPrice("0")).toBeNull();
  });

  it("rejects a leading zero even when the rest of the value is valid", () => {
    expect(parsePositiveIntegerPrice("01")).toBeNull();
  });

  it("rejects negative numbers", () => {
    expect(parsePositiveIntegerPrice("-5")).toBeNull();
  });

  it("rejects decimals rather than truncating them, unlike parseInt", () => {
    expect(parsePositiveIntegerPrice("1.5")).toBeNull();
  });

  it("rejects exponential notation rather than partially reading it, unlike parseInt", () => {
    expect(parsePositiveIntegerPrice("1e3")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(parsePositiveIntegerPrice("")).toBeNull();
  });

  it("rejects whitespace-only input", () => {
    expect(parsePositiveIntegerPrice("   ")).toBeNull();
  });

  it("rejects non-numeric text", () => {
    expect(parsePositiveIntegerPrice("abc")).toBeNull();
  });

  it("rejects a number with trailing non-numeric characters", () => {
    expect(parsePositiveIntegerPrice("25cr")).toBeNull();
  });

  it("rejects a number with a leading plus sign", () => {
    expect(parsePositiveIntegerPrice("+25")).toBeNull();
  });
});

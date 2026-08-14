import { describe, expect, it } from "vitest";
import { normalizeWikidataTime, validateWikidataBirthDate } from "../src/wikidataBirthDate.js";
import { syntheticRawTimeWithUnknownComponents } from "../fixtures/syntheticEntities.js";

describe("normalizeWikidataTime — never fabricates a component Wikidata itself marks unknown (round 3 finding 2)", () => {
  it("day precision reads year, month and day from the raw time", () => {
    expect(normalizeWikidataTime("+1990-10-01T00:00:00Z", 11)).toEqual({
      precision: "day",
      year: 1990,
      month: 10,
      day: 1,
    });
  });

  it("month precision reads only year and month — the raw day placeholder is never read", () => {
    expect(normalizeWikidataTime("+1992-05-00T00:00:00Z", 10)).toEqual({
      precision: "month",
      year: 1992,
      month: 5,
    });
  });

  it("year precision reads only the year — raw month/day placeholders (Wikidata's own \"00\") are never read, never promoted to real components", () => {
    const result = normalizeWikidataTime(
      syntheticRawTimeWithUnknownComponents.rawTime,
      syntheticRawTimeWithUnknownComponents.rawPrecision,
    );
    expect(result).toEqual({ precision: "year", year: 1990 });
    expect("month" in result).toBe(false);
    expect("day" in result).toBe(false);
  });

  it("a precision below year (decade/century/...) has no usable calendar component — falls back to unknown, preserving the raw fields", () => {
    expect(normalizeWikidataTime("+1990-00-00T00:00:00Z", 8)).toEqual({
      precision: "unknown",
      rawPrecision: 8,
      rawTime: "+1990-00-00T00:00:00Z",
    });
  });

  it("a BCE time value (leading minus) is never read as a positive-era date", () => {
    expect(normalizeWikidataTime("-0100-01-01T00:00:00Z", 11)).toEqual({
      precision: "unknown",
      rawPrecision: 11,
      rawTime: "-0100-01-01T00:00:00Z",
    });
  });

  it("an unparseable raw time value falls back to unknown, nothing is silently discarded", () => {
    expect(normalizeWikidataTime("not-a-time-value", 11)).toEqual({
      precision: "unknown",
      rawPrecision: 11,
      rawTime: "not-a-time-value",
    });
  });

  it("null raw time or null raw precision produces an explicit unknown value", () => {
    expect(normalizeWikidataTime(null, null)).toEqual({
      precision: "unknown",
      rawPrecision: null,
      rawTime: null,
    });
  });

  it("is deterministic and never reads the system clock — both arguments are always explicit", () => {
    expect(normalizeWikidataTime.length).toBe(2);
    const results = Array.from({ length: 5 }, () =>
      JSON.stringify(normalizeWikidataTime("+1990-10-01T00:00:00Z", 11)),
    );
    expect(new Set(results).size).toBe(1);
  });
});

describe("normalizeWikidataTime — never normalizes a calendarically impossible date (round 4 finding 2)", () => {
  it("30 February at day precision falls back to unknown, raw fields preserved", () => {
    expect(normalizeWikidataTime("+1990-02-30T00:00:00Z", 11)).toEqual({
      precision: "unknown",
      rawPrecision: 11,
      rawTime: "+1990-02-30T00:00:00Z",
    });
  });

  it("31 April at day precision falls back to unknown", () => {
    expect(normalizeWikidataTime("+1990-04-31T00:00:00Z", 11)).toEqual({
      precision: "unknown",
      rawPrecision: 11,
      rawTime: "+1990-04-31T00:00:00Z",
    });
  });

  it("29 February on a non-leap year falls back to unknown", () => {
    expect(normalizeWikidataTime("+2023-02-29T00:00:00Z", 11)).toEqual({
      precision: "unknown",
      rawPrecision: 11,
      rawTime: "+2023-02-29T00:00:00Z",
    });
  });

  it("29 February on a leap year is a valid day-precision value", () => {
    expect(normalizeWikidataTime("+2024-02-29T00:00:00Z", 11)).toEqual({
      precision: "day",
      year: 2024,
      month: 2,
      day: 29,
    });
  });

  it("month 13 at month precision falls back to unknown", () => {
    expect(normalizeWikidataTime("+1990-13-00T00:00:00Z", 10)).toEqual({
      precision: "unknown",
      rawPrecision: 10,
      rawTime: "+1990-13-00T00:00:00Z",
    });
  });

  it("month 0 at month precision falls back to unknown", () => {
    expect(normalizeWikidataTime("+1990-00-00T00:00:00Z", 10)).toEqual({
      precision: "unknown",
      rawPrecision: 10,
      rawTime: "+1990-00-00T00:00:00Z",
    });
  });

  it("year 0 falls back to unknown at year precision", () => {
    expect(normalizeWikidataTime("+0000-00-00T00:00:00Z", 9)).toEqual({
      precision: "unknown",
      rawPrecision: 9,
      rawTime: "+0000-00-00T00:00:00Z",
    });
  });
});

describe("validateWikidataBirthDate — pure structural + calendar validation (round 4 finding 2)", () => {
  it("rejects 30 February at day precision", () => {
    expect(validateWikidataBirthDate({ precision: "day", year: 1990, month: 2, day: 30 })).toBe(
      false,
    );
  });

  it("rejects 31 April at day precision", () => {
    expect(validateWikidataBirthDate({ precision: "day", year: 1990, month: 4, day: 31 })).toBe(
      false,
    );
  });

  it("rejects 29 February on a non-leap year", () => {
    expect(validateWikidataBirthDate({ precision: "day", year: 2023, month: 2, day: 29 })).toBe(
      false,
    );
  });

  it("accepts 29 February on a leap year", () => {
    expect(validateWikidataBirthDate({ precision: "day", year: 2024, month: 2, day: 29 })).toBe(
      true,
    );
  });

  it("rejects month 13 at month precision", () => {
    expect(validateWikidataBirthDate({ precision: "month", year: 1990, month: 13 })).toBe(false);
  });

  it("rejects month 0 at month precision", () => {
    expect(validateWikidataBirthDate({ precision: "month", year: 1990, month: 0 })).toBe(false);
  });

  it("rejects year 0 at year precision", () => {
    expect(validateWikidataBirthDate({ precision: "year", year: 0 })).toBe(false);
  });

  it("rejects a negative year", () => {
    expect(validateWikidataBirthDate({ precision: "year", year: -5 })).toBe(false);
  });

  it("accepts a well-formed day-precision date", () => {
    expect(validateWikidataBirthDate({ precision: "day", year: 1990, month: 10, day: 1 })).toBe(
      true,
    );
  });

  it("accepts a well-formed year-precision value", () => {
    expect(validateWikidataBirthDate({ precision: "year", year: 1988 })).toBe(true);
  });

  it("\"unknown\" is always structurally valid — it never claims a usable calendar component", () => {
    expect(
      validateWikidataBirthDate({ precision: "unknown", rawPrecision: null, rawTime: null }),
    ).toBe(true);
  });

  it("is a pure function — never reads the system clock", () => {
    expect(validateWikidataBirthDate.length).toBe(1);
  });
});

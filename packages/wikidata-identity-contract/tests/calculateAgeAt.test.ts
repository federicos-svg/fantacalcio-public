import { describe, expect, it } from "vitest";
import {
  AgeCalculationError,
  calculateAgeAt,
  resolveAgeAtReferenceDate,
} from "../src/calculateAgeAt.js";

describe("calculateAgeAt", () => {
  it("birthday not yet reached this year — subtracts one (task's required example)", () => {
    expect(calculateAgeAt("1990-10-01", "2019-08-20")).toBe(28);
  });

  it("reference date exactly on the birthday — full new age (task's required example)", () => {
    expect(calculateAgeAt("1990-10-01", "2019-10-01")).toBe(29);
  });

  it("birthday already passed this year — full age", () => {
    expect(calculateAgeAt("1990-10-01", "2019-11-15")).toBe(29);
  });

  it("handles a leap-year birth date (29 February) with a non-leap reference year, birthday not yet reached", () => {
    expect(calculateAgeAt("1996-02-29", "2019-01-15")).toBe(22);
  });

  it("handles a leap-year birth date (29 February) with a leap reference year, birthday reached", () => {
    expect(calculateAgeAt("1996-02-29", "2024-03-01")).toBe(28);
  });

  it("season 2019-20 uses a reference date in 2019, not the current date — deterministic regardless of when the test runs", () => {
    const seasonStartDate2019 = "2019-08-24";
    expect(calculateAgeAt("1990-10-01", seasonStartDate2019)).toBe(28);
  });

  it("throws reference_before_birth when the reference date precedes the birth date", () => {
    expect(() => calculateAgeAt("2000-01-01", "1999-12-31")).toThrow(AgeCalculationError);
    try {
      calculateAgeAt("2000-01-01", "1999-12-31");
      expect.unreachable();
    } catch (error) {
      expect((error as AgeCalculationError).reasonCode).toBe("reference_before_birth");
    }
  });

  it("throws invalid_date_of_birth on a calendarically impossible birth date (30 February)", () => {
    expect(() => calculateAgeAt("1990-02-30", "2019-01-01")).toThrow(AgeCalculationError);
    try {
      calculateAgeAt("1990-02-30", "2019-01-01");
      expect.unreachable();
    } catch (error) {
      expect((error as AgeCalculationError).reasonCode).toBe("invalid_date_of_birth");
    }
  });

  it("throws invalid_reference_date on a calendarically impossible reference date (29 February on a non-leap year)", () => {
    expect(() => calculateAgeAt("1990-01-01", "2019-02-29")).toThrow(AgeCalculationError);
    try {
      calculateAgeAt("1990-01-01", "2019-02-29");
      expect.unreachable();
    } catch (error) {
      expect((error as AgeCalculationError).reasonCode).toBe("invalid_reference_date");
    }
  });

  it("is deterministic — same input always produces the same output", () => {
    const results = Array.from({ length: 5 }, () => calculateAgeAt("1990-10-01", "2019-08-20"));
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe(28);
  });

  it("never uses the system clock — no method on this module accepts zero arguments", () => {
    expect(calculateAgeAt.length).toBe(2);
  });
});

describe("resolveAgeAtReferenceDate — precision gate", () => {
  it("computes an exact age for a day-precision WikidataBirthDate", () => {
    const result = resolveAgeAtReferenceDate(
      { precision: "day", year: 1990, month: 10, day: 1 },
      "2019-08-20",
    );
    expect(result).toEqual({ status: "OK", ageAtReferenceDate: 28 });
  });

  it("returns INSUFFICIENT_DATE_PRECISION for month-only precision — never fabricates a day, never reaches calculateAgeAt", () => {
    const result = resolveAgeAtReferenceDate(
      { precision: "month", year: 1990, month: 10 },
      "2019-08-20",
    );
    expect(result).toEqual({ status: "INSUFFICIENT_DATE_PRECISION" });
  });

  it("returns INSUFFICIENT_DATE_PRECISION for year-only precision — never fabricates month/day", () => {
    const result = resolveAgeAtReferenceDate({ precision: "year", year: 1990 }, "2019-08-20");
    expect(result).toEqual({ status: "INSUFFICIENT_DATE_PRECISION" });
  });

  it("returns INSUFFICIENT_DATE_PRECISION for unknown precision", () => {
    const result = resolveAgeAtReferenceDate(
      { precision: "unknown", rawPrecision: null, rawTime: null },
      "2019-08-20",
    );
    expect(result).toEqual({ status: "INSUFFICIENT_DATE_PRECISION" });
  });
});

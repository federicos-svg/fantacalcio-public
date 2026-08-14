import { describe, expect, it } from "vitest";
import { classifyDateOfBirthUsability } from "../src/dateOfBirthUsability.js";
import { calculateAgeAt, resolveAgeAtReferenceDate, AgeCalculationError } from "../src/calculateAgeAt.js";
import {
  syntheticAllUnreferencedDuplicateA,
  syntheticAllUnreferencedDuplicateB,
  syntheticCompatibleCompleteStatement,
  syntheticCompatiblePartialStatement,
  syntheticDayPrecisionStatement,
  syntheticDeprecatedStatement,
  syntheticDiscordantStatementA,
  syntheticDiscordantStatementB,
  syntheticIncompatibleCompleteStatement,
  syntheticIncompatiblePartialStatement,
  syntheticInvalidDayStatement,
  syntheticMixedEntityStatementA,
  syntheticMixedEntityStatementB,
  syntheticMonthPrecisionStatement,
  syntheticNoReferencesStatement,
  syntheticNormalCompleteStatement,
  syntheticNormalDiscordantStatement,
  syntheticPreferredCompleteStatement,
  syntheticPreferredConflictA,
  syntheticPreferredConflictB,
  syntheticPreferredPartialStatement,
  syntheticQueriedLongAfterReferenceStatement,
  syntheticUnknownPrecisionStatement,
  syntheticUnreferencedThenReferencedStatementA,
  syntheticUnreferencedThenReferencedStatementB,
  syntheticYearPrecisionStatement,
} from "../fixtures/syntheticEntities.js";

describe("classifyDateOfBirthUsability — RETROSPECTIVE_STATIC_ATTRIBUTE policy", () => {
  it("a date of birth queried in 2026 is USABLE_RETROSPECTIVE_STATIC for a 2019 reference date — observed_at in the future of the reference date is not, by itself, a problem", () => {
    expect(syntheticQueriedLongAfterReferenceStatement.observedAt).toBe("2026-01-01");
    const result = classifyDateOfBirthUsability(
      [syntheticQueriedLongAfterReferenceStatement],
      "2019-08-24",
    );
    expect(result).toBe("USABLE_RETROSPECTIVE_STATIC");
  });

  it("the age is computed against the historical reference date, not against observed_at or the current date", () => {
    const birthDate = syntheticQueriedLongAfterReferenceStatement.birthDate;
    if (birthDate.precision !== "day") throw new Error("fixture must be day precision");
    const age = calculateAgeAt(
      `${birthDate.year}-${String(birthDate.month).padStart(2, "0")}-${String(birthDate.day).padStart(2, "0")}`,
      "2019-08-24",
    );
    expect(age).toBe(28);
  });

  it("a deprecated-rank statement is never auto-selected — a deprecated-only entity has no eligible statement", () => {
    expect(classifyDateOfBirthUsability([syntheticDeprecatedStatement], "2019-08-24")).toBe(
      "INSUFFICIENT_PROVENANCE",
    );
  });

  it("a deprecated statement alongside a valid one is ignored, not treated as a conflict", () => {
    const result = classifyDateOfBirthUsability(
      [syntheticDeprecatedStatement, syntheticDayPrecisionStatement],
      "2019-08-24",
    );
    expect(result).toBe("USABLE_RETROSPECTIVE_STATIC");
  });

  it("absence of references produces an explicit status — never silent authority", () => {
    expect(classifyDateOfBirthUsability([syntheticNoReferencesStatement], "2019-08-24")).toBe(
      "INSUFFICIENT_PROVENANCE",
    );
  });

  it("no statements at all is INSUFFICIENT_PROVENANCE", () => {
    expect(classifyDateOfBirthUsability([], "2019-08-24")).toBe("INSUFFICIENT_PROVENANCE");
  });

  it("a well-formed, day-precision, referenced, preferred-rank statement is USABLE_RETROSPECTIVE_STATIC", () => {
    expect(classifyDateOfBirthUsability([syntheticDayPrecisionStatement], "2019-08-24")).toBe(
      "USABLE_RETROSPECTIVE_STATIC",
    );
  });

  it("never reads the system clock — the reference date is always an explicit argument", () => {
    expect(classifyDateOfBirthUsability.length).toBe(2);
  });

  it("rejects a calendarically invalid reference date instead of silently proceeding", () => {
    expect(() =>
      classifyDateOfBirthUsability([syntheticDayPrecisionStatement], "2019-02-30"),
    ).toThrow();
  });
});

describe("classifyDateOfBirthUsability — real Wikidata precision, no fabricated day/month (round 3 finding 2)", () => {
  it("a day-precision statement has real year/month/day components", () => {
    const birthDate = syntheticDayPrecisionStatement.birthDate;
    expect(birthDate).toEqual({ precision: "day", year: 1990, month: 10, day: 1 });
  });

  it("a month-precision statement never carries a fabricated `day` field", () => {
    const birthDate = syntheticMonthPrecisionStatement.birthDate;
    expect(birthDate.precision).toBe("month");
    expect("day" in birthDate).toBe(false);
    expect(classifyDateOfBirthUsability([syntheticMonthPrecisionStatement], "2019-08-24")).toBe(
      "INSUFFICIENT_DATE_PRECISION",
    );
  });

  it("a year-precision statement never carries a fabricated `month`/`day` field", () => {
    const birthDate = syntheticYearPrecisionStatement.birthDate;
    expect(birthDate.precision).toBe("year");
    expect("month" in birthDate).toBe(false);
    expect("day" in birthDate).toBe(false);
    expect(classifyDateOfBirthUsability([syntheticYearPrecisionStatement], "2019-08-24")).toBe(
      "INSUFFICIENT_DATE_PRECISION",
    );
  });

  it("unknown precision is never usable for an exact age", () => {
    expect(classifyDateOfBirthUsability([syntheticUnknownPrecisionStatement], "2019-08-24")).toBe(
      "INSUFFICIENT_DATE_PRECISION",
    );
  });

  it("two eligible statements for the same entity reporting the same complete date are usable, never a false conflict", () => {
    const result = classifyDateOfBirthUsability(
      [syntheticDayPrecisionStatement, syntheticDayPrecisionStatement],
      "2019-08-24",
    );
    expect(result).toBe("USABLE_RETROSPECTIVE_STATIC");
  });

  it("two discordant complete statements for the same entity require review, never a silent pick", () => {
    const result = classifyDateOfBirthUsability(
      [syntheticDiscordantStatementA, syntheticDiscordantStatementB],
      "2019-08-24",
    );
    expect(result).toBe("CONFLICT_REQUIRES_REVIEW");
  });

  it("a complete day-precision date compatible with a partial year-only date (same year) is usable — no false conflict", () => {
    const result = classifyDateOfBirthUsability(
      [syntheticCompatiblePartialStatement, syntheticCompatibleCompleteStatement],
      "2019-08-24",
    );
    expect(result).toBe("USABLE_RETROSPECTIVE_STATIC");
  });

  it("a complete day-precision date incompatible with a partial year-only date (different year) requires review", () => {
    const result = classifyDateOfBirthUsability(
      [syntheticIncompatiblePartialStatement, syntheticIncompatibleCompleteStatement],
      "2019-08-24",
    );
    expect(result).toBe("CONFLICT_REQUIRES_REVIEW");
  });

  it("statements for two different entities are never compared as competing values — MIXED_ENTITY_INPUT", () => {
    const result = classifyDateOfBirthUsability(
      [syntheticMixedEntityStatementA, syntheticMixedEntityStatementB],
      "2019-08-24",
    );
    expect(result).toBe("MIXED_ENTITY_INPUT");
  });
});

describe("classifyDateOfBirthUsability — never usable for a calendarically impossible date (round 4 finding 2)", () => {
  it("a hand-built, structurally impossible day (30 February) is INVALID_BIRTH_DATE, never USABLE", () => {
    const result = classifyDateOfBirthUsability([syntheticInvalidDayStatement], "2019-08-24");
    expect(result).toBe("INVALID_BIRTH_DATE");
    expect(result).not.toBe("USABLE_RETROSPECTIVE_STATIC");
  });

  it("resolveAgeAtReferenceDate still refuses to compute an age from an invalid day-precision birth date", () => {
    expect(() =>
      resolveAgeAtReferenceDate(
        { precision: "day", year: 1990, month: 2, day: 30 },
        "2019-08-24",
      ),
    ).toThrow(AgeCalculationError);
  });
});

describe("classifyDateOfBirthUsability — active rank pool, order-independent selection (round 4 finding 3)", () => {
  it("a preferred statement is usable despite a discordant normal statement for the same entity — normal is excluded from the active pool", () => {
    const result = classifyDateOfBirthUsability(
      [syntheticPreferredCompleteStatement, syntheticNormalDiscordantStatement],
      "2019-08-24",
    );
    expect(result).toBe("USABLE_RETROSPECTIVE_STATIC");
  });

  it("two discordant preferred statements for the same entity is a real conflict", () => {
    const result = classifyDateOfBirthUsability(
      [syntheticPreferredConflictA, syntheticPreferredConflictB],
      "2019-08-24",
    );
    expect(result).toBe("CONFLICT_REQUIRES_REVIEW");
  });

  it("with no preferred statement, two discordant normal statements is still a conflict", () => {
    const result = classifyDateOfBirthUsability(
      [syntheticDiscordantStatementA, syntheticDiscordantStatementB],
      "2019-08-24",
    );
    expect(result).toBe("CONFLICT_REQUIRES_REVIEW");
  });

  it("same value, first statement unreferenced and second referenced -> usable", () => {
    const result = classifyDateOfBirthUsability(
      [syntheticUnreferencedThenReferencedStatementA, syntheticUnreferencedThenReferencedStatementB],
      "2019-08-24",
    );
    expect(result).toBe("USABLE_RETROSPECTIVE_STATIC");
  });

  it("the same input in reversed order produces the same result", () => {
    const forward = classifyDateOfBirthUsability(
      [syntheticUnreferencedThenReferencedStatementA, syntheticUnreferencedThenReferencedStatementB],
      "2019-08-24",
    );
    const reversed = classifyDateOfBirthUsability(
      [syntheticUnreferencedThenReferencedStatementB, syntheticUnreferencedThenReferencedStatementA],
      "2019-08-24",
    );
    expect(forward).toBe(reversed);
  });

  it("equivalent duplicates that are ALL unreferenced -> INSUFFICIENT_PROVENANCE", () => {
    const result = classifyDateOfBirthUsability(
      [syntheticAllUnreferencedDuplicateA, syntheticAllUnreferencedDuplicateB],
      "2019-08-24",
    );
    expect(result).toBe("INSUFFICIENT_PROVENANCE");
  });

  it("a preferred partial (year-only) statement plus a normal COMPLETE statement is INSUFFICIENT_DATE_PRECISION — the normal's day precision is never silently promoted", () => {
    const result = classifyDateOfBirthUsability(
      [syntheticPreferredPartialStatement, syntheticNormalCompleteStatement],
      "2019-08-24",
    );
    expect(result).toBe("INSUFFICIENT_DATE_PRECISION");
  });

  it("is deterministic across multiple permutations of the same input array", () => {
    const inputs = [syntheticPreferredCompleteStatement, syntheticNormalDiscordantStatement];
    const permutations = [inputs, [inputs[1]!, inputs[0]!]];
    const results = permutations.map((permutation) =>
      classifyDateOfBirthUsability(permutation, "2019-08-24"),
    );
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("USABLE_RETROSPECTIVE_STATIC");
  });
});

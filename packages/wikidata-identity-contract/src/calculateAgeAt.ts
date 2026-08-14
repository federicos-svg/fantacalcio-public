import { compareCalendarDates, formatCalendarDate, parseCalendarDate } from "./calendarDate.js";
import type { AgeAtReferenceDateResult, WikidataBirthDate } from "./types.js";

export type AgeCalculationReasonCode =
  | "invalid_date_of_birth"
  | "invalid_reference_date"
  | "reference_before_birth";

export class AgeCalculationError extends Error {
  constructor(
    public readonly reasonCode: AgeCalculationReasonCode,
    message: string,
  ) {
    super(message);
    this.name = "AgeCalculationError";
  }
}

// Pure function. Never reads the system clock — both dates are always
// explicit arguments (task constraint: no `new Date()` with no argument, no
// implicit "today"). Precise to the day: a birthday not yet reached this
// year subtracts one, a birthday already reached (including exactly on the
// reference date) does not.
export function calculateAgeAt(dateOfBirth: string, referenceDate: string): number {
  let dob;
  try {
    dob = parseCalendarDate(dateOfBirth);
  } catch (error) {
    throw new AgeCalculationError(
      "invalid_date_of_birth",
      `dateOfBirth is not a valid calendar date: ${(error as Error).message}`,
    );
  }

  let ref;
  try {
    ref = parseCalendarDate(referenceDate);
  } catch (error) {
    throw new AgeCalculationError(
      "invalid_reference_date",
      `referenceDate is not a valid calendar date: ${(error as Error).message}`,
    );
  }

  if (compareCalendarDates(ref, dob) < 0) {
    throw new AgeCalculationError(
      "reference_before_birth",
      `referenceDate ${referenceDate} precedes dateOfBirth ${dateOfBirth}`,
    );
  }

  let age = ref.year - dob.year;
  const birthdayNotYetReachedThisYear =
    ref.month < dob.month || (ref.month === dob.month && ref.day < dob.day);
  if (birthdayNotYetReachedThisYear) {
    age -= 1;
  }
  return age;
}

// Precision gate: never fabricates a missing month/day. A "year-only",
// "year+month", or "unknown" Wikidata precision can never produce an exact
// age here — the gate runs BEFORE any month/day is ever read off
// `birthDate`, so a non-day-precision value never even reaches
// `calculateAgeAt`.
export function resolveAgeAtReferenceDate(
  birthDate: WikidataBirthDate,
  referenceDate: string,
): AgeAtReferenceDateResult {
  if (birthDate.precision !== "day") {
    return { status: "INSUFFICIENT_DATE_PRECISION" };
  }
  const dateOfBirth = formatCalendarDate(birthDate);
  return { status: "OK", ageAtReferenceDate: calculateAgeAt(dateOfBirth, referenceDate) };
}

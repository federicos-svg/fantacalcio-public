import { daysInMonth } from "./calendarDate.js";
import type { WikidataBirthDate } from "./types.js";

// Wikidata's raw time value is always ISO-8601-shaped with a leading sign
// and a time-of-day of exactly 00:00:00Z, e.g. "+1990-05-01T00:00:00Z". Its
// own `precision` code (Wikibase numeric vocabulary) is the ONLY authority
// on which of year/month/day are real: 11 = day, 10 = month, 9 = year, and
// anything below 9 (decade/century/millennium/...) has no usable calendar
// component. Wikidata fills the month/day slots with "00" whenever they are
// not known at the declared precision (e.g. year precision -> "1990-00-00")
// — those zeros are Wikidata's own "unknown" placeholder, never a real
// month/day, so they must never be read unless precision says they are real.
const WIKIDATA_TIME_PATTERN = /^([+-])(\d{4,})-(\d{2})-(\d{2})T00:00:00Z$/;

const DAY_PRECISION = 11;
const MONTH_PRECISION = 10;
const YEAR_PRECISION = 9;

const MIN_YEAR = 1;

// Pure, fail-closed structural + calendar validation for an already-built
// WikidataBirthDate (round 4 finding 2). "unknown" never claims a usable
// calendar component in the first place, so it is always structurally
// valid as a value — it is excluded from exact-age usability elsewhere
// (precision !== "day" gates), never here. "day", "month" and "year" each
// only ever carry the fields their own variant declares (enforced by the
// discriminated union itself — a "month" value has no `day` field to
// validate), so this only needs to check the components that DO exist:
// a positive integer year, an in-range month, and — for day precision — a
// day that is real for that specific month and year (leap years included).
export function validateWikidataBirthDate(birthDate: WikidataBirthDate): boolean {
  if (birthDate.precision === "unknown") {
    return true;
  }
  if (!Number.isInteger(birthDate.year) || birthDate.year < MIN_YEAR) {
    return false;
  }
  if (birthDate.precision === "year") {
    return true;
  }
  if (!Number.isInteger(birthDate.month) || birthDate.month < 1 || birthDate.month > 12) {
    return false;
  }
  if (birthDate.precision === "month") {
    return true;
  }
  return (
    Number.isInteger(birthDate.day) &&
    birthDate.day >= 1 &&
    birthDate.day <= daysInMonth(birthDate.year, birthDate.month)
  );
}

// Normalizes a raw Wikidata time value + precision code into a
// WikidataBirthDate. Never fabricates a component: a month/day that
// Wikidata itself marks unknown (via a precision below their level) is
// never read, and any BCE date, structurally malformed value, or
// calendarically impossible date (round 4 finding 2 — e.g. "1990-02-30" or
// "1990-04-31") falls back to "unknown" together with the original raw
// fields — nothing is silently discarded, and nothing impossible is ever
// normalized into a usable value.
export function normalizeWikidataTime(
  rawTime: string | null,
  rawPrecision: number | null,
): WikidataBirthDate {
  if (rawTime === null || rawPrecision === null) {
    return { precision: "unknown", rawPrecision, rawTime };
  }

  const match = WIKIDATA_TIME_PATTERN.exec(rawTime);
  if (match === null || match[1] === "-") {
    return { precision: "unknown", rawPrecision, rawTime };
  }

  const year = Number(match[2]);
  const month = Number(match[3]);
  const day = Number(match[4]);

  const fallback: WikidataBirthDate = { precision: "unknown", rawPrecision, rawTime };

  if (rawPrecision === DAY_PRECISION) {
    const candidate: WikidataBirthDate = { precision: "day", year, month, day };
    return validateWikidataBirthDate(candidate) ? candidate : fallback;
  }
  if (rawPrecision === MONTH_PRECISION) {
    const candidate: WikidataBirthDate = { precision: "month", year, month };
    return validateWikidataBirthDate(candidate) ? candidate : fallback;
  }
  if (rawPrecision === YEAR_PRECISION) {
    const candidate: WikidataBirthDate = { precision: "year", year };
    return validateWikidataBirthDate(candidate) ? candidate : fallback;
  }

  return fallback;
}

// Plain calendar date validation (YYYY-MM-DD), no time-of-day/timezone — birth
// dates and historical reference dates are calendar dates, not instants.
// Deliberately does not delegate to `new Date()`, which silently normalizes
// impossible dates (e.g. 2024-02-30 rolls to March) instead of rejecting them.

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Exported for reuse by anything else that needs the real, leap-year-aware
// day count for a given year/month — e.g. WikidataBirthDate validation —
// without duplicating (and risking a divergent) leap-year rule.
export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_IN_MONTH[month - 1]!;
}

export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export class CalendarDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarDateError";
  }
}

export function parseCalendarDate(value: unknown): CalendarDate {
  if (typeof value !== "string") {
    throw new CalendarDateError(`not a string: ${JSON.stringify(value)}`);
  }
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (match === null) {
    throw new CalendarDateError(`not a YYYY-MM-DD calendar date: ${JSON.stringify(value)}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    throw new CalendarDateError(`month out of range: ${JSON.stringify(value)}`);
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new CalendarDateError(`day out of range for month/year: ${JSON.stringify(value)}`);
  }
  return { year, month, day };
}

// Calendar-order comparison — never a timestamp/epoch comparison.
export function compareCalendarDates(a: CalendarDate, b: CalendarDate): -1 | 0 | 1 {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

// Formats a complete, already-known calendar date as YYYY-MM-DD. Never
// invents a component: callers must supply a real year/month/day, never a
// placeholder for a component the source didn't provide.
export function formatCalendarDate(date: CalendarDate): string {
  const year = String(date.year).padStart(4, "0");
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

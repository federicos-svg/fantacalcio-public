import type { PointInTimeFeatureDeclaration, PointInTimeStatus } from "./types.js";

// Structural ISO-8601 shape with an explicit timezone designator (Z or +HH:MM/-HH:MM)
// and captured components — deliberately stricter than what `new Date()` accepts,
// since `new Date()` silently normalizes calendarically impossible values (e.g.
// "2024-02-30" rolls over to March instead of failing) rather than rejecting them.
const ISO_8601_PARTS =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;

export type PointInTimeValidationReasonCode =
  | "invalid_observed_at"
  | "invalid_available_at"
  | "invalid_cutoff_at"
  | "provenance_mismatch";

export class PointInTimeValidationError extends Error {
  constructor(
    public readonly reasonCode: PointInTimeValidationReasonCode,
    message: string,
  ) {
    super(message);
    this.name = "PointInTimeValidationError";
  }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_IN_MONTH[month - 1]!;
}

// Rejects calendarically/clock-impossible values instead of normalizing them:
// month 13, day 30 in February, 29 February on a non-leap year, hour 24, an out-of-range
// timezone offset — none of these are silently rolled over to an adjacent valid date.
function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = ISO_8601_PARTS.exec(value);
  if (match === null) {
    return false;
  }

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, , , , offsetHourStr, offsetMinuteStr] =
    match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return false;
  }
  if (hour > 23) {
    return false;
  }
  if (minute > 59) {
    return false;
  }
  if (second > 59) {
    return false;
  }
  if (offsetHourStr !== undefined) {
    if (Number(offsetHourStr) > 23 || Number(offsetMinuteStr) > 59) {
      return false;
    }
  }

  // Defensive final check — should never fire once the manual checks above pass, but
  // costs nothing and guards against a gap in the manual validation above.
  return !Number.isNaN(new Date(value).getTime());
}

// Fields duplicated on both PointInTimeFeatureDeclaration and its nested
// ProvenanceRecord. Both must always agree — a declaration that disagrees with its
// own provenance is untrustworthy input, not a classification case.
const PROVENANCE_COHERENCE_FIELDS = [
  "source",
  "sourceEntityId",
  "season",
  "observedAt",
  "availableAt",
  "cutoffAt",
  "snapshotClassification",
  "transformVersion",
  "missingnessStatus",
  "conflictStatus",
] as const;

// Fail-closed gate run before any classification logic. Throws — never returns a
// PointInTimeStatus — so a malformed timestamp or an incoherent provenance can never
// silently fall through to BUILDABLE_POINT_IN_TIME (or any other status).
export function validatePointInTimeDeclaration(
  declaration: PointInTimeFeatureDeclaration,
): void {
  if (!isValidIsoTimestamp(declaration.observedAt)) {
    throw new PointInTimeValidationError(
      "invalid_observed_at",
      `observedAt is not a valid, calendarically real ISO-8601 timestamp with an explicit timezone: ${JSON.stringify(declaration.observedAt)}`,
    );
  }
  if (!isValidIsoTimestamp(declaration.availableAt)) {
    throw new PointInTimeValidationError(
      "invalid_available_at",
      `availableAt is not a valid, calendarically real ISO-8601 timestamp with an explicit timezone: ${JSON.stringify(declaration.availableAt)}`,
    );
  }
  if (!isValidIsoTimestamp(declaration.cutoffAt)) {
    throw new PointInTimeValidationError(
      "invalid_cutoff_at",
      `cutoffAt is not a valid, calendarically real ISO-8601 timestamp with an explicit timezone: ${JSON.stringify(declaration.cutoffAt)}`,
    );
  }

  for (const field of PROVENANCE_COHERENCE_FIELDS) {
    const declared = declaration[field];
    const provenanced = declaration.provenance[field];
    if (declared !== provenanced) {
      throw new PointInTimeValidationError(
        "provenance_mismatch",
        `declaration.${field} (${JSON.stringify(declared)}) does not match provenance.${field} (${JSON.stringify(provenanced)})`,
      );
    }
  }
}

// Pure, deterministic — once validated. Leakage always wins: a feature that is both
// "known after cutoff" and "missing" is still LEAKAGE_RISK, never downgraded to
// NOT_BUILDABLE — leakage is a correctness hazard for training, missingness is a
// coverage gap.
export function classifyPointInTime(
  declaration: PointInTimeFeatureDeclaration,
): PointInTimeStatus {
  validatePointInTimeDeclaration(declaration);

  const availableAfterCutoff =
    new Date(declaration.availableAt).getTime() > new Date(declaration.cutoffAt).getTime();
  if (availableAfterCutoff) {
    return "LEAKAGE_RISK";
  }
  if (declaration.snapshotClassification === "CURRENT_VALUE_ONLY") {
    return "LEAKAGE_RISK";
  }

  if (
    declaration.missingnessStatus === "missing_not_tested" ||
    declaration.missingnessStatus === "missing_by_source" ||
    declaration.missingnessStatus === "missing_plan_restricted"
  ) {
    return "NOT_BUILDABLE";
  }

  if (declaration.conflictStatus === "conflict_unresolved") {
    return "PARTIAL_POINT_IN_TIME";
  }

  if (declaration.snapshotClassification === "UNKNOWN") {
    return "PARTIAL_POINT_IN_TIME";
  }

  return "BUILDABLE_POINT_IN_TIME";
}

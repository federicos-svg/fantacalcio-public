import { parseCalendarDate } from "./calendarDate.js";
import { validateWikidataBirthDate } from "./wikidataBirthDate.js";
import type { DateOfBirthStatement, DateOfBirthUsabilityStatus, WikidataBirthDate } from "./types.js";

// RETROSPECTIVE_STATIC_ATTRIBUTE policy (round 2 finding 3). A person's date
// of birth does not change, so querying it in 2026 for a 2019 reference date
// is not, by itself, a correctness hazard the way a post-cutoff match result
// would be. The dynamic-feature leakage gates in
// packages/hybrid-dataset-contract are UNCHANGED by this — this exception is
// scoped to the static date-of-birth attribute only.

function yearOf(date: WikidataBirthDate): number | null {
  return date.precision === "unknown" ? null : date.year;
}

function monthOf(date: WikidataBirthDate): number | null {
  return date.precision === "month" || date.precision === "day" ? date.month : null;
}

function dayOf(date: WikidataBirthDate): number | null {
  return date.precision === "day" ? date.day : null;
}

// Two WikidataBirthDate values are compatible when every component they BOTH
// specify agrees. A day-precision date and a year-only date that share the
// same year are compatible (round 3 finding 2: a partial value must never
// raise a false conflict against a compatible complete one). They are
// incompatible the moment any shared component disagrees.
function datesAreCompatible(a: WikidataBirthDate, b: WikidataBirthDate): boolean {
  const ay = yearOf(a);
  const by = yearOf(b);
  if (ay !== null && by !== null && ay !== by) return false;

  const am = monthOf(a);
  const bm = monthOf(b);
  if (am !== null && bm !== null && am !== bm) return false;

  const ad = dayOf(a);
  const bd = dayOf(b);
  if (ad !== null && bd !== null && ad !== bd) return false;

  return true;
}

// Given every DateOfBirthStatement known, ALL for the same wikidataEntityId:
//
//   1. statements for more than one entity                     -> MIXED_ENTITY_INPUT
//   2. no eligible (non-deprecated) statement at all            -> INSUFFICIENT_PROVENANCE
//   3. active rank pool (round 4 finding 3): if any eligible statement is
//      `preferred`, ONLY `preferred` statements are considered from here on
//      — a stale `normal` statement never contradicts or dilutes a
//      `preferred` one. Otherwise all eligible (`normal`) statements are
//      considered. `deprecated` is excluded before this step and never
//      re-enters.
//   4. any statement in the active pool is calendarically/structurally
//      impossible (round 4 finding 2)                          -> INVALID_BIRTH_DATE
//   5. any two statements in the active pool are incompatible on a shared
//      component                                                 -> CONFLICT_REQUIRES_REVIEW
//   6. no day-precision statement in the active pool             -> INSUFFICIENT_DATE_PRECISION
//   7. day-precision statements exist but none has a reference   -> INSUFFICIENT_PROVENANCE
//   8. otherwise                                                 -> USABLE_RETROSPECTIVE_STATIC
//
// Every decision after step 3 depends only on SET membership within the
// active pool (any(), filter().length), never on array order or a `[0]`
// pick — the result is the same for any permutation of the input array
// (round 4 finding 3).
export function classifyDateOfBirthUsability(
  statements: readonly DateOfBirthStatement[],
  referenceDate: string,
): DateOfBirthUsabilityStatus {
  parseCalendarDate(referenceDate);

  if (statements.length === 0) {
    return "INSUFFICIENT_PROVENANCE";
  }

  const distinctEntityIds = new Set(statements.map((statement) => statement.wikidataEntityId));
  if (distinctEntityIds.size > 1) {
    return "MIXED_ENTITY_INPUT";
  }

  const eligible = statements.filter((statement) => statement.statementRank !== "deprecated");
  if (eligible.length === 0) {
    return "INSUFFICIENT_PROVENANCE";
  }

  const preferred = eligible.filter((statement) => statement.statementRank === "preferred");
  const activePool = preferred.length > 0 ? preferred : eligible;

  if (activePool.some((statement) => !validateWikidataBirthDate(statement.birthDate))) {
    return "INVALID_BIRTH_DATE";
  }

  for (let i = 0; i < activePool.length; i += 1) {
    for (let j = i + 1; j < activePool.length; j += 1) {
      if (!datesAreCompatible(activePool[i]!.birthDate, activePool[j]!.birthDate)) {
        return "CONFLICT_REQUIRES_REVIEW";
      }
    }
  }

  const dayPrecision = activePool.filter((statement) => statement.birthDate.precision === "day");
  if (dayPrecision.length === 0) {
    return "INSUFFICIENT_DATE_PRECISION";
  }

  const referenced = dayPrecision.filter((statement) => statement.statementReferences.length > 0);
  if (referenced.length === 0) {
    return "INSUFFICIENT_PROVENANCE";
  }

  return "USABLE_RETROSPECTIVE_STATIC";
}

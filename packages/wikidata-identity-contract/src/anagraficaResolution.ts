// Identity + date-of-birth resolution for one subject, and the batch report
// over many — PURE, no I/O, no clock. The transport that actually talks to
// Wikidata lives outside this package and hands its already-parsed candidate
// signals and statements in here.
//
// This module composes the three classifiers this package already owns
// (`classifyIdentityMatch`, `classifyDateOfBirthUsability`,
// `resolveAgeAtReferenceDate`) into the one decision a caller actually needs:
// may this subject's age be used as a model feature, or must a human look at
// it? It adds no new matching rule — R1 and the FASE 3 candidate-key rules are
// untouched — it only refuses to collapse their answers optimistically.
//
// Fail-closed is the whole point. `RESOLVED` requires ALL of:
//
//   1. `classifyIdentityMatch` returns EXACT_MATCH (a single exact-eligible
//      candidate). PROBABLE_MATCH_REQUIRES_REVIEW, AMBIGUOUS and CONFLICT are
//      review outcomes, never "close enough";
//   2. every date-of-birth statement supplied belongs to the entity that
//      match selected — statements for some other QID are never read as if
//      they described this person, even when the identity match itself was
//      exact (this is a caller/transport bug, surfaced, never absorbed);
//   3. `classifyDateOfBirthUsability` returns USABLE_RETROSPECTIVE_STATIC;
//   4. the context's required reference date is present
//      (`resolveReferenceDate`, fail-closed — no cross-context substitute);
//   5. the selected birth date is day-precision, so `calculateAgeAt` can be
//      exact. A year-only or month-only value never becomes an approximate age.
//
// Anything short of all five produces MANUAL_REVIEW or MISSING with an
// explicit reason code. Nothing is ever imputed, defaulted or rounded, and
// `wikidataEntityId` stays provider-scoped: this module never emits, derives
// or implies a `canonical_player_id`/`canonical_team_id`.

import { AgeCalculationError, resolveAgeAtReferenceDate } from "./calculateAgeAt.js";
import { classifyDateOfBirthUsability } from "./dateOfBirthUsability.js";
import { classifyIdentityMatch } from "./identityMatchPolicy.js";
import { resolveReferenceDate, type ReferenceDateCandidate } from "./referenceDate.js";
import type {
  DateOfBirthStatement,
  IdentityCandidateSignals,
  ReferenceDateContext,
  WikidataBirthDate,
  WikidataEntityId,
} from "./types.js";

export const ANAGRAFICA_RESOLUTION_VERSION = "wikidata-anagrafica-resolution-v1" as const;

/**
 * Why a subject is queued for a human instead of resolved. Each code names a
 * distinct thing a reviewer would do about it — collapsing them into one
 * "unresolved" bucket would make the coverage report unactionable.
 */
export type AnagraficaReviewReasonCode =
  | "IDENTITY_PROBABLE_REQUIRES_REVIEW"
  | "IDENTITY_AMBIGUOUS"
  | "IDENTITY_CONFLICT"
  | "STATEMENTS_ENTITY_MISMATCH"
  | "DATE_OF_BIRTH_CONFLICT_REQUIRES_REVIEW"
  | "DATE_OF_BIRTH_INVALID"
  | "DATE_OF_BIRTH_MIXED_ENTITY_INPUT"
  | "AGE_NOT_COMPUTABLE";

/** Why a subject has no usable anagrafica at all — nothing for a reviewer to arbitrate. */
export type AnagraficaMissingReasonCode =
  | "IDENTITY_NOT_FOUND"
  | "DATE_OF_BIRTH_INSUFFICIENT_PRECISION"
  | "DATE_OF_BIRTH_INSUFFICIENT_PROVENANCE"
  | "REFERENCE_DATE_MISSING";

export interface AnagraficaSubject {
  /**
   * The caller's own key for the subject — a `playerKey`/`listone_id`, never a
   * `canonical_player_id`. This module only echoes it back.
   */
  readonly subjectKey: string;
  /**
   * What kind of observation the age belongs to. PLAYER_SEASON is the model
   * case: the required reference date is then SEASON_START_DATE and nothing
   * else, per `REFERENCE_DATE_CONTEXT_REQUIREMENT`.
   */
  readonly context: ReferenceDateContext;
  readonly referenceDateCandidates: readonly ReferenceDateCandidate[];
  readonly candidates: readonly IdentityCandidateSignals[];
  readonly dateOfBirthStatements: readonly DateOfBirthStatement[];
}

export type AnagraficaResolution =
  | {
      readonly subjectKey: string;
      readonly status: "RESOLVED";
      readonly wikidataEntityId: WikidataEntityId;
      readonly birthDate: WikidataBirthDate & { readonly precision: "day" };
      readonly referenceDate: string;
      /** Naming per contract §4: always qualified by the reference date, never a bare `age`. */
      readonly ageAtReferenceDate: number;
    }
  | {
      readonly subjectKey: string;
      readonly status: "MANUAL_REVIEW";
      readonly reasonCode: AnagraficaReviewReasonCode;
      readonly candidateEntityIds: readonly WikidataEntityId[];
    }
  | {
      readonly subjectKey: string;
      readonly status: "MISSING";
      readonly reasonCode: AnagraficaMissingReasonCode;
      readonly candidateEntityIds: readonly WikidataEntityId[];
    };

/**
 * The day-precision statement the usability classifier already validated.
 *
 * It re-derives the active rank pool the same way `classifyDateOfBirthUsability`
 * does rather than re-implementing the decision: this only runs AFTER that
 * function answered USABLE_RETROSPECTIVE_STATIC, which guarantees the pool is
 * non-empty, internally compatible, day-precision and referenced. Selection is
 * therefore free of an order dependency by construction — every remaining
 * candidate carries the same calendar value.
 */
function selectUsableBirthDate(
  statements: readonly DateOfBirthStatement[],
): (WikidataBirthDate & { readonly precision: "day" }) | null {
  const eligible = statements.filter((statement) => statement.statementRank !== "deprecated");
  const preferred = eligible.filter((statement) => statement.statementRank === "preferred");
  const activePool = preferred.length > 0 ? preferred : eligible;
  for (const statement of activePool) {
    if (statement.birthDate.precision === "day" && statement.statementReferences.length > 0) {
      return statement.birthDate;
    }
  }
  return null;
}

/**
 * One subject, resolved or queued. Never throws for bad data: an unusable
 * input is an outcome with a reason code, because a batch of a hundred
 * subjects must not stop on the first odd one.
 */
export function resolveAnagraficaSubject(subject: AnagraficaSubject): AnagraficaResolution {
  const { subjectKey } = subject;
  const identity = classifyIdentityMatch(subject.candidates);

  switch (identity.status) {
    case "NOT_FOUND":
      return { subjectKey, status: "MISSING", reasonCode: "IDENTITY_NOT_FOUND", candidateEntityIds: [] };
    case "PROBABLE_MATCH_REQUIRES_REVIEW":
      return {
        subjectKey,
        status: "MANUAL_REVIEW",
        reasonCode: "IDENTITY_PROBABLE_REQUIRES_REVIEW",
        candidateEntityIds: identity.candidateEntityIds,
      };
    case "AMBIGUOUS":
      return {
        subjectKey,
        status: "MANUAL_REVIEW",
        reasonCode: "IDENTITY_AMBIGUOUS",
        candidateEntityIds: identity.candidateEntityIds,
      };
    case "CONFLICT":
      return {
        subjectKey,
        status: "MANUAL_REVIEW",
        reasonCode: "IDENTITY_CONFLICT",
        candidateEntityIds: identity.candidateEntityIds,
      };
    default:
      break;
  }

  const matched = [identity.wikidataEntityId];

  // An exact identity match says nothing about whose statements the transport
  // attached. Reading a different entity's birth date here would be a silent
  // cross-person promotion — precisely what MIXED_ENTITY_INPUT protects
  // against inside one array, applied to the identity boundary as well.
  if (subject.dateOfBirthStatements.some((statement) => statement.wikidataEntityId !== identity.wikidataEntityId)) {
    return {
      subjectKey,
      status: "MANUAL_REVIEW",
      reasonCode: "STATEMENTS_ENTITY_MISMATCH",
      candidateEntityIds: [
        ...new Set([...matched, ...subject.dateOfBirthStatements.map((statement) => statement.wikidataEntityId)]),
      ],
    };
  }

  // Resolved before the statements are classified: the classifier needs a real
  // calendar reference date, and a missing one is a caller-side gap, not a
  // property of the source data.
  const reference = resolveReferenceDate(subject.context, subject.referenceDateCandidates);
  if (reference.status !== "OK") {
    return { subjectKey, status: "MISSING", reasonCode: "REFERENCE_DATE_MISSING", candidateEntityIds: matched };
  }

  const usability = classifyDateOfBirthUsability(subject.dateOfBirthStatements, reference.value);
  switch (usability) {
    case "CONFLICT_REQUIRES_REVIEW":
      return {
        subjectKey,
        status: "MANUAL_REVIEW",
        reasonCode: "DATE_OF_BIRTH_CONFLICT_REQUIRES_REVIEW",
        candidateEntityIds: matched,
      };
    case "INVALID_BIRTH_DATE":
      return {
        subjectKey,
        status: "MANUAL_REVIEW",
        reasonCode: "DATE_OF_BIRTH_INVALID",
        candidateEntityIds: matched,
      };
    case "MIXED_ENTITY_INPUT":
      return {
        subjectKey,
        status: "MANUAL_REVIEW",
        reasonCode: "DATE_OF_BIRTH_MIXED_ENTITY_INPUT",
        candidateEntityIds: matched,
      };
    case "INSUFFICIENT_DATE_PRECISION":
      return {
        subjectKey,
        status: "MISSING",
        reasonCode: "DATE_OF_BIRTH_INSUFFICIENT_PRECISION",
        candidateEntityIds: matched,
      };
    case "INSUFFICIENT_PROVENANCE":
      return {
        subjectKey,
        status: "MISSING",
        reasonCode: "DATE_OF_BIRTH_INSUFFICIENT_PROVENANCE",
        candidateEntityIds: matched,
      };
    default:
      break;
  }

  const birthDate = selectUsableBirthDate(subject.dateOfBirthStatements);
  if (birthDate === null) {
    return { subjectKey, status: "MANUAL_REVIEW", reasonCode: "AGE_NOT_COMPUTABLE", candidateEntityIds: matched };
  }

  let age: number;
  try {
    const resolved = resolveAgeAtReferenceDate(birthDate, reference.value);
    if (resolved.status !== "OK") {
      return { subjectKey, status: "MANUAL_REVIEW", reasonCode: "AGE_NOT_COMPUTABLE", candidateEntityIds: matched };
    }
    age = resolved.ageAtReferenceDate;
  } catch (error) {
    // The one case the usability classifier cannot see: a reference date that
    // precedes the birth date. Real for a historical season and a very young
    // player, and never a silent negative age.
    if (error instanceof AgeCalculationError) {
      return { subjectKey, status: "MANUAL_REVIEW", reasonCode: "AGE_NOT_COMPUTABLE", candidateEntityIds: matched };
    }
    throw error;
  }

  return {
    subjectKey,
    status: "RESOLVED",
    wikidataEntityId: identity.wikidataEntityId,
    birthDate,
    referenceDate: reference.value,
    ageAtReferenceDate: age,
  };
}

export interface AnagraficaCoverageCounts {
  readonly subjects: number;
  readonly resolved: number;
  readonly manualReview: number;
  readonly missing: number;
  /** `resolved / subjects`, or 0 for an empty batch — never a division by zero. */
  readonly resolvedRate: number;
}

export interface AnagraficaBatchReport extends AnagraficaCoverageCounts {
  readonly resolutionVersion: typeof ANAGRAFICA_RESOLUTION_VERSION;
  /** Sorted `reasonCode -> count`, so two runs over the same batch produce identical bytes. */
  readonly byReasonCode: Readonly<Record<string, number>>;
  readonly resolutions: readonly AnagraficaResolution[];
}

/**
 * Resolves a whole batch and counts it. The counts ARE the deliverable the
 * pilot reports (resolved / ambiguous-in-review / missing); the per-subject
 * resolutions are kept so the caller can build the review queue and the age
 * lookup from the same single pass.
 *
 * Deterministic for a given input order, and the report's own aggregate fields
 * do not depend on that order at all.
 */
export function resolveAnagraficaBatch(subjects: readonly AnagraficaSubject[]): AnagraficaBatchReport {
  const resolutions = subjects.map(resolveAnagraficaSubject);
  const counts = { resolved: 0, manualReview: 0, missing: 0 };
  const byReasonCode = new Map<string, number>();
  for (const resolution of resolutions) {
    if (resolution.status === "RESOLVED") {
      counts.resolved += 1;
      continue;
    }
    if (resolution.status === "MANUAL_REVIEW") counts.manualReview += 1;
    else counts.missing += 1;
    byReasonCode.set(resolution.reasonCode, (byReasonCode.get(resolution.reasonCode) ?? 0) + 1);
  }

  return {
    resolutionVersion: ANAGRAFICA_RESOLUTION_VERSION,
    subjects: subjects.length,
    resolved: counts.resolved,
    manualReview: counts.manualReview,
    missing: counts.missing,
    resolvedRate: subjects.length === 0 ? 0 : counts.resolved / subjects.length,
    byReasonCode: Object.fromEntries([...byReasonCode.entries()].sort(([a], [b]) => a.localeCompare(b))),
    resolutions,
  };
}

/**
 * The subjects a human still has to arbitrate. Kept separate from the report's
 * aggregate counts because a review queue is an operational artifact with a
 * different lifetime: it is consumed and shrinks, the counts are a measurement
 * of one run and never change.
 */
export function anagraficaReviewQueue(
  report: AnagraficaBatchReport,
): readonly Extract<AnagraficaResolution, { status: "MANUAL_REVIEW" }>[] {
  return report.resolutions.filter(
    (resolution): resolution is Extract<AnagraficaResolution, { status: "MANUAL_REVIEW" }> =>
      resolution.status === "MANUAL_REVIEW",
  );
}

/**
 * The only promotion this pipeline allows: `subjectKey -> age at the reference
 * date`, built exclusively from RESOLVED subjects. A subject under review or
 * missing simply has no entry — the consumer sees an absence and treats it as
 * missing, which is what keeps a downstream model from ever imputing a zero.
 */
export function anagraficaAgeLookup(report: AnagraficaBatchReport): ReadonlyMap<string, number> {
  const lookup = new Map<string, number>();
  for (const resolution of report.resolutions) {
    if (resolution.status === "RESOLVED") lookup.set(resolution.subjectKey, resolution.ageAtReferenceDate);
  }
  return lookup;
}

import { describe, expect, it } from "vitest";
import {
  ANAGRAFICA_RESOLUTION_VERSION,
  anagraficaAgeLookup,
  anagraficaReviewQueue,
  resolveAnagraficaBatch,
  resolveAnagraficaSubject,
  type AnagraficaSubject,
} from "../src/anagraficaResolution.js";
import type { DateOfBirthStatement, IdentityCandidateSignals } from "../src/types.js";
import {
  syntheticDobConflictCandidate,
  syntheticExactMatchByDobCandidate,
  syntheticIncompatibleCompleteStatement,
  syntheticIncompatiblePartialStatement,
  syntheticInvalidDayStatement,
  syntheticMultipleCompatibleCandidates,
  syntheticNameOnlyCandidate,
  syntheticNoReferencesStatement,
  syntheticNotFootballerCandidate,
  syntheticYearPrecisionStatement,
} from "../fixtures/syntheticEntities.js";

// Every entity id, name and date below is fictitious — no real QID or player
// appears in this file, per the WIKIDATA_IDENTITY_BIRTHDATE_CONTRACT §7.

const SEASON_START_2019 = "2019-08-24";

function statementFor(
  wikidataEntityId: string,
  birthDate: DateOfBirthStatement["birthDate"],
  overrides: Partial<DateOfBirthStatement> = {},
): DateOfBirthStatement {
  return {
    wikidataEntityId,
    birthDate,
    statementRank: "preferred",
    statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_T4" }],
    observedAt: "2026-08-13",
    transformVersion: "wikidata-identity-contract@1.0.0",
    ...overrides,
  };
}

function subject(overrides: Partial<AnagraficaSubject> = {}): AnagraficaSubject {
  const candidates: readonly IdentityCandidateSignals[] = [syntheticExactMatchByDobCandidate];
  return {
    subjectKey: "player:synthetic-001",
    context: "PLAYER_SEASON",
    referenceDateCandidates: [{ type: "SEASON_START_DATE", value: SEASON_START_2019 }],
    candidates,
    dateOfBirthStatements: [
      statementFor(syntheticExactMatchByDobCandidate.wikidataEntityId, {
        precision: "day",
        year: 1990,
        month: 10,
        day: 1,
      }),
    ],
    ...overrides,
  };
}

describe("resolveAnagraficaSubject — the join is fail-closed on every axis", () => {
  it("resolves only on an exact match with a usable day-precision date, and dates the age explicitly", () => {
    const resolution = resolveAnagraficaSubject(subject());
    expect(resolution.status).toBe("RESOLVED");
    if (resolution.status !== "RESOLVED") throw new Error("unreachable");
    expect(resolution.wikidataEntityId).toBe(syntheticExactMatchByDobCandidate.wikidataEntityId);
    expect(resolution.referenceDate).toBe(SEASON_START_2019);
    // The contract's own binding example: 1990-10-01 at a 2019 date before the
    // birthday is 28, never 29 and never "age today".
    expect(resolution.ageAtReferenceDate).toBe(28);
  });

  it("computes the age against the historical reference date, never the observation date", () => {
    const early = resolveAnagraficaSubject(subject());
    const late = resolveAnagraficaSubject(
      subject({ referenceDateCandidates: [{ type: "SEASON_START_DATE", value: "2019-10-01" }] }),
    );
    if (early.status !== "RESOLVED" || late.status !== "RESOLVED") throw new Error("unreachable");
    // Same statement, observed in 2026, two different historical reference
    // dates -> two different ages. Nothing here reads a clock.
    expect(early.ageAtReferenceDate).toBe(28);
    expect(late.ageAtReferenceDate).toBe(29);
  });

  it("queues an ambiguous candidate set for review instead of picking one", () => {
    const resolution = resolveAnagraficaSubject(
      subject({ candidates: syntheticMultipleCompatibleCandidates }),
    );
    expect(resolution).toMatchObject({ status: "MANUAL_REVIEW", reasonCode: "IDENTITY_AMBIGUOUS" });
    if (resolution.status !== "MANUAL_REVIEW") throw new Error("unreachable");
    expect(resolution.candidateEntityIds).toHaveLength(2);
  });

  it("queues a probable-but-unproven match for review, never promotes it", () => {
    const resolution = resolveAnagraficaSubject(subject({ candidates: [syntheticNameOnlyCandidate] }));
    expect(resolution).toMatchObject({
      status: "MANUAL_REVIEW",
      reasonCode: "IDENTITY_PROBABLE_REQUIRES_REVIEW",
    });
  });

  it("queues internally contradictory evidence about one entity as a conflict", () => {
    const resolution = resolveAnagraficaSubject(subject({ candidates: [syntheticDobConflictCandidate] }));
    expect(resolution).toMatchObject({ status: "MANUAL_REVIEW", reasonCode: "IDENTITY_CONFLICT" });
  });

  it("reports a non-footballer-only result as missing, not as something to review", () => {
    const resolution = resolveAnagraficaSubject(subject({ candidates: [syntheticNotFootballerCandidate] }));
    expect(resolution).toMatchObject({ status: "MISSING", reasonCode: "IDENTITY_NOT_FOUND" });
  });

  it("refuses statements belonging to a different entity than the one the match selected", () => {
    const resolution = resolveAnagraficaSubject(
      subject({
        dateOfBirthStatements: [
          statementFor("Q_SYNTHETIC_SOMEONE_ELSE", { precision: "day", year: 1990, month: 10, day: 1 }),
        ],
      }),
    );
    expect(resolution).toMatchObject({ status: "MANUAL_REVIEW", reasonCode: "STATEMENTS_ENTITY_MISMATCH" });
    if (resolution.status !== "MANUAL_REVIEW") throw new Error("unreachable");
    expect(resolution.candidateEntityIds).toContain("Q_SYNTHETIC_SOMEONE_ELSE");
  });

  it("never approximates an age from a year-only date", () => {
    const resolution = resolveAnagraficaSubject(
      subject({
        candidates: [{ ...syntheticExactMatchByDobCandidate, wikidataEntityId: syntheticYearPrecisionStatement.wikidataEntityId }],
        dateOfBirthStatements: [syntheticYearPrecisionStatement],
      }),
    );
    expect(resolution).toMatchObject({
      status: "MISSING",
      reasonCode: "DATE_OF_BIRTH_INSUFFICIENT_PRECISION",
    });
  });

  it("never treats an unsourced statement as an authority", () => {
    const resolution = resolveAnagraficaSubject(
      subject({
        candidates: [{ ...syntheticExactMatchByDobCandidate, wikidataEntityId: syntheticNoReferencesStatement.wikidataEntityId }],
        dateOfBirthStatements: [syntheticNoReferencesStatement],
      }),
    );
    expect(resolution).toMatchObject({
      status: "MISSING",
      reasonCode: "DATE_OF_BIRTH_INSUFFICIENT_PROVENANCE",
    });
  });

  it("queues two incompatible statements for the same entity rather than choosing", () => {
    const resolution = resolveAnagraficaSubject(
      subject({
        candidates: [
          {
            ...syntheticExactMatchByDobCandidate,
            wikidataEntityId: syntheticIncompatibleCompleteStatement.wikidataEntityId,
          },
        ],
        dateOfBirthStatements: [syntheticIncompatiblePartialStatement, syntheticIncompatibleCompleteStatement],
      }),
    );
    expect(resolution).toMatchObject({
      status: "MANUAL_REVIEW",
      reasonCode: "DATE_OF_BIRTH_CONFLICT_REQUIRES_REVIEW",
    });
  });

  it("queues a calendarically impossible date instead of silently normalising it", () => {
    const resolution = resolveAnagraficaSubject(
      subject({
        candidates: [
          { ...syntheticExactMatchByDobCandidate, wikidataEntityId: syntheticInvalidDayStatement.wikidataEntityId },
        ],
        dateOfBirthStatements: [syntheticInvalidDayStatement],
      }),
    );
    expect(resolution).toMatchObject({ status: "MANUAL_REVIEW", reasonCode: "DATE_OF_BIRTH_INVALID" });
  });

  it("refuses to substitute another context's date when the required one is missing", () => {
    const resolution = resolveAnagraficaSubject(
      subject({ referenceDateCandidates: [{ type: "AUCTION_DATE", value: "2019-09-01" }] }),
    );
    expect(resolution).toMatchObject({ status: "MISSING", reasonCode: "REFERENCE_DATE_MISSING" });
  });

  it("queues a reference date that precedes the birth date rather than emitting a negative age", () => {
    const resolution = resolveAnagraficaSubject(
      subject({ referenceDateCandidates: [{ type: "SEASON_START_DATE", value: "1985-08-24" }] }),
    );
    expect(resolution).toMatchObject({ status: "MANUAL_REVIEW", reasonCode: "AGE_NOT_COMPUTABLE" });
  });
});

describe("resolveAnagraficaBatch — the coverage measurement the pilot reports", () => {
  const batch: readonly AnagraficaSubject[] = [
    subject({ subjectKey: "player:resolved-a" }),
    subject({ subjectKey: "player:resolved-b" }),
    subject({ subjectKey: "player:ambiguous", candidates: syntheticMultipleCompatibleCandidates }),
    subject({ subjectKey: "player:not-found", candidates: [syntheticNotFootballerCandidate] }),
  ];

  it("counts resolved, in-review and missing separately and reports the resolved rate", () => {
    const report = resolveAnagraficaBatch(batch);
    expect(report.resolutionVersion).toBe(ANAGRAFICA_RESOLUTION_VERSION);
    expect(report).toMatchObject({ subjects: 4, resolved: 2, manualReview: 1, missing: 1 });
    expect(report.resolvedRate).toBeCloseTo(0.5, 10);
    expect(report.byReasonCode).toEqual({ IDENTITY_AMBIGUOUS: 1, IDENTITY_NOT_FOUND: 1 });
  });

  it("keeps the aggregate counts independent of the input order", () => {
    const forward = resolveAnagraficaBatch(batch);
    const reversed = resolveAnagraficaBatch([...batch].reverse());
    expect(reversed.resolved).toBe(forward.resolved);
    expect(reversed.manualReview).toBe(forward.manualReview);
    expect(reversed.missing).toBe(forward.missing);
    expect(reversed.byReasonCode).toEqual(forward.byReasonCode);
  });

  it("an empty batch has a zero rate, never a division by zero", () => {
    expect(resolveAnagraficaBatch([]).resolvedRate).toBe(0);
  });

  it("the review queue carries exactly the subjects a human must arbitrate", () => {
    const queue = anagraficaReviewQueue(resolveAnagraficaBatch(batch));
    expect(queue.map((entry) => entry.subjectKey)).toEqual(["player:ambiguous"]);
  });

  it("the age lookup promotes RESOLVED subjects only — under review and missing have no entry at all", () => {
    const lookup = anagraficaAgeLookup(resolveAnagraficaBatch(batch));
    expect([...lookup.keys()].sort()).toEqual(["player:resolved-a", "player:resolved-b"]);
    expect(lookup.get("player:resolved-a")).toBe(28);
    // Absence, not a zero: a consumer can only read this as "no anagrafica".
    expect(lookup.has("player:ambiguous")).toBe(false);
    expect(lookup.has("player:not-found")).toBe(false);
  });
});

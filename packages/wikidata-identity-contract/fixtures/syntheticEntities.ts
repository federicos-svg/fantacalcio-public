import type { DateOfBirthStatement, IdentityCandidateSignals } from "../src/types.js";

// All entity IDs, names, and values below are fictitious. No real Wikidata
// QID, player, or statement payload appears in this file.

export const syntheticDayPrecisionStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000001",
  birthDate: { precision: "day", year: 1990, month: 10, day: 1 },
  statementRank: "preferred",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_001" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// No day component is fabricated — a real Wikidata month-precision value
// simply has no `day` field.
export const syntheticMonthPrecisionStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000002",
  birthDate: { precision: "month", year: 1992, month: 5 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_002" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// No month/day component is fabricated — a real Wikidata year-precision
// value simply has no `month`/`day` field.
export const syntheticYearPrecisionStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000003",
  birthDate: { precision: "year", year: 1988 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_003" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// Wikidata's own precision code is below "year" (e.g. decade/century) or the
// raw time value failed to parse — no calendar component is usable.
export const syntheticUnknownPrecisionStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000012",
  birthDate: { precision: "unknown", rawPrecision: 8, rawTime: "+1990-00-00T00:00:00Z" },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_012" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// A raw Wikidata time value with unknown month/day components (Wikidata's
// own "00" placeholder at year precision) — the normalizer must read only
// the year, never promote the zeros to a real month/day.
export const syntheticRawTimeWithUnknownComponents = {
  rawTime: "+1990-00-00T00:00:00Z",
  rawPrecision: 9,
} as const;

// Queried in 2026, reference date historically in 2019 — under the
// RETROSPECTIVE_STATIC_ATTRIBUTE policy this is USABLE, not a leakage case:
// a birth date is a static fact, not a dynamic feature.
export const syntheticQueriedLongAfterReferenceStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000004",
  birthDate: { precision: "day", year: 1991, month: 3, day: 15 },
  statementRank: "preferred",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_004" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// Same wikidataEntityId as syntheticDayPrecisionStatement — used to test
// that a deprecated statement is ignored, not merely that two statements
// happen to share an array (round 3 finding 2's mixed-entity guard would
// otherwise reject an accidental cross-entity pairing here).
export const syntheticDeprecatedStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000001",
  birthDate: { precision: "day", year: 1980, month: 1, day: 1 },
  statementRank: "deprecated",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_005" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

export const syntheticNoReferencesStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000006",
  birthDate: { precision: "day", year: 1993, month: 7, day: 20 },
  statementRank: "normal",
  statementReferences: [],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// Two discordant "normal"-rank statements for the same entity — must be
// flagged, never silently resolved by picking one.
export const syntheticDiscordantStatementA: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000007",
  birthDate: { precision: "day", year: 1994, month: 4, day: 10 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_007A" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

export const syntheticDiscordantStatementB: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000007",
  birthDate: { precision: "day", year: 1994, month: 4, day: 11 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_007B" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// A complete day-precision statement and a partial year-only statement for
// the SAME entity that agree on the year they both know — compatible, must
// never raise a false conflict.
export const syntheticCompatiblePartialStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000008",
  birthDate: { precision: "year", year: 1995 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_008A" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

export const syntheticCompatibleCompleteStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000008",
  birthDate: { precision: "day", year: 1995, month: 6, day: 12 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_008B" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// A complete day-precision statement and a partial year-only statement for
// the SAME entity that DISAGREE on the year — incompatible, requires review.
export const syntheticIncompatiblePartialStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000009",
  birthDate: { precision: "year", year: 1997 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_009A" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

export const syntheticIncompatibleCompleteStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000009",
  birthDate: { precision: "day", year: 1998, month: 2, day: 3 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_009B" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// Two statements for DIFFERENT entities — never comparable as competing
// values for the same person's birth date.
export const syntheticMixedEntityStatementA: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000010",
  birthDate: { precision: "day", year: 1990, month: 1, day: 1 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_010" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

export const syntheticMixedEntityStatementB: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000011",
  birthDate: { precision: "day", year: 1991, month: 2, day: 2 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_011" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// Hand-built, structurally impossible day-precision value (30 February) —
// simulates a caller/fixture that bypassed normalizeWikidataTime. Must
// never be usable (round 4 finding 2).
export const syntheticInvalidDayStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000013",
  birthDate: { precision: "day", year: 1990, month: 2, day: 30 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_013" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// preferred + a discordant normal for the SAME entity — the active rank
// pool (round 4 finding 3) excludes the normal entirely once a preferred
// statement exists, so the preferred value is usable despite the normal
// disagreeing.
export const syntheticPreferredCompleteStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000014",
  birthDate: { precision: "day", year: 1985, month: 3, day: 10 },
  statementRank: "preferred",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_014A" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

export const syntheticNormalDiscordantStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000014",
  birthDate: { precision: "day", year: 1986, month: 1, day: 1 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_014B" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// Two `preferred` statements for the SAME entity that disagree — the active
// pool is preferred-only, so this is a real conflict, never resolved by
// picking one.
export const syntheticPreferredConflictA: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000015",
  birthDate: { precision: "day", year: 1980, month: 5, day: 5 },
  statementRank: "preferred",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_015A" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

export const syntheticPreferredConflictB: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000015",
  birthDate: { precision: "day", year: 1981, month: 6, day: 6 },
  statementRank: "preferred",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_015B" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// Same entity, same date, one statement without a reference and one with —
// order-independent selection (round 4 finding 3) must land on
// USABLE_RETROSPECTIVE_STATIC regardless of array order.
export const syntheticUnreferencedThenReferencedStatementA: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000016",
  birthDate: { precision: "day", year: 1992, month: 7, day: 7 },
  statementRank: "normal",
  statementReferences: [],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

export const syntheticUnreferencedThenReferencedStatementB: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000016",
  birthDate: { precision: "day", year: 1992, month: 7, day: 7 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_016B" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// Two equivalent, unreferenced duplicates for the same entity — no
// statement in the active pool has a reference at all.
export const syntheticAllUnreferencedDuplicateA: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000017",
  birthDate: { precision: "day", year: 1993, month: 8, day: 8 },
  statementRank: "normal",
  statementReferences: [],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

export const syntheticAllUnreferencedDuplicateB: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000017",
  birthDate: { precision: "day", year: 1993, month: 8, day: 8 },
  statementRank: "normal",
  statementReferences: [],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

// preferred year-only (partial) + a normal COMPLETE day-precision statement
// for the same entity — the active pool is preferred-only, so the normal's
// day precision must never be silently promoted.
export const syntheticPreferredPartialStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000018",
  birthDate: { precision: "year", year: 1993 },
  statementRank: "preferred",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_018A" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

export const syntheticNormalCompleteStatement: DateOfBirthStatement = {
  wikidataEntityId: "Q_SYNTHETIC_000018",
  birthDate: { precision: "day", year: 1993, month: 5, day: 5 },
  statementRank: "normal",
  statementReferences: [{ property: "P248", value: "Q_SYNTHETIC_STATED_IN_018B" }],
  observedAt: "2026-01-01",
  transformVersion: "wikidata-identity-contract@1.0.0",
};

function candidate(overrides: Partial<IdentityCandidateSignals>): IdentityCandidateSignals {
  return {
    wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_001",
    normalizedNameMatch: true,
    dateOfBirthAgreement: null,
    nationalityAgreement: null,
    teamAgreement: null,
    roleAgreement: null,
    isClassifiedAsFootballer: true,
    externalIdAgreement: null,
    ...overrides,
  };
}

export const syntheticExactMatchByDobCandidate: IdentityCandidateSignals = candidate({
  dateOfBirthAgreement: true,
  nationalityAgreement: true,
  teamAgreement: true,
  roleAgreement: true,
});

export const syntheticExactMatchByExternalIdCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_002",
  dateOfBirthAgreement: null,
  externalIdAgreement: true,
});

export const syntheticNameOnlyCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_003",
});

export const syntheticExternalIdConflictCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_004",
  dateOfBirthAgreement: true,
  externalIdAgreement: false,
});

export const syntheticDobConflictCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_005",
  dateOfBirthAgreement: false,
  externalIdAgreement: true,
});

export const syntheticTeamContradictionCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_006",
  dateOfBirthAgreement: true,
  teamAgreement: false,
});

export const syntheticRoleContradictionCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_007",
  dateOfBirthAgreement: true,
  roleAgreement: false,
});

export const syntheticNationalityContradictionCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_008",
  dateOfBirthAgreement: true,
  nationalityAgreement: false,
});

export const syntheticMultipleCompatibleCandidates: readonly IdentityCandidateSignals[] = [
  candidate({ wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_009", dateOfBirthAgreement: true }),
  candidate({ wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_010", dateOfBirthAgreement: true }),
];

export const syntheticNotFootballerCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_011",
  dateOfBirthAgreement: true,
  isClassifiedAsFootballer: false,
});

// A single negative strong signal with no positive signal backing it — most
// likely a different entity than the one being searched for. Discarded as
// REJECTED_MISMATCH, never surfaced as a CONFLICT for the whole result set.
export const syntheticRejectedByDobMismatchCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_012",
  dateOfBirthAgreement: false,
});

export const syntheticRejectedByExternalIdMismatchCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_013",
  externalIdAgreement: false,
});

// Name does not match and no signal backs it at all — not a plausible
// candidate, must never enter manual review (round 4 finding 1).
export const syntheticNameMismatchNoSignalCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_014",
  normalizedNameMatch: false,
});

// Name does not match, but a strong positive signal backs it (DOB) — still
// plausible (e.g. nickname/transliteration), but never EXACT: the name
// itself needs human verification.
export const syntheticNameMismatchWithDobCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_015",
  normalizedNameMatch: false,
  dateOfBirthAgreement: true,
});

// Same as above, but the strong positive signal is the external ID.
export const syntheticNameMismatchWithExternalIdCandidate: IdentityCandidateSignals = candidate({
  wikidataEntityId: "Q_SYNTHETIC_CANDIDATE_016",
  normalizedNameMatch: false,
  externalIdAgreement: true,
});

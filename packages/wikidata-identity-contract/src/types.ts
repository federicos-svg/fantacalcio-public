// WIKIDATA-01: Wikidata as a provider-scoped structured source for player
// identity and date of birth ONLY. Never used for votes, fantavoti, presenze,
// minuti, titolarità, sostituzioni, infortuni, valori di mercato, standings,
// allenatori, prezzi d'asta, or general football statistics. Wikipedia free
// text is never parsed — the only access channel is a Wikidata MCP/API.
// See docs/data/WIKIDATA_IDENTITY_BIRTHDATE_CONTRACT.md.

// The QID is a source-scoped external identifier, never a canonical player ID.
export type WikidataEntityId = string;

export type StatementRank = "preferred" | "normal" | "deprecated";

// A Wikidata time value, discriminated by precision. Each variant only ever
// carries the components the source actually knows — round 3 finding 2: the
// previous flat `dateOfBirth: string` + `dateOfBirthPrecision` design forced
// month/year-only values to fabricate a "01" day (and month, for year
// precision) just to form a valid YYYY-MM-DD string. This type makes that
// fabrication structurally impossible: a "month" value has no `day` field to
// invent, a "year" value has no `month`/`day` fields to invent.
// "decade"/"century"/etc. from Wikidata's real precision vocabulary, and any
// unparseable raw time value, collapse to "unknown" — kept together with the
// original raw fields so nothing is silently discarded, but never promoted
// to a usable day/month/year.
export type WikidataBirthDate =
  | { readonly precision: "day"; readonly year: number; readonly month: number; readonly day: number }
  | { readonly precision: "month"; readonly year: number; readonly month: number }
  | { readonly precision: "year"; readonly year: number }
  | { readonly precision: "unknown"; readonly rawPrecision: number | null; readonly rawTime: string | null };

export interface WikidataReference {
  readonly property: string;
  readonly value: string;
}

// `observedAt`: when WE queried Wikidata — never conflated with when the
// fact became true or publicly knowable (round 2 finding 3). There is
// deliberately no `availableAt`/historical-knowledge-time field here: a
// real "when did this statement's value become knowable" would need
// Wikidata's own revision history (a `source_revision_at` concept), which
// this contract does not fabricate. A future strict historical
// knowledge-time mode would need to add that as a real, sourced field —
// never invented from `observedAt`.
export interface DateOfBirthStatement {
  readonly wikidataEntityId: WikidataEntityId;
  readonly birthDate: WikidataBirthDate;
  readonly statementRank: StatementRank;
  readonly statementReferences: readonly WikidataReference[];
  readonly observedAt: string;
  readonly transformVersion: string;
}

export type IdentityMatchStatus =
  | "EXACT_MATCH"
  | "PROBABLE_MATCH_REQUIRES_REVIEW"
  | "AMBIGUOUS"
  | "NOT_FOUND"
  | "CONFLICT";

// Signals for ONE candidate entity. `null` means "unknown/not comparable",
// not "no match" — never conflated. `false` on dateOfBirthAgreement or
// externalIdAgreement is a hard, factual contradiction. Team/role signals
// are season-aware when used: a different CURRENT team/role never by itself
// proves a historical identity wrong.
export interface IdentityCandidateSignals {
  readonly wikidataEntityId: WikidataEntityId;
  readonly normalizedNameMatch: boolean;
  readonly dateOfBirthAgreement: boolean | null;
  readonly nationalityAgreement: boolean | null;
  readonly teamAgreement: boolean | null;
  readonly roleAgreement: boolean | null;
  readonly isClassifiedAsFootballer: boolean;
  readonly externalIdAgreement: boolean | null;
}

// Per-candidate classification (round 3 finding 1): a single candidate's
// hard DOB/external-ID contradiction is evidence about THAT candidate, not
// about the whole search result set — it must never turn an unrelated exact
// match elsewhere in the same candidate list into a global CONFLICT.
//
//   NOT_FOOTBALLER        isClassifiedAsFootballer === false
//   CONFLICTING_EVIDENCE  the SAME candidate has both a strong positive and
//                          a strong negative signal (e.g. dateOfBirthAgreement
//                          true + externalIdAgreement false) — internally
//                          contradictory evidence about one entity
//   REJECTED_MISMATCH     exactly one strong signal is negative, with no
//                          strong positive signal for this candidate — a
//                          different entity, safely discarded
//   EXACT_ELIGIBLE        footballer, name match, >=1 strong positive
//                          signal, no strong negative signal, no soft
//                          contradiction
//   REVIEW_ELIGIBLE       plausible, no strong conflict, but not exact-
//                          eligible (insufficient evidence, or a soft
//                          contradiction)
export type IdentityCandidateClassification =
  | "EXACT_ELIGIBLE"
  | "REVIEW_ELIGIBLE"
  | "REJECTED_MISMATCH"
  | "CONFLICTING_EVIDENCE"
  | "NOT_FOOTBALLER";

// Discriminated, actionable result — never just the status enum (round 3
// finding 1): a caller needs to know WHICH provider-scoped wikidataEntityId
// won, or which candidate IDs remain under review/ambiguous/conflicting.
// wikidataEntityId here is always provider-scoped; never a canonical_player_id.
export type IdentityMatchResult =
  | {
      readonly status: "EXACT_MATCH";
      readonly wikidataEntityId: WikidataEntityId;
      readonly evidence: IdentityCandidateSignals;
    }
  | {
      readonly status: "PROBABLE_MATCH_REQUIRES_REVIEW";
      readonly candidateEntityIds: readonly WikidataEntityId[];
    }
  | {
      readonly status: "AMBIGUOUS";
      readonly candidateEntityIds: readonly WikidataEntityId[];
    }
  | {
      readonly status: "CONFLICT";
      readonly candidateEntityIds: readonly WikidataEntityId[];
      readonly reasons: readonly IdentityCandidateSignals[];
    }
  | {
      readonly status: "NOT_FOUND";
      readonly candidateEntityIds: readonly [];
    };

export type ReferenceDateType =
  | "AUCTION_DATE"
  | "SEASON_START_DATE"
  | "MATCH_DATE"
  | "OBSERVATION_DATE";

// What kind of observation is being built. The correct reference date is a
// function of THIS, never of a global cross-context precedence — a
// PLAYER_MATCH observation must use MATCH_DATE even when AUCTION_DATE or
// SEASON_START_DATE also happen to be known (round 2 finding 1: the previous
// global AUCTION_DATE > SEASON_START_DATE > MATCH_DATE > OBSERVATION_DATE
// precedence was semantically wrong for this reason and has been removed).
export type ReferenceDateContext =
  | "AUCTION_BACKTEST"
  | "PLAYER_SEASON"
  | "PLAYER_MATCH"
  | "GENERIC_SNAPSHOT";

// The one reference date type each context requires — never a cross-context
// substitute unless the caller explicitly opts into a documented fallback.
export const REFERENCE_DATE_CONTEXT_REQUIREMENT: Readonly<
  Record<ReferenceDateContext, ReferenceDateType>
> = {
  AUCTION_BACKTEST: "AUCTION_DATE",
  PLAYER_SEASON: "SEASON_START_DATE",
  PLAYER_MATCH: "MATCH_DATE",
  GENERIC_SNAPSHOT: "OBSERVATION_DATE",
};

export type ReferenceDateResolution =
  | { readonly status: "OK"; readonly type: ReferenceDateType; readonly value: string }
  | { readonly status: "REFERENCE_DATE_MISSING"; readonly requiredType: ReferenceDateType };

export type AgeAtReferenceDateResult =
  | { readonly status: "OK"; readonly ageAtReferenceDate: number }
  | { readonly status: "INSUFFICIENT_DATE_PRECISION" };

// RETROSPECTIVE_STATIC_ATTRIBUTE policy (round 2 finding 3): date of birth is
// a static fact of the person, not a dynamic feature derived from future
// results. `observed_at` (when WE queried Wikidata) is never conflated with
// "when the fact became true or knowable" — a birth date queried in 2026 is
// just as usable for a 2019 reference date as one queried in 2019, UNLESS a
// real conflict or provenance gap says otherwise. This is a narrow exception
// to the leakage gates in packages/hybrid-dataset-contract, which remain
// unchanged and still apply to every dynamic feature of the hybrid dataset.
// MIXED_ENTITY_INPUT (round 3 finding 2): statements for more than one
// wikidataEntityId must never be compared as if they were competing values
// for the same person's birth date — that is a caller bug, surfaced
// explicitly rather than silently misclassified as a same-entity conflict.
// INVALID_BIRTH_DATE (round 4 finding 2): a structurally/calendarically
// impossible WikidataBirthDate (e.g. day 30 of February) must never be
// silently accepted as USABLE — fail-closed, distinct from a merely
// imprecise (month/year-only) value.
export type DateOfBirthUsabilityStatus =
  | "USABLE_RETROSPECTIVE_STATIC"
  | "CONFLICT_REQUIRES_REVIEW"
  | "INSUFFICIENT_DATE_PRECISION"
  | "INSUFFICIENT_PROVENANCE"
  | "MIXED_ENTITY_INPUT"
  | "INVALID_BIRTH_DATE";

// Never PRIMARY_WIKIDATA before a real pilot passes (WIKIDATA-01 has not run
// one) — mirrors packages/hybrid-dataset-contract's candidate/effective split.
export type WikidataPrecedenceResponsibility = "PRIMARY_WIKIDATA" | "MISSING";

export interface WikidataPrecedenceState {
  readonly preferredSourceCandidate: "wikidata" | "none";
  readonly wikidataPilotVerified: boolean;
}

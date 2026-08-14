// Opponent profiles (T16, issue #234) — shared types. PURE data shapes only.
//
// Two strictly separated halves, and the separation is the whole point of the
// package (docs/DECISIONS.md §D9 perimetro 3):
//
//   PRIOR   = the pre-auction interview. Every value here is a DECLARED input
//             of Owner (D9 "ingrediente 2"). Nothing in this half is ever
//             estimated, fitted, or inferred by the system.
//   OBSERVED = deterministic counters read off the live event log (D9
//             "ingrediente 1" + "ingrediente 3": measured facts and declared
//             arithmetic on them). See counters.ts.
//
// The two halves are never blended into a single number. `profileView.ts`
// pairs them side by side with their provenance labelled; there is no
// psychological score, no Bayesian update of behavioural parameters, and no
// fitted parameter anywhere in this package.
//
// PRIVACY (no-go, issue #234 "Nota privacy"): a profile is a personal
// judgement about a real person in the league. Real profiles therefore live
// ONLY in runtime-local storage (storage.ts) and are NEVER versioned, never
// committed, never logged verbatim. Two structural guarantees make that hard
// to get wrong by accident rather than merely documented:
//
//   1. the profile carries a `personId` reference and NO name field at all —
//      the human-readable label lives in the league roster (also
//      runtime-local), so a profile blob on its own carries opaque ids;
//   2. the zod schema is `.strict()` (profileSchema.ts), so a stray `name`,
//      `displayName` or `email` key is rejected instead of silently stored.
//
// Every fixture in this package's tests is synthetic.

/**
 * Schema version of the interview profile. Bumped whenever the persisted
 * shape changes; `storage.ts` refuses to read any other version rather than
 * guessing a migration.
 */
export const OPPONENT_PROFILE_SCHEMA_VERSION = 1;

/**
 * Person id shape, mirroring the league roster's (`src/leagueTeams.ts`
 * `personSchema`). Deliberately mirrored rather than imported: a package must
 * not depend on the app root, and this package only needs to agree on the
 * *shape* of the reference, never on the identity of the declaration.
 *
 * The person, not the seat, is what a profile is about: seats change hands
 * between seasons, the judgement follows the human. Counters (counters.ts)
 * are keyed by SEAT (`fantaTeamId`) instead, because that is what the auction
 * event log records; `profileView.ts` joins the two through the roster.
 */
export const PERSON_ID_PATTERN = /^person:[0-9a-f-]{36}$/i;

/** Upper bound on the free-text interview note. Structural, not semantic. */
export const NOTES_MAX_LENGTH = 500;

/** Upper bound on one free-text label (a club or a recurring target name). */
export const LABEL_MAX_LENGTH = 60;

/** Upper bound on how many labels one list field may carry. */
export const LABEL_LIST_MAX = 20;

/**
 * Spending style declared in the interview (design doc §7: "presto/tardi").
 *
 * Every closed vocabulary in this file is declared ONCE as a `as const` tuple
 * and its TypeScript type derived from it, so `z.enum(...)` in
 * profileSchema.ts consumes the same single source of truth: a value added to
 * the vocabulary cannot be accepted by the type and rejected by the schema
 * (or the reverse), because there is only one list.
 */
export const SPENDING_TIMINGS = ["presto", "tardi", "misto"] as const;

export type SpendingTiming = (typeof SPENDING_TIMINGS)[number];

/** Declared susceptibility to tilt. A DECLARED judgement, never a fitted score. */
export const TILT_SUSCEPTIBILITIES = ["bassa", "media", "alta"] as const;

export type TiltSusceptibility = (typeof TILT_SUSCEPTIBILITIES)[number];

/**
 * Closed vocabulary of declared weaknesses (design doc §7: "si innamora dei
 * big, tirchio, tilt dopo un'asta persa"). A fixed enum rather than free text
 * so that a weakness is machine-checkable, comparable across profiles, and
 * safe to summarise in a log without leaking a sentence about a real person.
 */
export const WEAKNESS_CODES = [
  "si_innamora_dei_big",
  "tirchio",
  "tilt_dopo_asta_persa",
  "insegue_i_giocatori_della_sua_squadra",
  "svuota_il_budget_presto",
  "resta_liquido_troppo_a_lungo",
] as const;

export type WeaknessCode = (typeof WEAKNESS_CODES)[number];

/**
 * Per-field confirmation state. Design doc §7: "l'agente propone, Owner
 * conferma riga per riga: il giudizio resta suo, l'agente fa la fatica".
 *
 * `proposto` is therefore NOT a usable input: it is an LLM proposal awaiting
 * Owner's word. Only `confermato` fields are declared inputs under D9
 * ingrediente 2, and `confirmedPrior()` (profileView.ts) is what enforces it
 * — a consumer that reads the raw profile cannot accidentally treat a
 * proposal as a declaration, because the two are different statuses on the
 * same wrapper and the stripping helper is the documented entry point.
 */
export type DeclarationStatus = "confermato" | "proposto";

/** One interview answer plus the provenance that makes it usable (or not). */
export interface Declared<T> {
  readonly value: T;
  readonly status: DeclarationStatus;
  /** ISO `YYYY-MM-DD` of the interview turn that produced this answer. */
  readonly declaredAt: string;
}

/** The interview-side field names, in a stable order. */
export type ProfileFieldId =
  | "spendingTiming"
  | "tiltSusceptibility"
  | "weaknesses"
  | "affinityClubs"
  | "recurringTargets"
  | "notes";

export const PROFILE_FIELD_IDS: readonly ProfileFieldId[] = [
  "spendingTiming",
  "tiltSusceptibility",
  "weaknesses",
  "affinityClubs",
  "recurringTargets",
  "notes",
] as const;

/**
 * One opponent's pre-auction profile. Every judgement field is optional: an
 * interview that did not reach a question leaves it ABSENT, never filled with
 * a fabricated default. Absence and "declared as unknown" are not the same
 * thing and the schema keeps them distinguishable.
 */
export interface OpponentProfile {
  readonly schemaVersion: typeof OPPONENT_PROFILE_SCHEMA_VERSION;
  /** Reference to the person in the league roster. No name is ever stored here. */
  readonly personId: string;
  /** Opaque id of the interview session that produced this profile. */
  readonly interviewId: string;
  readonly spendingTiming?: Declared<SpendingTiming>;
  readonly tiltSusceptibility?: Declared<TiltSusceptibility>;
  readonly weaknesses?: Declared<readonly WeaknessCode[]>;
  /** Clubs the person supports or gravitates to. Club labels, not personal data. */
  readonly affinityClubs?: Declared<readonly string[]>;
  /** Players this person buys year after year ("nomi ricorrenti", design doc §7). */
  readonly recurringTargets?: Declared<readonly string[]>;
  /** Free-text anecdotes from the interview. Runtime-local only, never logged verbatim. */
  readonly notes?: Declared<string>;
}

/** The persisted envelope: what runtime-local storage holds, and nothing else. */
export interface OpponentProfileStore {
  readonly schemaVersion: typeof OPPONENT_PROFILE_SCHEMA_VERSION;
  readonly profiles: readonly OpponentProfile[];
}

// ---------------------------------------------------------------------------
// Observed side — inputs
// ---------------------------------------------------------------------------

/**
 * One observed participation: seat `fantaTeamId` was seen bidding on
 * `playerId` during the auction at (or around) sequence `seq`.
 *
 * WHY THIS IS A SEPARATE INPUT AND NOT READ OFF THE EVENT LOG: the live
 * engine's append-only log (packages/engine/src/events.ts, tranche 1 #263)
 * records only PURCHASE and VOID — who WON, never who BID. "Aste ingaggiate"
 * (D9 perimetro 3) therefore has no producer in the repo today. Rather than
 * silently equating "engaged" with "won" — which would fabricate a 100% win
 * rate out of thin air — the counters report `source-missing` whenever this
 * stream is absent. Supplying it is a separate, deliberate act.
 */
export interface ObservedEngagement {
  readonly seq: number;
  readonly playerId: string;
  readonly fantaTeamId: string;
}

/**
 * The listone anchor for one player: `Qt.A`. Caller-supplied, because this
 * package never reads `public/data/**` and never touches the listone loader.
 */
export interface PriceAnchor {
  readonly playerId: string;
  readonly qtA: number;
}

/**
 * The theoretical max bid a seat had available IMMEDIATELY BEFORE the
 * purchase recorded at `seq`.
 *
 * Caller-supplied on purpose: it is `maxSafe()` (packages/engine/src/
 * auction.ts) evaluated against the state replayed up to `seq`. This package
 * deliberately does not re-derive auction state — it imports the engine's
 * TYPES and its event CONTRACT, never its reducer — so there is exactly one
 * implementation of the hard-safe arithmetic in the repo and no second copy
 * that could drift from it.
 */
export interface MaxBidSnapshot {
  readonly seq: number;
  readonly fantaTeamId: string;
  readonly maxBid: number;
}

/** Which optional input stream a counter needed and did not get. */
export type CounterSource = "engagements" | "priceAnchors" | "maxBidSnapshots";

// ---------------------------------------------------------------------------
// Observed side — outputs
// ---------------------------------------------------------------------------

export type CounterId =
  | "auctionsWon"
  | "auctionsEngaged"
  | "contestedLosses"
  | "winRate"
  | "averageOverpayVsQtA"
  | "averageDistanceFromMaxBid"
  | "spendPaceVsTable";

export const COUNTER_IDS: readonly CounterId[] = [
  "auctionsWon",
  "auctionsEngaged",
  "contestedLosses",
  "winRate",
  "averageOverpayVsQtA",
  "averageDistanceFromMaxBid",
  "spendPaceVsTable",
] as const;

/**
 * The cold-start contract, made a type instead of a convention (D9 perimetro
 * 3: "ogni contatore espone il proprio n; sotto la soglia minima
 * pre-dichiarata il contatore si mostra come «campione insufficiente»").
 *
 * A discriminated union rather than `value?: number`: below threshold there
 * is NO `value` property to read at all, so a consumer cannot fall back to a
 * fabricated default (`?? 0`, `?? 1`) without the type system objecting. The
 * declared UI wording for `insufficient-sample` is «campione insufficiente»;
 * the machine code stays English like every other status enum in the repo.
 *
 * `n` is always present, including on the failing branches — that is the
 * whole point of declaring the cold start rather than hiding it.
 */
export type CounterResult<T> =
  | {
      readonly status: "observed";
      readonly value: T;
      readonly n: number;
      readonly minimumSample: number;
    }
  | {
      readonly status: "insufficient-sample";
      readonly n: number;
      readonly minimumSample: number;
    }
  | {
      readonly status: "source-missing";
      readonly n: 0;
      readonly minimumSample: number;
      readonly missingSource: CounterSource;
    };

/**
 * Minimum sample per statistic-shaped counter.
 *
 * EXACT COUNTS ARE NOT LISTED HERE, and that is a deliberate honesty
 * distinction rather than an omission: "ha vinto 2 aste" is a complete fact
 * at n = 2, while "paga in media +7 su Qt.A" at n = 2 is an estimate dressed
 * as a fact. Counts are always `observed` (minimumSample 0, value === n);
 * only averages and rates can be «campione insufficiente».
 */
export interface CounterThresholds {
  readonly winRate: number;
  readonly averageOverpayVsQtA: number;
  readonly averageDistanceFromMaxBid: number;
  readonly spendPaceVsTable: number;
}

/**
 * PRE-DECLARED defaults — declared parameters, never estimated from data and
 * never tuned by the system. They are exported (rather than hidden inside the
 * computation) precisely so that the threshold in force is inspectable next
 * to the number it gates. Overriding them is a declared input of Owner (D9
 * ingrediente 2), not a system choice.
 *
 * OPEN POINT for Owner: these values are a first declaration by the
 * implementing session, not his. They are provisional until he confirms or
 * replaces them in the pre-auction interview.
 */
export const DEFAULT_COUNTER_THRESHOLDS: CounterThresholds = {
  winRate: 4,
  averageOverpayVsQtA: 3,
  averageDistanceFromMaxBid: 3,
  spendPaceVsTable: 3,
};

/** All counters for one seat, plus the facts that carry no sample of their own. */
export interface OpponentCounters {
  /** The SEAT, as recorded by the auction event log. */
  readonly fantaTeamId: string;
  readonly counters: Readonly<Record<CounterId, CounterResult<number>>>;
  /**
   * `seq` of the most recent auction this seat contested and lost, or `null`.
   *
   * Deliberately NOT called a "tilt flag". It is an observed fact ("has just
   * lost a contested auction"); calling it tilt would be a psychological claim
   * the event log cannot support. The interpretation is the DECLARED
   * `tiltSusceptibility` prior from the interview, paired with this fact —
   * with both provenances visible — in `profileView.ts`. Fact times
   * declaration, never a fitted score.
   */
  readonly lastContestedLossSeq: number | null;
}

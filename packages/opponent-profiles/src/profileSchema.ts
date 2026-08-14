// Opponent profiles — versioned zod schema + validator for the interview side.
//
// Fail-closed in the repo's established style (src/leagueTeams.ts,
// packages/engine/src/events.ts): `.strict()` everywhere, `safeParse` at the
// boundary, and an unparseable input is refused rather than repaired.
//
// `.strict()` is load-bearing for PRIVACY, not just for tidiness: it is what
// makes an accidental `name`/`displayName`/`email` key on a profile a
// validation failure instead of a silently persisted piece of personal data
// (see types.ts header). The privacy test asserts exactly that.

import { z } from "zod";
import {
  LABEL_LIST_MAX,
  LABEL_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  OPPONENT_PROFILE_SCHEMA_VERSION,
  PERSON_ID_PATTERN,
  SPENDING_TIMINGS,
  TILT_SUSCEPTIBILITIES,
  WEAKNESS_CODES,
  type OpponentProfile,
  type OpponentProfileStore,
} from "./types.js";

/**
 * ISO `YYYY-MM-DD` AND a real calendar date (rejects e.g. `2026-02-30`, and
 * anything with surrounding whitespace since the regex anchors the whole
 * string). Same rule as `packages/manual-enrichment/src/fieldValidation.ts`
 * `isValidIsoDate`, mirrored here rather than imported so this package keeps
 * no dependency on the enrichment pipeline.
 */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === (m as number) - 1 &&
    date.getUTCDate() === d
  );
}

const isoDateSchema = z.string().refine(isValidIsoDate, {
  message: "declaredAt must be a real ISO YYYY-MM-DD date",
});

const declarationStatusSchema = z.enum(["confermato", "proposto"]);

/** Wraps one interview answer with its confirmation status and date. */
function declared<T extends z.ZodTypeAny>(valueSchema: T) {
  return z
    .object({
      value: valueSchema,
      status: declarationStatusSchema,
      declaredAt: isoDateSchema,
    })
    .strict();
}

/**
 * One free-text label (a club, a recurring target). Trimmed and bounded:
 * bounded because an unbounded field is how a whole paragraph about a real
 * person ends up somewhere it should not be, trimmed because incidental
 * whitespace in a hand-typed label is not meaningful content.
 */
const labelSchema = z.string().trim().min(1).max(LABEL_MAX_LENGTH);

const labelListSchema = z.array(labelSchema).max(LABEL_LIST_MAX);

/**
 * `.strict()` — an unknown key anywhere in a profile is a hard failure. See
 * the module header: this is the privacy guard, not a style preference.
 */
export const opponentProfileSchema = z
  .object({
    schemaVersion: z.literal(OPPONENT_PROFILE_SCHEMA_VERSION),
    personId: z.string().regex(PERSON_ID_PATTERN),
    interviewId: z.string().trim().min(1).max(LABEL_MAX_LENGTH),
    spendingTiming: declared(z.enum(SPENDING_TIMINGS)).optional(),
    tiltSusceptibility: declared(z.enum(TILT_SUSCEPTIBILITIES)).optional(),
    weaknesses: declared(
      z
        .array(z.enum(WEAKNESS_CODES))
        .max(WEAKNESS_CODES.length)
        // A repeated weakness code is not a "slightly wrong" profile: it is a
        // list that no longer means what a list means. Refuse, never dedupe
        // silently.
        .refine((codes) => new Set(codes).size === codes.length, {
          message: "weaknesses must not repeat a code",
        }),
    ).optional(),
    affinityClubs: declared(labelListSchema).optional(),
    recurringTargets: declared(labelListSchema).optional(),
    notes: declared(z.string().trim().min(1).max(NOTES_MAX_LENGTH)).optional(),
  })
  .strict();

export const opponentProfileStoreSchema = z
  .object({
    schemaVersion: z.literal(OPPONENT_PROFILE_SCHEMA_VERSION),
    profiles: z.array(opponentProfileSchema),
  })
  .strict()
  // Two profiles for one person are two judgements about one human: the store
  // could not say which is current, so it refuses to hold both.
  .refine(
    (store) =>
      new Set(store.profiles.map((p) => p.personId)).size === store.profiles.length,
    { message: "duplicate personId in profile store" },
  );

export type ProfileValidation =
  | { readonly ok: true; readonly profile: OpponentProfile }
  | { readonly ok: false; readonly issues: readonly ProfileIssue[] };

/**
 * A validation failure, reported as PATH + CODE only — never the offending
 * value. Same posture as `packages/manual-enrichment/src/types.ts`'s
 * `IssueCode`, and for the same reason: a validation report on a real profile
 * has to be safe to print, and the way to guarantee that is to make leaking
 * structurally impossible rather than to remember not to do it.
 */
export interface ProfileIssue {
  /** Dotted field path, e.g. `spendingTiming.value`. Field names only. */
  readonly path: string;
  /** zod's issue code (`invalid_type`, `unrecognized_keys`, …). Never a value. */
  readonly code: string;
}

/**
 * Maps zod issues to the safe-to-log shape.
 *
 * The `unrecognized_keys` branch deliberately DOES name the offending keys:
 * a rejected key is a field NAME (`name`, `email`), never a field value, and
 * without it the most important failure this schema can produce — someone
 * tried to store a person's name — would report only "something extra at the
 * root", which is useless exactly when it matters most.
 */
export function zodIssuesToProfileIssues(error: z.ZodError): readonly ProfileIssue[] {
  return error.issues
    .map((issue) => {
      const base = issue.path.join(".");
      if (issue.code === "unrecognized_keys") {
        const keys = [...issue.keys].sort();
        return { path: base === "" ? keys.join(",") : `${base}.${keys.join(",")}`, code: issue.code as string };
      }
      return { path: base, code: issue.code as string };
    })
    .sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
}

/** Non-throwing validator. Returns the parsed profile or safe-to-log issues. */
export function validateOpponentProfile(input: unknown): ProfileValidation {
  const parsed = opponentProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: zodIssuesToProfileIssues(parsed.error) };
  return { ok: true, profile: parsed.data as OpponentProfile };
}

/** Throwing variant, for call sites that have already validated upstream. */
export function parseOpponentProfile(input: unknown): OpponentProfile {
  return opponentProfileSchema.parse(input) as OpponentProfile;
}

export type StoreValidation =
  | { readonly ok: true; readonly store: OpponentProfileStore }
  | { readonly ok: false; readonly issues: readonly ProfileIssue[] };

export function validateOpponentProfileStore(input: unknown): StoreValidation {
  const parsed = opponentProfileStoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: zodIssuesToProfileIssues(parsed.error) };
  return { ok: true, store: parsed.data as OpponentProfileStore };
}

/**
 * A structural summary of a profile, safe to write to a log or an error
 * report: counts and field names only, never a declared value, never a label,
 * never the note, never the `personId`.
 *
 * Issue #234 acceptance asks for "nessun dato personale reale nel repo **o nei
 * log**". A summary that is safe by construction is the only version of that
 * promise a future caller cannot accidentally break.
 */
export interface ProfileLogSummary {
  readonly schemaVersion: number;
  readonly declaredFieldCount: number;
  readonly confirmedFieldCount: number;
  readonly fieldsPresent: readonly string[];
}

export function profileLogSummary(profile: OpponentProfile): ProfileLogSummary {
  const entries = Object.entries(profile).filter(
    ([key, value]) =>
      key !== "schemaVersion" &&
      key !== "personId" &&
      key !== "interviewId" &&
      value !== undefined,
  ) as ReadonlyArray<[string, { status: string }]>;
  return {
    schemaVersion: profile.schemaVersion,
    declaredFieldCount: entries.length,
    confirmedFieldCount: entries.filter(([, v]) => v.status === "confermato").length,
    fieldsPresent: entries.map(([key]) => key).sort(),
  };
}

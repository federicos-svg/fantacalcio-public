// Auction log persistence + fail-closed recovery (LIVE-02) — extracted from
// main.ts for the same reason src/price.ts and src/callGuard.ts were: pure
// logic needs to be importable in a test without a DOM (this repo has no
// jsdom/happy-dom harness — see PROJECT_STATE.md "Test-coverage hardening").
// See docs/AUCTION_2026_EXECUTION_PLAN.md LIVE-02 for the behavioral
// contract.
//
// Storage is injected (StorageLike below), never `window.localStorage`
// directly — main.ts is the only place that binds the real browser API.
// Every branch here is testable with a synthetic in-memory fake.

import { z } from "zod";
import { type AuctionEvent, type AuctionState, ROLES } from "../packages/engine/src/types.js";
import { eventSchema } from "../packages/engine/src/events.js";
import { reduce } from "../packages/engine/src/reduce.js";
import { type ConfirmationInput, validateConfirmations } from "../packages/engine/src/confirmations.js";
import {
  CONFIRMATIONS_STORAGE_KEY,
  confirmationEntrySchema,
  saveConfirmations,
  type SaveConfirmationsResult,
} from "./confirmationsStore.js";

/** Minimal synchronous storage contract this module needs — matches
 *  window.localStorage's shape closely enough to inject a fake in tests,
 *  and lets read/write failures (quota, security, disabled storage) be
 *  modeled explicitly instead of assumed away. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Canonical key unchanged — backward compatible with the log format already
// shipped under this key before this extraction.
export const LOG_STORAGE_KEY = "fac_log";
export const LAST_KNOWN_GOOD_STORAGE_KEY = "fac_log_lkg";
export const QUARANTINE_STORAGE_KEY = "fac_log_quarantine";
export const PORTABLE_LOG_FORMAT = "fantacalcio-auction-log";
// v2 (tranche 2b, #231): the envelope also carries the riconferme batch
// (`confirmations`) so a portable file is a complete pre-asta+live snapshot,
// not just the live log. v1 files (no `confirmations` key) still import: the
// log is validated against the DEVICE's current confirmations instead (see
// parseAuctionLogImport) — "coerente -> import, incoerente -> rifiuto
// esplicito" per the archived design. Export always emits v2 now.
export const PORTABLE_LOG_VERSION = 2;
export const PORTABLE_LOG_VERSION_LEGACY = 1;

const LAST_KNOWN_GOOD_SCHEMA_VERSION = 1;

interface LastKnownGoodEnvelope {
  readonly schemaVersion: typeof LAST_KNOWN_GOOD_SCHEMA_VERSION;
  readonly log: readonly AuctionEvent[];
}

// ── Structural + replay validation ──────────────────────────────────────

export type LogValidationResult =
  | { readonly ok: true; readonly events: readonly AuctionEvent[] }
  | { readonly ok: false; readonly reasons: readonly string[] };

export type PortableLogResult =
  | {
      readonly ok: true;
      readonly raw: string;
      readonly events: readonly AuctionEvent[];
      /** v2: the file's own batch. v1 legacy: echoed back unchanged from the
       *  device's confirmations the log was validated against — never a
       *  second, divergent source of truth for a file that carries none. */
      readonly confirmations: readonly ConfirmationInput[];
    }
  | { readonly ok: false; readonly reason: "invalid-log" | "malformed-file" | "incompatible-version"; readonly reasons: readonly string[] };

/**
 * Full validation of an already-JSON.parse'd log payload: array shape,
 * per-event schema (reusing packages/engine's own zod schema — never a
 * blind cast), append-order/seq coherence, VOID/target coherence, a replay
 * through the real reducer, and a check that no player is ever
 * simultaneously "active" (purchased and not voided) more than once. A
 * payload that merely parses as JSON is not sufficient on its own.
 *
 * `confirmations` (tranche 2b, optional, default none — byte-identical to
 * pre-2b when omitted) is passed straight through to reduce(): it seeds each
 * team's initial roster for the invariant checks below AND makes reduce()
 * itself throw fail-closed on a live PURCHASE of an already-confirmed
 * playerId (packages/engine/src/reduce.ts, audit fix 3) — caught by the SAME
 * try/catch as any other replay failure, one more `reasons` entry, no new
 * branch needed here.
 *
 * Pure: never mutates `parsed`, never touches storage/clock.
 */
export function validateAuctionLog(
  parsed: unknown,
  fantaTeamIds: readonly string[],
  confirmations: readonly ConfirmationInput[] = [],
): LogValidationResult {
  if (!Array.isArray(parsed)) {
    return { ok: false, reasons: ["not-an-array"] };
  }

  const shapeReasons: string[] = [];
  const events: AuctionEvent[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const r = eventSchema.safeParse(parsed[i]);
    if (!r.success) {
      shapeReasons.push(`event[${i}]: invalid shape or type`);
      continue;
    }
    events.push(r.data);
  }
  if (shapeReasons.length > 0) return { ok: false, reasons: shapeReasons };

  // Append order must already be strictly increasing seq — the only order
  // this app's own append path (packages/engine/src/events.ts appendEvent)
  // ever produces. A log with entries out of order, duplicated, or
  // non-monotonic seq did not come from that path and is corrupted, not
  // silently re-sorted into shape.
  const orderReasons: string[] = [];
  const seqSeen = new Set<number>();
  let lastSeq = -1;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (seqSeen.has(e.seq)) orderReasons.push(`event[${i}]: duplicate seq ${e.seq}`);
    seqSeen.add(e.seq);
    if (e.seq <= lastSeq) orderReasons.push(`event[${i}]: seq ${e.seq} out of append order`);
    lastSeq = e.seq;
  }
  if (orderReasons.length > 0) return { ok: false, reasons: orderReasons };

  // VOID coherence: target must exist, not itself be a VOID, precede the VOID
  // in seq order, and be targeted by at most one VOID. Da quando il log porta
  // anche svincoli e scambi, il bersaglio ammesso non e piu il solo acquisto:
  // ogni gesto che muove una rosa o un budget si annulla allo stesso modo. Un
  // VOID di un VOID resta senza significato ed e l'unico caso escluso.
  const voidReasons: string[] = [];
  const bySeq = new Map<number, AuctionEvent>();
  for (const e of events) bySeq.set(e.seq, e);
  const voidedTargets = new Set<number>();
  for (const e of events) {
    if (e.type !== "VOID") continue;
    const target = bySeq.get(e.targetSeq);
    if (!target) {
      voidReasons.push(`VOID seq ${e.seq}: target seq ${e.targetSeq} does not exist`);
      continue;
    }
    if (target.type === "VOID") {
      voidReasons.push(`VOID seq ${e.seq}: target seq ${e.targetSeq} is itself a VOID`);
      continue;
    }
    if (e.targetSeq >= e.seq) {
      voidReasons.push(`VOID seq ${e.seq}: target seq ${e.targetSeq} does not precede it`);
      continue;
    }
    if (voidedTargets.has(e.targetSeq)) {
      voidReasons.push(`VOID seq ${e.seq}: target seq ${e.targetSeq} already voided`);
      continue;
    }
    voidedTargets.add(e.targetSeq);
  }
  if (voidReasons.length > 0) return { ok: false, reasons: voidReasons };

  // Replay through the real reducer — catches an unknown fantaTeamId and
  // any future invariant reduce() itself enforces.
  let replayed: AuctionState;
  try {
    replayed = reduce(events, fantaTeamIds, confirmations);
  } catch (err) {
    return {
      ok: false,
      reasons: [`replay failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  // Replay invariants. reduce() is a pure projection: it computes
  // budgetResidual and slotsRemaining by arithmetic and does NOT refuse a log
  // that drives them negative — purchaseFeasibility() is what prevents that at
  // write time. A stored or imported log that violates them did not come
  // through that path, and accepting it here is fail-OPEN: a negative
  // totalSlotsRemaining makes maxSafe()/budgetPlan() throw at render time, and
  // a negative budgetResidual silently shows a wrong budget — exactly what
  // LIVE-02's fail-closed persistence exists to prevent.
  const invariantReasons: string[] = [];
  for (const id of fantaTeamIds) {
    const team = replayed.teams[id];
    if (!team) continue;
    if (team.budgetResidual < 0) {
      invariantReasons.push(
        `invariant-violated: team ${id} budgetResidual ${team.budgetResidual} < 0`,
      );
    }
    for (const role of ROLES) {
      if (team.slotsRemaining[role] < 0) {
        invariantReasons.push(
          `invariant-violated: team ${id} slotsRemaining[${role}] ${team.slotsRemaining[role]} < 0`,
        );
      }
    }
  }
  if (invariantReasons.length > 0) return { ok: false, reasons: invariantReasons };

  // UN GIOCATORE NON PUO STARE IN DUE ROSE NELLO STESSO ISTANTE —
  // purchaseFeasibility() lo impedisce in scrittura; un log conservato che lo
  // contiene gia non e passato di li.
  //
  // LA DOMANDA E CAMBIATA quando il log ha imparato lo svincolo. Prima bastava
  // «comprato due volte senza un annullamento in mezzo»: adesso comprare due
  // volte lo stesso giocatore e LEGITTIMO, se fra i due acquisti qualcuno lo ha
  // svincolato. La proprieta va quindi seguita nel tempo — gli eventi sono gia
  // stati verificati in ordine di seq stretto qui sopra, quindi scorrerli e
  // scorrere la cronologia — e il difetto da cercare e un acquisto che arriva
  // mentre il giocatore e ancora di qualcuno.
  const duplicateReasons: string[] = [];
  const ownerOf = new Map<string, string>();
  for (const e of events) {
    if (e.type === "VOID" || voidedTargets.has(e.seq)) continue;
    if (e.type === "PURCHASE") {
      const owner = ownerOf.get(e.playerId);
      if (owner !== undefined) {
        duplicateReasons.push(
          `player ${e.playerId} purchased by ${e.fantaTeamId} while still on ${owner}'s roster`,
        );
        continue;
      }
      ownerOf.set(e.playerId, e.fantaTeamId);
    } else if (e.type === "RELEASE") {
      ownerOf.delete(e.playerId);
    } else {
      for (const playerId of e.fromA) ownerOf.set(playerId, e.teamBId);
      for (const playerId of e.fromB) ownerOf.set(playerId, e.teamAId);
    }
  }
  if (duplicateReasons.length > 0) return { ok: false, reasons: duplicateReasons };

  return { ok: true, events };
}

export function exportAuctionLog(
  log: readonly AuctionEvent[],
  fantaTeamIds: readonly string[],
  confirmations: readonly ConfirmationInput[] = [],
): PortableLogResult {
  const validation = validateAuctionLog(log, fantaTeamIds, confirmations);
  if (!validation.ok) {
    return { ok: false, reason: "invalid-log", reasons: validation.reasons };
  }
  const raw = `${JSON.stringify({
    format: PORTABLE_LOG_FORMAT,
    version: PORTABLE_LOG_VERSION,
    log: validation.events,
    confirmations,
  }, null, 2)}\n`;
  return { ok: true, raw, events: validation.events, confirmations };
}

/**
 * `deviceConfirmations` (tranche 2b, optional, default none) is what a v1
 * legacy file (no `confirmations` key of its own) is validated against: the
 * log a v1 file carries was written before riconferme existed, so the only
 * meaningful check is "is it still coherent with THIS device's current
 * riconferme" — coherent imports, incoherent is refused explicitly (never
 * silently imported against a mismatched state). A v2 file is
 * self-contained: it is validated against its OWN `confirmations` field,
 * `deviceConfirmations` is not consulted for it.
 */
export function parseAuctionLogImport(
  raw: string,
  fantaTeamIds: readonly string[],
  deviceConfirmations: readonly ConfirmationInput[] = [],
): PortableLogResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed-file", reasons: ["invalid-json"] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "malformed-file", reasons: ["not-an-object"] };
  }
  const envelope = parsed as Record<string, unknown>;
  const keys = Object.keys(envelope).sort().join(",");
  // "manualPlayers" is still accepted, and then ignored: the manual-scouting
  // feature is gone, but files exported while it existed must keep importing
  // rather than fail the envelope check. Nothing writes that key any more.
  const isV1Basic = keys === "format,log,version";
  const isV1Legacy = keys === "format,log,manualPlayers,version";
  const isV2 = keys === "confirmations,format,log,version";
  if (envelope.format !== PORTABLE_LOG_FORMAT || !(isV1Basic || isV1Legacy || isV2)) {
    return { ok: false, reason: "malformed-file", reasons: ["invalid-envelope"] };
  }

  const version = envelope.version;
  if (version !== PORTABLE_LOG_VERSION_LEGACY && version !== PORTABLE_LOG_VERSION) {
    return { ok: false, reason: "incompatible-version", reasons: ["unsupported-version"] };
  }

  if (version === PORTABLE_LOG_VERSION_LEGACY) {
    // A v2-shaped envelope (has `confirmations`) claiming version 1, or vice
    // versa, is internally inconsistent — malformed, not a version mismatch.
    if (!isV1Basic && !isV1Legacy) {
      return { ok: false, reason: "malformed-file", reasons: ["invalid-envelope"] };
    }
    const validation = validateAuctionLog(envelope.log, fantaTeamIds, deviceConfirmations);
    if (!validation.ok) {
      return { ok: false, reason: "invalid-log", reasons: validation.reasons };
    }
    return { ok: true, raw, events: validation.events, confirmations: deviceConfirmations };
  }

  // version === PORTABLE_LOG_VERSION (2)
  if (!isV2) {
    return { ok: false, reason: "malformed-file", reasons: ["invalid-envelope"] };
  }
  const confirmationsShape = z.array(confirmationEntrySchema).safeParse(envelope.confirmations);
  if (!confirmationsShape.success) {
    return { ok: false, reason: "malformed-file", reasons: ["invalid-confirmations-shape"] };
  }
  const confirmationsSemantic = validateConfirmations(confirmationsShape.data, fantaTeamIds);
  if (!confirmationsSemantic.ok) {
    return {
      ok: false,
      reason: "invalid-log",
      reasons: confirmationsSemantic.issues.map(
        (issue) => `confirmations[${issue.index}] ${issue.fantaTeamId}/${issue.playerId}: ${issue.violation}`,
      ),
    };
  }
  const validation = validateAuctionLog(envelope.log, fantaTeamIds, confirmationsShape.data);
  if (!validation.ok) {
    return { ok: false, reason: "invalid-log", reasons: validation.reasons };
  }
  return { ok: true, raw, events: validation.events, confirmations: confirmationsShape.data };
}

export type PortableLogPeek = "v1" | "v2" | "unknown";

/**
 * Lightweight, NON-validating envelope classification — used only to word
 * the import-confirm dialog's copy (main.ts renderImportConfirm) BEFORE the
 * operator has decided whether to proceed, so it can name exactly what a v2
 * file replaces (storico E riconferme) versus a v1 legacy file (solo lo
 * storico — le riconferme del dispositivo restano). Mirrors the SAME
 * envelope-shape checks parseAuctionLogImport uses (isV1Basic/isV1Legacy/
 * isV2 + version match) so the two never drift apart, but never runs
 * validateAuctionLog/validateConfirmations — this is a peek, not an accept/
 * reject decision. Malformed JSON, an unrecognised shape, or a version that
 * doesn't match the envelope's own key set all fall back to "unknown": the
 * dialog then falls back to more cautious wording rather than assert a
 * version it cannot actually confirm.
 */
export function peekPortableLogEnvelope(raw: string): PortableLogPeek {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "unknown";
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return "unknown";
  const envelope = parsed as Record<string, unknown>;
  if (envelope.format !== PORTABLE_LOG_FORMAT) return "unknown";
  const keys = Object.keys(envelope).sort().join(",");
  if (keys === "confirmations,format,log,version" && envelope.version === PORTABLE_LOG_VERSION) return "v2";
  if (
    (keys === "format,log,version" || keys === "format,log,manualPlayers,version") &&
    envelope.version === PORTABLE_LOG_VERSION_LEGACY
  ) {
    return "v1";
  }
  return "unknown";
}

// ── Storage I/O helpers — never throw, always report ──────────────────────

type StorageReadResult =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly message: string };

type StorageWriteResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

function safeGetItem(storage: StorageLike, key: string): StorageReadResult {
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function safeSetItem(storage: StorageLike, key: string, value: string): StorageWriteResult {
  try {
    storage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function safeRemoveItem(storage: StorageLike, key: string): StorageWriteResult {
  try {
    storage.removeItem(key);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function restoreItem(storage: StorageLike, key: string, previous: string | null): StorageWriteResult {
  return previous === null ? safeRemoveItem(storage, key) : safeSetItem(storage, key, previous);
}

function parseLastKnownGood(
  raw: string,
  fantaTeamIds: readonly string[],
  confirmations: readonly ConfirmationInput[] = [],
): readonly AuctionEvent[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !== LAST_KNOWN_GOOD_SCHEMA_VERSION
  ) {
    return null;
  }
  const validated = validateAuctionLog((parsed as { log?: unknown }).log, fantaTeamIds, confirmations);
  return validated.ok ? validated.events : null;
}

// ── Boot-time load ──────────────────────────────────────────────────────

export type LoadLogResult =
  | { readonly status: "no-log"; readonly log: readonly AuctionEvent[] }
  | { readonly status: "valid"; readonly log: readonly AuctionEvent[] }
  | {
      readonly status: "recovered";
      readonly log: readonly AuctionEvent[];
      readonly quarantinedRaw: string;
      readonly quarantineStored: boolean;
    }
  | {
      readonly status: "unrecoverable";
      readonly quarantinedRaw: string;
      readonly quarantineStored: boolean;
    }
  | {
      readonly status: "storage-error";
      readonly message: string;
      // Non-null only when this state was reached AFTER a corrupted canonical
      // was already read and quarantined — i.e. the recovery re-persist below
      // failed. The exact raw text must stay exportable even then (LIVE-02:
      // "il canonico invalido resta sempre disponibile raw in memoria"), so it
      // travels with the error instead of being dropped. A storage-error
      // raised before that point (canonical unreadable) has nothing to carry.
      readonly quarantinedRaw: string | null;
      readonly quarantineStored: boolean;
    };

/**
 * Boots the auction log from storage, fail-closed. Five distinguished
 * outcomes (see LoadLogResult) — never a bare `[]` standing in for
 * "invalid", never a blind cast. A canonical log that fails validation is
 * quarantined (exact raw text preserved) before anything else, then a
 * last-known-good copy is tried — itself run through the SAME full
 * validation, so a present-but-invalid copy is never treated as a recovery.
 * A successful recovery also RE-PERSISTS the recovered events as the new
 * canonical (see the `recovered` branch below) — that is part of LIVE-02's
 * persistence contract, not an optimization.
 *
 * `confirmations` (tranche 2b, optional, default none — byte-identical to
 * pre-2b when omitted) flows into every validateAuctionLog() call below:
 * boot itself is where a confirmations/live-log conflict (packages/engine's
 * reduce(), audit fix 3) is caught fail-closed — as one more replay-failure
 * reason inside the SAME try/catch validateAuctionLog already has — rather
 * than left to surface as a raw throw the first time a screen derives state.
 */
export function loadAuctionLog(
  storage: StorageLike,
  fantaTeamIds: readonly string[],
  confirmations: readonly ConfirmationInput[] = [],
): LoadLogResult {
  const canonical = safeGetItem(storage, LOG_STORAGE_KEY);
  if (!canonical.ok) {
    return {
      status: "storage-error",
      message: canonical.message,
      quarantinedRaw: null,
      quarantineStored: false,
    };
  }
  if (canonical.value === null) {
    return { status: "no-log", log: [] };
  }

  let parsed: unknown;
  let parseErrorMessage: string | null = null;
  try {
    parsed = JSON.parse(canonical.value);
  } catch (err) {
    parseErrorMessage = err instanceof Error ? err.message : String(err);
  }

  const validation: LogValidationResult =
    parseErrorMessage === null
      ? validateAuctionLog(parsed, fantaTeamIds, confirmations)
      : { ok: false, reasons: [`invalid JSON: ${parseErrorMessage}`] };

  if (validation.ok) {
    return { status: "valid", log: validation.events };
  }

  // Canonical is invalid. Quarantine the EXACT raw text — never re-derived,
  // never normalized, never skipped, never auto-cleared later — before
  // anything else happens.
  const quarantineWrite = safeSetItem(storage, QUARANTINE_STORAGE_KEY, canonical.value);

  const lkgRaw = safeGetItem(storage, LAST_KNOWN_GOOD_STORAGE_KEY);
  const lkgEvents =
    lkgRaw.ok && lkgRaw.value !== null ? parseLastKnownGood(lkgRaw.value, fantaTeamIds, confirmations) : null;

  if (lkgEvents) {
    // Recovery is not complete until the recovered events ARE the canonical.
    // Leaving the corrupted raw in place while the app runs on the recovered
    // log desynchronizes the two: every later optimistic-concurrency save
    // (saveAuctionLog's `expectedPreviousLog`, below) compares its baseline —
    // a serialization of the recovered log — against that corrupted raw, never
    // matches, and refuses the write with `divergent-log` forever; a reload
    // re-enters this same branch, so the state is not self-healing either.
    // Same serialization as saveAuctionLog's canonical write (JSON.stringify
    // of the validated events, and `lkgEvents` already came out of
    // validateAuctionLog), so equality with that baseline holds by
    // construction rather than by coincidence.
    // The corrupted text is NOT lost: it was quarantined verbatim just above,
    // and is still returned in `quarantinedRaw` for the forensic export.
    const recoveredRaw = JSON.stringify(lkgEvents);
    const repersist = safeSetItem(storage, LOG_STORAGE_KEY, recoveredRaw);
    const repersistedRead = safeGetItem(storage, LOG_STORAGE_KEY);
    const repersistVerified =
      repersist.ok && repersistedRead.ok && repersistedRead.value === recoveredRaw;
    if (!repersistVerified) {
      // Fail-closed, like every other unverifiable write in this module: an
      // unwritable canonical means the recovered log cannot be persisted at
      // all, so the operator must see a blocked storage state (retryable)
      // instead of a working-looking screen whose every save would be
      // refused. Quarantine info travels along so the export stays available.
      return {
        status: "storage-error",
        message: !repersist.ok
          ? `impossibile ripersistere lo storico ripristinato: ${repersist.message}`
          : !repersistedRead.ok
            ? `ripersistenza dello storico ripristinato non verificabile: ${repersistedRead.message}`
            : "ripersistenza dello storico ripristinato non verificata",
        quarantinedRaw: canonical.value,
        quarantineStored: quarantineWrite.ok,
      };
    }
    return {
      status: "recovered",
      log: lkgEvents,
      quarantinedRaw: canonical.value,
      quarantineStored: quarantineWrite.ok,
    };
  }
  return {
    status: "unrecoverable",
    quarantinedRaw: canonical.value,
    quarantineStored: quarantineWrite.ok,
  };
}

// ── Save (the only write path) ──────────────────────────────────────────

export type SaveLogResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "invalid-log"; readonly reasons: readonly string[] }
  | { readonly ok: false; readonly reason: "storage-write-error"; readonly message: string }
  | { readonly ok: false; readonly reason: "partial-write"; readonly message: string }
  | { readonly ok: false; readonly reason: "divergent-log"; readonly message: string };

export type ImportLogResult =
  | {
      readonly ok: true;
      readonly events: readonly AuctionEvent[];
      /** The riconferme batch now persisted alongside `events` — the file's
       *  own for a v2 import, echoed device state unchanged for v1 legacy. */
      readonly confirmations: readonly ConfirmationInput[];
    }
  | { readonly ok: false; readonly reason: "confirmation-required" }
  | { readonly ok: false; readonly reason: "malformed-file" | "incompatible-version" | "invalid-log"; readonly reasons: readonly string[] }
  | Extract<SaveLogResult, { readonly ok: false }>;

/**
 * Serializes a caller-supplied baseline through the same
 * validate-then-stringify pipeline the canonical write uses, so the divergence
 * comparison is byte-for-byte against the stored canonical.
 *
 * PRECONDITION — the comparison is free of spurious key-order/formatting
 * mismatches only for a canonical written by THIS module: saveAuctionLog()
 * below, or loadAuctionLog()'s recovery re-persist. Those are the only two
 * writers of LOG_STORAGE_KEY here, and both emit
 * `JSON.stringify(validateAuctionLog(...).events)`, whose key order is fixed
 * by the zod schema. A canonical produced by anything else (hand-edited
 * storage, a differently formatted external writer) may still be logically
 * equal yet textually different: it is then reported as divergent and the
 * write is refused — fail-closed by design, never a silent overwrite.
 *
 * A baseline that does not validate is serialized as-is: it cannot equal a
 * canonical written by this module, so it too is reported as divergent.
 */
function canonicalBaseline(
  expected: readonly AuctionEvent[],
  fantaTeamIds: readonly string[],
  confirmations: readonly ConfirmationInput[] = [],
): string {
  const validation = validateAuctionLog(expected, fantaTeamIds, confirmations);
  return JSON.stringify(validation.ok ? validation.events : expected);
}

/** "Never written" (null) and "an empty log was explicitly saved" ("[]") are
 *  the same logical state, so they must compare equal on both sides. */
function normalizeCanonicalRaw(raw: string | null): string {
  return raw === null ? "[]" : raw;
}

/**
 * The only way this module persists a log. Validates before writing —
 * refuses to save anything that would fail the same fail-closed checks a
 * boot-time read applies — and updates the last-known-good copy in the
 * same call. LKG is written first and a failed canonical write triggers a
 * byte-for-byte verified rollback. An unverifiable final state is reported
 * as partial-write so the UI can remain blocked. Never mutates `log`.
 *
 * `expectedPreviousLog` (optional) is the baseline the caller computed `log`
 * FROM. When supplied, this call becomes an optimistic-concurrency write: if
 * the canonical currently in storage is not that baseline, someone else (a
 * second browser tab booted earlier, holding a stale in-memory log) has
 * written in the meantime, and this write is refused with `divergent-log`
 * BEFORE any side effect — instead of silently overwriting, and losing, the
 * other tab's purchase. Omitting the argument keeps the previous behaviour
 * exactly (unconditional overwrite), which is what the two deliberate
 * replacement paths want: importAuctionLog() below and main.ts's
 * confirmStartNewLog() reset-after-quarantine.
 *
 * This is optimistic concurrency only: it detects and refuses a lost update,
 * it does not synchronize tabs (no BroadcastChannel/lock — out of scope here).
 *
 * `confirmations` (tranche 2b, optional, default none) is passed straight
 * through to validateAuctionLog()/canonicalBaseline() — the log this call
 * persists is validated (and, for the divergence check, re-baselined)
 * AGAINST this same riconferme batch, so a save can never write a log that
 * conflicts with what is currently confirmed.
 */
export function saveAuctionLog(
  storage: StorageLike,
  log: readonly AuctionEvent[],
  fantaTeamIds: readonly string[],
  expectedPreviousLog?: readonly AuctionEvent[],
  confirmations: readonly ConfirmationInput[] = [],
): SaveLogResult {
  const validation = validateAuctionLog(log, fantaTeamIds, confirmations);
  if (!validation.ok) {
    return { ok: false, reason: "invalid-log", reasons: validation.reasons };
  }

  const previousCanonical = safeGetItem(storage, LOG_STORAGE_KEY);
  const previousLkg = safeGetItem(storage, LAST_KNOWN_GOOD_STORAGE_KEY);
  if (!previousCanonical.ok || !previousLkg.ok) {
    return {
      ok: false,
      reason: "storage-write-error",
      message: !previousCanonical.ok
        ? previousCanonical.message
        : previousLkg.ok
          ? "storage read failed"
          : previousLkg.message,
    };
  }

  // Divergence check: reuses the canonical value already read above for the
  // rollback path — no second read — and runs before any write, so a refused
  // save leaves storage exactly as it was.
  if (expectedPreviousLog !== undefined) {
    const expectedRaw = normalizeCanonicalRaw(canonicalBaseline(expectedPreviousLog, fantaTeamIds, confirmations));
    const actualRaw = normalizeCanonicalRaw(previousCanonical.value);
    if (expectedRaw !== actualRaw) {
      return {
        ok: false,
        reason: "divergent-log",
        message:
          "lo storico salvato non corrisponde più alla base di questa operazione (scrittura concorrente)",
      };
    }
  }

  const canonicalRaw = JSON.stringify(validation.events);

  const envelope: LastKnownGoodEnvelope = {
    schemaVersion: LAST_KNOWN_GOOD_SCHEMA_VERSION,
    log: validation.events,
  };
  const lkgRaw = JSON.stringify(envelope);
  const lkgWrite = safeSetItem(storage, LAST_KNOWN_GOOD_STORAGE_KEY, lkgRaw);
  if (!lkgWrite.ok) {
    const rollback = restoreItem(storage, LAST_KNOWN_GOOD_STORAGE_KEY, previousLkg.value);
    const canonicalAfter = safeGetItem(storage, LOG_STORAGE_KEY);
    const lkgAfter = safeGetItem(storage, LAST_KNOWN_GOOD_STORAGE_KEY);
    const rollbackVerified =
      rollback.ok &&
      canonicalAfter.ok &&
      canonicalAfter.value === previousCanonical.value &&
      lkgAfter.ok &&
      lkgAfter.value === previousLkg.value;
    return rollbackVerified
      ? { ok: false, reason: "storage-write-error", message: lkgWrite.message }
      : {
          ok: false,
          reason: "partial-write",
          message: `LKG write failed and rollback was not verified: ${lkgWrite.message}`,
        };
  }

  const canonicalWrite = safeSetItem(storage, LOG_STORAGE_KEY, canonicalRaw);
  if (!canonicalWrite.ok) {
    const rollback = restoreItem(storage, LAST_KNOWN_GOOD_STORAGE_KEY, previousLkg.value);
    const canonicalAfter = safeGetItem(storage, LOG_STORAGE_KEY);
    const lkgAfter = safeGetItem(storage, LAST_KNOWN_GOOD_STORAGE_KEY);
    const rollbackVerified =
      rollback.ok &&
      canonicalAfter.ok &&
      canonicalAfter.value === previousCanonical.value &&
      lkgAfter.ok &&
      lkgAfter.value === previousLkg.value;
    return rollbackVerified
      ? { ok: false, reason: "storage-write-error", message: canonicalWrite.message }
      : {
          ok: false,
          reason: "partial-write",
          message: `canonical write failed and rollback was not verified: ${canonicalWrite.message}`,
        };
  }

  const canonicalAfter = safeGetItem(storage, LOG_STORAGE_KEY);
  const lkgAfter = safeGetItem(storage, LAST_KNOWN_GOOD_STORAGE_KEY);
  if (
    !canonicalAfter.ok ||
    canonicalAfter.value !== canonicalRaw ||
    !lkgAfter.ok ||
    lkgAfter.value !== lkgRaw
  ) {
    return {
      ok: false,
      reason: "partial-write",
      message: "final persistence verification failed",
    };
  }

  return { ok: true };
}

/**
 * `deviceConfirmations` (tranche 2b, optional, default none) is this
 * device's CURRENT riconferme batch — passed to parseAuctionLogImport() so
 * a v1 legacy file's log is validated against it (see that function).
 *
 * Portable log v2 makes the file's own `confirmations` field this device's
 * new canonical riconferme too — "sostituzione atomica e rollback
 * verificato" per the archived design. Since the log and the riconferme
 * batch live under two separate storage keys (logRecovery.ts's own, and
 * confirmationsStore.ts's), true single-write atomicity is not available —
 * same structural limit saveAuctionLog already lives with for its own
 * canonical+LKG pair. This function approximates it the same way: the log
 * is written and verified FIRST (through the ordinary saveAuctionLog fail-
 * closed path), then the confirmations batch is written and verified via
 * saveConfirmations(); if THAT fails, BOTH stores are rolled back to their
 * PRE-import bytes (verified) — the log through the same fail-closed
 * saveAuctionLog path, the riconferme store through a raw restore of the
 * exact bytes read back before this call ever wrote to it. Rolling back only
 * the log (an earlier version of this function did) left the two stores
 * describing two different moments whenever saveConfirmations' own write
 * landed in an indeterminate state (its `partial-write` outcome: the bytes
 * now on disk are neither the old batch nor a verified new one) — the log
 * would already be back at `currentLog` while the riconferme store still
 * held that indeterminate write. For a v1 import `parsed.confirmations` is
 * `deviceConfirmations` echoed back unchanged, so this second write persists
 * the SAME bytes already on disk — a verified no-op, not a second source of
 * truth.
 */
export function importAuctionLog(
  storage: StorageLike,
  currentLog: readonly AuctionEvent[],
  raw: string,
  fantaTeamIds: readonly string[],
  confirmedReplace: boolean,
  deviceConfirmations: readonly ConfirmationInput[] = [],
): ImportLogResult {
  const parsed = parseAuctionLogImport(raw, fantaTeamIds, deviceConfirmations);
  if (!parsed.ok) return parsed;
  if (currentLog.length > 0 && !confirmedReplace) {
    return { ok: false, reason: "confirmation-required" };
  }
  const saved = saveAuctionLog(storage, parsed.events, fantaTeamIds, undefined, parsed.confirmations);
  if (!saved.ok) return saved;

  // Snapshot the riconferme store's raw bytes BEFORE writing the imported
  // batch, so a failed confirmations write can be rolled back byte-for-byte
  // alongside the log rollback below, not just the log — see the doc
  // comment above for why rolling back only the log was insufficient.
  const previousConfirmationsRaw = safeGetItem(storage, CONFIRMATIONS_STORAGE_KEY);

  const confirmationsSaved: SaveConfirmationsResult = saveConfirmations(storage, parsed.confirmations, fantaTeamIds);
  if (!confirmationsSaved.ok) {
    const confirmationsMessage =
      confirmationsSaved.reason === "storage-write-error" || confirmationsSaved.reason === "partial-write"
        ? confirmationsSaved.message
        : confirmationsSaved.reason;
    // Roll BOTH stores back to their PRE-import state (verified) so they
    // never end up describing two different moments — never a log that
    // "moved" while a partially-written (or otherwise indeterminate)
    // riconferme batch did not follow it back.
    const logRollback = saveAuctionLog(storage, currentLog, fantaTeamIds);
    const confirmationsRollback = previousConfirmationsRaw.ok
      ? restoreItem(storage, CONFIRMATIONS_STORAGE_KEY, previousConfirmationsRaw.value)
      : { ok: false as const, message: previousConfirmationsRaw.message };
    const rollbackOk = logRollback.ok && confirmationsRollback.ok;
    // A verified rollback is an ordinary storage-write-error: the write that
    // failed never landed, and both stores are confirmed back at their
    // pre-import bytes — nothing was applied, a dismissible banner is
    // accurate. An UNVERIFIED rollback must NOT reuse that reason: storage
    // now holds either the imported log with the pre-import riconferme, the
    // pre-import log with a half-written riconferme batch, or some other
    // combination this call cannot distinguish without re-reading — exactly
    // the "reads may not describe reality" case `partial-write` exists for
    // elsewhere in this module (see saveAuctionLog above). Routing it there
    // makes the UI fail closed (blocked screen, actions disabled, "Riprova")
    // instead of a dismissible banner that would otherwise claim "la
    // modifica NON è stata applicata" — false whenever the imported log is
    // the one left on disk.
    return {
      ok: false,
      reason: rollbackOk ? "storage-write-error" : "partial-write",
      message: rollbackOk
        ? `import annullato: impossibile persistere le riconferme importate (${confirmationsMessage}). Storico e riconferme ripristinati allo stato precedente.`
        : `import in stato indeterminato: riconferme non salvate e ripristino non verificato (${confirmationsMessage}).`,
    };
  }

  return { ok: true, events: parsed.events, confirmations: parsed.confirmations };
}

/**
 * Raw quarantined text, if any — used only for the forensic export and to
 * decide whether a recovery banner has anything to show. Never parsed,
 * never normalized: exporting it must reproduce the original bytes/text
 * exactly, even when it was never valid JSON to begin with. Storage read
 * failures are reported as absent (null) rather than thrown — this is a
 * read-for-display helper, not a boot-critical path.
 */
export function readQuarantinedLog(storage: StorageLike): string | null {
  const result = safeGetItem(storage, QUARANTINE_STORAGE_KEY);
  return result.ok ? result.value : null;
}

// Pre-auction riconferme persistence (LEAGUE_RULES.md §4) — tranche 2b
// (#231). Separate module from logRecovery.ts because a riconferma is NOT
// an AuctionEvent (see packages/engine/src/confirmations.ts and reduce.ts):
// it seeds a team's INITIAL roster before the live log is replayed, so it
// lives under its own storage keys with its own envelope — pattern modeled
// on src/leagueTeams.ts (a small zod-validated, fail-closed-to-empty
// side-store), not on logRecovery.ts's larger last-known-good machinery:
// there is no live-mutation stream to protect against a lost update here,
// only a batch that changes rarely and only pre-asta.
//
// Two-layer validation, same split as logRecovery.ts's own log validation:
//  1. STRUCTURAL (confirmationEntrySchema/confirmationsEnvelopeSchema,
//     zod, this module) — shape of one entry and of the stored envelope.
//     Closes "OSSERVAZIONE 5" from tranche 2a: packages/engine's
//     ConfirmationInput was a TS interface only, with no runtime schema of
//     its own guarding what a stored/typed batch could actually contain.
//  2. SEMANTIC (validateConfirmations, packages/engine/src/confirmations.ts,
//     untouched — packages/engine is out of scope for this tranche) —
//     LEAGUE_RULES.md §4 business rules: role limits, budget, hard reserve.
// Both must pass before a batch is accepted at load OR persisted at save,
// fail-closed like every other persistence path in this app.
//
// `confirmationEntrySchema` is exported so src/logRecovery.ts (portable log
// v2, threading commit) can structurally validate the `confirmations` field
// of an imported envelope without either module creating a real runtime
// import cycle: this module's only need from logRecovery.ts is the
// `StorageLike` TYPE, imported with `import type` so it is fully erased at
// compile time and there is no reverse edge for the bundler to see.

import { z } from "zod";
import type { StorageLike } from "./logRecovery.js";
import {
  type ConfirmationInput,
  type ConfirmationIssue,
  type ConfirmationViolation,
  validateConfirmations,
} from "../packages/engine/src/confirmations.js";
import type { RenewalViolation } from "../packages/engine/src/feasibility.js";

export const CONFIRMATIONS_STORAGE_KEY = "fac_confirmations";
export const CONFIRMATIONS_QUARANTINE_STORAGE_KEY = "fac_confirmations_quarantine";
export const CONFIRMATIONS_SCHEMA_VERSION = 1;

// Structural shape only — role accepts "P" too (rejected by the SEMANTIC
// layer as `role-not-confirmable`), and price only requires a non-negative
// integer (the LEAGUE_RULES §4 floor of COST_FLOOR is a semantic concern,
// enforced by validateConfirmations as `price-invalid`). Keeping the two
// layers apart means a batch that fails a business rule is reported through
// the SAME `ConfirmationViolation` vocabulary the engine already defines,
// never through a second, parallel set of zod-flavoured error strings.
export const confirmationEntrySchema = z
  .object({
    fantaTeamId: z.string().min(1),
    playerId: z.string().min(1),
    role: z.enum(["P", "D", "C", "A"]),
    price: z.number().int().nonnegative(),
  })
  .strict();

const confirmationsEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(CONFIRMATIONS_SCHEMA_VERSION),
    confirmations: z.array(confirmationEntrySchema),
  })
  .strict();

// ── Storage I/O helpers — never throw, always report — same shape as
// logRecovery.ts's own safeGetItem/safeSetItem (kept local: two tiny
// closures are cheaper than a shared-utility module for this little code).
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

// ── Load ────────────────────────────────────────────────────────────────

export type LoadConfirmationsResult =
  | { readonly status: "none"; readonly confirmations: readonly ConfirmationInput[] }
  | { readonly status: "valid"; readonly confirmations: readonly ConfirmationInput[] }
  | { readonly status: "invalid"; readonly quarantinedRaw: string; readonly quarantineStored: boolean }
  | { readonly status: "storage-error"; readonly message: string };

function quarantineAndReportInvalid(storage: StorageLike, raw: string): LoadConfirmationsResult {
  const quarantineWrite = safeSetItem(storage, CONFIRMATIONS_QUARANTINE_STORAGE_KEY, raw);
  return { status: "invalid", quarantinedRaw: raw, quarantineStored: quarantineWrite.ok };
}

/**
 * Boots the riconferme batch from storage, fail-closed. Four distinguished
 * outcomes: `none` when the key was never written (byte-identical to
 * pre-2b: no confirmations, nothing to migrate), `valid`, `invalid` (raw
 * text quarantined verbatim, never re-derived), or `storage-error` when the
 * browser storage itself could not be read. A canonical that parses as JSON
 * but fails EITHER validation layer (structural or semantic) is quarantined
 * exactly the same way as one that is not JSON at all — the caller never
 * has to distinguish the two failure modes.
 */
export function loadConfirmations(
  storage: StorageLike,
  fantaTeamIds: readonly string[],
): LoadConfirmationsResult {
  const canonical = safeGetItem(storage, CONFIRMATIONS_STORAGE_KEY);
  if (!canonical.ok) {
    return { status: "storage-error", message: canonical.message };
  }
  if (canonical.value === null) {
    return { status: "none", confirmations: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(canonical.value);
  } catch {
    return quarantineAndReportInvalid(storage, canonical.value);
  }

  const shape = confirmationsEnvelopeSchema.safeParse(parsed);
  if (!shape.success) {
    return quarantineAndReportInvalid(storage, canonical.value);
  }

  const semantic = validateConfirmations(shape.data.confirmations, fantaTeamIds);
  if (!semantic.ok) {
    return quarantineAndReportInvalid(storage, canonical.value);
  }

  return { status: "valid", confirmations: shape.data.confirmations };
}

// ── Save (the only write path) ─────────────────────────────────────────

export type SaveConfirmationsResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "invalid-schema"; readonly issues: readonly string[] }
  | { readonly ok: false; readonly reason: "invalid-semantic"; readonly issues: readonly ConfirmationIssue[] }
  | { readonly ok: false; readonly reason: "storage-write-error"; readonly message: string }
  | { readonly ok: false; readonly reason: "partial-write"; readonly message: string };

/**
 * Validates BOTH layers before writing anything, then verifies the write by
 * reading the key straight back and comparing bytes — same fail-closed
 * posture as saveAuctionLog/saveLeagueRoster. Never mutates `confirmations`.
 */
export function saveConfirmations(
  storage: StorageLike,
  confirmations: readonly ConfirmationInput[],
  fantaTeamIds: readonly string[],
): SaveConfirmationsResult {
  const shape = z.array(confirmationEntrySchema).safeParse(confirmations);
  if (!shape.success) {
    return {
      ok: false,
      reason: "invalid-schema",
      issues: shape.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    };
  }

  const semantic = validateConfirmations(shape.data, fantaTeamIds);
  if (!semantic.ok) {
    return { ok: false, reason: "invalid-semantic", issues: semantic.issues };
  }

  const raw = JSON.stringify({
    schemaVersion: CONFIRMATIONS_SCHEMA_VERSION,
    confirmations: shape.data,
  });
  const write = safeSetItem(storage, CONFIRMATIONS_STORAGE_KEY, raw);
  if (!write.ok) {
    return { ok: false, reason: "storage-write-error", message: write.message };
  }

  const verify = safeGetItem(storage, CONFIRMATIONS_STORAGE_KEY);
  if (!verify.ok || verify.value !== raw) {
    return {
      ok: false,
      reason: "partial-write",
      message: !verify.ok ? verify.message : "verifica della persistenza fallita: il valore riletto non corrisponde",
    };
  }

  return { ok: true };
}

/**
 * Raw quarantined text, if any — same purpose as logRecovery.ts's
 * readQuarantinedLog: forensic export and "does the panel have anything to
 * show" check. Never parsed, never normalized.
 */
export function readQuarantinedConfirmations(storage: StorageLike): string | null {
  const result = safeGetItem(storage, CONFIRMATIONS_QUARANTINE_STORAGE_KEY);
  return result.ok ? result.value : null;
}

// ── Humanized errors — colocated, same idea as voidCommand.ts's
// voidErrorText: the engine's violation codes are precise but not meant for
// an operator to read directly. Exhaustive over the 7 ConfirmationViolation
// codes today; an unrecognised one (should never happen — the union is
// exhaustive) falls back to itself instead of throwing.

const CONFIRMATION_VIOLATION_MESSAGES: Record<ConfirmationViolation, string> = {
  "unknown-team": "Squadra sconosciuta.",
  "role-not-confirmable": "I portieri non sono riconfermabili: il regolamento non ammette riconferme in porta.",
  "role-limit-exceeded": "Troppe riconferme per questo ruolo: massimo una per D/C/A a squadra.",
  "price-invalid": "Il prezzo deve essere un numero intero di almeno 1 credito.",
  "duplicate-player": "Questo giocatore risulta già riconfermato da un'altra squadra o riga.",
  "team-budget-exceeded": "Il totale delle riconferme di questa squadra supera il budget iniziale.",
  "team-hard-reserve-broken":
    "Con queste riconferme la rosa non sarebbe completabile: budget insufficiente per gli altri slot obbligatori al minimo.",
};

export function confirmationErrorText(violations: readonly ConfirmationViolation[]): string {
  return violations.map((v) => CONFIRMATION_VIOLATION_MESSAGES[v] ?? v).join(" ");
}

// Le cinque violazioni che il log aggiunge alle sette di t=0. Vivono qui e non
// accanto alle altre perche' rispondono a una domanda diversa: non «questo
// batch di riconferme sta in piedi da solo» ma «sta in piedi SOTTO gli
// acquisti gia' registrati». Ognuna nomina la causa nel log, perche' un
// rifiuto che non dice che cosa lo ha causato costringe a indovinare proprio
// nel momento in cui non c'e' tempo.
const RENEWAL_ONLY_VIOLATION_MESSAGES: Record<
  Exclude<RenewalViolation, ConfirmationViolation>,
  string
> = {
  "player-in-auction-log":
    "Questo giocatore compare già nello storico dell'asta. Una riconferma vale da t=0, cioè da prima che l'asta cominci: non può riguardare un giocatore che l'asta ha già mosso. Se deve stare in questa rosa, mettilo con l'inserimento manuale.",
  "budget-exhausted-by-log":
    "Il budget di questa squadra non regge la riconferma: gli acquisti già registrati ne hanno speso troppo.",
  "role-slots-exhausted-by-log":
    "Non c'è più una casella libera di questo ruolo: gli acquisti già registrati le hanno occupate tutte.",
  "roster-not-completable":
    "Con questa riconferma la rosa non sarebbe più completabile: il budget residuo non basterebbe a riempire gli altri slot obbligatori al minimo.",
  "replay-refused":
    "Lo stato che ne risulterebbe non è rappresentabile e la riconferma è stata rifiutata. Non è stato scritto niente.",
};

export function renewalViolationText(violations: readonly RenewalViolation[]): string {
  return violations
    .map(
      (v) =>
        RENEWAL_ONLY_VIOLATION_MESSAGES[v as Exclude<RenewalViolation, ConfirmationViolation>] ??
        CONFIRMATION_VIOLATION_MESSAGES[v as ConfirmationViolation] ??
        v,
    )
    .join(" ");
}

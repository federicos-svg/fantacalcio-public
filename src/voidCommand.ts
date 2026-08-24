import type { AuctionEvent } from "../packages/engine/src/types.js";
import type { ConfirmationInput } from "../packages/engine/src/confirmations.js";
import { recordVoid, voidFeasibility, type VoidViolation } from "../packages/engine/src/feasibility.js";
import { saveAuctionLog, type SaveLogResult, type StorageLike } from "./logRecovery.js";

export type VoidCommandResult =
  | { readonly ok: true; readonly events: readonly AuctionEvent[] }
  | { readonly ok: false; readonly reason: "not-feasible"; readonly violations: readonly VoidViolation[] }
  | { readonly ok: false; readonly reason: "application-error"; readonly message: string }
  | Extract<SaveLogResult, { readonly ok: false }>;

/**
 * Human-readable, actionable Italian text for each `VoidViolation` returned
 * by `voidFeasibility()` (packages/engine/src/feasibility.ts, untouched).
 * Same codice→italiano mapping idea as `feasibilityErrorText()` in
 * src/main.ts for `FeasibilityViolation` (purchase side), but colocated in
 * this module rather than main.ts: main.ts bootstraps the DOM and calls
 * render() as a side effect of being imported, so it cannot be imported by
 * a plain vitest unit test (see src/ui/theme.test.ts for the same reason
 * the rest of src/ui/* stays out of that file). Living here makes the
 * mapping itself unit-testable (src/voidCommand.test.ts) while main.ts only
 * wires the result into the DOM.
 *
 * Each message states what happened AND what to do next — issue #265 item
 * #4 asks for more than a restatement of the raw code. No changed
 * semantics: the codes and when they fire are entirely voidFeasibility()'s.
 */
const VOID_VIOLATION_MESSAGES: Record<VoidViolation, string> = {
  "target-not-found":
    "Acquisto non trovato nello storico: l'elenco potrebbe essere cambiato nel frattempo. Riprova dallo storico acquisti aggiornato.",
  "target-not-purchase":
    "Questa voce non è un acquisto e non può essere annullata da qui. Individua l'acquisto corretto nello storico.",
  "already-voided":
    "Questo acquisto risulta già annullato: non serve ripetere l'operazione. Controlla lo storico aggiornato.",
};

/** Joins one or more `VoidViolation`s into a single actionable Italian
 *  sentence. An unrecognised code (should never happen — the union is
 *  exhaustive) falls back to itself rather than throwing, same defensive
 *  posture as feasibilityErrorText() on the purchase side. */
export function voidErrorText(violations: readonly VoidViolation[]): string {
  return violations.map((v) => VOID_VIOLATION_MESSAGES[v] ?? v).join(" ");
}

/**
 * `confirmations` (tranche 2b, optional, default none — byte-identical to
 * pre-2b when omitted) is pass-through only: it never changes whether THIS
 * void is feasible (a riconferma is never a VOID target — voidFeasibility
 * reads only the raw log), it is threaded to saveAuctionLog() so the write
 * validates/re-baselines against the same riconferme batch the caller
 * derived its state from.
 */
export function executeVoidCommand(
  storage: StorageLike,
  log: readonly AuctionEvent[],
  targetSeq: number,
  timestamp: string,
  fantaTeamIds: readonly string[],
  confirmations: readonly ConfirmationInput[] = [],
): VoidCommandResult {
  // Same shape as main.ts's commitPurchase(): check feasibility explicitly
  // first so a structural refusal comes back as data (violations) the caller
  // can humanize, not as a thrown Error whose .message lands raw on screen.
  const feasibility = voidFeasibility(log, targetSeq);
  if (!feasibility.ok) {
    return { ok: false, reason: "not-feasible", violations: feasibility.violations };
  }

  let nextLog: readonly AuctionEvent[];
  try {
    // recordVoid() re-checks the same feasibility internally and throws on
    // failure — unreachable here given the pre-check above (log/targetSeq
    // are unchanged in between), kept only as defense-in-depth for a
    // genuinely unexpected engine error.
    nextLog = recordVoid(log, targetSeq, timestamp);
  } catch (err) {
    return {
      ok: false,
      reason: "application-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  // `log` is the baseline this void was computed FROM: passing it makes the
  // write optimistic-concurrency safe, so a second tab that already changed
  // the stored log is not silently overwritten (audit fix 1).
  const saved = saveAuctionLog(storage, nextLog, fantaTeamIds, log, confirmations);
  if (!saved.ok) return saved;
  return { ok: true, events: nextLog };
}

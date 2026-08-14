// Manual Enrichment v1 — field-level validation.
//
// Converts one projected row (column name -> raw Cell) into a validated
// EnrichmentRecord, or a list of Issues. Never invents a value for a cell it
// cannot classify (same posture as packages/engine/src/parser.ts) and never
// interpolates a raw field value into an Issue (see types.ts's IssueCode
// header) — so no per-row result can ever leak real content, by construction.
//
// Two distinct string-extraction rules, never mixed:
//   - `cellToExactString` — for fields the contract declares canonical/exact
//     (ruolo, titolarita_prevista, injury_flag, source, source_method,
//     confidence, updated_at, data_nascita): the cell must already be a
//     string, returned completely as-is (no trim). External whitespace is
//     therefore never silently corrected — `" P"` does not match `"P"`,
//     it fails the same way a wrong value would, via the field's existing
//     issue code. A numeric cell is rejected outright (never coerced).
//   - `cellToFreeText` — for genuine free-text fields (nome,
//     squadra_attuale, ballottaggio) where incidental leading/trailing
//     whitespace is not itself meaningful content: string-only (still no
//     numeric coercion), trimmed.
// Booleans (trasferito_si_no/rigorista/piazzati) are a separate, deliberately
// more lenient category: case-insensitive by contract decision, so they
// keep their own trim+lowercase inside `parseCanonicalBoolean` — only the
// *cell type* (must be a string, never a number) is enforced the same way.

import type {
  Cell,
  Confidence,
  EnrichmentRecord,
  EnrichmentRole,
  InjuryFlag,
  Issue,
  ManualEnrichmentOptions,
  TitolaritaPrevista,
} from "./types.js";

/**
 * Purely structural, length-based heuristic against an accidental paste of
 * editorial content into a free-text field (e.g. a whole "scheda" instead of
 * a short player name). NOT semantic analysis, NOT an LLM check — a real
 * player/club/source label is always far shorter than this; anything longer
 * is flagged as a warning only, never blocked outright, since a strict
 * length count can never truly distinguish content from length.
 */
export const FREE_TEXT_WARNING_LENGTH = 80;

const ROLE_VALUES: ReadonlySet<string> = new Set(["P", "D", "C", "A"]);
const TITOLARITA_VALUES: ReadonlySet<string> = new Set(["titolare", "ballottaggio", "riserva", "ignoto"]);
const INJURY_VALUES: ReadonlySet<string> = new Set(["nessuno", "dubbio", "indisponibile", "ignoto"]);
const CONFIDENCE_VALUES: ReadonlySet<string> = new Set(["alta", "media", "bassa"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isBlank(cell: Cell): boolean {
  return cell === null || (typeof cell === "string" && cell.trim() === "");
}

/** String-only, exact (no trim, no numeric coercion) — see module header. */
function cellToExactString(cell: Cell): string | null {
  return typeof cell === "string" ? cell : null;
}

/** String-only, trimmed (no numeric coercion) — see module header. */
function cellToFreeText(cell: Cell): string | null {
  return typeof cell === "string" ? cell.trim() : null;
}

/** ISO `YYYY-MM-DD` AND a real calendar date (rejects e.g. 2026-02-30, or anything with stray surrounding whitespace — the regex anchors the whole string). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  return date.getUTCFullYear() === y && date.getUTCMonth() === (m as number) - 1 && date.getUTCDate() === d;
}

/** Case-insensitive `"true"`/`"false"` — Excel autocapitalization is not treated as an error (deliberately more lenient than the canonical/exact fields). */
function parseCanonicalBoolean(value: string): boolean | undefined {
  const lower = value.trim().toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  return undefined;
}

/**
 * Canonicalizes a `listone_id` cell (numeric string or number) to a plain
 * digit string, or null if not a non-negative safe integer.
 *
 * Requires `Number.isSafeInteger` (not just `Number.isInteger`) on both the
 * number-cell and the parsed-string path: a digit string beyond
 * `Number.MAX_SAFE_INTEGER` still passes `/^\d+$/` but `Number(...)` on it
 * silently rounds to the nearest representable double (e.g.
 * `"9007199254740993"` -> `9007199254740992`), which would let two distinct
 * typed IDs canonicalize to the same string. Rejecting anything outside the
 * safe-integer range is the deterministic, no-`BigInt` way to make that
 * impossible rather than merely unlikely.
 */
export function canonicalizeListoneId(cell: Cell): string | null {
  if (typeof cell === "number") {
    if (!Number.isSafeInteger(cell) || cell < 0) return null;
    return String(cell);
  }
  if (typeof cell === "string") {
    const trimmed = cell.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed)) return null;
    return String(parsed);
  }
  return null;
}

function checkFreeTextLength(field: string, value: string): Issue | null {
  if (value.length <= FREE_TEXT_WARNING_LENGTH) return null;
  return { code: "free_text_too_long", field, blocking: false };
}

/**
 * Parses an optional positive-integer field (`eta`/`gerarchia_portiere`)
 * from either a number or a digit-string cell, requiring
 * `Number.isSafeInteger` on the resulting value either way — a number cell
 * that is itself unsafe (e.g. already `Number.MAX_SAFE_INTEGER + 2`, or
 * `Infinity`) and a digit string beyond the safe-integer range are both
 * rejected, never silently stored as an imprecise or non-finite value.
 * `minValue` lets `gerarchia_portiere` require a strictly positive integer
 * while `eta` only requires non-negative.
 */
function parseOptionalSafeInteger(cell: Cell, minValue: number): number | undefined {
  if (typeof cell === "number") {
    return Number.isSafeInteger(cell) && cell >= minValue ? cell : undefined;
  }
  if (typeof cell === "string") {
    const trimmed = cell.trim();
    if (!/^\d+$/.test(trimmed)) return undefined;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed >= minValue ? parsed : undefined;
  }
  return undefined;
}

export interface FieldValidationResult {
  /** `null` only when a mandatory field is missing/malformed enough that the record cannot be built at all. */
  readonly record: EnrichmentRecord | null;
  readonly issues: readonly Issue[];
}

/**
 * Validates one projected row (see sheetReader.projectRow) into a typed
 * EnrichmentRecord + a list of Issues. Mandatory-field failures are
 * `blocking:true` (drive an `invalid` row status downstream); optional-field
 * anomalies are `blocking:false` (drive a `warning` at most).
 *
 * `options.allowedSources` gates `source`: a value outside that set is
 * `blocking:true` (`unregistered_source`), regardless of how plausible it
 * looks — this package never hardcodes a source allowlist and never
 * corrects case/whitespace/typos to make a near-miss match.
 */
export function validateEnrichmentRow(
  projected: ReadonlyMap<string, Cell>,
  options: ManualEnrichmentOptions,
): FieldValidationResult {
  const issues: Issue[] = [];

  // --- Mandatory fields ---
  const listoneId = canonicalizeListoneId(projected.get("listone_id") ?? null);
  if (listoneId === null) issues.push({ code: "invalid_listone_id", field: "listone_id", blocking: true });

  const nomeCell = projected.get("nome") ?? null;
  let nomeRaw: string | null = null;
  if (isBlank(nomeCell)) {
    issues.push({ code: "missing_field", field: "nome", blocking: true });
  } else {
    nomeRaw = cellToFreeText(nomeCell);
    if (nomeRaw === null) {
      issues.push({ code: "invalid_cell_type", field: "nome", blocking: true });
    } else {
      const lengthIssue = checkFreeTextLength("nome", nomeRaw);
      if (lengthIssue) issues.push(lengthIssue);
    }
  }

  const ruoloRaw = cellToExactString(projected.get("ruolo") ?? null);
  const ruoloValid = ruoloRaw !== null && ROLE_VALUES.has(ruoloRaw);
  if (!ruoloValid) issues.push({ code: "invalid_role", field: "ruolo", blocking: true });

  const squadraCell = projected.get("squadra_attuale") ?? null;
  let squadraRaw: string | null = null;
  if (isBlank(squadraCell)) {
    issues.push({ code: "missing_field", field: "squadra_attuale", blocking: true });
  } else {
    squadraRaw = cellToFreeText(squadraCell);
    if (squadraRaw === null) {
      issues.push({ code: "invalid_cell_type", field: "squadra_attuale", blocking: true });
    } else {
      const lengthIssue = checkFreeTextLength("squadra_attuale", squadraRaw);
      if (lengthIssue) issues.push(lengthIssue);
    }
  }

  const titolaritaRaw = cellToExactString(projected.get("titolarita_prevista") ?? null);
  const titolaritaValid = titolaritaRaw !== null && TITOLARITA_VALUES.has(titolaritaRaw);
  if (!titolaritaValid) issues.push({ code: "invalid_titolarita_prevista", field: "titolarita_prevista", blocking: true });

  const injuryRaw = cellToExactString(projected.get("injury_flag") ?? null);
  const injuryValid = injuryRaw !== null && INJURY_VALUES.has(injuryRaw);
  if (!injuryValid) issues.push({ code: "invalid_injury_flag", field: "injury_flag", blocking: true });

  const sourceCell = projected.get("source") ?? null;
  let sourceRaw: string | null = null;
  let sourceValid = false;
  if (isBlank(sourceCell)) {
    issues.push({ code: "missing_field", field: "source", blocking: true });
  } else {
    sourceRaw = cellToExactString(sourceCell);
    if (sourceRaw === null) {
      issues.push({ code: "invalid_cell_type", field: "source", blocking: true });
    } else {
      const lengthIssue = checkFreeTextLength("source", sourceRaw);
      if (lengthIssue) issues.push(lengthIssue);
      // Exact, case-sensitive membership check on the untrimmed value — a
      // source with stray leading/trailing whitespace does not match an
      // allowlist entry and is rejected the same way a wrong value would be,
      // never silently corrected. No fuzzy/typo correction either.
      if (options.allowedSources.has(sourceRaw)) {
        sourceValid = true;
      } else {
        issues.push({ code: "unregistered_source", field: "source", blocking: true });
      }
    }
  }

  const sourceMethodRaw = cellToExactString(projected.get("source_method") ?? null);
  const sourceMethodValid = sourceMethodRaw === "manual_file";
  if (!sourceMethodValid) issues.push({ code: "invalid_source_method", field: "source_method", blocking: true });

  const confidenceRaw = cellToExactString(projected.get("confidence") ?? null);
  const confidenceValid = confidenceRaw !== null && CONFIDENCE_VALUES.has(confidenceRaw);
  if (!confidenceValid) issues.push({ code: "invalid_confidence", field: "confidence", blocking: true });

  const updatedAtRaw = cellToExactString(projected.get("updated_at") ?? null);
  const updatedAtValid = updatedAtRaw !== null && isValidIsoDate(updatedAtRaw);
  if (!updatedAtValid) issues.push({ code: "invalid_updated_at", field: "updated_at", blocking: true });

  // --- Optional fields ---
  let dataNascita: string | undefined;
  const dataNascitaCell = projected.get("data_nascita") ?? null;
  if (!isBlank(dataNascitaCell)) {
    const raw = cellToExactString(dataNascitaCell);
    if (raw !== null && isValidIsoDate(raw)) dataNascita = raw;
    else issues.push({ code: "invalid_updated_at", field: "data_nascita", blocking: false });
  }

  const etaCell = projected.get("eta") ?? null;
  const eta = parseOptionalSafeInteger(etaCell, 0);
  if (!isBlank(etaCell) && eta === undefined) {
    issues.push({ code: "invalid_integer", field: "eta", blocking: false });
  }

  if (dataNascita !== undefined && eta !== undefined) {
    issues.push({ code: "both_data_nascita_and_eta_present", field: "data_nascita/eta", blocking: false });
  }

  let trasferitoSiNo: boolean | undefined;
  const trasferitoCell = projected.get("trasferito_si_no") ?? null;
  if (!isBlank(trasferitoCell)) {
    if (typeof trasferitoCell !== "string") {
      issues.push({ code: "invalid_boolean", field: "trasferito_si_no", blocking: false });
    } else {
      const parsed = parseCanonicalBoolean(trasferitoCell);
      if (parsed !== undefined) trasferitoSiNo = parsed;
      else issues.push({ code: "invalid_boolean", field: "trasferito_si_no", blocking: false });
    }
  }

  let ballottaggio: string | undefined;
  const ballottaggioCell = projected.get("ballottaggio") ?? null;
  if (!isBlank(ballottaggioCell)) {
    const raw = cellToFreeText(ballottaggioCell);
    if (raw === null) {
      issues.push({ code: "invalid_cell_type", field: "ballottaggio", blocking: false });
    } else {
      ballottaggio = raw;
      const lengthIssue = checkFreeTextLength("ballottaggio", raw);
      if (lengthIssue) issues.push(lengthIssue);
    }
  }

  const gerarchiaPortiereCell = projected.get("gerarchia_portiere") ?? null;
  const gerarchiaPortiere = parseOptionalSafeInteger(gerarchiaPortiereCell, 1);
  if (!isBlank(gerarchiaPortiereCell)) {
    if (gerarchiaPortiere === undefined) {
      issues.push({ code: "invalid_integer", field: "gerarchia_portiere", blocking: false });
    } else if (ruoloValid && ruoloRaw !== "P") {
      issues.push({ code: "gerarchia_portiere_role_mismatch", field: "gerarchia_portiere", blocking: false });
    }
  }

  let rigorista: boolean | undefined;
  const rigoristaCell = projected.get("rigorista") ?? null;
  if (!isBlank(rigoristaCell)) {
    if (typeof rigoristaCell !== "string") {
      issues.push({ code: "invalid_boolean", field: "rigorista", blocking: false });
    } else {
      const parsed = parseCanonicalBoolean(rigoristaCell);
      if (parsed !== undefined) rigorista = parsed;
      else issues.push({ code: "invalid_boolean", field: "rigorista", blocking: false });
    }
  }

  let piazzati: boolean | undefined;
  const piazzatiCell = projected.get("piazzati") ?? null;
  if (!isBlank(piazzatiCell)) {
    if (typeof piazzatiCell !== "string") {
      issues.push({ code: "invalid_boolean", field: "piazzati", blocking: false });
    } else {
      const parsed = parseCanonicalBoolean(piazzatiCell);
      if (parsed !== undefined) piazzati = parsed;
      else issues.push({ code: "invalid_boolean", field: "piazzati", blocking: false });
    }
  }

  // A record is only ever built when EVERY mandatory field of the profilo
  // minimo v1 is itself valid — never a partial record with invented
  // placeholder values ("ignoto"/""/"bassa") standing in for a field that
  // actually failed validation. A row missing/malformed on *any* mandatory
  // field (identity-critical or not) gets `record: null`, so it can never
  // silently flow into duplicate detection or the identity join in
  // pipeline.ts (both operate only on non-null records) — the row's
  // `invalid` status and its `issues` are the only information downstream
  // consumers get about it.
  const mandatoryFieldsValid =
    listoneId !== null &&
    !!nomeRaw &&
    ruoloValid &&
    !!squadraRaw &&
    titolaritaValid &&
    injuryValid &&
    sourceValid &&
    sourceMethodValid &&
    confidenceValid &&
    updatedAtValid;

  if (!mandatoryFieldsValid) {
    return { record: null, issues };
  }

  const record: EnrichmentRecord = {
    listoneId: listoneId as string,
    nome: nomeRaw as string,
    ruolo: ruoloRaw as EnrichmentRole,
    squadraAttuale: squadraRaw as string,
    titolaritaPrevista: titolaritaRaw as TitolaritaPrevista,
    injuryFlag: injuryRaw as InjuryFlag,
    source: sourceRaw as string,
    sourceMethod: "manual_file",
    confidence: confidenceRaw as Confidence,
    updatedAt: updatedAtRaw as string,
    ...(dataNascita !== undefined ? { dataNascita } : {}),
    ...(eta !== undefined ? { eta } : {}),
    ...(trasferitoSiNo !== undefined ? { trasferitoSiNo } : {}),
    ...(ballottaggio !== undefined ? { ballottaggio } : {}),
    ...(gerarchiaPortiere !== undefined ? { gerarchiaPortiere } : {}),
    ...(rigorista !== undefined ? { rigorista } : {}),
    ...(piazzati !== undefined ? { piazzati } : {}),
  };

  // Status combination (invalid vs. warning/valid) happens in pipeline.ts,
  // by scanning `issues` for `blocking:true` — not here.
  return { record, issues };
}

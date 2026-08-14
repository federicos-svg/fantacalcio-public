// Manual Enrichment v1 — shared types. PURE data shapes only, no logic here.
//
// This package never decodes XLSX bytes itself (see sheetReader.ts header for
// why) and never reads real data — every fixture in its tests is synthetic.
//
// `Cell`/`SheetRow`/`SheetGrid` below are a **local, structural** mirror of
// the shapes `packages/xlsx-adapter` decodes into (see
// `packages/engine/src/parser.ts`'s `Cell`/`SheetRow` and
// `packages/engine/src/workbook.ts`'s `SheetGrid`). They are deliberately
// redefined here rather than imported: TypeScript's structural typing means
// a real decoded workbook from `xlsx-adapter.decodeWorkbookFromBytes()` is
// still assignable to these types with zero import and zero runtime
// coupling to `packages/engine`/`packages/xlsx-adapter` — this package only
// needs to agree on *shape*, never on identity of the type declaration.

/** One decoded cell: a plain string, a plain number, or blank. Never a Date/boolean/formula/rich-text — the shared decoder (xlsx-adapter) already refuses those before this package ever sees a cell. */
export type Cell = string | number | null;

/** One decoded sheet row, left to right. */
export type SheetRow = readonly Cell[];

/** One decoded sheet: its name and its row grid, in file order. */
export interface SheetGrid {
  readonly name: string;
  readonly rows: readonly SheetRow[];
}

/** A decoded workbook: the ordered list of its sheets. */
export type Workbook = readonly SheetGrid[];

export type EnrichmentRole = "P" | "D" | "C" | "A";

export type TitolaritaPrevista = "titolare" | "ballottaggio" | "riserva" | "ignoto";

export type InjuryFlag = "nessuno" | "dubbio" | "indisponibile" | "ignoto";

export type Confidence = "alta" | "media" | "bassa";

/**
 * One fully-validated enrichment row (profilo minimo v1 fields always
 * present; the rest of the schema's fields optional). Never carries
 * `canonical_player_id`/`canonical_team_id` — this is a raw, joined input,
 * never an identity promotion.
 */
export interface EnrichmentRecord {
  readonly listoneId: string;
  readonly nome: string;
  readonly ruolo: EnrichmentRole;
  readonly squadraAttuale: string;
  readonly titolaritaPrevista: TitolaritaPrevista;
  readonly injuryFlag: InjuryFlag;
  readonly source: string;
  /** Always `"manual_file"` for this contract — verified, not assumed. */
  readonly sourceMethod: "manual_file";
  readonly confidence: Confidence;
  /** ISO `YYYY-MM-DD`, a real calendar date. */
  readonly updatedAt: string;
  readonly dataNascita?: string;
  readonly eta?: number;
  readonly trasferitoSiNo?: boolean;
  readonly ballottaggio?: string;
  readonly gerarchiaPortiere?: number;
  readonly rigorista?: boolean;
  readonly piazzati?: boolean;
}

/**
 * A listone candidate in neutral form, supplied by the caller — never read
 * from `public/data/listone_2025_26.json` or `src/ui/listone.ts` by this
 * package (see identityJoin.ts header).
 */
export interface ListoneCandidate {
  readonly listoneId: string;
  readonly name: string;
  readonly role: string;
  readonly team: string;
}

/**
 * Shared validation status vocabulary — same six values documented in
 * `docs/data/VALIDATION_IDENTITY_CONTRACT.md` ("Stati di validazione (enum
 * condiviso)"). No such runtime TS type exists yet anywhere in this repo
 * (verified: every existing package defines its own narrower local union) —
 * this is this package's own local definition, not an import of something
 * that doesn't exist.
 */
export const VALIDATION_STATUSES = [
  "valid",
  "invalid",
  "warning",
  "ambiguous",
  "requires_manual_review",
  "rejected",
] as const;

export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

/**
 * Fixed, machine-readable issue codes — never interpolates a raw field
 * value, only names which field/aspect triggered it. Keeps every row result
 * (and therefore every report built from row results) safe to log/inspect
 * without any risk of leaking real content, by construction.
 */
export type IssueCode =
  | "missing_field"
  | "invalid_listone_id"
  | "invalid_role"
  | "invalid_titolarita_prevista"
  | "invalid_injury_flag"
  | "invalid_source_method"
  | "invalid_confidence"
  | "invalid_updated_at"
  | "invalid_boolean"
  | "invalid_integer"
  | "free_text_too_long"
  | "gerarchia_portiere_role_mismatch"
  | "both_data_nascita_and_eta_present"
  | "duplicate_listone_id_in_enrichment"
  | "unregistered_source"
  | "invalid_cell_type";

export interface Issue {
  readonly code: IssueCode;
  /** Field name only — never the offending value. */
  readonly field?: string;
  /** `true` for a structural/mandatory-field failure (drives `invalid`), `false` for a non-blocking anomaly. */
  readonly blocking: boolean;
}

export interface HeaderIssue {
  readonly code: "missing_mandatory_column" | "duplicate_column_header";
  readonly field: string;
}

/**
 * Caller-supplied configuration for one validation/pipeline run.
 * `allowedSources` is never hardcoded in this package's production code —
 * it must come from the caller (e.g. the machine-readable identifiers of
 * sources actually registered `status: active` in `docs/DECISIONS.md`, or
 * covered by a separate written exception). `docs/DECISIONS.md` today has
 * no machine-readable source-id field of its own (only free-text
 * `source_name`), so this package does not invent one either — it just
 * requires the caller to supply the exact set of strings it will accept.
 * An empty set is the safe default a caller gets by simply not populating
 * it: every `source` value is then rejected, never silently accepted.
 */
export interface ManualEnrichmentOptions {
  readonly allowedSources: ReadonlySet<string>;
}

/** Outcome of joining one enrichment row against the caller-supplied listone candidates. */
export interface JoinOutcome {
  readonly matchCount: number;
  readonly identityOutcome?: string;
  readonly identityConfidenceBand?: string;
  readonly identityReasonCode?: string;
}

export interface RowResult {
  /** 1-based sheet row number (header = row 1) — a synthetic position reference, never personal data. */
  readonly rowRef: number;
  readonly status: ValidationStatus;
  readonly issues: readonly Issue[];
  /** `null` whenever any mandatory profilo minimo v1 field (identity-critical or not) is missing/malformed — never a partial record with invented placeholder values. See fieldValidation.ts's `mandatoryFieldsValid`. */
  readonly record: EnrichmentRecord | null;
  readonly join?: JoinOutcome;
}

export interface AggregateReport {
  readonly headerValid: boolean;
  readonly headerIssueCount: number;
  readonly totalRowsRead: number;
  readonly emptyRowsSkipped: number;
  readonly countsByStatus: Readonly<Record<ValidationStatus, number>>;
  /** Number of rows whose final status is `invalid` — a row count (same value as `countsByStatus.invalid`), NOT a count of individual issues; a row with several blocking issues still counts once. Header-level issues are tracked separately in `headerIssueCount`, never folded into this field. */
  readonly invalidRowCount: number;
  /** Number of rows whose final status is `warning` — a row count (same value as `countsByStatus.warning`). A row that also carries a non-blocking issue but ends with a worse final status (e.g. `invalid`/`requires_manual_review`) is NOT counted here. */
  readonly warningRowCount: number;
  readonly duplicateEnrichmentRowCount: number;
  readonly joinZeroCandidateCount: number;
  readonly joinOneCandidateCount: number;
  readonly joinMultipleCandidateCount: number;
  /** Always `false` — this batch never promotes any gate. */
  readonly gatesPromoted: false;
}

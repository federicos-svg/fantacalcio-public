// Listone-specific sheet selection + row extraction over an already-decoded
// Workbook (see xlsxWorkbookAdapter.ts for bytes -> Workbook). Separate from
// the vote-file pipeline (workbook.ts/normalizer.ts/parser.ts in
// packages/engine) on purpose: the listone (auction price sheet) has a
// different shape entirely (flat table, no team blocks, no repeated
// per-team header) and no engine module for it exists yet — see
// docs/data/LISTONE_XLSX_PARSER_CONTRACT.md for the full contract this
// module implements.

import type { Cell } from "../../engine/src/parser.js";
import type { Workbook, SheetGrid } from "../../engine/src/workbook.js";

/** Exact, ordered header contract — see docs/data/LISTONE_UI_LOAD_CONTRACT.md
 * "How the real JSON was produced" (the same mapping already used for the
 * 2025/26 listone, confirmed unchanged against the real 2026/27 raw snapshot
 * diagnosed for DATA-05B — see docs/data/DATA05B_LISTONE_PARSE_REPORT.md for
 * exactly which raw_sha256 this was verified against). */
export const LISTONE_HEADER_COLUMNS = [
  "Id",
  "R",
  "RM",
  "Nome",
  "Squadra",
  "Qt.A",
  "Qt.I",
  "Diff.",
  "Qt.A M",
  "Qt.I M",
  "Diff.M",
  "FVM",
  "FVM M",
] as const;

export const CANONICAL_ROLES = ["P", "D", "C", "A"] as const;
export type CanonicalRole = (typeof CANONICAL_ROLES)[number];

/** How many leading rows of a sheet are scanned for the header — the real
 * file's header sits at row 2 (row 1 is a merged title), but this is a
 * search, not a hardcoded index, so a moved header is detected rather than
 * silently misread. */
const HEADER_SEARCH_WINDOW = 10;

export class ListoneSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListoneSelectionError";
  }
}

export class ListoneRowError extends Error {
  constructor(
    message: string,
    readonly sheetName: string,
    readonly rowNumber: number,
  ) {
    super(message);
    this.name = "ListoneRowError";
  }
}

/** Raised when the same `Id` has different field values between the
 * selected "complete pool" sheet and the role-pure sheet that contains it —
 * the two are supposed to describe the same player, so any divergence is a
 * contract violation, not a value to silently prefer one side of. */
export class ListoneCrossSheetConsistencyError extends Error {
  constructor(
    message: string,
    readonly id: number,
    readonly field: string,
  ) {
    super(message);
    this.name = "ListoneCrossSheetConsistencyError";
  }
}

function rowMatchesHeader(row: readonly Cell[]): boolean {
  for (let i = 0; i < LISTONE_HEADER_COLUMNS.length; i++) {
    if (row[i] !== LISTONE_HEADER_COLUMNS[i]) return false;
  }
  // Any populated cell anywhere beyond column 13 — not just the cell
  // immediately after it — would otherwise be silently dropped by
  // fixed-position extraction below (e.g. an empty column 14 followed by a
  // populated column 15). Scan the FULL remainder of the row, not just its
  // first entry, so it is treated as "this row is not a header match"
  // instead, so the sheet either fails selection outright or a different,
  // genuinely matching sheet wins.
  for (let i = LISTONE_HEADER_COLUMNS.length; i < row.length; i++) {
    if (row[i] !== null && row[i] !== undefined) return false;
  }
  return true;
}

function findHeaderRowIndex(rows: readonly (readonly Cell[])[]): number | null {
  const limit = Math.min(rows.length, HEADER_SEARCH_WINDOW);
  for (let i = 0; i < limit; i++) {
    if (rowMatchesHeader(rows[i]!)) return i;
  }
  return null;
}

export interface ListoneSheetSelection {
  readonly sheet: SheetGrid;
  /** 0-based index into sheet.rows. */
  readonly headerRowIndex: number;
}

/** One structurally-valid parsed row, straight off a sheet grid — before
 * any serialization/collision-check stage. Field names mirror the source
 * header, not the output JSON shape (see listoneCandidate.ts for that). */
export interface ListoneXlsxRecord {
  readonly id: number;
  readonly role: CanonicalRole;
  readonly rm: string;
  readonly name: string;
  readonly club: string;
  readonly qtA: number;
  readonly qtI: number;
  readonly diff: number;
  readonly qtAM: number;
  readonly qtIM: number;
  readonly diffM: number;
  readonly fvm: number;
  readonly fvmM: number;
}

/** Fields compared for cross-sheet consistency — every field except `id`
 * itself (which is the join key, not something to compare against itself). */
const CROSS_SHEET_COMPARABLE_FIELDS = [
  "role",
  "rm",
  "name",
  "club",
  "qtA",
  "qtI",
  "diff",
  "qtAM",
  "qtIM",
  "diffM",
  "fvm",
  "fvmM",
] as const satisfies readonly (keyof ListoneXlsxRecord)[];

function isCanonicalRole(v: unknown): v is CanonicalRole {
  return typeof v === "string" && (CANONICAL_ROLES as readonly string[]).includes(v);
}

/** `Id`: positive integer (`> 0`) — never zero, never negative, never a
 * decimal, never a numeric string coerced. Observed on the diagnosed real
 * raw snapshot: always a positive integer (see the parser contract's
 * "Numeric constraints" section for the source-observation basis of every
 * constraint in this file — none is invented beyond what the data/domain
 * supports). */
function requirePositiveInteger(cell: Cell, sheetName: string, rowNumber: number, colLabel: string): number {
  if (typeof cell !== "number" || !Number.isFinite(cell) || !Number.isInteger(cell) || cell <= 0) {
    throw new ListoneRowError(`Column '${colLabel}' must be a positive integer, got ${JSON.stringify(cell)}`, sheetName, rowNumber);
  }
  return cell;
}

/** `Qt.A`/`Qt.I`/`Qt.A M`/`Qt.I M`/`FVM`/`FVM M`: non-negative integer
 * (`>= 0`) — a listino price or fantavalore index is never negative or
 * fractional in this source. */
function requireNonNegativeInteger(cell: Cell, sheetName: string, rowNumber: number, colLabel: string): number {
  if (typeof cell !== "number" || !Number.isFinite(cell) || !Number.isInteger(cell) || cell < 0) {
    throw new ListoneRowError(
      `Column '${colLabel}' must be a non-negative integer, got ${JSON.stringify(cell)}`,
      sheetName,
      rowNumber,
    );
  }
  return cell;
}

/** `Diff.`/`Diff.M`: signed integer — a *variation* between the current and
 * initial quotation (see the column's own tooltip in
 * docs/data/LISTONE_UI_LOAD_CONTRACT.md: "Differenza tra Qt.A e Qt.I") can
 * be negative in principle (a price drop across the season) even though the
 * diagnosed day-one snapshot only ever observed `0`. Still an integer: no
 * fractional variation exists in this source. */
function requireSignedInteger(cell: Cell, sheetName: string, rowNumber: number, colLabel: string): number {
  if (typeof cell !== "number" || !Number.isFinite(cell) || !Number.isInteger(cell)) {
    throw new ListoneRowError(`Column '${colLabel}' must be a finite integer, got ${JSON.stringify(cell)}`, sheetName, rowNumber);
  }
  return cell;
}

function requireNonEmptyString(cell: Cell, sheetName: string, rowNumber: number, colLabel: string): string {
  if (typeof cell !== "string" || cell.trim() === "") {
    throw new ListoneRowError(`Column '${colLabel}' must be a non-empty string, got ${JSON.stringify(cell)}`, sheetName, rowNumber);
  }
  return cell;
}

/**
 * Extracts every data row after the selected header as a strictly-typed
 * `ListoneXlsxRecord`. Every row must fully match the expected shape — an
 * unrecognized token, a wrong-typed cell, an out-of-domain numeric value
 * (negative/decimal where not allowed), a fully-empty structural row, a
 * populated cell anywhere beyond column 13 (the row claims more data than
 * the 13-column contract accounts for — never silently dropped), or a
 * duplicate `Id` within the sheet throws `ListoneRowError` rather than being
 * skipped or coerced. Pure: no I/O, same output for the same input grid.
 *
 * Applied to EVERY header-compatible sheet (see `findHeaderCompatibleSheets`
 * below), not only the one ultimately selected as the complete pool — a
 * malformed row on, say, a departed-players sheet is still a real contract
 * violation worth surfacing loudly rather than silently ignoring because
 * that particular sheet happened not to end up selected.
 */
export function extractListoneRecords(selection: ListoneSheetSelection): ListoneXlsxRecord[] {
  const { sheet, headerRowIndex } = selection;
  const records: ListoneXlsxRecord[] = [];
  const seenIds = new Set<number>();
  for (let r = headerRowIndex + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r]!;
    const rowNumber = r + 1; // 1-based, matches spreadsheet row numbers
    if (row.every((c) => c === null)) {
      throw new ListoneRowError(`Unclassifiable structural row: all ${row.length} cells are empty`, sheet.name, rowNumber);
    }
    for (let c = LISTONE_HEADER_COLUMNS.length; c < row.length; c++) {
      if (row[c] !== null && row[c] !== undefined) {
        throw new ListoneRowError(
          `Unexpected populated cell beyond column ${LISTONE_HEADER_COLUMNS.length} (0-based index ${c}): ${JSON.stringify(row[c])}`,
          sheet.name,
          rowNumber,
        );
      }
    }
    const id = requirePositiveInteger(row[0] ?? null, sheet.name, rowNumber, "Id");
    const roleCell = row[1] ?? null;
    if (!isCanonicalRole(roleCell)) {
      throw new ListoneRowError(
        `Column 'R' must be one of ${CANONICAL_ROLES.join("/")}, got ${JSON.stringify(roleCell)}`,
        sheet.name,
        rowNumber,
      );
    }
    const rm = requireNonEmptyString(row[2] ?? null, sheet.name, rowNumber, "RM");
    const name = requireNonEmptyString(row[3] ?? null, sheet.name, rowNumber, "Nome");
    const club = requireNonEmptyString(row[4] ?? null, sheet.name, rowNumber, "Squadra");
    const qtA = requireNonNegativeInteger(row[5] ?? null, sheet.name, rowNumber, "Qt.A");
    const qtI = requireNonNegativeInteger(row[6] ?? null, sheet.name, rowNumber, "Qt.I");
    const diff = requireSignedInteger(row[7] ?? null, sheet.name, rowNumber, "Diff.");
    const qtAM = requireNonNegativeInteger(row[8] ?? null, sheet.name, rowNumber, "Qt.A M");
    const qtIM = requireNonNegativeInteger(row[9] ?? null, sheet.name, rowNumber, "Qt.I M");
    const diffM = requireSignedInteger(row[10] ?? null, sheet.name, rowNumber, "Diff.M");
    const fvm = requireNonNegativeInteger(row[11] ?? null, sheet.name, rowNumber, "FVM");
    const fvmM = requireNonNegativeInteger(row[12] ?? null, sheet.name, rowNumber, "FVM M");
    if (seenIds.has(id)) {
      throw new ListoneRowError(`Duplicate Id ${id} within sheet`, sheet.name, rowNumber);
    }
    seenIds.add(id);
    records.push({ id, role: roleCell, rm, name, club, qtA, qtI, diff, qtAM, qtIM, diffM, fvm, fvmM });
  }
  return records;
}

interface HeaderCompatibleSheet {
  readonly sheet: SheetGrid;
  readonly headerRowIndex: number;
  readonly records: readonly ListoneXlsxRecord[];
  readonly roles: ReadonlySet<CanonicalRole>;
}

/**
 * First structural pass: every sheet in the workbook that carries the exact
 * listone header (see `rowMatchesHeader`), fully extracted and validated.
 * Never looks at a sheet's name/tab label or its title-row text — only the
 * header row and the data beneath it.
 */
function findHeaderCompatibleSheets(workbook: Workbook): HeaderCompatibleSheet[] {
  const compatible: HeaderCompatibleSheet[] = [];
  for (const sheet of workbook) {
    const headerRowIndex = findHeaderRowIndex(sheet.rows);
    if (headerRowIndex === null) continue;
    const records = extractListoneRecords({ sheet, headerRowIndex });
    const roles = new Set<CanonicalRole>(records.map((r) => r.role));
    compatible.push({ sheet, headerRowIndex, records, roles });
  }
  return compatible;
}

/** Result of `resolveListonePool` — the selected "complete pool" sheet's
 * records, already cross-verified against the four role-pure sheets. */
export interface ListonePoolResolution {
  readonly completeSheetName: string;
  /** 0-based index into the complete sheet's rows. */
  readonly headerRowIndex: number;
  readonly records: readonly ListoneXlsxRecord[];
  /** Which sheet was identified, structurally, as each canonical role's
   * mono-role sheet — recorded for provenance/manifest transparency, never
   * used as selection input itself. */
  readonly roleSheetNames: Readonly<Record<CanonicalRole, string>>;
}

/**
 * Resolves the real "complete listone pool" out of a decoded workbook,
 * verifying the full structural relationship required by
 * docs/data/LISTONE_XLSX_PARSER_CONTRACT.md ("Sheet relationship — complete
 * pool vs. the four role sheets"), not merely "contains all four roles":
 *
 *   Id(complete sheet) = Id(role-P sheet) ∪ Id(role-D sheet)
 *                        ∪ Id(role-C sheet) ∪ Id(role-A sheet)
 *
 * Steps, all purely structural (never by sheet name/tab label/title text):
 *
 * 1. Find every header-compatible sheet, fully extracted (see
 *    `findHeaderCompatibleSheets`).
 * 2. Partition them by role diversity: a sheet whose records cover exactly
 *    one canonical role is "role-pure"; a sheet covering more than one is a
 *    "complete pool" candidate. A sheet covering zero roles (header found,
 *    no data rows) is neither and is ignored.
 * 3. For each of P/D/C/A, exactly one role-pure sheet must claim it — zero
 *    or more than one both throw (missing role sheet / ambiguous role
 *    sheet).
 * 4. The four role sheets' `Id` sets must be pairwise disjoint — a shared
 *    `Id` across two role sheets throws.
 * 5. Exactly one "complete pool" candidate's `Id` set must equal the exact
 *    union of the four role sheets (same size, same members — not a
 *    superset/subset). Zero or more than one both throw. A sheet like
 *    `Ceduti` (departed players) is excluded by this check automatically —
 *    its `Id` set is disjoint from the union, not equal to it — with no
 *    name-based special-casing anywhere in this function.
 * 6. For every `Id`, every field (see `CROSS_SHEET_COMPARABLE_FIELDS`) must
 *    match exactly between the complete-pool row and the role-sheet row
 *    that carries the same `Id` — a divergence throws
 *    `ListoneCrossSheetConsistencyError`.
 */
export function resolveListonePool(workbook: Workbook): ListonePoolResolution {
  const compatible = findHeaderCompatibleSheets(workbook);
  if (compatible.length === 0) {
    const names = workbook.map((s) => s.name).join(", ") || "(none)";
    throw new ListoneSelectionError(
      `No sheet compatible with the listone contract found (sheets present: ${names}). ` +
        `A compatible sheet must contain the exact header [${LISTONE_HEADER_COLUMNS.join(", ")}] ` +
        `within the first ${HEADER_SEARCH_WINDOW} rows.`,
    );
  }

  const rolePure = compatible.filter((e) => e.roles.size === 1);
  const multiRole = compatible.filter((e) => e.roles.size > 1);

  const roleSheetEntries: Partial<Record<CanonicalRole, HeaderCompatibleSheet>> = {};
  for (const role of CANONICAL_ROLES) {
    const matches = rolePure.filter((e) => e.roles.has(role));
    if (matches.length === 0) {
      throw new ListoneSelectionError(
        `No role-pure sheet found for role '${role}' (a sheet whose 'R' column is exclusively '${role}'). ` +
          `Header-compatible sheets: ${compatible.map((e) => e.sheet.name).join(", ")}.`,
      );
    }
    if (matches.length > 1) {
      throw new ListoneSelectionError(
        `Multiple role-pure sheets found for role '${role}': ${matches.map((e) => e.sheet.name).join(", ")} — ` +
          `refusing to guess which one is authoritative.`,
      );
    }
    roleSheetEntries[role] = matches[0]!;
  }

  // Pairwise-disjoint Id check across the four chosen role sheets.
  const roleByIdAcrossRoleSheets = new Map<number, CanonicalRole>();
  for (const role of CANONICAL_ROLES) {
    for (const rec of roleSheetEntries[role]!.records) {
      const priorRole = roleByIdAcrossRoleSheets.get(rec.id);
      if (priorRole !== undefined) {
        throw new ListoneSelectionError(
          `Id ${rec.id} appears in both the role-pure sheet for '${priorRole}' ` +
            `(${roleSheetEntries[priorRole]!.sheet.name}) and for '${role}' (${roleSheetEntries[role]!.sheet.name}) — ` +
            `role sheets must be pairwise disjoint.`,
        );
      }
      roleByIdAcrossRoleSheets.set(rec.id, role);
    }
  }
  const unionSize = roleByIdAcrossRoleSheets.size;

  const completeCandidates = multiRole.filter((e) => {
    if (e.records.length !== unionSize) return false;
    return e.records.every((r) => roleByIdAcrossRoleSheets.has(r.id));
  });
  if (completeCandidates.length === 0) {
    throw new ListoneSelectionError(
      `No sheet found whose Id set exactly equals the union of the four role sheets (union size ${unionSize}). ` +
        `Candidates considered: ${multiRole.map((e) => `${e.sheet.name} (${e.records.length} records)`).join(", ") || "(none)"}.`,
    );
  }
  if (completeCandidates.length > 1) {
    throw new ListoneSelectionError(
      `Multiple sheets exactly match the union of the four role sheets (${completeCandidates.map((e) => e.sheet.name).join(", ")}) — ` +
        `ambiguous, refusing to guess which one is the real complete pool.`,
    );
  }
  const complete = completeCandidates[0]!;

  // Cross-sheet field consistency, keyed by Id.
  const roleRecordById = new Map<number, { record: ListoneXlsxRecord; sheetName: string }>();
  for (const role of CANONICAL_ROLES) {
    for (const rec of roleSheetEntries[role]!.records) {
      roleRecordById.set(rec.id, { record: rec, sheetName: roleSheetEntries[role]!.sheet.name });
    }
  }
  for (const rec of complete.records) {
    const match = roleRecordById.get(rec.id);
    if (!match) {
      // Unreachable given the exact-union check above, but kept explicit
      // rather than a non-null assertion — a future refactor that weakens
      // the union check must not silently start indexing `undefined`.
      throw new ListoneSelectionError(`Id ${rec.id} present in complete sheet '${complete.sheet.name}' has no matching role-sheet record.`);
    }
    for (const field of CROSS_SHEET_COMPARABLE_FIELDS) {
      if (rec[field] !== match.record[field]) {
        throw new ListoneCrossSheetConsistencyError(
          `Id ${rec.id}: field '${field}' differs between the complete sheet '${complete.sheet.name}' ` +
            `(${JSON.stringify(rec[field])}) and the role sheet '${match.sheetName}' (${JSON.stringify(match.record[field])}).`,
          rec.id,
          field,
        );
      }
    }
  }

  const roleSheetNames = Object.fromEntries(
    CANONICAL_ROLES.map((role) => [role, roleSheetEntries[role]!.sheet.name]),
  ) as Record<CanonicalRole, string>;

  return {
    completeSheetName: complete.sheet.name,
    headerRowIndex: complete.headerRowIndex,
    records: complete.records,
    roleSheetNames,
  };
}

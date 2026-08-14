// Synthetic Fantacalcio vote parser — PURE, in-memory, fixture-only.
//
// Scope: turn an in-memory normalized authoritative vote sheet into in-memory
// vote-record candidates. There is NO XLSX reading, file/Drive/network I/O,
// persistence or identity work here.
//
// Editorial authority is Redazione Italia. The workbook boundary guarantees
// that canonical callers feed the `Italia` sheet; the parser records that
// authority using the existing canonical machine value vote_source=`italia`.

/** A single normalized-sheet cell. Synthetic: strings/numbers/empty only. */
export type Cell = string | number | null;

/** One normalized-sheet row, left-to-right. */
export type SheetRow = readonly Cell[];

/** An in-memory synthetic normalized sheet (one season/matchday). */
export interface NormalizedSheet {
  readonly season: string;
  readonly matchday: number;
  readonly rows: readonly SheetRow[];
}

export type VoteRole = "P" | "D" | "C" | "A" | "ALL";

export type StatKey = "Gf" | "Gs" | "Rp" | "Rs" | "Rf" | "Au" | "Amm" | "Esp" | "Ass";
export type VoteStats = Partial<Record<StatKey, number>>;

/** One parsed vote-record candidate. */
export interface VoteRecordCandidate extends VoteStats {
  readonly source_id: "fantacalcio_xlsx";
  readonly vote_source: "italia";
  readonly season: string;
  readonly matchday: number;
  readonly external_id: number;
  readonly canonical_player_id: null;
  readonly team: string;
  readonly role: VoteRole;
  readonly name: string;
  readonly voto_raw: number | string;
  readonly voto_base: number | null;
  readonly is_asterisk: boolean;
  readonly is_sv: boolean;
  readonly is_blank: boolean;
  readonly is_real_performance: boolean;
}

export class ParseError extends Error {
  constructor(message: string, readonly rowIndex?: number) {
    super(message);
    this.name = "ParseError";
  }
}

const HEADER: readonly string[] = [
  "Cod.", "Ruolo", "Nome", "Voto", "Gf", "Gs", "Rp", "Rs", "Rf", "Au", "Amm", "Esp", "Ass",
];
export const FANTACALCIO_HEADER: readonly string[] = HEADER;
const ROLES: ReadonlySet<string> = new Set(["P", "D", "C", "A", "ALL"]);

/**
 * The `Voto` token Redazione Italia uses for "no valid vote". ASCII
 * hyphen-minus (U+002D) only: a typographic dash (U+2010/U+2013/U+2014), a
 * double hyphen or any other token stays unrecognized and still stops the
 * parser.
 */
export const NO_VOTE_TOKEN = "-";

const STAT_COLUMNS: ReadonlyArray<readonly [StatKey, number]> = [
  ["Gf", 4], ["Gs", 5], ["Rp", 6], ["Rs", 7], ["Rf", 8],
  ["Au", 9], ["Amm", 10], ["Esp", 11], ["Ass", 12],
];

function isEmpty(cell: Cell): boolean {
  return cell === null || (typeof cell === "string" && cell.trim() === "");
}

function nonEmptyCells(row: SheetRow): Cell[] {
  return row.filter((c) => !isEmpty(c));
}

function isHeaderRow(row: SheetRow): boolean {
  return HEADER.every((h, i) => row[i] === h);
}

function deriveVote(raw: Cell): Omit<VoteRecordCandidate,
  "source_id" | "vote_source" | "season" | "matchday" | "external_id" |
  "canonical_player_id" | "team" | "role" | "name"> {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) throw new ParseError(`Non-finite numeric vote: ${raw}`);
    return { voto_raw: raw, voto_base: raw, is_asterisk: false, is_sv: false, is_blank: false, is_real_performance: true };
  }
  if (raw === null || raw.trim() === "") {
    return { voto_raw: "", voto_base: null, is_asterisk: false, is_sv: false, is_blank: true, is_real_performance: false };
  }
  const s = raw.trim();
  const asterisk = /^(\d+(?:\.\d+)?)\*$/.exec(s);
  if (asterisk) {
    return { voto_raw: raw, voto_base: Number(asterisk[1]), is_asterisk: true, is_sv: false, is_blank: false, is_real_performance: false };
  }
  // Redazione Italia writes a plain hyphen-minus where the other sheets write
  // `SV`. Closed Owner decision (2026-08-12): in the `Italia` sheet `-` means
  // SENZA VOTO / NO VALID VOTE, exactly the `SV` semantics — never 0, never 6,
  // never a valid appearance. It is enumerated here as one literal token, so
  // no other unknown token (`–`, `--`, `n.d.`, …) inherits the decision.
  if (s.toUpperCase() === "SV" || s === NO_VOTE_TOKEN) {
    return { voto_raw: raw, voto_base: null, is_asterisk: false, is_sv: true, is_blank: false, is_real_performance: false };
  }
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    return { voto_raw: Number(s), voto_base: Number(s), is_asterisk: false, is_sv: false, is_blank: false, is_real_performance: true };
  }
  throw new ParseError(`Unrecognized vote token '${raw}' — refusing to coerce`);
}

function parseStatCell(raw: Cell, col: StatKey, rowIndex: number): number | undefined {
  if (typeof raw === "number") {
    if (!Number.isInteger(raw)) throw new ParseError(`Non-integer stat '${col}': ${raw}`, rowIndex);
    return raw;
  }
  if (raw === null || raw.trim() === "") return undefined;
  const s = raw.trim();
  if (/^-?\d+$/.test(s)) return Number(s);
  throw new ParseError(`Unrecognized stat token in '${col}': '${raw}' — refusing to coerce`, rowIndex);
}

function parseStats(row: SheetRow, rowIndex: number): VoteStats {
  const stats: VoteStats = {};
  for (const [col, idx] of STAT_COLUMNS) {
    const v = parseStatCell(row[idx] ?? null, col, rowIndex);
    if (v !== undefined) stats[col] = v;
  }
  return stats;
}

function validateSheetMeta(sheet: NormalizedSheet): void {
  if (!/^[0-9]{4}_[0-9]{2}$/.test(sheet.season)) {
    throw new ParseError(`Invalid season '${sheet.season}' (expected YYYY_YY)`);
  }
  if (!Number.isInteger(sheet.matchday) || sheet.matchday < 1 || sheet.matchday > 38) {
    throw new ParseError(`Invalid matchday '${sheet.matchday}' (expected 1..38)`);
  }
}

export function parseNormalizedVotes(sheet: NormalizedSheet): VoteRecordCandidate[] {
  validateSheetMeta(sheet);
  const out: VoteRecordCandidate[] = [];
  let team: string | null = null;

  sheet.rows.forEach((row, i) => {
    const filled = nonEmptyCells(row);
    if (filled.length === 0) return;

    const first = row[0];
    if (typeof first === "string" && first.trimStart().startsWith("Voti ")) return;
    if (isHeaderRow(row)) return;

    const role = row[1];
    if (typeof role === "string" && ROLES.has(role)) {
      if (team === null) throw new ParseError(`Player row before any team-label row`, i);
      const cod = row[0];
      if (typeof cod !== "number" || !Number.isInteger(cod)) {
        throw new ParseError(`Player row with non-integer 'Cod.': ${String(cod)}`, i);
      }
      const name = row[2];
      if (typeof name !== "string" || name.trim() === "") {
        throw new ParseError(`Player row with empty name (Cod. ${cod})`, i);
      }
      out.push({
        source_id: "fantacalcio_xlsx",
        vote_source: "italia",
        season: sheet.season,
        matchday: sheet.matchday,
        external_id: cod,
        canonical_player_id: null,
        team,
        role: role as VoteRole,
        name: name.trim(),
        ...deriveVote(row[3] ?? null),
        ...parseStats(row, i),
      });
      return;
    }

    if (filled.length === 1 && typeof first === "string" && !isEmpty(first)) {
      team = first.trim();
      return;
    }

    throw new ParseError(`Unrecognized structural row (cannot classify)`, i);
  });

  return out;
}

export function playerCandidates(records: readonly VoteRecordCandidate[]): VoteRecordCandidate[] {
  return records.filter((r) => r.role !== "ALL");
}

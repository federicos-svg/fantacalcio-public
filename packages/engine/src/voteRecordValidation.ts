// Synthetic post-parser vote-record validator — PURE, in-memory, fixture-only.
//
// Runtime defense-in-depth for the normalized Redazione Italia vote records.
// No XLSX reading, persistence, network, identity promotion or gate mutation.

export type VoteRecordIssueSeverity = "error" | "warning";
export type VoteRecordValidationStatus = "valid" | "invalid" | "warning";

export interface VoteRecordIssue {
  readonly code: string;
  readonly severity: VoteRecordIssueSeverity;
  readonly recordIndex: number;
  readonly external_id: number | null;
  readonly message: string;
}

export interface VoteRecordValidationManifest {
  readonly status: VoteRecordValidationStatus;
  readonly total: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly issues: readonly VoteRecordIssue[];
  readonly data_promoted_eligible: false;
}

const ROLES: ReadonlySet<string> = new Set(["P", "D", "C", "A", "ALL"]);
const SEASON_RE = /^[0-9]{4}_[0-9]{2}$/;
const STAT_KEYS = ["Gf", "Gs", "Rp", "Rs", "Rf", "Au", "Amm", "Esp", "Ass"] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

function voteKind(r: Record<string, unknown>): "real" | "asterisk" | "sv" | "blank" | null {
  const base = r["voto_base"];
  const baseIsNumber = typeof base === "number" && Number.isFinite(base);
  const baseIsNull = base === null;
  const ast = r["is_asterisk"] === true;
  const sv = r["is_sv"] === true;
  const blank = r["is_blank"] === true;
  const real = r["is_real_performance"] === true;

  if (real && !ast && !sv && !blank && baseIsNumber) return "real";
  if (ast && !sv && !blank && !real && baseIsNumber) return "asterisk";
  if (sv && !ast && !blank && !real && baseIsNull) return "sv";
  if (blank && !ast && !sv && !real && baseIsNull) return "blank";
  return null;
}

export function validateVoteRecords(records: readonly unknown[]): VoteRecordValidationManifest {
  const issues: VoteRecordIssue[] = [];
  const seenExternalIds = new Set<number>();

  records.forEach((rec, i) => {
    const local: VoteRecordIssue[] = [];
    const externalIdForIssue = isObject(rec) && isInt(rec["external_id"]) ? (rec["external_id"] as number) : null;
    const add = (code: string, severity: VoteRecordIssueSeverity, message: string): void => {
      local.push({ code, severity, recordIndex: i, external_id: externalIdForIssue, message });
    };

    if (!isObject(rec)) {
      add("not_an_object", "error", `Record is not an object (got ${typeof rec})`);
      issues.push(...local);
      return;
    }

    if (rec["source_id"] !== "fantacalcio_xlsx") {
      add("invalid_source_id", "error", `source_id must be 'fantacalcio_xlsx' (got ${JSON.stringify(rec["source_id"])})`);
    }
    if (rec["vote_source"] !== "italia") {
      add("invalid_vote_source", "error", `vote_source must be 'italia' (got ${JSON.stringify(rec["vote_source"])})`);
    }

    if (typeof rec["season"] !== "string" || !SEASON_RE.test(rec["season"])) {
      add("invalid_season", "error", `season must match YYYY_YY (got ${JSON.stringify(rec["season"])})`);
    }
    const md = rec["matchday"];
    if (!isInt(md) || md < 1 || md > 38) {
      add("invalid_matchday", "error", `matchday must be an integer 1..38 (got ${JSON.stringify(md)})`);
    }

    const cod = rec["external_id"];
    if (!isInt(cod)) {
      add("invalid_external_id", "error", `external_id must be an integer (got ${JSON.stringify(cod)})`);
    } else if (seenExternalIds.has(cod)) {
      add("duplicate_external_id", "warning", `external_id ${cod} is not unique within the file`);
    } else {
      seenExternalIds.add(cod);
    }

    if (rec["canonical_player_id"] !== null) {
      add("canonical_player_id_not_null", "error", `canonical_player_id must be null here (got ${JSON.stringify(rec["canonical_player_id"])})`);
    }

    if (typeof rec["team"] !== "string" || rec["team"].trim() === "") {
      add("empty_team", "error", `team must be a non-empty string (got ${JSON.stringify(rec["team"])})`);
    }
    if (typeof rec["role"] !== "string" || !ROLES.has(rec["role"])) {
      add("invalid_role", "error", `role must be one of P/D/C/A/ALL (got ${JSON.stringify(rec["role"])})`);
    }
    if (typeof rec["name"] !== "string" || rec["name"].trim() === "") {
      add("empty_name", "error", `name must be a non-empty string (got ${JSON.stringify(rec["name"])})`);
    }

    const base = rec["voto_base"];
    if (!(base === null || typeof base === "number")) {
      add("voto_base_type_invalid", "error", `voto_base must be a number or null (got ${typeof base})`);
    } else if (voteKind(rec) === null) {
      add(
        "vote_flags_incoherent",
        "error",
        `vote flags do not match exactly one kind (real/6*/SV/blank): ` +
          `voto_base=${JSON.stringify(base)} is_asterisk=${rec["is_asterisk"]} ` +
          `is_sv=${rec["is_sv"]} is_blank=${rec["is_blank"]} is_real_performance=${rec["is_real_performance"]}`,
      );
    }

    for (const key of STAT_KEYS) {
      if (!(key in rec)) continue;
      const v = rec[key];
      if (v === undefined) continue;
      if (!isInt(v)) {
        add("stat_not_integer", "error", `stat '${key}' must be an integer when present (got ${JSON.stringify(v)})`);
      } else if (v < 0) {
        add("negative_stat", "warning", `stat '${key}' is negative (${v}); allowed by schema, flagged for review`);
      }
    }

    local.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
    issues.push(...local);
  });

  const errorCount = issues.filter((x) => x.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const status: VoteRecordValidationStatus = errorCount > 0 ? "invalid" : warningCount > 0 ? "warning" : "valid";

  return {
    status,
    total: records.length,
    errorCount,
    warningCount,
    issues,
    data_promoted_eligible: false,
  };
}

export function isVoteRecordSetAcceptable(m: VoteRecordValidationManifest): boolean {
  return m.status !== "invalid";
}

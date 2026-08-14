// Serialization stage: ListoneXlsxRecord[] (source-shaped, from
// listoneWorkbook.ts) -> the flat JSON row shape already defined and
// consumed by the app (`ListonePlayer` in src/ui/listone.ts, wire format
// documented in docs/data/LISTONE_UI_LOAD_CONTRACT.md). This module does
// not add any new validation rule — shape/collision validation stays with
// the already-existing `validateListonePool` (reused, not duplicated) at
// the CLI/script layer, which is the only place in the repo allowed to
// import both this adapter package and the app UI type.

import type { CanonicalRole, ListoneXlsxRecord } from "./listoneWorkbook.js";

/** Bumped whenever the parsing/serialization logic changes in a way that
 * could change output bytes for the same input bytes. Recorded in the
 * private provenance manifest (docs/data/LISTONE_XLSX_PARSER_CONTRACT.md).
 *
 * v2 (this version): replaced `localeCompare("it")` in the canonical sort
 * with an explicit Unicode-normalized comparator (see
 * `compareNormalizedUnicode` below) and tightened several numeric field
 * constraints (Id positive integer, quotations/FVM non-negative integer,
 * Diff./Diff.M signed integer) — both can change output bytes for the same
 * input bytes relative to v1, so a v1 candidate/hash is not comparable to a
 * v2 one even for the identical raw_sha256. */
export const LISTONE_TRANSFORM_VERSION = "listone-xlsx-v2";

export type ListoneCandidateExtraValue = string | number;

/** Mirrors `ListonePlayer` (src/ui/listone.ts) minus `proxyId` — this batch
 * does not introduce a proxy/canonical identifier (see the parser contract
 * for why: the existing name+club identity already produced zero collisions
 * on the diagnosed real 2026/27 raw snapshot). */
export interface ListoneCandidateRow {
  readonly name: string;
  readonly role: CanonicalRole;
  readonly club: string;
  readonly quotation: number;
  readonly extra: Readonly<Record<string, ListoneCandidateExtraValue>>;
}

const ROLE_ORDER: Readonly<Record<CanonicalRole, number>> = { P: 0, D: 1, C: 2, A: 3 };

/**
 * Deterministic, locale-independent string comparator for the canonical
 * ordering: NFC-normalizes both strings (so visually-identical names that
 * differ only in composed vs. decomposed Unicode form, e.g. an accented
 * letter as one code point vs. a base letter + combining accent, sort
 * identically), then compares by plain UTF-16 code unit order (JS's native
 * `<`/`>` on strings) — specified by ECMA-262, not by ICU/`Intl`, and
 * therefore identical across Node versions, operating systems, and
 * `process.env.LANG`/locale settings. This deliberately replaces an earlier
 * `localeCompare("it", ...)` ordering: `localeCompare` without an explicit,
 * pinned `Intl.Collator` (`sensitivity`, `numeric`, `caseFirst` all fixed)
 * is not guaranteed stable across ICU versions bundled with different
 * Node/OS builds, which would make `candidate_sha256` — a value this
 * ordering directly determines — non-reproducible across machines.
 */
function compareNormalizedUnicode(a: string, b: string): number {
  const an = a.normalize("NFC");
  const bn = b.normalize("NFC");
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

/**
 * Canonical, documented ordering over source records — independent of
 * source row order (which is itself already deterministic for identical
 * bytes, but not guaranteed stable across a future re-export from the
 * source): role (`P`, `D`, `C`, `A`, the same domain order as
 * `ROSTER_REQUIREMENTS` in `packages/engine/src/types.ts`), then `name`,
 * then `club` (both via `compareNormalizedUnicode`), then finally `id` —
 * always present and unique across the whole pool by construction (see
 * `resolveListonePool` in listoneWorkbook.ts) — as the last tie-break. This
 * guarantees a total order: two distinct records can never compare equal,
 * because they can never share the same `id`.
 */
export function sortListoneRecordsCanonical(records: readonly ListoneXlsxRecord[]): ListoneXlsxRecord[] {
  return [...records].sort((a, b) => {
    const roleCmp = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (roleCmp !== 0) return roleCmp;
    const nameCmp = compareNormalizedUnicode(a.name, b.name);
    if (nameCmp !== 0) return nameCmp;
    const clubCmp = compareNormalizedUnicode(a.club, b.club);
    if (clubCmp !== 0) return clubCmp;
    return a.id - b.id;
  });
}

/** Source-header-keyed, verbatim — same convention as the 2025/26 JSON (see
 * LISTONE_UI_LOAD_CONTRACT.md "How the real JSON was produced"): every
 * column beyond name/role/club/quotation goes into `extra`, keyed by its
 * literal source header text. Expects `records` to already be in the
 * desired output order (see `sortListoneRecordsCanonical`) — this function
 * only maps shape, it does not sort. */
export function toListoneCandidateRows(records: readonly ListoneXlsxRecord[]): ListoneCandidateRow[] {
  return records.map((r) => ({
    name: r.name,
    role: r.role,
    club: r.club,
    quotation: r.qtA,
    extra: {
      Id: r.id,
      RM: r.rm,
      "Qt.I": r.qtI,
      "Diff.": r.diff,
      "Qt.A M": r.qtAM,
      "Qt.I M": r.qtIM,
      "Diff.M": r.diffM,
      FVM: r.fvm,
      "FVM M": r.fvmM,
    },
  }));
}

/** Flat wire object for one row — `{name, role, club, quotation, ...extra}`,
 * extra keys sorted alphabetically, fixed core-key order first. This is the
 * exact shape `validateListonePool`/`parseListonePool` (src/ui/listone.ts)
 * already accept — see docs/data/LISTONE_UI_LOAD_CONTRACT.md. */
export function toListoneWireRow(row: ListoneCandidateRow): Record<string, string | number> {
  const extraEntries = Object.entries(row.extra).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    name: row.name,
    role: row.role,
    club: row.club,
    quotation: row.quotation,
    ...Object.fromEntries(extraEntries),
  };
}

/**
 * Deterministic serialization of an already-canonically-ordered row list:
 * fixed key order per row (see `toListoneWireRow`), 2-space indent, trailing
 * newline. No timestamp, no machine path, no non-deterministic value of any
 * kind — same bytes for the same input records, run after run, process
 * after process (see the CLI's cross-process determinism check).
 */
export function serializeListoneCandidate(rows: readonly ListoneCandidateRow[]): string {
  return JSON.stringify(rows.map(toListoneWireRow), null, 2) + "\n";
}

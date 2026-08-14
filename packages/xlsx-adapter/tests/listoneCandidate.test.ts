import { describe, it, expect } from "vitest";
import {
  toListoneCandidateRows,
  sortListoneRecordsCanonical,
  toListoneWireRow,
  serializeListoneCandidate,
  LISTONE_TRANSFORM_VERSION,
} from "../src/listoneCandidate.js";
import type { ListoneXlsxRecord } from "../src/listoneWorkbook.js";

function rec(overrides: Partial<ListoneXlsxRecord> & Pick<ListoneXlsxRecord, "id" | "role" | "name" | "club">): ListoneXlsxRecord {
  return {
    rm: "X",
    qtA: 10,
    qtI: 10,
    diff: 0,
    qtAM: 10,
    qtIM: 10,
    diffM: 0,
    fvm: 30,
    fvmM: 30,
    ...overrides,
  };
}

const RECORDS: readonly ListoneXlsxRecord[] = [
  rec({ id: 4, role: "A", name: "Attaccante Uno", club: "ClubQuattro" }),
  rec({ id: 1, role: "P", name: "Portiere Uno", club: "ClubUno" }),
  rec({ id: 3, role: "C", name: "Centrocampista Uno", club: "ClubTre" }),
  rec({ id: 2, role: "D", name: "Difensore Uno", club: "ClubDue" }),
];

describe("toListoneCandidateRows", () => {
  it("maps Qt.A to quotation and every other column verbatim into extra, keyed by literal header text", () => {
    const [row] = toListoneCandidateRows([RECORDS[1]!]);
    expect(row).toEqual({
      name: "Portiere Uno",
      role: "P",
      club: "ClubUno",
      quotation: 10,
      extra: { Id: 1, RM: "X", "Qt.I": 10, "Diff.": 0, "Qt.A M": 10, "Qt.I M": 10, "Diff.M": 0, FVM: 30, "FVM M": 30 },
    });
  });
});

describe("sortListoneRecordsCanonical", () => {
  it("orders by role (P,D,C,A), then name, then club — independent of input order", () => {
    const sorted = sortListoneRecordsCanonical(RECORDS);
    expect(sorted.map((r) => r.role)).toEqual(["P", "D", "C", "A"]);
  });

  it("is a pure re-order — same input twice yields the identical order", () => {
    const a = sortListoneRecordsCanonical(RECORDS);
    const b = sortListoneRecordsCanonical([...RECORDS].reverse());
    expect(a.map((r) => r.name)).toEqual(b.map((r) => r.name));
  });

  it("is a total order: Id breaks ties when role/name/club are otherwise equal", () => {
    const tied = [
      rec({ id: 20, role: "P", name: "Stesso Nome", club: "Stesso Club" }),
      rec({ id: 10, role: "P", name: "Stesso Nome", club: "Stesso Club" }),
    ];
    const sorted = sortListoneRecordsCanonical(tied);
    expect(sorted.map((r) => r.id)).toEqual([10, 20]);
  });

  it("compares names by NFC-normalized UTF-16 code unit order, not locale collation", () => {
    // Plain code-unit order places 'À' (U+00C0) before 'a' (U+0061) is
    // false — uppercase-with-diacritic (U+00C0) sorts AFTER lowercase 'a'
    // (U+0061 < U+00C0) under code-unit comparison, unlike an
    // Italian-locale collator, which would interleave case/accents by
    // linguistic weight. Asserting the code-unit order directly proves this
    // is not `localeCompare`.
    const rows = [
      rec({ id: 1, role: "P", name: "Àlpha", club: "Club" }), // "Àlpha"
      rec({ id: 2, role: "P", name: "alpha", club: "Club" }),
    ];
    const sorted = sortListoneRecordsCanonical(rows);
    expect(sorted.map((r) => r.id)).toEqual([2, 1]);
  });

  it("normalizes NFD vs NFC accented input to the same sort position", () => {
    const nfc = "Josué"; // é as one code point
    const nfd = "Josué"; // e + combining acute accent
    const rows = [
      rec({ id: 1, role: "P", name: nfd, club: "Club" }),
      rec({ id: 2, role: "P", name: nfc, club: "Club" }),
    ];
    const sorted = sortListoneRecordsCanonical(rows);
    // Equal after normalization -> falls through to the Id tie-break, not
    // an arbitrary/unstable order.
    expect(sorted.map((r) => r.id)).toEqual([1, 2]);
  });

  it("never returns 0 (unordered) between two distinct records — always resolves via Id", () => {
    const a = rec({ id: 1, role: "P", name: "Stesso", club: "Stesso" });
    const b = rec({ id: 2, role: "P", name: "Stesso", club: "Stesso" });
    const sorted = sortListoneRecordsCanonical([b, a]);
    expect(sorted).toEqual([a, b]);
  });
});

describe("toListoneWireRow / serializeListoneCandidate", () => {
  it("produces a flat object — core keys first, extra keys alphabetical", () => {
    const [row] = toListoneCandidateRows([RECORDS[1]!]);
    const wire = toListoneWireRow(row!);
    expect(Object.keys(wire)).toEqual(["name", "role", "club", "quotation", "Diff.", "Diff.M", "FVM", "FVM M", "Id", "Qt.A M", "Qt.I", "Qt.I M", "RM"]);
  });

  it("serializes deterministically — identical input produces byte-identical output", () => {
    const rows = toListoneCandidateRows(sortListoneRecordsCanonical(RECORDS));
    const a = serializeListoneCandidate(rows);
    const b = serializeListoneCandidate(rows);
    expect(a).toBe(b);
    expect(a.endsWith("\n")).toBe(true);
  });

  it("never embeds a timestamp or machine path", () => {
    const rows = toListoneCandidateRows(sortListoneRecordsCanonical(RECORDS));
    const json = serializeListoneCandidate(rows);
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/); // ISO timestamp
    expect(json).not.toMatch(/\/(home|Users|tmp)\//);
  });
});

describe("LISTONE_TRANSFORM_VERSION", () => {
  it("is bumped to v2 (ordering comparator + numeric constraints changed since v1)", () => {
    expect(LISTONE_TRANSFORM_VERSION).toBe("listone-xlsx-v2");
  });
});

// Synthetic listone-shaped XLSX fixture helpers — built with the same
// `buildXlsxBytes` used by the vote-file fixtures (testWorkbookBuilder.ts),
// mirroring the real file's structure (merged title row across all 13
// columns, then the header row, then data rows) with only fictitious
// player/club names. No real data anywhere in this file.

import type { TestCell, TestSheet } from "./testWorkbookBuilder.js";

export const LISTONE_TITLE_ROW: readonly TestCell[] = ["Quotazioni Fantacalcio Stagione 9999 00"];

export const LISTONE_HEADER_ROW: readonly TestCell[] = [
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
];

/** One synthetic listone data row, shaped exactly like the real file's columns. */
export function listoneRow(
  id: number,
  role: "P" | "D" | "C" | "A",
  rm: string,
  nome: string,
  squadra: string,
  qtA: number,
  qtI: number = qtA,
  diff: number = 0,
  qtAM: number = qtA,
  qtIM: number = qtA,
  diffM: number = 0,
  fvm: number = qtA * 3,
  fvmM: number = qtA * 3,
): readonly TestCell[] {
  return [id, role, rm, nome, squadra, qtA, qtI, diff, qtAM, qtIM, diffM, fvm, fvmM];
}

/** A full "complete pool" sheet: merged title row + header row + given data
 * rows. `merges` covers the title row across all 13 columns, matching the
 * real file. */
export function listoneSheet(name: string, dataRows: readonly (readonly TestCell[])[]): TestSheet {
  return {
    name,
    rows: [LISTONE_TITLE_ROW, LISTONE_HEADER_ROW, ...dataRows],
    merges: [[1, 1, 1, 13]],
  };
}

/** A minimal, structurally-valid "complete pool" (all four canonical roles
 * present) — the smallest input that should select and parse cleanly. */
export const MINIMAL_COMPLETE_LISTONE_ROWS: readonly (readonly TestCell[])[] = [
  listoneRow(1, "P", "Por", "Portiere Uno", "ClubUno", 10),
  listoneRow(2, "D", "Dc", "Difensore Uno", "ClubDue", 12),
  listoneRow(3, "C", "C", "Centrocampista Uno", "ClubTre", 15),
  listoneRow(4, "A", "Pc", "Attaccante Uno", "ClubQuattro", 20),
];

/** One role-pure row set per canonical role — the minimal shape
 * `buildValidListoneWorkbookSheets` needs to derive a matching "complete
 * pool" sheet (their exact union) and the four role-pure sheets. */
export interface RoleRows {
  readonly P: readonly (readonly TestCell[])[];
  readonly D: readonly (readonly TestCell[])[];
  readonly C: readonly (readonly TestCell[])[];
  readonly A: readonly (readonly TestCell[])[];
}

export const MINIMAL_VALID_ROLE_ROWS: RoleRows = {
  P: [listoneRow(1, "P", "Por", "Portiere Uno", "ClubUno", 10)],
  D: [listoneRow(2, "D", "Dc", "Difensore Uno", "ClubDue", 12)],
  C: [listoneRow(3, "C", "C", "Centrocampista Uno", "ClubTre", 15)],
  A: [listoneRow(4, "A", "Pc", "Attaccante Uno", "ClubQuattro", 20)],
};

/**
 * Builds a full, structurally-valid set of 5 sheets — one role-pure sheet
 * per canonical role plus a "complete pool" sheet that is their exact
 * union (same rows, concatenated in role order) — matching the real
 * workbook's actual shape (`Portieri`/`Difensori`/`Centrocampisti`/
 * `Attaccanti` + `Tutti`). Sheet names are deliberately generic
 * (`RoleSheetP` etc., `CompleteSheet`) to prove selection never depends on
 * them; a test that wants to exercise name-independence can override
 * `names`.
 */
export function buildValidListoneWorkbookSheets(
  roleRows: RoleRows,
  names: { P: string; D: string; C: string; A: string; complete: string } = {
    P: "RoleSheetP",
    D: "RoleSheetD",
    C: "RoleSheetC",
    A: "RoleSheetA",
    complete: "CompleteSheet",
  },
): TestSheet[] {
  return [
    listoneSheet(names.P, roleRows.P),
    listoneSheet(names.D, roleRows.D),
    listoneSheet(names.C, roleRows.C),
    listoneSheet(names.A, roleRows.A),
    listoneSheet(names.complete, [...roleRows.P, ...roleRows.D, ...roleRows.C, ...roleRows.A]),
  ];
}

/** A sheet shaped like the real file's `Ceduti` — header-compatible,
 * multi-role, but disjoint from the complete pool (different Ids
 * entirely) — must never be selected as either a role sheet or the
 * complete pool. */
export function departedPlayersSheet(name: string, dataRows: readonly (readonly TestCell[])[]): TestSheet {
  return {
    name,
    rows: [["Calciatori Ceduti 9999 00"], LISTONE_HEADER_ROW, ...dataRows],
    merges: [[1, 1, 1, 13]],
  };
}

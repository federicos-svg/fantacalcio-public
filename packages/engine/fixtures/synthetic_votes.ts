import type { NormalizedSheet, SheetRow, RawSheet } from "../src/index.js";

// Synthetic normalized-sheet fixtures for the vote parser.
// FAKE data only: invented player/team names and codes — NO real Fantacalcio
// data, NO XLSX. This is the in-memory grid a future normalizer would yield
// (one already-selected vote sheet, documented rows 2-4 already removed).

const HEADER: SheetRow = ["Cod.", "Ruolo", "Nome", "Voto", "Gf", "Gs", "Rp", "Rs", "Rf", "Au", "Amm", "Esp", "Ass"];

/**
 * A small but representative sheet: a title row, two team blocks (to exercise
 * forward-fill), repeated headers, padding, and every documented vote case
 * (numeric, '6*' asterisk, 'SV', blank) plus an ALL (coach) row.
 */
export function syntheticVoteSheet(): NormalizedSheet {
  return {
    season: "2024_25",
    matchday: 38,
    rows: [
      ["Voti Sintetici 38ª giornata (FIXTURE)"],
      [],
      ["Synthetic Team Alpha"],
      HEADER,
      [9001, "P", "Synthetic GK Alpha", 6.5],
      [9002, "D", "Synthetic Back Alpha", "6*"], // asterisk: base 6, not real performance
      [9003, "C", "Synthetic Mid Alpha", "SV"], // senza voto
      [9004, "A", "Synthetic Fwd Alpha", ""], // blank
      [9005, "ALL", "Synthetic Coach Alpha", 6],
      [],
      ["Synthetic Team Beta"],
      HEADER, // header repeats per team block
      [9101, "D", "Synthetic Back Beta", 7],
      [9102, "C", "Synthetic Mid Beta", null], // blank (null cell)
      [9103, "A", "Synthetic Fwd Beta", "7.5*"], // asterisk with .5
    ],
  };
}

/** A sheet whose first player row appears before any team-label row (structural error). */
export function orphanPlayerSheet(): NormalizedSheet {
  return {
    season: "2024_25",
    matchday: 1,
    rows: [HEADER, [9001, "D", "Synthetic Orphan", 6]],
  };
}

/** A sheet with an unrecognized vote token (must stop, not coerce). */
export function unknownTokenSheet(): NormalizedSheet {
  return {
    season: "2024_25",
    matchday: 1,
    rows: [["Synthetic Team Gamma"], HEADER, [9201, "C", "Synthetic Mid Gamma", "ng"]],
  };
}

/**
 * The Redazione Italia "no valid vote" shape: the `Italia` sheet writes a plain
 * hyphen-minus where the other sheets write `SV`. Closed Owner decision: same
 * semantics as `SV` — `voto_base = null`, never 0, never 6, never a valid
 * appearance. Bonus/malus columns still carry their own values, so the fixture
 * gives the `-` rows non-zero stats: they must survive as stats while the vote
 * stays absent.
 */
export function italiaNoVoteTokenSheet(): NormalizedSheet {
  return {
    season: "2024_25",
    matchday: 5,
    rows: [
      ["Voti Sintetici 5ª giornata (ITALIA FIXTURE)"],
      ["Synthetic Team Lambda"],
      HEADER,
      [6001, "P", "Synthetic Keeper Lambda", "-", 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [6002, "D", "Synthetic Back Lambda", " - ", 0, 0, 0, 0, 0, 0, 1, 0, 0], // padded token
      [6003, "C", "Synthetic Mid Lambda", 6.5, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [6004, "A", "Synthetic Fwd Lambda", "SV", 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [6005, "ALL", "Synthetic Coach Lambda", "-"],
    ],
  };
}

/**
 * One sheet per token that must STAY unrecognized after the `-` decision:
 * typographic dashes, repeated hyphens and free text are NOT `-` and must keep
 * stopping the parser. The decision covers exactly one literal token.
 */
export function unknownDashLikeTokenSheets(): readonly { token: string; sheet: NormalizedSheet }[] {
  return ["‐", "–", "—", "--", "---", "-.", "- -", "n.d.", "N/A"].map((token) => ({
    token,
    sheet: {
      season: "2024_25",
      matchday: 1,
      rows: [["Synthetic Team Mu"], HEADER, [6201, "C", "Synthetic Mid Mu", token]],
    },
  }));
}

// Full 13-column rows = Cod, Ruolo, Nome, Voto, Gf, Gs, Rp, Rs, Rf, Au, Amm, Esp, Ass.

/**
 * A sheet exercising the stat columns: a forward (Gf/Ass), a keeper (Gs/Rp),
 * a row with all-zero stats, a row with blanks/partial stats (omitted fields),
 * integer-as-string cells, and an ALL (coach) row.
 */
export function statVoteSheet(): NormalizedSheet {
  return {
    season: "2024_25",
    matchday: 10,
    rows: [
      ["Synthetic Team Delta"],
      HEADER,
      [8001, "A", "Synthetic Striker", 7.5, 2, 0, 0, 0, 0, 0, 1, 0, 1], // Gf=2, Amm=1, Ass=1
      [8002, "P", "Synthetic Keeper", 6, 0, 1, 1, 0, 0, 0, 0, 0, 0], // Gs=1, Rp=1
      [8003, "D", "Synthetic Zero", 6, 0, 0, 0, 0, 0, 0, 0, 0, 0], // all zeros kept
      [8004, "C", "Synthetic Partial", 6.5, 1, "", null, "", "", "", "2", "", ""], // Gf=1, Amm=2; others blank → omitted
      [8005, "ALL", "Synthetic Coach Delta", 6, "", "", "", "", "", "", "", "", ""], // ALL, all blank → no stats
    ],
  };
}

/** A row with a non-integer stat (decimal) — must stop, not coerce. */
export function nonIntegerStatSheet(): NormalizedSheet {
  return {
    season: "2024_25",
    matchday: 10,
    rows: [["Synthetic Team Eps"], HEADER, [8101, "C", "Synthetic Mid Eps", 6, 1.5, 0, 0, 0, 0, 0, 0, 0, 0]],
  };
}

/** A row with a non-numeric stat token — must stop, not coerce. */
export function unknownStatTokenSheet(): NormalizedSheet {
  return {
    season: "2024_25",
    matchday: 10,
    rows: [["Synthetic Team Zeta"], HEADER, [8201, "A", "Synthetic Fwd Zeta", 6, "x", 0, 0, 0, 0, 0, 0, 0, 0]],
  };
}

// --- Raw-grid fixtures for the normalizer ---
// A *raw* grid mirrors the real single-sheet layout: a preamble (title +
// optional copyright/notice single-cell text lines), then team blocks (a
// single-cell team row immediately followed by the exact header, then player
// rows and an ALL row). normalizeRawSheet() strips the preamble by CONTENT
// (not by position) and keeps the body. FAKE data only, no XLSX, no real names.

/**
 * A well-formed raw grid: title + 3 blank preamble rows + one team block
 * (header, two players, an ALL row). normalizeRawSheet() must drop the preamble
 * and yield a NormalizedSheet the parser turns into 3 candidates.
 */
export function syntheticRawSheet(): RawSheet {
  return {
    season: "2024_25",
    matchday: 12,
    rows: [
      ["Voti Sintetici 12ª giornata (RAW FIXTURE)"], // row 1 (title) — kept
      [], // row 2 — padding (safe-delete)
      [null, null], // row 3 — padding
      ["", "", ""], // row 4 — padding
      ["Synthetic Team Theta"],
      HEADER,
      [7001, "P", "Synthetic Keeper Theta", 6.5, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [7002, "A", "Synthetic Striker Theta", 7, 1, 0, 0, 0, 0, 0, 1, 0, 0],
      [7003, "ALL", "Synthetic Coach Theta", 6, "", "", "", "", "", "", "", "", ""],
    ],
  };
}

/** Raw grid where a safe-delete row (index 2) carries a player → format changed, must stop. */
export function rawStructuralPaddingSheet(): RawSheet {
  return {
    season: "2024_25",
    matchday: 12,
    rows: [
      ["Voti Sintetici 12ª giornata (RAW FIXTURE)"],
      [], // index 1 padding
      [7001, "P", "Synthetic Keeper", 6, 0, 0, 0, 0, 0, 0, 0, 0, 0], // index 2 is structural!
      [],
      ["Synthetic Team Theta"],
      HEADER,
    ],
  };
}

/** Raw grid with no contract header at all → must stop. */
export function rawMissingHeaderSheet(): RawSheet {
  return {
    season: "2024_25",
    matchday: 12,
    rows: [
      ["Voti Sintetici 12ª giornata (RAW FIXTURE)"],
      [], [], [],
      ["Synthetic Team Theta"],
      [7001, "P", "Synthetic Keeper Theta", 6], // player, but no header row before it
    ],
  };
}

/** Raw grid with a near-header (starts with "Cod." but not the exact header) → ambiguous, must stop. */
export function rawAmbiguousHeaderSheet(): RawSheet {
  return {
    season: "2024_25",
    matchday: 12,
    rows: [
      ["Voti Sintetici 12ª giornata (RAW FIXTURE)"],
      [], [], [],
      ["Synthetic Team Theta"],
      ["Cod.", "Ruolo", "Nome", "Voto"], // truncated header
      [7001, "P", "Synthetic Keeper Theta", 6],
    ],
  };
}

/**
 * Raw grid that normalizes cleanly (padding + header OK) but carries an
 * unrecognized vote token → the parser stage stops (ParseError), not the
 * normalizer. Used to exercise the end-to-end manifest's parse-stage failure.
 */
export function rawParserErrorSheet(): RawSheet {
  return {
    season: "2024_25",
    matchday: 12,
    rows: [
      ["Voti Sintetici 12ª giornata (RAW FIXTURE)"],
      [], [null, null], ["", "", ""],
      ["Synthetic Team Iota"],
      HEADER,
      [7101, "C", "Synthetic Mid Iota", "ng"], // unknown vote token → ParseError
    ],
  };
}

/**
 * Raw grid that normalizes and parses cleanly but yields two records with the
 * same per-file Cod. → the validator stage reports a non-blocking
 * `duplicate_external_id` warning (overall manifest status `warning`).
 */
export function rawValidatorWarningSheet(): RawSheet {
  return {
    season: "2024_25",
    matchday: 12,
    rows: [
      ["Voti Sintetici 12ª giornata (RAW FIXTURE)"],
      [], [null, null], ["", "", ""],
      ["Synthetic Team Kappa"],
      HEADER,
      [7201, "D", "Synthetic Back Kappa", 6],
      [7201, "A", "Synthetic Fwd Kappa", 7], // duplicate Cod. → validator warning
    ],
  };
}

// --- Real-layout raw fixtures (content-based preamble; FAKE data only) ---
// These reproduce the SHAPE of the real Fantacalcio XLSX: a title row plus
// copyright/notice single-cell text lines (NOT empty padding), then multiple
// team blocks with the header REPEATED per block. All names/codes are invented.

const NOTICE_1 = "Solo su synthetic.example i voti (FIXTURE, not real)";
const NOTICE_2 = "QUESTO FILE E' UNA FIXTURE SINTETICA — NESSUN DATO REALE";
const NOTICE_3 = "AD USO ESCLUSIVO DEI TEST (synthetic notice line)";

/**
 * Real-shaped raw grid: title + 3 copyright/notice single-cell text lines
 * (mirroring the real preamble that is NOT blank padding), then TWO team blocks
 * each with its own repeated header. Exercises: preamble stripping by content,
 * team rows recognized only because they are header-anchored, repeated headers,
 * forward-fill across blocks, and every vote case (numeric, 6* asterisk, SV,
 * blank) plus ALL. normalize → parse must yield 7 candidates (5 players + 2 ALL).
 */
export function syntheticRealLayoutRawSheet(): RawSheet {
  return {
    season: "2024_25",
    matchday: 38,
    rows: [
      ["Voti Sintetici 38ª giornata (REAL-LAYOUT FIXTURE)"], // title (single-cell text)
      [NOTICE_1], // notice line (single-cell text, NOT blank) — dropped as preamble
      [NOTICE_2],
      [NOTICE_3],
      ["Synthetic Team Uno"], // team row: followed immediately by the header
      HEADER,
      [3001, "P", "Synthetic Keeper Uno", 6, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [3002, "D", "Synthetic Back Uno", "6*", 0, 0, 0, 0, 0, 0, 0, 0, 0], // asterisk → base 6, not real perf
      [3003, "C", "Synthetic Mid Uno", "SV", 0, 0, 0, 0, 0, 0, 0, 0, 0], // senza voto
      [3004, "ALL", "Synthetic Coach Uno", 6],
      ["Synthetic Team Due"], // second block — header repeats
      HEADER,
      [3101, "A", "Synthetic Fwd Due", 7.5, 2, 0, 0, 0, 0, 0, 0, 0, 1],
      [3102, "D", "Synthetic Back Due", "", 0, 0, 0, 0, 0, 0, 0, 0, 0], // blank vote
      [3103, "ALL", "Synthetic Coach Due", 5.5],
    ],
  };
}

/**
 * A raw grid where a single-cell text line sits in the BODY but is NOT followed
 * by the header (a stray notice after a block). It must NOT be treated as a
 * team → normalizeRawSheet stops with NormalizeError (content rule, not shape).
 */
export function rawStraySingleCellInBodySheet(): RawSheet {
  return {
    season: "2024_25",
    matchday: 38,
    rows: [
      ["Voti Sintetici (REAL-LAYOUT FIXTURE)"],
      ["Synthetic Team Uno"],
      HEADER,
      [3001, "P", "Synthetic Keeper Uno", 6],
      ["Stray notice line not followed by a header"], // ambiguous single-cell in body
      [3002, "D", "Synthetic Back Uno", 6],
    ],
  };
}

// --- Workbook fixtures (decoded multi-sheet grids) for the workbook bridge ---
// Mirror the real 3-sheet workbook (Fantacalcio / Statistico / Italia). FAKE.

export function syntheticWorkbook(): { name: string; rows: SheetRow[] }[] {
  const block = (teamSuffix: string, code: number): SheetRow[] => [
    [`Synthetic Team ${teamSuffix}`],
    HEADER,
    [code, "P", `Synthetic Keeper ${teamSuffix}`, 6, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    [code + 1, "ALL", `Synthetic Coach ${teamSuffix}`, 6],
  ];
  const sheet = (): SheetRow[] => [
    ["Voti Sintetici (WORKBOOK FIXTURE)"],
    [NOTICE_1],
    ...block("Uno", 3001),
  ];
  return [
    { name: "Fantacalcio", rows: sheet() },
    { name: "Statistico", rows: sheet() },
    { name: "Italia", rows: sheet() },
  ];
}

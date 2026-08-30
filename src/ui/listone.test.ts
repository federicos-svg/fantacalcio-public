import { describe, it, expect } from "vitest";
import {
  parseListonePool,
  validateListonePool,
  parseListoneJsonText,
  listoneColumns,
  listoneRowHtml,
  listoneTableHeadHtml,
  listoneColumnHeaderLabel,
  listoneColumnTooltip,
  listoneCellValue,
  listonePlayerKey,
  legacyPlayerIdDisplayName,
  resolvePlayerDisplayName,
  listonePoolIndex,
  orphanPlayerIds,
  filterListonePool,
  sortListonePool,
  resolveListonePool,
  paginateListonePool,
  LISTONE_PAGE_SIZE,
  DEFAULT_VISIBLE_COLUMN_KEYS,
  LISTONE_FALLBACK_NOTE,
  LISTONE_GATED_EXTRA_KEYS,
  LISTONE_IDENTITY_COLUMN_KEYS,
  listoneSourceNote,
  formatListoneUpdatedAt,
  isGatedListoneExtraKey,
  listoneAppealIndexNote,
  defaultVisibleColumnKeys,
  poolHasAppealIndex,
  listoneCellText,
  listoneColumnLabelForRole,
  listoneExpertSignalsNote,
  APPEAL_INDEX_COLUMN_KEY,
  GEN_FORECAST_AUTHORITY_ADVISORY,
  GEN_FORECAST_CAP_LABEL,
  GEN_FORECAST_CAP_MARKER,
  GEN_FORECAST_COLUMN_KEYS,
  GEN_FORECAST_COLUMN_KEY_BY_TARGET,
  GEN_FORECAST_COLUMN_LABELS,
  GEN_FORECAST_TARGET_IDS,
  genForecastCapApplied,
  listoneGenForecastNote,
  poolHasGenForecast,
  EXPERT_VOTE_COLUMN_KEYS,
  NO_MALUS_BONUS_COLUMN_KEY,
  PUNIZIONI_COLUMN_KEY,
  ANGOLI_COLUMN_KEY,
  RIGORISTA_COLUMN_KEY,
  SIGNAL_COLUMN_KEYS,
  VALUE_NOT_AVAILABLE,
  type ListoneColumn,
  type ListonePlayer,
  type ListoneRowSignalsLookup,
  emptyRowSignals,
} from "./listone.js";
import { resolvePagella, type PagellaScheda } from "../pagellaEsperti.js";

/** Cinque voti su cinque: la sola forma per cui la nota smette di dichiarare
 *  l'assenza. */
const FULL_PAGELLA: PagellaScheda = {
  voti: {
    pagella_titolarita: 9,
    pagella_media_voto: 7,
    pagella_salute: 9,
    pagella_bonus: 6,
    pagella_consiglio: 8,
  },
};
import {
  visibleColumnKeys,
  type ListoneColumnPrefs,
} from "../listoneColumnPrefs.js";

// Synthetic fixtures only — no real player/club names, per project no-go
// (no proprietary data anywhere in the repo, including tests).
const VALID_PLAYER = { name: "Test Playerone", role: "A", club: "Club Alfa", quotation: 12 } as const;

// Issue #225 — every row of the reported table, plus the Unicode variants the
// old edge-strip (`[\s.-]` only) could not see. Written with explicit escapes
// so the invisible ones stay visible to whoever reads the test.
const GATED_LOOKALIKE_KEYS: readonly string[] = [
  "FTM_",
  "ftm_",
  "_ftm",
  "__ftm__",
  "Target _Band",
  "Target__Band",
  "FTM:",
  "ftm/",
  "FTM!",
  "(FTM)",
  "ftm\u200b", // trailing zero-width space
  "f\u200btm", // zero-width space inside the word
  "f\u00adtm", // soft hyphen
  "ftm\u2060", // word joiner
  "\ufeffftm", // byte order mark
  "\uff26\uff34\uff2d", // fullwidth F T M
  "\u{1d41f}\u{1d42d}\u{1d426}", // mathematical bold f t m
  "ft\u0301m", // combining acute inside the word
  "f\u0442m", // cyrillic TE (U+0442), renders as an ASCII t
  "f\u0430ir_to_me", // cyrillic A (U+0430) inside fair_to_me
];

// The counterweight: the ordinary listone columns must keep loading. Accented
// Italian included — folding accents is part of the fix, refusing them is not.
const INNOCENT_EXTRA_KEYS: readonly string[] = [
  "Id",
  "R",
  "RM",
  "Qt.A",
  "Qt.I",
  "Diff.",
  "Qt.A M",
  "FVM",
  "FVM M",
  "Età",
  "fvm_m",
];

describe("parseListonePool — core shape", () => {
  it("accepts a well-formed list", () => {
    const pool = parseListonePool([VALID_PLAYER, { name: "Test Two", role: "P", club: "Club Beta" }]);
    expect(pool).toEqual([VALID_PLAYER, { name: "Test Two", role: "P", club: "Club Beta" }]);
  });

  it("accepts an empty list", () => {
    expect(parseListonePool([])).toEqual([]);
  });

  it("rejects non-array input", () => {
    expect(parseListonePool({ not: "an array" })).toBeNull();
    expect(parseListonePool("nope")).toBeNull();
    expect(parseListonePool(null)).toBeNull();
  });

  it("rejects an item missing a required field", () => {
    expect(parseListonePool([{ role: "A", club: "Club Alfa" }])).toBeNull();
    expect(parseListonePool([{ name: "Test", club: "Club Alfa" }])).toBeNull();
    expect(parseListonePool([{ name: "Test", role: "A" }])).toBeNull();
  });

  it("rejects an unknown role", () => {
    expect(parseListonePool([{ name: "Test", role: "X", club: "Club Alfa" }])).toBeNull();
  });

  it("rejects a non-numeric quotation", () => {
    expect(parseListonePool([{ name: "Test", role: "A", club: "Club Alfa", quotation: "12" }])).toBeNull();
  });

  it("rejects a non-finite or negative quotation (audit r2 D9, probe C')", () => {
    // Raw JSON text, not a JS object literal: `1e999` is valid JSON and
    // JSON.parse resolves it to Infinity — the exact mechanism the probe
    // used to show the validator had no Number.isFinite guard on this field,
    // unlike isScaleValue for the appeal index.
    expect(parseListoneJsonText('[{"name":"Test","role":"A","club":"Club Alfa","quotation":1e999}]')).toBeNull();
    expect(parseListonePool([{ name: "Test", role: "A", club: "Club Alfa", quotation: -50 }])).toBeNull();
  });

  it("still accepts an ordinary finite, non-negative quotation, decimals included", () => {
    expect(parseListonePool([{ name: "Test", role: "A", club: "Club Alfa", quotation: 0 }])).not.toBeNull();
    expect(parseListonePool([{ name: "Test", role: "A", club: "Club Alfa", quotation: 12.75 }])).not.toBeNull();
  });

  it("rejects blank name/club", () => {
    expect(parseListonePool([{ name: "  ", role: "A", club: "Club Alfa" }])).toBeNull();
    expect(parseListonePool([{ name: "Test", role: "A", club: " " }])).toBeNull();
  });

  it("rejects if any single item in an otherwise-valid list is malformed", () => {
    expect(parseListonePool([VALID_PLAYER, { name: "Bad" }])).toBeNull();
  });
});

describe("parseListonePool — full JSON with extra columns", () => {
  it("captures extra columns verbatim under `extra`", () => {
    const pool = parseListonePool([{ name: "Test Three", role: "C", club: "Club Gamma", quotation: 30, fvm: 15.2, diff: 3 }]);
    expect(pool).toEqual([
      { name: "Test Three", role: "C", club: "Club Gamma", quotation: 30, extra: { fvm: 15.2, diff: 3 } },
    ]);
  });

  it("omits `extra` entirely when there are no extra columns", () => {
    const pool = parseListonePool([VALID_PLAYER]);
    expect(pool?.[0]).not.toHaveProperty("extra");
  });

  it("rejects an extra column whose value is not a string or number", () => {
    expect(parseListonePool([{ ...VALID_PLAYER, notes: { nested: true } }])).toBeNull();
    expect(parseListonePool([{ ...VALID_PLAYER, notes: [1, 2, 3] }])).toBeNull();
    expect(parseListonePool([{ ...VALID_PLAYER, notes: null }])).toBeNull();
  });

  it("rejects an extra column mixing string and number values across rows (audit r2 D10, probe U)", () => {
    // isCellValue allows string OR number per cell, so nothing stopped one
    // column key from carrying both types across different rows. With a
    // mixed column, sortListonePool's comparator (numeric only when BOTH
    // sides are numbers, string compare otherwise) is non-transitive and not
    // reversible between asc/desc. Reject at validation instead of letting
    // an inconsistent comparator reach the table.
    const result = validateListonePool([
      { name: "Ten", role: "A", club: "Club Alfa", score: "10" },
      { name: "Two", role: "A", club: "Club Beta", score: 2 },
      { name: "Nine", role: "A", club: "Club Gamma", score: 9 },
      { name: "Hundred", role: "A", club: "Club Delta", score: 100 },
      { name: "NineB", role: "A", club: "Club Epsilon", score: "9" },
    ]);
    expect(result).toMatchObject({ ok: false, reason: "mixed-extra-column-type", identity: "score" });
  });

  it("still accepts an extra column that is consistently one type", () => {
    expect(
      validateListonePool([
        { name: "Ten", role: "A", club: "Club Alfa", score: 10 },
        { name: "Two", role: "A", club: "Club Beta", score: 2 },
      ]).ok,
    ).toBe(true);
    expect(
      validateListonePool([
        { name: "Ten", role: "A", club: "Club Alfa", tag: "titolare" },
        { name: "Two", role: "A", club: "Club Beta", tag: "riserva" },
      ]).ok,
    ).toBe(true);
  });

  it("still accepts an extra column present on only some rows (missing is not a conflicting type)", () => {
    expect(
      validateListonePool([
        { name: "Ten", role: "A", club: "Club Alfa", score: 10 },
        { name: "Two", role: "A", club: "Club Beta" },
      ]).ok,
    ).toBe(true);
  });

  it("accepts a string or number extra column", () => {
    expect(parseListonePool([{ ...VALID_PLAYER, tag: "titolare" }])?.[0]?.extra).toEqual({ tag: "titolare" });
    expect(parseListonePool([{ ...VALID_PLAYER, fvm: 12.5 }])?.[0]?.extra).toEqual({ fvm: 12.5 });
  });

  it("rejects gated decision fields from untrusted local/static rows", () => {
    // "FTM." and "target_band-" are the issue #213 regressions (edge separators
    // must not smuggle a gated key past the filter); " ranking " guards the
    // whitespace-trim behavior that predates the fix.
    for (const key of ["ranking", "Projection Score", "Modifier", "target_band", "stretch-cap", "FTM", "fair_to_me_max", "FTM.", "target_band-", " ranking "]) {
      expect(isGatedListoneExtraKey(key)).toBe(true);
      expect(validateListonePool([{ ...VALID_PLAYER, [key]: 10 }])).toMatchObject({
        ok: false,
        reason: "gated-field",
      });
    }
  });

  it("rejects a gated field however it is decorated, spelled or disguised (#225)", () => {
    // The class, not the four cases that were reported: whatever renders as a
    // gated column on screen must be refused. Edge/inner separators the old
    // `[\s.-]` strip could not see, then the Unicode variants — invisible
    // characters, compatibility forms, combining marks, cross-script look-alikes.
    // Asserted as a set, not key by key, so a failing run names every key that
    // still slips through instead of stopping at the first one.
    expect(GATED_LOOKALIKE_KEYS.filter((key) => !isGatedListoneExtraKey(key))).toEqual([]);
    for (const key of GATED_LOOKALIKE_KEYS) {
      expect(validateListonePool([{ ...VALID_PLAYER, [key]: 10 }])).toMatchObject({
        ok: false,
        reason: "gated-field",
      });
    }
  });

  it("rejects a column whose name folds away to nothing (#225)", () => {
    // Observable consequence of the invariant: a key with no comparable
    // content left cannot be shown to be anything, so it is refused like an
    // unmappable one. No gated key is empty, so nothing collides here — this
    // guards the *declared* property, which is what the next reader trusts.
    for (const key of ["...", "___", "-.-", "\u200b\u200b", "\u{1f600}"]) {
      expect(isGatedListoneExtraKey(key)).toBe(true);
      expect(validateListonePool([{ ...VALID_PLAYER, [key]: 10 }])).toMatchObject({
        ok: false,
        reason: "gated-field",
      });
    }
  });

  it("still accepts the ordinary listone columns, accents included (#225)", () => {
    // The counterweight to the test above: closing the class must not start
    // refusing the columns the official XLSX actually carries.
    for (const key of INNOCENT_EXTRA_KEYS) {
      expect(isGatedListoneExtraKey(key)).toBe(false);
      expect(validateListonePool([{ ...VALID_PLAYER, [key]: 10 }])).toMatchObject({ ok: true });
    }
  });

  it("never invents an 'appetibilità' field even with extra columns present", () => {
    const pool = parseListonePool([{ ...VALID_PLAYER, fvm: 12.5 }]);
    expect(pool?.[0]?.extra).not.toHaveProperty("appetibilità");
    const columns = listoneColumns(pool ?? []);
    expect(columns.some((c) => c.label.toLowerCase().includes("appetibilit"))).toBe(false);
  });
});

describe("parseListoneJsonText — used for both the manual loader and localStorage restore", () => {
  it("accepts well-formed JSON text", () => {
    const pool = parseListoneJsonText(JSON.stringify([VALID_PLAYER]));
    expect(pool).toEqual([VALID_PLAYER]);
  });

  it("returns null (not a throw) for unparsable text", () => {
    expect(parseListoneJsonText("{not valid json")).toBeNull();
    expect(parseListoneJsonText("")).toBeNull();
  });

  it("returns null for valid JSON with an invalid shape", () => {
    expect(parseListoneJsonText(JSON.stringify([{ name: "Test" }]))).toBeNull();
    expect(parseListoneJsonText(JSON.stringify({ not: "an array" }))).toBeNull();
  });

  it("round-trips extra columns", () => {
    const withExtra = { ...VALID_PLAYER, fvm: 9.5 };
    const pool = parseListoneJsonText(JSON.stringify([withExtra]));
    expect(pool?.[0]?.extra).toEqual({ fvm: 9.5 });
  });
});

describe("listoneColumns", () => {
  // AGGIORNATO IL 2026-08-24, richiesta del committente. Erano quattro colonne
  // (name, role, club, quotation) nell'ordine della forma della riga. Adesso
  // l'ordine è quello dell'elenco di Pico — nome, ruolo, squadra, indice, i
  // cinque voti del Gruppo Esperti, rigorista, piazzati — e la QUOTAZIONE sta
  // dopo di loro, perché non è più fra le colonne visibili di default. Le
  // colonne extra del file caricato restano in coda, alfabetiche.
  // AGGIORNATO ANCORA: «piazzati» è diventata DUE colonne, «Punizioni» e
  // «Angoli», perché la fonte pubblica due file ORDINATE e non un insieme
  // (src/expertScheda.ts §rango). L'ultima voce dell'elenco di Pico si è
  // spaccata in due al proprio posto: nessuna colonna è comparsa altrove e
  // nessuna è sparita.
  it("lists the columns in Pico's order, quotation after the twelve, extras last", () => {
    const columns = listoneColumns([]);
    expect(columns.map((c) => c.key)).toEqual([
      "name",
      "role",
      "club",
      "pagella_titolarita",
      "pagella_media_voto",
      "pagella_salute",
      NO_MALUS_BONUS_COLUMN_KEY,
      "pagella_consiglio",
      RIGORISTA_COLUMN_KEY,
      PUNIZIONI_COLUMN_KEY,
      ANGOLI_COLUMN_KEY,
      "quotation",
    ]);
  });

  it("appends extra columns discovered across the pool, alphabetically", () => {
    const pool = parseListonePool([
      { ...VALID_PLAYER, zeta: 1 },
      { name: "Test Two", role: "P", club: "Club Beta", alfa: "x" },
    ]);
    const columns = listoneColumns(pool ?? []);
    expect(columns.map((c) => c.key).slice(-3)).toEqual(["quotation", "alfa", "zeta"]);
    expect(columns.filter((c) => !c.core).every((c) => c.core === false)).toBe(true);
  });

  // Una colonna extra del file caricato che porti la chiave di una colonna
  // calcolata qui produrrebbe DUE colonne con la stessa chiave: due
  // intestazioni identiche e un ordinamento che non sa quale delle due
  // ordinare. Vince quella calcolata, una sola volta.
  it("never emits two columns under the same key when the file collides with a computed one", () => {
    const pool = parseListonePool([{ ...VALID_PLAYER, [RIGORISTA_COLUMN_KEY]: "x" }]);
    const keys = listoneColumns(pool ?? []).map((c) => c.key);
    expect(keys.filter((k) => k === RIGORISTA_COLUMN_KEY)).toHaveLength(1);
  });

  it("infers extra column kind (number vs string) from the first row that has it", () => {
    const pool = parseListonePool([{ ...VALID_PLAYER, fvm: 15.2 }, { name: "T2", role: "P", club: "C2", fvm: 10 }]);
    const columns = listoneColumns(pool ?? []);
    expect(columns.find((c) => c.key === "fvm")?.kind).toBe("number");
  });
});

describe("DEFAULT_VISIBLE_COLUMN_KEYS", () => {
  // AGGIORNATA IL 2026-08-24, richiesta del committente: «nel listone di
  // default voglio che le colonne siano: nome, ruolo, squadra, indice di
  // appetibilità, Titolarità, Media Voto, Salute, No Malus/Bonus, Consiglio
  // Esperti, rigorista, piazzati». Erano le quattro colonne del pool;
  // l'asserzione non è stata tolta né allentata, dice le undici nuove — e
  // dice, riga sotto, che la QUOTAZIONE non è più fra loro.
  it("is exactly Pico's list, in his order — with «piazzati» split into its two ordered queues", () => {
    expect(DEFAULT_VISIBLE_COLUMN_KEYS).toEqual([
      "name",
      "role",
      "club",
      APPEAL_INDEX_COLUMN_KEY,
      "pagella_titolarita",
      "pagella_media_voto",
      "pagella_salute",
      NO_MALUS_BONUS_COLUMN_KEY,
      "pagella_consiglio",
      RIGORISTA_COLUMN_KEY,
      PUNIZIONI_COLUMN_KEY,
      ANGOLI_COLUMN_KEY,
    ]);
    expect(DEFAULT_VISIBLE_COLUMN_KEYS).toHaveLength(12);
  });

  it("no longer shows the listino quotation by default — hidden, never removed", () => {
    expect(DEFAULT_VISIBLE_COLUMN_KEYS).not.toContain("quotation");
    // Sempre nel listone: ordinabile, riaccendibile, con la sua intestazione.
    expect(listoneColumns([]).map((c) => c.key)).toContain("quotation");
  });

  it("keeps the eight Gruppo Esperti columns even for a pool that carries nothing", () => {
    // Sono sempre presenti apposta: la loro assenza È un dato (`n/d`), e una
    // colonna che sparisce non lo dice a nessuno.
    expect(defaultVisibleColumnKeys([VALID_PLAYER])).toEqual(
      DEFAULT_VISIBLE_COLUMN_KEYS.filter((k) => k !== APPEAL_INDEX_COLUMN_KEY),
    );
  });
});

describe("le tre colonne d'identità sono BLINDATE", () => {
  // IL VARCO CHE QUESTA SUITE NON COPRIVA, trovato eseguendo l'app durante la
  // review di PR #41 (2026-08-24): il pannello «Colonne visibili» generava un
  // interruttore per OGNI colonna, identità comprese, e premendo «Nome» la
  // riga restava «P CLU ClubUno n/d …» — senza il nome del giocatore.
  //
  // L'invariante era scritta in un commento, e un commento non fallisce.
  // Adesso vive nel dato (`locked`) e in queste asserzioni.
  const withExtras = parseListonePool([{ ...VALID_PLAYER, fvm: 12, zeta: "x" }])!;

  it("names exactly nome, ruolo e squadra — the first three of Pico's list", () => {
    expect(LISTONE_IDENTITY_COLUMN_KEYS).toEqual(["name", "role", "club"]);
    // DERIVATE, non riscritte a mano: sono anche le prime tre dell'elenco di
    // default e le prime tre delle colonne del listone. Due elenchi che
    // devono restare uguali divergono in silenzio — questo non può.
    expect(DEFAULT_VISIBLE_COLUMN_KEYS.slice(0, 3)).toEqual([...LISTONE_IDENTITY_COLUMN_KEYS]);
    expect(listoneColumns([]).slice(0, 3).map((c) => c.key)).toEqual([
      ...LISTONE_IDENTITY_COLUMN_KEYS,
    ]);
  });

  it("marks those three columns `locked`, and NO other column, whatever the pool", () => {
    const poolWithIndex = parseListonePool([withIndex("Test Uno", 72.5)])!;
    for (const columns of [listoneColumns([]), listoneColumns(withExtras), listoneColumns(poolWithIndex)]) {
      expect(columns.filter((c) => c.locked === true).map((c) => c.key)).toEqual([
        ...LISTONE_IDENTITY_COLUMN_KEYS,
      ]);
    }
  });

  it("does not lock every `core` column — the listino quotation stays switchable", () => {
    // `core` e `locked` dicono due cose diverse. La quotazione è core
    // (validata, tipizzata, di questo file) ed È spegnibile: una riga senza
    // quotazione dice ancora di chi parla. Confonderle bloccherebbe una
    // colonna che Pico ha chiesto esplicitamente di poter spegnere.
    const quotation = listoneColumns([]).find((c) => c.key === "quotation")!;
    expect(quotation.core).toBe(true);
    expect(quotation.locked).not.toBe(true);
  });

  it("keeps the identity columns visible against the very archive PR #41 could write", () => {
    const columns = listoneColumns([]);
    const defaults = defaultVisibleColumnKeys([]);
    // `{"schemaVersion":1,"hidden":["name"],"shown":[]}` — letto dal
    // localStorage vero, dopo un clic su «Nome» nel pannello di allora.
    const legacy: ListoneColumnPrefs = { hidden: ["name"], shown: [] };
    expect(visibleColumnKeys(columns, defaults, legacy)[0]).toBe("name");
  });

  it("cannot be emptied: the three survive an archive that hides every column", () => {
    const columns = listoneColumns([]);
    const defaults = defaultVisibleColumnKeys([]);
    const everythingOff: ListoneColumnPrefs = { hidden: columns.map((c) => c.key), shown: [] };
    expect(visibleColumnKeys(columns, defaults, everythingOff)).toEqual([
      ...LISTONE_IDENTITY_COLUMN_KEYS,
    ]);
  });

  it("leaves the other columns exactly as switchable as before", () => {
    const columns = listoneColumns(withExtras);
    const defaults = defaultVisibleColumnKeys(withExtras);
    const prefs: ListoneColumnPrefs = { hidden: [ANGOLI_COLUMN_KEY], shown: ["quotation", "fvm"] };
    const visible = visibleColumnKeys(columns, defaults, prefs);
    expect(visible).not.toContain(ANGOLI_COLUMN_KEY);
    expect(visible).toContain("quotation");
    expect(visible).toContain("fvm");
  });
});

describe("sortListonePool — strings", () => {
  const pool = [
    { name: "Zeta", role: "A", club: "Club Z" },
    { name: "Alfa", role: "P", club: "Club A" },
    { name: "Mimmo", role: "C", club: "Club M" },
  ] as const;

  it("sorts ascending by a string column", () => {
    expect(sortListonePool(pool, "name", "asc").map((p) => p.name)).toEqual(["Alfa", "Mimmo", "Zeta"]);
  });

  it("sorts descending by a string column", () => {
    expect(sortListonePool(pool, "name", "desc").map((p) => p.name)).toEqual(["Zeta", "Mimmo", "Alfa"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...pool];
    sortListonePool(pool, "name", "asc");
    expect(pool).toEqual(copy);
  });
});

describe("sortListonePool — numbers", () => {
  const pool = [
    { name: "A", role: "A", club: "C", quotation: 30 },
    { name: "B", role: "A", club: "C", quotation: 5 },
    { name: "C", role: "A", club: "C" }, // missing quotation
    { name: "D", role: "A", club: "C", quotation: 18 },
  ] as const;

  it("sorts ascending by a numeric column, missing values last", () => {
    expect(sortListonePool(pool, "quotation", "asc").map((p) => p.name)).toEqual(["B", "D", "A", "C"]);
  });

  it("sorts descending by a numeric column, missing values still last", () => {
    expect(sortListonePool(pool, "quotation", "desc").map((p) => p.name)).toEqual(["A", "D", "B", "C"]);
  });

  it("sorts by an extra numeric column", () => {
    const withExtra = parseListonePool([
      { name: "A", role: "A", club: "C", fvm: 8 },
      { name: "B", role: "A", club: "C", fvm: 20 },
    ]);
    expect(sortListonePool(withExtra ?? [], "fvm", "asc").map((p) => p.name)).toEqual(["A", "B"]);
  });
});

describe("listoneCellValue", () => {
  it("reads core and extra columns", () => {
    const p = parseListonePool([{ ...VALID_PLAYER, fvm: 9 }])?.[0];
    expect(p && listoneCellValue(p, "name")).toBe("Test Playerone");
    expect(p && listoneCellValue(p, "fvm")).toBe(9);
    expect(p && listoneCellValue(p, "does-not-exist")).toBeUndefined();
  });
});

describe("listoneColumnHeaderLabel", () => {
  const columns = listoneColumns([]);
  const nameCol = columns.find((c) => c.key === "name")!;
  const roleCol = columns.find((c) => c.key === "role")!;

  it("shows the plain label when this column is not the active sort", () => {
    expect(listoneColumnHeaderLabel(nameCol, null)).toBe("Nome");
    expect(listoneColumnHeaderLabel(nameCol, { key: "role", direction: "asc" })).toBe("Nome");
  });

  it("appends an ascending indicator when active and ascending", () => {
    expect(listoneColumnHeaderLabel(nameCol, { key: "name", direction: "asc" })).toBe("Nome ▲");
  });

  it("appends a descending indicator when active and descending", () => {
    expect(listoneColumnHeaderLabel(roleCol, { key: "role", direction: "desc" })).toBe("Ruolo ▼");
  });
});

describe("listoneRowHtml — visible columns", () => {
  const columns = listoneColumns([]);

  it("renders only the given columns, in order", () => {
    const nameOnly = columns.filter((c) => c.key === "name");
    const html = listoneRowHtml(VALID_PLAYER, nameOnly);
    expect(html).toContain("Test Playerone");
    expect(html).not.toContain("Club Alfa");
    expect(html).not.toContain(">A<");
  });

  it("renders name, role chip, club and quotation when all core columns are visible", () => {
    const html = listoneRowHtml(VALID_PLAYER, columns);
    expect(html).toContain("Test Playerone");
    expect(html).toContain(">A<");
    expect(html).toContain("Club Alfa");
    expect(html).toContain(">12<");
  });

  it("shows a dash when quotation is absent", () => {
    const html = listoneRowHtml({ name: "Test Two", role: "P", club: "Club Beta" }, columns);
    expect(html).toContain(">—<");
  });

  it("renders an extra column value, or a dash when missing on that row", () => {
    const withExtra = parseListonePool([{ ...VALID_PLAYER, fvm: 9.5 }, { name: "T2", role: "P", club: "C2" }]);
    const cols = listoneColumns(withExtra ?? []);
    const htmlWithValue = listoneRowHtml(withExtra![0]!, cols);
    const htmlMissing = listoneRowHtml(withExtra![1]!, cols);
    expect(htmlWithValue).toContain(">9.5<");
    // the extra column ("fvm") has no value on the second row -> dash
    expect(htmlMissing.match(/>—</g)?.length).toBeGreaterThanOrEqual(2); // quotation + fvm both missing
  });

  it("HTML-escapes name and club (defense in depth)", () => {
    const html = listoneRowHtml({ name: "<script>", role: "A", club: "<b>Club</b>" }, columns);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Club</b>");
  });

  it("HTML-escapes extra string column values too", () => {
    const withExtra = parseListonePool([{ ...VALID_PLAYER, tag: "<img src=x>" }]);
    const cols = listoneColumns(withExtra ?? []);
    const html = listoneRowHtml(withExtra![0]!, cols);
    expect(html).not.toContain("<img src=x>");
  });

  it("leads the club cell with a real logo image, falling back to initials via onerror", () => {
    const html = listoneRowHtml(VALID_PLAYER, columns);
    expect(html).toContain("<img");
    expect(html).toContain("CLU"); // "Club Alfa" initials, the fallback badge
    expect(html).toContain("onerror=");
  });
});

describe("listoneTableHeadHtml (empty-state static header)", () => {
  // AGGIORNATO IL 2026-08-24, richiesta del committente: lo scheletro della
  // tabella vuota mostra le colonne di default, quindi «Quotazione» non c'è
  // più (nascosta, non tolta) e ci sono le OTTO del Gruppo Esperti — «Piazzati»
  // è diventata «Punizioni» e «Angoli», due file ordinate invece di un insieme.
  it("has no Appetibilità column (not honestly derivable yet)", () => {
    const html = listoneTableHeadHtml();
    expect(html).not.toContain("Appetibilità");
    expect(html).toContain("Nome");
    expect(html).toContain("Ruolo");
    expect(html).toContain("Squadra");
    expect(html).toContain("Titolarità");
    expect(html).toContain("No malus / Bonus");
    expect(html).toContain("Rigorista");
    expect(html).toContain("Punizioni");
    expect(html).toContain("Angoli");
    expect(html).not.toContain("Quotazione");
  });
});

describe("LISTONE_FALLBACK_NOTE", () => {
  it("is a stable, honest string — no engine/decisional claim", () => {
    expect(LISTONE_FALLBACK_NOTE).toContain("Listone 2025/26 — fallback temporaneo caricato automaticamente");
    expect(LISTONE_FALLBACK_NOTE).toContain("non usato dal motore decisionale");
    expect(LISTONE_FALLBACK_NOTE.toLowerCase()).not.toContain("appetibilità calcolata dal motore");
  });
});

describe("resolveListonePool — remote deposit vs static asset vs localStorage priority", () => {
  const staticText = JSON.stringify([VALID_PLAYER]);
  const localText = JSON.stringify([{ name: "Local Player", role: "D", club: "Club Gamma" }]);

  it("auto-load success: a valid static asset wins even when localStorage also has a valid pool", () => {
    const result = resolveListonePool({ remoteJsonText: null, staticJsonText: staticText, localStorageText: localText });
    expect(result.source).toBe("static");
    expect(result.pool).toEqual([VALID_PLAYER]);
  });

  it("static asset wins when localStorage is empty", () => {
    const result = resolveListonePool({ remoteJsonText: null, staticJsonText: staticText, localStorageText: null });
    expect(result.source).toBe("static");
    expect(result.pool).toEqual([VALID_PLAYER]);
  });

  it("auto-load failure (fetch never happened / network error): falls back to localStorage", () => {
    const result = resolveListonePool({ remoteJsonText: null, staticJsonText: null, localStorageText: localText });
    expect(result.source).toBe("local-storage");
    expect(result.pool).toEqual([{ name: "Local Player", role: "D", club: "Club Gamma" }]);
  });

  it("auto-load failure (malformed JSON from the asset): falls back to localStorage, no crash", () => {
    const result = resolveListonePool({ remoteJsonText: null, staticJsonText: "{not json", localStorageText: localText });
    expect(result.source).toBe("local-storage");
    expect(result.pool).toEqual([{ name: "Local Player", role: "D", club: "Club Gamma" }]);
  });

  it("auto-load failure (valid JSON, wrong shape): falls back to localStorage, no crash", () => {
    const result = resolveListonePool({
      remoteJsonText: null,
      staticJsonText: JSON.stringify([{ missing: "required fields" }]),
      localStorageText: localText,
    });
    expect(result.source).toBe("local-storage");
    expect(result.pool).toEqual([{ name: "Local Player", role: "D", club: "Club Gamma" }]);
  });

  it("no asset and no localStorage: empty pool, no error, no crash", () => {
    const result = resolveListonePool({ remoteJsonText: null, staticJsonText: null, localStorageText: null });
    expect(result.source).toBe("none");
    expect(result.pool).toEqual([]);
  });

  it("both static and localStorage malformed: empty pool, not a throw", () => {
    const result = resolveListonePool({ remoteJsonText: null, staticJsonText: "nope", localStorageText: "also nope" });
    expect(result.source).toBe("none");
    expect(result.pool).toEqual([]);
  });

  const remoteText = JSON.stringify([{ name: "Remote Player", role: "C", club: "Club Delta" }]);

  it("a valid private-deposit payload wins over both the static asset and localStorage", () => {
    const result = resolveListonePool({
      remoteJsonText: remoteText,
      staticJsonText: staticText,
      localStorageText: localText,
    });
    expect(result.source).toBe("remote");
    expect(result.pool).toEqual([{ name: "Remote Player", role: "C", club: "Club Delta" }]);
  });

  it("an unreachable deposit leaves the static asset in charge", () => {
    const result = resolveListonePool({
      remoteJsonText: null,
      staticJsonText: staticText,
      localStorageText: localText,
    });
    expect(result.source).toBe("static");
  });

  it("a malformed deposit payload falls through instead of blanking the pool", () => {
    for (const broken of ["{not json", JSON.stringify([{ missing: "fields" }]), JSON.stringify([])]) {
      const result = resolveListonePool({
        remoteJsonText: broken,
        staticJsonText: staticText,
        localStorageText: localText,
      });
      expect(result.source).toBe("static");
      expect(result.pool).toEqual([VALID_PLAYER]);
    }
  });

  it("a deposit carrying a gated field is refused, exactly like a manually loaded file", () => {
    const result = resolveListonePool({
      remoteJsonText: JSON.stringify([{ name: "X", role: "A", club: "Y", target_band: 12 }]),
      staticJsonText: null,
      localStorageText: localText,
    });
    expect(result.source).toBe("local-storage");
  });

  it("a malformed deposit with nothing else available leaves an empty pool, not a throw", () => {
    const result = resolveListonePool({
      remoteJsonText: "nope",
      staticJsonText: null,
      localStorageText: null,
    });
    expect(result.source).toBe("none");
    expect(result.pool).toEqual([]);
  });

  // Audit round 2, finding 5 — PROBE T1/T2. `[]` parses, and used to win for
  // `static`/`local-storage` because only the deposit branch checked the row
  // count: a degraded static asset emptied the panel AND (main.ts persists
  // the raw text of an automatic source) overwrote the last good offline copy.
  describe("a source that resolves to zero rows is skipped, whichever source it is", () => {
    it("PROBE T1: an empty static asset no longer beats a valid localStorage copy", () => {
      const result = resolveListonePool({
        remoteJsonText: null,
        staticJsonText: "[]",
        localStorageText: localText,
      });
      expect(result.source).toBe("local-storage");
      expect(result.pool).toEqual([{ name: "Local Player", role: "D", club: "Club Gamma" }]);
    });

    it("PROBE T2: the deposit's own zero-row guard is unchanged", () => {
      const result = resolveListonePool({
        remoteJsonText: "[]",
        staticJsonText: staticText,
        localStorageText: null,
      });
      expect(result.source).toBe("static");
      expect(result.pool).toEqual([VALID_PLAYER]);
    });

    it("an empty localStorage copy falls through to the empty state", () => {
      const result = resolveListonePool({
        remoteJsonText: null,
        staticJsonText: null,
        localStorageText: "[]",
      });
      expect(result.source).toBe("none");
      expect(result.pool).toEqual([]);
    });

    it("every source empty ends in the empty state, never a zero-row 'valid' pool", () => {
      const result = resolveListonePool({
        remoteJsonText: "[]",
        staticJsonText: "[]",
        localStorageText: "[]",
      });
      expect(result.source).toBe("none");
      expect(result.pool).toEqual([]);
    });

    it("an empty static asset still lets the deposit win", () => {
      const result = resolveListonePool({
        remoteJsonText: remoteText,
        staticJsonText: "[]",
        localStorageText: null,
      });
      expect(result.source).toBe("remote");
    });
  });
});

describe("formatListoneUpdatedAt", () => {
  it("renders a Drive timestamp in Europe/Rome, fixed numeric layout", () => {
    // 10:19 UTC in August is 12:19 in Rome (CEST, UTC+2).
    expect(formatListoneUpdatedAt("2026-08-12T10:19:04.617Z")).toBe("12/08/2026 12:19");
    // January is CET (UTC+1), and the day rolls over across midnight.
    expect(formatListoneUpdatedAt("2026-01-31T23:30:00Z")).toBe("01/02/2026 00:30");
  });

  it("returns null rather than a made-up date for anything unusable", () => {
    expect(formatListoneUpdatedAt(null)).toBeNull();
    expect(formatListoneUpdatedAt("")).toBeNull();
    expect(formatListoneUpdatedAt("   ")).toBeNull();
    expect(formatListoneUpdatedAt("not-a-date")).toBeNull();
  });
});

describe("listoneSourceNote", () => {
  it("says the rows come from the private deposit, with the freshness date", () => {
    const note = listoneSourceNote("remote", "2026-08-12T10:19:04.617Z");
    expect(note).toContain("Listone aggiornato automaticamente dal deposito privato");
    expect(note).toContain("(dati aggiornati al 12/08/2026 12:19)");
    expect(note).toContain("non usato dal motore decisionale");
    expect(note).toContain("Nessuna appetibilità calcolata.");
  });

  it("stops denying a calculated index once the pool actually carries one", () => {
    const note = listoneSourceNote("remote", "2026-08-12T10:19:04.617Z", true);
    expect(note).toContain("non usato dal motore decisionale");
    expect(note).not.toContain("Nessuna appetibilità calcolata");
  });

  it("drops the freshness clause when the deposit gave no usable timestamp", () => {
    const note = listoneSourceNote("remote", null);
    expect(note).toContain("Listone aggiornato automaticamente dal deposito privato.");
    expect(note).not.toContain("dati aggiornati al");
    expect(note).toContain("non usato dal motore decisionale");
  });

  it("keeps the unchanged fallback note for every non-remote source", () => {
    for (const source of ["static", "local-storage", "manual", "none"] as const) {
      expect(listoneSourceNote(source, "2026-08-12T10:19:04.617Z")).toBe(LISTONE_FALLBACK_NOTE);
    }
  });
});

describe("LISTONE_GATED_EXTRA_KEYS", () => {
  it("is exactly the set the gated-field predicate enforces", () => {
    for (const key of LISTONE_GATED_EXTRA_KEYS) expect(isGatedListoneExtraKey(key)).toBe(true);
    expect(LISTONE_GATED_EXTRA_KEYS).toContain("target_band");
    expect(LISTONE_GATED_EXTRA_KEYS).toContain("fair_to_me");
  });
});

function makePool(n: number) {
  return Array.from({ length: n }, (_, i) => ({ name: `Player ${i + 1}`, role: "A" as const, club: "Club" }));
}

describe("paginateListonePool", () => {
  it("defaults to 10 rows per page", () => {
    expect(LISTONE_PAGE_SIZE).toBe(10);
    const result = paginateListonePool(makePool(25), 1);
    expect(result.items).toHaveLength(10);
    expect(result.items[0]?.name).toBe("Player 1");
    expect(result.items[9]?.name).toBe("Player 10");
  });

  it("returns the correct slice for a middle page", () => {
    const result = paginateListonePool(makePool(25), 2);
    expect(result.items).toHaveLength(10);
    expect(result.items[0]?.name).toBe("Player 11");
    expect(result.items[9]?.name).toBe("Player 20");
  });

  it("returns a partial last page", () => {
    const result = paginateListonePool(makePool(25), 3);
    expect(result.items).toHaveLength(5);
    expect(result.items[0]?.name).toBe("Player 21");
    expect(result.totalPages).toBe(3);
  });

  it("computes totalPages correctly for an exact multiple", () => {
    const result = paginateListonePool(makePool(20), 1);
    expect(result.totalPages).toBe(2);
  });

  it("an empty pool has exactly one (empty) page, not zero", () => {
    const result = paginateListonePool([], 1);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
    expect(result.items).toEqual([]);
  });

  it("clamps an out-of-range page down to the last valid page (pool shrank)", () => {
    const result = paginateListonePool(makePool(12), 99);
    expect(result.page).toBe(2);
    expect(result.items).toHaveLength(2);
  });

  it("clamps a page below 1 up to 1", () => {
    const result = paginateListonePool(makePool(12), 0);
    expect(result.page).toBe(1);
    const negative = paginateListonePool(makePool(12), -5);
    expect(negative.page).toBe(1);
  });

  it("acts on whatever order it's given — pagination itself never re-sorts", () => {
    // Pass an already-sorted pool (as main.ts does: sort first, then paginate)
    // and confirm paginate preserves that order rather than re-ordering it.
    const pool = [
      { name: "Zeta", role: "A" as const, club: "C" },
      { name: "Alfa", role: "A" as const, club: "C" },
    ];
    const result = paginateListonePool(pool, 1);
    expect(result.items.map((p) => p.name)).toEqual(["Zeta", "Alfa"]);
  });
});

describe("listoneColumnTooltip", () => {
  const columns = listoneColumns([]);
  const byKey = (key: string) => columns.find((c) => c.key === key)!;

  it("has a non-generic, distinct description for every known real-listone column", () => {
    const knownExtraKeys = ["Id", "RM", "Qt.I", "Diff.", "Qt.A M", "Qt.I M", "Diff.M", "FVM", "FVM M"];
    const seen = new Set<string>();
    for (const key of knownExtraKeys) {
      const tooltip = listoneColumnTooltip({ key, label: key, kind: "string", core: false });
      expect(tooltip.length).toBeGreaterThan(5);
      expect(tooltip).not.toContain("colonna aggiuntiva dal file caricato"); // that's the unknown-column fallback
      expect(seen.has(tooltip)).toBe(false); // no two known columns share a description
      seen.add(tooltip);
    }
  });

  it("describes the 4 core columns meaningfully", () => {
    expect(listoneColumnTooltip(byKey("name"))).toContain("giocatore");
    expect(listoneColumnTooltip(byKey("role"))).toContain("portiere");
    expect(listoneColumnTooltip(byKey("club"))).toContain("Squadra");
    expect(listoneColumnTooltip(byKey("quotation"))).toContain("Quotazione Attuale");
  });

  it("falls back to an honest label-based description for an unrecognized extra column", () => {
    const tooltip = listoneColumnTooltip({ key: "mystery_field", label: "mystery_field", kind: "string", core: false });
    expect(tooltip).toContain("mystery_field");
    expect(tooltip).toContain("colonna aggiuntiva dal file caricato");
  });
});

describe("listonePlayerKey", () => {
  it("uses a stable proxy identifier across display-field changes", () => {
    expect(listonePlayerKey({ proxyId: "synthetic-42", name: "Nome Uno", club: "Club Alfa" })).toBe(
      listonePlayerKey({ proxyId: "synthetic-42", name: "Nome Due", club: "Club Beta" }),
    );
  });

  it("is stable for the same name+club regardless of case", () => {
    expect(listonePlayerKey({ name: "Test Playerone", club: "Club Alfa" })).toEqual(
      listonePlayerKey({ name: "test playerone", club: "CLUB ALFA" }),
    );
  });

  it("is accent-insensitive", () => {
    expect(listonePlayerKey({ name: "Nicolò", club: "Club Alfa" })).toEqual(
      listonePlayerKey({ name: "Nicolo", club: "Club Alfa" }),
    );
  });

  it("differs for different names or clubs", () => {
    const base = listonePlayerKey({ name: "Test Playerone", club: "Club Alfa" });
    expect(listonePlayerKey({ name: "Test Playertwo", club: "Club Alfa" })).not.toEqual(base);
    expect(listonePlayerKey({ name: "Test Playerone", club: "Club Beta" })).not.toEqual(base);
  });
});

describe("LIVE-04 proxy identity collisions", () => {
  it("rejects duplicate stable identifiers without partially loading rows", () => {
    const result = validateListonePool([
      { proxyId: "same", name: "Synthetic One", role: "A", club: "Club Alfa" },
      { proxyId: "same", name: "Synthetic Two", role: "D", club: "Club Beta" },
    ]);
    expect(result).toMatchObject({ ok: false, reason: "duplicate-identity", identity: "proxy:same" });
  });

  it("requires explicit disambiguation when fallback identities collide", () => {
    const result = validateListonePool([
      { name: "Nìme Synthetic", role: "A", club: "Club Alfa" },
      { name: "Nime Synthetic", role: "A", club: "CLUB ALFA" },
    ]);
    expect(result).toMatchObject({ ok: false, reason: "ambiguous-identity" });
  });

  it("accepts otherwise ambiguous display rows when proxyIds disambiguate them", () => {
    const result = validateListonePool([
      { proxyId: 101, name: "Same Synthetic", role: "A", club: "Club Alfa" },
      { proxyId: 102, name: "Same Synthetic", role: "A", club: "Club Alfa" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.ok && result.pool.map(listonePlayerKey)).toEqual(["proxy:101", "proxy:102"]);
  });

  it("rejects a pool mixing proxyId and nome__club rows — two identities for one physical player (audit r2 D8, probe S)", () => {
    // Only reachable via manual loading: the private deposit never emits
    // proxyId (packages/listone-live-serve/src/depositPayload.ts) and
    // neither does the shipped asset. Two rows for the same physical player
    // — one carrying proxyId, one not — resolve to two different
    // listonePlayerKey values (`proxy:101` vs `alfa-uno__club-uno`), so
    // neither the duplicate-identity nor the ambiguous-identity check ever
    // fires. Reject the mixed scheme itself instead of trying to detect the
    // collision after the fact.
    const result = validateListonePool([
      { proxyId: 101, name: "Alfa Uno", role: "A", club: "Club Uno" },
      { name: "Alfa Uno", role: "A", club: "Club Uno" },
    ]);
    expect(result).toMatchObject({ ok: false, reason: "mixed-identity-scheme" });
  });

  it("still accepts a pool that is entirely proxyId rows or entirely nome__club rows", () => {
    expect(
      validateListonePool([
        { proxyId: 101, name: "Alfa Uno", role: "A", club: "Club Uno" },
        { proxyId: 102, name: "Beta Due", role: "D", club: "Club Due" },
      ]).ok,
    ).toBe(true);
    expect(
      validateListonePool([
        { name: "Alfa Uno", role: "A", club: "Club Uno" },
        { name: "Beta Due", role: "D", club: "Club Due" },
      ]).ok,
    ).toBe(true);
  });
});

describe("legacyPlayerIdDisplayName", () => {
  it("recovers the name portion of a name__club id", () => {
    expect(legacyPlayerIdDisplayName("test-playerone__club-alfa")).toEqual("test playerone");
  });

  it("strips a trailing numeric timestamp from the old name-slug-timestamp format", () => {
    expect(legacyPlayerIdDisplayName("nicolo-zaniolo-1719300000000")).toEqual("nicolo zaniolo");
  });

  it("falls back to the raw id if nothing can be recovered", () => {
    expect(legacyPlayerIdDisplayName("")).toEqual("");
  });
});

describe("resolvePlayerDisplayName", () => {
  const pool = [VALID_PLAYER, { name: "Test Two", role: "P" as const, club: "Club Beta" }];
  const index = listonePoolIndex(pool);

  it("prefers the real, correctly-cased name from a matching pool row", () => {
    const playerId = listonePlayerKey(VALID_PLAYER);
    expect(resolvePlayerDisplayName(playerId, index)).toEqual("Test Playerone");
  });

  it("falls back to a reconstruction when no pool row matches", () => {
    expect(resolvePlayerDisplayName("ghost-player__unknown-club", index)).toEqual("ghost player");
  });

  it("an empty index resolves nothing and never throws", () => {
    expect(resolvePlayerDisplayName(listonePlayerKey(VALID_PLAYER), listonePoolIndex([]))).toEqual(
      "test playerone",
    );
  });
});

// Audit round 2, finding 2 — the STORICO/Rose lookup used to be a linear
// pool.find that recomputed listonePlayerKey per row, i.e. O(log × pool) per
// render on the critical path of a call.
describe("listonePoolIndex (audit round 2, finding 2)", () => {
  it("indexes every row by its listonePlayerKey", () => {
    const pool = [VALID_PLAYER, { name: "Test Two", role: "P" as const, club: "Club Beta" }];
    const index = listonePoolIndex(pool);
    expect(index.size).toBe(2);
    expect(index.get(listonePlayerKey(VALID_PLAYER))).toEqual(VALID_PLAYER);
  });

  it("indexes proxyId rows under their proxy key", () => {
    const proxied = { proxyId: 101, name: "Test Playerone", role: "A" as const, club: "Club Alfa" };
    expect(listonePoolIndex([proxied]).get("proxy:101")).toEqual(proxied);
  });

  it("keeps pool.find's answer on a duplicate key: the FIRST row wins", () => {
    const first = { name: "Test Playerone", role: "A" as const, club: "Club Alfa", quotation: 1 };
    const second = { name: "TEST PLAYERONE", role: "A" as const, club: "club alfa", quotation: 99 };
    const key = listonePlayerKey(first);
    expect(listonePlayerKey(second)).toEqual(key);
    expect(listonePoolIndex([first, second]).get(key)).toEqual(first);
  });

  /* ──────────────────────────────────────────────────────────────────────────
     SI CONTA, NON SI CRONOMETRA
     ──────────────────────────────────────────────────────────────────────────
     Qui viveva "resolves a whole panel of ids in a fraction of the linear-scan
     cost": due finestre `performance.now()` e `expect(indexedMs * 5)
     .toBeLessThan(linearMs)`. È stato rimosso perché aveva smesso di
     discriminare, e un'indagine forense indipendente l'ha misurato:

     - la finestra `indexed` misurava per ~75% l'harness e non il prodotto: il
       lavoro reale è 0,82 ms, i 224 `expect(...).toContain(...)` DENTRO la
       finestra cronometrata ne aggiungevano ~3,0. Rapporto reale
       dell'algoritmo 65×, rapporto misurato 17,9× — l'overhead si scaricava
       quasi tutto sul denominatore;
     - il denominatore era sotto il rumore di schedulazione: sotto suite intera
       la finestra `indexed` è stata vista a 9,36 / 10,95 / 20,19 ms mentre
       `linear` restava a ~53 ms. Non GC e non contesa CPU uniforme (entrambe
       falsificate: gli eventi GC cadono nella finestra `linear`, e 15
       esecuzioni con 6 CPU-hog danno zero rossi), ma lo STALLO DISCRETO;
     - riproduzioni: suite intera 1 rosso su 6, test isolato 0 su 15, isolato
       sotto carico 0 su 15;
     - sweep del degrado reale: 4× passa, 8× passa, 12× fallisce, 24×
       fallisce. Un peggioramento reale di OTTO VOLTE restava verde, e zero
       modifiche al codice producevano rossi: banda di rumore e banda di
       segnale si sovrapponevano, e il rumore era più largo.

     L'unica regressione che quell'asserzione catturasse da sola — il ritorno
     completo della scansione lineare — è già catturata deterministicamente da
     "indexes every row by its listonePlayerKey" qui sopra (su `index.size`).
     Il suo valore marginale era quindi negativo: falsi rossi senza copertura
     aggiuntiva.

     Al suo posto, sotto, la stessa proprietà nella valuta giusta: il NUMERO di
     calcoli di `listonePlayerKey`, contato riga per riga, senza alcuna
     finestra temporale. Non un flag che dichiara una condizione: un contatore
     che conta le invocazioni.
     ────────────────────────────────────────────────────────────────────────── */

  /**
   * Conta quante volte `listonePlayerKey` viene applicata a una riga del pool,
   * senza mock e senza spie su binding ESM (che non intercettano le chiamate
   * interne al modulo): ogni riga porta un getter su `proxyId`, la PRIMA
   * proprietà che `listonePlayerKey` legge, e in questo percorso
   * (`listonePoolIndex` + `resolvePlayerDisplayName`) nessun altro la legge.
   * Una lettura di `proxyId` = una chiave calcolata su quella riga.
   */
  function countingPool(rows: number): {
    readonly pool: ListonePlayer[];
    keyComputations(): number;
    reset(): void;
  } {
    let count = 0;
    const pool = Array.from({ length: rows }, (_, i) => {
      const row = {
        name: `Giocatore ${i}`,
        role: "C" as const,
        club: `Club ${i % 20}`,
        quotation: (i % 30) + 1,
      };
      Object.defineProperty(row, "proxyId", {
        get(): undefined {
          count += 1;
          return undefined;
        },
        enumerable: false,
        configurable: true,
      });
      return row as ListonePlayer;
    });
    return { pool, keyComputations: () => count, reset: () => void (count = 0) };
  }

  it("resolves a whole panel of ids with ONE key computation per pool row", () => {
    // La stessa forma che la probe aveva misurato — un'asta completa (224
    // acquisti in piedi) contro un listone di taglia reale (600 righe) — ma
    // l'asserzione è sul CONTEGGIO, non sul tempo: deterministica per
    // costruzione, insensibile a stalli di schedulazione, GC e carico.
    const POOL_ROWS = 600;
    const PANEL_IDS = 224;
    const counting = countingPool(POOL_ROWS);
    const ids = Array.from({ length: PANEL_IDS }, (_, i) => listonePlayerKey(counting.pool[i * 2]!));

    counting.reset();
    const index = listonePoolIndex(counting.pool);
    for (const id of ids) expect(resolvePlayerDisplayName(id, index)).toContain("Giocatore");

    // O(pool): una passata sola, una chiave per riga. Non "circa", non "meno
    // di": esattamente. Il termine O(log × pool) non c'è.
    expect(counting.keyComputations()).toBe(POOL_ROWS);
  });

  it("the linear scan it replaced costs two orders of magnitude more key computations", () => {
    // Il confronto che l'asserzione cronometrata voleva fare, nella valuta in
    // cui è esatto. Serve a rendere leggibile il margine: non è "un po' meno",
    // sono ~83,6 volte meno (linear=50176, indexed=600, misurati con questo
    // stesso contatore), e la differenza è un numero intero riproducibile.
    const POOL_ROWS = 600;
    const PANEL_IDS = 224;
    const counting = countingPool(POOL_ROWS);
    const ids = Array.from({ length: PANEL_IDS }, (_, i) => listonePlayerKey(counting.pool[i * 2]!));

    counting.reset();
    for (const id of ids) {
      const match = counting.pool.find((p) => listonePlayerKey(p) === id);
      expect(match).toBeDefined();
    }
    const linear = counting.keyComputations();

    counting.reset();
    const index = listonePoolIndex(counting.pool);
    for (const id of ids) expect(resolvePlayerDisplayName(id, index)).toContain("Giocatore");
    const indexed = counting.keyComputations();

    expect(indexed).toBe(POOL_ROWS);
    expect(indexed * 5).toBeLessThan(linear);
  });
});

// Audit round 2, finding 1 — the log's playerId is a listonePlayerKey, so a
// pool swap can orphan every purchase already written.
describe("orphanPlayerIds (audit round 2, finding 1)", () => {
  const bought = { name: "Alfa Uno", role: "A" as const, club: "ClubUno", quotation: 20 };
  const boughtId = listonePlayerKey(bought);

  it("reports nothing when every id still resolves", () => {
    expect(orphanPlayerIds([boughtId], listonePoolIndex([bought]))).toEqual([]);
  });

  it("PROBE E identity: the same physical player under a new spelling is an orphan", () => {
    // Exactly the substitution the probe performed: the deposit comes back
    // with the updated spelling, so the id already in the log resolves to
    // nothing and the player is offered as free again.
    const renamed = { name: "Alfa Uno Junior", role: "A" as const, club: "ClubUno", quotation: 20 };
    const renamedIndex = listonePoolIndex([renamed]);
    expect(listonePlayerKey(renamed)).not.toEqual(boughtId);
    expect(orphanPlayerIds([boughtId], renamedIndex)).toEqual([boughtId]);
  });

  it("an emptied pool orphans every standing purchase", () => {
    expect(orphanPlayerIds([boughtId, "beta-due__clubdue"], listonePoolIndex([]))).toEqual([
      boughtId,
      "beta-due__clubdue",
    ]);
  });

  it("de-duplicates and keeps purchase order", () => {
    expect(orphanPlayerIds(["b", "a", "b"], listonePoolIndex([]))).toEqual(["b", "a"]);
  });
});

describe("filterListonePool", () => {
  const alfa = { name: "Alfa Rossi", role: "A" as const, club: "Club Alfa" };
  const beta = { name: "Beta Bianchi", role: "D" as const, club: "Club Beta" };
  const gamma = { name: "Gamma Verdi", role: "A" as const, club: "Club Alfa" };
  const pool = [alfa, beta, gamma];
  const noFilter = { text: "", roles: [] as const, club: "", status: "all" as const };

  it("filters by case-insensitive name substring", () => {
    const result = filterListonePool(pool, { ...noFilter, text: "ross" }, new Set());
    expect(result).toEqual([alfa]);
  });

  it("filters by role", () => {
    const result = filterListonePool(pool, { ...noFilter, roles: ["D"] }, new Set());
    expect(result).toEqual([beta]);
  });

  // SELEZIONE MULTIPLA, dal 2026-08-29: due ruoli accesi sono l'UNIONE, non
  // l'intersezione — che sarebbe sempre vuota, perché un giocatore ha un ruolo
  // solo. È l'errore che questa riga esiste per non lasciar fare.
  it("con due ruoli mostra le righe di ENTRAMBI, non l'insieme vuoto", () => {
    const result = filterListonePool(pool, { ...noFilter, roles: ["A", "D"] }, new Set());
    expect(result).toEqual([alfa, beta, gamma]);
  });

  // E l'elenco vuoto è l'assenza di un filtro, non un filtro che non ammette
  // niente: quattro interruttori spenti sono la tabella intera.
  it("nessun ruolo acceso significa TUTTI, non nessuno", () => {
    expect(filterListonePool(pool, { ...noFilter, roles: [] }, new Set())).toEqual(pool);
  });

  it("filters by club", () => {
    const result = filterListonePool(pool, { ...noFilter, club: "Club Alfa" }, new Set());
    expect(result).toEqual([alfa, gamma]);
  });

  it("combines text/role/club filters", () => {
    const result = filterListonePool(pool, { text: "gamma", roles: ["A"], club: "Club Alfa", status: "all" }, new Set());
    expect(result).toEqual([gamma]);
  });

  it("status 'available' excludes assigned players (the default view)", () => {
    const assignedKeys = new Set([listonePlayerKey(alfa)]);
    const result = filterListonePool(pool, { ...noFilter, status: "available" }, assignedKeys);
    expect(result).toEqual([beta, gamma]);
  });

  it("status 'assigned' shows only assigned players", () => {
    const assignedKeys = new Set([listonePlayerKey(alfa)]);
    const result = filterListonePool(pool, { ...noFilter, status: "assigned" }, assignedKeys);
    expect(result).toEqual([alfa]);
  });

  it("status 'all' ignores assignment", () => {
    const assignedKeys = new Set([listonePlayerKey(alfa)]);
    const result = filterListonePool(pool, { ...noFilter, status: "all" }, assignedKeys);
    expect(result).toEqual(pool);
  });

  it("folds diacritics in the search query, same normalization as listonePlayerKey (audit r2 D6, probe A/K)", () => {
    // listonePlayerKey folds identities through normalizeIdentityPart; the
    // search bar must find the same rows when the operator types the name as
    // heard, without the accent.
    // Synthetic names only (docs/data/LISTONE_UI_LOAD_CONTRACT.md: no real
    // player/club names in this file) — diacritic positions mirror real
    // examples the fold must handle (trailing ò/ì), the identities are not.
    const zampilo = { name: "Zampilò", role: "A" as const, club: "Club Alfa" };
    const bacodo = { name: "Bacodò", role: "C" as const, club: "Club Beta" };
    const facilmi = { name: "Facilmì", role: "D" as const, club: "Club Gamma" };
    const accentedPool = [zampilo, bacodo, facilmi];
    expect(filterListonePool(accentedPool, { ...noFilter, text: "Zampilo" }, new Set())).toEqual([zampilo]);
    expect(filterListonePool(accentedPool, { ...noFilter, text: "ZAMPILO" }, new Set())).toEqual([zampilo]);
    expect(filterListonePool(accentedPool, { ...noFilter, text: "Bacodo" }, new Set())).toEqual([bacodo]);
    expect(filterListonePool(accentedPool, { ...noFilter, text: "Facilmi" }, new Set())).toEqual([facilmi]);
  });

  it("still matches a multi-word query once both sides fold separators the same way", () => {
    // normalizeIdentityPart collapses non-alphanumerics to "-", so it must be
    // applied to both the query and the name or "de sintetis" (space) would
    // no longer match a name folded to "de-sintetis". Synthetic names only
    // (docs/data/LISTONE_UI_LOAD_CONTRACT.md).
    const target = { name: "De Sintetis", role: "C" as const, club: "Club Delta" };
    const other = { name: "De Fittizio", role: "C" as const, club: "Club Delta" };
    const withTarget = [target, other];
    expect(filterListonePool(withTarget, { ...noFilter, text: "de sintetis" }, new Set())).toEqual([target]);
    expect(filterListonePool(withTarget, { ...noFilter, text: "de-sintetis" }, new Set())).toEqual([target]);
  });
});

describe("listoneRowHtml — Assegnato badge", () => {
  const columns = listoneColumns([]);

  it("shows no badge by default", () => {
    const html = listoneRowHtml(VALID_PLAYER, columns);
    expect(html).not.toContain("Assegnato");
  });

  it("shows an Assegnato badge next to the name when isAssigned is true", () => {
    const html = listoneRowHtml(VALID_PLAYER, columns, true);
    expect(html).toContain("Assegnato");
  });
});

// ── Indice di appetibilità (display-only) ─────────────────────────────────────

const INDEX_RECIPE = "APPEAL-INDEX-RECIPE@1.0.0";

function withIndex(
  name: string,
  score: number | null,
  quality = "sperimentale — evidenza scouting, non validato",
  recipe = INDEX_RECIPE,
) {
  return {
    name,
    role: "D",
    club: "Club Beta",
    quotation: 10,
    appealIndex: { score, quality, recipe, components: { appetibilitaBase: score, rischio: 40 } },
  } as const;
}

describe("appeal index — pool validation", () => {
  it("accepts a served index and keeps every qualifier attached to the number", () => {
    const result = validateListonePool([withIndex("Test Uno", 72.5)]);
    expect(result.ok).toBe(true);
    const player = (result as { pool: ReturnType<typeof parseListonePool> }).pool![0]!;
    expect(player.appealIndex?.score).toBe(72.5);
    expect(player.appealIndex?.recipe).toBe(INDEX_RECIPE);
    expect(player.appealIndex?.quality).toContain("non validato");
  });

  it("accepts a withheld verdict as a first-class value", () => {
    expect(validateListonePool([withIndex("Test Uno", null)]).ok).toBe(true);
  });

  it("refuses the whole pool when the index carries no quality label", () => {
    const row = { ...withIndex("Test Uno", 50), appealIndex: { score: 50, quality: "  ", recipe: INDEX_RECIPE, components: { appetibilitaBase: 50 } } };
    expect(validateListonePool([row])).toEqual({ ok: false, reason: "invalid-shape" });
  });

  it("refuses the whole pool when the index carries no recipe version", () => {
    const row = { ...withIndex("Test Uno", 50), appealIndex: { score: 50, quality: "sperimentale", recipe: "", components: { appetibilitaBase: 50 } } };
    expect(validateListonePool([row])).toEqual({ ok: false, reason: "invalid-shape" });
  });

  it("refuses a score outside the declared 0–100 scale", () => {
    for (const score of [-1, 101, Number.NaN]) {
      const row = { ...withIndex("Test Uno", 50), appealIndex: { score, quality: "q", recipe: INDEX_RECIPE, components: { appetibilitaBase: 0 } } };
      expect(validateListonePool([row]).ok).toBe(false);
    }
  });

  it("refuses an index with no components at all", () => {
    const row = { ...withIndex("Test Uno", 50), appealIndex: { score: 50, quality: "q", recipe: INDEX_RECIPE, components: {} } };
    expect(validateListonePool([row]).ok).toBe(false);
  });

  it("refuses rows mixing two recipe versions instead of naming one of them", () => {
    const result = validateListonePool([
      withIndex("Test Uno", 60),
      withIndex("Test Due", 40, "sperimentale", "APPEAL-INDEX-RECIPE@2.0.0"),
    ]);
    expect(result).toEqual({ ok: false, reason: "inconsistent-appeal-index" });
  });
});

describe("appeal index — column and rendering", () => {
  const pool = parseListonePool([withIndex("Test Uno", 72.5), withIndex("Test Due", null)])!;

  it("adds the Indice column only for a pool that carries one", () => {
    expect(listoneColumns(pool).map((c) => c.key)).toContain(APPEAL_INDEX_COLUMN_KEY);
    expect(listoneColumns([VALID_PLAYER]).map((c) => c.key)).not.toContain(APPEAL_INDEX_COLUMN_KEY);
    expect(poolHasAppealIndex([VALID_PLAYER])).toBe(false);
  });

  it("shows the column by default, so it is visible without opening the picker", () => {
    expect(defaultVisibleColumnKeys(pool)).toContain(APPEAL_INDEX_COLUMN_KEY);
    // AGGIORNATA IL 2026-08-24: l'uguaglianza con l'elenco intero non regge
    // più perché l'indice È dentro `DEFAULT_VISIBLE_COLUMN_KEYS` (quarta
    // colonna dell'elenco di Pico) mentre la sua COLONNA esiste solo per un
    // pool che ne porti uno. La regola invariata — «senza indice non c'è
    // colonna» — si asserisce così, senza ammorbidirla.
    expect(defaultVisibleColumnKeys([VALID_PLAYER])).not.toContain(APPEAL_INDEX_COLUMN_KEY);
    expect(defaultVisibleColumnKeys([VALID_PLAYER])).toEqual(
      DEFAULT_VISIBLE_COLUMN_KEYS.filter((k) => k !== APPEAL_INDEX_COLUMN_KEY),
    );
  });

  it("keeps the index in fourth place, right after nome/ruolo/squadra", () => {
    expect(defaultVisibleColumnKeys(pool).indexOf(APPEAL_INDEX_COLUMN_KEY)).toBe(3);
    expect(listoneColumns(pool).map((c) => c.key).indexOf(APPEAL_INDEX_COLUMN_KEY)).toBe(3);
  });

  it("rounds only at render time and never invents a value for a withheld verdict", () => {
    const column = listoneColumns(pool).find((c) => c.key === APPEAL_INDEX_COLUMN_KEY)!;
    expect(listoneCellValue(pool[0]!, APPEAL_INDEX_COLUMN_KEY)).toBe(72.5);
    expect(listoneRowHtml(pool[0]!, [column])).toContain(">73<");
    expect(listoneRowHtml(pool[1]!, [column])).toContain(">n/d<");
    expect(listoneCellValue(pool[1]!, APPEAL_INDEX_COLUMN_KEY)).toBeUndefined();
  });

  it("sorts a withheld verdict last in both directions", () => {
    expect(sortListonePool(pool, APPEAL_INDEX_COLUMN_KEY, "asc").map((p) => p.name)).toEqual([
      "Test Uno", "Test Due",
    ]);
    expect(sortListonePool(pool, APPEAL_INDEX_COLUMN_KEY, "desc").map((p) => p.name)).toEqual([
      "Test Uno", "Test Due",
    ]);
  });

  it("explains the column without claiming anything the data did not say", () => {
    const column = listoneColumns(pool).find((c) => c.key === APPEAL_INDEX_COLUMN_KEY)!;
    expect(column.label).toBe("Indice");
    const tooltip = listoneColumnTooltip(column);
    expect(tooltip).toContain("coorte");
    expect(tooltip).toContain("n/d");
    expect(tooltip).not.toContain("colonna aggiuntiva dal file caricato");
  });
});

describe("listoneAppealIndexNote", () => {
  it("is null when nothing on screen carries an index", () => {
    expect(listoneAppealIndexNote(parseListonePool([VALID_PLAYER])!)).toBeNull();
  });

  it("states the recipe, the quality labels and how many rows have no verdict", () => {
    const pool = parseListonePool([withIndex("Test Uno", 72.5), withIndex("Test Due", null)])!;
    const note = listoneAppealIndexNote(pool)!;
    expect(note).toContain(INDEX_RECIPE);
    expect(note).toContain("non validato");
    expect(note).toContain("1 con verdetto, 1 n/d");
    expect(note).toContain("non usato dal motore decisionale");
  });
});

// ── LE OTTO COLONNE DEL GRUPPO ESPERTI ───────────────────────────────────────
//
// Richiesta del committente, 2026-08-24. Cinque VOTI su 10 (Titolarità, Media
// voto, Salute, No malus / Bonus, Consiglio esperti) e TRE SEGNALI di scheda
// ordinati (rigorista, punizioni, angoli). I voti non sono ancora estratti: il valore di quelle
// caselle è oggi sempre assente, e la prova che conta è che l'assenza si
// scriva `n/d` e non uno zero, un trattino o una media.

const KEEPER: ListonePlayer = { name: "Test Portiere", role: "P", club: "Club Alfa", quotation: 5 };

/** Un lookup che risponde solo su una riga — ogni altra riga resta senza segnali. */
function signalsFor(
  name: string,
  signals: {
    rigori?: string | null;
    punizioni?: string | null;
    angoli?: string | null;
    voti?: Record<string, number>;
  },
): ListoneRowSignalsLookup {
  return (p) =>
    p.name === name
      ? {
          rigori: signals.rigori ?? null,
          punizioni: signals.punizioni ?? null,
          angoli: signals.angoli ?? null,
          // I voti arrivano dal deposito già risolti dal contratto: qui si
          // risolve la stessa forma che `resolveExpertInsight` consegna a
          // main.ts, così il test non inventa una seconda strada per i numeri.
          pagella: resolvePagella({ voti: signals.voti ?? {} } as PagellaScheda, p.role),
        }
      : emptyRowSignals(p.role);
}

const columnByKey = (key: string): ListoneColumn =>
  listoneColumns([]).find((c) => c.key === key) as ListoneColumn;

describe("colonne del Gruppo Esperti — un voto assente è n/d, mai uno zero", () => {
  it("renders every one of the five votes as n/d when nothing has been extracted", () => {
    for (const key of EXPERT_VOTE_COLUMN_KEYS) {
      expect(listoneCellText(VALID_PLAYER, key)).toBe(VALUE_NOT_AVAILABLE);
      expect(listoneCellValue(VALID_PLAYER, key)).toBeUndefined();
    }
  });

  it("never renders 0, an em dash or a midpoint for a missing vote", () => {
    const columns = EXPERT_VOTE_COLUMN_KEYS.map((key) => columnByKey(key));
    const html = listoneRowHtml(VALID_PLAYER, columns);
    expect(html).not.toContain(">0<");
    expect(html).not.toContain(">—<");
    expect(html).not.toContain(">5<");
    expect(html.match(/>n\/d</g)).toHaveLength(EXPERT_VOTE_COLUMN_KEYS.length);
  });

  it("renders a vote that HAS been extracted as the plain number", () => {
    const signals = signalsFor(VALID_PLAYER.name, { voti: { pagella_salute: 7 } });
    expect(listoneCellText(VALID_PLAYER, "pagella_salute", signals)).toBe("7");
    // Le altre quattro restano assenti: un voto non tira gli altri con sé.
    expect(listoneCellText(VALID_PLAYER, "pagella_media_voto", signals)).toBe(VALUE_NOT_AVAILABLE);
  });

  it("says n/d — not a dash — for the three ordered signals with no scheda", () => {
    for (const key of [RIGORISTA_COLUMN_KEY, PUNIZIONI_COLUMN_KEY, ANGOLI_COLUMN_KEY]) {
      expect(listoneCellText(VALID_PLAYER, key)).toBe(VALUE_NOT_AVAILABLE);
    }
  });

  it("renders the three ordered signals from the scheda, each in its own column", () => {
    const signals = signalsFor(VALID_PLAYER.name, {
      rigori: "1\u00b0 designato",
      punizioni: "2\u00b0 battitore",
      angoli: "battitore",
    });
    expect(listoneCellText(VALID_PLAYER, RIGORISTA_COLUMN_KEY, signals)).toBe("1\u00b0 designato");
    expect(listoneCellText(VALID_PLAYER, PUNIZIONI_COLUMN_KEY, signals)).toBe("2\u00b0 battitore");
    // La fila dichiarata SENZA ordine non diventa un «1°» di comodo: resta la
    // sola parola, e non è `n/d` — che direbbe un'altra cosa.
    expect(listoneCellText(VALID_PLAYER, ANGOLI_COLUMN_KEY, signals)).toBe("battitore");
  });

  // L'ORDINAMENTO DELLA COLONNA È L'ORDINE DELLA FILA, ed è la ragione per cui
  // il numero sta DAVANTI alla parola e non in coda fra parentesi.
  it("sorts a queue column by rank: 1° before 2°, the unranked after both", () => {
    const pool = [
      VALID_PLAYER,
      KEEPER,
      { name: "Test Terzo", role: "C", club: "Club Gamma" },
    ] as const;
    const signals: ListoneRowSignalsLookup = (p) => ({
      ...emptyRowSignals(p.role),
      angoli:
        p.name === VALID_PLAYER.name
          ? "2\u00b0 battitore"
          : p.name === KEEPER.name
            ? "1\u00b0 battitore"
            : "battitore",
    });
    expect(sortListonePool(pool, ANGOLI_COLUMN_KEY, "asc", signals).map((p) => p.name)).toEqual([
      KEEPER.name,
      VALID_PLAYER.name,
      "Test Terzo",
    ]);
  });

  it("keeps a missing extra column on the em dash — that hole belongs to the file", () => {
    // La differenza è deliberata: `n/d` dichiara una fonte che non ha ancora
    // risposto, il trattino una casella vuota del file caricato.
    const pool = parseListonePool([{ ...VALID_PLAYER, fvm: 9 }, { name: "T2", role: "P", club: "C2" }])!;
    expect(listoneCellText(pool[1]!, "fvm")).toBe("—");
  });

  it("sorts rows without a signal last, in both directions", () => {
    const pool = [VALID_PLAYER, KEEPER] as const;
    const signals = signalsFor(KEEPER.name, { rigori: "designato" });
    expect(sortListonePool(pool, RIGORISTA_COLUMN_KEY, "asc", signals).map((p) => p.name)).toEqual([
      KEEPER.name,
      VALID_PLAYER.name,
    ]);
    expect(sortListonePool(pool, RIGORISTA_COLUMN_KEY, "desc", signals).map((p) => p.name)).toEqual([
      KEEPER.name,
      VALID_PLAYER.name,
    ]);
  });

  it("sorts the five votes numerically, missing votes last", () => {
    const pool = [VALID_PLAYER, KEEPER] as const;
    const signals: ListoneRowSignalsLookup = (p) =>
      p.name === KEEPER.name
        ? { ...emptyRowSignals(p.role), pagella: resolvePagella({ voti: { pagella_salute: 3 } }, p.role) }
        : { ...emptyRowSignals(p.role), pagella: resolvePagella({ voti: { pagella_salute: 9 } }, p.role) };
    expect(sortListonePool(pool, "pagella_salute", "asc", signals).map((p) => p.name)).toEqual([
      KEEPER.name,
      VALID_PLAYER.name,
    ]);
  });
});

describe("«No malus / Bonus» — una colonna sola, due nomi di ruolo", () => {
  const column = columnByKey(NO_MALUS_BONUS_COLUMN_KEY);

  it("is ONE column, not two", () => {
    const keys = listoneColumns([]).map((c) => c.key);
    expect(keys.filter((k) => k === NO_MALUS_BONUS_COLUMN_KEY)).toHaveLength(1);
    expect(keys).not.toContain("pagella_porta_inviolata");
    expect(keys).not.toContain("pagella_bonus");
  });

  it("carries BOTH words in the shared header — a column over mixed roles cannot pick one", () => {
    expect(column.label).toBe("No malus / Bonus");
  });

  it("carries only the row's own word on the row itself", () => {
    expect(listoneColumnLabelForRole(column, "P")).toBe("No malus");
    for (const role of ["D", "C", "A"] as const) {
      expect(listoneColumnLabelForRole(column, role)).toBe("Bonus");
    }
  });

  it("puts that per-row word in the cell, so a phone card never shows the other role's word", () => {
    const keeperHtml = listoneRowHtml(KEEPER, [column]);
    expect(keeperHtml).toContain('data-label="No malus"');
    expect(keeperHtml).not.toContain('data-label="Bonus"');
    const strikerHtml = listoneRowHtml(VALID_PLAYER, [column]);
    expect(strikerHtml).toContain('data-label="Bonus"');
    expect(strikerHtml).not.toContain('data-label="No malus"');
  });

  it("leaves every other column's label alone, whatever the role", () => {
    for (const key of SIGNAL_COLUMN_KEYS.filter((k) => k !== NO_MALUS_BONUS_COLUMN_KEY)) {
      const col = columnByKey(key);
      expect(listoneColumnLabelForRole(col, "P")).toBe(col.label);
      expect(listoneColumnLabelForRole(col, "A")).toBe(col.label);
    }
  });

  it("explains in the tooltip which word belongs to which role", () => {
    const tooltip = listoneColumnTooltip(column);
    expect(tooltip).toContain("No malus");
    expect(tooltip).toContain("Bonus");
    expect(tooltip).toContain("portiere");
    expect(tooltip).not.toContain("colonna aggiuntiva dal file caricato");
  });
});

describe("ogni casella si porta la propria etichetta (resa stretta)", () => {
  it("marks every cell with its column key and its row-correct label", () => {
    const columns = listoneColumns([]);
    const html = listoneRowHtml(KEEPER, columns);
    for (const col of columns) {
      expect(html).toContain(`data-col="${col.key}"`);
    }
    expect(html).toContain('data-label="Nome"');
    expect(html).toContain('data-label="No malus"');
  });

  it("HTML-escapes the two new attributes too (defense in depth)", () => {
    // `data-col` porta la chiave della colonna, che per una colonna extra è
    // un'intestazione arrivata da un file caricato: una virgoletta lì dentro
    // uscirebbe dall'attributo.
    const pool = parseListonePool([{ ...VALID_PLAYER, 'x" onmouseover="alert(1)': 3 }])!;
    const cols = listoneColumns(pool);
    const html = listoneRowHtml(pool[0]!, cols);
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain("&quot;");
  });

  it("carries the width as a custom property, so a stylesheet can override the layout", () => {
    // Uno `style="flex:2"` inline batte qualunque foglio di stile: sotto i
    // 900px la resa stretta deve poter ridisporre le celle, quindi il
    // rapporto viaggia in `--col-flex` e la disposizione resta al CSS.
    const html = listoneRowHtml(VALID_PLAYER, listoneColumns([]));
    expect(html).toContain("--col-flex:2");
    expect(html).not.toContain("style=\"flex:");
  });
});

describe("listoneExpertSignalsNote", () => {
  it("says out loud that the five votes are not extracted yet", () => {
    const note = listoneExpertSignalsNote([]);
    expect(note).toContain("NON sono ancora estratti");
    expect(note).toContain(VALUE_NOT_AVAILABLE);
    expect(note).toContain("mai uno zero");
    expect(note).toContain("0–10");
  });

  it("stops claiming the absence once the votes are there", () => {
    const note = listoneExpertSignalsNote([resolvePagella(FULL_PAGELLA, "D")]);
    expect(note).not.toContain("NON sono ancora estratti");
    expect(note).toContain("0–10");
  });

  it("states the two meanings of the fourth axis and never turns directive", () => {
    const note = listoneExpertSignalsNote([]);
    expect(note).toContain("No malus");
    expect(note).toContain("Bonus");
    expect(note).toContain("non usato dal motore decisionale");
    for (const word of ["prezzo", "consigliato", "target", "fair"]) {
      expect(note.toLowerCase()).not.toContain(word);
    }
  });
});

// ── PREVISIONI DEL MOTORE (GEN-PROTOCOL-A) — contratto di sola lettura ────────
//
// FIXTURE SINTETICHE, come tutto il resto di questo file: nomi inventati, numeri
// inventati, nessuna quotazione reale e nessun run reale.

const GEN_RECIPE = "GEN-RECIPE@1.0.0";
const GEN_PROTOCOL = "2.1.3";
const GEN_RUN = "refit-0000synthetic";

function genTarget(value: number, extra: Record<string, unknown> = {}) {
  return { value, interval: null, status: "winner", ...extra };
}

/** Il payload del contratto, alla lettera. Ogni caso di rifiuto qui sotto parte
 *  da questo e cambia UNA cosa sola. */
function withForecast(
  name: string,
  targets: Record<string, unknown> = {
    T2: genTarget(6.42),
    TN: genTarget(24.1, { capApplied: false }),
    T1: genTarget(154.8),
  },
  meta: Record<string, unknown> = {},
) {
  return {
    name,
    role: "C",
    club: "Club Gamma",
    quotation: 20,
    genForecast: {
      recipeVersion: GEN_RECIPE,
      protocolVersion: GEN_PROTOCOL,
      runId: GEN_RUN,
      authority: "advisory",
      targets,
      ...meta,
    },
  };
}

describe("gen forecast — pool validation", () => {
  it("accepts the served payload and keeps every qualifier attached to the numbers", () => {
    const result = validateListonePool([withForecast("Sintetico Uno")]);
    expect(result.ok).toBe(true);
    const player = (result as { pool: ListonePlayer[] }).pool[0]!;
    expect(player.genForecast?.recipeVersion).toBe(GEN_RECIPE);
    expect(player.genForecast?.protocolVersion).toBe(GEN_PROTOCOL);
    expect(player.genForecast?.runId).toBe(GEN_RUN);
    expect(player.genForecast?.authority).toBe(GEN_FORECAST_AUTHORITY_ADVISORY);
    expect(player.genForecast?.targets.T2.value).toBe(6.42);
    expect(player.genForecast?.targets.TN.value).toBe(24.1);
    expect(player.genForecast?.targets.T1.value).toBe(154.8);
    expect(player.genForecast?.targets.TN.capApplied).toBe(false);
    expect(player.genForecast?.targets.T2.interval).toBeNull();
  });

  it("accepts a row with no forecast at all — a player the deposit cannot serve", () => {
    const result = validateListonePool([VALID_PLAYER, withForecast("Sintetico Uno")]);
    expect(result.ok).toBe(true);
    expect((result as { pool: ListonePlayer[] }).pool[0]!.genForecast).toBeUndefined();
  });

  it("refuses the whole pool when one of the three targets is missing", () => {
    const result = validateListonePool([
      withForecast("Sintetico Uno", { T2: genTarget(6.42), TN: genTarget(24.1) }),
    ]);
    expect(result).toEqual({ ok: false, reason: "invalid-shape" });
  });

  it("refuses a value that is not a finite number", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "6.42" as unknown as number]) {
      const result = validateListonePool([
        withForecast("Sintetico Uno", {
          T2: genTarget(value as number),
          TN: genTarget(24.1),
          T1: genTarget(154.8),
        }),
      ]);
      expect(result).toEqual({ ok: false, reason: "invalid-shape" });
    }
  });

  it("refuses a status outside the declared vocabulary — NO_VERDICT included", () => {
    for (const status of ["NO_VERDICT", "vincitore", "", "B1"]) {
      const result = validateListonePool([
        withForecast("Sintetico Uno", {
          T2: { value: 6.42, interval: null, status },
          TN: genTarget(24.1),
          T1: genTarget(154.8),
        }),
      ]);
      expect(result).toEqual({ ok: false, reason: "invalid-shape" });
    }
    // «B0» invece è nel vocabolario e passa: è lo stato di un bersaglio che il
    // dato dichiara, non un errore da nascondere.
    expect(
      validateListonePool([
        withForecast("Sintetico Uno", {
          T2: { value: 6.42, interval: null, status: "B0" },
          TN: genTarget(24.1),
          T1: genTarget(154.8),
        }),
      ]).ok,
    ).toBe(true);
  });

  it("refuses any authority the gate has not opened — the label is never hardcoded", () => {
    for (const authority of ["direttivo", "directive", "advisory ", "", null, undefined]) {
      const result = validateListonePool([
        withForecast("Sintetico Uno", undefined, { authority }),
      ]);
      expect(result).toEqual({ ok: false, reason: "invalid-shape" });
    }
  });

  it("refuses the cap flag anywhere but on TN, and refuses a non-boolean cap", () => {
    for (const targets of [
      { T2: genTarget(6.42, { capApplied: true }), TN: genTarget(24.1), T1: genTarget(154.8) },
      { T2: genTarget(6.42), TN: genTarget(24.1), T1: genTarget(154.8, { capApplied: false }) },
      { T2: genTarget(6.42), TN: genTarget(24.1, { capApplied: "si" }), T1: genTarget(154.8) },
    ]) {
      expect(validateListonePool([withForecast("Sintetico Uno", targets)])).toEqual({
        ok: false,
        reason: "invalid-shape",
      });
    }
  });

  it("refuses a malformed interval, and accepts the two shapes the contract declares", () => {
    const bad = [
      { lo: 6.8, hi: 6.1 },
      { lo: 6.1 },
      { lo: 6.1, hi: 6.8, livello: 0.9 },
      { lo: "6.1", hi: 6.8 },
      6.1,
    ];
    for (const interval of bad) {
      const result = validateListonePool([
        withForecast("Sintetico Uno", {
          T2: { value: 6.42, interval, status: "winner" },
          TN: genTarget(24.1),
          T1: genTarget(154.8),
        }),
      ]);
      expect(result).toEqual({ ok: false, reason: "invalid-shape" });
    }
    // `null` è la forma di oggi; `{lo, hi}` è quella che il formato di
    // trasporto prevede, e un payload valido non deve mai essere rifiutato.
    for (const interval of [null, { lo: 6.1, hi: 6.8 }]) {
      expect(
        validateListonePool([
          withForecast("Sintetico Uno", {
            T2: { value: 6.42, interval, status: "winner" },
            TN: genTarget(24.1),
            T1: genTarget(154.8),
          }),
        ]).ok,
      ).toBe(true);
    }
  });

  it("refuses an empty recipe, protocol or run — a number without its run is not inspectable", () => {
    for (const meta of [{ recipeVersion: "" }, { protocolVersion: "  " }, { runId: "" }]) {
      expect(validateListonePool([withForecast("Sintetico Uno", undefined, meta)])).toEqual({
        ok: false,
        reason: "invalid-shape",
      });
    }
  });

  it("ignores what it does not recognise instead of copying it into the pool", () => {
    const result = validateListonePool([
      withForecast(
        "Sintetico Uno",
        { T2: genTarget(6.42), TN: genTarget(24.1), T1: genTarget(154.8), T3: genTarget(9) },
        { servedBy: "qualcosa-che-questo-file-non-conosce" },
      ),
    ]);
    expect(result.ok).toBe(true);
    const forecast = (result as { pool: ListonePlayer[] }).pool[0]!.genForecast!;
    expect(Object.keys(forecast).sort()).toEqual([
      "authority",
      "protocolVersion",
      "recipeVersion",
      "runId",
      "targets",
    ]);
    expect(Object.keys(forecast.targets).sort()).toEqual(["T1", "T2", "TN"]);
  });

  it("refuses rows from two different runs instead of naming one of them", () => {
    for (const meta of [
      { recipeVersion: "GEN-RECIPE@2.0.0" },
      { protocolVersion: "2.1.4" },
      { runId: "refit-1111synthetic" },
    ]) {
      const result = validateListonePool([
        withForecast("Sintetico Uno"),
        { ...withForecast("Sintetico Due", undefined, meta), name: "Sintetico Due" },
      ]);
      expect(result).toEqual({ ok: false, reason: "inconsistent-gen-forecast" });
    }
  });

  it("keeps `genForecast` out of the extra columns — it is a field, not a cell", () => {
    const pool = parseListonePool([withForecast("Sintetico Uno")])!;
    expect(pool[0]!.extra).toBeUndefined();
  });
});

describe("gen forecast — columns", () => {
  const pool = parseListonePool([
    withForecast("Sintetico Uno"),
    { ...VALID_PLAYER, name: "Sintetico Due" },
  ])!;

  it("adds the three columns only for a pool that carries a forecast", () => {
    const keys = listoneColumns(pool).map((c) => c.key);
    for (const key of GEN_FORECAST_COLUMN_KEYS) expect(keys).toContain(key);
    expect(poolHasGenForecast(pool)).toBe(true);
    const withoutKeys = listoneColumns([VALID_PLAYER]).map((c) => c.key);
    for (const key of GEN_FORECAST_COLUMN_KEYS) expect(withoutKeys).not.toContain(key);
    expect(poolHasGenForecast([VALID_PLAYER])).toBe(false);
  });

  it("puts them right after the Indice column, in target order", () => {
    const indexed = parseListonePool([
      { ...withForecast("Sintetico Uno"), appealIndex: { score: 70, quality: "q", recipe: INDEX_RECIPE, components: { base: 70 } } },
    ])!;
    const keys = listoneColumns(indexed).map((c) => c.key);
    expect(keys.indexOf(APPEAL_INDEX_COLUMN_KEY)).toBe(3);
    expect(keys.slice(4, 7)).toEqual([...GEN_FORECAST_COLUMN_KEYS]);
    // Senza indice restano comunque subito dopo le tre colonne d'identità.
    expect(listoneColumns(pool).map((c) => c.key).slice(3, 6)).toEqual([...GEN_FORECAST_COLUMN_KEYS]);
  });

  it("keeps them OFF by default — Pico's eleven-column list decides what is on", () => {
    for (const key of GEN_FORECAST_COLUMN_KEYS) {
      expect(DEFAULT_VISIBLE_COLUMN_KEYS).not.toContain(key);
      expect(defaultVisibleColumnKeys(pool)).not.toContain(key);
    }
  });

  it("reserves the three keys, so a loaded file cannot create a second column with the same name", () => {
    const collision = parseListonePool([
      { ...VALID_PLAYER, [GEN_FORECAST_COLUMN_KEY_BY_TARGET.T2]: 99 },
    ])!;
    expect(collision[0]!.extra?.[GEN_FORECAST_COLUMN_KEY_BY_TARGET.T2]).toBe(99);
    const keys = listoneColumns(collision).map((c) => c.key);
    expect(keys.filter((k) => k === GEN_FORECAST_COLUMN_KEY_BY_TARGET.T2)).toEqual([]);
  });

  it("explains each column without claiming anything the data did not say", () => {
    const columns = listoneColumns(pool);
    for (const target of GEN_FORECAST_TARGET_IDS) {
      const column = columns.find((c) => c.key === GEN_FORECAST_COLUMN_KEY_BY_TARGET[target])!;
      expect(column.label).toBe(GEN_FORECAST_COLUMN_LABELS[target]);
      const tooltip = listoneColumnTooltip(column);
      expect(tooltip).toContain("advisory");
      expect(tooltip).toContain(VALUE_NOT_AVAILABLE);
      expect(tooltip).not.toContain("colonna aggiuntiva dal file caricato");
    }
  });
});

describe("gen forecast — rendering and sorting", () => {
  const pool = parseListonePool([
    withForecast("Sintetico Uno"),
    { ...VALID_PLAYER, name: "Sintetico Due" },
  ])!;
  const withForecastRow = pool[0]!;
  const withoutForecastRow = pool[1]!;
  const columns = listoneColumns(pool);
  const column = (target: "T2" | "TN" | "T1"): ListoneColumn =>
    columns.find((c) => c.key === GEN_FORECAST_COLUMN_KEY_BY_TARGET[target])!;

  it("rounds only at render time: one decimal for T2, whole numbers for TN and T1", () => {
    expect(listoneCellText(withForecastRow, GEN_FORECAST_COLUMN_KEY_BY_TARGET.T2)).toBe("6,4");
    expect(listoneCellText(withForecastRow, GEN_FORECAST_COLUMN_KEY_BY_TARGET.TN)).toBe("24");
    expect(listoneCellText(withForecastRow, GEN_FORECAST_COLUMN_KEY_BY_TARGET.T1)).toBe("155");
    // Il dato conserva la precisione servita: l'ordinamento distingue ciò che
    // la resa arrotonda.
    expect(listoneCellValue(withForecastRow, GEN_FORECAST_COLUMN_KEY_BY_TARGET.T2)).toBe(6.42);
    expect(listoneCellValue(withForecastRow, GEN_FORECAST_COLUMN_KEY_BY_TARGET.TN)).toBe(24.1);
  });

  it("says n/d for a row the deposit does not serve — never a zero, never a dash", () => {
    for (const target of GEN_FORECAST_TARGET_IDS) {
      const key = GEN_FORECAST_COLUMN_KEY_BY_TARGET[target];
      expect(listoneCellText(withoutForecastRow, key)).toBe(VALUE_NOT_AVAILABLE);
      expect(listoneCellValue(withoutForecastRow, key)).toBeUndefined();
      expect(listoneRowHtml(withoutForecastRow, [column(target)])).toContain(`>${VALUE_NOT_AVAILABLE}<`);
    }
  });

  it("marks the expert cap on TN only when the data declares it applied", () => {
    const capped = parseListonePool([
      withForecast("Sintetico Uno", {
        T2: genTarget(6.42),
        TN: genTarget(24.1, { capApplied: true }),
        T1: genTarget(154.8),
      }),
    ])!;
    const html = listoneRowHtml(capped[0]!, [column("TN")]);
    expect(html).toContain(GEN_FORECAST_CAP_MARKER);
    expect(html).toContain(GEN_FORECAST_CAP_LABEL);
    expect(genForecastCapApplied(capped[0]!, GEN_FORECAST_COLUMN_KEY_BY_TARGET.TN)).toBe(true);
    // Il testo della cella resta la sola cifra: il marcatore è un elemento.
    expect(listoneCellText(capped[0]!, GEN_FORECAST_COLUMN_KEY_BY_TARGET.TN)).toBe("24");
    // `capApplied: false` e una riga senza previsione non portano nessun segno.
    expect(listoneRowHtml(withForecastRow, [column("TN")])).not.toContain(GEN_FORECAST_CAP_MARKER);
    expect(listoneRowHtml(withoutForecastRow, [column("TN")])).not.toContain(GEN_FORECAST_CAP_MARKER);
    expect(genForecastCapApplied(withForecastRow, GEN_FORECAST_COLUMN_KEY_BY_TARGET.TN)).toBe(false);
    // E il tetto non contamina le altre due colonne.
    expect(listoneRowHtml(capped[0]!, [column("T2")])).not.toContain(GEN_FORECAST_CAP_MARKER);
  });

  it("sorts on the served value and puts a row with no forecast last in both directions", () => {
    const key = GEN_FORECAST_COLUMN_KEY_BY_TARGET.T1;
    const three = parseListonePool([
      withForecast("Sintetico Uno"),
      { ...withForecast("Sintetico Tre", { T2: genTarget(5.9), TN: genTarget(30), T1: genTarget(180.2) }), name: "Sintetico Tre" },
      { ...VALID_PLAYER, name: "Sintetico Due" },
    ])!;
    expect(sortListonePool(three, key, "asc").map((p) => p.name)).toEqual([
      "Sintetico Uno",
      "Sintetico Tre",
      "Sintetico Due",
    ]);
    expect(sortListonePool(three, key, "desc").map((p) => p.name)).toEqual([
      "Sintetico Tre",
      "Sintetico Uno",
      "Sintetico Due",
    ]);
  });
});

describe("listoneGenForecastNote", () => {
  it("says nothing when there is nothing to qualify", () => {
    expect(listoneGenForecastNote([])).toBeNull();
    expect(listoneGenForecastNote([VALID_PLAYER])).toBeNull();
  });

  it("names recipe, protocol, run and authority, all carried by the rows", () => {
    const pool = parseListonePool([
      withForecast("Sintetico Uno"),
      { ...VALID_PLAYER, name: "Sintetico Due" },
    ])!;
    const note = listoneGenForecastNote(pool)!;
    expect(note).toContain(GEN_RECIPE);
    expect(note).toContain(GEN_PROTOCOL);
    expect(note).toContain(GEN_RUN);
    expect(note).toContain(GEN_FORECAST_AUTHORITY_ADVISORY);
    expect(note).toContain("1 righe con previsione, 1 senza");
    expect(note).toContain("non usato dal motore decisionale");
    expect(note).toContain("Colonne visibili");
  });

  it("counts the applied caps and the non-winner targets, and never turns directive", () => {
    const pool = parseListonePool([
      withForecast("Sintetico Uno", {
        T2: { value: 6.42, interval: null, status: "B0" },
        TN: genTarget(24.1, { capApplied: true }),
        T1: genTarget(154.8),
      }),
    ])!;
    const note = listoneGenForecastNote(pool)!;
    expect(note).toContain(`(${GEN_FORECAST_CAP_MARKER}): 1`);
    expect(note).toContain("non «winner»: 1");
    for (const word of ["prezzo", "consigliato", "target_band", "fair"]) {
      expect(note.toLowerCase()).not.toContain(word);
    }
  });
});

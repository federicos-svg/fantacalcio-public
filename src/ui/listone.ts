// Listone Svincolati — internal row shape + pure helpers for the display
// table (parsing, column model, sorting, cell/row formatting). UI-only:
// this type is deliberately separate from the engine's PoolPlayer
// (packages/engine/src/types.ts), which stays value-free and is never fed
// by this file. Rows here are for rendering only — never read by
// reduce/feasibility/auction logic, never promote any gate. See
// docs/data/LISTONE_UI_LOAD_CONTRACT.md for the JSON shape this expects.

import { type Role, ROLES } from "../../packages/engine/src/types.js";
import { C, escHtml, roleChipHtml } from "./theme.js";
import { clubBadgeHtml } from "./serieA.js";

export type ListoneCellValue = string | number;

/**
 * One row of the Listone Svincolati table. `name`/`role`/`club` are
 * required; `quotation` is optional. `extra` carries any additional
 * columns present in a full source file, copied verbatim from the loaded
 * JSON — never fabricated, never inferred. We don't hardcode specific
 * extra column names (e.g. guessed real-listone fields): this repo has
 * never parsed the real listone XLSX (it's handled as an opaque binary,
 * see docs/automation/N8N_LISTINO_PRICES_RUNBOOK.md), so any such name
 * would be a guess, not something "derived directly from the source
 * file". Extra columns are instead discovered from whatever keys the
 * loaded JSON rows actually contain.
 */
export interface ListonePlayer {
  /** Stable synthetic/proxy identifier when the source can provide one.
   * The final-listone collision audit remains DATA-05. */
  readonly proxyId?: string | number;
  readonly name: string;
  readonly role: Role;
  readonly club: string;
  readonly quotation?: number;
  readonly extra?: Readonly<Record<string, ListoneCellValue>>;
  /** Present only when the served payload carries one — see below. */
  readonly appealIndex?: ListoneAppealIndex;
}

/**
 * The appeal index of one row, exactly as the private deposit serves it.
 *
 * Every qualifier travels with the number: `quality` is the evidence label the
 * Algorithm Factory computed next to the score, `recipe` the version of the
 * composition recipe that produced it. Neither is ever written in this file —
 * the UI is not allowed to state (or omit) a caveat the data did not carry.
 * `score === null` is an honest "no verdict", rendered `n/d` and never
 * replaced by a default, a midpoint or a blank.
 *
 * Display-only, like the rest of the pool: it feeds no engine, no ranking, no
 * suggestion and promotes no gate. See docs/DECISIONS.md §"Eccezioni operative
 * scritte" (2026-08-12, indice di appetibilità display-only) and
 * docs/data/APPEAL_INDEX_SERVING_CONTRACT.md.
 */
export interface ListoneAppealIndex {
  readonly score: number | null;
  readonly quality: string;
  readonly recipe: string;
  readonly components: Readonly<Record<string, number | null>>;
}

export type ColumnKind = "string" | "number" | "role";
export type SortDirection = "asc" | "desc";

export interface ListoneColumn {
  readonly key: string; // "name" | "role" | "club" | "quotation" | an extra key
  readonly label: string;
  readonly kind: ColumnKind;
  readonly core: boolean;
}

export interface ListoneSort {
  readonly key: string;
  readonly direction: SortDirection;
}

const CORE_COLUMNS: readonly ListoneColumn[] = [
  { key: "name", label: "Nome", kind: "string", core: true },
  { key: "role", label: "Ruolo", kind: "role", core: true },
  { key: "club", label: "Squadra", kind: "string", core: true },
  { key: "quotation", label: "Quotazione", kind: "number", core: true },
];

/** Column key of the appeal index. Not a core column: it exists only when the
 *  served pool actually carries an index, and disappears with it. */
export const APPEAL_INDEX_COLUMN_KEY = "appealIndex";

const CORE_KEYS = new Set(CORE_COLUMNS.map((c) => c.key));
CORE_KEYS.add("proxyId");
CORE_KEYS.add(APPEAL_INDEX_COLUMN_KEY);

// Gate OFF means local/static display data cannot create decision surfaces by
// choosing a suggestive extra-column name. Reject the whole pool fail-closed.
// Exported so the runtime listone endpoint's own copy of this list
// (packages/listone-live-serve/src/depositPayload.ts, which cannot import this
// DOM-bound module into a Worker bundle) can be asserted equal to it in tests
// instead of drifting from it silently.
export const LISTONE_GATED_EXTRA_KEYS: readonly string[] = [
  "ranking",
  "rank",
  "projection",
  "projection_score",
  "modifier",
  "target_band",
  "stretch_cap",
  "ftm",
  "fair_to_me",
  "fair_to_me_max",
  "fair_to_me_max_raw",
  "fair_to_me_max_effective",
];

const GATED_EXTRA_KEYS = new Set(LISTONE_GATED_EXTRA_KEYS);

/** Invisible formatting characters (zero-width space/joiner, soft hyphen, word
 *  joiner, BOM, bidi controls). They carry no glyph, so a key that contains
 *  them is the same key on screen as one that does not. */
const FORMAT_CHARACTERS = /\p{Cf}/gu;

/** Combining marks, stripped after NFD: `Età` → `eta`, `ŕanking` → `ranking`. */
const COMBINING_MARKS = /\p{M}/gu;

/** A letter or a digit that is not `[a-z0-9]` after all the folding above —
 *  i.e. a script this filter cannot map onto the alphabet the gated list is
 *  written in. Cyrillic `т` renders as an ASCII `t`, and no Unicode
 *  normalization form turns it into one. */
const UNMAPPABLE_ALPHANUMERIC = /(?![a-z0-9])[\p{L}\p{N}]/u;

/** Anything that is not `[a-z0-9]`, collapsed to a single `_`. */
const SEPARATOR_RUN = /[^a-z0-9]+/g;

/**
 * Reduces an extra-column key to the ASCII alphabet `LISTONE_GATED_EXTRA_KEYS`
 * is written in, or returns `null` when the key cannot be expressed in that
 * alphabet at all.
 *
 * Allowlist-oriented on purpose (issue #225). Stripping a fixed list of
 * separators at the edges only thinned the bypass class — `FTM_`, `_ftm`,
 * `Target _Band`, `FTM:`, `ftm/`, `FTM!` all walked past it, and so did every
 * invisible or look-alike character. What has to be closed is the alphabet:
 * after the folding below a key is either plain `[a-z0-9_]`, and comparable
 * against the list, or it is refused.
 *
 * Each step answers a bypass verified by running it, not by assuming it:
 *  1. NFKC folds the compatibility forms that render as ASCII — fullwidth
 *     `ＦＴＭ`, mathematical `𝐟𝐭𝐦`, NBSP and ideographic space. It does *not*
 *     touch zero-width characters or cross-script look-alikes, so it is
 *     necessary and nowhere near sufficient.
 *  2. Format characters are deleted outright: they are invisible.
 *  3. NFD + mark stripping folds accents, real ones and decorative ones.
 *  4. Whatever letter or digit is still not `[a-z0-9]` cannot be proven
 *     different from the gated key it imitates, so the key is refused instead
 *     of being declared safe because the comparison failed (`null`).
 *  5. Every run of remaining non-alphanumerics becomes one `_`, edges dropped —
 *     so separators, whatever and however many, stop changing the answer.
 *  6. If nothing survives that (`"   "`, `"..."`, `"___"`, an emoji, a lone
 *     surrogate), the key carries no comparable content and is refused too.
 *     Not a hole — no gated key is empty — but the guard is what makes the
 *     sentence above *true*: the answer is the alphabet or `null`, never `""`.
 *
 * Kept in sync, character for character, with `normalizedDepositExtraKey` in
 * packages/listone-live-serve/src/depositPayload.ts — see the note on
 * `LISTONE_DEPOSIT_GATED_EXTRA_KEYS` for why that copy exists, and
 * tests/depositPayload.test.ts for the assertions that keep the two equal.
 */
export function normalizedListoneExtraKey(key: string): string | null {
  const folded = key
    .normalize("NFKC")
    .replace(FORMAT_CHARACTERS, "")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase();
  if (UNMAPPABLE_ALPHANUMERIC.test(folded)) return null;
  const normalized = folded.replace(SEPARATOR_RUN, "_").replace(/^_+|_+$/g, "");
  return normalized === "" ? null : normalized;
}

/** True when the key must be refused: it is a gated decision field, or it is
 *  not expressible in the alphabet that list is written in and therefore
 *  cannot be shown to be anything else. */
export function isGatedListoneExtraKey(key: string): boolean {
  const normalized = normalizedListoneExtraKey(key);
  return normalized === null || GATED_EXTRA_KEYS.has(normalized);
}

/** Columns shown by default — the 4 fields already established as the minimum shape. */
export const DEFAULT_VISIBLE_COLUMN_KEYS: readonly string[] = CORE_COLUMNS.map((c) => c.key);

/**
 * Default visible columns for a specific pool: the four core ones, plus the
 * appeal index when the pool carries it. Extra source columns stay hidden
 * behind the column picker as before — the index does not, because a column
 * nobody switches on is not "visible on the site".
 */
export function defaultVisibleColumnKeys(pool: readonly ListonePlayer[]): string[] {
  return [...DEFAULT_VISIBLE_COLUMN_KEYS, ...(poolHasAppealIndex(pool) ? [APPEAL_INDEX_COLUMN_KEY] : [])];
}

/** The one clause that is true of every pool, whatever loaded it — so the
 *  remote and fallback notes below can never drift on the part that matters. */
const DISPLAY_ONLY_CLAUSE = "Solo visualizzazione, non usato dal motore decisionale.";

/** True only of a pool that carries no appeal index. Kept separate from the
 *  clause above precisely so it disappears when it stops being true, instead
 *  of denying on screen a column the same screen is showing. */
const NO_APPEAL_INDEX_CLAUSE = "Nessuna appetibilità calcolata.";

const FALLBACK_PREFIX =
  "Listone 2025/26 — fallback temporaneo caricato automaticamente (o caricato/sostituito manualmente).";

/** Fixed, honest note shown whenever a pool without an index is on screen — see LISTONE_UI_LOAD_CONTRACT.md. */
export const LISTONE_FALLBACK_NOTE = `${FALLBACK_PREFIX} ${DISPLAY_ONLY_CLAUSE} ${NO_APPEAL_INDEX_CLAUSE}`;

function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

function isCellValue(v: unknown): v is ListoneCellValue {
  return typeof v === "string" || typeof v === "number";
}

function isScaleValue(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100);
}

/**
 * Same fail-closed posture as the rest of this validator: an index without its
 * quality label or recipe version, or with a value outside 0–100, invalidates
 * the whole pool rather than being shown stripped of what qualifies it.
 */
function isAppealIndex(v: unknown): v is ListoneAppealIndex {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (!isScaleValue(o.score)) return false;
  if (typeof o.quality !== "string" || o.quality.trim() === "") return false;
  if (typeof o.recipe !== "string" || o.recipe.trim() === "") return false;
  if (typeof o.components !== "object" || o.components === null || Array.isArray(o.components)) return false;
  const components = o.components as Record<string, unknown>;
  const names = Object.keys(components);
  if (names.length === 0) return false;
  return names.every((name) => isScaleValue(components[name]));
}

function isListonePlayer(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.name !== "string" || o.name.trim() === "") return false;
  if (!isRole(o.role)) return false;
  if (typeof o.club !== "string" || o.club.trim() === "") return false;
  if (
    o.proxyId !== undefined &&
    !(
      (typeof o.proxyId === "string" && o.proxyId.trim() !== "") ||
      (typeof o.proxyId === "number" && Number.isFinite(o.proxyId))
    )
  ) return false;
  // Number.isFinite + non-negative: quotation is display-only but is sorted
  // and rendered as text, so an Infinity/NaN/-50 slipping through (validator
  // otherwise fail-closed everywhere else — see isScaleValue above for the
  // appeal index) shows up verbatim on screen (audit r2 D9, probe C').
  // No upper bound and no Number.isInteger requirement: decimal quotations
  // are ordinary listone data, unlike the 0-100 appeal-index scale.
  if (
    o.quotation !== undefined &&
    (typeof o.quotation !== "number" || !Number.isFinite(o.quotation) || o.quotation < 0)
  ) return false;
  if (o.appealIndex !== undefined && !isAppealIndex(o.appealIndex)) return false;
  for (const key of Object.keys(o)) {
    if (CORE_KEYS.has(key)) continue;
    if (isGatedListoneExtraKey(key)) return false;
    // Extra column: only plain string/number allowed — nothing structural
    // (object/array/null) sneaks into the table as a "column".
    if (!isCellValue(o[key])) return false;
  }
  return true;
}

/**
 * Validates arbitrary parsed JSON as a listone pool. Returns null (not a
 * throw) on any shape mismatch — defense-in-depth against untrusted local
 * file content, same posture as the engine's voteRecordValidation. Rejects
 * the whole list if a single item is malformed — no partial load.
 */
export type ListonePoolValidation =
  | { readonly ok: true; readonly pool: ListonePlayer[] }
  | {
      readonly ok: false;
      readonly reason:
        | "invalid-shape"
        | "gated-field"
        | "duplicate-identity"
        | "ambiguous-identity"
        | "inconsistent-appeal-index"
        | "mixed-extra-column-type"
        | "mixed-identity-scheme";
      readonly identity?: string;
    };

export function validateListonePool(json: unknown): ListonePoolValidation {
  if (!Array.isArray(json)) return { ok: false, reason: "invalid-shape" };
  const out: ListonePlayer[] = [];
  for (const item of json) {
    if (typeof item === "object" && item !== null) {
      const gatedKey = Object.keys(item).find((key) => !CORE_KEYS.has(key) && isGatedListoneExtraKey(key));
      if (gatedKey) return { ok: false, reason: "gated-field", identity: gatedKey };
    }
    if (!isListonePlayer(item)) return { ok: false, reason: "invalid-shape" };
    const extraKeys = Object.keys(item).filter((k) => !CORE_KEYS.has(k));
    const player: ListonePlayer = {
      ...(item.proxyId !== undefined ? { proxyId: item.proxyId as string | number } : {}),
      name: item.name as string,
      role: item.role as Role,
      club: item.club as string,
      ...(item.quotation !== undefined ? { quotation: item.quotation as number } : {}),
      ...(item.appealIndex !== undefined ? { appealIndex: item.appealIndex as ListoneAppealIndex } : {}),
      ...(extraKeys.length > 0
        ? { extra: Object.fromEntries(extraKeys.map((k) => [k, item[k] as ListoneCellValue])) }
        : {}),
    };
    out.push(player);
  }
  // One pool is one Factory run, so it is one recipe. Two versions in the same
  // pool mean rows from different runs were mixed, and the note under the
  // table could no longer name the recipe the column was computed with.
  const recipes = new Set(out.flatMap((p) => (p.appealIndex ? [p.appealIndex.recipe] : [])));
  if (recipes.size > 1) return { ok: false, reason: "inconsistent-appeal-index" };
  // listonePlayerKey uses proxy:<id> when a row carries proxyId, and
  // <name>__<club> otherwise: the SAME physical player represented once with
  // proxyId and once without resolves to two different keys, so neither the
  // duplicate-identity nor the ambiguous-identity check below ever sees them
  // as the same row (audit r2 D8, probe S/Q — reachable only via manual
  // loading, since neither the private deposit nor the shipped asset emits
  // proxyId). Reject the mixed scheme itself, fail-closed, rather than trying
  // to detect the collision after the fact.
  if (out.some((p) => p.proxyId !== undefined) && out.some((p) => p.proxyId === undefined)) {
    return { ok: false, reason: "mixed-identity-scheme" };
  }
  // isCellValue accepts a string OR a number per cell, so nothing stopped the
  // same extra-column key from carrying both types across different rows.
  // sortListonePool then compares numerically only when BOTH sides of a pair
  // are numbers, string-compares otherwise: a non-transitive, non-reversible
  // comparator on that column (audit r2 D10, probe U — '10','2',9,100,'9'
  // sorted neither numerically nor lexicographically, and desc-reversed !=
  // asc). Reject fail-closed here instead: a column present on this pool
  // stays one type for every row that has it, same posture as the recipe
  // check above.
  const extraKeyKinds = new Map<string, "string" | "number">();
  for (const player of out) {
    if (!player.extra) continue;
    for (const [key, value] of Object.entries(player.extra)) {
      const kind = typeof value === "number" ? "number" : "string";
      const seen = extraKeyKinds.get(key);
      if (seen === undefined) {
        extraKeyKinds.set(key, kind);
      } else if (seen !== kind) {
        return { ok: false, reason: "mixed-extra-column-type", identity: key };
      }
    }
  }
  const identities = new Map<string, ListonePlayer>();
  for (const player of out) {
    const identity = listonePlayerKey(player);
    const existing = identities.get(identity);
    if (existing) {
      return {
        ok: false,
        reason: player.proxyId === undefined && existing.proxyId === undefined
          ? "ambiguous-identity"
          : "duplicate-identity",
        identity,
      };
    }
    identities.set(identity, player);
  }
  return { ok: true, pool: out };
}

export function parseListonePool(json: unknown): ListonePlayer[] | null {
  const result = validateListonePool(json);
  return result.ok ? result.pool : null;
}

/**
 * Parses raw JSON text (e.g. a file's contents, or a localStorage value)
 * into a validated pool, or null on any failure (bad JSON, wrong shape).
 * Pure — no I/O, no throw — used both for the manual file loader and for
 * restoring a previously-saved pool on app boot (see main.ts).
 */
export function parseListoneJsonText(text: string): ListonePlayer[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return parseListonePool(parsed);
}

/**
 * Where the pool currently on screen came from. `"remote"` is the private
 * deposit served by GET /api/listone; `"manual"` is the debug/override file
 * picker and is never produced by `resolveListonePool` — only set by the
 * caller that handled the upload (see main.ts loadPoolFromText).
 */
export type ListonePoolSource = "remote" | "static" | "local-storage" | "manual" | "none";

export interface ResolveListonePoolInput {
  /** Raw JSON text served by GET /api/listone, or null if it failed/is unavailable. */
  readonly remoteJsonText: string | null;
  /** Raw JSON text fetched from the shipped static asset, or null if the fetch failed/hasn't happened. */
  readonly staticJsonText: string | null;
  /** Raw JSON text previously saved to localStorage, or null if nothing saved. */
  readonly localStorageText: string | null;
}

export interface ResolvedListonePool {
  readonly pool: ListonePlayer[];
  readonly source: ListonePoolSource;
}

/**
 * Decides which source populates the pool on boot (or after a "dimentica"
 * reset): the private deposit served by /api/listone wins whenever it parses,
 * then the shipped static asset, then a previously-saved localStorage copy,
 * and an empty pool (no error) is the last resort. A source that fails to
 * parse is skipped, not fatal — the next one down still gets its turn. Pure —
 * no fetch, no localStorage access — so it's unit-testable without a DOM or
 * network; see main.ts for the I/O that feeds it.
 *
 * A source that parses to ZERO rows is skipped exactly like one that fails to
 * parse — for every source, not just the deposit (audit round 2, finding 5).
 * `[]` is syntactically a valid pool and was therefore winning over the copy
 * below it: a degraded static asset (broken build/deploy) emptied the panel
 * AND, because main.ts persists whatever the automatic sources produced,
 * destroyed the last good offline copy — the one defence meant for auction
 * day. Zero rows is a broken pipeline anywhere it comes from, never "the
 * listone is empty today".
 */
export function resolveListonePool(input: ResolveListonePoolInput): ResolvedListonePool {
  if (input.remoteJsonText !== null) {
    const pool = parseListoneJsonText(input.remoteJsonText);
    // A deposit that parses to zero rows is a broken pipeline, not an empty
    // listone, and it is the source most able to go empty on its own between
    // two page loads — so it falls through to the shipped asset instead of
    // emptying the panel. GET /api/listone already refuses the same payload
    // upstream (`payload_empty`); this is the second half of that guard, for
    // any other way an empty body could reach here. The same clause now
    // guards the two sources below it, see this function's doc comment.
    if (pool && pool.length > 0) return { pool, source: "remote" };
  }
  if (input.staticJsonText !== null) {
    const pool = parseListoneJsonText(input.staticJsonText);
    if (pool && pool.length > 0) return { pool, source: "static" };
  }
  if (input.localStorageText !== null) {
    const pool = parseListoneJsonText(input.localStorageText);
    if (pool && pool.length > 0) return { pool, source: "local-storage" };
  }
  return { pool: [], source: "none" };
}

/**
 * "GG/MM/AAAA HH:MM" for a Drive `modifiedTime`, always read in Europe/Rome
 * (the timezone every schedule in this project is expressed in), or null when
 * there is no usable timestamp — the caller then drops the clause instead of
 * showing an invented or misleading date.
 *
 * The parts are assembled here rather than handed to `dateStyle`/`timeStyle`
 * on purpose: a formatted pattern varies with the ICU version bundled in the
 * host, numeric 2-digit parts do not. Same reasoning as
 * `compareNormalizedUnicode` in packages/xlsx-adapter/src/listoneCandidate.ts.
 */
export function formatListoneUpdatedAt(isoTimestamp: string | null): string | null {
  if (isoTimestamp === null || isoTimestamp.trim() === "") return null;
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const day = part("day");
  const month = part("month");
  const year = part("year");
  const hour = part("hour");
  const minute = part("minute");
  if (!day || !month || !year || !hour || !minute) return null;
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

/**
 * The note under the table, told from the source that actually produced the
 * rows on screen. Only a pool served by the private deposit says so; every
 * other source keeps the unchanged fallback wording, because the app still has
 * no way to tell which season a locally-loaded file represents.
 */
export function listoneSourceNote(
  source: ListonePoolSource,
  modifiedAt: string | null,
  hasAppealIndex: boolean = false,
): string {
  const tail = hasAppealIndex ? DISPLAY_ONLY_CLAUSE : `${DISPLAY_ONLY_CLAUSE} ${NO_APPEAL_INDEX_CLAUSE}`;
  if (source !== "remote") return `${FALLBACK_PREFIX} ${tail}`;
  const updatedAt = formatListoneUpdatedAt(modifiedAt);
  const freshness = updatedAt === null ? "" : ` (dati aggiornati al ${updatedAt})`;
  return `Listone aggiornato automaticamente dal deposito privato${freshness}. ${tail}`;
}

/**
 * The line that qualifies the "Indice" column, or `null` when the pool carries
 * no index at all (nothing to qualify, so no claim is made).
 *
 * Every substantive word comes from the rows: the recipe version and the
 * quality labels are the ones the Algorithm Factory computed beside each
 * score. The counts are just how many rows got a verdict and how many did not
 * — stated plainly so an empty-looking column is never mistaken for a broken
 * table.
 */
export function listoneAppealIndexNote(pool: readonly ListonePlayer[]): string | null {
  const indices = pool.flatMap((p) => (p.appealIndex ? [p.appealIndex] : []));
  if (indices.length === 0) return null;
  const recipes = [...new Set(indices.map((index) => index.recipe))].sort();
  const qualities = [...new Set(indices.map((index) => index.quality))].sort();
  const withVerdict = indices.filter((index) => index.score !== null).length;
  return (
    `Indice: ${qualities.join(" / ")} — ricetta ${recipes.join(" / ")}; ` +
    `${withVerdict} con verdetto, ${indices.length - withVerdict} n/d. ${DISPLAY_ONLY_CLAUSE}`
  );
}

/**
 * Full column list for a pool: the 4 core columns, plus any extra columns
 * discovered from the loaded rows (alphabetical, for a deterministic
 * order). An empty pool yields just the core columns.
 */
const APPEAL_INDEX_COLUMN: ListoneColumn = {
  key: APPEAL_INDEX_COLUMN_KEY,
  label: "Indice",
  kind: "number",
  core: false,
};

/** True when the served pool actually carries an index for at least one row. */
export function poolHasAppealIndex(pool: readonly ListonePlayer[]): boolean {
  return pool.some((p) => p.appealIndex !== undefined);
}

export function listoneColumns(pool: readonly ListonePlayer[]): ListoneColumn[] {
  const extraKeys = new Set<string>();
  for (const p of pool) {
    if (p.extra) for (const k of Object.keys(p.extra)) extraKeys.add(k);
  }
  const extraColumns: ListoneColumn[] = [...extraKeys].sort((a, b) => a.localeCompare(b, "it")).map((key) => ({
    key,
    label: key,
    kind: inferExtraColumnKind(pool, key),
    core: false,
  }));
  // The index sits right after the core columns and only exists when the data
  // brought one: a pool without it has no "Indice" column to sort, toggle or
  // explain.
  return [
    ...CORE_COLUMNS,
    ...(poolHasAppealIndex(pool) ? [APPEAL_INDEX_COLUMN] : []),
    ...extraColumns,
  ];
}

function inferExtraColumnKind(pool: readonly ListonePlayer[], key: string): ColumnKind {
  for (const p of pool) {
    const v = p.extra?.[key];
    if (v !== undefined) return typeof v === "number" ? "number" : "string";
  }
  return "string";
}

/** Column widths shared between the header (DOM, views.ts) and row HTML below. */
export function listoneColumnFlex(key: string): number {
  if (key === "name") return 2;
  if (key === "club") return 1.4;
  return 1;
}

// Extended meaning for column headers/filters, shown as a hover tooltip.
// These are standard, widely-used Fantacalcio glossary terms (the same
// abbreviations appear on effectively every Italian fantasy-football
// listone) — this documents what an abbreviation *means*, it does not
// redistribute the source's proprietary values or calculation method.
// Keyed by literal header text, same as the extra columns themselves (see
// docs/data/LISTONE_UI_LOAD_CONTRACT.md) — case/punctuation must match the
// source header exactly.
const COLUMN_TOOLTIPS: Readonly<Record<string, string>> = {
  name: "Nome del giocatore.",
  role: "Ruolo classico: P (portiere), D (difensore), C (centrocampista), A (attaccante).",
  club: "Squadra di appartenenza in Serie A.",
  quotation: "Qt.A — Quotazione Attuale: prezzo di listino per l'asta, stagione corrente.",
  "Id": "Identificativo numerico del giocatore nel listone sorgente.",
  "RM": "Ruolo Mantra: ruolo secondo lo schema \"Mantra\", più granulare del ruolo classico P/D/C/A.",
  "Qt.I": "Quotazione Iniziale: prezzo di listino di inizio della stagione di riferimento (prima degli aggiornamenti).",
  "Diff.": "Differenza tra Qt.A e Qt.I: variazione della quotazione classica nel corso della stagione.",
  "Qt.A M": "Quotazione Attuale Mantra: prezzo di listino attuale secondo lo schema Mantra.",
  "Qt.I M": "Quotazione Iniziale Mantra: prezzo di listino iniziale secondo lo schema Mantra.",
  "Diff.M": "Differenza Mantra tra Qt.A M e Qt.I M.",
  "FVM": "Fantavalore di Mercato: indice sintetico di rendimento/valore per il fantacalcio classico.",
  "FVM M": "Fantavalore di Mercato Mantra: lo stesso indice secondo lo schema Mantra.",
  [APPEAL_INDEX_COLUMN_KEY]:
    "Indice di appetibilità 0–100, percentile entro la coorte del proprio ruolo. " +
    "Etichetta di qualità e versione della ricetta nella nota sotto la tabella. " +
    "n/d quando il modello non ha un verdetto per quel giocatore.",
};

/**
 * Extended, hover-friendly description of a column's meaning — used for
 * both the sortable table header and the column-visibility checkboxes, so
 * the two always say the same thing about the same key. Falls back to the
 * column's own label for any key without a known mapping (e.g. an extra
 * column this file has never seen before) rather than showing nothing.
 */
export function listoneColumnTooltip(column: ListoneColumn): string {
  return COLUMN_TOOLTIPS[column.key] ?? `${column.label} — colonna aggiuntiva dal file caricato.`;
}

/**
 * Accent- and case-folding normalizer for a human-typed name fragment.
 *
 * Exported because `src/assignCommand.ts` must fold the operator's typed
 * query with EXACTLY the same rules used to build `listonePlayerKey` below.
 * Two normalizers that drift apart would mean a command line that matches a
 * row it then records under a different identity \u2014 so there is one function,
 * not a copy.
 *
 * Every run of non-alphanumeric characters collapses to a single `-`, which
 * makes the output safe to use for `startsWith`/`includes` matching on
 * multi-word input: `"de bruyne"` and `"de-bruyne"` fold to the same string.
 */
export function normalizeIdentityPart(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Stable identity for a listone row — accent/case-insensitive name+club pair.
 * Doubles as the auction log's `playerId` (see main.ts doAssign) so a
 * purchase recorded from a listone click can always be matched back to that
 * same row later (the "Assegnato" flag below), independent of timestamps.
 */
export function listonePlayerKey(p: { readonly proxyId?: string | number; readonly name: string; readonly club: string }): string {
  if (p.proxyId !== undefined) return `proxy:${String(p.proxyId)}`;
  return `${normalizeIdentityPart(p.name)}__${normalizeIdentityPart(p.club)}`;
}

/**
 * Best-effort name recovered straight from a playerId that no longer matches
 * any loaded pool row (listone reloaded/changed since the purchase, or a
 * pre-existing log entry from before playerId was name+club-based). Prefer
 * resolvePlayerDisplayName below whenever a pool is available.
 */
export function legacyPlayerIdDisplayName(playerId: string): string {
  const sep = playerId.indexOf("__");
  const namePart = sep === -1 ? playerId.replace(/-\d+$/, "") : playerId.slice(0, sep);
  const spaced = namePart.replace(/-+/g, " ").trim();
  return spaced || playerId;
}

/**
 * A pool indexed by `listonePlayerKey` — the single structure every
 * playerId → row lookup goes through.
 *
 * It exists because the lookup used to be a linear `pool.find` that
 * recomputed `listonePlayerKey` (NFD normalize + 3 regex) for every row it
 * walked: one full-listone scan per resolved id. With a complete auction
 * (224 standing purchases) and a real listone (532 rows) the STORICO panel
 * alone did ~119k normalizations per render — and render() rebuilds the whole
 * DOM on every keystroke of the player search, so the critical path of a call
 * degraded to ~140 ms per keystroke exactly when the log was longest (audit
 * round 2, finding 2). Building this once per render turns that into one
 * O(pool) pass plus O(1) lookups.
 *
 * CHE COSA È DAVVERO GARANTITO DA UN TEST, E CHE COSA NO. La frase qui sopra
 * ha due metà con due statuti diversi, e tenerle separate è il punto:
 *   - «una passata O(pool)» — GARANTITA, e contata: `src/ui/listone.test.ts`
 *     §"resolves a whole panel of ids with ONE key computation per pool row"
 *     conta le applicazioni di `listonePlayerKey` riga per riga (getter su
 *     `proxyId`) e pretende ESATTAMENTE `pool.length`. È un'uguaglianza, non
 *     una soglia: una sola chiave in più la fa fallire. Ha sostituito
 *     un'asserzione cronometrata che lasciava passare un degrado di otto
 *     volte — vedi il commento in testa a quel describe.
 *   - «una volta per render» — NON garantita da nessun test: è una proprietà
 *     dei CALL SITE, non di questa funzione. Dove il pannello riceve l'indice
 *     già costruito (`warBoardFullHtml`, `renderWarBoardFull`,
 *     `renderRoseCard`) la firma stessa lo impone e non c'è niente da
 *     provare; dove lo costruisce da sé sono OTTO call site, enumerati in due
 *     passi: `grep -rn 'listonePoolIndex('` per le chiamate dirette, poi
 *     `grep -rn 'auctionDisplayIndex('` per i call site del wrapper (riga
 *     1350) — non tre: `src/main.ts:926`
 *     (`poolOrphanNotice`), `:1581` (`nominationContextTopAssigned`), `:2878`
 *     (`renderRiconfermeSettings`), `:3146` (`schedaRowTarget` — un indice
 *     O(pool) intero costruito per un solo `.get()`: debito reale, non una
 *     regressione di questa PR), `:4287` (`renderTableDetail`, STORICO),
 *     `:5410` e `:5469` (entrambi dentro `renderZona4`), più
 *     `src/ui/views.ts:1448` (`renderRoseScreen`). Restano tutti scoperti,
 *     perché vivono in `src/main.ts`, che esegue `render()` e
 *     `window.addEventListener` all'import e non è importabile in un test;
 *     `views.ts:1448` costruisce DOM. Ricostruire questo
 *     indice dentro il ciclo di render, una volta per id invece che una per
 *     pannello, oggi non farebbe fallire niente.
 *
 * Duplicate keys keep `pool.find`'s answer — the FIRST row wins — so this is
 * a drop-in for the scan it replaces. (`validateListonePool` already refuses
 * a pool with two rows on the same identity, so this is a tie-break that
 * should never be needed, not a supported shape.)
 */
export function listonePoolIndex(pool: readonly ListonePlayer[]): Map<string, ListonePlayer> {
  const index = new Map<string, ListonePlayer>();
  for (const p of pool) {
    const key = listonePlayerKey(p);
    if (!index.has(key)) index.set(key, p);
  }
  return index;
}

/**
 * Resolves an event log playerId back to a display name, preferring the
 * real (correctly cased) name from the currently-loaded pool when a row's
 * key still matches, falling back to a reconstruction from the id itself
 * otherwise. Used by Storico/Rose so purchased players show their real
 * name, not a re-derived slug.
 *
 * Takes the pool's index (see `listonePoolIndex`), not the pool: resolving a
 * whole panel's worth of ids is the hot path, and the caller builds the index
 * once for all of them.
 */
export function resolvePlayerDisplayName(
  playerId: string,
  poolIndex: ReadonlyMap<string, ListonePlayer>,
): string {
  const match = poolIndex.get(playerId);
  return match ? match.name : legacyPlayerIdDisplayName(playerId);
}

/**
 * The playerIds among `playerIds` that no row of the indexed pool carries —
 * i.e. purchases in the standing log whose identity the listone currently on
 * screen cannot account for.
 *
 * The event log's `playerId` IS a `listonePlayerKey` (see above), so it is
 * only as stable as the pool that produced it: swap the pool for one that
 * spells a name differently, or serves a different season, and every id
 * already written becomes an orphan — the player is shown as free, is
 * clickable again, and the engine accepts the second purchase because
 * `duplicate-player` compares playerIds, not physical players (audit round 2,
 * finding 1). This is the detector that lets the caller refuse or announce
 * that substitution instead of performing it in silence.
 *
 * Order-preserving and de-duplicated, so the caller can name the orphans in
 * the order they were bought.
 */
export function orphanPlayerIds(
  playerIds: readonly string[],
  poolIndex: ReadonlyMap<string, ListonePlayer>,
): string[] {
  const seen = new Set<string>();
  const orphans: string[] = [];
  for (const id of playerIds) {
    if (seen.has(id) || poolIndex.has(id)) continue;
    seen.add(id);
    orphans.push(id);
  }
  return orphans;
}

export type ListoneStatusFilter = "available" | "assigned" | "all";

export interface ListoneSearchFilter {
  readonly text: string;
  readonly role: Role | "";
  readonly club: string;
  readonly status: ListoneStatusFilter;
}

/**
 * Single source of truth for what the listone table displays: the search
 * bar (name substring + role + club — same fields driving "Ricerca
 * giocatore") plus the Assegnato status filter. `assignedKeys` are
 * listonePlayerKey values derived from the auction log's purchased players
 * (see main.ts), never the engine's raw playerId format directly.
 */
export function filterListonePool(
  pool: readonly ListonePlayer[],
  filter: ListoneSearchFilter,
  assignedKeys: ReadonlySet<string>,
): ListonePlayer[] {
  // Same fold as the command line (normalizeIdentityPart, used to build
  // listonePlayerKey and by src/assignCommand.ts): otherwise a name typed
  // without its accent — exactly what's typed hearing it called — misses in
  // this search bar while the command line still resolves it (audit r2 D6).
  // Applied to BOTH sides: normalizeIdentityPart also collapses separators to
  // "-", so a name-side-only fold would break multi-word queries like
  // "de sintetis" against a name folded to "de-sintetis".
  const q = normalizeIdentityPart(filter.text.trim());
  return pool.filter((p) => {
    if (q && !normalizeIdentityPart(p.name).includes(q)) return false;
    if (filter.role && p.role !== filter.role) return false;
    if (filter.club && p.club !== filter.club) return false;
    const isAssigned = assignedKeys.has(listonePlayerKey(p));
    if (filter.status === "available") return !isAssigned;
    if (filter.status === "assigned") return isAssigned;
    return true; // "all"
  });
}

/** Rows shown per page in the listone table. */
export const LISTONE_PAGE_SIZE = 10;

export interface ListonePage {
  readonly items: ListonePlayer[];
  /** 1-indexed, clamped to [1, totalPages]. */
  readonly page: number;
  /** Always >= 1, even for an empty pool. */
  readonly totalPages: number;
}

/**
 * Slices an already-sorted/filtered pool into one page. Pure — no state,
 * no DOM — so paging composes cleanly with sortListonePool upstream
 * (sort first, then paginate the result) without this function needing to
 * know anything about sorting. An out-of-range page (e.g. the pool shrank
 * after a reload) is clamped rather than returning an empty page.
 */
export function paginateListonePool(
  pool: readonly ListonePlayer[],
  page: number,
  pageSize: number = LISTONE_PAGE_SIZE,
): ListonePage {
  const totalPages = Math.max(1, Math.ceil(pool.length / pageSize));
  const clampedPage = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const start = (clampedPage - 1) * pageSize;
  return { items: pool.slice(start, start + pageSize), page: clampedPage, totalPages };
}

export function listoneCellValue(p: ListonePlayer, columnKey: string): ListoneCellValue | undefined {
  switch (columnKey) {
    case "name":
      return p.name;
    case "role":
      return p.role;
    case "club":
      return p.club;
    case "quotation":
      return p.quotation;
    case APPEAL_INDEX_COLUMN_KEY:
      // A withheld verdict has no value to compare: `undefined` sorts last in
      // both directions, exactly like a missing cell, and renders `n/d`.
      return p.appealIndex?.score ?? undefined;
    default:
      return p.extra?.[columnKey];
  }
}

/**
 * Sorts a pool by one column, returning a new array (never mutates).
 * Numbers compare numerically, everything else compares as a string
 * (Italian locale). Missing values always sort last, in either direction.
 */
export function sortListonePool(
  pool: readonly ListonePlayer[],
  columnKey: string,
  direction: SortDirection,
): ListonePlayer[] {
  return [...pool].sort((a, b) => {
    const va = listoneCellValue(a, columnKey);
    const vb = listoneCellValue(b, columnKey);
    if (va === undefined && vb === undefined) return 0;
    if (va === undefined) return 1;
    if (vb === undefined) return -1;
    const cmp =
      typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "it");
    return direction === "asc" ? cmp : -cmp;
  });
}

/** Header label with a sort indicator when this column is the active sort key. */
export function listoneColumnHeaderLabel(column: ListoneColumn, sort: ListoneSort | null): string {
  if (!sort || sort.key !== column.key) return column.label;
  return `${column.label} ${sort.direction === "asc" ? "▲" : "▼"}`;
}

/**
 * Pure row HTML for the given (already-filtered/ordered) visible columns —
 * kept separate from DOM construction so it is unit-testable without a
 * DOM environment (this project has no jsdom/happy-dom test setup — same
 * pattern as roleChipHtml/renderRoleChip in theme.ts). `isAssigned` adds a
 * small "Assegnato" badge next to the name — defaults to false so existing
 * callers/tests that never pass it keep their prior output.
 */
export function listoneRowHtml(
  p: ListonePlayer,
  columns: readonly ListoneColumn[],
  isAssigned: boolean = false,
): string {
  return columns.map((col) => listoneCellHtml(p, col, isAssigned)).join("");
}

function listoneCellHtml(p: ListonePlayer, col: ListoneColumn, isAssigned: boolean): string {
  const flex = listoneColumnFlex(col.key);
  const value = listoneCellValue(p, col.key);
  if (col.kind === "role" && typeof value === "string") {
    // Riga già assegnata -> pastiglia ARRETRATA. `opacity: 0.6` su tutta la
    // riga faceva due cose insieme: attenuava il testo (ed è per questo che è
    // stata tolta — portava il nome del giocatore a 4,28:1) e attenuava il
    // disco della pastiglia. Solo la prima andava disfatta: senza questa
    // variante il disco tornava fra 2,1x e 2,5x più luminoso, e le righe che
    // non puoi più comprare diventavano la cosa più accesa del listone. Il
    // disco arretrato è lo stesso hue a L 0.42 — vedi ROLE_CHIP_MUTED_TEXT in
    // theme.ts per i numeri.
    return `<div style="flex:${flex};">${roleChipHtml(value, isAssigned ? "muted" : "full")}</div>`;
  }
  if (col.key === "club" && typeof value === "string") {
    return `<div style="flex:${flex};display:flex;align-items:center;gap:6px;">${clubBadgeHtml(value)}${escHtml(value)}</div>`;
  }
  if (col.key === "name" && typeof value === "string") {
    const badge = isAssigned ? `<span class="badge badge--assigned">Assegnato</span>` : "";
    return `<div style="flex:${flex};display:flex;align-items:center;gap:6px;">${escHtml(value)}${badge}</div>`;
  }
  // Rounding happens here and nowhere else: the served score keeps its full
  // precision (Phase 5 `roundingPoint: "render_only"`), and a row the model
  // gave no verdict for says so instead of showing an em dash like an
  // ordinary missing cell.
  const text =
    col.key === APPEAL_INDEX_COLUMN_KEY
      ? typeof value === "number" ? String(Math.round(value)) : "n/d"
      : value === undefined ? "—" : String(value);
  const mono = col.kind === "number" ? `font-family:${C.mono};` : "";
  return `<div style="flex:${flex};${mono}">${escHtml(text)}</div>`;
}

/** Static header row for the empty state (always just the 4 core columns, not clickable). */
export function listoneTableHeadHtml(): string {
  return CORE_COLUMNS.map((c) => `<div style="flex:${listoneColumnFlex(c.key)};">${escHtml(c.label)}</div>`).join("");
}

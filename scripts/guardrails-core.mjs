// Repo-guardrails core — PURE logic, NO Node imports (string-only).
// Single source of truth shared by:
//   - scripts/repo-guardrails.mjs  (real enforcement over `git ls-files`)
//   - packages/engine/tests/repo_guardrails.test.ts  (synthetic unit tests)
// Keeping this file dependency-free lets the TypeScript test import it
// (tsconfig allowJs) without pulling Node globals or needing @types/node.

const NUL = String.fromCharCode(0);

// Data formats that would mean real (proprietary) data landed in the repo.
export const DATA_EXTS = new Set([
  ".xlsx", ".xls", ".xlsm", ".csv", ".tsv", ".parquet", ".db", ".sqlite",
]);

// Text/source kinds we expect to be tracked.
export const ALLOWED_EXTS = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml",
  ".toml", ".sh", ".bash", ".txt", ".lock", ".html", ".css",
]);

// Extensionless files that are legitimately tracked.
// CODEOWNERS (DOC-01 Fase 2, issue #258): GitHub reads it only from the repo
// root, .github/ or docs/, and it must be extensionless to be read at all.
// Additive entry — no existing rule is relaxed by it: every other extensionless
// basename stays blocked-ext exactly as before.
export const ALLOWED_NOEXT = new Set([
  "LICENSE", ".gitignore", ".gitattributes", ".npmrc", ".nvmrc", ".editorconfig", "Dockerfile",
  ".claudeignore", ".graphifyignore", ".graphify_version", "CODEOWNERS",
]);

// Real club logo images — the one place binary/svg image payloads are expected,
// per Owner's written, scoped exception (docs/DECISIONS.md §"Eccezioni operative
// scritte", docs/data/LISTONE_UI_LOAD_CONTRACT.md §"Club logos"). Deliberately a
// single hardcoded directory + a two-extension allowlist, not a general
// "images are fine" rule — everywhere else in the repo, an .svg/.png (or any
// other binary payload) is still blocked exactly as before.
const CLUB_LOGO_ASSET_DIR = "public/assets/clubs/";
const CLUB_LOGO_ASSET_EXTS = new Set([".svg", ".png"]);

// Supabase migration SQL — the one place `.sql` payloads are expected, per
// docs/data/API_FOOTBALL_SUPABASE_FOUNDATION_V1.md. Deliberately a single
// hardcoded directory + a one-extension allowlist, not a general "SQL is
// fine" rule — a .sql file anywhere else in the repo stays blocked exactly
// as before.
const SUPABASE_MIGRATIONS_DIR = "supabase/migrations/";
const SUPABASE_MIGRATIONS_EXTS = new Set([".sql"]);

// ---------------------------------------------------------------------------
// Data-extension exceptions — INJECTED BY THE HOST REPOSITORY, never listed here
// ---------------------------------------------------------------------------
//
// Some repositories that share this core have a written, scoped authorization
// to track a handful of files whose extension `DATA_EXTS` (or the
// `ALLOWED_EXTS` allowlist) would otherwise reject. Those file lists are
// PROPERTY OF THE REPOSITORY THAT OWNS THE AUTHORIZATION, not of this module:
// a path that does not exist here must never be pre-approved here, because a
// rule for an absent directory is indistinguishable from a hole if that
// directory ever appears. So this file ships the MECHANISM and the LIMITS; the
// list itself is injected by the caller (scripts/repo-guardrails.mjs loads it
// from a tracked JSON file when the host repository has one).
//
// Default is strict: with no injected list, `classifyTrackedFile` behaves
// exactly as it did before this mechanism existed. THIS repository is one of
// the strict ones and stays that way — its publication gate's closed top-level
// allowlist already refuses a root `guardrails.exceptions.json`, and a test in
// packages/engine/tests/publication_gate.test.ts pins that so the loader can
// never become reachable here by accident.
//
// WHAT AN EXCEPTION CAN AND CANNOT DO. It waives the EXTENSION rules —
// `blocked-data` and `blocked-ext` — for exact paths. It can never waive:
//   - the binary content sniff (a .csv whose bytes start with `PK`, or carry a
//     NUL, is still `blocked-binary` — enforced by ORDER below, not by trust);
//   - `.claude/worktrees/` (checked first, unconditionally);
//   - `graphify-out/`, `.graphify-tools/`, a root `graph.json` (checked before
//     the exemption is allowed to return "allowed");
//   - anything under `public/` — the directory that gets built and served to a
//     browser. Raw data files never belong in a published bundle, in any
//     repository, whatever a local authorization says.
// Those five are STRUCTURAL: they hold for any injected list, including a
// malformed or hostile one, because the exemption is never consulted before
// them.
//
// `DATA_EXCEPTION_CANARIES` is the second, independent net: a behavioural check
// run at compile time against paths that must stay blocked everywhere. It
// catches an over-broad rule (`^public/.*\.csv$`) at the moment the list is
// loaded, with a message naming the path it would have opened, rather than
// leaving it to be noticed by a reader.
//
// HONEST LIMIT: the injected spec is a tracked, reviewed file in the host
// repository, and this module does not attempt to bound regular-expression
// runtime. A pathological pattern can make the guard slow; it cannot make it
// permissive.

// Paths that must stay blocked no matter what a host repository injects.
// Sampled across every absolute zone plus the two shapes the guard exists for
// (a stray dump at the root, a real spreadsheet under data/).
export const DATA_EXCEPTION_CANARIES = Object.freeze([
  "public/listone.csv",
  "public/assets/clubs/atalanta.xlsx",
  "dump.csv",
  "data/Voti_2021_22_G38.xlsx",
  ".claude/worktrees/agent-x/data.csv",
  "graphify-out/graph.csv",
  ".graphify-tools/uv-tool-dir/cache.db",
  "node_modules/some-pkg/data.csv",
  "src/tool.exe",
]);

// The published bundle. An exemption never applies here — see the block above.
const PUBLISHED_DIR = "public/";

const EXCEPTION_SPEC_KEYS = new Set(["exactPaths", "patterns"]);

/**
 * A compiled exception list. Annotated explicitly so the shape stays a
 * contract: inferring it from the frozen default below would type `size` as
 * the literal `0` and make every real matcher unassignable.
 *
 * @typedef {{ size: number, matches: (path: string) => boolean }} DataExceptionMatcher
 */

/**
 * The strict default: no file is exempt from the extension rules.
 * @type {DataExceptionMatcher}
 */
export const NO_DATA_EXCEPTIONS = Object.freeze({
  size: 0,
  matches() {
    return false;
  },
});

function failSpec(detail) {
  throw new Error(`invalid data-exception spec: ${detail}`);
}

function readStringArray(spec, key) {
  const value = spec[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) failSpec(`"${key}" must be an array of strings`);
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0) {
      failSpec(`"${key}" contains an entry that is not a non-empty string`);
    }
  }
  return value;
}

function validateExactPath(entry) {
  if (entry.startsWith("/")) failSpec(`"${entry}" is absolute — use a repo-root-relative path`);
  if (entry.includes("\\")) failSpec(`"${entry}" uses a backslash — git paths use "/"`);
  if (entry.includes("*") || entry.includes("?")) {
    failSpec(`"${entry}" looks like a glob — express variable rules in "patterns"`);
  }
  const segments = entry.split("/");
  for (const segment of segments) {
    if (segment.length === 0) failSpec(`"${entry}" has an empty path segment`);
    if (segment === "." || segment === "..") {
      failSpec(`"${entry}" has a relative segment ("." or "..")`);
    }
  }
  const base = segments[segments.length - 1];
  if (base.lastIndexOf(".") <= 0) {
    failSpec(`"${entry}" has no extension — an exception names files, never a directory`);
  }
}

function compilePattern(source) {
  // Alternation would defeat the anchoring check below (`^a|b$` starts with
  // "^" and ends with "$" while leaving both branches half-open), so it is
  // rejected outright: one entry per alternative costs nothing and keeps the
  // check sound.
  if (source.includes("|")) {
    failSpec(`pattern ${JSON.stringify(source)} uses "|" — list one entry per alternative`);
  }
  if (!source.startsWith("^") || !source.endsWith("$")) {
    failSpec(`pattern ${JSON.stringify(source)} is not anchored — it must start "^" and end "$"`);
  }
  try {
    return new RegExp(source);
  } catch (err) {
    failSpec(`pattern ${JSON.stringify(source)} does not compile: ${err.message}`);
  }
  return null; // unreachable — failSpec throws
}

/**
 * Validate a plain-JSON exception spec and compile it into a matcher for
 * `classifyTrackedFile`. Throws — loudly, naming the offending entry — on any
 * malformed, over-broad or dead rule. Never returns a partially-valid matcher.
 *
 * Spec shape: `{ exactPaths?: string[], patterns?: string[] }`, where every
 * pattern is an anchored, alternation-free regular expression source.
 *
 * @param {unknown} spec
 * @returns {DataExceptionMatcher}
 */
export function compileDataExceptions(spec) {
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
    failSpec("the spec must be a JSON object");
  }
  for (const key of Object.keys(spec)) {
    if (!EXCEPTION_SPEC_KEYS.has(key)) {
      failSpec(`unknown key "${key}" (allowed: exactPaths, patterns)`);
    }
  }

  const exact = new Set();
  for (const entry of readStringArray(spec, "exactPaths")) {
    validateExactPath(entry);
    if (exact.has(entry)) failSpec(`duplicate path "${entry}"`);
    exact.add(entry);
  }

  const patterns = [];
  const seenPatterns = new Set();
  for (const source of readStringArray(spec, "patterns")) {
    if (seenPatterns.has(source)) failSpec(`duplicate pattern ${JSON.stringify(source)}`);
    seenPatterns.add(source);
    patterns.push(compilePattern(source));
  }

  const compiled = Object.freeze({
    size: exact.size + patterns.length,
    matches(path) {
      if (typeof path !== "string" || path.length === 0) return false;
      if (exact.has(path)) return true;
      for (const pattern of patterns) {
        if (pattern.test(path)) return true;
      }
      return false;
    },
  });

  for (const canary of DATA_EXCEPTION_CANARIES) {
    if (compiled.matches(canary)) {
      failSpec(`a rule exempts "${canary}", which must stay blocked in every repository`);
    }
  }

  return compiled;
}

// Graphify knowledge-graph artifacts (CLAUDE.md §"Graphify — on-demand";
// detail: .claude/skills/graphify/PROJECT_PROTOCOL.md). Nothing under
// graphify-out/ is tracked, portable-looking or
// not: community-detection (Leiden) is not run-to-run deterministic even
// with a fixed seed (verified 2026-07-11 — same HEAD, two consecutive
// rebuilds, same node/edge set, ~5% of nodes land in a different
// `community` id each time), so any subset committed would churn on every
// commit/checkout. graph.json/GRAPH_REPORT.md/manifest.json/labels are
// regenerated locally on demand (`npm run graphify:bootstrap` +
// `graphify update .`), never versioned. A stray graph.json at the repo
// root is blocked the same way.
const GRAPHIFY_OUT_DIR = "graphify-out/";

// Project-local `uv` tool directories the bootstrap installs graphify into
// (UV_TOOL_DIR/UV_TOOL_BIN_DIR, 2026-07-11 isolation hardening). Contains
// a real installed Python package + binary — machine-specific, large, and
// exactly the kind of thing that must never be committed even though nothing
// in it would otherwise trip DATA_EXTS/binary-sniff (the wheel/venv files
// are a mix of extensionless binaries and .py/.json — some would slip past
// the generic allowlist undetected without this explicit rule).
const GRAPHIFY_TOOLS_DIR = ".graphify-tools/";

// Worker worktrees — git worktree dei worker temporanei delegati
// dall'Executive (Team Charter §Struttura), annidati sotto .claude/worktrees/
// e mai lavoro da versionare (.gitignore). Questo blocco è la sola assertion
// che tiene vincolata quella coppia (PR #244, review lente Quality &
// Delivery): lo skip per path relativo in scripts/secret-scan.mjs assume che
// il contenuto lì sotto sia sempre untracked, ma da solo non lo verifica —
// una directory di worktree stantia con la riga .gitignore rimossa, o anche
// solo un `git add -f` deliberato, la stagia comunque senza che nulla se ne
// accorga. Un file tracciato qui non ci arriva per caso: o è stato forzato
// con `git add -f`, o la voce `.claude/worktrees/` è sparita da .gitignore.
// In entrambi i casi la premessa dello skip è falsa e va bloccato. La CI
// clona fresh e non ha mai questa directory, quindi nessun job CI può
// accorgersi di una regressione dello skip: questa assertion sui file
// tracciati, sintetica e indipendente dall'ambiente, è l'unica difesa che
// gira ovunque.
const WORKTREES_DIR = ".claude/worktrees/";

// Pure classifier — no I/O. contentSample = first bytes of the file (may be empty).
// Returns: "allowed" | "blocked-data" | "blocked-ext" | "blocked-binary" |
// "blocked-graphify" | "blocked-worktree".
//
// `dataExceptions` is a matcher from `compileDataExceptions()`; omitting it
// keeps the strict default. Where it is consulted in the sequence below is the
// whole safety argument — see the exception block above.
/**
 * @param {string} path
 * @param {string} [contentSample]
 * @param {DataExceptionMatcher | null} [dataExceptions]
 * @returns {"allowed"|"blocked-data"|"blocked-ext"|"blocked-binary"|"blocked-graphify"|"blocked-worktree"}
 */
export function classifyTrackedFile(path, contentSample = "", dataExceptions = NO_DATA_EXCEPTIONS) {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : "";
  // Checked first and unconditionally: nothing under a worker worktree is
  // ever a legitimate tracked file, regardless of extension or content —
  // this must win over every allowlist below (club logos, supabase
  // migrations, allowed extensions), not just the blocklists.
  if (path.startsWith(WORKTREES_DIR)) return "blocked-worktree";
  if (path.startsWith(CLUB_LOGO_ASSET_DIR) && CLUB_LOGO_ASSET_EXTS.has(ext)) return "allowed";
  // Injected exception, resolved once. Never applies under public/: that
  // directory is built and served to a browser, and a raw data file has no
  // business in a published bundle whatever a host repository authorized.
  // Computed here but NOT returned here — see the two rules it must not
  // outrank immediately below, and the graphify rules further down.
  const dataExempt =
    !path.startsWith(PUBLISHED_DIR) &&
    dataExceptions != null &&
    dataExceptions.matches(path) === true;
  if (DATA_EXTS.has(ext) && !dataExempt) return "blocked-data";
  // binary sniff: NUL byte or ZIP/OOXML magic (xlsx is a renamed zip).
  // Runs BEFORE the supabase/migrations/ .sql exception below AND before any
  // injected data exception — unlike club logos (deliberately binary), a .sql
  // migration or an authorized .csv is expected to always be text; one with a
  // NUL byte or a `PK` (zip) magic header is never the real thing, so it must
  // still hit blocked-binary instead of being waved through. The exception
  // waives the EXTENSION rule, never the CONTENT rule.
  if (contentSample.includes(NUL) || contentSample.startsWith("PK")) return "blocked-binary";
  if (path.startsWith(SUPABASE_MIGRATIONS_DIR) && SUPABASE_MIGRATIONS_EXTS.has(ext)) return "allowed";
  if (path === "graph.json") return "blocked-graphify";
  if (path.startsWith(GRAPHIFY_OUT_DIR)) return "blocked-graphify";
  if (path.startsWith(GRAPHIFY_TOOLS_DIR)) return "blocked-graphify";
  // Only now: after the content sniff and after every absolute zone. An
  // injected list cannot reach a path any of the rules above already claimed.
  if (dataExempt) return "allowed";
  if (ext === "" && ALLOWED_NOEXT.has(base)) return "allowed";
  if (!ALLOWED_EXTS.has(ext)) return "blocked-ext";
  return "allowed";
}

// Pure linter — flags auto-stale fields that trigger recursive housekeeping PRs.
export function lintProjectState(text) {
  const errs = [];
  if (/HEAD\s+main:\s*`?[0-9a-f]{7,40}`?/i.test(text)) errs.push("auto-stale: HEAD main sha in header");
  if (/\bTest:\s*\d+\s*\/\s*\d+/.test(text)) errs.push("auto-stale: hand-written test count");
  return errs;
}

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
// Extension exceptions — INJECTED BY THE HOST REPOSITORY, never listed here
// ---------------------------------------------------------------------------
//
// WHAT THIS MECHANISM IS. Some repositories that share this core have a
// written, scoped authorization to track a handful of data files whose
// EXTENSION the rules below would otherwise reject. Those file lists are
// PROPERTY OF THE REPOSITORY THAT OWNS THE AUTHORIZATION, not of this module:
// a path that does not exist here must never be pre-approved here, because a
// rule for an absent directory is indistinguishable from a hole if that
// directory ever appears. So this file ships the MECHANISM and its CEILING;
// the list itself is injected by the caller (scripts/repo-guardrails.mjs loads
// it from a tracked JSON file when the host repository has one).
//
// Default is strict: with no injected list, `classifyTrackedFile` behaves
// exactly as it did before this mechanism existed. THIS repository is one of
// the strict ones and stays that way — its publication gate's closed top-level
// allowlist already refuses a root `guardrails.exceptions.json`, and a test in
// packages/engine/tests/publication_gate.test.ts pins that so the loader can
// never become reachable here by accident.
//
// WHAT IT WAIVES — read this before approving a list. It waives BOTH extension
// rules, not only the data one: `blocked-data` (a known data format) AND
// `blocked-ext` (an extension this core does not recognize at all). The second
// half is why the mechanism exists — `.jsonl` is in neither DATA_EXTS nor
// ALLOWED_EXTS — and it is also the half an earlier version of this comment
// got wrong: it advertised "data exceptions" while the code exempted ANY
// extension, `.exe` and `.env.production` included.
//
// THE CEILING IS `EXEMPTABLE_EXTS`. An injected rule can only ever reach a file
// whose extension is in that set. It is checked inside `classifyTrackedFile`
// BEFORE the injected matcher is consulted, so it holds for any list: a hostile
// matcher returning true for every path still cannot make `scripts/malware.exe`
// or `.env.production` allowed. Approving a list therefore cannot open anything
// broader than "some data files" — widening the KIND of file that is exemptable
// at all is a change to this shared, publicly reviewed core, never to a host
// list. `NEVER_EXEMPTABLE_EXTS` and the dotenv-basename rule are a strict
// SUBSET of "not in EXEMPTABLE_EXTS" and grant no authority of their own: they
// exist so the two categories a reviewer is most likely to be talked into —
// executables and credential material — are refused AT LOAD TIME, by name,
// instead of quietly compiling into a rule that can never fire.
//
// WHAT IT CAN NEVER WAIVE, whatever the list says:
//   - the binary content sniff (an authorized .csv whose bytes start with `PK`,
//     or carry a NUL, is still `blocked-binary` — enforced by ORDER below);
//   - `.claude/worktrees/` (checked first, unconditionally);
//   - `graphify-out/`, `.graphify-tools/`, a root `graph.json` (checked before
//     the exemption is allowed to return "allowed");
//   - anything under `public/` — the directory that gets built and served to a
//     browser. Raw data files never belong in a published bundle, in any
//     repository, whatever a local authorization says.
// Those are STRUCTURAL: they hold for any injected list, including a malformed
// or hostile one, because the exemption is never consulted before them.
//
// `EXTENSION_EXCEPTION_CANARIES` is a second, independent net: a behavioural
// check run when the list is loaded, against paths that must stay blocked
// everywhere. It catches an over-broad rule (`^public/.*\.csv$`) at load time,
// with a message naming the path it would have opened.
//
// PATTERN LANGUAGE. Anchored regular expressions with NO alternation, NO groups
// (`(` is refused outright, escaped or not — a filename that genuinely contains
// a parenthesis belongs in `exactPaths`, which is not a regex at all), at most
// MAX_PATTERN_QUANTIFIERS quantifiers and MAX_PATTERN_LENGTH characters; a path
// longer than MAX_EXEMPTABLE_PATH_LENGTH is never tested and so never exempt.
// Banning groups is not stylistic. In V8 a quantifier cannot be nested without
// one (`a+{2}`, `a{2}{2}`, `a++` are all SyntaxError), so refusing `(` removes
// catastrophic EXPONENTIAL backtracking BY CONSTRUCTION instead of chasing it
// with heuristics. Cost of the restriction: none — neither real pattern this
// mechanism was built for uses a group.
//
// HONEST LIMIT — this replaces the earlier claim that "a pathological pattern
// can make the guard slow; it cannot make it permissive". The second half still
// holds and is tested. The first half was a serious understatement and is now
// bounded rather than hand-waved:
//   - BEFORE: `^(a+)+$` passed every check and cost 1.7s at n=28, 6.7s at n=30,
//     and did not terminate at n=35 (measured here, Node 22) — unbounded, not
//     merely slow.
//   - NOW: exponential blowup is unreachable, but POLYNOMIAL backtracking
//     survives — adjacent quantified classes against a long non-matching path.
//     It is bounded by the caps, and the bound is MEASURED, not estimated. The
//     slowest pattern this validator accepts, searched for adversarially and
//     run against the longest path it will test, is
//     `^[a-z]{1,512}[a-z]{1,512}[a-z]{1,512}\.zzz$` at ~90 ms (worst of 5 runs,
//     Node 22, 512-char subject); the unbounded `+` form of the same shape is
//     ~40 ms. That figure is PER PATTERN PER PATH: scripts/repo-guardrails.mjs
//     tests every tracked file against every pattern, so the run-level cost is
//     that times both counts. With a realistic list (1-2 patterns) and ordinary
//     path lengths it is microseconds; the ~90 ms is what a deliberately
//     hostile pattern buys, and it is the residual limit — there is no third
//     net for it.
// Outside those caps the guard does not get slow — it rejects the list at load.

// Paths that must stay blocked no matter what a host repository injects.
// Sampled across every absolute zone, the two shapes the guard exists for (a
// stray dump at the root, a real spreadsheet under data/), and one specimen of
// each never-exemptable family — an executable and credential material — so
// that an over-broad PATTERN aimed at them dies at load time too, the way an
// over-broad exact path does.
export const EXTENSION_EXCEPTION_CANARIES = Object.freeze([
  "public/listone.csv",
  "public/assets/clubs/atalanta.xlsx",
  "dump.csv",
  "data/Voti_2021_22_G38.xlsx",
  ".claude/worktrees/agent-x/data.csv",
  "graphify-out/graph.csv",
  ".graphify-tools/uv-tool-dir/cache.db",
  "node_modules/some-pkg/data.csv",
  "src/tool.exe",
  ".env.production",
  "config/private.pem",
]);

// The one set an injected list can reach — the mechanism's ceiling (see above).
// Deliberately "data formats only": every DATA_EXTS member, whose whole purpose
// is to name real-data formats, plus line-delimited JSON under both of its
// standard spellings. `.jsonl` is the format the mechanism was built to admit
// (it is in neither DATA_EXTS nor ALLOWED_EXTS, so it is `blocked-ext` by
// default); `.ndjson` is the identical format under its other name, so
// admitting one and not the other would be an arbitrary trap.
//
// Nothing else is exemptable, and that is the point: an extension nobody
// anticipated is closed by default rather than open by default. Source kinds
// (`.ts`, `.sh`, `.json`, …) are absent on purpose — they are already `allowed`
// outright by ALLOWED_EXTS, so an exception for them would be a no-op.
export const EXEMPTABLE_EXTS = new Set([...DATA_EXTS, ".jsonl", ".ndjson"]);

// A strict SUBSET of "not in EXEMPTABLE_EXTS" — it adds no protection that the
// ceiling above does not already give. Its job is the ERROR MESSAGE: these are
// the two families a reviewer of a host list is most likely to be talked into,
// so they are named and refused when the list is LOADED rather than silently
// compiling into a rule that never fires.
//
// Executables and loadable objects (.exe/.dll/.so/.dylib/.bin): a guardrail
// that can be argued into tracking machine code is not a guardrail, and `.bin`
// is the extension chosen precisely when the author will not say what the bytes
// are. Credential material (.pem/.key/.p12/.pfx/.crt): PEM and .key are BASE64
// TEXT, so the binary content sniff — the module's other content-level defence
// — gives exactly zero protection there; the extension rule is the only line.
// `.crt` holds public material rather than a secret, but a certificate inside a
// data-exception list is a reliable sign that credential plumbing is being
// committed, and the entry costs nothing.
//
// Deliberately NOT here, so the list stays a floor a reader will actually read
// rather than a taxonomy that pretends to be complete:
//   - `.sh` — already in ALLOWED_EXTS (this repo tracks real shell hooks), so
//     it never consults an exception at all. Listing it would be inert while
//     implying a prohibition that does not exist: a rule that lies about its
//     own effect. Same reasoning for every other ALLOWED_EXTS member.
//   - `.bat`/`.ps1`/`.jar`/`.wasm`/`.pyc`/`.deb`/… and `.jks`/`.keystore` —
//     real hazards, but already unreachable via EXEMPTABLE_EXTS, and with no
//     plausible path into a TypeScript/Node repository. Enumerating them would
//     suggest this list is the guarantee. It is not; the ceiling is.
export const NEVER_EXEMPTABLE_EXTS = new Set([
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".pem", ".key", ".p12", ".pfx", ".crt",
]);

// Dotenv files are matched by BASENAME, not extension: the "extension" of
// `.env.production` is `.production`, which is meaningless as a denylist entry
// (you would have to enumerate `.local`, `.staging`, … forever). A bare `.env`
// has no extension at all and is already unreachable, but naming the family
// makes the load-time refusal explicit for the whole shape.
function isDotenvBasename(base) {
  return base === ".env" || base.startsWith(".env.");
}

// Pattern-language caps. The two patterns this mechanism was actually built for
// use 2 and 1 quantifiers and ~60 characters, so these leave real headroom
// while keeping the measured worst case in the tens of milliseconds.
const MAX_PATTERN_LENGTH = 200;
const MAX_PATTERN_QUANTIFIERS = 3;

// Longest path an injected rule will even be tested against. Bounds the regex
// SUBJECT as the caps above bound the pattern — a path this long is refused
// exemption, i.e. it stays blocked and the run goes red naming it. Safe
// direction by construction: the cap can only ever withhold an exemption.
const MAX_EXEMPTABLE_PATH_LENGTH = 512;

// The published bundle. An exemption never applies here — see the block above.
const PUBLISHED_DIR = "public/";

const EXCEPTION_SPEC_KEYS = new Set(["exactPaths", "patterns"]);

/**
 * A compiled exception list. Annotated explicitly so the shape stays a
 * contract: inferring it from the frozen default below would type `size` as
 * the literal `0` and make every real matcher unassignable.
 *
 * @typedef {{ size: number, matches: (path: string) => boolean }} ExtensionExceptionMatcher
 */

/**
 * The strict default: no file is exempt from the extension rules.
 * @type {ExtensionExceptionMatcher}
 */
export const NO_EXTENSION_EXCEPTIONS = Object.freeze({
  size: 0,
  matches() {
    return false;
  },
});

function failSpec(detail) {
  throw new Error(`invalid extension-exception spec: ${detail}`);
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
  if (entry.length > MAX_EXEMPTABLE_PATH_LENGTH) {
    // Not merely cosmetic: `matches()` refuses to test a path this long, so
    // such an entry could only ever be a rule that silently never fires.
    failSpec(
      `"${entry.slice(0, 60)}…" is longer than ${MAX_EXEMPTABLE_PATH_LENGTH} characters — ` +
        `a path that long is never exempted, so the entry could never apply`,
    );
  }
  const segments = entry.split("/");
  for (const segment of segments) {
    if (segment.length === 0) failSpec(`"${entry}" has an empty path segment`);
    if (segment === "." || segment === "..") {
      failSpec(`"${entry}" has a relative segment ("." or "..")`);
    }
  }
  const base = segments[segments.length - 1];
  if (isDotenvBasename(base)) {
    failSpec(
      `"${entry}" is a dotenv file — environment/credential files are never exemptable. ` +
        `This mechanism waives the extension rules for data formats only.`,
    );
  }
  if (base.lastIndexOf(".") <= 0) {
    failSpec(`"${entry}" has no extension — an exception names files, never a directory`);
  }
  const ext = base.slice(base.lastIndexOf(".")).toLowerCase();
  if (NEVER_EXEMPTABLE_EXTS.has(ext)) {
    failSpec(
      `"${entry}" has extension "${ext}" — executables and credential material are never ` +
        `exemptable. This mechanism waives the extension rules for data formats only; ` +
        `it is not a general allowlist.`,
    );
  }
}

/**
 * Deliberately naive quantifier count: it walks the source tracking only
 * escapes and character classes, and counts every `*`, `+`, `?` and `{` outside
 * a class. It therefore OVER-counts (a lazy `+?` scores 2, a literal `{` scores
 * 1) and can never UNDER-count — the only direction that is safe for a cap.
 */
function countQuantifiers(source) {
  let count = 0;
  let escaped = false;
  let inClass = false;
  for (const ch of source) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch === "*" || ch === "+" || ch === "?" || ch === "{") count += 1;
  }
  return count;
}

function compilePattern(source) {
  // Length first: it bounds the work every later check (and the regex parser)
  // has to do, on a string that has not been validated in any way yet.
  if (source.length > MAX_PATTERN_LENGTH) {
    failSpec(
      `pattern ${JSON.stringify(source.slice(0, 60))}… is ${source.length} characters, over the ` +
        `${MAX_PATTERN_LENGTH}-character cap`,
    );
  }
  // Compiling comes BEFORE the language restrictions so that a malformed regex
  // is reported as malformed — the most useful message — rather than being
  // blamed on whichever restricted character it happens to contain. Compilation
  // itself cannot backtrack; only matching can.
  let compiled;
  try {
    compiled = new RegExp(source);
  } catch (err) {
    failSpec(`pattern ${JSON.stringify(source)} does not compile: ${err.message}`);
  }
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
  // No groups, escaped or not. This is the ReDoS fix and it is structural: a
  // quantifier cannot be nested without a group (`a+{2}`, `a{2}{2}`, `a++` are
  // SyntaxError in V8), so `^(a+)+$` and its whole family become unwritable
  // rather than merely discouraged. A blunt `includes("(")` is checkable by eye;
  // an "unescaped paren" scanner would only be as trustworthy as the scanner.
  if (source.includes("(")) {
    failSpec(
      `pattern ${JSON.stringify(source)} uses "(" — groups are not allowed, because a nested ` +
        `quantifier (the catastrophic-backtracking family, e.g. "^(a+)+$") needs one. ` +
        `Name such a file in "exactPaths" instead.`,
    );
  }
  // Groups are gone, so exponential backtracking is gone; adjacent quantified
  // classes can still cost O(n^k), and k is what this bounds.
  const quantifiers = countQuantifiers(source);
  if (quantifiers > MAX_PATTERN_QUANTIFIERS) {
    failSpec(
      `pattern ${JSON.stringify(source)} uses ${quantifiers} quantifiers, over the cap of ` +
        `${MAX_PATTERN_QUANTIFIERS} — each additional one raises the backtracking cost by a ` +
        `power of the path length. Split it into more specific entries.`,
    );
  }
  return compiled;
}

/**
 * Validate a plain-JSON exception spec and compile it into a matcher for
 * `classifyTrackedFile`. Throws — loudly, naming the offending entry — on any
 * malformed, over-broad or dead rule. Never returns a partially-valid matcher.
 *
 * Spec shape: `{ exactPaths?: string[], patterns?: string[] }`, where every
 * pattern is an anchored, alternation-free, group-free regular expression
 * source within the quantifier and length caps above.
 *
 * A matcher is only ever an ALLOWLIST OF PATHS. What KIND of file may be
 * exempted at all is decided by `EXEMPTABLE_EXTS` inside `classifyTrackedFile`,
 * never here, so the guarantee does not depend on this validation being
 * exhaustive.
 *
 * @param {unknown} spec
 * @returns {ExtensionExceptionMatcher}
 */
export function compileExtensionExceptions(spec) {
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
      // Bounds the regex SUBJECT, the other half of the backtracking cost.
      // Refusing to test is the safe direction: the path simply stays blocked.
      if (path.length > MAX_EXEMPTABLE_PATH_LENGTH) return false;
      if (exact.has(path)) return true;
      for (const pattern of patterns) {
        if (pattern.test(path)) return true;
      }
      return false;
    },
  });

  for (const canary of EXTENSION_EXCEPTION_CANARIES) {
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
// `extensionExceptions` is a matcher from `compileExtensionExceptions()`;
// omitting it keeps the strict default. Where it is consulted in the sequence
// below — and what it is gated on — is the whole safety argument: see the
// exception block above.
/**
 * @param {string} path
 * @param {string} [contentSample]
 * @param {ExtensionExceptionMatcher | null} [extensionExceptions]
 * @returns {"allowed"|"blocked-data"|"blocked-ext"|"blocked-binary"|"blocked-graphify"|"blocked-worktree"}
 */
export function classifyTrackedFile(
  path,
  contentSample = "",
  extensionExceptions = NO_EXTENSION_EXCEPTIONS,
) {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : "";
  // Checked first and unconditionally: nothing under a worker worktree is
  // ever a legitimate tracked file, regardless of extension or content —
  // this must win over every allowlist below (club logos, supabase
  // migrations, allowed extensions), not just the blocklists.
  if (path.startsWith(WORKTREES_DIR)) return "blocked-worktree";
  if (path.startsWith(CLUB_LOGO_ASSET_DIR) && CLUB_LOGO_ASSET_EXTS.has(ext)) return "allowed";
  // Injected exception, resolved once, and gated on THREE things before the
  // injected list is even asked:
  //  1. the extension is one this core allows to be exempted at all
  //     (`EXEMPTABLE_EXTS` — the ceiling; this is what makes `.exe`,
  //     `.env.production` and every unanticipated kind structurally
  //     unreachable, for ANY list, valid or hostile);
  //  2. the path is not under public/ — that directory is built and served to
  //     a browser, and a raw data file has no business in a published bundle
  //     whatever a host repository authorized;
  //  3. a matcher was actually supplied.
  // Computed here but NOT returned here — see the two rules it must not
  // outrank immediately below, and the graphify rules further down.
  const extensionExempt =
    EXEMPTABLE_EXTS.has(ext) &&
    !path.startsWith(PUBLISHED_DIR) &&
    extensionExceptions != null &&
    extensionExceptions.matches(path) === true;
  if (DATA_EXTS.has(ext) && !extensionExempt) return "blocked-data";
  // binary sniff: NUL byte or ZIP/OOXML magic (xlsx is a renamed zip).
  // Runs BEFORE the supabase/migrations/ .sql exception below AND before any
  // injected extension exception — unlike club logos (deliberately binary), a
  // .sql migration or an authorized .csv is expected to always be text; one
  // with a NUL byte or a `PK` (zip) magic header is never the real thing, so it
  // must still hit blocked-binary instead of being waved through. The exception
  // waives the EXTENSION rules, never the CONTENT rule.
  if (contentSample.includes(NUL) || contentSample.startsWith("PK")) return "blocked-binary";
  if (path.startsWith(SUPABASE_MIGRATIONS_DIR) && SUPABASE_MIGRATIONS_EXTS.has(ext)) return "allowed";
  if (path === "graph.json") return "blocked-graphify";
  if (path.startsWith(GRAPHIFY_OUT_DIR)) return "blocked-graphify";
  if (path.startsWith(GRAPHIFY_TOOLS_DIR)) return "blocked-graphify";
  // Only now: after the content sniff and after every absolute zone. An
  // injected list cannot reach a path any of the rules above already claimed.
  if (extensionExempt) return "allowed";
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

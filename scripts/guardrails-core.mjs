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
export function classifyTrackedFile(path, contentSample = "") {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : "";
  // Checked first and unconditionally: nothing under a worker worktree is
  // ever a legitimate tracked file, regardless of extension or content —
  // this must win over every allowlist below (club logos, supabase
  // migrations, allowed extensions), not just the blocklists.
  if (path.startsWith(WORKTREES_DIR)) return "blocked-worktree";
  if (path.startsWith(CLUB_LOGO_ASSET_DIR) && CLUB_LOGO_ASSET_EXTS.has(ext)) return "allowed";
  if (DATA_EXTS.has(ext)) return "blocked-data";
  // binary sniff: NUL byte or ZIP/OOXML magic (xlsx is a renamed zip).
  // Runs BEFORE the supabase/migrations/ .sql exception below — unlike club
  // logos (deliberately binary), a .sql file is expected to always be text;
  // one with a NUL byte or a `PK` (zip) magic header is never a real
  // migration, so it must still hit blocked-binary instead of being waved
  // through by the directory exception.
  if (contentSample.includes(NUL) || contentSample.startsWith("PK")) return "blocked-binary";
  if (path.startsWith(SUPABASE_MIGRATIONS_DIR) && SUPABASE_MIGRATIONS_EXTS.has(ext)) return "allowed";
  if (path === "graph.json") return "blocked-graphify";
  if (path.startsWith(GRAPHIFY_OUT_DIR)) return "blocked-graphify";
  if (path.startsWith(GRAPHIFY_TOOLS_DIR)) return "blocked-graphify";
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

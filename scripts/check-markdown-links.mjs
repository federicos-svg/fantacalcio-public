#!/usr/bin/env node
/**
 * Markdown link checker — real enforcement over the tracked tree.
 * Deterministic, offline, no deps beyond Node built-ins.
 *
 * After the DOC-01 consolidation (issue #258) the links between documents ARE
 * the structure: one fact, one home, links everywhere else. A broken relative
 * link is therefore an orphaned fact, not a cosmetic typo — so it fails the
 * gate exactly like repo-guardrails and secret-scan do.
 *
 * Enumerates ONLY git-tracked .md files (`git ls-files -z -- '*.md'`), so
 * gitignored trees (node_modules/, graphify-out/, .graphify-tools/,
 * .claude/worktrees/, dist/, coverage/ …) are excluded by construction rather
 * than by a hand-maintained skip list that could drift.
 *
 * NEVER performs a network request: only relative links internal to the repo
 * are verified (target file exists among tracked paths, and — when the target
 * is markdown — the heading anchor exists in it). http/https/mailto,
 * protocol-relative and repo-root-absolute `/foo` links are out of scope.
 *
 * Pure logic lives in scripts/check-markdown-links-core.mjs (shared with
 * packages/engine/tests/markdown_links.test.ts).
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkRepoLinks, findingKey } from "./check-markdown-links-core.mjs";

const NUL = String.fromCharCode(0);

// ---------------------------------------------------------------------------
// Pre-existing breakage allowlist — debt made visible, not hidden.
//
// EMPTY ON PURPOSE, and it is not a stub: when this checker landed (DOC-01
// Fase 2, PR against `main`) the tracked tree contained 152 markdown files with
// 66 markdown links in total — 43 repo-internal, 23 external — and **every**
// internal one already resolved. Nothing had to be fixed and nothing had to be
// waived, so the gate starts green on a genuinely clean tree.
//
// The mechanism stays because the point of the checker is the future: entries
// belong here only for breakage whose fix needs an editorial decision on the
// *text* (out of a guard's scope, and for the normative files out of fascia B
// entirely). A purely mechanical break — moved path, obvious typo — gets fixed,
// never allowlisted. An entry that stops matching a real finding makes this
// script FAIL: a stale waiver is as bad as a missing one.
//
// Format: `<file> -> <exact link target>` (never a line number — that would
// churn on every unrelated edit above it).
// ---------------------------------------------------------------------------
const ALLOWLIST = new Set([]);

function trackedFiles(pathspec) {
  const args = pathspec ? ` -- ${pathspec}` : "";
  const out = execSync(`git ls-files -z${args}`, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split(NUL).filter((p) => p.length > 0);
}

const allTracked = trackedFiles();
const trackedPaths = new Set(allTracked);
const trackedDirs = new Set();
for (const p of allTracked) {
  const parts = p.split("/");
  for (let i = 1; i < parts.length; i++) trackedDirs.add(parts.slice(0, i).join("/"));
}

const docs = new Map();
for (const path of trackedFiles("'*.md'")) {
  try {
    docs.set(path, readFileSync(path, "utf8"));
  } catch {
    // Unreadable tracked file (e.g. a submodule placeholder): nothing to scan.
  }
}

const { findings, allowlisted, unusedAllowlist } = checkRepoLinks({
  docs,
  trackedPaths,
  trackedDirs,
  allowlist: ALLOWLIST,
});

const REASON_TEXT = {
  "missing-file": "target file/directory not tracked in the repo",
  "missing-anchor": "no heading with that anchor in the target document",
  "escapes-repo": "relative path escapes the repository root",
};

if (findings.length > 0) {
  console.error("[CHECK-LINKS] FAIL — broken internal markdown links:");
  for (const f of findings) {
    console.error(`  - ${f.file}:${f.line} -> ${f.target} (${REASON_TEXT[f.reason] ?? f.reason})`);
  }
  console.error(
    "\nRules: relative links between tracked files must resolve, and a `#anchor` " +
      "must match a heading in the target document (GitHub slug). External " +
      "links are never fetched. Fix the link, or — only for breakage that needs " +
      "an editorial decision — add its `file -> target` key to ALLOWLIST in " +
      "scripts/check-markdown-links.mjs with a reason.",
  );
  process.exit(1);
}

if (unusedAllowlist.length > 0) {
  console.error("[CHECK-LINKS] FAIL — stale ALLOWLIST entries (link no longer broken or file gone):");
  for (const key of unusedAllowlist) console.error(`  - ${key}`);
  console.error("\nRemove them from ALLOWLIST in scripts/check-markdown-links.mjs.");
  process.exit(1);
}

const scanned = docs.size;
const suffix = allowlisted.length > 0 ? ` (${allowlisted.length} allowlisted pre-existing)` : "";
console.log(`[CHECK-LINKS] OK — ${scanned} tracked markdown files, internal links resolve${suffix}.`);

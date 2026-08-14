#!/usr/bin/env node
/**
 * Basic secret scan — deterministic, no deps beyond Node built-ins.
 * Scans project source files for suspicious patterns (real credential values).
 * Ignores: node_modules, .git, dist, coverage, build output.
 * Does NOT print matched values — reports file + line number + pattern name only.
 * Pure scan logic lives in scripts/secret-scan-core.mjs (shared with its unit tests).
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { scanFileContent } from "./secret-scan-core.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

// Directories to skip entirely
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "coverage", "build", ".turbo", ".cache",
]);

// File extensions to scan
const SCAN_EXTS = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".yml", ".yaml",
  ".toml", ".env", ".sh", ".bash",
]);

// Files to always skip (even if matching extension)
const SKIP_FILES = new Set([
  "package-lock.json",
]);

// Files whose relative path (not just basename) is always skipped — narrow,
// explicit exceptions only. secret_scan.test.ts deliberately contains
// synthetic secret-shaped fixtures (fake tokens/passwords) to unit-test
// detection itself; excluding it here is equivalent in spirit to the
// scripts/ exclusion below, and safer than relying on incidental
// DOC_SAFELIST substring matches to keep it quiet.
// publication_gate.test.ts is the same category of exception, one level up:
// it unit-tests the publication gate's own secret-pattern/PII/fingerprint
// detection (packages/engine/tests/publication_gate.test.ts), so it also
// deliberately contains synthetic secret- and PII-shaped fixtures (never a
// real credential/domain/identifier).
const SKIP_RELPATHS = new Set([
  "packages/engine/tests/secret_scan.test.ts",
  "packages/engine/tests/publication_gate.test.ts",
]);

// Directories skipped by relative path (not by bare name, which would match
// any similarly-named directory anywhere in the tree).
//
// .claude/worktrees: git worktree dei worker temporanei delegati
// dall'Executive (Team Charter §Struttura). Contengono una copia dell'albero
// del repo, quindi le eccezioni per path di questo scanner — su tutte lo skip
// di `scripts/` a riga ~65 — non matchano più, e file che passano al loro
// path reale risultano finding solo perché annidati. Il lato meccanico è
// vero: dentro il worktree di un worker la root si risolve al worktree
// stesso, quindi i path tornano a matchare e la copertura lì dentro è
// intatta. Ma che OGNI worker lanci effettivamente il proprio `secret-scan`/
// `verify` dentro il suo worktree non è imposto da nulla in questo file: è
// una convenzione operativa (CLAUDE.md §"Comandi standard", che documenta
// `npm run verify` come gate completo prima del push), non una proprietà
// del codice — uno skip qui non la
// garantisce da solo. Quello che vincola davvero la coppia (voce
// `.claude/worktrees/` in .gitignore + questo skip) è la regola
// `blocked-worktree` in scripts/guardrails-core.mjs: qualunque file tracciato
// sotto `.claude/worktrees/` fa fallire `verify` a prescindere da chi o dove
// lo esegue, e gira anche in CI (dove questa directory non esiste mai) senza
// bisogno che nessuno la eserciti.
const SKIP_RELDIRS = new Set([
  join(".claude", "worktrees"),
]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_RELDIRS.has(relative(ROOT, full))) continue;
      walk(full, files);
    } else {
      const ext = entry.includes(".") ? "." + entry.split(".").pop() : "";
      if (SCAN_EXTS.has(ext) && !SKIP_FILES.has(entry)) {
        files.push(full);
      }
    }
  }
  return files;
}

let findings = 0;
const files = walk(ROOT);

for (const file of files) {
  const rel = relative(ROOT, file);
  // Skip this script itself and the preflight script
  if (rel.startsWith("scripts/")) continue;
  if (SKIP_RELPATHS.has(rel)) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const finding of scanFileContent(rel, content)) {
    console.error(`[SECRET-SCAN] ${finding.file}:${finding.line} — pattern: ${finding.pattern}`);
    findings++;
  }
}

if (findings === 0) {
  console.log("[SECRET-SCAN] OK — no suspicious patterns found.");
  process.exit(0);
} else {
  console.error(`[SECRET-SCAN] FAIL — ${findings} finding(s). Review before push.`);
  process.exit(1);
}

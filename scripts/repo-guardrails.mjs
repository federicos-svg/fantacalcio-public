#!/usr/bin/env node
/**
 * Repo guardrails — real enforcement over the tracked tree.
 * Deterministic, no deps beyond Node built-ins.
 *
 * Enumerates ONLY git-tracked files (`git ls-files -z`) — so it never walks
 * node_modules/build output and produces no false positives there. Each file is
 * classified by the shared pure logic in guardrails-core.mjs; PROJECT_STATE.md is
 * linted against auto-stale fields. Exits non-zero (fails `verify`/CI) on any offender.
 *
 * Does NOT scan secret patterns — that stays in scripts/secret-scan.mjs.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { classifyTrackedFile, lintProjectState } from "./guardrails-core.mjs";

const NUL = String.fromCharCode(0);

function trackedFiles() {
  const out = execSync("git ls-files -z", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split(NUL).filter((p) => p.length > 0);
}

function sampleBytes(path) {
  try {
    return readFileSync(path).subarray(0, 16).toString("latin1");
  } catch {
    return ""; // unreadable (e.g. submodule) -> treated as empty sample
  }
}

const offenders = [];

for (const path of trackedFiles()) {
  const verdict = classifyTrackedFile(path, sampleBytes(path));
  if (verdict !== "allowed") offenders.push(`${verdict}: ${path}`);
}

try {
  const ps = readFileSync("PROJECT_STATE.md", "utf8");
  for (const err of lintProjectState(ps)) offenders.push(`project-state ${err}`);
} catch {
  offenders.push("project-state: PROJECT_STATE.md not found");
}

if (offenders.length > 0) {
  console.error("[REPO-GUARDRAILS] FAIL — blocked entries:");
  for (const o of offenders) console.error(`  - ${o}`);
  console.error(
    "\nRules: no .xlsx/.xls/.csv or binary payloads; only known text/source kinds; " +
      "graphify-out/ is never tracked (Leiden clustering isn't run-to-run " +
      "deterministic — see CLAUDE.md), no root graph.json; " +
      ".claude/worktrees/ (worker checkouts) is never tracked — a tracked file " +
      "there means it was forced with `git add -f` or the .gitignore entry was " +
      "removed; " +
      "PROJECT_STATE.md must not carry HEAD sha / hand-written test count.",
  );
  process.exit(1);
}

console.log("[REPO-GUARDRAILS] OK — tracked tree clean, PROJECT_STATE.md not auto-stale.");

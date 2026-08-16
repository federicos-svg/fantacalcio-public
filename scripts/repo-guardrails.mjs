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
 *
 * Extension exceptions (guardrails-core.mjs §"Extension exceptions"): a host
 * repository with a written, scoped authorization to track otherwise-blocked
 * DATA files declares them in a tracked `guardrails.exceptions.json` at the
 * repo root. No file -> no exceptions -> the strict default. The list lives
 * with the repository that owns the authorization; the logic — and the ceiling
 * on which file KINDS a list may ever reach — stays here.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  classifyTrackedFile,
  compileExtensionExceptions,
  lintProjectState,
  NO_EXTENSION_EXCEPTIONS,
} from "./guardrails-core.mjs";

const NUL = String.fromCharCode(0);
const EXCEPTIONS_FILE = "guardrails.exceptions.json";

function trackedFiles() {
  const out = execSync("git ls-files -z", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split(NUL).filter((p) => p.length > 0);
}

function die(message) {
  console.error(`[REPO-GUARDRAILS] FAIL — ${message}`);
  process.exit(1);
}

/**
 * Load the host repository's exception list, if it has one.
 *
 * Three deliberate properties:
 *  - absent file -> strict default, silently (the common case, and the only
 *    case in a repository with no such authorization);
 *  - present but untracked -> HARD FAIL. An untracked file on one machine
 *    would quietly loosen local runs while CI, which clones fresh, stays
 *    strict — the exact asymmetry a guardrail must not have;
 *  - present but malformed, over-broad or dead -> HARD FAIL with the reason.
 *    Never "ignore the bad list and carry on strict": a list that was meant
 *    to apply and silently did not is how a green run stops meaning anything.
 */
function loadExtensionExceptions() {
  let raw;
  try {
    raw = readFileSync(EXCEPTIONS_FILE, "utf8");
  } catch {
    return NO_EXTENSION_EXCEPTIONS;
  }
  try {
    execSync(`git ls-files --error-unmatch -- ${EXCEPTIONS_FILE}`, { stdio: "ignore" });
  } catch {
    die(
      `${EXCEPTIONS_FILE} exists but is not tracked by git. An untracked exception ` +
        `list loosens this machine and nothing else — commit it or remove it.`,
    );
  }
  let spec;
  try {
    spec = JSON.parse(raw);
  } catch (err) {
    die(`${EXCEPTIONS_FILE} is not valid JSON: ${err.message}`);
  }
  try {
    return compileExtensionExceptions(spec);
  } catch (err) {
    die(`${EXCEPTIONS_FILE} rejected — ${err.message}`);
  }
  return NO_EXTENSION_EXCEPTIONS; // unreachable — die() exits
}

function sampleBytes(path) {
  try {
    return readFileSync(path).subarray(0, 16).toString("latin1");
  } catch {
    return ""; // unreadable (e.g. submodule) -> treated as empty sample
  }
}

const offenders = [];
const extensionExceptions = loadExtensionExceptions();

for (const path of trackedFiles()) {
  const verdict = classifyTrackedFile(path, sampleBytes(path), extensionExceptions);
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

// The exception count is printed on success, never left implicit: a run that
// was permitted by an injected list must say so in its own output.
const exceptionsNote =
  extensionExceptions.size > 0
    ? ` ${extensionExceptions.size} extension exception(s) active from ${EXCEPTIONS_FILE}.`
    : "";
console.log(
  `[REPO-GUARDRAILS] OK — tracked tree clean, PROJECT_STATE.md not auto-stale.${exceptionsNote}`,
);

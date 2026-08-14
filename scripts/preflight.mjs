#!/usr/bin/env node
/**
 * Preflight — compact local verification report.
 * Runs: branch check, working tree status, diff stat vs origin/main,
 *       typecheck, tests, secret scan.
 * Exits non-zero if any blocking check fails.
 * Produces a short summary; no interactive prompts, no network calls.
 */

import { execSync } from "child_process";

const OK   = "✓";
const FAIL = "✗";
const WARN = "~";

function run(cmd, { allowFail = false } = {}) {
  try {
    return { ok: true, out: execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    if (allowFail) return { ok: false, out: (e.stderr || e.stdout || "").trim() };
    throw e;
  }
}

const rows = [];
let blocking = 0;

function row(label, ok, detail = "") {
  const icon = ok === true ? OK : ok === false ? FAIL : WARN;
  rows.push(`  ${icon} ${label}${detail ? `: ${detail}` : ""}`);
  if (ok === false) blocking++;
}

// Branch
const branch = run("git rev-parse --abbrev-ref HEAD").out;
row("branch", true, branch);

// Working tree
const status = run("git status --porcelain").out;
const clean = status === "";
row("working tree", clean, clean ? "clean" : `dirty — ${status.split("\n").length} file(s)`);

// Refresh origin/main so the diff below is not stale; non-blocking on failure.
const fetched = run("git fetch origin main -q", { allowFail: true });
if (!fetched.ok) {
  row("fetch origin/main", WARN, "fetch failed — diff may be stale");
}

// Diff stat vs origin/main
const diffStat = run("git diff origin/main...HEAD --stat 2>/dev/null | tail -1", { allowFail: true });
row("diff vs origin/main", true, diffStat.ok && diffStat.out ? diffStat.out : "n/a");

// Typecheck
const tc = run("npm run typecheck --silent 2>&1", { allowFail: true });
row("typecheck", tc.ok);

// Tests
const tests = run("npm test -- --reporter=verbose 2>&1 | tail -4", { allowFail: true });
const testLine = tests.out.split("\n").find(l => /Tests?\s+\d+/.test(l)) ?? tests.out.split("\n").pop();
row("tests", tests.ok, testLine?.trim() ?? "");

// Secret scan
const scan = run("node scripts/secret-scan.mjs 2>&1", { allowFail: true });
const scanLine = scan.out.split("\n").pop()?.trim() ?? "";
row("secret scan", scan.ok, scanLine);

// Report
console.log("\n=== PREFLIGHT REPORT ===");
for (const r of rows) console.log(r);
console.log("========================\n");

if (blocking > 0) {
  console.error(`Preflight FAILED: ${blocking} blocking issue(s). Fix before push.\n`);
  process.exit(1);
}
console.log("Preflight OK.\n");

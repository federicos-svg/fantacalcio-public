#!/usr/bin/env node
/**
 * Publication security gate — real enforcement over the tracked tree.
 * Deterministic, no deps beyond Node built-ins.
 *
 * Purpose: this tree is a candidate for a future public repository. This
 * gate is the last mechanical checkpoint before anything in it is safe to
 * publish — it fails loudly (non-zero exit, explicit violation list) on a
 * forbidden top-level entry, a forbidden path (private packages/automation/
 * docs/etc.), a real-data or key-material extension, a secret-shaped string,
 * a literal PII email address, one of nine hand-picked private identifiers
 * (matched by sha256 fingerprint — the cleartext values live only in
 * scripts/publication-gate.fingerprints.json as hashes, never in this repo),
 * or an unexpected binary payload.
 *
 * Enumerates `git ls-files -z` — the git INDEX, which already includes
 * staged-but-uncommitted additions (a `git add`ed file shows up here before
 * it is ever committed). That is deliberate: it is the same enumeration
 * repo-guardrails.mjs and check-markdown-links.mjs use, and it means a file
 * only needs to be staged (not committed) to be checked — the self-test in
 * the brief relies on exactly this to inject and then retract synthetic
 * violations without polluting history.
 *
 * Pure rule logic lives in scripts/publication-gate-core.mjs (shared with its
 * unit tests). This file only does I/O: listing tracked paths, reading file
 * content/byte samples, loading the fingerprint hash set, and formatting.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { evaluateTrackedFile } from "./publication-gate-core.mjs";

const NUL = String.fromCharCode(0);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const FINGERPRINTS_PATH = join(HERE, "publication-gate.fingerprints.json");

function trackedFiles() {
  const out = execSync("git ls-files -z", {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split(NUL).filter((p) => p.length > 0);
}

function loadFingerprintHashes() {
  let raw;
  try {
    raw = readFileSync(FINGERPRINTS_PATH, "utf8");
  } catch (err) {
    console.error(`[PUBLICATION-GATE] FAIL — cannot read ${FINGERPRINTS_PATH}: ${err.message}`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[PUBLICATION-GATE] FAIL — ${FINGERPRINTS_PATH} is not valid JSON: ${err.message}`);
    process.exit(1);
  }
  const entries = Array.isArray(parsed.fingerprints) ? parsed.fingerprints : [];
  const hashes = new Set();
  for (const entry of entries) {
    const hash = typeof entry === "string" ? entry : entry?.hash;
    if (typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash)) {
      hashes.add(hash);
    }
  }
  return hashes;
}

function readSample(path) {
  try {
    return readFileSync(join(ROOT, path)).subarray(0, 16).toString("latin1");
  } catch {
    return ""; // unreadable (e.g. submodule placeholder) -> treated as empty sample
  }
}

function readContent(path) {
  try {
    return readFileSync(join(ROOT, path), "utf8");
  } catch {
    return null; // unreadable as text -> structural checks still run, content checks skipped
  }
}

const RULE_LABELS = {
  "forbidden-top-level": "FORBIDDEN TOP-LEVEL",
  "forbidden-path": "FORBIDDEN PATH",
  "forbidden-extension": "FORBIDDEN EXTENSION",
  "secret-pattern": "SECRET PATTERN",
  "pii-email": "PII",
  "private-fingerprint": "PRIVATE FINGERPRINT",
  "unexpected-binary": "UNEXPECTED BINARY",
};

async function main() {
  const fingerprintHashes = loadFingerprintHashes();
  const paths = trackedFiles();
  const allFindings = [];

  for (const path of paths) {
    const contentSample = readSample(path);
    const content = readContent(path);
    const findings = await evaluateTrackedFile({ path, content, contentSample, fingerprintHashes });
    allFindings.push(...findings);
  }

  if (allFindings.length > 0) {
    console.error(`[PUBLICATION-GATE] FAIL — ${allFindings.length} violation(s):`);
    for (const f of allFindings) {
      const label = RULE_LABELS[f.rule] ?? f.rule;
      const loc = f.line ? `${f.path}:${f.line}` : f.path;
      console.error(`  - [${label}] ${loc} — ${f.detail}`);
    }
    console.error(
      "\nThis tree is a candidate for a future PUBLIC repository — nothing here may " +
        "carry private packages, automation/acquisition code, docs/, credentials, PII, " +
        "real data, or the nine fingerprinted private identifiers. Fix or remove the " +
        "offending file(s); do not widen an allowlist to make a real violation pass.",
    );
    process.exit(1);
  }

  console.log(`[PUBLICATION-GATE] OK — ${paths.length} tracked files clean for publication.`);
  process.exit(0);
}

main();

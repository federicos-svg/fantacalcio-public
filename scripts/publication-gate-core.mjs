// Publication-gate core — PURE logic, NO Node imports (string-only).
// Single source of truth shared by:
//   - scripts/publication-gate.mjs                    (real enforcement over `git ls-files`)
//   - packages/engine/tests/publication_gate.test.ts  (synthetic unit tests)
// Same split as guardrails-core.mjs / secret-scan-core.mjs / check-markdown-links-core.mjs:
// keeping this dependency-free lets the TypeScript test import it (tsconfig
// allowJs) without pulling Node globals or needing @types/node — and lets the
// CLI stay a thin adapter that only does I/O (git ls-files, readFileSync).
//
// What this gate is for: this tree is a CANDIDATE for a future public repo.
// Everything in it must be safe to put in front of the entire internet. This
// module is the last mechanical checkpoint before that happens — it does not
// replace human review, it catches the boring, deterministic ways a private
// detail slips through (wrong top-level entry, a private package directory,
// a spreadsheet, a credential-shaped string, a stray email address, or one of
// nine specific private identifiers the owner enumerated by hand).
//
// Two of the seven rule families are reused, not reimplemented, from their
// existing single sources of truth:
//   - secret-pattern detection  -> scripts/secret-scan-core.mjs (scanFileContent)
//   - the data/binary extension list -> scripts/guardrails-core.mjs (DATA_EXTS)
// Duplicating either list here would let them drift; importing keeps this
// gate exactly as strict as (and never weaker than) the checks it builds on.

import {
  scanFileContent as scanSecretPatterns,
  PATTERNS as SECRET_PATTERNS,
  DOC_SAFELIST as SECRET_DOC_SAFELIST,
} from "./secret-scan-core.mjs";
import { DATA_EXTS as GUARDRAILS_DATA_EXTS } from "./guardrails-core.mjs";

export { SECRET_PATTERNS, SECRET_DOC_SAFELIST };

// ---------------------------------------------------------------------------
// 1. FORBIDDEN TOP-LEVEL — every tracked file's top-level path segment (its
//    first `/`-delimited component, or the whole path if it has none) must be
//    in this allowlist. This is deliberately closed, not an "everything
//    except X" denylist: a new top-level entry that nobody thought to name
//    fails loudly instead of silently landing in the public tree.
// ---------------------------------------------------------------------------
export const ALLOWED_TOP_LEVEL_DIRS = new Set([
  "src",
  "packages",
  "e2e",
  "schemas",
  "fixtures",
  "scripts",
  "public",
  ".github",
]);

export const ALLOWED_TOP_LEVEL_FILES = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vitest.config.ts",
  "playwright.config.ts",
  "index.html",
  ".gitignore",
  "README.md",
  "CLAUDE.md",
  "PROJECT_STATE.md",
]);

const ALLOWED_TOP_LEVEL = new Set([...ALLOWED_TOP_LEVEL_DIRS, ...ALLOWED_TOP_LEVEL_FILES]);

/** The first path segment of a tracked path: `"packages/engine/x.ts"` -> `"packages"`. */
export function topLevelEntry(path) {
  const idx = path.indexOf("/");
  return idx === -1 ? path : path.slice(0, idx);
}

export function checkForbiddenTopLevel(path) {
  const entry = topLevelEntry(path);
  if (ALLOWED_TOP_LEVEL.has(entry)) return null;
  return { rule: "forbidden-top-level", detail: `top-level entry "${entry}" not in the public allowlist` };
}

// ---------------------------------------------------------------------------
// 2. FORBIDDEN PATHS — never allowed in the public tree, regardless of top-
//    level entry (some of these, e.g. private package names, can nest under
//    an otherwise-allowed top-level dir like `packages/`, so check 1 alone
//    would not catch them).
// ---------------------------------------------------------------------------

// Whole directories that never belong in the public tree.
export const FORBIDDEN_DIR_SEGMENTS = ["automations", "functions", "supabase", "docs", ".claude"];

// Private package directory names (acquisition/serving/proxy layer) — banned
// as a path segment anywhere, not just at the top level, since they live
// under `packages/` (allowed) or `scripts/` (allowed) in the private repo.
export const FORBIDDEN_PACKAGE_SEGMENTS = [
  "algorithm-factory",
  "cloudflare-proxy",
  "listone-live-serve",
  "data-connectors",
  "transfermarkt-adapter",
  "api-football-adapter",
  "api-football-coverage-profiler",
  "foreign-index",
  "gruppo-esperti",
];

// Exact basenames that are never public regardless of directory.
export const FORBIDDEN_EXACT_BASENAMES = ["PROJECT_HISTORY.md"];

// Path prefixes banned outright (club-logo assets are a private-repo-only
// exception in guardrails-core.mjs; the public gate is deliberately stricter
// here and forbids the whole subtree, per the brief).
export const FORBIDDEN_PATH_PREFIXES = ["public/assets/"];

// Private lib modules banned by filename prefix under scripts/lib/.
export const PRIVATE_LIB_PREFIXES = [
  "scripts/lib/privateDriveClient",
  "scripts/lib/privateSeasonRecords",
  "scripts/lib/anagraficaDeposit",
];

function basenameOf(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** True if `segment` appears as a whole path component of `path` (never a bare substring match). */
function hasPathSegment(path, segment) {
  return (
    path === segment ||
    path.startsWith(`${segment}/`) ||
    path.endsWith(`/${segment}`) ||
    path.includes(`/${segment}/`)
  );
}

export function checkForbiddenPath(path) {
  const basename = basenameOf(path);

  for (const seg of FORBIDDEN_DIR_SEGMENTS) {
    if (hasPathSegment(path, seg)) {
      return { rule: "forbidden-path", detail: `forbidden directory segment "${seg}"` };
    }
  }
  for (const seg of FORBIDDEN_PACKAGE_SEGMENTS) {
    if (hasPathSegment(path, seg)) {
      return { rule: "forbidden-path", detail: `private package segment "${seg}"` };
    }
  }
  if (FORBIDDEN_EXACT_BASENAMES.includes(basename)) {
    return { rule: "forbidden-path", detail: `forbidden file "${basename}"` };
  }
  for (const prefix of FORBIDDEN_PATH_PREFIXES) {
    if (path.startsWith(prefix)) {
      return { rule: "forbidden-path", detail: `forbidden path prefix "${prefix}"` };
    }
  }
  for (const prefix of PRIVATE_LIB_PREFIXES) {
    if (path.startsWith(prefix)) {
      return { rule: "forbidden-path", detail: `private lib module "${prefix}"` };
    }
  }
  if (/\.workflow\.json$/i.test(basename)) {
    return { rule: "forbidden-path", detail: "*.workflow.json export" };
  }
  if (/^\.env(?:\.|$)/i.test(basename)) {
    return { rule: "forbidden-path", detail: "dotenv-shaped filename" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. FORBIDDEN EXTENSIONS — real data / private-key payload formats.
//    Reuses guardrails-core's DATA_EXTS (spreadsheet/binary formats) and adds
//    the key-material extensions the brief calls out; this gate still fails
//    on its own even if `npm run repo-guardrails` is never run.
// ---------------------------------------------------------------------------
export const FORBIDDEN_EXTENSIONS = new Set([...GUARDRAILS_DATA_EXTS, ".pem", ".p12", ".key"]);

export function checkForbiddenExtension(path) {
  const basename = basenameOf(path);
  const dot = basename.lastIndexOf(".");
  if (dot <= 0) return null; // no extension, or a dotfile with no extension (".env" handled above)
  const ext = basename.slice(dot).toLowerCase();
  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    return { rule: "forbidden-extension", detail: ext };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. SECRET PATTERNS — delegated entirely to secret-scan-core.mjs.
//
// Narrow, explicit, documented exception: `.gitignore` — its bare `.env` /
// `.env.*` lines are gitignore patterns describing what to exclude, not an
// actual dotenv file or a secret, but they are exactly what
// secret-scan-core.mjs's own `dotenv-file` pattern matches (a line that IS
// `.env`/`.env.<word>`). The sibling scripts/secret-scan.mjs never hits this:
// it only scans a fixed SCAN_EXTS list and ".gitignore"'s "extension" (the
// whole filename, since it starts with a dot) is not in that list, so it is
// implicitly skipped there. This gate deliberately scans every tracked file
// regardless of extension (broader coverage is the point), so the one file
// where that broader coverage produces this specific false positive needs an
// explicit exception instead of narrowing SCAN_EXTS gate-wide.
//
// packages/engine/tests/secret_scan.test.ts and
// packages/engine/tests/publication_gate.test.ts: both deliberately contain
// synthetic secret-shaped fixtures (fake tokens/passwords) to unit-test
// detection itself — the same reason scripts/secret-scan.mjs's own
// SKIP_RELPATHS excludes them from its real scan. This gate reuses
// scanFileContent over every tracked file (not scoped to SCAN_EXTS the way
// secret-scan.mjs is), so it needs the same two exceptions explicitly.
export const SECRET_PATTERN_PATH_SAFELIST = new Set([
  ".gitignore",
  "packages/engine/tests/secret_scan.test.ts",
  "packages/engine/tests/publication_gate.test.ts",
]);

export function checkSecretPatterns(path, content) {
  if (SECRET_PATTERN_PATH_SAFELIST.has(path)) return [];
  return scanSecretPatterns(path, content).map((f) => ({
    rule: "secret-pattern",
    detail: f.pattern,
    line: f.line,
  }));
}

// ---------------------------------------------------------------------------
// 5. PII — literal email addresses, except a narrow domain safelist and a
//    narrow, explicit, documented path safelist (never a heuristic).
// ---------------------------------------------------------------------------
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Explicit path safelist — narrow and documented, not a heuristic:
//   - package-lock.json: npm embeds real third-party maintainer contact
//     addresses verbatim in deprecation notices (the `glob` package's
//     deprecation message ships its maintainer's personal contact address) —
//     present in effectively every lockfile with a legacy `glob` transitive
//     dependency. It is public open-source metadata generated by
//     `npm install`, not this project's PII, and scripts/secret-scan.mjs
//     already special-cases this exact file for the same reason (its own
//     SKIP_FILES entry). Deliberately not reproduced here even as an
//     example: this file is itself scanned by this same rule.
//   - packages/engine/tests/secret_scan.test.ts: the existing secret-scan
//     synthetic-fixture test file named explicitly in the brief.
//   - packages/engine/tests/publication_gate.test.ts: this gate's own test
//     file, which deliberately contains synthetic non-exempt-domain email
//     fixtures (dummy addresses on a dummy test-only domain) to unit-test
//     checkEmailPII itself — never a real address. Also not reproduced here
//     for the same self-scanning reason.
export const PII_EMAIL_PATH_SAFELIST = new Set([
  "package-lock.json",
  "packages/engine/tests/secret_scan.test.ts",
  "packages/engine/tests/publication_gate.test.ts",
]);

function isExemptEmail(email) {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1).toLowerCase();
  if (local === "noreply") return true;
  if (domain === "example.com" || domain.endsWith(".example.com")) return true;
  if (domain === "invalid" || domain.endsWith(".invalid")) return true;
  if (domain === "local" || domain.endsWith(".local")) return true;
  if (domain.split(".").includes("noreply")) return true; // e.g. users.noreply.github.com
  return false;
}

export function findEmails(content) {
  const results = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(EMAIL_REGEX)) {
      results.push({ email: m[0], line: i + 1 });
    }
  }
  return results;
}

// Never includes the matched address itself in the returned finding — same
// discipline as secret-scan-core.mjs's scanFileContent.
export function checkEmailPII(path, content) {
  if (PII_EMAIL_PATH_SAFELIST.has(path)) return [];
  const findings = [];
  for (const { email, line } of findEmails(content)) {
    if (isExemptEmail(email)) continue;
    findings.push({ rule: "pii-email", detail: "literal email address", line });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 6. PRIVATE-IDENTIFIER FINGERPRINTS — the crucial rule. Candidate tokens are
//    extracted with generic shape regexes (never anything specific to the
//    real banned values — those never appear in this file), hashed, and
//    compared against scripts/publication-gate.fingerprints.json's hash set.
//    A hit is reported as file + line + token TYPE + first 8 hex chars of the
//    hash — never the cleartext, never the full hash (which would itself let
//    a reader dictionary-confirm a guess).
// ---------------------------------------------------------------------------
const DOMAIN_REGEX = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
const UUID_REGEX = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
const HEX32_REGEX = /\b[0-9a-fA-F]{32}\b/g;
// Generic bearer-token shape. Restricted to candidates containing at least
// one digit (checked after the regex match, see extractCandidateTokens):
// real secrets/tokens are near-universally alphanumeric, while long
// English/camelCase identifiers in source code are near-universally
// digit-free — this keeps the candidate set small without narrowing what a
// real token can look like.
const GENERIC_TOKEN_REGEX = /\b[A-Za-z0-9_-]{25,45}\b/g;

// Ordered most- to least-specific. GENERIC_TOKEN_REGEX's character class
// (alnum + "_-") structurally overlaps every other shape (a uuid or hex32
// span, being digits/letters/hyphens 25-45 chars long, also satisfies it) —
// without de-duplication the same literal span would be extracted twice,
// under two different `type` labels, and (once hashed) reported as two
// separate FAILs for one occurrence. See dedupeByLineAndToken below.
const TOKEN_EXTRACTORS = [
  ["email", EMAIL_REGEX],
  ["domain", DOMAIN_REGEX],
  ["uuid", UUID_REGEX],
  ["hex32", HEX32_REGEX],
  ["token", GENERIC_TOKEN_REGEX],
];
const TYPE_PRIORITY = new Map(TOKEN_EXTRACTORS.map(([type], i) => [type, i]));

// Keeps the most specific classification when two extractors match the exact
// same (line, token) span — e.g. a uuid- or hex32-shaped value is also, by
// construction, a syntactically valid "generic token" match.
function dedupeByLineAndToken(candidates) {
  const best = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.line}:${candidate.token}`;
    const existing = best.get(key);
    if (!existing || TYPE_PRIORITY.get(candidate.type) < TYPE_PRIORITY.get(existing.type)) {
      best.set(key, candidate);
    }
  }
  return [...best.values()];
}

export function extractCandidateTokens(content) {
  const out = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const [type, regex] of TOKEN_EXTRACTORS) {
      for (const m of line.matchAll(regex)) {
        const token = m[0];
        if (type === "token" && !/\d/.test(token)) continue;
        out.push({ type, token, line: i + 1 });
      }
    }
  }
  return dedupeByLineAndToken(out);
}

// Web Crypto (`crypto.subtle`, `TextEncoder`) — a runtime global in both
// Node and browsers, not a `node:*` import, so hashing stays in this
// dependency-free core instead of needing to be injected by the CLI the way
// real I/O is in push-audit-core.mjs/git-hooks-core.mjs. tsconfig.json
// already includes the `DOM` lib, so these globals are typed for free.
export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Checks one file's content for candidate tokens whose sha256 hash (raw
 * case, and lowercased when different) is in `fingerprintHashes`. Per-file
 * hash memoization keeps repeated tokens (e.g. the same import-path-shaped
 * substring on many lines) cheap.
 */
export async function checkFingerprints(path, content, fingerprintHashes) {
  const hashes = fingerprintHashes ?? new Set();
  const findings = [];
  const hashCache = new Map();
  async function hashOf(text) {
    if (!hashCache.has(text)) hashCache.set(text, await sha256Hex(text));
    return hashCache.get(text);
  }
  for (const { type, token, line } of extractCandidateTokens(content)) {
    let hit = null;
    const hRaw = await hashOf(token);
    if (hashes.has(hRaw)) {
      hit = hRaw;
    } else {
      const lower = token.toLowerCase();
      if (lower !== token) {
        const hLower = await hashOf(lower);
        if (hashes.has(hLower)) hit = hLower;
      }
    }
    if (hit) {
      findings.push({
        rule: "private-fingerprint",
        detail: `banned ${type} fingerprint (hash ${hit.slice(0, 8)}…)`,
        line,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 7. UNEXPECTED BINARY — no binary payload is expected anywhere in this tree
//    right now (no allowlisted directory/extension, unlike the private
//    repo's club-logo exception). Same NUL-byte / zip-magic sniff as
//    guardrails-core.mjs's blocked-binary classification.
// ---------------------------------------------------------------------------
const NUL = String.fromCharCode(0);

export function isBinarySample(sample) {
  if (!sample) return false;
  if (sample.includes(NUL)) return true;
  if (sample.startsWith("PK")) return true; // zip/OOXML magic (xlsx/docx/etc. are renamed zips)
  return false;
}

export function checkUnexpectedBinary(path, sample) {
  if (isBinarySample(sample ?? "")) {
    return { rule: "unexpected-binary", detail: "binary content sniffed, no binary allowlisted for this tree" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Integration point — runs every rule for one tracked file. Content-dependent
// checks (secret patterns, PII, fingerprints) only run when `content` is a
// string; structural checks (top-level, forbidden path, extension, binary
// sniff) always run. Every finding carries `path` so the CLI can just flatten
// and print.
// ---------------------------------------------------------------------------
export async function evaluateTrackedFile({ path, content, contentSample, fingerprintHashes = new Set() }) {
  const findings = [];

  const topLevel = checkForbiddenTopLevel(path);
  if (topLevel) findings.push(topLevel);

  const forbiddenPath = checkForbiddenPath(path);
  if (forbiddenPath) findings.push(forbiddenPath);

  const forbiddenExt = checkForbiddenExtension(path);
  if (forbiddenExt) findings.push(forbiddenExt);

  const binary = checkUnexpectedBinary(path, contentSample);
  if (binary) findings.push(binary);

  if (typeof content === "string") {
    findings.push(...checkSecretPatterns(path, content));
    findings.push(...checkEmailPII(path, content));
    findings.push(...(await checkFingerprints(path, content, fingerprintHashes)));
  }

  return findings.map((f) => ({ path, ...f }));
}

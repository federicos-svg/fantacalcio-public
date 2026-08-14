// Secret-scan core — PURE logic, NO Node imports (string-only).
// Single source of truth shared by:
//   - scripts/secret-scan.mjs               (real enforcement, walks the filesystem)
//   - packages/engine/tests/secret_scan.test.ts (synthetic unit tests)
// Keeping this file dependency-free lets the TypeScript test import it
// (tsconfig allowJs) without pulling Node globals or needing @types/node.
// Mirrors the shape of scripts/guardrails-core.mjs.

// Patterns that suggest a real credential value. Each entry: { name, regex }.
// Regex must match a line that looks like an assignment with a real value,
// not just a word in prose/docs.
export const PATTERNS = [
  { name: "generic-secret-assignment", regex: /(?:secret|password|passwd|token|api[_-]?key|auth[_-]?key|private[_-]?key|bearer)\s*[=:]\s*["']?[A-Za-z0-9+/._\-]{8,}/i },
  { name: "env-var-with-value",         regex: /^[A-Z][A-Z0-9_]{3,}\s*=\s*["']?[A-Za-z0-9+/._\-]{8,}["']?/m },
  { name: "cloudflare-api-token",       regex: /CF_API_TOKEN\s*[=:]\s*\S+/i },
  { name: "r2-access-key",              regex: /R2[_-]?(?:ACCESS|SECRET|KEY)\s*[=:]\s*\S+/i },
  { name: "database-url",               regex: /DATABASE_URL\s*[=:]\s*["']?\w+:\/\/\S+/i },
  { name: "private-key-block",          regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: "dotenv-file",                regex: /^\.env(?:\.\w+)?$/m },
];

// Lines that are obviously doc/prose references to no-go items — skip.
export const DOC_SAFELIST = /(?:no.go|out.of.scope|fuori|previsti|non.attivo|non.fare|secrets\/env|vedi|esempio|pattern|scan|regex|placeholder|comment|#)/i;

/**
 * Pure scanner — no I/O. Scans `content` line by line for the PATTERNS above,
 * skipping lines matched by DOC_SAFELIST. Returns findings as
 * { file, line, pattern }[] (1-indexed line numbers), never the matched value.
 */
export function scanFileContent(relPath, content) {
  const findings = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (DOC_SAFELIST.test(line)) continue;
    for (const { name, regex } of PATTERNS) {
      if (regex.test(line)) {
        findings.push({ file: relPath, line: i + 1, pattern: name });
      }
    }
  }
  return findings;
}

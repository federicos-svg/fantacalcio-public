import { describe, it, expect } from "vitest";
// Single source of truth (pure, dependency-free). Imported here (tsconfig allowJs)
// AND by scripts/secret-scan.mjs which enforces the same rules over the filesystem.
import { scanFileContent, PATTERNS, DOC_SAFELIST } from "../../../scripts/secret-scan-core.mjs";

// Every "secret-looking" value below is a synthetic fixture (obviously fake,
// never a real credential) — same convention as packages/cloudflare-proxy's
// TEST_ENV fixtures. This test asserts DETECTION, never leaks a real value.

describe("scanFileContent — detects suspicious patterns", () => {
  it("flags a generic secret/token/password assignment", () => {
    const findings = scanFileContent("fixture.ts", 'const token = "abcd1234efgh5678";\n');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({ file: "fixture.ts", line: 1, pattern: "generic-secret-assignment" });
  });

  it("flags an UPPER_CASE env-var-shaped assignment with a real-looking value", () => {
    const findings = scanFileContent("fixture.env", "MY_SECRET_VALUE=abcdefgh12345678\n");
    expect(findings.some((f) => f.pattern === "env-var-with-value")).toBe(true);
  });

  it("flags a Cloudflare API token assignment", () => {
    const findings = scanFileContent("fixture.sh", "CF_API_TOKEN=abcd1234efgh5678\n");
    expect(findings.some((f) => f.pattern === "cloudflare-api-token")).toBe(true);
  });

  it("flags an R2 access/secret key assignment", () => {
    const findings = scanFileContent("fixture.sh", "R2_ACCESS=abcd1234efgh5678\n");
    expect(findings.some((f) => f.pattern === "r2-access-key")).toBe(true);
  });

  it("flags a DATABASE_URL with a connection string", () => {
    const findings = scanFileContent("fixture.env", "DATABASE_URL=postgres://user:pass@host/db\n");
    expect(findings.some((f) => f.pattern === "database-url")).toBe(true);
  });

  it("flags a PEM private key block", () => {
    const findings = scanFileContent("fixture.pem", "-----BEGIN RSA PRIVATE KEY-----\n");
    expect(findings.some((f) => f.pattern === "private-key-block")).toBe(true);
  });

  it("flags content whose own line is exactly a dotenv filename (e.g. pasted into a script/doc)", () => {
    const findings = scanFileContent("fixture.sh", ".env\n");
    expect(findings.some((f) => f.pattern === "dotenv-file")).toBe(true);
  });

  it("reports 1-indexed line numbers, not 0-indexed", () => {
    const findings = scanFileContent("fixture.ts", 'const a = 1;\nconst token = "abcd1234efgh5678";\n');
    expect(findings[0]!.line).toBe(2);
  });

  it("never includes the matched value itself in a finding", () => {
    const findings = scanFileContent("fixture.ts", 'const password = "super-secret-value-123";\n');
    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain("super-secret-value-123");
  });
});

describe("scanFileContent — DOC_SAFELIST avoids false positives on prose/docs", () => {
  it("does not flag a no-go doc line mentioning secrets in prose", () => {
    const findings = scanFileContent("docs/NO_GO.md", "No secrets/env nel repo — vedi pattern scan.\n");
    expect(findings).toHaveLength(0);
  });

  it("does not flag a line explaining a placeholder/example token shape", () => {
    const findings = scanFileContent(
      "docs/RUNBOOK.md",
      "# placeholder token = REPLACE_ME_TOKEN_VALUE_HERE_1234\n",
    );
    expect(findings).toHaveLength(0);
  });

  it("still flags a real-looking assignment on an otherwise unrelated line", () => {
    const findings = scanFileContent("fixture.ts", 'const apiKey = "abcd1234efgh5678";\n');
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe("scanFileContent — clean content produces no findings", () => {
  it("returns an empty array for ordinary source code", () => {
    expect(scanFileContent("clean.ts", "export function add(a: number, b: number) { return a + b; }\n")).toEqual([]);
  });

  it("returns an empty array for empty content", () => {
    expect(scanFileContent("empty.ts", "")).toEqual([]);
  });
});

describe("PATTERNS / DOC_SAFELIST — shape guards", () => {
  it("PATTERNS is a non-empty array of { name, regex }", () => {
    expect(Array.isArray(PATTERNS)).toBe(true);
    expect(PATTERNS.length).toBeGreaterThan(0);
    for (const p of PATTERNS) {
      expect(typeof p.name).toBe("string");
      expect(p.regex).toBeInstanceOf(RegExp);
    }
  });

  it("DOC_SAFELIST is a RegExp", () => {
    expect(DOC_SAFELIST).toBeInstanceOf(RegExp);
  });
});

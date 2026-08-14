import { describe, it, expect } from "vitest";
// Single source of truth (pure, dependency-free). Imported here (tsconfig allowJs)
// AND by scripts/publication-gate.mjs which enforces the same rules over `git ls-files`.
import {
  ALLOWED_TOP_LEVEL_DIRS,
  ALLOWED_TOP_LEVEL_FILES,
  checkForbiddenTopLevel,
  checkForbiddenPath,
  checkForbiddenExtension,
  checkSecretPatterns,
  checkEmailPII,
  findEmails,
  extractCandidateTokens,
  sha256Hex,
  checkFingerprints,
  isBinarySample,
  checkUnexpectedBinary,
  evaluateTrackedFile,
  PII_EMAIL_PATH_SAFELIST,
  SECRET_PATTERN_PATH_SAFELIST,
} from "../../../scripts/publication-gate-core.mjs";

// ALL values below are synthetic/dummy fixtures — never a real credential,
// domain, email or identifier. The nine real banned identifiers (and their
// fingerprint hashes) live only in scripts/publication-gate.fingerprints.json
// and are never reproduced here; this test hashes its OWN dummy values and
// checks them against a synthetic fingerprint set it builds itself, the same
// way packages/engine/tests/secret_scan.test.ts never uses a real secret.

describe("checkForbiddenTopLevel — rule 1", () => {
  it("allows every entry in the allowlist, as a top-level dir and as a nested file", () => {
    for (const dir of ALLOWED_TOP_LEVEL_DIRS) {
      expect(checkForbiddenTopLevel(`${dir}/x.ts`)).toBeNull();
    }
    for (const file of ALLOWED_TOP_LEVEL_FILES) {
      expect(checkForbiddenTopLevel(file)).toBeNull();
    }
  });

  it("fails a root-level file not on the allowlist", () => {
    const finding = checkForbiddenTopLevel("PROJECT_HISTORY.md");
    expect(finding).not.toBeNull();
    expect(finding!.rule).toBe("forbidden-top-level");
  });

  it("fails a top-level directory not on the allowlist", () => {
    expect(checkForbiddenTopLevel("automations/pipeline.ts")).not.toBeNull();
    expect(checkForbiddenTopLevel("docs/README.md")).not.toBeNull();
    expect(checkForbiddenTopLevel(".claude/agents/foo.md")).not.toBeNull();
    expect(checkForbiddenTopLevel("supabase/migrations/x.sql")).not.toBeNull();
    expect(checkForbiddenTopLevel("functions/handler.ts")).not.toBeNull();
  });

  it("does not flag an allowed top-level file just because another allowed dir shares a prefix", () => {
    // "scripts" is allowed; "scripts-extra" is a different top-level entry and must not slip through.
    expect(checkForbiddenTopLevel("scripts-extra/x.ts")).not.toBeNull();
  });
});

describe("checkForbiddenPath — rule 2", () => {
  it("fails forbidden directories even nested under an allowed top-level dir", () => {
    // Real repos never nest automations/docs/etc. under packages/, but the
    // check must not rely on that — it inspects every path segment.
    expect(checkForbiddenPath("packages/foo/docs/x.md")).not.toBeNull();
  });

  it("fails every private package segment, anywhere in the path", () => {
    const names = [
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
    for (const name of names) {
      expect(checkForbiddenPath(`packages/${name}/src/index.ts`)).not.toBeNull();
    }
  });

  it("does not false-positive on a package name that merely shares a substring with a forbidden segment", () => {
    // "data-connector-sdk" contains "data-connector" but is not "data-connectors".
    expect(checkForbiddenPath("packages/data-connector-sdk/src/index.ts")).toBeNull();
  });

  it("fails PROJECT_HISTORY.md regardless of directory", () => {
    expect(checkForbiddenPath("PROJECT_HISTORY.md")).not.toBeNull();
    expect(checkForbiddenPath("archive/PROJECT_HISTORY.md")).not.toBeNull();
  });

  it("fails anything under public/assets/", () => {
    expect(checkForbiddenPath("public/assets/clubs/atalanta.svg")).not.toBeNull();
  });

  it("does not flag public/ content outside assets/", () => {
    expect(checkForbiddenPath("public/data/listone.json")).toBeNull();
  });

  it("fails the private lib module prefixes under scripts/lib/", () => {
    expect(checkForbiddenPath("scripts/lib/privateDriveClient.ts")).not.toBeNull();
    expect(checkForbiddenPath("scripts/lib/privateSeasonRecords.ts")).not.toBeNull();
    expect(checkForbiddenPath("scripts/lib/anagraficaDeposit.ts")).not.toBeNull();
    expect(checkForbiddenPath("scripts/lib/privateDriveClient.test.ts")).not.toBeNull();
  });

  it("does not flag other scripts/lib/ modules", () => {
    expect(checkForbiddenPath("scripts/lib/repoPaths.ts")).toBeNull();
  });

  it("fails any *.workflow.json export", () => {
    expect(checkForbiddenPath("automations/foo.workflow.json")).not.toBeNull();
    expect(checkForbiddenPath("fixtures/n8n.workflow.json")).not.toBeNull();
  });

  it("fails any .env* file anywhere", () => {
    expect(checkForbiddenPath(".env")).not.toBeNull();
    expect(checkForbiddenPath(".env.local")).not.toBeNull();
    expect(checkForbiddenPath("scripts/.env.production")).not.toBeNull();
  });

  it("does not flag a same-prefix but unrelated dotfile (.envrc is direnv config, not a dotenv file)", () => {
    // ".envrc" (and anything else that isn't exactly ".env" or ".env.<rest>")
    // must NOT match — only the dotenv shape itself is forbidden.
    expect(checkForbiddenPath(".envrc")).toBeNull();
    expect(checkForbiddenPath(".envrc-notes.md")).toBeNull();
    expect(checkForbiddenPath(".eslintrc.json")).toBeNull();
  });

  it("passes ordinary tracked source/doc/schema paths", () => {
    expect(checkForbiddenPath("packages/engine/tests/x.test.ts")).toBeNull();
    expect(checkForbiddenPath("schemas/foo.schema.json")).toBeNull();
    expect(checkForbiddenPath("src/main.ts")).toBeNull();
    expect(checkForbiddenPath("README.md")).toBeNull();
  });
});

describe("checkForbiddenExtension — rule 3", () => {
  it("fails real-data and key-material extensions", () => {
    for (const ext of [".xlsx", ".xls", ".csv", ".parquet", ".db", ".sqlite", ".pem", ".p12", ".key"]) {
      const finding = checkForbiddenExtension(`fixture${ext}`);
      expect(finding).not.toBeNull();
      expect(finding!.rule).toBe("forbidden-extension");
    }
  });

  it("is case-insensitive on the extension", () => {
    expect(checkForbiddenExtension("dump.XLSX")).not.toBeNull();
  });

  it("passes ordinary text/source extensions", () => {
    for (const ext of [".ts", ".tsx", ".mjs", ".json", ".md", ".html", ".css"]) {
      expect(checkForbiddenExtension(`fixture${ext}`)).toBeNull();
    }
  });

  it("passes extensionless / dotfile-only paths", () => {
    expect(checkForbiddenExtension("LICENSE")).toBeNull();
    expect(checkForbiddenExtension(".gitignore")).toBeNull();
  });
});

describe("checkSecretPatterns — rule 4 (delegates to secret-scan-core.mjs)", () => {
  it("flags a synthetic secret-shaped assignment", () => {
    const findings = checkSecretPatterns("fixture.ts", 'const token = "abcd1234efgh5678";\n');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.rule).toBe("secret-pattern");
  });

  it("passes clean source", () => {
    expect(checkSecretPatterns("clean.ts", "export const x = 1;\n")).toEqual([]);
  });

  it("exempts .gitignore's own bare .env pattern lines (documented false-positive fix)", () => {
    expect(SECRET_PATTERN_PATH_SAFELIST.has(".gitignore")).toBe(true);
    expect(checkSecretPatterns(".gitignore", "node_modules/\n.env\n.env.*\n")).toEqual([]);
  });

  it("does not exempt a same-shaped line in a different file", () => {
    const findings = checkSecretPatterns("notes.md", ".env\n");
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe("findEmails / checkEmailPII — rule 5", () => {
  it("finds a literal email address with its 1-indexed line", () => {
    const found = findEmails("line one\nsomeone@dummy-personal-domain.test\n");
    expect(found).toEqual([{ email: "someone@dummy-personal-domain.test", line: 2 }]);
  });

  it("flags a literal email not on an exempt domain", () => {
    const findings = checkEmailPII("fixture.md", "Contact: real.person@dummy-personal-domain.test\n");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("pii-email");
  });

  it("never includes the matched address itself in the finding", () => {
    const findings = checkEmailPII("fixture.md", "Contact: real.person@dummy-personal-domain.test\n");
    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain("real.person");
    expect(serialized).not.toContain("dummy-personal-domain.test");
  });

  it("exempts example.com and its subdomains", () => {
    expect(checkEmailPII("f.md", "mailto:owner@example.com\n")).toEqual([]);
    expect(checkEmailPII("f.md", "mailto:a@sub.example.com\n")).toEqual([]);
  });

  it("exempts .invalid and .local TLDs", () => {
    expect(checkEmailPII("f.md", "a@host.invalid\n")).toEqual([]);
    expect(checkEmailPII("f.md", "a@host.local\n")).toEqual([]);
  });

  it("exempts noreply addresses (bare local-part and GitHub-style noreply subdomain)", () => {
    expect(checkEmailPII("f.md", "noreply@dummy-vendor.test\n")).toEqual([]);
    expect(checkEmailPII("f.md", "123+user@users.noreply.dummy-vendor.test\n")).toEqual([]);
  });

  it("exempts the explicit path safelist (package-lock.json third-party metadata)", () => {
    expect(PII_EMAIL_PATH_SAFELIST.has("package-lock.json")).toBe(true);
    expect(checkEmailPII("package-lock.json", "contact i@izs.me for help\n")).toEqual([]);
  });

  it("does not exempt a real-looking address just because it appears in an unrelated file", () => {
    const findings = checkEmailPII("some/other/file.md", "contact real.person@dummy-personal-domain.test\n");
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe("extractCandidateTokens / sha256Hex / checkFingerprints — rule 6 (fingerprints)", () => {
  it("extracts a domain-shaped candidate token", () => {
    const tokens = extractCandidateTokens("see banned.example-host.test for details\n");
    expect(tokens.some((t) => t.type === "domain" && t.token === "banned.example-host.test")).toBe(true);
  });

  it("extracts a uuid-shaped candidate token", () => {
    const tokens = extractCandidateTokens("id: 12345678-1234-4234-8234-123456789abc\n");
    expect(tokens.some((t) => t.type === "uuid")).toBe(true);
  });

  it("extracts a hex32-shaped candidate token", () => {
    const tokens = extractCandidateTokens("hash abcdef0123456789abcdef0123456789 done\n");
    expect(tokens.some((t) => t.type === "hex32")).toBe(true);
  });

  it("extracts a generic bearer-token-shaped candidate only when it contains a digit", () => {
    const withDigit = extractCandidateTokens("key=Ab3dEfGhIjKlMnOpQrStUvWxYz012345\n");
    expect(withDigit.some((t) => t.type === "token")).toBe(true);

    const alphaOnly = extractCandidateTokens("thisIsAVeryLongCamelCaseIdentifierName\n");
    expect(alphaOnly.some((t) => t.type === "token")).toBe(false);
  });

  it("sha256Hex is deterministic and matches the well-known empty-string SHA-256 vector", async () => {
    const hash = await sha256Hex("");
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hash).toBe(await sha256Hex(""));
  });

  it("checkFingerprints FAILs on a synthetic banned domain via its hash, and never leaks the cleartext or the full hash", async () => {
    const bannedDomain = "banned.example-host.test"; // dummy fixture value, not a real identifier
    const hash = await sha256Hex(bannedDomain);
    const fingerprintHashes = new Set([hash]);

    const findings = await checkFingerprints(
      "fixture.ts",
      `const endpoint = "https://${bannedDomain}/api";\n`,
      fingerprintHashes,
    );

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.rule).toBe("private-fingerprint");
    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain(bannedDomain);
    expect(serialized).not.toContain(hash); // only the first 8 hex chars may appear
    expect(serialized).toContain(hash.slice(0, 8));
  });

  it("checkFingerprints FAILs on a synthetic banned uuid and hex32 via their hashes", async () => {
    const bannedUuid = "12345678-1234-4234-8234-123456789abc";
    const bannedHex32 = "abcdef0123456789abcdef0123456789";
    const fingerprintHashes = new Set([await sha256Hex(bannedUuid), await sha256Hex(bannedHex32)]);

    const findings = await checkFingerprints(
      "fixture.json",
      `{"id": "${bannedUuid}", "token": "${bannedHex32}"}\n`,
      fingerprintHashes,
    );
    expect(findings.filter((f) => f.rule === "private-fingerprint")).toHaveLength(2);
  });

  it("checkFingerprints matches case-insensitively for domain-shaped tokens", async () => {
    const bannedDomain = "banned.example-host.test";
    const hash = await sha256Hex(bannedDomain); // hash of the lowercase form
    const findings = await checkFingerprints(
      "fixture.ts",
      `const endpoint = "https://Banned.Example-Host.Test/api";\n`,
      new Set([hash]),
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it("checkFingerprints is silent on ordinary content with no fingerprint match", async () => {
    const findings = await checkFingerprints(
      "fixture.ts",
      "export function add(a: number, b: number) { return a + b; }\n",
      new Set(["0000000000000000000000000000000000000000000000000000000000000000".slice(0, 64)]),
    );
    expect(findings).toEqual([]);
  });

  it("checkFingerprints with an empty fingerprint set never fails", async () => {
    const findings = await checkFingerprints("fixture.ts", "anything.example-domain.test 12345678-1234-4234-8234-123456789abc\n", new Set());
    expect(findings).toEqual([]);
  });
});

describe("isBinarySample / checkUnexpectedBinary — rule 7", () => {
  it("flags a NUL byte in the sample", () => {
    expect(isBinarySample("a" + String.fromCharCode(0) + "b")).toBe(true);
  });

  it("flags a zip/OOXML magic header", () => {
    expect(isBinarySample("PK\x03\x04rest")).toBe(true);
  });

  it("passes an ordinary text sample", () => {
    expect(isBinarySample("export const x = 1;")).toBe(false);
  });

  it("passes an empty/undefined sample", () => {
    expect(isBinarySample("")).toBe(false);
    expect(isBinarySample(undefined as unknown as string)).toBe(false);
  });

  it("checkUnexpectedBinary reports a finding only for a binary sample", () => {
    expect(checkUnexpectedBinary("f.json", "a" + String.fromCharCode(0) + "b")).not.toBeNull();
    expect(checkUnexpectedBinary("f.json", "{}")).toBeNull();
  });
});

describe("evaluateTrackedFile — integration", () => {
  it("passes a clean, allowed tracked file with no content violations", async () => {
    const findings = await evaluateTrackedFile({
      path: "packages/engine/tests/example.test.ts",
      content: "export const x = 1;\n",
      contentSample: "export const",
      fingerprintHashes: new Set(),
    });
    expect(findings).toEqual([]);
  });

  it("aggregates multiple simultaneous violations on one bad file", async () => {
    const bannedDomain = "banned.example-host.test";
    const hash = await sha256Hex(bannedDomain);
    const findings = await evaluateTrackedFile({
      path: "automations/leak.xlsx",
      content: `const password = "abcd1234efgh5678";\ncontact real.person@dummy-personal-domain.test\nhost ${bannedDomain}\n`,
      contentSample: "const password",
      fingerprintHashes: new Set([hash]),
    });
    const rules = findings.map((f) => f.rule).sort();
    expect(rules).toEqual(
      [
        "forbidden-top-level",
        "forbidden-path",
        "forbidden-extension",
        "secret-pattern",
        "pii-email",
        "private-fingerprint",
      ].sort(),
    );
    for (const f of findings) expect(f.path).toBe("automations/leak.xlsx");
  });

  it("still runs structural checks (top-level/path/extension/binary) when content is unreadable", async () => {
    const findings = await evaluateTrackedFile({
      path: "docs/binary-thing.bin",
      content: null,
      contentSample: "PK\x03\x04",
    });
    const rules = findings.map((f) => f.rule).sort();
    expect(rules).toEqual(["forbidden-path", "forbidden-top-level", "unexpected-binary"].sort());
  });

  it("passes every actually-allowed shape used elsewhere in this suite", async () => {
    const findings = await evaluateTrackedFile({
      path: "schemas/example.schema.json",
      content: '{"type":"object"}\n',
      contentSample: '{"type"',
      fingerprintHashes: new Set(),
    });
    expect(findings).toEqual([]);
  });
});

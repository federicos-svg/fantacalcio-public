import { describe, it, expect } from "vitest";
// Single source of truth (pure, dependency-free). Imported here (tsconfig allowJs)
// AND by scripts/check-markdown-links.mjs which enforces the same rules over
// `git ls-files -- '*.md'`. Same split as guardrails-core.mjs / secret-scan-core.mjs.
import {
  blankOutCode,
  collectLinks,
  classifyLink,
  resolveRepoPath,
  slugify,
  headingAnchors,
  checkRepoLinks,
  findingKey,
} from "../../../scripts/check-markdown-links-core.mjs";

// DOC-01 Fase 2 (issue #258): after the consolidation the links between
// documents ARE the structure, so a broken relative link is an orphaned fact.
// The checker is deliberately offline-only — it never resolves an external URL,
// so these tests never need (and never make) a network request either.

describe("blankOutCode", () => {
  it("blanks fenced blocks but keeps the line count so line numbers stay exact", () => {
    const md = ["a", "```md", "[x](nope.md)", "```", "b"].join("\n");
    const out = blankOutCode(md);
    expect(out.split("\n")).toHaveLength(5);
    expect(out).not.toContain("nope.md");
    expect(out.split("\n")[0]).toBe("a");
    expect(out.split("\n")[4]).toBe("b");
  });
  it("handles ~~~ fences and longer backtick runs", () => {
    expect(blankOutCode("~~~\n[x](a.md)\n~~~")).not.toContain("a.md");
    expect(blankOutCode("````\n[x](a.md)\n````")).not.toContain("a.md");
  });
  it("does not close a ``` fence on a ~~~ line (mismatched markers)", () => {
    const md = ["```", "~~~", "[x](a.md)", "```"].join("\n");
    expect(blankOutCode(md)).not.toContain("a.md");
  });
  it("blanks inline code spans", () => {
    expect(blankOutCode("see `[x](nope.md)` here")).not.toContain("nope.md");
    expect(blankOutCode("see ``a ` b [x](nope.md)`` here")).not.toContain("nope.md");
  });
  it("leaves an unterminated backtick alone instead of eating the rest of the line", () => {
    expect(collectLinks("a ` b [x](real.md)").map((l) => l.target)).toEqual(["real.md"]);
  });
});

describe("collectLinks", () => {
  it("finds inline links, images, titles and angle-bracketed targets", () => {
    const md = [
      "[a](docs/a.md)",
      "![img](public/assets/clubs/atalanta.svg)",
      '[b](docs/b.md "titolo")',
      "[c](<docs/with space.md>)",
    ].join("\n");
    expect(collectLinks(md)).toEqual([
      { line: 1, target: "docs/a.md" },
      { line: 2, target: "public/assets/clubs/atalanta.svg" },
      { line: 3, target: "docs/b.md" },
      { line: 4, target: "docs/with space.md" },
    ]);
  });
  it("finds reference definitions and raw HTML hrefs", () => {
    expect(collectLinks("[label]: docs/ref.md").map((l) => l.target)).toEqual(["docs/ref.md"]);
    expect(collectLinks('<a href="docs/html.md">x</a>').map((l) => l.target)).toEqual([
      "docs/html.md",
    ]);
  });
  it("reports 1-based line numbers", () => {
    expect(collectLinks("x\n\n[a](docs/a.md)")).toEqual([{ line: 3, target: "docs/a.md" }]);
  });
  it("finds several links on one line", () => {
    expect(collectLinks("[a](x.md) e [b](y.md)").map((l) => l.target)).toEqual(["x.md", "y.md"]);
  });
  it("ignores links inside fenced examples (the docs are full of them)", () => {
    const md = ["```text", "[a](docs/does-not-exist.md)", "```", "[b](docs/b.md)"].join("\n");
    expect(collectLinks(md).map((l) => l.target)).toEqual(["docs/b.md"]);
  });
});

describe("classifyLink — only repo-internal relative links are in scope", () => {
  it("skips everything that would require the network", () => {
    for (const t of [
      "https://github.com/federicos-svg/fantacalcio/issues/258",
      "http://example.com",
      "mailto:owner@example.com",
      "//cdn.example.com/x.js",
    ]) {
      expect(classifyLink(t).kind).toBe("skip");
    }
  });
  it("skips repo-root-absolute links (GitHub resolves them against the branch view)", () => {
    expect(classifyLink("/docs/NO_GO.md").kind).toBe("skip");
  });
  it("classifies same-document anchors", () => {
    expect(classifyLink("#merge")).toEqual({ kind: "anchor", path: null, anchor: "merge" });
  });
  it("splits path and anchor, and percent-decodes", () => {
    expect(classifyLink("docs/NO_GO.md#merge")).toEqual({
      kind: "internal",
      path: "docs/NO_GO.md",
      anchor: "merge",
    });
    expect(classifyLink("docs/a%20b.md")).toEqual({
      kind: "internal",
      path: "docs/a b.md",
      anchor: null,
    });
  });
});

describe("resolveRepoPath", () => {
  it("resolves relative to the linking file's directory", () => {
    expect(resolveRepoPath("docs/team/TEAM_CHARTER.md", "../NO_GO.md")).toBe("docs/NO_GO.md");
    expect(resolveRepoPath("docs/NO_GO.md", "data/LEAGUE_RULES.md")).toBe(
      "docs/data/LEAGUE_RULES.md",
    );
    expect(resolveRepoPath("CLAUDE.md", "docs/NO_GO.md")).toBe("docs/NO_GO.md");
    expect(resolveRepoPath("docs/a.md", "./b.md")).toBe("docs/b.md");
  });
  it("returns null when the link escapes the repo root", () => {
    expect(resolveRepoPath("docs/a.md", "../../etc/passwd")).toBeNull();
  });
});

describe("slugify / headingAnchors — GitHub slugs", () => {
  it("lowercases, drops punctuation, turns spaces into hyphens", () => {
    expect(slugify("Authorization boundary")).toBe("authorization-boundary");
    expect(slugify("No-go (sintesi vincolante)")).toBe("no-go-sintesi-vincolante");
    expect(slugify("Stato e gate — fonti operative")).toBe("stato-e-gate--fonti-operative");
  });
  it("keeps accented letters and digits", () => {
    expect(slugify("Però 2026")).toBe("però-2026");
  });
  it("strips inline markup before slugging", () => {
    expect(slugify("`npm run verify` e **grassetto**")).toBe("npm-run-verify-e-grassetto");
    expect(slugify("[Team Charter](docs/team/TEAM_CHARTER.md)")).toBe("team-charter");
  });
  it("collects ATX headings and de-duplicates like github-slugger", () => {
    const anchors = headingAnchors("# Uno\n## Due\n### Uno\n#### Uno\n");
    expect([...anchors].sort()).toEqual(["due", "uno", "uno-1", "uno-2"]);
  });
  it("ignores headings inside fenced code and honours closing hashes", () => {
    expect([...headingAnchors("```\n# Falso\n```\n# Vero ##\n")]).toEqual(["vero"]);
  });
  it("collects explicit HTML anchors", () => {
    expect(headingAnchors('<a id="Ancora"></a>').has("ancora")).toBe(true);
    expect(headingAnchors('<a name="alt"></a>').has("alt")).toBe(true);
  });
});

describe("checkRepoLinks", () => {
  const base = {
    trackedPaths: new Set(["docs/NO_GO.md", "docs/team/TEAM_CHARTER.md", "public/x.svg"]),
    trackedDirs: new Set(["docs", "docs/team", "public"]),
  };

  it("passes when every internal link resolves", () => {
    const docs = new Map([
      ["docs/NO_GO.md", "# Merge\n[charter](team/TEAM_CHARTER.md)\n[qui](#merge)\n"],
      ["docs/team/TEAM_CHARTER.md", "[no-go](../NO_GO.md#merge)\n"],
    ]);
    expect(checkRepoLinks({ ...base, docs }).findings).toEqual([]);
  });

  it("flags a link to a file that is not tracked", () => {
    const docs = new Map([["docs/NO_GO.md", "[x](team/MISSING.md)\n"]]);
    const { findings } = checkRepoLinks({ ...base, docs });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: "docs/NO_GO.md",
      line: 1,
      target: "team/MISSING.md",
      reason: "missing-file",
    });
  });

  it("accepts a link to a directory that contains tracked files", () => {
    const docs = new Map([["docs/NO_GO.md", "[team](team/)\n"]]);
    expect(checkRepoLinks({ ...base, docs }).findings).toEqual([]);
  });

  it("flags a missing heading anchor, same-file and cross-file", () => {
    const docs = new Map([
      ["docs/NO_GO.md", "# Merge\n[here](#deploy)\n"],
      ["docs/team/TEAM_CHARTER.md", "[x](../NO_GO.md#deploy)\n"],
    ]);
    const { findings } = checkRepoLinks({ ...base, docs });
    expect(findings.map((f) => f.reason)).toEqual(["missing-anchor", "missing-anchor"]);
  });

  it("does not check anchors of non-markdown targets", () => {
    const docs = new Map([["docs/NO_GO.md", "[logo](../public/x.svg#frag)\n"]]);
    expect(checkRepoLinks({ ...base, docs }).findings).toEqual([]);
  });

  it("flags a relative path that escapes the repo root", () => {
    const docs = new Map([["docs/NO_GO.md", "[x](../../etc/passwd)\n"]]);
    expect(checkRepoLinks({ ...base, docs }).findings[0]?.reason).toBe("escapes-repo");
  });

  it("never treats an external URL as a finding (no network, ever)", () => {
    const docs = new Map([
      ["docs/NO_GO.md", "[issue](https://github.com/federicos-svg/fantacalcio/issues/258)\n"],
    ]);
    expect(checkRepoLinks({ ...base, docs }).findings).toEqual([]);
  });

  it("moves an allowlisted pre-existing break out of findings, keyed by file+target", () => {
    const docs = new Map([["docs/NO_GO.md", "\n[x](team/MISSING.md)\n"]]);
    const allowlist = new Set([findingKey("docs/NO_GO.md", "team/MISSING.md")]);
    const res = checkRepoLinks({ ...base, docs, allowlist });
    expect(res.findings).toEqual([]);
    expect(res.allowlisted).toHaveLength(1);
    expect(res.unusedAllowlist).toEqual([]);
  });

  it("reports a stale allowlist entry so fixed debt cannot rot in the list", () => {
    const docs = new Map([["docs/NO_GO.md", "[x](team/TEAM_CHARTER.md)\n"]]);
    const allowlist = new Set([findingKey("docs/NO_GO.md", "team/MISSING.md")]);
    expect(checkRepoLinks({ ...base, docs, allowlist }).unusedAllowlist).toEqual([
      "docs/NO_GO.md -> team/MISSING.md",
    ]);
  });

  it("is deterministic: findings come out sorted by file", () => {
    const docs = new Map([
      ["docs/team/TEAM_CHARTER.md", "[x](nope.md)\n"],
      ["docs/NO_GO.md", "[x](nope.md)\n"],
    ]);
    expect(checkRepoLinks({ ...base, docs }).findings.map((f) => f.file)).toEqual([
      "docs/NO_GO.md",
      "docs/team/TEAM_CHARTER.md",
    ]);
  });
});

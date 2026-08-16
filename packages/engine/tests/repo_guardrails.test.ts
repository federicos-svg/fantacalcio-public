import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
// Single source of truth (pure, dependency-free). Imported here (tsconfig allowJs)
// AND by scripts/repo-guardrails.mjs which enforces the same rules over `git ls-files`.
import {
  classifyTrackedFile,
  compileDataExceptions,
  lintProjectState,
  DATA_EXCEPTION_CANARIES,
  NO_DATA_EXCEPTIONS,
} from "../../../scripts/guardrails-core.mjs";

// P0 speed guardrails (logic + lock). The same functions run for real in CI/verify
// via scripts/repo-guardrails.mjs:
//  1) no-real-data  : spreadsheet/binary formats are never acceptable as tracked files;
//  2) file-allowlist: only known text/source kinds are allowed;
//  3) project-state : PROJECT_STATE.md must not carry auto-stale fields (HEAD sha /
//                     hand-written test count) that cause recursive housekeeping PRs.
// Secrets stay enforced by scripts/secret-scan.mjs (also in CI); not duplicated here.

const NUL = String.fromCharCode(0);

describe("classifyTrackedFile — synthetic", () => {
  it("allows legit source/docs/schema/fixtures", () => {
    expect(classifyTrackedFile("packages/engine/tests/x.test.ts")).toBe("allowed");
    expect(classifyTrackedFile("schemas/foo.schema.json")).toBe("allowed");
    expect(classifyTrackedFile("docs/data/CONTRACT.md")).toBe("allowed");
    expect(classifyTrackedFile("LICENSE")).toBe("allowed");
  });
  it("allows tracked CSS source files (Frontend Structure Foundation v1)", () => {
    expect(classifyTrackedFile("src/styles/base.css")).toBe("allowed");
  });
  it("allows Graphify ignore/version marker files (extensionless)", () => {
    expect(classifyTrackedFile(".claudeignore")).toBe("allowed");
    expect(classifyTrackedFile(".graphifyignore")).toBe("allowed");
    expect(classifyTrackedFile(".claude/skills/graphify/.graphify_version")).toBe("allowed");
  });
  it("allows .github/CODEOWNERS (extensionless by GitHub's own requirement)", () => {
    expect(classifyTrackedFile(".github/CODEOWNERS")).toBe("allowed");
  });
  it("does not turn CODEOWNERS into a general extensionless pass", () => {
    // The entry is one basename, not a relaxation: anything else without an
    // extension is still blocked exactly as before.
    expect(classifyTrackedFile(".github/CODEOWNERS.bak")).toBe("blocked-ext");
    expect(classifyTrackedFile(".github/OWNERS")).toBe("blocked-ext");
    expect(classifyTrackedFile("MAINTAINERS")).toBe("blocked-ext");
  });
  it("blocks spreadsheet/CSV real-data formats (no real data in repo)", () => {
    expect(classifyTrackedFile("data/Voti_2021_22_G38.xlsx")).toBe("blocked-data");
    expect(classifyTrackedFile("dump.csv")).toBe("blocked-data");
  });
  it("blocks binary payloads by content sniff", () => {
    expect(classifyTrackedFile("note.md", "PKrest")).toBe("blocked-binary");
    expect(classifyTrackedFile("x.json", "a" + NUL + "b")).toBe("blocked-binary");
  });
  it("blocks stray unknown extensions", () => {
    expect(classifyTrackedFile("tool.exe")).toBe("blocked-ext");
  });
  it("allows real club logo SVG/PNG assets in their one scoped directory", () => {
    // PNG content sample includes a NUL byte (real IHDR chunk length bytes) —
    // would hit blocked-binary anywhere else, but this directory is the one
    // authorized exception (Owner's written club-logos decision).
    const pngSample = "\x89PNG\r\n\x1a\n\0\0\0\rIHDR";
    expect(classifyTrackedFile("public/assets/clubs/atalanta.svg")).toBe("allowed");
    expect(classifyTrackedFile("public/assets/clubs/verona.png", pngSample)).toBe("allowed");
  });
  it("still blocks .svg/.png outside the club-logos directory", () => {
    expect(classifyTrackedFile("src/ui/icon.svg")).toBe("blocked-ext");
    expect(classifyTrackedFile("public/other.png", "\x89PNG\r\n\x1a\n\0\0\0\rIHDR")).toBe(
      "blocked-binary",
    );
  });
  it("allows .sql only under supabase/migrations/ (foundation v1 scoped exception)", () => {
    expect(
      classifyTrackedFile("supabase/migrations/20260711143000_api_football_standings_foundation_v1.sql"),
    ).toBe("allowed");
    expect(
      classifyTrackedFile(
        "supabase/migrations/20260711143000_api_football_standings_foundation_v1_rollback.sql",
      ),
    ).toBe("allowed");
  });
  it("still blocks .sql outside supabase/migrations/", () => {
    expect(classifyTrackedFile("scripts/query.sql")).toBe("blocked-ext");
    expect(classifyTrackedFile("supabase/query.sql")).toBe("blocked-ext");
    expect(classifyTrackedFile("supabase/migrations/nested/x.sql")).toBe("allowed");
  });
  it("still blocks non-.sql/data/binary files in supabase/migrations/", () => {
    expect(classifyTrackedFile("supabase/migrations/README.exe")).toBe("blocked-ext");
    expect(classifyTrackedFile("supabase/migrations/data.xlsx")).toBe("blocked-data");
  });
  it("binary sniff still runs on .sql under supabase/migrations/ (regression: directory exception must not skip it)", () => {
    // Unlike club logos (deliberately binary), a .sql migration is expected to
    // always be text — the directory exception must not shadow the sniff.
    expect(
      classifyTrackedFile("supabase/migrations/good.sql", "create table foo (id uuid);"),
    ).toBe("allowed");
    expect(classifyTrackedFile("supabase/migrations/binary.sql", "PK\x03\x04rest")).toBe(
      "blocked-binary",
    );
    expect(classifyTrackedFile("supabase/migrations/binary.sql", "a" + NUL + "b")).toBe(
      "blocked-binary",
    );
  });
});

describe("classifyTrackedFile — graphify artifacts (2026-07-11 hardening: nothing tracked)", () => {
  it("blocks everything under graphify-out/, including filenames that used to be the portable subset", () => {
    // Leiden community detection isn't run-to-run deterministic even with a
    // fixed seed (verified: same HEAD, two consecutive rebuilds, same
    // node/edge set, ~5% of nodes get a different `community` id) — so none
    // of these can safely be tracked, not even the ones that look stable.
    expect(classifyTrackedFile("graphify-out/graph.json")).toBe("blocked-graphify");
    expect(classifyTrackedFile("graphify-out/GRAPH_REPORT.md")).toBe("blocked-graphify");
    expect(classifyTrackedFile("graphify-out/manifest.json")).toBe("blocked-graphify");
    expect(classifyTrackedFile("graphify-out/.graphify_labels.json")).toBe("blocked-graphify");
    expect(classifyTrackedFile("graphify-out/.graphify_labels.json.sig")).toBe(
      "blocked-graphify",
    );
    expect(classifyTrackedFile("graphify-out/cost.json")).toBe("blocked-graphify");
    expect(classifyTrackedFile("graphify-out/cache/example.json")).toBe("blocked-graphify");
    expect(classifyTrackedFile("graphify-out/.graphify_python")).toBe("blocked-graphify");
    expect(classifyTrackedFile("graphify-out/graph.html")).toBe("blocked-graphify");
    expect(classifyTrackedFile("graphify-out/memory/example.json")).toBe("blocked-graphify");
  });
  it("blocks a stray graph.json at the repo root", () => {
    expect(classifyTrackedFile("graph.json")).toBe("blocked-graphify");
  });
  it("blocks .claude/hooks/graphify-bin.local (machine-specific resolved binary path, never a tracked file)", () => {
    expect(classifyTrackedFile(".claude/hooks/graphify-bin.local")).not.toBe("allowed");
  });
  it("blocks everything under .graphify-tools/ (project-local uv tool dirs — installed package, never tracked)", () => {
    expect(classifyTrackedFile(".graphify-tools/uv-tool-bin-dir/graphify")).toBe(
      "blocked-graphify",
    );
    expect(classifyTrackedFile(".graphify-tools/uv-tool-dir/graphifyy/pyvenv.cfg")).toBe(
      "blocked-graphify",
    );
    expect(classifyTrackedFile(".graphify-tools/uv-tool-dir/graphifyy/bin/python3")).toBe(
      "blocked-graphify",
    );
  });
  it("still allows normal .json/.md/.html files outside graphify-out/", () => {
    expect(classifyTrackedFile("schemas/foo.schema.json")).toBe("allowed");
    expect(classifyTrackedFile("docs/data/CONTRACT.md")).toBe("allowed");
    expect(classifyTrackedFile("index.html")).toBe("allowed");
  });
  it("binary sniff still runs ahead of the graphify-out/ block (regression: directory rule must not shadow it)", () => {
    expect(classifyTrackedFile("graphify-out/graph.json", "PK\x03\x04rest")).toBe(
      "blocked-binary",
    );
    expect(classifyTrackedFile("graphify-out/graph.json", "a" + NUL + "b")).toBe(
      "blocked-binary",
    );
    expect(classifyTrackedFile("graph.json", "PK\x03\x04rest")).toBe("blocked-binary");
  });
  it("does not duplicate real listone/club-logo assets into graphify-out/", () => {
    expect(classifyTrackedFile("graphify-out/public_data_listone.json")).toBe(
      "blocked-graphify",
    );
    expect(classifyTrackedFile("graphify-out/assets/clubs/atalanta.svg")).toBe(
      "blocked-graphify",
    );
  });
});

describe("classifyTrackedFile — worker worktrees (PR #244 review: blocked-worktree rule)", () => {
  // .claude/worktrees/ holds disposable, .gitignore'd git worktree checkouts
  // for temporary workers (Team Charter §Struttura). A tracked file there
  // means the .gitignore entry was removed or someone forced it with
  // `git add -f` — the scripts/secret-scan.mjs skip for that same path
  // relies on the directory always being untracked, and this is the only
  // assertion that actually checks that premise (CI clones fresh and never
  // has this directory, so it can never exercise the skip itself).
  it("blocks any tracked file under .claude/worktrees/, regardless of extension", () => {
    expect(classifyTrackedFile(".claude/worktrees/agent-x/scripts/secret-scan.mjs")).toBe(
      "blocked-worktree",
    );
    expect(classifyTrackedFile(".claude/worktrees/agent-x/README.md")).toBe("blocked-worktree");
    expect(classifyTrackedFile(".claude/worktrees/agent-x/package-lock.json")).toBe(
      "blocked-worktree",
    );
  });
  it("blocks even extensions/paths that would otherwise be allowed outright", () => {
    expect(classifyTrackedFile(".claude/worktrees/agent-x/LICENSE")).toBe("blocked-worktree");
    expect(
      classifyTrackedFile(".claude/worktrees/agent-x/public/assets/clubs/atalanta.svg"),
    ).toBe("blocked-worktree");
    expect(
      classifyTrackedFile(
        ".claude/worktrees/agent-x/supabase/migrations/20260101000000_x.sql",
      ),
    ).toBe("blocked-worktree");
  });
  it("still allows tracked .claude/ files outside worktrees/ (agents, hooks, skills)", () => {
    expect(classifyTrackedFile(".claude/agents/reviewer-engineering.md")).toBe("allowed");
    expect(classifyTrackedFile(".claude/hooks/graphify-hook-guard.sh")).toBe("allowed");
    expect(classifyTrackedFile(".claude/skills/graphify/SKILL.md")).toBe("allowed");
  });
  it("does not false-positive on a similarly-named directory outside .claude/", () => {
    expect(classifyTrackedFile("worktrees/foo.ts")).toBe("allowed");
    expect(classifyTrackedFile("some/other/.claude/worktrees/x.ts")).toBe("allowed");
  });
  it("matches the repo's actual current state: zero tracked files under .claude/worktrees/", () => {
    // Reads the real git index instead of a hardcoded literal (PR #245
    // review: a hardcoded empty array can never fail no matter what the
    // tree actually contains — this used to iterate `const currentlyTracked
    // = []`, which is unreachable by construction). `git ls-files` only
    // enumerates tracked entries, so untracked/gitignored content under
    // .claude/worktrees/ (including this very worktree's own siblings)
    // never appears here regardless of which checkout runs the test.
    const out = execSync("git ls-files -z -- .claude/worktrees", {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const tracked = out.split(NUL).filter((p) => p.length > 0);
    for (const path of tracked) {
      expect(classifyTrackedFile(path)).toBe("blocked-worktree");
    }
    expect(tracked).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Injected data exceptions.
//
// This repository has NO exception list and must not grow one — the mechanism
// exists so that a host repository with a written, scoped authorization can
// inject its own list without any of its paths being pre-approved in this
// shared core. So everything below is synthetic: it exercises the mechanism
// and its limits, never a real path from anywhere.
//
// Two independent safety nets are tested separately, because they fail in
// different places and a reader needs to know which one is doing the work:
//   - COMPILE-TIME (canaries + shape validation) rejects a bad list when it is
//     loaded, naming the offending entry;
//   - RUN-TIME (the order of the rules in classifyTrackedFile) makes the
//     absolute zones unreachable for ANY list that got past compile.
// ---------------------------------------------------------------------------
describe("compileDataExceptions — shape validation", () => {
  it("rejects a spec that is not a plain object", () => {
    expect(() => compileDataExceptions(null)).toThrow(/must be a JSON object/);
    expect(() => compileDataExceptions([])).toThrow(/must be a JSON object/);
    expect(() => compileDataExceptions("data/x.csv")).toThrow(/must be a JSON object/);
  });
  it("rejects an unknown key instead of silently ignoring it", () => {
    // A typo'd key that no-ops is how a list that was meant to apply quietly
    // does not — the run stays green and means nothing.
    expect(() => compileDataExceptions({ exactPath: ["a/b.csv"] })).toThrow(
      /unknown key "exactPath"/,
    );
  });
  it("rejects non-array / non-string entries", () => {
    expect(() => compileDataExceptions({ exactPaths: "a/b.csv" })).toThrow(/must be an array/);
    expect(() => compileDataExceptions({ exactPaths: [42] })).toThrow(/non-empty string/);
    expect(() => compileDataExceptions({ exactPaths: [""] })).toThrow(/non-empty string/);
    expect(() => compileDataExceptions({ patterns: [null] })).toThrow(/non-empty string/);
  });
  it("rejects absolute paths, backslashes, globs and relative segments", () => {
    expect(() => compileDataExceptions({ exactPaths: ["/etc/passwd.csv"] })).toThrow(/is absolute/);
    expect(() => compileDataExceptions({ exactPaths: ["a\\b.csv"] })).toThrow(/backslash/);
    expect(() => compileDataExceptions({ exactPaths: ["a/*.csv"] })).toThrow(/looks like a glob/);
    expect(() => compileDataExceptions({ exactPaths: ["a/../b.csv"] })).toThrow(/relative segment/);
    expect(() => compileDataExceptions({ exactPaths: ["a//b.csv"] })).toThrow(/empty path segment/);
  });
  it("rejects an extensionless entry — an exception names files, never a directory", () => {
    expect(() => compileDataExceptions({ exactPaths: ["data/archivio"] })).toThrow(
      /no extension/,
    );
    expect(() => compileDataExceptions({ exactPaths: ["data/archivio/"] })).toThrow(
      /empty path segment/,
    );
  });
  it("rejects duplicates in both lists", () => {
    expect(() => compileDataExceptions({ exactPaths: ["a/b.csv", "a/b.csv"] })).toThrow(
      /duplicate path/,
    );
    expect(() => compileDataExceptions({ patterns: ["^a/b\\.csv$", "^a/b\\.csv$"] })).toThrow(
      /duplicate pattern/,
    );
  });
  it("rejects an unanchored pattern", () => {
    expect(() => compileDataExceptions({ patterns: ["a/b\\.csv$"] })).toThrow(/not anchored/);
    expect(() => compileDataExceptions({ patterns: ["^a/b\\.csv"] })).toThrow(/not anchored/);
  });
  it('rejects alternation, which would defeat the anchoring check', () => {
    // "^a|b$" starts with "^" and ends with "$" while leaving both branches
    // half-open — the anchoring check is only sound because "|" is refused.
    expect(() => compileDataExceptions({ patterns: ["^a|b$"] })).toThrow(/uses "\|"/);
  });
  it("rejects a pattern that does not compile", () => {
    expect(() => compileDataExceptions({ patterns: ["^a/(b\\.csv$"] })).toThrow(
      /does not compile/,
    );
  });
  it("accepts an empty spec and reports size 0", () => {
    expect(compileDataExceptions({}).size).toBe(0);
    expect(compileDataExceptions({ exactPaths: [], patterns: [] }).size).toBe(0);
    expect(compileDataExceptions({}).matches("anything.csv")).toBe(false);
  });
  it("reports the number of compiled rules", () => {
    const compiled = compileDataExceptions({
      exactPaths: ["data/authorized/input.csv", "data/authorized/mapping.csv"],
      patterns: ["^data/authorized/log/[a-z0-9-]+\\.jsonl$"],
    });
    expect(compiled.size).toBe(3);
  });
});

describe("compileDataExceptions — canaries (compile-time net against an over-broad list)", () => {
  it("every canary is genuinely blocked by the default classifier", () => {
    // Keeps the canary list honest: a path that the guard allows anyway would
    // be a canary that can never fire, i.e. decoration.
    for (const canary of DATA_EXCEPTION_CANARIES) {
      expect(classifyTrackedFile(canary)).not.toBe("allowed");
    }
  });
  it("rejects a list that would exempt a canary by exact path", () => {
    expect(() => compileDataExceptions({ exactPaths: ["dump.csv"] })).toThrow(
      /exempts "dump\.csv"/,
    );
    expect(() => compileDataExceptions({ exactPaths: ["public/listone.csv"] })).toThrow(
      /must stay blocked in every repository/,
    );
  });
  it("rejects a directory-wide pattern that reaches a canary", () => {
    // The realistic mistake this is here to catch: a rule written as a
    // directory prefix instead of a file list.
    expect(() => compileDataExceptions({ patterns: ["^public/.*\\.csv$"] })).toThrow(
      /exempts "public\/listone\.csv"/,
    );
    expect(() => compileDataExceptions({ patterns: ["^.*\\.csv$"] })).toThrow(/exempts/);
    expect(() => compileDataExceptions({ patterns: ["^node_modules/.*$"] })).toThrow(/exempts/);
  });
});

describe("classifyTrackedFile — injected exceptions (run-time behaviour)", () => {
  const spec = {
    exactPaths: ["data/authorized/input.csv", "data/authorized/notes.jsonl"],
    patterns: ["^data/authorized/storico/report_\\d{4}\\.csv$"],
  };
  const exceptions = compileDataExceptions(spec);

  it("keeps the strict default when no matcher is passed", () => {
    expect(classifyTrackedFile("data/authorized/input.csv")).toBe("blocked-data");
    expect(classifyTrackedFile("data/authorized/input.csv", "", NO_DATA_EXCEPTIONS)).toBe(
      "blocked-data",
    );
    // Explicit null/undefined must not crash and must not exempt.
    expect(classifyTrackedFile("data/authorized/input.csv", "", null)).toBe("blocked-data");
    expect(classifyTrackedFile("data/authorized/input.csv", "", undefined)).toBe("blocked-data");
  });
  it("exempts an exact path from the data-extension rule", () => {
    expect(classifyTrackedFile("data/authorized/input.csv", "", exceptions)).toBe("allowed");
  });
  it("exempts an exact path from the unknown-extension rule too", () => {
    // .jsonl is in neither DATA_EXTS nor ALLOWED_EXTS — without the exception
    // it is blocked-ext, and the mechanism is what admits the format at all.
    expect(classifyTrackedFile("data/authorized/notes.jsonl")).toBe("blocked-ext");
    expect(classifyTrackedFile("data/authorized/notes.jsonl", "", exceptions)).toBe("allowed");
  });
  it("exempts a path matched by an anchored pattern", () => {
    expect(classifyTrackedFile("data/authorized/storico/report_2024.csv", "", exceptions)).toBe(
      "allowed",
    );
  });
  it("does not leak to siblings, near-misses or parent directories", () => {
    expect(classifyTrackedFile("data/authorized/other.csv", "", exceptions)).toBe("blocked-data");
    expect(classifyTrackedFile("data/authorized/input.csv.bak", "", exceptions)).toBe(
      "blocked-ext",
    );
    expect(classifyTrackedFile("data/input.csv", "", exceptions)).toBe("blocked-data");
    expect(classifyTrackedFile("other/data/authorized/input.csv", "", exceptions)).toBe(
      "blocked-data",
    );
    // Pattern is anchored on both ends: a longer path must not match.
    expect(
      classifyTrackedFile("data/authorized/storico/report_2024.csv.old", "", exceptions),
    ).toBe("blocked-ext");
    expect(classifyTrackedFile("data/authorized/storico/report_24.csv", "", exceptions)).toBe(
      "blocked-data",
    );
  });
  it("waives the extension rule but NEVER the content rule (binary sniff still wins)", () => {
    expect(classifyTrackedFile("data/authorized/input.csv", "PK\x03\x04rest", exceptions)).toBe(
      "blocked-binary",
    );
    expect(classifyTrackedFile("data/authorized/input.csv", "a" + NUL + "b", exceptions)).toBe(
      "blocked-binary",
    );
    expect(
      classifyTrackedFile("data/authorized/storico/report_2024.csv", "PKzip", exceptions),
    ).toBe("blocked-binary");
    // …and a genuinely textual sample still passes.
    expect(classifyTrackedFile("data/authorized/input.csv", "id,name\n1,x\n", exceptions)).toBe(
      "allowed",
    );
  });
});

describe("classifyTrackedFile — the absolute zones an injected list can never reach", () => {
  // These specs all pass compile (none of them touches a canary literally),
  // so what blocks them at run time is the ORDER of the rules, not validation.
  // That is the point: the guarantee must not depend on the canary list being
  // exhaustive, because no finite list of samples ever is.
  it("public/ stays blocked — the published bundle is never exempt", () => {
    const exceptions = compileDataExceptions({ patterns: ["^public/data/report\\.csv$"] });
    expect(exceptions.matches("public/data/report.csv")).toBe(true);
    expect(classifyTrackedFile("public/data/report.csv", "", exceptions)).toBe("blocked-data");
  });
  it("graphify-out/ stays blocked-graphify", () => {
    const exceptions = compileDataExceptions({ exactPaths: ["graphify-out/notes.csv"] });
    expect(exceptions.matches("graphify-out/notes.csv")).toBe(true);
    expect(classifyTrackedFile("graphify-out/notes.csv", "", exceptions)).toBe("blocked-graphify");
  });
  it(".graphify-tools/ stays blocked-graphify", () => {
    const exceptions = compileDataExceptions({ exactPaths: [".graphify-tools/uv/other.db"] });
    expect(classifyTrackedFile(".graphify-tools/uv/other.db", "", exceptions)).toBe(
      "blocked-graphify",
    );
  });
  it("a root graph.json stays blocked-graphify", () => {
    const exceptions = compileDataExceptions({ exactPaths: ["graph.json"] });
    expect(classifyTrackedFile("graph.json", "", exceptions)).toBe("blocked-graphify");
  });
  it(".claude/worktrees/ stays blocked-worktree", () => {
    const exceptions = compileDataExceptions({ exactPaths: [".claude/worktrees/agent-y/x.csv"] });
    expect(classifyTrackedFile(".claude/worktrees/agent-y/x.csv", "", exceptions)).toBe(
      "blocked-worktree",
    );
  });
});

describe("lintProjectState — synthetic", () => {
  it("flags an auto-stale header (HEAD sha + hand test count)", () => {
    const bad = "HEAD main: `a4d19981`. Test: 103/103.";
    expect(lintProjectState(bad)).toHaveLength(2);
  });
  it("passes a stale-free header", () => {
    const good = "Ultimo batch chiuso: 0E (PR #15). CI: verde.";
    expect(lintProjectState(good)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
// Single source of truth (pure, dependency-free). Imported here (tsconfig allowJs)
// AND by scripts/repo-guardrails.mjs which enforces the same rules over `git ls-files`.
import { classifyTrackedFile, lintProjectState } from "../../../scripts/guardrails-core.mjs";

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

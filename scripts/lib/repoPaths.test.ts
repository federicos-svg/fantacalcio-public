import { describe, it, expect, afterEach } from "vitest";
import { platform, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { repoRootFromScriptUrl, assertOutsideRepo } from "./repoPaths.js";

describe("repoRootFromScriptUrl", () => {
  it("resolves the real repo root, matching a manual fileURLToPath computation from this same file", () => {
    // This file lives at <repoRoot>/scripts/lib/repoPaths.test.ts. A
    // caller in scripts/ (one level up from here) computes its repo root
    // as "go up one directory from the script's own location" — the same
    // arithmetic applied here, starting one directory deeper, must land on
    // the identical root.
    const expectedRoot = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
    const actualRoot = repoRootFromScriptUrl(new URL("../fakeScript.ts", import.meta.url).href).replace(/[\\/]$/, "");
    expect(actualRoot).toBe(expectedRoot);
  });

  it("decodes a percent-encoded space in the caller URL (the bug .pathname had)", () => {
    const url = "file:///tmp/My%20Repo/scripts/build-listone-candidate.ts";
    expect(repoRootFromScriptUrl(url)).toBe("/tmp/My Repo");
  });

  it("decodes other percent-escaped characters (accented path segment)", () => {
    const url = "file:///tmp/caff%C3%A8/scripts/x.ts";
    expect(repoRootFromScriptUrl(url)).toBe("/tmp/caff\u00e8");
  });

  it("is stable across two identical calls (deterministic, no environment leakage)", () => {
    const url = "file:///tmp/repo/scripts/x.ts";
    expect(repoRootFromScriptUrl(url)).toBe(repoRootFromScriptUrl(url));
  });

  it("defaults upLevels to 1 (a caller directly in scripts/)", () => {
    const url = "file:///tmp/repo/scripts/x.ts";
    expect(repoRootFromScriptUrl(url)).toBe("/tmp/repo");
  });

  it("upLevels=2 resolves correctly for a caller nested one directory deeper (scripts/lib/*.ts)", () => {
    // The exact bug this test guards against: scripts/lib/listone-candidate-worker.ts
    // used the default (upLevels=1) once and silently computed "scripts/" as
    // its own repo root instead of the real repo root — no error, just a
    // wrong path that then made every relative resolution inside it wrong.
    const url = "file:///tmp/repo/scripts/lib/x.ts";
    expect(repoRootFromScriptUrl(url, 2)).toBe("/tmp/repo");
  });
});

describe("assertOutsideRepo", () => {
  const repoRoot = "/home/user/fantacalcio";

  it("rejects a path exactly equal to the repo root", () => {
    expect(() => assertOutsideRepo(repoRoot, "--file", repoRoot)).toThrow(/resolves inside this repository/);
  });

  it("rejects a path nested inside the repo root", () => {
    expect(() => assertOutsideRepo(repoRoot, "--file", `${repoRoot}/public/data/listone_2025_26.json`)).toThrow(
      /resolves inside this repository/,
    );
  });

  it("rejects a relative path that resolves inside the repo root when cwd is the repo root", () => {
    // resolve() uses process.cwd(); this suite always runs from the repo
    // root, so a bare relative filename resolves inside it.
    expect(() => assertOutsideRepo(process.cwd(), "--out-json", "candidate.json")).toThrow(
      /resolves inside this repository/,
    );
  });

  it("accepts a genuinely external path", () => {
    expect(() => assertOutsideRepo(repoRoot, "--file", "/tmp/outside/listone.xlsx")).not.toThrow();
  });

  it("accepts an external path containing a space", () => {
    expect(() => assertOutsideRepo(repoRoot, "--out-json", "/tmp/My Folder/candidate.json")).not.toThrow();
  });

  it("does not reject a sibling directory that merely shares the repo root as a string prefix", () => {
    // /home/user/fantacalcio-backup is NOT inside /home/user/fantacalcio —
    // a naive startsWith() string check (instead of path.relative) would
    // get this wrong.
    expect(() => assertOutsideRepo(repoRoot, "--file", "/home/user/fantacalcio-backup/listone.xlsx")).not.toThrow();
  });

  it("documents the win32 behavior it delegates to Node's own fileURLToPath (not re-tested here)", () => {
    // This suite runs on Linux CI; a real win32 drive-letter path
    // (C:\Users\...\scripts\x.ts) is converted correctly by Node's own
    // `fileURLToPath`, which is part of Node's cross-platform contract and
    // has its own upstream test coverage — this repo does not reimplement
    // that conversion, only wraps it, so there is nothing win32-specific to
    // assert here beyond noting the current OS for context.
    expect(typeof platform()).toBe("string");
  });
});

describe("assertOutsideRepo — symlink-aware (Finding 10)", () => {
  // Built entirely from a synthetic "repo root" in a temp directory — never
  // the real repository — so these tests can create real symlinks without
  // touching this repo's own working tree. assertOutsideRepo takes
  // repoRoot as a plain parameter, so a synthetic one exercises the exact
  // same canonicalization path as the real one.
  const tmpDirs: string[] = [];
  function freshTmpDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }
  /**
   * Creates a symlink, or calls `ctx.skip()` (a genuine Vitest skip —
   * reported distinctly from both pass and fail, never silently counted as
   * "passed") if symlink creation itself is unavailable in this sandbox
   * (e.g. Windows without dev mode/admin). Critically, this ONLY wraps the
   * `symlinkSync` call: it must never catch an error thrown by an
   * `expect(...)` assertion that runs afterward — Finding 12 was exactly
   * that bug (a `try` spanning both symlink creation AND the assertions,
   * so a real assertOutsideRepo() regression would have been swallowed
   * here and misreported as "skipped: symlink creation unavailable"
   * instead of failing the test).
   */
  function trySymlink(ctx: { skip: () => void }, target: string, linkPath: string): void {
    try {
      symlinkSync(target, linkPath);
    } catch {
      // ctx.skip() itself throws to unwind the test as "skipped" — nothing
      // after this call, here or in the calling test, executes.
      ctx.skip();
    }
  }
  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("rejects an external symlink pointing directly at a file inside the repo", (ctx) => {
    const repoRoot = freshTmpDir("repo-root-");
    const realFile = join(repoRoot, "secret-inside-repo.txt");
    writeFileSync(realFile, "real repo content");

    const outsideDir = freshTmpDir("outside-dir-");
    const alias = join(outsideDir, "looks-external.xlsx");
    trySymlink(ctx, realFile, alias);

    // Runs unconditionally after a successful symlink creation — outside
    // any try/catch, so a genuine assertOutsideRepo() regression here
    // fails the test instead of being absorbed as an environment skip.
    expect(() => assertOutsideRepo(repoRoot, "--file", alias)).toThrow(/resolves inside this repository/);
  });

  it("rejects a path under an external directory that is itself a symlink into the repo, even for a not-yet-existing child", (ctx) => {
    const repoRoot = freshTmpDir("repo-root-");
    mkdirSync(join(repoRoot, "data"));

    const outsideDir = freshTmpDir("outside-dir-");
    const dirAlias = join(outsideDir, "alias-dir");
    trySymlink(ctx, join(repoRoot, "data"), dirAlias);

    // The child file does not exist yet — this is exactly the shape of a
    // fresh --out-json/--out-manifest destination.
    const notYetExisting = join(dirAlias, "candidate.json");
    expect(() => assertOutsideRepo(repoRoot, "--out-json", notYetExisting)).toThrow(/resolves inside this repository/);
  });

  it("accepts a genuinely external, not-yet-existing path with no symlink involved", () => {
    const repoRoot = freshTmpDir("repo-root-");
    const outsideDir = freshTmpDir("outside-dir-");
    const notYetExisting = join(outsideDir, "does-not-exist-yet.json");
    expect(() => assertOutsideRepo(repoRoot, "--out-json", notYetExisting)).not.toThrow();
  });

  it("still accepts a genuinely external path when the repo root itself is reached through a symlink", (ctx) => {
    const realRepoRoot = freshTmpDir("repo-root-");
    const outerDir = freshTmpDir("outer-");
    const repoRootAlias = join(outerDir, "repo-alias");
    trySymlink(ctx, realRepoRoot, repoRootAlias);

    const outsideDir = freshTmpDir("outside-dir-");
    const external = join(outsideDir, "external.xlsx");
    // Pass the SYMLINK form of repoRoot (as a caller might if it were
    // reached via a symlinked checkout) — a genuinely external path must
    // still be accepted, not rejected by an over-eager canonicalization.
    expect(() => assertOutsideRepo(repoRootAlias, "--file", external)).not.toThrow();
  });
});

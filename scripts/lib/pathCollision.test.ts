import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, linkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertNoPathCollisions, canonicalizePathForCollisionCheck, PathCollisionError } from "./pathCollision.js";

describe("assertNoPathCollisions", () => {
  const tmpDirs: string[] = [];
  function freshTmpDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "path-collision-test-"));
    tmpDirs.push(dir);
    return dir;
  }
  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("passes for three genuinely distinct paths", () => {
    const dir = freshTmpDir();
    expect(() =>
      assertNoPathCollisions({
        "--file": join(dir, "raw.xlsx"),
        "--out-json": join(dir, "candidate.json"),
        "--out-manifest": join(dir, "manifest.json"),
      }),
    ).not.toThrow();
  });

  it("throws when --file and --out-json are the literal same path", () => {
    const dir = freshTmpDir();
    const same = join(dir, "raw.xlsx");
    expect(() =>
      assertNoPathCollisions({ "--file": same, "--out-json": same, "--out-manifest": join(dir, "manifest.json") }),
    ).toThrow(PathCollisionError);
  });

  it("throws when --out-json and --out-manifest are the same path", () => {
    const dir = freshTmpDir();
    const same = join(dir, "out.json");
    expect(() =>
      assertNoPathCollisions({ "--file": join(dir, "raw.xlsx"), "--out-json": same, "--out-manifest": same }),
    ).toThrow(PathCollisionError);
  });

  it("throws when two paths are textually different but resolve to the same file (../ segments)", () => {
    const dir = freshTmpDir();
    mkdirSync(join(dir, "sub"));
    const direct = join(dir, "raw.xlsx");
    // Built via raw string concatenation, not path.join()/path.resolve() —
    // those would normalize the ".." away before the strings even reached
    // the function under test, defeating the point of this case (two
    // textually different CLI arguments an operator could actually type).
    const roundabout = `${dir}/sub/../raw.xlsx`;
    expect(direct).not.toBe(roundabout); // genuinely different strings
    expect(() =>
      assertNoPathCollisions({ "--file": direct, "--out-json": roundabout, "--out-manifest": join(dir, "manifest.json") }),
    ).toThrow(PathCollisionError);
  });

  it("throws when a symlink alias resolves to the same real file as a direct path", (ctx) => {
    const dir = freshTmpDir();
    const real = join(dir, "raw.xlsx");
    writeFileSync(real, "not a real xlsx, just for the path collision test");
    const alias = join(dir, "raw-alias.xlsx");
    try {
      symlinkSync(real, alias);
    } catch {
      // Symlink creation can be restricted in some sandboxes (e.g. Windows
      // without dev mode/admin) — a genuine Vitest skip (reported
      // distinctly from a pass), not a bare `return` that a real
      // assertNoPathCollisions() regression could get silently absorbed
      // into and misreport as "passed" (Finding 12).
      ctx.skip();
      return;
    }
    expect(() =>
      assertNoPathCollisions({ "--file": real, "--out-json": alias, "--out-manifest": join(dir, "manifest.json") }),
    ).toThrow(PathCollisionError);
  });

  it("detects a collision even when the colliding output path does not exist yet", () => {
    const dir = freshTmpDir();
    const raw = join(dir, "raw.xlsx");
    writeFileSync(raw, "placeholder");
    // --out-manifest points at a not-yet-existing path equal to --out-json —
    // neither has been written by the CLI yet at the point this check runs.
    const outJson = join(dir, "does-not-exist-yet.json");
    expect(() =>
      assertNoPathCollisions({ "--file": raw, "--out-json": outJson, "--out-manifest": outJson }),
    ).toThrow(PathCollisionError);
  });

  it("does not flag two paths that merely share a directory prefix as a string", () => {
    const dir = freshTmpDir();
    expect(() =>
      assertNoPathCollisions({
        "--file": join(dir, "raw.xlsx"),
        "--out-json": join(dir, "raw.xlsx.json"), // shares the "raw.xlsx" prefix textually, but is a different file
        "--out-manifest": join(dir, "manifest.json"),
      }),
    ).not.toThrow();
  });

  it("still passes for three distinct paths in a directory whose name contains a space", () => {
    const outerDir = mkdtempSync(join(tmpdir(), "path-collision-test-"));
    tmpDirs.push(outerDir);
    const dir = join(outerDir, "space in dir name");
    mkdirSync(dir);
    expect(() =>
      assertNoPathCollisions({
        "--file": join(dir, "raw file.xlsx"),
        "--out-json": join(dir, "listone candidate.json"),
        "--out-manifest": join(dir, "listone manifest.json"),
      }),
    ).not.toThrow();
  });

  describe("Finding 11 — hard links (same real file, different canonical path text)", () => {
    it("throws when --file and --out-json are hard links to the same file", (ctx) => {
      const dir = freshTmpDir();
      const real = join(dir, "raw.xlsx");
      writeFileSync(real, "not a real xlsx, just for the hard-link collision test");
      const hardLink = join(dir, "raw-hardlink.xlsx");
      try {
        linkSync(real, hardLink);
      } catch {
        // Hard link creation can be restricted or unsupported on some
        // filesystems/sandboxes — a genuine Vitest skip, not a bare
        // `return` a real regression could be silently absorbed into
        // (Finding 12).
        ctx.skip();
        return;
      }
      expect(() =>
        assertNoPathCollisions({ "--file": real, "--out-json": hardLink, "--out-manifest": join(dir, "manifest.json") }),
      ).toThrow(PathCollisionError);
    });

    it("throws when --out-json and --out-manifest are hard links to the same existing file", (ctx) => {
      const dir = freshTmpDir();
      const raw = join(dir, "raw.xlsx");
      writeFileSync(raw, "placeholder raw");
      // A pre-existing file both --out-json and --out-manifest happen to
      // point at via different hard link names (e.g. a leftover file from
      // a previous run reused by mistake).
      const existingOut = join(dir, "existing-output.json");
      writeFileSync(existingOut, "{}");
      const hardLink = join(dir, "existing-output-hardlink.json");
      try {
        linkSync(existingOut, hardLink);
      } catch {
        ctx.skip();
        return;
      }
      expect(() =>
        assertNoPathCollisions({ "--file": raw, "--out-json": existingOut, "--out-manifest": hardLink }),
      ).toThrow(PathCollisionError);
    });

    it("does not flag two DIFFERENT existing files as colliding merely because both exist", () => {
      const dir = freshTmpDir();
      const raw = join(dir, "raw.xlsx");
      const outJson = join(dir, "out.json");
      const outManifest = join(dir, "manifest.json");
      writeFileSync(raw, "raw content");
      writeFileSync(outJson, "json content");
      writeFileSync(outManifest, "manifest content");
      expect(() => assertNoPathCollisions({ "--file": raw, "--out-json": outJson, "--out-manifest": outManifest })).not.toThrow();
    });
  });
});

describe("canonicalizePathForCollisionCheck", () => {
  it("is stable: the same input always canonicalizes to the same value", () => {
    const dir = mkdtempSync(join(tmpdir(), "path-collision-test-"));
    try {
      const p = join(dir, "x.json");
      expect(canonicalizePathForCollisionCheck(p)).toBe(canonicalizePathForCollisionCheck(p));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

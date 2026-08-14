import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildTsxSubprocessCommand } from "./tsxSubprocess.js";

describe("buildTsxSubprocessCommand", () => {
  it("uses process.execPath as the command — never a node_modules/.bin shim", () => {
    const cmd = buildTsxSubprocessCommand("/tmp/repo", "/tmp/repo/scripts/lib/worker.ts", ["--file", "x"]);
    expect(cmd.command).toBe(process.execPath);
    expect(cmd.command).not.toMatch(/\.bin/);
  });

  it("resolves tsx's real CLI entrypoint (dist/cli.mjs), not the .bin shim", () => {
    const cmd = buildTsxSubprocessCommand("/tmp/repo", "/tmp/repo/scripts/lib/worker.ts", []);
    expect(cmd.args[0]).toBe(join("/tmp/repo", "node_modules", "tsx", "dist", "cli.mjs"));
  });

  it("places the target script and forwarded args after the tsx entrypoint, in order", () => {
    const cmd = buildTsxSubprocessCommand("/tmp/repo", "/tmp/repo/scripts/lib/worker.ts", ["--file", "a.xlsx", "--out", "b.json"]);
    expect(cmd.args.slice(1)).toEqual(["/tmp/repo/scripts/lib/worker.ts", "--file", "a.xlsx", "--out", "b.json"]);
  });

  it("resolves the real tsx entrypoint that actually exists on disk in this repo (real environment sanity check)", () => {
    const repoRoot = join(import.meta.dirname, "..", "..");
    const cmd = buildTsxSubprocessCommand(repoRoot, join(repoRoot, "scripts", "lib", "listone-candidate-worker.ts"), []);
    expect(existsSync(cmd.args[0]!)).toBe(true);
  });

  it("is a pure function — same input always produces the same command", () => {
    const a = buildTsxSubprocessCommand("/tmp/repo", "/tmp/repo/x.ts", ["--a"]);
    const b = buildTsxSubprocessCommand("/tmp/repo", "/tmp/repo/x.ts", ["--a"]);
    expect(a).toEqual(b);
  });

  it("builds a path with a space in the repo root or script path without breaking (no shell involved, so no quoting to get wrong)", () => {
    const cmd = buildTsxSubprocessCommand("/tmp/My Repo", "/tmp/My Repo/scripts/lib/worker.ts", ["--file", "/tmp/My Data/x.xlsx"]);
    expect(cmd.args).toEqual([
      join("/tmp/My Repo", "node_modules", "tsx", "dist", "cli.mjs"),
      "/tmp/My Repo/scripts/lib/worker.ts",
      "--file",
      "/tmp/My Data/x.xlsx",
    ]);
  });
});

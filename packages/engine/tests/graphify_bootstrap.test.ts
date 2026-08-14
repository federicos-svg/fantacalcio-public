import { describe, it, expect } from "vitest";
// Single source of truth (pure, dependency-free). Imported here (tsconfig
// allowJs) AND by scripts/graphify-resolve.mjs, which drives the real
// project-local install/verify from the same pure helpers.
import { versionMatchesPin, uvInstallArgs, parseVersionOutput } from "../../../scripts/graphify-bootstrap-core.mjs";

// Covers the hardening requirement: the resolved binary must exactly match
// .claude/skills/graphify/.graphify_version — never a floating "latest"/
// "--upgrade" — and installs must never throw on unreadable/garbage
// `--version` output. See graphify_resolve.test.ts for the I/O-level
// (fake-binary, isolated tool-dir) coverage.

describe("versionMatchesPin — synthetic", () => {
  it("matches only the exact pinned version", () => {
    expect(versionMatchesPin("0.9.12", "0.9.12")).toBe(true);
  });
  it("never matches a different version", () => {
    expect(versionMatchesPin("0.9.12", "0.9.11")).toBe(false);
    expect(versionMatchesPin("0.9.12", "0.9.120")).toBe(false);
  });
  it("never matches a null/missing probe result", () => {
    expect(versionMatchesPin("0.9.12", null)).toBe(false);
    expect(versionMatchesPin("0.9.12", undefined)).toBe(false);
  });
  it("never matches when there is no pin at all", () => {
    expect(versionMatchesPin("", "0.9.12")).toBe(false);
    expect(versionMatchesPin(null, "0.9.12")).toBe(false);
  });
});

describe("uvInstallArgs — synthetic", () => {
  it("targets the exact pinned version with the sql+leiden extras, never a bare/floating spec", () => {
    expect(uvInstallArgs("0.9.12")).toEqual([
      "tool",
      "install",
      "graphifyy[sql,leiden]==0.9.12",
      "--force",
    ]);
  });
  it("never emits an --upgrade flag", () => {
    expect(uvInstallArgs("0.9.12")).not.toContain("--upgrade");
  });
});

describe("parseVersionOutput — synthetic", () => {
  it("extracts the version number from `graphify --version` output", () => {
    expect(parseVersionOutput("graphify 0.9.12\n")).toBe("0.9.12");
  });
  it("returns null for empty/missing output", () => {
    expect(parseVersionOutput("")).toBeNull();
    expect(parseVersionOutput(undefined)).toBeNull();
  });
  it("never throws on garbage input", () => {
    expect(() => parseVersionOutput("\x00\x01garbage")).not.toThrow();
  });
});

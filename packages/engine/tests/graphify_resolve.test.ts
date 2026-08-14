import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePinnedGraphify } from "../../../scripts/graphify-resolve.mjs";

// Deterministic tests using fake, temporary executables and directories —
// no dependency on a real graphify/uv install, and (2026-07-11 isolation
// hardening) no dependency on `sh command -v` either: graphify-resolve.mjs
// spawns `uv`/the resolved binary directly via execFileSync, which resolves
// purely from the `env.PATH` these tests construct — never the real
// machine's PATH. "uv absent" here means literally no file named `uv`
// exists anywhere the test's env.PATH points, not an assumption about
// /usr/bin or /bin on the host.
//
// Covers the review blocker: the resolver must install into and only ever
// read from a PROJECT-LOCAL uv tool dir — never uv's global tool dir,
// never PATH — so a wrong/different graphify anywhere else (global uv
// tools, another project, a stale PATH shim) can never be picked up, even
// after the project-local one was already correctly bootstrapped.

const PINNED = "0.9.12";
const WRONG = "0.5.0";

// The fake `uv` scripts below are themselves POSIX shell scripts that need
// `mkdir`/`chmod`/`cat` to do their job (simulating `uv tool install`
// dropping a binary on disk) — those are basic coreutils, not graphify/uv,
// so pointing at the real /usr/bin:/bin for them doesn't reintroduce the
// nondeterminism under test. The fake `uv`/`graphify` directories are
// always listed FIRST in the constructed PATH, so Node's own PATH
// resolution (first match wins) uses the fake ones regardless of whether
// a real `uv`/`graphify` also happens to exist somewhere in a given CI
// image's /usr/bin:/bin — this test's outcome never depends on that.
const COREUTILS_PATH = "/usr/bin:/bin";
function withCoreutils(...fakeDirs: string[]) {
  return [...fakeDirs, COREUTILS_PATH].join(":");
}

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeFakeGraphifyAt(path: string, version: string | "fail" | "garbage") {
  mkdirSync(join(path, ".."), { recursive: true });
  let body: string;
  if (version === "fail") {
    body = `#!/bin/sh\nexit 1\n`;
  } else if (version === "garbage") {
    body = `#!/bin/sh\necho "not a version string"\nexit 0\n`;
  } else {
    body = `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "graphify ${version}"; exit 0; fi\nif [ "$1" = "hook" ] && [ "$2" = "install" ]; then echo "post-commit: installed (fake ${version})"; exit 0; fi\nexit 1\n`;
  }
  writeFileSync(path, body, "utf8");
  chmodSync(path, 0o755);
}

// A fake `uv` that only supports `tool install ...` (the one subcommand
// graphify-resolve.mjs invokes). It drops a correctly-versioned fake
// graphify at $UV_TOOL_BIN_DIR/graphify — exactly what a real
// `uv tool install --force` would do, scoped by the env vars it receives —
// and records the UV_TOOL_DIR/UV_TOOL_BIN_DIR it was actually invoked with,
// so tests can assert the install never touched anything else.
function writeFakeUv(dir: string, installedVersion: string, invocationLogFile: string) {
  const path = join(dir, "uv");
  const body = `#!/bin/sh
if [ "$1" = "tool" ] && [ "$2" = "install" ]; then
  {
    echo "UV_TOOL_DIR=$UV_TOOL_DIR"
    echo "UV_TOOL_BIN_DIR=$UV_TOOL_BIN_DIR"
  } >> "${invocationLogFile}"
  mkdir -p "$UV_TOOL_BIN_DIR"
  cat > "$UV_TOOL_BIN_DIR/graphify" <<EOF
#!/bin/sh
if [ "\\$1" = "--version" ]; then echo "graphify ${installedVersion}"; exit 0; fi
if [ "\\$1" = "hook" ] && [ "\\$2" = "install" ]; then echo "post-commit: installed (fake uv-installed)"; exit 0; fi
exit 1
EOF
  chmod +x "$UV_TOOL_BIN_DIR/graphify"
  exit 0
fi
exit 1
`;
  writeFileSync(path, body, "utf8");
  chmodSync(path, 0o755);
  return path;
}

// A fake `uv` that must never be invoked (records a marker file if it is,
// so tests can assert "uv was never called" for the already-resolved
// fast path).
function writeUnreachableUv(dir: string, markerFile: string) {
  const path = join(dir, "uv");
  writeFileSync(path, `#!/bin/sh\necho "CALLED" >> "${markerFile}"\nexit 1\n`, "utf8");
  chmodSync(path, 0o755);
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("resolvePinnedGraphify — project-local isolation, deterministic fakes", () => {
  it("resolves an already-correct project-local binary without ever invoking uv", () => {
    const uvToolBinDir = join(makeTmpDir("local-bin-"), "bin");
    const uvToolDir = join(makeTmpDir("local-tool-"), "tools");
    writeFakeGraphifyAt(join(uvToolBinDir, "graphify"), PINNED);

    const uvDir = makeTmpDir("uv-unreachable-");
    const marker = join(uvDir, "called.marker");
    writeUnreachableUv(uvDir, marker);

    const result = resolvePinnedGraphify({
      pinned: PINNED,
      env: { PATH: uvDir },
      uvToolDir,
      uvToolBinDir,
    });

    expect(result.resolvedPath).toBe(join(uvToolBinDir, "graphify"));
    expect(result.installed).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(existsSync(marker)).toBe(false); // uv was never called — already resolved
  });

  it("installs into the project-local tool dirs, passing UV_TOOL_DIR/UV_TOOL_BIN_DIR only to that one subprocess", () => {
    const uvToolBinDir = join(makeTmpDir("local-bin-"), "bin");
    const uvToolDir = join(makeTmpDir("local-tool-"), "tools");
    const uvDir = makeTmpDir("uv-bin-");
    const log = join(makeTmpDir("uv-log-"), "invocation.log");
    writeFakeUv(uvDir, PINNED, log);

    const envBefore = { PATH: withCoreutils(uvDir) };
    const result = resolvePinnedGraphify({ pinned: PINNED, env: envBefore, uvToolDir, uvToolBinDir });

    expect(result.resolvedPath).toBe(join(uvToolBinDir, "graphify"));
    expect(result.installed).toBe(true);
    expect(result.warnings).toEqual([]);

    const logged = readFileSync(log, "utf8");
    expect(logged).toContain(`UV_TOOL_DIR=${uvToolDir}`);
    expect(logged).toContain(`UV_TOOL_BIN_DIR=${uvToolBinDir}`);

    // The env object passed in is never mutated with the install-only vars.
    expect(envBefore).not.toHaveProperty("UV_TOOL_DIR");
    expect(envBefore).not.toHaveProperty("UV_TOOL_BIN_DIR");
    expect(process.env.UV_TOOL_DIR).toBeUndefined();
  });

  it("never installs and never matches when uv is not reachable via env.PATH (fully deterministic — no fake uv anywhere)", () => {
    const uvToolBinDir = join(makeTmpDir("local-bin-"), "bin");
    const uvToolDir = join(makeTmpDir("local-tool-"), "tools");
    const emptyDir = makeTmpDir("empty-path-");

    const result = resolvePinnedGraphify({ pinned: PINNED, env: { PATH: emptyDir }, uvToolDir, uvToolBinDir });

    expect(result.resolvedPath).toBeNull();
    expect(result.installed).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("reinstalls when the project-local binary is present but the wrong version", () => {
    const uvToolBinDir = join(makeTmpDir("local-bin-"), "bin");
    const uvToolDir = join(makeTmpDir("local-tool-"), "tools");
    writeFakeGraphifyAt(join(uvToolBinDir, "graphify"), WRONG);
    const uvDir = makeTmpDir("uv-bin-");
    const log = join(makeTmpDir("uv-log-"), "invocation.log");
    writeFakeUv(uvDir, PINNED, log);

    const result = resolvePinnedGraphify({ pinned: PINNED, env: { PATH: withCoreutils(uvDir) }, uvToolDir, uvToolBinDir });

    expect(result.resolvedPath).toBe(join(uvToolBinDir, "graphify"));
    expect(result.installed).toBe(true);
    // The reinstalled binary now reports the pinned version, not the old one.
    expect(readFileSync(join(uvToolBinDir, "graphify"), "utf8")).toContain(PINNED);
  });

  it("ignores a correct-version graphify reachable only via env.PATH, outside the project-local dir", () => {
    const uvToolBinDir = join(makeTmpDir("local-bin-"), "bin");
    const uvToolDir = join(makeTmpDir("local-tool-"), "tools");
    const pathDir = makeTmpDir("path-graphify-");
    writeFakeGraphifyAt(join(pathDir, "graphify"), PINNED); // correct version, but NOT project-local

    const result = resolvePinnedGraphify({ pinned: PINNED, env: { PATH: pathDir }, uvToolDir, uvToolBinDir });

    // No uv on this PATH either, so nothing can be installed — proves the
    // PATH-resident graphify (even though it's the *correct* version) was
    // never consulted as a shortcut.
    expect(result.resolvedPath).toBeNull();
    expect(existsSync(join(uvToolBinDir, "graphify"))).toBe(false);
  });

  it("stays isolated when a same-named 'global' uv tool dir is swapped after the project-local bootstrap", () => {
    const uvToolBinDir = join(makeTmpDir("local-bin-"), "bin");
    const uvToolDir = join(makeTmpDir("local-tool-"), "tools");
    const uvDir = makeTmpDir("uv-bin-");
    const log = join(makeTmpDir("uv-log-"), "invocation.log");
    writeFakeUv(uvDir, PINNED, log);

    const testPath = withCoreutils(uvDir);
    const first = resolvePinnedGraphify({ pinned: PINNED, env: { PATH: testPath }, uvToolDir, uvToolBinDir });
    expect(first.resolvedPath).toBe(join(uvToolBinDir, "graphify"));

    // Simulate a decoy "global" tool dir (a different path entirely, as if
    // it were ~/.local/share/uv/tools) getting a DIFFERENT version dropped
    // into it by some other project/process.
    const decoyGlobalBinDir = join(makeTmpDir("decoy-global-bin-"), "bin");
    writeFakeGraphifyAt(join(decoyGlobalBinDir, "graphify"), WRONG);

    // Re-resolving with the SAME project-local dirs is unaffected — the
    // decoy was never referenced.
    const second = resolvePinnedGraphify({ pinned: PINNED, env: { PATH: testPath }, uvToolDir, uvToolBinDir });
    expect(second.resolvedPath).toBe(join(uvToolBinDir, "graphify"));
    expect(second.installed).toBe(false); // still the same already-correct local binary, no reinstall needed
  });

  it("never throws when `--version` fails or produces garbage on the project-local path", () => {
    const uvToolBinDir = join(makeTmpDir("local-bin-"), "bin");
    const uvToolDir = join(makeTmpDir("local-tool-"), "tools");
    writeFakeGraphifyAt(join(uvToolBinDir, "graphify"), "fail");
    const emptyDir = makeTmpDir("empty-path-");

    expect(() =>
      resolvePinnedGraphify({ pinned: PINNED, env: { PATH: emptyDir }, uvToolDir, uvToolBinDir }),
    ).not.toThrow();
    const result = resolvePinnedGraphify({ pinned: PINNED, env: { PATH: emptyDir }, uvToolDir, uvToolBinDir });
    expect(result.resolvedPath).toBeNull();
  });

  it("warns when uv install runs but the resulting local binary still doesn't match the pin", () => {
    const uvToolBinDir = join(makeTmpDir("local-bin-"), "bin");
    const uvToolDir = join(makeTmpDir("local-tool-"), "tools");
    const uvDir = makeTmpDir("uv-bin-");
    const log = join(makeTmpDir("uv-log-"), "invocation.log");
    writeFakeUv(uvDir, WRONG, log); // uv "succeeds" but drops the wrong version anyway

    const result = resolvePinnedGraphify({ pinned: PINNED, env: { PATH: withCoreutils(uvDir) }, uvToolDir, uvToolBinDir });
    expect(result.resolvedPath).toBeNull();
    expect(result.installed).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns no-op with a warning when there is no pinned version at all", () => {
    const result = resolvePinnedGraphify({ pinned: "", env: { PATH: "" }, uvToolDir: "/tmp/x", uvToolBinDir: "/tmp/y" });
    expect(result.resolvedPath).toBeNull();
    expect(result.warnings).toEqual(["no pinned version"]);
  });

  it("returns no-op with a warning when the project-local tool dirs aren't configured", () => {
    const result = resolvePinnedGraphify({ pinned: PINNED, env: { PATH: "" } } as any);
    expect(result.resolvedPath).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// graphify-resolve — finds/installs the graphify binary that exactly
// matches the version pinned in .claude/skills/graphify/.graphify_version,
// entirely inside a **project-local** `uv` tool directory. Never looks at
// PATH, never looks at uv's global tool directory, never falls back to
// "whatever graphify happens to be reachable" — a wrong/different-version
// binary elsewhere (global uv tools, another project, a stale shim) is
// invisible to this module by construction, not just by preference.
//
// Parameterized by `env`/`uvToolDir`/`uvToolBinDir` so tests can point it
// at fake binaries in temp directories — see
// packages/engine/tests/graphify_resolve.test.ts. No dependency on `sh`/
// `command -v`: locating `uv` itself is left to Node's own child_process
// PATH resolution (execFileSync throws ENOENT if not found), so tests
// control "uv absent" purely via the `env.PATH` they pass in, not by
// assuming anything about the real machine's directory layout.
import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import { uvInstallArgs, parseVersionOutput, versionMatchesPin } from "./graphify-bootstrap-core.mjs";

function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Never throws: a missing/non-executable/version-less binary just probes
// to { path, version: null }, which the caller treats as "no match".
function probe(path, env) {
  try {
    if (!isExecutable(path)) return { path, version: null };
    const out = execFileSync(path, ["--version"], { env, encoding: "utf8", timeout: 10_000 });
    return { path, version: parseVersionOutput(out) };
  } catch {
    return { path, version: null };
  }
}

// Returns:
//   { resolvedPath: string, installed: boolean, warnings: [] }               — project-local binary matches the pin
//   { resolvedPath: null, installed: false, warnings: ["human message"] }    — no match, nothing usable
export function resolvePinnedGraphify({ pinned, env, uvToolDir, uvToolBinDir }) {
  const warnings = [];
  if (!pinned) return { resolvedPath: null, installed: false, warnings: ["no pinned version"] };
  if (!uvToolDir || !uvToolBinDir) {
    return { resolvedPath: null, installed: false, warnings: ["no project-local uv tool dir configured"] };
  }

  const localPath = join(uvToolBinDir, "graphify");

  const existing = probe(localPath, env);
  if (versionMatchesPin(pinned, existing.version)) {
    return { resolvedPath: localPath, installed: false, warnings: [] };
  }

  // Install/reinstall the exact pin into the PROJECT-LOCAL tool dirs only —
  // UV_TOOL_DIR/UV_TOOL_BIN_DIR are set solely on this one subprocess's
  // env, never exported to the caller's own process/shell, and never touch
  // uv's global tool directory.
  const installEnv = { ...env, UV_TOOL_DIR: uvToolDir, UV_TOOL_BIN_DIR: uvToolBinDir };
  try {
    execFileSync("uv", uvInstallArgs(pinned), { env: installEnv, encoding: "utf8", timeout: 300_000 });
  } catch (err) {
    warnings.push(
      `could not install graphifyy==${pinned} into the project-local uv tool dir (\`uv\` missing or install failed): ${err.message}`,
    );
    return { resolvedPath: null, installed: false, warnings };
  }

  // Re-verify the SAME project-local path — never assume, never look
  // anywhere else (not the global uv tool dir, not PATH).
  const postInstall = probe(localPath, env);
  if (versionMatchesPin(pinned, postInstall.version)) {
    return { resolvedPath: localPath, installed: true, warnings: [] };
  }

  warnings.push(
    `installed graphifyy==${pinned} via uv into the project-local tool dir, but ${localPath} reports version ${postInstall.version ?? "(unreadable)"} — not using it.`,
  );
  return { resolvedPath: null, installed: false, warnings };
}

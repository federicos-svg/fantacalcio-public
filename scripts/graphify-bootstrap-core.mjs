// graphify-bootstrap core — PURE decision logic, NO Node imports/I/O.
// Single source of truth shared by:
//   - scripts/graphify-resolve.mjs         (real PATH/uv probing + install)
//   - scripts/graphify-bootstrap.mjs       (CLI orchestration)
//   - packages/engine/tests/graphify_bootstrap.test.ts (synthetic unit tests)
// Keeping this dependency-free lets the TypeScript test import it
// (tsconfig allowJs) the same way guardrails-core.mjs is imported.

// Exact-match check between a probed `--version` output (already parsed
// down to e.g. "0.9.12" by parseVersionOutput, or null if the binary was
// missing/unexecutable/unparseable) and the pin. Never a fuzzy/prefix
// match — a probe of null or of any other version string is simply not a
// match, never treated as "close enough".
export function versionMatchesPin(pinned, probedVersion) {
  return Boolean(pinned) && probedVersion === pinned;
}

// Exact-pin uv install args — `--force` reinstalls even if a differently
// configured version is already present; `[sql,leiden]` matches the extras
// this project was set up with. Never `--upgrade`/an unpinned spec.
export function uvInstallArgs(pinned) {
  return ["tool", "install", `graphifyy[sql,leiden]==${pinned}`, "--force"];
}

// Parses `graphify --version` output ("graphify 0.9.12") down to "0.9.12".
// Never throws: unparseable/empty input just returns null (the caller
// treats a null version as "this candidate doesn't match the pin",
// never as an exception to propagate).
export function parseVersionOutput(stdout) {
  const trimmed = (stdout ?? "").trim();
  if (!trimmed) return null;
  const last = trimmed.split(/\s+/).pop();
  return last || null;
}

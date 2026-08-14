// Portable "run a .ts file as a separate OS process via tsx" launcher —
// shared by scripts/build-listone-candidate.ts (the real cross-process
// determinism check) and scripts/lib/listoneCandidateWorker.test.ts (its
// integration test), so the command is built in exactly one place.
//
// Review finding: launching `node_modules/.bin/tsx` directly with
// `execFileSync` is not portable. On POSIX that file is a shebang script
// (`#!/usr/bin/env node`) that the OS itself interprets; npm exposes it on
// Windows as a generated `.cmd`/`.ps1` shim instead, which `execFileSync`
// cannot run as a plain executable without `shell: true` (itself its own
// portability/quoting hazard) — and the extensionless POSIX path is not a
// genuine cross-platform guarantee to begin with.
//
// Fix: never touch the `.bin` shim at all. Resolve tsx's real CLI
// entrypoint file directly (`tsx`'s own `package.json` declares
// `"bin": "./dist/cli.mjs"` — a plain ESM script, not a shebang/shim) and
// run it with `process.execPath` (the exact Node binary already running
// this process, on any platform) — i.e. `node <tsx-cli.mjs> <script> <args>`,
// the same shape everywhere, no shell, no PATH lookup, no OS-specific shim.

import { join } from "node:path";

export interface TsxSubprocessCommand {
  /** Always `process.execPath` — the running Node binary itself. */
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * Builds the `execFileSync`-ready `{command, args}` for running `scriptPath`
 * (a `.ts` file) as a separate OS process via tsx, forwarding `scriptArgs`
 * to it. `repoRoot` must be this repository's root (where `node_modules/`
 * lives) — see `repoRootFromScriptUrl` in `repoPaths.ts`.
 */
export function buildTsxSubprocessCommand(
  repoRoot: string,
  scriptPath: string,
  scriptArgs: readonly string[],
): TsxSubprocessCommand {
  const tsxCliEntry = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  return {
    command: process.execPath,
    args: [tsxCliEntry, scriptPath, ...scriptArgs],
  };
}

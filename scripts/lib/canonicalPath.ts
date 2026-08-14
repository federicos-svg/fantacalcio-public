// Shared, single-purpose canonical-path resolution — the one place both
// `assertOutsideRepo` (repoPaths.ts, Finding 10) and the collision guard
// (pathCollision.ts, Finding 7) resolve symlinks. Extracted so the fix
// lives in exactly one utility, not duplicated across the two callers.

import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/**
 * Resolves `inputPath` to its canonical real filesystem path: follows
 * symlinks — including an ANCESTOR directory that is itself a symlink, not
 * just the final path segment — for whichever leading portion of the path
 * already exists on disk, then rejoins the not-yet-created remainder
 * (typical for a `--out-json`/`--out-manifest` destination on a fresh run,
 * which usually does not exist yet) using native `path.join`, never manual
 * string concatenation.
 *
 * This is the fix for the symlink-escape gap in the outside-repo guard: a
 * purely lexical `resolve()`/`relative()` check (the previous
 * implementation) cannot see that an apparently-external path is actually
 * a symlink pointing at a real file inside the repository, or sits under a
 * directory that is itself such a symlink.
 */
export function resolveCanonicalPath(inputPath: string): string {
  const abs = resolve(inputPath);
  let probe = abs;
  const notYetExistingSuffix: string[] = [];
  for (;;) {
    try {
      const real = realpathSync.native(probe);
      return notYetExistingSuffix.length > 0 ? join(real, ...notYetExistingSuffix) : real;
    } catch {
      const parent = dirname(probe);
      if (parent === probe) {
        // Reached the filesystem root without finding an existing
        // ancestor — nothing left to resolve; use the plain resolved path.
        return notYetExistingSuffix.length > 0 ? join(probe, ...notYetExistingSuffix) : probe;
      }
      notYetExistingSuffix.unshift(basename(probe));
      probe = parent;
    }
  }
}

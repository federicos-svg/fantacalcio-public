// Shared, tested utility for the two places in this repo that resolve their
// own repository root and refuse to read/write real data inside it
// (scripts/normalize-vote-xlsx.ts, scripts/build-listone-candidate.ts).
// Extracted after a review finding: both scripts previously duplicated
// `resolve(new URL("..", import.meta.url).pathname)`, which is not portable
// — `URL.pathname` never decodes percent-escapes (a repo cloned into a path
// containing a space, e.g. "My Repo/scripts/x.ts", produces a `pathname` of
// ".../My%20Repo/scripts/x.ts", which then silently fails to compare equal
// to any real filesystem path) and, on Windows, yields a leading-slash form
// (`/C:/Users/...`) that `path` functions do not treat as the same path as
// `C:\Users\...`. `node:url`'s `fileURLToPath` is Node's own cross-platform,
// well-tested conversion (decodes percent-escapes; produces a genuine
// `C:\...` path on win32) — this module is a thin, single-purpose wrapper
// around it plus the outside-repo guard both scripts need.

import { fileURLToPath } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";
import { resolveCanonicalPath } from "./canonicalPath.js";

/**
 * Resolves the repository root from a caller's own `import.meta.url`,
 * walking up `upLevels` directories first — e.g. `1` for a file directly in
 * `scripts/`, `2` for a file in `scripts/lib/`. Pass `import.meta.url`
 * unchanged; this function does the `new URL("../".repeat(upLevels), ...)`
 * arithmetic itself so a caller never has to get it right on its own (get
 * `upLevels` wrong and you silently get the wrong directory, not an error —
 * every caller in this repo is covered by a test that checks the real
 * value, see repoPaths.test.ts and each caller's own test).
 */
export function repoRootFromScriptUrl(scriptImportMetaUrl: string, upLevels: number = 1): string {
  const relativeSpec = "../".repeat(upLevels);
  // `resolve()` normalizes the trailing slash `fileURLToPath` leaves on a
  // directory URL (`new URL("../...", ...)` always ends in `/`) — cosmetic
  // only, but keeps this value directly comparable to `resolve()`d input
  // paths elsewhere without every caller having to know that quirk.
  return resolve(fileURLToPath(new URL(relativeSpec, scriptImportMetaUrl)));
}

/**
 * Throws if `path` resolves inside `repoRoot` — the guard against
 * accidentally reading/writing real data into this repository's working
 * tree. `label` is only used in the error message (e.g. `"--file"`).
 *
 * Canonical/symlink-aware (Finding 10): a purely lexical `resolve()`/
 * `relative()` comparison cannot see that an apparently-external path is
 * actually a symlink pointing at a real file inside the repo, or sits
 * under a directory that is itself such a symlink — both `repoRoot` and
 * `path` are resolved to their real filesystem form (`resolveCanonicalPath`,
 * shared with the collision guard in `pathCollision.ts`) before the
 * containment check. A target that does not exist yet is resolved as far
 * as its nearest existing ancestor and the not-yet-created remainder is
 * rejoined unchanged — still correctly rejected if that ancestor turns out
 * to be inside the repo (e.g. via a symlinked parent directory).
 */
export function assertOutsideRepo(repoRoot: string, label: string, path: string): void {
  const canonicalRepoRoot = resolveCanonicalPath(repoRoot);
  const canonicalTarget = resolveCanonicalPath(path);
  const rel = relative(canonicalRepoRoot, canonicalTarget);
  const isInsideRepo = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (isInsideRepo) {
    throw new Error(
      `Refusing to use ${label}='${path}': it resolves inside this repository (${repoRoot}, canonical: ${canonicalRepoRoot}). ` +
        `Real data and derived output must never be committed — point ${label} outside the repo.`,
    );
  }
}

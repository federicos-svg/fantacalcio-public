// Fail-closed collision guard between distinct CLI path arguments — used by
// scripts/build-listone-candidate.ts to refuse running when --file,
// --out-json, and --out-manifest resolve to the same real file (an operator
// mistake that could otherwise overwrite the raw XLSX, or make the
// candidate/manifest overwrite each other) BEFORE any read or write
// happens. Considers absolute/canonical paths, resolvable symlinks (via the
// shared `resolveCanonicalPath`, canonicalPath.ts), casing differences
// where the target platform's filesystem is typically case-insensitive,
// and — for paths that already exist — filesystem identity (Finding 11:
// two hard links can have different canonical path strings yet be the same
// real file/inode, which `realpath` alone cannot detect).

import { statSync } from "node:fs";
import { resolveCanonicalPath } from "./canonicalPath.js";

/**
 * Canonicalizes `inputPath` for equality comparison: resolves it to its
 * real filesystem path (`resolveCanonicalPath`), then — on a platform whose
 * default filesystem is typically case-insensitive (win32, darwin) — also
 * lowercases the result. Erring toward treating MORE pairs as "possibly the
 * same file" is the fail-closed direction for a guard whose only job is to
 * refuse a write that might destroy real data; Linux's typically
 * case-sensitive default means two differently-cased paths there usually
 * genuinely are different files, so casing is left significant there.
 */
export function canonicalizePathForCollisionCheck(inputPath: string): string {
  const real = resolveCanonicalPath(inputPath);
  const caseInsensitivePlatform = process.platform === "win32" || process.platform === "darwin";
  return caseInsensitivePlatform ? real.toLowerCase() : real;
}

export class PathCollisionError extends Error {
  constructor(
    message: string,
    readonly labelA: string,
    readonly labelB: string,
  ) {
    super(message);
    this.name = "PathCollisionError";
  }
}

/**
 * Filesystem identity for an EXISTING path — `{dev, ino}` from `fs.statSync`
 * — used to catch two hard links of the same file even when their
 * canonical path strings differ (a hard link has no symlink for `realpath`
 * to follow back to a single "true" path; each hard link name IS a fully
 * real, distinct path). Returns `null` for a path that does not exist yet
 * (nothing to compare by inode — the canonical-path check in
 * `assertNoPathCollisions` is what protects a not-yet-created destination)
 * or when the platform/filesystem does not report usable identity (`ino`
 * missing/`0` — historically possible on some Windows filesystem drivers;
 * this repo does not claim hard-link detection coverage there, only on
 * platforms where `fs.statSync` actually returns a non-zero `ino`).
 */
function existingFileIdentity(path: string): string | null {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return null;
  }
  if (typeof stat.ino !== "number" || stat.ino === 0) return null;
  return `${stat.dev}:${stat.ino}`;
}

/**
 * Throws `PathCollisionError` if any two of the given labeled paths
 * canonicalize to the same real file, OR (for paths that already exist)
 * identify the same real file via filesystem identity (hard links). Call
 * this BEFORE any read/write — it exists specifically to prevent an
 * operator typo from making one CLI argument silently overwrite another
 * (e.g. `--out-manifest` pointed at the same file as `--file`, or a hard
 * link of it, destroying the raw XLSX).
 */
export function assertNoPathCollisions(labeledPaths: Readonly<Record<string, string>>): void {
  const seenByCanonicalPath = new Map<string, string>(); // canonical path -> label that claimed it first
  const seenByFileIdentity = new Map<string, string>(); // "dev:ino" -> label that claimed it first
  for (const [label, path] of Object.entries(labeledPaths)) {
    const canonical = canonicalizePathForCollisionCheck(path);
    const canonicalMatch = seenByCanonicalPath.get(canonical);
    if (canonicalMatch !== undefined) {
      throw new PathCollisionError(
        `Refusing to run: ${canonicalMatch}='${labeledPaths[canonicalMatch]}' and ${label}='${path}' resolve to the ` +
          `same real file. --file, --out-json, and --out-manifest must all be distinct — an operator mistake here ` +
          `could overwrite the raw XLSX, or make the candidate and manifest overwrite each other.`,
        canonicalMatch,
        label,
      );
    }
    seenByCanonicalPath.set(canonical, label);

    const identity = existingFileIdentity(path);
    if (identity !== null) {
      const identityMatch = seenByFileIdentity.get(identity);
      if (identityMatch !== undefined) {
        throw new PathCollisionError(
          `Refusing to run: ${identityMatch}='${labeledPaths[identityMatch]}' and ${label}='${path}' are hard links ` +
            `to the same real file (filesystem identity ${identity}), even though their paths differ. --file, ` +
            `--out-json, and --out-manifest must all be distinct files — an operator mistake here could overwrite ` +
            `the raw XLSX, or make the candidate and manifest overwrite each other.`,
          identityMatch,
          label,
        );
      }
      seenByFileIdentity.set(identity, label);
    }
  }
}

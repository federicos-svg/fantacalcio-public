import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Single source of truth (pure, dependency-free). Imported here (tsconfig allowJs)
// AND by scripts/graphify-bootstrap.mjs, which writes the rendered hook into
// the repo's .git/hooks/ directory.
import {
  PROTECTED_BRANCHES,
  PRE_PUSH_MARKER,
  renderPrePushHook,
  prePushInstallAction,
} from "../../../scripts/git-hooks-core.mjs";

// DOC-01 Fase 2 (issue #258). `main`/`production` have no branch protection
// (GitHub Free, private repo — and "no paid plan, ever" is a closed decision),
// so docs/NO_GO.md §merge is enforced by governance alone. This hook is the
// mechanical half that catches the realistic accident.
//
// The behavioural tests below run the ACTUAL generated script through `sh`
// with real pre-push stdin, rather than re-implementing its logic in JS: a
// shell guard that is only tested by a JS mirror is not tested at all.

// Scratch dir outside the repository (project rule: temporary working
// artifacts never land in the tree).
let dir: string;
let hook: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "prepush-"));
  hook = join(dir, "pre-push");
  writeFileSync(hook, renderPrePushHook(), "utf8");
  chmodSync(hook, 0o755);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Runs the hook with the given stdin; returns its exit code and stderr. */
function runHook(stdin: string): { code: number; stderr: string } {
  try {
    execFileSync("sh", [hook], { input: stdin, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { code: 0, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stderr?: string };
    return { code: err.status ?? -1, stderr: err.stderr ?? "" };
  }
}

const SHA_A = "1111111111111111111111111111111111111111";
const SHA_B = "2222222222222222222222222222222222222222";
const ZERO = "0000000000000000000000000000000000000000";

/** One pre-push stdin line: "<local ref> <local sha> <remote ref> <remote sha>". */
const line = (localRef: string, remoteRef: string, localSha = SHA_A, remoteSha = SHA_B) =>
  `${localRef} ${localSha} ${remoteRef} ${remoteSha}\n`;

describe("pre-push guard — real shell execution", () => {
  it("refuses a direct push to every protected branch", () => {
    for (const branch of PROTECTED_BRANCHES) {
      const res = runHook(line(`refs/heads/${branch}`, `refs/heads/${branch}`));
      expect(res.code).toBe(1);
      expect(res.stderr).toContain(`refs/heads/${branch}`);
    }
  });

  it("points at the normative source instead of explaining itself", () => {
    const res = runHook(line("refs/heads/main", "refs/heads/main"));
    expect(res.stderr).toContain("docs/NO_GO.md");
  });

  it("looks at the REMOTE ref: a worker branch pushed onto main is still blocked", () => {
    // `git push origin worker/x:main` — the local branch name is innocent.
    const res = runHook(line("refs/heads/worker/258-fase2-guardie", "refs/heads/main"));
    expect(res.code).toBe(1);
  });

  it("does not fire on the mirror case: main pushed onto a worker branch", () => {
    expect(runHook(line("refs/heads/main", "refs/heads/worker/x")).code).toBe(0);
  });

  it("blocks a deletion of a protected branch (local sha all-zero)", () => {
    expect(runHook(line("(delete)", "refs/heads/production", ZERO)).code).toBe(1);
  });

  it("allows ordinary work: feature branches, tags, empty stdin", () => {
    expect(runHook(line("refs/heads/worker/258", "refs/heads/worker/258")).code).toBe(0);
    expect(runHook(line("refs/tags/recipe-freeze-2026", "refs/tags/recipe-freeze-2026")).code).toBe(0);
    expect(runHook("").code).toBe(0);
  });

  it("does not false-positive on branches whose name merely starts with a protected one", () => {
    expect(runHook(line("refs/heads/mainline", "refs/heads/mainline")).code).toBe(0);
    expect(runHook(line("refs/heads/production-notes", "refs/heads/production-notes")).code).toBe(0);
    expect(runHook(line("refs/heads/feature/main", "refs/heads/feature/main")).code).toBe(0);
  });

  it("blocks a multi-ref push as soon as ONE ref targets a protected branch", () => {
    const stdin = line("refs/heads/worker/a", "refs/heads/worker/a") + line("refs/heads/x", "refs/heads/main");
    const res = runHook(stdin);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("refs/heads/main");
  });

  it("reports every offending ref of a multi-ref push, not just the first", () => {
    const stdin = line("refs/heads/a", "refs/heads/main") + line("refs/heads/b", "refs/heads/production");
    const res = runHook(stdin);
    expect(res.stderr).toContain("refs/heads/main");
    expect(res.stderr).toContain("refs/heads/production");
  });
});

describe("pre-push guard — rendered script", () => {
  /** Executable body only — comments carry provenance pointers, not behaviour. */
  const body = () =>
    renderPrePushHook()
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");

  it("is a self-contained POSIX sh script (no node, no repo path dependency)", () => {
    expect(renderPrePushHook().startsWith("#!/bin/sh\n")).toBe(true);
    // A guard that stops working because a file in the checkout moved, or
    // because node is not on PATH, is not a guard.
    expect(body()).not.toMatch(/\bnode\b/);
    expect(body()).not.toMatch(/scripts\//);
    expect(body()).not.toMatch(/\.mjs\b/);
  });

  it("offers no bypass switch of its own", () => {
    // Removing the file (or git's own --no-verify) stays the only way out —
    // both deliberate acts. An env-var escape hatch would turn the guard into
    // a suggestion, which is exactly what it must not be.
    expect(body()).not.toMatch(/SKIP|FORCE|BYPASS|ALLOW_/);
  });

  it("is deterministic (byte-identical across renders, so the installer is idempotent)", () => {
    expect(renderPrePushHook()).toBe(renderPrePushHook());
  });
});

describe("prePushInstallAction — never clobbers a hook we did not write", () => {
  it("installs when absent or empty", () => {
    expect(prePushInstallAction(null)).toBe("install");
    expect(prePushInstallAction("")).toBe("install");
  });
  it("is a no-op when already current", () => {
    expect(prePushInstallAction(renderPrePushHook())).toBe("unchanged");
  });
  it("upgrades in place an older version of our own hook", () => {
    expect(prePushInstallAction(`#!/bin/sh\n# ${PRE_PUSH_MARKER} v0\nexit 0\n`)).toBe("update");
  });
  it("leaves a foreign pre-push hook alone", () => {
    expect(prePushInstallAction("#!/bin/sh\n# husky\nnpx lint-staged\n")).toBe("skip-foreign");
  });
});
